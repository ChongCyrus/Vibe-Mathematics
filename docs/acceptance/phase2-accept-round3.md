# Phase 2 · `vmu-accept` · Round 3：总账刷新（B1′ ＋ C1 收窄 ＋ 两条新纪律）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`（原地维护）；② 本报告。
> **纪律**：**只读**（侦察）＋ **只写**总账与本报告；**未跑全量（T0/T1 归 Lead）／未 `regen-all`／未做任何 git 写**（只读 `git log/diff/status/ls-files/show`）。
> ★ **本报告自己是【未跟踪】文件** ⇒ 以 `git ls-files` 为输入集的门禁**此刻看不见它**（见 §4 纪律 24 —— **这正是它要说的那件事**）。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD | **`514540f`**（10-16 07:53:53，*perf(wiring-index): run the two staleness sub-checks concurrently, and refine the table-integrity rule that a gate caught only after the migration was committed*） |
| `git diff --shortstat 1960c8d..514540f` | **6 files changed, 265 insertions(+), 8 deletions(−)**（★ 我实读，与 Lead 一致） |
| 工作树 | `git status --porcelain` ＝ **2 个 `??`**：`docs/acceptance/phase2-comms-round3-b1prime-fixture.md`（`28cbc2d05b4a5fd4`）／`docs/acceptance/phase2-pack-round3-c1-host-prompt.md` ⇒ ★ **未跟踪** |
| 我的窗口 | 2026-10-16 **07:55 – 08:0x** |
| 我算的哈希（sha256[0:16]） | `scripts/generate-wiring-index.mjs` **`1D89740F0AA8A72D`**（20,757 B）／`tests/audit-table-integrity.test.mjs` **`3BF576A4427C644A`**（7,098 B）／`docs/acceptance/c1-host-prompt-sources.md` **`9a09e1c655ea54f1`**（6,028 B）／`docs/acceptance/b1prime-wiring-index-concurrency.md` **`f574caacf2b1f9b4`**（4,984 B） |

## 1. B1′：我核了什么、没核什么

**我实读（不是采信）**：`1960c8d..514540f` 的 6 个文件与 **+265/−8**；`scripts/generate-wiring-index.mjs` 现在 **20,757 B**；★ 设计要点我也核到了文本：**async ＋ `Promise.all`**、**`execFile` ＋ `maxBuffer: 8 MiB`**、**唯一调用点 `:293`（`async main()` 内）`await`**、★ **拒绝 `stdio:'ignore'`** 的理由＝`detail` 承载**第 6 轮"误导消息"修复**、**组装顺序按 `checks` 原序**。
★ **写手自陈的两条"拒绝冒充"（我照记，未复跑）**：**(i)** **hard 失败路径的 `detail` 逐字相同【未证】**（夹具没让 hard 检查失败；★ 且它**拒绝**拿 `--json` 那次相等当证据 —— **`--json` 不走 `诊断:` 分支**）；**(ii)** ★ **它没有留下无牙的常驻断言**（无夹具时断言只能测干净路径形状）。

### 1.1 ★ 秒数：三份读数**并列并各自署名**（★ 不合并成一个数）

| 来源 | 旧实现 | 新实现 | 真树 | 差值 |
|---|---|---|---|---|
| **写手（自报）** | `8.74／8.87s` | `6.50／6.42s` | `6.32／6.07s` | **≈ −2.3s** |
| **Lead（实跑）** | — | — | `7.29／6.37s` | ★ Lead 自己注明"**当时有在飞写者**" ⇒ 跨时刻读数不可靠 |
| ★ **我（实跑，配对）** | **`7.55／7.84s`**（同副本内换成 `1960c8d` 版脚本：**无 `Promise.all`／有 `spawnSync`**，并断言 `Promise.all` 已消失） | **`6.20／6.20s`** | `9.90／6.94s` ★ **首跑偏高** | **≈ −1.4s** |
| ★ **我的口径** | 副本 `D:\_tmp\r3-accept\copy`（`git archive HEAD`），**同机同会话** | 同左 | 真树 | ★ **成对比较比跨时刻更有说服力**；★ **绝对值随负载漂移、方向稳定**；★ 真树首跑 9.90s 的成因＝**我自己的副本测量与他人的 node 进程在并发**（不是代码） |

★ **结论（敢下的那一句）**：**方向成立（并发更快）**；**幅度因负载而不能只报一个数** ⇒ 本表三个来源并列。

## 2. ★★ C1：我们撤回了一条**自己记下的边界**（本轮最重要）

