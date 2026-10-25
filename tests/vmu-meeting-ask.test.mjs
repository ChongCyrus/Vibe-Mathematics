// tests/vmu-meeting-ask.test.mjs — ROUND 19: 「待辩论会议结束，v5r框架请刚刚辩论的各个成员给出最终裁决」.
//
// THE DEFECT CLASS THIS PINS (measured, not read):
//   the ask face derived "who debated" from SPEECH ALONE (`spokeBy`/`minutes`), so a member the meeting had rostered
//   but who had not spoken yet was invisible. Live run 26 asked 1 of 2 debating members while the ruling's own
//   completeness gate compared against the whole electorate — the two sides disagreed about the same population.
//   And a refused delivery still came back `ok:true` with `delivered:[]`, whose `means` said 「the ask is on the members
//   record now」: the comfortable zero the face's own doc comment claims to avoid.
//
// WHAT IS ASSERTED (both directions, every state READ BACK):
//   ① setup: three members exist and the pack-convened meeting really rosters all three (RULE E: the count is read);
//   ② NOBODY SPOKE YET and the ask still names BOTH non-chair members — the roster is the debate, not the speakers;
//   ③ a member with no speech on record is really asked (his inbox holds one `final-ruling-request`);
//   ④ the receipt separates what it reached from what it did not, and its `means` does not claim a partial ask succeeded;
//   ⑤ one reachable + one unreachable target ⇒ `partialAsk:true`, delivered/failed both non-empty and named;
//   ⑥ every target unreachable ⇒ a NAMED refusal `VMU_ASK_NOTHING_DELIVERED` (never `ok:true` with zero delivered);
//   ⑦ only the chair signs the ask (`VMU_NOT_PERMITTED`), and the refusal names the chair;
//   ⑧ the ask must name the proposition (`VMU_INVALID_ARGUMENT`) — asking "the probability" of nothing is not an ask.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(ENTRY).href)

let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true, raw: undefined }
  let parsed
  let raw
  try { raw = await spec.execute(args, {}); parsed = JSON.parse(raw) } catch (e) { parsed = undefined; raw = String(e && e.message) }
  return { parsed, raw, missing: false }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-meeting-ask-'))
const b = await boot({ root, packs: ['v5r'] })
const kernel = b.handle.kernel
const svc = kernel.meetings
await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })
await kernel.members.hire({ id: 'r-2', slot: 'member' })

// ── ① THE PACK CONVENES A MEETING THAT ROSTERS ALL THREE ─────────────────────────────────────────────────────
console.log('=== 1. SETUP: THE MEETING ROSTERS THE WHOLE INSTITUTE ===')
const convened = await call(b, 'vibe_v5_meeting', { agenda: 'R19 请各成员给最终裁决', kind: 'verify-request', member: 'r-chair' })
const mid = convened.parsed && convened.parsed.meeting
ok(convened.parsed && convened.parsed.ok === true && typeof mid === 'string' && mid !== '',
  'setup: the pack convened a SERVICE meeting (id from the pack receipt)', convened.parsed && { meeting: mid, code: convened.parsed.code })
const view = svc.meetingView({ meeting: mid })
ok(Array.isArray(view.roster) && view.roster.length === 3 && view.roster.includes('r-2'),
  '① `meetingView` now carries the ROSTER as a readable fact (count read back, RULE E: non-empty and exact)',
  { roster: view.roster, present: view.presentCount })
const spoke0 = svc.spokeBy({ meeting: mid })
ok(spoke0 && Array.isArray(spoke0.spokeBy) && spoke0.spokeBy.length === 0,
  '① nobody has spoken yet — so a speech-derived ask would be empty (the state the old code could not tell apart)',
  { spokeBy: spoke0 && spoke0.spokeBy })

// ── ② THE ROSTER IS THE DEBATE ───────────────────────────────────────────────────────────────────────────────
console.log('=== 2. THE ASK NAMES BOTH MEMBERS EVEN THOUGH NOBODY SPOKE ===')
const asked = await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-demo' })
const ap = asked.parsed || {}
ok(ap.ok === true && Array.isArray(ap.asked) && ap.asked.length === 2 && ap.asked.includes('r-1') && ap.asked.includes('r-2'),
  '② BOTH non-chair members are asked (the roster, not the speaker list)', { asked: ap.asked, code: ap.code })
ok(ap.askedSource === 'roster+speech' || ap.askedSource === 'roster',
  '② the receipt names WHICH source produced the set', { askedSource: ap.askedSource })
ok(ap.asked.includes('r-chair') === false,
  '② the CHAIR is not asked (the chair signs the ask — asking yourself is not a debate)', { asked: ap.asked })

