// e2e-v4-fixes.test.mjs — verifies the v1.3.3 fixes that need a driven verify
// (A1 non-unanimous write-back, A2 method label, A3 abort->resume, B2 recordProposition
// auto-sync). Each scenario runs on a FRESH mock host instance, so the shared
// followups-array accumulation that makes the self-drive flaky does not apply.
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
const PLUGIN = new URL('./vibe-math-v4/vibe-math-v4.js', import.meta.url)
const sleep = ms => new Promise(r => setTimeout(r, ms))
let passed = 0, failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; console.error('  FAIL - ' + m) } }
async function waitFor(pred, t=4000){ const s=Date.now(); return new Promise(res=>{ const iv=setInterval(()=>{ if(pred()){clearInterval(iv);res(true)} else if(Date.now()-s>t){clearInterval(iv);res(false)} },40) }) }
const JSONX = o => '```json\n'+JSON.stringify(o)+'\n```'

function makeCtx(){
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v4fix-'))
  const listeners = {}, toolRegs = [], spawns = [], followups = []
  const subprocessMock = { async spawn(){ return {done:Promise.resolve({exitCode:0})} } }
  let ROOT
  const ctx = {
    get(name){ return name==='subprocess' ? subprocessMock : undefined },
    on(e,fn){ (listeners[e]=listeners[e]||[]).push(fn) }, effect(fn){ const d=fn(); return()=>{ if(typeof d==='function') d() } }, logger:{info(){},warn(){},error(){}},
    timeout(cb,ms){ const h=setTimeout(cb,ms); return ()=>clearTimeout(h) },
    tools:{register(s){toolRegs.push(s)}}, commands:{register(){}},
    subagents:{ list(){return['spawn']}, async startContinuable({label,request}){ const id='c'+(spawns.length+1); spawns.push({label,request,childId:id}); return {childId:id} }, async followup(parent,childId,blocks,opts){ followups.push({childId,blocks}) }, interrupt(){} },
    agents:{ roots(){return[]}, get(id){ return id==='sess-A' ? ROOT : undefined } },
    fs:{ async resolve(rel,opts){ const b=(opts&&opts.cwd)||WS; return {targetKey:join(b,...String(rel).split('/')),displayPath:'x'} }, async stat(t){ return existsSync(t.targetKey)?{version:'v1',type:'file',size:1}:undefined }, async readText(t){ return readFileSync(t.targetKey,'utf8') }, async writeText(t,c){ mkdirSync(dirname(t.targetKey),{recursive:true}); writeFileSync(t.targetKey,c,'utf8') }, async listDir(t){ return [] } },
  }
  ROOT = { id:'sess-A', options:{provider:'mock',model:'m'}, session:{id:'sess-A',header:{cwd:WS,parentSession:undefined}}, followup(){}, ctx:undefined }
  return { WS, ctx, toolRegs, spawns, followups,
    callTool: async function(n,a){ const s=toolRegs.find(x=>x.name===n); if(!s) throw new Error('no tool '+n); return JSON.parse(await s.execute(a||{}, {agent:ROOT})) },
    callToolAs: async function(n,a,cid){ const s=toolRegs.find(x=>x.name===n); const agent={id:cid, session:{id:cid, header:{cwd:WS, parentSession:'sess-A'}}}; return JSON.parse(await s.execute(a, {agent})) },
    resAgent: (cid)=>({ id:cid, session:{ id:cid, header:{ cwd:WS, parentSession:'sess-A' } } }),
    fireEnd: function(info){ for(const h of (listeners['subagent/end']||[])) h(info) },
  }
}

