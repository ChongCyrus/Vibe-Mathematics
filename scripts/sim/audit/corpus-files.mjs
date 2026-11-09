// scripts/sim/audit/corpus-files.mjs — ONE ruler for "which receipts files did this audit measure".
//
// The audit (all.mjs) and the release gate (release-ready.mjs) must agree about the corpus: whoever writes the report
// also writes the layer, and the gate re-reads exactly that layer. Earlier versions GUESSED the layer (newest receipts
// mtime wins) and GUESSED membership (a corpus dir is "an extra" only if its receipts are newer than generatedAt).
// Two guesses composed into audit-r14 A13b: one corpus dir left out of the list, every stamp recomputed over the
// smaller list, and the report was READY while it had never measured that dir. A guess cannot be patched into a proof.
//
// The model now has an OWNER:
//
//   - all.mjs runs every scenario INTO a layer it creates for that run (`<root>/run-<utc stamp>-<pid>/`), lists every
//     `corpus-<scenario>/receipts.jsonl` in that layer (`corpusFiles`), and writes the layer path into the report
//     (`corpus.dir`). A layer belongs to one run; if it holds a corpus dir the run did not produce, the audit fails.
//   - all.mjs then atomically writes `<root>/current-layer.json` (write tmp + rename in the same directory), naming
//     the layer that is current. The pointer is DATA, not a guess: the gate compares the layer a report names with
//     this pointer. A report may honestly describe an OLDER layer -- that is not the same as describing the CURRENT
//     one, and the release gate only accepts the current one.
//   - `resolveReportCorpus(manifest)` reads `corpus.dir` and nothing else: no enumeration of candidate layers, no
//     mtime filter on membership. Files the report lists and the layer does not have are `missing`; files whose bytes
//     changed are `mismatched`; corpus dirs the layer holds and the report does not list are `extras` -- all of them,
//     because in a directory that should hold only this run's output an unlisted corpus dir is either a short report
//     or a tampered layer, and both must be refused by name.
//
// The digest is sha256 over `scenario + ' ' + sha256(receipts bytes) + '\n'`, sorted inside this function, so neither
// caller can accidentally fix a different order.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const NL = String.fromCharCode(10)

/**
 * The dev sim root: all.mjs writes one run layer per execution under it and updates `current-layer.json` there. It is
 * a data location, not an execution path: `VMU_SIM_ROOT` or `--out` overrides it, and a missing root or layer is a
 * named refusal (AUDIT_CORPUS_UNMEASURED), never an empty digest and never a skip.
 */
export const DEFAULT_SIM_ROOT = process.env.VMU_SIM_ROOT || 'D:/_tmp/sim' // PORTABLE-ALLOW: dev corpus root; overridable with VMU_SIM_ROOT or --out, and a missing root/layer is a named AUDIT_CORPUS_UNMEASURED refusal, never a skip

/** The single-writer pointer: all.mjs atomically rewrites it after every run. */
export const CURRENT_LAYER_FILE = 'current-layer.json'

/** sha256 of a buffer, as a hex string (no prefix). One helper so the digest cannot be spelled two ways. */
export function sha256Hex(body) {
  return createHash('sha256').update(body).digest('hex')
}

/**
 * Every `corpus-<scenario>/receipts.jsonl` directly under `dir`, with its bytes and sha256 read ONCE here. Sorted by
 * scenario. A file that cannot be read keeps `bytes:null, sha256:null` so the caller can refuse by name instead of
 * hashing an empty buffer and calling it a corpus. `mtimeMs` is reported for ordering checks only; it never decides
 * membership.
 */
export function corpusFilesIn(dir) {
  if (!existsSync(dir)) return []
  let entries
  try { entries = readdirSync(dir) } catch { return [] }
  const files = []
  for (const name of entries) {
    if (!name.startsWith('corpus-')) continue
    const receiptsPath = join(dir, name, 'receipts.jsonl')
    if (!existsSync(receiptsPath)) continue
    let body = null
    let bytes = null
    let mtimeMs = null
    try {
      body = readFileSync(receiptsPath)
      bytes = body.length
      mtimeMs = statSync(receiptsPath).mtimeMs
    } catch { body = null }
    files.push({
      scenario: name.slice('corpus-'.length),
      receiptsPath,
      bytes,
      sha256: body === null ? null : 'sha256:' + sha256Hex(body),
      mtimeMs,
    })
  }
  files.sort((a, b) => (a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : 0))
  return files
}

