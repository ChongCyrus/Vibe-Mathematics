/**
 * tests/vmu-run36-blueprint.test.mjs — RUN 36: ADOPTION SILENTLY TRUNCATED THE BLUEPRINT TEXT AT THE FIRST INNER `## `.
 *
 * THE EVIDENCE (`D:/_tmp/r36/dig36.txt`, receipts verbatim):
 *   [seq 192] propose{path:"Shared/Protocol.md", member:"r-1", text:<4 KB, carries its own `## 一、` … `## 六、`>} ⇒ id:"r-23"
 *   [seq 485] read_library{id:"r-23"} ⇒ bytes:4134, body complete
 *   [seq 497] adopt{draft:"r-23", member:"r-acad"} ⇒ id:"r-29", status:"current", inForce.bytes:939
 *   [seq 506] read_library{id:"r-29"} ⇒ bytes:939, the body stops after the `> 状态：草案（draft），尚未生效` line and
 *             `## 一、` … `## 六、` are GONE — with `bodyTruncated:false`, i.e. the row was SHORT ON DISK, not cut on the way out.
 *
 * THE MECHANISM: `composeBlueprintBody` writes the user text under a `## 正文` heading, and `parseBlueprint` read it back
 * through the shared `parseBody` (`vibe-math-vmu/packs/v5r/verified.js:95-123`), which treats EVERY `## ` line as a segment
 * boundary. A draft whose text carries its own `## 一、` headings therefore parsed back to the two lines before the first one,
 * and `adoptBlueprint` copied `target.text` — by design: adoption changes status/signature, never the document — so the
 * current row inherited the truncation. The r-23 row was never damaged; the version in force was born incomplete.
 *
 * THE FIX PINNED HERE: the text section is "everything after the `## 正文` line, to the END of the body", read by
 * `blueprintTextOf`. The shared `parseBody` is UNTOUCHED on purpose (parseCardBody/parseVerifiedBody depend on its segment
 * semantics); section 3 asserts the primitive still cuts, so a future "fix parseBody instead" cannot pass this suite.
 *
 * THE THREE SELF-CONTRADICTIONS THE DEFECT EXPOSED — a receipt may not leave a reader guessing:
 *   ① the current row's TEXT still says 「状态：草案」: that is the proposer's verbatim prose (adoption never rewrites
 *      documents) while the row's status lives in the header line ⇒ `statusMeans` + `textMeans`.
 *   ② the adopted draft stays `status:"draft"`/`adoptedBy:null` in `history`: append-only — that row records "this version
 *      was proposed"; "who adopted it" is answered by the current row's `proposalId`/`adoptedBy` ⇒ `historyMeans`.
 *   ③ `revisions:2` beside `currentRevision:1`: different units (rows on disk vs the revision NUMBER in force; a draft and
 *      its adoption share one revision number, so one propose+adopt adds 2 rows but advances the revision by 1)
 *      ⇒ `revisionsMeans`.
 *
 * Run: node tests/vmu-run36-blueprint.test.mjs
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP_ROOT = 'D:/_tmp/r36/blueprint'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null
const textOf = (e) => String((e && (e.message || '')) || '')

async function boot() {
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  await mkdir(TMP_ROOT, { recursive: true })
  const root = await mkdtemp(join(TMP_ROOT, 'run36-'))
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => 1000 })
  await handle.ready()
  return { handle, specs, root, specOf: (name) => specs.filter((s) => s.name === name)[0] || null }
}

const BLUEPRINT = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)
const VERIFIED = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'verified.js')).href)
const PATH = 'Shared/Protocol.md'

/** The draft a real run proposed: title + its own status sentence + SIX `## ` sections (the shape that broke r-23). */
const DRAFT_TEXT = [
  '# 技术路线蓝图（v1 · r-1 提议）',
  '',
  '> 状态：草案（draft），尚未生效；落成（adopt）只有主席席能做。本稿基于本所已落盘证据写成，凡引用均带 id 与当前指纹。',
  '',
  '## 一、原问题与目标',
  '把「表上偶然的奇数和恒为平方」从一次观测变成一条能复现的路：目标不是再猜一个 n，而是让任何人按本蓝图独立重跑并得到同一判据。',
  '',
  '## 二、定义口径',
  '「奇数和」指同一行内各奇数之和，不含偶数与空位；「恒为平方」指对 n=2..8 全部成立，任一反例即判伪。定义写在提案正文里，不靠口头约定。',
  '',
  '## 三、验证协议',
  '每条命题入 Verified 前须满足：至少 m 位投票成员返回一致结论，且引用的对象 id 与当前指纹一致；任一成员可发起复核，复核必须重算而非复述。',
  '',
  '## 四、已落盘证据',
  'p-odd-sum(9a0112…)、r-18(9296ff…)、p-r1-odd-sum(50e943…) 三份对象均已按上述口径复算通过；其中 r-18 的第七行是刻意构造的反例对照，用于证明判据会拒绝。',
  '',
  '## 五、待办与风险',
  '① 会议内存态在轮次间回退（m-odd-sum 复测时会从 close 退回 open），需在下一版协议里写清恢复顺序；② n 的上界尚未证明，暂按 n≤8 表述。',
  '',
  '## 六、采纳条件与维护',
  '采纳只由主席席执行；采纳后本蓝图即为现行版。任何成员可 propose 下一版，revision 自动加一；旧版留在历史里，不改写。',
].join('\n')

