// ★ RUN 178 — the run's twenty-fourth reading (run 23 / FEEDBACK23): five readings that disagreed with the thing they
// claimed to describe.
//   F1/D3 `vibe_v5_paper { action: "part" }` scanned `part`/`solution`/`methods`/`rules`/`limits` for fabricated prose
//        pointers but NOT `body` — and `body` is the parameter `recordPart` reads FIRST. A part whose prose lived in
//        `body` (the documented shape) had its made-up `Members/…/not-a-record.md#anchor` accepted in silence, and the
//        paper only failed at `render`, the most expensive possible moment.
//   F2    `closureVoteOf().voters` flipped between two spellings for ONE vote: the durable fold holds every judgement
//        row, so a member who judged the same question twice (earlier session, then now) appeared under whichever row
//        the fold happened to return last. One member, one row: the LATEST judgement wins, and the reading dates itself.
//   F5    `leadershipReading` called an institute leaderless while the prompt policy was naming the seated chair — two
//        readers of one fact, one of them false. The reading now names the SOURCE of the name ('setting'/'seat'/'none').
//   F6    `paper status` printed `editor:"academician"` — a ROLE word — beside ids, with no way to tell a defaulted
//        finaliser from an asked-for one, because the source was never persisted at `start`.
//   Minor `vibe_v5_read_library { track, limit: 0 }` is a COUNT-ONLY read (`total` set, `returned:0`,
//        `truncated:true`) whose hint explained nothing: it told a caller that had already passed the documented
//        minimum to "raise the limit". The reading now names the shape (`countOnly`) and says what to pass for rows.
// Every assertion is made against what this entry REALLY answers; §0 is the source-side reading.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const HOST = join(REPO, 'vibe-math-vmu', 'host.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const LEAD = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'leadership.js')
const KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const { closureVoteOf } = await import(pathToFileURL(TURN).href)
const { leadershipReading, leadershipWarning } = await import(pathToFileURL(LEAD).href)
const { readFile } = await import('node:fs/promises')
const source = await readFile(HOST, 'utf8')
const toolsSource = await readFile(TOOLS, 'utf8')
const leadSource = await readFile(LEAD, 'utf8')
const turnSource = await readFile(TURN, 'utf8')
const kitSource = await readFile(KIT, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r178-')); roots.push(d); return d }

const boot = async (root, settings = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, settings))
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
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

