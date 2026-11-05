#!/usr/bin/env node
// scripts/sim/run.mjs — run a scenario against the REAL kernel and write a corpus.
//
//   node scripts/sim/run.mjs                       # mainline, throwaway workspace, prints a summary
//   node scripts/sim/run.mjs --keep                # keep the workspace, print its path
//   node scripts/sim/run.mjs --out D:/_tmp/sim/corpus-mainline
//
// The corpus is the only durable output: receipts (one JSONL line per tool call), prompts (one per seat/phase
// assembly), the workspace tree with sha256 per file, and a REPORT.md a human can read without rerunning anything.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, corpusAt, tmpRoot, REPO } from './harness.mjs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes('--' + name)
const opt = (name, def) => {
  const at = argv.indexOf('--' + name)
  return at === -1 ? def : argv[at + 1]
}

const scenario = opt('scenario', 'mainline')
const keep = flag('keep')
const explicitRoot = argv.includes('--root')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = opt('out', join('D:/_tmp/sim', 'corpus-' + scenario + '-' + stamp))
const root = opt('root', tmpRoot('ws-' + scenario + '-'))
// `--vmu vmu.meetings.lateAfterMs=100` (repeatable, comma-separated). A policy whose default makes a path unreachable
// has to be declarable for a test, exactly as a deployment declares it under `config.vmu` - otherwise the honest
// finding is "the test cannot reach this code", and the dishonest one is "the scenario stopped covering it".
const cliSettings = {}
for (const pair of String(opt('vmu', '')).split(',').map((x) => x.trim()).filter(Boolean)) {
  const eq = pair.indexOf('=')
  if (eq === -1) { console.error('--vmu expects key=value, got: ' + pair); process.exit(2) }
  const k = pair.slice(0, eq)
  const raw = pair.slice(eq + 1)
  let v = raw
  if (raw === 'true' || raw === 'false') v = raw === 'true'
  else if (raw !== '' && !Number.isNaN(Number(raw))) v = Number(raw)
  cliSettings[k] = v
}

// SCENARIOS ARE DISCOVERED, NOT LISTED: adding `scripts/sim/scenarios/<name>.mjs` that exports a function is the whole
// registration step. A hard-coded map here would mean every new scenario edits this file too - and two authors editing
// the same map is exactly how a simulator ends up with a scenario nobody can run.
const SCEN_DIR = join(REPO, 'scripts/sim/scenarios')
const SCENARIOS = {}
for (const f of readdirSync(SCEN_DIR).filter((n) => n.endsWith('.mjs')).sort()) {
  const name = f.replace(/\.mjs$/, '')
  SCENARIOS[name] = async () => {
    const mod = await import(pathToFileURL(join(SCEN_DIR, f)).href)
    const fn = mod[name] || mod.scenario || mod.default
    if (typeof fn !== 'function') {
      throw new Error('scenario ' + f + ' must export a function named "' + name + '", "scenario" or default')
    }
    // A scenario may also export `settings`: the deployment settings its mechanism needs (a policy whose default
    // makes the path unreachable is not testable without them — see harness.mjs). `--vmu` on the command line wins,
    // so an operator can re-run the same scenario under a different policy without editing it.
    // A scenario may also export `deliver`: the DELEGATED seam (task-15). With it, the scenario drives `vibe_vmu_turn`
    // through the host's own subagents path (`host-deliver.js` → `deliverViaSubagents`) instead of the caller-played
    // route — the same seam a deployment has, with only the language model replaced by script. Absent ⇒ boot() is
    // unchanged and the missing-seam refusal stays observable.
    return {
      fn,
      settings: Object.assign({}, mod.settings || {}, cliSettings),
      deliver: typeof mod.deliver === 'function' ? mod.deliver : null,
    }
  }
}

