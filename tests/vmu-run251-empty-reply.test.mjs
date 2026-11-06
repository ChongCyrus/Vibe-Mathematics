// tests/vmu-run251-empty-reply.test.mjs — RUN 251 / task-77.
//
// THE 71ST LIVE RUN (build 0a9e9783, which did NOT include RUN 250) MEASURED TWO "THE RECEIPT SAID SOMETHING UNTRUE" BUGS:
//   · F71-2: r-1 wrote 16,685 characters / 30,195 bytes and the receipt said `emptyReply:true`. The answer was prose, so
//     `parsed.reply` was null, and the old predicate (an object whose every non-binding value is a no-op) called that
//     "empty". The office therefore could not tell a silent member from one that spoke at length without a structured
//     outcome — the confusion F-01 existed to remove.
//   · F71-1: run-lane looked for `replyTruncated` / `replyExcerpt` on the turnReceipts row; RUN 250 put the facts there
//     under `truncated` / `excerptLen`. The right fix is ONE authoritative name plus a compatibility sentence — not two
//     synonyms on the same row.
//
// THE NEW RULE: `emptyReply` is about the member SPEAKING. True only when the reply TEXT is empty or whitespace-only.
// False for {"solved":false} and for prose that parsed to nothing. Whether the answer did anything is `fields` /
// `executed` / `writes`; whether it was cut is `truncated` + `excerptLen` (+ `replyFullPath` for the full text).
//
// §0 the rule and the naming decision are named shapes in the source (no synonyms, no stale helper)
// §1 a ≥9,000-char reply ⇒ truncated:true, excerptLen == replyLimitChars, full text on disk, emptyReply:false
// §2 empty / whitespace-only replies ⇒ emptyReply:true, truncated:false, replyBytes <= 2
// §3 the 71st-run shape (16,685-char prose, parsed to nothing) ⇒ emptyReply:false — THE bug this run fixes
// §4 the office face: all eight readings visible, and row vs row.notices placement is stated and true
// §5 the means strings carry the definition and the old-name mapping (readers of both generations can follow)
//
// Run: node tests/vmu-run251-empty-reply.test.mjs   Last line: N passed, M failed

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
const turnSource = await readFile(TURN, 'utf8')

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const byteLen = (s) => Buffer.byteLength(String(s || ''), 'utf8')
const sha256 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r251-')); roots.push(d); return d }
const bootKernel = async (extra = {}) => {
  const root = await mkRoot()
  const k = km.createKernel(Object.assign({ root, clock: () => 1000, settings: {} }, extra))
  await k.store.open()
  return { k, root }
}
const runTurn = (k, why) => k.turn.run({ member: 'm-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why })
// A SILENT TEXT IS STILL A SETTLED TURN ONLY WHEN THE TOOL CHANNEL CARRIED THE REPORT: a turn whose text channel holds
// nothing AND whose tool channel holds nothing is refused by name (VMU_TURN_NO_FENCE) before any receipt exists — so the
// silence case is built the way a real silent turn is built, with a parked report. The helper parks it mid-flight.
const bootSilent = async (replyText, report) => {
  const holder = {}
  const { k, root } = await bootKernel({
    deliverTurn: async ({ turn }) => {
      await holder.k.turn.supplyStructuredReply(report, { forMember: turn.member })
      return { reply: replyText, deliveryPath: 'fake-delegated' }
    },
  })
  holder.k = k
  return { k, root }
}
const turnIdOf = (r) => (r && r.turn && typeof r.turn === 'object' ? String(r.turn.id) : String(r && r.turn))
const rowOf = (k, turnId) => (k.turn.status({ roster: ['m-1'] }).turnReceipts || []).find((x) => String(x.turn) === String(turnId)) || null
const EVIDENCE_KEYS = ['notices', 'truncated', 'excerptLen', 'replyBytes', 'emptyReply', 'replyFullPath', 'replyFullSha256', 'replyFullBytes', 'replyArchiveWhy']

// the office projection the real host builds (tools/turn.js:240 passes the ledger rows through unchanged, so this is the
// production path, not a hand-made shape).
const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)
const refused = (code, message, hint, extra = null) => Object.assign({ ok: false, code, message, hint: hint || null }, extra || {})
const officeRow = async (k, turnId) => {
  const spec = turnTool.makeTurnSpec({ param, refused, TOOL_NAMES: { turn: 'vibe_vmu_turn' }, kernel: k })
  const out = JSON.parse(await spec.execute({ op: 'status' }, {}))
  const rows = Array.isArray(out.turns) ? out.turns : []
  return { out, row: rows.find((x) => String(x.turn) === String(turnId)) || null }
}

try {
  // ── §0 NAMED SHAPES ────────────────────────────────────────────────────────────────────────────────────────
  section('§0 the new rule and the naming decision are named shapes in the source')
  {
    ok(turnSource.includes('const replyTextIsEmpty = (text)'),
      '§0a the emptiness reading is over TEXT (a helper that takes text, not a parsed object)')
    ok(turnSource.includes('const emptyReply = replyTextIsEmpty(rawText)'),
      '§0b the settled turn reads emptyReply from rawText, the very text replyBytes measures')
    ok(turnSource.includes('RUN 251') && turnSource.includes('71st live run'),
      '§0c the rule is documented in place, with the live run it comes from')
    ok(!turnSource.includes('const replyIsEmpty = (reply)') && !turnSource.includes('REPLY_RESERVED_KEYS'),
      '§0d the old predicate (no applicable value = empty) is GONE, not merely bypassed')
    ok(turnSource.includes('replyFullPath: null, replyFullSha256: null, replyFullBytes: null, replyArchiveWhy: null,'),
      '§0e (unchanged from RUN 250) the row still has its explicit-null evidence slots')
    ok(!/replyTruncated: null/.test(turnSource) && !/replyExcerpt: null/.test(turnSource) &&
      !turnSource.includes('next.replyTruncated') && !turnSource.includes('next.replyExcerpt'),
      '§0f NO synonym row keys were added (truncated/excerptLen stay the only authority)')
    ok(turnSource.includes('`replyTruncated` and `replyExcerpt` are the turn RECEIPT') &&
      turnSource.includes('so `lines` is a key of `row.notices`, not of the row'),
      '§0g turnReceiptsMeans maps the old names to the row names and states the row/row.notices split')
  }

  // ── §1 A CUT REPLY IS NOT AN EMPTY REPLY ─────────────────────────────────────────────────────────────────
  section('§1 a ≥9,000-char reply: truncated:true, excerptLen == the bound, the full text really on disk, emptyReply:false')
  {
    const full = fence({ progress: '甲'.repeat(3000) })
    ok(byteLen(full) > 9000, '§1a the probe reply really exceeds 9,000 bytes', { len: full.length, bytes: byteLen(full) })
    const { k, root } = await bootKernel({ deliverTurn: async () => ({ reply: full, deliveryPath: 'fake-delegated' }) })
    const r = await runTurn(k, 'run251 cut')
    ok(r && r.ok === true, '§1b the turn settled', r && { ok: r.ok, code: r.code })
    ok(r.replyTruncated === true && r.replyLimitChars === 2000 && r.replyBytes === byteLen(full),
      '§1c the RECEIPT (old names) still says cut, at the default bound, with the full byte count',
      { truncated: r.replyTruncated, limit: r.replyLimitChars, bytes: r.replyBytes })
    ok(r.emptyReply === false, '§1d a long reply is NOT empty (RUN 251: empty means the text was empty)', { emptyReply: r.emptyReply })
    ok(String(r.emptyReplyMeans || '').includes('replyFullPath') && String(r.emptyReplyMeans || '').includes('truncated:true'),
      '§1e and its definition tells a reader that a cut answer is emptyReply:false + where the rest is')
    const row = rowOf(k, turnIdOf(r))
    ok(row && row.truncated === true && row.excerptLen === r.replyLimitChars && r.replyLimitChars === 2000,
      '§1f the ledger row names the cut with the authoritative names truncated/excerptLen (excerptLen == replyLimitChars)',
      row && { truncated: row.truncated, excerptLen: row.excerptLen, limit: r.replyLimitChars })
    ok(row && row.emptyReply === false && row.replyBytes === byteLen(full),
      '§1g the same row says it was not empty and how much text there was',
      row && { emptyReply: row.emptyReply, replyBytes: row.replyBytes })
    ok(row && typeof row.replyFullPath === 'string' && /^Members\/m-1\/Turns\/[^/]+\.md$/.test(row.replyFullPath),
      '§1h the row names the member-own archive file', row && row.replyFullPath)
    const disk = await readFile(join(root, row.replyFullPath), 'utf8')
    const header = disk.slice(0, disk.length - full.length)
    ok(disk.endsWith(full) && header.length > 0 && byteLen(disk) === byteLen(header) + byteLen(full),
      '§1i the file on disk really holds the FULL reply (header excluded from the count)')
    ok(row.replyFullBytes === byteLen(full) && row.replyFullSha256 === sha256(full),
      '§1j replyFullBytes/replyFullSha256 are the real file facts, measured against the text this test holds',
      { bytes: row.replyFullBytes, sha: String(row.replyFullSha256).slice(0, 12) })
    ok(row.excerptLen === String(r.replyExcerpt).length,
      '§1k excerptLen equals the excerpt the receipt prints (one cut, two faces)', { row: row.excerptLen, receipt: String(r.replyExcerpt).length })
  }

  // ── §2 SILENCE IS THE ONLY EMPTY REPLY ───────────────────────────────────────────────────────────────────
  section('§2 an empty or whitespace-only reply text: emptyReply:true, nothing cut, replyBytes <= 2')
  {
    // the silence arrives through the TEXT channel; the tool channel carries the report that lets the turn settle.
    // (two explicit probes, no loop over a collection: a loop whose list is empty would assert nothing and still pass)
    const silentProbe = async (name, replyText, expectedBytes) => {
      const { k } = await bootSilent(replyText, { progress: '工具通道：这一轮只有工具汇报，正文没有话' })
      const r = await runTurn(k, 'run251 silent ' + name)
      ok(r.ok === true && r.emptyReply === true, '§2a [' + name + '] reads as EMPTY', r && { emptyReply: r.emptyReply })
      ok(r.replyBytes === expectedBytes && r.replyBytes <= 2, '§2b [' + name + '] replyBytes is the real (tiny) size',
        { replyBytes: r.replyBytes, expected: expectedBytes })
      ok(r.replyTruncated === false && r.replyFullPath === undefined,
        '§2c [' + name + '] nothing was cut, so no archive is claimed', { truncated: r.replyTruncated })
      ok(r.source === 'tool' && Array.isArray(r.fields) && r.fields.includes('progress'),
        '§2d [' + name + '] the receipt still says the tool channel SPOKE (emptyReply is about the text only)',
        { source: r.source, fields: r.fields })
      const row = rowOf(k, turnIdOf(r))
      ok(row && row.emptyReply === true && row.truncated === false && row.replyBytes === expectedBytes,
        '§2e [' + name + '] the ledger row carries the silent reading too',
        row && { emptyReply: row.emptyReply, truncated: row.truncated, replyBytes: row.replyBytes })
    }
    await silentProbe('empty string', '', 0)
    await silentProbe('whitespace only', '  ', 2)
  }

  // ── §3 THE 71ST-RUN SHAPE: 16,685 CHARS OF PROSE THAT PARSED TO NOTHING ──────────────────────────────────
  section('§3 the 71st live run shape: 16,685 chars of prose around a no-op object is SPEECH, not an empty reply')
  {
    const head = '长'.repeat(8000)
    const obj = NL + JSON.stringify({ solved: false }) + NL
    const prose = head + obj + '长'.repeat(16685 - head.length - obj.length)
    ok(prose.length === 16685 && byteLen(prose) > 49000, '§3a the probe matches the live run in character count',
      { chars: prose.length, bytes: byteLen(prose) })
    const { k, root } = await bootKernel({ deliverTurn: async () => ({ reply: prose, deliveryPath: 'fake-delegated' }) })
    const r = await runTurn(k, 'run251 prose')
    ok(r && r.ok === true, '§3b a prose reply still settles (it is an answer, not silence)', r && { ok: r.ok, code: r.code })
    ok(r.emptyReply === false && r.replyBytes === byteLen(prose),
      '§3c THE FIX: emptyReply is FALSE for prose that parsed to nothing, and replyBytes is the real byte count',
      { emptyReply: r.emptyReply, replyBytes: r.replyBytes })
    ok(r.replyTruncated === true && r.replyLimitChars === 2000,
      '§3d and the receipt separately says the text was cut (the other half of the 71st-run confusion)')
    const row = rowOf(k, turnIdOf(r))
    ok(row && row.emptyReply === false && row.truncated === true && row.excerptLen === 2000,
      '§3e the ledger row separates "spoke" from "was cut" instead of collapsing both into empty',
      row && { emptyReply: row.emptyReply, truncated: row.truncated, excerptLen: row.excerptLen })
    const disk = await readFile(join(root, row.replyFullPath), 'utf8')
    ok(disk.endsWith(prose) && row.replyFullBytes === byteLen(prose),
      '§3f the full prose is on disk and the row byte count is measured from the real file')
  }

  // ── §4 THE OFFICE FACE: ALL EIGHT READINGS, AND WHERE THEY LIVE ──────────────────────────────────────────
  section('§4 vibe_vmu_turn {op:"status"}: the row carries all readings and nests the block reading under notices')
  {
    const full = fence({ progress: '乙'.repeat(3000) })
    const { k } = await bootKernel({ deliverTurn: async () => ({ reply: full, deliveryPath: 'fake-delegated' }) })
    await k.mailbox.send('office', { to: 'm-1', kind: 'meeting-appointment', channel: 'mail', subject: '预约：RUN251', text: '请赴会。' })
    const r = await runTurn(k, 'run251 office')
    const { out, row } = await officeRow(k, turnIdOf(r))
    ok(out && out.ok === true && out.turnsMeans && String(out.turnsMeans).includes('HOST BOOKKEEPING'),
      '§4a the office projection is the real spec and says the list is host bookkeeping', out && String(out.turnsMeans).slice(0, 60))
    ok(String((out.status && out.status.turnReceiptsMeans) || '').includes('RUN 250'),
      '§4a2 and the ledger means it prints names the RUN 250 evidence block')
    ok(row !== null, '§4b the office face carries a row for the settled turn')
    const missing = EVIDENCE_KEYS.filter((key) => !row || !Object.prototype.hasOwnProperty.call(row, key) || row[key] === undefined)
    ok(missing.length === 0, '§4c every evidence key reaches the office face (none is undefined)', missing)
    ok(row && row.notices && typeof row.notices === 'object' && JSON.stringify(Object.keys(row.notices).sort()) === '["blockChars","lines","rendered"]',
      '§4d the block reading is the NESTED object notices {lines, rendered, blockChars}', row && row.notices)
    ok(row && row.notices.lines === 1 && row.notices.rendered === true && row.notices.blockChars > 0,
      '§4e the office can see that one delivery line rendered, and its size', row && row.notices)
    ok(row && !Object.prototype.hasOwnProperty.call(row, 'lines') && !Object.prototype.hasOwnProperty.call(row, 'rendered'),
      '§4f placement is real: lines/rendered are NOT row-level keys (they live under row.notices)')
    ok(row && row.truncated === true && row.excerptLen === 2000 && row.emptyReply === false && row.replyBytes === byteLen(full),
      '§4g the cut/spoken readings are row-level keys with the authoritative names',
      row && { truncated: row.truncated, excerptLen: row.excerptLen, emptyReply: row.emptyReply, replyBytes: row.replyBytes })
    ok(row && row.replyFullPath === row.replyFullPath && String(row.replyFullPath).startsWith('Members/m-1/Turns/') &&
      row.replyFullBytes === byteLen(full) && row.replyFullSha256 === sha256(full),
      '§4h the archive reading the office sees is the disk truth, not a copy of itself')
    ok(row && !Object.prototype.hasOwnProperty.call(row, 'replyTruncated') && !Object.prototype.hasOwnProperty.call(row, 'replyExcerpt'),
      '§4i and the old names are NOT duplicated on the row (one authority, compatibility in the means)')
    const rowMeans = String((out.status && out.status.turnReceiptsMeans) || '')
    ok(rowMeans.includes('replyTruncated') && rowMeans.includes('replyExcerpt') &&
      rowMeans.includes('row.notices'),
      '§4j the means the office prints maps old name -> row name and says which keys are nested', rowMeans.length)
  }

  // ── §5 THE WORDS A CONSUMER READS ────────────────────────────────────────────────────────────────────────
  section('§5 the two means strings explain the new semantics (a reader of either generation can follow)')
  {
    const { k } = await bootSilent('', { progress: '工具通道：这一轮只有工具汇报' })
    const r = await runTurn(k, 'run251 means')
    const means = String(r.emptyReplyMeans || '')
    ok(means.includes('reply TEXT') && means.includes('not the parsed fields'),
      '§5a emptyReplyMeans says the reading is about the reply TEXT, not about parsed fields', means.slice(0, 80))
    ok(means.includes('whitespace-only') && means.includes('replyFullPath'),
      '§5b it names both edges: whitespace-only is empty; a cut answer points at the full text')
    ok(means.includes('replyBytes says how much text carried it') && means.includes('fields/executed/writes'),
      '§5c and it tells a reader where the "did it do anything" question is answered instead')
    ok(means.includes('tool channel is reported separately'),
      '§5d and it names the tool channel as the separate channel, so emptyReply:true + fields is not a self-contradiction')
  }
} finally {
  for (const d of roots) { try { await rm(d, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('\n=== RUN-251 EMPTY REPLY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
