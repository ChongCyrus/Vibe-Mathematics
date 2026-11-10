// tests/vmu-run248-notice-delivery.test.mjs — RUN 248-N / task-65: 预约会议与主席发言的【投递】。
//
// 用户 2026-11-06 指出的两处真缺口，这一条套件逐条钉住：
//   ① 「预约会议只在总线上发事件，没有投递到被邀成员的回合提示」——现在 `kernel/meetings.js` 的 open（无论从哪个面
//      调用）给每个被邀成员写一条**耐久 mailbox 行**（channel 'mail'），回执 `notified`/`notifyFailed` 逐人报账；
//      `kernel/index.js` 的 noticeSource 把这些行交给 pack 的 noticeBlock，真正进到成员的回合提示里（非破坏性：
//      只有 ack 才结算）。
//   ④ 「会议只有拉取式纪要，没有主席对全体参会成员的推送」——主席 `speak` 时给每个在席成员（不含发言人）写一条
//      channel 'group' 的耐久行，subject 带发言人+会议，正文摘要 ≤800 字符 + 指向纪要/转录的全文指针，回执
//      `deliveredTo`。
//   另钉：mailbox 行的 `channel` 三通道（mail/dm/group）在 read/list 面可见（台账 D2 取证）；同 to+subject+dedupeKey
//   幂等；重启（新内核 over 同一 root）后未读行仍在、notice 块内容一致；ack 后该行从 notice 块消失；所办（主席）
//   不在收件人里；excerpt 截断到 800。
//
// 全部通过真实入口（vibe-math-vmu.js，packs:['v5r']）驱动：pack 提供 noticeBlock，内核提供服务面与 mailbox，
// 不复制任何被测逻辑。
//
// Run: node tests/vmu-run248-notice-delivery.test.mjs   (targeted only)
import { existsSync, mkdirSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const MEETINGS = join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')

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

// A MUTABLE clock so a scheduled appointment has a real future time and the restart runs at the same instant.
let NOW = 1700000000000
const entry = await import(pathToFileURL(ENTRY).href)
const meetingsMod = await import(pathToFileURL(MEETINGS).href)

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
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  const raw = await spec.execute(args, {})
  try { return { raw, parsed: JSON.parse(raw) } } catch (e) { return { raw, parsed: undefined } }
}

