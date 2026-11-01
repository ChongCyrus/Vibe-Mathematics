// RUN 189 (run 34 / FEEDBACK33): SIX PLACES WHERE THE INSTITUTE KNEW A FACT AND NO FACE SAID IT.
//
// 1.1 `wakes` was a roster counter that nothing incremented: run 34 measured 11 turns over four seats while every roster
//     row still read `wakes: 0` — a number on a read face that no write face maintains.
// 1.3 `requiredLine` existed only inside a FAILED `final` refusal; a writer had to fail to learn what to paste.
// 1.4 `status.warnings` printed a round-1 disagreement as if it described round 3, next to two `deliverable:true` reviews
//     of the same round: history read as a verdict.
// 1.6 `close` froze the tally into a durable row and then the meeting's own `summary` did not point at that row.
// 1.7 `type` (debate/closure) and `kind` (always `sync`) sat side by side with different jobs and no sentence saying so.
// 2.5 the closure skeleton's step 3 taught `vibe_v5_poll_*`, while the tally `close` reports is written by `vibe_vmu_vote`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
const MEMBERS = readFileSync(join(ROOT, 'vibe-math-vmu', 'kernel', 'members.js'), 'utf8')
const TURN = readFileSync(join(ROOT, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
const KERNEL = readFileSync(join(ROOT, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
const MEETING = readFileSync(join(ROOT, 'vibe-math-vmu', 'tools', 'meeting.js'), 'utf8')
const QUALITY = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')
const PAPER = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js'), 'utf8')
const KITPAPER = readFileSync(join(ROOT, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
const PROCEDURES = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'meeting-procedures.js'), 'utf8')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

test('RUN 189 §0 — the six repairs are in the source where the read faces are built', () => {
  // 1.1 the counter has a writer, and the turn orchestrator calls it on every turn open
  has(MEMBERS, 'return { ok: true, id: String(id), wakes: m.wakes }', '§0a there is a writer for wakes')
  has(TURN, 'onTurnOpen', '§0b the turn orchestrator announces a turn open')
  has(KERNEL, 'members.noteWake(', '§0c and the kernel wires that announcement to the roster counter')
  // 1.3 the requirement is a READ face, not only a refusal
  has(QUALITY, 'export function verifiedRequirements', '§0d required lines have their own reader')
  has(PAPER, 'flow.requiredLines', '§0e the paper flow exposes it')
  has(TOOLS, 'requiredLines:', '§0f and `paper status` prints it')
  // 1.4 history is labelled as history
  has(KITPAPER, 'forcedAfterCapRound: state.forcedAfterCapRound', '§0g the forced round is recorded on the meta a reader gets')
  has(KITPAPER, "state.forcedAfterCapRound = state.round", '§0h with the round it happened in')
  has(TOOLS, 'warningsMeans', '§0i and status says how to read the list')
  // 1.6 the meeting's own summary points at the frozen account
  has(MEETING, 'closureAccount', '§0j the summary carries the pointer')
  has(KERNEL, 'closureFreezeView', '§0k backed by the reader added in RUN 187')
  // 1.7 type and kind are told apart
  has(TOOLS, 'typeMeans', '§0l the two words are explained')
  has(TOOLS, 'kindIsLabelOnly: true', '§0m and kind is named as a label')
  // 2.5 the skeleton votes where the tally is actually written
  has(PROCEDURES, "step(3, 'take-the-vote', 'vibe_vmu_vote',", '§0n the closure skeleton votes on the real board')
  has(PROCEDURES, '不计入', '§0o and says the poll board does not count')
})

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
      let raw = null
      try { raw = await spec.execute(args || {}, exec) } catch (e) {
        raw = { ok: false, code: e && e.code, message: e && e.message, hint: e && e.hint }
      }
      return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
    }
    return { handle, K: handle.kernel, specOf, call, state }
  }
}

async function institute(dir, settings = {}) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const b = await boots(entry)(dir, settings)
  for (const h of [
    { id: 'r-acad', slot: 'chair', institution: 'math' },
    { id: 'r-1', slot: 'member', institution: 'math' },
    { id: 'r-2', slot: 'member', institution: 'math' },
  ]) {
    try { await b.K.members.hire(h) } catch (e) { ok(false, 'hire ' + h.id, String(e && e.message)) }
  }
  return b
}

