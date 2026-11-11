/**
 * The doc linter must answer the same way on a clean clone as it does on the laptop that carries the
 * workspace's out-of-repo material (RUN 272, TB-2744).
 *
 * WHY THIS EXISTS. The first CI run this repository ever had (GitHub Actions run 43073739104, head
 * c8a4b415) was red in `static gates` at `node scripts/preflight.mjs`. The cause was not the product:
 * `scripts/check-docs.mjs` scanned the workspace root's `_oneoff/vmu/design` on top of the repository,
 * so `01-v5r-reuse-map.md` and `02-dsh-official-guidelines.md` counted as "known documents" on this
 * machine and vanished on a clean clone. A gate that borrows a fact from the machine is not a gate: it
 * was green here and red there, and the bad part is that being green here was the accident.
 *
 * WHAT IS PINNED HERE, AND WHY EACH PART IS SEPARATE:
 *   1. the SOURCE may not scan outside the repository again (a one-line regression would re-open it);
 *   2. the CONTENT the linter judges (the design volumes) may not cite an out-of-repo volume by bare file
 *      name — such a citation must carry its workspace path (`_oneoff/vmu/design/NN-….md`), which the
 *      linter's file-reference pattern does not match, so it can never masquerade as an in-repo document.
 *      Historical reports under the repository's own `docs/acceptance/` are NOT in this scope on purpose:
 *      they are the record of past rounds, and rewriting the record to make a judge happy is the opposite
 *      of a fix (the linter never judged them, and this test does not pretend otherwise);
 *   3. the LINTER itself, run against a copy of the repository with no out-of-repo material anywhere near
 *      it, is green — and the same copy turns red the moment a bare out-of-repo citation is added, which
 *      is what proves the judgment still bites instead of having been quietly widened.
 *
 * Run: node tests/audit-doc-lint-reproducible.test.mjs
 */
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LINTER = join(REPO, 'scripts', 'check-docs.mjs')
const DOCS = join(REPO, 'vibe-math-vmu', 'docs')

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : '  ->  ' + JSON.stringify(detail))) }
}

