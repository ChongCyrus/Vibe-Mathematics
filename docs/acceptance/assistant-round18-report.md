# Round 18 · `task-120`：**"主代理是否真的会自动汇报"＝已判定 ✅** ＋ 那 1 行修复的真机复核 ＋ `docs/11` 补 R17 实例

> 负责人：`vmu-assistant2`｜交付：本报告 ＋ `docs/22 §19.12`（观测 15／"不支持 #7"关闭／"支持 #4"终态／"已建立" #9）＋ `docs/11 §4.2`（第九条实例台账 `I9`–`I11`）。
> 硬约束遵守：**不跑全量**（T0/T1 归 Lead）／**不 `regen-all`**／**不 git**／临时文件全在 **`D:\_tmp`**／宿主**已停＋端口已核无残留**／**未改 `tests/**`／`scripts/**`**／凭据只用了**一次短暂副本并已立刻删除**（§5）。
> ★ 所有读数都写明**是哪一次运行**。

---

## 0. 结论（对用户原话的正面回答）

### ★ "主代理**是否真的会自动汇报**" —— **是**（自主调度成立），但**按触发器类型区分**（这才是精确答案）

| 触发器 | 无人要求时会自己开火吗 | 依据 |
|---|---|---|
| **`event`（`turn-end`）** | ✅ **会** | 本次真机：剧本**去掉 `tick`**，模型 **`report/tick` 调用数＝0**，而宿主的 stdout 打出恰一条 `turn-end-duty` 的 sink 行 |
| **`period`（`everyMs`）** | ✅ 会（在**回合边界**上到点即开火；首次求值只武装基线） | `vibe-math-vmu.js:646` 把 `agent/turn-stopping` 桥成 `tick({event:'turn-end'})` |
| **`threshold`** | ❌ **不会** | 回合边界的 tick **不带 `metrics`**，而 `thresholdMet()` 在 `!metrics \|\| typeof metrics !== 'object'` 时**直接 return false** ⇒ 必须有人给 `metrics`（这正是 R17 只能靠脚本点名 `tick` 的原因） |

**机制落点（读码）**：`kernel/report.js:244` 自述 *"declared reports are **armed and evaluated by `tick()`**"*（**内核自带无定时器**）＋ `EVENT_VOCAB`（`:63-65`）**含 `'turn-end'`** ＋ `vibe-math-vmu.js:642/646`（**只在报告面已发布时**才挂监听器，把宿主 `agent/turn-stopping` 桥成自主 tick）。

### 其余两条

2. **那 1 行修复已获真机实测**：**改前（R17，14:41:04）`16 passed／1 failed／0 not-run，EXIT=1`** → **改后（R18，15:17:20）`17 passed／0 failed／0 not-run，EXIT=0`** ✅（我 R17 的诊断＝**假阴性**，退出码 1→0 也被实测）。
3. **`docs/11 §4.2` 第九条实例台账已补 `I9`–`I11`**（生成器覆盖自己的定点编辑／门禁记账漏桶／多行盲点"先分类再打红"），**每条都写明"哪一次运行测到"以及"我本轮是否复跑"**。

---

## 1. 两次真机运行（时间／会话／读数／退出码）

| # | 目的 | 时刻（+08:00） | 会话 id | 读数 | 退出码 |
|---|---|---|---|---|---|
| **A** | **自主开火判定**（剧本**去掉 `tick`**、其余照旧） | **15:14:26** | `session-7105ed8b-3e6b-4300-9845-00995baadbb3` | 34 events；`durationSec:40`；tokens in 45361／out 3445／cacheRead 84096（cap 400k 未触）；**工具只 3 个**：`vibe_vmu_report`(status) seq16／`vibe_vmu_set` seq21／`vibe_vmu_status` seq26；**`report/tick` 调用数＝0**；`turn/end reason:"completed"` | **0** |
| **B** | **修复后真宿主复核**（测试自带剧本，含 `tick`） | **15:17:20** | `session-6076da68-45fe-4389-a230-3921cb055529` | 40 events；4 个 `tool/call`（report status seq17／report **tick** seq22／set seq27／status seq32，每对带 seq＋行号）；`RECEIPT FACTS: tickFired/tickDelivered:true, setHot:"H2", personaOffice/NoVote:true` | **测试 `17 passed／0 failed／0 not-run`，EXIT=0** |

### 1.1 ★ 自主开火的证据（第三方：**宿主自己的 stdout**，不是驱动器、不是测试）
`D:\_tmp\r18-boot.log`（**仓库外，实测用**）里，与运行 A 对应的**恰好一条**：
```
[vmu-report-sink] {"name":"turn-end-duty","to":[],"channel":"log","text":"【所办汇报】turn-end-duty 在 turn-end 自动开火","drives":false}
```
★ **同一份 stdout 里没有 `artifacts-threshold` 的 sink 行** ⇒ **对照的否定侧也是实测的**（不是推断），这才使"按触发器类型区分"这个结论站得住。
（运行 B 之后该文件共 3 条 sink：A 的 `turn-end-duty` ＋ B 的 `artifacts-threshold`（脚本点名 `tick` 才开火）＋ B 的 `turn-end-duty` ⇒ 两条路径在同一台宿主上**并存且可分**。）