const main = await boot()
const kernel = main.handle.kernel
const spec = main.specOf('vibe_v5_blueprint')
const call = async (args) => {
  try {
    const raw = await spec.execute(args)
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (parsed && parsed.ok === false) return { ok: false, parsed, code: parsed.code, text: String(parsed.message || '') }
    return { ok: true, parsed }
  } catch (e) {
    return { ok: false, err: e, code: codeOf(e), text: textOf(e) }
  }
}
const readLibrary = async (args) => {
  const libSpec = main.specOf('vibe_v5_read_library')
  try {
    const raw = await libSpec.execute(args)
    return { ok: true, parsed: typeof raw === 'string' ? JSON.parse(raw) : raw }
  } catch (e) {
    return { ok: false, code: codeOf(e), text: textOf(e) }
  }
}

console.log('=== 0. THE FACE IS REAL AND THE FIXTURE REPRODUCES THE RUN-36 SHAPE ===')
ok(kernel !== null, 'the pack applied (a null kernel would make every assertion below vacuous)', kernel === null)
ok(spec !== null && main.specOf('vibe_v5_read_library') !== null, '★ the blueprint tool and the read surface are both published through the real adapter', { specs: main.specs.map((s) => s.name).filter((n) => /blueprint|read_library/.test(n)) })
const sections = ['## 一、', '## 二、', '## 三、', '## 四、', '## 五、', '## 六、']
const missingInFixture = sections.filter((s) => !DRAFT_TEXT.includes(s))
ok(sections.length === 6 && missingInFixture.length === 0 && Buffer.byteLength(DRAFT_TEXT, 'utf8') > 1000,
  'the draft fixture is non-empty and carries SIX inner `## ` headings (RULE E: a loop over an empty list proves nothing)', { bytes: Buffer.byteLength(DRAFT_TEXT, 'utf8'), sections })
ok(DRAFT_TEXT.includes('状态：草案'), 'the draft quotes its own 「状态：草案」 line (this is the text contradiction ① is about; it is the PROPOSER\'s words)', DRAFT_TEXT.length)

await kernel.members.hire({ id: 'acad', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })
const roster = kernel.members.roster()
ok(roster.length === 2, 'roster is non-empty before any identity assertion (RULE E)', roster.length)

console.log('=== 1. THE DRAFT\'S TEXT SURVIVES THE RECORD ROUND TRIP (the read face of a draft was truncated too) ===')
const draft1 = await call({ action: 'propose', member: 'r-1', text: DRAFT_TEXT })
ok(draft1.ok && draft1.parsed.ok === true, '★ 正：a member may propose a draft that has its own `## ` headings', draft1.parsed || draft1.text)
const draftId = draft1.parsed && draft1.parsed.id
const draftRow = draftId ? kernel.records.get({ id: draftId }) : null
ok(draftRow && draftRow.ok === true, 'the draft row is READ BACK from the real records face', draftRow && draftRow.ok)
const parsedDraft = draftRow ? BLUEPRINT.parseBlueprint(draftRow) : null
ok(parsedDraft && parsedDraft.text === DRAFT_TEXT.trim(),
  '★★ 红→绿：parseBlueprint returns the WHOLE draft text (today it stops before `## 一、`, like r-23 did at seq 485)',
  parsedDraft && { got: parsedDraft.text.length, want: DRAFT_TEXT.trim().length, head: parsedDraft.text.slice(-40) })
const missingInDraft = sections.filter((s) => !parsedDraft.text.includes(s))
ok(parsedDraft && missingInDraft.length === 0,
  'every inner `## ` heading of the draft is part of the parsed text, not a section boundary', parsedDraft && missingInDraft)
