#!/usr/bin/env node
// tests/vmu-run162-addressing.test.mjs — ★ RUN 162：第十次真机跑（tarball `61cde009`，jsonl
// `full-1031-115225.jsonl`，代理报告 `FEEDBACK9.md` / `SIM-REPORT9.md`，`RUN7 VERDICT: PASS`、六条核验全 PASS）
// 另外抓到的一处硬缺陷：**同一篇论文的两种寻址拼写（铸造 id `paper-p14` 与标题）在 `final` / `consult` /
// `consult_state` 上给出相反的结论** —— 用 id 说「0 位互审」「没有任何问询」，用标题立刻定稿成功、问询在。
//
// 根因（本轮实测的机制事实）：paper 轨里一篇论文有 1 行 STATE + 4 行 ARTEFACT，而 `render` 写的 **meta 行 body 里
// 也复制了 `id`/`target`/`status`**。`readState` 的「按铸造 id 找」回落分支遍历**整条轨**，于是 id 拼写解析到
// meta 行（`reviews:{}`、没有 consult 台账），`final` 的互审闸与 `consult_state` 的台账都读到了产物行。
// 修法三层：
//   (1) 论文的身份只有 STATE 行（标题以 `|state` 结尾 / kind=paper-state）；铸造 id 的回落与发号都只看 STATE 行。
//   (2) 互审闸与 `advance` 用同一份真相：缓存不足时读 durable `paper-review` 行并自愈缓存；拒绝语同时报
//       `crossReviewers`（缓存读数）与 `reviewsOnDisk`（记录读数）。
//   (3) 文案：`part` 是「每参与者一节」（第二次替换上一节）、`review` 的 `part` 是 `of` 的别名、`render` 的
//       md/tex/meta 进 record track 而 .tex/.pdf 由 compile 落在磁盘；`lean_archive` 的 kind 词表（theorem 以
//       `proof` 归档，回执报 theorem）与 `from`/`file` 是同一个参数、`from` 不是作者。
//
// Run: node tests/vmu-run162-addressing.test.mjs
// Last line: === RUN 162 ADDRESSING: N passed, M failed ===
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const PAPER_KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const EXTRAS = join(REPO, 'vibe-math-vmu', 'kit', 'extras.js')
const PAPER_KIT_SRC = readFileSync(PAPER_KIT, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')
const EXTRAS_SRC = readFileSync(EXTRAS, 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}

const entry = await import(ENTRY)
const roots = []
const TOOL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const call = async (specs, name, args) => {
  const spec = TOOL(specs, name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try { return parse(await spec.execute(args, {})) } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: (e && e.message) || String(e), hint: (e && e.hint) || null,
      requestId: (e && e.requestId) || null, details: (e && e.details) || null }
  }
}

// ── the real assembly, with the LaTeX seam runs 155/156/158/161 use ───────────────────────────────────────────────
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run162-'))
  roots.push(root)
  process.chdir(root)
  const spawn = (spec = {}) => {
    const argv = Array.isArray(spec.argv) ? spec.argv.map(String) : []
    if (argv.includes('--version')) return { done: Promise.resolve({ exitCode: 0, signal: null }), collected: { stdout: { readFrom: () => ({ text: 'xelatex 1.0' }) }, stderr: { readFrom: () => ({ text: '' }) } } }
    const tex = String(argv.filter((a) => a.endsWith('.tex'))[0] || '')
    if (tex) writeFileSync(tex.slice(0, -4) + '.pdf', 'PDF-FAKE-RUN162')
    return { done: Promise.resolve({ exitCode: 0, signal: null }), collected: { stdout: { readFrom: () => ({ text: '' }) }, stderr: { readFrom: () => ({ text: '' }) } } }
  }
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    get(name) { return name === 'subprocess' ? { spawn } : undefined },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  const kernel = handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  return { root, kernel, specs: state.specs }
}

