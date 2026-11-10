#!/usr/bin/env node
// tests/audit-prompt-names.mjs — TB-2678: every name a prompt names must really exist.
//
// The prompts are prose assembled at runtime. A prompt can name a tool, a parameter, an enum value or a receipt
// field that does not exist; the reader then follows it and hits a wall, and NOTHING goes red (prompt tests pin
// sentences, not the truth of the names inside them). TB-2652 fixed this for refusal HINTS (which appear only AFTER
// a refusal); this checker does the same for the prompt BODY (which appears BEFORE any refusal).
//
// LIVE SOURCES, never hand-copied:
//   tools / params / enums : the real published specs, captured from the entry point's `ctx.tools.register()`
//                            (scripts/sim/harness.mjs#boot does exactly that, and it is the same registry the model
//                            is handed) — `parameters.properties` and `parameters.properties[k].enum`.
//   receipt fields         : <SIM_ROOT>/real-fieldset.json (field sets captured from REAL receipts). A missing file
//                            is a FAILURE, never a skip (TB-2659).
//   settings keys          : vibe-math-vmu/settings/schema.js `key: 'vmu.…'` (last segment is the name prompts use),
//                            plus each entry's `domain: [...]` as enum values.
//   enum values            : spec enums + settings domains + comparison/array string literals in kernel/packs source.
//   variables / locals     : identifiers and quoted string values in kernel/packs/middleware source (comments stripped).
//
// SCAN TARGET: the ASSEMBLED text for the three seats (scripts/sim/harness.mjs prompts.assembleFor), not source
// literals — the prompt is concatenated, so a source fragment may never appear in the finished product.
//
// EXTRACTION (deliberately narrow: a missed report is cheap, a false positive forces us to edit correct prose):
//   tool    any  \bvibe_(vmu|v5)_[a-z_]+\b  in the assembled text (a trailing `*` is a FAMILY: prefix must match)
//   param   only inside a backticked span that names EXACTLY ONE tool, from `key:` / `key: value` / `key=value`
//   enum    only inside such a span, from `key:"value"` / `key:'value'` when key is a parameter with an enum
//   ident   only backticked bare identifiers / `key:` names, then CLASSIFIED (see below) — never compared with one
//           flat list, because a prompt legitimately names four different KINDS of thing.
//
// FOUR-CLASS VERDICT (lead m07770): a whitelist can only excuse a name once; classification gives every name a
// living table of its own, so a new name must enter the corpus, the settings table, or be a real variable — it can
// never pass by being added to a list.
//   RECEIPT_KEY   in the captured corpus .......................... pass
//                 only used as an object key / local in source .... WARN coverage-gap (corpus gap, NOT a prompt bug)
//   SETTINGS_KEY  in settings/schema.js key table ................. pass
//   ENUM_VALUE    in a spec enum / settings domain / source literal  pass
//   VARIABLE      appears in kernel/packs source as identifier or string value  pass
//   unclassified  none of the above .............................. WARN unclassified (listed, no judgement)
//
// FIFTH CLASS (lead m08032): TAUGHT-READING — a prompt sentence that CLAIMS a name is readable ("X 是具名读数",
// "回执里 `X`", "看 `X` ... "). The four classes above ask "does this name exist somewhere in the repo", which is
// exactly the blind spot: a view-internal identifier is a real VARIABLE and still can never appear in a receipt.
// So every claimed reading must be found in the real-machine fieldset ∪ the sim corpus receipts; a name with no
// receipt and no MEASURED producer is a BLOCKER that quotes the prompt sentence. A name that has a producer but
// whose op the harvest never reached is a WARN taught-reading-gap (corpus debt, not a prompt bug).
//
// VERDICTS: UNKNOWN_TOOL / UNKNOWN_PARAM / TAUGHT_READING are BLOCKERS (exit 1); everything else is WARN (listed, exit stays 0).
// `--self-check` (alias `--self-test`, the spelling `tests/audit-scanner-selfproof.test.mjs` detects) runs the scanner
// over synthetic texts with synthetic source tables and fails if an injected fake name is missed OR a classified name
// is misclassified — the "must be able to go red" proof kept inside the file, so a "0 BLOCKERS" verdict is
// distinguishable from a predicate that never fired.

import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const flag = (name) => argv.indexOf(name) >= 0
const valueOf = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt }

// PORTABLE-ALLOW: default dev corpus root; overridable via VMU_SIM_ROOT / --fieldset, and a missing corpus FAILS the suite (never skips)
const SIM_ROOT = process.env.VMU_SIM_ROOT || 'D:/_tmp/sim' // PORTABLE-ALLOW: default dev corpus root; VMU_SIM_ROOT or --fieldset overrides it, and a missing corpus fails the suite
const FIELDSET = valueOf('--fieldset', join(SIM_ROOT, 'real-fieldset.json'))
const DEFAULT_CORPUS = join(SIM_ROOT, 'e2e')
const SELF_CHECK = flag('--self-check') || flag('--self-test')
const JSON_OUT = flag('--json')

