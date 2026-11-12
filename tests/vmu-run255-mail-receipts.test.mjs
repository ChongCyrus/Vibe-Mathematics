// tests/vmu-run255-mail-receipts.test.mjs — TB-2606-B / task-95: 投递/邮箱面的三处读数。
//
// 依据：FEEDBACK74 第 5、6、8 条与 run74.result.md §4。三条都按「外部源」判定，不按本套件自己的复述判定：
//   ① `vibe_v5_message` 的回执缺 mail id（run 74 只能再用 `vibe_vmu_mailbox {action:"list"}` 反查 ml-17）。
//      现在回执恒发 `mailIds` / `notifyRows` / `notifyFailed` 三个数组；`mailIds` 必须与**另开一次 list 读到的
//      真 inbox 行 id**一致，`notifyRows` 必须把每个收件人与**他自己能读到的那一行**配对（不是 ids+to 的拉链）。
//   ② 同一行先被 office ack、成员再 ack 得 `VMU_MAILBOX_ACK_UNKNOWN`（「不存在」）——已结算被误报成不存在。
//      现在已结算 ⇒ 具名 `VMU_MAILBOX_ALREADY_ACKED`，带 ackedAt/ackedBy/settledBy；重复 ack 不改变交付状态
//      （ack 前后比较交付快照：boxes/pending/acked/seq/notice）；并且提示行里**不再给已结算行的 ack 指令**。
//   ③ `status().notice.unackedRows` 是各箱合计，却读起来像「我的箱子」。现在同一次计算给出正名
//      `unackedRowsAllBoxes` 与 `perBox:{member:n}`；独立求和 perBox 必须等于 unackedRowsAllBoxes。
//
// 全部通过真实入口（vibe-math-vmu.js，packs:['v5r']）驱动：没有复制被测逻辑，回执都是工具面自己给的。
//
// Run: node tests/vmu-run255-mail-receipts.test.mjs   (targeted only)
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const MAILBOX_SRC_PATH = join(REPO, 'vibe-math-vmu', 'kernel', 'mailbox.js')
const HANDLERS_SRC_PATH = join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js')
const DOC_PATH = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')

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

let NOW = 1700000000000
const entry = await import(pathToFileURL(ENTRY).href)
const kit = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js')).href)
const MAILBOX_SRC = await readFile(MAILBOX_SRC_PATH, 'utf8')
const HANDLERS_SRC = await readFile(HANDLERS_SRC_PATH, 'utf8')
const DOC = await readFile(DOC_PATH, 'utf8')

