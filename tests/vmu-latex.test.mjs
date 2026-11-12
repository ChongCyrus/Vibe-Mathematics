// PHASE 7 — the LaTeX executor face. No real TeX is ever run here: every assertion drives a FAKE spawn, and the
// argv is asserted so a wrong seam shape cannot pass as "compiled".
import { join } from 'node:path'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..')
import { createLatexFace, LATEX_CODES, missingCharactersOf, glyphLossReading } from '../vibe-math-vmu/kernel/latex.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 300))) }
}

const fakeSettings = (vals = {}) => ({ get: (k) => vals[k] })
const fakeFs = ({ exists = true } = {}) => {
  const writes = []
  return { writes, writeText: async (p, t) => { writes.push({ p, t }) }, exists: async () => exists, readBytes: async () => Buffer.from('%PDF-1.4') }
}

console.log('=== 1. a face without a spawn seam refuses by name (never pretends) ===')
{
  const face = createLatexFace({ settings: fakeSettings({}) })
  let err = null
  try { await face.check({ source: 'x', outDir: '/tmp/x' }) } catch (e) { err = e }
  ok(err && err.code === LATEX_CODES.unavailable, '★ 反①：无 spawn 接缝 ⇒ VMU_EXTERNAL_UNAVAILABLE', err && err.code)
  ok(createKernel({ clock: () => 0 }).latex === null, 'and the kernel does not CONSTRUCT the face without a seam', 'latex')
}

console.log('=== 2. engine probing: unavailable engines are tried and NAMED, a usable one compiles ===')
{
  const calls = []
  const fs = fakeFs()
  const face = createLatexFace({
    settings: fakeSettings({ 'vmu.paper.latexEngineOrder': ['pdflatex', 'xelatex'] }),
    fs,
    clock: (() => { let t = 0; return () => (t += 10) })(),
    spawn: async ({ command, args, cwd }) => {
      calls.push({ command, args, cwd })
      if (command === 'pdflatex') return { exitCode: 127, stderr: 'pdflatex: not found' }
      if (args && args[0] === '--version') return { exitCode: 0, stdout: 'XeTeX' }
      return { exitCode: 0, stdout: 'ok' }
    },
  })
  const r = await face.check({ source: '\\documentclass{article}\\begin{document}x\\end{document}', outDir: '/work/paper', timeoutMs: 5000 })
  ok(r.ok === true && r.engine === 'xelatex' && r.pdfPath === join('/work/paper', 'main.pdf') && r.pdfBytes === 8,
    '★ 正：引擎探测后可用引擎编译成功，回执带 engine/pdfPath/pdfBytes', r)
  ok(r.tried.some((t) => t.engine === 'pdflatex' && t.available === false && t.exitCode === 127),
    '★ 反②前置：不可用引擎被列出（phase/exitCode）', r.tried)
  const compile = calls.find((c) => c.args && c.args[0] === '-interaction=nonstopmode')
  // ★★ RUN 153 (G2): the .tex argument is normalized to FORWARD slashes (on Windows `join` produced `\work\paper\main.tex`
  // and TeX read `\paper` as a control sequence — the very failure the real run hit). The path is compared with separators
  // folded, so the assertion pins the CONTRACT (one absolute, forward-slash .tex path) and not the platform's separator.
  const texArg = (compile && compile.args || []).find((a) => typeof a === 'string' && /\bmain\.tex$/.test(a))
  ok(compile && compile.command === 'xelatex' && compile.args.includes('-halt-on-error') &&
    compile.args.includes('-output-directory=/work/paper') && texArg && texArg.replace(/\\/g, '/') === '/work/paper/main.tex' &&
    compile.cwd === '/work/paper',
    '★ 真的传了正确 argv：-interaction=nonstopmode / -halt-on-error / -output-directory=<outDir> / tex 文件 / cwd=outDir（.tex 参数为正斜杠）', compile)
}

console.log('=== 3. all engines unavailable ⇒ NAMED code + tried list ===')
{
  const face = createLatexFace({
    settings: fakeSettings({ 'vmu.paper.latexEngineOrder': ['pdflatex', 'xelatex'] }),
    fs: fakeFs(),
    spawn: async () => ({ exitCode: 1, stderr: 'missing' }),
  })
  const r = await face.check({ source: 'x', outDir: '/w' })
  ok(r.ok === false && r.code === LATEX_CODES.noEngine && r.tried.length === 2 && r.engineOrder.join(',') === 'pdflatex,xelatex',
    '★ 反②：引擎全部不可用 ⇒ 具名 + 列出试过的', r)
}

console.log('=== 4. a compile that exits non-zero ⇒ NAMED code + stderr summary ===')
{
  let phase = 0
  const face = createLatexFace({
    settings: fakeSettings({}),
    fs: fakeFs(),
    spawn: async ({ args }) => {
      if (args && args[0] === '--version') return { exitCode: 0 }
      phase += 1
      return { exitCode: 1, stderr: '! Undefined control sequence.' }
    },
  })
  const r = await face.check({ source: 'bad', outDir: '/w' })
  ok(r.ok === false && r.code === LATEX_CODES.failed && /Undefined control sequence/.test(r.stderr),
    '★ 反③：编译非零退出 ⇒ 具名 + stderr 摘要', r)
}

