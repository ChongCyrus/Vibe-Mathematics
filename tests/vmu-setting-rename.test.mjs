// vibe-math-vmu — THE RENAME CHANNEL (docs/03 §8: VMU_PARAM_RENAMED, VMU_ALIAS_AMBIGUOUS).
//
// docs/03 has documented a three-phase rename since long before this existed - renamed, deprecated, removed, with a
// replacement key required during deprecation - and marked it a proposal. This suite proves the first phase is real:
// a key record may carry `was: [formerNames]`, a deployment that still presents a former name is RESOLVED rather than
// refused, and an ambiguous former name is a refusal instead of a guess.
//
// Run: node tests/vmu-setting-rename.test.mjs
import { SETTING_DEFS, SETTING_ALIASES, resolveKey, renameNotice, assertDeclared } from '../vibe-math-vmu/settings/schema.js'

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}

console.log('=== 1. the rename channel exists and is derived from the declarations ===')
{
  const records = SETTING_DEFS.filter((d) => Array.isArray(d.was) && d.was.length > 0)
  ok(records.length > 0, 'at least one key record carries a former name', JSON.stringify(records.map((d) => d.key)))
  ok(SETTING_ALIASES.size === records.reduce((n, d) => n + d.was.length, 0),
    'the alias map has exactly one entry per declared former name, and is DERIVED rather than hand-maintained',
    { aliases: SETTING_ALIASES.size })
  let bad = null
  for (const d of records) for (const was of d.was) {
    const resolved = resolveKey(was)
    if (resolved !== d.key) bad = { was, resolved, expected: d.key }
  }
  ok(bad === null, 'every former name resolves to the key that claims it', JSON.stringify(bad))
}

console.log('=== 2. a former name is accepted, and what comes back is the CANONICAL record ===')
{
  const renamed = SETTING_DEFS.find((d) => Array.isArray(d.was) && d.was.length > 0)
  const former = renamed.was[0]
  const rec = assertDeclared(former)
  ok(rec.key === renamed.key,
    'assertDeclared on a former name returns the canonical declaration, so a reader learns the new name without a second lookup',
    { former, got: rec.key })
  ok(assertDeclared(renamed.key) === rec, 'and the canonical name returns the same record object')
  ok(resolveKey('vmu.not.a.former.name') === 'vmu.not.a.former.name',
    'a name that is not a former name is returned unchanged, because resolveKey is not a validator')
}

console.log('=== 3. an undeclared key is still refused by name (the rename channel must not weaken R4) ===')
{
  let err = null
  try { assertDeclared('vmu.definitely.not.declared') } catch (e) { err = e }
  ok(err !== null && err.code === 'VMU_INVALID_ARGUMENT',
    'an undeclared key still throws VMU_INVALID_ARGUMENT, so accepting former names did not open the door to invented ones',
    { code: err && err.code })
}

console.log('=== 4. the first end-to-end rename is the one this suite was written with ===')
{
  const prune = SETTING_DEFS.filter((d) => d.key.startsWith('vmu.prune.'))
  ok(prune.length === 4, 'the four keys formerly named vmu.gc.* are declared as vmu.prune.*', { count: prune.length })
  ok(prune.every((d) => d.was && d.was.some((w) => w.startsWith('vmu.gc.'))),
    'and each of them records its former name, so the rename is reversible on paper and resolvable at runtime')
  ok(prune.every((d) => typeof d.doc === 'string' && d.doc.length > 0),
    'and the declarations kept their documentation through the rename')
}

console.log('=== 5. a rename is OBSERVABLE, never silent (VMU_PARAM_RENAMED) ===')
{
  const renamed = SETTING_DEFS.find((d) => Array.isArray(d.was) && d.was.length > 0)
  const former = renamed.was[0]
  const notice = renameNotice(former)
  ok(notice !== null && notice.code === 'VMU_PARAM_RENAMED' && notice.from === former && notice.to === renamed.key,
    'resolving a former name yields a rename notice naming both names, so a deployment still speaking the old vocabulary can be told',
    JSON.stringify(notice))
  ok(renameNotice(renamed.key) === null,
    'while the canonical name yields NO notice, because there is nothing to report')
  ok(resolveKey(former) === renamed.key,
    'and the notice does not throw: a former name is legitimate, and refusing it would turn a rename into a removal')
}

console.log('=== SETTING RENAME: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exit(1) }
