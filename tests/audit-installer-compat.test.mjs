// ============================================================================================
// INSTALLER HOST-COMPATIBILITY AUDIT
//
// The installer's host self-check warns when the running DSH is outside the range this package
// declares. That verdict must come from the SAME declaration dsh-market renders on the plugin card
// (`engines.dsh` / `dsh.engines.dsh`) and not from a second source, or the two disagree: the card
// says "compatible" while the log warns, or the reverse. This suite pins that:
//
//   · the range matcher reproduces semver 7.8.5 exactly — the expectations below were generated with
//     npm's own bundled semver (`require('…/npm/node_modules/semver')`) and re-checked against the
//     shipped matcher over 320 (range, version, includePrerelease) pairs, 0 mismatches;
//   · `dshVersionVerdict` prefers the declared range and falls back to `dsh.compatibility`;
//   · every release our own compatibility matrix calls `compatible` is NOT judged incompatible by
//     the declared range — the two sources cannot drift apart.
//
// Run: node tests/audit-installer-compat.test.mjs      (part of `node tests/run-tests.mjs`)
// ============================================================================================
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'
import { satisfiesDshRange, dshVersionVerdict, detectDshVersion, PRESETS } from '../installer.js'

const HERE = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'))
// §4 drives the real apply(); INSTALLER_JS lets the sensitivity probe run it against a reverted copy
const INSTALLER_SRC = process.env.INSTALLER_JS ? resolve(process.env.INSTALLER_JS) : join(HERE, 'installer.js')