test('RUN 189 §1 — the roster counts wakes, and the meeting summary points at the account its close froze', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run189-'))
  try {
    const b = await institute(dir)
    // 1.1 — the counter moves when the turn orchestrator opens a turn, not only when someone calls the writer directly
    const before = await b.call('vibe_vmu_control', { action: 'roster' })
    ok(before && before.ok === true, '§1a roster answers', before && before.code)
    const rowBefore = (before.members || before.roster || []).filter((m) => m && m.id === 'r-1')[0]
    ok(!!rowBefore, '§1b r-1 is on the roster', before)
    ok(rowBefore.wakes === 0, '§1c a seat that has never been woken reads 0', rowBefore)
    b.K.members.noteWake('r-1')
    b.K.members.noteWake('r-1')
    const after = await b.call('vibe_vmu_control', { action: 'roster' })
    const rowAfter = (after.members || after.roster || []).filter((m) => m && m.id === 'r-1')[0]
    ok(rowAfter.wakes === 2, '§1d ★ and it counts: two wakes read 2 (run 34 read 0 after 11 turns)', rowAfter)

    // 1.6 — close freezes, and the meeting's own summary names the frozen row
    const opened = await b.call('vibe_v5_meeting', { type: 'closure', member: 'r-acad', agenda: 'RUN 189 结题', title: 'RUN 189 结题会' })
    const mid = opened && typeof opened.meeting === 'string' ? opened.meeting : null
    ok(!!mid, '§1e a closure meeting was convened', opened)
    const sumBefore = await b.call('vibe_vmu_meeting', { action: 'summary', id: mid })
    ok(sumBefore && sumBefore.ok === true, '§1f summary answers before the close', sumBefore && sumBefore.code)
    ok(sumBefore.closureAccount === null || sumBefore.closureAccount === undefined,
      '§1g no account yet — and the face says so rather than inventing one', sumBefore.closureAccount)
    for (const m of ['r-acad', 'r-1', 'r-2']) await b.call('vibe_vmu_vote', { member: m, solved: true })
    const closed = await b.call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'RUN 189 关会' })
    ok(closed && closed.ok === true, '§1h the close succeeded', closed)
    const frozen = closed.closureVoteFrozen
    ok(frozen && frozen.ok === true, '§1i and it froze the tally', frozen)
    const sumAfter = await b.call('vibe_vmu_meeting', { action: 'summary', id: mid })
    ok(sumAfter && sumAfter.ok === true, '§1j summary answers after the close', sumAfter && sumAfter.code)
    ok(sumAfter.closureAccount && sumAfter.closureAccount.recordId === frozen.recordId,
      '§1k ★ the meeting points at the row its close froze', { account: sumAfter.closureAccount, frozen })
    ok(sumAfter.closureAccount.votesCast === frozen.votesCast && sumAfter.closureAccount.cast === frozen.cast,
      '§1l and the reading it points at is the frozen one', sumAfter.closureAccount)
    has(sumAfter.closureAccountMeans, 'DURABLE', '§1m with a sentence saying the row is durable')
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

test('RUN 189 §2 — `paper status` reads the required lines out, and history is labelled history', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run189b-'))
  try {
    const b = await institute(dir)
    const started = await b.call('vibe_v5_paper', { action: 'start', target: 'paper-p1', member: 'r-acad', title: 'RUN 189 论文', participants: ['r-1', 'r-2'] })
    const inner = started && started.started ? started.started : started
    ok(inner && inner.ok !== false, '§2a the paper started', started)
    const st = await b.call('vibe_v5_paper', { action: 'status', target: 'paper-p1' })
    ok(st && st.ok === true, '§2b status answers', st && st.code)
    // 1.3 — the reader exists on the face a writer actually calls, even when it has nothing to report yet
    ok(!!st.requiredLines, '§2c ★ status carries the required-line reader (run 34 had to fail a `final` to learn one)', st.requiredLines)
    ok(st.requiredLines.ok === true, '§2d it answers ok', st.requiredLines)
    ok(Array.isArray(st.requiredLines.items), '§2e with an items list a caller can loop over', st.requiredLines)
    ok(typeof st.requiredLines.count === 'number', '§2f and a count', st.requiredLines.count)
    ok(typeof st.requiredLines.means === 'string' && st.requiredLines.means.length > 40, '§2g the means says what this list is', st.requiredLines.means)
    has(st.requiredLines.means, 'verbatim', '§2h it says the gate looks for a VERBATIM quote')
    // 1.4 — history is labelled
    ok(typeof st.warningsMeans === 'string' && st.warningsMeans.length > 40, '§2i ★ status says how to read `warnings`', st.warningsMeans)
    has(st.warningsMeans, 'HISTORY', '§2j in one word: history')
    has(st.warningsMeans, 'forcedAfterCapRound', '§2k and names the field that dates it')
    // 1.7 — type and kind
    const opened = await b.call('vibe_v5_meeting', { type: 'ordinary', member: 'r-acad', agenda: 'RUN 189 例会', title: 'RUN 189 例会' })
    ok(opened && opened.ok === true, '§2k a meeting was convened', opened && opened.code)
    ok(opened.kindSource === 'default', '§2l no kind was passed, so the label is a default', opened.kindSource)
    ok(opened.kindIsLabelOnly === true, '§2m ★ and the receipt says the label is a label, not a reading of the meeting', opened.kindIsLabelOnly)
    has(opened.typeMeans, 'PROCEDURE', '§2n the means says what `type` decides')
    has(opened.typeMeans, 'BOARD label', '§2o and what `kind` is')
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})
