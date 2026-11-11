#!/usr/bin/env node
/**
 * tests/vmu-run78-small-readings.test.mjs — RUN 78 / TB-2734: two small defects that a reader of the receipt reads wrong.
 *
 *  §1 议程按逗号切分切坏数学（FEEDBACK78 待定位节 ①）:
 *      `vibe_vmu_meeting` 存的是**一行** `materials`，写面（packs/v5r/tools.js）把数组议程用 `"; "` 拼成这一行。
 *      读面（kernel/meetings.js 的 `AGENDA_ITEM_SEPARATORS`）却还认 `、` 与 `,` —— 而数学里逗号是**元组分隔符**，
 *      `(2k-1,2k)` 是一条命题，不是一个会议议题。旧世界实测被切成 `["…(2k-1","2k) …"]`。本判据钉：
 *      含 `(2k-1,2k)` 的议程读 1 条（按 `;` 分两段时第一条原样含整对括号）；`；`/`;`/换行才是分隔符；空串 ⇒ 0 条
 *      且 means 仍说明它是「同一条文本的读数」。
 *  §2 render 回执不带落盘行 id（同节 ②）:
 *      render 回执过去只有 `wroteToLedger:["md","tex","meta"]`（kind 列表），读者想知道「刚写的那三行」得另跑
 *      `read_library`。现在 `recordIds:{md,tex,meta}` 直接给出**这次** `records.put` 返回的 id，每个 id 都能
 *      `records.get` 到，且行的 kind 与 md/tex/meta 对应。
 *  §0 源码 pin：两处修复必须在它们各自的源文件里（meetings.js 的分隔符集合、paper.js 的 wroteIds、tools.js 的 recordIds）。
 *
 * Run: node tests/vmu-run78-small-readings.test.mjs   (targeted only)
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

const VMU = join(REPO, 'vibe-math-vmu')
// Scratch space must live under the platform temp dir, not on one machine's drive: a hard-coded
// D:/_tmp/... path makes this suite pass only where the lane that wrote it happened to run (P1).
const TMP = mkdtempSync(join(tmpdir(), 'vmu-r78-small-'))
mkdirSync(TMP, { recursive: true })

const SRC_MEETINGS = readFileSync(join(VMU, 'kernel', 'meetings.js'), 'utf8')
const SRC_PAPER_KIT = readFileSync(join(VMU, 'kit', 'paper.js'), 'utf8')
const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 200) : text)
const countIn = (src, needle) => src.split(needle).length - 1
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const boot = async () => {
  const state = { specs: [] }
  const root = mkdtempSync(join(TMP, 'k-'))
  const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (n) => state.specs.filter((s) => s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered' }
    try {
      const raw = await spec.execute(args)
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: String(raw) }
    } catch (e) {
      return { ok: false, code: codeOf(e) || 'VMU_TEST_THROWN', message: String((e && e.message) || e) }
    }
  }
  return { handle, root, specOf, call }
}

/* ── §0: the repairs live on the source they belong to ──────────────────────────────────────────────────────── */
console.log('=== 0. both repairs are on the source file that owns the reading ===')
ok(countIn(SRC_MEETINGS, 'const AGENDA_ITEM_SEPARATORS = /[;；\\n]/') === 1,
  '★ ① the agenda splitter accepts exactly ; ； newline',
  { found: countIn(SRC_MEETINGS, 'const AGENDA_ITEM_SEPARATORS = /[;；\\n]/') })
ok(!/AGENDA_ITEM_SEPARATORS = \/\[[^\]]*[,、][^\]]*\]\//.test(SRC_MEETINGS),
  '★★ ① and the class does NOT contain the comma or 、 — a tuple separator is not an agenda separator')
has(SRC_MEETINGS, 'A reading is honest only when',
  '★ ① the source says WHY the set is what it is (the inverse of the write), not just that it splits')
has(SRC_PAPER_KIT, 'wroteIds', '★ ② the paper kit returns the ids of the rows THIS render wrote')
has(SRC_TOOLS, 'recordIds: rendered.wroteIds',
  '★ ② the render receipt projects them under `recordIds`')
has(SRC_TOOLS, 'recordIdsMeans', '★★ ② and the receipt says what the ids answer (rows, not files)')