try {
  // ── §0 THE SOURCE-SIDE READING: each fix is a named shape, not a behaviour that happens to pass ──
  {
    console.log('§0 the five fixes are named in the source (a pass cannot come from a coincidence)')
    ok(toolsSource.includes("const proseText = ['part', 'body', 'solution', 'methods', 'rules', 'limits']"),
      '§0a a part\'s prose scan covers `body` — the parameter `recordPart` reads FIRST')
    ok(toolsSource.includes("solution: str(args.body || args.solution || '')") && toolsSource.indexOf('const proseText') < toolsSource.indexOf('solution: str(args.body'),
      '§0b and the scan runs BEFORE that parameter is consumed (the check is where the value is used)')
    ok(leadSource.includes('const leaderIdSource =') && leadSource.includes('charterNamesLeader:'),
      '§0c the leadership reading names the SOURCE of the leader and the claim the warning is about')
    ok(turnSource.includes('votersAsOf:') && turnSource.includes('if (prev && atOf(prev) > atOf(row)) continue'),
      '§0d one row per voter, latest judgement wins, and the reading dates itself')
    ok(kitSource.includes("editorSource: editorGiven ?") && toolsSource.includes('editorReading: (() => {'),
      '§0e the editor word\'s source is persisted at start and read back by status')
    const kitHandlers = await readFile(join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js'), 'utf8')
    ok(kitHandlers.includes('const countOnly = Number.isInteger(limit) && limit === 0') && kitHandlers.includes('countOnlyMeans:'),
      '§0f the count-only read names its own shape instead of promising rows')
  }

  // ── §1 F1: a part whose prose is in `body` is judged at the WRITE, not at the render ──
  {
    console.log('§1 a part\'s `body` is prose too (run 23 F1: the bypass was one missing parameter)')
    const root = await mkRoot()
    const b = await boot(root, { 'vmu.paper.officeConsult': 'off' })
    const card = await call(b, 'vibe_v5_record_proposition', { statement: 'run178 命题', value: 'v', motive: 'm', p: 0.6, member: 'r-1' })
    const cardId = card.parsed && card.parsed.recordId
    ok(typeof cardId === 'string' && cardId.length > 0, '§1 setup: a proposition card exists to cite', card.parsed && card.parsed.code)
    const started = await call(b, 'vibe_v5_paper', { action: 'start', target: 'r178', participants: ['r-1', 'r-2'] })
    ok(started.parsed && started.parsed.ok === true, '§1 setup: the paper starts', started.parsed)
    const badBody = await call(b, 'vibe_v5_paper', {
      action: 'part', target: 'r178', member: 'r-1', part: '1 坏指针',
      body: '证据正本见 Members/r-1/Propos/run178-not-a-record.md#二、不存在的证明。',
    })
    const badBodyCode = badBody.thrown ? badBody.code : (badBody.parsed && badBody.parsed.code)
    ok(badBodyCode === 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
      '§1a a fabricated pointer passed as `body` is REFUSED at the write (it used to be accepted in silence)', badBodyCode)
    const badBodyMsg = badBody.thrown ? badBody.message : (badBody.parsed && badBody.parsed.message)
    const badBodyHint = badBody.thrown ? badBody.hint : (badBody.parsed && badBody.parsed.hint)
    ok(typeof badBodyMsg === 'string' && badBodyMsg.includes('run178-not-a-record') && typeof badBodyHint === 'string' && badBodyHint.includes('记录 id'),
      '§1b the refusal names the fabricated id and teaches the id-based spelling', { message: badBodyMsg, hint: badBodyHint })
    const badSolution = await call(b, 'vibe_v5_paper', {
      action: 'part', target: 'r178', member: 'r-1', part: '1 坏指针（solution）',
      solution: '证据正本见 Members/r-1/Propos/run178-not-a-record.md#二、不存在的证明。',
    })
    const badSolutionCode = badSolution.thrown ? badSolution.code : (badSolution.parsed && badSolution.parsed.code)
    ok(badSolutionCode === 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
      '§1c the SAME text in `solution` is refused too (both prose parameters answer one rule)', badSolutionCode)
    const goodBody = await call(b, 'vibe_v5_paper', {
      action: 'part', target: 'r178', member: 'r-1', part: '1 真指针',
      body: '证据正本见 Members/r-1/Propos/' + cardId + '.md#二、真证明，以及 evidence。',
      evidence: [cardId],
    })
    ok(goodBody.parsed && goodBody.parsed.ok === true && goodBody.parsed.part && typeof goodBody.parsed.part.recordId === 'string',
      '§1d a REAL record id in `body` is accepted (the rule is the pointer\'s target, not the parameter\'s name)',
      goodBody.parsed || goodBody)
  }

  // ── §2 F2: one member, one vote row — the latest judgement, and a dated reading ──
  {
    console.log('§2 `voters` cannot read as two voters for one member (run 23 F2)')
    const roster = [{ id: 'r-acad', slot: 'chair', state: 'active' }, { id: 'r-1', slot: 'member', state: 'active' }, { id: 'r-2', slot: 'member', state: 'active' }]
    const view = closureVoteOf({
      votes: new Map([['r-acad', true], ['r-1', true], ['r-2', true]]),
      roster,
      may: () => true,
      permission: 'vote',
      meetingId: null,
      rows: [
        { member: 'r-1', solved: true, at: 100, session: 'root-A', voterSession: 'child-old' },
        { member: 'r-1', solved: true, at: 300, session: 'root-B', voterSession: 'child-new' },
        { member: 'r-2', solved: true, at: 200, session: 'root-A' },
      ],
    })
    ok(Array.isArray(view.voters) && view.voters.length === 3, '§2a three voters for three members (not four for two members)', view.voters)
    ok(view.voters.includes('r-1@child-new'), '§2b the LATEST judgement of r-1 is the one printed', view.voters)
    ok(!view.voters.includes('r-1@child-old'), '§2c the superseded judgement does not appear beside it as a second voter', view.voters)
    ok(view.voters.includes('r-2@root-A'), '§2d a member with one row keeps that row\'s session', view.voters)
    ok(view.votersAsOf === 300, '§2e the reading dates itself with the newest row it used', view.votersAsOf)
    ok(typeof view.votersMeans === 'string' && view.votersMeans.includes('LATEST'), '§2f and says which row won when two exist', view.votersMeans)
  }

  // ── §3 F5: the charter and the reading agree about who leads ──
  {
    console.log('§3 a seated chair is not a leaderless institute (run 23 F5)')
    const roster = [{ id: 'r-acad', slot: 'chair', state: 'active' }, { id: 'r-1', slot: 'member', state: 'active' }]
    const fallback = leadershipReading({ roster, leaderId: '' })
    ok(fallback.code === 'chair-seated-but-leaderId-empty', '§3a the state is still NAMED (an empty setting is a fact)', fallback.code)
    ok(fallback.effectiveLeaderId === 'r-acad' && fallback.leaderIdSource === 'seat',
      '§3b the seat fallback NAMES who leads and says the name came from the seat', { effective: fallback.effectiveLeaderId, source: fallback.leaderIdSource })
    ok(fallback.charterNamesLeader === true,
      '§3c the charter DOES name a leader (so the old "no academician" claim was false)', fallback.charterNamesLeader)
    const declared = leadershipReading({ roster, leaderId: 'r-acad' })
    ok(declared.leaderIdSource === 'setting' && declared.effectiveLeaderId === 'r-acad' && declared.charterNamesLeader === true,
      '§3d a DECLARED leader is reported as declared', { source: declared.leaderIdSource, effective: declared.effectiveLeaderId })
    const empty = leadershipReading({ roster: [{ id: 'r-1', slot: 'member', state: 'active' }], leaderId: '' })
    ok(empty.leaderIdSource === 'none' && empty.charterNamesLeader === false && empty.effectiveLeaderId === '',
      '§3e with no chair and no setting there is NO leader, and the reading says so', { source: empty.leaderIdSource, effective: empty.effectiveLeaderId })
    const warn = leadershipWarning(fallback)
    ok(warn !== null && typeof warn.message === 'string' && warn.message.includes('falls back'),
      '§3f the warning survives (the setting is still empty) but no longer claims the institute has no academician',
      warn && warn.message)
    ok(warn && warn.next && warn.next.includes('vmu.turn.leaderId'), '§3g and still names the declared write path', warn && warn.next)
  }

  // ── §4 F6: `status` says which editor you are reading, and where the word came from ──
  {
    console.log('§4 the editor word is a ROLE, and status says so (run 23 F6)')
    const root = await mkRoot()
    const b = await boot(root, { 'vmu.paper.officeConsult': 'off' })
    await b.K.members.hire({ id: 'r-acad', slot: 'chair', institution: 'VibeMath' })
    await b.K.members.hire({ id: 'r-1', slot: 'member', institution: 'VibeMath' })
    const defaulted = await call(b, 'vibe_v5_paper', { action: 'start', target: 'r178-editor', participants: ['r-acad', 'r-1'] })
    const startedDefault = defaulted.parsed && defaulted.parsed.started
    ok(startedDefault && startedDefault.editor && startedDefault.editor.value === 'academician' && startedDefault.editor.source === 'default',
      '§4a a paper started without `editor` says the default applied (RUN 175, still true)', startedDefault && startedDefault.editor)
    const st = await call(b, 'vibe_v5_paper', { action: 'status', target: 'r178-editor' })
    const er = st.parsed && st.parsed.editorReading
    ok(er && er.value === 'academician' && er.source === 'default',
      '§4b status reports the same source the start receipt reported (it did not survive before)', er)
    ok(er && er.isRoleWord === true && er.seat === 'r-acad',
      '§4c and says the word is a ROLE while naming the seat that signs it', er && { isRoleWord: er.isRoleWord, seat: er.seat })
    ok(er && typeof er.means === 'string' && er.means.includes('ROLE'), '§4d the means line teaches the difference', er && er.means)
    const normalised = await call(b, 'vibe_v5_paper', { action: 'start', target: 'r178-arg', participants: ['r-acad', 'r-1'], editor: 'r-acad' })
    const st2 = await call(b, 'vibe_v5_paper', { action: 'status', target: 'r178-arg' })
    ok(st2.parsed && st2.parsed.editorReading && st2.parsed.editorReading.value === 'academician' &&
      st2.parsed.editorReading.source === 'argument-normalised',
      '§4e a chair member id is recorded as the normalisation that produced the role word', st2.parsed && st2.parsed.editorReading)
  }

  // ── §5 the minor: `limit:0` is a count-only read, and the reading says which it is ──
  {
    console.log('§5 `limit:0` answers a count, not a page (run 23 minor 2)')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.records.put({ track: 'propositions', kind: 'proposition', title: 'a', body: 'b' })
    await b.K.records.put({ track: 'propositions', kind: 'proposition', title: 'c', body: 'd' })
    const zero = await call(b, 'vibe_v5_read_library', { track: 'propositions', limit: 0 })
    ok(zero.parsed && zero.parsed.countOnly === true && zero.parsed.returned === 0 && zero.parsed.truncated === true && zero.parsed.total === 2,
      '§5a limit:0 answers the count with zero rows, and flags itself as count-only', zero.parsed && { countOnly: zero.parsed.countOnly, total: zero.parsed.total, returned: zero.parsed.returned })
    ok(zero.parsed && typeof zero.parsed.hint === 'string' && zero.parsed.hint.includes('limit:0') && zero.parsed.hint.includes('total=') && zero.parsed.hint.includes('正数 limit'),
      '§5b and its hint says "counts only" and names what to pass for rows', zero.parsed && zero.parsed.hint)
    ok(zero.parsed && typeof zero.parsed.countOnlyMeans === 'string' && zero.parsed.countOnlyMeans.includes('returned'),
      '§5c the meaning is stated beside the flag (a reader does not have to know the kernel)', zero.parsed && zero.parsed.countOnlyMeans)
    const one = await call(b, 'vibe_v5_read_library', { track: 'propositions', limit: 1 })
    ok(one.parsed && one.parsed.countOnly === false && one.parsed.returned === 1,
      '§5d a positive limit still answers rows (the two shapes are distinguishable)', one.parsed && { countOnly: one.parsed.countOnly, returned: one.parsed.returned })
  }
} finally {
  // the kernels keep writing their folds for a tick after the assertions; a temp dir that refuses removal is not a
  // test failure (it is the test's own scratch space), so the cleanup is best-effort and says nothing when it skips.
  for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
if (failed === 0) console.log('=== VMU RUN178 FEEDBACK23 TRUTH: ' + passed + ' passed, 0 failed ===')
else { console.log('=== VMU RUN178 FEEDBACK23 TRUTH: ' + passed + ' passed, ' + failed + ' FAILED ==='); process.exitCode = 1 }
