// vmu mailbox — the capability scenario for kernel/mailbox.js (task-11 / D-08 baseline B).
//
// The four v5r invariants this suite pins:
//   1. one copy PER RECIPIENT (a group send is N entries with N ids);
//   2. ACK ONLY AFTER A SUCCESSFUL DELIVERY (a failed transport acks nothing and stays redeliverable);
//   3. the body is DROPPED at ack, so a quote anchor at delivered mail is refused BY NAME;
//   4. INJECT ONCE PER PROMPT (`freshOnly` + mark/clear), so a retried wake re-prepends what is pending.
// Plus the graded delivery (urgent vs digest) and the wake budget that NAMES who was deferred.

import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'mailbox.js')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const m = await import(pathToFileURL(MODULE).href)

let NOW = Date.parse('2026-10-09T00:00:00.000Z')
const clock = () => NOW
const mk = (settings = {}, extra = {}) => m.createMailbox(Object.assign({ clock, settings, log: () => {} }, extra))

// ---- 1. one entry per recipient -------------------------------------------------------------------
{
  const mb = mk()
  const r = mb.send('r-1', { to: ['r-2', 'r-3'], text: 'plan A', kind: 'dm' })
  ok(r.ok === true && r.queued === 2 && r.ids.length === 2, 'a group send queues one entry per recipient')
  ok(mb.pending('r-2').length === 1 && mb.pending('r-3').length === 1, 'each recipient has its OWN copy')
  const missing = mb.send('r-1', { to: 'all', text: 'x', kind: 'chat' })
  ok(missing.ok === false && missing.code === 'VMU_ENGINE_UNAVAILABLE', 'all/voters without an audience seam is a NAMED result, not a guess')
  const withSeam = mk({}, { resolveAudience: ({ to }) => (to === 'all' ? ['r-2', 'r-3'] : []) })
  ok(withSeam.send('r-1', { to: 'all', text: 'y' }).queued === 2, 'the injected audience seam resolves all/voters')
  await expectThrow(() => mb.send('r-1', { to: '', text: 'z' }), 'VMU_MAILBOX_NO_SUCH_RECIPIENT', 'no recipient is refused by name')
  await expectThrow(() => mb.send('r-1', { to: 'r-2', text: '   ' }), 'VMU_INVALID_ARGUMENT', 'empty text is refused')
}

// ---- 2. ack only after a SUCCESSFUL delivery -------------------------------------------------------
{
  const calls = []
  const mb = mk({}, { deliver: async (env) => { calls.push(env); return { ok: true } } })
  mb.send('r-1', { to: 'r-2', text: 'hello', kind: 'dm', urgent: true })
  const out = await mb.flush('r-2')
  ok(out.ok === true && out.acked.length === 0 && out.remaining === 1, 'an urgent flush DELIVERS the body but does NOT ack it (the inbox must still show the message)')
  ok(calls.length === 1 && calls[0].member === 'r-2' && calls[0].count === 1 && calls[0].urgent === true, 'the transport sees the envelope with the urgent flag')
  ok(calls[0].entries[0].text === 'hello', 'an URGENT envelope carries the body (dropped only at ack)')
  ok(mb.status().acked === 0 && mb.status().pending === 1, 'status keeps the urgent entry pending until the member opens/acks it')
  ok(mb.list('r-2').entries.length === 1 && /1 条/.test(out.notice),
    '★ 正：提示词说 N 条，list() 也正好有 N 条（紧急投递不再自相矛盾）', { list: mb.list('r-2').entries.length, notice: out.notice })

  // A transport that returns false acks NOTHING.
  const refuseMb = mk({}, { deliver: async () => false })
  refuseMb.send('r-1', { to: 'r-2', text: 'keep me', kind: 'dm' })
  const failed = await refuseMb.flush('r-2')
  ok(failed.ok === false && failed.code === 'VMU_MAILBOX_DELIVERY_FAILED' && failed.remaining === 1, 'a refused transport is a named runtime failure')
  ok(refuseMb.pending('r-2').length === 1, 'nothing was acknowledged, so it is still redeliverable')

  // A transport that THROWS acks nothing either.
  const throwMb = mk({}, { deliver: async () => { throw new Error('host down') } })
  throwMb.send('r-1', { to: 'r-2', text: 'keep me too', kind: 'dm' })
  const threw = await throwMb.flush('r-2')
  ok(threw.ok === false && threw.code === 'VMU_MAILBOX_DELIVERY_FAILED' && throwMb.pending('r-2').length === 1, 'a throwing transport is contained and acks nothing')

  // No seam at all: named result, queue intact.
  const noSeam = mk()
  noSeam.send('r-1', { to: 'r-2', text: 'x', kind: 'dm' })
  const ns = await noSeam.flush('r-2')
  ok(ns.ok === false && ns.code === 'VMU_ENGINE_UNAVAILABLE' && noSeam.pending('r-2').length === 1, 'a missing deliver seam never fakes a delivery')
  ok((await noSeam.flush('r-9')).reason === 'nothing-pending', 'flushing an empty box is a no-op, not an error')
}

