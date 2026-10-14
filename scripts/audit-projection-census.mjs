// scripts/audit-projection-census.mjs — R11 / task-83 (A+B+C, D-05).
//
// WHAT IT IS FOR: "declared but did not take effect" was found ONE INSTANCE AT A TIME (R10: a pack declared
// `ballots` while the adapter key was `ballotbox`, so ballot boxes were NEVER projected - silently; `members` was
// the named sibling). This script stops the whack-a-mole: it drives the REAL assembly and files EVERY declared
// face into exactly one of three tables - attached / viaAlias / notAttached(code+reason) - so a declaration can
// never again end up nowhere without a name on it.
//
// THE ZERO-MECHANISM RED LINE (D-01, task-83 B) is asserted, not assumed: an UNDECLARED face must have no
// instance, and the assembly must say so BY NAME (`VMU_RESUME_NO_TARGET`, whose reason spells out that the
// service is null BECAUSE nothing declared it) rather than inventing a target or quietly skipping the key.
//
// SELF-PROBE (task-83 C): the census is run a second time with a face that CANNOT exist planted into the
// declaration; the checker must report it as notAttached. If the planted face can vanish without a word, this
// gate is a hole and it fails itself.
//
// Run: node scripts/audit-projection-census.mjs          (exit 0 = green)
const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const entry = await import(new URL('../vibe-math-vmu/vibe-math-vmu.js', import.meta.url).href)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const assemble = async (root, extraSettings) => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (s) => { state.specs.push(s); return () => {} } },
  }
  const cfg = { clock: () => 1000000, root, packs: ['v5r'] }
  if (extraSettings) cfg.vmu = extraSettings
  const H = entry.apply(ctx, cfg)
  for (let i = 0; i < 400; i += 1) {
    const st = H.kernel.store && H.kernel.store.stats ? H.kernel.store.stats() : null
    // read-before-write latch: recover() must have run, or every later probe write is refused by name.
    if (st && st.open === true && H.kernel.recovery.status().restart.generation >= 1) return H
    await sleep(5)
  }
  return H
}

const tables = (kernel) => {
  const p = kernel.status().projections || {}
  const face = (x) => (typeof x === 'string' ? x : x && x.face)
  const declared = (kernel.status().settings && kernel.status().settings.resolved
    && kernel.status().settings.resolved['vmu.resume.projections']) || null
  const dv = declared && typeof declared === 'object' && declared.value !== undefined ? declared.value : declared
  const attached = (p.attached || []).map(face)
  const viaAlias = (p.viaAlias || []).map(face)
  const notAttached = (p.notAttached || [])
  return { declared: Array.isArray(dv) ? dv : [], attached, viaAlias, notAttached, known: p.known || [], unwired: p.unwiredKnown || [], wrapped: (p.wrappedMethods || []).map((w) => w.face) }
}

console.log('=== 1. THE REAL ASSEMBLY, EVERY DECLARED FACE FILED (three tables) ===')
const ROOT = join(process.env.TEMP || 'D:/_tmp', 'vmu-r11-census')
const H = await assemble(ROOT)
const T = tables(H.kernel)
console.log('  declared=' + JSON.stringify(T.declared))
console.log('  attached=' + JSON.stringify(T.attached))
console.log('  viaAlias=' + JSON.stringify(T.viaAlias))
console.log('  notAttached=' + JSON.stringify(T.notAttached.map((n) => n.face + ':' + n.code)))
ok(T.declared.length > 0 && T.attached.length > 0, 'the census is real (a declaration and an attachment were read)', { declared: T.declared.length, attached: T.attached.length })
ok(T.declared.every((d) => T.attached.includes(d) || T.viaAlias.includes(d) || T.notAttached.some((n) => n.face === d)),
  '★ NO declared face ends up NOWHERE: every one is attached, attached via an alias, or notAttached WITH A REASON', { declared: T.declared })
const reasonless = T.notAttached.filter((n) => !n.code || !n.reason)
ok(reasonless.length === 0, '★ every notAttached entry carries a code AND a reason (the "silent" siblings are gone)', reasonless)
ok(T.notAttached.every((n) => /zero-mechanism|nothing declared it/.test(String(n.reason))),
  '★ and every reason names the ZERO-MECHANISM cause rather than inventing a target (D-01)', T.notAttached.map((n) => n.code))
ok(T.known.length === T.declared.length && T.declared.every((d) => T.known.includes(d)),
  '`known` agrees with the declaration (no face is known that nobody declared, and none declared is unknown)', { known: T.known })
ok(T.unwired.length === T.notAttached.length,
  '`unwiredKnown` agrees with `notAttached` (the two readings cannot drift apart)', { unwired: T.unwired, not: T.notAttached.map((n) => n.face) })

console.log('=== 2. ZERO-MECHANISM: an UNDECLARED face has no instance and is not invented ===')
ok(T.attached.every((a) => T.declared.includes(a)), 'nothing is attached that was never declared (the assembly does not invent authorities)', { attached: T.attached })
ok(T.wrapped.every((a) => T.declared.includes(a)), 'nor is any method wrapper created for an undeclared face', { wrapped: T.wrapped })

console.log('=== 3. SELF-PROBE: a face that CANNOT exist must be REPORTED, never silently dropped ===')
const PLANTED = 'no-such-face-r11-probe'
const H2 = await assemble(ROOT + '-probe', { 'vmu.resume.projections': [...T.declared, PLANTED] })
const T2 = tables(H2.kernel)
const filed = T2.attached.includes(PLANTED) || T2.viaAlias.includes(PLANTED) || T2.notAttached.some((n) => n.face === PLANTED)
ok(filed, '★ a planted non-existent face is FILED (attached/viaAlias/notAttached) - if it could vanish silently this gate would be a hole', { planted: PLANTED, declared: T2.declared })
const plantedRow = T2.notAttached.find((n) => n.face === PLANTED)
ok(!!plantedRow && !!plantedRow.code, '★ and it is notAttached BY NAME (this is the assertion that goes red if the census ever stops reporting)', plantedRow)
rmSync(ROOT, { recursive: true, force: true })
rmSync(ROOT + '-probe', { recursive: true, force: true })

console.log('')
console.log('=== PROJECTION CENSUS: ' + passed + ' passed, ' + failed + ' failed ===')
console.log('  tables: declared=' + T.declared.length + ' attached=' + T.attached.length + ' viaAlias=' + T.viaAlias.length + ' notAttached=' + T.notAttached.length)
process.exit(failed === 0 ? 0 : 1)
