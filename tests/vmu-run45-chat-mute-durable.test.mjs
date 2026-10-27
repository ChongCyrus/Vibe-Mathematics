// RUN 45 (build fe98b36f) — "the mute that was acknowledged and then never enforced".
//
// Measured on the real machine:
//   vibe_vmu_chat { action:"mute", by:"r-1", member:"r-2", durationMs:600000 }
//     ⇒ { ok:true, muted:["r-2"] }
//   vibe_vmu_chat { action:"send", by:"r-2", text:"…" }   × 4  ⇒ SUCCESS (msg-1 … msg-4)
//   vibe_vmu_chat { action:"status" }                     ⇒ muted: []
//   vibe_vmu_chat { action:"unmute", member:"r-2" }       ⇒ wasMuted:false
//
// The guard is not the defect: a mute followed immediately by a send in ONE quiet kernel is refused
// (`VMU_CHAT_MUTED`). The defect is the WRITE ORDER AROUND THE GUARD — the durable chat projection:
//
//   · the write-through captures `chat.snapshot()` at the MUTATION, then `store.patch()` lands it later
//     (`kernel/resume.js` after-hook → `snapshot({key})` → `write()`), and `store.patch` reloads the fold
//     FIRST (`store.js` mutate → reloadIfStale) so the reload hook runs between the two;
//   · the reload hook (`kernel/index.js` §1-(5)) restores the durable value into the live face. Chat has no
//     ADDITIVE restorer (the one `members` got in task §5), so it called `chat.restore()`, which is a
//     WHOLESALE REPLACE whose only protection is "refuse when I already hold messages". A mute is recorded
//     BEFORE anybody speaks (the run-45 order), so the live ledger was EMPTY and the stale fold was
//     accepted: `mutes.clear()` — a READ destroying state;
//   · what the write then landed was the snapshot captured BEFORE that reload, so a later, older payload
//     could also clobber the mute-bearing one on disk (the lead's hypothesis: "admin 的 snapshot 后落").
//
// Every case below is DETERMINISTIC: two kernels over one durable file make one store stale, and the
// stale-read-then-late-write interleaving is produced by call order, never by sleeping.
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = process.cwd()
const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const BASE = 'D:/_tmp/r45/teammate-chat'
await mkdir(BASE, { recursive: true })
const root = await mkdtemp(join(BASE, 'mute-'))
const SETTINGS = {
  'vmu.resume.projections': ['chat'],
  'vmu.resume.autoRecover': true,
  'vmu.resume.writeThrough': true,
  // ONE declared officer, so `mute`/`unmute` pass the kernel's own admin gate (the face adds no policy).
  'vmu.chat.admins': ['r-1'],
}
// `settle()` drains the write-through promises the after-hook registered; without it a test reads the file
// before the durable write landed and calls a working mechanism broken (the reverse false-failure).
const flush = async (k) => { if (k.resumeService && typeof k.resumeService.settle === 'function') await k.resumeService.settle() }
const openKernel = async (home = root) => {
  const k = m.createKernel({ root: home, clock: () => Date.now(), settings: Object.assign({}, SETTINGS) })
  await k.store.open()
  // A real boot is `read()` (the durable fold) + `hydrate()` (mode:'state' faces restored from it); the engine
  // refuses every write-through before that first read by name (`VMU_RESUME_WRITE_BEFORE_READ`), so a test that
  // skipped it would be measuring its own omission, not the kernel.
  await k.resumeService.read()
  await k.resumeService.hydrate({ keys: ['chat'] })
  return k
}
const codeOf = (fn) => {
  try { const r = fn(); return r && typeof r.then === 'function' ? { async: true, r } : { code: null, result: r } } catch (e) { return { code: (e && e.code) || 'THREW', message: String((e && e.message) || e) } }
}
const sendCode = (k, who, text) => codeOf(() => k.chat.send(who, text, {})).code
// The durable chat envelope is the authority a SECOND session would boot from; read the file, not the memory.
const foldChat = async (home = root) => {
  const raw = JSON.parse(await readFile(join(home, 'vmu', 'state.json'), 'utf8'))
  return raw && raw.keys ? raw.keys.chat : null
}
const foldMuted = async (home = root) => {
  const env = await foldChat(home)
  const data = env && env.value && env.value.data
  return data && data.mutes ? Object.keys(data.mutes).sort() : []
}

