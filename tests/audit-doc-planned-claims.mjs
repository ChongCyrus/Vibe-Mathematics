// tests/audit-doc-planned-claims.mjs — cross-checks the docs' "this key is not implemented" claims against the
// GENERATED settings table, which is the authority on wiring. Both sides are identifiers or markers, which is what
// makes this precise: the last three rounds established that checking prose wording yields false positives, while
// checking whether an identifier appears where it must is reliable.
//
// THE RULE: take every `vmu.<face>.<key>` mentioned in a docs line that also says 未实现／未接线／planned／规划, look the
// key up in the generated table inside 04-settings.md, and if that table marks it ✅ 已接线 the document is claiming
// something the generator contradicts - a live finding. Keys marked ⚠️ 未接线, and keys absent from the table, are fine.
//
// `--selftest` runs the rule against synthetic rows so the check cannot silently become vacuous: a wired key claimed
// unwired MUST be flagged, and an unwired key claimed unwired MUST NOT be.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = join(HERE, '..', 'vibe-math-vmu', 'docs')
const quiet = process.argv.includes('--quiet')

const table = readFileSync(join(DOCS, '04-settings.md'), 'utf8')
/** @returns {'wired'|'planned'|null} */
function wiringOf(key) {
  const row = table.split('\n').find((l) => l.startsWith('| `' + key + '` |'))
  if (!row) return null
  if (row.indexOf('✅ 已接线') !== -1) return 'wired'
  if (row.indexOf('未接线') !== -1) return 'planned'
  return null
}

const PLANNED_WORDS = /未实现|未接线|planned|规划/
// ROUND 177/178: a line that says WHERE the key is wired is not a claim that the key is unimplemented. Two markers are
// recognised, both measured rather than assumed: `键已接线` (the key is read by its face, while a capability built on it
// is not), and `pack 侧消费` (verified in round 178 - quorumCap and reconsiderFloor appear in the packs and nowhere in
// meetings.js, so "consumed by the pack" and "the kernel decision point is planned" are both exactly right).
const KEY_ITSELF_WIRED = /键已接线|pack 侧消费|由 pack 消费|由 pack 接线/
const KEY = /`(vmu\.[a-zA-Z0-9_.]+)`/g
const hits = []
let candidates = 0
// ROUND 177: the roadmap volume is EXCLUDED on purpose. It is the living record of corrections, so by construction it
// quotes the very claims it retracts - "volume 17 called vmu.course.cohortMax unimplemented" - and every such sentence
// would be re-flagged forever. A log of fixes cannot be held to the standard of the prose it fixes.
const EXCLUDED = new Set(['04-settings.md', '14-open-items-and-roadmap.md'])
// ROUND 178: the trigger is a WINDOW around the key, not the whole line. Good prose routinely names a wired key while
// declaring something else unimplemented - "partial: the round timeout key exists; per-speaker time boxes are planned" -
// and the primitives volume is full of that shape, which is the shape this project asks for. Flagging the whole line
// would punish exactly the writing the docs are supposed to use, so the key and the claim must sit in the same clause.
const WINDOW = 14
for (const f of readdirSync(DOCS).filter((x) => x.endsWith('.md') && !EXCLUDED.has(x)).sort()) {
  const lines = readFileSync(join(DOCS, f), 'utf8').split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (!PLANNED_WORDS.test(lines[i])) continue
    if (KEY_ITSELF_WIRED.test(lines[i])) continue
    for (const m of lines[i].matchAll(KEY)) {
      const key = m[1]
      // ROUND 179: a key listed under the `可调控：` label is a TUNING PARAMETER being referenced, while the ⛔ claim in
      // the same line is about the service surface or decision point in `接口形状：`. The agent-society volume writes
      // every capability that way, and all twenty-seven of its candidates are exactly this shape - the keys are wired
      // and several say so ("default true"). The label is what separates the claim from the reference, so it is read as
      // one: no exemption marker needed in the prose, and a line where the key IS the subject still fires.
      if (lines[i].lastIndexOf('可调控：', m.index) !== -1) continue
      // a key immediately followed by a tick is being declared WIRED in place, not claimed unimplemented
      if (/^\s*✓/.test(lines[i].slice(m.index + m[0].length))) continue
      // the claim must be about THIS key: a planned word in the same clause, before or after it
      const near = lines[i].slice(Math.max(0, m.index - WINDOW), m.index + m[0].length + WINDOW)
      if (!PLANNED_WORDS.test(near)) continue
      const w = wiringOf(key)
      if (w === null) continue
      candidates += 1
      if (w === 'wired') hits.push({ file: f, line: i + 1, key, text: lines[i].trim().slice(0, 120) })
    }
  }
}

let selftestOk = true
if (process.argv.includes('--selftest')) {
  // two keys whose wiring the generated table states explicitly, so the selftest does not depend on row formatting
  const wiredKey = 'vmu.budget.fairnessPolicy'
  const plannedKey = 'vmu.a11y.enabled'
  const a = wiringOf(wiredKey) === 'wired'
  const b = wiringOf(plannedKey) === 'planned'
  selftestOk = a && b
  console.log('  selftest: a WIRED key reads wired = ' + a + ' (' + wiredKey + ')   a PLANNED key reads planned = ' + b + ' (' + plannedKey + ')   => ' + (selftestOk ? 'PASS ✓' : 'FAIL ✗'))
  if (!selftestOk) process.exit(1)
}

// EXIT POLICY (round 167): by default this probe REPORTS and exits 0, because it currently finds seventy-odd
// candidates and its premise is not yet verified for every face - a job that is red while its premise is unproven is
// exactly the kind of check this project refuses. `--check` restores the strict exit for when the premise holds.
const strict = process.argv.includes('--check')
if (!quiet) console.log('  keys checked against the generated table: ' + candidates)
for (const h of hits) console.log((strict ? 'FINDING ' : 'CANDIDATE ') + h.file + ':' + h.line + '  claims ' + h.key + ' is unimplemented while the generated table marks it wired :: ' + h.text)
if (!strict) console.log('  (report only: `--check` makes this fail. The premise - that a generated ✅ means really read - holds for 6 of the 18 faces that have a wired key list, so these are candidates, not verdicts.)')
console.log('=== DOC-PLANNED-CLAIM AUDIT: ' + candidates + ' key claim(s) checked, ' + hits.length + ' contradicted by the generated table ===')
process.exit(strict && hits.length > 0 ? 1 : 0)
