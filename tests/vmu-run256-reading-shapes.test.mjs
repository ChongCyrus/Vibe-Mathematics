// tests/vmu-run256-reading-shapes.test.mjs — RUN 256 / TB-2624: ONE FACT, ONE SHAPE.
//
// THE THREE DEFECTS THIS PINS (measured by the 73rd run; the RED readings are quoted verbatim below, captured on
// the pre-fix tree `git archive HEAD` = 67fb601a by the probe `${__tmpRoot()}/probe-red2624.mjs`):
//
//   1) ONE LaTeX-absent fact in THREE shapes. Pre-fix readings, same engine-missing session:
//        compile: top-level toolchainAbsent ABSENT, pdfEnvironmentMissing ABSENT, latexAvailable ABSENT
//        final:   top-level ABSENT / ABSENT / ABSENT (the fact only lived at final.toolchainAbsent = ["latex"])
//        status:  top-level toolchainAbsent [] (a literal empty list — "not reported" read as "nothing absent")
//      A caller had to ask three doors three questions to learn one environment fact.
//   2) `vibe_vmu_records { action: "get" }` was refused verbatim:
//        code: VMU_INVALID_ARGUMENT  message: "unknown action: get"
//        hint: "pass `action` PLUS the parameters docs/18 §1 lists for that action (this face refuses by name rather
//               than guessing a default)" — it did NOT name the action that would work.
//      And `records.list` mixed in the pack library ruling cards, whose `track` is undefined, with no count at all.
//   3) A consult id was minted from the title: pre-fix, target 端到端占位论文 produced the id
//        "consult-端到端占位论文-1"  (contains the title verbatim; a title with a slash or quote would reach a path).
//
// WHAT THIS SUITE ASSERTS, on the REAL entry (`packs: ['v5r']`, a real kernel and real records) and on the SOURCE
// that makes it true:
//   · §0 the shapes: one `environmentReadingsOf`/`environmentReadingsAt` producer, the three doors wire the SAME
//        reading at the TOP level, `records` declares `get` as an ALIAS into the expand branch, `list` counts the
//        untracked rows in the ONE existing `excluded` container, and the consult id is minted by one helper;
//   · §1 one engine-missing session: `final`, `compile`, `status` carry byte-equal {toolchainAbsent,
//        pdfEnvironmentMissing, latexAvailable} at the top level, and `missing` (what the action lacked) never
//        overlaps `toolchainAbsent` (what the environment lacks);
//   · §2 `get` and `expand` are the same by-id read on the same row; a wrong id is VMU_NO_SUCH_OBJECT (not
//        "unknown action"); an unknown action NAMES the legal actions; `list` hides the untracked library head by
//        default and reports excluded.untracked/untrackedIds, `includeUntracked: true` brings it back;
//   · §3 a CJK title yields a consult id matching ^[a-z-]+-\d{4,}-[0-9a-f]{4}$ with NO title fragment, while the
//        title still travels in the paper title/subject, and a LEGACY id (consult-<title>-1) written into the state
//        row is still answerable — readability by exact string, no format gate;
//   · §4 the RED evidence itself is kept in one place: the pre-fix shapes are asserted ABSENT from the current
//        source, so the fix cannot be silently reverted.
//
// RULE E: every list assertion declares NON-EMPTY first; every "it worked" is READ BACK from a receipt.
// Run: node tests/vmu-run256-reading-shapes.test.mjs   Last line: === RUN-256 READING SHAPES: N passed, M failed ===
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const HOST = join(REPO, 'vibe-math-vmu', 'host.js')
const KIT_PAPER = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
// RULE E shape B: JSON.stringify of two empty collections compares equal; tag undefined explicitly.
const serialize = (v) => JSON.stringify(v === undefined ? '\u0000undefined' : v)
const eq = (actual, expected, label) => ok(serialize(actual) === serialize(expected), label, { actual, expected })
const has = (src, needle, label) => ok(String(src).includes(needle), label, needle)

