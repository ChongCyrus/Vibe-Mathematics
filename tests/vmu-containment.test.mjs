// vmu containment — proving that v5r's behavioural core runs on the framework AS IT STANDS.
//
// This is the P3 report's claim, made executable (design/03-v5r-containment-report.md §7): an institution
// whose semantics came from v5r is expressed with SETTINGS (mechanism), a PACK (institution), M1 RULES
// (conduct) and ALIASES (legacy names) - with the kernel taught nothing about academics.
//
// The scenarios are lifted from v5r's own hard-won lessons, and each one asserts the LESSON, not the
// happy path:
//   · s8-freeze-say: a refused (frozen) input must not advance the round, and an incomplete round cannot
//     be closed - the early close v5r suffered is impossible without an explicit, audited force;
//   · three-valued verdicts: unanimity decides, a split is `undecided` WITH a reason, and a frozen cast is
//     refused and NOT counted;
//   · the locked-object gate: voting on an object without a settled formal proof is denied, with the
//     pack's own code and v5r's wording;
//   · aliases: `vibe_v5_*` names keep working through the alias layer (no renaming, D6/D14);
//   · unloading the pack removes the gate again (no residue).

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const PACK_URL = pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'packs', 'institute-min.js')).href
const KERNEL_URL = pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href
const PL_URL = pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const { PACK } = await import(PACK_URL)
const km = await import(KERNEL_URL)
const pm = await import(PL_URL)
const clock = () => '2026-10-09T00:00:00.000Z'

// The kernel supplies the GENERIC named predicate this pack's rule refers to (docs/05 §5.2): it says
// nothing about academics, only "there is a settled formal proof for this object".
const subjects = { has_locked_formal_proof: (ev) => ev.locked === true }

const root = await mkdtemp(join(tmpdir(), 'vmu-contain-'))
const delivered = []
// NOTE: the pack's SETTINGS are deliberately NOT pre-loaded here. The pack brings them (that is what a
// pack is for), and the framework's own O4 rule refuses a pack that would overwrite an active value.
const kernel = km.createKernel({
  clock, root, subjects,
  settings: { 'vmu.records.tracks': PACK.tracks },
  deliver: async (env) => { delivered.push(env) },
})
const loader = pm.createPackLoader({ kernel, registry: kernel.registry })

// ---- 0. the pack composes with the assembled framework ------------------------------------------
{
  const plan = loader.plan(PACK)
  ok(plan.ok === true, 'institute-min passes static validation', plan.problems.join(' | '))
  ok(plan.requires && plan.requires.ok === true, 'every service it requires is published by this assembly',
    JSON.stringify(plan.requires && plan.requires.satisfied))
  ok(PACK.codes.every((c) => c.startsWith('VMU_PACK_INSTITUTE_MIN_')), 'its codes live in its own namespace (R-d)')
  const applied = await loader.apply(PACK)
  ok(applied.ok === true, 'the pack applies')
  ok(kernel.requireMembers().roles().map((r) => r.id).join(',') === 'chair,member,temp',
    'the pack declared the role slots; the kernel still knows no roles (D5)', kernel.requireMembers().roles().map((r) => r.id).join(','))
  ok((await kernel.requireLibrary().status()).tracks.includes('rejected'), 'the pack declared its record tracks')
  const settingsSeen = kernel.settingsSnapshot()
  ok(settingsSeen['vmu.meetings.quorumRule'] === 'm-unanimous' && settingsSeen['vmu.meetings.verdictMaxRounds'] === 3 &&
    settingsSeen['vmu.meetings.hardLimitMs'] === 1800000, 'v5r\'s mechanism values are in force as settings', JSON.stringify(settingsSeen['vmu.meetings.hardLimitMs']))
  ok(settingsSeen['vmu.meetings.hardLimitMs'] !== 0, 'the wall-clock backstop is NOT "unbounded" (v5r: no unbounded)')
}

// ---- 1. s8-freeze-say: a refused input must not advance the round, and no early close -------------
{
  const meeting = kernel.meeting({ id: 'mt-1', kind: 'verify', roster: ['m-1', 'm-2'] })
  await meeting.convene('verify the locked proposition')
  await meeting.openRound({ ask: 'your verdict?' })
  ok(delivered.length === 2, 'the ask seam was used for both members', delivered.length)
  await meeting.speak('m-1', 'looks settled to me')
  const before = JSON.stringify(meeting.summary().inputs)
  const refusal = meeting.refuseInput('m-2', 'I would answer', 'in-frozen-ballot')
  ok(refusal.counted === false && refusal.stillPending.join(',') === 'm-2', 'the refused input reports itself as uncounted and m-2 as pending')
  ok(JSON.stringify(meeting.summary().inputs) === before, 'the refused input left the inputs untouched')
  ok(meeting.roundComplete().complete === false, 'the round is not complete after a refusal (s8)')
  await expectThrow(() => meeting.close('wrap up'), 'VMU_STATE', 'an incomplete round cannot be closed - the early close is refused')
  await meeting.speak('m-2', 'agreed, settled')
  ok(meeting.roundComplete().complete === true, 'once both answered the round completes')
  const closed = await meeting.close('wrap up')
  ok(closed.ok === true && closed.forced === false, 'a complete round closes normally')
}

