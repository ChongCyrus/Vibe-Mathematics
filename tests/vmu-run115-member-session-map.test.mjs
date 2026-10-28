#!/usr/bin/env node
// ROUND 115 — A MEMBER TURN RUNS IN ITS OWN KERNEL, SO "WHICH MEMBER AM I?" MUST TRAVEL THROUGH DURABLE STATE.
//
// What run 115 measured: a member (r-1) called `vibe_v5_hire` from its own turn and the receipt said
// `hiredBy:null` — with the note "this call ran outside a member turn (a root/office call has no member seat)" — and the
// following `vibe_v5_fire` answered `caller:null, callerSeat:null, callerUnknown:true, ownership:"unrecorded"`. Everything
// the A7 rule needs was already wired (hire stamps the roster row, fire reads it); what was missing is the fact that
// decides WHOSE call it is: under activation delivery the member runs in a SEPARATE kernel whose tool calls carry the
// CHILD SESSION id, and `currentTurnMember()` there is null, so every existing criterion failed.
//
// The fix is one durable fact — "member X ran in child session Y" — learned when a turn settles and written to the shared
// fold, then read back by the kernel that dispatches the tool call. `null` stays a real answer (root/office, or a child
// nobody mapped): this suite pins BOTH sides, because a resolver that turns "unknown" into a guess is a worse defect than
// the one being fixed.
//
// §1 the turn loop learns the pair and reports it (`memberBySession`), and the pair reaches the durable fold;
// §2 a SECOND kernel (the shape of a member's own kernel) resolves the caller from that fold — and still answers null
//    for a session nobody recorded and for a root/office session;
// §3 the whole point: on that second kernel a `fire` call attributed to the child session is a MEMBER call — the seat
//    guard and the ownership reading see r-1, not "unknown".
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { resolveTurnMember } from '../vibe-math-vmu/host-pack-tools.js'

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r115-')); roots.push(d); return d }
// ★ the reply a member turn must hand back: a usable fenced JSON envelope (a seam that answers prose only is refused
// with VMU_TURN_NO_FENCE, which is the kernel telling the truth about what it can see).
const FENCED = ['```json', '{"say":"先别急，把文件读了"}', '```'].join(String.fromCharCode(10))
const deliver = (childId, reply = FENCED) => async () => ({ reply, childId })

const boot = async (root, seam) => {
  const kernel = createKernel({
    clock: () => 1000,
    settings: {},
    root,
    deliverTurn: seam,
    slots: [
      { id: 'chair', capacity: 1, permissions: ['speak', 'vote', 'decide'] },
      { id: 'member', capacity: 4, permissions: ['speak', 'vote'] },
      { id: 'temp', capacity: 4, permissions: ['speak'] },
    ],
  })
  // ★ the workspace store is opened by the ENTRY on a real machine; a kernel built directly has to be opened here, or
  // every `store.read` says "store is not open" and the durable half of this suite would silently assert nothing.
  await kernel.store.open()
  return kernel
}

// ── §1 THE LEARN POINT: the loop records "member -> child session" and hands it to the kernel ─────────────────────
console.log('=== 1. A SETTLED TURN RECORDS WHICH CHILD SESSION PLAYED WHICH MEMBER ===')
{
  const root = await mkRoot()
  const K = await boot(root, deliver('session-child-a'))
  await K.members.hire({ id: 'r-1', slot: 'member' })
  const step = await K.turn.step({ members: ['r-1'], phase: 'normal', why: '§1' })
  ok(step && step.ok === true, '① the member turn settles', { ok: step && step.ok })
  ok(K.turn.memberBySession('session-child-a') === 'r-1',
    '①★ the loop can answer "which member ran in session-child-a?" — the fact the child kernel was missing',
    { got: K.turn.memberBySession('session-child-a') })
  ok(K.turn.memberBySession('session-nobody') === null,
    '① an unknown session is null (a REAL answer: never a guessed member)', { got: K.turn.memberBySession('session-nobody') })
  const rows = K.turn.memberSessionPairs()
  ok(Array.isArray(rows) && rows.some((r) => r && r.member === 'r-1' && r.session === 'session-child-a'),
    '①★ the pair reached the DURABLE fold (the only place another kernel can read it)', { rows })
}

// ── §2 THE READ SIDE: another kernel (a member's own kernel) resolves the caller from the fold ──────────────────────
console.log('=== 2. A SECOND KERNEL RESOLVES THE SAME PAIR FROM THE FOLD ===')
{
  const root = await mkRoot()
  const parent = await boot(root, deliver('session-child-b'))
  await parent.members.hire({ id: 'r-2', slot: 'member' })
  await parent.turn.step({ members: ['r-2'], phase: 'normal', why: '§2' })
  const child = await boot(root, null)
  const who = resolveTurnMember(child, { agent: { id: 'session-child-b' } })
  ok(who === 'r-2',
    '②★ a second kernel answers "this child session is r-2" from durable state alone (it never saw the turn)',
    { got: who })
  ok(resolveTurnMember(child, { agent: { id: 'session-unknown' } }) === null,
    '② a session nobody recorded still resolves to null (no guessing)', null)
  ok(resolveTurnMember(child, { agent: { id: 'r-not-root' } }) === null,
    '② and a non-session id that is not on the roster is null too', null)
}

// ── §3 THE CONSEQUENCE: on the member's own kernel, `fire` now knows the caller ─────────────────────────────────────
console.log('=== 3. THE CALLER IS A MEMBER ON THE CHILD KERNEL, SO THE A7 READING IS REAL ===')
{
  const root = await mkRoot()
  const parent = await boot(root, deliver('session-child-c'))
  await parent.members.hire({ id: 'r-3', slot: 'member' })
  await parent.members.hire({ id: 'r-t1', slot: 'temp', by: 'r-3' })
  await parent.turn.step({ members: ['r-3'], phase: 'normal', why: '§3' })
  const child = await boot(root, null)
  const caller = resolveTurnMember(child, { agent: { id: 'session-child-c' } })
  ok(caller === 'r-3', '③ the caller resolves to the member on the child kernel', { got: caller })
  const row = parent.members.roster().find((m) => m && m.id === 'r-t1') || null
  ok(row && row.hiredBy === 'r-3',
    '③★ the roster row carries WHO HIRED the temp worker (the fact `fire` reads for ownership)', row && { id: row.id, hiredBy: row.hiredBy })
  ok(caller !== null && row && row.hiredBy === caller,
    '③★★ so ownership is answerable: this caller hired this temp worker (own, not "unrecorded")',
    { caller, hiredBy: row && row.hiredBy })
}

for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
console.log(`\n=== VMU RUN115 MEMBER SESSION MAP: ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exitCode = 1
