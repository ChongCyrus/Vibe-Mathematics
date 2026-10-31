/**
 * RUN 155 — the read-only audit of c5d356b9 found five problems. Every one is a place where a receipt or a document
 * told the reader something the mechanism did not do; each is fixed where it lives, and each fix is pinned here.
 *
 *   problem 1  `final`'s pdf failure block always said `argv: []` — the kit's failure object never copied the argv the
 *              LaTeX face really spawned, while BOTH projections downstream read `e.argv` and defaulted to []. The very
 *              moment a compiler ran (5 argv elements) the receipt offered no evidence of the path it was given.
 *   problem 2  the `compile` door and `final`'s pdf block described one compile in TWO shapes: `compile` threw on
 *              failure (no receipt at all), `final` returned a body, and the keys differed. The doc claimed they "share
 *              one structure". Both halves of that sentence were false; both doors now project the same shape.
 *   problem 3  `settlement.preserved` said every other card field "was left exactly as it was" while the code called
 *              `records.put`, which REBUILDS the row (rev→1, fresh createdAt, re-minted slug) — and `settlement.rev`
 *              was always undefined. The settlement now goes through `records.supersede` (a new revision) and the
 *              receipt reports the mode it actually used.
 *   problem 4  the RUN 153 suite pinned 16 facts about SOURCE TEXT (`ok(/…/.test(src))`), one of which (`§0k` argv pin)
 *              papered over problem 1: a source-level pin cannot see a receipt's value. The behaviour is covered here.
 *   problem 5  `tally-…` looked like a record id but nothing was written under it (`vibe_v5_read_library {id}` answered
 *              NO_SUCH_OBJECT). The receipt now says the id is the aggregate's NAME, names the durable evidence, and says
 *              how to reproduce it.
 *
 * Run: node tests/vmu-run155-audit-fixes.test.mjs
 * Last line: === RUN 155 AUDIT FIXES: N passed, M failed ===
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const QUALITY = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}

const entry = await import(ENTRY)
const pack = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')).href)
const quality = await import(pathToFileURL(QUALITY).href)
const KIT_SRC = readFileSync(KIT, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')
const QUALITY_SRC = readFileSync(QUALITY, 'utf8')

const FAKE_ARGV = ['xelatex', '-interaction=nonstopmode', '-halt-on-error',
  '-output-directory=D:/ws/Paper/paper-p5', 'D:/ws/Paper/paper-p5/paper-p5.tex']

/** A LaTeX face that refuses exactly like the real one on run 4: the argv travelled, the words went to stdout. */
const failingFace = () => ({
  check: async () => ({
    ok: false, code: 'VMU_PAPER_LATEX_FAILED', engine: 'xelatex',
    argv: FAKE_ARGV.slice(),
    stderr: '', stdout: '! Undefined control sequence.\n<*> D:/ws/Paper/paper-p5/paper-p5.tex\nNo pages of output.',
    tried: [{ engine: 'xelatex', phase: 'compile' }], elapsedMs: 3,
  }),
})