// TB-2695: a proof must build its own evidence on any machine. D:/_tmp is only a fast local disk when it exists;
// otherwise use the OS temp dir. VMU_TEST_TMP_ROOT still overrides both (same fallback as tests/repo-hygiene.test.mjs:23).
const TMP_ROOT = process.env.VMU_TEST_TMP_ROOT || (existsSync('D:/_tmp') ? 'D:/_tmp' : tmpdir())
mkdirSync(TMP_ROOT, { recursive: true })
const root = await mkdtemp(join(TMP_ROOT, 'vmu-run248-notice-'))
try {
  const b = await boot(root, { packs: ['v5r'] })
  const kernel = b.kernel
  const svc = kernel.meetings
  const box = kernel.mailbox
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  await kernel.members.hire({ id: 'r-3', slot: 'member' })

  // ── 0. preconditions ────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== 0. the fixture has the faces this lane needs (non-empty precondition) ===')
  ok(kernel.members.roster().length === 4, 'setup: a chair and three members really exist (RULE E)', kernel.members.roster().map((m) => m.id))
  ok(typeof box.noticeLines === 'function' && typeof box.send === 'function' && typeof box.ack === 'function',
    'setup: the mailbox exposes send/ack/noticeLines (the durable mail face this lane is built on)',
    typeof box.noticeLines)
  ok(typeof svc.open === 'function' && typeof svc.speak === 'function' && typeof svc.attend === 'function',
    'setup: the meetings service exposes open/speak/attend')

  // ── 1. APPOINTMENT: every invitee gets ONE durable 'mail' row; the convener does not ────────────────────────
  console.log('\n=== 1. 预约：每个被邀成员一条耐久 mail 行，回执 notified/notifyFailed 逐人报账 ===')
  const AT = NOW + 3600 * 1000
  const appointed = svc.open({
    id: 'm-appoint-1', type: 'ordinary', kind: 'planning', chair: 'r-chair', actor: 'r-chair',
    members: ['r-chair', 'r-1', 'r-2', 'r-3'], at: AT,
    title: '周会：通知投递', subject: '通知投递缺口', materials: '议程一：预约投递；议程二：主席推送',
  })
  ok(appointed.ok === true && appointed.state === 'scheduled' && appointed.scheduledFor === AT,
    'setup: a SCHEDULED meeting really exists (state scheduled, scheduledFor recorded)', { state: appointed.state, at: appointed.scheduledFor })
  ok(Array.isArray(appointed.notified) && appointed.notified.length === 3
    && appointed.notified.slice().sort().join(',') === 'r-1,r-2,r-3',
    '★ 回执 notified 逐人列出被通知的成员（roster 减主席，恰好三人）', appointed.notified)
  ok(Array.isArray(appointed.notifyFailed) && appointed.notifyFailed.length === 0,
    '★ notifyFailed 为空是【断言】（每个被邀者都拿到了一行），不是「没看」', appointed.notifyFailed)
  ok(Array.isArray(appointed.notifyRows) && appointed.notifyRows.length === 3 && appointed.notifyRows.every((r) => typeof r.mailId === 'string' && r.mailId !== ''),
    '★ notifyRows 把每个成员收到的那一行 id 也报出来（可追溯到具体邮件）', appointed.notifyRows)
  ok(appointed.receipt && Array.isArray(appointed.receipt.notified) && appointed.receipt.notified.length === 3,
    '★ 同一份投递结果也进了 receipt（读回执的人不用知道返回包的信封形状）', appointed.receipt && appointed.receipt.notified)

  const rowsOf = (member) => box.list(member).entries
  const chairRows = rowsOf('r-chair')
  ok(chairRows.length === 0, '★ 所办（主席/召集人）不在收件人里：他自己的信箱里没有这条预约', chairRows)
  const r1Rows = rowsOf('r-1').filter((e) => e.kind === 'meeting-appointment')
  ok(r1Rows.length === 1, '★ 被邀成员 r-1 的信箱里恰好一条预约行（不重复堆积）', r1Rows)
  ok(r1Rows.length === 1 && r1Rows[0].channel === 'mail', '★ 该行的 channel 是 mail（预约=耐久邮件，台账 D2 的邮箱通道证据）', r1Rows[0] && r1Rows[0].channel)
  ok(r1Rows.length === 1 && r1Rows[0].read === false, '★ 新行未读（notice 块靠未读/todo 决定是否显示）', r1Rows[0] && r1Rows[0].read)

  // The notice line is readable BEFORE anybody opens the body: delivery is the turn-facing surface.
  const isoAt = new Date(AT).toISOString()
  const notice1 = box.noticeLines('r-1')
  ok(notice1.ok === true && notice1.lines.length === 1,
    '★ noticeLines(r-1) 恰好一行（此处 r-1 只有这一条投递）', notice1.lines)
  const line = notice1.lines[0] || ''
  ok(line.startsWith('【会议预约·r-chair】'), '★ notice 行以【会议预约·主席】开头', line)
  ok(line.includes('周会：通知投递') && line.includes(' @ ' + isoAt),
    '★ 行里有 title 与 @ scheduledFor', line)
  ok(line.includes('vibe_v5_meeting {op:"attend", id:"m-appoint-1", member:"r-1"}'),
    '★ 行里有可达的 attend 调用', line)
  ok(/mailbox ack ml-\d+/.test(line), '★ 行里有「读后 mailbox ack <id>」的结算指引（id 在读取时替换）', line)

  const opened1 = r1Rows.length === 1 ? box.open('r-1', r1Rows[0].id) : null
  const body = opened1 && opened1.entry ? String(opened1.entry.text) : ''
  ok(body.includes('m-appoint-1') && body.includes('r-chair'),
    '★ 正文写明是哪场会、主席是谁', body.slice(0, 160))
  ok(body.includes('ordinary') && body.includes('planning'),
    '★ 正文含会议类型 type 与 kind', body.slice(0, 200))
  ok(body.includes('议程一：预约投递'), '★ 正文含议题/materials', body.slice(0, 260))
  ok(body.includes(isoAt) && body.includes('scheduledFor'),
    '★ 正文的时间用部署时钟格式（ISO）+ 字段名 scheduledFor', { isoAt, has: body.includes(isoAt) })
  ok(body.includes('你的席位：member'),
    '★ 正文写该成员的席位（从成员服务读，不是猜的）', body.slice(-260))
  ok(body.includes('vibe_v5_meeting {op:"attend", id:"m-appoint-1", member:"r-1"}'),
    '★★ 正文给出【可直接照抄】的 attend 调用形状（本成员 id 已代入）', body.slice(-300))
  ok(body.includes('vibe_vmu_meeting {action:"attend", id:"m-appoint-1", member:"r-1"}'),
    '★ 并给出当前内核面等价的调用（reachable face 不被藏起来）', body.slice(-300))


  // reading does not settle the row: the notice is NON-destructive (open() only marks read)
  const noticeAfterRead = box.noticeLines('r-1')
  ok(noticeAfterRead.lines.length === 1 && noticeAfterRead.lines[0] === line,
    '★★ 非破坏性：open() 读过正文之后 notice 行仍在，且逐字相同（read 不等于结算，只有 ack 才结算）', noticeAfterRead.lines)

  // ── 2. IDEMPOTENCE: same to+subject+dedupeKey does not pile up ──────────────────────────────────────────────
  console.log('\n=== 2. 幂等：同 to+subject+dedupeKey 重复投递不重复堆积 ===')
  const first = box.send('r-chair', { to: 'r-2', text: '重复投递探针', subject: '幂等探针', kind: 'meeting-appointment', channel: 'mail', dedupeKey: 'probe:d01' })
  const again = box.send('r-chair', { to: 'r-2', text: '重复投递探针', subject: '幂等探针', kind: 'meeting-appointment', channel: 'mail', dedupeKey: 'probe:d01' })
  ok(first.ok === true && again.ok === true && again.deduped.length === 1 && again.deduped[0] === first.ids[0],
    '★ 同一 dedupeKey 的第二封复用第一封的 id（不新增行）', { first: first.ids, again: again.deduped })
  ok(rowsOf('r-2').filter((e) => e.subject === '幂等探针').length === 1,
    '★ 信箱里只有一行（没有堆积）', rowsOf('r-2').filter((e) => e.subject === '幂等探针').length)
  const otherKey = box.send('r-chair', { to: 'r-2', text: '重复投递探针', subject: '幂等探针', kind: 'meeting-appointment', channel: 'mail', dedupeKey: 'probe:d02' })
  ok(otherKey.ok === true && rowsOf('r-2').filter((e) => e.subject === '幂等探针').length === 2,
    '★ 换个 dedupeKey 是一封新邮件（去重按声明的键，不按正文猜）', otherKey.ids)

  // ── 3. DURABILITY: a NEW kernel over the SAME root still sees the unread rows, same notice block ────────────
  console.log('\n=== 3. 耐久：新内核 over 同一 root 仍见未读行，断点前后 notice 块内容一致 ===')
  const noticesBefore = box.noticeLines('r-3').lines.slice()
  ok(noticesBefore.length === 1 && noticesBefore[0].startsWith('【会议预约·r-chair】'),
    'setup: r-3 的 notice 行在重启前存在（否则「重启后还在」是同义反复）', noticesBefore)
  await waitFor(() => {
    try { const stored = kernel.store.read('mailbox'); return !!(stored && stored.data && stored.data.boxes && Object.keys(stored.data.boxes).length > 0) } catch (e) { return false }
  }, 3000)
  const b2 = await boot(root, { packs: ['v5r'] })
  const k2 = b2.kernel
  const r3After = k2.mailbox.list('r-3').entries.filter((e) => e.kind === 'meeting-appointment')
  ok(r3After.length === 1 && r3After[0].read === false,
    '★★ 重启（新内核 over 同一 root）后未读预约行仍在（durable，不是内存里的残影）', r3After)
  ok(r3After.length === 1 && r3After[0].channel === 'mail',
    '★ 重启后 channel 仍在（耐久行带着三通道证据过断点）', r3After[0] && r3After[0].channel)
  const noticesAfter = k2.mailbox.noticeLines('r-3').lines.slice()
  ok(noticesAfter.length === noticesBefore.length && noticesAfter.join(String.fromCharCode(10)) === noticesBefore.join(String.fromCharCode(10)),
    '★★ 断点前后 notice 块内容逐字一致（id 在读取时渲染，所以合并/重编号不会漂移）', { before: noticesBefore, after: noticesAfter })
  ok(box.noticeLines('r-1').lines.length === 1,
    '★★ 读过正文≠结算：上一节 open() 过的那一行在重启后仍在 notice 块里（read 只改标记）', box.noticeLines('r-1').lines)

  // ── 4. ACK: the line disappears from the notice block, the row is settled ───────────────────────────────────
  console.log('=== 4. ack：行从 notice 块消失，且只有 ack 才结算 ===')
  const targetId = r3After[0] && r3After[0].id
  const acked = k2.mailbox.ack('r-3', [targetId])
  ok(acked.ok === true && acked.acked.length === 1 && acked.acked[0] === targetId,
    '★ ack 结算了那一行', acked.acked)
  // the write-through is COALESCED and asynchronous: poll until the shared key reports the settlement, then assert.
  await waitFor(() => k2.mailbox.noticeLines('r-3').lines.length === 0, 3000)
  const noticesSettled = k2.mailbox.noticeLines('r-3')
  ok(noticesSettled.ok === true && noticesSettled.lines.length === 0,
    '★★ ack 之后该行从 notice 块消失（不再出现在回合提示里）', noticesSettled.lines)
  // TB-2606-B: the notice BLOCK now also hides rows the ack ledger settled, so "lines.length === 0" alone no longer
  // proves the row left the BOX — a stale box copy can still be visible through list() until the shared merge folds
  // the ledger. Wait for the box itself to settle, then assert the delivery row is gone (the settlement, not the text).
  await waitFor(() => k2.mailbox.list('r-3').entries.filter((e) => e.kind === 'meeting-appointment').length === 0, 3000)
  ok(k2.mailbox.list('r-3').entries.filter((e) => e.kind === 'meeting-appointment').length === 0,
    '★ 信箱里也读不到它了（搬到 acked 台账，不是删掉）', k2.mailbox.list('r-3').entries)
  await waitFor(() => box.noticeLines('r-3').lines.length === 0, 3000)
  ok(box.noticeLines('r-3').lines.length === 0,
    '★ 第一个内核也看到结算（同一 durable 台账 + 结算台账，不是每个内核各有一本账）', box.noticeLines('r-3').lines)

  // ── 5. THE KERNEL FACE: action appoint / schedule reach the same door, with the same delivery ───────────────
  console.log('\n=== 5. 内核面 appoint/schedule：同一扇门、同一份投递回执 ===')
  const viaAppoint = await call(b2, 'vibe_vmu_meeting', { action: 'appoint', id: 'm-appoint-2', member: 'r-chair', members: ['r-chair', 'r-1', 'r-2'], title: '内核面预约', materials: '内核面议程', type: 'ordinary' })
  ok(viaAppoint.parsed && viaAppoint.parsed.ok === true && viaAppoint.parsed.registry === 'service' && viaAppoint.parsed.appointment === 'appointed',
    '★★ action=appoint 真的开出了服务会议（registry 与 appointment 都具名）', viaAppoint.parsed && { ok: viaAppoint.parsed.ok, registry: viaAppoint.parsed.registry, code: viaAppoint.parsed.code })
  ok(viaAppoint.parsed && Array.isArray(viaAppoint.parsed.notified) && viaAppoint.parsed.notified.slice().sort().join(',') === 'r-1,r-2',
    '★★ 内核面回执同样逐人报 notified（投递不依赖入口是哪一个）', viaAppoint.parsed && viaAppoint.parsed.notified)
  const noAt = await call(b2, 'vibe_vmu_meeting', { action: 'schedule', member: 'r-chair', members: ['r-chair', 'r-1'], id: 'm-sched-missing' })
  ok(noAt.parsed && noAt.parsed.ok !== true && noAt.parsed.code === 'VMU_INVALID_ARGUMENT' && /needs `at`/.test(String(noAt.parsed.message)),
    '★ schedule 缺 at 具名拒（不说「undefined」）', noAt.parsed && { code: noAt.parsed.code, message: noAt.parsed.message })
  const at2 = NOW + 7200 * 1000
  const viaSchedule = await call(b2, 'vibe_vmu_meeting', { action: 'schedule', id: 'm-appoint-3', member: 'r-chair', members: ['r-chair', 'r-1', 'r-2', 'r-3'], title: '定时预约', at: new Date(at2).toISOString() })
  ok(viaSchedule.parsed && viaSchedule.parsed.ok === true && viaSchedule.parsed.state === 'scheduled' && viaSchedule.parsed.scheduledFor === at2,
    '★ action=schedule 把 at 变成 scheduledFor（读回与写入一致）', viaSchedule.parsed && { state: viaSchedule.parsed.state, at: viaSchedule.parsed.scheduledFor })
  ok(viaSchedule.parsed && Array.isArray(viaSchedule.parsed.notified) && viaSchedule.parsed.notified.length === 3,
    '★ 定时会议同样给三个被邀成员各投一条', viaSchedule.parsed && viaSchedule.parsed.notified)

  // ── 6. CHAIR PUSH: speak pushes to every present member, excerpt <=800 + pointer; ordinary speech does not ──
  console.log('\n=== 6. 主席推送：speak 给每个在席成员一条 group 行，摘要 ≤800 + 全文指针 ===')
  const live = svc.open({ id: 'm-floor-1', type: 'ordinary', kind: 'academic', chair: 'r-chair', actor: 'r-chair', members: ['r-chair', 'r-1', 'r-2', 'r-3'], title: '主席推送会', subject: '推送' })
  for (const member of ['r-1', 'r-2', 'r-3']) svc.attend({ meeting: 'm-floor-1', member })
  const attends = ['r-1', 'r-2', 'r-3'].map((member) => svc.attend({ meeting: 'm-floor-1', member }))
  // RULE E 非空守卫（audit-declaration-criterion 的 A 类指纹要的就是它）：集合一次都没被填满时，
  // 下面的 every() 会在空集上"通过"，等于什么都没测。
  ok(attends.length === 3, 'A: attends 集合真的有三条（非空守卫；空集上的 every 是空对空）', attends.length)
  ok(live.ok === true && attends.every((r) => r && r.ok === true),
    'setup: 全体在席（三次 attend 全部成功；不用 open 时的 present 快照）', attends.map((r) => r && r.ok))
  const LONG = '主席对全体的发言。'.repeat(150) // 1200 chars (600 CJK chars * 2) — longer than the 800 excerpt cap
  const spoke = svc.speak({ meeting: 'm-floor-1', member: 'r-chair', text: LONG })
  ok(spoke.ok === true && Array.isArray(spoke.deliveredTo) && spoke.deliveredTo.slice().sort().join(',') === 'r-1,r-2,r-3',
    '★★ 主席对全体发言 ⇒ deliveredTo 逐人列出每个在席成员（不含发言人）', spoke.deliveredTo)
  ok(Array.isArray(spoke.broadcastFailed) && spoke.broadcastFailed.length === 0,
    '★ broadcastFailed 为空是断言（没有人被静默丢掉）', spoke.broadcastFailed)
  ok(spoke.receipt && Array.isArray(spoke.receipt.deliveredTo) && spoke.receipt.deliveredTo.length === 3,
    '★ 同一份推送结果也在 receipt 里', spoke.receipt && spoke.receipt.deliveredTo)
  const groupRows = box.list('r-2').entries.filter((e) => e.kind === 'meeting-broadcast')
  ok(groupRows.length === 1 && groupRows[0].channel === 'group',
    '★★ 在席成员拿到一条 channel=group 的耐久行（台账 D2 的群聊通道证据）', groupRows)
  ok(groupRows.length === 1 && String(groupRows[0].subject).includes('r-chair') && String(groupRows[0].subject).includes('m-floor-1'),
    '★ subject 带发言人 + 会议 id', groupRows[0] && groupRows[0].subject)
  const groupBody = groupRows.length === 1 ? String(box.open('r-2', groupRows[0].id).entry.text) : ''
  ok(groupBody.includes('/minutes#1'), '★ 正文指向纪要条目（全文指针）', groupBody.slice(0, 300))
  const excerptPart = groupBody.includes('摘要（≤800 字符）：') ? groupBody.split('摘要（≤800 字符）：')[1].split('\n')[0] : ''
  ok(excerptPart.length <= 800 && excerptPart.length > 0,
    '★★ excerpt 截断：摘要长度 ≤ 800 字符（原文 1200 字符）', { excerptLen: excerptPart.length })
  ok(excerptPart.endsWith('…'), '★★ 截断处有省略号（截断是被计数的，不是静默丢字）', excerptPart.slice(-8))
  ok(LONG.indexOf(excerptPart.replace('…', '')) === 0, '★ 摘要是原文的前缀（截断不重排内容）', excerptPart.slice(0, 20))
  ok(box.list('r-chair').entries.filter((e) => e.kind === 'meeting-broadcast').length === 0,
    '★ 发言人自己不在收件人里（所办不在收件人）', box.list('r-chair').entries.filter((e) => e.kind === 'meeting-broadcast').length)
  const groupNotice = box.noticeLines('r-2').lines.filter((l) => l.startsWith('【主席发言·'))
  ok(groupNotice.length === 1 && groupNotice[0].includes('mailbox ack ml-'),
    '★ 群聊行同样进 notice 块（带 ack 指引）', groupNotice)
  const memberSpoke = svc.speak({ meeting: 'm-floor-1', member: 'r-1', text: '普通成员的一句发言' })
  ok(memberSpoke.ok === true && memberSpoke.deliveredTo.length === 0 && memberSpoke.broadcastFailed.length === 0,
    '★ 普通成员发言不推送（deliveredTo 空，且不是失败：这是声明的门）', memberSpoke.deliveredTo)
  ok(box.list('r-2').entries.filter((e) => e.kind === 'meeting-broadcast').length === 1,
    '★ 普通发言没有增加任何群聊行（邮件量不随发言数爆炸）', box.list('r-2').entries.filter((e) => e.kind === 'meeting-broadcast').length)

  // ── 7. THREE CHANNELS EVIDENCE: mail / dm / group are all visible on the read faces ─────────────────────────
  console.log('\n=== 7. 三通道取证：mail / dm / group 在 read/list 面可见，非法通道具名拒 ===')
  const dm = box.send('office', { to: 'r-3', text: '私信探针', subject: '私信', channel: 'dm' })
  ok(dm.ok === true && dm.channel === 'dm', '★ dm 行写入成功且回执照实', dm.channel)
  const dmRow = box.list('r-3').entries.filter((e) => e.subject === '私信')
  ok(dmRow.length === 1 && dmRow[0].channel === 'dm', '★ dm 通道在 list 面可见（D2 的私信证据）', dmRow)
  const channelsSeen = new Set(box.list('r-1').entries.map((e) => e.channel))
  ok(channelsSeen.has('mail') && channelsSeen.has('group'),
    '★ 同一成员的信箱里同时出现 mail 与 group（三通道可区分，不是都被默认成一种）', [...channelsSeen])
  const defaulted = box.send('office', { to: 'r-3', text: '默认通道探针', subject: '默认' })
  ok(defaulted.ok === true && defaulted.channel === 'mail' && box.list('r-3').entries.filter((e) => e.subject === '默认')[0].channel === 'mail',
    '★ 不写 channel ⇒ 默认 mail（向后兼容）', defaulted.channel)
  let badChannel = null
  try { box.send('office', { to: 'r-3', text: '非法通道', channel: 'telegram' }) } catch (e) { badChannel = e }
  ok(badChannel && badChannel.code === 'VMU_INVALID_ARGUMENT' && /channel/.test(String(badChannel.message)),
    '★ 未知通道具名拒（不静默降级成 mail）', badChannel && { code: badChannel.code, message: badChannel.message })

  // ── 8. END TO END: the pack noticeBlock really carries the notice into the turn text ────────────────────────
  console.log('\n=== 8. 端到端：pack 的 noticeBlock 真的把预约行送进成员的回合文本 ===')
  svc.open({ id: 'm-turn-1', type: 'ordinary', kind: 'planning', chair: 'r-chair', actor: 'r-chair', members: ['r-chair', 'r-1'], at: NOW + 1800 * 1000, title: '回合提示会', materials: '回合提示议程' })
  const turnOpen = kernel.turn.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1 })
  ok(turnOpen && turnOpen.ok === true && turnOpen.turn, 'setup: the member turn really opens', turnOpen && { ok: turnOpen.ok })
  const assembled = await kernel.turn.assemble(turnOpen.turn)
  const text = String(assembled && assembled.text)
  ok(/\[新到的消息\]/.test(text), '★ 回合文本里有 pack 的 notice 块头（[新到的消息]）', text.slice(0, 120))
  ok(text.includes('【会议预约·r-chair】') && text.includes('m-turn-1'),
    '★★ 预约行真的进了成员的回合提示（这是缺口①的落点）', text.slice(0, 400))
  ok(text.includes('vibe_v5_meeting {op:"attend", id:"m-turn-1", member:"r-1"}'),
    '★ 提示里带着可直接照抄的 attend 调用', text.slice(0, 500))
  ok(text.includes('mailbox ack ml-'), '★ 提示里带着 ack 结算指引', text.slice(0, 500))

  // ... and after ack the line is gone from the NEXT assembly.
  const targets = box.noticeLines('r-1').entries.filter((e) => e.subject.includes('回合提示会'))
  box.ack('r-1', targets.map((e) => e.id))
  const turnOpen2 = kernel.turn.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 2 })
  const assembled2 = await kernel.turn.assemble(turnOpen2.turn)
  const text2 = String(assembled2 && assembled2.text)
  ok(!text2.includes('m-turn-1'),
    '★★ ack 之后再装配：该行从回合提示里消失（不是缓存了旧块）', text2.slice(0, 300))
  ok(text2.includes('m-floor-1/minutes#1'),
    '★ 同时别的未结算投递仍在（消失的是被 ack 的那一条，不是整个块被吞掉）', text2.slice(0, 400))
