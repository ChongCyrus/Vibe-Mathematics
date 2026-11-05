#!/usr/bin/env node
// scripts/sim/audit/all.mjs — the ONE entry point for "simulate faithfully, then prove the simulation covers what it claims".
//
//   node scripts/sim/audit/all.mjs                  # all scenarios -> D:/_tmp/sim/corpus-<name>, then four checks
//   node scripts/sim/audit/all.mjs --strict         # a missing coverage map is a FAILURE, not a warning
//   node scripts/sim/audit/all.mjs --only mainline  # one scenario
//   node scripts/sim/audit/all.mjs --keep           # keep scenario workspaces for inspection
//
// WHY THIS EXISTS (RUN 240). The user's requirement is not "run some scenarios": it is
//   (a) COVERAGE that cannot silently shrink — every one of the 93 rules in 宏观层面v5r运行规则.md, and every tool
//       action the repo DECLARES, must be exercised by a real scenario step (or be named as never-exercised, with why);
//   (b) FIDELITY that is measured against the live machine — the receipts a scenario produces must carry the same
//       field names a live run's receipts carried, and a tool the live runs never called is a coverage blind spot;
//   (c) a corpus rich enough for OTHER agents to audit (receipts, prompts, file tree, steps) without re-running.
// Each of those is a check below, and each check prints WHAT IT EXAMINED and how much of it, so "0 problems" can never
// mean "0 checks".

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO } from '../harness.mjs'
import { audit as auditReceipts } from './receipts.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1] }
const STRICT = flag('strict')
const KEEP = flag('keep')
const BASE = opt('out', 'D:/_tmp/sim')
const ONLY = opt('only', null)

const SCEN_DIR = join(REPO, 'scripts', 'sim', 'scenarios')
const names = readdirSync(SCEN_DIR).filter((n) => n.endsWith('.mjs')).map((n) => n.replace(/\.mjs$/, '')).sort()
const scenarios = ONLY ? names.filter((n) => n === ONLY) : names
if (!scenarios.length) { console.error('no scenario matched --only ' + ONLY + ' (have: ' + names.join(', ') + ')'); process.exit(2) }

const readJson = (p, def = null) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return def } }
const failures = []
const warnings = []
const lines = []
const say = (s) => { lines.push(s); console.log(s) }

// ── 1) run every scenario against the REAL kernel and keep the corpus ────────────────────────────────────────────
say('## 1. scenarios (real kernel, real receipts)')
const corpora = {}
for (const s of scenarios) {
  const out = join(BASE, 'corpus-' + s)
  const args = [join(REPO, 'scripts', 'sim', 'run.mjs'), '--scenario', s, '--out', out]
  if (KEEP) args.push('--keep')
  const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const manifest = readJson(join(out, 'manifest.json'), {}) || {}
  let receiptRows = []
  try {
    const txt = readFileSync(join(out, 'receipts.jsonl'), 'utf8')
    receiptRows = txt.split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l))
  } catch { receiptRows = [] }
  corpora[s] = { out, manifest, receipts: receiptRows }
  const ok = r.status === 0
  say('- ' + s + ': ' + (ok ? 'OK' : 'FAILED (exit ' + r.status + ')') +
    ' — steps ' + (manifest.steps || 0) + ', calls ' + (manifest.receipts || 0) + ', prompts ' + (manifest.prompts || 0) +
    ', refusals ' + JSON.stringify(manifest.refusals || {}))
  if (!ok) {
    failures.push('scenario ' + s + ' exited ' + r.status + ' (a mechanism refusal is a defect, not a nuisance): ' +
      String(r.stdout || '').split(String.fromCharCode(10)).filter((l) => /REFUSED|refusal|mechanism/.test(l)).slice(0, 6).join(' | '))
  }
}

// ── 2) receipt audit (A1–A5) on every corpus ─────────────────────────────────────────────────────────────────────
say('')
say('## 2. receipt audit A1–A5')
let receiptFindings = 0
for (const s of scenarios) {
  const out = auditReceipts(corpora[s].out)
  const n = out.findings.length
  receiptFindings += n
  say('- ' + s + ': ' + n + ' finding(s) over ' + out.calls + ' calls / ' + out.treeFiles + ' files' + (n ? ' — ' + out.findings.slice(0, 5).map((f) => f.check + ' ' + (f.code || '')).join(', ') : ''))
  if (n) failures.push('receipt audit ' + s + ': ' + n + ' finding(s)')
}

