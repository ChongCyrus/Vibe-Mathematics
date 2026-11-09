// tests/vmu-run257-refusal-hints.test.mjs — RUN 257 / task-94 round D, D-1 + RUN 258 / AUDIT-14 (P1-7, P1-8, O-4).
//
// The audit question (Lead m05385): for each of the twelve STABLE refusal codes the institute teaches a member to
// expect, does the REAL kernel receipt carry a `REACHABLE INSTEAD:` sentence — and does the act that sentence names
// actually EXIST and actually WORK? This file answers three things, in this order:
//   §1 the code is produced by driving the real kernel, and its receipt names an act after the marker;
//   §3 every tool / action / op / need that act names exists in the published surface or its declared table
//      (RUN 258: `need:"latex"` passed the old prose pins while `vibe_vmu_env` answers VMU_ENV_UNKNOWN_NEED);
//   §4 FOLLOWING the hint literally moves the outcome — the same refusal again, or a malformed call of the act the
//      hint itself proposes, is a failure; where NO action exists, the hint must say so instead of naming one.
//
// D-1 was a RED DELIVERABLE (10 of 12 codes lacked the sentence); D-2 landed on 2026-11-09 and §2 is now a NAMED EMPTY
// list. The product is not changed here (the hint texts live in four other write domains: kernel/turn [state-lane],
// meetings+mailbox [notice-lane], packs/v5r [md-lane]); what this suite produces is the measured red list that goes
// verbatim into docs/acceptance/sim-audit-prompts.md §14. Every driver below produces its refusal by DRIVING THE REAL
// KERNEL — no literal is copied from a source file into an assertion.
//
// `VMU_TURN_ABANDONED`-side is deliberately absent: the abandon slot is a STRUCTURAL exemption until TB-2639 /
// task-120 settles the delivery seam (see the §E block: it asserts the escape exists, not that its sentence matches).
//
// RULE E: every loop is preceded by an explicit non-empty guard.
//
// Run: node tests/vmu-run257-refusal-hints.test.mjs   (last line: === VMU RUN 257 REFUSAL HINTS: N passed, M failed ===)
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { toolSpecs } from '../vibe-math-vmu/host.js'
import { ENV_NEEDS_DEFAULTS } from '../vibe-math-vmu/settings/env-needs.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, msg, extra) => {
  if (cond) { passed += 1; console.log('  ok ' + msg) } else { failed += 1; console.log('  FAIL ' + msg + (extra === undefined ? '' : '\n    ' + JSON.stringify(extra))) }
}
const roots = []
const CLOCK = 1000 // instrument value: an injected clock may read 1000. RUN 259 P1-2 briefly forced a real date here; TB-2655 added the kernelClock seam and this suite runs green on 1000 again (verified RUN 258).
const mkRoot = () => { const d = mkdtempSync(join(tmpdir(), 'vmu-r257-rh-')); roots.push(d); return d }

const entry = await import(pathToFileURL(ENTRY).href)
const bootFaces = async ({ vmu = {}, deliverMode = undefined } = {}) => {
  const root = mkRoot()
  const specs = []
  const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async (s) => { specs.push(s); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => CLOCK, packs: ['v5r'], root }, deliverMode ? { deliverMode } : {}, vmu ? { vmu } : {}))
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args = {}) => {
    const spec = specs.filter((s) => s && s.name === name)[0] || null
    if (!spec) throw Object.assign(new Error('no such face ' + name), { code: 'NO_SUCH_FACE' })
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { root, handle, K: handle.kernel, call, specs }
}
const attempt = async (fn) => {
  try { return { threw: false, value: await fn() } } catch (e) {
    return { threw: true, code: (e && e.code) || null, hint: e && e.hint === undefined ? null : String(e.hint || ''), message: String((e && e.message) || '') }
  }
}
const refusalOf = (r) => {
  if (!r) return null
  if (r.threw) return r
  const v = r.value
  if (v && v.ok === false && v.code) return { threw: false, code: v.code, hint: String(v.hint || ''), message: String(v.message || '') }
  return null
}
const NL = String.fromCharCode(10)
const fence = (o) => ['```json', JSON.stringify(o), '```'].join(NL)

