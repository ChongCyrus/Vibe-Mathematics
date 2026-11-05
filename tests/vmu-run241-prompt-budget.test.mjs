// RUN 241-A — the prompt-budget criterion, pinned on the REAL assembly.
//
// The RUN 240-D audit measured the assembled prompts and wrote a report; a report cannot fail a build. This test
// runs the same measurement the criterion exposes (`scripts/sim/audit/prompt-budget.mjs`) over the REAL assembly
// (`harness.prompts.assembleFor` — the turn loop's own path) and requires:
//
//   · zero duplicates that are NOT pinned by an out-of-scope test: one sentence twice in ONE prompt has no
//     exemption (`assemblyDups`), and cross-section duplicates are split into `bullet` (verbatim `·` lines that
//     tests/vmu-run31-seat-faces.test.mjs pins per seat), `cross-phase` (required by two DIFFERENT phases, never twice
//     in one assembly), `per-seat-pinned` (mailbox/environment protocol that
//     tests/vmu-v5r-tools.test.mjs requires in EVERY role section) and `avoidable` — the last one must be zero;
//   · zero empty sections in every slot × phase (a heading with no text teaches nothing);
//   · the chair's regular-round prompt does not grow against the RUN 240-D baseline (32442 chars → 30642 now), and
//     the chair/temp ratio is reported both ways;
//   · the chair's meeting manual (its header and its ⑦ clause) is not rendered in any non-meeting round;
//   · the criterion can go RED: the two mutants (an injected duplicate sentence, the manual injected into a regular
//     round) must both be caught. A check nobody has seen fail is not a check.
//
// No grammar over the source files: every claim is measured from bytes a seat would read.

import { mkdtempSync, rmSync } from 'fs'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const SECTIONS = await import(pathToFileURL(join(REPO, 'scripts/sim/audit/prompt-sections.mjs')).href)
const BUDGET = await import(pathToFileURL(join(REPO, 'scripts/sim/audit/prompt-budget.mjs')).href)

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push({ name, detail })
  console.log('  FAIL: ' + name + (detail ? ' — ' + JSON.stringify(detail).slice(0, 300) : ''))
}

