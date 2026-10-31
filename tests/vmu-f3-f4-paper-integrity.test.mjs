#!/usr/bin/env node
// tests/vmu-f3-f4-paper-integrity.test.mjs — ★ F3a / F3b / F4: THE PAPER'S 互审 AND ITS DELIVERY GATE, ON THE REAL FLOW.
//
// THE THREE DEFECTS THIS SUITE PINS (each reproduced before the fix, each asserted here against the assembled pack):
//   F3a  一 participant ⇒ `advance()` built `reviewOf[member] = member`, `recordReview` filed the self-review, and
//        `advance()` returned `unanimous:true` — a paper "cross-reviewed" by its own author was handed to the editor.
//        Fixed: a review of one's own part is refused BY NAME, and unanimous finalisation requires TWO DISTINCT reviewers
//        who are not the authors of the parts they reviewed (so a single-member paper is refused at finalise too).
//   F3b   the evidence rule counted the WHOLE paper (`evidenceEntries.length === 0`), so one member's evidence shielded
//        every other member's empty appendix entry. Fixed: the check is per part and NAMES the empty part(s).
//   F4    the quality gate hung on the pack's overridden `render`, but `recordFinal` called the kit's LEXICAL `render`,
//        so the finalising path finalised a paper that `render` itself refused with
//        `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING`. Fixed: the finalising path goes THROUGH the same gate (one call
//        site serves both), a quality refusal restores the pre-final state, and the gate is consulted exactly once.
//
// RULE E (the repo's vacuity rule): every loop / `.every` below is preceded by an explicit NON-EMPTY assertion, so a
// green run cannot be "green because nothing was there".
//
// Run: node tests/vmu-f3-f4-paper-integrity.test.mjs
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')
const PACK = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')
const QUALITY = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b) && (Array.isArray(a) ? a.length > 0 : true), label, { got: a, want: b })

const pack = await import(pathToFileURL(PACK).href)
const qMod = await import(pathToFileURL(QUALITY).href)
const Q = qMod.QUALITY_CODES

// ── the double: the kit's records contract (put/get/list), settings, a roster. No timers, no filesystem, no agent ───────
// `put` WITHOUT an id mints one; WITH an id it REPLACES the same row (the single-state-row discipline the flow relies on),
// and the row carries the fingerprint `put` returned, because `readPartVerified` really re-reads parts by id.
function makeKernel(settings, roster) {
  const rows = new Map()
  let seq = 0
  return {
    rows,
    kernel: {
      settingsSnapshot: () => ({ ...settings }),
      members: { roster: () => roster.slice() },
      records: {
        put(r) {
          const id = r.id || ('row-' + (++seq))
          rows.set(id, { ...r, id, fingerprint: 'fp-' + id })
          return { id, fingerprint: 'fp-' + id }
        },
        get({ id }) { return { record: rows.get(id) || null } },
        list({ track, limit } = {}) {
          const items = [...rows.values()].filter((r) => !track || r.track === track)
          return { items: typeof limit === 'number' ? items.slice(0, limit) : items }
        },
      },
    },
  }
}

const ROSTER = [{ id: 'acad', slot: 'chair' }, { id: 'r-1', slot: 'member' }, { id: 'r-2', slot: 'member' }]
const BASE = { 'vmu.records.tracks': ['paper'], 'vmu.paper.officeConsult': 'off' }

