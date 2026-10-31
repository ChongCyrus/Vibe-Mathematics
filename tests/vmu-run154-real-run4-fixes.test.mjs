#!/usr/bin/env node
// tests/vmu-run154-real-run4-fixes.test.mjs — ★ RUN 154: 第四次真机跑（续跑）暴露的六条缺陷。
//
// 真机证据（run 4，jsonl `full-1031-044258.jsonl`，代理报告 `FEEDBACK3.md` / `SIM-REPORT3.md`）：
//   H1 互审两人都交 deliverable:true，回执与落盘卡都是 true，`advance` 却把其中一人记成 refuser
//      （`{"to":"writing","round":2,"refusers":["r-1"]}`，纸面 reviews:{}，detail 只写「未说明」）——
//      `state.reviews` 是**缓存**，磁盘上的 `paper-review` 行才是事实：缓存丢一条就把已交评审当成拒绝。
//   H2 轮数上限与内容门互锁：论文停在 awaiting-editor，`final{decision:"deliverable"}` 被内容门拒、
//      `final{decision:"revise"}` 被「已到 3 轮上限」拒，而 `part` 只在 writing 可写 ⇒ 这篇论文变成死数据。
//   H2b `vibe_v5_set { key: "vmu.paper.maxRounds", value: 6 }` 回执「已生效、不用重启」，机制仍按 3 拒：
//      `maxRounds` 是在装配时捕获的**常量**。
//   H3 回执自报 `"id":"paper-p5"` 不能用来寻址：`target:"paper-p5"` ⇒ `no paper "paper-p5" exists`。
//   G10 论文面自主编译成功（85 839 B PDF），但 compile 回执没有 `argv`/`produced`，`final` 的 pdf 块
//      还自相矛盾：`"missing":["pdf"]` 与 `"pdf":{"ok":true}` 同时出现。
//   G9 `VMU_OFFICE_CONSULT_REQUIRED` 的回执里没有 `target` 字段，答复得先撞一次「no target was given」。
//
// 修法（全部落在机制/句子的所有者上）：
//   `vibe-math-vmu/kit/paper.js`  readState 接受 `paper-<x>` 拼写（H3）
//                                advance 的评审判定先读磁盘 `paper-review` 行（本轮），命中即自愈缓存（H1）
//                                MAX_ROUNDS 常量 → `roundsCap()`（每次闸点现读）+ `REPAIR_ROUNDS` 修复轮（H2/H2b 下游）
//                                consultGate 三支拒绝都带 `target`/`paperId`（G9）
//                                compilePdf 成功回执带 argv/outDir/sourceName（G10）
//                                final 的 `missing` 在编译之后重算，不再与 `pdf.ok:true` 同时出现（G10）
//   `vibe-math-vmu/packs/v5r/paper.js`    maxRounds 改成**读取器**（每次闸点现读 `vmu.paper.maxRounds`）（H2b）
//   `vibe-math-vmu/packs/v5r/tools.js`    compile 回执投影带 produced/argv/outDir/sourceName（G10）
//
// RULE E：每个「含/不含」的断言先证明被断言的对象真的存在（非空），空对空的比较不算证据。
//
// Run: node tests/vmu-run154-real-run4-fixes.test.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')
const KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const PACK_PAPER = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const KIT_SRC = readFileSync(KIT, 'utf8')
const PACK_PAPER_SRC = readFileSync(PACK_PAPER, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}

const pack = await import(pathToFileURL(PACK_PAPER).href)

/** A minimal records/members/settings kernel. `rows` is exposed so a test can simulate a lost CACHE WRITE (H1). */
function makeKernel(settings, roster) {
  const rows = new Map()
  let seq = 0
  const kernel = {
    settingsSnapshot: () => ({ ...settings }),
    members: { roster: () => roster.slice() },
    records: {
      put(r) {
        const id = r.id || ('row-' + (++seq))
        const prev = rows.get(id) || {}
        seq += 1
        const row = { ...prev, ...r, id, rev: (prev.rev || 0) + 1, updatedAt: seq, fingerprint: 'fp-' + id + '-' + seq }
        rows.set(id, row)
        return { id, rev: row.rev, fingerprint: row.fingerprint }
      },
      get({ id }) { return { record: rows.get(id) || null } },
      list({ track, limit } = {}) {
        const items = [...rows.values()].filter((r) => !track || r.track === track)
        return { items: typeof limit === 'number' ? items.slice(0, limit) : items }
      },
    },
  }
  return { kernel, rows }
}

