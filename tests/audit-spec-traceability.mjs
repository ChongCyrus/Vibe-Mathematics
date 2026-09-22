#!/usr/bin/env node
/**
 * SPEC/README ↔ CODE TRACEABILITY (all four presets).
 *
 * This class of drift has produced real bugs here twice: a `/v4` usage string that advertised a
 * `message` subcommand no branch implemented, and personas that never named registered tools. The
 * rule is asymmetric on purpose:
 *
 *   · a tool the SPEC/README advertises that the code does NOT register  → FAIL (a documented
 *     capability that does not exist is a lie the agent will act on);
 *   · a tool the code registers that the spec never names                   → NOTE (documenting
 *     every member-only tool in the spec is not always desirable, but the gap must be visible);
 *   · the four Lean parameters must be documented in the spec AND the README AND accepted by the
 *     code — a parameter nobody documents cannot be discovered, and one nobody accepts cannot be set.
 *
 * Run: node tests/audit-spec-traceability.mjs [--json]
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const HERE = fileURLToPath(new URL('../', import.meta.url))
const read = (rel) => (existsSync(join(HERE, rel)) ? readFileSync(join(HERE, rel), 'utf8') : null)

const PRESETS = [
  { tag: 'v2', js: 'vibe-math-v2/vibe-math-v2.js', spec: 'vibe-math-v2/实现方案.md', prefix: 'vibe_math_' },
  { tag: 'v3', js: 'vibe-math-v3/vibe-math-v3.js', spec: 'vibe-math-v3/实现方案.md', prefix: 'vibe_math_' },
  { tag: 'v4', js: 'vibe-math-v4/vibe-math-v4.js', spec: 'vibe-math-v4/实现方案.md', prefix: 'vibe_v4_' },
  { tag: 'v5', js: 'vibe-math-v5/vibe-math-v5.js', spec: 'vibe-math-v5/实现方案.md', prefix: 'vibe_v5_' },
]
// Tokens that look like tool names but are FILE names / namespace prose, not tools.
const NOT_A_TOOL = new Set([
  'vibe_math_setting.json', 'vibe_math_installed.json', 'vibe_math_lean', 'vibe_math_lean_',
  'vibe_v4_setting.json', 'vibe_v5_state', 'vibe_v5_state.json', 'vibe_v5_lean', 'vibe_v5_lean_',
  'vibe_v4_lean', 'vibe_v4_lean_', 'vibe_math_state', 'vibe_math_state.json',
])
const LEAN_PARAMS = ['formalVerify', 'leanCommand', 'leanArgs', 'leanTimeoutMs']

const README = read('README.md') || ''
const findings = []
const notes = []
let passed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; return true }
  findings.push(label + (detail ? ' — ' + detail : ''))
  return false
}
// The README documents ALL FOUR presets at once, and v2/v3 share the `vibe_math_` prefix, so a
// repo-wide token is legitimate if ANY preset registers it. The per-preset SPEC is checked strictly
// against that preset's own registry.
const ALL_TOOLS = new Set()
for (const P of PRESETS) {
  const src = read(P.js)
  if (!src) continue
  for (const m of src.matchAll(/registerTool\(\s*'([A-Za-z0-9_]+)'/g)) ALL_TOOLS.add(m[1])
}
/** Collect `vibe_*` tokens that are used as TOOL names (not file names such as vibe_math_setting.json). */
function toolTokens(text) {
  const out = new Set()
  for (const m of text.matchAll(/\b(vibe_(?:math|v4|v5)_[A-Za-z0-9_]+)/g)) {
    const after = text[m.index + m[0].length] || ''
    if (after === '.') continue // a file name, e.g. vibe_math_setting.json
    // A doc may name a tool precisely to say it does NOT exist ("v4 没有 vibe_v4_propose_verify 这个工具",
    // "写了不存在的工具 …"). That is documentation of the fix, not a phantom capability — skip it, or
    // the guard would forbid the very sentence that records the correction.
    const lineStart = text.lastIndexOf('\n', m.index) + 1
    const lineEnd = text.indexOf('\n', m.index)
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
    if (/没有|不存在|并非|不是工具|未注册|从未注册|无此|does not exist|no such|never registered|not a tool/i.test(line)) continue
    out.add(m[1])
  }
  return out
}

