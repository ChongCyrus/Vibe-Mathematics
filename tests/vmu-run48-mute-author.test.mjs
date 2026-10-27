// RUN 48 (the institute's own report, run-48 office feedback ①) — "the mute row lost its AUTHOR on the way to disk".
//
// Measured on the real machine (run 48, the "MuteAuthor" debt):
//   office  vibe_vmu_chat { action:"policy" } ⇒
//     mutes["r-2"] = { until:1793066683389, reason:"第48轮验收：检验禁言是否跨内核/跨回合生效", by:"r-acad" }
//   durable <root>/vmu/state.json ⇒ keys.chat.value.data.mutes["r-2"] =
//     { until:1793066683389, reason:"… (restored from the durable fold on reload)", by:null, at:1793066091571 }
//
// The durable `(restored from the durable fold on reload)` marker is the FINGERPRINT of the path that lost the author: it
// is appended ONLY by the reload-merge hook (`vibe-math-vmu/kernel/index.js` §1-(5) `chatReloadMerge`, the branch for a
// kernel whose ledger already holds messages). That branch cannot use `restore()` (it refuses a differing snapshot by
// name, so the fold's mutes go through the face's own `mute()` under `source:'framework'`) — and it did not pass an
// author, so `mute()` stored `by:null` and THAT kernel's write-through landed the row over the office's. A mute is a
// statement about a member; losing who ordered it is losing half the statement.
//
// Root cause: `vibe-math-vmu/kernel/index.js:1569` called
//   chat.mute(member, { durationMs, reason, source: 'framework' })
// with no author — and the framework bootstrap path may not NAME one (`vibe-math-vmu/kernel/chat.js` `requireAdmin`:
// 'the framework bootstrap path must not name an acting member'), while naming r-acad as a MEMBER would demand that
// r-acad be a chat admin. So the author has to travel as the RESTORED ROW (`restored: { until, reason, by, at }`), not as
// an actor: the adoption is not a new order, it is the same order entering a second kernel.
//
// Every case below is DETERMINISTIC: two kernels over one durable file make one store stale, and the adoption is produced
// by call order, never by sleeping.
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = process.cwd()

