// tests/vmu-run250-turn-receipt-evidence.test.mjs — RUN 250 / task-76.
//
// THE 70TH LIVE RUN (build 0a9e9783) MEASURED A DISCONNECT BETWEEN TWO TRUE FACTS:
//   · the `[新到的消息]` block really reached member prompts (70 occurrences in the workspace), and
//     `Members/r-acad/Turns/t-1.md` / `Members/r-1/Turns/t-6.md` really landed on disk;
//   · `vibe_vmu_turn {op:"status"}` turnReceipts rows carried NEITHER `notices:{lines,rendered,blockChars}` NOR
//     `replyFullPath` / `replyFullSha256` / `replyFullBytes` — 0 hits in the whole session, so acceptance had to scan
//     the workspace by hand to learn what the ledger could have said.
//
// RUN 249 built the facts (the block, the archive, the byte counts). task-76 is only the TRANSMISSION: `assemble()` had
// already counted the block, runFrom had already measured the cut and written the archive, and now the ledger copies
// those SAME readings onto the turn row — with `null` as a NAMED meaning ("this loop has no reading for it"), never
// `undefined`, which a reader cannot tell from "the value got lost".
//
// §0 the row template has the evidence slots and the patch copies them (a named shape, not an accident)
// §1 no unread row ⇒ notices {lines:0, rendered:false, blockChars:0}, archive fields explicit nulls, no key undefined
// §2 unread row ⇒ lines>0/rendered:true/blockChars>0, and blockChars EQUALS the block carved out of the prompt the seam saw
// §3 a reply over the limit ⇒ truncated:true, real on-disk bytes == replyFullBytes, sha256(full text) == replyFullSha256
// §4 THE OFFICE FACE (this run's defect): `vibe_vmu_turn {op:"status"}` rows carry every field, checked against the file
// §5 a loop with NO archive seam ⇒ the row says by name why there is no copy (and the fields stay explicit nulls)
//
// Run: node tests/vmu-run250-turn-receipt-evidence.test.mjs   Last line: N passed, M failed

import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const TURN_TOOL = join(REPO, 'vibe-math-vmu', 'tools', 'turn.js')

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
const turnTool = await import(pathToFileURL(TURN_TOOL).href)
const kernelSource = await readFile(KERNEL, 'utf8')
const turnSource = await readFile(TURN, 'utf8')