const fail = (msg) => { console.error('FAIL ' + msg); process.exitCode = 1 }
const backtickRe = /`([^`\n]{1,120})`/g
const STOPWORDS = /^(true|false|null|undefined|and|the|for|with|from|into|not|you|any|all|one|two|see|this|that|then|than|let|use|via|per|yes|no)$/

// ★ TB-2678 second pass / lead m07873-①: A COVERAGE-GAP WARN MUST NAME ITS PRODUCER. "source has the key, the captured
// corpus does not" hides two very different facts: (a) the harvest simply never reached that op/state => corpus debt,
// (b) the kernel READS that name but never WRITES it into any receipt => the prompt teaches a field the member can
// never see = a dead name. Only a line per key can tell them apart, so every coverage-gap name below carries
// { producedBy, simProduced, evidence }. simProduced was measured by driving the real simulator
// (a local probe run), NOT by reading code.
// A coverage-gap name missing from this table (or with an empty producedBy) is promoted to BLOCKER: otherwise the
// WARN would become a permanent exemption that nobody ever revisits.
const COVERAGE_GAP_PROVENANCE = {
  satisfiedBy: { producedBy: 'vibe_v5_verdict_final -> receipt.floor.satisfiedBy ; vibe_v5_paper {action:"final"} -> receipt.final.consult.satisfiedBy', simProduced: true, evidence: 'e2e receipts seq24 / seq41' },
  declaredCount: { producedBy: 'vibe_v5_start / vibe_v5_hire -> receipt.memberScope.declaredCount', simProduced: true, evidence: 'e2e receipts seq1 / seq2' },
  deliveredTo: { producedBy: 'vibe_v5_say (chair speech, with or without to) -> receipt.deliveredTo', simProduced: true, evidence: 'e2e receipts seq13' },
  deliveryFailed: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.counts.deliveryFailed (1 after a throwing delivery seam)', simProduced: true, evidence: 'sim probe #4 (local run)' },
  ackRequired: { producedBy: 'vibe_vmu_mailbox {action:"status"} -> notice.ackRequired (boolean; the notice object also carries acked, settledBy, unackedRows, unackedRowsAllBoxes, perBox, pendingMembers). Verified by driving the real simulator; task-165/TB-2682 adds the same two keys to each pending/list row', simProduced: true, evidence: 'sim probe: status.notice.ackRequired (live, true with one un-acked DM)', capturedBy: { tool: 'vibe_vmu_mailbox', action: 'status', corpus: 'e2e', scenarioStep: 'mailbox/status' } },
  blockChars: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].notices.blockChars', simProduced: true, evidence: 'sim probe #3 (local run) (43 chars)', capturedBy: { tool: 'vibe_vmu_turn', action: 'status', corpus: 'e2e', scenarioStep: 'turn/status' } },
  excerptLen: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].excerptLen (2000 when the reply was cut)', simProduced: true, evidence: 'sim probe #3 (local run)' },
  replyFullPath: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].replyFullPath (Members/<id>/Turns/<turn>.md)', simProduced: true, evidence: 'sim probe #3 (local run)' },
  replyFullSha256: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].replyFullSha256', simProduced: true, evidence: 'sim probe #3 (local run)' },
  replyFullBytes: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].replyFullBytes', simProduced: true, evidence: 'sim probe #3 (local run) (7800)' },
  turnInFlightMeans: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnLoop.turnInFlightMeans', simProduced: true, evidence: 'sim probe #2 (local run)' },
  inFlightMember: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnLoop.inFlightMember', simProduced: true, evidence: 'sim probe #2 (local run) (r-1)' },
  inFlightOpenedBy: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnLoop.inFlightOpenedBy', simProduced: true, evidence: 'sim probe #2 (local run) (drive)' },
  inFlightForMs: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnLoop.inFlightForMs', simProduced: true, evidence: 'sim probe #2 (local run)' },
  recentAbandonments: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnLoop.recentAbandonments (non-empty after op:"abandon")', simProduced: true, evidence: 'sim probe #4 (local run)' },
  // ★ RUN 269 (TB-2691 / TB-2707 / TB-2692 / TB-2691): the four sentences added this round teach read-back facts that the
  // e2e harvest has not reached yet. Each row names the ONE place that writes the name, so a future reader can tell a
  // corpus gap from a name the member can never see.
  pdfBytes: { producedBy: 'vibe_v5_paper {action:"render"|"final"} -> receipt.pdf.pdfBytes / status.pdfCompiled.pdfBytes (kit/paper.js:1934 writes pdfPath+pdfBytes+pdfSha256 from ONE reading of ONE file)', simProduced: true, evidence: 'sim probe: vibe_v5_paper render receipt .pdf.pdfBytes (RUN 255 harness)' },
  archiveMissing: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].archiveMissing (kernel/turn/index.js:2762 opens the slot null; :2838 sets true from the archive read-back, :2839 false when truncated:true was archived)', simProduced: true, evidence: 'sim probe: turn status row after a truncated reply whose archive read-back failed' },
  replyArchiveWhy: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].replyArchiveWhy (kernel/turn/index.js:2758 slot, :2836 copies the named why; :4941 notes it is null when there is nothing to warn about)', simProduced: true, evidence: 'sim probe: turn status row carries archiveMissing:true + replyArchiveWhy naming the read-back failure' },
  writtenFrom: { producedBy: 'vibe_vmu_records {action:"list"|"get"} -> rows[].writtenFrom (kernel/records.js:656 writtenFromOf; :655 WRITTEN_FROM_MEANS gives own-turn/relayed/unknown; withWriter:false answers writtenFromOmitted:true instead of dropping it)', simProduced: true, evidence: 'sim probe: records list row from a seat own-turn write and from a relayed office write' },
  votesTotal: { producedBy: 'vibe_v5_verdict_final / closure vote -> receipt.closureVote.votesTotal (kernel/turn/index.js:2026 reads it from the closure reading; :2059 prints votesCast/votesTotal/votesFor/votesAgainst/votesUnknown in one tally)', simProduced: true, evidence: 'sim probe: closure vote receipt .closureVote.votesTotal (4 seats enfranchised)' },
}

/** Provenance verdict for a coverage-gap name. Missing/empty producedBy => BLOCKER (no permanent exemptions). */
function coverageGapVerdict(name) {
  const p = COVERAGE_GAP_PROVENANCE[name]
  if (!p || typeof p.producedBy !== 'string' || p.producedBy.trim() === '') {
    return { blocker: true, why: 'coverage-gap WITHOUT a producer (add {producedBy, simProduced, evidence})' }
  }
  return { blocker: false, why: 'produced by ' + p.producedBy + (p.simProduced === true ? ' [simProduced]' : ' [NOT produced by any receipt]') }
}
// TAUGHT-READING provenance measured with the real simulator (a local probe run): a name that the
// status receipt exposes but the e2e harvest never collected. Kept separate from the coverage-gap table because the
// evidence is a receipt KEY PATH, not an object-key sighting in source.
// Every entry below must carry capturedBy {tool, action, corpus, scenarioStep}: the WARN is a receipt with an expiry
// date, not a verdict. An entry whose capturedBy is missing/empty is promoted to BLOCKER (same rule as producedBy).
const TAUGHT_READING_PROVEN = {
  notices: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].notices (object with lines/rendered/blockChars)', simProduced: true, evidence: 'sim probe #4 (local run): notices={"lines":1,"rendered":true,"blockChars":43}', capturedBy: { tool: 'vibe_vmu_turn', action: 'status', corpus: 'e2e', scenarioStep: 'turn/status' } },
  lines: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].notices.lines', simProduced: true, evidence: 'sim probe #4 (local run) (lines=1)' },
  rendered: { producedBy: 'vibe_vmu_turn {op:"status"} -> status.turnReceipts[i].notices.rendered', simProduced: true, evidence: 'sim probe #4 (local run) (rendered=true)', capturedBy: { tool: 'vibe_vmu_turn', action: 'status', corpus: 'e2e', scenarioStep: 'turn/status' } },
}

// Trigger phrases are pinned to the prompt's OWN wording (counted from the assembled seats, not guessed): each
// pattern records how many claims it saw so the report can tell "the phrase is too wide" from "the prompt promises
// too much". Only shapes that assert readability are listed; bare backticked names elsewhere are covered by the
// four classes above.
const READING_PATTERNS = [
  { key: '是具名读数', re: /([^。；\n]{0,220})是\s*具名读数/g, fromSpan: (m) => idsOfSpan(m[1]), quote: (m) => m[1] + '是具名读数' },
  { key: '是小节读数', re: /([^。；\n]{0,220})是\s*小节读数/g, fromSpan: (m) => idsOfSpan(m[1]), quote: (m) => m[1] + '是小节读数' },
  { key: '回执里 X', re: /回执里\s*`([a-z][A-Za-z0-9_]*)`/g, fromSpan: (m) => [m[1]], quote: (m) => m[0] },
  { key: '回执的 X 字段', re: /回执的\s*`([a-z][A-Za-z0-9_]*)`\s*(?:字段|里)/g, fromSpan: (m) => [m[1]], quote: (m) => m[0] },
  { key: '看 X', re: /看\s*`([a-z][A-Za-z0-9_]*)`/g, fromSpan: (m) => [m[1]], quote: (m) => m[0] },
]
const NEGATED_CLAIM = /旧称|不是|旧措辞|不存在/

function idsOfSpan(span) {
  const out = []
  for (const m of span.matchAll(/`([a-z][A-Za-z0-9_]*)`/g)) if (!m[1].startsWith('vibe_')) out.push(m[1])
  return out
}

/** Verdict for a claimed reading: readable now => pass; measured producer => corpus-gap WARN; else BLOCKER. */
function capturedByOk(p) {
  const c = p && p.capturedBy
  return !!c && ['tool', 'action', 'corpus', 'scenarioStep'].every((k) => typeof c[k] === 'string' && c[k].trim() !== '')
}

function readingVerdict(name, readable, proven) {
  if (readable.has(name)) return { verdict: 'pass' }
  const table = proven || { ...TAUGHT_READING_PROVEN, ...COVERAGE_GAP_PROVENANCE }
  const p = table[name]
  if (p && typeof p.producedBy === 'string' && p.producedBy.trim() !== '') {
    if (!capturedByOk(p)) return { verdict: 'blocker', why: 'claimed as readable; a producer exists but capturedBy {tool, action, corpus, scenarioStep} is missing — a WARN without a capture plan is a permanent escape hatch' }
    const c = p.capturedBy
    return { verdict: 'gap', why: 'claimed reading, produced by ' + p.producedBy + ' but absent from the captured corpus; capture plan: ' + c.tool + ' {' + (c.action ? c.action + ':' : '') + '"op"} step ' + c.scenarioStep + ' in corpus ' + c.corpus }
  }
  return { verdict: 'blocker', why: 'claimed as readable but no receipt in fieldset/corpus and no measured producer — the member can never see this name' }
}

const SOURCE_DIRS = ['vibe-math-vmu/kernel', 'vibe-math-vmu/packs/v5r', 'vibe-math-vmu/middleware']

/** Strip block and line comments so that a name mentioned only in prose never counts as a living code name. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function walkSources(dirs, onFile) {
  const walk = (dir) => {
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
    for (const ent of entries) {
      const p = join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (/\.js$/.test(ent.name)) onFile(p, readFileSync(p, 'utf8'))
    }
  }
  for (const d of dirs) walk(d)
}

/** Object keys as written in source — the "coverage gap" second sight of a receipt field. */
function objectKeysOf(srcs) {
  const keys = new Set()
  for (const src of srcs) {
    const code = stripComments(src)
    for (const m of code.matchAll(/(?:^|[\s,{;(])(?:"([A-Za-z_][A-Za-z0-9_]{2,40})"|([A-Za-z_][A-Za-z0-9_]{2,40}))\s*:/gm)) keys.add(m[1] || m[2])
  }
  return keys
}

/** Declared variables and parameters — the VARIABLE/LOCAL class (a prompt naming a local reads source, not receipts). */
function varsOf(srcs) {
  const vars = new Set()
  const add = (list) => { for (const n of list) if (/^[A-Za-z_$][A-Za-z0-9_$]{1,40}$/.test(n)) vars.add(n) }
  for (const src of srcs) {
    const code = stripComments(src)
    for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) add([m[1]])
    for (const m of code.matchAll(/function\s*[A-Za-z0-9_$]*\s*\(([^)]*)\)/g)) add(m[1].split(',').map((x) => x.trim().replace(/=.*$/, '').replace(/[^A-Za-z0-9_$]/g, '')))
    for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) add(m[1].split(',').map((x) => x.trim().replace(/=.*$/, '').replace(/[^A-Za-z0-9_$]/g, '')))
    for (const m of code.matchAll(/\{([^{}]{1,200})\}\s*=/g)) add(m[1].split(',').map((x) => x.trim().split(':')[0].trim().replace(/=.*$/, '')))
  }
  return vars
}

/** Identifiers and string values anywhere in source — a broad last net before unclassified. */
function identsOf(srcs) {
  const ids = new Set()
  for (const src of srcs) {
    const code = stripComments(src)
    for (const m of code.matchAll(/[A-Za-z_][A-Za-z0-9_]{1,40}/g)) ids.add(m[0])
    for (const m of code.matchAll(/'([^'\\\n]{1,40})'|"([^"\\\n]{1,40})"/g)) ids.add(m[1] !== undefined ? m[1] : m[2])
  }
  return ids
}

/** String literals used as enum-ish values (comparisons, switches, includes, frozen arrays). */
function literalsOf(srcs) {
  const vals = new Set()
  for (const src of srcs) {
    const code = stripComments(src)
    for (const m of code.matchAll(/(?:===|!==|==|!=)\s*'([^'\\\n]{1,40})'/g)) vals.add(m[1])
    for (const m of code.matchAll(/\.includes\(\s*'([^'\\\n]{1,40})'/g)) vals.add(m[1])
    for (const m of code.matchAll(/case\s+'([^'\\\n]{1,40})'/g)) vals.add(m[1])
    for (const m of code.matchAll(/Object\.freeze\(\s*\[([^\]]*)\]/g)) {
      for (const s of m[1].matchAll(/'([^'\\\n]{1,40})'/g)) vals.add(s[1])
    }
  }
  return vals
}

/** Settings keys (`vmu.math.leanInitiative` -> `leanInitiative`) and their domains. */
function settingsOf(src) {
  const keys = new Set()
  const domains = new Set()
  for (const m of src.matchAll(/key:\s*'([^']+)'/g)) {
    const parts = m[1].split('.')
    keys.add(parts[parts.length - 1])
  }
  for (const m of src.matchAll(/domain:\s*\[([^\]]*)\]/g)) {
    for (const s of m[1].matchAll(/'([^'\\\n]{1,40})'/g)) domains.add(s[1])
  }
  return { keys, domains }
}

function registryOf(specs, enumWords, enumKeys) {
  const tools = new Map()
  for (const s of specs) {
    if (!s || !s.name) continue
    const props = (s.parameters && s.parameters.properties) || {}
    const params = new Map()
    for (const [k, v] of Object.entries(props)) {
      const enums = v && Array.isArray(v.enum) ? v.enum.map(String) : null
      if (enums) for (const e of enums) { enumWords.add(e); enumKeys.add(e) }
      params.set(k, { enums })
    }
    tools.set(String(s.name), { params })
  }
  return tools
}

function fieldNamesOf(fieldset) {
  const names = new Set()
  for (const [tool, v] of Object.entries(fieldset || {})) {
    if (!v || typeof v !== 'object') continue
    const keys = Array.isArray(v.keys) ? v.keys : Array.isArray(v) ? v : []
    for (const k of keys) names.add(String(k))
  }
  for (const k of ['ok', 'tool', 'code', 'note', 'hint', 'receiptMeta', 'at', 'means', 'why', 'action', 'member', 'id', 'path', 'status']) names.add(k)
  return names
}

/** All tool names mentioned by a text. A trailing `*` marks a family prefix. */
function toolMentions(text) {
  const out = []
  for (const m of text.matchAll(/vibe_(?:vmu|v5)_[a-z_]+/g)) {
    const start = m.index
    const name = m[0]
    let end = start + name.length
    const star = text[end] === '*'
    if (star) end += 1
    out.push({ name: star ? text.slice(start, end) : name, family: star, start, end })
  }
  return out
}

function ctxOf(text, start, end) {
  const a = Math.max(0, start - 20)
  const b = Math.min(text.length, end + 20)
  return text.slice(a, b).replace(/\s+/g, ' ')
}

const emptyClasses = () => ({ RECEIPT_KEY: 0, SETTINGS_KEY: 0, ENUM_VALUE: 0, VARIABLE: 0, unclassified: 0 })

/**
 * @param sources { fields:Set, settingsKeys:Set, enumWords:Set, codeKeys:Set, codeIdents:Set }
 */
function scanText(label, text, reg, sources) {
  const findings = []
  const examined = { tools: 0, params: 0, enums: 0, idents: 0, readings: 0 }
  const classes = emptyClasses()
  const classSeen = { RECEIPT_KEY: new Set(), SETTINGS_KEY: new Set(), ENUM_VALUE: new Set(), VARIABLE: new Set(), unclassified: new Set() }
  const bump = (k, n) => { classes[k]++; classSeen[k].add(n) }
  const mentions = toolMentions(text)
  for (const mt of mentions) {
    if (mt.family) {
      const prefix = mt.name.replace(/\*$/, '')
      const any = [...reg.keys()].some((t) => t.startsWith(prefix))
      if (!any) findings.push({ seat: label, category: 'UNKNOWN_TOOL', name: mt.name, context: ctxOf(text, mt.start, mt.end), note: 'no tool starts with this family prefix' })
      continue
    }
    examined.tools++
    if (!reg.has(mt.name)) findings.push({ seat: label, category: 'UNKNOWN_TOOL', name: mt.name, context: ctxOf(text, mt.start, mt.end), note: 'not in the published tool registry' })
  }

  const mentioned = (span) => toolMentions(span).filter((m) => !m.family && reg.has(m.name)).map((m) => m.name)

  for (const m of text.matchAll(backtickRe)) {
    const span = m[1]
    const spanStart = m.index + 1
    const tools = [...new Set(mentioned(span))]
    // param/enum checks only when the span names exactly one real tool: that is the narrow shape `tool {k:v}`.
    if (tools.length === 1) {
      const tool = tools[0]
      const params = reg.get(tool).params
      for (const kv of span.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,\s}]+))/g)) {
        const key = kv[1]
        const val = kv[2] !== undefined ? kv[2] : kv[3] !== undefined ? kv[3] : kv[4]
        const at = spanStart + kv.index
        examined.params++
        if (!params.has(key)) {
          findings.push({ seat: label, category: 'UNKNOWN_PARAM', name: key, context: ctxOf(text, at, at + kv[0].length), note: tool + ' has no such parameter' })
          continue
        }
        const spec = params.get(key)
        if (spec.enums && val !== undefined) examined.enums++
        if (spec.enums && val !== undefined && !spec.enums.includes(String(val))) {
          findings.push({ seat: label, category: 'UNKNOWN_ENUM', name: key + ':' + val, context: ctxOf(text, at, at + kv[0].length), note: tool + '.' + key + ' enum = ' + spec.enums.join('|') })
        }
      }
      for (const eq of span.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^,\s}]+)/g)) {
        const key = eq[1]
        if (!params.has(key)) findings.push({ seat: label, category: 'UNKNOWN_PARAM', name: key, context: ctxOf(text, spanStart + eq.index, spanStart + eq.index + eq[0].length), note: tool + ' has no such parameter (k=v shape)' })
      }
    }
    // Identifiers named inside the span: NARROW by construction — (a) the whole span is one identifier, or (b) a
    // `key:` token outside quotes (enum VALUES like "list" are never mistaken for keys). Each is then CLASSIFIED.
    const candidates = []
    const whole = span.trim()
    if (/^[a-z][A-Za-z0-9_]{2,40}$/.test(whole)) candidates.push({ name: whole, at: span.indexOf(whole) })
    for (const fm of span.matchAll(/(^|[^A-Za-z0-9_."'`])([a-z][A-Za-z0-9_]{2,40})(?=\s*:)/g)) {
      candidates.push({ name: fm[2], at: fm.index + fm[1].length })
    }
    for (const c of candidates) {
      if (STOPWORDS.test(c.name)) continue
      if (c.name.startsWith('vibe_') || reg.has(c.name)) continue
      if ([...reg.values()].some((r) => r.params.has(c.name))) continue
      examined.idents++
      const at = spanStart + c.at
      const context = ctxOf(text, at, at + c.name.length)
      if (sources.fields.has(c.name)) { bump('RECEIPT_KEY', c.name); continue }
      if (sources.settingsKeys.has(c.name)) { bump('SETTINGS_KEY', c.name); continue }
      if (sources.enumWords.has(c.name)) { bump('ENUM_VALUE', c.name); continue }
      if (sources.vars.has(c.name)) { bump('VARIABLE', c.name); continue }
      if (sources.codeKeys.has(c.name)) {
        bump('RECEIPT_KEY', c.name)
        const gap = coverageGapVerdict(c.name)
        findings.push({ seat: label, category: 'UNKNOWN_FIELD', klass: 'RECEIPT_KEY', warn: 'coverage-gap', name: c.name, context, note: gap.why, blocker: gap.blocker === true })
        continue
      }
      if (sources.codeIdents.has(c.name)) { bump('VARIABLE', c.name); continue }
      classes.unclassified++
      findings.push({ seat: label, category: 'UNKNOWN_FIELD', klass: 'unclassified', warn: 'unclassified', name: c.name, context, note: 'not a receipt key, settings key, enum value or source identifier (unclassified — adjudicate, do not assume a typo)' })
    }
  }
  const readings = { claims: 0, pass: 0, gap: 0, blockers: 0 }
  const patternSeen = {}
  for (const pat of READING_PATTERNS) {
    for (const m of text.matchAll(pat.re)) {
      const quote = pat.quote(m)
      const ids = pat.fromSpan(m)
      if (ids.length === 0) continue
      readings.claims++
      patternSeen[pat.key] = (patternSeen[pat.key] || 0) + 1
      if (NEGATED_CLAIM.test(quote)) continue // "`x` 是旧称" disclaims readability, it does not claim it
      for (const name of ids) {
        examined.readings++
        const v = readingVerdict(name, sources.readable)
        if (v.verdict === 'pass') { readings.pass++; continue }
        if (v.verdict === 'gap') { readings.gap++; findings.push({ seat: label, category: 'TAUGHT_READING', warn: 'reading-gap', name, context: quote.trim().slice(0, 160), promptQuote: quote.trim(), note: v.why }) }
        else { readings.blockers++; findings.push({ seat: label, category: 'TAUGHT_READING', warn: 'reading-blocker', name, context: quote.trim().slice(0, 160), promptQuote: quote.trim(), note: v.why, blocker: true }) }
      }
    }
  }
  return { findings, examined, classes, classSeen, readings, patternSeen }
}

