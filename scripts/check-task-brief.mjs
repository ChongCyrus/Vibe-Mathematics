#!/usr/bin/env node
/**
 * scripts/check-task-brief.mjs — VALIDATE A RUN BRIEF AGAINST THE TOOL DECLARATIONS IT NAMES.
 *
 * WHY THIS EXISTS (a measured incident, round 29). The run brief handed to an agent was typed by hand:
 * `vibe_v5_job` (no such tool), `settlement` (not a receipt key) and a wrong `vibe_v5_tool_help` parameter.
 * The agent executed the brief literally, the calls failed, and the failure was reported back as a PRODUCT
 * defect. A brief is an EXECUTED INTERFACE, so its tool and parameter names must be DERIVED from the
 * declarations, never retyped. This checker is that derivation: it extracts every `工具名 { 参数名: … }`
 * call from a brief and compares the names against what the code actually declares.
 *
 * WHERE THE NAMES COME FROM (derived — no tool name or parameter name is written by hand in this file):
 *   · host faces — `vibe-math-vmu/host.js#toolSpecs()`, the PRODUCTION registration path. It invokes every
 *     `vibe-math-vmu/tools/*.js` factory (`makeMemberToolsSpec({ param, refused, TOOL_NAMES, kernel })`, …) and
 *     the inline faces (`set`, `middleware`, `records`, `script`, `pack`), then returns the exact specs the host
 *     would register. `TOOL_NAMES` gives the canonical names and `TOOL_FACES` decides which faces exist.
 *     ★ Calling the factories directly would mean re-implementing host.js's private `param()` / `refused()`;
 *     running the real path cannot drift from it, and a factory that changes its parameters changes this check.
 *   · pack tools — `vibe-math-vmu/packs/v5r/tools.js#V5R_PACK_TOOLS`, each `{ name, parameters }`.
 * The arguments are MINIMAL STUBS (a permissive kernel proxy, `assertDeclared`, `scripts`, `packLoader`,
 * `instance`, `publishedSurface`, `promptSection`). ★ A stub stands in for a runtime OBJECT, never for a NAME:
 * every name and parameter validated below is read out of the returned `parameters` object.
 *
 * Usage:
 *   node scripts/check-task-brief.mjs <brief.txt> [<brief2.txt> …] [--json] [--self-probe]
 *     (no flag)     human report: one block per problem, carrying the OFFENDING LINE and that tool's LEGAL
 *                   PARAMETER SET (the task's own wording: `打印 offending 行 + 该工具的合法参数集`).
 *     --json        { ok, files, toolsChecked, problems: [{ line, tool, param, code, message, hint }] }
 *                   `files` is one record per input (`{ path, calls, problems }`); `toolsChecked` is the sorted
 *                   set of tool names the briefs actually mention.
 *     --self-probe  PLANT one wrong tool name, one wrong parameter category and one missing required parameter
 *                   and require THIS checker to report each of them (plus two controls that must stay quiet).
 *                   Exit 0 only when every planted defect was caught — this is how the gate proves it is not
 *                   vacuous. It is a proof ABOUT the checker, not a substitute for checking a real brief.
 *
 * Exit codes: 0 = every call matches the declarations; 1 = at least one problem, a derivation failure, bad usage.
 *
 * PROBLEM CODES (the three the task names, and only these):
 *   BRIEF_UNKNOWN_TOOL       the tool name is not in the derived catalogue (hint: nearest legal tool name)
 *   BRIEF_UNKNOWN_PARAM      the tool exists but declares no such parameter (hint: nearest legal parameter)
 *   BRIEF_MISSING_REQUIRED   a parameter declared `required: true` is absent from a NON-EMPTY call object
 * The `{}` rule is the task's item 3: an empty object means "check the TOOL NAME only", so it can never raise
 * BRIEF_MISSING_REQUIRED. A non-empty object is checked for all three codes.
 *
 * WHAT IT CANNOT SEE (named rather than hidden): a name that is only a VALUE (`detail:"settlement"`), a param
 * written outside a `工具名 { … }` form (`{ tool: name, params: {...} }`), keys nested deeper than depth 1 (so a
 * genuinely nested object cannot raise a false BRIEF_UNKNOWN_PARAM), and a `{}` call's required parameters.
 *
 * Grep anchors: check-task-brief, BRIEF_UNKNOWN_TOOL.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')

export const CODES = Object.freeze({
  unknownTool: 'BRIEF_UNKNOWN_TOOL',
  unknownParam: 'BRIEF_UNKNOWN_PARAM',
  missingRequired: 'BRIEF_MISSING_REQUIRED',
})

/** The task's item 3: a tool name is only a call candidate when it is exactly this shape. */
const TOOL_NAME = /^vibe_[a-z0-9_]+$/
const TOOL_NAME_SCAN = /vibe_[a-z0-9_]+/g
const KEY_AT = /(?:"([A-Za-z_$][\w$.-]*)"|([A-Za-z_$][\w$]*))\s*:/y

