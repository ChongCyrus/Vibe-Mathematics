// RUN 184 (run 32, the institute's own feedback): two receipts answered less than the reader asked.
//
// ① The debate-subject gate has THREE recognised subject forms (card / file / statement) and refuses the statement form
//    by the same code as the card form — but only the card form told the reader WHO can repair it. Run 32 measured it:
//    the same call refused a one-line proposition with a hint that named the two legal forms and stopped there, so the
//    reader had no actor to wake. The hint now carries the reachable, actor-naming sentence on BOTH branches.
// ② The close receipt showed `closureVote` next to `archived:true`. Those numbers are NOT frozen by the close: the
//    durable key is latest-wins, so a vote cast afterwards changes the same record. Run 32 read the two as contradicting
//    readings across kernel copies. The receipt now names the instant its numbers belong to and says closing does not
//    freeze them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const GATES = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'verification-gates.js'), 'utf8')
const MEETING = readFileSync(join(ROOT, 'vibe-math-vmu', 'tools', 'meeting.js'), 'utf8')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

function boots(entry) {
  return async function boot(root, settings = {}) {
    const state = { specs: [] }
    const ctx = {
      effect(fn) { return fn() },
      on() { return () => {} },
      tools: { async register(spec) { state.specs.push(spec); return () => {} } },
    }
    const handle = await entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, settings))
    await handle.ready()
    await handle.kernel.store.open()
    const specOf = (name) => state.specs.filter((s) => s && s.name === name)[0] || null
    const call = async (name, args, exec) => {
      const spec = specOf(name)
      ok(!!spec, 'tool declared: ' + name)
      const raw = await spec.execute(args || {}, exec)
      return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
    }
    return { handle, K: handle.kernel, specOf, call, state }
  }
}

test('RUN 184 §0 — the source carries both sentences', () => {
  has(GATES, 'REACHABLE INSTEAD (the actor matters): this is an ADDRESS problem, not a proof problem',
    '§0a the statement form names the reachable repair too')
  has(GATES, 'wake that author', '§0b the statement form names the ACTOR (the author), not just the form')
  has(GATES, 'members: ["<author seat>"], rounds: 1 } with a next_step asking for the card and its proof_ref',
    '§0c the reachable call is spelled out')
  has(MEETING, 'closureVoteAsOf:', '§0d the close receipt names the instant of its closure reading')
  has(MEETING, 'Closing does NOT freeze this reading', '§0e the close receipt says closing does not freeze it')
  has(MEETING, 'closureVoteAsOfMeans', '§0f and the field carries its own explanation')
})

test('RUN 184 §1 — a one-line proposition is refused WITH the actor, at runtime', async () => {
  const gates = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'verification-gates.js')).href)
  const reading = gates.debateSubjectGate({ meeting: { type: 'debate' }, subject: '这是一句话命题', evidence: {} })
  ok(reading.code === 'VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF', '§1a a one-line proposition is refused by name', reading)
  ok(reading.allowed === false, '§1b and it is NOT allowed through', reading)
  has(reading.hint, 'REACHABLE INSTEAD', '§1c the refusal names the reachable repair')
  has(reading.hint, 'ADDRESS problem', '§1d it says what kind of problem this is')
  has(reading.hint, 'wake that author', '§1e it names the actor')
  has(reading.hint, 'vibe_vmu_turn { op: \"drive\"', '§1f and the reachable call')
  // the card form keeps its own sentence: the two branches refuse with the same code and must both carry it
  const card = gates.debateSubjectGate({ meeting: { type: 'debate' }, subject: 'rec-1', evidence: {} })
  ok(card.code === 'VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF', '§1g the card form refuses with the same code when unread', card)
  has(card.hint, 'records.get', '§1h the card form still tells the reader to read the card first')
})

test('RUN 184 §2 — the close receipt names the as-of moment of the closure reading', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run184b-'))
  try {
    const entry = await import(pathToFileURL(ENTRY).href)
    const b = await boots(entry)(dir, {})
    for (const h of [
      { id: 'r-acad', slot: 'chair', institution: 'math' },
      { id: 'r-1', slot: 'member', institution: 'math' },
    ]) {
      try { await b.K.members.hire(h) } catch (e) { ok(false, 'hire ' + h.id, String(e && e.message)) }
    }
    const opened = await b.call('vibe_v5_meeting', { type: 'ordinary', member: 'r-acad', agenda: 'RUN 184 §2' })
    // The convene receipt carries the meeting id in `meeting` (a plain string), not in `id`:
    // the office face answered with a receipt whose `id` was never there, and a test that
    // guessed `id` would blame the mechanism for its own wrong guess.
    const mid = opened && (typeof opened.meeting === 'string' ? opened.meeting : (opened.id || (opened.meeting && opened.meeting.id)))
    ok(!!mid && typeof mid === 'string', '§2a the meeting was convened and its id read from `meeting`', opened)
    const closed = await b.call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'RUN 184 §2' })
    ok(closed && closed.ok !== false, '§2b the close succeeded', closed)
    ok('closureVoteAsOf' in closed, '§2c the receipt names the instant (not just the numbers)', closed)
    has(JSON.stringify(closed.closureVoteAsOfMeans || ''), 'does NOT freeze the reading',
      '§2d and says in words that the close does not freeze it')
    has(JSON.stringify(closed.closureVoteNote || ''), 'Closing does NOT freeze this reading',
      '§2e the note itself carries the sentence, so a reader who skips the extra field still meets it')
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})
