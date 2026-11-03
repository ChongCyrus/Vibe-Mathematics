// RUN 205 — run 43 / FEEDBACK42: five readings that answered a narrower question than the caller could act on.
//
// 1.3  `paper start { participants: ["r-1","r-2","r-3"] }` was ACCEPTED while the roster held no r-3, and a part was
//      later authored by that id (run 43's rec-69): a participant list is a claim about who writes, unchecked.
// 1.4  advancing to `reviewing` silently closed the writing door, so a participant who had not written yet had to
//      bounce the paper (review(false) + advance, round 1 → 3) to reopen it: the lock-out was never named.
// 2.5  `moved:true` sat beside `roundMoved:false` with the explanation buried in a long `roundMeans` string.
// 2.4  the final receipt's `pdf` block dropped `recordId` although the compiler returned it (readable only from
//      `status.pdfCompiled`).
// 2.3  `sections` (the outline) and `status.parts` (what was written) shared one word and never said which is which.
// 1.5  every blueprint `authors[].seat` was null while `codesignMeans` claimed adoption needs a chair author AND a
//      member author — the check read a field nobody wrote.
// 1.6  a task brief asked the blueprint reading for `nodes`/`count`; the blueprint is prose and the receipt was silent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PAPER_KIT = read('vibe-math-vmu/kit/paper.js')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const blockOf = (r, key) => (r && r[key]) || r

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { call, handle }
}
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run205-'))

async function hire(handle, rows) {
  for (const [id, slot] of rows) await handle.kernel.members.hire({ id, slot, institution: 'sim' })
}
async function card(call, tag) {
  const c = await call('vibe_v5_record_proposition', {
    statement: 'run205 ' + tag + ' 命题：a+b=b+a', value: 1, motive: '交换律', p: 0.9, member: 'r-1',
  })
  ok(c.ok === true, 'premise: a card exists for evidence (' + tag + ')', c)
  return c.recordId
}

test('RUN 205 §0 — every repair is on the source it belongs to (source pins)', () => {
  has(PAPER_KIT, 'writing participants that are NOT on the roster', '§0a ★★ a participant list is checked against the roster')
  has(PAPER_KIT, 'const startRoster = rosterOf()', '§0b ★ and an empty roster has nothing to check instead of failing')
  has(PAPER_KIT, 'partsLockedAfterMove', '§0c ★★ the move that closes writing names who it locks out')
  has(PAPER_KIT, 'NOT written a part yet', '§0d ★ in words, with the repair')
  ok((PAPER_KIT.match(/stageMoved: true/g) || []).length >= 5, '§0e ★★ every moving branch answers stageMoved beside moved',
    (PAPER_KIT.match(/stageMoved: true/g) || []).length)
  has(PAPER_KIT, 'stageMoved: false', '§0f ★ and the non-moving branch says so too')
  has(PACK, 'recordIdMeans', '§0g ★★ the final/compile pdf block carries the row id it wrote')
  has(PACK, 'sectionsMeans', '§0h ★★ the outline reading says it is not the written parts')
  has(PACK, 'const authorSeatRow = seatOfMemberId', '§0i ★★ a blueprint author\'s seat comes from the roster')
  has(PACK, 'nodesMeans', '§0j ★★ the blueprint reading says it indexes no nodes')
})

