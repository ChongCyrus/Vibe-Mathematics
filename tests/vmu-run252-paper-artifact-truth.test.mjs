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
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const PAPER_PACK = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')
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
  return { ok: true, engine: 'xelatex', pdfPath, pdfBytes: byteLen(PDF_TEXT), argv: ['xelatex', '-interaction=nonstopmode', request.sourceName], tried: [{ engine: 'xelatex', phase: 'compile', code: null }], outDir: request.outDir, elapsedMs: 3 }
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
ok(!!c && Object.keys(c).filter((k) => /sha256/i.test(k)).length === 0,
  '★ 正(F72-6)：pdf 块没有任何 sha 字段 —— 不存在"覆盖正文却写成文件"的同类缺陷', c && Object.keys(c).filter((k) => /sha/i.test(k)))

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

// A Windows kernel keeps a handle on the member tree for a moment after a claim, so cleanup is
// best-effort: the temp root is under D:/_tmp and the assertions above already read every byte they need.
try { process.chdir(prevCwd) } catch { /* the temp tree is what matters */ }
await rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {})
console.log('\n=== RUN-252 PAPER ARTIFACT TRUTH: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error(' - ' + f); process.exit(1) }