// The twelve stable codes (Lead m05385: my thirteen-row table minus VMU_QUOTA_EXCEEDED, whose hint is assembled in two
// places and gets its own probe).
const EXPECTED_CODES = [
  'VMU_TURN_REENTRANT', 'VMU_MEETING_NOT_STARTED', 'VMU_MEMBER_SESSION_NEVER_OPENED',
  'VMU_TURN_ALREADY_PARKED', 'VMU_TURN_PARKED_NEEDS_OWNER',
  'VMU_PACK_V5R_BLUEPRINT_MD_MISSING', 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT',
  'VMU_OFFICE_CONSULT_REQUIRED', 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING',
  'VMU_TURN_UNKNOWN_FIELD', 'VMU_MAILBOX_ACK_UNKNOWN', 'VMU_TURN_DELIVERY_SHAPE',
]
const CODES = [
  'VMU_TURN_REENTRANT', 'VMU_MEETING_NOT_STARTED', 'VMU_MEMBER_SESSION_NEVER_OPENED',
  'VMU_TURN_ALREADY_PARKED', 'VMU_TURN_PARKED_NEEDS_OWNER',
  'VMU_PACK_V5R_BLUEPRINT_MD_MISSING', 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT',
  'VMU_OFFICE_CONSULT_REQUIRED', 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING',
  'VMU_TURN_UNKNOWN_FIELD', 'VMU_MAILBOX_ACK_UNKNOWN', 'VMU_TURN_DELIVERY_SHAPE',
]

// ── drivers: each returns the refusal the REAL kernel produced for that code ─────────────────────────────────────────
const A = await bootFaces({ vmu: { paper: { officeConsult: 'required' } } })
await A.call('vibe_v5_start', { problem: 'placeholder', researcherCount: 2 })
const WS = join(A.root, 'VibeMath')
const writeWs = (rel, text) => { const abs = join(WS, rel); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text); return abs }

