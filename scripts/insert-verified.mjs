// A SELF-VERIFYING inserter: the direct product of last round's failure, where a helper reported success on five volumes while
// splicing content into the wrong line. This one does not trust its own splice - it reads the file back and asserts the block
// is present verbatim, that the line count grew by exactly the block's length, and that the anchor line survived. Any failure
// leaves the file UNTOUCHED.
import { readFileSync, writeFileSync } from 'node:fs'
const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics/'

export function insertVerified (rel, blockLines, { before = /^## /, label = rel } = {}) {
  const F = REPO + rel
  const before_ = readFileSync(F, 'utf8')
  const L = before_.split('\n')
  const i = L.findIndex((l) => before.test(l))
  if (i < 0) return { ok: false, why: 'no anchor line matched ' + String(before) }
  // the anchor line must survive verbatim at its new position
  const anchorLine = L[i]
  const next = L.slice(0, i).concat(blockLines, [''], L.slice(i))
  const after = next.join('\n')
  // (1) the block is present verbatim
  for (const b of blockLines) if (!after.includes(b)) return { ok: false, why: 'block line missing after splice: ' + b.slice(0, 60) }
  // (2) the line count grew by exactly blockLines + 1 (the blank separator)
  const grew = after.split('\n').length - L.length
  if (grew !== blockLines.length + 1) return { ok: false, why: 'line count grew by ' + grew + ', expected ' + (blockLines.length + 1) }
  // (3) the anchor survived exactly once, at index i + blockLines.length + 1
  const idx = after.split('\n').indexOf(anchorLine)
  if (idx !== i + blockLines.length + 1) return { ok: false, why: 'anchor moved to ' + idx + ', expected ' + (i + blockLines.length + 1) }
  // (4) nothing before the insertion point changed
  if (L.slice(0, i).join('\n') !== after.split('\n').slice(0, i).join('\n')) return { ok: false, why: 'content before the insertion point changed' }
  writeFileSync(F, after)
  // (5) and re-read from disk to be sure
  const reread = readFileSync(F, 'utf8')
  if (!blockLines.every((b) => reread.includes(b))) return { ok: false, why: 're-read from disk does not contain the block' }
  return { ok: true, at: i + 1, grew }
}

if (process.argv[1] && /insert-verified\.mjs$/.test(process.argv[1])) {
  // self-test: a good insert must succeed and a bad anchor must refuse
  const fs = await import('node:fs')
  const probe = REPO + 'vibe-math-vmu/docs/12-user-guide.md'
  const orig = fs.readFileSync(probe, 'utf8')
  const r1 = insertVerified('vibe-math-vmu/docs/12-user-guide.md', ['> SELF-TEST BLOCK (will be reverted)'], { before: /^## / })
  const back = fs.readFileSync(probe, 'utf8')
  fs.writeFileSync(probe, orig)
  const r2 = insertVerified('vibe-math-vmu/docs/12-user-guide.md', ['> X'], { before: /^NEVER-MATCHES-THIS$/ })
  console.log('  self-test good insert: ' + JSON.stringify(r1))
  console.log('  self-test bad anchor:  ' + JSON.stringify(r2))
  console.log('  file restored: ' + (fs.readFileSync(probe, 'utf8') === orig))
}
