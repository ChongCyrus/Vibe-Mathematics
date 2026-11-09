// tests/vmu-run268-mailbox-ack-reading.test.mjs — TB-2682 / task-165: 邮箱每行的 ackRequired / acked。
//
// 病因（实测更正，见 kernel/mailbox.js 的 ackReadsOf 注释）：内核此前只有 **view 级** 的
// `ackRequired`/`acked`（「整箱有没有东西要 ack」），没有 **行级** 的「这一行要不要 ack」；成员被要求逐行
// ack 时分不清哪一行欠 ack、哪一行是 group 广播不需要 ack。而且同名异形：`unackedRows` 在
// `status.notice` 里是**数字**，在 `noticeLines()` 的行里是**数组**。
//
// 这条判据只按**工具面回执**判定（不读被测代码的中间变量）：
//   ① pending 与 list 两条出口的每一行都有 `ackRequired`/`acked`，且 `typeof === 'boolean'`；
//   ② 需 ack 的 dm/mail 行 vs 不需要 ack 的 group 广播行，`ackRequired` **必须不同**（都 true 或都 false 即红）；
//   ③ ack 前后**同一个 id** 的 `acked` 从 false 翻到 true（同一行、同一判据，在 ack 回执里看见）。
// 另钉一条单一生产者：`tools/mailbox.js` 不得出现 `ackRequired`（工具面只转发内核读数，不拿第二把尺子量同一事实）。
//
// Run: node tests/vmu-run268-mailbox-ack-reading.test.mjs   (targeted only)
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TOOLS_SRC_PATH = join(REPO, 'vibe-math-vmu', 'tools', 'mailbox.js')
const KERNEL_SRC_PATH = join(REPO, 'vibe-math-vmu', 'kernel', 'mailbox.js')

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

const { boot } = await import(new URL('../scripts/sim/harness.mjs', import.meta.url).href)

