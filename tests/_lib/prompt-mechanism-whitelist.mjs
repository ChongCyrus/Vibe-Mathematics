// tests/_lib/prompt-mechanism-whitelist.mjs — F5「教的东西必须是真机制」门禁的**已知分歧白名单**。
//
// WHY A WHITELIST AT ALL. The gate `tests/vmu-prompt-mechanism-parity.test.mjs` asserts that every claim the REAL
// assembled member prompt teaches about the reply mechanism still matches what the kernel actually does. The prompt
// text lives in `vibe-math-vmu/packs/v5r/prompts/**` (the pack lane's write scope, not this lane's), so a gate that
// simply went red would block the whole tree on someone else's file. The whitelist is therefore the honest middle
// position: **the defect stays visible and named, with an owner and a removal condition**, and the gate turns red the
// moment a NEW un-named divergence appears.
//
// SHRINK-ONLY (enforced by the gate, twice): (1) every entry below must still be matched by the assembled text —
// an entry whose taught text has been fixed has to be DELETED, so the list cannot rot; (2) an entry cannot be used
// as a blanket excuse — coverage is per taught substring, and a paragraph is only covered by an entry whose
// `contains` really appears in it.
//
// RULES FOR ADDING AN ENTRY (the gate checks the shape, a reviewer checks the honesty):
//   · `family`    — one of the families declared in the gate; an unknown family is a red.
//   · `contains`  — a STABLE substring of the taught text (no line numbers, no whitespace-sensitive runs).
//   · `owner`     — the lane that must fix it (the prompt text owner, not this lane).
//   · `reason`    — the measured mechanism fact that makes the teaching wrong, with `file:line` and numbers.
//   · `expiry`    — the concrete condition under which the entry is deleted (not a date alone; "when X is fixed").
//   · `reviewed`  — the round in which the mechanism was last measured.
//
// Measured in round 16 (see `_handoff/vmu/verify-round16-report.md`).

