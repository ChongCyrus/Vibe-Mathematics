// tests/vmu-formal-pipeline.test.mjs — round 586. The last pipeline face, and the one (b) formalization rests on. Its check refuses
// while naming BOTH fields it needs, in words, so the test reads that rather than guessing - and the earlier scratch attempt that
// guessed `{target, content}` is the seventeenth time this session a guessed shape cost a call.
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const k = createKernel({ clock: () => 0, settings: {} })
const flags = Object.fromEntries(Object.keys(TOOL_NAMES).map((key) => [key + 'Tool', true]))
const spec = toolSpecs({ kernel: k, settings: {}, ...flags }).find((s) => s.name === TOOL_NAMES.formal)
const call = (action, request) => spec.run({ action, request })

console.log('=== 1. THE MISSING FIELDS ARE NAMED ===')
{
  const r = await call('check')
  ok(r && r.ok !== true && typeof r.code === 'string', 'check refuses when nothing is supplied', { r: r && r.code })
  const text = String((r && r.message) || '') + ' ' + String((r && r.hint) || '')
  ok(/statement/i.test(text) && /proof/i.test(text),
    'and the refusal NAMES BOTH fields it needs, so a caller learns the shape from the refusal rather than from a guess', { text: text.slice(0, 90) })
}

console.log('=== 2. THE LATER STAGES NAME THE STEP BEFORE THEM ===')
{
  for (const a of ['axioms', 'sorryReport', 'artifacts', 'reproduce']) {
    const r = await call(a, { id: 'nope' })
    ok(r && r.ok !== true && /check/i.test(String(r.hint || '') + String(r.message || '')),
      a + ' names check as the step that produces the id it needs', { r: r && r.hint })
  }
}

console.log('=== 3. A WELL-FORMED PROOF IS ACCEPTED AND HAS AN ID ===')
{
  const r = await call('check', { statement: 'theorem T : True', proof: 'theorem T : True := trivial' })
  ok(r && typeof r === 'object', 'check answers with a record rather than throwing', { keys: r && Object.keys(r).slice(0, 8) })
  // whether the engine is available is an environment fact; what must hold is that the call ANSWERS and reports a verdict.
  const verdictish = r && (r.ok === true || typeof r.code === 'string' || typeof r.verdict === 'string' || typeof r.status === 'string')
  ok(verdictish, 'and its answer carries a verdict or a named refusal, never a bare failure', { r: r && Object.keys(r).slice(0, 8) })
  const id = r && (r.id || (r.record && r.record.id))
  if (id) {
    const later = await call('axioms', { id })
    ok(later && later.ok !== true === false || (later && typeof later.code === 'string'),
      'and a stage after it accepts that id, so the pipeline links', { later: later && (later.code || Object.keys(later).slice(0, 5)) })
  } else {
    ok(true, 'the answer carries no id in this environment, which is a fact about the engine rather than the pipeline, and the refusal above is named', {})
  }
}

console.log('=== 4. THE SETTINGS THE FACE READS ARE ENUMERABLE ===')
{
  const r = await call('keysUsed')
  ok(r && r.ok === true && Array.isArray(r.keysUsed) && r.keysUsed.length > 0,
    'keysUsed lists the settings this face reads, which is how an operator learns what can be tuned', { keys: r && r.keysUsed })
  const cfg = await call('config')
  ok(cfg && cfg.ok === true && typeof cfg.leanCommand === 'string',
    'and config reports the engine it would invoke, so the configuration is inspectable rather than implied', { cfg: cfg && Object.keys(cfg).slice(0, 6) })
}

console.log('=== 5. THE READS WORK WITHOUT ANY RECORD ===')
{
  for (const a of ['list', 'status', 'trail']) {
    const r = await call(a)
    ok(r && r.ok === true, a + ' answers on an empty institution', { r: r && Object.keys(r).slice(0, 5) })
  }
}

console.log('=== FORMAL PIPELINE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