function summarise(findings) {
  const counts = { tools: 0, params: 0, enums: 0, fields: 0, coverageGap: 0, coverageGapUnproven: 0, unclassified: 0 }
  for (const f of findings) {
    if (f.category === 'UNKNOWN_TOOL') counts.tools++
    else if (f.category === 'UNKNOWN_PARAM') counts.params++
    else if (f.category === 'UNKNOWN_ENUM') counts.enums++
    else if (f.category === 'UNKNOWN_FIELD') {
      counts.fields++
      if (f.warn === 'coverage-gap') { counts.coverageGap++; if (f.blocker === true) counts.coverageGapUnproven++ }
      else counts.unclassified++
    }
  }
  return counts
}

function addClasses(a, b) {
  for (const k of Object.keys(a)) a[k] += b[k]
}

// ── self-check: prove the scanner can go red AND that each class is routed to its own table ────────────────────
if (SELF_CHECK) {
  const enumWords = new Set()
  const enumKeys = new Set()
  const fakeReg = registryOf([
    { name: 'vibe_vmu_records', parameters: { properties: { action: { enum: ['list', 'get'] }, limit: {} } } },
  ], enumWords, enumKeys)
  const fakeSources = {
    fields: fieldNamesOf({ vibe_vmu_records: { keys: ['ok', 'rows', 'total'] } }),
    settingsKeys: new Set(['fakeSetting']),
    enumWords: new Set([...enumWords, 'fakeEnumValue']),
    codeKeys: new Set(['fakeCoverageKey']),
    vars: new Set(['fakeVar']),
    readable: new Set(['rows', 'total']),
    codeIdents: new Set(['fakeBroad']),
  }
  const cases = [
    ['fake tool', '用 `vibe_vmu_does_not_exist` 读', 'UNKNOWN_TOOL', null],
    ['fake tool inside a reading claim (lead m08032 anti-light)', '读数里有 `vibe_vmu_does_not_exist`', 'UNKNOWN_TOOL', null],
    ['fake param', '用 `vibe_vmu_records {action:"list", nonexistent:1}` 读', 'UNKNOWN_PARAM', null],
    ['fake enum', '用 `vibe_vmu_records {action:"erase"}` 读', 'UNKNOWN_ENUM', null],
    ['unclassified ident', '回执里看 `notARealField`', 'UNKNOWN_FIELD', 'unclassified'],
  ]
  let bad = 0
  for (const [name, text, want, klass] of cases) {
    const found = scanText('self', text, fakeReg, fakeSources).findings.filter((f) => f.category === want && (!klass || f.klass === klass))
    if (found.length === 0) { bad++; console.error('SELF-CHECK MISS: ' + name + ' (expected ' + want + (klass ? '/' + klass : '') + ')') }
  }
  // classification must route each kind to its own table and stay quiet
  const routed = [
    ['receipt key', '`rows`', 'RECEIPT_KEY'],
    ['settings key', '`fakeSetting`', 'SETTINGS_KEY'],
    ['enum value', '`fakeEnumValue`', 'ENUM_VALUE'],
    ['variable', '`fakeVar`', 'VARIABLE'],
    ['broad identifier', '`fakeBroad`', 'VARIABLE'],
  ]
  for (const [name, text, want] of routed) {
    const r = scanText('self', text, fakeReg, fakeSources)
    if (r.findings.length !== 0 || r.classes[want] !== 1) { bad++; console.error('SELF-CHECK MISROUTE: ' + name + ' (expected one ' + want + ', got ' + JSON.stringify(r.classes) + ' findings=' + JSON.stringify(r.findings) + ')') }
  }
  // coverage-gap must be a WARN with its own reason, not silently passed
  const gap = scanText('self', '`fakeCoverageKey`', fakeReg, fakeSources)
  if (gap.findings.length !== 1 || gap.findings[0].warn !== 'coverage-gap') { bad++; console.error('SELF-CHECK MISS: coverage-gap classification') }
  // ★ A coverage-gap WARN must NAME its producer; a gap with no provenance is a BLOCKER. Test BOTH directions so
  // the promotion can neither become a permanent exemption nor fire on a documented gap.
  if (coverageGapVerdict('satisfiedBy').blocker !== false) { bad++; console.error('SELF-CHECK MISS: a documented coverage-gap must stay WARN') }
  if (coverageGapVerdict('totallyUnprovenGapKey').blocker !== true) { bad++; console.error('SELF-CHECK MISS: an undocumented coverage-gap must be promoted to BLOCKER') }
  // ★ TAUGHT-READING must compare against the readable set for real: a real corpus key passes, DELETING that key
  // from the set turns the same sentence red (proof the scanner reads the corpus and not a hard-coded allow-list).
  const claimedReal = scanText('self', '`rows` 是具名读数', fakeReg, fakeSources)
  if (claimedReal.findings.some((f) => f.category === 'TAUGHT_READING')) { bad++; console.error('SELF-CHECK FALSE POSITIVE: a corpus key claimed as a reading must pass') }
  const deleted = { ...fakeSources, readable: new Set(['total']) }
  const claimedGone = scanText('self', '`rows` 是具名读数', fakeReg, deleted)
  if (!claimedGone.findings.some((f) => f.category === 'TAUGHT_READING' && f.blocker === true)) { bad++; console.error('SELF-CHECK MISS: deleting a real key from the readable set must turn the claim red') }
  // a fabricated reading name must be a BLOCKER that quotes the sentence; a measured-but-uncaptured producer is a WARN
  const fakeRead = scanText('self', '`notARealReading` 是具名读数', fakeReg, fakeSources)
  const fr = fakeRead.findings.find((f) => f.category === 'TAUGHT_READING')
  if (!fr || fr.blocker !== true || !String(fr.promptQuote || '').includes('notARealReading')) { bad++; console.error('SELF-CHECK MISS: a fabricated claimed reading must be a BLOCKER quoting the prompt sentence') }
  const fakeTables = {
    withPlan: { producedBy: 'fake op', capturedBy: { tool: 'vibe_vmu_turn', action: 'status', corpus: 'e2e', scenarioStep: 'turn/status' } },
    withoutPlan: { producedBy: 'fake op' },
  }
  if (readingVerdict('withPlan', new Set(), fakeTables).verdict !== 'gap') { bad++; console.error('SELF-CHECK MISS: a producer WITH capturedBy must stay a WARN reading-gap') }
  if (readingVerdict('withoutPlan', new Set(), fakeTables).verdict !== 'blocker') { bad++; console.error('SELF-CHECK MISS: a producer WITHOUT capturedBy must be promoted to BLOCKER') }
  const reReading = { ...fakeSources, readable: new Set() }
  const knownGap = scanText('self', '`notices` 是小节读数', fakeReg, reReading)
  const kg = knownGap.findings.find((f) => f.category === 'TAUGHT_READING')
  if (!kg || kg.warn !== 'reading-gap') { bad++; console.error('SELF-CHECK MISS: a measured producer absent from the corpus must stay a WARN reading-gap') }
  const clean = '用 `vibe_vmu_records {action:"list", limit:0}` 读，回执里看 `rows` 和 `total`。'
  const noisy = scanText('self', clean, fakeReg, fakeSources).findings
  if (noisy.length !== 0) { bad++; console.error('SELF-CHECK FALSE POSITIVE on clean text: ' + JSON.stringify(noisy)) }
  if (bad > 0) { console.error('SELF-CHECK: FAIL (' + bad + ')'); process.exit(1) }
  console.log('SELF-CHECK: PASS (5 injections caught, 4 classes routed, coverage-gap promotion both ways, taught-reading compares + capturedBy both ways, clean text stays quiet)')
  process.exit(0)
}

