// scripts/sim/audit/corpus-files.mjs — ONE ruler for "which receipts files did this audit measure".
//
// The audit (all.mjs) and the release gate (release-ready.mjs) used to enumerate and hash the corpus with two
// separate loops. They disagreed on the layer (the gate scanned only CHILD directories of the sim root while the
// audit writes D:/_tmp/sim/corpus-<scenario> INTO the root) and the gate therefore re-hashed a stale `--out`
// directory from an earlier run: `AUDIT_CORPUS_STALE` on a tree that was actually clean. Two rulers, one
// measurement. This file is now the only implementation of both halves:
//
//   - enumeration: a LAYER is a directory that holds `corpus-<scenario>/receipts.jsonl` entries. The sim root itself
//     is a layer (the audit's default layout), and every first-level child directory of the root is a candidate
//     layer (a test or a manual `--out=<dir>` run). The newest layer is the one whose newest receipts mtime is
//     greatest; the report says which layer the gate will pick and why.
//   - digest: sha256 over `scenario + ' ' + sha256(receipts bytes) + '\n'`, sorted by scenario INSIDE this function,
//     so neither caller can accidentally fix a different order.
//
// `resolveReportCorpus` is the round trip the gate performs: pick the layer, keep the files the report's manifest
// names, re-read their bytes, and report { missing, mismatched, extras } separately. `extras` are corpus dirs whose
// receipts are NEWER than the report's generatedAt: those appeared after the audit ran and were never measured,
// which is stale by definition. Older foreign corpora (reference runs under the same root) predate the audit and
// were never its corpus, so ignoring them is not a leniency — counting them would be the bug this file fixes.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const NL = String.fromCharCode(10)

/**
 * The dev sim root, used only when a caller omits the root (the fixture builders import the gate module and call
 * `newestCorpusDir()` with no argument). It is a data location, not an execution path: every caller that touches a
 * real corpus passes an explicit root or `--out`, and `VMU_SIM_ROOT` overrides it. A missing root yields "nothing to
 * re-measure" (a named refusal), never an empty digest.
 */
export const DEFAULT_SIM_ROOT = process.env.VMU_SIM_ROOT || 'D:/_tmp/sim' // PORTABLE-ALLOW: dev corpus root for callers that omit one; overridable with VMU_SIM_ROOT, and a missing root is a named AUDIT_CORPUS_UNMEASURED refusal, never a skip

/** sha256 of a buffer, as a hex string (no prefix). One helper so the digest cannot be spelled two ways. */
export function sha256Hex(body) {
  return createHash('sha256').update(body).digest('hex')
}

/**
 * Every `corpus-<scenario>/receipts.jsonl` directly under `dir`, with its bytes and sha256 read ONCE here. Sorted by
 * scenario. A file that cannot be read keeps `bytes:null, sha256:null` so the caller can refuse by name instead of
 * hashing an empty buffer and calling it a corpus.
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

/**
 * Candidate layers under `root`: the root itself, plus every first-level child directory. Each layer's files are
 * enumerated by the same `corpusFilesIn` the audit uses. Returns layers with files, sorted by newest receipt mtime
 * (deterministic: ties break on the directory path).
 */
export function corpusLayers(root = DEFAULT_SIM_ROOT) {
  if (!root || !existsSync(root)) return []
  const dirs = [root]
  let entries = []
  try { entries = readdirSync(root) } catch { entries = [] }
  for (const name of entries) {
    const dir = join(root, name)
    try { if (!statSync(dir).isDirectory()) continue } catch { continue }
    dirs.push(dir)
  }
  const layers = []
  for (const dir of dirs) {
    const files = corpusFilesIn(dir)
    if (!files.length) continue
    let newestMs = 0
    for (const f of files) if (Number.isFinite(f.mtimeMs) && f.mtimeMs > newestMs) newestMs = f.mtimeMs
    layers.push({ dir, files, newestMs, via: dir === root ? 'the sim root itself (all.mjs default layout: <root>/corpus-<scenario>)' : 'a first-level directory under the sim root (a test/manual --out=<dir> audit)' })
  }
  layers.sort((a, b) => (b.newestMs - a.newestMs) || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0))
  return layers
}

/**
 * The newest layer under `root` that contains at least one corpus receipts file. Returns the layer plus the rule
 * that chose it, so a report can say "the gate will pick THIS layer, because its newest receipt is the newest".
 */
