// ============================================================
// Vibe-Math-V4 SELF-DRIVING TEST — drives the real vibe-v4 plugin with a mock
// host, feeding simulated resident replies based on each wake's prompt kind.
// Validates: spawn N residents → brainstorm → self-organize (normal/meeting) →
// unanimous verification (all-TRUE → Verified/) → stop ONLY when all agree solved.
// Run: node selfdrive-v4.mjs  (temp workspace; assertions; exit code)
// ============================================================
import { mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
const PLUGIN = new URL('./vibe-math-v4/vibe-math-v4.js', import.meta.url)
const WS = mkdtempSync(join(tmpdir(), 'vibe-v4-'))
const listeners = {}, toolRegs = [], spawns = [], followups = []
let passed = 0, failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; console.error('  FAIL - ' + m) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(pred, t=6000){ const s=Date.now(); return new Promise(res=>{ const iv=setInterval(()=>{ if(pred()){clearInterval(iv);res(true)} else if(Date.now()-s>t){clearInterval(iv);res(false)} },60) }) }
const ctx = {
  get(name){
    if(name==='subprocess') return { async spawn({argv}){ const script=argv[argv.length-1]||''; const fm=await import('node:fs'); const pm=await import('node:path'); if(/New-Item/.test(script)){ const m=script.match(/-Path\s+(?:'((?:[^']|'')*)'|"((?:[^"]|"")*)")/); const raw=(m&&(m[1]||m[2]))||''; for(const p of raw.split(',').map(x=>x.replace(/''/g,"'"))) if(p) fm.mkdirSync(p,{recursive:true}) } else if(/Move-Item/.test(script)){ const m=script.match(/-LiteralPath\s+'((?:[^']|'')*)'\s+-Destination\s+'((?:[^']|'')*)'/); if(m){ fm.mkdirSync(pm.dirname(m[2].replace(/''/g,"'")),{recursive:true}); fm.renameSync(m[1].replace(/''/g,"'"),m[2].replace(/''/g,"'")) } } else if(/Remove-Item/.test(script)){ const m=script.match(/-LiteralPath\s+'((?:[^']|'')*)'/); if(m) fm.rmSync(m[1].replace(/''/g,"'"),{force:true,recursive:true}) } return {done:Promise.resolve({exitCode:0})} } }
    return undefined
  },
  on(e,fn){ (listeners[e]=listeners[e]||[]).push(fn) }, effect(fn){ const d=fn(); return()=>{ if(typeof d==='function') d() } }, logger:{info(){},warn(){},error(){}},
  timeout(cb,ms){ const h=setTimeout(cb,ms); return ()=>clearTimeout(h) },
  tools:{register(s){toolRegs.push(s)}}, commands:{register(){}},
  // Real DSH exposes ONLY subagents.sendMessage for continuable wakes (followup is an Agent method, not
  // a subagents service method). Deliberately NO followup here so a regression to subagents.followup fails.
  subagents:{ list(){return['spawn']}, async startContinuable({label,request}){ const id='c'+(spawns.length+1); spawns.push({label,request,childId:id}); return {childId:id} }, async sendMessage(parent,childId,blocks,opts){ followups.push({childId,blocks}) }, interrupt(){} },
  agents:{ roots(){return[]}, get(id){ return id==='sess-A' ? ROOT : undefined } },
  fs:{ async resolve(rel,opts){ const b=(opts&&opts.cwd)||WS; let p=(typeof rel==='string'&&isAbsolute(rel))?rel.replace(/\//g,'\\'):join(b,...String(rel).split('/')); return {targetKey:p,displayPath:p} }, async stat(t){ return existsSync(t.targetKey)?{version:'v1',type:'file',size:1}:undefined }, async readText(t){ return readFileSync(t.targetKey,'utf8') }, async writeText(t,c){ mkdirSync(dirname(t.targetKey),{recursive:true}); writeFileSync(t.targetKey,c,'utf8') }, async listDir(t){ if(!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey,{withFileTypes:true}).map(e=>({name:e.name,type:e.isDirectory()?'directory':'file'})) } },
}
const mod = await import(PLUGIN.href+'?t='+Date.now()); const plugin = mod.default||mod; plugin.apply(ctx)
const ROOT = { id:'sess-A', options:{provider:'mock',model:'m'}, session:{id:'sess-A',header:{cwd:WS,parentSession:undefined}}, followup(){}, ctx:undefined }
async function callTool(n,a,agent){ const s=toolRegs.find(x=>x.name===n); if(!s) throw new Error('no tool '+n); return JSON.parse(await s.execute(a||{}, {agent:agent||ROOT})) }
// a resident agent object whose parent chain resolves to the root session (so it
// routes to the SAME session as ROOT), enabling per-resident tool routing tests.
function resAgent(childId){ return { id: childId, session:{ id: childId, header:{ cwd:WS, parentSession:'sess-A' } } } }
const rIdOfChild = (()=>{ const m={}; return (cid)=>{ for(const sp of spawns) m[sp.childId]=sp.label; return m[cid] } })()
function fireEnd(info){ for(const h of (listeners['subagent/end']||[])) h(info) }
const JSONX = o => '```json\n'+JSON.stringify(o)+'\n```'
function classWake(promptText){ if(/meeting is in progress/i.test(promptText)) return 'meeting'; if(/verifying object/i.test(promptText)) return 'verify'; return 'normal' }

// ---------- start ----------
console.log('-- V4 self-drive: start --')
const st = await callTool('vibe_v4_start', { problem: '证明 π 是无理数（Niven 积分类似方法）', residentCount: 3 })
// boundary-A: the fairness wake is now a gated heartbeat; drive it with a short timeout
await callTool('vibe_v4_set', { activityTimeoutMs: 40 })
assert(st.ok === true, 'v4 start ok (message=' + st.message + ')')
await waitFor(()=>spawns.length>=3, 3000)
assert(spawns.length >= 3, 'start spawned >=3 residents (got ' + spawns.length + ')')

// ---------- brainstorm replies (each records one proposition + insight) ----------
let spawnIdx = 0
let verifyTriggered = false
let step = 0
const MAX = 300
let autoDoneSeen = false
async function driveOne(){
  // process next brainstorm spawn if any
  if(spawnIdx < spawns.length){
    const sp = spawns[spawnIdx]; spawnIdx++
    const rId = sp.label
    // resident records a proposition to its own (current) library
    const rec = await callTool('vibe_v4_record_proposition', { id: 'p-'+rId, title: '引理 '+rId, statement: '设 f 满足…', proof: '证明：…（完整）', prob: 0.7, value: 0.6, motivation: '用于证明 π 无理' })
    lastRec = rec
    fireEnd({ id: sp.childId, runId: 'br-'+rId, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({ summary: '我的见解：用积分构造矛盾；' + rId, solved:false })}] })
    return true
  }
  // next followup (normal/meeting/verify)
  if(followups.length > followupIdx){
    const fu = followups[followupIdx]; followupIdx++
    const promptText = (fu.blocks&&fu.blocks[0]&&fu.blocks[0].text)||''
    const kind = classWake(promptText)
    let reply
    if(kind==='verify'){ vWakes++; reply = { vote:{ verdict:1, reason:'核对：该对象由完整论证支撑，成立。' } } }
    else if(kind==='meeting'){ mWakes++; reply = { input:'我同意：原问题已解决。', voteSolved:true, propose_verify:null } }
    else { // normal
      nWakes++
      if(!verifyTriggered){ verifyTriggered = true; reply = { summary:'推进方向，建议验证 '+verifyTarget+'.', solved:false, propose_verify: verifyTarget } }
      else if(!meetProposed){ meetProposed = true; reply = { summary:'我认为已接近解决，建议开会表决。', solved:false, propose_verify:null, propose_meeting:'是否认为原问题已解决？', propose_task:'进一步验证关键引理', task_desc:'由常驻协作验证并完善证明', contextPct: 82 } }
      else { reply = { summary:'继续推进。', solved:false, propose_verify:null } }
    }
    fireEnd({ id: fu.childId, runId:'w'+followupIdx, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX(reply)}] })
    return true
  }
  return false
}
let followupIdx = 0
let lastRec = null
let mWakes = 0, vWakes = 0, nWakes = 0, meetProposed = false
let verifyTarget = 'p-r-3' // the resident that currentResident routed the brainstorm record to (last spawned)
for(step=0; step<MAX; step++){
  const did = await driveOne()
  const s0 = await callTool('vibe_v4_status', {})
  if(s0.autoDone){ autoDoneSeen = true; break }
  if(did){ await sleep(130); continue }
  // no new wake: gentle settle
  await sleep(200)
  const s2 = await callTool('vibe_v4_status', {})
  if(s2.autoDone){ autoDoneSeen = true; break }
}
const final = await callTool('vibe_v4_status', {})
console.log('-- results --')
assert(final.autoDone === true, 'v4 stops only when all residents agree solved (autoDone=' + final.autoDone + ')')
assert(final.running === false, 'scheduler halted after unanimous solved (running=' + final.running + ')')
assert(final.residentCount === 3, '3 residents alive')
console.log('residents:', final.residents.map(r=>r.id+'@'+r.status).join(', '))
// check a Verified card exists for the verify target (unanimous TRUE)
let verifiedExists = false
try { verifiedExists = existsSync(join(WS,'VibeMath','Projects','default','Verified','命题', verifyTarget + '.md')) } catch(e){}
assert(verifiedExists, 'unanimous TRUE → Verified/命题/' + verifyTarget + '.md written')
// check per-resident proposition library (target resident)
const prop = readFileSync(join(WS,'VibeMath','Projects','default','Propos','r-3','p-r-3.md'),'utf8')
assert(prop.includes('- 价值程度: 0.6') && prop.includes('- 动机用途计划'), 'resident proposition carries 价值程度 + 动机用途计划')
// task board: a resident proposed a task → it lands on the board (open)
const tasks = await callTool('vibe_v4_list_tasks', {})
assert(Array.isArray(tasks.tasks) && tasks.tasks.some(t=>t.title.includes('进一步验证关键引理')), 'task board has proposed open task')

// ============================================================
// EXTRA COVERAGE — the bugs the happy-path cannot catch.
// ============================================================
let fuIdx = followups.length
async function nextFollowup(ms=4000){ const s=Date.now(); while(Date.now()-s<ms){ if(fuIdx<followups.length){ return followups[fuIdx++] } await sleep(40) } return null }

console.log('-- V4 self-drive: A1 context-percent + compact directive --')
const sc1Base = spawns.length
await callTool('vibe_v4_start', { problem: '压缩测试', residentCount: 1 })
await waitFor(()=>spawns.length===sc1Base+1, 2000)
await callTool('vibe_v4_set', { compactAfterRounds: 2 })
const c1 = spawns[spawns.length-1] // r-1
fireEnd({ id: c1.childId, runId:'br', provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins', solved:false})}] })
let fu = await nextFollowup()
assert(fu!==null && /researcher/i.test(fu.blocks[0].text), 'A1: got a fairness wake after brainstorm')
// round 1: report high context (82) but no meeting/verify → framework should store it as a PERCENT
fireEnd({ id: fu.childId, runId:'w1', provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'do', solved:false, contextPct:82})}] })
let st1 = await callTool('vibe_v4_status', {})
const rr1 = st1.residents.find(x=>x.id==='r-1')
assert(rr1 && rr1.contextPct===82, 'A1: contextPct stored as percent 82 (got '+(rr1&&rr1.contextPct)+')')
// round 2: the next wake must carry the [CONTEXT COMPACT] directive (82 >= 66)
fu = await nextFollowup()
assert(fu!==null && /CONTEXT COMPACT/.test(fu.blocks[0].text), 'A1: [CONTEXT COMPACT] directive injected when contextPct>=threshold')
fireEnd({ id: fu.childId, runId:'w2', provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'condensed', solved:false, contextPct:10, compacted:true})}] })
st1 = await callTool('vibe_v4_status', {})
const rr2 = st1.residents.find(x=>x.id==='r-1')
assert(rr2 && rr2.contextPct<=15, 'A1: contextPct reset to ~10 after compact (got '+(rr2&&rr2.contextPct)+')')