const entry = await import(pathToFileURL(ENTRY).href)
const TOOLS_SRC = await (await import('node:fs/promises')).readFile(TOOLS, 'utf8')
const HOST_SRC = await (await import('node:fs/promises')).readFile(HOST, 'utf8')
const KIT_SRC = await (await import('node:fs/promises')).readFile(KIT_PAPER, 'utf8')
// RUN 256 (TB-2617): the ONE `excluded` container now lives at the arithmetic site (kernel records), not on the
// face; the face forwards it. The single-container assertion therefore reads the kernel source.
const RECORDS_SRC = await (await import('node:fs/promises')).readFile(new URL('../vibe-math-vmu/kernel/records.js', import.meta.url), 'utf8')

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const codeOf = (parsed) => (parsed && parsed.code) || null
const CONSULT_ID_RE = /^[a-z-]+-\d{4,}-[0-9a-f]{4}$/

// ── §0. THE SHAPES (source pins; the RED readings are asserted gone in §4) ─────────────────────────────────────
console.log('=== 0. THE SHAPES: one producer per fact, wired into three doors at the TOP level ===')
has(TOOLS_SRC, "const ENVIRONMENT_KEYS = Object.freeze(['latex'])",
  '★★ 正：the environment keys are declared once (the reading is derived from this list)')
has(TOOLS_SRC, 'function environmentReadingsOf(observed, fallback) {',
  '★★ 正：ONE producer of {toolchainAbsent, pdfEnvironmentMissing, latexAvailable, environmentMeans}')
has(TOOLS_SRC, 'function environmentReadingsAt(kernelObj, observed = null) {',
  '★★ 正：the per-session memo is its own function (same kernel ⇒ same reading)')
has(TOOLS_SRC, 'const envRead = environmentReadingsAt(kernel)',
  '★★ 正：status reads the SAME producer')
has(TOOLS_SRC, 'const envFin = environmentReadingsAt(kernel, {',
  '★★ 正：final reads the SAME producer (with this finalisation as the observation)')
has(TOOLS_SRC, '...environmentReadingsAt(kernel, {',
  '★★ 正：compile reads the SAME producer')
ok(TOOLS_SRC.split('const envRead = environmentReadingsAt(kernel)').length === 2,
  '★★★ 正：status consults the producer exactly once (no second inline shape)')
has(HOST_SRC, "enum: ['list', 'get', 'expand', 'append', 'status', 'prune', 'restore'].concat(['reindex'])",
  '★★ 正：records declares get in the enum (the name the taskbooks use)')
has(HOST_SRC, "if (action === 'get') action = 'expand'",
  '★★★ 正：get is an ALIAS into the expand branch — one implementation, no copied block')
has(HOST_SRC, 'includeUntracked: param(\'boolean\',',
  '★★ 正：includeUntracked is a DECLARED parameter (the host funnel refuses undeclared keys)')
has(RECORDS_SRC, 'untracked: 0, untrackedIds: []',
  '★★ 正：the untracked count lives in the ONE excluded container (no second container)')
has(HOST_SRC, 'untracked: no `track` name, which is what the pack library ruling heads look like',
  '★★ 正：excludedMeans names WHY the untracked rows were excluded')
has(HOST_SRC, 'Pass includeUntracked:true to page the untracked rows too',
  '★★ 正：the means sentence says how to see them')
// RUN 257 / TB-2634: the minter is still ONE function — its signature only gained the injected seed/rand. The pin names
// the minter's DEFINITION (not a call shape), so a second mint added elsewhere still goes red.
has(KIT_SRC, "export const consultRequestId = (seq, { seed = '', rand = null } = {}) => {",
  '★★ 正：the consult id has ONE minter (RUN 257: seed/rand injected, not a second mint)')