/**
 * THE corpus id: sha256 over one line per scenario, sorted HERE (callers pass any order). A null sha256 is refused
 * with a named error: a corpus id computed from unreadable files is a number with no measurement behind it.
 */
export function corpusDigestOf(files) {
  const ordered = [...files].sort((a, b) => (a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : 0))
  const digest = createHash('sha256')
  for (const f of ordered) {
    if (typeof f.sha256 !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(f.sha256)) {
      throw new Error('CORPUS FILE UNREADABLE: ' + String(f.receiptsPath) + ' (' + String(f.scenario) + ') has no sha256 — a digest over files that were not read is not a measurement')
    }
    digest.update(f.scenario + ' ' + f.sha256.slice('sha256:'.length) + NL)
  }
  return 'sha256:' + digest.digest('hex')
}

/** The files a report's manifest names, in that order, or null when the manifest predates the file list. */
export function manifestCorpusFiles(manifest) {
  const listed = manifest && manifest.corpus && Array.isArray(manifest.corpus.corpusFiles) ? manifest.corpus.corpusFiles : null
  if (listed === null) return null
  return listed.map((f) => ({
    scenario: String(f.scenario),
    receiptsPath: String(f.path || f.receipts || ''),
    bytes: Number.isInteger(f.bytes) ? f.bytes : null,
    sha256: typeof f.sha256 === 'string' ? f.sha256 : null,
  }))
}

/** Absolute path of the layer pointer under `root`. */
export function currentLayerPath(root = DEFAULT_SIM_ROOT) {
  return join(root, CURRENT_LAYER_FILE)
}

/**
 * Read the layer pointer. A missing or unreadable pointer is a NAMED refusal whose message names the file: "I cannot
 * tell which layer is current" is not a pass, and it is not the same answer as "the report names an older layer".
 */
export function readCurrentLayer(root = DEFAULT_SIM_ROOT) {
  const path = currentLayerPath(root)
  if (!existsSync(path)) {
    return { ok: false, path, dir: null, why: 'no layer pointer at ' + path + ' — ' + CURRENT_LAYER_FILE + ' is written by scripts/sim/audit/all.mjs after every run, so without it the gate cannot tell which corpus layer is current' }
  }
  let body = null
  try { body = JSON.parse(readFileSync(path, 'utf8')) } catch { body = null }
  if (body === null || typeof body !== 'object') {
    return { ok: false, path, dir: null, why: 'the layer pointer ' + path + ' is not a readable JSON object' }
  }
  const dir = typeof body.dir === 'string' && body.dir.trim() ? body.dir : null
  if (dir === null) {
    return { ok: false, path, dir: null, why: 'the layer pointer ' + path + ' does not name a corpus layer (dir is missing or empty)' }
  }
  return {
    ok: true,
    path,
    dir,
    corpusId: typeof body.corpusId === 'string' ? body.corpusId : null,
    auditId: typeof body.auditId === 'string' ? body.auditId : null,
    generatedAt: typeof body.generatedAt === 'string' ? body.generatedAt : null,
    at: typeof body.at === 'string' ? body.at : null,
    pid: Number.isInteger(body.pid) ? body.pid : null,
    why: null,
  }
}

/**
 * The round trip: read the layer the report NAMES, then re-read the files the report lists.
 *
 * - no `corpus.dir`  => AUDIT_CORPUS_UNMEASURED (the report never said which layer it measured)
 * - dir is not there => AUDIT_CORPUS_UNMEASURED (why names the path)
 * - `missing`:    a file the report measured is not in the layer (or cannot be read)
 * - `mismatched`: bytes/sha256 no longer equal what the report recorded
 * - `extras`:     a corpus dir the layer holds and the report does not list -- no mtime filter, all of them
 * - `corpusId`:   recomputed from the re-read files, sorted by the one digest implementation
 */
