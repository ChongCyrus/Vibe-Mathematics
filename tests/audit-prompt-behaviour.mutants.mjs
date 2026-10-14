// tests/audit-prompt-behaviour.mutants.mjs — Round 4 / task-31 D: the MUTATION PROOF behind F22.
//
// WHY. F22 says "the prompt pipeline's contract must be asserted as BEHAVIOUR, not as receipt shape" - the lesson
// from v5r, where 177 assertions guarded a channel that was already dead. `tests/vmu-prompt.test.mjs` does assert
// behaviour (assembled text: state facts survive verbatim, a binding aimed at `state` contributes nothing, an
// authorised override is in effect and still renders variables, rollback restores the previous reference) - but
// until this family existed that was a WRITING STYLE, not a proven property.
//
// HOW. It uses the SHARED paradigm (`tests/_lib/falsify.mjs`, vmu-activity's task-32 C): copy the module, inject
// ONE defect, import the copy, run the SAME probe - the real module must be GREEN, every mutant must produce a
// DIFFERENT reading, and the temp copies must be gone. That library carries the guards a hand-rolled family
// forgets (`MUTATION-NOT-APPLIED`, `MUTANT-UNIMPORTABLE`, `REAL-MODULE-NOT-GREEN`, `PROBE-DOES-NOT-DISCRIMINATE`,
// `UNSAFE-TMP-DIR`/`TEMP-NOT-CLEANED`), so migrating to it added proof strength rather than mere tidiness.
//
// The pipeline module is SELF-CONTAINED (no imports at all - it defines its own `refuse()`), so a copy needs no
// import rewriting.
//
// Run: node tests/audit-prompt-behaviour.mutants.mjs
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { falsify, formatReport } from './_lib/falsify.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const SOURCE = join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')

// The SAME sections the F22 assertions use, copied so the probe reads the suite's BEHAVIOUR rather than paraphrasing it.
const baseSections = [
  { name: 'state', order: 0, text: 'phase=explore\nmembers=r-1', source: 'framework' },
  { name: 'charter', order: 210, text: '章程：{{phase}} 阶段由 {{member}} 负责', source: 'kernel', mutable: true },
]

/** The four behavioural facts F22 depends on, read from assembled TEXT - never from a receipt field. */
async function behaviourReading(mod) {
  const out = {}
  {
    const p = mod.createPromptPipeline({ sections: baseSections, bindings: [{ section: 'state', text: 'INJECTED', role: 'reviewer' }] })
    const a = await p.assemble({ member: 'r-1', role: 'reviewer', phase: 'explore' })
    out.stateFactsSurvive = /phase=explore\nmembers=r-1/.test(a.text)
    out.bindingOnStateIgnored = !/INJECTED/.test(a.text)
  }
  {
    const p = mod.createPromptPipeline({ sections: baseSections, whoMayOverride: ['office'] })
    p.override('charter', '章程：由 office 覆写 {{member}}', 'office')
    const a1 = await p.assemble({ member: 'r-1', phase: 'explore' })
    out.overrideInEffect = /office 覆写 r-1/.test(a1.text)
    p.rollback('charter')
    const a2 = await p.assemble({ member: 'r-1', phase: 'explore' })
    out.rollbackRestores = /章程：explore 阶段由 r-1 负责/.test(a2.text)
  }
  return out
}

// ONE defect per mutation, each naming the fact it must destroy. `find` strings are asserted by the library: if a
// target is missing, the mutation is reported as MUTATION-NOT-APPLIED instead of silently doing nothing.
const MUTATIONS = [
  { label: 'caller override no longer read by the assembly', fact: 'overrideInEffect',
    find: "if (typeof overrides[name] === 'string')", replace: 'if (false)' },
  { label: 'immutability guard removed from the assembly path', fact: 'bindingOnStateIgnored',
    find: "if (entry.name === 'state' || entry.mutable === false) {", replace: 'if (false) {' },
  { label: 'rollback keeps the override', fact: 'rollbackRestores',
    find: 'if (previous === null) delete overrides[section]', replace: 'if (previous === null) { /* mutated: keep it */ }' },
]

const report = await falsify({ name: 'vmu prompt pipeline — F22 behavioural contract', module: SOURCE, mutations: MUTATIONS, probe: behaviourReading })
console.log(formatReport(report))

let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))) }
}

// CONTROL: without this, "every mutant is red" could be a broken probe rather than a real property.
ok(!!report.real && report.real.stateFactsSurvive && report.real.bindingOnStateIgnored && report.real.overrideInEffect && report.real.rollbackRestores,
  'CONTROL: the REAL module satisfies all four behavioural facts (the probe is not vacuously red)', report.real)

// Per-mutation NAMED expectation: each defect must destroy the ONE fact its label names.
// RULE E: the list is pinned non-empty first - a `for` over an empty MUTATIONS would prove nothing.
ok(MUTATIONS.length > 0, 'the mutation list is non-empty (a loop over an empty list would prove nothing)', MUTATIONS.length)
const byLabel = new Map(report.results.map((r) => [r.label, r]))
for (const m of MUTATIONS) {
  const row = byLabel.get(m.label)
  ok(!!row && row.applied && row.importable && row.falsified && !!row.red && row.red[m.fact] === false,
    m.label + ' ⇒ the F22 assertion `' + m.fact + '` goes RED (that is the proof it is a behaviour assertion)',
    row ? { applied: row.applied, importable: row.importable, falsified: row.falsified, factValue: row.red && row.red[m.fact] } : 'missing result row')
}

ok(report.ok, 'the shared falsify paradigm reports ok (every mutation applied, imported, discriminated and cleaned up)', report.problems)

console.log('')
console.log('=== VMU PROMPT BEHAVIOUR MUTANTS: ' + (failed === 0 ? 'GREEN' : 'RED (' + failed + ' failed)') + ' ===')
process.exit(failed === 0 ? 0 : 1)
