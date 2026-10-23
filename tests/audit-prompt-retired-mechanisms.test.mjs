// tests/audit-prompt-retired-mechanisms.test.mjs — F5: every RETIRED mechanism must have a NAMED declaration
// inside the SAME assembled prompt the member reads.
//
// THE CONTRACT THIS PINS (Lead ruling, F5 round). The generated corpus capture (`v5r-prompts.js` /
// `v5r-persona.js`) still carries the OLD wording — it is a historical record, not live teaching, and the text
// cannot be edited there (a capture that is rewritten is no longer a record; `regen-all --check` would also
// overwrite it). The hand-written passages have been repaired, and the pack declares the repair in
// `packs/v5r/prompts/v5r-corrections.js` — text the member actually receives (orders 890-893, inside the pack
// band, after every section it corrects). So the judgement is NOT "the old words are gone" (they must stay in
// the capture where they are evidence) but "for every retired mechanism the same assembly carries its named
// correction".
//
// WHAT IS ASSERTED:
//   ① the pairing table is non-empty and every retired mechanism maps to a correction section;
//   ② each correction section NAMES the obsolete wording and the real mechanism (`declaredNeedles`);
//   ③ each correction order stays inside `ORDER_RANGES.pack` = [600, 899] (outside it the kernel derives an
//      `override` band, which is reserved and silently drops the pack section — measured this phase);
//   ④ a REAL assembly (entry -> kernel -> prompt.assemble) contains every correction marker, and — for the
//      mechanisms whose obsolete wording SURVIVES in the capture — that wording too (`captureNeedles`): the
//      pairing is only allowed to be vacuous where the old wording really is not in the shipped text;
//   ⑤ every `vibe_*` name a correction teaches is a tool the REAL kernel declares, and the names the formal
//      correction calls phantom are really absent from the tool table;
//   ⑥ TEETH: removing one declaration makes the judge name exactly that mechanism; planting an invented tool
//      name makes the tool judge catch it; a text carrying only the old wording satisfies NO mechanism.
//
// RULE E: every loop is preceded by an explicit non-empty assertion; the teeth prove each judge can go red.
//
// Run: node tests/audit-prompt-retired-mechanisms.test.mjs
// Last line: === AUDIT PROMPT RETIRED MECHANISMS: N passed, M failed ===

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const CORRECTIONS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-corrections.js')

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

const corr = await import(pathToFileURL(CORRECTIONS).href)
const orderMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)

const SECTIONS = corr.V5R_CORRECTION_SECTIONS
const PACK_BAND = orderMod.ORDER_RANGES && orderMod.ORDER_RANGES.pack

// ── THE PAIRING TABLE: retired mechanism -> its declaration ───────────────────────────────────────────────────────
// `section` is the correction that must speak for it. `declaredNeedles` are the pieces of the declaration that must
// appear in that correction's TEXT: the obsolete wording must be NAMED (a correction that only restates the new
// mechanism does not tell the reader what it supersedes) and the real mechanism must be named too. `captureNeedles`
// are the pieces of OLD wording that must still occur in the ASSEMBLY (the capture is the evidence the mechanism was
// retired, not erased); an empty list means the obsolete wording does not survive in the shipped capture text and is
// therefore only required to be named by the correction.
const RETIRED = Object.freeze([
  Object.freeze({
    id: 'reply-fence',
    section: 'v5r-fix-json-reply',
    declaredNeedles: ['每轮手写一段 json 代码围栏', 'op:"reply"', 'VMU_TURN_REPLY_CONFLICT', 'vibe_vmu_meeting'],
    captureNeedles: ['只输出一个合法 JSON 对象', 'meeting_hand'],
  }),
  Object.freeze({
    id: 'm-vote-count',
    section: 'v5r-fix-m-vote',
    declaredNeedles: ['m 票布尔一致', 'quorumCap', 'quorumOf', 'quorumRule', 'defaultTally', 'm-unanimous'],
    captureNeedles: ['m 票布尔一致'],
  }),
  Object.freeze({
    id: 'phantom-formal-tools',
    section: 'v5r-fix-formal',
    declaredNeedles: ['end_verify', 'formal_proof', 'formal:{decision,file,note}', 'vibe_v5_verified_promote', 'warrant'],
    captureNeedles: ['end_verify 的 formal_proof'],
  }),
  Object.freeze({
    id: 'tool-help-param',
    section: 'v5r-fix-tool-help',
    declaredNeedles: ['vibe_v5_tool_help', '{member}', '{"tool":"…"}', 'tool_help needs the member id'],
    captureNeedles: ['vibe_v5_tool_help({"tool"'],
  }),
  Object.freeze({
    id: 'verified-writer',
    section: 'v5r-fix-formal',
    declaredNeedles: ['vibe_v5_verified_promote', 'warrant'],
    captureNeedles: ['只输出一个合法 JSON 对象'],
  }),
])