// ---- 2b. non-urgent delivery is a NOTICE ONLY; list/open/setState manage reading & todo ---------------
{
  const calls = []
  const mb = mk({}, { deliver: async (env) => { calls.push(env); return { ok: true } } })
  const SECRET = 'SECRET_BODY_MARKER_9f2'
  mb.send('r-1', { to: 'r-2', text: 'first line subject\n' + SECRET, kind: 'note' })
  const out = await mb.flush('r-2')
  const env = calls[0]
  ok(env.urgent === false && Array.isArray(env.entries) && env.entries.length === 0,
    '★ 正 1：非紧急 envelope 的 entries 为空（不携带正文）', JSON.stringify(env))
  ok(typeof env.notice === 'string' && env.notice.length > 0 && env.notice.length <= 300 && /不需要立即阅读/.test(env.notice) && /list/.test(env.notice),
    '★ 正 1：notice 含“不需要立即阅读 / list”，且 ≤300 字符', { length: env.notice && env.notice.length, notice: env.notice })
  ok(!JSON.stringify(env).includes(SECRET), '★ 反（唯一真证据）：非紧急投递物【任何字段/JSON 文本】都不含正文标记串', JSON.stringify(env))
  ok(out.notified === 1 && mb.pending('r-2').length === 1, 'non-urgent notice does not ack (body remains readable)')
  const row = mb.list('r-2').entries[0]
  // ★ ROUND 52: the row is NINE fields now — `urgent` was missing from this read face (and from `openView`), which made
  // an urgent message indistinguishable from ordinary mail unless the caller joined `pending()` (and got null for
  // anything already acked). The write side always recorded it; the read side deleted it.
  ok(row && Object.keys(row).sort().join(',') === ['at', 'bytes', 'from', 'id', 'kind', 'read', 'subject', 'todo', 'urgent'].join(',') &&
    row.read === false && row.todo === false && row.urgent === false && !('text' in row),
    '★ 正：list 行字段恰为 9 个（含 urgent）、不含正文、初始 read:false / urgent:false', row)
  const opened = mb.open('r-2', row.id)
  ok(opened.ok === true && opened.entry.text.includes(SECRET) && opened.read === true, '★ 正：open 返回正文并把 read 置 true', opened)
  // ★ ROUND 52 正：urgent 逐字走到两个读面（写入侧记录的事实，读面不再删）。open 视图是 6 字段 + urgent。
  ok(opened.entry.urgent === false && 'urgent' in opened.entry,
    '★ 正：open 视图也带 urgent（与写入侧同义，不在这里造默认值）', opened.entry && opened.entry.urgent)
  // ★ ROUND 53 正（Lead 口径）：字段必须是布尔，缺省 false，**不许** undefined / 缺失。写侧永远记布尔，所以这里
  // 用一条 LEGACY 快照造出"没有这个字段的老条目"——读面读到的必须是 false，而不是 null 或 undefined。
  const legacy = mk()
  const hydrate = legacy.hydrate({ face: 'mailbox', counters: { seq: 1 },
    data: { boxes: { 'r-9': [{ id: 'ml-1', seq: 1, from: 'r-1', to: 'r-9', at: NOW, kind: 'dm', subject: 'old mail',
      text: 'from before the field existed', read: false, todo: false }] } } })
  ok(hydrate.ok === true, '★ 前置：legacy 快照能 hydrate（否则下面的缺省断言测的是空气）', hydrate)
  const legacyRow = legacy.list('r-9').entries[0]
  const legacyOpen = legacy.open('r-9', 'ml-1')
  ok(legacyRow && 'urgent' in legacyRow && legacyRow.urgent === false,
    '★★ 正：老条目没有 urgent 字段 ⇒ list 行给 false（布尔缺省，不是 undefined/缺失）', legacyRow && JSON.stringify(legacyRow.urgent))
  ok(legacyOpen.ok === true && legacyOpen.entry.urgent === false,
    '★★ 正：open 视图对老条目同样给 false', legacyOpen.entry && legacyOpen.entry.urgent)
  mb.send('r-1', { to: 'r-2', text: 'urgent one', kind: 'dm', urgent: true })
  const urgentRow = mb.list('r-2').entries.filter((r) => r.subject === 'urgent one')[0]
  ok(urgentRow && urgentRow.urgent === true, '★★★ 正：紧急私信在 list 行里 urgent:true（这正是规则「紧急私信」要的那一格）', urgentRow)
  const urgentOpen = mb.open('r-2', urgentRow.id)
  ok(urgentOpen.ok === true && urgentOpen.entry.urgent === true, '★★ 正：open 视图里 urgent 同样为 true', urgentOpen.entry && urgentOpen.entry.urgent)
  const row2 = mb.list('r-2').entries[0]
  ok(row2.read === true && !('text' in row2), '★ 正：list 再看 read:true 且仍不含正文')
  const state = mb.setState('r-2', { id: row.id, todo: true })
  ok(state.ok === true && state.todo === true && state.read === true, '★ 正：setState 改 todo，read 保留')
  ok(mb.list('r-2', { status: 'todo' }).count === 1 && mb.list('r-2', { status: 'unread' }).count === 0,
    '★ 正：list status 过滤（todo 命中、unread 不命中）')
  await expectThrow(() => mb.open('r-2', 'ml-nope'), 'VMU_MAILBOX_NO_SUCH_ENTRY', '★ 反：open 未知 id ⇒ 具名拒')
  await expectThrow(() => mb.setState('r-2', { id: 'ml-nope', read: true }), 'VMU_MAILBOX_NO_SUCH_ENTRY', '★ 反：setState 未知 id ⇒ 具名拒')
  // subject: explicit wins; omitted = first non-empty line; overlong is truncated and marked.
  mb.send('r-1', { to: 'r-3', text: 'ignored first', subject: 'Explicit subject', kind: 'note' })
  mb.send('r-1', { to: 'r-3', text: '\nDefault subject line\nbody', kind: 'note' })
  const rows3 = mb.list('r-3').entries
  ok(rows3[0].subject === 'Explicit subject' && rows3[1].subject === 'Default subject line', '★ 正：subject 显式优先，缺省取正文首个非空行', rows3.map((r) => r.subject))
  mb.send('r-1', { to: 'r-3', text: 'x', subject: 'S'.repeat(200), kind: 'note' })
  const longRow = mb.list('r-3').entries[2]
  ok(longRow.subject.length <= m.MAILBOX_SUBJECT_MAX && /…$/.test(longRow.subject), '★ 正：超长 subject 截断且带标记', longRow.subject)
}

