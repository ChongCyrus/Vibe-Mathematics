// audit-legacy-path-seam — ONE seam for the five archived presets, enforced instead of remembered.
//
// WHY THIS GATE EXISTS (measured, not theorised): the five legacy presets moved to
// `archive/legacy-presets/` in `5077d8e3` (G4: they no longer ship). Most tests were re-pointed at the
// single seam `tests/_lib/legacy-presets.mjs`, but EIGHT of them kept resolving the preset from the
// repository root. Result: at HEAD `478b342a` a full sweep had SEVEN mutant families and one suite
// (`formal-verify-v4.test.mjs` N6) failing with `ENOENT ...\vibe-math-vN\vibe-math-vN.js` — a gate that
// can never be green is not a gate, and nobody saw it because the failures looked like family-local
// breakage. This test makes that class impossible to reintroduce: no file may name a legacy preset in a
// PATH expression without going through the seam.
//
// SCOPE: `tests/*.mjs` + `scripts/*.mjs` (top level). The seam module itself is exempt.
// It does NOT check that the seam points at the right place (that is the seam's own assertion below), and
// it does NOT check CJS/shell callers (there are none today; a `--self-test` note records this).

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; return true }
  failures.push({ label, detail })
  return false
}

const read = (p) => readFileSync(p, 'utf8')

