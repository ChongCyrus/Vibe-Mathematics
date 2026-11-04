#!/usr/bin/env node
/**
 * tests/vmu-run229-serialisation.test.mjs — RUN 229: a STRUCTURE must be described by its SHAPE, never by its type name.
 *
 * WHY (measured with the real kernel, not argued): two faces accepted a structured value and answered with a JavaScript
 * type name — `[object Object]` — which is a lie a reader cannot act on:
 *   ① `vibe_vmu_panel {action:"set"}` with `plan:[{id:1,why:"…"}]` returned `ok:true` and the panel read back
 *      `plan:["[object Object]"]`: the structure went IN and a type name came OUT, in an append-only history.
 *   ② `vibe_v5_paper {action:"part"}` with an object inside `evidence` refused with a message whose pointer was
 *      `"[object Object]"` (and `missing["[object Object]"]`): the diagnosis was the value's TYPE, not what arrived.
 *
 * WHAT THIS PROVES (each assertion is paired with its premise):
 *  §1 a TEXT write still round-trips faithfully (the fix must not refuse legal writes);
 *  §2 a structured value in a text field is REFUSED BY NAME, with the shape it received (`typeof`, key/item count, JSON
 *     excerpt for a small value) — and NOTHING is written: the panel reads back its previous value;
 *  §3 the paper's evidence refusal does the same for a structure in `evidence` (`an object … with 2 keys [id, why]`,
 *     `an array … of 2 items`) and the pure resolver reports `not-a-string`;
 *  §4 no receipt field (key or nested string) produced by this session contains `[object Object]` or `undefined` — the
 *     same rule audit A2 applies to a corpus, applied here to the live receipts.
 *
 * Run: node tests/vmu-run229-serialisation.test.mjs   (targeted only — never the full T1 suite)
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const VMU = join(REPO, 'vibe-math-vmu')
const HARNESS = (await import(pathToFileURL(join(REPO, 'scripts/sim', 'harness.mjs')).href))
const PAPER_QUALITY = (await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'paper-quality.js')).href))

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 400))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 400))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 300) : text)
const hasNot = (text, needle, name) => ok(typeof text === 'string' && !text.includes(needle), name, typeof text === 'string' ? text.slice(0, 300) : text)

/** Same walker audit A2 uses: every string (keys included) must be free of serialisation leaks. */
const LEAKS = ['[object Object]', 'undefined']
function leaks(value, path = '$', out = []) {
  if (typeof value === 'string') {
    for (const bad of LEAKS) if (value.includes(bad)) out.push({ path, bad, sample: value.slice(0, 160) })
  } else if (Array.isArray(value)) value.forEach((v, i) => leaks(v, path + '[' + i + ']', out))
  else if (value && typeof value === 'object') for (const k of Object.keys(value)) leaks(value[k], path + '.' + k, out)
  return out
}

/* ── the REAL kernel + v5r pack, booted exactly as the simulator boots it ─────────────────────────────────── */
const TMP = join(tmpdir(), 'vmu-run229-serialisation')
mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'ws-'))
const h = await HARNESS.boot({ root })
const as = (id) => ({ as: { agent: { id } } })
const looked = []
const call = async (name, args, asOpt) => {
  const receipt = await h.call(name, args, asOpt || {})
  looked.push({ tool: name, receipt })
  return receipt
}

console.log('\n=== 0. premise: the institute and the roster both faces address exist ===')
const started = await call('vibe_v5_start', { problem: '前 n 个奇数之和等于 n 的平方（占位题：本测试只压序列化面）。', researcherCount: 2 })
ok(started && started.ok !== false, 'the institute starts (the panel/paper faces have a roster to name)', started)
const claim = await call('vibe_v5_record_proposition', {
  statement: '前 n 个奇数之和 = n^2', value: '对任意正整数 n 成立', p: 0.6, motive: '本测试的证据记录', member: 'r-1',
}, as('r-1'))
const EVIDENCE_ID = claim && (claim.recordId || claim.id)
ok(typeof EVIDENCE_ID === 'string' && EVIDENCE_ID !== '', 'a proposition record exists to cite (the legal evidence pointer)', claim && claim.code)