console.log('-- V4 self-drive: A2 per-resident routing + A3 readProgress --')
const sc2Base = spawns.length
await callTool('vibe_v4_start', { problem: '路由测试', residentCount: 2 })
await waitFor(()=>spawns.length===sc2Base+2, 2000)
const latest = spawns.slice(sc2Base) // [r-1, r-2]
await callTool('vibe_v4_record_proposition', { id:'p-routetest', title:'T', statement:'s', prob:0.5, value:0.5, motivation:'m' }, resAgent(latest[0].childId))
assert(existsSync(join(WS,'VibeMath','Projects','default','Propos','r-1','p-routetest.md')), 'A2: proposition recorded to r-1 (the caller)')
assert(!existsSync(join(WS,'VibeMath','Projects','default','Propos','r-2','p-routetest.md')), 'A2: NOT recorded to r-2 (previous currentResident trap)')
await callTool('vibe_v4_publish_progress', { content:'from r2' }, resAgent(latest[1].childId))
const pr2 = readFileSync(join(WS,'VibeMath','Projects','default','Progress','r-2','progress.md'),'utf8')
assert(pr2.includes('from r2'), 'A2: r-2 progress written to its own library')
const rp = await callTool('vibe_v4_read_progress', { id:'r-2' })
assert(typeof rp.text==='string' && rp.text.includes('from r2'), 'A3: readProgress returns real text string (got '+(typeof rp.text)+')')

