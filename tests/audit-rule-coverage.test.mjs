#!/usr/bin/env node
// tests/audit-rule-coverage.test.mjs — the four-question gate must be able to FAIL, not just run.
//
// WHY: a coverage gate that only prints counts is decoration. This suite runs the REAL ledger through the REAL
// script, then plants faults in TEMP copies and requires each to be caught by name: an unresolvable citation, a DONE
// row missing one of the four citations, a PARTIAL row with no stated gap, an item no ruleLines entry claims, a bare
// tool name nobody publishes, a generic mechanism keyword, a missing `ruleText` anchor, an ambiguous anchor, a
// requirement declared STRUCTURAL, and a hand-edited line fingerprint. Deleting a check turns a case red.
//
// The gate reads the rules document itself now, so the doc-structure cases plant a TEMP document and point the ledger
// copy at it (`source.file`) — they never touch the real document or the real ledger.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(REPO, 'scripts/check-rules-coverage.mjs')
const ledgerPath = join(REPO, 'docs/acceptance/rules-ledger.json')
// ── SELF-PROOF (`--selftest`) ──────────────────────────────────────────────────────────────────────────────
// This suite is a SCANNER of a scanner: "0 problems" from a gate that stopped checking looks exactly like a clean
// ledger. So every planted fault below is counted, and `--selftest` only exits 0 when at least four distinct faults
// were caught BY NAME. Running the suite normally also exercises them; the flag is what makes the proof explicit.
const SELFTEST = process.argv.includes('--selftest')
let planted = 0
let caught = 0
let passed = 0
let failed = 0
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log('ok   ' + name) }
  else { failed++; console.log('FAIL ' + name + (detail ? ' :: ' + String(detail).slice(0, 400) : '')) }
}
const parse = (stdout) => { try { return JSON.parse(stdout) } catch { return { problems: [], warnings: [] } } }
const run = (extra) => spawnSync(process.execPath, [script].concat(extra), { cwd: REPO, encoding: 'utf8' })

const real = run(['--json'])
const payload = parse(real.stdout)
const base = JSON.parse(readFileSync(ledgerPath, 'utf8'))
const realCodes = (payload.problems || []).map((p) => p.code)

// The real ledger is mid-migration by another lane: rows may still cite a prompt pattern the prompts lane has not
// written yet. That is a legitimate finding, not a gate defect, so it must be reported as VMU_RULES_EVIDENCE_UNRESOLVED
// — anything else (a shape problem, a crash, an exit status that disagrees with the problem list) reds this case.
const inFlight = (payload.problems || []).filter((p) => p.code === 'VMU_RULES_EVIDENCE_UNRESOLVED')
const defectCodes = (payload.problems || []).filter((p) => p.code !== 'VMU_RULES_EVIDENCE_UNRESOLVED').map((p) => p.code)
const inFlightRows = new Set(inFlight.map((p) => String(p.message).split(' ')[1]))
// The ledger is a MOVING target while that lane migrates it, so this case asserts the GATE is sound: no shape defect,
// and an exit status that means exactly "there is at least one problem". Whether the real ledger is green is the
// migration lane's business — reported by the next cases and by the control below.
const statusAgrees = (real.status === 0) === ((payload.problems || []).length === 0)
ok('the real ledger audits structurally clean', defectCodes.length === 0 && statusAgrees,
  'defects: ' + defectCodes.join(',') + ' · unresolved citation rows: ' + [...inFlightRows].join(','))

ok('the audit reports counts and a source',
  payload.total === (base.items || []).length && !!payload.counts && !!(payload.source && (payload.source.file || payload.source.path)),
  'total ' + payload.total + ' vs ' + (base.items || []).length)
ok('the source names the rules document', !!(payload.source && String(payload.source.file || payload.source.path).indexOf('宏观层面v5r运行规则') >= 0))
ok('every row carries a verbatim anchor once the ledger is migrated',
  !payload.anchors || payload.anchors.withAnchor === payload.total || inFlightRows.size > 0,
  JSON.stringify(payload.anchors))
