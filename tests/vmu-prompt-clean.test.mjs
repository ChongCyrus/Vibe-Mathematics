// vmu: "P IS CLEAN" AS A SUITE TEST — the P-clean arm must have the REPORT TOOL and NO reporting prompt.
// (round 43, task-188; the criterion was established and measured in round 42 / task-185.)
//
// WHY THIS FILE EXISTS. R41's three-arm behavioural experiment found no arm reporting spontaneously, but P (the
// prompt asking for reports) was never fully stripped: the v5r pack's model-visible prompt carries it. So arm A's
// "reporting" could have been P rather than S, and the experiment could not tell them apart. R42 built the P-clean
// assembly; this file FREEZES the criterion so the assembly cannot silently stop being clean.
//
// THE ASSEMBLY UNDER TEST: declare the framework's REPORT FACE and load NO prompt-carrying pack.
//   `vmu: { tools: { faces: ['report', 'status'] } }`   and NO `packs: ['v5r']`
// `vibe_vmu_report` is a FRAMEWORK face (`TOOL_FACES.report`, families ['vmu.report.'], config ['report']), not a
// v5r product - which is exactly why the tool can be present while the prompt is absent.
//
// ★ HOW THE COUNT IS TAKEN (this distinction is the point): we CAPTURE the arguments of `systemPrompt.section(...)`
// - the text the model would actually receive - and count the vocabulary in THAT. We do NOT grep the pack sources.
// TWO LAYERS, WHICH MUST NOT BE CONFLATED (measured R42):
//   · SOURCE layer  (`packs/*/prompts/*.js`, 8 files): ~430 hits of the same vocabulary;
//   · INJECTED layer (what the model sees; the assembled subset): 12 hits with v5r, 0 without.
// A source grep therefore OVERSTATES what is model-visible, and a clean source grep would not by itself prove a
// clean injection either - so the criterion is taken at the INJECTED layer, and both numbers are reported.
//
// ★ RESIDUAL SCOPE (named, not implied): this covers `packs/*/prompts` as the prompt SOURCE and
// `systemPrompt.section` as the ONE injection path. It does NOT enumerate other in-pack prompt sources, nor any
// prompt text the HOST itself may concatenate - that second one is a HOST BOUNDARY, outside what we can observe
// (the same class as `hostElision` for the receipt).
//
// ★ `execute()` on a vmu tool returns a JSON STRING, not an object - it must be parsed.

import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

// The vocabulary R41 used. ★ `report` is included and DOES also match the tool name - which is exactly why the
// count is only ever taken over the INJECTED TEXT, never over a tool list or a source file.
const VOCAB = /汇报|报告|report|进度|Progress/g
const hits = (s) => (String(s || '').match(VOCAB) || []).length

/** Assemble through the REAL entry, capturing whatever the entry tries to inject as the model-visible prompt. */
async function assemble({ packs = null, settings = {} } = {}) {
  const tools = {}
  const injected = []
  const ctx = {
    effect: (f) => f(),
    on: () => () => {},
    tools: { register: async (s) => { if (s && s.name) tools[s.name] = s; return () => { } } },
    systemPrompt: { section: (arg) => { injected.push(arg); return () => { } } },
  }
  const dir = await mkdtemp(join(tmpdir(), 'vmu-pclean43-'))
  const cfg = { clock: () => 1000000, deliver: () => {}, root: dir, vmu: { ...settings } }
  if (packs) cfg.packs = packs
  const handle = entry.apply(ctx, cfg)
  await handle.ready()
  const status = JSON.parse(await tools['vibe_vmu_status'].execute({}))
  try { await rm(dir, { recursive: true, force: true }) } catch { }
  const text = injected.map((x) => (typeof x === 'string' ? x : (x && x.text) || '')).join('\n')
  return { tools: Object.keys(tools).sort(), sections: injected.length, text, hits: hits(text), promptSection: status.promptSection }
}

const FACES = { 'vmu.tools.faces': ['report', 'status'] }
const clean = await assemble({ settings: FACES })                       // ★ P-clean: face declared, NO pack
const control = await assemble({ settings: FACES, packs: ['v5r'] })     // ★ CONTROL: same faces + the pack

// ---------------------------------------------------------------------------------------------------------
// A. NON-VACUITY FIRST: "clean" is meaningless unless the REPORT TOOL is actually there.
// ---------------------------------------------------------------------------------------------------------
ok(clean.tools.length > 0 && clean.tools.includes('vibe_vmu_report'),
  'A1. ★ the P-clean arm really REGISTERS the report tool (otherwise "no reporting prompt" is an empty claim)', clean.tools)
ok(control.tools.includes('vibe_vmu_report'),
  'A2. the CONTROL arm has the same tool, so the two arms differ in P, not in S', control.tools.length)

// ---------------------------------------------------------------------------------------------------------
// B. THE CRITERION: no injected prompt at all, measured on the CAPTURED text
// ---------------------------------------------------------------------------------------------------------
ok(clean.sections === 0 && clean.text === '',
  'B1. ★ the P-clean arm injects NOTHING (0 sections, 0 characters) - measured on the captured `systemPrompt.section` arguments, not by grepping sources',
  { sections: clean.sections, chars: clean.text.length })
// ★★ THE ANTI-VACUITY ASSERTION: a zero here only means something if the SAME detector fires on the CONTROL.
ok(control.hits > 0 && clean.hits === 0,
  'B2. ★★ the vocabulary detector WORKS (it fires on the control) and is silent on the P-clean arm - so this is not "both sides zero"',
  { clean: clean.hits, control: control.hits })
ok(clean.sections === 0 || clean.hits === 0,
  'B3. no reporting requirement reaches the model in this arm', { sections: clean.sections, hits: clean.hits })
// ★ CLEAN IS NOT DEGRADED: "nothing declared" and "declaration failed" are different states (`code:null` vs a code).
ok(clean.promptSection && clean.promptSection.registered === false && clean.promptSection.code === null,
  'B4. ★ the arm is CLEAN, not DEGRADED: no prompt was declared (`registered:false`, `code:null`), so this is not `VMU_EXTERNAL_UNAVAILABLE`',
  clean.promptSection)

// ---------------------------------------------------------------------------------------------------------
// C. THE CONTROL CONTRAST (readings recorded; structure asserted so the numbers may drift with content)
// ---------------------------------------------------------------------------------------------------------
ok(control.sections > 0 && control.text.length > 0 && control.hits > 0,
  'C1. ★ the CONTROL arm DOES inject a reporting prompt (the P that R41 could not strip): sections > 0, characters > 0, hits > 0',
  { sections: control.sections, chars: control.text.length, hits: control.hits })
ok(control.tools.length >= clean.tools.length && clean.tools.every((t) => control.tools.includes(t)),
  'C2. the control is a SUPERSET of the clean arm in tools, so the comparison isolates the prompt and not the surface',
  { clean: clean.tools.length, control: control.tools.length })
// R42 readings for the record (structure is what is asserted above; these are measurements, not the contract):
//   P-clean  : 4 tools (records/report/set/status) / 0 sections / 0 chars / 0 hits
//   CONTROL  : 16 tools / 1 section / 1453 chars / 12 hits
console.log('  [readings] clean: ' + clean.tools.length + ' tools / ' + clean.sections + ' sections / ' + clean.text.length + ' chars / ' + clean.hits + ' hits')
console.log('  [readings] control: ' + control.tools.length + ' tools / ' + control.sections + ' sections / ' + control.text.length + ' chars / ' + control.hits + ' hits')

console.log('=== VMU PROMPT CLEAN: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