const sectionByName = new Map(SECTIONS.map((s) => [s.name, s]))
const markerOf = (s) => {
  const t = String(s.text || '')
  const at = t.indexOf('】')
  return at === -1 ? '' : t.slice(0, at + 1)
}
const VIBE_NAMES = (text) => [...String(text).matchAll(/vibe_[A-Za-z0-9_]+/g)].map((m) => m[0])

console.log('=== 1. the pairing table and the correction ledger are well-formed (RULE E) ===')
ok(Array.isArray(SECTIONS) && SECTIONS.length > 0, 'the correction ledger is a non-empty array', Array.isArray(SECTIONS) ? SECTIONS.length : SECTIONS)
ok(Array.isArray(RETIRED) && RETIRED.length > 0, 'there are retired mechanisms to pair against (RULE E)', Array.isArray(RETIRED) ? RETIRED.length : RETIRED)
ok(SECTIONS.length === 4, 'the pack declares exactly four correction sections (the shape the ledger test pins)', SECTIONS.length)
ok(RETIRED.length > 0 && RETIRED.every((r) => r.declaredNeedles.length > 0), 'every retired mechanism carries declaration needles (a pairing without needles is a wish)')
ok(RETIRED.length > 0 && RETIRED.every((r) => sectionByName.has(r.section)), 'every retired mechanism maps to a real correction section', RETIRED.map((r) => r.section))
const ids = RETIRED.map((r) => r.id)
ok(ids.length > 0 && ids.length === new Set(ids).size, 'retired-mechanism ids are unique')
const usedSections = new Set(RETIRED.map((r) => r.section))
ok(usedSections.size >= 4, 'the five mechanisms are spread over the four sections', [...usedSections])

console.log('=== 2. each section NAMES the obsolete wording and the replacement mechanism ===')
for (const r of RETIRED) {
  const s = sectionByName.get(r.section)
  if (!ok(!!s, 'correction section exists: ' + r.section)) continue
  const text = String(s.text)
  ok(markerOf(s).length > 4, 'section carries a stable correction marker: ' + r.section, markerOf(s))
  ok(r.declaredNeedles.length > 0 && r.declaredNeedles.every((n) => text.includes(n)), 'section names the obsolete wording AND the mechanism: ' + r.id, r.declaredNeedles.filter((n) => !text.includes(n)))
  ok(text.length > 0 && text.length <= corr.V5R_CORRECTION_MAX_CHARS, 'section respects the declared character cap: ' + r.section, { len: text.length, cap: corr.V5R_CORRECTION_MAX_CHARS })
}

console.log('=== 3. the four orders stay inside the PACK band (outside it the pipeline drops them) ===')
const orders = SECTIONS.map((s) => s.order)
ok(orders.length > 0, 'the ledger yields orders to measure (RULE E)', orders)
ok(Array.isArray(PACK_BAND) && PACK_BAND.length === 2, 'the kernel really declares the pack band', PACK_BAND)
ok(orders.length === SECTIONS.length && orders.every((o) => Number.isInteger(o)), 'every correction has an integer order', orders)
ok(orders.length > 0 && orders.every((o) => o >= PACK_BAND[0] && o <= PACK_BAND[1]), 'every correction order is inside ORDER_RANGES.pack', { orders, band: PACK_BAND })
ok(orders.length > 0 && new Set(orders).size === orders.length, 'the correction orders are distinct', orders)

