// tests/audit-kernel-claims-6.mjs — ROUND 106, batch F: pack (15) · replay (17) · alerts (18).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// WHAT THIS BATCH SHOWS ABOUT THE METHOD ITSELF. Its author found twelve failures on the first run and ALL TWELVE were its
// own: validatePack RETURNS a list of problems instead of throwing; aliases is an array of {from,to}; safeClone answers
// {ok:false, why} rather than throwing a code; verify() needs {state}; safeClone's result is under .value; the alert list is
// called openAlerts; a budget needs its SLI declared first. Two more were MEASUREMENT errors in the same family - a catch-up
// summary appears only when the silence window ENDS, so a constant clock cannot see it, and a cap test needs a second threshold
// before anything can be dropped. It named both rather than filing them as defects, which is the difference between an audit
// and a complaint.
//
// AND THE PURE-PLAN CLAIMS ARE THE ONES WORTH PINNING: plan() is byte-identical across calls, does not mutate the manifest it
// is given, refuses a manifest with no id BY NAME, and a pack round-trips through its own compressor exactly.
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
const short = (s) => String(s).slice(0, 80)
const srcOf = (f) => readFileSync(join(K, f), 'utf8')

const P = await import(u('pack.js'))
const R = await import(u('replay.js'))
const A = await import(u('alerts.js'))

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. pack：LZSS 可逆、SETTING_LAYERS 五层、validatePack 的返回式契约、plan 纯函数与具名拒 ===')
{
  ok(P.apiVersion === 1, '★ apiVersion 为 1', P.apiVersion)
  ok(typeof P.createPackLoader === 'function', '★ 面工厂 createPackLoader 存在（discovery-first）', Object.keys(P))
  const SAMPLES = ['', 'a', 'abcabcabcabcabcabc', '中文中文中文中文中文中文', JSON.stringify({ x: [1, 2, 3], y: 'zzzzzzzzzzzz' }), 'x'.repeat(500)]
  const roundTrip = SAMPLES.map((s) => { const c = attempt(() => P.compressText(s)); const d = c.threw ? null : attempt(() => P.decompressText(c.value)); return d && d.threw === null && d.value === s })
  ok(SAMPLES.length > 0 && roundTrip.every(Boolean), '★ “decompressText(compressText(s)) === s for every s” —— 六例往返（空串/中文/高重复）',
    SAMPLES.map((s, i) => roundTrip[i] ? null : short(s)))
  const rep = 'ab'.repeat(200)
  const packed = attempt(() => P.compressText(rep))
  ok(packed.threw === null && packed.value.length > 0 && packed.value.length < rep.length,
    '★ “a small, exact, reversible byte reducer … never lies about size” —— 高重复输入确实变小', packed.value && { packed: packed.value.length, raw: rep.length })
  ok(JSON.stringify(P.SETTING_LAYERS) === JSON.stringify(['schema', 'pack', 'preset', 'session', 'runtime']),
    '★ “SETTING_LAYERS” 五层且次序如文档', P.SETTING_LAYERS)
  const ranks = P.SETTING_LAYERS.map((l) => P.settingLayerRank(l))
  ok(ranks.length > 0 && ranks.every((v) => Number.isFinite(v)) && ranks.every((v, i) => i === 0 || v > ranks[i - 1]),
    '★ 层序单调：runtime 覆盖 session 覆盖 preset 覆盖 pack 覆盖 schema', ranks)
  // ① validatePack 返回问题数组（不抛）
  const vGood = attempt(() => P.validatePack({ id: 'my-pack', name: 'x' }))
  ok(vGood.threw === null && Array.isArray(vGood.value) && vGood.value.length === 0,
    '★ “validatePack” 是纯函数：合法 manifest ⇒ 空问题数组', vGood.threw ? short(vGood.threw.message) : vGood.value)
  const vBad = attempt(() => P.validatePack({ id: 'Bad_Id' }))
  ok(vBad.threw === null && Array.isArray(vBad.value) && vBad.value.some((p) => /id/.test(String(p))),
    '★ id 形状 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` —— 非法 id 被列为问题（具名而非抛）', vBad.value)
  const vCode = attempt(() => P.validatePack({ id: 'my-pack', codes: ['OTHER_CODE'] }))
  ok(vCode.threw === null && Array.isArray(vCode.value) && vCode.value.some((p) => String(p).includes('VMU_PACK_MY_PACK_')),
    '★ “a pack’s own codes must be `VMU_PACK_<PACKID>_<REASON>` so framework refusals and institutional refusals stay distinguishable”',
    vCode.value)
  // ② manifest.aliases 是数组
  const fakeKernel = { settings: { get: () => undefined, all: () => ({}), declared: () => [] }, services: { status: () => ({}) } }
  const fakeRegistry = { checkPack: () => ({ ok: true, missing: [], tooOld: [], contract: null }), status: () => ({}) }
  const loader = attempt(() => P.createPackLoader({ kernel: fakeKernel, registry: fakeRegistry, allowOverride: false }))
  ok(loader.threw === null && loader.value && ['plan', 'validate', 'apply', 'unload', 'status'].every((m) => typeof loader.value[m] === 'function'),
    '★ 装载器暴露 validate/plan/apply/unload/status（discovery-first）', loader.threw ? short(loader.threw.message) : loader.value && Object.keys(loader.value))
  const MAN = { id: 'tmp-pack', version: '1.0.0', name: 'tmp', settings: { 'vmu.demo.x': 1 }, tracks: ['t1'], aliases: [{ from: 'a', to: 'b' }], middleware: [] }
  const p1 = attempt(() => loader.value.plan(MAN))
  const p2 = attempt(() => loader.value.plan(MAN))
  const pl1 = p1.value
  ok(p1.threw === null && pl1 && pl1.ok === true && Array.isArray(pl1.actions) && pl1.actions.length > 0 && Array.isArray(pl1.problems) && pl1.problems.length === 0,
    '★ “PLAN IS PURE. plan() validates and reports exactly what would change, and changes nothing. That is what makes … answerable before it does it”',
    p1.threw ? short(p1.threw.message) : pl1 && { ok: pl1.ok, actions: pl1.actions && pl1.actions.length, problems: pl1.problems, wouldTouch: pl1.wouldTouch })
  ok(p1.threw === null && p2.threw === null && JSON.stringify(p1.value) === JSON.stringify(p2.value),
    '★ plan 是纯函数：同一 manifest 两次 plan 逐字相同（含 warnings/requires/actions）', p1.threw ? short(p1.threw.message) : null)
  // ★ “changes nothing” 可以【不依赖 kernel 内部】地测：plan 不许改动传给它的 manifest 对象。★ 我上一版用
  //   `loader.status()` 来测，但它内部要走 `settingsNow()`/`settingSource`/`snapshotPacked`（pack.js:610-630），
  //   假 kernel 撑不起来 ⇒ 那条断言报的是"我的假 kernel 不够真"，不是模块问题 ⇒ 换成下面这条纯函数断言，
  //   并把"需要真装配才能跑的 status()"记入 UNVERIFIED。
  const manCopy = JSON.parse(JSON.stringify(MAN))
  const p3 = attempt(() => loader.value.plan(MAN))
  // RULE B needs a non-empty guard: comparing two EMPTY objects would pass while testing nothing. The guard makes the
  // comparison meaningful - MAN is a real manifest with keys, so equality here is evidence rather than a tautology.
  ok(Object.keys(MAN).length > 0 && p3.threw === null && JSON.stringify(MAN) === JSON.stringify(manCopy),
    '★ “PLAN IS PURE … changes nothing” —— plan() 不改动传入的 manifest（深比较逐字相同）',
    { after: MAN, before: manCopy })
  ok(['snapshot', 'packed'].length > 0 && ['snapshot', 'packed'].every((m) => typeof loader.value[m] === 'function'),
    '★ 面暴露 snapshot/packed（“两个相等快照即无残留”的观察面存在）', Object.keys(loader.value))
  // 具名拒：无 id 的 plan 必须带码（“a plan that cannot be built is a refusal and MUST carry a code”）
  const noId = attempt(() => loader.value.plan({ tracks: [] }))
  ok(noId.threw === null && noId.value && noId.value.ok === false && noId.value.code === 'VMU_PACK_MISSING' && typeof noId.value.hint === 'string',
    '★ “THE NAMED REFUSAL: a plan that cannot be built is a refusal and MUST carry a code” —— 无 id ⇒ VMU_PACK_MISSING ＋ hint',
    noId.threw ? short(noId.threw.message) : noId.value && { ok: noId.value.ok, code: noId.value.code, hint: noId.value.hint })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. replay：五条硬不变量（纯/缺口语义/未知种类计数/零副作用/空审计不是重建）＋ clone 契约 ===')
{
  ok(R.apiVersion === 1, '★ apiVersion 为 1', R.apiVersion)
  const LITS = ['vmu.replay.maxEvents', 'vmu.replay.strict', 'vmu.replay.requireContiguousSeq', 'vmu.replay.maxStateKeys', 'vmu.replay.keepUnknown', 'vmu.audit.ringMax']
  const src = srcOf('replay.js')
  ok(LITS.length > 0 && LITS.every((k) => src.includes(k)),
    '★ “SETTINGS (read as PLAIN LITERALS … the settings table … discover wired keys by scanning file text)” —— 六个键逐字出现',
    LITS.filter((k) => !src.includes(k)))
  ok(R.LOSSY_TYPES.length > 0 && ['NaN', 'undefined', 'Date', 'Map', 'Set', 'RegExp', 'bigint'].every((t) => R.LOSSY_TYPES.some((x) => String(x).includes(t))),
    '★ “NaN/±Infinity/-0/undefined/Date/Map/Set/RegExp/bigint are preserved by the clone and encoded as deterministic TAGS”', R.LOSSY_TYPES)
  // ③ 返回式契约：{ok, value} / {ok:false, why}
  const lossy = { n: NaN, neg: -0, u: undefined, d: new Date(0), m: new Map([['k', 1]]), s: new Set([1]), re: /x/g, b: 10n }
  const c = attempt(() => R.safeClone(lossy))
  const cv = c.value && c.value.ok === true ? c.value.value : null
  ok(c.threw === null && cv && Number.isNaN(cv.n) && Object.is(cv.neg, -0) && cv.d instanceof Date && cv.m instanceof Map && cv.s instanceof Set && cv.re instanceof RegExp && cv.b === 10n,
    '★ clone 保留这些类型（不是 JSON.parse(JSON.stringify()) 的近似）—— 返回 {ok, value}',
    c.threw ? short(c.threw.message) : (c.value && !c.value.ok ? c.value.why : cv && { n: String(cv.n), neg: String(cv.neg), d: cv.d.constructor.name, m: cv.m.constructor.name, s: cv.s.constructor.name, re: cv.re.constructor.name, b: String(cv.b) }))
  const cyc = { a: 1 }; cyc.self = cyc
  const cycR = attempt(() => R.safeClone(cyc))
  ok(cycR.threw === null && cycR.value && cycR.value.ok === false && typeof cycR.value.why === 'string' && cycR.value.why.length > 0,
    '★ “a CYCLE … ⇒ refused by NAME with the path (it used to die on Converting circular structure to JSON)” —— 返回 {ok:false, why}',
    cycR.value)
  const shapeBad = attempt(() => R.assertStateShape({ a: 1 }))
  ok(shapeBad.threw === null && shapeBad.value && shapeBad.value.ok === false && typeof shapeBad.value.why === 'string' && shapeBad.value.why.includes('a'),
    '★ “a initial whose SHAPE is not a replay state ({a:1}) ⇒ VMU_INVALID_ARGUMENT naming the offending key” —— why 里点出那个键',
    shapeBad.value)
  ok(R.assertStateShape(R.emptyState()).ok === true, '★ emptyState() 形状自洽（assertStateShape ⇒ {ok:true}）', R.emptyState())
  const rp = R.createReplay({ clock: () => 1000 })
  const FACE = ['register', 'unregister', 'kinds', 'plan', 'apply', 'verify', 'gaps', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof rp[m] === 'function'), '★ 面暴露 plan/apply/verify/gaps/status（discovery-first）',
    { missing: FACE.filter((m) => typeof rp[m] !== 'function'), keys: Object.keys(rp) })
  const kinds = attempt(() => rp.kinds())
  ok(kinds.threw === null && kinds.value && kinds.value.ok === true && Array.isArray(kinds.value.kinds),
    '★ “③ … every event whose what (or type) has no explicit reducer is counted in unknownKinds” —— kinds() 自报已知种类',
    kinds.value && { kinds: kinds.value.kinds, prefixes: kinds.value.prefixes })
  // ⑤ EMPTY AUDIT IS NOT A RECONSTRUCTION
  const emptyPlan = attempt(() => rp.plan({}))
  const ep = emptyPlan.value
  ok(emptyPlan.threw === null && ep && JSON.stringify(ep).includes('no-events'),
    '★ “⑤ EMPTY AUDIT IS NOT A RECONSTRUCTION: with no events … a `no-events` gap — "已重建" would be a lie”',
    emptyPlan.threw ? short(emptyPlan.threw.message) : ep && Object.keys(ep))
  ok(emptyPlan.threw === null && ep && ep.reconstructed !== true && ep.complete !== true,
    '★ 空审计**绝不**被报成完整重建（reconstructed/complete 不得为 true）', ep && { reconstructed: ep.reconstructed, complete: ep.complete, empty: ep.empty })
  const gaps = attempt(() => rp.gaps({}))
  ok(gaps.threw === null && gaps.value !== null && JSON.stringify(gaps.value).includes('no-events'),
    '★ “② GAPS MUST BE REPORTED … all of them are listed by gaps()/plan() with WHAT is missing” —— gaps() 报出 no-events',
    gaps.threw ? short(gaps.threw.message) : gaps.value && (Array.isArray(gaps.value) ? gaps.value.length : Object.keys(gaps.value)))
  // ① verify() 证明字节同一：空审计下 apply 与重新重建必须 match
  const planFor = emptyPlan.value && emptyPlan.value.plan ? emptyPlan.value.plan : null
  const ap = attempt(() => rp.apply({ plan: planFor }))
  ok(ap.threw === null && ap.value && ap.value.state !== undefined, '★ “○ apply({plan, initial})” 可执行（空计划也返回 state）',
    ap.threw ? short(ap.threw.message) : ap.value && Object.keys(ap.value))
  const ver = attempt(() => rp.verify({ state: ap.value && ap.value.state, plan: planFor }))
  ok(ver.threw === null && ver.value && ver.value.ok === true && ver.value.match === true,
    '★ “① PURE, READ-ONLY RECONSTRUCTION: the same (plan, initial) produces a byte-identical state (verify() proves it)”',
    ver.threw ? short(ver.threw.message) : ver.value && { ok: ver.value.ok, match: ver.value.match, note: ver.value.note })
  const verNoState = attempt(() => rp.verify({}))
  ok(codeOf(verNoState) === 'VMU_INVALID_ARGUMENT', '★ verify() 缺 state ⇒ 具名 VMU_INVALID_ARGUMENT（不是裸异常）', codeOf(verNoState))
  const stA = JSON.stringify(attempt(() => rp.status()).value)
  const stB = JSON.stringify(attempt(() => rp.status()).value)
  ok(stA === stB, '★ “read paths (gaps/status) never mutate” —— 两次 status() 逐字相同', { same: stA === stB })
  const badR = ['Date.now(', 'Math.random('].filter((p) => src.includes(p))
  ok(badR.length === 0, '★ “the injected clock is the only time source” —— 源码级扫描无 Date.now/Math.random', badR)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. alerts：指纹分层、具名拒按码计数、静默不丢弃、去重不丢弃、无样本=undecided、零机制惰性 ===')
{
  ok(A.apiVersion === 1, '★ apiVersion 为 1', A.apiVersion)
  ok(JSON.stringify(A.OPS) === JSON.stringify(['>', '>=', '<', '<=', '==', 'rate>', 'rate<']), '★ “Threshold operators (docs/21 §5.3)” —— 7 个', A.OPS)
  ok(JSON.stringify(A.SLO_STATES) === JSON.stringify(['met', 'breached', 'undecided', 'exempt']), '★ “SLO states … three-valued on purpose — undecided is NOT a pass”', A.SLO_STATES)
  ok(JSON.stringify(A.ERROR_BUDGET_ACTIONS) === JSON.stringify(['freeze-H2', 'warn', 'none']), '★ “The punishment ladder (docs/21 §13)”', A.ERROR_BUDGET_ACTIONS)
  ok(A.RUNBOOK.length > 0 && A.RUNBOOK.length === 10 && A.RUNBOOK.every((r) => typeof r.id === 'string' && typeof r.fingerprint === 'string' && Array.isArray(r.steps) && r.steps.length > 0 && typeof r.acceptance === 'string'),
    '★ “Runbook R1–R10 (docs/21 §14) — fingerprint → judgement codes → ordered actions → acceptance” —— 10 条且字段齐',
    { n: A.RUNBOOK.length, bad: A.RUNBOOK.filter((r) => !(typeof r.id === 'string' && Array.isArray(r.steps) && r.steps.length > 0)).map((r) => r && r.id) })
  ok(A.ALERT_CODES.SUPPRESSED === 'VMU_ALERT_SUPPRESSED' && A.ALERT_CODES.SILENCED === 'VMU_ALERT_SILENCED' && A.ALERT_CODES.BUDGET_EXHAUSTED === 'VMU_SLO_BUDGET_EXHAUSTED',
    '★ “Codes used here (03-§8 registry)” —— 三个码逐字', A.ALERT_CODES)
  const f1 = A.fingerprintOf({ metric: 'm', object: 'o', code: 'c' })
  const f2 = A.fingerprintOf({ metric: 'm', object: 'o', code: 'c2' })
  const f3 = A.fingerprintOf({ metric: 'm', object: 'o2', code: 'c' })
  ok(typeof f1 === 'string' && f1.length > 0 && f1 !== f2 && f1 !== f3,
    '★ “the ALERT fingerprint is metric × object × code … DELIBERATELY different [from watcher × event × object]” —— 改 code 或 object 都换指纹', { f1, f2, f3 })
  const al = A.createAlerts({ clock: () => 1000, settings: { 'vmu.quality.targets': [{ id: 'sli-1', metric: 'm0', target: 0.99, op: '>=' }] } })
  // ★ 静默窗口需要【可推进的时钟】：窗口结束（clock() ≥ until）才会产生补发摘要 ⇒ 常量时钟下 summariesDue 永远为空
  //   （那是我上一版的测量错，不是模块缺陷）。这里用可变时钟，并在窗口后推进。
  let tk = 1000
  const clocked = A.createAlerts({ clock: () => tk, settings: { 'vmu.quality.targets': [{ id: 'sli-1', metric: 'm0', target: 0.99, op: '>=' }] } })
  const cappedAlerts = A.createAlerts({ clock: () => 1000, settings: { 'vmu.alerts.maxThresholds': 1 } })
  const FACE = ['declare', 'undeclare', 'inhibit', 'sample', 'raise', 'evaluate', 'silence', 'summaries', 'flush', 'escalate', 'acknowledge', 'budget', 'guardChange', 'runbook', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof al[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof al[m] !== 'function'), keys: Object.keys(al) })
  // 具名拒 + 按码计数
  const badDecl = attempt(() => al.declare({ id: 'x' }))
  const st1 = attempt(() => al.status())
  const refusals = st1.value && st1.value.refusals
  ok(codeOf(badDecl) === 'VMU_INVALID_ARGUMENT' && typeof (badDecl.threw || badDecl.value).hint === 'string' && !!refusals && Number(refusals['VMU_INVALID_ARGUMENT']) >= 1,
    '★ “every refusal is NAMED (VMU_* + hint) and COUNTED BY CODE before it is thrown” —— 缺 metric 的 declare 既具名又计数',
    { code: codeOf(badDecl), hint: (badDecl.threw || badDecl.value).hint, refusals })
  // 零机制惰性
  const inert = A.createAlerts({ clock: () => 1000 })
  const ev = attempt(() => inert.evaluate())
  const stInert = attempt(() => inert.status())
  ok(ev.threw === null && stInert.threw === null && stInert.value && stInert.value.configured === false,
    '★ “ZERO MECHANISM: with nothing declared this module is inert, throws nothing, and COUNTS the skips”',
    { eval: ev.threw && short(ev.threw.message), configured: stInert.value && stInert.value.configured })
  // 无样本 ⇒ undecided
  const b0 = attempt(() => al.budget({ sli: 'sli-1' }))
  ok(b0.threw === null && b0.value && b0.value.state === 'undecided',
    '★ “a threshold/SLO with NO SAMPLES is undecided — never a silent pass”', b0.threw ? short(b0.threw.message) : b0.value && { state: b0.value.state, samples: b0.value.samples })
  const bNo = attempt(() => al.budget({ sli: 'not-declared' }))
  ok(codeOf(bNo) === 'VMU_NO_SUCH_OBJECT', '★ 未声明的 SLI ⇒ 具名 VMU_NO_SUCH_OBJECT（不是 undecided 的静默通过）', codeOf(bNo))
  // 去重不丢弃
  const r1 = attempt(() => al.raise({ metric: 'm1', object: 'o1', code: 'c1' }))
  const stAfter1 = attempt(() => al.status())
  const r2 = attempt(() => al.raise({ metric: 'm1', object: 'o1', code: 'c1' }))
  const stAfter2 = attempt(() => al.status())
  const open1 = (stAfter1.value && stAfter1.value.openAlerts) || []
  const open2 = (stAfter2.value && stAfter2.value.openAlerts) || []
  ok(r1.threw === null && r2.threw === null && open2.length === 1 && JSON.stringify(open1) !== JSON.stringify(open2),
    '★ “DEDUP IS NOT DISCARD: a deduplicated re-fire still increments the alert’s own count” —— 仍是一条告警但自身计数增长',
    { open1: open1, open2: open2 })
  // 静默不丢弃：窗口内 raise 被计数、窗口【结束】后有补发摘要（用可变时钟推进）
  const fp1 = A.fingerprintOf({ metric: 'm1', object: 'o1', code: 'c1' })
  const sil = attempt(() => clocked.silence({ fingerprint: fp1, ms: 10 }))
  const rIn = attempt(() => clocked.raise({ metric: 'm1', object: 'o1', code: 'c1' }))
  const stDuring = attempt(() => clocked.status())
  const duringDue = stDuring.value && stDuring.value.summariesDue
  tk = 2000   // ★ 推进到窗口之后
  const stAfter = attempt(() => clocked.status())
  const afterDue = stAfter.value && stAfter.value.summariesDue
  ok(sil.threw === null && rIn.threw === null &&
    Array.isArray(duringDue) && duringDue.length === 0 && Array.isArray(afterDue) && afterDue.length > 0,
    '★ “SILENCE IS NOT DISCARD: alerts raised inside a silence window are COUNTED, attributed to the window, and a catch-up summary is produced when the window ends”',
    { silence: sil.threw ? short(sil.threw.message) : sil.value && sil.value.sid, during: duringDue, after: afterDue })
  const sums = attempt(() => clocked.summaries({}))
  ok(sums.threw === null && sums.value !== null, '★ summaries() 可读（补发摘要面存在）', sums.threw ? short(sums.threw.message) : sums.value && (Array.isArray(sums.value) ? sums.value.length : Object.keys(sums.value)))
  // 上限：maxThresholds=1 ⇒ 声明【两条】：第二条要么具名拒、要么被计数（dropped.total 增长）
  const c1 = attempt(() => cappedAlerts.declare({ id: 't1', metric: 'm', op: '>=', threshold: 1 }))
  const d2 = attempt(() => cappedAlerts.declare({ id: 't2', metric: 'm', op: '>=', threshold: 1 }))
  const st3 = attempt(() => cappedAlerts.status())
  const dropped = st3.value && st3.value.dropped
  ok(st3.value && st3.value.caps && st3.value.caps.maxThresholds === 1 && st3.value.thresholds.length <= 1 && (codeOf(d2) !== null || (dropped && dropped.total > 0)),
    '★ “every upper bound reports how many items were DROPPED” ＋ caps 自述 —— 超 maxThresholds 时【具名拒或计数】必居其一（静默收下即红）',
    { caps: st3.value && st3.value.caps, thresholds: st3.value && st3.value.thresholds.length, d1: codeOf(c1), d2: codeOf(d2), dropped })
  // 读面不改记录（注：runbook 用【合法 id】；早先我用 runbook({}) —— 它按码拒并计一次 refusal，那是【设计内的计数】，
  // 不是"读面改写记录"，属我自己的测量错，故此处改为合法读）
  const rdRead = attempt(() => { al.status(); al.runbook({ id: 'R1' }); al.budget({ sli: 'sli-1' }); return al.status() })
  const before = attempt(() => al.status())
  ok(rdRead.threw === null && before.threw === null && JSON.stringify(rdRead.value.openAlerts) === JSON.stringify(before.value.openAlerts) && JSON.stringify(rdRead.value.silences) === JSON.stringify(before.value.silences),
    '★ “READ paths (status/summaries/budget/runbook) never mutate RECORDED data” —— 一轮读之后 openAlerts/silences 逐字不变',
    { after: rdRead.value && rdRead.value.openAlerts, before: before.value && before.value.openAlerts })
  const srcA = srcOf('alerts.js')
  const badA = ['Date.now(', 'Math.random('].filter((p) => srcA.includes(p))
  ok(badA.length === 0, '★ “the only time source is the injected clock (never real time, never random ⇒ byte-deterministic)” —— 源码级扫描', badA)
}

