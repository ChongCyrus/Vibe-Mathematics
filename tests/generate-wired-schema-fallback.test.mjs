#!/usr/bin/env node
// vmu GENERATOR TYPE-FALLBACK GUARD — Round 32 (task-156).
//
// THE DEFECT: `typeOf(lit)` returns `null` when a literal's form is unrecognised, and `render()` turned that `null`
// into a confident `type:'object'`. So an UN-INFERABLE declaration was written out as a definite type — exactly how
// `vmu.math.optim.tolerance` (`def: 1e-6`) was emitted as `object` (R30 taught `typeOf` scientific notation; the
// FALLBACK stayed). The rule now: **give the generator an un-inferable `def` and it must have a NAME** — the same
// discipline as `planned` (111 keys: not enforced, but named) and `settingsUnenforced` (named).
// RULE E: every collection assertion carries its non-emptiness in the same expression and prints the count.
import { collect, namedFallbacks, unnamedFallbacks, render, OBJECT_FALLBACKS, typeOf } from '../scripts/generate-wired-schema.mjs'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']'))
}

console.log('=== 1. EVERY UN-INFERABLE def IS NAMED (the current tree) ===')
{
  const defs = collect().defs
  const un = defs.filter((d) => d.type === null)
  const named = namedFallbacks(defs)
  const unnamed = unnamedFallbacks(defs)
  ok(defs.length > 0, 'G0. the collector produced rows (the sweep below is non-vacuous)', defs.length)
  ok(un.length === 8 && named.length === 8 && unnamed.length === 0,
    'G1. ★ all 8 un-inferable rows are NAMED with a class and a reason, and NONE is unnamed (counts printed)',
    { unInferable: un.length, named: named.length, unnamed: unnamed.length })
  ok(named.length > 0 && named.every((n) => ['null-literal', 'no-literal'].includes(n.class) && typeof n.why === 'string' && n.why.length > 0),
    'G2. every name carries a CLASS and a non-empty reason (a name without a reason would be a silent fallback with extra words)',
    named.map((n) => n.key + ':' + n.class).slice(0, 3))
  ok(named.every((n) => OBJECT_FALLBACKS[n.key] && OBJECT_FALLBACKS[n.key].why === n.why),
    'G3. and the names come from the DECLARED table `OBJECT_FALLBACKS` (not from the doc string)')
}

console.log('=== 2. ★ THE CRITERION: A FORGED UN-INFERABLE def MUST BE REPORTED BY NAME ===')
{
  // a def whose literal form is unrecognisable AND which nobody named: exactly the state the old fallback hid
  const forged = [{ key: 'vmu.forged.untyped', module: 'forged.js', literal: null, type: typeOf('<<opaque>>') }]
  ok(typeOf('<<opaque>>') === null, 'F0. control: the forged literal form really is un-inferable (else this section is vacuous)', typeOf('<<opaque>>'))
  const un = unnamedFallbacks(forged)
  ok(un.length === 1 && un[0].key === 'vmu.forged.untyped',
    'F1. ★ an un-inferable def with NO name is reported as unnamed — the criterion "must have a name" fails HERE, not silently',
    un)
  const named = namedFallbacks(forged)
  ok(named.length === 0, 'F2. and it is not claimed to be named (the two lists are exact complements)', named)
  const line = render(forged).split('\n').find((l) => l.includes('vmu.forged.untyped'))
  ok(!!line && line.includes('类型推断不出') && line.includes('未具名'),
    'F3. ★ the ARTIFACT itself carries the name: a rendered row with an un-inferable, unnamed type says so in its doc (never a bare `object`)',
    line && line.slice(0, 120))
}

console.log('=== 3. "EXPLAINED FALLBACK" vs "SILENT FALLBACK" ARE DISTINGUISHED ===')
{
  // the same def, once as an explained key (present in the table) and once as an un-explained one
  const explainedKey = Object.keys(OBJECT_FALLBACKS)[0]
  const one = [{ key: explainedKey, module: 'm.js', literal: null, type: null }]
  ok(namedFallbacks(one).length === 1 && unnamedFallbacks(one).length === 0,
    'E1. a declared key ⇒ EXPLAINED (named, with a reason; the fallback to `object` is legitimate and stated)', explainedKey)
  const other = [{ key: 'vmu.not.in.the.table', module: 'm.js', literal: null, type: null }]
  ok(namedFallbacks(other).length === 0 && unnamedFallbacks(other).length === 1,
    'E2. an undeclared key ⇒ UNNAMED (the gate reddens and prints it) — ★ the two states cannot collapse into one')
  ok(Object.keys(OBJECT_FALLBACKS).length === 8,
    'E3. the declared table has exactly the 8 measured entries (a new un-inferable row cannot enter un-named)', Object.keys(OBJECT_FALLBACKS).length)
}

console.log('=== 4. THE GENERATED BLOCK CARRIES THE NAME (the artifact, not just the report) ===')
{
  const defs = collect().defs
  const block = render(defs)
  const rows = block.split('\n').filter((l) => l.includes('类型推断不出'))
  ok(rows.length === 8, 'B1. ★ the eight un-inferable rows each say so in their own doc inside the generated block (count printed)', rows.length)
  ok(rows.every((l) => l.includes('具名回落 object：') && (l.includes('null-literal') || l.includes('no-literal'))),
    'B2. and each names its CLASS + reason, so a reader of the block can tell a declared `object` from an explained fallback')
  ok(block.split('\n').filter((l) => l.includes("type: 'object'")).length >= 8,
    'B3. control: the explained fallback is still `object` (this task NAMES the fallback; it does not silently change it)')
}

console.log('')
console.log('=== VMU WIRED-SCHEMA FALLBACK: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