export function resolveReportCorpus(manifest) {
  const claimed = manifest && manifest.corpus && typeof manifest.corpus.corpusId === 'string' ? manifest.corpus.corpusId : null
  const unmeasured = (why, dir = null, via = 'no-dir') => ({ ok: false, code: 'AUDIT_CORPUS_UNMEASURED', dir, corpusId: null, claimedCorpusId: claimed, files: [], missing: [], mismatched: [], extras: [], newestMs: null, via, why })
  const dirValue = manifest && manifest.corpus && typeof manifest.corpus.dir === 'string' && manifest.corpus.dir.trim() ? manifest.corpus.dir : null
  if (dirValue === null) {
    return unmeasured('the report does not name the layer it measured (corpus.dir is absent), so the gate cannot re-read it — a report that cannot say which directory it measured has not measured a corpus')
  }
  const dir = dirValue
  if (!existsSync(dir)) {
    return unmeasured('the layer the report names does not exist: ' + dir + ' — a report about a directory nobody can open is a report about nothing', dir, 'dir-missing')
  }
  const files = corpusFilesIn(dir)
  if (!files.length) {
    return unmeasured('the layer the report names holds no corpus-<scenario>/receipts.jsonl: ' + dir + ' — an empty directory is not the corpus this report measured', dir, 'dir-empty')
  }
  const listed = manifestCorpusFiles(manifest)
  // NO LIST, NO MEASUREMENT. all.mjs always writes `corpusFiles`; a report that does not name the receipts it hashed
  // cannot be re-read, and "the number matches a layer I found on disk" is not a measurement -- a replay of an old
  // stamp would satisfy it forever (audit-r14 A11: a report from 2026-11-01 was READY on a 2026-11-09 tree).
  if (listed === null) {
    return {
      ...unmeasured('the report does not name the files it measured (no corpusFiles list), so the gate cannot re-read them — a report that cannot say which receipts it hashed has not measured a corpus', dir, 'no-list'),
      newestMs: newestMtimeOf(files),
    }
  }
  const onDisk = new Map(files.map((f) => [f.scenario, f]))
  const missing = []
  const mismatched = []
  const reRead = []
  for (const claim of listed) {
    const disk = onDisk.get(claim.scenario)
    if (disk === undefined) {
      missing.push({ scenario: claim.scenario, receiptsPath: claim.receiptsPath, why: 'no corpus-' + claim.scenario + '/receipts.jsonl in the layer the report names ' + dir })
      continue
    }
    if (disk.sha256 === null) {
      missing.push({ scenario: claim.scenario, receiptsPath: disk.receiptsPath, why: 'the receipts file exists but cannot be read' })
      continue
    }
    const bytesAgree = claim.bytes === null || claim.bytes === disk.bytes
    const shaAgree = claim.sha256 === null || claim.sha256 === disk.sha256
    if (!bytesAgree || !shaAgree) mismatched.push({ scenario: claim.scenario, receiptsPath: disk.receiptsPath, claimed: { bytes: claim.bytes, sha256: claim.sha256 }, disk: { bytes: disk.bytes, sha256: disk.sha256 } })
    reRead.push(disk)
  }
  const claimedScenarios = new Set(listed.map((c) => c.scenario))
  const extras = files.filter((f) => !claimedScenarios.has(f.scenario)).map((f) => ({ scenario: f.scenario, receiptsPath: f.receiptsPath }))
  const corpusId = reRead.length ? corpusDigestOf(reRead) : null
  const digestAgrees = Boolean(corpusId && claimed && corpusId === claimed)
  const ok = missing.length === 0 && mismatched.length === 0 && extras.length === 0 && digestAgrees
  const why = ok ? null
    : missing.length ? missing.length + ' file(s) the report measured are not in the layer it names (' + missing[0].scenario + ')'
      : mismatched.length ? mismatched.length + ' file(s) changed after the report was written (' + mismatched[0].scenario + ')'
        : extras.length ? extras.length + ' corpus dir(s) exist in the layer ' + dir + ' but the report does not list them (' + extras.map((e) => e.scenario).slice(0, 5).join(', ') + ') — a report that under-counts the corpus it measured has not measured this layer'
          : 'the re-read digest ' + String(corpusId) + ' differs from the claimed ' + String(claimed)
  return { ok, code: ok ? null : 'AUDIT_CORPUS_STALE', dir, corpusId, claimedCorpusId: claimed, files: reRead, missing, mismatched, extras, newestMs: newestMtimeOf(files), via: 'manifest-list', why }
}

function newestMtimeOf(files) {
  let newestMs = null
  for (const f of files) if (Number.isFinite(f.mtimeMs) && (newestMs === null || f.mtimeMs > newestMs)) newestMs = f.mtimeMs
  return newestMs
}
