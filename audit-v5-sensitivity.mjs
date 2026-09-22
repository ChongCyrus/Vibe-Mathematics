// ============================================================
// V5 SENSITIVITY PROBES — prove the suites are not vacuous.
//
// Each probe copies vibe-math-v5.js, applies ONE targeted mutation that breaks a
// specific guarantee, and runs the referencing suite against the mutated copy. A probe
// PASSES when the suite goes RED (non-zero exit) — i.e. the assertions really do detect
// that break. A probe that stays green means the suite has a blind spot.
//
// The prompt-integrity block below exists because the 2026-09 field test found a bug
// that 123 tool-level assertions could not see: every member's brief named the WRONG
// member. Any guarantee about the TEXT a member reads must have a probe that proves
// prompt-v5-integrity.test.mjs detects its violation.
//
// Run: node audit-v5-sensitivity.mjs
// ============================================================
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SRC = new URL('./vibe-math-v5/vibe-math-v5.js', import.meta.url)
// Keyed by the EXACT suite filename a probe names in its `ref`. A ternary chain here once
// silently routed every new probe to the wrong suite (which then stayed green because the
// mutation did not touch what it tests) — that reports a blind spot that does not exist.
const TESTS = {}
for (const f of ['selfdrive-v5.mjs', 'e2e-v5-round2.test.mjs', 'prompt-v5-integrity.test.mjs', 'formal-verify-v5.test.mjs']) {
  TESTS[f] = fileURLToPath(new URL('./' + f, import.meta.url))
}
const original = readFileSync(SRC, 'utf8')
const REPO = fileURLToPath(new URL('.', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'v5-sens-'))

