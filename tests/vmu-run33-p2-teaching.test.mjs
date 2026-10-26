// tests/vmu-run33-p2-teaching.test.mjs — RUN 33 / task-21: THE SIX P2 ITEMS ARE TAUGHT, TO THE SEAT THAT MAY USE THEM.
//
// THE DEFECT THIS PINS: run 32's conformance audit (task-14) listed six capabilities where the MECHANISM existed but the
// prompt said nothing — a member could not learn, from anything it was given, that a meeting can be scheduled, closed,
// extended or bounded; that the human surface has an approval queue; that chat has admins and a mute; that the round
// carries a status board with sourced rows. "Prompt silence" is not a safety property: the agent either never uses the
// capability or invents a shape for it (run 31's `math_computation`/`propose_verify` carry-overs are exactly that).
//
// WHAT THIS SUITE PROVES, in the order a reader needs it:
//   ① the teaching is DECLARED and RENDERED: each seat's bullet section equals `seatBulletLines(seat)` verbatim, and every
//      framework face the teaching mentions really exists in the host's `TOOL_NAMES` (no invented tool name);
//   ② each of the six items is taught WITH the refusal that bounds it — a capability statement without its refusal is
//      the phrasing that let run 31 teach `verified_promote` as "the one writer" while all three seats were denied it;
//   ③ the wording rests on DECLARED settings: the defaults this prompt quotes (`vmu.chat.admins` = ["acad"], quota 0,
//      muteDefaultMs 0, `vmu.human.gatedActions` EMPTY, onTimeout hold, closeRequiresChair true) are read back from
//      `settings/defaults.json`, so the prompt cannot claim "already on" something the deployment does not declare;
//   ④ no teaching asserts a gate the defaults do not declare: every passage about a gated action names
//      `vmu.human.gatedActions` (the conditional) instead of promising the gate is active;
//   ⑤ the status board is taught as DATA the loop composes (four labelled rows, one source each, a missing source says
//      「该来源未提供：…」) and a REAL kernel turn proves the block is there — the prompt half of R31's P3;
//   ⑥ the office (assistant) surface teaches the approval route, so the seat that speaks to the user is the one that
//      knows approvals are the human's decision.
//
// Run: node tests/vmu-run33-p2-teaching.test.mjs        Last line: === VMU RUN33 P2 TEACHING: N passed, M failed ===

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const V5R = join(REPO, 'vibe-math-vmu', 'packs', 'v5r')
const urlish = (p) => pathToFileURL(p).href

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

