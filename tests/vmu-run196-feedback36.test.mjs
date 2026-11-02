// RUN 196 — run 37 / FEEDBACK36 1.2 and 2.6, plus one left-over sentence from FEEDBACK35 1.3.
//
// 1.2  THE BOARD COUNTS SEATS, NOT RULINGS. Run 37's office read `m1` as `present: 1, transcript: [],
//      unanimity.met: false` and, in the same batch, the chair's `vibe_v5_verdict_final` answered
//      `sources.submitted: 2` — two true readings of two different records (a seat and a card), with nothing on the
//      board saying so. A member can file a ruling without taking a seat and can take a seat without filing anything.
// 2.6  TWO TREES, AND NO RECEIPT SAID WHICH ONE HOLDS THE PAPER. Run 37's `read_library` answered
//      `libraryRoot: <ws>/VibeMath` while the finalised PDF sat at `<ws>/Paper/paper-p1/paper-p1.pdf`. Both true: paper
//      artifacts are written under the deployment's artifact prefix, the institute library is a different tree.
// 1.3  (left over) `VMU_TURN_NO_PENDING_MEMBER` on the report-completion route said only "report with op:\"reply\"
//      while the prompt is open, then call step" — true on the CALLER path, impossible on the delegated one, where the
//      turn settles inside the step and the member hands its report back as the final text of its own session.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const MEETING = read('vibe-math-vmu/tools/meeting.js')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')
const TURN = read('vibe-math-vmu/kernel/turn/index.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, specs, call }
}

test('RUN 196 §0 — the three sentences exist and name the mechanism (source pins)', () => {
  has(MEETING, 'RULING_BOARD_POINTER', '§0a the board pointer is a named constant, not a sentence buried in one branch')
  has(MEETING, 'rulingsNotOnThisBoard', '§0b it has a field name a reader can look for')
  has(MEETING, 'this board records ATTENDANCE', '§0c and says what the board DOES record')
  has(MEETING, 'A member can file a ruling without taking a seat', '§0d ★ the two acts are told apart')
  has(MEETING, 'two records (a seat and a', '§0e and the "two truths" misreading is named')
  has(MEETING, '}, view, RULING_BOARD_POINTER)', '§0f `status` carries it')
  has(MEETING, 'accountPointer, RULING_BOARD_POINTER)', '§0g `summary` carries it')
  has(TOOLS, "artifactPrefix: 'Paper/<paper-folder>/'", '§0h the paper status discloses the artifact prefix')
  has(TOOLS, 'TWO DIFFERENT TREES', '§0i and says the library and the artifact tree are different')
  has(TOOLS, 'artifactRootWhy', '§0j with a reason when no absolute artifact directory is measurable yet')
  has(TURN, 'DELEGATED PATH', '§0k the report refusal names the delegated path')
  has(TURN, 'FINAL TEXT of its own session', '§0l ★ and the channel that actually works there')
})

test('RUN 196 §1 — a meeting board says it counts seats, not rulings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run196-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const opened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '读会议板时要能分清到会与裁断', title: 'board pointer probe' })
    ok(opened.ok !== false, '§1a the meeting opens', opened)
    const mid = String(opened.meeting || opened.id)
    ok(mid.length > 0, '§1b with a real id', opened)
    const status = await call('vibe_vmu_meeting', { action: 'status', id: mid })
    ok(status.ok !== false, '§1c status answers', status)
    ok(status.registry === 'service', '§1d on the service registry', status.registry)
    ok(typeof status.rulingsNotOnThisBoard === 'string', '§1e ★ the board names the record it does not carry', Object.keys(status))
    has(status.rulingsNotOnThisBoard, 'ATTENDANCE', '§1f what the board does count')
    has(status.rulingsNotOnThisBoard, 'RULINGS', '§1g and what it does not')
    has(status.rulingsNotOnThisBoard, 'vibe_v5_verdict_final', '§1h with the face that does carry them')
    ok(Array.isArray(status.rulingsReadFrom && status.rulingsReadFrom.fields), '§1i and the fields to read there', status.rulingsReadFrom)
    const summary = await call('vibe_vmu_meeting', { action: 'summary', id: mid })
    ok(summary.ok !== false, '§1j summary answers too', summary)
    has(summary.rulingsNotOnThisBoard, 'two records (a seat and a', '§1k ★ the same sentence travels on the other read face')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 196 §2 — a paper status names the library tree and the artifact tree separately', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run196b-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const started = await call('vibe_v5_paper', { action: 'start', participants: ['r-acad', 'r-1'], target: 'run196-paper', title: '两棵树' })
    ok(started.ok !== false, '§2a the paper starts', started)
    const status = await call('vibe_v5_paper', { action: 'status', target: 'run196-paper' })
    ok(status.ok !== false, '§2b status answers', status)
    const roots = status.roots
    ok(roots && typeof roots === 'object', '§2c ★ the receipt carries a roots block', Object.keys(status))
    ok(roots.artifactPrefix === 'Paper/<paper-folder>/', '§2d the artifact prefix is named', roots.artifactPrefix)
    has(roots.means, 'TWO DIFFERENT TREES', '§2e and the two trees are said to be different')
    has(roots.means, 'libraryRoot', '§2f the sentence names both fields')
    ok('libraryRoot' in roots, '§2g libraryRoot is a field, not prose', Object.keys(roots))
    ok(roots.libraryRoot === null || String(roots.libraryRoot).length > 0, '§2h it is either an absolute root or null', roots.libraryRoot)
    ok(typeof roots.libraryRootMeans === 'string' && roots.libraryRootMeans.length > 0, '§2i and carries its own meaning', roots.libraryRootMeans)
    // before the first compile there is no measured absolute artifact directory — and it says so instead of inventing one
    ok(roots.artifactRoot === null, '§2j ★ no compile yet, so no absolute artifact directory is claimed', roots.artifactRoot)
    has(roots.artifactRootWhy, 'no compile is on file', '§2k …and the reason is stated')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 196 §3 — the report refusal names both delivery paths, and the one that works', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run196c-'))
  try {
    const { handle } = await assemble(dir)
    const turnApi = handle && handle.kernel ? handle.kernel.turn : null
    ok(turnApi && typeof turnApi.completeStructuredReply === 'function', '§3a the verb is reachable on the kernel', turnApi ? Object.keys(turnApi).slice(0, 6) : null)
    let caught = null
    try { await turnApi.completeStructuredReply() } catch (e) { caught = e }
    ok(caught, '§3b ★ with no waiting report it refuses')
    ok(caught.code === 'VMU_TURN_NO_PENDING_MEMBER', '§3c under the named code', caught && caught.code)
    has(caught.hint, 'CALLER PATH', '§3d the path where the channel works is named first')
    has(caught.hint, 'DELEGATED PATH', '§3e ★ and the path where the refusal is EXPECTED')
    has(caught.hint, 'FINAL TEXT', '§3f ★ with the channel that actually works there')
    ok(/expected, not a mistake to retry|expected/.test(caught.hint), '§3g so a member does not retry it', caught.hint)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