// ── §1. THREE DOORS, ONE SESSION, ONE ENGINE-MISSING FACT ──────────────────────────────────────────────────────
console.log('=== 1. engine missing: final / compile / status carry the SAME top-level environment reading ===')
const base = await mkdtemp(join(__tmpRoot(), 'vmu-run256-readings-'))
const prevCwd = process.cwd()
process.chdir(base)
const b = await boot({ root: join(base, 'v5r'), packs: ['v5r'] })
const kernel = b.handle.kernel
const ACAD = 'acad'
const R1 = 'r-1'
const OFFICE = 'office'
await kernel.members.hire({ id: ACAD, slot: 'chair' })
await kernel.members.hire({ id: R1, slot: 'member' })
await kernel.members.hire({ id: OFFICE, slot: 'member' })
ok(kernel.members.roster().length >= 3, '前置(RULE E)：三个真实成员在位（下面读真台账）')
const NO_ENGINE = { check: async (request) => ({ ok: false, code: 'VMU_PAPER_LATEX_NO_ENGINE', engine: null, tried: [], stdout: '', stderr: '', outDir: request.outDir }) }
Object.defineProperty(kernel, 'latex', { configurable: true, enumerable: true, writable: true, value: NO_ENGINE })

const T = '端到端占位论文'
await receipt(b, 'vibe_v5_paper', { action: 'start', target: T, participants: [ACAD, R1], format: 'both' })
await receipt(b, 'vibe_v5_record_proposition', { id: 'pe-1', statement: '环境缺引擎不是论文为假', value: 0.5, motive: '读数形状的证据', p: 0.5 })
await receipt(b, 'vibe_v5_paper', { action: 'part', target: T, member: ACAD, part: '第一部分', solution: ('正文') + String.fromCharCode(10) + '证据等级：draft', evidence: ['Members/' + ACAD + '/Propos/pe-1.md'] })
await receipt(b, 'vibe_v5_paper', { action: 'advance', target: T })
await receipt(b, 'vibe_v5_paper', { action: 'review', target: T, member: ACAD, deliverable: true, notes: '可交付' })
await receipt(b, 'vibe_v5_paper', { action: 'review', target: T, member: R1, deliverable: true, notes: '可交付' })
await receipt(b, 'vibe_v5_paper', { action: 'advance', target: T })
// The consult question is OPENED by the first final attempt.
const opened = (await receipt(b, 'vibe_v5_paper', { action: 'final', target: T, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })).parsed
eq(codeOf(opened), 'VMU_OFFICE_CONSULT_REQUIRED', '前置：final 先开一条所办问询（不是绕过闸门）')
const cs = (await receipt(b, 'vibe_v5_paper', { action: 'consult_state', target: T })).parsed
const newId = cs && cs.consult && cs.consult.awaiting && cs.consult.awaiting.id
ok(typeof newId === 'string' && newId !== '', '前置(RULE E)：有一条真正在等的问询 id（下面用它验格式）', newId)
const answered = (await receipt(b, 'vibe_v5_paper', { action: 'consult', target: T, member: OFFICE, request_id: newId, answer: '看过正文，可交付' })).parsed
ok(answered && answered.ok === true, '前置：所办已答复，final 可以走完', answered && answered.code)

const compiled = (await receipt(b, 'vibe_v5_paper', { action: 'compile', target: T })).parsed
const finalR = (await receipt(b, 'vibe_v5_paper', { action: 'final', target: T, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })).parsed
const statusR = (await receipt(b, 'vibe_v5_paper', { action: 'status', target: T })).parsed
ok(!!compiled && compiled.toolchainAbsent !== undefined,
  '★★ 正：compile 失败仍带顶层环境读数（不是只把 code 放顶层）', compiled && { code: compiled.code, keys: Object.keys(compiled) })
ok(!!finalR && finalR.ok === true && finalR.final && finalR.final.finalized === true,
  '★★ 正：缺引擎的会话里 final 仍然定稿（环境缺口不是论文为假）', finalR && finalR.final && finalR.final.finalized)
ok(!!statusR && statusR.ok === true, '前置：status 读得到这篇论文')