const srcs = []
walkSources(SOURCE_DIRS, (p, s) => srcs.push(s))
const codeKeysGlobal = objectKeysOf(srcs)

const fields = (() => {
  if (!existsSync(FIELDSET)) {
    fail('receipt fieldset corpus is missing: ' + FIELDSET + ' (TB-2659: a missing corpus is a FAILURE, never a skip)')
    process.exit(1)
  }
  let fieldset
  try { fieldset = JSON.parse(readFileSync(FIELDSET, 'utf8')) } catch (e) { fail('receipt fieldset is unreadable: ' + FIELDSET + ' :: ' + e.message); process.exit(1) }
  return fieldNamesOf(fieldset)
})()

// Sim corpus receipts: the second living source for "can the member actually read this name". A missing corpus is a
// FAILURE, never a skip (TB-2659).
const CORPUS_DIR = valueOf('--corpus', DEFAULT_CORPUS)
const corpusKeys = (() => {
  const p = join(CORPUS_DIR, 'receipts.jsonl')
  if (!existsSync(p)) { fail('sim corpus receipts are missing: ' + p + ' (TB-2659: a missing corpus is a FAILURE, never a skip)'); process.exit(1) }
  const keys = new Set()
  const walk = (o) => {
    if (o === null || typeof o !== 'object') return
    if (Array.isArray(o)) { for (const v of o) walk(v); return }
    for (const [k, v] of Object.entries(o)) { keys.add(k); walk(v) }
  }
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { walk(JSON.parse(line)) } catch (e) { /* one bad line must not hide the rest */ }
  }
  if (keys.size < 50) fail('sim corpus receipt keys look empty (' + keys.size + ') — refusing to call a vacuous reading check a pass')
  return keys
})()

