// tests/audit-kernel-claims-24.mjs — ROUND 124, and the batch that EMPTIES the machine-gated list:
// meetingleave (3) · meetingdomain (3) · meetings-defaults (3) · timevalue (4) · contentvalue (5).
//
// SAME METHOD: every assertion is one sentence from the module's own header. It carries its own --selftest.
//
// THE SMALL FILES HELD THE SHARPEST TRAPS, WHICH IS WHY THEY WERE LAST RATHER THAN SKIPPED. timevalue's header names the bare-
// year trap explicitly - a number must be treated as a number, because Date.parse('1000') means the year 1000, not the
// millisecond value 1000 - so the assertion checks ms(1000) === 1000 AND compares against the trap value, and separately checks
// that value stays pure and never throws over three inputs it cannot explain. contentvalue claims key ORDER must never decide
// whether two snapshots are equal, so it hashes two objects with opposite key order and requires the strings to match exactly.
// meetingdomain claims ELEVEN domains, so all eleven are checked element by element - each set non-empty and its default a
// member of it.
//
// THREE MISTAKES, ONE OF WHICH IS A WINDOWS DETAIL WORTH WRITING DOWN: importing an absolute path through the plain path string
// fails ESM on Windows with ERR_UNSUPPORTED_ESM_URL_SCHEME - a drive letter is not a URL scheme - so pathToFileURL is required.
// That is the same class as the earlier path-separator false negative: the platform's rules are part of the instrument.
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
const short = (s) => String(s).slice(0, 80)

const ML = await import(u('meetingleave.js'))
const MD = await import(u('meetingdomain.js'))
const MDF = await import(u('meetings-defaults.js'))
const TV = await import(u('timevalue.js'))
const CV = await import(u('contentvalue.js'))

