// tests/vmu-action-arity-spellings.test.mjs — round 564. Last round I suspected this guard could be evaded by moving the
// destructure into the body, and refused to claim it without a demonstration. This is the demonstration, kept in the tree: it
// applies the guard's OWN regexes to five spellings and pins the verdict for each, so the dismissal is evidence rather than a log.
const factoryRe = /export function make\w+Spec\(\{([^}]*)\}\)/
const runSigRe = /run:\s*async\s*\(\{([^}]*)\}/

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const SAMPLE = (body) => `export function makeXSpec({ param, refused }) {\n  return {\n${body}\n  }\n}\n`
// EXACTLY the guard's lines 41-48, which is the whole point: use its logic, do not approximate it.
const verdictOf = (src) => {
  const factory = factoryRe.exec(src)
  const runSig = runSigRe.exec(src)
  if (!factory || !runSig) return 'no-signature'
  if (!/\baction\b/.test(factory[1]) && !/\baction\b/.test(runSig[1])) return 'no-action'
  return 'passes'
}

console.log('=== FIVE SPELLINGS, PINNED ===')
const cases = [
  ['inline destructure with action', '    run: async ({ action, id } = {}) => ({ ok: true }),', 'passes'],
  ['inline destructure WITHOUT action', '    run: async ({ id } = {}) => ({ ok: true }),', 'no-action'],
  ['body destructure of action', '    run: async (args) => { const { action } = args; return { ok: true } },', 'no-signature'],
  ['action via property access', '    run: async (opts) => { const action = opts.action; return { ok: true } },', 'no-signature'],
  ['function expression', '    run: async function ({ action } = {}) { return { ok: true } },', 'no-signature'],
]
const seen = {}
for (const [label, body, expected] of cases) {
  seen[label] = verdictOf(SAMPLE(body))
  ok(seen[label] === expected, label + ' -> ' + expected, { got: seen[label] })
}

console.log('=== AND SO THE SUSPICION IS DISMISSED ===')
ok(seen['body destructure of action'] !== 'passes',
  'the suspected evasion does NOT pass: moving the destructure into the body stops runSig matching at all, so the guard reports no signature found and FAILS - the dismissal is demonstrated, not asserted',
  { got: seen['body destructure of action'] })
ok(seen['inline destructure WITHOUT action'] === 'no-action',
  'and the original bug it was written for is still caught by the action branch', {})

console.log('=== THE TRADE-OFF THIS EXPOSES IS RECORDED ===')
// The guard constrains STYLE as well as correctness: a legitimate tool written as `run: async (args) => ...` fails it. That is the
// safe direction - a false alarm rather than a silent pass - but it is a fact about the guard and belongs in the record.
ok(verdictOf(SAMPLE(cases[2][1])) === 'no-signature',
  'a form the guard cannot parse FAILS rather than passing silently, which is the safe direction for a structural check to err in',
  {})

console.log('=== ACTION ARITY SPELLINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