for (const P of PRESETS) {
  const js = read(P.js)
  const spec = read(P.spec)
  if (!js || !spec) { findings.push(P.tag + ': missing plugin or spec file'); continue }

  const codeTools = new Set([...js.matchAll(/registerTool\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]))
  ok(codeTools.size > 0, P.tag + ': the plugin registers tools at all')

  // direction 1 (FAIL): anything the spec names as a tool must exist in THIS preset; anything the
  // README names must exist in at least one preset (the README covers all four).
  for (const [label, text, own] of [['实现方案', spec, true], ['README', README, false]]) {
    for (const t of toolTokens(text)) {
      if (NOT_A_TOOL.has(t)) continue
      if (t.endsWith('_')) continue // a `vibe_x_*` wildcard placeholder
      if (!t.startsWith(P.prefix)) continue
      const known = own ? codeTools.has(t) : ALL_TOOLS.has(t)
      if (!known) {
        findings.push(P.tag + ' [' + label + ']: documents tool ' + t
          + (own ? ' but the plugin never registers it' : ' but NO preset registers it'))
      }
    }
  }

  // direction 2 (NOTE): registered but not documented anywhere
  const md = spec + '\n' + README
  const undocumented = [...codeTools].filter((t) => !md.includes(t)).sort()
  if (undocumented.length) notes.push(P.tag + ': registered but not named in spec/README: ' + undocumented.join(', '))

  // the four Lean parameters: documented in spec + README, and accepted by the code
  for (const prm of LEAN_PARAMS) {
    ok(spec.includes(prm), P.tag + ': 实现方案 documents ' + prm)
    ok(README.includes(prm), P.tag + ': README documents ' + prm)
    ok(js.includes(prm), P.tag + ': the plugin accepts ' + prm)
  }

  // the Lean tools must appear in the spec's tool table AND in the code
  for (const t of [P.prefix + 'lean_run', P.prefix + 'lean_archive', P.prefix + 'lean_lib']) {
    ok(codeTools.has(t), P.tag + ': registers ' + t)
    ok(spec.includes(t), P.tag + ': 实现方案 names ' + t)
  }

  // the contract §7 requires an ACTIVE stop on timeout: `handle.terminate()`. Relying on the
  // host's `graceMs` alone lets a runaway Lean process linger while the framework reports
  // LEAN_TIMEOUT — three of four presets shipped that way, so this is now guarded statically.
  ok(/terminate\s*\(/.test(js), P.tag + ': the Lean run path actively terminates on timeout (contract §7)')

  // the contract §8 puts the `require` gate at the ONE choke point that writes a Verified card.
  // A card writer reachable WITHOUT passing a gated function would be a gate bypass, i.e. the
  // framework could conclude a verdict that `require` is supposed to withhold.
  {
    const cfg = {
      v2: { writers: ['writeVerifiedCardIfNeeded', 'writeVerifiedProblemCardIfNeeded'], gate: /formalRequired\s*\(|formalGateOk\s*\(|formalVerdictDeferred\s*\(/ },
      v3: { writers: ['writeVerifiedCardIfChanged', 'writeVerifiedPropositionCardIfNeeded', 'writeVerifiedProblemCardIfNeeded'], gate: /formalBlocksConclusion\s*\(/ },
      v4: { writers: ['writeVerifiedCard'], gate: /formalGateOk\s*\(/ },
      v5: { writers: ['writeVerifiedCard'], gate: /formalGateOk\s*\(/ },
    }[P.tag]
    const lines = js.split(/\r?\n/)
    const fns = []
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/.exec(lines[i])
      if (m) fns.push({ name: m[2], indent: m[1].length, start: i })
    }
    for (let k = 0; k < fns.length; k++) {
      const f = fns[k]
      let end = lines.length
      for (const g of fns) if (g.start > f.start && g.indent <= f.indent) { end = g.start; break }
      f.body = lines.slice(f.start, end).join('\n')
    }
    const byName = (n) => fns.find((f) => f.name === n)
    for (const w of cfg.writers) {
      const f = byName(w)
      if (!f) { ok(false, P.tag + ' §8: the documented card writer ' + w + ' does not exist'); continue }
      const selfGated = cfg.gate.test(f.body)
      const callers = fns.filter((g) => g !== f && new RegExp('(^|[^A-Za-z0-9_$])' + w + '\\s*\\(').test(g.body))
      const allCallersGatedOrRecursive = callers.length > 0 && callers.every((c) => cfg.gate.test(c.body) || fns.some((d) => cfg.gate.test(d.body) && new RegExp('(^|[^A-Za-z0-9_$])' + c.name + '\\s*\\(').test(d.body)))
      ok(selfGated || allCallersGatedOrRecursive,
        P.tag + ' §8: ' + w + ' is reachable only through a gated function (no gate bypass)',
        'callers: ' + callers.map((c) => c.name).join(', '))
    }
  }

  notes.push(P.tag + ': ' + codeTools.size + ' tools registered; spec ' + spec.length + 'B')
}

// cross-preset: the shared contract must name the four parameters too
const contract = read('docs/formal-verification.md') || ''
for (const prm of LEAN_PARAMS) ok(contract.includes(prm), 'contract documents ' + prm)

// The §4 transition table is the normative statement every preset implements. Two rows were WRONG
// here (the code was right, the contract was not), and a wrong contract is how the next edit gets
// written:
//   · `used` must NOT withdraw an established proof (only a fidelity `defect` does). v2 actually
//     shipped the downgrade, so the contract literal and reality disagreed in opposite directions.
//   · a RED re-archive of kind='proof' overwrites the work file, so the old archived proof no longer
//     corresponds to any code — it must be retracted, not left at the "everyone looks here" path.
{
  const usedRow = (contract.split(/\r?\n/).find((l) => /decision:'used'/.test(l)) || '')
  ok(/不得/.test(usedRow) && /passed/.test(usedRow) && /blocked/.test(usedRow),
    "contract §4: the `used` row says an existing passed/blocked is PRESERVED (only `defect` retracts)",
    'row: ' + usedRow.slice(0, 120))
  const runRows = contract.split(/\r?\n/).filter((l) => /^\|\s*`lean_run`/.test(l))
  ok(runRows.length >= 2 && runRows.every((l) => /不降级|保持原状/.test(l)),
    'contract §4: both `lean_run` rows say they do not downgrade an existing passed/blocked',
    'rows: ' + runRows.map((l) => l.slice(0, 60)).join(' || '))
  ok(/该文件最近一次运行\*\*失败\*\*/.test(contract) && /撤回/.test(contract),
    'contract §4: a FAILED proof re-archive is documented as retracting the previous archived proof')
}

const out = { passed, failed: findings.length, findings, notes }
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2))
else {
  console.log('-- spec/README ↔ code traceability --')
  for (const n of notes) console.log('  note ' + n)
  console.log('')
  for (const f of findings) console.error('  FAIL ' + f)
  console.log('')
  console.log('TRACEABILITY: ' + passed + ' passed, ' + findings.length + ' failed')
}
process.exit(findings.length === 0 ? 0 : 1)