const draftBytes = draftRow && draftRow.bytes
ok(draftBytes > 800, 'the draft row is stored at its real size (storage does not truncate: seq 485 bytes:4134)', draftBytes)

console.log('=== 2. ADOPTION MOVES THE DOCUMENT VERBATIM — THE CURRENT ROW IS NOT BORN INCOMPLETE ===')
const adopted1 = await call({ action: 'adopt', member: 'acad', draft: draftId })
ok(adopted1.ok && adopted1.parsed.status === 'current' && adopted1.parsed.revision === 1, '★ 正：the chair adopts draft r1', adopted1.parsed || adopted1.text)
const currentId = adopted1.parsed && adopted1.parsed.id
ok(currentId !== draftId, 'adoption mints a NEW row (append-only: the draft row is never rewritten)', { draftId, currentId })
const currentRow = currentId ? kernel.records.get({ id: currentId }) : null
ok(currentRow && currentRow.ok === true, 'the current row is READ BACK from the real records face', currentRow && currentRow.ok)
const parsedCurrent = currentRow ? BLUEPRINT.parseBlueprint(currentRow) : null
ok(parsedCurrent && parsedCurrent.text === DRAFT_TEXT.trim(),
  '★★★ THE DEFECT: the adopted text IS the proposed text, verbatim (seq 497/506: 4134 bytes became 939; run 36 lost 一～六 here)',
  parsedCurrent && { got: parsedCurrent.text.length, want: DRAFT_TEXT.trim().length, tail: parsedCurrent.text.slice(-40) })
const missingInCurrent = sections.filter((s) => !parsedCurrent.text.includes(s))
ok(parsedCurrent && missingInCurrent.length === 0,
  'all six inner `## ` headings survive adoption', parsedCurrent && missingInCurrent)
ok(currentRow && currentBytesComparable(currentRow.bytes, draftBytes),
  '★ the current row is the SAME SIZE CLASS as the draft (bytes 4134 → 939 was the tell-tale of the defect)',
  currentRow && { current: currentRow.bytes, draft: draftBytes })
function currentBytesComparable(current, draft) {
  return Number.isFinite(current) && Number.isFinite(draft) && current >= draft - 200 && current <= draft + 600
}
const stateAfter = await call({ action: 'state' })
ok(stateAfter.parsed && stateAfter.parsed.current && stateAfter.parsed.current.bytes === currentRow.bytes,
  'the state read-out reports the SAME bytes as the row (the receipt agrees with disk)', stateAfter.parsed && stateAfter.parsed.current)
const libCurrent = currentId ? await readLibrary({ id: currentId }) : null
const libBody = libCurrent && libCurrent.ok && libCurrent.parsed.card ? String(libCurrent.parsed.card.body || '') : ''
const missingInLib = sections.filter((s) => !libBody.includes(s))
ok(libCurrent && libCurrent.ok && libCurrent.parsed.card && missingInLib.length === 0,
  '★ the run-36 read surface (read_library {id}) now shows the whole body, `## 一、`…`## 六、` included', libCurrent && { bytes: libCurrent.parsed.card && libCurrent.parsed.card.bytes, bodyTruncated: libCurrent.parsed.card && libCurrent.parsed.card.bodyTruncated, missing: missingInLib })
const readCurrent = currentId ? await call({ action: 'read', id: currentId }) : null
ok(readCurrent && readCurrent.ok && readCurrent.parsed.text === DRAFT_TEXT.trim(),
  'the blueprint tool\'s own read action returns the whole text too (it reads through parseBlueprint)', readCurrent && { got: readCurrent.parsed && readCurrent.parsed.text.length, want: DRAFT_TEXT.trim().length })

console.log('=== 3. THE MECHANISM: THE TEXT SECTION IS "TO THE END", AND THE SHARED PRIMITIVE IS NOT TOUCHED ===')
const body = currentRow && currentRow.body
const shared = VERIFIED.parseBody(String(body || ''))
const sharedText = (shared.sections && shared.sections[BLUEPRINT.BLUEPRINT_TEXT_SECTION]) || []
ok(sharedText.length > 0 && !sharedText.join('\n').includes('## 六、'),
  '★ the SHARED parseBody STILL cuts the text at the first inner `## ` — this is the root cause, and it must stay that way (three other parsers depend on its segment semantics)',
  { sectionLines: sharedText.length })
ok(typeof BLUEPRINT.blueprintTextOf === 'function' && body && BLUEPRINT.blueprintTextOf(body) === DRAFT_TEXT.trim(),
  'the carrier reads the `## 正文` section itself, to the END of the body (blueprintTextOf)', body && typeof BLUEPRINT.blueprintTextOf === 'function' ? { got: BLUEPRINT.blueprintTextOf(body).length, want: DRAFT_TEXT.trim().length } : { hasHelper: typeof BLUEPRINT.blueprintTextOf })
