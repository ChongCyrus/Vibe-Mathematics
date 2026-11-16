// tests/vmu-prompt-corrections.test.mjs — ROUND-3 (2026-11-17, Lead ruling): THE FIVE LEGACY CORRECTION SECTIONS ARE
// DELETED. They were read in every prompt (1,067 chars × 35 = 37,345 chars), restated rules that live in their own
// sections (release/shape -> reply-compact, m -> charter-voting, leaderId -> charter-division, tool_help -> the tool
// table), and three audit rounds in a row flagged them as history noise. The ruling: delete them; fold the ONLY two
// facts with no other home (`release` is not a task_update action; `end_verify`/`formal_proof` must not be called) into
// reply-compact BEFORE deleting; then this suite proves (a) the ledger is empty, (b) every legacy name/marker is absent
// from the SHIPPED assemblies, (c) the folded facts survive, and (d) the absence predicates bite on planted text.
//
// This file used to assert the opposite (five sections exist, ordered ≥800, each names old+new). Following the ruling is
// a requirement change, not a green: the deletion is the feature, and the checks below are its replacement mechanism.

import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const CORR = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-corrections.js')).href)
const { collect } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'audit', 'prompt-sections.mjs')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))))
  console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 260) + ']'))
  return false
}
const SECTIONS = CORR.V5R_CORRECTION_SECTIONS
const LEGACY = ['v5r-fix-formal', 'v5r-fix-json-reply', 'v5r-fix-m-vote', 'v5r-fix-leader-id', 'v5r-fix-tool-help']
const MARKERS = ['【更正·形式化】', '【更正·回复形状】', '【更正·m 票】', '【更正·领头人】', '【更正·工具查询】']

ok(Array.isArray(SECTIONS), 'the corrections module still exports its ledger array (shape kept for readers)', Array.isArray(SECTIONS))
ok(SECTIONS.length === 0, 'the ledger is EMPTY: all five legacy correction sections are deleted (Lead ruling)', SECTIONS.length)
ok(LEGACY.length === 5 && LEGACY.every((n) => !SECTIONS.some((s) => s && s.name === n)), 'none of the five legacy section names is declared', SECTIONS.map((s) => s && s.name))

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['normal', 'verify'] })
const texts = got.sections.map((s) => s.text)
const all = texts.join('\n')
ok(got.sections.length > 0 && all.length > 10000, 'PRECONDITION: real assemblies were produced (non-vacuous)', { sections: got.sections.length, chars: all.length })
ok(MARKERS.every((m) => !all.includes(m)), 'no legacy 【更正·…】 marker renders in any shipped assembly', MARKERS.filter((m) => all.includes(m)))
ok(LEGACY.every((n) => !all.includes(n)), 'no legacy section name renders in any shipped assembly', LEGACY.filter((n) => all.includes(n)))

// The two facts that had no other home were folded into reply-compact BEFORE deletion.
ok(/release` 不是动作|release` 不是 `vibe_v5_task_update` 动作/.test(all), 'FOLDED FACT: release is not a task_update action is still taught')
ok(/旧名 `end_verify`\/`formal_proof` 不存在，不要调用/.test(all), 'FOLDED FACT: end_verify/formal_proof are named as retired calls')
ok(/vibe_v5_task_update \{ task_id, expected_revision, action: claim\|transition\|complete\|reopen \}/.test(all), 'FOLDED FACT: the real task_update action set is taught')
ok(/只收 \{statement, proof\}/.test(all), 'FOLDED FACT: formal only accepts {statement, proof} is taught (reply-formal / addendum)')
ok(/代码围栏/.test(all) && /VMU_TURN_REPLY_CONFLICT/.test(all), 'FOLDED FACT: the reply channel and its conflict code are still taught')

// LAMPS: the predicates bite on planted text.
ok((all + '\n【更正·形式化】旧说法').includes('【更正·形式化】') === true, 'LAMP: the marker predicate is not vacuous (a planted marker WOULD be seen)')
ok((all + '\nv5r-fix-m-vote').includes('v5r-fix-m-vote') === true, 'LAMP: the name predicate is not vacuous (a planted name WOULD be seen)')

console.log('')
if (failed > 0) { for (const f of failures) console.log('FAILED: ' + f) }
console.log('=== VMU PROMPT CORRECTIONS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
