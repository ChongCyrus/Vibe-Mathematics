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
 *   ④ ★ ROUND 31: the narrowing is a DENY list DERIVED FROM `seat-faces.js` (never an `allow` array, never a second copy
 *      of the catalogue) and it NEVER overrides the chair seat — an `allow` array makes `kernel/memberface.js#faceGate`
 *      stop reading `deny`, i.e. it REPLACES the seat declaration. Measured on run 31: the one line that wrote
 *      `allow: MEMBER_SAFE_TOOLS` for every hired seat cut the chair's `verdict_final`/`verdict_ask`/`verified_promote`/
 *      `report` and handed it `vibe_v5_message`.
 */
import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'
import {
  TOOL_SCOPES, SCOPE_VOCAB, MEMBER_SAFE_TOOLS, OFFICE_ONLY_TOOLS, MEMBER_SCOPE_NOTE,
  applyMemberScope, scopeCatalogue,
} from '../vibe-math-vmu/packs/v5r/member-scope.js'
import {
  SEAT_GOVERNED_SLOTS, SEAT_SCOPE_AXES, seatDeclaredNames, seatDenyNames, seatScopeDivergence,
} from '../vibe-math-vmu/packs/v5r/seat-faces.js'
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
ok(all.length > 0 && union.length > 0 && JSON.stringify(union) === JSON.stringify(all), 'MEMBER_SAFE ∪ OFFICE_ONLY = the table (non-vacuous: two empty lists would also be equal)', 'union=' + union.length + ' table=' + all.length)
ok(MEMBER_SAFE_TOOLS.every((n) => !OFFICE_ONLY_TOOLS.includes(n)), 'the two lists are disjoint')
ok(Object.values(TOOL_SCOPES).every((v) => Object.prototype.hasOwnProperty.call(SCOPE_VOCAB, v)), 'every scope value is in the vocabulary')
ok(MEMBER_SAFE_TOOLS.length > 0 && OFFICE_ONLY_TOOLS.length > 0 && MEMBER_SAFE_TOOLS.length + OFFICE_ONLY_TOOLS.length === all.length, 'no tool falls between the two lists (non-vacuous)')
// the office-only set is the CONTROL surface, and it must stay small enough to be named: if it ever swallowed the
// research faces, a member could not do research at all — that is the failure the user asked about directly.
ok(OFFICE_ONLY_TOOLS.length > 0 && OFFICE_ONLY_TOOLS.length < 15, 'the office-only set is a control surface, not a research surface', 'n=' + OFFICE_ONLY_TOOLS.length)
for (const must of ['vibe_v5_report', 'vibe_v5_overview', 'vibe_v5_set', 'vibe_v5_configure', 'vibe_v5_start', 'vibe_v5_verdict_final']) {
  ok(OFFICE_ONLY_TOOLS.includes(must), 'office-only contains ' + must)
}
// ★ ROUND 31 / Lead 裁决 1 + 2: `message` relays in SOMEONE ELSE'S name (kit/handlers.js:352 does not check the caller) and
// `script` is the run-script archive no seat may call. Both were 'member' before the seat table existed, which put an
// impersonation face and a dead face in the member's wire. They are office-only now; the seat table's deny is what decides
// calls, and `seatScopeDivergence` proves no seat-line name is stranded.
for (const must of ['vibe_v5_message', 'vibe_v5_script']) {
  ok(OFFICE_ONLY_TOOLS.includes(must), 'office-only contains ' + must + ' (round-31 ruling, not the pre-seat-table value)')
}
ok(TOOL_SCOPES.vibe_v5_message === 'office' && TOOL_SCOPES.vibe_v5_script === 'office',
  '★ the two names flipped to office-only are flipped IN THE TABLE (the derived lists above cannot disagree with it)')
for (const must of ['vibe_v5_record_proposition', 'vibe_v5_read_library', 'vibe_v5_say', 'vibe_v5_meeting', 'vibe_v5_lean_run', 'vibe_v5_paper', 'vibe_v5_blueprint']) {
  ok(MEMBER_SAFE_TOOLS.includes(must), 'member-safe contains ' + must)
}
ok(!MEMBER_SAFE_TOOLS.includes('vibe_v5_message') && !MEMBER_SAFE_TOOLS.includes('vibe_v5_script'),
  '★ neither impersonation nor the script archive is in the member line (the member keeps say{to} for DMs)')
ok(MEMBER_SCOPE_NOTE.includes('所办') && MEMBER_SCOPE_NOTE.includes('线束'), 'the boundary note names the office and the wire')

