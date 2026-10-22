// tests/audit-docs-landed-counts.test.mjs — `docs-landed` may state a count, but never a count that pretends to be current.
//
// WHY THIS EXISTS (goal 7 of this phase). `docs-landed/00-README.md` §4.1 said "103/103 个 kernel 文件【全部】有人工审查或宣称级验证",
// while the derived number was already 104 modules - so the word "全部" was no longer supported by the table underneath it. The prose
// was fixed (the section is now titled "定稿时文件级 100%" and explains the 104-vs-103 drift explicitly). What was NOT fixed is the
// class: a snapshot document that hand-copies a derived number will drift again the next time the kernel grows, and nothing would
// catch it. This gate is the smallest thing that catches it.
//
// THE RULE: in `docs-landed`, a line that states a KERNEL-MODULE count (a bare `N/M` or "M 个 kernel 文件" / "M 个模块") must carry a
// TIME QUALIFIER on the same line - the document is a SNAPSHOT ("定稿时", "at freeze", "when this was written"), and a snapshot may
// only state a number that is explicitly anchored to its moment. `vibe-math-vmu/docs/` (the live authority) is deliberately NOT
// covered: there the numbers are supposed to track the code.
//
// A LINE THAT NAMES THE DERIVING COMMAND IS SELF-EVIDENTLY LIVE and is exempt: §4.1 legitimately says "当前派生读数是 104 个模块
// （node scripts/generate-kernel-index.mjs --check）" to explain the drift, and forbidding that would force the document to describe
// the drift without being allowed to name the number it drifts from. Measured while writing this: the first version flagged exactly
// that correct sentence. A rule that fires on the correct sentence is noise (AGENTS.md §7.1).
//
// `--selftest` is REQUIRED here by tests/audit-scanner-selfproof.test.mjs (AGENTS.md §7.2: "a scanner can silently pass") and it
// caught this file missing it. The selftest drives the SAME detector over synthetic fixtures and proves it fires on a bad line,
// stays quiet on a qualified one, and keeps the deriving-command exemption narrow - otherwise this gate could be scanning nothing
// and reporting a comfortable zero.
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const SELFTEST = process.argv.includes('--selftest')
// ★ fileURLToPath, NOT .pathname: .pathname is PERCENT-ENCODED, so a repo path with Chinese in it came back as %E5%BC%80...
// and readdirSync threw ENOENT on a directory that exists. Measured while writing this gate.
const REPO = fileURLToPath(new URL('..', import.meta.url))

// A kernel-module count is a number that talks about kernel files/modules. Deliberately NARROW: a bare "103/103" with no noun is not
// matched, because §4.1's own table uses `88/103` inside a row whose header already says what is being counted - and a gate that
// fires on every fraction would be noise, which this repo has already paid for once (AGENTS.md §7.1: a rule on the wrong layer is
// noise, not rigour).
const COUNT_PATTERNS = [
  /\d+\s*\/\s*\d+\s*个\s*kernel\s*文件/i,
  /\d+\s*个\s*kernel\s*文件/i,
  /\d+\s*个\s*模块/,
]
const TIME_QUALIFIERS = ['定稿时', '定稿于', 'at freeze', 'when this was written', '写作时', '快照时']
const DERIVING_COMMAND = 'generate-kernel-index.mjs'

/** Does this line count as a kernel-module count at all? (the non-vacuity probe) */
const matches = (line) => COUNT_PATTERNS.some((re) => re.test(line))
/** Is this line a violation? Pure, so the selftest can drive it directly. */
const violates = (line) => {
  if (!matches(line)) return false
  if (TIME_QUALIFIERS.some((q) => line.includes(q))) return false
  if (line.includes(DERIVING_COMMAND)) return false
  return true
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/** Scan one directory of markdown; returns { files, scanned, offenders }. */
const scanDir = (dir) => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  let scanned = 0
  const offenders = []
  for (const f of files) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (!matches(lines[i])) continue
      scanned++
      if (violates(lines[i])) offenders.push(f + ':' + (i + 1) + '  ' + lines[i].trim().slice(0, 110))
    }
  }
  return { files, scanned, offenders }
}

