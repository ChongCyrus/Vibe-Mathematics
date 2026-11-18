// tests/vmu-reply-fields-pack.test.mjs — TB-2794 Step 2: the RESEARCH reply fields belong to the v5r pack.
//
// WHAT MOVED: `formal`, `lean_archive`, `lean_run` were in the kernel's core reply-field table (FIELD_OWNERS) and the
// formal field's taught shape was enforced by a kernel adapter. Both are INSTITUTION vocabulary: v5r's members write
// them, v5r's faces consume them. Step 2 moves the DECLARATIONS to `packs/v5r/runtime.json replyFields` and the ADAPTER
// to `packs/v5r/reply-field-adapters.js`, supplied through the kernel's generic seam
// (`kernel.registerReplyFieldAdapter` / `PACK.replyFieldAdapters`). The kernel keeps a framework-only core table.
//
// THIS SUITE PINS: (1) the core table is framework-only; (2) the pack declares + supplies them; (3) the adapter seam
// dispatches correctly and a MISSING adapter is a NAMED skip — never a raw dispatch, never "unknown field"; (4) the
// no-pack kernel genuinely has no such owners (absence, not an empty stub).
//
// Run: node tests/vmu-reply-fields-pack.test.mjs   Last line: N passed, M failed

import { mkdtemp, rm } from 'node:fs/promises'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const RUNTIME = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'runtime.json')
const ADAPTERS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'reply-field-adapters.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const TURN = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
const ADAPT = await import(pathToFileURL(ADAPTERS).href)
const RUNTIME_JSON = JSON.parse(readFileSync(RUNTIME, 'utf8'))

const boot = async (packs) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-step2-'))
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const entry = await import(pathToFileURL(ENTRY).href + '?boot=' + Math.random())
  const handle = entry.apply(ctx, { clock: () => 1000, packs, root })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, root }
}

