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
// WHAT IT DOES NOT DO: it does not recompute the right number (that is `generate-kernel-index.mjs --check`'s job, and the answer is
// meant to live in `docs/02`, not here). It does not police other kinds of counts. It is a drift tripwire, not a generator.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ★ fileURLToPath, NOT .pathname: .pathname is PERCENT-ENCODED, so a repo path with Chinese in it came back as %E5%BC%80...
// and readdirSync threw ENOENT on a directory that exists. Measured while writing this gate.
const REPO = fileURLToPath(new URL('..', import.meta.url))
const LANDED = join(REPO, 'docs-landed')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

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

const files = readdirSync(LANDED).filter((f) => f.endsWith('.md'))
ok(files.length > 0,
  '★ docs-landed really holds markdown files (otherwise the scan below is vacuous)', { files: files.length })

const offenders = []
let scanned = 0
for (const f of files) {
  const lines = readFileSync(join(LANDED, f), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!COUNT_PATTERNS.some((re) => re.test(line))) continue
    scanned++
    if (TIME_QUALIFIERS.some((q) => line.includes(q))) continue
    // ★ A LINE THAT NAMES THE DERIVING COMMAND IS SELF-EVIDENTLY LIVE, not a snapshot claim. §4.1 legitimately says "当前派生读数是
    // 104 个模块（node scripts/generate-kernel-index.mjs --check）" to explain the drift - forbidding that would force the document to
    // describe the drift without being allowed to name the number it is drifting from. Measured while writing this gate: the first
    // version flagged exactly that line. A rule that fires on the correct sentence is noise (§红线套错层), so this exemption is
    // narrow and named rather than the gate being loosened generally.
    if (line.includes('generate-kernel-index.mjs')) continue
    offenders.push(f + ':' + (i + 1) + '  ' + line.trim().slice(0, 110))
  }
}
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
ok(readme.includes('generate-kernel-index.mjs'),
  '★ and names the command that derives the current module count, so a reader can check it instead of trusting the table',
  { has: readme.includes('generate-kernel-index.mjs') })

console.log('=== DOCS-LANDED COUNTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error('  - ' + f)
}
process.exit(failed ? 1 : 0)