const driveMailboxAckUnknown = async () => refusalOf(await attempt(() => A.call('vibe_vmu_mailbox', { action: 'ack', member: 'r-acad', ids: ['ml-nope'] })))
const driveBlueprintMissing = async () => refusalOf(await attempt(() => A.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/P.md', member: 'r-1', mdPath: 'Shared/Drafts/P-r1.md' })))
// The drift gate is only reached by a CO-SIGNED draft: chair proposes with mdPath, member continues the same draft, then
// the file on disk is changed and the chair adopts naming that draft id (an adopt without `draft` is VMU_INVALID_ARGUMENT).
const driveBlueprintDrift = async () => {
  writeWs('Shared/Drafts/D-r1.md', '# draft' + NL + '- claim one' + NL)
  const one = await attempt(() => A.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/PD.md', member: 'r-acad', mdPath: 'Shared/Drafts/D-r1.md' }))
  if (!one.value || one.value.ok !== true) return refusalOf(one)
  const two = await attempt(() => A.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/PD.md', member: 'r-1', mdPath: 'Shared/Drafts/D-r1.md' }))
  if (!two.value || two.value.ok !== true) return refusalOf(two)
  writeWs('Shared/Drafts/D-r1.md', '# draft CHANGED after indexing' + NL)
  const draftId = two.value.draft || two.value.id || one.value.draft || one.value.id
  return refusalOf(await attempt(() => A.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/PD.md', member: 'r-acad', draft: draftId })))
}
// A SCHEDULED meeting does not start by itself; speaking into it is refused by name (speak through the kernel face:
// the tool face spells this act `said`, which the kernel refuses as VMU_INVALID_ARGUMENT for a different reason).
const driveMeetingNotStarted = async () => {
  await A.call('vibe_v5_meeting', { action: 'convene', id: 'm9', member: 'r-acad', agenda: 'run257 probe', members: ['r-acad', 'r-1'], at: CLOCK + 3600 * 1000 })
  return refusalOf(await attempt(() => A.K.meetings.speak({ meeting: 'm9', member: 'r-acad', text: 'early words' })))
}
// tool_help answers `ok:true` even when there is no session: the refusal is NESTED under `.refusal` (a reading, not a
// failed call) - the driver must read that slot, not the envelope.
const driveMemberSessionNeverOpened = async () => {
  const r = await attempt(() => A.call('vibe_v5_tool_help', { member: 'r-2' }))
  const v = r && r.value
  const nested = v && v.refusal
  if (!nested) return refusalOf(r)
  return { threw: false, code: nested.code, hint: String(nested.hint || ''), message: String(nested.message || '') }
}
// The office-consult gate sits at the END of the paper pipeline: a paper must be carried start -> parts -> advance ->
// two reviews -> advance before `final` reaches the gate (before that it is refused as PAPER_STATE "needs its parts").
const driveOfficeConsultRequired = async () => {
  const P = 'podoc'
  const steps = [
    { action: 'start', title: P, participants: ['r-1', 'r-2'] },
    { action: 'part', target: P, member: 'r-1', part: 'theorem', body: 'body thm', evidence: ['rec-1'] },
    { action: 'part', target: P, member: 'r-2', part: 'proof', body: 'body prf', evidence: ['rec-1'] },
    { action: 'advance', target: P, member: 'r-acad' },
    { action: 'review', target: P, member: 'r-1', of: 'r-2', deliverable: true, notes: 'ok' },
    { action: 'review', target: P, member: 'r-2', of: 'r-1', deliverable: true, notes: 'ok' },
    { action: 'advance', target: P, member: 'r-acad' },
  ]
  for (const args of steps) { const s = await attempt(() => A.call('vibe_v5_paper', args)); if (s.threw || !s.value || s.value.ok !== true) return refusalOf(s) }
  return refusalOf(await attempt(() => A.call('vibe_v5_paper', { action: 'final', target: P, member: 'r-acad', decision: 'deliverable' })))
}
const drivePaperExecutorMissing = async () => {
  const st = await attempt(() => A.call('vibe_v5_paper', { action: 'start', target: 'paper-p2', title: 'T2', participants: ['r-1'] }))
  if (st.threw || !st.value || st.value.ok !== true) return refusalOf(st)
  return refusalOf(await attempt(() => A.call('vibe_v5_paper', { action: 'compile', target: 'paper-p2', member: 'r-1' })))
}

// caller-delivered turns: parked codes + unknown field (they only exist where a turn can be staged)
const B = await bootFaces({ deliverMode: 'caller', vmu: { turn: { unknownReplyFieldMode: 'refuse' } } })
await B.K.members.hire({ id: 'r-1', slot: 'member', institution: 'sim' })
await B.K.members.hire({ id: 'r-2', slot: 'member', institution: 'sim' })
await B.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run257 refusal probe' })
const driveAlreadyParked = async () => refusalOf(await attempt(() => B.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'second step' })))
// A reply staged with NO owner is refused at the next step (the "reply with nothing to answer" door a transcript-level
// caller actually hits), not by handing the reply an owner.
const driveParkedNeedsOwner = async () => {
  const C = await bootFaces({ deliverMode: 'caller' })
  await C.K.members.hire({ id: 'r-1', slot: 'member', institution: 'sim' })
  const staged = await attempt(() => C.K.turn.supplyMemberReply(fence({ say: 'no prompt to answer' }), null))
  if (staged.threw || !staged.value || staged.value.ok !== true) return refusalOf(staged)
  return refusalOf(await attempt(() => C.K.turn.step({ members: ['r-1'], phase: 'normal' })))
}
// The unknown-field door is the TEXT channel answering a parked prompt (`op:"reply"`), not the bare supply path (which
// ignores unknown fields silently).
const driveUnknownField = async () => refusalOf(await attempt(() => B.call('vibe_vmu_turn', { op: 'reply', member: 'r-1', report: { say: 'x', bogusField: 1 } })))

// re-entrancy: the lock is held by a delivery that never returns (run241 pattern, real orchestrator)
const driveReentrant = async () => {
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: [] }), deliver: () => new Promise(() => {}) })
  void t.run({ member: 'r-1', phase: 'normal' })
  await new Promise((r) => setTimeout(r, 60))
  const nested = await attempt(() => t.run({ member: 'r-2', phase: 'normal' }))
  return refusalOf(nested)
}

