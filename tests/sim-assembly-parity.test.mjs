// tests/sim-assembly-parity.test.mjs — the simulator and the budget gate must measure the SAME prompt.
//
// WHY THIS TEST EXISTS (task-15 / RUN 226 family: "a ruler that measured the wrong thing"). The simulator reported a
// chair prompt of 30 302 characters while `scripts/audit-prompt-budget.mjs` measured 31 606 for the same seat. Both
// numbers were produced by running the REAL prompt pipeline, so nobody could see the defect by reading either one:
// they were measurements of two different SETTINGS LAYERS. The harness imported a `defaultsOf` that the schema module
// did not export, swallowed the failed import with `.catch`, and assembled from `{}`; the gate parsed the schema file
// with a regular expression. The simulator therefore reported headroom that does not exist — a false green in the one
// instrument the audits trust.
//
// The fix is structural: `scripts/sim/settings.mjs` is the single reader of the schema's own defaults, and BOTH the
// harness and the gate measure through it. This suite pins the result in both directions:
//
//   ① every seat × phase agrees with the gate within ±200 characters;
//   ② a SMALLER harness number FAILS (a shorter simulated prompt is a lie — it is exactly the direction the bug ran);
//   ③ the delegated delivery seam actually carries a member turn through the host subagents path, and without the
//      seam the missing-seam refusal is still reachable (the seam did not paper over the refusal).
//
// Run: node tests/sim-assembly-parity.test.mjs

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const TMP = 'D:/_tmp/sim-tests'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 700)))
  }
}

const NL = String.fromCharCode(10)
const FENCE = '```'
const fence = (payload) => [FENCE + 'json', JSON.stringify(payload), FENCE].join(NL)

const HARNESS = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)
const GATE = await import(pathToFileURL(join(REPO, 'scripts', 'audit-prompt-budget.mjs')).href)

// ── ① two rulers, one ruler's worth of number ──────────────────────────────────────────────
const gate = await GATE.measure()
ok(Boolean(gate && gate.seats && gate.seats.chair), 'the budget gate published its own measurement', gate && Object.keys(gate))

mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'ws-parity-'))
// The SAME clock the gate uses, so any difference cannot come from a timestamp inside the prompt.
const h = await HARNESS.boot({ root, clock: () => Date.parse('2026-01-01T00:00:00.000Z') })

const SEATS = ['chair', 'member', 'temp']
const PHASES = ['normal', 'meeting', 'checkpoint', 'verify']
const LABEL = { chair: '院士', member: '常驻研究员', temp: '临时工' }
const rows = []
for (const seat of SEATS) {
  for (const phase of PHASES) {
    // The gate assembles every role as member `r-1`; the harness can pin the holder for the same reason. Same inputs
    // are what makes the two numbers comparable at all — a different ROSTER SLOT HOLDER is a different prompt.
    // ★ RUN 242 (A7): the gate binds a meeting for the meeting phase (the on-floor manual is gated on the binding), so
    // the simulator has to bind the SAME id - otherwise the two rulers measure two different prompts by construction and
    // this suite goes red for a difference that is not a defect. Same inputs is the whole premise; read the id from the
    // gate rather than retyping it here.
    const text = await h.prompts.assembleFor({
      seat, roleLabel: LABEL[seat], phase, round: 3, roster: 'acad、r-1', statusBlock: '[状态] x', member: 'r-1',
      meeting: phase === 'meeting' ? GATE.RULER_MEETING : null,
    })
    const gateChars = gate.seats[seat].phases[phase].chars
    rows.push({ seat, phase, harness: text.length, gate: gateChars, diff: text.length - gateChars })
  }
}
console.log('  · seat/phase prompt sizes (harness vs budget gate)')
for (const r of rows) console.log('    ' + (r.seat + ' ' + r.phase).padEnd(18) + ' harness ' + String(r.harness).padStart(6) + '  gate ' + String(r.gate).padStart(6) + '  diff ' + (r.diff >= 0 ? '+' : '') + r.diff)

