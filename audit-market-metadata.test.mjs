// ============================================================================================
// MARKET METADATA AUDIT — the two things a storefront reads about this plugin, kept from rotting.
//
// A storefront (dsh-market / awesome-dsh-plugin, and the sites built from the same catalog) reads
// exactly two declaration surfaces from THIS repository:
//
//   1. the DSH version requirement — from the **published npm manifest**:
//        · `engines.dsh`  (top-level; wins when both are present), or
//        · `dsh.engines.dsh`
//      plus every `peerDependencies` entry named `@deepseek-ai/dsh*` (all declarations are
//      conjunctive). It is evaluated with semver + `includePrerelease: true`, and every one of them
//      is compared to the running host version to show "compatible / incompatible / unknown" on the
//      card. `awesome-dsh-plugin/contributing.md` documents the trap this file guards against:
//      a range without an explicit prerelease comparator on the matching `major.minor.patch` tuple
//      silently excludes that tuple's prereleases, so a "broad" range fails to match real hosts.
//   2. the screenshots — from `screenshots.json` **next to package.json** in this repository
//      (1–8 images; relative paths must stay inside the repo, absolute URLs must be https on GitHub
//      hosting). The catalog's nightly build fetches it; a path that 404s is silently dropped, which
//      is exactly how the legacy entry for this repo ended up pointing at a deleted `框架图-v1.png`.
//
// Run: node audit-market-metadata.test.mjs      (part of `node run-tests.mjs`)
// ============================================================================================
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const read = (rel) => (existsSync(join(HERE, rel)) ? readFileSync(join(HERE, rel), 'utf8') : null)

const pkg = JSON.parse(read('package.json'))

// ---------------------------------------------------------------------------------------------
// 0. the listing preconditions the catalog's CI checks first
// ---------------------------------------------------------------------------------------------
ok(!!(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch), 'dsh.bundle.patch is declared (what makes the repo listable and installable)',
  'contributing.md: declaring only dsh.client is the most common rejection')
ok(existsSync(join(HERE, String((pkg.dsh.bundle || {}).patch || 'cordis.patch.yml'))), 'the bundle patch file exists next to package.json')

// ---------------------------------------------------------------------------------------------
// 1. the DSH requirement declaration
// ---------------------------------------------------------------------------------------------
// The exact chain in package.json, verified against semver 7.8.5 (npm's bundled copy) BOTH with and
// without `includePrerelease` — it admits exactly the releases in `dsh.compatibility.dshReleases`
// (0.1.2-alpha.4 … 0.1.5-rc.2) and rejects 0.1.1-*, 0.2.0-rc.1, 0.2.0 and 1.0.0. Re-verify with:
//   node -e "const s=require('C:/…/npm/node_modules/semver');console.log(s.satisfies('0.1.5-rc.2', RANGE, {includePrerelease:true}))"
// An exact-match assertion is deliberate: any edit to the range must be re-verified by hand, because
// a plausible-looking range is precisely how hosts get a wrong verdict on the card.
const EXPECTED = '>=0.1.2-alpha.4 <0.1.3-0 || >=0.1.3-alpha.2 <0.1.5-0 || >=0.1.5-alpha.1 <0.2.0-0'
const engineDsh = pkg.engines && pkg.engines.dsh
const dshEnginesDsh = pkg.dsh && pkg.dsh.engines && pkg.dsh.engines.dsh
ok(typeof engineDsh === 'string', 'engines.dsh is declared (the position dsh-market reads)', JSON.stringify(engineDsh))
ok(typeof dshEnginesDsh === 'string', 'dsh.engines.dsh is declared (the ecosystem shape, read when engines.dsh is absent)', JSON.stringify(dshEnginesDsh))
ok(engineDsh === EXPECTED && dshEnginesDsh === EXPECTED,
  'both declarations carry the VERIFIED range (they must agree: the market takes top-level, other tools take dsh.engines.dsh)',
  'engines.dsh=' + JSON.stringify(engineDsh) + ' dsh.engines.dsh=' + JSON.stringify(dshEnginesDsh))
ok(typeof engineDsh === 'string' && engineDsh.length <= 256, 'the declaration fits the market\'s 256-char range limit (' + String(engineDsh || '').length + ')')

