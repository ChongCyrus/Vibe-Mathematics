// vmu chat — the capability scenario for kernel/chat.js (task-11 / D-08 baseline B).
//
// The v5r line had NO admin, NO speech quota and NO per-member mute in its group chat (its only "mute" was
// the meeting-wide ballot freeze). This suite pins the NEW machine facts:
//   · a refused send appends NOTHING (a refusal is not a message);
//   · a mute expires on the injected clock and the LIFT is audited;
//   · the quota is per-window, reads through the declared key, and 0 really means unlimited;
//   · the ballot freeze is DERIVED from an injected predicate, and the chair exemption is a switch;
//   · admin actions need a named actor — an anonymous policy change is refused by name;
//   · a reply anchor must exist (dangling ⇒ named refusal), and the caps drop with COUNTED drops.

import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'chat.js')

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

// A mutable clock so "expiry" is testable without real time.
let NOW = Date.parse('2026-10-09T00:00:00.000Z')
const clock = () => NOW
const mk = (settings = {}, extra = {}) => m.createChat(Object.assign({ clock, settings, log: () => {} }, extra))

// ---- 1. messages carry id / from / at / replyTo -------------------------------------------------
{
  const chat = mk()
  const r1 = chat.send('r-1', 'hello', { kind: 'chat' })
  ok(r1.ok === true && r1.id === 'msg-1' && r1.from === 'r-1' && r1.at === clock(), 'a send returns id/from/at')
  const r2 = chat.send('r-2', 're: hello', { replyTo: 'msg-1' })
  ok(r2.replyTo === 'msg-1', 'replyTo resolves against the ledger')
  const list = chat.list()
  ok(list.messages.length === 2 && list.messages[0].text === 'hello', 'list returns bodies newest-last')
  ok(chat.status().messages === 2, 'status counts messages without bodies')
  await expectThrow(() => chat.send('r-1', ''), 'VMU_INVALID_ARGUMENT', 'empty text is refused')
  await expectThrow(() => chat.send('', 'x'), 'VMU_INVALID_ARGUMENT', 'a message needs a speaker')
}

// ---- 2. dangling anchors are refused and append nothing ------------------------------------------
{
  const chat = mk()
  chat.send('r-1', 'first')
  await expectThrow(() => chat.send('r-2', 'x', { replyTo: 'msg-999' }), 'VMU_CHAT_ANCHOR_DANGLING', 'a dangling reply anchor is refused by name')
  await expectThrow(() => chat.send('r-2', 'x', { quotes: ['msg-999'] }), 'VMU_CHAT_ANCHOR_DANGLING', 'a dangling quote anchor is refused by name')
  ok(chat.status().messages === 1, 'a refused send appended nothing')
  const many = []
  for (let i = 0; i < m.CHAT_QUOTE_MAX + 1; i++) many.push('msg-1')
  await expectThrow(() => chat.send('r-2', 'x', { quotes: many }), 'VMU_INVALID_ARGUMENT', 'over the quote cap is refused')
  const withTwo = chat.send('r-2', 'ok', { quotes: ['msg-1', { ref: 'msg-1', depth: 9 }] })
  ok(withTwo.quotes.length === 2 && withTwo.quotes[1].depth === 9, 'quotes keep their declared depth')
}

// ---- 3. mute: blocks, expires on the clock, and the lift is audited ------------------------------
{
  const chat = mk({ 'vmu.chat.admins': ['acad'] })
  ok(chat.mute('r-1', { durationMs: 1000, reason: 'shouting', by: 'acad' }).ok === true, 'an admin can mute')
  await expectThrow(() => chat.send('r-1', 'hi'), 'VMU_CHAT_MUTED', 'a muted member is refused by name')
  ok(chat.history().some((h) => h.what === 'send-refused' && h.reason === 'muted'), 'the refusal is audited')
  NOW += 1001
  ok(chat.send('r-1', 'back').ok === true, 'the mute expires against the injected clock')
  ok(chat.history().some((h) => h.what === 'mute-expired'), 'the expiry is recorded ONCE')
  ok(chat.status().muted.length === 0, 'an expired mute is gone from the status')
  // A mute with no duration uses the declared default; 0 means no expiry.
  ok(chat.mute('r-2', { reason: 'hold', by: 'acad' }).until === 0, 'no default ⇒ mute without expiry')
  const chat2 = mk({ 'vmu.chat.admins': ['acad'], 'vmu.chat.muteDefaultMs': 5000 })
  const until = chat2.mute('r-2', { reason: 'hold', by: 'acad' }).until
  ok(until === NOW + 5000, 'the declared default duration is used')
}

