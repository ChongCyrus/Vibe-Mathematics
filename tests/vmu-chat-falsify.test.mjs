// tests/vmu-chat-falsify.test.mjs — FAMILY 2 of the falsify routine: `kernel/chat.js` (speech quota and mute are
// ENFORCED, and a refusal appends nothing). Run: node tests/vmu-chat-falsify.test.mjs
//
// Same recipe as the mailbox family (see `docs/acceptance/activity-round5-report.md`): one probe with a control
// direction, single-point mutations, `falsifyFamily`. The chat face has TWO independent enforcement points, so the
// family carries one mutation per point and the probe reads both.
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHAT = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'chat.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/**
 * THE PROBE. Two invariants, each with its control direction so neither reading is vacuous:
 *   · QUOTA — with `speakQuota: 2` the third send is refused by name AND the ledger holds exactly 2 messages;
 *   · MUTE  — a muted member is refused by name AND the refused text is NOT appended; after `unmute` the very same
 *     member speaks again (so the mute really was the only reason).
 */
async function chatProbe(mod) {
  const mk = (settings = {}) => mod.createChat({ clock: () => 1000, log: () => {}, settings, bus: null })
  const q = mk({ 'vmu.chat.speakQuota': 2 })
  const codes = []
  for (let i = 0; i < 3; i += 1) {
    try { q.send('m1', 'msg' + i) } catch (e) { codes.push((e && e.code) || String((e && e.message) || e)) }
  }
  const quotaMessages = q.list({ limit: 10 }).messages.length
  const mu = mk({ 'vmu.chat.admins': ['admin'] })   // mute/unmute need a named admin (an anonymous policy change is refused)
  mu.mute('m1', { durationMs: 60000, reason: 'probe', by: 'admin' })
  let muteCode = null
  try { mu.send('m1', 'while muted') } catch (e) { muteCode = (e && e.code) || String((e && e.message) || e) }
  const mutedAfterRefusal = mu.list({ limit: 10 }).messages.length
  mu.unmute('m1', { reason: 'probe', by: 'admin' })
  let afterUnmute = null
  try { afterUnmute = mu.send('m1', 'after unmute').ok === true } catch (e) { afterUnmute = (e && e.code) || String((e && e.message) || e) }
  const afterUnmuteCount = mu.list({ limit: 10 }).messages.length
  return { quotaCodes: codes.join('|'), quotaMessages, muteCode, mutedAfterRefusal, afterUnmute, afterUnmuteCount }
}

const family = await falsifyFamily({
  name: 'chat — the quota and the mute are enforced, and a refusal appends nothing',
  cases: [{
    name: 'chat.js',
    module: CHAT,
    probe: chatProbe,
    mutations: [
      // Each check is REPEATED at the face's two entry points (the send gate and the `admit` pre-check), so the
      // single defect "this check is gone" means removing BOTH copies — hence `occurrences: 2`. (The library refuses
      // the ambiguous anchor otherwise: `MUTATION-NOT-APPLIED` is exactly what caught this while writing the file.)
      { label: 'quota check removed (both entry points)', name: 'chat-quota', occurrences: 2,
        find: 'if (limit > 0 && used >= limit) {', replace: 'if (false) {   // MUTANT: the quota is never consulted' },
      { label: 'mute lookup removed (both entry points)', name: 'chat-mute', occurrences: 2,
        find: 'const mute = activeMute(who)', replace: 'const mute = null   // MUTANT: a muted member is treated as unmuted' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated module enforces both ===')
ok(family.cases[0].real.quotaCodes === 'VMU_CHAT_QUOTA_EXCEEDED' && family.cases[0].real.quotaMessages === 2,
  '★ the quota refuses the third send BY NAME and appends only two messages', family.cases[0].real)
ok(family.cases[0].real.muteCode === 'VMU_CHAT_MUTED' && family.cases[0].real.mutedAfterRefusal === 0,
  '★ a muted member is refused BY NAME and the refused text is NOT appended (a refusal is not a message)', family.cases[0].real)
ok(family.cases[0].real.afterUnmute === true && family.cases[0].real.afterUnmuteCount === 1,
  'and after unmute the same member speaks again (control direction: the mute was the only reason)', family.cases[0].real)

console.log('=== FALSIFICATION: remove either enforcement point and the SAME probe goes red ===')
ok(family.ok, '★ both chat mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const quotaRed = byLabel('quota check removed') && byLabel('quota check removed').red
const muteRed = byLabel('mute lookup removed') && byLabel('mute lookup removed').red
ok(!!quotaRed && quotaRed.quotaCodes === '' && quotaRed.quotaMessages === 3,
  '★ "quota check removed": all three sends are accepted (no named refusal, ledger grows past the declared limit)', quotaRed)
ok(!!muteRed && muteRed.muteCode === null && muteRed.mutedAfterRefusal === 1,
  '★ "mute lookup removed": the muted member speaks and the text IS appended (the mute becomes decorative)', muteRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous: the family really ran mutations)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU CHAT FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