// ── 10. 条数上限与顺序：notice 块最多 8 条、按时间倒序（新→旧），truncated 明说 ────────────────────
console.log('=== 10. 上限与顺序：notice 块最多 8 条、新在前（不是无限灌进提示词） ===')
for (let i = 0; i < 10; i += 1) kernel.mailbox.send('office', { to: 'r-2', text: '上限探针 ' + i, subject: 'cap-' + i, kind: 'probe', channel: 'mail' })
const capped = kernel.mailbox.noticeLines('r-2')
ok(capped.ok === true && capped.lines.length === 8 && capped.total >= 10 && capped.truncated === true,
  '★ 10 条未读 ⇒ 只渲染 8 条，且回执明说 truncated（读数不假装全给了）', { count: capped.count, total: capped.total, truncated: capped.truncated })
ok(capped.entries[0].subject === 'cap-9' && capped.entries[7].subject === 'cap-2',
  '★★ 顺序是时间倒序（cap-9 最新在前，cap-2 第八）', capped.entries.map((e) => e.subject))
ok(capped.lines.length === 8, 'A: capped.lines 非空守卫（8 条才谈得上"每行都不超"）', capped.lines.length)
ok(capped.lines.every((l) => l.length <= 800), '★ 每行都不超过 800 字符（截断由渲染面负责）', capped.lines.map((l) => l.length))

