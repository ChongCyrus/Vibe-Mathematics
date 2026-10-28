// ROUND 200: the parity gate — the rule document, the ledger and the LIVE prompt files must stay in step.
//
// The gap this closes was found in a clean-room run: a dead prompt module (`v5r-persona.js`) still carried
// hard-coded vote bases and a 3-round ceiling, and nothing machine-checked that the prompts the runtime
// actually renders still say what the ledger claims they say. The gate is only worth having if it fails on
// planted defects, so its `--selftest` plants seven of them and requires all seven to be caught.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const script = join(repo, 'scripts', 'check-rule-parity.mjs')
const ledgerFile = join(repo, 'docs', 'acceptance', 'rules-ledger.json')
const sourceRules = resolve(repo, '..', '宏观层面v5r运行规则.md')

function run(args) {
  const out = spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' })
  return { code: out.status, out: `${out.stdout || ''}${out.stderr || ''}` }
}

test('§1 the parity gate exists and passes on the real ledger', () => {
  assert.ok(existsSync(script), 'scripts/check-rule-parity.mjs is missing')
  const r = run([])
  assert.equal(r.code, 0, `parity gate failed:\n${r.out}`)
  assert.match(r.out, /RULE PARITY: PASS \(0 problem\(s\)\)/, r.out)
})

test('§2 the gate fails on planted defects (7/7 selftest)', () => {
  const r = run(['--selftest'])
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /RULE PARITY SELFTEST: 7\/7 as expected/, r.out)
})

test('§3 dead prompt data and historical corpus are NOT counted as live teaching', () => {
  const r = run([])
  assert.equal(r.code, 0, r.out)
  const joined = r.out.split('\n').filter((l) => l.includes('not live:')).join('\n')
  assert.match(joined, /v5r-persona\.js/, 'the dead persona module must be reported as not live')
  assert.match(joined, /v5r-prompts\.js/, 'the historical corpus module must be reported as not live')
  const live = Number(/live teaching (\d+)/.exec(r.out)?.[1] || 0)
  assert.ok(live >= 6, `expected at least six live teaching modules, saw ${live}`)
})

test('§4 the ledger records the document revision it was audited against', () => {
  const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'))
  assert.ok(ledger.source && ledger.source.revision, 'ledger.source.revision is missing')
  if (!existsSync(sourceRules)) {
    // The rule document lives beside the repository in this workspace; when it is absent the gate
    // already skips the hash comparison, so this test asserts the recorded shape instead.
    assert.match(String(ledger.source.revision), /^[0-9a-f]{64}$/, 'revision must be a sha256')
    return
  }
  const sha = createHash('sha256').update(readFileSync(sourceRules)).digest('hex')
  assert.equal(sha, String(ledger.source.revision), 'the rule document changed: re-audit the ledger')
})

test('§5 every structural line is declared with a reason, not merely assumed', () => {
  const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'))
  const structural = ledger.source && ledger.source.structuralLines
  assert.ok(Array.isArray(structural) && structural.length > 0, 'structuralLines must be declared')
  for (const entry of structural) {
    assert.match(String(entry.line), /^L\d+$/, `bad structuralLines entry: ${JSON.stringify(entry)}`)
    assert.ok(String(entry.why || '').trim().length >= 4, `structural line ${entry.line} needs a reason`)
  }
})

// ── the MIGRATION paths: the ledger is being moved off `source.file` + `ruleLines` onto `source.path` + anchors ──────
// Without these two cases the gate would be green on today's ledger and red on the one the migration produces — a gate
// that fails precisely when the work it guards is finished.
function copyLedger(mutate) {
  const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'))
  mutate(ledger)
  const dir = mkdtempSync(join(tmpdir(), 'vmu-parity-mig-'))
  const file = join(dir, 'ledger.json')
  writeFileSync(file, JSON.stringify(ledger, null, 2))
  return file
}

test('§6 the rule document is found through source.path when source.file is gone', () => {
  const file = copyLedger((ledger) => {
    ledger.source.path = ledger.source.file
    delete ledger.source.pathRelative
    delete ledger.source.file
  })
  const r = run(['--ledger', file])
  assert.equal(r.code, 0, `--ledger with source.path only failed:\n${r.out}`)
})

test('§7 claim lines are derived from ruleText anchors when ruleLines is gone', () => {
  const file = copyLedger((ledger) => {
    const anchored = ledger.items.every((i) => typeof i.ruleText === 'string' && i.ruleText.trim())
    assert.ok(anchored, 'this case needs an every-row-anchored ledger')
    delete ledger.ruleLines
  })
  const r = run(['--ledger', file])
  assert.equal(r.code, 0, `--ledger without ruleLines failed:\n${r.out}`)
  assert.match(r.out, /claim line\(s\) derived from ruleText anchors/, r.out)
})
