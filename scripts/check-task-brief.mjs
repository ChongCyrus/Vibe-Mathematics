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
 *                   Also plants the STRUCTURE defects below (missing placeholder, missing seat, missing table
 *                   header, missing prompt-critique section, forbidden office-substitute wording, over-length).
 *                   Exit 0 only when every planted defect was caught — this is how the gate proves it is not
 *                   vacuous. It is a proof ABOUT the checker, not a substitute for checking a real brief.
 *     --structure   FORCE the run-brief structure checks (see below); --no-structure turns them off.
 *                   Default is AUTO: the structure checks run when the file carries `## ` section headings
 *                   (a brief, or this repo's template) and are skipped for a bare call-snippet fixture.
 *
 * Run-brief STRUCTURE (TB-2612, task-91 — a brief is also an ORGANISATION interface):
 *   BRIEF_MISSING_PLACEHOLDER   the placeholder-problem sentence is absent (the sentence is quoted verbatim in
 *                               STRUCTURE.placeholder and must appear as one line)
 *   BRIEF_MISSING_SEAT          a seat's section heading is absent (the problem NAMES the missing seat)
 *   BRIEF_MISSING_RULE_TABLE    the four-column table header 「规则条号 | 期望 | 实测 | 判定 | 建议」 is absent
 *   BRIEF_MISSING_PROMPT_CRITIQUE  no heading is a prompt-critique section (`提示词`)
 *   BRIEF_FORBIDDEN_WORDING     wording that hands a seat's own writing to the office (「所办替成员」…)
 *   BRIEF_TOO_LONG              the TEMPLATE exceeds its 180-line cap
 *   BRIEF_SEAT_SECTION_TOO_LONG a TEMPLATE seat section exceeds 15 body lines (the problem names the seat)
 *
 * NAMES (TB-2721 / task-204 — the task-brief side of the RUN 76 incident). A brief is also a PROMISE about names:
 * every backticked identifier (`vibe_*`, an `action:` value, or a field-shaped word) must resolve to a name the
 * product really declares. A name that does not exist is allowed only in the SAME line as a negation
 * (`不存在|不是|旧|未登记|别写|不要`) — then the sentence is about a retired name instead of teaching it.
 * The universe is DERIVED, never typed: tool names, parameter names and their enum values come from
 * `buildCatalog()` (host.js#toolSpecs + V5R_PACK_TOOLS); field names are the object-literal property keys
 * declared in the JavaScript sources under `vibe-math-vmu/` and `scripts/` — a name exists in this product iff
 * its source declares it. This is what catches a brief that copies `set_solved`, a name only the prompts used to teach.
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
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')

export const CODES = Object.freeze({
  unknownTool: 'BRIEF_UNKNOWN_TOOL',
  unknownParam: 'BRIEF_UNKNOWN_PARAM',
  missingRequired: 'BRIEF_MISSING_REQUIRED',
})

/** TB-2612 / task-91: the STRUCTURE codes. A brief is an interface in two directions (declarations AND people). */
export const STRUCTURE_CODES = Object.freeze({
  placeholder: 'BRIEF_MISSING_PLACEHOLDER',
  seat: 'BRIEF_MISSING_SEAT',
  ruleTable: 'BRIEF_MISSING_RULE_TABLE',
  critique: 'BRIEF_MISSING_PROMPT_CRITIQUE',
  forbidden: 'BRIEF_FORBIDDEN_WORDING',
  tooLong: 'BRIEF_TOO_LONG',
  seatTooLong: 'BRIEF_SEAT_SECTION_TOO_LONG',
})

/** The placeholder-problem declaration, verbatim. Quoted as ONE source string so a reword shows up as a diff. */
export const PLACEHOLDER = '这是模拟用的数学题，只作占位/象征，可以是公开问题，不要把时间花在真解上'

/** The four seats a run brief must give their own section — the problem NAMES the one that is missing. */
export const SEATS = Object.freeze([
  { key: 'office', label: '所办（office）', heading: /^#{1,6}\s*[^\n]*所办/ },
  { key: 'chair', label: '主席（chair）', heading: /^#{1,6}\s*[^\n]*主席/ },
  { key: 'member', label: '成员（member）', heading: /^#{1,6}\s*[^\n]*成员/ },
  { key: 'temp', label: '临时工（temp）', heading: /^#{1,6}\s*[^\n]*临时工/ },
])

/** Four-column self-test table: rule line | expected | measured | verdict | suggestion. */
export const RULE_TABLE = /^[^\n]*规则条号[^\n]*\|[^\n]*期望[^\n]*\|[^\n]*实测[^\n]*\|[^\n]*判定[^\n]*\|[^\n]*建议/m

/** Wording that hands a seat's own writing to the office — the TB-2611 defect, said again in a brief. */
export const FORBIDDEN = Object.freeze(['所办替成员', '所办代写', 'office 代写', '代成员写', '代成员记录'])

export const TEMPLATE_MAX_LINES = 180
export const SEAT_MAX_LINES = 15

/** TB-2721: the naming gate's one code. The message carries the name and the line, so a reader can fix it. */
export const NAME_CODES = Object.freeze({ unknownName: 'UNKNOWN_NAME' })

/** A sentence that talks ABOUT a retired name instead of teaching it (the task-204 §3 verbatim list). */
const NAME_NEGATION = /不存在|不是|旧|未登记|别写|不要/

/** JSON literals are not names: a brief that says `null` teaches nothing about the product. */
const NAME_LITERALS = new Set(['null', 'true', 'false', 'undefined'])

/** The task's THREE shapes, narrow on purpose (task-204 §6: 宁窄勿宽 — only backticks, only these shapes). */
const NAME_TOOL = /^vibe_[a-z0-9_]+$/
/**
 * FIELD-SHAPED means snake_case (at least one `_`), which is how this product names fields (`set_solved`,
 * `failedSteps` is camel but only ever appears inside calls). A single lower-case English word inside
 * backticks is usually a COMMAND or a piece of prose the brief quotes (`taskkill`, `grep`), not a field
 * claim — flagging those is the false-positive class the task says to avoid, so the shape is narrowed.
 */
const NAME_FIELD = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/
const NAME_ACTION_VALUE = /\b(?:action|op)\s*:\s*"([A-Za-z0-9_.-]+)"/g
const NAME_TOOL_IN_CALL = /vibe_[a-z0-9_]+/g
/**
 * An action value can be real WITHOUT an `enum`: `vibe_vmu_turn`'s `op` is a free string and the closed
 * set lives in the dispatch (`op === 'step'`, `case 'drive':`). The value a brief may teach is therefore
 * "enum value OR a literal the code compares against" — derived from the source, never transcribed here.
 */
const NAME_ACTION_LITERAL = /(?:\b(?:op|action)\s*(?:===?|!==?)\s*|case\s+)'([A-Za-z][A-Za-z0-9_.-]{0,40})'/g

/** Source files whose declared property keys are the product's vocabulary (no hand list of names!). */
function collectSourceFiles(dir, out) {
  let entries
  try { entries = readdirSync(dir) } catch (e) { return }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'archive' || name.startsWith('.')) continue
    const path = join(dir, name)
    let stat
    try { stat = statSync(path) } catch (e) { continue }
    if (stat.isDirectory()) { collectSourceFiles(path, out); continue }
    if (/\.(js|mjs)$/.test(name)) out.push(path)
  }
}

/** Object-literal property keys on one line: `k:` at line start, `{ k:` / `, k:` inline, and shorthand `k,`. */
function propertyKeysOf(text) {
  const keys = []
  for (const line of text.split('\n')) {
    const atStart = /^\s*(?:'([A-Za-z_$][\w$]*)'|"([A-Za-z_$][\w$]*)"|([A-Za-z_$][\w$]*))\s*:/.exec(line)
    if (atStart) { keys.push(atStart[1] || atStart[2] || atStart[3]); continue }
    const shorthand = /^\s*([A-Za-z_$][\w$]*)\s*,\s*$/.exec(line)
    if (shorthand) { keys.push(shorthand[1]); continue }
    const inline = /[{,]\s*(?:'([A-Za-z_$][\w$]*)'|"([A-Za-z_$][\w$]*)"|([A-Za-z_$][\w$]*))\s*:/g
    let m
    while ((m = inline.exec(line))) keys.push(m[1] || m[2] || m[3])
  }
  return keys
}

/**
 * TB-2721: the KNOWN-NAME universe, derived at run time.
 *   tools/params/actions  — `buildCatalog()` (the same declarations the call checks use).
 *   fields                — every object-literal property key the source under `vibe-math-vmu/` and `scripts/`
 *                           declares. ★ Derived, not copied: a field that the code stops producing disappears
 *                           from this set, and a name that only ever lived in prose (`set_solved`) is not in it.
 */
export function buildKnownNames(catalog, { repo = REPO } = {}) {
  const tools = new Set(catalog.tools.keys())
  const params = new Set()
  const actions = new Set()
  for (const spec of catalog.tools.values()) {
    for (const [name, decl] of Object.entries(spec.parameters || {})) {
      params.add(name)
      if (decl && Array.isArray(decl.enum)) for (const value of decl.enum) if (typeof value === 'string') actions.add(value)
    }
  }
  const fields = new Set()
  const files = []
  collectSourceFiles(join(repo, 'vibe-math-vmu'), files)
  collectSourceFiles(join(repo, 'scripts'), files)
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const key of propertyKeysOf(text)) fields.add(key)
    NAME_ACTION_LITERAL.lastIndex = 0
    let literal
    while ((literal = NAME_ACTION_LITERAL.exec(text))) actions.add(literal[1])
  }
  return { tools, params, actions, fields, sourceFiles: files.length }
}

/**
 * Every backticked identifier the task's three shapes recognise, with its 1-based line.
 * Narration outside backticks is never touched — that is the rule that keeps prose ("把 `member` 填自己") quiet.
 */
export function extractBacktickedNames(rawText) {
  const text = String(rawText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const found = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const backtick = /`([^`\n]*)`/g
    let b
    while ((b = backtick.exec(line))) {
      const token = b[1].trim()
      const lineNo = i + 1
      if (NAME_TOOL.test(token)) found.push({ name: token, kind: 'tool', line: lineNo })
      else {
        NAME_TOOL_IN_CALL.lastIndex = 0
        let t
        while ((t = NAME_TOOL_IN_CALL.exec(token))) {
          if (t.index > 0 && /[A-Za-z0-9_]/.test(token[t.index - 1])) continue
          found.push({ name: t[0], kind: 'tool', line: lineNo })
        }
      }
      NAME_ACTION_VALUE.lastIndex = 0
      let a
      while ((a = NAME_ACTION_VALUE.exec(b[1]))) found.push({ name: a[1], kind: 'action', line: lineNo })
      if (!NAME_TOOL.test(token) && !NAME_LITERALS.has(token) && NAME_FIELD.test(token)) found.push({ name: token, kind: 'field', line: lineNo })
    }
  }
  const seen = new Set()
  return found.filter((candidate) => {
    const id = candidate.kind + '|' + candidate.name + '|' + candidate.line
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * TB-2721: check the NAMES a brief teaches. Separate from the call checks on purpose — a call is validated by
 * its shape (`name { … }`), a name by its EXISTENCE in the derived universe. The negation escape is per LINE:
 * a brief is allowed to say "`set_solved` is not a legal field"; it is not allowed to say "结题票写 `set_solved`".
 */
export function checkBriefNames(path, rawText, known) {
  const text = String(rawText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const problems = []
  for (const candidate of extractBacktickedNames(text)) {
    const { name, kind, line } = candidate
    let knownName
    if (kind === 'tool') knownName = known.tools.has(name)
    else if (kind === 'action') knownName = known.actions.has(name)
    else knownName = known.fields.has(name) || known.params.has(name) || known.actions.has(name) || NAME_LITERALS.has(name)
    if (knownName) continue
    const lineText = (lines[line - 1] || '').trim()
    if (NAME_NEGATION.test(lineText)) continue
    problems.push(problem({
      file: path,
      line,
      tool: kind === 'tool' ? name : null,
      param: kind === 'field' ? name : null,
      code: NAME_CODES.unknownName,
      message: name + ' at line ' + line + ' — a brief may not teach a name that does not exist (unless it says so in the same line)',
      hint: kind === 'tool'
        ? 'a brief is an executed interface: name a tool the registry declares (host.js#toolSpecs), or say in the same line that the old name does not exist'
        : kind === 'action'
          ? 'name an action value a declaration accepts (`enum` of the action/op parameter), or say in the same line that the old value is retired'
          : 'name a declared parameter or a field the product produces; if the sentence is about a RETIRED name, say 不存在/旧/未登记 in the same line',
      legal: null,
      lineText,
    }))
  }
  return problems
}

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

/** TB-2721: proof that the NAME checks bite — an invented tool/field is caught, a negated sentence is not. */
export function selfProbeNames(catalog, known) {
  const cases = [
    { name: 'control-known-name-parameter', expected: [], text: '1) `problem` 用第 0 节的原文逐字。\n' },
    { name: 'control-known-name-tool', expected: [], text: '1) 调用 `vibe_v5_start {}`。\n' },
    { name: 'plant-unknown-name-tool', expected: [NAME_CODES.unknownName], text: '1) 调用 `vibe_zzz_name_probe_absent`。\n' },
    { name: 'plant-unknown-name-field', expected: [NAME_CODES.unknownName], text: '1) 结题票写 `zzz_self_probe_absent_field`。\n' },
    { name: 'control-negated-unknown-name', expected: [], text: '1) `zzz_self_probe_absent_field` 不是合法字段。\n' },
    { name: 'plant-unknown-action-value', expected: [NAME_CODES.unknownName], text: '1) `vibe_v5_paper { action:"zzz_self_probe_absent_action" }`\n' },
  ]
  const results = []
  const failures = []
  for (const c of cases) {
    const got = checkBriefNames('<self-probe-names>', c.text, known).map((p) => p.code)
    const pass = c.expected.length === 0 ? got.length === 0 : c.expected.every((code) => got.includes(code))
    results.push({ name: c.name, expected: c.expected, got, pass, text: c.text })
    if (!pass) failures.push(c.name + ' planted ' + JSON.stringify(c.text) + ' but the naming gate reported ' + JSON.stringify(got))
  }
  return { results, failures }
}

/** Line numbers are 1-based over the normalised text (the same convention as the call problems). */
function structureProblem(path, line, code, message, hint) {
  return problem({ file: path, line, tool: null, param: null, code, message, hint, legal: null, lineText: '' })
}

/**
 * TB-2612 / task-91: check the STRUCTURE of a run brief. Separate from checkBriefText on purpose — the call
 * checks answer "is this name declared?", the structure checks answer "does this brief tell four seats what
 * they each do, and does it refuse to hand their work to the office?". AUTO mode: only a file that carries
 * `## ` headings is treated as a brief (a bare call-snippet fixture from the declaration suite stays silent).
 * @returns problems[] with the STRUCTURE_CODES codes.
 */
export function checkBriefStructure(path, rawText, opts = {}) {
  const text = String(rawText).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const force = opts.force === 'on' ? true : opts.force === 'off' ? false : null
  const looksLikeBrief = lines.some((line) => /^#{1,6}\s/.test(line))
  if (force === false || (force === null && !looksLikeBrief)) return []
  const isTemplate = opts.template === true || /RUN-BRIEF-TEMPLATE\.md$/i.test(path)
  const problems = []

  // 0. the placeholder-problem declaration, verbatim, on its own line
  const placeholderLine = lines.findIndex((line) => line.includes(PLACEHOLDER))
  if (placeholderLine < 0) {
    problems.push(structureProblem(path, 1, STRUCTURE_CODES.placeholder,
      'the placeholder-problem declaration is missing',
      'add this line verbatim as section 0: ' + PLACEHOLDER))
  }

  // 1. four seats, each with its own section; the problem NAMES the missing seat
  const headings = []
  for (let i = 0; i < lines.length; i++) if (/^#{1,6}\s/.test(lines[i])) headings.push(i)
  for (const seat of SEATS) {
    const at = headings.find((i) => seat.heading.test(lines[i]))
    if (at === undefined) {
      problems.push(structureProblem(path, 1, STRUCTURE_CODES.seat,
        'missing the section for seat ' + seat.label,
        'give ' + seat.label + ' its own `## ` section (a brief with three seats cannot hand work to the fourth)'))
    }
  }

  // 2. the four-column self-test table header
  if (!RULE_TABLE.test(text)) {
    problems.push(structureProblem(path, 1, STRUCTURE_CODES.ruleTable,
      'the four-column self-test table header is missing',
      'add a header row: 规则条号 | 期望 | 实测 | 判定 | 建议'))
  }

  // 3. a prompt-critique section
  if (!/^#{1,6}[^\n]*提示词/m.test(text)) {
    problems.push(structureProblem(path, 1, STRUCTURE_CODES.critique,
      'the prompt-critique section is missing',
      'add a section whose heading names 提示词 (unreasonable / contradictory / too long / wrong timing / wrong place)'))
  }

  // 4. wording that hands a seat's own writing to the office
  for (const phrase of FORBIDDEN) {
    let from = 0
    while (true) {
      const at = text.indexOf(phrase, from)
      if (at < 0) break
      const line = lineOf(text, at)
      problems.push(structureProblem(path, line, STRUCTURE_CODES.forbidden,
        'forbidden office-substitute wording `' + phrase + '`',
        'a brief may say the office only RELAYS what the seat wrote, never that it writes it; rewrite the sentence'))
      from = at + phrase.length
    }
  }

  // 5. the TEMPLATE caps (a template is copied, so its size is the ceiling of every brief made from it)
  if (isTemplate) {
    if (lines.length > TEMPLATE_MAX_LINES + 1) {
      problems.push(structureProblem(path, 1, STRUCTURE_CODES.tooLong,
        'the template is ' + (lines.length - 1) + ' lines, over its ' + TEMPLATE_MAX_LINES + '-line cap',
        'move detail into the table sections, or delete prose — do NOT raise the cap'))
    }
    for (const seat of SEATS) {
      const at = headings.find((i) => seat.heading.test(lines[i]))
      if (at === undefined) continue
      let end = lines.length
      for (const h of headings) if (h > at) { end = h; break }
      // body lines only (the heading itself is not counted), blank lines are ignored
      let body = 0
      for (let i = at + 1; i < end; i++) if (lines[i].trim() !== '') body++
      if (body > SEAT_MAX_LINES) {
        problems.push(structureProblem(path, at + 1, STRUCTURE_CODES.seatTooLong,
          'the section for seat ' + seat.label + ' has ' + body + ' body lines, over its ' + SEAT_MAX_LINES + '-line cap',
          'keep one seat section to what that seat must DO this run; move detail to the proof-point table'))
      }
    }
  }
  return problems
}

/** A minimal but VALID brief: used as the control and as the base the structure probes delete from. */
export function structureFixture() {
  return [
    '# RUN BRIEF（fixture）',
    '## 0 占位题声明',
    '',
    '> ' + PLACEHOLDER,
    '',
    '## 1 立所',
    '- 开所：`vibe_v5_start {}`',
    '',
    '## 2 席位与本轮各自任务',
    '### 2.0 所办（office）',
    '- 你只派回合与转达',
    '### 2.1 主席（chair）',
    '- 你主持会议',
    '### 2.2 成员（member）',
    '- 你写自己的卡',
    '### 2.3 临时工（temp）',
    '- 你做一次性的活',
    '',
    '## 3 验点清单',
    '| 规则条号 | 期望 | 实测 | 判定 | 建议 |',
    '| --- | --- | --- | --- | --- |',
    '| L1 | 回执有 id | 待填 | PASS | 无 |',
    '',
    '## 4 缺陷记录纪律',
    '- file:line + 现象 + 建议',
    '',
    '## 5 提示词批评专章',
    '- 原句 → 建议',
    '',
    '## 6 纪律',
    '- 一次一调用',
    '',
    '## 7 上界与落盘时刻',
    '- 30 分钟写第一版',
    '',
    '## 8 结题判据',
    '- 四席表格齐',
    '',
    '## 9 报告清单',
    '- REPORT.md',
    '',
  ].join('\n')
}

/** Proof that the STRUCTURE checks bite: delete one required part at a time and require it to be named. */
export function selfProbeStructure() {
  const fixture = structureFixture()
  const cases = [{ name: 'control-valid-structure', expected: [], text: fixture }]
  for (const seat of SEATS) {
    const kept = fixture.split('\n').filter((line) => !seat.heading.test(line)).join('\n')
    cases.push({ name: 'plant-missing-seat-' + seat.key, expected: [STRUCTURE_CODES.seat], text: kept })
  }
  cases.push({ name: 'plant-missing-placeholder', expected: [STRUCTURE_CODES.placeholder], text: fixture.split(PLACEHOLDER).join('（声明被删）') })
  cases.push({ name: 'plant-missing-rule-table', expected: [STRUCTURE_CODES.ruleTable], text: fixture.split('| 规则条号 | 期望 | 实测 | 判定 | 建议 |').join('| 结果表 |') })
  cases.push({ name: 'plant-missing-critique', expected: [STRUCTURE_CODES.critique], text: fixture.split('## 5 提示词批评专章').join('## 5 意见') })
  cases.push({ name: 'plant-forbidden-wording', expected: [STRUCTURE_CODES.forbidden], text: fixture + '\n- 所办替成员填表\n' })
  const longTemplate = '# t\n' + fixture + Array.from({ length: 200 }, (_, i) => '- filler ' + i).join('\n')
  cases.push({ name: 'plant-template-too-long', expected: [STRUCTURE_CODES.tooLong], text: longTemplate })
  const fatSeat = fixture.split('### 2.2 成员（member）\n- 你写自己的卡').join('### 2.2 成员（member）\n' + Array.from({ length: 20 }, (_, i) => '- seat filler ' + i).join('\n'))
  cases.push({ name: 'plant-seat-too-long', expected: [STRUCTURE_CODES.seatTooLong], text: fatSeat })
  const results = []
  const failures = []
  for (const c of cases) {
    const got = checkBriefStructure('<self-probe-template.md>', c.text, { template: true }).map((p) => p.code)
    const pass = c.expected.length === 0 ? got.length === 0 : c.expected.every((code) => got.includes(code))
    results.push({ name: c.name, expected: c.expected, got, pass })
    if (!pass) failures.push(c.name + ' planted ' + JSON.stringify(c.text.slice(0, 200)) + ' but the checker reported ' + JSON.stringify(got))
  }
  return { results, failures }
}

function renderHuman(report, catalog) {
  const out = []
  for (const p of report.problems) {
    out.push(p.file + ':' + p.line + ': ' + p.code + '  ' + p.message)
    if (p.lineText) out.push('    line ' + p.line + ': ' + p.lineText)
    if (p.tool !== null && p.tool !== undefined && p.legal && p.code !== CODES.unknownTool) {
      out.push('    legal parameters of `' + p.tool + '`: ' + p.legal)
    }
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
  let structureForce = null
  for (const arg of argv) {
    if (arg === '--json') { asJson = true; continue }
    if (arg === '--self-probe') { probe = true; continue }
    if (arg === '--structure') { structureForce = 'on'; continue }
    if (arg === '--no-structure') { structureForce = 'off'; continue }
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
    const known = buildKnownNames(catalog)
    const probeReport = selfProbe(catalog)
    const nameProbe = selfProbeNames(catalog, known)
    const structureProbe = selfProbeStructure()
    probeReport.results = probeReport.results.concat(structureProbe.results).concat(nameProbe.results)
    probeReport.failures = probeReport.failures.concat(structureProbe.failures).concat(nameProbe.failures)
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
  const known = buildKnownNames(catalog)
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
    const report = checkBriefText(file, text, catalog)
    const structural = checkBriefStructure(file, text, { force: structureForce })
    const naming = checkBriefNames(file, text, known)
    report.problems = structural.concat(naming, report.problems)
    report.structure = structural.length
    report.names = naming.length
    reports.push(report)
  }
  const total = reports.reduce((n, r) => n + r.problems.length, 0)
  if (asJson) {
    process.stdout.write(JSON.stringify(jsonReport(reports, catalog, {
      names: { tools: known.tools.size, parameters: known.params.size, actionValues: known.actions.size, propertyKeys: known.fields.size, sourceFiles: known.sourceFiles },
    }), null, 2) + '\n')
  } else {
    process.stdout.write('check-task-brief: derived ' + catalog.tools.size + ' tools from the declarations (' + catalog.host + ' host faces + ' + catalog.pack + ' pack tools)\n')
    process.stdout.write('check-task-brief: naming gate knows ' + known.tools.size + ' tools, ' + known.params.size + ' parameters, ' +
      known.actions.size + ' action values, ' + known.fields.size + ' property keys from ' + known.sourceFiles + ' source files\n')
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
