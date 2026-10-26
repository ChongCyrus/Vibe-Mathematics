#!/usr/bin/env node
// tests/vmu-run42-id-namespace.test.mjs — ROUND 42 / F-13 and F-14.
//
// WHY THIS FILE EXISTS. Two receipts from live runs 39-41 that looked like "a missing row" and "a mute that did not
// show up" but were really NAMING defects:
//
//   F-13  THE RECORDS AND THE ROSTER MINTED FROM THE SAME SHAPE. `kernel/records.js` minted `r-<n>`; the v5r pack hires
//         members as `r-acad`, `r-1`, `r-2` (`packs/v5r/tools.js:2736/2740`). So `vibe_v5_read_library { id: "r-1" }`
//         answered «unknown record: r-1» with a list of ids and nothing told the reader that `r-1` is a MEMBER, while a
//         record id handed to `member:` (and the reverse) was silently treated as "unknown object". The fix is one
//         namespace per noun: records mint `rec-<n>` now. A legacy `r-<n>` row stays READABLE (an id is a name; history
//         is not migrated) and is never minted again. The other half is the refusal: a miss must name the noun the id
//         belongs to and the parameter that reads THAT noun.
//
//   F-14  THE MUTE RECEIPT DID NOT READ THE BOOK IT WROTE. `chat.mute` returned `{ok, member, until, durationMs, reason}`,
//         and `chat.status()` printed `muted:[...]`. A caller that muted two people had to make a second call to learn
//         whether the first mute was still in force, and a reader comparing the two faces had to do the arithmetic alone.
//         The receipt now carries `muted` (the same live key list `status` prints) and `mutedMeans`.
//
// Run:  node tests/vmu-run42-id-namespace.test.mjs        (exit 1 = one of the two defects is back)
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const gates = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'verification-gates.js')).href)

const roots = []
const freshRoot = async () => {
  const r = await mkdtemp(join(tmpdir(), 'vmu-run42-ids-'))
  roots.push(r)
  return r
}

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, kernel: handle.kernel, spec: (n) => state.specs.find((s) => s.name === n) }
}

