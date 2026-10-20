#!/usr/bin/env node
// PHASE 7 (goal 5, blindspot c): EVERY runtime-observer/applier/provider setter must have a test that names it.
//
// WHY: "the setter exists" and "something calls the registered function" are different facts. Phase 4 measured this
// class repeatedly (a setter wired to no consumer; a tool table nobody changed). The gate is intentionally narrow:
// it scans SETTER DEFINITIONS in vibe-math-vmu (kernel/**, host*.js, packs/**) and requires at least one tests/*.mjs
// file to mention the same setter AND make an assertion (ok/assert). A rename or a deleted consumer test turns it RED.
//
// --selftest: builds a synthetic source/tests pair in D:\_tmp (no repo writes) and proves (1) a named positive hits,
// (2) a setter with no test is red, (3) a test that only mentions the name without an assertion is red.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')
const SRC_ROOT = join(REPO, 'vibe-math-vmu')
const TESTS = join(REPO, 'tests')
const NAME_RE = /set[A-Z][A-Za-z]*(?:Observer|Applier|Provider|Catalogue)/
const DEF_RES = [
  new RegExp('^\\s*(?:export\\s+)?function\\s+(' + NAME_RE.source + ')\\s*\\('),
  new RegExp('^\\s*(' + NAME_RE.source + ')\\s*:\\s*\\('),
  new RegExp('^\\s*(' + NAME_RE.source + ')\\s*\\(fn\\)\\s*\\{'),
]
const IGNORE = new Set(['(anonymous)'])

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue
      walk(p, out)
    } else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p)
  }
  return out
}

const definitions = () => {
  const found = []
  for (const file of walk(SRC_ROOT)) {
    const rel = relative(REPO, file).split(sep).join('/')
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      let name = null
      for (const re of DEF_RES) { const m = re.exec(line); if (m && m[1]) { name = m[1]; break } }
      if (!name) continue
      // Call sites (`typeof kernel.setX === 'function'`) and comments are not definitions.
      if (/typeof\s+(kernel|turn)\./.test(line)) continue
      if (line.trim().startsWith('*') || line.trim().startsWith('//')) continue
      if (!IGNORE.has(name)) found.push({ name, file: rel })
    }
  }
  return found
}

const testFiles = () => {
  const out = []
  for (const name of readdirSync(TESTS)) if (name.endsWith('.test.mjs') || name.endsWith('.mjs')) out.push(join(TESTS, name))
  return out
}

const hasConsumerTest = (testsText, name) => {
  const idx = testsText.findIndex((f) => f.text.includes(name + '('))
  if (idx < 0) return false
  const text = testsText[idx].text
  const pos = text.indexOf(name + '(')
  return /\b(?:ok|assert)\s*\(/.test(text) && text.slice(Math.max(0, pos - 1200), pos + 1200).includes('ok(')
}

const evaluate = (defs, testsText) => {
  const missing = []
  for (const d of defs) if (!hasConsumerTest(testsText, d.name)) missing.push(d)
  return missing
}

const readAllTests = () => testFiles().map((f) => ({ file: relative(REPO, f), text: readFileSync(f, 'utf8') }))
const report = (missing, defs) => {
  for (const d of defs) console.log('  ok   setter ' + d.name + ' (' + d.file + ')')
  for (const d of missing) console.log('  FAIL setter ' + d.name + ' (' + d.file + ') has no test that names it and asserts')
}

if (process.argv.includes('--selftest')) {
  // A: a named positive must hit.
  const posDefs = [{ name: 'setProbeObserver', file: '(synthetic)' }]
  const posTests = [{ file: '(synthetic)', text: 'setProbeObserver(() => {})\nok(seen === 1, "called")' }]
  const posOk = evaluate(posDefs, posTests).length === 0
  // B: a setter with no test must be RED.
  const redNoTest = evaluate(posDefs, [{ file: '(synthetic)', text: 'const x = 1' }]).length === 1
  // C: a test that only mentions the name with no assertion must be RED.
  const redNoAssert = evaluate(posDefs, [{ file: '(synthetic)', text: 'setProbeObserver(() => {})' }]).length === 1
  // D: definition scanning must find at least one REAL definition (not a zero-match false negative).
  const real = definitions()
  const realHit = real.length >= 3
  const okAll = posOk && redNoTest && redNoAssert && realHit
  console.log('=== OBSERVER CONSUMERS SELFTEST: ' + (okAll ? 'GREEN' : 'RED') + ' ===')
  console.log('  named positive hits:', posOk, '| no-test is red:', redNoTest, '| no-assert is red:', redNoAssert, '| real definitions found:', real.length)
  process.exit(okAll ? 0 : 1)
}

const defs = definitions()
const testsText = readAllTests()
const missing = evaluate(defs, testsText)
if (missing.length > 0) {
  console.log('=== OBSERVER CONSUMERS: ' + missing.length + ' setter(s) without a consumer test ===')
  report(missing, defs)
  process.exit(1)
}
console.log('=== OBSERVER CONSUMERS: ' + defs.length + ' setters, all have a test that names them ===')
process.exit(0)
