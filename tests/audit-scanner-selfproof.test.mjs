// audit-scanner-selfproof — ★ EVERY SCAN THAT REPORTS "0 FINDINGS" MUST BE ABLE TO PROVE IT CAN FIND SOMETHING.
//
// WHY THIS EXISTS. The repository paid for this lesson three times (AGENTS.md §7.2): a filter written with forward
// slashes while Windows paths use backslashes (matched nothing, reported nothing); a rule requiring QUOTED keys
// (missed every `{{ setting: … }}` read); a filter collecting only `.js` (skipped every test, which is `.test.mjs`).
// In all three the gate went green because its PREDICATE never matched, not because the code was clean. Phase 11
// measured the state: of the scanner-style gates, 54 carry a selftest or a sibling mutants file and 67 carry
// neither, so for those a "0 findings" verdict cannot be distinguished from a matcher that never fired.
//
// WHAT THIS GATE DOES, AND WHAT IT REFUSES TO DO. It does NOT pretend the 67 are fixed. It makes them NAMED and
// stops the debt from growing: every `audit-*` must be SELF-PROVEN (detected) or listed in UNPROVEN below. A NEW
// scanner without a self-proof is RED. A listed file that has SINCE gained one is also RED, because a backlog row
// must be deleted in the same change that fixes it — a stale exemption is a lie about the gate's state.
//
// WHAT IT CANNOT DO: it cannot tell whether an UNPROVEN entry is harmless. Many are direct behaviour assertions —
// they call a function and assert the result, so breaking the function reddens them and a self-proof is
// meaningless. Others really are scans. Distinguishing those needs a human per file, which is exactly why the set
// is written down instead of being hidden behind a green light.
//
// ★ AND ONE LIMITATION THIS GATE CANNOT CLOSE, STATED RATHER THAN DISCOVERED LATER: the detection is TEXTUAL, so a
// file that merely CONTAINS a `--selftest` string literal in a fixture - this gate does, in the tree its own
// `--selftest` builds - reads as proven even if its guard were deleted. Proving a self-test really exists means
// RUNNING it, and running all of them here would double the gate's cost for every suite run. So the durable proof for
// any single file is `node tests/<file> --selftest` exiting 0, and this gate's job is narrower on purpose: catch a
// NEW scanner that ships with no self-proof at all, and stop a stale exemption from lying.
//// MODES: no argument runs the gate; `--list` prints the classification; `--selftest` proves the gate can go RED by
// running the same classifier over a temporary tree built to violate each rule.

import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { stripComments } from './_lib/strip-comments.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TESTS = join(REPO, 'tests')