// delivery shape: the seam returns an array the boundary cannot read (kernel-level, real boundary)
const driveDeliveryShape = async () => {
  const kernel = createKernel({
    clock: () => CLOCK, settings: {}, deliverTurn: async () => [1, 2, 3],
    slots: [{ id: 'member', capacity: 2, permissions: ['speak', 'vote'] }, { id: 'chair', capacity: 1, permissions: ['convene'] }],
  })
  const specs = toolSpecs({ kernel, settings: {}, turnTool: true, meetingTool: true, controlTool: true })
  const spec = specs.filter((s) => s && s.name === 'vibe_vmu_turn')[0]
  const run = async () => { try { const raw = await spec.execute({ op: 'step', member: 'r-1', phase: 'normal' }, { kernel }); const v = raw && typeof raw === 'object' ? raw : JSON.parse(String(raw)); return { threw: false, value: v } } catch (e) { return { threw: true, code: e && e.code, hint: e && e.hint === undefined ? null : String(e.hint || ''), message: String((e && e.message) || '') } } }
  const first = await run()
  const second = first.threw ? null : await run()
  return refusalOf(second) || refusalOf(first)
}
const drivers = {
  shapeResult: null,
  'VMU_MAILBOX_ACK_UNKNOWN': driveMailboxAckUnknown,
  'VMU_PACK_V5R_BLUEPRINT_MD_MISSING': driveBlueprintMissing,
  'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT': driveBlueprintDrift,
  'VMU_MEETING_NOT_STARTED': driveMeetingNotStarted,
  'VMU_MEMBER_SESSION_NEVER_OPENED': driveMemberSessionNeverOpened,
  'VMU_OFFICE_CONSULT_REQUIRED': driveOfficeConsultRequired,
  'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING': drivePaperExecutorMissing,
  'VMU_TURN_ALREADY_PARKED': driveAlreadyParked,
  'VMU_TURN_PARKED_NEEDS_OWNER': driveParkedNeedsOwner,
  'VMU_TURN_UNKNOWN_FIELD': driveUnknownField,
  'VMU_TURN_REENTRANT': driveReentrant,
  'VMU_TURN_DELIVERY_SHAPE': driveDeliveryShape,
}

// ── §1 each code is PRODUCED by a real drive, and each hint must carry the reachable-alternative sentence ────────────
// The marker alone is not the contract: a hint that appends `REACHABLE INSTEAD:` and then nothing concrete would pass a
// naive `includes` while telling the member nothing. So the tail must run ≥12 non-whitespace chars AND name an action
// (a call with `(` or a real tool name). This is the assertion that stops a "paste the label and go home" D-2 fix.
const MARKER = 'REACHABLE INSTEAD:'
const markerTailIsConcrete = (hint) => {
  const text = String(hint || '')
  const at = text.indexOf(MARKER)
  if (at < 0) return false
  const tail = text.slice(at + MARKER.length)
  const dense = tail.replace(/\s+/g, '')
  // non-vacuous: the tail is measured on the real receipt, not on a fixture
  return dense.length >= 12 && (tail.includes('(') || /\bvibe_[a-z0-9_]+\b/.test(tail))
}
console.log('§1 twelve stable codes, each driven to its refusal through the real kernel')
const results = {}
ok(Array.isArray(CODES) && CODES.length === 12, '(non-vacuous) the list names twelve codes')
assert.deepEqual([...new Set(CODES)].sort(), [...new Set(EXPECTED_CODES)].sort())
ok(CODES.length === 12 && [...new Set(CODES)].sort().join('|') === [...new Set(EXPECTED_CODES)].sort().join('|'),
  '§1 ★★★ the twelve codes are pinned as a SET: deleting one and adding another is not a way to keep this green')
for (const code of CODES) {
  const r = await drivers[code]()
  results[code] = r
  const produced = r !== null && r.code === code
  ok(produced, '§1 ' + code + ': the drive produced THAT code (not a different refusal)', r && { threw: r.threw, code: r.code, message: r.message && r.message.slice(0, 120) })
  ok(r !== null && typeof r.hint === 'string' && r.hint.includes(MARKER),
    '§1 ★★★ ' + code + ': the receipt hint names the act that WOULD have worked (`REACHABLE INSTEAD:`)',
    r && { code: r.code, hint: (r.hint || '').slice(0, 200) })
  ok(r !== null && markerTailIsConcrete(r.hint),
    '§1 ★★★ ' + code + ': after the marker comes a CONCRETE act (>=12 non-blank chars and a call or a tool name) — a bare label does not count',
    r && { code: r.code, tail: String((r.hint || '')).slice(Math.max(0, String((r.hint || '')).indexOf(MARKER))) })
}

// ── §2 the frozen red list: it was TEN codes on 2026-11-09 (D-1), it is EMPTY now that D-2 landed ──────────────────
// This pin is deliberately a NAMED EMPTY list, not `score === 0`: the value of the D-1 snapshot is that a silent
// regression of any one hint re-populates `missing` and turns this red again — fix the hint, never re-widen this list.
// The `CODES.length === 12` half defeats the classic way to empty a red list: deleting codes from it instead of fixing
// them.
console.log('§2 the frozen red list: D-2 landed 2026-11-09 — it is empty now, and a regression must refill it')
const missing = CODES.filter((c) => !(results[c] && String(results[c].hint || '').includes(MARKER)))
assert.deepEqual(missing, [])
ok(missing.length === 0 && CODES.length === 12,
  '§2 ★★★ all twelve codes now name the act that would have worked, and the list still names twelve (a regression refills `missing`; deleting a code to pass is caught here)',
  { missing, codes: CODES.length })