// ── 11. PACK CONVENE: exactly ONE row / ONE notice line per invitee (the RUN 248 double send stays dead) ─────
console.log('=== 11. pack convene：每被邀成员恰 1 行、notice 块恰 1 行，回执是内核的逐字回显 ===')
const packConvened = await call(b, 'vibe_v5_meeting', { member: 'r-chair', agenda: ['钉住一行'], title: '单发验收会' })
const packReceipt = (packConvened && packConvened.parsed) || {}
ok(packConvened && packConvened.parsed && packConvened.parsed.ok === true, 'setup: the pack convened through its own face', packReceipt)
ok(Array.isArray(packReceipt.notified) && packReceipt.notified.length === 3 &&
  packReceipt.notified.slice().sort().join(',') === 'r-1,r-2,r-3',
  '★ pack 回执回显内核 notified（恰两名被邀成员，不含主席）', packReceipt.notified)
ok(Array.isArray(packReceipt.notifyRows) && packReceipt.notifyRows.length === 3 &&
  packReceipt.notifyRows.every((x) => x && String(x.member) !== '' && String(x.mailId) !== ''),
  '★ pack 回执回显 notifyRows（每条都带 member + mailId）', packReceipt.notifyRows)
ok(Array.isArray(packReceipt.notifyFailed) && packReceipt.notifyFailed.length === 0,
  '★ 健康内核里 notifyFailed 为空（回显里没有编造的失败）', packReceipt.notifyFailed)
