// tests/_lib/strip-comments.mjs — a CORRECT comment/string blanker for the source-text guards.
//
// Why a state machine and not a regex pair: the first attempt at this used `src.replace(/\/\*[\s\S]*?\*\//g,'')`
// plus a line-comment regex and removed 20745 of 48092 characters of kernel/index.js (37 services reported
// unbound). Regexes cannot track string state, escapes, template interpolations or nesting - a character
// scanner can, and it is easy to prove correct: the output has EXACTLY the same length as the input.
//
// CONTRACT
//   · length is preserved: every consumed character emits exactly one character (code characters verbatim,
//     comment/string CONTENT replaced by a space, newlines kept so line structure survives);
//   · the output contains no comment text and no string CONTENT (so `// const x = createY(` and
//     `"const x = createY("` can no longer make a binding look present);
//   · handles: `//`, `/* … */`, `'…'`, `"…"`, `` `…` `` with `\` escapes, and `${ … }` interpolations
//     (the interpolation is CODE, so a binding inside `${}` is still visible - with nested templates);
//   · never throws: an unterminated comment/string simply consumes the rest of the input.

const isNewline = (ch) => ch === '\n' || ch === '\r'

/**
 * Blank out comments (and, optionally, string CONTENTS) while preserving the exact length of the input.
 *
 * Two modes, because the two questions are different:
 *   · `stripComments(text)`                 -> comments blanked, string CONTENTS KEPT. Use this for scans that
 *                                              must read string literals (e.g. `registry.register('vmu.x'`).
 *   · `stripComments(text,{strings:true})`  -> comments AND string contents blanked. Use this for BINDING
 *                                              detection, where a string like "const x = createY(" must not
 *                                              count as code.
 * @param {string} text
 * @param {{strings?: boolean}} [opts]
 * @returns {string}
 */
export function stripComments(text, opts = {}) {
  const keepStrings = opts.strings !== true
  const s = String(text == null ? '' : text)
  const n = s.length
  const out = new Array(n)
  // Context stack. `code` frames also track brace depth so an interpolation knows where it ends.
  const stack = [{ kind: 'code', braces: 0 }]
  const top = () => stack[stack.length - 1]
  let i = 0
  while (i < n) {
    const ctx = top()
    const ch = s[i]
    const nx = i + 1 < n ? s[i + 1] : ''
    if (ctx.kind === 'line') {
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
    if (ctx.kind === 'sq' || ctx.kind === 'dq') {
      const quote = ctx.kind === 'sq' ? "'" : '"'
      if (ch === '\\') { out[i] = keepStrings ? ch : ' '; out[i + 1] = i + 1 < n ? (keepStrings ? nx : ' ') : ''; i += 2; continue }
      if (ch === quote) { out[i] = ch; i++; ctx.kind = 'code'; continue }
      out[i] = keepStrings ? ch : (isNewline(ch) ? ch : ' ')
      i++
      continue
    }
    if (ctx.kind === 'tpl') {
      if (ch === '\\') { out[i] = keepStrings ? ch : ' '; out[i + 1] = i + 1 < n ? (keepStrings ? nx : ' ') : ''; i += 2; continue }
      if (ch === '`') { out[i] = ch; i++; stack.pop(); continue }
      if (ch === '$' && nx === '{') { out[i] = '$'; out[i + 1] = '{'; i += 2; stack.push({ kind: 'code', braces: 0, interp: true }); continue }
      out[i] = keepStrings ? ch : (isNewline(ch) ? ch : ' ')
      i++
      continue
    }
    // ctx.kind === 'code'
    if (ch === '/' && nx === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; ctx.kind = 'line'; continue }
    if (ch === '/' && nx === '*') { out[i] = ' '; out[i + 1] = ' '; i += 2; ctx.kind = 'block'; continue }
    if (ch === "'") { out[i] = ch; i++; stack.push({ kind: 'sq' }); continue }
    if (ch === '"') { out[i] = ch; i++; stack.push({ kind: 'dq' }); continue }
    if (ch === '`') { out[i] = ch; i++; stack.push({ kind: 'tpl' }); continue }
    if (ch === '{') { ctx.braces++; out[i] = ch; i++; continue }
    if (ch === '}') {
      if (ctx.interp && ctx.braces === 0) { out[i] = ch; i++; stack.pop(); continue }   // back into the template
      if (ctx.braces > 0) ctx.braces--
      out[i] = ch; i++
      continue
    }
    out[i] = ch
    i++
  }
  // `new Array(n)` with unset slots can only happen if a 2-char escape ran past the end; normalise.
  for (let k = 0; k < n; k++) if (out[k] === undefined) out[k] = ' '
  return out.join('')
}

/** Convenience: how much of the input survived, plus the stripped text (same options as `stripComments`). */
export function stripStats(text, opts = {}) {
  const raw = String(text == null ? '' : text)
  const stripped = stripComments(raw, opts)
  return { rawLength: raw.length, strippedLength: stripped.length, ratio: raw.length ? stripped.length / raw.length : 1, stripped }
}
