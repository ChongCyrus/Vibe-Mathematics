// vmu pack — the v5r ASSISTANT's per-round surface (goal 6, ruling D-09).
//
// WHY THIS IS A MODULE AND NOT DATA. The pack's assistant surface has TWO readers, and they are not the same reader:
//
//   · `./assistant.json` is read by the PLUGIN, by folder name, before the kernel exists - which is the only way a
//     pack's text can reach the HOST's system prompt (the session that actually talks to the human, i.e. v5r's
//     `office`). The plugin never learns which pack it is reading, so that text must be DATA.
//   · THIS MODULE is part of the LOADED MANIFEST (`v5r-core.js` re-exports its sections), so it is registered into the
//     prompt pipeline by the pack loader when the pack is applied - the per-round channel, where each member is told
//     what the institute expects of it.
//
// Both are hand-written and neither carries the other's text, so there is no second copy to drift. The module reads a
// live setting (`{{ setting:vmu.turn.instituteName }}`), which is what makes it a RUNTIME section rather than another
// recording: the v5r prompt CORPUS stays exactly where it is, as the contrast baseline it is.
//
// WHAT IT SAYS AND WHY. v5r's own persona carried this duty as prose ("主动向院士汇报", charter section [二·7]) and the
// framework had no mechanism behind it. Now that `kernel/report.js` provides one, the members are told three things:
// reporting upward is their obligation, the OUTWARD report has exactly one door (the office), and the parameter face
// belongs to the office - a member may READ it and may not change it.
export const V5R_ASSISTANT_TURN_SECTION = Object.freeze({
  name: 'v5r-report-duty',
  order: 608,
  range: 'pack',
  source: 'v5r-assistant:authored',
  // The pipeline owns the whitelist (kernel/prompt/index.js VARIABLE_WHITELIST): `setting:` takes an argument, and the
  // declared vars are the ones the turn loop really supplies.
  vars: Object.freeze(['setting:', 'phase', 'roleLabel']),
  text: [
        "【汇报纪律：本所「{{ setting:vmu.turn.instituteName }}」】",
        "· **主动汇报是成员义务**：进展、发现与卡点写进自己的 Progress/，关键结论在群聊里说出来——所办与领头人靠这些统筹与对外——**自动汇报是被声明的**（`vmu.report.enabled` 与触发条件写在部署配置里，不靠自觉）。",
        "· **对外出口只有所办**：人类只与所办对话；要对外说什么先说给所内，由所办原样转达。",
        "· **参数面属于所办**：`vibe_vmu_report` 只改 `vmu.report.params` 声明的域，且只有 `vmu.report.whoMayChange` 声明的人能改；成员可查看（action=status/declarations/trace），改不动。",
        "· **特权经请示（由所办向用户请示）**：扩编、删档、跨库改动、对外承诺等闸门不要绕过；`vibe_vmu_human` 查是否在等批（`approvalState`／`queue`），`vmu.human.gatedActions` 声明的动作获批前**不执行**（`VMU_HUMAN_APPROVAL_PENDING`，超时 hold）。",
        "· **「有进展就唤起所办」不会自己发生**：`vmu.report.enabled` 默认 false、`vmu.report.reports` 默认空；触发只有 `event`／`period`／`threshold`，报告只提示不做决定（`drives:false`）。",
        "· **改参数是所办的事**：入口是 `vibe_v5_set`（一次一个**已声明**的键）与 `vibe_vmu_report` 的参数面——**改参数、控研究所是所办的事**，不是席位的事。",
        "· **汇报不等于结论**：汇报不改变任何对象的真值；进 Verified/ 仍须满足既定票数规则。",
  ].join('\n'),
})

/**
 * ROUND 225 — THE SEAT SIDE OF THE SAME LINE (the office side lives in `./assistant.json`).
 *
 * MEASURED PAIN: the office read its prompt and then DID the members' work — writing cards, speaking, voting and even
 * writing papers under `member:"<seat>"` — while the seats themselves were never given a round. The office side of the
 * fix is a rewrite of `v5r-assistant-identity` (it is the ORCHESTRATOR: start / hire / convene-arrange / drive rounds /
 * aggregate / outward, and it must never act under a seat's name). This section is the other half, told to the SEAT:
 * the academic act belongs to the seat and must be finished in the seat's own round, because the office does not do it.
 *
 * WHY A SECTION AND NOT MORE PROSE IN THE CHARTER: it must appear in EVERY member round (founding / normal / verify /
 * meeting / paper / resume) and it must be one text, not three role variants that can drift. `shared` does that.
 */
export const V5R_SEAT_ACT_BOUNDARY_SECTION = Object.freeze({
  name: 'v5r-seat-act-boundary',
  order: 609,
  range: 'pack',
  source: 'v5r-assistant:authored',
  vars: Object.freeze(['roleLabel', 'phase']),
  text: [
    '【动作边界：你的动作由你本回合做完】',
    '· 你是**执行者**：写卡、发言、投票、签到、写论文、下结论只能由**你自己在本回合**做完，别请所办代办，也别把「已交给所办」当完成（所办只做编排，不代做学术动作）。',
    '· 动作记在别人名下按事实报告；没做完写进 progress。',
  ].join('\n'),
})

/** The sections this module contributes to the pack manifest (the per-round / turn channel). */
export const V5R_ASSISTANT_TURN_SECTIONS = Object.freeze([V5R_ASSISTANT_TURN_SECTION, V5R_SEAT_ACT_BOUNDARY_SECTION])
