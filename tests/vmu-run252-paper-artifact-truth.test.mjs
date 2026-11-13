// tests/vmu-run252-paper-artifact-truth.test.mjs — RUN 252 / F72-7: A RECEIPT MAY NOT SAY "WE LACK tex" AND
// "THE COMPILE PRODUCED THE FILE" AT THE SAME TIME.
//
// THE DEFECT THIS PINS (measured on the 72nd live run, build 0a9e9783): one paper receipt carried BOTH
// `missing: ["tex"]` and `pdfCompiled.produced: true`. The two readings came from ONE list being asked two questions:
// the paper track has four ARCHIVE row names (md/tex/pdf/meta), and `PaperArtifacts().missing` is "rows NOT NAMED yet"
// — but the pdf block copied it into `missing`, so a successful compile of an `md`-format paper (render never writes a
// tex row) printed `missing: ["tex"]` beside `produced: true`. A reader holding that receipt cannot tell whether the
// compile needed something it did not get, or the archive simply has no tex row.
//
// WHAT THIS SUITE ASSERTS, on the REAL entry (`packs:['v5r']`, a real kernel, real records, the host's own serialized
// receipts) and on the SOURCE that makes it true:
//   · §0 the shape: `missing` is derived from `produced` exactly once, the archive rows have their own name
//        (`archiveArtifacts`), the toolchain question has its own name (`toolchainAbsent`), and the old sentence that
//        taught `missing` as "artifact rows" is gone;
//   · §1 a paper started with format "md" (so NO tex row will ever exist) is rendered + compiled through the tools:
//        the compile receipt has `produced:true`, `missing: []`, `archiveArtifacts.missing: ["tex"]`,
//        `toolchainAbsent: []` — and the MUTUAL EXCLUSION holds on that same receipt;
//   · §2 the office `status` face carries the same two readings, so the contradiction cannot be read there either;
//   · §3 a real finalisation of that paper: `finalized:true`, `missing: []`, the archive reading still names tex,
//        and `status` afterwards reads finalized with `complete:false` — two different questions (F72-9);
//   · §4 the engine-absent branch (an environment with no LaTeX at all): the finalisation still happens, but now
//        `toolchainAbsent: ["latex"]`, `missing: ["pdf"]`, and the two lists do not overlap — and the refusal of
//        `compile` keeps the same honest shape;
//   · §5 the measurements that stay advisory (F72-11) and the byte-scope question (F72-6): the paper faces print
//        `pdfBytes`/`diskFileBytes` as WHOLE-FILE bytes and carry no sha field that could cover a body instead.
//
// RULE E: every list assertion declares NON-EMPTY first (a list that is empty for the wrong reason proves nothing),
// and every "it worked" is READ BACK from a receipt, not assumed from a call that returned ok.
// Run: node tests/vmu-run252-paper-artifact-truth.test.mjs   Last line: === RUN-252 PAPER ARTIFACT TRUTH: N passed, M failed ===
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { missingCharactersOf } from '../vibe-math-vmu/kernel/latex.js'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const PAPER_PACK = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')
// the gate temp root may not exist yet (another lane's clean-temp can remove it mid-session); mkdtemp needs the parent
await mkdir(__tmpRoot(), { recursive: true }).catch(() => {})
const KIT_PAPER = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const QUALITY = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
// RULE E shape B (audit-declaration-criterion): a raw `JSON.stringify(a) === JSON.stringify(b)` equality is flagged as
// "two empty collections compare equal" — an empty actual and an empty expected are indistinguishable from a real miss
// (and `undefined` serialises to NOTHING, i.e. it would compare equal to a missing value). The serializer tags
// `undefined` explicitly, so `eq(undefined, [])` now FAILS and the comparison cannot be vacuous.
const serialize = (v) => JSON.stringify(v === undefined ? '\u0000undefined' : v)
const eq = (actual, expected, label) => ok(serialize(actual) === serialize(expected), label, { actual, expected })
const has = (src, needle, label) => ok(String(src).includes(needle), label, needle)
const byteLen = (s) => Buffer.byteLength(String(s), 'utf8')

const entry = await import(pathToFileURL(ENTRY).href)
const TOOLS_SRC = await readFile(TOOLS, 'utf8')
const PAPER_PACK_SRC = await readFile(PAPER_PACK, 'utf8')
const KIT_PAPER_SRC = await readFile(KIT_PAPER, 'utf8')
const QUALITY_SRC = await readFile(QUALITY, 'utf8')

