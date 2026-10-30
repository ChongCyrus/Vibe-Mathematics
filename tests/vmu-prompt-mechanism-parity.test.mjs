// tests/vmu-prompt-mechanism-parity.test.mjs — F5「提示词教的东西必须与真实机制一致」（横向门禁）。
//
// THE DEFECT CLASS THIS PINS. This tree has single-point assertions that a prompt SECTION exists and that a tool face is
// declared, but nothing compared the two directions at once: an assembled prompt of ~22-24k characters tells a member
// what it may write back, and the kernel separately decides what it accepts. Round 16 measured several places where the
// prompt's teaching and the kernel's behaviour disagree — a member that follows the prompt is then refused, or believes
// it was refused when it was not. Each disagreement is a defect in the PROMPT (this lane does not edit prompts; the
// pack lane does), so the gate keeps them NAMED and OWNED in `tests/_lib/prompt-mechanism-whitelist.mjs` and turns red
// on anything new.
//
// WHAT IS ASSERTED, in both directions:
//   ① the text the gate judges is the REAL ASSEMBLED prompt (real entry → real kernel → `prompt.assemble`), not a
//      hand-built fixture and not the loader tree;
//   ② the MECHANISM is re-measured on every run through the real turn orchestrator (`parse` / `plan`) and through the
//      exported field catalogue — the whitelist's `reason` numbers are therefore re-checkable, not folklore;
//   ③ every taught paragraph that belongs to a family is either consistent (family not triggered) or covered by a
//      whitelist entry whose stable substring really occurs in that paragraph;
//   ④ SHRINK-ONLY: an entry whose taught text is gone (fixed in the prompt) is a RED — the list cannot rot;
//   ⑤ the detector has teeth (self-probe: a planted un-whitelisted teaching trips it; a planted whitelisted one does
//      not) and honours `VMU_PARITY_EXTRA_TEXT=<file>` so the red can be demonstrated on the real assembly too.
//
// RULE E: every loop below is preceded by an explicit NON-EMPTY assertion.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { PROMPT_MECHANISM_DIVERGENCES } from './_lib/prompt-mechanism-whitelist.mjs'
import { createTurnOrchestrator, FIELD_OWNERS, RECORDED_FIELDS, REPLY_FIELDS } from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const PROMPT_DIR = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

/**
 * THE FAMILIES the gate watches. A family is a taught CLAIM about the reply mechanism, expressed as a regex that
 * finds the paragraph which teaches it. `mechanism` names the probe below that decides whether the claim is still true.
 */
const FAMILIES = Object.freeze([
  Object.freeze({
    id: 'unknown-field-refusal',
    taught: 'an unregistered top-level reply field is refused as VMU_TURN_UNKNOWN_FIELD',
    regex: /会被判\s*`VMU_TURN_UNKNOWN_FIELD`/,
    mechanism: 'unknown-field-mode',
  }),
  Object.freeze({
    id: 'fixture-vocabulary',
    taught: 'the production prompt addresses the TEST FIXTURE ("本夹具") as the authority for the reply contract',
    regex: /本夹具/,
    mechanism: 'fixture-vocabulary',
  }),
  // ★ RUN 151: the family `reply-field-catalogue` (regex /顶层只允许这四个字段/) is GONE, together with its ledger
  // entry, because the sentence it watched was fixed: the fixture-tools section now says the four fields are THIS
  // FIXTURE's convergence recipe and names the registered fields the kernel also accepts (REPLY_FIELDS=29). The
  // shrink-only rule (§1) is what forced the ledger entry out; the family goes with it so no family watches a claim
  // the prompts no longer make.
  Object.freeze({
    id: 'meeting-field-in-reply',
    taught: 'a meeting hand / invitation may be written as a JSON reply field',
    regex: /"(?:meeting_hand|meeting_invite)":/,
    mechanism: 'meeting-field-shape',
  }),
])

const FAMILY_IDS = FAMILIES.map((f) => f.id)
ok(FAMILIES.length > 0 && FAMILY_IDS.length === FAMILIES.length, 'the family list is non-empty and fully declared')

