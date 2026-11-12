# RUN 80 真机核对记录（`op:"step"` 的第三支结果 + 宿主 shell 故障）

> **这是记录，不是证据。** 证据在第 80 次那批会话 journal、回执与 `D:/_tmp/slv-phase5/slvp260-ws/`
> 的原始报告里；本页把读数、验点判定与十条缺陷的处置去向留档，方便后来人对照。
>
> 这一轮与 RUN 75–79 都不同：验证机上的 **DSH shell 工具**起不来（全会话 3 次 `pwsh` 调用，3/3 以
> `[exit code: 3221225794]` = `0xC0000142` `STATUS_DLL_INIT_FAILED` 结算），所以**产品会话侧**的遥测拿不到、
> `git rev-parse` 与独立 sha 也算不了。但**宿主驱动侧**留下了读数（`run80-metadata.json`、
> `run80.drive.log:90` 的 done 行），下表每行都标明来源：`回执原文` / `产品自报` / `驱动读数` / `手工可数` / `不可得`。

- 运行：build `c8a4b415`。**两处互证**（驱动读数）：`run80-metadata.json` 的 `build`/`tarballBuild` = `c8a4b415`、`gitHead` = `c8a4b4153a5a68834a73c87c6bff94e90339541f`、`buildFrom:"HEAD"`、`dirty:false`、`tarballBytes:8410865`；本机 shell 不可用，第三条 `git rev-parse` 没做。
- 时间（两个口径都标来源）：驱动 `startedAt 02:16:04+08` → `completedAt 03:31:53+08`、`durationSec:4438`（≈74 分钟，`run80.drive.log:90` 驱动读数）；报告口径 `2026-11-11T18:18:22.170Z` → `19:26:22.196Z`（≈68 分钟：首条 `vibe_v5_start` 回执 `at` → 末次写回执 `readback.at`，`SIM-REPORT80.md:8-10` 内核时钟）。预算 100 分钟未触顶。
- 用量（驱动读数 `run80.drive.log:90`）：`tokenTotal 16 170 812` / cap `80 000 000`（`tokenCapHit:false`）、`transcriptEvents 229`、`toolCalls 46`；**产品会话侧**这两项**不可得**（入口是 shell 工具）。`toolCalls` 另一口径：第 80 次报告**手工数 28**（`SIM-REPORT80.md:13`，是少算的——root journal `tool/call` = 46，与驱动一致，以 46 为准）；成员侧 `memberToolCalls:null`（报告原文明写「null here means NOT READABLE FROM THIS RECEIPT, never "zero calls"」）。
- 会话：**6**（1 root + 5 成员子会话，`SIM-REPORT80.md:14`）；席位 `r-acad` + `r-1`/`r-2`/`r-3` + `r-temp`
- 工作区：`D:/_tmp/slv-phase5/slvp260-ws`；题目「在 1 到 2n 的整数中任取 n+1 个，证明其中必有两数互质」（未真解）
- 结果：**PASS 9 / FAIL 2 / NO-EVIDENCE 3**（FAIL = V6 议程 + V8 工具链探针；V7 的替换半、V10、V11 的 full 对照 = `NO-EVIDENCE` / `RUN-DID-NOT-REACH`）

## 读数表

| 读数 | 值（来源） |
|---|---|
| 结题 PDF | `Paper/paper-p1/paper-p1.pdf`，**111 327 B**，`engine:"xelatex"`（回执原文） |
| PDF sha256 | `pdfSha256 = diskPdfSha256 = 52a2f8251d604ae3137ddc7988e2ab1656c28c94259a526268d7d0fffc0bd21d`，`pdfSha256MatchesDisk:true`（产品自报，非第三方重算——shell 不可用） |
| 结题票 | 4/4；`r-temp` 记 `no-closure-vote-permission`（回执原文） |
| `memberWorkShare` | `{memberActs:10, officeRelayedActs:0, unknownActs:0, acts:10, provenActs:10, memberShare:1}`（回执原文，board 面）；按行只核到 3/10 行（手工可数），差额 7 如实保留 |
| `receiptsView` | `count:2`、`available:2`、`readFrom:"durable-fold"`、`inProcessRingCount:0`（回执原文） |
| 状态板 | `statusBlockIncluded:true`、`statusBlockChars:884`；caller park 回执 `statusBlock:{included:true,chars:1274,appendedLiterally:false}`（产品自报字段） |
| 论文链 | `final`/`render` 已走；`toolchainProbe:"not-run"` 但 `pdfCompiled.produced:true`（矛盾，见 F80-5；回执原文） |
| board 面 | `originalBytes:9273`、`truncated:false`（回执原文） |