// ── 3) RULE COVERAGE: every one of the 93 rules must be exercised by a named step ─────────────────────────────────
say('')
say('## 3. rule coverage (93 rules -> scenario steps)')
const stepsByScenario = {}
for (const s of scenarios) {
  const doc = readJson(join(corpora[s].out, 'steps', 'steps.json'), null)
  stepsByScenario[s] = doc && Array.isArray(doc.steps) ? doc.steps : []
}
const ruleSteps = readJson(join(REPO, 'scripts', 'sim', 'audit', 'rule-steps.json'), null)
const ledger = readJson(join(REPO, 'docs', 'acceptance', 'rules-ledger.json'), null)
const ruleIds = ledger && Array.isArray(ledger.items) ? ledger.items.map((i) => i.id).filter(Boolean) : []
if (!ruleSteps) {
  const m = 'no scripts/sim/audit/rule-steps.json yet — rule coverage cannot be proven (the map is what makes it provable)'
  say('- ' + m)
  ;(STRICT ? failures : warnings).push(m)
} else {
  let covered = 0
  const uncovered = []
  const dangling = []
  // The map is written by scripts/sim/audit/rule-steps.json's generator with a top-level envelope
  // ({schemaVersion, source, scenarios, vocabulary, rules, uncovered}), so `rules` is where the per-rule rows live.
  // Reading the envelope as if it were the map is how this check reported "0 covered" while covering 63 (RUN 240).
  const ruleMap = ruleSteps.rules !== undefined && ruleSteps.rules !== null ? ruleSteps.rules : ruleSteps
  for (const id of ruleIds) {
    const entry = ruleMap[id]
    if (!entry || !Array.isArray(entry.steps) || !entry.steps.length) { uncovered.push(id); continue }
    let hit = 0
    for (const st of entry.steps) {
      const steps = stepsByScenario[st.scenario] || []
      const found = steps.find((x) => x.name === st.step)
      if (!found) { dangling.push(id + ' -> ' + st.scenario + '/' + st.step + ' (step does not exist in the corpus)'); continue }
      // WHAT A STEP'S OUTCOME LOOKS LIKE (measured, RUN 240): a corpus step records `ok` = "the tool call returned" and
      // `code` = "the named answer it carried". A named refusal is therefore `code` present, NOT `ok:false` — e.g.
      // turns/probe-member-caller is `{ok:true, code:"VMU_NOT_PERMITTED"}`. Reading the refusal side as `ok===false`
      // marked five correct mappings as dangling and would have pushed the map author to delete true rows.
      const codeText = found.code === undefined || found.code === null ? '' : String(found.code)
      if (st.side === 'refuse' && codeText === '') { dangling.push(id + ' -> ' + st.scenario + '/' + st.step + ' (declared a REFUSAL, the step carried no code)'); continue }
      if (st.side === 'allow' && codeText !== '') { dangling.push(id + ' -> ' + st.scenario + '/' + st.step + ' (declared ALLOWED, the step was refused: ' + codeText + ')'); continue }
      hit += 1
    }
    if (hit) covered += 1; else if (!uncovered.includes(id)) uncovered.push(id)
  }
  say('- rules in ledger: ' + ruleIds.length + '; covered by an existing step: ' + covered + '; uncovered: ' + uncovered.length + '; dangling references: ' + dangling.length)
  if (uncovered.length) { say('  uncovered: ' + uncovered.join(', ')); failures.push('rules with no exercised step: ' + uncovered.join(', ')) }
  if (dangling.length) { say('  dangling: ' + dangling.slice(0, 12).join(' | ')); failures.push('rule map references steps that do not behave as declared: ' + dangling.length) }
  // a rule map that covers 0 rules is not a pass even if it parses
  if (ruleIds.length === 0) failures.push('rules-ledger.json yielded no rule ids: the coverage check examined nothing')
}

