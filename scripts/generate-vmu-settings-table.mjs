#!/usr/bin/env node
// vmu settings table generator — docs/04 §11 discipline ③: the table must not be a second hand-written
// copy of the schema. This script DERIVES it from SETTING_DEFS, so a key can never exist in one place and
// be missing (or stale) in the other.
//
// Usage:
//   node scripts/generate-vmu-settings-table.mjs --write   rewrite the table from the schema
//   node scripts/generate-vmu-settings-table.mjs --check   fail if the file is not exactly what the schema yields
//
// The generated shape matches the documented columns exactly: 键 | 类型 | 默认 | 域 | 作用域 | H | 谁 | 接线 | 说明.
// The 说明 column is the schema's own `doc` string - the single source of truth, typed next to the key.
//
// THE 接线 (WIRED) COLUMN. A declared key that no runtime code reads is a knob the manual promises and the
// code does not keep: a reader changes it, gets `ok:true`, and nothing happens. The column is therefore
// COMPUTED, not written by hand - a key is `✅ 已接线` when its literal appears in the runtime sources
// (kernel/**, packs/**, the entry, and the host adapters) and `⚠️ 未接线` otherwise. `settings/schema.js`
// declares keys, so it is never a consumer; `math-computation.js` is the shared vendored module (its own
// parameter names, not `vmu.*` keys), so it is not scanned either.
//
// `VMU_SETTINGS_DOC` points the writer at a copy (the mutant family uses it to prove --check bites).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU_DIR = join(REPO, 'vibe-math-vmu')
// SEAM CONVENTION: every generator honours `VMU_DOCS_DIR` (point the whole doc set at a copy). This one also
// honours its own `VMU_SETTINGS_DOC` for a single-file redirect, which takes precedence. Before this, pointing
// `VMU_DOCS_DIR` at a copy silently did NOT redirect this generator - an independent reviewer hit exactly that
// while writing a mutant, so the two conventions now agree.
const DOC = process.env.VMU_SETTINGS_DOC ? resolve(process.env.VMU_SETTINGS_DOC)
  : process.env.VMU_DOCS_DIR ? join(resolve(process.env.VMU_DOCS_DIR), '04-settings.md')
    : join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md')
const SCHEMA = join(REPO, 'vibe-math-vmu', 'settings', 'schema.js')

/** Every runtime source that could CONSUME a `vmu.*` key (schema.js declares, it does not consume). */
function runtimeSources() {
  const files = ['vibe-math-vmu.js', 'host.js', 'host-hooks.js', 'host-spawn.js'].map((f) => join(VMU_DIR, f))
  const walk = (dir, depth) => {
    if (depth > 3 || !existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'docs' || e.name === 'settings') continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (e.name.endsWith('.js') && e.name !== 'math-computation.js' && e.name !== 'math-engines.js') files.push(p)
    }
  }
  walk(VMU_DIR, 0)
  return [...new Set(files)].filter((f) => existsSync(f))
}

const SOURCES = runtimeSources()
/**
 * ROUND 195: a declaration is not a reader, and a declaration takes two shapes here - a quoted key as an ARRAY
 * ELEMENT (the planned/wired/all key tables) and a quoted key as an OBJECT KEY (the unwired-reason maps). Both are
 * filtered per line, with NO bracket matching: the reason strings inside those tables contain brackets of their own
 * ('removed[]'), which is exactly what made a bracket walker skip a whole table on the first attempt. A real read
 * such as `settings['vmu.x.y']` or `readKey('vmu.x.y')` matches neither shape and still counts, which keeps the
 * retention face honest: it reads seventeen keys and declares no wired table at all. A literal inside `Symbol(...)`
 * is a flag name rather than a read (one occurrence, kernel/index.js), so it is filtered too.
 */
