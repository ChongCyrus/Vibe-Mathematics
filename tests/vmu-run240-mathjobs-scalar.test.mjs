// tests/vmu-run240-mathjobs-scalar.test.mjs — RUN 240: A FACE THAT CALLS A SERVICE ONE FOR ONE MUST KNOW WHICH
// NOUN EACH METHOD TAKES.
//
// THE MEASURED DEFECT (found by scripts/sim/audit/all.mjs: `vibe_vmu_mathjobs { action: "mirrorRel" }` sat in the
// `never` list, and driving it by hand produced a receipt path nothing can name):
//   `kernel/mathjobs.js` declares `mirrorRel(jobId)` — ONE SCALAR — while `tools/mathjobs.js` handed EVERY action the
//   whole `{ action, ...rest }` options object. `String(options)` then landed in the receipt:
//   `Math/Jobs/[object Object].json`. A caller asking "where is this job's mirror file" was told about a path that
//   exists nowhere, and could not tell the answer was wrong.
//
// WHAT THIS SUITE DOES: it drives the REAL face with a recording stub service (this assembly has no Python job
// runner, so the service is stubbed on purpose — see the note in §1) and requires that
//   · `mirrorRel` hands the service the job id STRING, not the options object;
//   · every other action still receives the full options object (the fix is one named scalar, not "pass scalars");
//   · no receipt anywhere renders `[object Object]`;
//   · the source keeps the table that says which method takes which noun.
//
// Run: node tests/vmu-run240-mathjobs-scalar.test.mjs   (last line: === VMU RUN 240 MATHJOBS SCALAR: N passed, M failed ===)

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const FACE = join(REPO, 'vibe-math-vmu', 'tools', 'mathjobs.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}

try {
  // ── 0. SOURCE PIN: the table that names the scalar methods is a TABLE, not a special case in the call site ────
  {
    const src = await readFile(FACE, 'utf8')
    ok(/const SCALAR_ARG = \{ mirrorRel: 'jobId' \}/.test(src),
      '§0a the face declares which methods take a SCALAR, by name (a hand-written special case would drift)')
    ok(/const result = await svc\[action\]\(scalar === undefined \? rest : rest\[scalar\]\)/.test(src),
      '§0b and dispatches every action through that one decision')
    ok(/A face that calls a service one-for-one must also know WHICH noun each method takes/.test(src),
      '§0c the call site records why the table exists (the next reader inherits the reason, not just the code)')
  }

  // ── 1. DRIVE THE REAL FACE WITH A RECORDING SERVICE ─────────────────────────────────────────────────────────
  const { makeMathjobsSpec } = await import(pathToFileURL(FACE).href)
  const seen = []
  const svc = new Proxy({}, {
    get: (_t, name) => (typeof name === 'string' ? async (...args) => {
      seen.push({ method: name, args })
      // the shapes the real service returns: a path for mirrorRel, an object for a job verb
      if (name === 'mirrorRel') return 'Math/Jobs/' + String(args[0]) + '.json'
      return { ok: true, method: name, got: args[0] }
    } : undefined),
    has: () => true,
  })
  const kernel = { mathjobs: svc }
  const param = (type, desc, extra = {}) => Object.assign({ type, description: desc }, extra)
  const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint === undefined ? null : hint })
  const TOOL_NAMES = { mathjobs: 'vibe_vmu_mathjobs' }
  const spec = makeMathjobsSpec({ param, refused, TOOL_NAMES, kernel })
  ok(spec && spec.name === 'vibe_vmu_mathjobs', '§1a the face builds under its registered name', spec && spec.name)

  const rel = await spec.run({ action: 'mirrorRel', jobId: 'job-42' })
  const relCall = seen[seen.length - 1]
  ok(relCall && relCall.method === 'mirrorRel' && relCall.args.length === 1 && relCall.args[0] === 'job-42',
    '§1b ★★ `mirrorRel` hands the service the job id STRING (it used to hand it the whole options object)',
    relCall && { args: relCall.args })
  ok(!/\[object Object\]/.test(JSON.stringify(rel)),
    '§1c ★★ and the receipt never renders "[object Object]" (that string used to BE the receipt path)',
    JSON.stringify(rel).slice(0, 160))
  ok(/job-42/.test(JSON.stringify(rel)) && !/\[object Object\]/.test(String(rel && rel.mirrorRel)),
    '§1d the path the caller is told about names the job it asked about',
    { receipt: JSON.stringify(rel).slice(0, 160) })

  const st = await spec.run({ action: 'status', jobId: 'job-42' })
  const stCall = seen[seen.length - 1]
  ok(stCall && stCall.method === 'status' && stCall.args.length === 1 && stCall.args[0] && typeof stCall.args[0] === 'object'
    && stCall.args[0].jobId === 'job-42',
    '§1e every OTHER action still receives the options object (the fix is one named scalar, not a global change)',
    stCall && { args: stCall.args })
  ok(st && st.ok === true && st.action === 'status', '§1f and its receipt keeps the ok/action envelope', JSON.stringify(st).slice(0, 120))

  // ── 2. THE ENGINE-MISSING PATH IS STILL A NAMED REFUSAL ─────────────────────────────────────────────────────
  const bare = makeMathjobsSpec({ param, refused, TOOL_NAMES, kernel: {} })
  const gone = await bare.run({ action: 'status', jobId: 'job-42' })
  ok(gone && gone.ok === false && gone.code === 'VMU_ENGINE_UNAVAILABLE' && typeof gone.message === 'string',
    '§2a an assembly with no math-jobs service refuses BY NAME with a message', gone && { code: gone.code, message: gone.message })
} catch (e) {
  failed += 1
  failures.push('suite threw')
  console.log('  FAIL suite threw: ' + String((e && e.stack) || e).split(String.fromCharCode(10)).slice(0, 4).join(' | '))
}

console.log(String.fromCharCode(10) + '=== VMU RUN 240 MATHJOBS SCALAR: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failures:'); for (const f of failures) console.log('  - ' + f) }
process.exitCode = failed ? 1 : 0
