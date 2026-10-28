#!/usr/bin/env node
// ROUND 103 — two defects measured on the full live runs of the same day.
//
// F-102a: 「状态版：可查看他人、可改自己」 (D7) had a gate and a receipt, but the gate never saw a member: the pack dispatch
// handed the handler `{kernel, exec, packId}` and `kit/handlers.js` destructured `{kernel, agent}`, so `agent` was
// `undefined` on EVERY call and the seat was always read as the office. Run 102: member r-1 wrote `r-acad`'s state panel
// and the receipt said "written through the office/human path: no member seat was on the call".
//
// F-103a: the convene receipt's `wallLimitNote` hard-coded "clamped [300000, 7200000]" while the runtime ceiling is
// `vmu.meetings.extendCeilingMs` (14400000 by default) and an over-ceiling request is refused WHOLE, not clamped.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'host-pack-tools.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const packTools = await import(pathToFileURL(TOOLS).href)
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
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r103-')); roots.push(d); return d }
const start = async (b, root) => {
  const s = await call(b, 'vibe_v5_start', { problem: '席位与上界', researcherCount: 2, academician: true }, { kernel: b.handle.kernel })
  ok(s.parsed && s.parsed.ok !== false, 'the institute starts (a chair seat and one member exist)', s.parsed || s)
}
const STATE4 = { progress: '读了两篇', obstacles: '无', next: '继续', help: '无' }

// ── §1 THE CRITERION: which member is this call for? ────────────────────────────────────────────────────────────
{
  console.log('§1 resolveTurnMember: the SAME criterion the seat-face gate uses')
  const roster = [{ id: 'r-acad' }, { id: 'r-1' }]
  const fake = {
    currentTurnMember: () => 'r-1',
    memberSession: (id) => (id === 'r-1' ? 'session-child-1' : null),
    members: { roster: () => roster },
  }
  ok(packTools.resolveTurnMember(fake, { agent: { id: 'r-1' } }) === 'r-1', 'a roster id IS the seat (exact match)', null)
  ok(packTools.resolveTurnMember(fake, { agent: { id: 'session-child-1' } }) === 'r-1', 'the learned child session maps to its member', null)
  ok(packTools.resolveTurnMember(fake, { agent: { id: 'session-root' } }) === null, 'a root session is NOT a member seat (null is an answer)', null)
  ok(packTools.resolveTurnMember(fake, {}) === null, 'a call with no agent is not a seat either', null)
}

// ── §2 F-102a: the WRITE RIGHT follows the seat ─────────────────────────────────────────────────────────────────
{
  console.log('§2 a member may rewrite its OWN panel and not another member\'s — through the pack dispatch')
  const root = await mkRoot()
  const b = await boot({ root })
  await start(b, root)
  const kernel = b.handle.kernel
  const roster = kernel.members.roster().map((m) => m.id)
  const other = roster.find((id) => id !== 'r-1' && id !== 'r-acad')
  ok(typeof other === 'string' && other !== '', 'there is a second non-chair member to write for', roster)

  // a member call: the agent id IS the roster id in this deployment shape (see resolveTurnMember §1)
  const asMember = { kernel, agent: { id: 'r-1' } }
  const selfWrite = await call(b, 'vibe_v5_record_progress', Object.assign({ track: 'state', state: STATE4 }, { }), asMember)
  const sp = selfWrite.parsed || {}
  ok(sp.ok === true, 'the member writes its own panel (no `member` argument needed)', sp.code || sp)
  ok(sp.panelOwner === 'r-1', '★ the receipt names the panel owner as the CALLING member (F-102a)', sp.panelOwner)
  ok(sp.panelOwnerMeans === undefined || !/office\/human/.test(String(sp.panelOwnerMeans)), 'and does NOT claim it went through the office path', sp.panelOwnerMeans)

  const stealWrite = await call(b, 'vibe_v5_record_progress', { track: 'state', member: other, state: STATE4 }, asMember)
  ok(stealWrite.thrown === true || (stealWrite.parsed && stealWrite.parsed.ok === false), '★ a member CANNOT rewrite another member\'s panel', stealWrite.code || stealWrite.parsed)
  const stealCode = stealWrite.code || (stealWrite.parsed && stealWrite.parsed.code)
  const stealMsg = stealWrite.message || (stealWrite.parsed && stealWrite.parsed.message)
  ok(stealCode === 'VMU_NOT_PERMITTED', 'refused BY NAME (VMU_NOT_PERMITTED)', stealCode)
  ok(/only that member may rewrite it/.test(String(stealMsg)), 'the message says whose panel it is and why', String(stealMsg).slice(0, 120))

  // the OFFICE registers on behalf: allowed, and the receipt says whose panel it wrote
  const asOffice = { kernel, agent: { id: 'session-root-office' } }
  const onBehalf = await call(b, 'vibe_v5_record_progress', { track: 'state', member: other, state: STATE4 }, asOffice)
  const ob = onBehalf.parsed || {}
  ok(ob.ok === true, 'the office may still write on behalf (the registrar path is not removed)', ob.code || ob)
  ok(ob.panelOwner === other, 'and the receipt names the panel it wrote', ob.panelOwner)
  ok(/office\/human/.test(String(ob.panelOwnerMeans || '')), 'the office receipt says which path wrote it', ob.panelOwnerMeans)
}