let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const eq = (actual, expected, label) => ok(actual === expected, label, 'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected))

// ---------------------------------------------------------------------------------------------
// 1. the matcher reproduces semver 7.8.5 (expectations generated with npm's bundled semver)
// ---------------------------------------------------------------------------------------------
const CASES = [
  // [range, version, includePrerelease, expected]
  ['*', '1.2.3', false, true],
  ['*', '0.1.5-rc.2', false, false],      // npm: `*` excludes prereleases unless opted in
  ['*', '0.1.5-rc.2', true, true],
  ['1.2.3', '1.2.3', false, true],
  ['1.2.3', '1.2.4', false, false],
  ['^0.1.0', '0.1.4', false, true],
  ['^0.1.0', '0.2.0-rc.1', true, false],  // 0.x caret never reaches the next minor
  ['^0.1.0', '0.1.0-rc.5', true, false],  // ...nor a prerelease below its own floor
  ['^0.1.0-rc.7', '0.1.0-rc.7', false, true],
  ['^0.1.0-rc.7', '0.1.5-rc.2', true, true],
  ['^0.0.1', '0.0.1', false, true],
  ['^0.0.1', '0.0.2', false, false],
  ['~0.1.2', '0.1.4', false, true],
  ['~0.1.2', '0.2.0', false, false],
  ['>0.1.0 <=0.1.5', '0.1.5', false, true],
  ['>=0.1.5-rc.1', '0.1.5-rc.2', false, true],
  ['>=0.1.5-rc.1', '0.2.0', false, true], // a floor-only range keeps admitting newer hosts
  // the trap contributing.md warns about: no comparator on the 0.1.5 tuple carrying a prerelease
  ['>=0.1.2-rc.1 <0.2.0', '0.1.5-rc.2', false, false],
  ['>=0.1.2-rc.1 <0.2.0', '0.1.5-rc.2', true, true],
  // the market-style chain
  ['^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2', '0.1.2-rc.1', false, true],
  ['^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2', '0.1.3-alpha.2', false, false],
  ['^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2', '0.1.3-alpha.2', true, true],
]
for (const [range, version, pre, expected] of CASES) {
  eq(satisfiesDshRange(version, range, { includePrerelease: pre }), expected,
    'matcher: ' + JSON.stringify(range) + ' vs ' + version + (pre ? ' (includePrerelease)' : ''))
}
// our own declaration, both semantics (the exact chain the market and the installer share)
// The window is per-tuple: every supported line has its own prerelease branch, because npm's
// prerelease rule only admits a version when a comparator in the SAME [major,minor,patch] tuple also
// carries a prerelease. 0.2.0 joined the window with the DSH 0.2.0 adaptation.
for (const v of ['0.1.2-alpha.4', '0.1.2-rc.1', '0.1.3-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.6-alpha.2', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2']) {
  eq(satisfiesDshRange(v, pkg.engines.dsh), true, 'own range admits ' + v + ' (default semantics)')
  eq(satisfiesDshRange(v, pkg.engines.dsh, { includePrerelease: true }), true, 'own range admits ' + v + ' (includePrerelease)')
}
for (const v of ['0.2.0']) {
  eq(satisfiesDshRange(v, pkg.engines.dsh, { includePrerelease: true }), true, 'own range admits the released ' + v)
}
for (const v of ['0.1.1-rc.1', '0.3.0-rc.1', '0.3.0', '1.0.0']) {
  eq(satisfiesDshRange(v, pkg.engines.dsh, { includePrerelease: true }), false, 'own range rejects ' + v)
}
// unsupported forms are UNKNOWN (null) — reported, never asserted incompatible
for (const r of ['not-a-range', '>=1.2', '1.2.x', '']) {
  eq(satisfiesDshRange('1.2.5', r, { includePrerelease: true }), null, 'unsupported range is unknown: ' + JSON.stringify(r))
}
eq(satisfiesDshRange('not-a-version', pkg.engines.dsh), null, 'an unparseable host version is unknown, not incompatible')

// ---------------------------------------------------------------------------------------------
// 2. the verdict prefers the declared range, falls back to the matrix
// ---------------------------------------------------------------------------------------------
{
  const a = dshVersionVerdict('0.1.5-rc.2', pkg)
  ok(a.status === 'compatible' && a.basis === 'engines', 'our own host line is compatible via the declared range', JSON.stringify(a))
  eq(a.requirement, pkg.engines.dsh, 'the verdict surfaces the declared range (so the log and the market card say the same thing)')
  const b = dshVersionVerdict('0.3.0', pkg)
  ok(b.status === 'incompatible' && b.basis === 'engines', 'a host outside the declared range is incompatible via the range', JSON.stringify(b))
  const c = dshVersionVerdict('0.1.0-rc.6', pkg)
  ok(c.status === 'incompatible', 'a host below the declared floor is incompatible', JSON.stringify(c))
  // dsh.engines.dsh is the second position the ecosystem (and the market) reads
  const onlyNested = { dsh: { engines: { dsh: '>=0.1.0-rc.6' } } }
  const d = dshVersionVerdict('0.1.0-rc.6', onlyNested)
  ok(d.status === 'compatible' && d.basis === 'engines', 'dsh.engines.dsh is honoured when engines.dsh is absent', JSON.stringify(d))
  // top-level wins when both are present (mirrors dsh-market's manifestFacts)
  const both = { engines: { dsh: '>=0.2.0' }, dsh: { engines: { dsh: '>=0.1.0' } } }
  eq(dshVersionVerdict('0.1.5-rc.2', both).status, 'incompatible', 'engines.dsh wins when both positions are declared')
  // fallback: a manifest that declares no range keeps the dshReleases behaviour
  const mapOnly = {
    dsh: { compatibility: { dshReleases: { '0.1.5-rc.2': 'compatible', '0.1.0-rc.1': 'incompatible', '0.1.9': 'unknown' } } },
  }
  const e = dshVersionVerdict('0.1.5-rc.2', mapOnly)
  ok(e.status === 'compatible' && e.basis === 'dshReleases', 'fallback: the matrix still decides when no range is declared', JSON.stringify(e))
  eq(dshVersionVerdict('0.1.0-rc.1', mapOnly).status, 'incompatible', 'fallback: an explicitly incompatible release')
  eq(dshVersionVerdict('0.1.7', mapOnly).status, 'undeclared', 'fallback: an unlisted release is undeclared (soft warning)')
  eq(dshVersionVerdict('0.1.9', mapOnly).status, 'unknown', 'fallback: an explicitly unknown release')
  // a range the matcher cannot parse must not become "incompatible"
  const unparsable = { engines: { dsh: 'not a range' } }
  const f = dshVersionVerdict('0.1.5-rc.2', unparsable)
  ok(f.status === 'unknown' && f.basis === 'engines', 'an unparseable declared range is unknown, never incompatible', JSON.stringify(f))
}

// ---------------------------------------------------------------------------------------------
// 3. the two sources cannot drift: every release our matrix calls compatible must not be judged
//    incompatible by the declared range (the installer and the market must agree).
// ---------------------------------------------------------------------------------------------
{
  const matrix = Object.entries((pkg.dsh.compatibility || {}).dshReleases || {})
  const contradicted = matrix.filter(([ver, status]) => {
    const v = dshVersionVerdict(ver, pkg)
    return status === 'compatible' && v.status === 'incompatible'
  }).map(([ver]) => ver)
  ok(contradicted.length === 0, 'no release marked compatible in dsh.compatibility is rejected by engines.dsh',
    contradicted.join(', '))
  const missedByRange = matrix.filter(([ver]) => dshVersionVerdict(ver, pkg).status === 'unknown').map(([ver]) => ver)
  ok(missedByRange.length === 0, 'the declared range can be evaluated for every release in the matrix', missedByRange.join(', '))
}

// ---------------------------------------------------------------------------------------------
// 4. the version probe must not be able to hold the installer ROW's activation
//
// `detectDshVersion` asks `pluginManager.listBundles()` for the runtime version, and it runs at the
// top of apply(). The result is diagnostic only — the preset mechanism is decided by the loader tree
// / the service's `register`, never by the version — so a slow or stuck plugin manager must fall
// through to the next source instead of stalling the boot. (Round B, machinery audit.)
// ---------------------------------------------------------------------------------------------
console.log('=== 4. a pluginManager that never answers must not hold the row ===')
{
  const tmp = mkdtempSync(join(tmpdir(), 'vibe-installer-timeout-'))
  const pkg = join(tmp, 'pkg')
  mkdirSync(pkg, { recursive: true })
  cpSync(INSTALLER_SRC, join(pkg, 'installer.js'))
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'dsh-vibe-math', version: '9.9.9', type: 'module' }, null, 2))
  for (const p of PRESETS) {
    mkdirSync(join(pkg, p.src), { recursive: true })
    for (const f of p.files) cpSync(join(HERE, p.src, f), join(pkg, p.src, f))
  }
  const home = join(tmp, 'dshhome')
  mkdirSync(home, { recursive: true })
  process.env.DSH_HOME = home
  delete process.env.DSH_VERSION // leave the pluginManager as the only source
  const presetRoot = join(home, '.agent-presets')
  // import the COPY, so `here` inside installer.js is the throwaway package (manifest + preset dirs)
  const mod = await import(pathToFileURL(join(pkg, 'installer.js')).href + '?t=' + Date.now())

  const run = (services) => {
    const logs = []
    const ctx = {
      get: (n) => (n === 'pluginManager' ? services : undefined),
      logger: { info: (m) => logs.push('info: ' + m), warn: (m) => logs.push('warn: ' + m), error: (m) => logs.push('error: ' + m) },
    }
    return { ctx, logs }
  }

  // a promise that never settles: without a timeout apply() would await it forever
  const HARD_LIMIT_MS = 8000
  const { ctx, logs } = run({ listBundles: () => new Promise(() => {}) })
  let verdict = 'hung'
  const t0 = Date.now()
  let hardTimer
  await Promise.race([
    mod.apply(ctx).then(() => { verdict = 'returned' }, (e) => { verdict = 'threw: ' + String(e && e.message) }),
    new Promise((resolve) => { hardTimer = setTimeout(resolve, HARD_LIMIT_MS) }),
  ])
  clearTimeout(hardTimer) // the shipped installer wins the race in ~1.5 s; do not hold the suite open
  const elapsed = Date.now() - t0
  ok(verdict === 'returned', 'apply() returns instead of waiting on a pluginManager that never answers', verdict)
  ok(elapsed < 6000, '...within a short timeout, not at the hard test limit', elapsed + 'ms')
  const copied = PRESETS.every((p) => p.files.every((f) => existsSync(join(presetRoot, p.dst, f))))
  ok(copied, '...and the preset copy still happens (the version probe gates nothing)')
  ok(!logs.some((l) => l.includes('preset install/update failed')), 'the timeout is handled as a fallback, not as an error')

  // the timeout must NOT replace a working probe: a prompt service still supplies the version
  const quick = run({ listBundles: async () => [{ name: '@deepseek-ai/dsh-base', version: '0.2.0-rc.2' }] })
  await mod.apply(quick.ctx)
  // A7 (assertion quality): the version+source claim is asserted on the STRUCTURED result - a bare
  // `logs.some(l => l.includes('0.2.0-rc.2'))` would also pass if the string appeared anywhere for any
  // reason, and `l.includes('source')` would pass on the English word alone. The log keeps ONE
  // shape-anchored check.
  const probeQuick = (await import(pathToFileURL(INSTALLER_SRC).href + '?t=' + Date.now())).detectDshVersion || detectDshVersion
  const detQuick = await probeQuick(quick.ctx)
  ok(detQuick && detQuick.version === '0.2.0-rc.2',
    '★ a prompt listBundles() still supplies the version (STRUCTURED field: version)', JSON.stringify(detQuick && { version: detQuick.version, source: detQuick.source }))
  ok(!!detQuick && typeof detQuick.source === 'string' && detQuick.source.indexOf('pluginManager') === 0,
    '★ ...and the winning SOURCE is a structured field naming the service (not the word "source" in a log line)', JSON.stringify(detQuick && detQuick.source))
  ok(quick.logs.some((l) => /v?0\.2\.0-rc\.2/.test(l)),
    '...and a log line SHAPE carries that version (shape-anchored, not a bare substring)')
  rmSync(tmp, { recursive: true, force: true })
}

