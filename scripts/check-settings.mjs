#!/usr/bin/env node
// scripts/check-settings.mjs — DRY-RUN settings validation for a deployment patch (RUN-87/88 lesson).
//
// WHY THIS EXISTS: the RUN-87 driver wrote `config.v5r = { fixtureMode: 'tools' }` / `config.budget = …` at the TOP
// level; the entry reads settings from `config.vmu` (nested or dotted) and silently ignored them, so the deployment
// LOOKED configured while nothing was in force. This CLI runs the SAME pure validator the entry uses — BEFORE any
// server boot, token spend, apply, network or disk write — and prints the named `unparsed` entries.
//
//   node scripts/check-settings.mjs --json '{"vmu":{"v5r":{"fixtureMode":"tools"}}}'
//   node scripts/check-settings.mjs --patch path/to/cordis.patch.yml
//   node scripts/check-settings.mjs path/to/config.json
//
// Exit 0 only when `unparsed` is empty. Output is JSON:
//   { ok, unparsed, conflicts, settings, keys: { 'vmu.v5r.fixtureMode': <effective-or-null>, 'vmu.budget.tokens': <…> } }
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { REPO } from '../tests/_lib/repo-root.mjs'

const { validateSettingsConfig } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
// Schema declarations: the framework table plus the SHIPPED pack namespaces (their declarations file is the one
// registration seam; importing it makes the pack's keys valid in a dry-run that runs before any pack is mounted).
const { SETTING_DEFS } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'settings', 'schema.js')).href)
const v5rDecl = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'declarations.js')).href)
const schemaDefs = SETTING_DEFS.concat(Array.isArray(v5rDecl.DEFS) ? v5rDecl.DEFS : [])

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 ? argv[i + 1] : null
}
const inline = flag('json')
const patch = flag('patch')
const positional = argv.find((a) => !a.startsWith('--') && a !== inline && a !== patch) || null

/** Minimal YAML subset for a Cordis patch: find the `config:` block and parse indented maps/lists/scalars. */
function yamlConfig(text) {
  const lines = String(text).split('\n')
  const start = lines.findIndex((l) => /^\s*config:\s*$/.test(l))
  if (start < 0) throw new Error('patch has no top-level `config:` block')
  const baseIndent = lines[start].match(/^\s*/)[0].length
  const body = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    const indent = line.match(/^\s*/)[0].length
    if (indent <= baseIndent) break
    body.push({ indent, text: line.trim() })
  }
  let cursor = 0
  const parseScalar = (raw) => {
    const s = raw.trim()
    if (s === '' || s === 'null' || s === '~') return null
    if (s.startsWith('[') || s.startsWith('{')) { try { return JSON.parse(s.replace(/'/g, '"')) } catch { return s } }
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
    if (s === 'true') return true
    if (s === 'false') return false
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1)
    return s
  }
  const parseNode = (indent) => {
    if (cursor >= body.length) return null
    if (body[cursor].text.startsWith('- ')) {
      const arr = []
      while (cursor < body.length && body[cursor].indent === indent && body[cursor].text.startsWith('- ')) {
        arr.push(parseScalar(body[cursor].text.slice(2)))
        cursor += 1
      }
      return arr
    }
    const obj = {}
    while (cursor < body.length && body[cursor].indent === indent) {
      const m = /^([^:]+):\s*(.*)$/.exec(body[cursor].text)
      if (!m) throw new Error('unsupported YAML line: ' + body[cursor].text)
      const key = m[1].trim()
      const rest = m[2]
      cursor += 1
      if (rest === '') {
        obj[key] = cursor < body.length && body[cursor].indent > indent ? parseNode(body[cursor].indent) : null
      } else obj[key] = parseScalar(rest)
    }
    return obj
  }
  return parseNode(body.length ? body[0].indent : baseIndent + 2)
}

let config = null
if (inline !== null) config = JSON.parse(inline)
else {
  const file = patch || positional
  if (!file) { console.error('usage: check-settings.mjs (--json JSON | --patch FILE | FILE)'); process.exit(2) }
  const text = readFileSync(file, 'utf8')
  config = file.endsWith('.json') ? JSON.parse(text) : (() => {
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) return JSON.parse(trimmed)
    return yamlConfig(text)
  })()
}
if (config && typeof config === 'object' && config.config && typeof config.config === 'object') config = config.config
const result = validateSettingsConfig(config, { defs: schemaDefs })
const settings = result.settings || {}
const out = {
  ok: result.ok === true,
  unparsed: result.unparsed,
  schemaErrors: result.schemaErrors,
  conflicts: result.conflicts,
  settings,
  keys: {
    'vmu.v5r.fixtureMode': settings['vmu.v5r.fixtureMode'] === undefined ? null : settings['vmu.v5r.fixtureMode'],
    'vmu.budget.tokens': settings['vmu.budget.tokens'] === undefined ? null : settings['vmu.budget.tokens'],
  },
}
console.log(JSON.stringify(out, null, 2))
process.exit(result.ok === true ? 0 : 1)