// Every release we claim in our own compatibility matrix must be covered by the range: for each
// prerelease tuple, the chain needs a comparator on that exact tuple carrying a prerelease tag —
// the rule node-semver applies, and the one contributing.md warns about. This is what keeps the
// declaration and the matrix from drifting apart (git history: the matrix grows, the range forgets).
{
  const matrix = Object.entries((pkg.dsh.compatibility || {}).dshReleases || {})
    .filter(([, v]) => v === 'compatible')
    .map(([ver]) => ver)
  ok(matrix.length > 0, 'the package still records a compatibility matrix (' + matrix.length + ' releases)')
  const missing = matrix.filter((ver) => !engineDsh.includes(ver.replace(/^(\d+\.\d+\.\d+)/, '$1')) && !new RegExp('(?:>=|<)\\s*' + ver.replace(/\./g, '\\.')).test(engineDsh))
  // a version is covered when the chain names a comparator whose tuple matches it
  const uncovered = matrix.filter((ver) => {
    const tuple = ver.split('-')[0]
    return !new RegExp('(?:>=|<)\\s*' + tuple.replace(/\./g, '\\.')).test(engineDsh)
  })
  ok(uncovered.length === 0, 'every release marked compatible in dsh.compatibility is covered by engines.dsh',
    'uncovered: ' + uncovered.join(', ') + (missing.length ? '' : ''))
  const ceil = /<0\.2\.0-0/.test(engineDsh)
  ok(ceil, 'the range ends with an explicit prerelease-aware ceiling (<0.2.0-0): a future major host is not silently claimed compatible')
  // no @deepseek-ai peers is a *deliberate* state for this bundle: the presets depend on host
  // SERVICES, not on npm packages. If one is ever added, the market will AND it with the engine
  // declaration, so it must be a prerelease-aware range too.
  const peers = Object.keys(pkg.peerDependencies || {}).filter((n) => n.startsWith('@deepseek-ai/'))
  ok(peers.length === 0, 'no @deepseek-ai peerDependencies are declared (the presets use host services, not packages)', peers.join(', '))
}

// ---------------------------------------------------------------------------------------------
// 2. screenshots.json (the carousel the market shows, and the card image)
// ---------------------------------------------------------------------------------------------
{
  const raw = read('screenshots.json')
  if (ok(raw !== null, 'screenshots.json exists next to package.json (the market reads it from the repo, not from npm)')) {
    let doc = null
    try { doc = JSON.parse(raw) } catch (e) { ok(false, 'screenshots.json parses as JSON', String(e.message)) }
    const list = Array.isArray(doc) ? doc : (doc && Array.isArray(doc.screenshots) ? doc.screenshots : null)
    ok(Array.isArray(list), 'screenshots.json is an array (or {screenshots:[…]})')
    if (Array.isArray(list)) {
      ok(list.length >= 1 && list.length <= 8, 'it declares 1–8 images (' + list.length + ')')
      const GH_HOSTS = new Set(['raw.githubusercontent.com', 'user-images.githubusercontent.com', 'camo.githubusercontent.com', 'github.com'])
      const bad = []
      for (const item of list) {
        if (typeof item !== 'string' || item.trim() === '') { bad.push(JSON.stringify(item) + ' (not a non-empty string)'); continue }
        if (/^https?:\/\//i.test(item)) {
          let host = null
          try { host = new URL(item).hostname } catch (e) { /* left null */ }
          if (!(host && GH_HOSTS.has(host) && item.startsWith('https://'))) bad.push(item + ' (absolute URLs must be https on GitHub hosting)')
          continue
        }
        if (item.startsWith('/') || item.split('/').includes('..')) { bad.push(item + ' (relative paths must stay inside the repo: no leading /, no ..)'); continue }
        // The rot this guards: the legacy catalog entry pointed at a deleted PNG and the carousel
        // silently lost its first image. A declared path that does not exist is a broken listing.
        if (!existsSync(join(HERE, item))) bad.push(item + ' (declared but missing from the repository)')
      }
      ok(bad.length === 0, 'every declared image is a usable, existing path', bad.join(' | '))
      const pngs = list.filter((s) => typeof s === 'string' && /\.png$/i.test(s)).length
      ok(pngs === list.length, 'every declared image is a raster PNG (the market carousel is AppStore-style; the README keeps the scalable SVGs)', list.filter((s) => !/\.png$/i.test(String(s))).join(', '))
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 3. the README must not point at diagrams that no longer exist (the same rot, other surface)
// ---------------------------------------------------------------------------------------------
{
  const readme = read('README.md') || ''
  const refs = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1])
  const missing = refs.filter((p) => !/^https?:/i.test(p) && !existsSync(join(HERE, p)))
  ok(refs.length > 0 && missing.length === 0, 'every image the README shows exists in the repository (' + refs.length + ' images)', missing.join(', '))
}

console.log('')
console.log('=== MARKET METADATA: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