// ★ THE NAMED DEBT. Each entry is a gate whose "0 findings" cannot currently be told apart from a dead predicate.
// Deleting an entry is REQUIRED when the file gains a self-proof; adding one requires saying, in the commit, why a
// new scanner may ship without proof.
const UNPROVEN = new Set([
  'audit-bus-emit-shape.test', 'audit-claim-traceability.test', 'audit-code-size.test', 'audit-code-status.test',
  'audit-corrupt-file-guard.test', 'audit-dependency-cycles.test', 'audit-diagram-assets.test',
  'audit-doc-api-coverage.test', 'audit-doc-index.test', 'audit-doc-line-refs.test', 'audit-doc-vs-code-tables.test',
  'audit-enforced-consistency.test', 'audit-engine-faces', 'audit-enum-branches', 'audit-f1-compact-fix.test',
  'audit-f2-filter-fix.test', 'audit-face-publication.test', 'audit-formal-sensitivity', 'audit-fs-purpose.test',
  'audit-fuzz-helpers', 'audit-hook-coverage.test', 'audit-installer-compat.test', 'audit-installer-policy.test',
  'audit-kernel-claims-2', 'audit-kernel-index.test', 'audit-market-metadata.test',
  'audit-math-computation-sensitivity', 'audit-module-coverage.test', 'audit-no-silent-reads.test',
  'audit-pack-face.test', 'audit-pack-json.test', 'audit-participant-set-parity', 'audit-path-consistency.test',
  'audit-persona-sensitivity', 'audit-planned-names.test', 'audit-planned-tools-inventory.test',
  'audit-policy-defaults.test', 'audit-preset-declaration-group.test', 'audit-preset-mechanism.test',
  'audit-preset-overlay-merge.test', 'audit-preset-rows.test', 'audit-prompt-invariants',
  'audit-readme-bilingual.test', 'audit-refusal-regressions.test', 'audit-registration',
  'audit-round1-regressions.test', 'audit-round6-persistence.test', 'audit-roundtrip-idempotence',
  'audit-scope-classification.test', 'audit-seam-reachability.test', 'audit-service-coverage.test',
  'audit-settings-channels.test', 'audit-settings-roundtrip.test', 'audit-shared-module-parity.test',
  'audit-spec-traceability', 'audit-stale-markers.test', 'audit-surface-index.test', 'audit-table-integrity.test',
  'audit-tool-exec', 'audit-tool-table.test', 'audit-v3-registration-parity', 'audit-v5-integrity',
  'audit-v5-sensitivity', 'audit-verbatim-claims.test', 'audit-vmu-glossary.test', 'audit-vmu-orphan-methods.test',
  'audit-zpolicy.test',
])

/** Is `code` a gate that READS --selftest from argv? Co-occurrence, not same-line: a multi-line guard is still a
 *  guard, and requiring one line made a real self-test look absent (measured: 2 files differed). */