console.log('=== 4. the REAL assembled prompt carries every declaration; the surviving capture wording is measurably present ===')
const entry = await import(pathToFileURL(ENTRY).href)
const root = await mkdtemp(join(tmpdir(), 'vmu-f5-retired-'))
const specs = []
const ctx = {
  effect(fn) { return fn() },
  on() { return () => {} },
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
const assemblies = []
const toolTable = new Map()
const handle = entry.apply(ctx, { clock: () => 1000, root, packs: ['v5r'] })
await handle.ready()
ok(specs.length > 0, 'the pack really declares tools on the real entry', specs.length)
const declared = handle.kernel.packTools()
ok(Array.isArray(declared) && declared.length > 0, 'kernel.packTools() is non-empty on the real kernel', Array.isArray(declared) ? declared.length : declared)
for (const t of declared) toolTable.set(t.name, new Set(Object.keys(t.parameters || {})))
for (const spec of specs) if (spec && typeof spec.name === 'string') toolTable.set(spec.name, new Set(Object.keys(spec.parameters || {})))
ok(toolTable.size > 0, 'there is a real tool table to judge declarations against (RULE E)', toolTable.size)
const settings = handle.kernel.settingsSnapshot()
const cases = [
  { member: 'r-1', role: 'chair', roleLabel: '院士', phase: 'normal' },
  { member: 'r-2', role: 'member', roleLabel: '常驻研究员', phase: 'verify' },
]
ok(cases.length > 0, 'there are assembly cases to run (RULE E)', cases.length)
for (const c of cases) {
  const asm = await handle.kernel.prompt.assemble(Object.assign({ settings }, c))
  if (!ok(asm && typeof asm.text === 'string' && asm.text.length > 2000, 'assembly is non-trivial for ' + c.role + '/' + c.phase, asm && asm.text ? asm.text.length : 0)) continue
  assemblies.push({ label: c.role + '/' + c.phase, text: asm.text })
}
ok(assemblies.length > 0, 'there is at least one real assembly to judge (RULE E)', assemblies.length)

const judgeDeclarations = (text, list) => list.filter((r) => {
  const s = sectionByName.get(r.section)
  if (!s) return true
  return !String(text).includes(markerOf(s))
}).map((r) => r.id)

const captureMechanisms = RETIRED.filter((r) => r.captureNeedles.length > 0)
ok(captureMechanisms.length === RETIRED.length, 'every retired mechanism still has its obsolete wording in the assembled capture layer (the declaration supersedes something real, not a memory of it)', captureMechanisms.map((r) => r.id))

for (const a of assemblies) {
  ok(judgeDeclarations(a.text, RETIRED).length === 0, 'every retired mechanism has its declaration in the same prompt (' + a.label + ')', judgeDeclarations(a.text, RETIRED))
  ok(captureMechanisms.length > 0, 'the capture-layer check has a non-empty subject (RULE E)', captureMechanisms.length)
  for (const r of captureMechanisms) {
    const missing = r.captureNeedles.filter((n) => !a.text.includes(n))
    ok(missing.length === 0, 'obsolete wording of ' + r.id + ' really is in the assembled prompt (' + a.label + ')', missing)
  }
}

console.log('=== 5. no declaration may teach a tool the kernel does not declare ===')
const taughtNames = [...new Set(SECTIONS.flatMap((s) => VIBE_NAMES(s.text)))]
ok(taughtNames.length > 0, 'the corrections really name tools (RULE E)', taughtNames)
const unknownTaught = taughtNames.filter((n) => !toolTable.has(n))
ok(unknownTaught.length === 0, 'every tool named by a correction is declared by the real kernel', unknownTaught)
const phantom = ['end_verify', 'formal_proof']
ok(phantom.length > 0, 'the phantom names under test are enumerated (RULE E)', phantom)
ok(phantom.every((n) => !toolTable.has(n)), 'the names the formal correction calls phantom really are absent from the tool table', phantom.filter((n) => toolTable.has(n)))

console.log('=== 6. TEETH: each judge is proved able to go red ===')
ok(assemblies.length > 0, 'there is a real assembly to plant failures into (RULE E)', assemblies.length)
const realText = assemblies[0].text
ok(judgeDeclarations(realText, RETIRED).length === 0, 'TEETH baseline: the real prompt passes the declaration judge')

const removed = realText.replace('【更正·m 票】', '【已删除】')
const missingOne = judgeDeclarations(removed, RETIRED)
ok(missingOne.length === 1 && missingOne[0] === 'm-vote-count', 'TEETH: removing the m-vote declaration makes the judge name exactly that mechanism', missingOne)

const ghost = realText.replace('vibe_v5_verified_promote', 'vibe_v5_ghost_writer')
const ghostNames = [...new Set(VIBE_NAMES(ghost))].filter((n) => !toolTable.has(n))
ok(ghostNames.includes('vibe_v5_ghost_writer'), 'TEETH: an invented tool named in a declaration is caught by the tool judge', ghostNames.filter((n) => n.includes('ghost')))

const oldOnly = [
  '只输出一个合法 JSON 对象（```json 围栏内）；按 m 票布尔一致决定；法定票数 m=5；',
  'end_verify 的 formal_proof；vibe_v5_tool_help({"tool":"x"}) 查手册。',
].join('\n')
const missingAll = judgeDeclarations(oldOnly, RETIRED)
ok(RETIRED.length > 0 && missingAll.length === RETIRED.length, 'TEETH: old wording alone satisfies ZERO mechanisms (it is the defect, not the declaration)', { missing: missingAll.length, total: RETIRED.length })
ok(RETIRED.length > 0 && missingAll.length > 0, 'TEETH: the planted old-wording text really misses declarations (the check is not vacuous)')

console.log('')
console.log('=== AUDIT PROMPT RETIRED MECHANISMS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}
