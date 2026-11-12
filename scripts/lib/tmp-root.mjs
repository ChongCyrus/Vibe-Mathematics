// ── ONE temporary root for the whole gate ──────────────────────────────────────────────────────────
// CI run 43084472078 (head 79368f67) proved the point: eighteen suites went red on a Linux runner for a
// reason that had nothing to do with what they test - they wrote to one drive-letter scratch path that
// only exists on the maintainer's laptop. A judge whose scratch location is a claim about the operator's
// machine is not portable; it is a local script wearing a gate's clothes.
//
// `scripts/**` is migrated: every scratch path there comes from THIS module. `tests/**` is NOT finished —
// 21 test files still hardcode a drive-letter path (TB-2758); do not restate this claim as done until that
// closes. The default is derived from `os.tmpdir()`, which is whatever the host says it is; `VMU_TMP_ROOT`
// overrides it (for a known disk or a shared worktree), and a relative override is refused by name instead of
// being silently resolved against the cwd - because "somewhere under here" is how a scratch write lands in the
// repository.
import { isAbsolute, join, resolve } from 'node:path'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

/** The single root every scratch write goes under. Absolute, never the cwd, overridable by the host. */
export function tmpRoot() {
  const raw = process.env.VMU_TMP_ROOT
  if (raw === undefined || String(raw).trim() === '') return join(tmpdir(), 'vmu-gate')
  const value = String(raw).trim()
  if (!isAbsolute(value)) {
    const problem = new Error('VMU_TMP_ROOT must be an ABSOLUTE path, got: ' + value
      + ' — a relative scratch root resolves against whatever cwd the caller happened to have, which is how a'
      + ' scratch write lands inside the repository; pass an absolute directory or unset it and take the default'
      + ' (' + join(tmpdir(), 'vmu-gate') + ')')
    problem.code = 'VMU_TMP_ROOT_NOT_ABSOLUTE'
    throw problem
  }
  return resolve(value)
}

/** A fresh unique directory under the root, created eagerly. Callers own it and may delete it. */
export function scratchDir(prefix = 'scratch-') {
  const root = tmpRoot()
  mkdirSync(root, { recursive: true })
  return mkdtempSync(join(root, prefix))
}

/** A named directory under the root, created if missing. Stable across calls with the same relative path. */
export function ensureScratch(relative) {
  const seg = String(relative === undefined || relative === null ? '' : relative).replace(/^[\\/]+/, '')
  if (seg === '') return tmpRoot()
  const target = join(tmpRoot(), seg)
  mkdirSync(target, { recursive: true })
  return target
}

/** What the ruler is, in one line, for a receipt or a log - a reader must be able to tell where it wrote. */
export function describeTmpRoot() {
  return 'temp root=' + tmpRoot() + (process.env.VMU_TMP_ROOT ? ' (VMU_TMP_ROOT)' : ' (os.tmpdir()-derived default)')
}
