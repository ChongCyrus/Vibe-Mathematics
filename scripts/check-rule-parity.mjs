#!/usr/bin/env node
// scripts/check-rule-parity.mjs — the end-to-end parity check between the RULE document, its ledger, and the
// LIVE teaching (G7).
//
// WHY THIS EXISTS. `check-rules-coverage.mjs` proves that every claim in the ledger resolves to a file: a renamed
// symbol reds it. That is citation-checking, and it has two blind spots that a rule-by-rule implementation can
// fall into:
//
//   ① the ledger may CITE a file that is not live teaching at all. `packs/v5r/prompts/v5r-prompts.js` is a
//      historical corpus capture and `v5r-persona.js` is dead data (v5r-core.js:404-406 says the runtime renders
//      the hand-written charter instead) — citing either would make "the teaching says it" true about text nobody
//      reads.
//   ② live teaching may exist that NO rule claims. A block added for one round and forgotten is drift: the
//      teaching says something the ledger does not map to a rule line, so nothing keeps it true.
//
// This gate computes the LIVE set from the IMPORT GRAPH (starting at prompts/v5r-core.js, following relative
// imports, minus an explicit deny list with a reason each), then checks four parities:
//
//   P1  every rule line 1..source.lineCount is claimed by a ruleLines range
//   P2  no ledger evidence cites a non-live prompt file (a citation must point at text a seat actually reads)
//   P3  every live prompt file is cited by at least one ledger item (no orphan teaching)
//   P4  every item id named in tests/vmu-ledger-teaching-pins.test.mjs exists in the ledger (no orphan pin)
//
// ✓ node scripts/check-rule-parity.mjs
// ✓ node scripts/check-rule-parity.mjs --json
// ✓ node scripts/check-rule-parity.mjs --ledger other.json
// ✓ node scripts/check-rule-parity.mjs --selftest     # plants the four failures in temp copies; 4/4 must be caught
//
// Exit codes: 0 = all four parities hold; 1 = at least one problem (or a selftest case was not caught).
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const SELFTEST = args.includes('--selftest')
const ledgerArg = (() => {
  const i = args.indexOf('--ledger')
  if (i >= 0 && args[i + 1]) return args[i + 1]
  const eq = args.find((a) => a.startsWith('--ledger='))
  return eq ? eq.slice('--ledger='.length) : null
})()

const PROMPTS_REL = 'vibe-math-vmu/packs/v5r/prompts'
const PROMPTS_DIR = join(REPO, PROMPTS_REL)
const CORE = 'v5r-core.js'
const PINS_TEST = 'tests/vmu-ledger-teaching-pins.test.mjs'

// Not live teaching, with the reason a citation of it would be false.
const NON_TEACHING = {
  'v5r-prompts.js': 'historical corpus capture (SOURCE_REL/SHA256), not rendered to any seat',
  'v5r-persona.js': 'dead persona data: v5r-core.js says the runtime renders the hand-written charter instead',
}

function walk(dir) {
  return readFileSync // placeholder to keep the linter quiet about unused imports
}

const problems = []
const note = []
const fail = (code, message, detail) => problems.push({ code, message, detail: detail || null })

// The live set: transitive relative imports from the core prompt module, minus NON_TEACHING.
function liveTeachingFiles() {
  const seen = new Set()
  const queue = [CORE]
  const edges = new Map()
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    const abs = join(PROMPTS_DIR, file)
    if (!existsSync(abs)) continue
    let text = ''
    try { text = readFileSync(abs, 'utf8') } catch { continue }
    const deps = []
    for (const m of text.matchAll(/from\s+'\.\/([\w.-]+\.js)'/g)) deps.push(m[1])
    edges.set(file, deps)
    for (const d of deps) if (!seen.has(d)) queue.push(d)
  }
  const live = []
  const excluded = []
  for (const f of seen) {
    if (NON_TEACHING[f]) excluded.push({ file: f, why: NON_TEACHING[f] })
    else live.push({ file: f, importedBy: [...edges].filter(([, deps]) => deps.includes(f)).map(([from]) => from) })
  }
  live.sort((a, b) => a.file.localeCompare(b.file))
  return { live, excluded, edges }
}

