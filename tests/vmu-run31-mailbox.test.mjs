// tests/vmu-run31-mailbox.test.mjs — LIVE RUN 31, finding F1: THE MAIL EXISTED AND THE MEMBER'S KERNEL COULD NOT SEE IT.
//
// WHAT THE RUN SAID (run 31, log `_oneoff/vm-slv/full-1026-191645.jsonl`): the office sent mail to the institute —
// `vibe_v5_inbox {member:"res-01", status:"all"}` in the ROOT session answered `count:2`,
// `rows:[{id:"ml-1",from:"acad-01",...}]`. The SAME command in res-01's own member session (a separate kernel over the
// SAME durable root) answered `count:0, rows:[]` — three times — and res-02's answered `count:0` too. The durable file
// afterwards held `mailbox: null` while `records`/`members`/`meetings` held real values, and every member kernel's
// `vibe_vmu_mailbox {action:"status"}` reported `mechanism.hasStore:true, durable:false, seq:0, boxes:{}`.
//
// WHY: `kernel/mailbox.js` was self-persisting IN PRINCIPLE and read/written NOWHERE in practice — no assembly code
// called `persist()` or `restore()`, so the store never received a single message and the member's read faces answered
// from instance memory (empty). The institution's rules ("framework asks each member for a ruling", "members talk by
// mail") are only true if the mail one kernel queues is visible to another kernel over the same root.
//
// WHAT THIS FILE PROVES (each claim is a measured receipt, not a promise):
//   ① the run-31 defect itself: two kernels over one root, the office sends, the MEMBER's own inbox lists it;
//   ② the shared key holds the BARE snapshot shape `kernel/resume.js` counts unacked mail from — and it got there with
//      no `persist()` call (mutations write through);
//   ③ repeated pulls never duplicate a message, and mail the MEMBER sends reaches the OFFICE kernel;
//   ④ a member's `open()` (read flag) becomes visible to the office kernel;
//   ⑤ a member's `ack()` removes the entry from the office kernel's view (settlement + ledger are shared);
//   ⑥ a THIRD kernel booted from the same root still sees the surviving mail and its read flag;
//   ⑦ two kernels that mint the SAME id in one tick (seq is per instance) both survive — the collided entry is re-keyed,
//      never merged away and never dropped;
//   ⑧ a read before `store.open()` is a NAMED, counted refusal that RETRIES (this is the real boot order: kernels are
//      constructed before the entry opens the store), not a silent empty inbox;
//   ⑨ with no store port at all, the mailbox still answers honestly (`durable:false`, `persist().persisted:false`);
//   ⑩ when a resume PROJECTION owns the key, the write-through DECLINES by name instead of clobbering the envelope its
//      own reader hydrates from;
//   ⑪ a TRANSIENT filesystem refusal of the write-through (`EPERM` on the store's atomic rename, measured on Windows
//      while another kernel opens the same file) is retried a bounded number of times and the retry is reported — a
//      persistent failure still reaches the caller by name;
//   ⑫ an asynchronous `store.read` (a port that breaks the synchronous contract) is refused by name, never folded in;
//   ⑬ the RUN'S OWN COMMANDS: the office sends with `vibe_v5_message`, a second kernel boot takes the member session's
//      shape and `vibe_v5_inbox` answers 1 row — run 31 answered 0 — and the member's `open` is visible to the office.
//
// Run: node tests/vmu-run31-mailbox.test.mjs        Last line: === VMU RUN31 MAILBOX: N passed, M failed ===

import { mkdtemp, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const imp = (p) => import(pathToFileURL(resolve(REPO, p)).href)
const km = await imp('vibe-math-vmu/kernel/index.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)))
  }
}
const section = (title) => console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(2, 78 - title.length)))
// The write-through is SERIALISED and COALESCED (one promise chain per mailbox), so an assertion must give the queued
// write a chance to land. Bounded polling on a RECEIPT (never a fixed sleep as the only evidence): the predicate is the
// fact being asserted, the timeout only keeps a broken build from hanging.
const waitFor = async (pred, ms = 2000) => {
  const deadline = Date.now() + ms
  let last = await pred()
  while (!last && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5))
    last = await pred()
  }
  return last
}
// TWO KERNELS OVER ONE ROOT is the run-31 topology: each sub-session assembles its own kernel, and they share only the
// durable store (`<root>/vmu/state.json`). `clock` is injected so receipts are deterministic.
const boot = async (root, clock) => {
  const k = km.createKernel({ root, clock, settings: {} })
  await k.store.open()
  return k
}
const idsOf = (listing) => (listing.entries || []).map((e) => e.id)

