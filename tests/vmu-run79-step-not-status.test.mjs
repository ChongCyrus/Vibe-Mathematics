#!/usr/bin/env node
// ★★★ TB-2739 (B) / RUN 79 (B8, MEASURED IN THE REAL LOG) — A REQUIRED PARAMETER MUST NOT SILENTLY DEFAULT.
//
// The published schema declares `op` `required: true`; the face answered a call without it as `op:"status"`. The 79th
// live run (build 6c689c86, office session `session-1b59cb29-…`) shows the cost: three calls carried `member` +
// `next_step` — arguments that belong to op:"step" — and omitted `op`; each came back `{"ok":true,"status":{…}}` with
// `turns` unchanged. The office read that as "step does nothing here" and switched to `op:"drive"`, which worked, and the
// run report recorded "step silently routed to status". It was not routed: the intent was DROPPED, and the receipt said
// success. The arguments are reproduced below verbatim (truncated `next_step`), so the replay is the measured call.
//
// WHAT THIS SUITE PROVES
//   §0 the guard exists in the FACE (before the member gate and the queue), and the schema still declares op required;
//   §1 the three real calls are now REFUSED BY NAME (VMU_TURN_OP_MISSING) with copyable alternatives, and NOTHING ran —
//      no status reading, no turn opened (`reached` is empty), so "ok" can no longer stand for "dropped";
//   §2 the refusal covers `{}`, `''` and whitespace, and it names the arguments it found instead of a generic complaint;
//   §3 the honest paths are untouched: every declared op still reaches the engine, for a caller and for a member;
//   §4 the same two answers hold on a REAL booted kernel (stub-free), not just on the factory stub;
//   §5 anti-lamp-off on a REAL COPY: restoring the old silent default turns §1 RED with the exact 79th-run receipt.
//
// Run: node tests/vmu-run79-step-not-status.test.mjs   (last line: === TB-2739 STEP NOT STATUS: N passed, M failed ===)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { REPO } from './_lib/repo-root.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const TURN_TOOL = join(REPO, 'vibe-math-vmu', 'tools', 'turn.js')
const TURN_SRC = readFileSync(TURN_TOOL, 'utf8')
const { makeTurnSpec } = await import('../vibe-math-vmu/tools/turn.js')
const { boot } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, extra) => {
  if (cond) { passed += 1; console.log('ok ' + passed + ' - ' + label); return true }
  failed += 1
  failures.push(label + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra).slice(0, 300)))
  console.log('FAIL - ' + label + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra).slice(0, 300)))
  return false
}
const section = (name) => console.log('\n' + name)
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const has = (text, needle) => typeof text === 'string' && text.includes(needle)
const ROOT_SESSION = 'session-1b59cb29-c175-4077-b0b3-0599b9183ceb' // the 79th run's office session (measured)
const MEMBER_SESSION = 'child-3f0d6c2e-5a1b-4c33-9d1e-79b6b0e4a3aa' // a member child session id (measured shape)

// The three calls the office really made. `next_step` is the measured prose (truncated after 60 chars: the field is not
// what the assertion is about — its PRESENCE is, because it is an argument of op:"step").
const REAL_CALLS = [
  { member: 'r-1', next_step: '你是常驻研究员 r-1。本回合请按顺序做，每步抄回执原文放进你的 progress：…' },
  { member: 'r-2', next_step: '你是常驻研究员 r-2。本回合按顺序做，每步把回执原文抄进 progress：…' },
  { member: 'r-acad', next_step: '你是主席 r-acad。本回合做三件事并逐条抄回执：…' },
]

// the tool spec built the way host.js builds it, over a kernel whose turn methods RECORD that they were reached: the
// question in §1/§3 is which calls get through the guard and where they land, not what a real loop would answer.
const makeStub = () => {
  const reached = []
  const kernel = {
    currentTurnMember: () => null,
    members: { roster: () => [] },
    resolveMemberToolDeny: () => ({ deny: new Set(), allow: null }),
    closureVoteView: () => ({ cast: false, eligible: [], votes: [] }),
    memberBySession: () => null,
    store: { read: () => [] },
    turn: {
      status: () => { reached.push('status'); return { ok: true, turns: 4, turnReceipts: [{ turn: 't-13' }] } },
      step: async () => { reached.push('step'); return { ok: true, awaiting: true, memberPrompt: { turnId: 't-14' }, memberActed: true } },
      drive: async () => { reached.push('drive'); return { ok: true, rounds: 1, memberActed: true } },
      supplyMemberReply: () => { reached.push('reply') },
      supplyStructuredReply: async () => { reached.push('reply-op'); return { ok: true, accepted: true } },
      reopenClosureVote: () => { reached.push('reopen-closure'); return { ok: true, reopened: true } },
      abandon: () => { reached.push('abandon'); return { ok: true, abandoned: true } },
      promptTurns: () => [],
      promptOf: () => null,
    },
  }
  return { kernel, reached }
}
const makeSpec = (kernel) => makeTurnSpec({
  param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
  refused: (code, message, hint) => ({ ok: false, code, message, hint }),
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel,
})
const rootExec = { agent: { id: ROOT_SESSION } }
const memberExec = { agent: { id: MEMBER_SESSION } }

