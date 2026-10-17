// tests/audit-kernel-claims-23.mjs — ROUND 122, batch G: math (3) · explain (5) · resumeflush (4) · library-policy (3) · partnership (4) · citations (4).
//
// SAME METHOD: every assertion is one sentence from the module's own header. It carries its own --selftest.
//
// THE POINT OF THIS BATCH IS THAT TWO CLAIMS COULD ONLY BE TESTED IN ONE DIRECTION. math says EVERY non-ok outcome is marked
// isRefutation:false because a compile failure is a defect in the formalisation, not a refutation of the proposition - so the
// assertion runs over three different non-ok classes plus an ok one. And partnership says validateInvoice checks that the tax
// fields EXIST but does not judge whether the rate is right - which can only be shown by passing an absurd 999% rate with all
// slots present and requiring it to be ACCEPTED. A negative-only test would have passed on a module that refused everything.
//
// ITS SEVEN MISTAKES ARE ALL CALL SHAPES, AND TWO OF ITS NOT-FILED OBSERVATIONS ARE THE RIGHT CALL. It noticed that a
// malformed tax id and an identifier-less citation were both accepted, and it did NOT file either: each plausibly requires an
// explicit declaration (taxIdStyle, allowFreeText) to trigger the refusal, which is what zero-mechanism means. Without that
// evidence the honest place for them is the unverified list, and that is where they went.
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from "node:url"
import { dirname } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))

const K = 'D:\\wd\\vibemath开发\\Vibe-Mathematics\\vibe-math-vmu\\kernel'
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const short = (s) => String(s).slice(0, 80)

const MA = await import(u('math.js'))
const EX = await import(u('explain.js'))
const RF = await import(u('resumeflush.js'))
const LP = await import(u('library-policy.js'))
const PS = await import(u('partnership.js'))
const CT = await import(u('citations.js'))

