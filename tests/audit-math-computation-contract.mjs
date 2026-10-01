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
// MC_CONTRACT_ROOT points the guard at a MUTATED copy of the tree (used by the round-4 item-3
// mutant, which must delete 'Formal/Jobs' from one preset without touching the repo).
const ROOT = process.env.MC_CONTRACT_ROOT ? resolve(String(process.env.MC_CONTRACT_ROOT)) : REPO
// The shared defaults are the reference for AUDIT-B #6 (no preset may hold a drifting literal).
const M = await import(new URL('../vibe-math-v2/math-computation.js', import.meta.url).href)
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
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

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
  // AUDIT-B #7: check the PROPERTY, not the prose. The set tool's description string naturally
  // contains every parameter name, so an indexOf over the whole registration call stays green even
  // when a property is renamed. Only the `objParams({...})` argument counts.
  const SET_TOOL = P.dir === 'vibe-math-v2' || P.dir === 'vibe-math-v3'
    ? "registerTool('vibe_math_set_params'"
    : (P.dir === 'vibe-math-v4' ? "registerTool('vibe_v4_set'" : "registerTool('vibe_v5_set'")
  {
    const i = js.indexOf(SET_TOOL)
    const callText = i === -1 ? '' : js.slice(i, js.indexOf('registerTool(', i + 1) === -1 ? i + 4000 : js.indexOf('registerTool(', i + 1))
    const oi = callText.lastIndexOf('objParams(')
    const setSchema = oi === -1 ? '' : callText.slice(oi)
    ok(setSchema.length > 0, tag + 'set tool takes an objParams({...}) schema argument')
    for (const k of SIX) {
      ok(new RegExp('(^|[{,\\s])' + k + '\\s*:').test(setSchema), tag + 'set schema has the property ' + k + ' (property-level, not prose)', 'schema len ' + setSchema.length)
    }
  }
  if (P.dir === 'vibe-math-v2' || P.dir === 'vibe-math-v3') {
    const schema = arrayBlock(js, 'const PARAM_SCHEMA')
    for (const k of SIX) ok(schema.indexOf(k) !== -1, tag + 'PARAM_SCHEMA documents ' + k)
  } else if (P.dir === 'vibe-math-v5') {
    const visible = block(js, 'function visibleParams()', '\n    }')
    for (const k of SIX) ok(visible.indexOf(k) !== -1, tag + 'visibleParams exposes ' + k)
  }

  // AUDIT-B #6: the presets' exposed DEFAULTS must come from the shared MATH_PARAM_DEFAULTS, so the
  // four copies cannot drift (v4 had a literal `mathPackages: []`). Arrays must be referenced and
  // sliced; scalar literals must equal the shared value.
  {
    const defs = block(js, 'const DEFAULT_PARAMS', '\n  }')
    for (const k of SIX) {
      if (new RegExp('MATH_PARAM_DEFAULTS\\.' + k + '\\b').test(defs)) continue
      if (Array.isArray(M.MATH_PARAM_DEFAULTS[k])) {
        ok(false, tag + 'DEFAULT_PARAMS.' + k + ' must reference MATH_PARAM_DEFAULTS (array literals drift)')
        continue
      }
      const m = new RegExp(k + ":\\s*(?:'([^']*)'|(\\d+))").exec(defs)
      const val = m ? (m[1] !== undefined ? m[1] : Number(m[2])) : undefined
      ok(val === M.MATH_PARAM_DEFAULTS[k], tag + 'DEFAULT_PARAMS.' + k + ' literal must equal the shared default', 'got ' + JSON.stringify(val) + ' want ' + JSON.stringify(M.MATH_PARAM_DEFAULTS[k]))
    }
  }

  // round-4 item 3: `Formal/Jobs` (the async Lean job mirror) must be in EVERY preset's ensureDirs.
  // The host creates missing parents, so this is a consistency/discoverability pin, not a
  // correctness one - but deleting it from v4 also leaves the Lean suites green, so nothing else
  // would notice the four presets drifting apart.
  {
    // Match the ensureDirs/dirs-creation FUNCTION body (not a comment, and not the unrelated
    // verification-only dirs list that legitimately carries 'Formal' without 'Formal/Jobs').
    const lines = js.split(/\r?\n/)
    const start = lines.findIndex((l) => /function\s+(ensureDirs|mkdirs)\s*\(/.test(l))
    const window = start === -1 ? '' : lines.slice(start, start + 15).join('\n')
    ok(start !== -1, tag + 'has an ensureDirs()/mkdirs() function')
    ok(window.indexOf("'Formal/Jobs'") !== -1, tag + "ensureDirs creates 'Formal/Jobs' (async Lean job mirror)")
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

  // 4c. round-6 (A): both blocks must carry the substitution-honesty rule (zh, plus en on v4/v5).
  const subZh = blocks.filter((b) => b.indexOf('替代必须声明') !== -1).length
  ok(subZh >= 2, tag + 'both persona blocks carry the substitution-honesty rule (zh)', 'blocks with the rule: ' + subZh)
  if (P.dir === 'vibe-math-v4' || P.dir === 'vibe-math-v5') {
    const subEn = blocks.filter((b) => b.indexOf('Declare substitutions') !== -1).length
    ok(subEn >= 2, tag + 'both persona blocks carry the substitution-honesty rule (en)', 'blocks with the rule: ' + subEn)
  }
  ok(js.indexOf('MATH_SUBSTITUTION_RULE_LINE') !== -1, tag + 'references MATH_SUBSTITUTION_RULE_LINE (zh persona text source)')
  if (P.dir === 'vibe-math-v4' || P.dir === 'vibe-math-v5') ok(js.indexOf('MATH_ARCHIVE_WORKFLOW_LINE_EN') !== -1, tag + 'references MATH_ARCHIVE_WORKFLOW_LINE_EN (en persona text source)')

  // 4d. round-7 (fix 2): every preset must wire the bundled-runtime discovery seam, otherwise a
  // machine whose only interpreter is DSH's own runtime still reports MATH_ENGINE_NOT_FOUND.
  ok(js.indexOf('runtimeRoots') !== -1 && js.indexOf('listDirAbs') !== -1, tag + 'wires runtimeRoots + listDirAbs (DSH bundled-runtime discovery)')
}

// 5. README (both languages) document the six parameters
for (const f of ['README.md', 'README.en.md']) {
  const md = existsSync(join(ROOT, f)) ? read(f) : ''
  for (const k of SIX) ok(md.indexOf(k) !== -1, f + ' documents ' + k)
  ok(/math-computation\.md|math_computation/.test(md), f + ' links the math_computation feature')
}

// 6. AUDIT-A/C honesty disclosures must not silently disappear from the contract doc.
{
  const doc = existsSync(join(ROOT, 'docs/math-computation.md')) ? read('docs/math-computation.md') : ''
  ok(doc.indexOf('字符串级') !== -1 && doc.indexOf('不解析符号链接') !== -1, 'docs §6 states the path guard is string-level and does not resolve links/junctions')
  ok(doc.indexOf('只通过假 subprocess seam 验证') !== -1, 'docs §6 states engine execution is verified only through the fake subprocess seam')
  ok(doc.indexOf('串行') !== -1 && doc.indexOf('跨进程') !== -1, 'docs §6 states the in-process serialisation and the cross-process limitation')
}

console.log('')
console.log('=== MATH COMPUTATION CONTRACT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { for (const f of failures.slice(0, 25)) console.error('  - ' + f); if (failures.length > 25) console.error('  … ' + (failures.length - 25) + ' more') }
process.exit(failed === 0 ? 0 : 1)