// ── §3 F-103a: the extension ceiling in the note is the LIVE setting ────────────────────────────────────────────
{
  console.log('§3 the convene note reads the live ceiling instead of a hard-coded number')
  const root = await mkRoot()
  const b = await boot({ root })
  await start(b, root)
  const ctx = { kernel: b.handle.kernel }
  const r = await call(b, 'vibe_v5_meeting', { agenda: '有界会议', member: 'r-acad', durationMs: 900000, type: 'ordinary' }, ctx)
  const p = r.parsed || {}
  ok(p.ok === true, 'the convene succeeds', p.code || p)
  const note = String(p.wallLimitNote || '')
  ok(note.length > 40, 'the note is there', note.slice(0, 60))
  ok(!/7200000/.test(note), '★ the note no longer prints the number nobody enforces (7200000)', note.slice(0, 200))
  ok(/extendCeilingMs/.test(note), 'it names the setting that IS the ceiling', note.slice(0, 200))
  ok(/no value|not declared/i.test(note) && /after \/ ceiling/.test(note),
    '★ with nothing declared it NAMES the key and points at the refusal that prints the real ceiling (no invented default)', note.slice(0, 260))
  ok(!/never unbounded: clamped/i.test(note) && /refused BY NAME/.test(note),
    '★ and does not call an over-ceiling refusal "clamped [a, b]" (it is refused whole, by name)', note.slice(0, 240))

  const root2 = await mkRoot()
  const b2 = await boot({ root: root2, 'vmu.meetings.extendCeilingMs': 5000000 })
  await start(b2, root2)
  const r2 = await call(b2, 'vibe_v5_meeting', { agenda: '窄上界', member: 'r-acad', type: 'ordinary' }, { kernel: b2.handle.kernel })
  const note2 = String((r2.parsed && r2.parsed.wallLimitNote) || '')
  ok(/5000000/.test(note2), '★ a deployment that declares 5000000 sees 5000000 (the note follows the setting)', note2.slice(0, 240))
  ok(!/14400000/.test(note2), 'and not the framework default', note2.slice(0, 240))
}

// ── §4 ROUND 104 / F-104a: the SIBLING reading of the same bound must describe the live bounds too ─────────────
{
  console.log('§4 the status receipt sibling field reads the two live bounds (no stale constant one field over)')
  const root = await mkRoot()
  const b = await boot({ root })
  await start(b, root)
  const ctx = { kernel: b.handle.kernel }
  const r = await call(b, 'vibe_v5_meeting', { agenda: '兄弟字段', member: 'r-acad', type: 'ordinary' }, ctx)
  const p = r.parsed || {}
  ok(p.ok === true, 'the meeting opens', p.code || p)
  const st = await call(b, 'vibe_vmu_meeting', { action: 'status', id: p.meeting }, ctx)
  const means = String((st.parsed && st.parsed.wallLimitMeans) || '')
  ok(means.length > 40, 'the status receipt carries wallLimitMeans', means.slice(0, 80))
  ok(!/7200000/.test(means), '★ it no longer prints the number nobody enforces (7200000)', means.slice(0, 240))
  ok(/adds|ADDS/.test(means) && /refused WHOLE/.test(means), 'it says extensions are additive and an over-ceiling request is refused WHOLE', means.slice(0, 300))
  const ceiling = String(b.handle.kernel.settingsSnapshot()['vmu.meetings.extendCeilingMs'] === undefined ? '' : '')
  ok(ceiling === '', 'sanity: the deployment need not declare the key for the sentence to be honest (it prints the kernel value)', null)
  const none = await boot({ root, 'vmu.meetings.extendCeilingMs': 5000000 })
  const r2 = await call(none, 'vibe_v5_meeting', { agenda: '窄上界兄弟', member: 'r-acad', type: 'ordinary' }, { kernel: none.handle.kernel })
  const st2 = await call(none, 'vibe_vmu_meeting', { action: 'status', id: (r2.parsed || {}).meeting }, { kernel: none.handle.kernel })
  const means2 = String((st2.parsed && st2.parsed.wallLimitMeans) || '')
  ok(/5000000/.test(means2), '★ a deployment that declares 5000000 reads 5000000 back from the sibling field too', means2.slice(0, 300))
}

for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch { /* best effort */ } }
console.log('\n=== RUN 103 SEAT + CEILING: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
