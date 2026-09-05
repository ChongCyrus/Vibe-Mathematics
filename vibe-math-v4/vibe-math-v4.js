// Vibe Math V4 — persistent self-organizing collaborative research framework.
// FACILITATOR (message bus / meetings / per-resident artifact libraries /
// unanimous-consensus verification / context compaction proxy / resume / human
// intervention). It NEVER assigns tasks: residents message & meet and decide all
// task allocation among themselves. Consumes HOST subagents/agents/fs/tools/commands.
// NOTE: must declare `inject` for every service read as a ctx property (the Guard
// rejects undeclared dependencies), and must use the `timer` Service (ctx.timeout),
// not global setTimeout/clearTimeout, which do not exist in the plugin runtime.
export const inject = ['subagents', 'agents', 'fs', 'tools', 'commands', 'timer']
export function apply(ctx) {
  const subagents = ctx.subagents
  const agents = ctx.agents
  const fs = ctx.fs
  const tools = ctx.tools
  const commands = ctx.commands
  const subprocess = ctx.get('subprocess')
  const sandboxPolicy = ctx.get('sandboxPolicy')
  const compaction = ctx.get('compaction')   // @deepseek-ai/dsh-compaction (CompactionEngine); optional

  const sessions = new Map()      // rootAgentId -> Session
  const childOwner = new Map()    // childId -> rootAgentId
  const fileOwner = {}            // process-level write lock
  const processEpoch = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8)

  function sessionIdOf(agent){ try { return (agent&&agent.id)?String(agent.id):undefined } catch(e){ return undefined } }
  function rootOf(agent){ try { let cur=agent; const seen=new Set(); while(cur){ const id=cur.id; if(seen.has(id)) return cur; seen.add(id); const p=(cur.session&&cur.session.header)?cur.session.header.parentSession:undefined; if(p===undefined) return cur; const par=agents.get(p); if(!par) return cur; cur=par } } catch(e){} return agent }
  function getSession(agent){ const root=rootOf(agent); const sid=sessionIdOf(root); if(sid===undefined) return undefined; let s=sessions.get(sid); if(!s){ s=makeSession(root,sid); sessions.set(sid,s) } return s }

  function makeSession(rootAgent, sessionId) {
    let currentProject = 'default'
    const DEFAULT_PARAMS = {
      residentCount: 4, compactThreshold: 66, compactAfterRounds: 8,
      maxParallel: 3, activityTimeoutMs: 120000, verdictMaxRounds: 3,
      meetingKeepEvery: 5,   // 每积累 N 个新产物自动触发一次同步会议
      stallAutoMeetingMs: 360000,   // 团队空闲且无新产物的"停滞阈值"：超过则自动召集同步会议（分级保活 B）
      // model/provider inheritance: '' = the resident inherits the parent (main assistant)
      // route (provider + model). Set them to override the resident's LLM backend/model.
      provider: '', model: '', residentPersona: '',
      // tool permissions: an allow/deny list of tool names applied via startContinuable's
      // toolFilter (scoped tools.restrict() in the child). Empty = inherit all tools.
      // CAUTION: only set one of these; an empty allow:[] would deny EVERY tool.
      toolAllow: [], toolDeny: [],
    }
    let params = Object.assign({}, DEFAULT_PARAMS)
    let running = false, autoDone = false, phase = 'idle'
    let residents = new Map(), mailboxes = new Map(), taskboard = [], decisions = []
    let meetings = [], reports = [], activityLog = []
    let problemText = '', problemId = 'problem', runId = 'run-' + shortId()
    let meetingState = null, verifyState = null, pendingVerify = null
    let busy = new Set(), wakeKind = new Map(), currentResident = ''
    let lastActivityAt = now(), lastProgressAt = now(), artifactCount = 0, lastSyncMeetingAt = 0, persistedEpoch = '', heartbeatDisposer = null
    const activityLogCap = 200

    // ---- utils ----
    function now(){ return Date.now() }
    function uuid(){ const h='0123456789abcdef'; let s=''; for(let i=0;i<36;i++){ if(i===8||i===13||i===18||i===23) s+='-'; else s+=h[Math.floor(Math.random()*16)] } return s }
    function shortId(){ const h='0123456789abcdef'; let s=''; for(let i=0;i<8;i++) s+=h[Math.floor(Math.random()*16)]; return s }
    function clamp01(v){ const n=Number(v); if(!Number.isFinite(n)) return 0.5; return Math.max(0,Math.min(1,n)) }
    function fmtTime(ts){ try { return new Date(ts||now()).toISOString().replace('T',' ').slice(0,19) } catch(e){ return String(ts||'') } }
    function cl(x){ return clamp01(Number(x)) }
    // contextPct is a PERCENT (0-100); never clamp to 0-1 or the compactThreshold
    // comparison (e.g. 66) becomes `1.0 >= 66` and never fires.
    function clPct(x){ const n=Number(x); if(!Number.isFinite(n)) return 0; return Math.max(0,Math.min(100,n)) }
    function textBlock(t){ return { type:'text', text:String(t) } }
    function blocksToText(b){ if(!b) return ''; let out=''; for(const x of b){ if(x&&x.type==='text'&&typeof x.text==='string') out+=x.text+'\n' } return out.trim() }
    function logActivity(event,detail){ activityLog.push({at:now(),event,detail:String(detail||'')}); if(activityLog.length>activityLogCap) activityLog.shift() }
    function logDecision(kind,detail){ decisions.push({at:now(),kind,detail:String(detail||'')}) }
    // Record that the project made real progress (new artifact, meeting, verify, task, or a
    // resident speaking to the group). The stall auto-sync meeting (B) fires only when this has
    // NOT advanced for stallAutoMeetingMs, so a group that is genuinely producing keeps working
    // and only a truly stalled group gets a coordination meeting to reboot itself.
    function markProgress(){ lastProgressAt = now(); }
    // How long a meeting/verify may run without collecting a new input/verdict before we treat it as
    // deadlocked and abandon it. A meeting round's own signal window is activityTimeoutMs, so a
    // resident should speak within that; 2× that without ANY new input/verdict means the meeting/verify
    // is stuck and must not keep the whole group blocked.
    function recoverStallMs(){ return (Number(params.activityTimeoutMs)||120000) * 2 }
    function pickProvider(){ try { const n=subagents.list?subagents.list():[]; if(n.indexOf('spawn')!==-1) return 'spawn'; if(n.indexOf('fork')!==-1) return 'fork' } catch(e){} return 'spawn' }
    // Per-resident model/provider inheritance: when params.provider / params.model are set,
    // the resident uses that exact route; when left '' the resident inherits the parent's
    // (main assistant) route — the documented DSH default (resolveChildAgentOptions merges
    // requested over parent). No override is applied for empty values.
    function residentAgentOptions(){ const ao={}; if(params.provider) ao.provider=params.provider; if(params.model) ao.model=params.model; return ao }
    // Tool permission (scoped toolFilter). Only emit a filter when allow or deny has entries;
    // an empty object is rejected by DSH ("must declare allow and/or deny").
    function residentToolFilter(){
      const allow=Array.isArray(params.toolAllow)?params.toolAllow.filter(x=>String(x).trim()):[]
      const deny=Array.isArray(params.toolDeny)?params.toolDeny.filter(x=>String(x).trim()):[]
      if(allow.length===0 && deny.length===0) return undefined
      const f={}; if(allow.length) f.allow=allow; if(deny.length) f.deny=deny; return f
    }
    function makeSignal(ms){ return AbortSignal.timeout(ms||30000) }
    function workspaceRoot(){ try { if(rootAgent&&rootAgent.session&&rootAgent.session.header&&rootAgent.session.header.cwd) return rootAgent.session.header.cwd } catch(e){} if(sandboxPolicy&&sandboxPolicy.workspaceRoot) return sandboxPolicy.workspaceRoot; return '.' }
    function vibeRoot(){ return (workspaceRoot()+'/VibeMath').replace(/\\/g,'/') }
    function frameworkRoot(){ return vibeRoot()+'/Projects/'+currentProject }
    function slugify(s){ const t=String(s==null?'':s).trim().toLowerCase().replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/g,'-').replace(/^-+|-+$/g,''); return t||'project' }
    function getPolicy(){ try { if(sandboxPolicy&&rootAgent&&rootAgent.session) return sandboxPolicy.resolve({session:rootAgent.session}) } catch(e){} try { if(sandboxPolicy) return sandboxPolicy.resolve({}) } catch(e){} return undefined }
    function psQuote(p){ return "'"+String(p).replace(/'/g,"''")+"'" }
    async function runShell(script,cwd){ if(subprocess===undefined) return {ok:false,error:'no-subprocess'}; try { const h=subprocess.spawn({argv:['powershell','-NoProfile','-NonInteractive','-Command',script],cwd:cwd||workspaceRoot(),stdio:{stdin:'ignore',stdout:'inherit',stderr:'inherit'},graceMs:20000}); const o=await h.done; return {ok:o.exitCode===0,exitCode:o.exitCode} } catch(e){ return {ok:false,error:String((e&&e.message)||e)} } }
    async function fsTarget(rel){ return await fs.resolve(rel,{cwd:frameworkRoot()}) }
    async function readText(rel){ try { const t=await fsTarget(rel); if(await fs.stat(t)===undefined) return undefined; return await fs.readText(t) } catch(e){ return undefined } }
    async function writeText(rel,content){ try { const t=await fsTarget(rel); await fs.writeText(t,content,undefined,undefined,getPolicy()); return true } catch(e){ return false } }
    async function writeJson(rel,obj){ return await writeText(rel,JSON.stringify(obj,null,2)) }
    async function readJson(rel){ const t=await readText(rel); if(t===undefined||t==='') return undefined; try { return JSON.parse(t) } catch(e){ return undefined } }
    async function ensureDirs(){ const base=frameworkRoot(); const dirs=['Problems','Progress','Propos','Methods','Subproblems','Shared/meetings','Shared/debates','Verified/命题','Verified/问题','Reliable','Notes','State']; return await runShell('New-Item -Force -ItemType Directory -Path '+[vibeRoot()+'/Projects'].concat(dirs.map(d=>base+'/'+d)).map(psQuote).join(',')+' | Out-Null') }
    async function readTextAbs(path){ try { const t=await fs.resolve(path); const s=await fs.stat(t); if(s===undefined) return undefined; return await fs.readText(t) } catch(e){ return undefined } }
    async function writeTextAbs(path,content){ try { const t=await fs.resolve(path); await fs.writeText(t,content,undefined,undefined,getPolicy()); return true } catch(e){ return false } }
    async function readCurrentProject(){ try { const t=await readTextAbs(vibeRoot()+'/.current'); if(t) return String(t).trim() } catch(e){} return currentProject }
    async function writeCurrentProject(){ try { await writeTextAbs(vibeRoot()+'/.current', currentProject) } catch(e){} }
    function tryJson(s){ try { return JSON.parse(s) } catch(e){ return undefined } }
    function parseReply(text){
      let obj; const fence=/```(?:json)?[ \t]*([\s\S]*?)```/gi; let m
      while((m=fence.exec(text))!==null){ const o=tryJson(m[1].trim()); if(o&&typeof o==='object'&&!Array.isArray(o)) obj=o }
      if(!obj){ const w=tryJson(text.trim()); if(w&&typeof w==='object'&&!Array.isArray(w)) obj=w }
      return obj||{}
    }

    // ---- persistence ----
    async function saveAll(){
      await writeJson('State/residents.json', Object.fromEntries(residents))
      await writeJson('State/mailboxes.json', Object.fromEntries(mailboxes))
      await writeJson('State/taskboard.json', taskboard)
      await writeJson('State/decisions.json', decisions)
      await writeJson('State/session.json', {running,autoDone,phase,problemId,problemText,runId,meetings,reports,lastActivityAt,lastProgressAt,activityLog,processEpoch,artifactCount})
    }
    async function loadAll(){
      const s=await readJson('State/session.json'); if(s){ running=!!s.running; autoDone=!!s.autoDone; phase=s.phase||'idle'; problemId=s.problemId||problemId; problemText=s.problemText||problemText; runId=s.runId||runId; meetings=s.meetings||[]; reports=s.reports||[]; lastActivityAt=s.lastActivityAt||now(); lastProgressAt=s.lastProgressAt||now(); activityLog=s.activityLog||activityLog; persistedEpoch=s.processEpoch||''; artifactCount=s.artifactCount||0 }
      const rm=await readJson('State/residents.json'); if(rm&&typeof rm==='object') residents=new Map(Object.entries(rm))
      const mb=await readJson('State/mailboxes.json'); if(mb&&typeof mb==='object') mailboxes=new Map(Object.entries(mb))
      const tb=await readJson('State/taskboard.json'); if(Array.isArray(tb)) taskboard=tb
      const dc=await readJson('State/decisions.json'); if(Array.isArray(dc)) decisions=dc
    }

    // ---- resident prompts ----
    function banner(){ const o=[]; for(const [id,r] of residents) o.push('- '+id+'「'+(r.direction||'（未定）')+'」'+r.status+'·轮'+r.rounds); return o.join('\n') }
    async function inboxText(rId){ const mb=mailboxes.get(rId)||[]; if(mb.length===0) return '  (no new messages)\n'; return mb.map(m=>'  ['+m.from+'] '+m.content).join('\n')+'\n' }
    function residentLibraries(){
      const base=frameworkRoot()
      return '你的资料库根目录：'+base+'/\n'
        +'  Progress/<你>/progress.md —— 你的研究日志（叙述，可追加。主要内容是尝试过的各方法、路线、历程、进度，当前研究进展/进度、将来的计划与打算，及各路线、过程中遇到的障碍及其原因，对各路线、方法的看法、可行性评估，自己研究过程中的一些有价值看法、感想、猜想、理解。以及其它各种你认为有价值的值得记录的事物、经验、方法/想法、创新等都可进行记录）。\n'
        +'  Propos/<你>/<id>.md —— 你的命题/引理。格式：\n'
        +'    - ID: p-<id>; - 状态: 未定论; - 概率: <0-1>; - 价值程度: <0-1>; - 动机用途计划: <为何重要/打算怎么用>\n'
        +'    然后 ## 陈述 <陈述>；## 证明尝试；## 证伪尝试。\n'
        +'  Methods/<你>/<id>.md —— 你的理论/方法/工具。格式：- ID: m-<id>; - 状态: 经验; - 可信断言: []; - 价值程度: <0-1>; - 动机用途计划: ...；然后 ## 核心内容；## 定义与记号；## 应用记录；## 改进历史。\n'
        +'  Subproblems/<你>/<id>.md —— 你的子问题。格式：- ID: s-<id>; - 状态: 求解中; - 价值程度: <0-1>; - 动机用途计划: ...；然后 ## 陈述；## 进度。\n'
    }
    function toolList(){
      return 'vibe_v4_send_message {to, content} —— 给某常驻发消息（to=all 广播）。\n'
        +'vibe_v4_meeting {agenda} —— 发起/参与会议（框架会把各常驻的实际 input 转给其他人，让大家看到并讨论/辩论）。\n'
        +'vibe_v4_propose_task/claim_task/task_done/list_tasks —— 共享任务板（提议/认领/完成/查看；任务板是你们协调分工的载体）。\n'
        +'vibe_v4_publish_progress/record_proposition/record_method/record_subproblem —— 便捷记录器（可选；推荐直接用 fs 写自己的文件）。\n'
        +'vibe_v4_read_progress {id} —— 只读某常驻的进展。\n'
        +'vibe_v4_list_residents / vibe_v4_list_tasks —— 查看团队组成 / 开放任务。\n'
        +'vibe_v4_report_context {pct} —— 上报上下文占比（框架据此压缩你的上下文）。\n'
        +'fs (read/write/list) —— 读取任意文件；写入你自己的文件（推荐直接用 fs 直接写自己的 md）。\n'
    }
    // A shared, complete context block so a resident always knows the situation: mission,
    // work model, what it can do, which files it owns (+ formats), what others' files are,
    // and that it may READ anyone and WRITE its own directly. level 'full' = initial brief.
    function contextBrief(r, level){
      const s=[]
      s.push('## 背景 —— 你是常驻研究团队的一员')
      s.push('You are resident researcher '+r.rId+'（常驻研究者 '+r.rId+'；共 '+params.residentCount+' 位常驻），正在协作解决：')
      s.push(problemText)
      s.push('')
      s.push('这像一个**真实的学术小组**：没有中央调度器、没有外部派活——你们自己通过 **互相发消息 + 开会讨论** 来决定一切：谁做什么、怎么分工、验证什么、何时停止。你的 Round 决定你这一轮做什么；团队的优先级与分工由大家的讨论涌现。')
      s.push('')
      s.push('### 工作模式（会发生什么）')
      s.push('1. 每人有一份持久、全组可见的专属资料库（见下）。')
      s.push('2. 你们自由发消息、开会；**会议会把每个人实际说的话（input）转给其他人**，让你看得到、能回复、能讨论、能辩论。')
      s.push('3. 你独立研究，并**直接用 fs 写入你自己的文件**（按格式），供全组阅读。')
      s.push('4. 任何"已确立"的东西须**全组一致**验证（全真或全假）才作数；否则只是带概率的工作估计。')
      s.push('5. 只有**全组在会议上一致认为原问题已解决**，run 才停止。')
      s.push('')
      s.push('### 你负责的文件（你只写自己的；但可读任何人的）')
      s.push(residentLibraries())
      s.push('其他人把结论/进展写进他们的目录，你就能读到。**你应主动读别人的库**，对齐事实、彼此衔接、避免重复劳动。')
      if(level!=='full'){ s.push('（格式见你最初的说明；直接用 fs 写自己的文件即可。）') }
      s.push('')
      s.push('### 可用工具')
      s.push(toolList())
      s.push('')
      if(level==='full'){
        s.push('### 可自主发明理论/工具（鼓励，但不强迫）')
        s.push('请注意：你可以（但**不强迫**，完全视实际需要而定）尝试自主构建新的理论框架或工具——例如对某种系统做抽象化、一般化，抽离/推广出更一般的结构或理论框架；然后不断完善这个理论框架，在该框架下推得各种定理、性质、结论，以利于该框架下问题的解决。这就像为解决方程问题发明了群论、为分析需要建立了泛函分析框架——它比单纯解决当前问题更有学术价值，因为你直接得到了一类更普遍的方法/理论体系。')
        s.push('若你发明了这样的理论/工具，请**阐明它对原问题的用处、价值**；后续可根据需要不断**完善、一般化、推广**它。把这类成果记入你的 Methods/<你>/ 库。')
        s.push('')
      }
      s.push('### 规则')
      s.push('- 只有 Verified/（或卡片标"已验证·真/假"）算已确立；其余都是你的实验性工作，请区分"猜想/已知"。')
      s.push('- 验证必须**全组一致**（全真或全假）；你只信全票结果。未全票的对象留在库里带概率。')
      s.push('- 你自己决定做什么，但**优先级/分工由团队讨论决定**，不是固定模式。若你认为问题已解决或接近解决，请**发起会议**让团队表决。')
      s.push('- 退出时**只**输出一个 JSON 对象（放在 ```json 代码围栏内；围栏外不要有文字）。')
      return s.join('\n')
    }
    // A SHORT core-rules recap, re-injected ONLY right after a compaction so the resident
    // never loses the ground rules (they are told fully once at brainstorm, but a /compact
    // could blank them).
    function coreRulesBrief(){
      const base=frameworkRoot()
      return '[核心规则重申] 只有 Verified/（及标记"已验证·真/假"）算已确立；验证须全组一致（全真或全假）才作数，否则留库附平均概率；你只写自己的库（'+base+'/ 的 Progress/<你>/、Propos/<你>/、Methods/<你>/、Subproblems/<你>/），可只读任何人的库；任务分工由团队讨论决定；退出只输出一个 JSON 对象。'
    }
    function brainstormPrompt(r){
      return (params.residentPersona?params.residentPersona+'\n':'')
        +contextBrief(r,'full')+'\n'
        +(r.direction?('\n\n你被建议的初始方向（可自行调整/细化）：\n'+r.direction+'\n'):'')
        +'## 这是你的第一轮：独立头脑风暴\n'
        +'独立地想清楚：你对这个问题的洞察 / 解决方向 / 关键子问题 / 可能的引理 / 粗略计划。你还未见到其他人，先独立产出。\n'
        +'把有价值的产物**直接用 fs 写进你自己的文件**（按上面格式），并在 summary 里概述你的切入方向与初步结论（标注哪些是猜想、哪些凭你已确证）。\n'
        +'Reply with ONLY a JSON object:\n'
        +'{"summary":"<your insight / direction / rough plan, one tight paragraph>","solved":false}'
    }
    async function normalPrompt(r){
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'Resident researcher '+r.rId+' — 第 '+r.rounds+' 轮。一切由你和团队讨论决定。动手前先**读别人的库**对齐事实、避免重复；把新进展/结论**直接用 fs 写进你自己的文件**；想对团队说的话放 "input"（会转给其他常驻）。\n'
        +'\n团队成员：\n'+banner()+'\n'
        +'New items:\n'+ (await inboxText(r.rId)) +'\n'
        +'Reply with ONLY a JSON object:\n'
        +'{"summary":"<what you did / decided this round, 1-3 sentences>","input":"<optional: a message to the whole team, or \\"\\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","claim_task":"<task id|null>","task_done":"<task id|null>","contextPct":40}'
    }
    function meetingPrompt(r, st){
      const prior=Object.entries(st.inputs).filter(([k])=>k!==r.rId).map(([k,iv])=>'  ['+k+'] '+String(iv.input||iv.summary||'')).join('\n')
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'Resident '+r.rId+' — 团队会议进行中。 A meeting is in progress (agenda: '+st.agenda+').'
        +(st.type==='verify'?('\n团队正在验证对象：'+st.targetId+'（'+st.targetType+'，提出者 '+st.targetOwner+'）。请先看他人意见，再给独立判断。'):'')
        +'\n这是一场真实讨论：下面已有人发言（转给你），请先看，然后**加入讨论/补充/反驳/表决**。'
        +(prior?('\n\n### 已有发言（他人 input，已转发给你）\n'+prior):'\n（目前还没人发言，你先说。）')
        +'\n\n你可以：提议任务（propose_task）、认领开放任务（claim_task）、提议验证对象（propose_verify）、或对"原问题是否已解决"表决（voteSolved）。请把**你的实际发言**写进 "input"。'
        +'\nReply with ONLY a JSON object:\n'
        +'{"input":"<your real contribution to this discussion>","propose_task":"<task title or null>","task_desc":"...","claim_task":"<task id or null>","propose_verify":"<id or null>","voteSolved":true}'
    }
    function verifyPrompt(r, vs){
      const others=Object.entries(vs.verdicts).map(([k,v])=>'- '+k+': 正确概率 '+String(v.prob!=null?Number(v.prob).toFixed(2):0.5)+' → '+v.reason).join('\n')
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'Resident '+r.rId+' — 团队验证。 The group is verifying object '+vs.targetId+'（'+vs.targetType+'，提出者 '+vs.targetOwner+'）。\n'
        +'请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。\n'
        +'判定规则：仅当**全体常驻一致给 1（都认为是真）或一致给 0（都认为是假）**，才按「真/假」写入 Verified/；否则**只作为概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。\n'
        +'请给出你**诚实独立的判断**'
        +(vs.stage==='debate'?'，并参考他人意见：\n':'。\n')
        +(vs.stage==='debate'&&others?('### 他人意见（已转发给你）\n'+others+'\n'):'')
        +'\nReply with ONLY a JSON object:\n'
        +'{"vote":{"verdict":0.9,"reason":"<your logic>"}}'
    }

    // ---- resident lifecycle ----
    let residentSeq = 0
    function newResident(dir){ const rId='r-'+(++residentSeq); return {rId,childId:'',direction:dir||'',status:'brainstorm',rounds:0,roundsSinceCompact:0,lastActiveAt:now(),insight:'',contextPct:0,contextSeed:'',needCompact:false} }
    async function spawnResident(r){
      const ao=residentAgentOptions(); const tf=residentToolFilter()
      const started=await subagents.startContinuable({provider:pickProvider(),label:r.rId,request:{prompt:[textBlock(brainstormPrompt(r))],parent:rootAgent,agentOptions:ao,...(tf?{toolFilter:tf}:{})},signal:makeSignal(params.activityTimeoutMs||60000)})
      r.childId=started.childId; r.status='brainstorm'; r.lastActiveAt=now()
      childOwner.set(started.childId,sessionId); busy.add(r.rId); wakeKind.set(r.rId,'normal'); currentResident=r.rId
      residents.set(r.rId,r); await saveAll(); logActivity('spawn',r.rId+' ('+(r.direction||'brainstorm')+')')
    }
    async function wakeResident(r, promptText, kind){
      if(!r.childId) return false
      clearHeartbeat()
      busy.add(r.rId); wakeKind.set(r.rId,kind||'normal'); currentResident=r.rId
      r.lastActiveAt=now(); r.rounds+=1; r.roundsSinceCompact+=1
      // Context compaction has TWO distinct needs. Confusing them is the bug that made
      // '[核心规则重申]+[CONTEXT COMPACT]' repeat at the start of nearly every prompt:
      //   (a) r.needCompact (set by a REAL /compact) => the resident's rules may be blurred, so
      //       re-anchor the short core rules on the next wake of ANY kind, then CLEAR the flag.
      //       (Short recap only; no self-summary directive — the real compact already condensed.)
      //   (b) soft-compact trigger (contextPct>=threshold OR roundsSinceCompact>=afterRounds) =>
      //       the resident's context genuinely grew; ask it to self-summary. ONLY on a normal
      //       research round (kind==='normal'): a meeting/verify reply has no contextPct/compacted
      //       fields, so a directive injected there is never acknowledged and would repeat forever.
      let prompt = promptText
      const isNormal = (kind||'normal')==='normal'
      const wantSoft = isNormal && (Number(r.contextPct)>=Number(params.compactThreshold) || Number(r.roundsSinceCompact)>=Number(params.compactAfterRounds))
      const wantReanchor = r.needCompact
      if(wantSoft){
        prompt = coreRulesBrief() + '\n' +
          '[CONTEXT COMPACT — your conversation is at/near the limit. Do NOT re-derive history.\n' +
          'Condense your current working state into ONE tight self-summary (findings so far, active direction, key artifacts you recorded, next concrete steps, open questions), then answer this round in the normal JSON format as usual.\n' +
          'Set "contextPct": 15 (your post-compact usage) and "compacted": true in the reply so the framework records the condensed seed.]\n\n' + promptText
        r.needCompact = true
      } else if(wantReanchor){
        prompt = coreRulesBrief() + '\n' + prompt
        r.needCompact = false
      }
      // The DSH continuable-wake API is subagents.sendMessage(sender, targetId, content, {signal}),
      // NOT subagents.followup (which is only Agent.followup, and does NOT exist on the subagents
      // service). Using a non-existent method threw TypeError and made EVERY wake fail silently →
      // the group went idle forever. Prefer sendMessage; fall back to a legacy followup if a host
      // still exposes it (older deployments), so this works across versions.
      try {
        if(typeof subagents.sendMessage==='function'){
          await subagents.sendMessage(rootAgent, r.childId, [textBlock(prompt)], {signal: makeSignal(params.activityTimeoutMs||60000)})
        } else if(typeof subagents.followup==='function'){
          await subagents.followup(rootAgent, r.childId, [textBlock(prompt)], {source:{kind:'user'},signal:makeSignal(params.activityTimeoutMs||60000)})
        } else {
          throw new Error('no subagent continuation API (need sendMessage or followup)')
        }
        return true
      }
      catch(e){ console.error('vibe-v4 wake '+r.rId+' failed: '+String((e&&e.message)||e)); busy.delete(r.rId); return false }
    }
    function byChild(childId){ for(const [,r] of residents){ if(r.childId===childId) return r } return undefined }

    // ---- artifact writers (resident-facing) ----
    async function publishProgress(rId,content){ const rel='Progress/'+rId+'/progress.md'; const prev=(await readText(rel))||''; await writeText(rel, prev+'\n### '+fmtTime()+'｜'+rId+'\n'+String(content||'')+'\n'); return {ok:true} }
    async function recordProposition(rId,o){ const id=o.id||('p-'+shortId()); const lines=['# 命题｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 类型: 命题','- 状态: 未定论','- 概率: '+cl(o.prob!=null?o.prob:0.5),'- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'- 依赖: []','','## 陈述',String(o.statement||''),'','## 证明尝试','','## 证伪尝试','']; await writeText('Propos/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 命题 '+id); bumpArtifacts(); return {ok:true,id,file:'Propos/'+rId+'/'+id+'.md'} }
    async function recordMethod(rId,o){ const id=o.id||('m-'+shortId()); const lines=['# 方法｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 类型: '+(o.type||'方法'),'- 状态: 经验','- 可信断言: []','- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'','## 核心内容',String(o.content||''),'','## 定义与记号',String(o.notation||''),'','## 应用记录','## 改进历史','']; await writeText('Methods/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 方法 '+id); bumpArtifacts(); return {ok:true,id,file:'Methods/'+rId+'/'+id+'.md'} }
    async function recordSubproblem(rId,o){ const id=o.id||('s-'+shortId()); const lines=['# 子问题｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 状态: 求解中','- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'- 依赖: []','','## 陈述',String(o.statement||''),'','## 进度','']; await writeText('Subproblems/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 子问题 '+id); bumpArtifacts(); return {ok:true,id,file:'Subproblems/'+rId+'/'+id+'.md'} }
    // auto-sync meeting: every meetingKeepEvery new artifacts, convene a general coordination meeting
    function bumpArtifacts(){ artifactCount+=1; markProgress(); if(!meetingState && !verifyState && Number(params.meetingKeepEvery)>0 && artifactCount % Number(params.meetingKeepEvery)===0){ startMeeting('定期同步：分工/进展/是否需要验证','general',null).catch(()=>{}) } }
    function listResidents(){ return Array.from(residents.values()).map(r=>({id:r.rId,direction:r.direction,status:r.status,rounds:r.rounds,contextPct:r.contextPct,insight:r.insight?r.insight.slice(0,80):''})) }
    // identify WHICH resident is calling a resident-facing tool: match the caller's
    // subagent id to a resident's childId. Fall back to the last-woken resident when
    // the caller is the host/assistant (or an unknown agent). This makes per-resident
    // libraries correct under concurrency (e.g. all brainstorm residents in flight).
    function residentOfAgent(agent){ try { const id=agent&&agent.id?String(agent.id):''; if(!id) return ''; for(const [,r] of residents){ if(r.childId===id) return r.rId } } catch(e){} return '' }

    // ---- task board (residents propose / claim / complete; framework wakes the claimer) ----
    async function writeTaskboard(){ const lines=['# 任务板','']; for(const t of taskboard){ lines.push('- ['+t.status+'] '+t.title+(t.claimer?('（认领:'+t.claimer+'）'):'')+(t.proposer?('（提议:'+t.proposer+'）'):'')+(t.description?('：'+t.description):'')) } await writeText('Shared/taskboard.md',lines.join('\n')) }
    async function proposeTask(title,description,proposer){ const id='t-'+shortId(); taskboard.push({id,title:String(title),description:String(description||''),status:'open',proposer:proposer||'',claimer:'',source:''}); await saveTaskboard(); markProgress(); logActivity('task','proposed '+id+'「'+title+'」'); return {ok:true,id} }
    async function claimTask(id,claimer){ const t=taskboard.find(x=>x.id===id); if(!t) return {ok:false,message:'no such task'}; if(t.status!=='open') return {ok:false,message:'task already '+t.status}; t.status='claimed'; t.claimer=claimer; await saveTaskboard(); markProgress(); logActivity('task',claimer+' claimed '+id); 
      // wake the claimer to work on it (framework moves the task, resident decides how)
      const r=residents.get(claimer); if(r && !busy.has(claimer)){ currentResident=claimer; await wakeResident(r, (await normalPrompt(r))+'\n\n[YOU CLAIMED TASK '+id+'] '+t.title+' — '+t.description,'normal'); await saveAll() }
      return {ok:true} }
    async function taskDone(id,claimer){ const t=taskboard.find(x=>x.id===id); if(!t) return {ok:false}; t.status='done'; t.doneBy=claimer; await saveTaskboard(); await writeTaskboard(); markProgress(); logActivity('task','done '+id); return {ok:true} }
    async function saveTaskboard(){ await writeJson('State/taskboard.json',taskboard); await writeTaskboard() }
    function listTasks(){ return taskboard.filter(t=>t.status!=='done') }
    async function reportContext(rId,pct){ const r=residents.get(rId); if(r){ r.contextPct=clPct(pct); if(Number(pct)<30) r.needCompact=false; } return {ok:true} }
    // Apply context/compact bookkeeping from a resident's reply, so the flag can clear even when
    // the reply came through a meeting/verify branch (defensive) as well as the normal branch.
    function postmark(r, parsed){
      if(typeof parsed.contextPct==='number') r.contextPct=clPct(parsed.contextPct)
      if(parsed.compacted===true || (r.needCompact && parsed.summary)){
        r.contextSeed=String(parsed.summary||r.contextSeed||'')
        r.contextPct=Math.min(r.contextPct||15,25)
        r.roundsSinceCompact=0
        r.needCompact=false
        logActivity('compact', r.rId+' consolidated context')
      }
    }

    // ---- messaging ----
    async function postMessage(from,to,content){
      const r=residents.get(to); if(!r) return {ok:false,message:'no such resident'}
      if(!busy.has(to)){
        currentResident=r.rId
        await wakeResident(r, (await normalPrompt(r))+'\n\n[NEW MESSAGE from '+from+']\n'+content,'normal')
        await saveAll(); markProgress(); logActivity('message',from+'→'+to); return {ok:true}
      }
      const mb=mailboxes.get(to)||[]; mb.push({from,at:now(),content}); mailboxes.set(to,mb); await saveAll(); logActivity('message',from+'→'+to+' (queued)'); return {ok:true}
    }
    async function broadcast(content){
      let n=0
      for(const [,r] of residents){ const res=await postMessage('facilitator',r.rId,content); if(res&&res.ok) n++ }
      logActivity('broadcast','to '+n+' resident(s)'); await saveAll(); return {ok:true,message:'broadcast to '+n+' resident(s)'}
    }
    // group conversation relay: when a resident "speaks" (input in its round), forward its
    // words to every other resident's inbox so the whole group can see & react — a real group chat.
    async function relayToGroup(from, content){
      const text=String(content||'').trim()
      if(!text) return
      for(const [,r] of residents){
        if(r.rId===from) continue
        const mb=mailboxes.get(r.rId)||[]; mb.push({from,at:now(),content:'[群聊] '+text}); mailboxes.set(r.rId,mb)
      }
      logActivity('relay',from+' → 团队: '+text.slice(0,60)); markProgress(); await saveAll()
    }

    // ---- meeting ----
    async function startMeeting(agenda,type,targetId){
      if(meetingState) return {ok:false,message:'meeting already in progress'}
      clearHeartbeat()
      const ids=Array.from(residents.keys())
      // Rotate the per-meeting speaking order so the SAME resident isn't always the "first speaker
      // who sees no one else's contribution"; a real discussion lets each member lead sometimes.
      const rot=Math.floor(Math.random()*Math.max(1,ids.length))
      const order=ids.slice(rot).concat(ids.slice(0,rot))
      meetingState={id:'mt-'+shortId(),agenda,type:type||'general',targetId:targetId||null,round:0,asked:[],inputs:{},transcript:[],order,at:now(),lastInputAt:now()}
      markProgress();
      logActivity('meeting','start: '+agenda); await saveAll(); await scheduleNext(); return {ok:true,id:meetingState.id}
    }
    async function continueMeetingRound(){
      if(!meetingState) return
      const st=meetingState
      // STUCK watchdog: a meeting that has been active but collected NO new input for a long while
      // is deadlocked (e.g. an in-flight/hung resident, a run of failed wakes). Abandoning it returns
      // the group to normal self-organization (A heartbeat / B auto-sync can then re-drive) instead of
      // permanently blocking the whole group behind a broken meeting.
      if(now()-(st.lastInputAt||st.at||now())>=recoverStallMs()){
        meetingState=null; wakeKind.clear(); logActivity('meeting','abandoned (stuck: no resident spoke)')
        await saveAll(); await scheduleNext(); return
      }
      const ids=Array.from(residents.keys()); const allSpoke=ids.every(id=>st.inputs[id]!==undefined)
      if(allSpoke){ await finalizeMeeting(); return }
      // only wake IDLE un-spoken residents (rotated order); in-flight ones re-trigger this on end.
      const order=st.order||ids
      const id=order.find(x=>st.inputs[x]===undefined && !busy.has(x))
      if(!id){ armHeartbeat(); return }   // no idle un-spoken resident (a busy/hung one): re-check later
      const r=residents.get(id)
      const ok = await wakeResident(r, meetingPrompt(r,st), 'meeting'); await saveAll()
      if(!ok) armHeartbeat()   // a failed meeting wake must NOT silently hang the meeting
    }
    async function finalizeMeeting(){
      const st=meetingState
      const ids=Array.from(residents.keys()); const allSpoke=ids.length>0 && ids.every(id=>st.inputs[id]!==undefined)
      const lines=['# 会议 '+st.id+'｜'+fmtTime(),'','**议程**：'+st.agenda,'']
      for(const [id,iv] of Object.entries(st.inputs)){ lines.push('### '+id); lines.push(iv.input||''); lines.push('') }
      await writeText('Shared/meetings/'+st.id+'.md', lines.join('\n'))
      meetings.push({id:st.id,agenda:st.agenda,at:now(),inputs:st.inputs})
      logDecision('meeting',st.agenda)
      // handle what the meeting produced: task proposals/claims, verify targets, stop vote
      for(const [id,iv] of Object.entries(st.inputs)){
        if(iv.propose_task) await proposeTask(iv.propose_task, iv.task_desc||'', id)
        if(iv.claim_task) await claimTask(iv.claim_task, id)
        if(iv.propose_verify) pendingVerify={targetId:iv.propose_verify,targetType:guessTargetType(iv.propose_verify),proposer:id,at:now()}
      }
      const votes=Object.values(st.inputs).map(x=>x.voteSolved).filter(v=>typeof v==='boolean')
      const allSolved = allSpoke && votes.length>0 && votes.every(v=>v===true)
      logActivity('meeting', 'concluded'+(allSolved?' → ALL agree solved':' (no unanimous solved vote)'))
      if(allSolved){ running=false; autoDone=true; phase='done'; logActivity('stop','all residents agree: problem solved'); await saveAll(); return }
      meetingState=null; wakeKind.clear(); await saveAll(); await scheduleNext()
    }

    // ---- verification (unanimous) ----
    async function beginVerify(pv){
      clearHeartbeat()
      pendingVerify=null
      verifyState={targetId:pv.targetId,targetType:pv.targetType,targetOwner:pv.proposer||'',stage:'independent',round:0,asked:[],verdicts:{},transcript:[],at:now(),lastVerdictAt:now()}
      markProgress();
      logActivity('verify','debate begin: '+pv.targetId+' ('+pv.targetType+')'); await saveAll(); await scheduleNext()
    }
    async function continueVerifyRound(){
      if(!verifyState) return
      const vs=verifyState
      // STUCK watchdog: a verification that has been active but collected no new verdict for a long
      // while is deadlocked (e.g. an in-flight/hung resident). Abandoning it keeps the object as an
      // unverified probability (no unanimous consensus was reachable) and returns the group to normal
      // scheduling instead of blocking the whole team behind a broken verification.
      if(now()-(vs.lastVerdictAt||vs.at||now())>=recoverStallMs()){
        verifyState=null; wakeKind.clear(); logActivity('verify',vs.targetId+' abandoned (stuck: no unanimous verdict reachable)')
        await saveAll(); await scheduleNext(); return
      }
      const ids=Array.from(residents.keys()); const allVoted=ids.every(id=>vs.verdicts[id]!==undefined)
      if(allVoted){ await finalizeVerify(); return }
      const id=ids.find(x=>vs.verdicts[x]===undefined && !busy.has(x))
      if(!id){ armHeartbeat(); return }   // no idle un-voted resident (a busy/hung one): re-check later
      const r=residents.get(id)
      const ok = await wakeResident(r, verifyPrompt(r,vs), vs.stage==='independent'?'verif-ind':'verif-deb'); await saveAll()
      if(!ok) armHeartbeat()   // a failed verify wake must NOT silently hang the verification
    }
    async function finalizeVerify(){
      const vs=verifyState; const expected=Array.from(residents.keys()).length
      const allVoted = expected>0 && Object.keys(vs.verdicts).length>=expected
      const vals=Object.values(vs.verdicts)
      // verdict is a PURE 0-1 probability; only ALL=1 (true) or ALL=0 (false) is a binary verdict.
      const allTrue = allVoted && vals.every(x=>Number(x.prob)===1)
      const allFalse = allVoted && vals.every(x=>Number(x.prob)===0)
      if(allTrue||allFalse){ await closeVerify(vs,allTrue); return }
      if(vs.round+1<params.verdictMaxRounds){ vs.stage='debate'; vs.round+=1; vs.asked=[]; logActivity('verify',vs.targetId+' round '+vs.round+' → debate'); await saveAll(); await scheduleNext(); return }
      const avg=vals.length? vals.reduce((a,x)=>a+(x.prob!=null?x.prob:0.5),0)/vals.length : 0.5
      await writeDebateDoc(vs,false,avg); await rewriteSourceProb(vs.targetId, avg, vs.targetOwner); logActivity('verify',vs.targetId+' NOT unanimous → kept unverified (avg '+avg.toFixed(2)+')')
      verifyState=null; wakeKind.clear(); await saveAll(); await scheduleNext()
    }
    async function closeVerify(vs,isTrue){
      await writeDebateDoc(vs,true,isTrue?1:0)
      const target=vs.targetId
      await writeVerifiedCard(vs,isTrue)
      await rewriteSource(target,isTrue,vs.targetOwner)
      logActivity('verify',target+' → Verified ('+(isTrue?'真':'假')+') by unanimous consensus')
      verifyState=null; wakeKind.clear(); await saveAll(); await scheduleNext()
    }
    async function writeDebateDoc(vs,done,val){
      const lines=['# 验证辩论｜'+vs.targetId+'('+vs.targetType+')｜'+fmtTime(),'',(done?('**结论**：'+(val===1?'全体一致为真':'全体一致为假')):('**未达成全体一致**，平均概率 '+val.toFixed(2))),'','## 各常驻意见']
      for(const [k,v] of Object.entries(vs.verdicts)){ lines.push('### '+k+'｜正确概率 '+(v.prob!=null?Number(v.prob).toFixed(2):'0.50')); lines.push(v.reason||''); lines.push('') }
      await writeText('Shared/debates/'+vs.targetId+'.md', lines.join('\n'))
    }
    async function writeVerifiedCard(vs,isTrue){
      const isSub=vs.targetType==='subproblem'
      const dir= isSub?'问题':'命题'
      const type= isSub?'问题': vs.targetType==='method'?'方法':'命题'
      const text='# 已验证｜'+vs.targetId+'\n- ID: '+vs.targetId+'\n- 类型: '+type+'\n- 结论: '+(isTrue?'真':'假')+'\n- 概率: '+(isTrue?1:0)+'\n- 来源: 全体常驻一致\n## 陈述\n参见来源卡。\n'
      await writeText('Verified/'+dir+'/'+vs.targetId+'.md', text)
    }
    async function findSourceRel(target, owner){
      // Prefer the OWNER's library (avoids id collisions across residents), then others.
      const order = owner ? [owner, ...Array.from(residents.keys()).filter(k=>k!==owner)] : Array.from(residents.keys())
      for(const rid of order){
        for(const base of ['Propos','Methods','Subproblems']){
          const cand=base+'/'+rid+'/'+target+'.md'; if((await readText(cand))!==undefined){ return cand }
        }
      }
      return 'Propos/'+target+'.md'
    }
    // non-unanimous verification: keep the object in its library but write back the
    // average probability (design §8: "留库附概率"), so the card reflects the consensus estimate.
    async function rewriteSourceProb(target,prob,owner){
      const rel=await findSourceRel(target,owner)
      let text=(await readText(rel))||''
      text=text.replace(/(^|\n)- 概率:.*/m,'$1- 概率: '+Number(prob).toFixed(2))
      await writeText(rel,text)
    }
    async function rewriteSource(target,isTrue,owner){
      // find & update the source card status/prob; best effort across per-resident libs
      const rel=await findSourceRel(target,owner)
      let text=(await readText(rel))||''
      text=text.replace(/(^|\n)- 状态:.*/m,'$1'+(isTrue?'- 状态: 已验证·真':'- 状态: 已验证·假'))
             .replace(/(^|\n)- 概率:.*/m,'$1'+(isTrue?'- 概率: 1':'- 概率: 0'))
      await writeText(rel,text)
    }
    function guessTargetType(id){ if(/^p-/.test(id)) return 'proposition'; if(/^m-/.test(id)) return 'method'; if(/^s-/.test(id)) return 'subproblem'; return 'proposition' }

    // ---- heartbeat / liveness helpers (boundary-A: event-driven + gated heartbeat) ----
    // A checkpoint wake is NOT "keep working forever": it nudges the least-recently-active
    // resident, after an idle timeout, to CONTINUE the work itself (self-drive), and only to
    // propose a meeting/verify/solved when it truly has nothing left. This keeps the group moving
    // on its own (framework never assigns work) but adds convergence pressure instead of letting
    // a stalled group sit idle forever.
    function heartbeatPrompt(r){
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'Resident researcher '+r.rId+' — CHECKPOINT（团队空闲，请由你们继续自主推进）。当前项目尚未解决（除非你已确认）。团队在等待有人继续：请**继续解决这个问题**——读他人的库对齐、推进某个子问题/引理/方法、尝试一条路线；或向团队发消息（input）、提议任务（propose_task）让大家分工。若你确实认为问题已解决、或已彻底无路可走，才提议开会（propose_meeting）让团队表决/商量、或声明 solved=true。默认立场是：**请推进，而不是停在原地。**\n'
        +'Reply with ONLY a JSON object:\n'
        +'{"summary":"<what you will do / what you advanced this round>","input":"<optional: a message to the whole team, or \\"\\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","claim_task":"<id|null>","contextPct":40}'
    }
    function clearHeartbeat(){ if(heartbeatDisposer!==null){ try{ heartbeatDisposer() }catch(e){} heartbeatDisposer=null } }
    function armHeartbeat(){
      clearHeartbeat()
      const ms=Number(params.activityTimeoutMs)||120000
      if(!(ms>0) || typeof ctx.timeout!=='function') return
      heartbeatDisposer=ctx.timeout(()=>{ heartbeatDisposer=null; scheduleNext().catch(()=>{}) }, ms)
    }
    // Real DSH /compact of a resident's OWN session via ctx.compaction (if the host provides it);
    // falling back silently to the resident self-summary directive when the service is absent.
    async function realCompact(r){
      if(!r || !r.childId) return
      if(compaction===undefined || !compaction.compactIfNeeded) return
      let agent
      try { agent = agents.get(r.childId) } catch(e){ agent = undefined }
      if(!agent || !agent.session) return
      try {
        const signal = makeSignal(params.activityTimeoutMs||60000)
        const result = await compaction.compactIfNeeded(agent, 'pressure', signal)
        if(result && (result.shadowedSeqs||[]).length>0){
          // the resident's real session was compacted → its context is now a summary.
          // Flag needCompact so the NEXT wake re-anchors the core rules (they may have been blurred).
          r.roundsSinceCompact=0; r.needCompact=true; r.contextPct=Math.min(r.contextPct||15,25)
          logActivity('compact', r.rId+' real /compact (shadowed '+result.shadowedSeqs.length+' items, ~'+String(result.shadowedTokenCount||0)+' tokens)')
        }
      } catch(e){ /* real compaction unavailable/failed; the soft directive already covers it */ }
    }

    // ---- liveness / scheduling ----
    async function scheduleNext(){
      if(!running||autoDone){ clearHeartbeat(); return }
      if(phase==='brainstorm'){ await maybeFinishBrainstorm(); return }
      if(meetingState){ await continueMeetingRound(); return }
      if(verifyState){ await continueVerifyRound(); return }
      if(pendingVerify){ const pv=pendingVerify; await beginVerify(pv); return }
      // mailbox delivery
      const delivered=await deliverNextMailbox(); if(delivered) return
      // maxParallel: don't start a new wake when the in-flight cap is reached
      const mp=Number(params.maxParallel)||0
      if(mp>0 && busy.size>=mp){ armHeartbeat(); return }
      // B) stall auto-sync meeting (分级保活 B): the group has been idle with NO progress for
      //    stallAutoMeetingMs → convene a sync meeting so the residents coordinate their next move
      //    (framework convenes & records; residents decide — never assigns work). Only when no
      //    meeting/verify/pending work is active AND no resident is currently working (so it never
      //    preempts an in-flight round).
      if(phase==='active' && !meetingState && !verifyState && !pendingVerify && busy.size===0){
        const stallMs=Number(params.stallAutoMeetingMs)||((Number(params.activityTimeoutMs)||120000)*3)
        if(now()-lastProgressAt>=stallMs){
          await startMeeting('团队较长时间没有新进展。请你们自行讨论：当前问题是否已解决、开放难点是什么、谁负责哪部分、下一步如何推进，并自主决定是否继续。框架只负责转达与记录，不替你们决定。','general',null)
          return
        }
      }
      // A) heartbeat / coordination: wake the least-recently-active resident after an idle timeout
      //    to SELF-DRIVE (continue solving / message / propose task / meeting / verify). On a FAILED
      //    wake we re-arm the heartbeat so a single follow-up error NEVER permanently stops the group
      //    (a successful wake re-drives scheduleNext through its own onResidentEnd, which re-arms).
      clearHeartbeat()
      let target=null, oldest=-1
      for(const [,r] of residents){ if(busy.has(r.rId)) continue; const idle=now()-r.lastActiveAt; if(idle>oldest){ oldest=idle; target=r } }
      const atOs=Number(params.activityTimeoutMs)||120000
      if(target && oldest>=atOs){
        let ok=false
        try { ok = await wakeResident(target, await heartbeatPrompt(target), 'normal') } catch(e){ ok=false }
        await saveAll()
        if(!ok) armHeartbeat()   // wake failed → re-arm so the group never permanently stops
        return
      }
      // everyone is busy or not idle-enough: arm a heartbeat to re-check later (no infinite spin)
      armHeartbeat()
    }
    async function maybeFinishBrainstorm(){
      const pending=[]; for(const [,r] of residents){ if(r.status==='brainstorm' && !r.insight) pending.push(r.rId) }
      if(pending.length===0){ phase='active'; logActivity('phase','active — residents now self-organize'); await saveBrainstormSummary(); await saveAll(); await scheduleNext() }
    }
    async function saveBrainstormSummary(){
      const lines=['# 头脑风暴','']; for(const [,r] of residents){ if(r.insight){ lines.push('## '+r.rId+'「'+(r.direction||'')+'」'); lines.push(r.insight); lines.push('') } }
      await writeText('Shared/meetings/brainstorm.md', lines.join('\n'))
    }
    async function deliverNextMailbox(){
      for(const [to,msgs] of mailboxes){
        if(msgs.length===0) continue
        const m=msgs.shift(); const r=residents.get(to); if(!r){ continue }
        if(!busy.has(to)){ currentResident=to; await wakeResident(r, (await normalPrompt(r))+'\n\n[MESSAGE from '+m.from+']\n'+m.content,'normal'); await saveAll(); return true }
        msgs.push(m); continue   // recipient busy → keep the message queued, try another mailbox (avoid starving others)
      }
      return false
    }

    // ---- resident end handler ----
    async function onResidentEnd(childId, info){
      const r=byChild(childId); if(!r) return
      busy.delete(r.rId)
      // Any resident turn that COMPLETED is real activity for the stall clock (B). Residents frequently
      // write their libraries via direct fs (not the record* tools), so relying only on
      // bumpArtifacts/markProgress would leave lastProgressAt stale and B would fire against an active
      // team. We count only a clean 'completed' turn: an error/max-tokens/refusal did NOT meaningfully
      // advance the work, so it must NOT mask a truly stalled group (B can then convene a recovery
      // meeting). A completed turn also refreshes the meeting/verify deadlock clock through lastInputAt.
      if(info && info.stopReason==='completed') markProgress()
      realCompact(r).catch(()=>{})   // best-effort real DSH /compact of this resident while idle
      const output=blocksToText(info&&info.lastAssistantMessage)
      const parsed=parseReply(output)
      postmark(r, parsed)   // context/compact bookkeeping, regardless of wake kind (clears any leak)
      const kind=wakeKind.get(r.rId)||'normal'
      if(kind==='meeting' && meetingState){
        meetingState.inputs[r.rId]={input:parsed.input||parsed.summary||'',voteSolved:typeof parsed.voteSolved==='boolean'?parsed.voteSolved:null,propose_verify:parsed.propose_verify||null,propose_task:parsed.propose_task||null,task_desc:parsed.task_desc||'',claim_task:parsed.claim_task||null}
        meetingState.lastInputAt=now()
        if(parsed.propose_verify) pendingVerify={targetId:parsed.propose_verify,targetType:guessTargetType(parsed.propose_verify),proposer:r.rId,at:now()}
        await saveAll(); await continueMeetingRound(); return
      }
      if((kind==='verif-ind'||kind==='verif-deb') && verifyState){
        const v=(parsed&&parsed.vote)||{}
        // verdict = 0-1 probability the object is TRUE (1=绝对真, 0=绝对假, 0.5=不确定);
        // also accept legacy 'TRUE'/'FALSE' strings.
        let p
        if(typeof v.verdict==='number'){ p=clamp01(v.verdict) }
        else if(/^TRUE$/i.test(String(v.verdict))){ p=1 }
        else if(/^FALSE$/i.test(String(v.verdict))){ p=0 }
        else { p=clamp01(Number(v.confidence)) }
        // verdict is a PURE 0-1 probability (a degree); no binary TRUE/FALSE classification.
        verifyState.verdicts[r.rId]={prob:p,confidence:p,reason:String(v.reason||parsed.summary||'')}
        verifyState.lastVerdictAt=now()
        await saveAll(); await continueVerifyRound(); return
      }
      // normal turn
      if(r.status==='brainstorm'){ r.insight=parsed.summary||output; r.status='active' }
      if(typeof parsed.solved==='boolean') reports.push({rId:r.rId,solved:parsed.solved,summary:parsed.summary||'',at:now()})
      if(parsed.propose_verify) pendingVerify={targetId:parsed.propose_verify,targetType:guessTargetType(parsed.propose_verify),proposer:r.rId,at:now()}
      // group-conversation relay: the resident may choose to speak to the whole team (input) —
      // forward it to the others so this is a real discussion group, not private monologues.
      if(typeof parsed.input==='string' && parsed.input.trim()) await relayToGroup(r.rId, parsed.input.trim())
      // task actions via reply (a resident may propose or claim a task in its round)
      if(parsed.propose_task) await proposeTask(parsed.propose_task, parsed.task_desc||'', r.rId)
      if(parsed.claim_task) await claimTask(parsed.claim_task, r.rId)
      if(parsed.task_done) await taskDone(parsed.task_done, r.rId)
      // a resident may self-trigger a meeting (resident-driven coordination, closest to the philosophy)
      if(parsed.propose_meeting && !meetingState){ await startMeeting(String(parsed.propose_meeting),'general',null); await saveAll(); return }
      await saveAll(); await scheduleNext()
    }

    // ---- controls ----
    async function start({problem,residentCount,seedDirections}){
      await loadSettings()
      currentProject=await readCurrentProject(); if(!currentProject||currentProject==='default'){ currentProject='default'; }
      await ensureDirs()
      if(problem) problemText=String(problem)
      if(!problemText) return {ok:false,message:'problem text required (pass problem, or use vibe_v4_configure first)'}
      problemId=slugify(problemText.slice(0,40))||'problem'
      if(residentCount) params.residentCount=Number(residentCount)||4
      running=true; autoDone=false; phase='brainstorm'
      await writeText('Problems/'+problemId+'.md','# 问题｜'+problemId+'\n- ID: '+problemId+'\n- 类型: 问题\n- 状态: 求解中\n- 优先级: 1\n- 依赖: []\n\n## 陈述\n'+problemText+'\n')
      residents=new Map(); mailboxes=new Map(); taskboard=[]; decisions=[]; meetings=[]; reports=[]; verifyState=null; meetingState=null; pendingVerify=null; residentSeq=0; artifactCount=0; clearHeartbeat()
      lastActivityAt=now(); lastProgressAt=now()   // fresh stall/activity clock for the new run (else B could fire immediately on a reused session)
      const dirs=Array.isArray(seedDirections)?seedDirections.slice(0,params.residentCount):[]
      for(let i=0;i<params.residentCount;i++){ const r=newResident(dirs[i]||''); await spawnResident(r) }
      await saveAll(); return {ok:true,message:'v4 started: '+params.residentCount+' resident(s) brainstorming',project:currentProject}
    }
    async function resume(){
      currentProject=await readCurrentProject(); await ensureDirs(); await loadAll(); await loadSettings()
      lastActivityAt=now(); lastProgressAt=now()   // pause must not count as stall time; a resumed run gets a fresh clock
      if(phase==='idle' && !running && residents.size===0) return {ok:false,message:'nothing to resume'}
      // If the persisted State came from a DIFFERENT process (crash/restart), the saved
      // childIds are stale; clear them so residents re-spawn (their libraries persist on
      // disk and re-seed the resumed run). Same-process pause→resume keeps continuable ids.
      const crossProcess = persistedEpoch !== processEpoch
      if(crossProcess){ for(const [,r] of residents){ r.childId=''; r.status='brainstorm'; r.roundsSinceCompact=0 } }
      for(const [,r] of residents){ if(!r.childId){ await spawnResident(r) } }
      if(!running){ running=true; autoDone=false; if(phase==='idle') phase='active' }
      if(crossProcess && phase==='active') phase='brainstorm'   // let re-spawned residents re-bootstrap together
      logActivity('resume','restarted'+(crossProcess?' (cross-process: re-spawned)':'')); await saveAll(); await scheduleNext(); return {ok:true,message:'resumed',project:currentProject}
    }
    function status(){ return { ok:true, running, phase, autoDone, project:currentProject, residentCount:residents.size,
      residents:listResidents(), busy:[...busy], taskboard:taskboard.length,
      meetingInProgress: !!(meetingState), verifyInProgress: !!(verifyState), pendingVerify: pendingVerify?pendingVerify.targetId:null,
      params:['residentCount','compactAfterRounds','compactThreshold','maxParallel','activityTimeoutMs','meetingKeepEvery','verdictMaxRounds','stallAutoMeetingMs','provider','model','residentPersona','toolAllow','toolDeny'].map(k=>k+'='+(Array.isArray(params[k])?params[k].join(','):params[k])).join(', ') } }
    function report(){ return { ok:true, running, phase, autoDone, project:currentProject, problem:problemText,
      residents:listResidents(), taskboard:taskboard.filter(t=>t.status!=='done'),
      meeting: meetingState?{id:meetingState.id, agenda:meetingState.agenda, spoke:Object.keys(meetingState.inputs).length+'/'+residents.size}:null,
      verify: verifyState?{target:verifyState.targetId,stage:verifyState.stage, voted:Object.keys(verifyState.verdicts).length+'/'+residents.size}:null,
      pendingVerify: pendingVerify?pendingVerify.targetId:null,
      meetings:meetings.length, recentActivity: activityLog.slice(-8) } }
    async function addMember(direction){ const r=newResident(direction||''); await spawnResident(r); return {ok:true,id:r.rId,direction:r.direction} }
    async function removeMember(id){ const r=residents.get(id); if(!r) return {ok:false}; if(r.childId){ try{ subagents.interrupt(r.childId,{kind:'ancestor',agent:rootAgent}) }catch(e){} } residents.delete(id); busy.delete(id); mailboxes.delete(id); await saveAll(); return {ok:true} }
    // Normalize one parameter value to its intended type so a string from /v4 set or configure
    // becomes the right number/array. Keeps settings.json clean regardless of how it was set.
    function normalizeParam(k, v){
      const INT_KEYS=['residentCount','compactThreshold','compactAfterRounds','maxParallel','activityTimeoutMs','verdictMaxRounds','meetingKeepEvery','stallAutoMeetingMs']
      if(INT_KEYS.includes(k)){ const n=Number(v); return Number.isFinite(n)?n:v }
      if(k==='toolAllow'||k==='toolDeny'){ if(Array.isArray(v)) return v.map(x=>String(x).trim()).filter(Boolean); if(typeof v==='string') return v.split(',').map(x=>x.trim()).filter(Boolean); return [] }
      return v
    }
    function setParams(upd){ for(const k of Object.keys(upd||{})){ if(k in params) params[k]=normalizeParam(k, upd[k]) } saveSettings().catch(()=>{}); return {ok:true} }
    // ---- create / configure (no auto-start) + settings-file persistence ----
    async function loadSettings(){ const s=await readJson('State/settings.json'); if(s&&typeof s==='object'){ for(const k of Object.keys(s)){ if(k in params) params[k]=s[k] } } }
    async function saveSettings(){ await writeJson('State/settings.json', params) }
    // Create/configure a project and set params/problem WITHOUT starting any resident.
    // The intended flow: vibe_v4_configure {project?, problem?, params?}  →  vibe_v4_start {}.
    async function configure(cfg){
      if(cfg && cfg.project && String(cfg.project).trim()) currentProject=String(cfg.project).trim()
      if(cfg && cfg.problem) problemText=String(cfg.problem)
      if(cfg && cfg.params && typeof cfg.params==='object') setParams(cfg.params)
      await writeCurrentProject(); await ensureDirs(); await saveSettings()
      // create the problem card so the project is complete BEFORE the run starts
      if(problemText){ const pid=slugify(problemText.slice(0,40))||'problem'; await writeText('Problems/'+pid+'.md','# 问题｜'+pid+'\n- ID: '+pid+'\n- 类型: 问题\n- 状态: 求解中\n- 优先级: 1\n- 依赖: []\n\n## 陈述\n'+problemText+'\n') }
      await saveAll()
      return {ok:true,project:currentProject,problem:problemText?problemText.slice(0,60):'',params:Object.keys(params).map(k=>k+'='+params[k]).join(', ')}
    }
    async function initAbort(){ clearHeartbeat(); running=false; phase='idle'; autoDone=false; for(const [,r] of residents){ if(r.childId){ try{ subagents.interrupt(r.childId,{kind:'ancestor',agent:rootAgent}) }catch(e){} } r.childId=''; r.lastActiveAt=0; r.roundsSinceCompact=0 } await saveAll(); return {ok:true,message:'aborted'} }
    function setPause(){ clearHeartbeat(); running=false; return {ok:true,message:'paused'} }

    return {
      sessionId, running:()=>running, autoDone:()=>autoDone, phase:()=>phase,
      onResidentEnd, start, resume, status, report, addMember, removeMember, setParams,
      setPause, initAbort, postMessage, startMeeting, saveAll, broadcast, configure, loadSettings,
      currentResident:()=>currentResident,
      residentIdOf:(agent)=>{ const m=residentOfAgent(agent); return m||currentResident },
      useResident:(id)=>{ currentResident=id },
      publishProgress, recordProposition, recordMethod, recordSubproblem, listResidents, reportContext,
      proposeTask, claimTask, taskDone, listTasks,
      readProgress: async (rid)=>({text:(await readText('Progress/'+rid+'/progress.md'))||''}),
      frameworkRoot:frameworkRoot, currentProject:()=>currentProject, problemText:()=>problemText,
      residentCount:()=>residents.size,
      busyCount:()=>busy.size,
    }
  } // end makeSession

  // ================= apply-level registration (ONCE) =================
  function objParams(props, required){ return { type:'object', properties:props, additionalProperties:false, required:required||[] } }
  function registerTool(name, description, parameters, fn){
    tools.register({ name, description, parameters,
      output:{ schema:{ type:'string' }, render:(_a,v)=>[{type:'text',text:String(v)}] },
      execute: async (args, exec)=>{
        try { const s=getSession(exec&&exec.agent); if(!s) return JSON.stringify({ok:false,error:'no session'}); return JSON.stringify(await fn(s,args||{},exec&&exec.agent)) }
        catch(e){ return JSON.stringify({ok:false,error:String((e&&e.message)||e)}) }
      } })
  }
  // host/assistant-facing
  registerTool('vibe_v4_configure','Create/configure a project: set project name, problem, and params WITHOUT starting a run. Use this FIRST, then vibe_v4_start to actually spawn residents.',objParams({project:{type:'string'},problem:{type:'string'},params:{type:'object'}}),(s,a)=>s.configure(a))
  registerTool('vibe_v4_start','Start V4: spawn N resident subagents (brainstorm then self-organize).',objParams({problem:{type:'string'},residentCount:{type:'integer'},seedDirections:{type:'array',items:{type:'string'}}}),(s,a)=>s.start(a))
  registerTool('vibe_v4_resume','Resume a persisted V4 run.',objParams({}),(s)=>s.resume())
  registerTool('vibe_v4_pause','Pause V4.',objParams({}),(s)=>s.setPause())
  registerTool('vibe_v4_abort','Abort V4 and interrupt residents.',objParams({}),(s)=>s.initAbort())
  registerTool('vibe_v4_status','Show V4 status.',objParams({}),(s)=>s.status())
  registerTool('vibe_v4_report','Return the V4 progress report.',objParams({}),(s)=>s.report())
  registerTool('vibe_v4_message','Inject a message to a resident (or all).',objParams({to:{type:'string'},content:{type:'string'}},['to','content']),(s,a)=>{ const to=a.to||'all'; if(to==='all') return s.broadcast(a.content); return s.postMessage('facilitator',to,a.content) })
  registerTool('vibe_v4_meeting','Start a meeting (coordinate / allocate / propose verification).',objParams({agenda:{type:'string'}},['agenda']),(s,a)=>s.startMeeting(a.agenda))
  registerTool('vibe_v4_list_members','List residents.',objParams({}),(s)=>({ok:true,residents:s.listResidents()}))
  registerTool('vibe_v4_add_member','Add a resident.',objParams({direction:{type:'string'}}),(s,a)=>s.addMember(a.direction))
  registerTool('vibe_v4_remove_member','Close a resident.',objParams({id:{type:'string'}},['id']),(s,a)=>s.removeMember(a.id))
  // model/provider inheritance: set model/provider to override the residents' LLM route (''=inherit
  // the main assistant's route). toolAllow/toolDeny are per-resident tool permissions (scoped
  // restrict). residentPersona prepends a persona line to every resident prompt.
  registerTool('vibe_v4_set','Set V4 parameters. model/provider override resident LLM route (empty=inherit main); toolAllow/toolDeny restrict resident tools (arrays of tool names); residentPersona adds a persona line.',objParams({residentCount:{type:'integer'},compactAfterRounds:{type:'integer'},compactThreshold:{type:'integer'},meetingKeepEvery:{type:'integer'},maxParallel:{type:'integer'},activityTimeoutMs:{type:'integer'},verdictMaxRounds:{type:'integer'},stallAutoMeetingMs:{type:'integer'},provider:{type:'string'},model:{type:'string'},residentPersona:{type:'string'},toolAllow:{type:'array',items:{type:'string'}},toolDeny:{type:'array',items:{type:'string'}}}),(s,a)=>{ s.setParams(a); return {ok:true} })
  // resident-facing tools: route to the CALLING resident (exec.agent.id === childId);
  // fall back to the last-woken resident when called by the host/assistant.
  registerTool('vibe_v4_send_message','(resident) Send a message to another resident.',objParams({to:{type:'string'},content:{type:'string'}},['to','content']),(s,a,x)=>s.postMessage(s.residentIdOf(x),a.to,a.content))
  registerTool('vibe_v4_publish_progress','(resident) Append to your own progress markdown.',objParams({content:{type:'string'}},['content']),(s,a,x)=>s.publishProgress(s.residentIdOf(x),a.content))
  registerTool('vibe_v4_record_proposition','(resident) Record a proposition to your library.',objParams({id:{type:'string'},title:{type:'string'},statement:{type:'string'},prob:{type:'number'},value:{type:'number'},motivation:{type:'string'}}),(s,a,x)=>s.recordProposition(s.residentIdOf(x),a))
  registerTool('vibe_v4_record_method','(resident) Record a method/theory to your library.',objParams({id:{type:'string'},title:{type:'string'},type:{type:'string'},content:{type:'string'},notation:{type:'string'},value:{type:'number'},motivation:{type:'string'}}),(s,a,x)=>s.recordMethod(s.residentIdOf(x),a))
  registerTool('vibe_v4_record_subproblem','(resident) Record a sub-problem to your library.',objParams({id:{type:'string'},title:{type:'string'},statement:{type:'string'},value:{type:'number'},motivation:{type:'string'}}),(s,a,x)=>s.recordSubproblem(s.residentIdOf(x),a))
  registerTool('vibe_v4_read_progress','(resident) Read another resident\'s progress (read-only).',objParams({id:{type:'string'}},['id']),async (s,a)=>{ const rp=await s.readProgress(a.id); return {ok:true,text:(rp&&rp.text)||''} })
  registerTool('vibe_v4_list_residents','(resident) List fellow residents.',objParams({}),(s)=>({ok:true,residents:s.listResidents()}))
  // task board (residents; board is the residents' own allocation mechanism)
  registerTool('vibe_v4_propose_task','(resident) Propose a task to the shared task board.',objParams({title:{type:'string'},description:{type:'string'}},['title']),(s,a,x)=>s.proposeTask(a.title,a.description,s.residentIdOf(x)))
  registerTool('vibe_v4_claim_task','(resident) Claim an open task from the board (framework then wakes you to work it).',objParams({id:{type:'string'}},['id']),(s,a,x)=>s.claimTask(a.id,s.residentIdOf(x)))
  registerTool('vibe_v4_task_done','(resident) Mark a claimed task done.',objParams({id:{type:'string'},claimer:{type:'string'}},['id']),(s,a,x)=>s.taskDone(a.id,a.claimer||s.residentIdOf(x)))
  registerTool('vibe_v4_list_tasks','(resident) List open tasks.',objParams({}),(s)=>({ok:true,tasks:s.listTasks()}))
  // context / compact (resident reports its context usage so the framework can /compact-equivalent)
  registerTool('vibe_v4_report_context','(resident) Report your context usage %; the framework compacts (self-summary) when it reaches compactThreshold.',objParams({pct:{type:'number'}},['pct']),(s,a,x)=>s.reportContext(s.residentIdOf(x),a.pct))
  registerTool('vibe_v4_claim_write','Reserved: shared-file write lock (framework-managed).',objParams({target:{type:'string'}},['target']),(s,a)=>({ok:true,key:a.target}))
  registerTool('vibe_v4_release_write','Reserved: shared-file write lock release.',objParams({target:{type:'string'}},['target']),(s,a)=>({ok:true,key:a.target}))

  commands.register({
    name:'v4', description:'control the Vibe Math V4 framework',
    input:{hint:'[configure|start|resume|pause|abort|status|report|meeting|members|add|remove|set]'},
    handler: async function(inv){
      const s=getSession(inv&&inv.agent); if(!s) return {kind:'success',text:JSON.stringify({ok:false,error:'no session'})}
      const line=String(inv&&inv.rawInput?inv.rawInput:'').trim(); const parts=line.split(/\s+/); const cmd=parts[0]||''; const rest=parts.slice(1)
      let r
      if(cmd==='configure') r=await s.configure({project:rest[0]||'', problem:parts.slice(2).join(' ')})
      else if(cmd==='start') r=await s.start({})
      else if(cmd==='resume') r=await s.resume()
      else if(cmd==='pause') r=s.setPause()
      else if(cmd==='abort') r=await s.initAbort()
      else if(cmd==='status') r=s.status()
      else if(cmd==='report') r=s.report()
      else if(cmd==='meeting') r=await s.startMeeting(rest.join(' '))
      else if(cmd==='members') r={ok:true,residents:s.listResidents()}
      else if(cmd==='add') r=await s.addMember(rest.join(' '))
      else if(cmd==='remove') r=await s.removeMember(rest[0]||'')
      else if(cmd==='set'){ const upd={}; for(const tok of rest){ const eq=tok.indexOf('='); if(eq>0){ const k=tok.slice(0,eq); const rv=tok.slice(eq+1); const n=Number(rv); upd[k]=Number.isFinite(n)?n:rv } } r=s.setParams(upd) }
      else r={ok:false,usage:'configure|start|resume|pause|abort|status|report|message|meeting|members|add|remove|set'}
      return {kind:'success',text:JSON.stringify(r,null,2)}
    },
  })

  ctx.on('subagent/end', function(info){
    const sid=childOwner.get(info.id); const s=sid!==undefined?sessions.get(sid):undefined
    if(s) s.onResidentEnd(info.id, info).catch(e=>console.error('vibe-v4 end: '+String((e&&e.stack)||e)))
  })
}
