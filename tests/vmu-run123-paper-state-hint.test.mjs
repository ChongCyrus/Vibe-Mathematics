#!/usr/bin/env node
// tests/vmu-run123-paper-state-hint.test.mjs — ★ F-123a: 一个"不是编辑时"的拒绝，得说清从当前状态能做什么。
//
// RUN 123 的实证（逐字回执）：
//   vibe_v5_paper { action: "final", member: "r-acad", target: "p-1" }
//     ⇒ VMU_PACK_V5R_CORE_PAPER_STATE
//       "the paper is not awaiting its editor (now: reviewing)"
//       hint: "advance() until the cross-review is unanimous or the round cap is reached"
//   而 `advance()` 只在 writing / reviewing 之间搬运流程，它**从不评审任何部分**：照这条 hint 反复调用
//   `advance()` 不会让论文变成 awaiting-editor（互审要靠 `action:"review"`）。hint 把调用者指向了一个
//   无论如何重复都不能改变答案的动作 —— 这是"拒绝要点名良形状"（B 族）里最容易被忽略的一支。
//
// 修法：`kit/paper.js#nextMoveFor(state)` 按当前状态给下一步的**可执行调用**：
//   writing   ⇒ `vibe_v5_paper { action: "part", … }`（先有部分），再由 advance() 进入 reviewing
//   reviewing ⇒ `vibe_v5_paper { action: "review", of: "<author>", member: "<reviewer>", deliverable: true }`
//   finalized ⇒ 这份论文已经定稿：换个 target 或读状态
// RULE E：每个「不含/含」的断言都先证明被断言的对象存在（hint 是字符串且非空）。
//
// Run: node tests/vmu-run123-paper-state-hint.test.mjs
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')
const PACK = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}

const pack = await import(pathToFileURL(PACK).href)

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
// recordFinal 是 async（它要等 PDF 引擎那一步）：拒绝以 rejected promise 出现 ⇒ 必须 await 才抓得到。
const refusalOf = async (fn) => { try { await fn(); return null } catch (e) { return e } }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 writing：hint 必须点名「先写 part」，而不是叫人多调用一次 advance()')
{
  const { flow } = boot()
  const T = '状态提示·writing'
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  const e = await refusalOf(() => flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' }))
  ok(!!e && e.code === 'VMU_PACK_V5R_CORE_PAPER_STATE', '前提：writing 状态下的定稿被具名拒（STATE）', e && e.code)
  const hint = String((e && e.hint) || '')
  ok(hint.length > 20, '前提：拒绝带了 hint（空 hint 下面两条断言就是空的）', { hint })
  ok(/action: "part"/.test(hint), '★ hint 点名可执行的写入：vibe_v5_paper { action: "part" }', { hint })
  ok(!/advance\(\) until the cross-review is unanimous/.test(hint),
    '★ 旧的那句（「反复 advance() 直到互审一致」）不再出现：advance() 不会评审任何部分', { hint })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 reviewing：hint 必须点名 action:"review"，并说清 advance() 不替人评审')
{
  const { flow } = boot()
  const T = '状态提示·reviewing'
  flow.start({ target: T, participants: ['r-1', 'r-2'] })
  flow.recordPart({ target: T, member: 'r-1', title: '部分一', solution: '解法一', evidence: ['证据一'] })
  flow.recordPart({ target: T, member: 'r-2', title: '部分二', solution: '解法二', evidence: ['证据二'] })
  const advanced = flow.advance({ target: T })
  ok(advanced && advanced.to === 'reviewing', '前提：advance() 把流程从 writing 推到 reviewing', advanced)

  const e = await refusalOf(() => flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' }))
  ok(!!e && e.code === 'VMU_PACK_V5R_CORE_PAPER_STATE', '前提：reviewing 状态下的定稿被具名拒（STATE）', e && e.code)
  const hint = String((e && e.hint) || '')
  ok(hint.length > 20, '前提：拒绝带了 hint', { hint })
  ok(/action: "review"/.test(hint), '★ hint 点名互审这一支：vibe_v5_paper { action: "review" }', { hint })
  ok(/does not review for you/.test(hint), '★ 并说清 advance() 只搬流程、不替人评审（这是 run 123 走错的那一步）', { hint })
  ok(/of: "<author id>"/.test(hint) && /member: "<reviewer id>"/.test(hint), '★ 点名两个必需参数：of（被评审的作者）与 member（评审者）', { hint })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 三行提示是三种不同的下一步：同一句提示服务三种状态就等于没说')
{
  const { flow } = boot()
  const hintFor = async (target, run) => {
    flow.start({ target, participants: ['r-1', 'r-2'] })
    run(target)
    const e = await refusalOf(() => flow.recordFinal({ target, member: 'acad', decision: 'deliverable' }))
    return String((e && e.hint) || '')
  }
  const writingHint = await hintFor('提示·甲', () => {})
  const reviewingHint = await hintFor('提示·乙', (T) => {
    flow.recordPart({ target: T, member: 'r-1', title: 'p', solution: 's', evidence: ['e'] })
    flow.recordPart({ target: T, member: 'r-2', title: 'q', solution: 't', evidence: ['f'] })
    flow.advance({ target: T })
  })
  ok(writingHint.length > 0 && reviewingHint.length > 0, '前提：两种状态都真的产生了 hint', { writingHint, reviewingHint })
  ok(writingHint !== reviewingHint, '★ writing 与 reviewing 的提示不是同一句（状态不同，下一步就不同）', { writingHint, reviewingHint })
}

console.log('')
if (failed === 0) { console.log('=== RUN 123 PAPER STATE HINT: passed=' + passed + ' failed=0 ALL GREEN ==='); process.exit(0) }
console.log('=== RUN 123 PAPER STATE HINT: passed=' + passed + ' failed=' + failed + ' ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(1)
