// ============================================================================================
// math_computation — CROSS-PRESET CONTRACT guard (integration owner).
//
// Proves that all four presets wired the frozen shared interface the same way:
//   - each imports ./math-computation.js and registers the tool through its own registration path(s);
//   - each carries the six frozen parameter names in DEFAULT_PARAMS, its normaliser call, its
//     parameter schema(s) and (v5) its CLOSED set schema + visibleParams;
//   - each references the frozen prompt text constants (description / persona line / rule lines /
//     availability line), so the shell-fallback marking and the criteria cannot silently disappear;
//   - both persona blocks (prefix + text) list the tool;
//   - the bilingual README documents the six parameters.
//
// Falsifiable: a preset that drops a param, forgets the second registration layer, or stops using
// the frozen prompt text turns this suite RED. It is intentionally stricter than any single preset
// suite - it is the cross-preset part no owner can weaken alone.
//
// Usage: node tests/audit-math-computation-contract.mjs
// ============================================================================================
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const PRESETS = [
  { dir: 'vibe-math-v2', designator: 'vibe-math-v2', dualRegistration: true },
  { dir: 'vibe-math-v3', designator: 'vibe-math-v3', dualRegistration: true },
  { dir: 'vibe-math-v4', designator: 'vibe-math-v4', dualRegistration: false },
  { dir: 'vibe-math-v5', designator: 'vibe-math-v5', dualRegistration: false },
]
const SIX = ['mathComputation', 'mathMode', 'mathEngines', 'mathTimeoutMs', 'mathPackages', 'mathInstallScope']

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  return false
}
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')

function block(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker)
  if (i === -1) return ''
  const j = endMarker ? src.indexOf(endMarker, i) : -1
  return j === -1 ? src.slice(i, i + 4000) : src.slice(i, j)
}
// A literal array assignment (e.g. `const PARAM_SCHEMA = [ … ]`) must be sliced to the CLOSING
// bracket of the assignment, not to the first `]` inside it (that is an inner `options: [...]`).
// The presets indent the closing bracket on its own line at two spaces, which is stable and does
// not need a brace-aware parser.
// A literal array assignment (e.g. `const PARAM_SCHEMA = [ … ]`) must be sliced to the CLOSING
// bracket of the assignment, not to the first `]` inside it (that is an inner `options: [...]`).
function arrayBlock(src, startMarker) {
  const i = src.indexOf(startMarker)
  if (i === -1) return ''
  const j = src.indexOf('\n  ]', i)
  return j === -1 ? src.slice(i, i + 4000) : src.slice(i, j)
}
// A registration call (`registerTool('vibe_v5_set', '<long description>', objParams({…}))`) can
// contain `})` inside its description string, so slice to the closing bracket on its own line
// (two-space indent) instead of the first `})`.
function callBlock(src, startMarker) {
  const i = src.indexOf(startMarker)
  if (i === -1) return ''
  const j = src.indexOf('\n  })', i)
  if (j !== -1) return src.slice(i, j)
  const k = src.indexOf('})', i)
  return k === -1 ? src.slice(i, i + 4000) : src.slice(i, k)
}

console.log('-- math_computation cross-preset contract --')

