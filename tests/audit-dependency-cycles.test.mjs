// tests/audit-dependency-cycles.test.mjs — R14's last face, dependency cycles.
//
// WHY THIS ONE IS STRICT WHERE THE SIZE GATE IS STAGED. "A cycle" needs no domain decision: a module that reaches itself by
// following its own imports is a cycle, full stop. And the framework measures ZERO today - one hundred and five files,
// one hundred and twenty-eight internal import edges, no cycle. So this gate asserts the clean state directly rather than
// recording a backlog, and the only thing it needed was a definition, which the language already provides.
//
// A cycle is not a style question. It makes load order decide behaviour, it makes a module impossible to read on its own,
// and in an ESM framework it can turn into a temporal-dead-zone failure that depends on which entry point ran first.
//
// Run: node tests/audit-dependency-cycles.test.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { stripComments } from './_lib/strip-comments.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

/**
 * ROUND 10 (Lead's report: this gate treated a COMMENT as an import). The detector used to run
 * `(?:import|export)[^'"\n]*from '…'` over RAW text, so a line inside a comment - `resume.js` carried
 * `//   import { contentDigest } from './resume.js'` while explaining a digest helper - was read as a real edge
 * and produced a SELF-CYCLE `resume.js -> resume.js`. The gate was right to fire, its INPUT was wrong, and the
 * repair at the time was to reword the comment: a gate dictating prose. Real imports are STATEMENTS, so the same
 * criterion `audit-package-membership` uses applies here: strip comments first, then require statement position.
 */
const IMPORT_STATEMENT = /^[ \t]*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm
const SIDE_EFFECT_IMPORT = /^[ \t]*import\s+['"]([^'"]+)['"]/gm
export function relativeImportsOf(source) {
  const clean = stripComments(String(source))
  const out = new Set()
  for (const m of clean.matchAll(IMPORT_STATEMENT)) if (m[1].startsWith('.')) out.add(m[1])
  for (const m of clean.matchAll(SIDE_EFFECT_IMPORT)) if (m[1].startsWith('.')) out.add(m[1])
  return [...out]
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}

const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).flatMap((e) => {
  const r = join(d, e.name)
  if (e.isDirectory()) return /(^|\/)(\.git|node_modules)$/.test(r) ? [] : walk(r)
  return [r]
})

/** Build the import graph over the framework's own .js files. */
function graphOf(files) {
  const g = new Map()
  for (const f of files) {
    const t = readFileSync(join(REPO, f), 'utf8')
    const deps = new Set()
    for (const spec of relativeImportsOf(t)) {
      let p = resolve(join(REPO, dirname(f)), spec)
      if (!p.endsWith('.js')) p += '.js'
      const rel = p.replace(/\\/g, '/').replace(REPO.replace(/\\/g, '/') + '/', '')
      if (files.includes(rel)) deps.add(rel)
    }
    g.set(f, [...deps])
  }
  return g
}

/** Every cycle reachable, by DFS with three colours - grey means "on the current path", which is the definition. */
function cyclesOf(nodes, g) {
  const WHITE = 0, GREY = 1, BLACK = 2
  const colour = new Map(nodes.map((n) => [n, WHITE]))
  const found = []
  const stack = []
  const visit = (f) => {
    colour.set(f, GREY); stack.push(f)
    for (const d of g.get(f) || []) {
      if (colour.get(d) === GREY) found.push(stack.slice(stack.indexOf(d)).concat(d).join(' -> '))
      else if (colour.get(d) === WHITE) visit(d)
    }
    stack.pop(); colour.set(f, BLACK)
  }
  for (const n of nodes) if (colour.get(n) === WHITE) visit(n)
  return found
}

console.log('=== 1. THE PREDICATE IS SHOWN BOTH WAYS, on synthetic graphs ===')
const cyc = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']]])
const acyc = new Map([['a', ['b']], ['b', ['c']], ['c', []]])
ok(cyclesOf(['a', 'b', 'c'], cyc).length === 1, 'a graph shaped a -> b -> c -> a has exactly one cycle, so the detector fires')
ok(cyclesOf(['a', 'b', 'c'], acyc).length === 0, 'and the same shape without the last edge has none, so it discriminates rather than always firing')

console.log('=== 1b. SELF-PROBE: the criterion reads STATEMENTS, not prose ===')
{
  const OLD = /(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]/g
  const samples = {
    commented: "//   import { contentDigest } from './resume.js'\nconst x = 1\n",
    blockComment: "/*\nimport { a } from './a.js'\n*/\nconst y = 2\n",
    dataString: "const s = \"import { z } from './z.js'\"\n",
    realSingle: "import { a } from './a.js'\n",
    realMulti: "import {\n  b,\n  c,\n} from './b.js'\n",
    realSideEffect: "import './side.js'\n",
    realReexport: "export { d } from './d.js'\n",
  }
  const mine = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, relativeImportsOf(v)]))
  const old = (s) => [...String(s).matchAll(OLD)].map((m) => m[1]).filter((x) => x.startsWith('.'))
  ok(mine.commented.length === 0 && mine.blockComment.length === 0 && mine.dataString.length === 0,
    '★ SELF-PROBE: an import SHAPE inside a line comment, a block comment or a DATA STRING is NOT an import - the exact false positive that reported `resume.js -> resume.js`',
    mine)
  ok(mine.realSingle.length === 1 && mine.realMulti.length === 1 && mine.realSideEffect.length === 1 && mine.realReexport.length === 1,
    '★ and every REAL spelling is still found: single-line, MULTI-LINE, side-effect, and re-export',
    mine)
  ok(old(samples.commented).length === 1 || old(samples.blockComment).length === 1,
    '★ and the OLD pattern really did count the commented shape (so this criterion fixes a live blind spot, not a hypothetical one)',
    { oldOnCommented: old(samples.commented), oldOnBlock: old(samples.blockComment) })
}

console.log('=== 2. THE FRAMEWORK HAS NO DEPENDENCY CYCLE ===')
const files = walk('vibe-math-vmu').filter((f) => f.endsWith('.js')).map((f) => f.replace(/\\/g, '/'))
const g = graphOf(files)
const edges = [...g.values()].reduce((a, b) => a + b.length, 0)
ok(files.length > 50 && edges > 50, 'the graph is real, not empty', { files: files.length, edges })
const cycles = cyclesOf(files, g)
ok(cycles.length === 0,
  'NOT ONE of the ' + files.length + ' framework files reaches itself by following its imports (' + edges + ' internal edges, 0 cycles) - R14 last face holds by measurement rather than by assertion',
  { cycles: cycles.slice(0, 4) })

console.log('=== 3. THE RULE IS THE FRAMEWORKS, NOT THIS FILES ===')
const doc = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '11-gates-and-development.md'), 'utf8')
ok(doc.includes('循环依赖'), 'docs/11 still names the cycle face of R14, so the rule comes from the requirement rather than from this gate')

console.log('=== DEPENDENCY CYCLES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
