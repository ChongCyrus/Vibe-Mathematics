// tests/audit-kernel-claims-8.mjs — ROUND 107, batch H: paper (16) · ballotbox (13) · migration (15).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// THE AUTHOR'S ERROR LIST IS THE MOST VALUABLE PART OF THIS BATCH, because three of the ten were MEASUREMENT errors rather
// than call-shape errors, and each would have looked like a defect:
//   * it tried to prove "abstentions and absences are counted separately" with EQUAL counts (1 and 1), which proves
//     nothing; TWO abstentions against ONE absence does.
//   * it read `refusals` on instances where nothing had been refused, saw `{}`, and concluded the module does not count -
//     the count is right, the instance was wrong.
//   * it imported a standard the module never promised: paper's header states the D3 EVALUATION SCOPE, while "every
//     refusal carries enforced[]" is funding's and migration's convention. The assertion was moved onto the stated claim,
//     and whether a refusal carries `enforced[]` was kept as a READING in the detail.
// That last one is the discipline in miniature: measure the module's promise, not the auditor's expectation.
//
// AND ONE CROSS-FACE DIVERGENCE IS RECORDED RATHER THAN SILENTLY "FIXED". paper.js has 36 refusal points and attaches
// `enforced[]` at about a third of them, never at the call site - a wrapper adds the D3 scope, and the scope claim holds.
// Rewriting two dozen refusal sites to make a convention universal would change behaviour to satisfy a preference; naming the
// divergence costs nothing and warns the next reader, which is what the ip/mathtools note does for `UNWIRED_REASONS` too.
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
const msgOf = (r) => String((r.threw && r.threw.message) || (r.value && r.value.message) || '')
const short = (s) => String(s).slice(0, 90)
const srcOf = (f) => readFileSync(join(K, f), 'utf8')