const root = await mkdtemp(join(tmpdir(), 'vmu-run268-mailbox-ack-'))
try {
  const b = await boot({ root })
  const TOOLS_SRC = await readFile(TOOLS_SRC_PATH, 'utf8')
  const KERNEL_SRC = await readFile(KERNEL_SRC_PATH, 'utf8')

  // ── 0. 源码：单一生产者 ────────────────────────────────────────────────────────────────────────────────
  console.log('\n=== 0. 单一生产者：ackReadsOf 是唯一派生点，工具面不自算 ===')
  ok(!TOOLS_SRC.includes('ackRequired'), '★★ tools/mailbox.js 不出现 ackRequired（工具面只转发，不重算）', TOOLS_SRC.includes('ackRequired'))
  const calls = (KERNEL_SRC.match(/ackReadsOf\(/g) || []).length
  ok(calls >= 5, '★★ 内核 ackReadsOf 被 list/pending/noticeLines/ack 共用（调用点 >= 5）', calls)
  ok(KERNEL_SRC.includes('settledByAckOf'), '★ 派生从 ack 台账（settledByAckOf）取，不从箱子形状猜', KERNEL_SRC.includes('settledByAckOf'))

  // ── 1. 两条出口：每行都有两个布尔键 ──────────────────────────────────────────────────────────────────
  console.log('\n=== 1. pending 与 list 的每一行都带 bool ackRequired/acked ===')
  const dm = await b.call('vibe_vmu_mailbox', { action: 'send', from: 'r-1', to: 'r-2', text: 'RUN268 判定：这封 dm 需要回执。', subject: 'RUN268 dm 需 ack' })
  ok(dm && dm.ok === true && Array.isArray(dm.ids) && dm.ids.length === 1, '前置：一封 dm 真的入箱并回 id', dm)
  const dmId = dm && dm.ids && dm.ids[0]
  // group 广播行：用内核写入面构造（工具面 send 不接受 channel 形参；这里只造夹具，读数一律走工具面回执）。
  const grp = b.kernel.mailbox.send('r-acad', { to: 'r-2', text: 'RUN268 判定：这是 group 广播。', channel: 'group', subject: 'RUN268 group 广播' })
  ok(grp && Array.isArray(grp.ids) && grp.ids.length === 1, '前置：一条 channel=group 的广播行入箱', grp && grp.ids)
  const grpId = grp && grp.ids && grp.ids[0]

  const pend = await b.call('vibe_vmu_mailbox', { action: 'pending', member: 'r-2' })
  const pendRows = (pend && pend.entries) || []
  ok(pendRows.length >= 2, '前置：pending 至少两行（dm + group）', pendRows.length)
  const noKey = pendRows.filter((r) => typeof r.ackRequired !== 'boolean' || typeof r.acked !== 'boolean')
  ok(noKey.length === 0, '★★★ pending 每一行 ackRequired/acked 都是 boolean（缺一即红）', noKey.map((r) => ({ id: r.id, ackRequired: r.ackRequired, acked: r.acked })))

  const listOut = await b.call('vibe_vmu_mailbox', { action: 'list', member: 'r-2', status: 'all' })
  const listRows = (listOut && listOut.entries) || []
  ok(listRows.length >= 2, '前置：list 至少两行', listRows.length)
  const noKey2 = listRows.filter((r) => typeof r.ackRequired !== 'boolean' || typeof r.acked !== 'boolean')
  ok(noKey2.length === 0, '★★★ list 每一行 ackRequired/acked 都是 boolean（两条出口同一判据）', noKey2.map((r) => ({ id: r.id, ackRequired: r.ackRequired, acked: r.acked })))

  // ── 2. 行级区分：需 ack 的 dm vs 不需 ack 的 group，必须不同 ────────────────────────────────────────
  console.log('\n=== 2. 行级区分：dm 需 ack / group 广播不需 ack（两者必须不同） ===')
  const dmRow = pendRows.filter((r) => String(r.id) === String(dmId))[0]
  const grpRow = pendRows.filter((r) => String(r.id) === String(grpId))[0]
  ok(!!dmRow && dmRow.channel === 'mail', '★ dm 行在 pending 里可见，channel=mail', dmRow && { id: dmRow.id, channel: dmRow.channel })
  ok(!!grpRow && grpRow.channel === 'group', '★ group 广播行在 pending 里可见，channel=group', grpRow && { id: grpRow.id, channel: grpRow.channel })
  ok(!!dmRow && !!grpRow && dmRow.ackRequired !== grpRow.ackRequired,
    '★★★ 需 ack 的行与不需 ack 的行，ackRequired 必须不同（都 true/都 false 即红）',
    { dm: dmRow && dmRow.ackRequired, group: grpRow && grpRow.ackRequired })
  ok(!!dmRow && dmRow.ackRequired === true, '★★ 方向：mail 行 ackRequired:true', dmRow && dmRow.ackRequired)
  ok(!!grpRow && grpRow.ackRequired === false, '★★ 方向：group 广播行 ackRequired:false', grpRow && grpRow.ackRequired)
  ok(!!dmRow && dmRow.acked === false, '★ ack 之前同一行 acked:false', dmRow && dmRow.acked)

  // ── 3. ack 前后同一 id：acked false → true ──────────────────────────────────────────────────────────
  console.log('\n=== 3. ack 之后同一个 id 的 acked 从 false 翻到 true（同一行、同一判据） ===')
  const ackedOut = await b.call('vibe_vmu_mailbox', { action: 'ack', member: 'r-2', ids: [dmId] })
  ok(ackedOut && ackedOut.ok === true && Array.isArray(ackedOut.acked) && ackedOut.acked.map(String).indexOf(String(dmId)) >= 0,
    '前置：ack 回执承认结算了这个 id', ackedOut && ackedOut.acked)
  const settledRow = ((ackedOut && ackedOut.rows) || []).filter((r) => String(r.id) === String(dmId))[0]
  ok(!!settledRow, '★ ack 回执 rows 里出现同一 id（结算事实有回执面）', (ackedOut && ackedOut.rows) || null)
  ok(!!settledRow && settledRow.acked === true, '★★★ ack 之后同一行 acked:true（false→true，同一判据）', settledRow && settledRow.acked)
  ok(!!settledRow && settledRow.ackRequired === false, '★★ 结算后 ackRequired:false（欠账已清，不再要求 ack）', settledRow && settledRow.ackRequired)

  const pendAfter = await b.call('vibe_vmu_mailbox', { action: 'pending', member: 'r-2' })
  // The shared mailbox key is written ASYNCHRONOUSLY and every read face folds it in first, so a read that lands before
  // the ack push settles would legitimately resurrect the row from the pre-ack snapshot (the documented shared-queue
  // merge race). Wait for the write to land before judging "it left the box".
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const gone = async () => {
    for (let i = 0; i < 200; i += 1) {
      const now = await b.call('vibe_vmu_mailbox', { action: 'pending', member: 'r-2' })
      const rows = (now && now.entries) || []
      if (!rows.some((r) => String(r.id) === String(dmId))) return now
      await sleep(5)
    }
    return await b.call('vibe_vmu_mailbox', { action: 'pending', member: 'r-2' })
  }
  const pendSettled = await gone()
  const stillThere = ((pendSettled && pendSettled.entries) || []).filter((r) => String(r.id) === String(dmId))
  ok(stillThere.length === 0, '★ ack 后该行离开 pending（结算就是离开箱；等共享队列落盘）', stillThere.map((r) => r.id))
  const grpStill = ((pendSettled && pendSettled.entries) || []).filter((r) => String(r.id) === String(grpId))
  ok(grpStill.length === 1 && grpStill[0].ackRequired === false, '★ 未 ack 的 group 广播行仍在 pending 且 ackRequired:false', grpStill.map((r) => ({ id: r.id, ackRequired: r.ackRequired })))
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('')
console.log('=== RUN 268 MAILBOX ACK READING: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('failures:', JSON.stringify(failures, null, 2)); process.exit(1) }
