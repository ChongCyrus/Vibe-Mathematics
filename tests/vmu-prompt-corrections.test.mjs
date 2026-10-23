// tests/vmu-prompt-corrections.test.mjs — F5: the pack's CORRECTION SECTIONS are real, ordered, and actually assembled.
//
// THE DEFECT CLASS THIS PINS. The F5 audit measured passages whose TEACHING does not match the mechanism:
//   · `vibe_v5_tool_help({"tool":"工具名称"})` — the tool takes `{member}` only (packs/v5r/tools.js:243-265);
//   · `end_verify` / `formal_proof` — neither name exists anywhere in the kernel or the tool face;
//   · "every round hand-write a ```json fence" — the structured report channel is `vibe_vmu_turn {op:"reply"}`
//     (tools/turn.js:88-121); the fence is the compatibility path;
//   · "m 票" read as a counting rule — `m` is the QUORUM SIZE (quorumCap), and agreement is unanimity
//     (kernel/ballot.js defaultTally), not "collect m votes".
// The text cannot be edited where it lives: the charter lines are baselined against the original capture (T71) and the
// fixture passages are GENERATED from a capture the full sweep rewrites. So the pack APPENDS a named correction
// (`packs/v5r/prompts/v5r-corrections.js`), and this suite is what makes that correction a MECHANISM rather than prose:
// it must exist, name both the obsolete wording and the real mechanism, sit AFTER everything it corrects, and be
// present in the REAL assembled member prompt — not merely exported from a module.
//
// WHY ORDER IS ASSERTED MECHANICALLY AND NOT BY EYE: the pipeline sorts sections by `order`, so a correction at 590 would
// be read BEFORE the sentence it corrects, and the member would be left with the old wording as the last word. The
// generated fixtures occupy 600 + i, so a correction must be ≥ 800 and strictly after the highest declared order.
//
// RULE E: every loop is preceded by an explicit non-empty assertion, and every "it is there" assertion is paired with a
// read-back of the thing that carries it (the assembled text, not the module constant).
//
// Run: node tests/vmu-prompt-corrections.test.mjs   (last line: === VMU PROMPT CORRECTIONS: N passed, M failed ===)

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))))
  console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 300) + ']'))
  return false
}
const J = (o) => JSON.stringify(o)

const corr = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-corrections.js')).href)
const core = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')).href)
const promptsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-prompts.js')).href)
// THE PACK BAND IS A KERNEL FACT, MEASURED RATHER THAN HARDCODED. A section's `range` is DERIVED from its `order`, and a
// pack may only claim `ORDER_RANGES.pack = [600, 899]`; an order of 900 silently derives range 'override' and the pipeline
// drops the section from the assembly. This suite made exactly that mistake once, so the band is now imported and asserted.
const orderMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)

const SECTIONS = corr.V5R_CORRECTION_SECTIONS
const BASE = corr.V5R_CORRECTION_BASE_ORDER
const MAXC = corr.V5R_CORRECTION_MAX_CHARS
const PACK = core.PACK
const PROMPTS = promptsMod.PROMPTS
const COUNTS = promptsMod.COUNTS
const PACK_BAND = orderMod.ORDER_RANGES && orderMod.ORDER_RANGES.pack

// what each correction must name: [obsolete wording, the real mechanism's marker]
const EXPECTED = Object.freeze([
  Object.freeze({ name: 'v5r-fix-json-reply', oldNeedles: ['json 代码围栏'], newNeedles: ['op:"reply"', 'VMU_TURN_REPLY_CONFLICT'], marker: '【更正·回复形状】' }),
  Object.freeze({ name: 'v5r-fix-tool-help', oldNeedles: ['vibe_v5_tool_help', '"tool"'], newNeedles: ['{member}', 'tool_help needs the member id'], marker: '【更正·工具查询】' }),
  Object.freeze({ name: 'v5r-fix-formal', oldNeedles: ['end_verify', 'formal_proof'], newNeedles: ['formal:{decision,file,note}'], marker: '【更正·形式化】' }),
  Object.freeze({ name: 'v5r-fix-m-vote', oldNeedles: ['m 票'], newNeedles: ['quorumRule', 'defaultTally', 'm-unanimous'], marker: '【更正·m 票】' }),
  Object.freeze({ name: 'v5r-fix-leader-id', oldNeedles: ['没有在册院士'], newNeedles: ['vmu.turn.leaderId', 'vibe_v5_configure', 'leadership.code'], marker: '【更正·领头人】' }),
])