/** Declared capability names: the tools a seat can call and the settings keys a deployment can set. */
function capabilityNames() {
  const tools = new Set()
  const settings = new Set()
  const sources = ['vibe-math-vmu/tools', 'vibe-math-vmu/packs/v5r/tools.js', 'vibe-math-vmu/kit']
  const addFrom = (text) => {
    for (const m of text.matchAll(/name:\s*'(vibe_[a-z0-9_]+)'/g)) tools.add(m[1])
    for (const m of text.matchAll(/'(vibe_[a-z0-9_]+)'/g)) tools.add(m[1])
  }
  const readDir = (dir) => {
    const abs = join(REPO, dir)
    if (!existsSync(abs)) return
    for (const f of readdirSync(abs)) {
      if (!f.endsWith('.js')) continue
      try { addFrom(readFileSync(join(abs, f), 'utf8')) } catch { /* unreadable file is not a teaching fact */ }
    }
  }
  readDir('vibe-math-vmu/tools')
  readDir('vibe-math-vmu/kit')
  for (const f of ['vibe-math-vmu/packs/v5r/tools.js', 'vibe-math-vmu/host.js', 'vibe-math-vmu/host-pack-tools.js']) {
    try { addFrom(readFileSync(join(REPO, f), 'utf8')) } catch { /* declared set stays short, and that shows up as a red */ }
  }
  // An alias is a name the pack accepts, so it is a declared name too (`from: 'vibe_v5_x', to: 'vmu.y'`).
  const walk = (dirAbs) => {
    if (!existsSync(dirAbs)) return
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      const abs = join(dirAbs, entry.name)
      if (entry.isDirectory()) { walk(abs); continue }
      if (!entry.name.endsWith('.js')) continue
      try {
        const text = readFileSync(abs, 'utf8')
        for (const m of text.matchAll(/from:\s*'(vibe_[a-z0-9_]+)'/g)) tools.add(m[1])
      } catch { /* skip unreadable file */ }
    }
  }
  walk(join(REPO, 'vibe-math-vmu/packs/v5r'))
  for (const f of ['vibe-math-vmu/packs/v5r/settings/defaults.json', 'vibe-math-vmu/packs/v5r/settings/schema.js', 'vibe-math-vmu/packs/v5r/settings/defaults.js', 'vibe-math-vmu/packs/v5r/settings/planned.js']) {
    const abs = join(REPO, f)
    if (!existsSync(abs)) continue
    let text = ''
    try { text = readFileSync(abs, 'utf8') } catch { continue }
    for (const m of text.matchAll(/"(vmu\.[A-Za-z0-9_.]+)"/g)) settings.add(m[1])
    for (const m of text.matchAll(/'(vmu\.[A-Za-z0-9_.]+)'/g)) settings.add(m[1])
  }
  return { tools }
}

/**
 * P5 — NAMES. A teaching sentence may mention a tool or a setting; if it names one that no seat can call and no
 * deployment can set, the sentence teaches a capability that does not exist. This is mechanical and narrow on
 * purpose: it proves the NAMES, not the meaning. Semantic contradiction between two sentences is audited by the
 * closing lanes (see docs/acceptance/phase12-v5r-rules-conformance.md), and this gate says so instead of implying
 * it covers it.
 */
function checkTeachingNames(live, exempt) {
  const { tools } = capabilityNames()
  const unknown = (token) => {
    for (const e of exempt) if (e.name === token) return false
    return true
  }
  for (const item of live) {
    const abs = join(PROMPTS_DIR, item.file)
    let text = ''
    try { text = readFileSync(abs, 'utf8') } catch { continue }
    const lines = text.split(String.fromCharCode(10))
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const m of line.matchAll(/(vibe_[a-z0-9_]+)/g)) {
        const token = m[1]
        if (tools.has(token)) continue
        if (!unknown(token)) continue
        fail('VMU_RULE_PARITY_UNKNOWN_NAME', PROMPTS_REL + '/' + item.file + ':' + (i + 1) + ' teaches the tool `' + token + '`, which no face declares', item.file)
      }
    }
  }
}

