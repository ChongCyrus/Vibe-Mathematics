#!/usr/bin/env node
// scripts/sim/run.mjs — run a scenario against the REAL kernel and write a corpus.
//
//   node scripts/sim/run.mjs                       # mainline, throwaway workspace, prints a summary
//   node scripts/sim/run.mjs --keep                # keep the workspace, print its path
//   node scripts/sim/run.mjs --out D:/_tmp/sim/corpus-mainline
//
// The corpus is the only durable output: receipts (one JSONL line per tool call), prompts (one per seat/phase
// assembly), the workspace tree with sha256 per file, and a REPORT.md a human can read without rerunning anything.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, corpusAt, tmpRoot, REPO } from './harness.mjs'
// ★ TB-2648 §7 MIXED-GEN — the generator and the criterion share ONE definition of the generation stamp, so there is
// no second formula to drift apart. `corpus-stamp.mjs` documents why mtimes are not the criterion.
import { checkCorpus, stampFile, stampPrompts } from './corpus-stamp.mjs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes('--' + name)
const opt = (name, def) => {
  const at = argv.indexOf('--' + name)
  return at === -1 ? def : argv[at + 1]
}

const scenario = opt('scenario', 'mainline')
const keep = flag('keep')
const explicitRoot = argv.includes('--root')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const root = opt('root', tmpRoot('ws-' + scenario + '-'))
// `--vmu vmu.meetings.lateAfterMs=100` (repeatable, comma-separated). A policy whose default makes a path unreachable
// has to be declarable for a test, exactly as a deployment declares it under `config.vmu` - otherwise the honest
// finding is "the test cannot reach this code", and the dishonest one is "the scenario stopped covering it".
const cliSettings = {}
for (const pair of String(opt('vmu', '')).split(',').map((x) => x.trim()).filter(Boolean)) {
  const eq = pair.indexOf('=')
  if (eq === -1) { console.error('--vmu expects key=value, got: ' + pair); process.exit(2) }
  const k = pair.slice(0, eq)
  const raw = pair.slice(eq + 1)
  let v = raw
  if (raw === 'true' || raw === 'false') v = raw === 'true'
  else if (raw !== '' && !Number.isNaN(Number(raw))) v = Number(raw)
  cliSettings[k] = v
}

// SCENARIOS ARE DISCOVERED, NOT LISTED: adding `scripts/sim/scenarios/<name>.mjs` that exports a function is the whole
// registration step. A hard-coded map here would mean every new scenario edits this file too - and two authors editing
// the same map is exactly how a simulator ends up with a scenario nobody can run.
// `SIM_SCEN_DIR` points discovery at another directory. Its only job is the gate's mutation copies
// (`tests/sim-gate.test.mjs`): to prove the refusal LEDGER bites, the gate runs a copy of a shipped scenario whose
// `expectedRefusals` is reduced to one blanket declaration, and it must do that WITHOUT editing the shipped file -
// a gate that rewrites the scenario it is judging is measuring its own edit. A mutation copy is a temp file; nothing
// in the repo reads this variable.
const SCEN_DIR = process.env.SIM_SCEN_DIR ? resolve(process.env.SIM_SCEN_DIR) : join(REPO, 'scripts/sim/scenarios')
const SCENARIOS = {}
for (const f of readdirSync(SCEN_DIR).filter((n) => n.endsWith('.mjs')).sort()) {
  const name = f.replace(/\.mjs$/, '')
  SCENARIOS[name] = async () => {
    const mod = await import(pathToFileURL(join(SCEN_DIR, f)).href)
    const fn = mod[name] || mod.scenario || mod.default
    if (typeof fn !== 'function') {
      throw new Error('scenario ' + f + ' must export a function named "' + name + '", "scenario" or default')
    }
    // A scenario may also export `settings`: the deployment settings its mechanism needs (a policy whose default
    // makes the path unreachable is not testable without them — see harness.mjs). `--vmu` on the command line wins,
    // so an operator can re-run the same scenario under a different policy without editing it.
    // A scenario may also export `deliver`: the DELEGATED seam (task-15). With it, the scenario drives `vibe_vmu_turn`
    // through the host's own subagents path (`host-deliver.js` → `deliverViaSubagents`) instead of the caller-played
    // route — the same seam a deployment has, with only the language model replaced by script. Absent ⇒ boot() is
    // unchanged and the missing-seam refusal stays observable.
    //
    // ★ TB-2601 — TWO MORE OPTIONAL EXPORTS, BOTH ABOUT MAKING A LIFETIME REPRODUCIBLE RATHER THAN MERELY POSSIBLE:
    //   · `clock` — a scenario that has to move TIME (schedule a meeting, cross `scheduledFor`, watch a lazy settle)
    //     must own the clock the kernel reads. Without this the sim can only nag the real clock forward, so a scheduled
    //     meeting can never be observed opening at a deterministic instant and the corpus timestamps move every run.
    //     The function must return NUMBER milliseconds (harness contract); the scenario holds the mutable value.
    //   · `corpusDir` — the corpus directory a scenario wants by default, so "rerun this exact evidence" is one
    //     command (`--out` still wins). A corpus whose location only exists in a README is a corpus nobody reruns.
    return {
      fn,
      clock: typeof mod.clock === 'function' ? mod.clock : null,
      corpusDir: typeof mod.corpusDir === 'string' && mod.corpusDir !== '' ? mod.corpusDir : null,
      settings: Object.assign({}, mod.settings || {}, cliSettings),
      deliver: typeof mod.deliver === 'function' ? mod.deliver : null,
    }
  }
}

// ★★ TB-2602 — THE PAIR IS THE UNIT OF EVIDENCE: one receipt × the COMPLETE prompt the same seat read next.
//
// `receipts.jsonl` proves a tool answered. `prompts.jsonl` proves a prompt was assembled. Neither proves the model ever
// SAW the receipt — and a corpus that cannot show that is two unrelated logs in one directory. This builder joins them
// with measurements instead of wording:
//   · the mailbox diff (`h.mail`, harness) says which CALL put which mail row into which member's mailbox;
//   · the notice capture (`prompts[].notices`, harness) says which lines the kernel handed the renderer for that
//     assembly and which mailbox rows (`mailIds`) those lines were rendered from — `noticeLines()` renders `entries`
//     one for one, so index i of `lines` belongs to index i of `mailIds`;
//   · `calls[].endedAt` and `prompts[].assembledAt` are milliseconds from ONE monotonic clock, so "this prompt came
//     AFTER that receipt" is an inequality a test can check, not an assumption about logging order.
//
// The receipt text is NEVER `JSON.stringify(receipt)`. Either it is the line the notice renderer produced (and
// `receiptSpan` is the slice of the prompt that equals it BYTE FOR BYTE), or the pair carries a `reason` naming why this
// receipt is not in the prompt channel. `containsReceipt: false` without a reason is a bug in this builder, not a
// permitted state: the gate asserts every unnamed one is red.
const PAIR_ID_PATTERNS = [/^m\d+$/, /^mo\d+$/, /^rec-\d+$/, /^paper-p\d+$/, /^t-\d+$/, /^ag-\d+$/, /^consult-.+-\d+$/, /^ruling-.+$/]
const PAIR_TOKEN = /[A-Za-z0-9_\u4e00-\u9fff-]+/g
const PAIR_EXCERPT_MAX = 400
const isPairId = (token) => PAIR_ID_PATTERNS.some((re) => re.test(token))