const PA = await import(u('paper.js'))
const BB = await import(u('ballotbox.js'))
const MG = await import(u('migration.js'))

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. paper：归属机器强制、完整性是闸、注册被委派、不静默覆盖、上限具名 ===')
{
  ok(PA.apiVersion === 1, '★ apiVersion 为 1', PA.apiVersion)
  ok(PA.ENFORCED_SCOPE === 'evaluated-so-far', '★ “D3: the refusal states its EVALUATION SCOPE”', PA.ENFORCED_SCOPE)
  ok(PA.WIRED_KEYS.length > 0 && PA.WIRED_KEYS.every((k) => k.startsWith('vmu.paper.')),
    '★ “The keys this module really reads” —— WIRED_KEYS 全在 vmu.paper.* 家族', PA.WIRED_KEYS)
  ok(PA.PLANNED_KEYS.length > 0 && PA.PLANNED_KEYS.every((e) => Array.isArray(e) && e.length >= 2 && typeof e[1] === 'string' && e[1].length > 0),
    '★ “Declared but deliberately NOT wired (the audit criterion: named, with a reason, and a revival condition)” —— 每条带非空原因',
    PA.PLANNED_KEYS.map((e) => (Array.isArray(e) ? e[0] : e)))
  ok(PA.FINALIZERS.length > 0 && PA.FINALIZERS.length === 3 && PA.FINALIZERS.includes('editor') && PA.FINALIZERS.includes('contributor') && PA.FINALIZERS.includes('any'),
    '★ FINALIZERS 三个取值（editor/contributor/any）', PA.FINALIZERS)
  ok(PA.PAPER_FORMATS.length > 0 && PA.PAPER_FORMATS.length === 3 && PA.PAPER_LANGUAGES.length > 0 && PA.PAPER_LANGUAGES.length === 2 &&
    PA.CONSULT_POINTS.length > 0 && PA.CONSULT_POINTS.length === 2 && PA.CONSULT_TIMEOUT_ACTIONS.length > 0 && PA.CONSULT_TIMEOUT_ACTIONS.length === 2,
    '★ 四个枚举的取值集合（formats 3／languages 2／consult points 2／timeout actions 2）',
    { f: PA.PAPER_FORMATS, l: PA.PAPER_LANGUAGES, p: PA.CONSULT_POINTS, t: PA.CONSULT_TIMEOUT_ACTIONS })
  const pp = PA.createPaper({ clock: () => 1000 })
  const FACE = ['start', 'contribute', 'revise', 'finalize', 'consult', 'requestConsult', 'consultState', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof pp[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof pp[m] !== 'function'), keys: Object.keys(pp) })
  const started = attempt(() => pp.start({ title: 'T', sections: ['intro', 'methods'], contributors: { intro: 'ann', methods: 'bob' }, editor: 'ann' }))
  const paper = started.threw === null ? started.value : null
  ok(paper !== null && typeof paper.paperId === 'string' && paper.paperId.length > 0, '★ “vmu had their PIECES but not the ORCHESTRATION” —— start() 建稿并返回 paperId',
    started.threw ? short(started.threw.message) : paper && Object.keys(paper))
  const pid = paper && paper.paperId
  // 归属：只有被签约的人能交
  const wrongOwner = attempt(() => pp.contribute({ paperId: pid, section: 'methods', by: 'ann' }))
  ok(codeOf(wrongOwner) !== null && msgOf(wrongOwner).includes('bob') && msgOf(wrongOwner).includes('ann'),
    '★ “ownership is MACHINE-ENFORCED: a section can only be handed in by the member it was contracted to, and a refusal names BOTH the owner and the caller”',
    { code: codeOf(wrongOwner), msg: short(msgOf(wrongOwner)) })
  const rightOwner = attempt(() => pp.contribute({ paperId: pid, section: 'methods', by: 'bob', artifact: 'text-2' }))
  ok(rightOwner.threw === null, '★ 正确归属者可以交稿（否证"一律拒"）', rightOwner.threw ? short(rightOwner.threw.message) : rightOwner.value && Object.keys(rightOwner.value))
  const twice = attempt(() => pp.contribute({ paperId: pid, section: 'methods', by: 'bob', artifact: 'text-2b' }))
  ok(codeOf(twice) !== null, '★ “nothing is silently overwritten: a second hand-in for the same section … is refused”', { code: codeOf(twice), msg: short(msgOf(twice)) })
  // 完整性闸：intro 未交 ⇒ finalize 具名拒并点名【缺哪节 + 谁欠】
  const fin1 = await attemptA(() => pp.finalize({ paperId: pid, by: 'ann' }))
  ok(codeOf(fin1) !== null && msgOf(fin1).includes('intro') && msgOf(fin1).includes('ann'),
    '★ “completeness is a GATE, not a hope: finalising with outstanding sections is refused BY NAME — listing each missing section and who owes it”',
    { code: codeOf(fin1), msg: short(msgOf(fin1)) })
  // 关闭要求 ⇒ 缺口随【回执】旅行（★ 需注入 register 缝，否则先撞 VMU_ENGINE_UNAVAILABLE；★ officeConsult 的
  //   “关”是【字符串 'off'】—— paper.js:139 `readKey('vmu.paper.officeConsult') === 'off' ? 'off' : 'required'`）
  const laxSettings = { 'vmu.paper.requireAllSections': false, 'vmu.paper.officeConsult': 'off' }
  const lax = PA.createPaper({ clock: () => 1000, settings: laxSettings, register: async () => ({ ok: true, version: 'v1', registered: true }) })
  const laxStart = attempt(() => lax.start({ title: 'T2', sections: ['intro'], contributors: { intro: 'ann' }, editor: 'ann' }))
  const laxId = laxStart.value && laxStart.value.paperId
  const finLax = await attemptA(() => lax.finalize({ paperId: laxId, by: 'ann' }))
  ok(finLax.threw === null && finLax.value !== null && JSON.stringify(finLax.value).includes('intro'),
    '★ “unless the pack has explicitly turned the requirement off, and then the GAPS TRAVEL IN THE RECEIPT so they are recorded rather than forgotten”',
    finLax.threw ? short(finLax.threw.message) : finLax.value && Object.keys(finLax.value))
  // 注册被委派：没有 register 缝 ⇒ 具名拒（不假装已登记）
  const noReg = PA.createPaper({ clock: () => 1000, settings: laxSettings })
  const nrStart = attempt(() => noReg.start({ title: 'T3', sections: ['intro'], contributors: { intro: 'ann' }, editor: 'ann' }))
  const nrId = nrStart.value && nrStart.value.paperId
  const nrFin = await attemptA(() => noReg.finalize({ paperId: nrId, by: 'ann' }))
  ok(codeOf(nrFin) === 'VMU_ENGINE_UNAVAILABLE',
    '★ “registration is DELEGATED … when no seam is bound, refuses by name instead of pretending the manuscript was registered”',
    { code: codeOf(nrFin), msg: short(msgOf(nrFin)) })
  // maxSections 上限：具名拒且【写明计数与上限】
  const capped = PA.createPaper({ clock: () => 1000, settings: { 'vmu.paper.maxSections': 1 } })
  const capStart = attempt(() => capped.start({ title: 'T4', sections: ['intro', 'methods'], contributors: { intro: 'ann', methods: 'bob' }, editor: 'ann' }))
  ok(codeOf(capStart) === 'VMU_RESOURCE_BUDGET' && msgOf(capStart).includes('2') && msgOf(capStart).includes('1'),
    '★ “opening a manuscript with more sections than the cap is refused by name WITH THE COUNT AND THE CAP”', { code: codeOf(capStart), msg: short(msgOf(capStart)) })
  // D3 的作用域宣称（★ paper 头部只承诺"拒绝声明其【求值作用域】"，不承诺 enforced[] ⇒ 只断言 scope，
  //   并把"哪条拒绝带/不带 enforced[]"作为【读数】打进 detail，供报告如实记录，不当作宣称违反）
  const anyRef = [wrongOwner, twice, capStart].filter((r) => codeOf(r) !== null)
  const refShape = anyRef.map((r) => {
    const ref = r.threw || r.value
    return { code: codeOf(r), scope: ref.enforcedScope || null, hasEnforcedArray: Array.isArray(ref.enforced) }
  })
  ok(anyRef.length > 0 && refShape.every((x) => x.scope === PA.ENFORCED_SCOPE),
    '★ “D3: the refusal states its EVALUATION SCOPE” —— 每条拒绝都带 enforcedScope', refShape)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. ballotbox：27 键分区、法定人数不足具名拒、平票自曝规则、弃权/缺席分开、秘密票计数保留 ===')
{
  ok(BB.ALL_BALLOT_KEYS.length === 27, '★ “把 `vmu.ballot.*` 27 键接成可观测行为” —— ALL_BALLOT_KEYS 恰 27', BB.ALL_BALLOT_KEYS.length)
  const wired = BB.WIRED_BALLOT_KEYS
  const planned = BB.PLANNED_BALLOT_KEYS.map((e) => (Array.isArray(e) ? e[0] : e))
  const overlap = wired.filter((k) => planned.includes(k))
  ok(wired.length > 0 && planned.length > 0 && overlap.length === 0 && wired.length + planned.length === 27,
    '★ “未接键逐个点名（planned[]，带原因）＋ 断言 planned ∩ wired = ∅ 且二者恰好划分 27”',
    { wired: wired.length, planned: planned.length, overlap, sum: wired.length + planned.length })
  ok(BB.PLANNED_BALLOT_KEYS.length > 0 && BB.PLANNED_BALLOT_KEYS.every((e) => Array.isArray(e) && e.length >= 2 && typeof e[1] === 'string' && e[1].length > 0),
    '★ “未接：逐个点名＋原因（不得静默）” —— 每条未接键都带非空原因', BB.PLANNED_BALLOT_KEYS.map((e) => e[0]))
  const box = BB.createBallotBox({ clock: () => 1000 })
  const FACE = ['open', 'cast', 'markAbsent', 'close', 'reopen', 'lapseDue', 'lapse', 'revokeLapse', 'status', 'keysUsed', 'partition']
  ok(FACE.length > 0 && FACE.every((m) => typeof box[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof box[m] !== 'function'), keys: Object.keys(box) })
  const part = attempt(() => box.partition())
  ok(part.threw === null && part.value !== null, '★ 面自带 partition() 自述分区（“二者恰好划分 27”）', part.threw ? short(part.threw.message) : part.value && Object.keys(part.value))
  // 零机制不崩
  const zero = attempt(() => box.status())
  ok(zero.threw === null && zero.value !== null, '★ “⑥ 零机制不崩” —— 空配置下 status() 不抛', zero.threw ? short(zero.threw.message) : zero.value && Object.keys(zero.value))
  // ★ 真实形状（纠正我上一版）：`open({ question, options })`（id 自生、没有 voters 参数），`cast({ boxId, by, choice })`，
  //   法定人数/平票规则来自【设置】`vmu.ballot.minVotes` / `vmu.ballot.tieRule`，不是 open 的参数。
  const quorumBox = BB.createBallotBox({ clock: () => 1000, settings: { 'vmu.ballot.minVotes': 3 } })
  const b1 = attempt(() => quorumBox.open({ question: 'm1', options: ['a', 'b'] }))
  const id1 = b1.value && b1.value.boxId
  const cast1 = attempt(() => quorumBox.cast({ boxId: id1, by: 'x', choice: 'a' }))
  const close1 = attempt(() => quorumBox.close({ boxId: id1 }))
  ok(codeOf(close1) === 'VMU_BALLOT_MIN_VOTES_NOT_MET',
    '★ “法定人数不足 ⇒ 具名拒（不是"未通过"）” —— close 返回/抛 MIN_VOTES_NOT_MET',
    { code: codeOf(close1), msg: short(msgOf(close1)), open: codeOf(b1), cast: codeOf(cast1), openKeys: b1.value && Object.keys(b1.value) })
  // 平票自曝用了哪条规则
  const tieBox = BB.createBallotBox({ clock: () => 1000, settings: { 'vmu.ballot.tieRule': 'chair' } })
  const b2 = attempt(() => tieBox.open({ question: 'm2', options: ['a', 'b'] }))
  const id2 = b2.value && b2.value.boxId
  const c2a = attempt(() => tieBox.cast({ boxId: id2, by: 'x', choice: 'a' }))
  const c2b = attempt(() => tieBox.cast({ boxId: id2, by: 'y', choice: 'b' }))
  const close2 = attempt(() => tieBox.close({ boxId: id2 }))
  const close2Json = JSON.stringify(close2.value || {}) + msgOf(close2)
  ok(close2.threw === null && close2Json.length > 2 && /tie|规则|chair/i.test(close2Json),
    '★ “平票按 tieRule 处置并自曝用了哪条规则” —— close 的回执/拒绝里出现规则自述',
    { code: codeOf(close2), json: short(close2Json), keys: close2.value && Object.keys(close2.value) })
  // 重复投票 ⇒ 具名拒
  const dup = attempt(() => quorumBox.cast({ boxId: id1, by: 'x', choice: 'b' }))
  ok(codeOf(dup) === 'VMU_CONFLICT', '★ “重复投票 ⇒ 具名拒”', { code: codeOf(dup), msg: short(msgOf(dup)) })
  // 弃权与缺席分开计数：★ 用【两个弃权 vs 一个缺席】⇒ 两个数不同才证明是"分开计数"（等值时什么都证明不了）
  const abBox = BB.createBallotBox({ clock: () => 1000, settings: { 'vmu.ballot.abstainAllowed': true } })
  const b3 = attempt(() => abBox.open({ question: 'm3', options: ['a', 'b'] }))
  const id3 = b3.value && b3.value.boxId
  const ab = attempt(() => abBox.cast({ boxId: id3, by: 'x', choice: 'abstain' }))
  const ab2 = attempt(() => abBox.cast({ boxId: id3, by: 'z', choice: 'abstain' }))
  const absent = attempt(() => abBox.markAbsent({ boxId: id3, by: 'y' }))
  const close3 = attempt(() => abBox.close({ boxId: id3 }))
  const c3j = JSON.stringify(close3.value || {})
  const abCount = /"abstain"\s*:\s*(\d+)/.exec(c3j)
  const absentCount = /"absent"\s*:\s*(\d+)/.exec(c3j)
  ok(close3.threw === null && abCount !== null && absentCount !== null && Number(abCount[1]) === 2 && Number(absentCount[1]) === 1,
    '★ “弃权与缺席分开计数” —— 两次弃权 + 一次缺席 ⇒ close 回执里 abstain=2 而 absent=1（两个独立计数各自正确）',
    { abstain: abCount && abCount[1], absent: absentCount && absentCount[1], code: codeOf(close3), keys: close3.value && Object.keys(close3.value) })
  // 拒绝按码计数（★ 在【发生过拒绝的那个实例】上读，不是零机制实例）
  const stRef = attempt(() => quorumBox.status())
  const refs = stRef.value && (stRef.value.refusals || stRef.value.refusalCounts || stRef.value.refused)
  ok(refs !== null && refs !== undefined && typeof refs === 'object' && Number(refs['VMU_BALLOT_MIN_VOTES_NOT_MET']) >= 1,
    '★ “④ 拒绝按码计数（refusals）” —— 被拒的那个实例自报该码 ≥1', { refs, keys: stRef.value && Object.keys(stRef.value) })
  const srcB = srcOf('ballotbox.js')
  const badB = ['Date.now(', 'Math.random('].filter((p) => srcB.includes(p))
  ok(badB.length === 0, '★ “⑤ 注入时钟（不读真实时间）” —— 源码扫描', badB)
  const stA = JSON.stringify(attempt(() => box.status()).value)
  const stB = JSON.stringify(attempt(() => box.status()).value)
  ok(stA === stB, '★ “⑦ 只读面不改状态” —— 两次 status() 逐字相同', { same: stA === stB })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. migration：②③④ 收据/拒绝/未接键、GATE_SCENARIOS、按码计数、compat 键逐字读 ===')
{
  ok(MG.apiVersion === 1, '★ apiVersion 为 1', MG.apiVersion)
  ok(MG.ENFORCED_SCOPE === 'evaluated-so-far', '★ “enforcedScope: evaluated-so-far”（D3 的作用域常量）', MG.ENFORCED_SCOPE)
  ok(MG.WIRED_KEYS.length > 0 && MG.WIRED_KEYS.length === 11 && MG.WIRED_KEYS.every((k) => k.startsWith('vmu.migration.')),
    '★ “The 11 declared keys this face wires” —— 恰 11 条且同族', { n: MG.WIRED_KEYS.length, off: MG.WIRED_KEYS.filter((k) => !k.startsWith('vmu.migration.')) })
  ok(Object.keys(MG.UNWIRED_REASONS).length > 0 && Object.values(MG.UNWIRED_REASONS).every((r) => typeof r === 'string' && r.length > 0),
    '★ “Why a declared-but-unwired key would not be honoured” —— 原因非空且具名', MG.UNWIRED_REASONS)
  ok(MG.GATE_SCENARIOS.length > 0 && MG.GATE_SCENARIOS.every((s) => s && typeof s.name === 'string' && s.name.length > 0 && typeof s.settings === 'object' && s.call && typeof s.call.op === 'string'),
    '★ “GATE_SCENARIOS names the acceptance scenarios one by one, so "a gate passed" is a named fact rather than a claim”',
    MG.GATE_SCENARIOS.map((s) => s && s.name))
  const mg = MG.createMigration({ clock: () => 1000, backends: ['v1', 'v2'] })
  const FACE = ['plan', 'apply', 'rollback', 'verify', 'list', 'receiptsView', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof mg[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof mg[m] !== 'function'), keys: Object.keys(mg) })
  const srcM = srcOf('migration.js')
  const COMPAT = ['vmu.compat.enforce', 'vmu.compat.unknownCombo', 'vmu.compat.matrixSource', 'vmu.compat.known.requireCitation']
  ok(COMPAT.length > 0 && COMPAT.every((k) => srcM.includes(k)),
    '★ “the compatibility keys are NOT part of the vmu.migration.* family … their literal reads in this face’s own key map are what makes them wired” —— 四个字面量在源码里',
    COMPAT.filter((k) => !srcM.includes(k)))
  // ② 收据形状（★ 真实形状：plan 需要【声明的 backend 集】—— 没有它就是具名拒，见下）
  const plan1 = attempt(() => mg.plan({ from: 'v1', to: 'v2', backend: 'v2', steps: 1 }))
  const rec = plan1.value
  ok(plan1.threw === null && rec && Array.isArray(rec.enforced) && Array.isArray(rec.fired) && rec.enforcedScope === MG.ENFORCED_SCOPE && rec.fired.every((k) => rec.enforced.includes(k)),   // EMPTY_ALLOWED: fired 可以为空（本次没有键改变结果）；同一表达式里的 Array.isArray(enforced)/Array.isArray(fired)/enforcedScope 仍能在漂移时判红
    '★ “② every receipt carries enforced[] … fired[]（fired ⊆ enforced）+ enforcedScope” —— plan() 收据形状',
    plan1.threw ? short(plan1.threw.message) : rec && { enforced: rec.enforced, fired: rec.fired, scope: rec.enforcedScope, keys: Object.keys(rec) })
  // ① 没有声明的 backend 集就是具名拒（“an absent set is itself a refusal, not a silent accept-anything”）
  const noBackends = MG.createMigration({ clock: () => 1000 })
  const nb = attempt(() => noBackends.plan({ from: 'v1', to: 'v2', backend: 'v2', steps: 1 }))
  ok(nb.threw === null && nb.value && nb.value.ok === false && nb.value.code === 'VMU_COMPAT_MATRIX_MISSING',
    '★ “an absent set is itself a refusal, not a silent accept-anything” —— 未传 backends ⇒ 返回 VMU_COMPAT_MATRIX_MISSING',
    { code: codeOf(nb), keys: nb.value && Object.keys(nb.value) })
  // ③ 拒绝【返回】而非抛 + 形状（★ apply 吃的是 plan 的【id】）
  const strict = MG.createMigration({ clock: () => 1000, backends: ['v1', 'v2'], settings: { 'vmu.migration.requireConfirm': true } })
  const sp = attempt(() => strict.plan({ from: 'v1', to: 'v2', backend: 'v2', steps: 1 }))
  const ap = attempt(() => strict.apply({ migration: sp.value && sp.value.migration, confirm: false }))
  const ref = ap.threw || ap.value
  ok(ap.threw === null && ap.value && ap.value.code === 'VMU_MIGRATE_CONFIRM_REQUIRED',
    '★ “③ every REFUSAL — this face RETURNS them — carries …” —— 未确认时【返回】VMU_MIGRATE_CONFIRM_REQUIRED',
    { threw: ap.threw && short(ap.threw.message), code: codeOf(ap), planCode: codeOf(sp), planKeys: sp.value && Object.keys(sp.value) })
  ok(ref && Array.isArray(ref.enforced) && ref.enforcedScope === MG.ENFORCED_SCOPE && Array.isArray(ref.wouldEvaluate) && ref.wouldEvaluate.length > 0 && ref.wouldEvaluate.length >= ref.enforced.length,
    '★ 拒绝带 enforced（数组）＋同 scope＋wouldEvaluate ⊇ enforced', ref && { enforced: ref.enforced, scope: ref.enforcedScope, would: ref.wouldEvaluate })
  // ④ status().plannedKeys（弱事例另记）
  const st = attempt(() => mg.status())
  const planned = st.value && st.value.plannedKeys
  ok(st.threw === null && Array.isArray(planned) && st.value.plannedCount === planned.length && (planned.length === 0 || planned.every((k) => !MG.WIRED_KEYS.includes(k))),   // EMPTY_ALLOWED: 今天没有【具体】未接键时 planned 合法为空（家族级原因另在 UNWIRED_REASONS）；同一表达式里的 plannedCount === planned.length 与 WIRED_KEYS 非空仍能判红
    '★ “④ a declared key that is not wired is named in status().plannedKeys with its reason” 的**载荷半**：计数自洽且与 WIRED_KEYS 不相交',
    st.threw ? short(st.threw.message) : { planned, plannedCount: st.value && st.value.plannedCount, keys: st.value && Object.keys(st.value) })
  // 按码计数（★ 在【发生过该拒绝的实例】上读）
  const stStrict = attempt(() => strict.status())
  const refs = stStrict.value && (stStrict.value.refusals || stStrict.value.refusalCounts || null)
  ok(refs !== null && typeof refs === 'object' && Number(refs['VMU_MIGRATE_CONFIRM_REQUIRED']) >= 1,
    '★ “refusals are counted PER CODE” —— 该实例的计数里出现 VMU_MIGRATE_CONFIRM_REQUIRED', refs)
  // 只读面不改状态 + 时钟
  const stA = JSON.stringify(attempt(() => mg.status()).value)
  const stB = JSON.stringify(attempt(() => mg.status()).value)
  ok(stA === stB, '★ “reads never mutate” —— 两次 status() 逐字相同', { same: stA === stB })
  const badM = ['Date.now(', 'Math.random('].filter((p) => srcM.includes(p))
  ok(badM.length === 0, '★ “the injected clock is the only time source” —— 源码扫描', badM)
}

console.log('')
console.log('=== KERNEL CLAIMS 7H: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · paper   : “zero policy check: no role name, section name or title from the v5r line appears in this file”（需要一个可信的 v5r 名单才谈得上扫描）')
console.log('             · maxRounds 的修订轮上限（需连续 revise 到上限）· officeConsult 五键的门（需构造消息/会议记录）· consult()/requestConsult()/consultState() 的状态机')
console.log('  · ballotbox: 秘密表决（secrecy）“明细不可回收但保留计数”（需按 secrecy 开箱并索取明细）· runoffTopN 的第二轮 round:2 ·')
console.log('             reopen()/lapse()/revokeLapse() 的议程分支 · 27 键中每个键【各自】改变可观测行为（本轮只测了分区与少量语义）')
console.log('  · migration: ④ 的字面事例（plannedKeys 若为空则不可能失败，见载荷半）· rollback/verify/list/receiptsView 的行为面 ·')
console.log('             VMU_COMPAT_* 三类拒绝 · dryRun/stepBatch/onFailure 的分支')

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 7H SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 7H (paper 16 · ballotbox 13 · migration 15): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)