// ── 4) ACTION COVERAGE: every declared tool action must be exercised or named as never ───────────────────────────
say('')
say('## 4. action coverage (declared tool actions -> exercised)')
const actionCov = readJson(join(REPO, 'scripts', 'sim', 'audit', 'action-coverage.json'), null)
if (!actionCov) {
  const m = 'no scripts/sim/audit/action-coverage.json yet — declared-action coverage cannot be proven'
  say('- ' + m)
  ;(STRICT ? failures : warnings).push(m)
} else {
  const tools = Object.keys(actionCov)
  let declaredN = 0, coveredN = 0
  const never = []
  for (const t of tools) {
    const row = actionCov[t] || {}
    const ds = Array.isArray(row.actions) ? row.actions : []
    const cs = Array.isArray(row.covered) ? row.covered : []
    declaredN += ds.length
    coveredN += cs.length
    // The matrix names each unexercised verb in `never: [action]` and explains it in `why: { action: {class, note} }`.
    // The reason lives one level up from the action, not on the action — reading it off the action is how this check
    // reported all 157 reasons missing while every one of them was filed (RUN 240).
    const whyOf = row.why !== null && typeof row.why === 'object' ? row.why : {}
    for (const a of Array.isArray(row.never) ? row.never : []) {
      const act = typeof a === 'string' ? a : String((a && a.action) || '')
      const filed = whyOf[act]
      const why = filed === undefined || filed === null ? '' : String((filed.note || filed.why || '') + (filed.class || ''))
      if (!why.trim()) never.push(t + ':' + act)
    }
  }
  say('- tools: ' + tools.length + '; declared actions: ' + declaredN + '; covered: ' + coveredN + '; never-exercised rows: ' + (declaredN - coveredN))
  if (never.length) { say('  never-exercised WITHOUT a declared reason: ' + never.slice(0, 12).join(', ')); failures.push('never-exercised actions with no reason: ' + never.length) }
}