// ---- §0 the source stops at the repository boundary ------------------------------------------------
{
  const src = readFileSync(LINTER, 'utf8')
  // Top-level calls only: `scanMd(p, n + 1)` is the recursion INSIDE the scanner, not a root.
  const scans = src.split('\n').filter((l) => /^scanMd\(/.test(l)).map((l) => l.replace(/^scanMd\(/, '').replace(/\)\s*$/, '').trim())
  ok(scans.length === 2, '§0a check-docs.mjs has exactly two scan roots (the design volumes and the repository)', scans)
  ok(!scans.some((s) => s.includes('_oneoff')), '§0b no scan root leaves the repository (_oneoff is outside version control)', scans)
  ok(!/scanMd\(path\.resolve\(HERE/.test(src), '§0c the removed call cannot come back through a resolve() expression')
  ok(src.includes('THE SCAN STOPS AT THE REPOSITORY BOUNDARY'), '§0d the boundary is explained in the source, not just implemented')
  ok(src.includes('CI run 43073739104'), '§0e the comment names the run that caught it (a rule without its failure is folklore)')
}

// ---- §1 the design volumes never cite an out-of-repo file by bare name -----------------------------
const FILE_REF = /`([0-9]{2}-[A-Za-z0-9-]+\.md)`/g
const walkMd = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walkMd(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}
const inRepoMd = walkMd(REPO)
const inRepoNames = new Set(inRepoMd.map((p) => p.split(sep).pop()))
{
  // The two names the old scan used to borrow: they must NOT be in the repository, or this whole scenario
  // has quietly changed shape and the citations below would be judged against the wrong fact.
  ok(!inRepoNames.has('01-v5r-reuse-map.md'), '§1a 01-v5r-reuse-map.md really is absent from the repository')
  ok(!inRepoNames.has('02-dsh-official-guidelines.md'), '§1b 02-dsh-official-guidelines.md really is absent from the repository')

  const designVolumes = readdirSync(DOCS).filter((f) => f.endsWith('.md')).map((f) => join(DOCS, f))
  const bare = []
  for (const p of designVolumes) {
    for (const m of readFileSync(p, 'utf8').matchAll(FILE_REF)) {
      if (!inRepoNames.has(m[1])) bare.push(relative(REPO, p) + ' -> ' + m[1])
    }
  }
  ok(bare.length === 0, '§1c no design volume cites a bare file name that only exists outside version control', bare.slice(0, 8))
  ok(!bare.some((b) => b.includes('01-v5r-reuse-map')), '§1d 01-v5r-reuse-map.md is never cited bare')
  ok(!bare.some((b) => b.includes('02-dsh-official-guidelines')), '§1e 02-dsh-official-guidelines.md is never cited bare')

  // And the qualified form the fix uses is really there, so a future edit cannot "solve" §1c by deleting
  // the citation and pretending the design volume never existed.
  const qualified = designVolumes.filter((p) => /_oneoff\/vmu\/design\/0[12]-/.test(readFileSync(p, 'utf8'))).map((p) => relative(REPO, p))
  ok(qualified.length >= 2, '§1f the out-of-repo volumes are still cited — with their workspace path', qualified)
}

// ---- §2 behaviour: green in a tree with no out-of-repo material, and still bites --------------------
const copyRepoForLint = () => {
  const root = mkdtempSync(join(tmpdir(), 'tb2744-doclint-'))
  // A full copy MINUS version control: the linter reads the repository, so the copy has to be the
  // repository — copying a hand-picked subset would test my guess about its inputs, not its answer.
  cpSync(REPO, root, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) })
  return root
}
const runLinter = (root) => {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'check-docs.mjs')], { cwd: root, encoding: 'utf8' })
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }
}
{
  const root = copyRepoForLint()
  ok(existsSync(join(root, 'vibe-math-vmu', 'kernel', 'library.js')), '§2a the simulated tree carries the modules the linter reads')
  ok(!existsSync(join(root, '_oneoff')), '§2b the simulated tree carries no out-of-repo material at all')

  const clean = runLinter(root)
  ok(clean.status === 0, '§2c the linter is green on a tree with nothing outside the repository', { status: clean.status, tail: clean.out.split('\n').filter(Boolean).slice(-3) })
  ok(/issues=0/.test(clean.out), '§2d and it reports zero issues (not zero by accident of a skipped scan)', clean.out.split('\n').find((l) => l.includes('issues=')))

  // The bite: a bare citation of an out-of-repo volume must red D4. If this stays green, the boundary
  // change did not narrow the judgment — it switched it off.
  const probe = join(root, 'vibe-math-vmu', 'docs', '00-README.md')
  writeFileSync(probe, readFileSync(probe, 'utf8') + '\n\n> probe: 见 `02-dsh-official-guidelines.md`。\n')
  const dirty = runLinter(root)
  ok(dirty.status !== 0, '§2e a bare out-of-repo citation turns the linter red (the judgment still bites)', { status: dirty.status })
  ok(dirty.out.includes('02-dsh-official-guidelines.md') && /D4/.test(dirty.out), '§2f and it says which file and which rule', dirty.out.split('\n').filter((l) => l.includes('D4')).slice(0, 3))

  // The other direction: the same citation WITH its workspace path is fine, because a reader of the
  // repository can be told where to look, and version control is no longer asked to carry the file.
  writeFileSync(probe, readFileSync(probe, 'utf8').replace('见 `02-dsh-official-guidelines.md`', '见仓外 `_oneoff/vmu/design/02-dsh-official-guidelines.md`'))
  const qualified = runLinter(root)
  ok(qualified.status === 0, '§2g the path-qualified citation is accepted (the fix has a legal form)', { status: qualified.status })
}

console.log('\n=== audit-doc-lint-reproducible: ' + passed + ' passed, ' + failed + ' failed ===')
assert.equal(failed, 0, failed + ' assertion(s) failed')
