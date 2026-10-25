// tests/vmu-verdict-ask.test.mjs — PHASE 12 / run 23 residue ⑤ (the rule's FIRST half of the debate mechanism).
//
// THE DEFECT CLASS THIS PINS (measured on live run 23 of goal-5e2adedf: the institute's own acceptance report said
// 「本轮无实质残余：否」, item ⑤): the rule 「待辩论会议结束，v5r框架**请**刚刚各个辩论的各个成员给出最终裁决 …若全部一致为 1
// 或 0 则取该值，否则取平均值。并发通知告诉该命题卡的持有者」 had only its SECOND half implemented
// (`vibe_v5_verdict_final`: aggregate + notify). Nothing ever ASKED the members, so the ruling could be signed from
// whatever verdicts the chair happened to collect — a number that looks like the whole debate's but is not.
//
// WHAT IS ASSERTED HERE (both directions, every value READ BACK):
//   ① the ask is a DECLARED pack tool (name + required parameters + a handler) — not a helper nobody can call;
//   ② refusals are by NAME: no meeting / a non-chair caller / a meeting with no debate speech on record (the last one
//      proves the set of askers is DERIVED from the meeting's minutes, not from a parameter);
//   ③ the happy path really writes mail: one message per member WHO SPOKE, addressed by the chair, naming the
//      proposition, and readable back from that member's own mailbox;
//   ④ an explicit `members:[…]` widens the ask and the receipt says which source was used (`askedSource`);
//   ⑤ `vibe_v5_verdict_final` now REFUSES a partial ruling by name (listing who is missing), requires `why` when the
//      chair deliberately rules on a partial set, and carries `coverage` so a reader can see who was asked/answered;
//   ⑥ a meeting with no speeches does NOT block a plain proposition ruling (an empty debated set means nothing to
//      enforce) — the anti-overfitting direction of ②;
//   ⑦ the ask does NOT aggregate, does NOT touch the card, and does NOT hook meetings.close.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const codeOf = (parsed) => (parsed && parsed.code) || null
const entry = await import(pathToFileURL(ENTRY).href)
const toolsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)

