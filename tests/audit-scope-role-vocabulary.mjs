#!/usr/bin/env node
// PHASE 7 round 13 — ONE vocabulary validator, TWO consumers (section scope + charter/role bindings).
//
// ROOT CAUSE THIS GATE PREVENTS: `scope.role` and binding `role` are matched against `turn.role`, which is the SLOT id
// (kernel/turn: "role is the KEY bindings select on"); display names live in `roleLabel`. A display name in either place
// NEVER matches, yet local tests that pass display names stay green. The legal vocabulary is DERIVED per pack:
//   role  ∈ manifest slot ids ∪ role literals the pack dispatches (role: '…' outside scope) ∪ *ROLES* arrays
//   phase ∈ kernel TURN_PHASES ∪ the pack's declared phases
//   task  ∈ task literals the pack dispatches (task: '…' outside scope) or * / all
//   member: only structural (wildcard / non-empty ids); liveness cannot be decided statically and is reported as such.
// The SAME validator is called for a section's scope.<dim> AND for a binding's <dim>; the SHAPES differ, the check does not.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TURN_PHASES } from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')
const PACK_ROOT = join(REPO, 'vibe-math-vmu', 'packs')
const packs = ['v3', 'v5r']
const selftest = process.argv.includes('--selftest')

const walkJs = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkJs(p, out)
    else if (name.endsWith('.js')) out.push(p)
  }
  return out
}
const valuesOf = (v) => (Array.isArray(v) ? v : [v])
const literalsOf = (dir, key) => {
  const out = new Set()
  const re = new RegExp(key + ":\\s*'([A-Za-z][A-Za-z0-9_-]*)'", 'g')
  for (const file of walkJs(dir)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.includes('scope') || line.includes('binding')) continue
      let m
      while ((m = re.exec(line))) out.add(m[1])
    }
  }
  return out
}

/** Build the vocabulary ONCE per pack; the validator below is the only place that decides legal/illegal. */
const vocabularyOf = async (id) => {
  const dir = join(PACK_ROOT, id)
  const mod = await import(pathToFileURL(join(dir, 'index.js')).href)
  const manifest = mod.PACK || {}
  const slots = new Set((manifest.slots || []).map((s) => s && s.id).filter((x) => typeof x === 'string'))
  const dispatchRoles = literalsOf(dir, 'role')
  for (const file of walkJs(dir)) {
    const text = readFileSync(file, 'utf8')
    const arrRe = /(?:[A-Z][A-Z0-9_]*ROLES?[A-Z0-9_]*)\s*=\s*Object\.freeze\(\[([^\]]*)\]/g
    let am
    while ((am = arrRe.exec(text))) for (const m of am[1].matchAll(/'([A-Za-z][A-Za-z0-9_-]*)'/g)) dispatchRoles.add(m[1])
  }
  const dispatchTasks = literalsOf(dir, 'task')
  const packPhases = new Set([...(Array.isArray(mod.V5R_PHASES) ? mod.V5R_PHASES : []), ...(Array.isArray(manifest.phases) ? manifest.phases : [])])
  return {
    id,
    slots: [...slots],
    dispatchRoles: [...dispatchRoles].sort(),
    dispatchTasks: [...dispatchTasks].sort(),
    legal: {
      role: new Set([...slots, ...dispatchRoles]),
      phase: new Set([...TURN_PHASES, ...packPhases]),
      task: new Set([...dispatchTasks, '*', 'all']),
    },
  }
}

/** THE ONE VALIDATOR — used by both scope and binding; returns a problem object or null. */
const validateDimension = (vocab, dim, value, where) => {
  if (value === undefined || value === null) return null
  if (dim === 'member') {
    const ms = valuesOf(value)
    for (const m of ms) if (typeof m !== 'string' || m === '') return { where, dim, value, message: dim + ' must be a non-empty string/wildcard' }
    if (!ms.includes('*') && !ms.includes('all')) return { where, dim, value, staticOnly: true, message: dim + ' names specific member ids; liveness cannot be verified statically (needs a roster)' }
    return null
  }
  const legal = vocab.legal[dim]
  if (!legal) return { where, dim, value, message: 'unknown scope dimension ' + dim }
  for (const v of valuesOf(value)) {
    if (typeof v !== 'string' || !legal.has(v)) {
      return { where, dim, value: v, legal: [...legal].sort(),
        message: dim + ' "' + String(v) + '" is not in pack ' + vocab.id + "'s derived vocabulary" }
    }
  }
  return null
}

