// vmu host spawn seam — the shape contract with the host's subprocess service (docs/11 §4.1, task-33/34).
//
// WHY THIS TEST EXISTS: the live M3 failure was a host-side TypeError
//   `Cannot read properties of undefined (reading 'includes')`
// thrown by the host's own env validation (`validateNoNullByte`) because OUR seam forwarded an environment
// variable whose value was `undefined`. The host stack only became visible after the script bridge stopped
// dropping it, so this pins the shape at the seam: a fake `ctx.get('subprocess')` records exactly what the host
// would have received. No host, no Lean, no subprocess: the seam is exercised as an injected seam (docs/05 §6.2).

import { strict as assert } from 'node:assert'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MODULE = join(HERE, '..', 'vibe-math-vmu', 'host-spawn.js')
const m = await import(pathToFileURL(MODULE).href)

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + detail)) }
}

/** A fake host subprocess service that RECORDS every spawn request and returns a well-formed handle. */
const fakeSub = (record) => ({
  async resolveExecutable(cmd) { return 'C:\\fake\\' + cmd + '.EXE' },
  spawn(opts) {
    record.push(opts)
    return {
      done: Promise.resolve({ exitCode: 0, signal: null }),
      collected: {
        stdout: { readFrom: () => ({ text: 'STDOUT' }) },
        stderr: { readFrom: () => ({ text: 'STDERR' }) },
      },
    }
  },
})

const makeSeam = (record) => m.createHostSpawn({
  ctx: { get: (name) => (name === 'subprocess' ? fakeSub(record) : null) },
  defaultCwd: 'C:\\ws',
  clock: () => 0,
})

// ---- 1. an `undefined` env value must NEVER reach the host (the M3 crash) ------------------------------
{
  const seen = []
  const seam = makeSeam(seen)
  const out = await seam({ file: 'node', args: ['-e', 'x'], env: { GOOD: 'a', BAD: undefined, ALSO_BAD: null, OBJ: { x: 1 } } })
  ok(out.code === 0 && out.stdout === 'STDOUT', 'the spawn succeeds through an injected seam', JSON.stringify(out))
  const sent = seen[0]
  ok(sent && sent.env && Object.keys(sent.env).length === 1 && sent.env.GOOD === 'a',
    'only the STRING env value is forwarded (undefined/null/object are dropped, not shipped)', JSON.stringify(sent && sent.env))
  ok(!JSON.stringify(sent).includes('BAD'), 'and no dropped key appears in the shape the host receives', JSON.stringify(sent))
}

// ---- 2. primitives are coerced, and argv[0] is the RESOLVED executable ---------------------------------
{
  const seen = []
  const seam = makeSeam(seen)
  await seam({ file: 'node', args: ['-e', 'x'], env: { N: 7, B: true } })
  const sent = seen[0]
  ok(sent.env.N === '7' && sent.env.B === 'true',
    'numbers and booleans become strings (an env value must be a string)', JSON.stringify(sent.env))
  ok(sent.argv[0] === 'C:\\fake\\node.EXE',
    'argv[0] is the RESOLVED absolute executable, never a bare name (a bare name made the host throw)', sent.argv[0])
}

// ---- 3. no env at all stays no env (the host must not receive an empty object) -------------------------
{
  const seen = []
  const seam = makeSeam(seen)
  await seam({ file: 'node', args: [] })
  ok(seen[0] && seen[0].env === undefined, 'an empty env is omitted entirely', JSON.stringify(seen[0] && seen[0].env))
  ok(seen[0].cwd === 'C:\\ws', 'and the default cwd is still applied', String(seen[0].cwd))
}

// ---- 4. the seam refuses when the host exposes no subprocess service (named, never invented) -----------
{
  const seam = m.createHostSpawn({ ctx: { get: () => null }, defaultCwd: null })
  let refused = null
  try { await seam({ file: 'node' }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_ENGINE_UNAVAILABLE',
    'with no subprocess service the seam refuses by name instead of inventing one', refused && refused.code)
}

console.log('=== VMU SPAWN: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
