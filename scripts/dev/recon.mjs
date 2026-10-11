// Reconnaissance helpers for edits: measure BEFORE writing.
//
// WHY: round 249's four mistakes were all semantic - a wrong export name, a replacement indexed by occurrence rather than by match,
// an array treated as a Set, and one of two similar lines changed. The anchored and positional tools already make STRUCTURAL
// mistakes impossible (a missed anchor throws and writes nothing). These four functions make the semantic class measurable in the
// same spirit: ask the repository what the name is, what the value is, and how many places say the same thing.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Accept either a filesystem path or an already-formed file URL - callers write both, and re-wrapping the latter produced
 * `file:\D:\...`, which is not a URL at all. */
const asUrl = (p) => (typeof p === 'string' && /^file:\/\//i.test(p) ? p : pathToFileURL(p).href)

/** The REAL export names of a module - so a name is never guessed. */
export async function exportsOf(modulePath) {
  const mod = await import(asUrl(modulePath))
  return Object.keys(mod).sort()
}

/** Check a claimed export exists, and list the near misses when it does not. Throws: a wrong name must not travel further. */
export async function expectExport(modulePath, name) {
  const names = await exportsOf(modulePath)
  if (names.includes(name)) return { ok: true, name, count: names.length }
  const near = names.filter((n) => n.toLowerCase().includes(name.toLowerCase().slice(0, 4)))
  throw new Error('EXPORT MISS in ' + modulePath + ': no export named ' + JSON.stringify(name) + '\n' +
    '  actual exports (' + names.length + '): ' + names.join(', ') + '\n' +
    (near.length ? '  near misses: ' + near.join(', ') : '  no near miss'))
}

/** What a value IS - the distinction that `typeof` hides (an Array is an object). */
export function kindOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'Array'
  if (v instanceof Set) return 'Set'
  if (v instanceof Map) return 'Map'
  if (typeof v === 'object') return 'object'
  return typeof v
}

/** Assert a value's kind, naming what it was instead. Throws on mismatch. */
export function expectKind(v, kind, what = 'value') {
  const actual = kindOf(v)
  if (actual === kind) return { ok: true, kind: actual }
  throw new Error('KIND MISS: ' + what + ' should be ' + kind + ' but is ' + actual +
    (actual === 'Array' ? ' (length ' + v.length + ')' : ''))
}

/** How many times a literal occurs, with the line numbers - so a two-site change cannot be a one-site change. */
export function countOf(file, literal) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const hits = []
  for (let i = 0; i < lines.length; i += 1) {
    let from = 0
    for (;;) {
      const at = lines[i].indexOf(literal, from)
      if (at === -1) break
      hits.push(i + 1)
      from = at + literal.length
    }
  }
  return { count: hits.length, lines: hits, literal }
}

/** Assert a literal occurs exactly `n` times (default 1), listing every site when it does not. */
export function expectCount(file, literal, n = 1) {
  const r = countOf(file, literal)
  if (r.count === n) return r
  const text = readFileSync(file, 'utf8').split('\n')
  throw new Error('COUNT MISS in ' + file + ': ' + JSON.stringify(literal.slice(0, 60)) + ' occurs ' + r.count + ' time(s), expected ' + n +
    '\n' + r.lines.map((ln) => '  L' + ln + ': ' + String(text[ln - 1]).trim().slice(0, 110)).join('\n'))
}

/** The lines matching a pattern, for reading the shape of something before editing it. */
export function linesMatching(file, re, limit = 20) {
  return readFileSync(file, 'utf8').split('\n')
    .map((l, i) => ({ n: i + 1, text: l }))
    .filter(({ text }) => re.test(text))
    .slice(0, limit)
    .map(({ n, text }) => 'L' + n + ': ' + text.trim().slice(0, 120))
}