// ── ③ 生产者真的接到缝上（行为，不是读源码字符串）─────────────────────────────────────────────────────
// ★ ROUND 31: the producer now reads TWO things from the kernel — the override seam AND the live roster (a seat's slot is
// the fact an override must not guess). The stub models both, because a stub that cannot be seated is not a kernel.
const calls = []
const roster = [
  { id: 'r-1', slot: 'member' },
  { id: 'r-2', slot: 'member' },
  { id: 'r-acad', slot: 'chair' },
]
const kernelWithSeam = {
  members: { roster: () => roster },
  setMemberToolOverride: (x) => { calls.push(x) },
}
const member = 'member'
const derivedDeny = seatDenyNames(member, seatDeclaredNames())
const r1 = applyMemberScope({ kernel: kernelWithSeam, members: ['r-1', 'r-2'] })
ok(r1.ok === true && r1.seam === 'kernel.setMemberToolOverride', 'the seam is named in the receipt', JSON.stringify(r1.seam))
ok(r1.appliedCount === 2 && calls.length === 2, 'the scope was applied to every asked seat')
ok(calls.every((c) => c.allow === undefined), '★★ NO allow array is handed down: an `allow` list REPLACES the seat declaration (faceGate stops reading deny) — that is the run-31 defect')
ok(calls.every((c) => Array.isArray(c.deny) && c.deny.length === derivedDeny.length),
  '★★ the deny list IS the declaration\'s complement (derived from seat-faces.js, not hand-copied here)',
  calls.map((c) => (c.deny || []).length).join(','))
ok(calls.length > 0 && calls.every((c) => JSON.stringify(c.deny) === JSON.stringify(derivedDeny)),
  '★ byte-for-byte the seat-faces deny for that slot (a name-wise drift cannot hide behind equal lengths)')
ok(calls.length > 0 && calls.every((c) => c.deny.includes('vibe_v5_report')), 'the office-only report face is DENIED to the member seat')
ok(calls.length > 0 && calls.every((c) => !c.deny.includes('vibe_v5_say')), 'and the seat keeps its own faces (say is not denied)')
ok(typeof r1.means === 'string' && r1.means.includes('DENY') && r1.means.includes(String(derivedDeny.length))
  && r1.means.includes('chair'), 'the receipt says what it means: DENY-derived, with the count, and that the chair is not overridden')

// ★ the chair is NOT governed: overriding it is exactly how run 31 lost the ruling faces
const calls2 = []
const kernelBoth = {
  members: { roster: () => roster },
  setMemberToolOverride: (x) => { calls2.push(x) },
}
const r5 = applyMemberScope({ kernel: kernelBoth, members: ['r-acad'] })
ok(r5.appliedCount === 0 && calls2.length === 0,
  '★★ the CHAIR seat is never overridden (its capability IS SEAT_TOOL_FACES.chair, declared in seat-faces.js)',
  JSON.stringify({ applied: r5.applied, calls: calls2.length }))
ok(r5.skipped.some((s) => s.member === 'r-acad' && s.why === 'seat-authority' && s.detail.length > 40),
  '★ the skip is NAMED (`seat-authority`), not a silent pass')
ok(SEAT_GOVERNED_SLOTS.includes('member') && !SEAT_GOVERNED_SLOTS.includes('chair'),
  'the governed slots are declared, and the chair is not among them')

// ★ the producer's own name list is the seat table's declared list — it must cover the catalogue it is applied to
ok(JSON.stringify(seatDeclaredNames().slice().sort()) === JSON.stringify(names.slice().sort()),
  '★ the deny derivation is computed over the SAME catalogue (seat-faces declares every tool, so deny = declared − allow)')

const r2 = applyMemberScope({ kernel: {}, members: ['r-1'] })
ok(r2.ok === true && r2.seam === 'absent' && r2.appliedCount === 0, 'a kernel without the seam reports absence instead of pretending')
ok(typeof r2.means === 'string' && r2.means.includes('NOT applied'), 'the absent case says it was NOT applied')

const r3 = applyMemberScope({ kernel: kernelWithSeam, members: [] })
ok(r3.askedCount === 0 && r3.appliedCount === 0, 'no seats asked, nothing applied')

// a kernel with the seam but WITHOUT a roster: nothing can be narrowed, and the receipt says which fact was missing
const noRoster = applyMemberScope({ kernel: { setMemberToolOverride: () => { throw new Error('must not be called') } }, members: ['r-1'] })
ok(noRoster.appliedCount === 0 && noRoster.skipped.some((s) => s.why === 'roster-unavailable'),
  '★ without a roster nothing is overridden and the receipt names the missing fact (`roster-unavailable`)')

// a seat whose roster row declares no slot: no declared face applies, so the producer refuses to guess one
const emptySlotRoster = [{ id: 'r-x', slot: '' }]
const noSlot = applyMemberScope({ kernel: { members: { roster: () => emptySlotRoster }, setMemberToolOverride: () => { throw new Error('must not be called') } }, members: ['r-x'] })
ok(noSlot.appliedCount === 0 && noSlot.skipped.some((s) => s.why === 'undeclared-slot'),
  '★ an undeclared slot is skipped BY NAME (narrowing it with the member line would be a guess)')

// one seat throwing must not stop the others
let n = 0
const flaky = {
  members: { roster: () => [{ id: 'a', slot: 'member' }, { id: 'b', slot: 'member' }] },
  setMemberToolOverride: () => { n += 1; if (n === 1) throw new Error('first seat refuses') },
}
const r4 = applyMemberScope({ kernel: flaky, members: ['a', 'b'] })
ok(r4.appliedCount === 1 && r4.askedCount === 2, 'a refusing seat is counted, the rest still narrow', JSON.stringify(r4.applied))
ok(r4.refusedCount === 1 && r4.refused[0].code === 'VMU_SCOPE_REFUSED' && r4.refused[0].message.includes('refuses'),
  '★ a refusal is RECORDED with its code and message (the old code swallowed the error entirely)')

