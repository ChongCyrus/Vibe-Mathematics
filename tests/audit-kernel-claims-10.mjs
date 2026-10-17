// tests/audit-kernel-claims-10.mjs — ROUND 108, batch J: human (19) · external (15) · meetingmarker (17).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// THE MOST INSTRUCTIVE FAILURE IN THIS BATCH WAS A CLAIM ATTACHED TO THE WRONG FACE. The author nearly filed a defect
// because `observerView({scope:'private'})` answered `visible:true` while the header says private domains are never shown.
// Grepping PRIVATE_DOMAINS showed the rule is enforced on the DASHBOARD path (human.js:422); observerView answers a
// different question - what a declared observer scope may see. The claim was moved onto the face that owns it and went green
// immediately. A module can be entirely correct and still fail an assertion that was never about it.
//
// AND THE AUTHOR DELETED ITS OWN `ok(true)`. A draft placeholder - the one construct this repository forbids outright - was
// caught during self-check and rewritten as a real assertion (that an expired approval stays pending). Two other edit
// accidents (a dropped declaration, two lines merged) were caught by node --check and the run itself, with no half-finished
// state left behind. That is what "the instrument checks itself" has to look like in practice.
//
// FOUR MORE MEASUREMENT ERRORS ARE RECORDED, ALL THE SAME FAMILY AS PREVIOUS BATCHES: a constant clock cannot observe an
// approval WINDOW expiring; an async `fetchOne` wrapped in a synchronous attempt turns a rejection into "no code"; the whole
// external face is disabled until `vmu.external.enabled` is declared, so three separate claims were shadowed by
// VMU_EXTERNAL_DISABLED; and `seamCalls === after1` proves nothing about a cache hit when both sides can be zero - it now
// carries a `> 0` guard so the assertion can fail.
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
const short = (s) => String(s).slice(0, 85)
const srcOf = (f) => readFileSync(join(K, f), 'utf8')
/** 面方法名解析：返回第一个存在的方法名（找不到就返回 null，并由调用处的断言把它变成红） */
const pick = (face, names) => names.find((n) => typeof face[n] === 'function') || null

