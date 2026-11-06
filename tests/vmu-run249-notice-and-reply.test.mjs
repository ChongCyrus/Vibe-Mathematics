// tests/vmu-run249-notice-and-reply.test.mjs — RUN 249 / task-69 (F-11 · F-02 · F-01).
//
// THE 69TH LIVE RUN MEASURED THREE DEFECTS THE OFFICE COULD NOT SEE PAST, and all three are about the same gap:
// a fact existed somewhere and never reached the place a reader looks.
//
//   F-11 (high): 7 unread mails sat in the queue while the turn prompt carried NO `[新到的消息]` block anywhere in the
//     capture. The queue→noticeSource→noticeBlock chain rendered only when a PACK supplied a block, so a deployment
//     with no pack folded the lines into the status block and the header never appeared. Now the framework ships its
//     own block (kernel/notices.js) as the default (a pack still wins), and every assembly reports what the notice
//     channel did (`assembled.notices` = {lines, rendered, blockChars}) so "delivered to the queue" and "reached the
//     prompt" are two separately readable facts.
//
//   F-02 (high): a 7,328-character reply was CUT at 2,000 and the rest existed only in the child session. Now the bound
//     is the deployment's (`vmu.turn.replyLimitChars`, default 2000 — the default does NOT move), and when a reply is
//     cut the FULL text is written to the member's own file `Members/<member>/Turns/<turn>.md`; the receipt carries
//     `replyFullPath`, `replyFullSha256` (over the reply text only) and `replyFullBytes`. A loop with no archive seam
//     says so by name instead of claiming a copy.
//
//   F-01 (medium): the receipt said status:"applied" while the member had only replied `{"solved":false}` — "worked but
//     wrote nothing" was indistinguishable from "did not work". Now the receipt carries `replyBytes` (how much text
//     carried the answer) and `emptyReply` (no applicable value landed), and the settled ledger row carries both.
//
// §0 the three repairs are named shapes in the source
// §1 F-11: every seat renders the block, no unread ⇒ no header, and the assembly receipt names the lines
// §2 F-02: default bound unchanged, configurable, full text archived with a sha the receipt names
// §3 F-01: empty reply vs content reply, both readable from the receipt and the ledger
// §4 F-11 4b preflight: header present exactly when unread rows exist (3 seats), absent after ack, pack block still wins
//
// Run: node tests/vmu-run249-notice-and-reply.test.mjs   Last line: N passed, M failed

import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const NOTICES = join(REPO, 'vibe-math-vmu', 'kernel', 'notices.js')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const section = (name) => console.log('\n' + name)

const km = await import(pathToFileURL(KERNEL).href)
const kernelTurn = await import(pathToFileURL(TURN).href)
const kernelNotices = await import(pathToFileURL(NOTICES).href)
const entry = await import(pathToFileURL(ENTRY).href)
const kernelSource = await readFile(KERNEL, 'utf8')
const turnSource = await readFile(TURN, 'utf8')

const HEADER = '[新到的消息]'
const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r249-')); roots.push(d); return d }
const byteLen = (s) => Buffer.byteLength(String(s || ''), 'utf8')
const waitFor = async (pred, ms = 2000) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try { if (await pred()) return true } catch (e) { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 5))
  }
  return false
}

const bootKernel = async (extra = {}) => {
  const root = await mkRoot()
  const k = km.createKernel(Object.assign({ root, clock: () => 1000, settings: {} }, extra))
  await k.store.open()
  return { k, root }
}
const bootEntry = async (config = {}) => {
  const root = await mkRoot()
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, config))
  await handle.ready()
  await handle.kernel.store.open()
  return { k: handle.kernel, handle, root }
}
const assemblyText = async (k, member) => {
  const opened = await k.turn.open({ member, role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1 })
  const asm = await k.turn.assemble(opened.turn)
  return { text: String(asm.text || ''), notices: asm.notices || null }
}