if (SELFTEST) {
  console.log('=== SELFTEST: the detector must FIRE on a bad line and stay quiet on a good one ===')
  // ★ POSITIVE + NEGATIVE on the SAME sentence, differing only by the qualifier.
  ok(violates('★★ 104 个模块都有审查') === true && violates('★★ 定稿时 104 个模块都有审查') === false,
    '★ an unqualified "104 个模块" IS a violation, and the SAME sentence with 「定稿时」 is not',
    { unqualified: violates('★★ 104 个模块都有审查'), qualified: violates('★★ 定稿时 104 个模块都有审查') })
  // ★ THE EXEMPTION IS NARROW.
  ok(violates('当前 104 个模块（node scripts/generate-kernel-index.mjs --check）') === false && violates('104 个模块') === true,
    '★ naming the deriving command exempts THAT line, and the very next unqualified line is still a violation',
    { exempt: violates('当前 104 个模块（' + DERIVING_COMMAND + ' --check）'), stillBad: violates('104 个模块') })
  // ★ NEGATIVE: ordinary prose / bare fractions are not matched at all.
  ok(matches('通过率 12/15') === false && matches('88/103') === false,
    '★ a bare fraction with no kernel noun is NOT matched (otherwise §4.1\'s own table rows would be flagged)',
    { pct: matches('通过率 12/15'), bare: matches('88/103') })
  ok(matches('定稿时 103/103 个 kernel 文件') === true,
    '★ a kernel-file fraction IS matched (the patterns can still see the real sentences)', {})
  // ★ THE SCANNER ITSELF over a synthetic directory: one bad line ⇒ exactly one offender; qualified ⇒ zero.
  const dir = mkdtempSync(join(tmpdir(), 'docs-landed-counts-selftest-'))
  try {
    writeFileSync(join(dir, 'bad.md'), '# t\n\n本所当前 104 个模块都审查过了。\n', 'utf8')
    const bad = scanDir(dir)
    ok(bad.scanned === 1 && bad.offenders.length === 1,
      '★ a synthetic docs dir with ONE unqualified count yields exactly ONE offender (the scan really runs)', bad)
    writeFileSync(join(dir, 'bad.md'), '# t\n\n★ 定稿时 103 个 kernel 文件全部有人看过。\n', 'utf8')
    const good = scanDir(dir)
    ok(good.scanned === 1 && good.offenders.length === 0,
      '★ the same dir with a qualified line yields the SAME match count and ZERO offenders', good)
  } finally {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* best effort on Windows */ }
  }
  console.log('=== DOCS-LANDED COUNTS SELFTEST: ' + passed + ' passed, ' + failed + ' failed ===')
  if (failed) { console.error('\nFAILURES:'); for (const f of failures) console.error('  - ' + f) }
  process.exit(failed ? 1 : 0)
}

const LANDED = join(REPO, 'docs-landed')
const { files, scanned, offenders } = scanDir(LANDED)

ok(files.length > 0,
  '★ docs-landed really holds markdown files (otherwise the scan below is vacuous)', { files: files.length })

// ★ NON-VACUITY: the gate is only meaningful if it actually MATCHED something. If the patterns stop matching (a heading rewording,
// a language switch), this assertion fails and says so, instead of reporting a comfortable zero.
ok(scanned > 0,
  '★ the scan MATCHED at least one kernel-module count (a zero here would mean the patterns are wrong, not that the docs are clean)',
  { matchedLines: scanned })

ok(offenders.length === 0,
  '★★ every kernel-module count in docs-landed carries a TIME QUALIFIER on the same line - a snapshot may state a number only when it says WHEN',
  offenders.slice(0, 5))

// and the pointer back to the live authority must be present: a snapshot that does not say where "today" lives is a dead end
const readme = readFileSync(join(LANDED, '00-README.md'), 'utf8')
ok(readme.includes('vibe-math-vmu/docs'),
  '★★ the README points back at vibe-math-vmu/docs for the CURRENT numbers (a snapshot must name the live authority)',
  { has: readme.includes('vibe-math-vmu/docs') })
ok(readme.includes(DERIVING_COMMAND),
  '★ and names the command that derives the current module count, so a reader can check it instead of trusting the table',
  { has: readme.includes(DERIVING_COMMAND) })

console.log('=== DOCS-LANDED COUNTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error('  - ' + f)
}
process.exit(failed ? 1 : 0)
