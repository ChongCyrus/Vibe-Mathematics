// tests/_lib/corpus.mjs — the ONE way a test names a real corpus (TB-2681 P3 / TB-2677 portability).
//
// WHY THIS EXISTS (measured false green, 2026-11-09): three sim suites guarded their corpus-dependent sections with
// `if (!hasRich()) return skip(...)` and `console.log("SKIP ...")`. The corpora live under `D:/_tmp`, which a 3-hour
// cleaner deletes. After the cleaner ran, those suites printed SKIP and exited 0 — the gate said "green" because the
// MEASUREMENT DID NOT HAPPEN. A missing input is not a passing test: it is the strongest possible red, because the only
// honest reading of "no corpus" is "this suite has nothing to say today".
//
// So this module has exactly one failure mode: throw. It never returns null, never lets a caller skip, never logs and
// exits 0. A suite that calls `requireCorpusDir` either gets a directory it can measure, or the run is red with the
// path in the message.
//
// The path is DERIVED, not written down: the repo is found from this file (`tests/_lib/` -> two levels up), and the
// corpus root defaults to `<drive>/_tmp/sim` on the repo drive — the location `scripts/sim/run.mjs` writes to. Another
// machine or CI overrides it with `VMU_CORPUS_ROOT` (or the older `VMU_CORPUS_DIR` alias). No absolute
// `D:/wd/...` path appears in a test any more.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { parse, resolve } from 'node:path'
// The checkout root has ONE derivation (tests/_lib/repo-root.mjs, TB-2709): two copies of the same `../..` would
// drift, and a drifted copy is exactly how a suite ends up measuring a different tree than the one it lives in.
import { REPO } from './repo-root.mjs'

import { tmpRoot as __tmpRoot } from './scratch.mjs'
export { REPO }

export function corpusRoot() {
  const declared = process.env.VMU_CORPUS_ROOT || process.env.VMU_CORPUS_DIR
  if (declared && String(declared).trim() !== '') return resolve(String(declared).trim())
  // Windows drive of the checkout, then `/_tmp/sim`: on this tree that is exactly `${__tmpRoot()}/sim`, and on another
  // checkout of the same drive it is still the same directory the runner writes by default.
  return resolve(parse(REPO).root, '_tmp', 'sim')
}

const MISSING_CLAUSE = ' — this suite MEASURES the real corpus; without it the measurement did not happen, so it must not pass'
const BUILD_HINT = ' (rebuild it: node scripts/sim/run.mjs --scenario end-to-end --out <dir>, or set VMU_CORPUS_ROOT)'

const fail = (message) => {
  const error = new Error(message)
  error.code = 'CORPUS_MISSING'
  throw error
}

// A corpus DIRECTORY: it must exist and hold at least one file a reader can measure. `name` is a path under the corpus
// root ('e2e', 'compare', 'matrix'), so no caller has to know where the root is.
export function requireCorpusDir(name) {
  const dir = resolve(corpusRoot(), String(name))
  if (!existsSync(dir) || !statSync(dir).isDirectory()) fail('CORPUS MISSING: ' + dir + MISSING_CLAUSE + BUILD_HINT)
  const keyFiles = ['manifest.json', 'receipts.jsonl', 'diff.json']
  if (!keyFiles.some((file) => existsSync(resolve(dir, file)))) {
    fail('CORPUS MISSING: ' + dir + ' exists but holds none of ' + keyFiles.join(' / ') + MISSING_CLAUSE + BUILD_HINT)
  }
  return dir
}

// A corpus FILE: same rule. Callers pass a path under the corpus root ('compare/real-fields.jsonl').
export function requireCorpusFile(name) {
  const file = resolve(corpusRoot(), String(name))
  if (!existsSync(file) || !statSync(file).isFile()) fail('CORPUS MISSING: ' + file + MISSING_CLAUSE + BUILD_HINT)
  return file
}

// The generation stamp of a corpus, for suites that compare receipts against prompts: when the two halves come from
// different runs, the comparison is about the runner's write order, not the code. A corpus without a stamp is not
// comparable either — `scripts/sim/run.mjs` writes `generatedAt` / `promptsSha256` / `files{}` on every run now.
export function corpusStampOf(dir) {
  const manifestPath = resolve(String(dir), 'manifest.json')
  if (!existsSync(manifestPath)) {
    fail('CORPUS UNSTAMPED: ' + manifestPath + ' is absent, so the corpus cannot prove which generation its files belong to' + MISSING_CLAUSE + BUILD_HINT)
  }
  let manifest = null
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (e) {
    fail('CORPUS UNSTAMPED: ' + manifestPath + ' is not readable JSON (' + String((e && e.message) || e).slice(0, 160) + ')' + MISSING_CLAUSE + BUILD_HINT)
  }
  if (!manifest.files || !manifest.files.prompts || !manifest.files.receipts) {
    fail('CORPUS UNSTAMPED: ' + manifestPath + ' predates the generation stamp (no files{receipts,pairs,prompts})' + MISSING_CLAUSE + BUILD_HINT)
  }
  return {
    dir: resolve(String(dir)),
    generatedAt: manifest.generatedAt || null,
    promptsSha256: manifest.promptsSha256 || manifest.files.prompts.sha256 || null,
    receipts: manifest.files.receipts,
    pairs: manifest.files.pairs || null,
    prompts: manifest.files.prompts,
  }
}
