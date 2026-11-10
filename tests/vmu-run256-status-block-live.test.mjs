// tests/vmu-run256-status-block-live.test.mjs — RUN 258 / TB-2621 (task-102): THE BOARD READS THE LEDGERS THAT DECIDE
// THE ROUND.
//
// The measured defect (taskbook TB-2621): a chair's `normal` prompt was byte-identical in three different worlds (paper
// archived / paper finalized / closure settled) — sha256 `cb9049528bcf`, 55,826 B in all three — because the status
// board only read `vmu.tasks` and the records `progress` track. The paper pack writes one `paper-state` row per paper on
// the `paper` track, the blueprint pack writes a `blueprint` row whose BODY is the md, and the closure vote lives in the
// turn orchestrator's own map: all three were unreachable from the board.
//
// This suite drives the REAL kernel (it boots the entry, starts a paper and a blueprint, and reads the durable rows back),
// then asserts the three groups are (a) read from those rows, (b) rendered into the assembled prompt ONLY when they carry
// a value, (c) exposed on `turn.status().liveReadings` with the same object the prompt rendered, and (d) different when
// the underlying world differs (three worlds ⇒ three prompt shas).
//
// NO product text is copied into an assertion: the expected values are things the tools returned (e.g. the paper's
// status word goes through the tool receipt, not a literal in this file).
//
// RULE E: every loop is preceded by an explicit non-empty guard.
//
// Run: node tests/vmu-run256-status-block-live.test.mjs   (last line: === VMU RUN 256 STATUS BLOCK LIVE: N passed, M failed ===)
import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  createTurnOrchestrator, facesFrom, liveStatusReadings, renderLiveStatus, LIVE_STATUS_FIELDS, STATUS_BOARD_READ_OPS,
} from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, msg, extra) => {
  if (cond) { passed += 1; console.log('  ok ' + msg) } else { failed += 1; console.log('  FAIL ' + msg + (extra === undefined ? '' : '\n    ' + JSON.stringify(extra))) }
}
const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')
const roots = []
const mkRoot = () => { const d = mkdtempSync(join(tmpdir(), 'vmu-r258-sbl-')); roots.push(d); return d }

const entry = await import(pathToFileURL(ENTRY).href)
const boot = async () => {
  const root = mkRoot()
  const specs = []
  const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async (s) => { specs.push(s); return () => {} } } }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args = {}) => {
    const spec = specs.filter((s) => s && s.name === name)[0] || null
    if (!spec) throw Object.assign(new Error('no such face ' + name), { code: 'NO_SUCH_FACE' })
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { root, handle, K: handle.kernel, call }
}

/** A minimal pipeline: this suite asserts the STATUS BLOCK, not the pack's sections; the loop composes its own block. */
const fakePrompt = { assemble: async () => ({ ok: true, text: '', sources: [], instructionDelivered: false }) }
/**
 * TB-2720 (task-203): THE MAP PRODUCTION HANDS THE ORCHESTRATOR.
 *
 * This suite used to build the faces bag by hand (`{'vmu.records': K.records}` — the whole service), so it measured a
 * face no turn ever receives: production calls `facesFrom(...)` (which binds only STATUS_BOARD_READ_OPS) and then the
 * kernel adds the md door on top (`kernel/index.js` `mdOps`). That hand-made bag is exactly why the run-76 production
 * defect (a records face without mdParse ⇒ blueprint reading null on EVERY turn) stayed green here.
 *
 * The kernel keeps the real map and exposes it (`get faces()`), so the suite reads THAT object — the same one handed to
 * `createTurnOrchestrator` — instead of rebuilding a lookalike. `facesFrom` is still imported so §0b can measure the
 * restricted shape the run-76 turns actually got.
 */
