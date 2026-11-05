// tests/vmu-run240-turn-receipts.test.mjs — ROUND 240 / task-43 (FEEDBACK63 ①4 · ①5 · ①9).
//
// TWO DEFECTS THE OFFICE MEASURED ON A REAL HOST, both in the turn face:
//
//   A (①5, the severe one): a member turn was in flight; the office spoke through `op:"reply"` (accepted:true,
//     source:"tool", via:"in-flight"), then the child delivered a fenced reply carrying the SAME field with a
//     DIFFERENT value. The receipt rules text says that is refused by name (`VMU_TURN_REPLY_CONFLICT`), but the
//     measured result was `counts.notExecuted:2` and NO code anywhere: a silent non-execution. The conflict refusal
//     also named only the field ("disagree on: progress"), never the two values, so a reader could not tell whether
//     the channels really differed. Now: the refusal message carries `field (tool report: <v> vs fenced json: <v>)`,
//     the error carries `conflictRows` with both canonical values, and every field counted in `notExecuted` appears
//     in `skipped` WITH a `code` (`apply().notExecutedMeans` states that invariant).
//
//   B (①4/①9): a turn completed by a wait wake had no receipt back at the office — `op:"status"` only reported
//     tallies (`opened/assembled/delivered/notExecuted`). The office had to reconstruct which cards the member wrote
//     from the record tracks. Now: `status()` carries `turnReceipts` (the last 50 turns) and the tool face exposes it
//     as `turns[]`: who, which door opened it (`openedBy`), executed fields + channel, skipped fields + reason/code,
//     writes with ids, refusal codes, and a named `unavailable` list for what this kernel cannot see (a member's tool
//     calls in its own child session) — "I cannot see it" is never spelled as an empty list.
//
// §0 the two repairs are named shapes in the source and the docs
// §A a two-channel conflict is refused BY NAME with both values; equal values merge into one dispatch
// §B `turns[]` reads a drive-settled turn AND a wait-opened turn, openedBy included, unavailable named
// §C the tool read face (`vibe_vmu_turn { op:"status" }`) exposes the same list
//
// Run: node tests/vmu-run240-turn-receipts.test.mjs   Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const KERNEL_TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const TOOLS_TURN = join(REPO, 'vibe-math-vmu', 'tools', 'turn.js')
const DOCS03 = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')
const DOCS26 = join(REPO, 'vibe-math-vmu', 'docs', '26-turn-orchestration.md')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const kernelTurn = await import(pathToFileURL(KERNEL_TURN).href)
const turnSource = await readFile(KERNEL_TURN, 'utf8')
const toolsSource = await readFile(TOOLS_TURN, 'utf8')
const docs03 = await readFile(DOCS03, 'utf8')
const docs26 = await readFile(DOCS26, 'utf8')

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const codeOf = (e) => (e && (e.code || (e.refusal && e.refusal.code))) || null
const attempt = async (fn) => {
  try { return { threw: false, value: await fn() } } catch (e) {
    return { threw: true, code: codeOf(e), message: e && e.message, hint: e && e.hint, conflictRows: e && e.conflictRows, conflicts: e && e.conflicts }
  }
}

// ── a FAKE FACES table: what matters is what REACHED the face, not what a receipt claims ────────────────────────
const makeFaces = () => {
  const puts = []
  const faces = kernelTurn.facesFrom({
    records: {
      put: async (payload) => { puts.push(payload); return { ok: true, recordId: 'rec-' + puts.length } },
      list: async () => ({ ok: true, rows: [] }),
    },
  })
  return { faces, puts }
}

// deliver seam that plays the member in its OWN session and returns a fenced reply (the delegated shape).
const textSeam = (makeReply) => async ({ turn }) => ({ reply: makeReply(turn), deliveryPath: 'fake-delegated' })