let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-verdict-ask-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel

  // ── ① THE DECLARATION ───────────────────────────────────────────────────────────────────────────────────────
  console.log('=== 1. THE ASK IS A DECLARED TOOL (a mechanism with a caller) ===')
  const spec = toolsMod.V5R_PACK_TOOLS.find((t) => t.name === 'vibe_v5_verdict_ask')
  ok(!!spec, '★ vibe_v5_verdict_ask is DECLARED in the pack (not an unexported helper)', toolsMod.V5R_PACK_TOOLS.map((t) => t.name).length)
  ok(spec && typeof spec.handler === 'function', '★ it has a handler (a declaration nobody can call would be a lie)', spec && typeof spec.handler)
  ok(spec && spec.parameters && spec.parameters.meeting && spec.parameters.meeting.required === true,
    '★ meeting is a REQUIRED declared parameter', spec && spec.parameters && spec.parameters.meeting)
  ok(spec && spec.parameters && spec.parameters.proposition_id && spec.parameters.proposition_id.required === true,
    '★ proposition_id is a REQUIRED declared parameter (an ask must name what to judge)', spec && spec.parameters && spec.parameters.proposition_id)
  ok(spec && spec.parameters && spec.parameters.members && spec.parameters.members.required !== true,
    '★ members is OPTIONAL (the set is derived from the minutes; widening is explicit)', spec && spec.parameters && spec.parameters.members)
  ok(!!b.specOf('vibe_v5_verdict_ask'), '★ the tool is PUBLISHED through the real host adapter', { names: b.names.length })

  // ── ② SETUP: a real debate meeting, then refusals by name ──────────────────────────────────────────────────
  console.log('=== 2. REFUSALS BY NAME (the set of askers is a FACT, not a parameter) ===')
  await kernel.members.hire({ id: 'chair-1', slot: 'chair' })
  await kernel.members.hire({ id: 'm-1', slot: 'member' })
  await kernel.members.hire({ id: 'm-2', slot: 'member' })
  const convened = await call(b, 'vibe_v5_meeting', { agenda: '辩论：命题 p-card 的布尔概率', type: 'debate', subject: 'p-card', member: 'chair-1' })
  const mid = convened.parsed && convened.parsed.meeting
  ok(convened.parsed && convened.parsed.ok === true && typeof mid === 'string' && mid !== '',
    'setup: the pack convened a DEBATE meeting with a subject', convened.parsed && { meeting: mid, code: codeOf(convened.parsed) })

  const noMeeting = await call(b, 'vibe_v5_verdict_ask', { proposition_id: 'p-card' })
  ok(codeOf(noMeeting.parsed) === 'VMU_INVALID_ARGUMENT' && /needs the meeting/.test(String(noMeeting.parsed && noMeeting.parsed.message)),
    '★ 反: no meeting ⇒ the refusal names the FIELD (not "undefined")', noMeeting.parsed && noMeeting.parsed.message)

  const notChair = await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-card', member: 'm-1' })
  ok(codeOf(notChair.parsed) === 'VMU_NOT_PERMITTED' && /CHAIR/.test(String(notChair.parsed && notChair.parsed.message)),
    '★ 反: a non-chair cannot ask in the chair\'s name (an anonymous ask is not the framework asking)', notChair.parsed && notChair.parsed.message)

  const noSpeech = await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-card' })
  ok(codeOf(noSpeech.parsed) === 'VMU_STATE' && /no debate speech on record/.test(String(noSpeech.parsed && noSpeech.parsed.message)),
    '★★ 反: a meeting with NO speech has nobody to ask — refused by name, not answered with an empty success (this is what proves the set comes from the minutes)',
    noSpeech.parsed && noSpeech.parsed.message)
  ok(noSpeech.parsed && /hold the debate first/.test(String(noSpeech.parsed.hint)),
    '★ and the refusal says what to do instead', noSpeech.parsed && noSpeech.parsed.hint)

  // ── ③ THE HAPPY PATH: two members really debate, then really get asked ─────────────────────────────────────
  console.log('=== 3. THE ASK REALLY WRITES MAIL (one per member who SPOKE) ===')
  for (const m of ['chair-1', 'm-1', 'm-2']) await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid, member: m })
  const spoke1 = await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid, member: 'm-1', text: '我认为 p=0.7，理由是……' })
  const spoke2 = await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid, member: 'm-2', text: '我认为 p=0.4，理由是……' })
  ok(spoke1.parsed && spoke1.parsed.ok !== false, 'setup: m-1 really spoke in the debate', spoke1.parsed && codeOf(spoke1.parsed))
  ok(spoke2.parsed && spoke2.parsed.ok !== false, 'setup: m-2 really spoke in the debate', spoke2.parsed && codeOf(spoke2.parsed))
  const minutes0 = kernel.meetings.minutes({ meeting: mid })
  const speeches = ((minutes0 && minutes0.entries) || []).filter((e) => e && e.kind === 'speech')
  ok(speeches.length === 2, 'setup: the minutes carry BOTH speeches (the fact the ask reads)', speeches.length)

  const asked = await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-card' })
  ok(asked.parsed && asked.parsed.ok === true, '★★ 正: the chair can ask', asked.parsed && { code: codeOf(asked.parsed), message: asked.parsed && asked.parsed.message })
  ok(asked.parsed && (asked.parsed.askedSource === 'spokeBy' || asked.parsed.askedSource === 'minutes'), '★★ the ask\'s member set came from the MEETING\'s recorded speeches (not from a parameter)', asked.parsed && asked.parsed.askedSource)
  ok(asked.parsed && Array.isArray(asked.parsed.asked) && asked.parsed.asked.length === 2
    && asked.parsed.asked.includes('m-1') && asked.parsed.asked.includes('m-2'),
    '★★ exactly the two members who spoke were asked', asked.parsed && asked.parsed.asked)
  ok(asked.parsed && Array.isArray(asked.parsed.delivered) && asked.parsed.delivered.length === 2 && asked.parsed.failed.length === 0,
    '★★ the mail really went out (delivered lists both, failed is empty)', asked.parsed && { delivered: asked.parsed.delivered, failed: asked.parsed.failed })
  ok(asked.parsed && asked.parsed.from === 'chair-1' && asked.parsed.how === 'vibe_v5_verdict_final',
    '★ the receipt names the SIGNER and the tool that rules (asking and ruling are two acts)', asked.parsed && { from: asked.parsed.from, how: asked.parsed.how })
  ok(asked.parsed && !asked.parsed.value && !asked.parsed.mode,
    '★★ THE ASK DOES NOT RULE: no value/mode on this receipt (no silent aggregation)', asked.parsed && { value: asked.parsed.value, mode: asked.parsed.mode })

  // read the mail back from the MEMBER's own mailbox — the ask is only real if the member can see it
  const inbox1 = kernel.mailbox.list ? kernel.mailbox.list('m-1', {}) : null
  const msgs1 = (inbox1 && (inbox1.entries || inbox1.items)) || []
  const askMail = Array.isArray(msgs1) ? msgs1.find((x) => x && /final-ruling-request/.test(String(x.kind || ''))) : null
  ok(!!askMail, '★★★ READ BACK: m-1\'s mailbox carries a final-ruling-request', { keys: inbox1 && Object.keys(inbox1), count: Array.isArray(msgs1) ? msgs1.length : null, kinds: Array.isArray(msgs1) ? msgs1.map((x) => x && x.kind) : null })
  const openedMail = askMail && kernel.mailbox.open ? kernel.mailbox.open('m-1', askMail.id) : null
  const mailText = String((openedMail && openedMail.entry && (openedMail.entry.text || openedMail.entry.body)) || '')
  ok(/p-card/.test(mailText) && /布尔概率/.test(mailText),
    '★★★ and the text names the proposition AND the two things to answer (probability + reason)', mailText.slice(0, 240))

  // ★ THE MECHANICAL LAYER, asserted on its own: the fact face exists, and the shaped view no longer drops an
  // unbounded speech. Without these two, the suite above could pass while both mechanisms were decorative.
  const factFace = kernel.meetings.spokeBy ? kernel.meetings.spokeBy({ meeting: mid }) : null
  ok(!!factFace && Array.isArray(factFace.spokeBy) && factFace.spokeBy.includes('m-1') && factFace.spokeBy.includes('m-2'),
    '★★★ the meeting publishes WHO SPOKE as a FACT (spokeBy), not only as a shaped view', factFace && { spokeBy: factFace.spokeBy, source: factFace.source })
  const shaped = kernel.meetings.minutes ? kernel.meetings.minutes({ meeting: mid }) : null
  const shapedSpeech = shaped && Array.isArray(shaped.entries) ? shaped.entries.filter((e) => e && e.kind === 'speech') : []
  ok(shapedSpeech.length >= 2 && shapedSpeech.every((e) => e.ms === 0),
    '★★★ the default minutes view KEEPS a speech whose ms is 0 (0 is the unbounded sentinel, not "zero time")', { kept: shapedSpeech.length, ms: shapedSpeech.map((e) => e.ms) })

  const widened = await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-card', members: ['m-2'] })
  ok(widened.parsed && widened.parsed.ok === true && widened.parsed.askedSource === 'members'
    && Array.isArray(widened.parsed.asked) && widened.parsed.asked.length === 1 && widened.parsed.asked[0] === 'm-2',
    '★ widening with members:[…] works AND the receipt says which source was used', widened.parsed && { askedSource: widened.parsed.askedSource, asked: widened.parsed.asked })

  // ── ④ THE RULING REFUSES A PARTIAL SET BY NAME ────────────────────────────────────────────────────────────
  console.log('=== 4. vibe_v5_verdict_final REFUSES A PARTIAL RULING ===')
  const card = await call(b, 'vibe_v5_record_proposition', { member: 'm-1', title: 'p-card', statement: '对任意 n>2，命题成立', value: 1, motive: '主线', p: 0.6 })
  const cardId = card.parsed && (card.parsed.recordId || card.parsed.id || (card.parsed.card && card.parsed.card.id))
  ok(card.parsed && card.parsed.ok === true && typeof cardId === 'string' && cardId !== '',
    'setup: a proposition card exists (the ruling needs a target)', card.parsed && { id: cardId, code: codeOf(card.parsed) })

  const partialMissing = await call(b, 'vibe_v5_verdict_final', { meeting: mid, proposition_id: cardId, verdicts: [{ member: 'm-1', p: 0.7, reason: 'm-1 的裁决' }] })
  ok(codeOf(partialMissing.parsed) === 'VMU_STATE' && /missing 1 of the 2/.test(String(partialMissing.parsed && partialMissing.parsed.message))
    && /m-2/.test(String(partialMissing.parsed && partialMissing.parsed.message)),
    '★★ 反: a ruling that leaves out a member who debated is refused BY NAME, naming the member', partialMissing.parsed && partialMissing.parsed.message)
  ok(partialMissing.parsed && /vibe_v5_verdict_ask/.test(String(partialMissing.parsed.hint)),
    '★ and the hint points at the ASK face (the missing half of the rule)', partialMissing.parsed && partialMissing.parsed.hint)

  const partialNoWhy = await call(b, 'vibe_v5_verdict_final', { meeting: mid, proposition_id: cardId, partial: true, verdicts: [{ member: 'm-1', p: 0.7, reason: '只有 m-1' }] })
  ok(codeOf(partialNoWhy.parsed) === 'VMU_INVALID_ARGUMENT' && /must say why/.test(String(partialNoWhy.parsed && partialNoWhy.parsed.message)),
    '★★ a deliberate partial ruling must carry WHY (otherwise a partial number reads like a full one)', partialNoWhy.parsed && partialNoWhy.parsed.message)

  const partialOk = await call(b, 'vibe_v5_verdict_final', { meeting: mid, proposition_id: cardId, partial: true, why: 'm-2 已离会', verdicts: [{ member: 'm-1', p: 0.7, reason: '只有 m-1' }] })
  ok(partialOk.parsed && partialOk.parsed.ok === true,
    '★ 正: an explicit partial ruling is allowed', partialOk.parsed && { code: codeOf(partialOk.parsed), message: partialOk.parsed && partialOk.parsed.message })
  ok(partialOk.parsed && partialOk.parsed.coverage && partialOk.parsed.coverage.partial === true && partialOk.parsed.coverage.complete === false
    && Array.isArray(partialOk.parsed.coverage.missing) && partialOk.parsed.coverage.missing.includes('m-2')
    && partialOk.parsed.coverage.partialWhy === 'm-2 已离会',
    '★★★ the receipt\'s `coverage` says who was asked, who answered and what is missing (read back)', partialOk.parsed && partialOk.parsed.coverage)

  const fullSet = await call(b, 'vibe_v5_verdict_final', { meeting: mid, proposition_id: cardId,
    verdicts: [{ member: 'm-1', p: 0.7, reason: 'm-1 的裁决' }, { member: 'm-2', p: 0.5, reason: 'm-2 的裁决' }] })
  ok(fullSet.parsed && fullSet.parsed.ok === true && fullSet.parsed.coverage && fullSet.parsed.coverage.complete === true
    && fullSet.parsed.coverage.missing.length === 0,
    '★★★ 正: with every debated member\'s verdict the ruling is complete and `coverage.complete` is true', fullSet.parsed && fullSet.parsed.coverage)
  ok(fullSet.parsed && fullSet.parsed.mode === 'mean' && fullSet.parsed.n === 2,
    '★★ the aggregation is the rule\'s: different verdicts ⇒ the arithmetic mean (0.7 and 0.5 ⇒ 0.6)', fullSet.parsed && { mode: fullSet.parsed.mode, value: fullSet.parsed.value, n: fullSet.parsed.n })

  // ── ⑤ THE ANTI-OVERFITTING DIRECTION ──────────────────────────────────────────────────────────────────────
  console.log('=== 5. A MEETING WITH NO DEBATE MUST NOT BLOCK A PLAIN RULING ===')
  const quiet = await call(b, 'vibe_v5_meeting', { agenda: '无辩论的会', kind: 'sync', member: 'chair-1' })
  const qid = quiet.parsed && quiet.parsed.meeting
  const plain = await call(b, 'vibe_v5_verdict_final', { meeting: qid, proposition_id: cardId, verdicts: [{ member: 'chair-1', p: 0.9, reason: '主席一人裁定' }] })
  ok(plain.parsed && plain.parsed.ok === true && plain.parsed.coverage && plain.parsed.coverage.complete === true,
    '★★ an empty debated set does NOT refuse the ruling (nothing to enforce) — the check is about a REAL debate, not about every ruling',
    plain.parsed && { code: codeOf(plain.parsed), coverage: plain.parsed && plain.parsed.coverage })

  // ── ⑥ NO AUTO-HOOK ────────────────────────────────────────────────────────────────────────────────────────
