// tests/vmu-run236-direction-card.test.mjs — the DIRECTION CARD (rules G10/G13/G14) and its host face.
//
// WHY THIS TEST EXISTS. The rules audit (docs/acceptance/sim-audit-rules.md) recorded G10/G13/G14 as PROSE-ONLY:
// the rule text tells a member to keep per-direction information, to reuse what worked, and to check whether a
// similar problem was already handled — and nothing in the framework had a place to write any of it. `vibe_vmu_direction`
// is the minimal carrier: NOT a gate, NOT a score, only "there is somewhere to write, a write lands, a read returns it,
// and a card missing a required field says WHICH ones".
//
// Five sections, each a different claim:
//   1. the declared shape (nine fields, five required, stable id) — the contract the rule text names;
//   2. the face is reachable exactly when the ledger is (a durable root), and absent otherwise (zero mechanism);
//   3. a write LACKING a required field is refused BY NAME with the field names (and the refusal carries enumerable facts);
//   4. a full card round-trips: all nine fields appear, empty ones are `null` + `fieldsMissing`, and an update
//      SUPERSEDES the same row (revision grows, earlier revisions stay in the record history);
//   5. the card really IS a records row on the `state` track (kind `route`, md body) — not a second store.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import {
  DIRECTION_FIELDS, DIRECTION_REQUIRED, DIRECTION_LABELS, CODE, apiVersion,
  directionIdOf, bodyOf, cardOf, createDirections,
} from '../vibe-math-vmu/kernel/directions.js'
import { mdParseText } from '../vibe-math-vmu/kernel/records.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const threw = (fn) => { try { fn(); return null } catch (e) { return e } }
const specOf = (specs, name) => specs.find((s) => s && s.name === name) || null
const FULL = {
  direction: 'mainline',
  current_assessment: '主线可跑，证据路径已打通',
  initial_plan: '把 21 步主线跑通并逐条收集回执',
  feasibility: '可行：宿主与内核都在本机，缺的只是缝',
  findings: 'records 的 state 轨已经能装状态行，不需要新存储',
  reuse: '上一次的 report 投递缝可以复用成 direction 的写入路径',
}
const NINE = FULL

console.log('=== 1. THE DECLARED SHAPE (nine fields, five required, stable id) ===')
{
  ok(apiVersion === 1, 'the module publishes its interface version (docs/03 §7)', apiVersion)
  ok(DIRECTION_FIELDS.length === 9, 'exactly nine fields (G10 names nine)', DIRECTION_FIELDS.length)
  ok(JSON.stringify(DIRECTION_FIELDS) === JSON.stringify(['current_assessment', 'initial_plan', 'related_plan', 'feasibility', 'value', 'findings', 'obstacles', 'history', 'reuse']),
    '★ the nine keys and their ORDER are exactly the rule text’s order', DIRECTION_FIELDS)
  ok(DIRECTION_REQUIRED.length === 5, 'five of them are required', DIRECTION_REQUIRED.length)
  ok(DIRECTION_REQUIRED.every((f) => DIRECTION_FIELDS.includes(f)),
    'every required field is one of the nine (no phantom requirement)', DIRECTION_REQUIRED)
  ok(DIRECTION_FIELDS.every((f) => f in DIRECTION_LABELS) && DIRECTION_FIELDS.every((f) => String(DIRECTION_LABELS[f]).trim().length > 0),
    'every field has a non-empty Chinese label (the read face prints them)', DIRECTION_LABELS)
  ok(CODE.INCOMPLETE === 'VMU_DIRECTION_INCOMPLETE', 'the one code this module throws is the registered one', CODE.INCOMPLETE)
  ok(directionIdOf('mainline') === directionIdOf(' mainline ') && directionIdOf('mainline') === 'dir-mainline',
    '★ the id is STABLE for a direction key (whitespace-insensitive) — an update must not mint a second card', [directionIdOf('mainline'), directionIdOf(' mainline ')])
  ok(directionIdOf('a b/c') === 'dir-a-b-c' && directionIdOf('') === 'dir-unnamed',
    'the id is a safe slug; an empty key still gets a deterministic id (the refusal happens earlier, by name)', [directionIdOf('a b/c'), directionIdOf('')])
  const body = bodyOf('mainline', NINE)
  const parsed = mdParseText(body)
  ok(parsed.ok === true && parsed.fields.direction === 'mainline' && parsed.fields.current_assessment === NINE.current_assessment,
    '★ the card body is the EXISTING vmu-md/1 shape (records’ own composer/parser round-trips it)', parsed.ok)
  ok(cardOf(body).fields.reuse === NINE.reuse && cardOf(body).fields.value === '',
    'the module’s own card parser returns the nine fields (an unwritten field reads as empty)', cardOf(body).fields)
}