const pick = (r) => serialize({
  toolchainAbsent: r && r.toolchainAbsent,
  pdfEnvironmentMissing: r && r.pdfEnvironmentMissing,
  latexAvailable: r && r.latexAvailable,
})
const cShape = pick(compiled)
const fShape = pick(finalR)
const sShape = pick(statusR)
ok(cShape !== serialize({}), '前置(RULE E)：compile 的读数不是全空（否则逐字相等没有意义）', cShape)
eq(fShape, cShape,
  '★★★ 正：final 与 compile 的三个环境键逐字相等（同一事实，同一形状）')
eq(sShape, cShape,
  '★★★ 正：status 与 compile 的三个环境键逐字相等（同一个失败在三个门里是同一句话）')
eq(compiled && compiled.toolchainAbsent, ['latex'],
  '★★ 正：缺的环境件是 latex（按名字写出来）')
eq(compiled && compiled.pdfEnvironmentMissing, true,
  '★★ 正：pdfEnvironmentMissing 与 toolchainAbsent 同时为真（同一个事实的两个读法）')
eq(compiled && compiled.latexAvailable, false,
  '★★ 正：latexAvailable:false 是观察到的答案，不是 null 的猜测')
ok(!!compiled && (typeof compiled.environmentMeans === 'string' || typeof compiled.toolchainAbsentMeans === 'string'),
  '★★ 正：环境读数带着自己的 means 句子（读一份回执不需要再猜）', compiled && Object.keys(compiled).filter((k) => /means/i.test(k)))
eq(compiled && compiled.compiled && compiled.compiled.missing, ['pdf'],
  '★★ 正：这次编译缺的输入是 pdf')
ok(!(Array.isArray(compiled && compiled.compiled && compiled.compiled.missing) &&
  compiled.compiled.missing.some((n) => (compiled.toolchainAbsent || []).includes(n))),
  '★★★ 互斥：本次缺的输入（missing）与环境缺件（toolchainAbsent）不重叠')
eq(finalR && finalR.final && finalR.final.toolchainAbsent, ['latex'],
  '★ 兼容：final 里嵌套的旧读数保留（旧读者不被这一次重构打断）')

// ── §2. THE RECORDS FACE: get ≡ expand, unknown action names the way out, untracked is counted ─────────────────
console.log('=== 2. records: get 与 expand 是同一行；未知动作点名可用的动作；无轨卡默认排除且计数 ===')
const card = (await receipt(b, 'vibe_v5_record_proposition', { id: 'p-1', statement: '读数一致', value: 0.5, motive: '证据', p: 0.5 })).parsed
ok(card && card.ok === true, '前置：记录面上真有一行可读（下面两个动作读同一行）', card && card.code)
const gotGet = (await receipt(b, 'vibe_vmu_records', { action: 'get', id: 'p-1' })).parsed
const gotExpand = (await receipt(b, 'vibe_vmu_records', { action: 'expand', id: 'p-1' })).parsed
ok(!!gotGet && gotGet.ok === true, '★★ 正：records{action:"get"} 不再被拒（旧代码是 unknown action: get）', gotGet && gotGet.code)
eq(serialize(gotGet), serialize(gotExpand),
  '★★★ 正：get 与 expand 的整份回执逐字相等（同一个实现，不是两条路径）')
eq(gotGet && gotGet.id, 'p-1', '★ 读回：get 读到的就是问的那一行')
const gotNone = (await receipt(b, 'vibe_vmu_records', { action: 'get', id: 'no-such-id' })).parsed
eq(codeOf(gotNone), 'VMU_NO_SUCH_OBJECT',
  '★★ 正：get 走的是 by-id 读，真不存在的 id 说 VMU_NO_SUCH_OBJECT（不再说 unknown action）')
const unknown = (await receipt(b, 'vibe_vmu_records', { action: 'nope' })).parsed
eq(codeOf(unknown), 'VMU_INVALID_ARGUMENT', '前置：未知动作仍被具名拒绝')
ok(!!unknown && String(unknown.message).includes('unknown action: nope'),
  '★ 读回：拒绝消息原样说出收到的动作', unknown && unknown.message)