try {
  // ══ §1 THE RUN-45 ORDER: mute lands while the kernel's own write-through reloads a stale fold ══════════════
  // `officer` and `peer` are two kernels over ONE durable file. `peer` speaks first, so the officer's in-memory
  // fold is one write behind. The officer then mutes: its after-hook captures a mute-bearing snapshot, and
  // `store.patch` reloads that stale fold BEFORE landing it. That reload is the read that used to destroy the mute.
  const officer = await openKernel()
  const peer = await openKernel()
  peer.chat.send('r-1', 'a line that makes the officer stale', {})
  await flush(peer)
  // ★ ROUND 47: a `status()` READ now syncs the shared book (run 47's own defect: it did not), so the staleness this
  // setup needs is measured on the MEMORY (`snapshot()`, which is not a read of the book), not through `status()`.
  // What the silence means is unchanged: the officer's ledger still holds 0 lines until something reads through.
  ok(officer.chat.snapshot().data.messages.length === 0, 'setup: the officer has not merged the peer line yet (its memory is still empty)',
    officer.chat.snapshot().data.messages.length)

  const muted = officer.chat.mute('r-2', { durationMs: 600000, reason: 'run 45 replay', by: 'r-1' })
  await flush(officer)
  ok(muted.ok === true && Array.isArray(muted.muted) && muted.muted.includes('r-2'),
    '★★★ R45a: the mute receipt says r-2 is muted NOW (status and receipt answer the same question)', muted && muted.muted)

  // ★★★ THE REGRESSION THE REAL MACHINE SHOWED: the acknowledged mute is still there after the reload.
  ok(JSON.stringify(officer.chat.status().muted) === JSON.stringify(['r-2']),
    '★★★ R45b: status.muted still names r-2 AFTER the mute\'s own write-through reloaded the stale fold',
    officer.chat.status().muted)

  // ★★★ …and the guard still refuses that member in the SAME kernel.
  const sendR2 = codeOf(() => officer.chat.send('r-2', 'msg-1', {}))
  ok(sendR2.code === 'VMU_CHAT_MUTED',
    '★★★ R45c: a send by the muted member is refused BY NAME in the muting kernel (was: SUCCESS msg-1)',
    sendR2.code || JSON.stringify(sendR2.result))
  ok(officer.chat.status().messages === 1,
    '★★ R45d: and the refused send added no message (the refusal is not a silent accept)',
    officer.chat.status().messages)

  // ★★★ The durable fold still carries the mute: the write-through that landed after the reload must not be the
  // older, mute-less payload (the lead's "两次写顺序颠倒" hypothesis).
  const foldMutes1 = await foldMuted()
  ok(JSON.stringify(foldMutes1) === JSON.stringify(['r-2']),
    '★★★ R45e: the durable chat fold still mutes r-2 (the late write did not overwrite the mute-bearing snapshot)',
    foldMutes1)

  // ══ §1b THE INTERLEAVE THE WRITE ORDER ALLOWS: a NEWER write lands BETWEEN the mute and its own landing ═══
  // §1 above is the real run-45 order (a stale fold waiting when the mute is written). This case is the harder one
  // and it is what "the two write-throughs interleave" means: the fold is not stale-but-quiet, it is REWRITTEN
  // between the mute and the mute's own landing. The seam is the kernel's own `store.patch` — the function the
  // write-through goes through — so the interleave is produced by call order, never by sleeping:
  //   1. `duo` mutes r-2 (memory now holds the mute; the write-through payload is already captured);
  //   2. `rival` — another kernel over the same file — speaks, so the fold is NEWER in time and MUTE-LESS in content;
  //   3. the mute's write-through then reloads that fold. A replace-restore accepts it (duo's ledger is empty and its
  //      snapshot is pre-mute), clears the mute book, and the guard goes blind — while the file briefly holds the
  //      mute, which is exactly why the real machine's `status` said `muted:[]` although the receipt had said `["r-2"]`.
  // A kernel whose ledger is empty is the ONLY shape where replace-restore accepts a differing snapshot, so this
  // case gets its OWN durable file: on the shared one, `duo` would boot with §1's message and mute already adopted
  // and the replace path would refuse — passing for the wrong reason.
  const rootSeam = await mkdtemp(join(BASE, 'seam-'))
  const duo = await openKernel(rootSeam)
  const rival = await openKernel(rootSeam)
  ok(duo.chat.status().messages === 0, 'setup: the interleaved kernel starts with an empty ledger', duo.chat.status().messages)
  ok(duo.chat.status().muted.length === 0, 'setup: and holds no mute of its own yet', duo.chat.status().muted)
  const realPatch = duo.store.patch
  let injected = false
  duo.store.patch = async (key, fn) => {
    if (!injected && String(key) === 'chat') {
      injected = true
      rival.chat.send('r-1', 'a line that lands between the mute and its write-through', {})
      await flush(rival)
    }
    return realPatch(key, fn)
  }
  const seamMute = duo.chat.mute('r-2', { durationMs: 600000, reason: 'interleaved landing', by: 'r-1' })
  await flush(duo)
  duo.store.patch = realPatch
  ok(seamMute && seamMute.ok === true, 'setup: the mute was acknowledged before the interleave', seamMute && seamMute.muted)
  ok(injected === true, 'setup: the interleave really happened (the peer write landed between the mute and its landing)', injected)
  ok(JSON.stringify(duo.chat.status().muted) === JSON.stringify(['r-2']),
    '★★★ R45p: a write that lands after a newer ONE still keeps the mute book (the reload merges, never clears)',
    duo.chat.status().muted)
  ok(sendCode(duo, 'r-2', 'msg-seam') === 'VMU_CHAT_MUTED',
    '★★★ R45q: and the muting kernel still refuses the member it acknowledged muting',
    sendCode(duo, 'r-2', 'msg-seam'))
  const seamFold = await foldMuted(rootSeam)
  ok(seamFold.indexOf('r-2') !== -1, '★★★ R45r: the durable fold keeps the mute too (the late landing did not overwrite it)', seamFold)
  ok(duo.chat.status().messages === 1,
    '★★ R45s: the line the newer write put in the fold was ADOPTED by the reload, not erased by the older landing',
    duo.chat.status().messages)

  // ══ §6 THE FACE THE OPERATOR ACTUALLY CALLED MUST REFUSE BY NAME TOO ═══════════════════════════════════════
  // Run 45 was not a kernel-API session: every call arrived as `vibe_vmu_chat`. The face adds no policy — it maps
  // the kernel's named refusal onto a named tool refusal — so a lost mute book surfaces as a SUCCESSFUL `send`
  // on the very surface the operator is watching. `officer` still mutes r-2 here (§5 lifts it later).
  const { makeChatSpec } = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'tools', 'chat.js')).href)
  const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
  const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })
  const face = makeChatSpec({ param, refused, TOOL_NAMES: { chat: 'vibe_vmu_chat' }, kernel: { chat: officer.chat } })
  const faceStatus = await face.run({ action: 'status' })
  ok(Array.isArray(faceStatus.muted) && faceStatus.muted.indexOf('r-2') !== -1,
    '★★★ R45t: `vibe_vmu_chat {action:"status"}` names r-2 (the face reads the same mute book the mute wrote)',
    faceStatus.muted)
  const faceSend = await face.run({ action: 'send', by: 'r-2', text: 'the run-45 message that must not go through' })
  ok(faceSend.ok === false && faceSend.code === 'VMU_CHAT_MUTED',
    '★★★ R45u: `vibe_vmu_chat {action:"send", by:"r-2"}` is refused VMU_CHAT_MUTED through the face',
    faceSend.code || JSON.stringify(faceSend))
  ok((await face.run({ action: 'status' })).messages === faceStatus.messages,
    '★★ R45v: and the refused face call appended nothing (a refusal is not a message)',
    (await face.run({ action: 'status' })).messages)

  // ══ §2 A FRESH KERNEL INSTANCE MUST ENFORCE IT (cross-kernel, from the durable file) ══════════════════════
  // Run 45's mute lived in the file only until the next kernel read it. Hydration runs through the same
  // restore path a reload does, so a stale mute-less snapshot could erase it at boot as well.
  const fresh = await openKernel()
  ok(JSON.stringify(fresh.chat.status().muted) === JSON.stringify(['r-2']),
    '★★★ R45f: a kernel booted AFTER the mute reads it from the durable fold (status.muted)', fresh.chat.status().muted)
  const freshSend = codeOf(() => fresh.chat.send('r-2', 'msg-2', {}))
  ok(freshSend.code === 'VMU_CHAT_MUTED',
    '★★★ R45g: and its send is refused VMU_CHAT_MUTED (mute survives a restart, not just one kernel\'s memory)',
    freshSend.code || JSON.stringify(freshSend.result))

  // ══ §3 A LIVE KERNEL THAT ALREADY SPOKE MUST BE REFUSED (the run-45 sender's shape) ══════════════════════
  // `speaker` booted BEFORE the mute and already holds a message of its own, so the live ledger is NON-EMPTY.
  // A replace-restore refuses in this state (correctly — it must not drop messages), which used to mean the
  // mute was never adopted at all: the member kept talking from its own session.
  const speaker = await openKernel()
  speaker.chat.send('r-1', 'an earlier line from someone who is not muted', {})
  await flush(speaker)
  officer.chat.mute('r-3', { durationMs: 600000, reason: 'live speaker', by: 'r-1' })
  await flush(officer)
  const wording = codeOf(() => speaker.chat.send('r-3', 'msg-3', {}))
  ok(wording.code === 'VMU_CHAT_MUTED',
    '★★★ R45h: a LIVE kernel with a non-empty ledger still refuses the member muted by another kernel instance',
    wording.code || JSON.stringify(wording.result))
  ok(JSON.stringify(speaker.chat.status().muted).indexOf('r-3') !== -1,
    '★★ R45i: and its status names r-3 — the mute was ADOPTED, not merely noticed by the guard',
    speaker.chat.status().muted)

  // ══ §4 ADAPTIVE ORDER REVERSED: an OLDER payload must not clobber a NEWER mute ═══════════════════════════
  // `laggard` holds a chat write-through whose payload was captured BEFORE it ever read the mute. Landing that
  // payload after the mute is exactly "the admin's snapshot lands last". The write must refresh on the way in
  // (read-before-write) so what lands is the state the fold ALREADY has, never an older book.
  const laggard = await openKernel()
  const muteFold = await foldChat()
  ok(!!(muteFold && muteFold.value && muteFold.value.data && muteFold.value.data.mutes['r-3']),
    'setup: the fold really mutes r-3 before the laggard writes', await foldMuted())
  laggard.chat.setQuota(5, { windowMs: 0, by: 'r-1' })   // captured from a fold that has not seen the later mute
  await flush(laggard)
  const afterLaggard = await foldMuted()
  ok(afterLaggard.indexOf('r-3') !== -1,
    '★★★ R45j: a chat write captured from a STALE fold does not erase the mute a newer snapshot put in the file',
    afterLaggard)
  ok(JSON.stringify(laggard.chat.status().muted).indexOf('r-3') !== -1,
    '★★ R45k: and the writing kernel adopts the mute instead of forgetting it', laggard.chat.status().muted)

  // ══ §5 THE RECEIPTS AGREE: mute → status → unmute → status (same kernel, same question) ══════════════════
  const was = officer.chat.unmute('r-2', { reason: 'run 45 replay ends', by: 'r-1' })
  ok(was.ok === true && was.wasMuted === true,
    '★★★ R45l: unmute reports wasMuted:true for a member the fold and the memory both mutes (was: false)', was && was.wasMuted)
  const afterLift = officer.chat.status().muted
  ok(afterLift.indexOf('r-2') === -1,
    '★★★ R45m: and status.muted no longer names r-2 — `wasMuted` and `status.muted` answer the same question',
    afterLift)
  const liftSend = codeOf(() => officer.chat.send('r-2', 'msg-4', {}))
  ok(liftSend.code === null,
    '★★★ R45n: the lifted member may speak again (unmute is a real lift, not a stale book that keeps refusing)',
    liftSend.code || JSON.stringify(liftSend.result))
  await flush(officer)
  const afterUnmute = await foldMuted()
  ok(afterUnmute.indexOf('r-2') === -1,
    '★★ R45o: and the lift is durable: the fold no longer mutes r-2 (a later kernel would not resurrect it)',
    afterUnmute)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('=== VMU RUN45 CHAT MUTE DURABLE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) console.log('FAILURES: ' + failures.join(' | '))
process.exit(failed ? 1 : 0)
