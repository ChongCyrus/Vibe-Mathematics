// vmu script bridge — the capability scenario for kernel/script-bridge.js (docs/05 §6.2).
//
// What must hold:
//   · the subprocess seam is injected; with none bound a run is refused by name, never attempted;
//   · a run must return a STRUCTURED result: empty output, non-JSON output, or JSON without a boolean
//     `ok` are each refused by name (the bridge will not "parse it later");
//   · a non-zero exit is a RESULT, carrying the exit code and the caller's failure policy - and the
//     `abort` policy is the only one that raises, marked as an abort;
//   · a timeout is a hard, named failure (VMU_JOB_TIMEOUT) that says the budget and the remedy;
//   · dry-run does not execute: it validates, returns the planned command, and calls no seam;
//   · nothing in this module can reach a prompt: it exposes no prompt surface, and `status()` states the
//     promise so it is testable rather than aspirational.
//
// `--self-probe` copies the module, REMOVES the "structured result required" check and requires the
// free-form-output assertion to fail.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'script-bridge.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const m = await import(pathToFileURL(MODULE).href)
const mk = (spawn, opts = {}) => m.createScriptBridge(Object.assign({ spawn, clock: () => '2026-10-09T00:00:00.000Z' }, opts))

// ---- 1. the seam, and request validation -------------------------------------------------------
{
  const noSeam = mk(null)
  await expectThrow(() => noSeam.run({ file: 'a.mjs' }), 'VMU_ENGINE_UNAVAILABLE', 'with no subprocess seam a run is refused by name')
  ok(noSeam.status().hasSpawnSeam === false, 'status() reports the missing seam instead of pretending')
  const b = mk(async () => ({ code: 0, stdout: '{"ok":true}' }))
  await expectThrow(() => b.run({}), 'VMU_INVALID_ARGUMENT', 'a request with neither file nor inline is refused')
  await expectThrow(() => b.run({ file: 'a.mjs', inline: 'x' }), 'VMU_INVALID_ARGUMENT', 'file and inline together are refused')
  await expectThrow(() => b.run({ file: 'a.mjs', args: [1] }), 'VMU_INVALID_ARGUMENT', 'non-string args are refused')
  await expectThrow(() => b.run({ file: 'a.mjs', timeoutMs: -1 }), 'VMU_INVALID_ARGUMENT', 'a negative timeout is refused')
  await expectThrow(() => b.run({ file: 'a.mjs', failure: 'maybe' }), 'VMU_INVALID_ARGUMENT', 'an unknown failure policy is refused')
}

// ---- 2. a structured result is required --------------------------------------------------------
{
  const good = mk(async () => ({ code: 0, stdout: '{"ok":true,"summary":"3 findings","findings":[{"id":"f1"}]}' }))
  const r = await good.run({ file: 'audit.mjs', args: ['--scope', 'records'] })
  ok(r.ran === true && r.ok === true && r.summary === '3 findings' && r.findings.length === 1, 'a structured result comes back parsed', JSON.stringify(r).slice(0, 120))
  ok(good.status().stats.runs === 1, 'the run is counted')

  const freeform = mk(async () => ({ code: 0, stdout: 'all good, nothing to report' }))
  const e1 = await freeform.run({ file: 'x.mjs' }).catch((err) => err)
  ok(e1 && e1.code === 'VMU_INVALID_ARGUMENT' && /did not print JSON/.test(e1.message), 'free-form output is refused by name', e1 && e1.message)
  const empty = mk(async () => ({ code: 0, stdout: '   ' }))
  await expectThrow(() => empty.run({ file: 'x.mjs' }), 'VMU_INVALID_ARGUMENT', 'empty output is refused')
  const noOk = mk(async () => ({ code: 0, stdout: '{"summary":"no ok field"}' }))
  const e2 = await noOk.run({ file: 'x.mjs' }).catch((err) => err)
  ok(e2 && /without a boolean `ok`/.test(e2.message), 'JSON without a boolean ok is refused', e2 && e2.message)
  const arrayTop = mk(async () => ({ code: 0, stdout: '[1,2,3]' }))
  await expectThrow(() => arrayTop.run({ file: 'x.mjs' }), 'VMU_INVALID_ARGUMENT', 'a JSON array is not a structured RESULT')
}