ok(packReceipt.invitation && packReceipt.invitation.kind === 'meeting-appointment' &&
  Array.isArray(packReceipt.invitation.delivered) && packReceipt.invitation.delivered.length === 3,
  '★★ invitation 块是回执的 echo（kind meeting-appointment，delivered 两名成员），不是本面自己发的',
  packReceipt.invitation && { kind: packReceipt.invitation.kind, delivered: packReceipt.invitation.delivered })
ok(packReceipt.invitation && (packReceipt.invitation.delivered || []).map((d) => String(d.member)).sort().join(',') ===
  (packReceipt.notified || []).map(String).sort().join(','),
  '★★ delivered 与 notified 是同一份名单（回显不说两套话）',
  { delivered: packReceipt.invitation && packReceipt.invitation.delivered, notified: packReceipt.notified })
const packMeetingId = String(packReceipt.meeting && packReceipt.meeting.id ? packReceipt.meeting.id : packReceipt.meeting)
for (const who of ['r-1', 'r-2', 'r-3']) {
  const rows = box.list(who).entries.filter((e) => e.kind === 'meeting-appointment' &&
    String(e.subject).includes('单发验收会'))
  ok(rows.length === 1, '★★ ' + who + ' 恰 1 行 meeting-appointment（双发被加回来会变 2 行而红）', rows.map((r) => r.id))
  ok(rows.length === 1 && rows[0].channel === 'mail', '★ 那行 channel 是 mail（台账的邮箱证据）', rows[0] && rows[0].channel)
  const lines = box.noticeLines(who).lines.filter((l) => l.includes('单发验收会'))
  ok(lines.length === 1, '★★ ' + who + ' 的 notice 块恰 1 行（不是 2 行）', lines)
  ok(rows.length === 1 && box.open(who, rows[0].id).entry.text.includes(packMeetingId),
    '★ 那一行正文指向真的会议 id（回显没把会议弄丢）', packMeetingId)
}

