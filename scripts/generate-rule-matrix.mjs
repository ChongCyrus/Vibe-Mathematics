#!/usr/bin/env node
// scripts/generate-rule-matrix.mjs — render docs/acceptance/rule-conformance-matrix.md from rules-ledger.json.
//
// WHY GENERATED: the ledger is the single claim (docs/acceptance/rules-ledger.json, checked by
// scripts/check-rules-coverage.mjs). A hand-written table beside it would be a second copy that drifts — the
// exact failure the four-question gate exists to prevent. This script is the only writer of the .md, and
// `--check` (used by scripts/regen-all.mjs) fails when the committed .md differs from a fresh render.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = join(REPO, 'docs/acceptance/rules-ledger.json')
const OUT = join(REPO, 'docs/acceptance/rule-conformance-matrix.md')
const CHECK = process.argv.includes('--check')
const led = JSON.parse(readFileSync(LEDGER, 'utf8'))
const ICON = { DONE: '✅', PARTIAL: '◐', MISSING: '❌', DECIDED: '📌' }
const lines = []
lines.push('# v5r rule conformance matrix (generated)')
lines.push('')
lines.push('**Do not edit by hand.** Source of truth: [`rules-ledger.json`](rules-ledger.json). Renderer:')
lines.push('`scripts/generate-rule-matrix.mjs`. Gate: `scripts/check-rules-coverage.mjs` (structural always;')
lines.push('`--check` is the closing gate that refuses any PARTIAL/MISSING).')
lines.push('')
lines.push('## What a row claims')
lines.push('')
lines.push('Every atomic requirement of `' + led.source.file + '` (rev `' + String(led.source.revision).slice(0, 12) +
  '`, ' + led.source.lineCount + ' lines) answers four questions, and each answer is a **machine-re-resolved citation**')
lines.push('(`path::pattern`): **M** mechanism (the kernel/pack enforces it) · **T** tool (a reachable face answers it) ·')
lines.push('**P** prompt (live teaching says it) · **R** real run (a receipt proves it).')
lines.push('')
const counts = { DONE: 0, PARTIAL: 0, MISSING: 0, DECIDED: 0 }
for (const i of led.items) counts[i.status] = (counts[i.status] || 0) + 1
lines.push('## Now')
lines.push('')
lines.push('| status | rows | meaning |')
lines.push('| --- | --- | --- |')
lines.push('| ✅ DONE | ' + (counts.DONE || 0) + ' | all four citations resolve |')
lines.push('| ◐ PARTIAL | ' + (counts.PARTIAL || 0) + ' | the row states exactly which of M/T/P/R is missing |')
lines.push('| ❌ MISSING | ' + (counts.MISSING || 0) + ' | no mechanism at all yet |')
lines.push('| 📌 DECIDED | ' + (counts.DECIDED || 0) + ' | the user ruled it out of scope (`next` records the ruling) |')
lines.push('')
lines.push('**A goal may not close while any row is ◐ or ❌.**')
lines.push('')
const groups = [...new Set(led.items.map((i) => String(i.id)[0]))]
const TITLES = { A: 'A. 成员分层', B: 'B. 公共文件', C: 'C. 个人文件', D: 'D. 平时研究推进', E: 'E. 会议', F: 'F. 论文阶段', G: 'G. 额外要求' }
for (const g of groups) {
  lines.push('## ' + (TITLES[g] || g))
  lines.push('')
  lines.push('| id | 规则行 | 原子要求 | 状态 | 已有证据 (M/T/P/R) | 缺口 |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const it of led.items.filter((i) => String(i.id)[0] === g)) {
    const ev = ['mechanism', 'tool', 'prompt', 'live'].map((c) => (Array.isArray(it[c]) ? it[c].length : 0)).join('/')
    const next = it.next ? String(it.next).replace(/\|/g, '\|') : '—'
    lines.push('| `' + it.id + '` | ' + it.rule + ' | ' + String(it.text).replace(/\|/g, '\|') + ' | ' +
      ICON[it.status] + ' ' + it.status + ' | ' + ev + ' | ' + next + ' |')
  }
  lines.push('')
}
lines.push('## How to move a row')
lines.push('')
lines.push('1. land the mechanism and the reachable face; 2. teach it in the live prompts; 3. run one live round whose')
lines.push('receipt proves the behaviour; 4. cite all four as `path::pattern` in the ledger; 5. run')
lines.push('`node scripts/check-rules-coverage.mjs` (structural) and `--check` (closing). A citation that stops')
lines.push('resolving turns the gate red — that is intended: a renamed symbol must not silently keep a claim alive.')
lines.push('')
const text = lines.join('\n')
if (CHECK) {
  const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (cur !== text) { console.error('rule matrix is stale: run node scripts/generate-rule-matrix.mjs --write'); process.exit(1) }
  console.log('rule matrix in sync (' + led.items.length + ' rows)')
} else {
  writeFileSync(OUT, text)
  console.log('rule matrix written: ' + led.items.length + ' rows (' + (counts.DONE || 0) + ' DONE, ' +
    (counts.PARTIAL || 0) + ' PARTIAL, ' + (counts.MISSING || 0) + ' MISSING, ' + (counts.DECIDED || 0) + ' DECIDED)')
}