// ── 5) FIDELITY: simulator receipts vs the field names a LIVE run really produced ───────────────────────────────
say('')
say('## 5. fidelity vs live receipts')
const realFieldset = readJson('D:/_tmp/sim/real-fieldset.json', null)
if (!realFieldset) {
  const m = 'no D:/_tmp/sim/real-fieldset.json yet — fidelity cannot be measured (run scripts/sim/harvest/real.mjs)'
  say('- ' + m)
  ;(STRICT ? failures : warnings).push(m)
} else {
  const simFieldset = {}
  for (const s of scenarios) {
    for (const r of corpora[s].receipts) {
      const t = r.tool || (r.receipt && r.receipt.tool) || '?'
      if (!simFieldset[t]) simFieldset[t] = new Set()
      for (const k of Object.keys((r.receipt && typeof r.receipt === 'object' && r.receipt) || {})) simFieldset[t].add(k)
    }
  }
  // A gap that CANNOT be closed by writing a better scenario has to be declared, with a reason and a kind — the
  // same discipline `action-coverage.json` uses for verbs. Undeclared gaps stay failures; a declaration that no
  // longer matches a gap is itself a warning (a stale excuse is how an allowlist rots).
  const declaredRaw = readJson(join(REPO, 'scripts', 'sim', 'audit', 'fidelity-declared.json'), {}) || {}
  // Keys that start with an underscore are documentation for the human editing the file (`_why`, `_kinds`), not
  // declarations about a tool. Counting them as declarations made the gate demand a reason for its own glossary.
  const declared = {}
  for (const [k, v] of Object.entries(declaredRaw)) if (!k.startsWith('_')) declared[k] = v
  let compared = 0
  const missing = []
  const declaredHits = new Set()
  const staleKeyDeclarations = []
  for (const [tool, set] of Object.entries(realFieldset)) {
    const keys = Array.isArray(set) ? set : (set && Array.isArray(set.keys) ? set.keys : [])
    if (!keys.length) continue
    // ★★★ RUN 240: a declaration can name WHICH keys it covers. Declaring a whole tool to silence one unreachable
    // field was the gateway to hiding every future regression of that tool: the entry said "we cannot reach this
    // here" and the gate stopped looking at the other keys. `keys: [...]` keeps the exemption at the size of the
    // fact. A tool gap (no scenario calls it at all) must have every one of its keys declared.
    const declRow = declared[tool]
    const declKeys = declRow !== null && typeof declRow === 'object' && Array.isArray(declRow.keys)
      ? declRow.keys.map(String) : null
    const declaredGapKeys = []
    const residualOf = (gapKeys) => {
      if (declRow === undefined) return gapKeys
      if (declKeys === null) { declaredGapKeys.push(...gapKeys); return [] }
      const residual = []
      for (const k of gapKeys) (declKeys.includes(k) ? declaredGapKeys : residual).push(k)
      return residual
    }
    if (!simFieldset[tool]) {
      if (declRow !== undefined) {
        declaredHits.add(tool)
        declaredGapKeys.push(...keys)
        staleKeyDeclarations.push(...declKeys === null ? [] : declKeys.filter((k) => !keys.includes(k)))
        continue
      }
      missing.push(tool + ' (live called it, no scenario ever does)')
      continue
    }
    compared += 1
    const gap = keys.filter((k) => !simFieldset[tool].has(k))
    if (!gap.length) continue
    const residual = residualOf(gap)
    if (declaredGapKeys.length) {
      declaredHits.add(tool)
      if (declKeys !== null) staleKeyDeclarations.push(...declKeys.filter((k) => keys.includes(k) && !gap.includes(k)))
    }
    if (residual.length) missing.push(tool + ' missing ' + residual.join('/'))
  }
  say('- live tools with a field list: ' + Object.keys(realFieldset).length + '; compared: ' + compared + '; gaps: ' + missing.length)
  // A live receipt carrying a field the simulator never emits is a FIDELITY gap, not a style question: the scenario
  // is not producing the shape the live machine produces, so anything it proves about that field proves nothing.
  if (missing.length) { say('  ' + missing.slice(0, 15).join(' | ')); failures.push('fidelity gaps: ' + missing.length) }
  const declaredRows = Object.keys(declared)
  const badDecl = declaredRows.filter((k) => {
    const row = declared[k]
    const note = row !== null && typeof row === 'object' ? String(row.note || '') : ''
    return note.trim().length < 20
  })
  if (badDecl.length) failures.push('fidelity declarations without a real reason (>=20 chars): ' + badDecl.join(', '))
  if (declaredRows.length) say('- declared-unreachable gaps: ' + declaredRows.length + ' (with a filed reason); matched: ' + declaredHits.size)
  const staleDecl = declaredRows.filter((k) => !declaredHits.has(k))
  if (staleDecl.length) warnings.push('fidelity declarations that no longer match any gap (drop them): ' + staleDecl.join(', '))
  if (staleKeyDeclarations.length) {
    warnings.push('fidelity declarations that name keys which are no longer gaps (narrow or drop them): ' + Array.from(new Set(staleKeyDeclarations)).sort().join(', '))
  }
  const declaredKeyCount = declaredRows.reduce((n, k) => {
    const row = declared[k]
    return n + (row !== null && typeof row === 'object' && Array.isArray(row.keys) ? row.keys.length : 0)
  }, 0)
  if (declaredKeyCount) say('- declarations are key-scoped: ' + declaredKeyCount + ' key(s) exempted across ' + declaredRows.length + ' tool(s)')
}

// ── verdict ─────────────────────────────────────────────────────────────────────────────────────────────────────
say('')
const verdict = failures.length === 0 ? 'AUDIT: PASS' : 'AUDIT: FAIL'
say(verdict + ' — ' + failures.length + ' failure(s), ' + warnings.length + ' warning(s)')
for (const f of failures) say('  FAIL ' + f)
for (const w of warnings) say('  WARN ' + w)
mkdirSync(BASE, { recursive: true })
writeFileSync(join(BASE, 'AUDIT.md'), lines.join(String.fromCharCode(10)) + String.fromCharCode(10))
console.log(String.fromCharCode(10) + 'report: ' + join(BASE, 'AUDIT.md'))
process.exitCode = failures.length === 0 ? 0 : 1
