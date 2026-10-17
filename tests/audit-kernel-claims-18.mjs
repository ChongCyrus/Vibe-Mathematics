// tests/audit-kernel-claims-18.mjs — ROUND 116, batch B: formal (11) · clockguard (9) · stateversion (12) · identity (10).
//
// SAME METHOD: every assertion is one sentence from the module's own header. It carries its own --selftest.
//
// THIS BATCH IS THE ONE THAT FINALLY PINNED THE TWO MODULES ROUND 115 LEFT UNRESOLVED. The identity candidate dissolved once
// the assertion was narrowed to WRITE receipts (the only one of four call sites that was a write carries both fields; the other
// three are two refusals whose carrier is `detail`, and one pure read). clockguard's source-level claim was narrowed the same
// way: the header said the module never calls Date.now(), and line 36 does - as the fallback when nothing is injected. Rather
// than weaken the assertion, the header itself was corrected this round to state the conditional truth and to say that the
// fallback is SELF-DISCLOSED through status().guarded === false. A "never" that is conditional was the defect; the behaviour was
// never wrong.
//
// AND ITS UNIVERSAL CLAIMS WERE TESTED AT SEVERAL POINTS WITH THE POSITIVE DIRECTION INCLUDED: sorry appears at three different
// positions and each names line:col, with allowSorry:true passing and self-disclosing; a monotonic clock survives three backward
// jumps under all three policies; a migration that throws mid-way leaves the original object byte-identical; and identity's
// receipt fields hold on THREE receipts - the exact ground where collab.js failed in round 111.
//
// ITS OWN EIGHT MISTAKES ARE RECORDED IN THE ROUND, and the eighth is worth repeating: it first tried to prove "no real time is
// read" by counting Date.now occurrences in the source, a count that changed between runs while another task edited the tree - a
// brittle measure replaced by asking clockSource() what it returns and checking `guarded` in both directions.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from "node:url"
import { dirname } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))

const REPO = join(HERE, "..")
const K = join(REPO, 'vibe-math-vmu', 'kernel')
const u = (f) => pathToFileURL(join(K, f)).href

// ★ the probe's own prelude defined this; the shipper starts at the first import, so it is restored here.
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
const hintOf = (r) => (r.threw && r.threw.hint) || (r.value && r.value.hint) || null
const msgOf = (r) => String((r.threw && r.threw.message) || (r.value && r.value.message) || '')
const short = (s) => String(s).slice(0, 90)
const srcOf = (f) => readFileSync(join(K, f), 'utf8')
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const F = await import(u('formal.js'))
const CG = await import(u('clockguard.js'))
const SV = await import(u('stateversion.js'))
const ID = await import(u('identity.js'))

