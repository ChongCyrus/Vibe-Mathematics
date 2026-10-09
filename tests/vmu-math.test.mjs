// vmu math surface — the capability scenario for kernel/math.js (docs/09).
//
// The scenario drives the repository's own FAKE HOST SEAM (tests/helpers/math-computation-fake-seam.mjs),
// so both the engine-present and the engine-absent paths are reproducible on any machine - the documented
// seam discipline (docs/11 §4.1), not a convenience. NB: `makeFakeHost()` returns the seam state with the
// host attached (`seam.host`), which is why every call below passes `seam.host`.
//
// What must hold:
//   · the shared module is registered under its own tool name, with a real parameter schema;
//   · availability is reported truthfully: with engines present the probe lists them, with NONE present
//     the probe says so and an unavailable engine becomes a NAMED degradation (VMU_ENGINE_UNAVAILABLE) -
//     never a silent success and never a claim about the mathematics;
//   · NO outcome can ever be a refutation: `isRefutation` is false for every classification, because a
//     failed computation is a DEFECT of the formalisation and not a disproof (docs/09 §6);
//   · the surface carries NO policy: whether formalisation is required is not its business
//     (`REQUIRE_FORMALIZATION === false`, and the source contains no "must formalise" rule).
//
// `--self-probe` copies the module, REMOVES the unavailable->named-degradation mapping and requires the
// absence assertion to fail (the technique tests/run-tests.mutants.mjs uses on the runner).

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { makeFakeHost } from './helpers/math-computation-fake-seam.mjs'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'math.js')
const SELF_PROBE = process.argv.includes('--self-probe')
const fakeHost = (opts = {}) => makeFakeHost(opts).host

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const m = await import(pathToFileURL(MODULE).href)

// ---- 1. registration over an injected host -----------------------------------------------------
{
  const seam = makeFakeHost({ installed: ['python3', 'Rscript'] })
  const surface = m.createMathSurface({ host: seam.host })
  ok(surface.toolName === 'math_computation', 'the shared tool name is used verbatim', surface.toolName)
  ok(surface.registered && typeof surface.registered.name === 'string' && surface.registered.parameters,
    'the shared module registered one tool with a parameter schema')
  ok(seam.registrations.length >= 1, 'the injected host received the registration', seam.registrations.length)
  let threw = null
  try { m.createMathSurface({ host: { register: () => {} } }) } catch (e) { threw = e }
  ok(threw && threw.code === 'VMU_ENGINE_UNAVAILABLE', 'an incomplete host is refused by name', threw && threw.code)
}

// ---- 2. availability is reported truthfully ----------------------------------------------------
{
  const present = m.createMathSurface({ host: fakeHost({ installed: ['python3', 'Rscript'] }) })
  const p1 = await present.probe()
  ok(p1.available === true && p1.engines.length >= 1, 'engines that exist are listed', JSON.stringify(p1.engines))
  const absent = m.createMathSurface({ host: fakeHost({ installed: [], cliCommands: [] }) })
  const p2 = await absent.probe()
  ok(p2.available === false && p2.engines.length === 0, 'with nothing installed the probe says so')
  const line = absent.availabilityLine({ engines: [] }, 'zh', 'typed+shell')
  ok(/可用引擎 (无|none)/.test(line), 'the availability line states the absence instead of hiding it', line.slice(0, 40))
}

// ---- 3. a run with engines present produces a receipt, never a refutation ----------------------
{
  const surface = m.createMathSurface({ host: fakeHost({ installed: ['python3'] }) })
  const out = await surface.run({ op: 'run', engine: 'python', mode: 'expr', expr: '1+1' })
  ok(out.isRefutation === false, 'a successful computation is not a refutation (it is not a truth claim at all)')
  ok(out.ok === true || typeof out.code === 'string', 'the run returns either an ok receipt or a NAMED failure', String(out.ok))
}

// ---- 4. every failure class is a DEFECT, never a disproof ---------------------------------------
{
  const cases = [
    { code: 'MATH_NONZERO_EXIT', expect: 'MATH_NONZERO_EXIT', kind: 'defect' },
    { code: 'MATH_ENGINE_BAD_ARGV', expect: 'MATH_ENGINE_BAD_ARGV', kind: 'defect' },
    { code: 'MATH_TIMEOUT', expect: 'MATH_TIMEOUT', kind: 'defect' },
    { code: 'MATH_ENGINE_NOT_FOUND', expect: 'VMU_ENGINE_UNAVAILABLE', kind: 'unavailable' },
    { code: 'MATH_NO_SUBPROCESS', expect: 'VMU_ENGINE_UNAVAILABLE', kind: 'unavailable' },
  ]
  for (const c of cases) {
    const got = m.classifyOutcome({ ok: false, code: c.code, message: 'x' })
    ok(got.code === c.expect && got.kind === c.kind && got.isRefutation === false,
      'failure ' + c.code + ' maps to ' + c.expect + '/' + c.kind + ' and never refutes', JSON.stringify(got))
  }
  ok(m.classifyOutcome(null).code === 'VMU_ENGINE_UNAVAILABLE', 'a missing outcome is a named degradation')
  ok(m.classifyOutcome({ ok: true }).isRefutation === false, 'even a successful classification is not a refutation')
}

// ---- 5. the surface carries no policy ----------------------------------------------------------
{
  const surface = m.createMathSurface({ host: fakeHost({ installed: ['python3'] }) })
  const st = surface.status()
  ok(st.requireFormalization === false && m.REQUIRE_FORMALIZATION === false,
    'whether formalisation is REQUIRED is not this module\'s decision (it stays off by default)')
  ok(st.neverRefutes === true && st.onUnavailable === 'degrade',
    'the surface declares its two safe defaults (never refute; degrade by name)')
  const src = await readFile(MODULE, 'utf8')
  // Precise: the check is about a RULE, not about words in a comment.
  ok(!/REQUIRE_FORMALIZATION\s*=\s*true|requireFormalization:\s*true|formalizationRequired:\s*true/.test(src),
    'the source contains no rule that forces formalisation (the zero-policy check)')
  ok(!/proved false|isRefutation:\s*true/.test(src), 'the source never marks anything as a refutation')
}

// ---- 6. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "    code: unavailable ? 'VMU_ENGINE_UNAVAILABLE' : code,"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the unavailable mapping is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-math-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    // Copy the shared modules beside the mutant so the relative imports still resolve (the shared module
    // imports ./math-engines.js as well).
    await writeFile(join(dir, 'math-computation.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'math-computation.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'math-engines.js'), await readFile(resolve(REPO, 'vibe-math-vmu', 'math-engines.js'), 'utf8'), 'utf8')
    await writeFile(join(dir, 'kernel', 'math.js'), src.replace(guard, '    code: code,'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'math.js')).href + '?probe=1')
    const got = mm.classifyOutcome({ ok: false, code: 'MATH_ENGINE_NOT_FOUND' })
    ok(got.code === 'VMU_ENGINE_UNAVAILABLE', 'self-probe: guard removed => the named-degradation assertion fails (as required)', got.code)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU MATH SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU MATH: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
