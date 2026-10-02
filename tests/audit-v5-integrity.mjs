// ============================================================
// V5 INTEGRITY AUDIT — static self-check of vibe-math-v5.js against the ways this
// kind of single-file plugin actually breaks:
//   1. a function CALLED but never defined (ReferenceError at runtime only)
//   2. a `params.X` read for a key that DEFAULT_PARAMS never declares (silent undefined)
//   3. a tool handler calling `s.NAME(...)` on the session API object that the session
//      never returns (TypeError only when that tool is used)
//   4. documented error codes that are never raised, and raised codes never documented
//   5. leftover development markers / TODO scaffolding
// Run: node tests/audit-v5-integrity.mjs   (exit 1 on any finding)
// ============================================================
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FILE = new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url)
const raw = readFileSync(FILE, 'utf8')
// Strip comments, string literals AND regex literals before any identifier scan. Without this the
// heuristic matches English words inside comments that merely precede a '(' (e.g.
// "// per unit (" becomes a phantom call to unit()), drowning the real findings.
//
// REGEX LITERALS ARE NOT OPTIONAL HERE: v5 contains `/[\\/:*?"<>|\u0000-\u001f]+/` — a character class
// holding a DOUBLE QUOTE. A scanner without regex support reads that quote as a string start and
// mangles the rest of the line. Measured on this very file (old vs new, line by line): 30 of 4365
// lines differed and the stripped output did NOT parse. No identifier this audit checks
// (call names, `params.*` reads, `s.*()` methods) happened to be missed in the current source, so this
// was latent rather than exploited — but a single call appearing only on such a line would have been
// invisible. The self-check at the bottom of this file keeps the scanner honest.
// The keyword rule matters for the same reason as in audit-prompt-invariants.mjs (`return /…/`).
function stripNoise(s) {
  let out = ''
  let i = 0
  const n = s.length
  let prev = '' // last significant token (single char, or a whole word such as `return`)
  let word = ''
  const REGEX_AFTER_KEYWORD = /^(?:return|typeof|case|delete|void|instanceof|in|of|yield|await|new|do|else)$/
  const regexAllowed = () => prev === '' || REGEX_AFTER_KEYWORD.test(prev) || /[(,=:[!&|?{};+\-*%~^<>]/.test(prev)
  while (i < n) {
    const c = s[i], c2 = s[i + 1]
    if (c === '/' && c2 === '/') { while (i < n && s[i] !== '\n') i++; continue }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue }
    if (c === '/' && regexAllowed()) {
      i++
      let inClass = false
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue }
        if (s[i] === '[') inClass = true
        else if (s[i] === ']') inClass = false
        else if (s[i] === '/' && !inClass) { i++; break }
        else if (s[i] === '\n') break // a regex literal cannot span lines
        i++
      }
      while (i < n && /[a-z]/i.test(s[i])) i++ // flags
      out += "''" // a value placeholder, like strings: keeps `X: <value>` shapes but no phantom calls
      prev = ')'
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      i++
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue }
        if (s[i] === q) { i++; break }
        if (q !== '`' && s[i] === '\n') break
        i++
      }
      out += q + q   // keep a placeholder so `X: ''` shape survives
      prev = ')'
      continue
    }
    out += c
    if (/[A-Za-z0-9_$]/.test(c)) word += c
    else { if (word) { prev = word; word = '' } if (!/\s/.test(c)) prev = c }
    i++
  }
  return out
}
const src = stripNoise(raw)
const findings = []
const notes = []

const lineOf = (idx) => src.slice(0, idx).split('\n').length

// ---- 1. called-but-undefined -------------------------------------------
const defined = new Set()
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1])
for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1])
for (const m of src.matchAll(/(?:const|let|var)\s+\{([^}]+)\}\s*=/g)) {
  for (const part of m[1].split(',')) { const n = part.split(':').pop().trim(); if (n) defined.add(n) }
}
for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) defined.add(m[1])
// ESM imports are DEFINITIONS too: the preset imports the shared `math_computation` module
// (INTERFACE-FREEZE §5.1), so calling an imported function is not a ReferenceError. Without
// this every imported symbol was reported as "called but never defined"; a call to a name that
// is neither declared nor imported is still flagged.
for (const m of src.matchAll(/import\s*(?:\*\s*as\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s*['"][^'"]*['"]/g)) {
  if (m[1]) defined.add(m[1])
  if (m[2]) defined.add(m[2])
  if (m[3]) {
    for (const part of m[3].split(',')) {
      const name = part.split(/\s+as\s+/).pop().trim()
      if (name) defined.add(name)
    }
  }
}
// Function/method PARAMETERS are locally bound identifiers too, not free calls.
for (const m of src.matchAll(/function\s*[A-Za-z_$]*\s*\(([^)]*)\)/g)) {
  for (const raw of m[1].split(',')) {
    const name = raw.trim().replace(/[={].*$/s, '').trim()
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
  }
}
for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) {
  for (const raw of m[1].split(',')) {
    const name = raw.trim().replace(/[={].*$/s, '').trim()
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
  }
}
for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) defined.add(m[1])
// JS/DSH globals that are legitimately free
const GLOBALS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'await', 'delete', 'void', 'do', 'else', 'try',
  'Array', 'Object', 'JSON', 'Number', 'String', 'Boolean', 'Math', 'Date', 'Promise', 'Set', 'Map', 'WeakRef', 'WeakMap', 'Symbol', 'Error',
  'isFinite', 'isNaN', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'structuredClone',
  'AbortSignal', 'console', 'require', 'import', 'super', 'this', 'of', 'in', 'instanceof',
  'RegExp', 'Proxy', 'Reflect', 'AggregateError', 'TextEncoder', 'TextDecoder', 'URL', 'BigInt', 'Intl', 'Buffer', 'process',
])
const LOCAL_METHODS = new Set()
for (const m of src.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*[:(]/g)) LOCAL_METHODS.add(m[1])
for (const m of src.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)) LOCAL_METHODS.add(m[1])