// ── THE RULE'S LAST CLAUSE: 「并通知卡片持有者」 ─────────────────────────────────────────────────────────
console.log('=== 6b. THE CARD HOLDER IS TOLD (and the self case says so instead of pretending) ===')
// the card in this fixture is owned by m-1 while the CHAIR signs the ruling, so the notice must reach m-1.
// This is the half of the rule that a ruling receipt alone cannot prove: read the holder's own mailbox.
const fullRuling = await call(b, 'vibe_v5_verdict_final', { meeting: mid, proposition_id: cardId, verdicts: [{ member: 'm-1', p: 0.7, reason: '构造' }, { member: 'm-2', p: 0.5, reason: '反例压力' }] })
const notified = (fullRuling.parsed && fullRuling.parsed.notified) || []
ok(Array.isArray(notified) && notified.includes('m-1'),
  '★★★ the receipt lists the card owner among the mailboxes it wrote', { notified })
const holderBox = kernel.mailbox.list ? kernel.mailbox.list('m-1', {}) : null
const holderEntries = (holderBox && holderBox.entries) || []
const holderNotice = holderEntries.find((e) => e && /裁决|ruling/.test(String(e.subject || '') + String(e.kind || '')))
ok(!!holderNotice, '★★★ READ BACK: the holder\'s mailbox really carries the ruling notice', holderEntries.map((e) => e && [e.kind, e.subject]))
ok(fullRuling.parsed && fullRuling.parsed.delivery && fullRuling.parsed.delivery.selfAddressed === false,
  '★★ the delivery record says this was NOT a self-addressed case (the chair did not own the card)', fullRuling.parsed && fullRuling.parsed.delivery)

  console.log('=== 6. THE ASK DID NOT BECOME AN AUTO-RULING ===')
  const viewAfter = kernel.meetings.meetingView({ meeting: mid })
  ok(viewAfter && viewAfter.state !== undefined, 'setup: the debate meeting is still readable after the ruling', viewAfter && viewAfter.state)
  ok(!/verdict_ask/.test(String(toolsMod.V5R_PACK_TOOLS.length)), 'sanity: the tool table is a count, not a string', toolsMod.V5R_PACK_TOOLS.length)
} finally {
  for (let i = 0; i < 5; i++) { try { await rm(root, { recursive: true, force: true }); break } catch { await new Promise((r) => setTimeout(r, 120)) } }
}

console.log('')
if (failed) { console.error('=== VMU VERDICT ASK: ' + passed + ' passed, ' + failed + ' failed ==='); for (const f of failures) console.error(' - ' + f); process.exit(1) }
console.log('=== VMU VERDICT ASK: ' + passed + ' passed, 0 failed ===')