function pairTokens(value, out) {
  if (typeof value === 'string') { for (const t of value.match(PAIR_TOKEN) || []) out.push(t) }
  else if (Array.isArray(value)) { for (const v of value) pairTokens(v, out) }
  else if (value && typeof value === 'object') { for (const k of Object.keys(value)) pairTokens(value[k], out) }
  return out
}

// The line of `text` that contains offset `at`, trimmed on both sides, clipped at PAIR_EXCERPT_MAX. The returned
// `start`/`end` are offsets such that `text.slice(start, end) === receiptText` — the gate re-reads the prompt file from
// disk and compares the slice, so a span that only agrees in this process is not enough.
function pairExcerptAt(text, at) {
  const lineStart = text.lastIndexOf('\n', Math.max(0, at - 1)) + 1
  let lineEnd = text.indexOf('\n', at)
  if (lineEnd === -1) lineEnd = text.length
  const raw = text.slice(lineStart, lineEnd)
  const lead = raw.length - raw.replace(/^\s+/, '').length
  const body = raw.slice(lead).replace(/\s+$/, '')
  const clipped = body.length > PAIR_EXCERPT_MAX
  const receiptText = clipped ? body.slice(0, PAIR_EXCERPT_MAX) : body
  return { receiptText, start: lineStart + lead, end: lineStart + lead + receiptText.length, truncated: clipped, excerptLen: receiptText.length }
}

// Prefixes a notice renderer may put in front of a line. `v5r`'s inbox block indents with two spaces; the others are
// tried so a renderer change shows up as `foundAs` in the corpus instead of as a silent NOT_FOUND.
const PAIR_LINE_PREFIXES = ['  ', ' ', '\t', '']

