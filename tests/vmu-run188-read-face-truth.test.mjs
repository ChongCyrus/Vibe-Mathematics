// RUN 188 (run 33 / FEEDBACK32): THREE PLACES WHERE A READ FACE PROMISED MORE THAN ITS WRITE FACE ACCEPTED.
//
// ② `reachableMoves` listed `final{decision:"revise"}` from `writing` and `reviewing`, and both are refused by
//    `recordFinal` (its gate is `awaiting-editor`, plus the pdf-less-final repair). A list of "reachable" moves that the
//    state refuses is worse than no list: run 33's office tried the listed move and read the refusal as a bug in itself.
// ④ closing an ALREADY-CLOSED meeting answered `VMU_NO_SUCH_OBJECT` — the same id `status`/`summary` read one call
//    earlier. Two different facts ("never existed" / "already closed") had one answer.
// ③ a member wrote its card to `Members/<m>/Propos/<name>.md` as instructed, cited that path in `part.evidence`, and got
//    "no record with this id" with no sentence saying why a path that exists is not an id.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
const MEETING = readFileSync(join(ROOT, 'vibe-math-vmu', 'tools', 'meeting.js'), 'utf8')
const QUALITY = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

test('RUN 188 §0 — the three repairs are in the source where the receipts are built', () => {
  has(TOOLS, "const moves = status === 'writing' ? ['part{member,body}', 'advance']",
    '§0a a draft no longer advertises a move its own state refuses')
  has(TOOLS, "const moves = status === 'writing'", '§0b the state machine is read, not assumed')
  has(TOOLS, 'pdfLessFinalRepair: pdfLess', '§0c the one exception is named as an exception')
  ok(TOOLS.includes("it is NOT accepted here") && TOOLS.includes('means advancing first'),
    '§0d and the sentence says WHERE the door is')
  has(MEETING, 'is already CLOSED and archived', '§0e a closed meeting is not "no such object"')
  has(MEETING, "refused('VMU_STATE',", '§0f the refusal carries a state code, not an object code')
  has(MEETING, 'the frozen row for this meeting is ', '§0g and points at the account it froze')
  has(QUALITY, 'fileCardHint', '§0h the file-card pointer is named as a fact on the refusal')
  has(QUALITY, '文件卡', '§0i in the language the member reads, not only in code')
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

test('RUN 188 §1 — a paper in `writing`/`reviewing` does not list the move that its own state refuses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run188-'))
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
    const started = await b.call('vibe_v5_paper', { action: 'start', target: 'paper-p1', member: 'r-acad', title: 'RUN 188 可达动作', participants: ['r-1', 'r-2'] })
    const inner = started && started.started ? started.started : started
    ok(inner && inner.ok !== false, '§1a the paper started', started)

    const st = await b.call('vibe_v5_paper', { action: 'status', target: 'paper-p1' })
    ok(st && st.ok === true, '§1b status answers', st && st.code)
    const mv = st.reachableMoves
    ok(mv && mv.status === 'writing', '§1c the paper is in writing', mv && mv.status)
    ok(mv.moves.includes('part{member,body}') && mv.moves.includes('advance'), '§1d the moves writing accepts are listed', mv.moves)
    ok(!mv.moves.some((m) => String(m).includes('revise')),
      '§1e ★ and `final{decision:"revise"}` is NOT listed — the state refuses it from here', mv.moves)

    // the refusal must be what the list said: prove the move really is refused from `writing`
    const tryRevise = await b.call('vibe_v5_paper', { action: 'final', target: 'paper-p1', member: 'r-acad', decision: 'revise', note: 'RUN 188' })
    ok(tryRevise && tryRevise.ok === false, '§1f §1e was the truth: revise is refused from writing', tryRevise)

    has(mv.means, 'NOT accepted here', '§1g and the means says so in words')
    has(mv.means, 'advancing first', '§1h and names the way to reach it')
    ok(mv.pdfLessFinalRepair === false, '§1i the exception flag is false for a non-finalised paper', mv.pdfLessFinalRepair)
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

test('RUN 188 §2 — closing a closed meeting says "already closed", not "no such object"', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run188b-'))
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
    const opened = await b.call('vibe_v5_meeting', { type: 'ordinary', member: 'r-acad', agenda: 'RUN 188 关会两次' })
    const mid = opened && typeof opened.meeting === 'string' ? opened.meeting : null
    ok(!!mid, '§2a a meeting was convened', opened)
    await b.call('vibe_vmu_vote', { member: 'r-acad', solved: true })
    await b.call('vibe_vmu_vote', { member: 'r-1', solved: true })
    const first = await b.call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'RUN 188 一' })
    ok(first && first.ok === true, '§2b the first close succeeded', first)

    const again = await b.call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'RUN 188 二' })
    ok(again && again.ok === false, '§2c the second close is refused', again)
    ok(again.code === 'VMU_STATE', '§2d ★ with a STATE code — the meeting exists and is closed', again && again.code)
    has(String(again.message), 'already CLOSED and archived', '§2e and a message that says which fact is true')
    has(String(again.hint), 'action: "summary"', '§2f the repair is the face that DOES read it back')
    has(String(again.hint), 'closure-account', '§2g and the frozen account door')

    // a genuinely unknown id must still be an object error: the two facts stay distinguishable
    const never = await b.call('vibe_vmu_meeting', { action: 'close', id: 'm-never-existed', actor: 'r-acad', reason: 'x' })
    ok(never && never.code === 'VMU_NO_SUCH_OBJECT', '§2h an id that never existed is still VMU_NO_SUCH_OBJECT', never && never.code)
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

test('RUN 188 §3 — a file card cited as evidence is named as a file card, not as a missing id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run188c-'))
  try {
    const entry = await import(pathToFileURL(ENTRY).href)
    const b = await boots(entry)(dir, {})
    for (const h of [
      { id: 'r-acad', slot: 'chair', institution: 'math' },
      { id: 'r-1', slot: 'member', institution: 'math' },
    ]) {
      try { await b.K.members.hire(h) } catch (e) { ok(false, 'hire ' + h.id, String(e && e.message)) }
    }
    await b.call('vibe_v5_paper', { action: 'start', target: 'paper-p1', member: 'r-acad', title: 'RUN 188 文件卡', participants: ['r-1'] })
    // the exact shape run 33 produced: the member wrote a card to disk and cited the FILE, inside its part prose
    const part = await b.call('vibe_v5_paper', {
      action: 'part', target: 'paper-p1', member: 'r-1',
      body: '构造见 VibeMath/Members/r-1/Propos/run33-lemma.md 。',
      evidence: ['VibeMath/Members/r-1/Propos/run33-lemma.md'],
    })
    ok(part && part.ok === false, '§3a the write is refused (a file card is not a records row)', part)
    ok(part.code === 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN' || part.code === 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING',
      '§3b with one of the two pointer codes (the evidence list is judged before the prose)', part && part.code)
    ok(String(part.message).includes('文件卡') || String(part.hint).includes('文件卡'),
      '§3c ★ the refusal names the file card as a different face: 文件存在不等于记录库里有一行', { code: part.code, message: part.message, hint: part.hint })
    has(String(part.message), 'Members/', '§3d and quotes the pointer it read')
    has(String(part.hint), 'rec-', '§3e the hint names the conversion to a records id')
    has(String(part.hint), '<record id>', '§3f in the same words the institute uses for records')
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})
