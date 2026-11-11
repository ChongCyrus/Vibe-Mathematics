// ★ RUN 79 / TB-2742 (task-223) — THE BRIEF TEMPLATE MUST NOT TEACH A CALL THE PRODUCT REFUSES.
//
// MEASURED (run 79, build 6c689c86): three defects were in the TEMPLATE (the brief), not the product —
//   B7 the brief told the office to hire with `slot:"member"`; the hirer face accepts only `slot:"temp"`
//      and refuses any other slot by name (the session succeeded only after switching to `temp`);
//   B9 both convenes used the ARRAY agenda form (`agendaItemsSource:"argument-array"`), so the rule
//      "a comma is not a separator" was never exercised on the STRING form;
//   V8/V13 the brief said "close at 60 minutes", so a paper with one `deliverable:false` per review round
//      parked in `reviewing` — votes 4/4 but no final/compile/render, no PDF.
// Plus two report disciplines: receipt evidence comes first (run 79's FEEDBACK was 100% "unlocated",
// hence 0 defects counted), and the three unreachable classes stay.
//
// This suite pins the repaired template and keeps the pin honest: five facts MUST be present, two old
// strings MUST be absent, and three anti-lamps (slot back to `member` / 100 back to 60 / drop the
// receipt-first sentence) must go red and name the missing fact — with the restored sha256 printed.
//
// Run: node tests/run79-brief-corrections.test.mjs   Last line: N passed, M failed

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
// The brief template lives beside the repo (same place taskbooks/TB-*.md live), not inside it.
const TEMPLATE = process.env.VMU_BRIEF_TEMPLATE_PATH || join(REPO, '..', 'taskbooks', 'RUN-BRIEF-TEMPLATE.md')
// The anti-lamps need a scratch copy of the template. It is a run artifact under the host's temp drive, so it
// is overridable; the default must never be baked into a shipped distribution path.
const PROOF_DIR = process.env.VMU_BRIEF_PROOF_DIR || join(REPO, '..', '..', '_tmp', 'tb2742') // PORTABLE-ALLOW: anti-lamp scratch copy of the run brief; VMU_BRIEF_PROOF_DIR overrides it, and the default is built from REPO rather than an absolute host path

const NL = String.fromCharCode(10)
const sha265 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const section = (t) => console.log(NL + t)
const lineOf = (text, needle) => {
  const i = String(text).split(NL).findIndex((l) => l.includes(needle))
  return i === -1 ? 0 : i + 1
}

// ── THE FIVE FACTS RUN 79 PROVED MUST BE IN THE TEMPLATE ─────────────────────────────────────────────────────
// Each fact is (id, label, test). The test receives the whole template text. A fact that is missing is a
// problem with a NAME — the message is what a reader sees when the template rots again.
const FACTS = [
  {
    id: 'slot-temp',
    label: 'hire uses slot:"temp" (the only slot the hirer face accepts)',
    hold: (t) => /slot:"temp"/.test(t),
  },
  {
    id: 'string-agenda',
    label: 'the agenda splitting sample is a STRING input and the receipt shape is named',
    hold: (t) => /agenda:"A; B（含 \(2k−1,2k\)）; C"/.test(t) && /agendaInputShape/.test(t),
  },
  {
    id: 'paper-chain',
    label: 'closing requires the paper chain at finalized + render (two gates, votes are not enough)',
    hold: (t) => /结题前必须让论文链走到 `finalized` 与 `render`/.test(t) && /票满不等于本轮成功/.test(t),
  },
  {
    id: 'budget-100',
    label: 'the time budget is 100 minutes, not 60',
    hold: (t) => /100 分钟/.test(t),
  },
  {
    id: 'receipt-first',
    label: 'receipt evidence comes before file:line (no wholesale "unlocated" downgrade)',
    hold: (t) => /回执证据优先于 `file:line`/.test(t) && /不许整份降级/.test(t),
  },
]