const settings = (() => {
  const p = 'vibe-math-vmu/settings/schema.js'
  if (!existsSync(p)) { fail('settings schema is missing: ' + p + ' (SETTINGS_KEY has no living table without it)'); return { keys: new Set(), domains: new Set() } }
  return settingsOf(readFileSync(p, 'utf8'))
})()

const root = mkdtempSync(join(tmpdir(), 'vmu-prompt-names-'))
let findings = []
let examinedTools = 0
let examinedParams = 0
let examinedEnums = 0
let examinedIdents = 0
let examinedReadings = 0
const readingTotals = { claims: 0, pass: 0, gap: 0, blockers: 0 }
const patternTotals = {}
const classTotals = emptyClasses()
const classSeenTotals = { RECEIPT_KEY: new Set(), SETTINGS_KEY: new Set(), ENUM_VALUE: new Set(), VARIABLE: new Set(), unclassified: new Set() }
try {
  const { boot } = await import('../scripts/sim/harness.mjs')
  const b = await boot({ root, withPrompt: true })
  const enumWords = new Set([...settings.domains])
  const enumKeys = new Set()
  const reg = registryOf(b.specs, enumWords, enumKeys)
  // `c.formalVerify === 'encourage'` and similar comparisons are enum values even when no spec declares them.
  for (const v of literalsOf(srcs)) enumWords.add(v)
  const sources = { fields, settingsKeys: settings.keys, enumWords, codeKeys: codeKeysGlobal, vars: varsOf(srcs), codeIdents: identsOf(srcs), readable: new Set([...fields, ...corpusKeys]) }
  if (reg.size < 20) fail('tool registry looks empty (' + reg.size + ' specs) — refusing to call a vacuous scan a pass')
  const seats = [
    { seat: 'chair', member: 'r-acad' },
    { seat: 'member', member: 'r-1' },
    { seat: 'temp', member: 'r-t1' },
  ]
  for (const s of seats) {
    const text = await b.prompts.assembleFor({ seat: s.seat, phase: 'normal', member: s.member })
    if (typeof text !== 'string' || text.length < 10000) fail('assembled text for ' + s.seat + ' is suspiciously short (' + String(text && text.length) + ')')
    const r = scanText(s.seat, text, reg, sources)
    findings = findings.concat(r.findings)
    examinedTools += r.examined.tools
    examinedParams += r.examined.params
    examinedEnums += r.examined.enums
    examinedIdents += r.examined.idents
    examinedReadings += r.examined.readings
    for (const k of Object.keys(readingTotals)) readingTotals[k] += r.readings[k]
    for (const [k, v] of Object.entries(r.patternSeen)) patternTotals[k] = (patternTotals[k] || 0) + v
    addClasses(classTotals, r.classes)
    for (const k of Object.keys(classSeenTotals)) for (const n of r.classSeen[k]) classSeenTotals[k].add(n)
  }
} finally {
  try { rmSync(root, { recursive: true, force: true }) } catch (e) { /* best effort */ }
}