// ── SECTION 1 — the whitelist is a well-formed, shrink-only ledger ────────────────────────────────────────────────
const entries = PROMPT_MECHANISM_DIVERGENCES
ok(Array.isArray(entries) && entries.length > 0, 'the known-divergence ledger is a non-empty array', entries.length)
for (const e of entries) {
  ok(FAMILY_IDS.includes(e.family), `entry family is declared: ${e.family}`, e.family)
  ok(typeof e.contains === 'string' && e.contains.length >= 6, `entry carries a usable stable substring: ${J(e.contains)}`)
  ok(typeof e.owner === 'string' && e.owner.length > 0, `entry names the owner lane: ${e.family} ${J(e.owner)}`)
  ok(typeof e.reason === 'string' && e.reason.length >= 20, `entry states the measured mechanism fact: ${J(e.contains)}`)
  ok(typeof e.expiry === 'string' && e.expiry.length >= 10, `entry states the concrete removal condition: ${J(e.contains)}`)
  ok(typeof e.reviewed === 'string' && /^R\d+$/.test(e.reviewed), `entry records when the mechanism was measured: ${J(e.contains)}`, e.reviewed)
}
const containsList = entries.map((e) => e.contains)
ok(new Set(containsList).size === containsList.length, 'no duplicate stable substring in the ledger (each entry covers one taught claim)', containsList.length)
// A ledger entry must not silently claim coverage of a family the gate does not watch — already checked per entry.

// ── SECTION 2 — the REAL assembled prompt (real entry → real kernel → prompt.assemble) ────────────────────────────
const entry = await import(pathToFileURL(ENTRY).href)
const root = mkdtempSync(join(tmpdir(), 'vmu-f5-parity-'))
const state = { specs: [], effects: [] }
const ctx = {
  effect(fn, label) { state.effects.push(label); return fn() },
  on() { return () => {} },
  tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
}
let corpora = []
let kernel = null
try {
  const handle = entry.apply(ctx, { clock: () => 1000, root, packs: ['v5r'] })
  await handle.ready()
  kernel = handle.kernel
  ok(state.specs.length > 0, 'the pack really declares tools on the real entry (so the assembly is the product shape)', state.specs.length)
  const declared = kernel.packTools()
  ok(Array.isArray(declared) && declared.length > 0, 'kernel.packTools() is non-empty on the real kernel', Array.isArray(declared) ? declared.length : declared)
  const settings = kernel.settingsSnapshot()
  ok(settings && typeof settings === 'object', 'the kernel exposes its settings snapshot')
  const cases = [
    { member: 'r-1', role: 'chair', roleLabel: '院士', phase: 'normal' },
    { member: 'r-2', role: 'member', roleLabel: '常驻研究员', phase: 'normal' },
    { member: 'r-3', role: 'member', roleLabel: '常驻研究员', phase: 'founding' },
  ]
  ok(cases.length > 0, 'the assembly matrix is non-empty (an empty matrix would make the loop below vacuous)', cases.length)
  for (const c of cases) {
    const asm = await kernel.prompt.assemble(Object.assign({ settings }, c))
    ok(asm && typeof asm.text === 'string' && asm.text.length > 2000,
      `assembled prompt for ${c.role}/${c.phase} is non-trivial (${asm && asm.text ? asm.text.length : 0} chars)`)
    corpora.push({ source: 'assembled:' + c.role + '/' + c.phase, text: asm.text })
  }
} finally {
  try { await (kernel && kernel.dispose ? kernel.dispose() : Promise.resolve()) } catch (e) { /* the assembler is the subject, not the teardown */ }
}
if (process.env.VMU_PARITY_EXTRA_TEXT) {
  const planted = readFileSync(process.env.VMU_PARITY_EXTRA_TEXT, 'utf8')
  ok(planted.trim().length > 0, 'the planted extra text (VMU_PARITY_EXTRA_TEXT) is non-empty')
  corpora = corpora.concat([{ source: 'planted:' + process.env.VMU_PARITY_EXTRA_TEXT, text: planted }])
}
ok(corpora.length > 0, 'there is at least one corpus to judge (real assembly, plus the optional planter)', corpora.length)

// ── SECTION 3 — the MECHANISM, re-measured through the real turn orchestrator ───────────────────────────────────
const loopDefault = createTurnOrchestrator({ settings: {} })
const loopRefuse = createTurnOrchestrator({ settings: { 'vmu.turn.unknownReplyFieldMode': 'refuse' } })