const root = mkdtempSync(join(tmpdir(), 'vmu-run241-budget-'))
try {
  // one REAL assembly, shared by every assertion below
  const { combos, sections } = await SECTIONS.collect()
  const analysis = SECTIONS.analyzeSections(sections)
  const res = BUDGET.evaluate(combos, sections, analysis)

  ok(combos.length === 12, 'collect() produced 12 slot × phase assemblies', combos.map((c) => c.slot + '/' + c.phase))
  ok(sections.length > 500, 'collect() sliced a non-trivial number of sections', { sections: sections.length })
  ok(res.checks.every((c) => c.ok), 'every budget criterion passes on the real assembly', res.checks.filter((c) => !c.ok))
  ok(res.ok === true, 'evaluate() reports overall ok', res.metrics)

  // 1. duplicates — the exact split matters: avoidable must be 0, pinned kinds must be measured by name
  const kinds = analysis.exactDups.reduce((m, d) => { m[d.kind] = (m[d.kind] || 0) + 1; return m }, {})
  const assemblyUnexplained = analysis.assemblyDups.filter((d) => d.kind === 'unexplained')
  const assemblyPinned = analysis.assemblyDups.filter((d) => d.kind === 'per-seat-pinned')
  ok(assemblyUnexplained.length === 0, 'no sentence appears twice in the SAME prompt unless an out-of-scope test pins it per seat', assemblyUnexplained.slice(0, 3))
  ok((kinds.avoidable || 0) === 0, 'no avoidable cross-section duplicate remains', kinds)
  ok((kinds.bullet || 0) + (kinds['per-seat-pinned'] || 0) > 0,
    'the pinned categories are non-empty (otherwise the split would be vacuous)', kinds)
  ok((kinds['cross-phase'] || 0) >= 1 && assemblyUnexplained.length === 0,
    'a cross-phase duplicate exists and never appears twice in one assembly', { kinds, assembly: analysis.assemblyDups.length })
  ok(assemblyPinned.length >= 1 && assemblyPinned.every((d) => d.sections.every((id) => /^v5r-(tools-(academician|researcher|temp)|fixture-tools)$/.test(id))),
    'the per-seat-pinned assembly duplicates are the pinned sentinel only, named by section', assemblyPinned.slice(0, 2))
  ok(analysis.exactDups.every((d) => d.kind && ['bullet', 'per-seat-pinned', 'cross-phase', 'avoidable'].includes(d.kind)),
    'every duplicate carries a kind from the declared set', analysis.exactDups.filter((d) => !d.kind).slice(0, 3))

  // 2. empty sections — the RUN 240-D audit counted 14 in normal/checkpoint, 12 in meeting, 8 in verify
  ok(combos.length > 0 && combos.every((c) => c.empty === 0), 'no empty section in any slot × phase', combos.filter((c) => c.empty > 0))
  ok(combos.reduce((n, c) => n + c.empty, 0) === 0, 'the total empty count is zero', { total: combos.reduce((n, c) => n + c.empty, 0) })

  // 3. budget and ratios
  const chairNormal = combos.find((c) => c.slot === 'chair' && c.phase === 'normal').chars
  const tempNormal = combos.find((c) => c.slot === 'temp' && c.phase === 'normal').chars
  ok(chairNormal > 0 && chairNormal <= BUDGET.BEFORE_CHAIR_NORMAL, 'chair/normal did not grow against the baseline', { chairNormal, before: BUDGET.BEFORE_CHAIR_NORMAL })
  ok(res.metrics['chair/temp'] === +(chairNormal / tempNormal).toFixed(3), 'chair/temp metric is chairNormal/tempNormal', res.metrics)
  ok(res.metrics['temp/chair'] === +(tempNormal / chairNormal).toFixed(3), 'temp/chair metric is tempNormal/chairNormal', res.metrics)

  // 4. the manual only outside... no: the manual is only INSIDE meeting rounds
  const leaks = []
  for (const r of sections) {
    if (r.phase === 'meeting') continue
    for (const m of BUDGET.MANUAL_MARKERS) if (r.text.includes(m)) leaks.push({ slot: r.slot, phase: r.phase, sectionId: r.sectionId })
  }
  ok(leaks.length === 0, 'no meeting-manual marker is rendered outside a meeting round', leaks.slice(0, 3))
  const meetingManual = sections.filter((r) => r.phase === 'meeting' && r.sectionId === 'v5r-turn-meeting-schedule' && r.text.includes(BUDGET.MANUAL_MARKERS[0]))
  ok(meetingManual.length > 0, 'the manual IS still rendered on a meeting round (the gate did not hide it everywhere)', { found: meetingManual.length })
  const convene = sections.filter((r) => r.phase === 'normal' && r.sectionId === 'v5r-turn-convene' && r.text.includes('lateAdmission'))
  ok(convene.length > 0, 'the regular round instead carries the convening contract (v5r-turn-convene mentions lateAdmission)', { found: convene.length })

  // 5. dead sections / timing
  ok(analysis.timing.filter((t) => t.kind === 'always-empty').length === 0, 'no declared-but-always-empty section', analysis.timing.filter((t) => t.kind === 'always-empty'))
  ok(analysis.timing.length > 0 && analysis.timing.every((t) => t.severity), 'every timing candidate carries a severity', analysis.timing.slice(0, 3))

  // 6. mutants: the criterion must go RED on both injected failures
  const muts = BUDGET.mutants(sections)
  ok(muts.length === 2, 'two mutants were exercised', muts.map((m) => m.name))
  ok(muts.every((m) => m.detected), 'both mutants were DETECTED (the criterion can fail)', muts)

  // 7. the CLI itself must exit 0 on the real assembly (this is the command the report quotes)
  const cli = spawnSync(process.execPath, [join(REPO, 'scripts/sim/audit/prompt-budget.mjs')], { cwd: REPO, encoding: 'utf8', timeout: 180000 })
  ok(cli.status === 0, 'node scripts/sim/audit/prompt-budget.mjs exits 0', { status: cli.status, stderr: String(cli.stderr || '').slice(-400) })
  ok(/prompt-budget: PASS/.test(String(cli.stdout || '')), 'the CLI prints prompt-budget: PASS', String(cli.stdout || '').slice(-200))
} catch (e) {
  failed += 1
  failures.push({ name: 'threw', detail: String((e && e.stack) || e) })
  console.log('  FAIL(threw): ' + String((e && e.stack) || e))
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('=== vmu-run241-prompt-budget: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  for (const f of failures) console.log('  - ' + f.name)
  process.exitCode = 1
}