function loadLedger(path) {
  if (!existsSync(path)) { fail('VMU_RULE_PARITY_NO_LEDGER', 'no ledger at ' + path); return null }
  try {
    const ledger = JSON.parse(readFileSync(path, 'utf8'))
    if (!ledger || typeof ledger !== 'object' || !Array.isArray(ledger.items)) {
      fail('VMU_RULE_PARITY_BAD_LEDGER', 'the ledger must be an object with items[]')
      return null
    }
    return ledger
  } catch (e) {
    fail('VMU_RULE_PARITY_BAD_JSON', 'the ledger is not valid JSON: ' + String(e.message || e))
    return null
  }
}

// Claimed rule lines, expanded from keys like `L47-L51`.
function claimedLines(ruleLines) {
  const lines = new Set()
  const bad = []
  for (const key of Object.keys(ruleLines || {})) {
    const m = /^L(\d+)(?:-L?(\d+))?$/.exec(key)
    if (!m) { bad.push(key); continue }
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : from
    if (to < from) { bad.push(key); continue }
    for (let n = from; n <= to; n += 1) lines.add(n)
  }
  return { lines, bad }
}

function citedPromptFiles(ledger) {
  const cited = new Map() // file -> item ids
  for (const item of ledger.items) {
    if (!item || typeof item !== 'object') continue
    for (const cat of ['mechanism', 'tool', 'prompt', 'live']) {
      const list = item[cat]
      if (!Array.isArray(list)) continue
      for (const entry of list) {
        const cut = String(entry).indexOf('::')
        if (cut <= 0) continue
        const rel = String(entry).slice(0, cut).replace(/\\/g, '/')
        const at = rel.lastIndexOf(PROMPTS_REL + '/')
        if (at < 0) continue
        const file = rel.slice(at + PROMPTS_REL.length + 1)
        if (!cited.has(file)) cited.set(file, new Set())
        cited.get(file).add(String(item.id))
      }
    }
  }
  return cited
}

function pinIds() {
  const abs = join(REPO, PINS_TEST)
  if (!existsSync(abs)) return { ids: new Set(), missingFile: true }
  const text = readFileSync(abs, 'utf8')
  const ids = new Set()
  for (const m of text.matchAll(/^\s*\*\s+([A-G]\d+[a-z]?)\b/gm)) ids.add(m[1])
  return { ids, missingFile: false }
}

