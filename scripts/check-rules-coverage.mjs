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
// requirement; each evidence entry is `path::pattern`, and this gate re-reads the file and matches the pattern.
// That is the difference between a claim and a citation: a renamed symbol or a deleted line turns the gate red.
//
// ✓ node scripts/check-rules-coverage.mjs               # structural audit + counts (green from day one)
// ✓ node scripts/check-rules-coverage.mjs --check       # the closing gate: any PARTIAL/MISSING fails
// ✓ node scripts/check-rules-coverage.mjs --draft       # alias that states the intent (in-progress work)
// ✓ node scripts/check-rules-coverage.mjs --json
// ✓ node scripts/check-rules-coverage.mjs --ledger other.json   # fault-injection in tests
//
// Exit codes: 0 = every requested rule holds; 1 = a structural problem or (with --check) an unfinished row.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const STRICT = args.includes('--check')
const DRAFT = args.includes('--draft')
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

const problems = []
const fail = (code, message, detail) => problems.push({ code, message, detail: detail || null })

function evidenceResolves(entry) {
  const cut = String(entry).indexOf('::')
  if (cut <= 0) return { ok: false, why: 'evidence must be written as `path::pattern`' }
  const rel = String(entry).slice(0, cut)
  const pattern = String(entry).slice(cut + 2)
  const file = isAbsolute(rel) ? rel : join(REPO, rel)
  if (!existsSync(file)) return { ok: false, why: 'no such file: ' + rel }
  let text
  try { text = readFileSync(file, 'utf8') } catch (e) { return { ok: false, why: 'unreadable: ' + rel } }
  let matched = false
  try {
    matched = new RegExp(pattern).test(text)
  } catch {
    matched = text.includes(pattern)
  }
  return matched ? { ok: true } : { ok: false, why: 'pattern not found in ' + rel + ': ' + pattern }
}

function loadLedger() {
  if (!existsSync(LEDGER)) { fail('VMU_RULES_NO_LEDGER', 'the ledger does not exist: ' + LEDGER); return null }
  let ledger
  try { ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) } catch (e) {
    fail('VMU_RULES_BAD_JSON', 'the ledger is not valid JSON: ' + String(e.message || e))
    return null
  }
  if (!ledger || typeof ledger !== 'object') { fail('VMU_RULES_BAD_SHAPE', 'the ledger must be an object'); return null }
  if (!ledger.source || typeof ledger.source.file !== 'string' || typeof ledger.source.revision !== 'string') {
    fail('VMU_RULES_NO_SOURCE', 'source.file and source.revision must name the rule document this ledger claims')
  }
  if (!Array.isArray(ledger.items) || ledger.items.length === 0) {
    fail('VMU_RULES_NO_ITEMS', 'items[] must hold at least one atomic requirement')
    return null
  }
  if (!ledger.ruleLines || typeof ledger.ruleLines !== 'object') {
    fail('VMU_RULES_NO_RULE_LINES', 'ruleLines{} must map the source inventory to item ids')
  }
  return ledger
}

const ledger = loadLedger()
if (!ledger) {
  report()
} else {
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
      if (!['id', 'rule', 'text', 'status', 'next', 'note'].includes(key) && !CATEGORIES.includes(key)) {
        fail('VMU_RULES_UNKNOWN_FIELD', 'item ' + id + ' carries an unknown field: ' + key)
      }
    }
    for (const cat of CATEGORIES) {
      const list = item[cat]
      if (list === undefined) continue
      if (!Array.isArray(list)) { fail('VMU_RULES_BAD_EVIDENCE', 'item ' + id + ' `' + cat + '` must be an array'); continue }
      for (const entry of list) {
        const r = evidenceResolves(entry)
        if (!r.ok) fail('VMU_RULES_EVIDENCE_UNRESOLVED', 'item ' + id + ' `' + cat + '`: ' + r.why, entry)
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

  // Every rule sentence must be claimed by at least one item, and every item must live under a claimed sentence.
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

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ ok: problems.length === 0, source: ledger.source, counts, total, unfinished, problems }, null, 2) + '\n')
  } else {
    console.log('RULE LEDGER: ' + total + ' atomic requirement(s) · DONE ' + counts.DONE + ' · PARTIAL ' + counts.PARTIAL +
      ' · MISSING ' + counts.MISSING + ' · DECIDED ' + counts.DECIDED)
    console.log('  source: ' + ledger.source.file + ' rev ' + String(ledger.source.revision).slice(0, 12) + ' (' + ledger.source.lineCount + ' lines)')
    if (problems.length === 0) {
      console.log('  every four-question claim resolves; ' + (STRICT && !DRAFT
        ? 'nothing is unfinished: this is the closing gate'
        : unfinished
          ? 'still open: ' + unfinished + ' row(s) — run with --check before closing a goal'
          : 'nothing is unfinished'))
    } else {
      for (const p of problems) console.log('  ' + p.code + ' :: ' + p.message + (p.detail ? ' :: ' + String(p.detail).slice(0, 200) : ''))
    }
    console.log((problems.length === 0 ? 'RULES COVERAGE: PASS' : 'RULES COVERAGE: FAIL') + ' (' + problems.length + ' problem(s))')
  }
}

function report() {
  if (JSON_OUT) process.stdout.write(JSON.stringify({ ok: false, problems }, null, 2) + '\n')
  else {
    for (const p of problems) console.log('  ' + p.code + ' :: ' + p.message)
    console.log('RULES COVERAGE: FAIL (' + problems.length + ' problem(s))')
  }
}

process.exitCode = problems.length === 0 ? 0 : 1
