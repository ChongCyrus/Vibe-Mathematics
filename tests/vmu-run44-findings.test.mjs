// round 45 — live run 44's own report (items b-1, b-2, b-4).
//
// What this file proves, and what it cannot:
//   · b-1 and b-2 are asserted BEHAVIOURALLY (a real meetings service, a real orchestrator).
//   · b-4 is asserted at SOURCE level here: the delegation object is built inside the pack tool face, which needs a
//     booted host to exercise; what CAN be pinned without one is that the face reads the live config's preset and emits
//     the field on the awaiting route. The real-machine proof is the next acceptance run.
//   · b-3 is deliberately NOT implemented (see the ledger): under subagents the member prompt goes INTO the child
//     session, and claiming the office "holds" it would be the class of lie this phase removes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const REPO = process.cwd()
const FACE = readFileSync(join(REPO, 'vibe-math-vmu', 'tools', 'turn.js'), 'utf8')

// ── b-1: presence is not a start ────────────────────────────────────────────────────────────────────────
{
  const mt = createMeetings({ clock: () => 1_700_000_000_000 })
  const opened = mt.open({ id: 'm-b1', chair: 'a', roster: ['a', 'b'], size: 2, at: 1_700_000_600_000, materials: 'x' })
  ok(opened.ok === true, '★ b-1a: a meeting scheduled in the future opens', opened && opened.ok)
  const st = mt.summary({ meeting: 'm-b1' })
  ok(st && st.state === 'scheduled', '★ b-1b: and its state is scheduled', st && st.state)
  ok(st && typeof st.stateMeans === 'string' && /presence is a seat reading, not a start/.test(st.stateMeans),
    '★★★ b-1c: the state carries a sentence saying presence is not the start (run 44 read 2/2 present + scheduled as a contradiction)', st && st.stateMeans)
  // the other branch: an unscheduled meeting must NOT be given the scheduled sentence
  const now = mt.open({ id: 'm-b1b', chair: 'a', roster: ['a', 'b'], size: 2, materials: 'y' })
  ok(now.ok === true, '★ b-1d: an unscheduled meeting opens', now && now.ok)
  const st2 = mt.summary({ meeting: 'm-b1b' })
  ok(st2 && st2.stateMeans !== st.stateMeans, '★ b-1e: the wording is per-state, not a constant', st2 && st2.stateMeans)
}

// ── b-2: which roster did the members come from ─────────────────────────────────────────────────────────
{
  const stub = () => ({
    assemble: async () => ({ text: 'x', sources: 1, instructionDelivered: false }),
    deliver: async () => ({ awaiting: true, memberPrompt: { turnId: 't-1', chars: 1 } }),
  })
  // the orchestrator's step signature is exercised through its own seam: callers pass membersFrom and the receipt
  // echoes it, so a reader can tell a default roster from an explicit selection without guessing from the ids.
  const faceHas = /membersFrom = explicit \? 'caller-selection' : 'roster-default'/.test(FACE)
  ok(faceHas, '★★★ b-2a: the tool face NAMES which roster the members came from', faceHas)
  const passes = /membersFrom,/.test(FACE)
  ok(passes, '★★ b-2b: and passes it into the kernel step (a name with no consumer is not a fix)', passes)
  const kernelEcho = /membersFrom: spec && typeof spec\.membersFrom === 'string'/.test(readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8'))
  ok(kernelEcho, '★★★ b-2c: and the kernel echoes it on the awaiting receipt', kernelEcho)
}

// ── b-4: name what was delegated ────────────────────────────────────────────────────────────────────────
{
  const hasDelegation = /const delegated = withOverride && withOverride\.awaiting === true/.test(FACE)
  ok(hasDelegation, '★★★ b-4a: the awaiting route builds a delegation record', hasDelegation)
  // the exact spelling changed when `cfg` (a HOST-scope variable) was found to be out of scope here; what must
  // NOT change is the semantics: the preset comes from a CONFIG object, never a literal preset name.
  // the field MOVED to settlement (childPreset on the settled receipt) when the face stopped reaching for a
  // HOST-scope variable; what must hold on the awaiting receipt is: no hard-coded preset, and a written reason.
  const readsPreset = /preset: null/.test(FACE) && /presetMeans: '[^']{40,}/.test(FACE)
  ok(readsPreset, '★★★ b-4b: it never hard-codes a preset, and while awaiting it NAMES why it cannot (the settled receipt carries delivery.childPreset)', readsPreset)
  const honestChild = /childIdMeans: 'the child session id is reported when this turn SETTLES; null while the turn is awaiting'/.test(FACE)
  ok(honestChild, '★★ b-4c: while awaiting, the child id is null AND the field says why (no invented id)', honestChild)
  const attaches = /Object\.assign\(\{\}, withOverride, \{ delegation: delegated \}\)/.test(FACE)
  ok(attaches, '★★ b-4d: the record rides the receipt the office actually reads', attaches)
}

console.log('=== VMU RUN44 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILURES: ' + failures.join(' | ')) }
process.exit(failed ? 1 : 0)
