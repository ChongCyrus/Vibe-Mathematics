#!/usr/bin/env node
// AUDIT PRESET OVERLAY SHAPE — the shipped overlay must be YAML the loader can read, and its plugin rows must
// leave `config` to the DEPLOYMENT.
//
// WHY THIS EXISTS (run 90, measured): the preset was changed to declare math intent with
// `config: { math: {} }` on the framework plugin row. The deployment step (the same thing the installer does)
// injects `config: { packs, root, vmu... }` into that same row. Two writers, one mapping key: the host refused
// to parse the overlay (`YAMLException: duplicated mapping key (271:13)`) and the clean-room drive exited 1
// before the first tool call. No test caught it because nothing parsed the overlay as YAML.
//
// The rule this file enforces: `config` on a plugin row is the DEPLOYMENT's key. A shipped preset states
// requirements in settings (or a pack), never by pre-filling the deployment's mapping.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OVERLAY = path.join(ROOT, 'cordis.patch.yml')
const AGENT = path.join(ROOT, 'vibe-math-vmu/agent.cordis.yml')

let pass = 0
let fail = 0
const t = (name, fn) => {
  try {
    fn()
    pass += 1
    console.log('  ok   ' + name)
  } catch (e) {
    fail += 1
    console.log('  FAIL ' + name + ' :: ' + (e && e.message ? e.message : String(e)))
  }
}

// A deliberately small scanner, not a YAML implementation: it only has to be right about the shape that broke —
// two mapping keys with the same name at the same indentation inside one block. Comments, blank lines and block
// scalars are skipped; a list item ("- x: y") starts a new block at its own indentation.
export function duplicateKeys(text) {
  const out = []
  const stack = []
  let blockScalarIndent = -1
  const lines = String(text).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const lineNo = i + 1
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const indent = raw.match(/^ */)[0].length
    if (blockScalarIndent >= 0) {
      if (indent > blockScalarIndent) continue
      blockScalarIndent = -1
    }
    const body = raw.slice(indent)
    while (stack.length && stack[stack.length - 1].indent > indent) stack.pop()
    if (/^-\s/.test(body)) {
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
      const after = body.replace(/^-\s+/, '')
      const m = after.match(/^([A-Za-z0-9_.@/'"-]+):/)
      if (m) stack.push({ indent, key: m[1].replace(/^['"]|['"]$/g, ''), line: lineNo })
      continue
    }
    const m = body.match(/^([A-Za-z0-9_.@/'"-]+):(\s|$)/)
    if (!m) continue
    const key = m[1].replace(/^['"]|['"]$/g, '')
    const top = stack[stack.length - 1]
    if (top && top.indent === indent && top.key === key) {
      out.push({ key, line: lineNo, firstLine: top.line })
      continue
    }
    stack.push({ indent, key, line: lineNo })
    const value = body.slice(m[0].length).trim()
    if (/^[|>][+-]?$/.test(value)) blockScalarIndent = indent
  }
  return out
}

// The framework plugin row in a shipped overlay: it must not carry `config`, because the deployment writes it.
export function pluginRowConfigLines(text, id) {
  const lines = String(text).split('\n')
  const hits = []
  let rowIndent = -1
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (!/- id: /.test(raw)) {
      if (rowIndent >= 0) {
        const indent = raw.match(/^ */)[0].length
        if (raw.trim() && indent <= rowIndent) rowIndent = -1
        else if (rowIndent >= 0 && /^\s*config:\s*$/.test(raw)) hits.push(i + 1)
      }
      continue
    }
    const name = raw.replace(/^\s*-\s*id:\s*/, '').replace(/["']/g, '').trim()
    rowIndent = name === id ? raw.match(/^ */)[0].length : -1
  }
  return hits
}

const overlayText = readFileSync(OVERLAY, 'utf8')
const agentText = readFileSync(AGENT, 'utf8')

t('cordis.patch.yml has no duplicate mapping keys', () => {
  const dup = duplicateKeys(overlayText)
  assert.deepEqual(dup, [], 'duplicate keys: ' + JSON.stringify(dup))
})
t('vibe-math-vmu/agent.cordis.yml has no duplicate mapping keys', () => {
  const dup = duplicateKeys(agentText)
  assert.deepEqual(dup, [], 'duplicate keys: ' + JSON.stringify(dup))
})
t('the shipped overlay leaves `config` on the framework row to the deployment', () => {
  for (const id of ['vibe-math-vmu']) {
    const hits = pluginRowConfigLines(overlayText, id)
    assert.deepEqual(hits, [], 'row ' + id + ' pre-fills config at line(s) ' + hits.join(',') + ' — the deployment injects packs/root/vmu there; stating requirements belongs in settings or the pack')
  }
})
t('the preset source leaves `config` on the framework row to the deployment', () => {
  const hits = pluginRowConfigLines(agentText, 'vibe-math-vmu')
  assert.deepEqual(hits, [], 'agent.cordis.yml pre-fills config at line(s) ' + hits.join(','))
})

const SELFTEST = process.argv.includes('--selftest')
if (SELFTEST) {
  const cases = [
    ['plant-duplicate-config', () => {
      const bad = 'a:\n  - id: x\n    name: y\n    config:\n      math: {}\n    config:\n      packs: []\n'
      assert.ok(duplicateKeys(bad).length === 1, 'expected one duplicate')
    }],
    ['plant-duplicate-nested', () => {
      const bad = 'a:\n  b:\n    c: 1\n    c: 2\n'
      assert.ok(duplicateKeys(bad).length === 1, 'expected one duplicate')
    }],
    ['control-siblings-are-not-duplicates', () => {
      const ok = 'a:\n  - id: p\n    k: 1\n  - id: q\n    k: 2\n'
      assert.deepEqual(duplicateKeys(ok), [])
    }],
    ['plant-row-config', () => {
      const bad = 'x:\n  - insert:\n      - id: vibe-math-vmu\n        name: n\n        config:\n          math: {}\n'
      assert.ok(pluginRowConfigLines(bad, 'vibe-math-vmu').length === 1, 'expected the row config to be found')
    }],
    ['control-other-row-config', () => {
      const ok = 'x:\n  - insert:\n      - id: other\n        config:\n          a: 1\n'
      assert.deepEqual(pluginRowConfigLines(ok, 'vibe-math-vmu'), [])
    }]
  ]
  let planted = 0
  let caught = 0
  for (const [name, fn] of cases) {
    try {
      fn()
      caught += 1
      console.log('  selftest ok   ' + name)
    } catch (e) {
      console.log('  selftest FAIL ' + name + ' :: ' + (e && e.message ? e.message : String(e)))
    }
    planted += 1
  }
  if (caught !== planted) {
    console.log('PRESET OVERLAY SHAPE SELFTEST: ' + caught + '/' + planted + ' as expected')
    process.exit(1)
  }
  console.log('PRESET OVERLAY SHAPE SELFTEST: ' + caught + '/' + planted + ' as expected')
}

console.log('=== PRESET OVERLAY SHAPE: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) process.exit(1)
