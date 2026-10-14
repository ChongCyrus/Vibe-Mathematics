// tests/audit-bus-emit-shape.test.mjs — Round 4 / task-31: the FIRST ARGUMENT of a bus emit must be a STRING
// LITERAL (the hook/topic name), never an object.
//
// WHY (measured this round by the Lead). Five sites call `bus.emit({ ... }, payload)` - `board.js`,
// `projmigrate.js`, `skills.js`, `topology.js`, `trust.js`. `kernel/bus.js` refuses a non-string topic BY NAME,
// and every one of those callers wraps its emit in try/catch, so the refusal was SWALLOWED and the hook simply
// never fired: a dead channel that no hook-coverage gate could see, because the gate looks for a literal name.
// A hook that cannot be named cannot be routed, so this is a correctness rule, not a style preference.
//
// THE RULE IS DELIBERATELY NARROW: "the first non-whitespace character after `bus.emit(` is `{`" has no legitimate
// form, so it is a hard RED with no exemption list. Sites whose first argument is a VARIABLE are NOT gated - a
// computed topic can be legitimate - but they are COUNTED and LISTED for human review, which is this
// repository's convention for "we cannot decide mechanically, so do not hide it".
//
// Run: node tests/audit-bus-emit-shape.test.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))); console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))) }
}

/** Walk every shipped .js under the vmu package (never docs). */
const walk = (rel, out = []) => {
  for (const e of readdirSync(rel, { withFileTypes: true })) {
    const p = join(rel, e.name)
    if (e.isDirectory()) { if (!p.includes('docs')) walk(p, out) } else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

/**
 * Classify every `bus.emit(` call site by the first character of its first argument:
 *   `{`            -> 'object'   (a DEFECT: the bus refuses a non-string topic, and the caller swallows it)
 *   quote/backtick -> 'literal'  (the good shape: the topic is visible to the hook gates)
 *   anything else  -> 'variable' (report-only: could be legitimate, a human decides)
 */
export function classifyEmitFirstArgs(src) {
  const out = []
  for (const m of String(src).matchAll(/(?:^|[^\w$])(?:bus|\.bus)\.emit\s*\(/g)) {
    let rest = String(src).slice(m.index + m[0].length)
    // A COMMENT may sit between `(` and the first argument; skip it so `bus.emit(/* why */ { … })` is still seen
    // as the defect it is (a blind spot here would be a false green, the one outcome this gate must never have).
    for (;;) {
      const trimmed = rest.replace(/^\s+/, '')
      if (trimmed.startsWith('//')) { rest = trimmed.slice(trimmed.indexOf('\n') === -1 ? trimmed.length : trimmed.indexOf('\n')); continue }
      if (trimmed.startsWith('/*')) { const end = trimmed.indexOf('*/'); rest = end === -1 ? '' : trimmed.slice(end + 2); continue }
      rest = trimmed
      break
    }
    const ch = (rest.match(/\S/) || [''])[0]
    const line = String(src).slice(0, m.index).split('\n').length
    const kind = ch === '{' ? 'object' : (ch === "'" || ch === '"' || ch === '`') ? 'literal' : 'variable'
    out.push({ kind, first: ch, line })
  }
  return out
}

// SELF-PROBE (the rule must be falsifiable, and must not fire on the good shapes).
{
  const p = classifyEmitFirstArgs([
    "await bus.emit({ id: 'ui-theme' }, payload)",       // DEFECT
    "await bus.emit('board/updated', payload)",          // good
    'await bus.emit(`topology/changed`, payload)',       // good
    'await bus.emit(topic, payload)',                    // variable (report-only)
    'await bus.emit(\n  { nested: true },\n  payload)',  // DEFECT across a newline
    'await bus.emit(/* why */ { id: 1 }, payload)',     // DEFECT behind a block comment
  ].join('\n'))
  const kinds = p.map((x) => x.kind)
  ok(kinds.length === 6 && kinds[0] === 'object' && kinds[1] === 'literal' && kinds[2] === 'literal' && kinds[3] === 'variable' && kinds[4] === 'object' && kinds[5] === 'object',
    '★ SELF-PROBE: the classifier calls an object first-argument a DEFECT (including across a newline and behind a comment), a quoted topic GOOD, and a variable report-only',
    JSON.stringify(kinds))
}

const files = walk(VMU).filter((f) => !f.includes('docs'))
const found = { object: [], literal: [], variable: [] }
for (const f of files) {
  const rel = relative(REPO, f).replace(/\\/g, '/')
  for (const hit of classifyEmitFirstArgs(readFileSync(f, 'utf8'))) {
    found[hit.kind].push(rel + ':' + hit.line)
  }
}

ok(found.literal.length > 0,
  'the scan found real emitters (non-vacuous: ' + found.literal.length + ' string-literal topics)')
ok(found.object.length === 0,
  '★ every `bus.emit(` call names its topic with a STRING LITERAL as the first argument — an object first argument is refused by the bus and then swallowed by the caller, so the hook never fires',
  found.object)

// REPORT-ONLY (not a gate): a computed topic is a human decision, but it must not be invisible.
console.log('  · report-only: ' + found.variable.length + ' call site(s) pass a VARIABLE/expression as the topic (not gated):')
for (const v of found.variable) console.log('      ' + v)

console.log('')
console.log('=== BUS EMIT SHAPE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
