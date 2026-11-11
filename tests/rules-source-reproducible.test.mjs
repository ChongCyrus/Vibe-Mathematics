/**
 * The rules ledger must be checkable on a clean clone, not only on the laptop that carries the master
 * copy of the rules document (RUN 272, TB-2745).
 *
 * WHY THIS EXISTS. The second CI run (GitHub Actions run 43080516326, head 206274c1) was red at
 * `node scripts/check-rules-coverage.mjs --check`, the repository's closing gate for the user's
 * sentence-by-sentence audit. The cause was again not the product: `docs/acceptance/rules-ledger.json`
 * named its source only by an absolute path outside the repository
 * (`D:/wd/vibemath开发/宏观层面v5r运行规则.md`), so the gate could read the document here and could not
 * read it anywhere else. A closing gate that cannot run on a clean checkout is not a closing gate; it is
 * a local ritual that happens to print PASS.
 *
 * WHAT IS PINNED HERE, AND WHY EACH PART IS SEPARATE:
 *   1. the ledger now ALSO names the document by a version-controlled path (`source.pathRelative`), and
 *      that copy really is the document the ledger was audited against — its sha256 equals
 *      `source.revision` and its line count equals `source.lineCount`. A copy that has silently drifted
 *      from the audit pin would be worse than no copy;
 *   2. when the master copy is present beside the repository (the laptop case) it must still be the SAME
 *      bytes, so "the copy in the repo" cannot quietly become a stale snapshot of a document the user
 *      has since edited; when it is absent (the clean-clone case, by definition) that comparison prints
 *      a named NOTE rather than pretending to have compared something;
 *   3. the closing gate itself, run against a copy of the repository in which BOTH absolute source paths
 *      are pointed at a path that does not exist (exactly what CI has), is green — and the same copy with
 *      the vendored document removed turns red, which is what proves the fallback is real rather than the
 *      gate having stopped reading its source.
 *
 * Run: node tests/rules-source-reproducible.test.mjs
 */
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = join(REPO, 'docs', 'acceptance', 'rules-ledger.json')
const VENDORED = join(REPO, 'docs', 'acceptance', 'v5r-rules-source.md')
const MASTER = resolve(REPO, '..', '宏观层面v5r运行规则.md') // workspace root, outside version control

let passed = 0
let failed = 0
let notes = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : '  ->  ' + JSON.stringify(detail))) }
}
const note = (msg) => { notes += 1; console.log('  NOTE ' + msg) }
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// ---- §0 the ledger names a version-controlled copy, and that copy is the audited document -----------
{
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'))
  const source = ledger.source || {}
  ok(typeof source.pathRelative === 'string' && source.pathRelative.trim() !== '', '§0a the ledger names its source by a repository-relative path (source.pathRelative)')
  ok(source.pathRelative === 'docs/acceptance/v5r-rules-source.md', '§0b and that path is the vendored document', source.pathRelative)
  ok(existsSync(VENDORED), '§0c the vendored document really exists in the repository')

  const bytes = readFileSync(VENDORED)
  ok(sha256(bytes) === source.revision, '§0d the vendored bytes are exactly the document the ledger was audited against (sha256 === source.revision)', { vendored: sha256(bytes).slice(0, 16), pinned: String(source.revision).slice(0, 16) })
  const lines = bytes.toString('utf8').split(/\r?\n/)
  ok(lines.length === source.lineCount, '§0e and its line count matches the ledger', { got: lines.length, pinned: source.lineCount })
  ok(lines.filter((l) => l.trim() !== '').length > 20, '§0f the vendored document has content, not just a matching hash of emptiness')

  const script = readFileSync(join(REPO, 'scripts', 'check-rules-coverage.mjs'), 'utf8')
  ok(/for \(const key of \['pathRelative', 'path', 'file'\]\)/.test(script), '§0g the gate resolves pathRelative -> path -> file, so the copy it ships is the copy it reads')
  ok(script.includes('pathRelative'), '§0h the fallback is implemented rather than merely mentioned')
}

// ---- §1 the master copy, when present, is still the same document -----------------------------------
{
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'))
  if (existsSync(MASTER)) {
    // Line endings first: this machine keeps the master with CRLF, while .gitattributes (`*.md text eol=lf`)
    // stores and checks out the repository copy with LF. Comparing raw bytes would therefore fail on a document
    // — and an audit — that never changed. Comparing the text with CRLF folded to LF compares the DOCUMENT.
    const fold = (buf) => sha256(Buffer.from(String(buf).replace(/\r\n/g, '\n'), 'utf8'))
    const masterSha = fold(readFileSync(MASTER))
    const vendoredSha = fold(readFileSync(VENDORED))
    ok(masterSha === vendoredSha, '§1a the workspace master and the vendored copy are the same text (line endings aside; a re-audit must re-vendor)', { master: masterSha.slice(0, 16), vendored: vendoredSha.slice(0, 16) })
    ok(sha256(readFileSync(VENDORED)) === ledger.source.revision, '§1b and the committed copy, as stored, equals the ledger revision pin')
    ok(!/\r/.test(readFileSync(VENDORED, 'utf8')), '§1c the vendored copy carries no CR bytes: the pin is the bytes git stores, not the ones this laptop happened to write')
  } else {
    // The clean-clone case. This is NOT a pass: there is no master to compare, which is precisely why the
    // vendored copy exists. Saying so out loud keeps "not compared" from reading as "compared, fine".
    note('§1 the workspace master is not present beside the repository (clean-clone case): the vendored copy is the only source, and §0d is what pins it')
  }
}

// ---- §2 the closing gate is green where CI runs, and still reds when its source is gone -------------
const copyRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'tb2745-rules-'))
  cpSync(REPO, root, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) })
  return root
}
const runGate = (root) => {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'check-rules-coverage.mjs'), '--check'], { cwd: root, encoding: 'utf8' })
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }
}
const hideAbsoluteSources = (root) => {
  // Point BOTH absolute source names at a path that cannot exist, which is the only difference between
  // this machine and a hosted runner: the master document is not there.
  const path = join(root, 'docs', 'acceptance', 'rules-ledger.json')
  const ledger = JSON.parse(readFileSync(path, 'utf8'))
  ledger.source.path = '/nonexistent/宏观层面v5r运行规则.md'
  ledger.source.file = '/nonexistent/宏观层面v5r运行规则.md'
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n')
}
{
  const rooted = copyRepo()
  hideAbsoluteSources(rooted)
  const clean = runGate(rooted)
  ok(clean.status === 0, '§2a the closing gate is green with no absolute source available (what CI has)', { status: clean.status, tail: clean.out.split('\n').filter(Boolean).slice(-3) })
  ok(/RULES COVERAGE: PASS/.test(clean.out), '§2b and it prints PASS, not a silent skip', clean.out.split('\n').filter((l) => /RULES COVERAGE/.test(l)))

  const bare = copyRepo()
  hideAbsoluteSources(bare)
  rmSync(join(bare, 'docs', 'acceptance', 'v5r-rules-source.md'))
  const broken = runGate(bare)
  ok(broken.status !== 0, '§2c with the vendored copy gone too the gate is red (the fallback is doing real work)', { status: broken.status })
  ok(/VMU_RULES|rule document|source/i.test(broken.out), '§2d and it names the missing source instead of passing quietly', broken.out.split('\n').filter(Boolean).slice(-4))
}

console.log('\n=== rules-source-reproducible: ' + passed + ' passed, ' + failed + ' failed, ' + notes + ' note ===')
assert.equal(failed, 0, failed + ' assertion(s) failed')
