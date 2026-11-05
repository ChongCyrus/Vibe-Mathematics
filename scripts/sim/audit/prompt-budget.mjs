// scripts/sim/audit/prompt-budget.mjs — the machine criterion for ASSEMBLED PROMPTS (RUN 241-A).
//
// The audit of RUN 240-D produced a report; a report cannot fail a build. This file turns the three decisions of
// RUN 241-A into checks anybody can run, against a REAL assembly (`collect()` from
// `scripts/sim/audit/prompt-sections.mjs`, which calls `harness.prompts.assembleFor` — the same path the turn loop
// uses, so a green here is a statement about the prompt a seat would actually read):
//
//   1. no duplicates that are NOT pinned by an out-of-scope test (`assemblyDups` = a sentence twice in ONE prompt,
//      which has no exemption at all; `avoidable` = a cross-section duplicate that moving is allowed for). `bullet`
//      `per-seat-pinned` and `cross-phase` duplicates are counted BY NAME in the output instead of being silently
//      forgiven — the
//      two tests that pin them live outside this lane's write scope and must stay green;
//   2. no empty section, in any slot × phase (a heading with no text teaches nothing);
//   3. the chair's regular-round prompt does not grow, measured against the RUN 240-D baseline, and the chair/temp
//      ratio is reported both ways (`chair/temp` and `temp/chair`) because the brief stated one of them ambiguously.
//   4. the chair's meeting manual stays out of regular rounds (that is the phase-gate result, not a keyword test).
//
// And it must be able to go RED. `--mutants` injects the two failures the audit found and requires this file to
// catch each one: a duplicated sentence, and the meeting manual leaking back into a regular round.
//
// Usage:
//   node scripts/sim/audit/prompt-budget.mjs            # measure, print PASS/FAIL per criterion, exit 1 on any FAIL
//   node scripts/sim/audit/prompt-budget.mjs --mutants  # require both injected failures to be detected
//
// READ-ONLY over the product: boots the kernel in a throwaway workspace, writes nothing.

import { collect, analyzeSections } from './prompt-sections.mjs'

/** RUN 240-D baseline for the chair's regular-round assembly (`chair/normal`, chars). Criterion: must not grow. */
export const BEFORE_CHAIR_NORMAL = 32442
/** The brief's ratio target. Both readings are reported; the check uses `chair/temp` because that is the one the
 *  brief wrote first ("temp/chair ≤1.25" is 0.72 and would make the criterion vacuous). */
export const RATIO_LIMIT = 1.25

/** Sentences that may only appear when a meeting exists. The manual's first line is recognizable by its header and
 *  its ⑦ clause, which is the part a regular round cannot act on. */
export const MANUAL_MARKERS = ['【开会与预约：按事件时机的顺序（你的手册）】', '⑦ 一次连排多场']

const sumEmpty = (combos) => combos.reduce((n, c) => n + (c.empty || 0), 0)
const charsOf = (combos, slot, phase) => (combos.find((c) => c.slot === slot && c.phase === phase) || {}).chars ?? 0

/** Evaluate the criteria over a REAL (or mutated) slice list. Pure — the test calls it on mutants too. */
export function evaluate(combos, sections, analysis) {
  const checks = []
  const chairNormal = charsOf(combos, 'chair', 'normal')
  const tempNormal = charsOf(combos, 'temp', 'normal')
  const memberNormal = charsOf(combos, 'member', 'normal')

  const assemblyUnexplained = analysis.assemblyDups.filter((d) => d.kind === 'unexplained')
  const assemblyPinned = analysis.assemblyDups.length - assemblyUnexplained.length
  checks.push({
    id: 'assembly-duplicates',
    ok: assemblyUnexplained.length === 0,
    detail: `${assemblyUnexplained.length} sentence(s) appear twice in the SAME prompt with no exemption (pinned per seat by an out-of-scope test: ${assemblyPinned})`,
    offenders: assemblyUnexplained.slice(0, 5),
  })
  const avoidable = analysis.exactDups.filter((d) => d.kind === 'avoidable')
  checks.push({
    id: 'avoidable-cross-section-duplicates',
    ok: avoidable.length === 0,
    detail: `${avoidable.length} avoidable duplicate sentence(s); pinned by out-of-scope tests: bullet ${analysis.exactDups.filter((d) => d.kind === 'bullet').length}, per-seat-pinned ${analysis.exactDups.filter((d) => d.kind === 'per-seat-pinned').length}; required in two phases (never twice in one assembly): cross-phase ${analysis.exactDups.filter((d) => d.kind === 'cross-phase').length}`,
    offenders: avoidable.slice(0, 5),
  })
  const empty = sumEmpty(combos)
  checks.push({
    id: 'empty-sections',
    ok: empty === 0,
    detail: `${empty} empty section(s) across ${combos.length} slot × phase assemblies`,
    offenders: combos.filter((c) => c.empty > 0),
  })
  checks.push({
    id: 'chair-normal-budget',
    ok: chairNormal > 0 && chairNormal <= BEFORE_CHAIR_NORMAL,
    detail: `chair/normal ${chairNormal} chars (baseline ${BEFORE_CHAIR_NORMAL}, delta ${chairNormal - BEFORE_CHAIR_NORMAL})`,
  })
  const leaks = []
  for (const r of sections) {
    if (r.phase === 'meeting') continue
    for (const marker of MANUAL_MARKERS) if (r.text.includes(marker)) leaks.push({ slot: r.slot, phase: r.phase, sectionId: r.sectionId, marker })
  }
  checks.push({
    id: 'manual-only-in-meeting',
    ok: leaks.length === 0,
    detail: `${leaks.length} meeting-manual marker(s) rendered outside a meeting round`,
    offenders: leaks.slice(0, 5),
  })
  const dead = analysis.timing.filter((t) => t.kind === 'always-empty')
  checks.push({
    id: 'dead-sections',
    ok: dead.length === 0,
    detail: `${dead.length} declared-but-always-empty section(s)`,
    offenders: dead.slice(0, 5),
  })

  const metrics = {
    'chair/normal': chairNormal,
    'member/normal': memberNormal,
    'temp/normal': tempNormal,
    'chair/temp': tempNormal ? +(chairNormal / tempNormal).toFixed(3) : null,
    'temp/chair': chairNormal ? +(tempNormal / chairNormal).toFixed(3) : null,
    'ratioLimit': RATIO_LIMIT,
    'exactDups': analysis.exactDups.length,
    'nearDups': analysis.nearDups.length,
    'timing': analysis.timing.length,
    'assemblyUnexplained': assemblyUnexplained.length,
    'assemblyPinned': assemblyPinned,
  }
  const failedCount = checks.filter((c) => !c.ok).length
  return { ok: failedCount === 0, checks, metrics, failedCount }
}