const root = await mkdtemp(join('D:/_tmp', 'vmu-run31-'))

section('① THE DEFECT: the office kernel and the member kernel are two instances over ONE store')
{
  const office = await boot(root, () => 1000)
  const member = await boot(root, () => 2000)
  ok(member.mailbox.list('res-01').count === 0,
    '① setup: the member kernel starts with an EMPTY inbox (nothing has been queued yet)',
    { count: member.mailbox.list('res-01').count })
  ok(member.mailbox.status().shared.key === 'mailbox' && member.mailbox.status().shared.storeBound === true,
    '① setup: both kernels DO hold the store port and name the same durable key (`shared.key:"mailbox"`)',
    { shared: member.mailbox.status().shared })

  const s1 = office.mailbox.send('acad-01', { to: ['res-01'], text: '请就 p-1 给出裁决意见' })
  const s2 = office.mailbox.send('acad-01', { to: ['res-01', 'res-02'], text: '会议 m1 提醒' })
  ok(s1.ok === true && s1.ids.length === 1 && s2.ok === true && s2.ids.length === 2,
    '① setup: the office queued three entries (one to res-01, two from the group send)',
    { s1: s1.ids, s2: s2.ids })

  // THIS is the command that answered 0 in run 31. The office's write-through is a microtask-chained `store.patch`
  // (the store's own API is async), so the poll waits on the FACT — the member's own inbox listing two mails — rather
  // than on a sleep. In a live run the member's read happens turns later; the assertion is that it can see them at all.
  const inbox = await waitFor(() => {
    const got = member.mailbox.list('res-01', { status: 'all' })
    return got.count === 2 ? got : null
  })
  ok(!!inbox,
    '① ★ THE RUN-31 DEFECT: the MEMBER kernel\'s inbox lists the two mails the office kernel sent (run 31 measured count:0)',
    { count: member.mailbox.list('res-01').count, ids: idsOf(member.mailbox.list('res-01')) })
  ok(member.mailbox.unread('res-01').unread === 2,
    '① the member "unread" count agrees (2), so the unread face is not a second, disagreeing truth',
    member.mailbox.unread('res-01'))
  ok(member.mailbox.status().pending === 3,
    '① `status().pending` counts every queued entry across members (2 for res-01 + 1 for res-02)',
    { pending: member.mailbox.status().pending })
  ok(member.mailbox.list('res-01', { status: 'unread' }).count === 2,
    '① the `unread` FILTER sees them too (run 31 asked with status:"unread" first)',
    member.mailbox.list('res-01', { status: 'unread' }).count)
  const entries = member.mailbox.list('res-01').entries
  ok(entries.length === 2 && entries.every((r) => r.from === 'acad-01' && r.read === false),
    '① the pulled rows carry the real sender and an unread state (nothing is invented by the merge)',
    entries)
}