// ── the detector ────────────────────────────────────────────────────────────────────────────────────────
// A VIOLATION is a PATH EXPRESSION that resolves a legacy preset from the repository root:
//   1. join(REPO, 'vibe-math-v2' …)                     — literal root join
//   2. join(REPO, PRESET, …)                             — root join through a preset constant
//   3. new URL('../vibe-math-v3/…', import.meta.url)     — root-relative URL
//   4. readFileSync('<root>/vibe-math-v5/…')             — a root-relative literal beginning at the repo
// A COMMENT that merely names a file (e.g. `// vibe-math-v3.js:2164`) is NOT a violation, which is why the
// patterns require an actual path construct rather than the bare name.
const LEGACY = 'vibe-math-v(?:2|3|4|5|5r)'
// These three are UNCONDITIONAL: they build a root path, so no later helper can reinterpret them.
const HARD = [
  { kind: 'join(REPO, <legacy literal>)', re: new RegExp(`join\\(\\s*REPO\\s*,\\s*['"\`]${LEGACY}['"\`]`) },
  // ★ `join(REPO, preset.suite)` is NOT this: `preset.suite` is a REPO-RELATIVE suite path (correct), and a
  // property access can never be the preset directory itself. Only the bare identifier is a violation.
  // `(?!\.)` is what keeps `join(REPO, preset.suite)` legal (a property access, never the preset dir).
  { kind: 'join(REPO, PRESET|preset)', re: /join\(\s*REPO\s*,\s*(?:PRESET|preset)\b(?!\.)/ },
  { kind: 'resolve(REPO, <legacy literal>)', re: new RegExp(`resolve\\(\\s*REPO\\s*,\\s*['"\`]${LEGACY}['"\`]`) },
  // ★ The form the first version of this gate MISSED (found by the full T1 sweep): a loop variable.
  // `for (const d of PRESETS) cpSync(join(REPO, d), join(tmp, d))` — the preset name arrives as an
  // identifier, so no literal pattern can see it. Narrow on purpose: only the conventional preset loop
  // variable `d` is flagged, because copying a REAL repo directory by variable (`['scripts','vibe-math-vmu']`)
  // is legitimate and three suites do it. A future loop over presets must not rename its variable to dodge
  // this — the seam is the supported shape, not the regex.
  { kind: 'cpSync(join(REPO, d)) — a preset name as a loop variable', re: /cpSync\(\s*join\(\s*REPO\s*,\s*d\s*[,)]/ },
]
// A root-relative URL is a violation ONLY in a file that does not import the seam: a seam-aware loader
// helper is allowed to take `'../vibe-math-v4/vibe-math-v4.js'` as an ARGUMENT and re-root it itself
// (`tests/verify-fixes.test.mjs` `load()` does exactly that, through `legacyFile()`).
const REL_URL = new RegExp(`['"\`]\\.\\.\\/${LEGACY}\\/`)
const SEAM_IMPORT = /from\s+['"][^'"]*_lib\/legacy-presets\.mjs['"]/

/** Return [{line, kind, text}] for every violation in one source text. */
function violationsIn(text) {
  const out = []
  const seamAware = SEAM_IMPORT.test(text)
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue // comment-only line
    for (const v of HARD) {
      if (v.re.test(line)) out.push({ line: i + 1, kind: v.kind, text: line.trim().slice(0, 160) })
    }
    if (!seamAware && REL_URL.test(line)) out.push({ line: i + 1, kind: "URL('../vibe-math-vN/…') without the seam", text: line.trim().slice(0, 160) })
  }
  return out
}

// ★ SELF-PROOF (audit-scanner-selfproof, round 17): `--self-test` runs the DETECTOR ONLY and exits, so the gate's
// "0 offenders" verdict can be told apart from a predicate that never fires. The negative control is the important
// half: emptying the pattern list and watching the SAME sample stop being flagged proves the earlier hit came from
// the pattern, not from something incidental in the sample text.
if (process.argv.includes('--self-test')) {
  let bad = 0
  const check = (cond, name, detail) => { console.log((cond ? 'PASS ' : 'FAIL - ') + name + (detail === undefined ? '' : ' :: ' + detail)); if (!cond) bad += 1 }
  const flags = (src) => violationsIn(src).length > 0
  const literalJoin = "const src = join(REPO, 'vibe-math-v3', 'vibe-math-v3.js')"
  const seamHelper = 'const src = legacyFile(PRESET, file)'
  check(flags(literalJoin), 'the detector FIRES on a literal root join', literalJoin)
  check(!flags(seamHelper), 'the detector stays SILENT on the seam helper (the fix path is not a violation)', seamHelper)
  const parked = HARD.splice(0, HARD.length)
  try {
    check(!flags(literalJoin), 'NEGATIVE CONTROL: with the pattern list emptied the SAME sample is no longer flagged', literalJoin)
  } finally {
    HARD.push(...parked)
  }
  check(flags(literalJoin), 'the patterns were restored after the negative control (the gate is not left toothless)', literalJoin)
  console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  process.exit(bad === 0 ? 0 : 1)
}

// ── ① the seam itself is where it says it is ────────────────────────────────────────────────────────────
const seamPath = join(HERE, '_lib', 'legacy-presets.mjs')
ok(existsSync(seamPath), 'the seam module exists', seamPath)
const seamSrc = read(seamPath)
ok(/LEGACY_BASE/.test(seamSrc) && /archive\/legacy-presets/.test(seamSrc),
  'the seam default points at the ARCHIVED root, not the repo root',
  'LEGACY_BASE must default to archive/legacy-presets (G4)')
for (const name of ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5', 'vibe-math-v5r']) {
  ok(existsSync(join(REPO, 'archive', 'legacy-presets', name, name + '.js')),
    'the archived preset exists for ' + name,
    join(REPO, 'archive', 'legacy-presets', name, name + '.js'))
}
// ★ the moved-away directory must NOT be at the root (a stale copy would make this gate meaningless).
for (const name of ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5', 'vibe-math-v5r']) {
  ok(!existsSync(join(REPO, name, name + '.js')), 'no legacy preset sits at the repo root: ' + name, 'found ' + name + ' at the root')
}

// ── ② no file resolves a legacy preset from the root ────────────────────────────────────────────────────
const dirs = ['tests', 'scripts']
const offenders = []
let scanned = 0
for (const dir of dirs) {
  const abs = join(REPO, dir)
  if (!existsSync(abs)) continue
  for (const name of readdirSync(abs)) {
    if (!/\.(mjs|js)$/.test(name)) continue
    if (dir === 'tests' && name === '_lib') continue
    if (name === 'audit-legacy-path-seam.test.mjs') continue // this file quotes the patterns on purpose
    const p = join(abs, name)
    if (!statSync(p).isFile()) continue
    scanned++
    for (const v of violationsIn(read(p))) offenders.push({ file: dir + '/' + name, ...v })
  }
}
// ★ non-empty guard BEFORE the real assertion (RULE E: an empty scan must never look like a clean one).
ok(scanned > 200, 'the scan actually read a substantial number of files', 'scanned=' + scanned)
ok(offenders.length === 0, 'no file resolves a legacy preset from the repository root',
  offenders.slice(0, 6).map((o) => o.file + ':' + o.line + ' [' + o.kind + '] ' + o.text).join('\n    ') +
  (offenders.length > 6 ? '\n    …and ' + (offenders.length - 6) + ' more' : ''))

// ── ③ the detector has TEETH (a regex that matches nothing would pass silently) ─────────────────────────
const SAMPLES = [
  ["const src = join(REPO, 'vibe-math-v3', 'vibe-math-v3.js')", true, 'a literal root join'],
  ['const src = join(REPO, PRESET, file)', true, 'a root join through a constant'],
  ['const src = join(REPO, preset || PRESET, file)', true, 'a root join through an either-or constant'],
  ["for (const d of PRESETS) cpSync(join(REPO, d), join(tmp, d))", true, "a repo-root copy of a PRESET whose name is the loop variable d"],
  ["const u = new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url)", true, 'a root-relative URL in a file that does not import the seam'],
  ["const p = resolve(REPO, 'vibe-math-v5r', 'x.js')", true, 'a resolve() root join'],
  ["import { legacyFile } from './_lib/legacy-presets.mjs'\nconst m = await load('../vibe-math-v4/vibe-math-v4.js')", false, 'a root-relative URL handed to a SEAM-AWARE loader — must NOT be flagged'],
  ["const src = legacyFile(PRESET, file)", false, 'the seam helper — must NOT be flagged'],
  ["const dir = legacyDir('vibe-math-v5')", false, 'legacyDir — must NOT be flagged'],
  ["const r = await runAsync(process.execPath, [join(REPO, preset.suite)], { cwd: REPO })", false, 'join(REPO, preset.suite) is a repo-relative SUITE path, not a preset directory'],
  ['// vibe-math-v3.js:2164 is where the slot index comes from', false, 'a comment naming the file — must NOT be flagged'],
  ["const VMU = join(REPO, 'vibe-math-vmu', 'kernel')", false, 'the live framework is NOT a legacy preset'],
]
for (const [src, want, why] of SAMPLES) {
  const got = violationsIn(src).length > 0
  ok(got === want, 'detector: ' + why, 'expected ' + (want ? 'a violation' : 'no violation') + ' for: ' + src)
}

// ── summary ────────────────────────────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error('\nAUDIT LEGACY PATH SEAM: ' + passed + ' passed, ' + failures.length + ' failed')
  for (const f of failures) console.error('  FAIL - ' + f.label + (f.detail ? '\n      ' + f.detail : ''))
  process.exit(1)
}
console.log('=== AUDIT LEGACY PATH SEAM: ' + passed + ' passed, 0 failed ===')
console.log('scanned ' + scanned + ' files; every legacy-preset path goes through tests/_lib/legacy-presets.mjs')
