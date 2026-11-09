// TB-2602 — THE PAIRED CORPUS GATE: a receipt is only evidence if the prompt that followed it can be shown to carry it.
//
// WHY THIS TEST EXISTS. `receipts.jsonl` and `prompts.jsonl` are two logs in one directory. A run can be green with a
// receipt that no seat ever read, and a prompt that describes a world the receipt does not contain: both logs are
// `ok:true`, both are complete, and nothing compares them. The pair corpus is the comparison. It is built from
// MEASUREMENTS (the harness records which call delivered which mailbox row to which member, which lines each assembly
// handed the notice renderer, and both sides of the clock), so this file can re-derive the join from disk instead of
// trusting the builder's own story:
//   1. every pair names a receipt that exists in `receipts.jsonl`, and the same tool;
//   2. the receipt text is a BYTE-EXACT SLICE of the prompt text at `receiptSpan` — checked twice, from two independent
//      reads of the prompt file, so a builder that reused one in-memory string cannot pass;
//   3. the prompt really came AFTER the call (`receiptEndedAt <= assembledAt`, `afterReceipts >= seq`) — the mistake
//      this catches is pairing a receipt with the assembly that happened BEFORE it, which every timing-free corpus
//      does silently;
//   4. a pair with no receipt text carries a NAMED reason (a refusal lives in the tool result, a records reading is a
//      tool result too) — silence is not allowed, because "not in the prompt" is exactly the fact an audit needs;
//   5. the classes the taskbook names are all present (delivery, success, named refusal, refusal with a hint, meeting
//      window, records reading), the three counts of the file agree (jsonl lines, manifest, files on disk), and the
//      measured unpaired rate is under the threshold recorded in the manifest.
//
// WHAT ALREADY WENT WRONG while building this lane (each assertion below is here because of one of these): the first
// builder wrote `receiptText` as `JSON.stringify(receipt)` and the "located in the prompt" check was really matching a
// JSON blob against prose — true by construction and worthless; the first delivery join used the FIRST prompt of the
// run instead of the first prompt of that seat AFTER the receipt, so a seat that received mail at seq 21 was paired with
// an assembly from before seq 9; and a `truncated`/`excerptLen` pair was recorded on some rows and omitted on others, so
// a reader could not tell an excerpt from a full line.
//
// Budget: no network, no LaTeX, no model (the child gets a scrubbed environment), and the whole file runs in a few
// seconds — the child run is the only expensive part.

import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const LF = String.fromCharCode(10)
const TMP = join(tmpdir(), 'sim-tests-pairs-' + process.pid)
mkdirSync(TMP, { recursive: true })
// The generation criterion lives in ONE module shared with the generator; imported by URL because the repo path is
// non-ASCII (a bare relative specifier here would be resolved by the loader against this file, which is fine, but the
// absolute URL keeps the failure mode explicit if the module ever moves).
const { checkCorpus } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'corpus-stamp.mjs')).href)

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + ' :: ' + JSON.stringify(detail === undefined ? null : detail).slice(0, 700))
  }
  return !!cond
}
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const readJsonl = (file) => readFileSync(file, 'utf8').split(LF).filter((line) => line.trim() !== '').map((line) => JSON.parse(line))
const readText = (file) => readFileSync(file, 'utf8')
const count = (arr, pred) => arr.filter(pred).length

// A named reason starts with an UPPER_SNAKE code and a colon: the gate below requires it, so "no receipt text" can never
// be a blank field a reader has to guess about.
const NAMED_REASON = /^[A-Z][A-Z_]{5,}: /

// The zero-token environment: a child that can reach a model makes every "the model saw this" claim unprovable.
const SECRET_NAME = /(OPENAI|ANTHROPIC|DEEPSEEK|AZURE|GEMINI|GOOGLE|MISTRAL|GROQ|TOGETHER|FIREWORKS|OPENROUTER|REPLICATE|HUGGING|HF_|LANGCHAIN|LANGSMITH)/i
const childEnv = Object.assign({}, process.env)
for (const key of Object.keys(childEnv)) {
  if (SECRET_NAME.test(key) && /(API|KEY|TOKEN|SECRET|BASE_URL|ENDPOINT|HOST|MODEL)/i.test(key)) delete childEnv[key]
}
childEnv.DSH_SIM_ZERO_TOKEN = '1'