section('② THE SHAPE ON DISK: a bare snapshot, written with NO persist() call, in the shape resume counts')
{
  const office = await boot(root, () => 1100)
  const raw = await waitFor(() => {
    const got = office.store.read('mailbox')
    return got && got.face === 'mailbox' && got.data && typeof got.data.boxes === 'object' ? got : null
  })
  ok(!!raw,
    '② the shared key holds the BARE `{face:"mailbox", data:{boxes,…}}` snapshot (the shape `kernel/resume.js` reads for unacked mail)',
    { face: raw && raw.face })
  ok(!!raw && raw.mode === undefined,
    '② it is NOT a projection envelope: the mailbox owns the bare shape in the shipped assembly',
    { mode: raw && raw.mode })
  ok(!!raw && Array.isArray(raw.data.boxes['res-01']) && raw.data.boxes['res-01'].length === 2,
    '② both of res-01\'s messages are on disk', { onDisk: raw && (raw.data.boxes['res-01'] || []).map((e) => e.id) })
  // The claim is about the SOURCE of the defect scenario: the block that queues the mail (①) must never call
  // `persist()`, so the document on disk can only have been put there by a MUTATION writing through. Comment lines are
  // dropped first so this scan reads code, not prose.
  const src = await readFile(fileURLToPath(import.meta.url), 'utf8')
  const setupCode = src.slice(src.indexOf("section('①"), src.indexOf("section('②"))
    .split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n')
  ok(setupCode.length > 0 && !/persist\s*\(/.test(setupCode),
    '② ★ the DEFECT SETUP (①) never calls `persist()`: the mail reached the shared key because a MUTATION wrote through',
    { scanned: setupCode.length })
  ok(office.mailbox.status().shared.pullRefused === 0 && office.mailbox.status().shared.lastError === null,
    '② a healthy shared key reports zero refusals (the health counters are not decoration)',
    office.mailbox.status().shared)
}

section('③ NO DUPLICATES in either direction: repeated pulls are idempotent, and member → office mail arrives')
{
  const office = await boot(root, () => 1200)
  const member = await boot(root, () => 2200)
  for (let i = 0; i < 5; i += 1) member.mailbox.list('res-01')
  ok(JSON.stringify(idsOf(member.mailbox.list('res-01'))) === JSON.stringify(['ml-1', 'ml-2']),
    '③ five repeated pulls do not duplicate a message (the merge is BY ID, not by append)',
    idsOf(member.mailbox.list('res-01')))

  const sent = member.mailbox.send('res-01', { to: ['acad-01'], text: '我的裁决意见：同意' })
  ok(sent.ok === true && sent.ids.length === 1,
    '③ setup: the member replies to the office (the peer-mail direction the rules require)', { ids: sent.ids })
  const officeInbox = await waitFor(() => {
    const got = office.mailbox.list('acad-01')
    return got.count === 1 ? got : null
  })
  ok(!!officeInbox && officeInbox.entries[0].from === 'res-01',
    '③ ★ mail the MEMBER sends reaches the OFFICE kernel (rulings and peer exchange need this direction)',
    officeInbox && officeInbox.entries)
  ok(member.mailbox.list('res-01').count === 2 && office.mailbox.list('acad-01').count === 1,
    '③ neither side double-counts after the exchange', {
      member: member.mailbox.list('res-01').count, office: office.mailbox.list('acad-01').count,
    })
}

section('④ A READ FLAG IS SHARED: the member opens a mail and the office kernel can see that')
{
  const office = await boot(root, () => 1300)
  const member = await boot(root, () => 2300)
  ok(member.mailbox.list('res-01').entries[0].id === 'ml-1' && member.mailbox.list('res-01').entries[0].read === false,
    '④ setup: ml-1 is unread for the member', member.mailbox.list('res-01').entries[0])
  const opened = member.mailbox.open('res-01', 'ml-1')
  ok(opened.ok === true && opened.read === true,
    '④ the member opens it (receipt says read:true)', { read: opened.read })
  const seen = await waitFor(() => {
    const row = office.mailbox.list('res-01').entries.find((e) => e.id === 'ml-1')
    return row && row.read === true ? row : null
  })
  ok(!!seen,
    '④ ★ the OFFICE kernel now reads ml-1 as read:true — "did the member receive/read the ruling request" is observable',
    office.mailbox.list('res-01').entries)
  ok(office.mailbox.status().shared.adoptedFlags >= 1,
    '④ the flag arrived through a counted adopt (not by luck)', office.mailbox.status().shared)
}

section('⑤ AN ACK IS SHARED: settlement moves the entry out of the office kernel\'s view too')
{
  const office = await boot(root, () => 1400)
  const member = await boot(root, () => 2400)
  const acked = member.mailbox.ack('res-01', 'ml-2')
  ok(acked.ok === true && acked.acked[0] === 'ml-2' && acked.remaining === 1,
    '⑤ the member acks ml-2 (its body is gone, one entry remains)', { acked: acked.acked, remaining: acked.remaining })
  const settled = await waitFor(() => {
    const got = office.mailbox.list('res-01')
    return got.count === 1 && idsOf(got)[0] === 'ml-1' ? got : null
  })
  ok(!!settled,
    '⑤ ★ the OFFICE kernel no longer lists ml-2 as pending — an ack anywhere is an ack everywhere',
    office.mailbox.list('res-01'))
  ok(office.mailbox.status().shared.droppedAcked >= 1,
    '⑤ the office DROPPED the settled entry by name (`shared.droppedAcked`), rather than keeping a phantom',
    office.mailbox.status().shared)
  const raw = office.store.read('mailbox')
  ok((raw.data.acked['res-01'] || []).some((r) => r.id === 'ml-2'),
    '⑤ the store\'s acked ledger records the settlement — the only evidence once the body is removed',
    (raw.data.acked['res-01'] || []).map((r) => r.id))
  ok((raw.data.boxes['res-01'] || []).map((e) => e.id).join(',') === 'ml-1',
    '⑤ the stored box itself holds only the unsettled entry', raw.data.boxes['res-01'])
}

section('⑥ A THIRD KERNEL boots from the same root and still sees the mail (state lives in the file)')
{
  const third = await boot(root, () => 3400)
  const inbox = third.mailbox.list('res-01')
  ok(inbox.count === 1 && idsOf(inbox)[0] === 'ml-1',
    '⑥ a fresh kernel over the same root lists the surviving message', { ids: idsOf(inbox) })
  ok(inbox.entries[0].read === true,
    '⑥ ★ and it sees the READ FLAG too — a fresh process did not reset "the member read this"',
    inbox.entries[0])
}

section('⑦ TWO KERNELS MINTING THE SAME ID IN ONE TICK: the collision is repaired, nothing is lost')
{
  const root2 = await mkdtemp(join('D:/_tmp', 'vmu-run31-sid-'))
  const c = await boot(root2, () => 4000)
  const d = await boot(root2, () => 4100)
  // Both kernels pull (empty store), then mint — synchronously, before either write-through lands. `seq` is per
  // instance, so both legitimately produce `ml-1`; a merge that keyed on the id alone would LOSE one of the two.
  const sc = c.mailbox.send('sender-c', { to: ['r'], text: 'from c' })
  const sd = d.mailbox.send('sender-d', { to: ['r'], text: 'from d' })
  ok(sc.ids[0] === 'ml-1' && sd.ids[0] === 'ml-1',
    '⑦ setup: both kernels minted the SAME id `ml-1` in one tick (seq is per instance — the real collision)',
    { c: sc.ids, d: sd.ids })
  const renamed = await waitFor(() => c.mailbox.status().shared.renamedOnCollision + d.mailbox.status().shared.renamedOnCollision > 0)
  ok(!!renamed,
    '⑦ ★ the collided entry was RE-KEYED and the rename is reported (`shared.renamedOnCollision`), not silently dropped',
    { c: c.mailbox.status().shared.renamedOnCollision, d: d.mailbox.status().shared.renamedOnCollision })
  const reader = await boot(root2, () => 4200)
  // The two write-throughs are serialised by the store's FILE LOCK (`lockBackoffMs`), so the second one lands tens of
  // milliseconds later: the reader polls the receipt instead of assuming it already landed.
  const both = await waitFor(() => {
    const got = reader.mailbox.list('r')
    return got.count === 2 ? got.entries : null
  })
  const rows = both || []
  ok(rows.length === 2 && new Set(rows.map((e) => e.from)).size === 2,
    '⑦ ★ BOTH messages survive under distinct ids (no message lost, no two messages merged into one)',
    rows.map((e) => e.id + '=' + e.from + ':' + e.subject))
  ok(rows.map((e) => e.subject).join('|') === 'from c|from d',
    '⑦ the two bodies are intact and in a stable order (the store\'s entry is kept, the incoming one is re-keyed)',
    rows.map((e) => e.subject))
  const adopted = await waitFor(() => {
    const got = d.mailbox.list('r')
    return got.count === 2 ? got : null
  })
  ok(!!adopted,
    '⑦ the re-keyed kernel ADOPTED its new id, so it does not double-count after the repair',
    idsOf(d.mailbox.list('r')))
}

section('⑧ BOOT ORDER: reading before `store.open()` is a NAMED refusal that retries (kernels are built before open)')
{
  const root3 = await mkdtemp(join('D:/_tmp', 'vmu-run31-boot-'))
  const early = km.createKernel({ root: root3, clock: () => 5000, settings: {} })   // NOT opened: the real boot order
  const cold = early.mailbox.status()
  ok(cold.shared.pullRefused >= 1 && cold.shared.lastError && cold.shared.lastError.code === 'VMU_STORE_FAILED',
    '⑧ ★ a read before the store is open reports a NAMED failure (`VMU_STORE_FAILED`), and counts it',
    cold.shared.lastError)
  ok(/not open/i.test(String((cold.shared.lastError && cold.shared.lastError.message) || '')),
    '⑧ the failure message says the store is not open — the caller\'s own vocabulary, not a swallowed error',
    { message: cold.shared.lastError && cold.shared.lastError.message })
  const coldList = early.mailbox.list('res-01')
  ok(coldList.ok === true && coldList.count === 0,
    '⑧ the read face still ANSWERS during boot (it must not throw before `open()`), so a sub-session can start',
    { count: coldList.count })

  const writer = await boot(root3, () => 5100)
  writer.mailbox.send('acad-01', { to: ['res-01'], text: 'queued while the member kernel was still starting' })
  // MEASURED (Windows, this machine): letting `open()` race ANOTHER store instance's in-flight patch makes the store's
  // atomic temp→target rename fail with EPERM (`kernel/store.js` `persist()`), which is a store property and not this
  // face's. The real order is also the one asserted here: the mail was written long before the sub-session booted, so
  // the test waits for the write-through to LAND and keeps the boot-order property itself under test — the refusal
  // recorded above was retried, never cached as "empty".
  const landed = await waitFor(() => {
    let raw = null
    try { raw = writer.store.read('mailbox') } catch { raw = null }
    return raw && raw.data && (raw.data.boxes['res-01'] || []).length === 1 ? raw : null
  })
  ok(!!landed,
    '⑧ the writer\'s write-through LANDED in the durable file with no explicit `persist()` call',
    { face: landed && landed.face })
  await early.store.open()                                        // the entry opens it later, exactly as vibemath-vmu.js does
  const healed = await waitFor(() => {
    const got = early.mailbox.list('res-01')
    return got.count === 1 ? got : null
  })
  ok(!!healed,
    '⑧ ★ the SAME kernel instance sees the mail after `open()` — the refusal was recorded and RETRIED, never cached as "empty"',
    early.mailbox.list('res-01'))
  ok(early.mailbox.status().shared.pullRefused >= 1 && early.mailbox.status().durable === true,
    '⑧ the refusal stays in the counters as history while `durable` now reports the truth',
    { shared: early.mailbox.status().shared, durable: early.mailbox.status().durable })
}

section('⑨ NO STORE PORT: durability is not faked, and nothing pretends to be shared')
{
  const memory = km.createKernel({ clock: () => 6000, settings: {} }).mailbox
  const st = memory.status()
  ok(st.shared.storeBound === false && st.shared.readable === false && st.durable === false,
    '⑨ a mailbox with no store reports `shared.storeBound:false` and `durable:false` — it never claims a shared key',
    st.shared)
  const p = await memory.persist()
  ok(p.ok === true && p.persisted === false && p.durable === false && p.reason === 'no store port is bound',
    '⑨ `persist()` still answers honestly with no store (unchanged public receipt)', p)
  const sent = memory.send('acad-01', { to: ['res-01'], text: 'in-memory only' })
  ok(sent.ok === true && memory.list('res-01').count === 1,
    '⑨ the in-memory mailbox keeps working; only the durability claim is withheld', { ids: sent.ids })
  ok(memory.refusals()['VMU_STORE_FAILED'] === undefined,
    '⑨ the ABSENCE of a store is not a refusal: nothing was attempted, so nothing failed',
    memory.refusals())
}

section('⑩ A RESUME PROJECTION OWNING THE KEY: the write-through declines BY NAME instead of clobbering the envelope')
{
  const root4 = await mkdtemp(join('D:/_tmp', 'vmu-run31-proj-'))
  const k = await boot(root4, () => 7000)
  // `kernel/resume.js` `stateEnvelope(value)` writes this shape and hydrates through `mailbox.hydrate(env.value)`.
  // `tests/vmu-resume-e2e.test.mjs` attaches exactly this projection, so in that process the key belongs to resume.
  const envelope = {
    v: 1, mode: 'state', key: 'mailbox', seq: 0, dropped: 0, incomplete: false, entries: [],
    value: k.mailbox.snapshot(), digest: 'not-this-face-to-recompute',
  }
  await k.store.patch('mailbox', () => envelope)
  const sent = k.mailbox.send('acad-01', { to: ['res-01'], text: 'queued after the projection took the key' })
  ok(sent.ok === true,
    '⑩ the send still SUCCEEDS (a projection owning the key is not an error for the caller)', { ids: sent.ids })
  const skipped = await waitFor(() => k.mailbox.status().shared.skippedEnvelope >= 1)
  ok(!!skipped,
    '⑩ ★ the write-through DECLINED by name (`shared.skippedEnvelope`) instead of replacing the envelope',
    k.mailbox.status().shared)
  const kept = k.store.read('mailbox')
  ok(kept && kept.mode === 'state' && kept.value && kept.value.face === 'mailbox',
    '⑩ ★ the envelope is INTACT — resume\'s hydration path (`env.mode === "state"` ⇒ `restore(env.value)`) keeps working',
    { mode: kept && kept.mode, face: kept && kept.value && kept.value.face })
  const pers = await k.mailbox.persist()
  ok(pers.ok === true && pers.persisted === false && pers.skipped === 'state-envelope',
    '⑩ `persist()` names the same reason instead of reporting a fake write',
    pers)
  ok(k.mailbox.list('res-01').count === 1,
    '⑩ the message is NOT lost to this instance — it lives in memory and in the projection owner\'s snapshot',
    k.mailbox.list('res-01').count)
  const tolerant = await k.mailbox.restore()
  ok(tolerant.ok === true && tolerant.restored === true,
    '⑩ `restore()` by key reads the envelope TOLERANTLY (`snapshotValueOf`) rather than refusing its shape',
    { restored: tolerant.restored, items: tolerant.restored_items && tolerant.restored_items.length })
}

section('⑪ A TRANSIENT filesystem refusal is RETRIED (bounded) and reported, never swallowed')
{
  const { createMailbox } = await imp('vibe-math-vmu/kernel/mailbox.js')
  // MEASURED on this machine: the store's atomic temp→target rename can fail with `EPERM` for a moment while another
  // kernel in the same process opens the same file. The merged document is still in this instance's memory at that
  // point, so a retry can still land it — but the retry must be NAMED, COUNTED and BOUNDED, and a failure that keeps
  // failing must still reach the caller with its own code.
  const flaky = {
    data: {},
    attempts: 0,
    read(key) { return this.data[key] },
    async patch(key, fn) {
      this.attempts += 1
      if (this.attempts === 1) { const e = new Error('EPERM: operation not permitted, rename tmp -> state.json'); e.code = 'EPERM'; throw e }
      this.data[key] = fn(this.data[key])
      return { changed: true }
    },
  }
  const retrying = createMailbox({ clock: () => 8000, settings: {}, log: () => {}, store: flaky })
  const sentOnce = retrying.send('acad-01', { to: ['res-01'], text: 'lands on the retry' })
  const landed = await waitFor(() => (flaky.data.mailbox ? flaky.data.mailbox : null))
  const rst = retrying.status().shared
  ok(sentOnce.ok === true && !!landed && rst.writeRetries === 1 && rst.writeRefused === 0,
    '⑪ ★ one transient `EPERM` is RETRIED and the mail still reaches the durable key (counted in `shared.writeRetries`)',
    rst)
  const box = (landed && landed.data && landed.data.boxes['res-01']) || []
  ok(box.length === 1 && box[0].text === 'lands on the retry',
    '⑪ the retried write is the SAME merged document — one message, not a duplicate', box.map((e) => e.id + ':' + e.text))
  ok(retrying.status().durable === true,
    '⑪ after the retry succeeds the face reports `durable:true` — the claim follows the write, not the attempt', rst)

  const stubborn = { attempts: 0, read() { return null }, async patch() { this.attempts += 1; const e = new Error('EPERM: still locked'); e.code = 'EPERM'; throw e } }
  const givingUp = createMailbox({ clock: () => 8100, settings: {}, log: () => {}, store: stubborn })
  const refused = await givingUp.persist()
  ok(refused.ok === false && refused.code === 'EPERM' && refused.message === 'EPERM: still locked',
    '⑪ ★ a PERSISTENT refusal is bounded (3 attempts) and then reported BY NAME — a retry never hides a failure',
    { persisted: refused.persisted, code: refused.code, message: refused.message })
  ok(stubborn.attempts === 3 && givingUp.status().shared.writeRefused === 1 && givingUp.status().durable === false,
    '⑪ the budget is exact (3 attempts, no infinite loop), the refusal is counted, and no durability is claimed',
    { attempts: stubborn.attempts, shared: givingUp.status().shared })
}

section('⑫ PORT HONESTY: an asynchronous `store.read` is refused BY NAME, never folded in as a document')
{
  const { createMailbox } = await imp('vibe-math-vmu/kernel/mailbox.js')
  // `kernel/store.js` `read(key)` returns its in-memory fold SYNCHRONOUSLY. A port that answers with a promise is a
  // caller error, and a tolerant fold would turn it into the worst receipt: `durable:true` for a share nobody read.
  const promised = createMailbox({
    clock: () => 8200, settings: {}, log: () => {},
    store: { async read() { return null }, async patch() { return { changed: true } } },
  })
  const pst = promised.status()
  ok(pst.shared.pullRefused === 1 && pst.shared.lastError && pst.shared.lastError.code === 'VMU_INVALID_ARGUMENT' && pst.durable === false,
    '⑫ ★ a promise-returning `store.read` is refused BY NAME (`VMU_INVALID_ARGUMENT`) and durability is NOT claimed',
    { lastError: pst.shared.lastError, durable: pst.durable })
  ok(/synchronous/.test(String((pst.shared.lastError && pst.shared.lastError.message) || '')),
    '⑫ the refusal explains the CONTRACT (the durable port reads synchronously), so the caller can fix the port',
    { message: pst.shared.lastError && pst.shared.lastError.message })
}

section('⑬ THE RUN-31 COMMAND ITSELF, through the PACK TOOLS: office `vibe_v5_message` → member `vibe_v5_inbox`')
{
  // ①–⑫ drive the mailbox FACE. The run's own report was made of TOOL calls, so the last receipt is the same pair the
  // members used: the office sends with `vibe_v5_message`, a SECOND kernel boot takes the member's own session shape and
  // asks `vibe_v5_inbox`. The pack declares its own slots (`declareSlots` is the pack's job), and `declareSlots` is also
  // where `members` attaches its projection and hydrates - so a member boot WITHOUT a manual declareSlots proves the
  // roster reached the second kernel from the durable file too (without it the tool refuses `VMU_NO_SUCH_OBJECT`).
  const entry = await imp('vibe-math-vmu/vibe-math-vmu.js')
  const toolRoot = await mkdtemp(join('D:/_tmp', 'vmu-run31-tools-'))
  const bootPack = async () => {
    const specs = []
    const ctx = {
      effect(fn) { return fn() },
      on() { return () => {} },
      tools: { register: async (spec) => { specs.push(spec); return () => {} } },
    }
    const handle = entry.apply(ctx, { root: toolRoot, clock: () => 9000, packs: ['v5r'] })
    await handle.ready()
    const call = async (name, args) => {
      const spec = specs.find((s) => s.name === name)
      if (!spec) throw new Error('the pack did not register ' + name)
      return JSON.parse(await spec.execute(args, {}))
    }
    return { handle, k: handle.kernel, call }
  }
  const office = await bootPack()
  const hired = []
  for (const [id, slot] of [['acad-01', 'chair'], ['res-01', 'member'], ['res-02', 'member']]) {
    hired.push((await office.k.members.hire({ id, slot, institution: 'sim' })).ok === true)
  }
  ok(hired.length === 3 && hired.every(Boolean), '⑬ the office roster holds the chair and the two members the run had', { hired })
  const s1 = await office.call('vibe_v5_message', { to: ['res-01'], content: 'res-01: your ruling is needed', subject: 'ruling 1' })
  const s2 = await office.call('vibe_v5_message', { to: ['res-02'], content: 'res-02: your ruling is needed', subject: 'ruling 2' })
  ok(s1.ok === true && s2.ok === true, '⑬ the office sends ONE mail per member through the pack tool (single recipient = its own box)',
    { s1: s1.ids, s2: s2.ids })
  const landed = await waitFor(async () => {
    const raw = office.k.store.read('mailbox')
    const boxes = (raw && raw.data && raw.data.boxes) || {}
    return (boxes['res-01'] || []).length === 1 && (boxes['res-02'] || []).length === 1
  })
  ok(landed === true, '⑬ the mail reached the durable file with no `persist()` call anywhere in this section',
    { stored: office.k.store.read('mailbox') && Object.keys((office.k.store.read('mailbox').data || {}).boxes || {}) })

  const member = await bootPack()
  const roster = (member.k.members && typeof member.k.members.roster === 'function') ? member.k.members.roster().map((m) => m.id) : []
  ok(roster.includes('res-01') && roster.includes('res-02'),
    '⑬ ★ the member session booted a SECOND kernel and its roster hydrated from the durable file (no manual declareSlots)',
    { roster })
  const inbox = await member.call('vibe_v5_inbox', { member: 'res-01', status: 'all' })
  ok(inbox.ok === true && inbox.count === 1 && (inbox.rows || []).map((r) => r.id).join('') === 'ml-1',
    '⑬ ★★ THE RUN-31 FIX, in the run\'s own vocabulary: the member\'s `vibe_v5_inbox` answers 1 row (run 31 answered 0)',
    { ok: inbox.ok, count: inbox.count, rows: (inbox.rows || []).map((r) => ({ id: r.id, from: r.from })) })
  // requirement 3 names BOTH faces: `vibe_v5_inbox` (the pack's inbox) and the generic `vibe_vmu_mailbox`
  // (kernel/tools/mailbox.js — the one run 31 asked `{action:'status'}` and got `durable:false, seq:0, boxes:{}`).
  // The generic face is the raw port, so it proves the fix at the layer below the pack too.
  const genericList = await member.call('vibe_vmu_mailbox', { action: 'list', member: 'res-01', status: 'all' })
  ok(genericList.ok === true && genericList.count === 1,
    '⑬ ★ the generic `vibe_vmu_mailbox` face reads the SAME mail in the member session (run 31 read 0)',
    { count: genericList.count, ids: (genericList.entries || []).map((e) => e.id) })
  const genericStatus = await member.call('vibe_vmu_mailbox', { action: 'status' })
  ok(genericStatus.ok === true && genericStatus.durable === true,
    '⑬ the generic `status` reports `durable:true` in the member session (run 31 reported `durable:false, boxes:{}`)',
    { durable: genericStatus.durable, seq: genericStatus.seq, boxes: genericStatus.boxes })
  const mid = (inbox.rows[0] || {}).id
  const opened = await member.call('vibe_v5_inbox', { member: 'res-01', status: 'all', action: 'open', id: mid })
  // The `open` receipt carries the settled id (the pack tool's own vocabulary); the READ flag is what the next list
  // shows, so the assertion follows the receipt instead of inventing a field the tool does not return.
  const readRow = (await member.call('vibe_v5_inbox', { member: 'res-01', status: 'all' })).rows.find((r) => r.id === mid) || null
  ok(opened.ok === true && opened.id === mid && readRow && readRow.read === true,
    '⑬ the tool\'s `open` marks the mail read in the member\'s kernel (the next list shows `read:true`)',
    { ok: opened.ok, id: opened.id, read: readRow && readRow.read })
  const sharedRead = await waitFor(async () => {
    const row = office.k.mailbox.list('res-01').entries.find((e) => e.id === (inbox.rows[0] || {}).id)
    return !!(row && row.read === true)
  })
  ok(sharedRead === true, '⑬ ★ the office kernel sees the member\'s read flag (the mark crossed kernels, not just the body)',
    { officeRows: office.k.mailbox.list('res-01').entries.map((e) => ({ id: e.id, read: e.read })) })
  const again = await member.call('vibe_v5_inbox', { member: 'res-01', status: 'all' })
  ok(again.count === 1 && (again.rows || []).length === 1,
    '⑬ a second pull does not duplicate the mail (one message stays one row)', { count: again.count })
}

console.log('')
if (failed) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  FAIL ' + f)
  console.error('=== VMU RUN31 MAILBOX: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exit(1)
} else {
  console.log('=== VMU RUN31 MAILBOX: ' + passed + ' passed, 0 failed ===')
}
