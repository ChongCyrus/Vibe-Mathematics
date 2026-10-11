// audit-enum-branches.mjs — a mechanism check for the family that has appeared in four consecutive rounds under four
// different costumes: a value that is DECLARED as supported while the code treats it as something else.
//
// HOW IT DECIDES: a face accepts an enum by checking membership in a local list (`const allowed = [...]` followed by
// `allowed.indexOf(x) === -1`). Every value in such a list must ALSO appear somewhere else in the same file - in a
// branch, a default, or a message - otherwise nothing distinguishes it from the default path, which means the face
// silently does something else while claiming to support it. The check is occurrence counting: a value mentioned ONLY
// by the whitelist is a finding. It is deliberately mechanical so it cannot be argued with.
//
//   node tests/audit-enum-branches.mjs            # report and exit non-zero on findings
//   node tests/audit-enum-branches.mjs --quiet    # findings only
//
// ROUND 160: it lives in `tests/` ON PURPOSE. The runner collects every `tests/*.mjs` that is not `*.test.mjs` as a
// probe, so placing it beside the suites is what makes it a GATE JOB; it is also named in the curated quick subset,
// so the fast scope runs it too.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const KERNEL = join(HERE, '..', 'vibe-math-vmu', 'kernel')
const quiet = process.argv.includes('--quiet')

const files = readdirSync(KERNEL).filter((f) => f.endsWith('.js')).sort()
const findings = []
let lists = 0
let values = 0
const rows = []

for (const f of files) {
  const src = readFileSync(join(KERNEL, f), 'utf8')
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[([^\]]*)\]/)
    if (!m) continue
    const name = m[1]
    if (!/^(allowed|ALLOWED|allowedValues)$/.test(name)) continue
    // the list must actually be used as a membership gate, or it is not an enum whitelist
    if (src.indexOf(name + '.indexOf(') === -1 && src.indexOf(name + '.includes(') === -1) continue
    const literals = m[2].match(/'[^']*'|"[^"]*"/g) || []
    if (!literals.length) continue
    lists += 1
    const bodyWithoutList = lines.slice(0, i).join('\n') + '\n' + lines.slice(i + 1).join('\n')
    for (const lit of literals) {
      values += 1
      const v = lit.slice(1, -1)
      const outside = bodyWithoutList.split(lit).length - 1
      if (outside === 0) {
        findings.push({ file: f, line: i + 1, list: name, value: v })
      }
      rows.push({ file: f, list: name, value: v, outside })
    }
  }
}

if (!quiet) {
  console.log('enum whitelists scanned: ' + lists + '   values: ' + values)
  for (const r of rows) console.log('  ' + (r.outside === 0 ? 'ONLY-IN-LIST ' : 'branched     ') + r.file.padEnd(20) + r.list.padEnd(10) + r.value.padEnd(14) + 'outside=' + r.outside)
}
for (const x of findings) console.log('FINDING ' + x.file + ':' + x.line + '  ' + x.list + ' declares "' + x.value + '" but the value appears NOWHERE else in the file - the face claims to support it and silently treats it as the default')
console.log('=== ENUM-BRANCH AUDIT: ' + lists + ' list(s), ' + values + ' value(s), ' + findings.length + ' finding(s) ===')
process.exit(findings.length > 0 ? 1 : 0)
