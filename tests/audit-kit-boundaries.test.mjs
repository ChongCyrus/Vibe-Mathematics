#!/usr/bin/env node
// PHASE 8 / B-1 — THE THREE ANTI-DEGENERATION GATES FOR THE SHARED KIT.
//
// A kit that starts to grow its own spawn/fs/state/error-table is a second kernel. These gates make that impossible to
// do silently. They distinguish a CALL from a COMMENT: comments are stripped BEFORE the call patterns run (the Lead was
// once misled by a grep that counted a comment). Run with --selftest to prove each gate can go RED.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')
const KIT_DIR = join(REPO, 'vibe-math-vmu', 'kit')
const DOC03 = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')
const selftest = process.argv.includes('--selftest')

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const walkJs = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkJs(p, out)
    else if (name.endsWith('.js')) out.push(p)
  }
  return out
}
const FORBIDDEN_CALLS = [
  [/\bspawn\s*\(/, 'spawn('],
  [/\b(fs|readFile|writeFile|appendFile|mkdir|unlink|rm)\s*\(/, 'filesystem call'],
  [/\brequire\s*\(\s*['"]fs['"]/, "require('fs')"],
  [/\bchild_process\b/, 'child_process'],
]
const scanSource = (src) => {
  const body = stripComments(src)
  const problems = []
  for (const [re, label] of FORBIDDEN_CALLS) if (re.test(body)) problems.push(label)
  return problems
}
const registeredCodes = () => {
  const doc = readFileSync(DOC03, 'utf8')
  return new Set([...doc.matchAll(/`(VMU_[A-Z0-9_]+)`/g)].map((m) => m[1]))
}
const codeProblems = (src) => {
  const body = stripComments(src)
  const known = registeredCodes()
  return [...new Set([...body.matchAll(/VMU_[A-Z0-9_]+/g)].map((m) => m[0]))].filter((c) => !known.has(c))
}
const selectionProblem = (tools, select) => {
  if (!Array.isArray(tools)) return 'KIT_TOOLS must be an array'
  for (const t of tools) {
    if (!t || typeof t.name !== 'string' || t.name === '') return 'a kit tool needs a name'
    if (typeof t.disableKey !== 'string' || !t.disableKey) return 'kit tool ' + t.name + ' has no disableKey (a pack must be able to turn it off)'
  }
  const none = select({ enabled: [] })
  if (!Array.isArray(none) || none.length !== 0) return 'selectKitTools({enabled:[]}) must return []'
  for (const t of tools) {
    const one = select({ enabled: [t.name] })
    if (!Array.isArray(one) || !one.some((x) => x.name === t.name)) return 'kit tool ' + t.name + ' cannot be enabled by name'
  }
  return null
}

if (selftest) {
  const badCall = scanSource('export const x = () => spawn({ command: "lean" })')
  const commentOnly = scanSource('// we deliberately never call spawn here, and fs is not imported\nexport const x = 1')
  const badCode = codeProblems('throw new Error("VMU_KIT_NOT_REGISTERED")')
  const badSelection = selectionProblem([{ name: 'x' }], () => [])
  const okAll = badCall.length > 0 && commentOnly.length === 0 && badCode.includes('VMU_KIT_NOT_REGISTERED') && badSelection !== null
  console.log('=== KIT BOUNDARIES SELFTEST: ' + (okAll ? 'GREEN' : 'RED') + ' ===')
  console.log('  call RED:', badCall.length > 0, '| comment-only GREEN:', commentOnly.length === 0,
    '| unknown code RED:', badCode.length > 0, '| missing disableKey RED:', badSelection !== null)
  process.exit(okAll ? 0 : 1)
}

const mod = await import(pathToFileURL(join(KIT_DIR, 'tools.js')).href)
const files = walkJs(KIT_DIR)
let failed = 0
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = file.replace(REPO + '/', '')
  for (const p of scanSource(src)) { failed += 1; console.log('FAIL ' + rel + ': forbidden ' + p) }
  for (const c of codeProblems(src)) { failed += 1; console.log('FAIL ' + rel + ': unregistered error code ' + c) }
}
const sel = selectionProblem(mod.KIT_TOOLS, mod.selectKitTools)
if (sel) { failed += 1; console.log('FAIL kit selection: ' + sel) }
console.log('=== KIT BOUNDARIES: ' + (failed === 0 ? 'PASS' : failed + ' problem(s)') + ' (files=' + files.length + ', tools=' + (mod.KIT_TOOLS || []).length + ') ===')
process.exit(failed === 0 ? 0 : 1)