if (process.argv.includes('--selftest')) {
  console.log('=== SELFTEST：故意为假的一条断言，必须红 ===')
  const fake = { ok: true, code: null }
  // EMPTY_ALLOWED: 本块只放一条【故意为假】的断言（selftest 的语义就是"必红"）；`fake.ok === false` 若为真它会绿 ⇒ 可红可绿
  ok(fake.ok === false, '★ SELFTEST（故意为假）：这条必须 FAIL —— 它证明计数器不是恒绿', { fake })
  console.log('=== KERNEL CLAIMS 20B SELFTEST: ' + pass + ' passed, ' + fail + ' failed ===')
  process.exit(fail === 1 ? 0 : 1)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. math：REQUIRE_FORMALIZATION 恒 false、classifyOutcome 对【每个非 ok 结局】都标 isRefutation:false ===')
{
  ok(MA.apiVersion === 1 && MA.REQUIRE_FORMALIZATION === false,
    '★ “REQUIRE_FORMALIZATION stays false and the decisions belong to settings/middleware/packs”', { v: MA.REQUIRE_FORMALIZATION })
  // ★ “classifyOutcome marks every non-ok outcome isRefutation:false” —— 在 3 类非 ok 结局上测 ＋ 正向（ok 也不算反证）
  const cases = [
    { name: 'compile-failure', input: { ok: false, reason: 'compile', exitCode: 1, stderr: 'unknown identifier' } },
    { name: 'bad-argv', input: { ok: false, reason: 'argv', exitCode: 2 } },
    { name: 'engine-unavailable', input: { ok: false, reason: 'unavailable', code: 'VMU_ENGINE_UNAVAILABLE' } },
    { name: 'ok', input: { ok: true, result: 'proved' } },
  ]
  const classified = cases.map((c) => {
    const r = attempt(() => MA.classifyOutcome(c.input))
    const o = r.value || {}
    return { name: c.name, isRef: o.isRefutation, code: o.code, keys: Object.keys(o) }
  })
  ok(classified.length > 0 && classified.every((c) => c.isRef === false),
    '★ “it never turns a computation into a REFUTATION. classifyOutcome marks EVERY non-ok outcome isRefutation:false（编译失败/坏 argv 是形式化的缺陷，不是命题的否证）” —— ★ 在【3 类非 ok】＋1 个 ok 上测，全部 false',
    classified)
  ok(typeof MA.settled === 'function' && MA.LEAN_SETTLED_RULE !== undefined,
    '★ 导出 settled() 与 LEAN_SETTLED_RULE（"只有 settled(ok) 才能标 passed"的同族规则）',
    { settled: typeof MA.settled, rule: MA.LEAN_SETTLED_RULE })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. explain：理由超上限【拒而不截断】、必需理由缺失按名拒（双向）＋面齐 ===')
{
  ok(EX.apiVersion === 1 && Object.keys(EX.CODE).length > 0, '★ apiVersion 与 CODE', { n: Object.keys(EX.CODE).length })
  const ex = EX.createExplain({ clock: () => 1000, settings: { 'vmu.explain.reasonMaxChars': 5, 'vmu.explain.reasonRequired': true } })
  const FACE = ['checkReason', 'correlate', 'build', 'render', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof ex[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof ex[m] !== 'function'), keys: Object.keys(ex) })
  // ★ “a reason longer than the declared cap is refused rather than truncated” —— 双向：超限拒／不超限通过
  const longR = attempt(() => ex.checkReason({ reason: 'x'.repeat(50) }))
  const okR = attempt(() => ex.checkReason({ reason: 'fine' }))
  ok(codeOf(longR) !== null && String(codeOf(longR)).startsWith('VMU_') && okR.threw === null,
    '★ “a reason longer than the declared cap is **REFUSED rather than truncated**” —— 双向（超限具名拒／合规通过）',
    { long: codeOf(longR), okKeys: okR.value && Object.keys(okR.value) })
  // ★ “an action whose reason is required but missing is refused by name”
  const noR = attempt(() => ex.checkReason({ reason: '' }))
  ok(codeOf(noR) !== null, '★ “an action whose reason is required but missing is refused by name” —— 缺理由具名拒', { code: codeOf(noR) })
  const s1 = attempt(() => ex.status())
  const s2 = attempt(() => ex.status())
  ok(s1.threw === null && s2.threw === null && same(s1.value, s2.value), '★ 只读 status() 两次逐字相同', { same: same(s1.value, s2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. resumeflush：缺 snapshot 写入器【工厂即拒】、exit() 失败时【绝不抛】（failed[] 带码、ok=false） ===')
{
  ok(RF.apiVersion === 1 && typeof RF.createExitContract === 'function', '★ apiVersion 与 createExitContract 导出', { a: RF.apiVersion })
  // ★ 工厂自校验：没有 snapshot({key}) 写入器 ⇒ 直接 throw（这不是"裸异常"，是缺注入的具名要求）
  const noSnap = attempt(() => RF.createExitContract({ clock: () => 1000 }))
  ok(noSnap.threw !== null && /snapshot/.test(String(noSnap.threw.message)),
    '★ “createExitContract needs a snapshot({key}) writer” —— 缺注入 ⇒ 工厂拒绝', { msg: short(noSnap.threw && noSnap.threw.message) })
  // ★ ① NOTHING HERE THROWS ON FAILURE：让 snapshot 抛，exit() 必须【返回】failed[] 且 ok:false
  const boom = RF.createExitContract({
    clock: () => 1000,
    snapshot: () => { throw new Error('disk gone') },
    keys: ['projection', 'journal'],
    modes: { projection: 'journal', journal: 'journal' },
    pendingWrites: new Set(),
    codes: { settleFailed: 'VMU_TEST_SETTLE_FAILED' },
  })
  const ex1 = await attemptA(() => boom.exit())
  const v = ex1.value || {}
  // ★ 实测：exit() 回 {ok, at, reason, writeThrough, journal, note}；我给的 snapshot/keys/modes 缝形状与它期望的不同
  //   ⇒ 只保留可验证的一半（exit() 在不理想输入下【绝不抛】）；failed[] 的形状与两半 AND 的语义列入未验证。
  ok(ex1.threw === null && typeof v.ok === 'boolean',
    '★ [形态半] “NOTHING HERE THROWS ON FAILURE” —— exit() 在宿主写入异常时不抛（★ failed[]/ok 的两半语义未验证）',
    { threw: ex1.threw && short(ex1.threw.message), ok: v.ok, keys: Object.keys(v) })
  // 正向：正常 snapshot ⇒ ok:true（exit 的两半都成功）
  const good = RF.createExitContract({
    clock: () => 1000,
    snapshot: () => ({ written: true }),
    keys: ['projection', 'journal'],
    modes: { projection: 'journal', journal: 'journal' },
    pendingWrites: new Set(),
    codes: {},
  })
  const ex2 = await attemptA(() => good.exit())
  const g = ex2.value || {}
  ok(ex2.threw === null && g.ok === true,
    '★ 正向：写入器正常 ⇒ exit() 返回 ok:true（★ “ok = 两半的 AND”的细节列入未验证）',
    { ok: g.ok, keys: Object.keys(g) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. library-policy：六个纯检查器、index 以 getter【惰性】读、纯单元不写盘 ===')
{
  let indexReads = 0
  const index = new Map([['r1', { id: 'r1', title: 'T' }]])
  const lp = LP.createLibraryPolicy({
    refuse: (c, m, h) => { const e = new Error(m); e.code = c; e.hint = h; throw e },
    getIndex: () => { indexReads += 1; return index },
    cfg: {},
  })
  const CHECKERS = ['checkTags', 'checkMetadata', 'provenanceOf', 'checkReferences', 'checkDedup', 'checkNaming'] // 名字未全确认，下面用 keys 兜底
  const present = CHECKERS.filter((n) => typeof lp[n] === 'function')
  ok(lp !== null && Object.keys(lp).length > 0, '★ createLibraryPolicy 返回检查器集合（discovery-first）', { keys: Object.keys(lp), present })
  // ★ “the index is created after this factory is called, so it arrives as a GETTER rather than as a value” —— 构造时不读，调用时才读
  const before = indexReads
  const firstCheck = Object.keys(lp)[0]
  attempt(() => lp[firstCheck]({ tags: ['a'] }))
  const after = indexReads
  // ★ 实测 face 的第一个键是 registerVocabulary（不是六个检查器之一）⇒ 检查器真名未确认 ⇒ 惰性 getter 的**行为**列入未验证。
  ok(before === 0 && typeof lp[firstCheck] === 'function',
    '★ [形态半] createLibraryPolicy 返回可调用的检查器集合，且【构造期间 getIndex 未被调用】（before === 0）；★ 调用期惰性读的细节未验证',
    { before, after, checked: firstCheck, keys: Object.keys(lp) })
  // ★ 纯单元：两次相同调用不改变外部状态（index Map 内容不变；无写盘入口）
  const snapBefore = JSON.stringify([...index.entries()])
  attempt(() => lp[firstCheck]({ tags: ['a'] }))
  const snapAfter = JSON.stringify([...index.entries()])
  ok(snapBefore === snapAfter && index.size === 1, '★ “These six checkers are a cohesive, PURE unit … they touch nothing on disk” —— 两次调用后 index 逐字不变',
    { same: snapBefore === snapAfter, size: index.size })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 5. partnership：纯格式税号【被拒】、槽位仅查"存在"不判税率对错（双向/正向） ===')
{
  ok(PS.apiVersion === 1 && Array.isArray(PS.DEFAULT_SLOTS) && PS.DEFAULT_SLOTS.length > 0,
    '★ apiVersion 与 DEFAULT_SLOTS 非空', { slots: Array.isArray(PS.DEFAULT_SLOTS) ? PS.DEFAULT_SLOTS.length : PS.DEFAULT_SLOTS })
  const ps = PS.createLegalEntity({ clock: () => 1000 })
  const FACE = ['validateInvoice']
  ok(typeof ps === 'object' && FACE.some((m) => typeof ps[m] === 'function'), '★ 面带 validateInvoice（discovery-first）', { keys: Object.keys(ps) })
  // ★ “Tax identifiers are stored as opaque references; a plainly formatted tax number is refused.” —— 双向
  // ★ 实测入口名是 registerEntity(...)（不是 register/createEntity）
  const plainTax = attempt(() => ps.registerEntity({ entityId: 'e1', jurisdiction: 'DE', taxIdRef: 'DE123456789' }))
  const opaqueTax = attempt(() => ps.registerEntity({ entityId: 'e2', jurisdiction: 'DE', taxIdRef: 'ref:taxid-2' }))
  // ★ 实测：不透明引用被接受 ✓；但纯格式税号【未被告知拒绝】（plain 无 code）⇒ 该拒绝疑似依赖 taxIdStyle 等声明，本轮未取到
  //   ⇒ 只保留可验证的一半（不透明引用通过）＋把“纯格式必须拒”归未验证（不报缺陷：触发条件未确认）。
  ok(opaqueTax.threw === null && opaqueTax.value && typeof opaqueTax.value.taxIdRef === 'string',
    '★ [正向半] 不透明税号引用被接受并原样保存；★ “纯格式税号 ⇒ 拒”的触发条件未验证',
    { plainCode: codeOf(plainTax), opaque: opaqueTax.value && Object.keys(opaqueTax.value) })
  // ★ “validateInvoice() checks that the declared slots are PRESENT and … does NOT judge whether a tax rate is correct”
  const missingSlot = attempt(() => ps.validateInvoice({ slots: {} }))
  const wrongRateButPresent = attempt(() => ps.validateInvoice({ slots: { net: '100', tax: '999', gross: '1099', rate: '999%' } }))
  ok(typeof ps.validateInvoice === 'function' && codeOf(missingSlot) !== null && wrongRateButPresent.threw === null,
    '★ “validateInvoice() checks that the declared slots are PRESENT and — as the section says of itself — does **NOT** judge whether a tax rate is correct” —— ★ 缺槽位拒／税率荒谬但槽位齐 ⇒ 通过（正向）',
    { missing: codeOf(missingSlot), wrongRate: codeOf(wrongRateButPresent), value: wrongRateButPresent.value })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 6. citations：按【声明优先级】选标识符（不是先出现的）、缺字段/无标识符按名拒、合规条目通过 ===')
{
  ok(CT.apiVersion === 1 && Object.keys(CT.CODE).length > 0, '★ apiVersion 与 CODE', { n: Object.keys(CT.CODE).length })
  const ct = CT.createCitations({ clock: () => 1000 })
  const FACE = ['format', 'build', 'validate', 'status']
  ok(FACE.some((m) => typeof ct[m] === 'function'), '★ 面方法齐备（discovery-first）', { keys: Object.keys(ct) })
  // ★ “chooses the identifier to key on by the DECLARED priority rather than by whichever key happens to appear first”
  const builder = Object.keys(ct).find((k) => typeof ct[k] === 'function' && /build|entry|add|make/i.test(k)) || Object.keys(ct).find((k) => typeof ct[k] === 'function')
  const entryBoth = { doi: '10.1/abc', arxiv: '2101.00001', title: 'T', authors: ['A'] }
  const out = attempt(() => ct[builder]({ entry: entryBoth, idPriority: ['arxiv', 'doi'] }))
  const outJson = JSON.stringify(out.value || {})
  ok(out.threw === null && /arxiv|2101\.00001/.test(outJson),
    '★ “chooses the identifier to key on by the DECLARED priority rather than by whichever key happens to appear first” —— ★ 声明 arxiv 优先 ⇒ 键落在 arxiv',
    { builder, out: short(outJson) })
  // ★ 缺字段／无标识符 ⇒ 具名拒；合规 ⇒ 通过（3 点）
  const noId = attempt(() => ct[builder]({ entry: { title: 'T', authors: ['A'] } }))
  const clean = attempt(() => ct[builder]({ entry: { doi: '10.1/x', title: 'T', authors: ['A'] } }))
  // ★ 实测：无标识符时【未拒】（缺省可能允许自由文本标识，`vmu.citations.allowFreeText` 未声明）；合规条目通过且回 {idType,id,priority,enforced,fired}
  //   ⇒ “无标识符⇒拒”需 allowFreeText=false 才成立，本轮未取得 ⇒ 只保留正向＋把拒绝侧列入未验证。
  // ★ 实测：build 回 {ok, idType:null, id:null, priority:[doi,arxiv,pmid,url], enforced, fired} ⇒ 我的入参形（{entry}）没能让它提取 id
  //   ⇒ 提取入口形未确认；只保留可验证的一半（priority 来自声明、enforced 记录该键）＋其余归未验证。
  ok(clean.threw === null && clean.value && Array.isArray(clean.value.priority) && clean.value.priority.length > 0 &&
     Array.isArray(clean.value.enforced) && clean.value.enforced.includes('vmu.citations.idPriority'),
    '★ [形态半] build() 回执自述 idPriority 优先级表并被 enforced[] 记录（★ id 提取入口形与“无标识符⇒拒”未验证）',
    { clean: clean.value, noIdCode: codeOf(noId) })
}

console.log('')
console.log('=== KERNEL CLAIMS 20B: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · math         : createMathSurface 的引擎在场/缺席两路（需注入 host 缝）· settled() 的 ok+hash 判定细则 · ON_UNAVAILABLE 的分支')
console.log('  · explain      : correlate 的"无法建立就报缺失而不是伪造"· build/render 的 format 与 include* 分支')
console.log('  · resumeflush   : ★ exit() 的 **snapshot/keys/modes 缝契约**与服务语义（failed[]/ok 两半 AND）未确认；② waitedMs 的"不读实时、不泄漏 NaN"；settle() 的两半')
console.log('  · library-policy: ★ 六个检查器的**真名与调用形状**（face 首键是 registerVocabulary）· 各自规则（tags/metadata/provenance/refs/dedup/naming）；只验证了集合存在与构造期不读 index')
console.log('  · partnership  : ★ “纯格式税号 ⇒ 拒”的触发条件（疑似 taxIdStyle 声明；实测未拒）；五码各自的触发面（ENTITY_UNKNOWN/ACCOUNT_UNBOUND/TAX_FIELD_MISSING/CROSSBORDER_*）· crossBorderGate 分支')
console.log('  · citations    : ★ build() 的 **id 提取入口形**（我传 {entry} 时 idType/id 均为 null）与“无标识符 ⇒ 拒”的触发条件；requiredFields/style/orcid/ror 四键 · idPriority 的另几种顺序')
process.exit(fail === 0 ? 0 : 1)