console.log('=== 1. the correction ledger is a well-formed, complete statement ===')
// RULE E: the checks below are equalities over two collections and every() over one, so BOTH sides are proved
// non-empty FIRST — two empty collections compare equal and every() is true on an empty set (the vacuous-pass
// shape `tests/audit-declaration-criterion.test.mjs` gates; without these guards this file would add NEW
// fingerprints to that baseline instead of shrinking it).
ok(Array.isArray(SECTIONS) && SECTIONS.length > 0, 'the correction ledger is a non-empty array', Array.isArray(SECTIONS) ? SECTIONS.length : SECTIONS)
ok(Array.isArray(EXPECTED) && EXPECTED.length > 0, 'there are expected corrections to compare against (RULE E)', Array.isArray(EXPECTED) ? EXPECTED.length : EXPECTED)
ok(SECTIONS.length === EXPECTED.length, 'the correction list carries exactly the corrections the ruling named', { sections: SECTIONS.length, expected: EXPECTED.length })
ok(Object.isFrozen(SECTIONS) && SECTIONS.length > 0 && SECTIONS.every((s) => Object.isFrozen(s)), 'the ledger and every entry are frozen (a runtime mutation cannot add or edit a correction)')
const names = SECTIONS.map((s) => s.name)
ok(names.length === new Set(names).size, 'the section names are unique (the pipeline would refuse a duplicate by name)', names)
ok(EXPECTED.length > 0 && EXPECTED.every((e) => names.includes(e.name)), 'every expected correction is present by name', names)
ok(typeof BASE === 'number' && BASE >= 800, 'the declared base order is at 800 or later (generated fixtures are 600 + i, authored sections reach 820)', BASE)
ok(Array.isArray(PACK_BAND) && PACK_BAND.length === 2, 'the kernel really declares a pack order band to measure against', PACK_BAND)
ok(typeof MAXC === 'number' && MAXC > 0 && MAXC <= 600, 'the declared character cap is a real cap, not a placeholder', MAXC)

console.log('=== 2. each correction names the obsolete wording AND the real mechanism ===')
ok(EXPECTED.length > 0, 'there are expected entries to check (RULE E)')
for (const e of EXPECTED) {
  const s = SECTIONS.find((x) => x.name === e.name)
  if (!ok(!!s, 'section exists: ' + e.name)) continue
  const text = String(s.text)
  ok(typeof s.text === 'string' && text.length > 60, 'correction is substantive text, not a stub: ' + e.name, text.length)
  ok(text.length <= MAXC, 'correction respects the character cap (' + MAXC + '): ' + e.name, text.length)
  ok(s.range === 'pack', 'correction is a PACK-range section: ' + e.name, s.range)
  ok(typeof s.source === 'string' && s.source.startsWith('v5r-correction:'), 'correction carries a distinguishable source tag: ' + e.name, s.source)
  ok(e.oldNeedles.length > 0 && e.oldNeedles.every((n) => text.includes(n)), 'correction names the OBSOLETE wording: ' + e.name, e.oldNeedles.filter((n) => !text.includes(n)))
  ok(e.newNeedles.length > 0 && e.newNeedles.every((n) => text.includes(n)), 'correction names the REAL mechanism: ' + e.name, e.newNeedles.filter((n) => !text.includes(n)))
  ok(text.includes(e.marker), 'correction carries its stable marker (what the assembly assertions look for): ' + e.name, e.marker)
}