console.log('=== 5. timeout and interruption are DIFFERENT named results ===')
{
  const mk = (res) => createLatexFace({ settings: fakeSettings({}), fs: fakeFs(), spawn: async ({ args }) => (args && args[0] === '--version' ? { exitCode: 0 } : res) })
  const timeout = await mk({ timedOut: true, stderr: 'took too long' }).check({ source: 'x', outDir: '/w' })
  ok(timeout.ok === false && timeout.code === LATEX_CODES.timeout, 'timeout ⇒ VMU_PAPER_LATEX_TIMEOUT（不是 interrupted）', timeout.code)
  const interrupted = await mk({ interrupted: true, signal: 'SIGTERM', stderr: '' }).check({ source: 'x', outDir: '/w' })
  ok(interrupted.ok === false && interrupted.code === LATEX_CODES.interrupted && interrupted.signal === 'SIGTERM',
    'interrupted ⇒ VMU_PAPER_LATEX_INTERRUPTED + signal', interrupted)
}

console.log('=== 6. output directory is the CALLER\'s; a missing PDF is named, not success ===')
{
  const face = createLatexFace({ settings: fakeSettings({}), fs: fakeFs({ exists: false }), spawn: async ({ args }) => (args && args[0] === '--version' ? { exitCode: 0 } : { exitCode: 0 }) })
  const noOut = await face.check({ source: 'x', outDir: '/w' })
  ok(noOut.ok === false && noOut.code === LATEX_CODES.noOutput, 'exit 0 but no PDF ⇒ VMU_PAPER_LATEX_NO_OUTPUT（不假成功）', noOut.code)
  const bad = await createLatexFace({ settings: fakeSettings({}), spawn: async () => ({ exitCode: 0 }) })
  let e = null
  try { await bad.check({ source: 'x' }) } catch (err) { e = err }
  ok(e && e.code === LATEX_CODES.badRequest, 'no outDir ⇒ VMU_INVALID_ARGUMENT（内核不猜路径）', e && e.code)
}

console.log('=== 7. TB-2768: the engine LOG is read after a SUCCESSFUL compile (a PDF is not "the mathematics printed") ===')
{
  // The REAL 16 lines from RUN 81 attempt-3's paper-p1.log (sanitised: same characters/fonts, no machine paths).
  const REAL_LOG = [
    'Missing character: There is no ∀ (U+2200) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ℤ (U+2124) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∣ (U+2223) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∣ (U+2223) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∣ (U+2223) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ℤ (U+2124) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∀ (U+2200) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ℤ (U+2124) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∣ (U+2223) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∣ (U+2223) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∣ (U+2223) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∩ (U+2229) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∩ (U+2229) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ∪ (U+222A) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ℤ (U+2124) in font [lmroman10-regular]:mapping=t',
    'Missing character: There is no ⋯ (U+22EF) in font [lmroman10-regular]:mapping=t',
  ].join('\n')
  const rows = missingCharactersOf(REAL_LOG)
  ok(rows.length === 6, '★ 正(TB-2768)：the 16 real log lines collapse to 6 DISTINCT glyph rows', rows)
  const byChar = Object.fromEntries(rows.map((r) => [r.char, r]))
  ok(byChar['ℤ'] && byChar['ℤ'].count === 4 && byChar['ℤ'].u === 'U+2124' && byChar['ℤ'].font === 'lmroman10-regular',
    '★★ 正：ℤ appears 4× (U+2124, lmroman10-regular) — the run-81 count', byChar['ℤ'])
  ok(byChar['∣'] && byChar['∣'].count === 6 && byChar['∀'].count === 2 && byChar['∩'].count === 2 && byChar['∪'].count === 1 && byChar['⋯'].count === 1,
    '★★ 正：the other five counts are 6/2/2/1/1 exactly as measured', rows)
  const reading = glyphLossReading({ logText: REAL_LOG, texText: 'line 1 $\\mathbb{Z}$\nline 2 ℤ and ∀' })
  ok(reading.glyphLossDetected === true && reading.missingCharacterCount === 16, '★★ 正：glyphLossDetected:true + 16 occurrences', { d: reading.glyphLossDetected, n: reading.missingCharacterCount })
  ok(reading.glyphLossCode === 'VMU_PAPER_GLYPH_UNCOVERED' && typeof reading.glyphLossHint === 'string' && reading.glyphLossHint.includes('\\mathbb{Z}'),
    '★ 正：the named code + a hint naming the LaTeX spellings', reading.glyphLossCode)
  const zf = reading.glyphsUnrepaired.filter((g) => g.char === 'ℤ')[0]
  ok(zf && zf.where === '2', '★ 正：`where` names the .tex line the dropped glyph is on (ℤ → line 2)', zf)
  // ★ RULE E / TB-2768 audit: `.every()` over an EMPTY list is vacuously true — guard the non-empty set first,
  // then check each row's shape (the vacuous-pass detector reads exactly this pair).
  ok(reading.glyphsUnrepaired.length > 0,
    '★ 前置：glyphsUnrepaired 非空（空集上的 .every() 恒真，先守卫再逐条判形状）', reading.glyphsUnrepaired.length)
  ok(reading.glyphsUnrepaired.every((g) => typeof g.char === 'string' && typeof g.u === 'string' && typeof g.count === 'number' && typeof g.font === 'string'),
    '★ 正：every row carries {char,u,count,font,where} (the shape TB-2768 asks for)', reading.glyphsUnrepaired)
  const clean = glyphLossReading({ logText: 'This is XeTeX, no problems\n', texText: 'x' })
  ok(clean.glyphLossDetected === false && clean.missingCharacterCount === 0 && clean.glyphLossCode === null,
    '★ 反：a log WITHOUT Missing-character is a MEASURED clean reading (0, not unknown)', clean)
}