// ── the paper subsystem on a fake kernel (kit-level facts) ────────────────────────────────────────────────────────────
const ROSTER = [
  { id: 'acad', slot: 'chair' },
  { id: 'r-1', slot: 'member' },
  { id: 'r-2', slot: 'member' },
  { id: 'office', slot: 'office' },
]
function makeKernel(settings) {
  const rows = new Map()
  const versions = new Map()
  let seq = 0
  const kernel = {
    settingsSnapshot: () => ({ ...settings }),
    members: { roster: () => ROSTER.slice() },
    records: {
      put(r) {
        const id = r.id || ('row-' + (++seq))
        const prev = rows.get(id) || null
        const row = { ...(prev || {}), ...r, id, rev: prev ? (prev.rev || 1) : 1, updatedAt: ++seq, fingerprint: 'fp-' + id + '-' + seq,
          createdAt: prev && prev.createdAt !== undefined ? prev.createdAt : 1000, slug: (prev && prev.slug) || id }
        rows.set(id, row)
        return { ok: true, id, rev: row.rev, fingerprint: row.fingerprint }
      },
      get({ id }) {
        const row = rows.get(id)
        if (!row) throw Object.assign(new Error('unknown record: ' + id), { code: 'VMU_NO_SUCH_OBJECT' })
        return { ...row }
      },
      history({ id } = {}) {
        const all = id === undefined ? [...versions.entries()].flatMap(([k, v]) => v.map((x) => ({ id: k, ...x }))) : (versions.get(id) || []).slice()
        return { ok: true, versions: all, count: all.length, available: 0, dropped: 0, truncated: false, storeMode: 'full' }
      },
      list({ track, limit } = {}) {
        const items = [...rows.values()].filter((r) => !track || r.track === track)
        return { items: typeof limit === 'number' ? items.slice(0, limit) : items }
      },
      supersede({ id, reason, by, body }) {
        const prev = rows.get(id)
        if (!prev) throw Object.assign(new Error('unknown record: ' + id), { code: 'VMU_NO_SUCH_OBJECT' })
        versions.set(id, (versions.get(id) || []).concat([{ rev: prev.rev, body: prev.body, reason }]))
        const row = { ...prev, body: body === undefined ? prev.body : body, rev: (prev.rev || 1) + 1, updatedAt: ++seq }
        rows.set(id, row)
        return { ok: true, id, rev: row.rev, mode: 'supersede', fingerprint: row.fingerprint }
      },
      versionsOf(id) { return (versions.get(id) || []).slice() },
    },
  }
  return { kernel, rows, versions }
}
const BASE = { 'vmu.records.tracks': ['paper'], 'vmu.paper.officeConsult': 'off' }
const bootKit = (extra = {}, latex = null) => {
  const settings = { ...BASE, ...extra }
  const { kernel, rows, versions } = makeKernel(settings)
  if (latex) kernel.latex = latex
  const flow = pack.createPaperSubsystem({ kernel, clock: () => 1 })
  return { flow, kernel, rows, versions, settings }
}

// ── the whole assembly on a real temp root (tool-level facts) ─────────────────────────────────────────────────────────
const roots = []
/** The paper flow's default outDir is RELATIVE (`Paper/<id>`), and the kernel resolves it against the PROCESS cwd, so
 *  every tool-level boot chdirs into its own temp root: a test must never write `Paper/` into the checkout. */
const ORIG_CWD = process.cwd()
/**
 * The REAL kernel LaTeX face is built from the host's `subprocess` service (`vibe-math-vmu/host-spawn.js`), so the seam
 * that decides what xelatex "answered" is a fake service here: probe succeeds, compile behaves as told.
 */