const ROSTER = [
  { id: 'acad', slot: 'chair' },
  { id: 'r-1', slot: 'member' },
  { id: 'r-2', slot: 'member' },
  { id: 'office', slot: 'office' },
]
const BASE = { 'vmu.records.tracks': ['paper'], 'vmu.paper.officeConsult': 'off' }
const boot = (extra = {}, latex = null) => {
  const settings = { ...BASE, ...extra }
  const { kernel, rows } = makeKernel(settings, ROSTER)
  if (latex) kernel.latex = latex
  const flow = pack.createPaperSubsystem({ kernel, clock: () => 1 })
  return { flow, kernel, rows, settings }
}
const refusalOf = async (fn) => { try { await fn(); return null } catch (e) { return e } }
/** `flow.state()` returns `{ state, row }` (the kit's read snapshot), so tests read `.state`. */
const stateOf = (flow, T) => { const got = flow.state(T); return got && got.state ? got.state : null }

/** Write one part per participant and move the paper into cross-review. */
function toReviewing(flow, T, { mids = ['r-1', 'r-2'] } = {}) {
  flow.start({ target: T, participants: mids })
  for (const m of mids) flow.recordPart({ target: T, member: m, title: m + ' 的标题', solution: m + ' 的解法' })
  return flow.advance({ target: T })
}
/** Simulate "the state snapshot lost the reviews cache while the review ROWS stayed on disk". */
function dropReviewsCache(rows, T) {
  const hit = [...rows.values()].filter((r) => r.kind === 'paper-state' && String(r.title).includes(T))[0] || null
  if (!hit) return false
  let body = null
  try { body = JSON.parse(String(hit.body)) } catch { return false }
  body.reviews = {}
  rows.set(hit.id, { ...hit, body: JSON.stringify(body), rev: (hit.rev || 0) + 1 })
  return true
}
/** One review round ending in disagreement (one deliverable, one not). Enters reviewing first when needed. */
function oneRefusingRound(flow, T) {
  // writing → reviewing; when the paper is ALREADY reviewing, advance() would EVALUATE the round instead of moving it.
  if (stateOf(flow, T).status === 'writing') flow.advance({ target: T })
  flow.recordReview({ target: T, member: 'r-1', deliverable: true, comments: '可交付' })
  flow.recordReview({ target: T, member: 'r-2', deliverable: false, comments: '还差证据' })
  return flow.advance({ target: T })
}
/** From writing: part → reviewing → both deliverable → advance (the paper is back at awaiting-editor). */
function backToAwaiting(flow, T) {
  flow.recordPart({ target: T, member: 'r-1', title: '修订后的标题', solution: '修订后的解法' })
  flow.advance({ target: T })
  flow.recordReview({ target: T, member: 'r-1', deliverable: true, comments: '可交付' })
  flow.recordReview({ target: T, member: 'r-2', deliverable: true, comments: '可交付' })
  return flow.advance({ target: T })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§0 源码口径：RUN 154 的六处机制改动都在所有者上')
{
  ok(KIT_SRC.includes('RUN 154'), 'kit/paper.js 带 RUN 154 注记')
  ok(KIT_SRC.includes('let word = str(target)') && KIT_SRC.includes('/^paper-/'), 'H3：readState 认 `paper-<x>` 拼写')
  ok(KIT_SRC.includes('const readReview = (member) =>') && KIT_SRC.includes("source: 'durable'"), 'H1：advance 有磁盘评审行的回读（durable 来源）')
  ok(KIT_SRC.includes('const roundsCap = () =>') && KIT_SRC.includes('const REPAIR_ROUNDS = 2'), 'H2：轮数上限是现读的函数 + 修复轮预算')
  ok(!KIT_SRC.includes('MAX_ROUNDS = maxRounds'), 'H2b：装配期的 MAX_ROUNDS 常量已不在（改成读取器）')
  ok(KIT_SRC.includes('const missingAfter = '), 'G10：final 的 missing 在编译后重算')
  ok(KIT_SRC.includes('argv: Array.isArray(r.argv) ? r.argv.slice(0, 16) : []'), 'G10：编译成功回执带 argv')
  ok((KIT_SRC.match(/target: str\(state\.target\), paperId: str\(state\.id\)/g) || []).length >= 3, 'G9：consultGate 三支都带 target/paperId')
  ok(PACK_PAPER_SRC.includes('maxRounds: () => {') && PACK_PAPER_SRC.includes("'vmu.paper.maxRounds'"), 'H2b：pack 传的是读取器而不是快照')
  // ★ RUN 155 (audit problem 2) replaced the hand-written projection with ONE shared block: produced/argv/outDir/
  // sourceName now come from `projectPdfBlock` on success AND failure (see tests/vmu-run155-audit-fixes.test.mjs §2,
  // which asserts the real receipt values this source pin can only gesture at).
  ok(/compiled: projectPdfBlock\(compiled, target\)/.test(TOOLS_SRC)
    && /compiled: projectPdfBlock\(\{/.test(TOOLS_SRC)
    && TOOLS_SRC.includes('function projectPdfBlock(pdf, target)'), '§ G10：compile 回执（成功与失败）都走同一个 projectPdfBlock')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 H3：回执自报的 id（paper-<x>）与动作地址（<x>）指向同一篇论文')
{
  const { flow } = boot()
  const T = 'p5'
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  const byTarget = stateOf(flow, T)
  ok(!!byTarget && byTarget.id === 'paper-p5', '前提：论文 id 是 paper-p5', byTarget && byTarget.id)
  const byId = stateOf(flow, 'paper-p5')
  ok(!!byId && byId.target === T, 'H3：`state("paper-p5")` 读到同一篇论文（不再 no paper exists）', byId && byId.target)
  ok(!!byId && !!byTarget && byId.createdAt === byTarget.createdAt, 'H3：两种拼写读到同一份 state', byId && { a: byId.createdAt, b: byTarget && byTarget.createdAt })
  // 真正不存在的论文仍然读不到（修复不能把每个错字都变成命中）
  ok(flow.state('paper-p9') === null, 'H3：确实不存在的 paper-p9 仍读不到（修复没把错字变成命中）')
  const gone = flow.state('nope')
  ok(gone === null, 'H3：普通错字同样读不到')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 H1：缓存丢了评审条目，磁盘上的评审行仍然作数（并且只有本轮的行作数）')
{
  const { flow, rows } = boot()
  const T = 'h1-缓存'
  toReviewing(flow, T)
  flow.recordReview({ target: T, member: 'r-1', deliverable: true, comments: '可交付' })
  flow.recordReview({ target: T, member: 'r-2', deliverable: true, comments: '可交付' })
  ok(dropReviewsCache(rows, T), '前提：把 state 里的 reviews 缓存清空（模拟 run 4 的丢写）')
  const moved = flow.advance({ target: T })
  ok(moved && moved.to === 'awaiting-editor' && moved.unanimous === true, 'H1：缓存为空时 advance 仍判 unanimous（评审行在磁盘上）', moved)
  ok(Array.isArray(moved.reviewsRead) && moved.reviewsRead.length > 0, 'H1：回执带上本次读到的每条评审（reviewsRead）', moved && moved.reviewsRead)
  const durable = ((moved || {}).reviewsRead || []).filter((r) => r.source === 'durable')
  ok(durable.length > 0, 'H1：至少一条来自磁盘行（source:"durable"）', durable)
  ok(((moved || {}).reviewsRead || []).every((r) => r.deliverable === true), 'H1：两条都被读成 deliverable（没有幽灵 refuser）', moved && moved.reviewsRead)
  const healed = stateOf(flow, T)
  ok(!!healed && Object.keys(healed.reviews || {}).length === 2, 'H1：缓存被自愈并落盘（两条都回到 state.reviews）', healed && Object.keys(healed.reviews || {}))

  // 反向：上一轮的评审行不能顶替本轮缺席
  const { flow: f2, rows: rows2 } = boot()
  const T2 = 'h1-旧轮'
  toReviewing(f2, T2)
  const back = oneRefusingRound(f2, T2)
  ok(back && back.to === 'writing', '前提：第一轮有分歧 ⇒ 退回 writing', back && back.to)
  dropReviewsCache(rows2, T2)
  f2.advance({ target: T2 })                       // round 2, reviewing
  f2.recordReview({ target: T2, member: 'r-2', deliverable: true, comments: '第二轮可交付' })
  dropReviewsCache(rows2, T2)
  const moved2 = f2.advance({ target: T2 })
  ok(moved2 && Array.isArray(moved2.refusers) && moved2.refusers.length === 1 && moved2.refusers[0] === 'r-1',
    'H1：只有本轮的评审行作数——上一轮 r-1 的行不能让他在第二轮算已交', moved2 && moved2.refusers)
  const st = stateOf(f2, T2)
  const why = String((((st || {}).disagreement || [])[((st || {}).disagreement || []).length - 1] || {}).detail || '')
  ok(why.length > 0, 'H1：分歧行带 detail', why)
  ok(!why.includes('未说明'), 'H1：分歧行不再写「未说明」（写清读到了什么）', why)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 H2：到了互审轮数上限，定稿代表仍要求修订 ⇒ 有界的修复轮，而不是死数据')
{
  const { flow } = boot({ 'vmu.paper.maxRounds': 1 })
  const T = 'h2-死锁'
  toReviewing(flow, T)
  const capped = await Promise.resolve(oneRefusingRound(flow, T))
  ok(capped && capped.capped === true && capped.to === 'awaiting-editor', '前提：上限=1，分歧后停在 awaiting-editor（run 4 的死锁位置）', capped && { to: capped.to, capped: capped.capped, round: capped.round })
  const st = stateOf(flow, T)
  ok(st && st.status === 'awaiting-editor' && st.round >= 1, '前提：状态确实是 awaiting-editor', st && { status: st.status, round: st.round })
  const e1 = await refusalOf(async () => flow.recordFinal({ target: T, member: 'acad', decision: 'revise', note: '补一条已验证结论' }))
  ok(e1 === null, 'H2：此刻 `final{decision:"revise"}` 不再被「已到轮数上限」拒', e1 && { code: e1.code, message: e1.message })
  const st2 = stateOf(flow, T)
  ok(st2 && st2.status === 'writing', 'H2：论文真的回到 writing（part 又能写了）', st2 && st2.status)
  ok(st2 && Number(st2.repairs || 0) === 1, 'H2：修复轮被记账（repairs=1），不会被当成新的互审轮', st2 && st2.repairs)
  let partOk = null
  try { partOk = flow.recordPart({ target: T, member: 'r-1', title: '修复后的标题', solution: '补上正文' }) } catch (e) { partOk = e }
  ok(partOk && partOk.ok === true, 'H2：修复轮里 part 真的能写进正文', partOk && (partOk.code || partOk.recorded))

  // 第二次修复轮
  const back = backToAwaiting(flow, T)
  ok(back && back.to === 'awaiting-editor', '前提：第二次修复轮前论文回到 awaiting-editor', back && back.to)
  const e2 = await refusalOf(async () => flow.recordFinal({ target: T, member: 'acad', decision: 'revise', note: '再补一条' }))
  ok(e2 === null, 'H2：第二次修复轮仍被允许（预算=2）', e2 && e2.code)
  const st3 = stateOf(flow, T)
  ok(st3 && Number(st3.repairs || 0) === 2, 'H2：repairs 记到 2', st3 && st3.repairs)

  // 预算用完：拒绝语必须点名真实存在的出口
  const back2 = backToAwaiting(flow, T)
  ok(back2 && back2.to === 'awaiting-editor', '前提：第三次 revise 前论文回到 awaiting-editor', back2 && back2.to)
  const e3 = await refusalOf(async () => flow.recordFinal({ target: T, member: 'acad', decision: 'revise', note: '第三次' }))
  ok(e3 !== null, 'H2：修复轮预算用完后再 revise 被具名拒（不编造成功）', e3 && e3.code)
  if (e3 !== null) {
    const hint = String(e3.hint || '')
    ok(hint.length > 0, 'H2：拒绝带 hint（非空）', hint)
    ok(hint.includes('vmu.paper.maxRounds') && hint.includes('part'), 'H2：拒绝语点名真实出口（提高 maxRounds / 补 part）', hint)
  }

  // ★★ RUN 157 (audit26 item 6): 这一节以前只证到「修复轮被允许」，而 §255.4 写的是「并最终定稿」。
  // 现在把那一步真的走完：到了上限的论文，在修复轮里补齐正文与互审后，**能真的定稿并做出 PDF**。
  const { flow: f2, kernel: k2 } = boot({ 'vmu.paper.maxRounds': 1 })
  const T2 = 'h2-到上限仍能定稿'
  toReviewing(f2, T2)
  const r1 = oneRefusingRound(f2, T2)
  ok(r1 && r1.capped === true, '前提：上限=1，第一轮就封顶', r1 && { capped: r1.capped, round: r1.round })
  const rr = await refusalOf(async () => f2.recordFinal({ target: T2, member: 'acad', decision: 'revise', note: '先走一个修复轮' }))
  ok(rr === null, '前提：修复轮被允许（回到 writing）', rr && rr.code)
  // 证据卡（quality gate 要能解析到的真实卡片）
  k2.records.put({ id: 'rec-h2ev', track: 'propositions', kind: 'proposition', title: '定稿证据', body: '- statement：x\n- value：0.9' })
  for (const m of ['r-1', 'r-2']) f2.recordPart({ target: T2, member: m, title: m + ' 修复后', solution: m + ' 补齐后的解法', evidence: ['Members/' + m + '/Propos/rec-h2ev.md'] })
  f2.advance({ target: T2 })
  f2.recordReview({ target: T2, member: 'r-1', deliverable: true, comments: '可交付' })
  f2.recordReview({ target: T2, member: 'r-2', deliverable: true, comments: '可交付' })
  const adv = f2.advance({ target: T2 })
  ok(adv && adv.to === 'awaiting-editor', '前提：修复后补齐正文与互审，回到 awaiting-editor', adv && adv.to)
  const fakeLatex = { check: async () => ({ ok: true, engine: 'xelatex', pdfPath: 'D:/_tmp/p/p.pdf', pdfBytes: 1234,
    argv: ['-interaction=nonstopmode', '-output-directory=D:/_tmp/p', 'D:/_tmp/p/p.tex'], outDir: 'D:/_tmp/p',
    tried: [{ engine: 'xelatex', phase: 'compile', exitCode: 0 }], elapsedMs: 1 }) }
  k2.latex = fakeLatex
  let fin = null
  try { fin = await f2.recordFinal({ target: T2, member: 'acad', decision: 'deliverable', conclusion: '到上限后完成' }) } catch (e) { fin = e }
  ok(fin && fin.ok === true && fin.finalized === true, 'H2：到过上限、走完修复轮的论文真的能定稿（不再是死数据）', fin && { ok: fin.ok, finalized: fin.finalized, code: fin.code, message: fin.message })
  const st4 = stateOf(f2, T2)
  ok(st4 && st4.status === 'finalized', 'H2：状态真的到了 finalized', st4 && st4.status)
  const pdf = fin && fin.pdf ? fin.pdf : null
  ok(pdf && pdf.ok === true && pdf.produced === true && Number(pdf.pdfBytes) === 1234, 'H2：定稿顺带把 PDF 做出来（produced=true）', pdf && { produced: pdf.produced, bytes: pdf.pdfBytes })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 H2b：`vmu.paper.maxRounds` 是现读的——改了以后下一次调用就按新值')
{
  const { flow, settings } = boot({ 'vmu.paper.maxRounds': 1 })
  const T = 'h2b-现读'
  toReviewing(flow, T)
  const capped = oneRefusingRound(flow, T)
  ok(capped && capped.capped === true && capped.round === 1, '前提：上限=1，第一次互审分歧就封顶（round=1）', capped && { capped: capped.capped, round: capped.round })
  settings['vmu.paper.maxRounds'] = 9
  const moved = await refusalOf(async () => flow.recordFinal({ target: T, member: 'acad', decision: 'revise', note: '按新上限继续' }))
  ok(moved === null, 'H2b：改设置后 revise 立刻按新上限执行（不再被旧值拒）', moved && moved.code)
  const st = stateOf(flow, T)
  ok(st && st.round === 2 && st.status === 'writing', 'H2b：round 前进到 2（1 < 9 ⇒ 正常修订轮，不是修复轮）', st && { round: st.round, status: st.status })
  ok(st && Number(st.repairs || 0) === 0, 'H2b：正常修订轮不烧修复预算', st && st.repairs)
  // 0 / 缺省 ⇒ 回退到声明的 PAPER_MAX_ROUNDS（3），而不是「无限」
  const { flow: f0 } = boot({ 'vmu.paper.maxRounds': 0 })
  const T0 = 'h2b-零'
  toReviewing(f0, T0)
  const r1 = oneRefusingRound(f0, T0)
  const r2 = oneRefusingRound(f0, T0)
  const r3 = oneRefusingRound(f0, T0)
  ok(r1 && r1.moved === true && r2 && r2.moved === true, '前提：0 不会让流程在第一次就封顶', { r1: r1 && r1.to, r2: r2 && r2.to })
  ok(r3 && r3.capped === true && r3.round === 3, 'H2b：设置=0 时回退到声明上限 3（不是无限）', r3 && { capped: r3.capped, round: r3.round })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§5 G9：`VMU_OFFICE_CONSULT_REQUIRED` 的回执带 `target`（答复不用先撞一次「no target was given」）')
{
  const { flow, kernel } = boot({ 'vmu.paper.officeConsult': 'required' })
  const T = 'g9-问询'
  // The consult gate sits BEHIND the pack's quality pre-gate (RUN 152: the same check runs before recordFinal), so the
  // parts have to carry evidence the records face can resolve — otherwise the test measures the quality gate, not G9.
  kernel.records.put({ id: 'rec-ev1', track: 'propositions', kind: 'proposition', title: '证据卡', body: '- statement：x\n- value：0.9' })
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) flow.recordPart({ target: T, member: m, title: m + ' 的标题', solution: m + ' 的解法', evidence: ['Members/' + m + '/Propos/rec-ev1.md'] })
  flow.advance({ target: T })
  flow.recordReview({ target: T, member: 'r-1', deliverable: true, comments: '可交付' })
  flow.recordReview({ target: T, member: 'r-2', deliverable: true, comments: '可交付' })
  flow.advance({ target: T })
  const e = await refusalOf(async () => flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' }))
  ok(!!e && e.code === 'VMU_OFFICE_CONSULT_REQUIRED', '前提：asking 阶段被 OFFICE_CONSULT_REQUIRED 拒', e && e.code)
  ok(!!e && e.target === T, 'G9：拒绝带上 `target`（正是 answer 调用需要的形参）', e && e.target)
  // ★ RUN 158: `g9-问询` 不是可移植文件名，paper 的 durable id 现在是铸造的 `paper-pN`（title 仍是标题），
  // 所以拒绝回执带的是那个真 id，而不是 `paper-<中文标题>`。
  ok(!!e && /^paper-p[0-9]+$/.test(String(e.paperId || '')), 'G9：拒绝带上 `paperId`（铸造的 durable id）', e && e.paperId)
  // G9 的另一支：尚在等答复时再次定稿，拒绝仍带 target/paperId（不是“没给 target”那条路）
  const e2 = await refusalOf(async () => flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' }))
  ok(!!e2 && e2.code === 'VMU_OFFICE_CONSULT_REQUIRED', '§5 G9：等待中再次定稿仍被同一门拒', e2 && e2.code)
  ok(!!e2 && e2.target === T && String(e2.paperId || '') === String(e.paperId || ''),
    '§5 G9：awaiting 一支的拒绝也带 target/paperId', e2 && { target: e2.target, paperId: e2.paperId })
  const answer = flow.recordConsult({ target: e.target, by: 'office', answer: '可以定稿' })
  ok(!!answer && answer.ok === true, 'G9：用拒绝回执里的 target 答复成功（回执里的键真的可用）', answer && (answer.code || answer.ok))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§6 G10：编译成功的回执带 argv/produced，final 的 missing 不再与 pdf.ok:true 同现')
{
  const latex = {
    check: async () => ({
      ok: true, engine: 'xelatex',
      pdfPath: '/abs/Paper/p10/p10.pdf', pdfBytes: 1234,
      argv: ['-interaction=nonstopmode', '-output-directory=/abs/Paper/p10', '/abs/Paper/p10/p10.tex'],
      outDir: '/abs/Paper/p10', tried: [{ engine: 'xelatex', phase: 'compile', exitCode: 0 }], elapsedMs: 1,
    }),
  }
  const { flow, kernel } = boot({}, latex)
  const T = 'p10'
  kernel.records.put({ id: 'rec-ev10', track: 'propositions', kind: 'proposition', title: '证据卡', body: '- statement：x' })
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) flow.recordPart({ target: T, member: m, title: m + ' 的标题', solution: m + ' 的解法', evidence: ['Members/' + m + '/Propos/rec-ev10.md'] })
  flow.advance({ target: T })
  flow.recordReview({ target: T, member: 'r-1', deliverable: true, comments: '可交付' })
  flow.recordReview({ target: T, member: 'r-2', deliverable: true, comments: '可交付' })
  flow.advance({ target: T })
  const fin = await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' })
  ok(fin && fin.finalized === true, '前提：定稿成功', fin && (fin.code || fin.finalized))
  ok(fin && fin.pdf && fin.pdf.ok === true && fin.pdf.produced === true, 'G10：pdf 块带 produced:true', fin && fin.pdf && { ok: fin.pdf.ok, produced: fin.pdf.produced })
  ok(fin && fin.pdf && Array.isArray(fin.pdf.argv) && fin.pdf.argv.length > 0, 'G10：pdf 块带编译器 argv（路径证据）', fin && fin.pdf && fin.pdf.argv)
  const argv = ((fin || {}).pdf || {}).argv || []
  const texArg = String(argv.filter((a) => String(a).includes('.tex'))[0] || '')
  ok(texArg.length > 0 && !texArg.includes('\\') && /^\//.test(texArg), 'G10：argv 里的源文件是绝对 + 正斜杠路径', texArg)
  ok(Array.isArray(fin && fin.missing) && !fin.missing.includes('pdf'), 'G10：missing 里不再出现 "pdf"（回执不自相矛盾）', fin && fin.missing)
  // 反向：编译失败时说清楚「没产出」，且 pdf.ok 是 false（不会同时声称成功）
  const latexBad = { check: async () => { const e = new Error('xelatex 失败'); e.code = 'VMU_PAPER_LATEX_FAILED'; e.stderrTail = '! Undefined control sequence.'; e.tailSource = 'stderr'; throw e } }
  const { flow: fb, kernel: kb } = boot({}, latexBad)
  const TB = 'p11'
  kb.records.put({ id: 'rec-ev11', track: 'propositions', kind: 'proposition', title: '证据卡', body: '- statement：x' })
  fb.start({ target: TB, participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) fb.recordPart({ target: TB, member: m, title: m + ' 的标题', solution: m + ' 的解法', evidence: ['Members/' + m + '/Propos/rec-ev11.md'] })
  fb.advance({ target: TB })
  fb.recordReview({ target: TB, member: 'r-1', deliverable: true, comments: '可交付' })
  fb.recordReview({ target: TB, member: 'r-2', deliverable: true, comments: '可交付' })
  fb.advance({ target: TB })
  const finB = await fb.recordFinal({ target: TB, member: 'acad', decision: 'deliverable' })
  ok(finB && finB.finalized === true && finB.pdf && finB.pdf.ok === false, 'G10：编译失败仍定稿但 pdf.ok:false（不谎报）', finB && finB.pdf && { ok: finB.pdf.ok, code: finB.pdf.faceCode })
  ok(finB && Array.isArray(finB.missing) && finB.missing.includes('pdf'), 'G10：编译失败时 missing 仍然点名 pdf', finB && finB.missing)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('')
console.log('=== RUN 154 REAL RUN 4 FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}
console.log('ALL GREEN')