## 验点表（V1–V14）

| 验点 | 实测（回执原文/字段） | 判定 | 备注（建议） |
|---|---|---|---|
| V1 归因同源 | activation/continuation 回合的席位工具面写均 `writtenFrom:"own-turn"`；两数逐项相符（按行只核到 3/10） | PASS（带证据缺口） | — |
| V2 状态板进正文 | **`[状态板]` 半**：`statusBlockIncluded:true`/`statusBlockChars:884`（自报），正文第 2 页确含 `# v5r-turn-board` 段（回执原文）。**`[蓝图]` 半本轮未验**：翻过前 3 页未见 `[蓝图]` 字面行；只有 board 的 `liveReadings.blueprint` 原文（`"id rec-20｜状态 draft｜修订 1｜草案 md 在位"`），上游明写「不冒充 PASS」（`SIM-REPORT80.md:60`） | PASS（`[状态板]` 半）/ `NO-EVIDENCE` / `RUN-DID-NOT-REACH`（`[蓝图]` 半） | — |
| V3 `op:"prompt"` 认 `member` | `promptFor.member` 等于所传；分页读 `statusBlockIncluded` 在回执 | PASS | — |
| V4 `op:"step"` 三支结果 | 本轮回执出现第三支：`{ok:true, completed:true, turn:"t-12", requestedMembers:[], instructionDelivered:false, receipt.round:null}`（结算已 park 的回合，不是静默降级） | PASS | — |
| V5 `receiptsView` 跨内核 | 回执半：两行 open/speak 原文 + `readFrom:"durable-fold"`、`inProcessRingCount:0`、`sourceDivergenceMeans`（回执原文）。磁盘半：上游实测 `state.json` **无匹配**（当时是落盘前旧投影），「与 `state.json` 逐字相等」这半**没做到**（`SIM-REPORT80.md:63`）；本机 shell 不可用 ⇒ `ENV-LIMIT` | PASS（回执半）/ `ENV-LIMIT`（磁盘半） | — |
| V6 字符串议程 | `agendaInputShape:"string"`，但 `materials` 同传时被静默覆盖，`agendaItems` 只有 2 项（第二项 `(2k−1,2k)` 未裂） | **FAIL** | — |
| V7 互审票绑指纹 | 绑定半已核：三票 `judgedPartFingerprint` 逐字等于当前 part 指纹（`paper.parts`）；**没有发生 part 替换/改写**，所以「替换后旧票作废 / `staleReviews`」半到不了 | **`NO-EVIDENCE` / `RUN-DID-NOT-REACH`**（上游 `SIM-REPORT80.md:65` 同判，不折成 PASS） | — |
| V8 未测≠没有 | 同一份 `vibe_v5_paper { action:"status" }` 回执里两段原文互相否认：① `toolchainProbe:"not-run"`、`latexAvailable:null`、`toolchainAbsent:[]`；② `pdfCompiled:{produced:true, engine:"xelatex", pdfBytes:111327, pdfSha256:"52a2f825…", diskPdfSha256:"52a2f825…", pdfSha256MatchesDisk:true}` | **FAIL（F80-5）** | TB-2750 已修（`final` 成功后 `toolchainProbe` 置 `ran-present` + `toolchainProbeSource:"paper-ledger"`）；本轮 FAIL 记的是**修前形状** |
| V9 `vote_solved` 不单独计票 | reply 首回执 `accepted:true`+`ignoredFields:[]`；第二次 `op:"step"` 的 `fieldsIgnored:[{field:"vote_solved", keptWhy:"tool-visibility-unprovable"}]` | PASS（带时机缺口） | — |
| V10 通知块四键 | 无对应回执，`notices` 四键读不到 | NO-EVIDENCE / `RUN-DID-NOT-REACH` | — |
| V11 board 有界 | board 半已核：`receiptMeta.originalBytes:9273`、`truncated:false`（回执原文）；**full 侧本轮未测**（`51 988 B` 是上一轮读数，不能当本轮对照） | **`NO-EVIDENCE` / `RUN-DID-NOT-REACH`**（上游 `SIM-REPORT80.md:69` 同判） | — |
| V12 成员动作边界 | `memberOps:["status"]`；照抄 `op:"status"` 成功 | PASS | — |
| V13 蓝图草案口径 | `filed:false`、`draftMdMissing:true` | PASS | — |
| V14 结题链与 PDF sha | 归档行 `pdfSha256` 与产品自报磁盘 sha 相等；字节数 111 327 | PASS（非第三方测量） | — |

