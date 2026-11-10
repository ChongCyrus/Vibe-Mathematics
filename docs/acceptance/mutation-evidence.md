# Mutation evidence — 改坏机制 ⇒ 被点名断言必红（仓库内可重跑）

> 本文件由 `node scripts/audit/mutations/run.mjs --doc` **生成**，不要手改。
> 它把「规则被守住」的证据从 `D:/_tmp/mutbatch2/`（3 小时自清理）搬进仓库：每一条 PROVEN-RED 都能在
> 本机重跑 `node scripts/audit/mutations/run.mjs --all` 复现——复制仓库到临时目录、改坏一个机制、
> 跑指定套件、要求 manifest 点名的断言出现在失败输出里、删掉副本；工作树全程不动。

## 本次运行

- manifest 条目：43（PROVEN-RED 43）
- 总耗时：159603 ms
- 三档合计：PROVEN-RED 43 + REHEARSED-RED 47 + UNDECIDABLE 3 = 93（台账 93 条）

## 93 条三档表

| 规则 | 档 | 证据（套件 :: 断言） | 说明 |
| --- | --- | --- | --- |
| A1 | PROVEN-RED | `vmu-run128-proxy-doors.test.mjs::a member signing as office is REFUSED` | mutated ⇒ the named assertion failed (3089 ms) |
| A2 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| A3 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| A4 | PROVEN-RED | `vmu-a2a3-seats-and-bounds.test.mjs::★ 非 chair 成员 ⇒ 具名拒 VMU_NOT_PERMITTED` | mutated ⇒ the named assertion failed (3436 ms) |
| A5 | PROVEN-RED | `vmu-control.test.mjs::★★★ CRITERION 1: after hire the KERNEL roster is NON-EMPTY (the bug was ok:true with an empty roster)` | mutated ⇒ the named assertion failed (3288 ms) |
| A6 | PROVEN-RED | `vmu-meetings.test.mjs::★ A1③ 反: a TEMP seat is refused by the DECLARED seats, and the refusal names the slot and the seats` | mutated ⇒ the named assertion failed (2762 ms) |
| A7 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| B1 | PROVEN-RED | `vmu-run97-verified-gate.test.mjs::① a disproof without its ruling is refused` | mutated ⇒ the named assertion failed (4801 ms) |
| B2 | PROVEN-RED | `vmu-run236-b2-literature.test.mjs::a p=1 proposition WITH a literature reference is accepted` | mutated ⇒ the named assertion failed (2863 ms) |
| B3 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| B4 | PROVEN-RED | `vmu-b4-stale-window-setting.test.mjs::★ 0 is a LEGAL window (any age is overdue): the resolver accepts the boundary instead of treating 0 as absent` | mutated ⇒ the named assertion failed (4501 ms) |
| B5 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| B6 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C1 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C2 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C3 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C4 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C5 | PROVEN-RED | `vmu-c5-c8-card-integrity.test.mjs::★ 从读面读回来，卡体里真的有 `- 进度：…` 那一行` | mutated ⇒ the named assertion failed (3060 ms) |
| C6 | PROVEN-RED | `vmu-c5-c8-card-integrity.test.mjs::声明 complete 但没有任何登记凭据 ⇒ VMU_INVALID_ARGUMENT` | mutated ⇒ the named assertion failed (3836 ms) |
| C7 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C8 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C9 | PROVEN-RED | `vmu-v5r-tools.test.mjs::record_method writes onto the methods track (p=0 ⇒ settled, which is what the pack stance demands)` | mutated ⇒ the named assertion failed (5496 ms) |
| C10 | UNDECIDABLE | — | no Lean toolchain in this environment, so a Lean artifact cannot be produced or compiled |
| C11 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C12 | PROVEN-RED | `vmu-run135-formal-required.test.mjs::★★★ 反：off 下同一次裁定成功（zero-policy 的默认不能被闸悄悄改掉）` | mutated ⇒ the named assertion failed (4092 ms) |
| C13 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C14 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| C15 | PROVEN-RED | `vmu-run61-feedback-body.test.mjs::the stored body carries the RECOMMENDATION under its own label` | mutated ⇒ the named assertion failed (4116 ms) |
| D1 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| D2 | PROVEN-RED | `vmu-mailbox.test.mjs::an urgent flush DELIVERS the body but does NOT ack it (the inbox must still show the message)` | mutated ⇒ the named assertion failed (2237 ms) |
| D3 | PROVEN-RED | `vmu-mailbox.test.mjs::★ 反（唯一真证据）：非紧急投递物【任何字段/JSON 文本】都不含正文标记串` | mutated ⇒ the named assertion failed (2006 ms) |
| D4 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| D5 | PROVEN-RED | `vmu-panel.test.mjs::the framework wrote every ...At` | mutated ⇒ the named assertion failed (2278 ms) |
| D6 | PROVEN-RED | `vmu-panel.test.mjs::the view writes an audit row naming who saw whom` | mutated ⇒ the named assertion failed (1948 ms) |
| D7 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| D8 | PROVEN-RED | `vmu-run31-status-board.test.mjs::③b the source NAMES the ledger actually read` | mutated ⇒ the named assertion failed (4308 ms) |
| E1 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E2 | PROVEN-RED | `vmu-meeting-quorum-floor.test.mjs::R3-2. ★★★ at the due moment with a roster member absent the meeting WAITS` | mutated ⇒ the named assertion failed (2114 ms) |
| E3 | PROVEN-RED | `vmu-run125-primitive-seat-gate.test.mjs::member open refused by name` | mutated ⇒ the named assertion failed (4143 ms) |
| E4 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E5 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E6 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E7 | PROVEN-RED | `vmu-meeting-procedures-catalog.test.mjs::the planning receipt reports its own four-step skeleton (per-type, not one shared blob)` | mutated ⇒ the named assertion failed (3334 ms) |
| E8 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E9 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E10 | PROVEN-RED | `vmu-run101-meeting-bound.test.mjs::the receipt reports the CHAIR-SET bound (900000), not the deployment default` | mutated ⇒ the named assertion failed (3487 ms) |
| E11 | PROVEN-RED | `vmu-meeting-types.test.mjs::★★ the pending count READS BACK from the kernel (a declared-only sequence would be invisible here)` | mutated ⇒ the named assertion failed (4518 ms) |
| E12 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E13 | PROVEN-RED | `vmu-meeting-types.test.mjs::the six labels are the RULE's own words` | mutated ⇒ the named assertion failed (5945 ms) |
| E14 | PROVEN-RED | `vmu-meeting-invite.test.mjs::★★ and the hand is REAL: the raised member now appears in the floor order` | mutated ⇒ the named assertion failed (6471 ms) |
| E15 | PROVEN-RED | `vmu-meeting-invite.test.mjs::★★ invite: 反 — a MEMBER may not put somebody else on the floor` | mutated ⇒ the named assertion failed (4522 ms) |
| E16 | PROVEN-RED | `vmu-meeting-invite.test.mjs::★★★ 批量按序 is REAL: the FLOOR ORDER equals [r-2, r-1]` | mutated ⇒ the named assertion failed (3363 ms) |
| E17 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E18 | PROVEN-RED | `vmu-wave2-e18-ballot-max-choices.test.mjs::code is VMU_BALLOT_CHOICE_COUNT` | mutated ⇒ the named assertion failed (3246 ms) |
| E19 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E20 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E21 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E22 | PROVEN-RED | `vmu-meeting-types.test.mjs::ONLY the debate type requires the object field (the rule names only debate)` | mutated ⇒ the named assertion failed (2639 ms) |
| E23 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E24 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E25 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E26 | PROVEN-RED | `vmu-meeting-types.test.mjs::★ E26: the receipt step ② names all three ways to OPEN the debate` | mutated ⇒ the named assertion failed (7961 ms) |
| E27 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E28 | PROVEN-RED | `vmu-meeting-verdict.test.mjs::① 不一致 ⇒ 算术平均，并明确标成「估计」而不是「裁定」` | mutated ⇒ the named assertion failed (2084 ms) |
| E29 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| F1 | PROVEN-RED | `vmu-paper-quality.test.mjs::E1 §1: 引言与问题背景 carries the DECLARED objective read from the settings snapshot` | mutated ⇒ the named assertion failed (3063 ms) |
| F2 | PROVEN-RED | `vmu-v5r-tools.test.mjs::recordPart: 反 — a non-participant is refused by name` | mutated ⇒ the named assertion failed (6717 ms) |
| F3 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| F4 | PROVEN-RED | `vmu-paper-office-consult.test.mjs::★ 正：未问所办 ⇒ 具名拒 VMU_OFFICE_CONSULT_REQUIRED` | mutated ⇒ the named assertion failed (3575 ms) |
| F5 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| G1 | UNDECIDABLE | — | this deployment boots with `engines === []`, so no engine dispatch path exists to break |
| G2 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| G3 | PROVEN-RED | `vmu-human-gate.test.mjs::a gated action is refused by name while pending` | mutated ⇒ the named assertion failed (2100 ms) |
| G4 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| G5 | PROVEN-RED | `vmu-human-gate.test.mjs::the refusal carries queued=true and a requestId` | mutated ⇒ the named assertion failed (1975 ms) |
| G6 | PROVEN-RED | `vmu-turn.test.mjs::T6. ★★ a reply with no fence is refused as such` | mutated ⇒ the named assertion failed (3850 ms) |
| G7 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| A8 | PROVEN-RED | `vmu-a7-a8-seat-rights.test.mjs::★★ temp ⇒ all eight (proposition / progress / five lean_* / paper) are DENIED and in the derived deny list` | mutated ⇒ the named assertion failed (2271 ms) |
| A9 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E30 | UNDECIDABLE | — | the observable (a REAL three-member run reaching the scenario) needs a live multi-agent run, not a unit copy |
| E31 | PROVEN-RED | `vmu-meeting-types.test.mjs::★ the binding is machine-readably a RECOMMENDATION (the rule: 是否遵循完全由院士自己决定)` | mutated ⇒ the named assertion failed (4854 ms) |
| E32 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E33 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E34 | PROVEN-RED | `vmu-run85-say-round.test.mjs::§2 the second speech is refused BY NAME` | mutated ⇒ the named assertion failed (5038 ms) |
| E35 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| E36 | PROVEN-RED | `vmu-meeting-types.test.mjs::★ the binding is machine-readably a RECOMMENDATION` | mutated ⇒ the named assertion failed (6792 ms) |
| G8 | PROVEN-RED | `vmu-turn-mainline.test.mjs::§1c2 academician: G8 — the whole sentence is in the assembled prompt` | mutated ⇒ the named assertion failed (2315 ms) |
| G9 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| G10 | PROVEN-RED | `vmu-run236-direction-card.test.mjs::exactly nine fields (G10 names nine)` | mutated ⇒ the named assertion failed (2821 ms) |
| G11 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| G12 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| G13 | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |
| G14 | PROVEN-RED | `vmu-turn-mainline.test.mjs::§1b2 academician: G14 — the whole sentence is in the assembled prompt` | mutated ⇒ the named assertion failed (2288 ms) |

## 与 `docs/acceptance/sim-audit-open-items.json` 的关系

- `RULES-E33-SOURCE-GREP`（P2）已由 TB-2686 关闭：`tests/vmu-meeting-types.test.mjs` 的 E33 runtime 断言
  用临时 pack 副本证明 catalog 跟着 pack 走，反关灯两条。
- REHEARSED-RED 条目不是「没做过弄假」：TB-2679 在 `D:/_tmp/mutbatch/` 逐条做过（77 条），
  只是证据未入仓、不能重跑；要升级成 PROVEN-RED，把该条的 `{file,anchor,replaceWith,expectRed}`
  加进 `manifest.json` 即可（见 `scripts/audit/mutations/run.mjs` 头部注释）。
