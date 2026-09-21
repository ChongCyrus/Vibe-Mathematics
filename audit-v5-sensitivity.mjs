// ============================================================
// V5 SENSITIVITY PROBES — prove the self-drive suite is not vacuous.
//
// Each probe copies vibe-math-v5.js, applies ONE targeted mutation that breaks a
// specific guarantee, and runs selfdrive-v5.mjs against the mutated copy. A probe
// PASSES when the suite goes RED (non-zero exit) — i.e. the assertions really do
// detect that break. A probe that stays green means the suite has a blind spot.
//
// Run: node audit-v5-sensitivity.mjs
// ============================================================
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const SRC = new URL('./vibe-math-v5/vibe-math-v5.js', import.meta.url)
const TESTS = {
  selfdrive: new URL('./selfdrive-v5.mjs', import.meta.url),
  round2: new URL('./e2e-v5-round2.test.mjs', import.meta.url),
}
const original = readFileSync(SRC, 'utf8')
const REPO = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const dir = mkdtempSync(join(tmpdir(), 'v5-sens-'))

// Each probe: { name, ref, guarantee, from, to }
// `from` must occur exactly once, so a mutation can never quietly hit the wrong site.
const probes = [
  {
    name: 'quorum-floor-removed',
    ref: 'selfdrive-v5.mjs',
    guarantee: '④ only >= m boolean votes may verify (drop the m floor)',
    from: "      if (bTrue + bFalse < m) {",
    to: "      if (false) {",
  },
  {
    name: 'abstention-counts-as-true',
    ref: 'selfdrive-v5.mjs',
    guarantee: '⑤ an abstention must NOT count toward the quorum',
    from: "        else if (p === 0) bFalse += 1\n        else abstain += 1",
    to: "        else if (p === 0) bFalse += 1\n        else { abstain += 1; bTrue += 1 }",
  },
  {
    name: 'conflict-allowed',
    ref: 'selfdrive-v5.mjs',
    guarantee: '④ a conflicting 1 vs 0 must BLOCK the verdict',
    from: "      if (bTrue > 0 && bFalse > 0) {",
    to: "      if (false) {",
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
    from: "      inflight.set(started.childId, shortId())\n      busy.add(member.id)\n      wakeKind.set(member.id, 'initial')",
    to: "      wakeKind.set(member.id, 'initial')",
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
    ref: 'selfdrive-v5.mjs',
    guarantee: '⑥ a solve vote landing outside meeting finalization must still stop the institute',
    from: "      solveVotes.set(memberId, val === true)\n      // Evaluate the stop condition on EVERY solve vote",
    to: "      solveVotes.set(memberId, val === true)\n      if (false) await checkSolved()\n      // Evaluate the stop condition on EVERY solve vote",
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
    ref: 'e2e-v5-round2.test.mjs',
    guarantee: '⑱ only one verification may begin at a time',
    from: "      if (beginLock) return\n      if (currentVerify()) return\n      beginLock = true",
    to: "      beginLock = true",
  },
  {
    name: 'meeting-lock-no-rearm',
    ref: 'e2e-v5-round2.test.mjs',
    guarantee: '⑲ a pass that bails on the finalize lock must re-arm',
    from: "      if (finalizeLock) { armHeartbeat(); return }",
    to: "      if (finalizeLock) { return }",
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
  const testPath = (TESTS[p.ref === 'e2e-v5-round2.test.mjs' ? 'round2' : 'selfdrive']).pathname.replace(/^\/([A-Za-z]:)/, '$1')
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
