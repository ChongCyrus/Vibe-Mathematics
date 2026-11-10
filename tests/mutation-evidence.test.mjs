// tests/mutation-evidence.test.mjs — «改坏机制 ⇒ 被点名的断言必红» 必须在仓库内可重跑（TB-2687 / TB-2702 / AUDIT-17 clue 3）
//
// WHY: the 90/91 coverage figure once rested on `D:/_tmp/mutbatch2/mutations.json` — a temp dir with a
// 3-hour self-clean. Evidence that lives outside the repo is a rehearsal, not a proof: a later reader
// cannot re-run it, and `git ls-files | grep -i mutation` was empty. This suite is the EXECUTION POINT of
// `scripts/audit/mutations/manifest.json`: it runs every manifest entry through `run.mjs`, which mutates a
// throwaway COPY of the repo (never the working tree) and requires the suite to fail on the assertion the
// manifest names. It is not enough for the suite to fail for any reason — see negative control ②.
//
// The default run is the WHOLE manifest (43 entries after TB-2706). `--full` is kept as a compatibility
// alias; it is deliberately NOT a separate branch, because a flag-gated subset would hide the newly
// proven entries from the default gate.
//
// Four negative controls keep the harness honest:
//   ① replaceWith === anchor   ⇒ the "mutation" changes nothing ⇒ NO-RED (a runner calling a no-op RED measures nothing)
//   ② expectRed names a title that does not exist ⇒ the suite still fails, but on the wrong thing ⇒ WRONG-ASSERTION
//   ③ the suite is already red before the mutation ⇒ PRE-RED (the red cannot be attributed to our edit)
//   ④ the mutation targets tests/** ⇒ the judge is broken, not the product ⇒ MUTATION-ON-CRITERION
import { runEntry, runAll, loadManifest } from '../scripts/audit/mutations/run.mjs'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }

const full = process.argv.includes('--full')
void full // the default is already the full manifest; the flag stays only so older invocations keep working

const manifest = loadManifest()
ok(manifest.length > 0, 'the manifest is non-empty and loadable')
// TB-2687 proved 13 rules; TB-2702 adds 15; TB-2706 adds 15 (14 rehearsed + B4 after the runner learned
// to neutralise hardcoded REPO paths). If a later edit drops entries, this gate must say so.
ok(manifest.length >= 43, 'the manifest carries at least 43 PROVEN-RED entries (13 TB-2687 + 15 TB-2702 + 15 TB-2706), got ' + manifest.length)
const suites = new Set(manifest.map((e) => e.expectRed.suite))
ok(suites.size >= 20, 'the manifest spans many distinct suites (a single-suite manifest would prove one runner path), got ' + suites.size)

const t0 = Date.now()
const toRun = manifest
ok(toRun.length > 0, 'the entry list is non-empty before the RED loop')
const results = runAll(toRun, { quiet: true })
ok(toRun.length > 0 && results.length === toRun.length, 'the run returned one result per entry')
for (let i = 0; i < toRun.length; i++) {
  const entry = toRun[i]
  const r = results[i]
  ok(r.verdict === 'RED', 'IN-REPO RED: ' + entry.ruleId + ' — ' + entry.expectRed.suite
    + ' fails on the named assertion when the mechanism is broken (got ' + r.verdict + ')'
    + (r.verdict === 'RED' ? '' : ' ⇐ ' + (r.error || r.missing.join(' | '))))
}

// ① NO-RED negative control — replaceWith === anchor makes the edit a no-op, so the suite stays green and
// the runner must report NO-RED *by name* rather than silently counting a non-event as proof.
const noop = Object.assign({}, manifest[0], { replaceWith: manifest[0].anchor })
const noopRes = runEntry(noop)
ok(noopRes.verdict === 'NO-RED' && noopRes.rule === noop.ruleId,
  'NEGATIVE CONTROL ①: replaceWith === anchor is judged NO-RED and names the rule (' + noop.ruleId + '), got ' + noopRes.verdict)

// ② WRONG-ASSERTION negative control — the mutation is real and the suite DOES fail, but not on the title
// we named. Accepting that would let any unrelated red masquerade as this rule's evidence.
const wrong = Object.assign({}, manifest[0], { expectRed: Object.assign({}, manifest[0].expectRed, { titleIncludes: 'a title that does not exist in this suite 7f3a1c' }) })
const wrongRes = runEntry(wrong)
ok(wrongRes.verdict === 'WRONG-ASSERTION' && wrongRes.rule === wrong.ruleId,
  'NEGATIVE CONTROL ②: an expectRed that does not exist is judged WRONG-ASSERTION and names the rule (' + wrong.ruleId + '), got ' + wrongRes.verdict)

// ③ PRE-RED negative control — break the suite BEFORE the baseline run; a runner that attributes any red
// to its own edit would call this RED, so it must say PRE-RED instead.
const preEntry = manifest.find((e) => e.expectRed.suite === 'vmu-run125-primitive-seat-gate.test.mjs') || manifest[0]
const preBreak = {
  file: 'tests/' + preEntry.expectRed.suite,
  anchor: "console.log('vmu-run125-primitive-seat-gate: ' + passed + ' passed, 0 failed')",
  replaceWith: "console.log('vmu-run125-primitive-seat-gate: ' + passed + ' passed, 0 failed'); process.exit(1)",
}
const preRes = runEntry(preEntry, { baselineEdits: [preBreak] })
ok(preRes.verdict === 'PRE-RED' && preRes.rule === preEntry.ruleId,
  'NEGATIVE CONTROL ③: a suite already red before the mutation is judged PRE-RED and names the rule (' + preEntry.ruleId + '), got ' + preRes.verdict)

// ④ MUTATION-ON-CRITERION negative control — a mutation aimed at the test file reddens the suite by
// breaking the judge. The runner must refuse it by name before copying anything, or "proof" becomes
// self-fulfilling.
const onJudge = Object.assign({}, manifest[0], { file: 'tests/' + manifest[0].expectRed.suite })
const judgeRes = runEntry(onJudge)
ok(judgeRes.verdict === 'MUTATION-ON-CRITERION' && judgeRes.rule === onJudge.ruleId,
  'NEGATIVE CONTROL ④: a mutation targeting tests/** is judged MUTATION-ON-CRITERION and names the rule (' + onJudge.ruleId + '), got ' + judgeRes.verdict)

console.log('')
console.log('mutation-evidence: ' + toRun.length + ' in-repo entries + 4 negative controls · ' + (Date.now() - t0) + 'ms')
if (fail) console.error('FAILURES: ' + fail)
console.log('=== MUTATION EVIDENCE: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