const boot = async (config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
/** The SAME boot contract as `boot`, but from an arbitrary entry module (the anti-lamp boots a MUTATED copy). */
const bootOf = async (entryUrl, config = {}) => {
  const mod = await import(entryUrl)
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = mod.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
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

// ── §0. THE SHAPE: ONE READING DECIDES `produced`, THE ROWS HAVE THEIR OWN NAME ───────────────────────────────
console.log('=== 0. THE SHAPE: `missing` is action-scoped, `archiveArtifacts` is row-scoped, `toolchainAbsent` is environment-scoped ===')
has(TOOLS_SRC, "const PAPER_ROW_NAMES = Object.freeze(['md', 'tex', 'pdf', 'meta'])",
  '★★ 正：artifact ROW names are declared once (the archive reading is derived from this list, not from a copy)')
has(TOOLS_SRC, 'const produced = ok && (p.produced === true || Boolean(p.pdfPath))',
  '★★ 正：`produced` is decided ONCE and both readings below derive from it')
has(TOOLS_SRC, "missing: produced ? [] : ['pdf'],",
  '★★★ 正：the pdf block answers `missing: []` when produced — the action lacked nothing')
has(TOOLS_SRC, 'function archiveArtifactsReading(artifacts) {',
  '★★ 正：the archive-row reading has its own reader')
has(TOOLS_SRC, 'function toolchainAbsentOf(pdf) {',
  '★★ 正：the environment question has its own reader (`toolchainAbsent`)')
has(TOOLS_SRC, "if (code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING' || faceCode === 'VMU_PAPER_LATEX_NO_ENGINE') absent.push('latex')",
  '★★ 正：an absent engine is named `latex` — an environment fact, not an input')
ok(!TOOLS_SRC.includes('`missing` names the artifact rows that are absent (a write-stage paper reports md, tex, pdf, meta as missing until `render` writes them)'),
  '★★★ 反：the old sentence that taught `missing` as the artifact-row list is GONE from completeMeans')
has(TOOLS_SRC, "missing: compiledProduced\n          ? []\n          : (artifacts ? artifacts.missing.slice() : []),",
  '★★ 正：`status` derives `missing` from the compiled-pdf reading, not from the rows')
// ★★★ TB-2691 correction (MEASURED on run 252): RUN 2691 had folded the row EVIDENCE key `pdfSha256` into this
// ACTION-scoped list, so a receipt could read `produced:true` beside `missing:["pdfSha256"]` — the exact contradiction
// F72-7 closed. The absence now lives in `pdfCompiled.pdfSha256:null` + `pdfSha256Means`; this pin keeps it out.
ok(!TOOLS_SRC.includes("? (pdfRowSha === null ? ['pdfSha256'] : [])"),
  '★★★ 反(TB-2691 correction)：`pdfSha256` 是行证据，不再折进 `missing`')
has(TOOLS_SRC, 'archiveArtifacts: archiveArtifactsReading(artifacts),',
  '★★ 正：`status` still prints the artifact ROWS under their own name')
has(TOOLS_SRC, 'const finProduced = !!(finalized.pdf && finalized.pdf.ok === true && (finalized.pdf.produced === true || Boolean(finalized.pdf.pdfPath)))',
  '★★ 正：`final` names its produced reading once (`finProduced`, RUN 252)')
has(TOOLS_SRC, 'missing: finProduced ? [] : [\'pdf\'],',
  '★★ 正：`final` derives `missing` from that produced reading, not from the kit snapshot list')
has(TOOLS_SRC, 'missingMeans: finProduced',
  '★★ 正：an EMPTY final list gets NO prose (RUN 161 pin); the rows live in `archiveArtifacts.means`')
ok(TOOLS_SRC.includes('if (typeof paper.PaperArtifacts === \'function\') return archiveArtifactsReading(paper.PaperArtifacts({ target }))'),
  '★★ 正：the `final` archive reading is re-read AFTER the compile (the kit snapshot predates it)')

// ── §1. A REAL md-FORMAT PAPER: RENDER, THEN COMPILE THROUGH THE TOOL FACE ────────────────────────────────────
console.log('=== 1. format "md" ⇒ NO tex row will ever exist; compile still produces the PDF, and the receipt must not call tex missing ===')
const base = await mkdtemp(join('D:/_tmp', 'vmu-run252-paper-'))
// The kit resolves the compile's `outDir` (`Paper/<folder>`, a RELATIVE path in the pack's policy data) against
// `process.cwd()`, so the suite moves the process into its own temp root for the duration and puts it back at the
// end: every artifact this test produces is measured inside D:/_tmp, never inside the checkout.
const prevCwd = process.cwd()
process.chdir(base)
const v5r = await boot({ root: join(base, 'v5r'), packs: ['v5r'] })
const kernel = v5r.handle.kernel
const ACAD = 'acad'
const R1 = 'r-1'
const OFFICE = 'office'
await kernel.members.hire({ id: ACAD, slot: 'chair' })
await kernel.members.hire({ id: R1, slot: 'member' })
await kernel.members.hire({ id: OFFICE, slot: 'member' })
const rosterNow = kernel.members.roster().map((m) => m.id)
ok([ACAD, R1, OFFICE].every((id) => rosterNow.includes(id)) && rosterNow.length >= 3,
  '前置(RULE E)：三个真实成员在位（下面读的都是真记录、真台账）', rosterNow)

// The compiler is stubbed at the kernel seam the kit actually calls (`kernel.latex.check`); it WRITES a real file so
// every byte number below can be measured against the disk instead of trusted from the receipt (F72-6).
const PDF_TEXT = '%PDF-1.4\n% RUN 252 fake pdf (measured, not assumed)\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'
const writeFakePdf = async (request) => {
  await mkdir(request.outDir, { recursive: true })
  const pdfPath = join(request.outDir, request.sourceName.replace(/\.tex$/, '.pdf'))
  await writeFile(pdfPath, PDF_TEXT, 'utf8')
  return { ok: true, engine: 'xelatex', pdfPath, pdfBytes: byteLen(PDF_TEXT), pdfSha256: createHash('sha256').update(PDF_TEXT).digest('hex'), argv: ['xelatex', '-interaction=nonstopmode', request.sourceName], tried: [{ engine: 'xelatex', phase: 'compile', code: null }], outDir: request.outDir, elapsedMs: 3 }
}
// The kernel exposes `latex` as a GETTER (kernel/index.js builds the face at construction and returns it from
// `get latex()`), so a test cannot assign over it. Redefine the property instead: the descriptor is configurable,
// and this is the SAME seam the kit reads (`kernel.latex.check`) — a stub at a private field would prove nothing.
const stubLatex = (k, face) => Object.defineProperty(k, 'latex', { configurable: true, enumerable: true, writable: true, value: face })
stubLatex(kernel, { check: writeFakePdf })

const T = 'p-md'
const started = await receipt(v5r, 'vibe_v5_paper', { action: 'start', target: T, participants: [ACAD, R1], format: 'md' })
ok(started.parsed && started.parsed.ok === true && started.parsed.started && started.parsed.started.status === 'writing',
  '★ 正：start format:"md" 建出论文并进入 writing', started.parsed && started.parsed.started)
const st0 = (await receipt(v5r, 'vibe_v5_paper', { action: 'status', target: T })).parsed
eq(st0 && st0.paper && st0.paper.format, 'md',
  '★ 读回：格式真的是 md（status.paper.format —— 这不是一份会写 tex 行的稿子，正是 F72-7 的现场）')

const rendered = await receipt(v5r, 'vibe_v5_paper', { action: 'render', target: T })
ok(rendered.parsed && rendered.parsed.ok === true, '★ 正：render 成功执行', rendered.parsed && rendered.parsed.ok)
eq(rendered.parsed && rendered.parsed.wroteToLedger, ['md', 'meta'],
  '★ 读回：render 只写了 md/meta 行 —— 格式是 md，tex 行永远不会有（这就是 F72-7 的现场）')
ok(rendered.parsed && Array.isArray(rendered.parsed.missing) && rendered.parsed.missing.includes('tex'),
  '★ 读回：render 的 missing 里有 tex —— 因为格式是 md，render 本来就不写 tex 行（下面这个读数不允许出现在 pdf 块里）',
  rendered.parsed && rendered.parsed.missing)
ok(rendered.parsed && rendered.parsed.archiveArtifacts && rendered.parsed.archiveArtifacts.scope === 'archive',
  '★ 正：render 也带 archiveArtifacts（同一批行，另一个名字）', rendered.parsed && rendered.parsed.archiveArtifacts)

const compiled = await receipt(v5r, 'vibe_v5_paper', { action: 'compile', target: T })
const c = compiled.parsed && compiled.parsed.compiled
ok(!!c && c.ok === true && c.produced === true,
  '★★★ 正：compile 真的产出了 PDF（produced:true，引擎是桩的那个）', c && { ok: c.ok, produced: c.produced })
eq(c && c.missing, [],
  '★★★ 正(F72-7 修复)：produced:true 时 missing 是【空】—— 这次编译什么都不缺')
ok(!!c && Array.isArray(c.archiveArtifacts && c.archiveArtifacts.missing) && c.archiveArtifacts.missing.length > 0 && c.archiveArtifacts.missing.includes('tex'),
  '★★★ 正：archiveArtifacts.missing 仍旧点名 tex（行没写，不是编译缺输入）—— 两个问题，两处读数',
  c && c.archiveArtifacts && c.archiveArtifacts.missing)
eq(c && c.archiveArtifacts && c.archiveArtifacts.present && c.archiveArtifacts.present.pdf, true,
  '★★ 读回：archiveArtifacts.present.pdf 是 true（compile 真写了 pdf 行）')
eq(c && c.toolchainAbsent, [],
  '★★ 正：toolchainAbsent 空 —— 引擎在场，环境不缺东西')
ok(!!c && typeof c.missingMeans === 'string' && /PRODUCED the pdf/.test(c.missingMeans),
  '★★ 正：missingMeans 明说这个空列表的原因（不是"没检查"）', c && c.missingMeans)
ok(!!c && typeof c.toolchainAbsentMeans === 'string' && c.toolchainAbsentMeans.length > 0,
  '★★ 正：toolchainAbsentMeans 给了那句话（空列表也解释）', c && c.toolchainAbsentMeans)
// MUTUAL EXCLUSION — the whole point of F72-7, asserted on the same receipt:
ok(!!c && !(Array.isArray(c.missing) && c.missing.length > 0 && c.produced === true),
  '★★★ 互斥：produced:true ⇒ missing 必须为空')
ok(!!c && (Array.isArray(c.missing) && c.missing.filter((n) => Array.isArray(c.toolchainAbsent) && c.toolchainAbsent.includes(n)).length === 0),
  '★★★ 互斥：missing 与 toolchainAbsent 不重叠（同一件事不会出现在两个名单里）')

// F72-6: the byte numbers on the paper face cover the WHOLE file — measured against the disk, not copied from the
// receipt. The paper face prints no sha field at all, so it cannot silently mix file and body scope.
// WHERE the file really is: the compile receipt's own relative `pdfPath`, resolved against the cwd the kit used.
const diskPath = resolve(process.cwd(), String((c && c.pdfPath) || 'missing.pdf'))
ok(/paper-/.test(diskPath) && diskPath.endsWith('.pdf'), '前置：compile 回执给了 pdfPath（下面按它找磁盘）', c && c.pdfPath)
const diskPdf = await readFile(diskPath).catch(() => null)
ok(diskPdf !== null, '前置(RULE E)：编译产物真的落在磁盘上（下面的字节数是量出来的）', !!diskPdf)
eq(c && c.pdfBytes, byteLen(PDF_TEXT), '★ 正(F72-6)：pdf 块的 pdfBytes = 整个文件的字节数（量过磁盘）')
eq(diskPdf === null ? null : diskPdf.length, byteLen(PDF_TEXT), '★ 正(F72-6)：磁盘上的 PDF 字节数与回执一致')
// ★★★ TB-2772 / audit4 P1: the pdf block now CARRIES the FILE hash — `final` is the moment the compile happens, so a
// reader must not need a second `status` call to learn which bytes were finalised. The F72-6 rule still holds: this hash
// is the WHOLE FILE's (compared with the bytes on disk), never a body fingerprint wearing a file name.
const diskSha = diskPdf === null ? null : createHash('sha256').update(diskPdf).digest('hex')
ok(!!c && typeof c.pdfSha256 === 'string' && /^[0-9a-f]{64}$/.test(c.pdfSha256) && c.pdfSha256 === diskSha,
  '★★ 正(TB-2772/audit4)：pdf 块的 pdfSha256 是整个磁盘 PDF 的 sha256（final/compile 回执自足，不必再调 status）',
  c && { pdfSha256: c.pdfSha256, diskSha })
ok(!!c && typeof c.pdfSha256Means === 'string' && /file|bytes/i.test(c.pdfSha256Means),
  '★ 正(F72-6)：pdfSha256Means 明说这是【文件字节】的哈希，不是正文指纹', c && c.pdfSha256Means)

// ── §2. THE OFFICE STATUS FACE CARRIES THE SAME TWO READINGS ──────────────────────────────────────────────────
console.log('=== 2. status：同一个矛盾不允许在两个门里活着 ===')
const st = (await receipt(v5r, 'vibe_v5_paper', { action: 'status', target: T })).parsed
ok(!!st && st.ok === true && st.pdfCompiled && st.pdfCompiled.produced === true,
  '★★ 正：status 读回 pdfCompiled.produced:true（台账里真有这条编译）', st && st.pdfCompiled && st.pdfCompiled.produced)
eq(st && st.missing, [],
  '★★★ 正(F72-7 修复)：有编译在案时 status.missing 是【空】')
ok(!!st && st.archiveArtifacts && Array.isArray(st.archiveArtifacts.missing) && st.archiveArtifacts.missing.includes('tex'),
  '★★★ 正：status.archiveArtifacts.missing 仍旧点名 tex（行没写）', st && st.archiveArtifacts && st.archiveArtifacts.missing)
ok(!!st && !(Array.isArray(st.missing) && st.missing.length > 0 && st.pdfCompiled && st.pdfCompiled.produced === true),
  '★★★ 互斥：status 上 produced:true ⇒ missing 为空')
// ★★★ RUN 256 (TB-2624 item 1): status no longer says "I only read the ledger, so I cannot know". It reports the
// SAME observation compile/final made in this session (`latexAvailable:true` here because the engine really ran), and
// the means sentence states it is an OBSERVATION, never an installation claim made by a read.
ok(!!st && Array.isArray(st.toolchainAbsent) && st.toolchainAbsent.length === 0 && st.latexAvailable === true && /OBSERVATION/.test(String(st.toolchainAbsentMeans)),
  '★★ 正：status 报的是本会话的观测（引擎跑过 ⇒ latexAvailable:true），并明说不是「已安装」的断言', st && { toolchainAbsent: st.toolchainAbsent, latexAvailable: st.latexAvailable, means: st.toolchainAbsentMeans })
ok(!!st && typeof st.missingMeans === 'string' && /compile IS on file/.test(st.missingMeans),
  '★★ 正：status.missingMeans 解释了空列表来自"编译在案"', st && st.missingMeans)
// F72-6 on the ledger reading too: the compile bytes and the disk-file bytes are the SAME whole file.
eq(st && st.pdfCompiled && st.pdfCompiled.pdfBytes, byteLen(PDF_TEXT),
  '★ 正(F72-6)：status.pdfCompiled.pdfBytes 也是整个文件的字节数')
eq(st && st.pdfCompiled && st.pdfCompiled.diskFileBytes, byteLen(PDF_TEXT),
  '★ 正(F72-6)：diskFileBytes 与 pdfBytes 同一口径（整个文件）')

// ── §3. A REAL FINALISATION: finalized IS NOT complete, AND THE RECEIPT MUST NOT SAY tex IS MISSING ─────────────
console.log('=== 3. 真定稿：finalized:true 与 complete:false 同时成立（F72-9），missing 仍是空的 ===')
const card = await receipt(v5r, 'vibe_v5_record_proposition', { id: 'p-md-1', statement: '论文只整理已有证据', value: 0.5, motive: '定稿前的证据核对', p: 0.5 })
ok(card.parsed && card.parsed.ok === true && card.parsed.recordId === 'p-md-1',
  '前置：证据卡片真的在记录面上（下面的 part 指针能解析）', card.parsed && card.parsed.code)
const part = await receipt(v5r, 'vibe_v5_paper', { action: 'part', target: T, member: ACAD, part: '第一部分', solution: '测试用的解法正文', evidence: ['Members/' + ACAD + '/Propos/p-md-1.md'] })
ok(part.parsed && part.parsed.ok === true && part.parsed.part && part.parsed.part.ok === true,
  '★ 正：part 记下一份写作（证据指针当场解析）', part.parsed && part.parsed.part && part.parsed.part.code)
const adv1 = await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T })
eq(adv1.parsed && adv1.parsed.advance && adv1.parsed.advance.to, 'reviewing', '★ 正：advance 到 reviewing')
const rvw1 = await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: ACAD, deliverable: true, notes: '可交付' })
const rvw2 = await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T, member: R1, deliverable: true, notes: '可交付' })
ok(rvw1.parsed && rvw1.parsed.ok === true && rvw2.parsed && rvw2.parsed.ok === true,
  '★ 正：两位成员的互审都记下（未表态不算可交付）', [rvw1.parsed && rvw1.parsed.ok, rvw2.parsed && rvw2.parsed.ok])
