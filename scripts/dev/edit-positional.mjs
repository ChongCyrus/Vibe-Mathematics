// Round 245 produced three failures of one family - an edit that did not do what it claimed. Each now has a guard in the helper:
//
//   ① SPLIT GUARD: a replacement that introduces NEWLINES while its anchor does not END at a line boundary would split a line in
//      two. That is precisely how schema.js was broken (the anchor stopped at `who: 'office',` in the middle of a line). The
//      combination now throws instead of writing.
//   ② POSITIONAL INSERTION: `insertAfterLine` / `insertBeforeLine` find a line by predicate and splice a block next to it, then
//      VERIFY the file grew by exactly the block length. A truncating edit - which is how the lifecycle suite was destroyed - is
//      therefore impossible: the check runs before anything is written, on the computed result.
//   ③ The line-count check also catches an insertion that lands in the wrong place, because a wrong place changes the count.
import { readFileSync, writeFileSync } from 'node:fs'

/** Shared: the split guard, applied by every writer that replaces text. */
export function assertNoSplit(file, from, to, label) {
  if (!to.includes('\n')) return
  const endsAtLineEnd = from.endsWith('\n') || from.length === 0
  if (!endsAtLineEnd) {
    throw new Error('SPLIT GUARD in ' + file + (label ? ' [' + label + ']' : '') + ': the replacement introduces newlines but the anchor ' +
      'does not end at a line boundary, so this edit would SPLIT A LINE in two.\n' +
      '  anchor ends with: ' + JSON.stringify(from.slice(-40)) + '\n' +
      '  use insertAfterLine/insertBeforeLine, or make the anchor the whole line including its newline')
  }
}

function spliceNear(file, predicate, block, { before = false, label = '' } = {}) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const hits = lines.map((l, i) => [l, i]).filter(([l]) => predicate(l))
  if (hits.length !== 1) {
    throw new Error('ANCHOR MISS in ' + file + (label ? ' [' + label + ']' : '') + ': the predicate matched ' + hits.length +
      ' lines, expected exactly 1')
  }
  const [line, at] = hits[0]
  const chunk = Array.isArray(block) ? block.slice() : String(block).replace(/\n$/, '').split('\n')
  const insertAt = before ? at : at + 1
  const out = lines.slice(0, insertAt).concat(chunk, lines.slice(insertAt)).join('\n')
  // THE GUARD: the file must grow by exactly the block, so a truncating or mis-placed splice cannot be written.
  const grew = out.split('\n').length - lines.length
  if (grew !== chunk.length) {
    throw new Error('LENGTH GUARD in ' + file + (label ? ' [' + label + ']' : '') + ': the file would grow by ' + grew +
      ' lines but the block has ' + chunk.length + ' - refusing to write')
  }
  writeFileSync(file, out)
  console.log('  ok  ' + file.split('/').pop() + ' ' + (before ? 'before' : 'after') + ' L' + (at + 1) +
    ' (+' + chunk.length + ' lines, verified)')
  return { at, line, added: chunk.length }
}

/** Insert a block after the single line a predicate matches. Verifies the growth. */
export function insertAfterLine(file, predicate, block, opts = {}) {
  return spliceNear(file, predicate, block, opts)
}

/** Insert a block before the single line a predicate matches. Verifies the growth. */
export function insertBeforeLine(file, predicate, block, opts = {}) {
  return spliceNear(file, predicate, block, { ...opts, before: true })
}
