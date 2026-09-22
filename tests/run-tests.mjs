#!/usr/bin/env node
/**
 * PARALLEL TEST RUNNER — run every shipped suite (or a filtered subset) concurrently and report
 * per-suite timings, so the strategy for the next run is chosen from DATA instead of guesswork.
 *
 * Why this exists: the suites are wildly uneven (one suite is ~160 s, most are under 2 s), so a
 * sequential sweep spends almost all of its wall time waiting for the slowest one. Running them
 * with a worker pool makes the sweep bounded by the slowest SUITE rather than by their SUM.
 * On this machine (4 cores) the sweep went from ~5.5 min to ~2 min; see ../docs/test-timing.md.
 *
 * Every suite already isolates itself (each creates its own mkdtemp workspace), so parallelism is
 * safe. Suites that WRITE a corpus take a per-run corpus dir from an env var; this runner points
 * them at a scratch dir when it runs a suite more than once, which it never does — but the probe
 * runner (audit-formal-sensitivity.mjs) does, and it passes its own dirs.
 *
 * Usage:
 *   node tests/run-tests.mjs                      # every *.test.mjs, concurrency = min(4, cpus)
 *   node tests/run-tests.mjs --concurrency=6
 *   node tests/run-tests.mjs --only formal        # substring match on the file name (repeatable, OR)
 *   node tests/run-tests.mjs --exclude e2e-v4     # substring to skip (repeatable)
 *   node tests/run-tests.mjs --json               # machine-readable summary on stdout
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
// Suites live beside this runner, but they resolve the presets and the corpora from the
// repository root, so they must keep running with that as their working directory.
const REPO = fileURLToPath(new URL('../', import.meta.url))
const argv = process.argv.slice(2)
// Accept BOTH `--only=x` and `--only x` (the help text used the space form, which a value-taking
// flag() did not understand — the filter silently did nothing and every suite still ran).
const flag = (name) => {
  const out = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--' + name && i + 1 < argv.length && !argv[i + 1].startsWith('--')) out.push(argv[++i])
    else if (a.startsWith('--' + name + '=')) out.push(a.split('=').slice(1).join('='))
  }
  return out
}
const has = (name) => argv.includes('--' + name)
const only = flag('only')
const exclude = flag('exclude')
const asJson = has('json')
const concurrency = Math.max(1, Number(flag('concurrency')[0] || Math.min(4, cpus().length)))

let suites = readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort()
if (only.length) suites = suites.filter((f) => only.some((o) => f.includes(o)))
if (exclude.length) suites = suites.filter((f) => !exclude.some((o) => f.includes(o)))
if (!suites.length) { console.error('no suites matched'); process.exit(2) }

function runSuite(file) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const child = spawn(process.execPath, [join(HERE, file)], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('error', (e) => resolve({ file, code: -1, ms: Date.now() - t0, out, err: err + '\n' + String(e) }))
    child.on('close', (code) => resolve({ file, code, ms: Date.now() - t0, out, err }))
  })
}

const results = []
let cursor = 0
const started = Date.now()
async function worker(id) {
  for (;;) {
    const i = cursor++
    if (i >= suites.length) return
    const r = await runSuite(suites[i])
    const tail = String(r.out).trim().split('\n').filter(Boolean).slice(-1)[0] || ''
    results[i] = r
    if (!asJson) {
      const mark = r.code === 0 ? 'PASS' : 'FAIL'
      console.log(
        mark + '  ' + r.file.padEnd(38) +
        ' exit=' + String(r.code).padStart(3) +
        '  ' + (r.ms / 1000).toFixed(1).padStart(6) + 's' +
        (tail ? '  ' + tail.slice(0, 78) : '')
      )
      if (r.code !== 0) {
        const lines = (r.out + '\n' + r.err).split('\n').filter(Boolean)
        for (const l of lines.slice(-15)) console.log('      ' + l)
      }
    } else if (r.code !== 0) {
      // In --json mode keep stdout machine-readable: the failure detail travels in the JSON.
      const lines = (r.out + '\n' + r.err).split('\n').filter(Boolean)
      r.tailDetail = lines.slice(-15).join('\n')
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, suites.length) }, (_, i) => worker(i)))

const wall = (Date.now() - started) / 1000
const sum = results.reduce((a, r) => a + r.ms, 0) / 1000
const bad = results.filter((r) => r.code !== 0)
const slowest = results.slice().sort((a, b) => b.ms - a.ms).slice(0, 5)

if (asJson) {
  console.log(JSON.stringify({
    concurrency, wallSeconds: Number(wall.toFixed(1)), sumSeconds: Number(sum.toFixed(1)),
    pass: results.length - bad.length, fail: bad.length,
    suites: results.map((r) => ({
      file: r.file, exit: r.code, seconds: Number((r.ms / 1000).toFixed(1)),
      ...(r.tailDetail ? { detail: r.tailDetail } : {}),
    })),
  }, null, 2))
} else {
  console.log('')
  console.log('concurrency ' + concurrency + '  ·  wall ' + wall.toFixed(1) + 's  ·  sum of suite times ' + sum.toFixed(1) + 's'
    + '  ·  speed-up x' + (sum / Math.max(wall, 0.001)).toFixed(2))
  console.log('slowest: ' + slowest.map((r) => r.file.replace('.test.mjs', '') + ' ' + (r.ms / 1000).toFixed(1) + 's').join('  ·  '))
  console.log('TOTAL ' + results.length + '  PASS ' + (results.length - bad.length) + '  FAIL ' + bad.length)
  for (const b of bad) console.log('  FAILED: ' + b.file + ' (exit ' + b.code + ')')
}
process.exit(bad.length === 0 ? 0 : 1)