const adv2 = await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T })
eq(adv2.parsed && adv2.parsed.advance && adv2.parsed.advance.to, 'awaiting-editor', '★ 正：advance 到 awaiting-editor')
const blocked = await receipt(v5r, 'vibe_v5_paper', { action: 'final', target: T, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })
eq(codeOf(blocked.parsed), 'VMU_OFFICE_CONSULT_REQUIRED', '★ 正：所办闸真的拦了一次（定稿不是绕过它）')
const consultState = (await receipt(v5r, 'vibe_v5_paper', { action: 'consult_state', target: T })).parsed
const reqId = consultState && consultState.consult && consultState.consult.awaiting && consultState.consult.awaiting.id
ok(typeof reqId === 'string' && reqId !== '', '前置(RULE E)：有一条真正在等的问询 id', reqId)
const answered = await receipt(v5r, 'vibe_v5_paper', { action: 'consult', target: T, member: OFFICE, request_id: reqId, answer: '看过正文，可交付' })
ok(answered.parsed && answered.parsed.ok === true, '★ 正：所办通过工具面答复', answered.parsed && answered.parsed.code)
const finRaw = await receipt(v5r, 'vibe_v5_paper', { action: 'final', target: T, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })
const fin = finRaw.parsed && finRaw.parsed.final
ok(!!fin && fin.ok === true && fin.finalized === true, '★★ 正：这一次真的定稿了', fin && { ok: fin.ok, finalized: fin.finalized })
eq(fin && fin.missing, [],
  '★★★ 正(F72-7 修复)：定稿产出了 PDF，所以 missing 为空 —— tex 行没写是 archiveArtifacts 的事')
ok(!!fin && fin.pdf && fin.pdf.produced === true, '★★ 正：定稿的 pdf 块 produced:true', fin && fin.pdf && fin.pdf.produced)
eq(fin && fin.toolchainAbsent, [], '★★ 正：定稿回执里 toolchainAbsent 为空（引擎在场）')
ok(!!fin && fin.archiveArtifacts && Array.isArray(fin.archiveArtifacts.missing) && fin.archiveArtifacts.missing.length > 0 && fin.archiveArtifacts.missing.includes('tex'),
  '★★★ 正：定稿回执的 archiveArtifacts.missing 仍旧点名 tex（md 格式的稿子永远不写 tex 行）', fin && fin.archiveArtifacts && fin.archiveArtifacts.missing)
ok(!!fin && fin.archiveArtifacts && fin.archiveArtifacts.present && fin.archiveArtifacts.present.pdf === true,
  '★★ 读回：定稿后 archiveArtifacts.present.pdf 是 true（重读的是编译之后的台账）')
ok(!!fin && !(Array.isArray(fin.missing) && fin.missing.length > 0 && fin.pdf && fin.pdf.produced === true),
  '★★★ 互斥：final 的 produced:true ⇒ missing 为空')
ok(!!fin && (fin.missing.filter((n) => (fin.toolchainAbsent || []).includes(n)).length === 0),
  '★★★ 互斥：final 的 missing 与 toolchainAbsent 不重叠')

const stAfter = (await receipt(v5r, 'vibe_v5_paper', { action: 'status', target: T })).parsed
// F72-9 — the live run read `paper.status:"finalized"` and the teaching said published/complete. Two different questions,
// and now both are visible on ONE receipt: the state is finalized, and the archive row reading says NOT complete.
eq(stAfter && stAfter.paper && stAfter.paper.status, 'finalized', '★★ 正(F72-9)：状态机的终态叫 finalized')
eq(stAfter && stAfter.complete, false,
  '★★★ 正(F72-9)：同一份回执上 complete:false —— 定稿（状态）与四行齐（工件）是两个问题，不是同义词')
ok(!!stAfter && stAfter.archiveArtifacts && Array.isArray(stAfter.archiveArtifacts.missing) && stAfter.archiveArtifacts.missing.includes('tex'),
  '★★ 读回：complete:false 的原因是 tex 行不存在（archiveArtifacts 点名）', stAfter && stAfter.archiveArtifacts && stAfter.archiveArtifacts.missing)
eq(stAfter && stAfter.pdfCompiled && stAfter.pdfCompiled.produced, true,
  '★★ 正：而 PDF 确实存在（produced:true）—— 三个读数互不冒充')
has(PAPER_PACK_SRC, "export const PAPER_STATES = Object.freeze(['writing', 'reviewing', 'awaiting-editor', 'finalized'])",
  '★★ 正(F72-9 取证)：状态枚举只有这四个词（发布的终态叫 finalized，没有 published）')
ok(!PAPER_PACK_SRC.includes("'published'") && !PAPER_PACK_SRC.includes("'complete'"),
  '★★ 反(F72-9 取证)：paper.js 里没有 published/complete 这两个状态词 —— 教它的人教错了，不是代码少了分支')
has(KIT_PAPER_SRC, "state.status = 'finalized'", '★★ 正(F72-9 取证)：终态的写入点在 kit/paper.js（定稿那一刻写状态）')

// ── §4. THE ENGINE-ABSENT BRANCH: the environment question is named, never merged into `missing` ──────────────
console.log('=== 4. 没有 LaTeX 的机器：定稿照旧发生，但读数必须说明缺的是【环境】 ===')
const T2 = 'p-env'
await receipt(v5r, 'vibe_v5_paper', { action: 'start', target: T2, participants: [ACAD, R1], format: 'both' })
const card2 = await receipt(v5r, 'vibe_v5_record_proposition', { id: 'p-env-1', statement: '环境缺引擎不是论文为假', value: 0.5, motive: '引擎缺失分支的证据', p: 0.5 })
ok(card2.parsed && card2.parsed.ok === true, '前置：第二篇论文的证据卡片也在记录面上')
await receipt(v5r, 'vibe_v5_paper', { action: 'part', target: T2, member: ACAD, part: '第一部分', solution: '引擎缺失分支的正文', evidence: ['Members/' + ACAD + '/Propos/p-env-1.md'] })
await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T2 })
await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T2, member: ACAD, deliverable: true, notes: '可交付' })
await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: T2, member: R1, deliverable: true, notes: '可交付' })
await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: T2 })
// now the environment loses its engine
stubLatex(kernel, { check: async (request) => ({ ok: false, code: 'VMU_PAPER_LATEX_NO_ENGINE', engine: null, tried: [], stdout: '', stderr: '', outDir: request.outDir }) })
const envCompile = (await receipt(v5r, 'vibe_v5_paper', { action: 'compile', target: T2 })).parsed
const ec = envCompile && envCompile.compiled
ok(!!ec && ec.ok === false && ec.produced === false, '★ 正：没有引擎时 compile 是具名失败（produced:false）', ec && { ok: ec.ok, code: ec.code })
eq(ec && ec.missing, ['pdf'], '★★★ 正(F72-7)：这次编译缺的就是 pdf —— 缺输入与缺环境已经分开')
eq(ec && ec.toolchainAbsent, ['latex'], '★★★ 正(F72-7)：缺的是【环境】里的 latex，名字写在这里')
ok(!!ec && (ec.missing.filter((n) => (ec.toolchainAbsent || []).includes(n)).length === 0),
  '★★★ 互斥：环境缺件不进 missing（两个名单不重叠）')
