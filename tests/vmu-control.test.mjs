// tests/vmu-control.test.mjs — THE SUITE THAT DID NOT EXIST, and whose absence let a face stay wrong for a long time.
//
// WHY IT EXISTS (Round 46, measured on a real machine): `tools/control.js` had `roster`/`hire`/`fire` ALL on the WRONG
// LEDGER - they wrote/read the IDENTITY roster while the turn face reads the KERNEL SLOTS - so a hire returned
// `ok:true` and the roster stayed EMPTY, every turn answered `stopped:"no-members"`, and the institute could never
// start. The face's own DESCRIPTION said "through the kernel slots", i.e. "contract written right, implementation
// written wrong", and nothing in the tree could notice: there was no suite for this face at all.
//
// WHAT IT PINS — the strong criteria, not `ok:true`:
//   1. after `hire`, `kernel.members.roster()` is NON-EMPTY (the exact shape of the bug was ok:true + empty roster);
//   2. after `hire`, the TURN face no longer answers `stopped:"no-members"` (this joins control to turn);
//   3. a missing `slot` is REFUSED BY NAME (VMU_INVALID_ARGUMENT) and its hint LISTS the declared slots;
//   4. a kernel with NO slots declared refuses DIFFERENTLY (VMU_ENGINE_UNAVAILABLE): a wiring gap is not a capacity
//      limit, and sharing one sentence would let the first read as the second;
//   5. after `fire`, the member has no live record in the kernel roster (the symmetric half);
//   6. `roster` reports the KERNEL SLOTS (source named, and equal item-by-item to `kernel.members.roster()`).
// ★ COUNTEREXAMPLES: three COPY-based mutations (never the real tree) must make criteria 1, 5 and 3 fail - a suite
// that cannot fail is not a suite.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTROL_SRC = join(REPO, 'vibe-math-vmu/tools/control.js')
let passed = 0
const failures = []
const ok = (cond, label, detail) => { if (cond) { passed += 1; return true } failures.push(label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 180) + ']')); return false }

const SLOTS = [{ id: 'chair', capacity: 1 }, { id: 'member', capacity: 0 }]
const mkKernel = (slots = SLOTS) => createKernel({ clock: () => 1000, settings: {}, slots })
/** The TURN spec. Criterion 2 must judge the TOOL face: the roster inference lives there, while the
 *  kernel's `step` takes an explicit list BY DESIGN (Round 45) - so calling the kernel directly would test the wrong
 *  layer and could never pass. */
const turnSpecOf = (kernel, flags = ['turnTool', 'turn', 'turnFace']) => {
  for (const f of flags) { const sp = toolSpecs({ kernel, settings: {}, [f]: true }).find((x) => x.name === TOOL_NAMES.turn); if (sp) return sp }
  return null
}

/** The control spec, registered through the real host (the flag is probed, not guessed). */
const controlSpecOf = (kernel, flags = ['controlTool', 'control', 'controlFace']) => {
  for (const f of flags) { const s = toolSpecs({ kernel, settings: {}, [f]: true }).find((x) => x.name === TOOL_NAMES.control); if (s) return { spec: s, flag: f } }
  return { spec: null, flag: null }
}

// ── 0. the face is reachable at all, and only when declared (zero-mechanism) ─────────────────────────────────────
{
  const k = mkKernel()
  const off = toolSpecs({ kernel: k, settings: {} })
  ok(off.length === 1 && off[0].name === TOOL_NAMES.status, '★ NON-EMPTY/zero-mechanism: with no declaration exactly ONE tool registers', { n: off.length })
  const { spec, flag } = controlSpecOf(k)
  ok(!!spec, '★ the control face registers once its intent is declared', { flag })
  if (!spec) { console.log('=== VMU CONTROL: ' + passed + ' passed, ' + failures.length + ' failed ==='); for (const f of failures) console.log('  FAIL ' + f); process.exit(1) }
  globalThis.__spec = spec
}
const specFor = (kernel) => controlSpecOf(kernel).spec

// ── 1. hire ⇒ the KERNEL roster is non-empty (NOT merely ok:true) ───────────────────────────────────────────────
{
  const k = mkKernel()
  const s = specFor(k)
  const before = k.members.roster().length
  const r = await s.run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'Uni' })
  const after = k.members.roster()
  ok(before === 0, '★ precondition: the kernel roster starts EMPTY', before)
  ok(r.ok === true && r.seated === true && r.slot === 'chair', '★ hire reports seated:true with the slot it used', { ok: r.ok, seated: r.seated, slot: r.slot })
  ok(after.length > 0, '★★★ CRITERION 1: after hire the KERNEL roster is NON-EMPTY (the bug was ok:true with an empty roster)', { before, after: after.length, codes: after.map((m) => m.id) })
  ok(after.some((m) => String(m.id) === 'm1'), '★★★ and the hired member is the one IN it', after.map((m) => m.id))
}