/** Line number (1-based) of an offset, counted over `\n` — the brief is normalised to `\n` on read. */
function lineOf(text, index) {
  let n = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') n++
  return n
}

function lineTextOf(text, line) {
  const all = text.split('\n')
  const raw = all[line - 1] === undefined ? '' : all[line - 1]
  return raw.replace(/\r$/, '').trim()
}

/** Skip a quoted run starting at `i`; an unterminated single-line quote stops at the newline (prose-safe). */
function skipQuoted(text, i) {
  const quote = text[i]
  let j = i + 1
  while (j < text.length) {
    const ch = text[j]
    if (ch === '\\') { j += 2; continue }
    if (ch === quote) return j + 1
    if (ch === '\n') return j
    j++
  }
  return j
}

/** The `{ … }` starting at `open`, brace-balanced and string-aware. null when unbalanced. */
function matchBrace(text, open) {
  let depth = 0
  let i = open
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"' || ch === "'" || ch === '`') { i = skipQuoted(text, i); continue }
    if (ch === '{') { depth++; i++; continue }
    if (ch === '}') {
      depth--
      if (depth === 0) return { body: text.slice(open + 1, i), end: i }
      i++
      continue
    }
    i++
  }
  return null
}

/**
 * DEPTH-1 keys of one call body: `param:` and `"param":`, with nested `{}`/`[]`/`()` skipped entirely.
 * ★ Depth 1 only is deliberate: a parameter whose VALUE is an object must not turn its inner keys into
 * BRIEF_UNKNOWN_PARAM noise (measured against `vibe_v5_prioritize { order: [ … ] }`).
 */
export function topLevelKeys(body) {
  const keys = []
  let i = 0
  let depth = 0
  while (i < body.length) {
    const ch = body[i]
    // ★ ROUND 106 / F-106a (the THIRD half, and the reason the first two halves were not enough): the key is tried
    // BEFORE a quoted run is skipped. A JSON body — `{"reason":"…"}` — quotes its KEYS, so the old order skipped the
    // key itself and found no parameter at all: the braces path (`name {…}`) was blind to every JSON call, which is
    // how a fully quoted brief stayed green. A quoted VALUE never matches KEY_AT (no `:` after it), so trying first
    // cannot invent a key.
    if (depth === 0) {
      KEY_AT.lastIndex = i
      const m = KEY_AT.exec(body)
      if (m) { keys.push(String(m[1] || m[2])); i = KEY_AT.lastIndex; continue }
    }
    if (ch === '"' || ch === "'" || ch === '`') { i = skipQuoted(body, i); continue }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; i++; continue }
    if (ch === '}' || ch === ']' || ch === ')') { depth = Math.max(0, depth - 1); i++; continue }
    i++
  }
  return keys
}

/** Every `工具名 { … }` call in the text (several per line are fine; prose braces are ignored). */
export function parseCalls(text) {
  const calls = []
  TOOL_NAME_SCAN.lastIndex = 0
  let m
  while ((m = TOOL_NAME_SCAN.exec(text))) {
    const name = m[0]
    // A name glued to a longer identifier (`xvibe_v5_x`) is not a call.
    if (m.index > 0 && /[A-Za-z0-9_]/.test(text[m.index - 1])) continue
    if (!TOOL_NAME.test(name)) continue
    let j = m.index + name.length
    while (j < text.length && (text[j] === ' ' || text[j] === '	')) j++
    // ★ ROUND 106 / F-106a: a brief writes a call as `` `tool` { … } `` as often as `tool { … }` — the closing backtick
    // sat between the name and its body, so the braces form never matched and the JSON after it was read as prose. Skip
    // the name's own closing delimiter before deciding the form.
    if (text[j] === '`') {
      j++
      while (j < text.length && (text[j] === ' ' || text[j] === '	')) j++
    }
    const line = lineOf(text, m.index)
    if (text[j] === '{') {
      const brace = matchBrace(text, j)
      if (!brace) continue
      calls.push({
        name,
        line,
        keys: topLevelKeys(brace.body),
        lineText: lineTextOf(text, line),
        form: 'braces',
      })
      TOOL_NAME_SCAN.lastIndex = Math.max(TOOL_NAME_SCAN.lastIndex, brace.end + 1)
      continue
    }
    // ★ ROUND 70 / F-67: the SECOND form a brief uses — `` `tool`，参数：`` followed by bullet lines. Run 70's brief
    // named `vibe_v5_turn` (a name that does not exist; the face is `vibe_vmu_turn`) in exactly this form and the
    // checker said "0 problems", because parseCalls only ever looked for `name {`. A validator that silently skips
    // the lines it is meant to check reports a green it did not earn, so both forms are parsed here.
    const bullet = bulletCall(text, m, name)
    if (bullet) {
      calls.push(Object.assign({ name, line, lineText: lineTextOf(text, line) }, bullet))
      TOOL_NAME_SCAN.lastIndex = Math.max(TOOL_NAME_SCAN.lastIndex, bullet.end)
      continue
    }
    // ★ ROUND 106 / F-106a: the THIRD form — one inline sentence with `，参数：k: v, k: v` (no braces, no bullets).
    const inline = inlineCall(text, m, name)
    if (inline) {
      calls.push(Object.assign({ name, line, lineText: lineTextOf(text, line) }, inline))
      TOOL_NAME_SCAN.lastIndex = Math.max(TOOL_NAME_SCAN.lastIndex, inline.end)
    }
  }
  return calls
}