ok(!!ec && typeof ec.toolchainAbsentMeans === 'string' && /COMPILER toolchain/.test(ec.toolchainAbsentMeans),
  '★★ 正：toolchainAbsentMeans 明说这是环境事实、不是本次缺输入', ec && ec.toolchainAbsentMeans)
const blocked2 = await receipt(v5r, 'vibe_v5_paper', { action: 'final', target: T2, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })
const envReqId = (() => { const m = String((blocked2.parsed && blocked2.parsed.message) || '').match(/consult-[A-Za-z0-9_-]+/); return m ? m[0] : null })()
ok(typeof envReqId === 'string', '前置(RULE E)：第二篇的问询 id 可从拒绝消息里读出', envReqId)
await receipt(v5r, 'vibe_v5_paper', { action: 'consult', target: T2, member: OFFICE, request_id: envReqId, answer: '看过，可交付' })
const envFinRaw = await receipt(v5r, 'vibe_v5_paper', { action: 'final', target: T2, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })
const envFin = envFinRaw.parsed && envFinRaw.parsed.final
ok(!!envFin && envFin.finalized === true, '★★ 正：缺引擎的机器上定稿仍然发生（环境缺口不是论文为假）', envFin && { finalized: envFin.finalized, code: envFin.code })
ok(!!envFin && envFin.pdfEnvironmentMissing === true, '★★ 正：回执具名 pdfEnvironmentMissing:true', envFin && envFin.pdfEnvironmentMissing)
eq(envFin && envFin.missing, ['pdf'], '★★★ 正(F72-7)：定稿缺的是 pdf（动作读数），不是 archive 行')
eq(envFin && envFin.toolchainAbsent, ['latex'], '★★★ 正(F72-7)：缺的环境件是 latex，写在 toolchainAbsent')
ok(!!envFin && (envFin.missing.filter((n) => (envFin.toolchainAbsent || []).includes(n)).length === 0),
  '★★★ 互斥：定稿回执的 missing 与 toolchainAbsent 不重叠')
ok(!!envFin && Array.isArray(envFin.archiveArtifacts && envFin.archiveArtifacts.missing) && envFin.archiveArtifacts.missing.length > 0,
  '★★ 正：archiveArtifacts 依旧给出行读数（这里 pdf 行确实不存在）', envFin && envFin.archiveArtifacts && envFin.archiveArtifacts.missing)

// ── §5. THE READINGS THAT MUST STAY ADVISORY (F72-11) AND THE BYTE SCOPE (F72-6) ──────────────────────────────
console.log('=== 5. F72-11：数学计数是【读数】不是闸门；F72-6：论文面的字节数只有一个口径 ===')
has(KIT_PAPER_SRC, 'texMath.proseUnderscores += (String(chunk).match(/_/g) || []).length',
  '★ 正(F72-11 取证)：proseUnderscores 数的是成对 $ 之外的 _（会被转义成字面文本）')
ok(!/proseUnderscores/.test(QUALITY_SRC),
  '★★★ 正(F72-11)：内容闸门 paper-quality.js 不读 math.proseUnderscores —— 它确实是"有计数、没进闸门"的读数')
ok(!/proseUnderscores/.test(String(TOOLS_SRC.split('projectPdfBlock')[0])),
  '★★ 正(F72-11)：工具面也没有把它当拒绝条件（计数只在 math 块里旅行）')
ok(!!c && c.math && typeof c.math.proseUnderscores === 'number',
  '★ 读回：compile 回执的 math 块带着这个计数（可读、可不读）', c && c.math && c.math.proseUnderscores)

// ── §6. TB-2768: GLYPH LOSS IS A TOP-LEVEL READING OF THE PAPER RECEIPT (ok:true must not hide it) ─────────────
console.log('=== 6. TB-2768：编译成功但日志报了 Missing character ⇒ 回执顶层可读（不是只藏在 math 里） ===')
stubLatex(kernel, { check: async (request) => {
  const base = await writeFakePdf(request)
  return Object.assign({}, base, { logRead: true, logPath: 'fake.log', glyphLossDetected: true, missingCharacterCount: 3,
    glyphsUnrepaired: [{ char: 'ℤ', u: 'U+2124', count: 3, font: 'lmroman10-regular', where: '1, 4' }],
    glyphLossCode: 'VMU_PAPER_GLYPH_UNCOVERED',
    glyphLossMeans: 'the compile EXITED 0 and wrote a PDF, but its log names 1 distinct glyph the font could not print' })
} })
const glyphReceipt = (await receipt(v5r, 'vibe_v5_paper', { action: 'compile', target: T })).parsed
ok(!!glyphReceipt && glyphReceipt.ok === true, '前置：compile 回执存在且 ok:true', glyphReceipt && glyphReceipt.ok)
eq(glyphReceipt && glyphReceipt.glyphLossDetected, true, '★★ 正(TB-2768)：ok:true 的回执 TOP LEVEL 带 glyphLossDetected:true')
eq(glyphReceipt && glyphReceipt.glyphLossCode, 'VMU_PAPER_GLYPH_UNCOVERED', '★★ 正：具名码 VMU_PAPER_GLYPH_UNCOVERED')
ok(Array.isArray(glyphReceipt && glyphReceipt.glyphsUnrepaired) && glyphReceipt.glyphsUnrepaired.length === 1 && glyphReceipt.glyphsUnrepaired[0].char === 'ℤ',
  '★★ 正：顶层带 glyphsUnrepaired 行（char/u/count/font/where）', glyphReceipt && glyphReceipt.glyphsUnrepaired)
ok(!!glyphReceipt && glyphReceipt.compiled && glyphReceipt.compiled.math && glyphReceipt.compiled.math.glyphLossDetected === true &&
  Array.isArray(glyphReceipt.compiled.math.glyphsUnrepaired) && glyphReceipt.compiled.math.glyphsUnrepaired.length === 1,
  '★ 正：同一读数也进 pdf 块的 math（一份读数两个入口）', glyphReceipt && glyphReceipt.compiled && glyphReceipt.compiled.math)
ok(!!glyphReceipt && glyphReceipt.compiled && glyphReceipt.compiled.stderrFindings && glyphReceipt.compiled.stderrFindings.missingCharacterCount === 3 &&
  glyphReceipt.compiled.stderrFindings.source === 'engine-log' && glyphReceipt.compiled.stderrFindings.glyphLossDetected === true,
  '★★ 正：compiled.stderrFindings 是 TB-2768 点名的「把 Missing character 计入回执」', glyphReceipt && glyphReceipt.compiled && glyphReceipt.compiled.stderrFindings)
ok(typeof glyphReceipt.glyphLossMeans === 'string' && /could not print/.test(glyphReceipt.glyphLossMeans),
  '★ 正：means 明说「PDF 存在但字形没打印」', glyphReceipt && glyphReceipt.glyphLossMeans)

