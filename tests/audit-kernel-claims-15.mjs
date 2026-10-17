// tests/audit-kernel-claims-15.mjs — ROUND 111, batch O: notify (11) · trust (11) · collab (9) · storepolicy (10).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// ITS ONE RED WAS A REAL DEFECT, AND IT WAS MEASURED BEFORE BEING FILED. collab.js promises that EVERY receipt carries
// `enforced[]` and that `fired[]` names the keys which CHANGED the outcome - the point being that an auditor should see not
// only what was evaluated but what actually mattered. `addCounterparty({...})` returned keys with no `fired` at all, and five
// of the module's eight receipts were the same. The author suspected its own line-level scan could be misreading multi-line
// returns, so it widened the window AND confirmed at runtime before calling it a defect. The fix adds the field to every
// receipt (empty where a structural operation changed nothing), and this probe went 40/1 to 41/41.
//
// THREE MEASUREMENT ERRORS ARE RECORDED: testing "no deliver seam refuses by name" on a DISABLED instance, where an emit is a
// legitimate no-op; subscribing without declaring `vmu.notify.registeredEvents`, which makes the check skip rather than pass;
// and looking for `explicit`/`default` as WORDS in a JSON blob instead of reading the `halfLifeSource` FIELD. Each was a case
// of the auditor's setup, not the module's behaviour.
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
const codeOf = (r) => (r.threw && r.threw.code) || (r.value && r.value.code) || null
const hintOf = (r) => (r.threw && r.threw.hint) || (r.value && r.value.hint) || null
const msgOf = (r) => String((r.threw && r.threw.message) || (r.value && r.value.message) || '')
const short = (s) => String(s).slice(0, 90)
const srcOf = (f) => readFileSync(join(K, f), 'utf8')