console.log('')
console.log('=== KERNEL CLAIMS 6F: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · pack   : 装载器对【真实 kernel】的 apply/unload 无残留（“UNLOAD LEAVES NO RESIDUE … comparing snapshots”）、')
console.log('             “CONFLICTS ARE REFUSED, NEVER MERGED (O4)” 的三种冲突面、packedBytes/rawBytes 的"不谎报节省"回退路径、')
console.log('             collectPackSections / composePromptPolicies 的语义、prompts 块（module/source/count）的校验')
console.log('  · replay : ② 具体缺口（seq 洞/缺前件/坏行/ts 逆序/窗口截断 —— 需构造 audit 行）；③ strict 的具名拒；')
console.log('             ④ 零副作用（proxied fake service 断言"从不调写方法"）；unknownKinds 的计数；apply 的 initial 克隆分支')
console.log('  · alerts : escalate/acknowledge/inhibit/flush/guardChange 的行为面；“LAYERING … 通知指纹（watcher × event × object）”整条')
console.log('             （只见 ALERT 侧）；SLO 冻结分支（“预算耗尽 ⇒ 冻结非必要变更（H2）；H0/H1 救火除外且必须留痕”）')

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE: prove this harness reports a false claim as a failure.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 6F SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 6F (pack 15 · replay 17 · alerts 18): " + pass + " passed, " + fail + " failed ===")
if (fail > 0) console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"))
process.exit(fail === 0 ? 0 : 1)