ok(!!unknown && String(unknown.hint).includes('expand') && String(unknown.hint).includes('get'),
  '★★★ 正：未知动作的 hint 点名最近的可用动作（提示即承诺：拒了必须告诉人家怎么写对）', unknown && unknown.hint)

await mkdir(join(base, 'v5r', 'Members', 'm-1', 'Propos'), { recursive: true })
await writeFile(join(base, 'v5r', 'Members', 'm-1', 'Propos', 'card-1.md'),
  '---\nid: card-1\ntitle: 无轨卡\n---\n\nbody line\n', 'utf8')
const listDefault = (await receipt(b, 'vibe_vmu_records', { action: 'list' })).parsed
const pageIds = ((listDefault && listDefault.records) || []).map((r) => r && r.id)
ok(Array.isArray(pageIds) && pageIds.length > 0, '前置(RULE E)：默认页不是空的（否则排除没有对照）', pageIds)
ok(!pageIds.includes('card-1'),
  '★★★ 正：默认页不含 track:undefined 的图书馆卡', pageIds)
eq(listDefault && listDefault.excluded && listDefault.excluded.untracked, 1,
  '★★★ 正：excluded.untracked 数出被排除的那一行')
eq(listDefault && listDefault.excluded && listDefault.excluded.untrackedIds, ['card-1'],
  '★★ 正：untrackedIds 点名是哪一行（绝不静默丢）')
eq(listDefault && listDefault.includeUntracked, false,
  '★ 读回：回执明说默认没有打开 includeUntracked')
const excludedKeys = Object.keys((listDefault && listDefault.excluded) || {})
ok(['shapeMismatch', 'noWriter', 'timeUnknown', 'untracked', 'untrackedIds'].every((k) => excludedKeys.includes(k)),
  '★★ 正：untracked 并进同一个 excluded 容器（没有第二个排除容器）', excludedKeys)
// ★★★ RUN 256 (TB-2624, Lead ruling): the receipt itself must say WHICH road this page took — a reader must never
// have to infer the untracked convention from docs.
eq(listDefault && listDefault.excluded && listDefault.excluded.untrackedScope, 'bare-list',
  '★★★ 正：裸 list 的回执自报 untrackedScope=bare-list（清点路，默认排除）')
ok(typeof (listDefault && listDefault.excluded && listDefault.excluded.untrackedScopeMeans) === 'string' &&
  /bare-list/.test(String(listDefault.excluded.untrackedScopeMeans)) && /query/.test(String(listDefault.excluded.untrackedScopeMeans)),
  '★★ 正：untrackedScopeMeans 一句话解释两条路（读者不必查文档）', listDefault && listDefault.excluded && listDefault.excluded.untrackedScopeMeans)
const listQuery = (await receipt(b, 'vibe_vmu_records', { action: 'list', since: '2000-01-01T00:00:00.000Z' })).parsed
eq(listQuery && listQuery.excluded && listQuery.excluded.untrackedScope, 'query',
  '★★★ 正：带任一选择条件的 list 自报 untrackedScope=query（回答问题的路，不过滤无轨行）')
eq(listQuery && listQuery.excluded && listQuery.excluded.untracked, 0,
  '★★★ 正：query 路上 untracked 恒为 0（没有被无轨规则排除的行）')
// RUN 256: `includeUntracked:true` widens the SET the page is taken from; it does not widen the PAGE. This suite
// has more rows than the default page (`vmu.records.headListAt`, 7), and card-1 has no readable stamp so the
// ordering places it LAST (`orderUnknown` names it, `truncated:true` says the page was cut). That is pagination,
// not exclusion — the receipt itself says `pass limit:0 to fetch the whole filtered set`. So the explicit-include
// call asks for the whole filtered set (`limit:0`), and the row must be back. The no-limit call below keeps the
// other half pinned: under the default cap the row must still be NAMED (`orderUnknown`), never silently dropped.
const listAll = (await receipt(b, 'vibe_vmu_records', { action: 'list', includeUntracked: true, limit: 0 })).parsed
const allIds = ((listAll && listAll.records) || []).map((r) => r && r.id)
ok(allIds.includes('card-1'),
  '★★ 正：includeUntracked:true 把那一行显式带回来（整份过滤集，limit:0）', allIds)