// ── THE TWO OLD STRINGS THAT MUST BE GONE ────────────────────────────────────────────────────────────────────
// `slot:"member"` is what the brief said; the product refuses it. "60 分钟必须收口" is the old budget rule
// that produced a reviewing paper with no PDF. If either comes back, the template is teaching a refusal.
const FORBIDDEN = ['slot:"member"', '60 分钟必须收口']

const problemsOf = (text) => {
  const problems = []
  for (const f of FACTS) {
    if (!f.hold(text)) problems.push('MISSING FACT ' + f.id + ' — ' + f.label)
  }
  for (const s of FORBIDDEN) {
    if (text.includes(s)) problems.push('FORBIDDEN OLD STRING ' + JSON.stringify(s) + ' at line ' + lineOf(text, s))
  }
  return problems
}

const run = async () => {
  section('§1 the repaired template exists, is readable, and stays within the 180-line budget')
  let text = ''
  try {
    text = readFileSync(TEMPLATE, 'utf8')
    ok(text.length > 0, `§1a template is non-empty (${TEMPLATE})`)
  } catch (e) {
    ok(false, `§1a template is readable (${TEMPLATE})`, String(e && e.code ? e.code : e))
    return
  }
  const lines = text.split(NL).length
  ok(lines <= 180, '§1b template is <= 180 lines (the brief-line gate)', { lines })
  ok(!/\r/.test(text), '§1c template has no CR (LF only)')

  section('§2 the five facts run 79 proved are present (a fact missing is named, never silently tolerated)')
  const problems = problemsOf(text)
  for (const p of problems) console.error('  RED: ' + p)
  ok(problems.length === 0, '§2a template carries all five RUN 79 facts and neither old string', problems)
  for (const f of FACTS) ok(f.hold(text), '§2b fact present: ' + f.id + ' — ' + f.label)

  section('§3 anti-lamps: the checker must go red and NAME the fact when the template is un-repaired')
  const pristine = text
  const pristineSha = sha265(pristine)
  console.log('  template sha256=' + pristineSha)
  mkdirSync(PROOF_DIR, { recursive: true })

  const lamps = [
    {
      name: '§3a slot back to member',
      mutate: (t) => t.replace(/slot:"temp"/g, 'slot:"member"'),
      expect: 'slot-temp',
    },
    {
      name: '§3b 100 back to 60',
      mutate: (t) => t.replace(/100 分钟/g, '60 分钟'),
      expect: 'budget-100',
    },
    {
      name: '§3c drop the receipt-first sentence',
      mutate: (t) => t.split(NL).filter((l) => !l.includes('回执证据优先于')).join(NL),
      expect: 'receipt-first',
    },
  ]

  let n = 0
  for (const lamp of lamps) {
    n++
    const mutated = lamp.mutate(pristine)
    ok(mutated !== pristine, lamp.name + ': mutation actually changed the template')
    const copy = join(PROOF_DIR, 'lamp-' + n + '.md')
    writeFileSync(copy, mutated, 'utf8')
    ok(sha265(mutated) !== pristineSha, lamp.name + ': mutated copy has a different sha256')
    const reds = problemsOf(mutated)
    const named = reds.find((p) => p.includes('MISSING FACT ' + lamp.expect))
    ok(Boolean(named), lamp.name + ': checker goes RED naming ' + lamp.expect)
    if (named) console.log('       RED: ' + named)
    // restore the copy and prove the sha256 is back to the pristine template's
    writeFileSync(copy, pristine, 'utf8')
    ok(sha265(readFileSync(copy, 'utf8')) === pristineSha, lamp.name + ': copy restored to the pristine sha256')
    console.log('       RESTORED sha256=' + sha265(readFileSync(copy, 'utf8')))
  }

  ok(sha265(readFileSync(TEMPLATE, 'utf8')) === pristineSha, '§3d the real template was never modified by the lamps')
  ok(problemsOf(readFileSync(TEMPLATE, 'utf8')).length === 0, '§3e after the lamps the real template is still clean')
}

await run()
console.log(NL + `=== RUN79 BRIEF CORRECTIONS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  console.error('failures:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