export function newestCorpusDir(root = DEFAULT_SIM_ROOT) {
  const layers = corpusLayers(root)
  if (!layers.length) {
    return { ok: false, dir: null, files: [], newestMs: null, layers: [], rule: 'no layer under ' + root + ' contains corpus-<scenario>/receipts.jsonl', why: 'no corpus-*/receipts.jsonl under ' + root + ' — nothing to re-measure' }
  }
  const best = layers[0]
  return { ok: true, dir: best.dir, files: best.files, newestMs: best.newestMs, layers, rule: 'the layer whose newest corpus-<scenario>/receipts.jsonl mtime is greatest — ' + best.via, why: null }
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

/**
 * The round trip: pick the layer, then re-read the files the report names.
 *
 * - `missing`: a file the report measured is gone (or its scenario is absent from the chosen layer)
 * - `mismatched`: bytes/sha256 no longer equal what the report recorded, or the re-read digest differs
 * - `extras`: corpus dirs in the chosen layer whose receipts appeared AFTER `generatedAt` — never measured
 * - `corpusId`: recomputed from the re-read files, sorted by the one digest implementation
 */
export function resolveReportCorpus(root = DEFAULT_SIM_ROOT, manifest) {
  const layer = newestCorpusDir(root)
  if (!layer.ok) return { ok: false, code: 'AUDIT_CORPUS_UNMEASURED', dir: null, corpusId: null, files: [], missing: [], mismatched: [], extras: [], layer, why: layer.why }
  const generatedAtMs = Date.parse(String(manifest && manifest.generatedAt))
  const listed = manifestCorpusFiles(manifest)
  const claimed = manifest && manifest.corpus && typeof manifest.corpus.corpusId === 'string' ? manifest.corpus.corpusId : null
  // NO LIST, NO MEASUREMENT. all.mjs always writes `corpusFiles`; a report that does not name the receipts it hashed
  // cannot be re-read, and "the number matches a layer I found on disk" is not a measurement -- a replay of an old
  // stamp would satisfy it forever (audit-r14 A11: a report from 2026-11-01 was READY on a 2026-11-09 tree). The only
  // honest answer is a named refusal, so this branch has no compatibility path.
  if (listed === null) {
    return {
      ok: false,
      code: 'AUDIT_CORPUS_UNMEASURED',
      dir: layer.dir,
      rule: layer.rule,
      newestMs: layer.newestMs,
      corpusId: null,
      claimedCorpusId: claimed,
      files: [],
      missing: [],
      mismatched: [],
      extras: [],
      layer,
      via: 'no-list',
      why: 'the report does not name the files it measured (no corpusFiles list), so the gate cannot re-read them — a report that cannot say which receipts it hashed has not measured a corpus',
    }
  }
  const onDisk = new Map(layer.files.map((f) => [f.scenario, f]))
  const chosen = listed
  const missing = []
  const mismatched = []
  const reRead = []
  for (const claim of chosen) {
    const disk = onDisk.get(claim.scenario)
    if (disk === undefined) { missing.push({ scenario: claim.scenario, receiptsPath: claim.receiptsPath, why: 'no corpus-' + claim.scenario + '/receipts.jsonl in the chosen layer ' + layer.dir }); continue }
    if (disk.sha256 === null) { missing.push({ scenario: claim.scenario, receiptsPath: disk.receiptsPath, why: 'the receipts file exists but cannot be read' }); continue }
    const bytesAgree = claim.bytes === null || claim.bytes === disk.bytes
    const shaAgree = claim.sha256 === null || claim.sha256 === disk.sha256
    if (!bytesAgree || !shaAgree) mismatched.push({ scenario: claim.scenario, receiptsPath: disk.receiptsPath, claimed: { bytes: claim.bytes, sha256: claim.sha256 }, disk: { bytes: disk.bytes, sha256: disk.sha256 } })
    reRead.push(disk)
  }
  const extras = Number.isFinite(generatedAtMs)
    ? layer.files.filter((f) => !chosen.some((c) => c.scenario === f.scenario) && Number.isFinite(f.mtimeMs) && f.mtimeMs > generatedAtMs).map((f) => ({ scenario: f.scenario, receiptsPath: f.receiptsPath, mtimeMs: f.mtimeMs }))
    : []
  const corpusId = reRead.length ? corpusDigestOf(reRead) : null
  const digestAgrees = Boolean(corpusId && claimed && corpusId === claimed)
  const ok = missing.length === 0 && mismatched.length === 0 && extras.length === 0 && digestAgrees
  const why = ok ? null
    : missing.length ? missing.length + ' file(s) the report measured are not in the chosen layer (' + missing[0].scenario + ')'
      : mismatched.length ? mismatched.length + ' file(s) changed after the report was written (' + mismatched[0].scenario + ')'
        : extras.length ? extras.length + ' corpus dir(s) appeared after the report was written (' + extras[0].scenario + ')'
          : 'the re-read digest ' + String(corpusId) + ' differs from the claimed ' + String(claimed)
  return { ok, code: ok ? null : 'AUDIT_CORPUS_STALE', dir: layer.dir, rule: layer.rule, newestMs: layer.newestMs, corpusId, claimedCorpusId: claimed, files: reRead, missing, mismatched, extras, layer, via: 'manifest-list', why }
}
