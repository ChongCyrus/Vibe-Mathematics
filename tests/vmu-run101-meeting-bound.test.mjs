#!/usr/bin/env node
// ROUND 101 (rule L32 / ledger E10) — 「院士可以设置会议时长上界」 had a mechanism gap measured by audit lane 1:
// the ONLY upper bound was the deployment setting `vmu.meetings.hardLimitMs` (construction-time, `who:'office'`),
// so the chair that convened a meeting could not bound it, and `extendlimit` could only raise an ALREADY-OPEN one.
// The fix threads a per-meeting bound through the pack face (`durationMs`) into `meetings.open({ wallLimitMs })`,
// frozen at open exactly like the default, with the same clamp (there is no "unbounded" choice) and a named refusal
// outside it. The receipt reads back WHICH source froze the bound (`wallLimitMsSource`).
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
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r101-')); roots.push(d); return d }

const start = async (b, root) => {
  const s = await call(b, 'vibe_v5_start', { problem: '会议时长上界', researcherCount: 1, academician: true }, { kernel: b.handle.kernel })
  ok(s.parsed && s.parsed.ok !== false, 'the institute starts (a chair seat exists to convene)', s.parsed || s)
}

// ── §1 the chair sets THIS meeting's bound, and the receipt says where it came from ───────────────────────────
{
  console.log('§1 a chair-set bound is frozen at open and read back with its source')
  const root = await mkRoot()
  const b = await boot({ root })
  await start(b, root)
  const ctx = { kernel: b.handle.kernel }
  const r = await call(b, 'vibe_v5_meeting', { agenda: '有界会议', member: 'r-acad', durationMs: 900000, type: 'ordinary' }, ctx)
  const p = r.parsed || {}
  ok(p.ok === true, 'the convene succeeds with durationMs', p)
  ok(p.wallLimitMs === 900000, 'the receipt reports the CHAIR-SET bound (900000), not the deployment default', p.wallLimitMs)
  ok(p.wallLimitMsSource === 'convene', 'the receipt names the source: this convene', p.wallLimitMsSource)
  const st = await call(b, 'vibe_vmu_meeting', { action: 'status', id: p.meeting }, ctx)
  ok(st.parsed && st.parsed.wallLimitMs === 900000, 'the meeting object keeps the chair-set bound (status reads it back)', st.parsed && st.parsed.wallLimitMs)
}

// ── §2 omitting it keeps the deployment default, and says so ─────────────────────────────────────────────────
{
  console.log('§2 no durationMs ⇒ vmu.meetings.hardLimitMs, and the source says which')
  const root = await mkRoot()
  const b = await boot({ root, 'vmu.meetings.hardLimitMs': 1200000 })
  await start(b, root)
  const ctx = { kernel: b.handle.kernel }
  const r = await call(b, 'vibe_v5_meeting', { agenda: '默认上界', member: 'r-acad' }, ctx)
  const p = r.parsed || {}
  ok(p.ok === true, 'the convene succeeds without durationMs', p)
  ok(p.wallLimitMs === 1200000, 'the bound is the declared default (1200000)', p.wallLimitMs)
  ok(p.wallLimitMsSource === 'vmu.meetings.hardLimitMs', 'the source is the setting, not the convene', p.wallLimitMsSource)
}

// ── §3 out of range is refused BY NAME (no unbounded choice, no silent clamp) ────────────────────────────────
{
  console.log('§3 an out-of-range bound is a named refusal, not a clamp')
  const root = await mkRoot()
  const b = await boot({ root })
  await start(b, root)
  const ctx = { kernel: b.handle.kernel }
  for (const bad of [1000, 7200001, 300000.5]) {
    const r = await call(b, 'vibe_v5_meeting', { agenda: '越界', member: 'r-acad', durationMs: bad }, ctx)
    const p = r.parsed || {}
    ok(p.ok === false && p.code === 'VMU_INVALID_ARGUMENT', 'durationMs=' + bad + ' is refused by name', p)
    ok(typeof p.message === 'string' && p.message.includes('300000') && p.message.includes('7200000'),
      'the refusal names the accepted range (it does not clamp silently)', p.message)
    ok(typeof p.hint === 'string' && p.hint.includes('no unbounded choice'),
      'the hint says there is no unbounded choice', p.hint)
  }
}

// ── §4 extendlimit raises the CHAIR-SET bound (the two doors agree) ──────────────────────────────────────────
{
  console.log('§4 extendlimit adds on top of the chair-set bound')
  const root = await mkRoot()
  const b = await boot({ root })
  await start(b, root)
  const ctx = { kernel: b.handle.kernel }
  const r = await call(b, 'vibe_v5_meeting', { agenda: '延长', member: 'r-acad', durationMs: 600000 }, ctx)
  const p = r.parsed || {}
  ok(p.ok === true && p.wallLimitMs === 600000, 'the meeting opens with 600000', p.wallLimitMs)
  const before = p.meeting
  const ex = await call(b, 'vibe_vmu_meeting', { action: 'extendlimit', id: before, ms: 600000, actor: 'r-acad' }, ctx)
  const e = ex.parsed || {}
  ok(e.ok === true && e.wallLimitMs === 1200000, 'extendlimit raises the chair-set bound (600000 + 600000 = 1200000)', e.wallLimitMs)
}

// ── §5 the kernel refuses the same range on its own door (one rule, two doors) ──────────────────────────────
{
  console.log('§5 the kernel door refuses an out-of-range wallLimitMs too')
  const root = await mkRoot()
  const b = await boot({ root })
  await start(b, root)
  const m = b.handle.kernel.meetings
  let caught = null
  try { m.open({ type: 'ordinary', chair: 'r-acad', actor: 'r-acad', wallLimitMs: 1000 }) } catch (e) { caught = e }
  ok(caught && caught.code === 'VMU_INVALID_ARGUMENT', 'meetings.open({wallLimitMs:1000}) is refused by name', caught && caught.code)
  const good = m.open({ type: 'ordinary', chair: 'r-acad', actor: 'r-acad', wallLimitMs: 600000 })
  ok(good && good.wallLimitMs === 600000 && good.wallLimitMsSource === 'convene', 'the kernel door accepts 600000 and reports the source', good && [good.wallLimitMs, good.wallLimitMsSource])
}

// ── §6 teaching + declaration (the words the chair reads must mention the knob it has) ───────────────────────
{
  console.log('§6 the convene face declares durationMs and the teaching says who sets the bound')
  const root = await mkRoot()
  const b = await boot({ root })
  const spec = b.specOf('vibe_v5_meeting')
  const props = spec && spec.parameters && spec.parameters.properties ? spec.parameters.properties : {}
  ok(props.durationMs && props.durationMs.type === 'integer',
    'vibe_v5_meeting declares durationMs: integer', props.durationMs)
  ok(typeof spec.description === 'string' && spec.description.includes('durationMs') && spec.description.includes('wallLimitMsSource'),
    'the description teaches the knob and the receipt fields', null)
  const { readFileSync } = await import('node:fs')
  const B = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js'), 'utf8')
  ok(B.includes('durationMs') && B.includes('wallLimitMsSource'),
    'the live teaching tells the chair it can set this meeting\'s own upper bound (R101)', null)
}

for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch {} }
console.log('\nROUND 101 MEETING BOUND: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)
