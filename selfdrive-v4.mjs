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
  tools:{register(s){toolRegs.push(s)}}, commands:{register(){}},
  subagents:{ list(){return['spawn']}, async startContinuable({label,request}){ const id='c'+(spawns.length+1); spawns.push({label,request,childId:id}); return {childId:id} }, async followup(parent,childId,blocks,opts){ followups.push({childId,blocks}) }, interrupt(){} },
  agents:{ roots(){return[]}, get(){return undefined} },
  fs:{ async resolve(rel,opts){ const b=(opts&&opts.cwd)||WS; let p=(typeof rel==='string'&&isAbsolute(rel))?rel.replace(/\//g,'\\'):join(b,...String(rel).split('/')); return {targetKey:p,displayPath:p} }, async stat(t){ return existsSync(t.targetKey)?{version:'v1',type:'file',size:1}:undefined }, async readText(t){ return readFileSync(t.targetKey,'utf8') }, async writeText(t,c){ mkdirSync(dirname(t.targetKey),{recursive:true}); writeFileSync(t.targetKey,c,'utf8') }, async listDir(t){ if(!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey,{withFileTypes:true}).map(e=>({name:e.name,type:e.isDirectory()?'directory':'file'})) } },
}
const mod = await import(PLUGIN.href+'?t='+Date.now()); const plugin = mod.default||mod; plugin.apply(ctx)
const ROOT = { id:'sess-A', options:{provider:'mock',model:'m'}, session:{id:'sess-A',header:{cwd:WS,parentSession:undefined}}, followup(){}, ctx:undefined }
async function callTool(n,a){ const s=toolRegs.find(x=>x.name===n); if(!s) throw new Error('no tool '+n); return JSON.parse(await s.execute(a||{}, {agent:ROOT})) }
function fireEnd(info){ for(const h of (listeners['subagent/end']||[])) h(info) }
const JSONX = o => '```json\n'+JSON.stringify(o)+'\n```'
function classWake(promptText){ if(/meeting is in progress/i.test(promptText)) return 'meeting'; if(/verifying object/i.test(promptText)) return 'verify'; return 'normal' }

// ---------- start ----------
console.log('-- V4 self-drive: start --')
const st = await callTool('vibe_v4_start', { problem: '证明 π 是无理数（Niven 积分类似方法）', residentCount: 3 })
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
    if(kind==='verify'){ vWakes++; reply = { vote:{ verdict:'TRUE', confidence:0.9, reason:'核对：该对象由完整论证支撑，成立。' } } }
    else if(kind==='meeting'){ mWakes++; reply = { input:'我同意：原问题已解决。', voteSolved:true, propose_verify:null } }
    else { // normal
      nWakes++
      if(!verifyTriggered){ verifyTriggered = true; reply = { summary:'推进方向，建议验证 '+verifyTarget+'.', solved:false, propose_verify: verifyTarget } }
      else if(!meetProposed){ meetProposed = true; reply = { summary:'我认为已接近解决，建议开会表决。', solved:false, propose_verify:null, propose_meeting:'是否认为原问题已解决？' } }
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
console.log('=== V4 SELF-DRIVE RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
rmSync(WS,{recursive:true,force:true}); process.exit(failed>0?1:0)