console.log('=== 2. THE FACE IS REACHABLE EXACTLY WHEN THE LEDGER IS ===')
{
  const bare = createKernel({})
  const bareSpecs = toolSpecs({ kernel: bare, settings: { 'vmu.core.enabled': true } })
  ok(specOf(bareSpecs, TOOL_NAMES.direction) === null,
    '★ zero mechanism: a bare kernel publishes NO direction face (it has no durable ledger to write to)',
    bareSpecs.map((s) => s.name))
  ok(bareSpecs.length === 1 && bareSpecs[0].name === TOOL_NAMES.status,
    'and it still publishes exactly ONE tool (status)', bareSpecs.map((s) => s.name))

  const root = mkdtempSync(join(tmpdir(), 'vmu-dir-'))
  try {
    const kernel = createKernel({ root })
    const specs = toolSpecs({ kernel, settings: { 'vmu.core.enabled': true } })
    const spec = specOf(specs, TOOL_NAMES.direction)
    ok(!!spec, '★ a durable kernel DOES publish the direction face', specs.map((s) => s.name).filter((n) => /direction/.test(n)))
    ok(JSON.stringify(Object.keys(spec.parameters)) === JSON.stringify(['action', 'direction', ...DIRECTION_FIELDS, 'by']),
      '★ the published parameter list IS the face’s list (action/direction/nine fields/by — no drift)', Object.keys(spec.parameters))
    ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(['set', 'get', 'list']),
      'the action enum is exactly set|get|list (the card is not a workflow engine)', spec.parameters.action.enum)
    ok(spec.parameters.action.required === true && spec.parameters.direction.required !== true,
      'action is required at the tool boundary; direction is validated by the module (both sides refuse, differently)', Object.keys(spec.parameters))

    console.log('=== 3. A CARD MISSING A REQUIRED FIELD IS REFUSED BY NAME ===')
    const miss = await spec.run({ action: 'set', direction: 'half', current_assessment: '只写了评价' })
    ok(miss.ok === false && miss.code === 'VMU_DIRECTION_INCOMPLETE',
      '★ an incomplete card is a NAMED refusal (VMU_DIRECTION_INCOMPLETE), not a silent write', [miss.ok, miss.code])
    ok(typeof miss.message === 'string' && /initial_plan/.test(miss.message) && /feasibility/.test(miss.message) && /findings/.test(miss.message) && /reuse/.test(miss.message),
      '★ the message NAMES the missing fields it is about (four of the five here)', miss.message)
    ok(typeof miss.hint === 'string' && /current_assessment/.test(miss.hint) && /initial_plan/.test(miss.hint) && /feasibility/.test(miss.hint) && /findings/.test(miss.hint) && /reuse/.test(miss.hint),
      'the hint lists the REQUIRED set, so the next call can be fixed without reading the code', miss.hint)
    ok(Array.isArray(miss.fieldsMissing) && miss.fieldsMissing.length === 4 && miss.fieldsMissing.indexOf('current_assessment') === -1,
      '★ the refusal also carries the missing set as a machine-readable fact (enumerable, not prose)', miss.fieldsMissing)

    console.log('=== 4. A FULL CARD ROUND-TRIPS, AND AN UPDATE SUPERSEDES THE SAME ROW ===')
    const created = await spec.run({ action: 'set', ...FULL })
    ok(created.ok === true && created.mode === 'created' && created.direction === 'mainline',
      '★ a full card is written', [created.ok, created.mode])
    ok(created.id === 'dir-mainline' && created.fieldsMissing.length === 4 && created.fieldsMissing.indexOf('value') >= 0,
      'the card reports which of the nine it leaves empty (the four optional ones)', created.fieldsMissing)
    const got = await spec.run({ action: 'get', direction: 'mainline' })
    ok(got.ok === true && got.revision === 1, 'reading it back gives revision 1', [got.ok, got.revision])
    ok(Object.keys(got.fields).length === 9 && DIRECTION_FIELDS.every((f) => f in got.fields),
      '★ ALL NINE fields appear on every read (no field silently vanishes)', Object.keys(got.fields))
    ok(got.fields.current_assessment === FULL.current_assessment && got.fields.reuse === FULL.reuse,
      'the written values come back verbatim', [got.fields.current_assessment, got.fields.reuse])
    ok(got.fields.value === null && got.fields.obstacles === null && got.fields.related_plan === null && got.fields.history === null,
      '★ an unwritten field reads as `null` (empty ≠ “nothing applies”)', [got.fields.value, got.fields.obstacles])
    ok(Array.isArray(got.fieldsMissing) && got.fieldsMissing.length === 4 && /never recorded/.test(String(got.fieldsMeans)),
      'the read says which are empty and what empty MEANS', [got.fieldsMissing, got.fieldsMeans])
    ok(got.labels && got.labels.current_assessment === '当下评价' && got.supersededBy === null,
      'the read prints the Chinese labels and states that this IS the live revision', [got.labels, got.supersededBy])

    const updated = await spec.run({ action: 'set', ...FULL, value: '价值：它让 G10 可观测', obstacles: 'Windows 的 rmSync 竞态' })
    ok(updated.ok === true && updated.mode === 'updated', '★ writing the same direction again UPDATES (does not mint a second card)', updated.mode)
    const got2 = await spec.run({ action: 'get', direction: 'mainline' })
    ok(got2.revision === 2 && got2.previousRevisions === 1,
      'the update bumps the revision and reports how many earlier ones exist (history is kept, not overwritten)', [got2.revision, got2.previousRevisions])
    ok(got2.fields.value === '价值：它让 G10 可观测' && got2.fieldsMissing.length === 2,
      'the new values are live and the empty set shrank', [got2.fields.value, got2.fieldsMissing])

    const listed = await spec.run({ action: 'list' })
    ok(listed.ok === true && listed.count === 1 && listed.directions[0] === 'mainline',
      '★ list names the direction keys that exist', [listed.count, listed.directions])
    ok(typeof listed.items[0].updatedAt === 'number' && listed.items[0].fieldsMissing === 2 && listed.items[0].revision === 2,
      'each row carries updatedAt / revision / how many fields are still empty', listed.items[0])

    console.log('=== 5. THE CARD IS A RECORDS ROW (state track, kind route) — NOT A SECOND STORE ===')
    const row = kernel.records.get({ id: 'dir-mainline', includeBody: true })
    ok(!!row && row.track === 'state' && row.kind === 'route' && row.title === '方向卡：mainline',
      '★ the card lives on the EXISTING state track as kind=route', row && [row.track, row.kind, row.title])
    ok(/按什么方向|direction/.test(String(row.body)) && row.rev === 2,
      'its body is the md card, and the records revision agrees with the read face', [row.rev])
    const trail = kernel.records.history({ id: 'dir-mainline' })
    ok(Array.isArray(trail.versions) && trail.versions.length >= 1,
      '★ the earlier revision is IN the record version trail (records.history), not lost', trail && trail.versions && trail.versions.length)
    const keys = toolSpecs({ kernel, settings: { 'vmu.core.enabled': true } }).map((s) => s.name)
    ok(keys.indexOf(TOOL_NAMES.records) >= 0 && keys.indexOf(TOOL_NAMES.direction) >= 0,
      'the records face and the direction face co-exist on one ledger', keys.length)

    console.log('=== 6. THE OTHER REFUSALS ARE NAMED TOO ===')
    const noKey = await spec.run({ action: 'set', current_assessment: 'x' })
    ok(noKey.ok === false && noKey.code === 'VMU_INVALID_ARGUMENT' && /direction/.test(noKey.message),
      'a card with no direction key is refused by name (there is nothing to address)', [noKey.code, noKey.message])
    const unknown = await spec.run({ action: 'get', direction: 'nope' })
    ok(unknown.ok === false && unknown.code === 'VMU_NO_SUCH_OBJECT' && /mainline/.test(unknown.hint),
      'reading an unknown direction is VMU_NO_SUCH_OBJECT, and the hint names the keys that DO exist', [unknown.code, unknown.hint])
    const badAction = await spec.run({ action: 'score' })
    ok(badAction.ok === false && badAction.code === 'VMU_INVALID_ARGUMENT',
      'the face is not a scorer: an unknown action is refused, never guessed', badAction.code)
    const bareApi = createDirections({ kernel: {} })
    const e = threw(() => bareApi.get({ direction: 'x' }))
    ok(!!e && e.code === 'VMU_ENGINE_UNAVAILABLE',
      'without a records projection the module refuses by name instead of pretending a card exists', e && e.code)
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) } catch { /* the OS may still hold a handle; the temp dir is outside the repo */ }
  }
}

console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.error(failures.join('\n')); process.exit(1) }