const MUTANT_SENTENCE = '★★ 这段是用来验证判据会红的注入重复句：同一句在同一个 prompt 里出现两次。'
const MUTANT_MANUAL = '⑦ 一次连排多场（注入）'

/** Two mutants, each must be CAUGHT. Returns [{name, detected, detail}]. */
export function mutants(sections) {
  const out = []
  {
    const mutated = sections.map((r) => ({ ...r }))
    const chairs = mutated.filter((r) => r.slot === 'chair' && r.phase === 'normal' && r.chars > 80)
    if (chairs.length < 2) {
      out.push({ name: 'duplicate-sentence', detected: false, detail: 'could not find two non-trivial chair/normal sections to inject into' })
    } else {
      for (const r of [chairs[0], chairs[1]]) r.text += '\n' + MUTANT_SENTENCE
      const res = evaluate(combosOf(mutated), mutated, analyzeSections(mutated))
      const caught = res.checks.find((c) => c.id === 'assembly-duplicates')
      out.push({ name: 'duplicate-sentence', detected: caught ? !caught.ok : false, detail: caught ? caught.detail : 'criterion missing' })
    }
  }
  {
    const mutated = sections.map((r) => ({ ...r }))
    const chair = mutated.find((r) => r.slot === 'chair' && r.phase === 'normal' && r.chars > 80)
    if (!chair) {
      out.push({ name: 'manual-in-normal', detected: false, detail: 'could not find a chair/normal section to inject into' })
    } else {
      chair.text += '\n' + MUTANT_MANUAL
      const res = evaluate(combosOf(mutated), mutated, analyzeSections(mutated))
      const caught = res.checks.find((c) => c.id === 'manual-only-in-meeting')
      out.push({ name: 'manual-in-normal', detected: caught ? !caught.ok : false, detail: caught ? caught.detail : 'criterion missing' })
    }
  }
  return out
}

/** combos derived from slices (mutants change text, not membership, so this is exact for them). */
function combosOf(sections) {
  const rows = new Map()
  for (const r of sections) {
    const k = r.slot + '/' + r.phase
    const row = rows.get(k) ?? { slot: r.slot, phase: r.phase, headings: 0, empty: 0, chars: 0 }
    row.headings += 1
    if (r.text.replace(/\s/g, '') === '') row.empty += 1
    row.chars += r.chars
    rows.set(k, row)
  }
  return [...rows.values()]
}

async function main() {
  const wantMutants = process.argv.includes('--mutants')
  const { combos, sections } = await collect()
  const analysis = analyzeSections(sections)
  if (wantMutants) {
    const results = mutants(sections)
    for (const m of results) process.stdout.write(`${m.detected ? 'DETECTED' : 'MISSED  '} ${m.name}: ${m.detail}\n`)
    const all = results.every((m) => m.detected)
    process.stdout.write(all ? 'prompt-budget mutants: PASS (both injected failures were caught)\n' : 'prompt-budget mutants: FAIL (a criterion stayed green on an injected failure)\n')
    process.exitCode = all ? 0 : 1
    return
  }
  const res = evaluate(combos, sections, analysis)
  for (const c of res.checks) {
    process.stdout.write(`${c.ok ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}\n`)
    if (!c.ok && c.offenders && c.offenders.length) for (const o of c.offenders) process.stdout.write('     - ' + JSON.stringify(o).slice(0, 300) + '\n')
  }
  process.stdout.write(`metrics: ${JSON.stringify(res.metrics)}\n`)
  process.stdout.write(res.ok ? 'prompt-budget: PASS\n' : `prompt-budget: FAIL (${res.failedCount} criterion/criteria)\n`)
  process.exitCode = res.ok ? 0 : 1
}

main().catch((e) => { process.stderr.write('prompt-budget: ' + (e && e.stack ? e.stack : e) + '\n'); process.exit(1) })
