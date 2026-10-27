#!/usr/bin/env node
// vmu RUN 59 / F-49 — THE ALIAS OUTRANKED THE FIELD IT ALIASES, AND THE LIBRARY DROPPED THE PROPOSITION.
//
// THE OBSERVED GAP (live run 59, the member's own receipts - `D:/_tmp/r59/lean59.txt`):
//   · `vibe_v5_lean_run` declares `statement` REQUIRED (fixed in round 58), but the handler read
//     `has(args.target) ? target : statement`. A call that passed ONLY `target` (a proposition CARD id, e.g.
//     "p-odd-sum") was accepted, and every job receipt recorded `statement: "p-odd-sum"` - an object id where the
//     audit is supposed to hold the proposition TEXT. The legacy alias silently shadowed the documented field, and a
//     required field could be satisfied by a name that is not the thing it names.
//   · `vibe_v5_lean_archive` had no `statement` argument at all: it filled the entry's statement from `target` only.
//     The member archived a compiled lemma with the proposition in `note`, and `lean_lib` came back `statement: ""` -
//     the library could not answer "what does this file formalise".
//   · the member also read `hashUnchanged: true` as a cache signal ("hashUnchanged field suggests caching"). The flag
//     means "the file did not change while it compiled"; the dedupe question is answered by `dedupedOf`. A boolean
//     whose meaning has to be guessed is a read-face gap even when the value is right.
//
// WHAT THIS SUITE PROVES:
//   1. `target` alone is REFUSED by name (an object id is not a proposition);
//   2. two names that disagree are REFUSED (the archive's from/file rule, applied to this alias too);
//   3. the recorded statement is ALWAYS the statement, never the alias;
//   4. `lean_archive` records the proposition text, and `lean_lib` reads it back;
//   5. `hashUnchanged` carries its own meaning, and points the dedupe question at `dedupedOf`;
//   6. the declarations say all of it (archive declares `statement`; run's `target` says it is a legacy alias).
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const LEAN = join(REPO, 'vibe-math-vmu', 'kernel', 'lean.js')

const tools = await import(pathToFileURL(TOOLS).href)
const leanMod = await import(pathToFileURL(LEAN).href)