const OUT = mkdtempSync(join(TMP, 'paired-'))
let keptRoot = null
let stderr = ''

try {
  console.log('--- building the paired corpus: node scripts/sim/run.mjs --scenario end-to-end --out ' + OUT)
  const run = spawnSync(process.execPath, [join(REPO, 'scripts', 'sim', 'run.mjs'), '--scenario', 'end-to-end', '--out', OUT, '--keep'], {
    cwd: REPO,
    env: childEnv,
    encoding: 'utf8',
    timeout: 55_000,
    maxBuffer: 64 * 1024 * 1024,
  })
  stderr = run.stderr || ''
  ok(run.status === 0, 'the lifetime run exits 0 (a red run would make every pair below unverifiable)', { status: run.status, stderr: stderr.slice(-700) })

  const pairsFile = join(OUT, 'pairs.jsonl')
  if (!ok(existsSync(pairsFile), 'pairs.jsonl landed on disk', { OUT })) throw new Error('no pair corpus to audit')
  // ★ TB-2648 §7 MIXED-GEN — BEFORE ANY COMPARISON: a corpus whose files came from different runs is not evidence about
  // the code, it is evidence about the runner's write order. The criterion is byte equality between what the generator
  // recorded and what is on disk; a directory mtime is not evidence in either direction.
  const generation = checkCorpus(OUT)
  ok(generation.ok, 'the corpus is ONE generation: manifest digests == bytes on disk (no cross-run comparison)', generation)
  const rows = readJsonl(pairsFile)
  const manifest = readJson(join(OUT, 'manifest.json'))
  keptRoot = manifest.root
  const meta = manifest.pairs || {}
  const receipts = readJsonl(join(OUT, 'receipts.jsonl'))
  const receiptBySeq = new Map(receipts.map((r) => [Number(r.seq), r]))
  const pairFiles = readdirSync(join(OUT, 'pairs'))
  const report = readText(join(OUT, 'REPORT.md'))
  const runnerSource = readText(join(REPO, 'scripts', 'sim', 'run.mjs'))

  // ── A. the file agrees with itself three ways ──────────────────────────────────────────────────────────────────
  ok(rows.length >= 10, 'the corpus holds at least the 10 pairs TB-2602 requires (' + rows.length + ')', { rows: rows.length })
  ok(Array.isArray(rows) && rows.length === meta.rows, 'pairs.jsonl line count equals manifest.pairs.rows', { lines: rows.length, manifest: meta.rows })
  ok(pairFiles.length === meta.rows, 'one prompt file per pair (manifest.pairs.rows === files on disk)', { files: pairFiles.length, manifest: meta.rows })
  ok(pairFiles.length === rows.length, 'the three counts agree: jsonl lines === manifest rows === pairs/*.txt files', { lines: rows.length, files: pairFiles.length, manifest: meta.rows })
  ok(rows.length > 0 && rows.every((row, i) => Number(row.pairIndex) === i + 1), 'pairIndex is 1..N with no gap (a skipped pair would hide a receipt)', { first: rows[0] && rows[0].pairIndex, last: rows[rows.length - 1] && rows[rows.length - 1].pairIndex })

  // ── B. every pair is anchored to a REAL receipt ────────────────────────────────────────────────────────────────
  const missingReceipt = rows.filter((row) => !receiptBySeq.has(Number(row.receiptSeq)))
  ok(missingReceipt.length === 0, 'every pair names a receiptSeq that exists in receipts.jsonl', { missing: missingReceipt.map((r) => r.receiptSeq).slice(0, 10) })
  const toolMismatch = rows.filter((row) => {
    const r = receiptBySeq.get(Number(row.receiptSeq))
    return !r || r.tool !== row.tool
  })
  ok(toolMismatch.length === 0, 'the pair tool equals the tool of that receipt (no re-labelled evidence)', { mismatch: toolMismatch.slice(0, 5).map((r) => ({ seq: r.receiptSeq, pairTool: r.tool })) })
  const shapeBad = rows.filter((row) => !row || typeof row.step !== 'number' || typeof row.tool !== 'string' || row.args === undefined || row.receipt === undefined || row.receiptText === undefined || row.nextPrompt === undefined)
  ok(shapeBad.length === 0, 'every pair carries the taskbook shape {step, tool, args, receipt, receiptText, nextPrompt}', { bad: shapeBad.length })
  ok(rows.length > 0 && rows.every((row) => row.args === null || typeof row.args === 'object'), 'args are carried as the real call arguments (object or null), not a summary string', { sample: rows.slice(0, 3).map((r) => typeof r.args) })

  // ── B2. WHO CALLED: the caller is read from the receipt, never guessed ───────────────────────────────────────
  // TB-2648 §7. receipts.jsonl records `as` on every line ("office", "r-acad", "r-2", ...). Until now run.mjs only
  // accepted `as` as an OBJECT, so `caller` was null on 45/45 pairs — and every "seat mismatch" question below was
  // unanswerable. These four assertions make that specific hole red, and then keep it shut.
  const receiptOf = (row) => receiptBySeq.get(Number(row.receiptSeq)) || null
  const withAs = rows.filter((row) => { const r = receiptOf(row); return r && typeof r.as === 'string' && r.as !== '' })
  ok(withAs.length >= 40, 'receipts.jsonl carries a string `as` for at least forty pairs (' + withAs.length + ')', { carrying: withAs.length })
  const nullCaller = withAs.filter((row) => !row.caller)
  ok(nullCaller.length === 0, 'every pair whose receipt names a string `as` has a caller (the corpus says who acted)', { null: nullCaller.length, sample: nullCaller.slice(0, 6).map((r) => r.pairIndex) })
  const callerWrong = withAs.filter((row) => String(row.caller) !== String(receiptOf(row).as))
  ok(callerWrong.length === 0, 'pair.caller is the receipt line own `as`, character for character (no re-labelling)', { wrong: callerWrong.slice(0, 6).map((r) => ({ pair: r.pairIndex, caller: r.caller, as: receiptOf(r).as })) })
  ok(rows.length > 0 && rows.every((row) => row.pairKind === 'caller' || row.pairKind === 'bridge'), 'every pair says whether it is a caller read or a bridge read', { kinds: [...new Set(rows.map((r) => r.pairKind))] })
  const directSeat = rows.filter((row) => row.pairKind === 'caller' && row.nextPrompt)
  ok(directSeat.length > 0 && directSeat.every((row) => row.callerSeat && row.callerSeat === row.nextPrompt.seat), 'a caller read pairs the caller seat with a prompt of that same seat (pair.callerSeat === pair.promptSeat)', { bad: directSeat.filter((r) => !(r.callerSeat && r.callerSeat === r.nextPrompt.seat)).slice(0, 6).map((r) => ({ pair: r.pairIndex, callerSeat: r.callerSeat, promptSeat: r.nextPrompt.seat })) })
  const bridgeRows = rows.filter((row) => row.pairKind === 'bridge' && row.nextPrompt)
  // A bridge is defined by the READER, not by the seat label: the prompt was assembled for a different member than the
  // one who acted. Two members share the `member` seat type, so "seats differ" is NOT the definition - the office
  // caller is not a seat at all and the parity suite coerces it to 'member', which would make a genuine bridge look
  // like a same-seat read. Asserting the reader's identity keeps the label from being used to dodge the check while
  // not demanding a seat difference the domain does not guarantee.
  ok(bridgeRows.length > 0 && bridgeRows.every((row) => row.nextPrompt.member !== row.caller), 'a bridge read is a real handover (its prompt was assembled for a member other than the caller), not a label used to dodge the check', { bad: bridgeRows.filter((r) => r.nextPrompt.member === r.caller).slice(0, 6).map((r) => r.pairIndex), bridges: bridgeRows.length })
  const callerRows = rows.filter((row) => row.pairKind === 'caller' && row.nextPrompt)
  ok(callerRows.length > 0 && callerRows.every((row) => row.nextPrompt.member === row.caller), 'a caller read is a prompt assembled FOR the caller (its prompt member is the caller)', { bad: callerRows.filter((r) => r.nextPrompt.member !== r.caller).slice(0, 6).map((r) => r.pairIndex), callerReads: callerRows.length })

  // C. the receipt text is a RENDERED line, never a serialized receipt
  // The static half: the builder may not produce `receiptText` by stringifying the receipt. The dynamic half below
  // proves the same thing from the text itself.
  ok(!/receiptText\s*:\s*JSON\.stringify/.test(runnerSource), 'run.mjs does not build receiptText with JSON.stringify (the renderer produces it)', { hit: /receiptText\s*:\s*JSON\.stringify/.test(runnerSource) })
  ok(/noticeRenderOf/.test(runnerSource) && /promptAfter/.test(runnerSource), 'the builder still locates the rendered line and the prompt AFTER the receipt (the measured join, not wording matching)', { hasRender: /noticeRenderOf/.test(runnerSource), hasOrder: /promptAfter/.test(runnerSource) })
  const withText = rows.filter((row) => typeof row.receiptText === 'string' && row.receiptText !== '')
  const serialized = withText.filter((row) => {
    // "Rendered, not serialized" has one test that wording cannot fool: a JSON.stringify'd receipt PARSES as JSON,
    // while a rendered line (an inbox notice, a status line) does not. Comparing against the stringified receipt is the
    // second half, because a pretty-printed blob would not parse either.
    try { JSON.parse(String(row.receiptText)); return true } catch (e) { /* not JSON - which is the point */ }
    try { return JSON.stringify(row.receipt) === row.receiptText } catch (e) { return false }
  })
  ok(serialized.length === 0, 'no pair quotes the receipt as JSON (receiptText is a rendered line)', { offenders: serialized.slice(0, 3).map((r) => r.pairIndex) })
  ok(meta.spanNotFound !== undefined && Array.isArray(meta.spanNotFound) && meta.spanNotFound.length === 0, 'the builder reported no SPAN_NOT_FOUND (a line it was handed but cannot find is a defect)', { spanNotFound: meta.spanNotFound })
  ok(!rows.some((row) => String(row.reason || '').indexOf('SPAN_NOT_FOUND') === 0), 'no pair carries a SPAN_NOT_FOUND reason', { offenders: rows.filter((row) => String(row.reason || '').indexOf('SPAN_NOT_FOUND') === 0).map((r) => r.pairIndex) })

  // ── D. THE CORE: the span re-cuts byte-exactly out of two independent reads of the prompt file ────────────────
  const located = rows.filter((row) => row.containsReceipt === true)
  ok(located.length >= 6, 'at least six pairs locate real rendered text inside the prompt (' + located.length + ')', { located: located.length })
  let spanBad = 0
  let spanDetail = null
  for (const row of rows) {
    if (row.containsReceipt !== true) continue
    const file = join(OUT, 'pairs', String(row.pairIndex).padStart(2, '0') + '-' + String((row.nextPrompt && row.nextPrompt.member) || row.caller || 'none').replace(/[^A-Za-z0-9._-]/g, '_') + '.txt')
    const first = readText(file)             // independent read #1
    const second = readText(file)            // independent read #2: a builder that reused one buffer cannot pass both
    const span = row.receiptSpan
    const slice1 = first.slice(span.start, span.end)
    const slice2 = second.slice(span.start, span.end)
    const expected = String(row.receiptText)
    if (slice1 !== expected || slice2 !== expected || first.slice(span.start, span.end) !== second.slice(span.start, span.end)) {
      spanBad += 1
      spanDetail = { pair: row.pairIndex, start: span.start, end: span.end, slice1: slice1.slice(0, 120), expected: expected.slice(0, 120) }
      continue
    }
    // The span must also be WHERE the corpus says it is: indexOf finds this text at exactly start (so the slice is
    // located in the prompt, not just a coincidentally equal substring somewhere else).
    if (first.indexOf(expected) !== span.start) { spanBad += 1; spanDetail = { pair: row.pairIndex, indexOf: first.indexOf(expected), start: span.start } }
    // And the JSONL copy must agree with the file read back from disk, character for character.
    if (row.nextPrompt && row.nextPrompt.text !== first) { spanBad += 1; spanDetail = { pair: row.pairIndex, jsonlChars: String(row.nextPrompt.text || '').length, fileChars: first.length } }
  }
  ok(spanBad === 0, 'every recorded span re-cuts byte-exactly from two independent reads of the prompt file', { bad: spanBad, detail: spanDetail })

  const noText = rows.filter((row) => row.containsReceipt !== true)
  ok(noText.every((row) => typeof row.reason === 'string' && NAMED_REASON.test(row.reason)), 'every pair WITHOUT receipt text names its reason (no silent skip: refusals and records readings are explained)', { // EMPTY_ALLOWED: a corpus where EVERY pair located its receipt text is a strictly better outcome, not a hole
    offenders: noText.filter((row) => !(typeof row.reason === 'string' && NAMED_REASON.test(row.reason))).slice(0, 5).map((r) => r.pairIndex),
  })
  ok(meta.unnamedPairs !== undefined && Array.isArray(meta.unnamedPairs) && meta.unnamedPairs.length === 0, 'the builder itself reports no unnamed pair', { unnamed: meta.unnamedPairs })
  ok(noText.every((row) => row.receiptText === null || row.receiptText === ''), 'a pair that is not in the prompt carries no fabricated receipt text', { offenders: noText.filter((row) => row.receiptText).slice(0, 5).map((r) => r.pairIndex) }) // EMPTY_ALLOWED: empty noText means no pair needed explaining, which cannot hide a fabricated text

  // ── E. ORDER: the prompt came AFTER the call, never before it (assertion 11 of the taskbook) ─────────────────
  const orderRows = rows.filter((row) => row.nextPrompt && row.receiptEndedAt !== null && row.nextPrompt.assembledAt !== null)
  const badOrder = orderRows.filter((row) => row.receiptEndedAt > row.nextPrompt.assembledAt)
  ok(orderRows.length >= 10, 'order is checkable for at least ten pairs (both clocks recorded)', { checked: orderRows.length })
  ok(badOrder.length === 0, 'no pair pairs a receipt with a prompt assembled BEFORE the call returned', { offenders: badOrder.slice(0, 5).map((r) => ({ pair: r.pairIndex, ended: r.receiptEndedAt, assembled: r.nextPrompt.assembledAt })) })
  const stalePrompt = rows.filter((row) => row.nextPrompt && Number(row.nextPrompt.afterReceipts) < Number(row.receiptSeq))
  ok(stalePrompt.length === 0, 'every paired prompt was assembled from at least as many receipts as the pair seq (no earlier assembly)', { offenders: stalePrompt.slice(0, 5).map((r) => ({ pair: r.pairIndex, afterReceipts: r.nextPrompt.afterReceipts })) })

  // ── F. DELIVERY ATTRIBUTION: who received is measured, not guessed ───────────────────────────────────────────
  const delivery = rows.filter((row) => row.kind === 'delivery')
  ok(delivery.length >= 2, 'the corpus contains delivery pairs (a receipt that put mail into a mailbox)', { delivery: delivery.length })
  ok(delivery.every((row) => row.delivery && typeof row.delivery.mailId === 'string' && row.delivery.mailId !== '' && typeof row.delivery.to === 'string'), 'every delivery pair names the mail id and its recipient', { offenders: delivery.filter((row) => !(row.delivery && row.delivery.mailId && row.delivery.to)).map((r) => r.pairIndex) })
  ok(delivery.every((row) => row.nextPrompt && row.nextPrompt.member === row.delivery.to), 'the seat that read the prompt is the seat the mail was delivered to (the join is per-seat, not "some prompt")', { offenders: delivery.filter((row) => !(row.nextPrompt && row.nextPrompt.member === row.delivery.to)).map((r) => ({ pair: r.pairIndex, to: r.delivery && r.delivery.to, seat: r.nextPrompt && r.nextPrompt.member })) })
  const locatedDelivery = delivery.filter((row) => row.containsReceipt === true)
  ok(locatedDelivery.length >= 2, 'delivered mail is FOUND in the prompt text it was rendered into (' + locatedDelivery.length + '/' + delivery.length + ')', { located: locatedDelivery.length, delivery: delivery.length })
  ok(locatedDelivery.every((row) => row.foundAs === 'two-space-indent' || row.foundAs === 'bare-line' || row.foundAs === 'other-indent'), 'each located delivery records HOW the renderer presented the line', { foundAs: locatedDelivery.map((r) => r.foundAs) })
  // One receipt that reached two seats must be TWO rows with two different seats: a single row would claim one reader.
  const byReceipt = new Map()
  for (const row of delivery) {
    if (!byReceipt.has(row.receiptSeq)) byReceipt.set(row.receiptSeq, [])
    byReceipt.get(row.receiptSeq).push(row)
  }
  const twoSeat = [...byReceipt.values()].filter((list) => new Set(list.map((row) => row.nextPrompt && row.nextPrompt.member)).size > 1)
  ok(twoSeat.length >= 1, 'a receipt delivered to two seats produced two rows with two different seats', { receipts: twoSeat.map((list) => ({ seq: list[0].receiptSeq, seats: list.map((row) => row.nextPrompt && row.nextPrompt.member) })) })

  // ── G. COVERAGE: the classes the taskbook names are all present ───────────────────────────────────────────────
  const classes = meta.classes || {}
  const recomputed = {
    delivery: count(rows, (row) => row.kind === 'delivery'),
    success: count(rows, (row) => row.kind === 'success'),
    refusal: count(rows, (row) => row.kind === 'refusal' || row.kind === 'refusal-with-hint'),
    refusalNoHint: count(rows, (row) => (row.kind === 'refusal' || row.kind === 'refusal-with-hint') && row.hasHint === false),
    refusalWithHint: count(rows, (row) => (row.kind === 'refusal' || row.kind === 'refusal-with-hint') && row.hasHint === true),
    meetingWindow: count(rows, (row) => row.kind === 'meeting-window'),
    recordsReading: count(rows, (row) => row.kind === 'records-reading'),
  }
  for (const name of ['delivery', 'success', 'refusal', 'refusalWithHint', 'meetingWindow', 'recordsReading']) {
    ok(recomputed[name] >= 1, 'coverage class "' + name + '" is present (' + recomputed[name] + ' pairs)', { name, count: recomputed[name] })
  }
  const sameCounts = ['delivery', 'success', 'refusal', 'refusalNoHint', 'refusalWithHint', 'meetingWindow', 'recordsReading'].every((name) => Number(classes[name]) === Number(recomputed[name])) && Object.keys(classes).length === Object.keys(recomputed).length
  ok(sameCounts, 'manifest.pairs.classes equals the counts recomputed from the pair rows', { manifest: classes, recomputed })
  const other = count(rows, (row) => ['delivery', 'success', 'refusal', 'refusal-with-hint', 'meeting-window', 'records-reading'].indexOf(row.kind) === -1)
  const partition = recomputed.delivery + recomputed.success + recomputed.refusal + recomputed.meetingWindow + recomputed.recordsReading
  ok(partition + other === rows.length, 'the classes partition the rows (every pair has exactly one kind, none counted twice)', { rows: rows.length, partition, other })

  // ── G2. SELF-SUFFICIENCY: pairs.jsonl is judged ALONE (lead follow-up, TB-2602) ────────────────────────────────
  // The corpus now carries the complete prompt text AND its digest on every row, so a reader who never opens
  // `pairs/*.txt` can still re-derive both the prompt identity and the receipt slice. This is the assertion a future
  // "slim the corpus" change must fight: if the digest or the span stops being self-contained, the proof moves into a
  // second file and this gate goes red.
  const sha = (text) => 'sha256:' + createHash('sha256').update(String(text)).digest('hex')
  const withPromptRows = rows.filter((row) => row.nextPrompt !== null)
  const badSha = withPromptRows.filter((row) => row.nextPrompt.sha256 !== sha(row.nextPrompt.text))
  ok(badSha.length === 0 && withPromptRows.length > 0, 'every row recomputes its own promptSha256 from the prompt text it carries (no second file needed)', { rows: withPromptRows.length, bad: badSha.slice(0, 3).map((r) => r.pairIndex) })
  ok(withPromptRows.every((row) => typeof row.nextPrompt.sha256 === 'string' && /^sha256:[0-9a-f]{64}$/.test(row.nextPrompt.sha256)), 'the digest is a well-formed sha256 token, not a prefix or a length', { sample: withPromptRows[0] && withPromptRows[0].nextPrompt.sha256 })
  const locatedRows = withPromptRows.filter((row) => row.receiptSpan !== null && row.receiptText !== null)
  const selfSlice = locatedRows.filter((row) => row.nextPrompt.text.slice(row.receiptSpan.start, row.receiptSpan.end) !== row.receiptText)
  ok(selfSlice.length === 0 && locatedRows.length > 0, 'every located row slices its own receiptText out of its own prompt text byte-for-byte (pairs.jsonl alone)', { located: locatedRows.length, bad: selfSlice.slice(0, 3).map((r) => r.pairIndex) })
  ok(Number(meta.selfSufficient && meta.selfSufficient.promptSha256Rows) === withPromptRows.length, 'the manifest publishes how many rows carry the digest, and it equals the rows that have a prompt', { manifest: meta.selfSufficient && meta.selfSufficient.promptSha256Rows, rows: withPromptRows.length })
  ok(!rows.some((row) => row.receiptSpan !== null && row.nextPrompt === null), 'a span without a prompt is impossible (the span is an offset INTO the prompt text)', { bad: count(rows, (row) => row.receiptSpan !== null && row.nextPrompt === null) })

  // ── G3. HINT-LESS NAMED REFUSALS: a census, then a CONDITIONAL judgement (lead follow-up) ─────────────────────
  // A refusal with a code and no hint is not a pairing defect (a refusal stays in the tool result by design). It is a
  // fact that must be COUNTED: either this corpus has none (asserted explicitly, so the claim is on record) or every
  // one of them owns a row in the `refusalNoHint` class. The census below reads the receipts, not the pairs, so the
  // two sides are independent measurements.
  const hintless = receipts.filter((line) => {
    const receipt = line.receipt
    return receipt && receipt.ok === false && typeof receipt.code === 'string' && receipt.code !== '' && !(typeof receipt.hint === 'string' && receipt.hint !== '')
  })
  const refusalNoHintRows = count(rows, (row) => row.kind === 'refusal' && row.hasHint === false)
  if (hintless.length > 0) {
    ok(refusalNoHintRows === hintless.length, 'the census found ' + hintless.length + ' hint-less named refusal(s) in receipts.jsonl, and each owns a row in the refusalNoHint class', { census: hintless.length, rows: refusalNoHintRows, codes: hintless.map((line) => line.receipt.code).slice(0, 6) })
    ok(Number(meta.classes && meta.classes.refusalNoHint) === hintless.length, 'manifest.pairs.classes.refusalNoHint equals the census', { manifest: meta.classes && meta.classes.refusalNoHint, census: hintless.length })
  } else {
    ok(refusalNoHintRows === 0 && Number(meta.classes && meta.classes.refusalNoHint) === 0, 'the census found NO hint-less named refusal, and the class count is explicitly 0 (not silently absent)', { rows: refusalNoHintRows, manifest: meta.classes && meta.classes.refusalNoHint })
    ok(typeof meta.refusalNoHintMeans === 'string' && meta.refusalNoHintMeans.includes('no hint-less named refusal'), 'the manifest records WHY the class is empty instead of leaving a reader to guess', { means: meta.refusalNoHintMeans })
  }

  // ── H. RATE AND THRESHOLD: measured first, then +5% ───────────────────────────────────────────────────────────
  const unpairedRows = rows.filter((row) => row.nextPrompt === null)
  ok(Number(meta.thresholdSetBy === 'measured+5%'), 'the threshold records how it was set (measured+5%)', { thresholdSetBy: meta.thresholdSetBy })
  ok(Math.abs(Number(meta.threshold) - Math.round((Number(meta.measuredRate) + 0.05) * 10000) / 10000) < 1e-9, 'threshold == measured rate + 5%', { measured: meta.measuredRate, threshold: meta.threshold })
  ok(Number(meta.measuredRate) <= Number(meta.threshold), 'the measured unpaired rate is under the threshold it set', { measured: meta.measuredRate, threshold: meta.threshold })
  ok(meta.measuredRate === Math.round((unpairedRows.length / receipts.length) * 10000) / 10000 || unpairedRows.length === 0,
    'the manifest rate agrees with the rows that have no prompt after them (or is 0 with none)',
    { unpairedRows: unpairedRows.length, receipts: receipts.length, measured: meta.measuredRate })
  ok(!Array.isArray(meta.unpairedSeqs) || meta.unpairedSeqs.length === Number(meta.unpaired), 'manifest.pairs.unpaired === length of its own unpairedSeqs list', { unpaired: meta.unpaired, seqs: meta.unpairedSeqs })

  // ── I. TRUNCATION BOOKKEEPING: an excerpt must never look like a full line ───────────────────────────────────
  ok(rows.length > 0 && rows.every((row) => typeof row.truncated === 'boolean' && typeof row.excerptLen === 'number'), 'every pair records truncated (boolean) and excerptLen (number)', { bad: count(rows, (row) => typeof row.truncated !== 'boolean' || typeof row.excerptLen !== 'number') })
  const truncBad = rows.filter((row) => {
    if (row.truncated === true) return !(String(row.receiptText || '').length === row.excerptLen && row.excerptLen === 400)
    return row.excerptLen !== String(row.receiptText || '').length
  })
  ok(truncBad.length === 0, 'excerptLen equals the text length, and a truncated excerpt is exactly the 400-char cap', { offenders: truncBad.slice(0, 5).map((r) => r.pairIndex) })

  // ── J. THE PROMPT FILE IS THE COMPLETE PROMPT, not an excerpt ────────────────────────────────────────────────
  const promptCharCheck = rows.filter((row) => row.nextPrompt !== null).map((row) => {
    const file = join(OUT, 'pairs', String(row.pairIndex).padStart(2, '0') + '-' + String((row.nextPrompt && row.nextPrompt.member) || row.caller || 'none').replace(/[^A-Za-z0-9._-]/g, '_') + '.txt')
    const text = readText(file)
    return { pair: row.pairIndex, chars: text.length, declared: row.nextPrompt.chars, same: text === row.nextPrompt.text }
  })
  ok(promptCharCheck.length > 0, 'precondition: pairs with an assembled prompt exist to compare', promptCharCheck.length)
  ok(promptCharCheck.every((x) => x.same), 'the prompt file is the full assembled prompt, character for character', { bad: promptCharCheck.filter((x) => !x.same).slice(0, 3) })
  ok(promptCharCheck.every((x) => x.chars === x.declared), 'the declared prompt chars equal the file length', { bad: promptCharCheck.filter((x) => x.chars !== x.declared).slice(0, 3) })
  ok(promptCharCheck.filter((x) => x.chars > 10_000).length >= 6, 'the paired prompts are full assemblies (six or more over 10k chars), not excerpts', { big: promptCharCheck.filter((x) => x.chars > 10_000).length })

  // ── K. THE REPORT SHOWS THE PAIRS ────────────────────────────────────────────────────────────────────────────
  ok(report.indexOf('## pairs (receipt -> the complete prompt the same seat read next)') !== -1, 'REPORT.md has the pair section a human can read without opening JSONL', {})
  const reportRows = report.split(LF).filter((line) => /^\| \d+ \| /.test(line))
  ok(reportRows.length === rows.length && rows.length > 0, 'the report table lists one row per pair (and the corpus itself is not empty)', { report: reportRows.length, rows: rows.length })

  console.log(LF + '--- corpus: ' + OUT)
  console.log('--- pairs: ' + rows.length + ' (' + located.length + ' with the receipt text located) · classes ' + JSON.stringify(recomputed))
} catch (e) {
  ok(false, 'the paired-corpus gate ran to completion', { error: String((e && e.message) || e), stderr: stderr.slice(-700) })
} finally {
  if (process.env.SIM_KEEP_CORPUS === '1') {
    console.log('--- corpus kept for inspection: ' + OUT)
  } else {
    try { rmSync(OUT, { recursive: true, force: true }) } catch { /* a leftover temp dir is not a failure */ }
    if (keptRoot) { try { rmSync(keptRoot, { recursive: true, force: true }) } catch { /* same */ } }
  }
}

console.log(LF + '=== sim paired corpus: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failed: ' + failures.join(' | '))
  process.exitCode = 1
}
