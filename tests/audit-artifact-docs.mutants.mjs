#!/usr/bin/env node
/**
 * Mutant harness for tests/audit-artifact-docs.mjs (ships: `tests/*.mutants.mjs`).
 *
 * Two single-site mutations, ONE PER DIRECTION (the guard must bite both ways):
 *   A) a COPY of README.md whose v2/v3 brace list loses `paper.lock.json`  -> the listing assertion reddens
 *   B) a COPY of vibe-math-v4.js that mentions `paper.lock.json`           -> the "writers are exactly v2,v3"
 *      assertion reddens (i.e. if v4 ever gains the artifact, the docs expectation moves with the code)
 *
 * Run: node tests/audit-artifact-docs.mutants.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const GUARD = join(HERE, 'audit-artifact-docs.mjs')
const ARTIFACT = 'paper.lock.json'
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }

const run = (env) => {
  const r = spawnSync(process.execPath, [GUARD], { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) })
  const out = String(r.stdout || '') + String(r.stderr || '')
  return { status: r.status, out, failLines: out.split('\n').filter((l) => /^  - /.test(l)) }
}
const baseline = run(null)
ok(baseline.status === 0, 'baseline: the artifact-docs guard is green',
  (baseline.out.trim().split('\n').filter(Boolean).slice(-1)[0] || '').slice(0, 80))

const dir = mkdtempSync(join(tmpdir(), 'artifact-mut-'))
// A) README loses the v2/v3 brace listing
const zh = readFileSync(join(REPO, 'README.md'), 'utf8')
const braces = zh.match(/Paper\/<[^>]*>\/\{[^}]*paper\.lock\.json[^}]*\}/g) || []
if (!braces.length) ok(false, 'A: the README v2/v3 brace listing exists (harness and guard agree on the shape)', 'ANCHOR MISS')
else {
  const tampered = zh.split(braces[0]).join(braces[0].replace(',' + ARTIFACT, ''))
  writeFileSync(join(dir, 'README.md'), tampered)
  const a = run({ ARTIFACT_README: join(dir, 'README.md') })
  const named = a.failLines.some((l) => l.indexOf('lists ' + ARTIFACT + ' inside the v2/v3 artifact braces') !== -1)
  ok(a.status !== 0 && named, '★ A: dropping the artifact from the v2/v3 brace list reddens the guard by name', 'exit=' + a.status)
  if (!named) for (const l of a.failLines.slice(0, 3)) console.log('      guard failure: ' + l.trim().slice(0, 130))
}
// B) v4 "gains" the artifact
const v4 = readFileSync(join(REPO, 'vibe-math-v4/vibe-math-v4.js'), 'utf8')
writeFileSync(join(dir, 'vibe-math-v4.js'), v4 + '\n// mutant: pretend v4 writes ' + ARTIFACT + '\n')
const b = run({ ARTIFACT_V4_JS: join(dir, 'vibe-math-v4.js') })
const namedB = b.failLines.some((l) => l.indexOf('the writing presets are exactly v2,v3') !== -1)
ok(b.status !== 0 && namedB, '★ B: a v4 that mentions the artifact reddens the "writers are exactly v2,v3" assertion', 'exit=' + b.status)
if (!namedB) for (const l of b.failLines.slice(0, 3)) console.log('      guard failure: ' + l.trim().slice(0, 130))

// ---- issue #10: the install/upgrade docs must keep teaching the pnpm prerequisite and an EXPLICIT
// version, and must never present `@latest` as the recipe. One single-site mutation per requirement.
const zhAll = readFileSync(join(REPO, 'README.md'), 'utf8')
const enAll = readFileSync(join(REPO, 'README.en.md'), 'utf8')
const probes = [
  {
    tag: 'C',
    file: 'README-c.md',
    env: { ARTIFACT_README: null },
    from: /^> \*\*前置\*\*：[^\n]*$/m,
    to: '> 前置未写明。',
    expect: 'states the `pnpm` prerequisite',
    what: 'dropping the pnpm prerequisite',
  },
  {
    tag: 'D',
    file: 'README-d.md',
    env: { ARTIFACT_README: null },
    from: 'add dsh-vibe-math@<版本>',
    to: 'add dsh-vibe-math@latest',
    expect: 'never presents `dsh-vibe-math@latest`',
    what: 'teaching `@latest` as the install/upgrade command',
  },
  {
    tag: 'E',
    file: 'README-e.md',
    env: { ARTIFACT_README: null },
    from: 'hub.log',
    to: '安装日志',
    expect: 'points at ~/.dsh/profiles/<profile>/hub.log',
    what: 'dropping the hub.log pointer',
  },
  {
    tag: 'F',
    file: 'README-f.md',
    env: { ARTIFACT_README_EN: null },
    from: '### Install/upgrade troubleshooting (pnpm and versions)',
    to: '### Install/upgrade notes',
    expect: 'carries an install/upgrade troubleshooting section',
    what: 'dropping the troubleshooting section',
  },
  {
    tag: 'G',
    file: 'compat-doc.md',
    env: { ARTIFACT_INSTALL_DOC: null },
    from: 'add dsh-vibe-math@<版本>',
    to: 'add dsh-vibe-math',
    expect: 'shows the explicit-version install/upgrade',
    what: 'dropping the explicit version from the install/upgrade doc',
    doc: 'docs/COMPAT-AUDIT-ROUND2.md',
  },
]
for (const p of probes) {
  const base = p.doc ? readFileSync(join(REPO, p.doc), 'utf8') : (p.tag === 'F' ? enAll : zhAll)
  const anchor = p.from instanceof RegExp ? (base.match(p.from) || [])[0] : p.from
  const n = anchor ? base.split(anchor).length - 1 : 0
  const anchorOk = !!anchor && n >= 1
  ok(anchorOk, p.tag + ': the anchor for ' + p.what + ' exists (harness and guard agree)', 'ANCHOR MISS')
  if (!anchorOk) continue
  writeFileSync(join(dir, p.file), base.split(anchor).join(p.to))
  const envKey = Object.keys(p.env)[0]
  const r = run({ [envKey]: join(dir, p.file) })
  const named = r.failLines.some((l) => l.indexOf(p.expect) !== -1)
  ok(r.status !== 0 && named, '★ ' + p.tag + ': ' + p.what + ' reddens the guard by name', 'exit=' + r.status)
  if (!named) for (const l of r.failLines.slice(0, 3)) console.log('      guard failure: ' + l.trim().slice(0, 130))
}

rmSync(dir, { recursive: true, force: true })
console.log('')
console.log('=== ARTIFACT DOCS MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)