const composed = BLUEPRINT.composeBlueprintBody({ path: PATH, status: 'draft', revision: 9, proposedBy: 'r-1', proposedAt: 1000, text: DRAFT_TEXT })
ok(composed.endsWith(DRAFT_TEXT.trim()), '★ the carrier does NOT rewrite the user text: no prefix, no escaping, the composed body ends with it verbatim')
ok(composed.split('\n').filter((l) => l === '## ' + BLUEPRINT.BLUEPRINT_TEXT_SECTION).length === 1,
  'exactly ONE segment boundary is written (the `## 正文` marker); the user\'s own `## ` lines are content', { marker: '## ' + BLUEPRINT.BLUEPRINT_TEXT_SECTION })
ok(typeof BLUEPRINT.blueprintTextOf === 'function' && BLUEPRINT.blueprintTextOf('') === '' && BLUEPRINT.blueprintTextOf('- path：x\n- status：draft\n- revision：1') === '',
  'a body with no `## 正文` marker yields empty text (tolerant absence, named by the row problems if anything is wrong)', typeof BLUEPRINT.blueprintTextOf)

console.log('=== 4. 口径 ①: THE TEXT MAY SAY 「草案」 WHILE THE ROW IS `current` — THE RECEIPT SAYS WHICH ONE WINS ===')
ok(parsedCurrent && parsedCurrent.text.includes('状态：草案（draft），尚未生效') && parsedCurrent.fields.status === 'current',
  '★ BOTH facts coexist on disk: the header says status:current, the proposer\'s prose still says 「状态：草案」 (run-36 looked self-contradictory)', parsedCurrent && { header: parsedCurrent.fields.status, textHasDraft: parsedCurrent.text.includes('状态：草案') })
ok(typeof stateAfter.parsed.statusMeans === 'string' && /表头/.test(stateAfter.parsed.statusMeans) && /正文/.test(stateAfter.parsed.statusMeans) && /不参与判断/.test(stateAfter.parsed.statusMeans),
  '★ state receipt: `statusMeans` says the status comes from the HEADER LINE only and the prose never decides it', stateAfter.parsed.statusMeans)
ok(typeof stateAfter.parsed.textMeans === 'string' && /## 正文/.test(stateAfter.parsed.textMeans) && /逐字/.test(stateAfter.parsed.textMeans) && /不改写/.test(stateAfter.parsed.textMeans),
  '★ state receipt: `textMeans` says the text is verbatim and adoption never rewrites it (so 「草案」 there is the proposal\'s wording)', stateAfter.parsed.textMeans)
ok(typeof adopted1.parsed.statusMeans === 'string' && typeof adopted1.parsed.textMeans === 'string' && adopted1.parsed.status === 'current',
  'the ADOPT receipt carries the same two explanations next to the row it just minted (the agent acting on it is not left to guess)', { status: adopted1.parsed.status, hasStatusMeans: typeof adopted1.parsed.statusMeans, hasTextMeans: typeof adopted1.parsed.textMeans })

console.log('=== 5. 口径 ②: THE ADOPTED DRAFT STAYS A DRAFT IN HISTORY — append-only, AND THE RECEIPT SAYS SO ===')
const stateH = stateAfter.parsed
ok(Array.isArray(stateH.history) && stateH.history.length === 2, 'history holds both rows (draft + current): nothing was rewritten in place', stateH.history && stateH.history.length)
const draftInHistory = stateH.history.filter((h) => h.id === draftId)[0]
ok(draftInHistory && draftInHistory.status === 'draft' && draftInHistory.adoptedBy === null,
  '★ the adopted draft row STILL says status:"draft"/adoptedBy:null (append-only: it records "was proposed", not "was adopted")', draftInHistory)
const currentInHistory = stateH.history.filter((h) => h.id === currentId)[0]
ok(currentInHistory && currentInHistory.status === 'current' && currentInHistory.proposalId === draftId,
  '★ "who adopted it" is answered by the CURRENT row: proposalId = the draft id, adoptedBy = the chair seat', currentInHistory)
ok(typeof stateH.historyMeans === 'string' && /append-only/.test(stateH.historyMeans) && /proposalId/.test(stateH.historyMeans) && /draft/.test(stateH.historyMeans),
  '★ state receipt: `historyMeans` explains the append-only reading and names `proposalId` as the link', stateH.historyMeans)

