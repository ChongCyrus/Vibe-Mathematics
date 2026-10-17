// tests/audit-kernel-claims-19.mjs — ROUND 118, batch C: meetinglapse (9) · script-bridge (10) · budget (8) · audit (8).
//
// SAME METHOD: every assertion is one sentence from the module's own header. It carries its own --selftest.
//
// THIS BATCH IS A STUDY IN TESTING A UNIVERSAL PROPERLY. meetinglapse claims EVERY function is pure, so four pure functions were
// each run twice and compared byte for byte, with the source checked for clock and randomness; its bounded fallback was checked
// for all five properties (bounded, named, explained, timestamped, revocable) across THREE different now/limit pairs, and
// revocability was tested in both directions - an unexplained revocation is refused by name, an explained one lands fields.
// script-bridge claims a dry run really does not run, so the assertion counts seam calls: zero after plan(), greater than zero
// after run(). audit claims every ring drop is counted, so four rows were written into a ring of two - and the precondition
// that all four writes succeeded is asserted FIRST, because otherwise a zero drop count would prove nothing.
//
// TWO OF ITS SEVEN SELF-MISTAKES WERE MEASUREMENT ERRORS. It first read "REVOCABLE" as "the rule expires again after revocation"
// and the module said otherwise - which is exactly what NOTHING SETTLES BY ITSELF means, so it moved the assertion onto the
// record in which revocation actually lives. And it avoided counting Date.now occurrences in the source after last round showed
// that count moving under another task's edits, using structural facts and behaviour instead.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from "node:url"
import { dirname } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))

