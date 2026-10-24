/**
 * v5r CORRECTION SECTIONS — the pack's own "this wording is obsolete; the mechanism is X" ledger.
 *
 * WHY THIS FILE EXISTS (F5, Lead ruling this round). The F5 audit found passages whose TEACHING does not match the
 * mechanism: `vibe_v5_tool_help({"tool":…})` (the tool takes `{member}` only), `end_verify`/`formal_proof` (neither
 * name exists), "hand-write a ```json fence every round" (the structured report channel is `vibe_vmu_turn {op:"reply"}`;
 * the fence is the compatibility path), and "m votes" read as a counting rule (it is the QUORUM size; agreement is
 * unanimity via `defaultTally`). The three honest repair routes were:
 *   (a) edit the ORIGINAL `vibe-math-v5r/vibe-math-v5r.js` — the fidelity baseline, and not in any lane's write scope;
 *   (b) edit the GENERATED `v5r-prompts.js`/`v5r-persona.js` — red by construction (`vmu-pack-prompts` byte-compares,
 *       `regen-all --check` overwrites), and the corpus itself is a CAPTURE that the full sweep rewrites;
 *   (c) add a NAMED CORRECTION that supersedes the old wording — what this file does, and what the Lead chose.
 *
 * WHY NOT A `KNOWN_CORRECTIONS` EXEMPTION LIST: that would turn "we deliberately diverge from the baseline" into a
 * permanent, invisible exemption — the same smell as a mechanism with no consumer (red line ④). A correction SECTION is
 * text that the member actually reads, it is measured by a gate of its own, and it can be deleted the day the source
 * wording is fixed. The old text stays where it is (it is evidence of what the original taught); the correction says
 * plainly which of the two to believe, and it sits AFTER every section it corrects (order ≥ 890, after the highest declared section at 820 and inside the pack band [600,899]).
 *
 * HOUSE RULES this file follows:
 *   · each section ≤ 400 characters (a correction that needs a page is a rewrite, and rewrites belong to the source);
 *   · each names BOTH the old wording and the real mechanism (`file:line` for the reader, prose for the member);
 *   · no second copy of the corrected passage — the correction points at the mechanism, it does not restate the old text;
 *   · `source` marks them so a reader can tell authored corrections from transcribed charter and from generated corpus.
 *
 * `tests/vmu-prompt-corrections.test.mjs` asserts: every declared correction exists, each names old + new, each sits at order ≥ 800 and
 * strictly after the highest generated section, each is ≤ 400 chars, and a REAL assembly contains every one.
 */

/** The oldest order a correction may use: generated fixtures occupy 600 + i and the authored/paper/assistant sections run
 *  up to 820 (`v5r-founding-direction`), and a pack may only claim `ORDER_RANGES.pack = [600, 899]`
 *  (kernel/prompt/index.js:24-30) — 900+ is the kernel-reserved `override` band. So 890 is the last free pack band that
 *  is still after EVERYTHING the pack declares. */
export const V5R_CORRECTION_BASE_ORDER = 890

/** The maximum characters one correction may carry (see the house rule above). */
export const V5R_CORRECTION_MAX_CHARS = 400