console.log('\n=== 1. a TEXT panel write still round-trips faithfully (the fix refuses shapes, not writes) ===')
const written = await call('vibe_vmu_panel', {
  action: 'set', member: 'r-1', overall: '把 RUN 229 的序列化面修净',
  plan: ['先读审计语料', '再修面板与论文面'],
  subtasks: [{ title: '读语料', state: 'done' }, { title: '改面', state: 'running' }],
})
ok(written && written.ok === true, 'a legal text write is accepted', written && written.code)
ok(written && Array.isArray(written.fields && written.fields.plan) && written.fields.plan.length === 2 && written.fields.plan[1] === '再修面板与论文面',
  'plan entries round-trip as the exact strings that were written', written && written.fields && written.fields.plan)
ok(written && Array.isArray(written.subtasks) && written.subtasks[0] && written.subtasks[0].title === '读语料',
  'subtask objects are still accepted as {title,state}', written && written.subtasks)
const readBack = await call('vibe_vmu_panel', { action: 'get', member: 'r-1' })
ok(readBack && readBack.ok === true && Array.isArray(readBack.plan) && readBack.plan[0] === '先读审计语料',
  'the panel reads the same text back (one account, not two)', readBack && readBack.plan)

console.log('\n=== 2. a STRUCTURE in a text field is refused BY NAME, with its shape — and nothing is stored ===')
const shapedPlan = await call('vibe_vmu_panel', { action: 'set', member: 'r-1', plan: [{ id: 1, why: '先读记录再写证明' }] })
ok(shapedPlan && shapedPlan.ok === false && shapedPlan.code === 'VMU_INVALID_ARGUMENT',
  'plan:[{id,why}] is refused VMU_INVALID_ARGUMENT (not stored, not flattened)', shapedPlan && { ok: shapedPlan.ok, code: shapedPlan.code })
has(shapedPlan && shapedPlan.message, 'plan[0]', 'the message NAMES the field and the index the structure arrived at')
has(shapedPlan && shapedPlan.message, 'typeof', 'the message names the typeof it received')
has(shapedPlan && shapedPlan.message, 'object', 'the message says the value is an object (not a type name in a mask)')
has(shapedPlan && shapedPlan.message, 'id', 'the message names a key of the structure it received')
has(shapedPlan && shapedPlan.message, 'why', 'the message names the second key of the structure it received')
hasNot(shapedPlan && shapedPlan.message, '[object Object]', 'the refusal does not print [object Object]')
ok(shapedPlan && typeof shapedPlan.hint === 'string' && shapedPlan.hint.includes('string'),
  'the refusal carries an actionable hint (send a string)', shapedPlan && shapedPlan.hint)
const afterShape = await call('vibe_vmu_panel', { action: 'get', member: 'r-1' })
ok(afterShape && Array.isArray(afterShape.plan) && afterShape.plan[0] === '先读审计语料',
  'the refused write wrote NOTHING: the panel still reads the previous plan', afterShape && afterShape.plan)

const shapedScalar = await call('vibe_vmu_panel', { action: 'set', member: 'r-1', status: { phase: 'drafting' } })
ok(shapedScalar && shapedScalar.ok === false && shapedScalar.code === 'VMU_INVALID_ARGUMENT',
  'a structured status is refused by name (the scalar fields are text too)', shapedScalar && shapedScalar.code)
has(shapedScalar && shapedScalar.message, 'phase', 'the scalar refusal names the key of the structure that arrived')
has(shapedScalar && shapedScalar.message, 'typeof', 'the scalar refusal names the typeof')

const shapedSubtask = await call('vibe_vmu_panel', { action: 'set', member: 'r-1', subtasks: [{ title: { text: '读第三节' } }] })
ok(shapedSubtask && shapedSubtask.ok === false && shapedSubtask.code === 'VMU_INVALID_ARGUMENT',
  'a sub-task whose TITLE is a structure is refused by name', shapedSubtask && shapedSubtask.code)
