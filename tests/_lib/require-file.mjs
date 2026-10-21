// tests/_lib/require-file.mjs — READING A FILE THAT MUST BE THERE.
//
// WHY THIS EXISTS (G4 pre-work). The legacy preset folders (vibe-math-v2 … vibe-math-v5r) are about to be archived.
// The dangerous pattern found by the reconnaissance is
//
//     existsSync(p) ? readFileSync(p, 'utf8') : ''      // ...or `: null`, `: []`, `|| ''`
//
// After the move such a suite does NOT go red: it quietly compares against an EMPTY string and keeps passing, so the
// coverage silently weakens. A red would be visible; this is worse. Every such site must therefore either
//   (a) use `requireFile()` — "this file MUST exist" ⇒ a NAMED refusal that says which file, why it must exist, and
//       that the legacy presets may have been archived; or
//   (b) be declared LEGITIMATELY OPTIONAL in the OPTIONAL table of tests/audit-no-silent-reads.test.mjs (with the
//       reason), which is also how this gate counts "how many such sites remain".
//
// HOW TO USE
//   import { requireFile } from './_lib/require-file.mjs'
//   const src = requireFile(legacyFile('vibe-math-v5r', 'vibe-math-v5r.js'), 'the v5r baseline for the parity suite')
//
// The message is deliberately actionable: file, why, and the archive hint.
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const ARCHIVE_HINT = '（归档提示：若旧 preset 已归档，指向归档根目录或随套件一起移动）'

/** Read a file that MUST exist. Throws a named, actionable error instead of degrading to ''. */
export function requireFile(path, why) {
  if (!existsSync(path)) {
    throw new Error('REQUIRED FILE MISSING: ' + path + ' — ' + (why || 'a suite reads it and needs its content')
      + ARCHIVE_HINT)
  }
  return readFileSync(path, 'utf8')
}

/** List a directory that MUST exist (same rule as requireFile; a silent `[]` hides a moved/renamed directory). */
export function requireDir(path, why) {
  if (!existsSync(path)) {
    throw new Error('REQUIRED DIRECTORY MISSING: ' + path + ' — ' + (why || 'a suite enumerates it') + ARCHIVE_HINT)
  }
  return readdirSync(path)
}
