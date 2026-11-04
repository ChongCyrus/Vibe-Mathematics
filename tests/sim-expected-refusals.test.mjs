// tests/sim-expected-refusals.test.mjs — a predicted refusal must stay EVIDENCE, not become a finding.
//
// WHY: `scripts/sim/scenarios/comms.mjs` exercises five named refusals (a seat rewriting another seat's panel, the temp
// seat voting, a mailbox impersonation, an anchor that was already acked). The runner was taught to accept a scenario's
// `expectedRefusals` declaration (otherwise every honest scenario about "this contradiction must be refused" fails, and
// the pressure is to stop testing refusals). But the audit's A1 never read that declaration and the manifest never
// carried it, so the same five refusals came back as five A1 findings — the runner said "fine", the audit said "defect",
// about the same corpus. Two instruments disagreeing is worse than one being wrong: the reader cannot tell which.
//
// This suite pins the hand-off end to end, through the real commands an auditor runs:
//   ① the runner exits 0 and counts the refusals as `expected`, not `mechanism`;
//   ② `manifest.json` carries the declaration AND the matched seqs (a reader of the corpus alone can tell them apart);
//   ③ the audit reads it: zero A1 findings, and the predicted refusals are printed as expected evidence;
//   ④ an UNPREDICTED refusal would still be an A1 finding — the asymmetry is asserted, not assumed, by feeding the audit
//      a corpus whose manifest lacks the declaration.
//
// Run: node tests/sim-expected-refusals.test.mjs

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const TMP = 'D:/_tmp/sim-tests/expected-refusals'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 600)))
  }
}

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 })
    return { code: 0, stdout }
  } catch (e) {
    return { code: e.status === undefined ? 1 : e.status, stdout: String((e.stdout || '') + (e.stderr || '')) }
  }
}

mkdirSync(TMP, { recursive: true })
const corpus = join(TMP, 'corpus-comms-probes')
rmSync(corpus, { recursive: true, force: true })

console.log('§1 the runner treats a declared refusal as evidence')
const ran = run(['scripts/sim/run.mjs', '--scenario', 'comms', '--probes', '--out', corpus])
ok(ran.code === 0, 'the runner exits 0 when every refusal was predicted', { code: ran.code, tail: ran.stdout.slice(-400) })
ok(/refusals: 5 \(0 mechanism · 5 expected · 0 environmental\)/.test(ran.stdout), 'the summary line counts 5 expected and 0 mechanism', ran.stdout.split('\n').filter((l) => l.includes('refusals')).slice(-1)[0])

console.log('§2 the corpus carries the declaration')
let manifest = {}
try { manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8')) } catch (e) { manifest = {} }
ok(Array.isArray(manifest.expectedRefusals) && manifest.expectedRefusals.length > 0, 'manifest.json lists the declaration', { keys: Object.keys(manifest) })
ok(Array.isArray(manifest.expectedMatched) && manifest.expectedMatched.length === 5, 'manifest.json lists the five matched refusals with their seqs', manifest.expectedMatched)
ok(manifest.refusals && manifest.refusals.mechanism === 0 && manifest.refusals.expected === 5, 'manifest.json separates mechanism from expected counts', manifest.refusals)
ok((manifest.expectedMatched || []).every((e) => typeof e.seq === 'number' && e.code), 'every matched entry names a seq AND a code (a seq alone cannot be checked)', manifest.expectedMatched)

console.log('§3 the audit reads the same declaration')
const audited = run(['scripts/sim/audit/receipts.mjs', corpus, '--json'])
let report = null
try { report = JSON.parse(audited.stdout) } catch (e) { report = null }
ok(audited.code === 0, 'the audit exits 0 on a corpus whose refusals were predicted', { code: audited.code, out: audited.stdout.slice(0, 400) })
ok(report !== null && report.findings.length === 0, 'zero findings', report && report.findings)
ok(report !== null && Array.isArray(report.expectedRefusals) && report.expectedRefusals.length === 5, 'the audit PRINTS the predicted refusals as expected evidence', report && report.expectedRefusals)

console.log('§4 without the declaration the same refusals ARE findings')
const stripped = join(TMP, 'corpus-no-declaration')
rmSync(stripped, { recursive: true, force: true })
execFileSync(process.execPath, ['-e', 'const fs=require("node:fs");fs.cpSync(process.argv[1],process.argv[2],{recursive:true})', corpus, stripped], { cwd: REPO })
const m2 = JSON.parse(readFileSync(join(stripped, 'manifest.json'), 'utf8'))
delete m2.expectedRefusals
delete m2.expectedMatched
writeFileSync(join(stripped, 'manifest.json'), JSON.stringify(m2, null, 2))
const audited2 = run(['scripts/sim/audit/receipts.mjs', stripped, '--json'])
let report2 = null
try { report2 = JSON.parse(audited2.stdout) } catch (e) { report2 = null }
ok(audited2.code === 1, 'the audit fails a corpus whose refusals nobody predicted', { code: audited2.code })
ok(report2 !== null && report2.findings.filter((f) => f.check === 'A1' && f.code === 'STEP_REFUSED').length === 5, 'all five come back as A1 STEP_REFUSED (the asymmetry points at unpredicted refusals)', report2 && report2.findings)

console.log('\n=== sim expected refusals: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}
