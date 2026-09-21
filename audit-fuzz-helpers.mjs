/**
 * Robustness (fuzz) pass over the plugins' PURE helpers.
 *
 * These functions parse model-authored Markdown and JSON into the knowledge base.
 * A model can emit almost anything, so they must never throw and never invent
 * structure. This loads each plugin's real implementation text and hammers the
 * pure helpers with hostile inputs.
 *
 * Usage: node audit-fuzz-helpers.mjs
 */
import { readFile } from 'node:fs/promises';

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics';
const FILES = {
  'vibe-math-v2': `${REPO}/vibe-math-v2/vibe-math-v2.js`,
  'vibe-math-v3': `${REPO}/vibe-math-v3/vibe-math-v3.js`,
  'vibe-math-v4': `${REPO}/vibe-math-v4/vibe-math-v4.js`,
};

/** Pull a `function name(...) {...}` body declared at EXACTLY `indent` spaces. */
function grabFunction(src, name, indent) {
  const pad = ' '.repeat(indent);
  const start = src.indexOf(`${pad}function ${name}(`);
  if (start < 0) return undefined;
  // reject an async or generator declaration (its body may await)
  const head = src.slice(start, start + 60);
  if (/async\s/.test(head) || /\*/.test(src.slice(start, src.indexOf('(', start)))) return undefined;
  let i = src.indexOf('{', start);
  if (i < 0) return undefined;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(start, j + 1) }
  }
  return undefined;
}

const HOSTILE = [
  '', ' ', '\n', '\r\n', 'null', 'undefined', '{}', '[]', '[', ']', '{', '}',
  '```json\n', '```json\n{}\n```', '```json\nnot json\n```',
  '# 标题\n', '- ID: \n- ID:\n- ID: ../../etc\n', '### 解法 1｜\n## 陈述\n',
  'a'.repeat(10000), '\u0000', '\uD800', '😀'.repeat(50), '\t\t\t',
  '- 概率: NaN\n- 概率: Infinity\n- 概率: -1\n- 概率: 2\n',
  '- 依赖: [not json]\n', ' -  ID :  x  \n', '###\n###\n###\n',
  '{"a":1}{"b":2}', 'NaN', 'Infinity', '-0',
];

const NUMERIC = [undefined, null, NaN, Infinity, -Infinity, 0, -0, -1, 1, 1e308, -1e308, '0', '1e999', '', [], {}, 'NaN'];

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
  const src = await readFile(file, 'utf8');

  // --- pure string/json helpers present in all three ---
  // --- single-argument pure helpers present in the plugins (the genuinely
  // fuzzable surface: text/JSON in, structure out) ---
  const names = ['parseJson', 'safeJson', 'stripJsonComments', 'slugify', 'safeId', 'idSafe',
    'clamp01', 'parseProgress', 'blocksToText', 'parseReply', 'parseMethodMd', 'tryJson',
    'cl', 'clPct', 'posMs', 'shortId', 'uuid', 'fmtTime',
    'splitHeader', 'splitSections'];
  /** Helpers pulled in for dependency reasons are NOT fuzzed directly. */
  const FUZZED = new Set(names);
  const defs = [];
  const addDef = (n) => {
    if (defs.some((d) => d.name === n)) return;
    for (const indent of [4, 2]) {
      const body = grabFunction(src, n, indent);
      if (body && !/\bawait\b/.test(body)) { defs.push({ name: n, body }); return }
    }
  };
  for (const n of names) addDef(n);
  // Pull in whatever the extracted bodies reference, so the subset is self-contained
  // (a helper calling another helper is not a product defect).
  for (let round = 0; round < 6; round++) {
    const referenced = new Set();
    for (const d of defs) {
      for (const m of d.body.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)) {
        const n = m[1];
        if (['function', 'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'String',
          'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'parseInt', 'parseFloat',
          'isNaN', 'isFinite', 'Set', 'Map', 'Promise', 'RegExp', 'Error', 'encodeURIComponent',
          'decodeURIComponent', 'setTimeout', 'clearTimeout', 'require', 'console'].includes(n)) continue;
        referenced.add(n);
      }
    }
    let grew = false;
    for (const n of referenced) { const before = defs.length; addDef(n); if (defs.length > before) grew = true }
    if (!grew) break;
  }

  let factory;
  try {
    const decls = defs.map((d) => d.body).join('\n');
    factory = new Function(`${decls}\nreturn {${defs.map((d) => d.name).join(',')}};`);
  } catch (e) {
    console.log(`  (${preset}: could not compile helper subset: ${(e && e.message) || e})`);
    continue;
  }
  let helpers;
  try { helpers = factory() } catch (e) { console.log(`  (${preset}: factory threw: ${(e && e.message) || e})`); continue }

  console.log(`\n=== ${preset} — ${Object.keys(helpers).length} helpers compiled, ${[...FUZZED].filter((n) => typeof helpers[n] === 'function').length} fuzzed ===`);
  for (const [name, fn] of Object.entries(helpers)) {
    if (typeof fn !== 'function') continue;
    if (!FUZZED.has(name)) continue;
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