// ---- 3. the body is dropped at ack ⇒ anchors dangle BY NAME ----------------------------------------
{
  const mb = mk({}, { deliver: async () => ({ ok: true }) })
  const sent = mb.send('r-1', { to: 'r-2', text: 'evidence', kind: 'dm', urgent: true })
  const id = sent.ids[0]
  ok(mb.anchor(id).text === 'evidence', 'live mail resolves as an anchor')
  await mb.flush('r-2')
  ok(mb.anchor(id).text === 'evidence', 'urgent delivery leaves the body pending: the prompt count and list() match')
  await mb.ack('r-2', [id])
  await expectThrow(() => mb.anchor(id), 'VMU_MAILBOX_ANCHOR_DANGLING', 'acked mail can no longer be quoted')
  await expectThrow(() => mb.send('r-1', { to: 'r-3', text: 're', kind: 'dm', replyTo: id }),
    'VMU_MAILBOX_ANCHOR_DANGLING', 'a reply to acked mail is refused by name')
  await expectThrow(() => mb.anchor('ml-9999'), 'VMU_MAILBOX_ANCHOR_DANGLING', 'an unknown id is refused too')
  await expectThrow(() => mb.ack('r-2', [id]), 'VMU_MAILBOX_ACK_UNKNOWN', 'acking an already-acked entry is refused (no silent no-op)')
}