const boot = async (root, config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ root, clock: () => NOW }, config))
  await handle.ready()
  return { handle, state, kernel: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
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
// The delivery state, WITHOUT the audit counters: a refusal is itself recorded (that is the audit trail working),
// so the honest comparison is the delivery reading a repeat ack is forbidden to move.
const deliverySnapshot = (kernel) => {
  const st = kernel.mailbox.status()
  return { boxes: st.boxes, members: st.members, pending: st.pending, acked: st.acked, seq: st.seq, notice: st.notice }
}
const sameShape = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── 1. item ① on the main root: one message, one row, one pair ────────────────────────────────────────────────
const root = await mkdtemp(join(__tmpRoot(), 'vmu-run255-mail-'))
let b1 = null
try {
  b1 = await boot(root, { packs: ['v5r'] })
  const kernel = b1.kernel
  await kernel.members.hire({ id: 'r-boss', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  await kernel.members.hire({ id: 'r-3', slot: 'member' })

  // ── 0. preconditions + source pins ───────────────────────────────────────────────────────────────────────────
  console.log('=== 0. the fixture has the faces this lane needs, and the shape is where it is claimed ===')
  ok(kernel.members.roster().length === 4, 'setup: a chair and three members really exist (RULE E)', kernel.members.roster().map((m) => m.id))
  ok(typeof kernel.mailbox.send === 'function' && typeof kernel.mailbox.ack === 'function' && typeof kernel.mailbox.status === 'function',
    'setup: the mailbox exposes send/ack/status (the durable face these readings come from)')
  ok(typeof b1.specOf('vibe_v5_message') === 'object' && typeof b1.specOf('vibe_vmu_mailbox') === 'object',
    'setup: both tool faces are registered (message receipt + mailbox reads)')
  ok(MAILBOX_SRC.includes('VMU_MAILBOX_ALREADY_ACKED') && MAILBOX_SRC.includes('ackedBy: id'),
    'pin: kernel/mailbox.js names the already-settled code and records WHO settled the row (ackedBy)')
  ok(MAILBOX_SRC.includes('unackedRowsAllBoxes') && MAILBOX_SRC.includes('perBox'),
    'pin: kernel/mailbox.js carries the proper aggregate name and the per-box split')
  ok(HANDLERS_SRC.includes('mailIds') && HANDLERS_SRC.includes('notifyRows') && HANDLERS_SRC.includes('notifyFailed'),
    'pin: kit/handlers.js emits all three arrays')
  ok(DOC.includes('VMU_MAILBOX_ALREADY_ACKED'), 'pin: the new code is registered in docs/03 §8 (R97 登记先于实现)')

  console.log('\n=== 1. message 回执：mailIds / notifyRows / notifyFailed 三数组恒发，且与真 inbox 行一致 ===')
  const msg1 = await call(b1, 'vibe_v5_message', { to: 'r-1', content: 'lemma L2 budget is approved', subject: 'budget approval' })
  const m1 = msg1.parsed || {}
  ok(m1.ok === true, '正：office 私信成功', m1.code || m1.message)
  ok(Array.isArray(m1.mailIds) && m1.mailIds.length === 1, '正：mailIds 是一元素的数组，不是 undefined', m1.mailIds)
  ok(Array.isArray(m1.notifyRows) && m1.notifyRows.length === 1,
    '正：notifyRows 有且只有一个配对（一条邮件一个收件人）', m1.notifyRows)
  ok(Array.isArray(m1.notifyFailed) && m1.notifyFailed.length === 0,
    '正：notifyFailed 是空数组 —— 空是断言（都投到了），不是沉默', m1.notifyFailed)
  const mailId = m1.mailIds[0]
  // EXTERNAL SOURCE: a separate mailbox list read is the only authority for "which row does r-1 really have".
  const listed = await call(b1, 'vibe_vmu_mailbox', { action: 'list', member: 'r-1' })
  const rows1 = (listed.parsed && listed.parsed.entries) || []
  ok(rows1.length === 1 && rows1[0].id === mailId,
    '正：另开一次 list 读到的真 inbox 行 id 与回执 mailIds[0] 相同（不是自证）', { mailId, listed: rows1.map((r) => r.id) })
  ok(rows1[0] && rows1[0].subject === 'budget approval',
    '正：那一行的 subject 就是这次发送的 subject（同一行，不是同号不同信）', rows1[0] && rows1[0].subject)
  ok(m1.notifyRows[0].member === 'r-1' && m1.notifyRows[0].mailId === mailId,
    '正：notifyRows[0] 把 r-1 与它自己那一行配对', m1.notifyRows[0])
  ok(Array.isArray(m1.deduped), '正：deduped 仍是 id 数组（既有读者不被破坏）', m1.deduped)

  // NEGATIVE: a mailbox face that answers only {ids} (a test fake / an older implementation) must still produce
  // the three arrays, and must NOT invent a zip when the lists cannot be paired honestly.
  const fakeKernel = { mailbox: { send: () => ({ ok: true, ids: ['m1'] }) } }
  const fallback = kit.KIT_SOCIAL.message({ to: 'r-9', content: 'hello' }, { kernel: fakeKernel })
  ok(Array.isArray(fallback.mailIds) && fallback.mailIds.length === 1 && fallback.mailIds[0] === 'm1',
    '反（形状）：只有 ids 的信箱面 ⇒ mailIds 仍原样带出', fallback.mailIds)
  ok(Array.isArray(fallback.notifyRows) && fallback.notifyRows.length === 0,
    '反（形状）：没有 pairs 也没有等长的 to ⇒ notifyRows 为空数组（不是猜一个拉链）', fallback.notifyRows)
  ok(Array.isArray(fallback.notifyFailed) && fallback.notifyFailed.length === 0,
    '反（形状）：三数组都是数组，永不是 undefined', { rows: fallback.notifyRows, failed: fallback.notifyFailed })
  // NEGATIVE: a mailbox refusal returned as DATA must not become an ok:true receipt with no delivery.
  const refuseKernel = { mailbox: { send: () => ({ ok: false, code: 'VMU_MAILBOX_NO_SUCH_RECIPIENT', message: 'no recipient', hint: 'pass a member id', enforced: [] }) } }
  let fakeRefusal = null
  try { kit.KIT_SOCIAL.message({ to: 'nobody', content: 'hello' }, { kernel: refuseKernel }) } catch (e) { fakeRefusal = e }
  ok(fakeRefusal !== null && fakeRefusal.code === 'VMU_MAILBOX_NO_SUCH_RECIPIENT',
    '反（失败）：信箱面把拒绝当数据返回时，message 不谎报 ok:true，而是抛同一个具名拒', fakeRefusal && fakeRefusal.code)
  ok(fakeRefusal !== null && String(fakeRefusal.message).includes('no recipient'),
    '反（失败）：拒绝的 message 原样保留（不是通用兜底）', fakeRefusal && fakeRefusal.message)
} finally {
  // keeps running even when an assertion fails; the multi-target block below has its own root
}

// ── 2. item ① MULTI-TARGET + dedupe replay + handler mapping ─────────────────────────────────────────────────
// NOTE (measured, reported): a TOOL-face `to:"all"` cannot be exercised here — `kernel/index.js` builds the
// mailbox (and binds `resolveAudience` only when `members` was already truthy at construction) BEFORE any pack
// declares role slots, so the live face refuses `to:"all"` with VMU_ENGINE_UNAVAILABLE "no audience seam is bound"
// even with `slots:['chair','member','temp']` at boot. That binding order is kernel/index.js, outside this lane's
// write domain: the pairing itself is proved on the mailbox face (explicit recipient array) and the handler
// mapping is proved with a rows-bearing fake.
const root2 = await mkdtemp(join('D:/_tmp', 'vmu-run255-mail-all-'))
let b2 = null
try {
  console.log('\n=== 2. 多收件人 + 重投：rows 逐人配对（不是 ids+to 拉链），重投标 deduped ===')
  b2 = await boot(root2, { packs: ['v5r'] })
  await b2.kernel.members.hire({ id: 'r-boss', slot: 'chair' })
  await b2.kernel.members.hire({ id: 'r-1', slot: 'member' })
  await b2.kernel.members.hire({ id: 'r-2', slot: 'member' })
  // The kernel face takes an EXPLICIT ARRAY of recipients (multi-target), and pairs rows with addresses itself.
  // (A tool-face `to:"all"` would need the audience seam; see the NOTE below — the seam is bound too early in
  // kernel/index.js, so this suite proves the pairing through the mailbox face and the handler mapping separately.)
  const many = b2.kernel.mailbox.send('office', { to: ['r-1', 'r-2'], text: 'one circular for two', kind: 'note', urgent: false, subject: 'circular' })
  ok(many.ok === true && Array.isArray(many.rows) && many.rows.length === 2,
    '正：多收件人发送回两条配对（rows 是投递面自己配的，不是收件人表复制）', { ok: many.ok, rows: many.rows })
  const rowsR1 = ((await call(b2, 'vibe_vmu_mailbox', { action: 'list', member: 'r-1' })).parsed || {}).entries || []
  const rowsR2 = ((await call(b2, 'vibe_vmu_mailbox', { action: 'list', member: 'r-2' })).parsed || {}).entries || []
  const pairFor = (m) => (many.rows.find((r) => r.member === m) || {}).mailId
  ok(rowsR1.length === 1 && rowsR1[0].id === pairFor('r-1'),
    '正：rows 给 r-1 的 mailId 就是 r-1 箱里的那一行', { claimed: pairFor('r-1'), real: rowsR1.map((r) => r.id) })
  ok(rowsR2.length === 1 && rowsR2[0].id === pairFor('r-2'),
    '正：rows 给 r-2 的 mailId 就是 r-2 箱里的那一行', { claimed: pairFor('r-2'), real: rowsR2.map((r) => r.id) })
  ok(pairFor('r-1') !== pairFor('r-2'), '正：不同收件人的 mailId 不同（配对不是同一个 id 复制）', many.rows)
  ok(new Set(many.ids).size === many.ids.length, '正：ids 两条互不相同（一行一个 id）', many.ids)
  // DEDUPE REPLAY: a second send with the same to+subject+dedupeKey creates NO row; the pairing must say so
  // (`deduped:true`, prior id) instead of claiming a fresh delivery.
  const firstKeyed = b2.kernel.mailbox.send('office', { to: ['r-1', 'r-2'], text: 'one circular for two', kind: 'note', urgent: false, subject: 'circular', dedupeKey: 'circular-1' })
  const secondKeyed = b2.kernel.mailbox.send('office', { to: ['r-1', 'r-2'], text: 'one circular for two', kind: 'note', urgent: false, subject: 'circular', dedupeKey: 'circular-1' })
  ok(firstKeyed.ok === true && secondKeyed.ok === true && firstKeyed.rows.length === 2,
    'setup: 带 dedupeKey 的首投建档', { first: firstKeyed.rows, second: secondKeyed.rows })
  ok(secondKeyed.ids.length === 0 && secondKeyed.rows.length === 2 && secondKeyed.rows.every((r) => r.deduped === true),
    '正：同 to+subject+dedupeKey 的重投不建新行，rows 逐条标 deduped:true', secondKeyed.rows)
  ok(secondKeyed.rows.every((r) => r.mailId === firstKeyed.rows.find((f) => f.member === r.member).mailId),
    '正：重投配对的 mailId 是首投那一行（收件人读到的仍是同一封信）', { first: firstKeyed.rows, second: secondKeyed.rows })
  // HANDLER MAPPING (external to the fake): with rows supplied out of zip order, the receipt must follow rows.
  const rowsKernel = { mailbox: { send: () => ({ ok: true, to: ['r-1', 'r-2'], ids: ['ml-a', 'ml-b'],
    rows: [{ member: 'r-2', mailId: 'ml-a', deduped: true }, { member: 'r-1', mailId: 'ml-b', deduped: false }] }) } }
  const mapped = kit.KIT_SOCIAL.message({ to: 'r-1', content: 'x' }, { kernel: rowsKernel })
  ok(mapped.mailIds.length === 2 && mapped.mailIds[0] === 'ml-a' && mapped.mailIds[1] === 'ml-b',
    '正（映射）：mailIds 逐字带出（顺序即发送面顺序）', mapped.mailIds)
  ok(mapped.notifyRows.length === 2 && mapped.notifyRows[0].member === 'r-2' && mapped.notifyRows[0].mailId === 'ml-a'
    && mapped.notifyRows[1].member === 'r-1' && mapped.notifyRows[1].mailId === 'ml-b',
    '正（映射）：notifyRows 跟着 rows 走，不是按 to 与 ids 拉链（拉链会给出 r-1↔ml-a 的错配对）', mapped.notifyRows)
} finally {
  await closeBoot(b2)
  await rm(root2, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

// ── 3-5. items ② and ③ on the main root ──────────────────────────────────────────────────────────────────────
try {
  const b = b1
  const kernel = b.kernel
  const rows1 = ((await call(b, 'vibe_vmu_mailbox', { action: 'list', member: 'r-1' })).parsed || {}).entries || []
  const mailId = rows1[0].id
  console.log('\n=== 3. 双结算：已结算 ⇒ ALREADY_ACKED（带 ackedAt/ackedBy/settledBy），重复 ack 不改交付状态 ===')
  const ack0 = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: [mailId] })
  ok(ack0.parsed && ack0.parsed.ok === true && (ack0.parsed.acked || []).includes(mailId), 'setup: 第一封先正常结算', ack0.parsed)
  const msg3 = await call(b, 'vibe_v5_message', { to: 'r-1', content: 'please acknowledge this one', subject: 'ack me' })
  const targetId = ((msg3.parsed || {}).mailIds || [])[0]
  ok(Boolean(targetId), 'setup: 又一行可结算的邮件', (msg3.parsed || {}).code)
  const ack1 = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: [targetId] })
  ok(ack1.parsed && ack1.parsed.ok === true && Array.isArray(ack1.parsed.acked) && ack1.parsed.acked[0] === targetId,
    '正：第一次 ack 成功并回 acked 名单', ack1.parsed)
  const before = deliverySnapshot(kernel)
  // TOOL FACE: the repeat ack answers the named code; the message must say WHO settled it WHEN and that nothing moved.
  const ack2 = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: [targetId] })
  const a2 = ack2.parsed || {}
  ok(a2.ok === false && a2.code === 'VMU_MAILBOX_ALREADY_ACKED',
    '正：第二次 ack 具名 ALREADY_ACKED（不再说 ACK_UNKNOWN / 不存在）', { code: a2.code, message: a2.message })
  ok(String(a2.message || '').includes('already settled'), '正：message 说已经结算过（不是「找不到」）', a2.message)
  ok(String(a2.message || '').includes('r-1'), '正：message 点名结算者 ackedBy=r-1', a2.message)
  ok(String(a2.message || '').includes('changed nothing'), '正：message 明说重复 ack 不改变状态', a2.message)
  // The hint moved to a copyable Chinese sentence (TB-2704/2708): pin the FACTS it must carry, not the old wording.
  ok(String(a2.hint || '').includes('这不是丢件'),
    '正：hint 纠正「不存在」的误读（旧口径把两者混为一谈）', a2.hint)
  ok(String(a2.hint || '').includes('notice.acked') && String(a2.hint || '').includes('{action:"status"}'),
    '正：hint 给的可照抄事实之一 — status 面的 notice.acked 才是「已结算」的读数', a2.hint)
  ok(String(a2.hint || '').includes('{action:"pending"') && String(a2.hint || '').includes('{action:"list"'),
    '正：hint 给的可照抄事实之二 — 仍在箱中的行用 pending / list 取 id 再重试', a2.hint)
  ok(String(a2.hint || '').includes('ids 是一次性的'),
    '正：hint 明说 ack 的 ids 是一次性的（第二次拿同一个 id 必被拒的原因）', a2.hint)
  ok(!String(a2.hint || '').includes('not a missing mail'),
    '反：旧的英文措辞不再出现（新句必须自己承担纠正，而不是靠旧字面量）', a2.hint)
  // KERNEL FACE: the refusal facts must actually be machine-readable (not only prose in the message).
  const kerr = kernelAckError(kernel, 'r-1', [targetId])
  ok(kerr !== null && kerr.code === 'VMU_MAILBOX_ALREADY_ACKED', '正：内核面抛出同名码', kerr && kerr.code)
  const ackedAtShape = kerr !== null && (typeof kerr.ackedAt === 'string' || Number.isFinite(kerr.ackedAt)) && kerr.ackedAt !== ''
  ok(ackedAtShape,
    '正（事实）：refusal 带 ackedAt 结算时间（注入的 clock 决定它是 ISO 串还是毫秒数）', kerr && kerr.ackedAt)
  ok(kerr !== null && kerr.ackedBy === 'r-1', '正（事实）：refusal 带 ackedBy 结算者', kerr && kerr.ackedBy)
  ok(kerr !== null && kerr.settledBy === 'ack' && kerr.alreadyAcked === true,
    '正（事实）：refusal 带 settledBy=ack 与 alreadyAcked=true', kerr && { settledBy: kerr.settledBy, alreadyAcked: kerr.alreadyAcked })
  // NO STATE MOVED: the delivery reading before and after the two repeat acks is identical.
  const after = deliverySnapshot(kernel)
  ok(sameShape(before, after),
    '正：两次重复 ack 之后交付读数逐字段不变（boxes/pending/acked/seq/notice）', { before, after })
  ok(after.acked === before.acked && after.pending === before.pending && after.seq === before.seq,
    '正：已结算数与待投递数与邮件序号都没动', { acked: [before.acked, after.acked], pending: [before.pending, after.pending], seq: [before.seq, after.seq] })
  // GENUINE UNKNOWN stays a different code — the two facts must not collapse into one.
  const unknown = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: ['ml-does-not-exist'] })
  ok(unknown.parsed && unknown.parsed.code === 'VMU_MAILBOX_ACK_UNKNOWN',
    '反：真正不存在的 id 仍然 ACK_UNKNOWN（两个事实两个名字）', unknown.parsed && unknown.parsed.code)

  // ATOMICITY: a list mixing a still-held row with a settled id must refuse BEFORE moving anything — the old loop
  // spliced the held row first and then threw on the settled one, so a refusal left state changed.
  const msg4 = await call(b, 'vibe_v5_message', { to: 'r-1', content: 'still open', subject: 'mix' })
  const pendingId = ((msg4.parsed || {}).mailIds || [])[0]
  const mixedErr = kernelAckError(kernel, 'r-1', [pendingId, targetId])
  ok(mixedErr !== null && mixedErr.code === 'VMU_MAILBOX_ALREADY_ACKED',
    '正（原子性）：混合列表（一条仍在 + 一条已结算）整体以 ALREADY_ACKED 拒绝', mixedErr && mixedErr.code)
  ok(kernel.mailbox.list('r-1').entries.some((e) => e.id === pendingId),
    '正（原子性）：拒绝发生在任何搬迁之前 —— 仍在的那条还在箱里（拒绝不改变状态）', kernel.mailbox.list('r-1').entries.map((e) => e.id))
  const settleSpill = await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: [pendingId] })
  ok(settleSpill.parsed && settleSpill.parsed.ok === true,
    'setup: 收尾把这条也结算掉（下面从空箱开始）', settleSpill.parsed && settleSpill.parsed.code)

  console.log('\n=== 4. 提示半：已结算行不再渲染 ack 指令（持旧箱副本的内核也不许教一次已完成的 ack） ===')
  // r-1 now has nothing pending; a second kernel over the SAME root folds the acked ledger on its read.
  const stale = await boot(root, { packs: ['v5r'] })
  const staleView = stale.kernel.mailbox.noticeLines('r-1')
  ok(staleView.count === 0 && staleView.acked === true,
    '正：另一个内核（同一 root）的 notice 块为空且 acked:true', { count: staleView.count, lines: staleView.lines })
  const staleText = JSON.stringify(staleView.lines) + ' ' + JSON.stringify(staleView.unackedRows)
  const staleClean = !staleText.includes('ml-does-not-exist') && !staleText.includes(targetId) && !staleText.includes(mailId)
  ok(staleClean,
    '正：已结算的 id 都不出现在任何提示行 / unackedRows 里', { targetId, mailId, lines: staleView.lines })
  ok(staleView.unackedRows.length === 0,
    '正：unackedRows 也为空（同一判据，不是只藏了行文本）', staleView.unackedRows)
  await closeBoot(stale)

  console.log('\n=== 5. status().notice：unackedRowsAllBoxes 与 perBox 同源，perBox 相加 === 合计 ===')
  // Send one row each to r-2 and r-3 so the aggregate has two boxes to add (r-1 is settled above).
  await call(b, 'vibe_v5_message', { to: 'r-2', content: 'row for r-2', subject: 'row-2' })
  await call(b, 'vibe_v5_message', { to: 'r-3', content: 'row for r-3', subject: 'row-3' })
  const st = kernel.mailbox.status()
  const nt = st.notice
  ok(nt.unackedRowsAllBoxes === 2 && nt.unackedRows === 2,
    '正：正名与实际合计都是 2（r-2、r-3 各一行）', { all: nt.unackedRowsAllBoxes, old: nt.unackedRows })
  const perBoxSum = Object.values(nt.perBox).reduce((a, b) => a + Number(b), 0)
  ok(perBoxSum === nt.unackedRowsAllBoxes,
    '正：独立求和 perBox 恰好等于 unackedRowsAllBoxes（同一次计算）', { perBoxSum, all: nt.unackedRowsAllBoxes })
  ok(nt.perBox['r-2'] === 1 && nt.perBox['r-3'] === 1 && nt.perBox['r-1'] === 0,
    '正：perBox 逐人正确（r-1 已清零，r-2/r-3 各 1）', nt.perBox)
  ok(Array.isArray(nt.pendingMembers) && nt.pendingMembers.join(',') === 'r-2,r-3',
    '正：pendingMembers 点名欠 ack 的人', nt.pendingMembers)
  ok(String(nt.means || '').includes('ALL-BOXES') && String(nt.means || '').includes('perBox'),
    '正：means 明说 unackedRows 是各箱合计、perBox 是拆分', nt.means)
  // The TOOL face carries the same reading through unchanged.
  const stTool = await call(b, 'vibe_vmu_mailbox', { action: 'status' })
  const ntTool = (stTool.parsed || {}).notice || {}
  ok(ntTool.unackedRowsAllBoxes === 2 && ntTool.perBox && ntTool.perBox['r-2'] === 1,
    '正：工具面 status 也带正名与 perBox（不是只有内核面有）', ntTool)
  // NEGATIVE: settling the last rows moves every reading to zero together.
  const rows2 = ((await call(b, 'vibe_vmu_mailbox', { action: 'list', member: 'r-2' })).parsed || {}).entries || []
  const rows3 = ((await call(b, 'vibe_vmu_mailbox', { action: 'list', member: 'r-3' })).parsed || {}).entries || []
  await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-2', ids: [rows2[0].id] })
  await call(b, 'vibe_vmu_mailbox', { action: 'ack', member: 'r-3', ids: [rows3[0].id] })
  await waitFor(() => kernel.mailbox.status().notice.acked === true)
  const nt0 = kernel.mailbox.status().notice
  ok(nt0.acked === true && nt0.ackRequired === false && nt0.unackedRowsAllBoxes === 0,
    '反：全部结算后 acked:true、合计 0', { acked: nt0.acked, all: nt0.unackedRowsAllBoxes })
  ok(Object.values(nt0.perBox).reduce((a, b) => a + Number(b), 0) === 0 && nt0.pendingMembers.length === 0,
    '反：perBox 全 0 且 pendingMembers 为空（同一口径一起归零）', nt0.perBox)
} finally {
  await closeBoot(b1)
  await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

console.log('\n=== RUN-255 MAIL RECEIPTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  console.error(failures.join('\n'))
  process.exitCode = 1
}