// ── 12. op ALIAS: the vocabulary the notice prints really works through the pack (提示即承诺) ────────────────
console.log('\n=== 12. op 别名与「提示即承诺」：{op:"appoint"} 真回 notified，{op:"schedule"} 真预约，{op:"attend"} 真能入席 ===')
const opAppoint = await call(b, 'vibe_v5_meeting', { op: 'appoint', member: 'r-chair', agenda: ['别名验收'], title: '别名预约会' })
ok(opAppoint.parsed && opAppoint.parsed.ok === true && opAppoint.parsed.appointment === 'appoint',
  '★ {op:"appoint"} 走通 convene 路径（词表不是摆设）', opAppoint.parsed && { ok: opAppoint.parsed.ok, appointment: opAppoint.parsed.appointment })
ok(Array.isArray(opAppoint.parsed && opAppoint.parsed.notified) && opAppoint.parsed.notified.length === 3,
  '★★ {op:"appoint"} 的回执真的报 notified（预约即投递）', opAppoint.parsed && opAppoint.parsed.notified)
const opMeetingId = String(opAppoint.parsed && opAppoint.parsed.meeting && opAppoint.parsed.meeting.id
  ? opAppoint.parsed.meeting.id
  : opAppoint.parsed && opAppoint.parsed.meeting)