// ── ③ THE SILENT MEMBER REALLY RECEIVED A MESSAGE ──────────────────────────────────────────────────────────
console.log('=== 3. THE MEMBER WHO NEVER SPOKE REALLY HAS THE ASK IN HIS INBOX ===')
const inbox = kernel.mailbox.list('r-2', { status: 'all' })
const kinds = (inbox && inbox.entries ? inbox.entries : []).map((e) => String(e.kind))
ok(inbox && inbox.count >= 1 && kinds.includes('final-ruling-request'),
  '③ r-2 (never spoke) holds exactly the ask the framework claims to have sent (RULE E: non-empty, kind named)',
  { count: inbox && inbox.count, kinds })
ok(kernel.mailbox.list('r-1', { status: 'all' }).count >= 1,
  '③ and so does r-1 — the ask went to the whole debating set, not to one member', { count: kernel.mailbox.list('r-1').count })

// ── ④ THE RECEIPT SEPARATES REACHED FROM NOT REACHED ───────────────────────────────────────────────────────
console.log('=== 4. FULL DELIVERY IS NOT THE SAME FACT AS PARTIAL DELIVERY ===')
ok(ap.deliveredCount === 2 && ap.failedCount === 0 && ap.partialAsk === false,
  '④ a full ask reports 2 delivered / 0 failed / partialAsk:false (three numbers, not a claim)',
  { deliveredCount: ap.deliveredCount, failedCount: ap.failedCount, partialAsk: ap.partialAsk })
ok(typeof ap.partialAskMeans === 'string' && ap.partialAskMeans.includes('every member'),
  '④ and the means sentence says every intended member was reached', { means: String(ap.partialAskMeans).slice(0, 160) })

// ── ⑤ ONE REACHABLE + ONE UNREACHABLE ──────────────────────────────────────────────────────────────────────
console.log('=== 5. PARTIAL DELIVERY IS NAMED, NOT AVERAGED WITH SUCCESS ===')
const partial = await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-demo', members: ['r-1', 'ghost-9'] })
const pp = partial.parsed || {}
const ghostFailed = Array.isArray(pp.failed) ? pp.failed.filter((f) => String(f.to) === 'ghost-9') : []
ok(pp.ok === true && pp.deliveredCount === 1 && pp.failedCount === 1 && pp.partialAsk === true,
  '⑤ one bad target makes the receipt PARTIAL (delivered 1 / failed 1), never a silent success',
  { delivered: pp.delivered, failed: pp.failed, partialAsk: pp.partialAsk })
ok(ghostFailed.length === 1 && typeof ghostFailed[0].code === 'string' && ghostFailed[0].code !== '',
  '⑤ the unreachable member is named WITH a code — a reader learns why he was not asked',
  { failed: pp.failed })
ok(typeof pp.partialAskMeans === 'string' && pp.partialAskMeans.includes('reached 1 of 2'),
  '⑤ the means sentence states the population that was actually reached', { means: String(pp.partialAskMeans).slice(0, 200) })

// ── ⑥ NOTHING DELIVERED IS A NAMED REFUSAL ────────────────────────────────────────────────────────────────
console.log('=== 6. AN ASK THAT REACHED NOBODY IS REFUSED BY NAME ===')
const none = await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-demo', members: ['ghost-1', 'ghost-2'] })
const np = none.parsed || {}
ok(np.ok === false && np.code === 'VMU_ASK_NOTHING_DELIVERED',
  '⑥ zero delivered is `VMU_ASK_NOTHING_DELIVERED`, not `ok:true` with an empty list',
  { ok: np.ok, code: np.code, message: String(np.message || '').slice(0, 200) })
ok(typeof np.hint === 'string' && np.hint.includes('members:['),
  '⑥ the refusal says how to proceed (a rail with a door)', { hint: String(np.hint || '').slice(0, 200) })

// ── ⑦ ONLY THE CHAIR SIGNS ────────────────────────────────────────────────────────────────────────────────
console.log('=== 7. THE ASK IS A CHAIR ACT ===')
const notChair = await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-demo', member: 'r-1' })
const nc = notChair.parsed || {}
ok(nc.ok === false && nc.code === 'VMU_NOT_PERMITTED' && String(nc.message || '').includes('r-chair'),
  '⑦ a member cannot ask on the chair\'s behalf, and the refusal names who CAN', { code: nc.code, message: String(nc.message || '').slice(0, 160) })

// ── ⑧ THE PROPOSITION MUST BE NAMED ──────────────────────────────────────────────────────────────────────
console.log('=== 8. NO PROPOSITION, NO ASK ===')
const noProp = await call(b, 'vibe_v5_verdict_ask', { meeting: mid })
const npr = noProp.parsed || {}
ok(npr.ok === false && npr.code === 'VMU_INVALID_ARGUMENT',
  '⑧ asking for "the probability" without naming the proposition is refused by name', { code: npr.code })

console.log('\n=== VMU MEETING ASK: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