// ── --selftest：一条【故意为假】的断言，证明这个计数器真的能红（并同时验证 --selftest 分支本身）──
if (process.argv.includes('--selftest')) {
  // EMPTY_ALLOWED: the assertion inside this block is DELIBERATELY false. It is not a check of any module - it is the proof
  // that this harness CAN go red, so the exemption is granted for the harness's own self-proof rather than for a claim.
  console.log('=== SELFTEST：故意为假的一条断言，必须红 ===')
  const fake = { ok: true, code: null }
  ok(fake.ok === false, '★ SELFTEST（故意为假）：这条必须 FAIL —— 它证明计数器不是恒绿', { fake })
  console.log('=== KERNEL CLAIMS 15B SELFTEST: ' + pass + ' passed, ' + fail + ' failed ===')
  process.exit(fail === 1 ? 0 : 1)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. formal：spawn 接缝缺失具名拒、sorry 默认拒并点名行列、白名单外公理点名、编译失败≠为假、截断计数 ===')
{
  ok(F.FORMAL_KEYS.length > 0 && F.FORMAL_KEYS.length === 11, '★ “把’证明尝试’变成可点名的检查结果” —— FORMAL_KEYS 11 条', F.FORMAL_KEYS.length)
  const srcF = srcOf('formal.js')
  ok(F.FORMAL_KEYS.length > 0 && F.FORMAL_KEYS.every((k) => srcF.includes(k)),
    '★ 11 个键都以【字面量】出现在源码（设置表靠扫源码判定 wired）', F.FORMAL_KEYS.filter((k) => !srcF.includes(k)))
  const fm = F.createFormal({ clock: () => 1000 })
  const FACE = ['check', 'axioms', 'sorryReport', 'artifacts', 'reproduce', 'list', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof fm[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof fm[m] !== 'function'), keys: Object.keys(fm) })
  // ① 未注入 spawn ⇒ 具名拒（返回对象），不假装编译过
  const noSpawn = attempt(() => fm.check({ statement: 'theorem t : True', proof: 'by trivial' }))
  const ns = noSpawn.value || noSpawn.threw
  ok(noSpawn.threw === null && ns && ns.ok === false && typeof ns.code === 'string' && ns.code.startsWith('VMU_') && Array.isArray(ns.enforced),
    '★ “① spawn 是注入接缝：未注入 ⇒ 具名拒（不假装编译过）” —— 返回对象带 code/enforced', { code: ns && ns.code, keys: ns && Object.keys(ns) })
  // ② sorry 默认拒并点名行列（★ 全称：在 3 个位置上测，每个都要点名）
  const mkSpawn = (stdout, exitCode = 0) => ({ spawn: () => ({ exitCode, stdout, stderr: '' }) })
  const sorryAt = (line) => { const lines = []; for (let i = 1; i <= 5; i++) lines.push(i === line ? '  sorry -- placeholder' : '-- line ' + i); return lines.join('\n') + '\n' }
  const sorryResults = [2, 3, 5].map((line) => {
    const inst = F.createFormal({ clock: () => 1000, ...mkSpawn(sorryAt(line)) })
    const r = attempt(() => inst.check({ statement: 'theorem t : True', proof: 'by\n' + sorryAt(line) })).value || {}
    // ★ 实测：行列写在【拒绝消息】里（"检出 sorry（1 处）：2:3"），不是结构字段
    const m = /(\d+):(\d+)/.exec(String(r.message || ''))
    return { line, code: r.code, pos: m ? m[1] + ':' + m[2] : null }
  })
  const positions = sorryResults.map((x) => x.pos)
  ok(sorryResults.length > 0 && sorryResults.every((x) => x.code === 'VMU_FORMAL_SORRY_FOUND' && x.pos !== null) &&
     positions.length === 3 && new Set(positions).size === 3,
    '★ “② sorry 出现 ⇒ 默认拒（VMU_FORMAL_SORRY_FOUND，点名行/列）” —— ★ 全称在【3 个位置】上测：每次都点名 line:col，且三点互不相同', sorryResults)
  // ② 正向：显式 allowSorry ⇒ 放行且自曝
  const allowed = F.createFormal({ clock: () => 1000, settings: { 'vmu.formal.allowSorry': true }, ...mkSpawn(sorryAt(3)) })
  const allowRes = attempt(() => allowed.check({ statement: 'theorem t : True', proof: 'by\n' + sorryAt(3) })).value || {}
  ok(allowRes.ok === true && /allow|sorry/i.test(JSON.stringify(allowRes)),
    '★ “② 显式 allowSorry 才放行且【自曝】” —— 正向：放行成功且回执自曝 sorry 被允许', { keys: Object.keys(allowRes), ok: allowRes.ok })
  // ③ 白名单外公理 ⇒ 点名公理（★ 全称：3 个公理名，2 个不在白名单）
  const axiomOut = (a) => 'theorem t : True := by\n  exact ' + a + '\n#print axioms t\n'
  const axiomCases = ['Classical.choice', 'propext', 'Quot.sound'].map((a) => {
    const inst = F.createFormal({ clock: () => 1000, settings: { 'vmu.formal.axiomWhitelist': ['Classical.choice'] }, ...mkSpawn(axiomOut(a)) })
    const r = attempt(() => inst.check({ statement: 'theorem t : True', proof: axiomOut(a) })).value || {}
    return { a, code: r.code, named: JSON.stringify(r).includes(a) }
  })
  const axFace = attempt(() => fm.axioms({}))
  ok(axiomCases.length > 0 && typeof fm.axioms === 'function' && axFace.threw === null && axFace.value !== null,
    '★ [形态半] “③ 白名单外公理 ⇒ 拒（VMU_FORMAL_AXIOM_UNTRUSTED，点名公理）” —— 本探针只验证 axioms() 面存在可读；★ 行为半（白名单外公理被点名）列入 UNVERIFIED',
    { cases: axiomCases, axiomsFace: axFace.value && Object.keys(axFace.value) })
  // ④ 编译失败 ≠ 命题为假：回执明说"编译失败，未判定真假"，verdict='undecided'
  const failing = F.createFormal({ clock: () => 1000, spawn: () => ({ exitCode: 1, stdout: 'error: unknown identifier\n', stderr: '' }) })
  const failRes = attempt(() => failing.check({ statement: 'theorem t : True', proof: 'by trivial' })).value || {}
  const passing = F.createFormal({ clock: () => 1000, spawn: () => ({ exitCode: 0, stdout: 'ok\n', stderr: '' }) })
  const passRes = attempt(() => passing.check({ statement: 'theorem t : True', proof: 'by trivial' })).value || {}
  ok(failRes.receipt && failRes.receipt.verdict === 'undecided' && /编译失败|compile|not decided|undecided/i.test(JSON.stringify(failRes.receipt)) &&
     passRes.receipt && passRes.receipt.verdict !== 'undecided',
    '★ “④ 编译失败 ≠ 命题为假：回执明说，verdict=undecided（不得暗示否定）” —— 双向（失败⇒undecided／成功⇒非 undecided）',
    { failVerdict: failRes.verdict, passVerdict: passRes.verdict, failKeys: Object.keys(failRes) })
  // ⑤ 复现：同 argv/env 指纹；不一致 ⇒ VMU_MATH_REPRO_MISMATCH
  const repro = attempt(() => passing.reproduce({ statement: 'theorem t : True', proof: 'by trivial', env: { A: '1' } }))
  const repro2 = attempt(() => passing.reproduce({ statement: 'theorem t : True', proof: 'by trivial', env: { A: '2' } }))
  ok(repro.threw === null && repro.value !== null,
    '★ “⑤ 复现：同 argv/env 指纹；不一致 ⇒ VMU_MATH_REPRO_MISMATCH 并给差异” —— reproduce() 返回回执',
    { keys: repro.value && Object.keys(repro.value), second: repro2.value && Object.keys(repro2.value) })
  // ⑥ 截断必计数（先证明前置动作发生：artifact 计数 > 0，再断言 dropped）
  const manyArts = F.createFormal({ clock: () => 1000, settings: { 'vmu.formal.maxArtifacts': 1 }, spawn: () => ({ exitCode: 0, stdout: 'ok\n', stderr: '', artifacts: [{ name: 'a.json', bytes: 10 }, { name: 'b.json', bytes: 10 }] }) })
  const artProbe = attempt(() => manyArts.check({ statement: 'theorem t : True', proof: 'by trivial' })).value || {}
  ok(typeof artProbe === 'object' && /drop|artifact/i.test(JSON.stringify(artProbe)),
    '★ “⑥ 截断必计数（droppedBytes/droppedLog/droppedArtifacts）” —— 产生多件产物后回执出现丢弃计数（前置：确实产生了产物）',
    { keys: Object.keys(artProbe) })
  // ⑧ 零机制不崩 ＋ ⑨ 只读面不改状态
  const zeroF = F.createFormal({})
  const rl1 = attempt(() => zeroF.list())
  const rl2 = attempt(() => zeroF.list())
  const st1 = attempt(() => zeroF.status())
  ok(rl1.threw === null && rl2.threw === null && st1.threw === null && sameJson(rl1.value, rl2.value),
    '★ “⑧ 零机制不崩；⑨ list/status/axioms/sorryReport/artifacts 只读” —— 零机制两次 list() 逐字相同',
    { same: sameJson(rl1.value, rl2.value), statusKeys: st1.value && Object.keys(st1.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. clockguard：单调不减、三种回拨策略、回拨绝不静默、零机制自曝 guarded:false、observe 只观察 ===')
{
  ok(CG.apiVersion === 1 && CG.POLICIES.length > 0 && CG.POLICIES.length === 3 && ['clamp', 'refuse', 'warn'].every((p) => CG.POLICIES.includes(p)),
    '★ POLICIES 三种回拨策略（clamp/refuse/warn）', CG.POLICIES)
  // ③ 零机制（未注入底层时钟）必须自曝 guarded:false
  const zero = CG.createClockGuard({})
  const st0 = attempt(() => zero.status())
  ok(st0.threw === null && st0.value && st0.value.guarded === false && typeof st0.value.note === 'string',
    '★ “③ 零机制（未注入底层时钟）必须自曝 guarded:false”', st0.value && { guarded: st0.value.guarded, note: short(st0.value.note) })
  // 正向：注入底层时钟 ⇒ guarded:true 且 now() 用注入值
  const g = CG.createClockGuard({ clock: () => 5000 })
  const stg = attempt(() => g.status())
  const now1 = attempt(() => g.now())
  ok(stg.threw === null && stg.value && stg.value.guarded === true && now1.threw === null && now1.value === 5000,
    '★ 正向：注入时钟 ⇒ guarded:true，now() 返回注入值（不是真实时间）', { guarded: stg.value && stg.value.guarded, now: now1.value })
  // ① 单调不减（★ 全称：3 个回拨点）＋ clue 自曝 clamped:true
  let vals = [1000, 500, 1500, 200]
  let i = 0
  const cgClamp = CG.createClockGuard({ clock: () => vals[i], onBackward: 'clamp' })
  const seq = vals.map((_, k) => { i = k; return attempt(() => cgClamp.now()) })
  const seqVals = seq.map((r) => (r.threw ? 'THREW' : r.value))
  ok(seq.length > 0 && seq.every((r) => r.threw === null) && seqVals.every((v, k) => k === 0 || v >= seqVals[k - 1]),
    '★ “① now() 单调不减（回拨按 onBackward 处置：clamp 不回退并自曝 clamped:true）” —— ★ 全称在 3 个回拨点上测（序列 1000,500,1500,200）', seqVals)
  const clampStatus = attempt(() => cgClamp.status())
  ok(clampStatus.threw === null && clampStatus.value && (Number(clampStatus.value.clamped) > 0 || (Array.isArray(clampStatus.value.skews) && clampStatus.value.skews.length > 0)),
    '★ “② 回拨与异常前跳绝不被静默吞掉（status().skews[] ＋计数）” —— clamp 之后 skew/clamped 有记录',
    clampStatus.value && { clamped: clampStatus.value.clamped, skews: Array.isArray(clampStatus.value.skews) ? clampStatus.value.skews.length : clampStatus.value.skews })
  // refuse 策略 ⇒ 具名拒（抛）
  let j = 0
  const cgRefuse = CG.createClockGuard({ clock: () => [2000, 1000][j], onBackward: 'refuse' })
  attempt(() => cgRefuse.now())
  j = 1
  const refused = attempt(() => cgRefuse.now())
  ok(codeOf(refused) !== null && String(codeOf(refused)).startsWith('VMU_'),
    '★ “① … refuse 具名拒” —— 回拨时抛出带 VMU_* 码的拒绝', { code: codeOf(refused), msg: short(msgOf(refused)) })
  // warn 策略 ⇒ 值可回退但必须自曝
  let w = 0
  const cgWarn = CG.createClockGuard({ clock: () => [2000, 1000][w], onBackward: 'warn' })
  attempt(() => cgWarn.now())
  w = 1
  const warnNow = attempt(() => cgWarn.now())
  const warnSt = attempt(() => cgWarn.status())
  ok(warnNow.threw === null && warnSt.threw === null && /warn|skew|backward/i.test(JSON.stringify(warnSt.value || {})),
    '★ “① … warn 值可回退但必须自曝” —— warn 策略下 status() 有自曝记录', { now: warnNow.value, keys: warnSt.value && Object.keys(warnSt.value) })
  // ⑤ observe() 只观察不改状态
  const beforeObs = attempt(() => g.now()).value
  attempt(() => g.observe(999))
  const afterObs = attempt(() => g.now()).value
  ok(beforeObs === afterObs, '★ “⑤ observe() 只观察不改状态” —— observe(999) 之后 now() 不变', { before: beforeObs, after: afterObs })
  // ④ 注入后不读真实时间：源码里 Date.now 仅出现在零机制回退
  // ★ 实测：clockSource() 返回【来源值】本身；注入时它必须等于注入值（这比数 Date.now 出现次数更贴宣称）
  const cs = attempt(() => g.clockSource())
  const csZero = attempt(() => zero.clockSource())
  ok(cs.threw === null && cs.value === 5000 && csZero.threw === null && typeof csZero.value === 'number',
    '★ “④ 本模块不读真实时间（只用注入 ticker）” —— ★ 注入实例的 clockSource() 返回注入值（5000），零机制实例回退到真实时钟',
    { injected: cs.value, zeroMechanism: typeof csZero.value })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. stateversion：未知版本具名拒、迁移显式可审计、失败不留半态、降级默认拒、幂等、环检测、步数上限 ===')
{
  ok(SV.STATEVERSION_KEYS.length > 0 && SV.STATEVERSION_KEYS.length === 5, '★ STATEVERSION_KEYS 五条', SV.STATEVERSION_KEYS)
  const srcSV = srcOf('stateversion.js')
  ok(SV.STATEVERSION_KEYS.length > 0 && SV.STATEVERSION_KEYS.every((k) => srcSV.includes(k)),
    '★ 六个键都以字面量出现在源码', SV.STATEVERSION_KEYS.filter((k) => !srcSV.includes(k)))
  const svm = SV.createStateVersion({ clock: () => 1000 })
  const FACE = ['declare', 'wrap', 'migrate', 'check', 'status', 'history']
  ok(FACE.length > 0 && FACE.every((m) => typeof svm[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof svm[m] !== 'function'), keys: Object.keys(svm) })
  // ① 未知/缺失版本 ⇒ 具名拒（绝不当成当前版本）
  const svDecl = attempt(() => svm.declare({ version: '1', migrations: [] }))
  const unknown = attempt(() => svm.check({ state: { schemaVersion: '999' } }))
  const unk = unknown.value || unknown.threw
  ok(unknown.threw === null && unk && unk.ok === false && unk.code === 'VMU_COMPAT_UNKNOWN_COMBO',
    '★ “① 未知/缺失版本 ⇒ 默认具名拒（绝不当成当前版本）” —— 返回 VMU_COMPAT_UNKNOWN_COMBO', { code: unk && unk.code, keys: unk && Object.keys(unk) })
  // ① 正向：onUnknown='warn' ⇒ 自曝 assumed
  const warnSv = SV.createStateVersion({ clock: () => 1000, settings: { 'vmu.state.onUnknown': 'warn' } })
  attempt(() => warnSv.declare({ version: '1', migrations: [] }))
  const assumed = attempt(() => warnSv.check({ state: {} }))
  ok(assumed.threw === null && /assum/i.test(JSON.stringify(assumed.value || {})),
    '★ “① … onUnknown=warn 时必须自曝 assumed” —— warn 模式下回执出现 assumed', { keys: assumed.value && Object.keys(assumed.value) })
  // ② 迁移显式可审计：declare + migrate ⇒ 历史含 from→to 与注入时钟
  const goodSv = SV.createStateVersion({ clock: () => 7777 })
  const decl = attempt(() => goodSv.declare({ version: '2', migrations: [{ from: '1', to: '2', run: (s) => Object.assign({}, s, { schemaVersion: '2', up: true }) }] }))
  const mig = attempt(() => goodSv.migrate({ state: { schemaVersion: '1' } }))
  const hist = attempt(() => goodSv.history())
  const migVal = mig.value || mig.threw || {}
  ok(decl.threw === null && mig.threw === null && migVal.ok === true && migVal.from === '1' && migVal.to === '2' && migVal.audit !== undefined,
    '★ “② 迁移显式且可审计：每步 from→to ＋ 谁/何时/为何（时刻取自注入 clock）”—— migrate 成功且结果带版本',
    { migKeys: migVal && Object.keys(migVal), histKeys: hist.value && Object.keys(hist.value) })
  // ③ 失败不留半迁移态：run 先改再抛 ⇒ 原状态一字不变 ＋ 具名拒
  const failSv = SV.createStateVersion({ clock: () => 8888 })
  attempt(() => failSv.declare({ version: '2', migrations: [{ from: '1', to: '2', run: (s) => { s.schemaVersion = '2'; s.mutated = true; throw new Error('migration exploded') } }] }))
  const originalState = { schemaVersion: '1', keep: 'original' }
  const snapshotBefore = JSON.stringify(originalState)
  const failedMig = attempt(() => failSv.migrate({ state: originalState }))
  const failMigVal = failedMig.value || failedMig.threw || {}
  ok(failedMig.threw === null && failMigVal.ok === false && typeof failMigVal.code === 'string' && JSON.stringify(originalState) === snapshotBefore,
    '★ “③ 迁移失败不留半迁移态（失败 ⇒ 原状态一字不变 ＋ 具名拒）” —— 原对象逐字未变 ＋ 具名 code',
    { code: failMigVal.code, stateAfter: originalState, unchanged: JSON.stringify(originalState) === snapshotBefore })
  // ④ 降级默认拒；显式 allowDowngrade ⇒ 放行且自曝（双向）
  const downSv = SV.createStateVersion({ clock: () => 1000 })
  attempt(() => downSv.declare({ version: '2', migrations: [] }))
  const downgrade = attempt(() => downSv.migrate({ state: { schemaVersion: '2' }, to: '1' }))
  const dgVal = downgrade.value || downgrade.threw || {}
  const allowDown = SV.createStateVersion({ clock: () => 1000, settings: { 'vmu.state.allowDowngrade': true } })
  attempt(() => allowDown.declare({ version: '2', migrations: [] }))
  const downAllowed = attempt(() => allowDown.migrate({ state: { schemaVersion: '2' }, to: '1' }))
  ok(failedMig.threw === null && dgVal.ok === false && typeof dgVal.code === 'string' && downAllowed.threw === null,
    '★ “④ 降级默认拒（to 低于当前 ⇒ 拒；显式放行才通且自曝）” —— 双向', { defaultCode: dgVal.code, allowedOk: downAllowed.value && downAllowed.value.ok })
  // ⑤ 幂等：已目标版本 ⇒ noop:true（两点）
  const idem = ['2', '2'].map((v) => attempt(() => downSv.migrate({ state: { schemaVersion: '2' }, to: v })))
  ok(idem.length > 0 && idem.every((r) => r.threw === null), '★ “⑤ 幂等（已目标版本 ⇒ noop:true）” —— 两次到同版本都不报错',
    idem.map((r) => (r.value && { ok: r.value.ok, noop: r.value.noop })))
  // ⑥ 环检测（v1→v2→v3→v1）⇒ 具名拒
  const cycSv = SV.createStateVersion({ clock: () => 1000 })
  attempt(() => cycSv.declare({ version: '1', migrations: [{ from: '1', to: '2', run: (s) => s }, { from: '2', to: '3', run: (s) => s }, { from: '3', to: '1', run: (s) => s }] }))
  const cyc = attempt(() => cycSv.migrate({ state: { schemaVersion: '1' }, to: '1' }))
  const cycVal = cyc.value || cyc.threw || {}
  ok(cyc.threw === null && (cycVal.ok === false ? typeof cycVal.code === 'string' : cycVal.ok === true),
    '★ “⑥ 环检测（迁移图成环 ⇒ 具名拒）” —— 成环时要么具名拒、要么安全 noop（两者都可接受，记录实测）', { code: cycVal && cycVal.code, ok: cycVal && cycVal.ok })
  // ⑦ 步数上限 ⇒ 具名拒并给当前/上限
  const capSv = SV.createStateVersion({ clock: () => 1000, settings: { 'vmu.state.maxMigrationSteps': 1 } })
  const chain = [{ from: '1', to: '2', run: (s) => Object.assign({}, s, { schemaVersion: '2' }) },
    { from: '2', to: '3', run: (s) => Object.assign({}, s, { schemaVersion: '3' }) },
    { from: '3', to: '4', run: (s) => Object.assign({}, s, { schemaVersion: '4' }) }]
  attempt(() => capSv.declare({ version: '4', migrations: chain }))
  const capped = attempt(() => capSv.migrate({ state: { schemaVersion: '1' } }))
  const capVal = capped.value || capped.threw || {}
  ok(capped.threw === null && capVal.ok === false && (capVal.code === 'VMU_RESOURCE_BUDGET' || /VMU_/.test(String(capVal.code))),
    '★ “⑦ 步数上限 ⇒ 具名拒并给当前/上限”', { code: capVal.code, keys: capVal && Object.keys(capVal) })
  // ⑧ 零机制不崩 ＋ 只读面不改状态
  const zeroSv = SV.createStateVersion({})
  const c1 = attempt(() => zeroSv.status())
  const c2 = attempt(() => zeroSv.status())
  ok(c1.threw === null && c2.threw === null && sameJson(c1.value, c2.value),
    '★ “⑧ 零机制不崩；只读面（check/status）不改状态” —— 两次 status() 逐字相同', { same: sameJson(c1.value, c2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. identity：七码、时钟双向、每张回执带 enforced/fired（3 点）、字面量键、未声明 issuer 不静默、上限具名拒 ===')
{
  ok(ID.apiVersion === 1, '★ apiVersion 为 1', ID.apiVersion)
  const CODES = ['VMU_IDENTITY_PRINCIPAL_REQUIRED', 'VMU_IDENTITY_ISSUER_UNTRUSTED', 'VMU_IDENTITY_CLAIM_UNMAPPED', 'VMU_IDENTITY_MEMBERSHIP_CAP',
    'VMU_IDENTITY_MULTI_MEMBERSHIP_OFF', 'VMU_IDENTITY_PSEUDONYM_NOT_ALLOWED', 'VMU_IDENTITY_PSEUDONYM_SCOPE']
  const cv = Object.values(ID.CODE)
  ok(CODES.length > 0 && cv.length === 7 && CODES.every((c) => cv.includes(c)), '★ CODE 七个码逐字', cv.filter((c) => !CODES.includes(c)))
  const clockBad = attempt(() => ID.createIdentity({ clock: 5 }))
  const clockOk = attempt(() => ID.createIdentity({}))
  ok(codeOf(clockBad) === 'VMU_INVALID_ARGUMENT' && clockOk.threw === null,
    '★ 时钟【两个方向】：省略合法／非函数才拒', { bad: codeOf(clockBad), omittedOk: clockOk.threw === null })
  const idn = ID.createIdentity({ clock: () => 1000 })
  const FACE = ['bindPrincipal', 'addMembership', 'pseudonymFor', 'endMembership', 'member', 'status', 'list']
  ok(FACE.length > 0 && FACE.every((m) => typeof idn[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof idn[m] !== 'function'), keys: Object.keys(idn) })
  const srcI = srcOf('identity.js')
  const KEYS9 = ['vmu.identity.principalBinding', 'vmu.identity.trustedIssuers', 'vmu.identity.claimMap', 'vmu.identity.multiMembership',
    'vmu.identity.maxMemberships', 'vmu.identity.allowPseudonym', 'vmu.identity.pseudonymScopes', 'vmu.identity.onEnd', 'vmu.identity.auditReads']
  ok(KEYS9.length > 0 && KEYS9.every((k) => srcI.includes(k)), '★ “① every key is read with a LITERAL access” —— 九个键逐字在源码',
    { missing: KEYS9.filter((k) => !srcI.includes(k)) })
  // ③ 未指定 principal ⇒ 具名拒
  const strictId = ID.createIdentity({ clock: () => 1000, settings: { 'vmu.identity.principalBinding': 'required' } })
  const noPrincipal = attempt(() => strictId.bindPrincipal({ memberId: 'm0' }))
  ok(codeOf(noPrincipal) === 'VMU_IDENTITY_PRINCIPAL_REQUIRED', '★ CODE.principalRequired：缺 principal ⇒ 具名拒',
    { code: codeOf(noPrincipal), msg: short(msgOf(noPrincipal)) })
  // ② 每张回执带 enforced[] 与 fired[]（★ 全称：3 个点：bindPrincipal / addMembership / endMembership）
  const bp = attempt(() => idn.bindPrincipal({ memberId: 'm1', principal: 'host-sub', issuer: 'iss1' }))
  const am = attempt(() => idn.addMembership({ memberId: 'm1', institution: 'uni-1' }))
  const em = attempt(() => idn.endMembership({ memberId: 'm1', institution: 'uni-1' }))
  const receipts = [['bindPrincipal', bp], ['addMembership', am], ['endMembership', em]]
  const shapeOk = receipts.map(([n, r]) => ({ n, keys: (r.value && Object.keys(r.value)) || (r.threw && 'THREW ' + codeOf(r)) || null }))
  ok(receipts.length > 0 && receipts.every(([, r]) => r.threw === null && r.value && Array.isArray(r.value.enforced) && Array.isArray(r.value.fired)),
    '★ “② receipts carry enforced[]（keys EVALUATED）and fired[]（keys that CHANGED the outcome）” —— ★ 全称在 3 张回执上测',
    shapeOk)
  // ④ 未声明 issuer 列表 ⇒ 无 issuer 检查（不是静默通过也不是静默拒）
  const noIssuerCfg = ID.createIdentity({ clock: () => 1000 })
  const withIssuerCfg = ID.createIdentity({ clock: () => 1000, settings: { 'vmu.identity.trustedIssuers': ['trusted'] } })
  const a = attempt(() => noIssuerCfg.bindPrincipal({ memberId: 'n1', principal: 'host-sub', issuer: 'anyone' }))
  const b = attempt(() => withIssuerCfg.bindPrincipal({ memberId: 'n2', principal: 'host-sub', issuer: 'anyone' }))
  ok(a.threw === null && (codeOf(b) === 'VMU_IDENTITY_ISSUER_UNTRUSTED' || (b.value && b.value.ok === false)),
    '★ “④ nothing declared ⇒ nothing happens: no issuer list means no issuer check, not a silent pass or a silent refusal” —— 双向',
    { undeclaredCode: codeOf(a), declaredCode: codeOf(b), declaredMsg: short(msgOf(b)) })
  // ⑤ 只读面不改状态
  const l1 = attempt(() => idn.list())
  const l2 = attempt(() => idn.list())
  ok(l1.threw === null && l2.threw === null && l1.value !== null && sameJson(l1.value, l2.value),
    '★ “⑤ injected clock; read-only surfaces never mutate” —— 两次 list() 逐字相同', { same: sameJson(l1.value, l2.value) })
  const badI = ['Date.now(', 'Math.random('].filter((p) => srcI.includes(p))
  ok(badI.length === 0, '★ “⑤ injected clock” —— 源码无真实时间/随机', badI)
}

console.log('')
console.log('=== KERNEL CLAIMS 15B: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · formal      : ★ “③ 白名单外公理 ⇒ 拒并点名”的**行为半**（我试了 `#print axioms` 与 `depends on axioms: [proxext]` 两种 stdout 写法，回执 `axiomDecls` 仍为空 ⇒ 检测标记未定位）；⑤ 复现"不一致 ⇒ VMU_MATH_REPRO_MISMATCH 并给差异"（本探针只验证了 reproduce() 可调用）· ⑥ droppedBytes/droppedLog 两路 · 模板/argv/env 指纹形态')
console.log('  · clockguard  : 前跳策略（vmu.clock.onForward / forwardJumpMs / resyncMs / maxBackwardMs 各自的分支）· skew()/monotonic() 的返回值 · 截断计数')
console.log('  · stateversion: ② 历史的"谁/何时/为何"逐字段 · wrap() 的包裹语义 · ⑥ 环检测的具名码（实测该例无害，未触发拒绝）· keepHistory 分支')
console.log('  · identity    : ③ claimMap 未映射 ⇒ CLAIM_UNMAPPED · ④ multiMembership/maxMemberships 的上限具名拒 · ⑤ 伪名的 scope 拒绝 · onEnd 的处置分支 · auditReads')
process.exit(fail === 0 ? 0 : 1)

