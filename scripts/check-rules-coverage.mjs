#!/usr/bin/env node
// scripts/check-rules-coverage.mjs — the machine gate behind the user's "逐句核实".
//
// WHY THIS EXISTS. The v5r rules document (63 lines, outside the repository) was "implemented" in the sense that
// every mechanism below it worked, and still half the rule sentences had no teaching, no live evidence, or no
// mechanism at all — the convergence claim was about defects in the paths we happened to walk, not about the rules
// (see docs/acceptance/rule-conformance-matrix.md). A goal may only close when this gate is green, so the four
// questions a rule sentence must answer are data, not memory:
//
//   ① mechanism — the kernel/pack actually enforces it (not the prompt's good manners)
//   ② tool      — a face the right seat can reach, whose receipt answers the reader's question
//   ③ prompt    — live teaching says it to the people who need it
//   ④ live      — a real run's receipt proves it works
//
// THE LEDGER IS DATA, AND ITS EVIDENCE IS EXECUTED. docs/acceptance/rules-ledger.json holds one row per atomic
// requirement; mechanism/prompt/live entries are `path::pattern` and this gate re-reads the file and matches the
// pattern. That is the difference between a claim and a citation: a renamed symbol or a deleted line turns it red.
//
// ── ROUND 610: FROM "THE CITED FILE EXISTS" TO "THE CLAIM HAS A VERIFIABLE SHAPE" ───────────────────────────────
// An independent re-audit (D:/_tmp/verify/rule-coverage-audit.md) proved the 77-DONE ledger was hollow in three
// ways this gate could not see: 41/77 rows cited a `rule` line range that does not contain their requirement (14 of
// those ranges were entirely blank lines); mechanism/tool evidence was bare words (`routes`, `obstacles`, `state`);
// and a handful of `live` rows were "some gate refused" rather than a real receipt. The gate now checks SHAPE:
//
//   ANCHORS (preferred shape). `item.ruleText` is a VERBATIM quote from the rule document (≥ 8 chars). This gate
//   really reads the document (source.path, then source.pathRelative, then the legacy source.file), requires the
//   quote to occur EXACTLY ONCE (VMU_RULES_ANCHOR_AMBIGUOUS otherwise), resolves the REAL line it lives on, and
//   warns VMU_RULES_RULE_LINE_DRIFT when the row's claimed `rule` does not contain that line. With --check a row
//   without `ruleText` is unfinished (VMU_RULES_NO_ANCHOR) — the line-number shape is no longer enough.
//
//   STRUCTURAL LINES. Every `source.structuralLines` entry is now verified against the DOCUMENT: the line must be
//   blank, a `---` separator, a heading, or a `：`-terminated heading. A requirement sentence declared "structural"
//   is the easiest place to hide a missing implementation, so it fails by name (VMU_RULES_STRUCTURAL_IS_CONTENT).
//
//   FINGERPRINTS. `source.lineCount` alone cannot see a reflow that keeps the count. `source.fingerprint` is the
//   sha256 of the array of per-line sha256 prefixes; when `source.revision` (the document sha256) is UNCHANGED but
//   the real line count or fingerprint moved, the gate reports VMU_RULES_LINE_FINGERPRINT_DRIFT. Generate it with:
//
//       node scripts/check-rules-coverage.mjs --write-fingerprint
//
//   (that rewrites `source.lineCount`, `source.revision` and `source.fingerprint` in the ledger it was given, and
//   nothing else; run it after a human re-audit, never as a way to silence the drift warning).
//
//   EVIDENCE SHAPE (DONE rows): a mechanism pattern must be longer than 5 characters, must not be a generic word
//   (`state`, `open`, `chair`, `office`, `methods`, `feedback`, `routes`, `obstacles`, `rejected`) and must not
//   match more than three times (VMU_RULES_EVIDENCE_TOO_BROAD). A tool entry must be a tool this repository really
//   declares — resolved dynamically from `V5R_PACK_TOOLS` and `host.js`'s TOOL_NAMES, not a hard-coded list — as
//   `name` or `name{action:"x"}` with the action in that face's enum (VMU_RULES_TOOL_NOT_DECLARED). A `live` row
//   whose ONLY evidence is a refusal code (`…md::VMU_CHAT_ALREADY_SPOKE`) is reported as
//   VMU_RULES_LIVE_IS_ONLY_A_REFUSAL — a refusal proves a gate exists, not that the rule's happy path works; that
//   is a warning (FAIL with --strict-live).
//
// THE TWO MODES. Plain runs are the structural audit every suite can afford: legacy defects (an unresolvable
// citation, a DONE row missing a citation kind, a false structural declaration, an undeclared tool name) fail
// immediately, while the NEW shape requirements are reported as warnings so a migrating ledger still audits
// structurally. `--check` is the closing gate: warnings become failures except the advisory ones (line drift, and
// refusal-only live unless --strict-live), and a row without an anchor is unfinished.
//
// ✓ node scripts/check-rules-coverage.mjs               # structural audit + counts (green from day one)
// ✓ node scripts/check-rules-coverage.mjs --check       # the closing gate: shape + unfinished rows fail
// ✓ node scripts/check-rules-coverage.mjs --draft       # alias that states the intent (in-progress work)
// ✓ node scripts/check-rules-coverage.mjs --json
// ✓ node scripts/check-rules-coverage.mjs --ledger other.json   # fault-injection in tests
// ✓ node scripts/check-rules-coverage.mjs --strict-live        # a refusal-only `live` row fails too
// ✓ node scripts/check-rules-coverage.mjs --write-fingerprint  # stamp source.lineCount/revision/fingerprint
//
// Exit codes: 0 = every requested rule holds; 1 = a structural problem or (with --check) an unfinished row.
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const STRICT = args.includes('--check')
const DRAFT = args.includes('--draft')
const STRICT_LIVE = args.includes('--strict-live')
const WRITE_FP = args.includes('--write-fingerprint')
let WRITING_FINGERPRINT = false
const ledgerArg = (() => {
  const i = args.indexOf('--ledger')
  if (i >= 0 && args[i + 1]) return args[i + 1]
  const eq = args.find((a) => a.startsWith('--ledger='))
  if (eq) return eq.slice('--ledger='.length)
  return join(REPO, 'docs/acceptance/rules-ledger.json')
})()
const LEDGER = isAbsolute(ledgerArg) ? ledgerArg : join(REPO, ledgerArg)
const STATUSES = new Set(['DONE', 'PARTIAL', 'MISSING', 'DECIDED'])
const CATEGORIES = ['mechanism', 'tool', 'prompt', 'live']
const CATEGORY_MEANS = {
  mechanism: 'the kernel/pack enforces it',
  tool: 'a face reaches it',
  prompt: 'live teaching says it',
  live: 'a real run proves it',
}
// Words that "resolve" to a file but identify nothing: a pattern made of one of these is a keyword search, not a
// citation of the line that enforces the requirement.
const GENERIC_PATTERNS = new Set(['state', 'open', 'chair', 'office', 'methods', 'feedback', 'routes', 'obstacles', 'rejected'])
const MIN_PATTERN_LENGTH = 6
const MAX_PATTERN_MATCHES = 3
const MIN_ANCHOR_LENGTH = 8

