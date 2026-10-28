#!/usr/bin/env node
// vmu RUN 89 — A READER WITH NO CLOCK CANNOT BE ASKED FOR A TIMESTAMP.
//
// THE GAP (found while writing the live brief for rule E2, "a scheduled meeting waits for its time"):
//   `vibe_v5_meeting { at }` accepted epoch milliseconds and ISO-8601 — both of which a reader must COMPUTE from a
//   clock it does not have. The rules file says "a time", so the only clock-free way to say "in two minutes" is a
//   relative offset; without one, the scheduling rule had a mechanism whose only input form was unreachable for an
//   agent, and the E2 live exercise could not be written honestly.
//
// WHAT THIS SUITE PROVES: (1) "+120s"/"+5m"/"+2h" are converted by the KERNEL's clock (not the caller's), and the
// result lands where the kernel would put it; (2) a bad relative offset is refused by NAME with a hint that names the
// accepted forms; (3) an act on a scheduled meeting is still refused by name, and the message says it is SCHEDULED;
// (4) the teaching names the relative form.
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
const callJSON = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) { return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint } }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r89-')); roots.push(d); return d }

// ── §1 the relative form is converted by the kernel's clock ─────────────────────────────────────────────────────
{
  console.log('§1 "+120s" schedules 120 seconds from the KERNEL now')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const before = Date.now()
  const opened = k.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad', 'r-1'], materials: '相对时间预约', at: '+120s' })
  const after = Date.now()
  const view0 = k.meetings.meetingView({ meeting: opened.meeting })
  ok(view0.state === 'scheduled', 'the meeting is scheduled', view0.state)
  ok(Number.isFinite(opened.scheduledFor), 'scheduledFor is a NUMBER of milliseconds', opened.scheduledFor)
  ok(opened.scheduledFor >= before + 119000 && opened.scheduledFor <= after + 121000,
    'scheduledFor lands 120s after the kernel clock (not the caller\'s idea of now)', { scheduledFor: opened.scheduledFor, before, after })
  ok(view0.scheduledFor === opened.scheduledFor, 'the view reports the same instant the receipt does', { view: view0.scheduledFor, receipt: opened.scheduledFor })

  for (const [spec, delta] of [['+5m', 300000], ['+2h', 7200000], ['+ 90 s', 90000]]) {
    const t0 = Date.now()
    const o = k.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], materials: 'relative ' + spec, at: spec })
    const t1 = Date.now()
    ok(o.scheduledFor >= t0 + delta - 1000 && o.scheduledFor <= t1 + delta + 1000,
      'relative form ' + JSON.stringify(spec) + ' resolves to +' + delta + 'ms', o.scheduledFor - t0)
  }
}

// ── §2 a bad time is refused by name, and the hint names every accepted form ───────────────────────────────────
{
  console.log('§2 an unusable time is refused by name with the accepted forms')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  const refs = []
  for (const bad of ['soon', '+5 minutes', '-30s', '120s']) {
    try {
      k.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad'], materials: 'x', at: bad })
      refs.push({ bad, refused: false })
    } catch (e) { refs.push({ bad, refused: true, code: e.code, hint: String(e.hint || '') }) }
  }
  // ★ an `.every(...)` over a list that could be EMPTY passes vacuously (audit-declaration-criterion RULE E caught
  // this one). The list is the subject of the test, so BOTH its size and the joined values are asserted — a join of
  // an empty list is '', which cannot equal any expected string.
  ok(refs.length >= 4, 'all four unusable time forms were actually tried', refs.length)
  ok(refs.map((r) => r.refused === true).join(',') === 'true,true,true,true',
    'every unusable time is refused (none is coerced to "now")', refs.map((r) => r.refused))
  ok(refs.map((r) => r.code).join(',') === 'VMU_INVALID_ARGUMENT,VMU_INVALID_ARGUMENT,VMU_INVALID_ARGUMENT,VMU_INVALID_ARGUMENT',
    'the refusal code is VMU_INVALID_ARGUMENT', refs.map((r) => r.code))
  ok(refs.map((r) => /relative offset/.test(r.hint)).join(',') === 'true,true,true,true',
    'the hint names the relative form', refs.map((r) => r.hint))
  ok(refs.map((r) => /epoch|ISO-8601/.test(r.hint)).join(',') === 'true,true,true,true',
    'the hint still names absolute forms', refs.map((r) => r.hint))
}

// ── §3 acting on a scheduled meeting is still refused by name, and the message says SCHEDULED ───────────────────
{
  console.log('§3 an act before the start is refused, and the message says SCHEDULED')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const opened = k.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', roster: ['r-acad', 'r-1'], materials: '预约未开始', at: '+600s' })
  const m = opened.meeting
  let err = null
  try { k.meetings.speak({ meeting: m, member: 'r-1', text: '太早了' }) } catch (e) { err = e }
  ok(err !== null, 'speaking before the start is refused', err && err.code)
  ok(err && err.code === 'VMU_STATE', 'the refusal is VMU_STATE', err && err.code)
  ok(err && /SCHEDULED/.test(String(err.message)), 'the message says the meeting is SCHEDULED', err && err.message)
  const view3 = k.meetings.meetingView({ meeting: m })
  ok(view3 && view3.state === 'scheduled', 'the view reports scheduled', view3 && view3.state)
}

// ── §4 the teaching names the relative form ────────────────────────────────────────────────────────────────────
{
  console.log('§4 the teaching names the relative form')
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js'), 'utf8')
  ok(src.includes('"+120s"'), 'the schedule teaching shows the relative form', src.length)
  ok(/没有自己的钟/.test(src), 'the teaching says WHY (an agent has no clock of its own)')
  ok(/相对偏移/.test(src), 'and it names the capability that reason implies (a relative offset, converted by the kernel)')
  ok(/治理动作都被具名拒/.test(src) && /attend` 是座位登记/.test(src), 'the pre-start sentence names the governance refusal AND the attend exemption (run 92 F-89a)')
}

for (const d of roots) await rm(d, { recursive: true, force: true, maxRetries: 10 })
console.log('\n=== VMU RUN89 SCHEDULED AT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