const N = await import(u('notify.js'))
const T = await import(u('trust.js'))
const C = await import(u('collab.js'))
const S = await import(u('storepolicy.js'))

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. notify：无传输必具名拒（有目标时）、静默只挡投递、订阅须已登记、失败不阻塞但计数、去重计数、时钟双向 ===')
{
  ok(N.apiVersion === 1, '★ apiVersion 为 1', N.apiVersion)
  ok(N.CODE.noTransport === 'VMU_NOTIFY_NO_TRANSPORT' && N.CODE.unregistered === 'VMU_NOTIFY_EVENT_UNREGISTERED' &&
     N.CODE.limit === 'VMU_NOTIFY_LIMIT' && N.CODE.watchUnknown === 'VMU_WATCH_UNKNOWN' && N.CODE.deliveryFailed === 'VMU_NOTIFY_DELIVERY_FAILED',
    '★ CODE：五个具名码逐字', N.CODE)
  const clockBad = attempt(() => N.createNotify({ clock: 5 }))
  const clockOmitted = attempt(() => N.createNotify({}))
  ok(codeOf(clockBad) === 'VMU_INVALID_ARGUMENT' && clockOmitted.threw === null,
    '★ 时钟【两个方向】：省略合法（声明默认时钟）／非函数才拒', { bad: codeOf(clockBad), omittedOk: clockOmitted.threw === null })
  const nf = N.createNotify({ clock: () => 1000 })
  const FACE = ['watch', 'unwatch', 'emit', 'flush', 'list', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof nf[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof nf[m] !== 'function'), keys: Object.keys(nf) })
  // ★ 实测：enabled 且【有目标的订阅】但没有 deliver ⇒ emit/flush 具名拒（零目标时是合法的空操作）
  const noTr = N.createNotify({ clock: () => 1000, settings: { 'vmu.notify.enabled': true } })
  const w0 = attempt(() => noTr.watch({ subject: 'm1', events: ['task.assigned'], reason: 'test' }))
  const emitNoTr = attempt(() => noTr.emit({ event: 'task.assigned', object: 'o1' }))
  const flushNoTr = attempt(() => noTr.flush({}))
  ok(w0.threw === null && codeOf(emitNoTr) === 'VMU_NOTIFY_NO_TRANSPORT' && codeOf(flushNoTr) === 'VMU_NOTIFY_NO_TRANSPORT',
    '★ “deliver() is an injected seam: without it emit/flush REFUSE BY NAME and nothing pretends to be sent”',
    { watch: w0.threw && short(w0.threw.message), emit: codeOf(emitNoTr), flush: codeOf(flushNoTr) })
  // 订阅须点名已登记事件（with reason 才走到事件检查）；坏事件拒并带已登记列表
  // ★ 实测：已登记列表来自【设置】vmu.notify.registeredEvents（:136-139；未声明则该校验被跳过 ⇒ 我上一版漏设）。
  const reg = N.createNotify({ clock: () => 1000, settings: { 'vmu.notify.enabled': true, 'vmu.notify.registeredEvents': ['task.assigned', 'meeting.opened'] } })
  const badEv = attempt(() => reg.watch({ subject: 'm2', events: ['definitely.not.a.hook'], reason: 'test' }))
  const goodEv = attempt(() => reg.watch({ subject: 'm3', events: ['task.assigned'], reason: 'test' }))
  ok(codeOf(badEv) === 'VMU_NOTIFY_EVENT_UNREGISTERED' && goodEv.threw === null && String(hintOf(badEv)).includes('task.assigned'),
    '★ “subscriptions must name a registered hook; unknown events are refused WITH the registered list” —— 双向（坏事件拒且 hint 列出已登记／已登记可订阅）',
    { badCode: codeOf(badEv), hint: short(String(hintOf(badEv) || '')), goodKeys: goodEv.value && Object.keys(goodEv.value) })
  // 静默只挡投递、事件仍被记录；恢复后必须有摘要（用【活设置视图】翻转 quiet，需要可变时钟之外的可变设置）
  let quiet = true
  let delivered = 0
  const liveSettings = { get: (k) => (k === 'vmu.notify.enabled' ? true : (k === 'vmu.notify.quiet' ? quiet : undefined)) }
  const sinking = N.createNotify({ clock: () => 1000, settings: liveSettings, deliver: () => { delivered += 1 } })
  const sw = attempt(() => sinking.watch({ subject: 'm1', events: ['task.assigned'], reason: 'test' }))
  const quietEmit = attempt(() => sinking.emit({ event: 'task.assigned', object: 'oq' }))
  const duringQuiet = delivered
  const stQuiet = attempt(() => sinking.status())
  quiet = false
  const resumeFlush = attempt(() => sinking.flush({}))
  ok(sw.threw === null && quietEmit.threw === null && duringQuiet === 0 && resumeFlush.threw === null && delivered >= 1,
    '★ “quiet hours block DELIVERY only — events are still recorded and counted; on resume a digest is REQUIRED”',
    { duringQuiet, afterFlush: delivered, flush: resumeFlush.value && Object.keys(resumeFlush.value), statusKeys: stQuiet.value && Object.keys(stQuiet.value) })
  // 投递失败不阻塞、但被记录/计数
  let deliverAttempts = 0
  const failing = N.createNotify({ clock: () => 1000, settings: { 'vmu.notify.enabled': true }, deliver: () => { deliverAttempts += 1; throw new Error('boom') } })
  attempt(() => failing.watch({ subject: 'm1', events: ['task.assigned'], reason: 'test' }))
  const failEmit = attempt(() => failing.emit({ event: 'task.assigned', object: 'of' }))
  const failSt = attempt(() => failing.status())
  const failCount = failSt.value && (Number(failSt.value.failures) || Number(failSt.value.counts && failSt.value.counts.failures) || 0)
  ok(deliverAttempts >= 1 && failEmit.threw === null && failCount >= 1,
    '★ “a failed delivery never blocks the caller, but it is recorded and counted (onFailure policy)”',
    { attempts: deliverAttempts, emitThrew: failEmit.threw && short(failEmit.threw.message), failures: failCount, statusKeys: failSt.value && Object.keys(failSt.value) })
  // 去重计数（读【数值】，不是字符串里出现 dedup 这个词）
  const dd = N.createNotify({ clock: () => 1000, settings: { 'vmu.notify.enabled': true, 'vmu.notify.dedupWindowMs': 60000 }, deliver: () => {} })
  attempt(() => dd.watch({ subject: 'm1', events: ['task.assigned'], reason: 'test' }))
  attempt(() => dd.emit({ event: 'task.assigned', object: 'od' }))
  attempt(() => dd.emit({ event: 'task.assigned', object: 'od' }))
  const ddSt = attempt(() => dd.status())
  const deduped = ddSt.value && (Number(ddSt.value.deduped) || Number(ddSt.value.counts && ddSt.value.counts.deduped) || 0)
  ok(ddSt.threw === null && deduped >= 1,
    '★ “dedup, truncation and suppression are all counted” —— 同一 event×object 第二次被抑制且【计数 ≥1】',
    { deduped, statusKeys: ddSt.value && Object.keys(ddSt.value) })
  // 默认关闭 + 只读面不改状态
  const off = N.createNotify({ clock: () => 1000 })
  const offSt = attempt(() => off.status())
  const l1 = attempt(() => off.list())
  const l2 = attempt(() => off.list())
  ok(offSt.threw === null && offSt.value && offSt.value.enabled === false && l1.threw === null && l2.threw === null &&
     l1.value !== null && JSON.stringify(l1.value) === JSON.stringify(l2.value),
    '★ “default is off; reads never mutate” —— 默认关闭（status().enabled === false）＋ 两次 list() 逐字相同',
    { enabled: offSt.value && offSt.value.enabled, same: JSON.stringify(l1.value) === JSON.stringify(l2.value) })
  const srcN = srcOf('notify.js')
  const badN = ['Date.now(', 'Math.random('].filter((p) => srcN.includes(p))
  ok(badN.length === 0, '★ “the clock is injected” —— 源码扫描无真实时间/随机', badN)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. trust：声誉不得授权、无数据不是假 0、强权重无证据被降权且自曝、可解释、截断计数、时钟双向、0 的来源自报 ===')
{
  ok(T.apiVersion === 1, '★ apiVersion 为 1', T.apiVersion)
  ok(T.ENFORCED_SCOPE === 'evaluated-so-far' && T.AUTHORITY_REFUSAL === 'VMU_TRUST_USE_FORBIDDEN' &&
     T.DEFAULT_WEAK_CAP === 0.25 && T.DEFAULT_MAX_SIGNALS === 500,
    '★ D3 常量 ＋ AUTHORITY_REFUSAL ＋ DEFAULT_WEAK_CAP 0.25 ＋ DEFAULT_MAX_SIGNALS 500',
    { scope: T.ENFORCED_SCOPE, auth: T.AUTHORITY_REFUSAL, weak: T.DEFAULT_WEAK_CAP, max: T.DEFAULT_MAX_SIGNALS })
  const clockBad = attempt(() => T.createTrust({ clock: 5 }))
  const clockOmitted = attempt(() => T.createTrust({}))
  ok(codeOf(clockBad) === 'VMU_INVALID_ARGUMENT' && clockOmitted.threw === null,
    '★ 时钟【两个方向】：省略合法／非函数才拒', { bad: codeOf(clockBad), omittedOk: clockOmitted.threw === null })
  const tr = T.createTrust({ clock: () => 1000 })
  const FACE = ['signal', 'score', 'decay', 'explain', 'dispute', 'list', 'status', 'publicScore', 'authorityFrom']
  ok(FACE.length > 0 && FACE.every((m) => typeof tr[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof tr[m] !== 'function'), keys: Object.keys(tr) })
  const auth = attempt(() => tr.authorityFrom())
  ok(codeOf(auth) === 'VMU_TRUST_USE_FORBIDDEN',
    '★ “S-3 (hard): reputation NEVER grants authority — no votes, no seats, no delegation, no budget.” ⇒ authorityFrom() 具名拒',
    { code: codeOf(auth), msg: short(msgOf(auth)) })
  // ★ 无数据 ⇒ score 为 null（不是假 0）；有信号 ⇒ 数字（双向；★ signal 需要 source）
  const noData = attempt(() => tr.score({ subject: 'nobody' }))
  const sig1 = attempt(() => tr.signal({ subject: 'a1', kind: 'peer', weight: 1, source: 'm1', evidence: 'e1' }))
  const withData = attempt(() => tr.score({ subject: 'a1' }))
  ok(noData.threw === null && noData.value && noData.value.score === null && noData.value.hasData === false &&
     sig1.threw === null && withData.value && typeof withData.value.score === 'number',
    '★ “zero mechanism returns "no data" — never a fake 0” ⇒ score:null（非 0）；有信号后是 number（双向）',
    { noDataScore: noData.value && noData.value.score, noDataHas: noData.value && noData.value.hasData, signalCode: codeOf(sig1), withScore: withData.value && withData.value.score })
  // ★ 强权重无证据 ⇒ 被降权（有效分 ≤ DEFAULT_WEAK_CAP）且自曝
  const weakSig = attempt(() => tr.signal({ subject: 'a2', kind: 'peer', weight: 1, source: 'm1', evidence: null }))
  const weakScore = attempt(() => tr.score({ subject: 'a2' }))
  const weakVal = weakScore.value && weakScore.value.score
  const disclosed = /weak|evidence|downweight/i.test(JSON.stringify(weakSig.value || {}) + JSON.stringify(weakScore.value || {}))
  ok(weakSig.threw === null && typeof weakVal === 'number' && weakVal <= T.DEFAULT_WEAK_CAP + 1e-9 && disclosed,
    '★ “a strong weight without evidence is downweighted AND self-disclosed” ⇒ weight 1 无证据 ⇒ 有效分 ≤ 0.25 且自曝',
    { weakScore: weakVal, disclosed, sigKeys: weakSig.value && Object.keys(weakSig.value) })
  const explain = attempt(() => tr.explain({ subject: 'a1' }))
  ok(explain.threw === null && explain.value !== null,
    '★ “Every score must be explainable” ⇒ explain({subject}) 给出解释', { keys: explain.value && Object.keys(explain.value) })
  // ★ halfLifeMs=0 ⇒ 衰减关闭；显式 0 与缺席【来源】不同、模块自报（读 halfLifeSource 字段）
  const explicitZero = T.createTrust({ clock: () => 1000, settings: { 'vmu.trust.halfLifeMs': 0 } })
  const absentZero = T.createTrust({ clock: () => 1000 })
  const ez = attempt(() => explicitZero.score({ subject: 'nobody' }))
  const az = attempt(() => absentZero.score({ subject: 'nobody' }))
  ok(ez.threw === null && az.threw === null && ez.value && ez.value.halfLifeSource === 'explicit' && az.value && az.value.halfLifeSource === 'default' &&
     ez.value.decay === 'off' && az.value.decay === 'off',
    '★ “`halfLifeMs = 0` means decay is OFF … the module says WHICH source: an explicit 0 is `explicit`, an absent value is `default`”',
    { explicit: ez.value && { src: ez.value.halfLifeSource, decay: ez.value.decay }, absent: az.value && { src: az.value.halfLifeSource, decay: az.value.decay } })
  const l1 = attempt(() => tr.list())
  const l2 = attempt(() => tr.list())
  ok(l1.threw === null && l2.threw === null && l1.value !== null && JSON.stringify(l1.value) === JSON.stringify(l2.value),
    '★ “read-only surfaces never mutate” —— 两次 list() 逐字相同', { same: JSON.stringify(l1.value) === JSON.stringify(l2.value) })
  const srcT = srcOf('trust.js')
  const badT = ['Date.now(', 'Math.random('].filter((p) => srcT.includes(p))
  ok(badT.length === 0, '★ “decay uses only the injected clock” —— 源码扫描', badT)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. collab：七个键逐字读、未知对手方/未签协议具名拒、② 每张回执带 enforced[]＋fired[]、只读不改、不读真实时间 ===')
{
  ok(C.apiVersion === 1, '★ apiVersion 为 1', C.apiVersion)
  const CODES = ['VMU_COLLAB_COUNTERPARTY_UNKNOWN', 'VMU_COLLAB_AGREEMENT_REQUIRED', 'VMU_COLLAB_AGREEMENT_EXPIRED', 'VMU_COLLAB_TEMPLATE_UNKNOWN',
    'VMU_COLLAB_SETTLEMENT_PREMATURE', 'VMU_COLLAB_RECONCILIATION_OFF', 'VMU_AGREEMENT_KIND_UNKNOWN', 'VMU_AGREEMENT_UNSIGNED',
    'VMU_AGREEMENT_SIGNATURE_REF_REQUIRED', 'VMU_AGREEMENT_SCOPE_NOT_COVERED']
  const cv = Object.values(C.CODE)
  ok(CODES.length > 0 && cv.length > 0 && cv.length === 10 && CODES.every((x) => cv.includes(x)),
    '★ “Codes this face can throw. Registered in docs/03 §8” —— 10 个码逐字', cv.filter((x) => !CODES.includes(x)))
  const cf = C.createCollab({ clock: () => 1000 })
  const FACE = ['addCounterparty', 'openAgreement', 'signAgreement', 'reviewAgreement', 'exchange', 'settle', 'authorship', 'agreements', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof cf[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof cf[m] !== 'function'), keys: Object.keys(cf) })
  const unknownCp = attempt(() => cf.exchange({ counterparty: 'no-such', kind: 'data' }))
  ok(codeOf(unknownCp) === 'VMU_COLLAB_COUNTERPARTY_UNKNOWN', '★ 未知对手方 ⇒ 具名拒 VMU_COLLAB_COUNTERPARTY_UNKNOWN',
    { code: codeOf(unknownCp), threw: !!unknownCp.threw, msg: short(msgOf(unknownCp)) })
  const added = attempt(() => cf.addCounterparty({ id: 'cp1', name: 'Peer', institution: 'Uni' }))
  const noAgreement = attempt(() => cf.exchange({ counterparty: 'cp1', kind: 'data' }))
  ok(added.threw === null && codeOf(noAgreement) === 'VMU_COLLAB_AGREEMENT_REQUIRED',
    '★ “③ a limit the machine cannot enforce is refused BY NAME rather than warned about” ＋ “④ zero declarations ⇒ zero mechanism”',
    { addedKeys: added.value && Object.keys(added.value), code: codeOf(noAgreement), msg: short(msgOf(noAgreement)) })
  // ★★ 真缺陷（本轮发现）：头部宣称 “② every receipt carries `enforced[]` … and `fired[]`”，但运行时 addCounterparty 的回执
  //   只有 enforced、没有 fired；源码枚举显示 8 张 `return { ok:` 回执里有 5 张不带 fired（行 91/128/152/161/257）。
  const srcC = srcOf('collab.js')
  const receiptLines = srcC.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /return \{ ok:/.test(l))
  const firedNear = (n) => /fired/.test(srcC.split('\n').slice(Math.max(0, n - 2), n + 6).join('\n'))
  const missingFired = receiptLines.filter(([n]) => !firedNear(n)).map(([n]) => n)
  ok(added.value && Array.isArray(added.value.enforced) && Array.isArray(added.value.fired),
    '★★ [真缺陷] “② every receipt carries enforced[] … and fired[] names the ones that CHANGED the outcome” —— 运行时 addCounterparty 回执【没有 fired】',
    { receiptKeys: added.value && Object.keys(added.value), receipts: receiptLines.length, missingFired })
  const l1 = attempt(() => cf.agreements())
  const l2 = attempt(() => cf.agreements())
  const s1 = attempt(() => cf.status())
  ok(l1.threw === null && l2.threw === null && l1.value !== null && JSON.stringify(l1.value) === JSON.stringify(l2.value) && s1.threw === null,
    '★ “⑤ injected clock only; read-only surfaces never mutate” —— 两次 agreements() 逐字相同、status() 可读',
    { same: JSON.stringify(l1.value) === JSON.stringify(l2.value), statusKeys: s1.value && Object.keys(s1.value) })
  const badC = ['Date.now(', 'Math.random('].filter((p) => srcC.includes(p))
  ok(badC.length === 0, '★ “⑤ injected clock only” —— 源码扫描', badC)
  // 七个键逐字出现（literal access 是门禁要求）
  const KEYS7 = ['vmu.collab.agreementRequired', 'vmu.collab.dataSharingTemplate', 'vmu.collab.counterpartyRegistry', 'vmu.collab.expiryWarnDays',
    'vmu.collab.jointAuthorshipPolicy', 'vmu.collab.settlementCycleDays', 'vmu.collab.reconciliationToleranceMinor']
  ok(KEYS7.length > 0 && KEYS7.every((k) => srcC.includes(k)),
    '★ “① every key is read with a LITERAL access” —— 七个 vmu.collab.* 键逐字出现在源码', { missing: KEYS7.filter((k) => !srcC.includes(k)) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. storepolicy：15/15 分区、拒绝返回型带 enforced/wouldEvaluate、未知后端/缺 root/远端无 url 具名拒、只读不改 ===')
{
  ok(S.STORE_KEYS.length > 0 && S.STORE_KEYS.length === 15, '★ “把 vmu.store.* 15 键接成可观测行为” —— STORE_KEYS 恰 15', S.STORE_KEYS.length)
  ok(S.WIRED_STORE_KEYS.length > 0 && S.WIRED_STORE_KEYS.length === 15 && S.PLANNED_STORE_KEYS.length === 0 &&
     S.WIRED_STORE_KEYS.every((k) => S.STORE_KEYS.includes(k)),
    '★ “未接逐个点名（本面 15/15 已接 ⇒ planned = [] 且断言【恰好划分 15】）”',
    { wired: S.WIRED_STORE_KEYS.length, planned: S.PLANNED_STORE_KEYS.length, off: S.WIRED_STORE_KEYS.filter((k) => !S.STORE_KEYS.includes(k)) })
  const sp = S.createStorePolicy({ clock: () => 1000 })
  const FACE = ['capabilities', 'acquire', 'release', 'write', 'read', 'status', 'keysUsed', 'partition', 'config', 'refusals']
  ok(FACE.length > 0 && FACE.every((m) => typeof sp[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof sp[m] !== 'function'), keys: Object.keys(sp) })
  const part = attempt(() => sp.partition())
  ok(part.threw === null && part.value !== null, '★ 面自带 partition() 自述分区', part.threw ? short(part.threw.message) : part.value && Object.keys(part.value))
  const c1 = attempt(() => sp.capabilities())
  const c2 = attempt(() => sp.capabilities())
  ok(c1.threw === null && c2.threw === null && c1.value !== null && JSON.stringify(c1.value) === JSON.stringify(c2.value),
    '★ “只读面（can/capabilities/status）不改状态” —— 两次 capabilities() 逐字相同', { same: JSON.stringify(c1.value) === JSON.stringify(c2.value) })
  const badBackend = S.createStorePolicy({ clock: () => 1000, settings: { 'vmu.store.backend': 'nonsense' } })
  const bw = attempt(() => badBackend.write({ id: 'w1', value: 'x' }))
  const bwRef = bw.value || bw.threw
  ok(bw.threw === null && bwRef && typeof bwRef.code === 'string' && Array.isArray(bwRef.enforced) && bwRef.enforcedScope === S.ENFORCED_SCOPE &&
     Array.isArray(bwRef.wouldEvaluate) && bwRef.wouldEvaluate.length > 0 && bwRef.wouldEvaluate.length >= bwRef.enforced.length,
    '★ “每个拒绝（返回型）带数组型 enforced ＋ enforcedScope ＋ wouldEvaluate ⊇ enforced” ＋ “an unknown backend is refused by name”',
    { code: bwRef && bwRef.code, enforced: bwRef && bwRef.enforced, would: bwRef && bwRef.wouldEvaluate, keys: bwRef && Object.keys(bwRef) })
  const noRoot = S.createStorePolicy({ clock: () => 1000, settings: { 'vmu.store.backend': 'file' } })
  const nr = attempt(() => noRoot.write({ id: 'w2', value: 'x' }))
  const nrRef = nr.value || nr.threw
  ok(nrRef && typeof nrRef.code === 'string' && Array.isArray(nrRef.enforced),
    '★ “a `file` backend needs a root” ⇒ 缺 root 具名拒（返回型、带数组 enforced）', { code: nrRef && nrRef.code, isArr: nrRef && Array.isArray(nrRef.enforced) })
  const noUrl = S.createStorePolicy({ clock: () => 1000, settings: { 'vmu.store.backend': 'file', 'vmu.store.root': 'D:/tmp/vmu-store', 'vmu.store.remote': 'on' } })
  const nu = attempt(() => noUrl.write({ id: 'w3', value: 'x' }))
  const nuRef = nu.value || nu.threw
  ok(nuRef && typeof nuRef.code === 'string' && Array.isArray(nuRef.enforced),
    '★ “`remote=on` needs a url” ⇒ 缺 url 具名拒且拒绝对象带数组 enforced', { code: nuRef && nuRef.code, isArr: nuRef && Array.isArray(nuRef.enforced) })
  const refs = attempt(() => badBackend.refusals())
  ok(refs.threw === null && refs.value && typeof refs.value === 'object' && Object.keys(refs.value).length > 0,
    '★ “逐码计数” —— 发生过该拒绝的实例自报非空的按码计数', { refs: refs.value && Object.keys(refs.value) })
  const srcS = srcOf('storepolicy.js')
  const badS = ['Date.now(', 'Math.random('].filter((p) => srcS.includes(p))
  ok(badS.length === 0, '★ “注入时钟（不读真实时间 —— 锁的等待按虚拟时钟推进）” —— 源码扫描', badS)
}

console.log('')
console.log('=== KERNEL CLAIMS 11O: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · notify : NOTIFY 指纹 watcher×event×object 的导出形态 · truncation/suppression 计数分支 · VMU_NOTIFY_LIMIT 触发 · onFailure 策略差异 · watch 上限')
console.log('  · trust  : publicScore 口径 · dispute 分支 · endEngagement freeze · 半衰期曲线 · kinds/weights 白名单 · 截断计数（maxSignals 键名未证）')
console.log('  · collab : openAgreement/signAgreement/reviewAgreement 到期与签名分支 · settlement 对账容差 · authorship 合著策略')
console.log('  · store  : offlinePolicy refuse-vs-queue · version policy refuse-vs-warn · consistency=strong 先行拒绝 · 锁超时/退避 · 15 键各自行为面')

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 11O SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 11O (notify 11 · trust 11 · collab 9 · storepolicy 10): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)
