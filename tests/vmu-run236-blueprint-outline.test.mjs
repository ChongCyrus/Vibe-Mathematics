/**
 * tests/vmu-run236-blueprint-outline.test.mjs — G8「由粗到细」与 G11「据实践细化并更新对象」的 MINIMAL CARRIER.
 *
 * THE TWO RULES THIS SUITE PINS (audit rules ledger G8/G11):
 *   G8 — the plan is read COARSE TO FINE. Before RUN 236 the blueprint had a text and a revision number and nothing
 *        between them: a reader could not tell the skeleton from the detail, so "由粗到细" was prose.
 *   G11 — the object is REFINED AND UPDATED according to practice. The "why this revision exists" lived only in a
 *        conversation: the document itself carried no reason, so the next reader had to trust the chat log.
 *
 * WHAT IS MECHANISM HERE (all in `vibe-math-vmu/packs/v5r/blueprint.js`):
 *   ① `outline` is ONE header field — an ordered `[{id,title,depth}]` (depth 1 = coarse, 2 = finer). It travels with
 *      the revision row AND the md (the md is the truth, the row is its index), so there is no second store to
 *      reconcile. Append-only: an old row without the field still parses.
 *   ② `revisionReason` is ONE header field too: one line (line breaks collapse), written into the row and the md, so
 *      the reason is readable from the document. `adopt` and a continuation INHERIT it from the draft and SAY so
 *      (`revisionReasonSource:"draft"`); a missing reason is `null` + a sentence, never a silent empty string.
 *   ③ `vmu.blueprint.requireOutline` (declared, default FALSE) is a HINT, never a gate: when it is on and the revision
 *      has no outline, the receipt answers `outlineRequired:true` with a named means, and the write STILL lands.
 *   ④ A MALFORMED outline (unknown depth, entry without id, not an array/JSON) is refused by name with the existing
 *      `VMU_INVALID_ARGUMENT` code — no new refusal code was minted for this carrier.
 *
 * RULE E: every loop/fixture below is preceded by an explicit non-empty assertion; refusals are normalised from BOTH
 * shapes (a thrown error and a serialised `{ok:false}` receipt) so a refusal is never mistaken for a success.
 *
 * WHAT THIS SUITE DOES NOT COVER (the tool layer is wired by the Lead, not here): `packs/v5r/tools.js` does NOT yet
 * forward `outline` / `revisionReason` / `outlineRequireOf(settingsView)`; this suite drives the carrier functions
 * directly and reads the published `vibe_v5_blueprint` face for the READ side only.
 *
 * Run: node tests/vmu-run236-blueprint-outline.test.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const VMU = join(REPO, 'vibe-math-vmu')
const T0 = Date.parse('2020-01-01T00:00:00.000Z')

const PATH_MAIN = 'Shared/Protocol.md'
const PATH_BARE = 'Shared/Bare.md'
const PATH_HINT = 'Shared/Hint.md'
const PATH_BAD = 'Shared/Bad.md'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null
const textOf = (e) => String((e && (typeof e.message === 'string' ? e.message : '')) || '')
const hintOf = (e) => (e && typeof e.hint === 'string' ? e.hint : null)
const triple = (r) => Boolean(r && typeof r.code === 'string' && /^VMU_/.test(r.code) && typeof r.message === 'string' && r.message.trim() !== '' && typeof r.hint === 'string' && r.hint.trim() !== '')

async function boot(config = {}) {
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const root = await mkdtemp(join('D:/_tmp', 'vmu-r236-'))
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => T0 }, config))
  await handle.ready()
  return { handle, specs, root, specOf: (name) => specs.filter((s) => s.name === name)[0] || null }
}

const BLUEPRINT = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)
const SCHEMA = await import(pathToFileURL(join(VMU, 'settings', 'schema.js')).href)

const main = await boot({})
const kernel = main.handle.kernel
const spec = main.specOf('vibe_v5_blueprint')

/** Normalise BOTH refusal shapes (thrown error / serialised {ok:false} receipt) into one reading. */
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
const outlineOf = (extra = []) => [{ id: 'o1', title: '总体路线', depth: 1 }, { id: 'o2', title: '第一阶段', depth: 2 }].concat(extra)
const isOutline = (v) => Array.isArray(v) && v.length === 2 && v[0].id === 'o1' && v[0].depth === 1 && v[1].id === 'o2' && v[1].depth === 2 && v[1].title === '第一阶段'
const countField = (text, key) => text.split('\n').filter((line) => line.indexOf('- ' + key + '：') === 0).length

