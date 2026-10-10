// tests/_lib/strip-comments.mjs — a CORRECT comment/string/regex blanker for the source-text guards.
//
// Why a state machine and not a regex pair: the first attempt at this used `src.replace(/\/\*[\s\S]*?\*\//g,'')`
// plus a line-comment regex and removed 20745 of 48092 characters of kernel/index.js (37 services reported
// unbound). Regexes cannot track string state, escapes, template interpolations, REGEX LITERALS and JS line
// terminators - a character scanner can, and it is easy to prove correct: the output has EXACTLY the same
// length as the input.
//
// CONTRACT
//   · length is preserved: every consumed character emits exactly one character (code characters verbatim,
//     comment/string/regex CONTENT replaced by a space, line terminators kept so line structure survives);
//   · neither a comment, nor a string, nor a REGEX BODY can fake a binding (round-7 + round-8 holes closed);
//   · handles: `//`, `/* … */`, `'…'`, `"…"`, `` `…` `` with `\` escapes; `${ … }` interpolations (the
//     interpolation is CODE, so a binding inside `${}` stays visible); REGEX LITERALS in expression position
//     (respecting `[...]` character classes and `\/` escapes); the four JS line terminators LF / CR /
//     U+2028 / U+2029 (so `// c\u2028const x = 1` does NOT blank the next line);
//   · a leading shebang (`#!…`) is a comment line (blanked, terminator preserved - CRLF stays intact);
//   · never throws: an unterminated comment/string/regex consumes the rest of the input.
//
// MODES (two questions, two views)
//   · `stripComments(text)`                -> comments blanked, string/regex CONTENTS KEPT. Use for scans that
//                                            must read string literals (e.g. `registry.register('vmu.x'`).
//   · `stripComments(text,{strings:true})` -> comments AND string/regex contents blanked. Use for BINDING
//                                            detection, where `"const x = createY("` must not count as code.
//
// REGEX POSITION HEURISTIC (documented, deliberately conservative): `/` starts a regex when the previous
// significant code character is NOT an identifier char, `)`, `]` or `}`; after an identifier char it starts a
// regex only for the keywords in REGEX_KEYWORDS (`return /re/`, `typeof /re/`, …). Everything else reads as
// division. A wrong "regex" reading only skips a body; a wrong "division" reading only emits `/` - neither can
// blank real code, which is what keeps the guards free of false reds.

const LS = '\u2028'
const PS = '\u2029'
/** JS line terminators: LF, CR, LINE SEPARATOR, PARAGRAPH SEPARATOR. */
const isNewline = (ch) => ch === '\n' || ch === '\r' || ch === LS || ch === PS
const isIdentChar = (ch) => typeof ch === 'string' && ch.length === 1 && /[A-Za-z0-9_$]/.test(ch)
/** Keywords after which `/` starts a REGEX rather than a division. */
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'case', 'yield', 'await', 'throw'])

/**
 * Blank out comments and (optionally) string/regex contents while preserving the exact length of the input.
 * @param {string} text
 * @param {{strings?: boolean}} [opts] `strings:true` also blanks string and regex contents.
 * @returns {string}
 */
