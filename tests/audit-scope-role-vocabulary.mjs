#!/usr/bin/env node
// PHASE 7 — scope vocabulary gate. A section's scope.<dim> must name REAL vocabulary, not display prose:
//   role  ∈ pack's declared SLOT ids ∪ role literals the pack DISPATCHES (role: '…' outside a scope line)
//   phase ∈ kernel TURN_PHASES ∪ the pack's declared phases
//   task  ∈ task literals the pack dispatches (task: '…' outside a scope line) or '*'
//   member: structural (wildcard or ids); "is this id live? " cannot be decided statically and is reported as such.
// We do NOT keep a hand-written allow-list: every set is DERIVED from the manifest/source. --selftest proves a known
// bad section (display role) is RED and the real derived sets are not empty.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
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
const literalsOf = (dir, key) => {
  const out = new Set()
  const re = new RegExp(key + ":\\s*'([A-Za-z][A-Za-z0-9_-]*)'", 'g')
  for (const file of walkJs(dir)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.includes('scope')) continue
      let m
      while ((m = re.exec(line))) out.add(m[1])
    }
  }
  return out
}
const valuesOf = (v) => (Array.isArray(v) ? v : [v])

const auditPack = async (id, { sectionsOverride = null } = {}) => {
  const dir = join(PACK_ROOT, id)
  const mod = await import(pathToFileURL(join(dir, 'index.js')).href)
  const manifest = mod.PACK || {}
  const sections = sectionsOverride || manifest.sections || []
  const slots = new Set((manifest.slots || []).map((s) => s && s.id).filter((x) => typeof x === 'string'))
  const dispatchRoles = literalsOf(dir, 'role')
  // ★ A pack may derive its dispatched roles from a CONSTANT ARRAY (v3's SPAWN_ROLES) rather than one literal per
  // dispatch site. Read those arrays too, or the gate would red a role the pack really dispatches.
  for (const file of walkJs(dir)) {
    const text = readFileSync(file, 'utf8')
    const arrRe = /(?:[A-Z][A-Z0-9_]*ROLES?[A-Z0-9_]*)\s*=\s*Object\.freeze\(\[([^\]]*)\]/g
    let am
    while ((am = arrRe.exec(text))) for (const m of am[1].matchAll(/'([A-Za-z][A-Za-z0-9_-]*)'/g)) dispatchRoles.add(m[1])
  }
  const dispatchTasks = literalsOf(dir, 'task')
  const packPhases = new Set([...(Array.isArray(mod.V5R_PHASES) ? mod.V5R_PHASES : []), ...(Array.isArray(manifest.phases) ? manifest.phases : [])])
  const legalRole = new Set([...slots, ...dispatchRoles])
  const legalPhase = new Set([...TURN_PHASES, ...packPhases])
  const legalTask = new Set([...dispatchTasks, '*', 'all'])
  const problems = []
  for (const s of sections) {
    const scope = s && s.scope
    if (!scope || typeof scope !== 'object') continue
    for (const r of valuesOf(scope.role).filter((x) => x !== undefined && x !== null)) {
      if (typeof r !== 'string') { problems.push({ section: s.name, dim: 'role', value: r, message: 'scope.role must be a string' }); continue }
      if (!legalRole.has(r)) problems.push({ section: s.name, dim: 'role', value: r, legal: [...legalRole].sort(),
        message: 'scope.role "' + r + '" is not a slot id / dispatched role of pack ' + id })
    }
    for (const p of valuesOf(scope.phase).filter((x) => x !== undefined && x !== null)) {
      if (typeof p !== 'string' || !legalPhase.has(p)) problems.push({ section: s.name, dim: 'phase', value: p, legal: [...legalPhase].sort(),
        message: 'scope.phase "' + String(p) + '" is not a kernel/pack phase' })
    }
    for (const t of valuesOf(scope.task).filter((x) => x !== undefined && x !== null)) {
      if (typeof t !== 'string' || !legalTask.has(t)) problems.push({ section: s.name, dim: 'task', value: t, legal: [...legalTask].sort(),
        message: 'scope.task "' + String(t) + '" is not a dispatched task of pack ' + id })
    }
    if (scope.member !== undefined) {
      const ms = valuesOf(scope.member)
      for (const m of ms) {
        if (typeof m !== 'string' || m === '') problems.push({ section: s.name, dim: 'member', value: m, message: 'scope.member must be a non-empty string/wildcard' })
      }
      // LIVE-ID check is impossible statically; say so instead of pretending the structural check is the whole rule.
      if (!ms.includes('*') && !ms.includes('all')) problems.push({ section: s.name, dim: 'member', value: scope.member, staticOnly: true,
        message: 'scope.member names specific member ids; liveness cannot be verified staticially (needs a roster)' })
    }
  }
  return { id, slots: [...slots], dispatchRoles: [...dispatchRoles].sort(), dispatchTasks: [...dispatchTasks].sort(), phases: [...legalPhase].sort(), sections: sections.length, problems }
}

if (selftest) {
  // A KNOWN-BAD section (display role) must be RED; a known-good one must be GREEN; and the derived sets must not be empty.
  const bad = await auditPack('v5r', { sectionsOverride: [{ name: 'probe-bad', scope: { role: 'academician' } }] })
  const goodSlot = await auditPack('v5r', { sectionsOverride: [{ name: 'probe-good', scope: { role: 'member' } }] })
  const real = await auditPack('v5r')
  const badRed = bad.problems.some((p) => p.dim === 'role' && p.value === 'academician')
  const goodGreen = goodSlot.problems.filter((p) => p.dim === 'role').length === 0
  const derivedNonEmpty = real.slots.length >= 3 && real.sections >= 1
  const okAll = badRed && goodGreen && derivedNonEmpty
  console.log('=== SCOPE VOCABULARY SELFTEST: ' + (okAll ? 'GREEN' : 'RED') + ' ===')
  console.log('  known-bad (academician) is RED:', badRed, '| slot member is GREEN:', goodGreen, '| derived sets non-empty:', derivedNonEmpty)
  if (!okAll) for (const p of bad.problems) console.log('  -', JSON.stringify(p))
  process.exit(okAll ? 0 : 1)
}

let failed = 0
for (const id of packs) {
  const r = await auditPack(id)
  const roleProblems = r.problems.filter((p) => p.dim === 'role')
  console.log('== pack ' + id + ': sections=' + r.sections + ' slots=[' + r.slots.join(',') + '] dispatchRoles=[' + r.dispatchRoles.join(',') + '] dispatchTasks=[' + r.dispatchTasks.join(',') + ']')
  for (const p of r.problems) {
    if (p.dim === 'member' && p.staticOnly) { console.log('  note ' + p.section + ': ' + p.message); continue }
    failed += 1
    console.log('  FAIL ' + p.section + '.' + p.dim + '="' + String(p.value) + '" :: ' + p.message + (p.legal ? ' | legal: ' + p.legal.join(',') : ''))
  }
  if (roleProblems.length === 0) console.log('  ok   every scope.role is a real slot/dispatched role')
}
console.log('=== SCOPE VOCABULARY: ' + (failed === 0 ? 'PASS' : failed + ' problem(s)') + ' ===')
process.exit(failed === 0 ? 0 : 1)
