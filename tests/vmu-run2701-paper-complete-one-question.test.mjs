// TB-2701 judge (RUN 2701): paper `complete` is ONE WORD on THREE DOORS - status asks whether the four ARCHIVE ROWS
// (md/tex/meta/pdf) are NAMED, final asks whether the finalisation RAN and the pdf FILE exists, render is the archive-row
// question under a second name (complete === renderOk). Each door's own completeMeans already says its question; what
// still lied was the SHARED sentence PAPER_OK_MEANS, which carried the word between doors. This judge pins the shared
// sentence to say the three questions are not one, and pins that the sentence is used by exactly final and render (status
// does not claim okMeans). Behaviour-level checks (render/final receipts) run in the landing window with the pack booted.
// Run: node tests/vmu-run2701-paper-complete-one-question.test.mjs   Last line: === VMU RUN 2701: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACK = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')

// The constant is a single-quoted JS string, so every word below must be quotable with backticks only.
const START = PACK.indexOf('const PAPER_OK_MEANS = ')
ok(START !== -1, '0a PAPER_OK_MEANS exists exactly once as a const')
const LINE_END = PACK.indexOf('\n', START)
const LINE = START === -1 ? '' : PACK.slice(START, LINE_END)
ok(LINE.includes('NOT ONE QUESTION across these doors'), '0b the shared sentence says the word is NOT ONE QUESTION across doors')
ok(LINE.includes('status') && LINE.includes('render') && LINE.includes('final'), '0c the sentence names the three doors')
ok(LINE.includes('ARCHIVE ROWS'), '0d the status/render question is named (archive rows)')
ok(LINE.includes('pdf FILE exists'), '0e the final question is named (finalisation ran and pdf file exists)')
ok(LINE.includes('`renderOk`'), '0f render is tied to renderOk by name')
ok(LINE.includes('`completeMeans`'), '0g the reader is told to read the door own completeMeans')
ok(!LINE.slice(LINE.indexOf(String.fromCharCode(39)) + 1, LINE.lastIndexOf(String.fromCharCode(39))).includes(String.fromCharCode(39)), '0h the constant body has no ASCII apostrophe (grep-able)')
ok((PACK.match(/okMeans: PAPER_OK_MEANS/g) || []).length === 2, '0i exactly final and render assemble okMeans from the shared sentence')
ok(!/complete:\s*true,\s*okMeans: PAPER_OK_MEANS/.test(PACK.replace(/\s+/g, ' ')), '0j no door fabricates complete:true next to the shared sentence')
{
  // the old single-sentence wording must be gone: it presented one meaning for final and render alike
  ok(!LINE.includes('ok:true means the request was accepted and executed; complete means'), '0k the old lumped wording is gone')
}

console.log('=== VMU RUN 2701: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