// ================= T1: A1 non-unanimous verify writes avg prob back =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T1 A1 non-unanimous verify write-back --')
  await m.callTool('vibe_v4_start', { problem:'非全票验证', residentCount:2 })
  await waitFor(()=>m.spawns.length>=2)
  await m.callTool('vibe_v4_set', { verdictMaxRounds: 1, activityTimeoutMs: 40 })
  await m.callToolAs('vibe_v4_record_proposition', { id:'p-mixed', title:'混合', statement:'s', prob:0.6, value:0.5, motivation:'m' }, m.spawns[0].childId)
  for(const sp of m.spawns){ m.fireEnd({ id: sp.childId, runId:'br-'+sp.label, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins', solved:false})}] }); await sleep(80) }
  const ridOf = (cid)=>{ for(const sp of m.spawns) if(sp.childId===cid) return sp.label; return '' }
  let fi=0, proposed=false
  for(let i=0;i<300;i++){
    if(fi>=m.followups.length){ await sleep(40); const s0=await m.callTool('vibe_v4_status',{}); if(s0.autoDone||s0.running===false) break; continue }
    const fu=m.followups[fi++]; const rid=ridOf(fu.childId); const pt=(fu.blocks&&fu.blocks[0]&&fu.blocks[0].text)||''; const k=/verifying object/i.test(pt)?'verify':/meeting is in progress/i.test(pt)?'meeting':'normal'
    let reply
    if(k==='verify'){ reply={ vote:(rid==='r-1')?{verdict:'TRUE',confidence:0.9,reason:'支持'}:{verdict:'FALSE',confidence:0.9,reason:'反对'} } }
    else if(k==='meeting'){ reply={input:'x', voteSolved:null} }
    else { reply = proposed ? {summary:'继续',solved:false} : (proposed=true,{summary:'建议验证',solved:false,propose_verify:'p-mixed'}) }
    m.fireEnd({ id: fu.childId, runId:'t1-'+i, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX(reply)}] })
    await sleep(30)
  }
  const src = readFileSync(join(m.WS,'VibeMath','Projects','default','Propos','r-1','p-mixed.md'),'utf8')
  const probLine = src.split('\n').find(l=>/^- 概率: /.test(l))
  const stLine = src.split('\n').find(l=>/^- 状态: /.test(l))
  assert(/^- 概率: 0\.5/.test(probLine), 'T1 A1: non-unanimous verify writes avg prob back (line='+probLine+')')
  assert(/^- 状态: 未定论/.test(stLine), 'T1 A1: source stays 未定论 (line='+stLine+')')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T2: A2 method unanimous verify -> 类型: 方法 =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T2 A2 method unanimous verify -> 类型: 方法 --')
  await m.callTool('vibe_v4_start', { problem:'方法验证', residentCount:2 })
  await waitFor(()=>m.spawns.length>=2)
  await m.callTool('vibe_v4_set', { activityTimeoutMs: 40 })
  await m.callToolAs('vibe_v4_record_method', { id:'m-meth', title:'方法', type:'方法', content:'c', value:0.5, motivation:'m' }, m.spawns[0].childId)
  for(const sp of m.spawns){ m.fireEnd({ id: sp.childId, runId:'br-'+sp.label, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins', solved:false})}] }); await sleep(80) }
  let fi=0, proposed=false
  for(let i=0;i<300;i++){
    if(fi>=m.followups.length){ await sleep(40); const s0=await m.callTool('vibe_v4_status',{}); if(s0.autoDone||s0.running===false) break; continue }
    const fu=m.followups[fi++]; const pt=(fu.blocks&&fu.blocks[0]&&fu.blocks[0].text)||''; const k=/verifying object/i.test(pt)?'verify':/meeting is in progress/i.test(pt)?'meeting':'normal'
    let reply
    if(k==='verify'){ reply={ vote:{verdict:'TRUE',confidence:0.9,reason:'成立'} } }
    else if(k==='meeting'){ reply={input:'x', voteSolved:null} }
    else { reply = proposed ? {summary:'继续',solved:false} : (proposed=true,{summary:'建议验证',solved:false,propose_verify:'m-meth'}) }
    m.fireEnd({ id: fu.childId, runId:'t2-'+i, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX(reply)}] })
    await sleep(30)
  }
  const card = join(m.WS,'VibeMath','Projects','default','Verified','命题','m-meth.md')
  assert(existsSync(card), 'T2 A2: method unanimous verification writes a Verified card')
  const text = readFileSync(card,'utf8')
  assert(/^- 类型: 方法/.test(text.split('\n').find(l=>/^- 类型: /.test(l))), 'T2 A2: method verified card labeled 类型: 方法 (not 命题)')
  const methSrc = readFileSync(join(m.WS,'VibeMath','Projects','default','Methods','r-1','m-meth.md'),'utf8')
  assert(/^- 状态: 已验证·真/.test(methSrc.split('\n').find(l=>/^- 状态: /.test(l))), 'T2 A2: source method card marked 已验证·真')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T3: A3 same-process abort -> resume re-spawns =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T3 A3 abort -> resume re-spawns (same process) --')
  await m.callTool('vibe_v4_start', { problem:'abort-resume', residentCount:2 })
  await waitFor(()=>m.spawns.length>=2)
  await m.callTool('vibe_v4_set', { activityTimeoutMs: 40 })
  await m.callTool('vibe_v4_abort', {})
  const before = m.spawns.length
  const r = await m.callTool('vibe_v4_resume', {})
  assert(r.ok===true && m.spawns.length>before, 'T3 A3: same-process abort->resume re-spawns residents (childIds cleared; +'+(m.spawns.length-before)+')')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T4: B2 recordProposition triggers auto-sync meeting =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T4 B2 recordProposition triggers auto-sync meeting --')
  await m.callTool('vibe_v4_start', { problem:'自动同步', residentCount:1 })
  await waitFor(()=>m.spawns.length>=1)
  await m.callTool('vibe_v4_set', { meetingKeepEvery: 1, activityTimeoutMs: 40 })
  const c = m.spawns[m.spawns.length-1]
  m.fireEnd({ id: c.childId, runId:'br-'+c.label, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins', solved:false})}] })
  await sleep(80)
  let fi=0
  const next = async ()=>{ while(fi<m.followups.length){ const f=m.followups[fi++]; if(!(/meeting is in progress/i.test((f.blocks&&f.blocks[0]&&f.blocks[0].text)||''))) return f } return null }
  let fu = await next()
  assert(fu && /researcher/i.test(fu.blocks[0].text), 'T4 B2: got a fairness wake for r-1')
  await m.callToolAs('vibe_v4_record_proposition', { id:'p-sync', title:'同步', statement:'s', prob:0.5, value:0.5, motivation:'m' }, fu.childId)
  m.fireEnd({ id: fu.childId, runId:'t4-w', provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'recorded', solved:false})}] })
  await sleep(60)
  let meetingSeen = m.followups.some(f=>/meeting is in progress/i.test((f.blocks&&f.blocks[0]&&f.blocks[0].text)||''))
  assert(meetingSeen, 'T4 B2: recording a proposition (meetingKeepEvery=1) auto-triggers a syncing meeting')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T5: prompt completeness (background/mission/tools/files) =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T5 prompt completeness --')
  await m.callTool('vibe_v4_start', { problem:'提示词测试', residentCount:2 })
  await waitFor(()=>m.spawns.length>=2)
  const p = m.spawns[0].request.prompt[0].text
  assert(/resident researcher/i.test(p), 'T5: brainstorm prompt names the resident researcher')
  assert(/背景/.test(p) && /工作模式/.test(p) && /你负责的文件/.test(p) && /可用工具/.test(p) && /规则/.test(p), 'T5: prompt has 背景/工作模式/文件/工具/规则 sections')
  assert(/- 概率:/.test(p) && /- 价值程度:/.test(p) && /fs/.test(p) && /直接/.test(p), 'T5: prompt describes file format + direct fs write')
  assert(/vibe_v4_/.test(p) && /\binput\b/.test(p), 'T5: prompt lists the vibe_v4 tools + input relay field')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T6: group-conversation relay (input forwarded to others) =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T6 group-conversation relay --')
  await m.callTool('vibe_v4_start', { problem:'群聊转发', residentCount:2 })
  await waitFor(()=>m.spawns.length>=2)
  await m.callTool('vibe_v4_set', { activityTimeoutMs: 40 })
  for(const sp of m.spawns){ m.fireEnd({ id: sp.childId, runId:'br-'+sp.label, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins', solved:false})}] }); await sleep(80) }
  let fu=null
  for(let i=0;i<60;i++){ if(m.followups.length>0){ fu=m.followups.shift(); break } await sleep(40) }
  assert(fu, 'T6: got a fairness/checkpoint wake after brainstorm')
  m.fireEnd({ id: fu.childId, runId:'t6-w', provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'我推进引理A', input:'大家好，我建议先验证引理A。', solved:false})}] })
  await sleep(150)
  const relayed = m.followups.some(f=>/引理A|群聊/.test((f.blocks&&f.blocks[0]&&f.blocks[0].text)||''))
  assert(relayed, 'T6: resident input is relayed & delivered to the other residents (group chat)')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T7: background told ONCE (brainstorm), not repeated afterwards =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T7 background once / lean afterwards --')
  await m.callTool('vibe_v4_start', { problem:'提示词测试', residentCount:2 })
  await waitFor(()=>m.spawns.length>=2)
  await m.callTool('vibe_v4_set', { activityTimeoutMs: 40 })
  const brain = m.spawns[0].request.prompt[0].text
  assert(/背景/.test(brain) && /可用工具/.test(brain) && /你负责的文件/.test(brain) && /工作模式/.test(brain), 'T7: brainstorm prompt carries the FULL background/mission/tools/files (once)')
  for(const sp of m.spawns){ m.fireEnd({ id: sp.childId, runId:'br-'+sp.label, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins', solved:false})}] }); await sleep(80) }
  let fu=null
  for(let i=0;i<60;i++){ if(m.followups.length>0){ fu=m.followups.shift(); break } await sleep(40) }
  assert(fu && /CHECKPOINT/.test(fu.blocks[0].text), 'T7: got a lean checkpoint wake after brainstorm')
  const hp = fu.blocks[0].text
  assert(!/你负责的文件/.test(hp) && !/可用工具/.test(hp) && !/背景/.test(hp), 'T7: subsequent prompts do NOT repeat the long background (lean, no context bloat)')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T8: configure-then-start (no auto-start) + project name + settings =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T8 configure-then-start + project name + settings --')
  const cfg = await m.callTool('vibe_v4_configure', { project:'myproj', problem:'测试问题ABC', params:{ residentCount:2, activityTimeoutMs:40 } })
  assert(cfg.ok===true && m.spawns.length===0, 'T8: vibe_v4_configure does NOT auto-start/spawn (spawns='+m.spawns.length+')')
  assert(cfg.project==='myproj', 'T8: project name set via configure (project='+cfg.project+')')
  const st = await m.callTool('vibe_v4_status', {})
  assert(/residentCount=2/.test(st.params), 'T8: params set via configure persisted to settings (status='+st.params+')')
  const st2 = await m.callTool('vibe_v4_start', {})
  await waitFor(()=>m.spawns.length>=2, 2000)
  assert(st2.ok===true && m.spawns.length>=2, 'T8: vibe_v4_start (no problem arg) starts with configured problem (spawns='+m.spawns.length+')')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T9: numeric verdict (0-1) classifies TRUE/FALSE =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T9 numeric verdict 0-1 --')
  await m.callTool('vibe_v4_start', { problem:'数值verdict', residentCount:2 })
  await waitFor(()=>m.spawns.length>=2)
  await m.callTool('vibe_v4_set', { verdictMaxRounds:1, activityTimeoutMs:40 })
  await m.callToolAs('vibe_v4_record_proposition', { id:'p-num', title:'n', statement:'s', prob:0.5, value:0.5, motivation:'m' }, m.spawns[0].childId)
  for(const sp of m.spawns){ m.fireEnd({ id: sp.childId, runId:'br-'+sp.label, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins', solved:false})}] }); await sleep(80) }
  const ridOf = (cid)=>{ for(const sp of m.spawns) if(sp.childId===cid) return sp.label; return '' }
  let fi=0, proposed=false
  for(let i=0;i<300;i++){
    if(fi>=m.followups.length){ await sleep(40); const s0=await m.callTool('vibe_v4_status',{}); if(s0.autoDone||s0.running===false) break; continue }
    const fu=m.followups[fi++]; const rid=ridOf(fu.childId); const pt=(fu.blocks&&fu.blocks[0]&&fu.blocks[0].text)||''; const k=/verifying object/i.test(pt)?'verify':/meeting is in progress/i.test(pt)?'meeting':'normal'
    let reply
    if(k==='verify'){ reply={ vote:{ verdict: rid==='r-1'?0.9:0.1, reason:'基于独立判断' } } }
    else if(k==='meeting'){ reply={input:'x', voteSolved:null} }
    else { reply = proposed ? {summary:'继续',solved:false} : (proposed=true,{summary:'建议验证',solved:false,propose_verify:'p-num'}) }
    m.fireEnd({ id: fu.childId, runId:'t9-'+i, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX(reply)}] })
    await sleep(30)
  }
  const src = readFileSync(join(m.WS,'VibeMath','Projects','default','Propos','r-1','p-num.md'),'utf8')
  const probLine = src.split('\n').find(l=>/^- 概率:/.test(l))
  assert(/^- 概率: 0\.5/.test(probLine), 'T9: numeric verdicts (0.9/0.1, non-unanimous) kept unverified with avg 0.5 (line='+probLine+')')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T10: model/provider inheritance + tool permissions wired to spawn =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T10 model/provider inheritance + tool permissions --')
  const cfg = await m.callTool('vibe_v4_configure', { problem:'权限与继承', params:{ residentCount:2, provider:'deepseek', model:'deepseek-reasoner', toolAllow:['fs','vibe_v4_send_message'], toolDeny:[] } })
  assert(cfg.ok===true, 'T10: configure accepts model/provider/toolAllow/toolDeny params')
  const st = await m.callTool('vibe_v4_status', {})
  assert(/provider=deepseek/.test(st.params) && /model=deepseek-reasoner/.test(st.params), 'T10: new params exposed in status (status='+st.params+')')
  await m.callTool('vibe_v4_start', {})
  await waitFor(()=>m.spawns.length>=2)
  const sp = m.spawns[0]
  assert(sp.request.agentOptions && sp.request.agentOptions.provider==='deepseek', 'T10: provider override wired to resident agentOptions (startContinuable)')
  assert(sp.request.agentOptions && sp.request.agentOptions.model==='deepseek-reasoner', 'T10: model override wired to resident agentOptions')
  assert(sp.request.toolFilter && Array.isArray(sp.request.toolFilter.allow) && sp.request.toolFilter.allow.includes('fs'), 'T10: toolAllow wired to scoped toolFilter (restrict)')
  assert(!('deny' in (sp.request.toolFilter||{})), 'T10: empty toolDeny does not emit a deny key')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T11: model/provider/tools by default inherit (no filter) =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T11 default = inherit parent route + all tools --')
  await m.callTool('vibe_v4_configure', { problem:'默认继承', params:{ residentCount:1 } })
  await m.callTool('vibe_v4_start', {})
  await waitFor(()=>m.spawns.length>=1)
  const sp = m.spawns[0]
  assert(sp.request.agentOptions && !('provider' in sp.request.agentOptions) && !('model' in sp.request.agentOptions), 'T11: empty model/provider leaves agentOptions empty → resident inherits the parent route')
  assert(sp.request.toolFilter===undefined, 'T11: empty toolAllow/toolDeny emits no toolFilter → resident inherits all tools')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T12: theory/framework-building told in the initial prompt =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T12 autonomous theory/framework-building guidance --')
  await m.callTool('vibe_v4_start', { problem:'自主发明理论', residentCount:1 })
  await waitFor(()=>m.spawns.length>=1)
  const p = m.spawns[0].request.prompt[0].text
  assert(/可自主发明理论/.test(p) && /群论/.test(p) && /泛函分析/.test(p), 'T12: initial prompt tells residents they may invent a general theory/framework (group theory / functional analysis analogy)')
  assert(/不强迫/.test(p), 'T12: it is encouraged but explicitly NOT forced (自主)')
  assert(/不断完善/.test(p) && /用[处费]|价值/.test(p), 'T12: explains to refine/generalise it and state its value/frameworks use')
  rmSync(m.WS,{recursive:true,force:true})
}

// ================= T13: compact/rules-recap does NOT leak into meeting wakes =================
{
  const m = makeCtx(); const mod = await import(PLUGIN.href+'?t='+Date.now()+Math.random()); const plugin = mod.default||mod; plugin.apply(m.ctx)
  console.log('-- e2e-v4-fixes: T13 compact/rules-recap gated to normal rounds (no leak) --')
  await m.callTool('vibe_v4_start', { problem:'紧凑泄漏', residentCount:1 })
  await waitFor(()=>m.spawns.length>=1)
  await m.callTool('vibe_v4_set', { activityTimeoutMs:40, compactThreshold:66, compactAfterRounds:999, verdictMaxRounds:1 })
  const rc = m.spawns[0].childId
  m.fireEnd({ id: rc, runId:'br-r-1', provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX({summary:'ins', solved:false})}] })
  await sleep(80)
  let fi=0, proposedMeeting=false, sawNormalDirective=false, checkedMeeting=false, directiveInMeeting=false
  for(let i=0;i<400;i++){
    if(fi>=m.followups.length){ await sleep(40); const s0=await m.callTool('vibe_v4_status',{}); if(s0.running===false||s0.autoDone){ break }; continue }
    const fu=m.followups[fi++]; const pt=(fu.blocks&&fu.blocks[0]&&fu.blocks[0].text)||''
    const k=/meeting is in progress/i.test(pt)?'meeting':/verifying object/i.test(pt)?'verify':'normal'
    let reply
    if(k==='meeting'){
      checkedMeeting=true
      if(/\[核心规则重申\]|CONTEXT COMPACT/.test(pt)) directiveInMeeting=true
      reply={input:'讨论', voteSolved:false}
    } else if(k==='verify'){ reply={ vote:{verdict:0.5, reason:'x'} } }
    else {
      if(/\[核心规则重申\]|CONTEXT COMPACT/.test(pt)) sawNormalDirective=true
      if(!proposedMeeting){ proposedMeeting=true; reply={summary:'建议开会校准',solved:false,propose_meeting:'校准目标',contextPct:40} }
      else { reply={summary:'推进',solved:false,contextPct:80} }
    }
    m.fireEnd({ id: fu.childId, runId:'t13-'+i, provider:'spawn', local:true, stopReason:'completed', lastAssistantMessage:[{type:'text',text:JSONX(reply)}] })
    await sleep(30)
  }
  assert(sawNormalDirective, 'T13: compact directive + core-rules recap injected on a NORMAL research round when contextPct>=threshold')
  assert(checkedMeeting, 'T13: a meeting round was actually driven')
  assert(!directiveInMeeting, 'T13: the compact directive / rules recap does NOT leak into meeting wakes (needCompact cleared)')
  rmSync(m.WS,{recursive:true,force:true})
}

console.log('=== V4 FIXES RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed>0?1:0)