// ---- 4. the speech quota is machine-enforced, windowed, and 0 means unlimited ---------------------
{
  const chat = mk({ 'vmu.chat.admins': ['acad'], 'vmu.chat.speakQuota': 2 })
  chat.send('r-1', 'one')
  chat.send('r-1', 'two')
  await expectThrow(() => chat.send('r-1', 'three'), 'VMU_CHAT_QUOTA_EXCEEDED', 'the third send hits the quota')
  const st = chat.quotaState('r-1')
  ok(st.used === 2 && st.limit === 2 && st.remaining === 0, 'quotaState reports used/limit/remaining')
  ok(chat.send('r-2', 'other member is unaffected').ok === true, 'the quota is PER MEMBER')
  // Windowed: after the window passes the counter resets.
  const chat2 = mk({ 'vmu.chat.admins': ['acad'], 'vmu.chat.speakQuota': 1, 'vmu.chat.speakQuotaWindowMs': 1000 })
  chat2.send('r-1', 'a')
  await expectThrow(() => chat2.send('r-1', 'b'), 'VMU_CHAT_QUOTA_EXCEEDED', 'windowed quota blocks in-window')
  NOW += 1001
  ok(chat2.send('r-1', 'c').ok === true, 'the window resets the counter')
  // 0 = unlimited is a decision the receipt states.
  const chat3 = mk({ 'vmu.chat.admins': ['acad'] })
  for (let i = 0; i < 5; i++) chat3.send('r-1', 'x' + i)
  ok(chat3.quotaState('r-1').limited === false, 'quota 0 ⇒ limited:false')
}

// ---- 5. admins: named actor required, non-admin refused, hot change audited -----------------------
{
  const chat = mk({ 'vmu.chat.admins': ['acad'] })
  await expectThrow(() => chat.mute('r-1', { reason: 'x', by: 'r-2' }), 'VMU_CHAT_NOT_ADMIN', 'a non-admin cannot mute')
  await expectThrow(() => chat.mute('r-1', { reason: 'x' }), 'VMU_CHAT_NOT_ADMIN', 'an ANONYMOUS policy change is refused (no free pass)')
  ok(chat.status().refusals.VMU_CHAT_NOT_ADMIN >= 2, 'both refusals are counted')
  // The bootstrap path must be asked for explicitly.
  const boot = chat.setPolicy({ speakQuota: 1 }, { by: null, source: 'settings', reason: 'pack default' })
  ok(boot.ok === true && boot.bootstrap === true && boot.policyGen === 1, 'the settings bootstrap path is explicit and audited')
  ok(chat.policy().speakQuota === 1, 'the hot change is visible immediately')
  await expectThrow(() => chat.setPolicy({ speakQuota: 2 }, { by: 'acad', source: 'settings' }),
    'VMU_INVALID_ARGUMENT', 'the bootstrap path must not name an actor')
  chat.grantAdmin('r-1', { by: 'acad', source: 'member' })
  ok(chat.policy().admins.includes('r-1'), 'grantAdmin adds an admin')
  ok(chat.setPolicy({ speakQuota: 3 }, { by: 'r-1', source: 'member' }).ok === true, 'the new admin can change policy')
  ok(chat.setQuota(0, { by: 'r-1', source: 'member' }).unlimited === true, 'setQuota(0) reports unlimited')
}