## 十条缺陷的处置去向

| 编号 | 现象（回执证据） | 处置去向 |
|---|---|---|
| F80-1 | 任务无 brief 仍 `ready:true` 并被指派：`brief:null`、`hasBrief:false`、`briefs:[]` | **本批已修（TB-2750）**：`assign` 具名拒 `VMU_TASK_BRIEF_MISSING`（`kernel/tasks.js:462`）；任务行给 `ready`/`readyCode`/`readable`/`hasBrief`/`contentSource`（`:583-587`）。判据 `tests/vmu-run80-mechanism.test.mjs §3`（含「撤掉 `:462` 那行 ⇒ 无 brief 也被指派」的灯）。TB-2754 的 F80-1 探针按修后字段复验 |
| F80-2 | `agenda` 与 `materials` 同传时 `materials` 静默覆盖：`materialsMeans:"…the ONE text line the convene face stores"`、`agendaItems` 2 项 | **本批已修（TB-2750）**：双参同传 ⇒ 具名拒 `VMU_MEETING_AGENDA_CONFLICT`，hint 二选一，顶层 `agendaInputShape`/`materialsSupplied`/`reachableInstead`（`packs/v5r/tools.js:4947-4958`）。判据 `tests/vmu-run80-mechanism.test.mjs §1`。TB-2754 的 V6 分两步验：①双参 ⇒ 拒码；②单传 `agenda` ⇒ `agendaItems` 3 项不裂 |
| F80-3 | `judgedPartFingerprint` 传参被拒 `VMU_INVALID_ARGUMENT`（它是回执字段、不是形参）；去掉后内核自动绑定 `b1b486ae…9c569a2a` | TB-2754 的 V7 按「绑定由内核自报」写期望；提示词/文档口径交实现车道 |
| F80-4 | `part` 的 `evidence` 只认 rec id；传文件路径被 `VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING` 拒且提示词没教 | 交实现车道；TB-2754 不把路径写法当必然 |
| F80-5 | `final` 已 xelatex 产出 PDF 后 `toolchainProbe` 仍 `"not-run"`——RUN 80 的 V8 就是同一份 `status` 回执里两个读数互相否认，当时按本文口径判 **FAIL** | **本批已修（TB-2750）**：有 durable compile 行时 `toolchainProbe` 升 `ran-present` + `toolchainProbeSource:"paper-ledger"`（`packs/v5r/tools.js:6760-6790`）；无行仍 `not-run`（不发明裁决）。判据 `tests/vmu-run80-mechanism.test.mjs §2`（实测 **113 passed / 0 failed**，含「撤掉 ledger 升级 ⇒ 已编译论文回 `not-run`」的反灯）。TB-2754 的 V8 按此验 |
| F80-8 | 所办没有开会编排路径：`vibe_v5_meeting` 无 `member` ⇒ `VMU_INVALID_ARGUMENT`，hint 却指向传 member（冒名） | 交实现车道（编排面）；TB-2754 不改这条路径的写法 |
| F80-9 | `op:"step"` 第三支结果记 `{ok:true, completed:true, turn:"t-12", instructionDelivered:false}` | **本页同批模板 §3.2 V4 行已改成三支合法结果**（模板 + `docs/03` 的 `op:"step"` 段同步）；TB-2754 的 V4 按三支写 |
| F80-10 | reply 首回执 `accepted:true`+`ignoredFields:[]` 像已计票；「不计票」在第二次 `op:"step"` 的 `fieldsIgnored[].keptWhy` | **本批已修（TB-2750）**：首回执即带 `keptNow`/`keptWhy`/`keptNowMeans`/`fieldsKeeping`/`countedLater.notCountedFields`（`kernel/turn/index.js:3816-3885`）。判据 `tests/vmu-run80-mechanism.test.mjs §4`。TB-2754 的 F80-10 探针按此验 |
| F80-11 | `vmu.turn.objective` 写不进成员子内核：`visibleToMemberKernels:false`、`crossKernelScope:"this-process"` | 交实现车道；TB-2754 不当成已知能力 |
| F80-12 | 章程承诺临时工「可读可发言可认领」，部署声明 `attendDeniedSeats:["temp"]`、`denyCountBySeat.temp:{deny:40,allow:8}` | 交实现车道；TB-2754 的 r-temp 席位只保留「到位/无表决权」两件事 |