try {
  // ── §0 NAMED SHAPES ────────────────────────────────────────────────────────────────────────────────────────
  section('§0 the three repairs are named shapes in the source')
  {
    ok(kernelNotices.INBOX_HEADER === HEADER, '§0a kernel/notices.js exports the same header the pack uses', kernelNotices.INBOX_HEADER)
    ok(kernelNotices.inboxBlock([]) === '', '§0b an empty queue renders NOTHING (zero mechanism preserved)')
    ok(kernelNotices.inboxBlock(['one']).split(NL)[0] === HEADER && kernelNotices.inboxBlock(['one']).includes('  one'),
      '§0c a non-empty queue renders header + two-space-indented line')
    ok(kernelSource.includes('noticeBlock: noticeBlock || kernelNoticeBlock'),
      '§0d the kernel default block is wired, and a pack block still wins')
    ok(kernelSource.includes('writeTurnArchive') && turnSource.includes('writeTurnArchive = null'),
      '§0e the F-02 archive is an injected seam on the loop, wired in the kernel')
    ok(turnSource.includes("settings['vmu.turn.replyLimitChars']") && turnSource.includes('REPLY_EXCERPT_DEFAULT = 2000'),
      '§0f the bound is read from settings with the framework default unchanged')
    ok(turnSource.includes('replyBytes') && turnSource.includes('emptyReply') && turnSource.includes('EMPTY_REPLY_MEANS'),
      '§0g F-01 facts are on the receipt by name, with their definition')
    ok(turnSource.includes('notices: { lines: pendingNotices.length'),
      '§0h every assembly reports the notice channel it rendered')
  }

  // ── §1 F-11: THE BLOCK REACHES THE PROMPT ──────────────────────────────────────────────────────────────────
  section('§1 F-11: a queue row reaches the turn prompt without a pack, and the assembly names it')
  {
    const { k } = await bootKernel()
    await k.mailbox.send('office', { to: 'm-1', kind: 'meeting-appointment', channel: 'mail', subject: '会议预约：探针会', text: '会议探针会已预约。' })
    const made = await assemblyText(k, 'm-1')
    ok(made.text.startsWith(HEADER), '§1a the assembly STARTS with the notice header (not folded into the status block)',
      made.text.slice(0, 80))
    ok(made.text.includes('【邮件·office】') && made.text.includes('mailbox ack ml-'),
      '§1b the member own row is printed with its ack instruction')
    ok(made.notices && made.notices.lines === 1 && made.notices.rendered === true && made.notices.blockChars > 0,
      '§1c the assembly receipt says 1 line drained, block rendered, and its size', made.notices)

    const fresh = await assemblyText(k, 'm-2')
    ok(fresh.text.includes(HEADER) === false, '§1d a member with NO unread row gets NO header (zero mechanism)')
    ok(fresh.notices && fresh.notices.lines === 0 && fresh.notices.rendered === false,
      '§1e and the receipt says zero lines, nothing rendered', fresh.notices)
  }

  // ── §2 F-02: THE CUT IS A POINTER NOW ─────────────────────────────────────────────────────────────────────
  section('§2 F-02: a cut reply is archived in the member own file, named by the receipt')
  {
    const longFenced = fence({ progress: '长'.repeat(3000) })
    const { k, root } = await bootKernel({
      deliverTurn: async () => ({ reply: longFenced, deliveryPath: 'fake-delegated' }),
    })
    const r = await k.turn.run({ member: 'm-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'run249 archive' })
    ok(r && r.ok === true, '§2a the turn settled', r && { ok: r.ok, code: r.code })
    ok(r.replyTruncated === true && r.replyLimitChars === 2000, '§2b the DEFAULT bound is still 2000 (not raised)',
      { truncated: r.replyTruncated, limit: r.replyLimitChars })
    ok(String(r.replyExcerpt).length === 2000, '§2c the excerpt is cut at the bound', String(r.replyExcerpt).length)
    ok(r.replyBytes === byteLen(longFenced), '§2d replyBytes is the FULL size, not the excerpt size', { replyBytes: r.replyBytes, len: byteLen(longFenced) })
    ok(typeof r.replyFullPath === 'string' && /^Members\/m-1\/Turns\/[^/]+\.md$/.test(r.replyFullPath),
      '§2e the receipt names the archive path in the member own shelf', r.replyFullPath)
    ok(r.replyFullSha256 === createHash('sha256').update(longFenced, 'utf8').digest('hex'),
      '§2f the sha256 is over the REPLY TEXT (verifiable without stripping a header)', String(r.replyFullSha256).slice(0, 12))
    ok(r.replyFullBytes === byteLen(longFenced), '§2g replyFullBytes matches the full reply', r.replyFullBytes)
    const disk = await readFile(join(root, r.replyFullPath), 'utf8')
    ok(disk.endsWith(longFenced), '§2h the file holds the FULL reply (the cut part is retrievable)')
    ok(disk.includes(String(r.replyFullSha256)), '§2i the file header carries the same sha the receipt names')
    ok(String(r.replyExcerptMeans || '').includes('replyFullPath'),
      '§2j a cut declares where the remainder is')

    // the deployment can widen (or tighten) the bound; the framework default is what does not move
    const widened = await bootKernel({
      settings: { 'vmu.turn.replyLimitChars': 9000 },
      deliverTurn: async () => ({ reply: fence({ progress: '中'.repeat(1500) }), deliveryPath: 'fake-delegated' }),
    })
    const r2 = await widened.k.turn.run({ member: 'm-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'run249 limit' })
    ok(r2.replyLimitChars === 9000 && r2.replyTruncated === false,
      '§2k vmu.turn.replyLimitChars widens the bound (a deployment can keep the whole reply)', { limit: r2.replyLimitChars, truncated: r2.replyTruncated })

    // a loop with NO archive seam must say so by name — never claim a copy it did not make
    const gov = kernelTurn.createTurnOrchestrator({
      sectionPolicy: () => ({ sections: [] }),
      prompt: { assemble: async () => ({ ok: true, text: 'PROBE', sources: [] }), assembleFor: async () => ({ ok: true, text: 'PROBE' }) },
      faces: kernelTurn.facesFrom({ records: { put: async () => ({ ok: true, recordId: 'rec-1' }), list: async () => ({ ok: true, rows: [] }) } }),
      settings: {},
      clock: () => '2026-01-01T00:00:00.000Z',
      deliver: async () => ({ reply: longFenced, deliveryPath: 'fake-delegated' }),
    })
    const bare = await gov.run({ member: 'm-9', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'run249 no-seam' })
    ok(bare.replyTruncated === true && bare.replyFullPath === undefined,
      '§2l no seam ⇒ no archive fields (no invented path)', { truncated: bare.replyTruncated, path: bare.replyFullPath })
    ok(String(bare.replyExcerptMeans || '').includes('no writeTurnArchive seam'),
      '§2m and the receipt says BY NAME that this kernel could not copy the rest')
  }

  // ── §3 F-01: EMPTY VS CONTENT ──────────────────────────────────────────────────────────────────────────────
  section('§3 F-01: the receipt tells an empty answer from a worked answer')
  {
    const empty = await bootKernel({ deliverTurn: async () => ({ reply: fence({ solved: false }), deliveryPath: 'fake-delegated' }) })
    const r = await empty.k.turn.run({ member: 'm-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'run249 empty' })
    const replyText = fence({ solved: false })
    ok(r.ok === true && r.emptyReply === true, '§3a {"solved":false} reads as an EMPTY answer', { emptyReply: r.emptyReply })
    ok(r.replyBytes === byteLen(replyText), '§3b replyBytes is present (the text did exist, it just carried nothing)', { replyBytes: r.replyBytes })
    ok(String(r.emptyReplyMeans || '').includes('emptyReply'), '§3c the definition travels with the field')
    const ledger = empty.k.turn.status({ roster: ['m-1'] })
    const turnId = r.turn && typeof r.turn === 'object' ? String(r.turn.id) : String(r.turn)
    const row = (ledger.turnReceipts || []).find((x) => String(x.turn) === turnId)
    ok(row && row.emptyReply === true && Number.isFinite(row.replyBytes),
      '§3d the settled ledger row carries the same two readings', row && { emptyReply: row.emptyReply, replyBytes: row.replyBytes })
    ok(row && row.status === 'applied', '§3e the turn still reads applied (emptyReply names WHAT was applied)', row && row.status)

    const content = await bootKernel({
      deliverTurn: async () => ({ reply: fence({ progress: '完成了第 3 节的复核：结论成立。' }), deliveryPath: 'fake-delegated' }),
    })
    const r2 = await content.k.turn.run({ member: 'm-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'run249 content' })
    ok(r2.emptyReply === false, '§3f a reply with content reads as NOT empty', { emptyReply: r2.emptyReply })
    ok(r2.replyBytes > 0, '§3g replyBytes is set for a content reply too', r2.replyBytes)
  }

  // ── §4 F-11 4b PREFLIGHT: HEADER EXACTLY WHEN UNREAD ROWS EXIST ───────────────────────────────────────────
  section('§4 preflight: the notice header appears exactly when unread rows exist (three seats)')
  {
    const seats = [{ id: 'c-1', role: 'chair', roleLabel: '主席' }, { id: 'm-1', role: 'member', roleLabel: '院士' }, { id: 't-1', role: 'temp', roleLabel: '临时席位' }]
    const { k } = await bootKernel()
    for (const s of seats) {
      await k.mailbox.send('office', { to: s.id, kind: 'meeting-appointment', channel: 'mail', subject: '会议预约：' + s.id, text: '席位 ' + s.id + ' 的预约。' })
    }
    const texts = []
    for (const s of seats) texts.push(await assemblyText(k, s.id))
    // non-vacuous precondition: the three seats above really produced three assemblies to scan. Without this line the
    // every()-assertions below would be TRUE on an empty collection (RULE E, task-221) — the assertions are unchanged.
    ok(texts.length === 3, '§4a0 three assemblies really exist to scan (non-vacuous precondition)', texts.length)
    const hits = texts.map((t) => (t.text.match(/\[新到的消息\]/g) || []).length)
    ok(hits.every((n) => n === 1), '§4a every seat renders the header EXACTLY once', hits)
    ok(texts.every((t, i) => t.text.includes('会议预约：' + seats[i].id)), '§4b each seat sees ITS OWN line (by subject)')
    // same non-vacuity precondition, restated where the window sees it (RULE E wants it NEXT TO the assertion)
    ok(texts.length === 3, '§4c0 three assemblies still on the table before the receipt checks (non-vacuous precondition)', texts.length)
    ok(texts.every((t) => t.notices && t.notices.rendered === true), '§4c every seat receipt says rendered:true')

    const listed = await k.mailbox.list('c-1', { status: 'unread' })
    await k.mailbox.ack('c-1', listed.entries.map((e) => e.id))
    // the shared-queue write-through is coalesced: wait for the settle instead of racing the next pull (task-65 lesson)
    const settled = await waitFor(async () => {
      const lines = await k.mailbox.noticeLines('c-1', { limit: 8 })
      return (lines.lines || []).length === 0
    })
    ok(settled, '§4d0 the ack settled in the shared queue before the next assembly')
    const after = await assemblyText(k, 'c-1')
    ok((after.text.match(/\[新到的消息\]/g) || []).length === 0,
      '§4d after ack the header is GONE for that seat (a settled row is not a reminder)', after.notices)
    ok(after.notices && after.notices.lines === 0, '§4e and the receipt says zero lines drained', after.notices)

    // a pack block still wins where a pack is loaded
    const { k: packK } = await bootEntry()
    await packK.mailbox.send('office', { to: 'r-p1', kind: 'meeting-appointment', channel: 'mail', subject: '会议预约：pack 验收', text: 'pack 席位。' })
    const packMade = await assemblyText(packK, 'r-p1')
    ok(packMade.text.includes(HEADER), '§4f the pack notice block still renders (kernel default does not replace it)')
  }
} catch (e) {
  failed++
  failures.push('UNCAUGHT ' + String((e && e.stack) || e))
  console.error('  FAIL UNCAUGHT ' + String((e && e.stack) || e))
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch (e) { /* best effort */ } }
}

console.log('\n=== RUN-249 NOTICE AND REPLY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error(failures.join(NL)); process.exit(1) }
