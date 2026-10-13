// tests/vmu-dissemination-wordlist.test.mjs - O5 (docs/22), per the ruling in round 63: the mechanism lands at the paper track's
// delivery point, and WHICH WORDS COUNT IS THE PACK'S DECLARATION. Three properties: zero configuration refuses nothing; strict
// refuses by name with the offending words; warn records and continues.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const WORDS = ['revolutionary', 'breakthrough', 'proves']
const SUMMARY = 'This is a revolutionary breakthrough that proves the conjecture.'
const CLAIMS = [{ text: 'the theorem holds under the stated hypotheses', evidenceRef: 'claim-1' }]
const mk = (settings) => createKernel({ clock: () => 0, settings }).publication

console.log('=== 1. ZERO CONFIGURATION REFUSES NOTHING (the wordlist defaults to empty) ===')
{
  const p = mk({ 'vmu.dissemination.mediaApprovalPolicy': 'open' })
  const r = await p.outreachPack({ paperId: 'p-1', publicSummary: SUMMARY, claims: CLAIMS })
  ok(r.ok === true, 'with no wordlist declared the same exaggerated summary passes, so the mechanism is opt-in', { r: { ok: r.ok, warnings: r.warnings } })
  ok(!JSON.stringify(r.warnings || []).includes('exaggeration'), 'and no exaggeration warning is invented either', { warnings: r.warnings })
}

console.log('=== 2. STRICT REFUSES BY NAME, AND NAMES THE WORDS ===')
{
  const p = mk({ 'vmu.dissemination.mediaApprovalPolicy': 'open', 'vmu.dissemination.exaggerationWords': WORDS })
  let refused = null
  try { await p.outreachPack({ paperId: 'p-2', publicSummary: SUMMARY, claims: CLAIMS }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_OUTREACH_EXAGGERATED',
    'a summary using a declared word is refused by name under the default strict tier', { code: refused && refused.code })
  ok(refused && refused.hint && refused.hint.includes('exaggerationWords'),
    'and the hint names the setting, so a caller can change the policy deliberately rather than guess', { hint: refused && refused.hint })
  const clean = await p.outreachPack({ paperId: 'p-3', publicSummary: 'The theorem holds under the stated hypotheses.', claims: CLAIMS })
  ok(clean.ok === true, 'while the same pack with a summary free of declared words passes', { ok: clean.ok })
}

console.log('=== 3. WARN RECORDS AND CONTINUES ===')
{
  const p = mk({ 'vmu.dissemination.mediaApprovalPolicy': 'open', 'vmu.dissemination.evidenceFidelity': 'warn', 'vmu.dissemination.exaggerationWords': WORDS })
  const r = await p.outreachPack({ paperId: 'p-4', publicSummary: SUMMARY, claims: CLAIMS })
  ok(r.ok === true, 'under warn the pack is still accepted', { ok: r.ok })
  ok(Array.isArray(r.warnings) && r.warnings.some((w) => /exaggeration/.test(w)),
    'and the exaggeration is recorded as a warning naming the words, so it is not silently dropped', { warnings: r.warnings })
}

console.log('=== 4. THE WORDLIST IS THE DECLARATION, NOT THE KERNEL S OPINION ===')
{
  const p = mk({ 'vmu.dissemination.mediaApprovalPolicy': 'open', 'vmu.dissemination.exaggerationWords': ['holds'] })
  let refused = null
  try { await p.outreachPack({ paperId: 'p-5', publicSummary: 'The theorem holds.', claims: CLAIMS }) } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_OUTREACH_EXAGGERATED',
    'a word the kernel would never have chosen is refused when the configuration declares it, which is the whole point', { code: refused && refused.code })
  const p2 = mk({ 'vmu.dissemination.mediaApprovalPolicy': 'open', 'vmu.dissemination.exaggerationWords': ['holds'] })
  const r = await p2.outreachPack({ paperId: 'p-6', publicSummary: 'The theorem is established.', claims: CLAIMS })
  ok(r.ok === true, 'and an undeclared word passes untouched even in strict mode', { ok: r.ok })
}

console.log('=== DISSEMINATION WORDLIST: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
