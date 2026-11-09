#!/usr/bin/env node
// tests/vmu-run257-deterministic-ids.test.mjs — RUN 257 / TB-2634: AN ID MINTED FROM `Math.random()` IS NOT REPRODUCIBLE.
//
// The defect (found by sim-lane in TB-2605): `vibe-math-vmu/kit/paper.js` minted consult request ids as
// `consult-<seq4>-<rand4>` where `rand4` came from `Math.floor(Math.random() * 16)`. Consequences:
//   ① the same input minted a DIFFERENT id on every run ⇒ two corpora over the same calls disagreed byte-for-byte;
//   ② TB-2602's "two runs, identical sha256" and TB-2605's determinism gate went randomly red — today green, tomorrow red;
//   ③ it contradicted the institute's own written discipline: `kernel/arbitration.js:183` and `kernel/bidding.js:28` both
//     say "no Math.random anywhere".
// This is the same class of defect as the wall-clock stamps fixed in RUN 256 (TB-2623): an external input that the corpus
// cannot reproduce makes the judgement unreproducible. The fix is the same shape — a SEAM, not a dice roll: the suffix is
// DERIVED from facts the caller already has (the paper title + the per-paper monotonic `ledger.opened`), and randomness is
// injected (`rand`) when a deployment deliberately wants a perturbed id.
//
// WHY THIS SUITE IS NOT A SNAPSHOT: determinism and uniqueness are two different promises. A suite that only pinned "the
// same input twice gives the same string" would pass for `consultRequestId = () => 'consult-0001-0000'` (deterministic AND
// useless). So this suite checks both directions:
//   · same input ⇒ byte-identical id (twice in one process; and twice in TWO independent kernels, because a module-level
//     counter would have made these differ);
//   · different title / different sequence / different injected draw ⇒ different id (no "all equal" fake determinism);
//   · two real scenario corpora over the same calls ⇒ the same consult ids (the promise the corpus gate actually needs);
//   · and the source reads NO random source at all.
// Run: node tests/vmu-run257-deterministic-ids.test.mjs