/**
 * ★ ROUND 33 (task-159): A LINE THAT READS IS NOT A DECLARATION — even when it starts with a quoted key.
 *
 * THE DEFECT THIS FIXES (measured): the two rules below filter a line whose first token is a quoted `vmu.*` key
 * (array element / object key). That is right for the schema's `planned`/`wired` tables, but `kernel/meetingmarker.js`
 * carries **derivation tables** with exactly that shape:
 *     `'vmu.meetings.minutesDetail': K.minutesDetail,`        (meetingmarker.js:232)
 *     `'vmu.meetings.budgetOnExceed': K.budgetOnExceed,`      (meetingmarker.js:227)
 * where `K` is the settings ACCESSOR — a real read whose FIELD NAME differs from the key name ("derived-name
 * consumption"). The filter removed those lines, `hasConsumer()` then saw only the declaration in
 * `settings/schema.js`, and the table said `未接线` for keys that a middleware demonstrably reads. ⇒ **"I cannot see
 * it" was being reported as "nobody reads it"** — the same shape as R28's `oneOf` input set covering half the
 * sources. (The trigger for this task: `docs/04 §11`'s `vmu.meetings.minutesDetail` cell, corrected by hand to
 * `已接线`, made `audit-vmu-docs` red because the generated body still said otherwise.)
 *
 * THE RULE NOW: if the line READS (an accessor field `K.x`, a settings getter, an index read), it is a consumer
 * regardless of how the line begins. A pure declaration (an array element or a key with a literal/table value and no
 * read in it) is still filtered, so a key that NOTHING reads still reports `未接线` and the criterion stays able to
 * redden (task-159 C).
 */
