// tests/vmu-run78-member-turn-face.test.mjs — TB-2733 / RUN 78 D8.
//
// RUN 78 measured a member face that advertised an engine it could not run: the wire carried the WHOLE `vibe_vmu_turn`
// face, member r-3 called `{ op: "step" }` at t-17, got `VMU_NOT_PERMITTED`, and the hint told it to "remove
// vibe_vmu_turn from tools.allow" — a lever a member cannot pull (and one the office had never set: the host has no
// seat table for host faces at all, so nothing ever narrowed this face for a member).
//
// The ruling is B: narrow at the ACTION level. A member's reachable op set is `MEMBER_TURN_OPS` — ONE exported constant
// in `vibe-math-vmu/tools/turn.js` that drives FOUR exits together:
//   ① the `op` parameter description's member sentence ② the runtime guard ③ the refusal hint (copyable, names a
//   reachable next step) ④ the `status` receipt (`memberOps` + `memberOpsMeans`).
// Four hand-written copies is exactly how wire/guard/receipt drift apart (TB-2710, TB-2712, TB-2720).
//
// What this suite holds the mechanism to:
//   §0 one constant, four exits: the constant exists, is frozen, and each exit is BUILT from it (not merely equal to it)
//   §1 SET EQUALITY: the ops the runtime really lets a member through == MEMBER_TURN_OPS (sorted, no counts)
//   §2 every engine op is refused BY NAME for a member, and the hint is copyable: REACHABLE INSTEAD, op:"status"
//      verbatim, reply relayed by the office, and NO `tools.allow` (the unreachable-remedy defect of RUN 78 D8)
//   §3 the chair/root seat is NOT narrowed: all seven ops still reach the engine (a fix that overflows is a new defect)
//   §4 teeth: source pins so a re-introduced literal guard or a hand-written description turns this suite RED
//
// Run: node tests/vmu-run78-member-turn-face.test.mjs   (last line: === TB-2733 MEMBER TURN FACE: N passed, M failed ===)

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TURN_TOOL = join(REPO, 'vibe-math-vmu', 'tools', 'turn.js')

const { makeTurnSpec, MEMBER_TURN_OPS, memberOpsText } = await import('../vibe-math-vmu/tools/turn.js')
const turnSource = await readFile(TURN_TOOL, 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 400)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 400)))
  return false
}
const section = (name) => console.log('\n' + name)
const has = (text, needle) => typeof text === 'string' && text.includes(needle)
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

// ── the seven ops the FACE publishes (chair/office keep all of them) and the six a member must not reach ────────────
const SEVEN = ['step', 'drive', 'reply', 'status', 'prompt', 'abandon', 'reopen-closure']
// ★ RULE E: the list is written as a LITERAL so its non-emptiness is visible to the declaration-criterion audit;
// §1 re-derives it from SEVEN and asserts the two agree, so the literal cannot drift from the face's own vocabulary.
const SIX_ENGINE = ['step', 'drive', 'reply', 'prompt', 'abandon', 'reopen-closure']
const MEMBER_SESSION = 'child-39740ef6-5edc-4d78-887a-e005a49088a6' // RUN 78 r-3's child session id (measured)
const ROOT_SESSION = 'session-005ee8a4-0154-4c84-a296-1d6f7e1d1fc4' // RUN 78 root session id (measured)
const MEMBER_ID = 'r-3'

// the tool spec built the way host.js builds it (same factory, same param/refused helpers) over a kernel STUB whose
// turn methods record that they were reached — the point of §1/§3 is WHICH CALLS GET THROUGH THE GUARD, not what a
// real loop would answer.
const makeKernel = () => {
  const reached = []
  const kernel = {
    currentTurnMember: () => null,
    members: { roster: () => [] },
    resolveMemberToolDeny: () => ({ deny: new Set(), allow: null }),
    closureVoteView: () => ({ cast: false, eligible: [MEMBER_ID], votes: [] }),
    memberBySession: (id) => (id === MEMBER_SESSION ? MEMBER_ID : null),
    store: {
      read: (key) => key === 'turns'
        ? [{ member: MEMBER_ID, turn: 't-17', codes: ['VMU_NOT_PERMITTED'], skipped: 0, emptyReply: false, status: 'completed', at: '2026-11-10T13:38:28.589Z' }]
        : [],
    },
    turn: {
      status: () => { reached.push('status'); return { ok: true, turns: 0, turnReceipts: [{ turn: 't-17' }], skippedTotals: null } },
      step: async () => { reached.push('step'); return { ok: true, awaiting: true, memberPrompt: { turnId: 't-1', text: 'prompt body' } } },
      drive: async () => { reached.push('drive'); return { ok: true, rounds: 1 } },
      supplyStructuredReply: async () => { reached.push('reply'); return { ok: true, accepted: true, source: 'tool' } },
      abandon: () => { reached.push('abandon'); return { ok: true, abandoned: true } },
    },
    reopenClosureVote: () => { reached.push('reopen-closure'); return { ok: true, reopened: true } },
  }
  return { kernel, reached }
}
const makeSpec = (kernel) => makeTurnSpec({
  param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
  refused: (code, message, hint) => ({ ok: false, code, message, hint }),
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel,
})
const spec = makeSpec(makeKernel().kernel)
// the sentence a caller reads for `op` is the OP parameter's description (the ruling says "op 描述里的成员句")
const opParam = spec && spec.parameters && spec.parameters.op ? spec.parameters.op : null
const opDescription = opParam && typeof opParam.description === 'string' ? opParam.description : ''
const call = async (op, exec) => spec.run({ op }, exec)
const memberExec = { agent: { id: MEMBER_SESSION } }
const rootExec = { agent: { id: ROOT_SESSION } }

