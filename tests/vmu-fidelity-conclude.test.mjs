// B8 · 「Lean 通过 ⇒ 辩论只查描述/定义符合性 ⇒ 符合即 p=1 且入 verified」
//
// 这一批修的缺陷是**没有消费者的机制**：`kernel/fidelity.js` 的 `declareDefect`/`passedWithdrawnFor`（撤回面）
// 与 `packs/v5r/verified.js` 的 `findVerified(...,{fidelity})`（撤回的**唯一读法**）都写好了，但：
//   ① 没有任何 pack 动作把"符合性判定"落成结论（`vibe_v5_decide` 之类不存在）⇒ 规则那一步在真机不可达；
//   ② `findVerified` 与 `promoteVerified` 用 `passedWithdrawnFor(...) === true` 比较，而内核返回的是**标记对象**
//      `{withdrawn:true,...}` ⇒ 真机上撤回标记永远命中不了，"一行没人看的字"真的成了一行没人看的字；
//   ③ `leanPassedOf` 探测的是 `kernel.lean.job(...)`，而这个面挂的方法叫 `status(id)` ⇒ "Lean 证据"分支
//      在真机上**静默不存在**（B6 的 p=1 证据链里就有一条是死的）。
// 本套件用**真机 boot**（真 records/真 fidelity/真 card 写路径）＋只把这一个面替成可控的假 Lean 面来钉住这些行为：
// 假面只提供 `status(id)`/`policy()`，其余全是真内核。每条"成功了"都要从 records / fidelity 读回来。
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const verifiedMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const codeOf = (res) => (res && (res.code || (res.error && res.error.code))) || null

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true, parsed: undefined }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

/** The ONLY thing replaced: a controlled Lean face. Same shape the kernel publishes (`status(id)`, `policy()`). */
const fakeLean = (jobs) => ({
  status: (id) => {
    const j = jobs[String(id)]
    if (!j) return { ok: false, code: 'VMU_LEAN_NOT_FOUND', message: '找不到 Lean 作业 ' + String(id) }
    return { ok: true, job: { id: String(id), state: j.state, file: j.file || null, passed: j.passed === true } }
  },
  policy: () => ({ formalVerify: 'require', requireFormal: true, encourageFormal: false, initiative: 'off', initiativeEffect: 'display-only' }),
})

