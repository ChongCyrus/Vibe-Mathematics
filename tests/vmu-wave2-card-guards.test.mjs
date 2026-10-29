#!/usr/bin/env node
// ★ WAVE 2 (audit C5/C6a/B6) — three card-write guards and one adoption guard that used to be words:
//   · `p` must be a LITERAL JSON number (no `Number()` coercion of "0.6"/true/""),
//   · `proof_state:"COMPLETE"` is the same state as `complete` (and still needs real Lean evidence),
//   · a `lean_conformance` word alone is a CLAIM, not evidence,
//   · a blueprint adopt is judged by the RESOLVED CALLER, not by the caller-supplied `member` text.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1; failures.push(label)
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const roots = []
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-wave2-card-')); roots.push(d); return d }
const base = (b) => b.parsed || b

console.log('\n=== WAVE2 CARD GUARDS (literal p / proof state / lean claim / adopt caller) ===')

// ── §1 a quoted or non-numeric p is refused by name ────────────────────────────────────────────────────────────────
{
  console.log('§1 p must be a LITERAL number')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const str = base(await call(b, 'vibe_v5_record_proposition', { id: 'p-a', title: 't', statement: 's', value: 'the claim', motive: 'why it matters', p: '0.6' },
    { kernel: k, agent: { id: 'agent-r-1' } }))
  ok(str.ok === false && str.code === 'VMU_INVALID_ARGUMENT', '§1.1 p:"0.6" (a string) is REFUSED, not coerced', str)
  ok(/literal JSON number/.test(String(str.message)), '§1.2 the refusal says what a p must be', str.message)
  const bool = base(await call(b, 'vibe_v5_record_proposition', { id: 'p-b', title: 't', statement: 's', value: 'the claim', motive: 'why it matters', p: true },
    { kernel: k, agent: { id: 'agent-r-1' } }))
  ok(bool.ok === false && bool.code === 'VMU_INVALID_ARGUMENT', '§1.3 p:true is refused too (a boolean is not an estimate)', bool)
  const good = base(await call(b, 'vibe_v5_record_proposition', { id: 'p-c', title: 't', statement: 's', value: 'the claim', motive: 'why it matters', p: 0.6 },
    { kernel: k, agent: { id: 'agent-r-1' } }))
  ok(good.ok === true, '§1.4 a literal 0.6 still writes the card (the honest path stays open)', good)
}

// ── §2 proof_state is case-insensitive and "COMPLETE" still needs real evidence ─────────────────────────────────────
{
  console.log('§2 proof_state is case-insensitive; COMPLETE still needs Lean evidence')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const upper = base(await call(b, 'vibe_v5_record_proposition', { id: 'p-up', title: 't', statement: 's', value: 'the claim', motive: 'why it matters', p: 0.4, proof_state: 'COMPLETE' },
    { kernel: k, agent: { id: 'agent-r-1' } }))
  ok(upper.ok === false && upper.code === 'VMU_INVALID_ARGUMENT', '§2.1 proof_state:"COMPLETE" is the SAME state and is refused without Lean evidence', upper.code)
  ok(/proof_ref/.test(String(upper.message)) && /lean_job/.test(String(upper.message)),
    '§2.2 the refusal names BOTH missing halves (the rule admits a finished proof as well as Lean)', upper.message)
  const lower = base(await call(b, 'vibe_v5_record_proposition', { id: 'p-low', title: 't', statement: 's', value: 'the claim', motive: 'why it matters', p: 0.4, proof_state: 'complete' },
    { kernel: k, agent: { id: 'agent-r-1' } }))
  ok(lower.ok === false, '§2.3 the lowercase spelling behaves the same (one meaning, one guard)', lower)
  const draft = base(await call(b, 'vibe_v5_record_proposition', { id: 'p-draft', title: 't', statement: 's', value: 'the claim', motive: 'why it matters', p: 0.4, proof_state: 'draft' },
    { kernel: k, agent: { id: 'agent-r-1' } }))
  ok(draft.ok === true, '§2.4 a draft is still writable', draft)
}

// ── §3 a conformance WORD is a claim: it cannot carry "complete" alone ─────────────────────────────────────────────
{
  console.log('§3 a conformance word alone is a CLAIM')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const claim = base(await call(b, 'vibe_v5_record_proposition',
    { id: 'p-claim', title: 't', statement: 's', value: 'the claim', motive: 'why it matters', p: 0.4, proof_state: 'complete', lean_conformance: 'conform' },
    { kernel: k, agent: { id: 'agent-r-1' } }))
  ok(claim.ok === false && claim.code === 'VMU_INVALID_ARGUMENT', '§3.1 lean_conformance without a readable passed job is REFUSED', claim.code)
  ok(/claim, not evidence/.test(String(claim.message)), '§3.2 the refusal says the word is a claim, not evidence', claim.message)
  ok(/lean_job/.test(String(claim.hint)), '§3.3 the hint names the half that would make it evidence', claim.hint)
}

// ── §4 blueprint adopt reads the CALLER, not the text ──────────────────────────────────────────────────────────────
{
  console.log('§4 a blueprint adopt is judged by the CALL')
  const root = await mkRoot()
  const b = await boot({ root })
  const k = b.kernel
  await k.members.hire({ id: 'r-acad', slot: 'chair' })
  await k.members.hire({ id: 'r-1', slot: 'member' })
  const proposed = base(await call(b, 'vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: '# 协议\n正文一' },
    { kernel: k, agent: { id: 'agent-r-1' } }))
  ok(proposed.ok === true, '§4.1 a member can still propose', proposed)
  const draftId = proposed.id || (proposed.proposed && proposed.proposed.id)
  if (typeof k.store.write === 'function') await k.store.write('member_sessions', [{ member: 'r-1', session: 'session-r-1' }, { member: 'r-acad', session: 'session-r-acad' }])
  const imposter = base(await call(b, 'vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Protocol.md', draft: draftId, member: 'r-acad' },
    { kernel: k, agent: { id: 'session-r-1' } }))
  ok(imposter.ok === false && imposter.code === 'VMU_NOT_PERMITTED', '§4.2 a resident cannot adopt by naming the chair (the CALL is the seat)', imposter)
  ok(/cannot adopt in another member/.test(String(imposter.message)), '§4.3 the refusal says the seat came from the call', imposter.message)
  // B5 requires BOTH seats to have written their own design section before adopt; add the resident's section first.
  const second = base(await call(b, 'vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: '## 院士的设计·正文二' },
    { kernel: k, agent: { id: 'session-r-acad' } }))
  ok(second.ok === true, '§4.4a the chair writes its own design section (continues the same draft)', second)
  const chair = base(await call(b, 'vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Protocol.md', draft: draftId, member: 'r-acad' },
    { kernel: k, agent: { id: 'session-r-acad' } }))
  ok(chair.ok === true, '§4.4b the chair itself still adopts once both seats are in (the honest path stays open)', chair)
}

for (const d of roots) await rm(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
console.log('\n=== WAVE2 CARD GUARDS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failed === 0 ? 0 : 1)