try {
  // §1 THE CORE TABLE IS FRAMEWORK-ONLY
  console.log('§1 the kernel core reply-field table no longer names research fields')
  for (const f of ['formal', 'lean_archive', 'lean_run']) {
    ok(TURN.FIELD_OWNERS[f] === undefined && TURN.FIELDS.indexOf(f) < 0,
      '§1 ' + f + ' is NOT a kernel core reply field', TURN.FIELD_OWNERS[f] || null)
  }
  ok(TURN.FIELDS.length === 19, '§1 and the core table is the measured 19 framework fields', TURN.FIELDS.length)

  // §2 THE PACK DECLARES THEM (data, not a second implementation)
  console.log('§2 the v5r runtime declares the three fields and the formal adapter')
  for (const f of ['formal', 'lean_archive', 'lean_run']) {
    const row = RUNTIME_JSON.replyFields.filter((x) => x.field === f)[0]
    ok(row && typeof row.face === 'string' && typeof row.op === 'string',
      '§2 runtime.json declares ' + f + ' with a face.op', row || null)
  }
  const formalRow = RUNTIME_JSON.replyFields.filter((x) => x.field === 'formal')[0]
  ok(formalRow && formalRow.adapter === 'v5r-formal-check',
    '§2 the formal field binds the pack adapter by NAME (data travels through runtime.json; behaviour through PACK.replyFieldAdapters)', formalRow && formalRow.adapter)

  // §3 THE PACK SUPPLIES A REAL ADAPTER (same shape contract as RUN 191)
  console.log('§3 the pack adapter keeps the taught-shape contract, reason word included')
  ok(typeof ADAPT.formalCheckPayload === 'function', '§3 the pack exports the adapter')
  const good = ADAPT.formalCheckPayload({ statement: 'all n, P(n)', proof: 'theorem foo : True := trivial' }, { describeShape: (v) => typeof v })
  ok(good.ok === true && Array.isArray(good.args) && good.args[0].statement === 'all n, P(n)' && good.args[0].proof.indexOf('theorem') === 0,
    '§3 a real formalisation attempt is dispatched with the face own argument object', good)
  const card = ADAPT.formalCheckPayload({ decision: true, file: 'Formal/rec-1.lean', note: 'done' }, { describeShape: (v) => (v === null ? 'null' : typeof v) })
  ok(card.ok === false && card.reason === 'formal-shape' && card.code === 'VMU_MATH_INVALID_INPUT' && Array.isArray(card.missing) && card.missing.length === 2,
    '§3 a CARD shape is skipped BY NAME with reason "formal-shape" (the word RUN 191 pinned)', card)

  // §4 THE KERNEL ADAPTER SEAM: register/retract, conflict, ownership
  console.log('§4 the kernel adapter seam is generic and ownership-checked')
  {
    const km = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
    const k = km.createKernel({ clock: () => 1000 })
    ok(typeof k.registerReplyFieldAdapter === 'function' && typeof k.retractReplyFieldAdapter === 'function',
      '§4 the kernel exposes the adapter register/retract seam')
    const r = k.registerReplyFieldAdapter({ name: 'probe-adapter', adapt: () => ({ ok: true, args: [] }), by: 'probe-pack' })
    ok(r.ok === true && r.providedBy === 'probe-pack', '§4 a pack can register an adapter with its owner recorded', r)
    let conflict = null
    try { k.registerReplyFieldAdapter({ name: 'probe-adapter', adapt: () => ({ ok: true, args: [] }), by: 'other-pack' }) } catch (e) { conflict = e }
    ok(conflict && conflict.code === 'VMU_SERVICE_CONFLICT', '§4 a second owner is refused by name (one name, one owner)', conflict && conflict.code)
    let foreign = null
    try { k.retractReplyFieldAdapter({ name: 'probe-adapter', by: 'other-pack' }) } catch (e) { foreign = e }
    ok(foreign && foreign.code === 'VMU_NOT_PERMITTED', '§4 only the contributor may retract its adapter', foreign && foreign.code)
    const gone = k.retractReplyFieldAdapter({ name: 'probe-adapter', by: 'probe-pack' })
    ok(gone.ok === true, '§4 and the contributor CAN retract it (no residue left by design)')
    const st = k.status({ detail: 'full' })
    ok(Array.isArray(st.replyFieldAdaptersProvided) && st.replyFieldAdaptersProvided.length === 0,
      '§4 the status names the contributed adapters and shows none after retraction', st.replyFieldAdaptersProvided)
  }

  // §5 DISPATCH: adapter present => face called; adapter ABSENT => NAMED skip (never raw, never unknown)
  console.log('§5 dispatch resolves the pack adapter at call time')
  {
    const calls = []
    const faces = { 'vmu.formal': { check: async (args) => { calls.push(args); return { ok: true, verdict: 'checked' } } } }
    const loop = TURN.createTurnOrchestrator({ faces, replyFields: RUNTIME_JSON.replyFields, resolveReplyAdapter: (name) => (name === 'v5r-formal-check' ? ADAPT.formalCheckPayload : null) })
    const out = await loop.apply({ formal: { statement: 'P', proof: 'theorem t : True := trivial' } })
    ok(out.executed.length === 1 && calls.length === 1 && calls[0].statement === 'P',
      '§5 a declared field with a registered adapter dispatches to its face exactly once', { executed: out.executed.length, calls })
  }
  {
    const calls = []
    const faces = { 'vmu.formal': { check: async (args) => { calls.push(args); return { ok: true } } } }
    const loop = TURN.createTurnOrchestrator({ faces, replyFields: RUNTIME_JSON.replyFields, resolveReplyAdapter: () => null })
    const out = await loop.apply({ formal: { statement: 'P', proof: 'theorem t : True := trivial' } })
    ok(out.executed.length === 0 && calls.length === 0 && out.skipped.length === 1 &&
      out.skipped[0].reason === 'adapter-not-wired' && out.skipped[0].code === 'VMU_TURN_FIELD_ADAPTER_NOT_WIRED' &&
      out.skipped[0].adapter === 'v5r-formal-check',
      '§5 LAMP: a missing adapter is a NAMED skip (adapter-not-wired / VMU_TURN_FIELD_ADAPTER_NOT_WIRED) — NOT a raw dispatch, NOT face-not-wired, NOT an unknown field',
      out.skipped) }
  ok(typeof TURN.mergeReplyFieldOwners === 'function' &&
    (() => { try { TURN.mergeReplyFieldOwners([{ field: 'x', face: 'vmu.x', op: 'y', adapter: 'BAD NAME' }]); return false } catch (e) { return e.code === 'VMU_INVALID_ARGUMENT' } })(),
    '§5 a malformed adapter NAME in a declaration is refused by name (not silently ignored)')

  // §6b THE FACE MAP IS BUILT FROM THE EFFECTIVE OWNERS (round-9 P1, MEASURED): a pack field whose face.op is not in
  // the core table used to be reported "face-not-wired" even though the face existed. These assertions dispatch through a
  // REAL v5r boot: the call must REACH vmu.mathjobs.submit (and get its own refusal), and a lamp proves the owner map is
  // what makes that true.
  console.log('§6b a pack field dispatch reaches its face in a REAL v5r boot (not face-not-wired)')
  {
    const b = await boot(['v5r'])
    const out = await b.K.turn.apply({ lean_archive: { kind: 'blocked', note: 'no toolchain on this host' } }, null, 'r-1')
    const skip = out.skipped[0] || null
    ok(out.executed.length === 1 && skip === null,
      '§6b ★ lean_archive is DISPATCHED (executed:1) — the face map knows vmu.mathjobs.submit', { executed: out.executed.length, skipped: out.skipped })
    ok(out.executed[0] && out.executed[0].face === 'vmu.mathjobs' && out.executed[0].op === 'submit',
      '§6b and the executed row names the face/op the pack declared', out.executed[0] && { face: out.executed[0].face, op: out.executed[0].op })
    ok(out.executed[0] && out.executed[0].result && out.executed[0].result.ok === false && out.executed[0].result.code === 'VMU_MATH_INVALID_INPUT',
      "§6b the face answered with its OWN named refusal (VMU_MATH_INVALID_INPUT), not the loop's face-not-wired", out.executed[0] && out.executed[0].result)
    const formal = await b.K.turn.apply({ formal: { statement: 'P', proof: 'theorem t : True := trivial' } }, null, 'r-1')
    ok(formal.skipped.length === 0 && formal.executed.length === 1 && formal.executed[0].face === 'vmu.formal',
      '§6b ★ formal reaches vmu.formal.check too (adapter args + the pack-declared face.op in the map)', { executed: formal.executed.length, skipped: formal.skipped })
    await rm(b.root, { recursive: true, force: true, maxRetries: 10 }).catch(() => {})
  }
  {
    // LAMP: build the face map from the CORE owners only (the pre-fix shape) in a COPY — the same dispatch must go red.
    const dir = await mkdtemp(join(tmpdir(), 'vmu-step2b-lamp-'))
    try {
      cpSync(join(REPO, 'vibe-math-vmu'), join(dir, 'vibe-math-vmu'), { recursive: true })
      const kp = join(dir, 'vibe-math-vmu', 'kernel', 'index.js')
      const src = readFileSync(kp, 'utf8')
      const marker = 'resolveOwners(null, replyFields))'
      const resolver = '    resolveService: (name) => resolveFace(null, name),'
      ok(src.includes(marker) && src.includes(resolver), '§6b lamp-setup: the effective-owner map AND the lazy resolver are locatable')
      // Step 4 added the dispatch-time resolver; the lamp must remove BOTH ingredients (the owner map and the resolver)
      // to reproduce the pre-Step-2B/pre-Step-4 construction-time behaviour.
      const mutated = src.split(marker).join('undefined)').split(resolver).join('')
      writeFileSync(kp, mutated, 'utf8')
      const lampEntry = (await import(pathToFileURL(join(dir, 'vibe-math-vmu', 'vibe-math-vmu.js')).href + '?lamp=' + Date.now())).apply
      const state = { specs: [] }
      const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
      const handle = lampEntry(ctx, { clock: () => 1000, packs: ['v5r'], root: join(dir, 'lamp-root') })
      await handle.ready()
      await handle.kernel.store.open()
      const lout = await handle.kernel.turn.apply({ lean_archive: { kind: 'blocked', note: 'x' } }, null, 'r-1')
      ok(lout.executed.length === 0 && lout.skipped[0] && lout.skipped[0].reason === 'face-not-wired' && lout.skipped[0].code === 'VMU_TURN_FACE_NOT_WIRED',
        '§6b LAMP(RED-worthy): with the CORE-only owner map the SAME declared field is face-not-wired — the owner mapping is load-bearing',
        lout.skipped)
    } finally { await rm(dir, { recursive: true, force: true, maxRetries: 10 }).catch(() => {}) }
  }

  // §6 THE REAL ASSEMBLY: pack declares the fields, no-pack genuinely lacks them
  console.log('§6 the mounted assembly carries the pack fields; a no-pack kernel does not')
  {
    const b = await boot(['v5r'])
    const owners = b.K.turn.status().owners
    ok(owners && owners.formal && owners.formal.face === 'vmu.formal' && owners.lean_archive && owners.lean_run,
      '§6 with v5r mounted the effective owners include formal/lean_archive/lean_run', owners && Object.keys(owners).filter((k) => /formal|lean/.test(k)))
    ok(owners.formal.packDeclared === true && owners.formal.pack === 'v5r',
      '§6 and they are marked as PACK-declared (the kernel table is not the owner)', owners.formal)
    await rm(b.root, { recursive: true, force: true, maxRetries: 10 }).catch(() => {})
  }
  {
    const b = await boot([])
    const owners = b.K.turn.status().owners
    ok(owners && owners.formal === undefined && owners.lean_archive === undefined && owners.lean_run === undefined,
      '§6 a kernel with NO pack has NO such owners (absence, not an empty stub)', owners && Object.keys(owners).filter((k) => /formal|lean/.test(k)))
    await rm(b.root, { recursive: true, force: true, maxRetries: 10 }).catch(() => {})
  }
} finally {
  // tmp roots are removed per block; nothing else to clean
}

console.log('')
console.log('=== REPLY FIELDS (PACK): ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }
