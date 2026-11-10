// tests/vmu-run236-refusal-attribution.test.mjs — RUN 236 M2: A REFUSED RECEIPT MUST ALSO SAY WHO TRIED.
//
// ★ THE DEFECT THIS FILE PINS (measured on a real machine, run 60 / FEEDBACK60.md M2). The attribution trio
// (`memberActed` / `actedForMember` / `callerMember`) appeared on SUCCESSFUL calls only. The four refusals recorded in
// that run — `attend` by a temp, `admit` of a member not waiting, `turn reply` with no pending member, `panel set` with
// a malformed field — carried none of it, so the receipts that most need an audit trail ("someone tried to speak for
// this seat and was refused") were the ones that said nothing about who had tried.
//
// WHY IT WAS SILENT, exactly: `host-pack-tools.js#discloseActOnSeat` returned `out` unchanged whenever `out.ok === false`
// ("refused calls refuse BEFORE they record anything in anyone's name"), and `host.js#toHostSpec`'s catch branch built a
// refusal receipt WITHOUT passing it through the disclosure at all. So both idiomatic refusal shapes — a returned
// `{ok:false,…}` and a thrown error — reached the caller unattributed.
//
// THE RULE THIS FILE ENFORCES (and the reason `memberActed:null` is a real answer):
//   · a refusal that NAMED a seated member says `memberActed:false` — the seat did NOT act in its own turn, and the
//     receipt records who TRIED (a refusal must never be readable as "that seat did this");
//   · a call that named NOBODY says `memberActed:null` — "nobody was named" is not "nobody did it";
//   · a name that is not on the roster also says `null`, with the reason stated;
//   · an already-disclosed receipt is returned untouched (idempotent — no second sentence, no overwritten verdict);
//   · success receipts keep the wording they already had (this task only adds the refusal half).
//
// Run: node tests/vmu-run236-refusal-attribution.test.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { toHostSpec } from '../vibe-math-vmu/host.js'
import { discloseActOnSeat } from '../vibe-math-vmu/host-pack-tools.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENTRY = join(resolve(HERE, '..'), 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}
const parse = (s) => (typeof s === 'string' ? JSON.parse(s) : s)
const trio = (r) => r && ({ memberActed: r.memberActed, actedForMember: r.actedForMember, callerMember: r.callerMember })