const BULLET_KEY = /^\s*[-*]\s*([A-Za-z_][A-Za-z0-9_]*)\s*[:：]/
const BULLET_LEAD = /(?:，|,)?\s*(?:参数|parameters)?\s*[:：]\s*$/
const CALL_LEAD = /vibe_[a-z0-9_]+`?\s*(?:，|,)?\s*(?:参数|parameters)?\s*[:：]\s*$/

/**
 * Parse the bullet form of a call: the tool name and `，参数：` on one line, then `  - key: value` lines.
 * Returns `{ keys, end }` (end = text index after the last bullet) or null when the line is not a bullet-form call.
 * A name mentioned in running prose (no `参数：` lead, no bullets) is NOT a call — only a claimed call is checked.
 */
function bulletCall(text, m, name) {
  const lineEnd = text.indexOf('\n', m.index)
  const stop = lineEnd === -1 ? text.length : lineEnd
  const rest = text.slice(m.index + name.length, stop).replace(/`/g, '')
  if (!BULLET_LEAD.test(rest)) return null
  let cursor = stop + 1
  const keys = []
  let end = m.index + name.length
  let indent = null
  while (cursor < text.length) {
    const nl = text.indexOf('\n', cursor)
    const lineStop = nl === -1 ? text.length : nl
    const line = text.slice(cursor, lineStop)
    if (line.trim() === '') { cursor = lineStop + 1; if (keys.length > 0) break; continue }
    const lead = line.length - line.trimStart().length
    const hit = BULLET_KEY.exec(line)
    if (hit) {
      if (indent === null) indent = lead
      if (lead < indent) break
      keys.push(hit[1])
      end = lineStop
      cursor = lineStop + 1
      continue
    }
    // A wrapped continuation of the previous bullet belongs to it; a line that STARTS ANOTHER CALL does not.
    if (CALL_LEAD.test(line)) break
    if (indent !== null && lead >= indent) { cursor = lineStop + 1; continue }
    break
  }
  if (keys.length === 0) return null
  return { keys, form: 'bullets', end }
}

const INLINE_LEAD = /^(?:，|,|。)?\s*(?:参数|parameters)\s*[:：]\s*/

/** Split a `a: 1, b: "x，y", c: [1,2]` body at TOP-LEVEL separators (quotes and brackets respected). */
function splitInlineKeys(body) {
  const parts = []
  let start = 0
  let i = 0
  let depth = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch
      i++
      while (i < body.length) {
        if (body[i] === '\\') { i += 2; continue }
        if (body[i] === q) { i++; break }
        i++
      }
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(' || ch === '（') { depth++; i++; continue }
    if (ch === '}' || ch === ']' || ch === ')' || ch === '）') { depth = Math.max(0, depth - 1); i++; continue }
    if (depth === 0 && (ch === ',' || ch === '，' || ch === ';' || ch === '；')) {
      parts.push(body.slice(start, i))
      start = i + 1
      i++
      continue
    }
    i++
  }
  parts.push(body.slice(start))
  return parts
}