section('§0 SOURCE: one guard in the FACE, before the member gate and the queue, under a schema that still says required')
ok(has(TURN_SRC, 'VMU_TURN_OP_MISSING'), '§0 ★ the refusal code VMU_TURN_OP_MISSING exists in the face')
ok(/if \(rawOp === ''\) \{/.test(TURN_SRC), '§0 ★ a call whose op is missing or blank takes one branch, by name (no fallthrough)')
const specForPins = makeSpec(makeStub().kernel)
const opParam = specForPins && specForPins.parameters && specForPins.parameters.op
ok(opParam && opParam.required === true, '§0 ★★ the published schema STILL declares op required - the fix enforces the promise, it does not weaken it', opParam && opParam.required)
const idxGuard = TURN_SRC.indexOf('VMU_TURN_OP_MISSING')
const idxMemberGate = TURN_SRC.indexOf('a member turn cannot run the institute turn engine')
const idxQueue = TURN_SRC.indexOf('const job = turnQueue.then(')
ok(idxGuard > 0 && idxGuard < idxMemberGate, '§0 ★★ the guard fires BEFORE the member gate (a member that omits op hears the real mistake, not VMU_NOT_PERMITTED)', { idxGuard, idxMemberGate })
ok(idxGuard > 0 && idxGuard < idxQueue, '§0 ★★ and BEFORE the queue: a call that cannot be understood never occupies the turn queue', { idxGuard, idxQueue })
ok(!/const op = String\(\(args && args\.op\) \|\| 'status'\)\n      const caller = agentIdOf\(exec\)/.test(TURN_SRC),
  '§0 ★ the old silent default line is gone from the face (the inner core keeps one, documented as unreachable from the tool)')

section('§1 THE THREE MEASURED CALLS: refused by name, nothing ran, and the alternatives are copyable')
for (const args of REAL_CALLS) {
  const stub = makeStub()
  const spec = makeSpec(stub.kernel)
  const r = await spec.run(args, rootExec)
  ok(r && r.ok === false, '§1 ' + args.member + ': the call is NOT answered ok:true (the 79th run\'s receipt was ok:true)', r && { ok: r.ok, code: r.code })
  ok(r && r.code === 'VMU_TURN_OP_MISSING', '§1 ' + args.member + ': refused BY NAME (VMU_TURN_OP_MISSING)', r && r.code)
  ok(r && !('status' in r) && !('turns' in r), '§1 ★★ ' + args.member + ': the receipt carries NO status reading (the reading that used to stand in for the dropped intent)', r && Object.keys(r))
  ok(stub.reached.length === 0, '§1 ★★ ' + args.member + ': NOTHING ran in the kernel - no status read, no turn opened', stub.reached)
  ok(r && has(r.message, '`member`') && has(r.message, '`next_step`'), '§1 ' + args.member + ': the message names the arguments it found, instead of a generic complaint', r && r.message)
  ok(r && has(r.message, 'op:"step"'), '§1 ' + args.member + ': and it says which op those arguments belong to', r && r.message)
  ok(r && has(r.hint, 'REACHABLE INSTEAD:'), '§1 ' + args.member + ': the hint carries the REACHABLE INSTEAD marker', r && r.hint)
  ok(r && has(r.hint, 'op: "status"') && has(r.hint, 'op: "step"') && has(r.hint, 'op: "drive"'),
    '§1 ★ ' + args.member + ': the hint names the three ways to say it (status / step / drive)', r && r.hint)
}

section('§2 THE DECLARED-REQUIRED CONTRACT: {}, empty and whitespace are the same mistake, named the same way')
for (const [label, args] of [['no arguments at all', {}], ['an empty string', { op: '' }], ['whitespace only', { op: '   ' }]]) {
  const stub = makeStub()
  const r = await makeSpec(stub.kernel).run(args, rootExec)
  ok(r && r.code === 'VMU_TURN_OP_MISSING', '§2 ' + label + ': refused by name', r && r.code)
  ok(stub.reached.length === 0, '§2 ' + label + ': and nothing ran', stub.reached)
}
const noArgs = await makeSpec(makeStub().kernel).run({}, rootExec)
ok(noArgs && has(noArgs.message, 'no arguments at all'), '§2 ★ an empty call says so plainly (a reader should not decode an empty key list)', noArgs && noArgs.message)
const statusOnlyArg = await makeSpec(makeStub().kernel).run({ detail: 'closure' }, rootExec)
ok(statusOnlyArg && statusOnlyArg.code === 'VMU_TURN_OP_MISSING' && has(statusOnlyArg.hint, 'op: "status"'),
  '§2 ★ even a status-ONLY argument (`detail`) is refused, and the hint names op:"status" - required means required', statusOnlyArg && { code: statusOnlyArg.code, hint: statusOnlyArg.hint })

section('§3 THE HONEST PATHS ARE UNTOUCHED: every declared op still reaches the engine')
{
  const stub = makeStub()
  const spec = makeSpec(stub.kernel)
  const status = await spec.run({ op: 'status' }, rootExec)
  ok(status && status.ok === true && Array.isArray(status.turns), '§3 op:"status" still answers at once with the reading', status && { ok: status.ok, turns: status.turns })
  ok(stub.reached.join(',') === 'status', '§3 and it reached the kernel exactly once', stub.reached)
  const stepStub = makeStub()
  const step = await makeSpec(stepStub.kernel).run({ op: 'step', member: 'r-1', phase: 'normal', why: 'suite: one round' }, rootExec)
  ok(step && step.ok === true && stepStub.reached.join(',') === 'step', '§3 ★ op:"step" with the same arguments still runs a round', { reached: stepStub.reached, code: step && step.code })
  const driveStub = makeStub()
  const drive = await makeSpec(driveStub.kernel).run({ op: 'drive', member: 'r-1', rounds: 1 }, rootExec)
  ok(drive && drive.ok === true && driveStub.reached.join(',') === 'drive', '§3 op:"drive" still runs', { reached: driveStub.reached, code: drive && drive.code })
  const memberStatus = await spec.run({ op: 'status' }, memberExec)
  ok(memberStatus && memberStatus.ok === true, '§3 a member still reads op:"status"', memberStatus && { ok: memberStatus.ok, code: memberStatus.code })
  const memberNoOp = await makeSpec(makeStub().kernel).run({ member: 'r-1' }, memberExec)
  ok(memberNoOp && memberNoOp.code === 'VMU_TURN_OP_MISSING',
    '§3 ★★ a MEMBER that omits op hears the real mistake (VMU_TURN_OP_MISSING, not VMU_NOT_PERMITTED): the guard runs first', memberNoOp && memberNoOp.code)
}

section('§4 REAL KERNEL: the same two answers on a booted instance (stub-free)')
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-run79-step-not-status-'))
  const h = await boot({ root, clock: () => 1_800_000_000_000, settings: { 'vmu.turn.deliverMode': 'caller' } })
  const real = await h.call('vibe_vmu_turn', REAL_CALLS[0])
  ok(real && real.ok === false && real.code === 'VMU_TURN_OP_MISSING', '§4 ★ the measured call is refused on the real kernel too', real && { ok: real.ok, code: real.code })
  ok(real && has(real.hint, 'REACHABLE INSTEAD:') && has(real.hint, 'op: "status"'), '§4 the real hint is copyable', real && real.hint)
  const reading = await h.call('vibe_vmu_turn', { op: 'status' })
  ok(reading && reading.ok === true && Array.isArray(reading.turns), '§4 ★ op:"status" still returns the loop reading', reading && { ok: reading.ok, turns: reading.turns })
}