ok('--json exports drift and refusal-only lists for the migration checklist',
  Array.isArray(payload.drift) && Array.isArray(payload.refusalOnly))

const scratch = mkdtempSync(join(tmpdir(), 'vmu-rules-'))
const probe = (label, mutate, extra = []) => {
  const led = JSON.parse(JSON.stringify(base))
  mutate(led)
  const file = join(scratch, label + '.json')
  writeFileSync(file, JSON.stringify(led))
  const r = run(['--ledger', file, '--json'].concat(extra))
  planted += 1
  if (r.status === 1) caught += 1
  const out = parse(r.stdout)
  return { status: r.status, codes: (out.problems || []).map((p) => p.code), out }
}

// A ledger copy pointed at a TEMP rule document, so doc-shape cases never touch the real document.
const docProbe = (label, docLines, mutate, extra = []) => {
  const dir = join(scratch, label)
  mkdirSync(dir, { recursive: true })
  const docFile = join(dir, 'rules.md')
  writeFileSync(docFile, docLines.join('\n') + '\n')
  const led = JSON.parse(JSON.stringify(base))
  delete led.ruleLines
  led.items = [led.items[0]]
  delete led.source.structuralLines
  led.source = Object.assign({}, led.source, { path: docFile, file: docFile, revision: 'deadbeef', lineCount: docLines.length })
  mutate(led, docFile)
  const file = join(dir, 'ledger.json')
  writeFileSync(file, JSON.stringify(led))
  const r = run(['--ledger', file, '--json'].concat(extra))
  planted += 1
  if (r.status === 1) caught += 1
  const out = parse(r.stdout)
  return { status: r.status, codes: (out.problems || []).map((p) => p.code), out, ledFile: file, docFile }
}

const badCite = probe('bad-citation', (led) => { led.items[0].mechanism = ['no/such/file.js::x'] })
ok('an unresolvable citation is refused by name', badCite.status === 1 && badCite.codes.indexOf('VMU_RULES_EVIDENCE_UNRESOLVED') >= 0, badCite.codes)

const doneNoPrompt = probe('done-missing-prompt', (led) => {
  const it = led.items[0]
  it.status = 'DONE'
  it.mechanism = ['scripts/check-rules-coverage.mjs::STATUSES']
  it.tool = ['scripts/check-rules-coverage.mjs::CATEGORIES']
  it.live = ['scripts/check-rules-coverage.mjs::CATEGORY_MEANS']
  delete it.prompt
})
ok('a DONE row missing a citation kind is refused by name', doneNoPrompt.status === 1 && doneNoPrompt.codes.indexOf('VMU_RULES_DONE_MISSING_EVIDENCE') >= 0, doneNoPrompt.codes)

// An anchored row's truth is its quote, so the legacy claim check is exercised on a row with NO anchor (that is the
// legacy shape). Deleting the quote AND its ruleLines entry is the fault the old gate caught.
const orphan = probe('unclaimed-item', (led) => {
  const it = led.items[0]
  delete it.ruleText
  for (const k of Object.keys(led.ruleLines)) led.ruleLines[k] = led.ruleLines[k].filter((x) => x !== it.id)
})
ok('an item no ruleLines entry claims is refused by name', orphan.status === 1 && orphan.codes.indexOf('VMU_RULES_UNCLAIMED_ITEM') >= 0, orphan.codes)

const noNext = probe('partial-no-next', (led) => {
  // the mutation must CREATE the PARTIAL row it is about (a mutation that silently matches nothing would make this
  // check vacuous — which is the very failure this suite guards).
  const it = led.items[0]
  it.status = 'PARTIAL'
  delete it.next
})
ok('a PARTIAL row without a stated gap is refused by name', noNext.status === 1 && noNext.codes.indexOf('VMU_RULES_NO_NEXT') >= 0, noNext.codes)