// ── ④ THE TWO AXES ARE NAMED, AND NO SEAT-LINE NAME IS STRANDED ─────────────────────────────────────────
// `TOOL_SCOPES` answers "who can SEE it"; `SEAT_TOOL_FACES` answers "which seat can CALL it". The two must be readable
// together — and a name the member line shows while NO seat may call it is a dead entry, reported by name.
ok(typeof SEAT_SCOPE_AXES.scope === 'string' && SEAT_SCOPE_AXES.scope.includes('谁看得见')
  && SEAT_SCOPE_AXES.seat.includes('谁调得动') && SEAT_SCOPE_AXES.join.includes('deny'),
  '★★ the two axes are DECLARED in one place (member-scope: 谁看得见 / seat-faces: 谁调得动; the join is the derived deny)')
const divergence = seatScopeDivergence({ declared: seatDeclaredNames(), memberScope: TOOL_SCOPES })
ok(divergence.ok === true, '★★ every seat-line name in TOOL_SCOPES is callable by at least one seat (none stranded, none rowless)',
  JSON.stringify({ stranded: divergence.stranded, rowless: divergence.rowless }))

// ── ⑤ 两个面必须在坐席/雇佣时调用它（装配点，不是自愿约定）────────────────────────────────────────────
const toolsSrc = readFileSync(join(REPO, 'vibe-math-vmu/packs/v5r/tools.js'), 'utf8')
ok(toolsSrc.includes('applyMemberScope'), 'tools.js imports the producer')
ok(/async function toolStart[\s\S]{0,2000}applyMemberScope\(/.test(toolsSrc), 'vibe_v5_start applies the scope at seating time')
// RUN 92: the hire face now refuses an id already on the roster BEFORE seating anyone (F-92b), so the
// structural window has to reach past that guard. The assertion is unchanged: the face that seats a member
// also applies the scope to it.
ok(/async function toolHire[\s\S]{0,4200}applyMemberScope\(/.test(toolsSrc), 'vibe_v5_hire applies the scope to the new seat')
ok(toolsSrc.includes('memberScope'), 'both receipts carry the scope receipt (narrowing is provable from outside)')

// ── ⑥ 生产者侧的第二条证据：这个包从不生产 `allow:` overrides（纯静态，不启内核、不写盘）────────────────
// run 31 的放宽是**一行**造成的：`setMemberToolOverride({ member, allow: MEMBER_SAFE_TOOLS })`。`host.js` 的 wire 过滤与
// `memberface.js#faceGate` 都是「看到 allow 就不再看 deny」，所以任何**生产者**发 allow 数组，都等于用一份便利清单
// 覆盖掉席位声明 —— 既能缩小（砍掉裁决工具）也能放大（放出别人的面）。
// 这里静态钉住：本包没有任何 `setMemberToolOverride({ … allow: … })` 的生产者形状。（本文件其余段落用的 stub kernel
// 也一律只喂 deny，见 ③。）
// 消费侧（kernel 即便收到 allow 也会把它与席位 deny 求交、并点名 `allowNarrowedByDeny`）是**真内核 boot** 的断言，
// 按 audit 家族「只读源码/纯函数」的契约挪到了 tests/vmu-run31-seat-faces.test.mjs（第 ⑩ 段）。
const scopeSrc = readFileSync(join(REPO, 'vibe-math-vmu/packs/v5r/member-scope.js'), 'utf8')
// 只看**代码**：文件里有一句注释在讲"旧版曾经这么写过"（`setMemberToolOverride({ member, allow: MEMBER_SAFE_TOOLS })`），
// 那句话必须留着（它是 run 31 的病史），所以先把注释剥掉再判形状。
const scopeCode = scopeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const allowProducer = /setMemberToolOverride\(\{[^}]*\ballow\s*:/.test(scopeCode)
ok(allowProducer === false,
  '★★★ NO ALLOW PRODUCER: member-scope.js never passes an `allow:` array to setMemberToolOverride — the narrowing it sends is the seat deny, so an override can only take tools away',
  allowProducer ? 'found setMemberToolOverride({ … allow: … }) — that is the exact run-31 shape' : '')
ok(/setMemberToolOverride\(\{[^}]*\ballow\s*:/.test(scopeSrc),
  '★ …while the HISTORY is still written down in a comment (the old allow-shaped line is cited, not erased)', '')
ok(/seatDenyNames\(/.test(scopeSrc) && !/MEMBER_SAFE_TOOLS\.slice\(\)/.test(scopeSrc),
  '★★ the only narrowing it can send is the name list DERIVED from seat-faces.js (`seatDenyNames(...)`); the old `MEMBER_SAFE_TOOLS.slice()` producer is gone')
// 这条与 ⑤ 互补：⑤ 说"装配点会调用它"，⑥ 说"它下发的绝不是 allow"。消费侧在 run31 套件里。

console.log('=== MEMBER SCOPE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