test('RUN 205 §1 — a paper cannot be staffed by members who are not on the roster', async () => {
  const dir = tmp()
  try {
    const { call, handle } = await assemble(dir)
    await hire(handle, [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']])
    const refused = await call('vibe_v5_paper', { action: 'start', target: 'run205-roster', participants: ['r-1', 'r-2', 'r-3'] })
    ok(refused.ok === false, '§1a ★★ start refuses a participant the roster does not hold (it used to accept it)', refused)
    ok(String(refused.code || '') === 'VMU_NO_SUCH_OBJECT', '§1b ★ by name', refused)
    has(String(refused.message || ''), 'r-3', '§1c ★★ and names the unknown participant')
    has(String(refused.hint || ''), 'r-acad', '§1d ★ the hint lists the roster ids (and their slots)')
    const unknown = (refused.unknown || [])
    ok(unknown.length === 1 && String(unknown[0]) === 'r-3', '§1e ★ the machine-readable list carries exactly the unknown id', refused.unknown)
    const started = await call('vibe_v5_paper', { action: 'start', target: 'run205-roster', participants: ['r-1', 'r-2'] })
    ok(started.ok === true, '§1f the same paper starts once the names are real', started)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 205 §2 — the move that closes writing says who it locks out, and every move names its stage', async () => {
  const dir = tmp()
  try {
    const { call, handle } = await assemble(dir)
    await hire(handle, [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']])
    const target = 'run205-lock'
    const started = await call('vibe_v5_paper', { action: 'start', target, participants: ['r-1', 'r-2'] })
    ok(started.ok === true, 'premise: the paper started', started)
    const rec = await card(call, 'lockout')
    const part = await call('vibe_v5_paper', { action: 'part', target, part: 'p1', body: '第一节', evidence: [rec], member: 'r-1' })
    ok(part.ok === true, 'premise: only r-1 has written a part', part)
    const moved = blockOf(await call('vibe_v5_paper', { action: 'advance', target }), 'advance')
    ok(moved.moved === true && moved.to === 'reviewing', '§2a the paper moved to reviewing', moved)
    ok(moved.stageMoved === true, '§2b ★★ the moving receipt answers stageMoved beside moved', moved)
    ok(Array.isArray(moved.partsLockedAfterMove) && moved.partsLockedAfterMove.length === 1
      && String(moved.partsLockedAfterMove[0]) === 'r-2',
      '§2c ★★ the receipt names the participant this move locks out of writing', moved.partsLockedAfterMove)
    has(moved.partsLockedAfterMoveMeans, 'NOT written a part yet', '§2d ★ in words')
    // RUN 208 (run 45 / FEEDBACK44 2.5): the receipt used to name `review({ decision: false })` — a call `review`
    // REFUSES — so the repair it named was a dead end. The repair must be a call that works: `deliverable:false`.
    has(moved.partsLockedAfterMoveMeans, 'review({ deliverable: false })', '§2e ★ and names the repair that reopens writing')
    const reviewOf = moved.reviewOf || {}
    const back = blockOf(await call('vibe_v5_paper', {
      action: 'review', target, member: 'r-2', of: reviewOf['r-2'], deliverable: false, comments: '第二节还没写',
    }), 'review')
    ok(back.ok === true, 'premise: r-2 files a not-deliverable review so the paper bounces', back)
    const bounced = blockOf(await call('vibe_v5_paper', { action: 'advance', target }), 'advance')
    ok(bounced.moved === true && bounced.to === 'writing', '§2f the paper bounced back to writing', bounced)
    ok(bounced.stageMoved === true, '§2g ★ the bounce also answers stageMoved', bounced)
    const second = await call('vibe_v5_paper', { action: 'part', target, part: 'p2', body: '第二节', evidence: [rec], member: 'r-2' })
    ok(second.ok === true, '§2h ★ the locked-out participant can write once writing is reopened', second)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 205 §3 — the outline reading says it is not the written parts', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    const sections = await call('vibe_v5_paper', { action: 'sections' })
    ok(sections.ok === true && Array.isArray(sections.sections) && sections.sections.length > 0, '§3a premise: the outline is readable', sections)
    has(sections.sectionsMeans, 'OUTLINE', '§3b ★★ the reading says these are the outline sections')
    has(sections.sectionsMeans, 'status.parts', '§3c ★ and points at the reading that answers "what has been written"')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 205 §4 — a blueprint author\'s seat is recorded, and the blueprint says it indexes no nodes', async () => {
  const dir = tmp()
  try {
    const { call, handle } = await assemble(dir)
    await hire(handle, [['r-acad', 'chair'], ['r-1', 'member']])
    const first = await call('vibe_v5_blueprint', { action: 'propose', member: 'r-acad', text: '# 蓝图\n\n一、目标：把命题的证明拆成可验证的步骤。' })
    ok(first.ok === true, 'premise: the chair proposes', first)
    const authors1 = first.authors || []
    const chair = authors1.filter((a) => String(a.member) === 'r-acad')[0] || null
    ok(chair !== null, '§4a premise: the proposer is an author', authors1)
    ok(String(chair.seat || '') === 'chair', '§4b ★★ the chair author\'s seat is recorded from the roster (was always null)', chair)
    const second = await call('vibe_v5_blueprint', { action: 'propose', member: 'r-1', text: '## 共同设计补充\n\n二、可行性：先写引理。' })
    ok(second.ok === true, 'premise: a member continues the same draft', second)
    const member = (second.authors || []).filter((a) => String(a.member) === 'r-1')[0] || null
    ok(member !== null, '§4c premise: the member is recorded as an author', second.authors)
    ok(String(member.seat || '') === 'member', '§4d ★★ the member author\'s seat is recorded too', member)
    const state = await call('vibe_v5_blueprint', { action: 'state' })
    ok(state.ok !== false, 'premise: the state reading answers', state)
    ok(state.nodes === null, '§4e ★★ the blueprint reading says nodes is null (prose, not a node table)', state)
    has(state.nodesMeans, 'PROSE', '§4f ★ and why, instead of leaving the caller to guess')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