// ── the four NEW shape checks ───────────────────────────────────────────────────────────────────────────────
const toolNope = probe('tool-not-declared', (led) => {
  const it = led.items[0]
  it.status = 'DONE'
  it.tool = ['vibe_v9_nope']
})
ok('a tool name nobody declares is refused by name', toolNope.status === 1 && toolNope.codes.indexOf('VMU_RULES_TOOL_NOT_DECLARED') >= 0, toolNope.codes)

const tooBroad = probe('evidence-too-broad', (led) => {
  const it = led.items[0]
  it.status = 'DONE'
  it.mechanism = ['scripts/check-rules-coverage.mjs::function']
}, ['--check'])
ok('a generic mechanism keyword is refused by name under --check',
  tooBroad.status === 1 && tooBroad.codes.indexOf('VMU_RULES_EVIDENCE_TOO_BROAD') >= 0, tooBroad.codes)

const noAnchor = probe('no-anchor', (led) => { delete led.items[0].ruleText }, ['--check'])
ok('a row without a ruleText anchor is refused by name under --check',
  noAnchor.status === 1 && noAnchor.codes.indexOf('VMU_RULES_NO_ANCHOR') >= 0, noAnchor.codes)

const ambiguous = docProbe('anchor-ambiguous', [
  '# 规则',
  '这是一句会被重复引用的话。',
  '中间一行。',
  '这是一句会被重复引用的话。',
], (led) => { led.items[0].ruleText = '这是一句会被重复引用的话。' })
ok('a ruleText quote that occurs twice is refused by name',
  ambiguous.status === 1 && ambiguous.codes.indexOf('VMU_RULES_ANCHOR_AMBIGUOUS') >= 0, ambiguous.codes)

const notVerbatim = docProbe('anchor-not-verbatim', ['# 规则', '原文在这里。'], (led) => { led.items[0].ruleText = '原文不在那里，这一句是编造的。' })
ok('a ruleText that is not a verbatim quote is refused by name',
  notVerbatim.status === 1 && notVerbatim.codes.indexOf('VMU_RULES_ANCHOR_NOT_FOUND') >= 0, notVerbatim.codes)

const structural = docProbe('structural-is-content', [
  '# 规则',
  '这是一条带要求的内容行。',
  '## 真正的标题',
], (led) => { led.source.structuralLines = [{ line: 'L2', why: 'test: pretend this is a heading' }] })
ok('a requirement declared STRUCTURAL is refused by name (the L10 trap)',
  structural.status === 1 && structural.codes.indexOf('VMU_RULES_STRUCTURAL_IS_CONTENT') >= 0, structural.codes)

// A structural declaration the document really backs up must PASS — otherwise the check is "always red", not a check.
const structuralOk = docProbe('structural-ok', [
  '',
  '# 规则',
  '---',
  '## 成员：',
], (led) => {
  led.source.structuralLines = [{ line: 'L1', why: 'blank' }, { line: 'L2', why: 'heading' }, { line: 'L3', why: 'separator' }, { line: 'L4', why: 'lead-in' }]
  led.items[0].ruleText = '## 成员：'
})
ok('structural lines the document backs up are accepted', structuralOk.codes.indexOf('VMU_RULES_STRUCTURAL_IS_CONTENT') < 0, structuralOk.codes)

// ── fingerprint: a maintained artifact, and a hand-edited one is caught ────────────────────────────────────
const stamp = docProbe('fingerprint-stamp', ['# 规则', '第一行。', '第二行。'], () => {})
const stamped = run(['--ledger', stamp.ledFile, '--write-fingerprint'])
let stampLedger = {}
try { stampLedger = JSON.parse(readFileSync(stamp.ledFile, 'utf8')) } catch { stampLedger = {} }
ok('--write-fingerprint stamps lineCount, revision and fingerprint',
  stamped.status === 0 && typeof (stampLedger.source || {}).fingerprint === 'string' && stampLedger.source.lineCount >= 3,
  stamped.stdout || stamped.stderr)