const HEADER = '[新到的消息]'
const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const byteLen = (s) => Buffer.byteLength(String(s || ''), 'utf8')
const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r250-')); roots.push(d); return d }
const bootKernel = async (extra = {}) => {
  const root = await mkRoot()
  const k = km.createKernel(Object.assign({ root, clock: () => 1000, settings: {} }, extra))
  await k.store.open()
  return { k, root }
}
// a runnable member turn, with the ONE thing a test can measure independently of the receipt: the exact prompt text the
// delivery seam received (that is where the notice block lived, so the block size is measured off the wire, not copied
// from the field under test).
const bootCapturing = async (replyText, extra = {}) => {
  const seen = { text: null }
  const booted = await bootKernel(Object.assign({
    // the loop hands the seam ONE payload `{ turn, text }`; the text is where the notice block lived, so it is the
    // independent source the row is checked against.
    deliverTurn: async (payload) => {
      seen.text = payload && typeof payload.text === 'string' ? payload.text : ''
      return { reply: replyText, deliveryPath: 'fake-delegated' }
    },
  }, extra))
  return Object.assign({ seen }, booted)
}
const runTurn = (k, why) => k.turn.run({ member: 'm-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why })
const turnIdOf = (r) => (r && r.turn && typeof r.turn === 'object' ? String(r.turn.id) : String(r && r.turn))
const rowOf = (k, turnId) => (k.turn.status({ roster: ['m-1'] }).turnReceipts || []).find((x) => String(x.turn) === String(turnId)) || null
const EVIDENCE_KEYS = ['notices', 'truncated', 'excerptLen', 'replyBytes', 'emptyReply', 'replyFullPath', 'replyFullSha256', 'replyFullBytes', 'replyArchiveWhy']

try {
  // ── §0 NAMED SHAPES ────────────────────────────────────────────────────────────────────────────────────────
  section('§0 the evidence slots and their transmission are named shapes in the source')
  {
    ok(turnSource.includes('notices: null, truncated: null, excerptLen: null, emptyReply: null,'),
      '§0a the turn row template declares the evidence slots from OPEN time')
    ok(turnSource.includes('replyFullPath: null, replyFullSha256: null, replyFullBytes: null, replyArchiveWhy: null,'),
      '§0b and the three archive fields plus their why-slot are explicit nulls, never undefined')
    ok(turnSource.includes('next.notices = {') && turnSource.includes('patch.replyArchiveWhy'),
      '§0c noteTurnReceipt copies notices and the archive readings onto the row')
    ok(turnSource.includes('const evidence = {') && turnSource.includes('notices: asm.notices || null'),
      '§0d the evidence object is read from the SAME assemble readings the receipt uses')
    ok(turnSource.includes('Object.assign({ emptyReply, replyBytes }, evidence)'),
      '§0e the settled row patch carries the run-level evidence')
    ok(turnSource.includes('noteTurnReceipt(turn, { notices: asm.notices })'),
      '§0f a caller-played (awaiting) turn records the block it really carried')
    ok(turnSource.includes('RUN 250') && turnSource.includes('replyArchiveWhy'),
      '§0g turnReceiptsMeans documents the new fields and what null means')
    ok(kernelSource.includes('writeTurnArchive') && kernelSource.includes('turnArchiveSegment'),
      '§0h (unchanged from RUN 249) the archive seam is still the kernel’s, not the loop’s')
  }

  // ── §1 NO UNREAD ROW: ZERO IS A READING ──────────────────────────────────────────────────────────────────
  section('§1 a turn with no unread mail carries notices {0, false, 0} and explicit nulls for the archive')
  {
    const replyText = fence({ progress: '§1 完成：无未读信件的回合。' })
    const { k, seen, root } = await bootCapturing(replyText)
    const r = await runTurn(k, 'run250 no unread')
    const turnId = turnIdOf(r)
    const row = rowOf(k, turnId)
    ok(!!row, '§1a the ledger row exists for the settled turn', turnId)
    ok(seen.text.indexOf(HEADER) === -1, '§1b the prompt the seam received really had NO notice header')
    ok(row && row.notices && row.notices.lines === 0 && row.notices.rendered === false && row.notices.blockChars === 0,
      '§1c the row says zero lines, nothing rendered, zero characters — the absence is a reading', row && row.notices)
    ok(row && row.truncated === false && row.excerptLen === replyText.length && row.replyBytes === byteLen(replyText),
      '§1d a complete reply reads truncated:false with excerptLen == the text it quoted', row && { truncated: row.truncated, excerptLen: row.excerptLen, replyBytes: row.replyBytes })
    ok(row && row.emptyReply === false, '§1e emptyReply is false for a content reply', row && row.emptyReply)
    ok(row && row.replyFullPath === null && row.replyFullSha256 === null && row.replyFullBytes === null,
      '§1f nothing was cut, so the archive fields are explicit nulls (not a phantom path)', row && { p: row.replyFullPath, s: row.replyFullSha256, b: row.replyFullBytes })
    ok(row && row.replyArchiveWhy === null, '§1g replyArchiveWhy null means there is nothing to warn about', row && row.replyArchiveWhy)
    const missing = EVIDENCE_KEYS.filter((key) => !row || !Object.prototype.hasOwnProperty.call(row, key) || row[key] === undefined)
    ok(missing.length === 0, '§1h none of the nine evidence keys is missing or undefined', missing)
    ok(row && r.assembled && r.assembled.notices && row.notices.blockChars === r.assembled.notices.blockChars && row.notices.lines === r.assembled.notices.lines,
      '§1i the row and the run receipt name the same (empty) block')
    void root
  }

  // ── §2 UNREAD ROW: THE BLOCK SIZE IS MEASURED OFF THE WIRE ──────────────────────────────────────────────
  section('§2 a turn with an unread row records the block, and blockChars equals the block the seam really received')
  {
    const replyText = fence({ progress: '§2 完成：先读预约再工作。' })
    const { k, seen } = await bootCapturing(replyText)
    await k.mailbox.send('office', { to: 'm-1', kind: 'meeting-appointment', channel: 'mail', subject: '会议预约：RUN250 探针会', text: '本会由 office 预约。' })
    const r = await runTurn(k, 'run250 unread')
    const row = rowOf(k, turnIdOf(r))
    ok(seen.text.startsWith(HEADER), '§2a the prompt really STARTS with the notice block', seen.text.slice(0, 40))
    ok(seen.text.includes('会议预约：RUN250 探针会'), '§2b the member own row reached the prompt (by subject)')
    // the boundary between the notice block (which always ends with its newline) and the pipeline text is a blank line.
    const boundary = seen.text.indexOf(NL + NL)
    const blockOnTheWire = boundary > 0 ? seen.text.slice(0, boundary) : ''
    const expectedBlockChars = blockOnTheWire.length + 1
    ok(boundary > 0 && blockOnTheWire.startsWith(HEADER),
      '§2c the block boundary is findable in the prompt the seam saw', { boundary, head: blockOnTheWire.slice(0, 24) })
    ok(row && row.notices && row.notices.lines === 1 && row.notices.rendered === true,
      '§2d the row says one line was drained and the block rendered', row && row.notices)
    ok(row && row.notices.blockChars === expectedBlockChars,
      '§2e blockChars EQUALS the block carved out of the prompt (measured off the wire, not copied from itself)',
      row && { fromRow: row.notices.blockChars, fromWire: expectedBlockChars })
    ok(row && row.notices.blockChars > 0 && row.notices.blockChars < seen.text.length,
      '§2f the block is a real slice of the prompt, not the whole prompt', row && row.notices.blockChars)
    ok(row && row.replyBytes === byteLen(replyText) && row.emptyReply === false,
      '§2g the reply readings are on the same row as the block reading', row && { bytes: row.replyBytes, empty: row.emptyReply })
  }

  // ── §3 OVER THE LIMIT: THE CUT POINTS AT A REAL FILE ────────────────────────────────────────────────────
  section('§3 a reply over the limit records truncated:true and an archive whose bytes/sha are checked against disk')
  {
    const fullReply = fence({ progress: '长'.repeat(2600) })
    ok(fullReply.length > 2000, '§3a the probe reply really exceeds the default bound of 2000', fullReply.length)
    const { k, root } = await bootCapturing(fullReply)
    const r = await runTurn(k, 'run250 truncated')
    const turnId = turnIdOf(r)
    const row = rowOf(k, turnId)
    ok(row && row.truncated === true, '§3b the row says the receipt was cut', row && row.truncated)
    ok(row && row.excerptLen === 2000, '§3c excerptLen is the cut the receipt shows (2000, the default — not raised)', row && row.excerptLen)
    ok(row && row.replyBytes === byteLen(fullReply), '§3d replyBytes is the FULL reply, not the excerpt', row && { replyBytes: row.replyBytes, full: byteLen(fullReply) })
    ok(row && typeof row.replyFullPath === 'string' && /^Members\/m-1\/Turns\/[^/]+\.md$/.test(row.replyFullPath),
      '§3e replyFullPath is the member-own archive file', row && row.replyFullPath)
    const onDisk = row && row.replyFullPath ? await readFile(join(root, row.replyFullPath), 'utf8') : ''
    ok(onDisk.endsWith(fullReply), '§3f the file on disk really holds the FULL reply (the cut part is retrievable)')
    const header = onDisk.slice(0, onDisk.length - fullReply.length)
    ok(row && byteLen(header) > 0 && row.replyFullBytes === byteLen(fullReply) && byteLen(header) + byteLen(fullReply) === byteLen(onDisk),
      '§3g replyFullBytes == the reply text bytes on disk, while the file also carries the (non-counted) header',
      row && { fromRow: row.replyFullBytes, reply: byteLen(fullReply), file: byteLen(onDisk) })
    ok(row && row.replyFullSha256 === sha256(fullReply), '§3h replyFullSha256 == sha256(full text), verifiable from the file alone')
    ok(row && row.replyArchiveWhy === null, '§3i with a successful archive there is no warning (null by name)', row && row.replyArchiveWhy)
    ok(r.replyFullBytes === row.replyFullBytes && r.replyFullSha256 === row.replyFullSha256,
      '§3j the run receipt and the ledger row name the same archive')
  }

  // ── §4 THE OFFICE FACE: THE 70TH RUN DEFECT ─────────────────────────────────────────────────────────────
  section('§4 vibe_vmu_turn {op:"status"} — the office face — carries every evidence field')
  {
    const fullReply = fence({ progress: '办'.repeat(2200) })
    const { k, seen, root } = await bootCapturing(fullReply)
    await k.mailbox.send('office', { to: 'm-1', kind: 'meeting-appointment', channel: 'mail', subject: '会议预约：OFFICE 探针会', text: 'office 面取证。' })
    const r = await runTurn(k, 'run250 office')
    const turnId = turnIdOf(r)
    // the REAL spec the host registers (built through the same factory, with the same param/refused helpers host.js uses)
    const spec = turnTool.makeTurnSpec({
      param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
      refused: (code, message, hint) => ({ ok: false, code, message, hint: hint || null }),
      TOOL_NAMES: { turn: 'vibe_vmu_turn' },
      kernel: k,
    })
    ok(spec && spec.name === 'vibe_vmu_turn', '§4a the probe uses the real office tool spec', spec && spec.name)
    const out = JSON.parse(await spec.execute({ op: 'status' }, {}))
    const officeRow = (out.turns || []).find((x) => String(x.turn) === String(turnId)) || null
    ok(!!officeRow, '§4b the office face carries a row for the turn', turnId)
    const missing = EVIDENCE_KEYS.filter((key) => !officeRow || !Object.prototype.hasOwnProperty.call(officeRow, key) || officeRow[key] === undefined)
    ok(missing.length === 0, '§4c ALL nine evidence fields reach the office face (the 70th run had zero of them)', missing)
    ok(officeRow && officeRow.notices && officeRow.notices.rendered === true && officeRow.notices.lines === 1,
      '§4d the office can see that the delivery block rendered for this turn', officeRow && officeRow.notices)
    const boundary = seen.text.indexOf(NL + NL)
    ok(officeRow && boundary > 0 && officeRow.notices.blockChars === boundary + 1,
      '§4e and its size equals the block in the prompt the seam saw', officeRow && { fromRow: officeRow.notices.blockChars, fromWire: boundary + 1 })
    ok(officeRow && officeRow.truncated === true && officeRow.excerptLen === 2000,
      '§4f the office can see the receipt was cut, and at what bound', officeRow && { t: officeRow.truncated, e: officeRow.excerptLen })
    const onDisk = officeRow && officeRow.replyFullPath ? await readFile(join(root, officeRow.replyFullPath), 'utf8') : ''
    ok(onDisk.endsWith(fullReply), '§4g the path the office reads is a real file with the full reply')
    ok(officeRow && officeRow.replyFullBytes === byteLen(fullReply) && officeRow.replyFullSha256 === sha256(fullReply),
      '§4h replyFullBytes/replyFullSha256 from the office face match the disk (same-source, not self-referential)',
      officeRow && { bytes: officeRow.replyFullBytes, sha: String(officeRow.replyFullSha256).slice(0, 12) })
    ok(typeof (out.turnsMeans || '') === 'string' && String(out.turns || '').length !== 0,
      '§4i the office reading is the real projection, not a hand-made shape')
  }

  // ── §5 NO ARCHIVE SEAM: AN EXPLICIT NULL WITH A NAME ────────────────────────────────────────────────────
  section('§5 a loop with no archive seam records explicit nulls and names why there is no copy')
  {
    const fullReply = fence({ progress: '不'.repeat(2600) })
    const gov = kernelTurn.createTurnOrchestrator({
      sectionPolicy: () => ({ sections: [] }),
      prompt: { assemble: async () => ({ ok: true, text: 'PROBE', sources: [] }), assembleFor: async () => ({ ok: true, text: 'PROBE' }) },
      faces: kernelTurn.facesFrom({ records: { put: async () => ({ ok: true, recordId: 'rec-1' }), list: async () => ({ ok: true, rows: [] }) } }),
      settings: {},
      clock: () => '2026-01-01T00:00:00.000Z',
      deliver: async () => ({ reply: fullReply, deliveryPath: 'fake-delegated' }),
    })
    const bare = await gov.run({ member: 'm-9', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why: 'run250 no seam' })
    ok(bare && bare.ok === true && bare.replyTruncated === true, '§5a the bare loop still runs and its receipt is cut', bare && { ok: bare.ok, t: bare.replyTruncated })
    const bareRow = (gov.status().turnReceipts || []).find((x) => String(x.turn) === turnIdOf(bare)) || null
    ok(!!bareRow, '§5b the bare loop keeps a ledger row too')
    ok(bareRow && bareRow.replyFullPath === null && bareRow.replyFullSha256 === null && bareRow.replyFullBytes === null,
      '§5c with no seam the archive fields are NULL (explicit), never undefined', bareRow && { p: bareRow.replyFullPath, s: bareRow.replyFullSha256, b: bareRow.replyFullBytes })
    ok(bareRow && typeof bareRow.replyArchiveWhy === 'string' && bareRow.replyArchiveWhy.includes('no writeTurnArchive seam'),
      '§5d and the row says BY NAME why no full-text copy exists', bareRow && bareRow.replyArchiveWhy)
    ok(bareRow && bareRow.truncated === true && bareRow.excerptLen === 2000 && bareRow.replyBytes === byteLen(fullReply),
      '§5e the cut is still readable from the row', bareRow && { t: bareRow.truncated, e: bareRow.excerptLen })
  }
} catch (e) {
  failed++
  failures.push('UNCAUGHT ' + String((e && e.stack) || e))
  console.error('  FAIL UNCAUGHT ' + String((e && e.stack) || e))
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch (e) { /* best effort */ } }
}

console.log('\n=== RUN-250 TURN RECEIPT EVIDENCE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error(failures.join(NL)); process.exit(1) }