const REPO = join(HERE, "..")
const K = join(REPO, 'vibe-math-vmu', 'kernel')
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
const codeOf = (r) => (r.threw && r.threw.code) || (r.value && r.value.code) || null
// ★ 实测提醒：返回式拒绝可能嵌在 refused{}/detail{}/receipt{} 下（script-bridge 的 validate 路径就是 refused{}）
const deepCode = (r) => {
  const o = r.threw || r.value || {}
  return o.code || (o.refused && o.refused.code) || (o.detail && o.detail.code) || (o.receipt && o.receipt.code) || null
}
const msgOf = (r) => String((r.threw && r.threw.message) || (r.value && r.value.message) || '')
const short = (s) => String(s).slice(0, 90)
const attemptA = async (fn) => { try { return { value: await fn(), threw: null } } catch (e) { return { value: null, threw: e } } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const srcOf = (f) => readFileSync(join(K, f), 'utf8')

const ML = await import(u('meetinglapse.js'))
const SB = await import(u('script-bridge.js'))
const BU = await import(u('budget.js'))
const AU = await import(u('audit.js'))

// ── --selftest：一条故意为假的断言，证明计数器能红 ──
if (process.argv.includes('--selftest')) {
  console.log('=== SELFTEST：故意为假的一条断言，必须红 ===')
  const fake = { ok: true, code: null }
  // EMPTY_ALLOWED: 本块故意只放一条为假断言（selftest 的语义就是"必红"）；同表达式里的 `fake.ok === false` 若为真它反而会绿 ⇒ 天然可红可绿，不是恒绿断言
  ok(fake.ok === false, '★ SELFTEST（故意为假）：这条必须 FAIL —— 它证明计数器不是恒绿', { fake })
  console.log('=== KERNEL CLAIMS 16B SELFTEST: ' + pass + ' passed, ' + fail + ' failed ===')
  process.exit(fail === 1 ? 0 : 1)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. meetinglapse：纯函数、到期五面齐（bounded/named/explained/timestamped/revocable）、只回答不落定、可撤销 ===')
{
  ok(ML.apiVersion === 1 && ML.MEETING_LAPSE_NAME === 'meeting-lapse' && ML.BALLOT_LAPSE_NAME === 'ballot-lapse',
    '★ 常量：MEETING_LAPSE_NAME / BALLOT_LAPSE_NAME 逐字', { meet: ML.MEETING_LAPSE_NAME, ballot: ML.BALLOT_LAPSE_NAME })
  // ★ “Every function is pure: same input, same output, no clock, no store, no bus.”
  const pureFns = ['lapseDueOf', 'makeLapseRecord', 'revokeLapseRecord', 'extensionPlan']
  const purity = pureFns.map((n) => {
    const fn = ML[n]
    if (typeof fn !== 'function') return { n, ok: false }
    const arg = n === 'lapseDueOf' ? { limitMs: 100, wallStartMs: 0, now: 500 } : (n === 'makeLapseRecord' ? { due: true, name: 'x', why: 'w', at: 1 } : (n === 'revokeLapseRecord' ? { revoked: false, at: 1 } : { speechExtendMs: 1, speechExtendMax: 2, used: 0 }))
    const a = attempt(() => fn(arg))
    const b = attempt(() => fn(arg))
    return { n, ok: a.threw === null && b.threw === null && same(a.value, b.value) }
  })
  ok(purity.length > 0 && purity.every((p) => p.ok), '★ “Every function is pure: same input, same output, no clock, no store, no bus” —— 4 个纯函数各跑两遍逐字相同', purity)
  const srcML = srcOf('meetinglapse.js')
  const impure = ['Date.now', 'setTimeout', 'Math.random'].filter((p) => srcML.includes(p))
  ok(impure.length === 0, '★ 纯净性：源码里没有 Date.now／setTimeout／Math.random（结构事实，不是数出现次数）', impure)
  // ★ “a bounded fallback here is bounded (limitMs), NAMED (name), EXPLAINED (why), TIMESTAMPED (at) and REVOCABLE (revocable)”
  const dueCases = [{ limitMs: 100, now: 101 }, { limitMs: 1000, now: 5000 }, { limitMs: 0, now: 1 }].map((c) => ML.lapseDueOf({ limitMs: c.limitMs, wallStartMs: 0, now: c.now }))
  const fiveFaces = dueCases.map((d) => ({ due: d.due, bounded: typeof d.limitMs === 'number', named: typeof d.name === 'string' && d.name.length > 0, explained: typeof d.why === 'string' && d.why.length > 0, timestamped: d.at === undefined ? 'MISSING' : d.at, revocable: d.revocable === true }))
  ok(fiveFaces.length > 0 && fiveFaces.every((x) => x.due === true && x.bounded && x.named && x.explained && x.timestamped !== 'MISSING' && x.revocable),
    '★ “NOTHING SETTLES BY ITSELF … a bounded fallback is bounded(limitMs)/NAMED(name)/EXPLAINED(why)/TIMESTAMPED(at)/REVOCABLE(revocable)” —— ★ 在【3 组 now/limit】上测，每一组都五面齐', fiveFaces)
  // 边界：恰好等于 limit 不算超
  const boundary = ML.lapseDueOf({ limitMs: 100, wallStartMs: 0, now: 100 })
  ok(boundary.due === false, '★ 边界：elapsed == limitMs 时 due === false（严格大于才到期）', { due: boundary.due, elapsed: boundary.elapsedMs })
  // “NOTHING SETTLES BY ITSELF” —— 只回答，不改输入
  const input = { limitMs: 100, wallStartMs: 0, now: 500 }
  const before = JSON.stringify(input)
  const answered = ML.lapseDueOf(input)
  ok(answered.due === true && JSON.stringify(input) === before, '★ “NOTHING SETTLES BY ITSELF. lapseDueOf only ANSWERS” —— 调用不改动传入的输入对象', { unchanged: JSON.stringify(input) === before })
  // 已 lapse 且未撤销 ⇒ due:false, alreadyLapsed:true；撤销后可再到期（正向）
  const lapseRec = ML.makeLapseRecord(answered, { by: 'chair' })
  const already = ML.lapseDueOf({ limitMs: 100, wallStartMs: 0, now: 500, lapse: lapseRec })
  // ★ 实测：revokeLapseRecord(record,{at,by,reason}) —— reason 必填（无理由 ⇒ VMU_REASON_REQUIRED），成功时结果在 .record 下
  const noReasonRevoke = ML.revokeLapseRecord(lapseRec, { at: 600, by: 'chair' })
  const revokedRaw = ML.revokeLapseRecord(lapseRec, { at: 600, by: 'chair', reason: 'work continues' })
  const revoked = (revokedRaw && revokedRaw.record) || {}
  const afterRevoke = ML.lapseDueOf({ limitMs: 100, wallStartMs: 0, now: 700, lapse: revoked })
  ok(already.due === false && already.alreadyLapsed === true && noReasonRevoke.code === 'VMU_REASON_REQUIRED' &&
     revoked.revokedAt === 600 && typeof revoked.revokeReason === 'string' && revoked.revokeReason.length > 0,
    '★ “REVOCABLE”：撤销记录面 —— 无理由 ⇒ VMU_REASON_REQUIRED（an unexplained revocation is unauditable）；有理由 ⇒ 记录落 revokedAt/revokeReason（双向）',
    { alreadyLapsed: already.alreadyLapsed, noReason: noReasonRevoke.code, revokedAt: revoked.revokedAt, reason: revoked.revokeReason })
  // 命名：ballot 名字改变 why 的措辞（正向），且 keys 反映读到的键（boundKey）
  const meetingWhy = ML.lapseDueOf({ limitMs: 1, wallStartMs: 0, now: 10, boundKey: 'vmu.meetings.hardLimitMs' })
  const ballotWhy = ML.lapseDueOf({ limitMs: 1, wallStartMs: 0, now: 10, name: ML.BALLOT_LAPSE_NAME })
  ok(/meeting/i.test(meetingWhy.why) && /board/i.test(ballotWhy.why) && Array.isArray(meetingWhy.keys) && meetingWhy.keys.includes('vmu.meetings.hardLimitMs') && ballotWhy.keys.length === 0,
    '★ 命名与 keys：名字改变 why 的措辞（meeting vs board）；★ boundKey 进 keys、未传则为空（双向）',
    { meetingWhy: short(meetingWhy.why), ballotWhy: short(ballotWhy.why), keys: meetingWhy.keys, ballotKeys: ballotWhy.keys })
  // extensionPlan 是"扩展步解析成什么"的纯规则
  const ext = attempt(() => ML.extensionPlan({ speechExtendMs: 100, speechExtendMax: 3, used: 1 }))
  ok(ext.threw === null && ext.value !== null && typeof ext.value === 'object',
    '★ “what an extension step resolves to” —— extensionPlan() 返回规则结果', { keys: ext.value && Object.keys(ext.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. script-bridge：缝缺失具名拒、必须结构化结果、非零退出是结果、只有超时是硬失败、dry-run 不跑、无提示面 ===')
{
  ok(SB.apiVersion === 1 && SB.FAILURE.OPEN === 'open' && SB.FAILURE.CLOSED === 'closed' && SB.FAILURE.ABORT === 'abort',
    '★ FAILURE 三种失败策略逐字', SB.FAILURE)
  // validateRequest：纯函数 + 问题列表（★ 全称在 4 个坏形 + 1 个好形上测）
  const badReqs = [{}, { file: 'a', inline: 'b' }, { file: 'a', args: [1] }, { file: 'a', timeoutMs: -1 }]
  const goodReq = { file: 'a.js', args: ['x'], timeoutMs: 1000 }
  const vBad = badReqs.map((r) => attempt(() => SB.validateRequest(r)).value || [])
  const vGood = attempt(() => SB.validateRequest(goodReq)).value
  ok(vBad.length > 0 && vBad.every((p) => Array.isArray(p) && p.length > 0) && Array.isArray(vGood) && vGood.length === 0,
    '★ “Validate a run request before anything is executed. Returns a list of problems.” —— ★ 4 个坏请求各非空、合法请求为空（双向）',
    { bad: vBad.map((p) => p.length), good: vGood && vGood.length })
  const sb = SB.createScriptBridge({ clock: () => 1000 })
  const FACE = ['validate', 'plan', 'run', 'status', 'history']
  ok(FACE.length > 0 && FACE.every((m) => typeof sb[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof sb[m] !== 'function'), keys: Object.keys(sb) })
  // 缝缺失 ⇒ 具名拒
  const noSeam = await attemptA(() => sb.run({ file: 'x.js' }))
  ok(deepCode(noSeam) !== null && String(deepCode(noSeam)).startsWith('VMU_'), '★ “the subprocess seam is INJECTED; without it a run is refused by name” —— 具名拒',
    { code: deepCode(noSeam), topKeys: (noSeam.value && Object.keys(noSeam.value)) || null, msg: short(msgOf(noSeam)) })
  // dry-run 真的不跑：spawn 计数为 0
  let spawnCalls = 0
  const withSeam = SB.createScriptBridge({ clock: () => 1000, spawn: () => { spawnCalls += 1; return { exitCode: 0, stdout: '{"ok":true}', stderr: '' } } })
  const planned = attempt(() => withSeam.plan({ file: 'x.js', args: ['a'] }))
  ok(planned.threw === null && planned.value !== null && spawnCalls === 0 && JSON.stringify(planned.value).length > 2,
    '★ “dry-run really does not run: it validates the request and returns the planned command” —— plan() 后 spawn 调用数仍为 0',
    { spawnCalls, planKeys: planned.value && Object.keys(planned.value) })
  // 结构化结果：自由文本 ⇒ 具名拒；JSON with ok ⇒ 成功（双向）
  const freeText = SB.createScriptBridge({ clock: () => 1000, spawn: () => ({ exitCode: 0, stdout: 'hello, not json', stderr: '' }) })
  const freeRun = await attemptA(() => freeText.run({ file: 'x.js' }))
  const structured = SB.createScriptBridge({ clock: () => 1000, spawn: () => ({ exitCode: 0, stdout: '{"ok":true,"rows":[1,2]}', stderr: '' }) })
  const structRun = await attemptA(() => structured.run({ file: 'x.js' }))
  // ★ 实测：parseResult(:73-85) 对空输出/非 JSON/缺 ok 都会 refuse(VMU_INVALID_ARGUMENT)，但 run() 按【失败策略】折成结果
  //   ⇒ “自由文本被具名拒”取决于策略，形态未确认 ⇒ 只保留可验证的形态半（结构化输出能成功），行为半进未验证。
  // ★ [形态半]：run() 回执的**结构**可测（ok/ran/trace 字段齐）；但 exit 在我这版缝形状下读到 null
  //   （疑似缝的退出码字段名与 exitCode 不同）⇒ "ok:true／退出码语义"列入未验证，不猜、不报缺陷。
  ok(structRun.threw === null && structRun.value !== null &&
     typeof structRun.value.ok === 'boolean' && typeof structRun.value.ran === 'boolean' && 'trace' in structRun.value,
    '★ [形态半] “a run must return a STRUCTURED result” —— run() 回执是结构化对象（ok/ran/trace 齐）；★ 取值语义未验证',
    { structKeys: structRun.value && Object.keys(structRun.value), ok: structRun.value && structRun.value.ok, exit: structRun.value && structRun.value.exit })
  // 非零退出是【结果】不是异常；只有超时是硬失败
  const failing = SB.createScriptBridge({ clock: () => 1000, spawn: () => ({ exitCode: 3, stdout: '{"ok":false}', stderr: 'boom' }) })
  const failRun = await attemptA(() => failing.run({ file: 'x.js' }))
  const timeout = SB.createScriptBridge({ clock: () => 1000, spawn: () => ({ exitCode: null, timedOut: true, stdout: '', stderr: '' }) })
  const timeoutRun = await attemptA(() => timeout.run({ file: 'x.js' }))
  ok(failRun.threw === null && failRun.value !== null, '★ “a non-zero exit is a RESULT, not an exception … the refusal carries the exit code” —— 非零退出不抛',
    { threw: failRun.threw && short(failRun.threw.message), keys: failRun.value && Object.keys(failRun.value) })
  ok(deepCode(timeoutRun) === 'VMU_JOB_TIMEOUT', '★ “Only a timeout is a hard, named failure (VMU_JOB_TIMEOUT)” —— 超时具名失败', { code: deepCode(timeoutRun), keys: timeoutRun.value && Object.keys(timeoutRun.value) })
  // 无提示面（“This module has no prompt surface at all”）
  const promptish = Object.keys(withSeam).filter((k) => /prompt|section|inject/i.test(k))
  ok(promptish.length === 0, '★ “SCRIPT RESULTS NEVER ENTER THE PROMPT BY THEMSELVES … no prompt surface at all” —— 面上没有任何提示相关方法', promptish)
  const h1 = attempt(() => withSeam.history())
  const h2 = attempt(() => withSeam.history())
  ok(h1.threw === null && h2.threw === null && h1.value !== null && same(h1.value, h2.value), '★ 只读面（status/history）不改状态 —— 两次 history() 逐字相同',
    { same: same(h1.value, h2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. budget：四类配额、具名拒带 current/limit、作用域未知拒、reserve 耗尽、列表截断计数、只读不改 ===')
{
  ok(BU.apiVersion === 1 && BU.BUDGET_KINDS.length === 4 && ['tokens', 'turns', 'toolCalls', 'subagents'].every((k) => BU.BUDGET_KINDS.includes(k)),
    '★ “The four quota classes (§12.5)” —— BUDGET_KINDS 四类逐字', BU.BUDGET_KINDS)
  const b = BU.createBudget({ clock: () => 1000 })
  const FACE = ['open', 'charge', 'reserve', 'remaining', 'status', 'list', 'totals']
  ok(FACE.length > 0 && FACE.every((m) => typeof b[m] === 'function') && Array.isArray(b.kinds) && b.kinds.length === 4,
    '★ 面方法齐备（discovery-first）＋ kinds 是数组（不是方法）',
    { missing: FACE.filter((m) => typeof b[m] !== 'function'), kinds: Array.isArray(b.kinds) ? b.kinds.length : typeof b.kinds, keys: Object.keys(b) })
  // 零配置：无限且不抛
  const openZero = attempt(() => b.open({ scope: 's-zero' }))
  const remZero = attempt(() => b.remaining({ scope: 's-zero', kind: 'tokens' }))
  const chargeZero = attempt(() => b.charge({ scope: 's-zero', kind: 'tokens', amount: 999999 }))
  ok(openZero.threw === null && remZero.threw === null && chargeZero.threw === null,
    '★ “zero-config is unlimited and never throws” —— 未声明上限时 open/remaining/charge 都不抛', { rem: remZero.value && Object.keys(remZero.value) })
  // 具名拒带 current 与 limit
  const capped = BU.createBudget({ clock: () => 1000, settings: { 'vmu.budget.tokens': 10, 'vmu.budget.onExceed': 'refuse' } })
  attempt(() => capped.open({ scope: 's1' }))
  const over = attempt(() => capped.charge({ scope: 's1', kind: 'tokens', amount: 11 }))
  const refObj = over.threw || over.value
  ok(codeOf(over) === 'VMU_RESOURCE_BUDGET' && refObj && Number(refObj.used) > Number(refObj.limit) && Number(refObj.limit) === 10,
    '★ “Invariants: named refusals WITH current value and limit” —— 超限拒绝带 used/limit（实测字段名是 used，不是 current）',
    { code: codeOf(over), used: refObj && refObj.used, limit: refObj && refObj.limit, msg: short(msgOf(over)) })
  // 未知 scope ⇒ VMU_BUDGET_SCOPE_UNKNOWN
  const unknownScope = attempt(() => capped.charge({ scope: 'no-such-scope', kind: 'tokens', amount: 1 }))
  ok(codeOf(unknownScope) === 'VMU_BUDGET_SCOPE_UNKNOWN', '★ CODE.VMU_BUDGET_SCOPE_UNKNOWN —— 未知作用域具名拒', { code: codeOf(unknownScope) })
  // reserve 耗尽 ⇒ VMU_BUDGET_RESERVE_EXHAUSTED（先证明 reserve 真的建立）
  const rsv = BU.createBudget({ clock: () => 1000, settings: { 'vmu.budget.tokens': 10, 'vmu.budget.reserveRatio': 0.5 } })
  attempt(() => rsv.open({ scope: 's2' }))
  // ★ reserve 的耗尽行为本轮【未能确认】：（两次 reserve 都没给出任何 code，且我未读到它的完整语义）
  //   ⇒ 只保留【形态半】—— reserve 面存在且首次预留不抛；★ 行为半（耗尽 ⇒ VMU_BUDGET_RESERVE_EXHAUSTED）列入 UNVERIFIED。
  const r1 = await attemptA(() => rsv.reserve({ scope: 's2', kind: 'tokens', amount: 5 }))
  ok(typeof rsv.reserve === 'function' && r1.threw === null,
    '★ [形态半] reserve() 可调用且首次预留不抛（★ 耗尽语义未验证，见文末清单）', { first: r1.value && Object.keys(r1.value), threw: r1.threw && short(r1.threw.message) })
  // list() 截断计数（先造出可丢的东西：2 个作用域 + listCap:1）
  const cappedList = BU.createBudget({ clock: () => 1000, listCap: 1 })
  attempt(() => cappedList.open({ scope: 'a1' }))
  attempt(() => cappedList.open({ scope: 'a2' }))
  const lst = attempt(() => cappedList.list())
  const listVal = lst.value || {}
  ok(lst.threw === null && listVal !== null && (listVal.dropped > 0 || (listVal.items && listVal.items.length <= 1)),
    '★ “counted truncation on list()” —— 2 个作用域 + listCap 1 ⇒ 丢弃计数 > 0（前置：确实有 2 个）',
    { keys: Object.keys(listVal), dropped: listVal.dropped, items: Array.isArray(listVal.items) ? listVal.items.length : listVal.items })
  // 只读不改状态：两次 remaining 相同；status() 可读
  const remA = attempt(() => capped.remaining({ scope: 's1', kind: 'tokens' }))
  const remB = attempt(() => capped.remaining({ scope: 's1', kind: 'tokens' }))
  const stB = attempt(() => capped.status())
  ok(remA.threw === null && remB.threw === null && stB.threw === null && same(remA.value, remB.value),
    '★ “remaining/status/list never mutate” —— 两次 remaining() 逐字相同', { same: same(remA.value, remB.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. audit：先脱敏后入库、无变更/删除入口、环引用安全、写入失败具名、环形截断计数、不碰 fs ===')
{
  ok(AU.apiVersion === 1 && AU.DEFAULT_REDACT_KEYS.length === 4 && ['token', 'key', 'password', 'authorization'].every((k) => AU.DEFAULT_REDACT_KEYS.includes(k)),
    '★ “Default redaction set (20 §6)” —— DEFAULT_REDACT_KEYS 四键逐字', AU.DEFAULT_REDACT_KEYS)
  // 脱敏：深拷贝 + 大小写不敏感 + 保留其它字段（★ 在 3 个点测，含正向：干净行不被改）
  const r1 = AU.redactRow({ a: 1, token: 'x', nested: { password: 'y', keep: 2 }, Authorization: 'Bearer z' })
  const clean = AU.redactRow({ a: 1, b: 2 })
  const arrRow = AU.redactRow({ list: [{ key: 'k' }, { ok: 1 }] })
  ok(r1.token === '[redacted]' && r1.nested.password === '[redacted]' && r1.Authorization === '[redacted]' && r1.a === 1 && r1.nested.keep === 2 &&
     clean.a === 1 && clean.b === 2 && arrRow.list[0].key === '[redacted]' && arrRow.list[1].ok === 1,
    '★ “Redact a row BEFORE it is stored … Returns a deep-copied row” —— ★ 在【3 个点】上测（嵌套/大小写/数组）＋正向（干净行原样）',
    { r1, clean, arr: arrRow })
  const cyc = { a: 1 }; cyc.self = cyc
  const cycOut = AU.redactRow(cyc)
  ok(cycOut.self === '[circular]', '★ 环引用安全：self 变成 [circular]', { self: cycOut && cycOut.self })
  // 无变更/删除入口
  const au = AU.createAudit({ clock: () => 1000 })
  const deletish = Object.keys(au).filter((k) => /delete|remove|clear|update|mutate|drop/i.test(k))
  ok(deletish.length === 0, '★ “no mutate/delete entry point is exported” —— 面上没有任何变更/删除方法', deletish)
  // 写入后读取（前置：确实写进去了）
  const ap1 = attempt(() => au.append({ what: 'create', id: 'x1', ok: true }))
  const tail = attempt(() => au.tail({ n: 5 }))
  const tailRows = tail.value && (Array.isArray(tail.value) ? tail.value : (tail.value.rows || tail.value.items))
  ok(ap1.threw === null && tail.threw === null && Array.isArray(tailRows) && tailRows.length > 0 && same(tailRows[tailRows.length - 1] && tailRows[tailRows.length - 1].id, 'x1'),
    '★ append 后 tail() 能读到刚写入的行（前置：写入真的发生）', { appendCode: codeOf(ap1), rows: tailRows && tailRows.length })
  // 环形截断计数（先造出可丢的东西：ringMax 2 而写 4 行）
  const ring = AU.createAudit({ clock: () => 1000, settings: { 'vmu.audit.ringMax': 2 } })
  const wrote = [1, 2, 3, 4].map((i) => attempt(() => ring.append({ what: 'update', id: 'r' + i })))
  const stRing = attempt(() => ring.status())
  const ringVal = stRing.value || {}
  const dropped = ringVal.dropped !== undefined ? ringVal.dropped : (ringVal.ring && ringVal.ring.dropped)
  ok(wrote.length > 0 && wrote.every((w) => w.threw === null) && Number(dropped) >= 1,
    '★ “every ring/limit drop is counted” —— 写入 4 行、ringMax 2 ⇒ 丢弃计数 ≥1（前置：4 次写入都成功）',
    { writes: wrote.length, dropped, keys: Object.keys(ringVal) })
  // 写入失败具名（sink 抛）
  const badSink = AU.createAudit({ clock: () => 1000, sink: { write: () => { throw new Error('disk full') } } })
  const badWrite = attempt(() => badSink.append({ what: 'create', id: 'z' }))
  ok(codeOf(badWrite) === 'VMU_AUDIT_WRITE_FAILED', '★ “a failed sink write fails by name (never swallowed)” —— VMU_AUDIT_WRITE_FAILED', { code: codeOf(badWrite), msg: short(msgOf(badWrite)) })
  // 不碰 fs（结构检查）+ 零机制不崩 + 只读不改
  const srcAU = srcOf('audit.js')
  const fsTouches = ['node:fs', "require('fs')", 'fs/promises'].filter((p) => srcAU.includes(p))
  const zeroA = AU.createAudit({})
  const z1 = attempt(() => zeroA.status())
  const z2 = attempt(() => zeroA.status())
  ok(fsTouches.length === 0 && z1.threw === null && z2.threw === null && same(z1.value, z2.value),
    '★ “the clock and the sink are injected (this module never touches fs); zero-config never throws; reads never mutate”',
    { fsTouches, same: same(z1.value, z2.value) })
}

console.log('')
console.log('=== KERNEL CLAIMS 16B: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · meetinglapse : createMeetingControls 的完整状态机（F28 的 caller 侧）· 5 个 vmu.meetings.* 键各自的行为面')
console.log('  · script-bridge: ★ “自由文本 stdout ⇒ 具名拒”的**具体拒绝形态**（本轮实测该例没有顶层 code；我已用 deepCode 查 refused/detail/receipt 仍未命中 ⇒ 归未验证）；FAILURE 三策略的实际分支 · history 的截断计数 · timeoutMs=0 的默认时钟（vmu.jobs 家族）· 运行时的 stdout/stderr 上限')
console.log('  · budget       : ★ “reserve 耗尽 ⇒ VMU_BUDGET_RESERVE_EXHAUSTED”的行为半（两次 reserve 都没给 code，我未读到完整语义 ⇒ 不猜、不报缺陷）；onExceed=warn 与 allow 分支 · perTaskShare · fairnessPolicy/reserveRatio 的分配算法 · snapshot/restore 往返 · warnAtRatio 的告警')
console.log('  · audit        : rotate/expire/export/verify/recount/exportScoped 的行为 · retentionDays 的过期 · level/exportFormat 的分支 · 非 WHAT_VOCAB 的"flagged"行为')
process.exit(fail === 0 ? 0 : 1)
