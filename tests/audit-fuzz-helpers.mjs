/**
 * Robustness (fuzz) pass over the plugins' PURE helpers.
 *
 * These functions parse model-authored Markdown and JSON into the knowledge base.
 * A model can emit almost anything, so they must never throw and never invent
 * structure. This imports each plugin module and hammers the pure helpers it exposes
 * through its `__testHelpers` seam with hostile inputs.
 *
 * The helpers used to be discovered by walking the plugin's source text, cutting the
 * declarations out with brace matching and compiling them through the Function
 * constructor. That is dynamic code execution (DANGEROUS_DYNAMIC_EXECUTION in a
 * plugin-catalog security scan) and it fuzzed a re-compiled copy. The plugins now
 * declare those helpers at module scope and export them through a documented test seam,
 * so this harness fuzzes the REAL module instances -- the same function objects
 * `apply()` closes over.
 *
 * Usage: node tests/audit-fuzz-helpers.mjs
 */
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const FILES = {
  'vibe-math-v2': `${REPO}/vibe-math-v2/vibe-math-v2.js`,
  'vibe-math-v3': `${REPO}/vibe-math-v3/vibe-math-v3.js`,
  'vibe-math-v4': `${REPO}/vibe-math-v4/vibe-math-v4.js`,
  'vibe-math-v5': `${REPO}/vibe-math-v5/vibe-math-v5.js`,
  'vibe-math-v5r': `${REPO}/vibe-math-v5r/vibe-math-v5r.js`,
};

const HOSTILE = [
  '', ' ', '\n', '\r\n', 'null', 'undefined', '{}', '[]', '[', ']', '{', '}',
  '```json\n', '```json\n{}\n```', '```json\nnot json\n```',
  '# 标题\n', '- ID: \n- ID:\n- ID: ../../etc\n', '### 解法 1｜\n## 陈述\n',
  'a'.repeat(10000), '\u0000', '\uD800', '😀'.repeat(50), '\t\t\t',
  '- 概率: NaN\n- 概率: Infinity\n- 概率: -1\n- 概率: 2\n',
  '- 依赖: [not json]\n', ' -  ID :  x  \n', '###\n###\n###\n',
  '{"a":1}{"b":2}', 'NaN', 'Infinity', '-0',
  // reaches two branches nothing else can (v3): parseAppTitle's `### 应用 N｜…` gate and the
  // improvements mapping inside parseMethodMd's `### vN（…）` gate.
  '### 应用 1｜问题q1 方向d1\n正文\n### 应用 2｜问题q2\n\n### v2（改进原因）\n改进了\n',
];

const NUMERIC = [undefined, null, NaN, Infinity, -Infinity, 0, -0, -1, 1, 1e308, -1e308, '0', '1e999', '', [], {}, 'NaN'];

/** The genuinely fuzzable surface: text/JSON in, structure out. */
const NAMES = ['parseJson', 'safeJson', 'stripJsonComments', 'slugify', 'safeId', 'idSafe',
  'clamp01', 'parseProgress', 'blocksToText', 'parseReply', 'parseMethodMd', 'tryJson',
  'cl', 'clPct', 'posMs', 'shortId', 'uuid', 'fmtTime',
  'splitHeader', 'splitSections'];

let passed = 0;
let failed = 0;
const problems = [];

function check(preset, fn, input, thunk) {
  try {
    const out = thunk();
    // a parser must never return a dangling promise
    if (out && typeof out.then === 'function') {
      problems.push(`${preset}.${fn}(${JSON.stringify(input).slice(0, 40)}) returned a Promise from a pure helper`);
      failed += 1;
    } else passed += 1;
  } catch (e) {
    problems.push(`${preset}.${fn}(${JSON.stringify(input).slice(0, 40)}) THREW: ${(e && e.message) || e}`);
    failed += 1;
  }
}

for (const [preset, file] of Object.entries(FILES)) {
  const mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
  const helpers = mod.__testHelpers;
  if (!helpers) {
    console.log(`  (${preset}: module does not export __testHelpers)`);
    failed += 1;
    continue;
  }

  /** Only the seed names are fuzzed directly; any other exported helper is a dependency. */
  const FUZZED = new Set(NAMES);
  const fuzzable = Object.keys(helpers).filter((n) => typeof helpers[n] === 'function');

  const fuzzed = [...FUZZED].filter((n) => typeof helpers[n] === 'function');
  console.log(`\n=== ${preset} — ${fuzzable.length} helpers exported, ${fuzzed.length} fuzzed ===`);
  for (const name of fuzzed) {
    const fn = helpers[name];
    const isNumeric = /^(clamp01|cl|clPct|posMs|shortId|uuid|fmtTime)$/.test(name);
    const inputs = isNumeric ? NUMERIC : HOSTILE;
    for (const input of inputs) {
      check(preset, name, input, () => fn(input));
      // also exercise the (input, fallback) arity where the helper takes one
      check(preset, name, input, () => fn(input, input));
    }
  }
}

console.log('\n=== fuzz findings ===');
if (problems.length === 0) console.log('  (none — no helper threw or returned a Promise)');
else for (const p of problems.slice(0, 40)) console.log('  ! ' + p);

console.log(`\n=== FUZZ RESULT: ${passed} invocations clean, ${failed} problem(s) ===`);
console.log('  Note: "clean" means did not throw. It does not assert the parsed VALUE is');
console.log('  sensible — that is what the e2e round-trip suites cover.');
process.exitCode = failed === 0 ? 0 : 1;
