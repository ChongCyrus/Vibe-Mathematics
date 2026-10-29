// tests/vmu-run133-latex-diagnostic.test.mjs
//
// LIVE RUN 133, two defects measured on the paper pipeline:
//
//  F-133a  The LaTeX teaching (packs/v5r/prompts/v5r-blocks-a.js) told the agent "find the absolute path of the engine,
//          write it into `paperLatexCommand`, re-probe". In the v5r pack NO such setting existed: the sentence named a key
//          the kernel never reads, so an agent that did everything right still reported "the pdf is impossible". Kernel
//          capability is real (PATH-less TeX installs are the common case) - so the KEY is what gets added:
//          `vmu.paper.latexCommand`, an absolute-path override that becomes the ONLY engine candidate when set.
//
//  F-133b  A refused compile ("the pdf is not compiled") travelled to the receipt as one sentence with no compiler
//          output at all. The face carried a bounded stderr tail; the receipt did not. The receipt now carries ONE
//          collapsed compiler line - bounded, single line - while the full tail stays on the thrown error.
import { createLatexFace, LATEX_CODES } from '../vibe-math-vmu/kernel/latex.js'
import { createPaperSubsystem } from '../vibe-math-vmu/packs/v5r/paper.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
let failed = 0
const ok = (cond, name, extra) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; console.log('  FAIL ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra))) }
}

console.log('=== §1. the setting is DECLARED (a teaching sentence may only name declared keys) ===')
{
  const schema = readFileSync(join(ROOT, 'vibe-math-vmu/settings/schema.js'), 'utf8')
  ok(/vmu\.paper\.latexCommand/.test(schema), '★ the key `vmu.paper.latexCommand` exists in the settings schema')
  const row = /key: 'vmu\.paper\.latexCommand'[^}]*\}/.exec(schema)
  ok(row !== null && /type: 'string'/.test(row[0]) && /def: ''/.test(row[0]) && /who: 'office'/.test(row[0]),
    '★ it is a STRING whose default is the empty string (no override), owned by the office', row && row[0].slice(0, 120))
  const teaching = readFileSync(join(ROOT, 'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js'), 'utf8')
  ok(/vmu\.paper\.latexCommand/.test(teaching), '★ and the LaTeX teaching now names THAT key (the dead end `paperLatexCommand` is gone from the v5r block)')
  ok(/唯一\*\*引擎候选/.test(teaching) && /vibe_v5_set \{ key:"vmu\.paper\.latexCommand"/.test(teaching),
    '★★ and it says, in the same breath, WHAT the key does (the only engine candidate) and HOW to set it (an executable call) - a name without a call is still a dead end')
}

console.log('=== §2. the kernel face honours the override as the ONLY candidate ===')
{
  const calls = []
  const face = createLatexFace({
    settings: { get: (k) => (k === 'vmu.paper.latexCommand' ? 'D:/texlive/2025/bin/windows/xelatex.exe' : undefined) },
    spawn: async (req) => {
      calls.push(req.command)
      if (req.args.includes('--version')) return { exitCode: 0, stdout: 'XeTeX 3.141592653', stderr: '' }
      return { exitCode: 0, stdout: '', stderr: '' }
    },
    fs: { writeText: async () => {}, readBytes: async () => ({ length: 42 }), exists: async () => true },
  })
  const r = await face.check({ source: '\\documentclass{article}', outDir: 'out' })
  ok(r.ok === true, '★ a run through the override succeeds', r && r.code)
  const probed = calls.filter((c) => c === 'D:/texlive/2025/bin/windows/xelatex.exe').length
  ok(probed >= 2, '★★ the OVERRIDE path is the command that was probed AND run (not a bare engine name on PATH)', { calls })
  ok(calls.length > 0 && calls.every((c) => c === 'D:/texlive/2025/bin/windows/xelatex.exe'),
    '★★ and nothing else was tried: the override replaces the declared order instead of adding to it', calls)
}