/** ① unknown-field mode: what does the kernel REALLY do with `{"note":…}` in the DEFAULT config? */
const unknownDefault = (() => {
  try {
    const r = loopDefault.parse('```json\n{"note":"measured"}\n```')
    return { threw: false, ignored: r && r.ignoredFields ? r.ignoredFields.slice() : [], fields: r && r.fields ? r.fields.slice() : [] }
  } catch (e) { return { threw: true, code: e && e.code, message: String(e && e.message) } }
})()
const unknownRefuse = (() => {
  try {
    loopRefuse.parse('```json\n{"note":"measured"}\n```')
    return { threw: false }
  } catch (e) { return { threw: true, code: e && e.code } }
})()
ok(unknownDefault.threw === false && unknownDefault.ignored.includes('note'),
  'MECHANISM: default ignore-named ACCEPTS an unregistered field and NAMES it (not refused)', unknownDefault)
ok(unknownRefuse.threw === true && unknownRefuse.code === 'VMU_TURN_UNKNOWN_FIELD',
  'MECHANISM: only refuse mode throws VMU_TURN_UNKNOWN_FIELD', unknownRefuse)

/** ② the real reply catalogue: how many top-level fields does the kernel accept, and which of the four taught ones exist? */
const FIELD_OWNER_NAMES = Object.keys(FIELD_OWNERS)
ok(FIELD_OWNER_NAMES.length > 0, 'MECHANISM: FIELD_OWNERS is a non-empty name table (not a hand-written field list)', FIELD_OWNER_NAMES.length)
ok(REPLY_FIELDS.length === FIELD_OWNER_NAMES.length + RECORDED_FIELDS.length,
  'MECHANISM: REPLY_FIELDS is FIELD_OWNERS ∪ RECORDED_FIELDS (no hand-written list)',
  { reply: REPLY_FIELDS.length, owners: FIELD_OWNER_NAMES.length, recorded: RECORDED_FIELDS.length })
ok(REPLY_FIELDS.length > 4, 'MECHANISM: the accepted reply catalogue is LARGER than the four fields the prompt teaches', REPLY_FIELDS.length)
const taughtFour = ['progress', 'say', 'solved', 'vote_solved']
ok(taughtFour.length > 0 && taughtFour.every((f) => REPLY_FIELDS.includes(f)),
  'MECHANISM: the four taught fields are all really accepted (the taught subset is legal, just not exhaustive)', taughtFour)
const missingFromTaught = REPLY_FIELDS.filter((f) => !taughtFour.includes(f))
ok(missingFromTaught.length === REPLY_FIELDS.length - taughtFour.length && missingFromTaught.length > 0,
  'MECHANISM: fields taught as ILLEGAL beyond the four are really accepted by the kernel', missingFromTaught.length)

/** ③ meeting hand / invitation as a JSON reply field: what does the plan do with it? */
const meetingPlan = loopDefault.plan({ meeting_hand: true, meeting_invite: { member: 't-1', why: 'measured' } })
ok(Array.isArray(meetingPlan) && meetingPlan.length === 2, 'MECHANISM: the plan lists both meeting reply fields', meetingPlan.length)
for (const step of meetingPlan) {
  const na = step.notApplicable
  ok(!!na && na.code === 'VMU_TURN_FIELD_NOT_APPLICABLE',
    `MECHANISM: reply field ${step.field} is NOT dispatchable — named ${na ? na.code : '(no notApplicable)'}`, step.field)
  ok(!!na && /vibe_vmu_meeting/.test(String(na.hint)),
    `MECHANISM: the refusal names the tool shape that DOES work (${step.field})`)
}
/** ④ fixture vocabulary is a property of the text, and the authority it cites is the PROMPT FILE, not the kernel. */
const promptFiles = readdirSync(PROMPT_DIR).filter((f) => f.endsWith('.js'))
ok(promptFiles.length > 0, 'the prompt directory is non-empty (the taught text has a measurable author)', promptFiles.length)

/** Where in the pack sources does a taught substring live? (evidence for the failure detail, and for the report) */
const sourceIndex = promptFiles.map((f) => ({ file: 'vibe-math-vmu/packs/v5r/prompts/' + f, text: readFileSync(join(PROMPT_DIR, f), 'utf8') }))
const locate = (needle) => {
  for (const src of sourceIndex) {
    const at = src.text.indexOf(needle)
    if (at !== -1) return src.file + ':' + (src.text.slice(0, at).split('\n').length)
  }
  return '(not found in packs/v5r/prompts)'
}

