/**
 * tests/vmu-run239-blueprint.test.mjs — RUN 239-B / FEEDBACK62: three READOUT defects of the blueprint face.
 *
 * WHAT THIS SUITE PINS (all mechanism is in `vibe-math-vmu/packs/v5r/blueprint.js`):
 *   ① A CONTINUATION MERGES the outline by id. RUN 236 let a continuation replace it, so the base skeleton `[{id:"1"},
 *      {id:"1.1"}]` vanished from the row when a second designer continued with `[{id:"2"},{id:"2.1"}]` — while BOTH
 *      text sections survived (the text composes, the outline did not). Now: same id = this writer overrides
 *      title/depth, new id is appended, ids only the base had are kept; the receipt prints
 *      `outlineMerged:{added,updated,kept,means}`. A NEW revision (target === null) still takes its outline as given.
 *   ② ONE enum for `outlineSource` on every face: `row` = the outline stored on this row (both `state` and `read` say
 *      `row` for the same revision), `request`/`draft` describe WRITE bank calls, `none` = explicit empty. Both faces
 *      print `outlineSourceMeans`, and the sentence is the same constant.
 *   ③ The md block means ONE thing in every receipt and in `state`: `written` = did THIS call put the canonical file
 *      on disk, `mdPath`/`draftMdPath` = which file this revision actually owns (a DRAFT owns its own file under
 *      `Drafts/` since RUN 248; only `adopt` promotes it to `canonicalPath`), `mdWritten` = is that file on disk now;
 *      plus `mdMeans` saying that `available` (read face usable), `mdWritten` (the file exists) and `written` (this call
 *      wrote) are not the same question. (RUN 239-B pinned `deferredTo`/`writtenNever` here; RUN 248-M2 removed those
 *      names because a draft now writes a file, so the same "each name means exactly one thing" rule is pinned on the
 *      three names that replaced them.)
 *      With no revision in force, `outlineMeans` says THAT (current:null), not "this revision carried no outline".
 *
 * RULE E: every fixture is asserted to exist before it is judged; refusals are normalised from both shapes (thrown
 * error and serialised `{ok:false}` receipt) so a refusal never passes for a success.
 *
 * Run: node tests/vmu-run239-blueprint.test.mjs
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const VMU = join(REPO, 'vibe-math-vmu')
const T0 = Date.parse('2020-01-01T00:00:00.000Z')

const PATH_MAIN = 'Shared/Protocol.md'
const PATH_FRESH = 'Shared/Fresh.md'
const PATH_DRAFT = 'Shared/DraftOnly.md'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else {
    failed += 1
    failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null
const textOf = (e) => String((e && (typeof e.message === 'string' ? e.message : '')) || '')
const hintOf = (e) => (e && typeof e.hint === 'string' ? e.hint : null)

async function boot(config = {}) {
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const root = await mkdtemp(join(__tmpRoot(), 'vmu-r239-'))
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => T0 }, config))
  await handle.ready()
  return { handle, specs, root, specOf: (name) => specs.filter((s) => s.name === name)[0] || null }
}

const BLUEPRINT = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)

const main = await boot({})
const kernel = main.handle.kernel
const spec = main.specOf('vibe_v5_blueprint')
const cleanups = [main]

const call = async (args) => {
  try {
    const raw = await spec.execute(args)
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (parsed && parsed.ok === false) {
      return { ok: false, parsed, code: parsed.code || null, message: String(parsed.message || ''), hint: parsed.hint || null }
    }
    return { ok: true, parsed }
  } catch (e) {
    return { ok: false, err: e, code: codeOf(e), message: textOf(e), hint: hintOf(e) }
  }
}
const attempt = async (fn) => {
  try { return { ok: true, parsed: await fn() } } catch (e) { return { ok: false, err: e, code: codeOf(e), message: textOf(e), hint: hintOf(e) } }
}
// outline nodes are objects ({id,title,depth}); merge sets (added/updated/kept) are PLAIN ID STRINGS — the helper must
// read both, or every merge assertion silently compares "undefined,undefined" against the right ids (RUN 239 first run).
const ids = (list) => (Array.isArray(list) ? list.map((e) => String(e !== null && typeof e === 'object' ? e.id : e)) : [])
const countField = (text, key) => String(text).split('\n').filter((line) => line.indexOf('- ' + key + '：') === 0).length
const node = (id, title, depth) => ({ id, title, depth })

console.log('=== 0. THE SURFACES THIS SUITE DRIVES ARE PUBLISHED ===')
ok(kernel !== null && kernel !== undefined, 'the pack applied and a kernel exists (a null handle would make every assertion vacuous)', kernel === null)
ok(spec !== null && spec !== undefined, 'the blueprint tool is published on the assembled pack', spec ? spec.name : null)
ok(typeof BLUEPRINT.outlineSourceMeansOf === 'function', 'the enum reader is exported (one place defines what outlineSource values mean)', typeof BLUEPRINT.outlineSourceMeansOf)
ok(BLUEPRINT.BLUEPRINT_FIELDS.indexOf(BLUEPRINT.BLUEPRINT_OUTLINE_KEY) >= 0 && BLUEPRINT.BLUEPRINT_FIELDS.indexOf(BLUEPRINT.BLUEPRINT_REASON_KEY) >= 0,
  'the two Run-236 carrier fields are still declared in the append-only field order', BLUEPRINT.BLUEPRINT_FIELDS)
const sourceSentences = ['request', 'draft', 'row', 'none'].map((s) => BLUEPRINT.outlineSourceMeansOf(s))
// RULE E: a non-empty precondition, so "every value has a sentence" cannot pass on an empty list (a reader of four
// values must see four sentences, not zero).
ok(sourceSentences.length === 4 && sourceSentences.every((s) => typeof s === 'string' && s.trim() !== '') && new Set(sourceSentences).size === 4,
  'each outlineSource value has its own non-empty sentence (four values, four different meanings — no two names for one fact)',
  { count: sourceSentences.length, unique: new Set(sourceSentences).size })

await kernel.members.hire({ id: 'acad', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })

console.log('=== 1. A CONTINUATION MERGES THE OUTLINE BY ID (RUN 236 REPLACED IT) ===')
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const p1 = BLUEPRINT.proposeBlueprint({
  records: kernel.records, path: PATH_MAIN, text: '第 1 版正文：先给粗骨架，再补细部。', by: 'r-1', seat: 'member', at: T0,
  outline: [node('1', '总体路线', 1), node('1.1', '第一阶段', 2)], revisionReason: 'RUN 239 的基线', materialize: true,
})
ok(p1 && p1.ok === true && typeof p1.id === 'string', 'fixture: the base revision landed on disk (a row id proves the draft exists)', p1 && p1.id)
ok(ids(p1.outline).join(',') === '1,1.1' && p1.outlineMerged && ids(p1.outlineMerged.added).join(',') === '1,1.1',
  '★ a NEW revision takes its outline as given: outlineMerged.added lists every id it carries (no base to merge with)',
  p1 && { outline: ids(p1.outline), merged: p1.outlineMerged })
ok(p1.outlineMerged && ids(p1.outlineMerged.kept).length === 0 && ids(p1.outlineMerged.updated).length === 0 && /起新 revision|覆盖/.test(String(p1.outlineMerged.means)),
  '★ the merge block says which rule ran (new revision: taken as given), not just counts', p1 && p1.outlineMerged && String(p1.outlineMerged.means).slice(0, 60))

// legacy path: the continuation rewrites the kernel-materialized draft only when materialize:true is explicit
const p2 = BLUEPRINT.proposeBlueprint({
  records: kernel.records, path: PATH_MAIN, draft: p1.id, text: '共同设计：补一条复查节奏。', by: 'acad', seat: 'chair', at: T0 + 1000,
  outline: [node('2', '运行阶段', 1), node('2.1', '复查节奏', 2)], materialize: true,
})
ok(p2 && p2.ok === true && p2.id === p1.id && p2.continued === true, 'fixture: the chair continued the SAME draft (one draft per unadopted revision)', p2 && { id: p2.id, continued: p2.continued })
ok(ids(p2.outline).join(',') === '1,1.1,2,2.1' && p2.outlineCount === 4,
  '★★ THE DEFECT: a continuation with 2/2.1 KEEPS the base 1/1.1 (the row holds four nodes, not two)',
  p2 && { outline: ids(p2.outline), count: p2.outlineCount })
ok(p2.outlineMerged && ids(p2.outlineMerged.added).join(',') === '2,2.1' && ids(p2.outlineMerged.kept).join(',') === '1,1.1' && ids(p2.outlineMerged.updated).length === 0,
  '★ outlineMerged names the three sets: added 2,2.1 / kept 1,1.1 / updated none', p2 && p2.outlineMerged)
ok(/续写/.test(String(p2.outlineMerged && p2.outlineMerged.means)) && /合并/.test(String(p2.outlineMerged && p2.outlineMerged.means)),
  '★ the sentence says this was a merge (a reader does not have to infer the rule from the counts)', p2 && p2.outlineMerged && String(p2.outlineMerged.means).slice(0, 60))
const row2 = kernel.records.get({ id: p1.id })
const parse2 = BLUEPRINT.parseBlueprint(row2)
ok(countField(row2 && row2.body, 'outline') === 1 && ids(parse2.outline).join(',') === '1,1.1,2,2.1',
  '★ the ROW itself now carries all four nodes in one outline line (the merge is on disk, not only in the receipt)',
  { lines: countField(row2 && row2.body, 'outline'), outline: ids(parse2.outline) })

// legacy path: the first proposer's continuation rewrites the kernel-materialized draft only when materialize:true is explicit
const p3 = BLUEPRINT.proposeBlueprint({
  records: kernel.records, path: PATH_MAIN, draft: p1.id, text: '第一提案人修订粗骨架的措辞。', by: 'r-1', seat: 'member', at: T0 + 1500,
  outline: [node('1', '总体路线（修订）', 1)], materialize: true,
})
ok(p3 && p3.ok === true && ids(p3.outlineMerged.updated).join(',') === '1' && ids(p3.outlineMerged.kept).join(',') === '1.1,2,2.1' && ids(p3.outlineMerged.added).length === 0,
  '★ SAME ID under a continuation UPDATES in place: updated 1 / kept 1.1,2,2.1 / added none', p3 && p3.outlineMerged)
ok(p3.outline[0] && p3.outline[0].title === '总体路线（修订）' && p3.outline[0].depth === 1 && p3.outline.length === 4,
  '★ the updated node keeps its position and depth (a merge does not reshuffle the skeleton)', p3 && p3.outline)
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const noOutline = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_MAIN, draft: p1.id, text: '续写但没有重述骨架。', by: 'acad', seat: 'chair', at: T0 + 1800, materialize: true })
ok(ids(noOutline.outline).join(',') === '1,1.1,2,2.1' && ids(noOutline.outlineMerged.kept).join(',') === '1,1.1,2,2.1' && noOutline.outlineSource === 'draft',
  '★ a continuation that passes NO outline keeps every node (kept lists them; source draft says where they came from)',
  noOutline && { outline: ids(noOutline.outline), merged: noOutline.outlineMerged })

console.log('=== 2. THE TWO READ FACES USE ONE outlineSource ENUM AND ONE SENTENCE ===')
const a1 = BLUEPRINT.adoptBlueprint({ records: kernel.records, path: PATH_MAIN, draft: p1.id, by: 'acad', at: T0 + 2000 })
ok(a1 && a1.ok === true && a1.status === 'current' && typeof a1.id === 'string', 'fixture: the co-designed draft was adopted (adoption is the only md writer)', a1 && a1.id)
ok(ids(a1.outline).join(',') === '1,1.1,2,2.1' && a1.outlineSource === 'draft',
  'adoption carries the merged outline forward (4 nodes) and names the source draft', a1 && { outline: ids(a1.outline), source: a1.outlineSource })
const st = await call({ action: 'state', path: PATH_MAIN })
const rd = await call({ action: 'read', id: a1.id })
ok(st.ok === true && st.parsed.outlineSource === 'row' && typeof st.parsed.outlineSourceMeans === 'string' && st.parsed.outlineSourceMeans.trim() !== '',
  '★ the STATUS face names its source row (the outline it prints is stored on the row)', st.parsed && { source: st.parsed.outlineSource })
ok(rd.ok === true && rd.parsed.outlineSource === 'row' && rd.parsed.outlineSourceMeans === st.parsed.outlineSourceMeans,
  '★★ THE DEFECT: read and state report the SAME row with the SAME source value AND the same sentence (was row vs request)',
  { state: st.parsed && st.parsed.outlineSource, read: rd.parsed && rd.parsed.outlineSource, sameMeans: rd.parsed && st.parsed ? rd.parsed.outlineSourceMeans === st.parsed.outlineSourceMeans : null })
ok(ids(rd.parsed.outline).join(',') === '1,1.1,2,2.1' && rd.parsed.outlineSourceMeans === BLUEPRINT.outlineSourceMeansOf('row'),
  '★ read reports the merged outline and prints the enum sentence from the one constant', rd.parsed && ids(rd.parsed.outline))

console.log('=== 3. A NEW REVISION STILL COVERS ITS OUTLINE (AND SAYS SO) ===')
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const p4 = BLUEPRINT.proposeBlueprint({
  records: kernel.records, path: PATH_MAIN, text: '第 2 版：只带新骨架。', by: 'r-1', seat: 'member', at: T0 + 3000,
  outline: [node('n1', '第二版路线', 1), node('n1.1', '第二版细部', 2)], materialize: true,
})
ok(p4 && p4.ok === true && p4.continued === false && p4.revision === a1.revision + 1,
  'fixture: a NEW revision was started (continued:false, revision advanced)', p4 && { revision: p4.revision, continued: p4.continued })
ok(ids(p4.outline).join(',') === 'n1,n1.1' && p4.outlineCount === 2 && ids(p4.outlineMerged.added).join(',') === 'n1,n1.1' && ids(p4.outlineMerged.kept).length === 0 && ids(p4.outlineMerged.updated).length === 0,
  '★ a NEW revision does NOT merge with the previous revision: it carries exactly its own 2 nodes', p4 && { outline: ids(p4.outline), merged: p4.outlineMerged })
ok(/起新 revision/.test(String(p4.outlineMerged.means)), '★ and says so in words (a reader does not have to know the merge rule is continuation-only)', p4 && String(p4.outlineMerged.means).slice(0, 50))
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const p5 = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_FRESH, text: '全新路径，没有骨架。', by: 'r-1', seat: 'member', at: T0, materialize: true })
ok(p5 && p5.ok === true && p5.outlineCount === 0 && ids(p5.outlineMerged.added).length === 0 && ids(p5.outlineMerged.kept).length === 0 && /起新 revision/.test(String(p5.outlineMerged.means)),
  '★ a new revision with no outline is an explicit empty list + added/kept none (not a missing block)', p5 && p5.outlineMerged)

console.log('=== 4. THE md BLOCK MEANS ONE THING IN propose AND IN state ===')
// ★★★ RUN 248-M2 修 pin：这一节原先钉住「草案不写文件」（written:false/deferredTo/writtenNever）。用户裁定反转后，
// 要证明的**同一件事**没变 ——「md 块里的每个名字只说一件事，回执不许让读者猜它到底写了没写、写到哪儿」——
// 只是名字换成了 draftMdPath/mdWritten/mdPath。所以下面仍然逐个名字断言，不用 contains 松散匹配。
ok(p1.md && p1.md.written === true && p1.md.writtenBy === 'kernel-materialized' && p1.md.mdPath === 'Shared/Drafts/Protocol-r1.md' && p1.draftMdPath === 'Shared/Drafts/Protocol-r1.md',
  '★ propose md block: written true + the writer and the DRAFT file are named (only adopt promotes to canonicalPath)',
  p1 && { written: p1.md && p1.md.written, writtenBy: p1.md && p1.md.writtenBy, mdPath: p1.md && p1.md.mdPath, draftMdPath: p1.draftMdPath })
ok(typeof p1.md.means === 'string' && /sha256/.test(p1.md.means) && p1.md.atomic === 'temp+rename',
  '★ the write receipt says HOW the file landed (atomic temp+rename) and WHAT the row indexes (sha256) — the reader is not left to guess', p1 && p1.md && String(p1.md.means).slice(0, 60))
const stDraft = await call({ action: 'state', path: PATH_DRAFT })
const stMain = await call({ action: 'state', path: PATH_MAIN })
ok(stDraft.ok === true && stDraft.parsed.hasCurrent === false && stDraft.parsed.current === null,
  'fixture: a path with a draft and no revision in force (the case the old outlineMeans mis-described)', stDraft.parsed && { hasCurrent: stDraft.parsed.hasCurrent })
ok(stMain.ok === true && stMain.parsed.md && stMain.parsed.md.written === false && stMain.parsed.md.mdWritten === true && stMain.parsed.md.canonicalPath === PATH_MAIN && stMain.parsed.md.draftMdPath === null,
  '★★ state md block on an ADOPTED path: written false (a read never writes), mdWritten true (the canonical file exists), canonicalPath named, draftMdPath null (this row is not a draft)',
  stMain.parsed && stMain.parsed.md && { written: stMain.parsed.md.written, mdWritten: stMain.parsed.md.mdWritten, draftMdPath: stMain.parsed.md.draftMdPath, canonicalPath: stMain.parsed.md.canonicalPath })
ok(typeof stMain.parsed.md.mdMeans === 'string' && /available/.test(stMain.parsed.md.mdMeans) && /written/.test(stMain.parsed.md.mdMeans) && /不是一回事/.test(stMain.parsed.md.mdMeans),
  '★★ state md block: mdMeans says available and written are NOT the same question (RUN 239-B fix ③)',
  stMain.parsed && stMain.parsed.md && String(stMain.parsed.md.mdMeans).slice(0, 80))
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const proposedDraft = BLUEPRINT.proposeBlueprint({
  records: kernel.records, path: PATH_DRAFT, text: '只有草案的一条路径。', by: 'r-1', seat: 'member', at: T0,
  outline: [node('d1', '草案骨架', 1)], materialize: true,
})
ok(proposedDraft && proposedDraft.ok === true, 'fixture: the draft on the draft-only path exists', proposedDraft && proposedDraft.id)
const stDraft2 = await call({ action: 'state', path: PATH_DRAFT })
const draftMd = (stDraft2.parsed && stDraft2.parsed.md) || {}
// ★★★ RUN 248-M2 修 pin：fixture 从「草案没有文件（exists:false）」变成「草案有自己的文件（exists:true，且路径在 Drafts/）」。
// 这条 fixture 存在的理由——让下一行断言「状态面把草案文件说清楚了」时不是空转——没有变。
ok(stDraft2.ok === true && draftMd.available === true && draftMd.exists === true && draftMd.path === 'Shared/Drafts/DraftOnly-r1.md',
  'fixture: state on a draft-only path names the DRAFT file it owns (available:true + exists:true at the per-revision path)', { available: draftMd.available, exists: draftMd.exists, path: draftMd.path })
ok(draftMd.written === false && draftMd.draftMdPath === 'Shared/Drafts/DraftOnly-r1.md' && draftMd.mdWritten === true && draftMd.canonicalPath === PATH_DRAFT,
  '★★ THE DEFECT (RUN 248 shape): the state md block carries draftMdPath + mdWritten + written + canonicalPath, so "which file does this draft own" is answered, not inferred',
  { written: draftMd.written, draftMdPath: draftMd.draftMdPath, mdWritten: draftMd.mdWritten, canonicalPath: draftMd.canonicalPath })
ok(stDraft2.parsed.draftMdPath === 'Shared/Drafts/DraftOnly-r1.md' && stDraft2.parsed.mdWritten === true,
  '★ … and the SAME two names are on the state root, not only inside the md block (one reading, two depths)',
  stDraft2.parsed && { draftMdPath: stDraft2.parsed.draftMdPath, mdWritten: stDraft2.parsed.mdWritten })
ok(typeof draftMd.mdMeans === 'string' && /draftMdPath/.test(draftMd.mdMeans) && /mdWritten/.test(draftMd.mdMeans) && !/不写文件/.test(draftMd.mdMeans),
  '★ and the sentence names the draft file and whether it is on disk — the old "a draft writes no file" wording is gone',
  String(draftMd.mdMeans).slice(0, 80))
ok(stDraft2.parsed.outlineSource === 'none' && /还没有生效的修订/.test(String(stDraft2.parsed.outlineMeans)) && !/这次修订没有带 outline/.test(String(stDraft2.parsed.outlineMeans)),
  '★★ THE DEFECT: with no revision in force the outlineMeans says THERE IS NO REVISION (current:null), not "this revision carried no outline"',
  stDraft2.parsed && String(stDraft2.parsed.outlineMeans).slice(0, 80))
ok(ids(stDraft2.parsed.current === null ? [] : stDraft2.parsed.current.outline).length === 0 && ids(stDraft2.parsed.drafts[0] && stDraft2.parsed.drafts[0].outline).join(',') === 'd1',
  'the draft outline is still readable in drafts (the truthful means does not hide the skeleton)', stDraft2.parsed && stDraft2.parsed.drafts)

console.log('=== 5. THE REFUSALS STILL NAME THEIR DEFECTS (NO NEW CODE MINTED) ===')
const badDepth = await attempt(() => BLUEPRINT.proposeBlueprint({
  records: kernel.records, path: PATH_MAIN + '.bad', text: '畸形骨架。', by: 'r-1', seat: 'member', at: T0,
  outline: [node('x', '坏层', 9)],
}))
ok(badDepth.ok === false && badDepth.code === 'VMU_INVALID_ARGUMENT' && badDepth.message.trim() !== '' && badDepth.hint !== null && badDepth.hint.trim() !== '',
  'a malformed outline is still refused by the existing code with message + hint (the merge did not soften validation)',
  badDepth.ok === false ? { code: badDepth.code, hint: String(badDepth.hint).slice(0, 40) } : badDepth)

for (const h of cleanups) {
  try { await Promise.all(((h && h.handle && h.handle.cleanups) || []).map(async (c) => { try { return await c() } catch { return null } })) } catch { /* best effort */ }
  try { await rm(h.root, { recursive: true, force: true }) } catch { /* best effort */ }
}
console.log('=== vmu-run239-blueprint: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}