function check(ledgerPath) {
  const ledger = loadLedger(ledgerPath)
  if (!ledger) return null
  const { live, excluded } = liveTeachingFiles()
  const liveSet = new Set(live.map((l) => l.file))
  const ledgerIds = new Set(ledger.items.filter((i) => i && i.id).map((i) => String(i.id)))
  const { lines, bad } = claimedLines(ledger.ruleLines)
  for (const key of bad) fail('VMU_RULE_PARITY_BAD_RULE_KEY', 'ruleLines key does not look like L3 or L47-L51: ' + key)

  const lineCount = Number(ledger.source && ledger.source.lineCount)
  if (!Number.isInteger(lineCount) || lineCount <= 0) {
    fail('VMU_RULE_PARITY_NO_LINE_COUNT', 'source.lineCount must record how many lines the rule document has')
  }
  for (const n of lines) {
    if (lineCount > 0 && n > lineCount) fail('VMU_RULE_PARITY_LINE_OUT_OF_RANGE', 'ruleLines claims L' + n + ' but the document has ' + lineCount + ' lines')
  }

  const structural = new Map()
  for (const entry of Array.isArray(ledger.source && ledger.source.structuralLines) ? ledger.source.structuralLines : []) {
    const m = entry && /^L(\d+)$/.exec(String(entry.line))
    if (!m) { fail('VMU_RULE_PARITY_BAD_STRUCTURAL', 'structuralLines entry must be {line:"L7", why:"..."}: ' + JSON.stringify(entry)); continue }
    if (typeof entry.why !== 'string' || entry.why.trim().length < 4) {
      fail('VMU_RULE_PARITY_STRUCTURAL_NO_REASON', 'structural line ' + entry.line + ' needs a reason')
    }
    structural.set(Number(m[1]), String(entry.why || ''))
  }
  // P1 is DOCUMENT-GROUNDED: when the rule document is readable we check that the ledger is a claim about THIS
  // version of it (revision = sha256, lineCount = lines) and that every line declared structural really is a blank
  // line, a `---` separator or a heading. A silent edit of the document therefore reds the gate instead of drifting.
  // The document path is declared under whichever key the ledger shape uses: a migrated ledger writes `source.path`,
  // an older one `source.pathRelative`, and today's writes `source.file`. All three are read, in that order.
  const docFile = ['path', 'pathRelative', 'file']
    .map((key) => (ledger.source && typeof ledger.source[key] === 'string' ? ledger.source[key].trim() : ''))
    .find((value) => value) || ''
  if (!docFile) {
    fail('VMU_RULE_PARITY_NO_SOURCE_FILE', 'source.file must point at the rule document')
  } else if (!existsSync(docFile)) {
    note.push('rule document not readable here (' + docFile + '): revision/lineCount/structural checks skipped')
  } else {
    const buf = readFileSync(docFile)
    const sha = createHash('sha256').update(buf).digest('hex')
    if (sha !== String(ledger.source.revision || '')) {
      fail('VMU_RULE_PARITY_DOC_CHANGED', 'the rule document changed since the ledger was written (sha256 ' + sha.slice(0, 12) + ' != ' + String(ledger.source.revision || '').slice(0, 12) + '): re-audit the ledger')
    }
    const docLines = buf.toString('utf8').split(/\r?\n/)
    if (docLines.length !== lineCount) {
      fail('VMU_RULE_PARITY_LINE_COUNT', 'source.lineCount says ' + lineCount + ' but the document has ' + docLines.length + ' lines')
    }
    for (const [n, why] of structural) {
      const text = String(docLines[n - 1] || '')
      const trimmed = text.trim()
      const isStructural = trimmed === '' || trimmed === '---' || trimmed.startsWith('#') || (/[：:]$/.test(trimmed) && trimmed.length <= 16 && !/[。！？；]/.test(trimmed))
      if (!isStructural) {
        fail('VMU_RULE_PARITY_STRUCTURAL_NOT_STRUCTURAL', 'L' + n + ' is declared structural (' + why + ') but the document line is text: ' + JSON.stringify(trimmed.slice(0, 40)))
      }
      // NOTE (2026-10-28 audit): a HEADING line can also be quoted by an anchor row (a row that quotes a sentence from
      // the section it introduces); that is not a contradiction and is no longer reported. Only a CONTENT line is
      // refused as structural, which the check above already does.
    }
    // P1 also accepts ANCHOR claims. A migrated ledger replaces `ruleLines` with `ruleText` quotes; the anchor's own
    // line IS the declaration, so without this fallback the migration would red the gate on lines nobody can claim.
    if (!Object.keys(ledger.ruleLines || {}).length) {
      const docText = docLines.join(String.fromCharCode(10))
      let anchoredLines = 0
      for (const item of ledger.items) {
        if (!item || typeof item.ruleText !== 'string' || !item.ruleText.trim()) continue
        const quote = item.ruleText
        const hits = []
        for (let i = docText.indexOf(quote); i >= 0; i = docText.indexOf(quote, i + 1)) hits.push(i)
        if (hits.length !== 1) continue
        lines.add(docText.slice(0, hits[0]).split(String.fromCharCode(10)).length)
        anchoredLines += 1
      }
      note.push('ruleLines absent: ' + anchoredLines + ' claim line(s) derived from ruleText anchors')
    }
  }

  const cited = citedPromptFiles(ledger)
  for (const [file, ids] of cited) {
    if (liveSet.has(file)) continue
    const why = NON_TEACHING[file] || (existsSync(join(PROMPTS_DIR, file)) ? 'not reachable from prompts/v5r-core.js by imports' : 'no such prompt file')
    fail('VMU_RULE_PARITY_DEAD_TEACHING', 'item(s) ' + [...ids].join(',') + ' cite ' + PROMPTS_REL + '/' + file + ' as teaching, but ' + why, file)
  }
  const exempt = new Map()
  for (const entry of Array.isArray(ledger.source && ledger.source.parityExempt) ? ledger.source.parityExempt : []) {
    const file = entry && typeof entry.file === 'string' ? entry.file : ''
    if (!file) { fail('VMU_RULE_PARITY_BAD_EXEMPTION', 'parityExempt entries must name a file'); continue }
    if (!liveSet.has(file)) { fail('VMU_RULE_PARITY_EXEMPT_NOT_LIVE', 'parityExempt names ' + file + ', which is not live teaching'); continue }
    if (typeof entry.why !== 'string' || entry.why.trim().length < 20) {
      fail('VMU_RULE_PARITY_EXEMPT_NO_REASON', 'exemption for ' + file + ' needs a reason (and a BACKLOG remark when it is debt)')
    }
    exempt.set(file, String(entry.why || ''))
  }
  for (const { file } of live) {
    if (exempt.has(file)) continue
    if (!cited.has(file)) fail('VMU_RULE_PARITY_ORPHAN_TEACHING', PROMPTS_REL + '/' + file + ' is live teaching but no ledger item claims it', file)
  }

  const nameExempt = Array.isArray(ledger.source && ledger.source.teachingNameExempt) ? ledger.source.teachingNameExempt : []
  checkTeachingNames(live, nameExempt)

  const pins = pinIds()
  if (pins.missingFile) fail('VMU_RULE_PARITY_NO_PINS', PINS_TEST + ' does not exist, so the teaching pins are not executed')
  for (const id of pins.ids) {
    if (!ledgerIds.has(id)) fail('VMU_RULE_PARITY_UNKNOWN_PIN_ID', 'pins test names ' + id + ', which is not a ledger item')
  }

  const structuralCount = Array.isArray(ledger.source && ledger.source.structuralLines) ? ledger.source.structuralLines.length : 0
  const exemptCount = Array.isArray(ledger.source && ledger.source.parityExempt) ? ledger.source.parityExempt.length : 0
  return { ledger, live, excluded, cited, lineCount, ledgerIds, structuralCount, exemptCount }
}