const problems = []
const warnings = []
const drift = []
const refusalOnly = []
const fail = (code, message, detail) => problems.push({ code, message, detail: detail || null })
const warn = (code, message, detail) => warnings.push({ code, message, detail: detail || null })
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// ─── the rule document (really read, not assumed) ─────────────────────────────────────────────────────────────

// One resolution order for every reader of the external document: the NEW `source.path`, then the portable
// `source.pathRelative`, then the legacy absolute `source.file`. A ledger being migrated may carry any of them.
function resolveRuleDoc(source) {
  const candidates = []
  for (const key of ['path', 'pathRelative', 'file']) {
    const value = source && typeof source[key] === 'string' ? source[key].trim() : ''
    if (value) candidates.push({ key, value })
  }
  for (const candidate of candidates) {
    const abs = isAbsolute(candidate.value) ? candidate.value : join(REPO, candidate.value)
    if (existsSync(abs)) return { path: abs, declaredAs: candidate.key, declaredValue: candidate.value, candidates }
  }
  return { path: null, declaredAs: null, declaredValue: null, candidates }
}

function docLinesOf(text) {
  return String(text).split(/\r?\n/)
}

// sha256 of the array of per-line sha256 prefixes: a reflow that keeps `lineCount` still moves this.
function fingerprintOf(lines) {
  const perLine = lines.map((line) => sha256(line).slice(0, 12))
  return sha256(perLine.join('\n'))
}

function lineOfOffset(text, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1
  return line
}

function occurrences(text, needle) {
  const out = []
  let at = text.indexOf(needle)
  while (at >= 0) {
    out.push(at)
    at = text.indexOf(needle, at + 1)
  }
  return out
}

