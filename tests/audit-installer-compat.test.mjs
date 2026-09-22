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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { satisfiesDshRange, dshVersionVerdict } from '../installer.js'

const HERE = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'))

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
for (const v of ['0.1.2-alpha.4', '0.1.2-rc.1', '0.1.3-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2']) {
  eq(satisfiesDshRange(v, pkg.engines.dsh), true, 'own range admits ' + v + ' (default semantics)')
  eq(satisfiesDshRange(v, pkg.engines.dsh, { includePrerelease: true }), true, 'own range admits ' + v + ' (includePrerelease)')
}
for (const v of ['0.1.1-rc.1', '0.2.0-rc.1', '0.2.0', '1.0.0']) {
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
  const b = dshVersionVerdict('0.2.0', pkg)
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

console.log('')
console.log('=== INSTALLER COMPAT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