console.log('=== 8. TB-2768: the FACE attaches the log verdict to the SUCCESS return — plus a lamp proving the read is load-bearing ===')
{
  const logFs = (log, exists = true) => ({ writeText: async () => {}, exists: async () => exists,
    readBytes: async (p) => (String(p).endsWith('.log') ? Buffer.from(log, 'utf8') : Buffer.from('%PDF-1.4')) })
  const mkFace = (fs) => createLatexFace({ settings: fakeSettings({}), fs,
    spawn: async ({ args }) => (args && args[0] === '--version' ? { exitCode: 0 } : { exitCode: 0 }) })
  const bad = await mkFace(logFs('Missing character: There is no ℤ (U+2124) in font [lmroman10-regular]:mapping=t')).check({ source: 'doc', outDir: '/w', sourceName: 'p.tex' })
  ok(bad.ok === true && bad.logRead === true && bad.glyphLossDetected === true && bad.missingCharacterCount === 1 && bad.glyphLossCode === 'VMU_PAPER_GLYPH_UNCOVERED',
    '★★ 正：a successful compile whose log names a dropped glyph says so on the SAME receipt', { logRead: bad.logRead, d: bad.glyphLossDetected, code: bad.glyphLossCode })
  ok(Array.isArray(bad.glyphsUnrepaired) && bad.glyphsUnrepaired.length === 1 && bad.glyphsUnrepaired[0].char === 'ℤ',
    '★★ 正：the receipt carries the row (chars, U+, count, font, where), not just a boolean', bad.glyphsUnrepaired)
  const good = await mkFace(logFs('no missing glyphs here')).check({ source: 'doc', outDir: '/w', sourceName: 'p.tex' })
  ok(good.ok === true && good.logRead === true && good.glyphLossDetected === false && good.missingCharacterCount === 0,
    '★ 反：clean log ⇒ glyphLossDetected:false with a MEASURED 0', { logRead: good.logRead, d: good.glyphLossDetected })
  const unreadable = await mkFace({ writeText: async () => {}, exists: async (p) => !String(p).endsWith('.log'), readBytes: async () => Buffer.from('%PDF-1.4') }).check({ source: 'doc', outDir: '/w', sourceName: 'p.tex' })
  ok(unreadable.ok === true && unreadable.logRead === false && unreadable.missingCharacterCount === null && unreadable.glyphLossDetected === false,
    '★★ 反：an UNREADABLE log is "not measured" (logRead:false, count:null) — never a silent clean 0', { logRead: unreadable.logRead, n: unreadable.missingCharacterCount })
  // ★ LAMP: remove the log reading from a COPY of kernel/latex.js; the SAME fake compile must LOSE the verdict.
  const dir = mkdtempSync(join(tmpdir(), 'latex-glyph-lamp-'))
  const srcPath = join(REPO, 'vibe-math-vmu', 'kernel', 'latex.js')
  const srcText = readFileSync(srcPath, 'utf8')
  const marker = '? glyphLossReading({ logText, texText })'
  if (!srcText.includes(marker)) throw new Error('lamp anchor missing in kernel/latex.js')
  writeFileSync(join(dir, 'latex.js'), srcText.replace(marker,
    '? { glyphLossDetected: false, missingCharacterCount: null, glyphsUnrepaired: [], glyphLossCode: null, glyphLossMeans: null }'), 'utf8')
  const mutated = await import(pathToFileURL(join(dir, 'latex.js')).href + '?lamp=1')
  const lampFace = mutated.createLatexFace({ settings: fakeSettings({}), fs: logFs('Missing character: There is no ℤ (U+2124) in font [lmroman10-regular]:mapping=t'),
    spawn: async ({ args }) => (args && args[0] === '--version' ? { exitCode: 0 } : { exitCode: 0 }) })
  const lamp = await lampFace.check({ source: 'doc', outDir: '/w', sourceName: 'p.tex' })
  ok(lamp.glyphLossDetected === false && lamp.missingCharacterCount === null,
    '★★★ LAMP(RED-worthy): with the log reading removed, the SAME dropped-glyph compile reports NOTHING — so the assertions above are load-bearing', { d: lamp.glyphLossDetected, n: lamp.missingCharacterCount })
}

console.log('=== VMU LATEX: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
