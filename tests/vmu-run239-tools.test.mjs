// RUN 239-E — two tool-face repairs, pinned on the REAL assembly (scripts/sim/harness.mjs boots the real kernel,
// the real pack and the real tool registry; `call()` with `as:{agent:{id}}` produces a real turn member).
//
//  #8 `vibe_v5_script {op:"archive"}` used to accept ONLY `name`+`text`, so a member holding a library record whose
//     BODY IS the script (`id:"rec-19"`, run 62) was told "script archive is missing: name, text" and the hint never
//     mentioned the record it already had. The archive accepts either source now and the receipt says which one.
//  #9 `vibe_v5_meeting`'s `agenda` schema said `string` while the face really accepted an array and silently joined it
//     into `materials`. The schema now declares `string | string[]`, and the convene receipt reads the agenda back in
//     both shapes (`agenda`, `agendaItems`, `agendaSource`, `agendaItemsSource`).
//
// Each assertion is earned from a receipt or a host schema produced here — no grammar over the source file, and no
// vacuous pass (every `every`/`some` sits behind a non-empty anchor).

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'
import assert from 'assert'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const HARNESS = await import(pathToFileURL(join(REPO, 'scripts/sim/harness.mjs')).href)
const root = mkdtempSync(join(tmpdir(), 'vmu-run239-tools-'))

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push({ name, detail })
  console.log('  FAIL: ' + name + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
}
function eq(actual, expected, name) {
  ok(actual === expected, name, { actual, expected })
}
function deepEq(actual, expected, name) {
  let same = true
  try { assert.deepStrictEqual(actual, expected) } catch (e) { same = false }
  ok(same, name, { actual, expected })
}
// The audit's A2 rule, applied to the receipts this test produces: a JavaScript type name in a message is a leak.
function leaks(out) {
  const text = JSON.stringify(out)
  return ['undefined', '[object Object]', 'NaN'].filter((bad) => text.includes(bad))
}

const h = await HARNESS.boot({ root })
const as = (id) => ({ as: { agent: { id } } })
const call = (name, args, opts) => h.call(name, args, opts)

