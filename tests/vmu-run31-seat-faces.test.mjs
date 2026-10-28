// tests/vmu-run31-seat-faces.test.mjs — RUN 31 / task-15: the SEAT FACE IS DECLARED, AND THE PROMPT IS RENDERED FROM IT.
//
// THE DEFECT THIS PINS (measured on the live run 31 probe): the seat face was REVERSE-DERIVED from the prose of the role
// prompt sections — scan the role section's `· vibe_v5_…` bullet lines and declare `deny = declared − bullets`. The prompt
// therefore WAS the ACL, and every capability nobody had written a bullet for was silently forbidden:
//   · chair: could not tally a ruling (verdict_final), ask for rulings (verdict_ask), advance a meeting round
//     (meeting_round), adopt a blueprint (blueprint), promote into Verified/ (verified_promote) or close fidelity;
//   · member: denied `second` and `task_get`;
//   · temp: denied ALL FIVE Lean tools although rule 10.3 gives Lean to all three seats.
//     (Round 33's A8 revisited that last one ON PURPOSE: Lean output is written into the institute's libraries, so the
//      temp seat no longer holds Lean or any card-writing face — a DECLARED narrowing with a cited reason, not a word count.
//      The expectations in ③/④ below follow the declaration, which is why they read `false` there now.)
// In every case the institution's rule allowed it and the prompt's WORD COUNT refused it — rule 11.2 (越权/规则不靠提示词).
//
// WHAT THIS SUITE PROVES, in the order a reader needs it:
//   ① the declaration is self-consistent and complete (one row per declared tool, every row cites a v5r rule + a reason);
//   ② the manifest's deny lists ARE `declared − allow(seat)` — a set identity, not a count that could coincide;
//   ③ the LIVE call-time gate agrees with the declaration for all three seats (allowed pairs pass, refused pairs refuse
//      BY NAME with a registered code) — so the table is not just a document the wire ignores;
//   ④ the three seats' corrected capabilities are named one by one (the acceptance list of task-15);
//   ⑤ the PROMPT is rendered from the table: each role section's bullet lines equal `seatBulletLines(seat)` verbatim, and
//      the taught names equal the allowed names in BOTH directions (the anti-drift pair — the 20-vs-22 lesson);
//   ⑥ the drift detector actually detects: a declared tool with no row, and a row for a tool the pack no longer declares,
//      are both reported BY NAME instead of being swallowed (fail-closed + named);
//   ⑦ the VERIFIED single-writer claim is checked twice: the gate refuses every writer but `promoteVerified`, and the
//      framework's own `vibe_vmu_records` face cannot name the verified track at all (kind enum + no track on append);
//   ⑧ the OTHER axis (`member-scope.js`) is reconciled BY NAME: whatever it calls office-only while a seat is granted it is
//      listed, so the narrowing that `applyMemberScope` performs cannot be discovered only in a live run.
//
// Run: node tests/vmu-run31-seat-faces.test.mjs        Last line: === VMU RUN31 SEAT FACES: N passed, M failed ===

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const V5R = join(REPO, 'vibe-math-vmu', 'packs', 'v5r')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const seatMod = await import(pathToFileURL(join(V5R, 'seat-faces.js')).href)
const coreMod = await import(pathToFileURL(join(V5R, 'prompts', 'v5r-core.js')).href)
const v5rMod = await import(pathToFileURL(join(V5R, 'index.js')).href)
const scopeMod = await import(pathToFileURL(join(V5R, 'member-scope.js')).href)
const gatesMod = await import(pathToFileURL(join(V5R, 'verification-gates.js')).href)
const verifiedMod = await import(pathToFileURL(join(V5R, 'verified.js')).href)
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

const PACK = v5rMod.PACK
const DECLARED = (PACK.tools || []).map((t) => t && t.name).filter((n) => typeof n === 'string')
const SEAT_OF = { chair: coreMod.v5rToolSectionAcademician, member: coreMod.v5rToolSectionResearcher, temp: coreMod.v5rToolSectionTemp }