export const PROMPT_MECHANISM_DIVERGENCES = Object.freeze([
  Object.freeze({
    family: 'unknown-field-refusal',
    contains: '写了会被判 `VMU_TURN_UNKNOWN_FIELD`',
    owner: 'vmu-pack · packs/v5r/prompts/v5r-core.js:526',
    reason: '教的是无条件拒绝，实测默认 vmu.turn.unknownReplyFieldMode=ignore-named（settings/schema.js:211）⇒ kernel/turn/index.js:1169-1177 不拒、只记 ignoredFields；只有 refuse 模式才抛 VMU_TURN_UNKNOWN_FIELD。',
    expiry: '当 v5r-core.js 该句点明模式（例如「仅在 vmu.turn.unknownReplyFieldMode=refuse 时才整轮拒」）后删除本条',
    reviewed: 'R16',
  }),
  Object.freeze({
    family: 'fixture-vocabulary',
    contains: '本夹具的收敛口径',
    owner: 'vmu-pack · packs/v5r/prompts/v5r-core.js:526',
    reason: '生产提示词把「测试夹具的收敛口径」当成对成员的说明：成员不是夹具，装配出的 22k 字符提示词里出现测试设施词汇，属于把验证脚手架泄漏进产品指令。',
    expiry: '当该句改为产品语言（只说回执契约，不提夹具）后删除本条',
    reviewed: 'R16',
  }),
  Object.freeze({
    family: 'fixture-vocabulary',
    contains: '本夹具要求用工具做',
    owner: 'vmu-pack · packs/v5r/prompts/v5r-core.js:526',
    reason: '同段第二处夹具词汇；且它教的「用工具做 meeting_hand」与 v5r-blocks-a.js:585/622/652 教的「回执里写 "meeting_hand": true」互相矛盾。',
    expiry: '当该段只保留一种产品口径（工具面 or 回执字段）且不再提夹具后删除本条',
    reviewed: 'R16',
  }),
  Object.freeze({
    family: 'reply-field-catalogue',
    contains: '顶层只允许这四个字段',
    owner: 'vmu-pack · packs/v5r/prompts/v5r-core.js:526',
    reason: '实测 REPLY_FIELDS=29（FIELD_OWNERS 22 + RECORDED_FIELDS 7，kernel/turn/index.js:50-82/178-181/208）⇒「只允许四个」把 25 个真被接受的名字说成非法；成员按此写回执会误删合法字段。',
    expiry: '当该句改为「这四个字段是本夹具的收敛口径，内核另接受 N 个已登记字段」并给出可查清单后删除本条',
    reviewed: 'R16',
  }),
  Object.freeze({
    family: 'meeting-field-in-reply',
    contains: '"meeting_hand": true',
    owner: 'vmu-pack · packs/v5r/prompts/v5r-blocks-a.js:585/622/652、v5r-blocks-b.js:699',
    reason: '实测 plan({meeting_hand:true}) ⇒ notApplicable VMU_TURN_FIELD_NOT_APPLICABLE（kernel/turn/index.js:72/1213）：回执无法携带会议 id，框架具名拒；可用形状是 vibe_vmu_meeting { action:"hand", id }（同文件 :44-48 hint）。教成 JSON 回执字段是假 affordance。',
    expiry: '当四处提示词改为教 vibe_vmu_meeting 工具面（或至少注明回执字段不被接受）后删除本条',
    reviewed: 'R16',
  }),
  Object.freeze({
    family: 'meeting-field-in-reply',
    contains: '"meeting_invite": {"member"',
    owner: 'vmu-pack · packs/v5r/prompts/v5r-blocks-a.js、v5r-blocks-b.js:700',
    reason: '实测 plan({meeting_invite:{member}}) ⇒ notApplicable VMU_TURN_FIELD_NOT_APPLICABLE（kernel/turn/index.js:73/1213）；同理只能走 vibe_vmu_meeting { action:"invite", id }。',
    expiry: '当提示词改为教工具面后删除本条',
    reviewed: 'R16',
  }),
])

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PART 2 — the TAUGHT TOOL PARAMETER ledger, read by `tests/audit-prompt-tool-params.test.mjs`.
//
// A different defect from the families above, and a different detector: the passages above are WRONG ABOUT A MECHANISM,
// while an entry here is a taught CALL whose key is not in the tool's declared schema (`tool_name({k:…})` where
// `k ∉ parameters.properties`). A member that follows such a passage gets a named refusal — the same class of harm, one
// layer down: the prompt teaches a shape the tool does not accept.
//
// WHY A LEDGER AND NOT A MASS EDIT: the offending text is either GENERATED (the fixture corpus teaches
// `vibe_v5_tool_help({"tool":"工具名称"})`) or transcribed in the charter; editing either is out of the pack lane's
// honest reach (same reasoning as PART 1). So the divergence is NAMED here with an owner, the measured refusal, and a
// concrete removal condition — and the correction section `v5r-fix-tool-help` (packs/v5r/prompts/v5r-corrections.js,
// order 891) tells the member which of the two to believe. The gate keeps the ledger SHRINK-ONLY by pinning its exact
// length below: adding an entry means raising `PROMPT_PARAM_SHRINK_CAP`, which cannot happen without a reviewer seeing
// "the list grew" in the diff.
//
// RULES FOR AN ENTRY: `tool` and `key` identify the taught call; `contains` is a stable substring of the taught call
// (so coverage is per occurrence, not per tool); `owner` names the text's owner with `file:line`; `reason` quotes the
// measured refusal and the declaring lines; `expiry` is the concrete condition under which the entry is deleted.

/**
 * The HARD CEILING on this ledger's length. Lower it whenever an entry is deleted; **never raise it silently** — a raise is
 * the signal that a new taught-but-undeclared parameter was accepted, which needs its own ruling.
 */
export const PROMPT_PARAM_SHRINK_CAP = 1

export const PROMPT_PARAM_DIVERGENCES = Object.freeze([
  Object.freeze({
    tool: 'vibe_v5_tool_help',
    key: 'tool',
    contains: 'vibe_v5_tool_help({"tool"',
    owner: 'vmu-pack · packs/v5r/prompts/v5r-blocks-b.js:235 (段 v5r-reply-compact) + 46 处 GENERATED 副本（v5r-prompts.js）',
    reason: '实测参数表只有 member（packs/v5r/tools.js:243-265，注册 :1414-1418 声明 member 必填）：照教法只传 {"tool":…} ⇒ VMU_INVALID_ARGUMENT: tool_help needs the member id。该句仍在产品提示词里，由更正段 v5r-fix-tool-help（order 891）说明「没有 tool 参数」；本条记的是旧教法仍在。',
    expiry: '当 v5r-blocks-b.js:235 那句不再教 tool 参数（改传 member 或删除）后删除本条，并把 PROMPT_PARAM_SHRINK_CAP 降到 0',
    reviewed: 'R17-F5',
  }),
])
