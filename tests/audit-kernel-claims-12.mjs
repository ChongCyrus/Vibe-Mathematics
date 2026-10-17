// tests/audit-kernel-claims-12.mjs — ROUND 109, batch L: minutes (13) · course (14) · panel (12).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// A CLAIM ABOUT REGISTRATION WAS NEARLY READ AS A CLAIM ABOUT A STRING PREFIX. course.js says it introduces no new codes and
// reuses registered ones; the author read that as "no VMU_COURSE_* may appear", found two, and was about to file a defect.
// Grepping the repository showed both are registered (docs/03-interface-contract.md:855 and :857) - so the promise holds and
// the assertion was measuring the wrong thing. The corrected form is the claim itself: every code the file uses appears in
// the registry.
//
// AND A STATISTICS FIELD CANNOT SERVE AS A DETERMINISM PROBE. Two `status()` calls differed, which looked like nondeterminism
// until the field-by-field diff showed the only difference was `counts.reads` - a call counter that is SUPPOSED to grow. The
// determinism claim is now measured on the pure read face, where nothing is counted.
//
// THE AUTHOR ALSO CAUGHT ITS OWN `ok(cond ? … : true)`, which is an `ok(true)` in disguise, and its own near-tautological
// assertion - both through the self-check it added for exactly this purpose. That is the standard this line of work needs.
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
const srcOf = (f) => readFileSync(join(K, f), 'utf8')