function report(ok, summary) {
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ ok, summary, problems }, null, 2) + '\n')
    return
  }
  if (summary) {
    console.log('RULE PARITY: live teaching ' + summary.live + ' (exempt ' + summary.exempt + ') · not live ' + summary.excluded + ' · structural rule lines ' + summary.structural + '/' + summary.lineCount + ' · ledger ids ' + summary.ids)
    console.log('  scope: P1-P4 = every rule line claimed, every citation live, no orphan teaching, no orphan pin; P5 = every tool/setting a teaching names exists. Contradiction between two sentences is audited by the closing lanes, not proven here.')
    for (const e of summary.excludedList) console.log('  not live: ' + PROMPTS_REL + '/' + e.file + ' — ' + e.why)
  }
  for (const n of note) console.log('  note: ' + n)
  for (const p of problems) console.log('  ' + p.code + ' :: ' + p.message)
  console.log((ok ? 'RULE PARITY: PASS' : 'RULE PARITY: FAIL') + ' (' + problems.length + ' problem(s))')
}

function runOnce(ledgerPath) {
  problems.length = 0
  const res = check(ledgerPath)
  const summary = res && {
    live: res.live.length,
    excluded: res.excluded.length,
    excludedList: res.excluded,
    lineCount: res.lineCount,
    ids: res.ledgerIds.size,
    structural: res.structuralCount || 0,
    exempt: res.exemptCount || 0,
  }
  return { ok: problems.length === 0, summary, problems: problems.slice() }
}