const READ_SHAPE = /(K\.[A-Za-z_$][A-Za-z0-9_$]*|sget\(|\.get\(|readKey\(|settings\[|settingsView\(|sgetValue\()/
const isDeclarationLine = (line) => {
  const t = line.trim()
  if (READ_SHAPE.test(t)) return false                                  // ★ a reader, whatever it starts with
  if (/Symbol\(['"]vmu\./.test(t)) return true                          // flag name, not a read
  if (/^\[?['"]vmu\.[A-Za-z0-9_.]+['"]\s*(,|$)/.test(t)) return true   // array element
  if (/^['"]vmu\.[A-Za-z0-9_.]+['"]\s*:/.test(t)) return true          // object key (reasons map)
  return false
}
const SOURCE_TEXT = SOURCES.map((f) => readFileSync(f, 'utf8').split('\n').filter((l) => !isDeclarationLine(l)).join('\n')).join('\n')
/** Each source with its text, so the CARRIER column can name the first file that actually reads a key. */
const SOURCE_FILES = SOURCES.map((f) => ({ rel: f.replace(VMU_DIR, '').replace(/^[\\/]/, '').replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }))

/** Does any runtime source read this key? (the honest meaning of "the knob works") */
export function hasConsumer(key) {
  // NO BACKTICK BRANCH (round 32). Counting a bare `vmu.something` inside a COMMENT as a consumer made this
  // column claim 已接线 for keys that no code ever read - the audit suite flagged two of them, and the root cause
  // was exactly this third alternative. A comment that mentions a key is documentation, not a reader; the audit
  // suite has always judged by quoted literals, so the generator now matches that stricter standard.
  return SOURCE_TEXT.includes("'" + key + "'") || SOURCE_TEXT.includes('"' + key + '"')
}

/**
 * WHERE the key is read (the first runtime source that names it), or null. The 接线 column says WHETHER the
 * knob works; this one says WHO reads it - so a reader can go straight to the consumer instead of trusting
 * the manual (docs/04 §7).
 */
export function carrierOf(key) {
  const hit = SOURCE_FILES.find((f) => f.text.includes("'" + key + "'") || f.text.includes('"' + key + '"'))
  return hit ? hit.rel : null
}

const MODE_WRITE = process.argv.includes('--write')
const MODE_CHECK = process.argv.includes('--check') || !MODE_WRITE
const JSON_OUT = process.argv.includes('--json')

const { SETTING_DEFS } = await import(new URL('file://' + SCHEMA.replace(/\\/g, '/')).href)

const TYPE_LABEL = {
  boolean: 'bool',
  natural: 'int ≥0',
  positiveInteger: 'int ≥1',
  stringList: 'string[]',
  objectList: 'obj[]',
  path: 'path',
  string: 'string',
  enum: 'enum',
}

const renderDefault = (def) => {
  const d = def.def
  if (Array.isArray(d)) return '`[' + d.join(',') + ']`'
  if (typeof d === 'string') return '`' + d + '`'
  return '`' + String(d) + '`'
}

const renderDomain = (def) => {
  if (def.type !== 'enum') return '—'
  return def.domain.map((v) => '`' + v + '`').join('∣')
}

const renderHot = (def) => (def.hot === 'H3' ? '**H3**' : def.hot)
const renderWho = (def) => (String(def.who).startsWith('role:') ? def.who : def.who)

const HEADER = [
  '| 键 | 类型 | 默认 | 域 | 作用域 | H | 谁 | 接线 | 载体（首个**提到**它的运行时代码；消费点可能在其下游） | 说明 |',
  '|---|---|---|---|---|---|---|---|---|---|',
]

export const WIRED = '✅ 已接线'
// ★ exported ROUND 33 (task-162 follow-up): the audit asserts that every row lands in one of these THREE tiers, so it
// must not carry its own copy of the vocabulary ("one rule, one place" — the principle that audit itself states).
export const NOT_WIRED = '⚠️ 未接线（改了不会有行为变化）'
/**
 * ★ ROUND 33 (task-162): THE THIRD TIER — 「未判定」.
 *
 * WHY IT EXISTS: `vmu.turn.selfCheck` has NO literal read anywhere; its only occurrence inside its carrier is an
 * ELEMENT OF A LIST (`packs/v5r/middleware/prompt-switches.js:27` `['vmu.turn.selfCheck', 'v5r-turn-resources'],`),
 * and that list IS iterated twenty lines later (`:71` `for (const [key, section] of OFF_SWITCHES)` — the loop
 * variable is literally named `key`). So the consumer almost certainly exists, reached DYNAMICALLY; the pre-R33
 * table asserted `⚠️ 未接线（改了不会有行为变化）`, which is a claim it cannot support. Neither lie is acceptable:
 * `已接线` would be widening (the read is not proven), `未接线` asserts "nobody reads it" (also unproven). ⇒ the
 * honest output is a THIRD, explicitly uncertain tier: **看不见 ≠ 没有**.
 *
 * THE DISCRIMINATOR must be TIGHT: the iteration has to be of THE LIST THAT HOLDS THE ELEMENT (the array literal is
 * located by walking up to its `const NAME = [`), because a loose "any `.map(` in the same file" test matched
 * unrelated lines (measured: `kernel/ballotbox.js:175 args.options.map(String)`) and would have claimed a dynamic
 * read for keys whose list is never iterated. When the list is located but NO iteration is found, the evidence is
 * NOT there ⇒ the row stays `未判定` only if a list holds it, and a key with no list at all (only declarations and
 * comments) still reports `未接线` — the criterion keeps its teeth (task-162 C).
 */
export const UNDETERMINED = '❓ 未判定（可能走动态读取，静态看不见 ⇒ 看不见 ≠ 没有）'
/** A comment line can never be evidence: R32's rule (a key named in a comment is documentation, not a reader). */
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/

/**
 * ★ PERFORMANCE (R33 follow-up): THE LIST INDEX IS BUILT **ONCE**, not per key.
 *
 * The first version of `listIterationEvidence` re-read every file and re-scanned every line FOR EACH OF THE 1226
 * KEYS (`f.text.split('\n')` sat inside the per-key path, plus a fresh `new RegExp` per candidate) ⇒ ≈ O(keys ×
 * lines). Measured: `generate-vmu-settings-table.mjs --check` 3.1s → **14.0s** (4.5×), and because
 * `generate-wiring-index.mjs` RUNS this script as one of its own checks (line 124), that went 5.8s → **19.4s**, so
 * the `vmu-wiring-index` suite — which spawns both repeatedly — blew the 180s harness budget. The harness rule is to
 * fix the LOAD, never the budget.
 *
 * The fix is ONE pass over the sources: for each array declaration `const NAME = [`, decide ONCE whether NAME is
 * iterated, then index the key elements it holds. `listIterationEvidence` becomes an O(1) lookup and the SEMANTICS
 * ARE UNCHANGED (same tight rule: the iteration must be of the array that holds the element) ⇒ the three-tier
 * counts must stay 1108 / 3 / 115.
 */
const LINES_OF = new Map()
const linesOf = (f) => {
  if (!LINES_OF.has(f.rel)) LINES_OF.set(f.rel, f.text.split('\n'))
  return LINES_OF.get(f.rel)
}
const BY_REL = new Map(SOURCE_FILES.map((f) => [f.rel, f]))
/**
 * ★ R34 (task-166): THE IMPORT GRAPH. R33's locator required the iteration to be in the SAME FILE as the array
 * declaration, which left seven rows "judged 未接线 but NOT verified": if a file EXPORTS a list and ANOTHER file
 * imports it and iterates it, the key can be read dynamically and the same-file rule cannot see it. Here each
 * imported name is mapped to the files that import it (one pass over the import lines), so the builder below can
 * follow `PROMPT_ENTRIES` (declared in `packs/v5r/prompts/v5r-core.js`, iterated where it is imported) instead of
 * giving up. ★ "I cannot see it" is still never reported as "nobody reads it": a key with NO list at all, or whose
 * list is neither iterated here nor by any importer, keeps the `未接线` verdict.
 */
const IMPORTERS = (() => {
  const m = new Map()
  const add = (name, rel) => {
    if (!name) return
    if (!m.has(name)) m.set(name, new Set())
    m.get(name).add(rel)
  }
  for (const f of SOURCE_FILES) {
    for (const l of linesOf(f)) {
      if (l.indexOf('import') < 0 && l.indexOf('export') < 0) continue
      // ★ R35 (task-168): THE FOUR REMAINING FORMS (R34 covered only named `import { … } from`):
      //   ① namespace `import * as N from '…'`  ② default `import D from '…'` (also `import D, {…} from '…'`)
      //   ③ re-export `export { A, B as C } from '…'`  ④ dynamic `import('…')` — for ④ the same file later uses
      //   `.NAME` on the module namespace, which DYNAMIC_USES records.
      const ns = /import\s*\*\s*as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*from/.exec(l)
      if (ns) add(ns[1], f.rel)
      const dflt = /^\s*import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|from)/.exec(l)
      if (dflt) add(dflt[1], f.rel)
      const named = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/.exec(l)
      if (named) for (const part of named[1].split(',')) add(part.trim().split(/\s+as\s+/).pop().trim(), f.rel)
      const reexp = /export\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/.exec(l)
      if (reexp) for (const part of reexp[1].split(',')) add(part.trim().split(/\s+as\s+/).pop().trim(), f.rel)
      if (/export\s*\*\s*from/.test(l)) f.starReexport = true   // names unknowable from the line ⇒ a named residual
    }
  }
  // ★ R38 (task-177 ①): THE TWO REMAINING FORMS — and why they reduce to ONE rule. This criterion is NAME-based
  // (`IMPORTERS: name → files that reach it`), so `export * from` needs no star-edge resolution and no depth bound:
  // what matters is not where a name is EXPORTED FROM but that a file REACHES it. Both remaining forms reach a name
  // through a MODULE NAMESPACE:
  //   · `import * as NS from '…'` then `NS.NAME`      (the consumer of a re-export chain)
  //   · `const { NAME } = await import('…')`          (destructuring: the LOCAL name is what gets used)
  // The builder's iteration requirement is unchanged, so a namespace ACCESS alone is still not evidence — the file
  // must also iterate the list there. ★ Residual, named: a computed access (`NS[key]`) cannot be resolved statically
  // ⇒ that stays "没核", never "nobody reads it".
  for (const f of SOURCE_FILES) {
    // ★ R40 (task-182): FILE-LEVEL PRE-FILTER. This loop used to visit EVERY file and test each of its ~1000 lines
    // with an `indexOf('import')` before anything else (~180k calls). Only a file that can possibly hold a
    // namespace/dynamic binding is scanned at all, decided by ONE regex per file. Same forms, same names, same `add`
    // order ⇒ no semantic change; and the `matchAll` below additionally requires the binding to be USED.
    if (!/import\s*\*\s*as|import\s*\(/.test(f.text)) continue
    const nsNames = []
    for (const l of linesOf(f)) {
      if (l.indexOf('import') < 0) continue        // ★ cheap guard: without it, 3 regexes ran on EVERY line of every
      const ns = /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from/.exec(l)   //   file (measured: wiring-index 6.83 → 10.17s)
      if (ns) nsNames.push(ns[1])
      const dyn = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?import\s*\(/.exec(l)
      if (dyn) nsNames.push(dyn[1])
      const destr = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s+)?import\s*\(/.exec(l)
      if (destr) for (const part of destr[1].split(',')) add(part.trim().split(/\s*:\s*/).pop().trim(), f.rel)
    }
    if (!nsNames.length) continue
    // ★ C3 (phase-2 round 4): COMPUTED MEMBER ACCESS ON A NAMESPACE BINDING — `NS[key]`, `NS[dyn]`, `NS[CONST]`.
    // R42 closed the *dot* form (`NS.NAME`) and its reading was "本树 0 处": a value that is true TODAY and would go
    // silently false tomorrow, because a computed access is invisible to a name-based criterion. This guard makes it
    // LOUD rather than silently ignored: every hit is printed BY NAME (file:line + the line) and the process exits
    // non-zero. ★ It is deliberately NOT a claim about a key's wiring (a computed key cannot be resolved statically):
    // it says "a computed access exists — a human must look". ★ Residual, named: a LITERAL-CONSTANT key
    // (`const K = 'vmu.x'; NS[K]`) is NOT resolved (that needs a same-file constant table); it is reported by this
    // same guard as "computed" ⇒ it lands in the loud bucket instead of the silent one, never in "nobody reads it".
    const computed = []
    for (const nsName of nsNames) {
      const cre = new RegExp('\\b' + nsName + '\\s*\\[', 'g')
      for (const cm of f.text.matchAll(cre)) {
        const line = f.text.slice(0, cm.index).split('\n').length
        const text = f.text.split('\n')[line - 1] || ''
        computed.push({ rel: f.rel, line, binding: nsName, text: text.trim().slice(0, 120) })
      }
    }
    if (computed.length) {
      console.error('vmu settings table: 计算属性访问（computed member access on a namespace binding）—— 判据看不见它的键：')
      for (const c of computed) console.error('  · ' + c.rel + ':' + c.line + '  ' + c.binding + '[ … ]  ' + c.text)
      console.error('  ★ 这不是"没人读"：下标名静态不可解析 ⇒ 必须人工看（本守卫＝出现即报）。')
      process.exitCode = 1
    }
    for (const nsName of nsNames) {
      // ★ R40: membership pre-check — a whole-file regex is pointless when the binding is never dereferenced.
      if (f.text.indexOf(nsName + '.') < 0) continue
      const re = new RegExp('\\b' + nsName + '\\.([A-Za-z_$][\\w$]*)', 'g')
      for (const mm of f.text.matchAll(re)) add(mm[1], f.rel)
    }
  }
  return m
})()
/** ★ ④ dynamic import, computed PER NAME — but the "which files even contain `import(`" pass happens ONCE
 *  (measured: calling it per name re-tested every file's full text and cost ~2s, putting `wiring-index --check` at
 *  9.5s against a 6.65s baseline). */
const DYNAMIC_FILES = SOURCE_FILES.filter((f) => /\bimport\s*\(/.test(f.text))
const dynamicUsers = (name) => {
  const out = new Set()
  const re = new RegExp('\\.\\s*' + name + '\\b')
  for (const f of DYNAMIC_FILES) if (re.test(f.text)) out.add(f.rel)
  return out
}
const importerFiles = (name) => {
  const set = new Set(IMPORTERS.get(name) || [])
  for (const rel of dynamicUsers(name)) set.add(rel)
  return set
}
const LIST_INDEX = (() => {
  const idx = new Map()
  for (const f of SOURCE_FILES) {
    const lines = linesOf(f)
    for (let i = 0; i < lines.length; i++) {
      const decl = /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:Object\.freeze\()?\s*\[|^\s*['"]([A-Za-z0-9_.]+)['"]\s*:\s*\[/.exec(lines[i])
      if (!decl) continue
      const name = decl[1] || decl[2]        // ★ R35: also an INLINE array used as an object value (`'vmu.x': [ … ]`)
      const re = new RegExp('(for\\s*\\([^)]*\\bof\\s+' + name + '\\b|\\b' + name + '\\.(map|forEach|filter|some|reduce)\\()')
      let iterLine = -1
      for (let k = 0; k < lines.length; k++) {
        if (!COMMENT_LINE.test(lines[k]) && re.test(lines[k])) { iterLine = k + 1; break }
      }
      let iterRel = f.rel
      if (iterLine < 0) {
        // ★ CROSS-FILE: follow the import graph — who imports this export, and iterates it THERE?
        for (const rel of importerFiles(name)) {
          const g = BY_REL.get(rel)
          if (!g) continue
          const gl = linesOf(g)
          const k2 = gl.findIndex((l) => !COMMENT_LINE.test(l) && re.test(l))
          if (k2 >= 0) { iterLine = k2 + 1; iterRel = rel; break }
        }
      }
      // ★ R37 (task-175 ③): MINIMAL DATAFLOW for an INLINE array declared under a SETTINGS KEY (`'vmu.report.params': [ … ]`).
      // The declared name and the name the iteration is written on DIFFER (`sget('vmu.report.params')` is stored as
      // `params:` and iterated as `c.params.map(...)` in kernel/report.js), so name matching cannot connect them. The
      // rule is ONE level deep and LITERAL-BOUND, which is what keeps it out of R33's loose-iteration trap (that
      // version accepted any `.map(` in the file and invented evidence):
      //   ① the key is READ on a line that BINDS it — `const X = … sget('KEY')` or `X: … sget('KEY')`;
      //   ② the SAME file then iterates / membership-checks THAT BINDING (`X.map(`/`.X.map(`/`X.includes(`/…).
      // Both halves are required and the binding name comes from the read line, never from a guess.
      if (iterLine < 0 && /^vmu\./.test(name)) {
        const bindRe = new RegExp("(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*[^;\\n]*sget\\(\\s*['\"]" + name + "['\"]|([A-Za-z_$][\\w$]*)\\s*:[^,;\\n]*sget\\(\\s*['\"]" + name + "['\"]")
        for (const g of SOURCE_FILES) {
          if (g.text.indexOf(name) < 0) continue
          const gl = linesOf(g)
          for (let k = 0; k < gl.length; k++) {
            const b = bindRe.exec(gl[k])
            if (!b) continue
            const bound = b[1] || b[2]
            const useRe = new RegExp('(^|[^\\w$.])' + bound + '\\.(map|forEach|filter|some|includes|indexOf)\\(|\\.' + bound + '\\.(map|forEach|filter|some|includes|indexOf)\\(')
            const u = gl.findIndex((l) => !COMMENT_LINE.test(l) && useRe.test(l))
            if (u >= 0) { iterLine = u + 1; iterRel = g.rel; break }
          }
          if (iterLine >= 0) break
        }
      }
      if (iterLine < 0) continue                     // not iterated here nor by an importer ⇒ no dynamic-read evidence
      const iterText = linesOf(BY_REL.get(iterRel)).at(iterLine - 1).trim().slice(0, 90)
      // ★ R34: THE LIST BOUNDARY MUST BE COUNTED, NOT GUESSED. The first one-pass version stopped only on a line
      // that is EXACTLY `]` (`/^\];?\s*$/`), so a list closed with `],` / `])` / `], // note` never terminated and
      // the scan ran on into the NEXT declaration, pairing later keys with an unrelated iterated list (measured:
      // that is how `vmu.paper.retentionMs`, an element of the never-iterated `PLANNED_KEYS`, got reported
      // `未判定`). Depth is tracked per line with bracket characters that are outside strings/comments — the
      // cheap approximation is enough because the only thing at stake is WHERE the list ends.
      let depth = (lines[i].match(/\[/g) || []).length - (lines[i].match(/\]/g) || []).length
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim()
        if (depth <= 0) break                        // the list really ended
        if (COMMENT_LINE.test(lines[j])) { depth += (lines[j].match(/\[/g) || []).length - (lines[j].match(/\]/g) || []).length; continue }
        const em = /^\[?['"](vmu\.[A-Za-z0-9_.]+)['"]\s*(,|$)/.exec(t)
        if (em && !idx.has(em[1])) {
          idx.set(em[1], { rel: f.rel, listName: name, elemLine: j + 1, iterLine, iterRel, crossFile: iterRel !== f.rel, iterText })
        }
        depth += (lines[j].match(/\[/g) || []).length - (lines[j].match(/\]/g) || []).length
      }
    }
  }
  return idx
})()

/** The list that holds this key as an element, and the iteration over that list — or `null` when not located. */
export function listIterationEvidence(key) {
  return LIST_INDEX.get(key) || null
}

/** The three-tier verdict. `已接线` ⇐ a literal READ; else `未判定` ⇐ the key is an element of a list (the dynamic
 *  path may read it); else `未接线` ⇐ nothing but declarations/comments name it. */
export function verdictOf(key) {
  if (hasConsumer(key)) return WIRED
  return listIterationEvidence(key) ? UNDETERMINED : NOT_WIRED
}

const rows = SETTING_DEFS.map((def) => {
  const carrier = carrierOf(def.key)
  return '| `' + def.key + '` | ' + (TYPE_LABEL[def.type] || def.type) + ' | ' +
    renderDefault(def) + ' | ' + renderDomain(def) + ' | 会话 | ' + renderHot(def) + ' | ' + renderWho(def) + ' | ' +
    verdictOf(def.key) + ' | ' + (carrier ? '`' + carrier + '`' : '—') + ' | ' + def.doc + ' |'
})

const generated = HEADER.concat(rows).join('\n')

// ---- splice into the document, replacing exactly the table body ---------------------------------
const docText = readFileSync(DOC, 'utf8')
const lines = docText.split('\n')
const headerIdx = lines.findIndex((l) => l.startsWith('| 键 | 类型 |'))
if (headerIdx === -1) {
  console.error('vmu settings table: the table header is missing from docs/04 §11')
  process.exit(1)
}
let end = headerIdx + 2 // past the separator
while (end < lines.length && lines[end].startsWith('|')) end++
const before = lines.slice(0, headerIdx)
const after = lines.slice(end)
const nextText = before.concat(generated.split('\n'), after).join('\n')

const WIRED_COUNT = SETTING_DEFS.filter((d) => verdictOf(d.key) === WIRED).length
const UNDETERMINED_COUNT = SETTING_DEFS.filter((d) => verdictOf(d.key) === UNDETERMINED).length
const NOT_WIRED_COUNT = SETTING_DEFS.filter((d) => verdictOf(d.key) === NOT_WIRED).length
const SUMMARY = SETTING_DEFS.length + ' keys (' + WIRED_COUNT + ' wired, ' + UNDETERMINED_COUNT + ' undetermined, ' + NOT_WIRED_COUNT + ' declared-but-not-wired)'

if (JSON_OUT) {
  console.log(JSON.stringify({ keys: SETTING_DEFS.length, wired: WIRED_COUNT, undetermined: UNDETERMINED_COUNT, notWired: NOT_WIRED_COUNT,
    tableLines: generated.split('\n').length, stale: nextText !== docText }, null, 2))
} else if (nextText === docText) {
  console.log('vmu settings table: up to date (' + SUMMARY + ')')
} else if (MODE_WRITE) {
  writeFileSync(DOC, nextText, 'utf8')
  console.log('vmu settings table: REWRITTEN from the schema (' + SUMMARY + ', ' + generated.split('\n').length + ' lines)')
} else {
  console.error('vmu settings table: STALE - docs/04 §11 is not what the schema yields (' + SUMMARY + ')')
  console.error('  run: node scripts/generate-vmu-settings-table.mjs --write')
  process.exit(1)
}