const boot = () => {
  const { kernel, rows } = makeKernel(BASE, ROSTER)
  return { flow: pack.createPaperSubsystem({ kernel, clock: () => 1 }), kernel, rows }
}
const rowsOfKind = (rows, kind) => [...rows.values()].filter((r) => r && r.kind === kind)

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 单人论文：不能自审，也不能以"全体一致"定稿 —— 两处都是具名拒，且什么都没写')
{
  const { flow, rows } = boot()
  const T = '单人论文'
  const begun = flow.start({ target: T, participants: ['r-1'] })
  ok(begun && begun.ok === true && begun.status === 'writing', '前提：单人论文建起来了（writing）', begun)
  flow.recordPart({ target: T, member: 'r-1', title: '唯一的部分', solution: '解法正文', evidence: ['r-1 的证据'] })

  const adv1 = flow.advance({ target: T })
  ok(adv1.to === 'reviewing' && Object.keys(adv1.reviewOf || {}).length === 0 && (adv1.notRequired || []).includes('r-1'),
    '★ F6：单人论文不再被派一个「自己审自己」的对象 —— 没有别的作者可指派，作者被记为 exempt（这是缺陷入口被关掉，而不是绕过闸）',
    adv1 && { reviewOf: adv1.reviewOf, notRequired: adv1.notRequired })

  let selfReview = null
  try { flow.recordReview({ target: T, member: 'r-1', of: 'r-1', deliverable: true }) } catch (e) { selfReview = e }
  ok(selfReview && selfReview.code === 'VMU_INVALID_ARGUMENT',
    '★ F3a 正：自审被具名拒（VMU_INVALID_ARGUMENT —— 没有更贴切的内核码，也不新造码）', selfReview && selfReview.code)
  ok(selfReview && /a paper part cannot be reviewed by its author/.test(String(selfReview.message)) && /不能评审自己写的部分/.test(String(selfReview.message)),
    '★ 拒的理由说清"论文的一部分不能由它的作者评审"（中英都给，回执可读）', selfReview && selfReview.message)
  ok(selfReview && /让另一位参与者评审/.test(String(selfReview.hint)) && /至少要两位参与者/.test(String(selfReview.hint)),
    '★ hint 给出确切的修复：让另一位参与者评审 / start 时至少要两位参与者', selfReview && selfReview.hint)
  ok(rowsOfKind(rows, 'paper-review').length === 0, '★ 自审被拒发生在写入之前：没有任何 review 记录（拒不是"记下再抱怨"）')

  // ★★ RUN 167 (FEEDBACK14 F6): 这一轮把「单人论文靠轮次上限走到 awaiting-editor、再在 final 被拒」这条旧路关掉了 ——
  // 它不是一条「可接受的路」，而是一条「先放过去再在门口拒」的债权。advance 现在就在互审闸上具名拒，状态留在 reviewing。
  let crossErr = null
  try { flow.advance({ target: T }) } catch (e) { crossErr = e }
  ok(crossErr && crossErr.code === 'VMU_INVALID_ARGUMENT',
    '★★ F3a 正（互审闸）：单人论文在 advance 上就被具名拒（不再靠轮次上限放行）', crossErr && crossErr.code)
  ok(crossErr && /一位参与者的论文无法通过互审/.test(String(crossErr.message)) && /a paper with one participant cannot pass 互审/.test(String(crossErr.message)),
    '★★ 拒的名字就是缺失的那一半："一位参与者的论文无法通过互审"（中英各一）', crossErr && crossErr.message)
  ok(crossErr && Array.isArray(crossErr.crossReviewers) && crossErr.crossReviewers.length === 0 && crossErr.required === 2,
    '★ 拒回执带机器可读事实：crossReviewers=[]，required=2', crossErr && { crossReviewers: crossErr.crossReviewers, required: crossErr.required })
  ok(crossErr && /participants 至少两位/.test(String(crossErr.hint)), '★ hint 给出确切的修复：start 的 participants 至少两位', crossErr && crossErr.hint)

  const stateRow = [...rows.values()].find((r) => r && r.kind === 'paper-state')
  ok(!!stateRow, '前提：状态记录在册（下面比较"拒前/拒后"的正文）')
  const bodyBefore = stateRow && stateRow.body
  const stateNow = flow.state(T).state
  ok(stateNow.status === 'reviewing' && !stateNow.forcedAfterCap,
    '★★ 拒后状态仍是 reviewing、没有 forcedAfterCap（被放行到編集环节这件事不再发生）', { status: stateNow.status, forcedAfterCap: stateNow.forcedAfterCap })
  ok(stateRow && stateRow.body === bodyBefore, '★★ 拒发生在任何写入之前：状态记录正文逐字未变')
  ok(rowsOfKind(rows, 'paper-md').length === 0 && rowsOfKind(rows, 'paper-tex').length === 0,
    '★ 没有写出任何 md/tex 产物（拒就是拒，不是"先写再拒"）')

  let finalErr = null
  try { await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' }) } catch (e) { finalErr = e }
  ok(finalErr && /^VMU_/.test(String(finalErr.code)),
    '★★ F3a 正（定稿）：单人论文也绝不可能以"全体一致"定稿（定稿面在状态闸上具名拒，不会静默 unanimous）', finalErr && { code: finalErr.code, message: String(finalErr.message).slice(0, 120) })
  ok(rowsOfKind(rows, 'paper-md').length === 0 && rowsOfKind(rows, 'paper-tex').length === 0,
    '★★ 定稿被拒后仍然没有任何产物（拒就是拒）')
}
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 双人论文：交叉互审被接受、自审被拒、定稿成功（成功路径不许被修坏）')
{
  const { flow, rows } = boot()
  const T = '双人论文'
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  flow.recordPart({ target: T, member: 'r-1', title: 'r-1 的部分', solution: '解法', evidence: ['r-1 的证据'] })
  flow.recordPart({ target: T, member: 'r-2', title: 'r-2 的部分', methods: '方法', evidence: ['r-2 的证据'] })

  const adv1 = flow.advance({ target: T })
  ok(adv1.to === 'reviewing' && adv1.reviewOf['r-1'] === 'r-2' && adv1.reviewOf['r-2'] === 'r-1',
    '前提：轮转是交叉的（r-1 审 r-2、r-2 审 r-1）', adv1 && adv1.reviewOf)

  let selfErr = null
  try { flow.recordReview({ target: T, member: 'r-1', deliverable: true, of: 'r-1' }) } catch (e) { selfErr = e }
  ok(selfErr && selfErr.code === 'VMU_INVALID_ARGUMENT' && /不能评审自己写的部分/.test(String(selfErr.message)),
    '★ 即使参与者有两位，显式把 of 指向自己也被具名拒（自审不能靠"换个对象"混进来）', selfErr && selfErr.message)

  const members = ['r-1', 'r-2']
  ok(members.length === 2, '前提（RULE E）：两位评审者都在场，下面的循环不是空转')
  const recorded = []
  for (const m of members) recorded.push(flow.recordReview({ target: T, member: m, deliverable: true, comments: '可交付' }))
  ok(recorded.length === 2 && recorded.every((r) => r && r.ok === true), '★ 两位成员各记一条互审（都被接受）', recorded)
  ok(recorded[0].of === 'r-2' && recorded[1].of === 'r-1', '★ 每条互审的被审对象都是"别人"（of 指向另一位成员）', recorded.map((r) => r.of))

  const adv2 = flow.advance({ target: T })
  ok(adv2.to === 'awaiting-editor' && adv2.unanimous === true,
    '★ 两位不同的、非作者的评审都投 true ⇒ 一致通过（这条路径必须还在）', adv2)

  const fin = await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable', conclusion: '结论成立' })
  ok(fin && fin.ok === true && fin.finalized === true, '★★ 定稿成功（真流程，不是状态行手术）', fin && { ok: fin.ok, finalized: fin.finalized })
  ok(Array.isArray(fin.missing) && fin.missing.includes('pdf') && fin.artifacts && fin.artifacts.present.md === true,
    '★ 定稿回执：md 已在档、pdf 如实报缺（四件产物不假称齐全）', fin && { missing: fin.missing })
  ok(rowsOfKind(rows, 'paper-md').length === 1, '★ 定稿路径只写了一份 md（没有重复渲染）', rowsOfKind(rows, 'paper-md').length)

  const rendered = flow.render({ target: T })
  ok(rendered.artifacts && rendered.artifacts.present.md === true && rendered.artifacts.present.tex === true && rendered.artifacts.present.meta === true,
    '★ 定稿后 render 仍可用，md/tex/meta 三件在档（pdf 需要 LaTeX 面，未被假造）', rendered && rendered.artifacts && rendered.artifacts.present)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 一个部分空证据、另一个部分有证据：定稿被拒，并点名空的那个部分（F3b）')
{
  const { flow, rows } = boot()
  const T = '空证据部分'
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  flow.recordPart({ target: T, member: 'r-1', title: '有证据的部分', solution: '带证据的解法', evidence: ['r-1 的证据'] })
  flow.recordPart({ target: T, member: 'r-2', title: '空证据的部分', solution: '没有任何证据的正文' })
  flow.advance({ target: T })
  const members = ['r-1', 'r-2']
  ok(members.length === 2, '前提（RULE E）：两位评审者都在场')
  for (const m of members) flow.recordReview({ target: T, member: m, deliverable: true })
  const adv = flow.advance({ target: T })
  ok(adv.to === 'awaiting-editor', '前提：互审一致，论文走到 awaiting-editor（证据门不在 advance 里）', adv && adv.to)

  const verdict = flow.qualityGate({ target: T })
  ok(verdict.ok === false && verdict.code === Q.EVIDENCE_MISSING,
    '★★ F3b 正：一个部分空证据 ⇒ 门拒绝（另一个部分的证据不能再遮住它）', verdict && { code: verdict.code, ok: verdict.ok })
  ok(/没有任何证据条目/.test(String(verdict.message)) && /r-2/.test(String(verdict.message)) && !/都是空的/.test(String(verdict.message)),
    '★★ 消息点名是哪个部分（r-2），不再说"所有人的列表都是空的"', verdict && verdict.message)
  ok(Array.isArray(verdict.emptyParts) && verdict.emptyParts.length === 1 && verdict.emptyParts[0] === 'r-2',
    '★ 判定带机器可读字段 emptyParts:["r-2"]', verdict && verdict.emptyParts)
  ok(Array.isArray(verdict.members) && verdict.members.length === 2,
    '★ members 仍是"有 part 的全部成员"（两份，兼容既有读法）', verdict && verdict.members)

  let renderErr = null
  try { flow.render({ target: T }) } catch (e) { renderErr = e }
  ok(renderErr && renderErr.code === Q.EVIDENCE_MISSING,
    '★★ render 用同一个码拒绝', renderErr && renderErr.code)
  ok(renderErr && Array.isArray(renderErr.emptyParts) && renderErr.emptyParts[0] === 'r-2',
    '★ 抛出的拒上也带 emptyParts（调用方不必解析句子）', renderErr && renderErr.emptyParts)

  let finalErr = null
  try { await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' }) } catch (e) { finalErr = e }
  ok(finalErr && finalErr.code === Q.EVIDENCE_MISSING,
    '★★★ F4 正：final 用 render 的同一个码拒绝（空证据的部分不能靠"定稿"绕过交付门）', finalErr && finalErr.code)
  ok(finalErr && Array.isArray(finalErr.emptyParts) && finalErr.emptyParts.includes('r-2'),
    '★ final 的拒也点名空的部分', finalErr && finalErr.emptyParts)
  ok(flow.state(T).state.status === 'awaiting-editor' && rowsOfKind(rows, 'paper-md').length === 0,
    '★ 拒后状态仍是 awaiting-editor、没有产物写出（失败不假装定稿）')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 recordFinal 恰好和 render 同时拒绝：同一个门、一个调用点、拒后回滚（F4）')
{
  // ── 4a 同一篇论文：render 与 final 拒的码必须一模一样 ────────────────────────────────────────────────────────────────
  const { flow, rows } = boot()
  const T = '编造引用的论文'
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  flow.recordPart({ target: T, member: 'r-1', title: '引用不存在的记录', solution: '见 p-404', evidence: ['Members/r-1/Propos/p-404.md'] })
  flow.recordPart({ target: T, member: 'r-2', title: 'r-2 的部分', methods: '方法', evidence: ['r-2 的证据'] })
  flow.advance({ target: T })
  const members = ['r-1', 'r-2']
  ok(members.length === 2, '前提（RULE E）：两位评审者都在场')
  for (const m of members) flow.recordReview({ target: T, member: m, deliverable: true })
  ok(flow.advance({ target: T }).to === 'awaiting-editor', '前提：论文走到 awaiting-editor（质量门还没跑过）')

  let renderErr = null
  try { flow.render({ target: T }) } catch (e) { renderErr = e }
  ok(renderErr && renderErr.code === Q.CITATION_UNKNOWN, '前提：render 拒绝（CITATION_UNKNOWN）', renderErr && renderErr.code)

  // THE "EXACTLY ONCE" PROBE: wrap the pack's own gate and count. A duplicated gate call in recordFinal, or a lexical
  // render that bypasses the pack, would show up here as 0 or 2 calls.
  const realGate = flow.qualityGate
  let gateCalls = 0
  const bodyBefore = [...rows.values()].find((r) => r && r.kind === 'paper-state').body
  flow.qualityGate = (args) => { gateCalls += 1; return realGate(args) }
  let finalErr = null
  try { await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' }) } catch (e) { finalErr = e }
  flow.qualityGate = realGate
  ok(finalErr && finalErr.code === renderErr.code,
    '★★★ recordFinal 拒的码与 render 完全相同（同一个门，不可能是词法副本各自判）', finalErr && finalErr.code)
  ok(gateCalls === 1, '★★★ 定稿路径上质量门恰好被咨询一次（一个调用点同时服务 render 与 recordFinal）', gateCalls)
  const st = flow.state(T).state
  ok(st.status === 'awaiting-editor' && (st.final === null || st.final === undefined),
    '★★ 拒后状态回到 awaiting-editor（先写 finalized 再把拒抛出去，就是 F4 的另一半）', { status: st.status, final: st.final })
  ok([...rows.values()].find((r) => r && r.kind === 'paper-state').body === bodyBefore,
    '★★ 回滚把状态正文恢复成拒之前的样子（逐字相同，不留"定稿过又没定稿"的痕迹）')
  ok(rowsOfKind(rows, 'paper-md').length === 0, '★ 被拒的定稿没有写出任何 md 产物（门在 delegate 之前）')

  // ── 4b 一对"合格论文"：render 与 recordFinal 都必须放行（否则 4a 的相等可以靠"永远拒绝"骗过去） ──────────────────────
  const clean = boot()
  const T2 = '合格论文'
  clean.flow.start({ target: T2, participants: ['r-1', 'r-2'] })
  clean.flow.recordPart({ target: T2, member: 'r-1', title: 'r-1 的部分', solution: '带证据的解法', evidence: ['r-1 的证据'] })
  clean.flow.recordPart({ target: T2, member: 'r-2', title: 'r-2 的部分', methods: '带证据的方法', evidence: ['r-2 的证据'] })
  clean.flow.advance({ target: T2 })
  ok(members.length === 2, '前提（RULE E）：合格论文的两位评审者都在场')
  for (const m of members) clean.flow.recordReview({ target: T2, member: m, deliverable: true })
  ok(clean.flow.advance({ target: T2 }).to === 'awaiting-editor', '前提：合格论文也走到 awaiting-editor')

  let cleanRenderErr = null
  let cleanRendered = null
  try { cleanRendered = clean.flow.render({ target: T2 }) } catch (e) { cleanRenderErr = e }
  ok(cleanRenderErr === null && cleanRendered && cleanRendered.artifacts.present.md === true,
    '★★ 同一份合格论文 render 放行（4a 的"同时拒绝"不是靠把一切都拒掉）', cleanRenderErr && cleanRenderErr.code)
  const cleanFin = await clean.flow.recordFinal({ target: T2, member: 'acad', decision: 'deliverable' })
  ok(cleanFin && cleanFin.finalized === true, '★★ 合格论文 recordFinal 放行（F4 修好的是"该拒的拒"，不是"全都拒"）', cleanFin && cleanFin.finalized)
  ok(clean.flow.state(T2).state.status === 'finalized', '★ 合格论文的状态真的是 finalized')
}

console.log('')
console.log('=== VMU F3/F4 PAPER INTEGRITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
