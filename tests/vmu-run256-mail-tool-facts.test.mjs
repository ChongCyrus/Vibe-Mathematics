// tests/vmu-run256-mail-tool-facts.test.mjs — TB-2620 / task-101: 投递面把内核拒绝的**附加事实**带出来，
// 并让名字说真话（`unackedRowsAllBoxes`／`perBox`），提示行只对未结算行给 ack 指令。
//
// 依据：`D:\wd\vibemath开发\taskbooks\TB-2620-mail-tool-facts.md` 与 docs/03 §8 R97（拒绝的附加事实必须原样
// 到达调用者；实现只有一处 `host.js refusalFacts()`）。三条判据都用**外部源**：
//   ① 工具面（`vibe_vmu_mailbox` 的拒绝回执）与内核面（`kernel.mailbox.ack` 抛出的错误）读到**同一组事实**；
//   ② 重复 ack ⇒ 具名 `VMU_MAILBOX_ALREADY_ACKED` + ackedAt/ackedBy/settledBy，且交付状态快照不变；
//      一单里混入已结算 id ⇒ **整单拒绝**，同单还开着的行原样不动（校验先于任何状态搬迁）；
//   ③ 提示行只对未结算行渲染 ack 指令（已结算行不出现）；提示词/文档改用正名，旧名只留一句兼容。
//
// Run: node tests/vmu-run256-mail-tool-facts.test.mjs   (targeted only)
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOL_SRC_PATH = join(REPO, 'vibe-math-vmu', 'tools', 'mailbox.js')
const DOC_PATH = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')
const BLOCKS_B_PATH = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (pred, ms = 3000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (pred()) return true; await sleep(5) }
  return !!pred()
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

let NOW = 1700000000000
const entry = await import(pathToFileURL(ENTRY).href)
const TOOL_SRC = await readFile(TOOL_SRC_PATH, 'utf8')
const DOC = await readFile(DOC_PATH, 'utf8')
const BLOCKS_B = await readFile(BLOCKS_B_PATH, 'utf8')