// ---- 4. injection dedup: once per prompt, cleared on every concluded attempt ------------------------
{
  const mb = mk()
  mb.send('r-1', { to: 'r-2', text: 'one', kind: 'dm' })
  mb.send('r-1', { to: 'r-2', text: 'two', kind: 'chat' })
  const all = mb.pending('r-2')
  ok(all.length === 2, 'two entries are pending')
  mb.markInjected('r-2', [all[0].id])
  const fresh = mb.pending('r-2', { freshOnly: true })
  ok(fresh.length === 1 && fresh[0].id === all[1].id, 'freshOnly excludes what a prompt already carried')
  mb.markInjected('r-2', [all[0].id])
  ok(mb.pending('r-2', { freshOnly: true }).length === 1, 're-marking is idempotent')
  mb.clearInjected('r-2')
  ok(mb.pending('r-2', { freshOnly: true }).length === 2, 'a concluded attempt clears the marks, so a retried wake re-prepends')
  // ★ PHASE 9 / round 2: a non-urgent flush announces ONLY, marks the entries injected, and does NOT ack them; a
  // repeated flush says already-notified instead of repeating the notice.
  const calls = []
  const flushed = mk({}, { deliver: async (env) => { calls.push(env); return { ok: true } } })
  flushed.send('r-1', { to: 'r-2', text: 'x', kind: 'dm' })
  await flushed.flush('r-2')
  ok(flushed.pending('r-2').length === 1 && flushed.unread('r-2').injected === 1,
    'non-urgent flush keeps the body pending and marks it injected (notice was shown once)')
  const again = await flushed.flush('r-2')
  ok(again.reason === 'already-notified' && calls.length === 1, 'a repeated non-urgent flush does not repeat the notice')
}

