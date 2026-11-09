#!/usr/bin/env node
// scripts/sim/audit/all.mjs — the ONE entry point for "simulate faithfully, then prove the simulation covers what it claims".
//
//   node scripts/sim/audit/all.mjs                  # all scenarios -> D:/_tmp/sim/run-<stamp>-<pid>/corpus-<name>
//   node scripts/sim/audit/all.mjs --strict         # a missing coverage map is a FAILURE, not a warning
//   node scripts/sim/audit/all.mjs --only mainline  # one scenario
//   node scripts/sim/audit/all.mjs --keep           # keep scenario workspaces for inspection
//   node scripts/sim/audit/all.mjs --out <dir>      # pin the layer (a test or a manual run); the pointer moves there
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
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { REPO } from '../harness.mjs'
import { audit as auditReceipts } from './receipts.mjs'
// ★ TB-2648 §7 MIXED-GEN — the audit's numbers are only about the CODE if every corpus it reads is one generation: a
// receipts file from run A next to a pairs file from run B would make coverage and fidelity describe two trees at once.
import { checkCorpus } from '../corpus-stamp.mjs'
// ONE RULER: the enumeration and the digest of "which receipts did this audit measure" are shared with the release gate
// (release-ready.mjs). The report NAMES the layer it measured (`corpus.dir`) and this run owns that layer; the gate
// re-reads exactly it and refuses a report that names an older layer (audit-r14 A13b: a layer guessed by mtime plus
// membership guessed by mtime let a report omit one corpus dir and still be READY).
import { CURRENT_LAYER_FILE, DEFAULT_SIM_ROOT, corpusDigestOf, corpusFilesIn } from './corpus-files.mjs'
import { treeHashOf } from './release-ready.mjs'
import { RICH_REAL, loadRich, loadSimFields, withoutGlossary, readBaseline, measureFidelity } from './fidelity-measure.mjs'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes('--' + n)
const opt = (n, d) => { const eq = argv.find((a) => a.startsWith('--' + n + '=')); if (eq !== undefined) return eq.slice(('--' + n + '=').length); const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1] }
const STRICT = flag('strict')
const KEEP = flag('keep')
const ONLY = opt('only', null)
// Every run writes its OWN layer: a directory that holds only this run's corpus-<scenario> output. The report names it
// and the gate re-reads only it, so "which files did this audit measure" is answered by the writer, not guessed from
// mtimes. --out pins the layer for tests/manual runs; without it the layer is unique per run.
const SIM_ROOT = process.env.VMU_SIM_ROOT || DEFAULT_SIM_ROOT
const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const PINNED_OUT = opt('out', null)
const BASE = PINNED_OUT === null ? join(SIM_ROOT, 'run-' + runStamp + '-' + process.pid) : resolve(PINNED_OUT)
const POINTER_PATH = join(dirname(BASE), CURRENT_LAYER_FILE)

const SCEN_DIR = join(REPO, 'scripts', 'sim', 'scenarios')
const names = readdirSync(SCEN_DIR).filter((n) => n.endsWith('.mjs')).map((n) => n.replace(/\.mjs$/, '')).sort()
const scenarios = ONLY ? names.filter((n) => n === ONLY) : names
if (!scenarios.length) { console.error('no scenario matched --only ' + ONLY + ' (have: ' + names.join(', ') + ')'); process.exit(2) }

