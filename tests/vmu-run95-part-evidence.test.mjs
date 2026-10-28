#!/usr/bin/env node
// RUN 95 findings — two readback truths measured on the clean-room machine at build b80aad76:
//
// F-95a  `vibe_v5_paper { action: "part" }` accepted `evidence: ["Members/r-1/Propos/p-95.md"]` UNCONDITIONALLY
//        (ok:true, and the receipt did not even mention evidence). The first time that pointer was ever resolved was
//        the quality gate on `render` — after the paper had been written, cross-reviewed, consulted and finalised.
//        The member reported exactly that cost. Every pointer is now resolved WHEN THE PART IS WRITTEN: an unknown
//        record or a wrong track is refused BY NAME, and the receipt says which pointers were checked.
// F-95b  `render` answered `wrote: ["md","tex","meta"]` while `Paper/<id>/` held only the .tex — because `wrote` is
//        the RECORD kinds written into the paper track, not files. The receipt now carries `wroteWhere {records,disk,means}`.
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r95-')); roots.push(d); return d }

const store = (() => { // kernel records read used by the assertions (records.put writes into the store)
  return {}
})()

// ── §1 F-95a: a pointer that names no record is refused AT THE PART, not at render ────────────────────────────
{
  console.log('§1 F-95a — a fabricated evidence pointer is refused when the part is written')
  const root = await mkRoot()
  const b = await boot({ root })
  const ctx = { kernel: b.handle.kernel }
  await call(b, 'vibe_v5_start', { problem: 'r95', researcherCount: 1, academician: true }, ctx)
  const started = await call(b, 'vibe_v5_paper', { action: 'start', title: 'T95', participants: ['r-1'], member: 'r-acad' }, ctx)
  ok(started.parsed && started.parsed.ok === true, 'the paper starts', started)

  const before = ctx.kernel.records.list({ limit: 0 })
  const beforeCount = (before && Array.isArray(before.items) ? before.items.length : 0)
  const r = await call(b, 'vibe_v5_paper',
    { action: 'part', target: 'T95', part: '一', body: 'b', evidence: ['Members/r-1/Propos/p-fabricated.md'], member: 'r-1' }, ctx)
  const refused = r.thrown === true ? r : (r.parsed && r.parsed.ok === false ? r.parsed : null)
  ok(refused !== null && refused.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING',
    'the refusal is BY NAME (VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING)', r)
  ok(String(refused && refused.message).includes('p-fabricated') && String(refused && refused.message).includes('no-such-record'),
    'the message names the pointer and the reason', refused && refused.message)
  ok(String(refused && refused.hint).includes('write the record first'),
    'the hint names the way out (write the record first)', refused && refused.hint)

  // NOTHING was recorded: the part is absent, so the chain did not advance on a lie.
  const status = await call(b, 'vibe_v5_paper', { action: 'status', target: 'T95' }, ctx)
  const parts = status.parsed && status.parsed.paper && status.parsed.paper.parts
  ok(!parts || Object.keys(parts).length === 0, 'the refused part was NOT recorded', parts)
  const after = ctx.kernel.records.list({ limit: 0 })
  const afterCount = (after && Array.isArray(after.items) ? after.items.length : 0)
  ok(afterCount === beforeCount, 'no record was written by the refused part (the flow did not advance on a lie)',
    { beforeCount, afterCount })
}