// ---- 6. the freeze is DERIVED from an injected predicate, with a chair exemption ------------------
{
  let frozen = { frozen: false, ballotId: null }
  const chat = mk({ 'vmu.chat.admins': ['acad'] }, { isFrozen: () => frozen })
  chat.send('r-1', 'before')
  frozen = { frozen: true, ballotId: 'b-1' }
  await expectThrow(() => chat.send('r-1', 'during'), 'VMU_CHAT_FROZEN', 'an open ballot freezes ordinary speech')
  ok(chat.send('acad', 'chair may speak').ok === true, 'the chair exemption applies by default (chair-first)')
  const strict = mk({ 'vmu.chat.admins': ['acad'], 'vmu.chat.freezeExemptAdmins': false }, { isFrozen: () => frozen })
  await expectThrow(() => strict.send('acad', 'no exemption'), 'VMU_CHAT_FROZEN', 'the exemption is a switch, not a hard-coded role')
  const custom = mk({}, { isFrozen: () => frozen, freezeExempt: ({ from }) => from === 'r-9' })
  ok(custom.send('r-9', 'injected exemption').ok === true, 'an injected exemption predicate overrides the default')
  ok(chat.status().frozen === true && chat.status().frozenBy === 'b-1', 'status names the freezing ballot')
}

// ---- 7. caps drop with COUNTS, never silently ------------------------------------------------------
{
  const chat = mk({ 'vmu.chat.historyCap': 3 })
  for (let i = 0; i < 6; i++) chat.send('r-1', 'm' + i)
  const st = chat.status()
  ok(st.messages === 3, 'the message ledger respects the cap')
  ok(st.dropped.messages === 3, 'the drops are COUNTED')
  ok(chat.list().dropped === 3, 'list reports the same count')
  ok(chat.list({ limit: 2 }).truncated === true, 'list says when it truncated the read')
}

// ---- 8. EVERY refusal states its evaluated scope (D3: enforced[] + enforcedScope) --------------------
{
  const grab = async (fn) => { try { await fn(); return null } catch (e) { return e } }
  const chat = mk({ 'vmu.chat.admins': ['acad'], 'vmu.chat.speakQuota': 1 })
  chat.send('r-1', 'the one allowed message')
  const q = await grab(() => chat.send('r-1', 'over quota'))
  ok(q && q.code === 'VMU_CHAT_QUOTA_EXCEEDED' && Array.isArray(q.enforced) && q.enforced.includes('vmu.chat.speakQuota'),
    'a quota refusal names the key it read')
  ok(q.enforcedScope === 'evaluated-so-far', 'and carries the scope marker used across the kernel')
  const a = await grab(() => chat.mute('r-1', { by: 'r-2', reason: 'x' }))
  ok(a && a.code === 'VMU_CHAT_NOT_ADMIN' && a.enforced.includes('vmu.chat.admins'), 'an admin refusal names the admin list it read')
  const anon = await grab(() => chat.unmute('r-1'))
  ok(anon && Array.isArray(anon.enforced) && anon.enforced.includes('vmu.chat.admins'), 'the anonymous refusal states the same evaluated scope')
  const empty = await grab(() => chat.send('r-1', '   '))
  ok(empty && Array.isArray(empty.enforced) && empty.enforced.length === 0 && empty.enforcedScope === 'evaluated-so-far',
    'a validation refusal still carries an EXPLICIT empty enforced[] (never undefined)')
  let frozen = { frozen: true, ballotId: 'b-9' }
  const fr = mk({ 'vmu.chat.admins': ['acad'] }, { isFrozen: () => frozen })
  const fz = await grab(() => fr.send('r-1', 'during the vote'))
  ok(fz && fz.code === 'VMU_CHAT_FROZEN' && fz.enforced.includes('vmu.chat.freezeExemptAdmins'),
    'a freeze refusal names the exemption switch it read')
  const ms = fr.maySpeak('r-1')
  ok(ms.ok === false && Array.isArray(ms.enforced) && ms.enforcedScope === 'evaluated-so-far',
    'the RETURNED refusal (maySpeak) carries the same scope as a thrown one')
  // An injected predicate replaces the declared key, and the receipt SAYS SO (empty, not a stale key).
  const injected = mk({ 'vmu.chat.admins': ['acad'] }, { isFrozen: () => frozen, freezeExempt: () => false })
  const fz2 = await grab(() => injected.send('r-1', 'x'))
  ok(fz2 && Array.isArray(fz2.enforced) && fz2.enforced.length === 0, 'an injected predicate reads no settings key, so enforced[] is empty')
}