const maxAbs = Math.max(...rows.map((r) => Math.abs(r.diff)))
ok(maxAbs <= 200, 'every seat × phase agrees with the budget gate within ±200 characters', rows)
// ★ THE DIRECTION THAT MATTERS: the bug made the simulator report a SHORTER prompt than the deployment really gets,
// i.e. headroom that does not exist. A tolerance alone would accept that bug (30 302 vs 31 606 is only 1 304 off, and
// a ±200 band around the gate catches it — but this assertion names the failure mode, so the next reader does not
// have to infer it from a tolerance).
const tooSmall = rows.filter((r) => r.harness < r.gate - 200)
ok(tooSmall.length === 0, 'the simulator never measures a SMALLER prompt than the gate (a shorter number would be a lie)', tooSmall)

// The strongest form: with identical inputs there is nothing left to differ. If a future change to one ruler (a
// different clock string, an extra binding) makes these drift, the corpus and the gate stop being comparable — so the
// exact equality is asserted where it is currently true, and the band above still allows an honest ±200.
const exact = rows.filter((r) => r.diff === 0).length
ok(exact === rows.length, 'the two rulers produce byte-identical sizes on identical inputs', { exact, of: rows.length, rows: rows.filter((r) => r.diff !== 0) })

// ── ② the settings layer is SHARED, not duplicated ─────────────────────────────────────────
const SETTINGS = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'settings.mjs')).href)
const SCHEMA = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'settings', 'schema.js')).href)
const layer = SETTINGS.promptSettings()
ok(typeof layer[SETTINGS.PROMPT_FIXTURE_KEY] === 'string' && layer[SETTINGS.PROMPT_FIXTURE_KEY] === SETTINGS.PROMPT_FIXTURE_MODE, 'one helper names the fixture mode the deployed institute runs', layer[SETTINGS.PROMPT_FIXTURE_KEY])
// ★ THE DECLARED KEY, NOT A PLAUSIBLE-LOOKING ONE. Both rulers used to pin `'v5r.fixtureMode'`, which the schema does
// not declare and the section policy never reads (`prompt-switches.js:145` reads `vmu.v5r.fixtureMode`): the pin was a
// no-op, so both measured the schema default while saying "tools". A key the schema does not declare is not applied —
// asserting the NAME here is what keeps a future rename from silently turning the pin back into a label.
ok(SETTINGS.PROMPT_FIXTURE_KEY === 'vmu.v5r.fixtureMode', 'the pinned mode key is the one the section policy READS', SETTINGS.PROMPT_FIXTURE_KEY)
const bareKeyLayer = SETTINGS.promptSettings({ 'v5r.fixtureMode': 'no-tools' })
ok(bareKeyLayer[SETTINGS.PROMPT_FIXTURE_KEY] === 'tools', 'in the settings LAYER the section policy reads, an undeclared bare key cannot displace the declared mode', bareKeyLayer[SETTINGS.PROMPT_FIXTURE_KEY])
// And the declared key must actually MOVE the number: a pin that changes nothing is exactly the bug above. A second
// assembly under the schema default (`no-tools`) is the control: if it measured the same as the tools layer, the pin
// would again be a label rather than a lever.
const noToolsRoot = mkdtempSync(join(TMP, 'ws-parity-notools-'))
const noTools = await HARNESS.boot({ root: noToolsRoot, clock: () => Date.parse('2026-01-01T00:00:00.000Z'), settings: { [SETTINGS.PROMPT_FIXTURE_KEY]: 'no-tools' } })
const noToolsText = await noTools.prompts.assembleFor({ seat: 'chair', roleLabel: LABEL.chair, phase: 'verify', round: 3, roster: 'acad、r-1', statusBlock: '[状态] x', member: 'r-1' })
const toolsChars = rows.find((r) => r.seat === 'chair' && r.phase === 'verify').harness
ok(Math.abs(noToolsText.length - toolsChars) > 500, 'the fixture mode is a real lever: no-tools measures a different prompt than tools', { tools: toolsChars, noTools: noToolsText.length })
ok(typeof SCHEMA.defaultsOf === 'function', 'the schema module exports the defaults reader the rulers import (no silent .catch fallback)', typeof SCHEMA.defaultsOf)