console.log('=== 0. THE SURFACES THIS SUITE DRIVES ARE PUBLISHED ===')
ok(kernel !== null && kernel !== undefined, 'the pack applied and a kernel exists (a null handle would make every assertion vacuous)', kernel === null)
ok(spec !== null && spec !== undefined, 'the blueprint tool is published on the assembled pack', spec ? spec.name : null)
const props = (spec && spec.parameters && spec.parameters.properties) || {}
ok(['action', 'path', 'member', 'text', 'draft'].every((k) => props[k] !== undefined),
  'the tool schema still declares the verbs this suite reads through (action/path/member/text/draft)', Object.keys(props))
const iOutline = BLUEPRINT.BLUEPRINT_FIELDS.indexOf(BLUEPRINT.BLUEPRINT_OUTLINE_KEY)
const iReason = BLUEPRINT.BLUEPRINT_FIELDS.indexOf(BLUEPRINT.BLUEPRINT_REASON_KEY)
const iMd = BLUEPRINT.BLUEPRINT_FIELDS.indexOf('mdFingerprint')
const iAuthors = BLUEPRINT.BLUEPRINT_FIELDS.indexOf('authors')
ok(iOutline > iMd && iReason > iOutline && iAuthors >= 0 && iMd > iAuthors,
  '★ both new fields are APPENDED AFTER the md fingerprint (old rows keep their names and order, so every old row still parses)', BLUEPRINT.BLUEPRINT_FIELDS)
ok(BLUEPRINT.BLUEPRINT_OUTLINE_KEY === 'outline' && BLUEPRINT.BLUEPRINT_REASON_KEY === 'revisionReason' && BLUEPRINT.BLUEPRINT_OUTLINE_REQUIRE_KEY === 'vmu.blueprint.requireOutline',
  'the field names and the declared setting key live in one place', [BLUEPRINT.BLUEPRINT_OUTLINE_KEY, BLUEPRINT.BLUEPRINT_REASON_KEY, BLUEPRINT.BLUEPRINT_OUTLINE_REQUIRE_KEY])
ok(Array.isArray(BLUEPRINT.BLUEPRINT_OUTLINE_DEPTHS) && BLUEPRINT.BLUEPRINT_OUTLINE_DEPTHS.length === 2 && BLUEPRINT.BLUEPRINT_OUTLINE_DEPTHS[0] === 1 && BLUEPRINT.BLUEPRINT_OUTLINE_DEPTHS[1] === 2,
  'the depth vocabulary is declared (1 = coarse, 2 = finer), not guessed per caller', BLUEPRINT.BLUEPRINT_OUTLINE_DEPTHS)
ok(typeof BLUEPRINT.outlineReading === 'function' && typeof BLUEPRINT.revisionReasonReading === 'function' && typeof BLUEPRINT.outlineRequireOf === 'function',
  'the carrier exports the readings this suite drives (outlineReading / revisionReasonReading / outlineRequireOf)',
  { outline: typeof BLUEPRINT.outlineReading, reason: typeof BLUEPRINT.revisionReasonReading, knob: typeof BLUEPRINT.outlineRequireOf })
ok(SCHEMA.defaultsOf()[BLUEPRINT.BLUEPRINT_OUTLINE_REQUIRE_KEY] === false,
  '★ the declared setting exists and its default is FALSE (the hint is off unless a deployment turns it on)',
  SCHEMA.defaultsOf()[BLUEPRINT.BLUEPRINT_OUTLINE_REQUIRE_KEY])

await kernel.members.hire({ id: 'acad', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })

console.log('=== 1. G8 / G11 LAND IN THE ROW *AND* THE MD — ONE FIELD, NO SECOND STORE ===')
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const p1 = BLUEPRINT.proposeBlueprint({
  records: kernel.records, path: PATH_MAIN, text: '第 1 版正文：先给粗骨架，再补细部。', by: 'r-1', seat: 'member', at: T0,
  outline: outlineOf(), revisionReason: '首次给出由粗到细的骨架', materialize: true,
})
ok(p1 && p1.ok === true && typeof p1.id === 'string', 'fixture: the outline revision was written (RULE E: the fixture exists before it is judged)', p1 && p1.id)
ok(isOutline(p1.outline) && p1.outlineCount === 2 && p1.outlineDepthMax === 2 && p1.outlineSource === 'request',
  '★ G8: the receipt carries the ordered outline itself (2 nodes, coarse + fine, source:"request")',
  p1 && { outline: p1.outline, count: p1.outlineCount, max: p1.outlineDepthMax, source: p1.outlineSource })