**我读到的（`vmu-pack2` 从宿主归档按 offset 读；我只读其文件，未独立重读归档）**：`/dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js`
- `:365` 导出含 **`renderPrompt`／`renderContextSections`／`renderContextSnapshot`** ⇒ **渲染函数是导出的**；`:113-114` 文档写明返回 **rendered prompt**；
- `:355` **`ctx.waterfall(…, "system-prompt/assemble", assembly, …)`** ⇒ **插件可挂上拿到 assembly**；
- `:307-308`／`:338-354` 服务方法**返回 post-waterfall assembly**（sections 全序＋contexts＋tools＋variables）；`:315-316` 遍历 **global ＋ 每个 scoped layer**；
- `:240-242` `section()` 返回 **disposer**（不是读句柄）；`:249-250` `getSectionOrder(name)`＝**静态数字查表**。

**⇒ 总账里的写法（已改）**：★ **撤回**"`systemPrompt` 不可达"按**原文**的写法；**收窄为**："**注册句柄是 disposer；组装后的提示词由宿主服务产出，其渲染函数已导出、assembly 经 waterfall 传出 ⇒ 原则上可观测；我方插件能否【被授予】该服务属【访问问题】，尚未核实**"。
★ **保留并解释的仍是【组合边界】**：**我们的回执只报我们注册的 section** ⇒ **整份提示词不在回执里**（继续成立）。
★ **R33 真机那条降级读数仍有效但改解读**：它证的是**"我方入口没有注入、拿不到服务"＝访问问题**，**不是"宿主没有该能力"** ⇒ **不能再用它支撑"宿主能力边界"**。
★★ **状态严格写"已收窄；覆盖情况核验中"**：本仓 `tests/vmu-assistant-systemprompt.test.mjs`／`tests/vmu-prompt-section-guard.test.mjs` **尚未被读** ⇒ **"是否本来就已被既有测试覆盖"仍未推导**（`vmu-pack2` 在读）⇒ **不许写成"已撤回且已解决"**。

**同批三条硬事实（已入 §0.7）**：**(a)** **31 个具名 order 槽、数值固定**（`:10-43`；全序＝`:96-98` `order \|\| compareNames(name)`）⇒ ★ **插件不能自由选位置、只能挑槽**，槽内**按名确定性排序**＝ **对"可调控性／扩展性"的硬事实**；★ **6 个槽定义但未被宿主引用**（`TOOL_REPORT`／`WEB_SURFACE`／`TOOL_PTY`／`TOOL_LSP`／`TOOL_SESSION_QUERY`／`TOOL_COMPUTER_USE`）⇒ **名额余量**。**(b)** **persona 是【同名遮蔽】不是叠加**（`:49-54`；`PERSONA_SUFFIX_SECTION`＝槽 **10200**）。**(c)** **`team:policy`（槽 600）是宿主侧**、属 teammate 实验环境，**不在我们回执里**。

## 3. 两条新纪律我做了**独立复算**（不是采信）

| 纪律 | 我的复算 | 读数 |
|---|---|---|
| **24「输入集来自 git 的门禁看不见未提交文件」** | ★ 我实读 `tests/audit-table-integrity.test.mjs:20` ＝ **`git ls-files '*.md'`**；★ 并**现场亲见**两个 `??` 未跟踪文件 | ★ 跟踪集 **365**（★ **不是 Lead 说的 362** —— 差的 3 个正是 `514540f` 里新落的 `.md`：本报告上一版／`b1prime-…`／`c1-…`）⇒ ★ **"读数要说清哪一版"**；★ **"提交前绿 ≠ 提交后绿"** |
| **25「判据自称的害处不适用时，改规则而不是改证据」** | ★ **我自己写探针**（`D:\_tmp\r3-accept\probe-table-rule.mjs`）在**同一输入集**上跑**旧/新两条规则** | ★ **旧命中 1**（`docs/acceptance/assistant-round14-report.md:179`）／**新命中 0**／**豁免 1**（同一处）＋ **谓词自证**（`newTable=true`／`orphaned=false`）⇒ ★ **与 Lead 的"旧 1／新 0"逐字同向**（★ 我的输入集是 **365**，不是 362） |
| **26「仪器故障要当仪器故障报」** | 只读转述 | PowerShell 吃掉 `$` ⇒ 正则被静默改成字面量 ⇒ inline 探针与套件不一致；★ **改写进文件后一致** |
| **27「合并目录 ⇒ 文件名撞车」** | 我实读 | `docs/acceptance/comms-round2-report.md` **确为上一阶段的同名报告**（`v5r-reader-c` 的 R2，88 行）；★ 写手**另起名**而非覆盖；新约定 **`phase2-<family>-roundN-<topic>.md`** |
| **28「引用位置也要核」** | ★ **我犯过同一个错** | 我在总账的 C1 行里**照抄了 Lead 的错引用**（把两个测试写成"在 profile 树／本项目自己的 `dsh-vibe-math` 插件里"）⇒ ★ **已按更正改**：**它们在本仓 `tests/`**；★ Lead 已在 `c1-host-prompt-sources.md` 里更正并**注明"是写手发现的"** |

## 4. 门禁读数（★ 我实跑；"核了/没核"分开）