ok(missing.length + CODES.filter((c) => results[c] && String(results[c].hint || '').includes(MARKER)).length === CODES.length,
  '(non-vacuous) every code is classified exactly once')
for (const c of missing) console.log('  RED:', c, '| hint:', String((results[c] && results[c].hint) || '').slice(0, 160).replace(/\n/g, ' '))

// ── §3 a hint must name things that EXIST: tools in the published surface, enums in their declared tables ────────────
// RUN 258 / AUDIT-14 P1-7: `need:"latex"` passed every prior pin — the marker was present, the tail was concrete, and
// the sentence was still FALSE (`vibe_vmu_env {need:"latex"}` answers VMU_ENV_UNKNOWN_NEED). A prose reading cannot
// catch that, so the act is PARSED out of the receipt and checked against the registry the model actually sees.
const ENV_NEEDS = Object.keys(ENV_NEEDS_DEFAULTS)
const registry = new Map((Array.isArray(A.specs) ? A.specs : []).map((s) => [s.name, s]))
const paramEnum = (spec, key) => {
  const p = spec && spec.parameters && spec.parameters.properties && spec.parameters.properties[key]
  return p && Array.isArray(p.enum) ? p.enum : null
}
const nearestToolBefore = (tools, at) => {
  let chosen = null
  for (const t of tools) if (t.at < at) chosen = t.name
  return chosen
}
const cited = (hint) => {
  const text = String(hint || '')
  const tools = []
  const reTool = /\bvibe_[a-z0-9_]+\b/g
  let m
  while ((m = reTool.exec(text)) !== null) tools.push({ name: m[0], at: m.index })
  const keys = []
  const reKey = /\b(action|op|need)\s*:\s*"([a-z0-9_-]+)"/g
  while ((m = reKey.exec(text)) !== null) keys.push({ key: m[1], value: m[2], tool: nearestToolBefore(tools, m.index) })
  return { tools: tools.map((t) => t.name), keys }
}
console.log('§3 every tool / action / op / need a hint names must exist in the published surface')
const citationProblems = []
{
  ok(registry.size > 10, '(non-vacuous) the published surface names more than ten tools', { size: registry.size })
  ok(ENV_NEEDS.length > 10, '(non-vacuous) ENV_NEEDS_DEFAULTS names more than ten needs', { needs: ENV_NEEDS.length })
  for (const code of CODES) {
    const c = cited(results[code] && results[code].hint)
    for (const name of c.tools) if (!registry.has(name)) citationProblems.push(code + ': tool ' + name + ' is NOT in the published surface')
    for (const k of c.keys) {
      if (k.key === 'need') {
        if (!ENV_NEEDS.includes(k.value)) citationProblems.push(code + ': need "' + k.value + '" is NOT in ENV_NEEDS_DEFAULTS')
      } else if (k.tool && registry.has(k.tool)) {
        const allowed = paramEnum(registry.get(k.tool), k.key)
        if (allowed !== null && !allowed.includes(k.value)) citationProblems.push(code + ': ' + k.tool + ' ' + k.key + ' "' + k.value + '" is NOT in its declared enum (' + allowed.join('|') + ')')
      }
    }
  }
  ok(citationProblems.length === 0,
    '§3 ★★★ every cited act exists: no hint names a tool outside the surface, a need outside ENV_NEEDS_DEFAULTS, or an enum value outside its declaration (a false `need:"latex"` is caught HERE, not by prose)',
    citationProblems)
  for (const p of citationProblems) console.log('  RED:', p)
}