ok(p1.revisionReason === '首次给出由粗到细的骨架' && p1.revisionReasonSource === 'request', '★ G11: the receipt carries the reason this revision exists and where it came from', p1 && { reason: p1.revisionReason, source: p1.revisionReasonSource })
ok(typeof p1.outlineMeans === 'string' && p1.outlineMeans.trim() !== '' && typeof p1.revisionReasonMeans === 'string' && p1.revisionReasonMeans.trim() !== '',
  'every reading is paired with a sentence (the receipt is readable, not a bare flag)', { outline: String(p1.outlineMeans).slice(0, 40), reason: String(p1.revisionReasonMeans).slice(0, 40) })
// ★★★ RUN 248-M2 修 pin：旧断言是「草案不写 md，只有 adopt 写」（RUN 238 的结论）。用户裁定反转后，这条要证明的
// **同一件事**仍在：回执必须说清这次写入落到了哪个文件、谁写的，而且绝不能把「草案文件」冒充成「生效文件」。
ok(p1.md && p1.md.available === true && p1.md.written === true && p1.md.writtenBy === 'kernel-materialized' && p1.md.mdPath === 'Shared/Drafts/Protocol-r1.md',
  '★ a draft writes ITS OWN md file, and the receipt names the writer and the file', p1 && p1.md && { available: p1.md.available, written: p1.md.written, writtenBy: p1.md.writtenBy, mdPath: p1.md.mdPath })
ok(p1.draftMdPath === 'Shared/Drafts/Protocol-r1.md' && p1.mdWritten === true,
  'the receipt exposes the published draft-file reading (draftMdPath + mdWritten)', p1 && { draftMdPath: p1.draftMdPath, mdWritten: p1.mdWritten })
ok(p1.path === PATH_MAIN && existsSync(join(main.root, 'VibeMath', PATH_MAIN)) === false,
  'the receipt names the canonical document this draft is ABOUT, and that document is not on disk yet', { path: p1.path })
ok(p1.md.bytes > 0 && p1.mdChangedSinceIndex === false,
  'the draft reports the REAL size of the file it just wrote and no drift (row and file were written together)', p1 && p1.md && { bytes: p1.md.bytes, changed: p1.mdChangedSinceIndex })
const row1 = kernel.records.get({ id: p1.id })
ok(row1 && typeof row1.body === 'string' && countField(row1.body, 'outline') === 1 && countField(row1.body, 'revisionReason') === 1,
  'the ROW body carries both fields too (the md is the truth and the row is its index: both shapes agree)', row1 && countField(row1.body, 'outline'))
const parse1 = BLUEPRINT.parseBlueprint(row1)
ok(parse1 && parse1.ok === true && isOutline(parse1.outline) && parse1.revisionReason === '首次给出由粗到细的骨架',
  '★ the reader parses the outline back into structured nodes (a reader never has to parse the document by hand)', parse1 && { outline: parse1.outline, reason: parse1.revisionReason })

console.log('=== 2. A CONTINUATION INHERITS BOTH — AND SAYS SO ===')
// legacy path: the continuation rewrites the kernel-materialized draft only when materialize:true is explicit
const p2 = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_MAIN, draft: p1.id, text: '共同设计：补一条复查节奏。', by: 'acad', seat: 'chair', at: T0 + 1000, materialize: true })
ok(p2 && p2.ok === true && p2.id === p1.id, 'fixture: the chair continued the SAME draft (one draft per unadopted revision)', p2 && { id: p2.id, before: p1.id })
ok(isOutline(p2.outline) && p2.outlineSource === 'draft', '★ G8: a continuation that passes no outline keeps the draft outline and names the source ("draft")', p2 && { outline: p2.outline, source: p2.outlineSource })
ok(p2.revisionReason === '首次给出由粗到细的骨架' && p2.revisionReasonSource === 'draft', '★ G11: a continuation inherits the reason and reports revisionReasonSource:"draft"', p2 && { reason: p2.revisionReason, source: p2.revisionReasonSource })
// ★ RUN 248-M2 修 pin：旧断言是「续写也不写 md」。新语义下这件事变成了更强的版本：续写重写的是**同一份草案文件**，
// 而生效文件仍然不动 —— 「一次共同设计 = 一份草案 = 一个文件」这个性质还在，只是从「不写」变成「写同一个」。
ok(p2.md && p2.md.written === true && p2.md.mdPath === 'Shared/Drafts/Protocol-r1.md',
  '★ a continuation REWRITES the same draft file (one draft = one md), never a second one', p2 && p2.md && { written: p2.md.written, mdPath: p2.md.mdPath })