has(shapedSubtask && shapedSubtask.message, 'subtasks[0].title', 'the refusal names the nested field it refused')

const shapedMember = await call('vibe_vmu_panel', { action: 'set', member: { id: 'r-1' }, overall: '用对象当成员 id' })
ok(shapedMember && shapedMember.ok === false && shapedMember.code === 'VMU_INVALID_ARGUMENT',
  'an object as `member` is refused by name (an id is text)', shapedMember && shapedMember.code)
has(shapedMember && shapedMember.message, 'typeof', 'the member refusal names the typeof it received')

const afterAll = await call('vibe_vmu_panel', { action: 'get', member: 'r-1' })
ok(afterAll && afterAll.overall === '把 RUN 229 的序列化面修净' && afterAll.status === '',
  'no refused shape reached the panel: overall/status are exactly what a legal write left', afterAll && { overall: afterAll.overall, status: afterAll.status })

console.log('\n=== 3. the PAPER evidence refusal describes the shape instead of printing a type name ===')
const paperStart = await call('vibe_v5_paper', { action: 'start', target: 'run229-paper', title: 'RUN 229 探针论文', participants: ['r-1', 'r-2'] })
ok(paperStart && paperStart.ok !== false, 'premise: a paper with two participants starts', paperStart && paperStart.code)
const legalPart = await call('vibe_v5_paper', {
  action: 'part', target: 'run229-paper', part: 'theorem', member: 'r-1',
  body: '命题：对任意正整数 $n$，前 $n$ 个奇数之和等于 $n^2$。', evidence: [EVIDENCE_ID],
}, as('r-1'))
ok(legalPart && legalPart.ok === true && legalPart.evidence && legalPart.evidence.provided === 1,
  'a STRING evidence pointer still resolves (the fix refuses structures, not pointers)', legalPart && legalPart.code)

const shapedEvidence = await call('vibe_v5_paper', {
  action: 'part', target: 'run229-paper', part: 'proof', member: 'r-1',
  body: '证明：归纳步 $S_{n+1}=S_n+2n+1=n^2+2n+1=(n+1)^2$。',
  evidence: [EVIDENCE_ID, { id: 1, why: '这是对象而不是指针' }],
}, as('r-1'))
ok(shapedEvidence && shapedEvidence.ok === false && shapedEvidence.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING',
  'an object inside evidence is refused by the same named code', shapedEvidence && shapedEvidence.code)
has(shapedEvidence && shapedEvidence.message, 'not-a-string', 'the refusal names the reason: the entry is not a string')
has(shapedEvidence && shapedEvidence.message, 'typeof', 'the paper refusal names the typeof of the entry it received')
has(shapedEvidence && shapedEvidence.message, 'object', 'the paper refusal describes the entry as an object')
has(shapedEvidence && shapedEvidence.message, '"why"', 'the paper refusal carries a JSON excerpt of the small structure')
hasNot(shapedEvidence && shapedEvidence.message, '[object Object]', 'the paper refusal does not print [object Object]')
ok(shapedEvidence && Array.isArray(shapedEvidence.missing) && shapedEvidence.missing.length === 1 && String(shapedEvidence.missing[0]).includes('object'),
  'the `missing` list carries the DESCRIPTION, not a type name', shapedEvidence && shapedEvidence.missing)

const shapedArray = await call('vibe_v5_paper', {
  action: 'part', target: 'run229-paper', part: 'methods', member: 'r-2',
  body: '方法说明占位。', evidence: [['rec-1', 'rec-2']],
}, as('r-2'))
ok(shapedArray && shapedArray.ok === false && shapedArray.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING',
  'an array inside evidence is refused by name', shapedArray && shapedArray.code)
has(shapedArray && shapedArray.message, 'an array', 'the refusal describes the entry as an array')
has(shapedArray && shapedArray.message, 'items', 'the refusal states how many items arrived')
hasNot(shapedArray && shapedArray.message, 'rec-1,rec-2', 'the array was not silently comma-joined into a pretend pointer')