const root = await mkdtemp(join('D:/_tmp', 'vmu-fidelity-conclude-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  ok(kernel !== null && kernel !== undefined, '★ 真机 boot 拿到 kernel（没有 kernel 的"通过"是假绿）')

  await kernel.members.hire({ id: 'acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  const roster = kernel.members.roster()
  ok(Array.isArray(roster) && roster.length >= 2, '名册非空且够开会（guard）', Array.isArray(roster) ? roster.length : typeof roster)

  // 只替 Lean 面：三种作业 —— 通过 / 没通过 / 不存在
  const JOBS = { 'j-pass': { state: 'settled', passed: true, file: 'Formal/pi/Demo.lean' },
    'j-fail': { state: 'failed', passed: false, file: 'Formal/pi/Bad.lean' } }
  Object.defineProperty(kernel, 'lean', { configurable: true, value: fakeLean(JOBS) })
  ok(typeof kernel.lean.status === 'function', '假 Lean 面已就位（真内核的其余部分不动）', typeof kernel.lean.status)
  ok(kernel.lean.policy().formalVerify === 'require', '假面如实回显部署策略 `vmu.math.formalVerify`')

  const records = kernel.records
  const cardP = (id) => Number(verifiedMod.parseCard(records.get({ id })).card.p)
  const verifiedRow = (id) => verifiedMod.findVerified(records, id, { fidelity: kernel.fidelity })
  const verifiedCount = () => verifiedMod.listVerified(records).count

  console.log('=== 0. 这个动作真的发布了（不是只活在文档里）===')
  {
    const spec = b.specOf('vibe_v5_fidelity_conclude')
    ok(spec !== undefined, '★ `vibe_v5_fidelity_conclude` 经真机 host 适配器发布', b.specOf.name)
    if (spec) {
      const props = (spec.parameters && spec.parameters.properties) || {}
      const required = (spec.parameters && spec.parameters.required) || []
      ok(props.card && props.fidelity && props.lean_job, 'schema 声明了 card/fidelity/lean_job 三个键', Object.keys(props))
      ok(required.includes('card') && required.includes('fidelity') && required.includes('lean_job'), '三个键都是**必填**（收口不接受缺参数的默认）', required)
      const text = String(spec.description || '')
      ok(/conform/.test(text) && /defect/.test(text), '★ 工具说明书把两个合法判定都写出来（中文 agent 读的是这段）', text.slice(0, 120))
      ok(/verified/.test(text), '说明书点明 conform 的去处是 verified 轨')
    }
    ok(/vibe_v5_fidelity_conclude/.test(String(b.state.specs.map((s) => s.name).join(','))), '发布的名字在真机工具表里')
  }

  console.log('=== 1. conform：p 改成 1（走同一条 gated 写卡路径）+ 唯一写入器进 verified ===')
  const cardId = 'r-b8-conform'
  let conform = null
  {
    const wrote = await call(b, 'vibe_v5_record_proposition', {
      id: cardId, title: 'B8 命题', statement: '对任意 n，2n 是偶数', value: '命题', motive: '基础练习', p: 0.6, member: 'acad',
    })
    ok(wrote.parsed && wrote.parsed.ok === true, '★ 命题卡写入成功（p=0.6：还不是结论）', wrote.parsed)
    ok(cardP(cardId) === 0.6, '读回：卡上的 p 确实是 0.6（不是回执里说的）', cardP(cardId))
    ok(verifiedCount() === 0, 'guard：verified 轨此刻是空的', verifiedCount())

    conform = await call(b, 'vibe_v5_fidelity_conclude', { card: cardId, fidelity: 'conform', lean_job: 'j-pass', member: 'acad' })
    ok(conform.parsed && conform.parsed.ok === true, '★★ conform 收口成功', conform.parsed)
    ok(conform.parsed && conform.parsed.fidelity === 'conform', '回执点名这次判定是 conform')
    ok(conform.parsed && conform.parsed.p1Written === true, '回执如实说"卡上的 p 是这一次写的"（此前是 0.6）')
    ok(cardP(cardId) === 1, '★★ 读回：卡上的 p 真的变成 1（不是只改了 verified 行）', cardP(cardId))
    const row = verifiedRow(cardId)
    ok(row !== null, '★★ verified 轨里有这张卡的定论行（findVerified 读得到）', row && row.id)
    ok(row && Number(row.verified.p) === 1, 'verified 行的 p 是 1', row && row.verified.p)
    ok(row && row.verified.warrant === 'j-pass', 'verified 行记下了承办法官＝这次 Lean 作业 id', row && row.verified.warrant)
    ok(row && row.verified.source === 'lean-conformance', '法官的种类是 lean-conformance（不是匿名的"我觉得"）', row && row.verified.source)
    ok(conform.parsed && conform.parsed.cardP === 1 && conform.parsed.verified && conform.parsed.verified.id, '回执里的读回与 records 一致')
    ok(conform.parsed && conform.parsed.policy && conform.parsed.policy.formalVerify === 'require', '★ 回执回显部署策略（复用 `vmu.math.formalVerify`，不新造键）')
    ok(conform.parsed && Array.isArray(conform.parsed.enforced), 'enforced 是数组（接线层写的属性槽在）')
  }

  console.log('=== 2. 幂等：同一结论再做一次，不新增行、不报错 ===')
  {
    const again = await call(b, 'vibe_v5_fidelity_conclude', { card: cardId, fidelity: 'conform', lean_job: 'j-pass', member: 'acad' })
    ok(again.parsed && again.parsed.ok === true, '重复 conform 仍然成功（幂等，不是"第二次就炸"）', again.parsed)
    ok(again.parsed && again.parsed.p1Written === false, '第二次没有再次改卡（p 已经是 1）')
    ok(again.parsed && again.parsed.promoted && again.parsed.promoted.written === false, '第二次没有新增/重写 verified 行', again.parsed && again.parsed.promoted)
    ok(verifiedCount() === 1, '★★ verified 轨仍然只有 1 行（幂等是可读的事实，不是宣称）', verifiedCount())
  }

  console.log('=== 3. defect：耐久标记 + verified 读数立刻不可见 ===')
  const NOTE = '定义 3 的"偶数"写成了整除 2 的整数模 2 为零，与命题原文的偶数定义不一致'
  let defect = null
  {
    defect = await call(b, 'vibe_v5_fidelity_conclude', { card: cardId, fidelity: 'defect', lean_job: 'j-pass', member: 'acad', note: NOTE })
    ok(defect.parsed && defect.parsed.ok === true, '★★ defect 收口成功（有原因才有可审计的内容）', defect.parsed)
    ok(defect.parsed && defect.parsed.withdrawn === true, '回执说该卡的证明已被撤回')
    ok(defect.parsed && defect.parsed.verifiedVisible === false, '★★ 回执如实说 verified 读数已不可见')
    ok(verifiedRow(cardId) === null, '★★★ 读回：findVerified 真的看不见了（撤回不是一行没人看的字）')
    const marker = kernel.fidelity.passedWithdrawnFor(cardId)
    ok(marker !== null && marker !== undefined, '★★ 内核的撤回标记读得到', marker)
    ok(marker && marker.withdrawn === true && String(marker.note).includes('定义 3'), '★ 标记里带着原因（哪一条定义不一致）', marker && marker.note)
    ok(marker && String(marker.by) === 'acad', '标记里有署名（谁判的）', marker && marker.by)
    ok(verifiedCount() === 1, '行还在盘上（撤回是"看不见"，不是"删行"）：计数仍为 1', verifiedCount())
    ok(cardP(cardId) === 1, '卡上的 p 没有被 defect 偷偷改掉（撤回的是结论，不是作者当时的估计）', cardP(cardId))
  }

  console.log('=== 4. 幂等 + 追加：同一个原因重复 defect 不重铸标记；新原因则追加 ===')
  {
    const first = kernel.fidelity.passedWithdrawnFor(cardId)
    const same = await call(b, 'vibe_v5_fidelity_conclude', { card: cardId, fidelity: 'defect', lean_job: 'j-pass', member: 'acad', note: NOTE })
    ok(same.parsed && same.parsed.ok === true, '同一原因的重复 defect 仍成功（幂等）', same.parsed)
    ok(same.parsed && same.parsed.alreadyWithdrawn === true && same.parsed.appended === false, '回执说"早就撤回过、这次没有追加"')
    const second = kernel.fidelity.passedWithdrawnFor(cardId)
    ok(second && first && second.markerId === first.markerId, '标记 id 没变（同一事实不重铸）', [first && first.markerId, second && second.markerId])
    const other = await call(b, 'vibe_v5_fidelity_conclude', { card: cardId, fidelity: 'defect', lean_job: 'j-pass', member: 'acad', note: '另一处：引理 2 的假设多了一条' })
    ok(other.parsed && other.parsed.ok === true && other.parsed.appended === true, '新原因 ⇒ 追加一条标记（历史保留）', other.parsed && { appended: other.parsed.appended })
    const third = kernel.fidelity.passedWithdrawnFor(cardId)
    ok(third && first && third.markerId !== first.markerId, '标记 id 变了（新的一条），但仍处于撤回态')
  }

  console.log('=== 5. TEETH：撤回之后不能再被下一次 conform 复活 ===')
  {
    const revive = await call(b, 'vibe_v5_fidelity_conclude', { card: cardId, fidelity: 'conform', lean_job: 'j-pass', member: 'acad' })
    ok(revive.parsed && revive.parsed.ok !== true, '★★ conform 被拒（撤回不可撤销）', revive.parsed && (revive.parsed.code || revive.parsed.message))
    ok(codeOf(revive.parsed) === 'VMU_STATE', '码是 VMU_STATE（状态类：撤回是既成事实）', codeOf(revive.parsed))
    ok(/撤回|WITHDRAWN/i.test(String(revive.parsed && revive.parsed.message)), '消息明说"证明已被忠实性缺陷撤回"', revive.parsed && revive.parsed.message)
    ok(verifiedRow(cardId) === null, '而且撤回仍然有效（没有被这次尝试绕开）')
  }

  console.log('=== 6. 具名拒：没有通过的 Lean 作业 ⇒ 这条收口无载体 ===')
  {
    const cardB = 'r-b8-lean-gate'
    await call(b, 'vibe_v5_record_proposition', {
      id: cardB, title: 'B8 另一命题', statement: '对任意 n，n^2 是整数', value: '命题', motive: '形式化练习', p: 0.5, member: 'acad',
    })
    const noJob = await call(b, 'vibe_v5_fidelity_conclude', { card: cardB, fidelity: 'conform', member: 'acad' })
    ok(noJob.parsed && noJob.parsed.ok !== true, '没有 lean_job ⇒ 拒', noJob.parsed && noJob.parsed.code)
    ok(codeOf(noJob.parsed) === 'VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED', '★ 码点名"缺 Lean 通过"这件事', codeOf(noJob.parsed))
    const unknown = await call(b, 'vibe_v5_fidelity_conclude', { card: cardB, fidelity: 'conform', lean_job: 'j-ghost', member: 'acad' })
    ok(codeOf(unknown.parsed) === 'VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED', '未知作业 id ⇒ 同一个码（不是崩溃也不是放行）', codeOf(unknown.parsed))
    ok(/no such job id|not readable/i.test(String(unknown.parsed && unknown.parsed.message)), '消息说清"这个面不认识该作业"', unknown.parsed && unknown.parsed.message)
    const badJob = await call(b, 'vibe_v5_fidelity_conclude', { card: cardB, fidelity: 'conform', lean_job: 'j-fail', member: 'acad' })
    ok(codeOf(badJob.parsed) === 'VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED', '没通过的作业 ⇒ 同一个码', codeOf(badJob.parsed))
    ok(/did NOT pass/.test(String(badJob.parsed && badJob.parsed.message)), '消息点名 state（"编译不过"不是"定义不忠实"）', badJob.parsed && badJob.parsed.message)
    ok(cardP(cardB) === 0.5, '★★ 三条拒绝都没有偷偷动卡（p 仍是 0.5）', cardP(cardB))
    ok(verifiedRow(cardB) === null, '也没有偷偷建 verified 行')
  }

  console.log('=== 7. 具名拒：签名人、卡、词表 ===')
  {
    const cardC = 'r-b8-signer'
    await call(b, 'vibe_v5_record_proposition', {
      id: cardC, title: 'B8 签名', statement: '对任意 n，n+0=n', value: '命题', motive: '签名练习', p: 0.5, member: 'acad',
    })
    const nonChair = await call(b, 'vibe_v5_fidelity_conclude', { card: cardC, fidelity: 'conform', lean_job: 'j-pass', member: 'r-1' })
    ok(codeOf(nonChair.parsed) === 'VMU_NOT_PERMITTED', '★ 非主席不能把别人的经验值改成结论', codeOf(nonChair.parsed))
    ok(/academician|chair/i.test(String(nonChair.parsed && nonChair.parsed.message)), '消息点名"这是院士（主席席）的动作"', nonChair.parsed && nonChair.parsed.message)
    const noMember = await call(b, 'vibe_v5_fidelity_conclude', { card: cardC, fidelity: 'conform', lean_job: 'j-pass' })
    ok(codeOf(noMember.parsed) === 'VMU_INVALID_ARGUMENT', '没署名 ⇒ 具名拒（收口是署名动作）', codeOf(noMember.parsed))
    const ghost = await call(b, 'vibe_v5_fidelity_conclude', { card: 'r-ghost', fidelity: 'conform', lean_job: 'j-pass', member: 'acad' })
    ok(codeOf(ghost.parsed) === 'VMU_NO_SUCH_OBJECT', '未知卡 ⇒ 具名拒', codeOf(ghost.parsed))
    const badWord = await call(b, 'vibe_v5_fidelity_conclude', { card: cardC, fidelity: 'maybe', lean_job: 'j-pass', member: 'acad' })
    ok(codeOf(badWord.parsed) === 'VMU_INVALID_ARGUMENT', 'fidelity 只收两个值（别自己再造一套词表）', codeOf(badWord.parsed))
    ok(/conform.*defect|defect.*conform/.test(String(badWord.parsed && badWord.parsed.message + ' ' + badWord.parsed.hint)), '拒绝消息把两个合法值都写出来', badWord.parsed && badWord.parsed.message)
    const noNote = await call(b, 'vibe_v5_fidelity_conclude', { card: cardC, fidelity: 'defect', lean_job: 'j-pass', member: 'acad' })
    ok(noNote.parsed && noNote.parsed.ok !== true, '缺陷没有原因 ⇒ 拒（缺陷必须写清哪一条不一致）', noNote.parsed && noNote.parsed.code)
    ok(cardP(cardC) === 0.5 && verifiedRow(cardC) === null, '这四条拒绝都没有改状态')
    // 同一个动作在**另一张干净的卡**上仍然可用（撤回不是全局熔断）
    const fresh = await call(b, 'vibe_v5_fidelity_conclude', { card: cardC, fidelity: 'conform', lean_job: 'j-pass', member: 'acad' })
    ok(fresh.parsed && fresh.parsed.ok === true, '★ 另一张卡照常可收口（状态是按卡的，不是全局开关）', fresh.parsed && fresh.parsed.code)
    ok(cardP(cardC) === 1 && verifiedRow(cardC) !== null, '★★ 那张卡读回：p=1 且 verified 行在')
  }

  console.log('=== 8. 零机制对照：没有部署策略面时如实说，不编默认 ===')
  {
    const b2 = await boot({ root: join(root, 'noleansurface'), packs: ['v5r'] })
    const k2 = b2.handle.kernel
    ok(k2 !== null, '第二个内核 boot 成功（guard）', !!k2)
    await k2.members.hire({ id: 'acad', slot: 'chair' })
    await k2.members.hire({ id: 'r1', slot: 'member' })
    ok(k2.lean === null || k2.lean === undefined, '没有 spawn 缝 ⇒ 这个内核**没有 Lean 面**（零机制红线的正常态）', typeof k2.lean)
    const wrote = await call(b2, 'vibe_v5_record_proposition', { id: 'r-noleans', title: 'T', statement: 'S', value: 'V', motive: 'M', p: 0.4, member: 'acad' })
    ok(wrote.parsed && wrote.parsed.ok === true, '卡仍可写（guard）', wrote.parsed && wrote.parsed.code)
    const res = await call(b2, 'vibe_v5_fidelity_conclude', { card: 'r-noleans', fidelity: 'conform', lean_job: 'j-any', member: 'acad' })
    ok(codeOf(res.parsed) === 'VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED', '★ 没有 Lean 面 ⇒ 同一个具名码', codeOf(res.parsed))
    ok(/no Lean face|spawn seam/i.test(String(res.parsed && res.parsed.message)), '消息点名"这台部署没有 Lean 面"（而不是"作业没通过"）', res.parsed && res.parsed.message)
  }
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

console.log('')
if (failed > 0) console.error('FAILURES:\n  · ' + failures.join('\n  · '))
console.log('=== VMU FIDELITY CONCLUDE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