const boot = async (config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run31-seat-faces-'))
const b = await boot({ root, packs: ['v5r'] })
const kernel = b.handle.kernel
try {
  // ── ① THE DECLARATION IS COMPLETE AND SELF-CONSISTENT ───────────────────────────────────────────────────────────
  console.log('=== 1. THE SEAT DECLARATION: one row per declared tool, every row cites a rule ===')
  ok(DECLARED.length === 48, 'the pack still declares its 48 tools (the refactor did not shrink the catalogue)', DECLARED.length)
  ok(Object.keys(seatMod.SEAT_TOOL_FACES).length === DECLARED.length,
    '★ the declaration has exactly ONE ROW PER DECLARED TOOL (a tool with no row would be denied by fail-closed, and the coverage question must be answered by a count, not by trust)',
    { rows: Object.keys(seatMod.SEAT_TOOL_FACES).length, declared: DECLARED.length })
  const cat = seatMod.seatTeachingCatalogue(DECLARED)
  ok(cat.ok === true && cat.missing.length === 0 && cat.extra.length === 0,
    '★★ every declared tool has a row, every row names a DECLARED tool (no stale decision survives a renamed tool)',
    { missing: cat.missing, extra: cat.extra })
  ok(cat.badRows.length === 0,
    '★★ every row cites at least one key of RULE_INDEX, gives a boolean verdict for EACH of the three seats and writes a real reason (≥20 chars) — a bare "false" is not an institution decision',
    cat.badRows)
  ok(seatMod.SEAT_IDS.length === 3 && J(seatMod.SEAT_IDS) === J(['chair', 'member', 'temp']),
    'the three seat ids are the ROSTER SLOT ids the kernel selects on (tools/turn.js sets role: m.slot)', seatMod.SEAT_IDS)
  ok(seatMod.SEAT_PENDING_RULINGS.length > 0 && seatMod.SEAT_PENDING_RULINGS.every((r) => r.seat && r.tool && r.evidence && r.evidence.length > 80),
    '★ the decisions I could NOT make alone are NAMED (seat + tool + current + evidence) instead of being applied silently',
    seatMod.SEAT_PENDING_RULINGS.map((r) => r.seat + '·' + r.tool))

  // ── ② THE MANIFEST'S FACE **IS** THE DECLARATION (set identity, not a count) ─────────────────────────────────────
  console.log('=== 2. deny = declared − allow(seat), computed from the declaration ===')
  const derived = seatMod.seatFaces(DECLARED)
  const live = PACK.toolFaces
  ok(J(live) === J(derived),
    '★★★ the manifest `toolFaces` EQUALS `seatFaces(declared)` — one decision, two readers (the prompt is no longer the ACL)',
    { liveSizes: { chair: live.chair.deny.length, member: live.member.deny.length, temp: live.temp.deny.length } })
  // ★ non-vacuous precondition for the per-seat block below: an empty SEAT_IDS would run ZERO checks, so the three
  // assertions inside the loop would pass while checking nothing.
  ok(seatMod.SEAT_IDS.length === 3, '★ the seat loop below iterates the three declared seats (an empty SEAT_IDS would make every per-seat check vacuous)', seatMod.SEAT_IDS)
  for (const seat of seatMod.SEAT_IDS) {
    const allow = seatMod.seatAllowNames(seat, DECLARED)
    const deny = live[seat].deny
    ok(allow.length > 0 && deny.length > 0 && allow.length + deny.length === DECLARED.length && allow.filter((n) => deny.includes(n)).length === 0,
      '★ 反: for the ' + seat + ' seat, allow ⊎ deny = the whole catalogue (no tool is both, none is neither)',
      { allow: allow.length, deny: deny.length, declared: DECLARED.length })
    ok(deny.length > 0 && deny.every((n) => n.startsWith('vibe_v5_')) && deny.every((n) => !/^vibe_vmu_/.test(n)),
      'the ' + seat + ' deny list narrows only THIS pack\'s tools (framework faces are never hidden by a pack decision)')
    ok(allow.length > 0 && allow.every((n) => seatMod.seatDecision(seat, n).why.length > 20),
      '★ every ALLOWED tool for the ' + seat + ' seat carries its reason (an allow without a rule is exactly the "just open it" failure mode)')
  }

  // ── ③ THE LIVE GATE AGREES WITH THE TABLE (call-time, not just the manifest) ─────────────────────────────────────
  console.log('=== 3. the call-time face gate agrees with the declaration for all three seats ===')
  ok(typeof kernel.memberFaceGate === 'function', 'the kernel exposes memberFaceGate (the only non-forgeable check: it resolves the REAL caller)')
  const seats = { chair: 'r-acad', member: 'r-res', temp: 'r-tmp' }
  for (const [seat, id] of Object.entries(seats)) {
    const hired = await kernel.members.hire({ id, slot: seat })
    ok(hired && (hired.id === id || (hired.member && hired.member.id === id)),
      'a member is hired into the ' + seat + ' slot so the gate resolves a REAL seat', hired && hired.id)
  }
  const roster = kernel.members.roster()
  ok(roster.length === 3 && Object.entries(seats).every(([seat, id]) => roster.some((r) => r.id === id && r.slot === seat)),
    '★ the roster really holds the three seats (the gate reads LIVE rows, not a test constant)', roster.map((r) => r.id + ':' + r.slot))
  const gateGrid = [
    // [seat, tool, expected]  — every ALLOW here is one task-15 asked for by name; every DENY is a rule-based refusal
    ['chair', 'vibe_v5_meeting_round', true], ['chair', 'vibe_v5_verdict_final', true], ['chair', 'vibe_v5_verdict_ask', true],
    ['chair', 'vibe_v5_verified_promote', true], ['chair', 'vibe_v5_fidelity_conclude', true], ['chair', 'vibe_v5_blueprint', true],
    ['chair', 'vibe_v5_meeting', true], ['chair', 'vibe_v5_message', true], ['chair', 'vibe_v5_task_get', true],
    ['chair', 'vibe_v5_script', false],
    ['member', 'vibe_v5_say', true], ['member', 'vibe_v5_second', true], ['member', 'vibe_v5_task_get', true],
    ['member', 'vibe_v5_verdict', true], ['member', 'vibe_v5_poll_vote', true], ['member', 'vibe_v5_motion', true],
    ['member', 'vibe_v5_blueprint', true], ['member', 'vibe_v5_lean_run', true],
    // ★ A7 (round 33, Lead-ruled): a permanent researcher HIRES the temp worker it needs, so it must be able to END one too
    // (`fire` ends the member face and cancels its unfinished tasks; the file of that temp stays in the institute's history).
    ['member', 'vibe_v5_fire', true],
    ['member', 'vibe_v5_message', false], ['member', 'vibe_v5_verdict_final', false], ['member', 'vibe_v5_meeting', false],
    ['member', 'vibe_v5_meeting_round', false], ['member', 'vibe_v5_start', false], ['member', 'vibe_v5_verified_promote', false],
    // ★ A8 (round 33, Lead-ruled) — "temp 只做被指派的临时任务": a temp worker performs the task it was hired for and
    // reports through it. Cards, Lean output and papers are RESEARCH CONCLUSIONS that land in the institute's libraries,
    // and those stay with the permanent seats (its observations travel via `task_update`, it does not open a card itself).
    ['temp', 'vibe_v5_lean_run', false], ['temp', 'vibe_v5_lean_job', false], ['temp', 'vibe_v5_lean_lib', false],
    ['temp', 'vibe_v5_lean_read', false], ['temp', 'vibe_v5_lean_archive', false],
    ['temp', 'vibe_v5_record_proposition', false], ['temp', 'vibe_v5_record_progress', false], ['temp', 'vibe_v5_paper', false],
    ['temp', 'vibe_v5_task_get', true],
    ['temp', 'vibe_v5_say', true],
    ['temp', 'vibe_v5_verdict', false], ['temp', 'vibe_v5_poll_vote', false], ['temp', 'vibe_v5_motion', false],
    ['temp', 'vibe_v5_second', false], ['temp', 'vibe_v5_meeting', false], ['temp', 'vibe_v5_hire', false],
    ['temp', 'vibe_v5_fire', false], ['temp', 'vibe_v5_blueprint', false], ['temp', 'vibe_v5_verified_promote', false],
    ['temp', 'vibe_v5_fidelity_conclude', false], ['temp', 'vibe_v5_meeting_round', false],
  ]
  const gridResults = gateGrid.map(([seat, tool, expected]) => {
    const verdict = kernel.memberFaceGate({ member: seats[seat], toolName: tool })
    return { seat, tool, expected, got: verdict && verdict.ok === true, verdict }
  })
  const wrong = gridResults.filter((r) => r.got !== r.expected)
  ok(wrong.length === 0, '★★★ every gate verdict matches the declaration (%d pairs: the seat either may call it, or is refused)'.replace('%d', gridResults.length),
    wrong.map((r) => r.seat + '·' + r.tool + ' expected ' + r.expected + ' got ' + r.got))
  const refusals = gridResults.filter((r) => r.expected === false)
  ok(refusals.length > 0 && refusals.every((r) => r.verdict.code === 'VMU_TOOL_NOT_IN_FACE'
    && String(r.verdict.message).includes(r.tool) && String(r.verdict.message).includes(r.seat)),
    '★★ a refusal NAMES the tool AND the seat and carries the registered code VMU_TOOL_NOT_IN_FACE (a hidden face is not a silent one)',
    refusals.map((r) => r.verdict.code))

  // ── ④ THE THREE SEATS' CORRECTED CAPABILITIES, NAMED (task-15 acceptance) ────────────────────────────────────────
  console.log('=== 4. the seats can reach their own duties again ===')
  const chairDuties = ['vibe_v5_meeting_round', 'vibe_v5_verdict_final', 'vibe_v5_verdict_ask', 'vibe_v5_verified_promote', 'vibe_v5_fidelity_conclude', 'vibe_v5_blueprint']
  ok(chairDuties.length === 6 && chairDuties.every((n) => kernel.memberFaceGate({ member: seats.chair, toolName: n }).ok === true),
    '★★★ chair: 推进轮次 / 汇总裁决 / 发裁决请求 / 采纳蓝图 / 升 Verified / 保真收口 — ALL SIX reachable (they were all denied on run 31)',
    chairDuties.filter((n) => !kernel.memberFaceGate({ member: seats.chair, toolName: n }).ok))
  ok(kernel.memberFaceGate({ member: seats.member, toolName: 'vibe_v5_second' }).ok === true,
    '★★ member: can SECOND a motion (before this, `motion` was taught but `second` was not, so a motion could never be seconded)')
  ok(kernel.memberFaceGate({ member: seats.member, toolName: 'vibe_v5_task_get' }).ok === true,
    '★★ member: can READ one task card (the acceptance criteria live there, not in the board list) — run 31 denied it')
  const leanNames = Object.keys(seatMod.SEAT_TOOL_FACES).filter((n) => /^vibe_v5_lean_/.test(n))
  ok(leanNames.length === 5 && leanNames.every((n) => kernel.memberFaceGate({ member: seats.temp, toolName: n }).ok === false),
    '★★★ temp: NONE of the Lean five (A8: Lean 产出属于研究所的库，临时工不写库) — run 31 denied them as a word-count accident, round 33 denies them BY DECLARATION with a cited reason', leanNames)
  const tempWrites = ['vibe_v5_record_proposition', 'vibe_v5_record_progress']
  ok(tempWrites.every((n) => kernel.memberFaceGate({ member: seats.temp, toolName: n }).ok === false),
    '★★ temp: CANNOT record a proposition card (A8) — 卡是研究与裁决的对象，「谁主张了什么、p 是多少」留在院士与常驻研究员各自的库里；临时工的观察走 task_update 汇报，不自己立卡（method/subproblem 同样仍关）',
    { proposition: kernel.memberFaceGate({ member: seats.temp, toolName: 'vibe_v5_record_proposition' }).ok, method: kernel.memberFaceGate({ member: seats.temp, toolName: 'vibe_v5_record_method' }).ok })
  ok(['vibe_v5_verdict', 'vibe_v5_poll_vote', 'vibe_v5_motion', 'vibe_v5_second', 'vibe_v5_meeting', 'vibe_v5_hire', 'vibe_v5_fire']
    .every((n) => kernel.memberFaceGate({ member: seats.temp, toolName: n }).ok === false),
    '★★★ 反: temp STILL cannot vote (verdict/poll_vote), move/second, convene, hire or fire — rule 1 layering is preserved, this was not "just open everything"')
  // ★ the private channel: task-15 asked for "member can DM". The DM path is `say {to}` (kind:'dm' is chosen by the body),
  // NOT `message` — `message` relays in the OFFICE's voice with an unvalidated sender. This pins that distinction.
  ok(seatMod.seatDecision('member', 'vibe_v5_say').allowed === true && seatMod.seatDecision('member', 'vibe_v5_message').allowed === false,
    '★★ member DMs through `say {to}` (allowed) while `message` — which sends as "office" with an UNCHECKED sender (kit/handlers.js:352) — stays closed; the ruling is recorded in SEAT_PENDING_RULINGS')

  // ★ Lead 裁决 5 (round 31): `verified_promote` belongs to the CHAIR seat alone — verified/ is the institute's record
  // that a proposition is proved or refuted FOR GOOD, and v5r hands that closing step (Lean passes → the debate checks the
  // description → probability=1 → admitted into verified/) to the debate and the academician. A member promotes by
  // WRITING A CARD (record_proposition) and winning the ruling, never by closing the record itself; a temp (A8) writes no
  // card at all — its observations travel through the task it was hired for.
  {
    const vpChair = kernel.memberFaceGate({ member: seats.chair, toolName: 'vibe_v5_verified_promote' })
    const vpMember = kernel.memberFaceGate({ member: seats.member, toolName: 'vibe_v5_verified_promote' })
    const vpTemp = kernel.memberFaceGate({ member: seats.temp, toolName: 'vibe_v5_verified_promote' })
    ok(vpChair.ok === true, '★★★ 裁决 5: the chair may PROMOTE into the verified track (the single entrance is reachable by the seat that closes records)',
      vpChair)
    ok(vpMember.ok === false && vpMember.code === 'VMU_TOOL_NOT_IN_FACE'
      && vpTemp.ok === false && vpTemp.code === 'VMU_TOOL_NOT_IN_FACE',
      '★★★ 裁决 5: member AND temp are refused BY NAME at the call-time gate (not merely hidden on the wire)',
      { member: vpMember.code, temp: vpTemp.code })
    const promptTeaches = (seat) => seatMod.seatBulletLines(seat).join('\n')
    ok(/vibe_v5_verified_promote/.test(promptTeaches('chair'))
      && !/vibe_v5_verified_promote/.test(promptTeaches('member'))
      && !/vibe_v5_verified_promote/.test(promptTeaches('temp')),
      '★★★ 裁决 5: the PROMPT teaches verified_promote to the chair only — no other seat is invited to a door it cannot open',
      { member: /vibe_v5_verified_promote/.test(promptTeaches('member')), temp: /vibe_v5_verified_promote/.test(promptTeaches('temp')) })
    ok(seatMod.SEAT_PENDING_RULINGS.filter((r) => r.status === 'pending').length === 0,
      '★ 裁决 5 closes the LAST pending ruling: the ledger now says every decision has an owner (nothing is left "to be ruled later")',
      seatMod.SEAT_PENDING_RULINGS.filter((r) => r.status === 'pending').map((r) => r.seat + '·' + r.tool))
  }

  // ── ⑤ THE PROMPT IS RENDERED FROM THE TABLE (anti-drift, both directions) ────────────────────────────────────────
  console.log('=== 5. prompt == declaration: the bullets are RENDERED, and taught names == allowed names ===')
  const bulletLinesOf = (section) => String(section.text).split('\n').map((l) => l.trim()).filter((l) => l.startsWith('·'))
  const bulletNamesOf = (section) => [...new Set(bulletLinesOf(section).flatMap((l) => l.match(/vibe_v5_[a-z0-9_]+/g) || []))]
  let rendered = 0
  // ★ non-vacuous precondition for the render loop: an empty SEAT_IDS would compare zero sections.
  ok(seatMod.SEAT_IDS.length === 3, '★ the render loop below iterates the three declared seats (an empty SEAT_IDS would make the per-seat pairing vacuous)', seatMod.SEAT_IDS)
  for (const seat of seatMod.SEAT_IDS) {
    const section = SEAT_OF[seat]
    const expectedLines = seatMod.seatBulletLines(seat)
    const actualLines = bulletLinesOf(section)
    rendered += expectedLines.length
    ok(J(actualLines) === J(expectedLines),
      '★★★ ' + seat + ': the section\'s bullet lines are VERBATIM `seatBulletLines(\'' + seat + '\')` (' + expectedLines.length + ' lines) — the prompt cannot be edited without the declaration, and the declaration cannot change without the prompt',
      { expected: expectedLines.length, actual: actualLines.length, diff: expectedLines.filter((l, i) => l !== actualLines[i]).slice(0, 2) })
    const allow = seatMod.seatAllowNames(seat, DECLARED)
    const taught = bulletNamesOf(section)
    ok(taught.filter((n) => !allow.includes(n)).length === 0,
      '★★★ pair A (' + seat + '): every TAUGHT tool is one the seat may call — "the prose promises what the face refuses" is impossible',
      taught.filter((n) => !allow.includes(n)))
    ok(allow.filter((n) => !taught.includes(n)).length === 0,
      '★★★ pair B (' + seat + '): every ALLOWED tool is taught — the run-31 defect class in the other direction',
      allow.filter((n) => !taught.includes(n)))
    const proseOnly = [...new Set(String(section.text).match(/vibe_v5_[a-z0-9_]+/g) || [])].filter((n) => !taught.includes(n))
    ok(proseOnly.length === 0 && String(section.text).split('\n')[0].includes('【本角色可用的工具｜'),
      '★ ' + seat + ': prose mentions no `vibe_v5_*` outside the bullet list, and the first line is still the role table title', proseOnly)
  }
  ok(rendered > 0, 'RULE E: the rendered bullet set is non-empty (a "both empty" comparison cannot pass)', rendered)

  // ── ⑥ THE DRIFT DETECTOR REALLY DETECTS ──────────────────────────────────────────────────────────────────────────
  console.log('=== 6. the detector, tested against drift instead of trusted ===')
  const withGhost = seatMod.seatTeachingCatalogue([...DECLARED, 'vibe_v5_ghost_tool'])
  ok(withGhost.ok === false && J(withGhost.missing) === J(['vibe_v5_ghost_tool']),
    '★★ a DECLARED tool with no row is reported BY NAME (and it is denied to every seat meanwhile: fail-closed)', withGhost.missing)
  const staleRow = seatMod.seatTeachingCatalogue(['vibe_v5_verdict_final'])
  const rowCount = Object.keys(seatMod.SEAT_TOOL_FACES).length
  ok(staleRow.ok === false && staleRow.extra.length === rowCount - 1 && !staleRow.extra.includes('vibe_v5_verdict_final'),
    '★★ a ROW whose tool the pack no longer declares is reported BY NAME (a stale grant cannot outlive its tool)', { extra: staleRow.extra.length })
  ok(seatMod.seatDecision('chair', 'vibe_v5_ghost_tool').allowed === false && seatMod.seatDecision('chair', 'vibe_v5_ghost_tool').declared === false,
    '★ an UNKNOWN tool is denied and says it was never declared (no row ⇒ no capability, and the answer explains itself)')
  let unknownSeat = null
  try { seatMod.seatBulletLines('ghost-seat') } catch (e) { unknownSeat = e }
  ok(unknownSeat && unknownSeat.code === 'VMU_SEAT_FACE_UNKNOWN' && /chair, member, temp/.test(unknownSeat.hint),
    '★ 反: an unknown seat THROWS by name instead of rendering an empty tool table that reads like "you have nothing"', unknownSeat && unknownSeat.code)

  // ── ⑦ THE VERIFIED TRACK HAS ONE WRITER (rule 2) ─────────────────────────────────────────────────────────────────
  console.log('=== 7. single writer: the gate refuses every other entrance, and the framework face cannot name the track ===')
  const okWrite = gatesMod.singleWriter({ writer: gatesMod.SINGLE_WRITER, track: verifiedMod.VERIFIED_TRACK, cardId: 'p-1', by: 'r-acad' })
  ok(okWrite.ok === true && okWrite.allowed === true,
    '★ the gate ADMITS the declared writer `' + gatesMod.SINGLE_WRITER + '` on the verified track (the positive half; a gate that refuses everything proves nothing)', okWrite.allowed)
  const wrongWriter = gatesMod.singleWriter({ writer: 'recordProgress', track: verifiedMod.VERIFIED_TRACK, cardId: 'p-1' })
  const noWriter = gatesMod.singleWriter({ track: verifiedMod.VERIFIED_TRACK, cardId: 'p-1' })
  ok(wrongWriter.ok === false && wrongWriter.allowed === false && wrongWriter.code === gatesMod.GATE_CODES.VERIFIED_SINGLE_WRITER
    && noWriter.code === gatesMod.GATE_CODES.VERIFIED_SINGLE_WRITER,
    '★★ any writer but `promoteVerified` — including NO writer at all — is refused BY NAME with VMU_PACK_V5R_VERIFIED_SINGLE_WRITER',
    [wrongWriter.code, noWriter.code])
  const scoped = gatesMod.singleWriter({ writer: 'anything', track: 'propositions' })
  ok(scoped.ok === true && scoped.allowed === true && scoped.applicable === false && scoped.code === null,
    '★ the gate is SCOPED to the verified track: an ordinary proposition write is NOT refused, it is not even applicable (a gate that blocks everything is a wall, not a rule)',
    scoped.note)
  // the pack source: exactly ONE code line that writes the verified track, and it lives in verified.js
  const packFiles = (await readdir(V5R)).filter((f) => f.endsWith('.js'))
  ok(packFiles.length > 0, 'RULE E: the pack source set is non-empty', packFiles.length)
  const verifiedTrackWrites = []
  for (const f of packFiles) {
    const src = await readFile(join(V5R, f), 'utf8')
    for (const line of src.split('\n')) {
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue // a comment cannot write anything
      if (/records\s*\.\s*put\s*\(/.test(line) && /VERIFIED_TRACK/.test(line)) verifiedTrackWrites.push(f + ': ' + t)
    }
  }
  ok(verifiedTrackWrites.length === 1 && verifiedTrackWrites[0].startsWith('verified.js:') && /track:\s*VERIFIED_TRACK/.test(verifiedTrackWrites[0]),
    '★★ ★ THE WHOLE PACK HAS EXACTLY ONE `records.put(... track: VERIFIED_TRACK ...)` — in verified.js; every other put in the pack (feedback etc.) names a different track, so the verified track has one entrance in CODE, not by convention',
    verifiedTrackWrites)
  // the framework face: `vibe_vmu_records` cannot name the verified track (kind enum) and writes no track at all
  const recordsSpec = b.specOf('vibe_vmu_records')
  ok(!!recordsSpec, 'the framework `vibe_vmu_records` face is published in this deployment (so the bypass claim is testable, not hypothetical)')
  if (recordsSpec) {
    const props = recordsSpec.parameters && recordsSpec.parameters.properties
    const kindEnum = props && props.kind && props.kind.enum
    ok(Array.isArray(kindEnum) && kindEnum.length > 0 && !kindEnum.includes('verified') && !kindEnum.includes(verifiedMod.VERIFIED_TRACK),
      '★★★ `vibe_vmu_records` `kind` cannot be the verified track (enum = ' + J(kindEnum) + ') — so the "records bypasses the single writer" claim of the run-31 review is FALSE in this implementation',
      kindEnum)
    ok(props && props.track && /list/.test(String(props.track.description)) && !props.track.enum,
      '★★ and its `track` parameter is documented as a LIST filter (it does not select a track to WRITE into)',
      props && props.track && props.track.description)
    let refusedKind = null
    try {
      const raw = await recordsSpec.execute({ action: 'append', kind: 'verified', statement: 'x' }, {})
      refusedKind = JSON.parse(raw)
    } catch (e) { refusedKind = { threw: String(e && e.message) } }
    ok(refusedKind && (refusedKind.ok === false || refusedKind.threw),
      '★★ 反 (behaviour, not just the schema): `append { kind: "verified" }` is REFUSED at the tool boundary', refusedKind)
  }
  // and the ONE pack path that writes the track is granted to the CHAIR seat only
  ok(seatMod.seatDecision('chair', 'vibe_v5_verified_promote').allowed === true
    && seatMod.seatDecision('member', 'vibe_v5_verified_promote').allowed === false
    && seatMod.seatDecision('temp', 'vibe_v5_verified_promote').allowed === false,
    '★★ the single entrance is reachable by the CHAIR seat only (rule 2: the institute decides what becomes trusted; members promote through adjudication, not by self-certification)')

  // ── ⑧ THE OTHER AXIS: member-scope narrows what this table grants, so the disagreement is NAMED ──────────────────
  console.log('=== 8. reconciliation with the other axis (member-scope office-only) ===')
  const recon = seatMod.seatFaceReconciliation({ declared: DECLARED, memberScope: scopeMod.TOOL_SCOPES })
  const officeOnly = Object.keys(scopeMod.TOOL_SCOPES).filter((n) => scopeMod.TOOL_SCOPES[n] === 'office')
  ok(officeOnly.length > 0, 'RULE E: member-scope does classify some tools as office-only', officeOnly.length)
  const expectedConflicts = []
  for (const seat of seatMod.SEAT_IDS) {
    for (const tool of seatMod.seatAllowNames(seat, DECLARED)) if (officeOnly.includes(tool)) expectedConflicts.push(seat + '·' + tool)
  }
  ok(J(recon.conflicts.map((c) => c.seat + '·' + c.tool).sort()) === J(expectedConflicts.sort()),
    '★★ the two axes\' disagreement is COMPUTED and listed (seat grant ∧ office-only), not discovered in a live run — see SEAT_PENDING_RULINGS for the cross-lane fix',
    { conflicts: recon.conflicts.length, sample: recon.conflicts.slice(0, 3).map((c) => c.seat + '·' + c.tool) })
  ok(recon.conflicts.length > 0 && recon.conflicts.every((c) => c.means && c.means.length > 40),
    '★ each conflict says WHAT it means at runtime (for a governed seat: `applyMemberScope` pushes this table\'s deny, so it is narrowed; for the chair: it is only a naming difference on the read side)')
  // ★ the CLASSIFIER is part of the receipt: "read-only vs hard" is decided by `SEAT_GOVERNED_SLOTS`, which is OUR
  // definition, not a sentence from the rules. Saying it out loud means a future re-governing of `temp` shows up as a
  // visible test failure (those rows would move into hardConflicts and `ok` would be false), never as an inferred surprise.
  ok(recon.splitBy === 'governed' && typeof recon.splitMeans === 'string' && /governed/i.test(recon.splitMeans)
    && recon.conflicts.every((c) => c.governed === seatMod.SEAT_GOVERNED_SLOTS.includes(c.seat)),
    '★★ the split between `readOnlyConflicts` and `hardConflicts` NAMES its own criterion (`splitBy: "governed"`) instead of leaving a reader to infer it',
    { splitBy: recon.splitBy })
  // ★ ROUND 31 FIX: the disagreement is no longer a live-run surprise — the governed seats' lines now agree, and only the
  // chair (which is deliberately NOT governed) still names an office-only tool as its own.
  ok(recon.hardConflicts.length === 0,
    '★★★ no GOVERNED seat is granted a tool the member line calls office-only (the narrowing and the declaration agree)',
    recon.hardConflicts.map((c) => c.seat + '·' + c.tool))
  ok(recon.readOnlyConflicts.length > 0 && recon.readOnlyConflicts.length === recon.conflicts.length && recon.readOnlyConflicts.every((c) => c.seat === 'chair'),
    '★★ every remaining entry is the CHAIR\'s, and it is categorized as read-only, not as a hard conflict',
    recon.readOnlyConflicts.map((c) => c.tool))
  ok(typeof seatMod.SEAT_SCOPE_AXES.scope === 'string' && seatMod.SEAT_SCOPE_AXES.scope.includes('谁看得见')
    && seatMod.SEAT_SCOPE_AXES.seat.includes('谁调得动') && seatMod.SEAT_SCOPE_AXES.join.includes('deny'),
    '★★ the two axes are DECLARED together, in one place (member-scope: 谁看得见 / this table: 谁调得动; the join is the derived deny)')

  // ── ⑨ the pack still declares the face through the manifest path, not by hand ────────────────────────────────────
  console.log('=== 9. the declaration reaches the kernel through the manifest (retract / re-declare) ===')
  const faces = kernel.packToolFaces()
  ok(Array.isArray(faces) && faces.length === 1 && faces[0].faces && J(faces[0].faces.chair.deny) === J(derived.chair.deny),
    '★★ the kernel holds ONE pack face whose chair deny list IS the declared one (the wiring path, not a test-only export)',
    faces.map((f) => f.by || f.id))
  const declaredToolNames = new Set(DECLARED)
  ok(faces[0].faces[seatMod.SEAT_IDS[0]].deny.every((n) => declaredToolNames.has(n)),
    '★ every name in the live face is a tool this pack declares (a prompt-only phantom cannot be denied)')
  // ── ⑩ ROUND 31 (Lead's new order): THE START-TIME SCOPE NO LONGER REPLACES THE SEAT FACE ─────────────────────────
  // This is the defect that made run 31's probe contradict the declaration: `packs/v5r/tools.js` hands EVERY hired seat
  // (including the chair, `r-acad`) to `applyMemberScope`, and that function used to push `allow: MEMBER_SAFE_TOOLS` —
  // an `allow` array makes `kernel/memberface.js#faceGate` stop reading `deny` altogether, i.e. the override REPLACED the
  // seat declaration: the chair lost `verdict_final`/`verdict_ask`/`verified_promote`/`report` and gained `message`.
  // The fix derives a DENY list from this table and skips the chair. This block runs the LIVE sequence and re-measures.
  console.log('=== 10. live hire → scope → gate: the chair keeps its duties, no seat is widened ===')
  const probe = ['vibe_v5_verdict_final', 'vibe_v5_verdict_ask', 'vibe_v5_verified_promote', 'vibe_v5_blueprint',
    'vibe_v5_meeting_round', 'vibe_v5_fidelity_conclude', 'vibe_v5_report', 'vibe_v5_message', 'vibe_v5_script']
  const measure = (id) => Object.fromEntries(probe.map((n) => [n, kernel.memberFaceGate({ member: id, toolName: n }).ok === true]))
  const beforeScope = Object.fromEntries(Object.entries(seats).map(([seat, id]) => [seat, measure(id)]))
  const liveRoster = kernel.members.roster().map((r) => r.id) // exactly what toolStart hands over: every hired seat
  const seatScope = scopeMod.applyMemberScope({ kernel, members: liveRoster })
  ok(seatScope.ok === true && seatScope.appliedCount === 2 && seatScope.skipped.some((s) => s.member === seats.chair),
    '★ the live sequence narrows the two governed seats and SKIPS the chair (it is named, not silently dropped)',
    { applied: seatScope.applied.map((a) => a.member + '/' + a.slot), skipped: seatScope.skipped.map((s) => s.member + '/' + s.why) })
  ok(kernel.memberToolOverride(seats.chair) === null,
    '★★★ NO override row is written for the chair at all — its capability is the declaration, full stop')
  const chairAfter = measure(seats.chair)
  ok(J(chairAfter) === J(beforeScope.chair)
    && chairDuties.every((n) => chairAfter[n] === true) && chairAfter.vibe_v5_report === true && chairAfter.vibe_v5_script === false,
    '★★★ AFTER the start sequence the chair can STILL call all six duties + report, and `script` is still refused (nothing was widened)',
    { before: beforeScope.chair, after: chairAfter })
  const memOverride = kernel.memberToolOverride(seats.member)
  const tempOverride = kernel.memberToolOverride(seats.temp)
  const sameSet = (x, y) => J((x || []).slice().sort()) === J((y || []).slice().sort())
  ok(memOverride && memOverride.allow === null && sameSet(memOverride.deny, seatMod.seatDenyNames('member', DECLARED))
    && memOverride.deny.length === seatMod.seatDenyNames('member', DECLARED).length,
    '★★ the member seat gets exactly the deny complement of the declaration (same names, no duplicates, allow stays null so faceGate still reads deny)',
    memOverride)
  ok(tempOverride && tempOverride.allow === null && sameSet(tempOverride.deny, seatMod.seatDenyNames('temp', DECLARED))
    && tempOverride.deny.length === seatMod.seatDenyNames('temp', DECLARED).length,
    '★★ and so does the temp seat (one table, two slots, no second catalogue)',
    tempOverride && tempOverride.deny.length)
  const memberAfter = measure(seats.member)
  ok(memberAfter.vibe_v5_message === false && memberAfter.vibe_v5_report === false && memberAfter.vibe_v5_verdict_final === false,
    '★★★ the member is NOT widened by the scope: `message` (impersonation face) and `report` and the chair\'s ruling stay closed')
  ok(J(memberAfter) === J(beforeScope.member),
    '★★ and the member\'s wire is unchanged by the scope — the scope narrows the OFFICE line, it does not overrule the seat table',
    { before: beforeScope.member, after: memberAfter })
  const tempAfter = measure(seats.temp)
  ok(tempAfter.vibe_v5_verdict_final === false && tempAfter.vibe_v5_message === false
    && kernel.memberFaceGate({ member: seats.temp, toolName: 'vibe_v5_lean_run' }).ok === false,
    '★ temp: still cannot rule or impersonate, and A8 keeps Lean closed too — the scope neither widens nor steals a declared face (it can only take tools away)')
} finally {
  await rm(root, { recursive: true, force: true })
}

// ── ⑩ THE CONSUMER SIDE: even if someone HANDS the kernel an `allow` array, a seat deny is not overruled ─────────────
// Moved here from tests/audit-member-scope.test.mjs: that family is contractually "read the source / pure functions,
// never boot a kernel, never write" — this needs a live kernel, so it belongs with the probe-domain suite that already
// boots one. The ⑤/⑥ sections there keep the producer-side evidence (this pack never SENDS an allow array); this is the
// other direction: `host.js`'s wire filter and `memberface.js#faceGate` both stop reading `deny` once they see `allow`,
// so an allow array on top of a seat deny is an AUTHORISATION — exactly how run 31 was widened. The kernel now
// intersects the override allow with the seat deny and names what it removed, so "widening" is unreachable from both ends.
{
  console.log('')
  console.log('=== 10. consumer side: the kernel narrows an override allow instead of granting the seat back ===')
  const seatDenied = 'vibe_v5_message'
  ok(seatMod.seatDenyNames('member', DECLARED).includes(seatDenied),
    '★ the counterfactual names a tool the MEMBER seat really denies (otherwise the probe below would prove nothing)')
  await kernel.members.hire({ id: 'r-inv', slot: 'member' })
  // deliberately the exact shape the old producer emitted: an allow list that mentions a seat-denied name.
  kernel.setMemberToolOverride({ member: 'r-inv', allow: ['vibe_v5_say', seatDenied] })
  const resolved = kernel.resolveMemberToolDeny('r-inv')
  ok(Array.isArray(resolved.allow) && !resolved.allow.includes(seatDenied),
    '★★ AN OVERRIDE CANNOT WIDEN: resolveMemberToolDeny drops the seat-denied name from `allow` instead of granting it back',
    JSON.stringify(resolved.allow))
  ok(Array.isArray(resolved.allowNarrowedByDeny) && resolved.allowNarrowedByDeny.includes(seatDenied),
    '★★ the narrowing is REPORTED by name (`allowNarrowedByDeny`) — a silent drop would be indistinguishable from a bug',
    JSON.stringify(resolved.allowNarrowedByDeny))
  ok(typeof resolved.allowNarrowedMeans === 'string' && /take tools away/.test(resolved.allowNarrowedMeans),
    '★ the receipt says WHY in a sentence ("an override can only take tools away…")', resolved.allowNarrowedMeans)
  ok(resolved.allow.includes('vibe_v5_say'),
    'the narrowing is surgical: the names the seat does permit survive the intersection')
  ok(kernel.memberFaceGate({ member: 'r-inv', toolName: seatDenied }).ok === false
    && kernel.memberFaceGate({ member: 'r-inv', toolName: 'vibe_v5_say' }).ok === true,
    '★★★ END-TO-END: the widened name is still REFUSED at the call-time gate, while the permitted one passes')
  kernel.clearMemberToolOverride('r-inv')
}

console.log('')
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  · ' + f) }
console.log('=== VMU RUN31 SEAT FACES: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
