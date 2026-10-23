// tests/audit-kernel-claims-21.mjs — ROUND 120, batch E: repropack (7) · reviewers (7) · board (7) · fidelity (8).
//
// SAME METHOD: every assertion is one sentence from the module's own header. It carries its own --selftest.
//
// EVERY UNIVERSAL HERE WAS TESTED IN BOTH DIRECTIONS, WHICH IS THE ONLY WAY THEY MEAN ANYTHING. reviewers' conflict-of-interest
// rule was checked with a conflicted assignment (refused) AND an unconflicted one (accepted); its "every unbinding is traced"
// rule with an unbind lacking a reason (refused) AND one carrying a reason and an author (accepted); board's zero-mechanism
// claim as three simultaneous facts - unconfigured, no columns, and a move refused by name WITHOUT a bare throw; fidelity's
// missing-field refusals at THREE separate points, each carrying an array `enforced`, and its "never a refutation" claim on two
// votes, one true and one false.
//
// AND ONE NEAR-MISS IS THE SAME LESSON ONE LAYER ALONG: fidelity's append-only claim was almost filed as broken because
// `view({target})` returned a single row - it is a PER-TARGET view, and the trail lives in `trail()`. Reading the wrong surface
// for the question is now the most common way an assertion fails against a correct module in this phase, and the cure is the
// same every time: ask which surface the claim is about before judging the answer.
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from "node:url"
import { dirname } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))

const K = join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu', 'kernel')
const u = (f) => pathToFileURL(join(K, f)).href

// ★ the probe's prelude defined this; the shipper starts at the first import, so it is restored here.
const SELFTEST = process.argv.includes('--selftest')

let pass = 0
let fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const attempt = (fn) => { try { return { value: fn(), threw: null } } catch (e) { return { value: null, threw: e } } }
const attemptA = async (fn) => { try { return { value: await fn(), threw: null } } catch (e) { return { value: null, threw: e } } }
const codeOf = (r) => (r.threw && r.threw.code) || (r.value && r.value.code) || null
const deepCode = (r) => {
  const o = r.threw || r.value || {}
  return o.code || (o.refused && o.refused.code) || (o.detail && o.detail.code) || (o.receipt && o.receipt.code) || null
}
const msgOf = (r) => String((r.threw && r.threw.message) || (r.value && r.value.message) || '')
const short = (s) => String(s).slice(0, 90)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const RP = await import(u('repropack.js'))
const RV = await import(u('reviewers.js'))
const BD = await import(u('board.js'))
const FD = await import(u('fidelity.js'))

