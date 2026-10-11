// tests/audit-cross-volume-refs.mjs — does every cross-volume section pointer resolve?
//
// ROUND 181. The docs cite each other by number, in the form `14-§2`, `08-§2`, `00-§3.2`. Those pointers are identifiers,
// which is what makes this check trustworthy where prose checks are not: either the target volume has a heading with that
// number or it does not. Measured before it was written: five hundred and eighteen cross-volume references, one
// unresolved - and that one was my own, written two rounds earlier while explaining the generated wiring table.
//
// Strict by default (exit 1 on any unresolved pointer). `--quiet` prints only the summary. `--selftest` proves the check
// cannot pass vacuously, by requiring a known-good pointer to resolve and a fabricated one not to.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = join(HERE, '..', 'vibe-math-vmu', 'docs')
const quiet = process.argv.includes('--quiet')

// The roadmap volume is EXCLUDED for the same reason the planned-claim check excludes it: it is the living record of
// corrections, so it necessarily quotes the dangling references it fixes ("the kernel comment cited section 12.6, which
// the volume does not declare"). Round 181 discovered this the moment its own record was written.
const EXCLUDED = new Set(['14-open-items-and-roadmap.md'])
const files = readdirSync(DOCS).filter((x) => x.endsWith('.md') && !EXCLUDED.has(x)).sort()
const volumeOf = (name) => Number(name.slice(0, 2))

/** @returns {Set<string>} the section numbers a volume declares, as "3" and "3.2" */
const sections = new Map()
for (const f of files) {
  const nums = new Set()
  for (const line of readFileSync(join(DOCS, f), 'utf8').split('\n')) {
    const m = /^#{2,4}\s*§?(\d+)(?:\.(\d+))?/.exec(line)
    if (!m) continue
    nums.add(m[1])
    if (m[2]) nums.add(m[1] + '.' + m[2])
  }
  sections.set(volumeOf(f), nums)
}

const REF = /(\d{2})\s*[-‑]?\s*§\s*(\d+(?:\.\d+)?)/g
const findings = []
let total = 0
for (const f of files) {
  const src = volumeOf(f)
  const lines = readFileSync(join(DOCS, f), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i].matchAll(REF)) {
      const target = Number(m[1])
      if (target === src) continue          // same-volume pointers are the other check's business
      if (!sections.has(target)) continue   // a volume that does not exist is not a section claim
      total += 1
      if (!sections.get(target).has(m[2])) findings.push({ file: f, line: i + 1, ref: m[1] + '-§' + m[2], text: lines[i].trim().slice(0, 110) })
    }
  }
}

if (process.argv.includes('--selftest')) {
  const known = sections.get(14).has('2')
  const fabricated = sections.get(0).has('999')
  console.log('  selftest: `14-§2` resolves = ' + known + '   the fabricated `00-§999` does not = ' + !fabricated + '   => ' + (known && !fabricated ? 'PASS ✓' : 'FAIL ✗'))
  if (!known || fabricated) process.exit(1)
}

if (!quiet) console.log('  cross-volume § references checked: ' + total)
for (const h of findings) console.log('FINDING ' + h.file + ':' + h.line + '  points at ' + h.ref + ', which that volume does not declare :: ' + h.text)
console.log('=== CROSS-VOLUME REFS: ' + total + ' reference(s) checked, ' + findings.length + ' unresolved ===')
process.exit(findings.length > 0 ? 1 : 0)