> 另：F80-3/4/8/12 的**提示词侧**已由 TB-2752 修正（判据 `tests/vmu-run80-prompt-corrections.test.mjs`），机制侧仍按上表处置；F80-11 是已披露的跨内核限制（`vmu.turn.objective` 写不进成员子内核），未修。
> **Lead 裁定（2026-11-12 收口轮，进本页留痕）**：F80-6 **降为观察项**——理由：比较的是不同时刻的读数，
> 产品无矛盾（早一次 board 的论文确实仍在 `reviewing`，晚一次已 `finalized`），原条目不作为缺陷；只留一条
> 读数口径建议「`liveReadings.<x>.value` 自身不带时刻」。
> Lead 裁定：F80-7 **按 SOURCE 降级**——理由：`liveReadings.closure.detail.votesCast:3` @18:58:59 与顶层
> `closureVote.votesCast:4` @`votersAsOf 19:22:31` 同名不同时刻，live 侧已自报 `at`/`atSource`，
> 不算伪装现值；建议改名 `closureSnapshot`。两条都**不计入十条缺陷**。
> **TB-2751 的读数层仍未交付**（见「未闭合」）。

## 宿主 shell 故障（`0xC0000142`）：能证到什么

**症状（收窄到实测）**：本机 DSH 的 shell 工具在 run 80 里只被调用过 **3 次**（journal `job/registered` 的
`kind` 全是 `pwsh`，**没有 bash 调用**；注册于 02:17:47.160 / 02:17:47.864 / 02:17:53.370），**3/3 全失败**，
各自约 0.5–0.7 s 内结算为 `[exit code: 3221225794]`（`0xC0000142`），无 stdout、无 stderr、无超时或中止标记。
会话 journal 的证据链是 `job/registered`（`kind:"pwsh"`，label 是命令原文）→ `job/settled`（`status:"completed"`、
`cause:"producer"`、`producerReported:true`、`detail:"exit code: 3221225794"`）→ `tool/result`
（`content:[{"type":"text","text":"(no output)\n[exit code: 3221225794]"}]`、`isError:false`）。

**当时环境（journal 有记）**：`sandbox/mode` 事件 `seq:1, time:1794421042456` ⇒ `{"mode":"workspace-write"}`
（首条 shell 在其后 25 s）。**不是「mode 没记」**。对照：run 78 的 13/13、run 79 的 10/10 shell 任务在同一
`workspace-write` 下全部 exit 0（env-lane 复核，`D:/_tmp/env-lane/REPORT-20261112-env-lane.md` §3.1）。