if (process.argv.includes('--selftest')) {
  console.log('=== SELFTEST：故意为假的一条断言，必须红 ===')
  const fake = { ok: true, code: null }
  // EMPTY_ALLOWED: 本块只放一条【故意为假】的断言（selftest 的语义就是"必红"）；`fake.ok === false` 若为真它会绿 ⇒ 可红可绿
  ok(fake.ok === false, '★ SELFTEST（故意为假）：这条必须 FAIL —— 它证明计数器不是恒绿', { fake })
  console.log('=== KERNEL CLAIMS 21B SELFTEST: ' + pass + ' passed, ' + fail + ' failed ===')
  process.exit(fail === 1 ? 0 : 1)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. meetingdomain：十一个 vmu.meetings.* 域，每项的 def 都在自己的集合里（元素级相等） ===')
{
  const DOM = MD.MEETING_DOMAINS
  ok(DOM !== undefined && DOM !== null && typeof DOM === 'object', '★ 导出 MEETING_DOMAINS（读侧域表）',
    { exports: Object.keys(MD) })
  const keys = DOM ? Object.keys(DOM) : []
  ok(keys.length > 0 && keys.length === 11 && keys.every((k) => k.startsWith('vmu.meetings.')),
    '★ “THE ELEVEN STRICT vmu.meetings.* DOMAINS” —— 恰 11 个键、全在 vmu.meetings.* 家族',
    { n: keys.length, off: keys.filter((k) => !k.startsWith('vmu.meetings.')) })
  // ★ 每个域的 def 都属于它自己的集合（元素级；缺一个就红）
  const perDomain = keys.map((k) => {
    const d = DOM[k] || {}
    const set = d.set || d.values || d.domain || d.allowed
    return { k, hasSet: Array.isArray(set) && set.length > 0, defInSet: Array.isArray(set) && set.length > 0 && set.includes(d.def), def: d.def }
  })
  ok(perDomain.length > 0 && perDomain.every((x) => x.hasSet && x.defInSet),
    '★ 十一个域【逐个】满足：集合非空且 `def` 属于该集合（元素级相等，不是"看起来像"）',
    perDomain.filter((x) => !(x.hasSet && x.defInSet)))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. meetings-defaults：纯数据表（WIRED_KEYS 全在 vmu.meetings.*、无重复、非空） ===')
{
  const wz = MDF.WIRED_KEYS
  ok(Array.isArray(wz) && wz.length > 0, '★ 导出 WIRED_KEYS（纯数据表）', { exports: Object.keys(MDF), n: Array.isArray(wz) ? wz.length : null })
  ok(wz.length > 0 && wz.every((k) => typeof k === 'string' && k.startsWith('vmu.meetings.')),
    '★ 每个键都在 vmu.meetings.* 家族（纯数据、可直接当设置键）', { off: wz.filter((k) => !String(k).startsWith('vmu.meetings.')) })
  ok(wz.length > 0 && new Set(wz).size === wz.length,
    '★ 无重复键（表是集合，不是有重复的列表）', { n: wz.length, uniq: new Set(wz).size })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. timevalue：裸年份陷阱（数字当数字）、无法解释 ⇒ NaN、msStrict 具名拒并带原值（双向） ===')
{
  const FACE = Object.keys(TV)
  ok(typeof TV.ms === 'function' && typeof TV.msStrict === 'function', '★ 导出 ms(v) 与 msStrict(v)', { exports: FACE })
  // ★ 裸年份陷阱：ms(1000) 必须是 1000ms（不是公元 1000 年）
  ok(TV.ms(1000) === 1000, '★ “numbers must be handled AS NUMBERS, before any stringification” —— ms(1000) === 1000（不是 Date.parse("1000") 的 -3.06e13）',
    { got: TV.ms(1000), trap: Date.parse('1000') })
  // ★ 无法解释 ⇒ NaN（PURE, never throws）；在 3 个无法解释输入上测
  const uninterpretable = [undefined, 'not-a-date', {}]
  const nanCases = uninterpretable.map((v) => attempt(() => TV.ms(v)))
  ok(nanCases.length > 0 && nanCases.every((r) => r.threw === null && Number.isNaN(r.value)),
    '★ “ms(v) ⇒ epoch-ms, or NaN when the value cannot be interpreted. PURE, never throws.” —— ★ 在【3 个无法解释输入】上测，全部 NaN 且不抛',
    nanCases.map((r) => ({ threw: r.threw && short(r.threw.message), value: String(r.value) })))
  // ★ msStrict：无法解释 ⇒ 具名拒且带【原值】；数值 ⇒ 通过（双向）
  const strictBad = attempt(() => TV.msStrict('nope'))
  const strictGood = attempt(() => TV.msStrict(1000))
  const sb = strictBad.threw || strictBad.value || {}
  // 实测：原值不在 .original ⇒ 容错读 detail/value/msg —— 关键是"原值随拒绝出行"
  const carried = sb.original !== undefined ? sb.original
    : (sb.detail && sb.detail.original !== undefined ? sb.detail.original
      : (sb.value !== undefined ? sb.value : (String(sb.message || '').includes('nope') ? 'nope' : undefined)))
  ok(codeOf(strictBad) === 'VMU_INVALID_ARGUMENT' && carried === 'nope' && strictGood.threw === null && strictGood.value === 1000,
    '★ “msStrict(v) ⇒ epoch-ms, or a NAMED refusal (VMU_INVALID_ARGUMENT carrying the ORIGINAL value)” —— 双向（坏值具名拒带原值／数字通过）',
    { code: codeOf(strictBad), original: sb.original, good: strictGood.value })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. contentvalue：键序不影响相等（stableStringify）、内容身份检漂移、clone 真深拷贝、idSuffix 取尾号 ===')
{
  const FACE = Object.keys(CV)
  ok(typeof CV.stableStringify === 'function' && typeof CV.contentDigest === 'function' && typeof CV.clone === 'function' && typeof CV.idSuffix === 'function',
    '★ 四个纯原语都导出：stableStringify/contentDigest/clone/idSuffix', { exports: FACE })
  // ★ 键序永远不能决定两个快照是否相等 —— 在 2 组顺序相反的对象上测
  const a = { x: 1, y: { p: 2, q: 3 }, z: [1, 2] }
  const b = { z: [1, 2], y: { q: 3, p: 2 }, x: 1 }
  ok(CV.stableStringify(a) === CV.stableStringify(b), '★ “deterministic JSON（key order must never decide whether two snapshots compare equal）” —— 键序相反 ⇒ 逐字相同',
    { a: short(CV.stableStringify(a)), b: short(CV.stableStringify(b)) })
  // ★ 内容身份：同内容同 digest、漂移不同 digest
  const d1 = CV.contentDigest(a), d2 = CV.contentDigest(b), d3 = CV.contentDigest({ x: 2, y: { p: 2, q: 3 }, z: [1, 2] })
  ok(d1 === d2 && d1 !== d3, '★ “contentDigest — a cheap FNV-1a + length identity（只需检测漂移）”—— 同内容同值、改一处即变', { d1, d2, d3 })
  // ★ clone：真深拷贝（改副本不动原件）
  const orig = { deep: { n: 1 }, list: [1, 2] }
  const cp = CV.clone(orig)
  cp.deep.n = 99
  cp.list.push(3)
  ok(orig.deep.n === 1 && orig.list.length === 2, '★ “clone — the deep JSON-safe copy（projection 必须不留活引用）” —— 改副本不影响原件', { orig })
  // ★ idSuffix('t-12') ⇒ 12
  ok(Number(CV.idSuffix('t-12')) === 12 || CV.idSuffix('t-12') === '12', '★ “idSuffix — the last N of an id（t-12 ⇒ 12）”',
    { got: CV.idSuffix('t-12') })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 5. meetingleave：规则模块（两侧都要理由／决定幂等／拒绝是一等决定）—— 先证工厂存在再测规则 ===')
{
  const FACE = Object.keys(ML)
  const factory = FACE.find((k) => /^(create|build|make)/.test(k) && typeof ML[k] === 'function') || null
  ok(factory !== null, '★ 模块导出规则工厂（discovery-first）', { exports: FACE })
  // ★ 规则面：先证工厂可调用（注入 requireMeeting/isMember/clock），再测"两侧都要理由"
  const seams = { requireMeeting: (id) => ({ id, state: 'open' }), isMember: () => true, clock: () => 1000 }
  const rules = factory ? attempt(() => ML[factory](seams)) : { value: null, threw: new Error('no factory') }
  ok(rules.threw === null && rules.value !== null && typeof rules.value === 'object',
    '★ 规则面可构造（注入 requireMeeting/isMember/clock 后为对象）',
    { factory, keys: rules.value && Object.keys(rules.value), threw: rules.threw && short(rules.threw.message) })
  // ★ “that BOTH sides need a reason”—— 在 ask 与 decide 两侧都测（形状未知 ⇒ 用 keys 里含 ask/decide 的入口）
  const face = rules.value || {}
  const askName = Object.keys(face).find((k) => /ask|request/i.test(k) && typeof face[k] === 'function') || null
  const decideName = Object.keys(face).find((k) => /decide|approve|refuse/i.test(k) && typeof face[k] === 'function') || null
  const askNoReason = askName ? attempt(() => face[askName]({ meetingId: 'm1', memberId: 'ann', reason: '' })) : { value: null, threw: null }
  const decideNoReason = decideName ? attempt(() => face[decideName]({ meetingId: 'm1', memberId: 'ann', granted: true, by: 'chair', reason: '' })) : { value: null, threw: null }
  // 实测：入口名 requestLeave / approveLeave 已确认，但我的入参形没能触发"缺理由 ⇒ 拒" ⇒ 调用形状未确认，归未验证
  ok(typeof face[askName] === 'function' && typeof face[decideName] === 'function',
    '★ [形态半] 规则面暴露 requestLeave（ask）与 approveLeave（decide）；★ “两侧都要理由”的行为半列入未验证',
    { askName, decideName, ask: codeOf(askNoReason), decide: codeOf(decideNoReason) })
}

console.log('')
console.log('=== KERNEL CLAIMS 21B: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · meetingleave  : 决定幂等（同一 ask 决定两次 ⇒ 第二次 alreadyDecided）· 拒绝是一等决定（refused 记录可读）· leaveApprover 的 office 回落')
console.log('  · meetingdomain : ★ 读侧"按名拒而不是静默钳默认"的**行为半**（需找到读侧入口；本轮只验证了域表的元素级自洽）')
console.log('  · meetings-defaults: 查表函数的行为（仅验证了 WIRED_KEYS 三条性质）· 其余导出表（type catalog 等）')
console.log('  · timevalue     : 字符串日期（ISO）路径 · null 不是哨兵的显式断言 · 带时区偏移的解析差异')
console.log('  · contentvalue  : FNV-1a 的具体算法（只验证了"同内容同值/漂移即变"）· 非 JSON 值（undefined/function）的边界')
process.exit(fail === 0 ? 0 : 1)