const auditPack = async (id, { sectionsOverride = null, bindingsOverride = null } = {}) => {
  const vocab = await vocabularyOf(id)
  const dir = join(PACK_ROOT, id)
  const mod = await import(pathToFileURL(join(dir, 'index.js')).href)
  const manifest = mod.PACK || {}
  const sections = sectionsOverride || manifest.sections || []
  const bindings = bindingsOverride || manifest.bindings || []
  const problems = []
  for (const s of sections) {
    const scope = s && s.scope
    if (!scope || typeof scope !== 'object') continue
    for (const dim of ['role', 'phase', 'task', 'member']) {
      const p = validateDimension(vocab, dim, scope[dim], 'section ' + String(s.name))
      if (p) problems.push(p)
    }
  }
  for (let i = 0; i < bindings.length; i += 1) {
    const b = bindings[i] || {}
    for (const dim of ['role', 'phase', 'task', 'member']) {
      const p = validateDimension(vocab, dim, b[dim], 'binding #' + (i + 1) + ' (section ' + String(b.section || '?') + ')')
      if (p) problems.push(p)
    }
  }
  return { vocab, sections: sections.length, bindings: bindings.length, problems }
}

if (selftest) {
  // A BAD binding role (display name) must be RED; a slot-id binding GREEN; a BAD scope RED; vocabulary non-empty.
  const badBinding = await auditPack('v5r', { bindingsOverride: [{ section: 'probe', role: 'academician', text: 'x' }] })
  const goodBinding = await auditPack('v5r', { bindingsOverride: [{ section: 'probe', role: 'member', text: 'x' }] })
  const badScope = await auditPack('v5r', { sectionsOverride: [{ name: 'probe', scope: { role: 'academician' } }] })
  const real = await vocabularyOf('v5r')
  const badBindingRed = badBinding.problems.some((p) => p.dim === 'role' && p.value === 'academician')
  const goodBindingGreen = goodBinding.problems.filter((p) => p.dim === 'role').length === 0
  const badScopeRed = badScope.problems.some((p) => p.dim === 'role' && p.value === 'academician')
  const derived = real.slots.length >= 3
  const okAll = badBindingRed && goodBindingGreen && badScopeRed && derived
  console.log('=== SCOPE+BINDING VOCABULARY SELFTEST: ' + (okAll ? 'GREEN' : 'RED') + ' ===')
  console.log('  bad binding RED:', badBindingRed, '| slot binding GREEN:', goodBindingGreen, '| bad scope RED:', badScopeRed, '| derived sets non-empty:', derived)
  if (!okAll) for (const p of badBinding.problems) console.log('  -', JSON.stringify(p))
  process.exit(okAll ? 0 : 1)
}

let failed = 0
for (const id of packs) {
  const r = await auditPack(id)
  console.log('== pack ' + id + ': sections=' + r.sections + ' bindings=' + r.bindings + ' slots=[' + r.vocab.slots.join(',') + '] dispatchRoles=[' + r.vocab.dispatchRoles.join(',') + '] dispatchTasks=[' + r.vocab.dispatchTasks.join(',') + ']')
  for (const p of r.problems) {
    if (p.staticOnly) { console.log('  note ' + p.where + '.' + p.dim + ': ' + p.message); continue }
    failed += 1
    console.log('  FAIL ' + p.where + '.' + p.dim + '="' + String(p.value) + '" :: ' + p.message + (p.legal ? ' | legal: ' + p.legal.join(',') : ''))
  }
  if (r.problems.filter((p) => !p.staticOnly).length === 0) console.log("  ok   every scope/binding dimension uses the pack's real vocabulary")
}
console.log('=== SCOPE+BINDING VOCABULARY: ' + (failed === 0 ? 'PASS' : failed + ' problem(s)') + ' ===')
process.exit(failed === 0 ? 0 : 1)