const called = new Map()
for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
  const name = m[1]
  if (GLOBALS.has(name) || LOCAL_METHODS.has(name)) continue
  if (!called.has(name)) called.set(name, { n: 0, line: lineOf(m.index) })
  called.get(name).n++
}
for (const [name, info] of called) {
  if (!defined.has(name)) findings.push('line ' + info.line + ': called but never defined: ' + name + '()  (' + info.n + ' call site(s))')
}

// ---- 2. params keys ----------------------------------------------------
const dpBlock = /const DEFAULT_PARAMS = \{([\s\S]*?)\n    \}/.exec(src)
if (!dpBlock) findings.push('could not locate DEFAULT_PARAMS')
else {
  const declared = new Set()
  for (const m of dpBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) declared.add(m[1])
  const used = new Map()
  for (const m of src.matchAll(/\bparams\.([A-Za-z_$][\w$]*)/g)) used.set(m[1], (used.get(m[1]) || 0) + 1)
  for (const [k, n] of used) {
    if (!declared.has(k)) findings.push('params.' + k + ' read but not declared in DEFAULT_PARAMS (' + n + ' use(s))')
  }
  notes.push('DEFAULT_PARAMS keys: ' + declared.size + '; params.* reads: ' + used.size)
}

// ---- 3. session-API surface used by tool handlers -----------------------
// `s` is not always the session API object. The toolFilter sanitiser added for the v2/v3/v4
// parity guard contains `.map(function(s){ return s.trim() })` — there `s` is a LOCAL string
// parameter, and a flat `s.NAME(` scan reported the phantom finding "calls s.trim() but the
// session API does not export it". A false FINDING is as corrosive as a blind spot (it trains
// the reader to ignore the audit), so the scan now respects the ONE shadowing form the plugin
// actually uses: a plain `function (...)` whose parameter list binds `s`.
//
// This is scope analysis, not an allowlist: any `s.X()` inside such a body CANNOT be a call on
// the enclosing session object — the parameter shadows it. The tool handlers themselves are
// ARROW functions (`(s, a, x) => s.…)`), so their `s` IS the session API and stays scanned; the
// self-check at the bottom of this file proves the skip does not blind those.
function localSParamBodySpans(text) {
  const spans = []
  const re = /function\s*(?:[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)\s*\{/g
  let m
  while ((m = re.exec(text)) !== null) {
    const params = m[1].split(',').map((p) => p.trim().replace(/[={].*$/s, '').trim())
    if (params.indexOf('s') === -1) continue
    let i = m.index + m[0].length - 1   // sitting on the opening '{'
    let depth = 0
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') { depth--; if (depth === 0) break }
    }
    spans.push([m.index, i])
  }
  return spans
}
// The returned API object is the last `return { ... }` inside makeSession.
const apiStart = src.lastIndexOf('    return {\n      sessionId,')
if (apiStart === -1) findings.push('could not locate the session API return object')
else {
  const apiEnd = src.indexOf('\n    }\n  }', apiStart)
  const apiText = src.slice(apiStart, apiEnd === -1 ? apiStart + 4000 : apiEnd)
  const apiKeys = new Set()
  for (const m of apiText.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*:/g)) apiKeys.add(m[1])
  for (const m of apiText.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*,/g)) apiKeys.add(m[1])
  const localScopes = localSParamBodySpans(src)
  const inLocalScope = (idx) => localScopes.some(([a, b]) => idx >= a && idx <= b)
  const usedOnS = new Map()
  let shadowed = 0
  for (const m of src.matchAll(/(?<![\w$.])s\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (inLocalScope(m.index)) { shadowed++; continue }
    if (!usedOnS.has(m[1])) usedOnS.set(m[1], lineOf(m.index))
  }
  for (const [k, line] of usedOnS) {
    if (!apiKeys.has(k)) findings.push('line ' + line + ': tool handler calls s.' + k + '() but the session API does not export it')
  }
  notes.push('session API keys: ' + apiKeys.size + '; s.*() called: ' + usedOnS.size +
    (shadowed ? '; skipped ' + shadowed + ' inside a local `function(s)` scope (a shadowing parameter, not the session API)' : ''))
}

// ---- 4. error codes ----------------------------------------------------
// Scan the RAW source: these patterns live inside string literals, which `src` strips.
const raised = new Set()
for (const m of raw.matchAll(/v5err\(\s*'(V5_[A-Z_]+)'/g)) raised.add(m[1])
for (const m of raw.matchAll(/code:\s*'(V5_[A-Z_]+)'/g)) raised.add(m[1])
const docs = readFileSync(new URL('../vibe-math-v5/实现方案.md', import.meta.url), 'utf8')
const documented = new Set()
for (const m of docs.matchAll(/`(V5_[A-Z_]+)`/g)) documented.add(m[1])
const onlyDocs = new Set()
for (const m of docs.matchAll(/(V5_[A-Z_]+)/g)) onlyDocs.add(m[1])
const raisedNotDocumented = [...raised].filter(c => !onlyDocs.has(c))
const documentedNotRaised = [...documented].filter(c => !raised.has(c))
if (raisedNotDocumented.length) findings.push('error codes raised but absent from 实现方案.md: ' + raisedNotDocumented.join(', '))
if (documentedNotRaised.length) notes.push('documented but not raised in code (ok if advisory): ' + documentedNotRaised.join(', '))
notes.push('error codes raised: ' + raised.size)

// ---- 5. leftover scaffolding -------------------------------------------
for (const bad of ['@@V5_SECTION@@', 'TODO', 'FIXME', 'XXX', 'PLACEHOLDER']) {
  if (src.includes(bad)) findings.push('leftover development marker: ' + bad)
}
// every event type declared in EV must be appended somewhere
const evBlock = /const EV = \{([\s\S]*?)\n\}/.exec(raw)
if (evBlock) {
  const keys = [...evBlock[1].matchAll(/([A-Za-z]+):\s*'(vibe5\/[a-z]+)'/g)]
  for (const [, prop, literal] of keys) {
    const uses = (raw.match(new RegExp("EV\\." + prop + "\\b", 'g')) || []).length
    if (uses <= 1) findings.push('event type EV.' + prop + ' (' + literal + ') is declared but never committed')
  }
  notes.push('event types declared: ' + keys.length)
}

// ---- 6. composition sanity --------------------------------------------
// The v5 preset is a composition, and a typo in a row `name` is a mounting failure that
// no unit test of the plugin can catch (the mock calls apply() directly and never goes
// through the loader). v4 is a proven-good composition mounted on the same hosts, so any
// package row v5 names that v4 does not is either a genuine new dependency or a typo —
// and a new dependency must be justified, so surface it for review.
function packageRows(yaml) {
  const rows = []
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const idm = /^\s*-\s*id:\s*(\S+)\s*$/.exec(lines[i])
    if (!idm) continue
    const row = { id: idm[1], name: '', disabled: false, line: i + 1 }
    for (let j = i + 1; j < lines.length && j < i + 12; j++) {
      if (/^\s*-\s*id:\s*\S+\s*$/.test(lines[j])) break
      const nm = /^\s*name:\s*'?([^'\n]+?)'?\s*$/.exec(lines[j])
      if (nm && !row.name) row.name = nm[1].trim()
      if (/^\s*disabled:\s*true/.test(lines[j])) row.disabled = true
    }
    if (row.name) rows.push(row)
  }
  return rows
}
const v5yaml = readFileSync(new URL('../vibe-math-v5/agent.cordis.yml', import.meta.url), 'utf8')
const v4yaml = readFileSync(new URL('../vibe-math-v4/agent.cordis.yml', import.meta.url), 'utf8')
const v5rows = packageRows(v5yaml)
const v4names = new Set(packageRows(v4yaml).map(r => r.name))
const RELATIVE_OK = new Set(['./vibe-math-v5.js'])
if (!v5rows.length) findings.push('composition: no rows parsed out of agent.cordis.yml (is the file still YAML?)')
for (const r of v5rows) {
  if (r.name === 'cordis:group') continue
  if (r.name.startsWith('./')) {
    if (!RELATIVE_OK.has(r.name)) findings.push('composition line ' + r.line + ': relative row name "' + r.name + '" has no matching file in the preset directory')
    continue
  }
  if (!v4names.has(r.name)) findings.push('composition line ' + r.line + ': row "' + r.id + '" names "' + r.name + '", which v4 does not — verify the package/name is correct')
}
// the preset must reference its own plugin row, and that file must exist
if (!v5rows.some(r => r.name === './vibe-math-v5.js')) findings.push('composition: the preset never mounts ./vibe-math-v5.js')
// prefix AND text are required on the persona row for the DSH schema and for back-compat
const personaBlock = /- id:\s*persona[\s\S]*?(?=\n-\s*id:)/.exec(v5yaml)
if (!personaBlock) findings.push('composition: no persona row found')
else {
  if (!/^\s*prefix:\s*\|/m.test(personaBlock[0])) findings.push('composition: persona row lacks the required `prefix` key')
  if (!/^\s*text:\s*\|/m.test(personaBlock[0])) findings.push('composition: persona row lacks the legacy `text` key')
}
notes.push('composition rows: ' + v5rows.length + '; non-v4 package rows: ' + v5rows.filter(r => r.name !== 'cordis:group' && !r.name.startsWith('./') && !v4names.has(r.name)).length)

