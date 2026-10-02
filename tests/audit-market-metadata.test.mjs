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
// Run: node tests/audit-market-metadata.test.mjs      (part of `node tests/run-tests.mjs`)
//
// PACKAGING CONTRACT — this suite is REPOSITORY-ONLY and deliberately **not** listed in
// `package.json` `files`. Everything it verifies (the screenshots.json paths, the README's images) is a
// repository artifact the catalog fetches from GitHub; the npm tarball does not ship those images, so
// the existence checks cannot be evaluated inside an installed package and would fail there. The
// assertion at the bottom enforces that: if someone adds this file to `files`, the suite goes red here
// in the checkout rather than silently breaking the publish verification later.
// (Learned the hard way: 2.3.10 shipped it, and the publish verification failed inside the tarball
// with "示例图/框架图-v5.png (declared but missing from the repository)".)
// ============================================================================================
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'

// MC_MARKET_ROOT points this guard at a MUTATED copy of the tree (used by the release-notes mutant,
// which must try an unpublished version without touching the repository).
const HERE = process.env.MC_MARKET_ROOT ? resolve(String(process.env.MC_MARKET_ROOT)) : fileURLToPath(new URL('../', import.meta.url))
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
// 0b. the shipped release notes must COVER the current version (existence + packaging only)
// ---------------------------------------------------------------------------------------------
// Root cause of this release's only HOLD: 2.7.0 shipped with notes that were not in `files`, and
// nothing connected a version bump to a release note. The contract asserted here is deliberately
// structural (no note *contents*, which would be brittle): for `package.json.version` there must be
// a bilingual pair on disk AND both must be listed in `package.json#files`.
{
  const ver = String(pkg.version || '').trim()
  const notes = ['docs/release-notes/RELEASE-NOTES-' + ver + '.md', 'docs/release-notes/RELEASE-NOTES-' + ver + '.en.md']
  const missingFiles = notes.filter((rel) => !existsSync(join(HERE, rel)))
  ok(missingFiles.length === 0, 'the shipped release notes cover the current version ' + ver + ' (both languages)',
    'missing on disk: ' + missingFiles.join(', '))
  const unshipped = notes.filter((rel) => !(pkg.files || []).includes(rel))
  ok(unshipped.length === 0, 'both current-version release notes are listed in package.json#files',
    'not in files[]: ' + unshipped.join(', '))
  // round-B (F7): `compatNote` is user-facing manifest text and used to keep describing the PREVIOUS
  // release after a version bump (nothing checked it). It must name the current version.
  const compatNote = String((pkg.dsh || {}).compatNote || '')
  ok(compatNote.indexOf(ver) !== -1, 'dsh.compatNote mentions the current version ' + ver,
    'compatNote starts: ' + compatNote.slice(0, 60))
  // F8 follow-up: the lockfile version fields once drifted behind package.json (2.7.1 vs 2.7.2) and
  // nothing noticed. The lockfile is not shipped, but the repo must stay self-consistent.
  try {
    const lock = JSON.parse(readFileSync(join(HERE, 'package-lock.json'), 'utf8'))
    ok(String(lock.version || '') === ver, 'package-lock.json top-level version matches package.json (' + ver + ')', 'lockfile: ' + lock.version)
  } catch (e) {
    ok(false, 'package-lock.json is readable JSON', String((e && e.message) || '').slice(0, 80))
  }
}

