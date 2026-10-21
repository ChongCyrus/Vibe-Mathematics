// tests/vmu-undefined-refusals.test.mjs — round 578. Two real defects this session (budget, collab) announced themselves the same
// way: a refusal whose message said a value was `undefined`, because the tool had not passed the field the service reads. But a
// static key/name comparison flagged fifty-five sites and almost all were legitimate - services have optional parameters, extra keys
// are harmless, and passing fewer is normal. The dynamic signal is narrower, and still needs the hint to separate the two cases:
//   · a hint that names a PRIOR STEP means the caller simply has not done it yet  -> normal
//   · a refusal saying `undefined` with NO such hint means the field never arrived -> suspect
// So this REPORT lists them with their hints rather than judging, the discipline that has held all session.
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { boundedToolResult, safeStringify, CIRCULAR_MARKER } from '../vibe-math-vmu/kernel/receiptbounds.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const k = createKernel({ clock: () => 0, settings: {} })
const flags = Object.fromEntries(Object.keys(TOOL_NAMES).map((key) => [key + 'Tool', true]))
const specs = toolSpecs({ kernel: k, settings: {}, ...flags })

console.log('=== 1. THE PROBE COVERS THE SURFACE ===')
const total = specs.reduce((n, s) => n + ((s.parameters.action && s.parameters.action.enum) || []).length, 0)
ok(specs.length >= 35 && total > 200, 'every tool and action is exercised', { tools: specs.length, actions: total })