if (examinedTools === 0) fail('the assembled prompts name no tool at all — refusing to call a vacuous scan a pass')
if (examinedIdents === 0) fail('the assembled prompts name no backticked identifier at all — refusing to call a vacuous scan a pass')
if (examinedReadings === 0) fail('the assembled prompts make no reading claim at all — refusing to call a vacuous TAUGHT-READING pass')
const seen = new Set()
findings = findings.filter((f) => {
  const k = f.category + '\u0000' + f.name
  if (seen.has(k)) return false
  seen.add(k)
  return true
})
const counts = summarise(findings)
// Distinct (post-dedupe) reading counts: the per-seat tally above counts one sentence three times when all seats
// carry it, which is right for "how much is promised" but wrong for "how many names are dead".
const taughtNames = findings.filter((f) => f.category === 'TAUGHT_READING')
const taughtDistinct = { names: new Set(taughtNames.map((f) => f.name)).size, gap: taughtNames.filter((f) => f.warn === 'reading-gap').length, blockers: taughtNames.filter((f) => f.blocker === true).length }
const blockers = findings.filter((f) => f.category === 'UNKNOWN_TOOL' || f.category === 'UNKNOWN_PARAM' || f.category === 'TAUGHT_READING' && f.blocker === true || f.blocker === true)