eq(listAll && listAll.excluded && listAll.excluded.untracked, 0,
  '★★ 正：打开之后没有行被 untracked 规则排除')
eq(listAll && listAll.includeUntracked, true, '★ 读回：回执明说这次是显式打开的')
const listAllPaged = (await receipt(b, 'vibe_vmu_records', { action: 'list', includeUntracked: true })).parsed
const namedOrderUnknown = (((listAllPaged && listAllPaged.orderUnknown) || []).map((x) => x && x.id))
const pagedIds = ((listAllPaged && listAllPaged.records) || []).map((r) => r && r.id)
eq(listAllPaged && listAllPaged.truncated, true,
  '★★ 正：默认页装不下整份过滤集时回执说 truncated:true（分页，不是排除）')
ok(namedOrderUnknown.includes('card-1') || pagedIds.includes('card-1'),
  '★★★ 正：即便默认页把它切掉，回执也点名 card-1（orderUnknown）——绝不静默丢', { namedOrderUnknown, pagedIds })

// ── §3. THE ID: OPAQUE (PREFIX + SEQUENCE + RANDOM), TITLE NEVER IN IT, LEGACY STILL READABLE ──────────────────
console.log('=== 3. consult id：前缀+序号+4 位随机，不含标题；旧 id 仍可读 ===')
ok(newId.length > 0 && CONSULT_ID_RE.test(newId),
  '★★★ 正：新 consult id 匹配 ^[a-z-]+-\\d{4,}-[0-9a-f]{4}$', newId)
ok(!newId.includes(T),
  '★★★ 正：新 id 不含标题片段（标题只走 title/subject）', { id: newId, title: T })
ok(!/[\u4e00-\u9fff]/.test(newId) && !newId.includes('/') && !newId.includes('"'),
  '★★ 正：id 里没有中文、斜杠或引号（不会污染路径与引号）', newId)
const stPaper = (await receipt(b, 'vibe_v5_paper', { action: 'status', target: T })).parsed
ok(JSON.stringify(stPaper && stPaper.paper && stPaper.paper.title).includes(T),
  '★★ 正：标题仍然完整地活在 title 里（不是被删掉，只是不进 id）', stPaper && stPaper.paper && stPaper.paper.title)

// Legacy readability: a consult id minted by the OLD format is still answerable. The paper state row is the one
// record that holds the consult ledger, so the legacy id is written there exactly as an old kernel would have.
const T2 = '旧标题论文'
// ★ TB-2761：互审必须真的有「别人」的部分与绑定指纹的票；单席自审在旧 round 规则下能过，新门会具名拒。
await receipt(b, 'vibe_v5_paper', { action: 'start', target: T2, participants: [ACAD, R1], format: 'md' })
await receipt(b, 'vibe_v5_paper', { action: 'part', target: T2, member: ACAD, part: '第一部分', solution: ('正文') + String.fromCharCode(10) + '证据等级：draft', evidence: ['Members/' + ACAD + '/Propos/pe-1.md'] })
await receipt(b, 'vibe_v5_paper', { action: 'part', target: T2, member: R1, part: '第二部分', solution: ('正文二') + String.fromCharCode(10) + '证据等级：draft', evidence: ['Members/' + R1 + '/Propos/pe-2.md'] })
await receipt(b, 'vibe_v5_paper', { action: 'advance', target: T2 })
await receipt(b, 'vibe_v5_paper', { action: 'review', target: T2, member: ACAD, of: R1, deliverable: true, notes: '可交付' })
await receipt(b, 'vibe_v5_paper', { action: 'review', target: T2, member: R1, of: ACAD, deliverable: true, notes: '可交付' })
await receipt(b, 'vibe_v5_paper', { action: 'advance', target: T2 })
const opened2 = (await receipt(b, 'vibe_v5_paper', { action: 'final', target: T2, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })).parsed
eq(codeOf(opened2), 'VMU_OFFICE_CONSULT_REQUIRED', '前置：第二篇也开出了问询（旧 id 可读性需要一个在等的请求）')
const listedStates = (await receipt(b, 'vibe_vmu_records', { action: 'list', kind: 'paper-state', limit: 0 })).parsed
const stateRow = ((listedStates && listedStates.records) || []).find((r) => String(r && r.title).includes(T2))
ok(!!stateRow && typeof stateRow.id === 'string',
  '前置(RULE E)：第二篇的 paper-state 行在记录面上（下一行写旧形 id）',
  { code: listedStates && listedStates.code, n: ((listedStates && listedStates.records) || []).length, ids: ((listedStates && listedStates.records) || []).map((r) => r && r.id), t2: T2 })