// ---- 7. requirements traceability against the plan ---------------------
// "No missing logic" is only checkable mechanically if the SPEC is machine-readable.
// The plan's §15 names every tool and §16 every parameter, so compare those sets
// against the implementation: a name in the plan but not the code is an unimplemented
// requirement, and a name in the code but not the plan is undocumented surface.
{
  const plan = readFileSync(new URL('../vibe-math-v5/实现方案.md', import.meta.url), 'utf8')
  const planTools = new Set()
  for (const m of plan.matchAll(/\bvibe_v5_[a-z_]+/g)) planTools.add(m[0])
  const codeTools = new Set()
  for (const m of raw.matchAll(/registerTool\(\s*'(vibe_v5_[a-z_]+)'/g)) codeTools.add(m[1])
  // documented-but-wildcarded placeholders are not real tools
  const IGNORE = new Set(['vibe_v5_', 'vibe_v5_record_', 'vibe_v5_lean_', 'vibe_v5_task_'])
  for (const t of planTools) {
    if (IGNORE.has(t)) continue
    if (!codeTools.has(t)) findings.push('plan names tool ' + t + ' but the plugin never registers it')
  }
  const undocumented = [...codeTools].filter(t => !planTools.has(t))
  if (undocumented.length) notes.push('tools registered but not named in the plan: ' + undocumented.join(', '))
  notes.push('plan tools: ' + planTools.size + '; registered tools: ' + codeTools.size)

  // Parameters: only the §16 default table, NOT the §15 tool tables (whose rows also
  // begin with a backticked name).
  const declared2 = new Set()
  if (dpBlock) for (const m of dpBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) declared2.add(m[1])
  const sec16 = /##\s*16\.[\s\S]*?(?=\n##\s*17\.)/.exec(plan)
  const paramRows = new Set()
  if (sec16) {
    for (const m of sec16[0].matchAll(/^\|\s*`([A-Za-z][\w]*)`(?:\s*\/\s*`([A-Za-z][\w]*)`)?\s*\|/gm)) {
      paramRows.add(m[1])
      if (m[2]) paramRows.add(m[2])
    }
  } else findings.push('could not locate the plan\'s §16 parameter table')
  for (const p of paramRows) {
    if (!declared2.has(p)) findings.push('plan documents parameter `' + p + '` but DEFAULT_PARAMS does not declare it')
  }
  notes.push('plan §16 parameter rows: ' + paramRows.size)

  // F3 (docs-vs-behaviour sweep): `status()`'s machine surface. The plan's §14.9 states the rule
  // ("status() 暴露的机器面字段必须在这里有对应物"). The docs owner is completing that table, so THIS gate
  // pins the CODE side now: the extracted key set is frozen below, and any addition/removal must be an
  // explicit decision here (and in §14.9). The table half is deliberately NOT enabled yet — and says so,
  // so the missing half can never be mistaken for coverage.
  const stIdx = raw.indexOf('function status() {')
  const statusKeys = []
  if (stIdx === -1) findings.push('could not locate status() — the machine-surface extraction has no anchor')
  else {
    const open = raw.indexOf('return {', stIdx)
    const close = raw.indexOf('\n      }', open)
    // Tokenise the returned literal: every key directly inside it — including SHORTHAND keys that share a
    // line (`institute: instituteName, project, key, phase,`) — while SKIPPING each value (so an
    // identifier used as a value can never be mistaken for a key).
    const body = open === -1 ? '' : raw.slice(open + 'return {'.length, close === -1 ? open + 9000 : close)
    // Comments must be skipped IN PLACE: the payload's comments contain prose with apostrophes, parens and
    // commas (`…delivered ONCE…`, `phase:'failed'`, `(installer review)`), which otherwise corrupt both the
    // depth tracking and the value skipping.
    const skipComment = (s, at) => {
      if (s[at + 1] === '/') { let j = at + 2; while (j < s.length && s[j] !== '\n') j += 1; return j }
      if (s[at + 1] === '*') { const j = s.indexOf('*/', at + 2); return j === -1 ? s.length : j + 2 }
      return -1
    }
    let i = 0, depth = 0
    while (i < body.length) {
      const ch = body[i]
      if (ch === '/') { const j = skipComment(body, i); if (j !== -1) { i = j; continue } }
      if (ch === '"' || ch === "'") { const q = ch; i += 1; while (i < body.length && body[i] !== q) { if (body[i] === '\\') i += 1; i += 1 } i += 1; continue }
      if (ch === '{' || ch === '[' || ch === '(') { depth += 1; i += 1; continue }
      if (ch === '}' || ch === ']' || ch === ')') { if (depth === 0) break; depth -= 1; i += 1; continue }
      if (depth === 0 && /[A-Za-z_$]/.test(ch)) {
        const m = /^[A-Za-z_$][\w$]*/.exec(body.slice(i))
        const after = body.slice(i + m[0].length).replace(/^[\s]+/, '')
        if (after[0] === ':') {
          statusKeys.push(m[0])
          i += m[0].length
          let d = 0
          while (i < body.length) {                       // skip the VALUE up to the next top-level comma
            const c = body[i]
            if (c === '/') { const j = skipComment(body, i); if (j !== -1) { i = j; continue } }
            if (c === '"' || c === "'") { const q = c; i += 1; while (i < body.length && body[i] !== q) { if (body[i] === '\\') i += 1; i += 1 } i += 1; continue }
            if (c === '{' || c === '[' || c === '(') { d += 1; i += 1; continue }
            if (c === '}' || c === ']' || c === ')') { if (d === 0) break; d -= 1; i += 1; continue }
            if (c === ',' && d === 0) { i += 1; break }
            i += 1
          }
          continue
        }
        if (after[0] === ',') { statusKeys.push(m[0]); i += m[0].length; continue }
        i += m[0].length; continue
      }
      i += 1
    }
  }
  notes.push('status() top-level keys captured: ' + statusKeys.length)
  if (statusKeys.length < 30) findings.push('status() key extraction captured only ' + statusKeys.length + ' keys (anchor or payload broke — this check must never pass vacuously)')
  for (const must of ['phase', 'members', 'quorum', 'chat', 'persistence']) {
    if (statusKeys.indexOf(must) === -1) findings.push('status() no longer exposes `' + must + '` (either the extraction anchor or the payload broke)')
  }
  const EXPECTED_STATUS_KEYS = ['ok', 'institute', 'project', 'key', 'phase', 'running', 'autoDone', 'runId', 'leanNotices', 'leanNoticesScope', 'fieldScopes', 'backend', 'diagnostics', 'debug', 'quorum', 'members', 'tasks', 'failedMembers', 'failedMembersNote', 'pendingSpawns', 'pendingSpawnsNote', 'chat', 'chatScope', 'officeRequests', 'officeRequestsShown', 'officeRequestsCap', 'officeRequestsDropped', 'officeRequestsTruncated', 'persistence', 'meeting', 'parkedMeeting', 'verify', 'verifyQueue', 'verified', 'verifiedTrue', 'concludedFalse', 'verifiedNote', 'undecided', 'solveVotes', 'formal', 'paper', 'lastProgressAt', 'params']
  const statusMissing = EXPECTED_STATUS_KEYS.filter((k) => statusKeys.indexOf(k) === -1)
  const statusAdded = statusKeys.filter((k) => EXPECTED_STATUS_KEYS.indexOf(k) === -1)
  if (statusMissing.length || statusAdded.length) {
    findings.push('status() field surface changed — missing=' + JSON.stringify(statusMissing) + ' added=' + JSON.stringify(statusAdded) +
      ': record the decision in this freeze AND add/update the row in the plan §14.9 table')
  }
  notes.push('§14.9 doc-table reconciliation: NOT enabled yet (the docs owner is completing the table); the code-side freeze above is the active half')

  // F1 (docs-vs-behaviour): the README's TWO-CASE `resume` claim must stay paired with the behavioural
  // anchor that pins the in-instance case (the two CODE anchors are gates in the GATES table below). Only
  // the prose side is checked here, and every side reports how much it matched, so this cannot pass vacuously.
  {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const suite = readFileSync(new URL('./e2e-v5-round2.test.mjs', import.meta.url), 'utf8')
    const readmeClaims = [
      ['the two-case framing', /`resume`\s*后轮次计数的两种情形/],
      ['case 1 = a cross-process reload counts from 1', /跨进程重载[^\n]*从\s*\*\*1\*\*\s*重新计/],
      ['case 2 = an in-instance rebuild CONTINUES the numbering (轮次 2)', /同实例重建[^\n]*继续[^\n]*轮次 2/],
      ['a failed/invalid start no longer erases the existing count', /失败\/无效的启动\*\*不再抹掉\*\*已有计数/],
      ['the claim is pinned to a revision', /口径复核于\s*`?[0-9a-f]{7,40}`?/],
    ]
    let readmeHits = 0
    for (const [label, re] of readmeClaims) {
      if (re.test(readme)) readmeHits += 1
      else findings.push('README resume-claim side missing: ' + label)
    }
    const suiteClaims = [
      ['the in-instance rebuild is asserted as 轮次 2', /a FAILED resume must not move the round number backwards/],
      ['the founding round is asserted as 轮次 1', /the founding prompt starts the member at 轮次 1/],
    ]
    let suiteHits = 0
    for (const [label, re] of suiteClaims) {
      if (re.test(suite)) suiteHits += 1
      else findings.push('README resume-claim has no behavioural anchor: ' + label)
    }
    // The README cites exact code/test lines PINNED to a revision ("口径复核于 <sha>"). Those drift by
    // design, so the drift is a measured NOTE carrying the current lines — never a failure.
    const lineOf = (needle) => { const at = raw.indexOf(needle); return at === -1 ? -1 : raw.slice(0, at).split('\n').length }
    const startLine = lineOf('const startRound = (rounds.get(member.id) || 0) + 1')
    const applyLine = lineOf('rounds.set(member.id, startRound)')
    if (startLine === -1 || applyLine === -1) findings.push('the spawnMember round-count anchors are gone (startRound=' + startLine + ', applied=' + applyLine + ')')
    notes.push('F1 resume-claim pairing: README ' + readmeHits + '/' + readmeClaims.length + ' claims, behavioural anchors ' + suiteHits + '/' + suiteClaims.length + '; cited-line drift (README pins a revision): startRound now :' + startLine + ', applied now :' + applyLine)
  }

  // The plan's philosophy is enforced by concrete gates; assert the load-bearing ones
  // still exist so a future edit cannot quietly drop a guard.
  const GATES = [
    ['temp workers cannot vote', "if (m.kind === 'temp') return   // no vote"],
    ['temp workers cannot hire', "if (caller.kind === 'temp') return { ok: false, code: 'V5_NOT_VOTER'"],
    ['only the academician assigns', "code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can assign tasks'"],
    ['only the academician sets priorities', "code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can set priorities'"],
    ['permanent-staff changes need the office', "code: 'V5_NOT_ACADEMICIAN', message: '解聘常驻研究员只能向所办提议，由所办批准（成员不能直接执行）'"],
    ['assignment objections are broadcast', 'if (p.reject_assign && typeof p.reject_assign === \'object\' && params.memberMayRejectAssign)'],
    ['the academician has no extra vote weight', 'const E = voters().map((m) => m.id)'],
    ['members may reject an assignment', "memberMayRejectAssign: true,"],
    ['the charter states the progress definition', "'  · Members/<你>/Progress/progress.md —— **你的研究日志**（叙述体，可追加）。'"],
    ['the charter describes the academician as organizer', "'  【四、你的组织职责与边界（院士）】'"],
    ['the framework never assigns on its own', "agenda: '本所较长时间没有新进展。请你们自行讨论：现在最该推进的是什么？谁来做？是否需要发起验证？'"],

    // ── PROMPT / INTERACTION CORRECTNESS GATES ─────────────────────────────
    // F1 (README two-case resume claim): the two code anchors the prose cites.
    ['the founding round is computed from the stored count (never reset)', 'const startRound = (rounds.get(member.id) || 0) + 1'],
    ['the founding round is applied only AFTER a successful start', 'rounds.set(member.id, startRound)'],
    // The 2026-09 field test shipped a framework whose every member brief named the WRONG
    // member. These gates keep the structural fixes in place, and the companion
    // prompt-v5-integrity.test.mjs asserts the TEXT those fixes produce.
    ['the status block takes the member it describes', 'function briefBlock(member, roundNo) {'],
    ['an unknown identity fails loudly instead of being guessed', "throw v5err('V5_INTERNAL', 'briefBlock: a member is required"],
    ['the status block is built from that member, never a global', 'function stateBlock(member, roundNo) {\n      return briefBlock(member, roundNo)\n    }'],
    ['the founding prompt is told the round it is starting (never a stored 0)', 'const prompt = initialPrompt(member, initialTask, mode, startRound)'],
    ['the joiner is committed to the roster BEFORE its brief is built', "member.phase = 'active'\n      member.childId = ''\n      await putMember(member)"],
    ['the charter is frozen at hire and reused on resume', 'const persona = member.persona || memberPersona(member)'],
    ['a rebuilt session is framed as a rebuild', "const resume = mode === 'resume'"],
    ['leadership text follows the live roster', 'function academicianId() {'],
    ['no charter invents a leader when there is none', "本所当前**没有在册院士**"],
    ['the office resolves as the office, never as a guessed member', "try { if (rootOf(agent) === agent) return 'office' } catch (e) { /* fall through */ }"],
    ['the mailbox is acked only AFTER the wake actually succeeded', "if (ok && prompt.pending.length) await ackPending(prompt.pending)"],
    // F2: the three REAL mailbox invariants, each at its own source anchor. `inFlightMessages` is a DSH
    // mailbox internal that v5 does NOT have (dedupe is `delivered` + the per-round injection marks), so
    // no gate may reference it.
    ['the acknowledgement is gated by the wake result AND a non-empty pending list', 'const ok = await wakeMember(member, prompt.text, kind)'],
    ['the delivered ledger is CAPPED (oldest evicted, never unbounded)', 'const capped = delivered.length > DELIVERED_CAP ? delivered.slice(delivered.length - DELIVERED_CAP) : delivered'],
    ['a prompt prepends only messages not already prepended in this round', 'const fresh = pending.filter((p) => !seen.has(p.id))'],
    ['the per-round injection mark is cleared with every concluded attempt', 'inboxInjected.delete(member.id)'],
    ['a prepended inbox suppresses the base block (exactly one inbox section per prompt)', "const pending = inboxSuppressed.has(member.id) ? [] : pendingFor(member.id)"],
    ['framework feedback has its own sender (never a self-message)', "return await say('framework', { to: memberId, kind: 'notice', text: String(text) })"],
    ['an assignment is framed by its true origin', "if (m.kind === 'assign') return (m.from === 'office' ? '【所办分派】' : '【院士分派】') + m.text"],
    ['a nudge is framed as supervision, not as an assignment', "to, kind: 'nudge',"],
    ['a voters-only broadcast is framed as such', "if (m.kind === 'voters') return '【研究所·致全体表决者 from ' + m.from + '】' + m.text"],
    ['relayed messages carry their true sender', "await say(callerId, { to: 'voters', kind: 'voters', text: '提议开会：「' + agenda + '」（' + kind + '）' })"],
    ['a member that failed to provision stays visible', "b.push('[未就位] ' + absent.map((m) => m.id + '（' + m.phase + '）').join('、'))"],
    ['the objection channel is documented in the reply spec', '"reject_assign": {"task_id":"t-3"'],
    ['the task-done channel is documented in the reply spec', '"task_done": "t-3",'],
    ['the meeting input channel is documented in the reply spec', '"input": "本轮会议/辩论的发言正文'],
    ['the work push is paced, not an unbounded loop', 'if ((now() - (lastActiveAt.get(m.id) || 0)) < idleMs) continue'],

    // ── LEAN FORMAL VERIFICATION GATES (docs/formal-verification.md) ─────────
    ['the formal-verification mode defaults to off', "formalVerify: 'off',"],
    ['an unknown mode degrades to off, never to a stronger mode', "indexOf(out.formalVerify) !== -1 ? out.formalVerify : 'off'"],
    ['the mode is read at prompt-build time (never frozen into the charter)', 'const formalOn = () => formalMode()'],
    ['a passing run — not merely an archived file — is what makes an object passed', 'const formalGateOk = (rec) => !!rec && (rec.status === \'passed\' || rec.status === \'blocked\')'],
    ['a passing Lean run switches the review subject to fidelity', '你的任务是**忠实性审查**'],
    ['the voting prompt tells voters not to re-derive once a proof exists', '**你不需要重新检查推导**'],
    ['require mode withholds a verdict without a formal record', 'if (formalMode() === \'require\' && !formalGateOk(rec)) {'],
    ['a withheld verdict is recorded as undecided with a machine-readable reason', 'formal-required：尚未取得 Lean 形式化通过'],
    ['the withheld object goes on a formalization TODO', "'Formal/TODO.md'"],
    ['a blocker record must carry a reason', "if (!note) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）"],
    ['the proof of an object is archived under Verified/Lean/', "await writeTextRel('Verified/Lean/' + target + '.lean', body)"],
    ['reusable definitions live in the GLOBAL cross-project library', 'const okWrite = await writeTextAbs(instRootless(rel), body)'],
    ['the Lean path guard normalises .. (no string-prefix traversal hole)', 'const norm = normalizeAbsPath(abs)'],
    ['a missing toolchain degrades to a readable result, not a crash', "code: 'LEAN_NOT_FOUND'"],
    ['the formal record is durable state (folded into State/<institute>.v5state.json)', "formal: 'vibe5/formal',"],
    ['the state block advertises the formalization counts', "b.push('[形式化] ' + (formalMode()"],
    ['the reply contract carries the difficulty judgement', "L.push('  \"formal\": {"],
  ]
  for (const [label, needle] of GATES) {
    if (!raw.includes(needle)) findings.push('philosophy gate missing from the implementation: ' + label)
  }
  notes.push('philosophy gates checked: ' + GATES.length)

  // The prompt corpus is a SHIPPED deliverable, not a build artifact: a human must be able
  // to read the exact text every member receives without decoding session logs.
  const REPO_ROOT = new URL('../', import.meta.url)
  const needFiles = [
    ['the prompt-integrity suite is shipped', 'tests/prompt-v5-integrity.test.mjs'],
    ['the machine-readable prompt corpus is shipped', 'prompt-corpus-v5/prompt-corpus-v5.json'],
    ['the human-readable prompt corpus is shipped', 'prompt-corpus-v5/prompt-corpus-v5.md'],
    ['the persona-surface suite is shipped', 'tests/audit-persona-surface.test.mjs'],
    ['the four-preset persona corpus is shipped (machine-readable)', 'prompt-corpus-persona/persona-corpus.json'],
    ['the four-preset persona corpus is shipped (human-readable)', 'prompt-corpus-persona/persona-corpus.md'],
  ]
  for (const [label, rel] of needFiles) {
    let ok = false
    try { ok = existsSync(new URL(rel, REPO_ROOT)) } catch (e) { ok = false }
    if (!ok) findings.push('missing shipped prompt-correctness artifact: ' + label + ' (' + rel + ')')
  }
  notes.push('prompt-correctness artifacts checked: ' + needFiles.length)

  // The corpus must actually contain the interactions a reviewer needs to see, and must
  // never contain a wrong-identity brief.
  try {
    const corpusPath = new URL('prompt-corpus-v5/prompt-corpus-v5.json', REPO_ROOT)
    const c = JSON.parse(readFileSync(corpusPath, 'utf8'))
    const kinds = new Set((c.prompts || []).map(p => p.kind))
    const need = ['founding', 'founding-temp', 'founding-leaderless', 'resume', 'normal', 'checkpoint',
      'verify', 'verify-debate', 'meeting', 'meeting-proposal', 'inbox-dm', 'inbox-voters', 'inbox-chat',
      'inbox-office', 'inbox-assign', 'inbox-nudge', 'inbox-office-assign', 'inbox-office-nudge',
      'notice', 'notice-claim', 'after-failure',
      // the Lean formal-verification interaction must be reviewable by a human too — including
      // the `require` gate wording and the state a member sees AFTER a fidelity defect withdrew
      // a proof (both were missing from the first corpus, so nobody could read them).
      'lean-work', 'lean-verify', 'lean-fidelity', 'lean-require', 'lean-after-defect']
    for (const k of need) if (!kinds.has(k)) findings.push('the prompt corpus is missing a ' + k + ' prompt')
    const all = (c.prompts || []).map(p => p.prompt + '\n' + (p.charter || '')).join('\n')
    if (/你是 \?/.test(all)) findings.push('the prompt corpus contains a wrong-identity "你是 ?" brief')
    if (/\[状态\][^\n]*你是\s+(\S+?)[^\n]*\n/.test(all)) {
      // every [状态] line must name a real member id, never a placeholder
      for (const m of all.match(/\[状态\][^\n]*/g) || []) {
        const id = (/\[状态\]\s*你是\s+(\S+?)（/.exec(m) || [])[1]
        if (!id || id === '?' || id === 'undefined') findings.push('the prompt corpus has a bad identity line: ' + m.slice(0, 60))
      }
    }
    notes.push('prompt corpus: ' + (c.total || 0) + ' prompts, ' + kinds.size + ' kinds')
  } catch (e) {
    findings.push('the prompt corpus could not be read/parsed: ' + String((e && e.message) || e))
  }

  // The persona surface of ALL FOUR presets is a shipped prompt-correctness artifact too:
  // it is the only prompt the MAIN agent receives, and no e2e suite loads the YAML, so a
  // human reviewer needs the corpus on disk (generated by audit-persona-surface.test.mjs).
  try {
    const pc = JSON.parse(readFileSync(new URL('prompt-corpus-persona/persona-corpus.json', REPO_ROOT), 'utf8'))
    for (const d of ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5']) {
      if (!(pc.presets || []).some((p) => p.preset === d)) findings.push('the persona corpus is missing preset ' + d)
    }
    const emptyBlocks = (pc.presets || []).filter((p) => !p.prefix || !p.text).map((p) => p.preset)
    if (emptyBlocks.length) findings.push('the persona corpus has an empty persona block: ' + emptyBlocks.join(', '))
    notes.push('persona corpus: ' + (pc.presets || []).length + ' presets')
  } catch (e) {
    findings.push('the persona corpus could not be read/parsed: ' + String((e && e.message) || e))
  }
}

// ---- scanner self-check -------------------------------------------------
// The whole audit rests on stripNoise(); a scanner that mis-lexes silently BLINDS it (that is how the
// regex-with-a-quote bug lived here). Two checks, both cheap and both measured to be sensitive:
//   · the stripped source must still PARSE (the pre-fix scanner produced a SyntaxError);
//   · a fixture with a quoted character class + a following comment must survive intact.
{
  const tmp = mkdtempSync(join(tmpdir(), 'v5-integrity-strip-'))
  try {
    const f = join(tmp, 'v5.mjs')
    writeFileSync(f, src)
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
    if (r.status !== 0) {
      findings.push('stripNoise() corrupted the source it scans (the stripped text does not parse) — every identifier check below is unreliable: ' +
        String(r.stderr || '').split('\n').filter((l) => l.trim()).slice(-2).join(' ').slice(0, 160))
    }
    const fixture = [
      'function f(s) { return s.replace(/["\']/g, "-") }',
      '// phantom_call( must not survive as a call site',
      'const div = 6 / 2',
    ].join('\n')
    const stripped = stripNoise(fixture)
    if (stripped.includes('phantom_call')) findings.push('stripNoise() left a comment in the code stream (a phantom call site would be reported)')
    if (!/'/.test(stripped)) findings.push('stripNoise() dropped a value placeholder')
    // The session-API scan must ignore a SHADOWING `function(s)` parameter while still seeing the
    // real arrow handlers. Without this, either the false `s.trim()` finding comes back or the
    // scope skip silently blinds every tool-handler call — both are failures worth failing on.
    const scopeFixture = [
      'const names = m[1].split(",").map(function(s){ return s.trim() })',   // local string param
      'registerTool("t", "d", {}, (s, a) => s.resume())',                     // the session API
    ].join('\n')
    const spans = localSParamBodySpans(scopeFixture)
    const idxShadow = scopeFixture.indexOf('s.trim()')
    const idxApi = scopeFixture.indexOf('s.resume()')
    if (!spans.some(([a, b]) => idxShadow >= a && idxShadow <= b)) findings.push('the session-API scan would report a PHANTOM finding for a shadowing `function(s)` parameter (s.trim())')
    if (spans.some(([a, b]) => idxApi >= a && idxApi <= b)) findings.push('the session-API scan would SKIP a real arrow tool handler (s.resume() was classified as shadowed)')
    notes.push('scanner self-check: stripped output parses=' + (r.status === 0) + '; quoted-class fixture=' + (!stripped.includes('phantom_call')) +
      '; shadowed-param skip=' + spans.length)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ---- report ------------------------------------------------------------
console.log('-- V5 integrity audit --')
for (const n of notes) console.log('  note: ' + n)
console.log('')
if (findings.length) {
  for (const f of findings) console.error('  FINDING: ' + f)
  console.error('')
  console.error(findings.length + ' finding(s)')
  process.exit(1)
}
console.log('clean: no undefined calls, no undeclared params keys, no missing session API, no leftover markers')
process.exit(0)
