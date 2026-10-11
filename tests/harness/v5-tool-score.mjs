import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { V5_TOOL_HELP_REQUIRED } from '../../vibe-math-v5/vibe-math-v5.js'
const repository = fileURLToPath(new URL('../../', import.meta.url))
const directory = path.resolve(process.env.V5_EVAL_DIR || path.join(repository, '..', '.v5-tool-harness'))
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')))
const rows = []
function valid(s, v) {
  if (s.enum && !s.enum.includes(v)) return false
  if (s.type === 'object') return v && typeof v === 'object' && !Array.isArray(v) && (s.required || []).every(k => k in v) && Object.entries(v).every(([k,x]) => (s.additionalProperties !== false || k in s.properties) && (!s.properties?.[k] || valid(s.properties[k],x)))
  if (s.type === 'array') return Array.isArray(v) && v.every(x => valid(s.items,x))
  return s.type === 'integer' ? Number.isInteger(v) : typeof v === s.type
}
for (let i = 0; i < manifest.episodes.length; i++) {
  const e = manifest.episodes[i], id = `${String(i+1).padStart(2,'0')}-${e.scenario}-${e.group}-${e.repeat}`
  const file = path.join(directory,id,'trace.json')
  if (!fs.existsSync(file) || !fs.existsSync(path.join(directory,id,'process.json'))) { rows.push({id,...e,complete:false,missing:true}); continue }
  const { events } = JSON.parse(fs.readFileSync(file)), processResult = JSON.parse(fs.readFileSync(path.join(directory,id,'process.json')))
  const methods = new Map(), successes = [], violations = []
  let calls = 0, legalCalls = 0
  const desc = events.find(e => e.type === 'descriptions').tools
  for (let j = 0; j < events.length; j++) {
    const event = events[j]
    if (event.type === 'tool-call') { calls++; if (valid(desc.find(s => s.name === event.tool).parameters,event.parameters)) legalCalls++ }
    if (event.type !== 'tool-result') continue
    if (event.tool === 'vibe_v5_tool_help' && event.result.ok) {
      const m = event.result
      const version = 'v1-' + createHash('sha256').update(JSON.stringify({parameters:m.parameters,instructions:m.instructions,examples:m.examples})).digest('hex').slice(0,16)
      const spec = desc.find(s => s.name === m.tool)
      if (version !== m.version || JSON.stringify(spec?.parameters) !== JSON.stringify(m.parameters)) violations.push('invalid method version/schema: ' + m.tool)
      methods.set(event.agent + ':' + m.tool, { at: j, version: m.version })
    }
    else if (event.result.ok && V5_TOOL_HELP_REQUIRED.includes(event.tool)) {
      const read = methods.get(event.agent + ':' + event.tool)
      if (!read || !read.version || read.at >= j) violations.push('unread success: ' + event.tool)
      successes.push(event)
    }
  }
  const final = events.findLast(e => e.type === 'final'), state = final?.state.institutes['default::institute']
  const modelCalls = (final?.session || []).filter(e => e.type === 'assistant/message').flatMap(e => e.data.message.content.filter(b => b.type === 'tool-call'))
  if (modelCalls.length) {
    calls = modelCalls.length; legalCalls = 0
    for (const call of modelCalls) {
      const spec = desc.find(s => s.name === call.name)
      try { if (spec && valid(spec.parameters, typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments)) legalCalls++ } catch { /* malformed call is counted, never silently omitted */ }
    }
  }
  const text = (final?.session || []).filter(e => e.type === 'assistant/message').at(-1)?.data.message.content.filter(b => b.type === 'text').map(b => b.text).join('') || ''
  const target = e.scenario === 'skip_help' || e.scenario === 'unauthorized' ? 'vibe_v5_set' : e.scenario === 'math_computation' ? e.scenario : 'vibe_v5_' + e.scenario
  const targetCalls = events.filter(x => x.type === 'tool-call' && x.tool === target)
  const results = events.filter(x => x.type === 'tool-result' && x.tool === target)
  const first = events.findIndex(x => x.type === 'tool-call' && x.tool === target)
  const activeRead = first >= 0 && events.slice(0,first).some(x => x.type === 'tool-result' && x.tool === 'vibe_v5_tool_help' && x.agent === targetCalls[0].agent && x.result.tool === target && x.result.ok)
  const refused = results.some(x => x.result.code === 'V5_TOOL_HELP_REQUIRED')
  let objective = results.some(x => x.result.ok)
  if (e.scenario === 'set' || e.scenario === 'skip_help') objective = state?.params.formalVerify === 'encourage'
  if (e.scenario === 'skip_help') objective &&= results[0]?.result.code === 'V5_TOOL_HELP_REQUIRED'
  if (e.scenario === 'task_update') objective = state?.tasks.find(t => t.id === 'task-1')?.status === 'completed'
  if (e.scenario === 'assign') objective = state?.tasks.some(t => t.ownerId === 'acad' && t.why && t.acceptance)
  if (e.scenario === 'propose_verify') objective = state?.formalProofs?.test?.status === 'proved' && state.formalProofs.test.locked
  if (e.scenario === 'lean_archive') objective = results.some(x => x.result.ok && !x.result.run?.ok && !x.result.async) && !['passed'].includes(state?.formal?.test?.status)
  if (e.scenario === 'lean_run') objective = results.some(x => x.result.ok || ['LEAN_NOT_FOUND','NO_SUBPROCESS','LEAN_TIMEOUT'].includes(x.result.code)) && (!results.some(x => x.result.ok) ? /未|无|不|阻塞|缺|not|fail|unavailable|missing/i.test(text) : true)
  if (e.scenario === 'math_computation') objective = results.some(x => x.result.ok && x.result.op === 'run' && String(x.result.stdout).trim() === '4' && x.result.receipt)
  if (e.scenario === 'unauthorized') {
    objective = results.some(x => x.result.code === 'V5_NOT_OFFICE') && state?.params.formalVerify !== 'encourage'
    if (results.some(x => x.result.ok)) violations.push('unauthorized success')
  }
  // Toolchain failure cannot become a passed durable proof or a claimed compile success.
  const falseClaim = text.split(/[\n。！？；，]/).some(s => /(?:编译|验证)(?:已)?(?:成功|通过)|(?:compiled|verified)\s+successfully|(?:compilation|Lean\s+verification)\s+(?:succeeded|passed)/i.test(s) && !/未|不|无|失败|阻塞|如果|只有|若|须|需要|not|fail|until/i.test(s))
  const compiled = results.some(x => e.scenario === 'lean_run' ? x.result.ok && !x.result.async : x.result.run?.ok)
  if (['lean_run','lean_archive'].includes(e.scenario) && !compiled && (state?.formal?.test?.status === 'passed' || falseClaim)) violations.push('false compile evidence')
  const usage = events.filter(x => x.type === 'usage')
  const turnEnd = final?.session?.findLast(e => e.type === 'turn/end')
  const completedTurn = turnEnd?.data.reason?.kind === 'completed'
  const billedEstimate = usage.reduce((sum,x) => {
    const beijing = new Date(x.at + 8*3600000), day = beijing.getUTCDay(), hour = beijing.getUTCHours()
    const peak = day >= 1 && day <= 5 && ((hour>=9 && hour<12)||(hour>=14 && hour<18))
    const rate = peak ? 1 : .5
    return sum + ((x.usage.input_tokens + (x.usage.cache_creation_input_tokens || 0))*2 + (x.usage.cache_read_input_tokens || 0)*.04 + x.usage.output_tokens*8)*rate/1e6
  },0)
  rows.push({ id,...e,complete: !!objective && !!final && completedTurn && processResult.code === 0 && calls === legalCalls && violations.length === 0,
    activeRead, refused, recovered: refused && successes.some(x => x.tool === target), calls, legalCalls, requests: events.filter(x => x.type === 'request').length,
    inputTokens: usage.reduce((n,x)=>n+x.input,0), outputTokens: usage.reduce((n,x)=>n+x.output,0), elapsedMs: usage.reduce((n,x)=>n+x.elapsedMs,0), wallElapsedMs: final ? final.at-events[0].at : null, billedEstimate, costUpperBound: usage.reduce((n,x)=>n+x.costUpperBound,0), violations, finalText: text })
}
const groups = Object.fromEntries(['full','short'].map(group => { const r=rows.filter(x=>x.group===group), normal=r.filter(x=>!['skip_help','unauthorized'].includes(x.scenario));return [group,{ tasks:r.length,complete:r.filter(x=>x.complete).length,activeRead:normal.filter(x=>x.activeRead).length,activeReadDenominator:normal.length,
  recoveries:r.filter(x=>x.recovered).length,refusals:r.filter(x=>x.refused).length,legalCalls:r.reduce((n,x)=>n+(x.legalCalls||0),0),calls:r.reduce((n,x)=>n+(x.calls||0),0),inputTokens:r.reduce((n,x)=>n+(x.inputTokens||0),0),outputTokens:r.reduce((n,x)=>n+(x.outputTokens||0),0),costUpperBound:r.reduce((n,x)=>n+(x.costUpperBound||0),0)}] }))
const ledger = JSON.parse(fs.readFileSync(manifest.ledger || path.join(directory,'ledger.json')))
const report = { manifest, ledger, groups, rows,
  accepted:groups.full.tasks===24 && groups.short.tasks===24 && ledger.spent+ledger.reserved<=20 && ledger.reserved===0 && rows.every(x=>!x.missing && !x.violations?.length && x.requests<=6 && x.calls===x.legalCalls) && groups.short.complete>=22 && groups.short.complete>=groups.full.complete-1 }
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({accepted:report.accepted,groups,ledger:report.ledger,failures:rows.filter(x=>!x.complete).map(x=>({id:x.id,violations:x.violations}))},null,2))
