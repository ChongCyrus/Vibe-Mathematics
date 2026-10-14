// tests/_lib/falsify.mjs — THE REUSABLE FALSIFICATION PARADIGM (round 3 invented it, round 4 makes it library-shaped).
//
// WHAT PROBLEM THIS SOLVES. Every assertion in this repository is supposed to be "shown able to fail", and the
// strongest form of that is not a hand-written negative test: it is to MUTATE THE REAL MODULE and watch the SAME
// probe go red. Round 3 did it by hand for `kernel/activity.js` (copy the module to `D:\_tmp`, splice in the
// historical-replay defect, import the copy, run the probe that is green on the real module and require it to be red).
// That is one file's worth of careful plumbing — this module is that plumbing, so any face can use the technique.
//
// THE FIVE THINGS THAT MAKE IT HONEST (each one is a refusal here, because a "falsification" that quietly did
// nothing is worse than no test at all):
//   ① THE MUTATION MUST APPLY. A `find` string that does not occur the declared number of times is
//      `MUTATION-NOT-APPLIED` — a renamed anchor must never read as "the probe cannot fail".
//   ② THE MUTANT MUST IMPORT. A syntax error would look like a red probe for the wrong reason, so the copy is
//      imported BEFORE it is probed and an import failure is reported as `MUTANT-UNIMPORTABLE`.
//   ③ THE REAL MODULE MUST BE GREEN on the very same probe — otherwise the probe is broken, not the mutant.
//   ④ THE TWO READINGS MUST DIFFER — `PROBE-DOES-NOT-DISCRIMINATE` when the mutant produced exactly the green
//      reading, which is what a no-op mutation looks like.
//   ⑤ THE COPY LIVES IN `D:\_tmp` AND IS DELETED. The temp root is validated (`UNSAFE-TMP-DIR` refuses anything
//      else, so a mutant can never be written into the repository) and every copy is removed in a `finally`, with
//      leftovers reported as `TEMP-NOT-CLEANED`.
//
// HOW A FACE USES IT (a runnable example is `tests/vmu-activity-falsify-lib.test.mjs`):
//
//   import { falsify, formatReport } from './_lib/falsify.mjs'
//   const report = await falsify({
//     name: 'kernel/scheduler.js — the trampoline guard is load-bearing',
//     module: SCHEDULER_PATH,
//     mutations: [{ label: 'guard removed', find: 'if (ticking) {', replace: 'if (false) {' }],
//     probe: async (mod) => { ...drive the module...; return { passes, deferred, fired } },
//   })
//   ok(report.ok, 'the probe is falsified by this mutation', formatReport(report))
//
// The `module` must be importable as a real ESM module from inside this checkout; relative imports in the copy are
// rewritten to absolute `file://` URLs so the mutant is self-contained wherever `D:\_tmp` is.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve, isAbsolute, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The one allowed temp root (project discipline: temp files live in `D:\_tmp`, never on C: and never in-repo). */
export const DEFAULT_TMP_DIR = 'D:\\_tmp'

/** Every way a falsification can be INVALID (as opposed to "the mutant was correctly caught"). */
export const FALSIFY_PROBLEM = Object.freeze({
  notApplied: 'MUTATION-NOT-APPLIED',
  unsafeTmp: 'UNSAFE-TMP-DIR',
  unimportable: 'MUTANT-UNIMPORTABLE',
  realRed: 'REAL-MODULE-NOT-GREEN',
  noDiscrimination: 'PROBE-DOES-NOT-DISCRIMINATE',
  leftover: 'TEMP-NOT-CLEANED',
})

let counter = 0

/**
 * Refuse a temp root that is not the project's (a mutant written into the repository would be picked up by the
 * gates, and one written to an unknown drive violates the temp discipline). Returns the resolved directory.
 */