// ── the REAL assembly: the same entry, the same v5r pack, the same tool registry the host drives ────────────────────
const entry = await import(pathToFileURL(ENTRY).href)
async function boot() {
  const root = mkdtempSync(join(tmpdir(), 'vmu-r236-m2-'))
  const specs = []
  const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async (spec) => { specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, { clock: () => 1_800_000_000_000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (name) => specs.filter((s) => s && s.name === name)[0] || null
  const call = async (name, args = {}, as = null) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', tool: name }
    return parse(await spec.execute(args, as === null ? { kernel: handle.kernel } : { kernel: handle.kernel, agent: as }))
  }
  const close = () => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  return { call, close, kernel: handle.kernel }
}

console.log('=== 1. THE FOUR REFUSALS FROM RUN 60 NOW CARRY THE TRIO ===')
{
  const h = await boot()
  const start = await h.call('vibe_v5_start', { problem: 'attribution probe', researcherCount: 2 })
  ok(start.ok === true, 'assembly starts (a real boot, not a stub)', trio(start))
  const hired = await h.call('vibe_v5_hire', { purpose: 'probe', initial_task: 'probe temp', to: 'r-temp' })
  ok(hired.ok === true, 'a temp seat exists to be refused', trio(hired))
  const opened = await h.call('vibe_v5_meeting', { agenda: 'probe', type: 'academic', members: ['r-1', 'r-2'], member: 'r-acad' })
  ok(opened.ok === true && opened.meeting, 'a service meeting exists', { meeting: opened.meeting })

  // ① `attend` by a temp ⇒ VMU_NOT_PERMITTED. The seat is real, it named itself, and it may not attend.
  const attend = await h.call('vibe_vmu_meeting', { action: 'attend', id: opened.meeting, member: 'r-temp' })
  ok(attend.ok === false && attend.code === 'VMU_NOT_PERMITTED', '① attend by a temp is refused by name', { code: attend.code })
  ok(attend.memberActed === false && attend.actedForMember === 'r-temp' && attend.callerMember === null,
    '★① the refusal names the seat it was for, and says the seat did NOT act (office caller ⇒ callerMember:null)', trio(attend))
  ok(typeof attend.memberActedMeans === 'string' && /REFUSED/.test(attend.memberActedMeans),
    '★① and the sentence states the call was REFUSED — an attempt, not an act', attend.memberActedMeans)

  // ② `admit` a member that is not waiting ⇒ VMU_STATE (a state refusal, not a permission one).
  const admit = await h.call('vibe_vmu_meeting', { action: 'admit', id: opened.meeting, member: 'r-1', actor: 'r-acad' })
  ok(admit.ok === false && admit.code === 'VMU_STATE', '② admit of a member with no pendingLate row is refused by name', { code: admit.code })
  ok(admit.memberActed === false && admit.actedForMember === 'r-1' && admit.callerMember === null,
    '★② the state refusal still says who it was about, and that the seat did not act', trio(admit))
  ok(typeof admit.memberActedMeans === 'string' && /REFUSED/.test(admit.memberActedMeans) && /VMU_STATE/.test(admit.memberActedMeans),
    '★② the sentence names the refusal code, so "refused" cannot be read as "done"', admit.memberActedMeans)

  // ③ `turn reply` with no pending member ⇒ VMU_TURN_NO_PENDING_MEMBER. This call names NOBODY ⇒ memberActed must be null.
  const reply = await h.call('vibe_vmu_turn', { op: 'reply', reply_for: 'r-1', report: { say: 'x' } })
  ok(reply.ok === false && reply.code === 'VMU_TURN_NO_PENDING_MEMBER', '③ a reply with no open turn is refused by name', { code: reply.code })
  ok(reply.memberActed === null && reply.actedForMember === null && reply.callerMember === null,
    '★③ it named no member, so the honest answer is `memberActed:null` — not false, not silence', trio(reply))
  ok(typeof reply.memberActedMeans === 'string' && /named no member/.test(reply.memberActedMeans),
    '★③ and the sentence distinguishes "nobody was named" from "nobody did it"', reply.memberActedMeans)

  // ④ `panel set` with a malformed field ⇒ VMU_INVALID_ARGUMENT (the argument was wrong, the seat is still named).
  const panel = await h.call('vibe_vmu_panel', { action: 'set', member: 'r-1', overall: { a: 1 } })
  ok(panel.ok === false && panel.code === 'VMU_INVALID_ARGUMENT', '④ a malformed panel field is refused by name', { code: panel.code })
  ok(panel.memberActed === false && panel.actedForMember === 'r-1' && panel.callerMember === null,
    '★④ the argument refusal says whose panel was being written, and that the seat did not act', trio(panel))

  // A refusal keeps its own content untouched — the disclosure is an ENVELOPE, not a rewrite.
  ok(/overall is text/.test(String(panel.message)) && typeof panel.hint === 'string' && panel.hint !== '',
    'the refusal message/hint are the tool\'s own, unchanged by the envelope', { message: String(panel.message).slice(0, 60) })

  // ⑤ the SAME call from the seat that owns it: the seat ran the call, the call was still refused ⇒
  // `memberActed:false` plus a sentence that says the attempt failed before any act (a refusal is never an act).
  const panelSelf = await h.call('vibe_vmu_panel', { action: 'set', member: 'r-1', plan: [{ a: 1 }] }, { id: 'r-1' })
  ok(panelSelf.ok === false && panelSelf.memberActed === false && panelSelf.callerMember === 'r-1',
    '★⑤ even when the named seat IS the caller, a refusal says memberActed:false (the attempt is not the act)', trio(panelSelf))
  ok(/failed before any act/.test(String(panelSelf.memberActedMeans)),
    '★⑤ and says so in words, so the receipt cannot be read as "that seat did this"', panelSelf.memberActedMeans)

  h.close()
}

console.log('=== 2. NOBODY NAMED: A SUCCESS STAYS SILENT, A REFUSAL MUST SPEAK ===')
{
  const h = await boot()
  await h.call('vibe_v5_start', { problem: 'unnamed probe', researcherCount: 2 })
  const listed = await h.call('vibe_vmu_records', { track: 'state' })
  ok(listed.ok === true, 'a read with no member named succeeds', { code: listed.code })
  // ★ THE DELIBERATE HALF-SILENCE (RUN 236 / M2): every kernel-face READ names no seat, and those receipts have
  // read-size ceilings of their own (vmu-host.test.mjs measures the default status summary < 10000 chars and the
  // closure face < 1500). Stamping four attribution keys on all of them would trade a real readability property for a
  // sentence nobody asked. So a successful, unnamed call stays silent — and that silence is not a claim about anyone.
  ok(listed.memberActed === undefined && listed.actedForMember === undefined && listed.callerMember === undefined,
    '★ an unnamed SUCCESS stays silent — no invented keys on every read receipt', trio(listed))
  ok(listed.memberActedMeans === undefined, '★ and no sentence is added where there is no question', listed.memberActedMeans)
  h.close()
}

console.log('=== 3. SUCCESS KEEPS ITS OWN WORDING (the refusal half did not change it) ===')
{
  const h = await boot()
  await h.call('vibe_v5_start', { problem: 'success probe', researcherCount: 2 })
  const byOffice = await h.call('vibe_v5_record_progress', { member: 'r-1', content: 'attribution probe', track: 'progress' })
  ok(byOffice.ok === true && byOffice.memberActed === false && byOffice.actedForMember === 'r-1' && byOffice.callerMember === null,
    '★ office writing in a seat\'s name still says memberActed:false', trio(byOffice))
  // ★ RUN 76 / TB-2710: THE OLD PIN DESCRIBED A WORLD THAT NO LONGER HOLDS. `memberActed:false` used to be explained
  // as "the seat did not act in its own turn" — but that sentence became FALSE for a DELIVERED turn (the office calls
  // the tool, a child session of the seat runs the member turn), which is exactly the run-76 defect. The claim this
  // probe pins is unchanged (an office write in a seat name is NOT the seat acting: this write-face call reported no
  // delivered turn), and only the sentence became precise about the two facts it used to conflate.
  ok(/NO delivered turn for that seat was reported/.test(String(byOffice.memberActedMeans))
    && /memberActed:false/.test(String(byOffice.memberActedMeans)),
    '★ the success sentence separates written-in-the-seat-name from a delivered turn (this probe has none)', byOffice.memberActedMeans)
  const bySeat = await h.call('vibe_v5_record_progress', { member: 'r-1', content: 'own probe', track: 'progress' }, { id: 'r-1' })
  ok(bySeat.ok === true && bySeat.memberActed === true && bySeat.callerMember === 'r-1',
    '★ the seat acting in its own turn still says memberActed:true', trio(bySeat))
  h.close()
}

console.log('=== 4. THE ENVELOPE IS IDEMPOTENT AND SAFE ON NON-OBJECTS ===')
{
  const spec = toHostSpec({
    name: 'vibe_test_stamped', description: 'test-only face', parameters: {},
    run: async () => ({ ok: false, code: 'VMU_TEST', message: 'already stamped', memberActed: true, actedForMember: 'x', callerMember: 'x' }),
  })
  const receipt = parse(await spec.execute({ member: 'r-1' }, {}))
  ok(receipt.memberActed === true && receipt.actedForMember === 'x' && receipt.callerMember === 'x',
    '★ an already-disclosed receipt is returned untouched (no second sentence, no overwritten verdict)', trio(receipt))
  ok(receipt.memberActedMeans === undefined, '★ and the disclosure does not append a contradicting sentence', receipt.memberActedMeans)
  const arr = [1, 2, 3]
  ok(discloseActOnSeat(null, null, { member: 'r-1' }, arr) === arr, '★ a non-object result passes through by identity', typeof arr)
  ok(discloseActOnSeat(null, null, { member: 'r-1' }, 'text') === 'text', '★ and so does a string', typeof 'text')
  const offRoster = discloseActOnSeat(null, null, { member: 'r-not-a-seat' }, { ok: false, code: 'VMU_TEST' })
  ok(offRoster.memberActed === null && offRoster.actedForMember === 'r-not-a-seat',
    '★ a name that is not a seat answers null (with the name kept), not false', trio(offRoster))
  ok(/not a seat on the roster/.test(String(offRoster.memberActedMeans)),
    '★ and says which question it cannot answer', offRoster.memberActedMeans)
}

console.log('=== VMU RUN 236 REFUSAL ATTRIBUTION: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
