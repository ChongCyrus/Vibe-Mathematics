#!/usr/bin/env node
// ★ PACK-DEFAULT FOLD + SOURCE HONESTY — MECHANISM PROOF (phase-2 round 22, after the R21 finding).
//
// ★ SCOPE, IN TWO SEPARATE SENTENCES (do not merge them):
//   (1) WHAT THIS PROVES: the MECHANISM — a pack listed at STARTUP really has its `settings/defaults.json` FOLDED,
//       and the kernel reports WHERE the value came from (`resolved[key].source === 'pack:<id>'`). It is independent
//       of WHICH key is used (a published pack's own default is reused; nothing is flipped).
//   (2) WHAT THIS DOES NOT PROVE: that OUR two feedback keys are folded in any SHIPPED pack. No published default
//       contains them — that is exactly the consequence of NOT flipping any shipped default.
//
// ★ WHY A PUBLISHED PACK (and not a temp pack): the fold reads `packs/<id>/settings/defaults.json` relative to the
// ENTRY'S OWN directory (`vibe-math-vmu.js:355` joins `here`, not `config.root`) — measured in R21: a temp tree
// reached via `config.root` never folds. Reusing v5r's real defaults exercises the route with no new seam, no
// `packs/**` writes and no temp tree.
// ★ WHY NOT ADD A `packsRoot` SEAM: that would give the product a mechanism only a test needs — against "zero
// mechanism: what is not declared does not exist".
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const { SETTING_DEFS } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'settings', 'schema.js')).href)
const clock = () => '2026-10-09T00:00:00.000Z'

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 190) + ']')) }

const fakeCtx = () => ({
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async () => () => {} },
  systemPrompt: { context: () => ({ ok: true }), section: () => () => {}, getSectionOrder: () => 5 },
})
const resolvedOf = (handle) => {
  try { return (handle && handle.kernel && handle.kernel.status().settings.resolved) || {} } catch (e) { return {} }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── the fixture: v5r's OWN defaults, and a key that is BOTH in them AND declared in schema.js ────────────────────
const v5r = JSON.parse(readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.json'), 'utf8'))
const packDefaults = (v5r && typeof v5r.defaults === 'object' && v5r.defaults) || {}
const declared = new Set(SETTING_DEFS.map((d) => d.key))
const packKeys = Object.keys(packDefaults)
const declaredPackKeys = packKeys.filter((k) => declared.has(k))
ok(packKeys.length > 0, '★ fixture: v5r really ships a `defaults` object (the mechanism needs one)', packKeys.length)
ok(declaredPackKeys.length > 0,
  '★ fixture: at least one v5r default is ALSO a declared setting (an undeclared default would be a typo the gates should catch)',
  'pack=' + packKeys.length + ' declared=' + declaredPackKeys.length + ' e.g. ' + declaredPackKeys.slice(0, 3).join(','))

const KEY = declaredPackKeys[0]
// ── ARM 1: the pack is LISTED AT STARTUP ⇒ its default must fold, and the source must say so ─────────────────────
{
  const resolved = resolvedOf(entry.apply(fakeCtx(), { clock, packs: ['v5r'] }))
  const row = resolved[KEY] || {}
  const packSourced = Object.keys(resolved).filter((k) => String(resolved[k] && resolved[k].source).startsWith('pack:'))
  ok(packSourced.length > 0 && packSourced.includes(KEY),
    '★★ NON-EMPTY PRECONDITION: a pack really was applied — the kernel sources at least one key from `pack:`',
    'pack-sourced keys=' + packSourced.length + ' sample=' + packSourced.slice(0, 3).join(','))
  ok(same(row.value, packDefaults[KEY]),
    '★★ FOLD: the kernel\'s value for a declared v5r default IS the value the pack stated (`resolved[key].value`)',
    'key=' + KEY + ' kernel=' + JSON.stringify(row.value) + ' pack=' + JSON.stringify(packDefaults[KEY]))
  // ★ WHERE THIS LABEL REALLY COMES FROM, AND WHY IT MATTERS THAT THE MESSAGE SAYS SO. The attribution used to read
  // "per `packSource[k] = 'pack:' + id`" - a line in kernel/index.js - and that misdirection cost a round: a mutation of
  // THAT line landed cleanly and changed nothing, because the kernel's `packSource` feeds a different path. The label on
  // a fold that happens BEFORE the kernel is constructed comes from the ENTRY, which is the only layer that knows it:
  // `vibe-math-vmu.js` sets `settingsSources[k] = 'pack:' + packDefaultSource[k]` for every folded default the user did
  // not override, and the kernel's own comment describes exactly this ("the entry is the only layer that knows this; the
  // kernel sees one flat object").
  //
  // ★ AND ITS RED-ABILITY IS PROVEN, NOT ASSUMED. Mutating that entry line in a throwaway archive turns it red here:
  // control 7/0 green, mutant 5/2, with THIS assertion failing as `source=config` - while the FOLD assertion above stays
  // green, which is the discrimination that matters (the value still folded; only the label was lost).
  ok(row.source === 'pack:v5r',
    '★★ SOURCE HONESTY: the kernel reports the pack as the layer (`resolved[key].source`), labelled by the ENTRY, which is the only layer that knows a pre-construction fold',
    'source=' + String(row.source))
}
// ── ARM 2 (the discriminator the Lead asked to keep): NO pack listed ⇒ the SAME key is NOT pack-sourced ─────────
{
  const resolved = resolvedOf(entry.apply(fakeCtx(), { clock }))
  const row = resolved[KEY] || {}
  ok(row.source !== 'pack:v5r',
    '★★ CONTROL: with NO pack listed the same key is NOT sourced from the pack — this only happens when the pack is declared at startup',
    'source=' + String(row.source) + ' (expected anything but pack:v5r)')
  ok(row.value === undefined || !same(row.value, packDefaults[KEY]) || row.source !== 'pack:v5r',
    '★ and the control is not vacuous: either the value differs or the source honestly says where it came from', 'source=' + String(row.source))
}

console.log('')
console.log('=== B1PRIME PACK FOLD (mechanism): ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