// What a line declared "structural" must look like. A heading ending in `：` is a lead-in; a bullet that carries a
// requirement is NOT structural, and that is exactly the confusion this predicate refuses.
function structuralProblem(lineText) {
  const t = String(lineText == null ? '' : lineText).trim()
  if (t === '') return null
  if (/^-{3,}$/.test(t)) return null
  if (/^#{1,6}(\s|$)/.test(t)) return null
  if (/[：:]$/.test(t)) return null
  return 'the document line carries text: ' + JSON.stringify(t.slice(0, 60))
}

function parseRuleRange(rule) {
  // Both shapes are legal: the audited ledger writes `L32`, the migrated one writes `32`.
  const m = /^L?(\d+)(?:-L?(\d+))?$/.exec(String(rule == null ? '' : rule).trim())
  if (!m) return null
  const from = Number(m[1])
  const to = m[2] ? Number(m[2]) : from
  return to < from ? null : { from, to }
}

// ─── declared tools (dynamic, never a hard-coded inventory) ───────────────────────────────────────────────────
// A `tool` row must name a face this repository really publishes. The list is resolved from the pack's
// `V5R_PACK_TOOLS` and the host's `TOOL_NAMES`; the action enum is read from the face's own declaration (pack
// `parameters.action.enum`, or the host spec block's `action: param(… enum: […])`). Nothing is transcribed by hand.

function actionsOf(parameters) {
  const action = parameters && parameters.action
  if (action && Array.isArray(action.enum)) return new Set(action.enum.map(String))
  return null
}

function hostSpecBlock(source, key) {
  const marker = 'name: TOOL_NAMES.'
  const at = source.search(new RegExp(marker.replace('.', '\\.') + key + '\\b'))
  if (at < 0) return ''
  const rest = source.slice(at)
  const next = rest.slice(1).search(/\bname: TOOL_NAMES\./)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

function actionEnumOfBlock(block) {
  const m = /action:\s*param\([^;]*?enum:\s*\[([^\]]*)\]/.exec(block)
  if (!m) return null
  const actions = [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] || x[2])
  return actions.length ? new Set(actions) : null
}

async function loadDeclaredTools() {
  const declared = new Map()
  const add = (name, actions) => { if (typeof name === 'string' && name) declared.set(name, declared.get(name) || actions || null) }
  try {
    const pack = await import(pathToFileURL(join(REPO, 'vibe-math-vmu/packs/v5r/tools.js')).href)
    for (const tool of (pack && pack.V5R_PACK_TOOLS) || []) if (tool && tool.name) add(tool.name, actionsOf(tool.parameters))
  } catch { /* fall through to the host table and, last, to the source scan */ }
  try {
    const host = await import(pathToFileURL(join(REPO, 'vibe-math-vmu/host.js')).href)
    const names = (host && host.TOOL_NAMES) || {}
    let hostSource = ''
    try { hostSource = readFileSync(join(REPO, 'vibe-math-vmu/host.js'), 'utf8') } catch { hostSource = '' }
    for (const [key, name] of Object.entries(names)) {
      const block = hostSource ? hostSpecBlock(hostSource, key) : ''
      add(name, block ? actionEnumOfBlock(block) : null)
    }
  } catch { /* last resort below */ }
  if (declared.size === 0) {
    // A gate must not silently pass everything because an import failed: fall back to the DECLARATION TEXT itself.
    for (const file of ['vibe-math-vmu/packs/v5r/tools.js', 'vibe-math-vmu/host.js']) {
      let text = ''
      try { text = readFileSync(join(REPO, file), 'utf8') } catch { continue }
      for (const m of text.matchAll(/'(vibe_v5_[a-z0-9_]+|vibe_vmu_[a-z0-9_]+)'/g)) declared.set(m[1], declared.get(m[1]) || null)
    }
  }
  return declared
}

const DECLARED_TOOLS = await loadDeclaredTools()

// ─── evidence ────────────────────────────────────────────────────────────────────────────────────────────────

function splitEvidence(entry) {
  const cut = String(entry).indexOf('::')
  if (cut <= 0) return null
  return { rel: String(entry).slice(0, cut), pattern: String(entry).slice(cut + 2) }
}

function evidenceResolves(entry) {
  const split = splitEvidence(entry)
  if (!split) return { ok: false, why: 'evidence must be written as `path::pattern`' }
  const file = isAbsolute(split.rel) ? split.rel : join(REPO, split.rel)
  if (!existsSync(file)) return { ok: false, why: 'no such file: ' + split.rel }
  let text
  try { text = readFileSync(file, 'utf8') } catch { return { ok: false, why: 'unreadable: ' + split.rel } }
  let matched = false
  try { matched = new RegExp(split.pattern).test(text) } catch { matched = text.includes(split.pattern) }
  return matched ? { ok: true, text, rel: split.rel, pattern: split.pattern } : { ok: false, why: 'pattern not found in ' + split.rel + ': ' + split.pattern }
}

function countMatches(text, pattern) {
  try { return (text.match(new RegExp(pattern, 'g')) || []).length } catch { return text.split(pattern).length - 1 }
}

// A mechanism pattern must identify a line, not a family of them.
function patternShape(rel, pattern, text) {
  const bare = String(pattern).replace(/^\^/, '').replace(/\$$/, '').trim()
  if (GENERIC_PATTERNS.has(bare)) return { broad: true, why: 'is a generic word (' + bare + ')' }
  if (bare.length < MIN_PATTERN_LENGTH) return { broad: true, why: 'is shorter than ' + MIN_PATTERN_LENGTH + ' characters (' + bare.length + ')' }
  const hits = text ? countMatches(text, pattern) : null
  if (hits !== null && hits > MAX_PATTERN_MATCHES) return { broad: true, why: 'matches ' + hits + ' times in ' + rel + ' (at most ' + MAX_PATTERN_MATCHES + ' allowed)', hits }
  return { broad: false, hits }
}

// A `live` row whose only evidence is a refusal code: a gate exists, the happy path is unproven.
function refusalCodeOf(item) {
  if (!Array.isArray(item.live) || item.live.length !== 1) return null
  const split = splitEvidence(item.live[0])
  if (!split) return null
  const body = split.pattern.trim().replace(/^`+/, '').replace(/`+$/, '').replace(/^\^/, '').replace(/\$$/, '').trim()
  const m = /^(VMU_[A-Z0-9_]+)$/.exec(body)
  return m ? m[1] : null
}

function toolEntryProblem(entry) {
  const text = String(entry).trim()
  const split = splitEvidence(text)
  if (split) {
    // Legacy citation shape: still resolved as a file citation, but a cited NAME that looks like a tool must be a
    // declared one — otherwise the citation proves a string exists in a file, not that the face is reachable.
    const named = /^(vibe_(?:v5|vmu)_[a-z0-9_]+)/.exec(split.pattern.trim())
    if (named && !DECLARED_TOOLS.has(named[1])) return { code: 'VMU_RULES_TOOL_NOT_DECLARED', why: 'cites ' + named[1] + ', which neither V5R_PACK_TOOLS nor TOOL_NAMES declares' }
    return null
  }
  const m = /^([A-Za-z_][\w.:-]*)(?:\s*\{\s*action\s*:\s*['"]([\w./-]+)['"]\s*\})?$/.exec(text)
  if (!m) return { code: 'VMU_RULES_TOOL_NOT_DECLARED', why: 'is neither `path::pattern` nor a tool name `name{action:"x"}`: ' + text }
  const name = m[1]
  const action = m[2] || null
  if (!DECLARED_TOOLS.has(name)) return { code: 'VMU_RULES_TOOL_NOT_DECLARED', why: 'names ' + name + ', which neither V5R_PACK_TOOLS nor TOOL_NAMES declares' }
  if (action) {
    const actions = DECLARED_TOOLS.get(name)
    if (!actions) return { code: 'VMU_RULES_TOOL_NOT_DECLARED', why: 'names action "' + action + '" for ' + name + ', but that face declares no action enum' }
    if (!actions.has(action)) return { code: 'VMU_RULES_TOOL_NOT_DECLARED', why: 'names action "' + action + '" for ' + name + ', which is not in ' + [...actions].join('/') }
  }
  return null
}

// ─── ledger ─────────────────────────────────────────────────────────────────────────────────────────────────

function loadLedger() {
  if (!existsSync(LEDGER)) { fail('VMU_RULES_NO_LEDGER', 'the ledger does not exist: ' + LEDGER); return null }
  let ledger
  try { ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) } catch (e) {
    fail('VMU_RULES_BAD_JSON', 'the ledger is not valid JSON: ' + String(e.message || e))
    return null
  }
  if (!ledger || typeof ledger !== 'object') { fail('VMU_RULES_BAD_SHAPE', 'the ledger must be an object'); return null }
  const source = ledger.source || {}
  const namesSource = typeof source.file === 'string' || typeof source.path === 'string' || typeof source.pathRelative === 'string'
  if (!namesSource || typeof source.revision !== 'string') {
    fail('VMU_RULES_NO_SOURCE', 'source must name the rule document (path/pathRelative/file) and carry its revision')
  }
  if (!Array.isArray(ledger.items) || ledger.items.length === 0) {
    fail('VMU_RULES_NO_ITEMS', 'items[] must hold at least one atomic requirement')
    return null
  }
  return ledger
}

const ledger = loadLedger()
if (!ledger) {
  report()
} else {
  const source = ledger.source || {}
  const doc = resolveRuleDoc(source)
  let docText = ''
  let docLines = []
  let docSha = ''
  if (doc.path) {
    try {
      docText = readFileSync(doc.path, 'utf8')
      docLines = docLinesOf(docText)
      docSha = sha256(readFileSync(doc.path))
    } catch {
      docText = ''
    }
  }

  // ── fingerprint stamping (a maintained artifact, not a way to silence drift) ───────────────────────────────
  if (WRITE_FP) {
    if (!docText) {
      fail('VMU_RULES_NO_RULE_DOCUMENT', 'cannot stamp a fingerprint: the rule document is not readable (' + doc.candidates.map((c) => c.key + '=' + c.value).join(', ') + ')')
    } else {
      ledger.source = Object.assign({}, ledger.source, { lineCount: docLines.length, revision: docSha, fingerprint: fingerprintOf(docLines) })
      writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n')
      console.log('RULE LEDGER: stamped source.lineCount=' + docLines.length + ' revision=' + docSha.slice(0, 12) + ' fingerprint=' + fingerprintOf(docLines).slice(0, 12))
      WRITING_FINGERPRINT = true
    }
  }

  if (!WRITING_FINGERPRINT) {
    // ── the document itself ────────────────────────────────────────────────────────────────────────────────
    const anchored = ledger.items.filter((i) => i && typeof i.ruleText === 'string' && i.ruleText.trim())
    if (!doc.path) {
      if (anchored.length) {
        fail('VMU_RULES_NO_RULE_DOCUMENT', 'items carry ruleText anchors but the rule document is not readable; tried ' + (doc.candidates.map((c) => c.key + '=' + c.value).join(', ') || '(no path declared)'))
      } else {
        warn('VMU_RULES_NO_RULE_DOCUMENT', 'the rule document is not readable here, so anchors, structural lines and fingerprints cannot be verified: ' + (doc.candidates.map((c) => c.key + '=' + c.value).join(', ') || '(no path declared)'))
      }
    } else {
      const realRevision = docSha
      if (String(source.revision || '') !== realRevision) {
        warn('VMU_RULES_SOURCE_REVISION_STALE', 'source.revision (' + String(source.revision || '').slice(0, 12) + ') differs from the document on disk (' + realRevision.slice(0, 12) + '): re-audit the ledger')
      }
      // ── line fingerprint: revision unchanged, but the line structure moved ──────────────────────────────
      if (typeof source.fingerprint === 'string' && source.fingerprint) {
        const realFingerprint = fingerprintOf(docLines)
        const claimedLines = Number(source.lineCount)
        const linesMoved = Number.isInteger(claimedLines) && claimedLines > 0 && claimedLines !== docLines.length
        if (String(source.revision || '') === realRevision && (linesMoved || realFingerprint !== source.fingerprint)) {
          fail('VMU_RULES_LINE_FINGERPRINT_DRIFT', 'source.revision is unchanged but the document structure moved: lineCount ' + claimedLines + ' vs ' + docLines.length + ', fingerprint ' + String(source.fingerprint).slice(0, 12) + ' vs ' + realFingerprint.slice(0, 12) + ' — re-audit and re-stamp with --write-fingerprint')
        } else if (String(source.revision || '') !== realRevision && realFingerprint !== source.fingerprint) {
          warn('VMU_RULES_LINE_FINGERPRINT_DRIFT', 'the fingerprint no longer matches the document (revision also changed, so this is expected until the ledger is re-audited)')
        }
      } else if (typeof source.fingerprint !== 'string') {
        warn('VMU_RULES_NO_FINGERPRINT', 'source.fingerprint is absent: the document can be reflowed without the gate noticing (run --write-fingerprint after an audit)')
      }

      // ── structural lines: verify the DOCUMENT, not the declaration ──────────────────────────────────────
      const structuralEntries = Array.isArray(source.structuralLines) ? source.structuralLines : []
      const structuralLines = new Map()
      for (const entry of structuralEntries) {
        const raw = typeof entry === 'string' ? entry : entry && entry.line
        const m = /^L(\d+)$/.exec(String(raw || ''))
        if (!m) { fail('VMU_RULES_BAD_STRUCTURAL', 'a structuralLines entry must name a line like L7: ' + JSON.stringify(entry)); continue }
        const n = Number(m[1])
        structuralLines.set(n, String((entry && entry.why) || ''))
        if (n < 1 || n > docLines.length) {
          fail('VMU_RULES_STRUCTURAL_OUT_OF_RANGE', 'L' + n + ' is declared structural but the document has ' + docLines.length + ' lines')
          continue
        }
        const problem = structuralProblem(docLines[n - 1])
        if (problem) {
          fail('VMU_RULES_STRUCTURAL_IS_CONTENT', 'L' + n + ' is declared structural (' + String((entry && entry.why) || 'no reason') + ') but ' + problem + ' — a requirement declared as a heading is where a missing implementation hides')
        }
      }
    }

    // ── items ─────────────────────────────────────────────────────────────────────────────────────────────
    const ids = new Map()
    for (const item of ledger.items) {
      if (!item || typeof item !== 'object') { fail('VMU_RULES_BAD_ITEM', 'every item must be an object'); continue }
      const id = String(item.id || '')
      if (!/^[A-G]\d+[a-z]?$/.test(id)) fail('VMU_RULES_BAD_ID', 'item id must look like A1/B2/C3a, got ' + JSON.stringify(item.id))
      if (ids.has(id)) fail('VMU_RULES_DUPLICATE_ID', 'duplicate item id: ' + id)
      ids.set(id, item)
      if (typeof item.text !== 'string' || !item.text.trim()) fail('VMU_RULES_NO_TEXT', 'item ' + id + ' has no text')
      if (!STATUSES.has(item.status)) fail('VMU_RULES_BAD_STATUS', 'item ' + id + ' has status ' + JSON.stringify(item.status))
      for (const key of Object.keys(item)) {
        if (!['id', 'rule', 'ruleText', 'text', 'status', 'next', 'note'].includes(key) && !CATEGORIES.includes(key)) {
          fail('VMU_RULES_UNKNOWN_FIELD', 'item ' + id + ' carries an unknown field: ' + key)
        }
      }

      // ── the anchor: a verbatim quote that resolves to exactly one line ─────────────────────────────────
      const hasAnchor = typeof item.ruleText === 'string' && item.ruleText.trim().length > 0
      if (hasAnchor) {
        const quote = item.ruleText
        if (quote.trim().length < MIN_ANCHOR_LENGTH) {
          fail('VMU_RULES_ANCHOR_TOO_SHORT', 'item ' + id + ' ruleText is ' + quote.trim().length + ' characters; an anchor must be at least ' + MIN_ANCHOR_LENGTH + ' so it identifies one sentence')
        } else if (docText) {
          const hits = occurrences(docText, quote)
          if (hits.length === 0) {
            fail('VMU_RULES_ANCHOR_NOT_FOUND', 'item ' + id + ' ruleText is not a verbatim quote from the rule document: ' + JSON.stringify(quote.slice(0, 60)))
          } else if (hits.length > 1) {
            fail('VMU_RULES_ANCHOR_AMBIGUOUS', 'item ' + id + ' ruleText occurs ' + hits.length + ' times in the rule document, so it identifies no single requirement: ' + JSON.stringify(quote.slice(0, 60)), { id, count: hits.length })
          } else {
            const actual = lineOfOffset(docText, hits[0])
            const claimed = parseRuleRange(item.rule)
            if (claimed && (actual < claimed.from || actual > claimed.to)) {
              drift.push({ id, claimed: item.rule, actual })
              warn('VMU_RULES_RULE_LINE_DRIFT', 'item ' + id + ' claims ' + item.rule + ' but its ruleText lives on L' + actual, { id, claimed: item.rule, actual })
            }
          }
        }
      } else if (STRICT) {
        fail('VMU_RULES_NO_ANCHOR', 'item ' + id + ' has no `ruleText` anchor: a line number is not a claim about a sentence (quote the rule verbatim)')
      }

      for (const cat of CATEGORIES) {
        const list = item[cat]
        if (list === undefined) continue
        if (!Array.isArray(list)) { fail('VMU_RULES_BAD_EVIDENCE', 'item ' + id + ' `' + cat + '` must be an array'); continue }
        for (const entry of list) {
          const split = splitEvidence(entry)
          // A `tool` entry may either name a declared face directly (`vibe_v5_hire`) or cite it as `path::pattern`.
          // A bare name makes no file claim, so it goes straight to the declaration check.
          const bareToolName = cat === 'tool' && !split
          const resolved = bareToolName ? { ok: true } : evidenceResolves(entry)
          if (!resolved.ok) { fail('VMU_RULES_EVIDENCE_UNRESOLVED', 'item ' + id + ' `' + cat + '`: ' + resolved.why, entry); continue }
          // Shape checks apply to DONE rows; the tool DECLARATION is checked at every status, because
          // naming a face nobody publishes is wrong whether the rule is done or not.
          if (item.status !== 'DONE' && cat !== 'tool') continue
          if (cat === 'mechanism') {
            const shape = patternShape(resolved.rel, resolved.pattern, resolved.text)
            if (shape.broad) {
              const message = 'item ' + id + ' mechanism `' + resolved.pattern + '` ' + shape.why + ' — cite the line that enforces it, not a keyword'
              if (STRICT) fail('VMU_RULES_EVIDENCE_TOO_BROAD', message, entry)
              else warn('VMU_RULES_EVIDENCE_TOO_BROAD', message, entry)
            }
          }
          if (cat === 'tool') {
            const problem = toolEntryProblem(entry)
            if (problem) fail(problem.code, 'item ' + id + ' tool ' + problem.why, entry)
          }
          if (cat === 'live') {
            const code = refusalCodeOf(item)
            if (code) {
              refusalOnly.push({ id, code })
              const message = 'item ' + id + ' live evidence is only the refusal `' + code + '`: a gate exists, but the happy path of the rule is unproven'
              if (STRICT && STRICT_LIVE) fail('VMU_RULES_LIVE_IS_ONLY_A_REFUSAL', message, entry)
              else warn('VMU_RULES_LIVE_IS_ONLY_A_REFUSAL', message, entry)
            }
          }
        }
      }

      const counts = Object.fromEntries(CATEGORIES.map((c) => [c, Array.isArray(item[c]) ? item[c].length : 0]))
      const total = CATEGORIES.reduce((n, c) => n + counts[c], 0)
      if (item.status === 'DONE') {
        for (const c of CATEGORIES) {
          if (!counts[c]) fail('VMU_RULES_DONE_MISSING_EVIDENCE', 'item ' + id + ' is DONE but has no `' + c + '` evidence (' + CATEGORY_MEANS[c] + ')')
        }
      } else if (item.status === 'PARTIAL' || item.status === 'MISSING') {
        if (item.status === 'PARTIAL' && total === 0) fail('VMU_RULES_PARTIAL_NO_EVIDENCE', 'item ' + id + ' is PARTIAL but cites no evidence at all')
        if (typeof item.next !== 'string' || item.next.trim().length < 8) {
          fail('VMU_RULES_NO_NEXT', 'item ' + id + ' is ' + item.status + ' and needs a concrete `next` (what exactly is missing)')
        }
      } else if (item.status === 'DECIDED') {
        if (typeof item.next !== 'string' || item.next.trim().length < 8) {
          fail('VMU_RULES_DECIDED_NEEDS_RULING', 'item ' + id + ' is DECIDED and must record the user ruling in `next`')
        }
      }
    }

    // ── ruleLines: legacy inventory mapping, still reconciled while it is present ──────────────────────────
    if (ledger.ruleLines) {
      const claimed = new Map()
      for (const [line, list] of Object.entries(ledger.ruleLines)) {
        if (!/^L\d+(-L?\d+)?$/.test(line)) fail('VMU_RULES_BAD_RULE_KEY', 'ruleLines key must look like L3 or L47-L51, got ' + line)
        if (!Array.isArray(list) || list.length === 0) { fail('VMU_RULES_EMPTY_RULE_LINE', 'ruleLines[' + line + '] must list item ids'); continue }
        for (const id of list) {
          if (!ids.has(id)) fail('VMU_RULES_UNKNOWN_ITEM', 'ruleLines[' + line + '] names ' + id + ', which is not an item')
          claimed.set(id, line)
        }
      }
      for (const [id, item] of ids) {
        // An anchored row's truth is its quote, not this map; the drift warning already compares them.
        if (typeof item.ruleText === 'string' && item.ruleText.trim()) continue
        if (!claimed.has(id)) fail('VMU_RULES_UNCLAIMED_ITEM', 'item ' + id + ' claims rule ' + JSON.stringify(item.rule) + ' but no ruleLines entry lists it')
        else if (item.rule !== claimed.get(id)) {
          fail('VMU_RULES_RULE_MISMATCH', 'item ' + id + ' says ' + JSON.stringify(item.rule) + ' but ruleLines puts it under ' + claimed.get(id))
        }
      }
    }

    const counts = { DONE: 0, PARTIAL: 0, MISSING: 0, DECIDED: 0 }
    for (const item of ledger.items) if (counts[item.status] !== undefined) counts[item.status] += 1
    const total = ledger.items.length
    const unfinished = counts.PARTIAL + counts.MISSING

    if (STRICT && !DRAFT) {
      for (const item of ledger.items) {
        if (item.status === 'PARTIAL' || item.status === 'MISSING') {
          fail('VMU_RULES_UNFINISHED', 'item ' + item.id + ' is ' + item.status + ' (' + item.text + ')', item.next || null)
        }
      }
    }

    const anchorCount = ledger.items.filter((i) => i && typeof i.ruleText === 'string' && i.ruleText.trim()).length
    const docInfo = {
      resolvedAs: doc.declaredAs,
      path: doc.declaredValue,
      readable: !!docText,
      lines: docLines.length,
      revision: docSha ? docSha.slice(0, 12) : null,
      fingerprint: typeof source.fingerprint === 'string' ? source.fingerprint.slice(0, 12) : null,
      fingerprintMatches: typeof source.fingerprint === 'string' && docText ? fingerprintOf(docLines) === source.fingerprint : null,
    }
    if (JSON_OUT) {
      process.stdout.write(JSON.stringify({ ok: problems.length === 0, source, doc: docInfo, counts, total, unfinished,
        anchors: { withAnchor: anchorCount, withoutAnchor: total - anchorCount },
        drift, refusalOnly, warnings, problems }, null, 2) + '\n')
    } else {
      const warningCounts = {}
      for (const w of warnings) warningCounts[w.code] = (warningCounts[w.code] || 0) + 1
      console.log('RULE LEDGER: ' + total + ' atomic requirement(s) · DONE ' + counts.DONE + ' · PARTIAL ' + counts.PARTIAL +
        ' · MISSING ' + counts.MISSING + ' · DECIDED ' + counts.DECIDED)
      console.log('  source: ' + (source.path || source.pathRelative || source.file) + ' rev ' + String(source.revision).slice(0, 12) +
        ' (' + (docText ? docLines.length : source.lineCount) + ' lines, read via ' + (doc.declaredAs || 'nothing') + ')')
      console.log('  anchors: ' + anchorCount + '/' + total + ' rows quote the rule verbatim' +
        (drift.length ? ' · ' + drift.length + ' line drift(s)' : '') +
        (refusalOnly.length ? ' · ' + refusalOnly.length + ' refusal-only live row(s)' : '') +
        ' · fingerprint ' + (source.fingerprint ? (docInfo.fingerprintMatches ? 'matches' : 'DRIFT') : 'absent'))
      if (warnings.length) {
        console.log('  warnings: ' + warnings.length + ' (' + Object.entries(warningCounts).map(([c, n]) => c + ' ' + n).join(', ') + ')')
        const shown = warnings.slice(0, Number(args.find((a) => a.startsWith('--warnings='))?.slice('--warnings='.length) || 200))
        for (const w of shown) console.log('    warn ' + w.code + ' :: ' + w.message)
        if (shown.length < warnings.length) console.log('    … ' + (warnings.length - shown.length) + ' more warning(s) (--json for all)')
      }
      if (problems.length === 0) {
        console.log('  every four-question claim resolves; ' + (STRICT && !DRAFT
          ? 'nothing is unfinished: this is the closing gate'
          : unfinished
            ? 'still open: ' + unfinished + ' row(s) — run with --check before closing a goal'
            : 'nothing is unfinished'))
      } else {
        for (const p of problems) console.log('  ' + p.code + ' :: ' + p.message + (p.detail ? ' :: ' + String(typeof p.detail === 'string' ? p.detail : JSON.stringify(p.detail)).slice(0, 200) : ''))
      }
      console.log((problems.length === 0 ? 'RULES COVERAGE: PASS' : 'RULES COVERAGE: FAIL') + ' (' + problems.length +
        ' problem(s)' + (warnings.length ? ', ' + warnings.length + ' warning(s)' : '') + ')')
    }
  }
}

function report() {
  if (JSON_OUT) process.stdout.write(JSON.stringify({ ok: false, warnings, problems }, null, 2) + '\n')
  else {
    for (const p of problems) console.log('  ' + p.code + ' :: ' + p.message)
    console.log('RULES COVERAGE: FAIL (' + problems.length + ' problem(s))')
  }
}

process.exitCode = problems.length === 0 ? 0 : 1
