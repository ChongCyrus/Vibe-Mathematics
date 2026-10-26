// vmu member face — the OVERRIDE INVARIANT: an override narrows, it never grants.
//
// Run 31 measured the failure this file pins: a start-time `setMemberToolOverride({ member, allow: MEMBER_SAFE_TOOLS })`
// gave the member seat `vibe_v5_message`, a face the seat itself declares office-only (member-scope.js#TOOL_SCOPES), and
// dropped the chair's own duties. The mechanism is an ORDER, not a table: every consumer that sees an allow list filters
// by membership and never asks deny (host.js wire filter; kernel/memberface.js#faceGate documents the same order "as on
// the wire"). So an allow list applied ON TOP of a seat deny is a GRANT, however narrow it looks.
//
// The fix is at the one resolver both consumers read (`kernel.resolveMemberToolDeny`): the override's allow list is
// intersected with the deny the seat declares. This file asserts BOTH halves:
//   · the predicate still documents wire order (so the trap stays visible, reachable only by hand)
//   · the resolver can no longer produce a pair where allow re-grants a denied name (the invariant, in one expression)
//
// Run: node tests/vmu-member-override-invariant.test.mjs     Last line: === VMU MEMBER OVERRIDE INVARIANT: N passed, M failed ===

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { faceGate } from '../vibe-math-vmu/kernel/memberface.js'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) } }

const TOOLS = ['vibe_t_read', 'vibe_t_vote', 'vibe_t_msg', 'vibe_t_report']

async function boot() {
  const k = m.createKernel({ clock: () => 0 })
  k.declareSlots([{ id: 'chair', label: 'chair' }, { id: 'member', label: 'member' }])
  await k.members.hire({ id: 'r-chair', slot: 'chair', institution: 'sim' })
  await k.members.hire({ id: 'r-mem', slot: 'member', institution: 'sim' })
  k.declarePackTools(TOOLS.map((name) => ({ name, handler: () => ({}) })), { by: 'probe-pack' })
  // the seat's own declaration: these two are kept out of the member seat by the SEAT, not by any override
  k.declarePackToolFaces({
    chair: { deny: [] },
    member: { deny: ['vibe_t_msg', 'vibe_t_vote'] },
  }, { by: 'probe-pack' })
  return k
}

// ── ① the predicate's order is still "allow first, deny not consulted" — the trap, kept visible ──────────────────
{
  const both = faceGate({ member: 'x', slot: 'member', toolName: 'a', faces: [{ slot: 'member', allow: ['a'], deny: ['a'], all: false, source: ['pack', 'turn'] }] })
  ok(both.ok === true,
    '① the pure predicate still honours wire order: a name in BOTH lists is allowed (host.js filters by allow membership and stops). This is why the seam, not the predicate, had to change.', both)
  const outOfAllow = faceGate({ member: 'x', slot: 'member', toolName: 'b', faces: [{ slot: 'member', allow: ['a'], deny: null, all: false, source: ['pack'] }] })
  ok(outOfAllow.ok === false && outOfAllow.code === 'VMU_TOOL_NOT_IN_FACE', '① a name outside an allow list is refused by name', outOfAllow)
}

// ── ② THE INVARIANT: an override allow list cannot re-grant a name the seat denies ───────────────────────────────
{
  const k = await boot()
  const before = k.resolveMemberToolDeny('r-mem')
  ok(Array.isArray(before.deny) && before.deny.length === 2 && before.allow === null,
    '② the seat alone denies exactly the two declared names, with no allow list (nothing narrowed yet)', before)

  // the run-31 shape: an allow list that CONTAINS a seat-denied name (it used to be a grant on both the wire and the gate)
  k.setMemberToolOverride({ member: 'r-mem', allow: ['vibe_t_read', 'vibe_t_msg'] })
  const after = k.resolveMemberToolDeny('r-mem')
  ok(Array.isArray(after.allow) && after.allow.length === 1 && after.allow[0] === 'vibe_t_read',
    '★★ the resolver returns an allow list WITHOUT the seat-denied name — the override cannot grant what the seat withholds', after)
  ok(Array.isArray(after.allowNarrowedByDeny) && after.allowNarrowedByDeny.length === 1 && after.allowNarrowedByDeny[0] === 'vibe_t_msg',
    '★★ the removed name is NAMED in the receipt, so the narrowing is auditable instead of silent', after.allowNarrowedByDeny)
  ok(typeof after.allowNarrowedMeans === 'string' && /can only take tools away/.test(after.allowNarrowedMeans),
    '② the receipt says WHY: an override narrows, so those names were removed rather than granted back', after.allowNarrowedMeans)
  ok(after.allow.filter((n) => after.deny.includes(n)).length === 0,
    '★★ THE INVARIANT, one line: no name is ever in both `allow` and `deny` after resolution', after)

  const gate = k.memberFaceGate({ member: 'r-mem', toolName: 'vibe_t_msg' })
  ok(gate.ok === false && gate.code === 'VMU_TOOL_NOT_IN_FACE',
    '★ 反：the seat-denied tool is still refused at CALL time even though an allow list named it (run 31: this call SUCCEEDED)', gate)
  const allowed = k.memberFaceGate({ member: 'r-mem', toolName: 'vibe_t_read' })
  ok(allowed.ok === true, '② the rest of the override still applies (the allowed name stays allowed)', allowed)

  // the counterfactual: the OLD resolved pair, handed straight to the predicate, is a grant — the defect reproduced
  const oldShape = faceGate({ member: 'r-mem', slot: 'member', toolName: 'vibe_t_msg', faces: [{ slot: 'member', allow: ['vibe_t_read', 'vibe_t_msg'], deny: ['vibe_t_msg', 'vibe_t_vote'], all: false, source: ['pack', 'turn'] }] })
  ok(oldShape.ok === true,
    '★★ counterfactual: the pair the resolver USED to emit (allow containing a denied name) is ALLOWED by the very predicate the gate uses — the run-31 widening, reproduced without the kernel', oldShape)
}