console.log('=== TB-2733 MEMBER TURN FACE (member ops = [' + [...MEMBER_TURN_OPS].join(', ') + ']; engine ops = ' + SIX_ENGINE.length + ' refused by name) ===')

// ── §0 ONE CONSTANT, FOUR EXITS ───────────────────────────────────────────────────────────────────────────────────────
section('§0 one constant, four exits (one value builds the wire sentence, the guard, the hint and the receipt)')
ok(Array.isArray(MEMBER_TURN_OPS), '§0 ★ MEMBER_TURN_OPS is exported as an array', typeof MEMBER_TURN_OPS)
ok(Object.isFrozen(MEMBER_TURN_OPS), '§0 ★ and it is FROZEN - a caller cannot widen the member face by mutating it')
ok(sameSet(MEMBER_TURN_OPS, ['status']), '§0 ★ the member op set is exactly ["status"] (the TB-2733 ruling, not a guess)', [...(MEMBER_TURN_OPS || [])])
ok(typeof memberOpsText === 'function', '§0 ★ ONE formatter is exported too - the exits share it instead of four hand-written copies')
const sentence = typeof memberOpsText === 'function' ? memberOpsText() : ''
ok(has(sentence, 'op:"status"'), '§0 ★★ the shared sentence names op:"status" verbatim (copyable)', sentence)
ok(has(opDescription, sentence), '§0 ★★ EXIT 1: the op description carries the member sentence BUILT FROM the constant', opDescription.slice(-260))
ok(has(opDescription, '成员'), '§0 ★ and the description says it to members in the same sentence', opDescription.slice(-260))
// the SHARED SENTENCE must not advertise engine ops as member-reachable (the general Chinese explanation may name them;
// this sentence is what a member reads as "what may I call").
// ★ RULE E: a for-loop over SIX_ENGINE runs zero assertions if the list is empty, and every() is TRUE on an empty
// list - so the non-empty guard and the check live in ONE assertion (still names every op it checked).
ok(SIX_ENGINE.length > 0 && SIX_ENGINE.every((op) => !has(sentence, '"' + op + '"')),
  '§0 ★ the shared member sentence does not advertise any of the six engine ops', { ops: SIX_ENGINE, sentence })

// ── §1 SET EQUALITY (no counts: the runtime's real allowance vs the constant) ─────────────────────────────────────────
section('§1 SET EQUALITY: what a member can really run == MEMBER_TURN_OPS')
const allowedByRuntime = []
for (const op of SEVEN) {
  const r = await call(op, memberExec)
  const refusedByGuard = r && r.ok === false && r.code === 'VMU_NOT_PERMITTED'
  if (!refusedByGuard) allowedByRuntime.push(op)
}
ok(sameSet(allowedByRuntime, MEMBER_TURN_OPS),
  '§1 ★★★ runtime allowance (measured by calling all seven ops) is the SAME SET as MEMBER_TURN_OPS - counts would hide which side moved',
  { allowedByRuntime, constant: [...(MEMBER_TURN_OPS || [])] })

for (const op of SIX_ENGINE) {
  const r = await call(op, memberExec)
  ok(r && r.ok === false && r.code === 'VMU_NOT_PERMITTED',
    '§1 ★ member calling op:"' + op + '" is refused BY NAME (VMU_NOT_PERMITTED) - one op per check',
    r && { code: r.code, ok: r.ok })
}
ok(SIX_ENGINE.length === 6, '§1 ★ all six engine ops were named individually (step/drive/reply/prompt/abandon/reopen-closure)')
const statusReceipt = await call('status', memberExec)
ok(statusReceipt && statusReceipt.ok === true, '§1 ★ op:"status" is the ONE member-reachable op and it succeeds', statusReceipt && { ok: statusReceipt.ok, code: statusReceipt.code })
ok(Array.isArray(statusReceipt && statusReceipt.memberOps), '§1 ★★ EXIT 4: the status receipt carries memberOps (machine-readable "what I may call")', statusReceipt && Object.keys(statusReceipt || {}))
if (Array.isArray(statusReceipt && statusReceipt.memberOps)) {
  ok(sameSet(statusReceipt.memberOps, MEMBER_TURN_OPS),
    '§1 ★★ receipt.memberOps is the SAME SET the guard enforces (set equality, not count)', statusReceipt.memberOps)
}
ok(has(statusReceipt && statusReceipt.memberOpsMeans, sentence), '§1 ★ memberOpsMeans explains it with the SAME shared sentence', statusReceipt && statusReceipt.memberOpsMeans)