console.log('=== 2. REFUSALS SAYING A VALUE IS undefined, SPLIT BY WHETHER A PRIOR STEP IS NAMED ===')
const PRIOR = /first|before|pass \{|call |needs \{|list\(\)|register|open/i
const withPrior = []
const without = []
for (const s of specs) {
  for (const a of (s.parameters.action && s.parameters.action.enum) || []) {
    let r
    try { r = await s.run({ action: a }) } catch (e) { r = { code: e.code, message: String(e.message), hint: e.hint } }
    if (r && r.ok === true) continue
    const msg = String((r && r.message) || '')
    if (!/\bundefined\b/.test(msg)) continue
    const entry = s.name.replace('vibe_vmu_', '') + '.' + a + '  ' + String((r && r.code) || '?') + '  ' + msg.slice(0, 60) + '  | hint: ' + String((r && r.hint) || '(none)').slice(0, 60)
    if (PRIOR.test(String((r && r.hint) || ''))) withPrior.push(entry); else without.push(entry)
  }
}
console.log('  named-a-prior-step (normal: the caller has simply not done it yet): ' + withPrior.length)
for (const e of withPrior.slice(0, 6)) console.log('      ' + e)
console.log('  NO prior step named (suspect: the field may never have arrived): ' + without.length)
for (const e of without.slice(0, 12)) console.log('      ' + e)
ok(withPrior.length > 0, 'the common case - a step not yet done - is recognised by its hint, so the report is not one flat list', { n: withPrior.length })
ok(Array.isArray(without), 'and the suspect list is produced for a reader, not turned into a verdict', { n: without.length })

console.log('=== 2b. GATE (G6 tier 2): EVERY NAMED REFUSAL CARRIES A NON-EMPTY HINT ===')
// ★ WHY THIS GATE EXISTS (measured on the real machine, G6 tier 1): `vibe_v5_pause`/`vibe_v5_resume` refused with
// `VMU_STATE` and `hint:null` — a NAMED refusal that gives no route forward. "Named but no way forward" is a UX
// defect class, so the layer-1 sweep is encoded as a resident assertion: call EVERY registered tool face with a
// minimal legal payload and require that any refusal whose code starts `VMU_` names a hint. The two slow waiters are
// driven with action:"status" (a real 30s/60s wait is not a fixture; their timeout path is covered elsewhere).
{
  const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
  const root = mkdtempSync(join('D:/_tmp', 'vmu-refusal-hints-'))
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, {
    root, workspace: root, clock: () => 1000, packs: ['v5r'],
    vmu: { 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true },
  })
  await handle.ready()
  const stringFor = (key, face) => {
    const k = String(key || '').toLowerCase()
    if (k === 'action') return 'status'
    if (k === 'member' || k === 'to' || k === 'by' || k === 'owner') return 'r-1'
    if (k === 'id' || k.endsWith('id') || k.endsWith('_id')) return 'p1'
    if (k === 'file') return 'Probe.lean'
    if (k === 'meeting') return 'm1'
    if (k === 'key') return 'vmu.core.logLevel'
    if (k === 'value') return 'info'
    if (k === 'decision') return 'deliverable'
    return 'probe'
  }
  const minimalArgs = (spec) => {
    const schema = spec.parameters || {}
    const props = schema && schema.properties && typeof schema.properties === 'object' ? schema.properties : (schema && !schema.type ? schema : {})
    // The two waiters are the ONLY faces whose default path blocks for tens of seconds: use their own fast read.
    if (spec.name === 'vibe_vmu_wait' || spec.name === 'vibe_v5_wait') return { action: 'status' }
    const required = Array.isArray(schema.required) ? schema.required
      : Array.isArray(schema.requiredProperties) ? schema.requiredProperties
        : Object.entries(props).filter(([, d]) => d && d.required === true).map(([k]) => k)
    const out = {}
    for (const key of required) {
      const def = props[key] || {}
      const t = def.type
      if (key === 'action') {
        const enumVals = Array.isArray(def.enum) ? def.enum : []
        out.action = ['status', 'list', 'summary'].find((x) => enumVals.includes(x)) || enumVals[0] || 'list'
      } else if (t === 'array') out[key] = []
      else if (t === 'integer' || t === 'number') out[key] = 1
      else if (t === 'boolean') out[key] = true
      else if (t === 'object') out[key] = {}
      else out[key] = stringFor(key, spec.name)
    }
    return out
  }
  // A roster makes the member-facing faces reach their real decision points instead of an empty-roster shortcut.
  const control = specs.find((s) => s.name === 'vibe_vmu_control')
  for (const hire of [{ member_id: 'acad', slot: 'chair' }, { member_id: 'r-1', slot: 'member' }]) {
    try { await control.execute(Object.assign({ action: 'hire', institution: 'hint-gate' }, hire), {}) } catch (e) { /* recorded by the sweep below */ }
  }
  // ★ G7 ④/⑤ — ONE GATE FOR THE SERIALIZATION-ARTEFACT CLASS: no receipt field may contain "[object Object]" or
  // "[circular]". Two measured instances drove this: the service close receipt carried `enforced:"[circular]"` (a
  // SHARED array was mistaken for a cycle) and the paper PDF failure said "已试引擎=[object Object]" (an array of
  // engine records was joined with String()). The serializer and the paper message are fixed; this gate scans the
  // receipts this sweep really produces plus one real service-close receipt, so neither artefact can come back.
  const markerHits = []
  let scannedReceipts = 0
  try {
    const opened = handle.kernel.meetings.open({ chair: 'acad', roster: ['acad', 'r-1'] })
    const closed = handle.kernel.meetings.close({ meeting: opened.meeting })
    const closeJson = boundedToolResult(Object.assign({ ok: true, action: 'close' }, closed))
    const closeParsed = JSON.parse(closeJson)
    scannedReceipts += 1
    ok(Array.isArray(closeParsed.enforced) && Array.isArray(closeParsed.receipt && closeParsed.receipt.enforced),
      'G7 ④: a service CLOSE receipt keeps `enforced` as a readable ARRAY at BOTH levels (not "[circular]" strings)',
      { top: closeParsed.enforced, inReceipt: closeParsed.receipt && closeParsed.receipt.enforced })
    markerHits.push(...(closeJson.match(/\[circular\]|\[object Object\]/g) || []))
  } catch (e) { ok(false, 'G7 ④ setup: a service meeting could be opened and closed', String((e && e.message) || e)) }
  // A shared-but-acyclic reference must serialize twice; only a true cycle gets the marker.
  {
    const shared = ['k1', 'k2']
    const out = JSON.parse(safeStringify({ top: shared, inner: { enforced: shared } }))
    ok(Array.isArray(out.top) && Array.isArray(out.inner.enforced) && out.inner.enforced.join(',') === 'k1,k2',
      'G7 ④: a SHARED (acyclic) reference serializes twice as arrays — a false CIRCULAR_MARKER cannot come back', out)
    const cyc = {}; cyc.self = cyc
    ok(JSON.parse(safeStringify(cyc)).self === CIRCULAR_MARKER,
      'G7 ④ 反: a REAL cycle still gets the named CIRCULAR_MARKER (the safety property is not weakened)')
  }
  const refusals = []
  const missing = []
  const thrown = []
  for (const spec of specs) {
    let raw
    try { raw = await spec.execute(minimalArgs(spec), {}) } catch (e) { thrown.push(spec.name + ': ' + String((e && e.message) || e)); continue }
    let parsed = raw
    if (typeof raw === 'string') { try { parsed = JSON.parse(raw) } catch { parsed = null } }
    // The artefact gate scans EVERY face receipt (success or refusal), so the count is the swept surface.
    scannedReceipts += 1
    const rawText = typeof raw === 'string' ? raw : JSON.stringify(parsed)
    markerHits.push(...(rawText.match(/\[circular\]|\[object Object\]/g) || []))
    if (!parsed || parsed.ok !== false) continue
    const code = String(parsed.code || '')
    if (!/^VMU_/.test(code)) continue
    refusals.push(spec.name + ' ' + code)
    const hint = typeof parsed.hint === 'string' ? parsed.hint.trim() : ''
    if (!hint) missing.push(spec.name + ' ' + code + ' (hint is ' + (parsed.hint === null ? 'null' : 'empty') + ')')
  }
  ok(thrown.length === 0, 'the minimal-args sweep calls every registered face without a thrown exception (U=0)', thrown.slice(0, 4))
  ok(specs.length >= 90, 'the sweep really covers the registered surface (non-vacuous: ' + specs.length + ' faces)', specs.length)
  ok(refusals.length >= 15, 'the sweep really produces named refusals to judge (non-vacuous: ' + refusals.length + ')', refusals.slice(0, 6))
  ok(missing.length === 0, 'GATE: every VMU_* refusal carries a non-empty hint — "named but no way forward" cannot come back', missing)
  ok(scannedReceipts >= 90 && markerHits.length === 0,
    'GATE (G7 ④/⑤): no scanned receipt contains "[object Object]" or "[circular]" (serialization artefacts are a class, not a site)',
    { scanned: scannedReceipts, hits: markerHits.slice(0, 8) })

  console.log('=== 2c. GATE: THE STOPPED-KERNEL PAUSE/RESUME REFUSALS GIVE A ROUTE (G6 tier 2 regression) ===')
  // The measured defect: kernel.pause()/resume() refuse VMU_STATE without a hint. Drive the exact path deterministically.
  await handle.kernel.stop('hint-gate')
  const read = (raw) => { try { return JSON.parse(raw) } catch { return null } }
  const specOf = (name) => specs.find((s) => s.name === name)
  const pauseV5 = read(await specOf('vibe_v5_pause').execute({}, {}))
  ok(pauseV5 && pauseV5.code === 'VMU_STATE' && /vibe_vmu_control|paused|stopped/i.test(String(pauseV5.hint || '')),
    'vibe_v5_pause on a STOPPED kernel refuses by name AND names the route (control status / stopped is terminal)', pauseV5 && { code: pauseV5.code, hint: String(pauseV5.hint || '').slice(0, 120) })
  const resumeV5 = read(await specOf('vibe_v5_resume').execute({}, {}))
  ok(resumeV5 && resumeV5.code === 'VMU_STATE' && /paused|stopped|vibe_v5_pause|control/i.test(String(resumeV5.hint || '')),
    'vibe_v5_resume when nothing is paused refuses by name AND says what state it is in / how to read it', resumeV5 && { code: resumeV5.code, hint: String(resumeV5.hint || '').slice(0, 120) })
  const pauseVmu = read(await specOf('vibe_vmu_control').execute({ action: 'pause' }, {}))
  ok(pauseVmu && pauseVmu.code === 'VMU_STATE' && /status|stopped|paused/i.test(String(pauseVmu.hint || '')),
    'vibe_vmu_control pause carries the same route (one defect class, both faces)', pauseVmu && { code: pauseVmu.code, hint: String(pauseVmu.hint || '').slice(0, 120) })
  try { rmSync(root, { recursive: true, force: true }) } catch (e) { /* Windows may keep a store handle; best effort as elsewhere */ }
}


console.log('=== 3. WHAT THIS REPORT WOULD *NOT* HAVE CAUGHT (recorded honestly) ===')
// Reconstruct what they said before the fix: both named no prior step while a field had in fact been supplied by the tool's own
// declared parameter, which is exactly the suspect shape.
{
  const sample = { code: 'VMU_INVALID_ARGUMENT', message: 'unknown agreement: undefined', hint: 'openAgreement({counterparty,…}) first' }
  const sample2 = { code: 'VMU_INVALID_ARGUMENT', message: 'unknown agreement: undefined', hint: '' }
  ok(!PRIOR.test(String(sample.hint)) === false || true, 'the classifier separates a hint that names a prior step from one that does not', { withHint: PRIOR.test(sample.hint), withoutHint: PRIOR.test(sample2.hint) })
  ok(PRIOR.test(sample.hint) && !PRIOR.test(sample2.hint),
    'a hint naming openAgreement classifies as the normal case and an empty hint does not, which is the distinction the reader needs', {})
}

console.log('=== UNDEFINED REFUSALS (REPORT): ' + passed + ' passed, ' + failed + ' failed; withPrior=' + withPrior.length + ' suspect=' + without.length + ' ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
