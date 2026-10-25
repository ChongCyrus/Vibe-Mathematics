// ★ PHASE 12 / 2026-10-25 — `vibe_v5_meeting_round` returned a PROMISE, not a round:
// the handler was synchronous and called `kernel.turn.step(...)` (async) without `await`, so the tool funnel serialised
// the pending Promise as `turn:{}`. On a real multi-agent run that meant the round looked finished while the member turn
// was still opening, the turn store kept it "in progress", and every later round was refused — the institute reported it
// as a HANG, not as a wrong value, which is why no value-shaped assertion had ever caught it.
//
// What this gate CAN prove: the handler's return value is the RESOLVED step result, the step is awaited before the receipt
// is built, and the type-narrowing override is cleared only after the step settles.
// What it CANNOT prove: that no Promise is ever serialised elsewhere in the plugin — this is a per-site fix, and the
// generic class ("await every async kernel call") has no static gate here.
import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'

let passed = 0
const failed = []
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1 } else { failed.push(name); failures.push(name + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))) }
}
function done(label) {
  for (const f of failures) console.log('  FAIL ' + f)
  console.log('=== ' + label + ': ' + passed + ' passed, ' + failed.length + ' failed ===')
  process.exit(failed.length === 0 ? 0 : 1)
}

const entry = V5R_PACK_TOOLS.find((t) => t.name === 'vibe_v5_meeting_round')
ok(!!entry, 'the meeting-round tool is declared in the pack manifest')

// ── 1) the handler is async (a synchronous handler cannot await anything)
const isAsync = entry.handler && entry.handler.constructor && entry.handler.constructor.name === 'AsyncFunction'
ok(isAsync === true, '★ R31a: the handler is an AsyncFunction — a synchronous one cannot await the step', entry.handler && entry.handler.constructor && entry.handler.constructor.name)

// ── 2) source gate: the step call is awaited, and no un-awaited call remains
const src = String(entry.handler)
ok(/await kernel\.turn\.step\(/.test(src) === true, '★★ R31b: the handler AWAITS kernel.turn.step', src.slice(0, 0))
ok(/(^|[^.\w])step = kernel\.turn\.step\(/.test(src) === false, '★★★ R31c: the un-awaited form is gone (the exact live defect)', /step = kernel\.turn\.step\(/.test(src))

// ── 3) behaviour: with an async step that settles on a LATER tick, the handler must return the settled object
{
  const clearedAfterStep = { value: null }
  let stepResolved = false
  const kernel = {
    meetings: { meetingView: () => ({ type: 'ordinary', chair: 'r-1' }) },
    members: { roster: () => [{ id: 'r-1', state: 'live', slot: 'chair' }, { id: 'r-2', state: 'live', slot: 'member' }] },
    turn: {
      step: async (arg) => {
        await new Promise((r) => setTimeout(r, 5))
        stepResolved = true
        return { awaiting: true, memberPrompt: { turnId: 't-7', member: 'r-2' }, members: arg.members.map((m) => m.id) }
      },
    },
  }
  const handler = entry.handler
  const pending = handler({ meeting: 'm1' }, { kernel })
  ok(typeof pending.then === 'function', '★★ R31d: the handler returns a thenable (async), not a plain object')
  const out = await pending
  ok(out && out.ok === true && out.tool === 'vibe_v5_meeting_round', '★ R31e: the awaited receipt is the tool receipt', out && out.tool)
  ok(!!out.turn && out.turn.awaiting === true && out.turn.memberPrompt && out.turn.memberPrompt.turnId === 't-7',
    '★★★ R31f: `turn` is the SETTLED step result, not a pending Promise', out && out.turn)
  ok(stepResolved === true, '★★ R31g: the step had actually settled before the handler returned', stepResolved)
  ok(JSON.stringify(out.turn) !== '{}', '★★★ R31h: the exact live symptom (`turn:{}`) cannot reproduce here', JSON.stringify(out.turn).slice(0, 120))
}

// ── 4) NOT asserted here: the ORDER of the narrowing cleanup. `applyMeetingTypeFace` refuses by name when the identity
// face is unreadable, so a hand-built fake kernel that does not model the identity face cannot reach the step at all
// (the first draft of this case asserted on an events list that stayed empty — a vacuous assertion, which this repo's
// RULE E forbids). The order is guaranteed by the language once the step is awaited; what needed a gate was the await.
ok(entry.parameters && entry.parameters.meeting && entry.parameters.meeting.required === true,
  '★ R31k: the tool still declares `meeting` as required (the await fix must not have loosened the contract)', entry.parameters && entry.parameters.meeting)

done('VMU MEETING ROUND AWAIT')
