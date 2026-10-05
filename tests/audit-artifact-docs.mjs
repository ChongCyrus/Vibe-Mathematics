#!/usr/bin/env node
/**
 * ARTIFACT DOCS vs CODE — the READMEs and the contract doc must not name an artifact a preset does not
 * write, and must name the ones it does.
 *
 * DEFECT CLASS (D2): `Paper/<id>/paper.lock.json` was listed in the README's v4 section as "the directory's
 * write lock, serialising concurrent rewrites/recompiles" — while v4 writes NO such file and
 * `vibe-math-v4.js` says the shared-file lock is **NOT IMPLEMENTED** ("nothing is reserved, nothing is
 * serialized"). The README promised a mechanism the code explicitly disclaims. The inverse direction
 * matters too: v2/v3 DO write it (vibe-math-v2.js:3725/3732, vibe-math-v3.js:4318/4325) and their
 * sections must list it.
 *
 * Run: node tests/audit-artifact-docs.mjs
 * Env (mutant harness): ARTIFACT_README / ARTIFACT_README_EN / ARTIFACT_DOC / ARTIFACT_INSTALL_DOC /
 * ARTIFACT_V2_JS / ARTIFACT_V3_JS / ARTIFACT_V4_JS / ARTIFACT_V5_JS (absolute or repo-relative).
 *
 * Section 5 (issue #10, plugin-market install failure) guards the INSTALL/UPGRADE docs: DSH forwards
 * plugin installs to pnpm and does not bundle it (missing pnpm ⇒ `exit 1`), and a bare package name is
 * resolved through the profile's package.json / pnpm-lock.yaml, so it can stay on an OLD version —
 * measured: `@latest`, `@^2`, `pnpm update --latest` and `pnpm add …@latest` all failed to upgrade,
 * only an explicit `@<version>` did. Both are outside this package, but the docs must not send a user
 * into either trap (and must never claim `@latest` is the upgrade recipe).
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ARTIFACT = 'paper.lock.json'
let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => { if (cond) passed++; else { failed++; failures.push(label + (detail ? ' — ' + detail : '')) } }

const read = (envName, rel) => {
  const v = process.env[envName]
  return readFileSync(v ? (isAbsolute(v) ? v : join(REPO, v)) : join(REPO, rel), 'utf8')
}
const count = (text, needle) => text.split(needle).length - 1

// 1) CODE TRUTH: which presets write the artifact?
const presets = {
  v2: read('ARTIFACT_V2_JS', 'vibe-math-v2/vibe-math-v2.js'),
  v3: read('ARTIFACT_V3_JS', 'vibe-math-v3/vibe-math-v3.js'),
  v4: read('ARTIFACT_V4_JS', 'vibe-math-v4/vibe-math-v4.js'),
  v5: read('ARTIFACT_V5_JS', 'vibe-math-v5/vibe-math-v5.js'),
}
const writers = Object.keys(presets).filter((k) => count(presets[k], ARTIFACT) > 0)
const nonWriters = Object.keys(presets).filter((k) => count(presets[k], ARTIFACT) === 0)
ok(writers.length > 0, 'at least one preset writes ' + ARTIFACT + ' (else the doc expectation is empty)', JSON.stringify(writers))
ok(writers.join(',') === 'v2,v3', 'the writing presets are exactly v2,v3 (derived from code)', JSON.stringify({ writers, nonWriters }))

// 2) every README mention must sit in a writer's context OR be an explicit denial
const DENY = /(不写|未实现|无此锁|not implemented|does NOT write|no such|not write)/i
for (const [name, envName, rel] of [['README.md', 'ARTIFACT_README', 'README.md'], ['README.en.md', 'ARTIFACT_README_EN', 'README.en.md']]) {
  const lines = read(envName, rel).split(/\r?\n/)
  const mentions = lines.map((l, i) => ({ n: i + 1, l })).filter((x) => x.l.indexOf(ARTIFACT) !== -1)
  ok(mentions.length > 0, name + ' mentions ' + ARTIFACT + ' somewhere (it is a real artifact for v2/v3)')
  const bad = mentions.filter((m) => !/v2|v3/.test(m.l) && !DENY.test(m.l))
  ok(bad.length === 0, '★ ' + name + ': every ' + ARTIFACT + ' mention names a WRITING preset or denies the claim', JSON.stringify(bad.map((b) => b.n)))
  const listed = mentions.filter((m) => /Paper\/<[^>]*>\/\{[^}]*paper\.lock\.json/.test(m.l))
  ok(listed.length >= 2, '★ ' + name + ' lists ' + ARTIFACT + ' inside the v2/v3 artifact braces', 'brace mentions=' + listed.length)
}

// 3) the contract doc must state the scope (v2/v3 write it; v4/v5 do not)
const doc = read('ARTIFACT_DOC', 'docs/final-paper.md')
const docLines = doc.split(/\r?\n/).filter((l) => l.indexOf(ARTIFACT) !== -1)
ok(docLines.length > 0, 'docs/final-paper.md documents ' + ARTIFACT)
const docScope = docLines.some((l) => /v2\/v3/.test(l) && DENY.test(l))
ok(docScope, '★ docs/final-paper.md scopes ' + ARTIFACT + ' to v2/v3 AND states that v4/v5 do not write it', docLines[0] ? docLines[0].slice(0, 80) : '(no line)')

// 4) the non-writer's own disclaimer must exist in code (so the doc denial is backed by the source)
ok(/NOT IMPLEMENTED/.test(presets.v4) && /claim_write/.test(presets.v4),
  'vibe-math-v4.js still carries the explicit NOT-IMPLEMENTED shared-lock disclaimer (the source of the doc denial)')

// 5) INSTALL/UPGRADE DOCS (issue #10): the plugin market forwards installs to pnpm (which DSH does not
// bundle) and resolves a bare package name through the profile's package.json / pnpm-lock.yaml, so the
// install can stay on an OLD version. Both traps are outside this package — but the docs must not walk a
// user into either, and must never present `@latest` as the upgrade recipe (measured ineffective).
const INSTALL_DOC = 'docs/COMPAT-AUDIT-ROUND2.md'
for (const [name, envName, rel] of [['README.md', 'ARTIFACT_README', 'README.md'], ['README.en.md', 'ARTIFACT_README_EN', 'README.en.md']]) {
  const text = read(envName, rel)
  ok(/(\*\*前置\*\*|\*\*Prerequisite\*\*)[^\n]*pnpm/.test(text),
    '★ ' + name + ': states the `pnpm` prerequisite (DSH forwards plugin installs to pnpm and does not bundle it)')
  ok(/hub\.log/.test(text),
    '★ ' + name + ': points at ~/.dsh/profiles/<profile>/hub.log (the failure the market hides)')
  const bare = count(text, 'add dsh-vibe-math')
  const pinned = count(text, 'add dsh-vibe-math@')
  ok(pinned > 0 && bare === pinned,
    '★ ' + name + ': EVERY `add dsh-vibe-math` pins an explicit version (a bare name can stay on an old version)',
    'bare=' + (bare - pinned))
  ok(!/dsh-vibe-math@latest/.test(text),
    '★★ ' + name + ': never presents `dsh-vibe-math@latest` as the install/upgrade recipe (measured ineffective)')
  ok(/^### (安装\/升级排查|Install\/upgrade troubleshooting)/m.test(text),
    '★ ' + name + ': carries an install/upgrade troubleshooting section')
}
const idoc = read('ARTIFACT_INSTALL_DOC', INSTALL_DOC)
ok(/pnpm/.test(idoc) && /hub\.log/.test(idoc),
  '★ ' + INSTALL_DOC + ' documents the pnpm prerequisite AND the hub.log pointer')
ok(/add dsh-vibe-math@/.test(idoc) && !/dsh-vibe-math@latest/.test(idoc),
  '★ ' + INSTALL_DOC + ' shows the explicit-version install/upgrade (and never `@latest`)')
ok(/pnpm-lock\.yaml|package\.json/.test(idoc),
  '★ ' + INSTALL_DOC + ' explains WHY a bare name can stay on an old version (profile package.json / pnpm-lock.yaml wins)')

console.log('')
console.log('=== ARTIFACT DOCS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
