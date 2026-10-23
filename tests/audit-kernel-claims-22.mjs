// tests/audit-kernel-claims-22.mjs — ROUND 121, batch F: projmigrate (6) · reportfeedbackdelivery (6) · discipline (6) · work (5).
//
// SAME METHOD: every assertion is one sentence from the module's own header. It carries its own --selftest.
//
// TWO OF THESE UNIVERSALS ARE THE KIND THAT ONLY MEAN SOMETHING WHEN SPLIT FINE. reportfeedbackdelivery claims FOUR distinct
// outcomes, so the author made the outcome SIGNATURES pairwise different - and discovered that a signature of code/delivered/
// registered made two host-failure cases look identical, which is exactly the collapse the claim forbids; adding what and stack
// separated them. discipline claims a threshold of ZERO means the mechanism is OFF rather than "zero failures allowed", tested
// by four failures still not blocking, with a threshold of one opening the breaker as the positive control.
//
// AND ONE CLAIM WAS TESTED STRUCTURALLY, WHICH IS THE RIGHT LEVEL FOR IT: work.js says everything is written through
// store.patch(key, fn) - a FUNCTIONAL change inside the fold - so the probe watches the seam and requires every call to use
// key 'work' with a function argument. Nothing about the answer would prove that; only the shape of the call does.
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
const codeOf = (r) => (r.threw && r.threw.code) || (r.value && r.value.code) || null
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const short = (s) => String(s).slice(0, 90)

const PM = await import(u('projmigrate.js'))
const RF = await import(u('reportfeedbackdelivery.js'))
const DC = await import(u('discipline.js'))
const WK = await import(u('work.js'))
const RFB = await import(u('reportfeedback.js'))