// The store writes through fire-and-forget, so a teardown can meet a write that is still landing: run 61's gate saw
// `ENOTEMPTY: directory not empty, rmdir '…\vmu'` AFTER every assertion in this suite had passed. A directory-listing
// race at teardown is not a product defect (the rows under test were already read), so the removal waits the write out.
async function removeTree(dir) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await rm(dir, { recursive: true, force: true }); return } catch (e) {
      const code = e && e.code
      if (code !== 'ENOTEMPTY' && code !== 'EPERM' && code !== 'EBUSY') throw e
      await new Promise((done) => setTimeout(done, 25))
    }
  }
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}
const m = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
const { makeChatSpec } = await import(pathToFileURL(resolve(REPO, 'vibe-math-vmu', 'tools', 'chat.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const BASE = 'D:/_tmp/r48/mute-author'
await mkdir(BASE, { recursive: true })
const root = await mkdtemp(join(BASE, 'author-'))
const SETTINGS = {
  'vmu.resume.projections': ['chat'],
  'vmu.resume.autoRecover': true,
  'vmu.resume.writeThrough': true,
  // The office is the chat ADMIN that orders the mute in run 48 (`by:"r-acad"` through the face, source:'member').
  'vmu.chat.admins': ['r-acad'],
}
// `settle()` drains the write-through promises the after-hook registered; without it a test reads the file before the
// durable write landed and calls a working mechanism broken (the reverse false-failure).
const flush = async (k) => { if (k.resumeService && typeof k.resumeService.settle === 'function') await k.resumeService.settle() }
const openKernel = async (home = root) => {
  const k = m.createKernel({ root: home, clock: () => Date.now(), settings: Object.assign({}, SETTINGS) })
  await k.store.open()
  // A real boot is `read()` (the durable fold) + `hydrate()` (mode:'state' faces restored from it); every write-through
  // before that first read is refused by name, so a test that skipped it would measure its own omission.
  await k.resumeService.read()
  await k.resumeService.hydrate({ keys: ['chat'] })
  return k
}
// The durable chat envelope is the authority the next session boots from: read the FILE, not the memory.
const foldChat = async (home = root) => {
  const raw = JSON.parse(await readFile(join(home, 'vmu', 'state.json'), 'utf8'))
  return raw && raw.keys ? raw.keys.chat : null
}
const foldMute = async (member, home = root) => {
  const env = await foldChat(home)
  const data = env && env.value && env.value.data
  return data && data.mutes ? data.mutes[member] : null
}
// The face the operator actually calls (`vibe_vmu_chat`), constructed the way run 45's suite builds it.
const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })
const faceOf = (chat) => makeChatSpec({ param, refused, TOOL_NAMES: { chat: 'vibe_vmu_chat' }, kernel: { chat } })

const REASON = 'run 48: cross-kernel / cross-turn mute author'

try {
  // ══ §1 THE OFFICE ORDERS THE MUTE ═══════════════════════════════════════════════════════════════════════════════
  const office = await openKernel()
  const member = await openKernel()   // a SECOND kernel over the SAME durable file (a member sub-session)
  const memberSays = await faceOf(member.chat).run({ action: 'send', by: 'r-1', text: 'a line from the member kernel BEFORE the mute' })
  await flush(member)
  ok(!!memberSays && memberSays.ok === true && member.chat.snapshot().data.messages.length === 1,
    'setup: the member kernel holds a line of its own (its ledger is NON-EMPTY: restore() would refuse a differing fold)',
    member.chat.status().messages)

  const muted = await faceOf(office.chat).run({ action: 'mute', member: 'r-2', durationMs: 600000, reason: REASON, by: 'r-acad' })
  ok(!!muted && muted.ok === true && Array.isArray(muted.muted) && muted.muted.includes('r-2'),
    'setup: the office muted r-2 through `vibe_vmu_chat` (by:"r-acad")', muted && muted.muted)
  ok(!!muted && muted.by === undefined && muted.restored === undefined && muted.restoredBy === undefined,
    '★ R48a: the PUBLIC mute receipt is unchanged (no author/restored* keys leak into it)', muted && Object.keys(muted).sort())
  await flush(office)

  const authored = await foldMute('r-2')
  ok(!!authored && authored.by === 'r-acad',
    '★★ R48b: the office\'s own write-through lands the AUTHOR on the durable row (the setup for the loss below)', authored)
  const authoredAt = authored ? Number(authored.at) : NaN
  const authoredUntil = authored ? Number(authored.until) : NaN
  ok(Number.isFinite(authoredAt) && authoredAt > 0, 'setup: the durable row carries the instant it was ordered at', authoredAt)

  // ══ §2 THE SECOND KERNEL ADOPTS IT (the branch that used to lose the author) ═════════════════════════════════════
  // `member` is one write behind the office: its next write-through reloads the durable fold FIRST (store.js mutate →
  // reloadIfStale), and the reload hook must merge the mute into a kernel whose ledger already has a line. That is the
  // `chatReloadMerge` non-empty-ledger branch — the ONLY caller of mute() that is not a human/tool action.
  const adoption = await faceOf(member.chat).run({ action: 'send', by: 'r-1', text: 'a line that makes the member kernel adopt the mute on its way in' })
  await flush(member)
  ok(!!adoption && adoption.ok === true && member.chat.snapshot().data.messages.length === 2,
    'setup: the member kernel wrote again (its write-through had to reload + merge the fold)', member.chat.status().messages)

  const adoptedRow = member.chat.policy().mutes['r-2'] || null
  ok(!!adoptedRow && adoptedRow.by === 'r-acad',
    '★★★ R48c: the ADOPTING kernel\'s own policy() keeps the author (was: by:null — a read that forgot who ordered the mute)', adoptedRow)
  ok(!!adoptedRow && Object.keys(adoptedRow).sort().join(',') === 'by,reason,until',
    '★ R48d: policy() mute rows keep their v1 shape (until/reason/by): the fix adds no public field', adoptedRow && Object.keys(adoptedRow).sort())
  const durableAfter = await foldMute('r-2')
  ok(!!durableAfter && durableAfter.by === 'r-acad',
    '★★★ R48e: … and the adopting kernel\'s write-through did NOT overwrite the durable author with null (the run-48 file row)', durableAfter)
  ok(!!durableAfter && Number(durableAfter.at) === authoredAt,
    '★★ R48f: the adopted row keeps the INSTANT it was ordered at (the merge compares `at`, so a re-minted one could resurrect a lifted mute)',
    durableAfter && { at: durableAfter.at, orderedAt: authoredAt })
  ok(!!durableAfter && Number(durableAfter.until) === authoredUntil,
    '★ R48g: and its expiry is the same instant (the round trip neither shortens nor extends the mute)',
    durableAfter && { until: durableAfter.until, orderedUntil: authoredUntil })
  ok(member.chat.status().muted.includes('r-2'),
    '★★ R48h: the adopted mute is IN FORCE on the adopting kernel (status.muted)', member.chat.status().muted)
  const guard = await faceOf(member.chat).run({ action: 'send', by: 'r-2', text: 'the muted member must not speak from the adopting kernel' })
  ok(!!guard && guard.ok === false && guard.code === 'VMU_CHAT_MUTED',
    '★★ R48i: and the guard refuses r-2 by name in that kernel', guard && (guard.code || guard.message))

  // THE AUDIT MUST NOT PIN IT ON THE WRONG ACTOR — and must still say WHO ordered it.
  const muteRows = member.chat.history().filter((r) => r && r.what === 'muted' && String(r.member) === 'r-2')
  const lastAdoption = muteRows[muteRows.length - 1] || null
  ok(!!lastAdoption && lastAdoption.bootstrap === true && lastAdoption.by === null,
    '★★ R48j: the adoption is still audited as the framework bootstrap, NOT as r-acad acting again', lastAdoption)
  ok(!!lastAdoption && lastAdoption.restored === true && lastAdoption.restoredBy === 'r-acad',
    '★★★ R48k: … and the audit row NAMES the author it restored (was: the author was simply gone from every record)', lastAdoption)

  // ══ §3 A KERNEL BOOTED AFTERWARDS READS THE AUTHOR BACK (run 48's actual symptom) ════════════════════════════════
  const reader = await openKernel()
  const readBack = await faceOf(reader.chat).run({ action: 'policy' })
  const readRow = readBack && readBack.mutes ? readBack.mutes['r-2'] : null
  ok(!!readRow && readRow.by === 'r-acad',
    '★★★ R48l: `vibe_vmu_chat {action:"policy"}` on a kernel booted AFTER the adoption answers by:"r-acad" (was: null)', readRow)
  ok(!!readRow && String(readRow.reason || '').indexOf(REASON) === 0,
    '★ R48m: and the durable reason still begins with the reason the office gave', readRow && readRow.reason)

  // ══ §4 THE AUTHOR IS PART OF THE ROW, NOT A ONE-SHOT PATCH ═══════════════════════════════════════════════════════
  const laterMute = await faceOf(member.chat).run({ action: 'mute', member: 'r-3', durationMs: 60000, reason: 'another mute from the adopting kernel', by: 'r-acad' })
  await flush(member)
  const durableLater = await foldMute('r-2')
  ok(!!laterMute && laterMute.ok === true && !!durableLater && durableLater.by === 'r-acad',
    '★★ R48n: a LATER write-through of the adopting kernel still lands by:"r-acad"', durableLater)
  const durableR3 = await foldMute('r-3')
  ok(!!durableR3 && durableR3.by === 'r-acad',
    '★ R48o: and a mute this kernel ordered itself still names its own actor (nothing was rewired)', durableR3)

  // ══ §5 THE BOOTSTRAP SEAM MAY NOT LAUNDER AN AUTHOR ══════════════════════════════════════════════════════════════
  let laundered = null
  try {
    office.chat.mute('r-9', { durationMs: 1000, by: 'r-acad', restored: { by: 'r-someone-else', at: 1, until: 9999999999999 } })
    laundered = 'accepted'
  } catch (e) { laundered = (e && e.code) || 'THREW' }
  ok(laundered === 'VMU_INVALID_ARGUMENT',
    '★★ R48p: a MEMBER mute may not pass a restored row (the author travels only on the framework adoption seam)', laundered)
  ok(office.chat.policy().mutes['r-9'] === undefined,
    '★ R48q: and the refused call wrote no mute (a refusal is not a half-applied order)', office.chat.policy().mutes['r-9'])
} finally {
  await removeTree(root)
}

console.log('=== VMU RUN48 MUTE AUTHOR: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) console.log('FAILURES: ' + failures.join(' | '))
process.exit(failed ? 1 : 0)