// ── §6. TB-2772: A PDF WITH DROPPED GLYPHS IS A NAMED REFUSAL, NOT A DELIVERABLE ─────────────────────────────────
console.log('=== 6. TB-2772：final 检测到缺字 ⇒ ok:false + VMU_PAPER_GLYPH_UNCOVERED + 逐字改写 hint（不留 awaiting-editor 之外的状态）===')
{
  // The REAL 23 `Missing character` lines from RUN 82 attempt-1's paper-p1.log (sanitised: same characters/fonts/counts).
  const RUN82_LOG = [
    'Missing character: There is no ∉ (U+2209) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⌊ (U+230A) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⌋ (U+230B) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⌊ (U+230A) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⌋ (U+230B) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⌊ (U+230A) in font [lmroman10-bold]:mapping=t',
    'Missing character: There is no ⌋ (U+230B) in font [lmroman10-bold]:mapping=t',
    'Missing character: There is no ⌊ (U+230A) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⌋ (U+230B) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⌊ (U+230A) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⌋ (U+230B) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ① (U+2460) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ① (U+2460) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ① (U+2460) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ② (U+2461) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ② (U+2461) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ② (U+2461) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ③ (U+2462) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ③ (U+2462) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ③ (U+2462) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ④ (U+2463) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ④ (U+2463) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⑤ (U+2464) in font [lmroman10-regular]:mapping=t',
  ].join('\n')
  const hist = missingCharactersOf(RUN82_LOG)
  ok(hist.length === 10, '★ 正(TB-2772)：第 82 次的 23 行日志收敛为 10 行（同一字符两种字体各一行）', hist)
  ok(hist.reduce((n, r) => n + r.count, 0) === 23, '★ 正：合计 23 次（与 V15 的 uffff=23 同数）', hist.reduce((n, r) => n + r.count, 0))
  const OBS82 = ['⌊', '⌋', '∉', '①', '②', '③', '④', '⑤']
  const distinct82 = [...new Set(hist.map((r) => r.char))].sort()
  ok(JSON.stringify(distinct82) === JSON.stringify(OBS82.slice().sort()),
    '★★ 正：8 个 distinct 字形就是 run-lane 的 V15 清单（∉ ⌊ ⌋ ① ② ③ ④ ⑤）', distinct82)

  // helper: drive a paper to awaiting-editor with a body carrying the given text
  const makePaperAtEditor = async (target, bodyText) => {
    const cardId = target === 'p-glyph-unknown' ? 'tb2772u' : 'tb2772-' + target
    const card = await receipt(v5r, 'vibe_v5_record_proposition', { id: cardId, statement: '缺字闸的正文（' + target + '）', value: 0.5, motive: 'TB-2772 判定：' + target, p: 0.5 })
    ok(card.parsed && card.parsed.ok === true, '前置(' + target + ')：证据卡落库', card.parsed && { code: card.parsed.code, recordId: card.parsed.recordId, track: card.parsed.track })
    // the records fold write is queued (fire-and-forget), so let the pointer resolve before the part references it
    await new Promise((resolve) => setTimeout(resolve, 200))
    const st = await receipt(v5r, 'vibe_v5_paper', { action: 'start', target, participants: [ACAD, R1], format: 'both' })
    ok(st.parsed && st.parsed.ok === true, '前置(' + target + ')：论文开题', st.parsed && st.parsed.code)
    const partA = await receipt(v5r, 'vibe_v5_paper', { action: 'part', target, member: ACAD, part: 'A 的第一部分', solution: bodyText, evidence: ['Members/' + ACAD + '/Propos/' + cardId + '.md'] })
    ok(partA.parsed && partA.parsed.ok === true, '前置(' + target + ')：ACAD 的 part 写入成功', partA.parsed && { code: partA.parsed.code, message: String(partA.parsed.message || '').slice(0, 200), hint: String(partA.parsed.hint || '').slice(0, 200) })
    const partB = await receipt(v5r, 'vibe_v5_paper', { action: 'part', target, member: R1, part: 'R1 的第二部分', solution: '补充说明：' + bodyText, evidence: ['Members/' + ACAD + '/Propos/' + cardId + '.md'] })
    ok(partB.parsed && partB.parsed.ok === true, '前置(' + target + ')：R1 的 part 写入成功', partB.parsed && { code: partB.parsed.code, message: String(partB.parsed.message || '').slice(0, 200), hint: String(partB.parsed.hint || '').slice(0, 200) })
    await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target })
    await receipt(v5r, 'vibe_v5_paper', { action: 'review', target, member: ACAD, of: R1, deliverable: true, notes: '可交付' })
    await receipt(v5r, 'vibe_v5_paper', { action: 'review', target, member: R1, of: ACAD, deliverable: true, notes: '可交付' })
    const adv = await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target })
    eq(adv.parsed && adv.parsed.advance && adv.parsed.advance.to, 'awaiting-editor', '前置(' + target + ')：advance 到 awaiting-editor')
    // the office-consult gate may arm on this assembly: answer it once so the NEXT final reaches the glyph gate
    const probeFinal = await receipt(v5r, 'vibe_v5_paper', { action: 'final', target, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })
    if (probeFinal.parsed && probeFinal.parsed.code === 'VMU_OFFICE_CONSULT_REQUIRED') {
      const cs = (await receipt(v5r, 'vibe_v5_paper', { action: 'consult_state', target })).parsed
      const req = cs && cs.consult && cs.consult.awaiting && cs.consult.awaiting.id
      ok(typeof req === 'string' && req !== '', '前置(' + target + ')：所办问询 id 可读', req)
      await receipt(v5r, 'vibe_v5_paper', { action: 'consult', target, member: OFFICE, request_id: req, answer: '看过正文，可交付' })
    }
  }
  const glyphRows82 = hist.map((r) => ({ char: r.char, u: r.u, count: r.count, font: r.font, where: '2, 5' }))
  const glyphStub = (rows, count) => async (request) => {
    const base = await writeFakePdf(request)
    return Object.assign({}, base, { logRead: true, logPath: 'fake.log', glyphLossDetected: true, missingCharacterCount: count,
      glyphsUnrepaired: rows, glyphLossCode: 'VMU_PAPER_GLYPH_UNCOVERED',
      glyphLossMeans: 'the compile EXITED 0 and wrote a PDF, but its log names ' + String(rows.length) + ' distinct glyph(s) the font could not print' })
  }

  // ① the run-82 fixture set ⇒ final REFUSES by name, hint names every rewrite, state stays awaiting-editor
  const TG = 'p-glyph-refuse'
  await makePaperAtEditor(TG, '设 ⌊x⌋ 与 A ∉ B；① ② ③ ④ ⑤ 五步。')
  // FIRST prove the EXPANDED TABLE covers the observed set on the real pack: render that body and read the .tex row back.
  const rend82 = (await receipt(v5r, 'vibe_v5_paper', { action: 'render', target: TG })).parsed
  ok(!!rend82 && rend82.math && rend82.math.glyphsRepaired >= 8, '★★ 正(TB-2772 扩表)：8 个观察到的字形都被替换表修复', rend82 && rend82.math && rend82.math.glyphsRepaired)
  const texRow82Id = rend82 && rend82.recordIds && typeof rend82.recordIds.tex === 'string' ? rend82.recordIds.tex : null
  ok(texRow82Id !== null, '前置：render 回执给出 .tex 行 id', rend82 && rend82.recordIds)
  const texRow82 = texRow82Id === null ? null : kernel.records.get({ id: texRow82Id })
  const tex82 = String((texRow82 && texRow82.body) || '')
  ok(OBS82.every((ch) => !tex82.includes(ch)), '★★ 正：8 个裸 unicode 字符不再进入 .tex（字体拿不到它们）', OBS82.filter((ch) => tex82.includes(ch)))
  ok(tex82.includes('\\lfloor{}') && tex82.includes('\\rfloor{}') && tex82.includes('\\notin{}') && tex82.includes('(1)') && tex82.includes('(5)'),
    '★★ 正：.tex 里是 LaTeX 命令（⌊⌋∉ + ①..⑤→(1)..(5)）', tex82.slice(0, 200))
  stubLatex(kernel, { check: glyphStub(glyphRows82, 23) })
  const beforeSt = (await receipt(v5r, 'vibe_v5_paper', { action: 'status', target: TG })).parsed
  const roundBefore = beforeSt && beforeSt.paper ? beforeSt.paper.round : null
  const refused = (await receipt(v5r, 'vibe_v5_paper', { action: 'final', target: TG, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })).parsed
  eq(refused && refused.ok, false, '★★ 正(TB-2772)：缺字时 final 是 ok:false（不可交付物不得静默交付）')
  eq(refused && refused.code, 'VMU_PAPER_GLYPH_UNCOVERED', '★★ 正：具名码 VMU_PAPER_GLYPH_UNCOVERED')
  eq(refused && refused.finalized, false, '★★ 正：finalized:false（没有定稿）')
  eq(refused && refused.stage, 'awaiting-editor', '★★ 正：状态停在 awaiting-editor')
  // RULE E: the equality below compares TWO collections, so both sides are proven non-empty FIRST (two empty lists
  // compare equal and would make this check vacuous) — `hist` comes from the real log fixture, `glyphsUnrepaired` from
  // the refusal, and both must carry rows before "same length" means anything.
  ok(hist.length > 0, '前置(RULE E)：真实 run-82 日志收敛出的字形行非空', hist.length)
  ok(Array.isArray(refused && refused.glyphsUnrepaired) && refused.glyphsUnrepaired.length > 0,
    '前置(RULE E)：拒收回执的 glyphsUnrepaired 非空（空集上的 .every() 恒真）', refused && refused.glyphsUnrepaired)
  ok(Array.isArray(refused && refused.glyphsUnrepaired) && refused.glyphsUnrepaired.length === hist.length,
    '★★ 正：顶层带 ' + String(hist.length) + ' 行 glyphsUnrepaired（char/码位/次数/字体；同字两字体各一行）', refused && refused.glyphsUnrepaired)
  ok(refused && Array.isArray(refused.glyphsUnrepaired) && refused.glyphsUnrepaired.length > 0 && refused.glyphsUnrepaired.every((g) => typeof g.char === 'string' && /^U\+[0-9A-F]+$/.test(String(g.u)) && Number.isFinite(Number(g.count)) && typeof g.font === 'string'),
    '★ 正：每行都含 char / 码位 / 次数 / 字体', refused && refused.glyphsUnrepaired)
  const hint = String((refused && refused.hint) || '')
  ok(OBS82.every((ch) => hint.includes(ch)), '★★ 正：hint 逐字列出本轮 8 个字符', { hint })
  ok(hint.includes('\\lfloor') && hint.includes('\\rfloor') && hint.includes('\\notin') && hint.includes('(1)'),
    '★★ 正：hint 逐字给出对应 LaTeX 写法（⌊→\\lfloor、⌋→\\rfloor、∉→\\notin、①→(1)）', { hint })
  ok(/call final again|再调/.test(hint), '★ 正：hint 明说改完正文后再调 final', { hint })
  const stAfterRefuse = (await receipt(v5r, 'vibe_v5_paper', { action: 'status', target: TG })).parsed
  eq(stAfterRefuse && stAfterRefuse.paper && stAfterRefuse.paper.status, 'awaiting-editor', '★★ 正：status 也证明停在 awaiting-editor')
  eq(stAfterRefuse && stAfterRefuse.paper && stAfterRefuse.paper.round, roundBefore, '★★ 正：拒后 rounds 不推进')
  eq(stAfterRefuse && stAfterRefuse.pdfCompiled && stAfterRefuse.pdfCompiled.produced, true,
    '★ 正：final 之外的面仍能看到读数（pdfCompiled.produced:true，pdf 行已写）', stAfterRefuse && stAfterRefuse.pdfCompiled && stAfterRefuse.pdfCompiled.produced)
  eq(stAfterRefuse && stAfterRefuse.pdfCompiled && stAfterRefuse.pdfCompiled.glyphLossDetected, true,
    '★ 正：status.pdfCompiled 也带 glyphLossDetected:true', stAfterRefuse && stAfterRefuse.pdfCompiled && stAfterRefuse.pdfCompiled.glyphLossDetected)

  // same paper, table/stub clean ⇒ final SUCCEEDS (the refusal is about the dropped glyphs, not about the paper)
  stubLatex(kernel, { check: writeFakePdf })
  const fixed = (await receipt(v5r, 'vibe_v5_paper', { action: 'final', target: TG, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })).parsed
  eq(fixed && fixed.ok, true, '★★ 正：扩表/改写后同一篇 final 成功（ok:true）')
  eq(fixed && fixed.final && fixed.final.finalized, true, '★★ 正：定稿真的发生（final.finalized）')

  // ② one UNCOVERED character (not in the repair table): refused too, and the hint says it is not in the table
  const TU = 'p-glyph-unknown'
  await makePaperAtEditor(TU, '未覆盖字符 𝐀 出现在这里。')
  stubLatex(kernel, { check: glyphStub([{ char: '𝐀', u: 'U+1D400', count: 1, font: 'lmroman10-regular', where: '1' }], 1) })
  const unknownRef = (await receipt(v5r, 'vibe_v5_paper', { action: 'final', target: TU, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })).parsed
  eq(unknownRef && unknownRef.code, 'VMU_PAPER_GLYPH_UNCOVERED', '★★ 正：表外字符同样被具名拒')
  ok(/未收录/.test(String((unknownRef && unknownRef.hint) || '')), '★★ 正：表外字符的 hint 明说「替换表未收录」，并指路改用 LaTeX 命令', unknownRef && unknownRef.hint)

  // ③ anti-lamp: boot a COPY whose kit no longer refuses ⇒ the same final comes back ok:true (the gate is load-bearing)
  const copyRoot = await mkdtemp(join(__tmpRoot(), 'run252-glyph-lamp-'))
  cpSync(join(REPO, 'vibe-math-vmu'), join(copyRoot, 'vibe-math-vmu'), { recursive: true })
  const kitCopy = join(copyRoot, 'vibe-math-vmu', 'kit', 'paper.js')
  const kitSrc = await readFile(kitCopy, 'utf8')
  const guard = 'if (pdf && pdf.ok === true && pdf.glyphLossDetected === true) {'
  ok(kitSrc.includes(guard), 'lamp-setup：拒字闸在 kit/paper.js 里按名字可定位')
  await writeFile(kitCopy, kitSrc.split(guard).join('if (false) {'), 'utf8')
  const lampV5r = await bootOf(pathToFileURL(join(copyRoot, 'vibe-math-vmu', 'vibe-math-vmu.js')).href, { root: join(copyRoot, 'v5r'), packs: ['v5r'], 'vmu.paper.officeConsult': 'off' })
  try {
    const lampKernel = lampV5r.handle.kernel
    await lampKernel.members.hire({ id: ACAD, slot: 'chair' })
    await lampKernel.members.hire({ id: R1, slot: 'member' })
    await lampKernel.members.hire({ id: OFFICE, slot: 'member' })
    const lampTarget = 'p-glyph-lamp'
    const lampCard = await receipt(lampV5r, 'vibe_v5_record_proposition', { id: 'tb2772-lamp', statement: '灯', value: 0.5, motive: '灯', p: 0.5 })
    ok(lampCard.parsed && lampCard.parsed.ok === true, 'lamp：副本里证据卡可写', lampCard.parsed && lampCard.parsed.code)
    await receipt(lampV5r, 'vibe_v5_paper', { action: 'start', target: lampTarget, participants: [ACAD, R1], format: 'both' })
    await receipt(lampV5r, 'vibe_v5_paper', { action: 'part', target: lampTarget, member: ACAD, part: 'A 的第一部分', solution: '设 ⌊x⌋ ∉ A', evidence: ['Members/' + ACAD + '/Propos/tb2772-lamp.md'] })
    await receipt(lampV5r, 'vibe_v5_paper', { action: 'part', target: lampTarget, member: R1, part: 'R1 的第二部分', solution: '补充：⌊x⌋', evidence: ['Members/' + ACAD + '/Propos/tb2772-lamp.md'] })
    await receipt(lampV5r, 'vibe_v5_paper', { action: 'advance', target: lampTarget })
    await receipt(lampV5r, 'vibe_v5_paper', { action: 'review', target: lampTarget, member: ACAD, of: R1, deliverable: true, notes: '可交付' })
    await receipt(lampV5r, 'vibe_v5_paper', { action: 'review', target: lampTarget, member: R1, of: ACAD, deliverable: true, notes: '可交付' })
    await receipt(lampV5r, 'vibe_v5_paper', { action: 'advance', target: lampTarget })
    stubLatex(lampKernel, { check: glyphStub([{ char: '⌊', u: 'U+230A', count: 1, font: 'lmroman10-regular', where: '1' }], 1) })
    const lampFinal = (await receipt(lampV5r, 'vibe_v5_paper', { action: 'final', target: lampTarget, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })).parsed
    ok(lampFinal && lampFinal.ok === true && lampFinal.final && lampFinal.final.finalized === true,
      '★★★ LAMP(RED-worthy)：把拒字闸去掉后，同一份缺字 PDF 又被静默定稿了（ok:true/finalized:true）—— 上面对 ok:false 的断言因此是有牙的',
      lampFinal && { ok: lampFinal.ok, finalized: lampFinal.final && lampFinal.final.finalized, code: lampFinal.code })
  } finally {
    await rm(copyRoot, { recursive: true, force: true }).catch(() => {})
  }
}

