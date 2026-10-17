// tests/audit-kernel-claims-14.mjs — ROUND 111, batch N (retention 14 · recruit 10 · fairness 13).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// THIS BATCH'S VALUE IS ITS TWO-DIRECTIONALITY. `refuse()` RETURNS rather than throws here, so every refusal assertion reads
// the returned object; and almost every negative claim is paired with its opposite - the default only REPORTS (zero mutating
// calls) while `purge({dryRun:false})` really does change the store; an unmapped title is refused while a declared mapping
// lets the same title through; passing `reputation` is refused while declaring `priorityWeights` permits it. A one-directional
// assertion passes on a module that refuses everything, which is how a vacuous verification is born.
//
// AND IT DECLINED TO FILE A DEFECT IT COULD NOT ATTRIBUTE: retention's 'skipped and counted' half. Its fixture showed a
// permanently-marked row was NOT removed, but `stats.skippedPermanent` still read 0, and the counter is incremented on two
// different paths (plan and a local in gc) - so it could not tell which path its row took. Only the shape half (the field must
// be a number) is asserted; the behaviour half is written down as unverified. Nine probe errors are also recorded, including
// the guessed quota key, the assumption that `purge` acts on library rows rather than this face's own trash, and comparing whole
// receipts whose sequence ids advance.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from "node:url"
import { dirname } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))

const REPO = join(HERE, "..")
const K = join(REPO, 'vibe-math-vmu', 'kernel')
const u = (f) => pathToFileURL(join(K, f)).href

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
const hintOf = (r) => (r.threw && r.threw.hint) || (r.value && r.value.hint) || null
const msgOf = (r) => String((r.threw && r.threw.message) || (r.value && r.value.message) || '')
const short = (s) => String(s).slice(0, 90)
const sharesOf = (v) => (v && (v.shares || v.allocations)) || null
const shareVal = (s) => Number((s && (s.share === undefined ? s.amount : s.share)) || 0)

const R = await import(u('retention.js'))
const Q = await import(u('recruit.js'))
const F = await import(u('fairness.js'))

