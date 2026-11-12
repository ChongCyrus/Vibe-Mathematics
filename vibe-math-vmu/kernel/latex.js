// vibe-math-vmu/kernel/latex.js — the LaTeX executor face (PHASE 7).
//
// WHY IT IS IN THE KERNEL: compiling a document, spawning a child process, timing it out and cancelling it are MECHANISMS.
// WHICH engines to try, in WHAT order (e.g. “xelatex first for Chinese”), is PACK POLICY DATA. This face therefore
// NEVER hard-codes “Chinese first”: it tries the order the caller/pack settings declares, and reports exactly which
// engines it tried. Absent a spawn seam the face is NOT constructed (kernel/index.js), and a direct call refuses by name.
import { writeFile, readFile, access, mkdir, constants as FS } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

export const LATEX_CODES = Object.freeze({
  unavailable: 'VMU_EXTERNAL_UNAVAILABLE',
  noEngine: 'VMU_PAPER_LATEX_NO_ENGINE',
  failed: 'VMU_PAPER_LATEX_FAILED',
  timeout: 'VMU_PAPER_LATEX_TIMEOUT',
  interrupted: 'VMU_PAPER_LATEX_INTERRUPTED',
  noOutput: 'VMU_PAPER_LATEX_NO_OUTPUT',
  badRequest: 'VMU_INVALID_ARGUMENT',
})

const refuse = (code, message, hint, extra = {}) => Object.assign(Object.assign(new Error(message), { code, hint }), extra)
const tail = (s, n = 2000) => { const v = String(s === undefined || s === null ? '' : s); return v.length > n ? v.slice(v.length - n) : v }

/**
 * ★★★ TB-2768 (RUN 81 attempt-3, MEASURED — PDF silently lost 16 glyphs while `final` said ok:true):
 * xelatex reports a glyph the font lacks on its LOG, not on stderr:
 *   `Missing character: There is no ℤ (U+2124) in font [lmroman10-regular]:mapping=t`
 * An exit code of 0 says "a PDF was written"; it does NOT say every glyph printed. This parser is the ONE reading of
 * those log lines — the face attaches it to a successful compile and the pack prints it on the paper receipt.
 */
export function missingCharactersOf (logText) {
  const text = String(logText === undefined || logText === null ? '' : logText)
  const rows = new Map()
  const re = /Missing character: There is no (.+?) \(U\+([0-9A-Fa-f]{4,6})\) in font \[([^\]]+)\]/g
  let m
  while ((m = re.exec(text)) !== null) {
    const char = m[1]
    const u = 'U+' + m[2].toUpperCase()
    const font = m[3]
    const key = u + '\u0000' + font
    const row = rows.get(key) || { char, u, count: 0, font }
    row.count += 1
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => a.u.localeCompare(b.u))
}

/**
 * The whole verdict for one compile log + the .tex it typeset: WHICH glyphs the font dropped, how many, in which font,
 * and the .tex lines they appear on (`where`) — so a reader can fix the text instead of only learning "a PDF exists".
 * `glyphLossDetected:false` is a MEASURED clean reading (the log was read and had no Missing-character line), never an
 * unknown: the caller passes logRead separately.
 */
export function glyphLossReading ({ logText = '', texText = '' } = {}) {
  const rows = missingCharactersOf(logText)
  const lines = String(texText === undefined || texText === null ? '' : texText).split(/\r?\n/)
  const whereOf = (ch) => {
    const hit = []
    for (let i = 0; i < lines.length && hit.length < 3; i += 1) if (lines[i].includes(ch)) hit.push(i + 1)
    return hit.length === 0 ? null : hit.join(', ')
  }
  const glyphsUnrepaired = rows.map((r) => ({ char: r.char, u: r.u, count: r.count, font: r.font, where: whereOf(r.char) }))
  const missingCharacterCount = glyphsUnrepaired.reduce((n, r) => n + r.count, 0)
  const glyphLossDetected = glyphsUnrepaired.length > 0
  return {
    glyphLossDetected,
    missingCharacterCount,
    glyphsUnrepaired,
    glyphLossCode: glyphLossDetected ? 'VMU_PAPER_GLYPH_UNCOVERED' : null,
    glyphLossMeans: glyphLossDetected
      ? 'the compile EXITED 0 and wrote a PDF, but its log names ' + String(glyphsUnrepaired.length) + ' distinct glyph(s) (' + String(missingCharacterCount) + ' occurrence(s)) the font could not print: those characters are MISSING from the PDF text even though the file exists. This is a measured content loss, not a failed compile — write the math between paired `$ … $` and/or use the LaTeX spelling (e.g. \\mathbb{Z}, \\forall, \\mid, \\cap, \\cup, \\cdots) so the glyph is typeset instead of dropped'
      : 'the compile log was read and carried NO `Missing character` line: every glyph the .tex asked the font for was printed (a MEASURED clean reading, not "not checked")',
    glyphLossHint: glyphLossDetected
      ? 'replace the dropped character(s) with their LaTeX command inside math mode: ℤ→\\mathbb{Z}, ∀→\\forall, ∣→\\mid, ∩→\\cap, ∪→\\cup, ⋯→\\cdots (the paper face already re-spells the glyphs it knows; this list is what the FONT dropped)'
      : null,
  }
}

export function createLatexFace(opts = {}) {
  const readKey = (k) => (opts.settings && typeof opts.settings.get === 'function' ? opts.settings.get(k) : (opts.settings || {})[k])
  const spawn = typeof opts.spawn === 'function' ? opts.spawn : null
  const spawnHandle = typeof opts.spawnHandle === 'function' ? opts.spawnHandle : null
  const clock = typeof opts.clock === 'function' ? opts.clock : () => Date.now()
  const log = typeof opts.log === 'function' ? opts.log : () => {}
  const fsSeam = opts.fs && typeof opts.fs.writeText === 'function' ? opts.fs : null
  const defaultFs = {
    writeText: async (path, text) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, String(text), 'utf8') },
    readBytes: async (path) => readFile(path),
    exists: async (path) => { try { await access(path, FS.F_OK); return true } catch { return false } },
  }
  const fs = fsSeam || defaultFs
  // Per-box rules, per face here: the ENGINE ORDER is data; the default (pdflatex then xelatex) is a neutral fallback,
  // NOT a Chinese-first policy. A pack that wants xelatex first declares it in its settings data.
  // ★ LIVE RUN 133 (F-133a): `vmu.paper.latexCommand` is an ABSOLUTE PATH override for the engine. When it is set, it is the
  // ONLY candidate - the whole point is that the binary is not reachable by bare name. An empty/whitespace value means "no
  // override", so a finished deployment that never set it keeps probing the declared order exactly as before.
  const commandOverride = () => {
    let raw = null
    try { raw = readKey('vmu.paper.latexCommand') } catch { raw = null }
    if (raw === undefined || raw === null) return null
    const s = String(raw).trim()
    return s === '' ? null : s
  }
  const engineOrder = () => {
    const override = commandOverride()
    if (override && !(Array.isArray(opts.engineOrder) && opts.engineOrder.length > 0)) return [override]
    const declared = readKey('vmu.paper.latexEngineOrder')
    const fromOpt = Array.isArray(opts.engineOrder) ? opts.engineOrder : null
    const raw = fromOpt || (Array.isArray(declared) ? declared : null)
    if (!raw || raw.length === 0) return ['pdflatex', 'xelatex']
    const out = []
    for (const e of raw) { const s = String(e || '').trim(); if (s && !out.includes(s)) out.push(s) }
    return out.length ? out : ['pdflatex', 'xelatex']
  }
  const timeoutMs = (requested) => {
    const n = Number(requested)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    const d = Number(readKey('vmu.paper.latexTimeoutMs'))
    return Number.isFinite(d) && d > 0 ? Math.floor(d) : 120000
  }

  let chain = Promise.resolve()
  const stats = { checks: 0, ok: 0, failed: 0, timeouts: 0, noEngine: 0, interrupted: 0 }
  let last = null

  const spawnOne = async ({ command, args, cwd, timeoutMs: ms }) => {
    const started = clock()
    if (spawnHandle) {
      let handle = null
      const res = await spawnHandle({ command, args, cwd, timeoutMs: ms }, (h) => { handle = h })
      const out = res && typeof res.then === 'function' ? await res : res
      return Object.assign({ started, handle }, out || {})
    }
    const out = await spawn({ command, args, cwd, timeoutMs: ms })
    return Object.assign({ started, handle: null }, out || {})
  }

  const checkOne = async (args) => {
    const source = typeof args.source === 'string' && args.source.trim() !== '' ? args.source : null
    const file = typeof args.file === 'string' && args.file.trim() !== '' ? args.file : null
    if (!source && !file) throw refuse(LATEX_CODES.badRequest, 'latex.check needs { file } or { source }', 'pass the .tex path or the source text')
    if (source && file) throw refuse(LATEX_CODES.badRequest, 'latex.check takes file OR source, not both', 'choose one carrier')
    let outDir = typeof args.outDir === 'string' && args.outDir.trim() !== '' ? args.outDir : null
    if (!outDir) throw refuse(LATEX_CODES.badRequest, 'latex.check needs { outDir } (the kernel never guesses a path)', 'pass the directory the caller owns')
    // ★★ RUN 153 (real machine, run 3 / agent report G2 — the LaTeX root cause): the caller's outDir arrived RELATIVE and
    // was handed to the engine through `join`, so on Windows xelatex received `Paper\paper-p5\paper-p5.tex`. TeX reads a
    // backslash as the start of a control sequence, so it reported `! Undefined control sequence.` for `<*> Paper\paper`
    // and produced NO pdf — while the same file compiled to a 3-page PDF the moment the path was written with forward
    // slashes. One form is agreed on by every shell: an ABSOLUTE path with forward slashes, resolved here, once. The
    // compile therefore no longer depends on the caller's cwd either (it used to, and the cwd was the relative path).
    // Only a RELATIVE path is resolved: an absolute path is the caller's own namespace and is left verbatim (a
    // POSIX-looking absolute path stays byte-identical, which is what the phase-7 contract asserts). A Windows
    // absolute path is the one exception: a drive-letter path is rewritten with forward slashes, the form xelatex
    // reads as a path instead of reading `\paper` as a control sequence.
    if (!isAbsolute(outDir)) outDir = resolve(outDir).replace(/\\/g, '/')
    else if (/^[A-Za-z]:/.test(outDir)) outDir = outDir.replace(/\\/g, '/')
    const engines = Array.isArray(args.engineOrder) && args.engineOrder.length ? args.engineOrder.map(String) : engineOrder()
    const ms = timeoutMs(args.timeoutMs)
    let texFile = file
    if (source) {
      // ★ RUN 153 (G2): `join` re-applies the PLATFORM separator, so a resolved `D:/…/Paper/p5` became `D:\\…\\p5\\p5.tex`
      // again — the very shape that made TeX read `\paper` as a control sequence. The separator is normalized on the way out.
      texFile = join(outDir, typeof args.sourceName === 'string' && args.sourceName.trim() ? args.sourceName.trim() : 'main.tex').replace(/\\/g, '/')
      try { await fs.writeText(texFile, source) } catch (e) {
        throw refuse(LATEX_CODES.noOutput, 'the output directory is not writable: ' + String((e && e.message) || e), 'give a writable outDir', { outDir })
      }
    }
    const tried = []
    for (const engine of engines) {
      // Probe first: “engine cannot run” and “engine ran and the document failed” are DIFFERENT facts.
      let probe
      try { probe = await spawnOne({ command: engine, args: ['--version'], cwd: outDir, timeoutMs: ms }) } catch (e) {
        tried.push({ engine, phase: 'probe', available: false, message: String((e && e.message) || e) })
        continue
      }
      if (!probe || probe.timedOut === true || probe.interrupted === true || Number(probe.exitCode) !== 0) {
        tried.push({ engine, phase: 'probe', available: false, exitCode: probe ? probe.exitCode : null, timedOut: !!(probe && probe.timedOut), stderr: tail(probe && probe.stderr, 400) })
        continue
      }
      const argv = ['-interaction=nonstopmode', '-halt-on-error', '-output-directory=' + outDir, texFile]
      let res
      try { res = await spawnOne({ command: engine, args: argv, cwd: outDir, timeoutMs: ms }) } catch (e) {
        tried.push({ engine, phase: 'compile', available: true, exitCode: null, message: String((e && e.message) || e) })
        continue
      }
      const elapsedMs = clock() - (res.started || clock())
      if (res.timedOut === true) {
        stats.timeouts += 1
        return { ok: false, code: LATEX_CODES.timeout, engine, tried, argv, elapsedMs, timeoutMs: ms,
          // ROUND 159 (FEEDBACK6 item 5): the resolved directory travels on FAILURE too — the caller's relative
          // "Paper/x" and this absolute path used to disagree inside one receipt.
          outDir,
          stderr: tail(res.stderr), message: 'the LaTeX compile exceeded ' + ms + 'ms' }
      }
      if (res.interrupted === true || res.signal) {
        stats.interrupted += 1
        return { ok: false, code: LATEX_CODES.interrupted, engine, tried, argv, elapsedMs, signal: res.signal || null,
          outDir,
          stderr: tail(res.stderr), message: 'the LaTeX compile was interrupted' }
      }
      if (Number(res.exitCode) !== 0) {
        tried.push({ engine, phase: 'compile', available: true, exitCode: res.exitCode, stderr: tail(res.stderr) })
        // A NON-ZERO EXIT IS A COMPILE FAILURE, NOT “no engine”: carry stderr and the exact argv.
        stats.failed += 1
        return { ok: false, code: LATEX_CODES.failed, engine, tried, argv, elapsedMs,
          outDir,
          stderr: tail(res.stderr), stdout: tail(res.stdout, 400), message: 'the LaTeX compile exited ' + String(res.exitCode) }
      }
      // ★ RUN 153 (G2's second half): the PDF is named after the .tex that produced it. `main.tex` was assumed, so a
      // caller passing `sourceName:"p5.tex"` got "exit 0 but no PDF at …/main.pdf" even on a successful compile.
      const pdfPath = join(outDir, (basename(texFile).replace(/\.tex$/i, '') || 'main') + '.pdf')
      let exists = false
      try { exists = await fs.exists(pdfPath) } catch { exists = false }
      if (!exists) {
        stats.failed += 1
        return { ok: false, code: LATEX_CODES.noOutput, engine, tried, argv, elapsedMs,
          outDir,
          message: 'exit 0 but no PDF at ' + pdfPath, hint: 'write \\\\documentclass with a PDF-producing engine, and put the output in outDir' }
      }
      // ★★★ RUN 2691 (TB-2691 / F75-15): the PDF's bytes and its sha256 come from the SAME buffer, read ONCE here.
      // The archive row used to carry `pdfBytes` with no file hash, so a verifier could see the byte count but not prove
      // the file on disk was the file this compile produced (run 75: 100 587 B on disk, row had only a body fingerprint).
      // `pdfSha256` is the file's sha256 — not the row body's — so `sha256(disk) === row.pdfSha256` is checkable.
      let bytes = null
      let sha = null
      try {
        const buf = await fs.readBytes(pdfPath)
        if (Buffer.isBuffer(buf)) { bytes = buf.length; sha = createHash('sha256').update(buf).digest('hex') }
        else if (buf && buf.length !== undefined) { bytes = buf.length; sha = createHash('sha256').update(Buffer.from(buf)).digest('hex') }
      } catch { bytes = null; sha = null }
      stats.ok += 1
      // ★★★ TB-2768 (RUN 81 attempt-3): a successful exit code answers "a PDF was written", never "every glyph
      // printed". Read the engine LOG here and attach the verdict — and keep "could not read" separate from "read and
      // clean" (`logRead:false` + `logReadWhy`, never a silent 0).
      const logPath = String(texFile).replace(/\.tex$/i, '.log')
      let logText = ''
      let logRead = false
      let logReadWhy = null
      try {
        const hasLog = await fs.exists(logPath)
        if (hasLog) {
          const logBuf = await fs.readBytes(logPath)
          logText = Buffer.isBuffer(logBuf) ? logBuf.toString('utf8') : String(logBuf === undefined || logBuf === null ? '' : logBuf)
          logRead = true
        } else {
          logReadWhy = 'the engine wrote no .log next to the .tex'
        }
      } catch (e) {
        logReadWhy = 'the .log could not be read: ' + String((e && e.message) || e)
      }
      let texText = source || ''
      if (texText === '' && logRead && missingCharactersOf(logText).length > 0) {
        try {
          const texBuf = await fs.readBytes(texFile)
          texText = Buffer.isBuffer(texBuf) ? texBuf.toString('utf8') : String(texBuf === undefined || texBuf === null ? '' : texBuf)
        } catch { /* a missing `where` is an honest absence */ }
      }
      const glyphLoss = logRead
        ? glyphLossReading({ logText, texText })
        : { glyphLossDetected: false, missingCharacterCount: null, glyphsUnrepaired: [], glyphLossCode: null,
          glyphLossMeans: 'the engine log could NOT be read (' + String(logReadWhy) + '), so glyph loss was NOT measured — this is not a clean reading', glyphLossHint: null }
      return { ok: true, engine, tried, argv, outDir, pdfPath, pdfBytes: bytes, pdfSha256: sha, elapsedMs, timeoutMs: ms, at: clock(),
        logPath, logRead, ...(logReadWhy === null ? {} : { logReadWhy }), ...glyphLoss }
    }
    stats.noEngine += 1
    return { ok: false, code: LATEX_CODES.noEngine, tried, engineOrder: engines,
      message: 'none of the requested LaTeX engines is usable', hint: 'tried: ' + engines.join(', ') }
  }

  const check = (args = {}) => {
    if (!spawn && !spawnHandle) {
      return Promise.reject(refuse(LATEX_CODES.unavailable, 'this kernel has no spawn seam, so LaTeX cannot run',
        'construct the kernel with { spawn } (the same seam createLeanFace uses); this face never pretends to compile'))
    }
    stats.checks += 1
    // SERIAL ON PURPOSE: several engines/writes into one outDir would race on main.aux/main.pdf. A per-call queue costs
    // nothing for the normal single-document case and makes concurrent checks deterministic.
    const run = chain.then(() => checkOne(args)).then((r) => { last = r; return r }, (e) => { last = { ok: false, code: e && e.code, message: String((e && e.message) || e) }; throw e })
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  // ★★★ RUN 2691 (TB-2691 / F75-15): a read-only disk reading for the paper status face. It reads the PDF ONCE and
  // answers the three questions a verifier asks: does the file exist, how many bytes, and WHICH bytes (sha256). The
  // archive row records the sha; this face lets a read compare disk to it without a second stat call anywhere else.
  const pdfReading = async (pdfPath) => {
    const p = pdfPath === undefined || pdfPath === null ? '' : String(pdfPath).trim()
    if (p === '') return { ok: false, exists: false, pdfBytes: null, pdfSha256: null, why: 'no pdfPath was named, so no file could be read' }
    let exists = false
    try { exists = await fs.exists(p) } catch { exists = false }
    if (!exists) return { ok: false, exists: false, pdfBytes: null, pdfSha256: null, why: 'no file at the recorded pdfPath' }
    try {
      const buf = await fs.readBytes(p)
      return { ok: true, exists: true, pdfBytes: buf && buf.length !== undefined ? buf.length : null,
        pdfSha256: createHash('sha256').update(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).digest('hex') }
    } catch (e) {
      return { ok: false, exists: true, pdfBytes: null, pdfSha256: null, why: 'the file exists but could not be read: ' + String((e && e.message) || e) }
    }
  }

  return {
    check,
    pdfReading,
    status: () => ({ ok: true, code: null, checks: stats.checks, okChecks: stats.ok, failed: stats.failed, timeouts: stats.timeouts, noEngine: stats.noEngine, interrupted: stats.interrupted,
      engineOrder: engineOrder(), serial: true, last }),
  }
}

export default createLatexFace