for (const P of PRESETS) {
  const js = read(P.dir + '/' + P.dir + '.js')
  const tag = P.dir + ': '

  // 1. import + registration
  ok(js.indexOf("'./math-computation.js'") !== -1, tag + 'imports the shared module')
  ok(js.indexOf('registerMathComputation(') !== -1, tag + 'calls registerMathComputation(host)')
  if (P.dualRegistration) {
    // v2/v3 register every tool twice: the session handlers layer and the apply-level layer.
    const defs = (js.match(/function registerTool\s*\(/g) || []).length
    ok(defs >= 2, tag + 'has both registerTool definition layers', 'found ' + defs)
  }

  // 2. six params everywhere
  const defaults = block(js, 'const DEFAULT_PARAMS', '\n  }')
  for (const k of SIX) ok(defaults.indexOf(k) !== -1, tag + 'DEFAULT_PARAMS holds ' + k)
  ok(js.indexOf('normalizeMathParams(') !== -1, tag + 'normalises through normalizeMathParams()')

  // parameter schemas: v2/v3 PARAM_SCHEMA + two set_params schemas; v4 vibe_v4_set; v5 closed set + visibleParams
  if (P.dir === 'vibe-math-v2' || P.dir === 'vibe-math-v3') {
    const schema = arrayBlock(js, 'const PARAM_SCHEMA')
    for (const k of SIX) ok(schema.indexOf(k) !== -1, tag + 'PARAM_SCHEMA documents ' + k)
    const occurrences = {}
    for (const k of SIX) occurrences[k] = (js.match(new RegExp(k, 'g')) || []).length
    for (const k of SIX) ok(occurrences[k] >= 3, tag + k + ' appears in defaults + schema + both set schemas', 'count ' + occurrences[k])
  } else if (P.dir === 'vibe-math-v4') {
    const setBlock = callBlock(js, "registerTool('vibe_v4_set'")
    for (const k of SIX) ok(setBlock.indexOf(k) !== -1, tag + 'vibe_v4_set schema/description carries ' + k)
  } else {
    const setBlock = callBlock(js, "registerTool('vibe_v5_set'")
    for (const k of SIX) ok(setBlock.indexOf(k) !== -1, tag + 'vibe_v5_set CLOSED set carries ' + k)
    const visible = block(js, 'function visibleParams()', '\n    }')
    for (const k of SIX) ok(visible.indexOf(k) !== -1, tag + 'visibleParams exposes ' + k)
  }

  // 3. frozen prompt text constants are actually used
  ok(js.indexOf('MATH_TOOL_DESCRIPTION') !== -1, tag + 'uses MATH_TOOL_DESCRIPTION')
  ok(js.indexOf('MATH_PERSONA_TOOL_LINE') !== -1, tag + 'uses MATH_PERSONA_TOOL_LINE')
  ok(js.indexOf('MATH_RULE_LINES') !== -1, tag + 'uses MATH_RULE_LINES')
  ok(js.indexOf('mathAvailabilityLine(') !== -1, tag + 'builds the availability line (carries the shell marking)')
  if (P.dir === 'vibe-math-v4' || P.dir === 'vibe-math-v5') ok(js.indexOf('MATH_RULE_LINES_EN') !== -1, tag + 'bilingual rule lines referenced')

  // 4. persona: both literal blocks list the tool
  const yml = read(P.dir + '/agent.cordis.yml')
  const blocks = yml.split(/\n\s*(?:prefix|text):\s*\|/)
  const hits = blocks.filter((b) => b.indexOf('math_computation') !== -1).length
  ok(hits >= 2, tag + 'both persona blocks (prefix + text) list math_computation', 'blocks with the tool: ' + hits)

  // 4b. P2a: both blocks must carry the archive -> edit -> re-run rule (scriptChanged + mode:'file').
  const wf = blocks.filter((b) => b.indexOf('scriptChanged') !== -1 && b.indexOf("mode:'file'") !== -1).length
  ok(wf >= 2, tag + 'both persona blocks carry the archive->edit->re-run rule (scriptChanged + mode:file)', 'blocks with the rule: ' + wf)
  ok(js.indexOf('MATH_ARCHIVE_WORKFLOW_LINE') !== -1, tag + 'references MATH_ARCHIVE_WORKFLOW_LINE (zh persona text source)')
  if (P.dir === 'vibe-math-v4' || P.dir === 'vibe-math-v5') ok(js.indexOf('MATH_ARCHIVE_WORKFLOW_LINE_EN') !== -1, tag + 'references MATH_ARCHIVE_WORKFLOW_LINE_EN (en persona text source)')
}

// 5. README (both languages) document the six parameters
for (const f of ['README.md', 'README.en.md']) {
  const md = existsSync(join(REPO, f)) ? read(f) : ''
  for (const k of SIX) ok(md.indexOf(k) !== -1, f + ' documents ' + k)
  ok(/math-computation\.md|math_computation/.test(md), f + ' links the math_computation feature')
}

console.log('')
console.log('=== MATH COMPUTATION CONTRACT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { for (const f of failures.slice(0, 25)) console.error('  - ' + f); if (failures.length > 25) console.error('  … ' + (failures.length - 25) + ' more') }
process.exit(failed === 0 ? 0 : 1)
