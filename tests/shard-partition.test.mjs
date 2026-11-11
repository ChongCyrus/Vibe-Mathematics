#!/usr/bin/env node
/**
 * THE SHARD PARTITION (TB-2737 / task-217): `--shard i/N` must PARTITION the full sweep, not filter it.
 *
 * Two things are being defended here, and neither is "the code looks right":
 *   1. SET EQUALITY. For N = 1,2,3,5,8 the shards are pairwise disjoint, every job appears in exactly one
 *      of them, and their union is the UNSHARDED job list. That equality is the only property that makes
 *      "run the shards in parallel" a safe replacement for "run the sweep", so it is asserted, not promised.
 *   2. HONESTY. An empty shard must be a NAMED refusal (an empty slice would report green while proving
 *      nothing), a shard's own logs must carry `shard=i/N selected=K of M` (so a slice cannot be passed off
 *      as a full sweep), and the machine/report modes must not be silently sliced.
 *
 * The job list is never copied into this file: it comes from the runner's own `--shard-plan` / `--counts`
 * answers, because a copied list rots the moment a suite is added (we have been bitten by stale copies).
 *
 * Nothing here pins a wall-clock number; the only timing is the suite's own runtime under the gate.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const RUNNER = join(ROOT, 'tests', 'run-tests.mjs')

const ok = (cond, msg, extra) => {
  assert.ok(cond, msg + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)))
}

// First differing line pair, for a failure message that points AT the drift instead of dumping both blobs.
const firstDiff = (a, b) => {
  const la = a.split('\n')
  const lb = b.split('\n')
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    if (la[i] !== lb[i]) return 'line ' + (i + 1) + ': ' + JSON.stringify(la[i] === undefined ? null : la[i]) + ' vs ' + JSON.stringify(lb[i] === undefined ? null : lb[i])
  }
  return ''
}
// The sweep's own switches must not leak in from the caller's shell: a GATE_SCOPE=quick in the environment
// would make every plan below a curated one and quietly weaken the equality (the runner refuses shards under
// a curated scope, so the plans would fail loudly - but a test that only passes in a clean shell is a trap).
const BASE_ENV = (() => {
  const env = { ...process.env }
  for (const k of ['GATE_SHARD', 'GATE_INCREMENTAL', 'GATE_SCOPE', 'GATE_RELEASE', 'GATE_LEGACY']) delete env[k]
  return env
})()
const envWith = (extra = {}) => Object.assign({}, BASE_ENV, extra)

const runRaw = (args, extraEnv = {}) => {
  const r = spawnSync(process.execPath, [RUNNER, '--no-temp-hygiene', ...args], {
    cwd: ROOT,
    env: envWith(extraEnv),
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') }
}

const plan = (index, count, extraArgs = [], extraEnv = {}) => {
  const r = runRaw(['--shard', index + '/' + count, '--shard-plan', ...extraArgs], extraEnv)
  ok(r.status === 0, 'the runner answered a shard plan for ' + index + '/' + count, { status: r.status, stderr: r.stderr.slice(0, 400) })
  let parsed = null
  try {
    parsed = JSON.parse(r.stdout)
  } catch (e) {
    ok(false, 'the shard plan is JSON (a plan a judge cannot parse is not a plan)', { head: r.stdout.slice(0, 300) })
  }
  ok(parsed !== null, 'the shard plan parsed', { head: r.stdout.slice(0, 300) })
  ok(parsed.shard && Array.isArray(parsed.jobs), 'the plan carries { shard, jobs }', Object.keys(parsed))
  ok(parsed.shard.index === index && parsed.shard.count === count, 'the plan names its own slice', parsed.shard)
  ok(parsed.jobs.length === parsed.shard.selected, 'selected agrees with the job list it printed', {
    selected: parsed.shard.selected,
    jobs: parsed.jobs.length,
  })
  ok(typeof parsed.baseOrder === 'string' && parsed.baseOrder.includes('before lptOrder'),
    'the plan says WHICH order it cut in (before lptOrder - see the runner comment)', parsed.baseOrder)
  ok(typeof parsed.baseOrder === 'string' && parsed.baseOrder.includes('after scope + --only/--exclude'),
    'the plan says WHERE the cut sits (after the filters - slicing before them would report the unfiltered total)', parsed.baseOrder)
  return parsed
}

const countsOf = () => {
  const r = runRaw(['--counts'])
  ok(r.status === 0, '--counts answered', { status: r.status })
  return JSON.parse(r.stdout)
}

// ── 0. THE BASELINE: the unsharded job list, from the runner itself ────────────────────────────────────────
const full = plan(1, 1)
const counts = countsOf()

test('§0 the unsharded job list is the runner own list, and it is not empty', () => {
  ok(full.jobs.length > 100, 'the full sweep is a real list (a handful of jobs would make every equality below vacuous)', { jobs: full.jobs.length })
  ok(new Set(full.jobs).size === full.jobs.length, 'no duplicate labels in the unsharded list', { jobs: full.jobs.length, unique: new Set(full.jobs).size })
  ok(counts.total === full.jobs.length, '--counts and the 1/1 plan agree on the TOTAL (one source, two surfaces)', {
    countsTotal: counts.total,
    planTotal: full.jobs.length,
  })
})

// ── 1. SET EQUALITY (the load-bearing group) ───────────────────────────────────────────────────────────────
const NS = [1, 2, 3, 5, 8]
const plans = new Map()
for (const n of NS) {
  plans.set(n, Array.from({ length: n }, (_, k) => plan(k + 1, n)))
}

test('§1 for N = 1,2,3,5,8: disjoint, exactly once, union == unsharded list', () => {
  for (const n of NS) {
    const parts = plans.get(n)
    const seen = new Set()
    let sum = 0
    // Collected, not asserted inside the loop: an `ok` inside `for (const job of p.jobs)` is vacuous for an empty shard,
    // and an empty shard is exactly the failure this group exists to catch (RULE E shape A).
    const shared = []
    for (const p of parts) {
      sum += p.jobs.length
      for (const job of p.jobs) {
        if (seen.has(job)) shared.push({ shard: p.shard.index, job })
        seen.add(job)
      }
    }
    ok(shared.length === 0, 'N=' + n + ': no shard shares a job with an earlier shard', shared)
    ok(sum === seen.size, 'N=' + n + ': the shard sizes SUM to the number of distinct jobs (no double count)', { sum, distinct: seen.size })
    ok(seen.size === full.jobs.length, 'N=' + n + ': the union has the unsharded size', { union: seen.size, full: full.jobs.length })
    const missing = full.jobs.filter((job) => !seen.has(job))
    ok(full.jobs.length > 0 && missing.length === 0, 'N=' + n + ': every unsharded job appears in some shard', missing)
    const emptyish = parts.filter((p) => p.jobs.length === 0)
    ok(emptyish.length === 0, 'N=' + n + ': no shard is empty (an empty shard would exit 2 in a real run)', emptyish.map((p) => p.shard))
  }
})

// ── 1b. THE SAME EQUALITY UNDER `--only` (the filters must shrink BOTH sides together) ───────────────────
test('§1b with --only: the shards partition the FILTERED list, and they report the filtered total', () => {
  const FILTER = ['--only', 'audit-']
  const filtered = plan(1, 1, FILTER)
  ok(filtered.jobs.length > 2 && filtered.jobs.length < full.jobs.length, 'the filter really shrinks the sweep (a vacuous filter would make this group meaningless)', {
    filtered: filtered.jobs.length,
    full: full.jobs.length,
  })
  const parts = [1, 2, 3].map((i) => plan(i, 3, FILTER))
  const seen = new Set()
  let sum = 0
  const shared = []
  for (const p of parts) {
    ok(p.shard.total === filtered.jobs.length, 'shard ' + p.shard.index + '/3 reports the FILTERED total (slicing before the filter would print the unfiltered one)', {
      reported: p.shard.total,
      filtered: filtered.jobs.length,
    })
    sum += p.jobs.length
    for (const job of p.jobs) {
      if (seen.has(job)) shared.push({ shard: p.shard.index, job })
      seen.add(job)
    }
  }
  ok(sum === seen.size && seen.size === filtered.jobs.length, 'the filtered shards sum to the filtered list', {
    sum,
    distinct: seen.size,
    filtered: filtered.jobs.length,
  })
  ok(shared.length === 0, 'the filtered shards are disjoint', shared)
  const missing = filtered.jobs.filter((job) => !seen.has(job))
  ok(filtered.jobs.length > 0 && missing.length === 0, 'every filtered job is in some shard', missing)
  const smuggled = [...seen].filter((job) => !filtered.jobs.includes(job))
  ok(seen.size > 0 && smuggled.length === 0, 'no shard smuggles in a job the filter excluded', smuggled)
})


// ── 2. THE BASE-ORDER FORMULA (stability across machines) ─────────────────────────────────────────────────
test('§2 the cut is k %% N in the label-ASC base order, not in the measured LPT order', () => {
  for (const p of plans.get(8)) {
    const expected = full.jobs.filter((_, k) => k % 8 === p.shard.index - 1)
    assert.deepEqual(p.jobs, expected, 'shard ' + p.shard.index + '/8 must be positions k%%8==' + (p.shard.index - 1)
      + ' of the label-ASC list (cut after LPT would move jobs whenever a duration weight changes)')
  }
  // and the plan order really is label ASC: a sorted copy must equal it (this is what makes the formula stable)
  const sorted = full.jobs.slice().sort()
  assert.deepEqual(sorted, full.jobs, 'the base order the plan names is label ASC')
})

// ── 3. DETERMINISM: the same request answers the same partition ───────────────────────────────────────────
test('§3 repeated plans are byte-identical (determinism is what lets two CI runners trust each other)', () => {
  const a = plan(3, 8)
  const b = plan(3, 8)
  assert.deepEqual(a.jobs, b.jobs, 'plan(3/8) twice must return the same job list, in the same order')
  assert.deepEqual(a.shard, b.shard, 'plan(3/8) twice must return the same shard counts')
})

// ── 4. THE EMPTY SHARD IS A NAMED REFUSAL ────────────────────────────────────────────────────────────────
test('§4 an empty shard exits 2 with SHARD-EMPTY, not the generic no-suites-matched', () => {
  const r = runRaw(['--shard', '999/1000', '--shard-plan'])
  ok(r.status === 2, 'an empty shard is a usage error (exit 2)', { status: r.status })
  ok(/SHARD-EMPTY/.test(r.stderr), 'the refusal is NAMED SHARD-EMPTY', { stderr: r.stderr.slice(0, 300) })
  ok(/selected 0 of \d+/.test(r.stderr), 'the refusal says how many jobs existed (so the fix is visible)', { stderr: r.stderr.slice(0, 300) })
  ok(/GREEN/.test(r.stderr), 'the refusal says WHY it must not be green (an empty shard proves nothing)', { stderr: r.stderr.slice(0, 300) })
  ok(!/^no suites matched/m.test(r.stderr), 'it must NOT reuse the "no suites matched" line - that one means the FILTERS matched nothing', { stderr: r.stderr.slice(0, 300) })
  ok(!/=> 0 jobs/.test(r.stderr), 'it must not emit the generic filter-refusal sentence either (its own fix is "N <= job count")', { stderr: r.stderr.slice(0, 300) })
  // malformed / out-of-range requests are named too, and never fall through to a full sweep
  for (const bad of ['0/8', '9/8', 'foo', '3', '3/0']) {
    const q = runRaw(['--shard', bad, '--shard-plan'])
    ok(q.status === 2, 'SHARD-INVALID for ' + JSON.stringify(bad) + ' (exit 2)', { status: q.status })
    ok(/SHARD-INVALID/.test(q.stderr), 'SHARD-INVALID is named for ' + JSON.stringify(bad), { stderr: q.stderr.slice(0, 200) })
  }
  const noShard = runRaw(['--shard-plan'])
  ok(noShard.status === 2 && /SHARD-INVALID/.test(noShard.stderr), '--shard-plan without --shard is a named refusal (it cannot guess a slice)', { status: noShard.status })
})

// ── 5. COMBINATIONS THAT WOULD MAKE THE EQUALITY FALSE ARE REFUSED BY NAME ───────────────────────────────
test('§5 incremental / curated scope refuse to be combined with shards, by name', () => {
  const inc = runRaw(['--shard', '1/8', '--shard-plan'], { GATE_INCREMENTAL: '1' })
  ok(inc.status === 2, 'GATE_INCREMENTAL=1 + --shard exits 2', { status: inc.status })
  ok(/SHARD-INCREMENTAL-UNSUPPORTED/.test(inc.stderr), 'the incremental conflict is named', { stderr: inc.stderr.slice(0, 300) })
  ok(/SKIPS jobs|sum to the full job list/.test(inc.stderr), 'the refusal explains that skipped jobs break the sum', { stderr: inc.stderr.slice(0, 300) })

  for (const scope of ['quick', 'vmu']) {
    const sc = runRaw(['--shard', '1/8', '--shard-plan'], { GATE_SCOPE: scope })
    ok(sc.status === 2, 'GATE_SCOPE=' + scope + ' + --shard exits 2', { status: sc.status })
    ok(/SHARD-SCOPE-UNSUPPORTED/.test(sc.stderr), 'the curated-scope conflict is named for ' + scope, { stderr: sc.stderr.slice(0, 300) })
    ok(/curated subset|GATE_SCOPE=full/.test(sc.stderr), 'the refusal explains that the shards would sum to a subset', { stderr: sc.stderr.slice(0, 300) })
  }
})

// ── 6. SELF-PROOF: a shard's own log names the slice; report modes are not sliced ────────────────────────
const SINGLE = 'audit-portability.mjs'
test('§6 a real shard prints shard=i/N selected=K of M in TOTAL, --json and the headers', () => {
  // Narrow to ONE job so the proof costs one probe rather than a slice of the sweep. The plan says which
  // shard it belongs to; we do not guess the index.
  const one = plan(1, 1, ['--only', SINGLE])
  ok(one.jobs.length === 1, 'the --only filter narrowed the sweep to exactly one job', { jobs: one.jobs })
  const index = 1 // position 0 of a 1-job base list: k % 8 === 0

  const human = runRaw(['--shard', index + '/8', '--only', SINGLE])
  ok(human.status === 0, 'the one-job shard ran green', { status: human.status, stderr: human.stderr.slice(0, 400) })
  const proof = 'shard=' + index + '/8 selected=1 of 1'
  ok(new RegExp('TOTAL 1\\s+PASS 1\\s+FAIL 0').test(human.stdout), 'the TOTAL line reports the shard\'s own numbers', {
    totalLine: (human.stdout.split('\n').find((l) => l.startsWith('TOTAL')) || '').slice(0, 200),
  })
  ok(human.stdout.includes(proof), 'the TOTAL line carries ' + proof + ' (a slice cannot pose as the full sweep)', {
    totalLine: (human.stdout.split('\n').find((l) => l.startsWith('TOTAL')) || '').slice(0, 240),
  })
  ok(human.stderr.includes(proof), 'the scope header carries the same proof string', { stderr: human.stderr.split('\n').filter((l) => l.includes('shard=')).join(' | ').slice(0, 300) })

  const machine = runRaw(['--shard', index + '/8', '--only', SINGLE, '--json'])
  ok(machine.status === 0, 'the same shard in --json mode ran green', { status: machine.status })
  const report = JSON.parse(machine.stdout)
  assert.deepEqual(report.shard, { index, count: 8, selected: 1, total: 1 },
    '--json carries {index,count,selected,total} - a machine report without it could be a full sweep OR a slice')
})

test('§6b the report modes are NOT sharded: --shard does not change their stdout', () => {
  const countsPlain = runRaw(['--counts'])
  const countsShard = runRaw(['--counts', '--shard', '3/8'])
  ok(countsShard.status === 0, '--counts with --shard still succeeds (the flag is named as ignored, not fatal)', { status: countsShard.status })
  ok(countsShard.stdout === countsPlain.stdout, '--counts stdout is byte-identical with and without --shard (counts report the REPOSITORY)', {
    plain: countsPlain.stdout.trim().slice(0, 160),
    shard: countsShard.stdout.trim().slice(0, 160),
  })
  ok(/shard=3\/8 IGNORED/.test(countsShard.stderr), 'and the runner says so on stderr, so nobody mistakes it for a shard count', {
    stderr: countsShard.stderr.split('\n').filter((l) => l.includes('IGNORED')).join(' | ').slice(0, 240),
  })

  const scopePlain = runRaw(['--scope-report'])
  const scopeShard = runRaw(['--scope-report', '--shard', '3/8'])
  ok(scopeShard.status === 0, '--scope-report with --shard succeeds', { status: scopeShard.status })
  ok(scopeShard.stdout === scopePlain.stdout, '--scope-report stdout is byte-identical with and without --shard', {})

  // --self-check legitimately prints volatile values (a random temp-file name proves that an UNREADABLE
  // baseline skips nothing; the head-start proof prints a millisecond timer; the synthetic job prints a
  // wall time), so compare with THOSE tokens normalised away rather than pretending the bytes are stable.
  const norm = (s) => s
    .replace(/no-such-baseline-\d+\.txt/g, 'no-such-baseline-<pid>.txt')
    .replace(/after \d+ms/g, 'after <ms>ms')
    .replace(/\b\d+(?:\.\d+)?s\b/g, '<S>s')
    .replace(/\b\d{6,}\b/g, '<N>')
  const selfPlain = runRaw(['--self-check'])
  const selfShard = runRaw(['--self-check', '--shard', '2/3'])
  ok(selfPlain.status === 0 && selfShard.status === 0, '--self-check passes both ways', { plain: selfPlain.status, shard: selfShard.status })
  const normPlain = norm(selfPlain.stdout)
  const normShard = norm(selfShard.stdout)
  const normDiff = normPlain === normShard ? '' : firstDiff(normPlain, normShard)
  ok(normDiff === '', '--self-check output is unchanged by --shard (past its volatile timers and temp names)', { diff: normDiff })
  ok(!/shard=\d+\/\d+ selected=/.test(selfShard.stdout), 'and it never claims to be a shard (it checked the repository)', {})
})