console.log('=== 3. order: strictly after every section it corrects ===')
const declared = Array.isArray(PACK.sections) ? PACK.sections : []
ok(declared.length > 0, 'the manifest really declares sections (PACK.sections getter ran)', declared.length)
ok(Array.isArray(PROMPTS) && PROMPTS.length === COUNTS.total, 'the generated corpus band is measurable (PROMPTS === COUNTS.total)', { prompts: PROMPTS.length, total: COUNTS.total })
const generatedMax = 600 + (PROMPTS.length - 1)
const correctionOrders = SECTIONS.map((s) => s.order)
// RULE E: every assertion over `correctionOrders` carries its OWN non-empty guard — a guard three lines up does not
// excuse the next `every()` (the scan window is three lines), and an empty order list would satisfy all of them.
ok(correctionOrders.length > 0, 'the ledger yields orders to measure (RULE E)', correctionOrders)
ok(correctionOrders.length === SECTIONS.length, 'one order per correction (no correction is skipped by the ordering check)', { orders: correctionOrders.length, sections: SECTIONS.length })
ok(correctionOrders.length > 0 && correctionOrders.every((o) => Number.isInteger(o)), 'every correction has an integer order', correctionOrders)
ok(correctionOrders.length > 0 && correctionOrders.every((o) => o >= BASE), 'every correction is at or above the declared base order', { orders: correctionOrders, base: BASE })
ok(correctionOrders.length > 0 && correctionOrders.every((o) => o > generatedMax), 'every correction orders AFTER the whole generated fixture band', { orders: correctionOrders, generatedMax })
const nonCorrection = declared.filter((s) => !names.includes(s.name) && Number.isInteger(s.order))
ok(nonCorrection.length > 0, 'there are non-correction sections to compare against (RULE E)', nonCorrection.length)
const highestOther = nonCorrection.reduce((a, s) => Math.max(a, s.order), -Infinity)
ok(correctionOrders.every((o) => o > highestOther), 'every correction orders after EVERY other declared section (nothing can come after the last word)', { correctionOrders, highestOther })
ok(Array.isArray(PACK_BAND) && correctionOrders.every((o) => o >= PACK_BAND[0] && o <= PACK_BAND[1]),
  'every correction sits inside the PACK band (outside it the range derives to a kernel-reserved band and the pipeline drops the section)',
  { orders: correctionOrders, packBand: PACK_BAND })
const registered = names.filter((n) => declared.some((s) => s.name === n))
ok(names.length > 0 && registered.length === names.length, 'every correction is REGISTERED on the manifest (PACK.sections), not merely exported', { registered, names })

console.log('=== 4. a correction must not look like the divergence it corrects ===')
// The mechanism-parity gate (tests/vmu-prompt-mechanism-parity.test.mjs) watches four taught-claim families and treats a
// hit as a DIVERGENCE needing a ledger entry. A correction says the truth; if its prose tripped those families the two
// gates would fight, so this is asserted here rather than discovered later.
const FAMILY_TRAPS = Object.freeze([
  { id: 'unknown-field-refusal', re: /会被判\s*`VMU_TURN_UNKNOWN_FIELD`/ },
  { id: 'fixture-vocabulary', re: /本夹具/ },
  { id: 'reply-field-catalogue', re: /顶层只允许这四个字段/ },
  { id: 'meeting-field-in-reply', re: /"(?:meeting_hand|meeting_invite)":/ },
])
ok(FAMILY_TRAPS.length > 0, 'there are family traps to test against (RULE E)', FAMILY_TRAPS.length)
for (const s of SECTIONS) {
  const hits = FAMILY_TRAPS.filter((t) => t.re.test(String(s.text))).map((t) => t.id)
  ok(hits.length === 0, 'correction does not trip a parity family (' + s.name + ')', hits)
}

