# Hint-names inventory (`name()` inside refusal hints)

TB-2704 / task-187. **Read-only inventory — nothing in this file fixes anything.** The only fix in this round is
`vibe-math-vmu/kernel/members.js` (three sites, see the delivery report); every other row is a candidate for its own
task, deliberately left untouched (the taskbook's 「本轮其余不修」).

## Why this exists

A refusal hint is read by a model that holds **only a receipt**. If a hint says `foo()`, the model will type `foo()` —
and `VMU_NO_SUCH_OBJECT`'s 「the roster holds the live ids」 (TB-2694 / F75-17) plus members.js' `roster()` are the
measured cases where it could not work: `roster()` is a kernel-internal seam; no tool by that name exists.

The question per occurrence is therefore: **is `foo` something a seat can actually name?** A mounted tool
(`vibe_v5_overview`) or one of its declared parameters (`member`) — yes. An internal kernel function — no.

## Scope (what is counted as a "hint")

Only two shapes, so the count is not noise:

1. the **last argument** of a `refuse('CODE', message, hint)` call (the kernel's own refusal helper), and
2. any `hint: '…'` property value.

JSDoc prose, provider error text, test names, and documentation are out of scope on purpose.

## Generation (reproducible; not a hand list)

```bash
node D:/_tmp/tb2704-inventory.mjs   # writes D:/_tmp/tb2704-inventory.json
```

- Tool/parameter set is **computed** from the two production declarations — `vibe-math-vmu/host.js#toolSpecs()`
  (via `resolveFaces`, same derivation as `scripts/check-task-brief.mjs`) and
  `vibe-math-vmu/packs/v5r/tools.js#V5R_PACK_TOOLS`: **106 tool names, 288 parameter names**.
- Kernel-seam set is **computed** by scanning `vibe-math-vmu/kernel/**/*.js` for function declarations: **1020 names**.
- Hint extraction walks `vibe-math-vmu/**` and `scripts/**`; only string literals (a name inside a string is
  copyable; a name in code is not a hint).
- The scanner is the same `name()` shape the judge uses
  (`tests/vmu-run2704-hints-name-real-commands.test.mjs` §5/§7 — and §7 proves it flags the old `roster()` sentence).

## Totals (run of 2026-11-10, after the members.js fix)

| metric | value |
| --- | --- |
| hint literals inspected | **1095** |
| `name()` mentions inside hints | **102** |
| mentions whose name is **neither a tool nor a parameter** | **58** |
| distinct such names | **36** |

The 58 are the interesting population: a reader of those hints cannot type what they say. Note the conservative
direction — a name counts as "un-typable" even when the hint also names the real tool beside it (e.g.
`resume() first (vibe_vmu_control {action:"resume"})` is half-copyable, half-not).

## By name (un-typable mentions)

| name | count |
| --- | --- |
| `resume` | 7 |
| `check` | 4 |
| `emptyState` | 4 |
| `apply` | 3 |
| `wrap` | 3 |
| `open` | 2 |
| `archive` | 2 |
| `pending` | 2 |
| `declarations` | 2 |
| `createMethodCard` | 2 |
| `admit` | 2 |
| `deliverByReturning` | 1 |

(36 distinct names in total; the remaining 24 occur once each.)

## First 20 occurrences

| # | file:line | text (truncated) | the name is | reachable as a tool/param? |
| --- | --- | --- | --- | --- |
| 1 | `vibe-math-vmu/host-deliver.js:399` | the caller route needs `deliverByReturning()`; this host did not provide it… | host delivery seam (deployment-side, not seat-facing) | no |
| 2 | `vibe-math-vmu/kernel/ballot.js:316` | `resume()` first (`vibe_vmu_control {action:"resume"}`) | ballot action; the hint names the real tool beside it | partial |
| 3 | `vibe-math-vmu/kernel/ballot.js:416` | `resume()` first (`vibe_vmu_control {action:"resume"}`) | same as above | partial |
| 4 | `vibe-math-vmu/kernel/ballot.js:425` | call `reopen()` to clear the votes and debate again… | ballot internal function | no |
| 5 | `vibe-math-vmu/kernel/board.js:115` | either inject a tasks ledger with `canTransition()`, or pass `{ transition: true }`… | host-injection seam | no (host author, not seat) |
| 6 | `vibe-math-vmu/kernel/explain.js:134` | `build()` one first, or pass `{ report }` | explainer internal | no |
| 7 | `vibe-math-vmu/kernel/formal.js:189` | 先 `check()` 取 id | formal-check action — the hint omits the tool and the action parameter | **no — real candidate** |
| 8 | `vibe-math-vmu/kernel/formal.js:194` | 先 `check()` 取 id | same | **no — real candidate** |
| 9 | `vibe-math-vmu/kernel/formal.js:200` | 先 `check()` 取 id | same | **no — real candidate** |
| 10 | `vibe-math-vmu/kernel/formal.js:207` | 先 `check()` 取 id | same | **no — real candidate** |
| 11 | `vibe-math-vmu/kernel/human.js:356` | `decide()` or `liftVeto()` the pending requests first… | human-approval internals | no |
| 12 | `vibe-math-vmu/kernel/human.js:356` | (same hint) `liftVeto()` | human-approval internal | no |
| 13 | `vibe-math-vmu/kernel/index.js:2316` | call the ledger from a turn that HAS a member (`kernel/turn/index.js open()`) | kernel source path, addressed to kernel authors | no (not seat-facing) |
| 14 | `vibe-math-vmu/kernel/lean.js:402` | 等待 running/queued 结束后再 `settle()` | lean job internal | no |
| 15 | `vibe-math-vmu/kernel/lean.js:1204` | 文件被删或移走了：重建它，或重新 `archive()` | archive action — tool/action not named | **no — real candidate** |
| 16 | `vibe-math-vmu/kernel/lean.js:1206` | 重新 `archive()` 登记新内容… | same | **no — real candidate** |
| 17 | `vibe-math-vmu/kernel/library.js:792` | `listTrash()` shows what can be restored | library internal | no |
| 18 | `vibe-math-vmu/kernel/library.js:842` | `revisions()` lists the frozen versions | library internal | no |
| 19 | `vibe-math-vmu/kernel/lifecycle.js:116` | 见 `stages()` | lifecycle internal | no |
| 20 | `vibe-math-vmu/kernel/mailbox.js:1080` | pass ids from `pending()` | mailbox internal | no |

## Reading of the table

- The **seat-facing** candidates (hint shown to a model that only has tools) are the `formal.js` four
  (`check()`) and the `lean.js` two (`archive()`): they name an *action* while omitting the tool and the parameter
  that would make the call runnable — the same disease as TB-2704, one layer up. They are **not** fixed here.
- The **not seat-facing** rows address host authors or kernel authors (inject a ledger / call the ledger / host
  delivery seam). Turning them into tool calls would be wrong; the right treatment is to say *who* the reader is.
  They are listed anyway, because the count must not silently drop them.
- `REACHABLE INSTEAD:`-style hints already fixed this round (`kernel/members.js`, 3 sites; `packs/v5r/tools.js`,
  4 sites; `kit/handlers.js`, 2 sites) do not appear above: their hints are constants (variable references), not
  string literals, and `vibe_v5_overview` / `vibe_v5_inbox` / `member` all resolve in the computed set.

## Not in scope here

- No product file other than `vibe-math-vmu/kernel/members.js` was edited for TB-2704.
- No `name()` mention is rewritten by the inventory; it only counts and names them.

## TB-2708 处置结果（全树判据落地后重算）

判据：`tests/vmu-run2704-hints-name-real-commands.test.mjs` §8/§9（全树扫 `vibe-math-vmu/**` + `scripts/**`，
`refuse()` 第 3 实参 + `hint:` 属性字面量；名字解析口径 = 实算工具名 **或** 形参名）。

```
WHOLE-TREE HINTS: hintLiterals=1095 callMentions=66 unresolvable=26 registered=26 fixed=32 (fixed+registered === 58)
```

- 基线 **58** 处不可解析 = **修 32 + 登记 26**（`N + M = 58`，数字抄自上行判据输出）。
- **修的 32 处**（改成 `REACHABLE INSTEAD:` 可照抄句，真工具名 + 真形参 + 下一步）：
  - 第一批 7 处（TB-2708 本体）：
    - `vibe-math-vmu/kernel/formal.js` 四处 `check()`（axioms / sorryReport / artifacts / reproduce）→
      `vibe_vmu_formal {action:"check", request:{…}}` 取 id，再用 `{action:"axioms"|"sorryReport"|"artifacts"|"reproduce"}`
      重试；
    - `vibe-math-vmu/kernel/lean.js` 三处 → `settle()` 改 `vibe_v5_lean_job {jobId}`；`archive()` 两处改
      `vibe_v5_lean_archive {kind, name, file, statement}` + `vibe_v5_lean_lib {}` / `vibe_v5_lean_read {name}`。
  - 第二批 25 处（Lead 裁定授权按 owner 逐组修，只改 hint 字面量；allowlist 对应 25 条同步删除，故 §9b STALE
    由判据自己抓出——删晚了会红，这次正是它替我们记账）：
    - owner `kernel-faces` 17 条 / 16 处：`kernel/ballot.js` 3（cast/open 暂停 → `vibe_vmu_control {action:"resume"}`；
      already-settled → `vibe_vmu_meeting {action:"reopen", ballotId}`）、`kernel/explain.js` 1（`build` →
      `vibe_vmu_explain {action:"build"}`）、`kernel/human.js` 1（`decide`/`liftVeto` → `vibe_vmu_human` 两动作）、
      `kernel/meeting.js` 2（`resume`）、`kernel/meetinglapse.js` 1（`extend` → `vibe_vmu_meeting {action:"extend", id, ms}`）、
      `kernel/report.js` 2（`declarations` → `vibe_vmu_report {action:"declarations"}` / `{action:"set", key:"enabled"}`）、
      `kernel/tasks.js` 3（`resume` ×2；`rollback` → `vibe_vmu_task {action:"stage", id, to}`）、
      `kernel/turn/index.js` 1 处 2 名（`run()`/`drive()`/`step()` → `vibe_vmu_turn {op:"status"|"step"|"drive"}`）、
      `kernel/work.js` 1（`resume`）；
    - owner `tb-2691` 6 条：`kernel/library.js` 2（`listTrash`/`revisions` → `vibe_vmu_retention {action:"trash"|"status"|"restore", id}`）、
      `kernel/mailbox.js` 4（`list`/`open`/`ack`/`pending` → `vibe_vmu_mailbox` 同名 action）；
    - owner `notice-lane` 2 条：`packs/v5r/tools.js` `admit()` 两处 → `vibe_vmu_meeting {action:"admit", id, member}`。
- **登记的 26 处**逐条在 `docs/acceptance/hint-author-facing-allowlist.json`（`file`/`line`/`name`/`why`/`owner`，
  每条 `why` 点明读者；无目录整批豁免；条目集合与判据 live 集合**逐键相等**，另有 STALE / 集合守恒 / 58 对账三条断言）。
  **26 处读者全部是 host author 或 kernel author**（DSH 宿主桥/打包/注入接缝，或内核算子/迁移/重放/comparator），
  写成工具调用反而是错的；**席位读者已归零**（上一版 25 条 `deferred` 座位面条目已在本轮修好后删除）。
- 两条反关灯（仓库外副本，跑完即还原）：把 `formal.js` 四处改回 `'先 check() 取 id'` ⇒ §9a 红并点名
  `formal.js:190/195/201/208 check()`；往 allowlist 塞一条假 `file:line` ⇒ §9b 红并回显该条（`staleCount:1`）。
- 口径限制（如实记录）：本判据按「工具名 **或形参名**」解析，因此 `lean.js` 的 `lib()`/`read()`/`list()` 等会因某个
  工具恰好有同名形参而通过——这是 TB-2708 任务书 §2 的口径，不是本轮新增；对「形参名叫成 `roster` 就能洗白旧句」
  那类风险，TB-2704 的 members.js 判据仍坚持 **只用工具名**。