| 门 | 读数 | exit | 来源 |
|---|---|---|---|
| `node tests/audit-table-integrity.test.mjs`（`514540f`） | `EXIT=0`；**跟踪 md 365／表行 20,587／breaks 0／breaksExempted 1**；vmu 集列数不符 **163 of 8,258**（**report-only**） | 0 | ★ **我实跑**（写入前后各一次，读数相同） |
| 我的规则复算探针 | **旧 1／新 0／豁免 1** ＋ 谓词自证 | 0 | ★ **我实跑** |
| `audit-claim-traceability`／`audit-package-membership`／`audit-code-size`／`audit-doc-index`／`check-docs` | **8/0／29/0／9/0／5/0／PASS** | 0 | ★ **我实跑**（R2 那一版；R3 我只复跑了 table-integrity） |
| T0 **25/25**／T1 `GATE_SCOPE=vmu` **326/326**／`regen-all --check` **15/15 in sync** | — | — | ★★ **Lead 的读数（转述）：我没跑** |

## 5. 诚实边界

1. **未跑 T0/T1／`regen-all`**（归 Lead）；**未做 git 写**（★ 因此我的两次写入是**未提交**状态）。
2. **C1 的归档读数我是转述**（`vmu-pack2` 从 asar 按 offset 读）—— ★ 我**没有**独立重读归档；★ 我只读了两份**仓内文件**（`c1-host-prompt-sources.md`／`phase2-comms-round3-b1prime-fixture.md`）。
3. **秒数是负载相关的**：我给的是一张**三来源并列表**，★ **不把任何一个数写成"最终值"**；★ 我的真树首跑 9.90s **已归因于并发负载**（不是代码）。
4. **`phase2-comms-round3-b1prime-fixture.md` 的 D11（`VMU_SETTINGS_DOC` 缝矛盾）是【待解】** —— 我**只读**其报告，**没有**替它跑那个决定性实验。
5. ★ **本报告自己未跟踪** ⇒ 若你在提交前跑以 `git ls-files` 为输入集的门禁，**看不见它**（纪律 24 的自指现场）；★ 建议 **先 `git add` 再跑门禁**。

## 6. ★ 我窗口内**更晚**落地的 R4（`D11` 解除）：范围、读数与残留

★ **在我这一轮的中途**（08:01–08:03）又有两个文件落地 ⇒ 我按"**读数要说清哪一时刻**"把它们**单独记**，不与前面的读数混：

| 文件 | 我算的哈希 | 我的读数 |
|---|---|---|
| `tests/b1prime-staleness-report.test.mjs`（新） | **`500bf88413c6e68c`**（5,219 B，78L） | ★ **我实跑 ＝ `B1PRIME STALENESS REPORT: 8 passed, 0 failed`，exit 0**（★ **不是采信**；输出里那两行 `STALE … run: node scripts/generate-vmu-settings-table.mjs --write` 来自**夹具臂**，不是真树） |
| `docs/acceptance/phase2-comms-round4-b1prime-resident.md`（新） | **`aa881b5bd9dac939`**（6,025 B，53L） | 只读：**R3 三次失败的根因＝【变异没落地】**（宽松正则命中 `docs/04` **表体外**的行 ＋ **off-by-one**：`headerIdx+1` 是分隔行、真表体首行 `headerIdx+2`；表头实测 0-based **258**）⇒ ★ **缝 `VMU_SETTINGS_DOC` 是活的** ⇒ ★ **§3.3 D11 解除**（"变异打错行"族**第 4 个现场**） |

★ **R4 自陈的"没核/残留"（我照记，未替它做）**：① ★ **"新旧 hard 路径逐字对比"未做** —— 替代＝**直接断言"父进程 `detail` ≡ 子进程自己输出的最后一行"**（★ **更强**：钉住**消息的内容来源**），★ 它**如实写明"我不把替代说成'做了新旧对比'"**；② ★ **`tests/b1prime-staleness-report.test.mjs` 尚未登记进 `package.json files[]`**（**本轮唯一登记欠账** ⇒ 我在总账立了 **G0-k**）；③ 性能未复测（沿用 R2 真树 `6.07–6.32s`）。
★ **总账已按此更新**：文首 **"收轮后追加·七"**、**§0.7 的 B1′ 两行**（R3 原样保留为历史）、**§3.3 D11**、**§2 目标 0 的 G0-k**、**§5.9-15 的第 4 个现场**。
★ **一处我自己的观察（供你裁）**：R4 的断言用"**子进程末行 ≡ 父 `detail`**"替代"新旧对比"是**对的方向**（**同源断言**优于**同值断言**）；★ 但它**不覆盖**"并发引入的**跨 kind 串味**"以外的东西 —— 那部分由 #3/#4 两条（**hard 桶恰好一条**／**soft 措辞不漏进 hard**）承担 ⇒ ★ **两条合起来**才是"组装顺序确定"的证据，**单看任一条都不够**。