if (JSON_OUT) {
  console.log(JSON.stringify({ counts, classes: classTotals, readings: readingTotals, readingPatterns: patternTotals, distinct: Object.fromEntries(Object.entries(classSeenTotals).map(([k, v]) => [k, [...v].sort()])), provenance: COVERAGE_GAP_PROVENANCE, blockers: blockers.length, findings }, null, 2))
} else {
  for (const f of findings) {
    console.log([f.seat, f.category + (f.warn ? ':' + f.warn : ''), f.name, '「' + f.context + '」', f.note].join(' | '))
  }
  console.log('')
  console.log('COUNTS tools=' + counts.tools + ' params=' + counts.params + ' enums=' + counts.enums + ' fields=' + counts.fields + ' (coverage-gap=' + counts.coverageGap + ' unclassified=' + counts.unclassified + ')')
  console.log('CLASSES receipt=' + classTotals.RECEIPT_KEY + ' settings=' + classTotals.SETTINGS_KEY + ' enum=' + classTotals.ENUM_VALUE + ' variable=' + classTotals.VARIABLE + ' unclassified=' + classTotals.unclassified)
  console.log('CLASSES-DISTINCT receipt=' + classSeenTotals.RECEIPT_KEY.size + ' settings=' + classSeenTotals.SETTINGS_KEY.size + ' enum=' + classSeenTotals.ENUM_VALUE.size + ' variable=' + classSeenTotals.VARIABLE.size + ' unclassified=' + classSeenTotals.unclassified.size)
  console.log('SOURCES tools=spec-registry receipt=' + FIELDSET + '+source-keys settings=settings/schema.js enum=spec+domains+source-literals variable=kernel/packs-source')
  console.log('READINGS claims=' + readingTotals.claims + ' pass=' + readingTotals.pass + ' gap=' + readingTotals.gap + ' blockers=' + readingTotals.blockers + ' patterns=' + Object.keys(patternTotals).map((k) => k + ':' + patternTotals[k]).join(' '))
  console.log('READINGS-DISTINCT names=' + taughtDistinct.names + ' gap=' + taughtDistinct.gap + ' blockers=' + taughtDistinct.blockers)
  console.log('EXAMINED tool-mentions=' + examinedTools + ' params=' + examinedParams + ' enums=' + examinedEnums + ' idents=' + examinedIdents + ' readings=' + examinedReadings)
  console.log('BLOCKERS ' + blockers.length + ' (UNKNOWN_TOOL + UNKNOWN_PARAM + taught-reading without producer=' + taughtDistinct.blockers + ' + coverage-gap without producedBy=' + counts.coverageGapUnproven + ')')
}
if (blockers.length > 0) process.exitCode = 1
