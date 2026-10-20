// PHASE 7 — the LaTeX executor face. No real TeX is ever run here: every assertion drives a FAKE spawn, and the
// argv is asserted so a wrong seam shape cannot pass as "compiled".
import { join } from 'node:path'
import { createLatexFace, LATEX_CODES } from '../vibe-math-vmu/kernel/latex.js'
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
  ok(compile && compile.command === 'xelatex' && compile.args.includes('-halt-on-error') &&
    compile.args.includes('-output-directory=/work/paper') && compile.args.includes(join('/work/paper', 'main.tex')) &&
    compile.cwd === '/work/paper',
    '★ 真的传了正确 argv：-interaction=nonstopmode / -halt-on-error / -output-directory=<outDir> / tex 文件 / cwd=outDir', compile)
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

console.log('=== VMU LATEX: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