// ---------------------------------------------------------------------------------------------
// 1. the DSH requirement declaration
// ---------------------------------------------------------------------------------------------
// The exact chain in package.json, verified against semver BOTH with and without `includePrerelease`
// — it admits every release in `dsh.compatibility.dshReleases` (0.1.2-alpha.4 … 0.2.0-rc.2) and
// rejects 0.1.1-*, 0.3.0-rc.1, 0.3.0 and 1.0.0. Re-verify with:
//   node -e "const s=require('C:/…/npm/node_modules/semver');console.log(s.satisfies('0.2.0-rc.2', RANGE, {includePrerelease:true}))"
// An exact-match assertion is deliberate: any edit to the range must be re-verified by hand, because
// a plausible-looking range is precisely how hosts get a wrong verdict on the card.
//
// EVERY supported line needs its own branch whose tuple carries a prerelease tag: node-semver only
// admits a prerelease version when a comparator on the SAME [major,minor,patch] tuple also carries
// one. A branch like >=0.1.5-alpha.1 <0.2.0-0 therefore silently rejects 0.1.6-alpha.x and 0.1.7-rc.x,
// which is how the DSH 0.2.0 adaptation widened this chain.
const EXPECTED = '>=0.1.2-alpha.4 <0.1.3-0 || >=0.1.3-alpha.2 <0.1.5-0 || >=0.1.5-alpha.1 <0.1.6-0 || >=0.1.6-alpha.1 <0.1.7-0 || >=0.1.7-alpha.1 <0.2.0-0 || >=0.2.0-alpha.1 <0.3.0-0'
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
  // The ceiling must be the next MINOR of the newest supported line, prerelease-aware (<x.(y+1).0-0),
  // so a future host line is never silently claimed compatible.
  const newest = matrix.map((v) => v.split('-')[0]).sort((a, b) => {
    const [am, an, ap] = a.split('.').map(Number), [bm, bn, bp] = b.split('.').map(Number)
    return am - bm || an - bn || ap - bp
  }).pop()
  const [maj, min] = newest.split('.').map(Number)
  const ceil = new RegExp('<0*' + maj + '\\.' + (min + 1) + '\\.0-0').test(engineDsh)
  ok(ceil, 'the range ends with an explicit prerelease-aware ceiling on the next minor of the newest supported line (<' + maj + '.' + (min + 1) + '.0-0)')
  // @deepseek-ai peers ARE declared now: DSH >= 0.1.7 reads them as its own compatibility gate and
  // SKIPS the whole bundle on a mismatch. Two properties matter — the peer is optional (pnpm must
  // never try to install the host into a profile) and its range is the same verified chain.
  const peers = Object.keys(pkg.peerDependencies || {}).filter((n) => n.startsWith('@deepseek-ai/'))
  ok(peers.length > 0 && peers.every((n) => (pkg.peerDependenciesMeta || {})[n] && (pkg.peerDependenciesMeta || {})[n].optional === true),
    'every @deepseek-ai peerDependency is marked optional (the host is present; only the version gate is wanted)', peers.join(', '))
  const badPeers = peers.filter((n) => pkg.peerDependencies[n] !== engineDsh)
  ok(badPeers.length === 0, 'each @deepseek-ai peerDependency carries the same verified range as engines.dsh', badPeers.join(', '))
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
for (const name of ['README.md', 'README.en.md']) {
  const readme = read(name) || ''
  const refs = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1])
  const missing = refs.filter((p) => !/^https?:/i.test(p) && !existsSync(join(HERE, p)))
  ok(refs.length > 0 && missing.length === 0, `every image ${name} shows exists in the repository (${refs.length} images)`, missing.join(', '))
  // ...and every one of them must SHIP, or the npm page renders a broken image (the v2/v3 diagrams
  // were referenced for months without being in `files`).
  const unshipped = refs.filter((p) => !/^https?:/i.test(p) && !(pkg.files || []).includes(p))
  ok(unshipped.length === 0, `every local image ${name} shows is listed in package.json files`, unshipped.join(', '))
  // ...and the same for every OTHER local link. The npm page renders these files, so a relative
  // link to a file the tarball does not carry is a dead end for whoever installed the package —
  // which is exactly what the two diagram generators were (linked, never shipped). README.en.md
  // additionally links to README.md (the language switcher), which ships too.
  const allLinks = [...new Set([...readme.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]))]
    .filter((p) => !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('#'))
    .map((p) => p.split('#')[0])
    .filter((p) => p !== '')
  const deadLinks = allLinks.filter((p) => !existsSync(join(HERE, p)))
  ok(deadLinks.length === 0, `every local link in ${name} resolves (${allLinks.length} links)`, deadLinks.join(', '))
  const unshippedLinks = allLinks.filter((p) => !(pkg.files || []).includes(p))
  ok(unshippedLinks.length === 0, `every local link in ${name} ships in package.json files`, unshippedLinks.join(', '))
}

// ---------------------------------------------------------------------------------------------
// 4. its own packaging contract (see the header): a repository guard must not be shipped, because the
//    artifacts it checks against do not exist inside the npm tarball.
// ---------------------------------------------------------------------------------------------
ok(!(pkg.files || []).includes('tests/audit-market-metadata.test.mjs'),
  'this repository-only guard is NOT listed in package.json files (it cannot run inside the tarball)',
  'if it is shipped, the publish verification fails in the extracted package: the images it checks are repo artifacts, not tarball contents')
ok((pkg.files || []).includes('screenshots.json'),
  'screenshots.json itself IS shipped (it documents the market contract for anyone who installs the package)')

console.log('')
console.log('=== MARKET METADATA: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
