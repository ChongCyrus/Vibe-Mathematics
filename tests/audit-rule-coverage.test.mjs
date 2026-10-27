#!/usr/bin/env node
// tests/audit-rule-coverage.test.mjs — the four-question gate must be able to FAIL, not just run.
//
// WHY: a coverage gate that only prints counts is decoration. This suite runs the REAL ledger through the REAL
// script (must audit clean structurally), then plants faults in TEMP copies and requires each to be caught by name:
// an unresolvable citation, a DONE row missing one of the four citations, a PARTIAL row with no stated gap, and an
// item no ruleLines entry claims. Deleting a check turns a case red, which is the point.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
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
  else { failed++; console.log('FAIL ' + name + (detail ? ' :: ' + String(detail).slice(0, 300) : '')) }
}
const run = (extra) => spawnSync(process.execPath, [script].concat(extra), { cwd: REPO, encoding: 'utf8' })

const real = run(['--json'])
ok('the real ledger audits structurally clean', real.status === 0, real.stdout || real.stderr)
let payload = {}
try { payload = JSON.parse(real.stdout) } catch { payload = {} }
ok('the audit reports counts and a source', payload.total > 0 && !!payload.counts && !!(payload.source && payload.source.file))
ok('the source names the rules document', !!(payload.source && String(payload.source.file).indexOf('宏观层面v5r运行规则') >= 0))

const base = JSON.parse(readFileSync(ledgerPath, 'utf8'))
const scratch = mkdtempSync(join(tmpdir(), 'vmu-rules-'))
const probe = (label, mutate) => {
  const led = JSON.parse(JSON.stringify(base))
  mutate(led)
  const file = join(scratch, label + '.json')
  writeFileSync(file, JSON.stringify(led))
  const r = run(['--ledger', file, '--json'])
  planted += 1
  if (r.status === 1) caught += 1
  let out = {}
  try { out = JSON.parse(r.stdout) } catch { out = { problems: [] } }
  return { status: r.status, codes: (out.problems || []).map((p) => p.code) }
}

const badCite = probe('bad-citation', (led) => { led.items[0].mechanism = ['no/such/file.js::x'] })
ok('an unresolvable citation is refused by name', badCite.status === 1 && badCite.codes.indexOf('VMU_RULES_EVIDENCE_UNRESOLVED') >= 0)

const doneNoPrompt = probe('done-missing-prompt', (led) => {
  const it = led.items[0]
  it.status = 'DONE'
  it.mechanism = ['scripts/check-rules-coverage.mjs::STATUSES']
  it.tool = ['scripts/check-rules-coverage.mjs::CATEGORIES']
  it.live = ['scripts/check-rules-coverage.mjs::CATEGORY_MEANS']
  delete it.prompt
})
ok('a DONE row missing a citation kind is refused by name', doneNoPrompt.status === 1 && doneNoPrompt.codes.indexOf('VMU_RULES_DONE_MISSING_EVIDENCE') >= 0)

const orphan = probe('unclaimed-item', (led) => {
  const id = led.items[0].id
  for (const k of Object.keys(led.ruleLines)) led.ruleLines[k] = led.ruleLines[k].filter((x) => x !== id)
})
ok('an item no ruleLines entry claims is refused by name', orphan.status === 1 && orphan.codes.indexOf('VMU_RULES_UNCLAIMED_ITEM') >= 0)

const noNext = probe('partial-no-next', (led) => {
  for (const it of led.items) if (it.status === 'PARTIAL') { delete it.next; break }
})
ok('a PARTIAL row without a stated gap is refused by name', noNext.status === 1 && noNext.codes.indexOf('VMU_RULES_NO_NEXT') >= 0)

const strict = run(['--check', '--json'])
let sres = {}
try { sres = JSON.parse(strict.stdout) } catch { sres = { problems: [] } }
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