### 1.2 overlay 的声明（两份报告，对照＋探针）
`D:\_tmp\r18-overlay.yml`（**仓库外，实测用**）：同一 overlay 行、**只打 overlay 行**，`deliver` 仍是 R17 的 scope-free `console.log` sink；声明
- `artifacts-threshold`：`trigger:{kind:'threshold', metric:'artifacts', op:'gte', value:5}`（**对照**）
- `turn-end-duty`：`trigger:{kind:'event', event:'turn-end'}`（**探针**）

⇒ 于是"**自主开火**"与"**必须被调用**"在同一份部署里**同时被观测**，而不是换个部署再推。

---

## 2. 运行 A 的完整证据链（逐条可复算）

```
① 会话日志（权威）：34 events；tool/call 仅 3 条（seq16 report-status／seq21 set／seq26 status）
② report/tick 调用数 = 0            ← 按会话日志逐条 JSON 解析统计（不是 grep 词频）
③ turn/end reason = {"kind":"completed"}
④ 宿主 stdout 恰 1 条 sink = turn-end-duty（自主）；0 条 artifacts-threshold
⑤ 驱动器 done：durationSec:40、tokenCapHit:false、tokenTotal 132902
```
命令行（原样，本 report 的 §6 有可复跑版本）：
`node scripts/dsh-drive.mjs --port 7821 --token <T> --cwd D:\_tmp\r18-ws --preset vibe-math-vmu --task-file D:\_tmp\r18-task-autonomy.txt --out D:\_tmp\r18-dump --jsonl D:\_tmp\r18-dump\transcript.jsonl --max-tokens 400000 --timeout 400` ⇒ **exit=0**。

★ **诚实边界（仍然不写过头）**：本 run 证的是 **机制层**的自主开火（**框架的回合边界会推进报告，不需要模型调用**）。它**不**证"模型会自发地*想*去汇报"（那是**Agent 行为层**的另一件事，本轮未测、也未主张）。

---

## 3. 运行 B：那 1 行修复的真机复核（改前／改后并列）

| | 时刻 | 命令 | 读数 | 退出码 |
|---|---|---|---|---|
| **改前**（R17） | 14:41:04 | `node tests/vmu-assistant-host-slice.test.mjs --web-port 7820 … --expect-delivery` | **16 passed／1 failed／0 not-run**（唯一红＝`:367` 读 `transcript` 的假阴性） | **1** |
| **改后**（R18，本次） | **15:17:20** | 同上，`--web-port 7821 …` | ★ **17 passed／0 failed／0 not-run** | **0** |

**修复内容**（`vmu-verify2`，task-118）：`:367` 从 `ok(/vibe_vmu_report/.test(transcript))` 改为读**会话日志**（`sess.toolCalls.some(…)`）。
⇒ **我 R17 的定性被实测确认**：那是**构造性假阴性**（驱动器 stdout／JSONL **从不回声工具名**，实测该 dump 里 `vibe_vmu_report` 命中 **0** 次），**不是**环境缺件、**不是**框架缺口；修复后**退出码 1→0**。

---

## 4. `docs/11 §4.2` 第九条实例台账：新增 `I9`–`I11`（★ 逐条写明"我是否复跑"）