**排除的路径**（都有原文）：

- 不是产品侧进程全死：同一窗口产品自己的 Python 子进程 **5/5 exit 0**
  （`vmu math/math_computation: python code attempt=1 exit=0`，`slvp260-ws/srv.err`）⇒ 产品起的 Python 正常。
- 不是内存/句柄耗尽：3 次调用都发生在会话开头（t+25 s 起）、每次 0.5–0.7 s 内即返回；同一进程随后 68 分钟、
  6 会话、16.17M token 正常；OS 在 02:00–03:45 无资源耗尽/崩溃事件（env-lane §3.1）。⇒ 不要用 `--max-old-space-size` 治它。
- 不是 PowerShell 崩溃：Windows Application 日志 18:15–19:30 **没有任何** `powershell.exe`/`pwsh.exe`
  崩溃事件；无 WER 报告（仅两次无关的 `ChsIME.exe` 输入法 `0xc0000602`）。
- 不是命令本身写错：`Get-Date` 这种命令也照样 3221225794。

**能证明的根因范围**：退出码 `0xC0000142` 是 `STATUS_DLL_INIT_FAILED`，即子进程在 DLL 初始化阶段就死掉；
DSH 自带的 Windows ACL 沙箱文档逐字写着这条失效模式（受限令牌缺少 logon SID + EVERYONE 保活组 ⇒
「early DLL init dies with **0xC0000142**」；控制台隔离下 `CREATE_NO_WINDOW` 子进程同样以 `STATUS_DLL_INIT_FAILED`
死亡）——`app.asar` 的 `dsh-sandbox-windows-acl/README.zh.md:104,:129`（env-lane §3.2）。因此 env-lane 的归因是：
**DSH Windows ACL 沙箱的「受限令牌子进程初始化上下文」**，宿主侧环境问题，**不是产品缺陷**（产品跑在自己的
Python 子进程里且正常）；**具体触发条件 = `NO-EVIDENCE` / `NOT-INSTRUMENTED`**（journal 不记 token/console）。

**不能证明的部分**（本页如实列出，不补推理）：

1. run 80 那次宿主进程的受限令牌实际 SID 组成与控制台句柄状态——journal 不记 ⇒ 精确触发条件 `NOT-INSTRUMENTED`。
2. run 80 的确切启动链是否相关：`run80.shell.log` 只有 `/usr/bin/bash: line 1: pwsh: command not found`
   （MSYS bash 里没有 pwsh，于是驱动落到 `powershell.exe`）；这条与 DSH 沙箱内受限令牌子进程是否同一原因**不能证明**。
3. 为什么同 build 家族、同 `workspace-write` 的 run 78/79 正常而 run 80 失败（一次性 vs 可复现）——没有第二次复现。

另：当时 dsh 版本**有记**——`dsh=0.2.1-rc.3`（`run80.drive.log:15`，驱动记录的 desktop 口径）；
「`srv.err` 没有执行器版本行」不等于「版本不可得」。另有一条与本故障无关的观察：run 80 时 `pwsh` 不在 PATH，
本页写入时复测本机只有 Windows PowerShell **5.1.20348.2849**（`Get-Command pwsh` ⇒ `CommandNotFoundException`），
harness 的 pwsh 执行器实际落到 `powershell.exe`。

## 起跑前自检探针（`D:/_tmp/slv-phase5/start-run81.ps1` 的 PREFLIGHT）

探针在输入自检之后、启动驱动之前真起一个全新 shell 子进程：要求它打印 marker、`$PSVersionTable` 与
`[Environment]::Is64BitProcess`。两个候选执行器（`pwsh`、`powershell.exe`）都失败 ⇒ **拒绝起跑**（exit 6）
并打印具名诊断（`0xC0000142` 解释为 `STATUS_DLL_INIT_FAILED`，提示沙箱令牌/PATH 两个方向）；只有 `pwsh`
失败而 `powershell.exe` 能跑 ⇒ 打 WARN 并记下 fallback，不阻断。