try {
  // ── 1. A MINTED RECORD ID CANNOT BE MISTAKEN FOR A MEMBER ────────────────────────────────────────────────
  console.log('=== 1. records mint `rec-<n>`; the roster owns `r-<n>` ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    await k.members.hire({ id: 'r-acad', slot: 'chair' })
    await k.members.hire({ id: 'r-1', slot: 'member' })
    const roster = k.members.roster().map((m) => String(m.id))
    ok(roster.includes('r-1'), 'the fixture really holds a member whose id is `r-1` (that shape is the whole point)', roster)

    const rows = []
    for (let i = 0; i < 3; i += 1) {
      rows.push(k.records.put({ track: 'progress', kind: 'progress', title: 'row ' + i, body: 'body ' + i }))
    }
    ok(rows.length === 3, 'three progress rows are written', rows.map((r) => r.id))
    ok(rows.every((r) => r && r.ok === true), 'every write landed', rows.map((r) => r && r.ok))
    ok(rows.every((r) => /^rec-\d+$/.test(String(r.id))), '★ every MINTED id has the `rec-<n>` shape (F-13: one namespace per noun)', rows.map((r) => r.id))
    ok(rows.length === 3 && new Set(rows.map((r) => r.id)).size === 3, 'minted ids are distinct', rows.map((r) => r.id))
    ok(rows.every((r) => !roster.includes(String(r.id))), '★ no minted record id collides with a member id', roster)

    // The legacy path: an id written EXPLICITLY still works, because an id is a name and nothing is migrated.
    const legacyId = 'r-9'
    const legacy = k.records.put({ track: 'progress', kind: 'progress', title: 'legacy', body: 'a row under an old-style id', id: legacyId })
    ok(legacy.ok === true && legacy.id === legacyId, '★ a legacy `r-<n>` row can still be written under its own id', legacy)
    const back = k.records.get({ id: legacyId })
    ok((back.record || back).id === legacyId, '★ and it is READ back (history is not migrated, ids are names)', legacyId)
  }

  // ── 2. THE REFUSAL NAMES THE NOUN (and the parameter that reads it) ───────────────────────────────────────
  console.log('=== 2. read_library{ id } names the member/record confusion ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    await k.members.hire({ id: 'r-1', slot: 'member' })
    k.records.put({ track: 'progress', kind: 'progress', title: 'r-1 wrote this', body: 'x', by: 'r-1' })
    const spec = b.spec('vibe_v5_read_library')
    ok(!!spec, 'the library face is registered by the real entry', !!spec)
    const call = async (args) => JSON.parse(await spec.execute(args, {}))

    const asMember = await call({ id: 'r-1' })
    ok(asMember.ok === false && asMember.code === 'VMU_NO_SUCH_OBJECT',
      '★ reading a MEMBER id as a record is refused by name', asMember)
    ok(/MEMBER/.test(String(asMember.hint)) && /member:"r-1"/.test(String(asMember.hint)),
      '★ the refusal says `r-1` is a MEMBER and names the parameter that reads one', asMember.hint)
    ok(/rec-<n>|rec-/.test(String(asMember.hint)),
      '★ and it names the record shape, so the reader learns both nouns from one refusal', asMember.hint)

    const unknown = await call({ id: 'rec-404' })
    ok(unknown.ok === false && unknown.code === 'VMU_NO_SUCH_OBJECT', 'an unknown modern id is still refused by name', unknown)
    ok(/rec-<n>|rec-/.test(String(unknown.hint)) && /r-<n>/.test(String(unknown.hint)),
      'the miss points at BOTH shapes instead of leaving the reader to guess', unknown.hint)

    const byMember = await call({ member: 'r-1', kind: 'progress' })
    ok(byMember.ok === true && byMember.cards.length === 1 && String(byMember.cards[0].owner) === 'r-1',
      'the parameter the refusal pointed at really works (the hint is actable, not decorative)', byMember)
  }

  // ── 3. THE DEBATE SUBJECT CLASSIFIER ACCEPTS BOTH SHAPES ─────────────────────────────────────────────────
  console.log('=== 3. classifySubject: `rec-<n>` is a card, legacy `r-<n>` is a card, neither is a statement ===')
  {
    const modern = gates.classifySubject('rec-12', null)
    ok(modern.form === 'card', '★ a minted `rec-<n>` id is classified as a CARD (the P1 gate exists to check the proof)', modern)
    const legacy = gates.classifySubject('r-7', null)
    ok(legacy.form === 'card', '★ a legacy `r-<n>` id is STILL a card (a card kept its name)', legacy)
    const named = gates.classifySubject('p-chair-rail', null)
    ok(named.form === 'statement', 'a name that is not a card shape is not guessed into being one (run 15 lesson kept)', named)
    const byEvidence = gates.classifySubject('p-chair-rail', { card: { id: 'p-chair-rail' } })
    ok(byEvidence.form === 'card' && byEvidence.identifiedBy === 'evidence',
      'evidence still decides when the shape cannot (the other half of the run-15 lesson)', byEvidence)
  }

  // ── 4. THE MUTE RECEIPT READS THE LIVE MUTE BOOK (F-14) ──────────────────────────────────────────────────
  console.log('=== 4. chat.mute returns `muted` — the same live key list action:"status" prints ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'], vmu: { 'vmu.chat.admins': ['office'] } })
    const k = b.kernel
    await k.members.hire({ id: 'r-1', slot: 'member' })
    await k.members.hire({ id: 'r-2', slot: 'member' })
    const spec = b.spec('vibe_vmu_chat')
    ok(!!spec, 'the chat face is registered by the real entry', !!spec)
    const call = async (args) => JSON.parse(await spec.execute(args, {}))

    const first = await call({ action: 'mute', member: 'r-1', by: 'office', durationMs: 60000 })
    ok(first.ok === true && Array.isArray(first.muted), '★ the mute receipt carries `muted` (F-14: the receipt reads the book it wrote)', first)
    ok(J(first.muted) === J(['r-1']), '★ after ONE mute the receipt says exactly that one member is muted', first.muted)
    ok(typeof first.mutedMeans === 'string' && /status/.test(first.mutedMeans),
      'the field says which OTHER face prints the same list (so the two are not two answers)', first.mutedMeans)

    const second = await call({ action: 'mute', member: 'r-2', by: 'office', durationMs: 60000 })
    ok(second.ok === true && J(second.muted) === J(['r-1', 'r-2']), '★ a second mute shows BOTH members (the list is the book, not a delta)', second.muted)
    const status = k.chat.status()
    ok(J([...status.muted].sort()) === J([...second.muted].sort()),
      '★ the receipt and action:"status" answer the same question identically', { receipt: second.muted, status: status.muted })

    const lifted = await call({ action: 'unmute', member: 'r-1', by: 'office' })
    ok(lifted.ok === true && lifted.wasMuted === true, 'the existing unmute path still reports what it lifted', lifted)
    const after = k.chat.status()
    ok(J([...after.muted]) === J(['r-2']), '★ after the unmute the live book holds only r-2 (the receipt was a reading, not a copy)', after.muted)
  }
} finally {
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true }).catch(() => {})))
}

const verdict = failed === 0 ? 'PASS' : 'FAIL'
console.log('\n=== VMU RUN 42 ID NAMESPACE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('  · ' + f); process.exit(1) }
process.exit(0)
