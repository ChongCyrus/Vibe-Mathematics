// tests/_lib/scratch.mjs — the TEST side of the one scratch root.
//
// `scripts/lib/tmp-root.mjs` owns the root itself; this file only adds the two shapes the test suites need:
// a throwaway directory per case, and the place where captured corpora are looked for. Both are derived from
// the HOST, because the Linux reds of CI run 43084472078 were exactly this: a judge that said `D:/_tmp/...`
// was asking the runner about the maintainer's laptop.
import { tmpdir } from 'node:os'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join, isAbsolute, resolve } from 'node:path'
import { tmpRoot, scratchDir } from '../../scripts/lib/tmp-root.mjs'

export { tmpRoot, scratchDir }

/** A fresh unique directory under the scratch root. Callers own it and delete it. */
export function mkScratch(prefix = 'case-') {
  return scratchDir(prefix)
}

/** A path under the scratch root, with the directory created. Stable for repeated calls with one name. */
export function scratchPath(...parts) {
  const rel = parts.filter((p) => p !== undefined && p !== null && String(p) !== '')
  if (rel.length === 0) return tmpRoot()
  const target = join(tmpRoot(), ...rel.map(String))
  mkdirSync(target, { recursive: true })
  return target
}

/** Where captured real-run corpora live: `VMU_CORPUS_ROOT`, else `<scratch root>/sim`. Absolute, or refused. */
export function corpusRoot() {
  const raw = process.env.VMU_CORPUS_ROOT
  if (raw === undefined || String(raw).trim() === '') return join(tmpRoot(), 'sim')
  const value = String(raw).trim()
  if (!isAbsolute(value)) {
    const e = new Error('VMU_CORPUS_ROOT must be an ABSOLUTE path, got: ' + value
      + ' — a relative corpus root resolves against whatever cwd the case happened to have')
    e.code = 'VMU_CORPUS_ROOT_NOT_ABSOLUTE'
    throw e
  }
  return resolve(value)
}

/** A file inside the corpus root (not created — a missing corpus must stay a FAILURE, never a skip). */
export function corpusPath(...parts) {
  return join(corpusRoot(), ...parts.map(String))
}

/** One line a receipt can print, so a reader can tell where a case wrote. */
export function describeScratch() {
  return 'scratch root=' + tmpRoot() + ' · corpus root=' + corpusRoot()
    + ' (host-derived; VMU_TMP_ROOT / VMU_CORPUS_ROOT override)'
}

void tmpdir // documents that the default comes from the host, even though tmp-root.mjs performs the join