console.log('-- V4 self-drive: A4 resume re-spawns after cross-process --')
const vib = WS.replace(/\\/g,'/')+'/VibeMath/Projects/default'
mkdirSync(vib+'/State', { recursive: true })
writeFileSync(vib+'/State/residents.json', JSON.stringify({ 'r-1':{rId:'r-1',childId:'STALE-CHILD',direction:'d',status:'active',rounds:3,roundsSinceCompact:0,lastActiveAt:0,insight:'x',contextPct:40,contextSeed:'',needCompact:false} }))
writeFileSync(vib+'/State/session.json', JSON.stringify({ running:true, autoDone:false, phase:'active', problemId:'p', problemText:'prove', runId:'run', meetings:[], reports:[], lastActivityAt:Date.now(), activityLog:[], processEpoch:'OLD-EPOCH' }))
const beforeRespawn = spawns.length
const rres = await callTool('vibe_v4_resume', {})
assert(rres.ok===true, 'A4: resume returns ok')
assert(spawns.length>beforeRespawn, 'A4: cross-process resume re-spawns residents (stale childId cleared; +'+(spawns.length-beforeRespawn)+')')

console.log('-- V4 self-drive: B1 broadcast(all) actually delivers --')
const sc5Base = spawns.length
await callTool('vibe_v4_start', { problem: '广播测试', residentCount: 2 })
await waitFor(()=>spawns.length===sc5Base+2, 2000)
// finish brainstorm so the two residents become idle, then broadcast should wake them
for(const sp of spawns.slice(sc5Base)){ fireEnd({ id: sp.childId, runId:'br-'+sp.label, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins '+sp.label, solved:false})}] }) }
await sleep(250)
const beforeBroadcast = followups.length
const bres = await callTool('vibe_v4_message', { to:'all', content:'全体注意' })
await sleep(250)
const newFollowups = followups.length - beforeBroadcast
let mailboxHit = false
try { const mb = JSON.parse(readFileSync(join(WS,'VibeMath','Projects','default','State','mailboxes.json'),'utf8')); mailboxHit = Object.values(mb).some(arr=>Array.isArray(arr)&&arr.some(m=>String(m.content||'').includes('全体注意'))) } catch(e){}
assert(bres.ok===true && /to 2 resident\(s\)/.test(bres.message) && (newFollowups>=1 || mailboxHit), 'B1: broadcast(all) actually delivered (message='+bres.message+', wake='+newFollowups+', mailboxHit='+mailboxHit+')')

console.log('-- V4 self-drive: C1 addMember after removeMember has no id collision --')
const sc6Base = spawns.length
await callTool('vibe_v4_start', { problem:'增删测试', residentCount:2 })
await waitFor(()=>spawns.length===sc6Base+2, 2000)
await callTool('vibe_v4_remove_member', { id:'r-1' })
const addRes = await callTool('vibe_v4_add_member', { direction:'new' })
assert(addRes.ok===true && addRes.id==='r-3', 'C1: addMember after removeMember gets non-colliding id (got '+(addRes&&addRes.id)+')')

console.log('-- V4 self-drive: B1 verdictMaxRounds & meetingKeepEvery settable + shown --')
await callTool('vibe_v4_set', { verdictMaxRounds: 1, meetingKeepEvery: 3 })
const b1st = await callTool('vibe_v4_status', {})
assert(/verdictMaxRounds=1/.test(b1st.params) && /meetingKeepEvery=3/.test(b1st.params), 'B1: verdictMaxRounds & meetingKeepEvery shown in status (params='+b1st.params+')')

console.log('=== V4 SELF-DRIVE RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
rmSync(WS,{recursive:true,force:true}); process.exit(failed>0?1:0)
