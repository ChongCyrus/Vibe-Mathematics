/**
 * tests/vmu-run219-feedback54.test.mjs — RUN 219：run 55（FEEDBACK54）量到的「回执回答的不是被问的问题」。
 *
 * THE FIVE DEFECTS THIS SUITE PINS (all MEASURED in run 55, task-sim55.txt):
 *   ① `vibe-math-vmu/packs/v5r/tools.js` — the blueprint face PUBLISHED `draft` and never forwarded it, so a propose that
 *      passed `draft:"rec-37"` came back with `continuedBase.requested:null` and `why:"this call named no draft"` — a
 *      sentence about the request that contradicted the request. The name is forwarded now.
 *   ② `vibe-math-vmu/kit/paper.js` — `final` with no `member` printed `the academician (chair seat) must finalise this
 *      paper; "" is not on the roster` while `status.editorReading` showed the chair SEATED: the empty string was a
 *      MISSING SIGNATURE, not a roster lookup result, and the hint offered two repairs for neither problem.
 *   ③ `vibe-math-vmu/packs/v5r/paper-quality.js` — `writeAs` said both forms "pass" (read as equivalent), and
 *      `requiredLineMath` wrapped a whole Chinese sentence in one `$…$` pair, contradicting the convention that only a
 *      span between two `$` is kept verbatim as math.
 *   ④ `vibe-math-vmu/host.js` — `records prune` could only prune by POSITION (`keep:N`), so "remove the ONE draft I just
 *      filed" had no safe expression; a task brief's `keep:1` would have moved the CURRENT revision to the trash.
 *      Rows can be named by `ids` now and the receipt says which selection answered (`selection`).
 *   ⑤ `vibe-math-vmu/kernel/meetings.js` — the chair-turn hint said "the chair then acts", not that the chair's round can
 *      OPEN the meeting, FILE the card, RUN the formal job and WRITE p=1 in the same turn (measured: it did).
 *
 * RULE E: every fixture assertion is preceded by an explicit non-empty check; refusals are normalised from BOTH shapes.
 *
 * Run: node tests/vmu-run219-feedback54.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/r219'
mkdirSync(TMP, { recursive: true })

const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const SRC_PAPER = readFileSync(join(VMU, 'kit', 'paper.js'), 'utf8')
const SRC_QUALITY = readFileSync(join(VMU, 'packs', 'v5r', 'paper-quality.js'), 'utf8')
const SRC_HOST = readFileSync(join(VMU, 'host.js'), 'utf8')
const SRC_MEETINGS = readFileSync(join(VMU, 'kernel', 'meetings.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, text)
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const quality = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'paper-quality.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  const specOf = (n) => state.specs.filter((s) => s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: 'the spec registry is empty for this name' }
    try {
      const raw = await spec.execute(args)
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: 'the face answered ' + String(raw), hint: null }
    } catch (e) {
      return { ok: false, code: codeOf(e) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, state, specOf, call }
}

console.log('=== 0. THE SENTENCES ARE IN THE SOURCE ===')

ok(SRC_TOOLS.includes('const namedDraft = str(args.draft || '),
  '★ ① the blueprint face READS the draft it publishes (run 55: it published it and dropped it)', SRC_TOOLS.includes('namedDraft'))
ok(SRC_TOOLS.includes('draft: namedDraft'),
  '★ ① and forwards it into the proposal (the receipt can no longer say "you named no draft" about a call that did)', SRC_TOOLS.includes('draft: namedDraft'))
has(SRC_TOOLS, '`draft` OPTIONAL names which OPEN draft', '★ ① the propose description says what `draft` means (it used to list it only under adopt)')

ok(SRC_PAPER.includes('final needs a SIGNER'),
  '★ ② an unsigned final is told it needs a SIGNATURE (run 55: it was told "" was not on the roster)', SRC_PAPER.includes('final needs a SIGNER'))
has(SRC_PAPER, 'MISSING SIGNATURE, not a roster miss', '★ ② and the hint separates the two facts by name')
ok(SRC_PAPER.includes("if (str(member).trim() === '') {\n") &&
  SRC_PAPER.indexOf("if (str(member).trim() === '') {") < SRC_PAPER.lastIndexOf("const row = (kernel.members ? kernel.members.roster() : []).filter((m) => m.id === str(member))[0]"),
  '★ ② the unsigned branch returns BEFORE the roster lookup (an empty member never becomes a roster miss)',
  { signer: SRC_PAPER.indexOf("if (str(member).trim() === '') {"), roster: SRC_PAPER.lastIndexOf('m.id === str(member)') })

has(SRC_QUALITY, 'only a span between two $…$ is typeset as mathematics', '★ ③ `writeAs` separates "passes the gate" from "is typeset" (run 55: 过闸 ≠ 排得出来)')
ok(SRC_QUALITY.includes('function mathWrapped('),
  '★ ③ the math example is built by wrapping math runs, not the whole sentence', SRC_QUALITY.includes('mathWrapped'))
ok(SRC_QUALITY.includes('requiredLineMath: hasMath && !hasIdentifier ? mathWrapped(name) : null'),
  '★ ③ and `requiredLineMath` uses it (the old form wrapped the Chinese sentence too)', SRC_QUALITY.includes('mathWrapped(name)'))
has(SRC_QUALITY, '过闸不等于排得出来', '★ ③ the hint says passing the gate is not being typeset')

has(SRC_HOST, "ids: param('string', 'prune：按 id 只清指定行", '★ ④ prune declares a by-id selection (run 55: only keep:N existed)')
ok(SRC_HOST.includes("selection: byIds ? 'ids' : 'keep'"),
  '★ ④ the receipt states which question was answered', SRC_HOST.includes('selection: byIds'))
has(SRC_HOST, 'none of the ids named', '★ ④ an id that is not a live row of the track is refused by name')

has(SRC_MEETINGS, 'That single turn is NOT a small unlock', '★ ⑤ the chair-turn hint says what that turn can do (open + file + run + write p=1 in one round)')
has(SRC_MEETINGS, 'RECOMPUTE the chain afterwards', '★ ⑤ and tells the office to recompute instead of replaying')

console.log('=== 1. ① A NAMED DRAFT IS THE DRAFT THE RECEIPT REPORTS (run 55: requested:null beside draft:"rec-37") ===')
const A = await boot({ root: mkdtempSync(join(TMP, 'k-')) })
const kernel = A.handle.kernel
ok(kernel !== null && typeof kernel.records === 'object', 'the kernel booted with a records face (a null kernel would make every assertion below vacuous)', kernel === null)
const founded = await A.call('vibe_v5_start', { researcherCount: 2, problem: '前 n 个奇数之和等于 n 的平方' })
ok(founded.ok !== false && Array.isArray(founded.hired) && founded.hired.length >= 3,
  'the institute is founded with a chair and two researchers (an empty roster would leave the seats unresolvable)', { ok: founded.ok, hired: founded.hired })
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const firstPropose = await A.call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-1', text: '第一行：本所目标——证明奇数求和恒等式。' })
ok(firstPropose.ok !== false && String(firstPropose.id || '') !== '', 'a draft row exists (without it there is no id to name)', { ok: firstPropose.ok, code: firstPropose.code, id: firstPropose.id })
const FIRST_DRAFT = String(firstPropose.id)
const named = await A.call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-2', draft: FIRST_DRAFT, text: '## 共同设计补充｜r-2' + '\n' + '- 复核归纳步。' })
ok(named.ok !== false, 'the continuation with an EXPLICIT draft is accepted', { ok: named.ok, code: named.code, message: named.message })
const namedBase = named.continuedBase || null
ok(namedBase !== null && typeof namedBase === 'object', '★ ① the receipt carries `continuedBase`', named.continuedBase)
ok(namedBase !== null && namedBase.requested === FIRST_DRAFT,
  '★★ ① requested NAMES the draft this call passed (run 55: it printed null and said "this call named no draft")', namedBase && { requested: namedBase.requested, FIRST_DRAFT })
ok(namedBase !== null && namedBase.actual === FIRST_DRAFT,
  '★ ① and actual is the row the text really joined', namedBase && namedBase.actual)
ok(namedBase !== null && namedBase.continued === true, '★ ① continued:true follows from both', namedBase && namedBase.continued)
has(namedBase && namedBase.why, 'continued the draft it named', '★ ① the why no longer claims the caller named nothing')

const unnamed = await A.call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-2', text: '## 无 draft 的增补｜r-2' + '\n' + '- 续写开放草案。' })
const unnamedBase = unnamed.continuedBase || null
ok(unnamedBase !== null && unnamedBase.requested === null,
  '★ ① with NO draft passed, requested is still null (the field means what it says)', unnamedBase && unnamedBase.requested)
ok(unnamedBase !== null && unnamedBase.actual === FIRST_DRAFT && unnamedBase.continued === true,
  '★ ① and actual names the OPEN draft it really joined (null would be a lie about a continued call)', unnamedBase && unnamedBase.actual)

console.log('=== 2. ② AN UNSIGNED FINAL IS A MISSING SIGNATURE, NOT A ROSTER MISS (run 55: "" is not on the roster) ===')
const started = await A.call('vibe_v5_paper', { action: 'start', target: 'run219-paper', participants: ['r-1', 'r-2'] })
ok(started.ok !== false && (started.started || started.paper || true), 'the paper starts', { ok: started.ok, code: started.code, message: started.message })
const PAPER = String((started.started && started.started.target) || 'run219-paper')
const evA = kernel.records.put({ track: 'state', kind: 'state', title: 'run219 evidence A', body: '基例：n=1 时 1=1^2。' })
const evB = kernel.records.put({ track: 'state', kind: 'state', title: 'run219 evidence B', body: '归纳步：S(n+1)=S(n)+2n+1=(n+1)^2。' })
const idEvA = String((evA && (evA.id || (evA.row && evA.row.id))) || '')
const idEvB = String((evB && (evB.id || (evB.row && evB.row.id))) || '')
ok(idEvA !== '' && idEvB !== '', 'two evidence rows exist (a part without evidence is refused by the evidence gate, which would hide the signer defect)', { idEvA, idEvB })
const part1 = await A.call('vibe_v5_paper', { action: 'part', member: 'r-1', target: PAPER, evidence: [idEvA], body: '§1 引言：奇数求和恒等式的归纳证明。' })
ok(part1.ok !== false, 'a first part is written', { ok: part1.ok, code: part1.code, message: part1.message })
const part2 = await A.call('vibe_v5_paper', { action: 'part', member: 'r-2', target: PAPER, evidence: [idEvB], body: '§2 复核：归纳步与基例。' })
ok(part2.ok !== false, 'a second part is written', { ok: part2.ok, code: part2.code, message: part2.message })
const adv1 = await A.call('vibe_v5_paper', { action: 'advance', target: PAPER })
ok(adv1.ok !== false, 'the paper advances to reviewing', { ok: adv1.ok, code: adv1.code, message: adv1.message })
const rev1 = await A.call('vibe_v5_paper', { action: 'review', target: PAPER, member: 'r-1', deliverable: true })
ok(rev1.ok !== false, 'a first review is recorded', { ok: rev1.ok, code: rev1.code, message: rev1.message })
const rev2 = await A.call('vibe_v5_paper', { action: 'review', target: PAPER, member: 'r-2', deliverable: true })
ok(rev2.ok !== false, 'a second review is recorded', { ok: rev2.ok, code: rev2.code, message: rev2.message })
const adv2 = await A.call('vibe_v5_paper', { action: 'advance', target: PAPER })
ok(adv2.ok !== false, 'the paper advances to awaiting-editor', { ok: adv2.ok, code: adv2.code, message: adv2.message })
const unsigned = await A.call('vibe_v5_paper', { action: 'final', target: PAPER, decision: 'deliverable', note: 'RUN219' })
ok(unsigned.ok === false && String(unsigned.code || '') === 'VMU_NOT_PERMITTED',
  '★ ② an unsigned final is refused BY CODE', { ok: unsigned.ok, code: unsigned.code, message: unsigned.message })
has(unsigned.message, 'final needs a SIGNER', '★★ ② and the message says the call needs a signer')
ok(!String(unsigned.message || '').includes('is not on the roster'),
  '★★ ② it does NOT print the empty string as a roster lookup result (run 55 did)', unsigned.message)
has(unsigned.hint, 'member:', '★ ② the hint names the one repair (pass member:<chair seat id>)')

console.log('=== 3. ③ THE MATH EXAMPLE WRAPS MATH, NOT THE SENTENCE (run 55: whole sentence inside one $…$) ===')
const view = {
  verified: () => ({ items: [{ id: 'v-rec-1', cardId: 'rec-1', p: 1, title: '已验证｜对任意整数 n ≥ 1，前 n 个奇数之和等于 n 的平方：Σ_{i=1}^{n}(2i-1)' }] }),
  records: { get: () => null },
}
const req = quality.verifiedRequirements({ view })
ok(req && req.ok === true && Array.isArray(req.items) && req.items.length === 1, 'the requirement list computes one line', req && { ok: req.ok, count: req.count })
const item = req && req.items && req.items[0] ? req.items[0] : null
ok(item !== null && typeof item.requiredLineMath === 'string' && item.requiredLineMath !== '',
  '★★ ③ the math example exists for a line that carries math', item && item.requiredLineMath)
ok(item !== null && !String(item.requiredLineMath).startsWith('$对'),
  '★★ ③ the Chinese words are NOT inside the math span (the old example wrapped the whole sentence)', item && item.requiredLineMath)
ok(item !== null && String(item.requiredLineMath).includes('$n ≥ 1$'),
  '★ ③ the formula run is wrapped as math', item && item.requiredLineMath)
ok(item !== null && String(item.requiredLineMath).includes('$Σ_{i=1}^{n}(2i-1)$'),
  '★ ③ every math run is wrapped separately', item && item.requiredLineMath)
has(item && item.writeAs, 'only a span between two $…$ is typeset', '★★ ③ writeAs says passing the gate is not being typeset')

console.log('=== 4. ④ PRUNE CAN NAME THE ROW IT REMOVES (run 55: keep:1 would have trashed the CURRENT revision) ===')
const putA = kernel.records.put({ track: 'progress', kind: 'progress', title: 'run219 diagnostic draft', body: 'just testing the face', settled: true })
const putB = kernel.records.put({ track: 'progress', kind: 'progress', title: 'run219 mainline row', body: 'must stay live', settled: true })
const idA = String((putA && (putA.id || (putA.row && putA.row.id))) || '')
const idB = String((putB && (putB.id || (putB.row && putB.row.id))) || '')
ok(idA !== '' && idB !== '', 'two rows exist on the same track (without ids the by-id selection cannot be tested)', { idA, idB })
const dry = await A.call('vibe_vmu_records', { action: 'prune', track: 'progress', ids: idA, dryRun: true, why: 'RUN219 dry run' })
ok(dry.ok !== false && dry.selection === 'ids',
  '★★ ④ the receipt says the selection was by ID (not by position)', { ok: dry.ok, code: dry.code, selection: dry.selection })
ok(dry.keep === null, '★ ④ `keep` is null on a by-id prune (the two selections are not interchangeable)', dry.keep)
ok(Array.isArray(dry.wouldPruneCount === undefined ? null : [dry.wouldPruneCount]) && dry.wouldPruneCount === 1,
  '★ ④ exactly ONE row would move', { wouldPruneCount: dry.wouldPruneCount, pruned: dry.pruned })
ok(Array.isArray(dry.pruned) && dry.pruned.length === 1 && dry.pruned[0].id === idA,
  '★★ ④ and it is the NAMED row, not the oldest', dry.pruned)
const acted = await A.call('vibe_vmu_records', { action: 'prune', track: 'progress', ids: idA, why: 'RUN219: the diagnostic row' })
ok(acted.ok !== false && acted.prunedCount === 1 && Array.isArray(acted.pruned) && acted.pruned[0].id === idA,
  '★ ④ the real prune moves exactly that row', { ok: acted.ok, prunedCount: acted.prunedCount, pruned: acted.pruned })
const listed = await A.call('vibe_vmu_records', { action: 'list', track: 'progress', limit: 0 })
const liveIds = (Array.isArray(listed.records) ? listed.records : []).map((r) => String(r.id))
ok(listed.ok !== false && liveIds.includes(idB) && !liveIds.includes(idA),
  '★★ ④ the other row is still LIVE (a by-id prune cannot take the current row with it)', { idA, idB, liveIds })
const byPos = await A.call('vibe_vmu_records', { action: 'prune', track: 'progress', keep: 0, dryRun: true, why: 'RUN219 keep shape' })
ok(byPos.ok !== false && byPos.selection === 'keep', '★ ④ the positional shape still reports selection:"keep"', { ok: byPos.ok, selection: byPos.selection })
const missing = await A.call('vibe_vmu_records', { action: 'prune', track: 'progress', ids: 'rec-does-not-exist', why: 'RUN219 missing' })
ok(missing.ok === false && String(missing.code || '') === 'VMU_NO_SUCH_OBJECT',
  '★ ④ an id that is not a live row of this track is refused by name', { ok: missing.ok, code: missing.code, message: missing.message })
has(missing.message, 'none of the ids named', '★ ④ and the message says nothing was moved')

console.log('')
if (failed > 0) {
  console.log('RUN 219 FEEDBACK54 FAILURES:')
  for (const f of failures) console.log('  - ' + f)
}
console.log('RUN 219 FEEDBACK54: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)