export function stripComments(text, opts = {}) {
  const keepStrings = opts.strings !== true
  const s = String(text == null ? '' : text)
  const n = s.length
  const out = new Array(n)
  const stack = [{ kind: 'code', braces: 0 }]
  const top = () => stack[stack.length - 1]

  // Expression-position tracker for regex literals. `prev` is the last significant (non-whitespace) code
  // character; `word` is the identifier ending at it (rebuilt from scratch on every non-identifier).
  let prev = null
  let word = ''
  const noteCode = (ch) => {
    if (/\s/.test(ch)) return
    if (isIdentChar(ch)) word = isIdentChar(prev) ? word + ch : ch
    else word = ''
    prev = ch
  }
  const regexAllowed = () => {
    if (prev === null) return true
    if (prev === ')' || prev === ']' || prev === '}') return false
    if (isIdentChar(prev)) return REGEX_KEYWORDS.has(word)
    return true
  }

  let i = 0
  // Hashbang (`#!…`) at position 0: a comment line. Its terminator is kept, so CRLF survives byte-for-byte.
  if (s[0] === '#' && s[1] === '!') while (i < n && !isNewline(s[i])) { out[i] = ' '; i++ }

  while (i < n) {
    const ctx = top()
    const ch = s[i]
    const nx = i + 1 < n ? s[i + 1] : ''
    if (ctx.kind === 'line') {
      // `//` ends at ANY JS line terminator (LF / CR / U+2028 / U+2029) - round-8 hole #4.
      if (isNewline(ch)) { ctx.kind = 'code'; out[i] = ch } else out[i] = ' '
      i++
      continue
    }
    if (ctx.kind === 'block') {
      if (ch === '*' && nx === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; ctx.kind = 'code'; continue }
      out[i] = isNewline(ch) ? ch : ' '
      i++
      continue
    }
    if (ctx.kind === 'regex') {
      // Regex body: escapes and `[...]` character classes are tracked, so `/*`, a backtick or a quote INSIDE
      // the regex can never start a comment/string (round-8 holes #1-#3).
      if (ch === '\\') { const blank = !keepStrings; out[i] = blank ? ' ' : ch; if (i + 1 < n) out[i + 1] = blank ? ' ' : nx; i += 2; continue }
      if (ch === '[' && !ctx.inClass) { ctx.inClass = true; out[i] = ch; i++; continue }
      if (ch === ']' && ctx.inClass) { ctx.inClass = false; out[i] = ch; i++; continue }
      if (ch === '/' && !ctx.inClass) {
        out[i] = ch
        i++
        while (i < n && /[a-z]/i.test(s[i])) { out[i] = s[i]; i++ }      // flags are code
        stack.pop()
        prev = '/'; word = ''
        continue
      }
      out[i] = keepStrings ? ch : (isNewline(ch) ? ch : ' ')
      i++
      continue
    }
    if (ctx.kind === 'sq' || ctx.kind === 'dq') {
      const quote = ctx.kind === 'sq' ? "'" : '"'
      if (ch === '\\') { const blank = !keepStrings; out[i] = blank ? ' ' : ch; if (i + 1 < n) out[i + 1] = blank ? ' ' : nx; i += 2; continue }
      if (ch === quote) { out[i] = ch; i++; ctx.kind = 'code'; noteCode(ch); continue }
      out[i] = keepStrings ? ch : (isNewline(ch) ? ch : ' ')
      i++
      continue
    }
    if (ctx.kind === 'tpl') {
      if (ch === '\\') { const blank = !keepStrings; out[i] = blank ? ' ' : ch; if (i + 1 < n) out[i + 1] = blank ? ' ' : nx; i += 2; continue }
      if (ch === '`') { out[i] = ch; i++; stack.pop(); noteCode(ch); continue }
      if (ch === '$' && nx === '{') {
        out[i] = '$'; out[i + 1] = '{'; i += 2
        prev = '{'; word = ''                                            // interpolation is CODE
        stack.push({ kind: 'code', braces: 0, interp: true })
        continue
      }
      out[i] = keepStrings ? ch : (isNewline(ch) ? ch : ' ')
      i++
      continue
    }
    // ctx.kind === 'code'
    if (ch === '/' && nx === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; ctx.kind = 'line'; continue }
    if (ch === '/' && nx === '*') { out[i] = ' '; out[i + 1] = ' '; i += 2; ctx.kind = 'block'; continue }
    if (ch === '/' && regexAllowed()) {
      out[i] = '/'; i++
      stack.push({ kind: 'regex', inClass: false })
      continue
    }
    if (ch === "'") { out[i] = ch; i++; stack.push({ kind: 'sq' }); continue }
    if (ch === '"') { out[i] = ch; i++; stack.push({ kind: 'dq' }); continue }
    if (ch === '`') { out[i] = ch; i++; stack.push({ kind: 'tpl' }); continue }
    if (ch === '{') { ctx.braces++; out[i] = ch; i++; noteCode(ch); continue }
    if (ch === '}') {
      if (ctx.interp && ctx.braces === 0) { out[i] = ch; i++; stack.pop(); prev = '}'; word = ''; continue }
      if (ctx.braces > 0) ctx.braces--
      out[i] = ch; i++; noteCode(ch); continue
    }
    out[i] = ch
    i++
    noteCode(ch)
  }
  for (let k = 0; k < n; k++) if (out[k] === undefined) out[k] = ' '
  return out.join('')
}

/** Convenience: how much of the input survived, plus the stripped text (same options as `stripComments`). */
export function stripStats(text, opts = {}) {
  const raw = String(text == null ? '' : text)
  const stripped = stripComments(raw, opts)
  return { rawLength: raw.length, strippedLength: stripped.length, ratio: raw.length ? stripped.length / raw.length : 1, stripped }
}