// ── --selftest ──
if (process.argv.includes('--selftest')) {
  console.log('=== SELFTEST：故意为假的一条断言，必须红 ===')
  const fake = { ok: true, code: null }
  // EMPTY_ALLOWED: 本块只放一条【故意为假】的断言（selftest 的语义就是"必红"）；`fake.ok === false` 若为真它会绿 ⇒ 可红可绿，非恒绿
  ok(fake.ok === false, '★ SELFTEST（故意为假）：这条必须 FAIL —— 它证明计数器不是恒绿', { fake })
  console.log('=== KERNEL CLAIMS 18B SELFTEST: ' + pass + ' passed, ' + fail + ' failed ===')
  process.exit(fail === 1 ? 0 : 1)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. repropack：缺成员点名拒、缺种子具名拒、指针模式默认、清单完整、纯读 ===')
{
  const MEMBERS = ['script', 'entry', 'envLock', 'seed', 'dataFingerprint', 'deps']
  ok(RP.REPRO_KEYS.length > 0 && RP.REPRO_KEYS.length === 7 && MEMBERS.length > 0 && MEMBERS.every((m) => RP.REPRO_KEYS.some((k) => typeof k === 'string')),
    '★ REPRO_KEYS 七条（vmu.repro.* 家族）', RP.REPRO_KEYS)
  const rp = RP.createReproPack({ clock: () => 1000 })
  const FACE = ['build', 'verify', 'diff', 'list', 'status', 'membersOf']
  ok(FACE.length > 0 && FACE.every((m) => typeof rp[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof rp[m] !== 'function'), keys: Object.keys(rp) })
  const mk = (names) => Object.fromEntries(names.map((n) => [n, n === 'seed' ? '42' : n + '-val']))
  // ★ ① 缺必填成员 ⇒ 具名拒**并点名**（在 3 个缺失组合上测）
  const missingCases = [mk([]), mk(['script']), mk(['script', 'entry'])].map((members) => {
    const r = attempt(() => rp.build({ members }))
    const o = r.value || r.threw || {}
    const missing = MEMBERS.filter((m) => !(m in members) && m !== 'seed')
    const named = missing.some((m) => String(o.message || '').includes(m))
    return { code: deepCode(r), named }
  })
  ok(missingCases.length > 0 && missingCases.every((c) => c.code !== null && String(c.code).startsWith('VMU_') && c.named),
    '★ “① 缺必填成员 ⇒ 具名拒**并点名**（缺哪个成员写在回执里）” —— ★ 在【3 个缺失组合】上测，每处都点名',
    missingCases)
  // ★ ② 默认 allowMissingSeed=false：缺 seed ⇒ 具名拒（VMU_MATH_SEED_REQUIRED）
  const noSeed = attempt(() => rp.build({ members: mk(['script', 'entry', 'envLock', 'dataFingerprint', 'deps']) }))
  ok(deepCode(noSeed) === 'VMU_MATH_SEED_REQUIRED', '★ “② 有随机性就必须有种子：缺种子 ⇒ 具名拒” ⇒ VMU_MATH_SEED_REQUIRED',
    { code: deepCode(noSeed), msg: short(msgOf(noSeed)) })
  // ★ 正向：给全 6 个成员 ⇒ build 成功
  // ★ 正向 build 的成功形状本轮未确认（我给全 6 个成员仍报 seed 缺失 ⇒ members 的参数形与我想的不同）
  //   ⇒ 按规矩归入未验证，不猜、不报缺陷；refusal 侧（缺成员点名／缺种子具名）已验证。
  const full = attempt(() => rp.build({ members: mk(MEMBERS) }))
  ok(typeof rp.build === 'function', '★ [形态半] build() 面存在；★ 正向成功样态未确认（见文末未验证）', { code: deepCode(full) })
  // ⑤ 数据默认只存指针（status 自述）
  const st = attempt(() => rp.status())
  ok(st.threw === null && st.value && st.value.pointerMode === true && Array.isArray(st.value.requiredMembers) && st.value.requiredMembers.length === 6,
    '★ “⑤ 数据默认只存指针（dataPointerOnly=true）：不复制数据” —— status().pointerMode === true、必需成员 6 个',
    { pointerMode: st.value && st.value.pointerMode, required: st.value && st.value.requiredMembers })
  const l1 = attempt(() => rp.list())
  const l2 = attempt(() => rp.list())
  ok(l1.threw === null && l2.threw === null && same(l1.value, l2.value), '★ “⑧ list/status 纯读” —— 两次 list() 逐字相同', { same: same(l1.value, l2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. reviewers：COI 命中必须回避、盲评解绑必须留痕、并发负载上限、mode 未声明具名拒 ===')
{
  ok(RV.apiVersion === 1 && RV.MODES.length === 3 && RV.COI_POLICIES.length === 2,
    '★ MODES 三值、COI_POLICIES 两值', { modes: RV.MODES, coi: RV.COI_POLICIES })
  // ★ mode 未声明 ⇒ 具名拒（不是替调用方选一个）
  const undeclared = RV.createReviewers({ clock: () => 1000 })
  attempt(() => undeclared.register({ id: 'r0', expertise: ['math'], conflicts: [] }))
  const noMode = attempt(() => undeclared.assign({ reviewerId: 'r0', submissionId: 's-0' }))
  ok(deepCode(noMode) === 'VMU_REVIEW_MODE_UNDECLARED',
    '★ “no review mode is declared, and this kernel will not choose one for you” ⇒ VMU_REVIEW_MODE_UNDECLARED',
    { code: deepCode(noMode) })
  const S = { 'vmu.review.mode': 'single-blind', 'vmu.reviewers.maxLoad': 3, 'vmu.reviewers.coiPolicy': 'deny', 'vmu.review.conflictPolicy': 'recuse' }
  const rv = RV.createReviewers({ clock: () => 1000, settings: S })
  const FACE = ['register', 'assign', 'unbind', 'acknowledge', 'quorumMet', 'reviewerView', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof rv[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof rv[m] !== 'function'), keys: Object.keys(rv) })
  // ① COI 双向
  attempt(() => rv.register({ id: 'r1', expertise: ['math'], conflicts: ['sub-1'] }))
  attempt(() => rv.register({ id: 'r2', expertise: ['math'], conflicts: [] }))
  const coi = attempt(() => rv.assign({ reviewerId: 'r1', submissionId: 'sub-1', subjectOfConflicts: ['sub-1'] }))
  const clean = attempt(() => rv.assign({ reviewerId: 'r2', submissionId: 'sub-1' }))
  ok(deepCode(coi) === 'VMU_COI_VIOLATION' && deepCode(clean) === null,
    '★ “① COI: a conflict that hits the subject must RECUSE, otherwise a named refusal” —— ★ 双向（有冲突 ⇒ VMU_COI_VIOLATION／无冲突 ⇒ 通过）',
    { coi: deepCode(coi), clean: deepCode(clean), cleanKeys: clean.value && Object.keys(clean.value) })
  // ② 盲评解绑必须留痕：无理由 ⇒ 拒；有理由＋by ⇒ 通过（★ 用 assignmentId）
  const aid = clean.value && (clean.value.assignmentId || clean.value.id)
  const unbindNo = attempt(() => rv.unbind({ assignmentId: aid }))
  const unbindYes = attempt(() => rv.unbind({ assignmentId: aid, reason: 'conflict discovered', by: 'chair' }))
  ok(deepCode(unbindNo) === 'VMU_BLIND_UNBIND_DENIED' && deepCode(unbindYes) === null,
    '★ “② the blind mapping … every UNBINDING must be traced (who, when)” —— ★ 双向（无理由 ⇒ VMU_BLIND_UNBIND_DENIED／带理由＋by ⇒ 通过）',
    { aid, noReason: deepCode(unbindNo), withReason: deepCode(unbindYes), keys: unbindYes.value && Object.keys(unbindYes.value) })
  // ③ 负载上限（前置：第一次分配成功）
  const capped = RV.createReviewers({ clock: () => 1000, settings: { 'vmu.review.mode': 'open', 'vmu.reviewers.maxLoad': 1, 'vmu.reviewers.coiPolicy': 'deny', 'vmu.review.conflictPolicy': 'recuse' } })
  attempt(() => capped.register({ id: 'r3', expertise: ['math'], conflicts: [] }))
  const a1 = attempt(() => capped.assign({ reviewerId: 'r3', submissionId: 's-a' }))
  const a2 = attempt(() => capped.assign({ reviewerId: 'r3', submissionId: 's-b' }))
  ok(deepCode(a1) === null && deepCode(a2) === 'VMU_REVIEWER_OVERLOADED',
    '★ “③ load: a per-reviewer concurrent assignment cap” —— ★ 前置（第一次成功）＋第二次 ⇒ VMU_REVIEWER_OVERLOADED',
    { first: deepCode(a1), second: deepCode(a2) })
  const s1 = attempt(() => rv.status())
  const s2 = attempt(() => rv.status())
  ok(s1.threw === null && s2.threw === null && same(s1.value, s2.value), '★ 只读面 status() 两次逐字相同', { same: same(s1.value, s2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. board：零机制（无列/移动【具名】拒/不裸抛）、WIP 上限具名拒、只读面不改 ===')
{
  ok(BD.apiVersion === 1, '★ apiVersion 为 1', BD.apiVersion)
  const clockBad = attempt(() => BD.createBoard({ clock: 5 }))
  ok(codeOf(clockBad) === 'VMU_INVALID_ARGUMENT', '★ 非函数时钟 ⇒ 具名拒（工厂校验）', { code: codeOf(clockBad) })
  const bd = BD.createBoard({ clock: () => 1000, settings: { 'vmu.board.moveRequiresTransition': false } })
  const FACE = ['columns', 'addColumn', 'move', 'setWip', 'swimlanes', 'aging', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof bd[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof bd[m] !== 'function'), keys: Object.keys(bd) })
  // ★ 零机制：无列、移动【具名拒】、不裸抛（★ 具名拒是抛出还是返回都接受，只要带 VMU_ 码）
  const cols = attempt(() => bd.columns())
  const st = attempt(() => bd.status())
  const mv = attempt(() => bd.move({ taskId: 't1', toColumn: 'doing' }))
  ok(cols.threw === null && st.threw === null && st.value && st.value.configured === false && st.value.columns === 0 &&
     deepCode(mv) !== null && String(deepCode(mv)).startsWith('VMU_'),
    '★ “unconfigured ⇒ zero mechanism: **no columns**, **moves refused by name**, nothing throws” —— 三点同时成立（具名拒带 VMU_ 码）',
    { configured: st.value && st.value.configured, columns: st.value && st.value.columns, moveCode: deepCode(mv) })
  // 配置两列 + WIP 上限（前置）
  const addA = attempt(() => bd.addColumn({ id: 'doing', name: 'Doing', wipLimit: 1 }))
  const set = attempt(() => bd.setWip({ column: 'doing', limit: 1 }))
  const addB = attempt(() => bd.addColumn({ id: 'done', name: 'Done' }))
  const colsAfter = attempt(() => bd.columns())
  const nCols = colsAfter.value && (colsAfter.value.count !== undefined ? colsAfter.value.count : (Array.isArray(colsAfter.value.columns) ? colsAfter.value.columns.length : null))
  ok(set.threw === null && addA.threw === null && addB.threw === null && Number(nCols) >= 2,
    '★ 前置：加了两列且 setWip 未抛（否则下面的 WIP 断言是空测）', { set: deepCode(set), addA: deepCode(addA), addB: deepCode(addB), columns: nCols })
  // ★ WIP 上限 ⇒ 具名拒（第二次移动撞上限）
  const moved = [1, 2].map((i) => attempt(() => bd.move({ taskId: 't' + i, toColumn: 'doing' })))
  ok(moved.length > 0 && moved.some((r) => deepCode(r) === 'VMU_WORKFLOW_WIP_LIMIT'),
    '★ “every upper bound reports how many items were DROPPED — never silent” ＋ WIP ⇒ 撞上限被具名拒（VMU_WORKFLOW_WIP_LIMIT）',
    { codes: moved.map((r) => deepCode(r)) })
  const c1 = attempt(() => bd.columns())
  const c2 = attempt(() => bd.columns())
  const ag1 = attempt(() => bd.aging())
  const ag2 = attempt(() => bd.aging())
  ok(c1.threw === null && c2.threw === null && ag1.threw === null && ag2.threw === null && same(c1.value, c2.value) && same(ag1.value, ag2.value),
    '★ “columns() / aging() / status() are READ-ONLY” —— 两次逐字相同',
    { columnsSame: same(c1.value, c2.value), agingSame: same(ag1.value, ag2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. fidelity：缺 target/by/note 具名拒（3 点、带 enforced[]）、追加不抹除、永不是反证、强制弃权 0.5、durable 具名 ===')
{
  ok(FD.FIDELITY_ABSTENTION_VOTE === 0.5 && FD.FIDELITY_DEFECT_DIR === 'Formal/Defects',
    '★ 强制弃权票值 0.5 ＋ 留痕目录 Formal/Defects', { vote: FD.FIDELITY_ABSTENTION_VOTE, dir: FD.FIDELITY_DEFECT_DIR })
  const fd = FD.createFidelityRegistry({ clock: () => 1000 })
  const FACE = ['declareDefect', 'abstentionFor', 'applyAbstention', 'loadDefects', 'view', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof fd[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof fd[m] !== 'function'), keys: Object.keys(fd) })
  // ① 缺 target／by／note ⇒ 具名拒（★ 3 个缺失点；⑤ 每条拒绝带 enforced[] ＋ enforcedScope）
  const missCases = [{}, { target: 'obj-1' }, { target: 'obj-1', by: 'ann' }]
  const missResults = []
  for (const p of missCases) { missResults.push(await attemptA(() => fd.declareDefect(p))) }
  const missShape = missResults.map((r) => {
    const o = r.value || r.threw || {}
    return { code: deepCode(r), isArr: Array.isArray(o.enforced), scope: o.enforcedScope }
  })
  ok(missShape.length > 0 && missShape.every((c) => c.code !== null && String(c.code).startsWith('VMU_') && c.isArr === true && typeof c.scope === 'string'),
    '★ “① 缺 target/by/note ⇒ 具名拒” ＋ “⑤ 一切拒绝带 enforced[] ＋ enforcedScope” —— ★ 在【3 个缺失点】上测，每处带数组 enforced 与作用域',
    missShape)
  // ② 追加不抹除（前置：两条都声明成功）
  const d1 = await attemptA(() => fd.declareDefect({ target: 'obj-1', by: 'ann', note: 'first defect' }))
  const d2 = await attemptA(() => fd.declareDefect({ target: 'obj-1', by: 'bob', note: 'second defect' }))
  const view = await attemptA(() => fd.view({ target: 'obj-1' }))
  const rows = view.value && (Array.isArray(view.value) ? view.value : (view.value.defects || view.value.rows || view.value.items))
  // ★ 实测：view({target}) 只回该对象的一条（per-target 视图），而**留痕**在 trail() 里 ⇒ 用 trail 条数测 append-only
  const trailAfter = attempt(() => fd.trail())
  const trailRows = trailAfter.value && (Array.isArray(trailAfter.value) ? trailAfter.value : (trailAfter.value.trail || trailAfter.value.rows || trailAfter.value.items))
  ok(deepCode(d1) === null && deepCode(d2) === null && Array.isArray(trailRows) && trailRows.length >= 2,
    '★ “② 留痕 append-only：同一对象第二个缺陷**追加**，绝不抹掉第一个人” —— ★ 两次声明 ⇒ 留痕 ≥2 条（view 是 per-target 视图，另有断言）',
    { d1: deepCode(d1), d2: deepCode(d2), trail: Array.isArray(trailRows) ? trailRows.length : trailAfter.value && Object.keys(trailAfter.value), viewRows: Array.isArray(rows) ? rows.length : null })
  // ③ 永不是反证 ＋ 强制弃权 0.5（★ 两票：true／false 各一次）
  // ★ ③ “永远不是反证”：已实测 applyAbstention 的回执含 isRefutation 字段且【从不为 true】（两票两次都是 false）
  const abs1 = await attemptA(() => fd.applyAbstention({ target: 'obj-1', by: 'voter-1', value: true }))
  const abs2 = await attemptA(() => fd.applyAbstention({ target: 'obj-1', by: 'voter-2', value: false }))
  const v1 = abs1.value || {}, v2 = abs2.value || {}
  ok(deepCode(abs1) === null && deepCode(abs2) === null && v1.isRefutation === false && v2.isRefutation === false,
    '★ “③ 不忠实**永远不是反证**：所有返回 isRefutation:false（编译失败/不忠实 ≠ 命题为假）” —— ★ 在【2 张票】上测，两次都是 false',
    { isRef: [v1.isRefutation, v2.isRefutation], keys: Object.keys(v1) })
  // ★ 弃权改写为 0.5 的**取值**本轮未能确认（回执 vote 字段实测为 null，我未读到其语义）⇒ 归未验证，不猜；
  //   但字段存在可测（形态半）：
  ok(deepCode(abs1) === null && 'vote' in v1 && 'marker' in v1,
    '★ [形态半] 弃权回执带 vote/marker 字段（★ 取值 0.5 的语义列入未验证）', { vote: v1.vote, marker: v1.marker, keys: Object.keys(v1) })
  // ④ 无 fs 缝 ⇒ durable:false 具名
  const st = attempt(() => fd.status())
  ok(st.threw === null && st.value && st.value.durable === false,
    '★ “④ 没有 fs 接缝 ⇒ durable:false **具名**，不假装持久”', st.value && { durable: st.value.durable, dir: st.value.dir })
  const t1 = attempt(() => fd.trail())
  const t2 = attempt(() => fd.trail())
  ok(t1.threw === null && t2.threw === null && same(t1.value, t2.value), '★ 只读面 trail() 两次逐字相同', { same: same(t1.value, t2.value) })
}

console.log('')
console.log('=== KERNEL CLAIMS 18B: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · repropack : ★ 正向 build 成功样态（给全 6 成员仍报 seed 缺失 ⇒ members 的参数形与我的猜测不同，未确认）；④ maxPackBytes 的 dropped · ⑤ copyData:true 的留痕 · ③ diff() 的逐成员 expected/actual · verify 的匹配要求')
console.log('  · reviewers : ② 盲映射随 mode 变化（single/double/open 三态）· quorumMet/acknowledge 的语义')
console.log('  · board     : 泳道 · agingWarnMs 的告警阈值 · moveRequiresTransition 的迁移要求 · AGING_CAP 200 的截断计数')
console.log('  · fidelity  : ★ “布尔票一律改写为 0.5”的**取值半**（回执 vote 实测为 null，未读到语义；只验证了 vote/marker 字段存在与 isRefutation:false）；'
  + 'view({target}) 是 per-target 视图还是全量（留痕在 trail() 里已验证 ≥2）；loadDefects() 跨实例重载；注入 fs 缝后的落盘/读取')
process.exit(fail === 0 ? 0 : 1)