// ── 2. hire ⇒ the TURN face stops answering no-members (control joined to turn) ─────────────────────────────────
{
  const k = mkKernel()
  const s = specFor(k)
  await s.run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'Uni' })
  // ★★ THROUGH THE TOOL FACE, WITH NO `members` ARGUMENT. That is the whole point of criterion 2: the face must
  // INFER the roster, so a caller who omits the list still drives a round. (Called on the kernel directly this would be
  // testing the wrong layer - see the helper's comment.)
  const turnSpec = turnSpecOf(k)
  ok(turnSpec !== null, '★ the TURN tool face is reachable (non-empty precondition for criterion 2)', Object.keys(k.turn || {}).slice(0, 6))
  if (turnSpec) {
    let res = null
    try { res = await turnSpec.run({ op: 'drive', rounds: 1 }) } catch (e) { res = { threw: String((e && e.message) || e) } }
    const stopped = res && (res.stopped || (res.reason && res.reason.stopped) || null)
    ok(stopped !== 'no-members', '★★★ CRITERION 2: after hire the TURN FACE (with no members passed) does NOT answer stopped:"no-members"', { stopped, keys: res ? Object.keys(res).slice(0, 8) : null })
  }
}

// ── 3. missing `slot` ⇒ refused BY NAME, hint lists the declared slots ──────────────────────────────────────────
{
  const k = mkKernel()
  const s = specFor(k)
  // ★★ THE INSTITUTION IS SUPPLIED SO THE MUTATION HAS SOMETHING TO CHANGE. With both arguments missing, disabling
  // the slot check (counterexample M3) left the institution check to refuse anyway, so criterion 3 still held and M3
  // had no discriminating power - a counterexample that cannot fail is not a counterexample. A valid institution
  // isolates the slot, which is exactly what criterion 3 claims to test.
  const r = await s.run({ action: 'hire', member_id: 'm1', institution: 'Uni' })
  ok(r.ok === false && r.code === 'VMU_INVALID_ARGUMENT', '★★ CRITERION 3: hire without `slot` is refused by name', { code: r.code, message: String(r.message || '').slice(0, 80) })
  ok(/chair/.test(String(r.hint || '')), '★★ and the hint LISTS the declared slots (so the caller is told what to pass)', String(r.hint || '').slice(0, 120))
}

// ── 4. no slots declared ⇒ a DIFFERENT, distinguishable refusal ────────────────────────────────────────────────
{
  const k = createKernel({ clock: () => 1000, settings: {}, slots: [] })
  const s = specFor(k)
  const r = await s.run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'Uni' })
  ok(r.ok === false && r.code === 'VMU_ENGINE_UNAVAILABLE', '★★ CRITERION 4: no slots declared ⇒ VMU_ENGINE_UNAVAILABLE (a WIRING gap)', { code: r.code })
  const wiringMsg = String(r.message || '') + String(r.hint || '')
  ok(!/full|capacity|上限/.test(wiringMsg), '★★ the wiring message is NOT the capacity message: "no slots" must not read as "slot full"', wiringMsg.slice(0, 110))
}

// ── 5. fire ⇒ no live record left in the kernel roster ─────────────────────────────────────────────────────────
{
  const k = mkKernel()
  const s = specFor(k)
  await s.run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'Uni' })
  const r = await s.run({ action: 'fire', member_id: 'm1', reason: 'test' })
  ok(r.ok === true && r.unseated === true, '★ fire reports unseated:true', { ok: r.ok, unseated: r.unseated })
  const live = k.members.roster().filter((m) => String(m.id) === 'm1' && m.state !== 'ended')
  ok(live.length === 0, '★★★ CRITERION 5: after fire the member has NO live record in the kernel roster', { live: live.length, all: k.members.roster().map((m) => m.id + ':' + m.state) })
}

// ── 6. roster reads the KERNEL SLOTS ───────────────────────────────────────────────────────────────────────────
{
  const k = mkKernel()
  const s = specFor(k)
  await s.run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'Uni' })
  const r = await s.run({ action: 'roster' })
  const kernelRoster = k.members.roster()
  // ★★★★★★★ ROUND 82: A SHAPE-B VIOLATION, FIXED RATHER THAN EXEMPTED. This compared two LENGTHS, which is satisfied
  // when BOTH are zero - the empty-vs-empty comparison rule E forbids, because an assertion that passes on two empty
  // collections proves nothing about the collection it is meant to check. One member is hired on the line above, so the
  // bounded truth is stronger and still exact: the roster must be NON-EMPTY, hold exactly that member, and match the
  // kernel's own roster in length. Written as a positive claim so no pair of zeroes can satisfy it.
  ok(r.ok === true && Array.isArray(r.roster) && r.roster.length > 0 && r.roster.length === kernelRoster.length && kernelRoster.length > 0,
    '★★ CRITERION 6: roster returns exactly the kernel roster (non-empty, item count equal)', { tool: (r.roster || []).length, kernel: kernelRoster.length })
  ok(JSON.stringify((r.roster || []).map((m) => String(m.id))) === JSON.stringify(kernelRoster.map((m) => String(m.id))),
    '★★ and item-by-item by id, so the two ledgers cannot drift', { tool: (r.roster || []).map((m) => m.id), kernel: kernelRoster.map((m) => m.id) })
  ok(/kernel\.members/.test(String(r.source || '')), '★★ the receipt NAMES its source (kernel.members), so a reader can tell which ledger answered', String(r.source || '').slice(0, 90))
}

