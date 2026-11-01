// ★ RUN 182 — the run's twenty-eighth reading (run 27 / FEEDBACK27): four receipts that answered something
// narrower than what they were asked.
//   F27-1 A VOTE THAT VANISHED WITHOUT A WORD. The chair's turn carried `vote_solved`, the receipt listed the field
//        among `fields`, and `executed:0`/`effects:[]` said nothing happened: the vote tool was visible that turn, so
//        the reply field is (by design) not executed — but the receipt never SAID the field was dropped. Every turn
//        receipt now carries `fieldsIgnored:[{field, reason}]` for exactly the bookkeeping fields it did not keep.
//   F27-2 THE PROSE WAS NOT READ. `evidence:["rec-99999"]` was refused, yet the same id written into the part's prose
//        was accepted (`ok:true`) — the prose pointer scan only understood member-file paths. Bare `rec-N` ids are now
//        scanned too, so a made-up card in the text is refused by name.
//   F27-3 A REFUSAL WITH NO NEIGHBOUR. `EVIDENCE_MISSING` for an unknown id said what to do and never what exists:
//        the three closest ids by number are now listed.
//   F27-4 `n` COUNTED SIGNATURES, NOT BALLOTS. `verdict_final` answered `n:2` while one card was on disk (the other
//        seat's judgement was chair-typed): the receipt now splits `sources.submitted` from `sources.typed`.
//   F27-5 A HINT THAT WALKED INTO A WALL. A temp seat's `speak` refusal said «attend() first» — and `attend` refuses
//        that same seat. A declared non-attending seat is now told the channel that actually exists (the chat face).
//   F27-8 THE BUDGET WALL SENT PEOPLE TO A DOOR WITHOUT A HANDLE. `VMU_RESOURCE_BUDGET` on a SERVICE meeting offered
//        `lapse`, which `VMU_REGISTRY_BOUNDARY` refuses there; the reachable settle is `close`.
//   F27-10 WHAT CAN I DO FROM HERE is now stated up front: `paper status` carries `reachableMoves` per stage.
// §0 is the source-side reading; §1–§3 are answered by this entry.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const MEETINGS = join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')
const QUALITY = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const turnSource = await readFile(TURN, 'utf8')
const meetingsSource = await readFile(MEETINGS, 'utf8')
const qualitySource = await readFile(QUALITY, 'utf8')
const toolsSource = await readFile(TOOLS, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r182-')); roots.push(d); return d }

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
const bodyOf = (receipt) => (receipt && receipt.parsed ? receipt.parsed : null)

try {
  // ── §0 THE SOURCE-SIDE READING ──
  {
    console.log('§0 each repair is a named shape in the source (a pass cannot come from a coincidence)')
    ok(/const fieldsIgnoredOf = \(r\) =>/.test(turnSource) && turnSource.includes('FIELDS_IGNORED_MEANS'),
      '§0a a turn receipt can say WHICH bookkeeping field it dropped, and why')
    ok(/receipt: \{ round: r\.turn\.round, member: spec\.member, fields: r\.fields, fieldsIgnored: fieldsIgnoredOf\(r\)/.test(turnSource),
      '§0b every step/drive receipt carries fieldsIgnored')
    ok(qualitySource.includes('matchAll(/\\brec-[0-9]+\\b/g)'),
      '§0c a bare rec-N id written in the prose is scanned like a member-file pointer')
    ok(qualitySource.includes('closest') && /closestMeans/.test(qualitySource),
      '§0d an unknown evidence id names its closest neighbours')
    ok(/sources: \{ n: ruled\.n/.test(toolsSource),
      '§0e a verdict receipt splits ballots from signatures')
    ok(/reachableMoves: \(\(\) => \{/.test(toolsSource) && toolsSource.includes('part{member,body}'),
      '§0f the paper status says which moves this stage actually has')
    ok(meetingsSource.includes('deniedSeat') && meetingsSource.includes('serviceMeeting'),
      '§0g a temp seat and a service meeting are told the door that exists')
  }

  // ── §1 F27-1: a dropped reply vote is now stated, and a visible vote tool is what causes the drop ──
  {
    console.log('§1 F27-1 a reply vote the turn did not keep is named in the receipt (never silently lost)')
    const root = await mkRoot()
    const b = await boot(root)
    b.K.members.hire({ id: 'r-1', slot: 'member' })
    b.K.turn.setVisibleToolsProvider(() => ['vibe_vmu_vote', 'vibe_vmu_turn'])
    const opened = b.K.turn.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1 })
    await b.K.turn.assemble(opened.turn)
    const done = await b.K.turn.apply({ say: '我同意', vote_solved: true }, null, 'r-1')
    const bk = Array.isArray(done.bookkeeping) ? done.bookkeeping : []
    const dropped = bk.find((x) => x && x.field === 'vote_solved')
    ok(!!dropped && dropped.kept === false, '§1a the receipt keeps a record of the field it did not execute', bk)
    ok(typeof dropped.reason === 'string' && dropped.reason.indexOf('vibe_vmu_vote') !== -1,
      '§1b the reason names the tool that WOULD have cast it', dropped && dropped.reason)
    ok((done.effects || []).length === 0, '§1c nothing was executed behind the member\'s back', done.effects)
    const cv = b.K.turn.status().closureVote
    ok(cv && cv.votesCast === 0, '§1d no closure vote was invented for a turn that only wrote prose', cv && cv.votesCast)
  }
  {
    console.log('§1e the same reply field DOES cast a vote when the vote tool was not offered (control)')
    const root = await mkRoot()
    const b = await boot(root)
    b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = b.K.turn.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1 })
    await b.K.turn.assemble(opened.turn)
    const done = await b.K.turn.apply({ say: '我同意', vote_solved: true }, null, 'r-1')
    const eff = done.effects || []
    ok(eff.some((e) => e && e.kind === 'closure-vote' && e.solved === true),
      '§1f without a visible vote tool the reply field is executed', eff)
    ok(Array.isArray(done.bookkeeping) && done.bookkeeping.length > 0 && done.bookkeeping.every((x) => !x || x.kept !== false), '§1g nothing is reported as dropped (the field was KEPT)', done.bookkeeping)
  }

  // ── §2 F27-2: a made-up card id in the PROSE is refused, exactly like one in `evidence` ──
  {
    console.log('§2 F27-2 the prose is read: a bare rec-N id that does not exist cannot reach a paper')
    const root = await mkRoot()
    const b = await boot(root)
    b.K.members.hire({ id: 'r-1', slot: 'member' })
    b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    const real = b.K.records.put({ track: 'propositions', kind: 'proposition', title: 'run182-real', body: '- statement：一个真实命题', settled: true, by: 'r-acad' })
    const started = bodyOf(await call(b, 'vibe_v5_paper', { action: 'start', target: 'run182-prose', title: 'run182 prose', participants: ['r-1'] }, { agent: { id: 'r-acad' } }))
    ok(!!started && started.ok !== false, '§2a the paper started', started)
    const bad = await call(b, 'vibe_v5_paper', {
      action: 'part', target: 'run182-prose', member: 'r-1',
      evidence: [real.id],
      body: '本节讨论 rec-99999 的最小反例，然后引用 ' + real.id + '。',
    }, { agent: { id: 'r-1' } })
    const badBody = bodyOf(bad) || bad
    ok(badBody && badBody.ok === false && badBody.code === 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
      '§2b a one-off id invented in the prose is refused by name', badBody)
    const msg = String((badBody && badBody.message) || '')
    ok(msg.indexOf('rec-99999') !== -1, '§2c the refusal quotes the id it could not find', msg.slice(0, 300))
    const good = await call(b, 'vibe_v5_paper', {
      action: 'part', target: 'run182-prose', member: 'r-1',
      evidence: [real.id],
      body: '本节讨论 ' + real.id + ' 的最小反例。',
    }, { agent: { id: 'r-1' } })
    const goodBody = bodyOf(good) || good
    ok(goodBody && goodBody.ok !== false, '§2d the same prose with a real id is accepted', goodBody)
  }

  // ── §3 F27-10: reachableMoves names the moves this stage has ──
  {
    console.log('§3 F27-10 a paper says which moves it has, instead of leaving it to a refusal to teach')
    const root = await mkRoot()
    const b = await boot(root)
    b.K.members.hire({ id: 'r-1', slot: 'member' })
    b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await call(b, 'vibe_v5_paper', { action: 'start', target: 'run182-moves', title: 'run182 moves', participants: ['r-1'] }, { agent: { id: 'r-acad' } })
    const st = bodyOf(await call(b, 'vibe_v5_paper', { action: 'status', target: 'run182-moves' }, { agent: { id: 'r-acad' } }))
    const rm = st && st.reachableMoves
    ok(!!rm && Array.isArray(rm.moves) && rm.moves.some((m) => String(m).startsWith('part')),
      '§3a a draft paper names `part` as reachable', rm)
    ok(!!rm && typeof rm.means === 'string' && rm.means.length > 0, '§3b and says what the list means', rm && rm.means)
    ok(!rm.moves.some((m) => String(m).startsWith('review')), '§3c a draft cannot review (the list is stage-specific)', rm && rm.moves)
  }
} catch (e) {
  failed++
  console.error('  FAIL test crashed - ' + (e && e.stack ? e.stack : e))
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch {} }
  console.log('\n' + passed + ' passed / ' + failed + ' failed')
  if (failed > 0) process.exitCode = 1
}