// ── §3b the PROMPT side of the same rule: a prompt that teaches a probe must name a declared need ───────────────────
// RUN 258 / AUDIT-14 P1-7: the prompt literally said `need:"latex"` (v5r-blocks-b.js paper line, v5r-core.js paper
// lines) while the env face only knows ENV_NEEDS_DEFAULTS. A hint and a prompt are two readers of one act; both are
// checked against the SAME declaration, not against each other.
const PROMPT_SOURCES = ['v5r-core.js', 'v5r-blocks-b.js'].map((f) => join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', f))
const promptNeedProblems = []
let promptNeedCount = 0
for (const file of PROMPT_SOURCES) {
  const src = readFileSync(file, 'utf8')
  const re = /need\s*:\s*["']([a-z0-9_-]+)["']/g
  let m2
  while ((m2 = re.exec(src)) !== null) { promptNeedCount += 1; if (!ENV_NEEDS.includes(m2[1])) promptNeedProblems.push(file.split(/[\\/]/).pop() + ': need "' + m2[1] + '" is NOT in ENV_NEEDS_DEFAULTS') }
}
ok(promptNeedCount > 0, '(non-vacuous) the prompt really teaches at least one probe need (' + promptNeedCount + ' citations found)')
ok(promptNeedProblems.length === 0, '§3b ★★★ every `need:"…"` taught by the prompt exists in ENV_NEEDS_DEFAULTS (a prompt must not teach a probe the env face refuses as unknown)', promptNeedProblems)
for (const p of promptNeedProblems) console.log('  RED:', p)

// ── §3c the RECEIPT-DATA side: a reachableInstead entry is a promise too, and it is built in tools.js, not in a hint ──
// RUN 258 / AUDIT-14 P1-7 (lead-approved 4th site): `final`'s reachableInstead carried the same false `need:"latex"`
// as the executor hint. It is not a hint string, so §3 (which parses hints) can never catch it; scanning the pack
// source for every string-literal `need:"…"` and validating it against the SAME registry is the only reader-proof way.
const PACK_SOURCES = [
  join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'),
  join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'blueprint.js'),
]
const packNeedProblems = []
let packNeedCount = 0
for (const file of PACK_SOURCES) {
  const src = readFileSync(file, 'utf8')
  const re = /need\s*:\s*["']([a-z0-9_-]+)["']/g
  let m3
  while ((m3 = re.exec(src)) !== null) {
    packNeedCount += 1
    if (!ENV_NEEDS.includes(m3[1])) packNeedProblems.push(file.split(/[\\/]/).pop() + ': need "' + m3[1] + '" is NOT in ENV_NEEDS_DEFAULTS')
  }
  // a value spliced from the registry (ENGINE_NEED) never appears as a literal, so it needs its own guard:
  // the constant must be derived from ENV_NEEDS_DEFAULTS, not hand-typed.
  if (file.endsWith('tools.js')) {
    ok(/const ENGINE_NEEDS = Object\.keys\(ENV_NEEDS_DEFAULTS\)/.test(src),
      '§3c ★★★ the receipt-data need is DERIVED from ENV_NEEDS_DEFAULTS (adding an engine to the registry updates it)',
      'tools.js does not derive ENGINE_NEEDS from Object.keys(ENV_NEEDS_DEFAULTS)')
    // non-vacuous guard: the derived constant must actually be USED at every site that names a need (the executor
    // hint and final reachableInstead), otherwise "no bad literal" is satisfied by having no need spelled at all.
    const derivedUses = (src.match(/' \+ ENGINE_NEED \+ '/g) || []).length
    ok(derivedUses >= 2,
      '(non-vacuous) both the executor hint and final reachableInstead splice ENGINE_NEED into their need (found ' + derivedUses + ', expected >= 2)',
      'a site still hand-types its need instead of using ENGINE_NEED')
  }
}
ok(packNeedCount === 0 || packNeedProblems.length === 0, '(non-vacuous) every literal probe need in the pack was checked (' + packNeedCount + ' literal(s), all valid unless listed above)')
ok(packNeedProblems.length === 0, '§3c ★★★ every string-literal `need:"…"` in the pack source exists in ENV_NEEDS_DEFAULTS (reachableInstead is a promise the member will follow)', packNeedProblems)
for (const p of packNeedProblems) console.log('  RED:', p)

// ── §4 following the hint must actually work: the SECOND call must not return the SAME refusal ───────────────────────
// The marker says "this is the act that WOULD have worked". These drivers FOLLOW THE HINT LITERALLY (including its
// `need:`/`slot:`/`beat` spellings, not a charitable reading) and then assert the outcome moved: either the act passed,
// or the next refusal is a DIFFERENT code and is not a malformed-call refusal of the very act the hint proposed.
const MALFORMED = ['VMU_INVALID_ARGUMENT', 'VMU_ENV_UNKNOWN_NEED', 'VMU_STATE']
const follows = {
  'VMU_PACK_V5R_BLUEPRINT_MD_MISSING': async () => {
    writeWs('Shared/Drafts/L-r1.md', '# follow the hint' + NL + '- claim' + NL)
    return refusalOf(await attempt(() => A.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/L.md', member: 'r-1', mdPath: 'Shared/Drafts/L-r1.md' })))
  },
  'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT': async () => {
    const reindex = await attempt(() => A.call('vibe_vmu_records', { action: 'reindex' }))
    if (reindex.threw || !reindex.value || reindex.value.ok !== true) return refusalOf(reindex)
    return refusalOf(await attempt(() => A.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/PD.md', member: 'r-acad', draft: 'rec-1' })))
  },
  'VMU_TURN_UNKNOWN_FIELD': async () => refusalOf(await attempt(() => B.call('vibe_vmu_turn', { op: 'reply', member: 'r-1', report: { say: 'x' } }))),
  'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING': async () => {
    // hint ② as WRITTEN: probe the `need:` the RECEIPT itself names (never a hard-coded string), so a hint that drifts
    // back to an undeclared need is followed literally and caught as VMU_ENV_UNKNOWN_NEED.
    const citedNeed = (/need\s*:\s*"([a-z0-9_-]+)"/.exec(String((results['VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING'] || {}).hint || '')) || [])[1]
    ok(typeof citedNeed === 'string' && ENV_NEEDS.includes(citedNeed), '(non-vacuous) §4 EXECUTOR: the hint names a declared need to probe', { citedNeed })
    return refusalOf(await attempt(() => A.call('vibe_vmu_env', { action: 'probe', need: citedNeed })))
  },
  'VMU_MEETING_NOT_STARTED': async () => {
    // TB-2661 (RUN 262): proceed() now starts a SCHEDULED meeting as soon as the attendance rule is met, so the hint
    // names a real exit (it also carries attendance.missing when someone is absent). Follow it literally: seat the
    // members it would name, then let the chair proceed — the second call must not come back as the same refusal.
    for (const who of ['r-acad', 'r-1']) await A.call('vibe_vmu_meeting', { action: 'attend', id: 'm9', member: who })
    return refusalOf(await attempt(() => A.call('vibe_vmu_meeting', { action: 'proceed', id: 'm9', member: 'r-acad' })))
  },
  'VMU_MEMBER_SESSION_NEVER_OPENED': async () => {
    // hint as WRITTEN, both steps: (1) read a REAL id from the roster face, (2) seat it with every required parameter.
    // The institution here is the string this harness hires with in §1 (`sim`); the hint deliberately calls the
    // institution a DEPLOYMENT fact (the kernel ships no default, so a hint cannot legitimately invent one).
    const roster = await attempt(() => A.call('vibe_vmu_control', { action: 'roster' }))
    if (roster.threw || !roster.value || roster.value.ok !== true) return refusalOf(roster)
    const ids = (Array.isArray(roster.value.roster) ? roster.value.roster : []).map((r) => r && r.id).filter(Boolean)
    ok(ids.length > 0, '(non-vacuous) §4 MEMBER_SESSION: the roster names a real id the hint can hire')
    const id = ids.indexOf('r-2') >= 0 ? 'r-2' : ids[0]
    return refusalOf(await attempt(() => A.call('vibe_vmu_control', { action: 'hire', slot: 'member', member_id: id, institution: 'sim' })))
  },
}
// Codes whose next call cannot be scripted from the hint ALONE are named here with the reason; a silent omission would
// be the same defect this suite exists to catch.
const followSkipped = {
  'VMU_TURN_REENTRANT': 'the hint names the orchestrator API t.abandon (a function), not a tool face; the structural exemption in §E covers it until TB-2639/task-120',
  'VMU_TURN_ALREADY_PARKED': 'the escape is op:"abandon" plus a turn id the hint does not name; a scripted follow would pin sand before task-120',
  'VMU_TURN_PARKED_NEEDS_OWNER': 'the second step clears the staged reply on the discard path regardless of the hint (O-6), so "changed code" would not prove the hint caused it',
  'VMU_MAILBOX_ACK_UNKNOWN': 'honestly unfixable: there is no real row id to acknowledge, and the hint says so',
  'VMU_OFFICE_CONSULT_REQUIRED': 'following it needs the office answer identity (consult.awaiting.id); the paper pipeline is already driven in §1',
  'VMU_TURN_DELIVERY_SHAPE': 'the fix is an external seam returning a readable shape; the kernel cannot be made to follow its own hint',
}
// Codes for which the honest hint is "there is no reachable action HERE". This is NOT the same list as followSkipped: a
// skipped follow is an external dependency or a structural exemption, while this one is a MECHANISM gap - the hint must
// SAY so (Lead m06513-C), and inventing an action to make the suite green would be the defect the suite exists to catch.
const notActable = {
  // TB-2661 (RUN 262) closed the only member this bucket ever held: a SCHEDULED meeting now HAS a reachable exit —
  // the chair may proceed() as soon as the attendance rule is met (absent members are named on attendance.missing),
  // so the code moved to `follows`. The empty bucket is deliberate: it stays measured, and a future code with no
  // honest action must still be named here rather than quietly omitted (the coverage equality below enforces it).
}
console.log('§4 following each actionable hint must CHANGE the outcome (not come back with the same code)')
{
  ok(Object.keys(follows).length + Object.keys(followSkipped).length + Object.keys(notActable).length === CODES.length,
    '(non-vacuous) every code is followed, named as not-followable, or named as having NO reachable action',
    { followed: Object.keys(follows).length, skipped: Object.keys(followSkipped).length, notActable: Object.keys(notActable).length, codes: CODES.length })
  for (const code of CODES) if (followSkipped[code] !== undefined) ok(typeof followSkipped[code] === 'string' && followSkipped[code].length > 20,
    '§4 ' + code + ': not scripted as a follow, with the reason stated', followSkipped[code])
  ok(/proceed/.test(String((results['VMU_MEETING_NOT_STARTED'] || {}).hint || '')),
    '§4 MEETING_NOT_STARTED: the hint names the chair proceed() exit (TB-2661 added it to the scheduled state)',
    String((results['VMU_MEETING_NOT_STARTED'] || {}).hint || '').slice(0, 200))

  ok(Object.keys(notActable).length === 0, '(named empty, not unmeasured) every code now has an honest action: TB-2661 gave the scheduled meeting its proceed() exit', Object.keys(notActable))
  for (const code of Object.keys(notActable)) ok(typeof notActable[code] === 'string' && notActable[code].length > 40,
    '§4 ' + code + ': the hint admits there is NO action here, and the reason names why (a mechanism gap, not a missed fix)', notActable[code])
  for (const code of Object.keys(follows)) {
    const orig = results[code] || null
    ok(orig !== null && orig.code === code, '(non-vacuous) §4 ' + code + ' has a §1 receipt to compare against')
  }
  const followResults = {}
  for (const code of Object.keys(follows)) {
    const second = await follows[code]()
    followResults[code] = second
    const sameCode = second !== null && second.code === code
    const malformed = second !== null && MALFORMED.includes(second.code)
    const passed = second === null
    ok(!sameCode, '§4 ★★★ ' + code + ': following the hint MOVES the outcome (the same refusal again means the hint sends the member in a circle)', { second })
    ok(!passed || true, '(no-op guard) ' + code + ': a successful second act is the ideal outcome')
    ok(passed || !malformed, '§4 ★★★ ' + code + ': the act the hint names is not itself refused as malformed/unknown — a hint must not teach a call that cannot run', { second })
  }
  const bad = Object.keys(followResults).filter((c) => followResults[c] !== null && (followResults[c].code === c || MALFORMED.includes(followResults[c].code)))
  ok(bad.length === 0, '§4 ★★★ the hints that name an act are actable: the list of codes whose follow-up failed is empty', { bad })
  for (const c of bad) console.log('  RED:', c, '| second:', JSON.stringify(followResults[c]).slice(0, 200))
}

// ── §E the abandon slot: a STRUCTURAL exemption, not a wording match ────────────────────────────────────────────────
// The escape sentence lives in the re-entrancy hint today, but TB-2639 / task-120 is still moving the delivery seam;
// pinning its exact wording now would pin sand. Remove this exemption when task-120 lands.
console.log('§E the abandon escape exists (structural exemption until TB-2639/task-120)')
{
  const err = results['VMU_TURN_REENTRANT']
  ok(err !== null && /abandon/.test(String((err && err.hint) || '')), '§E. ★★ STRUCTURAL EXEMPTION: the escape is named (`abandon`), its wording is not pinned yet', err && { hint: String(err.hint).slice(0, 120) })
  ok(typeof err !== 'undefined', '(non-vacuous) the re-entrancy probe ran before this exemption is judged')
}

console.log('')
console.log('=== VMU RUN 257 REFUSAL HINTS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
