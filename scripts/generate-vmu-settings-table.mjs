#!/usr/bin/env node
// vmu settings table generator — docs/04 §11 discipline ③: the table must not be a second hand-written
// copy of the schema. This script DERIVES it from SETTING_DEFS, so a key can never exist in one place and
// be missing (or stale) in the other.
//
// Usage:
//   node scripts/generate-vmu-settings-table.mjs --write   rewrite the table from the schema
//   node scripts/generate-vmu-settings-table.mjs --check   fail if the file is not exactly what the schema yields
//
// The generated shape matches the documented columns exactly: 键 | 类型 | 默认 | 域 | 作用域 | H | 谁 | 说明.
// The 说明 column is the schema's own `doc` string - the single source of truth, typed next to the key.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const DOC = join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md')
const SCHEMA = join(REPO, 'vibe-math-vmu', 'settings', 'schema.js')

const MODE_WRITE = process.argv.includes('--write')
const MODE_CHECK = process.argv.includes('--check') || !MODE_WRITE
const JSON_OUT = process.argv.includes('--json')

const { SETTING_DEFS } = await import(new URL('file://' + SCHEMA.replace(/\\/g, '/')).href)

const TYPE_LABEL = {
  boolean: 'bool',
  natural: 'int ≥0',
  positiveInteger: 'int ≥1',
  stringList: 'string[]',
  objectList: 'obj[]',
  path: 'path',
  string: 'string',
  enum: 'enum',
}

const renderDefault = (def) => {
  const d = def.def
  if (Array.isArray(d)) return '`[' + d.join(',') + ']`'
  if (typeof d === 'string') return '`' + d + '`'
  return '`' + String(d) + '`'
}

const renderDomain = (def) => {
  if (def.type !== 'enum') return '—'
  return def.domain.map((v) => '`' + v + '`').join('∣')
}

const renderHot = (def) => (def.hot === 'H3' ? '**H3**' : def.hot)
const renderWho = (def) => (String(def.who).startsWith('role:') ? def.who : def.who)

const HEADER = [
  '| 键 | 类型 | 默认 | 域 | 作用域 | H | 谁 | 说明 |',
  '|---|---|---|---|---|---|---|---|',
]

const rows = SETTING_DEFS.map((def) => '| `' + def.key + '` | ' + (TYPE_LABEL[def.type] || def.type) + ' | ' +
  renderDefault(def) + ' | ' + renderDomain(def) + ' | 会话 | ' + renderHot(def) + ' | ' + renderWho(def) + ' | ' + def.doc + ' |')

const generated = HEADER.concat(rows).join('\n')

// ---- splice into the document, replacing exactly the table body ---------------------------------
const docText = readFileSync(DOC, 'utf8')
const lines = docText.split('\n')
const headerIdx = lines.findIndex((l) => l.startsWith('| 键 | 类型 |'))
if (headerIdx === -1) {
  console.error('vmu settings table: the table header is missing from docs/04 §11')
  process.exit(1)
}
let end = headerIdx + 2 // past the separator
while (end < lines.length && lines[end].startsWith('|')) end++
const before = lines.slice(0, headerIdx)
const after = lines.slice(end)
const nextText = before.concat(generated.split('\n'), after).join('\n')

if (JSON_OUT) {
  console.log(JSON.stringify({ keys: SETTING_DEFS.length, tableLines: generated.split('\n').length, stale: nextText !== docText }, null, 2))
} else if (nextText === docText) {
  console.log('vmu settings table: up to date (' + SETTING_DEFS.length + ' keys)')
} else if (MODE_WRITE) {
  writeFileSync(DOC, nextText, 'utf8')
  console.log('vmu settings table: REWRITTEN from the schema (' + SETTING_DEFS.length + ' keys, ' + generated.split('\n').length + ' lines)')
} else {
  console.error('vmu settings table: STALE - docs/04 §11 is not what the schema yields (' + SETTING_DEFS.length + ' keys)')
  console.error('  run: node scripts/generate-vmu-settings-table.mjs --write')
  process.exit(1)
}
