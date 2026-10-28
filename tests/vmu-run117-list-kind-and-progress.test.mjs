// ★ RUN 117 — three readings the run asked for and the faces did not give honestly yet:
//   ① `vibe_vmu_records { action:"list", kind:… }` accepted a parameter and IGNORED it in silence;
//   ② a meeting's recommended procedure had no readable progress (the skeleton was printed once at convene and never
//      again, so "is the debate advancing?" had no answer on any face);
//   ③ a refused p=1 write dropped the routes the gate had already computed.
// Every case is asserted against what the entry REALLY answers here, not against the run's prose.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r117k-')); roots.push(d); return d }

const boot = async (root) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
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
  // ── §1 the list face honours the kind it was given (RUN 117: nine rows of five kinds came back for kind:"proposition")
  {
    console.log('§1 records.list — a kind argument is a filter or a refusal, never a silent no-op')
    const root = await mkRoot()
    const b = await boot(root)
    const face = b.specOf('vibe_vmu_records')
    ok(face !== undefined, 'the entry publishes the generic records face')
    const declared = face && face.parameters && face.parameters.properties ? face.parameters.properties.kind : null
    ok(!!declared, 'the face DECLARES kind (so ignoring it was never a "you did not ask" case)', declared && declared.description)

    await b.K.records.put({ track: 'propositions', kind: 'proposition', title: '卡一', body: '- statement：S' })
    await b.K.records.put({ track: 'progress', kind: 'progress', title: '进展一', body: '进展正文' })
    await b.K.records.put({ track: 'feedback', kind: 'feedback', title: '反馈一', body: '反馈正文' })

    const all = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0 })
    const rowsAll = all.parsed && Array.isArray(all.parsed.records) ? all.parsed.records : []
    ok(rowsAll.length === 3, 'setup: the unfiltered list really returns rows of several kinds', rowsAll.map((r) => r && r.kind))

    const onlyProps = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0, kind: 'proposition' })
    const rowsProps = onlyProps.parsed && Array.isArray(onlyProps.parsed.records) ? onlyProps.parsed.records : []
    ok(rowsProps.length > 0, '① kind:"proposition" returns at least the proposition row', rowsProps.length)
    ok(rowsProps.every((r) => r && r.kind === 'proposition'),
      '①★ every returned row really is that kind (the parameter is honoured, not echoed)', rowsProps.map((r) => r && r.kind))
    ok(onlyProps.parsed && onlyProps.parsed.kindFilter === 'proposition' && typeof onlyProps.parsed.kindFilterMeans === 'string',
      '② the receipt NAMES the filter it applied (so returned < total is never ambiguous)', onlyProps.parsed && { kindFilter: onlyProps.parsed.kindFilter, means: onlyProps.parsed.kindFilterMeans })
    ok(rowsAll.length > 0 && rowsProps.length > 0 && rowsAll.every((r) => r && typeof r.kind === 'string') && rowsProps.length < rowsAll.length,
      '③ the filter actually narrowed the answer (a no-op would return the same count)', { all: rowsAll.length, filtered: rowsProps.length })

    const noKind = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0 })
    ok(noKind.parsed && noKind.parsed.kindFilter === null && Array.isArray(noKind.parsed.records) && noKind.parsed.records.length > 0 && rowsAll.length > 0 && noKind.parsed.records.length === rowsAll.length,
      '④ no kind argument ⇒ no filter, and the receipt says so instead of inventing one', noKind.parsed && { kindFilter: noKind.parsed.kindFilter, returned: noKind.parsed.returned })

    const legacy = await call(b, 'vibe_vmu_records', { action: 'list', limit: 0, kind: 'method' })
    ok(legacy.parsed && Array.isArray(legacy.parsed.records) && legacy.parsed.records.length === 0,
      '⑤ a kind with no rows answers an EMPTY list (not the whole ledger)', legacy.parsed && { returned: legacy.parsed.returned, kindFilter: legacy.parsed.kindFilter })
  }

  // ── §2 the recommended skeleton has a readable progress (E36: "speak → hands/invite" must be readable)
  {
    console.log('§2 meeting views — procedureProgress counts what the floor DID against a skeleton that is not a gate')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    await b.K.members.hire({ id: 'r-2', slot: 'member' })
    const opened = b.K.meetings.open({ type: 'debate', subject: '命题：n+n=2n', chair: 'r-acad', actor: 'r-acad',
      procedure: { procedure: [{ n: 1, title: '陈述' }, { n: 2, title: '质疑' }], binding: 'recommendation', note: '推荐不是门禁' } })
    const meeting = String(opened.meeting || opened.id)
    b.K.meetings.attend({ meeting, member: 'r-1' })
    b.K.meetings.attend({ meeting, member: 'r-2' })
    b.K.meetings.speak({ meeting, member: 'r-1', text: '第一句陈述' })

    const view = b.K.meetings.meetingView({ meeting })
    const prog = view && view.procedureProgress ? view.procedureProgress : null
    ok(!!prog, '① meetingView() reports a procedureProgress object (before this, the skeleton appeared only at convene)', view && Object.keys(view))
    ok(prog && prog.skeletonBinding === 'recommendation', '② it repeats the binding: the skeleton is a RECOMMENDATION, not a gate', prog && prog.skeletonBinding)
    ok(prog && prog.skeletonSteps === 2, '③ it names how many steps the skeleton proposed', prog && prog.skeletonSteps)
    ok(prog && prog.speeches >= 1, '④★ the speech the floor actually made is COUNTED (E36: advancement is readable)', prog && { speeches: prog.speeches, motions: prog.motions, queued: prog.queued, present: prog.present })
    ok(prog && prog.advancing === true, '⑤ advancing is true when something happened', prog && prog.advancing)
    ok(prog && typeof prog.means === 'string' && /RECOMMENDATION/.test(prog.means) && /not a step index/i.test(prog.means),
      '⑥ the field explains that these are COUNTS, not a step index (the framework never holds a meeting to a step)', prog && prog.means)

    const summary = b.K.meetings.summary({ meeting })
    ok(summary && summary.procedureProgress && summary.procedureProgress.speeches >= 1,
      '⑦ the SAME reading is on the summary face (a field on one face only is a fact nobody can read)', summary && summary.procedureProgress)

    const fresh = b.K.meetings.meetingView({ meeting })
    ok(fresh && fresh.procedureProgress && fresh.procedureProgress.motions === 0,
      '⑧ a quiet meeting reports zero counts honestly (0 is a measurement, not a missing field)', fresh && fresh.procedureProgress)
    // ★ LIVE RUN 118 (F-118a): `present` was read as an Array while the quorum reader and `open()` keep a Set — so the
    // same kernel answered `quorum.present: 3` and `procedureProgress.present: 0` about the SAME meeting. One fact, two
    // readers: the assertion below is the invariant, not a magic number.
    const qView = b.K.meetings.quorum({ meeting })
    const qPresent = qView && typeof qView.present === 'number' ? qView.present : -1
    ok(fresh && fresh.procedureProgress && fresh.procedureProgress.present === qPresent && qPresent > 0,
      '⑨★ the presence COUNT agrees with the quorum reader (run 118 read 0 while quorum said 1: a Set read as an Array)',
      fresh && { procedureProgress: fresh.procedureProgress && fresh.procedureProgress.present, quorum: qPresent })
  }

  // ── §3 a refused p=1 write carries the routes the gate computed (ledger B3 promised `p1Routes` on the refusal)
  {
    console.log('§3 p=1 refusal — the gate’s own facts survive into the receipt')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const refused = await call(b, 'vibe_v5_record_proposition', {
      statement: 'n+n=2n', value: '1', motive: '多数决', p: 1, member: 'r-1',
      debate_ruling: { mode: 'majority', value: 1, ballotId: 'b1' } })
    const r = refused.parsed || refused
    ok(r && r.ok === false && r.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
      '① the majority-vote p=1 write is still refused by name', r && r.code)
    ok(Array.isArray(r.p1Routes) && r.p1Routes.length >= 3 && r.p1Routes.includes('debate') && r.p1Routes.includes('literature'),
      '②★ the refusal carries the routes the gate knows (run 113: the receipt had no `p1Routes` key at all)', r && r.p1Routes)
    ok(r.p1Route === null && 'p1Route' in r,
      '③ it also says WHICH route was taken: null, present, never absent', r && { has: 'p1Route' in r, value: r.p1Route })
    ok(r.p1RouteMeans === null || typeof r.p1RouteMeans === 'string',
      '④ the means slot exists too (null is an answer here, not a missing field)', r && typeof r.p1RouteMeans)
    ok(typeof r.hint === 'string' && r.hint.length > 0 && Array.isArray(r.enforced),
      '⑤ the rest of the refusal shape is unchanged (hint + enforced)', r && { hintLen: r.hint && r.hint.length, enforced: r.enforced })
  }
  // ── §4 an unknown action on the HOST face names the PACK face that owns the act (run 118: three identical refusals)
  {
    console.log('§4 unknown actions point at the face that owns the act')
    const root = await mkRoot()
    const b = await boot(root)
    const out = await call(b, 'vibe_vmu_meeting', { action: 'motion', meeting: 'm1', motion: '第 1 条动议' })
    const r = out.parsed || out
    ok(r && r.ok === false && r.code === 'VMU_INVALID_ARGUMENT',
      '① the host face still refuses by name (it does not silently do the act)', r && r.code)
    ok(typeof r.hint === 'string' && r.hint.indexOf('vibe_v5_motion') >= 0,
      '②★ its hint NAMES the pack face that owns the act (run 118 pointed at the docs only)', r && r.hint)
    ok(/own PACK face|another face/.test(String(r.message)),
      '③ the message says the act is not missing, it lives elsewhere', r && r.message)
  }
} finally {
  for (const d of roots) { try { await rm(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch {} }
}

console.log('\n=== RUN 117 LIST/KIND + PROCEDURE PROGRESS + P1 REFUSAL: passed=' + passed + ' failed=' + failed + ' ===')
if (failed > 0) process.exit(1)