// Each probe: { name, ref, guarantee, from, to }
// `from` must occur exactly once, so a mutation can never quietly hit the wrong site.
const probes = [
  {
    // The m floor is enforced by THREE cooperating checks (an early `bTrue + bFalse < m`
    // return, the conflict check, and a final `bTrue >= m`), so a single weakened check is
    // masked by the others and is a SEMANTICALLY INERT mutation — it must never be used as
    // a probe (it would look like a "blind spot"). Forcing the quorum itself to 1 breaks
    // the rule on every path at once, which is exactly the guarantee under test.
    name: 'quorum-forced-to-one',
    ref: 'selfdrive-v5.mjs',
    guarantee: '④ only >= m boolean votes may verify (m must be min(quorumCap, |voters|))',
    from: "      return Math.max(1, Math.min(cap, voterCount()))",
    to: "      return 1",
  },
  {
    name: 'abstention-counts-as-true',
    ref: 'selfdrive-v5.mjs',
    guarantee: '⑤ an abstention must NOT count toward the quorum',
    from: "        else if (p === 0) bFalse += 1\n        else abstain += 1",
    to: "        else if (p === 0) bFalse += 1\n        else { abstain += 1; bTrue += 1 }",
  },
  {
    // `judgeVerdict` checks the m floor, then the conflict, then the floor again, and each
    // guard masks the next — so deleting a guard is inert. The behaviour-changing break is
    // letting a CONFLICT pass as a verdict, which is what this mutation does.
    name: 'conflict-allowed',
    ref: 'selfdrive-v5.mjs',
    guarantee: '④ a conflicting 1 vs 0 must BLOCK the verdict',
    from: "        return Object.assign(base, { outcome: 'undecided', reason: 'conflicting assertions (true=' + bTrue + ', false=' + bFalse + ')' })",
    to: "        return Object.assign(base, { outcome: 'true', reason: 'conflicting assertions (true=' + bTrue + ', false=' + bFalse + ')' })",
  },
  {
    name: 'temp-worker-can-vote',
    ref: 'selfdrive-v5.mjs',
    guarantee: '⑦ a temp worker must NOT be able to vote',
    from: "      if (member.kind === 'temp') {\n        // Temp workers have no vote",
    to: "      if (false) {\n        // Temp workers have no vote",
  },
  {
    name: 'academician-gate-removed',
    ref: 'selfdrive-v5.mjs',
    guarantee: '⑬ only the academician may assign tasks',
    from: "        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can assign tasks' }",
    to: "        return { ok: false, code: 'NO_GATE', message: 'x' }",
  },
  {
    name: 'spawn-not-registered-inflight',
    ref: 'selfdrive-v5.mjs',
    guarantee: '⑯ the founding turn must be registered in-flight or its end is dropped',
    from: "      inflight.set(started.childId, shortId())",
    to: "",
  },
  {
    name: 'group-chat-not-fanned-out',
    ref: 'selfdrive-v5.mjs',
    guarantee: '③ group chat must reach every other member',
    from: "      if (to === 'all' || to === '') targets = activeMembers().filter((m) => m.id !== from)",
    to: "      if (to === 'all' || to === '') targets = activeMembers().filter((m) => m.id !== from).slice(0, 1)",
  },
  {
    name: 'verify-round-advances-anyway',
    ref: 'selfdrive-v5.mjs',
    guarantee: '④ a round must not advance without every voter answering',
    from: "      const missing = need.filter((id) => !vs.votes[id])\n      if (missing.length) {",
    to: "      const missing = need.filter((id) => !vs.votes[id])\n      if (false) {",
  },
  {
    name: 'fire-does-not-release',
    ref: 'selfdrive-v5.mjs',
    guarantee: '⑨ firing must really release the resident child',
    from: "          if (typeof subagents.drainContinuableChildren === 'function') await subagents.drainContinuableChildren(rootAgent, [target.childId])",
    to: "          if (false) await subagents.drainContinuableChildren(rootAgent, [target.childId])",
  },
  {
    name: 'solve-vote-not-unanimous',
    ref: 'selfdrive-v5.mjs',
    guarantee: '⑥ the institute must not stop unless EVERY voter agrees',
    from: "      if (!vs.every((id) => solveVotes.get(id) === true)) return false",
    to: "      if (false) return false",
  },
  // ── probes added after the round-2 audit found these defects ──────────────
  {
    name: 'fallback-state-never-loaded',
    ref: 'e2e-v5-round2.test.mjs',
    guarantee: '⑰ the file fallback must LOAD persisted state before any read (restart safety)',
    from: "      if (backend.kind === 'file' && typeof backend.load === 'function') await backend.load()",
    to: "      if (false) await backend.load()",
  },
  {
    name: 'solve-vote-never-re-evaluated',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '⑥ a solve vote landing OUTSIDE a meeting must still stop the institute',
    // The anchor must include the CALL. An `if (false)` inserted before the comment would
    // leave the real `await checkSolved()` below it untouched — an inert mutation that
    // would masquerade as a blind spot.
    from: "      solveVotes.set(memberId, val === true)\n      // Evaluate the stop condition on EVERY solve vote, not only when a meeting\n      // finalizes. A vote that lands after the meeting closed — a late reply, or an\n      // ordinary round carrying vote_solved — would otherwise be recorded and never\n      // read, leaving a unanimously-concluded institute running forever.\n      await checkSolved()",
    to: "      solveVotes.set(memberId, val === true)",
  },
  {
    name: 'proposal-only-kicks-scheduler',
    ref: 'selfdrive-v5.mjs',
    guarantee: '④ a proposal must actually START, not just ask the scheduler to try',
    from: "      await armNextVerify()\n      if (!hasVerifyInFlight()) await scheduleNext()",
    to: "      await scheduleNext()",
  },
  {
    name: 'begin-not-exclusive',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '⑱ a second proposal must QUEUE, never start a concurrent ballot',
    from: "      if (beginLock) return\n      if (currentVerify()) return\n      beginLock = true",
    to: "      beginLock = true",
  },
  // NOTE — a probe for `continueMeetingRound`'s `if (finalizeLock) { armHeartbeat(); return }`
  // re-arm was REMOVED, not because the re-arm is unnecessary but because the state it
  // guards is UNREACHABLE, so no black-box probe can detect its removal:
  //   · `schedulePass` handles a live meeting BEFORE it looks at a verification, and
  //   · `startMeeting` parks any meeting while `hasVerifyInFlight()`,
  // so a meeting and a running verify settlement can never overlap. The re-arm stays in
  // the code as cheap insurance against a future ordering change; leaving a probe that can
  // never go red would be a false "detection" and is worse than no probe.
  {
    name: 'meeting-never-finalized',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '⑲ a meeting that collected every input must actually finalize and write its minutes',
    from: "      finalizeLock = 'meeting'\n      try {\n        await finalizeMeeting(meeting)",
    to: "      finalizeLock = 'meeting'\n      try {\n        meeting = null",
  },

  // ── PROMPT / INTERACTION INTEGRITY PROBES ────────────────────────────────
  // These are the probes that would have caught the 2026-09 field-test bug. Every one
  // of them breaks something a member READS (identity, roster, framing, persona), and
  // prompt-v5-integrity.test.mjs must go RED for each.
  {
    name: 'brief-names-the-last-woken-member',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '⑳ a prompt\'s [状态] block must name the member it is sent to (the exact field bug: briefs named the previous member)',
    from: "    function stateBlock(member) {\n      return briefBlock(member)\n    }",
    to: "    function stateBlock(member) {\n      return briefBlock(memberById(currentMember) || activeMembers()[0] || member)\n    }",
  },
  {
    name: 'joiner-absent-from-own-roster',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '⑳ a founding brief must show the roster INCLUDING its reader (roster committed before the prompt is built)',
    from: "      member.phase = 'active'\n      member.childId = ''\n      await putMember(member)",
    to: "      member.childId = ''\n      await putMember(member)",
  },
  {
    name: 'inbox-message-delivered-twice',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉑ one prompt must not deliver the same message twice',
    from: "      if (pending.length) await ackPending(pending)\n      const base = typeof baseFn === 'function' ? baseFn() : baseFn",
    to: "      const base = typeof baseFn === 'function' ? baseFn() : baseFn\n      if (pending.length) await ackPending(pending)",
  },
  {
    name: 'charter-rewritten-on-resume',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉒ the charter is frozen at hire; a resume must not rewrite the induction snapshot',
    from: "      const persona = member.persona || memberPersona(member)",
    to: "      const persona = memberPersona(member)",
  },
  {
    name: 'resume-framed-as-induction',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉓ a rebuilt session must not be told it just joined the institute',
    from: "      const resume = mode === 'resume'",
    to: "      const resume = false",
  },
  {
    name: 'meeting-proposal-misattributed',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉔ a relayed message must carry its TRUE sender, never the last-woken member',
    from: "          await say(callerId, { to: 'voters', kind: 'voters', text: '提议开会：「' + agenda + '」（' + kind + '）' })",
    to: "          await say(academicianId() || callerId, { to: 'voters', kind: 'voters', text: '提议开会：「' + agenda + '」（' + kind + '）' })",
  },
  {
    name: 'office-impersonates-a-member',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉕ the office/host caller must resolve to the office, not to a guessed member',
    // The FAITHFUL regression mutation: restore the old "answer with whoever this session
    // woke last" fallback, which made the office's own assignments resolve to a random
    // researcher and be refused as V5_NOT_ACADEMICIAN.
    from: "        try { if (rootOf(agent) === agent) return 'office' } catch (e) { /* fall through */ }",
    to: "        if (currentMember && memberById(currentMember)) return currentMember",
  },
  {
    name: 'office-assignment-framed-as-academician',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉖ an assignment must be framed by its true origin (office vs academician)',
    from: "      if (m.kind === 'assign') return (m.from === 'office' ? '【所办分派】' : '【院士分派】') + m.text",
    to: "      if (m.kind === 'assign') return '【院士分派】' + m.text",
  },
  {
    name: 'nudge-mislabelled-as-assignment',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉗ a nudge is supervision, not an assignment, and must say so',
    from: "        to, kind: 'nudge',",
    to: "        to, kind: 'assign',",
  },
  {
    name: 'framework-notice-sent-as-self-message',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉘ framework feedback must actually reach the member (not be refused as a self-message)',
    from: "      return await say('framework', { to: memberId, kind: 'notice', text: String(text) })",
    to: "      return await say(memberId, { to: memberId, kind: 'notice', text: String(text) })",
  },
  {
    name: 'failed-member-hidden',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉙ a member that failed to provision must be visible in [未就位]',
    from: "      if (absent.length) b.push('[未就位] ' + absent.map((m) => m.id + '（' + m.phase + '）').join('、'))",
    to: "      if (false) b.push('[未就位] ' + absent.map((m) => m.id + '（' + m.phase + '）').join('、'))",
  },
  {
    name: 'leaderless-charter-invents-a-leader',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉚ with academician:false no charter may name a leader who does not exist',
    from: "      const a = academicianId()\n      const L = [",
    to: "      const a = 'acad'\n      const L = [",
  },
  {
    name: 'reply-spec-hides-the-objection-channel',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉛ every field the framework honours must be documented in the reply spec',
    from: "      L.push('  \"reject_assign\": {\"task_id\":\"t-3\",\"why\":\"你对这项分派的异议理由\"}",
    to: "      if (false) L.push('  \"reject_assign\": {\"task_id\":\"t-3\",\"why\":\"你对这项分派的异议理由\"}",
  },
  {
    name: 'task-owner-rewoken-unpaced',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉜ a task owner must be pushed on a paced cadence, not in an unbounded tight loop',
    from: "        if ((now() - (lastActiveAt.get(m.id) || 0)) < idleMs) continue",
    to: "        if (false) continue",
  },
  {
    name: 'verify-preempts-a-live-meeting',
    ref: 'prompt-v5-integrity.test.mjs',
    guarantee: '㉝ a verification proposed during a meeting must QUEUE, never start concurrently (the two are mutually exclusive)',
    from: "      if (meeting) return\n      // Only one begin may be in flight.",
    to: "      // Only one begin may be in flight.",
  },

  // ── LEAN FORMAL VERIFICATION PROBES (docs/formal-verification.md) ─────────
  {
    name: 'formal-off-is-not-a-no-op',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㉞ the default mode must be a TRUE no-op (no Lean text, no gate)',
    from: "    const formalOn = () => formalMode() !== 'off'",
    to: "    const formalOn = () => true",
  },
  {
    name: 'unknown-formal-mode-upgrades',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㉟ an unknown mode must degrade to off, never to a STRONGER mode (a typo must not force formalization)',
    from: "        out.formalVerify = ['off', 'encourage', 'require'].indexOf(out.formalVerify) !== -1 ? out.formalVerify : 'off'",
    to: "        out.formalVerify = ['off', 'encourage', 'require'].indexOf(out.formalVerify) !== -1 ? out.formalVerify : 'require'",
  },
  {
    name: 'fidelity-switch-removed',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㊱ a passing Lean run must switch the voting prompt to a FIDELITY review (the whole point of the feature)',
    from: "      if (rec.status === 'passed') {\n        // The whole point of the feature: the review subject CHANGES.",
    to: "      if (false) {\n        // The whole point of the feature: the review subject CHANGES.",
  },
  {
    name: 'require-gate-removed',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㊲ require mode must withhold a true/false verdict until the object is Lean-passed or explicitly blocked',
    from: "          if (formalMode() === 'require' && !formalGateOk(rec)) {",
    to: "          if (false) {",
  },
  {
    name: 'blocked-note-not-required',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㊳ a "we judged it infeasible" record must carry a reason (the difficulty decision must be auditable, not silent)',
    from: "        if (!note) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）",
    to: "        if (false) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）",
  },
  {
    name: 'proof-not-archived-under-verified',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㊴ a passing proof must be archived as that object\'s proof (Verified/Lean/<id>.lean)',
    from: "        if (passed) await writeTextRel('Verified/Lean/' + target + '.lean', body)",
    to: "        if (false) await writeTextRel('Verified/Lean/' + target + '.lean', body)",
  },
  {
    name: 'reusable-lib-written-inside-the-institute',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㊵ reuse must be CROSS-PROJECT: reusable definitions go to the global Formal/Lib, not inside one institute',
    from: "        const okWrite = await writeTextAbs(instRootless(rel), body)",
    to: "        const okWrite = await writeTextRel(rel, body)",
  },
  {
    name: 'lean-path-guard-naive',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㊶ the Lean path guard must normalise .. (a string prefix check lets a traversal through)',
    from: "      const abs = leanAbsPath(rel)\n      if (abs === null) {",
    to: "      const abs = (rel.charAt(0) === '/' || /^[a-z]:/i.test(rel)) ? rel.replace(/\\\\/g, '/') : instRoot() + '/' + rel\n      if (abs.indexOf(vibeRoot() + '/') !== 0) {",
  },
  {
    name: 'lean-tools-not-registered',
    ref: 'formal-verify-v5.test.mjs',
    guarantee: '㊷ the three Lean tools must be registered (agents can only formalize if the tools exist)',
    from: "  registerTool('vibe_v5_lean_run',",
    to: "  if (false) registerTool('vibe_v5_lean_run',",
  },
]