// ── §7. TB-2774: ONE PREDICATE — the FINGERPRINT decides "text changed"; the round is narrative ───────────────
console.log('=== 7. TB-2774：readReview / coverage / voidReviews 同一行不得相反（指纹唯一判据，round 只叙事）===')
{
  const tb2774Boot = async (cfg = {}) => {
    const b = await bootOf(pathToFileURL(ENTRY).href, Object.assign({ root: await mkdtemp(join(__tmpRoot(), 'tb2774-')), packs: ['v5r'], 'vmu.paper.officeConsult': 'off' }, cfg))
    const k = b.handle.kernel
    for (const [id, slot] of [[ACAD, 'chair'], [R1, 'member'], [OFFICE, 'member']]) await k.members.hire({ id, slot })
    return b
  }
  // scenario driver: two parts, cross reviews, then `final{revise}` puts the paper in round 2 WITHOUT rewriting any part
  const twoPartsAndReviews = async (b, target, cardId) => {
    const card = await receipt(b, 'vibe_v5_record_proposition', { id: cardId, statement: 'TB-2774 证据 ' + target, value: 0.5, motive: 'm', p: 0.5 })
    ok(card.parsed && card.parsed.ok === true, '前置(' + target + ')：证据卡落库', card.parsed && card.parsed.code)
    await new Promise((resolve) => setTimeout(resolve, 200))
    const ev = ['Members/' + ACAD + '/Propos/' + cardId + '.md']
    await receipt(b, 'vibe_v5_paper', { action: 'start', target, participants: [ACAD, R1], format: 'both' })
    await receipt(b, 'vibe_v5_paper', { action: 'part', target, member: ACAD, part: 'A 节', solution: 'A 的正文', evidence: ev })
    await receipt(b, 'vibe_v5_paper', { action: 'part', target, member: R1, part: 'B 节', solution: 'B 的正文', evidence: ev })
    await receipt(b, 'vibe_v5_paper', { action: 'advance', target })
    await receipt(b, 'vibe_v5_paper', { action: 'review', target, member: ACAD, of: R1, deliverable: true, notes: 'ok' })
    await receipt(b, 'vibe_v5_paper', { action: 'review', target, member: R1, of: ACAD, deliverable: true, notes: 'ok' })
    const toAwait = await receipt(b, 'vibe_v5_paper', { action: 'advance', target })
    ok(toAwait.parsed && toAwait.parsed.advance && toAwait.parsed.advance.to === 'awaiting-editor', '前置(' + target + ')：互审到 awaiting-editor', toAwait.parsed && (toAwait.parsed.code || toAwait.parsed.message))
    const rev = await receipt(b, 'vibe_v5_paper', { action: 'final', target, member: ACAD, decision: 'revise', note: '再来一轮' })
    ok(rev.parsed && rev.parsed.ok === true && rev.parsed.final && rev.parsed.final.moved === true, '前置(' + target + ')：final{revise} 打回 writing（round 推进）', rev.parsed && { code: rev.parsed.code, message: rev.parsed.message, final: rev.parsed.final && { ok: rev.parsed.final.ok, moved: rev.parsed.final.moved } })
  }
  // THE INVARIANT under test: a row whose judged fingerprint EQUALS the current fingerprint is never described as
  // "replaced"/stale, and every counted vote in reviewsRead is also in coverage.covered (and vice versa).
  const contradictionsOf = (receiptObj) => {
    const problems = []
    const adv = receiptObj && receiptObj.advance ? receiptObj.advance : {}
    const read = Array.isArray(adv.reviewsRead) ? adv.reviewsRead : []
    for (const row of read) {
      if (row && row.judgedPartFingerprint !== undefined && row.judgedPartFingerprint !== null && row.currentFingerprint !== undefined && row.currentFingerprint !== null &&
          String(row.judgedPartFingerprint) === String(row.currentFingerprint) && (row.stalePart === true || /replaced|text .*changed/i.test(String(row.means || '')))) {
        problems.push({ where: 'reviewsRead', member: row.member, sameFingerprint: true, stalePart: row.stalePart, means: String(row.means || '').slice(0, 120) })
      }
    }
    const stale = Array.isArray(adv.stale) ? adv.stale : ((receiptObj && Array.isArray(receiptObj.staleReviews)) ? receiptObj.staleReviews : [])
    for (const row of stale) {
      if (row && row.judgedPartFingerprint !== undefined && row.currentFingerprint !== undefined && String(row.judgedPartFingerprint) === String(row.currentFingerprint)) {
        problems.push({ where: 'stale', by: row.by, sameFingerprint: true, why: row.why, whyMeans: String(row.whyMeans || '').slice(0, 120) })
      }
    }
    const cov = adv.perRoundReviewCoverage || {}
    const coveredMembers = new Set((Array.isArray(cov.covered) ? cov.covered : []).map((c) => c && c.member))
    const countedMembers = new Set(read.filter((r) => r && r.deliverable === true).map((r) => r.member))
    for (const m of countedMembers) if (!coveredMembers.has(m)) problems.push({ where: 'coverage-vs-read', member: m, reason: 'counted in reviewsRead but absent from coverage.covered' })
    for (const m of coveredMembers) if (!countedMembers.has(m)) problems.push({ where: 'coverage-vs-read', member: m, reason: 'covered but not counted in reviewsRead' })
    return problems
  }

  // ── A. round moved, text UNCHANGED ⇒ no stale wording anywhere; all four columns agree ──
  {
    const A2 = await tb2774Boot()
    const TA = 'p2774a'
    await twoPartsAndReviews(A2, TA, 'c2774a')
    // writing → reviewing opens round 2; reviewing → awaiting-editor is the receipt that READS the round-1 votes
    const advOpen = await receipt(A2, 'vibe_v5_paper', { action: 'advance', target: TA })
    ok(advOpen.parsed && advOpen.parsed.advance && advOpen.parsed.advance.to === 'reviewing', '★ 前置：round 2 的第一次 advance 到 reviewing', advOpen.parsed && advOpen.parsed.advance && advOpen.parsed.advance.to)
    const advA = await receipt(A2, 'vibe_v5_paper', { action: 'advance', target: TA })
    const advObj = advA.parsed && advA.parsed.advance
    ok(!!advObj && advObj.to === 'awaiting-editor', '★ 前置：round 2 的第一次 advance 到 awaiting-editor', advObj && advObj.to)
    const problemsA = contradictionsOf(advA.parsed)
    eq(problemsA.length, 0, '★★ 正(TB-2774)：round 变了但指纹没变 ⇒ readReview/coverage/stale 四栏不得给出「text replaced」或相反结论', problemsA)
    ok(advObj && Array.isArray(advObj.reviewsRead) && advObj.reviewsRead.length === 2 && advObj.reviewsRead.every((r) => r.deliverable === true && r.stalePart !== true),
      '★★ 正：两条 round-1 票都按指纹判为仍有効（deliverable:true，无 stalePart）', advObj && advObj.reviewsRead)
    ok(advObj && advObj.perRoundReviewCoverage && Array.isArray(advObj.perRoundReviewCoverage.covered) && advObj.perRoundReviewCoverage.covered.length === 2 &&
      Array.isArray(advObj.reviewsRead) && advObj.perRoundReviewCoverage.covered.length === advObj.reviewsRead.length,
      '★★ 正：coverage.covered == reviewsRead 计入数（2/2，一个谓词）', advObj && advObj.perRoundReviewCoverage)
    ok(advObj && Array.isArray(advObj.stale) && advObj.stale.length === 0 &&
      Array.isArray(advObj.perRoundReviewCoverage.staleReviews) && advObj.perRoundReviewCoverage.staleReviews.length === 0,
      '★★ 正：stale / staleReviews 都为空（没有任何一行被判「text replaced」）')

    // ★ LAMP 1: revert the freshness predicate to the OLD round-inclusive rule on a COPY ⇒ the same scenario prints a
    // contradiction (same fingerprint, stale wording) — so the assertion above is red-worthy.
    const lampRoot = await mkdtemp(join(__tmpRoot(), 'tb2774-lamp1-'))
    cpSync(join(REPO, 'vibe-math-vmu'), join(lampRoot, 'vibe-math-vmu'), { recursive: true })
    const kitP = join(lampRoot, 'vibe-math-vmu', 'kit', 'paper.js')
    const kitS = await readFile(kitP, 'utf8')
    const oldFresh = "const fresh = bound ? !partChanged : !roundChanged"
    ok(kitS.includes(oldFresh), 'lamp1-setup：单谓词行可定位')
    await writeFile(kitP, kitS.split(oldFresh).join('const fresh = !partChanged && !roundChanged'), 'utf8')
    const L1b = await bootOf(pathToFileURL(join(lampRoot, 'vibe-math-vmu', 'vibe-math-vmu.js')).href, { root: join(lampRoot, 'v5r'), packs: ['v5r'], 'vmu.paper.officeConsult': 'off' })
    const lk = L1b.handle.kernel
    for (const [id, slot] of [[ACAD, 'chair'], [R1, 'member'], [OFFICE, 'member']]) await lk.members.hire({ id, slot })
    await twoPartsAndReviews(L1b, 'p2774al', 'c2774al')
    const lAdv = await receipt(L1b, 'vibe_v5_paper', { action: 'advance', target: 'p2774al' })
    const lProblems = contradictionsOf(lAdv.parsed)
    ok(lProblems.length > 0, '★★★ LAMP1(RED-worthy)：退回旧（round 参与 fresh）谓词后，同一场景出现「指纹相同却判 stale/replaced」的自相矛盾', lProblems)
    await rm(lampRoot, { recursive: true, force: true }).catch(() => {})
  }

  // ★ LAMP 2: the OLD round-only coverage predicate on the SAME durable rows would count 0 of 2 (the rows were
  // written in round 1 and the paper is in round 2) while reviewsRead counts 2 — i.e. reverting coverage to the round
  // rule would flip the consistency assertion above. The numbers are read from the scenario-A receipt, not invented.
  {
    const A3 = await tb2774Boot()
    await twoPartsAndReviews(A3, 'p2774d', 'c2774d')
    await receipt(A3, 'vibe_v5_paper', { action: 'advance', target: 'p2774d' })
    const advD = await receipt(A3, 'vibe_v5_paper', { action: 'advance', target: 'p2774d' })
    const dAdv = advD.parsed && advD.parsed.advance
    const dRead = Array.isArray(dAdv && dAdv.reviewsRead) ? dAdv.reviewsRead : []
    const dCounted = dRead.filter((r) => r && r.deliverable === true)
    const roundOnlyWouldCount = dCounted.filter((r) => Number(r.boundRound) === Number(dAdv && dAdv.round)).length
    const fingerprintCounts = dCounted.length
    ok(fingerprintCounts === 2 && roundOnlyWouldCount === 0,
      '★★★ LAMP2(RED-worthy)：同一批 durable 行，指纹谓词计 2/2，round-only 谓词只计 0/2 —— 退回旧 coverage 谓词会让 covered 与 reviewsRead 相反（上行断言因此有牙）',
      { countedByFingerprint: fingerprintCounts, countedByRoundOnly: roundOnlyWouldCount, round: dAdv && dAdv.round })
  }

  // ── B. text REPLACED ⇒ only the row whose FINGERPRINT differs is stale; the other still counts; columns agree ──
  {
    const B2 = await tb2774Boot()
    const TB2 = 'p2774b'
    await twoPartsAndReviews(B2, TB2, 'c2774b')
    // round 2, writing: replace ACAD's part text (its judged fingerprint WILL change)
    const rew = await receipt(B2, 'vibe_v5_paper', { action: 'part', target: TB2, member: ACAD, part: 'A 节', solution: 'A 的新正文（已替换）', evidence: ['Members/' + ACAD + '/Propos/c2774b.md'] })
    ok(rew.parsed && rew.parsed.ok === true, '前置：round 2 里替换 A 的正文', rew.parsed && (rew.parsed.code || rew.parsed.message))
    await receipt(B2, 'vibe_v5_paper', { action: 'advance', target: TB2 }) // writing → reviewing
    const advB = await receipt(B2, 'vibe_v5_paper', { action: 'advance', target: TB2 }) // reviewing → awaiting-editor? (r-1 must re-review)
    const bProblems = contradictionsOf(advB.parsed)
    eq(bProblems.length, 0, '★★ 正(TB-2774)：真替换的场合同样不得自相矛盾', bProblems)
    eq(advB.parsed && advB.parsed.code, 'VMU_REVIEW_STALE', '★★ 正：覆盖失败时 advance 按名字拒 VMU_REVIEW_STALE（不是静默放过旧票）')
    const bStale = (advB.parsed && Array.isArray(advB.parsed.staleReviews)) ? advB.parsed.staleReviews : []
    ok(bStale.length >= 1 && bStale.every((s) => s && String(s.judgedPartFingerprint) !== String(s.currentFingerprint)),
      '★★ 正：被判 stale 的行必须是【指纹真的不等】的那些（r-1 审的 A 旧文）', bStale)
    ok(bStale.every((s) => s && s.why === 'part-text-changed'), '★★ 正：why 只有 part-text-changed —— round 变了不再冒充「正文被换」', bStale.map((s) => s.why))
    ok(bStale.some((s) => s && s.by === R1) && !bStale.some((s) => s && s.by === ACAD),
      '★★ 正：只有审了被替换正文的那一行（r-1）被判 stale；ACAD 审的未变正文不被牵连（round 从 1 到 2 不使它失效）',
      bStale.map((s) => s && s.by))
  }
}

// ── §8. TB-2777: "asked but nothing measured" is NOT "absent" — the toolchain probe is three-valued, honestly ─────
console.log('=== 8. TB-2777 D-7：编译跑了但文档失败 ≠ 引擎缺席（ran-absent 必须带缺席名字）===')
{
  // direct predicate: no absence verdict can no longer be manufactured by `asked`
  const probeOf = (await import(pathToFileURL(TOOLS).href)).toolchainProbeOf
  eq(probeOf({ latexAvailable: null, asked: true }), 'not-run',
    '★★ 正(TB-2777)：latexAvailable:null + asked:true ⇒ not-run（不再伪造成 ran-absent）')
  eq(probeOf({ latexAvailable: false, asked: true }), 'ran-absent', '★ 正：缺失裁决（false）才是 ran-absent')
  eq(probeOf({ latexAvailable: true, asked: true }), 'ran-present', '★ 正：在场裁决（true）是 ran-present')
  // ★ LAMP(RED-worthy): the OLD mapping (`asked ? ran-absent : not-run`) would answer ran-absent here; that shape is what a
  // reader saw beside toolchainAbsent:[] and latexAvailable:null. The assertion above is load-bearing.
  const oldMapping = ({ latexAvailable = null, asked = false } = {}) => (latexAvailable === true ? 'ran-present' : (asked === true ? 'ran-absent' : 'not-run'))
  eq(oldMapping({ latexAvailable: null, asked: true }), 'ran-absent',
    '★★★ LAMP(RED-worthy)：旧映射对同一输入给 ran-absent —— 上面的 not-run 断言因此有牙')

  // behavioural: a compile that RAN and failed on the DOCUMENT still proves the engine is installed
  const TD = 'p-d7-docfail'
  const cardD = await receipt(v5r, 'vibe_v5_record_proposition', { id: 'tb2777-d7', statement: 'TB-2777 D-7 证据（独立正文）', value: 0.5, motive: 'D-7', p: 0.5 })
  ok(cardD.parsed && cardD.parsed.ok === true, '前置(D-7)：证据卡落库', cardD.parsed && cardD.parsed.code)
  await new Promise((resolve) => setTimeout(resolve, 200))
  await receipt(v5r, 'vibe_v5_paper', { action: 'start', target: TD, participants: [ACAD, R1], format: 'both' })
  await receipt(v5r, 'vibe_v5_paper', { action: 'part', target: TD, member: ACAD, part: 'A 节', solution: 'D-7 的正文', evidence: ['Members/' + ACAD + '/Propos/tb2777-d7.md'] })
  await receipt(v5r, 'vibe_v5_paper', { action: 'part', target: TD, member: R1, part: 'B 节', solution: 'D-7 的另一段', evidence: ['Members/' + ACAD + '/Propos/tb2777-d7.md'] })
  await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: TD })
  await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: TD, member: ACAD, of: R1, deliverable: true, notes: 'ok' })
  await receipt(v5r, 'vibe_v5_paper', { action: 'review', target: TD, member: R1, of: ACAD, deliverable: true, notes: 'ok' })
  const advD = await receipt(v5r, 'vibe_v5_paper', { action: 'advance', target: TD })
  ok(advD.parsed && advD.parsed.advance && advD.parsed.advance.to === 'awaiting-editor', '前置(D-7)：论文到 awaiting-editor', advD.parsed && advD.parsed.advance && advD.parsed.advance.to)
  // a compile that REACHED the engine (argv + triedEngines) and failed on the document
  const argvD = ['xelatex', '-interaction=nonstopmode', '-halt-on-error', '-output-directory=D:/ws/Paper/paper-p-d7-docfail', 'D:/ws/Paper/paper-p-d7-docfail/paper-p-d7-docfail.tex']
  stubLatex(kernel, { check: async (request) => ({
    ok: false, produced: false, code: 'VMU_PAPER_LATEX_FAILED', faceCode: null,
    engine: 'xelatex', engineSource: 'variant', argv: argvD,
    triedEngines: [{ engine: 'xelatex', phase: 'compile', code: 'VMU_PAPER_LATEX_FAILED' }],
    triedEnginesTotal: 1, triedEnginesTruncated: false,
    outDir: request.outDir, sourceName: 'paper-p-d7-docfail.tex',
    stdout: '! Undefined control sequence.', stderr: '', stderrTail: '! Undefined control sequence.', stdoutTail: '! Undefined control sequence.', tailSource: 'stdout',
  }) })
  const compD = (await receipt(v5r, 'vibe_v5_paper', { action: 'compile', target: TD })).parsed
  ok(compD && compD.compiled && compD.compiled.produced === false, '★ 正：这次 compile 是文档失败（produced:false）', compD && compD.compiled && compD.compiled.produced)
  console.log('DBG-D7', JSON.stringify({ keys: compD && Object.keys(compD), compiledKeys: compD && compD.compiled && Object.keys(compD.compiled), argv: compD && compD.compiled && compD.compiled.argv, tried: compD && compD.compiled && compD.compiled.triedEngines, probe: compD && compD.toolchainProbe, latex: compD && compD.latexAvailable }))