// ── SECTION 4 — judge the real text: every hit must be consistent or named in the ledger ────────────────────────
const scan = (input) => {
  const hits = []
  for (const corpus of input) {
    const lines = corpus.text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const text = lines[i].trim()
      if (text === '') continue
      for (const fam of FAMILIES) {
        if (fam.regex.test(text)) hits.push({ family: fam.id, source: corpus.source, line: i + 1, text })
      }
    }
  }
  return hits
}
const judge = (hits, { shrinkOnly = true } = {}) => {
  const violations = []
  for (const h of hits) {
    const covered = entries.some((e) => e.family === h.family && h.text.includes(e.contains))
    if (!covered) violations.push({ kind: 'UN-WHITELISTED', ...h, at: locate(h.text.slice(0, 40)) })
  }
  if (shrinkOnly) for (const e of entries) {
    const matched = hits.some((h) => h.family === e.family && h.text.includes(e.contains))
    if (!matched) violations.push({ kind: 'ENTRY-NOT-MATCHED', family: e.family, contains: e.contains, reason: 'the taught text it excuses is gone — delete the ledger entry (shrink-only)' })
  }
  return violations
}
const realHits = scan(corpora)
ok(corpora.length > 0 && corpora.every((c) => c.text.length > 0), 'every corpus carries text before the scan', corpora.map((c) => c.text.length))
console.log('  ···· families:', FAMILY_IDS.join(', '))
for (const fam of FAMILIES) {
  const n = realHits.filter((h) => h.family === fam.id).length
  console.log('  ···· taught claim `' + fam.id + '` -> ' + n + ' paragraph(s) in the real prompt')
}
const realViolations = judge(realHits)
ok(realViolations.length === 0, 'no UN-NAMED teach-vs-mechanism divergence in the real assembled prompt', realViolations)
for (const h of realHits) console.log('  ···· [' + h.family + '] ' + h.source + ':' + h.line + '  ' + h.text.slice(0, 90) + '…  ⇒ ' + locate(h.text.slice(0, 20)))

// ── SECTION 5 — the gate has TEETH (self-probe, no file edits anywhere in the tree) ────────────────────────────
const plantUnnamed = [{ source: 'self-probe:unnamed', text: '（自证）未登记顶层字段会被判 `VMU_TURN_UNKNOWN_FIELD`，请勿书写。' }]
const plantedViolations = judge(scan(plantUnnamed), { shrinkOnly: false })
ok(plantedViolations.length >= 1 && plantedViolations[0].kind === 'UN-WHITELISTED',
  'TEETH: a planted un-whitelisted teaching trips the detector', plantedViolations)
const plantNamed = entries.filter((e) => e.family === 'fixture-vocabulary').map((e) => ({ source: 'self-probe:named', text: '（自证）' + e.contains + '。' }))
ok(plantNamed.length > 0, 'TEETH: the self-probe has a whitelisted sample to plant', plantNamed.length)
const plantedNamedViolations = judge(scan(plantNamed), { shrinkOnly: false })
ok(plantedNamedViolations.length === 0, 'TEETH: a planted whitelisted teaching does NOT trip the detector', plantedNamedViolations)

// ── SECTION 6 — report ─────────────────────────────────────────────────────────────────────────────────────────
console.log('')
console.log('prompt-mechanism parity: evaluated ' + corpora.length + ' corpus/corpora, ' + realHits.length + ' taught paragraph(s) matching the watched families')
console.log('mechanism readings: REPLY_FIELDS=' + REPLY_FIELDS.length + ' (owners ' + FIELD_OWNER_NAMES.length + ' + recorded ' + RECORDED_FIELDS.length + '); '
  + 'unknown-field default=' + (unknownDefault.threw ? 'refused' : 'accepted+named') + '; refuse mode=' + (unknownRefuse.threw ? unknownRefuse.code : 'not refused') + '; '
  + 'meeting fields plan=' + meetingPlan.map((s) => s.field + ':' + (s.notApplicable ? s.notApplicable.code : 'dispatchable')).join(','))
console.log('ledger: ' + entries.length + ' named divergence(s), all matched; ' + realViolations.length + ' violation(s)')
if (failures.length > 0) { console.log(''); for (const f of failures) console.log('  ✗ ' + f) }
console.log('')
console.log(failed === 0 ? 'PASS ' + passed + '/' + (passed + failed) : 'FAIL ' + passed + '/' + (passed + failed))
try { rmSync(root, { recursive: true, force: true }) } catch (e) { /* the temp root is not the subject */ }
process.exit(failed === 0 ? 0 : 1)
