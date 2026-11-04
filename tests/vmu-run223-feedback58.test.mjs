/**
 * tests/vmu-run223-feedback58.test.mjs — RUN 223: 「邀请入会的成员」was a LIST, never an ACT.
 *
 * Measured by ABSENCE on run 59's brief / FEEDBACK58 (and by the user's own question: 邀请通知成员有没有？):
 * `vibe_v5_meeting` narrowed the roster and PRINTED it (`roster` / `rosterNarrowed` / `rosterMeans`), and then told
 * nobody. A member learned that a meeting existed only inside a turn that somebody else drove — even though the two
 * rails for exactly this have existed for many rounds: the durable mailbox (`kernel/mailbox.js send`, already used by
 * `assign` and `nudge`) and the meetings wake seam (`kernel/meetings.js wake`, RUN 198), which no convene ever called.
 *
 * The repair is one block on the convene receipt:
 *   · `invitation.delivered` — a durable mail row per NON-CHAIR roster member (kind `meeting-invitation`), each with
 *     the mail id, so "the member was told" is a fact with a row behind it rather than a claim;
 *   · `invitation.woken` — who this deployment could actually wake NOW (empty when it injects no wake seam: a
 *     deployment fact, not a silence);
 *   · `invitation.unreachable` — whose mail did NOT go out, with the code and the message;
 *   · `invitation.means` — says the invitation is durable mail (read at the member's next turn / through the inbox),
 *     that `woken` names a live wake only where a seam exists, and that the repair for an unreachable member is
 *     `vibe_v5_message` or a wake attempt — NEVER a second convene, and never a rolled-back convene (a delivery
 *     failure must not undo an academic act; the same rule as RUN 185's freeze).
 *
 * RULE E: every assertion is preceded by an explicit non-empty premise check.
 *
 * Run: node tests/vmu-run223-feedback58.test.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/r223'
const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 200) : text)

mkdirSync(TMP, { recursive: true })
const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)

const boot = async () => {
  const specs = []
  const root = mkdtempSync(join(TMP, 'k-'))
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (n) => specs.filter((s) => s && s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: null }
    try {
      const raw = await spec.execute(args, { kernel: handle.kernel })
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: String(raw), hint: null }
    } catch (e) {
      return { ok: false, code: (e && (e.code || (e.cause && e.cause.code))) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, call }
}

console.log('\n=== 0. THE INVITATION BLOCK IS ON THE CONVENE FACE, WITH ITS HONESTY SENTENCES ===')

has(SRC_TOOLS, 'const invitedMembers = (() => {', '§0a the convene face computes its invitees from the roster it just opened')
has(SRC_TOOLS, "const kind = 'meeting-invitation'", '§0b the mail kind is named once')
has(SRC_TOOLS, 'nonAttending, nonAttendingMeans,\n    invitation,', '§0c the block reaches the receipt')
has(SRC_TOOLS, 'DURABLE MAIL', '§0d the means says the invitation is durable mail, not a live wake')
has(SRC_TOOLS, 'never a second convene', '§0e the repair sentence forbids a second convene')
has(SRC_TOOLS, 'must never roll', '§0f a failed mail must not roll back the convene')
has(SRC_TOOLS, 'unreachable', '§0g the receipt can name WHOSE mail did not go out')

console.log('\n=== 1. convene mails every invited member (and only them), and the mail is readable from the inbox ===')

{
  const b = await boot()
  const started = await b.call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方', researcherCount: 2 })
  ok(started.ok === true, '§1a the institute started', started)
  const convened = await b.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题', '分配复核'], title: '确认奇数求和命题', formal_agenda: true })
  ok(convened.ok === true, '§1b the chair convened a debate', convened)
  const inv = convened.invitation || {}
  ok(inv !== null && typeof inv === 'object', '§1c the convene receipt carries `invitation`', convened)
  ok(inv.kind === 'meeting-invitation', '§1d the block names the mail kind it sent', inv)
  ok(Array.isArray(inv.attempted) && inv.attempted.length > 0, '§1e there was somebody to invite', inv)
  ok(!inv.attempted.includes('r-acad'), '§1f the chair is seated by open(), so it is not an invitee', inv.attempted)
  ok(inv.attempted.slice().sort().join(',') === 'r-1,r-2', '§1g every non-chair roster member is an invitee', inv.attempted)
  ok(inv.delivered.length === 2, '§1h both invitations were delivered', inv)
  ok(inv.unreachable.length === 0, '§1i nothing was unreachable in a healthy kernel', inv)
  ok(typeof inv.delivered[0].mailId === 'string' && inv.delivered[0].mailId !== '', '§1j each delivered invitation names its mail row', inv.delivered)
  ok(/DURABLE MAIL/.test(String(inv.means)), '§1k the means does not claim a live wake', inv.means)
  ok(/next turn/i.test(String(inv.means)), '§1l the means says WHEN the member will see it', inv.means)

  const inbox1 = await b.call('vibe_v5_inbox', { action: 'list', member: 'r-1' })
  ok(inbox1.ok === true && Array.isArray(inbox1.rows), '§1m r-1 can read its mailbox', inbox1)
  const rows1 = (inbox1.rows || []).filter((r) => r.kind === 'meeting-invitation')
  ok(rows1.length === 1, '§1n r-1 has exactly one meeting invitation', inbox1.rows)
  ok(/会议邀请/.test(String(rows1[0].subject || '')), '§1o the subject names the invitation', rows1[0])

  const inbox2 = await b.call('vibe_v5_inbox', { action: 'list', member: 'r-2' })
  const rows2 = (inbox2.rows || []).filter((r) => r.kind === 'meeting-invitation')
  ok(rows2.length === 1, '§1p r-2 has exactly one meeting invitation', inbox2.rows)
  ok(String(convened.meeting) !== '', '§1q the convention named the meeting the mail is about', convened.meeting)
}

console.log('\n=== 2. `woken` is empty when the deployment injects no wake seam — and the receipt says so ===')

{
  const b = await boot()
  await b.call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方', researcherCount: 2 })
  const convened = await b.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题'], title: '复验唤醒如实', formal_agenda: true })
  ok(convened.ok === true, '§2a the chair convened', convened)
  // kernel/index.js constructs createMeetings() WITHOUT a wake seam, so the wake rail refuses by name
  // (VMU_ENGINE_UNAVAILABLE) and the invitation must not print a fabricated success.
  ok(Array.isArray(convened.invitation.woken), '§2b `woken` is a list even when nobody could be woken', convened.invitation)
  ok(Array.isArray(convened.invitation.woken) && convened.invitation.woken.length === 0, '§2c no wake seam was injected, so nobody was woken', convened.invitation)
  ok(/wake seam|deployment/i.test(String(convened.invitation.means)), '§2d the means says WHY woken is empty', convened.invitation.means)
  ok(convened.invitation.delivered.length === 2, '§2e the durable half still went out', convened.invitation)
}

console.log('\n=== RESULT ===')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.log('failures:\n - ' + failures.join('\n - ')); process.exitCode = 1 }