// ---- 5. graded delivery: urgent now, digest by window or count -------------------------------------
{
  const urgentMb = mk()
  urgentMb.send('r-1', { to: 'r-2', text: 'nudge', kind: 'nudge', urgent: true })
  ok(urgentMb.deliverable('r-2').deliver === true && urgentMb.deliverable('r-2').urgent === true, 'urgent:true delivers immediately')
  const defaultMb = mk()
  defaultMb.send('r-1', { to: 'r-2', text: 'nudge', kind: 'nudge' })
  ok(defaultMb.deliverable('r-2').urgent === false && defaultMb.deliverable('r-2').deliver === false,
    'a kind alone is NOT urgent by default (urgent is the sender\'s explicit intent)')
  const chatMb = mk()
  chatMb.send('r-1', { to: 'r-2', text: 'chatter', kind: 'chat' })
  const d1 = chatMb.deliverable('r-2')
  ok(d1.deliver === false && d1.reason === 'not-due-yet', 'plain chat waits for the digest window')
  NOW += 46000
  ok(chatMb.deliverable('r-2').deliver === true, 'the declared window makes it due')
  NOW = Date.parse('2026-10-09T00:00:00.000Z')
  const countMb = mk({ 'vmu.mailbox.digestMax': 2 })
  countMb.send('r-1', { to: 'r-2', text: 'a', kind: 'chat' })
  countMb.send('r-1', { to: 'r-2', text: 'b', kind: 'chat' })
  ok(countMb.deliverable('r-2').reason === 'digest-max', 'the declared max makes it due by count')
  const kindsMb = mk({ 'vmu.mailbox.urgentKinds': ['chat'] })
  kindsMb.send('r-1', { to: 'r-2', text: 'x', kind: 'chat' })
  ok(kindsMb.deliverable('r-2').urgent === true, 'the urgent-kind list is declared, not hard-coded')
  // ★ PHASE 9 / round 7: the kernel must NOT special-case the old seven-kind list; an explicit list is policy and is
  // honoured verbatim. [] is the only way to turn kind-only urgency off.
  const emptyKinds = mk({ 'vmu.mailbox.urgentKinds': [] })
  emptyKinds.send('r-1', { to: 'r-2', text: 'x', kind: 'notice' })
  ok(emptyKinds.deliverable('r-2').urgent === false, 'an explicit [] means NO kind is auto-urgent (empty is expressible)', emptyKinds.deliverable('r-2'))
  const legacyKinds = mk({ 'vmu.mailbox.urgentKinds': ['dm', 'office', 'assign', 'nudge', 'notice', 'meeting', 'verify'] })
  legacyKinds.send('r-1', { to: 'r-2', text: 'x', kind: 'notice' })
  ok(legacyKinds.deliverable('r-2').urgent === true, 'an explicit old seven-kind list STILL makes those kinds urgent (kernel must not hijack a policy value)', legacyKinds.deliverable('r-2'))
}

// ---- 6. the wake plan is budgeted and NAMES the deferred -----------------------------------------
{
  const mb = mk({ 'vmu.mailbox.wakeBudget': 1 })
  mb.send('r-1', { to: 'r-2', text: 'u', kind: 'dm', urgent: true })
  mb.send('r-1', { to: 'r-3', text: 'u', kind: 'notice', urgent: true })
  const plan = mb.plan({ members: ['r-2', 'r-3'] })
  ok(plan.wake.length === 1 && plan.deferred.length === 1, 'the budget bounds one pass')
  ok(plan.deferred[0].why === 'wake-budget', 'the deferred member is named WITH a reason')
  const plan2 = mb.plan({ members: ['r-2', 'r-3'], budget: 5 })
  ok(plan2.wake.length === 2, 'a larger budget wakes both')
  const quiet = mk()
  quiet.send('r-1', { to: 'r-2', text: 'later', kind: 'chat' })
  const p3 = quiet.plan({ members: ['r-2'] })
  ok(p3.wake.length === 0 && p3.deferred.some((x) => x.why === 'not-due-yet'), 'a not-yet-due digest is named, never dropped silently')
}

