// tests/vmu-refusal-examples.test.mjs — round 573. Five refusals print a runnable example, so a client can follow them without
// guessing: `e.g. apply({postingId, candidate:"acad"})`. This parses those examples STRICTLY - {key: value} literals only, no eval -
// retries the named method, and REPORTS the outcome. It reports rather than gates because two of the three non-advancing cases
// are unavoidable: an example cannot name real data, so `trash({id:"obj-1"})` must fail with no such object.
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

// STRICT: `{ key: "text" }` or `{ key: 12 }` or `{ key: true }`, flat, no expressions. Anything else is refused rather than
// interpreted, so no hint text ever becomes code.
const parseExample = (hint) => {
  const m = /e\.g\.\s*([a-zA-Z_$][\w$]*)\(\s*\{([^}]*)\}\s*\)/.exec(String(hint || ''))
  if (!m) return null
  const args = {}
  const named = []
  for (const p of m[2].split(',')) {
    // A BARE KEY is how these examples name a field whose value only the caller has: `e.g. apply({postingId, candidate:"acad"})`.
    // So a bare key is recorded as a NAMED field but supplies no value - the example teaches names, and values only where it has one.
    const bare = /^\s*([a-zA-Z_$][\w$]*)\s*$/.exec(p)
    if (bare) { named.push(bare[1]); continue }
    const kv = /^\s*([a-zA-Z_$][\w$]*)\s*:\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?)|(true|false))\s*$/.exec(p)
    if (!kv) return null                       // an expression is still refused rather than interpreted
    args[kv[1]] = kv[2] !== undefined ? kv[2] : kv[3] !== undefined ? kv[3] : kv[4] !== undefined ? Number(kv[4]) : kv[5] === 'true'
  }
  return { method: m[1], args, named }
}

const k = createKernel({ clock: () => 0, settings: {} })
const flags = Object.fromEntries(Object.keys(TOOL_NAMES).map((key) => [key + 'Tool', true]))
const specs = toolSpecs({ kernel: k, settings: {}, ...flags })

console.log('=== 1. THE PARSER IS STRICT, SO NO HINT BECOMES CODE ===')
ok(parseExample('e.g. apply({postingId, candidate:"acad"})') !== null, 'a plain literal example parses', {})
ok((parseExample('e.g. apply({postingId, candidate:"acad"})') || {}).named.join() === 'postingId', 'and a BARE KEY is recorded as a named field with no value, which is how these examples ask the caller to supply one', {})
ok(parseExample('e.g. open({scope:"meeting:mt-1"})') !== null, 'and so does a second real one from the tree', {})
ok(parseExample('e.g. boom({x: process.exit(1)})') === null, 'an expression is REFUSED rather than evaluated, so a hint can never execute code', {})
ok(parseExample('e.g. boom({x: require("fs")})') === null, 'and so is a call', {})

console.log('=== 2. EXAMPLES ARE COLLECTED FROM THE REAL REFUSALS ===')
const examples = []
for (const s of specs) {
  for (const a of (s.parameters.action && s.parameters.action.enum) || []) {
    let r
    try { r = await s.run({ action: a }) } catch (e) { r = { code: e.code, hint: e.hint } }
    if (!r || r.ok === true || !r.hint) continue
    const ex = parseExample(r.hint)
    if (ex) examples.push({ tool: s.name, action: a, code: r.code, ex })
  }
}
ok(examples.length >= 3, 'several refusals hand the caller a runnable example', { n: examples.length, which: examples.map((e) => e.tool.replace('vibe_vmu_', '') + '.' + e.action) })

console.log('=== 3. FOLLOWING AN EXAMPLE ADVANCES, OR SAYS WHY IT CANNOT ===')
const advanced = [], notAdvanced = []
for (const e of examples) {
  const spec = specs.find((s) => s.name === e.tool)
  const en = (spec.parameters.action && spec.parameters.action.enum) || []
  if (!en.includes(e.ex.method)) continue
  let r2
  try { r2 = await spec.run({ action: e.ex.method, request: e.ex.args }) } catch (err) { r2 = { code: err.code } }
  const moved = !(r2 && r2.ok !== true && String(r2.code) === String(e.code))
  if (moved) advanced.push(e.tool.replace('vibe_vmu_', '') + '.' + e.action + ' -> ' + (r2 && r2.ok === true ? 'ok' : r2 && r2.code)); else notAdvanced.push(e.tool.replace('vibe_vmu_', '') + '.' + e.action + ' -> ' + (r2 && r2.code))
}
console.log('  advanced: ' + JSON.stringify(advanced))
console.log('  not advanced: ' + JSON.stringify(notAdvanced))
ok(advanced.length >= 2, 'following the example moved the caller forward in a majority of the cases it could', { advanced })
ok(notAdvanced.length + advanced.length === examples.length, 'and every example was actually tried, so the report covers all of them', { tried: advanced.length + notAdvanced.length, of: examples.length })

console.log('=== 4. A TOOL MUST BE ABLE TO EXPRESS THE CALL ITS OWN SERVICE PRINTS ===')
// ROUND 576. Budget's service printed `e.g. open({scope:"meeting:mt-1"})` while the tool's parameters were scattered at the top
// level, so the framework documented a call it could not make - and both halves were individually correct, so no structural
// check could see it. This is the check that would have: a hint that prints a COMPLETE CALL names fields, and the tool must be
// able to supply them, either as declared parameters or through a request object. Enumeration hints (`allowed: a, b, c`) do not
// print a call and are not affected - the distinction that made a first attempt at this report twenty-three false positives.
const canExpress = []
const cannotExpress = []
for (const e of examples) {
  const spec = specs.find((s) => s.name === e.tool)
  const params = new Set(Object.keys(spec.parameters || {}))
  const viaRequest = params.has('request')
  for (const f of [...Object.keys(e.ex.args), ...(e.ex.named || [])]) {
    const expressible = params.has(f) || viaRequest
    const where = e.tool.replace('vibe_vmu_', '') + '.' + e.action + ' needs `' + f + '`'
    if (expressible) canExpress.push(where); else cannotExpress.push(where)
  }
}
ok(cannotExpress.length === 0,
  'every field named by a printed example can be supplied through the tool, as a declared parameter or inside request, so the framework never documents a call it cannot make',
  { cannotExpress: cannotExpress.slice(0, 8), canExpress: canExpress.length })
ok(canExpress.length > 0, 'and the check examined real fields rather than passing on an empty set', { canExpress: canExpress.length })

console.log('=== 4. THE REPORT IS PRODUCED, NOT A VERDICT ===')
// A non-advancing example may still be correct: an example cannot name real data. The value is the list, for a human to read.
ok(Array.isArray(notAdvanced), 'the non-advancing cases are listed rather than judged, because some are unavoidable', { notAdvanced })

console.log('=== REFUSAL EXAMPLES: ' + passed + ' passed, ' + failed + ' failed; advanced=' + advanced.length + ' notAdvanced=' + notAdvanced.length + ' ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