console.log('=== 6. 口径 ③: `revisions:2` vs `currentRevision:1` — TWO RULERS, NAMED, AND THE ARITHMETIC SHOWN ===')
ok(stateH.revisions === 2 && stateH.currentRevision === 1,
  '★ both numbers are reported and they differ on purpose (run-36 read them as one contradicting the other)', { revisions: stateH.revisions, currentRevision: stateH.currentRevision })
const revisionNumbers = Array.isArray(stateH.history) ? stateH.history.map((h) => h.revision) : []
ok(revisionNumbers.length === 2 && new Set(revisionNumbers).size === 1 && revisionNumbers[0] === 1,
  'the draft and its adoption share ONE revision number — that is why one round is 2 rows but +1 revision', revisionNumbers)
ok(typeof stateH.revisionsMeans === 'string' && /现存行数/.test(stateH.revisionsMeans) && /currentRevision/.test(stateH.revisionsMeans) && /\+2/.test(stateH.revisionsMeans) && /\+1/.test(stateH.revisionsMeans),
  '★ state receipt: `revisionsMeans` names the two rulers and the per-round arithmetic (rows +2, revision +1)', stateH.revisionsMeans)
const draft2 = await call({ action: 'propose', member: 'r-1', text: '第二版蓝图：\n## 一、只改一条\n把待办 ① 写成恢复顺序。' })
ok(draft2.ok && draft2.parsed.revision === 2, 'a new proposal after adoption is revision 2 (currentRevision + 1)', draft2.parsed && draft2.parsed.revision)
const stateDraft2 = (await call({ action: 'state' })).parsed
ok(stateDraft2.revisions === 3 && stateDraft2.currentRevision === 1 && stateDraft2.draftsWaiting === 1,
  '★ propose alone adds ONE row: revisions 2 → 3 while currentRevision stays 1 (the arithmetic in revisionsMeans, measured)', { revisions: stateDraft2.revisions, currentRevision: stateDraft2.currentRevision, drafts: stateDraft2.draftsWaiting })
const adopted2 = await call({ action: 'adopt', member: 'acad', draft: draft2.parsed.id })
ok(adopted2.ok && adopted2.parsed.revision === 2 && adopted2.parsed.previousRevision === 1, 'the chair adopts r2 over r1', adopted2.parsed && { revision: adopted2.parsed.revision, previous: adopted2.parsed.previousRevision })
const stateEnd = (await call({ action: 'state' })).parsed
ok(stateEnd.revisions === 4 && stateEnd.currentRevision === 2,
  '★ one full propose+adopt round: revisions 2 → 4 (+2 rows) and currentRevision 1 → 2 (+1 revision) — exactly what `revisionsMeans` claims', { revisions: stateEnd.revisions, currentRevision: stateEnd.currentRevision })
ok(typeof adopted2.parsed.revisionsMeans === 'string' && adopted2.parsed.revisions === stateEnd.revisions - 0 && adopted2.parsed.currentRevision === 2,
  'the adopt receipt itself carries the numbers AND the explanation (a reader never has to reconcile two receipts)', adopted2.parsed && { revisions: adopted2.parsed.revisions, currentRevision: adopted2.parsed.currentRevision, means: typeof adopted2.parsed.revisionsMeans })

console.log('=== 7. TEETH: THE SAME ASSERTIONS GO RED ON A CARRIER THAT KEEPS THE OLD "UNTIL THE NEXT `## `" READING ===')
const oldReading = ((shared.sections || {})[BLUEPRINT.BLUEPRINT_TEXT_SECTION] || []).join('\n').trim()
ok(body && oldReading.length > 0 && oldReading.length < DRAFT_TEXT.trim().length * 0.5,
  'the OLD reading (the `## 正文` section as the shared parser cuts it) really loses most of the text on this exact body — the reproduction is not vacuous', body ? { old: oldReading.length, real: DRAFT_TEXT.trim().length } : null)
const noMarker = BLUEPRINT.parseBlueprint({ id: 'x', track: 'blueprint', kind: 'blueprint', state: 'live', body: '- path：Shared/Protocol.md\n- status：draft\n- revision：1' })
ok(noMarker.text === '' && noMarker.ok === true, 'a well-formed header with no `## 正文` reads as empty text, not as an error (absence is tolerated, not invented)', noMarker && { text: noMarker.text, ok: noMarker.ok })

await rm(main.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
await rm(TMP_ROOT, { recursive: true, force: true })
console.log('')
console.log('=== VMU RUN36 BLUEPRINT TEXT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  · ' + f); process.exitCode = 1 }