// ── ③ the DELEGATED seam: a member turn really goes through the host subagents path ────────
const delegatedRoot = mkdtempSync(join(TMP, 'ws-parity-delegated-'))
const seen = []
const delegated = await HARNESS.boot({
  root: delegatedRoot,
  clock: () => Date.parse('2026-01-01T00:00:00.000Z'),
  deliver: async ({ kind, label, text }) => {
    seen.push({ kind, label, chars: text.length })
    return fence({ say: '仿真成员（' + kind + '，' + label + '）：已按围栏提交本轮答复，提示共 ' + text.length + ' 字符。' })
  },
})
ok(typeof delegated.delivered === 'object' && Array.isArray(delegated.delivered), 'a booted harness exposes what the delegated seam delivered', delegated.delivered && typeof delegated.delivered)
const startReceipt = await delegated.call('vibe_v5_start', { problem: '验证被派发回合的宿主投递缝', researcherCount: 1 })
ok(startReceipt && startReceipt.ok === true, 'the institute started so there is a turn to delegate', startReceipt && startReceipt.code)
const driveReceipt = await delegated.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: '派 r-1 走一次宿主的投递缝' })
ok(driveReceipt && driveReceipt.ok === true, 'the drive answered (the turn engine ran, rather than refusing the call)', driveReceipt && { ok: driveReceipt.ok, code: driveReceipt.code, message: String(driveReceipt.message || '').slice(0, 300) })
ok(driveReceipt && driveReceipt.roundsRun >= 1, 'a delegated round really ran', driveReceipt && { roundsRun: driveReceipt.roundsRun, roundsAttempted: driveReceipt.roundsAttempted })
ok(seen.length >= 1, 'the scenario deliver was called — the kernel went through the host subagents path, not a stub', seen)
const first = seen[0] || {}
ok(first.kind === 'one-shot' || first.kind === 'activation', 'the delivery names which host verb carried it (one-shot or activation)', first)
ok(first.chars > 20000, 'the delivered prompt is a real member prompt, not a placeholder', first)
const roundOne = (driveReceipt && Array.isArray(driveReceipt.receipts) ? driveReceipt.receipts : [])[0] || {}
ok(roundOne.failed !== true, 'the delegated round did NOT fail (the fenced reply was accepted)', { failed: roundOne.failed, code: roundOne.code, message: String(roundOne.message || '').slice(0, 300) })
ok(delegated.delivered.length >= 1 && delegated.delivered[0].replyChars > 0, 'the delivered reply is recorded with its own size', delegated.delivered && delegated.delivered.map((d) => ({ kind: d.kind, chars: d.chars, replyChars: d.replyChars })))

// The seam must not HIDE the refusal it replaces: without `deliver`, the same drive still reports the missing host
// service by name. That is what keeps "the simulator can run the delegated path" from becoming "the simulator pretends
// every host has one".
const bareRoot = mkdtempSync(join(TMP, 'ws-parity-bare-'))
const bare = await HARNESS.boot({ root: bareRoot, clock: () => Date.parse('2026-01-01T00:00:00.000Z') })
await bare.call('vibe_v5_start', { problem: '没有投递缝的宿主', researcherCount: 1 })
const bareDrive = await bare.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: '没有 seam 时应当具名拒绝' })
const bareRound = (bareDrive && Array.isArray(bareDrive.receipts) ? bareDrive.receipts : [])[0] || {}
ok(bareDrive && bareDrive.ok !== false && bareDrive.roundsRun === 0, 'without the seam no round is claimed to have run', { ok: bareDrive && bareDrive.ok, roundsRun: bareDrive && bareDrive.roundsRun })
ok(bareRound.failed === true && bareRound.code === 'VMU_ENGINE_UNAVAILABLE', 'and the missing host service is named (VMU_ENGINE_UNAVAILABLE), not swallowed', { failed: bareRound.failed, code: bareRound.code })

// ── teardown through the entry's own cleanups (the same drain run.mjs now uses) ─────────────
for (const inst of [h, delegated, bare]) {
  const cleanups = inst && inst.handle && Array.isArray(inst.handle.cleanups) ? inst.handle.cleanups : []
  for (const c of cleanups) { try { await c() } catch { /* teardown never turns a finished test red */ } }
}
// Drain FIRST, then remove: removing a root whose store is still writing is the very race this test exists to keep out
// of the simulator (a killed write leaves a 0-byte `state.json.<pid>.<ts>.tmp` behind). A green run leaves no workspace.
for (const dir of [root, noToolsRoot, delegatedRoot, bareRoot]) {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* a leftover directory is not a test failure */ }
}

console.log(NL + '=== sim assembly parity: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + JSON.stringify(failures))
  process.exitCode = 1
}
