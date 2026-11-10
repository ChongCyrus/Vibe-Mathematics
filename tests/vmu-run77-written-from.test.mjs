// RUN 77 / TB-2723: a row must not say `writtenFrom:"relayed"` when the same turn receipt says the
// seat itself ran the turn (`deliveryPath:"activation"` / `"continuation"`). One fact, one reading.
// fs-purpose: audit — this suite reads three source files for exact pins and only writes under its own temp roots.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Derive the repo root from this file's own location: a hard-coded checkout path makes the suite pass only on the
// machine that wrote it (and the portability gate refuses a new absolute checkout path, correctly).
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const NL = '\n'
const fence = (o) => ['```json', JSON.stringify(o), '```'].join(NL)

const ENTRY = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const RECORDS_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
const TURN_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
const KERNEL_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
const DOC_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md'), 'utf8')

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name); return }
  failed += 1
  console.log('  FAIL ' + name + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
}
const ROOTS = []

function boot({ deliverMode = 'subagents', activationOnly = false } = {}) {
  const state = { specs: [], seen: [], seq: 0 }
  const rootAgent = { options: { provider: 'sim', model: 'sim' }, session: { id: 'sim-session', header: { id: 'sim-session' } } }
  const answer = async (kind, provider, request) => {
    state.seq += 1
    const text = String(request && Array.isArray(request.prompt) && request.prompt[0] ? request.prompt[0].text : '')
    state.seen.push({ kind, provider, chars: text.length })
    const reply = fence({ progress: 'r-1 自己写的进展：引理 ' + state.seq + ' 已完成。' })
    const result = { output: [{ type: 'text', text: reply }], stopReason: 'end_turn' }
    return { childId: 'sim-child-' + state.seq, messageId: 'sim-msg-' + state.seq, result: Promise.resolve(result), dispose: async () => {} }
  }
  const subs = {
    list: () => ['sim'],
    interrupt: async () => {},
    sendMessage: async () => 'sim-msg',
    startActivation: async (spec) => answer('activation', spec && spec.provider, spec && spec.request),
  }
  if (!activationOnly) subs.start = async (provider, request) => answer('one-shot', provider, request)
  const agents = { list: () => ['sim-session'], get: () => rootAgent, currentInitiator: () => rootAgent }
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    get: (name) => (name === 'subagents' ? subs : (name === 'agents' ? agents : null)),
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const root = mkdtempSync(join(tmpdir(), 'vmu-wf-'))
  ROOTS.push(root)
  const opts = { clock: () => 1000, packs: ['v5r'], root }
  if (deliverMode === 'caller') opts.deliverMode = 'caller'
  else opts.vmu = { 'vmu.turn.deliverProvider': 'sim' }
  const handle = ENTRY.apply(ctx, opts)
  return { handle, state, root, specOf: (name) => state.specs.find((s) => s.name === name) }
}

const call = async (b, name, args) => {
  const spec = b.specOf(name)
  const raw = await spec.execute(args, { kernel: b.handle.kernel, agent: { options: { provider: 'sim', model: 'sim' }, session: { id: 'sim-session', header: { id: 'sim-session' } } } })
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}
const rowsOf = (K) => {
  const res = K.records.list({ track: 'progress' })
  return res && Array.isArray(res.items) ? res.items : []
}
const receiptsOf = (K) => {
  const st = K.turn.status()
  return st && Array.isArray(st.turnReceipts) ? st.turnReceipts : []
}
const rowById = (rows, id) => rows.find((r) => r.id === id) || null

// ---- §0 the contract is in the source, and the seam is wired where the production face lives ----
ok(RECORDS_SRC.includes('let ambientTurnDelivery = null'), '§0a records carries a delivery seam beside the caller seam', 'ambientTurnDelivery')
ok(RECORDS_SRC.includes('beginTurnDelivery(delivery = {})'), '§0b the seam is prev/restore and returns its release', 'beginTurnDelivery')
ok(RECORDS_SRC.includes("const deliveredOwnTurn = deliveryPath !== null && deliveryPath !== 'caller'"),
  '§0c the predicate is the SAME one memberWorkShare counts with (any non-caller route is the seat its own turn)', 'deliveredOwnTurn')
ok(RECORDS_SRC.includes('deliveryPath === null &&') || RECORDS_SRC.includes('&& deliveryPath === null'),
  '§0d update inheritance only when there is NO delivery fact to derive from', 'mergedWrittenFrom')
ok(TURN_SRC.includes('const deliverySeam = opts && opts.delivery'), '§0e the dispatcher reads the delivery off its options', 'deliverySeam')
ok(TURN_SRC.includes('releaseDelivery = recordsFace.beginTurnDelivery(deliverySeam)'), '§0f the seam opens around the face call, not around the whole turn', 'beginTurnDelivery(deliverySeam)')
ok(TURN_SRC.includes('try { releaseDelivery() } catch'), '§0g the release runs on both paths and never replaces the outcome', 'finally')
ok(TURN_SRC.includes('delivery: turnDelivery'), '§0h dispatchReply hands the same deliveryPath the turn receipt states', 'delivery: turnDelivery')
ok(KERNEL_SRC.includes("'beginTurnDelivery'"), '§0i the production face actually binds the seam (facesFrom alone would not)', 'beginTurnDelivery')
ok(DOC_SRC.includes('### 3.1l RUN 77'), '§0j the contract section exists', '3.1l')
ok(DOC_SRC.includes('TB-2723'), '§0k and names the task that moved it', 'TB-2723')

