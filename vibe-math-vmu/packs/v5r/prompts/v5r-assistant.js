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
    '【汇报纪律：本所「{{ setting:vmu.turn.instituteName }}」】',
    '· **主动汇报是成员义务**：把你这一轮的进展、发现与卡点写进自己的 Progress/，并把关键结论在群聊里说出来——所办与领头人靠这些信息对外汇报与统筹。',
    '· **对外汇报的出口是所办**：人类只与所办对话；你要对外说什么，先说给所内（群聊／Progress/），由所办原样转达。不要把没经所内确认的东西直接说成结论。',
    '· **参数配置入口属于所办**：`vibe_vmu_report` 的参数面只改 `vmu.report.params` 声明的域，且只有 `vmu.report.whoMayChange` 声明的人能改；成员可以**查看**汇报声明与留痕（action=status/declarations/trace），但改不动它们。',
    '· **汇报不等于结论**：一份汇报——无论自动触发还是手动发出——都不改变任何对象的真值；任何对象要进 Verified/ 仍须满足既定票数规则。',
  ].join('\n'),
})

/** The sections this module contributes to the pack manifest (the per-round / turn channel). */
export const V5R_ASSISTANT_TURN_SECTIONS = Object.freeze([V5R_ASSISTANT_TURN_SECTION])
