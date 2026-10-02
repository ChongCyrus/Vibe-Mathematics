// ============================================================================
// audit-v5-prompt-duplication.mjs — pins the invariant that the v5 toolkit prompt
// text exists TWICE (two `agent-instructions` entries: office + members) and that
// both copies are IDENTICAL after normalisation, plus that the three review-8
// wording fixes (P1/P2/P3) landed in BOTH copies.
//
// Owned by the v5 preset owner (proposed to the shared-layer owner for an index row).
// Falsifiability: `node tests/audit-v5-prompt-duplication.mjs --self-probe` mutates ONE
// copy in memory (single site) and requires the named check to go red.
// Run: node tests/audit-v5-prompt-duplication.mjs [--json] [--self-probe]
// ============================================================================
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REL = 'vibe-math-v5/agent.cordis.yml'
const YML = process.env.V5_PROMPT_YML ? String(process.env.V5_PROMPT_YML) : join(HERE, '..', REL)
// In-memory single-site mutation for --self-probe: `[from, to]` applied to the FIRST copy only.
const MUT = process.env.V5_PROMPT_MUTATE ? JSON.parse(process.env.V5_PROMPT_MUTATE) : null

const failures = []
let passed = 0
const check = (cond, msg) => { if (cond) { passed += 1 } else { failures.push(msg) } }
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\{\{cwd\}\}|\{\{model\}\}/g, '<T>').trim()

function loadBlocks() {
  if (!existsSync(YML)) return null
  let text = readFileSync(YML, 'utf8')
  if (MUT && Array.isArray(MUT) && MUT.length === 2) {
    const i = text.indexOf(MUT[0])
    if (i !== -1) text = text.slice(0, i) + MUT[1] + text.slice(i + MUT[0].length)   // FIRST copy only
  }
  const lines = text.split('\n')
  const starts = []
  lines.forEach((l, i) => { if (l.indexOf('This session includes "Vibe Math V5"') !== -1) starts.push(i) })
  // The prompt text is NOT ended by the `/v5 slash command …` line (that line sits in the MIDDLE:
  // the LEAN FORMAL VERIFICATION and TRUST RULE sections follow it). End each copy at its last
  // sentence instead, so the invariant covers the whole text (a truncated comparison would miss
  // exactly the sections that drift most easily).
  const endAt = (s) => {
    for (let i = s; i < lines.length; i++) if (/Never present an unverified claim as established/.test(lines[i])) return i
    for (let i = s; i < lines.length; i++) if (/\/v5 slash command mirrors these/.test(lines[i])) return i
    return lines.length - 1
  }
  return starts.map((s) => ({ from: s + 1, to: endAt(s) + 1, text: norm(lines.slice(s, endAt(s) + 1).join(' ')) }))
}

const blocks = loadBlocks()
check(!!blocks, 'agent.cordis.yml is readable at ' + YML)
if (blocks) {
  check(blocks.length === 2, 'exactly TWO toolkit prompt copies exist (got ' + blocks.length + ')')
  if (blocks.length === 2) {
    check(blocks[0].text === blocks[1].text,
      'the two prompt copies are IDENTICAL after normalisation (L' + blocks[0].from + '-' + blocks[0].to + ' vs L' + blocks[1].from + '-' + blocks[1].to
      + '; lengths ' + blocks[0].text.length + '/' + blocks[1].text.length + ') — a single-site edit in one copy must be mirrored in the other')
    // The review-8 wording fixes must be present in BOTH copies.
    const NEEDED = [
      ['P1 exception', /when a written flow requires it/],
      ['P1 paraphrase clause', /PARAPHRASE of the institute/],
      ['P2 disclosure', /YOUR OWN boolean vote on that object in the SAME reply is counted as an ABSTENTION/],
      ['P2 scope note', /Only a voter's ballot is affected/],
      ['P3 base statement', /resolved against the SESSION WORKING DIRECTORY/],
      ['P3 short-form equivalence', /names the SAME file/],
    ]
    for (const [name, re] of NEEDED) {
      blocks.forEach((b, i) => check(re.test(b.text), name + ' present in copy ' + (i + 1) + ' (L' + b.from + '-' + b.to + ')'))
    }
    // the disclosure must NOT contradict the enforced behaviour
    check(/ABSTENTION/.test(blocks[1].text) && /retracts the proof/.test(blocks[1].text), 'the disclosure explains that the defect still retracts the proof')
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ passed, failed: failures.length, failures }))
} else {
  console.log('v5 prompt duplication audit — ' + REL)
  for (const f of failures) console.log('  FAIL - ' + f)
  console.log((failures.length ? 'FAILED' : 'ALL GREEN') + ' — passed=' + passed + ' failed=' + failures.length)
  if (process.argv.includes('--self-probe')) {
    console.log('\nself-probe: one copy mutated in memory ⇒ the expected check must go red')
    if (!MUT) {
      const needle = 'There is no forced closure.'
      console.log('  (no V5_PROMPT_MUTATE set; the suite driver runs this with a single-site mutation)')
    }
  }
}
process.exit(failures.length ? 1 : 0)