// ---- §1 an activation turn: the row and the turn receipt agree ----
{
  const b = boot({ activationOnly: true })
  try {
    await b.handle.ready()
    await b.handle.kernel.store.open()
    const K = b.handle.kernel
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const drive = await call(b, 'vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'TB-2723 §1' })
    const rows = rowsOf(K)
    const receipts = receiptsOf(K)
    const last = receipts[receipts.length - 1] || {}
    ok(drive.ok === true, '§1a the activation drive ran', { ok: drive.ok, code: drive.code, message: drive.message })
    ok(drive.turnDelivered === true, '§1b the receipt states that a delivery happened (turnDelivered true)', drive.turnDelivered)
    ok(drive.memberActed === true, '§1c and the seat is credited as the actor', { memberActed: drive.memberActed, callerIsSeat: drive.callerIsSeat })
    ok(rows.length === 1, '§1d exactly one progress row landed', rows.length)
    ok(rows.length > 0 && rows[0].writtenFrom === 'own-turn',
      '§1e ★ the row says own-turn, not relayed: the same fact as deliveryPath', rows[0] && rows[0].writtenFrom)
    ok(rows.length > 0 && typeof rows[0].writtenFromMeans === 'string' && rows[0].writtenFromMeans.length > 0,
      '§1f and the row explains what that value means', rows[0] && rows[0].writtenFromMeans)
    ok(last.deliveryPath === 'activation' && (last.writes || []).length === 1 && rows.length > 0 && last.writes[0].recordId === rows[0].id,
      '§1g the turn receipt writes list points at that very row', { deliveryPath: last.deliveryPath, writes: last.writes })
    ok(rows.length > 0 && last.deliveryPath !== 'caller' && rows[0].writtenFrom === 'own-turn',
      '§1h ★ the two readings are the same statement, not two dashes', { deliveryPath: last.deliveryPath, writtenFrom: rows[0] && rows[0].writtenFrom })
  } finally {
    await Promise.all((b.handle.cleanups || []).map((c) => c()))
    rmSync(b.root, { recursive: true, force: true })
  }
}

// ---- §2 a caller-relayed answer: relayed is the honest reading, and it stays honest ----
{
  const b = boot({ deliverMode: 'caller' })
  try {
    await b.handle.ready()
    await b.handle.kernel.store.open()
    const K = b.handle.kernel
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const parked = await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'TB-2723 §2' })
    const answered = await call(b, 'vibe_vmu_turn', { op: 'step', member: 'r-1', reply: fence({ progress: 'r-1 代转写的进展：引理已完成。' }) })
    const rows = rowsOf(K)
    const receipts = receiptsOf(K)
    const last = receipts[receipts.length - 1] || {}
    ok(parked.awaiting === true, '§2a the caller turn parked for a reply', parked.awaiting)
    ok(answered.ok === true && answered.deliveryPath === 'caller', '§2b the answer travelled the caller route', { ok: answered.ok, deliveryPath: answered.deliveryPath })
    ok(answered.memberActed === false && answered.turnDelivered === false, '§2c and nobody pretends the seat ran it', { memberActed: answered.memberActed, turnDelivered: answered.turnDelivered })
    ok(rows.length === 1 && rows[0].writtenFrom === 'relayed', '§2d so the row is relayed — both readings agree in the other direction too', rows[0] && rows[0].writtenFrom)
    ok(last.deliveryPath === 'caller' && (last.writes || []).length === 1 && rows.length > 0 && last.writes[0].recordId === rows[0].id,
      '§2e the receipt writes list points at the same row', last.writes)
  } finally {
    await Promise.all((b.handle.cleanups || []).map((c) => c()))
    rmSync(b.root, { recursive: true, force: true })
  }
}