let probesPassed = 0
let probesFailed = 0
console.log('-- V5 sensitivity probes --')
console.log('(a probe passes when breaking the guarantee turns the suite RED)')
console.log('')

for (const p of probes) {
  const occurrences = original.split(p.from).length - 1
  if (occurrences !== 1) {
    console.error('  SETUP-FAIL - ' + p.name + ': anchor matched ' + occurrences + ' times (need exactly 1)')
    probesFailed++
    continue
  }
  const mutated = original.replace(p.from, p.to)
  const file = join(dir, p.name + '.js')
  writeFileSync(file, mutated, 'utf8')
  const testPath = TESTS[p.ref]
  if (testPath === undefined) {
    console.error('  SETUP-FAIL - ' + p.name + ': ref "' + p.ref + '" is not a known suite')
    probesFailed++
    continue
  }
  const r = spawnSync(process.execPath, [testPath], {
    env: Object.assign({}, process.env, { V5_PLUGIN: file }),
    encoding: 'utf8',
    cwd: REPO,
  })
  const red = r.status !== 0
  if (red) {
    probesPassed++
    console.log('  ok - ' + p.name + ' [' + p.ref + '] => suite went RED as required  [' + p.guarantee + ']')
  } else {
    probesFailed++
    console.error('  BLIND SPOT - ' + p.name + ' [' + p.ref + '] => suite stayed GREEN, so it does NOT detect: ' + p.guarantee)
  }
}

rmSync(dir, { recursive: true, force: true })
console.log('')
console.log('sensitivity: ' + probesPassed + ' probes detected the break, ' + probesFailed + ' blind spots')
if (probesFailed) process.exit(1)
console.log('ALL PROBES RED AS REQUIRED')
process.exit(0)
