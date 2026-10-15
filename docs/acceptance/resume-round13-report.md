# Round 13 报告 · task-100（A 钻取①转正 ＋ B 透传；C/D 具名）

> **一句话**：**A ✅** —— `mirrorVote` 的"**`choice` 优先／`value` 兜底**"落地，钻取 `16a` 从 **NAMED GAP 翻成正断言**（会议两票**真的进箱**、`close()` 出裁定，2 票）；**B ✅** —— `boxFor` 载荷带上 **`text/kind/emergency`**（纯数据透传）。
> **C（B③ `overrideOrder`／B④ `flow`）未做**、**D（`ballotbox.js` 7 处点号名）未做**：两者都**具名**，理由见 §4（D 需与 core 的 `bus.js` 登记**同轮原子**，单独落会红 `audit-hook-coverage`；C 是 ~150 行新族，本轮预算不足）。
> 规矩：原子编辑＋每步跑加载内核的套件；没跑的不写成已验证。

## 1. 改动

| 文件 | 改动 |
| --- | --- |
| `kernel/meetingmarker.js` | `mirrorVote`：签名＋`boxFor({…, text, kind, emergency})` 载荷；`wire` 增 `choice`；`ballot.cast({…, choice: wire.choice ?? wire.value, value, by, boxId})`（**choice 优先、value 兜底**，附根因注释） |
| `kernel/meetings.js` | `vote()` 调 `mirrorVote` 时透传 `target.text/target.kind/target.emergency`（**1182 行**，< 1200；新族未进本文件） |
| `tests/vmu-resume-e2e.test.mjs` | `16a` 改正断言：箱 `options:['a','b']`、绑定返回 `{boxId, choice:'a', by: member}` ⇒ 断言 `mirrored:true` ×2 ＋ `close().tally.votes === 2` |

## 2. 证据（原样命令＋退出码）

```
node --check kernel/meetings.js / kernel/meetingmarker.js / tests/vmu-resume-e2e.test.mjs   → 0 / 0 / 0
node -e "readFileSync('vibe-math-vmu/kernel/meetings.js','utf8').split('\n').length"         → meetings.js split-lines=1182
node tests/vmu-resume-e2e.test.mjs    → === VMU GOAL1 E2E: 108 passed, 0 failed ===   exit 0
node tests/vmu-meetings.test.mjs      → === VMU MEETINGS: 161 passed, 0 failed ===    exit 0
node tests/vmu-meeting-parity.test.mjs→ exit 0
node tests/vmu-kernel.test.mjs        → === VMU KERNEL: 175 passed, 0 failed ===      exit 0
node tests/audit-code-size.test.mjs   → === CODE SIZE: 9 passed, 0 failed ===         exit 0
node tests/audit-vmu-docs.test.mjs    → === VMU DOCS AUDIT: 84 passed, 0 failed ===   exit 0
```
关键读数（`16a` 翻正）：
```
ok 16a BOUND (POSITIVE): the meeting votes really reach the box — `choice` beats `value` — and `close()` yields the ruling with 2 votes in it
ok 16b IDEMPOTENT BY CONSTRUCTION: … the SAME box … (no second box, no refusal from the binder)
ok 16c UNBOUND: … no-binding + VMU_MEETING_BOX_UNWIRED    ok 16d THROWING binder: binding-threw + …BINDING_FAILED
ok 16e binder answers "no box": unmapped + VMU_MEETING_BOX_UNMAPPED
```
⇒ **R12 的"唯一未证（真箱联动）"到此关闭**；pack 的 `boxForMotion()`（返回 `{boxId, choice}`）可直接工作。

## 3. 语义（本轮锁定的接缝契约）

- 绑定返回 `boxId` | `{boxId, choice?, value?, by?}`：**`choice` 优先、`value` 兜底**（会议侧 `0|1` 与箱侧词表解耦，映射归消费者）。
- 失败一律具名：`no-seam`／`no-binding`(`VMU_MEETING_BOX_UNWIRED`)／`unmapped`(`…_UNMAPPED`)／`binding-threw`(`…_BINDING_FAILED`，回调自带 code 优先)／`refused`(箱的 code)／`threw`；成功 `cast`（带 `boxId`）。
- `boxFor` 载荷：`{meeting, motion, member, value, text, kind, emergency}`——**只传会议面已有的事实**，内核不做任何政策解释（不开箱、不发明映射、不缓存）。

## 4. 未做（具名，含理由与下一步）

1. **C B③ `overrideOrder`／B④ `flow`**：规格在 `_handoff/vmu/comms-round*.md` 与 `docs/08 §25.14`。按 Lead 的口径**新族要放进 `kernel/meetingmarker.js`**（`meetings.js` 1182/1200）。≈150 行 ＋ ≥6 条断言（非 chair 拒／无 why 拒／未声明拒／覆盖后 `queue()` 顺序真变／四模式各自可观察差异／未知 mode 拒），**本轮预算不足** ⇒ **Round 14 首项，我接手**。
2. **D `ballotbox.js` 7 处点号名**（`ballot.open|recuse|runoff|reopen|lapse|lapse-revoked`）⇒ 斜杠名：**不能单边落**——`kernel/bus.js` 的 `HOOK_REGISTRY` 归 core，我改了 emit 而它没登记 ⇒ `audit-hook-coverage` 立即红（正是 task-99 的原子性要求）。⇒ **请 Lead 与 core 对齐"同轮原子"后我立刻改**（我这边 7 个 replace 已定位，约 10 分钟）。
3. 装配侧（core，R12 已报，仍存在）：`kernel/index.js` 的 `createMeetings({…})` **未传 `ballot`/`boxFor`** ⇒ 出货内核里 `mirrorVote` 在 `no-seam` 就返回；**真机**上"动议⇒开箱"仍到不了接缝。

## 5. 自我更正

- 第一次 B 的 call-site 编辑被会话**读守卫**挡下（未落）⇒ 我没有把它当"已做"，本回合读完再改，**同一批**里跑套件确认（`16a` 的翻正就是这一步的读数）。
- 我误插了一条无害的占位编辑调用（`old_string === new_string` 被拒）——没有产生任何文件改动。