/**
 * Parse the INLINE form of a call: `` `tool`，参数：key: value, key: value。 `` — one sentence, no braces, no bullets.
 * ★ ROUND 106 / F-106a: runs 105 and 106 were both poisoned at step 1 by `vibe_v5_start {reason:…}` written in exactly
 * this form, and THIS CHECKER said "0 problem(s)" both times — `parseCalls` only knew `name {…}` and the bullet form,
 * so the inline form was silently invisible. A validator that skips a form it is meant to check reports a green it
 * did not earn (same family as ROUND 70's bullet blindness). Keys come from a quote/bracket-aware split, so a value
 * containing `，`/`；`/`：` cannot manufacture a phantom key.
 */
function inlineCall(text, m, name) {
  const lineEnd = text.indexOf('\n', m.index)
  const stop = lineEnd === -1 ? text.length : lineEnd
  const rest = text.slice(m.index + name.length, stop).replace(/`/g, '')
  const lead = INLINE_LEAD.exec(rest)
  if (!lead) return null
  const after = rest.slice(lead[0].length)
  const term = after.search(/。(?:\s|$)|\n/)
  const body = (term === -1 ? after : after.slice(0, term)).trim()
  if (body === '') return null
  // ★ ROUND 106 / F-106a (the second half): the live briefs of runs 105/106 carried the call as a JSON OBJECT after the
  // lead — `` `vibe_v5_start`，参数：`{"reason":"…"}` `` — and a key splitter that only reads `k: v` found none, so the
  // form was parsed but its parameters were invisible (still a green it did not earn). Braces after the lead are the
  // SAME call, so they go through `topLevelKeys`, the reader the `name {…}` form already uses.
  if (body[0] === '{') {
    const brace = matchBrace(body, 0)
    if (!brace) return null
    const keysInBraces = topLevelKeys(brace.body)
    if (keysInBraces.length === 0) return null
    return { keys: keysInBraces, form: 'inline-braces', end: m.index + name.length + lead[0].length + brace.end + 1 }
  }
  const keys = []
  for (const part of splitInlineKeys(body)) {
    const hit = /^\s*(?:"([A-Za-z_$][\w$.-]*)"|([A-Za-z_$][\w$]*))\s*[:：]/.exec(part)
    if (hit) keys.push(String(hit[1] || hit[2]))
  }
  if (keys.length === 0) return null
  return { keys, form: 'inline', end: m.index + name.length + lead[0].length + body.length }
}

/** Levenshtein distance — only used for the HINT, never for a decision. */
export function editDistance(a, b) {
  const s = String(a)
  const t = String(b)
  let prev = new Array(t.length + 1)
  let cur = new Array(t.length + 1)
  for (let j = 0; j <= t.length; j++) prev[j] = j
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = cur
    cur = swap
  }
  return prev[t.length]
}

function nearest(name, candidates) {
  let best = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const d = editDistance(name, candidate)
    if (d < bestDistance || (d === bestDistance && best !== null && candidate < best)) {
      best = candidate
      bestDistance = d
    }
  }
  return best === null ? null : { name: best, distance: bestDistance }
}

function toolHint(name, tools) {
  const near = nearest(name, [...tools.keys()])
  if (!near) return 'the derived catalogue is empty — this is a DERIVATION failure, not a brief defect'
  return 'nearest declared tool is `' + near.name + '` (edit distance ' + near.distance + ')'
}

function paramHint(name, parameters) {
  const near = nearest(name, Object.keys(parameters))
  if (!near) return 'this tool declares no parameters at all'
  return 'nearest declared parameter is `' + near.name + '` (edit distance ' + near.distance + ')'
}

/** The legal parameter set of a tool, rendered for a human report and for hints. */
export function legalParameters(tool) {
  if (!tool) return '(no declared parameters: the tool itself is unknown)'
  const rows = Object.entries(tool.parameters || {})
  if (rows.length === 0) return '(this tool declares no parameters)'
  return rows.map(([name, decl]) => {
    const type = decl && decl.type ? String(decl.type) : 'unknown'
    const required = decl && decl.required === true ? 'required' : 'optional'
    return name + ' (' + type + ', ' + required + ')'
  }).join(', ')
}

function problem(parts) {
  return {
    file: parts.file,
    line: parts.line,
    tool: parts.tool,
    param: parts.param,
    code: parts.code,
    message: parts.message,
    hint: parts.hint,
    legal: parts.legal,
    lineText: parts.lineText,
  }
}

/** The JSON wire shape the task fixes: exactly these six fields per problem. */
export function wireProblems(problems) {
  const out = []
  for (const p of problems) {
    out.push({ line: p.line, tool: p.tool, param: p.param, code: p.code, message: p.message, hint: p.hint })
  }
  return out
}

/**
 * Check ONE brief text against the catalogue.
 * @returns {{ path: string, calls: number, problems: object[], tools: string[] }}
 */
export function checkBriefText(path, rawText, catalog) {
  const text = String(rawText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const calls = parseCalls(text)
  const problems = []
  const tools = []
  const seenTool = new Set()
  const seenProblem = new Set()
  const push = (p) => {
    const id = p.code + '|' + p.line + '|' + p.tool + '|' + String(p.param)
    if (seenProblem.has(id)) return
    seenProblem.add(id)
    problems.push(p)
  }
  for (const call of calls) {
    if (!seenTool.has(call.name)) { seenTool.add(call.name); tools.push(call.name) }
    const tool = catalog.tools.get(call.name)
    if (!tool) {
      push(problem({
        file: path,
        line: call.line,
        tool: call.name,
        param: null,
        code: CODES.unknownTool,
        message: '`' + call.name + '` is not a declared tool (' + catalog.tools.size + ' tools were derived from the vmu declarations)',
        hint: toolHint(call.name, catalog.tools),
        legal: legalParameters(null),
        lineText: call.lineText,
      }))
      continue
    }
    const declared = tool.parameters || {}
    const legal = legalParameters(tool)
    for (const key of call.keys) {
      if (Object.prototype.hasOwnProperty.call(declared, key)) continue
      push(problem({
        file: path,
        line: call.line,
        tool: call.name,
        param: key,
        code: CODES.unknownParam,
        message: '`' + call.name + '` declares no parameter `' + key + '`',
        hint: paramHint(key, declared),
        legal,
        lineText: call.lineText,
      }))
    }
    // Item 3: `{}` means "check the TOOL NAME only" — an empty call is deliberately not a required-parameter test.
    if (call.keys.length === 0) continue
    for (const [name, decl] of Object.entries(declared)) {
      if (!decl || decl.required !== true) continue
      if (call.keys.includes(name)) continue
      push(problem({
        file: path,
        line: call.line,
        tool: call.name,
        param: name,
        code: CODES.missingRequired,
        message: '`' + call.name + '` requires `' + name + '`, and this non-empty call does not give it',
        hint: 'add `' + name + '` to the call, or write `{}` if only the tool NAME is being checked',
        legal,
        lineText: call.lineText,
      }))
    }
  }
  return { path, calls: calls.length, problems, tools }
}

/** A permissive stand-in for a runtime object: any property is a callable, any call returns the same stub. */
function kernelStub() {
  const target = function stub() {}
  const handler = {
    get(_t, key) { return key === 'then' ? undefined : target },
    apply() { return target },
    construct() { return target },
  }
  return new Proxy(target, handler)
}

function toolOf(name, parameters, source) {
  return { name, source, parameters: parameters && typeof parameters === 'object' ? parameters : {} }
}

/**
 * Derive the catalogue from the DECLARATIONS. Throws a named error when the declarations cannot be read —
 * a silent empty catalogue would make every call "unknown", i.e. a false red with the wrong diagnosis.
 */
export async function buildCatalog({ repo = REPO } = {}) {
  let host
  let pack
  try {
    host = await import(pathToFileURL(join(repo, 'vibe-math-vmu', 'host.js')).href)
    pack = await import(pathToFileURL(join(repo, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)
  } catch (e) {
    throw new Error('CHECK_TASK_BRIEF_DERIVATION_FAILED: cannot import the declarations: ' + String(e && e.message))
  }
  if (typeof host.toolSpecs !== 'function' || !Array.isArray(host.TOOL_FACES)) {
    throw new Error('CHECK_TASK_BRIEF_DERIVATION_FAILED: host.js no longer exports toolSpecs/TOOL_FACES')
  }
  if (!Array.isArray(pack.V5R_PACK_TOOLS)) {
    throw new Error('CHECK_TASK_BRIEF_DERIVATION_FAILED: packs/v5r/tools.js no longer exports V5R_PACK_TOOLS')
  }
  const kernel = kernelStub()
  const explicit = {}
  for (const row of host.TOOL_FACES) explicit[row.face] = true
  const scripts = ['check-task-brief']
  const packLoader = () => ({ tools: [] })
  const faces = host.resolveFaces({ config: {}, settings: {}, kernel, explicit, declaredKeys: 1, scripts, packLoader })
  const specs = host.toolSpecs({
    kernel,
    settings: {},
    assertDeclared: () => {},
    faces,
    scripts,
    packLoader,
    instance: {},
    publishedSurface: () => ({ names: [], reasons: {}, evaluations: [] }),
    promptSection: {},
  })
  const tools = new Map()
  for (const spec of specs) {
    if (!spec || typeof spec.name !== 'string') throw new Error('CHECK_TASK_BRIEF_DERIVATION_FAILED: a host toolSpec has no name')
    if (!spec.parameters || typeof spec.parameters !== 'object') {
      throw new Error('CHECK_TASK_BRIEF_DERIVATION_FAILED: host tool `' + spec.name + '` declares no parameters object')
    }
    tools.set(spec.name, toolOf(spec.name, spec.parameters, 'host'))
  }
  for (const row of pack.V5R_PACK_TOOLS) {
    if (!row || typeof row.name !== 'string') throw new Error('CHECK_TASK_BRIEF_DERIVATION_FAILED: a V5R_PACK_TOOLS row has no name')
    if (!row.parameters || typeof row.parameters !== 'object') {
      throw new Error('CHECK_TASK_BRIEF_DERIVATION_FAILED: pack tool `' + row.name + '` declares no parameters object')
    }
    if (!tools.has(row.name)) tools.set(row.name, toolOf(row.name, row.parameters, 'pack'))
  }
  if (tools.size < 2) throw new Error('CHECK_TASK_BRIEF_DERIVATION_FAILED: only ' + tools.size + ' tools were derived; the declarations did not load')
  return { tools, host: specs.length, pack: pack.V5R_PACK_TOOLS.length, faces: host.TOOL_FACES.length }
}

function dummyValue(decl) {
  const type = decl && decl.type
  if (type === 'number' || type === 'integer') return '1'
  if (type === 'boolean') return 'true'
  if (type === 'array') return '[]'
  if (type === 'object') return '{}'
  return '"x"'
}

function requiredOf(tool) {
  const out = []
  for (const [name, decl] of Object.entries(tool.parameters || {})) if (decl && decl.required === true) out.push(name)
  return out
}

function optionalOf(tool) {
  const out = []
  for (const [name, decl] of Object.entries(tool.parameters || {})) if (!decl || decl.required !== true) out.push(name)
  return out
}

/** Render a call from `tool` with `keys` (values from the declared types, so a bad value never masks a name). */
function renderCall(tool, keys) {
  const parts = []
  for (const key of keys) parts.push(key + ': ' + dummyValue((tool.parameters || {})[key]))
  return tool.name + ' { ' + parts.join(', ') + ' }'
}

/** Proof that the checker BITES: plant defects and require them to be reported. */
export function selfProbe(catalog) {
  const names = [...catalog.tools.keys()].sort()
  const tools = names.map((n) => catalog.tools.get(n))
  // A tool with at least one declared parameter — the subject of the unknown-parameter plant.
  let withParam = null
  for (const tool of tools) { if (Object.keys(tool.parameters).length > 0) { withParam = tool; break } }
  // A tool with a required parameter — the subject of the missing-required plant.
  let withRequired = null
  for (const tool of tools) { if (requiredOf(tool).length > 0) { withRequired = tool; break } }
  // A tool with a required AND an optional parameter — lets the plants isolate one code at a time.
  let mixed = null
  for (const tool of tools) { if (requiredOf(tool).length > 0 && optionalOf(tool).length > 0) { mixed = tool; break } }
  // A tool with no required parameter — the clean control.
  let clean = null
  for (const tool of tools) { if (requiredOf(tool).length === 0) { clean = tool; break } }
  const cases = []

  if (clean) {
    cases.push({ name: 'control-valid-call', expected: [], text: renderCall(clean, optionalOf(clean).slice(0, 1)) })
    cases.push({ name: 'control-empty-object', expected: [], text: clean.name + ' {}' })
  }
  cases.push({ name: 'plant-unknown-tool', expected: [CODES.unknownTool], text: 'vibe_zzz_self_probe_absent { member: "res-01" }' })
  // ★ ROUND 70 / F-67: the bullet form must be parsed too, or the checker's green is unearned.
  cases.push({
    name: 'plant-unknown-tool-bullets',
    expected: [CODES.unknownTool],
    text: '1) 调用 `vibe_zzz_bullets_absent`，参数：\n   - member: "res-01"\n',
  })
  if (withParam) {
    const keys = requiredOf(withParam)
    cases.push({
      name: 'plant-unknown-param-bullets',
      expected: [CODES.unknownParam],
      text: '1) 调用 `' + withParam.name + '`，参数：\n' + keys.map((k) => '   - ' + k + ': ' + dummyValue(withParam.parameters[k])).join('\n')
        + '\n   - zzz_self_probe_absent_param: 1\n',
    })
    const legal = requiredOf(withParam).concat(optionalOf(withParam).slice(0, 1))
    cases.push({
      name: 'control-valid-bullets',
      expected: [],
      text: '1) 调用 `' + withParam.name + '`，参数：\n' + legal.map((k) => '   - ' + k + ': ' + dummyValue(withParam.parameters[k])).join('\n') + '\n',
    })
  }
  if (withParam) {
    const required = requiredOf(withParam)
    const keys = required.concat(['zzz_self_probe_absent_param'])
    cases.push({ name: 'plant-unknown-param', expected: [CODES.unknownParam], text: renderCall(withParam, keys) })
    // ★ ROUND 106 / F-106a: the INLINE form must be parsed too (a body with a comma inside a quoted value still
    // yields exactly one phantom key, not three).
    const inlineLegal = requiredOf(withParam)
    const inlineBody = (inlineLegal.length > 0 ? inlineLegal.map((k) => k + ': ' + dummyValue(withParam.parameters[k])).join('，') + '，' : '')
      + 'zzz_self_probe_absent_param: "一，二；三"'
    cases.push({
      name: 'plant-unknown-param-inline',
      expected: [CODES.unknownParam],
      text: '1) `' + withParam.name + '`，参数：' + inlineBody + '。\n',
    })
    if (inlineLegal.length > 0) {
      cases.push({
        name: 'control-valid-inline',
        expected: [],
        text: '1) `' + withParam.name + '`，参数：' + inlineLegal.map((k) => k + ': ' + dummyValue(withParam.parameters[k])).join('，') + '。\n',
      })
    }
  }
  // ★ ROUND 106 / F-106a: a JSON body quotes its KEYS, and the old `topLevelKeys` skipped a quoted run before it
  // tried the key pattern — so `{"reason":"…"}` yielded NO parameter and every fully quoted brief stayed green (that is
  // exactly how runs 105/106 passed the checker and died at step 1). Both JSON shapes are planted here.
  if (withParam) {
    const jsonKeys = requiredOf(withParam).concat(['zzz_self_probe_absent_param'])
    cases.push({
      name: 'plant-unknown-param-json-braces',
      expected: [CODES.unknownParam],
      text: '1) `' + withParam.name + '` {"zzz_self_probe_absent_param": 1}\n',
    })
    cases.push({
      name: 'plant-unknown-param-json-inline',
      expected: [CODES.unknownParam],
      text: '1) 调用 `' + withParam.name + '`，参数：`{"zzz_self_probe_absent_param":1}`。\n',
    })
    void jsonKeys
  }
  if (clean) {
    const key = optionalOf(clean)[0]
    cases.push({
      name: 'control-valid-json-inline',
      expected: [],
      text: '1) 调用 `' + clean.name + '`，参数：`{"' + key + '":' + JSON.stringify(dummyValue(clean.parameters[key])) + '}`。\n',
    })
  }
  if (mixed) {
    const optional = optionalOf(mixed)
    cases.push({ name: 'plant-missing-required', expected: [CODES.missingRequired], text: renderCall(mixed, optional.slice(0, 1)) })
    const required = requiredOf(mixed)
    const body = []
    for (const key of required) body.push(key + ': ' + dummyValue(mixed.parameters[key]))
    body.push(optional[0] + ': { zzz_self_probe_nested_key: 1 }')
    cases.push({ name: 'control-nested-value-not-flagged', expected: [], text: mixed.name + ' { ' + body.join(', ') + ' }' })
  }
  const results = []
  const failures = []
  for (const c of cases) {
    const report = checkBriefText('<self-probe>', c.text, catalog)
    const got = report.problems.map((p) => p.code)
    const caught = c.expected.every((code) => got.includes(code))
    const silent = c.expected.length === 0 && got.length === 0
    const pass = c.expected.length === 0 ? silent : caught
    results.push({ name: c.name, expected: c.expected, got, pass, text: c.text })
    if (!pass) failures.push(c.name + ' planted ' + JSON.stringify(c.text) + ' but the checker reported ' + JSON.stringify(got))
  }
  if (cases.length < 5) failures.push('only ' + cases.length + ' self-probe cases could be built; the declarations are too thin to prove the checker')
  return { results, failures }
}

function renderHuman(report, catalog) {
  const out = []
  for (const p of report.problems) {
    out.push(p.file + ':' + p.line + ': ' + p.code + '  ' + p.message)
    if (p.lineText) out.push('    line ' + p.line + ': ' + p.lineText)
    if (p.code !== CODES.unknownTool) out.push('    legal parameters of `' + p.tool + '`: ' + p.legal)
    out.push('    hint: ' + p.hint)
  }
  return out
}

function jsonReport(reports, catalog, extra) {
  const problems = []
  const tools = []
  const seen = new Set()
  const files = []
  for (const report of reports) {
    const wire = wireProblems(report.problems)
    for (const p of wire) problems.push(p)
    for (const t of report.tools) if (!seen.has(t)) { seen.add(t); tools.push(t) }
    files.push({ path: report.path, calls: report.calls, problems: wire.length })
  }
  return Object.assign({
    ok: problems.length === 0,
    files,
    toolsChecked: tools.sort(),
    problems,
    derived: { tools: catalog.tools.size, host: catalog.host, pack: catalog.pack, faces: catalog.faces },
  }, extra || {})
}

function usage(message) {
  process.stderr.write('check-task-brief: ' + message + '\n' +
    'usage: node scripts/check-task-brief.mjs <brief.txt> [<brief2.txt> …] [--json] [--self-probe]\n')
}

async function main(argv) {
  const files = []
  let asJson = false
  let probe = false
  for (const arg of argv) {
    if (arg === '--json') { asJson = true; continue }
    if (arg === '--self-probe') { probe = true; continue }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write('usage: node scripts/check-task-brief.mjs <brief.txt> [<brief2.txt> …] [--json] [--self-probe]\n')
      process.exitCode = 0
      return
    }
    if (arg.startsWith('-') && arg !== '-') { usage('unknown option `' + arg + '`'); process.exitCode = 1; return }
    files.push(arg)
  }
  let catalog
  try {
    catalog = await buildCatalog()
  } catch (e) {
    process.stderr.write('check-task-brief: ' + String(e && e.message) + '\n')
    process.exitCode = 1
    return
  }
  if (probe) {
    const probeReport = selfProbe(catalog)
    if (asJson) {
      process.stdout.write(JSON.stringify({ ok: probeReport.failures.length === 0, selfProbe: probeReport, derived: { tools: catalog.tools.size } }, null, 2) + '\n')
    } else {
      for (const r of probeReport.results) {
        process.stdout.write('self-probe: ' + (r.pass ? 'ok  ' : 'FAIL') + ' ' + r.name + '  ' + (r.expected.length ? 'expected ' + r.expected.join('/') + ' → got ' + JSON.stringify(r.got) : 'expected silence → got ' + JSON.stringify(r.got)) + '\n')
      }
      const caught = probeReport.results.filter((r) => r.expected.length > 0 && r.pass).length
      const quiet = probeReport.results.filter((r) => r.expected.length === 0 && r.pass).length
      process.stdout.write('check-task-brief: ' + (probeReport.failures.length === 0 ? 'SELF-PROBE OK' : 'SELF-PROBE FAILED') +
        ' — ' + caught + ' planted defect(s) caught, ' + quiet + ' control(s) stayed quiet (' + probeReport.results.length + ' cases)\n')
      for (const failure of probeReport.failures) process.stdout.write('  FAIL ' + failure + '\n')
    }
    process.exitCode = probeReport.failures.length === 0 ? 0 : 1
    return
  }
  if (files.length === 0) { usage('no brief file given'); process.exitCode = 1; return }
  const reports = []
  for (const file of files) {
    let text
    try {
      text = readFileSync(resolve(process.cwd(), file), 'utf8')
    } catch (e) {
      process.stderr.write('check-task-brief: cannot read `' + file + '`: ' + String(e && e.code ? e.code : e && e.message) + '\n')
      process.exitCode = 1
      return
    }
    reports.push(checkBriefText(file, text, catalog))
  }
  const total = reports.reduce((n, r) => n + r.problems.length, 0)
  if (asJson) {
    process.stdout.write(JSON.stringify(jsonReport(reports, catalog), null, 2) + '\n')
  } else {
    process.stdout.write('check-task-brief: derived ' + catalog.tools.size + ' tools from the declarations (' + catalog.host + ' host faces + ' + catalog.pack + ' pack tools)\n')
    for (const report of reports) for (const line of renderHuman(report, catalog)) process.stdout.write(line + '\n')
    process.stdout.write('check-task-brief: ' + (total === 0 ? 'OK' : 'FAIL') + ' — ' + reports.length + ' file(s), ' + total + ' problem(s)\n')
  }
  process.exitCode = total === 0 ? 0 : 1
}

const invokedDirectly = process.argv[1] !== undefined &&
  resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write('check-task-brief: FAILED — ' + String(e && e.stack ? e.stack : e) + '\n')
    process.exitCode = 1
  })
}