// ---- 9. uninterpretable instants are NAMED, never coerced (RULE F / clockguard) ---------------------
{
  const grab = async (fn) => { try { await fn(); return null } catch (e) { return e } }
  const bad = mk({ 'vmu.chat.speakQuota': 5, 'vmu.chat.speakQuotaWindowMs': 1000 }, { clock: () => 'not-a-time' })
  const e1 = await grab(() => bad.send('r-1', 'hello'))
  ok(e1 && e1.code === 'VMU_INVALID_ARGUMENT', 'an uninterpretable clock is REFUSED BY NAME (never coerced to 0)')
  ok(/clock/.test(String(e1.message) + String(e1.hint || '')), 'and the refusal names the clock seam it could not read')
  ok(Array.isArray(e1.enforced) && e1.enforced.length === 0 && e1.enforcedScope === 'evaluated-so-far',
    'the clock refusal carries the evaluated scope too')
  ok(bad.status().messages === 0, 'nothing was appended on that refusal')
  const chat = mk({ 'vmu.chat.admins': ['acad'] })
  const sinceBad = await grab(() => chat.list({ since: 'yesterday-ish' }))
  ok(sinceBad && sinceBad.code === 'VMU_INVALID_ARGUMENT' && /since/.test(String(sinceBad.message)),
    'list({ since }) with an uninterpretable instant is refused BY NAME rather than silently matching nothing')
  ok(chat.list({ since: clock() - 1000 }).ok === true, 'a finite `since` still filters normally')
  // HONEST COVERAGE NOTE: the third state — a MUTE RECORD whose stored expiry is uninterpretable — cannot be
  // driven from this public API (durationMs is validated finite, so `until` is always a number). It IS guarded
  // in `activeMute` for durable/hand-edited records: the mute STAYS IN FORCE and the fact is recorded once as
  // `mute-uninterpretable` (audit + chat/refused), instead of being coerced to 0 which would silently unmute.
}

// ---- 10. projection seam v1: ledger-only snapshot, max+1, named refusals ---------------------------
{
  const c1 = mk({ 'vmu.chat.admins': ['acad'] })
  c1.send('r-1', 'one')
  c1.send('r-2', 'two', { replyTo: 'msg-1' })
  c1.mute('r-2', { durationMs: 5000, reason: 'hold', by: 'acad' })
  const snap = c1.snapshot()
  ok(snap.face === 'chat' && snap.v === 1 && snap.counters.chat === 2 && snap.skipped.length === 0,
    'a chat snapshot is a v1 envelope carrying the LAST used seq (no un-capturable state is hidden)')
  const flat = JSON.stringify(snap.data)
  ok(!flat.includes('speakQuota') && !flat.includes('freezeExemptAdmins') && !flat.includes('"admins"'),
    'policy is NOT in the snapshot (settings is re-resolved on restore, so an old declaration cannot win)')
  const c2 = mk({ 'vmu.chat.admins': ['acad'] })
  const r = c2.restore(snap)
  ok(r.ok === true && r.counters.chat === 2 && c2.status().messages === 2 && c2.status().muted.includes('r-2'),
    'restore hydrates the ledger AND the mutes')
  ok(c2.anchor('msg-1').text === 'one', 'a reply anchor survives the round trip')
  ok(c2.send('r-9', 'fresh').id === 'msg-3', 'and the next id continues at max+1 (names are immortal)')
  ok(c2.restore(snap).ok === false && c2.restore(snap).code === 'VMU_RESUME_RESTORE_CONFLICT',
    'a ledger that changed since the snapshot refuses a half-overwrite')
  const c3 = mk({})
  c3.send('x-1', 'busy')
  ok(c3.restore(snap).code === 'VMU_RESUME_RESTORE_CONFLICT', 'a DIFFERENT live chat is a named conflict')
  ok(c3.restore({ face: 'panel', v: 1, data: {} }).code === 'VMU_RESUME_SNAPSHOT_VERSION', 'a foreign face is refused by name')
  ok(c3.restore({ face: 'chat', v: 2, data: {} }).code === 'VMU_RESUME_SNAPSHOT_VERSION', 'a foreign version is refused by name')
  ok(c3.restore({ face: 'chat', v: 1, data: { messages: [] } }).code === 'VMU_RESUME_SNAPSHOT_INCOMPLETE', 'a missing collection is NAMED')
}