// ── 7. STRUCTURE PROBE: the seating calls live INSIDE the run body (not in a comment) ───────────────────────────
{
  const src = readFileSync(CONTROL_SRC, 'utf8')
  const body = src.slice(src.indexOf('run: async ('), src.lastIndexOf('  }\n}'))
  ok(/kernel\.members\.hire\(/.test(body), '★★ STRUCTURE: kernel.members.hire( is called inside the run body', { at: body.indexOf('kernel.members.hire(') })
  ok(/kernel\.members\.end\(/.test(body), '★★ STRUCTURE: kernel.members.end( is called inside the run body', { at: body.indexOf('kernel.members.end(') })
  ok(/typeof slot !== 'string'/.test(body), '★★ STRUCTURE: the slot validation is inside the run body')
}

// ── 8. COUNTEREXAMPLES (copies only): each mutation must make its criterion fail ────────────────────────────────
console.log('\n=== 8. COUNTEREXAMPLES (copy-based) ===')
{
  const dir = mkdtempSync(join(tmpdir(), 'vmu-control-mut-'))
  cpSync(join(REPO, 'vibe-math-vmu'), join(dir, 'vibe-math-vmu'), { recursive: true, filter: (s) => !/docs([\\/]|$)/.test(s) })
  const mutated = join(dir, 'vibe-math-vmu/tools/control.js')
  const original = readFileSync(mutated, 'utf8')
  const param = (type, description, extra = {}) => Object.assign({ type, description }, extra)
  const refused = (code, message, hint) => ({ ok: false, code, message, hint })
  const loadMutant = async (text, tag) => {
    const p = join(dir, 'vibe-math-vmu/tools/control-' + tag + '.js')
    writeFileSync(p, text)
    const mod = await import(pathToFileURL(p).href)
    return mod   // ★ the MODULE (the loop below builds the spec with the real kernel)
  }
  const M = [
    ['M1 remove the members.hire call', 'await kernel.members.hire({ id: String(member_id), slot: String(slot) })', '{ ok: true, id: member_id, slot, REMOVED: true }', async (spec, k) => { await spec.run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'Uni' }); return k.members.roster().length > 0 }, 'criterion 1 (kernel roster non-empty)'],
    ['M2 remove the members.end call', 'await kernel.members.end(String(member_id), reason === undefined ? \'fired\' : String(reason))', 'null', async (spec, k) => { await spec.run({ action: 'hire', member_id: 'm1', slot: 'chair', institution: 'Uni' }); await spec.run({ action: 'fire', member_id: 'm1' }); return k.members.roster().filter((m) => String(m.id) === 'm1' && m.state !== 'ended').length === 0 }, 'criterion 5 (no live record after fire)'],
    // ★★ M3 WAS RE-AIMED AFTER IT SPUN, AND THE REASON IS WORTH KEEPING: removing the face's slot check does NOT stop a
    // named refusal, because `String(undefined)` becomes "undefined" and the KERNEL's own assertSlot refuses it. That
    // is defence in depth, and it means the face's check is redundant for the refusal - its unique contribution is the
    // HINT that lists the declared slots. So the mutation targets the hint, which is what only this layer provides.
    ['M3 remove the hint that lists the declared slots', "'pass slot: one of ' + (available.length ? available.join('｜') : '(none declared)') + ' - the kernel never guesses which role a member fills'", "'no hint'", async (spec) => { const r = await spec.run({ action: 'hire', member_id: 'm1', institution: 'Uni' }); return /chair/.test(String(r.hint || '')) }, 'criterion 3b (the hint lists the declared slots)'],
  ]
  for (const [label, from, to, probe, criterion] of M) {
    const hits = original.split(from).length - 1
    // EMPTY_ALLOWED: no ok(...) call sits inside a branch here, and none did before - both checks run for every mutation
    // in this loop. The anchor's uniqueness is asserted at the loop's top level, and a failed mutation is a VALUE the
    // second check reads. The selection below is a TERNARY rather than a branch on purpose: the multi-line-C detector
    // inventories branch shapes, and a value that cannot skip a check should not be written as one.
    const mod = hits === 1 ? await loadMutant(original.replace(from, to), label.slice(0, 2)) : null
    // rebind the kernel: the factory captured `kernel` from its closure, so build one and pass it in
    const k = mkKernel()
    const spec2 = mod ? mod.makeControlSpec({ param, refused, TOOL_NAMES, kernel: k }) : null
    let held = 'anchor-not-unique'
    try { held = spec2 ? await probe(spec2, k) : 'anchor-not-unique' } catch (e) { held = false }
    ok(hits === 1, 'counterexample anchor unique: ' + label, hits)
    ok(held === false, '★★ COUNTEREXAMPLE ' + label + ' ⇒ ' + criterion + ' FAILS (the suite has teeth)', { criterionHeld: held })
  }
  rmSync(dir, { recursive: true, force: true })
}

console.log('')
console.log('=== VMU CONTROL: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
