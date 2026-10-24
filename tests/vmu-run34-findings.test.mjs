// run 34 findings — the member tool table must stay READABLE when the wire does not exist yet.
//
// WHAT THE RUN SAID (run 34, the institute's own report, item 2): asking `vibe_v5_tool_help { member }` in a
// `deliveryPath:"caller"` deployment returned `VMU_NO_SUCH_OBJECT — no live Agent for member …`. The rule it was
// checking is "a member's visible tool table is observable". The refusal is honest (there IS no child session to
// read), but it makes the reading unusable exactly when the institution asks — and answering `tools: []` instead
// would be worse: it says "this member can use nothing", which is false.
//
// SO THE FIX IS NEITHER: the receipt carries the provider's named refusal AS A FIELD, says `tools:null` (not `[]`),
// and reports the override record the loop would actually apply. These assertions pin that shape, plus the two
// neighbouring behaviours that must NOT change: a live provider still returns its list, and an override still shows.
//
// Run: node tests/vmu-run34-findings.test.mjs        Last line: === VMU RUN34 FINDINGS: N passed, M failed ===

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) } }

const boot = async ({ provider }) => {
  const k = m.createKernel({ clock: () => 0 })
  k.declareSlots([{ id: 'chair', label: 'c', capacity: 0 }, { id: 'member', label: 'm', capacity: 0 }])
  await k.members.hire({ id: 'm-a', slot: 'member', institution: 'sim' })
  k.declarePackTools([
    { name: 'vibe_test_read', handler: () => ({}) },
    { name: 'vibe_test_vote', handler: () => ({}) },
  ], { by: 'probe-pack' })
  k.turn.setVisibleToolsProvider(provider)
  return k
}

// ── ① no live Agent ⇒ a READABLE receipt, never an empty list and never a dead end ─────────────────────
{
  const k = await boot({
    provider: () => {
      const e = new Error('no live Agent for member m-a (session=(none learned yet))')
      e.code = 'VMU_NO_SUCH_OBJECT'
      e.hint = 'deliver one turn first so the child session id is learned'
      throw e
    },
  })
  const v = k.toolsView({ member: 'm-a' })
  ok(v.ok === true, '① no live Agent still answers (the reading must not become unusable)', v)
  ok(v.tools === null, '★★ ① `tools` is NULL, not `[]` — an empty list would say "can use nothing", which is a lie', v.tools)
  ok(v.count === null && v.source === 'no-live-agent' && v.liveAgent === false,
    '★ ① the receipt names WHY it could not read (source/liveAgent) instead of leaving the reader to guess', v)
  ok(v.refusal && v.refusal.code === 'VMU_NO_SUCH_OBJECT' && /no live Agent/.test(String(v.refusal.message)),
    '★★ ① the provider\'s NAMED refusal is carried as a field — the honesty moves, it does not disappear', v.refusal)
  ok(typeof v.refusal.hint === 'string' && /deliver one turn first/.test(v.refusal.hint),
    '① the refusal keeps its hint (what the caller can do about it)', v.refusal.hint)
  ok(typeof v.note === 'string' && /caller delivery/.test(v.note) && /tools:null/.test(v.note) && /NOT/.test(v.note),
    '★ ① the note reads as prose: caller delivery has no child session; null is not "sees nothing"', v.note)
  ok(v.override === null, '① with no override recorded, the field is null (the pack default for the seat), not undefined', v.override)
}

// ── ② the override record the loop WOULD apply is reported alongside the refusal ───────────────────────
{
  const k = await boot({
    provider: () => {
      const e = new Error('no live Agent for member m-a (session=(none learned yet))')
      e.code = 'VMU_NO_SUCH_OBJECT'
      e.hint = 'deliver one turn first'
      throw e
    },
  })
  k.setMemberToolOverride({ member: 'm-a', allow: ['vibe_test_read'] })
  const v = k.toolsView({ member: 'm-a' })
  ok(v.ok === true && v.tools === null, '② the refusal path is unchanged by an existing override', v.tools)
  ok(v.override && Array.isArray(v.override.allow) && v.override.allow.includes('vibe_test_read'),
    '★★ ② the override the loop applies IS readable even when the wire is not — this is the half that answers the rule',
    v.override)
  ok(v.source === 'no-live-agent', '② the source still says the wire was unreadable (the override does not masquerade as one)', v.source)
}

// ── ③ the live-provider path is untouched (no regression dressed as a fix) ────────────────────────────
{
  const k = await boot({ provider: () => ['vibe_test_read', 'vibe_test_vote'] })
  const v = k.toolsView({ member: 'm-a' })
  ok(v.ok === true && v.source === 'provider' && Array.isArray(v.tools) && v.tools.length === 2,
    '★ ③ a live provider still returns its list (the fix must not swallow the working path)', v)
  ok(v.tools.every((t) => t && typeof t.name === 'string') && v.refusal === undefined,
    '③ the healthy receipt carries no refusal field at all (absence must mean "nothing to report")', v)
  ok(v.count === 2, '③ count still counts on the healthy path', v.count)
}

// ── ④ it is the SAME method, so the pack face inherits it (no second opinion) ──────────────────────────
{
  const src = (await import('node:fs')).readFileSync(resolve(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(/kernel\.toolsView\(\{ member: str\(args\.member\), agent \}\)/.test(src),
    '★ ④ the pack face FORWARDS the kernel reading (one source of truth), so this shape reaches the tool', /toolsView/.exec(src) ? 'found' : 'missing')
}

// ── ⑤ the two READABILITY items the run also handed back (items 3 and 4) ────────────────────────────────
{
  const { closureVoteOf } = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
  const sessionView = closureVoteOf({ votes: new Map(), roster: [{ id: 'm-a' }] })
  ok(sessionView.window === 'session' && sessionView.meetingId === null,
    '⑤ the unbound reading still says session/null (no behaviour change)', sessionView.window)
  ok(!/passes \{ meetingId \}/.test(String(sessionView.windowMeans)),
    '★★ ⑤ the sentence no longer promises an argument NO face sends (a promise with no caller is a lie)', sessionView.windowMeans)
  ok(/not reachable from the tool surface/.test(String(sessionView.windowMeans)),
    '★ ⑤ it states the LIMIT plainly instead of implying the field is usable', sessionView.windowMeans)

  const boundView = closureVoteOf({ votes: new Map(), roster: [{ id: 'm-a' }], meetingId: 'm-9' })
  ok(boundView.window === 'meeting' && boundView.meetingId === 'm-9',
    '⑤ a bound reading is still labelled as such (the other branch is not dead)', boundView.window)

  const turnSrc = (await import('node:fs')).readFileSync(resolve(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  ok(/countedLater: \{[\s\S]{0,400}?when: [\s\S]{0,200}?op:"step"/.test(turnSrc),
    '★★ ⑤ the reply receipt says WHEN its effects run (run 34 item 4: accepted:true left votesCast unchanged)', 'countedLater')
  ok(/countedLater: \{[\s\S]{0,600}?fields: Object\.keys\(recorded\.reply\)/.test(turnSrc),
    '★ ⑤ the note carries the field names actually reported (not a generic sentence)', 'fields')
}

console.log('')
if (failed > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  FAIL ' + f) }
console.log('=== VMU RUN34 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