const opSchedule = await call(b, 'vibe_v5_meeting', { op: 'schedule', member: 'r-chair', agenda: ['日程验收'],
  title: '别名日程会', scheduledFor: new Date(NOW + 5400 * 1000).toISOString() })
ok(opSchedule.parsed && opSchedule.parsed.ok === true && opSchedule.parsed.appointment === 'schedule' &&
  opSchedule.parsed.appointmentState === 'scheduled',
  '★★ {op:"schedule", scheduledFor} 真的排到未来（appointmentState 读自内核，不是自称）',
  opSchedule.parsed && { appointment: opSchedule.parsed.appointment, appointmentState: opSchedule.parsed.appointmentState })
const noTime = await call(b, 'vibe_v5_meeting', { action: 'schedule', member: 'r-chair', agenda: ['缺时间'] })
ok(noTime.parsed && noTime.parsed.ok === false && /schedule/i.test(String(noTime.parsed.message)) &&
  /at|scheduledFor/.test(String(noTime.parsed.message)),
  '★ schedule 不给时间 ⇒ 具名拒（不静默当成立即开会）', noTime.parsed && noTime.parsed.message)
const bothWords = await call(b, 'vibe_v5_meeting', { action: 'convene', op: 'appoint', member: 'r-chair', agenda: ['双词'] })
ok(bothWords.parsed && bothWords.parsed.ok === false && /action/i.test(String(bothWords.parsed.message)) &&
  /op/i.test(String(bothWords.parsed.message)),
  '★★ action 与 op 同时给且不一致 ⇒ 具名拒（说的是两个词，不是笼统 invalid）', bothWords.parsed && bothWords.parsed.message)
const opAttend = await call(b, 'vibe_v5_meeting', { op: 'attend', id: opMeetingId, member: 'r-1' })
ok(opAttend.parsed && opAttend.parsed.ok === true && opAttend.parsed.registry === 'service' &&
  opAttend.parsed.meeting === opMeetingId && opAttend.parsed.member === 'r-1',
  '★★★ 提示里印的 {op:"attend", id, member} 真能入席（提示即承诺）', opAttend.parsed && { ok: opAttend.parsed.ok, registry: opAttend.parsed.registry })

// ── 13. GROUP SAY: one durable channel:"group" row per other member, speaker excluded, DM stays a DM ──────────
console.log('\n=== 13. 群聊 say 致全体：逐人 channel:"group" 行、摘要 ≤800 + 指针，发言人不在收件人，DM 不双发 ===')
ok(!!b.specOf('vibe_v5_say'), 'setup: the pack publishes vibe_v5_say', !!b.specOf('vibe_v5_say'))
const longSay = '全体注意：奇数求和命题的复核从第 3 节开始。' + '这一段只是为了把摘要顶过八百字符上限。'.repeat(80)
const said = await call(b, 'vibe_v5_say', { member: 'r-1', text: longSay })
ok(said.parsed && said.parsed.ok === true && said.parsed.via === 'chat', '★ 群聊 say 写进了 chat 面', said.parsed && said.parsed.via)
const saidTo = (said.parsed && said.parsed.deliveredTo) || []
ok(saidTo.length === 3 && !saidTo.includes('r-1') && saidTo.slice().sort().join(',') === 'r-2,r-3,r-chair',
  '★★ 每个其他在线成员都在 deliveredTo，发言人不在（不含所办）', saidTo)