> **env-lane 复核的边界（重要）**：这个探针在**驱动侧上下文**起 shell，而 run 80 的故障在 **DSH 沙箱内的受限令牌子进程**
> （run 80 的驱动侧 npm/node/python 全部正常，只有 DSH 沙箱内的 3 次 pwsh 全死）⇒ **它抓不到这一类故障**。要抓必须在
> **DSH 服务端**加一次探针回合：dsh 起好后、进 100 分钟驱动前，让模型真调一次 `pwsh`（如 `Write-Output PREFLIGHT-SHELL-OK`），
> 断言 `job/settled.detail == "exit code: 0"` 且 stdout 含 marker，否则 exit 6 拒跑（env-lane §3.4；成本约 1 回合）。

```
$preflightMarker = 'PREFLIGHT-SHELL-OK'
$preflightBody = 'try { Write-Output ("' + $preflightMarker + ' version=" + $PSVersionTable.PSVersion.ToString() + " x64=" + [Environment]::Is64BitProcess) } catch { Write-Output ("PREFLIGHT-SHELL-FAIL " + $_.Exception.Message); exit 9 }'
$preflightOk = $false
$preflightTried = @()
foreach ($cand in @($pwshExe, 'powershell.exe')) {
  if (-not $cand) { continue }
  $out = @(& $cand -NoProfile -NonInteractive -Command $preflightBody 2>&1)
  $code = $LASTEXITCODE
  $text = ($out -join "`n")
  $preflightTried += ($cand + ' -> exit ' + $code + ' (' + ('0x' + ('{0:X8}' -f ([uint32]($code -band 0xFFFFFFFF)))) + ')')
  if ($code -eq 0 -and $text -match [regex]::Escape($preflightMarker)) { $preflightOk = $true; break }
}
if (-not $preflightOk) {
  Write-Host ('ABORT: PREFLIGHT-SHELL-BROKEN — no fresh shell child could start; tried: ' + ($preflightTried -join '; '))
  Write-Host 'ABORT: exit 3221225794 = 0xC0000142 STATUS_DLL_INIT_FAILED — the child died during DLL init:'
  Write-Host 'ABORT:   check the Windows sandbox restricted token (logon SID + EVERYONE keep-alive group) and PATH.'
  exit 6
}
```

## 未闭合（本轮没交付的）

- **TB-2751（RUN 80 读数层）整张未交付**：本页复核实测 `rowsAccounted`/`rowsUnaccounted`/`sourceUpdatedAt`/`fullStatusBytes`
  在工作树 **0 命中**、`tests/vmu-run80-readings.test.mjs` **不存在**（`closureSnapshot` 只在本页作为建议出现；
  `staleMs` 只在归档旧预设里）⇒ 已由 Lead 重发为 **TB-2756**（立书在 Lead 侧）。
- 旧任务书 `taskbooks/BRIEF-81.md` 是 untracked 草稿，收口时由 Lead 移走并删除，**不进提交**。

## 留档

- 原始报告：`D:/_tmp/slv-phase5/slvp260-ws/SIM-REPORT80.md`、`FEEDBACK80.md`（仓库外，3 小时临时目录，
  本页把关键读数抄进了正文）。
- 第 81 次任务书在**仓库外**：`D:\wd\vibemath开发\taskbooks\TB-2754-run81-brief.md`（新家；仓库内**不提交任务书**）。
  模板 `taskbooks/RUN-BRIEF-TEMPLATE.md` 同样在仓库外，不进本提交。
- 本轮进本提交的仓库内改动：**本页** + `vibe-math-vmu/docs/03-interface-contract.md` 的 `op:"step"` 段。
  仓库里另有旧草稿 `taskbooks/BRIEF-81.md`（untracked），由 Lead 收口时移走并删除，**不进提交**。
