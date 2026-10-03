#!/usr/bin/env node
/**
 * Mutant harness for the two v2 harness-gap rows (ships: `tests/*.mutants.mjs`):
 *   F3  v2 `vibe_math_list_agents` — the tool must EXIST and be MENTIONED
 *   F4  v2 require-gate — a refusal must carry an EXECUTABLE NEXT STEP
 *
 * Each case copies the v2 preset (and, for the persona case, all four preset dirs) into a private root,
 * applies ONE logical mutation, drives the SHIPPED owning suite through its own seam, and requires a NAMED
 * red. Every target suite also runs GREEN on the unmutated copies first (faithful-copy baseline), so the
 * mutation is the only red cause. Seams used: MC_V2_PLUGIN, V2_PLUGIN, PERSONA_ROOT.
 *
 * Run: node tests/v2-list-agents-and-next-step.mutants.mjs
 */
import { mkdtempSync, cpSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const PRESETS = ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5']
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }

function runSuite(file, env) {
  const r = spawnSync(process.execPath, [join(HERE, file)], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, env || {}) })
  const o = String(r.stdout || '') + String(r.stderr || '')
  return {
    status: r.status, out: o,
    failLines: o.split('\n').filter((l) => /^\s*(FAIL|  FAIL)\b/.test(l)),
    sum: (o.split('\n').filter((l) => /passed, \d+ failed/.test(l)).slice(-1)[0] || '').trim(),
  }
}
const named = (r, needle) => r.failLines.some((l) => l.indexOf(needle) !== -1)
const V2_SRC = join(REPO, 'vibe-math-v2', 'vibe-math-v2.js')
const ORIGIN = readFileSync(V2_SRC, 'utf8')
const REGISTER = "registerTool('vibe_math_list_agents'"
const NEXT_STEP = '下一步：把该对象形式化到 Lean 通过'
const COPY_AS = 'vibe_math_list_agentsX'

// ---------- baselines: the shipped suites are green on the COPIED artifacts ----------
const baseRoot = mkdtempSync(join(tmpdir(), 'v2gaps-base-'))
cpSync(join(REPO, 'vibe-math-v2'), join(baseRoot, 'vibe-math-v2'), { recursive: true })
{
  const a = runSuite('math-computation-v2.test.mjs', { MC_V2_PLUGIN: join(baseRoot, 'vibe-math-v2', 'vibe-math-v2.js') })
  ok(a.status === 0, 'baseline: math-computation-v2 is green on the COPIED v2 preset (MC_V2_PLUGIN)', a.sum.slice(0, 60))
  const c = runSuite('v2-fix-probes.test.mjs', { V2_PLUGIN: join(baseRoot, 'vibe-math-v2', 'vibe-math-v2.js') })
  ok(c.status === 0, 'baseline: v2-fix-probes is green on the COPIED v2 preset (V2_PLUGIN)', c.sum.slice(0, 60))
}
{
  const pRoot = mkdtempSync(join(tmpdir(), 'v2gaps-persona-'))
  for (const d of PRESETS) cpSync(join(REPO, d), join(pRoot, d), { recursive: true })
  const p = runSuite('audit-persona-surface.test.mjs', { PERSONA_ROOT: pRoot })
  ok(p.status === 0, 'baseline: audit-persona-surface is green on the COPIED preset tree (PERSONA_ROOT)', p.sum.slice(0, 60))
  rmSync(pRoot, { recursive: true, force: true })
}
rmSync(baseRoot, { recursive: true, force: true })

// ---------- F3a: the tool must EXIST (rename the registration -> the documented call fails) ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'v2gaps-exist-'))
  cpSync(join(REPO, 'vibe-math-v2'), join(dir, 'vibe-math-v2'), { recursive: true })
  const p = join(dir, 'vibe-math-v2', 'vibe-math-v2.js')
  const src = readFileSync(p, 'utf8')
  writeFileSync(p, src.replace(REGISTER, REGISTER.replace('list_agents', 'list_agentsX')))
  const r = runSuite('math-computation-v2.test.mjs', { MC_V2_PLUGIN: p })
  ok(r.status !== 0 && named(r, '对照：vibe_math_list_agents 可调用'),
    '★ F3 (exists): renaming the registration reddens the named "list_agents is callable" assertion (unit: tool name)',
    r.sum.slice(0, 70))
  if (!named(r, '对照：vibe_math_list_agents 可调用')) for (const l of r.failLines.slice(0, 3)) console.log('        ' + l.trim().slice(0, 130))
  rmSync(dir, { recursive: true, force: true })
}
// ---------- F3b: the tool must be MENTIONED (persona still names the old name) ----------
{
  const root = mkdtempSync(join(tmpdir(), 'v2gaps-mention-'))
  for (const d of PRESETS) cpSync(join(REPO, d), join(root, d), { recursive: true })
  const p = join(root, 'vibe-math-v2', 'vibe-math-v2.js')
  writeFileSync(p, readFileSync(p, 'utf8').split(REGISTER).join(REGISTER.replace('list_agents', 'list_agentsX')))
  const r = runSuite('audit-persona-surface.test.mjs', { PERSONA_ROOT: root })
  ok(r.status !== 0 && named(r, 'every registered tool is mentioned in the persona, or explicitly allow-listed'),
    '★ F3 (mentioned): a registered tool the persona never names reddens the named allow-list assertion (unit: registered tool names)',
    r.sum.slice(0, 70))
  if (!named(r, 'every registered tool is mentioned in the persona, or explicitly allow-listed')) for (const l of r.failLines.slice(0, 3)) console.log('        ' + l.trim().slice(0, 130))
  rmSync(root, { recursive: true, force: true })
}
// ---------- F4: a require-gate refusal must carry an executable NEXT STEP ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'v2gaps-next-'))
  cpSync(join(REPO, 'vibe-math-v2'), join(dir, 'vibe-math-v2'), { recursive: true })
  const p = join(dir, 'vibe-math-v2', 'vibe-math-v2.js')
  const src = readFileSync(p, 'utf8')
  if (src.indexOf(NEXT_STEP) === -1) ok(false, 'F4: the single-site next-step anchor applies', 'ANCHOR MISS')
  else {
    writeFileSync(p, src.replace(NEXT_STEP, '下一步：见文档'))
    const r = runSuite('v2-fix-probes.test.mjs', { V2_PLUGIN: p })
    ok(r.status !== 0 && named(r, 'require-gate 反馈行携带下一步'),
      '★ F4: dropping the executable next step from the require-gate refusal reddens its named assertion (unit: refusal sites)',
      r.sum.slice(0, 70))
    if (!named(r, 'require-gate 反馈行携带下一步')) for (const l of r.failLines.slice(0, 3)) console.log('        ' + l.trim().slice(0, 130))
  }
  rmSync(dir, { recursive: true, force: true })
}
console.log('')
console.log('=== V2 LIST-AGENTS / NEXT-STEP MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