const spyLibrary = (rows) => {
  const calls = { remove: 0, removeRevision: 0, moveToTrash: 0, restore: 0, list: 0 }
  return {
    calls,
    list: async () => { calls.list += 1; return rows },
    remove: async () => { calls.remove += 1 },
    removeRevision: async () => { calls.removeRevision += 1 },
    moveToTrash: async () => { calls.moveToTrash += 1 },
    restore: async () => { calls.restore += 1 },
  }
}
const NOW = 100 * 86400000
const oldMs = 1000
const trashedRows = () => ([
  { id: 't-old-1', bytes: 10, atMs: oldMs, trashed: true, trashedAtMs: oldMs },
  { id: 't-old-2', bytes: 10, atMs: oldMs, trashed: true, trashedAtMs: oldMs },
  { id: 't-keep', bytes: 10, atMs: oldMs, trashed: true, trashedAtMs: oldMs, markers: [R.DEFAULT_PERMANENT_MARKER] },
  { id: 't-fresh', bytes: 10, atMs: NOW, trashed: true, trashedAtMs: NOW },
])

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. retention：默认只报告、永久标记不删且计数、配额三分支、注入时钟可复算 ===')
{
  ok(R.apiVersion === 1, '★ apiVersion 为 1', R.apiVersion)
  ok(R.RETENTION_WARNING === 'VMU_RETENTION_TRUNCATED' && R.QUOTA_SOFT_WARNING === 'VMU_QUOTA_SOFT_EXCEEDED' &&
     R.DEFAULT_PERMANENT_MARKER === 'keep-forever' && R.ENFORCED_SCOPE === 'evaluated-so-far',
    '★ “Counted-truncation marker”／“Warning emitted when usage crosses the soft limit”／“Default permanent marker value (§4.3: permanent retention is explicit)”／ENFORCED_SCOPE',
    { w: R.RETENTION_WARNING, s: R.QUOTA_SOFT_WARNING, p: R.DEFAULT_PERMANENT_MARKER, e: R.ENFORCED_SCOPE })
  const ref = attempt(() => R.refuse('VMU_X', 'm', 'h'))
  ok(ref.threw === null && ref.value && ref.value.code === 'VMU_X' && ref.value.hint === 'h' && ref.value.enforcedScope === R.ENFORCED_SCOPE,
    '★ “Named refusal carrying a hint and context … D3: it also carries enforcedScope — this module has no such array, so none is invented”',
    { code: ref.value && ref.value.code, hint: ref.value && ref.value.hint, scope: ref.value && ref.value.enforcedScope })
  const noOpts = attempt(() => R.createRetention({}))
  const FACE = ['plan', 'apply', 'trash', 'restore', 'purge', 'quota', 'gc', 'status']
  ok(noOpts.threw === null && noOpts.value !== null && FACE.length > 0 && FACE.every((m) => typeof noOpts.value[m] === 'function'),
    '★ 省略 clock 合法（工厂有声明默认时钟）＋ 面方法齐备（discovery-first）',
    { threw: noOpts.threw && short(noOpts.threw.message), missing: noOpts.value ? FACE.filter((m) => typeof noOpts.value[m] !== 'function') : FACE })
  const zero = R.createRetention({ clock: () => NOW })
  const zeroPlan = await attemptA(() => zero.plan())
  ok(zeroPlan.threw === null && zeroPlan.value !== null,
    '★ “6. ZERO CONFIG never throws: without an injected `library`, `plan()` is an empty plan.”',
    zeroPlan.threw ? short(zeroPlan.threw.message) : zeroPlan.value && Object.keys(zeroPlan.value))
  const lib = spyLibrary(trashedRows())
  const rt = R.createRetention({ clock: () => NOW, library: lib, settings: { 'vmu.records.trash.retainDays': 30 } })
  const pl1 = await attemptA(() => rt.plan())
  const pl2 = await attemptA(() => rt.plan())
  await attemptA(() => rt.quota())
  attempt(() => rt.status())
  const dryApply = await attemptA(() => rt.apply())
  const dryGc = await attemptA(() => rt.gc())
  const mutating = lib.calls.remove + lib.calls.removeRevision + lib.calls.moveToTrash + lib.calls.restore
  ok(pl1.threw === null && pl2.threw === null && mutating === 0,
    '★ “1. DEFAULT REPORT ONLY: `apply`/`gc` delete nothing unless the caller passes `dryRun:false`; `plan`/`quota`/`status` never mutate”',
    { calls: lib.calls, mutating, applyCode: codeOf(dryApply), gcCode: codeOf(dryGc) })
  ok(pl1.threw === null && pl2.threw === null && pl1.value !== null && JSON.stringify(pl1.value) === JSON.stringify(pl2.value),
    '★ “5. The CLOCK is injected (`clock()`), so two runs on the same state are byte-identical.” —— 两次 plan() 逐字相同',
    { same: JSON.stringify(pl1.value) === JSON.stringify(pl2.value) })
  // ★ 纠正：purge 作用于【本面自己的 trash 表】（由 trash() 填充），不是 library 里 trashed:true 的行；
  //   而且"够不够旧"由注入时钟决定 ⇒ 用可变时钟：旧时刻 trash，新时刻 purge。
  let rk = oldMs
  const realLib = spyLibrary(trashedRows())
  const rt2 = R.createRetention({ clock: () => rk, library: realLib, settings: { 'vmu.records.trash.retainDays': 0 } })
  attempt(() => rt2.trash({ id: 't-old-1', reason: 'aged' }))
  attempt(() => rt2.trash({ id: 't-old-2', reason: 'aged' }))
  attempt(() => rt2.trash({ id: 't-keep', reason: 'explicit mark' }))
  rk = NOW
  const purgeReal = await attemptA(() => rt2.purge({ olderThanMs: 1, dryRun: false }))
  const realMutating = realLib.calls.remove + realLib.calls.moveToTrash + realLib.calls.removeRevision
  ok(purgeReal.threw === null && realMutating > 0,
    '★ 反方向：`purge({ dryRun:false })` 真的改动库（否则"默认只报告"无意义）',
    { calls: realLib.calls, mutating: realMutating, keys: purgeReal.value && Object.keys(purgeReal.value) })
  // ★ 纠正（实测）：removed[] 挂在【apply】回执上（purge 回执是 purged/dropped/warning/bytes）；
  //   skippedPermanent 这类统计在【status().counts】里，不在回执上。
  const applyLib = spyLibrary(trashedRows())
  const applyRt = R.createRetention({ clock: () => NOW, library: applyLib, settings: { 'vmu.records.trash.retainDays': 30 } })
  const applied = await attemptA(() => applyRt.apply({ dryRun: false }))
  const removed = (applied.value && Array.isArray(applied.value.removed)) ? applied.value.removed : []
  const stObj = attempt(() => applyRt.status()).value || {}
  const stCounts = stObj.counts || stObj.stats || stObj
  ok(applied.threw === null && removed.length > 0 &&
     removed.every((x) => x && typeof x.id === 'string' && typeof x.kind === 'string' && typeof x.reason === 'string' && typeof x.bytes === 'number' && typeof x.atMs === 'number') &&
     !removed.some((x) => x.id === 't-keep'),
    '★ “3. EVERY removal is traceable: `removed[]` carries {id, kind, reason, bytes, atMs}” ＋ “2. A PERMANENTLY MARKED object is never pruned”',
    { removed, counts: stCounts })
  // ★ “被跳过【并计数】”的行为半本轮未能构造：我的 fixture 里永久标记行确实【没被删】（已由上一断言的 removed[] 验证），
  //   但 skippedPermanent 仍为 0 —— 条件是 :121 `permanent===true || markers.includes(permanentMarker)`，而自增点在
  //   :147（plan）与 :328（gc 的**局部**变量）⇒ 我未能确定我的行走的是哪条路径 ⇒ **按规矩记未验证，不当缺陷**。
  //   这里只断言【计数存在】（形态半）：若 stats 里没有这个数字，本断言即红。
  ok(typeof stCounts.skippedPermanent === 'number',
    '★ [形态半] status().stats.skippedPermanent 存在且是数字（“计数”这件事存在）—— ★ 行为半（被跳过时该计数 +1）列入 UNVERIFIED',
    { statusKeys: Object.keys(stObj), statsKeys: Object.keys(stCounts), skippedPermanent: stCounts.skippedPermanent })
  const unknown = R.createRetention({ clock: () => NOW, library: spyLibrary(trashedRows()), settings: { 'vmu.quota.onExceed': 'nonsense' } })
  const unknownCall = await attemptA(() => unknown.plan())
  ok(codeOf(unknownCall) === 'VMU_RETENTION_CONFLICT' && typeof hintOf(unknownCall) === 'string',
    '★ “unknown vmu.quota.onExceed … use warn | refuse | degrade” ⇒ 具名拒 VMU_RETENTION_CONFLICT ＋ hint',
    { code: codeOf(unknownCall), hint: hintOf(unknownCall) })
  const refuseLib = spyLibrary(trashedRows())
  const refuseRt = R.createRetention({ clock: () => NOW, library: refuseLib, settings: { 'vmu.quota.onExceed': 'refuse', 'vmu.quota.hardBytes': 5 } })
  const refused = await attemptA(() => refuseRt.apply({ dryRun: false }))
  const refusedMutating = refuseLib.calls.remove + refuseLib.calls.moveToTrash + refuseLib.calls.removeRevision
  ok(codeOf(refused) === 'VMU_QUOTA_EXCEEDED' && refusedMutating === 0,
    '★ “4. … refuse (NAMED refusal BEFORE any deletion)”', { code: codeOf(refused), mutating: refusedMutating, msg: short(msgOf(refused)) })
  const degLib = spyLibrary(trashedRows())
  const degRt = R.createRetention({ clock: () => NOW, library: degLib, settings: { 'vmu.quota.onExceed': 'degrade', 'vmu.quota.hardBytes': 5 } })
  const degraded = await attemptA(() => degRt.apply({ dryRun: false }))
  ok(degraded.threw === null && degraded.value !== null && degraded.value.degraded === true,
    '★ “4. … degrade (proceed, marked `degraded`)”', degraded.threw ? short(degraded.threw.message) : { degraded: degraded.value.degraded })
  const stRet = attempt(() => rt.status())
  const thenable = stRet.value !== null && typeof stRet.value === 'object' && typeof stRet.value.then === 'function'
  ok(stRet.threw === null && stRet.value !== null && thenable === false,
    '★ “`status()` is sync (it touches no library method).”', { thenable })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. recruit：纯函数 aggregate、S-1 标题须显式映射、席位超额报 current/limit、试用期不可缩短、拒绝需理由、offer 过期 ===')
{
  ok(Q.apiVersion === 1, '★ apiVersion 为 1', Q.apiVersion)
  ok(Q.aggregate([]) === null && Q.aggregate([1, 2, 3]) === 2 && Q.aggregate([1, 2, 3, 4], 'median') === 2.5 &&
     Q.aggregate([1, 2], 'median') === 1.5 && Q.aggregate([1, 2, 3, 4, 5], 'trimmed') === 3 && Q.aggregate([1, 2], 'trimmed') === 1.5,
    '★ “Aggregate a score list. trimmed drops the min and max when at least 3 scores exist.” —— mean/median(奇偶)/trimmed(≥3 去极值、<3 不去)',
    { mean: Q.aggregate([1, 2, 3]), medOdd: Q.aggregate([1, 2, 3], 'median'), medEven: Q.aggregate([1, 2, 3, 4], 'median'), trim5: Q.aggregate([1, 2, 3, 4, 5], 'trimmed'), trim2: Q.aggregate([1, 2], 'trimmed'), empty: Q.aggregate([]) })
  const rc = Q.createRecruit({ clock: () => 1000 })
  const FACE = ['openPosting', 'apply', 'score', 'offer', 'accept', 'reject', 'probation', 'confirm', 'postings', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof rc[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof rc[m] !== 'function'), keys: Object.keys(rc) })
  const unmapped = attempt(() => rc.openPosting({ slot: '教授', seats: 1 }))
  ok(codeOf(unmapped) === 'VMU_RECRUIT_SLOT_UNKNOWN' && String(hintOf(unmapped)).includes('vmu.roles.map'),
    '★ “INVARIANT S-1: the kernel does NOT know job titles … an unmapped title is refused BY NAME.”',
    { code: codeOf(unmapped), hint: hintOf(unmapped) })
  const mapped = Q.createRecruit({ clock: () => 1000, settings: { 'vmu.roles.map': { '教授': 'researcher' }, 'vmu.admission.probationMs': 10000 } })
  const posting = attempt(() => mapped.openPosting({ slot: '教授', seats: 1 }))
  ok(posting.threw === null && posting.value !== null && typeof posting.value.id === 'string' && posting.value.slot === 'researcher',
    '★ 反方向：声明 vmu.roles.map 后【同一标题】可开岗（S-1 是"须显式映射"，不是"禁止标题"）', { value: posting.value })
  const tight = Q.createRecruit({ clock: () => 1000, settings: { 'vmu.roles.map': { '教授': 'researcher' }, 'vmu.admission.seatsMax': 1 } })
  const first = attempt(() => tight.openPosting({ slot: '教授', seats: 1 }))
  const second = attempt(() => tight.openPosting({ slot: '教授', seats: 1 }))
  ok(first.threw === null && codeOf(second) === 'VMU_RECRUIT_SEATS_EXCEEDED' && /current=\d+/.test(msgOf(second)) && /limit=\d+/.test(msgOf(second)),
    '★ “over-seating refuses with current/limit”', { first: first.value && first.value.id, code: codeOf(second), msg: short(msgOf(second)) })
  const pid = posting.value && posting.value.id
  const ap1 = attempt(() => mapped.apply({ postingId: pid, candidate: 'c1' }))
  const of1 = attempt(() => mapped.offer({ applicationId: ap1.value && ap1.value.id }))
  const ac1 = attempt(() => mapped.accept({ offerId: of1.value && of1.value.id, by: 'mgr' }))
  const memberId = ac1.value && (ac1.value.memberId || ac1.value.id)
  // ★ 纠正：probation({memberId}) 是【读面】；"试用期不可缩短"的拒绝在 confirm({memberId, by})（async）里
  const probView = attempt(() => mapped.probation({ memberId }))
  const confEarly = await attemptA(() => mapped.confirm({ memberId, by: 'mgr' }))
  ok(probView.threw === null && codeOf(confEarly) === 'VMU_RECRUIT_PROBATION_NOT_DUE',
    '★ “probation cannot be cut short” ⇒ 试用期未到即 confirm ⇒ 具名拒 VMU_RECRUIT_PROBATION_NOT_DUE（probation() 只是读面）',
    { accept: ac1.value, viewKeys: probView.value && Object.keys(probView.value), code: codeOf(confEarly), msg: short(msgOf(confEarly)) })
  const rejNoReason = attempt(() => mapped.reject({ offerId: of1.value && of1.value.id }))
  ok(codeOf(rejNoReason) === 'VMU_RECRUIT_REASON_REQUIRED',
    '★ “rejection needs a reason” ⇒ 无理由拒绝 ⇒ 具名拒 VMU_RECRUIT_REASON_REQUIRED', { code: codeOf(rejNoReason), msg: short(msgOf(rejNoReason)) })
  let tk = 1000
  const clocked = Q.createRecruit({ clock: () => tk, settings: { 'vmu.roles.map': { '教授': 'researcher' } } })
  const cp = attempt(() => clocked.openPosting({ slot: '教授', seats: 1 }))
  const ca = attempt(() => clocked.apply({ postingId: cp.value && cp.value.id, candidate: 'cx' }))
  const co = attempt(() => clocked.offer({ applicationId: ca.value && ca.value.id, expiresInMs: 100 }))
  tk = 100000
  const expired = attempt(() => clocked.accept({ offerId: co.value && co.value.id, by: 'mgr' }))
  ok(codeOf(expired) === 'VMU_RECRUIT_OFFER_EXPIRED',
    '★ “Codes: VMU_RECRUIT_OFFER_EXPIRED” ＋ 注入时钟 ⇒ 过期 offer 不得被接受',
    { code: codeOf(expired), msg: short(msgOf(expired)), offer: co.value })
  const zeroQ = Q.createRecruit({})
  const zPost = attempt(() => zeroQ.postings())
  const zPost2 = attempt(() => zeroQ.postings())
  ok(zPost.threw === null && zPost2.threw === null && zPost.value !== null && JSON.stringify(zPost.value) === JSON.stringify(zPost2.value),
    '★ “zero-config never crashes; read-only views never mutate” —— 零配置 postings() 两次逐字相同',
    { same: JSON.stringify(zPost.value) === JSON.stringify(zPost2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. fairness：守恒、单人上限、声誉不得当权重、可解释、零机制空分配、时钟双向 ===')
{
  ok(F.apiVersion === 1, '★ apiVersion 为 1', F.apiVersion)
  ok(JSON.stringify(F.POLICIES) === JSON.stringify(['equal', 'priority', 'reserve', 'proportional']),
    '★ “策略：与 08 的 vmu.budget.fairnessPolicy 同名同义（+ proportional 别名）”', F.POLICIES)
  ok(F.FORBIDDEN_WEIGHT_FIELDS.length > 0 && F.FORBIDDEN_WEIGHT_FIELDS.length === 5 && F.FORBIDDEN_WEIGHT_FIELDS.includes('reputation') && F.FORBIDDEN_WEIGHT_FIELDS.includes('trust'),
    '★ “不得作为权重来源的字段（S-3 同源：声誉/信任不是权力）”', F.FORBIDDEN_WEIGHT_FIELDS)
  const clockOmitted = attempt(() => F.createFairness({}))
  const clockBad = attempt(() => F.createFairness({ clock: 5 }))
  ok(clockOmitted.threw === null && codeOf(clockBad) === 'VMU_INVALID_ARGUMENT',
    '★ 时钟【两个方向】：省略合法（工厂有声明默认时钟）／非函数才拒（VMU_INVALID_ARGUMENT）',
    { omittedCode: codeOf(clockOmitted), badCode: codeOf(clockBad) })
  const fw = F.createFairness({ clock: () => 1000 })
  const FACE = ['allocation', 'explain', 'audit', 'rebalance', 'status', 'rebalanceDue']
  ok(FACE.length > 0 && FACE.every((m) => typeof fw[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof fw[m] !== 'function'), keys: Object.keys(fw) })
  const empty = attempt(() => fw.allocation({ pool: 100, claimants: [] }))
  ok(empty.threw === null && empty.value !== null,
    '★ “7. 零机制不崩（无 claimants ⇒ 空分配）”', empty.threw ? short(empty.threw.message) : empty.value && Object.keys(empty.value))
  const claim3 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const al1 = attempt(() => fw.allocation({ pool: 100, claimants: claim3 }))
  const al2 = attempt(() => fw.allocation({ pool: 100, claimants: claim3 }))
  const sh1 = sharesOf(al1.value)
  const sum = Array.isArray(sh1) && sh1.length > 0 ? sh1.reduce((acc, s) => acc + shareVal(s), 0) : null
  ok(al1.threw === null && Array.isArray(sh1) && sh1.length > 0 && sum === 100,
    '★ “① 分配守恒（Σ 份额 ＝ 池；余数按确定性规则分配且可复算）”', { sum, shares: sh1 })
  ok(Array.isArray(sh1) && sh1.length > 0 && JSON.stringify(sh1) === JSON.stringify(sharesOf(al2.value)),
    '★ “① … 余数按【确定性】规则分配且可复算” —— 两次分配的【份额部分】逐字相同（回执的序号 id 属统计面，不作判据）',
    { a: sh1, b: sharesOf(al2.value) })
  const cappedFw = F.createFairness({ clock: () => 1000, settings: { 'vmu.fairness.maxShare': 0.5 } })
  const alCap = attempt(() => cappedFw.allocation({ pool: 100, claimants: [{ id: 'a' }, { id: 'b' }] }))
  const shCap = sharesOf(alCap.value) || []
  const maxShare = shCap.length > 0 ? Math.max(...shCap.map(shareVal)) : null
  ok(alCap.threw === null && shCap.length > 0 && maxShare !== null && maxShare <= 50,
    '★ “② maxShare 不得被突破” ⇒ 上限 0.5、池 100 ⇒ 任何份额 ≤ 50', { maxShare, shares: shCap })
  const repTry = attempt(() => fw.allocation({ pool: 100, claimants: [{ id: 'a', reputation: 9 }, { id: 'b' }] }))
  const weightsFw = F.createFairness({ clock: () => 1000, settings: { 'vmu.fairness.priorityWeights': { a: 2, b: 1 } } })
  const weightsOk = attempt(() => weightsFw.allocation({ pool: 100, claimants: [{ id: 'a' }, { id: 'b' }], policy: 'priority' }))
  ok(codeOf(repTry) !== null && String(codeOf(repTry)).startsWith('VMU_') && weightsOk.threw === null,
    '★ “③ 声誉/信任分数不得当权重（只认声明的 priorityWeights；传声誉 ⇒ 具名拒）” —— 双向',
    { repCode: codeOf(repTry), repMsg: short(msgOf(repTry)), weightsOk: weightsOk.threw ? short(weightsOk.threw.message) : Object.keys(weightsOk.value || {}) })
  const alId = al1.value && (al1.value.id || al1.value.allocationId)
  const ex = attempt(() => fw.explain({ allocationId: alId }))
  ok(ex.threw === null && ex.value !== null,
    '★ “④ 每个分配可解释” ⇒ explain({allocationId}) 给出解释', { id: alId, keys: ex.value && Object.keys(ex.value) })
  const srcF = readFileSync(join(K, 'fairness.js'), 'utf8')
  const badF = ['Date.now(', 'Math.random('].filter((p) => srcF.includes(p))
  ok(badF.length === 0, '★ “⑥ 只用注入 clock” —— 源码扫描（默认时钟是 new Date(0) 字面量，不是真实时间）', badF)
  const ex2 = attempt(() => fw.explain({ allocationId: alId }))
  ok(ex.threw === null && ex2.threw === null && ex.value !== null && JSON.stringify(ex.value) === JSON.stringify(ex2.value),
    '★ “只读面不改状态” —— 两次 explain() 逐字相同', { same: JSON.stringify(ex.value) === JSON.stringify(ex2.value) })
}

console.log('')
console.log('=== KERNEL CLAIMS 10N: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · retention: ★ “永久标记 ⇒ 被跳过【并计数 skippedPermanent】”的**行为半**（我的 fixture 验证了"没被删"，但 skippedPermanent 仍为 0；')
console.log('               条件在 :121、自增点在 :147/:328，我没确定我的行走哪条路径 ⇒ 记未验证，不报缺陷）；warn 分支的 log+count、动作上限 dropped/TRUNCATED、')
console.log('               冷热分层 tiering、trash/restore 语义、library 适配器缺方法时的"计数而非发明"、RETENTION_WARNING 尚未注册（头部自承）')
console.log('  · recruit  : policy/decideBy/needsHuman 的分支、maxTempPerMember、截断计数(listCap)、confirm 的试用期满路径、score/rationale、promotions/recall/actAsChair/renewTerm')
console.log('  · fairness : minShare/reserve/criticalSlots/newcomerQuota/rebalanceEveryMs、⑤ 截断/不可分配计数、explainRequired、tieBreak、rebalanceDue 的时间窗')

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 10N SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 10N (retention 14 · recruit 10 · fairness 13): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)