const readJson = (p, def = null) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return def } }
const failures = []
const warnings = []
const lines = []
let fidelitySummary = { liveToolsWithFieldList: 0, compared: 0, gaps: null }
let measuredGapPaths = []
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
  // A run that FAILED may leave a partial corpus, and the scenario failure above already says so: only a corpus whose
  // run exited 0 is asked to prove its own generation. The code is printed verbatim (`MIXED-GEN CORPUS` / `UNSTAMPED
  // CORPUS`) so the failure names the defect instead of "checks failed".
  const generation = checkCorpus(out)
  if (ok && !generation.ok) failures.push('corpus ' + s + ': ' + generation.code + ' — ' + generation.message)
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
// ONE RULER (TB-2653): the measurement lives in ./fidelity-measure.mjs, and the release gate imports the same module
// to RECOMPUTE what a report claims. When the judge and the auditor each had their own copy, the copies drifted and
// the audit reported seven stale baseline claims against a ledger that was in fact current. One module, one answer.
const rich = loadRich(RICH_REAL, readFileSync)
if (!rich.ok) {
  const m = 'no ' + RICH_REAL + ' — the rich live corpus is the only ruler here (run scripts/sim/compare/run.mjs --harvest); the shallow real-fieldset.json is not a substitute'
  say('- ' + m)
  failures.push(m)
} else {
  const simFields = loadSimFields(scenarios.map((s) => ({ receiptsPath: join(corpora[s].out, 'receipts.jsonl') })), readFileSync)
  const declaredRaw = readJson(join(REPO, 'scripts', 'sim', 'audit', 'fidelity-declared.json'), {}) || {}
  const declared = withoutGlossary(declaredRaw)
  // THE BASELINE (TB-2653): a per-field, per-class ledger of gaps that are real today and owned elsewhere. It is not
  // a second declaration file: every row says WHO closes it and WHAT would make the row wrong, a closed row FAILS as
  // a stale claim, and a class cannot be renamed to hide a row (each class has a checkable definition in the file).
  const baselinePath = opt('baseline', join(REPO, 'docs', 'acceptance', 'fidelity-branch-baseline.json'))
  const baselineRaw = readJson(baselinePath, null)
  const baseline = readBaseline(baselineRaw)
  if (!baselineRaw) failures.push('no fidelity baseline at ' + baselinePath + ' — unclassified fidelity gaps cannot be reported as owned')
  else if (baseline.bad.length) failures.push('fidelity baseline rows that do not say what they allow (' + baseline.bad.length + '): ' + baseline.bad.slice(0, 8).join(', '))
  const reading = measureFidelity({ rich, simFields, declared, baseline })
  measuredGapPaths = reading.candidateGaps
  say('- live fields: ' + rich.rowsUsed + ' rich row(s) across ' + reading.liveToolsWithFieldList + ' tool(s); compared: ' + reading.compared + '; gaps: ' + reading.gaps)
  if (reading.gaps) {
    say('  ' + reading.gapList.slice(0, 12).map((g) => g.tool + '.' + g.field).join(' | '))
    failures.push('fidelity gaps: ' + reading.gaps)
  }
  const badDecl = Object.keys(declared).filter((k) => {
    const row = declared[k]
    const note = row !== null && typeof row === 'object' ? String(row.note || '') : ''
    return note.trim().length < 20
  })
  if (badDecl.length) failures.push('fidelity declarations without a real reason (>=20 chars): ' + badDecl.join(', '))
  const declaredKeyCount = Object.keys(declared).reduce((n, k) => {
    const row = declared[k]
    return n + (row !== null && typeof row === 'object' && Array.isArray(row.keys) ? row.keys.length : 0)
  }, 0)
  if (declaredKeyCount) say('- gaps absorbed by declarations: ' + reading.declaredGapPaths.length + ' path(s) from ' + declaredKeyCount + ' key(s) across ' + Object.keys(declared).length + ' tool(s)')
  if (baseline.items.length) say('- gaps absorbed by baseline: ' + reading.baselineUsed + ' field(s), pending-fix ' + reading.pendingFixUsed.length + ' of ' + reading.pendingFixTotal + ' (count pinned by tests/sim-fidelity-baseline.test.mjs)')
  if (reading.staleBaseline.length) { say('- stale baseline claims: ' + reading.staleBaseline.length + ' (the gap is closed or never observed)'); failures.push('fidelity baseline claims that no longer hold: ' + reading.staleBaseline.length + ' — ' + reading.staleBaseline.slice(0, 8).join(', ')) }
  if (reading.staleDeclarations.length) warnings.push('fidelity declarations that no longer match any gap (drop them): ' + reading.staleDeclarations.join(', '))
  if (reading.staleDeclaredKeys.length) warnings.push('fidelity declarations that name keys which are no longer gaps (narrow or drop them): ' + reading.staleDeclaredKeys.join(', '))
  fidelitySummary = { liveToolsWithFieldList: reading.liveToolsWithFieldList, compared: reading.compared, gaps: reading.gaps, gapList: (reading.gapList || []).map((g) => String(g.tool) + '.' + String(g.field)), baselineRows: baseline.items.length, baselineUsed: reading.baselineUsed, pendingFix: reading.pendingFixTotal, staleBaseline: reading.staleBaseline.length, richRows: rich.rowsUsed }
}