const productionFaces = (K) => {
  assert.ok(K && K.faces && typeof K.faces === 'object', 'the kernel exposes the face map it handed to the turn orchestrator')
  return K.faces
}
const orchFor = (K, clock = () => 1000, faces = null) => createTurnOrchestrator({
  prompt: fakePrompt,
  deliver: async () => '',
  faces: faces || productionFaces(K),
  settings: {},
  clock,
})
const assembleFor = async (orch, member = 'r-acad', rosterIds = ['r-acad', 'r-1', 'r-2'], meeting = null) => {
  const opened = orch.open({ member, phase: 'normal', role: 'academician', roleLabel: '院士', rosterIds, round: 1, meeting })
  assert.equal(opened.ok, true)
  const asm = await orch.assemble(opened.turn)
  return { turn: opened.turn, asm }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §0 — THE DECLARATION THE PROMPT RENDERS IS THREE GROUPS, NAMED
console.log('\n§0 live status declaration')
ok(Array.isArray(LIVE_STATUS_FIELDS) && LIVE_STATUS_FIELDS.length === 3, 'LIVE_STATUS_FIELDS declares exactly three groups')
ok(JSON.stringify(LIVE_STATUS_FIELDS.map((d) => d.key)) === JSON.stringify(['paper', 'blueprint', 'closure']), 'the three keys are paper/blueprint/closure (one group, one question)')
ok(LIVE_STATUS_FIELDS.every((d) => typeof d.label === 'string' && d.label.trim() !== ''), 'every group has a non-empty label (an unlabelled row is impossible)')

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §1 — EMPTY WORLD: THE BLUEPRINT GROUP IS A NAMED ABSENCE
//
// ★ TB-2724 / RUN 77 (B) moved this world. Old world: a null group rendered NOTHING, so an all-null status block was
// byte-identical to pre-RUN-258 and the 77th run simply lost its `[蓝图]` line. New world: a null group that NAMES a why is
// a reading and must render — but only the blueprint group does so this round (the taskbook scopes B to `[蓝图]`;
// paper/closure keep the RUN-258 silent skip until their own reading is asked).
console.log('\n§1 empty world ⇒ named absence, no empty rows')
const empty = await boot()
const liveEmpty = liveStatusReadings({ records: empty.K.records })
ok(liveEmpty.paper && liveEmpty.paper.value === null, 'no paper row ⇒ paper.value is null (not undefined)')
ok(typeof liveEmpty.paper.why === 'string' && liveEmpty.paper.why.trim() !== '', 'paper names WHY it is absent', liveEmpty.paper.why)
ok(typeof liveEmpty.paper.source === 'string' && liveEmpty.paper.source.indexOf('paper') >= 0, 'paper names the ledger/source it tried', liveEmpty.paper.source)
ok(liveEmpty.blueprint && liveEmpty.blueprint.value === null && typeof liveEmpty.blueprint.why === 'string' && liveEmpty.blueprint.why.trim() !== '', 'no blueprint row ⇒ null + why')
ok(liveEmpty.closure && liveEmpty.closure.value === null && typeof liveEmpty.closure.why === 'string' && liveEmpty.closure.why.trim() !== '', 'no votes and no bound meeting ⇒ null + why')
ok(renderLiveStatus(liveEmpty) === '[蓝图] 无现行版（rev 0，md 未落盘）',
  'all-null world renders the NAMED blueprint absence (empty is a reading now, and only the blueprint group speaks)', renderLiveStatus(liveEmpty))
const orchEmpty = orchFor(empty.K)
const emptyAsm = await assembleFor(orchEmpty)
ok(emptyAsm.asm.text.indexOf('[状态板]') >= 0, 'the pre-existing board is still there')
ok(emptyAsm.asm.text.indexOf('[论文]') < 0 && emptyAsm.asm.text.indexOf('[结题]') < 0
  && emptyAsm.asm.text.indexOf('[蓝图]') >= 0 && emptyAsm.asm.text.indexOf('无现行版') >= 0,
  'an empty world adds the [蓝图] named absence, and still no [论文]/[结题] line', { chars: emptyAsm.asm.text.length })
const emptyStatus = orchEmpty.status({ roster: ['r-acad', 'r-1', 'r-2'] })
ok(emptyStatus.liveReadings && emptyStatus.liveReadings.paper.value === null, 'status().liveReadings carries the same named absence (null, not missing key)')
ok(typeof emptyStatus.liveReadingsMeans === 'string' && emptyStatus.liveReadingsMeans.indexOf('null') >= 0, 'liveReadingsMeans explains what null means')

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §0b — THE FACE MAP IS THE PRODUCTION ONE, AND BOTH DOORS ARE MEASURED (TB-2720 / task-203)
//
// The question this section answers: does the suite hand the orchestrator the SAME face map production does? Before
// task-203 the answer was no — the bag was hand-made from whole services, so a production face that carries only
// list/get (STATUS_BOARD_READ_OPS) was never measured, and the run-76 defect (blueprint reading null on every turn)
// stayed green. Now: §0b pins the function by name, measures the restricted face (the run-76 shape: no mdParse ⇒ kernel
// fallback), and measures the wired face (mdParse present ⇒ records.mdParse). Both readings must be non-null — a named
// absence is only acceptable when the row really does not exist.
console.log('\n§0b the face map is the production assembly, not a hand-made bag')
const fsForFaces = await import('node:fs')
const kernelSrcForFaces = fsForFaces.readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
ok(typeof facesFrom === 'function', '★ facesFrom is exported from the turn module — the function the kernel really calls')
ok(typeof STATUS_BOARD_READ_OPS === 'object' && JSON.stringify(STATUS_BOARD_READ_OPS['vmu.records']) === JSON.stringify(['list', 'get']),
  '★ STATUS_BOARD_READ_OPS binds the records face to list/get only (the seam that drops mdParse)', STATUS_BOARD_READ_OPS['vmu.records'])
ok(kernelSrcForFaces.indexOf('const turnFaces = facesFrom({') >= 0 && kernelSrcForFaces.indexOf('faces: turnFaces') >= 0,
  '★ the kernel builds the turn face map with THAT function and hands THAT map to the orchestrator (renaming the function turns this red instead of silently measuring another object)')
const faceBoot = await boot()
const prodFaces = productionFaces(faceBoot.K)
ok(prodFaces && prodFaces['vmu.records'] && typeof prodFaces['vmu.records'].list === 'function',
  'the production map carries the records face with list', prodFaces && Object.keys(prodFaces['vmu.records'] || {}))
ok(['mdParse', 'mdDigest', 'mdRead'].every((op) => typeof prodFaces['vmu.records'][op] === 'function'),
  '★ the PRODUCTION records face carries the md door (the wiring createKernel adds after facesFrom)', Object.keys(prodFaces['vmu.records'] || {}))
const restrictedFaces = facesFrom({ records: faceBoot.K.records })
ok(restrictedFaces && restrictedFaces['vmu.records'] && typeof restrictedFaces['vmu.records'].list === 'function',
  'facesFrom alone still binds the declared reads (list/get)', restrictedFaces && Object.keys(restrictedFaces['vmu.records'] || {}))
ok(typeof restrictedFaces['vmu.records'].mdParse !== 'function',
  '★ facesFrom alone does NOT bind mdParse — this is the run-76 production shape the defect lived on')
// A real blueprint row on this kernel, then read it through BOTH faces — the fallback and the wired parser answer the
// same question, and each reading says which door answered.
await faceBoot.call('vibe_v5_start', { problem: 'face map' })
const bpRelF = 'Shared/Drafts/Face-r1.md'
faceBoot.K.records.mdWrite({
  path: bpRelF, title: 'Face', track: 'blueprint', kind: 'blueprint',
  fields: { path: 'VibeMath/Face.md', status: 'draft', revision: 1, proposedBy: 'r-acad', proposedAt: '2026-11-09T00:00:00.000Z' },
  text: 'face body',
})
const bpProposedF = await faceBoot.call('vibe_v5_blueprint', { action: 'propose', path: 'VibeMath/Face.md', member: 'r-acad', mdPath: bpRelF })
ok(bpProposedF && bpProposedF.ok === true, 'a blueprint really exists on this kernel (the reading has something to read)', bpProposedF && bpProposedF.code)
const orchRestricted = orchFor(faceBoot.K, () => 1000, restrictedFaces)
await assembleFor(orchRestricted)
const stRestricted = orchRestricted.status({ roster: ['r-acad', 'r-1', 'r-2'] })
const bpRestricted = stRestricted && stRestricted.liveReadings ? stRestricted.liveReadings.blueprint : null
ok(bpRestricted && bpRestricted.value !== null, '★ a list/get-only face STILL reads the blueprint (no null reading where a row exists)', bpRestricted && (bpRestricted.why || bpRestricted.value))
ok(bpRestricted && bpRestricted.detail && bpRestricted.detail.mdParserSource === 'kernel-own-md-parse',
  '★ and the restricted reading names the FALLBACK parser as the door that answered', bpRestricted && bpRestricted.detail && bpRestricted.detail.mdParserSource)
const orchWired = orchFor(faceBoot.K)
await assembleFor(orchWired)
const stWired = orchWired.status({ roster: ['r-acad', 'r-1', 'r-2'] })
const bpWired = stWired && stWired.liveReadings ? stWired.liveReadings.blueprint : null
ok(bpWired && bpWired.value !== null, '★ through the WIRED production face the blueprint is read too', bpWired && (bpWired.why || bpWired.value))
ok(bpWired && bpWired.detail && bpWired.detail.mdParserSource === 'records.mdParse',
  '★ and it says records.mdParse answered — the two doors are kept apart, not collapsed into one sentence', bpWired && bpWired.detail && bpWired.detail.mdParserSource)
ok(bpWired && bpRestricted && bpWired.detail && bpRestricted.detail &&
  String(bpWired.detail.id) === String(bpRestricted.detail.id) &&
  bpWired.detail.status === bpRestricted.detail.status && bpWired.detail.revision === bpRestricted.detail.revision,
'both doors parse the SAME row into the same fields (status/revision/id); only the mdDigest door differs, and that is said out loud',
{ wired: bpWired && bpWired.detail, fallback: bpRestricted && bpRestricted.detail })

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §2 — PAPER: READ FROM THE DURABLE `paper-state` ROW, MISSING DERIVED, NOT INVENTED
console.log('\n§2 paper group')
const w = await boot()
const startedW = await w.call('vibe_v5_start', { problem: 'placeholder' })
ok(startedW && startedW.ok === true, 'the institute really started through the tool face (four seats hired)', startedW && startedW.hired)
const paperStart = await w.call('vibe_v5_paper', { action: 'start', target: 'paper-p1', title: 'P', participants: ['r-1', 'r-2'] })
ok(paperStart && paperStart.ok === true, 'the paper really started through the tool face', paperStart && paperStart.code)
const liveP = liveStatusReadings({ records: w.K.records, rosterIds: ['r-acad', 'r-1'], member: 'r-acad' })
ok(liveP.paper.value !== null, 'a started paper produces a paper reading', liveP.paper.value)
ok(liveP.paper.detail && liveP.paper.detail.status === 'writing', 'paper.status is the pack lifecycle word read from the row (writing)', liveP.paper.detail && liveP.paper.detail.status)
ok(liveP.paper.detail && liveP.paper.detail.round === 1, 'paper.round is read from the row', liveP.paper.detail && liveP.paper.detail.round)
assert.deepEqual(liveP.paper.detail.missing, ['r-1', 'r-2'])
ok(Array.isArray(liveP.paper.detail.missing) && liveP.paper.detail.missing.length === 2, 'paper.missing is DERIVED from the row (participants without a part), not copied', liveP.paper.detail.missing)
ok(liveP.paper.detail && liveP.paper.detail.toolchainAbsent === null && typeof liveP.paper.detail.toolchainAbsentWhy === 'string', 'toolchainAbsent is a NAMED absence (reason says the ledger has no such fact)')
ok(typeof liveP.paper.source === 'string' && liveP.paper.source.indexOf('paper-state') >= 0, 'paper.source names the row/ledger that answered', liveP.paper.source)
ok(liveP.paper.at !== null || typeof liveP.paper.timeWhy === 'string', 'paper reading carries at or timeWhy (never neither)')
// Re-read through the SAME door the prompt uses and compare against the tool receipt's own word.
const rowsP = w.K.records.list({ track: 'paper', limit: 0 }).items.filter((r) => String(r.kind) === 'paper-state')
ok(rowsP.length === 1, 'exactly one paper-state row exists (the durable truth this reader reads)')
const bodyP = JSON.parse(w.K.records.get({ id: String(rowsP[0].id) }).body)
ok(bodyP.status === liveP.paper.detail.status && bodyP.round === liveP.paper.detail.round, 'the reading equals the row body it claims as its source (external recompute, not self-reference)')

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §3 — BLUEPRINT: BODY IS THE MD, READ WITH THE KERNEL'S OWN PARSER; FILE STATE FROM mdDigest
console.log('\n§3 blueprint group')
// RUN 255 fs-first: the member writes the draft file FIRST, then proposes the same mdPath. The test writes it through
// the kernel's own md door (records.mdWrite = the indexed md format), which is the same format the member path produces.
const bpRel = 'Shared/Drafts/Protocol-r1.md'
const bpWrote = w.K.records.mdWrite({
  path: bpRel, title: 'Protocol', track: 'blueprint', kind: 'blueprint',
  fields: { path: 'VibeMath/Protocol.md', status: 'draft', revision: 1, proposedBy: 'r-acad', proposedAt: '2026-11-09T00:00:00.000Z' },
  text: 'draft body',
})
ok(bpWrote && bpWrote.written === true, 'the draft md is really on disk (fs-first path)', bpWrote && bpWrote.means)
const bpProposed = await w.call('vibe_v5_blueprint', { action: 'propose', path: 'VibeMath/Protocol.md', member: 'r-acad', mdPath: bpRel })
ok(bpProposed && bpProposed.ok === true && bpProposed.filed === true, 'the blueprint was proposed from that file through the tool face', bpProposed && (bpProposed.code || bpProposed.filed))
const liveB = liveStatusReadings({ records: w.K.records })
ok(liveB.blueprint.value !== null, 'a proposed blueprint produces a blueprint reading', liveB.blueprint.value)
ok(liveB.blueprint.detail && liveB.blueprint.detail.status === 'draft' && liveB.blueprint.detail.revision === 1, 'blueprint.status/revision come from the md body parsed by records.mdParse (draft, r1)', liveB.blueprint.detail)
ok(liveB.blueprint.detail && liveB.blueprint.detail.draftMdMissing === false, 'the file is on disk ⇒ draftMdMissing false (read through records.mdDigest)', liveB.blueprint.detail && liveB.blueprint.detail.draftMdMissing)
ok(liveB.blueprint.detail && liveB.blueprint.detail.mdChangedSinceIndex === false, 'the file and the index row agree ⇒ mdChangedSinceIndex false', liveB.blueprint.detail && liveB.blueprint.detail.mdChangedSinceIndex)
const bpAbs = join(w.root, 'VibeMath', bpRel)
// The file is the truth: delete it and the reading must SAY the draft is missing (the adopt gate's own predicate).
const { rmSync, writeFileSync, mkdirSync } = await import('node:fs')
rmSync(bpAbs, { force: true })
const liveB2 = liveStatusReadings({ records: w.K.records })
ok(liveB2.blueprint.detail.draftMdMissing === true, 'the draft file is gone ⇒ draftMdMissing true (existence answered by records.mdDigest, not by fs here)')
// And an outside edit is the reindex predicate, on the same reading.
mkdirSync(dirname(bpAbs), { recursive: true })
writeFileSync(bpAbs, '# Protocol draft (edited outside the tools)\n', 'utf8')
const liveB3 = liveStatusReadings({ records: w.K.records })
ok(liveB3.blueprint.detail.draftMdMissing === false && liveB3.blueprint.detail.mdChangedSinceIndex === true, 'an outside edit ⇒ mdChangedSinceIndex true (same predicate as the adopt gate)', liveB3.blueprint.detail)
ok(liveB3.blueprint.value.indexOf('reindex') >= 0, 'the rendered blueprint value says a reindex is needed', liveB3.blueprint.value)

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §4 — CLOSURE: VOTE TALLY PLUS THE BOUND MEETING'S PENDING MOTIONS
console.log('\n§4 closure group')
const votes = new Map([['r-1', 'for'], ['r-2', 'against']])
const liveC = liveStatusReadings({ records: w.K.records, rosterIds: ['r-acad', 'r-1', 'r-2'], votes })
ok(liveC.closure.value !== null, 'votes exist ⇒ a closure reading', liveC.closure.value)
ok(liveC.closure.detail.votesCast === 2 && liveC.closure.detail.votesTotal === 3, 'votesCast/votesTotal read from the vote map and the turn roster', liveC.closure.detail)
ok(liveC.closure.detail.votesFor === 1 && liveC.closure.detail.votesAgainst === 1, 'for/against are counted, not inferred', liveC.closure.detail)
ok(typeof liveC.closure.detail.denominator === 'string' && liveC.closure.detail.denominator.indexOf('roster') >= 0, 'the denominator is STATED (eligibility filtering lives on the balloting face)')
const convened = await w.call('vibe_v5_meeting', { action: 'convene', id: 'm1', member: 'r-acad', agenda: 'closure check', members: ['r-acad', 'r-1', 'r-2'], at: 900000 })
ok(convened && convened.ok === true, 'the bound meeting really exists through the tool face', convened && convened.code)
const liveC2 = liveStatusReadings({ records: w.K.records, rosterIds: ['r-acad', 'r-1', 'r-2'], votes, meeting: 'm1', meetings: w.K.meetings })
ok(liveC2.closure.detail.motionsPending === 0, 'a meeting with no motions reports motionsPending 0 (not null, not invented)', liveC2.closure.detail)
ok(liveC2.closure.detail.motions && liveC2.closure.detail.motions.meeting === 'm1', 'the motion reading names the meeting it read')

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §5 — THE PROMPT AND THE RECEIPT ARE THE SAME READING (one production call site)
console.log('\n§5 prompt text === status().liveReadings')
const orchP = orchFor(w.K)
const { asm, turn } = await assembleFor(orchP)
const statusP = orchP.status({ roster: ['r-acad', 'r-1', 'r-2'] })
ok(typeof asm.text === 'string' && asm.text.indexOf('[论文]') >= 0, 'the assembled prompt carries the [论文] line once a paper exists')
ok(asm.text.indexOf('[蓝图]') >= 0, 'the assembled prompt carries the [蓝图] line once a blueprint exists')
ok(statusP.liveReadings !== null && asm.text.indexOf(statusP.liveReadings.paper.value) >= 0 && asm.text.indexOf(statusP.liveReadings.blueprint.value) >= 0, 'status().liveReadings IS the reading the assembled prompt rendered (same values, no drift, no second read)')
ok(statusP.liveReadings.paper.detail.status === liveP.paper.detail.status, 'the prompt-path paper status equals the direct ledger read (external recompute)')
ok(asm.text.indexOf(String(statusP.liveReadings.paper.detail.status)) >= 0, 'the rendered text contains the status word the receipt reports', statusP.liveReadings.paper.value)
ok(turn && turn.phase === 'normal', 'the turn that was assembled is the one whose readings these are')

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// §6 — THREE WORLDS ⇒ THREE PROMPT SHAS (the defect this task exists for)
console.log('\n§6 three worlds, three shas')
const india = await boot()
await india.call('vibe_v5_start', { problem: 'placeholder' })
await india.call('vibe_v5_paper', { action: 'start', target: 'paper-w1', title: 'W', participants: ['r-1'] })
const row = india.K.records.list({ track: 'paper', limit: 0 }).items.filter((r) => String(r.kind) === 'paper-state')[0]
const bodyObj = JSON.parse(india.K.records.get({ id: String(row.id) }).body)
const worlds = ['writing', 'reviewing', 'finalized']
const texts = []
for (const status of worlds) {
  india.K.records.put({ id: String(row.id), track: 'paper', kind: 'paper-state', title: String(row.title), body: JSON.stringify(Object.assign({}, bodyObj, { status, stage: status })), owner: 'vibe_v5_paper' })
  const orch = orchFor(india.K)
  const out = await assembleFor(orch)
  texts.push({ status, text: out.asm.text, sha: sha(out.asm.text) })
}
ok(texts.length > 0 && texts.every((t) => t.text.indexOf(t.status) >= 0), 'each world renders its own status word', texts.map((t) => t.status + ':' + (t.text.indexOf(t.status) >= 0)))
ok(new Set(texts.map((t) => t.sha)).size === 3, 'the three worlds produce THREE distinct prompt shas (the pre-fix defect was one sha in all three)', texts.map((t) => t.sha.slice(0, 12)))

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n=== VMU RUN 256 STATUS BLOCK LIVE: ' + String(passed) + ' passed, ' + String(failed) + ' failed ===')
for (const d of roots) { try { (await import('node:fs')).rmSync(d, { recursive: true, force: true }) } catch (e) { /* a temp dir must not fail the suite */ } }
if (failed > 0) process.exitCode = 1