eq(compD && compD.toolchainProbe, 'ran-present', '★★ 正(TB-2777)：引擎真的跑了（argv/triedEngines 在场）⇒ ran-present，不是 ran-absent')
  eq(compD && compD.latexAvailable, true, '★★ 正：latexAvailable:true（引擎在场是观察，不是文档正确性的结论）')
  eq(JSON.stringify(compD && compD.toolchainAbsent), '[]', '★★ 正：toolchainAbsent:[] 与 ran-present 自洽（不再与 ran-absent 同屏）')
  ok(compD && typeof compD.toolchainProbeMeans === 'string' && /OBSERVATION|available/i.test(compD.toolchainProbeMeans),
    '★ 正：toolchainProbeMeans 说明这是观察读数', compD && compD.toolchainProbeMeans)
  const stD = (await receipt(v5r, 'vibe_v5_paper', { action: 'status', target: TD })).parsed
  eq(stD && stD.toolchainProbe, 'ran-present', '★★ 正：随后的 status 读面同一读数（同一生产者）')
  eq(stD && stD.latexAvailable, true, '★ 正：status 的 latexAvailable 也是 true')
}

// ── §9. TB-2777 D-3: the temp seat's prompt is RETAINED (resumed delivery must not vanish from the archive) ─────────
console.log('=== 9. TB-2777 D-3：resume 路径的 prompt 也进 kernel 存档（temp 席可读）===')
{
  const KIT_TURN_SRC = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  ok(/if \(resumeSource && !promptArchive\.has\(String\(turn && turn\.id\)\)\) \{/.test(KIT_TURN_SRC) &&
    /archivePrompt\(turn && turn\.id, turn && turn\.member, resumeSource\.text, null\)/.test(KIT_TURN_SRC),
    '★★ 正(TB-2777 D-3)：resume 路径把调用方手里已有的 prompt 文本写进同一个 kernel 存档（不重新组装、不碰 notices/assembled 计数）')
  ok(KIT_TURN_SRC.includes('TB-2777 D-3'), '★ 正：该分支带 TB-2777 D-3 注记（读者能顺着号找到缺陷）')
  // behavioural, on the reachable path: a turn opened for the temp seat is archived under its own member
  const A9 = await bootOf(pathToFileURL(ENTRY).href, { root: await mkdtemp(join(__tmpRoot(), 'tb2777-d3-')), packs: ['v5r'] })
  ok(A9 && A9.handle && A9.handle.kernel, '前置(D-3)：kernel 启动', !!A9)
  const k9 = A9.handle.kernel
  for (const [id, slot] of [[ACAD, 'chair'], [R1, 'member'], ['r-temp', 'temp']]) await k9.members.hire({ id, slot })
  const step9 = await receipt(A9, 'vibe_vmu_turn', { op: 'step', member: 'r-temp', phase: 'normal' })
  const archived = typeof k9.turn.promptTurns === 'function' ? k9.turn.promptTurns() : []
  const hits = archived.map((tid) => k9.turn.promptOf(tid)).filter((x) => x && x.member === 'r-temp')
  ok(archived.length > 0 && hits.length > 0,
    '★★ 正(TB-2777 D-3)：temp 席的 turn 真的在 kernel 存档里（member 是 r-temp），op:"prompt" 不再只能答 OBJECT-MISSING',
    { ok: step9.parsed && step9.parsed.ok, turns: archived, hits: hits.map((h) => ({ id: h.turnId, member: h.member, chars: h.chars })) })
  ok(hits.length === 0 || (typeof hits[0].text === 'string' && hits[0].text.length > 0),
    '★ 正：存档里带的是可读的 prompt 正文（不是只有一个空 id）', hits[0] && { chars: hits[0].chars })
}

// A Windows kernel keeps a handle on the member tree for a moment after a claim, so cleanup is
// best-effort: the temp root is under D:/_tmp and the assertions above already read every byte they need.
try { process.chdir(prevCwd) } catch { /* the temp tree is what matters */ }
await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {})
console.log('\n=== RUN-252 PAPER ARTIFACT TRUTH: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error(' - ' + f); process.exit(1) }