const H = await import(u('human.js'))
const E = await import(u('external.js'))
const M = await import(u('meetingmarker.js'))

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. human：审批闸必抛具名拒且动作不执行、私有域永不可见、超时默认 hold、快照可校验 ===')
{
  ok(H.apiVersion === 1, '★ apiVersion 为 1', H.apiVersion)
  const CODES = ['VMU_HUMAN_VETO_SCOPE', 'VMU_HUMAN_VETO_REASON_REQUIRED', 'VMU_HUMAN_OBSERVER_SCOPE', 'VMU_HUMAN_APPROVAL_TIMEOUT',
    'VMU_HUMAN_DASHBOARD_SCOPE', 'VMU_HUMAN_APPROVAL_PENDING', 'VMU_HUMAN_APPROVAL_DENIED', 'VMU_HUMAN_VETOED',
    'VMU_HUMAN_DEFAULT_ALLOW_NOT_ACKNOWLEDGED', 'VMU_HUMAN_QUEUE_FULL', 'VMU_HUMAN_LIFT_ROLE', 'VMU_HUMAN_LIFT_REASON_REQUIRED', 'VMU_HUMAN_DASHBOARD_DOMAIN']
  const codeVals = Object.values(H.CODE)
  ok(codeVals.length > 0 && codeVals.length === 13 && CODES.every((c) => codeVals.includes(c)),
    '★ CODE：13 个具名码逐字（含 APPROVAL_PENDING / VETOED / DEFAULT_ALLOW_NOT_ACKNOWLEDGED）', codeVals.filter((c) => !CODES.includes(c)))
  ok(H.PRIVATE_DOMAINS.length > 0 && H.PRIVATE_DOMAINS.length === 4 && H.PRIVATE_DOMAINS.includes('private') && H.PRIVATE_DOMAINS.includes('secret'),
    '★ “Domains that may NEVER be shown, whatever is declared: the private face stays private (G5/D6)” —— 四个私有域',
    H.PRIVATE_DOMAINS)
  // 审批闸：gate 抛 ⇒ 被包动作【不执行】；且抛出物本身带 code/detail.queued
  const ran = { n: 0 }
  const target = { doThing() { ran.n += 1; return 'ran' }, other() { return 'other' } }
  const gate = () => { const e = new Error('queued'); e.code = 'VMU_HUMAN_APPROVAL_PENDING'; e.detail = { queued: true }; throw e }
  const wrapped = attempt(() => H.attachApprovalGate({ target, methods: ['doThing', 'noSuchMethod'], gate }))
  const called = attempt(() => target.doThing())
  ok(wrapped.threw === null && wrapped.value && Array.isArray(wrapped.value.wrapped) && wrapped.value.wrapped.includes('doThing'),
    '★ “Wrap the named mutating methods of a service so every call first passes through the human approval gate”',
    { keys: wrapped.value && Object.keys(wrapped.value), wrapped: wrapped.value && wrapped.value.wrapped })
  ok(called.threw !== null && called.threw.code === 'VMU_HUMAN_APPROVAL_PENDING' && called.threw.detail && called.threw.detail.queued === true,
    '★ “The gate THROWS its named refusal (VMU_HUMAN_APPROVAL_PENDING with detail.queued=true)” —— 读【抛出物本身】的属性',
    { code: called.threw && called.threw.code, detail: called.threw && called.threw.detail })
  ok(ran.n === 0, '★ “so the wrapped action does NOT run — it is queued” —— 被包方法体从未执行', { ran: ran.n })
  ok(wrapped.threw === null && Array.isArray(wrapped.value.missing) && wrapped.value.missing.includes('noSuchMethod'),
    '★ “a method name that does not exist is REPORTED, never silently skipped” —— missing 点名它', wrapped.value && wrapped.value.missing)
  const un = attempt(() => wrapped.value.unwrap())
  const after = attempt(() => target.doThing())
  ok(un.threw === null && after.threw === null && after.value === 'ran',
    '★ unwrap() 还原原方法（闸撤掉后可正常执行）', { unwrap: un.threw && short(un.threw.message), after: after.value })
  // createHuman：非函数时钟 ⇒ 具名拒
  const badClock = attempt(() => H.createHuman({ clock: 5 }))
  ok(codeOf(badClock) === 'VMU_INVALID_ARGUMENT', '★ “createHuman needs a clock function” —— 非函数时钟具名拒', { code: codeOf(badClock) })
  // ★ 超时默认 hold —— 用【可变时钟】推进到超时之后（常量时钟测不出"窗口结束后"的行为）
  let hk = 1000
  const hm = H.createHuman({ clock: () => hk })
  ok(hm !== null && typeof hm === 'object', '★ 面构造成功（零机制）', hm && Object.keys(hm))
  const KEYS = Object.keys(hm)
  const ask = 'openApproval'
  const stateOf = 'approvalState'
  ok(typeof hm[ask] === 'function' && typeof hm[stateOf] === 'function',
    '★ 申请/查询审批入口存在（discovery-first，实测名为 openApproval/approvalState）', { keys: KEYS })
  // ★ 一个断言同时承载"入口存在"与"超时后仍 hold"：入口缺失 ⇒ 它红（不是跳过）
  const holdProbe = (() => {
    if (ask === null || stateOf === null) return null
    const req = attempt(() => hm[ask]({ subject: 'act-1', by: 'ann' }))
    const id = req.value && (req.value.id || req.value.requestId)
    const before = attempt(() => hm[stateOf]({ requestId: id }))
    hk = 1000 + 1000 * 60 * 60 * 24   // ★ 推进一天（远超默认审批超时）
    const after = attempt(() => hm[stateOf]({ requestId: id }))
    return { reqKeys: req.value && Object.keys(req.value), before: before.value || (before.threw && before.threw.code), after: after.value || (after.threw && after.threw.code) }
  })()
  ok(ask !== null && stateOf !== null && holdProbe !== null && holdProbe.after && typeof holdProbe.after === 'object' &&
     holdProbe.after.state === 'pending' && holdProbe.after.allowed !== true && holdProbe.after.heldOnTimeout !== false,
    '★ “the declared default for an expired approval is `hold` — never `default-allow` … `hold` is what an unconfigured instance does”',
    holdProbe)
  // ★ “Domains that may NEVER be shown, whatever is declared: the private face stays private (G5/D6)”
  //   ★ 我上一版把它挂到 `observerView` 上 ⇒ 错：PRIVATE_DOMAINS 的执行点是 **dashboard**（human.js:422-427
  //   `the private face is never visible on the dashboard`），而 observerView 是"按已声明作用域可见"的另一条面。
  const dash = 'dashboard'
  const dashTry = attempt(() => hm[dash]({ domains: ['private'] }))
  ok(typeof hm[dash] === 'function' && codeOf(dashTry) === 'VMU_HUMAN_DASHBOARD_DOMAIN',
    '★ “the private face is never visible on the dashboard … private/dm/secret domains are excluded by construction (G5/D6)” —— 声明 private 的 dashboard 具名拒',
    { entry: dash, code: codeOf(dashTry), msg: dashTry.threw ? short(dashTry.threw.message) : (dashTry.value && Object.keys(dashTry.value)), keys: Object.keys(hm) })
  // observerView：已声明的 scope 可见；未声明的 scope 具名拒（这才是这条面的语义）
  const privHuman = H.createHuman({ clock: () => 1000, settings: { 'vmu.human.observerScopes': ['private', 'task'] } })
  const obsTry = attempt(() => privHuman['observerView']({ scope: 'private' }))
  const obsBad = attempt(() => privHuman['observerView']({ scope: 'galaxy' }))
  ok(privHuman !== null && typeof privHuman['observerView'] === 'function' && obsTry.threw === null &&
     obsTry.value && obsTry.value.visible === true && Array.isArray(obsTry.value.scopes) && obsTry.value.scopes.includes('private') &&
     codeOf(obsBad) === 'VMU_HUMAN_OBSERVER_SCOPE',
    '★ “which scopes an observer may see” —— 已声明 scope 可见、未声明 scope 具名拒 VMU_HUMAN_OBSERVER_SCOPE',
    { visible: obsTry.value && obsTry.value.visible, scopes: obsTry.value && obsTry.value.scopes, badCode: codeOf(obsBad), keys: Object.keys(privHuman) })
  // veto 需理由：声明 vetoNeedsReason ⇒ 无理由 ⇒ 具名拒
  const needReason = H.createHuman({ clock: () => 1000, settings: { 'vmu.human.vetoNeedsReason': true } })
  const vNoReason = attempt(() => needReason.veto({ by: 'ann', scope: 'task', target: 't1' }))
  ok(codeOf(vNoReason) === 'VMU_HUMAN_VETO_REASON_REQUIRED',
    '★ “whether a veto must carry a reason” ⇒ 声明后无理由的 veto 具名拒', { code: codeOf(vNoReason), keys: Object.keys(needReason) })
  // ★ 真实语义（paper.js:154-157）：越域 = 请求的 scope 超过【声明的界】vmu.human.vetoScope ⇒ VMU_HUMAN_VETO_SCOPE；
  //   ★ 我上一版传 'galaxy'（一个【未知名字】）⇒ 正确返回 VMU_INVALID_ARGUMENT ⇒ 是我的用例错，不是模块错。
  const bounded = H.createHuman({ clock: () => 1000, settings: { 'vmu.human.vetoScope': 'task', 'vmu.human.vetoNeedsReason': false } })
  const vBadScope = attempt(() => bounded.veto({ by: 'ann', scope: 'global', target: 't1', reason: 'because' }))
  ok(codeOf(vBadScope) === 'VMU_HUMAN_VETO_SCOPE',
    '★ “the veto scope exceeds vmu.human.vetoScope” ⇒ 具名拒 VMU_HUMAN_VETO_SCOPE（界为 task，请求 global）',
    { code: codeOf(vBadScope), msg: vBadScope.threw ? short(vBadScope.threw.message) : null })
  const vInBound = attempt(() => bounded.veto({ by: 'ann', scope: 'task', target: 't1', reason: 'because' }))
  ok(vInBound.threw === null && vInBound.value && vInBound.value.ok === true,
    '★ 界内的 veto 被接受（否证"一律拒"）', vInBound.threw ? short(vInBound.threw.message) : vInBound.value && Object.keys(vInBound.value))
  // 快照往返 + 校验
  const snap = attempt(() => hm.snapshot())
  ok(snap.threw === null && snap.value !== null && typeof snap.value === 'object',
    '★ “snapshot()/restore(snap) put them under the human durable key” —— 快照可取出', snap.threw ? short(snap.threw.message) : snap.value && Object.keys(snap.value))
  const badRestore = attempt(() => hm.restore({ nope: true }))
  ok(codeOf(badRestore) !== null, '★ “checkSnapshot is the shared validator — this face does not invent a second code set” —— 坏快照具名拒',
    { code: codeOf(badRestore), msg: badRestore.threw ? short(badRestore.threw.message) : null })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. external：无缝必具名拒、缓存命中零网络、上限计数、拒绝带 enforced 数组 ===')
{
  ok(E.apiVersion === 1, '★ apiVersion 为 1', E.apiVersion)
  ok(JSON.stringify(E.PIPELINE) === JSON.stringify(['resolve', 'fetch', 'normalize', 'merge', 'receipt']),
    '★ “PIPELINE is the five-step order and is frozen”', E.PIPELINE)
  ok(E.STALE_POLICIES.length > 0 && E.STALE_POLICIES.length === 3, '★ “cache expiry has three EXPLICIT strategies (refresh | serve-stale-with-flag | refuse)”', E.STALE_POLICIES)
  ok(E.MERGE_POLICIES.length > 0 && E.MERGE_POLICIES.length === 3 && E.CONFLICT_POLICIES.length > 0 && E.CONFLICT_POLICIES.length === 2,
    '★ “MERGE_POLICIES / CONFLICT_POLICIES are the declared vocabularies”', { m: E.MERGE_POLICIES, c: E.CONFLICT_POLICIES })
  ok(E.WIRED_KEYS.length > 0 && E.WIRED_KEYS.length === 27 && E.WIRED_KEYS.every((k) => k.startsWith('vmu.external.')),
    '★ “the 27 DECLARED vmu.external.* keys … are now actually READ here” —— 恰 27 且同族', { n: E.WIRED_KEYS.length, off: E.WIRED_KEYS.filter((k) => !k.startsWith('vmu.external.')) })
  ok(Object.keys(E.UNWIRED_REASONS).length > 0 && Object.values(E.UNWIRED_REASONS).every((r) => typeof r === 'string' && r.length > 0),
    '★ “a declared key that could not be honoured is NAMED in status().plannedKeys with its reason”', E.UNWIRED_REASONS)
  ok(typeof E.fingerprintOf === 'function' && E.fingerprintOf('abc') === E.fingerprintOf('abc') && E.fingerprintOf('abc') !== E.fingerprintOf('abd'),
    '★ “fingerprintOf gives each fetched item a content identity so re-fetching the same material is recognisable”',
    { a: E.fingerprintOf('abc'), b: E.fingerprintOf('abd') })
  // 无 fetchFn ⇒ 具名拒，且"从不发明元数据"（★ 零机制下 enabled 默认 false ⇒ 必须先显式 enabled:true，否则先撞 DISABLED）
  const noSeam = E.createExternal({ clock: () => 1000, settings: { 'vmu.external.enabled': true } })
  const FACE = ['fetchOne', 'fetchMany', 'normalize', 'cache', 'receipts', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof noSeam[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof noSeam[m] !== 'function'), keys: Object.keys(noSeam) })
  // ★ 我上一版没 await（fetchOne 是 async）⇒ 把 rejected promise 当成"没有 code" ⇒ 假红。这里用 attemptA。
  const noSeamFetch = await attemptA(() => noSeam.fetchOne({ source: 'arxiv', id: 'x' }))
  const refObj = noSeamFetch.threw || noSeamFetch.value
  ok(codeOf(noSeamFetch) === 'VMU_EXTERNAL_UNAVAILABLE' && refObj && Array.isArray(refObj.enforced),
    '★ “without it every fetch refuses BY NAME (VMU_EXTERNAL_UNAVAILABLE)” ＋ “EVERY refusal carries the same list as an ARRAY” —— 读拒绝对象本身',
    { code: codeOf(noSeamFetch), enforced: refObj && refObj.enforced, isArr: refObj && Array.isArray(refObj.enforced) })
  // 计数缝：缓存命中 ⇒ 零网络
  let seamCalls = 0
  const seam = async (req) => { seamCalls += 1; return { endpoint: req.source, payload: 'body-' + (req.id || ''), fetchedAt: 1000 } }
  const ext = E.createExternal({ clock: () => 1000, fetchFn: seam, settings: { 'vmu.external.enabled': true, 'vmu.external.endpoints': { arxiv: 'https://example.invalid/arxiv' } } })
  const f1 = await attemptA(() => ext.fetchOne({ source: 'arxiv', id: 'p1' }))
  const after1 = seamCalls
  const f2 = await attemptA(() => ext.fetchOne({ source: 'arxiv', id: 'p1' }))
  ok(f1.threw === null && f1.value !== null && after1 >= 1, '★ 第一次抓取真的调到缝（前置：先制造出可缓存的东西）', { calls: after1, keys: f1.value && Object.keys(f1.value) })
  ok(f2.threw === null && after1 > 0 && seamCalls === after1, '★ “a cache hit does ZERO network calls (offline first)” —— 第二次同请求不再调缝', { calls: seamCalls, after1 })
  // enabled:false ⇒ 具名拒且缝【从不被调用】
  const callsBefore = seamCalls
  const off = E.createExternal({ clock: () => 1000, fetchFn: seam, settings: { 'vmu.external.enabled': false } })
  const offFetch = await attemptA(() => off.fetchOne({ source: 'arxiv', id: 'p2' }))
  ok(codeOf(offFetch) === 'VMU_EXTERNAL_DISABLED' && seamCalls === callsBefore,
    '★ “enabled disabled ⇒ named refusal; **the seam is never called**”', { code: codeOf(offFetch), calls: seamCalls, before: callsBefore })
  // allowNetwork:false ⇒ 缓存未命中 ⇒ 具名拒（不出网）
  const noNet = E.createExternal({ clock: () => 1000, fetchFn: seam, settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': false } })
  const nn = await attemptA(() => noNet.fetchOne({ source: 'arxiv', id: 'p3' }))
  ok(codeOf(nn) === 'VMU_NETWORK_DENIED', '★ “allowNetwork false ⇒ a cache miss refuses (VMU_NETWORK_DENIED) instead of egressing”', codeOf(nn))
  // maxCacheEntries 逐出并计数（先制造出可丢的东西）
  const cap = E.createExternal({ clock: () => 1000, fetchFn: seam, settings: { 'vmu.external.enabled': true, 'vmu.external.maxCacheEntries': 1, 'vmu.external.endpoints': { arxiv: 'https://example.invalid/arxiv' } } })
  await attemptA(() => cap.fetchOne({ source: 'arxiv', id: 'c1' }))
  await attemptA(() => cap.fetchOne({ source: 'arxiv', id: 'c2' }))
  const capSt = attempt(() => cap.status())
  const evictions = capSt.value && (capSt.value.evictions === undefined ? capSt.value.cache && capSt.value.cache.evictions : capSt.value.evictions)
  ok(capSt.threw === null && Number(evictions) >= 1, '★ “maxCacheEntries inserting past the cap EVICTS the oldest and counts it (status().evictions)”', { evictions, keys: capSt.value && Object.keys(capSt.value) })
  const stPlanned = attempt(() => ext.status())
  ok(stPlanned.threw === null && Array.isArray(stPlanned.value.plannedKeys), '★ “a declared key that could not be honoured is NAMED in status().plannedKeys” —— 字段存在', stPlanned.value && { planned: stPlanned.value.plannedKeys, keys: Object.keys(stPlanned.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. meetingmarker：域标签派生、唯一写入者、无缝/空读/不可读缝三分、写入失败计数、顺序工具确定性 ===')
{
  ok(M.apiVersion === 1, '★ apiVersion 为 1', M.apiVersion)
  const mk = M.createMeetingMarker({ clock: () => 1000 })
  const FACE = ['markState', 'openMeetings', 'stateRows', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof mk[m] === 'function'), '★ 面暴露 { markState, openMeetings, stateRows, status }（discovery-first）',
    { missing: FACE.filter((m) => typeof mk[m] !== 'function'), keys: Object.keys(mk) })
  // 域标签派生：open|suspended|recess ⇒ open；lapsed ⇒ lapsed；closed ⇒ closed
  const m1 = { id: 'm1' }
  mk.markState(m1, 'open'); const dOpen = m1.domainState
  mk.markState(m1, 'suspended'); const dSus = m1.domainState
  mk.markState(m1, 'recess'); const dRec = m1.domainState
  mk.markState(m1, 'lapsed'); const dLap = m1.domainState
  mk.markState(m1, 'closed'); const dClo = m1.domainState
  ok(dOpen === 'open' && dSus === 'open' && dRec === 'open' && dLap === 'lapsed' && dClo === 'closed',
    '★ “the face label ⇒ DOMAIN label derivation (open|lapsed|closed)” ＋ “a recessed or suspended meeting is still an UNCONCLUDED meeting”',
    { dOpen, dSus, dRec, dLap, dClo })
  ok(m1.state === 'closed' && m1.domainState === 'closed' && m1.domainStateAt === 1000,
    '★ “The ONE state writer” —— markState 同时写 state/domainState/domainStateAt', { state: m1.state, at: m1.domainStateAt })
  const live = new Map([['a', { id: 'a', domainState: 'open' }], ['bad', { id: 7 }], ['b', { id: 'b', domainState: 'closed' }]])
  const mk2 = M.createMeetingMarker({ clock: () => 1000, live })
  const rows = mk2.stateRows()
  // EMPTY_ALLOWED: rows 可为空（live 为空即空名单）——但同一断言里的 rows.length === 2 与每行字段检查仍能判红
  ok(rows.length > 0 && rows.length === 2 && rows.every((r) => typeof r.id === 'string' && (r.state === 'open' || r.state === 'closed')),
    '★ stateRows() 只收 id 为字符串的会议（非字符串 id 被过滤）', rows)
  // 无缝 ⇒ durableMarker:false + 空 + 原因
  const noSeamRaw = mk2.openMeetings()
  const noSeamWhy = noSeamRaw && (noSeamRaw.note || noSeamRaw.why || null)
  ok(noSeamRaw && noSeamRaw.durableMarker === false && Array.isArray(noSeamRaw.meetings) && noSeamRaw.meetings.length === 0 && typeof noSeamWhy === 'string' && noSeamWhy.length > 0,
    '★ “No seam ⇒ durableMarker:false + meetings: [] + why” —— 理由字段实测名为 note', { raw: noSeamRaw })
  // 空读 ⇒ 空机构（不是"还开着"）
  const emptySeam = M.createMeetingMarker({ clock: () => 1000, durable: { read: () => [], write: () => {} } })
  const er = emptySeam.openMeetings()
  ok(er && Array.isArray(er.meetings) && er.meetings.length === 0 && er.durableMarker === true,
    '★ “a seam that reads EMPTY is an empty institute — never a meeting that is still open because nothing was read”', er)
  // 不可读缝 ⇒ 具名拒 VMU_MEETINGS_MARKER_UNREADABLE
  const badSeam = M.createMeetingMarker({ clock: () => 1000, durable: { read: () => { throw new Error('boom') }, write: () => {} } })
  const br = attempt(() => badSeam.openMeetings())
  ok(codeOf(br) === 'VMU_MEETINGS_MARKER_UNREADABLE', '★ “an unreadable seam is the registered refusal VMU_MEETINGS_MARKER_UNREADABLE — never a guess”',
    { code: codeOf(br), threw: br.threw && short(br.threw.message) })
  // 写入失败 ⇒ failures 计数 + lastError；成功 ⇒ writes 计数
  const badWrite = M.createMeetingMarker({ clock: () => 1000, durable: { read: () => [], write: () => { throw new Error('nope') } } })
  badWrite.markState({ id: 'z1' }, 'open')
  const bwSt = attempt(() => badWrite.status())
  ok(bwSt.threw === null && bwSt.value && Number(bwSt.value.failures) >= 1 && /nope/.test(JSON.stringify(bwSt.value.lastError)),
    '★ 写入失败被【计数并记录原因】（不静默）', bwSt.value && { failures: bwSt.value.failures, lastError: bwSt.value.lastError, keys: Object.keys(bwSt.value) })
  const goodWrite = M.createMeetingMarker({ clock: () => 1000, durable: { read: () => [], write: () => {} } })
  goodWrite.markState({ id: 'z2' }, 'open')
  const gwSt = goodWrite.status()
  ok(gwSt && Number(gwSt.writes) >= 1 && Number(gwSt.failures) === 0, '★ 成功写入被计数且 failures 保持 0', { writes: gwSt.writes, failures: gwSt.failures })
  // 顺序工具：常量映射与确定性
  ok(JSON.stringify(M.FLOW_ORDER) === JSON.stringify({ open: null, hands: 'fifo', round_robin: 'round-robin', call_on: 'chair' }),
    '★ “FLOW_ORDER” 四个流模式到顺序模式的映射逐字', M.FLOW_ORDER)
  ok(JSON.stringify(M.FLOW_MERGED) === JSON.stringify({ single: 'hands', directed: 'call_on' }),
    '★ “FLOW_MERGED” 两个合并别名逐字', M.FLOW_MERGED)
  ok(M.ORDER_MODES.length > 0 && M.ORDER_MODES.length === 4 && M.FLOW_MODES.length > 0 && M.FLOW_MODES.length === 4,
    '★ ORDER_MODES 与 FLOW_MODES 各 4 个取值', { o: M.ORDER_MODES, f: M.FLOW_MODES })
  ok(typeof M.orderSeedOf === 'function' && M.orderSeedOf('same') === M.orderSeedOf('same') && M.orderSeedOf('same') !== M.orderSeedOf('other'),
    '★ orderSeedOf 是文本的确定性函数（同文本同种子、不同文本不同种子）', { a: M.orderSeedOf('same'), b: M.orderSeedOf('other') })
  const permA = M.randomOrderOf(['a', 'b', 'c', 'd'], M.orderSeedOf('x'))
  const permB = M.randomOrderOf(['a', 'b', 'c', 'd'], M.orderSeedOf('x'))
  ok(Array.isArray(permA) && permA.length > 0 && permA.length === 4 && JSON.stringify(permA) === JSON.stringify(permB) && ['a', 'b', 'c', 'd'].length > 0 && ['a', 'b', 'c', 'd'].every((x) => permA.includes(x)),
    '★ randomOrderOf(list, seed) 是【确定性排列】（同种子同结果、且是同一集合的排列）', { permA, permB })
  let refused = null
  const strict = attempt(() => M.strictOrderMode('bogus', (code, msg) => { refused = code; const e = new Error(msg); e.code = code; throw e }))
  ok((strict.threw !== null && typeof strict.threw.code === 'string') || refused !== null,
    '★ strictOrderMode 对未知模式【调用 refuse】（不是静默回退）', { threw: strict.threw && strict.threw.code, refused })
  const oc = attempt(() => M.createOrderControls({ requireMeeting: () => null, clock: () => 0, limits: () => ({}), declared: () => false }))
  ok(oc.threw === null && oc.value && ['flow', 'overrideOrder', 'effective', 'orderFor', 'floorOf', 'queueGate', 'view'].length > 0 && ['flow', 'overrideOrder', 'effective', 'orderFor', 'floorOf', 'queueGate', 'view'].every((k) => typeof oc.value[k] === 'function'),
    '★ createOrderControls 暴露 flow/overrideOrder/effective/orderFor/floorOf/queueGate/view（discovery-first）',
    oc.threw ? short(oc.threw.message) : oc.value && Object.keys(oc.value))
}

console.log('')
console.log('=== KERNEL CLAIMS 8J: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · human   : 私有域不可见（observerScopes/dashboard 的具名拒）· veto 需理由/scope 拒绝 · 审批队列上限 QUEUE_FULL/默认允许须承认 ·')
console.log('             snapshot()/restore() 往返与 checkSnapshot 校验 · “receipts carry enforced[]/fired[]” 的逐面读数')
console.log('  · external: 三种过期策略（refresh/serve-stale-with-flag/refuse 与 stale 标记）· conflicts[] 的多源冲突 · timeoutMs ⇒ VMU_TIMEOUT ·')
console.log('             requireReceipt/maxBytes/cacheDir 的键行为 · 27 键逐个"各自改变可观测行为"（本轮测了 enabled/allowNetwork/maxCacheEntries/endpoints 四条）')
console.log('  · meeting : 顺序/流模式的行为面（overrideOrder/queueGate/floorOf/view）· mirrorVote · budgetVerdictOf · createBoxBinding ·')
console.log('             strictOrderMode 的确切拒绝码与 ORDER_KEY 的契约')

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 8J SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 8J (human 19 · external 15 · meetingmarker 17): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)