const chatBroadcastRows = (who) => box.list(who).entries.filter((e) => e.kind === 'chat-broadcast')
for (const who of ['r-2', 'r-3', 'r-chair']) {
  ok(chatBroadcastRows(who).length === 1, '★★ ' + who + ' 恰 1 行 chat-broadcast（group 通道的群聊证据）', chatBroadcastRows(who).map((r) => r.id))
  ok(chatBroadcastRows(who).length === 1 && chatBroadcastRows(who)[0].channel === 'group', '★ 那行 channel 是 group', chatBroadcastRows(who)[0] && chatBroadcastRows(who)[0].channel)
}
const groupRow = chatBroadcastRows('r-2')[0]
const chatGroupBody = box.open('r-2', groupRow.id).entry.text
ok(chatGroupBody.includes('chat#msg-'), '★ 正文带着指向全文的 chat 行 id（不是整段复制）', chatGroupBody.slice(0, 160))
const excerptMatch = chatGroupBody.match(/摘要（≤800 字符）：([\s\S]*?)\n全文：/)
ok(!!excerptMatch && excerptMatch[1].length <= 800 && excerptMatch[1].endsWith('…'),
  '★★ 摘要被截到 ≤800 并带省略号（摘要是摘要，不是全文）', excerptMatch && excerptMatch[1].length)
ok(box.noticeLines('r-2').lines.some((l) => l.includes('【群聊·r-1】') && l.includes('chat#msg-')),
  '★★ 群聊投递进了 notice 块（第三通道也走回合提示）', box.noticeLines('r-2').lines.filter((l) => l.includes('【群聊·')))
const pendingGroupRow = box.pending('r-2').filter((e) => e.id === groupRow.id)[0]
ok(pendingGroupRow && /^chat:msg-\d+$/.test(String(pendingGroupRow.dedupeKey)) && pendingGroupRow.channel === 'group',
  '★ 那行的 dedupeKey 是 chat 行 id（同一条群聊不会重复堆积）', pendingGroupRow && pendingGroupRow.dedupeKey)
const dmBefore = box.list('r-3').entries.length
const dmSaid = await call(b, 'vibe_v5_say', { member: 'r-1', to: 'r-3', text: '私信不双发验收' })
const dmRows = box.list('r-3').entries.filter((e) => e.kind === 'dm' && String(e.subject).includes('私信不双发验收'))
ok(dmSaid.parsed && dmSaid.parsed.ok === true && dmSaid.parsed.via === 'mailbox' && dmRows.length === 1 &&
  dmSaid.parsed.deliveredTo === undefined,
  '★★ 带 to 的私信仍只走原路（1 行 dm，不产生 group 行、不报 deliveredTo）',
  dmSaid.parsed && { via: dmSaid.parsed.via, dmRows: dmRows.length, deliveredTo: dmSaid.parsed.deliveredTo })
ok(box.list('r-3').entries.length === dmBefore + 1, '★ 私信没有额外多写一行（不双发）', { before: dmBefore, after: box.list('r-3').entries.length })

} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

// ── 9. notifyFailed: no delivery channel ⇒ per-member named failure, never a silent drop ─────────────────────
console.log('=== 9. notifyFailed：没有可用的投递通道时逐人具名报账（不是静默丢） ===')
const makeFace = (seams = {}) => meetingsMod.createMeetings(Object.assign({ clock: () => NOW, settings: { get: () => undefined } }, seams))
const bare = makeFace({})
const bareOpened = bare.open({ id: 'm-bare-1', type: 'ordinary', chair: 'a', roster: ['a', 'b', 'c'] })
ok(bareOpened.ok === true && Array.isArray(bareOpened.notifyFailed) && bareOpened.notifyFailed.length === 2 &&
  bareOpened.notified.length === 0,
  '★ 没有投递通道：会议照开（ok:true），但两个被邀成员逐个进 notifyFailed（不是假称 notified）',
  { notified: bareOpened.notified, notifyFailed: bareOpened.notifyFailed })
ok(bareOpened.notifyFailed.length > 0, 'A: bareOpened.notifyFailed 非空守卫（空数组上的 every 是空对空）', bareOpened.notifyFailed)
ok(bareOpened.notifyFailed.every((x) => typeof x.member === 'string' && x.member !== '' && typeof x.reason === 'string' && x.reason !== ''),
  '★★ 每条失败都带 member + reason（静默丢在这里不成立）', bareOpened.notifyFailed)
ok(bareOpened.receipt && bareOpened.receipt.notifyFailed && bareOpened.receipt.notifyFailed.length === 2,
  '★ 失败账也进 receipt（入口拿回执就能报账）', bareOpened.receipt && bareOpened.receipt.notifyFailed)
const thrower = makeFace({ mail: { send() { const e = new Error('smtp down'); e.code = 'VMU_MAILBOX_UNAVAILABLE'; throw e } } })
const throwOpened = thrower.open({ id: 'm-bare-2', type: 'ordinary', chair: 'a', roster: ['a', 'b'] })
ok(throwOpened.ok === true && throwOpened.notifyFailed.length === 1 && throwOpened.notifyFailed[0].member === 'b' &&
  /smtp down|VMU_MAILBOX_UNAVAILABLE/.test(String(throwOpened.notifyFailed[0].reason)),
  '★ 通道抛错：会议不陪葬，失败被记成该成员的具名 reason（含原始原因）', throwOpened.notifyFailed)

console.log('')
console.log('=== RUN 248-N NOTICE DELIVERY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.log('failures:', JSON.stringify(failures, null, 2)); process.exit(1) }