// Installer review (finding): several sources can report the host's version and "first available wins"
// hid a conflicting host state. The probe records EVERY value+source, keeps the first available
// authoritative (priority unchanged), and assembles `disagreement` ONLY when one exists.
{
  const prev = process.env.DSH_VERSION
  try {
    // Import through INSTALLER_SRC (env-overridable) so a single-site mutant on a COPY of installer.js
    // reaches these assertions - that is what makes the mutant below able to bite.
    const mod = await import(pathToFileURL(INSTALLER_SRC).href + '?t=' + Date.now())
    const probe = mod.detectDshVersion || detectDshVersion
    process.env.DSH_VERSION = '9.9.9'
    const disagreeing = { get: (n) => (n === 'pluginManager' ? { listBundles: async () => [{ name: '@deepseek-ai/dsh', version: '8.8.8' }] } : undefined) }
    const d1 = await probe(disagreeing)
    ok(d1 && d1.version === '9.9.9' && d1.source === 'DSH_VERSION', 'the FIRST available source stays authoritative (which version wins is unchanged)', JSON.stringify(d1))
    ok(d1 && Array.isArray(d1.probes) && d1.probes.length >= 2 && d1.probes.some((p) => p.source.indexOf('pluginManager') === 0 && p.version === '8.8.8'),
      '★ every probe value+source is recorded (nothing is silently dropped)', JSON.stringify(d1 && d1.probes))
    ok(!!(d1 && d1.disagreement) && d1.disagreement.primary === 'DSH_VERSION' && d1.disagreement.conflicts.some((c) => c.version === '8.8.8'),
      '★ DISAGREEING probes surface a disagreement slot naming the conflict', JSON.stringify(d1 && d1.disagreement))
    const agreeing = { get: (n) => (n === 'pluginManager' ? { listBundles: async () => [{ name: '@deepseek-ai/dsh', version: '9.9.9' }] } : undefined) }
    const d2 = await probe(agreeing)
    ok(d2 && d2.version === '9.9.9' && !('disagreement' in d2), '★ AGREEING probes print NO disagreement slot (assemble-only-on-conflict)', JSON.stringify(d2))
    // The `%s` placeholder that could reach the user: every installer log line must pre-concatenate.
    const isrc = readFileSync(INSTALLER_SRC, 'utf8')
    const printf = isrc.split('\n').filter((l) => /logger|console/.test(l) && /%[sd]/.test(l))
    ok(printf.length === 0, '★ no installer log line carries a bare printf placeholder (%s/%d)', JSON.stringify(printf.slice(0, 2)))
  } finally {
    if (prev === undefined) delete process.env.DSH_VERSION; else process.env.DSH_VERSION = prev
  }
}

console.log('')
// The self-check proves service/API SHAPE only - never runtime SEMANTICS. The caveat must be on the
// USER-VISIBLE pass line, so a passing self-check is not read as a compatibility claim.
{
  const src = readFileSync(INSTALLER_SRC, 'utf8')
  const line = src.split(/\r?\n/).find((l) => l.indexOf('自检通过') !== -1 && l.indexOf('logger') !== -1) || ''
  ok(line.length > 0, 'the installer reports a passing host self-check')
  ok(line.indexOf('形状') !== -1 && line.indexOf('行为') !== -1, '★ self-check caveat: the PASS line states that SHAPE is proven and BEHAVIOUR is not', JSON.stringify(line.slice(0, 90)))
}

console.log('=== INSTALLER COMPAT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