const out = []
let passed = 0
let failed = 0
const test = async (name, fn) => {
  try { await fn(); passed += 1; out.push('  ok   ' + name) } catch (e) { failed += 1; out.push('  FAIL ' + name + '\n       ' + (e && e.message ? e.message : String(e))) }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const includes = (s, sub, msg) => assert(typeof s === 'string' && s.includes(sub), msg + ' (missing `' + sub + '`)')

const specOf = (name) => {
  const spec = tools.V5R_PACK_TOOLS.find((t) => t.name === name)
  assert(spec, name + ' must exist in V5R_PACK_TOOLS')
  return spec
}
const refused = async (fn) => {
  try { const r = await fn(); return { threw: false, value: r } } catch (e) { return { threw: true, code: e && e.code, message: e && e.message, hint: e && e.hint } }
}

const dir = await mkdtemp(join(tmpdir(), 'vmu-lean-alias-'))
const mkSettings = () => {
  const vals = {
    'vmu.math.formalVerify': 'encourage',
    'vmu.math.leanCommand': 'lean',
    'vmu.math.leanArgs': [],
    'vmu.math.leanTimeoutMs': 5000,
    'vmu.math.leanAsync': false,
    'vmu.math.leanInitiative': 'normal',
    'vmu.math.leanSearchPaths': [],
    'vmu.math.leanJobsMaxParallel': 1,
  }
  return { get: (k) => vals[k], vals }
}
const mkKernel = async (rootName) => {
  const root = join(dir, rootName)
  await mkdir(join(root, 'Formal'), { recursive: true })
  const face = leanMod.createLeanFace({ settings: mkSettings(), spawn: async () => ({ exitCode: 0 }), root, clock: () => 11, log: () => {} })
  return { kernel: { lean: face }, face, root }
}

// ── 1/2/3: the alias cannot stand in for the proposition ──────────────────────────────────────────────
await test('`target` alone is refused by name: an object id is not a proposition', async () => {
  const { kernel } = await mkKernel('k1')
  const res = await refused(() => specOf('vibe_v5_lean_run').handler({ file: 'Formal/A.lean', target: 'p-odd-sum' }, { kernel }))
  assert(res.threw, 'a submit whose only "statement" is a card id must be refused, not recorded')
  assert(res.code === 'VMU_LEAN_STATEMENT_REQUIRED', 'the code must say which field is missing, got ' + res.code)
  includes(res.message, 'p-odd-sum', 'the refusal must show the value it was given (the caller can see it is an id)')
  includes(res.message, 'target', 'the refusal must name the parameter it received')
  includes(res.hint, 'statement', 'the hint must name the field to pass instead')
})

await test('two names that disagree are refused (the archive from/file rule, applied to the alias)', async () => {
  const { kernel } = await mkKernel('k2')
  const res = await refused(() => specOf('vibe_v5_lean_run').handler({ file: 'Formal/A.lean', statement: 'True', target: 'p-odd-sum' }, { kernel }))
  assert(res.threw, 'disagreeing names must not be resolved silently')
  assert(res.code === 'VMU_INVALID_ARGUMENT', 'got ' + res.code)
  includes(res.message, 'statement', 'the refusal names both fields')
  includes(res.message, 'target', 'the refusal names both fields')
})

await test('the recorded statement is ALWAYS the statement - never the alias', async () => {
  const { kernel, face } = await mkKernel('k3')
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/A.lean', statement: '∀ n : ℕ, n + n = 2 * n' }, { kernel })
  assert(res.ok === true && res.job && res.job.id, 'submit must return the queued job: ' + JSON.stringify(res))
  const view = face.status(res.job.id).job
  assert(view.statement === '∀ n : ℕ, n + n = 2 * n', 'the audit object is the proposition text, got ' + JSON.stringify(view.statement))
})

await test('the SAME value through both names is accepted (agreeing aliases are not a trap)', async () => {
  const { kernel, face } = await mkKernel('k4')
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/A.lean', statement: 'True', target: 'True' }, { kernel })
  assert(res.ok === true && res.job && res.job.id, 'agreeing names must be accepted: ' + JSON.stringify(res))
  assert(face.status(res.job.id).job.statement === 'True', 'the recorded statement is still the text, once')
})

// ── 4: the archive keeps the proposition, and the library can read it back ──────────────────────────
await test('`lean_archive` records the proposition text and `lean_lib` reads it back', async () => {
  const { kernel, root } = await mkKernel('k5')
  await writeFile(join(root, 'Formal', 'OddSum.lean'), 'theorem oddSum_eq_sq (n : Nat) : oddSum n = n * n := by sorry\n', 'utf8')
  const arch = await specOf('vibe_v5_lean_archive').handler({ kind: 'lemma', name: 'oddSum_eq_sq', file: 'Formal/OddSum.lean', statement: '前 n 个奇数之和为 n²' }, { kernel })
  assert(arch && arch.archived, 'archive must return the registered entry: ' + JSON.stringify(arch))
  assert(arch.archived.statement === '前 n 个奇数之和为 n²', 'the entry must carry the proposition, got ' + JSON.stringify(arch.archived.statement))
  const lib = await specOf('vibe_v5_lean_lib').handler({ refresh: true }, { kernel })
  const entry = (lib.lib.entries || []).find((e) => e.name === 'oddSum_eq_sq')
  assert(entry, 'the library must list the archived entry')
  includes(entry.statement, 'n²', 'the library entry answers "what does this file formalise" (run 59 read back statement:"")')
})

await test('archive refuses two names that disagree, and says which one is the text', async () => {
  const { kernel, root } = await mkKernel('k6')
  await writeFile(join(root, 'Formal', 'B.lean'), 'theorem t : True := trivial\n', 'utf8')
  const res = await refused(() => specOf('vibe_v5_lean_archive').handler({ kind: 'lemma', name: 'b', file: 'Formal/B.lean', statement: 'True', target: 'p-1' }, { kernel }))
  assert(res.threw && res.code === 'VMU_INVALID_ARGUMENT', 'got ' + res.code)
  includes(res.message, 'statement', 'the refusal must say which name is the proposition text')
})

// ── 5: the flag carries its own meaning ─────────────────────────────────────────────────────────────
await test('`hashUnchanged` says what it means and points the dedupe question at `dedupedOf`', async () => {
  const { kernel, face, root } = await mkKernel('k7')
  await writeFile(join(root, 'Formal', 'Ok.lean'), 'theorem t : True := trivial\n', 'utf8')
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/Ok.lean', statement: 'True' }, { kernel })
  const settled = await face.settle(res.job.id)
  assert(settled.passed === true, 'the good path must pass: ' + JSON.stringify(settled.receipt || null))
  const view = face.status(res.job.id).job
  assert(typeof view.hashUnchangedMeans === 'string', 'a boolean whose meaning must be guessed is not readable: ' + JSON.stringify(view))
  includes(view.hashUnchangedMeans, 'NOT a cache flag', 'the sentence must deny the reading the member actually made')
  includes(view.hashUnchangedMeans, 'dedupedOf', 'and it must point at the field that answers that question')
})

// ── 6: the declarations say all of it ──────────────────────────────────────────────────────────────
await test('the declarations carry the same rules the handlers now enforce', () => {
  const run = specOf('vibe_v5_lean_run')
  includes(run.parameters.target.description, 'legacy alias', 'run: target must be declared as the legacy alias it is')
  assert(run.parameters.statement.required === true, 'run: statement stays required')
  const arch = specOf('vibe_v5_lean_archive')
  assert(arch.parameters.statement, 'archive must declare `statement` (run 59: the argument did not exist)')
  includes(arch.parameters.statement.description, 'proposition', 'archive: the parameter says what it holds')
  includes(arch.description, 'statement', 'archive: the description tells the caller to pass it')
})

await rm(dir, { recursive: true, force: true })

out.push('')
out.push('=== VMU RUN 59 LEAN STATEMENT ALIAS: ' + passed + ' passed, ' + failed + ' failed ===')
console.log(out.join('\n'))
process.exitCode = failed === 0 ? 0 : 1
