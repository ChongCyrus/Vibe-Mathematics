#!/usr/bin/env node
// RUN 90 findings — two readback truths measured on the clean-room machine at build e951305b:
//
// F-88b  `vibe_v5_paper { action: "part" }` without a target answered `no paper "" exists` — a missing
//        ARGUMENT dressed as a broken reader. Every action except `sections` addresses one paper, so a missing
//        target is now refused BY NAME, naming the aliases and the read that lists papers.
// F-89a  the scheduled-meeting note said 「开始时间之前任何动作都会被内核具名拒绝」 while `attend` is
//        EXEMPT BY DESIGN (it is how a waiting meeting gets its quorum). The mechanism was right; the sentence
//        was wrong. It now names the governance acts that are refused and the one exemption on purpose.
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
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r90-')); roots.push(d); return d }

// ── §1 F-88b: a paper action with no target names the missing argument ─────────────────────────────────────────
{
  console.log('§1 F-88b — a paper action addresses ONE paper, so a missing target is an ARGUMENT problem')
  const root = await mkRoot()
  const b = await boot({ root })
  const ctx = { kernel: b.handle.kernel }
  const r = await call(b, 'vibe_v5_paper', { action: 'part', member: 'r-1', part: 'x', body: 'y' }, ctx)
  ok(r.parsed && r.parsed.ok === false && r.parsed.code === 'VMU_INVALID_ARGUMENT',
    'a part with no target is refused as VMU_INVALID_ARGUMENT (not "no paper exists")', r.parsed || r)
  ok(r.parsed && /addresses ONE paper/.test(String(r.parsed.message)) && /no target/.test(String(r.parsed.message)),
    'the message says the action addresses ONE paper and that no target was given', r.parsed && r.parsed.message)
  ok(r.parsed && /title\/track are aliases/.test(String(r.parsed.hint)) && /lists the papers/.test(String(r.parsed.hint)),
    'the hint names the aliases and the read that lists papers', r.parsed && r.parsed.hint)
  const start = await call(b, 'vibe_v5_paper', { action: 'start', participants: ['r-1'] }, ctx)
  ok(start.parsed && start.parsed.ok === false && start.parsed.code === 'VMU_INVALID_ARGUMENT',
    '`start` is covered by the same rail', start.parsed || start)
  const sections = await call(b, 'vibe_v5_paper', { action: 'sections' }, ctx)
  ok(sections.parsed && sections.parsed.ok === true && Array.isArray(sections.parsed.sections),
    '`sections` needs no target (it is the catalogue, not one paper)', sections.parsed && Object.keys(sections.parsed))
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// ── §2 F-89a: the scheduled note names what is refused AND the one exemption ───────────────────────────────────
{
  console.log('§2 F-89a — the scheduled note must not claim that EVERY act is refused')
  const root = await mkRoot()
  const b = await boot({ root, 'vmu.meetings.chairActRequiresTurn': false })
  const k = b.handle.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const ctx = { kernel: k }
  const at = Date.now() + 90000
  const conv = await call(b, 'vibe_v5_meeting', { agenda: 'r90 scheduled', type: 'ordinary', member: 'r-acad', at }, ctx)
  ok(conv.parsed && conv.parsed.ok === true && conv.parsed.state === 'scheduled',
    'a future start schedules the meeting (the mechanism under test)', conv.parsed || conv)
  const note = String((conv.parsed && conv.parsed.scheduleNote) || '')
  ok(/治理动作/.test(note) && /具名拒绝/.test(note), 'the note names what is refused: governance acts, by name', note)
  ok(/attend/.test(note) && /允许提前签到/.test(note), 'the note names the ONE exemption instead of claiming every act is refused', note)
  ok(!/任何动作都会被内核具名拒绝/.test(note), 'the old absolute sentence is gone', note)
  const mid = conv.parsed && conv.parsed.meeting
  const att = await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid, member: 'r-1' }, ctx)
  ok(att.parsed && att.parsed.ok === true, 'attending before the start time is still allowed (the kernel is unchanged)', att.parsed && Object.keys(att.parsed))
  const speak = await call(b, 'vibe_v5_say', { member: 'r-1', meeting: mid, text: 'early' }, ctx)
  ok(speak.parsed && speak.parsed.ok === false && speak.parsed.code === 'VMU_STATE',
    'a governance act before the start time is still refused by name', speak.parsed || speak)
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

// ── §3 pins: the two sentences this round changed must not silently drift back ────────────────────────────────
{
  console.log('§3 pins — the changed sentences are anchored in the shipped face')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu/packs/v5r/tools.js'), 'utf8')
  ok(/addresses ONE paper/.test(tools), 'pin: the paper target refusal lives in the pack face')
  ok(/治理动作/.test(tools) && /允许提前签到/.test(tools), 'pin: the scheduled note keeps both halves (refused / exempt)')
  ok(!/任何动作都会被内核具名拒绝/.test(tools), 'pin: the absolute claim stays deleted')
}

for (const r of roots) { try { await rm(r, { recursive: true, force: true, maxRetries: 10 }) } catch { /* already gone */ } }
console.log('=== RUN 90 PAPER TARGET & SCHEDULE NOTE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)