// ── §2 THE REFUSAL HINT IS COPYABLE (RUN 78 D8: the old hint named a lever a member cannot pull) ─────────────────────
section('§2 the refusal hint is copyable: REACHABLE INSTEAD + op:"status" + reply relayed + no tools.allow')
for (const op of SIX_ENGINE) {
  const r = await call(op, memberExec)
  const hint = (r && r.hint) || ''
  ok(has(hint, 'REACHABLE INSTEAD:'), '§2 ★ op:"' + op + '" refusal hint has a REACHABLE INSTEAD: branch', hint.slice(0, 300))
  ok(has(hint, 'op:"status"'), '§2 ★★ op:"' + op + '" hint names op:"status" VERBATIM (copy-paste ready)', hint.slice(0, 300))
  ok(has(hint, 'vibe_vmu_turn { op: "status" }'), '§2 ★★ op:"' + op + '" hint spells the whole call, not just the op name', hint.slice(0, 300))
  ok(!has(hint, 'tools.allow'), '§2 ★★★ op:"' + op + '" hint does NOT tell a member to edit tools.allow (the RUN 78 D8 defect)', hint)
  ok(has(hint, 'reply') && (has(hint, 'office') || has(hint, 'relay')),
    '§2 ★ op:"' + op + '" hint says the report is relayed by the office, so the member does not call reply itself', hint.slice(0, 300))
  for (const engineOp of SIX_ENGINE) {
    if (engineOp === 'reply') continue
    ok(!has(hint, 'op:"' + engineOp + '"'), '§2 ★ op:"' + op + '" hint does not instruct op:"' + engineOp + '" (a member cannot run it)', hint.slice(0, 300))
  }
}
// copying the hint really works: the op the hint names answers without a refusal.
const copy = await call('status', memberExec)
ok(copy && copy.ok === true && !copy.code, '§2 ★★★ copying the hint (vibe_vmu_turn { op:"status" }) really WORKS - the remedy is reachable', copy && { ok: copy.ok, code: copy.code })

// ── §3 THE CHAIR/ROOT SEAT IS NOT NARROWED ───────────────────────────────────────────────────────────────────────────
section('§3 the chair/root seat still reaches all seven ops (a fix that overflows into the office is a new defect)')
const chair = makeKernel()
const chairSpec = makeSpec(chair.kernel)
for (const op of SEVEN) {
  const r = await chairSpec.run(op === 'reply' ? { op, report: { say: 'chair relays' } } : { op }, rootExec)
  ok(!(r && r.ok === false && r.code === 'VMU_NOT_PERMITTED'),
    '§3 ★ chair op:"' + op + '" is NOT refused by the member guard', r && { ok: r.ok, code: r.code })
}
const chairStatus = await chairSpec.run({ op: 'status' }, rootExec)
ok(chairStatus && chairStatus.ok === true, '§3 ★ chair status succeeds', chairStatus && chairStatus.code)
ok(chairStatus && chairStatus.memberOps === undefined,
  '§3 ★ the chair receipt does NOT carry memberOps (the field is about a member session, not the office)', chairStatus && Object.keys(chairStatus))
ok(chair.reached.includes('step') && chair.reached.includes('drive') && chair.reached.includes('reply') && chair.reached.includes('abandon') && chair.reached.includes('reopen-closure'),
  '§3 ★★ the engine methods really WERE reached from the chair seat', chair.reached)

// ── §4 TEETH: source pins (a re-introduced literal guard or a hand-written description turns this RED) ───────────────
section('§4 teeth: the guard reads the constant, and no literal op list survives anywhere on the member path')
ok(/export const MEMBER_TURN_OPS = Object\.freeze\(\['status'\]\)/.test(turnSource),
  '§4 ★★ the constant is declared in tools/turn.js exactly once, frozen, with the ruling value')
ok(/const memberAllowed = MEMBER_TURN_OPS\.includes\(op\)/.test(turnSource),
  '§4 ★★★ the runtime guard READS the constant (not a literal op comparison)', turnSource.split('\n').filter((l) => l.includes('memberAllowed')).join(' / ').slice(0, 300))
ok(!/const memberAllowed = op === 'status' \|\| op === 'reply'/.test(turnSource),
  '§4 ★★★ the old literal guard (status || reply) is GONE - if it comes back, L1 turns this red')
ok(/memberOps: MEMBER_TURN_OPS\.slice\(\)/.test(turnSource),
  '§4 ★★ the status receipt builds memberOps from the constant, not from a hand-written array')
ok(/memberOpsText\(\)/.test(turnSource),
  '§4 ★★ the shared formatter is really used by the exits (description/hint/receipt means)')
const guardLine = turnSource.split('\n').find((l) => l.includes('const memberAllowed =')) || ''
ok(!guardLine.includes("'reply'"), '§4 ★ the guard line itself names no engine op literal', guardLine.trim())

console.log('\n=== TB-2733 MEMBER TURN FACE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('FAILED: ' + failures.length + ' check(s)'); process.exitCode = 1 }
