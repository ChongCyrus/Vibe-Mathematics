// tests/vmu-chat-quota.mutants.mjs — Round 5 / task-34 D: the falsify paradigm applied to a SECOND face.
//
// WHY A SECOND FAMILY. Round 4 proved the prompt pipeline's behavioural contract could be broken (F22). One face
// is a special case; two are a PARADIGM. This family takes the chat face's SPEECH QUOTA - a bound the machine
// claims to enforce - and requires three single-point defects to change the observable reading:
//   M1 the quota check never fires (an unbounded speaker),
//   M2 an off-by-one (one extra speech slips through - the realistic version of the same bug),
//   M3 the receipt names the WRONG enforced key (the bound is enforced but the receipt lies about why).
// It runs through the SHARED library (`tests/_lib/falsify.mjs`), so it inherits the anti-self-deception guards:
// MUTATION-NOT-APPLIED (anchor missing/ambiguous), MUTANT-UNIMPORTABLE, REAL-MODULE-NOT-GREEN,
// PROBE-DOES-NOT-DISCRIMINATE, UNSAFE-TMP-DIR / TEMP-NOT-CLEANED.
//
// Run: node tests/vmu-chat-quota.mutants.mjs
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { falsify, formatReport } from './_lib/falsify.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const SOURCE = join(REPO, 'vibe-math-vmu', 'kernel', 'chat.js')

/**
 * The observable reading: set a quota of 2 for one speaker and try three speeches. A correct face refuses the
 * THIRD with a named code and reports the key it enforced; a broken face lets it through, or drops the refusal,
 * or misnames the key. Everything is JSON-able, which is all the library needs.
 */
async function quotaReading(mod) {
  const c = mod.createChat({ clock: () => 1000, log: () => {}, settings: { 'vmu.chat.admins': ['a1'] } })
  let setOk = null
  try { const s = c.setQuota(2, { by: 'a1' }); setOk = !!(s && s.ok !== false) } catch (e) { setOk = 'threw:' + ((e && e.code) || e) }
  const sends = []
  for (let i = 0; i < 3; i++) {
    try {
      const r = c.send('m1', 'speech ' + i)
      sends.push({ n: i + 1, ok: !!(r && r.ok), code: null, enforced: (r && r.enforced) || null })
    } catch (e) {
      sends.push({ n: i + 1, ok: false, code: (e && e.code) || null, enforced: (e && e.enforced) || null })
    }
  }
  let state = null
  try { state = c.quotaState('m1') } catch (e) { state = { threw: String((e && e.code) || e) } }
  return { setOk, sends, state }
}

// The quota check exists in TWO places (`send` enforcement at chat.js:329 and the `maySpeak` predicate at :562),
// so the mutations declare `occurrences: 2` on purpose: a defect in only one of them is a PARTIAL mutation, and
// the bound is what must break. (The library's MUTATION-NOT-APPLIED guard is what surfaced this - it refused the
// ambiguous anchor instead of silently mutating one occurrence, which is precisely the failure mode it exists for.)
const MUTATIONS = [
  { label: 'the quota check never fires (unbounded speaker)', occurrences: 2,
    find: 'if (limit > 0 && used >= limit) {', replace: 'if (false) {' },
  { label: 'off-by-one: one extra speech slips through', occurrences: 2,
    find: 'if (limit > 0 && used >= limit) {', replace: 'if (limit > 0 && used >= limit + 1) {' },
  { label: 'the receipt misnames the key it enforced',
    find: "enforced.push('vmu.chat.speakQuota')", replace: "enforced.push('vmu.chat.someOtherKey')" },
]

const report = await falsify({ name: 'vmu chat face — the speech quota is really enforced', module: SOURCE, mutations: MUTATIONS, probe: quotaReading })
console.log(formatReport(report))

let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))) }
}

// CONTROL: the real face must enforce the bound (3rd refused) - otherwise "every mutant differs" proves nothing.
{
  const r = report.real
  const third = r && r.sends && r.sends[2]
  ok(!!r && r.setOk === true && third && third.ok === false && typeof third.code === 'string' && third.code.length > 0,
    'CONTROL: the REAL face refuses the speech that exceeds the quota, BY NAME (setOk + 3rd refused with a code)', r)
  ok(!!r && r.sends[0].ok === true && r.sends[1].ok === true,
    'CONTROL: and the two speeches INSIDE the quota are accepted (the refusal is the bound, not a blanket deny)', r && r.sends)
}
ok(report.ok,
  'every declared mutation applied, imported, produced a DIFFERENT reading, and its copy was cleaned up (the library verdict)',
  report.problems)

console.log('')
console.log('=== VMU CHAT QUOTA MUTANTS: ' + (failed === 0 ? 'GREEN' : 'RED (' + failed + ' failed)') + ' ===')
process.exit(failed === 0 ? 0 : 1)