export const V5R_CORRECTION_SECTIONS = Object.freeze([
  Object.freeze({
    name: 'v5r-fix-json-reply',
    order: 890,
    range: 'pack',
    source: 'v5r-correction:reply-shape',
    // Old wording: "结束时请只输出一个 JSON 对象（放在 ```json 围栏内）" (the reply-spec/corpus passages).
    // Real mechanism: kernel/turn/index.js:1005-1063 supplyStructuredReply + tools/turn.js op:'reply';
    //   tools/turn.js:88-121 refuses report+reply in one call; kernel/turn/index.js:228-260 mergeReplyChannels.
    text: [
      '【更正·回复形状】旧措辞「每轮手写一段 json 代码围栏」只适用于子代理交付：回合由 vibe_vmu_turn 驱动时，用 {op:"reply", report:{…}, reply_for?} 上报（没有待回回合 ⇒ VMU_TURN_NO_PENDING_MEMBER）；围栏仍是兼容路径（缺失 ⇒ VMU_TURN_NO_FENCE）。两条通道可合并（source:"tool+text"），同字段不同值 ⇒ VMU_TURN_REPLY_CONFLICT；一次调用同时给 report 与 reply 会被具名拒。会议里的举手/邀请请用 vibe_vmu_meeting——回复字段 meeting_hand 与 meeting_invite 没有可用形状（notApplicable）。',
    ].join('\n'),
  }),
  Object.freeze({
    name: 'v5r-fix-tool-help',
    order: 891,
    range: 'pack',
    source: 'v5r-correction:tool-help-signature',
    // Old wording: `vibe_v5_tool_help({"tool":"工具名称"})` (v5r-blocks-b.js:235 and 46 generated fixtures).
    // Real mechanism: packs/v5r/tools.js:243-265 — only `member`; the answer is kernel.toolsView for that seat.
    text: [
      '【更正·工具查询】vibe_v5_tool_help 的真实签名只有 {member}（必填；回答该席位「现在真能调用」的工具表），没有 tool 参数。只传 {"tool":"…"} ⇒ VMU_INVALID_ARGUMENT: tool_help needs the member id。要了解某工具的用法，读它在工具表里的 description；不要臆造参数名。',
    ].join('\n'),
  }),
  Object.freeze({
    name: 'v5r-fix-formal',
    order: 892,
    range: 'pack',
    source: 'v5r-correction:formal-fields',
    // Old wording: rule 10 in v5r-charter-hard-rules ("end_verify 的 formal_proof", v5r-blocks-a.js:196) and the
    // persona capture. Real mechanism: kernel/turn/index.js:60 FIELD_OWNERS.formal -> vmu.formal op 'check'
    // (kernel/formal.js:109-176, requires statement + proof); meetings open with kind 'verify-request'.
    text: [
      '【更正·形式化】旧说法 end_verify 与 formal_proof 在框架里不存在（旧措辞作废）。正式结论写进回合字段 formal:{decision,file,note}（dispatch 到 vmu.formal 的 check，需要 statement 与 proof）；需要集体裁决就开一场会议（vibe_v5_meeting，kind 可取 verify-request）。旧说法里「登记即直接落进 Verified/」也不对：落盘唯一写入口是 vibe_v5_verified_promote（需 warrant），别的工具不行。见到旧名按 formal 处理，不要调用 end_verify。',
    ].join('\n'),
  }),
  Object.freeze({
    name: 'v5r-fix-m-vote',
    order: 893,
    range: 'pack',
    source: 'v5r-correction:m-vote',
    // Old wording: "按 m 票布尔一致决定" wherever m reads like a count. Real mechanism:
    // settings/schema.js:145 quorumRule (m-unanimous|all-unanimous) + :146 quorumCap doc (m = min(cap, voters));
    // kernel/ballot.js defaultTally — not-every-voter => undecided, all-for => true, all-against => false, split => undecided.
    text: [
      '【更正·m 票】旧说法「按 m 票布尔一致决定 / 凑够 m 票就通过」读错了 m。m 是法定票数（由 quorumCap 派生：m = min(所办设的上限, 有表决权人数)，0 表示不设上限），由框架自己的 quorumOf / 票箱计算并具名拒，不是另一种计票法。定论条件由 vmu.meetings.quorumRule 控制，默认 m-unanimous：kernel/ballot.js 的 defaultTally 要求全体有表决权者都投出布尔值且一致——未投满 ⇒ undecided，全 for ⇒ 通过，全 against ⇒ 否决，票分裂 ⇒ undecided。代理只需诚实投票，不必自己数票。',
    ].join('\n'),
  }),
  Object.freeze({
    name: 'v5r-fix-leader-id',
    order: 894,
    range: 'pack',
    source: 'v5r-correction:leader-id',
    // MEASURED on the full live run 2026-10-24 (_oneoff/vm-slv/full-1024-033834.jsonl): the office seated the
    // academician with vibe_vmu_control {action:"hire", slot:"chair"} and every member prompt still said
    // 「本所当前没有在册院士」, because vmu.turn.leaderId (settings/schema.js, default '') was never written and the
    // pack's leader-pair policy may only name a leader it can PROVE is on staff. The charter texts cannot change
    // (capture layer frozen by T71 parity), so the missing half is the OFFICE'S DUTY — stated here, read back by
    // vibe_v5_overview.leadership (packs/v5r/leadership.js) so it cannot fail silently.
    text: [
      '【更正·领头人】「领头人」＝`vmu.turn.leaderId`（默认空）。把人安置到 chair 席位**不等于**设置了领头人：只 hire 不写，章程会走 leaderless 版并说「本所当前没有在册院士」，那是假的。安置院士后立刻 `vibe_v5_set { key: "vmu.turn.leaderId", value: "<同一个代号>", why: "安置院士" }`；院士离开时清空。`vibe_v5_overview` 的 `leadership.code` 会具名说出当前情形（chair-seated-but-leaderId-empty 就是「席位有人但没写」）。先修数据，别改章程措辞。',
    ].join('\n'),
  }),
])

export default V5R_CORRECTION_SECTIONS
