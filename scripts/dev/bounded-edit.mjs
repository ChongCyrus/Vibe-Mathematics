// A reusable bounded editor. Round 233 produced four distinct breakages from ONE root cause: a textual edit that matched the
// first occurrence in a file instead of being confined to the function it meant to change. This tool makes that impossible:
//
//   · the target function is located by its SIGNATURE, never by a bare pattern;
//   · its end is found by BRACE COUNTING, not by the first line that looks like a closing brace;
//   · the span is checked for plausibility (a named maximum) and the whole operation ABORTS if it is not;
//   · replacements are applied only inside that span, and the count is reported - zero means the edit was a no-op and must be
//     treated as a failure rather than as success;
//   · a diff summary is printed so the caller can see the size of what it just did.
//
// Used as a library: import { boundedEdit } from './bounded-edit.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/** Find a function's span by signature + brace counting. Returns { start, end } or null. */
export function functionSpan(lines, signature) {
  const start = lines.findIndex((l) => signature.test(l))
  if (start < 0) return null
  // count braces from the signature line onwards; a one-line arrow body has no new braces and closes immediately
  let depth = 0
  let seen = false
  for (let i = start; i < lines.length; i += 1) {
    const text = lines[i].replace(/\/\/.*$/, '').replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
    for (const ch of text) {
      if (ch === '{') { depth += 1; seen = true }
      else if (ch === '}') depth -= 1
    }
    if (seen && depth === 0) return { start, end: i }
  }
  return null
}

/**
 * Apply literal replacements INSIDE one function.
 * @param {object} o
 * @param {string} o.file        path to edit
 * @param {RegExp} o.signature   identifies the function (must match exactly one line)
 * @param {Array<[string,string]>} o.edits   literal [from, to] pairs, applied inside the span only
 * @param {number} [o.maxLines]  plausibility bound (default 120)
 * @param {boolean} [o.requireAll]  fail if any edit did not apply (default true)
 */
export function boundedEdit({ file, signature, edits, maxLines = 120, requireAll = true, label = '' }) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const span = functionSpan(lines, signature)
  if (!span) { console.log('  ABORT ' + label + ': the signature was not found'); return false }
  const size = span.end - span.start + 1
  console.log('  ' + label + ': ' + file.split('/').pop() + ' L' + (span.start + 1) + '..L' + (span.end + 1) + ' (' + size + ' lines)')
  if (size > maxLines) { console.log('  ABORT ' + label + ': the span exceeds ' + maxLines + ' lines, which cannot be right'); return false }

  let body = lines.slice(span.start, span.end + 1).join('\n')
  let applied = 0
  const missed = []
  for (const [from, to] of edits) {
    const n = body.split(from).length - 1
    if (n === 1) { body = body.split(from).join(to); applied += 1 }
    else missed.push('n=' + n + ' ' + from.trim().slice(0, 52))
  }
  if (requireAll && applied !== edits.length) {
    console.log('  ABORT ' + label + ': ' + applied + '/' + edits.length + ' applied')
    for (const m of missed) console.log('      missed ' + m)
    return false
  }
  const out = lines.slice(0, span.start).concat(body.split('\n'), lines.slice(span.end + 1)).join('\n')
  writeFileSync(file, out)
  console.log('  OK ' + label + ': ' + applied + '/' + edits.length + ' applied inside the function')
  return true
}

/** Print the diff size for the files this tool touched, so damage is visible rather than assumed. */
export function diffStat(files) {
  try {
    const out = execSync('git diff --stat -- ' + files.join(' '), { encoding: 'utf8' }).trim()
    console.log('  diff: ' + (out || '(no changes)').replace(/\n/g, ' | '))
  } catch (e) { console.log('  diff: unavailable') }
}