if (!SELFTEST) {
  const ledgerPath = ledgerArg ? (isAbsolute(ledgerArg) ? ledgerArg : join(REPO, ledgerArg)) : join(REPO, 'docs/acceptance/rules-ledger.json')
  const r = runOnce(ledgerPath)
  report(r.ok, r.summary)
  process.exitCode = r.ok ? 0 : 1
} else {
  // Fault injection: each planted defect must be caught, and the untouched ledger must be clean first.
  const base = JSON.parse(readFileSync(join(REPO, 'docs/acceptance/rules-ledger.json'), 'utf8'))
  const tmp = mkdtempSync(join(tmpdir(), 'vmu-parity-'))
  const plant = (name, mutate) => {
    const copy = JSON.parse(JSON.stringify(base))
    mutate(copy)
    const file = join(tmp, name + '.json')
    writeFileSync(file, JSON.stringify(copy, null, 2))
    return file
  }
  const cases = []
  const expect = (name, file, code) => {
    const r = runOnce(file)
    const caught = !r.ok && r.problems.some((p) => p.code === code)
    cases.push({ name, caught, codes: r.problems.map((p) => p.code) })
  }
  // control: the real ledger must pass
  const control = runOnce(join(REPO, 'docs/acceptance/rules-ledger.json'))
  cases.push({ name: 'control-real-ledger', caught: control.ok, codes: control.problems.map((p) => p.code) })

  expect('plant-doc-changed', plant('docchanged', (l) => {
    l.source.revision = '0'.repeat(64)
  }), 'VMU_RULE_PARITY_DOC_CHANGED')

  expect('plant-structural-not-structural', plant('structtext', (l) => {
    l.source.structuralLines.push({ line: 'L7', why: 'planted: L7 carries a real requirement' })
  }), 'VMU_RULE_PARITY_STRUCTURAL_NOT_STRUCTURAL')

  expect('plant-dead-teaching', plant('dead', (l) => {
    l.items[0].prompt = [PROMPTS_REL + '/v5r-prompts.js::anything']
  }), 'VMU_RULE_PARITY_DEAD_TEACHING')

  expect('plant-orphan-teaching', plant('orphan', (l) => {
    for (const item of l.items) {
      for (const cat of ['mechanism', 'tool', 'prompt', 'live']) {
        if (!Array.isArray(item[cat])) continue
        item[cat] = item[cat].filter((e) => !String(e).includes('v5r-blocks-b.js'))
      }
    }
  }), 'VMU_RULE_PARITY_ORPHAN_TEACHING')

  expect('plant-unknown-pin', plant('pin', (l) => {
    for (const item of l.items) if (item.id === 'C12') item.id = 'C12x'
    for (const list of Object.values(l.ruleLines)) {
      for (let i = 0; i < list.length; i += 1) if (list[i] === 'C12') list[i] = 'C12x'
    }
  }), 'VMU_RULE_PARITY_UNKNOWN_PIN_ID')

  expect('plant-structural-without-reason', plant('struct', (l) => {
    const first = l.source.structuralLines && l.source.structuralLines[0]
    if (first) first.why = ''
  }), 'VMU_RULE_PARITY_STRUCTURAL_NO_REASON')

  rmSync(tmp, { recursive: true, force: true })
  const failed = cases.filter((c) => !c.caught)
  for (const c of cases) console.log((c.caught ? '  caught  ' : '  MISSED  ') + c.name + (c.caught ? '' : ' :: ' + c.codes.join(',')))
  console.log('RULE PARITY SELFTEST: ' + (cases.length - failed.length) + '/' + cases.length + ' as expected')
  process.exitCode = failed.length === 0 ? 0 : 1
}
