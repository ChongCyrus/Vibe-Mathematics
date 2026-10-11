// An anchored edit helper whose DEFAULT is failure.
//
// WHY: round 242 lost two rounds to a script that printed `SKIP (n=0)` and carried on, so a block of code never existed and was
// later diagnosed as a broken implementation. The rule went into the gates volume, but a rule in a volume can be forgotten; this
// makes the safe behaviour the only behaviour - every anchor must match EXACTLY once, or the helper throws and the script dies
// without writing anything.
//
// Usage from a throwaway script:
//   import { anchored } from '<repo>/scripts/dev/edit-anchored.mjs'
//   anchored('vibe-math-vmu/kernel/x.js', [
//     ['literal that must appear once', 'replacement'],
//   ])
//
// It writes nothing unless EVERY edit applies, so a partial application is impossible.
import { readFileSync, writeFileSync } from 'node:fs'

/**
 * @param {string} file
 * @param {Array<[string,string]>} edits
 * @param {object} [opts]
 * @param {boolean} [opts.allowZero] permit an edit that is ALREADY applied (idempotent re-runs); off by default
 * @param {string}  [opts.label]     for the report
 * @returns {{ applied: number, file: string }}
 */
export function anchored(file, edits, { allowZero = false, label = '' } = {}) {
  let text = readFileSync(file, 'utf8')
  const report = []
  let applied = 0
  for (const [from, to] of edits) {
    const n = text.split(from).length - 1
    if (n === 1) { text = text.split(from).join(to); applied += 1; report.push('ok  ' + from.trim().slice(0, 60)); continue }
    if (n === 0 && allowZero && text.includes(to)) { report.push('already ' + from.trim().slice(0, 54)); continue }
    // NO WRITE HAPPENS: the caller's script dies here, loudly, with the reason.
    throw new Error('ANCHOR MISS in ' + file + (label ? ' [' + label + ']' : '') + ': matched ' + n + ' time(s), expected exactly 1\n' +
      '  anchor: ' + JSON.stringify(from.slice(0, 120)) + '\n' +
      '  an unapplied edit is a FAILURE, not a note - locate the target by line or by a unique literal instead of guessing whitespace')
  }
  writeFileSync(file, text)
  for (const r of report) console.log('  ' + r)
  return { applied, file }
}

/** Replace a whole line found by predicate, so whitespace guesses cannot miss. Throws when it is not found exactly once. */
export function replaceLine(file, predicate, replacement, { label = '' } = {}) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const hits = lines.map((l, i) => [l, i]).filter(([l]) => predicate(l))
  if (hits.length !== 1) {
    throw new Error('LINE MISS in ' + file + (label ? ' [' + label + ']' : '') + ': the predicate matched ' + hits.length + ' lines, expected exactly 1')
  }
  const [line, at] = hits[0]
  lines[at] = replacement
  writeFileSync(file, lines.join('\n'))
  console.log('  ok  ' + file.split('/').pop() + ' L' + (at + 1) + ' <- ' + replacement.trim().slice(0, 60))
  return { at, was: line }
}