// ── §2 F-95a: a pointer on the WRONG TRACK is refused, and the reason says which track was expected ───────────
{
  console.log('§2 F-95a — a real record cited on the wrong track is refused, and the reason names the track')
  const root = await mkRoot()
  const b = await boot({ root })
  const ctx = { kernel: b.handle.kernel }
  await call(b, 'vibe_v5_start', { problem: 'r95', researcherCount: 1, academician: true }, ctx)
  await call(b, 'vibe_v5_paper', { action: 'start', title: 'T95b', participants: ['r-1'], member: 'r-acad' }, ctx)
  const prop = await call(b, 'vibe_v5_record_proposition',
    { member: 'r-1', statement: '命题', p: 0.5, value: 1, motive: 'F-95a 需要一条真实记录' }, ctx)
  const recordId = (prop.parsed && (prop.parsed.recordId || prop.parsed.id || (prop.parsed.record && prop.parsed.record.id))) || null
  ok(typeof recordId === 'string' && recordId !== '', 'a real proposition record exists', prop.parsed)

  const wrong = await call(b, 'vibe_v5_paper',
    { action: 'part', target: 'T95b', part: '一', body: 'b', evidence: ['Members/r-1/Methods/' + recordId + '.md'], member: 'r-1' }, ctx)
  const refused = wrong.thrown === true ? wrong : (wrong.parsed && wrong.parsed.ok === false ? wrong.parsed : null)
  ok(refused !== null && refused.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING', 'wrong track is refused', wrong)
  ok(String(refused && refused.message).includes('wrong-track') && String(refused && refused.message).includes('expected track methods'),
    'the reason is wrong-track and it names the track the path claimed', refused && refused.message)

  const right = await call(b, 'vibe_v5_paper',
    { action: 'part', target: 'T95b', part: '一', body: 'b', evidence: ['Members/r-1/Propos/' + recordId + '.md'], member: 'r-1' }, ctx)
  ok(right.parsed && right.parsed.ok === true, 'the same pointer on the right track is accepted', right)
  ok(right.parsed && right.parsed.evidence && right.parsed.evidence.checked === true &&
    Array.isArray(right.parsed.evidence.resolved) && right.parsed.evidence.resolved.includes(recordId),
    'the receipt says the pointers were CHECKED and names the resolved record', right.parsed && right.parsed.evidence)
  ok(right.parsed && typeof right.parsed.evidence.means === 'string' && right.parsed.evidence.means.includes('refused HERE'),
    'the means says the check happens here rather than at render', right.parsed && right.parsed.evidence && right.parsed.evidence.means)
}

// ── §3 F-95a: no evidence is still accepted (the gate owns ">=1 per part"), and the receipt is not silent ──────
{
  console.log('§3 F-95a — a part without evidence is accepted, and the receipt reports provided:0')
  const root = await mkRoot()
  const b = await boot({ root })
  const ctx = { kernel: b.handle.kernel }
  await call(b, 'vibe_v5_start', { problem: 'r95', researcherCount: 1, academician: true }, ctx)
  await call(b, 'vibe_v5_paper', { action: 'start', title: 'T95c', participants: ['r-1'], member: 'r-acad' }, ctx)
  const r = await call(b, 'vibe_v5_paper', { action: 'part', target: 'T95c', part: '一', body: 'b', member: 'r-1' }, ctx)
  ok(r.parsed && r.parsed.ok === true, 'a part with no evidence is written (drafts render freely)', r)
  ok(r.parsed && r.parsed.evidence && r.parsed.evidence.provided === 0 && r.parsed.evidence.checked === true,
    'the receipt still says the evidence list was checked and was empty', r.parsed && r.parsed.evidence)
}

// ── §4 F-95b: `wrote` is record kinds; the receipt says where they land ──────────────────────────────────────
{
  console.log('§4 F-95b — render says WHERE it wrote: records, not files')
  const root = await mkRoot()
  const b = await boot({ root })
  const ctx = { kernel: b.handle.kernel }
  await call(b, 'vibe_v5_start', { problem: 'r95', researcherCount: 1, academician: true }, ctx)
  await call(b, 'vibe_v5_paper', { action: 'start', title: 'T95d', participants: ['r-1'], member: 'r-acad' }, ctx)
  await call(b, 'vibe_v5_paper', { action: 'part', target: 'T95d', part: '一', body: 'b', member: 'r-1' }, ctx)
  const r = await call(b, 'vibe_v5_paper', { action: 'render', target: 'T95d', format: 'md', member: 'r-acad' }, ctx)
  const p = r.parsed || {}
  ok(Array.isArray(p.wrote) && p.wrote.includes('md'), 'wrote lists the md record kind', p.wrote)
  ok(p.wroteWhere && Array.isArray(p.wroteWhere.records) && p.wroteWhere.records.join(',') === p.wrote.join(','),
    'wroteWhere.records mirrors wrote', p.wroteWhere)
  ok(p.wroteWhere && Array.isArray(p.wroteWhere.disk) && p.wroteWhere.disk.length === 0,
    'wroteWhere.disk is empty (render writes no file)', p.wroteWhere)
  ok(p.wroteWhere && String(p.wroteWhere.means).includes('compile'),
    'the means names compile as the step that puts .tex on disk', p.wroteWhere && p.wroteWhere.means)
}

// ── §5 source contract: the fail-fast lives at the part and the resolver is exported once ───────────────────
{
  console.log('§5 source contract')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const quality = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')
  const prompts = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-paper-prompts.js'), 'utf8')
  const docs = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md'), 'utf8')
  ok(tools.includes("const pointers = typeof paper.evidencePointers === 'function'"),
    'the part resolves pointers through the pack facade (no second resolver in the tool face)')
  ok(quality.includes('export function checkEvidencePointers('),
    'the resolver is exported from paper-quality.js (one implementation)')
  ok(prompts.includes('证据指针在你写 `part` 的那一刻就被核对'),
    'the prompts teach the fail-fast moment')
  ok(docs.includes('★ R95'), 'docs/03 registers the R95 shape')
}

for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 5 })
console.log('=== VMU RUN95 PART EVIDENCE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