// two members write one part each, review each other, and the flow reaches awaiting-editor
const toAwaitingEditor = async (specs) => {
  const started = await call(specs, 'vibe_v5_paper', { action: 'start', target: 'run162 addressing plate', editor: 'academician', participants: ['r-1', 'r-2'] })
  const id = String((started.started && started.started.id) || (started.paper && started.paper.id) || started.id || '')
  for (const m of ['r-1', 'r-2']) {
    await call(specs, 'vibe_v5_record_proposition', { id: 'rec-162-' + m, statement: 's[' + m + ']: 2+2=4', value: 'claim', member: m, motive: 'evidence for the addressing probe', p: 0.6 })
    await call(specs, 'vibe_v5_paper', { action: 'part', target: id, member: m, part: 'sec-' + m, body: 'section by ' + m, evidence: ['Members/' + m + '/Propos/rec-162-' + m + '.md'] })
  }
  await call(specs, 'vibe_v5_paper', { action: 'advance', target: id, member: 'r-chair' })
  for (const m of ['r-1', 'r-2']) {
    await call(specs, 'vibe_v5_paper', { action: 'review', target: id, member: m, of: m === 'r-1' ? 'r-2' : 'r-1', deliverable: true, notes: 'ok' })
  }
  const adv = await call(specs, 'vibe_v5_paper', { action: 'advance', target: id, member: 'r-chair' })
  return { id, started, advance: adv.advance || {} }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§0 源码口径：论文的身份是 STATE 行；互审闸读记录；文案与回执同一套词')
{
  ok(PAPER_KIT_SRC.includes('const stateRows = () => listPaper()')
    && PAPER_KIT_SRC.includes('/\\|state$/.test(String(r.title'),
    '(1) 只有一个 STATE 行的判据（标题以 |state 结尾 / kind=paper-state）')
  ok(PAPER_KIT_SRC.includes('for (const row of stateRows())') && PAPER_KIT_SRC.includes('for (const cand of stateRows())'),
    '(1) 发号与「按铸造 id 找」都只看 STATE 行（不再让产物行顶替论文）')
  ok(PAPER_KIT_SRC.includes('function reviewRowOf(state, member)')
    && PAPER_KIT_SRC.includes('the durable `paper-review` row for THIS round is the truth'),
    '(2) 互审闸有 durable 行读取器（与 advance 同一份真相）')
  ok(PAPER_KIT_SRC.includes('reviewsOnDisk: onDisk'),
    '(2) 拒绝语同时报缓存读数与记录读数（crossReviewers / reviewsOnDisk）')
  ok(TOOLS_SRC.includes('每参与者一节') && TOOLS_SRC.includes('**替换**他自己上一节'),
    '(3) `part` 文案说清「每参与者一节、第二次替换」（run 10 丢了两次正文）')
  ok(TOOLS_SRC.includes('`review` 的 `part` 是 `of` 的别名'),
    '(3) `review` 的 `part` 是 `of` 的别名（传章节名不绑定章节）')
  ok(TOOLS_SRC.includes('render 把 md/tex/meta 写进记录区'), '(3) `render` 与 `compile` 的产物说清不是同一件事')
  ok(TOOLS_SRC.includes('a THEOREM goes in as kind:"proof"') && EXTRAS_SRC.includes('kindRequested: str(args.kind)'),
    '(3) `lean_archive` 的 kind 词表与它自己的回执同一套词，且回执记下请求的单词')
  ok(EXTRAS_SRC.includes('the SAME parameter as `file`') || TOOLS_SRC.includes('the SAME parameter as `file`'),
    '(3) `from`/`file` 在说明里成对写明是同一个参数（`from` 不是作者）')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 真回合：产物行存在之后，用铸造 id 读到的仍是论文自己的 STATE（run 10 的 id 拼写缺陷）')
{
  const { specs } = await boot({ 'vmu.paper.officeConsult': 'off' })
  const { id, advance } = await toAwaitingEditor(specs)
  ok(id !== '' && /^paper-p[0-9]+$/.test(id), '(1) 论文有铸造 id', id)
  ok(String(advance.to || '') === 'awaiting-editor', '(1) 到达 awaiting-editor', advance)
  // render writes the md/tex/meta rows — the meta body copies id/target/status, which is what id addressing used to hit
  const rendered = await call(specs, 'vibe_v5_paper', { action: 'render', target: id })
  ok(rendered.ok === true, '(1) 渲染成功（meta 行已写入）', rendered.ok === false ? rendered : undefined)
  const byTitle = await call(specs, 'vibe_v5_paper', { action: 'status', target: 'run162 addressing plate' })
  const byId = await call(specs, 'vibe_v5_paper', { action: 'status', target: id })
  ok(byId.ok === true && byTitle.ok === true, '(1) 两种拼写都能读到论文', { byId: byId.ok, byTitle: byTitle.ok })
  ok(byId.paper && String(byId.paper.id) === id, '(1) id 拼写读到的是论文自己（id 一致）', byId.paper && byId.paper.id)
  // non-vacuous: the STATE body holds one review per participant (two), the meta artefact body holds none.
  ok(byId.paper && byId.paper.reviews && Object.keys(byId.paper.reviews).length === 2,
    '(1) id 拼写读到 STATE 的互审缓存（2 条），不是 meta 产物行的空对象', byId.paper && byId.paper.reviews)
  ok(byId.paper && String(byId.paper.status) === 'awaiting-editor' && String(byId.paper.status) === String((byTitle.paper || {}).status),
    '(1) 两种拼写报同一个阶段（stage/status 一致）', { byId: byId.paper && byId.paper.status, byTitle: byTitle.paper && byTitle.paper.status })
  const fin = await call(specs, 'vibe_v5_paper', { action: 'final', target: id, member: 'r-chair', decision: 'deliverable', conclusion: 'addressing probe' })
  ok(fin.ok === true, '(1) 用铸造 id 定稿成功（run 10 在这里被假阴性拒）', fin.ok === false ? fin : undefined)
  const inner = fin.final || {}
  ok(inner.finalized === true, '(1) 回执 finalized:true', inner.finalized)
  ok(inner.pdf && inner.pdf.produced === true, '(1) PDF 真的产出了', inner.pdf && inner.pdf.produced)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 真回合：问询台账在 id 拼写下也读得到（run 10 的 consult_state 缺陷）')
{
  const { specs } = await boot({})
  const { id } = await toAwaitingEditor(specs)
  const first = await call(specs, 'vibe_v5_paper', { action: 'final', target: id, member: 'r-chair', decision: 'deliverable', conclusion: 'needs the office first' })
  ok(first.ok === false && String(first.code) === 'VMU_OFFICE_CONSULT_REQUIRED', '(2) 默认策略下定稿被所办问询拦住', { code: first.code, message: first.message })
  const opened = String((first.details && first.details.requestId) || first.requestId || '')
  const byId = await call(specs, 'vibe_v5_paper', { action: 'consult_state', target: id })
  const byTitle = await call(specs, 'vibe_v5_paper', { action: 'consult_state', target: 'run162 addressing plate' })
  ok(byId.ok === true && byId.consult && byId.consult.counters && Number(byId.consult.counters.opened) === 1,
    '(2) id 拼写读到 1 条已开问询（run 10 这里是 0）', byId.consult && byId.consult.counters)
  ok(Array.isArray(byId.consult && byId.consult.requests) && byId.consult.requests.length === 1,
    '(2) id 拼写读到那条 request 行', byId.consult && byId.consult.requests)
  ok(JSON.stringify(byId.consult && byId.consult.counters) === JSON.stringify(byTitle.consult && byTitle.consult.counters),
    '(2) 两种拼写的台账计数一致', { byId: byId.consult && byId.consult.counters, byTitle: byTitle.consult && byTitle.consult.counters })
  ok(opened === '' || (byId.consult && byId.consult.requests[0] && String(byId.consult.requests[0].id) === opened),
    '(2) 定稿拒绝语给的 requestId 就是台账里那条', { opened, seen: byId.consult && byId.consult.requests[0] && byId.consult.requests[0].id })
  const answered = await call(specs, 'vibe_v5_paper', { action: 'consult', target: id, member: 'office', answer: 'office checked the body against the verified track' })
  ok(answered.ok === true, '(2) 所办用 id 拼写答复成功', answered.ok === false ? answered : undefined)
  const fin = await call(specs, 'vibe_v5_paper', { action: 'final', target: id, member: 'r-chair', decision: 'deliverable', conclusion: 'office answered' })
  ok(fin.ok === true && (fin.final || {}).finalized === true, '(2) 答完用 id 拼写真的定稿', fin.ok === false ? fin : undefined)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 缓存丢掉时，互审闸读 durable 行（两个门不许对同一轮说两种话）')
{
  const { kernel, specs } = await boot({ 'vmu.paper.officeConsult': 'off' })
  const { id } = await toAwaitingEditor(specs)
  // the run-10 shape: the durable rows are on disk and the state's cache lost them
  const got = kernel.records.get({ id: (await call(specs, 'vibe_v5_paper', { action: 'status', target: id })).paper.stateRecordId })
  const full = got && got.record ? got.record : got
  const body = JSON.parse(String(full.body))
  body.reviews = {}
  kernel.records.put({ id: full.id, track: String(full.track), kind: String(full.kind), title: String(full.title), body: JSON.stringify(body), by: 'r-chair' })
  const stale = await call(specs, 'vibe_v5_paper', { action: 'status', target: id })
  ok(stale.ok === true && stale.paper && Object.keys(stale.paper.reviews || {}).length === 0, '(3) 缓存已被清空（模拟丢写）', stale.paper && stale.paper.reviews)
  const fin = await call(specs, 'vibe_v5_paper', { action: 'final', target: id, member: 'r-chair', decision: 'deliverable', conclusion: 'durable reviews' })
  ok(fin.ok === true && (fin.final || {}).finalized === true,
    '(3) 缓存空、记录里有两份互审 ⇒ 定稿仍成立（run 10 的「0 位互审」不再可能）', fin.ok === false ? fin : undefined)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 lean_archive 的词表：一次说清 theorem 怎么归档')
{
  const { specs, root } = await boot({})
  const bad = await call(specs, 'vibe_v5_lean_archive', { kind: 'theorem', name: 'run162_thm', file: 'Formal/run162.lean' })
  ok(bad.ok === false && String(bad.code) === 'VMU_INVALID_ARGUMENT', '(4) kind:"theorem" 被具名拒', { code: bad.code })
  // the enum refusal lists the legal words; the parameter's own description is where「定理走 proof」is written
  ok(/def, lemma, proof, blocked/.test(String(bad.message || '')), '(4) 合法词表在拒绝语里', bad.message)
  ok(/kind:"proof"/.test(TOOLS_SRC) && /mappedKind/.test(TOOLS_SRC),
    '(4) 形参说明写明「定理以 kind:"proof" 归档、回执随后报 theorem」')
  // and the word the library reports back is its own: a proof lands as the library's `theorem` face kind
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(root, 'Formal'), { recursive: true })
  writeFileSync(join(root, 'Formal', 'run162_thm.lean'), 'theorem run162_thm : True := trivial\n')
  const good = await call(specs, 'vibe_v5_lean_archive', { kind: 'proof', name: 'run162_thm', from: 'Formal/run162_thm.lean' })
  ok(good.ok === true, '(4) kind:"proof" 归档成功', good.ok === false ? good : undefined)
  ok(String(good.kindRequested || '') === 'proof' && String(good.kind || '') === 'theorem' && String(good.mappedKind || good.kind || '') === 'theorem',
    '(4) 回执同时报请求词 proof 与库面词 theorem（run 10 只报 theorem 让人以为词表是 theorem）',
    { kindRequested: good.kindRequested, kind: good.kind, mappedKind: good.mappedKind })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ★★ RUN 163（live run 11, rec-297）改写了这一节的前提：人数闸的分母不再是「本场名册 ∩ 可投票席位」，而是
// **在册可投票席位**（`quorumFloorSource:"universe"` 时 `universeSource:"institute"`）。于是「主席少邀几个人就把门槛
// 降下来」不再成立，`VMU_MEETING_QUORUM_LOST` 也从「按算术不可观测」变成**真的能打出来**——这一节因此同时钉两件事：
// (a) 完整的名册 + 全员署名时门槛成立且回执自己说清分母是全院；(b) 把名册收窄到 1 位成员时，人数闸具名拒 = 负向可观测。
console.log('§5 人数闸（规则 47）：分母是在册可投票席位（少邀人不能降门槛），负向 VMU_MEETING_QUORUM_LOST 真的可达')
{
  const { specs } = await boot({})
  const conv = await call(specs, 'vibe_v5_meeting', { action: 'convene', member: 'r-chair', agenda: 'quorum negative', members: ['r-1', 'r-2'] })
  const meetId = String(conv.meeting || '')
  ok(conv.ok === true && meetId !== '', '(5) 辩论会真的开出来了', conv.ok === false ? conv : undefined)
  const st = await call(specs, 'vibe_vmu_meeting', { action: 'status', id: meetId })
  ok(st.ok === true && st.quorum && typeof st.quorum === 'object', '(5) status 报 quorum 段', st.ok === false ? st : undefined)
  await call(specs, 'vibe_v5_record_proposition', { id: 'rec-q-162', statement: 'quorum probe', value: 'claim', member: 'r-1', motive: 'negative quorum evidence', p: 0.6 })
  // ONE of the two debaters signs: the completeness gate speaks first — that is the ordering this receipt must show.
  const one = await call(specs, 'vibe_v5_verdict_final', { meeting: meetId, proposition_id: 'rec-q-162', owner: 'r-1', verdicts: [{ member: 'r-1', p: 1, reason: 'only one voice' }] })
  ok(one.ok === false && String(one.code) === 'VMU_STATE' && /missing 1 of the 2 member\(s\) who debated/.test(String(one.message || '')),
    '(5) 只一位成员署名 ⇒ 完整性闸先报「缺哪位辩论成员」（不是人数闸）', { code: one.code, message: one.message })
  // both debaters sign: the floor is met, and the receipt says WHY the refusal branch is arithmetically unreachable
  const both = await call(specs, 'vibe_v5_verdict_final', { meeting: meetId, proposition_id: 'rec-q-162', owner: 'r-1', verdicts: [{ member: 'r-1', p: 1, reason: 'a' }, { member: 'r-2', p: 1, reason: 'b' }] })
  ok(both.ok === true, '(5) 两位都署名 ⇒ 裁决成立（人数闸不会拦）', both.ok === false ? both : undefined)
  const gate = (both.floor || {}).gate || {}
  ok(Number(gate.required) > 0 && Number(gate.signed) >= Number(gate.required),
    '(5) 回执的 floor.gate 给出 required/signed（签名数 ≥ 门槛）', gate)
  ok(gate.vacuous === true && typeof gate.bitesWhen === 'string' && gate.bitesWhen.length > 0,
    '(5) 回执自己说这一次的门槛是 vacuous，并写明它在什么条件下才咬人', gate)
  ok(/INSTITUTE's voter seats/.test(String(gate.bitesWhen || '')) && /does NOT lower it/.test(String(gate.bitesWhen || '')),
    '(5) bitesWhen 说清分母是「全院的在册可投票席位」，并明说少邀人不会把门槛降下来（规则 47 的分母口径）', gate.bitesWhen)
  ok(String(st.quorum.voteFloor.universeSource) === 'institute' && Number(st.quorum.voteFloor.eligibleUniverse) === 3
    && Number(st.quorum.voteFloor.effective) === 3,
    '(5) status.quorum.voteFloor 报表决闸 universeSource:"institute" / eligibleUniverse:3（院士 + 两位常驻）/ effective:3',
    st.quorum && st.quorum.voteFloor)
  // ★ 负向现在真的可达：同一所里再开一场只邀 1 位成员的辩论，门槛仍是全院的 3，而签署最多 2（1 位成员 + 主席）。
  const convNarrow = await call(specs, 'vibe_v5_meeting', { action: 'convene', member: 'r-chair', agenda: 'narrow quorum', members: ['r-1'] })
  const narrowId = String(convNarrow.meeting || '')
  ok(convNarrow.ok === true && narrowId !== '', '(5) 只邀一位成员的辩论会开得起来（收窄是允许的，门槛不跟着降）', convNarrow.ok === false ? convNarrow : undefined)
  const stNarrow = await call(specs, 'vibe_vmu_meeting', { action: 'status', id: narrowId })
  ok(stNarrow.ok === true
    && Number(stNarrow.quorum.voteFloor.effective) === 3
    && String(stNarrow.quorum.voteFloor.universeSource) === 'institute'
    && Number(stNarrow.quorum.voteFloor.invitedEligible) === 1
    && Number(stNarrow.quorum.roster) === 1,
    '(5) 收窄名册后**表决闸** voteFloor.effective 仍是 3（roster 1 / invitedEligible 1）—— 门槛是院的属性，不是邀请列表的属性',
    stNarrow.quorum && stNarrow.quorum.voteFloor)
  await call(specs, 'vibe_v5_record_proposition', { id: 'rec-q-162b', statement: 'narrow quorum probe', value: 'claim', member: 'r-1', motive: 'negative quorum evidence', p: 0.6 })
  const lost = await call(specs, 'vibe_v5_verdict_final', { meeting: narrowId, proposition_id: 'rec-q-162b', owner: 'r-1', verdicts: [{ member: 'r-1', p: 1, reason: 'only voice in a narrow meeting' }] })
  ok(lost.ok === false && String(lost.code) === 'VMU_MEETING_QUORUM_LOST' && /signed by 2 of the 3 seat/.test(String(lost.message || '')),
    '(5) ★★ 负向可达：只邀 1 人时裁决被 VMU_MEETING_QUORUM_LOST 具名拒（签 2 / 需 3），规则 47 的下限真的是一条下限', { code: lost.code, message: String(lost.message || '').slice(0, 200) })
  const escapedNarrow = await call(specs, 'vibe_v5_verdict_final', {
    meeting: narrowId, proposition_id: 'rec-q-162b', owner: 'r-1', partial: true, why: '第三席今日外出，主席决定先出数并留档',
    verdicts: [{ member: 'r-1', p: 1, reason: 'only voice in a narrow meeting' }],
  })
  ok(escapedNarrow.ok === true && Number((escapedNarrow.floor || {}).satisfiedBy === true) === 0 && String(((escapedNarrow.floor || {}).gate || {}).escapedBy) === 'partial',
    '(5) 例外仍是例外：partial:true + why 时裁定成功、回执写 satisfiedBy:false 与 escapedBy:"partial"（不静默）',
    { satisfiedBy: (escapedNarrow.floor || {}).satisfiedBy, escapedBy: ((escapedNarrow.floor || {}).gate || {}).escapedBy })
}

console.log('')
console.log('=== RUN 162 ADDRESSING: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.log('FAILED :: ' + f); process.exit(1) }