// ---- §3 an explicit writtenFrom is still the writer its own word ----
{
  const b = boot({ deliverMode: 'caller' })
  try {
    await b.handle.ready()
    await b.handle.kernel.store.open()
    const K = b.handle.kernel
    await K.members.hire({ id: 'r-1', slot: 'member' })
    let explicit = null
    let release = K.records.beginTurnDelivery({ path: 'caller', turnId: 't-explicit', member: 'r-1' })
    try {
      explicit = K.records.put({ track: 'progress', kind: 'progress', title: 'explicit writtenFrom wins', body: 'the writer said so', by: 'r-1', writtenFrom: 'own-turn' })
    } finally { release() }
    const rows = rowsOf(K)
    const row = explicit && explicit.ok === true ? rowById(rows, explicit.id) : null
    ok(!!row && row.writtenFrom === 'own-turn', '§3a an explicit writtenFrom beats the delivery route (the writer its own word)', row && row.writtenFrom)
    let derived = null
    release = K.records.beginTurnDelivery({ path: 'caller', turnId: 't-derived', member: 'r-1' })
    try {
      derived = K.records.put({ track: 'progress', kind: 'progress', title: 'no explicit value', body: 'derive it', by: 'r-1' })
    } finally { release() }
    const rows2 = rowsOf(K)
    const row2 = derived && derived.ok === true ? rowById(rows2, derived.id) : null
    ok(!!row2 && row2.writtenFrom === 'relayed', '§3b with no explicit value the caller route still derives relayed', row2 && row2.writtenFrom)
    let own = null
    release = K.records.beginTurnDelivery({ path: 'continuation', turnId: 't-own', member: 'r-1' })
    try {
      own = K.records.put({ track: 'progress', kind: 'progress', title: 'nobody said anything', body: 'derive it too', by: 'r-1' })
    } finally { release() }
    const rows3 = rowsOf(K)
    const row3 = own && own.ok === true ? rowById(rows3, own.id) : null
    ok(!!row3 && row3.writtenFrom === 'own-turn', '§3c a continuation route derives own-turn without any caller seam', row3 && row3.writtenFrom)
  } finally {
    await Promise.all((b.handle.cleanups || []).map((c) => c()))
    rmSync(b.root, { recursive: true, force: true })
  }
}

// ---- §4 the SET-level assertion: no non-caller turn may leave a relayed row behind ----
{
  const b = boot({ activationOnly: true })
  try {
    await b.handle.ready()
    await b.handle.kernel.store.open()
    const K = b.handle.kernel
    await K.members.hire({ id: 'r-1', slot: 'member' })
    const drive = await call(b, 'vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 2, phase: 'normal', why: 'TB-2723 §4' })
    const rows = rowsOf(K)
    const receipts = receiptsOf(K).filter((r) => r && r.deliveryPath !== null && r.deliveryPath !== undefined)
    const notCaller = receipts.filter((r) => r.deliveryPath !== 'caller')
    const pair = []
    for (const receipt of notCaller) {
      for (const w of (receipt.writes || [])) {
        pair.push({ turn: receipt.turn, deliveryPath: receipt.deliveryPath, row: rowById(rows, w.recordId) })
      }
    }
    const relayed = pair.filter((x) => !x.row || x.row.writtenFrom === 'relayed')
    ok(drive.ok === true, '§4a the two-round activation drive ran', { ok: drive.ok, roundsRun: drive.roundsRun })
    ok(notCaller.length >= 2, '§4b the window really holds at least two delivered turns (precondition, not vacuous)', notCaller.length)
    ok(pair.length > 0, '§4c and those turns really wrote rows (precondition)', { receipts: notCaller.length, writes: pair.length })
    ok(pair.length > 0 && relayed.length === 0,
      '§4d ★ NO non-caller turn in the set leaves a relayed row behind — a set-level check, not one sample', relayed.map((x) => ({ turn: x.turn, deliveryPath: x.deliveryPath, writtenFrom: x.row && x.row.writtenFrom })))
  } finally {
    await Promise.all((b.handle.cleanups || []).map((c) => c()))
    rmSync(b.root, { recursive: true, force: true })
  }
}

// ---- §5 and the caller set is still relayed in full: the fix did not paper over the honest case ----
{
  const b = boot({ deliverMode: 'caller' })
  try {
    await b.handle.ready()
    await b.handle.kernel.store.open()
    const K = b.handle.kernel
    await K.members.hire({ id: 'r-1', slot: 'member' })
    await K.turn.step({ members: ['r-1'], phase: 'normal', why: 'TB-2723 §5' })
    await call(b, 'vibe_vmu_turn', { op: 'step', member: 'r-1', reply: fence({ progress: 'r-1 代转写的进展：第二段。' }) })
    const rows = rowsOf(K)
    const receipts = receiptsOf(K).filter((r) => r && r.deliveryPath === 'caller')
    const pair = []
    for (const receipt of receipts) {
      for (const w of (receipt.writes || [])) pair.push({ turn: receipt.turn, row: rowById(rows, w.recordId) })
    }
    const wrong = pair.filter((x) => !x.row || x.row.writtenFrom !== 'relayed')
    ok(receipts.length >= 1 && pair.length >= 1, '§5a the caller set really holds a delivered turn and its write (precondition)', { turns: receipts.length, writes: pair.length })
    ok(pair.length > 0 && wrong.length === 0, '§5b ★ every caller-route row stays relayed: the honest reading was not flattened', wrong.map((x) => ({ turn: x.turn, writtenFrom: x.row && x.row.writtenFrom })))
  } finally {
    await Promise.all((b.handle.cleanups || []).map((c) => c()))
    rmSync(b.root, { recursive: true, force: true })
  }
}

console.log('')
console.log('=== vmu run77 writtenFrom vs deliveryPath: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