const stateBody = JSON.parse((await kernel.records.get({ id: stateRow.id })).body)
const LEGACY_ID = 'consult-旧标题-1'
stateBody.consult.requests = stateBody.consult.requests.map((r) => (r.status === 'awaiting' ? Object.assign({}, r, { id: LEGACY_ID }) : r))
const putRes = await kernel.records.put({ id: stateRow.id, track: stateRow.track, kind: stateRow.kind, title: stateRow.title, body: JSON.stringify(stateBody) })
ok(putRes && putRes.ok === true, '前置：旧形 id 真的写进了状态行', putRes && putRes.code)
const cs2 = (await receipt(b, 'vibe_v5_paper', { action: 'consult_state', target: T2 })).parsed
eq(cs2 && cs2.consult && cs2.consult.awaiting && cs2.consult.awaiting.id, LEGACY_ID,
  '★★ 读回：咨询台账读到的就是那条旧形 id（不按格式校验）')
const legacyAnswer = (await receipt(b, 'vibe_v5_paper', { action: 'consult', target: T2, member: OFFICE, request_id: LEGACY_ID, answer: '旧 id 也答得上' })).parsed
ok(legacyAnswer && legacyAnswer.ok === true, '★★★ 正：旧形 id 仍可被答复（不因格式变更而失读）', legacyAnswer && legacyAnswer.code)
eq(legacyAnswer && legacyAnswer.consult && legacyAnswer.consult.requestId, LEGACY_ID,
  '★★ 正：答复回执原样带回旧 id（迁移不改写历史）')

// ── §4. THE RED EVIDENCE STAYS RED: the pre-fix shapes are GONE from the source ───────────────────────────────
console.log('=== 4. 修复前的三种形状在源码里已经消失（回滚会在这里变红） ===')
ok(!TOOLS_SRC.includes('toolchainAbsent: [],'),
  '★★★ 反：status 里那个字面空数组 toolchainAbsent: [] 已经不在了')
ok(HOST_SRC.includes('pass one of: list｜get｜expand｜append｜status｜prune｜restore｜reindex'),
  '★★ 反：records 的未知动作拒绝把可用动作全列出来（旧的裸消息没有 hint，这一行在修复前不存在）')
ok(!KIT_SRC.includes("'consult-' + str(state.target)"),
  '★★★ 反：id 不再由标题原文铸造（consult-<title>-<n> 的表达式已消失）')
ok(!KIT_SRC.includes('id: ' + "'consult-'"),
  '★★ 反：kit/paper.js 里没有第二个按标题拼 id 的点')

// Windows keeps handles on the member tree for a moment; cleanup is best effort under D:/_tmp.
try { process.chdir(prevCwd) } catch { /* the temp tree is what matters */ }
await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {})
console.log('\n=== RUN-256 READING SHAPES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error(' - ' + f); process.exit(1) }