| 编号 | 形态（Lead 给的判据 ＋ 我的读码定位） | 我本轮做了什么 |
|---|---|---|
| **`I9`** | **生成器覆盖自己的定点编辑**：块内键每次重新 `emit` ⇒ 手写进生成块的值域（`enum`↔`string`）被**逐字符还原**，而 **fs 版本守卫看不见**（生成器经 `node:fs` 直写）。**变红条件**＝`generate-wired-schema.mjs` 的 `:458`（同键既在块内又在手写 schema ⇒ 红）**与** `:464`（键**手写声明了值域**却不在手写 schema ⇒ 红，message 逐字含 *"the generator would emit `type:'string'` and destroy t…"*）**同时**有牙 | **读码定位**了通路（`:47` SCHEMA／`:330-364` collect／`:444-483` 不变量段）；**未复跑**该实验（属 R17 该面负责人的实测） |
| **`I10`** | **门禁记账漏桶**：新分支在 `already` 检查**之前** `continue` ⇒ 该键**不进 `preexisting` 桶**；联合门 `tests/audit-vmu-wired-union.test.mjs:38` 判据是 `seen.has(k) \|\| preexisting.has(k) \|\| skipped.has(k)` ⇒ **两桶都不含它**（假绿／误报）。**修法（Lead 裁决口径）**＝"手工声明值域的键**按构造就是 pre-existing**" ⇒ **两桶都记** | **读码核实**：`:352` 注释自述该形状、`:355` 现落为 `if (HAND_DECLARED_DOMAINS.has(key)) { handDeclared.push(key); preexisting.push(key); continue }`、`:364` 的返回含两桶；**未复跑** |
| **`I11`** | **多行盲点"先分类再打红"**（task-118 ②）：shape-C 的**多行孪生形**只按单行看 ⇒ 整类假绿。**变红条件**＝① `MULTILINE_C_BASELINE_FINGERPRINTS` **每文件一条**；② `diffFingerprints` **纯增与纯删都红**；③ **自探针 6 条**（Lead 口径）；④ ★ **不加计数天花板**（**Lead 裁决**：天花板会把"又长出来一处"变成静默绿） | ★ **实测了两项**：`MULTILINE_C_BASELINE_FINGERPRINTS entries=57 distinctFiles=57`（**与 Lead 的"57 条每文件基线"逐数吻合**）；并读码确认 199／125（`:302-303`）、纯增方向（`:790`）、纯删方向（`:320-321`／`:397-402`／`fixture J②` `:950`）。**未复跑**该门 `--selftest` |

★ **顺手纠正一处可能混淆的数**：同一门里还有 **`A_CLASS_BASELINE_FINGERPRINTS`（我实测 67 entries／52 distinct files）**，那是 **`RULE E`** 那一本账（R14/R15 记的"67＝67"）⇒ **57（多行·每文件）与 67（RULE E）不是同一个数**，已在 `I11` 里写明。

---

## 5. 凭据与收尾（逐条，可核）

- **★ 凭据**：本次**必须**用到一次（provider 的 key 从 `DSH_HOME` 凭据库按 ref 名取）。做法＝复制到
  **`D:\_tmp\r18-home\.credentials.yaml`（仓库外，实测用）**，两次运行**共用**，**跑完立刻删除**：`Test-Path` ＝ **False**；随后 `Get-ChildItem D:\_tmp -Recurse -Filter '.credentials*'` ⇒ **none**（全盘无任何副本残留）；**操作者自己的 `~/.dsh/.credentials.yaml` 未动**（仍在）✓。
- **宿主已停＋端口无残留**：7819／7820／**7821 均无监听**；`7700–7900` 段**无任何监听** ✓。
- **未跑全量**（T0/T1 归 Lead）／**未 `regen-all`**／**未 git**（全程无 git 写）／**未改 `tests/**`／`scripts/**`** ✓。
- **临时物（都在 D 盘，留作证据可复跑）**：`D:\_tmp\r18-home\**`（scratch home ＋ 两次会话日志）、`r18-provider.yml`（＝`r17-provider.yml`）／`r18-overlay.yml`／`r18-task-autonomy.txt`／`r18-boot.log`／`r18-autonomy-drive.log`／`r18-slice.log`／`r18-dump\**`／`vmu-host-slice-1792048640824`（运行 B 的 dump）／`r18-tools.mjs`。

---

## 6. 门禁读数（★ 写明是哪一次运行）

**我改完两卷 docs 后（2026-10-15 15:23:05，同一次运行，绑定到字节）**：
`docs/22` sha256 **`6240AED79460148E`**（180716 B）、`docs/11` sha256 **`DC973C04C198E757`**（244808 B），**运行前后哈希相同**。
| 门 | 读数 |
|---|---|
| `scripts/check-docs.mjs` | **PASS** |
| `tests/audit-vmu-docs.test.mjs` | **95 passed / 0 failed** |
| `tests/audit-doc-index.test.mjs` | **5 / 0** |
| `tests/audit-verbatim-claims.test.mjs` | **3 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0**（台账新增条目未造出悬挂引用） |
| `tests/vmu-planned-settings.test.mjs` | **ALL GREEN（planned=111, docs=28, 39/0）** |
| `scripts/generate-planned-settings.mjs --check` | **up to date（111 planned keys；serviceCall=5）** |

★ **调用形纪律**：新增文字里服务方法一律写 `` `vmu.X.method()` ``（或 `vibe_vmu_*` 工具名），**未裸写三段点号名**。

---

## 7. 诚实清单（我没做什么／没证什么）

1. **没证"模型会自发地想汇报"**（Agent 行为层）—— 只证了**机制层**自主开火（§2 末）。
2. **`I9`／`I10`／`I11` 的实验我未复跑**（属 R17 task-118 那侧），**只做读码定位 ＋ `I11` 的基线计数实测**；台账里已逐条标注。
3. **没改 `tests/**`／`scripts/**`**；那 1 行的修复是 `vmu-verify2` 落的，我只做**真机复核**。
4. **`docs/29` 未动**（本轮证据不属那卷）。