// ---- 2. the locked-object gate, with the pack's code and v5r's wording ---------------------------
{
  const denied = await kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote', locked: false }, { member: 'm-1' })
  ok(denied.ok === false && denied.refused.code === 'VMU_PACK_INSTITUTE_MIN_NOT_LOCKED',
    'voting without a settled proof is denied with the PACK\'s own code', JSON.stringify(denied.refused))
  ok(/只有已被正式证明或证伪/.test(denied.refused.message), 'the refusal carries v5r\'s own wording', denied.refused.message)
  const allowed = await kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote', locked: true }, { member: 'm-1' })
  ok(allowed.ok === true, 'a settled object may be voted on')
  const otherTool = await kernel.bus.emit('tools/pre-execute', { tool: 'math_computation', locked: false }, {})
  ok(otherTool.ok === true, 'the gate is scoped to the voting tool, not to everything')
}

// ---- 3. three-valued verdicts on the assembled ballot -------------------------------------------
{
  const forBallot = kernel.ballot({ target: 'prop-locked-1', eligible: ['m-1', 'm-2'] })
  await forBallot.open()
  await forBallot.cast('m-1', 1)
  await forBallot.cast('m-2', 1)
  const decided = await forBallot.close('tally')
  ok(decided.outcome === true && decided.tally.reason === 'unanimous for', 'unanimity decides, with its reason')

  const split = kernel.ballot({ target: 'prop-locked-2', eligible: ['m-1', 'm-2'] })
  await split.open()
  await split.cast('m-1', 1)
  await split.cast('m-2', 0)
  const undecided = await split.close('tally')
  ok(undecided.outcome === 'undecided' && !!undecided.tally.reason, 'a split is undecided WITH a reason (never a silent 0)', undecided.tally.reason)

  const frozen = kernel.ballot({ target: 'prop-locked-3', eligible: ['m-1', 'm-2'] })
  await frozen.open()
  await frozen.cast('m-1', 1)
  await frozen.freeze('ballot in progress')
  const countBefore = JSON.stringify(frozen.status().votes)
  await expectThrow(() => frozen.cast('m-2', 1), 'VMU_STATE', 'a cast during a freeze is refused by name')
  ok(JSON.stringify(frozen.status().votes) === countBefore, 'the frozen cast was NOT counted (v5r\'s s8 lesson, at the ballot level)')
  const r = await frozen.close('closed while frozen')
  ok(r.outcome === 'undecided', 'the frozen refusal did not push the ballot towards a decision')
}

// ---- 4. legacy names keep working (D6/D14) -----------------------------------------------------
{
  ok(kernel.registry.resolve('vibe_v5_poll_vote').name === 'vmu.tasks', 'a v5 tool name resolves to the vmu service')
  ok(kernel.registry.resolve('vibe_v5_members').name === 'vmu.members', 'the member tool name resolves to the member service')
  ok(kernel.registry.resolve('vibe_v5_meeting').viaAlias.from === 'vibe_v5_meeting', 'resolution reports that an alias was used')
  const contract = kernel.registry.contract()
  ok(contract.aliases.length >= 4 && contract.services.some((s) => s.name === 'vmu.members'), 'the published contract lists both services and aliases')
}

// ---- 5. unloading the pack removes the institution, leaving no residue --------------------------
{
  const unloaded = await loader.unload('institute-min')
  ok(unloaded.ok === true && unloaded.residueFree === true, 'the pack unloads cleanly')
  const after = await kernel.bus.emit('tools/pre-execute', { tool: 'vibe_v5_poll_vote', locked: false }, {})
  ok(after.ok === true, 'after unload the institutional gate is gone')
  await expectThrow(() => Promise.resolve(kernel.registry.resolve('vibe_v5_poll_vote')), 'VMU_NO_SUCH_OBJECT', 'and its aliases are gone')
  const what = kernel.packNotes().map((n) => n.what)
  ok(what.includes('settings-applied') && what.includes('applied') && what.includes('unloaded'),
    'the whole life of the pack is in the audit notes: which settings it brought, that it applied, that it unloaded', JSON.stringify(what))
  const settingsNote = kernel.packNotes().find((n) => n.what === 'settings-applied')
  ok(settingsNote.keys.includes('vmu.meetings.quorumRule') && settingsNote.keys.length === Object.keys(PACK.settings).length,
    'the settings provenance names every key the pack brought', JSON.stringify(settingsNote.keys))
}

await rm(root, { recursive: true, force: true })
console.log('=== VMU CONTAINMENT: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
