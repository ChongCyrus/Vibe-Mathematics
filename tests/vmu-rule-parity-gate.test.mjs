// ROUND 200: the parity gate — the rule document, the ledger and the LIVE prompt files must stay in step.
//
// The gap this closes was found in a clean-room run: a dead prompt module (`v5r-persona.js`) still carried
// hard-coded vote bases and a 3-round ceiling, and nothing machine-checked that the prompts the runtime
// actually renders still say what the ledger claims they say. The gate is only worth having if it fails on
// planted defects, so its `--selftest` plants them and requires every one to be caught (ROUND 135 added the
// seat-face ACL probes P6 and the prompt/settings probes P7: twelve as of §229).

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

test('§2 the gate fails on planted defects (12/12 selftest)', () => {
  const r = run(['--selftest'])
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /RULE PARITY SELFTEST: 12\/12 as expected/, r.out)
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
  // ROUND 272 (CI run 43080516326): revision pins the bytes GIT STORES, so it must be checked against the copy that
  // travels with the repository. The workspace master that lives beside the repo is CRLF on this laptop and the blob
  // is LF ('.gitattributes'), so comparing the master directly made this case pass only on the laptop that held it.
  const vendored = join(repo, 'docs', 'acceptance', 'v5r-rules-source.md')
  assert.ok(existsSync(vendored), 'docs/acceptance/v5r-rules-source.md is missing: the ledger is not reproducible')
  const sha = createHash('sha256').update(readFileSync(vendored)).digest('hex')
  assert.equal(sha, String(ledger.source.revision), 'the versioned rule copy changed: re-audit the ledger')
  if (existsSync(sourceRules)) {
    const fold = (file) => createHash('sha256').update(readFileSync(file).toString('utf8').split('\r\n').join('\n')).digest('hex')
    assert.equal(fold(sourceRules), fold(vendored), 'the workspace master and the versioned copy drifted apart')
  }
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
  // ROUND 272: point `path` at the VERSIONED copy, whose bytes are what source.revision pins. Pointing it at the
  // out-of-repo master made this case pass only on a laptop that keeps that master CRLF (27c5cd1c != 073175fe).
  const vendored = join(repo, 'docs', 'acceptance', 'v5r-rules-source.md')
  const file = copyLedger((ledger) => {
    ledger.source.path = vendored
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