function buildPairs(h, outDir) {
  const receipts = Array.isArray(h.receipts) ? h.receipts : []
  const calls = new Map((Array.isArray(h.calls) ? h.calls : []).map((c) => [Number(c.seq), c]))
  const prompts = (Array.isArray(h.prompts) ? h.prompts : []).map((p) => ({
    assembly: Number(p.assembly) || 0,
    seat: p.seat || '?',
    phase: p.phase || 'normal',
    member: p.member === null || p.member === undefined ? null : String(p.member),
    chars: String(p.text || '').length,
    text: String(p.text || ''),
    assembledAt: Number.isFinite(p.assembledAt) ? p.assembledAt : null,
    afterReceipts: Number.isFinite(p.afterReceipts) ? p.afterReceipts : 0,
    notices: p.notices && typeof p.notices === 'object' ? p.notices : null,
  }))
  // Which calls delivered mail, in delivery order.
  const mailBySeq = new Map()
  for (const ev of (Array.isArray(h.mail) ? h.mail : [])) {
    const seq = Number(ev.seq)
    if (!mailBySeq.has(seq)) mailBySeq.set(seq, [])
    for (const row of (Array.isArray(ev.rows) ? ev.rows : [])) mailBySeq.get(seq).push(row)
  }
  const endedAtOf = (seq) => { const c = calls.get(Number(seq)); return c && Number.isFinite(c.endedAt) ? c.endedAt : null }
  // TB-2648 §7: the seat of a caller. Same rules the parity suite uses (tests/vmu-run257-prompt-receipt-parity):
  // the chair acts as 'chair', a temp holder as 'temp', everyone else as 'member'. A caller that is not a seat at all
  // (the human operator, `office`) has no seat - but it still has an id, and that id is what `caller` records.
  const callerSeatOf = (who) => {
    if (who === null || who === undefined || who === '') return null
    const c = String(who)
    if (c === 'chair' || /(^|-)acad$/.test(c)) return 'chair'
    if (/^r-t\d+$/.test(c) || /(^|-)t\d+$/.test(c)) return 'temp'
    return 'member'
  }
  // A CALLER READ is a prompt assembled FOR the caller; anything else (the reader's own seat was assembled next, the
  // caller never was) is a BRIDGE: the caller keeps the tool result and another seat reads the consequence. The label
  // is computed from the corpus, never hand-assigned, and a bridge is reported rather than deleted - dropping those rows
  // would shrink the denominator until the mismatch disappeared.
  const seatFieldsOf = (caller, prompt) => {
    const callerSeat = callerSeatOf(caller)
    const promptSeat = prompt ? prompt.seat : null
    const pairKind = prompt === null || prompt === undefined ? null : (prompt.member === caller ? 'caller' : 'bridge')
    return { callerSeat, promptSeat, pairKind }
  }
  // A prompt counts as "the one after this receipt" when it was assembled from AT LEAST this many receipts and, when
  // both timestamps exist, strictly after the call returned. Both conditions: `afterReceipts` alone would accept a
  // prompt assembled DURING the call, which is exactly the mismatch assertion 11 exists to catch.
  const promptAfter = (seq, member) => {
    const ended = endedAtOf(seq)
    for (const p of prompts) {
      if (p.afterReceipts < Number(seq)) continue
      if (ended !== null && p.assembledAt !== null && p.assembledAt < ended) continue
      if (member !== null && p.member !== member) continue
      return p
    }
    return null
  }
  const noticeRenderOf = (prompt, mailId) => {
    const n = prompt && prompt.notices
    if (!n || !Array.isArray(n.lines)) return null
    const ids = Array.isArray(n.mailIds) ? n.mailIds : []
    for (let i = 0; i < n.lines.length; i += 1) {
      if (String(ids[i]) !== String(mailId)) continue
      // The mailbox row was handed to the renderer; now find WHERE it landed. `trim()` is what the renderer does to a
      // notice line (it renders one entry per line, no wrapping), so each candidate is a byte-exact candidate.
      for (const prefix of PAIR_LINE_PREFIXES) {
        const rendered = prefix + String(n.lines[i]).trim()
        const at = prompt.text.indexOf(rendered)
        if (at >= 0) return { receiptText: rendered, start: at, end: at + rendered.length, foundAs: prefix === '' ? 'bare-line' : prefix === '  ' ? 'two-space-indent' : 'other-indent', truncated: false, excerptLen: rendered.length }
      }
      return null
    }
    return null
  }
  // Ids a receipt MINTED (first appearance in the corpus). Used to prove "the prompt shows a fact this receipt created"
  // for receipts whose state is not a mail row: a token that appears in the prompt but was minted by seq N is evidence
  // about seq N, and one minted earlier is evidence about something else.
  const seenTokens = new Set()
  const mintedBySeq = new Map()
  for (const r of receipts) {
    const tokens = pairTokens(r.receipt === undefined ? null : r.receipt, [])
    const minted = []
    for (const t of tokens) {
      if (isPairId(t) && !seenTokens.has(t) && minted.indexOf(t) === -1) minted.push(t)
    }
    mintedBySeq.set(Number(r.seq), minted)
    for (const t of tokens) if (isPairId(t)) seenTokens.add(t)
  }
  const rows = []
  const unpairedSeqs = []
  const spanNotFound = []
  const unnamed = []
  const kindCounts = {}
  const classes = { success: 0, refusal: 0, refusalNoHint: 0, refusalWithHint: 0, meetingWindow: 0, recordsReading: 0, delivery: 0 }
  // TB-2602 (lead follow-up): a pair must be judgeable from `pairs.jsonl` ALONE. The row carries the full prompt text,
  // so it can also carry that text's digest: then a reader who never opens `pairs/*.txt` can still prove the row is
  // self-consistent (sha256(text) matches, and text.slice(span) is the receipt text). Storing only a span + a file
  // reference would move the proof into a second file and let a future "slimming" weaken it silently.
  const promptSha256 = (text) => 'sha256:' + createHash('sha256').update(String(text)).digest('hex')
  const push = (row) => {
    row.pairIndex = rows.length + 1
    rows.push(row)
    const kind = row.kind || 'other'
    kindCounts[kind] = (kindCounts[kind] || 0) + 1
    // ★ TB-2602 — the coverage classes are counted SEPARATELY from `kind`, because the lead's list treats "a named
    // refusal" and "a refusal that carries a hint" as two facts (a refusal can be named without a hint). `containsReceipt`
    // is not part of a class: a refusal stays in the tool result BY DESIGN and is still a covered pair.
    if (kind === 'delivery') classes.delivery += 1
    if (kind === 'refusal' || kind === 'refusal-with-hint') {
      classes.refusal += 1
      if (row.hasHint) classes.refusalWithHint += 1
      // A refusal with a CODE but no HINT is its own class: the code names the fact, the missing hint is the gap a
      // reader has to invent a next move for. Counted separately so the census in the tests can compare receipt-by-receipt.
      if (!row.hasHint) classes.refusalNoHint += 1
    } else if (kind === 'meeting-window') classes.meetingWindow += 1
    else if (kind === 'records-reading') classes.recordsReading += 1
    else if (kind === 'success') classes.success += 1
    if (row.nextPrompt && row.nextPrompt.containsReceipt === false && !row.reason) unnamed.push(row.pairIndex)
  }
  for (const r of receipts) {
    const seq = Number(r.seq)
    const receipt = r.receipt === undefined ? null : r.receipt
    const call = calls.get(seq) || {}
    // TB-2648 §7: `as` reaches this corpus as a STRING (the scenario passes `{as:{agent:{id}}}` to the harness, which
    // records the id). Reading only the object shape made `caller` null for 45 of 45 receipts - the pair knew who read
    // the prompt but not who acted, so no seat comparison could be made at all.
    const caller = typeof r.as === 'string'
      ? r.as
      : (r.as && r.as.agent && r.as.agent.id ? String(r.as.agent.id) : null)
    const refusal = Boolean(receipt && receipt.ok === false)
    const tool = r.tool || (receipt && receipt.tool) || null
    const kindOf = () => (refusal ? (receipt && receipt.hint ? 'refusal-with-hint' : 'refusal') : (/meeting|say|motion|second/.test(String(tool)) ? 'meeting-window' : (/records|read_library/.test(String(tool)) ? 'records-reading' : 'success')))
    const mailRows = mailBySeq.get(seq) || []
    if (mailRows.length > 0) {
      for (const mailRow of mailRows) {
        const to = mailRow && mailRow.to ? String(mailRow.to) : null
        const prompt = promptAfter(seq, to) || promptAfter(seq, null)
        const rendered = prompt ? noticeRenderOf(prompt, mailRow.id) : null
        const nextPrompt = prompt ? {
          assembly: prompt.assembly, seat: prompt.seat, phase: prompt.phase, member: prompt.member,
          chars: prompt.chars, assembledAt: prompt.assembledAt, afterReceipts: prompt.afterReceipts,
          containsReceipt: rendered !== null,
          receiptSpan: rendered ? { start: rendered.start, end: rendered.end } : null,
          sha256: promptSha256(prompt.text),
          text: prompt.text,
        } : null
        let reason = null
        if (!prompt) reason = 'NO_PROMPT_FOR_THIS_SEAT_AFTER_THE_RECEIPT: the delivery is in the mailbox diff, but this seat was never assembled again in this run, so no turn of its could read it'
        else if (!rendered) {
          const n = prompt.notices
          const had = n && Array.isArray(n.mailIds) && n.mailIds.indexOf(String(mailRow.id)) >= 0
          reason = had
            ? 'SPAN_NOT_FOUND: the notice renderer was handed this line for this assembly but the text does not contain it — a pair that cannot be located is a defect, not a pass'
            : 'MAIL_ROW_NOT_IN_THIS_ASSEMBLY: this prompt was assembled after the delivery but its notice block did not carry this row (older rows fall out of the newest-N window)'
          if (had) spanNotFound.push(rows.length + 1)
        }
        push({
          step: seq, receiptSeq: seq, tool, caller, ...seatFieldsOf(caller, prompt), kind: 'delivery',
          args: r.args === undefined ? null : r.args,
          named: false, hasHint: false,
          receipt, receiptStartedAt: call.startedAt === undefined ? null : call.startedAt, receiptEndedAt: call.endedAt === undefined ? null : call.endedAt,
          delivery: { mailId: mailRow.id || null, to, from: mailRow.from || null, subject: mailRow.subject || null },
          receiptText: rendered ? rendered.receiptText : null,
          receiptSpan: rendered ? { start: rendered.start, end: rendered.end } : null,
          containsReceipt: rendered !== null,
          truncated: rendered ? rendered.truncated : false,
          excerptLen: rendered ? rendered.excerptLen : 0,
          foundAs: rendered ? rendered.foundAs : null,
          reason, nextPrompt,
        })
      }
      continue
    }
    const prompt = promptAfter(seq, caller) || promptAfter(seq, null)
    let rendered = null
    let matchedToken = null
    let matchedBy = null
    if (prompt) {
      // A refusal's CODE and an id this receipt minted are the two honest fingerprints of "this receipt". Search the
      // REAL prompt text for one of them; a hit is anchored by indexOf and then widened to the whole rendered line.
      const candidates = []
      if (receipt && typeof receipt.code === 'string' && receipt.code !== '') candidates.push({ token: receipt.code, by: 'refusal-code' })
      for (const id of mintedBySeq.get(seq) || []) candidates.push({ token: id, by: 'minted-id' })
      for (const c of candidates) {
        const at = prompt.text.indexOf(c.token)
        if (at < 0) continue
        const found = pairExcerptAt(prompt.text, at)
        rendered = found
        matchedToken = c.token
        matchedBy = c.by
        break
      }
    }
    const nextPrompt = prompt ? {
      assembly: prompt.assembly, seat: prompt.seat, phase: prompt.phase, member: prompt.member,
      chars: prompt.chars, assembledAt: prompt.assembledAt, afterReceipts: prompt.afterReceipts,
      containsReceipt: rendered !== null,
      receiptSpan: rendered ? { start: rendered.start, end: rendered.end } : null,
      sha256: promptSha256(prompt.text),
      text: prompt.text,
    } : null
    let reason = null
    if (!prompt) reason = 'NO_PROMPT_AFTER_THIS_RECEIPT: nothing was assembled after it, so no turn could have read it (the caller keeps the tool result)'
    else if (!rendered) {
      reason = refusal
        ? 'REFUSAL_STAYS_IN_THE_TOOL_RESULT: a refused call is answered to the caller, not mailed to a seat; the next prompt carries its consequence (state, ids, notices), so there is no line here to quote'
        : (/records|read_library/.test(String(tool))
          ? 'RECORDS_READING_IS_A_TOOL_RESULT: the row list is read by the caller; the next prompt shows the derived status line, not the record text'
          : 'STATE_WRITE_HAS_NO_PROMPT_LINE: this call wrote state (ids, revision, status) that the next prompt renders as consequences, not as a quote of the receipt')
    }
    push({
      step: seq, receiptSeq: seq, tool, caller, ...seatFieldsOf(caller, prompt), kind: kindOf(),
      args: r.args === undefined ? null : r.args,
      named: Boolean(receipt && typeof receipt.code === 'string' && receipt.code !== ''),
      hasHint: Boolean(receipt && typeof receipt.hint === 'string' && receipt.hint !== ''),
      receipt, receiptStartedAt: call.startedAt === undefined ? null : call.startedAt, receiptEndedAt: call.endedAt === undefined ? null : call.endedAt,
      delivery: null,
      receiptText: rendered ? rendered.receiptText : null,
      receiptSpan: rendered ? { start: rendered.start, end: rendered.end } : null,
      containsReceipt: rendered !== null,
      truncated: rendered ? rendered.truncated : false,
      excerptLen: rendered ? rendered.excerptLen : 0,
      foundAs: null,
      matchedBy, matchedToken, reason, nextPrompt,
    })
  }
  // ---- write: one JSONL line per pair, one prompt file per pair (so the count is comparable three ways) ----
  const pairDir = join(outDir, 'pairs')
  mkdirSync(pairDir, { recursive: true })
  const names = []
  for (const row of rows) {
    const seat = String((row.nextPrompt && row.nextPrompt.member) || row.caller || 'none').replace(/[^A-Za-z0-9._-]/g, '_')
    const name = String(row.pairIndex).padStart(2, '0') + '-' + seat + '.txt'
    writeFileSync(join(pairDir, name), row.nextPrompt ? row.nextPrompt.text : '')
    names.push(name)
  }
  writeFileSync(join(outDir, 'pairs.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
  // The unpaired rate is measured from the corpus, and the gate's threshold is measured + 5%: a number chosen first and
  // fitted afterwards would hide exactly the regression this corpus exists to catch.
  const withPrompt = rows.filter((row) => row.nextPrompt !== null).length
  const contains = rows.filter((row) => row.nextPrompt !== null && row.nextPrompt.containsReceipt).length
  const unpaired = unpairedSeqs.length
  const measuredRate = receipts.length === 0 ? 0 : Math.round((unpaired / receipts.length) * 10000) / 10000
  const threshold = Math.round((measuredRate + 0.05) * 10000) / 10000
  const meta = {
    rows: rows.length,
    files: names.length,
    receipts: receipts.length,
    withPrompt,
    containsReceipt: contains,
    unpaired,
    unpairedSeqs,
    measuredRate,
    threshold,
    thresholdSetBy: 'measured+5%',
    kinds: kindCounts,
    classes,
    deliveryEvents: (Array.isArray(h.mail) ? h.mail.length : 0),
    deliveryRows: rows.filter((row) => row.kind === 'delivery').length,
    spanNotFound,
    unnamedPairs: unnamed,
    // A refusal whose code is named but whose hint is missing is not a pairing defect (the receipt stays in the tool
    // result by design); it is a COVERAGE TEST. The count is published so the gate can assert either "this corpus has
    // none" or "every one of them has its own row, in the refusalNoHint class" without inventing a threshold.
    refusalNoHint: classes.refusalNoHint,
    refusalNoHintMeans: classes.refusalNoHint === 0
      ? 'no hint-less named refusal occurs in this corpus'
      : 'a named refusal whose receipt carries no hint: the code names the fact, the missing hint is the reader gap, and each one owns a row in the refusalNoHint class',
    selfSufficient: {
      promptSha256Rows: rows.filter((row) => row.nextPrompt && typeof row.nextPrompt.sha256 === 'string').length,
      means: 'pairs.jsonl is judged ALONE: every row carries the complete prompt text and its sha256, so sha256(text) and text.slice(receiptSpan) can be re-derived from this one file; the pairs/*.txt copies are convenience, not the proof',
    },
    means: 'one row = one receipt x the complete prompt the same seat read next; the join is measured (mailbox diff names who received which mail id, notice capture names which lines the renderer got, the call/assembly clock proves order), and receiptText is a byte-exact slice of the prompt file (receiptSpan) or null with a named reason',
  }
  return { rows, names, meta }
}

async function main() {
  const loader = SCENARIOS[scenario]
  if (!loader) {
    console.error('unknown scenario: ' + scenario + ' (known: ' + Object.keys(SCENARIOS).join(', ') + ')')
    process.exit(2)
  }
  const loaded = await loader()
  const outDir = opt('out', loaded.corpusDir || join('D:/_tmp/sim', 'corpus-' + scenario + '-' + stamp)) // PORTABLE-ALLOW: dev corpus output default; overridable with --out (or exported corpusDir), and an unwritable dir FAILS the run
  mkdirSync(outDir, { recursive: true })
  // ★ TB-2648 §7 MIXED-GEN — A REGENERATION STARTS FROM EMPTY, NOT FROM "WRITE THE PARTS THAT CHANGED". Each run writes
  // a self-consistent set of files (receipts, prompts, pairs, manifest) and the mixed-generation criterion compares the
  // manifest's digests against the bytes on disk. That criterion can only hold if stale files from the PREVIOUS run are
  // gone: a `prompts/09-chair.txt` the current run no longer assembles would survive a naive overwrite, stay in the
  // prompts digest, and make the very next comparison describe two runs at once. So the artifacts this runner owns are
  // removed up front; anything else in the directory is somebody else's and is left alone.
  for (const artifact of ['manifest.json', 'receipts.jsonl', 'prompts.jsonl', 'pairs.jsonl', 'tree.json', 'REPORT.md', 'prompts', 'pairs', 'steps']) {
    rmSync(join(outDir, artifact), { recursive: true, force: true })
  }
  const run = loaded.fn
  const h = await boot({
    root,
    clock: loaded.clock || undefined,
    settings: Object.keys(loaded.settings || {}).length > 0 ? loaded.settings : null,
    deliver: loaded.deliver,
  })
  const corpus = corpusAt(outDir)
  const result = await run(h, { log: (m) => console.log('  · ' + m) })

  corpus.manifest({
    scenario,
    startedAt: stamp,
    root,
    tools: h.names(),
    steps: result.steps.length,
    receipts: result.receipts.length,
    prompts: h.prompts.length,
    // The DECLARATION has to reach the corpus, or the audit cannot tell a predicted refusal from an unpredicted one and
    // reports both as defects (found by `scripts/sim/scenarios/comms.mjs`: 5 expected refusals, 5 A1 findings).
    expectedRefusals: Array.isArray(result.expectedRefusals) ? result.expectedRefusals : [],
  })
  corpus.receipts(result.receipts)
  corpus.prompts(h.prompts)
  corpus.tree(result.tree)
  corpus.step('highlights', result.highlights)
  // ★ RUN 240 — the STEPS have to be machine-readable, not only a markdown table. The coverage gate proves "every one of
  // the 93 rules is exercised by a real scenario step"; it can only do that if the corpus says which steps ran and
  // whether each one was allowed or refused. Reading names back out of REPORT.md would make the gate a parser of prose.
  corpus.step('steps', { scenario, steps: result.steps })

  // ★ TB-2601 — a scenario may hand back PROMPT FILES: one file per prompt it assembled, named `<seq>-<seat>.txt`, plus
  // the pairing metadata (which receipt the text was assembled AFTER, and which ids of that receipt the text actually
  // shows). `prompts.jsonl` already holds the text, but the thing a human audits is "the prompt turn N read, next to the
  // receipt turn N-1 wrote" — and a JSONL line is not a file an editor can diff or a reviewer can open. The gate reads
  // `steps/promptPairs.json`, so the pairing is machine-checkable instead of being asserted in prose.
  const promptFiles = Array.isArray(result.promptFiles) ? result.promptFiles : []
  if (promptFiles.length > 0) {
    const promptDir = join(outDir, 'prompts')
    mkdirSync(promptDir, { recursive: true })
    const written = []
    for (const f of promptFiles) {
      const name = String((f && f.name) || '').replace(/[^A-Za-z0-9._-]/g, '_') || 'prompt.txt'
      const text = String(f && f.text !== undefined && f.text !== null ? f.text : '')
      writeFileSync(join(promptDir, name), text)
      const meta = Object.assign({}, f)
      delete meta.text
      written.push(Object.assign(meta, {
        name,
        path: 'prompts/' + name,
        bytes: Buffer.byteLength(text),
        sha256: 'sha256:' + createHash('sha256').update(text).digest('hex'),
      }))
    }
    corpus.step('promptPairs', { scenario, files: written })
  }

  // ★ TB-2602 — THE PAIR CORPUS. Everything above is written BEFORE this point on purpose: a pair corpus that fails to
  // build must not be able to eat the receipts it was supposed to pair. `buildPairs` only reads `h` (mailbox diff,
  // notice capture, the one clock) and writes `pairs.jsonl` + `pairs/<n>-<seat>.txt`, so it cannot change any verdict
  // this run already reached.
  const pairs = buildPairs(h, outDir)

  // A refusal is not automatically a defect: a scripted, in-process run has no LaTeX/Lean executor and no model, so
  // "this assembly cannot compile a PDF" is an ENVIRONMENT fact here. Those are counted separately and never fail the
  // run — anything else is a mechanism refusal and does fail it.
  const ENVIRONMENTAL = ['VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING', 'VMU_ENGINE_UNAVAILABLE']
  // Internal store churn is never library content: a `vmu/state.json.<pid>.<ts>.tmp` (renamed away by the next flush)
  // and `vmu/state.json.lock` (held while the store is open) exist at one instant and not the next. Both the REPORT
  // and tree.json drop them by PATTERN (never by name) so a future temp file is covered too.
  const VOLATILE = /(^|\/)(state\.json\.lock|state\.json\.[^/]*\.tmp)$/
  // A scenario that exercises a REFUSAL has to be able to say so, or every honest scenario about "this contradiction
  // must be refused" fails the runner and the pressure is to stop testing refusals. `expectedRefusals` is that
  // declaration: `{ tool, code, seq? }` entries the scenario PREDICTED. A predicted refusal still appears in the report
  // with its code and hint (it is evidence); it is just not counted as a mechanism defect.
  // ★ TB-2625/rev4 - ONE PREDICTION FORGIVES EXACTLY ONE REFUSAL. The old matcher was a PREDICATE
  // (`expected.some(...)`), so one blanket `{ tool, code }` entry forgave EVERY later refusal of that tool+code,
  // including the ones the scenario produced by accident. Measured: `scripts/sim/scenarios/actions-extra.mjs` declared
  // `expect('vibe_v5_blueprint', 'VMU_INVALID_ARGUMENT')` for a missing-argument probe and that one entry also excused
  // `#15 blueprint/adopt` - a genuine fs-first drift - so the scenario stayed green while its blueprint chain was
  // broken. The ledger is now CONSUMED: each entry can excuse one refusal. An exact `seq` match wins; an entry without
  // `seq` is consumed in ORDER (kept so the scenarios that have not pinned seqs yet keep their meaning) and the runner
  // records the seq it was consumed at, so the pairing stays nameable in the report. What is left is honest:
  //   - `pinned`   : the entry named this seq.
  //   - `inferred` : an unpinned entry was consumed here (nameable via the seq recorded here, but not pre-named).
  //   - `advisory` : a PREDICTION THAT WAS ALREADY CONSUMED would have matched - i.e. this refusal was forgiven by
  //                  generalization. Non-empty means the scenario is NOT green: the headline says `advisory: N`.
  //   - `unpredicted`: nothing in the ledger fits at all - a mechanism defect like any other.
  const expected = Array.isArray(result.expectedRefusals) ? result.expectedRefusals : []
  const allRefused = result.receipts.filter((r) => r.receipt && r.receipt.ok === false)
  // ★ TB-2656 (MEASURED): an ENVIRONMENT refusal can still be PREDICTED. Before this, environmental refusals were
  // filtered out of the candidate set, so a scenario that honestly declared "this deployment has no engine, so this
  // call refuses VMU_ENGINE_UNAVAILABLE" always ended with `declared-but-never-hit: 2` - the declaration could never be
  // consumed, and the number told a reviewer the scenario had a stale prediction. Now every refusal is a candidate; a
  // prediction may name an environmental one, and the environmental bucket counts only the ones NOBODY predicted (the
  // ones that are still just facts about this assembly). Unmatched environmental refusals never fail the run.
  const envOf = (r) => ENVIRONMENTAL.includes(r.receipt && r.receipt.code)
  const candidates = allRefused
  const codeOf = (r) => (r.receipt && r.receipt.code) || null
  const fitsRefusal = (e, r) => (!e.tool || e.tool === r.tool) && (!e.code || e.code === codeOf(r))
  const ledger = expected.map((e) => ({ e, usedAt: null }))
  const matched = []
  const advisoryMatches = []
  const refused = []
  for (const r of candidates) {
    // A seq pin must ALSO agree on the code it declared: a drifted seq number must never forgive a DIFFERENT refusal
    // (that would turn a stale number into a fresh pardon, which is the defect this ledger exists to remove).
    let slot = ledger.find((x) => x.usedAt === null && Number.isInteger(x.e.seq) && x.e.seq === r.seq && (!x.e.code || x.e.code === codeOf(r)))
    if (slot) matched.push({ seq: r.seq, tool: r.tool, code: codeOf(r), via: 'seq' })
    else {
      slot = ledger.find((x) => x.usedAt === null && fitsRefusal(x.e, r))
      if (slot) matched.push({ seq: r.seq, tool: r.tool, code: codeOf(r), via: 'order', entry: { tool: slot.e.tool || null, code: slot.e.code || null } })
      else if (envOf(r)) {
        // An environmental refusal with no prediction is a fact about the assembly, not a mechanism defect: it is
        // counted in the `environmental` bucket below and never fails the run.
      } else if (expected.some((e) => fitsRefusal(e, r))) {
        // A prediction of this shape exists - it was just spent on an earlier refusal. Forgiveness by generalization,
        // reported separately and NOT green.
        advisoryMatches.push({ seq: r.seq, tool: r.tool, code: codeOf(r), means: 'a prediction of this tool+code existed but was already consumed by an earlier refusal' })
        refused.push(r)
      } else {
        refused.push(r)
      }
    }
    if (slot) slot.usedAt = r.seq
  }
  const environmental = allRefused.filter((r) => envOf(r) && !matched.some((m) => m.seq === r.seq))
  const unpredicted = refused.filter((r) => !advisoryMatches.some((a) => a.seq === r.seq))
  const expectedHere = allRefused.filter((r) => matched.some((m) => m.seq === r.seq))
  const unfired = ledger.filter((x) => x.usedAt === null).map((x) => ({ tool: x.e.tool || null, code: x.e.code || null, seq: Number.isInteger(x.e.seq) ? x.e.seq : null }))
  // ★ TB-2625 — A SCENARIO'S OWN CONTRACT CHECK HAS TO BE ABLE TO TURN THE RUN RED BY NAME. `failures` is the
  // counterpart of `expectedRefusals`: the scenario declares the checks it made on a receipt SHAPE (not on a refusal),
  // and a non-empty list is a mechanism failure even though every call answered `ok:true` — e.g. "blueprint propose
  // stopped filing a draft" (filed:false, id:null), where the only damage is a missing id the next step would use. A
  // check that lives only in the scenario's comment is not a check: this is what carries it into the report and the
  // exit code. Empty for every scenario that does not self-check.
  const selfFailures = Array.isArray(result.failures) ? result.failures : []
  // ★ TB-2625 — THE HOOK'S OWN PROOF (`SIM_SELFTEST_FAILURE=CODE`). A hook that has never carried a failure into the
  // exit code is a claim, not a mechanism. This environment variable appends ONE synthetic failure to whatever the
  // scenario reported, so a test can prove IN A SUBPROCESS that a non-empty `failures` really reaches the report
  // headline and the exit code. It is an env var, not a flag, on purpose: nobody types it by accident and it cannot
  // become part of a normal command line that later gets copied into CI. It can only ever ADD a failure - it cannot
  // hide a real one - and it names no scenario: the variable means the same thing for every scenario file.
  const injectedFailure = String(process.env.SIM_SELFTEST_FAILURE || '').trim()
  if (injectedFailure !== '') {
    selfFailures.push({
      code: injectedFailure,
      step: 'selftest',
      message: 'injected by SIM_SELFTEST_FAILURE: this run exists to prove a scenario self-check turns the run red',
      means: 'the runner reads result.failures and fails the run on a non-empty list, report headline and exit code included',
    })
  }
  const report = [
    '# sim report — ' + scenario,
    '',
    '- workspace: `' + root + '`' + (keep ? ' (kept)' : ''),
    '- tools registered: ' + h.names().length,
    '- steps: ' + result.steps.length + ', tool calls: ' + result.receipts.length + ', prompts assembled: ' + h.prompts.length,
    '- refusals: ' + allRefused.length + ' (' + refused.length + ' mechanism · ' + expectedHere.length + ' expected · ' + environmental.length + ' environmental)',
    // ★ TB-2625/rev4 - THE HEADLINE HAS TO SAY WHEN A PREDICTION WAS STRETCHED. `pinned` was named by seq, `inferred`
    // was consumed in order, `advisory` was forgiven by a prediction already spent (not green), `unfired` was declared
    // and never happened (allowed: a probe may not reach the branch under this assembly). A run with advisory > 0 is
    // still red below, so this line is a diagnosis, not a softener.
    '- predicted refusals: ' + matched.filter((m) => m.via === 'seq').length + ' pinned by seq · ' + matched.filter((m) => m.via === 'order').length + ' matched in order · advisory: ' + advisoryMatches.length + ' · unpredicted: ' + unpredicted.length + ' · declared-but-never-hit: ' + unfired.length,
    '- scenario self-checks: ' + (selfFailures.length === 0 ? 'ok' : selfFailures.length + ' FAILED'),
    '',
    '## steps',
    '',
    '| step | ok | code | files before → after |',
    '| --- | --- | --- | --- |',
    ...result.steps.map((s) => '| ' + s.name + ' | ' + (s.ok ? 'ok' : 'REFUSED') + ' | ' + (s.code || '') + ' | ' + s.files.before + ' → ' + s.files.after + ' |'),
    '',
    '## prompt sizes (chars)',
    '',
    Object.entries(result.promptChars || {}).map(([k, v]) => '- ' + k + ': ' + v).join('\n'),
    '',
    // ★ TB-2601 — a lifetime scenario explains ITSELF: one block per step with the action, the receipt keys that moved,
    // the verdict, and the id the NEXT step took from this receipt. Generic tables cannot say "the meeting id used by
    // attend came from the schedule receipt", and that provenance is the whole point of an end-to-end corpus.
    ...(Array.isArray(result.reportLines) && result.reportLines.length > 0
      ? ['## steps (action -> receipt -> verdict -> what the next step cited)', '', ...result.reportLines, '']
      : []),
    '## refused calls (the audit reads these)',
    '',
    refused.length === 0 ? '(none)' : refused.map((r) => '- #' + r.seq + ' ' + r.tool + ' → `' + (r.receipt.code || 'refused') + '` — ' + String(r.receipt.message || r.receipt.hint || '').slice(0, 300)).join('\n'),
    '',
    '## refusals the scenario PREDICTED (evidence, not defects)',
    '',
    expectedHere.length === 0 ? '(none)' : expectedHere.map((r) => {
      const m = matched.find((x) => x.seq === r.seq) || {}
      return '- #' + r.seq + ' ' + r.tool + ' -> ' + String(r.receipt.code || 'refused') + ' [' + (m.via === 'seq' ? 'predicted by seq' : 'matched in order against an unpinned prediction') + '] -- ' + String(r.receipt.message || r.receipt.hint || '').slice(0, 300)
    }).join(String.fromCharCode(10)),
    '',
    '## advisory matches (a spent prediction kept forgiving - `advisory: 0` is the only green value)',
    '',
    advisoryMatches.length === 0 ? '(none)' : advisoryMatches.map((a) => '- #' + a.seq + ' ' + a.tool + ' -> `' + String(a.code || 'refused') + '` -- ' + a.means + '; pin the prediction to this seq (or add a second identical prediction) if it is genuinely expected').join(String.fromCharCode(10)),
    '',
    '## scenario self-checks (a failed one fails the run, it is not advice)',
    '',
    selfFailures.length === 0 ? '(none)' : selfFailures.map((f) => '- `' + String(f.code || 'SELF_CHECK') + '` at `' + String(f.step || '?') + '` — ' + String(f.message || '') + (f.means ? ' — ' + String(f.means) : '') + (f.receipt ? ' — receipt: `' + JSON.stringify(f.receipt).slice(0, 400) + '`' : '')).join(String.fromCharCode(10)),
    '',
    '## files produced',
    '',
    ...(function () {
      const visible = result.tree.filter((f) => !VOLATILE.test(String(f.path).replace(/\\/g, '/')))
      return visible.length === 0 ? '(empty)' : visible.map((f) => '- `' + f.path + '` — ' + f.bytes + ' B')
    })(),
    '',
    // ★ TB-2602 — the pair table. Whoever audits "did the model see this?" should not have to open a JSONL by hand: the
    // report lists, per pair, which receipt, which seat/assembly read it, and whether the receipt text is a slice of
    // that prompt (span) or carries a named reason for being absent. `pairs.jsonl` holds the full text.
    '## pairs (receipt -> the complete prompt the same seat read next)',
    '',
    '- pairs: ' + pairs.meta.rows + ' rows for ' + pairs.meta.receipts + ' receipts · with a prompt after them: ' + pairs.meta.withPrompt + ' · receipt text located inside that prompt: ' + pairs.meta.containsReceipt + ' · unpaired: ' + pairs.meta.unpaired + ' (rate ' + pairs.meta.measuredRate + ', threshold ' + pairs.meta.threshold + ' = ' + pairs.meta.thresholdSetBy + ')',
    '- kinds: ' + Object.keys(pairs.meta.kinds).map((k) => k + ' ' + pairs.meta.kinds[k]).join(' · '),
    '- span not found: ' + pairs.meta.spanNotFound.length + ' · pairs missing a named reason: ' + pairs.meta.unnamedPairs.length,
    '',
    '| pair | # | tool | kind | seat/assembly | prompt chars | in prompt | span |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...pairs.rows.map((row) => '| ' + row.pairIndex + ' | ' + row.step + ' | ' + String(row.tool) + ' | ' + row.kind + ' | ' + (row.nextPrompt ? String(row.nextPrompt.member) + ' / #' + row.nextPrompt.assembly + ' ' + row.nextPrompt.phase : '(none)') + ' | ' + (row.nextPrompt ? row.nextPrompt.chars : 0) + ' | ' + (row.containsReceipt ? 'yes' : 'no — ' + String(row.reason || 'UNNAMED').split(':')[0]) + ' | ' + (row.receiptSpan ? row.receiptSpan.start + '..' + row.receiptSpan.end : '-') + ' |'),
    '',
  ].join('\n')
  writeFileSync(join(outDir, 'REPORT.md'), report)
  // ★ TB-2648 §7 MIXED-GEN — THE GENERATION STAMP. Everything above writes files; this block records the BYTES it just
  // wrote, so a reader can prove later that `receipts.jsonl`, `pairs.jsonl` and `prompts/` all belong to one run. The
  // digest definitions live in `corpus-stamp.mjs` and are imported by the criterion, not re-implemented here: two
  // formulas for "the generation" would drift, and the drift would look exactly like a mixed corpus.
  const generation = {
    receipts: stampFile(join(outDir, 'receipts.jsonl')),
    pairs: stampFile(join(outDir, 'pairs.jsonl')),
    prompts: stampPrompts(join(outDir, 'prompts')),
    report: stampFile(join(outDir, 'REPORT.md')),
  }
  corpus.manifest({
    scenario,
    startedAt: stamp,
    generatedAt: new Date().toISOString(),
    promptsSha256: generation.prompts.sha256,
    files: {
      receipts: { lines: generation.receipts.lines, bytes: generation.receipts.bytes, sha256: generation.receipts.sha256 },
      pairs: { lines: generation.pairs.lines, bytes: generation.pairs.bytes, sha256: generation.pairs.sha256 },
      prompts: { count: generation.prompts.count, sha256: generation.prompts.sha256 },
      report: { bytes: generation.report.bytes, sha256: generation.report.sha256 },
    },
    root,
    tools: h.names(),
    steps: result.steps.length,
    receipts: result.receipts.length,
    prompts: h.prompts.length,
    expectedRefusals: expected,
    expectedMatched: matched.map((m) => ({ seq: m.seq, tool: m.tool, code: m.code || null, via: m.via, entry: m.entry || null })),
    // ★ TB-2625/rev4 - refusals forgiven by a prediction that had ALREADY been spent. Zero is the only healthy value:
    // a non-empty list means the ledger hid a second refusal behind the first one, and the scenario is not green.
    advisoryMatches: advisoryMatches.map((a) => ({ seq: a.seq, tool: a.tool, code: a.code || null, means: a.means })),
    unpredictedRefusals: unpredicted.map((r) => ({ seq: r.seq, tool: r.tool, code: codeOf(r) })),
    expectedUnfired: unfired,
    refusals: {
      total: allRefused.length,
      mechanism: refused.length,
      expected: expectedHere.length,
      environmental: environmental.length,
      advisory: advisoryMatches.length,
      pinned: matched.filter((m) => m.via === 'seq').length,
      inferred: matched.filter((m) => m.via === 'order').length,
    },
    selfChecks: { failed: selfFailures.length, codes: selfFailures.map((f) => f.code || 'SELF_CHECK') },
    // ★ TB-2602 — the pair corpus as a MANIFEST fact, not a directory a reader has to discover: row count, the three-way
    // count the gate compares (jsonl lines · meta.rows · files on disk), the measured rate and the threshold that was
    // derived from it, and the named reasons a receipt can legitimately be absent from the prompt channel.
    pairs: pairs.meta,
  })
  // ★ TB-2648 §7 MIXED-GEN — THE GENERATOR MUST PASS ITS OWN CRITERION. A stamped manifest proves nothing if the
  // generator can write bytes the criterion would reject (a concurrent second run into the same directory, a partially
  // written prompts/ set): the suite reading this corpus would then go red with `MIXED-GEN CORPUS` and the honest
  // reading would be "the corpus generation is broken", not "the suite is wrong". Verifying here turns that into the
  // run's own exit code, at the moment the bytes are still fresh.
  const generationCheck = checkCorpus(outDir)
  if (!generationCheck.ok) console.error('\n' + generationCheck.message)

  console.log('\n' + report.split('\n').slice(0, 12).join('\n'))
  console.log('\ncorpus: ' + outDir)
  // ★ RUN 226 / task-15 — A CLEAN EXIT IS PART OF THE MECHANISM, NOT A DETAIL AFTER IT. This script used to end with
  // `process.exit()`, which killed the process while fire-and-forget writes were still in flight: the store's
  // `persist()` builds a temp file (`kernel/store.js:178`) and renames it, and `kernel/idempotency.js` queues ledger
  // writes with `store.patch()` without awaiting them. A `process.exit()` between writeFile and rename leaves a
  // ZERO-BYTE `vmu/state.json.<pid>.<ts>.tmp` behind — an orphan that looks like corruption and is really a truncated
  // exit. So the exit now goes THROUGH the entry's own teardown (`handle.cleanups`, whose cleanup awaits
  // `kernel.shutdown()`: it waits for in-flight state writes and flushes the journals), and the workspace is removed
  // unless the operator asked to keep it.
  try {
    const cleanups = h.handle && Array.isArray(h.handle.cleanups) ? h.handle.cleanups : []
    await Promise.all(cleanups.map(async (c) => { try { return await c() } catch { return null } }))
  } catch { /* teardown must never turn a finished run red */ }
  // ★ TB-2601 — tree.json HAS TO DESCRIBE THE WORKSPACE AS IT IS AFTER TEARDOWN. The store writes with a
  // fire-and-forget `persist()` (kernel/store.js builds `vmu/state.json.<pid>.<ts>.tmp` and renames it), so a snapshot
  // taken at scenario end can list a temp file that is gone by the time a reader compares, or hold pre-flush bytes of
  // `vmu/state.json`. A gate that re-hashes every file then reports "corpus disagrees with disk" — a false corruption
  // report that would train the reader to ignore the one comparison that matters. Re-snapshot after the entry's own
  // teardown, which awaits `kernel.shutdown()` and flushes those writes.
  // Two paths in that tree are INTERNAL CHURN, not library content: `vmu/state.json.<pid>.<ts>.tmp` (a store temp
  // file, renamed away by the next flush) and `vmu/state.json.lock` (held while the store is open, removed when it
  // closes). They exist at one instant and not the next, so carrying them into tree.json makes the corpus disagree
  // with disk for reasons that have nothing to do with the run, and a gate that compares hashes would report a false
  // corruption. Dropped by the `VOLATILE` pattern above.
  try {
    const after = h.tree().filter((f) => !VOLATILE.test(String(f.path).replace(/\\/g, '/')))
    corpus.tree(after)
  } catch { /* a snapshot failure must not fail an otherwise complete run */ }
  if (keep || explicitRoot) {
    // Kept for inspection when asked for explicitly: a human can read the files the run produced.
    console.log('workspace kept for inspection: ' + root)
  } else {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* an undeletable temp dir is not a mechanism defect */ }
    console.log('workspace removed (pass --keep to inspect the files): ' + root)
  }
  process.exitCode = refused.length === 0 && advisoryMatches.length === 0 && selfFailures.length === 0 && generationCheck.ok ? 0 : 1
}

main().catch((e) => {
  console.error('sim failed: ' + ((e && e.stack) || e))
  process.exit(1)
})
