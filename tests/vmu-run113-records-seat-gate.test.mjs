// tests/vmu-run113-records-seat-gate.test.mjs — RUN 113, measured on a real machine: a temp worker wrote a
// proposition through the GENERIC records face while its own pack tool was hidden from that seat.
//
// The machine said it plainly. `vibe_v5_record_proposition` was `hidden` for `r-t1` (`reason:"turn"`,
// `source:"turn-override"`), and `r-t1` called the host's generic recorder instead —
// `vibe_vmu_records { action: "append", kind: "proposition" }` — and the row LANDED. A seat face that closes only
// the tool named after the act is not a seat face: the same act under another name must meet the SAME predicate,
// and the refusal must say which face refused it.
//
// This suite boots the real plugin (real kernel, real pack, real seat gate), so nothing below is a stub opinion:
//  1. the temp seat cannot write a proposition through the generic face, and no row lands;
//  2. a member whose seat allows it writes normally, and the receipt admits a seat gate let it through;
//  3. the office/root path is not governed by a member face (no member seat on the call);
//  4. a library the pack does not publish is not invented into a gate.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r113-')); roots.push(d); return d }
const root = await mkRoot()

const specs = []
const ctx = {
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
await handle.ready()
const specOf = (n) => specs.find((s) => s.name === n)
const call = async (name, args = {}, execCtx = {}) => {
  const spec = specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, execCtx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return JSON.parse(raw) } catch { return { raw } }
}

console.log('=== 0. A REAL INSTITUTE WITH A REAL TEMP WORKER ===')
{
  const s = await call('vibe_v5_start', { problem: '席位与通用面', researcherCount: 1 }, { kernel: handle.kernel })
  ok(s && s.ok !== false, 'the institute starts', s)
  const r = await call('vibe_v5_hire', { purpose: 'probe', initial_task: 'write a proposition', to: 'r-t1' }, { kernel: handle.kernel })
  ok(r && r.ok !== false && String(r.slotRequested) === 'temp', 'a temp worker exists (r-t1 in the temp seat)', r)
  const roster = handle.kernel.members.roster()
  const tempRow = roster.find((row) => row.id === 'r-t1')
  ok(!!tempRow && tempRow.slot === 'temp', 'the roster records r-t1 in the temp slot', tempRow)
}

const propositionsNow = async () => {
  const r = await call('vibe_v5_read_library', { kind: 'proposition', list: true }, { kernel: handle.kernel })
  const rows = r && (r.rows || r.items || r.cards || [])
  return Array.isArray(rows) ? rows.length : null
}

console.log('=== 1. THE TEMP SEAT S WRITE THROUGH THE GENERIC FACE IS REFUSED BY THE SEAT GATE ===')
{
  const before = await propositionsNow()
  const r = await call('vibe_vmu_records', { action: 'append', kind: 'proposition', statement: 'P-113', proof: 'because' }, { kernel: handle.kernel, agent: { id: 'r-t1' } })
  ok(r && r.ok === false, 'the temp worker s append through the generic face is refused', r)
  ok(r && r.code === 'VMU_TOOL_NOT_IN_FACE', 'the refusal keeps the seat face s own code (VMU_TOOL_NOT_IN_FACE), not a generic argument error', { code: r && r.code })
  ok(r && r.seatFace && r.seatFace.tool === 'vibe_v5_record_proposition' && r.seatFace.member === 'r-t1',
    'the receipt names the pack face that refused it and the seat it judged', { seatFace: r && r.seatFace })
  ok(r && typeof r.seatFaceMeans === 'string' && /SAME seat gate/.test(r.seatFaceMeans),
    'and says the verdict came from the seat gate, not from a rule invented by this face', { means: r && r.seatFaceMeans })
  ok(r && typeof r.hint === 'string' && /does not widen/.test(r.hint) && /vibe_v5_record_proposition/.test(r.hint),
    'the hint says the generic face does not widen the pack face, and names it', { hint: r && r.hint })
  const after = await propositionsNow()
  ok(after === before, 'no row landed, so the refusal is the whole behaviour', { before, after })
}

console.log('=== 2. A MEMBER SEAT THE PACK ALLOWS WRITES, AND THE RECEIPT ADMITS A GATE RAN ===')
{
  const r = await call('vibe_vmu_records', { action: 'append', kind: 'proposition', statement: 'P-113b', proof: 'member write' }, { kernel: handle.kernel, agent: { id: 'r-1' } })
  ok(r && r.ok === true, 'a member whose seat allows the pack tool may write', r)
  ok(r && r.seatFace && r.seatFace.allowed === true && r.seatFace.member === 'r-1',
    'the receipt says the seat gate allowed it and which seat it was', { seatFace: r && r.seatFace })
  ok(r && typeof r.seatFaceMeans === 'string' && /pack tool/.test(r.seatFaceMeans),
    'the meaning explains the write is judged by the pack tool s face', { means: r && r.seatFaceMeans })
}

console.log('=== 3. THE OFFICE PATH IS NOT GOVERNED BY A MEMBER FACE ===')
{
  const r = await call('vibe_vmu_records', { action: 'append', kind: 'proposition', statement: 'P-113c', proof: 'office write' }, { kernel: handle.kernel, agent: { id: 'session-9' } })
  ok(r && r.ok === true, 'a root/office caller writes as before (no member seat on the call)', r)
  ok(r && r.seatFace === undefined, 'and the receipt does not claim a seat verdict it did not make', { seatFace: r && r.seatFace })
}

console.log('=== 4. A LIBRARY THE PACK DOES NOT PUBLISH IS NOT INVENTED INTO A GATE ===')
{
  // The gate is DERIVED from the pack's published tools, not from a list of library names: when the pack stops
  // publishing the tool for a kind, this face stops asking about it (and says nothing about a verdict it did not
  // make). Measured by taking the publication away for one call, then putting it back.
  const realPackTools = handle.kernel.packTools
  handle.kernel.packTools = () => ['vibe_v5_record_proposition', 'vibe_v5_record_progress', 'vibe_v5_blueprint']
  const r = await call('vibe_vmu_records', { action: 'append', kind: 'method', statement: 'not published by the pack right now', proof: 'x' }, { kernel: handle.kernel, agent: { id: 'r-t1' } })
  handle.kernel.packTools = realPackTools
  ok(r && r.ok === true, 'a kind whose pack tool is not published is written as before, even from the temp seat', r)
  ok(r && r.seatFaceMeans === undefined, 'and the receipt does not pretend a seat judgement happened', { means: r && r.seatFaceMeans })
  // and a kind the LIBRARY does not have is refused by the library by name — the host does not guess one
  const bad = await call('vibe_vmu_records', { action: 'append', kind: 'note', statement: 'x', proof: 'y' }, { kernel: handle.kernel, agent: { id: 'r-t1' } })
  ok(bad && bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT' && /unknown record kind/.test(String(bad.message)),
    'a kind the library does not have is refused by the library by name', bad)
}

console.log('\n' + (failed === 0 ? 'ALL GREEN' : 'FAILURES: ' + failed))
console.log('passed=' + passed + ' failed=' + failed)
for (const d of roots) await rm(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
if (failed > 0) { console.error(failures.join('\n')); process.exit(1) }
