#!/usr/bin/env node
// RUN 92 findings — two seat-authority defects measured on the clean-room machine at build e07d3eb4:
//
// F-92a  `vibe_v5_record_method { member: "<a temp worker>" }` was ACCEPTED while seat-faces.js declares
//        `allow.temp === false` for that face. The seat gate keyed on the CALLER, and the office has no
//        seat, so the office could attribute a methods card to a temp worker. The attributed member's seat
//        is now checked against the same declared table the member face gate is derived from.
// F-92b  `vibe_v5_hire { to: "<an id already on the roster>" }` re-seated that member IN PLACE (the chair
//        was moved into the temp seat, and every later call failed with `is in slot "temp"`). `to` names a
//        NEW member, so an existing id is refused by name and the receipt points at the face that re-seats.
import { mkdtemp, rm } from 'node:fs/promises'
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
const call = async (b, name, args, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r92-')); roots.push(d); return d }

// ── §1 F-92b: hire never re-seats an existing member ───────────────────────────────────────────────
{
  console.log('§1 F-92b — `to` names a NEW member; an existing id is refused instead of being moved')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const ctx = { kernel: k }
  const r = await call(b, 'vibe_v5_hire', { purpose: 'probe', initial_task: 'x', to: 'r-acad' }, ctx)
  ok(r.parsed && r.parsed.ok === false && r.parsed.code === 'VMU_INVALID_ARGUMENT',
    'hiring an id already on the roster is refused as VMU_INVALID_ARGUMENT', r.parsed || r)
  ok(r.parsed && /already on the roster/.test(String(r.parsed.message)) && /slot "chair"/.test(String(r.parsed.message)),
    'the message says the id is already on the roster and names the slot it holds', r.parsed && r.parsed.message)
  ok(r.parsed && /a new member id/.test(String(r.parsed.hint)) && /vibe_vmu_control/.test(String(r.parsed.hint)),
    'the hint names a new id and points at the face that re-seats', r.parsed && r.parsed.hint)
  const chair = k.members.roster().filter((m) => m.id === 'r-acad')[0]
  ok(chair && String(chair.slot) === 'chair', 'the chair is STILL in the chair seat (no silent re-seat)', chair && chair.slot)
  // a genuinely new id still hires
  const fresh = await call(b, 'vibe_v5_hire', { purpose: 'probe', initial_task: 'y', to: 'r-t1' }, ctx)
  ok(fresh.parsed && fresh.parsed.ok === true && String(fresh.parsed.slotRequested) === 'temp',
    'a new id still hires into the temp seat (the rail is not a blanket refusal)', fresh.parsed || fresh)
}

// ── §2 F-92a: a card attributed to a seat must be a card that seat may write ─────────────────────────
{
  console.log('§2 F-92a — the attributed member\'s seat decides, not only the caller')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  await k.members.hire({ id: 'r-t1', slot: 'temp' })
  const ctx = { kernel: k }
  const tempMethod = await call(b, 'vibe_v5_record_method',
    { content: 'temp writes a methods card', value: 1, motive: 'probe', p: 0.5, member: 'r-t1' }, ctx)
  ok(tempMethod.parsed && tempMethod.parsed.ok === false && tempMethod.parsed.code === 'VMU_NOT_PERMITTED',
    'a methods card attributed to a temp worker is refused as VMU_NOT_PERMITTED', tempMethod.parsed || tempMethod)
  ok(tempMethod.parsed && /record_method/.test(String(tempMethod.parsed.message)) && /slot "temp"/.test(String(tempMethod.parsed.message)),
    'the message names the face and the seat the attributed member holds', tempMethod.parsed && tempMethod.parsed.message)
  ok(tempMethod.parsed && /rule 4/.test(String(tempMethod.parsed.hint)) && /omit member/.test(String(tempMethod.parsed.hint)),
    'the hint cites the declaration and offers the office-attributed path', tempMethod.parsed && tempMethod.parsed.hint)
  // the same seat IS allowed a proposition card (allow.temp === true there) — the rail is per-face
  const tempProp = await call(b, 'vibe_v5_record_proposition',
    { statement: 'temp claims a proposition', value: 1, motive: 'probe', p: 0.6, member: 'r-t1' }, ctx)
  ok(tempProp.parsed && tempProp.parsed.ok === true,
    'a proposition card from the same temp seat is still accepted (per-face, not per-seat)', tempProp.parsed || tempProp)
  const memberMethod = await call(b, 'vibe_v5_record_method',
    { content: 'resident writes a methods card', value: 1, motive: 'probe', p: 0.5, member: 'r-1' }, ctx)
  ok(memberMethod.parsed && memberMethod.parsed.ok === true,
    'a methods card from the resident seat is accepted', memberMethod.parsed || memberMethod)
  const officeMethod = await call(b, 'vibe_v5_record_method',
    { content: 'office writes its own methods card', value: 1, motive: 'probe', p: 0.5 }, ctx)
  ok(officeMethod.parsed && officeMethod.parsed.ok === true && officeMethod.parsed.owner === null,
    'the office can still write its own card (no member ⇒ no attributed seat ⇒ null owner)', officeMethod.parsed || officeMethod)
}

for (const d of roots) await rm(d, { recursive: true, force: true, maxRetries: 10 })
console.log('=== VMU RUN92 TEMP SEAT + HIRE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