try {
  // ── premise ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const started = await call('vibe_v5_start', { problem: 'run 239-E: archive by record id, agenda as items', researcherCount: 2 })
  ok(started && started.ok === true, 'premise: the institute starts on the real assembly', started && started.code)
  const roster = Array.isArray(started && started.hired) ? started.hired : []
  ok(roster.length > 0 && roster.includes('r-acad') && roster.includes('r-1'),
    'premise: the roster carries the academician and a resident researcher', roster)

  const seeded = await call('vibe_v5_record_progress', { member: 'r-1', track: 'progress', content: 'print("archived from a record body")' }, as('r-1'))
  ok(seeded && seeded.ok === true && typeof seeded.recordId === 'string' && seeded.recordId.startsWith('rec-'),
    'premise: a library record exists to archive (its body is the script text)', { ok: seeded && seeded.ok, id: seeded && seeded.recordId })
  const recordId = seeded.recordId
  const recordBody = 'print("archived from a record body")'

  // ── #8 archive by RECORD id ─────────────────────────────────────────────────────────────────────────────────────
  const byId = await call('vibe_v5_script', { op: 'archive', id: recordId, purpose: 'run 62 replay' })
  ok(byId && byId.ok === true, '#8: archive accepts id:"rec-<n>" (a record whose body IS the script)', byId && { code: byId.code, message: byId.message })
  ok(byId && byId.source === 'record', '#8: the receipt says the bytes came from the RECORD face (source:"record")', byId && byId.source)
  ok(byId && byId.fromRecord && byId.fromRecord.id === recordId,
    '#8: fromRecord names the exact record that was read', byId && byId.fromRecord)
  ok(byId && byId.fromRecord && typeof byId.fromRecord.title === 'string' && byId.fromRecord.title.length > 0,
    '#8: fromRecord carries the row title the archive name defaulted to', byId && byId.fromRecord)
  ok(byId && byId.fromRecord && byId.fromRecord.bytes === Buffer.byteLength(recordBody, 'utf8'),
    '#8: fromRecord.bytes measures the body it read', byId && byId.fromRecord)
  eq(byId && byId.name, byId && byId.fromRecord && byId.fromRecord.title,
    '#8: with no explicit name, the archive name defaults to the record title')
  eq(byId && byId.archived && byId.archived.name, byId && byId.name, '#8: archived.name and the receipt name agree')
  eq(byId && byId.archived && byId.archived.source, 'record', '#8: archived.source is the same door')
  eq(byId && byId.archived && byId.archived.bytes, Buffer.byteLength(recordBody, 'utf8'), '#8: archived.bytes measures the stored body')
  ok(byId && typeof byId.archived.recordId === 'string' && byId.archived.recordId.startsWith('rec-'),
    '#8: the archive row has its own record id (distinct from the source record)', byId && byId.archived)
  eq(leaks(byId).length, 0, '#8: the archive receipt leaks no JavaScript type name', leaks(byId))

  // the archived text is the source record body, verbatim
  const readBack = await call('vibe_v5_script', { op: 'read', id: byId.archived.recordId })
  ok(readBack && readBack.ok === true && readBack.script && readBack.script.text === recordBody,
    '#8: op=read returns the source body VERBATIM (the record body is the script)', readBack && readBack.script && readBack.script.text)

  // explicit name still wins over the record title
  const override = await call('vibe_v5_script', { op: 'archive', id: recordId, name: 'replayed-from-record.py' })
  ok(override && override.ok === true, '#8: an explicit name does not break the record path', override && override.code)
  eq(override && override.name, 'replayed-from-record.py', '#8: an explicit name OVERRIDES the record title')
  eq(override && override.fromRecord && override.fromRecord.id, recordId, '#8: the override receipt still names the source record')

  // ── #8 the OTHER door still works, and the refusal names BOTH doors ────────────────────────────────────────────
  const byText = await call('vibe_v5_script', { op: 'archive', name: 'carried.py', text: 'x = 1\n' })
  ok(byText && byText.ok === true && byText.source === 'argument',
    '#8: name+text still archives, and the receipt says source:"argument"', byText && { ok: byText.ok, source: byText.source })
  eq(byText && byText.fromRecord, null, '#8: a literal archive has no fromRecord (null, not a made-up object)')
  eq(byText && byText.archived && byText.archived.bytes, Buffer.byteLength('x = 1\n', 'utf8'), '#8: the literal archive measures the text it stored')

  const missingBoth = await call('vibe_v5_script', { op: 'archive' })
  ok(missingBoth && missingBoth.ok === false && missingBoth.code === 'VMU_INVALID_ARGUMENT',
    '#8: archive with neither source is refused by name', missingBoth && { code: missingBoth.code, message: missingBoth.message })
  const missingHint = (missingBoth && missingBoth.hint) || ''
  ok(missingHint.includes('name') && missingHint.includes('text') && missingHint.includes('id:'),
    '#8: the missing-both hint names BOTH reachable doors (name+text, or id:"<record>")', missingHint)
  ok((missingBoth && missingBoth.message || '').includes('name') && (missingBoth && missingBoth.message || '').includes('text'),
    '#8: the missing-both message says which fields are missing', missingBoth && missingBoth.message)

  const ghost = await call('vibe_v5_script', { op: 'archive', id: 'rec-999' })
  ok(ghost && ghost.ok === false && ghost.code === 'VMU_NO_SUCH_OBJECT',
    '#8: an id that names no record is refused (not archived as an empty script)', ghost && { code: ghost.code, message: ghost.message })
  ok(((ghost && ghost.hint) || '').includes('id:') && ((ghost && ghost.hint) || '').includes('text:'),
    '#8: the unknown-id hint also names both doors (a typo is not a dead end)', ghost && ghost.hint)

  // ── #9 the schema now declares what the face really accepts ────────────────────────────────────────────────────
  const meetingSpec = h.specOf('vibe_v5_meeting')
  const props = meetingSpec && meetingSpec.parameters && meetingSpec.parameters.properties
  ok(props && props.agenda && Object.keys(props.agenda).length > 0,
    '#9: the meeting host schema declares `agenda`', props && props.agenda)
  const agendaType = props && props.agenda && props.agenda.type
  ok(Array.isArray(agendaType) && agendaType.includes('string') && agendaType.includes('array'),
    '#9: the schema type is string | string[] (it used to claim string while the face accepted an array)', agendaType)
  ok(props && props.agenda && props.agenda.items && props.agenda.items.type === 'string',
    '#9: the array form declares its item type (every agenda item is text)', props && props.agenda && props.agenda.items)
  ok(props && props.agenda && typeof props.agenda.description === 'string' && props.agenda.description.includes('string | string[]'),
    '#9: the schema description says string | string[] out loud', props && props.agenda && props.agenda.description)

  // ── #9 the convene receipt reads the agenda back in BOTH shapes ────────────────────────────────────────────────
  const arrayAgenda = ['确认命题', '分配复核']
  const arr = await call('vibe_v5_meeting', { agenda: arrayAgenda, type: 'ordinary', member: 'r-acad' }, as('r-acad'))
  ok(arr && arr.ok === true, '#9: an ARRAY agenda convenes the meeting', arr && { code: arr.code, message: arr.message })
  eq(arr && arr.agenda, '确认命题; 分配复核', '#9: agenda is the normalized one line stored as materials')
  deepEq(arr && arr.agendaItems, arrayAgenda, '#9: agendaItems reads the array items back in order (not a split of the joined line)')
  eq(arr && arr.agendaSource, 'argument', '#9: agendaSource says the agenda came from the caller')
  eq(arr && arr.agendaItemsSource, 'argument-array', '#9: agendaItemsSource names the array door')
  ok(typeof (arr && arr.agendaItemsSourceMeans) === 'string' && arr.agendaItemsSourceMeans.length > 0,
    '#9: agendaItemsSourceMeans explains what the list is (and what it is not — the kernel agenda ledger)', arr && arr.agendaItemsSourceMeans)
  eq(leaks(arr).length, 0, '#9: the convene receipt leaks no JavaScript type name', leaks(arr))

  const line = await call('vibe_v5_meeting', { agenda: 'one purpose', type: 'ordinary', member: 'r-acad' }, as('r-acad'))
  ok(line && line.ok === true, '#9: a one-line agenda convenes the meeting', line && line.code)
  deepEq(line && line.agendaItems, ['one purpose'], '#9: a one-line agenda reads back as a single-item list')
  eq(line && line.agendaItemsSource, 'argument-line', '#9: agendaItemsSource names the one-line door')

  const jsonArray = await call('vibe_v5_meeting', { agenda: '["x", "y"]', type: 'ordinary', member: 'r-acad' }, as('r-acad'))
  ok(jsonArray && jsonArray.ok === true, '#9: a serialized JSON array agenda convenes the meeting', jsonArray && jsonArray.code)
  deepEq(jsonArray && jsonArray.agendaItems, ['x', 'y'], '#9: the JSON-array door keeps its items too')
  eq(jsonArray && jsonArray.agendaItemsSource, 'argument-json-array', '#9: agendaItemsSource names the JSON-array door')

  const none = await call('vibe_v5_meeting', { type: 'ordinary', member: 'r-acad' }, as('r-acad'))
  ok(none && none.ok === false && none.code === 'VMU_INVALID_ARGUMENT',
    '#9: convening with no agenda is still refused (the schema loosening did not make it optional)', none && { code: none.code, message: none.message })
  const blankArray = await call('vibe_v5_meeting', { agenda: ['  ', ''], type: 'ordinary', member: 'r-acad' }, as('r-acad'))
  ok(blankArray && blankArray.ok === false && blankArray.code === 'VMU_INVALID_ARGUMENT',
    '#9: an array of blank items is still refused (whitespace is not a purpose)', blankArray && { code: blankArray.code, message: blankArray.message })
} catch (e) {
  failed += 1
  failures.push({ name: 'threw', detail: String(e && e.stack || e) })
  console.log('  FAIL(threw): ' + String(e && e.stack || e))
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('=== vmu-run239-tools: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  for (const f of failures) console.log('  - ' + f.name)
  process.exitCode = 1
}