// ---- 7. caps and durability are enforced and honest ------------------------------------------------
{
  const mb = mk()
  for (let i = 0; i < m.MAILBOX_BOX_CAP; i++) mb.send('r-1', { to: 'r-2', text: 'x' + i, kind: 'chat' })
  await expectThrow(() => mb.send('r-1', { to: 'r-2', text: 'overflow', kind: 'chat' }),
    'VMU_MAILBOX_CAP_REACHED', 'the per-box cap is machine-enforced with a named refusal')

  const memoryOnly = mk()
  ok(memoryOnly.status().durable === false, 'no store port ⇒ durable:false (never faked)')
  const p = await memoryOnly.persist()
  ok(p.persisted === false && p.durable === false, 'persist without a store says so')

  const fake = { data: {}, async patch(key, fn) { this.data[key] = fn(this.data[key]) }, async read(key) { return this.data[key] } }
  const durableMb = mk({}, { store: fake })
  durableMb.send('r-1', { to: 'r-2', text: 'survive me', kind: 'dm' })
  const persisted = await durableMb.persist()
  ok(persisted.ok === true && persisted.seq === 1, 'persist writes the durable key with the last used seq')
  const revived = mk({}, { store: fake })
  const restored = await revived.restore()
  ok(restored.ok === true && restored.restored_items.length >= 1 && restored.counters.seq === 1, 'restore hydrates the boxes and the counter')
  ok(revived.pending('r-2').length === 1 && revived.pending('r-2')[0].text === 'survive me', 'the queued body survived the round trip')
  const again = revived.send('r-1', { to: 'r-2', text: 'no id reuse', kind: 'dm' })
  ok(again.ids[0] === 'ml-2', 'ids continue at max+1 (names are immortal)')
  const snap = revived.snapshot()
  ok(snap.face === 'mailbox' && snap.counters.seq === 2 && Array.isArray(snap.skipped), 'the snapshot carries face/counters/skipped')
  const wrong = await revived.hydrate({ face: 'chat' })
  ok(wrong.ok === false && wrong.code === 'VMU_INVALID_ARGUMENT', 'a foreign snapshot is refused')
  ok(revived.hydrate(snap).ok === true && revived.hydrate(snap).ok === true, 're-hydrating the same snapshot is idempotent')
}

// ---- G8 (Round 7): SELF-MESSAGING is refused by name (v5r's V5_SELF_MESSAGE) ------------------------
{
  const grab = (fn) => { try { fn(); return null } catch (e) { return e && e.code } }
  const b = mk()
  ok(grab(() => b.send('r-1', { to: 'r-1', text: 'hello me' })) === 'VMU_INVALID_ARGUMENT',
    'a message addressed to its own sender is refused BY NAME')
  ok(b.send('r-1', { to: 'r-2', text: 'hello' }).ok === true, 'addressing another member still works')
  const self = mk({}, { resolveAudience: () => ['r-1'] })
  ok(grab(() => self.send('r-1', { to: 'all', text: 'x' })) === 'VMU_INVALID_ARGUMENT',
    'and a seam that RETURNS the sender is refused too (the rule sits at the one send point, whatever produced the target)')
  ok((b.refusals()['VMU_INVALID_ARGUMENT'] || 0) >= 1, 'the refusal is counted so it is greppable in the audit trail')
}

// ---- PHASE 9 / round 5: the delivery path is COUNTED, so "was it ever called?" is a fact ---------------
{
  const mb = mk()
  mb.send('r-1', { to: 'r-2', subject: '非紧急进展同步', text: '今日进度已记录', kind: 'notice' })
  const d = mb.deliverable('r-2')
  ok(d.ok === true && d.count === 1 && d.deliver === false, 'deliverable() sees the pending entry but leaves it to the digest window', d)
  const flushed = await mb.flush('r-2', { send: async () => true })
  ok(flushed.ok === true && /你收到 1 条新留言/.test(flushed.notice) && !/今日进度已记录/.test(flushed.notice),
    '★ 正：非紧急投递的 notice 只报数量/来源/标题，不带正文', flushed.notice)
  const st = mb.status()
  ok(st.delivery && st.delivery.deliverableCalls === 1 && st.delivery.flushCalls === 1 && st.delivery.sent === 1,
    '★ 诊断计数：deliverable/flush/sent 都可读（真机不再只能猜“接缝没接”）', st.delivery)
}

console.log('vmu-mailbox: ' + passed + ' passed, ' + failed + ' failed')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