ok(p2.draftMdPath === 'Shared/Drafts/Protocol-r1.md' && existsSync(join(main.root, 'VibeMath', 'Shared', 'Protocol.md')) === false,
  'and the document in force is still untouched on disk (only adopt promotes)', p2 && p2.draftMdPath)
const row2 = kernel.records.get({ id: p1.id })
ok(row2 && countField(row2.body, 'outline') === 1 && countField(row2.body, 'revisionReason') === 1 && row2.body.indexOf('共同设计补充') >= 0,
  '★ the continuation grows the SAME index row (one line each for the header fields, plus its co-design section)',
  row2 && { outline: countField(row2.body, 'outline'), reason: countField(row2.body, 'revisionReason') })

console.log('=== 3. ADOPT INHERITS FROM THE DRAFT — THE REASON SURVIVES ADOPTION ===')
const a1 = BLUEPRINT.adoptBlueprint({ records: kernel.records, path: PATH_MAIN, draft: p1.id, by: 'acad', at: T0 + 2000 })
ok(a1 && a1.ok === true && a1.status === 'current' && typeof a1.id === 'string', 'fixture: the chair adopted the draft (adoption succeeded on a co-designed draft)', a1 && { id: a1.id, status: a1.status })
ok(isOutline(a1.outline) && a1.outlineSource === 'draft', '★ G8: adoption carries the draft outline forward (no re-typing, no divergence)', a1 && { outline: a1.outline, source: a1.outlineSource })
ok(a1.revisionReason === '首次给出由粗到细的骨架' && a1.revisionReasonSource === 'draft',
  '★ G11: adoption inherits the reason and reports revisionReasonSource:"draft" (why the revision exists does not vanish at adoption)',
  a1 && { reason: a1.revisionReason, source: a1.revisionReasonSource })
const mdPath = a1.md && a1.md.absPath
const mdText3 = typeof mdPath === 'string' && mdPath !== '' ? readFileSync(mdPath, 'utf8') : ''
ok(typeof mdPath === 'string' && mdPath !== '' && a1.mdIsTheDocumentInForce && a1.mdIsTheDocumentInForce.wroteNow === true,
  '★★ adoption is what puts the document on disk (and the receipt says it wrote now)',
  a1 && a1.md && { absPath: a1.md.absPath, inForce: a1.mdIsTheDocumentInForce })
ok(countField(mdText3, 'outline') === 1 && countField(mdText3, 'revisionReason') === 1 && /status：current/.test(mdText3),
  '★ the adopted document still carries both fields and now says current (the md was rewritten, not abandoned)', countField(mdText3, 'outline'))
const st1 = await call({ action: 'state', path: PATH_MAIN })
ok(st1.ok === true && isOutline(st1.parsed.outline) && st1.parsed.outlineCount === 2, '★ the published STATUS face reads the outline (state spreads the carrier reading, so no tool edit was needed for this half)', st1.parsed && { outline: st1.parsed.outline, count: st1.parsed.outlineCount })
ok(st1.parsed.revisionReason === '首次给出由粗到细的骨架' && typeof st1.parsed.revisionReasonMeans === 'string' && st1.parsed.revisionReasonMeans.trim() !== '',
  '★ the published STATUS face reads the reason with its sentence', st1.parsed && { reason: st1.parsed.revisionReason, means: String(st1.parsed.revisionReasonMeans).slice(0, 40) })
ok(st1.parsed.current && isOutline(st1.parsed.current.outline) && st1.parsed.current.revisionReason === '首次给出由粗到细的骨架',
  'the in-force revision in `current` carries both fields (a reader of the head does not need the whole document)', st1.parsed && st1.parsed.current)
const read1 = await call({ action: 'read', id: a1.id })
const fieldsRead = (read1.parsed && read1.parsed.fields) || {}
ok(read1.ok === true && typeof fieldsRead.outline === 'string' && /"id":"o1"/.test(fieldsRead.outline) && fieldsRead.revisionReason === '首次给出由粗到细的骨架',
  'the published READ face carries both fields in `fields` (the tool layer exposes a fixed subset: the top-level readings are the Lead wiring item)', { outline: String(fieldsRead.outline || '').slice(0, 40), reason: fieldsRead.revisionReason })