const tampered = JSON.parse(readFileSync(stamp.ledFile, 'utf8'))
tampered.source.fingerprint = '000000000000'
writeFileSync(stamp.ledFile, JSON.stringify(tampered))
const driftRun = run(['--ledger', stamp.ledFile, '--json'])
const driftOut = parse(driftRun.stdout)
ok('a hand-edited fingerprint with an unchanged revision is refused by name',
  driftRun.status === 1 && (driftOut.problems || []).some((p) => p.code === 'VMU_RULES_LINE_FINGERPRINT_DRIFT'),
  (driftOut.problems || []).map((p) => p.code).join(','))

// ── strict-live: a row whose only live evidence is a refusal code ──────────────────────────────────────────
const strictLive = run(['--check', '--strict-live', '--json'])
const strictLiveOut = parse(strictLive.stdout)
const refusalRows = (base.items || []).filter((i) => (i.live || []).length === 1 && /VMU_/.test(String((i.live || [''])[0])))
if (refusalRows.length) {
  ok('--strict-live refuses a row whose only live evidence is a refusal code',
    strictLive.status === 1 && (strictLiveOut.problems || []).some((p) => p.code === 'VMU_RULES_LIVE_IS_ONLY_A_REFUSAL'),
    (strictLiveOut.problems || []).map((p) => p.code).join(','))
} else {
  ok('--strict-live refuses a row whose only live evidence is a refusal code', true)
}

// ── control: without the in-flight citation gaps, the same gate is GREEN on the real ledger ────────────────
// The control removes exactly the entries the real run reported as unresolved, and marks the rows it emptied as
// PARTIAL-with-next (which is what the migration lane is about to do anyway). If the control STILL reds, the gate has
// a false positive on a row the migration did not touch — the failure this control exists to catch.
const controlLed = JSON.parse(JSON.stringify(base))
for (const item of controlLed.items) {
  for (const cat of ['mechanism', 'tool', 'prompt', 'live']) {
    if (!Array.isArray(item[cat])) continue
    item[cat] = item[cat].filter((entry) => {
      // The gate reports the unresolved PATTERN in its message; removing the entry whose pattern it names is the
      // only way to build a control that differs from the real ledger in exactly the reported rows.
      const res = (payload.problems || []).some((p) => p.code === 'VMU_RULES_EVIDENCE_UNRESOLVED' &&
        String(p.message).indexOf('item ' + item.id + ' ') >= 0 &&
        String(p.message).indexOf(String(entry).split('::').slice(1).join('::')) >= 0)
      return !res
    })
  }
  const emptied = ['mechanism', 'tool', 'prompt', 'live'].some((c) => !Array.isArray(item[c]) || item[c].length === 0)
  if (emptied && item.status === 'DONE') {
    item.status = 'PARTIAL'
    item.next = 'in-flight citation pending the prompts lane (control)'
  }
}
const controlFile = join(scratch, 'control.json')
writeFileSync(controlFile, JSON.stringify(controlLed))
const controlRun = run(['--ledger', controlFile, '--json'])
const controlOut = parse(controlRun.stdout)
ok('the real ledger is clean once the in-flight citation gaps are removed (control)',
  controlRun.status === 0, (controlOut.problems || []).map((p) => p.code + ':' + p.message).join(' | ').slice(0, 400))

const strict = run(['--check', '--json'])
const sres = parse(strict.stdout)
const unfinished = (base.items || []).filter((i) => i.status === 'PARTIAL' || i.status === 'MISSING').length
if (unfinished > 0) {
  ok('--check refuses an unfinished ledger, one problem per row', strict.status === 1 &&
    (sres.problems || []).filter((p) => p.code === 'VMU_RULES_UNFINISHED').length === unfinished)
} else {
  ok('--check accepts a fully finished ledger', strict.status === 0)
}

rmSync(scratch, { recursive: true, force: true })
if (SELFTEST) {
  const good = failed === 0 && planted >= 4 && caught === planted
  console.log('SELFTEST: ' + (good ? 'ok' : 'FAILED') + ' — planted faults caught by name: ' + caught + '/' + planted)
  process.exit(good ? 0 : 1)
}
console.log('RULE COVERAGE GATE: ' + passed + ' passed, ' + failed + ' failed')
process.exitCode = failed === 0 ? 0 : 1
