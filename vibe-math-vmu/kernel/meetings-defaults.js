// vibe-math-vmu/kernel/meetings-defaults.js — the meetings face's PURE DATA tables, split out of meetings.js
// (round 21) so that file stays inside the DECIDED 1200-line limit (docs/02). Nothing here reads state or closes over
// the factory scope: these are constants and one lookup, which is exactly why they are safe to move. The two names that
// were exported from meetings.js are RE-EXPORTED there, so consumers keep the same import path.
export const WIRED_KEYS = Object.freeze([
  'vmu.meetings.typeCatalog', 'vmu.meetings.tier', 'vmu.meetings.allowLight', 'vmu.meetings.attendanceMode', 'vmu.meetings.liveCap',
  'vmu.meetings.quorumMin', 'vmu.meetings.quorumRatio', 'vmu.meetings.quorumLossPolicy', 'vmu.meetings.quorumRecountMs',
  'vmu.meetings.quorumCap',
  'vmu.meetings.leaveApprover',
  'vmu.meetings.unansweredInDenominator', 'vmu.meetings.emergencyQuorumRatio', 'vmu.meetings.emergencyKinds',
  'vmu.meetings.chairNeutral', 'vmu.meetings.chairTransferAudit', 'vmu.meetings.committeeMax', 'vmu.meetings.committeeReportRequired',
  'vmu.meetings.budgetTurns', 'vmu.meetings.budgetTokens', 'vmu.meetings.budgetWallMs', 'vmu.meetings.budgetOnExceed',
  // ★ PHASE 12 D1: 预约时间 + 到点人未齐的等待阶段（能力在内核，值是设置）。三个键一起接线：
  // scheduleAllowed 是能力闸，waitOnDueMs 是等待时长，waitDecisionRequiresChair 是「超时由院士自决」的权轨。
  'vmu.meetings.scheduleAllowed', 'vmu.meetings.waitOnDueMs', 'vmu.meetings.waitDecisionRequiresChair', 'vmu.meetings.waitForAll',
  // ★ PHASE 12 D1/D2: 主席权轨三件（召开/关闭/延长）——它们改了行为，所以必须出现在 WIRED 里，
  // 否则 `status()` 会把"已接线的键"报成"声明了没接线"，那就是反向的假绿。
  'vmu.meetings.conveneRequiresChair', 'vmu.meetings.closeRequiresChair', 'vmu.meetings.extendRequiresChair', 'vmu.meetings.extendCeilingMs',
  'vmu.meetings.hardLimitMs',
  'vmu.meetings.speechDefaultMs', 'vmu.meetings.speechMaxMs', 'vmu.meetings.speechExtendMs', 'vmu.meetings.speechExtendMax', 'vmu.meetings.speechQuotaPerMember',
  'vmu.meetings.interruptAllow', 'vmu.meetings.interruptQuota', 'vmu.meetings.orderMode',
  'vmu.meetings.lateAfterMs', 'vmu.meetings.leaveEarlyPolicy', 'vmu.meetings.materialsRequired',
  'vmu.meetings.minutesDetail', 'vmu.meetings.minutesIncludeRefused', 'vmu.meetings.minutesActionsRequired',
  'vmu.meetings.minutesRetentionMs', 'vmu.meetings.confirmPreviousMinutes',
  'vmu.meetings.appealDeadlineMs', 'vmu.meetings.appealReasonRequired', 'vmu.meetings.appealScope',
  'vmu.meetings.disciplineWarnMax', 'vmu.meetings.disciplineMuteMs', 'vmu.meetings.disciplineExpelAllowed',
  'vmu.meetings.recessMaxMs', 'vmu.meetings.recessResumeRequiresMotion',
  'vmu.meetings.verdictMaxRounds',
  'vmu.meetings.eligibleSeats',
  'vmu.meetings.confidentialityDefault', 'vmu.meetings.confidentialityQuotePolicy',
  'vmu.meetings.verbatimEnabled', 'vmu.meetings.verbatimRetentionMs', 'vmu.meetings.wakeFailurePolicy',
  'vmu.meetings.wakeRetries',
])