section('§5 ANTI-LAMP-OFF: restoring the silent default on a REAL COPY turns §1 RED with the 79th-run receipt')
{
  const tree = join(mkdtempSync(join(tmpdir(), 'vmu-run79-step-mutant-')), 'vmu')
  cpSync(join(REPO, 'vibe-math-vmu'), tree, { recursive: true })
  const file = join(tree, 'tools', 'turn.js')
  const pristine = readFileSync(file, 'utf8')
  const pristineSha = sha256(pristine)
  const reverted = pristine.replace(/      const rawOp = args && typeof args\.op === 'string'[\s\S]*?      const op = rawOp\n/, "      const op = String((args && args.op) || 'status')\n")
  ok(reverted !== pristine, '§5 the mutation actually changed the source text (the guard block was removed)')
  writeFileSync(file, reverted, 'utf8')
  try {
    const { makeTurnSpec: makeMutantSpec } = await import(pathToFileURL(file).href)
    const stub = makeStub()
    const mutant = makeMutantSpec({
      param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
      refused: (code, message, hint) => ({ ok: false, code, message, hint }),
      TOOL_NAMES: { turn: 'vibe_vmu_turn' },
      kernel: stub.kernel,
    })
    const r = await mutant.run(REAL_CALLS[0], rootExec)
    ok(r && r.ok === true, '★ §5 RED: with the silent default restored the same call reports success again', r && { ok: r.ok, code: r.code })
    ok(r && 'status' in r && !('memberActed' in r),
      '★ §5 RED: and the success is a STATUS READING - the 79th run\'s `{"ok":true,"status":{…}}` receipt, reproduced exactly', r && Object.keys(r).slice(0, 8))
    ok(stub.reached.join(',') === 'status', '★ §5 RED: the only thing that ran was a status read, so the turn was never opened', stub.reached)
  } finally {
    writeFileSync(file, pristine, 'utf8')
    ok(sha256(readFileSync(file, 'utf8')) === pristineSha, '§5 the copy RESTORED byte-identically to the pristine sha256')
    rmSync(dirname(tree), { recursive: true, force: true })
  }
}

console.log('\n=== TB-2739 STEP NOT STATUS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }
