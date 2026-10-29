// tests/vmu-run132-debate-phase-alias.test.mjs — F-132a: THE VERB THAT OPENS A DEBATE ROUND COULD NOT NAME
// "debate".
//
// MEASURED IN RUN 132 (build 1c7923a0): the chair held a debate meeting and asked the round verb for its round:
//   vibe_v5_meeting_round { meeting: "m1", phase: "debate" }
//   ⇒ VMU_INVALID_ARGUMENT 'pack tool vibe_v5_meeting_round got an undeclared value for parameter(s) "phase"="debate"'
// The turn engine calls that round `verify-debate`; the alias was never accepted, and the teaching said "phase 取值以
// 工具声明为准，写错具名拒" — true, and useless: the only word an agent would try is the meeting type it is in.
//
// The fix accepts the word AND discloses the rewrite in the receipt (`phaseAliased`), because a word that works but is
// silently rewritten is the same defect one level down. Every other phase is passed through untouched and says
// `phaseAliased: null`.
//
// Run: node tests/vmu-run132-debate-phase-alias.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'

import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'

const specOf = (name) => V5R_PACK_TOOLS.filter((t) => t && t.name === name)[0] || null

const stubKernel = ({ stepResult = { ok: true } } = {}) => {
  const calls = []
  const kernel = {
    members: { roster: () => ([{ id: 'r-acad', state: 'live' }, { id: 'r-1', state: 'live' }, { id: 'r-2', state: 'live' }]) },
    meetings: { meetingView: () => ({ type: 'debate', chair: 'r-acad' }) },
    toolsView: () => ({ tools: [] }),
    turn: { step: async (o) => { calls.push(o); return stepResult } },
  }
  return { kernel, calls }
}

test('F-132a §1 the declaration lists "debate" as a legal phase word', () => {
  const spec = specOf('vibe_v5_meeting_round')
  assert.ok(spec, 'the tool is declared')
  const phase = spec.parameters && spec.parameters.phase
  assert.ok(phase && Array.isArray(phase.enum), 'phase is an enum')
  assert.ok(phase.enum.includes('debate'), 'debate is in the enum')
  assert.ok(phase.enum.includes('verify-debate'), 'verify-debate is still there')
})

test('F-132a §2 phase:"debate" runs the round as verify-debate AND discloses the alias', async () => {
  const { kernel, calls } = stubKernel()
  const receipt = await specOf('vibe_v5_meeting_round').handler({ meeting: 'm1', phase: 'debate' }, { kernel })
  assert.equal(receipt.ok, true)
  assert.equal(calls.length, 1, 'the member turn ran')
  assert.equal(calls[0].phase, 'verify-debate', 'the engine got its own word')
  assert.equal(receipt.phase, 'verify-debate', 'the receipt reports the word that was used')
  assert.ok(receipt.phaseAliased, 'the receipt carries phaseAliased')
  assert.equal(receipt.phaseAliased.given, 'debate')
  assert.equal(receipt.phaseAliased.used, 'verify-debate')
  assert.match(receipt.phaseAliased.why, /verify-debate/)
})

test('F-132a §3 every other phase passes through untouched with phaseAliased:null', async () => {
  for (const [given, expected] of [['verify-debate', 'verify-debate'], ['meeting', 'meeting'], ['paper-review', 'paper-review']]) {
    const { kernel, calls } = stubKernel()
    const receipt = await specOf('vibe_v5_meeting_round').handler({ meeting: 'm1', phase: given }, { kernel })
    assert.equal(receipt.ok, true)
    assert.equal(calls[0].phase, expected)
    assert.equal(receipt.phase, expected)
    assert.equal(receipt.phaseAliased, null, given + ' is not rewritten')
  }
  const { kernel, calls } = stubKernel()
  const noPhase = await specOf('vibe_v5_meeting_round').handler({ meeting: 'm1' }, { kernel })
  assert.equal(noPhase.phase, 'meeting', 'the default is still "meeting"')
  assert.equal(calls[0].phase, 'meeting')
  assert.equal(noPhase.phaseAliased, null)
})

test('F-132a §4 a failed step still reports the alias (the receipt never claims the round happened)', async () => {
  const { kernel } = stubKernel({ stepResult: { ok: false, code: 'VMU_STATE', message: 'unknown phase', hint: 'see the engine vocabulary' } })
  const receipt = await specOf('vibe_v5_meeting_round').handler({ meeting: 'm1', phase: 'debate' }, { kernel })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.turnFailed, true)
  assert.equal(receipt.code, 'VMU_STATE')
  assert.equal(receipt.phase, 'verify-debate')
  assert.ok(receipt.phaseAliased && receipt.phaseAliased.given === 'debate', 'the alias survives the failure path')
})

test('F-132a §5 an undeclared word is still refused by name (the alias is one word, not a wildcard)', async () => {
  const { kernel, calls } = stubKernel({ stepResult: { ok: false, code: 'VMU_INVALID_ARGUMENT', message: 'unknown phase: "argue"', hint: 'see the engine vocabulary' } })
  const receipt = await specOf('vibe_v5_meeting_round').handler({ meeting: 'm1', phase: 'argue' }, { kernel })
  assert.equal(receipt.ok, false)
  assert.equal(receipt.phase, 'argue', 'the word is reported as given, not rewritten')
  assert.equal(receipt.phaseAliased, null)
  assert.equal(calls[0].phase, 'argue', 'the engine had to refuse it — the face did not invent a mapping')
})