/* ── §1: the agenda reading is the inverse of the write, so a tuple comma survives ─────────────────────────── */
console.log('\n=== 1. a comma inside (2k-1,2k) is NOT an agenda separator ===')
const rec = (vals) => ({ get: (k) => (vals || {})[k] })
const MEET = { type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-2'] }
const mkMeetings = (settings = {}) => createMeetings({
  clock: () => 1000,
  settings: rec(Object.assign({ 'vmu.meetings.quorumCap': 0 }, settings)),
  log: () => {},
})
{
  const t = mkMeetings()
  const o = t.open(Object.assign({}, MEET, { materials: '学术交流：抽屉配对 (2k-1,2k) 互质表述与证明规格' }))
  const sum = t.summary({ meeting: o.meeting })
  ok(sum && typeof sum.agenda === 'string' && sum.agenda.length > 0, '§1a premise: the meeting exists and carries the agenda', sum && sum.agenda)
  ok(Array.isArray(sum.agendaItems) && sum.agendaItems.length === 1,
    '★★★ the measured RUN 78 agenda reads as ONE item, not two', sum && sum.agendaItems)
  ok(sum.agendaItems[0] === '学术交流：抽屉配对 (2k-1,2k) 互质表述与证明规格',
    '★★★ and the item is the WHOLE string — the tuple parentheses survive intact', sum && sum.agendaItems[0])
  has(String(sum.agendaItemsMeans || ''), 'comma',
    '★★ the means names the comma decision (a reader learns WHY it was not split)')
  has(String(sum.agendaItemsMeans || ''), 'ONE item',
    '★ and says a prose list using those characters reads as one item')
}
{
  const t = mkMeetings()
  const o = t.open(Object.assign({}, MEET, { materials: '甲方；乙方;丙方\n丁方' }))
  const sum = t.summary({ meeting: o.meeting })
  ok(Array.isArray(sum.agendaItems) && sum.agendaItems.length === 4,
    '★★ the three separators the write can produce still split: ； ; newline', sum && sum.agendaItems)
  ok(sum.agendaItems.join('|') === '甲方|乙方|丙方|丁方', '★ trimmed, order preserved', sum && sum.agendaItems)
}
{
  const t = mkMeetings()
  const o = t.open(Object.assign({}, MEET, { materials: '抽屉原理、奇偶性, 同余' }))
  const sum = t.summary({ meeting: o.meeting })
  ok(Array.isArray(sum.agendaItems) && sum.agendaItems.length === 1,
    '★★ 、 and , are NOT separators either (they stay inside the item)', sum && sum.agendaItems)
}
{
  const t = mkMeetings()
  const o = t.open(Object.assign({}, MEET, { materials: '' }))
  const sum = t.summary({ meeting: o.meeting })
  ok(sum && Array.isArray(sum.agendaItems) && sum.agendaItems.length === 0,
    '★ an empty agenda reads zero items (absence stays absence)', sum && sum.agendaItems)
  ok(typeof sum.agendaItemsMeans === 'string' && sum.agendaItemsMeans.length > 0,
    '★ and the reading is still EXPLAINED, not left as a bare []', sum && sum.agendaItemsMeans)
}

/* ── §2: the render receipt names the three rows it just wrote ─────────────────────────────────────────────── */
console.log('\n=== 2. render names the rows it wrote (recordIds), and each id is readable ===')
{
  const { handle, call } = await boot()
  const founded = await call('vibe_v5_start', { researcherCount: 2, problem: 'run78 small readings' })
  ok(founded.ok === true, '§2a premise: the institute was founded', founded.code || founded.ok)
  const started = await call('vibe_v5_paper', { action: 'start', participants: ['r-1', 'r-2'], target: 'run78-paper' })
  const target = started && started.started && started.started.target
  ok(typeof target === 'string' && target !== '', '§2b premise: a paper exists', started)
  const rendered = await call('vibe_v5_paper', { action: 'render', target })
  ok(rendered.ok === true, '§2c premise: the render request went through', rendered.code || rendered.message)
  ok(Array.isArray(rendered.wroteToLedger) && rendered.wroteToLedger.length >= 1,
    '§2d premise: the kind list is still there (the old reading is not deleted)', rendered.wroteToLedger)
  const ids = rendered.recordIds
  ok(!!ids && typeof ids === 'object' && !Array.isArray(ids),
    '★★★ the receipt carries `recordIds` as an object keyed by artefact kind', ids)
  for (const kind of ['md', 'tex', 'meta']) {
    ok(!!ids && typeof ids[kind] === 'string' && ids[kind] !== '',
      '★★★ recordIds.' + kind + ' is a record id', ids && ids[kind])
  }
  // ★ RULE E: every() is TRUE on an empty list, so the non-empty guard belongs to the SAME assertion it protects
  ok(!!ids && Array.isArray(rendered.wroteToLedger) && rendered.wroteToLedger.length > 0 && rendered.wroteToLedger.every((k) => typeof ids[k] === 'string'),
    '★ every kind the receipt says it wrote has an id beside it', { wrote: rendered.wroteToLedger, ids })
  has(String(rendered.recordIdsMeans || ''), 'NOT a file path',
    '★★ the means says these are ROWS, not files (the reading that RUN 221 fixed must not come back)')
  const expectedKind = { md: 'paper-md', tex: 'paper-tex', meta: 'paper-meta' }
  for (const kind of ['md', 'tex', 'meta']) {
    if (!ids || typeof ids[kind] !== 'string') continue
    const got = handle.kernel.records.get({ id: ids[kind] })
    const row = got && got.row ? got.row : got
    ok(!!row && row.kind === expectedKind[kind],
      '★★★ recordIds.' + kind + ' resolves to a row of kind ' + expectedKind[kind], row && { id: row.id, kind: row.kind })
  }
}

console.log('\n=== vmu run78 small readings: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + failures.join(' | '))
  process.exitCode = 1
}
