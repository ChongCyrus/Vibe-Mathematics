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
// HOW A FACE USES IT — THE MINIMAL 10-LINE FORM (round 6). Copy this; only the probe is real work:
//
//   1  import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
//   2  import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
//   3  const MOD = join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu/kernel/<face>.js')
//   4  async function probe(mod) {                    // ← THE INVARIANT, with a CONTROL direction
//   5    const a = mod.create<Face>({ clock: () => 1000, log: () => {}, settings: {} })
//   6    return { good: /* the good path really happens */, bad: /* the bad path, NAMED */ }
//   7  }
//   8  const family = await falsifyFamily({ name: '<face>', cases: [{ name: '<face>.js', module: MOD, probe,
//   9    mutations: [{ label: '<defect>', find: '<unique anchor>', replace: '<defective version>' }] }] })
//  10  if (!family.ok) { console.error(formatFamilyReport(family)); process.exitCode = 1 }
//
// Line 6 is the whole craft: the reading must contain a CONTROL direction (the good path really happens) and the
// defect must be visible as a NAMED value (a code, or a number the mutant changes). `MINIMAL_FAMILY_EXAMPLE` below is
// the same text as a string, exported so a report or a volume can quote it without drifting from this file. A full
// example with the control-group assertions spelled out is `tests/vmu-resume-falsify.test.mjs` (2 mutations).
//
// The `module` must be importable as a real ESM module from inside this checkout; relative imports in the copy are
// rewritten to absolute `file://` URLs so the mutant is self-contained wherever `D:\_tmp` is.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve, isAbsolute, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
// The repository's own comment/string blanker (sibling lib), reused so the eligibility scan reads CODE only — a
// `refuse(...)` inside a doc comment must not count as a decision point.
import { stripComments } from './strip-comments.mjs'

/** The one allowed temp root (project discipline: temp files live in `D:\_tmp`, never on C: and never in-repo). */
export const DEFAULT_TMP_DIR = 'D:\\_tmp'

/**
 * The 10-line form from the header, as a STRING, so a report or a volume can quote the recipe without drifting from
 * the file that implements it. Replace `<face>`, the factory name and the anchor/replacement; everything else is the
 * library's contract.
 */
export const MINIMAL_FAMILY_EXAMPLE = [
  "import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'",
  "import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'",
  "const MOD = join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu/kernel/<face>.js')",
  'async function probe(mod) {                    // ← THE INVARIANT, with a CONTROL direction',
  '  const a = mod.create<Face>({ clock: () => 1000, log: () => {}, settings: {} })',
  '  return { good: /* the good path really happens */, bad: /* the bad path, NAMED */ }',
  '}',
  "const family = await falsifyFamily({ name: '<face>', cases: [{ name: '<face>.js', module: MOD, probe,",
  "  mutations: [{ label: '<defect>', find: '<unique anchor>', replace: '<defective version>' }] }] })",
  'if (!family.ok) { console.error(formatFamilyReport(family)); process.exitCode = 1 }',
].join('\n')

/** Every way a falsification can be INVALID (as opposed to "the mutant was correctly caught"). */
export const FALSIFY_PROBLEM = Object.freeze({
  notApplied: 'MUTATION-NOT-APPLIED',
  unsafeTmp: 'UNSAFE-TMP-DIR',
  unimportable: 'MUTANT-UNIMPORTABLE',
  realRed: 'REAL-MODULE-NOT-GREEN',
  noDiscrimination: 'PROBE-DOES-NOT-DISCRIMINATE',
  leftover: 'TEMP-NOT-CLEANED',
  controlAbsent: 'CONTROL-FIELD-ABSENT',
  notEligible: 'NOT-A-FALSIFY-FAMILY',
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
  controlFields = [],
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
  // ⑥ THE CONTROL DIRECTION, mechanically (round 7): a probe whose green reading has no POSITIVE observation only
  // ever proves "the bad path did not happen", which is true of a face that was never wired at all. Every declared
  // `controlFields` name must be present AND truthy in the green reading — the rule stops being prose.
  if (Array.isArray(controlFields) && controlFields.length > 0) {
    const absent = controlFields.filter((f) => !report.real || report.real[f] === undefined || report.real[f] === null || report.real[f] === false || report.real[f] === 0 || report.real[f] === '')
    if (absent.length > 0) {
      report.problems.push(FALSIFY_PROBLEM.controlAbsent + ': the green reading has no control direction for ' + absent.join(', ') +
        ' — a probe that only reads "the bad path did not happen" is vacuous on an unwired face (non-vacuous: ' + JSON.stringify(controlFields) + ')')
    }
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
      controlFields: c.controlFields, expectGreen: c.expectGreen, expectRed: c.expectRed, tmpDir, keepOnFailure,
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

/**
 * THE ELIGIBILITY CHECK (round 7, task C): "is this face worth a falsify family AT ALL?" — asked mechanically, so a
 * later round cannot pad the count with a family that proves nothing. Three criteria, each a named reason:
 *   · DECISION POINTS — at least `minDecisionPoints` removable ones (`throw refuse(`, a returned `{ ok:false`, or a
 *     `return refuse(`). **No branch to remove ⇒ nothing to falsify** (a pure data shape is not a family).
 *   · A FACTORY — an exported `create*` factory, so the probe can build the face without a host seam.
 *   · REFUSAL VOCABULARY — at least one `VMU_*`/`MATH_*`/`ARCHIVE_*`/`SCRIPT_*` code, so the red reading is NAMED.
 * Returns `{ ok, module, decisionPoints, refusalCodes, factory, reasons[] }`. `ok === false` is an instruction:
 * do not add a family here (add the seam/factory or the decision point first).
 */
export function familyEligibility({ module: modulePath, minDecisionPoints = 1, minRefusalCodes = 1 } = {}) {
  const src = stripComments(readFileSync(modulePath, 'utf8'))
  const decisionPoints = (src.match(/throw\s+refuse\s*\(|return\s+\{\s*ok\s*:\s*false|return\s+refuse\s*\(/g) || []).length
  const refusalCodes = [...new Set((src.match(/'((?:VMU|MATH|ARCHIVE|SCRIPT)_[A-Z0-9_]+)'/g) || []).map((s) => s.slice(1, -1)))].sort()
  const factory = (/export function (create[A-Za-z0-9_]+)/.exec(src) || [])[1] || null
  const reasons = []
  if (decisionPoints < minDecisionPoints) {
    reasons.push('no removable decision point: ' + decisionPoints + ' < ' + minDecisionPoints + ' — a module with no branch to remove is not a falsify family')
  }
  if (refusalCodes.length < minRefusalCodes) reasons.push('no named refusal code (' + minRefusalCodes + ' required): the red reading could not be NAMED')
  if (!factory) reasons.push('no exported create* factory: the probe cannot build the face without a host seam')
  return { ok: reasons.length === 0, module: modulePath, decisionPoints, refusalCodes, factory, reasons }
}