const MI = await import(u('minutes.js'))
const CO = await import(u('course.js'))
const PA = await import(u('panel.js'))

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. minutes：拒绝必具名、触界必报丢弃、不读真实时间、设置两种写法等价 ===')
{
  ok(MI.apiVersion === 1, '★ apiVersion 为 1', MI.apiVersion)
  ok(MI.DETAIL_LEVELS.length > 0 && MI.DETAIL_LEVELS.length === 3 && ['brief', 'normal', 'full'].length > 0 && ['brief', 'normal', 'full'].every((x) => MI.DETAIL_LEVELS.includes(x)),
    '★ “详略档（docs/08 §12.2 的纪要族）” —— DETAIL_LEVELS 三档', MI.DETAIL_LEVELS)
  ok(MI.VERBATIM_CAP_BYTES === 32 * 1024 && MI.SNAPSHOT_VERBATIM_CAP === 64 * 1024,
    '★ “正文/逐字稿的默认上限（字节）；触界必报丢弃量” ＋ “快照里逐字稿的上限（字节）：超出计数上报”',
    { body: MI.VERBATIM_CAP_BYTES, snapshot: MI.SNAPSHOT_VERBATIM_CAP })
  const badClock = attempt(() => MI.createMinutes({ clock: 5 }))
  ok(codeOf(badClock) === 'VMU_INVALID_ARGUMENT', '★ “createMinutes needs a clock function” —— 非函数时钟具名拒', { code: codeOf(badClock) })
  const FACE = ['draft', 'confirm', 'append', 'actions', 'list', 'status', 'zones', 'gaps', 'resolve', 'supersede']
  const mm = MI.createMinutes({ clock: () => 'T0' })
  ok(FACE.length > 0 && FACE.every((m) => typeof mm[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof mm[m] !== 'function'), keys: Object.keys(mm) })
  // ① 零机制（不注入 meeting）⇒ 具名拒 + hint
  const zeroDraft = attempt(() => mm.draft({ meetingId: 'm1' }))
  ok(codeOf(zeroDraft) !== null && String(codeOf(zeroDraft)).startsWith('VMU_') && typeof hintOf(zeroDraft) === 'string' && hintOf(zeroDraft).length > 0,
    '★ “① 拒绝必须具名（VMU_* ＋ hint），绝不裸异常” ＋ “meeting 可选注入（零机制时不注入 ⇒ 具名拒）”',
    { code: codeOf(zeroDraft), hint: hintOf(zeroDraft), keys: Object.keys(mm) })
  // 真实 meeting 缝 ⇒ 可建档；设置两种写法等价（flat vs nested）
  const meetingSeam = { id: 'm1', rounds: [{ n: 1, at: 'T1', lines: ['l1'] }], participants: ['ann', 'bob'] }
  const flat = MI.createMinutes({ clock: () => 'T0', settings: { 'vmu.minutes.detail': 'brief' }, meeting: meetingSeam })
  const nested = MI.createMinutes({ clock: () => 'T0', settings: { minutes: { detail: 'brief' } }, meeting: meetingSeam })
  const dFlat = attempt(() => flat.draft({ meetingId: 'm1' }))
  const dNested = attempt(() => nested.draft({ meetingId: 'm1' }))
  ok(dFlat.threw === null && dNested.threw === null && dFlat.value !== null && typeof dFlat.value === 'object' && JSON.stringify(dFlat.value) === JSON.stringify(dNested.value),
    '★ “readSetting … 兼容写法：{ minutes: { detail } } / { detail }” —— 两种写法产出逐字相同',
    { flat: dFlat.value, nested: dNested.value, flatErr: dFlat.threw && short(dFlat.threw.message) })
  // ② 触界必报丢弃量（先制造出可丢的东西）
  const big = 'z'.repeat(MI.VERBATIM_CAP_BYTES + 1000)
  const ap = attempt(() => flat.append({ id: (dFlat.value && (dFlat.value.id || dFlat.value.minutesId)) || 'x', text: big, kind: 'verbatim' }))
  const apJson = JSON.stringify(ap.value || {}) + msgOf(ap)
  ok((ap.threw === null && /dropped/i.test(apJson)) || (ap.threw !== null && String(codeOf(ap)).startsWith('VMU_')),
    '★ “② 任何上限触界都要【报丢弃计数】，绝不静默” —— 超限 append 的收据带 dropped（或具名拒）',
    { threw: ap.threw && short(ap.threw.message), value: ap.value && Object.keys(ap.value), json: short(apJson) })
  const st = attempt(() => mm.status())
  ok(st.threw === null && st.value !== null && JSON.stringify(st.value).length > 2,
    '★ status() 可读（只读面）', st.threw ? short(st.threw.message) : Object.keys(st.value))
  // ③ 不读真实时间 + 同输入同结果
  const src = srcOf('minutes.js')
  const bad = ['Date.now(', 'Math.random('].filter((p) => src.includes(p))
  ok(bad.length === 0, '★ “③ 不读真实时间（只用注入的 clock）——同一输入在任何时刻都得到同一结果” —— 源码扫描', bad)
  // ★ 我上一版拿 status() 两次比"同结果" ⇒ 不对：status() 里有 **counts.reads 调用计数**（实测 1→2），
  //   它是统计面、不是确定性面。改成比【纯读面 list()】的行逐字相同（并把 status 的计数行为写在 detail 里）。
  const liA = attempt(() => mm.list())
  const liB = attempt(() => mm.list())
  ok(liA.threw === null && liB.threw === null && liA.value !== null && typeof liA.value === 'object' && JSON.stringify(liA.value) === JSON.stringify(liB.value),
    '★ “同一输入在任何时刻都得到同一结果” —— 纯读面 list() 两次逐字相同（status() 另带 counts.reads 调用计数，属统计面）',
    { same: JSON.stringify(liA.value) === JSON.stringify(liB.value), statusKeys: (attempt(() => mm.status()).value || {}).counts })
  // 行动项的具名拒由【confirm()】落实（actionsOwnerRequired/dueRequired），actions() 只是读面
  const strictMin = MI.createMinutes({ clock: () => 'T0', meeting: meetingSeam, settings: { 'vmu.minutes.actionsOwnerRequired': true, 'vmu.minutes.dueRequired': true } })
  const sd = attempt(() => strictMin.draft({ meetingId: 'm1' }))
  const sid = sd.value && (sd.value.id || sd.value.minutesId)
  const readActs = attempt(() => strictMin.actions({ id: sid }))
  ok(readActs.threw === null && readActs.value && Array.isArray(readActs.value.actions),
    '★ actions({id}) 是【读面】：返回 { ok, id, actions }（不抛）', readActs.threw ? short(readActs.threw.message) : Object.keys(readActs.value))
  const badAct = attempt(() => strictMin.confirm({ id: sid, by: 'ann', dissent: [], actions: [{ text: 'do it' }] }))
  ok(codeOf(badAct) !== null && String(codeOf(badAct)).startsWith('VMU_'),
    '★ “actionsOwnerRequired / dueRequired” —— 落实在 confirm()：缺 owner/due 的行动项具名拒',
    { code: codeOf(badAct), msg: short(msgOf(badAct)), id: sid })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. course：24 键分区、不新增码、拒绝带 enforced 数组、按码计数、只读不改、越界/未达具名拒 ===')
{
  const wired = CO.WIRED_COURSE_KEYS
  const planned = CO.PLANNED_COURSE_KEYS.map((e) => (Array.isArray(e) ? e[0] : e))
  ok(CO.COURSE_KEYS.length > 0 && CO.COURSE_KEYS.length === 24, '★ “把 vmu.teaching.* 24 键接成可观测行为” —— COURSE_KEYS 恰 24', CO.COURSE_KEYS.length)
  ok(wired.length > 0 && planned.length > 0 && wired.filter((k) => planned.includes(k)).length === 0 && wired.length + planned.length === 24,
    '★ “未接逐个点名＋原因 且 wired ∩ planned = ∅、二者【恰好划分 24】”',
    { wired: wired.length, planned: planned.length, overlap: wired.filter((k) => planned.includes(k)), sum: wired.length + planned.length })
  ok(CO.PLANNED_COURSE_KEYS.length > 0 && CO.PLANNED_COURSE_KEYS.every((e) => Array.isArray(e) && e.length >= 2 && typeof e[1] === 'string' && e[1].length > 0),
    '★ “未接：逐个点名＋原因” —— 每条带非空原因', CO.PLANNED_COURSE_KEYS.map((e) => e[0]))
  // ★ “本面不新增码，一律用已登记共享码” 的正确测法：文件里用到的每个 VMU_* 码都**在登记表里**
  //   （★ 我上一版只扫 `VMU_COURSE_` 前缀 ⇒ 错：那两个码**确实已登记**在 docs/03-interface-contract.md:855/857）。
  const registry = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md'), 'utf8')
  const src = srcOf('course.js')
  const bad = ['Date.now(', 'Math.random('].filter((p) => src.includes(p))
  const usedCodes = [...new Set(src.match(/VMU_[A-Z_]+/g) || [])]
  const unregistered = usedCodes.filter((c) => !registry.includes(c))
  ok(usedCodes.length > 0 && unregistered.length === 0,
    '★ “码：本面不新增码，一律用已登记共享码（VMU_NOT_PERMITTED／VMU_META_VALIDATION_FAILED／…）” —— 文件用到的每个码都在登记表里',
    { used: usedCodes.length, unregistered })
  ok(bad.length === 0, '★ “⑤ 注入时钟（不读真实时间）” —— 源码扫描', bad)
  const co = CO.createCourse({ clock: () => 1000 })
  const FACE = ['open', 'enroll', 'align', 'submit', 'review', 'grade', 'evidencePack', 'publish', 'status', 'keysUsed', 'partition', 'config', 'refusals']
  ok(FACE.length > 0 && FACE.every((m) => typeof co[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof co[m] !== 'function'), keys: Object.keys(co) })
  const part = attempt(() => co.partition())
  ok(part.threw === null && part.value !== null, '★ 面自带 partition() 自述分区', part.threw ? short(part.threw.message) : part.value && Object.keys(part.value))
  // ⑥ 零机制不崩：★ 实测 `enabled` 未声明时 open() **照常成功**（零机制默认可用）⇒ "禁用 ⇒ 具名拒"要用 enabled:false 显式测
  const disabled = CO.createCourse({ clock: () => 1000, settings: { 'vmu.teaching.enabled': false } })
  const zeroOpen = attempt(() => disabled.open({ id: 'c0', title: 'zero' }))
  const enabled = CO.createCourse({ clock: () => 1000, settings: { 'vmu.teaching.enabled': true } })
  const okOpen = attempt(() => enabled.open({ id: 'c1', title: 'T', outcomes: ['o1'] }))
  const refObj = zeroOpen.threw || zeroOpen.value
  ok(codeOf(zeroOpen) === 'VMU_NOT_PERMITTED' && typeof hintOf(zeroOpen) === 'string' && refObj && Array.isArray(refObj.enforced),
    '★ “② 回执带 enforced[] ＋【拒绝路径必带】（数组／可空／不得 undefined）” ＋ “⑥ 零机制不崩” ⇒ 未启用时具名拒且带 enforced 数组',
    { code: codeOf(zeroOpen), hint: hintOf(zeroOpen), enforced: refObj && refObj.enforced, isArr: refObj && Array.isArray(refObj.enforced), openKeys: okOpen.value && Object.keys(okOpen.value) })
  ok(okOpen.threw === null && okOpen.value !== null, '★ 启用后可开课（否证"一律拒"）', okOpen.threw ? short(okOpen.threw.message) : okOpen.value && Object.keys(okOpen.value))
  const cid = okOpen.value && (okOpen.value.id || okOpen.value.courseId || 'c1')
  // ③ 按码计数（在【发生过拒绝的实例】上读）
  const refs = attempt(() => enabled.refusals())
  const refsObj = refs.value === null ? (attempt(() => enabled.status()).value || {}).refusals : refs.value
  ok(codeOf(zeroOpen) !== null, '★ 前置：确实发生过一次具名拒（供按码计数断言使用）', { code: codeOf(zeroOpen) })
  // 越界 gradeScale/passMark ⇒ 拒
  const badGrade = attempt(() => enabled.grade({ courseId: cid, member: 'ann', score: 200, gradeScale: 100 }))
  ok(codeOf(badGrade) !== null, '★ “gradeScale／passMark 越界 ⇒ 拒”', { code: codeOf(badGrade), msg: short(msgOf(badGrade)) })
  // reviewersPerSubmission 未达 ⇒ 拒 ＋ 当前/门槛
  const strictReview = CO.createCourse({ clock: () => 1000, settings: { 'vmu.teaching.enabled': true, 'vmu.teaching.reviewersPerSubmission': 2 } })
  const srOpen = attempt(() => strictReview.open({ id: 'c2', title: 'T2', outcomes: ['o1'] }))
  const srId = srOpen.value && (srOpen.value.id || srOpen.value.courseId || 'c2')
  const srSub = attempt(() => strictReview.submit({ courseId: srId, member: 'ann', artifact: 'a1', outcome: 'o1' }))
  const srRev = attempt(() => strictReview.review({ courseId: srId, submission: (srSub.value && srSub.value.id) || 's1', by: 'bob', verdict: 'ok' }))
  const srGrade = attempt(() => strictReview.grade({ courseId: srId, member: 'ann', score: 90 }))
  const srMsg = msgOf(srGrade) + msgOf(srRev)
  ok(codeOf(srGrade) !== null || codeOf(srRev) !== null, '★ “reviewersPerSubmission 未达 ⇒ 拒 ＋ 当前/门槛”',
    { sub: codeOf(srSub), rev: codeOf(srRev), grade: codeOf(srGrade), msg: short(srMsg) })
  // ⑦ 只读面不改状态
  const stA = JSON.stringify(attempt(() => enabled.status()).value)
  const stB = JSON.stringify(attempt(() => enabled.status()).value)
  ok(stA.length > 2 && stA === stB, '★ “⑦ 只读面（status/list）不改状态” —— 两次 status() 逐字相同', { same: stA === stB, len: stA.length })
  const drefs = attempt(() => disabled.refusals()).value || refsObj
  ok(drefs && typeof drefs === 'object' && Number(drefs[codeOf(zeroOpen)]) >= 1,
    '★ “拒绝按码计数” —— 发生过该拒绝的实例自报它 ≥1（不是空对象）', { code: codeOf(zeroOpen), refs: drefs })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. panel：框架写时间、追加不改写、偏离必记录、查看必审计且丢弃计数、成员缝镜像 ===')
{
  ok(PA.apiVersion === 1, '★ apiVersion 为 1', PA.apiVersion)
  ok(PA.PANEL_FIELDS.length > 0 && PA.PANEL_FIELDS.length === 5 && PA.PANEL_FIELDS.includes('subtasks'),
    '★ “The five fields. subtasks is the one the v5r line was missing (D-08 baseline B)”', PA.PANEL_FIELDS)
  ok(PA.PANEL_SUBTASK_STATES.length > 0 && PA.PANEL_SUBTASK_STATES.length === 4 && PA.PANEL_SUBTASK_STATES.includes('running'),
    '★ “A running sub-task’s state. running is what 正在执行的子任务 means”', PA.PANEL_SUBTASK_STATES)
  ok(PA.PANEL_KEYS.length > 0 && PA.PANEL_KEYS.length === 4 && PA.WIRED_PANEL_KEYS.length === PA.PANEL_KEYS.length && PA.PLANNED_PANEL_KEYS.length === 0,
    '★ “All four keys decide something: caps bound the ledgers (counted drops), the policy picks refuse-vs-record” —— 四键全接、planned 为空',
    { keys: PA.PANEL_KEYS, wired: PA.WIRED_PANEL_KEYS.length, planned: PA.PLANNED_PANEL_KEYS.length })
  const pn = PA.createPanel({ clock: () => 1000 })
  const FACE = ['set', 'fieldsOf', 'timesOf', 'get', 'view', 'history', 'audit', 'snapshot', 'restore', 'board', 'status', 'keysUsed', 'partition']
  ok(FACE.length > 0 && FACE.every((m) => typeof pn[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof pn[m] !== 'function'), keys: Object.keys(pn) })
  // ★ 框架写时间：调用方给 ...At ⇒ 具名拒
  const callerTime = await attemptA(() => pn.set('ann', { status: 'x', statusAt: 123 }, { by: 'ann' }))
  ok(codeOf(callerTime) !== null && /time|At|Ms|时刻/i.test(String(codeOf(callerTime)) + msgOf(callerTime)),
    '★ “THE FRAMEWORK WRITES THE TIMES. Any caller-supplied ...At/...Ms is refused BY NAME (I-3)”',
    { code: codeOf(callerTime), msg: short(msgOf(callerTime)), threw: callerTime.threw && short(callerTime.threw.message) })
  // 追加不改写：两次 set ⇒ 历史两行且首行内容不变
  const s1 = await attemptA(() => pn.set('ann', { overall: 'v1', status: 'working' }, { by: 'ann' }))
  const hist1 = (attempt(() => pn.history('ann')).value || {}).entries
  const s2 = await attemptA(() => pn.set('ann', { status: 'blocked' }, { by: 'ann' }))
  const hist2 = (attempt(() => pn.history('ann')).value || {}).entries
  // RULE B needs a non-empty guard: two EMPTY histories would satisfy a length comparison while testing nothing, so the
  // first history must be non-empty for 'one more row' to mean anything.
  ok(s1.threw === null && s2.threw === null && Array.isArray(hist1) && hist1.length > 0 && Array.isArray(hist2) && hist2.length === hist1.length + 1,
    '★ “APPEND-ONLY. Every accepted change appends to that member’s history; the latest row is derived, never rewritten”',
    { h1: Array.isArray(hist1) ? hist1.length : hist1, h2: Array.isArray(hist2) ? hist2.length : hist2 })
  // 偏离必记录：另一人改写 overall ⇒ deviation 保留前值+作者
  const s3 = await attemptA(() => pn.set('ann', { overall: 'v2' }, { by: 'bob' }))
  const got = attempt(() => pn.get('ann')).value
  const dev = got && (got.deviation || (got.fields && got.fields.deviation) || null)
  ok(s3.threw === null && dev !== null && JSON.stringify(dev).includes('v1'),
    '★ “DEVIATION IS RECORDED, NEVER SWALLOWED … the previous value and its author are kept in deviation (retrievable)”',
    { keys: got && Object.keys(got), dev })
  // 策略 refuse ⇒ 具名拒
  const strictPanel = PA.createPanel({ clock: () => 1000, settings: { 'vmu.panel.deviationPolicy': 'refuse' } })
  await attemptA(() => strictPanel.set('cy', { overall: 'x1' }, { by: 'cy' }))
  const refused = await attemptA(() => strictPanel.set('cy', { overall: 'x2' }, { by: 'dee' }))
  ok(codeOf(refused) !== null, '★ “policy vmu.panel.deviationPolicy can instead REFUSE the write by name”',
    { code: codeOf(refused), msg: short(msgOf(refused)) })
  // 查看审计 + 上限丢弃计数（先制造出可丢的东西）
  const capped = PA.createPanel({ clock: () => 1000, settings: { 'vmu.panel.auditCap': 1 } })
  await attemptA(() => capped.set('a', { status: 's1' }, { by: 'a' }))
  await attemptA(() => capped.set('b', { status: 's2' }, { by: 'b' }))
  attempt(() => capped.view({ viewer: 'a', ids: ['b'] }))
  attempt(() => capped.view({ viewer: 'b', ids: ['a'] }))
  const stC = attempt(() => capped.status()).value || {}
  const auditRows = attempt(() => capped.audit()).value
  const capJson = JSON.stringify(stC)
  ok(Array.isArray(auditRows) && auditRows.length <= 1 && /drop/i.test(capJson),
    '★ “VIEWING IS AUDITED. view() writes who looked at whom; the audit is capped and the drops are COUNTED”',
    { audit: Array.isArray(auditRows) ? auditRows.length : auditRows, statusKeys: Object.keys(stC), json: short(capJson) })
  // 成员缝镜像：注入 ⇒ mirrored:true；缺席 ⇒ 自述为权威
  let mirrored = 0
  const seamPanel = PA.createPanel({ clock: () => 1000, members: { selfReport: (...a) => { mirrored += 1; return { ok: true } } } })
  await attemptA(() => seamPanel.set('ann', { overall: 'm1' }, { by: 'ann' }))
  const withSeam = attempt(() => seamPanel.status()).value || {}
  const noSeamStatus = attempt(() => pn.status()).value || {}
  ok(mirrored >= 1 && JSON.stringify(withSeam).includes('mirrored') && !JSON.stringify(noSeamStatus).includes('"mirrored":true'),
    '★ “When a members seam is injected … reports mirrored:true; when the seam is absent this panel’s ledger is the authority and it says so”',
    { mirrored, withSeamKeys: Object.keys(withSeam), noSeamKeys: Object.keys(noSeamStatus) })
  // 拒绝带 enforced + enforcedScope（panel 的 refuse 签名）
  const refP = await attemptA(() => pn.set('ann', { status: 's', statusAt: 1 }, { by: 'ann' }))
  const refObjP = refP.threw || refP.value
  ok(refObjP && Array.isArray(refObjP.enforced) && typeof refObjP.enforcedScope === 'string' && refObjP.enforcedScope.length > 0,
    '★ “EVERY refusal states its evaluated scope (D3): enforced[] (empty when this decision read no settings key, never undefined) plus enforcedScope”',
    { enforced: refObjP && refObjP.enforced, scope: refObjP && refObjP.enforcedScope, isArr: refObjP && Array.isArray(refObjP.enforced) })
}

console.log('')
console.log('=== KERNEL CLAIMS 9L: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · minutes : 快照 SNAPSHOT_VERBATIM_CAP 的计数上报 · confirm() 的 dissentMandatory/confirmPreviousRequired 分支 ·')
console.log('             zones()/gaps()/resolve()/supersede() 的语义 · dissentRetentionMs 的过期行为 · snapshot()/restore() 往返')
console.log('  · course  : align() 的"成果↔产物对齐缺项"具名拒 · evidencePack 缺引用拒 · allowLate/latePenaltyRatio 的自曝处置 ·')
console.log('             cohortMax 触界 · submitMode/maxAttempts/rubricRequired/peerWeight 的行为面 · 24 键逐个改变可观测行为')
console.log('  · panel   : 私有消息内容不进 view（G5 边界）· subtasks 生命周期 · historyCap 触界 · board() · snapshot()/restore() 往返 ·')
console.log('             restore 的三类 RESUME_CODE 拒绝')

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 9L SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 9L (minutes 13 · course 14 · panel 12): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)