// ── verdict ─────────────────────────────────────────────────────────────────────────────────────────────────────
say('')
const verdict = failures.length === 0 ? 'AUDIT: PASS' : 'AUDIT: FAIL'
say(verdict + ' — ' + failures.length + ' failure(s), ' + warnings.length + ' warning(s)')
for (const f of failures) say('  FAIL ' + f)
for (const w of warnings) say('  WARN ' + w)
// ── provenance stamp (AUDIT-14 / P0-2) ─────────────────────────────────────────────────────────────────────────
// A verdict line and five headings are typable in twelve lines, so prose alone cannot prove a report came from this
// tool. The machine-readable block below is what the release gate parses: who wrote the report, a fresh audit id, the
// CONTENT-bound hash of the tree it actually read (dirty PATH sets are blind to edits -- the audit itself saw the diff
// grow while the porcelain sha stayed identical), the corpus it measured, and every P0-class finding, each of which
// must have a row in docs/acceptance/sim-audit-open-items.json.
const receiptsTotal = scenarios.reduce((n, s) => n + (corpora[s].receipts || []).length, 0)
// The corpus this report measured, named file by file: the release gate re-reads THESE files FROM THE LAYER THIS RUN
// OWNS, so "the corpus" is a list a reader can re-hash, not a number in a sentence. The list is every corpus dir in the
// layer -- not "every scenario I meant to run": a layer that holds a corpus dir this run did not produce has been
// written by somebody else, and that must be a named failure here rather than an unlisted extra the gate discovers.
const layerFiles = corpusFilesIn(BASE)
const measuredCorpus = layerFiles
const foreignLayers = layerFiles.filter((f) => !scenarios.includes(f.scenario))
const corpusFileList = measuredCorpus.map((f) => ({ scenario: f.scenario, path: f.receiptsPath, bytes: f.bytes, sha256: f.sha256 }))
const corpusId = corpusDigestOf(measuredCorpus)
say('- corpus layer (this run owns it; the report names it): `' + BASE + '`')
say('- corpus files: ' + corpusFileList.length + ' receipt file(s), ' + corpusFileList.reduce((n, f) => n + (f.bytes || 0), 0) + ' byte(s), id ' + corpusId.slice(0, 20))
if (foreignLayers.length) {
  failures.push('corpus layer ' + BASE + ' holds corpus dir(s) this run did not produce: ' + foreignLayers.map((f) => f.scenario).slice(0, 5).join(', ') + ' — a layer is owned by one run, and a report cannot vouch for a file its run never wrote')
}
if (measuredCorpus.length !== scenarios.length) {
  failures.push('corpus file list: ' + measuredCorpus.length + ' of ' + scenarios.length + ' scenario(s) produced a readable receipts.jsonl — the report would name a corpus it did not measure')
}
const tree = treeHashOf(REPO)
const p0 = failures.map((f, i) => ({ id: 'audit-finding-' + String(i + 1).padStart(2, '0'), title: f, severity: 'P0', owner: 'see the FAIL line in this report' }))
// The audit id is DERIVED, not minted: sha256(corpus bytes | tree hash). The release gate recomputes both inputs and
// therefore the id itself, so an id can no longer be "declared" by whoever wrote the file. This is not an
// unforgeability claim -- the formula is public and anyone can compute it. It is a binding: the id, the corpus and
// the tree cannot disagree, and the gate's independent fidelity recomputation (R3) is what makes a forgery worthless.
const derivedAuditId = 'aid-' + createHash('sha256').update(corpusId + '|' + String(tree.hash || '(no tree)')).digest('hex').slice(0, 32)
const auditManifest = {
  tool: 'scripts/sim/audit/all.mjs',
  auditId: derivedAuditId,
  generatedAt: new Date().toISOString(),
  tree: { ok: tree.ok, head: tree.head, hash: tree.hash, changed: tree.changed },
  corpus: { scenarios: scenarios.length, receipts: receiptsTotal, corpusId, dir: BASE, corpusFiles: corpusFileList },
  fidelity: fidelitySummary,
  checks: { verdict: failures.length === 0 ? 'PASS' : 'FAIL', failures: failures.length, warnings: warnings.length },
  p0,
}
// SINGLE-WRITER POINTER: this layer is now the current one. Written as tmp + rename in the SAME directory because a
// rename is atomic there -- a truncated pointer would make the gate unable to tell which layer is current, and "no
// pointer" must stay distinguishable from "an older pointer". The pointer is DATA on the sim root (never in the repo):
// a report may honestly describe an older layer, but the release gate only accepts the current one.
const pointer = {
  dir: BASE,
  corpusId,
  auditId: derivedAuditId,
  generatedAt: auditManifest.generatedAt,
  pid: process.pid,
  at: new Date().toISOString(),
}
mkdirSync(dirname(POINTER_PATH), { recursive: true })
const pointerTmp = POINTER_PATH + '.' + process.pid + '.tmp'
writeFileSync(pointerTmp, JSON.stringify(pointer, null, 2) + String.fromCharCode(10))
renameSync(pointerTmp, POINTER_PATH)
say('- current layer pointer: `' + POINTER_PATH + '` -> ' + BASE)
say('')
say('```json audit-report')
say(JSON.stringify(auditManifest, null, 2))
say('```')
mkdirSync(BASE, { recursive: true })
writeFileSync(join(BASE, 'AUDIT.md'), lines.join(String.fromCharCode(10)) + String.fromCharCode(10))
// The measured gap set, as DATA: scripts/sim/audit/refresh-fidelity-baseline.mjs reads this file instead of
// recomputing the same measurement a second time. Two recomputations of one measurement is two rulers.
writeFileSync(join(BASE, 'fidelity-gaps.json'), JSON.stringify({ generatedAt: auditManifest.generatedAt, corpusId, tree: auditManifest.tree, gaps: measuredGapPaths }, null, 2) + String.fromCharCode(10))
console.log(String.fromCharCode(10) + 'report: ' + join(BASE, 'AUDIT.md'))
process.exitCode = failures.length === 0 ? 0 : 1