// ---- 3. a non-zero exit is a result; abort is the only raise -----------------------------------
{
  const failing = mk(async () => ({ code: 3, stdout: '', stderr: 'boom' }))
  const r = await failing.run({ file: 'x.mjs', failure: 'open' })
  ok(r.ok === false && r.exit === 3 && r.policy === 'open' && /boom/.test(r.stderr), 'a non-zero exit comes back as a result with its code', JSON.stringify(r).slice(0, 120))
  const closed = await failing.run({ file: 'x.mjs', failure: 'closed' })
  ok(closed.ok === false && closed.policy === 'closed', 'the closed policy is reported, not silently upgraded to an exception')
  const aborting = mk(async () => ({ code: 1, stdout: '', stderr: 'x' }), {})
  const e = await aborting.run({ file: 'x.mjs', failure: 'abort' }).catch((err) => err)
  ok(e && e.aborted === true && e.code === 'VMU_MIDDLEWARE_FAILED', 'the abort policy raises, marked as an abort', e && e.code)
  const throwingSeam = mk(async () => { throw new Error('cannot spawn') })
  await expectThrow(() => throwingSeam.run({ file: 'x.mjs' }), 'VMU_MIDDLEWARE_FAILED', 'a seam that throws is reported by name')
}

// ---- 4. timeout is a hard named failure --------------------------------------------------------
{
  const slow = mk(async () => ({ code: null, timedOut: true, stdout: '', stderr: '' }))
  const e = await slow.run({ file: 'slow.mjs', timeoutMs: 1500 }).catch((err) => err)
  ok(e && e.code === 'VMU_JOB_TIMEOUT' && /1500ms/.test(e.message), 'a timeout names the job and the budget', e && e.message)
  ok(slow.status().stats.timeouts === 1, 'timeouts are counted')
  let seen = null
  const captures = mk(async (req) => { seen = req; return { code: 0, stdout: '{"ok":true}' } })
  await captures.run({ file: 'x.mjs', args: ['a'], env: { A: '1' }, cwd: '/tmp' })
  ok(seen.timeoutMs === 60000 && seen.args.join(',') === 'a' && seen.env.A === '1' && seen.cwd === '/tmp', 'the request reaches the seam with the defaults applied', JSON.stringify(seen))
}

// ---- 5. dry-run really does not run ------------------------------------------------------------
{
  let called = 0
  const b = mk(async () => { called++; return { code: 0, stdout: '{"ok":true}' } })
  const planned = b.plan({ file: 'audit.mjs', args: ['--x'], env: { B: '2' } })
  ok(planned.ok === true && planned.plan.argv.file === 'audit.mjs' && planned.plan.env.join(',') === 'B' && planned.runs === false,
    'plan() reports the command without running', JSON.stringify(planned.plan))
  const dry = mk(async () => { called++; return { code: 0, stdout: '{"ok":true}' } }, { dryRun: true })
  const r = await dry.run({ file: 'audit.mjs' })
  ok(r.dryRun === true && r.ran === false && called === 0, 'dry-run does not call the seam at all', 'calls=' + called)
  ok(dry.status().stats.dryRuns === 1 && dry.status().stats.runs === 0, 'dry-runs are counted separately from real runs',
    JSON.stringify(dry.status().stats))
  const bad = b.plan({})
  ok(bad.ok === false && bad.problems.length > 0, 'plan() reports problems instead of pretending to run')
}

// ---- 6. no prompt surface ----------------------------------------------------------------------
{
  const b = mk(async () => ({ code: 0, stdout: '{"ok":true}' }))
  const keys = Object.keys(b)
  ok(!keys.some((k) => /prompt|inject|message/i.test(k)), 'the bridge exposes no prompt-ish surface', keys.join(','))
  ok(b.status().promptSurface === false && /returned to the caller only/.test(b.status().note),
    'and it states the promise so it can be tested rather than assumed')
  const src = await readFile(MODULE, 'utf8')
  // Anchored on CODE SHAPES, never on bare words: prose in comments and in `note` must not be able to
  // trip a source check (docs/11 §6 discipline #12 - learned the hard way three times).
  ok(!/(^|[\s{,])prompt\s*[:=]|appendPrompt\s*\(|\.prompt\b/.test(src),
    'the source has no prompt-writing path either (checked as a code shape, not as a word)')
}

// ---- 7. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.ok !== 'boolean') {"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the structured-result check is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-m3-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    await writeFile(join(dir, 'kernel', 'script-bridge.js'), src.replace(guard, '    if (false) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'script-bridge.js')).href + '?probe=1')
    const mb = mm.createScriptBridge({ spawn: async () => ({ code: 0, stdout: '{"summary":"no ok"}' }) })
    let refused = false
    try { await mb.run({ file: 'x.mjs' }) } catch (e) { refused = e.code === 'VMU_INVALID_ARGUMENT' }
    ok(refused === true, 'self-probe: check removed => the structured-result assertion fails (as required)', 'refused=' + refused)
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU SCRIPT BRIDGE SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU SCRIPT BRIDGE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