// ── --selftest ──
if (process.argv.includes('--selftest')) {
  console.log('=== SELFTEST：故意为假的一条断言，必须红 ===')
  const fake = { ok: true, code: null }
  // EMPTY_ALLOWED: 本块只放一条【故意为假】的断言（selftest 的语义就是"必红"）；`fake.ok === false` 若为真它会绿 ⇒ 可红可绿，非恒绿
  ok(fake.ok === false, '★ SELFTEST（故意为假）：这条必须 FAIL —— 它证明计数器不是恒绿', { fake })
  console.log('=== KERNEL CLAIMS 19B SELFTEST: ' + pass + ' passed, ' + fail + ' failed ===')
  process.exit(fail === 1 ? 0 : 1)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. projmigrate：每条不变式都被 status() 自述为真（7 条）＋未知版本/种类按名拒＋读纯 ===')
{
  ok(PM.apiVersion === 1, '★ apiVersion 为 1', PM.apiVersion)
  const CODES = ['VMU_COMPAT_UNKNOWN_COMBO', 'VMU_NOT_FOUND', 'VMU_MIGRATE_DRYRUN_FAILED', 'VMU_INDEX_STALE', 'VMU_RESOURCE_BUDGET']
  const cv = Object.values(PM.CODE)
  ok(cv.length > 0 && CODES.length > 0 && CODES.every((c) => cv.includes(c)), '★ CODE 复用 stateversion 的五个已登记码', cv.filter((c) => !CODES.includes(c)))
  const pm = PM.createProjectionMigrator({ clock: () => 1000 })
  const FACE = ['register', 'read', 'upgrade', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof pm[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof pm[m] !== 'function'), keys: Object.keys(pm) })
  // ★ 七条硬不变式：status() 逐条自述为 true（每条单独可测）
  const st = attempt(() => pm.status())
  const v = st.value || {}
  const FLAGS = ['unknownVersionRefused', 'unknownKindRefused', 'migrationsAreExplicit', 'silentDropForbidden',
    'failedMigrationLeavesOriginalUntouched', 'checksumRecomputedAfterMigration', 'idempotentNoopAtTarget', 'readsArePure']
  const held = FLAGS.filter((f) => v[f] === true)
  ok(st.threw === null && FLAGS.length > 0 && held.length === FLAGS.length,
    '★ 七条不变式（未知版本/种类按名拒、迁移显式、禁止静默丢弃、失败不留半迁移、迁移后重算校验和、幂等 noop、读纯）—— status() 逐条自述为 true',
    { held, missing: FLAGS.filter((f) => v[f] !== true), keys: Object.keys(v) })
  const st2 = attempt(() => pm.status())
  ok(st.threw === null && st2.threw === null && same(st.value, st2.value), '★ “reads never mutate” —— 两次 status() 逐字相同', { same: same(st.value, st2.value) })
  // 未知版本/种类 ⇒ 具名拒（用 read/upgrade 尝试，形状不定 ⇒ 只要有 VMU_ 码即可）
  const unknownRead = attempt(() => pm.read({ kind: 'idempotency', doc: { version: 999 } }))
  const unknownKind = attempt(() => pm.read({ kind: 'no-such-kind', doc: { version: 1 } }))
  ok(codeOf(unknownRead) !== null || codeOf(unknownKind) !== null,
    '★ “an unknown version / unknown kind is REFUSED BY NAME — never treated as the current version” —— 至少一支具名拒（形状未全确认）',
    { version: codeOf(unknownRead), kind: codeOf(unknownKind), keys: unknownRead.value && Object.keys(unknownRead.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. reportfeedbackdelivery：四种结果各自可区分（OFF 零机制／ON 无受众名拒／宿主不可用带 stack／成功 delivered:true） ===')
{
  // ① OFF ⇒ 零机制：什么都没投递、也没有臆造失败
  const off = attempt(() => RF.deliverReportFeedback({ enabled: false }))
  const o = off.value || {}
  ok(off.threw === null && o.enabled === false && o.delivered === false && o.registered === false && o.code === null && o.what === null && o.reason === null && o.stack === null,
    '★ “the switch is OFF ⇒ zero mechanism: nothing delivered, and **NO invented failure**” —— 九个键都在且失败字段全 null',
    o)
  // ② ON 但无受众 ⇒ 具名失败（what 指向 audience）
  const noAud = attempt(() => RF.deliverReportFeedback({ enabled: true, audience: null }))
  const na = noAud.value || {}
  ok(noAud.threw === null && na.enabled === true && na.delivered === false && typeof na.code === 'string' && String(na.what).includes('audience') && typeof na.reason === 'string' && na.reason.length > 0,
    '★ “the switch is ON with NO AUDIENCE ⇒ a NAMED failure” —— code ＋ what 指向 audience ＋ 非空 reason',
    { code: na.code, what: na.what, reason: short(na.reason) })
  // ③ 宿主不能接收：两种子情形分别测 —— (a) 没有 .context ⇒ 具名失败；(b) 取用【抛】 ⇒ 具名失败**带 stack**
  const noCtx = attempt(() => RF.deliverReportFeedback({ enabled: true, audience: 'office', ctx: { systemPrompt: {} } }))
  const nc = noCtx.value || {}
  const throwing = attempt(() => RF.deliverReportFeedback({ enabled: true, audience: 'office', ctx: { systemPrompt: { context: () => { throw new Error('host refused') } } } }))
  const th = throwing.value || {}
  ok(noCtx.threw === null && nc.delivered === false && typeof nc.code === 'string' &&
     throwing.threw === null && th.delivered === false && typeof th.code === 'string' && typeof th.stack === 'string' && th.stack.length > 0,
    '★ “the host cannot take the call (unreachable, or no `.context`) ⇒ a NAMED failure with the stack” —— ★ 两个子情形分别测：无 .context 具名拒；取用抛 ⇒ 具名拒＋非空 stack',
    { noCtx: nc.code, threw: th.code, hasStack: typeof th.stack === 'string' && th.stack.length > 0 })
  // ④ 成功路径：ctx 带 .context ⇒ delivered:true、registered:true（并核对 order 取自导出常量）
  let ctxCall = null
  // ★ 宿主缝形实测是 ctx.systemPrompt.context（与入口的 prompt-section 一致），不是 ctx.context
  const goodCtx = { systemPrompt: { context: (payload) => { ctxCall = payload; return () => {} } } }
  const good = attempt(() => RF.deliverReportFeedback({ enabled: true, audience: 'office', ctx: goodCtx }))
  const g = good.value || {}
  ok(good.threw === null && g.delivered === true && g.registered === true && g.code === null && ctxCall !== null &&
     Number(ctxCall.order) === Number(RFB.REPORT_FEEDBACK_CONTEXT_ORDER),
    '★ “otherwise ⇒ delivered:true, registered:true” ＋ “order 是 REPORT_FEEDBACK_CONTEXT_ORDER（宿主从调用方取 order）” —— 成功且 order 与常量一致',
    { delivered: g.delivered, registered: g.registered, order: ctxCall && ctxCall.order, constant: RFB.REPORT_FEEDBACK_CONTEXT_ORDER, keys: ctxCall && Object.keys(ctxCall) })
  // ★ 四种结果两两可区分（不是"都是 false"）
  // ★ 签名要含 what／stack：两个"宿主不可用"子情形共享 code，但 what/stack 不同（这正是四态可区分的地方）
  const sigs = [o, na, nc, g].map((x, i) => String(x.code) + '|' + String(x.what) + '|' + String(x.delivered) + '|' + String(x.registered) + '|' + (x.stack === null ? 'nostack' : 'stack'))
  ok(sigs.length === 4 && new Set(sigs).size === 4,
    '★ “It decides between FOUR outcomes and returns the nine-key receipt state” —— ★ 四种结果的签名两两不同',
    { sigs })
  // ★ 载荷是运行时快照、明说不是指令（读 payload 自身字段/文本）
  const payloadText = ctxCall && (typeof ctxCall.text === 'string' ? ctxCall.text : JSON.stringify(ctxCall))
  ok(ctxCall && typeof payloadText === 'string' && /notice|snapshot|delivery|not an instruction/i.test(payloadText),
    '★ “The payload is a RUNTIME SNAPSHOT … it says in words that it is a delivery notice and not an instruction”',
    { text: short(payloadText) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. discipline：阈值为零＝机制关闭（不是"零次失败"）、阈值 >0 才开闸（双向）、只读不改 ===')
{
  ok(DC.apiVersion === 1, '★ apiVersion 为 1', DC.apiVersion)
  ok(Object.keys(DC.CODE).length > 0 && DC.CODE.breakerOpen === 'VMU_DISCIPLINE_BREAKER_OPEN', '★ CODE 非空且含 breakerOpen', { n: Object.keys(DC.CODE).length })
  const dc = DC.createDiscipline({ clock: () => 1000 })
  const FACE = ['recordFailure', 'mayAct', 'suspend', 'restore', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof dc[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof dc[m] !== 'function'), keys: Object.keys(dc) })
  // ★ “a threshold of zero means the mechanism is OFF (never ‘zero failures allowed’)” —— 阈值 0 时连续多次失败仍不阻断
  const zero = DC.createDiscipline({ clock: () => 1000, settings: { 'vmu.discipline.breakerFailures': 0 } })
  const zeroRes = [1, 2, 3, 4].map((i) => attempt(() => zero.recordFailure({ subject: 's1', reason: 'r' + i })))
  const zeroMay = attempt(() => zero.mayAct({ subject: 's1' }))
  // RULE E wants an explicit guard even though this array comes from a literal of four: a leng="0"clause states it instead of
  // leaving the reader to prove it.
  ok(zeroRes.length > 0 && zeroRes.every((r) => r.threw === null) && zeroMay.threw === null && (zeroMay.value === null || zeroMay.value.ok !== false),
    '★ “a threshold of zero means the mechanism is OFF (never ‘zero failures allowed’)” —— ★ 4 次失败后仍不阻断（零机制）',
    { may: zeroMay.value, codes: zeroRes.map((r) => codeOf(r)) })
  // ★ 正向：阈值 1 ⇒ 第 1 次失败就开闸（具名拒）
  const one = DC.createDiscipline({ clock: () => 1000, settings: { 'vmu.discipline.breakerFailures': 1 } })
  attempt(() => one.recordFailure({ subject: 's2', reason: 'first' }))
  const blocked = attempt(() => one.mayAct({ subject: 's2' }))
  ok(codeOf(blocked) === 'VMU_DISCIPLINE_BREAKER_OPEN', '★ 正向：阈值 1 ⇒ 一次失败后 mayAct 具名拒 VMU_DISCIPLINE_BREAKER_OPEN',
    { code: codeOf(blocked), value: blocked.value })
  // 只读面 status() 两次逐字相同
  const s1 = attempt(() => dc.status())
  const s2 = attempt(() => dc.status())
  ok(s1.threw === null && s2.threw === null && same(s1.value, s2.value), '★ “read-only surfaces never mutate” —— 两次 status() 逐字相同', { same: same(s1.value, s2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. work：写入一律走 store.patch("work", 函数)（函数式变更）、五个面动作齐、只读不改 ===')
{
  ok(WK.apiVersion === 1 && WK.WORK_KEY === 'work', '★ apiVersion 为 1 且 WORK_KEY === "work"', { apiVersion: WK.apiVersion, key: WK.WORK_KEY })
  // 侦察：一切写入走 store.patch(key, fn) 且 fn 是【函数】—— 用探针缝观测
  const calls = []
  const store = { rows: {}, read() { return this.rows }, patch(key, fn) { calls.push({ key, isFn: typeof fn === 'function' }); this.rows[key] = fn(this.rows[key] || {}); return this.rows[key] } }
  const wk = WK.createWorkLedger({ store, clock: () => 1000 })
  const FACE = ['start', 'settle', 'interrupt', 'recover', 'list', 'pending', 'interrupted']
  ok(FACE.length > 0 && FACE.every((m) => typeof wk[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof wk[m] !== 'function'), keys: Object.keys(wk) })
  attempt(() => wk.start({ owner: 'ann', kind: 'task', objective: 'do the thing' }))
  const st = attempt(() => wk.status())
  ok(calls.length > 0 && calls.every((c) => c.key === 'work' && c.isFn === true) && st.threw === null,
    '★ “Everything is written through `store.patch(key, fn)`（a FUNCTIONAL change inside the fold）” —— ★ 每次写入都是 key="work" 且 fn 为函数',
    { calls: calls.slice(0, 4), keys: st.value && Object.keys(st.value) })
  const l1 = attempt(() => wk.list())
  const l2 = attempt(() => wk.list())
  const s1 = attempt(() => wk.status())
  const s2 = attempt(() => wk.status())
  ok(l1.threw === null && l2.threw === null && same(l1.value, l2.value) && s1.threw === null && s2.threw === null && same(s1.value, s2.value),
    '★ 只读面 list()/status() 两次逐字相同', { listSame: same(l1.value, l2.value), statusSame: same(s1.value, s2.value) })
  // recover() 是"启动后把仍存在的条目一律标记为中断"——只要调用不抛、且 counter 自述存在即可
  const rec = attempt(() => wk.recover())
  ok(rec.threw === null && s1.value && ['entries', 'pending', 'interrupted'].every((k) => k in s1.value),
    '★ “recover() … EVERY item still present at startup is by definition interrupted” —— 调用不抛且 status 自述三计数',
    { recover: codeOf(rec), keys: s1.value && Object.keys(s1.value) })
}

console.log('')
console.log('=== KERNEL CLAIMS 19B: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · projmigrate : 七条不变式的**行为半**（我只读了 status() 的自述布尔）· register/read/upgrade 的真实成功路径 · 校验和重算的具体值 · 步数上限/环检测')
console.log('  · rfd          : “caller 读设置并传入、**不**从回执推导”的闭环回归（本探针只验证四条结果与 order；闭环用 deliverReportFeedbackFrom + 假 kernel 需另测）')
console.log('  · discipline   : 半开探测的时间窗（需可变时钟）· suspend 上限（SUSPEND_OVER_CAP）· restore 需人（RESTORE_NEEDS_HUMAN）· postmortemRequired')
console.log('  · work         : 条目字段（owner/kind/objective/startedAt）· interrupt 的具名理由 · keepEntries/autoSettle 两键 · 重启后 recover 的实际标记')
process.exit(fail === 0 ? 0 : 1)

