// RUN 185 (run 32, measured twice in one workspace): A CLOSE NAMED AN INSTANT AND THE ACCOUNT KEPT MOVING.
//
// Run 32 closed `m2` with `closureVote{cast:true, confirmed:true, votesCast:3}`, while member r-2 — its own turn, its
// own kernel — reported that it had voted `solved:false` and read `{for:[r-acad, r-2], against:[r-1], cast:false}`.
// Both readings were true: `closure_votes` is a durable LATEST-WINS key shared by every kernel, so a vote cast after
// the close rewrites the same record. RUN 184 taught the receipt to NAME the instant; naming is not freezing. This
// round writes ONE durable row per close — the reading as of that instant — so "what did the institute decide at
// close" has an answer that a later vote cannot edit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const KERNEL = readFileSync(join(ROOT, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
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

test('RUN 185 §0 — the freeze is a seam on the kernel and a field on the close receipt', () => {
  has(KERNEL, 'freezeClosureVote({ meeting = null, by = null, why = null } = {})',
    '§0a the kernel carries the freeze seam')
  has(KERNEL, "track: 'state',", '§0b the snapshot is a durable ROW on the state track, not a live view')
  has(KERNEL, "'closure-freeze|'", '§0c the row is titled so a reader can find it without parsing bodies')
  has(KERNEL, 'later votes change `vibe_vmu_status { detail: "closure" }` and never this row',
    '§0d the seam says which record moves and which does not')
  has(MEETING, 'const freezeReading = (meetingId, frozenBy, frozenWhy) => {',
    '§0e the meeting face freezes through ONE helper, so both close paths cannot drift')
  has(MEETING, 'closureVoteFrozenMeans', '§0f the receipt explains what the frozen row is')
  has(MEETING, '...freezeReading(pid,', '§0g the service close attaches it (the path run 32 measured)')
  has(MEETING, 'primitiveFreeze', '§0h the primitive close attaches it too')
})

test('RUN 185 §1 — a later vote cannot edit the as-of-close account', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run185-'))
  try {
    const entry = await import(pathToFileURL(ENTRY).href)
    const b = await boots(entry)(dir, {})
    for (const h of [
      { id: 'r-acad', slot: 'chair', institution: 'math' },
      { id: 'r-1', slot: 'member', institution: 'math' },
      { id: 'r-2', slot: 'member', institution: 'math' },
    ]) {
      try { await b.K.members.hire(h) } catch (e) { ok(false, 'hire ' + h.id, String(e && e.message)) }
    }
    const opened = await b.call('vibe_v5_meeting', { type: 'ordinary', member: 'r-acad', agenda: 'RUN 185 冻结' })
    const mid = opened && typeof opened.meeting === 'string' ? opened.meeting : (opened.id || null)
    ok(!!mid, '§1a a service meeting was convened', opened)

    // two of three members judge it solved: the ask is "what did the institute decide AT CLOSE"
    await b.call('vibe_vmu_vote', { member: 'r-acad', solved: true })
    const v2 = await b.call('vibe_vmu_vote', { member: 'r-1', solved: true })
    ok(v2 && v2.closureVote && v2.closureVote.votesCast === 2, '§1b two votes are on the durable key', v2 && v2.closureVote)
    const v3all = await b.call('vibe_vmu_vote', { member: 'r-2', solved: true })
    ok(v3all && v3all.closureVote && v3all.closureVote.cast === true,
      '§1b2 three unanimous votes are the state run 32 closed on', v3all && v3all.closureVote)

    const closed = await b.call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'RUN 185 冻结' })
    ok(closed && closed.ok !== false, '§1c the close succeeded', closed)
    const frozen = closed.closureVoteFrozen
    ok(frozen && frozen.ok === true, '§1d the close froze the reading as a row', frozen)
    ok(typeof frozen.recordId === 'string' && frozen.recordId.length > 0, '§1e the receipt names the row', frozen)
    ok(frozen.votesCast === 3 && frozen.cast === true, '§1f the frozen numbers are the numbers at close', frozen)
    ok(Array.isArray(frozen.missing) && frozen.missing.length === 0, '§1g the frozen reading keeps who was missing (nobody)', frozen)

    // the row is readable on its own, and its body is the snapshot (not a pointer to a live view)
    const row = b.K.records.get({ id: frozen.recordId })
    ok(row && row.ok !== false, '§1h the frozen row is readable', row)
    const body = JSON.parse(row.body)
    ok(body.votesCast === 3 && body.meeting === mid, '§1i the row body carries the snapshot, meeting and all', body)
    ok(Array.isArray(body.voters) && body.voters.length === 3, '§1j and the voters it counted', body.voters)

    // now the vote that run 32 measured: cast AFTER the close. The live reading moves; the row must not.
    const v3 = await b.call('vibe_vmu_vote', { member: 'r-2', solved: false })
    ok(v3 && v3.closureVote && v3.closureVote.votesCast === 3, '§1k the live reading still counts three votes', v3 && v3.closureVote)
    ok(v3.closureVote.cast === false,
      '§1l and the post-close dissent changes the LIVE verdict to not-unanimous', v3 && v3.closureVote)
    const after = b.K.records.get({ id: frozen.recordId })
    const bodyAfter = JSON.parse(after.body)
    ok(bodyAfter.votesCast === 3 && bodyAfter.cast === true,
      '§1m ★ the as-of-close row still says three and unanimously solved — the later dissent cannot edit history', bodyAfter)
    ok(after.rev === row.rev, '§1n the row was not rewritten (same revision)', { before: row.rev, after: after.rev })
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

test('RUN 185 §2 — freezing is bookkeeping: a close with no votes still closes and still freezes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run185b-'))
  try {
    const entry = await import(pathToFileURL(ENTRY).href)
    const b = await boots(entry)(dir, {})
    for (const h of [
      { id: 'r-acad', slot: 'chair', institution: 'math' },
      { id: 'r-1', slot: 'member', institution: 'math' },
    ]) {
      try { await b.K.members.hire(h) } catch (e) { ok(false, 'hire ' + h.id, String(e && e.message)) }
    }
    const opened = await b.call('vibe_v5_meeting', { type: 'ordinary', member: 'r-acad', agenda: 'RUN 185 无票' })
    const mid = opened && typeof opened.meeting === 'string' ? opened.meeting : (opened.id || null)
    const closed = await b.call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'RUN 185 无票' })
    ok(closed && closed.ok !== false, '§2a a meeting with no votes still closes', closed)
    const frozen = closed.closureVoteFrozen
    ok(frozen && frozen.ok === true, '§2b and the freeze still writes its row (an empty reading is a reading)', frozen)
    ok(frozen.votesCast === 0 && frozen.cast === false, '§2c the row says zero votes, not "unknown"', frozen)
    ok(frozen.missing.length >= 1, '§2d and names who was missing', frozen.missing)
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})
