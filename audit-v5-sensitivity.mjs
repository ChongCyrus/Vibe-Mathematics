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
const TEST = new URL('./selfdrive-v5.mjs', import.meta.url)
const original = readFileSync(SRC, 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'v5-sens-'))

// Each probe: { name, guarantee, from, to }
// `from` must occur exactly once, so a mutation can never quietly hit the wrong site.
const probes = [
  {
    name: 'quorum-floor-removed',
    guarantee: '④ only >= m boolean votes may verify (drop the m floor)',
    from: "      if (bTrue + bFalse < m) {",
    to: "      if (false) {",
  },
  {
    name: 'abstention-counts-as-true',
    guarantee: '⑤ an abstention must NOT count toward the quorum',
    from: "        else if (p === 0) bFalse += 1\n        else abstain += 1",
    to: "        else if (p === 0) bFalse += 1\n        else { abstain += 1; bTrue += 1 }",
  },
  {
    name: 'conflict-allowed',
    guarantee: '⑤/④ a conflicting 1 vs 0 must BLOCK the verdict',
    from: "      if (bTrue > 0 && bFalse > 0) {",
    to: "      if (false) {",
  },
  {
    name: 'temp-worker-can-vote',
    guarantee: '⑦ a temp worker must NOT be able to vote',
    from: "      if (member.kind === 'temp') {\n        // Temp workers have no vote",
    to: "      if (false) {\n        // Temp workers have no vote",
  },
  {
    name: 'academician-gate-removed',
    guarantee: '⑬ only the academician may assign tasks',
    from: "        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can assign tasks' }",
    to: "        return { ok: false, code: 'NO_GATE', message: 'x' }",
  },
  {
    name: 'spawn-not-registered-inflight',
    guarantee: '⑯ the founding turn must be registered in-flight or its end is dropped',
    from: "      inflight.set(started.childId, shortId())\n      busy.add(member.id)\n      wakeKind.set(member.id, 'initial')",
    to: "      wakeKind.set(member.id, 'initial')",
  },
  {
    name: 'group-chat-not-fanned-out',
    guarantee: '③ group chat must reach every other member',
    from: "      if (to === 'all' || to === '') targets = activeMembers().filter((m) => m.id !== from)",
    to: "      if (to === 'all' || to === '') targets = activeMembers().filter((m) => m.id !== from).slice(0, 1)",
  },
  {
    name: 'verify-round-advances-anyway',
    guarantee: '④ a round must not advance without every voter answering',
    from: "      const missing = need.filter((id) => !vs.votes[id])\n      if (missing.length) {",
    to: "      const missing = need.filter((id) => !vs.votes[id])\n      if (false) {",
  },
  {
    name: 'fire-does-not-release',
    guarantee: '⑨ firing must really release the resident child',
    from: "          if (typeof subagents.drainContinuableChildren === 'function') await subagents.drainContinuableChildren(rootAgent, [target.childId])",
    to: "          if (false) await subagents.drainContinuableChildren(rootAgent, [target.childId])",
  },
  {
    name: 'solve-vote-not-unanimous',
    guarantee: '⑥ the institute must not stop unless EVERY voter agrees',
    from: "      if (!vs.every((id) => solveVotes.get(id) === true)) return false",
    to: "      if (false) return false",
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
  const r = spawnSync(process.execPath, [TEST.pathname.replace(/^\//, '')], {
    env: Object.assign({}, process.env, { V5_PLUGIN: file }),
    encoding: 'utf8',
    cwd: new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  })
  const red = r.status !== 0
  if (red) {
    probesPassed++
    console.log('  ok - ' + p.name + ' => suite went RED as required  [' + p.guarantee + ']')
  } else {
    probesFailed++
    console.error('  BLIND SPOT - ' + p.name + ' => suite stayed GREEN, so it does NOT detect: ' + p.guarantee)
  }
}

rmSync(dir, { recursive: true, force: true })
console.log('')
console.log('sensitivity: ' + probesPassed + ' probes detected the break, ' + probesFailed + ' blind spots')
if (probesFailed) process.exit(1)
console.log('ALL PROBES RED AS REQUIRED')
process.exit(0)