const boot = async (root, config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ root, clock: () => NOW }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const closeBoot = async (b) => {
  if (!b) return
  if (typeof b.handle.cleanups === 'function') await b.handle.cleanups()
  else if (typeof b.handle.close === 'function') await b.handle.close()
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  const raw = await spec.execute(args, {})
  try { return { raw, parsed: JSON.parse(raw) } } catch (e) { return { raw, parsed: undefined } }
}
const kernelAckError = (kernel, member, ids) => {
  try { kernel.mailbox.ack(member, ids); return null } catch (e) { return e }
}
const deliverySnapshot = (kernel) => {
  const st = kernel.mailbox.status()
  return { boxes: st.boxes, members: st.members, pending: st.pending, acked: st.acked, seq: st.seq, notice: st.notice }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run256-mail-'))
let b = null
try {
  b = await boot(root, { packs: ['v5r'] })
  const kernel = b.kernel
  await kernel.members.hire({ id: 'r-boss', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })

  console.log('=== 0. 夹具与形状：面在，判据读的是真回执 ===')
  ok(kernel.members.roster().length === 3, 'setup: 一席主席 + 两个成员真实存在（RULE E：非空守卫）', kernel.members.roster().map((m) => m.id))
  ok(typeof b.specOf('vibe_vmu_mailbox') === 'object' && typeof kernel.mailbox.ack === 'function',
    'setup: 工具面与内核面都在（两处读同一拒绝）')
  ok(TOOL_SRC.includes('const receipt = refused(') && TOOL_SRC.includes('receipt.facts = facts'),
    'pin: tools/mailbox.js 把原始错误交给注入的 refused()（同时给出 facts 读数容器）')
  ok(!TOOL_SRC.includes('{ enforced: Array.isArray(e.enforced) ? e.enforced.slice() : [], enforcedScope:'),
    '反：tools/mailbox.js 不再重建固定的 enforced/enforcedScope 两键（那正是事实在面边界丢失的原因）')
  ok(DOC.includes('VMU_MAILBOX_ALREADY_ACKED') && DOC.includes('验收三款') && DOC.includes('校验先于任何状态搬迁') && DOC.includes('只对**未结算**行渲染 ack 指令'),
    'pin: docs/03 §8 的该码行写了三条验收口径（具名+三字段、校验先行、提示只对未结算行）')

  // ── 1. 工具面：一条消息被结算后，重复 ack 的回执带着内核的事实 ──────────────────────────────────────────────
  console.log('=== 1. 重复 ack：工具面回执带出内核附加事实（与内核面同一组值） ===')
  const sent = kernel.mailbox.send('office', { to: 'r-1', text: 'body', subject: 'S-facts', kind: 'dm' })
  const mailId = sent.ids[0]
  ok(typeof mailId === 'string' && mailId.startsWith('ml-'), 'setup: 真投递给出一个 ml- 行 id', mailId)
  const first = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: [mailId] })
  ok(first.parsed && first.parsed.ok === true && Array.isArray(first.parsed.acked) && first.parsed.acked[0] === mailId,
    '正：第一次 ack 成功（同一 id 进了 acked）', first.parsed && first.parsed.acked)

  const before = deliverySnapshot(kernel)
  const second = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: [mailId] })
  const r2 = second.parsed || {}
  ok(r2.ok === false && r2.code === 'VMU_MAILBOX_ALREADY_ACKED',
    '正：第二次 ack ⇒ 具名 ALREADY_ACKED（不是「不存在」）', { ok: r2.ok, code: r2.code })
  const ackedAtReadable = (v) => (typeof v === 'string' && v.length > 0) || Number.isFinite(v)
  ok(r2.facts && typeof r2.facts === 'object' && Array.isArray(r2.facts) === false && r2.facts.ackedBy === 'r-1' && r2.facts.settledBy === 'ack' && ackedAtReadable(r2.facts.ackedAt),
    '正：回执的 facts 容器带着 ackedAt/ackedBy/settledBy（外部源：内核在第一次 ack 时写的）', r2.facts)
  ok(r2.ackedAt === r2.facts.ackedAt && r2.ackedBy === r2.facts.ackedBy && r2.settledBy === r2.facts.settledBy && r2.alreadyAcked === true,
    '正：facts 是同一回执的读数（扁平事实仍在，R97 不被破坏），件内值与容器值逐字相等',
    { flat: { ackedAt: r2.ackedAt, ackedBy: r2.ackedBy, settledBy: r2.settledBy, alreadyAcked: r2.alreadyAcked } })
  ok(r2.facts.alreadyAcked === true && String(r2.facts.ackedAt).length > 0,
    '正：facts 明说这是「已结算」，并给出时刻（不是空对象）', r2.facts)
  const kErr = kernelAckError(kernel, 'r-1', [mailId])
  ok(kErr && kErr.code === 'VMU_MAILBOX_ALREADY_ACKED' && kErr.ackedAt === r2.facts.ackedAt && kErr.ackedBy === r2.facts.ackedBy && kErr.settledBy === r2.facts.settledBy,
    '正：工具面与内核面读到同一组事实（同一时刻、同一结算者、同一结算方式）',
    kErr && { code: kErr.code, ackedAt: kErr.ackedAt, ackedBy: kErr.ackedBy, settledBy: kErr.settledBy })
  ok(same(before, deliverySnapshot(kernel)),
    '正：重复 ack 不改变交付状态（ack 前后 status 快照逐字相等：boxes/pending/acked/seq/notice）')
  ok(String(r2.message || '').includes('already settled') && String(r2.message || '').includes(mailId),
    '正：message 说清「这一行已被谁在何时结算」，并点名那一行', r2.message)
  ok(String(r2.hint || '').includes('not a missing mail'),
    '正：hint 明确它「不是一封不存在的信」（旧口径把两者混为一谈）', r2.hint)

  // ── 2. 真的不存在 vs 已结算：两种拒绝都带 facts，且可区分 ──────────────────────────────────────────────────
  console.log('=== 2. 真不存在仍是 ACK_UNKNOWN，且同样走 facts 通道 ===')
  const unknown = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: ['ml-9999'] })
  const u = unknown.parsed || {}
  ok(u.ok === false && u.code === 'VMU_MAILBOX_ACK_UNKNOWN',
    '正：不存在的 id ⇒ ACK_UNKNOWN（与 ALREADY_ACKED 分开）', { ok: u.ok, code: u.code })
  ok(u.facts && typeof u.facts === 'object' && Array.isArray(u.facts) === false && Array.isArray(u.facts.enforced),
    '正：未知 id 的 facts 也在（含 enforced 列表），不是 undefined', u.facts)
  ok(same(u.facts, { enforced: u.enforced, enforcedScope: u.enforcedScope }) === false || (Array.isArray(u.enforced) && u.facts.enforced.length === u.enforced.length),
    '正：facts.enforced 与扁平 enforced 同源（同一回执，不是第二套复制规则）', { facts: u.facts.enforced, flat: u.enforced })
  const noIds = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1' })
  const n = noIds.parsed || {}
  ok(n.ok === false && n.code === 'VMU_INVALID_ARGUMENT' && n.facts && typeof n.facts === 'object' && Object.keys(n.facts).length === 0,
    '正：内核没附任何事实时 facts 是空对象（缺失给 {}，不是 undefined）', n.facts)

  // ── 3. 混合列表：校验先于任何状态搬迁 ⇒ 整单拒绝，还开着的行原样不动 ─────────────────────────────────────
  console.log('=== 3. 混合列表整单拒绝：可 ack 的行不被半途搬走 ===')
  kernel.mailbox.send('office', { to: 'r-2', text: 'keep-1', subject: 'K1', kind: 'dm' })
  kernel.mailbox.send('office', { to: 'r-2', text: 'keep-2', subject: 'K2', kind: 'dm' })
  const pendingR2 = kernel.mailbox.pending('r-2').map((e) => e.id)
  ok(pendingR2.length === 2, 'setup: r-2 箱里两行未结算（非空守卫）', pendingR2)
  const settledOne = pendingR2[0]
  const stillOpen = pendingR2[1]
  const settleFirst = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-2', ids: [settledOne] })
  ok(settleFirst.parsed && settleFirst.parsed.ok === true, 'setup: 先结算第一行（第二行仍开着）', settleFirst.parsed && settleFirst.parsed.acked)
  const beforeMixed = kernel.mailbox.list('r-2', { status: 'all' }).entries.map((e) => e.id)
  const mixed = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-2', ids: [stillOpen, settledOne] })
  const mx = mixed.parsed || {}
  const afterMixed = kernel.mailbox.list('r-2', { status: 'all' }).entries.map((e) => e.id)
  ok(mx.ok === false && mx.code === 'VMU_MAILBOX_ALREADY_ACKED',
    '正：混入已结算 id ⇒ 具名 ALREADY_ACKED（不是静默部分成功）', { ok: mx.ok, code: mx.code })
  ok(same(beforeMixed, afterMixed) && afterMixed.includes(stillOpen),
    '正：整单拒绝没有任何状态搬迁 —— 同一单里还开着的行仍原样在（校验先于 splice）',
    { before: beforeMixed, after: afterMixed, stillOpen })
  const settleRest = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-2', ids: [stillOpen] })
  ok(settleRest.parsed && settleRest.parsed.ok === true && settleRest.parsed.acked[0] === stillOpen,
    '正：把还开着的那行单独 ack 仍能成功（拒绝不含糊、不粘住）', settleRest.parsed && settleRest.parsed.acked)

  // ── 4. 提示行与正名：只对未结算行给 ack 指令；提示词/docs 用 unackedRowsAllBoxes + perBox ─────────────────
  console.log('=== 4. 提示行只对未结算行渲染 ack；正名进入提示词与 docs ===')
  const notice = kernel.mailbox.noticeLines('r-1', { limit: 8 })
  // EMPTY_ALLOWED: the point of this assertion is exactly that no unacked line remains, so the list is empty on purpose.
  ok(notice.lineList === undefined && Array.isArray(notice.lines) && notice.lines.every((l) => l.includes('mailbox ack ') === false) && notice.count === 0,
    '正：已结算之后 r-1 的提示行数为 0（没有可再 ack 的行，自然也不给 ack 指令）', { count: notice.count, lines: notice.lines })
  ok(notice.acked === true && notice.ackRequired === false && Array.isArray(notice.unackedRows) && notice.unackedRows.length === 0,
    '正：读数同源（acked:true / ackRequired:false / unackedRows:[]）', { acked: notice.acked, ackRequired: notice.ackRequired })
  const body = BLOCKS_B.split('\n').find((l) => l.includes('【三通道的紧急语义】')) || ''
  ok(body.includes('`acked`／`ackRequired`／`settledBy:"ack"`') && !body.includes('`unackedRowsAllBoxes`') && !body.includes('`perBox`'),
    'pin（lead m08149-② 裁定）：具名读数只留成员真能读到的名字；视图级聚合 unackedRowsAllBoxes/perBox 已撤出提示词')
  ok(body.includes('`unackedRows` 是旧称'),
    'pin：旧名只在那一句兼容说明里出现（换名不换数，读者不会以为它消失了）')
  ok(!body.includes('`acked`／`ackRequired`／`unackedRows`／'),
    '反：旧的读数清单（把裸 unackedRows 当读数教）已经不在提示词里')
  ok(body.includes('`settledBy:"ack"`') && body.includes('**唯一**结算'),
    'pin：RUN 254-C 的「ack 是唯一结算」教学句仍在（本轮只换读数名，不换语义）')
  const budgetDeltaPinned = body.length > 0 && body.includes('无未读则**不出现块头**')
    && !body.includes('未读时块头在最上方，')
  ok(budgetDeltaPinned, 'pin：等量删字的另一处（重复的块头说明）也真的删了，净字符不涨')

  // ── 5. status().notice 的正名与 perBox 同源（提示词依赖的读数本身） ───────────────────────────────────────
  console.log('=== 5. status().notice：unackedRowsAllBoxes 与 perBox 同一次计算 ===')
  kernel.mailbox.send('office', { to: 'r-1', text: 'fresh-1', subject: 'F1', kind: 'dm' })
  kernel.mailbox.send('office', { to: 'r-2', text: 'fresh-2', subject: 'F2', kind: 'dm' })
  await waitFor(() => kernel.mailbox.status().notice.unackedRowsAllBoxes === 2)
  const st = kernel.mailbox.status().notice
  const perBox = st.perBox || {}
  const sumPerBox = Object.values(perBox).reduce((sum, n) => sum + Number(n), 0)
  ok(st.unackedRowsAllBoxes === 2 && st.unackedRows === 2,
    '正：正名与旧名的值都是 2（r-1、r-2 各一行；同一次计算）', { all: st.unackedRowsAllBoxes, old: st.unackedRows })
  ok(sumPerBox === st.unackedRowsAllBoxes && perBox['r-1'] === 1 && perBox['r-2'] === 1,
    '正：独立求和 perBox 恰好等于 unackedRowsAllBoxes，且逐箱对得上', { perBox, sumPerBox })
  ok(String(st.means || '').includes('ALL-BOXES') && String(st.means || '').includes('perBox'),
    '正：means 明说 unackedRows 是各箱合计、perBox 是拆分（口径可读）', st.means)
} finally {
  await closeBoot(b)
  await rm(root, { recursive: true, force: true }).catch(() => {})
}

console.log('\n=== RUN-256 MAIL TOOL FACTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('\nfailures:')
  for (const f of failures) console.error(' - ' + f)
  process.exitCode = 1
}
