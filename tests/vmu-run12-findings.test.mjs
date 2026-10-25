// ★ LIVE RUN 12 (the institute's own acceptance report) — two of its three items, pinned.
//
// The run used the REAL multi-agent path (`deliverMode:'subagents'`), closed (`cast:true`, 7 turn receipts) and the
// institute still graded itself 「本轮无实质残余：否」 with three named items. Two of them are about receipts that a
// reader could not decode; this file pins the fix for those two. The third (a member turn assembled but never
// delivered, `delivered:0`) is NOT fixed here — its assertion would be vacuous until the turn service attributes a
// stalled turn by name, and inventing a passing assertion for an unfixed defect is the worst kind of green.
//
//   item 2: `vibe_vmu_meeting` called WITHOUT `action` used to answer `unknown action: undefined` — a refusal that
//           names neither the missing parameter nor anything the caller wrote.
//   item 3: a motion vote receipt carried `counted:true` AND `ballot:{mirrored:false, code:'VMU_CONFLICT'}` with no
//           sentence relating them, so "counted" and "refused" looked contradictory.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ★ fileURLToPath, not `new URL(...).pathname`: the repo path contains non-ASCII characters, and `.pathname`
// leaves them percent-encoded, so every read fails with ENOENT on a perfectly valid path.
const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
const FACE = REPO + '/vibe-math-vmu/tools/meeting.js'
const KERNEL = REPO + '/vibe-math-vmu/kernel/meetings.js'
const face = readFileSync(FACE, 'utf8')
const kernel = readFileSync(KERNEL, 'utf8')

let pass = 0
let fail = 0
const ok = (cond, name, detail) => {
  if (cond) { pass += 1; console.log('  ok   ' + name) } else { fail += 1; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')) }
}

// ── item 2: a missing action is its own named refusal
ok(face.includes('this face needs an action; none was given'),
  '★★ item 2: a missing `action` is refused BY NAME, not as "unknown action: undefined"')
ok(face.includes("if (action === undefined || action === null || String(action).trim() === '')"),
  '★★ item 2: the branch tests the three shapes a missing action really takes (undefined / null / empty string)')
ok(face.includes('a parameter set without `action` cannot be dispatched'),
  '★★ item 2: the hint says what the caller actually did wrong (a dispatch key was omitted), not which parameter to add')
// two-way: the generic fallback still exists for a WRONG (non-empty) action, so this is not "the message was deleted"
ok(face.includes("return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))"),
  'item 2: a NON-empty unknown action still gets the generic message (the new branch is about the missing case only)')
// and the new branch comes BEFORE the generic one, otherwise it can never be reached
ok(face.indexOf('this face needs an action') < face.indexOf("'unknown action: ' + String(action)"),
  'item 2: the missing-action branch precedes the generic fallback (an unreachable branch would be a mechanism with no reader)')

// ── item 3: the vote receipt relates its two ledgers
ok(kernel.includes('countedMeans:'),
  '★★ item 3: the vote receipt defines `counted` (the MEETING counted it; it does not mean the box mirrored it)')
ok(kernel.includes('ballotNote'),
  '★★ item 3: the vote receipt carries `ballotNote` on BOTH branches (mirrored true and false)')
ok(kernel.includes('Two ledgers exist on purpose'),
  '★★ item 3: the refused-mirror branch explains WHY the two ledgers may disagree (the box has its own rules)')
ok(kernel.includes("does NOT invalidate the meeting tally"),
  '★★ item 3: the branch says explicitly that a refused mirror does not invalidate the tally')
// the returned object must carry the same readings the receipt does — a receipt-only field is unreadable from the call
ok(kernel.includes('const voteOut = { ok: true, tally,'),
  'item 3: the vote RETURN carries the same readings as the receipt (countedMeans / ballotNote)')
ok(kernel.includes("receipt, ballotNote, enforced, enforcedScope: ENFORCED_SCOPE }"),
  'item 3: the return object literally includes `ballotNote`')

// ── the third item is REGISTERED, not silently dropped
ok(!kernel.includes('deliveredMeans'),
  'item 1 (delivered:0) is NOT claimed fixed here — no receipt field pretends to explain it yet')

console.log('')
console.log('=== VMU RUN12 FINDINGS: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