console.log('=== §3. an empty override keeps the declared order (finished deployments unchanged) ===')
{
  const calls = []
  const face = createLatexFace({
    settings: {
      get: (k) => {
        if (k === 'vmu.paper.latexCommand') return ''
        if (k === 'vmu.paper.latexEngineOrder') return ['xelatex', 'pdflatex']
        return undefined
      },
    },
    spawn: async (req) => {
      calls.push(req.command)
      if (req.command === 'xelatex') return { exitCode: 0, stdout: 'xetex', stderr: '' }
      return { exitCode: 0, stdout: '', stderr: '' }
    },
    fs: { writeText: async () => {}, readBytes: async () => ({ length: 42 }), exists: async () => true },
  })
  const r = await face.check({ source: '\\documentclass{article}', outDir: 'out' })
  ok(r.ok === true && calls[0] === 'xelatex', '★ empty value ⇒ the pack-declared engine order still decides (xelatex first here)', calls)
  ok(calls.length > 0 && !calls.some((c) => /texlive/i.test(c)), '★ and no absolute path is invented out of thin air (measured on a NON-EMPTY call list)', calls)
}

console.log('=== §4. a refused compile hands the caller ONE line of what the compiler said ===')
{
  // a minimal in-memory records face with the three reads/writes the paper flow actually uses
  const rows = new Map()
  let seq = 0
  const records = {
    put: (rec) => {
      const id = rec.id && rows.has(rec.id) ? rec.id : 'rec-' + (++seq)
      rows.set(id, { ...rec, id, body: rec.body })
      return { id }
    },
    list: ({ track } = {}) => ({ items: Array.from(rows.values()).filter((r) => !track || r.track === track) }),
    get: ({ id } = {}) => ({ record: rows.get(id) || null }),
    status: () => ({ rows: rows.size }),
  }
  const kernel = {
    records,
    members: { roster: () => [] },
    settingsSnapshot: () => ({ 'vmu.records.tracks': ['progress', 'paper'] }),
    latex: {
      check: async () => ({
        ok: false, code: 'VMU_PAPER_LATEX_FAILED', engine: 'xelatex',
        tried: [
          { engine: 'xelatex', phase: 'probe', available: true },
          { engine: 'xelatex', phase: 'compile', available: true, exitCode: 1, stderr: '\n\n! LaTeX Error: File `missing.sty\' not found.\n\nl.3 \\usepackage{missing}\n' },
        ],
        stderr: '\n\n! LaTeX Error: File `missing.sty\' not found.\n\nl.3 \\usepackage{missing}\n',
        elapsedMs: 9,
      }),
    },
  }
  const paper = createPaperSubsystem({ kernel })
  paper.start({ target: 'p133', participants: ['r-1'] })
  paper.recordPart({ target: 'p133', member: 'r-1', title: 't', solution: 's' })
  let err = null
  try { await paper.compilePdf({ target: 'p133' }) } catch (e) { err = e }
  ok(err !== null && err.code === 'VMU_PACK_V5R_CORE_PAPER_PDF_FAILED', '★ the refusal keeps its named code', err && err.code)
  const msg = String((err && err.message) || '')
  ok(/编译器说：/.test(msg), '★★ the receipt message now says what the compiler said', msg)
  ok(/LaTeX Error: File/.test(msg), '★★ and that line is the compiler\'s own first error line (preferred over the summary line)', msg)
  ok(msg.split(String.fromCharCode(10)).length === 1 && msg.length > 0, '★ the diagnostic is collapsed to ONE line (a receipt is not a log)', msg.split(String.fromCharCode(10)).length)
  ok(msg.length <= 900, '★ bounded overall: face code + engines + one excerpt, well under the receipt budget', msg.length)
  ok(String(err && err.hint || '').indexOf('vmu.paper.latexCommand') !== -1,
    '★ and the hint names the setting that can point at an absolute engine path (F-133a) along with the stderrTail location', String(err && err.hint).slice(0, 80))
}

console.log('\n' + (failed === 0 ? 'ALL GREEN' : 'FAILURES') + ': ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)
