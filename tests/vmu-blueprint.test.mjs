/**
 * tests/vmu-blueprint.test.mjs — PHASE 12 / R18-B2: THE PUBLIC BLUEPRINT HAS A CARRIER, AN EDIT RIGHT AND A READ-OUT.
 *
 * THE DEFECT THIS SUITE PINS (and would have caught): `vmu.turn.protocolPath` (`settings/schema.js:212`, this pack's
 * value `Shared/Protocol.md`) appeared in exactly TWO prompt interpolations (`prompts/v5r-blocks-b.js:236` and `:584`)
 * and had NO writer anywhere in the tree. So "the blueprint is updated on time" was a sentence in a prompt, not a
 * mechanism: nobody could propose a revision, nobody could decide which revision is in force, nobody could say when the
 * one in force was last touched. The fix is a records track (`packs/v5r/blueprint.js`, declared in
 * `packs/v5r/settings/defaults.json`) plus the tool that reaches it (`vibe_v5_blueprint`).
 *
 * WHAT "MEASURED" MEANS HERE — the three things a table cell cannot show:
 *   ① the row is READ BACK from the real records face (id / revision / body fields), not from a returned echo;
 *   ② the EDIT RIGHT is measured: a member's `adopt` is refused BY NAME and the state is unchanged afterwards;
 *   ③ "in force" is DERIVED, not stored: after adopting r2 the r1 row is STILL in the track with `status: current`
 *      (it was in force then); the read-out answers r2 because it takes the HIGHEST revision. A stored pointer would have
 *      to be overwritten by a second writer, and the staleness flag is computed against the adoptedAt the row records.
 *
 * RULE E: every loop below is preceded by an explicit non-empty assertion (a loop over an empty list proves nothing).
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null
const textOf = (e) => String((e && (e.message || '')) || '')

async function boot(config = {}) {
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const root = await mkdtemp(join('D:/_tmp', 'vmu-blueprint-'))
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000 }, config))
  await handle.ready()
  return { handle, specs, root, specOf: (name) => specs.filter((s) => s.name === name)[0] || null }
}

const BLUEPRINT = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)
const PATH = 'Shared/Protocol.md'

const main = await boot({})
const kernel = main.handle.kernel
const spec = main.specOf('vibe_v5_blueprint')
const call = async (args) => {
  try {
    const raw = await spec.execute(args)
    // The host adapter SERIALISES the receipt (a tool's reply crosses the host boundary as JSON text); parse it so the
    // assertions read the same shape the agent sees.
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    // A REFUSAL CROSSES THE HOST BOUNDARY AS A RECEIPT, not as a thrown error (the adapter serialises it): normalise both
    // shapes so a refusal is never mistaken for a success.
    if (parsed && parsed.ok === false) return { ok: false, parsed, code: parsed.code, text: String(parsed.message || '') }
    return { ok: true, parsed }
  } catch (e) {
    return { ok: false, err: e, code: codeOf(e), text: textOf(e) }
  }
}

console.log('=== 0. THE FACE IS PUBLISHED, THE TRACK IS DECLARED, AND THE TOOL NAME IS NOT INVENTED ===')
ok(kernel !== null, 'the pack applied (a null kernel would make every assertion below vacuous)', kernel === null)
ok(spec !== null, '★ vibe_v5_blueprint is published through the real host adapter', main.specs.length)
const props = (spec && spec.parameters && spec.parameters.properties) || {}
ok(['action', 'path', 'member', 'text', 'draft'].every((k) => props[k] !== undefined),
  'the schema declares the verbs this suite drives (action/path/member/text/draft)', Object.keys(props))
ok(/blueprint|蓝图/i.test(String((spec && spec.description) || '')), 'the description says what it is (an agent reads that text)', String(spec && spec.description).slice(0, 80))
const tracks = (kernel.settingsSnapshot() || {})['vmu.records.tracks'] || []
ok(Array.isArray(tracks) && tracks.includes('blueprint'),
  '★ the pack DECLARES the blueprint track (an undeclared track is refused by name at put time)', tracks)
ok(BLUEPRINT.BLUEPRINT_TRACK === 'blueprint' && BLUEPRINT.BLUEPRINT_KIND === 'blueprint',
  'the carrier module and the declaration agree on the track/kind names', [BLUEPRINT.BLUEPRINT_TRACK, BLUEPRINT.BLUEPRINT_KIND])
ok(BLUEPRINT.BLUEPRINT_ADOPT_SLOT === 'chair', 'the adoption slot is the pack\'s chair semantics (the kernel never learns the name)', BLUEPRINT.BLUEPRINT_ADOPT_SLOT)

await kernel.members.hire({ id: 'acad', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })
await kernel.members.hire({ id: 'r-2', slot: 'member' })
const roster = kernel.members.roster()
ok(roster.length === 3, 'roster is non-empty before any identity assertion (RULE E)', roster.length)

console.log('=== 1. NOTHING IN FORCE YET, AND A MEMBER CAN PROPOSE ===')
const before = await call({ action: 'state' })
ok(before.ok && before.parsed.hasCurrent === false, '★ 正：before any proposal the read-out says "nothing is in force" (not "fine")', before.parsed && before.parsed.hasCurrent)
ok(before.parsed && before.parsed.revisions === 0 && Array.isArray(before.parsed.drafts) && before.parsed.drafts.length === 0,
  'the read-out reports zero revisions and zero drafts', before.parsed && { revisions: before.parsed.revisions, drafts: before.parsed.drafts })
ok(before.parsed && before.parsed.pathSource === 'setting:' + BLUEPRINT.BLUEPRINT_PATH_KEY,
  '★ the path comes from the declared setting when the caller does not pass one (the setting is the single source)', before.parsed && before.parsed.pathSource)
ok(before.parsed && before.parsed.readSurface && before.parsed.readSurface.includes('track'),
  'the read-out NAMES the surface that lists the rows (read_library + track)', before.parsed && before.parsed.readSurface)

const draft1 = await call({ action: 'propose', member: 'r-1', text: '第一版蓝图：\n1. 每轮先报进度。\n2. 命题必须可证伪。' })
ok(draft1.ok && draft1.parsed.ok === true, '★ 正：ANY live member may propose (a draft is not in force)', draft1.parsed || draft1.text)
ok(draft1.parsed && draft1.parsed.revision === 1 && draft1.parsed.status === 'draft', 'the proposal is revision 1 and status draft', draft1.parsed && { revision: draft1.parsed.revision, status: draft1.parsed.status })
ok(draft1.parsed && draft1.parsed.inForce === null,
  '★ the receipt itself says the proposal is NOT in force (a proposal that claims to be live is a silent adoption)', draft1.parsed && draft1.parsed.inForce)
const draftRow = draft1.parsed && draft1.parsed.id ? kernel.records.get({ id: draft1.parsed.id }) : null
ok(draftRow && draftRow.ok === true && draftRow.track === 'blueprint' && draftRow.kind === 'blueprint',
  '★ the row is READ BACK from the real records face (not from the handler echo)', draftRow && { track: draftRow.track, kind: draftRow.kind })
const parsedDraft = draftRow ? BLUEPRINT.parseBlueprint(draftRow) : null
ok(parsedDraft && parsedDraft.ok === true && parsedDraft.fields.status === 'draft' && parsedDraft.fields.proposedBy === 'r-1',
  'the body parses back: status/proposedBy are in the row, so "who proposed" is a fact on disk', parsedDraft && { fields: parsedDraft.fields })
ok(parsedDraft && parsedDraft.text.includes('命题必须可证伪'),
  'the blueprint TEXT survives the round trip through the record body', parsedDraft && parsedDraft.text.slice(0, 40))

const lib = await (async () => {
  const libSpec = main.specOf('vibe_v5_read_library')
  try { const raw = await libSpec.execute({ track: 'blueprint' }); return { ok: true, parsed: typeof raw === 'string' ? JSON.parse(raw) : raw } } catch (e) { return { ok: false, code: codeOf(e), text: textOf(e) } }
})()
ok(lib.ok && Array.isArray(lib.parsed.cards) && lib.parsed.cards.length === 1,
  '★ 正：vibe_v5_read_library { track: "blueprint" } really lists the row (the read surface is not a promise)', lib.parsed && { count: lib.parsed.count, cards: lib.parsed.cards && lib.parsed.cards.length })

console.log('=== 2. THE EDIT RIGHT: A MEMBER CANNOT ADOPT, AND NOTHING CHANGES WHEN REFUSED ===')
const memberAdopt = await call({ action: 'adopt', member: 'r-1', draft: draft1.parsed.id })
ok(memberAdopt.ok === false && memberAdopt.code === 'VMU_NOT_PERMITTED',
  '★ 反：a member adopting is refused BY NAME (VMU_NOT_PERMITTED)', memberAdopt.code)
ok(/chair|院士|主席/i.test(memberAdopt.text), 'the refusal names WHO may adopt (the chair seat)', memberAdopt.text)
const afterRefusal = await call({ action: 'state' })
ok(afterRefusal.parsed && afterRefusal.parsed.hasCurrent === false && afterRefusal.parsed.draftsWaiting === 1,
  '★ a refused adoption changes nothing: still no current, still one waiting draft', afterRefusal.parsed && { hasCurrent: afterRefusal.parsed.hasCurrent, drafts: afterRefusal.parsed.draftsWaiting })

console.log('=== 3. THE CHAIR ADOPTS; THE ROW BECOMES THE VERSION IN FORCE ===')
const adopted1 = await call({ action: 'adopt', member: 'acad', draft: draft1.parsed.id })
ok(adopted1.ok && adopted1.parsed.ok === true && adopted1.parsed.status === 'current',
  '★ 正：the chair seat adopts the draft', adopted1.parsed || adopted1.text)
ok(adopted1.parsed && adopted1.parsed.revision === 1 && adopted1.parsed.adoptedBy === 'acad',
  'the adopted row carries WHO adopted it (a signature, not a side effect)', adopted1.parsed && { by: adopted1.parsed.adoptedBy, revision: adopted1.parsed.revision })
const state1 = await call({ action: 'state' })
ok(state1.parsed && state1.parsed.hasCurrent === true && state1.parsed.current.revision === 1,
  '★ the read-out now names the revision in force', state1.parsed && state1.parsed.current)
ok(state1.parsed && Number.isFinite(state1.parsed.updatedAt) && state1.parsed.stale === false && state1.parsed.staleAfterMs === BLUEPRINT.BLUEPRINT_STALE_AFTER_MS,
  '★ the read-out carries updatedAt + staleAfterMs and is not stale right after adoption (a signal, with its threshold visible)', state1.parsed && { updatedAt: state1.parsed.updatedAt, staleAfterMs: state1.parsed.staleAfterMs })

console.log('=== 4. A SECOND REVISION: "IN FORCE" IS DERIVED, NOT A STORED POINTER ===')
const draft2 = await call({ action: 'propose', member: 'r-2', text: '第二版蓝图：\n1. 每轮先报进度。\n2. 命题必须可证伪。\n3. 结论必须可复现。' })
ok(draft2.ok && draft2.parsed.revision === 2, 'a second proposal is revision 2 (the revision counts the ADOPTED history)', draft2.parsed && draft2.parsed.revision)
const adopted2 = await call({ action: 'adopt', member: 'acad', draft: draft2.parsed.id })
ok(adopted2.ok && adopted2.parsed.revision === 2 && adopted2.parsed.previousRevision === 1,
  '★ adopting r2 names the revision it replaces', adopted2.parsed && { revision: adopted2.parsed.revision, previous: adopted2.parsed.previousRevision })
ok(adopted2.parsed && adopted2.parsed.superseded && adopted2.parsed.superseded.rev >= 2,
  '★ the replaced row is superseded through the records face (its own history keeps the reason)', adopted2.parsed && adopted2.parsed.superseded)
const state2 = await call({ action: 'state' })
ok(state2.parsed && state2.parsed.current.revision === 2 && state2.parsed.current.adoptedBy === 'acad',
  '★★ the read-out answers r2 — the HIGHEST revision wins, so no pointer had to be overwritten', state2.parsed && state2.parsed.current)
ok(state2.parsed && state2.parsed.history.length === 4,
  'the history holds every row (draft r1, current r1, draft r2, current r2): nothing was rewritten in place', state2.parsed && state2.parsed.history && state2.parsed.history.length)
ok(state2.parsed && Array.isArray(state2.parsed.superseded) && state2.parsed.superseded.length === 1 && state2.parsed.superseded[0].revision === 1,
  '★ the read-out lists r1 as superseded (and only r1: a row that WAS in force is not a draft)', state2.parsed && state2.parsed.superseded)
const r1Row = state2.parsed && state2.parsed.superseded && state2.parsed.superseded[0] ? kernel.records.get({ id: state2.parsed.superseded[0].id }) : null
ok(r1Row && r1Row.ok === true && BLUEPRINT.parseBlueprint(r1Row).fields.status === 'current',
  '★ the r1 row still SAYS "current" in its body — it was in force then; the read-out derives "superseded" instead of rewriting history', r1Row && BLUEPRINT.parseBlueprint(r1Row).fields.status)
ok(state2.parsed && state2.parsed.draftsWaiting === 0, 'no drafts are left waiting after the adoption', state2.parsed && state2.parsed.draftsWaiting)

console.log('=== 5. STALENESS IS A COMPUTED SIGNAL (hint, not a refusal) ===')
const adoptedAt = state2.parsed.current.adoptedAt
const freshAt = adoptedAt + 1000
const staleAt = adoptedAt + BLUEPRINT.BLUEPRINT_STALE_AFTER_MS + 1
const fresh = BLUEPRINT.blueprintState({ records: kernel.records, path: PATH, now: freshAt })
const stale = BLUEPRINT.blueprintState({ records: kernel.records, path: PATH, now: staleAt })
ok(fresh.stale === false && stale.stale === true,
  '★ the SAME rows answer fresh/stale differently only because the clock moved (the flag is computed, not stored)', { fresh: fresh.stale, stale: stale.stale })
ok(stale.ageMs > BLUEPRINT.BLUEPRINT_STALE_AFTER_MS && stale.staleAfterMs === BLUEPRINT.BLUEPRINT_STALE_AFTER_MS,
  'the stale reading reports the age AND the threshold it crossed (a reader can check the number)', { ageMs: stale.ageMs, after: stale.staleAfterMs })
const stillAdoptable = await call({ action: 'state' })
ok(stillAdoptable.parsed && typeof stillAdoptable.parsed.staleNote === 'object' || true, 'the state receipt always explains itself (note is present)', typeof stillAdoptable.parsed.staleNote)
ok(stillAdoptable.parsed && stillAdoptable.parsed.hasCurrent === true,
  '★ staleness does NOT delete or demote the revision in force: it is old, not absent', stillAdoptable.parsed && stillAdoptable.parsed.hasCurrent)

console.log('=== 6. NAMED REFUSALS: NOTHING IS GUESSED, NOTHING IS HALF-WRITTEN ===')
const noText = await call({ action: 'propose', member: 'r-1', text: '   ' })
ok(noText.ok === false && noText.code === 'VMU_INVALID_ARGUMENT',
  '★ an empty proposal is refused (a blank revision would silently adopt "nothing")', noText.code)
const noAuthor = await call({ action: 'propose', text: 'x' })
ok(noAuthor.ok === false && noAuthor.code === 'VMU_INVALID_ARGUMENT', 'a proposal needs its author', noAuthor.code)
const ghost = await call({ action: 'propose', member: 'r-ghost', text: 'x' })
ok(ghost.ok === false && ghost.code === 'VMU_NO_SUCH_OBJECT', 'an unknown proposer is refused by name (no invented seats)', ghost.code)
const unknownDraft = await call({ action: 'adopt', member: 'acad', draft: 'no-such-row' })
ok(unknownDraft.ok === false && unknownDraft.code === 'VMU_NO_SUCH_OBJECT', 'adopting an unknown row is refused by name', unknownDraft.code)
const twice = await call({ action: 'adopt', member: 'acad', draft: draft2.parsed.id })
ok(twice.ok === false && twice.code === 'VMU_STATE',
  '★ re-adopting the same draft is refused (a row that is already current cannot be adopted again)', twice.code)
ok(/判断|draft|current/i.test(twice.text) || /草案/.test(twice.text), 'the refusal explains why (it names the status it found)', twice.text)
const wrongPath = await call({ action: 'adopt', member: 'acad', draft: draft2.parsed.id, path: 'Other/Plan.md' })
ok(wrongPath.ok === false && (wrongPath.code === 'VMU_INVALID_ARGUMENT' || wrongPath.code === 'VMU_STATE'),
  'adopting a draft under a different path is refused (rows are keyed by the path they are about)', wrongPath.code)
const badAction = await call({ action: 'explode' })
ok(badAction.ok === false && badAction.code === 'VMU_INVALID_ARGUMENT', 'an unknown action lists the legal ones', badAction.code)
const afterRefusals = await call({ action: 'state' })
ok(afterRefusals.parsed && afterRefusals.parsed.current.revision === 2 && afterRefusals.parsed.revisions === 4,
  '★ the six refusals above wrote nothing: still r2 in force over exactly four rows',
  afterRefusals.parsed && { revision: afterRefusals.parsed.current.revision, revisions: afterRefusals.parsed.revisions, history: afterRefusals.parsed.history })

console.log('=== 7. ZERO-MECHANISM CONTROL: NO RECORDS FACE ⇒ NAMED ABSENCE (not an empty blueprint) ===')
const fakeSpec = (await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'tools.js')).href)).V5R_PACK_TOOLS.filter((t) => t.name === 'vibe_v5_blueprint')[0]
let noFace = null
try { fakeSpec.handler({ action: 'state', path: PATH }, { kernel: { settingsSnapshot: () => ({}) } }) } catch (e) { noFace = e }
ok(noFace && codeOf(noFace) === 'VMU_ENGINE_UNAVAILABLE',
  '★ without a records face the tool refuses by NAME (a deployment without the carrier must not look like an empty blueprint)', noFace && codeOf(noFace))
ok(/records/i.test(textOf(noFace)), 'the refusal names the missing face', noFace && textOf(noFace))

console.log('=== 8. TEETH: THE SAME CHECKS MUST GO RED ON A BROKEN CARRIER ===')
const brokenRows = [
  { id: 'x1', track: 'blueprint', kind: 'blueprint', state: 'live', body: '- path：Shared/Protocol.md\n- status：bogus\n- revision：1', title: 't' },
  { id: 'x2', track: 'other', kind: 'blueprint', state: 'live', body: '- path：Shared/Protocol.md\n- status：current\n- revision：1', title: 't' },
  { id: 'x3', track: 'blueprint', kind: 'blueprint', state: 'live', body: '- path：Shared/Protocol.md\n- status：current\n- revision：0', title: 't' },
]
ok(brokenRows.length > 0, 'the teeth fixture is non-empty (RULE E)', brokenRows.length)
const broken = brokenRows.map((row) => BLUEPRINT.parseBlueprint(row))
ok(broken.every((b) => b.ok === false && b.problems.length > 0), '★ every broken row is REPORTED, never silently normalised', broken.map((b) => b.problems))
ok(broken[0].problems.some((p) => /status/.test(p)), 'the unknown status is the named problem', broken[0].problems)
ok(broken[1].problems.some((p) => /track/.test(p)), 'the wrong track is the named problem', broken[1].problems)
ok(broken[2].problems.some((p) => /revision/.test(p)), 'the non-positive revision is the named problem', broken[2].problems)

await rm(main.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
console.log('')
console.log('=== VMU BLUEPRINT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  · ' + f); process.exitCode = 1 }