const { createTurnOrchestrator, deliverByReturning } = kernelTurn
const makeGov = (deliver, extra = {}) => {
  const { faces, puts } = makeFaces()
  const gov = createTurnOrchestrator(Object.assign({
    sectionPolicy: (ctx) => ({ sections: [] }),
    prompt: { assemble: async () => ({ ok: true, text: 'probe prompt', sources: [] }), assembleFor: async () => ({ ok: true, text: 'probe prompt' }) },
    faces,
    deliver: deliver || deliverByReturning(),
  }, extra))
  return { gov, puts }
}

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r240-')); roots.push(d); return d }
const boot = async (root) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, deliverMode: 'caller', turn: true })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, specs: state.specs }
}

try {
  // ── §0 SOURCE + DOCS: the repairs are named shapes, and the docs say the same thing ──────────────────────────
  {
    console.log('§0 both repairs are named shapes in the source, and the contract says them')
    ok(turnSource.includes('conflictRows'), '§0a the conflict refusal carries `conflictRows` (both canonical values)', turnSource.includes('conflictRows'))
    ok(turnSource.includes('tool report: ') && turnSource.includes('fenced json: '),
      '§0b the conflict message prints BOTH values, each labelled by its channel')
    ok(turnSource.includes("code: 'VMU_TURN_FACE_NOT_WIRED'"),
      '§0c a face-not-wired skip row carries a code (no code-less non-execution)')
    ok(turnSource.includes("code: 'VMU_TURN_DUPLICATE_SKIPPED'"),
      '§0d the duplicate-skip rows carry a code too')
    ok(turnSource.includes('notExecutedMeans'), '§0e apply() states the count=rows invariant by name')
    ok(turnSource.includes('turnReceipts') && turnSource.includes('turnReceiptsMeans'),
      '§0f the loop keeps a per-turn ledger and says what it is (host bookkeeping)')
    ok(turnSource.includes("openedBy: openedBy ===") || turnSource.includes('openedBy = null'),
      '§0g open()/the ledger carry who opened the turn')
    ok(toolsSource.includes('turns: perTurn'), '§0h the tool read face exposes the ledger as `turns`', toolsSource.includes('turns: perTurn'))
    ok(docs03.includes('conflictRows') && docs03.includes('turns[]'),
      '§0i docs/03 registers both new receipt facts (conflictRows + turns[])')
    ok(docs26.includes('### 回合面') && (docs26.includes('FEEDBACK63 ①4') || docs26.includes('FEEDBACK63 ①5')),
      '§0j docs/26 has the ROUND 240 turn-face subsection')
  }

  // ── §A THE TWO-TRUTH REFUSAL: BOTH VALUES, AND NOTHING DISPATCHED ────────────────────────────────────────────
  {
    console.log('§A the two channels disagree: refused by name, with both values, before any dispatch')
    const r = await attempt(() => kernelTurn.mergeReplyChannels({ progress: '甲：工具通道写的进展' }, { progress: '乙：围栏里写的另一句' }))
    ok(r.threw === true && r.code === 'VMU_TURN_REPLY_CONFLICT',
      '§Aa the merge refuses by name (VMU_TURN_REPLY_CONFLICT)', { code: r.code, message: r.message && r.message.slice(0, 120) })
    ok(String(r.message || '').includes('tool report:') && String(r.message || '').includes('fenced json:'),
      '§Ab the message NAMES both channels', r.message && r.message.slice(0, 240))
    ok(String(r.message || '').includes('甲：工具通道写的进展') && String(r.message || '').includes('乙：围栏里写的另一句'),
      '§Ac and prints BOTH VALUES (a reader can decide without guessing)', r.message && r.message.slice(0, 240))
    ok(Array.isArray(r.conflictRows) && r.conflictRows.length === 1 &&
      r.conflictRows[0].field === 'progress' &&
      String(r.conflictRows[0].tool).includes('甲') && String(r.conflictRows[0].fenced).includes('乙'),
      '§Ad the refusal carries conflictRows:[{field,tool,fenced}]', r.conflictRows)
    ok(Array.isArray(r.conflicts) && r.conflicts.includes('progress'),
      '§Ae and the bare field list is still there (old readers keep working)', r.conflicts)
  }
  {
    // the same conflict, but THROUGH the real dispatch path: a delegated seam writes the tool report mid-flight and
    // then returns a fenced reply that disagrees. Nothing may reach the records face.
    console.log('§A a mid-flight tool report conflicting with the delivered fence refuses the TURN, and no field lands')
    let gov = null
    const seam = async ({ turn }) => {
      await gov.supplyStructuredReply({ progress: '工具通道：我在飞的那一轮写了这句' }, { forMember: turn.member })
      return { reply: fence({ progress: '围栏通道：完全不同的一句' }), deliveryPath: 'fake-delegated' }
    }
    const made = makeGov(seam)
    gov = made.gov
    const res = await gov.drive({ members: [{ id: 'm-1' }], rounds: 1, phase: 'normal', why: 'run240 conflict probe' })
    const receipt = (res.receipts && res.receipts[0]) || (res.receipt || {})
    ok(receipt && receipt.code === 'VMU_TURN_REPLY_CONFLICT',
      '§Af the loop receipt is the NAMED refusal (not a tally, not a silent skip)', receipt && { code: receipt.code, ok: receipt.ok })
    ok(String(receipt && receipt.message || '').includes('工具通道：我在飞的那一轮写了这句') &&
      String(receipt && receipt.message || '').includes('围栏通道：完全不同的一句'),
      '§Ag the receipt message carries both values through the loop as well', receipt && String(receipt.message).slice(0, 240))
    ok(made.puts.length === 0,
      '§Ah NOTHING was dispatched: the conflict is refused BEFORE the face is touched', { puts: made.puts.length })
  }
  {
    console.log('§A both channels carry the SAME value: merged, one dispatch, and counts says so')
    let gov = null
    const seam = async ({ turn }) => {
      await gov.supplyStructuredReply({ progress: '两通道同一句：定义已固定，下一步给出引理。' }, { forMember: turn.member })
      return { reply: fence({ progress: '两通道同一句：定义已固定，下一步给出引理。' }), deliveryPath: 'fake-delegated' }
    }
    const made = makeGov(seam)
    gov = made.gov
    const res = await gov.drive({ members: [{ id: 'm-1' }], rounds: 1, phase: 'normal', why: 'run240 same value probe' })
    const receipt = (res.receipts && res.receipts[0]) || (res.receipt || {})
    ok(res.ok === true && receipt && receipt.ok !== false && receipt.code === undefined,
      '§Ai equal values do not refuse the turn', receipt && { ok: receipt.ok, code: receipt.code })
    ok(receipt && receipt.source === 'tool+text',
      '§Aj the receipt names both channels as its source (tool+text)', receipt && receipt.source)
    ok(receipt && receipt.executed === 1 && receipt.skipped === 0,
      '§Ak exactly ONE dispatch and nothing held back (two channels, same value = one truth)', receipt && { executed: receipt.executed, skipped: receipt.skipped })
    ok(made.puts.length === 1, '§Al the records face received exactly one progress row', { puts: made.puts.length })
    ok(Array.isArray(receipt && receipt.sameValueFields) && receipt.sameValueFields.includes('progress'),
      '§Al2 the receipt NAMES the fields both channels agreed on (merged, not dropped)', receipt && receipt.sameValueFields)
    ok(typeof (receipt && receipt.replyChannelsMeans) === 'string' && receipt.replyChannelsMeans.length > 0,
      '§Al3 and says the agreed field was counted once', receipt && receipt.replyChannelsMeans && receipt.replyChannelsMeans.slice(0, 120))
  }
  {
    console.log('§A every not-executed field is named WITH a code (the run-63 silent class is closed)')
    const made = makeGov(deliverByReturning())
    const parked = await made.gov.drive({ members: [{ id: 'm-2' }], rounds: 1, phase: 'normal', why: 'run240 unbound say' })
    ok(parked.awaiting === true, '§Am a caller-played turn parks (so the reply channel is the one supplied next)', parked && parked.awaiting)
    await made.gov.supplyMemberReply(fence({ say: '没有会议绑定时说的一句' }), 'm-2')
    const done = await made.gov.step({ members: [{ id: 'm-2' }], phase: 'normal' })
    const receipt = (done.receipt || {})
    const skipped = Array.isArray(receipt.skippedDetail) ? receipt.skippedDetail : (Array.isArray(receipt.skipped) ? receipt.skipped : [])
    ok(skipped.length > 0, '§An there IS a skipped row for the unbound speech (nothing vanished silently)', skipped)
    const sayRow = skipped.find((s) => s && s.field === 'say') || null
    ok(sayRow !== null && typeof sayRow.code === 'string' && sayRow.code === 'VMU_TURN_FIELD_NOT_APPLICABLE',
      '§Ao the skipped say row carries VMU_TURN_FIELD_NOT_APPLICABLE', sayRow)
    const applied = await made.gov.apply({ say: '另一句不进会议的话' })
    ok(Array.isArray(applied.skipped) && applied.skipped.length === 1 && applied.skipped[0].code === 'VMU_TURN_FIELD_NOT_APPLICABLE',
      '§Ap apply() names the skipped say WITH its code', applied.skipped)
    ok(typeof applied.notExecutedMeans === 'string' && applied.notExecutedMeans.includes('VMU_TURN_FIELD_NOT_APPLICABLE'),
      '§Aq apply() states the count=rows invariant by name', applied.notExecutedMeans && applied.notExecutedMeans.slice(0, 120))
  }

  // ── §B THE PER-TURN LEDGER: A WAIT-WOKEN TURN HAS A HOME ────────────────────────────────────────────────────
  {
    console.log('§B status() carries turns[]: a drive-settled turn is readable, with who opened it')
    const made = makeGov(textSeam(() => fence({ progress: '这一轮的真实进展写在记录轨上', say: '排放的一句话（无会议绑定）' })))
    const res = await made.gov.drive({ members: [{ id: 'm-3' }], rounds: 1, phase: 'normal', why: 'run240 drive ledger' })
    const receipt = (res.receipts && res.receipts[0]) || (res.receipt || {})
    const st = made.gov.status()
    ok(Array.isArray(st.turnReceipts) && st.turnReceipts.length > 0,
      '§Ba status() carries turnReceipts (an array, not a tally)', st.turnReceipts && st.turnReceipts.length)
    ok(typeof st.turnReceiptsMeans === 'string' && st.turnReceiptsMeans.includes('HOST BOOKKEEPING'),
      '§Bb and says what it is: host bookkeeping, not the member intent', st.turnReceiptsMeans && st.turnReceiptsMeans.slice(0, 100))
    const row = st.turnReceipts.find((r) => r && r.turn === (receipt && receipt.turn)) || null
    ok(row !== null, '§Bc the settled turn has a row keyed by its t-<n> id', { row, turn: receipt && receipt.turn })
    ok(row && row.openedBy === 'drive', '§Bd openedBy says `drive` (the caller opened it)', row && row.openedBy)
    ok(row && row.status === 'applied', '§Be the row is settled as applied', row && row.status)
    ok(row && Array.isArray(row.executed) && row.executed.length > 0 && row.executed.every((e) => e && typeof e.channel === 'string'),
      '§Bf executed rows name the field AND the channel it went through', row && row.executed)
    ok(row && Array.isArray(row.skipped) && row.skipped.length > 0 && row.skipped.every((s) => s && typeof s.code === 'string'),
      '§Bg skipped rows in the ledger carry a code as well', row && row.skipped)
    ok(row && Array.isArray(row.unavailable) && row.unavailable.length > 0,
      '§Bh unavailable is non-empty for a delegated delivery (what the kernel cannot see is named)', row && row.unavailable)
  }
  {
    console.log('§B a turn opened by a wait wake keeps its own row, status open, and names what is not readable yet')
    const made = makeGov(deliverByReturning())
    const opened = made.gov.open({ member: 'm-wait', phase: 'normal', openedBy: 'wait' })
    ok(opened && opened.ok === true && opened.turn && opened.turn.openedBy === 'wait',
      '§Bi open() records the door that opened the turn', opened && opened.turn && opened.turn.openedBy)
    const st = made.gov.status()
    const row = st.turnReceipts.find((r) => r && r.turn === opened.turn.id) || null
    ok(row !== null && row.openedBy === 'wait' && row.status === 'open',
      '§Bj the ledger row says `wait` and `open` (a wake-opened turn is visible before it settles)', row && { openedBy: row.openedBy, status: row.status })
    ok(row && Array.isArray(row.unavailable) && row.unavailable.length > 0 &&
      row.unavailable.some((u) => u && u.field === 'reply'),
      '§Bk and `unavailable` names the reply as not-yet-readable (never an empty list)', row && row.unavailable)
    const act = made.gov.open({ member: 'm-act', phase: 'normal', openedBy: 'activation' })
    const actRow = made.gov.status().turnReceipts.find((r) => r && r.turn === act.turn.id) || null
    ok(actRow !== null && actRow.openedBy === 'activation',
      '§Bl the activation door is recorded by the same name', actRow && actRow.openedBy)
  }

  // ── §C THE TOOL READ FACE: THE OFFICE CAN ASK AND SEE ───────────────────────────────────────────────────────
  {
    console.log('§C vibe_vmu_turn { op:"status" } returns the per-turn list the office was missing')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const parked = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run240 tool status probe' })
    ok(parked.awaiting === true, '§Ca a caller-played turn parks so the reply happens in the same kernel', parked && parked.awaiting)
    await b.K.turn.supplyMemberReply(fence({ say: '一句不进会议的话' }), 'r-1')
    const done = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run240 tool status settle' })
    ok(done && done.ok === true, '§Cb the parked turn completes', done && { ok: done.ok })
    const spec = b.specs.find((s) => s.name === 'vibe_vmu_turn')
    ok(!!spec && typeof spec.execute === 'function', '§Cc the turn tool is registered on the assembled host')
    const text = await spec.execute({ op: 'status' }, {})
    ok(typeof text === 'string', '§Cd the face answers with a JSON string like every other face', typeof text)
    const parsed = JSON.parse(text)
    ok(parsed.ok === true && Array.isArray(parsed.turns), '§Ce the status receipt carries turns[]', parsed && parsed.turns && parsed.turns.length)
    const row = (parsed.turns || []).find((r) => r && r.member === 'r-1' && r.status === 'applied') || null
    ok(row !== null && row.openedBy === 'drive' && row.status === 'applied',
      '§Cf the settled member turn is in the list, opened by drive', row && { member: row.member, openedBy: row.openedBy, status: row.status })
    ok(row && Array.isArray(row.skipped) && row.skipped.length > 0 && row.skipped.some((s) => s && s.field === 'say' && typeof s.code === 'string'),
      '§Cg the skipped say is there WITH its code', row && row.skipped)
    ok(typeof parsed.turnsMeans === 'string' && parsed.turnsMeans.length > 0,
      '§Ch the face says what turns[] means', parsed.turnsMeans && parsed.turnsMeans.slice(0, 100))
    // ★ the DOOR is a caller fact: a Meeting wake that the office settles is not the office opening a turn by hand, and
    // the tool face is the only place that distinction can enter - so `opened_by:"wait"` must reach the ledger row.
    await b.K.members.hire({ id: 'r-2', slot: 'member' })
    const waitText = await spec.execute({ op: 'step', members: [{ id: 'r-2' }], phase: 'normal', why: 'run240 wake probe', opened_by: 'wait' }, {})
    const waitParsed = JSON.parse(waitText)
    ok(waitParsed.ok === true && waitParsed.awaiting === true, '§Ci a step with opened_by:"wait" opens (parks) a turn normally', waitParsed && { ok: waitParsed.ok, awaiting: waitParsed.awaiting })
    const after = JSON.parse(await spec.execute({ op: 'status' }, {}))
    const waitRow = (after.turns || []).find((r) => r && r.member === 'r-2') || null
    ok(waitRow !== null && waitRow.openedBy === 'wait',
      '§Cj opened_by:"wait" reaches the ledger: the row names the wake door, not drive', waitRow && { member: waitRow.member, openedBy: waitRow.openedBy, status: waitRow.status })
    await rm(root, { recursive: true, force: true })
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(NL + '=== VMU RUN240 TURN RECEIPTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }
