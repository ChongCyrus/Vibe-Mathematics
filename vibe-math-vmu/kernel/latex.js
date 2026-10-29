// vibe-math-vmu/kernel/latex.js — the LaTeX executor face (PHASE 7).
//
// WHY IT IS IN THE KERNEL: compiling a document, spawning a child process, timing it out and cancelling it are MECHANISMS.
// WHICH engines to try, in WHAT order (e.g. “xelatex first for Chinese”), is PACK POLICY DATA. This face therefore
// NEVER hard-codes “Chinese first”: it tries the order the caller/pack settings declares, and reports exactly which
// engines it tried. Absent a spawn seam the face is NOT constructed (kernel/index.js), and a direct call refuses by name.
import { writeFile, readFile, access, mkdir, constants as FS } from 'node:fs/promises'
import { dirname, join } from 'node:path'

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
    const outDir = typeof args.outDir === 'string' && args.outDir.trim() !== '' ? args.outDir : null
    if (!outDir) throw refuse(LATEX_CODES.badRequest, 'latex.check needs { outDir } (the kernel never guesses a path)', 'pass the directory the caller owns')
    const engines = Array.isArray(args.engineOrder) && args.engineOrder.length ? args.engineOrder.map(String) : engineOrder()
    const ms = timeoutMs(args.timeoutMs)
    let texFile = file
    if (source) {
      texFile = join(outDir, typeof args.sourceName === 'string' && args.sourceName.trim() ? args.sourceName.trim() : 'main.tex')
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
          stderr: tail(res.stderr), message: 'the LaTeX compile exceeded ' + ms + 'ms' }
      }
      if (res.interrupted === true || res.signal) {
        stats.interrupted += 1
        return { ok: false, code: LATEX_CODES.interrupted, engine, tried, argv, elapsedMs, signal: res.signal || null,
          stderr: tail(res.stderr), message: 'the LaTeX compile was interrupted' }
      }
      if (Number(res.exitCode) !== 0) {
        tried.push({ engine, phase: 'compile', available: true, exitCode: res.exitCode, stderr: tail(res.stderr) })
        // A NON-ZERO EXIT IS A COMPILE FAILURE, NOT “no engine”: carry stderr and the exact argv.
        stats.failed += 1
        return { ok: false, code: LATEX_CODES.failed, engine, tried, argv, elapsedMs,
          stderr: tail(res.stderr), stdout: tail(res.stdout, 400), message: 'the LaTeX compile exited ' + String(res.exitCode) }
      }
      const pdfPath = join(outDir, 'main.pdf')
      let exists = false
      try { exists = await fs.exists(pdfPath) } catch { exists = false }
      if (!exists) {
        stats.failed += 1
        return { ok: false, code: LATEX_CODES.noOutput, engine, tried, argv, elapsedMs,
          message: 'exit 0 but no PDF at ' + pdfPath, hint: 'write \\\\documentclass with a PDF-producing engine, and put the output in outDir' }
      }
      let bytes = null
      try { const b = await fs.readBytes(pdfPath); bytes = b && b.length !== undefined ? b.length : null } catch { bytes = null }
      stats.ok += 1
      return { ok: true, engine, tried, argv, outDir, pdfPath, pdfBytes: bytes, elapsedMs, timeoutMs: ms, at: clock() }
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

  return {
    check,
    status: () => ({ ok: true, code: null, checks: stats.checks, okChecks: stats.ok, failed: stats.failed, timeouts: stats.timeouts, noEngine: stats.noEngine, interrupted: stats.interrupted,
      engineOrder: engineOrder(), serial: true, last }),
  }
}

export default createLatexFace