import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { requireFile } from './_lib/require-file.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')
const KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const KERNEL_PAPER = join(REPO, 'vibe-math-vmu', 'kernel', 'paper.js')
const KIT_SRC = readFileSync(KIT, 'utf8')
// ★ AUDIT-NO-SILENT-READS: this was `existsSync(...) ? readFileSync(...) : ''`. kernel/paper.js MUST exist (the
// claim "kernel/paper.js also reads no Math.random" is only about a real file, never about an empty string), so a
// missing file is a NAMED refusal, not a silent weakening of §1 into "no hits in ''".
const KERNEL_PAPER_SRC = requireFile(KERNEL_PAPER, 'the kernel-side paper module whose Math.random-free claim §1 makes')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; return true }
  failed += 1
  console.log('  ✖ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}
const eq = (actual, expected, label) => ok(Object.is(actual, expected), label + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')')

// ── 0. THE SOURCE READS NO RANDOM SOURCE ───────────────────────────────────────────────────────────────────────────────
console.log('=== 0. 源码判据：kit/paper.js 与 kernel/paper.js 里 Math.random 0 命中 ===')
// Count only CODE lines: the RUN 257 header/comment legitimately NAMES Math.random to explain why it is gone, and a pin
// that fails on its own explanation would push the next maintainer to delete the explanation rather than keep the code
// clean. That is why this counts stripped-comment lines, exactly like the census in §5.
const codeLinesOf = (src) => src.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
const mathRandomHits = (src) => codeLinesOf(src).filter((line) => /Math\s*\.\s*random\s*\(/.test(line)).length
eq(mathRandomHits(KIT_SRC), 0, '★★★ kit/paper.js 不再读 Math.random（真实读文件，不是快照）')
eq(mathRandomHits(KERNEL_PAPER_SRC), 0, '★★ kernel/paper.js 也不读 Math.random')
ok(!codeLinesOf(KIT_SRC).some((line) => /Math\.floor\(Math\.random\(\)\s*\*\s*16\)/.test(line)), '★★★ 旧的随机后缀表达式已消失（Math.floor(Math.random()*16) 0 命中）')
ok(/export const consultRequestId = \(seq, \{ seed = '', rand = null \} = \{\}\)/.test(KIT_SRC),
  '★★ 单一实现：consultRequestId(seq, { seed, rand }) 是唯一铸造处（可注入，缺省确定）')
ok(/consultSeedHex4/.test(KIT_SRC) && /FNV-1a/.test(KIT_SRC),
  '★★ 后缀由确定性折叠加派生（FNV-1a 注释与函数都在），不是"删了随机"而已')
ok(/const request = \{ id: consultRequestId\(ledger\.opened, \{ seed: str\(state\.target\), rand \}\)/.test(KIT_SRC) &&
  (KIT_SRC.match(/consultRequestId\(ledger\.opened, \{ seed: str\(state\.target\), rand \}\)/g) || []).length === 2,
  '★★ 两处铸造都带上了 seed（标题）与注入的 rand —— 没有第三处偷偷用默认值')

// ── 1. PURE DERIVATION: DETERMINISTIC AND DISTINGUISHING ──────────────────────────────────────────────────────────────
console.log('=== 1. 纯派生：同输入逐字相同；不同标题/序号/注入抽样给不同 id ===')
const M = await import('file:///' + KIT)
const mint = M.consultRequestId
ok(typeof mint === 'function', '★ 铸造器可独立调用（判据不经过包装猜行为）')
const SHAPE = /^consult-\d{4}-[0-9a-f]{4}$/
const a1 = mint(1, { seed: '中文标题/一' })
const a2 = mint(1, { seed: '中文标题/一' })
eq(a1, a2, '★★★ 同输入（同标题同序号）两次铸造逐字相同')
ok(SHAPE.test(a1), '★ 形态仍是 consult-<seq4>-<hex4>（地址形态没变，只换后缀来源）', a1)
ok(/^consult-0001-/.test(a1), '★ 序号零填充四位仍在', a1)
ok(!/中文|标题/.test(a1), '★★ 标题不进入 id（RUN 256 的契约未回退：id 是地址不是标题）', a1)
ok(mint(1, { seed: '另一篇' }) !== a1, '★★★ 不同标题 ⇒ 不同 id（防「全都一样」的假确定）', [a1, mint(1, { seed: '另一篇' })])
ok(mint(2, { seed: '中文标题/一' }) !== a1, '★★ 不同序号 ⇒ 不同 id', [a1, mint(2, { seed: '中文标题/一' })])
ok(SHAPE.test(mint(2, { seed: '中文标题/一' })) && /^consult-0002-/.test(mint(2, { seed: '中文标题/一' })), '★ 第二个序号的 id 形态同样成立')
// The injected draw is a SEAM: a fixed draw must stay deterministic (two calls agree), and a different draw must actually
// change the id (otherwise `rand` is an argument that does nothing).
const fixedRand = () => 0.42
eq(mint(1, { seed: 'x', rand: fixedRand }), mint(1, { seed: 'x', rand: fixedRand }), '★★ 注入固定 rand ⇒ 同输入仍逐字相同（注入不破坏确定性）')
ok(mint(1, { seed: 'x', rand: fixedRand }) !== mint(1, { seed: 'x', rand: () => 0.99 }),
  '★★★ 注入的抽样真的参与派生：不同抽样 ⇒ 不同 id（否则 rand 是空参数）')
ok(mint(1, { seed: 'x', rand: fixedRand }) !== mint(1, { seed: 'y', rand: fixedRand }),
  '★★★ 固定同一个抽样时，不同标题仍给不同 id —— 确定性来自输入，不是抽样')
ok(SHAPE.test(mint(1, { seed: 'x', rand: fixedRand })), '★ 注入 rand 的 id 也是同一形态')

// ── 2. TWO INDEPENDENT KERNELS MINT THE SAME ID (NO MODULE-LEVEL COUNTER) ──────────────────────────────────────────────
console.log('=== 2. 两个独立内核、同一份输入 ⇒ 同一条 requestId（排除"进程内计数器"这类假确定） ===')
const entry = await import('file:///' + join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js'))
const bases = []
const cleanups = []
const mkTemp = (tag) => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run257-' + tag + '-'))
  cleanups.push(dir)
  return dir
}
async function boot(tag, { clock = () => 1_000_000_000_000 } = {}) {
  const root = mkTemp(tag)
  bases.push(root)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const byName = new Map(specs.map((s) => [s.name, s]))
  const call = async (name, args) => {
    const raw = await byName.get(name).execute(args, { kernel: handle.kernel })
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  }
  return { root, kernel: handle.kernel, call }
}
const ACAD = 'acad-01'
const OFFICE = 'office'
const R1 = 'r-1'
/** Walk a REAL paper to awaiting-editor and take the consult id the gate opened. Shares no state between callers. */
async function consultIdOf(b, T) {
  await b.kernel.members.hire({ id: ACAD, slot: 'chair' })
  await b.kernel.members.hire({ id: OFFICE, slot: 'member' })
  await b.kernel.members.hire({ id: R1, slot: 'member' })
  const started = await b.call('vibe_v5_paper', { action: 'start', target: T, participants: [ACAD, R1] })
  ok(started.ok === true && started.started && started.started.status === 'writing', '前置：' + T + ' 建出并进入 writing', started && started.code)
  // The card id must be a SAFE path segment: it becomes the evidence pointer below. Using the title here once made the
  // pointer `Members/acad-01/Propos/p-中文标题/一.md`, which does not resolve, and the write was refused with
  // VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING — the refusal was right, the fixture was wrong.
  await b.call('vibe_v5_record_proposition', { id: 'p-evid', statement: '论文只整理已有证据', value: 0.5, motive: '定稿前核对', p: 0.5 })
  const part = await b.call('vibe_v5_paper', { action: 'part', target: T, member: ACAD, part: '第一段', solution: '正文', evidence: ['Members/' + ACAD + '/Propos/p-evid.md'] })
  ok(part.ok === true, '前置：' + T + ' 记下一份写作', part && part.code)
  const adv1 = await b.call('vibe_v5_paper', { action: 'advance', target: T })
  ok(adv1.ok === true, '前置：' + T + ' writing → reviewing', adv1 && adv1.code)
  for (const m of [ACAD, R1]) {
    const rv = await b.call('vibe_v5_paper', { action: 'review', target: T, member: m, deliverable: true, notes: '可交付' })
    ok(rv.ok === true, '前置：' + T + ' 的互审记下（' + m + '）', rv && rv.code)
  }
  const adv2 = await b.call('vibe_v5_paper', { action: 'advance', target: T })
  ok(adv2.ok === true && adv2.advance && adv2.advance.to === 'awaiting-editor', '前置：' + T + ' 走到 awaiting-editor', adv2 && adv2.advance)
  const fin = await b.call('vibe_v5_paper', { action: 'final', target: T, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论' })
  eq(fin.code, 'VMU_OFFICE_CONSULT_REQUIRED', '★★ 定稿被具名拦住（闸真的跑了，id 才有意义）')
  const cs = await b.call('vibe_v5_paper', { action: 'consult_state', target: T })
  const id = cs && cs.consult && cs.consult.awaiting && cs.consult.awaiting.id
  ok(SHAPE.test(String(id)), '★★ 台账里等着的那条 id 是 consult-<seq4>-<hex4>', id)
  const inMessage = String(fin.message || '').match(/consult-\d{4}-[0-9a-f]{4}/)
  ok(inMessage !== null && inMessage[0] === id, '★★★ 拒绝消息里的 id 与台账里的同一条（读面与拒因同源）', { id, inMessage: inMessage && inMessage[0] })
  return id
}
const b1 = await boot('k1')
const b2 = await boot('k2')
const TITLE = '中文标题/一'
const id1 = await consultIdOf(b1, TITLE)
const id2 = await consultIdOf(b2, TITLE)
eq(id1, id2, '★★★ 两个独立内核、同一标题同一序号 ⇒ 逐字相同的 requestId（不是进程内计数器）')

// ── 3. A DIFFERENT TITLE IS A DIFFERENT ID (IN A FRESH KERNEL TOO) ─────────────────────────────────────────────────────
console.log('=== 3. 换一个标题：新内核里铸出的是另一条 id（唯一性不是"全进程同一个常量"） ===')
const b3 = await boot('k3')
const id3 = await consultIdOf(b3, '另一篇标题')
ok(SHAPE.test(String(id3)) && id3 !== id1, '★★★ 不同标题 ⇒ 不同 id（同一台机器、同一序号）', { id1, id3 })

// ── 4. TWO REAL SCENARIO CORPORA OVER THE SAME CALLS MINT THE SAME CONSULT IDS ─────────────────────────────────────────
console.log('=== 4. 两次真场景语料：receipts.jsonl 里 consult 相关 id 逐字相同 ===')
const runScenario = (tag) => {
  const out = mkTemp('sim-' + tag)
  const res = spawnSync(process.execPath, ['scripts/sim/run.mjs', '--scenario', 'paper', '--out', out], { cwd: REPO, encoding: 'utf8', timeout: 300000 })
  const receiptsPath = join(out, 'receipts.jsonl')
  ok(existsSync(receiptsPath), '前置：场景 paper 产出了 receipts.jsonl（' + tag + '）', { status: res.status, tail: String(res.stdout || '').slice(-300) })
  // ★ AUDIT-NO-SILENT-READS: was `existsSync(...) ? readFileSync(...) : ''` - the "two corpora agree" comparison
  // would then have compared two EMPTY strings, which is the silent weakening this gate exists to stop.
  const text = requireFile(receiptsPath, 'the scenario receipt corpus whose consult ids §4 compares across two runs')
  const ids = [...text.matchAll(/consult-\d{4}-[0-9a-f]{4}/g)].map((m) => m[0])
  return { status: res.status, ids, count: ids.length, text }
}
const runA = runScenario('a')
const runB = runScenario('b')
eq(runA.status, 0, '前置：第一次场景跑 exit 0')
eq(runB.status, 0, '前置：第二次场景跑 exit 0')
ok(runA.count > 0 && runB.count > 0, '★★ 语料里确实有 consult id（否则"两次一致"是空真）', { a: runA.count, b: runB.count })
const uniqA = [...new Set(runA.ids)].sort()
const uniqB = [...new Set(runB.ids)].sort()
// Non-empty PRECONDITION, stated as its own assertion: "the two sets are equal" and "every id has the shape" are both
// vacuously true on an empty set, and a corpus that minted nothing must not be able to pass this section by silence.
ok(uniqA.length > 0 && uniqB.length > 0, '前置：两次语料都至少铸出一条 consult id（否则"集合相同"是空真）', { a: uniqA.length, b: uniqB.length })
eq(uniqA.join(','), uniqB.join(','), '★★★ 两次真场景语料铸出的 consult id 集合逐字相同（这是语料 byte 可复现的判据）')
// Cardinality guards: "equal sets" is not enough on its own — two runs that each collapse every mint into ONE id would
// also be "equal". So: (a) the per-run distinct count is the same on both sides, and (b) the OCCURRENCE MULTISET is the
// same: one id reaching seven receipts must reach seven receipts in both runs (a corpus where only one of the two runs
// re-used an id would change a count even when the sets still matched).
eq(uniqA.length, uniqB.length, '★★★ 两次运行的 id 集合基数相同（不是"两次各自塌成同一个 id"）')
const idMultiset = (list) => {
  const counts = new Map()
  for (const id of list) counts.set(id, (counts.get(id) || 0) + 1)
  return JSON.stringify([...counts.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)))
}
eq(idMultiset(runA.ids), idMultiset(runB.ids), '★★★ 每个 id 在两次语料里出现的次数也相同（多重集，不只是集合）', { a: idMultiset(runA.ids), b: idMultiset(runB.ids) })
ok(uniqA.length > 0 && uniqA.every((id) => SHAPE.test(id)), '★ 语料里的 id 全是同一形态（非空集合上逐条校验）', uniqA)
// The rest of the corpus is allowed to differ, but the consult ids must not be the reason: if ids matched, the same
// receipts lines are byte-identical after the ids (they come from the same calls). Cheap honesty check: count lines
// that carry a consult id and are equal across runs.
// Two runs get two different temporary workspaces, and the status receipt PRINTS that root (`roots.libraryRoot`). That is
// an environment fact, not a corpus fact — normalise ONLY the per-run workspace token so everything else, ids included,
// is still compared byte-for-byte.
const normaliseRunPath = (line) => line.replace(/ws-paper-[A-Za-z0-9_-]+/g, 'ws-paper-RUN')
const linesA = runA.text.split('\n').filter((l) => /consult-\d{4}-[0-9a-f]{4}/.test(l)).map(normaliseRunPath)
const linesB = runB.text.split('\n').filter((l) => /consult-\d{4}-[0-9a-f]{4}/.test(l)).map(normaliseRunPath)
ok(linesA.length === linesB.length && linesA.length > 0 && linesA.every((l, i) => l === linesB[i]),
  '★★★ 带 consult id 的回执行两次逐行逐字节相同（不是只比"集合"）', { a: linesA.length, b: linesB.length })

// ── 5. THE FULL-TREE CENSUS (report-only sites are NOT silently changed here) ──────────────────────────────────────────
console.log('=== 5. 全树 Math.random 普查：产品代码只报告，不改 ===')
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p)
  }
  return out
}
const censusRoots = [join(REPO, 'vibe-math-vmu'), join(REPO, 'scripts')]
const hits = []
for (const root of censusRoots) {
  if (!existsSync(root)) continue
  for (const file of walk(root)) {
    if (file.includes(join('vibe-math-vmu', 'packs', 'v5r', 'prompts'))) continue
    const src = readFileSync(file, 'utf8')
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      if (/Math\s*\.\s*random\s*\(/.test(line) && !/^\s*(\*|\/\/|\/\*)/.test(line)) hits.push(join(REPO, file).replace(REPO + '/', '').replace(REPO + '\\', '') + ':' + (i + 1))
    })
  }
}
const kitHits = hits.filter((h) => /(^|[/\\])kit[/\\]paper\.js:/.test(h))
eq(kitHits.length, 0, '★★★ 普查里 kit/paper.js 0 命中（本任务写域已清）')
const knownReportOnly = [/kernel[/\\]lean\.js:/, /kernel[/\\]mathjobs\.js:/, /kernel[/\\]records\.js:/, /kernel[/\\]store\.js:/]
const unexplained = hits.filter((h) => !knownReportOnly.some((re) => re.test(h)))
eq(unexplained.length, 0, '★★ 普查里除"已具名报告的产品代码站点"外没有新命中（发现即报告，不顺手改）', unexplained)
console.log('  [run257] census hits (report-only, product code): ' + hits.length)
for (const h of hits) console.log('    - ' + h)
// The census must name the two sites the institute's own comments cite as disciplined, so this test also fails if the
// discipline text disappears (that would make the report's claim about team policy unsupported).
const ARB = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'arbitration.js'), 'utf8')
const BID = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'bidding.js'), 'utf8')
ok(/no Math\.random anywhere/.test(ARB), '★ kernel/arbitration.js 的既有纪律句仍在（报告引用它作为团队既定纪律）')
ok(/Math\.random anywhere/.test(BID), '★ kernel/bidding.js 的既有纪律句仍在')

// ── CLEANUP ────────────────────────────────────────────────────────────────────────────────────────────────────────────
for (const dir of cleanups) { try { rmSync(dir, { recursive: true, force: true }) } catch (e) { void e } }
const digest = createHash('sha256').update(KIT_SRC).digest('hex').slice(0, 12)
console.log('=== VMU RUN 257 DETERMINISTIC IDS: ' + passed + ' passed, ' + failed + ' failed [' + digest + '] ===')
