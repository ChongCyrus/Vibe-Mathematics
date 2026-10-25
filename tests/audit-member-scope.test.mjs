/**
 * audit-member-scope — the member/office boundary must be a DECLARATION with derived lists, and it must have a
 * PRODUCER. (run-51 residue #4; design in `docs/acceptance/conformance/member-scope-design.md`)
 *
 * The three things this gate refuses to let drift apart:
 *   ① the table and the tool catalogue agree IN BOTH DIRECTIONS (a missing tool and a phantom tool are the same
 *      defect: the boundary would be wrong in one direction and untested in the other);
 *   ② the derived lists are exactly the derivations of the table (`MEMBER_SAFE` / `OFFICE_ONLY` disjoint, union =
 *      table) — two hand-written lists would be the "two copies drift" failure;
 *   ③ the narrowing actually reaches the seam the host reads, and says so when the seam is absent.
 */
import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'
import {
  TOOL_SCOPES, SCOPE_VOCAB, MEMBER_SAFE_TOOLS, OFFICE_ONLY_TOOLS, MEMBER_SCOPE_NOTE,
  applyMemberScope, scopeCatalogue,
} from '../vibe-math-vmu/packs/v5r/member-scope.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const ok = (cond, name, detail = '') => {
  if (cond) { passed += 1; return }
  failed += 1
  console.log('FAIL ' + name + (detail ? '  :: ' + detail : ''))
}

// ── ① 双向一致 ───────────────────────────────────────────────────────────────────────────────────────────
const names = V5R_PACK_TOOLS.map((t) => t.name)
const diff = scopeCatalogue(names)
ok(diff.missing.length === 0, 'every pack tool has a scope', 'missing: ' + diff.missing.join(','))
ok(diff.extra.length === 0, 'the table names no tool that does not exist', 'extra: ' + diff.extra.join(','))
ok(diff.availableCount === names.length, 'the catalogue was read (not empty)', 'availableCount=' + diff.availableCount)
ok(names.length > 40, 'the catalogue is the real one', 'n=' + names.length)

// ── ② 派生而非手抄 ──────────────────────────────────────────────────────────────────────────────────────
const all = Object.keys(TOOL_SCOPES).sort()
const union = [...MEMBER_SAFE_TOOLS, ...OFFICE_ONLY_TOOLS].sort()
ok(JSON.stringify(union) === JSON.stringify(all), 'MEMBER_SAFE ∪ OFFICE_ONLY = the table', 'union=' + union.length + ' table=' + all.length)
ok(MEMBER_SAFE_TOOLS.every((n) => !OFFICE_ONLY_TOOLS.includes(n)), 'the two lists are disjoint')
ok(Object.values(TOOL_SCOPES).every((v) => Object.prototype.hasOwnProperty.call(SCOPE_VOCAB, v)), 'every scope value is in the vocabulary')
ok(MEMBER_SAFE_TOOLS.length + OFFICE_ONLY_TOOLS.length === all.length, 'no tool falls between the two lists')
// the office-only set is the CONTROL surface, and it must stay small enough to be named: if it ever swallowed the
// research faces, a member could not do research at all — that is the failure the user asked about directly.
ok(OFFICE_ONLY_TOOLS.length > 0 && OFFICE_ONLY_TOOLS.length < 15, 'the office-only set is a control surface, not a research surface', 'n=' + OFFICE_ONLY_TOOLS.length)
for (const must of ['vibe_v5_report', 'vibe_v5_overview', 'vibe_v5_set', 'vibe_v5_configure', 'vibe_v5_start', 'vibe_v5_verdict_final']) {
  ok(OFFICE_ONLY_TOOLS.includes(must), 'office-only contains ' + must)
}
for (const must of ['vibe_v5_record_proposition', 'vibe_v5_read_library', 'vibe_v5_say', 'vibe_v5_message', 'vibe_v5_meeting', 'vibe_v5_lean_run', 'vibe_v5_paper', 'vibe_v5_blueprint']) {
  ok(MEMBER_SAFE_TOOLS.includes(must), 'member-safe contains ' + must)
}
ok(MEMBER_SCOPE_NOTE.includes('所办') && MEMBER_SCOPE_NOTE.includes('线束'), 'the boundary note names the office and the wire')

// ── ③ 生产者真的接到缝上（行为，不是读源码字符串）─────────────────────────────────────────────────────
const calls = []
const kernelWithSeam = { setMemberToolOverride: (x) => { calls.push(x) } }
const r1 = applyMemberScope({ kernel: kernelWithSeam, members: ['r-1', 'r-2'] })
ok(r1.ok === true && r1.seam === 'kernel.setMemberToolOverride', 'the seam is named in the receipt', JSON.stringify(r1.seam))
ok(r1.appliedCount === 2 && calls.length === 2, 'the scope was applied to every asked seat')
ok(calls.every((c) => Array.isArray(c.allow) && c.allow.length === MEMBER_SAFE_TOOLS.length), 'the allow list is the derived member list')
ok(calls.every((c) => !c.allow.includes('vibe_v5_report')), 'the office-only report face is NOT in the allow list')
ok(typeof r1.means === 'string' && r1.means.includes(String(MEMBER_SAFE_TOOLS.length)), 'the receipt says what it means, with the count')

const r2 = applyMemberScope({ kernel: {}, members: ['r-1'] })
ok(r2.ok === true && r2.seam === 'absent' && r2.appliedCount === 0, 'a kernel without the seam reports absence instead of pretending')
ok(typeof r2.means === 'string' && r2.means.includes('NOT applied'), 'the absent case says it was NOT applied')

const r3 = applyMemberScope({ kernel: kernelWithSeam, members: [] })
ok(r3.askedCount === 0 && r3.appliedCount === 0, 'no seats asked, nothing applied')

// one seat throwing must not stop the others
let n = 0
const flaky = { setMemberToolOverride: () => { n += 1; if (n === 1) throw new Error('first seat refuses') } }
const r4 = applyMemberScope({ kernel: flaky, members: ['a', 'b'] })
ok(r4.appliedCount === 1 && r4.askedCount === 2, 'a refusing seat is counted, the rest still narrow', JSON.stringify(r4.applied))

// ── ④ 两个面必须在坐席/雇佣时调用它（装配点，不是自愿约定）────────────────────────────────────────────
const toolsSrc = readFileSync(join(REPO, 'vibe-math-vmu/packs/v5r/tools.js'), 'utf8')
ok(toolsSrc.includes('applyMemberScope'), 'tools.js imports the producer')
ok(/async function toolStart[\s\S]{0,2000}applyMemberScope\(/.test(toolsSrc), 'vibe_v5_start applies the scope at seating time')
ok(/async function toolHire[\s\S]{0,3000}applyMemberScope\(/.test(toolsSrc), 'vibe_v5_hire applies the scope to the new seat')
ok(toolsSrc.includes('memberScope'), 'both receipts carry the scope receipt (narrowing is provable from outside)')

console.log('=== MEMBER SCOPE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