const readsSelftest = (code) => /(['"])--selftest\1/.test(code) && /argv/.test(code)

/** Classify every audit-* in `dir`. Pure with respect to its argument, which is what makes --selftest possible. */
function classify(dir) {
  const files = readdirSync(dir).filter((n) => n.startsWith('audit-') && n.endsWith('.mjs') && !n.includes('.mutants.'))
  return files.sort().map((name) => {
    const base = name.replace(/\.mjs$/, '')
    // ★ COMMENTS ARE STRIPPED FIRST, and this gate's own first draft is why: matching the literal string anywhere
    // meant a file that only MENTIONED --selftest in a comment "proved" itself. This file did exactly that while
    // having no self-test — the precise false-positive class the gate exists to find, committed by the gate.
    const code = stripComments(readFileSync(join(dir, name), 'utf8'))
    const self = readsSelftest(code)
    // The mutant lookup tries BOTH spellings: `X.test.mjs` pairs with `X.mutants.mjs`, and a lookup that only tried
    // `.test.mutants.mjs` reported five self-proven gates as unproven on this gate's first run.
    const mutant = existsSync(join(dir, base + '.mutants.mjs')) || existsSync(join(dir, base.replace(/\.test$/, '') + '.mutants.mjs'))
    return { name, base, proven: self || mutant, via: self ? 'selftest' : mutant ? 'mutants' : null }
  })
}

const judge = (rows, unproven) => {
  const orphan = rows.filter((r) => !r.proven && !unproven.has(r.base)).map((r) => r.base)
  const stale = rows.filter((r) => r.proven && unproven.has(r.base)).map((r) => r.base)
  const proven = rows.filter((r) => r.proven).length
  const exempt = rows.filter((r) => !r.proven && unproven.has(r.base)).length
  return { orphan, stale, proven, exempt, total: rows.length }
}

const argv = process.argv.slice(2)

if (argv.includes('--list')) {
  const j = judge(classify(TESTS), UNPROVEN)
  console.log('scanner-style gates: ' + j.total + '  self-proven: ' + j.proven + '  named-debt: ' + j.exempt)
  console.log('★ UNPROVEN AND NOT LISTED (must be zero): ' + j.orphan.length)
  for (const n of j.orphan) console.log('  ' + n)
  process.exit(0)
}

if (argv.includes('--selftest')) {
  // ★ A REAL SELF-PROOF: build a tree that violates each rule and require the judge to catch it. Without this the
  // gate would be one more scanner asserting "0 violations" with no evidence its predicate can fire.
  const dir = mkdtempSync(join(tmpdir(), 'selfproof-'))
  let bad = 0
  const check = (cond, name, detail) => { if (!cond) { bad += 1; console.log('  FAIL ' + name + ' ' + JSON.stringify(detail || null)) } }
  try {
    writeFileSync(join(dir, 'audit-plain.mjs'), 'console.log(1)\n')
    writeFileSync(join(dir, 'audit-with-selftest.mjs'), "const a = process.argv.slice(2)\nif (a.includes('--selftest')) console.log('x')\n")
    writeFileSync(join(dir, 'audit-mentions-only.mjs'), '// this file mentions --selftest but argv is never read\n')
    writeFileSync(join(dir, 'audit-stale.mjs'), "if (process.argv.includes('--selftest')) console.log('x')\n")
    writeFileSync(join(dir, 'audit-paired.test.mjs'), 'console.log(1)\n')
    writeFileSync(join(dir, 'audit-paired.mutants.mjs'), 'console.log(1)\n')
    const byBase = Object.fromEntries(classify(dir).map((r) => [r.base, r]))
    check(byBase['audit-plain'].proven === false, '★ 无自证的文件必须被判为未自证', byBase['audit-plain'])
    check(byBase['audit-with-selftest'].proven === true, '★ 从 argv 读 --selftest 的必须被判为自证', byBase['audit-with-selftest'])
    check(byBase['audit-mentions-only'].proven === false, '★★ 只在注释里提到 --selftest 的【不】算自证（假绿）', byBase['audit-mentions-only'])
    check(byBase['audit-paired.test'].proven === true, '★ X.test.mjs 与 X.mutants.mjs 配对必须被识别', byBase['audit-paired.test'])
    const j1 = judge(classify(dir), new Set(['audit-stale']))
    check(j1.orphan.includes('audit-plain'), '★★ 未自证且未登记 ⇒ 报 orphan（新门禁不许悄悄无自证）', j1.orphan)
    check(j1.stale.includes('audit-stale'), '★★ 已自证却仍在名单 ⇒ 报 stale（陈旧豁免是谎言）', j1.stale)
    // ★ Register ONLY the files that have no proof. A file WITH proof that is registered is stale BY DESIGN (that is
    // the rule), so registering `audit-stale` here would make this check assert the wrong thing.
    const j2 = judge(classify(dir), new Set(['audit-plain', 'audit-mentions-only']))
    check(j2.orphan.length === 0 && j2.stale.length === 0, '★ 全部登记且无陈旧 ⇒ 两者皆空（判据不是恒报）', j2)
    console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  process.exit(bad === 0 ? 0 : 1)
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed += 1
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const j = judge(classify(TESTS), UNPROVEN)

ok(j.orphan.length === 0,
  '★★ 反：新出现的 audit-* 若既无自证也未登记 ⇒ 红（债务只能缩小，不能悄悄变大）', j.orphan)
ok(j.stale.length === 0,
  '★★ 反：已自证却仍在 UNPROVEN 里 ⇒ 红（行必须在同一改动里删掉，队列才不会变成垃圾场）', j.stale)
ok(j.proven + j.exempt === j.total,
  '★ 正：自证数 ＋ 具名债务数 ＝ 总数（三者都由文件系统派生，没有手抄）', { proven: j.proven, exempt: j.exempt, total: j.total })
ok(j.proven > 0 && j.exempt > 0,
  '★ 正：两类都非空（否则这个分类本身没在被使用，判据可能静默空过）', { proven: j.proven, exempt: j.exempt })

console.log('=== SCANNER SELF-PROOF: ' + passed + ' passed, ' + failed + ' failed ===')
console.log('  scanners=' + j.total + '  self-proven=' + j.proven + '  named-debt=' + j.exempt)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