async function main() {
  const loader = SCENARIOS[scenario]
  if (!loader) {
    console.error('unknown scenario: ' + scenario + ' (known: ' + Object.keys(SCENARIOS).join(', ') + ')')
    process.exit(2)
  }
  const loaded = await loader()
  const run = loaded.fn
  const h = await boot({
    root,
    settings: Object.keys(loaded.settings || {}).length > 0 ? loaded.settings : null,
    deliver: loaded.deliver,
  })
  const corpus = corpusAt(outDir)
  const result = await run(h, { log: (m) => console.log('  · ' + m) })

  corpus.manifest({
    scenario,
    startedAt: stamp,
    root,
    tools: h.names(),
    steps: result.steps.length,
    receipts: result.receipts.length,
    prompts: h.prompts.length,
    // The DECLARATION has to reach the corpus, or the audit cannot tell a predicted refusal from an unpredicted one and
    // reports both as defects (found by `scripts/sim/scenarios/comms.mjs`: 5 expected refusals, 5 A1 findings).
    expectedRefusals: Array.isArray(result.expectedRefusals) ? result.expectedRefusals : [],
  })
  corpus.receipts(result.receipts)
  corpus.prompts(h.prompts)
  corpus.tree(result.tree)
  corpus.step('highlights', result.highlights)
  // ★ RUN 240 — the STEPS have to be machine-readable, not only a markdown table. The coverage gate proves "every one of
  // the 93 rules is exercised by a real scenario step"; it can only do that if the corpus says which steps ran and
  // whether each one was allowed or refused. Reading names back out of REPORT.md would make the gate a parser of prose.
  corpus.step('steps', { scenario, steps: result.steps })

  // A refusal is not automatically a defect: a scripted, in-process run has no LaTeX/Lean executor and no model, so
  // "this assembly cannot compile a PDF" is an ENVIRONMENT fact here. Those are counted separately and never fail the
  // run — anything else is a mechanism refusal and does fail it.
  const ENVIRONMENTAL = ['VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING', 'VMU_ENGINE_UNAVAILABLE']
  // A scenario that exercises a REFUSAL has to be able to say so, or every honest scenario about "this contradiction
  // must be refused" fails the runner and the pressure is to stop testing refusals. `expectedRefusals` is that
  // declaration: `{ tool, code }` pairs the scenario PREDICTED. A predicted refusal still appears in the report with its
  // code and hint (it is evidence); it is just not counted as a mechanism defect. An UNPREDICTED refusal is a defect -
  // the asymmetry has to point that way.
  const expected = Array.isArray(result.expectedRefusals) ? result.expectedRefusals : []
  const isExpected = (r) => expected.some((e) => (!e.tool || e.tool === r.tool) && (!e.code || e.code === (r.receipt && r.receipt.code)))
  const allRefused = result.receipts.filter((r) => r.receipt && r.receipt.ok === false)
  const environmental = allRefused.filter((r) => ENVIRONMENTAL.includes(r.receipt.code))
  const expectedHere = allRefused.filter((r) => !ENVIRONMENTAL.includes(r.receipt.code) && isExpected(r))
  const refused = allRefused.filter((r) => !ENVIRONMENTAL.includes(r.receipt.code) && !isExpected(r))
  const report = [
    '# sim report — ' + scenario,
    '',
    '- workspace: `' + root + '`' + (keep ? ' (kept)' : ''),
    '- tools registered: ' + h.names().length,
    '- steps: ' + result.steps.length + ', tool calls: ' + result.receipts.length + ', prompts assembled: ' + h.prompts.length,
    '- refusals: ' + allRefused.length + ' (' + refused.length + ' mechanism · ' + expectedHere.length + ' expected · ' + environmental.length + ' environmental)',
    '',
    '## steps',
    '',
    '| step | ok | code | files before → after |',
    '| --- | --- | --- | --- |',
    ...result.steps.map((s) => '| ' + s.name + ' | ' + (s.ok ? 'ok' : 'REFUSED') + ' | ' + (s.code || '') + ' | ' + s.files.before + ' → ' + s.files.after + ' |'),
    '',
    '## prompt sizes (chars)',
    '',
    Object.entries(result.promptChars || {}).map(([k, v]) => '- ' + k + ': ' + v).join('\n'),
    '',
    '## refused calls (the audit reads these)',
    '',
    refused.length === 0 ? '(none)' : refused.map((r) => '- #' + r.seq + ' ' + r.tool + ' → `' + (r.receipt.code || 'refused') + '` — ' + String(r.receipt.message || r.receipt.hint || '').slice(0, 300)).join('\n'),
    '',
    '## refusals the scenario PREDICTED (evidence, not defects)',
    '',
    expectedHere.length === 0 ? '(none)' : expectedHere.map((r) => '- #' + r.seq + ' ' + r.tool + ' -> ' + String(r.receipt.code || 'refused') + ' -- ' + String(r.receipt.message || r.receipt.hint || '').slice(0, 300)).join(String.fromCharCode(10)),
    '',
    '## files produced',
    '',
    result.tree.length === 0 ? '(empty)' : result.tree.map((f) => '- `' + f.path + '` — ' + f.bytes + ' B').join('\n'),
    '',
  ].join('\n')
  writeFileSync(join(outDir, 'REPORT.md'), report)
  corpus.manifest({
    scenario,
    startedAt: stamp,
    root,
    tools: h.names(),
    steps: result.steps.length,
    receipts: result.receipts.length,
    prompts: h.prompts.length,
    expectedRefusals: expected,
    expectedMatched: expectedHere.map((r) => ({ seq: r.seq, tool: r.tool, code: (r.receipt && r.receipt.code) || null })),
    refusals: { total: allRefused.length, mechanism: refused.length, expected: expectedHere.length, environmental: environmental.length },
  })

  console.log('\n' + report.split('\n').slice(0, 12).join('\n'))
  console.log('\ncorpus: ' + outDir)
  // ★ RUN 226 / task-15 — A CLEAN EXIT IS PART OF THE MECHANISM, NOT A DETAIL AFTER IT. This script used to end with
  // `process.exit()`, which killed the process while fire-and-forget writes were still in flight: the store's
  // `persist()` builds a temp file (`kernel/store.js:178`) and renames it, and `kernel/idempotency.js` queues ledger
  // writes with `store.patch()` without awaiting them. A `process.exit()` between writeFile and rename leaves a
  // ZERO-BYTE `vmu/state.json.<pid>.<ts>.tmp` behind — an orphan that looks like corruption and is really a truncated
  // exit. So the exit now goes THROUGH the entry's own teardown (`handle.cleanups`, whose cleanup awaits
  // `kernel.shutdown()`: it waits for in-flight state writes and flushes the journals), and the workspace is removed
  // unless the operator asked to keep it.
  try {
    const cleanups = h.handle && Array.isArray(h.handle.cleanups) ? h.handle.cleanups : []
    await Promise.all(cleanups.map(async (c) => { try { return await c() } catch { return null } }))
  } catch { /* teardown must never turn a finished run red */ }
  if (keep || explicitRoot) {
    // Kept for inspection when asked for explicitly: a human can read the files the run produced.
    console.log('workspace kept for inspection: ' + root)
  } else {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* an undeletable temp dir is not a mechanism defect */ }
    console.log('workspace removed (pass --keep to inspect the files): ' + root)
  }
  process.exitCode = refused.length === 0 ? 0 : 1
}

mkdirSync(outDir, { recursive: true })
main().catch((e) => {
  console.error('sim failed: ' + ((e && e.stack) || e))
  process.exit(1)
})