// ---- 11. G1 (Round 7): the private→public supplement (v5r's supplementOf + why) ---------------------
{
  const grab = (fn) => { try { fn(); return null } catch (e) { return e && e.code } }
  const c = mk({ 'vmu.chat.admins': ['acad'] })
  ok(grab(() => c.supplement({ by: 'r-1', why: 'x' })) === 'VMU_INVALID_ARGUMENT', 'a supplement without { of } is refused')
  ok(grab(() => c.supplement({ of: 'dm-1', why: 'x' })) === 'VMU_INVALID_ARGUMENT', 'without { by } it is refused (a supplement is the sender\'s own act)')
  ok(grab(() => c.supplement({ of: 'dm-1', by: 'r-1' })) === 'VMU_INVALID_ARGUMENT', 'and without a { why } it is refused (an unexplained supplement is the leak this prevents)')
  const s = c.supplement({ of: 'dm-1', by: 'r-1', why: 'the room needs the agreed number' })
  ok(s.ok === true && s.bodyWithheld === true && s.supplement.body === 'withheld',
    'the BODY IS NEVER COPIED — the public record is {of, by, at, why}')
  ok(s.authorship === 'claimed-unverified', 'without the private seam the face says it did NOT verify authorship (it never pretends)')
  ok(c.supplement({ of: 'dm-1', by: 'r-1', why: 'again' }).deduped === true, 'a second supplement of the same message is idempotent (append-only)')
  const via = c.supplementOf('dm-1')
  ok(via.ok === true && via.viaSupplement === true && via.bodyWithheld === true, 'citations resolve THROUGH the supplement book (viaSupplement)')
  ok(c.supplementOf('dm-404').ok === false && c.supplementOf('dm-404').code === 'VMU_CHAT_ANCHOR_DANGLING',
    'an unsupplemented private message stays unresolvable (named, never leaked)')
  ok(c.status().counts.supplements === 1, 'and the book is observable')
  const seam = mk({}, { privateSender: { senderOf: (id) => (id === 'dm-2' ? 'r-1' : null) } })
  ok(seam.supplement({ of: 'dm-2', by: 'r-1', why: 'ok' }).authorship === 'verified', 'with the seam a genuine sender is VERIFIED')
  const seam2 = mk({}, { privateSender: { senderOf: (id) => (id === 'dm-4' ? 'r-1' : null) } })
  ok(grab(() => seam2.supplement({ of: 'dm-4', by: 'r-9', why: 'steal' })) === 'VMU_NOT_PERMITTED', 'and only the SENDER may supplement (a mismatch is refused)')
  ok(grab(() => seam2.supplement({ of: 'dm-404', by: 'r-1', why: 'x' })) === 'VMU_CHAT_ANCHOR_DANGLING', 'a seam that cannot resolve the id refuses by name')
}

console.log('vmu-chat: ' + passed + ' passed, ' + failed + ' failed')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