const makeSubprocess = (behave) => {
  const calls = []
  const service = {
    spawn(spec = {}) {
      calls.push(spec)
      const argv = Array.isArray(spec.argv) ? spec.argv.map(String) : []
      const res = { exitCode: 0, stdout: '', stderr: '' }
      if (argv.includes('--version')) res.stdout = 'xelatex 1.0'
      else if (typeof behave === 'function') Object.assign(res, behave(argv) || {})
      return {
        done: Promise.resolve({ exitCode: res.exitCode, signal: null }),
        collected: {
          stdout: { readFrom: () => ({ text: res.stdout }) },
          stderr: { readFrom: () => ({ text: res.stderr }) },
        },
      }
    },
  }
  return { service, calls, ctx: { get: (name) => (name === 'subprocess' ? service : undefined) } }
}
/** Compile exits 1 with the words run 4 really saw on stdout. */
const FAILING_COMPILE = (argv) => {
  const tex = String(argv.filter((a) => a.endsWith('.tex'))[0] || '')
  return { exitCode: 1, stdout: '! Undefined control sequence.' + String.fromCharCode(10) + '<*> ' + tex + String.fromCharCode(10) + 'No pages of output.' }
}
/** Compile "succeeds": the PDF the face looks for is written before the process exits 0. */
const COMPILING = (argv) => {
  const tex = String(argv.filter((a) => a.endsWith('.tex'))[0] || '')
  if (tex) { try { writeFileSync(tex.slice(0, -4) + '.pdf', 'PDF-FAKE-155') } catch { /* the face reports it */ } }
  return { exitCode: 0 }
}
const bootTools = async (settings = {}, subprocess = null) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run155-'))
  roots.push(root)
  process.chdir(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    get(name) { return subprocess && name === 'subprocess' ? subprocess.service : undefined },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  const kernel = handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  return { root, kernel, specs: state.specs }
}
const TOOL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const call = async (specs, name, args) => {
  const spec = TOOL(specs, name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try { return parse(await spec.execute(args, {})) } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: (e && e.message) || String(e), hint: (e && e.hint) || null,
      argv: (e && e.argv) || undefined, target: (e && e.target) || undefined }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§0 源码口径：五处修法都在所有者上（行为由 §1–§5 覆盖）')
{
  ok(KIT_SRC.includes('failure.argv = Array.isArray(r.argv) ? r.argv.slice(0, 16) : []'),
    '问题 1：kit 的 PDF 失败对象把面真正 spawn 的 argv 复制出来')
  ok(KIT_SRC.includes('RUN 155'), '问题 1：kit 的改动带 RUN 155 注记')
  ok(TOOLS_SRC.includes('function projectPdfBlock(pdf, target)') &&
    (TOOLS_SRC.match(/projectPdfBlock\(/g) || []).length >= 3,
    '问题 2：一份投影 projectPdfBlock 被 final 与 compile 两个门共用')
  ok(!/pdf: finalized\.pdf \? \{ ok: finalized\.pdf\.ok === true/.test(TOOLS_SRC),
    '问题 2：final 不再手写第二份 pdf 投影')
  ok(TOOLS_SRC.includes("case 'compile': {") && !/const compiled = await paper\.compilePdf\(\{ target \}\)\n      return \{ ok: true, tool, action, compiled: \{/.test(TOOLS_SRC),
    '问题 2：compile 门不再直接抛/手写形状')
  ok(TOOLS_SRC.includes('typeof records.supersede === \'function\'') && TOOLS_SRC.includes("mode = 'put-fallback'"),
    '问题 3：结算优先走 records.supersede，无该能力时明说 put-fallback')
  ok(!/preserved: 'every other card field \(title, proofRef, proofState, leanJob, leanConformance\) was left exactly as it was/.test(TOOLS_SRC),
    '问题 3：「其余字段原样」这句 put 口径的旧话已删')
  ok(TOOLS_SRC.includes('isRecordId: false') && TOOLS_SRC.includes('durableUnder:') && TOOLS_SRC.includes('durable: \'this id is a NAME for the aggregate'),
    '问题 5：tally 回执说明 id 是名字、durable 证据在哪里')
  ok(QUALITY_SRC.includes('const barePointer = anchorAt < 0 ? pointer : pointer.slice(0, anchorAt)'),
    '小账：证据指针先剥掉 `#锚点` 再解析')
  ok(QUALITY_SRC.includes("/^[A-Za-z][A-Za-z0-9_-]*$/.test(barePointer)"),
    '小账：字母结尾的裸记录 id 也去解析（查不到报 no-such-record）')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 问题 1：编译失败时，`final` 的 pdf 块带着真实的 argv 与编译器原话')
{
  const { flow } = bootKit({}, failingFace())
  const T = 'p5'
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  const e = await (async () => { try { await flow.compilePdf({ target: T }); return null } catch (err) { return err } })()
  ok(!!e, '前提：compilePdf 在编译失败时拒绝', e && e.code)
  ok(!!e && Array.isArray(e.argv) && e.argv.length > 0 && e.argv.length === FAKE_ARGV.length, '问题 1：拒绝对象带面真正 spawn 的 argv（5 个元素）', e && e.argv)
  ok(!!e && Array.isArray(e.argv) && e.argv.length > 0 && JSON.stringify(e.argv) === JSON.stringify(FAKE_ARGV), '问题 1：argv 逐字等于面收到的 argv（不是 []、不是另编的）', e && e.argv)
  ok(!!e && String(e.argv.filter((a) => String(a).includes('.tex'))[0] || '').startsWith('D:/'), '问题 1：argv 里的源文件是绝对 + 正斜杠路径',
    e && (e.argv || []).filter((a) => String(a).includes('.tex')))
  ok(!!e && String(e.stderrTail || '').length > 0 && e.tailSource === 'stdout',
    '问题 1：引擎把话写在 stdout 时 stderrTail 放 stdout 尾部，tailSource 说明来源', e && { tailSource: e.tailSource })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 问题 2：`compile` 门与 `final` 的 pdf 块是同一个形状（成功与失败都是回执）')
{
  // ── the failing door: the REAL kernel LaTeX face, driven through a spawn seam that exits 1 with the run-4 words ──
  const fail = makeSubprocess(FAILING_COMPILE)
  const { specs } = await bootTools({ 'vmu.paper.officeConsult': 'off' }, fail)
  const started = await call(specs, 'vibe_v5_paper', { action: 'start', target: 'p5', participants: ['r-1', 'r-2'] })
  ok(started && started.ok === true, '前提：论文 p5 建好', started && (started.code || started.ok))
  const compiled = await call(specs, 'vibe_v5_paper', { action: 'compile', target: 'p5' })
  ok(compiled && compiled.ok === true, '问题 2：编译失败也返回回执（不再只抛异常）', compiled && (compiled.code || compiled.ok))
  const block = compiled && compiled.compiled
  ok(!!block && block.ok === false && block.kind === 'refused' && block.produced === false,
    '问题 2：回执的 compiled 块说清楚 refused / produced:false', block && { ok: block.ok, kind: block.kind, produced: block.produced })
  ok(!!block && Array.isArray(block.argv) && block.argv.length >= 4, '问题 2：compiled 块带面真正 spawn 的 argv', block && block.argv)
  ok(!!block && ((block.argv || []).some((a) => String(a).startsWith('-output-directory='))), '问题 2：argv 带着它真正用的输出目录', block && block.argv)
  const texArg = String(((block || {}).argv || []).filter((a) => String(a).endsWith('.tex'))[0] || '')
  ok(texArg.length > 0 && /^[A-Za-z]:\//.test(texArg), '问题 2：argv 里的源文件是绝对 + 正斜杠路径（G2 的路径证据）', texArg)
  ok(!!block && /^VMU_/.test(String(block.code || '')) && (String(block.message || '').includes('编译器说') || String(block.message || '').includes('Undefined control sequence')),
    '问题 2：compiled 块带具名 code 与编译器原话', block && { code: block.code, message: String(block.message || '').slice(0, 120) })
  ok(!!block && String(block.stderrTail || '').includes('Undefined control sequence') && block.tailSource === 'stdout',
    '问题 2：失败尾部来自引擎写字的那个流（tailSource 说明）', block && { tailSource: block.tailSource })
  ok(!!block && Array.isArray(block.triedEngines) && block.triedEnginesTotal === block.triedEngines.length && block.triedEnginesTruncated === false,
    '问题 2：triedEngines 与 total/truncated 自洽', block && { n: (block.triedEngines || []).length, total: block.triedEnginesTotal })
  ok(!!block && Array.isArray(block.missing) && block.missing.includes('pdf'), '问题 2：失败时说 pdf 缺', block && block.missing)

  const keys = Object.keys(block || {}).sort()
  // ★ RUN 157 加 `engineSource`（第 23 键）；★ RUN 158 加 `tailsIdentical`（第 24 键：两尾部逐字相同时如实标记）；
  // ★ RUN 159 加 `tailsIdenticalMeans`（第 25 键：布尔之外还要说清哪一支为真）。
  // 这个 pin 守的是「一个投影、两个门」，共享投影改了字段集它就必须跟着改——否则它守的是一个不再存在的形状。
  const expected = ['argv', 'code', 'engine', 'engineSource', 'faceCode', 'hint', 'kind', 'message', 'missing', 'ok', 'outDir', 'pdfBytes', 'pdfPath',
    'produced', 'signal', 'sourceName', 'stderrTail', 'stdoutTail', 'tailSource', 'tailsIdentical', 'tailsIdenticalMeans', 'target', 'triedEngines', 'triedEnginesTotal',
    'triedEnginesTruncated'].sort()
  ok(keys.length > 0 && keys.length === expected.length && JSON.stringify(keys) === JSON.stringify(expected), '问题 2：compiled 块就是共享投影的字段集（25 键）', keys)

  // ── the SAME fields must come out of `final`: drive a paper to awaiting-editor, then final it with a failing compile ──
  const fail2 = makeSubprocess(FAILING_COMPILE)
  const s2 = await bootTools({ 'vmu.paper.officeConsult': 'off' }, fail2)
  const mk = await call(s2.specs, 'vibe_v5_record_proposition', { id: 'rec-s155', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-chair' })
  ok(mk && mk.ok === true, '前提：证据卡 rec-s155 写好', mk && (mk.code || mk.ok))
  await call(s2.specs, 'vibe_v5_paper', { action: 'start', target: 'p6', participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) {
    const p = await call(s2.specs, 'vibe_v5_paper', { action: 'part', target: 'p6', member: m, part: m + ' 的标题', body: String(m) + ' 的解法', evidence: ['rec-s155'] })
    ok(p && p.ok === true, '前提：' + m + ' 的 part 写好（裸记录 id 作证据）', p && (p.code || p.ok))
  }
  await call(s2.specs, 'vibe_v5_paper', { action: 'advance', target: 'p6' })
  for (const m of ['r-1', 'r-2']) await call(s2.specs, 'vibe_v5_paper', { action: 'review', target: 'p6', member: m, deliverable: true, comments: '可交付' })
  await call(s2.specs, 'vibe_v5_paper', { action: 'advance', target: 'p6' })
  const final = await call(s2.specs, 'vibe_v5_paper', { action: 'final', target: 'p6', member: 'r-chair', decision: 'deliverable' })
  ok(final && final.ok === true && final.final && final.final.finalized === true, '前提：定稿发生（编译失败不阻止定稿）', final && (final.code || (final.final && final.final.finalized)))
  const finPdf = final && final.final && final.final.pdf
  ok(!!finPdf && finPdf.ok === false && finPdf.kind === 'refused', '问题 2：final 的 pdf 块同样是 refused 形状', finPdf && { ok: finPdf.ok, kind: finPdf.kind })
  ok(!!finPdf && JSON.stringify(Object.keys(finPdf).sort()) === JSON.stringify(expected),
    '问题 2：final 的 pdf 块与 compile 的键集逐字相同（一个投影）', finPdf && Object.keys(finPdf))
  ok(!!finPdf && Array.isArray(finPdf.argv) && finPdf.argv.length >= 4,
    '问题 1+2：final 的 pdf 失败块现在带真实 argv（此前恒 []）', finPdf && finPdf.argv)

  // ── the successful door: the same shape, produced:true, and final no longer says pdf is missing ──
  const okc = makeSubprocess(COMPILING)
  const s3 = await bootTools({ 'vmu.paper.officeConsult': 'off' }, okc)
  const mk3 = await call(s3.specs, 'vibe_v5_record_proposition', { id: 'rec-s156', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-chair' })
  ok(mk3 && mk3.ok === true, '前提：证据卡 rec-s156 写好')
  await call(s3.specs, 'vibe_v5_paper', { action: 'start', target: 'p7', participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) await call(s3.specs, 'vibe_v5_paper', { action: 'part', target: 'p7', member: m, part: m + ' 的标题', body: String(m) + ' 的解法', evidence: ['rec-s156'] })
  await call(s3.specs, 'vibe_v5_paper', { action: 'advance', target: 'p7' })
  for (const m of ['r-1', 'r-2']) await call(s3.specs, 'vibe_v5_paper', { action: 'review', target: 'p7', member: m, deliverable: true, comments: '可交付' })
  await call(s3.specs, 'vibe_v5_paper', { action: 'advance', target: 'p7' })
  const okCompile = await call(s3.specs, 'vibe_v5_paper', { action: 'compile', target: 'p7' })
  ok(okCompile && okCompile.compiled && okCompile.compiled.ok === true && okCompile.compiled.kind === 'compiled' && okCompile.compiled.produced === true,
    '问题 2：编译成功时同一个形状说 compiled/produced:true', okCompile && okCompile.compiled && { ok: okCompile.compiled.ok, kind: okCompile.compiled.kind })
  ok(okCompile && JSON.stringify(Object.keys(okCompile.compiled).sort()) === JSON.stringify(expected),
    '问题 2：成功与失败的键集完全相同（调用者不用按分支判字段）', okCompile && Object.keys(okCompile.compiled))
  const finalOk = await call(s3.specs, 'vibe_v5_paper', { action: 'final', target: 'p7', member: 'r-chair', decision: 'deliverable' })
  const okPdf = finalOk && finalOk.final && finalOk.final.pdf
  ok(!!okPdf && okPdf.ok === true && okPdf.produced === true, '问题 2：final 成功编译的 pdf 块也带 produced:true', okPdf && { ok: okPdf.ok, produced: okPdf.produced })
  ok(!!finalOk && Array.isArray(finalOk.final.missing) && !finalOk.final.missing.includes('pdf'),
    'G10 复核：编译成功时 missing 里不再有 pdf（回执不自相矛盾）', finalOk && finalOk.final && finalOk.final.missing)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 问题 3：裁决落值是一次 supersede（新修订），记录本体不再被重建')
{
  const { kernel, specs } = await bootTools()
  const put = kernel.records.put({
    id: 'rec-lock-1', track: 'propositions', kind: 'proposition', title: '要被结算的卡',
    body: '- statement：n + n = 2n\n- value：0.99\n- motive：算术\n- p：0.99\n- proofRef：Members/r-1/Propos/rec-lock-1.md\n- proofState：complete',
  })
  const before = kernel.records.get({ id: 'rec-lock-1' })
  ok(!!before && before.rev === 1 && Number(before.createdAt) > 0, '前提：卡已存在（rev=1、有 createdAt）', before && { rev: before.rev, createdAt: before.createdAt })
  ok(String(before.body || '').includes('proofState：complete'), '前提：这张卡已登记证明完成（L14 锁成立）', before && before.body)
  const settled = await call(specs, 'vibe_v5_record_proposition', {
    id: 'rec-lock-1', statement: 'n + n = 2n', value: '0.99', motive: '算术', p: 1,
    debate_ruling: { subject: 'rec-lock-1', value: 1, mode: 'unanimous', n: 2 },
  })
  ok(settled && settled.ok === true, '问题 3：在锁定卡上结算成功', settled && (settled.code || settled.ok))
  ok(settled && settled.settlement && settled.settlement.mode === 'supersede',
    '问题 3：回执说清结算用的是 supersede（不是 put 重建）', settled && settled.settlement && settled.settlement.mode)
  ok(settled && settled.settlement && settled.settlement.record && settled.settlement.record.rev === 2,
    '问题 3：settlement.record.rev 是真值 2（此前恒 undefined）', settled && settled.settlement && settled.settlement.record)
  const after = kernel.records.get({ id: 'rec-lock-1' })
  ok(!!after && after.createdAt === before.createdAt && after.slug === before.slug,
    '问题 3：id/slug/createdAt 未变（put 会重置它们）', after && { createdAt: after.createdAt, slug: after.slug })
  ok(!!after && String(after.body).includes('- p：1') && String(after.body).includes('- debateRuling：'),
    '问题 3：卡体只改了 p 行并追加一行 debateRuling', after && String(after.body).slice(0, 120))
  ok(!!after && String(after.body).includes('- value：0.99') && String(after.body).includes('- motive：算术'),
    '问题 3：其余行逐字保留（value/motive 仍在）', after && after.body)
  const trail = kernel.records.history({ id: 'rec-lock-1' })
  const trailItems = (trail && (trail.versions || trail.items || trail.rows)) || []
  ok(trailItems.length >= 1, '问题 3：records 面留下了版本条目（不是静默覆盖）', { n: trailItems.length, keys: Object.keys(trail || {}) })
  ok(settled && settled.settlement && !/every other card field \(title, proofRef, proofState, leanJob, leanConformance\) was left exactly as it was/.test(String(settled.settlement.preserved || '')),
    '问题 3：preserved 不再用「其余字段原样」这句 put 口径的谎话', settled && settled.settlement && settled.settlement.preserved)
  // the L14 lock must still bite: the settlement is the ONE admitted edit
  const again = await call(specs, 'vibe_v5_record_proposition', {
    id: 'rec-lock-1', statement: 'n + n = 2n', value: '0.99', motive: '算术', p: 0.5,
  })
  ok(again && again.ok === false, '问题 3：结算之后卡的普通写入仍被拒（锁还在）', again && { code: again.code })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 问题 5：`tally-…` 是聚合的名字，不是记录行——回执这样说了，读它也确实读不到')
{
  const { kernel, specs } = await bootTools()
  const readTally = await call(specs, 'vibe_v5_read_library', { id: 'tally-m-deb-1-rec-12' })
  ok(readTally && readTally.ok === false && String(readTally.code || '') === 'VMU_NO_SUCH_OBJECT',
    '问题 5：按 tally id 读记录确实 NO_SUCH_OBJECT（回执不再让读者以为可读）', readTally && readTally.code)
  const put = kernel.records.put({ id: 'rec-12', track: 'propositions', kind: 'proposition', title: '辩题', body: '- statement：x\n- value：0.5\n- motive：y\n- p：0.5' })
  ok(put && put.ok === true, '前提：命题卡 rec-12 存在')
  ok(TOOLS_SRC.includes('isRecordId: false'), '问题 5：tally 回执显式标注 isRecordId:false（读者不会被名字骗去读记录）')
  ok(TOOLS_SRC.includes('vibe_v5_meeting { action: "summary" } lists the motions and votes it was summed from'),
    '问题 5：durable 字段写明怎么复现这个聚合（会议 summary）')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§5 小账：证据指针的两种真实形状（带锚点的路径、非数字结尾的裸 id）解析正确')
{
  const { kernel } = bootKit()
  kernel.records.put({ id: 'x', track: 'propositions', kind: 'proposition', title: '带锚点指向的记录', body: '- statement：x' })
  const view = quality.createRecordsView({ kernel })
  const anchored = quality.checkEvidencePointers({ evidence: ['Members/r-1/Propos/x.md#证明'], records: view.records })
  ok(anchored && anchored.ok === true && anchored.resolved.length === 1, '小账：`Members/r-1/Propos/x.md#证明` 解析成功（锚点不是 id 的一部分）', anchored && anchored.unknown)
  ok(anchored && anchored.resolved[0] && anchored.resolved[0].cardId === 'x', '小账：cardId 是 "x"（不是 "x.md#证明"）', anchored && anchored.resolved[0] && anchored.resolved[0].cardId)
  ok(anchored && anchored.resolved[0] && anchored.resolved[0].anchor === '#证明', '小账：锚点保留在回执里（没被丢掉）', anchored && anchored.resolved[0] && anchored.resolved[0].anchor)
  const missingBare = quality.checkEvidencePointers({ evidence: ['rec-a153-nosuch'], records: view.records })
  ok(missingBare && missingBare.ok === false && missingBare.unknown[0] && missingBare.unknown[0].reason === 'no-such-record',
    '小账：字母结尾的裸 id 查不到时报 no-such-record（不是 not-a-member-file-pointer）', missingBare && missingBare.unknown)
  const prose = quality.checkEvidencePointers({ evidence: ['见附录'], records: view.records })
  ok(prose && prose.ok === false && prose.unknown[0] && prose.unknown[0].reason === 'not-a-member-file-pointer',
    '小账：真不是指针的散文仍报 not-a-member-file-pointer（修复没有放宽到乱匹配）', prose && prose.unknown)
  const realBare = quality.checkEvidencePointers({ evidence: ['rec-12'], records: view.records })
  ok(realBare && realBare.ok === false && realBare.unknown[0] && realBare.unknown[0].reason === 'no-such-record',
    '小账：数字结尾的裸 id（rec-12）在记录不存在时也是 no-such-record', realBare && realBare.unknown)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§6 审计小账：G9 的拒绝在工具回执上就带着 target（不只是 kit 层的 error 对象）')
{
  const { specs } = await bootTools({ 'vmu.paper.officeConsult': 'required' }, makeSubprocess(COMPILING))
  const mk = await call(specs, 'vibe_v5_record_proposition', { id: 'rec-s157', title: '证据卡', statement: 'n + n = 2n', value: 0.9, motive: '算术', p: 0.9, member: 'r-chair' })
  ok(mk && mk.ok === true, '前提：证据卡 rec-s157 写好')
  await call(specs, 'vibe_v5_paper', { action: 'start', target: 'p8', participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) await call(specs, 'vibe_v5_paper', { action: 'part', target: 'p8', member: m, part: m + ' 的标题', body: String(m) + ' 的解法', evidence: ['rec-s157'] })
  await call(specs, 'vibe_v5_paper', { action: 'advance', target: 'p8' })
  for (const m of ['r-1', 'r-2']) await call(specs, 'vibe_v5_paper', { action: 'review', target: 'p8', member: m, deliverable: true, comments: '可交付' })
  await call(specs, 'vibe_v5_paper', { action: 'advance', target: 'p8' })
  const blocked = await call(specs, 'vibe_v5_paper', { action: 'final', target: 'p8', member: 'r-chair', decision: 'deliverable' })
  ok(blocked && blocked.ok === false && blocked.code === 'VMU_OFFICE_CONSULT_REQUIRED',
    'G9 前提：定稿被所办问讯拦住', blocked && blocked.code)
  ok(blocked && blocked.target === 'p8' && blocked.paperId === 'paper-p8',
    'G9：工具回执自带 target（回答要用的形参）与 paperId（记录 id），所办不用先撞一次 no target was given', blocked && { target: blocked.target, paperId: blocked.paperId })
  ok(blocked && typeof blocked.requestId === 'string' && blocked.requestId.length > 0,
    'G9：回执带着要回答的 requestId（可直接照抄回调用）', blocked && blocked.requestId)
}

// ── leave no trace: back to the checkout and drop the temp roots (the paper flow writes Paper/<id> under cwd) ──────
process.chdir(ORIG_CWD)
for (const r of roots) { try { rmSync(r, { recursive: true, force: true }) } catch { /* best effort */ } }

console.log('')
console.log('=== RUN 155 AUDIT FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}
console.log('ALL GREEN')