const records = h.kernel && h.kernel.records ? h.kernel.records : null
const view = records && typeof records.list === 'function' ? { records } : null
if (view) {
  const verdict = PAPER_QUALITY.checkEvidencePointers({ evidence: [EVIDENCE_ID, { id: 1 }], records: view.records })
  ok(verdict && verdict.ok === false && verdict.unknown.length === 1 && verdict.unknown[0].reason === 'not-a-string',
    'the PURE resolver reports the non-string entry as `not-a-string`', verdict && verdict.unknown)
  ok(verdict && verdict.unknown[0] && typeof verdict.unknown[0].pointer === 'string' && verdict.unknown[0].pointer.includes('object') && !verdict.unknown[0].pointer.includes('[object Object]'),
    'the pure resolver returns a shape description, not a type name', verdict && verdict.unknown[0] && verdict.unknown[0].pointer)
  ok(verdict && verdict.provided === 2, 'provided counts the text entry and the described one (both were judged)', verdict && verdict.provided)
} else {
  ok(false, 'premise: the kernel exposes a records face for the pure resolver', records === null ? 'no kernel.records' : 'no records.list')
}

console.log('\n=== 4. no receipt produced by this session carries a serialisation leak ===')
const allLeaks = []
for (const row of looked) {
  const found = leaks(row.receipt, '$')
  for (const f of found) allLeaks.push({ tool: row.tool, ...f })
}
ok(allLeaks.length === 0, 'no receipt field (key or nested string) contains [object Object] or undefined', allLeaks.slice(0, 6))

// ── §5 the KERNEL face refuses it too (the tool face was not the only writer) ──────────────────────────────
// WHY: `vibe_v5_turn`'s panel write is not the only caller of `kernel.panel.set`. The coercion lived IN the kernel
// (`String(raw)` for each field, `patch[k].map(String)` for plan), so a direct kernel caller — another pack, a
// script, the office — could still put a JavaScript type name into an append-only row. Guarding only the tool face
// would have left the lying write reachable one layer down.
console.log('\n=== 5. the kernel panel refuses a structure by name, and still writes text ===')
const kernelPanel = h.kernel && h.kernel.panel ? h.kernel.panel : null
ok(kernelPanel !== null && typeof kernelPanel.set === 'function', 'premise: the kernel exposes panel.set',
  kernelPanel === null ? 'no kernel.panel' : typeof kernelPanel.set)
let kernelRefused = null
try {
  await kernelPanel.set('r-1', { plan: [{ id: 1, why: '先读记录再写证明' }] }, { by: 'r-1' })
} catch (e) {
  kernelRefused = e
}
ok(kernelRefused !== null && kernelRefused.code === 'VMU_INVALID_ARGUMENT',
  'kernel.panel.set refuses a structured plan entry by code', kernelRefused && kernelRefused.code)
ok(kernelRefused !== null && typeof kernelRefused.message === 'string' && kernelRefused.message.includes('an object')
  && kernelRefused.message.includes('[id, why]') && !kernelRefused.message.includes('[object Object]'),
  'the kernel refusal names the SHAPE it received (keys included), not the type name', kernelRefused && kernelRefused.message)
const afterKernelRefusal = await kernelPanel.get('r-1')
ok(afterKernelRefusal && Array.isArray(afterKernelRefusal.plan) && afterKernelRefusal.plan.length > 0
  && afterKernelRefusal.plan.every((x) => typeof x === 'string'),
  'the refused kernel write wrote no structure (every remaining plan entry is still text)', afterKernelRefusal && afterKernelRefusal.plan)
const kernelText = await kernelPanel.set('r-1', { plan: ['先读记录', '再写证明'], status: 'working' }, { by: 'r-1' })
ok(kernelText && kernelText.ok === true, 'a TEXT plan through the kernel still writes', kernelText && kernelText.ok)
const afterKernelText = await kernelPanel.get('r-1')
ok(afterKernelText && JSON.stringify(afterKernelText.plan) === JSON.stringify(['先读记录', '再写证明']),
  'the text plan round-trips exactly', afterKernelText && afterKernelText.plan)

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.log('failures:\n  - ' + failures.join('\n  - ')); process.exit(1) }