// ── ③ no false alarm: an allow list that already excludes the denied names narrows nothing ───────────────────────
{
  const k = await boot()
  k.setMemberToolOverride({ member: 'r-mem', allow: ['vibe_t_read', 'vibe_t_report'] })
  const r = k.resolveMemberToolDeny('r-mem')
  ok(r.allow.length === 2 && r.allowNarrowedByDeny.length === 0,
    '③ allow lists that agree with the seat are returned untouched (the invariant must not eat legitimate narrowing)', r)
  ok(/already excludes/.test(String(r.allowNarrowedMeans)),
    '③ and the receipt says so in words, instead of leaving an empty array to be interpreted', r.allowNarrowedMeans)
}

// ── ④ an override's OWN deny narrows an override allow, and `all:true` still means "nothing" ─────────────────────
{
  const k = await boot()
  k.setMemberToolOverride({ member: 'r-mem', allow: ['vibe_t_read', 'vibe_t_report'], deny: ['vibe_t_report'] })
  const r = k.resolveMemberToolDeny('r-mem')
  ok(r.allow.length === 1 && r.allow[0] === 'vibe_t_read' && r.allowNarrowedByDeny.includes('vibe_t_report'),
    '④ a deny stated by the SAME override also wins over its allow list (one rule for both sources)', r)
  ok(k.memberFaceGate({ member: 'r-mem', toolName: 'vibe_t_report' }).ok === false, '④ and the gate refuses it', null)

  k.setMemberToolOverride({ member: 'r-mem', all: true })
  const none = k.resolveMemberToolDeny('r-mem')
  ok(none.all === true && none.allow === null, '④ `all:true` (tools:"none") resolves to no allow list and all=true', none)
  ok(k.memberFaceGate({ member: 'r-mem', toolName: 'vibe_t_read' }).ok === false, '④ and EVERY tool is refused', null)
}

// ── ⑤ the chair seat: an override there narrows the same way, and nothing is silently granted ────────────────────
{
  const k = await boot()
  const before = k.resolveMemberToolDeny('r-chair')
  ok(before.deny.length === 0 && before.allow === null, '⑤ the chair seat declares no deny, so its face is its declaration', before)
  k.setMemberToolOverride({ member: 'r-chair', allow: ['vibe_t_vote'] })
  const after = k.resolveMemberToolDeny('r-chair')
  ok(after.allow.length === 1 && after.allow[0] === 'vibe_t_vote' && after.allowNarrowedByDeny.length === 0,
    '⑤ a chair override narrows to exactly the list it names (nothing to intersect, nothing invented)', after)
  ok(k.memberFaceGate({ member: 'r-chair', toolName: 'vibe_t_read' }).ok === false,
    '⑤ and a tool outside the narrowed list is refused — an allow list never widens the chair either', null)
}

// ── ⑥ the invariant holds for EVERY name, not just the two in the fixture ────────────────────────────────────────
{
  const k = await boot()
  k.setMemberToolOverride({ member: 'r-mem', allow: TOOLS.slice() })
  const r = k.resolveMemberToolDeny('r-mem')
  ok(Array.isArray(r.allow) && r.allow.length > 0 && r.allow.length === TOOLS.length - 2,
    '⑥ an allow list naming every declared tool comes back minus the two the seat denies (2 removed, none added)', r)
  ok(r.allow.filter((n) => r.deny.includes(n)).length === 0,
    '⑥ the invariant is a set property over the whole list, not a pair-wise special case', r)
  ok(r.allowNarrowedByDeny.length === 2, '⑥ both removals are named', r.allowNarrowedByDeny)
}

console.log('')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  FAIL ' + f)
}
console.log('=== VMU MEMBER OVERRIDE INVARIANT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exitCode = failed === 0 ? 0 : 1
