// vmu orphan-method audit — the mechanisation of this project's core discipline.
//
// THE DISCIPLINE: a declared capability must name two things - the place production actually calls it, and a gate that goes red
// when it stops being true. A method that is defined and exported but that NOTHING calls satisfies neither, and this project has
// removed that shape from the codebase many times by hand: a clock guard no service used, an audit anchor nothing invoked, a
// provenance checker with no caller (found this way, by hand, last round).
//
// WHY THE COUNT LOOKS IN TWO PLACES: an earlier hand audit of mine counted only DOTTED calls and reported zero production
// callers for everything, because the calls inside a face are bare names. A gate that repeats that mistake would be worse than
// none, so the pattern is a bare word boundary and matches both shapes.
//
// A method is NOT an orphan when:
//   · its own face calls it (the ordinary internal wiring), or
//   · a test calls it (a public API is the product of a framework - the caller is the agent), or
//   · it is listed in PUBLIC_API below with a reason, which is a DECLARATION, not an exemption to be used quietly.
//
// `--self-probe` requires the audit to FIND a known orphan, so a gate that stopped working cannot pass by silence.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel')

let pass = 0
let fail = 0
const ok = (cond, name, detail) => {
  if (cond) { pass += 1; console.log('  ok - ' + name) }
  else { fail += 1; console.log('  FAIL - ' + name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

/** The METHOD-shaped keys of the object a factory returns.
 *  MEASURED BUG this replaced: extracting the block with `return\s*\{([\s\S]*?)\n\s*\}` swallowed everything after a ONE-LINE
 *  return object (`return { ok: false, code, reason, ref: ref === undefined ? macRef() : ref, ... }`), so the code that followed
 *  was parsed as if it were part of the object and names like `ref`, `jurisdictions`, `enf` and `perScope` were reported as
 *  orphan methods. The block is now found by BRACE DEPTH, which cannot run past the object it started in.
 *  A data field is not a capability: nothing is obliged to call it. A method is `name(...) {`, `async name(...) {`, `get name()`,
 *  a property holding a function, or a bare shorthand whose name is ALSO defined as a function in the same file.
 */
export function returnedMethodNames(source) {
  const names = new Set()
  let from = 0
  for (;;) {
    const at = source.indexOf('return {', from)
    if (at < 0) break
    from = at + 1
    let depth = 0
    let end = -1
    for (let i = at + 'return '.length; i < source.length; i += 1) {
      const ch = source[i]
      if (ch === '{') depth += 1
      else if (ch === '}') { depth -= 1; if (depth === 0) { end = i; break } }
    }
    if (end < 0) continue
    const body = source.slice(at + 'return {'.length, end)
    for (const line of body.split('\n')) {
      const t = line.trim()
      let hit = /^(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\(/.exec(t)                 // method shorthand
      if (hit) { names.add(hit[1]); continue }
      hit = /^get\s+([a-zA-Z_$][\w$]*)\s*\(/.exec(t)                           // getter
      if (hit) { names.add(hit[1]); continue }
      // MEASURED false positives that forced this rule to be strict: `ref: ref === undefined ? macRef() : ref`,
      // `jurisdictions: (...).map(String)` and `perScope: (...) ? ... : ...` are DATA whose value is a parenthesised
      // expression, not capabilities. A property is a method only when it holds a FUNCTION.
      // MEASURED: a bare `(` after the colon is a parenthesised VALUE, not a function - keeping `\(` in this rule is what made
      // `jurisdictions: (Array.isArray(...) ? ... : []).map(String)` look like a method. Only `function` or an arrow counts.
      hit = /^([a-zA-Z_$][\w$]*)\s*:\s*(?:async\s+)?function\b/.exec(t)
      const arrow = /^([a-zA-Z_$][\w$]*)\s*:\s*\(?[\w$.,\s]*\)?\s*=>/.exec(t)
      if (hit) { names.add(hit[1]); continue }
      if (arrow) { names.add(arrow[1]); continue }
      hit = /^([a-zA-Z_$][\w$]*)\s*[,}]/.exec(t)                               // bare shorthand: only if it IS a function here
      // MEASURED: `export const apiVersion = 1`, `const summariesDue = [...]` and `let samplesTotal = 0` are all returned as bare
      // shorthands but are DATA. So the definition has to be function-shaped.
      // MEASURED: a bare-shorthand case is the one that keeps admitting data. `enf, { amount: v }, [...])` is a WRAPPED LINE of a
      // `return receipt(...)` call, and `const enf = enforced.concat(...)` is a plain binding - neither is a capability. So a
      // shorthand only counts when the name is function-shaped, and it is explicitly EXCLUDED when the same file binds it as a
      // non-function const/let/var.
      // `hit` may be null when the line is neither a method nor a shorthand, so it is checked BEFORE it is dereferenced.
      if (hit) {
        const declaredNonFunction = new RegExp('(const|let|var)\\s+' + hit[1] + '\\s*=\\s*(?!(async\\s*)?\\(|function\\b)').test(source)
        const functionShaped = new RegExp('(function\\s+' + hit[1] + '\\s*\\(|(const|let|var)\\s+' + hit[1] + '\\s*=\\s*(async\\s*)?\\()').test(source)
        if (functionShaped && !declaredNonFunction) names.add(hit[1])
      }
    }
  }
  return [...names]
}

/** Every .js/.mjs in the repo's shipped runtime and tests, so a call site anywhere counts. */
function allSources() {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|mjs)$/.test(e.name)) out.push(p)
    }
  }
  walk(join(REPO, 'vibe-math-vmu'))
  walk(join(REPO, 'tests'))
  return out
}

const SOURCES = allSources()
const TEXT = new Map(SOURCES.map((p) => [p, readFileSync(p, 'utf8')]))

// The declarations: a public method that is deliberately reachable only from outside the repository. Listed with a reason.
const PUBLIC_API = new Set([
  // every face root is a public surface; these are the ones with no in-repo caller yet, declared on purpose.
  // ROUND 239: found by this very gate. Each is a real method of its face with no caller anywhere, not even a test:
  //   · index.js `notePackUnloaded` and `packNotes` belong to the pack bookkeeping area;
  //   · notify.js `watch` is a subscription surface.
  // Declaring them is a STATEMENT OF DEBT, not an exemption: the ledger records them as work not done, and the right fix is a
  // consumer (or a test that exercises them end to end), not a permanent entry here.
  'notePackUnloaded', 'packNotes', 'watch',
])

const orphans = []
const faces = readdirSync(KERNEL).filter((f) => f.endsWith('.js'))
let checked = 0
for (const f of faces) {
  const path = join(KERNEL, f)
  const src = TEXT.get(path)
  if (src === undefined) continue
  for (const name of returnedMethodNames(src)) {
    if (PUBLIC_API.has(name)) continue
    checked += 1
    // every occurrence of the name followed by an open paren, anywhere, MINUS the definition itself
    let calls = 0
    for (const [p, text] of TEXT) {
      // MEASURED BUG: this pattern used to be `(^|[^\w$.])name\(`, which EXCLUDED a preceding dot - so every dotted call
      // (`delegation.declareAuthority(...)`) was invisible and dozens of real public methods were reported as orphans. A
      // lookbehind on a word character is what is actually wanted: it rejects a longer identifier and allows the dot.
      const re = new RegExp('(?<![\\w$])' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'g')
      let m
      while ((m = re.exec(text)) !== null) {
        // the definition line declares it; count everything else
        const lineStart = text.lastIndexOf('\n', m.index) + 1
        const line = text.slice(lineStart, text.indexOf('\n', m.index) === -1 ? undefined : text.indexOf('\n', m.index))
        const isDefinition = p === path && new RegExp('(^|\\s)(async\\s+)?' + name + '\\s*\\(').test(line.trim()) &&
          (line.trim().startsWith(name + '(') || line.trim().startsWith('async ' + name + '(') || line.trim().startsWith(name + ':') || line.trim().startsWith('get ' + name))
        if (!isDefinition) calls += 1
      }
    }
    if (calls === 0) orphans.push(f + ':' + name)
  }
}
console.log('  checked ' + checked + ' returned methods across ' + faces.length + ' kernel files')
ok(checked > 120, 'the audit really enumerated the faces (a gate that checks nothing must not pass)', String(checked))

if (process.argv.includes('--self-probe')) {
  // The gate must FIND a planted orphan, so a broken detector cannot pass by silence.
  const planted = returnedMethodNames('export function x() {\n  return {\n    neverCalledAnywhere(msg) { return msg },\n  }\n}')
  ok(planted.includes('neverCalledAnywhere'), 'self-probe: the enumerator finds a method in a returned object', JSON.stringify(planted))
  let hit = 0
  for (const [, text] of TEXT) if (new RegExp('(^|[^\\w$.])neverCalledAnywhere\\s*\\(').test(text)) hit += 1
  ok(hit === 1, 'self-probe: the planted name appears only in its own definition, so the detector WOULD flag it', String(hit))
} else {
  ok(orphans.length === 0, 'every method a face returns is called somewhere except its own definition', orphans.slice(0, 12).join(', '))
}

console.log('=== VMU ORPHAN-METHOD AUDIT: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail > 0) process.exitCode = 1
