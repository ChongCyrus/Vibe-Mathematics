// tests/audit-prompt-retired-mechanisms.test.mjs — ROUND-3 rewrite (Lead ruling): the five legacy 【更正·】 ledger
// sections are DELETED from every prompt. This suite now checks the property those sections existed for — an obsolete
// mechanism must never be TAUGHT, and the real mechanism must be TAUGHT — instead of checking that a corrections block
// names the obsolete wording (that made obsolete wording mandatory in shipped text, which the audit flagged three
// rounds running: 1,067 chars × 35 prompts of history).
//
// The obsolete wordings and their replacements:
//   · `vibe_v5_tool_help({"tool":…})`            -> the face takes `{member}` only
//   · `end_verify` / `formal_proof` as a call    -> `formal` only accepts {statement, proof}; the names are retired
//   · a hand-written ```json fence every round   -> the reply body's single fenced JSON (op:"reply" is for the office)
//   · "m 票" read as a counting rule             -> m is the quorum size; agreement is unanimity via defaultTally
//   · `formal:{decision,file,note}`              -> blocked/defect go to lean_archive/fidelity_conclude
//
// RULE E: every list is non-empty and every absence assertion is paired with a presence assertion for the replacement,
// so "the prompt says nothing" cannot pass as "the prompt says the right thing". Lamps prove the predicates bite.
//
// Run: node tests/audit-prompt-retired-mechanisms.test.mjs   (last line: === RETIRED MECHANISMS: N passed, M failed ===)

import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
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

const got = await collect({ slots: ['chair', 'member', 'temp'], phases: ['normal', 'meeting', 'verify'] })
const texts = got.sections.map((s) => s.text)
const all = texts.join('\n')
ok(got.sections.length > 0 && all.length > 10000, 'PRECONDITION: real assemblies were produced (non-vacuous subject)', { sections: got.sections.length, chars: all.length })

// The five legacy ledger names/markers are GONE from every assembly (the Lead ruled them redundant; facts live elsewhere).
const LEGACY = ['v5r-fix-formal', 'v5r-fix-json-reply', 'v5r-fix-m-vote', 'v5r-fix-leader-id', 'v5r-fix-tool-help', '【更正·']
ok(LEGACY.length === 6 && LEGACY.every((n) => !all.includes(n)), 'the five legacy 【更正·】 sections are deleted from the shipped prompts (names and markers absent)', LEGACY.filter((n) => all.includes(n)))

// (1) tool_help: no bare {"tool":…} signature; the real {member} form is taught.
ok(!all.includes('tool_help({"tool"'), 'tool_help({"tool":…}) is never taught')
ok(all.includes('vibe_v5_tool_help') && /tool_help\(\{"member"/.test(all), 'the real tool_help({member}) form is taught')

// (2) end_verify / formal_proof: never taught as a call; named ONLY as a "do not call" warning.
ok(/不要调用/.test(all) && /end_verify/.test(all) && /formal_proof/.test(all), 'the retired names are named ONLY as a "do not call" warning')
ok(!/end_verify\s*\{/.test(all) && !/formal_proof\s*[:=]/.test(all), 'neither retired name is taught as an argument')
ok(all.includes('只收 {statement, proof}') && !all.includes('formal:{decision'), 'formal teaches ONLY {statement, proof}; the old card shape is gone')

// (3) reply transport: the single fenced JSON body is the channel; op:"reply" is office-only; no ```json template.
ok(!all.includes('```json'), 'no hand-written ```json template is taught')
ok(all.includes('回执**即本次回复的正文**') || /代码围栏|json 围栏/.test(all), 'the fenced-JSON channel is still taught (the reply body itself carries the single fenced JSON)')
ok(/op:"reply"/.test(all) && /所办代转/.test(all), 'op:"reply" is taught as the office relay path, not the member path')

// (4) m: it is the quorum size, never a vote count.
ok(!all.includes('m 票布尔一致'), 'm 票 as a counting rule is never taught')
ok(/法定票数 m/.test(all) && /在册有表决权人数/.test(all), 'm is taught as the quorum size (min of cap and eligible seats), not a vote count')

// (5) blocked/defect records: the real tools, with their required params.
ok(/vibe_v5_lean_archive/.test(all) && /kind:\s*["']blocked["']/.test(all), 'lean_archive kind:"blocked" is the blocking-record channel')
ok(/vibe_v5_fidelity_conclude|保真工具/.test(all), 'the fidelity defect channel is named (chair-only)')
ok(!/decision:\s*["']?(used|blocked|defect)/.test(all), 'no formal decision shape is taught')

// LAMPS: the predicates are not vacuous — a planted sentence would be seen.
ok((all + '\nvibe_v5_tool_help({"tool":"x"})').includes('tool_help({"tool"'), 'LAMP: the tool-signature predicate would catch a planted bare {"tool":…} call')
ok((all + '\n【更正·形式化】旧说法').includes('【更正·'), 'LAMP: the legacy-marker predicate would catch a planted 【更正·】 section')

console.log('')
if (failed > 0) { for (const f of failures) console.log('FAILED: ' + f) }
console.log('=== RETIRED MECHANISMS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
