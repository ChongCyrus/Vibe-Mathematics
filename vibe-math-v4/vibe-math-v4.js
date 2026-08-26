// Vibe Math V4 — persistent self-organizing collaborative research framework.
// FACILITATOR (message bus / meetings / per-resident artifact libraries /
// unanimous-consensus verification / context compaction proxy / resume / human
// intervention). It NEVER assigns tasks: residents message & meet and decide all
// task allocation among themselves. Consumes HOST subagents/agents/fs/tools/commands.
export function apply(ctx) {
  const subagents = ctx.subagents
  const agents = ctx.agents
  const fs = ctx.fs
  const tools = ctx.tools
  const commands = ctx.commands
  const subprocess = ctx.get('subprocess')
  const sandboxPolicy = ctx.get('sandboxPolicy')

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
      provider: '', model: '', residentPersona: '',
    }
    let params = Object.assign({}, DEFAULT_PARAMS)
    let running = false, autoDone = false, phase = 'idle'
    let residents = new Map(), mailboxes = new Map(), taskboard = [], decisions = []
    let meetings = [], reports = [], activityLog = []
    let problemText = '', problemId = 'problem', runId = 'run-' + shortId()
    let meetingState = null, verifyState = null, pendingVerify = null
    let busy = new Set(), wakeKind = new Map(), currentResident = ''
    let lastActivityAt = now()
    const activityLogCap = 200

    // ---- utils ----
    function now(){ return Date.now() }
    function uuid(){ const h='0123456789abcdef'; let s=''; for(let i=0;i<36;i++){ if(i===8||i===13||i===18||i===23) s+='-'; else s+=h[Math.floor(Math.random()*16)] } return s }
    function shortId(){ const h='0123456789abcdef'; let s=''; for(let i=0;i<8;i++) s+=h[Math.floor(Math.random()*16)]; return s }
    function clamp01(v){ const n=Number(v); if(!Number.isFinite(n)) return 0.5; return Math.max(0,Math.min(1,n)) }
    function fmtTime(ts){ try { return new Date(ts||now()).toISOString().replace('T',' ').slice(0,19) } catch(e){ return String(ts||'') } }
    function cl(x){ return clamp01(Number(x)) }
    function textBlock(t){ return { type:'text', text:String(t) } }
    function blocksToText(b){ if(!b) return ''; let out=''; for(const x of b){ if(x&&x.type==='text'&&typeof x.text==='string') out+=x.text+'\n' } return out.trim() }
    function logActivity(event,detail){ activityLog.push({at:now(),event,detail:String(detail||'')}); if(activityLog.length>activityLogCap) activityLog.shift() }
    function logDecision(kind,detail){ decisions.push({at:now(),kind,detail:String(detail||'')}) }
    function pickProvider(){ try { const n=subagents.list?subagents.list():[]; if(n.indexOf('spawn')!==-1) return 'spawn'; if(n.indexOf('fork')!==-1) return 'fork' } catch(e){} return 'spawn' }
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
      await writeJson('State/session.json', {running,autoDone,phase,problemId,problemText,runId,meetings,reports,lastActivityAt,activityLog})
    }
    async function loadAll(){
      const s=await readJson('State/session.json'); if(s){ running=!!s.running; autoDone=!!s.autoDone; phase=s.phase||'idle'; problemId=s.problemId||problemId; problemText=s.problemText||problemText; runId=s.runId||runId; meetings=s.meetings||[]; reports=s.reports||[]; lastActivityAt=s.lastActivityAt||now(); activityLog=s.activityLog||activityLog }
      const rm=await readJson('State/residents.json'); if(rm&&typeof rm==='object') residents=new Map(Object.entries(rm))
      const mb=await readJson('State/mailboxes.json'); if(mb&&typeof mb==='object') mailboxes=new Map(Object.entries(mb))
      const tb=await readJson('State/taskboard.json'); if(Array.isArray(tb)) taskboard=tb
      const dc=await readJson('State/decisions.json'); if(Array.isArray(dc)) decisions=dc
    }

    // ---- resident prompts ----
    function banner(){ const o=[]; for(const [id,r] of residents) o.push('- '+id+'「'+(r.direction||'（未定）')+'」'+r.status+'·轮'+r.rounds); return o.join('\n') }
    async function inboxText(rId){ const mb=mailboxes.get(rId)||[]; if(mb.length===0) return '  (no new messages)\n'; return mb.map(m=>'  ['+m.from+'] '+m.content).join('\n')+'\n' }
    function brainstormPrompt(r){
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'You are resident researcher '+r.rId+' (of '+params.residentCount+'), collaborating on:\n'+problemText
        +(r.direction?('\n\nAssigned direction (you may refine it):\n'+r.direction):'')+'\n\n'
        +'This is your FIRST, independent thinking round. Independently brainstorm: your insight / solution direction / sub-problems / plausible lemmas / rough plan. You do NOT see the others yet.\n'
        +'Rules:\n- Only facts already in Verified/ are established; everything else is your own working (experiential), clearly mark conjecture vs known.\n'
        +'- Record valuable artifacts to YOUR library via vibe_v4_publish_progress / vibe_v4_record_proposition / vibe_v4_record_method / vibe_v4_record_subproblem; each must carry 价值程度 / 动机用途计划 / 自身概率估计.\n'
        +'Reply with ONLY a JSON object in a ```json fence (no prose outside):\n'
        +'{"summary":"<your insight, one tight paragraph>","solved":false}'
    }
    async function normalPrompt(r){
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'You are resident researcher '+r.rId+' collaborating with '+Math.max(0,residents.size-1)+' other resident(s) on:\n'+problemText+'\n\nResidents:\n'+banner()+'\n\n'
        +'This is your round (#'+r.rounds+'). You decide what to do — there is NO external assignment. Typical actions:\n'
        +'- advance your direction; verify your own claims; record valuable artifacts to YOUR library (vibe_v4_publish_progress / record_proposition / record_method / record_subproblem), each with 价值程度 / 动机用途计划 / 自身概率估计;\n'
        +'- message a specific resident (vibe_v4_send_message) or broadcast;\n'
        +'- call a meeting (vibe_v4_meeting) to coordinate / allocate tasks / propose a verification;\n'
        +'- propose an object for unanimous verification (set propose_verify in your reply).\n'
        +'You may READ any other resident\'s Progress/Propos/Methods/Subproblems (read-only via vibe_v4_read_progress / fs); you only WRITE your own '+r.rId+' library.\n'
        +'Rules:\n- Only Verified/ is established. Verification requires ALL residents unanimous; you trust only unanimous results.\n'
        +'- If the ORIGINAL problem is solved, set solved=true (we stop only when ALL residents agree).\n'
        +'New items:\n'+ (await inboxText(r.rId))
        +'\nReply with ONLY a JSON object in a ```json fence (no prose outside):\n'
        +'{"summary":"<what you did this round, 1-3 sentences>","solved":false,"propose_verify":"<a target id like p-xxx / m-xxx / s-xxx, or null>"}'
    }
    function meetingPrompt(r, st){
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'You are resident '+r.rId+'. A meeting is in progress (agenda: '+st.agenda+').'
        +(st.type==='verify'?('\nThe group is verifying object: '+st.targetId+'. Give your independent verdict.'):'')
        +'\nGive your input. If the agenda is about whether the original problem is solved, set voteSolved.\n'
        +'Reply with ONLY a JSON object (```json fence):\n'
        +'{"input":"<your contribution>","voteSolved":true,"propose_verify":"<id or null>"}'
    }
    function verifyPrompt(r, vs){
      const others=Object.entries(vs.verdicts).map(([k,v])=>'- '+k+': '+v.verdict+' ('+v.confidence+') '+v.reason).join('\n')
      return (params.residentPersona?params.residentPersona+'\n':'')
        +'You are resident '+r.rId+'. The group is verifying object '+vs.targetId+' ('+vs.targetType+'). '
        +'It may be TRUE only if ALL residents agree true (FALSE only if ALL agree false). Give your honest independent verdict'
        +(vs.stage==='debate'?' after considering the others:':'')+'.\n'
        +(vs.stage==='debate'?('Others so far:\n'+others):'')
        +'\nReply with ONLY a JSON object (```json fence):\n'
        +'{"vote":{"verdict":"TRUE","confidence":0.8,"reason":"<your logic>"}}'
    }

    // ---- resident lifecycle ----
    function newResident(dir){ const rId='r-'+(residents.size+1); return {rId,childId:'',direction:dir||'',status:'brainstorm',rounds:0,roundsSinceCompact:0,lastActiveAt:now(),insight:''} }
    async function spawnResident(r){
      const started=await subagents.startContinuable({provider:pickProvider(),label:r.rId,request:{prompt:[textBlock(brainstormPrompt(r))],parent:rootAgent,agentOptions:{}},signal:makeSignal(60000)})
      r.childId=started.childId; r.status='brainstorm'; r.lastActiveAt=now()
      childOwner.set(started.childId,sessionId); busy.add(r.rId); wakeKind.set(r.rId,'normal'); currentResident=r.rId
      residents.set(r.rId,r); await saveAll(); logActivity('spawn',r.rId+' ('+(r.direction||'brainstorm')+')')
    }
    async function wakeResident(r, promptText, kind){
      if(!r.childId) return false
      busy.add(r.rId); wakeKind.set(r.rId,kind||'normal'); currentResident=r.rId
      r.lastActiveAt=now(); r.rounds+=1; r.roundsSinceCompact+=1
      try { await subagents.followup(rootAgent,r.childId,[textBlock(promptText)],{source:{kind:'user'},signal:makeSignal(60000)}); return true }
      catch(e){ console.error('vibe-v4 wake '+r.rId+' failed: '+String((e&&e.message)||e)); busy.delete(r.rId); return false }
    }
    function byChild(childId){ for(const [,r] of residents){ if(r.childId===childId) return r } return undefined }

    // ---- artifact writers (resident-facing) ----
    async function publishProgress(rId,content){ const rel='Progress/'+rId+'/progress.md'; const prev=(await readText(rel))||''; await writeText(rel, prev+'\n### '+fmtTime()+'｜'+rId+'\n'+String(content||'')+'\n'); return {ok:true} }
    async function recordProposition(rId,o){ const id=o.id||('p-'+shortId()); const lines=['# 命题｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 类型: 命题','- 状态: 未定论','- 概率: '+cl(o.prob!=null?o.prob:0.5),'- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'- 依赖: []','','## 陈述',String(o.statement||''),'','## 证明尝试','','## 证伪尝试','']; await writeText('Propos/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 命题 '+id); return {ok:true,id,file:'Propos/'+rId+'/'+id+'.md'} }
    async function recordMethod(rId,o){ const id=o.id||('m-'+shortId()); const lines=['# 方法｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 类型: '+(o.type||'方法'),'- 状态: 经验','- 可信断言: []','- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'','## 核心内容',String(o.content||''),'','## 定义与记号',String(o.notation||''),'','## 应用记录','## 改进历史','']; await writeText('Methods/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 方法 '+id); return {ok:true,id,file:'Methods/'+rId+'/'+id+'.md'} }
    async function recordSubproblem(rId,o){ const id=o.id||('s-'+shortId()); const lines=['# 子问题｜'+(o.title||id),'- 标题: '+(o.title||id),'- ID: '+id,'- 状态: 求解中','- 价值程度: '+cl(o.value!=null?o.value:0.5),'- 动机用途计划: '+(o.motivation||''),'- 依赖: []','','## 陈述',String(o.statement||''),'','## 进度','']; await writeText('Subproblems/'+rId+'/'+id+'.md',lines.join('\n')); logActivity('record',rId+' 子问题 '+id); return {ok:true,id,file:'Subproblems/'+rId+'/'+id+'.md'} }
    function listResidents(){ return Array.from(residents.values()).map(r=>({id:r.rId,direction:r.direction,status:r.status,rounds:r.rounds,insight:r.insight?r.insight.slice(0,80):''})) }

    // ---- messaging ----
    async function postMessage(from,to,content){
      const r=residents.get(to); if(!r) return {ok:false,message:'no such resident'}
      if(!busy.has(to)){
        currentResident=r.rId
        await wakeResident(r, (await normalPrompt(r))+'\n\n[NEW MESSAGE from '+from+']\n'+content,'normal')
        await saveAll(); logActivity('message',from+'→'+to); return {ok:true}
      }
      const mb=mailboxes.get(to)||[]; mb.push({from,at:now(),content}); mailboxes.set(to,mb); await saveAll(); logActivity('message',from+'→'+to+' (queued)'); return {ok:true}
    }

    // ---- meeting ----
    async function startMeeting(agenda,type,targetId){
      if(meetingState) return {ok:false,message:'meeting already in progress'}
      meetingState={id:'mt-'+shortId(),agenda,type:type||'general',targetId:targetId||null,round:0,asked:[],inputs:{},transcript:[]}
      logActivity('meeting','start: '+agenda); await saveAll(); await scheduleNext(); return {ok:true,id:meetingState.id}
    }
    async function continueMeetingRound(){
      if(!meetingState) return
      const ids=Array.from(residents.keys()); const allAsked=ids.every(id=>meetingState.asked.indexOf(id)!==-1)
      if(allAsked){ await finalizeMeeting(); return }
      // only wake IDLE residents (never double-wake a busy one; in-flight ones re-trigger this on end)
      const id=ids.find(x=>meetingState.asked.indexOf(x)===-1 && !busy.has(x)); if(!id) return
      meetingState.asked.push(id); const r=residents.get(id)
      await wakeResident(r, meetingPrompt(r,meetingState), 'meeting'); await saveAll()
    }
    async function finalizeMeeting(){
      const st=meetingState
      const lines=['# 会议 '+st.id+'｜'+fmtTime(),'','**议程**：'+st.agenda,'']
      for(const [id,iv] of Object.entries(st.inputs)){ lines.push('### '+id); lines.push(iv.input||''); lines.push('') }
      await writeText('Shared/meetings/'+st.id+'.md', lines.join('\n'))
      meetings.push({id:st.id,agenda:st.agenda,at:now(),inputs:st.inputs})
      logDecision('meeting',st.agenda)
      const votes=Object.values(st.inputs).map(x=>x.voteSolved).filter(v=>typeof v==='boolean')
      const allSolved=votes.length>0 && votes.every(v=>v===true)
      logActivity('meeting', 'concluded'+(allSolved?' → ALL agree solved':''))
      if(allSolved){ running=false; autoDone=true; phase='done'; logActivity('stop','all residents agree: problem solved'); await saveAll(); return }
      meetingState=null; wakeKind.clear(); await saveAll(); await scheduleNext()
    }

    // ---- verification (unanimous) ----
    async function beginVerify(pv){
      pendingVerify=null
      verifyState={targetId:pv.targetId,targetType:pv.targetType,stage:'independent',round:0,asked:[],verdicts:{},transcript:[]}
      logActivity('verify','debate begin: '+pv.targetId+' ('+pv.targetType+')'); await saveAll(); await scheduleNext()
    }
    async function continueVerifyRound(){
      if(!verifyState) return
      const ids=Array.from(residents.keys()); const allAsked=ids.every(id=>verifyState.asked.indexOf(id)!==-1)
      if(allAsked){ await finalizeVerify(); return }
      // only wake IDLE residents (never double-wake; in-flight ones re-trigger this on end)
      const id=ids.find(x=>verifyState.asked.indexOf(x)===-1 && !busy.has(x)); if(!id) return
      verifyState.asked.push(id); const r=residents.get(id)
      await wakeResident(r, verifyPrompt(r,verifyState), verifyState.stage==='independent'?'verif-ind':'verif-deb'); await saveAll()
    }
    async function finalizeVerify(){
      const vs=verifyState; const vals=Object.values(vs.verdicts)
      const allTrue=vals.length>0 && vals.every(x=>x.verdict==='TRUE')
      const allFalse=vals.length>0 && vals.every(x=>x.verdict==='FALSE')
      if(allTrue||allFalse){ await closeVerify(vs,allTrue); return }
      if(vs.round+1<params.verdictMaxRounds){ vs.stage='debate'; vs.round+=1; vs.asked=[]; logActivity('verify',vs.targetId+' round '+vs.round+' → debate'); await saveAll(); await scheduleNext(); return }
      const avg=vals.length? vals.reduce((a,x)=>a+(x.verdict==='TRUE'?x.confidence:x.verdict==='FALSE'?1-x.confidence:0.5),0)/vals.length : 0.5
      await writeDebateDoc(vs,false,avg); logActivity('verify',vs.targetId+' NOT unanimous → kept unverified (avg '+avg.toFixed(2)+')')
      verifyState=null; wakeKind.clear(); await saveAll(); await scheduleNext()
    }
    async function closeVerify(vs,isTrue){
      await writeDebateDoc(vs,true,isTrue?1:0)
      const target=vs.targetId
      await writeVerifiedCard(vs,isTrue)
      await rewriteSource(target,isTrue)
      logActivity('verify',target+' → Verified ('+(isTrue?'真':'假')+') by unanimous consensus')
      verifyState=null; wakeKind.clear(); await saveAll(); await scheduleNext()
    }
    async function writeDebateDoc(vs,done,val){
      const lines=['# 验证辩论｜'+vs.targetId+'('+vs.targetType+')｜'+fmtTime(),'',(done?('**结论**：'+(val===1?'全体一致为真':'全体一致为假')):('**未达成全体一致**，平均概率 '+val.toFixed(2))),'','## 各常驻意见']
      for(const [k,v] of Object.entries(vs.verdicts)){ lines.push('### '+k+'｜'+v.verdict+'｜'+v.confidence); lines.push(v.reason||''); lines.push('') }
      await writeText('Shared/debates/'+vs.targetId+'.md', lines.join('\n'))
    }
    async function writeVerifiedCard(vs,isTrue){
      const dir= vs.targetType==='subproblem'?'问题':'命题'
      const text='# 已验证｜'+vs.targetId+'\n- ID: '+vs.targetId+'\n- 类型: '+(vs.targetType==='subproblem'?'问题':'命题')+'\n- 结论: '+(isTrue?'真':'假')+'\n- 概率: '+(isTrue?1:0)+'\n- 来源: 全体常驻一致\n## 陈述\n参见来源卡。\n'
      await writeText('Verified/'+dir+'/'+vs.targetId+'.md', text)
    }
    async function rewriteSource(target,isTrue){
      // find & update the source card status/prob; best effort across per-resident libs
      let rel=null
      for(const [rid] of residents){
        for(const base of ['Propos','Methods','Subproblems']){
          const cand=base+'/'+rid+'/'+target+'.md'; if((await readText(cand))!==undefined){ rel=cand; break }
        }
        if(rel) break
      }
      if(!rel) rel='Propos/'+target+'.md'
      let text=(await readText(rel))||''
      text=text.replace(/(^|\n)- 状态:.*/m,'$1'+(isTrue?'- 状态: 已验证·真':'- 状态: 已验证·假'))
             .replace(/(^|\n)- 概率:.*/m,'$1'+(isTrue?'- 概率: 1':'- 概率: 0'))
      await writeText(rel,text)
    }
    function guessTargetType(id){ if(/^p-/.test(id)) return 'proposition'; if(/^m-/.test(id)) return 'method'; if(/^s-/.test(id)) return 'subproblem'; return 'proposition' }

    // ---- liveness / scheduling ----
    async function scheduleNext(){
      if(!running||autoDone) return
      if(phase==='brainstorm'){ await maybeFinishBrainstorm(); return }
      if(meetingState){ await continueMeetingRound(); return }
      if(verifyState){ await continueVerifyRound(); return }
      if(pendingVerify){ const pv=pendingVerify; await beginVerify(pv); return }
      // mailbox delivery
      const delivered=await deliverNextMailbox(); if(delivered) return
      // fairness / coordination wake of the least-recently-active resident
      let target=null, oldest=-1
      for(const [,r] of residents){ if(busy.has(r.rId)) continue; const idle=now()-r.lastActiveAt; if(idle>oldest){ oldest=idle; target=r } }
      if(target){ await wakeResident(target, await normalPrompt(target), 'normal'); await saveAll(); return }
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
        msgs.push(m); return false
      }
      return false
    }

    // ---- resident end handler ----
    async function onResidentEnd(childId, info){
      const r=byChild(childId); if(!r) return
      busy.delete(r.rId)
      const output=blocksToText(info&&info.lastAssistantMessage)
      const parsed=parseReply(output)
      const kind=wakeKind.get(r.rId)||'normal'
      if(kind==='meeting' && meetingState){
        meetingState.inputs[r.rId]={input:parsed.input||parsed.summary||'',voteSolved:typeof parsed.voteSolved==='boolean'?parsed.voteSolved:null,propose_verify:parsed.propose_verify||null}
        if(parsed.propose_verify) pendingVerify={targetId:parsed.propose_verify,targetType:guessTargetType(parsed.propose_verify),proposer:r.rId,at:now()}
        await saveAll(); await continueMeetingRound(); return
      }
      if((kind==='verif-ind'||kind==='verif-deb') && verifyState){
        const v=(parsed&&parsed.vote)||{}
        const verdict=String(v.verdict)==='TRUE'?'TRUE':String(v.verdict)==='FALSE'?'FALSE':'UNCERTAIN'
        verifyState.verdicts[r.rId]={verdict,confidence:cl(v.confidence!=null?v.confidence:0.5),reason:String(v.reason||parsed.summary||'')}
        await saveAll(); await continueVerifyRound(); return
      }
      // normal turn
      if(r.status==='brainstorm'){ r.insight=parsed.summary||output; r.status='active' }
      if(typeof parsed.solved==='boolean') reports.push({rId:r.rId,solved:parsed.solved,summary:parsed.summary||'',at:now()})
      if(parsed.propose_verify) pendingVerify={targetId:parsed.propose_verify,targetType:guessTargetType(parsed.propose_verify),proposer:r.rId,at:now()}
      // a resident may self-trigger a meeting (resident-driven coordination, closest to the philosophy)
      if(parsed.propose_meeting && !meetingState){ await startMeeting(String(parsed.propose_meeting),'general',null); await saveAll(); return }
      await saveAll(); await scheduleNext()
    }

    // ---- controls ----
    async function start({problem,residentCount,seedDirections}){
      if(!problem) return {ok:false,message:'problem text required'}
      currentProject=await readCurrentProject(); if(!currentProject||currentProject==='default'){ currentProject='default'; }
      await ensureDirs()
      problemText=String(problem); problemId=slugify(String(problem).slice(0,40))||'problem'
      if(residentCount) params.residentCount=Number(residentCount)||4
      running=true; autoDone=false; phase='brainstorm'
      await writeText('Problems/'+problemId+'.md','# 问题｜'+problemId+'\n- ID: '+problemId+'\n- 类型: 问题\n- 状态: 求解中\n- 优先级: 1\n- 依赖: []\n\n## 陈述\n'+problemText+'\n')
      residents=new Map(); mailboxes=new Map(); taskboard=[]; decisions=[]; meetings=[]; reports=[]; verifyState=null; meetingState=null; pendingVerify=null
      const dirs=Array.isArray(seedDirections)?seedDirections.slice(0,params.residentCount):[]
      for(let i=0;i<params.residentCount;i++){ const r=newResident(dirs[i]||''); await spawnResident(r) }
      await saveAll(); return {ok:true,message:'v4 started: '+params.residentCount+' resident(s) brainstorming',project:currentProject}
    }
    async function resume(){
      currentProject=await readCurrentProject(); await ensureDirs(); await loadAll()
      if(phase==='idle' && !running) return {ok:false,message:'nothing to resume'}
      for(const [,r] of residents){ if(!r.childId){ await spawnResident(r) } }
      if(!running){ running=true; autoDone=false; if(phase==='idle') phase='active' }
      logActivity('resume','restarted'); await saveAll(); return {ok:true,message:'resumed',project:currentProject}
    }
    function status(){ return { ok:true, running, phase, autoDone, project:currentProject, residentCount:residents.size,
      residents:listResidents(), busy:[...busy], taskboard:taskboard.length,
      params:['residentCount','compactAfterRounds','compactThreshold','maxParallel','activityTimeoutMs'].map(k=>k+'='+params[k]).join(', ') } }
    function report(){ return { ok:true, running, phase, autoDone, project:currentProject, problem:problemText,
      residents:listResidents(), taskboard:taskboard.filter(t=>t.status!=='done'),
      verify: verifyState?{target:verifyState.targetId,stage:verifyState.stage}:null, meetings:meetings.length,
      recentActivity: activityLog.slice(-8) } }
    async function addMember(direction){ const r=newResident(direction||''); await spawnResident(r); return {ok:true,id:r.rId,direction:r.direction} }
    async function removeMember(id){ const r=residents.get(id); if(!r) return {ok:false}; if(r.childId){ try{ subagents.interrupt(r.childId,{kind:'ancestor',agent:rootAgent}) }catch(e){} } residents.delete(id); busy.delete(id); mailboxes.delete(id); await saveAll(); return {ok:true} }
    function setParams(upd){ for(const k of Object.keys(upd||{})){ if(k in params) params[k]=upd[k] } return {ok:true} }
    function initAbort(){ running=false; phase='idle'; autoDone=false; for(const [,r] of residents){ if(r.childId){ try{ subagents.interrupt(r.childId,{kind:'ancestor',agent:rootAgent}) }catch(e){} } }; return {ok:true,message:'aborted'} }
    function setPause(){ running=false; return {ok:true,message:'paused'} }

    return {
      sessionId, running:()=>running, autoDone:()=>autoDone, phase:()=>phase,
      onResidentEnd, start, resume, status, report, addMember, removeMember, setParams,
      setPause, initAbort, postMessage, startMeeting, saveAll,
      currentResident:()=>currentResident,
      useResident:(id)=>{ currentResident=id },
      publishProgress, recordProposition, recordMethod, recordSubproblem, listResidents,
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
        try { const s=getSession(exec&&exec.agent); if(!s) return JSON.stringify({ok:false,error:'no session'}); return JSON.stringify(await fn(s,args||{})) }
        catch(e){ return JSON.stringify({ok:false,error:String((e&&e.message)||e)}) }
      } })
  }
  // host/assistant-facing
  registerTool('vibe_v4_start','Start V4: spawn N resident subagents (brainstorm then self-organize).',objParams({problem:{type:'string'},residentCount:{type:'integer'},seedDirections:{type:'array',items:{type:'string'}}},['problem']),(s,a)=>s.start(a))
  registerTool('vibe_v4_resume','Resume a persisted V4 run.',objParams({}),(s)=>s.resume())
  registerTool('vibe_v4_pause','Pause V4.',objParams({}),(s)=>s.setPause())
  registerTool('vibe_v4_abort','Abort V4 and interrupt residents.',objParams({}),(s)=>s.initAbort())
  registerTool('vibe_v4_status','Show V4 status.',objParams({}),(s)=>s.status())
  registerTool('vibe_v4_report','Return the V4 progress report.',objParams({}),(s)=>s.report())
  registerTool('vibe_v4_message','Inject a message to a resident (or all).',objParams({to:{type:'string'},content:{type:'string'}},['to','content']),(s,a)=>{ const to=a.to||'all'; if(to==='all'){ return {ok:true,message:'broadcast: '+(a.content)} } return s.postMessage('facilitator',to,a.content) })
  registerTool('vibe_v4_meeting','Start a meeting (coordinate / allocate / propose verification).',objParams({agenda:{type:'string'}},['agenda']),(s,a)=>s.startMeeting(a.agenda))
  registerTool('vibe_v4_list_members','List residents.',objParams({}),(s)=>({ok:true,residents:s.listResidents()}))
  registerTool('vibe_v4_add_member','Add a resident.',objParams({direction:{type:'string'}}),(s,a)=>s.addMember(a.direction))
  registerTool('vibe_v4_remove_member','Close a resident.',objParams({id:{type:'string'}},['id']),(s,a)=>s.removeMember(a.id))
  registerTool('vibe_v4_set','Set V4 parameters.',objParams({residentCount:{type:'integer'},compactAfterRounds:{type:'integer'},compactThreshold:{type:'integer'},maxParallel:{type:'integer'},activityTimeoutMs:{type:'integer'}}),(s,a)=>{ s.setParams(a); return {ok:true} })
  // resident-facing tools: route to the CURRENT (last-woken) resident of the session
  registerTool('vibe_v4_send_message','(resident) Send a message to another resident.',objParams({to:{type:'string'},content:{type:'string'}},['to','content']),(s,a)=>s.postMessage(s.currentResident(),a.to,a.content))
  registerTool('vibe_v4_publish_progress','(resident) Append to your own progress markdown.',objParams({content:{type:'string'}},['content']),(s,a)=>s.publishProgress(s.currentResident(),a.content))
  registerTool('vibe_v4_record_proposition','(resident) Record a proposition to your library.',objParams({id:{type:'string'},title:{type:'string'},statement:{type:'string'},prob:{type:'number'},value:{type:'number'},motivation:{type:'string'}}),(s,a)=>s.recordProposition(s.currentResident(),a))
  registerTool('vibe_v4_record_method','(resident) Record a method/theory to your library.',objParams({id:{type:'string'},title:{type:'string'},type:{type:'string'},content:{type:'string'},notation:{type:'string'},value:{type:'number'},motivation:{type:'string'}}),(s,a)=>s.recordMethod(s.currentResident(),a))
  registerTool('vibe_v4_record_subproblem','(resident) Record a sub-problem to your library.',objParams({id:{type:'string'},title:{type:'string'},statement:{type:'string'},value:{type:'number'},motivation:{type:'string'}}),(s,a)=>s.recordSubproblem(s.currentResident(),a))
  registerTool('vibe_v4_read_progress','(resident) Read another resident\'s progress (read-only).',objParams({id:{type:'string'}},['id']),(s,a)=>({ok:true,text:(s.readProgress(a.id))}))
  registerTool('vibe_v4_list_residents','(resident) List fellow residents.',objParams({}),(s)=>({ok:true,residents:s.listResidents()}))
  registerTool('vibe_v4_claim_write','Reserved: shared-file write lock (framework-managed).',objParams({target:{type:'string'}},['target']),(s,a)=>({ok:true,key:a.target}))
  registerTool('vibe_v4_release_write','Reserved: shared-file write lock release.',objParams({target:{type:'string'}},['target']),(s,a)=>({ok:true,key:a.target}))

  commands.register({
    name:'v4', description:'control the Vibe Math V4 framework',
    input:{hint:'[start|resume|pause|abort|status|report|meeting|members|add|remove|set]'},
    handler: async function(inv){
      const s=getSession(inv&&inv.agent); if(!s) return {kind:'success',text:JSON.stringify({ok:false,error:'no session'})}
      const line=String(inv&&inv.rawInput?inv.rawInput:'').trim(); const parts=line.split(/\s+/); const cmd=parts[0]||''; const rest=parts.slice(1)
      let r
      if(cmd==='start') r=await s.start({problem:rest.join(' ')})
      else if(cmd==='resume') r=await s.resume()
      else if(cmd==='pause') r=s.setPause()
      else if(cmd==='abort') r=s.initAbort()
      else if(cmd==='status') r=s.status()
      else if(cmd==='report') r=s.report()
      else if(cmd==='meeting') r=await s.startMeeting(rest.join(' '))
      else if(cmd==='members') r={ok:true,residents:s.listResidents()}
      else if(cmd==='add') r=await s.addMember(rest.join(' '))
      else if(cmd==='remove') r=await s.removeMember(rest[0]||'')
      else r={ok:false,usage:'start|resume|pause|abort|status|report|message|meeting|members|add|remove|set'}
      return {kind:'success',text:JSON.stringify(r,null,2)}
    },
  })

  ctx.on('subagent/end', function(info){
    const sid=childOwner.get(info.id); const s=sid!==undefined?sessions.get(sid):undefined
    if(s) s.onResidentEnd(info.id, info).catch(e=>console.error('vibe-v4 end: '+String((e&&e.stack)||e)))
  })
}