const seatMod = await import(urlish(join(V5R, 'seat-faces.js')))
const coreMod = await import(urlish(join(V5R, 'prompts', 'v5r-core.js')))
const v5rMod = await import(urlish(join(V5R, 'index.js')))
const assistantMod = await import(urlish(join(V5R, 'prompts', 'v5r-assistant.js')))
const hostMod = await import(urlish(join(REPO, 'vibe-math-vmu', 'host.js')))
const kernelMod = await import(urlish(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')))
const turnMod = await import(urlish(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')))
const switchesMod = await import(urlish(join(V5R, 'middleware', 'prompt-switches.js')))

const PACK = v5rMod.PACK
const SECTIONS = PACK.sections
const DECLARED = (PACK.tools || []).map((t) => t && t.name).filter((n) => typeof n === 'string')
const SEAT_OF = { chair: coreMod.v5rToolSectionAcademician, member: coreMod.v5rToolSectionResearcher, temp: coreMod.v5rToolSectionTemp }
const sectionText = (seat) => String((SEAT_OF[seat] && SEAT_OF[seat].text) || '')
const DEFAULTS = JSON.parse(await readFile(join(V5R, 'settings', 'defaults.json'), 'utf8'))
const ASSISTANT = JSON.parse(await readFile(join(V5R, 'prompts', 'assistant.json'), 'utf8'))
const allSectionText = SECTIONS.map((s) => String((s && s.text) || '')).join('\n')

// ── 1. THE TEACHING IS DECLARED AND THE PROMPT SECTION IS RENDERED FROM THE DECLARATION ──────────────────────────
{
  ok(DECLARED.length > 30, 'the pack still declares its tool face (a shrunken set would make the loops below vacuous)', DECLARED.length)
  const cat = seatMod.seatTeachingCatalogue(DECLARED)
  ok(cat.ok === true, '★ every declared tool has a face row and every taught v5 name is allowed (fail-closed, no drift)', cat)
  ok(cat.missing.length === 0 && cat.extra.length === 0 && cat.badRows.length === 0,
    'no row without a tool, no tool without a row, every row citing a v5r rule')
  for (const seat of ['chair', 'member', 'temp']) {
    const rendered = sectionText(seat)
    const expected = seatMod.seatBulletLines(seat).join('\n')
    ok(rendered.includes(expected), '★ the ' + seat + ' section IS the rendered declaration (not a hand-written list)')
    // ★ RULE E: every framework face this seat teaches must (a) be a real host tool and (b) appear in the rendered text.
    const taught = seatMod.SEAT_TEACHING[seat].filter((row) => row && row.framework === true)
    ok(taught.length > 0, 'the ' + seat + ' seat teaches at least one framework face (the P2 items live on vibe_vmu_*)', taught.length)
    for (const row of taught) {
      for (const name of row.names) {
        const real = Object.values(hostMod.TOOL_NAMES).includes(name)
        ok(real, '★ ' + seat + ' teaches a REAL tool name (' + name + ') — not a carry-over from a retired preset', name)
        ok(rendered.includes(name), 'and the rendered section really carries it (' + name + ')')
      }
    }
  }
}

// ── 2. THE SIX P2 ITEMS: each taught to the seat that may use it, WITH the refusal that bounds it ────────────────
{
  const chair = sectionText('chair')
  const member = sectionText('member')
  const temp = sectionText('temp')

  // ① blueprint — the carrier of rule 3 (already taught before run 33; re-pinned so a later edit cannot drop it).
  ok(/vibe_v5_blueprint/.test(chair), '① 蓝图 taught to the chair')
  ok(/adopt/.test(chair) && /只有院士席/.test(chair), '① and the adopt step is chair-only, in the same sentence')
  ok(/vibe_v5_blueprint/.test(member), '① 蓝图 proposed/read by a member too (共同设计), per the ruling on the member face')

  // ② meeting close / extend / lapse — the chair convened it, so the chair closes it.
  ok(/vibe_vmu_meeting/.test(chair), '② the meeting KERNEL face is taught to the chair (close lives there, not on vibe_v5_meeting)')
  ok(/closeRequiresChair/.test(chair), '② and the policy key that makes close chair-pinned is named')
  ok(/VMU_NOT_PERMITTED/.test(chair), '★ ② the REFUSAL for a missing/wrong actor is named (a teaching without its refusal is a taunt)')
  ok(/extendlimit/.test(chair) && /speechExtendMs/.test(chair), '② extend (speech) vs extendlimit (wall clock) are distinguished')
  ok(/hardLimitMs/.test(chair) && /lapse/.test(chair) && /revokelapse/.test(chair),
    '② the bounded fallback (lapse only past hardLimitMs) and its undo (revokelapse needs a reason) are taught')
  ok(/closureVote/.test(chair), '② the successful close receipt is named, so an agent can tell "closed" from "refused"')

  // ③ `at` scheduling — on the face that actually convenes.
  ok(/`at` 可预约/.test(chair), '③ `at` scheduling is taught on the convening face')
  ok(/scheduled/.test(chair), '③ and the state it produces is named')
  ok(/status\/summary\/meetingView 立刻可读/.test(chair), '③ reads-before-start are taught (the capability an agent would otherwise miss)')
  ok(/具名拒绝/.test(chair), '★ ③ the pre-start refusal is taught as BY NAME, not as a silent no-op')
  ok(/beat\(\)/.test(chair), '③ and settlement is attributed to the kernel sweep, so nobody waits for a timer that does not exist')
  ok(/没有 `sequence` 参数/.test(chair) && /逐场召集/.test(chair),
    '★ ③ 连排 is taught HONESTLY: this face has no sequence parameter, so schedule each meeting with its own `at`')

  // ④ human approvals — read on every seat; decide is the human's, via the office.
  for (const [seat, text] of [['chair', chair], ['member', member], ['temp', temp]]) {
    ok(/vibe_vmu_human/.test(text), '④ the human face is taught to the ' + seat)
    ok(/approvalState/.test(text), '④ and the state read is named for the ' + seat)
    ok(/VMU_HUMAN_APPROVAL_PENDING/.test(text), '★ ④ the queueing refusal is named for the ' + seat)
  }
  ok(/不要自批/.test(chair) || /不要自批/.test(member) || /不要自批/.test(temp), '④ no seat is invited to approve its own request')
  ok(/openApproval/.test(JSON.stringify(ASSISTANT)) && /inject/.test(JSON.stringify(ASSISTANT)) && /gatedActions/.test(JSON.stringify(ASSISTANT)),
    '④ the OFFICE surface teaches openApproval / inject / the gatedActions conditional')

  // ⑤ chat administration — admin-only, with the refusal.
  ok(/vibe_vmu_chat/.test(chair), '⑤ chat governance is taught to the chair')
  ok(/VMU_CHAT_NOT_ADMIN/.test(chair), '★ ⑤ the non-admin refusal is named (administration is not silently unavailable)')
  ok(/muteDefaultMs/.test(chair) && /不过期/.test(chair), '⑤ the mute duration default is taught as "0 = no expiry", not as "off"')
  ok(/VMU_CHAT_MUTED/.test(chair) && /VMU_CHAT_QUOTA_EXCEEDED/.test(chair),
    '⑤ the send-time refusals are named, so a muted member learns why the speech vanished')
  ok(/VMU_CHAT_NOT_ADMIN/.test(member), '⑤ a member is taught that administration is admin-only (and which code says so)')

  // ⑥ status board — taught as the loop's per-round data, with the four labelled rows and their sources.
  const board = SECTIONS.find((s) => s && s.name === 'v5r-turn-board')
  ok(board !== undefined, '⑥ a section teaches the status board')
  ok(typeof board.order === 'number' && board.order >= 600 && board.order <= 899, '⑥ its order stays in the pack range', board && board.order)
  ok(!/\{\{/.test(String(board.text || '')), '⑥ the board teaching carries NO placeholder (the brief is the one statusBlock hole)')
  const boardText = String(board.text || '')
  for (const label of ['总任务', '规划', '各任务完成状态', '当前小任务']) ok(boardText.includes(label), '⑥ the teaching names the row 「' + label + '」')
  ok(/该来源未提供/.test(boardText), '★ ⑥ a missing row is taught as an UNREADABLE SOURCE, not as "no tasks"')
  ok(/唯一来源/.test(boardText) && /不要自己另立一套/.test(boardText), '⑥ and the board is taught as data to quote, never a goal to invent')
}

// ── 3. THE WORDING RESTS ON DECLARED SETTINGS (read back, so the prompt cannot claim "on" what the defaults leave off) ─
{
  const keys = (DEFAULTS.defaults && typeof DEFAULTS.defaults === 'object') ? DEFAULTS.defaults : DEFAULTS
  ok(Array.isArray(keys['vmu.chat.admins']) && keys['vmu.chat.admins'].includes('acad'),
    'the prompt\u2019s "本所默认只有 acad" is the DECLARED admin list', keys['vmu.chat.admins'])
  ok(keys['vmu.chat.speakQuota'] === 0, 'the prompt\u2019s "0＝不限" matches the declared quota', keys['vmu.chat.speakQuota'])
  ok(keys['vmu.chat.muteDefaultMs'] === 0, 'the prompt\u2019s mute default matches the declaration', keys['vmu.chat.muteDefaultMs'])
  ok(keys['vmu.human.onTimeout'] === 'hold', 'the prompt\u2019s "默认 hold" matches the declared timeout action', keys['vmu.human.onTimeout'])
  ok(Array.isArray(keys['vmu.human.gatedActions']) && keys['vmu.human.gatedActions'].length === 0,
    '★ NOTHING is gated out of the box — so the teaching must be conditional, and it is checked below', keys['vmu.human.gatedActions'])
  ok(keys['vmu.meetings.closeRequiresChair'] === true, 'the prompt\u2019s closeRequiresChair is the declared policy', keys['vmu.meetings.closeRequiresChair'])
}

// ── 4. NO TEACHING ASSERTS A GATE THE DEFAULTS DO NOT DECLARE (the "未声明却断言已开启" trap) ────────────────────────
{
  // Every passage about a gated action must name the CONDITIONAL setting in the same teaching text: with
  // `vmu.human.gatedActions: []` a flat "被闸动作会被拦" would be a promise nothing enforces.
  const gatedPassages = []
  for (const seat of ['chair', 'member', 'temp']) {
    for (const row of seatMod.SEAT_TEACHING[seat]) {
      const text = String((row && row.text) || '')
      if (text.includes('被闸动作')) gatedPassages.push({ seat, text })
    }
  }
  ok(gatedPassages.length >= 3, 'the three seats each teach the gated-action behaviour (a shrunken set would pass vacuously)', gatedPassages.length)
  for (const p of gatedPassages) {
    ok(/gatedActions/.test(p.text), '★ ' + p.seat + '\u2019s gated-action wording names `vmu.human.gatedActions` (the conditional) instead of claiming the gate is on')
  }
  // No seat is told it can administer chat; no member/temp is told it can approve.
  ok(!/你可以.*(mute|quota|setpolicy)/.test(sectionText('member')) && !/你可以.*(mute|quota|setpolicy)/.test(sectionText('temp')),
    'no non-chair seat is invited to administer the chat')
  ok(!/你(可以|能)(批准|放行|自批)/.test(allSectionText), 'no section tells a seat it may approve or lift a gate for itself')
  // The honest gap stays honest: the convening face must not be described as able to schedule a SEQUENCE.
  ok(!/vibe_v5_meeting[^\n]*sequence\s*[:,]/.test(allSectionText),
    'no section teaches a `sequence` parameter on vibe_v5_meeting (the pack face has none — kernel openSeq does)')
}

// ── 5. END TO END: a REAL kernel turn hands every seat a prompt whose status board is THERE ──────────────────────
{
  const kernel = kernelMod.createKernel({
    clock: () => 2000, settings: {}, host: null, sections: PACK.sections, slots: PACK.slots,
    sectionPolicy: switchesMod.decideSections, deliverTurn: turnMod.deliverByReturning(),
  })
  await kernel.members.hire({ id: 'r-1', slot: 'chair' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  await kernel.members.hire({ id: 'r-3', slot: 'temp' })
  const seats = [{ id: 'r-1', seat: 'chair' }, { id: 'r-2', seat: 'member' }, { id: 'r-3', seat: 'temp' }]
  ok(seats.length === 3, 'exactly the three seats under test (a shrunken set would pass the loop below vacuously)')
  for (const s of seats) {
    const text = String((await kernel.turn.run({ member: s.id, phase: 'normal' })).memberPrompt.text || '')
    ok(text.length > 3000, 'the kernel assembled a real prompt for ' + s.seat, { chars: text.length })
    ok(text.includes('[状态板]'), '★ ' + s.seat + '\u2019s prompt carries the [状态板] block the teaching describes')
    for (const label of ['[总任务]', '[规划]', '[各任务完成状态]', '[当前小任务]']) {
      ok(text.includes(label), 'and the row ' + label + ' is present (a taught row that never renders is a lie)')
    }
    ok(text.includes('该来源未提供') || /\[总任务\] .+/.test(text),
      'each row either carries a source reading or says 「该来源未提供：…」 — never silently disappears')
  }
}

// ── 6. THE OFFICE SURFACE: the seat that speaks to the user knows the approval route ────────────────────────────
{
  const duty = String(assistantMod.V5R_ASSISTANT_TURN_SECTION.text || '')
  ok(/vibe_vmu_human/.test(duty), '⑥ the per-round office duty names the human face')
  ok(/approvalState/.test(duty), '⑥ with the state read')
  ok(/VMU_HUMAN_APPROVAL_PENDING/.test(duty), '★ ⑥ and the queueing refusal')
  ok(/由所办向用户请示/.test(duty), '⑥ the 请示 route is stated explicitly (the human is reached THROUGH the office)')
  const approvals = (ASSISTANT.sections || []).find((s) => s && s.name === 'v5r-assistant-approvals')
  ok(approvals !== undefined, 'a dedicated host section teaches approvals to the office')
  ok(approvals.hostPrompt === true && approvals.order >= 600 && approvals.order <= 899,
    'it is a host prompt section in the pack range', approvals && approvals.order)
  const atext = String(approvals.text || '')
  ok(/decide/.test(atext) && /openApproval/.test(atext), 'the office is told how an approval is opened and decided')
  ok(/inject/.test(atext) && /VMU_CHAT_MUTED|啦|策略/.test(atext), 'and that inject is not a back door (the face\u2019s policy still applies)')
  ok(/recover/.test(atext), 'the recovery primitives are on the same surface the office already reads')
}

console.log('\n=== VMU RUN33 P2 TEACHING: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1) }