console.log('=== 4. ABSENT IS EXPLICIT — NULL AND A SENTENCE, NEVER A SILENT EMPTY ===')
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const p3 = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_BARE, text: '没有骨架也没有理由的一版。', by: 'r-1', seat: 'member', at: T0, materialize: true })
ok(p3 && p3.ok === true && p3.id !== p1.id, 'fixture: a revision with neither field was written (the fields are optional)', p3 && p3.id)
ok(Array.isArray(p3.outline) && p3.outline.length === 0 && p3.outlineCount === 0 && p3.outlineSource === 'none',
  '★ G8: no outline is an EXPLICIT empty list + count 0 (omission would make "none" and "not asked" indistinguishable)', p3 && { outline: p3.outline, count: p3.outlineCount, source: p3.outlineSource })
ok(p3.revisionReason === null && p3.revisionReasonSource === 'none' && /没有记录理由/.test(String(p3.revisionReasonMeans)),
  '★ G11: no reason is `null` + a sentence saying so (not an empty string that reads like a printing bug)', p3 && { reason: p3.revisionReason, means: String(p3.revisionReasonMeans).slice(0, 40) })
// ★ RUN 248-M2 修 pin：旧断言是「裸草案完全不写文档」。同一件事现在由「写的是它自己的文件、且路径按 stem-r<N> 生成」
// 来证明：没有 outline/reason 的那一版，也照样有自己的一份 md，可被 adopt 晋升。
ok(p3.md && p3.md.available === true && p3.md.written === true && p3.md.mdPath === 'Shared/Drafts/Bare-r1.md',
  'a bare draft ALSO writes its own document (the path is derived per revision, not deferred to adoption)', p3 && p3.md && { available: p3.md.available, mdPath: p3.md.mdPath })
const stBare = await call({ action: 'state', path: PATH_BARE })
ok(stBare.ok === true && Array.isArray(stBare.parsed.outline) && stBare.parsed.outline.length === 0 && stBare.parsed.revisionReason === null,
  'the STATUS face reports the absence explicitly too (empty list + null, both present as keys)', stBare.parsed && { outline: stBare.parsed.outline, reason: stBare.parsed.revisionReason })

console.log('=== 5. THE DECLARED KNOB IS A HINT, NEVER A GATE ===')
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const p4 = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_HINT, text: '部署要求骨架，但这一版没带。', by: 'r-1', seat: 'member', at: T0, requireOutline: true, materialize: true })
ok(p4 && p4.ok === true && typeof p4.id === 'string', '★ the write LANDED even though the deployment asks for an outline (a hint that refuses would be a gate, and the default is off)', p4 && p4.id)
ok(p4.outlineRequired === true && p4.outlineRequiredSource === BLUEPRINT.BLUEPRINT_OUTLINE_REQUIRE_KEY,
  '★ the receipt answers `outlineRequired:true` and NAMES the setting that asked', p4 && { required: p4.outlineRequired, source: p4.outlineRequiredSource })
ok(typeof p4.outlineRequiredMeans === 'string' && p4.outlineRequiredMeans.trim() !== '' && /不拒绝|没有被拒绝/.test(p4.outlineRequiredMeans),
  '★ the sentence says the write was not refused (the reader learns the rule is a hint without reading this test)', p4 && String(p4.outlineRequiredMeans).slice(0, 60))
const p4row = kernel.records.get({ id: p4.id })
ok(p4row && typeof p4row.body === 'string' && p4row.body.indexOf('- status：draft') >= 0, 'the hinted revision is a real draft row (the hint produced words, not a false state)', p4row && String(p4row.body).slice(0, 40))
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const p5 = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_HINT + '.2', text: '部署要求骨架，这一版带了。', by: 'r-1', seat: 'member', at: T0, requireOutline: true, outline: outlineOf(), materialize: true })
ok(p5 && p5.outlineRequired === false && /已带 outline/.test(String(p5.outlineRequiredMeans)),
  'when the outline is present the same knob reports "not triggered" (the hint is not a constant complaint)', p5 && { required: p5.outlineRequired, means: String(p5.outlineRequiredMeans).slice(0, 40) })
ok(BLUEPRINT.outlineRequireOf() === false && BLUEPRINT.outlineRequireOf({ 'vmu.blueprint.requireOutline': true }) === true && BLUEPRINT.outlineRequireOf(kernel.settingsView()) === false,
  '★ the pack has ONE named reader of the declared key: default false, true when the deployment says so, false from the assembled settings view',
  { dflt: BLUEPRINT.outlineRequireOf(), map: BLUEPRINT.outlineRequireOf({ 'vmu.blueprint.requireOutline': true }), view: BLUEPRINT.outlineRequireOf(kernel.settingsView()) })