export function assertSafeTempRoot(tmpDir) {
  const raw = String(tmpDir === undefined || tmpDir === null || tmpDir === '' ? DEFAULT_TMP_DIR : tmpDir)
  if (!isAbsolute(raw)) throw problem(FALSIFY_PROBLEM.unsafeTmp, 'the mutant temp root must be an ABSOLUTE path: ' + raw, 'use the default ' + DEFAULT_TMP_DIR)
  const norm = resolve(raw)
  const leaf = norm.split(sep).filter(Boolean).pop() || ''
  if (!/^_tmp$/i.test(leaf)) {
    throw problem(FALSIFY_PROBLEM.unsafeTmp, 'the mutant temp root must be a directory named `_tmp`: ' + norm, 'use ' + DEFAULT_TMP_DIR + ' (project temp discipline)')
  }
  return norm
}
function problem(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/**
 * Make a copied module self-contained: every RELATIVE import/export specifier becomes an absolute `file://` URL
 * resolved against the ORIGINAL module's directory. Bare (package) specifiers are left alone.
 */
export function selfContainedSource(text, modulePath) {
  const base = dirname(resolve(String(modulePath)))
  return String(text).replace(/(\bfrom\s+|^\s*import\s+)(['"])(\.\.?\/[^'"]+)\2/gm, (whole, lead, quote, spec) => {
    const abs = resolve(base, spec)
    return lead + quote + pathToFileURL(abs).href + quote
  })
}

/**
 * Apply ONE textual mutation. `occurrences` (default 1) is the number of times `find` must appear — asserting it
 * exactly is what turns a renamed anchor from a silent no-op into `MUTATION-NOT-APPLIED`.
 */
export function mutateOnce(source, { find, replace, occurrences = 1, allowMore = false } = {}) {
  const text = String(source)
  const needle = String(find)
  if (!needle) throw problem(FALSIFY_PROBLEM.notApplied, 'a mutation needs a non-empty `find` anchor')
  const seen = text.split(needle).length - 1
  if (seen === 0) {
    throw problem(FALSIFY_PROBLEM.notApplied, 'the mutation anchor was NOT found: ' + JSON.stringify(needle.slice(0, 80)), 'the module changed — re-read it and update the anchor')
  }
  if (seen !== occurrences && !allowMore) {
    throw problem(FALSIFY_PROBLEM.notApplied,
      'the mutation anchor occurs ' + seen + ' time(s) but the mutation declares ' + occurrences + ': ' + JSON.stringify(needle.slice(0, 80)),
      'pick a longer anchor so the mutation is unambiguous (or set allowMore)')
  }
  return { text: text.split(needle).join(String(replace)), applied: 1, occurrences: seen }
}

/** Write a self-contained mutant into the temp root. Returns the handle the caller must clean up. */
export function writeMutant({ source, name, tmpDir = DEFAULT_TMP_DIR }) {
  const root = assertSafeTempRoot(tmpDir)
  mkdirSync(root, { recursive: true })
  counter += 1
  const file = join(root, 'vmu-falsify-' + process.pid + '-' + counter + '-' + String(name || 'mutant').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48) + '.mjs')
  writeFileSync(file, String(source), 'utf8')
  return {
    path: file,
    url: pathToFileURL(file).href,
    leftover: () => existsSync(file),
    cleanup() { try { if (existsSync(file)) rmSync(file, { force: true }) } catch (e) { /* reported through leftover() */ } },
  }
}

/**
 * THE PARADIGM. `probe(moduleNamespace)` must return a JSON-able reading (a synchronous throw is fine — it is caught
 * and reported as `{ threw: true, error }`, which is itself often the red reading a mutation produces).
 *
 * Returns a report: `{ ok, name, real, results[], problems[], leftovers[], kept[] }`. `ok === true` means: the real
 * module was green, EVERY declared mutation applied, imported, produced a DIFFERENT reading, and every copy was
 * deleted.
 */
export async function falsify({
  name = 'falsify',
  module: modulePath,
  mutations = [],
  probe,
  expectGreen = (reading) => reading !== undefined && reading !== null,
  expectRed = (red, green) => JSON.stringify(red) !== JSON.stringify(green),
  tmpDir = DEFAULT_TMP_DIR,
  keepOnFailure = false,
} = {}) {
  if (typeof probe !== 'function') throw problem(FALSIFY_PROBLEM.notApplied, 'falsify() needs a probe(moduleNamespace) function')
  if (!Array.isArray(mutations) || mutations.length === 0) throw problem(FALSIFY_PROBLEM.notApplied, 'falsify() needs at least one mutation')
  const root = assertSafeTempRoot(tmpDir)
  const realSource = readFileSync(modulePath, 'utf8')
  const report = { ok: false, name, module: modulePath, tmpDir: root, real: null, results: [], problems: [], leftovers: [], kept: [] }

  const runProbe = async (mod) => {
    try { return await probe(mod) } catch (e) { return { threw: true, error: String((e && e.code) || (e && e.name) || e), message: String((e && e.message) || e).slice(0, 200) } }
  }

  // ③ the green baseline FIRST: without it a "red mutant" proves nothing.
  const realMod = await import(pathToFileURL(resolve(modulePath)).href)
  report.real = await runProbe(realMod)
  if (!expectGreen(report.real)) {
    report.problems.push(FALSIFY_PROBLEM.realRed + ': the REAL module is not green on this probe — the probe is broken, not the mutant (' + JSON.stringify(report.real) + ')')
  }

  for (const m of mutations) {
    const label = m && m.label ? String(m.label) : '(unnamed mutation)'
    const row = { label, applied: false, importable: false, red: null, falsified: false }
    let handle = null
    try {
      const mutated = mutateOnce(selfContainedSource(realSource, modulePath), m)
      row.applied = true
      handle = writeMutant({ source: mutated.text, name: m.name || label, tmpDir: root })
      let mod = null
      try {
        mod = await import(handle.url)
        row.importable = true
      } catch (e) {
        report.problems.push(FALSIFY_PROBLEM.unimportable + ' [' + label + ']: ' + String((e && e.message) || e).slice(0, 200))
      }
      if (row.importable) {
        row.red = await runProbe(mod)
        row.falsified = !!expectRed(row.red, report.real)
        if (!row.falsified) {
          report.problems.push(FALSIFY_PROBLEM.noDiscrimination + ' [' + label + ']: the mutant produced the SAME reading as the real module (' + JSON.stringify(row.red) + ') — the mutation is a no-op for this probe')
        }
      }
    } catch (e) {
      report.problems.push(String((e && e.code) || FALSIFY_PROBLEM.notApplied) + ' [' + label + ']: ' + String((e && e.message) || e))
    } finally {
      // ⑤ always clean up unless the caller explicitly asked to keep a mutant for inspection AFTER a problem.
      const keep = keepOnFailure === true && report.problems.length > 0
      if (handle && !keep) handle.cleanup()
      if (handle && handle.leftover()) {
        if (keep) report.kept.push(handle.path)
        else report.leftovers.push(handle.path)
      }
    }
    report.results.push(row)
  }

  if (report.leftovers.length > 0) report.problems.push(FALSIFY_PROBLEM.leftover + ': ' + report.leftovers.join(', '))
  report.ok = report.problems.length === 0 && report.results.every((r) => r.falsified)
  return report
}

/** One-line-per-mutation rendering for an `ok(...)` detail (the tests print this on failure). */
export function formatReport(report) {
  const lines = ['falsify: ' + report.name, '  real   : ' + JSON.stringify(report.real)]
  for (const r of report.results) {
    lines.push('  ' + (r.falsified ? 'RED ✓' : 'not red') + ' [' + r.label + '] applied=' + r.applied + ' importable=' + r.importable + ' red=' + JSON.stringify(r.red))
  }
  for (const p of report.problems) lines.push('  PROBLEM: ' + p)
  if (report.leftovers.length) lines.push('  LEFTOVER: ' + report.leftovers.join(', '))
  return lines.join('\n')
}

/**
 * THE FAMILY FORM (round 5): one call for several modules/probes, each with its own CONTROL reading and its own
 * single-point mutations. This is what makes "add a falsify family" a ~30-line job instead of a plumbing exercise:
 *
 *   const family = await falsifyFamily({ name: 'mailbox/chat/panel', cases: [
 *     { name: 'mailbox ack-after-delivery', module: MAILBOX, probe: mailboxProbe,
 *       mutations: [{ label: 'ack before delivery', find: '…', replace: '…' }] },
 *     …
 *   ] })
 *   ok(family.ok, 'every family member is falsified', formatFamilyReport(family))
 *
 * `ok` is true only when EVERY case is ok — i.e. for each one: the unmutated module passed the probe (control), every
 * mutation applied, imported, and produced a DIFFERENT reading. A case that silently did nothing cannot hide behind
 * its siblings: the per-case problems are aggregated WITH the case name.
 */
export async function falsifyFamily({ name = 'falsify-family', cases = [], tmpDir = DEFAULT_TMP_DIR, keepOnFailure = false } = {}) {
  if (!Array.isArray(cases) || cases.length === 0) throw problem(FALSIFY_PROBLEM.notApplied, 'falsifyFamily() needs at least one case')
  const reports = []
  for (const c of cases) {
    reports.push(await falsify({
      name: c.name || name, module: c.module, mutations: c.mutations, probe: c.probe,
      expectGreen: c.expectGreen, expectRed: c.expectRed, tmpDir, keepOnFailure,
    }))
  }
  const problems = reports.flatMap((r) => r.problems.map((p) => r.name + ': ' + p))
  return {
    ok: reports.length > 0 && reports.every((r) => r.ok),
    name, cases: reports, problems,
    results: reports.flatMap((r) => r.results.map((x) => Object.assign({ case: r.name }, x))),
  }
}

/** The family rendering: every case's control + every mutation, then the aggregated problems. */
export function formatFamilyReport(family) {
  const lines = ['falsify family: ' + family.name + ' — ' + family.cases.length + ' case(s), ok=' + family.ok]
  for (const c of family.cases) lines.push(formatReport(c).split('\n').map((l) => '  ' + l).join('\n'))
  if (family.problems.length) lines.push('  FAMILY PROBLEMS: ' + family.problems.join(' | '))
  return lines.join('\n')
}
