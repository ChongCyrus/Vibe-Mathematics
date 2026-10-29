#!/usr/bin/env node
/**
 * ★★★ G7 ROUND 136 — THREE THINGS THE LIVE RUN READ BACK AS CONTRADICTIONS IN ONE RECEIPT.
 *
 * The chair of run 136 (build 3be1b2f0) filed three findings of its own, each of them a case where the surface told
 * two stories at once:
 *
 *   F-136a  `vibe_v5_record_proposition { proof_ref:"…", proof_state:"complete" }` was ACCEPTED (rule L14's finished
 *           text-proof path, added earlier today) but its receipt carried `proofStateEvidence: null` — "complete" with
 *           no warrant printed at all. A reader cannot tell "accepted on a written proof" from "accepted on nothing".
 *   F-136b  `vibe_v5_nudge` receipt said `sent.urgent:false` and, in the SAME object, a note claiming "delivered as
 *           urgent mail (v5r lists nudge among its urgent kinds)". Urgency comes from `vmu.mailbox.urgentKinds`, which
 *           is EMPTY by default. The note asserted a policy nobody had set.
 *   F-136c  `vibe_v5_prioritize`'s seat-face teaching still said "任务账本没有 priority 列，所以顺序作为耐久记录归档，
 *           回执会说明它没有改到任务板上" — while the receipt (and the tool description) reports `applied:[{from,to}]`.
 *
 * WHAT THIS SUITE PINS
 *   §1 F-136a: a proof_ref card's receipt NAMES the evidence (kind proof-ref, measured:false) and echoes the ref; a
 *             card with no evidence at all still prints null (the field did not become "always something").
 *   §2 F-136b: default deployment ⇒ note says ORDINARY and reads `sent.urgent:false` back; with
 *             `vmu.mailbox.urgentKinds:['nudge']` the SAME call says urgent and `sent.urgent:true`. Both directions, so
 *             the note is reading the flag rather than picking a fixed sentence.
 *   §3 F-136c: the teaching no longer claims the board has no priority column, and the description states that entries
 *             carrying a priority are applied (the mechanism the receipt already shows).
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// fileURLToPath, not `.pathname`: the checkout path contains CJK ("开发") and pathname percent-encodes it.
const HERE = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = new URL('../vibe-math-vmu/vibe-math-vmu.js', import.meta.url)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(ENTRY.href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const root = await mkdtemp(join(tmpdir(), 'vmu-run136-'))
try {
  console.log('=== 1. F-136a: a card admitted on a WRITTEN PROOF says so (and one admitted on nothing still says null) ===')
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })

  const withRef = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'p-ref', title: '带写好的证明', statement: '对 n ≤ 1000 成立', value: '穷举', motive: '取证', p: 0.6,
    proof_ref: 'Members/r-chair/Propos/p-ref.md#证明', proof_state: 'complete', member: 'r-chair',
  })
  ok(withRef.parsed && withRef.parsed.ok === true, '§1 前置：带 proof_ref 的 complete 卡被接受（前面的轮次已改）', withRef.parsed && (withRef.parsed.code || withRef.parsed.ok))
  const ev = withRef.parsed && withRef.parsed.proofStateEvidence
  ok(ev && ev.kind === 'proof-ref', '★★ F-136a(正)：回执点名凭据是 proof-ref（不是 null）', ev)
  ok(ev && ev.measured === false, '★ 形状与测量要分开：proof_ref 只核了"非空"，measured:false', ev && ev.measured)
  ok(ev && String(ev.ref || '').includes('p-ref.md'), '★ 回执回显调用者写的那条引用（可核对）', ev && ev.ref)
  ok(ev && /content|读/.test(String(ev.means || '')), '★ means 说清"内容由辩论中的人读"（不冒充已核）', ev && ev.means)

  const noBasis = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'p-nobasis', title: '只有声明', statement: '某猜想成立', value: '未验证', motive: '反例', p: 0.6,
    proof_state: 'complete', member: 'r-chair',
  })
  ok(noBasis.parsed && noBasis.parsed.ok === false, '★ 反：没有凭据的 complete 卡仍被拒（形状没被放松）', noBasis.parsed && noBasis.parsed.code)
  const plain = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'p-plain', title: '草稿', statement: '草稿命题', value: 'x', motive: 'y', p: 0.5, member: 'r-chair',
  })
  ok(plain.parsed && plain.parsed.ok === true && plain.parsed.proofStateEvidence === null,
    '★ 反(不变)：没声明 proof_state 的卡，evidence 仍是 null（字段没有变成恒有值）', plain.parsed && plain.parsed.proofStateEvidence)

  console.log('=== 2. F-136b: the nudge note READS the urgent flag instead of asserting a policy ===')
  const plainBoot = await boot({ root, packs: ['v5r'] })
  await plainBoot.handle.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await plainBoot.handle.kernel.members.hire({ id: 'r-1', slot: 'member' })
  const ordinary = await receipt(plainBoot, 'vibe_v5_nudge', { to: 'r-1', why: '停滞', next_step: '先跑基线' })
  ok(ordinary.parsed && ordinary.parsed.ok === true, '§2 前置：nudge 成功投递', ordinary.parsed && ordinary.parsed.code)
  ok(ordinary.parsed && ordinary.parsed.sent && ordinary.parsed.sent.urgent === false,
    '★ 默认部署：邮件不是 urgent（urgentKinds 默认空）', ordinary.parsed && ordinary.parsed.sent)
  ok(/ORDINARY mail/.test(String(ordinary.parsed && ordinary.parsed.note || '')),
    '★★ F-136b(正)：note 说 ORDINARY，与 sent.urgent:false 一致', ordinary.parsed && ordinary.parsed.note)
  ok(!/delivered as urgent mail/i.test(String(ordinary.parsed && ordinary.parsed.note || '')),
    '★ 反：同一回执里不再出现"delivered as urgent mail"', ordinary.parsed && ordinary.parsed.note)

  const urgentRoot = await mkdtemp(join(tmpdir(), 'vmu-run136-urgent-'))
  try {
    const urgentBoot = await boot({ root: urgentRoot, packs: ['v5r'], vmu: { mailbox: { urgentKinds: ['nudge'] } } })
    await urgentBoot.handle.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await urgentBoot.handle.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const urgent = await receipt(urgentBoot, 'vibe_v5_nudge', { to: 'r-1', why: '停滞', next_step: '先跑基线' })
    ok(urgent.parsed && urgent.parsed.sent && urgent.parsed.sent.urgent === true,
      '★ 另一方向：声明 urgentKinds 含 nudge ⇒ sent.urgent:true', urgent.parsed && urgent.parsed.sent)
    ok(/urgent mail/i.test(String(urgent.parsed && urgent.parsed.note || '')),
      '★★ F-136b(反方向)：note 随 flag 变成 urgent（说明它读的是 flag，不是固定句）', urgent.parsed && urgent.parsed.note)
  } finally { await rm(urgentRoot, { recursive: true, force: true, maxRetries: 3 }) }

  console.log('=== 3. F-136c: the prioritize teaching matches the apply discipline the receipt shows ===')
  const seatFaces = readFileSync(join(HERE, 'vibe-math-vmu/packs/v5r/seat-faces.js'), 'utf8')
  ok(!/没有 priority 列/.test(seatFaces), '★★ F-136c(正)：教学不再声称"任务账本没有 priority 列"')
  ok(/真改任务板的优先级/.test(seatFaces) && /from→to/.test(seatFaces),
    '★ 教学说了"带 priority 的条目真改任务板"并点名回执的 from→to', /prioritize/.test(seatFaces))
  const toolsSrc = readFileSync(join(HERE, 'vibe-math-vmu/packs/v5r/tools.js'), 'utf8')
  const descMatch = /name: 'vibe_v5_prioritize',\s*description: '([\s\S]*?)',\n/.exec(toolsSrc)
  ok(!!descMatch, '§3 前置：能读到 prioritize 的 description', !!descMatch)
  ok(descMatch && /applied to the board/.test(descMatch[1]), '★ description 说它会被应用到任务板（与 receipt 一致）', descMatch && descMatch[1].slice(0, 120))
  ok(descMatch && /position-only/.test(descMatch[1]), '★ description 也说清"不带 priority 的条目只表位置、不改任务"', descMatch && descMatch[1].slice(0, 120))
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}

console.log('')
if (failed > 0) {
  console.error('=== VMU RUN 136 NUDGE/PRIORITIZE/PROOF-REF: ' + passed + ' passed, ' + failed + ' failed ===')
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
console.log('=== VMU RUN 136 NUDGE/PRIORITIZE/PROOF-REF: ' + passed + ' passed, 0 failed ===')