/** Why a key that IS declared would not be wired (used only for keys absent from WIRED_KEYS). */
export const UNWIRED_REASONS = Object.freeze({
  'vmu.meetings': '尚未接线：本层只覆盖 08 卷声明的 47 条会议旋钮；新声明的键需要一个策略语义（默认原因）',
})
export const reasonFor = (key) => UNWIRED_REASONS[key.split('.').slice(0, 2).join('.')] || '尚未接线：该键需要一个尚未存在的子系统或策略语义'

export const DEFAULTS = Object.freeze({
  'vmu.meetings.typeCatalog': [], 'vmu.meetings.attendanceMode': 'roster', 'vmu.meetings.liveCap': 0,
  'vmu.meetings.quorumMin': 0, 'vmu.meetings.quorumRatio': 0, 'vmu.meetings.quorumLossPolicy': 'suspend', 'vmu.meetings.quorumRecountMs': 0,
  'vmu.meetings.quorumCap': 3,
  'vmu.meetings.eligibleSeats': [],
  'vmu.meetings.unansweredInDenominator': false, 'vmu.meetings.emergencyQuorumRatio': 0, 'vmu.meetings.emergencyKinds': [],
  'vmu.meetings.chairNeutral': false, 'vmu.meetings.chairTransferAudit': false, 'vmu.meetings.committeeMax': 0, 'vmu.meetings.committeeReportRequired': false,
  'vmu.meetings.budgetTurns': 0, 'vmu.meetings.budgetTokens': 0, 'vmu.meetings.budgetWallMs': 0, 'vmu.meetings.budgetOnExceed': 'refuse',
  'vmu.meetings.hardLimitMs': 1800000,
  // ★ PHASE 12: 主席权轨 + 预约/等待的声明默认值。★ 这里写的是"模块源码里的默认值"，不是策略：
  // 真机构的策略（本所只有院士能召开/关闭）在 pack 的 defaults.json 里声明。写成 false/true 而不是省略，
  // 是因为 `generate-wired-schema --check` 要从源码恢复默认值 —— 省略会让它报 null 而失配。
  'vmu.meetings.conveneRequiresChair': false, 'vmu.meetings.closeRequiresChair': false,
  'vmu.meetings.extendRequiresChair': true, 'vmu.meetings.extendCeilingMs': 14400000,
  'vmu.meetings.scheduleAllowed': true, 'vmu.meetings.waitOnDueMs': 300000, 'vmu.meetings.waitDecisionRequiresChair': true, 'vmu.meetings.waitForAll': true,
  'vmu.meetings.speechDefaultMs': 0, 'vmu.meetings.speechMaxMs': 0, 'vmu.meetings.speechExtendMs': 0, 'vmu.meetings.speechExtendMax': 0, 'vmu.meetings.speechQuotaPerMember': 0,
  'vmu.meetings.interruptAllow': true, 'vmu.meetings.interruptQuota': 0, 'vmu.meetings.orderMode': 'fifo',
  'vmu.meetings.lateAfterMs': 0, 'vmu.meetings.leaveEarlyPolicy': 'allow', 'vmu.meetings.materialsRequired': false,
  'vmu.meetings.minutesDetail': 'brief', 'vmu.meetings.minutesIncludeRefused': true, 'vmu.meetings.minutesActionsRequired': false,
  'vmu.meetings.minutesRetentionMs': 0, 'vmu.meetings.confirmPreviousMinutes': false,
  'vmu.meetings.appealDeadlineMs': 0, 'vmu.meetings.appealReasonRequired': true, 'vmu.meetings.appealScope': 'all',
  'vmu.meetings.disciplineWarnMax': 0, 'vmu.meetings.disciplineMuteMs': 0, 'vmu.meetings.disciplineExpelAllowed': true,
  'vmu.meetings.recessMaxMs': 0, 'vmu.meetings.recessResumeRequiresMotion': false,
  'vmu.meetings.verdictMaxRounds': 3,
  'vmu.meetings.confidentialityDefault': 'internal', 'vmu.meetings.confidentialityQuotePolicy': 'allow',
  'vmu.meetings.verbatimEnabled': true, 'vmu.meetings.verbatimRetentionMs': 0, 'vmu.meetings.wakeFailurePolicy': 'refuse',
  // ROUND 198: the retry bound's declared default.
  'vmu.meetings.wakeRetries': 5,
})