console.log('=== 6. A MALFORMED OUTLINE IS REFUSED BY NAME (the existing code, no new registry entry) ===')
const badDepth = await attempt(() => BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_BAD, text: 'x', by: 'r-1', at: T0, outline: [{ id: 'a', title: 't', depth: 9 }] }))
ok(badDepth.ok === false && badDepth.code === 'VMU_INVALID_ARGUMENT', '★ an unknown depth is refused with VMU_INVALID_ARGUMENT (no new refusal code was minted for this carrier)', badDepth.code)
ok(triple(badDepth) && /depth/.test(badDepth.message) && /1\|2/.test(badDepth.hint),
  '★ the refusal names the offending depth and its hint gives the accepted vocabulary (code + message + hint)', { message: badDepth.message, hint: badDepth.hint })
const noId = await attempt(() => BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_BAD, text: 'x', by: 'r-1', at: T0, outline: [{ title: '无 id', depth: 1 }] }))
ok(noId.ok === false && noId.code === 'VMU_INVALID_ARGUMENT' && /no id/.test(noId.message), 'an entry without an id is refused by name too (a half-read outline must never look whole)', noId.message)
const notJson = await attempt(() => BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH_BAD, text: 'x', by: 'r-1', at: T0, outline: 'not-json' }))
ok(notJson.ok === false && notJson.code === 'VMU_INVALID_ARGUMENT' && /valid JSON/.test(notJson.message), 'a malformed JSON string is refused as "not valid JSON" (the reader is explicit about the shape it wanted)', notJson.message)
const stBad = await call({ action: 'state', path: PATH_BAD })
ok(stBad.ok === true && stBad.parsed.draftsWaiting === 0 && stBad.parsed.hasCurrent === false,
  '★ none of the three refusals wrote a row (a refused outline leaves the path untouched)', { drafts: stBad.parsed && stBad.parsed.draftsWaiting, current: stBad.parsed && stBad.parsed.hasCurrent })
const adoptBad = await attempt(() => BLUEPRINT.adoptBlueprint({ records: kernel.records, path: PATH_MAIN, draft: p3.id, by: 'acad', at: T0 + 3000, outline: [{ id: 'a', depth: 9 }] }))
ok(adoptBad.ok === false && adoptBad.code === 'VMU_INVALID_ARGUMENT' && triple(adoptBad), 'the adoption path refuses a malformed outline the same way (one validation, two writers)', adoptBad.code)

console.log('=== 7. THE READINGS ARE PURE FUNCTIONS AHEAD OF THE WRITE PATH ===')
const rNone = BLUEPRINT.revisionReasonReading({ revisionReason: '', source: 'none' })
ok(rNone.revisionReason === null && rNone.revisionReasonSource === 'none' && /没有记录理由/.test(rNone.revisionReasonMeans), 'the reason reading of an empty value is null + a sentence (no writer needed to know the rule)', rNone.revisionReasonMeans)
const rRow = BLUEPRINT.revisionReasonReading({ revisionReason: '据实践细化', source: 'row' })
ok(rRow.revisionReason === '据实践细化' && rRow.revisionReasonSource === 'row' && /读面如实报告存量原文/.test(rRow.revisionReasonMeans), 'the row source is its OWN sentence (a reader can tell a stored reason from a fresh one)', rRow.revisionReasonMeans)
const oEmpty = BLUEPRINT.outlineReading({ outline: [], requireOutline: false })
ok(oEmpty.outline.length === 0 && oEmpty.outlineCount === 0 && oEmpty.outlineRequired === false && oEmpty.outlineRequiredSource === null, 'the outline reading of an empty list is empty + not required, with no fabricated requirement', oEmpty)
const oHint = BLUEPRINT.outlineReading({ outline: [], requireOutline: true })
ok(oHint.outlineRequired === true && oHint.outlineRequiredSource === 'vmu.blueprint.requireOutline' && /提示不是门|不拒绝/.test(oHint.outlineMeans), 'the reading under the hint names the setting and the non-gate rule', oHint.outlineRequiredSource)

await rm(main.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
console.log('')
if (failures.length > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  · ' + f); process.exitCode = 1 }
console.log('passed=' + passed + ' failed=' + failed)