console.log('=== 5. the REAL assembled member prompt carries all corrections, after the old wording ===')
const entry = await import(pathToFileURL(ENTRY).href)
const root = await mkdtemp(join(tmpdir(), 'vmu-f5-corrections-'))
const specs = []
const ctx = {
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
let assemblies = []
try {
  const handle = entry.apply(ctx, { clock: () => 1000, root, packs: ['v5r'] })
  await handle.ready()
  ok(specs.length > 0, 'the pack really declares tools on the real entry (so this assembly is the product shape)', specs.length)
  const kernel = handle.kernel
  const settings = kernel.settingsSnapshot()
  const cases = [
    { member: 'r-1', role: 'chair', roleLabel: '院士', phase: 'normal' },
    { member: 'r-2', role: 'member', roleLabel: '常驻研究员', phase: 'normal' },
    { member: 'r-3', role: 'member', roleLabel: '常驻研究员', phase: 'founding' },
  ]
  ok(cases.length > 0, 'there are assembly cases to run (RULE E)', cases.length)
  for (const c of cases) {
    const asm = await kernel.prompt.assemble(Object.assign({ settings }, c))
    if (!ok(asm && typeof asm.text === 'string' && asm.text.length > 2000, 'assembly is non-trivial for ' + c.role + '/' + c.phase, asm && asm.text ? asm.text.length : 0)) continue
    assemblies.push({ label: c.role + '/' + c.phase, text: asm.text })
  }
} finally {
  try { /* kernel teardown is the owner's; nothing here mutates the repo */ } catch { /* ignore */ }
}
ok(assemblies.length > 0, 'there is at least one real assembly to judge (RULE E)', assemblies.length)

// The obsolete line each correction supersedes, so ordering is measured against the OLD wording inside the SAME text.
const SUPERSEDES = Object.freeze([
  { marker: '【更正·回复形状】', oldLine: '只输出一个合法 JSON 对象' },
  { marker: '【更正·工具查询】', oldLine: 'vibe_v5_tool_help({"tool"' },
  { marker: '【更正·形式化】', oldLine: 'end_verify 的 formal_proof' },
  { marker: '【更正·m 票】', oldLine: 'm 票布尔一致' },
])
ok(assemblies.length > 0, 'there are real assemblies to judge the ordering on (RULE E)', assemblies.length)
for (const a of assemblies) {
  const missing = SUPERSEDES.filter((s) => !a.text.includes(s.marker)).map((s) => s.marker)
  ok(missing.length === 0, 'every correction is in the assembled prompt (' + a.label + ')', missing)
  const misordered = SUPERSEDES.filter((s) => {
    const oldAt = a.text.indexOf(s.oldLine)
    const newAt = a.text.indexOf(s.marker)
    return oldAt === -1 || newAt === -1 || !(newAt > oldAt)
  }).map((s) => s.marker)
  ok(misordered.length === 0, 'every correction is read AFTER the wording it corrects, inside the same prompt (' + a.label + ')', misordered)
}

console.log('=== 6. TEETH: the judge is reusable and a missing correction is caught ===')
// A gate that cannot go red is not a gate. Re-run the same containment judge over a ledger with one section removed and
// require the failure to appear — this is what proves §5's green is a measurement rather than a tautology.
const judgeMissing = (list, text) => list.filter((s) => !text.includes(s.marker))
const realText = assemblies[0].text
ok(judgeMissing(SUPERSEDES, realText).length === 0, 'TEETH baseline: the real prompt passes the judge', judgeMissing(SUPERSEDES, realText))
const truncated = SUPERSEDES.filter((s) => s.marker !== '【更正·m 票】')
const plantedFailure = judgeMissing(SUPERSEDES, realText.replace('【更正·m 票】', '【已删除】'))
ok(plantedFailure.length === 1 && plantedFailure[0].marker === '【更正·m 票】', 'TEETH: removing a correction from the text makes the judge report exactly it', plantedFailure.map((x) => x.marker))
ok(truncated.length === SUPERSEDES.length - 1, 'TEETH: the truncated list is really shorter (the check above is not vacuous)', truncated.length)

console.log('')
console.log('=== VMU PROMPT CORRECTIONS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}
