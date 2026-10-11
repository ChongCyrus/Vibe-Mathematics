#!/usr/bin/env node
/**
 * Mutant harness for tests/audit-persona-surface.test.mjs (ships: `tests/*.mutants.mjs`).
 *
 * Converts the dev-only scratch proof (`_oneoff/auditR2/persona-mutant.mjs`) into package-reproducible
 * form: a COPY of the four preset dirs is driven through the guard's `PERSONA_ROOT` seam, so the shipped
 * files are never touched, and one single-site mutation must redden the guard BY NAME.
 *
 * The invariant: "every registered tool is mentioned in the persona, or explicitly allow-listed" — a newly
 * registered tool that the persona never mentions (and the allow-list does not cover) must FAIL.
 *
 * Run: node tests/audit-persona-surface.mutants.mjs
 */
// Explicit filters preserve every fixture while avoiding Node's Windows native directory-copy/ACL path.
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const GUARD = join(HERE, 'audit-persona-surface.test.mjs')
const EXPECT = 'every registered tool is mentioned in the persona, or explicitly allow-listed'
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }

const runGuard = (env) => {
  const r = spawnSync(process.execPath, [GUARD], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, env || {}) })
  const o = String(r.stdout || '') + String(r.stderr || '')
  return { status: r.status, out: o, sum: (o.split('\n').filter((l) => /RESULT:/.test(l)).slice(-1)[0] || '').trim(), failLines: o.split('\n').filter((l) => /^\s*FAIL\b|^  - /.test(l)) }
}

// baseline 1: the real tree
const base = runGuard(null)
ok(base.status === 0, 'baseline: the shipped guard is green on the real tree', base.sum.slice(0, 70))

// baseline 2: the COPIED tree the mutation will use (proves the copy is faithful, not the mutation)
const root = mkdtempSync(join(tmpdir(), 'persona-surface-mut-'))
for (const dir of ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5']) cpSync(join(REPO, dir), join(root, dir), { recursive: true, filter: () => true })
const copyBase = runGuard({ PERSONA_ROOT: root })
ok(copyBase.status === 0, 'baseline: the same guard is green on the copied tree (PERSONA_ROOT seam is faithful)', copyBase.sum.slice(0, 70))

// mutant: register a tool the persona never mentions and the allow-list does not cover
const v2 = join(root, 'vibe-math-v2', 'vibe-math-v2.js')
const src = readFileSync(v2, 'utf8')
const anchor = "registerTool('vibe_math_status'"
if (src.indexOf(anchor) === -1) ok(false, 'the single-site anchor applies (registerTool call site)', 'ANCHOR MISS')
else {
  writeFileSync(v2, src.replace(anchor, "registerTool('vibe_math_brand_new_unmentioned', objParams({}), () => ({ok:true}))\n  " + anchor))
  const mut = runGuard({ PERSONA_ROOT: root })
  const named = mut.out.split('\n').some((l) => l.indexOf(EXPECT) !== -1)
  ok(mut.status !== 0 && named, '★ a newly registered, unmentioned tool reddens the guard by name (unit: registered tool names)', mut.sum.slice(0, 80))
  if (!named) for (const l of mut.failLines.slice(0, 4)) console.log('        ' + l.trim().slice(0, 140))
}
// Stronger seam evidence than "green on the copy" (R17): DELETE a preset dir from a FRESH copy and the
// guard must fail with ENOENT naming the COPIED path — that proves the seam is actually READ, rather than
// the guard silently falling back to the real tree (which would make the mutation case above meaningless).
const root2 = mkdtempSync(join(tmpdir(), 'persona-surface-seam-'))
for (const dir of ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v5']) cpSync(join(REPO, dir), join(root2, dir), { recursive: true, filter: () => true })
const missing = runGuard({ PERSONA_ROOT: root2 })
const namesCopiedPath = missing.out.indexOf(root2) !== -1 && /ENOENT/.test(missing.out)
ok(missing.status !== 0 && namesCopiedPath,
  '★ seam is READ: removing a preset from the copy makes the guard fail with ENOENT on the COPIED path (unit: ENOENT paths)',
  'exit=' + missing.status + ' namesCopied=' + namesCopiedPath)
rmSync(root2, { recursive: true, force: true })
rmSync(root, { recursive: true, force: true })
console.log('')
console.log('=== PERSONA SURFACE MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
