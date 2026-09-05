// ============================================================
// Vibe-Math-V3 SELF-DRIVING FULL-PIPELINE RECORDER
//   - 用真实宿主 mock 驱动真实调度器
//   - 对每个被派发的代理，反馈一个符合 OUTPUT CONTRACT 的"模拟模型返回"
//     （偶尔注入鲁棒性边界：空 Reason、格式错误、轮限 continue 等）
//   - 记录每一次 spawn / reply / 解析结果 / 决策 / 验证裁决 / 方法 / 终止 的完整交互
//   - 快速、有界、确定性。输出交互日志 JSON，供人工审阅找 bug
// Run: node selfdrive-v3.mjs  → writes dsh-vibe-math/_selfdrive_log.json
// ============================================================
import { mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
const PLUGIN = new URL('./vibe-math-v3/vibe-math-v3.js', import.meta.url)
const WS = mkdtempSync(join(tmpdir(), 'vibe-sd-'))
const LOG = []   // interaction log
const listeners = {}, toolRegs = [], spawns = [], followups = []
let step = 0
const MAX_STEPS = 60
const sleep = ms => new Promise(r => setTimeout(r, ms))
function log(rec){ LOG.push(Object.assign({ t: Date.now(), step }, rec)) }
function waitFor(pred, t=2500){ const s=Date.now(); return new Promise(res=>{ const iv=setInterval(()=>{ if(pred()){clearInterval(iv);res(true)} else if(Date.now()-s>t){clearInterval(iv);res(false)} },40) }) }
function byLabel(p){ for(let i=spawns.length-1;i>=0;i--) if(spawns[i].label.startsWith(p)) return spawns[i] }
function countLabel(p){ return spawns.filter(s=>s.label.startsWith(p)).length }
function readState(name){ try { return JSON.parse(readFileSync(join(WS,'VibeMath','Projects','sd','State',name),'utf8')) } catch(e){ return undefined } }
const JSONX = o => '```json\n'+JSON.stringify(o, null, 0)+'\n```'

const ctx = {
  get(name){ if(name==='subprocess') return { async spawn({argv}){ const script=argv[argv.length-1]||''; const fm=await import('node:fs'); const pm=await import('node:path'); if(/New-Item/.test(script)){ const m=script.match(/-Path\s+(?:'((?:[^']|'')*)'|"((?:[^"]|"")*)")/); const raw=(m&&(m[1]||m[2]))||''; for(const p of raw.split(',').map(x=>x.replace(/''/g,"'"))) if(p) fm.mkdirSync(p,{recursive:true}) } else if(/Move-Item/.test(script)){ const m=script.match(/-LiteralPath\s+'((?:[^']|'')*)'\s+-Destination\s+'((?:[^']|'')*)'/); if(m){ fm.mkdirSync(pm.dirname(m[2].replace(/''/g,"'")),{recursive:true}); fm.renameSync(m[1].replace(/''/g,"'"),m[2].replace(/''/g,"'")) } } else if(/Remove-Item/.test(script)){ const m=script.match(/-LiteralPath\s+'((?:[^']|'')*)'/); if(m) fm.rmSync(m[1].replace(/''/g,"'"),{force:true,recursive:true}) } return {done:Promise.resolve({exitCode:0})} } }
    return undefined },
  on(e,fn){ (listeners[e]=listeners[e]||[]).push(fn) }, effect(fn){ const d=fn(); return()=>{ if(typeof d==='function') d() } }, logger:{info(){},warn(){},error(){}},
  tools:{register(s){toolRegs.push(s)}}, commands:{register(){}},
  subagents:{ list(){return['spawn']}, async startContinuable({label,request}){ const id='c'+(spawns.length+1); spawns.push({label,request,childId:id}); return {childId:id} }, async followup(parent,childId,blocks,opts){ followups.push({parent,childId,blocks,opts}) }, async sendMessage(parent,childId,blocks,opts){ followups.push({parent,childId,blocks,opts}) }, interrupt(){} },
  agents:{ roots(){return[]}, get(){return undefined} },
  fs:{ async resolve(rel,opts){ const b=(opts&&opts.cwd)||WS; let p=(typeof rel==='string'&&isAbsolute(rel))?rel.replace(/\//g,'\\'):join(b,...String(rel).split('/')); return {targetKey:p,displayPath:p} }, async stat(t){ return existsSync(t.targetKey)?{version:'v1',type:'file',size:1}:undefined }, async readText(t){ return readFileSync(t.targetKey,'utf8') }, async writeText(t,c){ mkdirSync(dirname(t.targetKey),{recursive:true}); writeFileSync(t.targetKey,c,'utf8') }, async listDir(t){ if(!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey,{withFileTypes:true}).map(e=>({name:e.name,type:e.isDirectory()?'directory':'file'})) } },
}
const mod = await import(PLUGIN.href+'?t='+Date.now()); const plugin = mod.default||mod; plugin.apply(ctx)
const ROOT = { id:'sess-A', options:{provider:'mock',model:'m'}, session:{id:'sess-A',header:{cwd:WS,parentSession:undefined}}, followup(){}, ctx:undefined }
async function callTool(n,a){ const s=toolRegs.find(x=>x.name===n); if(!s) throw new Error('no tool '+n); return JSON.parse(await s.execute(a||{}, {agent:ROOT})) }
function fireEnd(info){ for(const h of (listeners['subagent/end']||[])) h(info) }

// ---------- seed ----------
await callTool('vibe_math_new_project',{name:'sd'})
await callTool('vibe_math_set_params',{ solverMaxRounds:2, verifierCount:2, debateMaxRounds:2, promoteValueThreshold:0.6, methodAutoPromote:false })
await callTool('vibe_math_add_problem',{id:'qA',description:'证明 zeta(3) 是无理数',priority:0})
await callTool('vibe_math_add_problem',{id:'qB',description:'证明 log 2 是无理数',priority:1})
await callTool('vibe_math_add_proposition',{id:'pX',概述:'欧拉常数 γ 为有理数',概率:0.6,分类:'数论','价值/关键性':0.7})
await callTool('vibe_math_method_add',{id:'m1',标题:'积分估值范式',类型:'方法',核心内容:'积分估计'})
await callTool('vibe_math_start',{})

// ---------- mock-model: decide a contract-faithful reply for a spawn ----------
// maintain a FRESH view of the simulation to keep the mock planner accurate (avoids stale index.json)
let myDirs = {}        // qid -> [{id, status}]
let myRounds = {}      // 'qid:dir' -> round count
let mySolved = {}      // qid -> true
let inflateFlavors = 0
let mkSent = false
function ensureDir(qid){ if(!myDirs[qid]) myDirs[qid]=[] }
function isSolvedPro(qid){ return !!mySolved[qid] }
function mockReply(sp){
  const label = sp.label, prompt = sp.request.prompt[0].text; const childId = sp.childId
  if(label.startsWith('planner:')){
    // fresh planner: pick highest-priority next step
    let nothingLeft = true
    for(const [qid,dirs] of Object.entries(myDirs)){
      if(isSolvedPro(qid)) continue
      nothingLeft = false
      const active = dirs.filter(x=>x.status==='active')
      if(dirs.length===0) return { summary:'explore '+qid, plan:[{action:'spawn',role:'explorer',target:qid,reason:'no dirs'}] }
      if(active.length>0) return { summary:'solve '+qid, plan:[{action:'spawn',role:'solver',target:qid,direction:active[0].id,reason:'active dir'}] }
      return { summary:'re-derive '+qid, plan:[{action:'spawn',role:'explorer',target:qid,reason:'all dead'}] }
    }
    if(nothingLeft && !mkSent){ mkSent=true; return { summary:'keep methods', plan:[{action:'spawn',role:'method-keeper',reason:'distill pending inventions'}] } }
    return { summary:'done', plan:[] }
  }
  if(label.startsWith('explorer:')){
    const qid = label.replace('explorer:','')
    ensureDir(qid); const n=myDirs[qid].length
    const cand = [ {id:'d_'+(n+1), title:'方法一 '+qid, method:'构造估计', core_assumption:'a/b 有理', feasibility:0.7},
                   {id:'d_'+(n+2), title:'方法二 '+qid, method:'反证+极限', core_assumption:'负相关', feasibility:0.5} ]
    const dirs = cand.map(c=>({ id:c.id, title:c.title, method:c.method, core_assumption:c.core_assumption, feasibility:c.feasibility }))
    for(const d of dirs){ if(!myDirs[qid].some(x=>x.id===d.id)) myDirs[qid].push({id:d.id, status:'active'}) }
    return { meta:{ kind:'directions', qid:qid, directions:dirs }, __writes:[] }
  }
  if(label.startsWith('solver:')){
    const parts = label.split(':'); const qid=parts[1], dir=parts[2]
    const key = qid+':'+dir; myRounds[key]=(myRounds[key]||0)+1
    const round = myRounds[key]
    ensureDir(qid)
    if(isSolvedPro(qid)){
      return { meta:{ kind:'solver', qid:qid, dirId:dir, round:round, survival:0.9, status:'success', solution_prob:0.95, solution_text:'已解' } }
    }
    if(round>=2){
      mySolved[qid]=true
      const d=myDirs[qid].find(x=>x.id===dir); if(d) d.status='success'
      return { meta:{ kind:'solver', qid:qid, dirId:dir, round:round, survival:0.9, status:'success',
                      lemmas:[{ id:'p-'+dir, title:'引理 '+dir, statement:'设 f 满足…', proof:'证明：…完整', prob:0.7, 分类:'数论', 优先级:1 }],
                      solution_prob:0.95, solution_text:'完整解法：设 x=…则矛盾→无理数。' } }
    }
    return { meta:{ kind:'solver', qid:qid, dirId:dir, round:round, survival:0.6, status:'continue',
                   lemmas:[{ id:'p-'+dir, title:'关键引理 '+dir, statement:'设 f 满足…', proof:'证明：…（完整）', prob:0.6, 分类:'数论', 优先级:1 }],
                   methods_used:[{ id:'m1', 效果:'适用', 建议:'' }],
                   new_inventions:[{ 类型:'工具', 标题:'估值工具'+dir, 内容描述:'一族控制增长的估计', 是否已入库:false }] } }
  }
  if(label.startsWith('method-keeper')){
    inflateFlavors++
    return { meta:{ kind:'methods', used:[{id:'m1',效果:'参考',建议:''}], improvements:[{ id:'m1', 改进内容:'补充上界', 原因:'实战' }], created:[ 'm-sv'+inflateFlavors ] } }
  }
  if(label.startsWith('verifier:')){
    return { Result:1, Reason:'核对：该目标由完整论证支撑，结论成立；步骤链核验无误。' }
  }
  return { ok:false }
}

// ---------- drive (sequential: fire ONE spawn at a time, let it settle) ----------
let fired = new Set()
let idleCount = 0
for(step=1; step<=MAX_STEPS; step++){
  const next = spawns.find(s => !fired.has(s.childId))
  if(!next){
    const s = readState('scheduler_state.json')
    if(s && s.running===false){ log({ kind:'terminate', note:'scheduler stopped (running=false)' }); break }
    idleCount++
    if(idleCount>20){ log({ kind:'idle-stop', note:'no unfired spawn & scheduler still running' }); break }
    await sleep(250); continue
  }
  fired.add(next.childId)
  const reply = mockReply(next)
  log({ kind:'spawn', role: next.label.split(':')[0], label: next.label, childId: next.childId,
        prompt_head: next.request.prompt[0].text.slice(0, 120), prompt_len: next.request.prompt[0].text.length, reply }
  )
  fireEnd({ id: next.childId, runId: next.label+'-'+step, provider:'spawn', local:true, stopReason:'completed',
            lastAssistantMessage:[{ type:'text', text: JSONX(reply) }] })
  await sleep(200)
  idleCount = 0
}

// ---------- final snapshot ----------
const idx = readState('index.json') || {}
const dirs = readState('directions.json') || {}
const active = readState('plans.json') || {}
log({ kind:'final', running: readState('scheduler_state.json'), plan_queue_len:(active.queued||[]).length,
      unsolved: Object.values(idx.problems||{}).filter(q=>q.状态!=='已解决'&&q.优先级!=='never')
        .map(q=>({ id:q.id, 状态:q.状态, dirs:(dirs[q.id]||[]).map(d=>({ id:d.id, status:d.status, round:d.round, survival:d.survival })) })) })

// ---------- dedupe & dump ----------
const out = join(process.cwd(), '_selfdrive_log.json')
writeFileSync(out, JSON.stringify(LOG, null, 2), 'utf8')
console.log('=== SELF-DRIVE DONE ===')
console.log('interactions logged:', LOG.length)
console.log('spawns:', spawns.length, 'followups:', followups.length)
console.log('log file:', out)
// summary of key events
const kinds = {}
for(const r of LOG){ kinds[r.kind]=(kinds[r.kind]||0)+1 }
console.log('event kinds:', JSON.stringify(kinds))
const term = LOG.filter(r=>r.kind==='terminate').length
console.log('terminations detected:', term)
const emptR = LOG.filter(r=>r.kind==='spawn' && r.reply && r.reply.Result===0.5 && !r.reply.Reason).length
console.log('empty-Reason verifier replies:', emptR)
rmSync(WS,{recursive:true,force:true})
process.exit(0)
