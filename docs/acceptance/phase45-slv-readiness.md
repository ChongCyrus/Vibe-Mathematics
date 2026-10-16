# Phase 4/5 就绪评估 · **真机 SLV 能不能开始、开始前要满足什么**

> 轮次：Round 12/256。★ 作者＝Lead。★ 依据：`docs/slv-playbook.md`（现成手册，121 行，**本轮实读**）。
> ★ 本文件只做**就绪评估**，不启动任何运行。

## 1. ★ 机制现状：**手册齐备，且带实测成本**

★ `docs/slv-playbook.md` 已含：★ **隔离**（克隆 profile、改名、从**纯 ASCII** 临时 cwd 启动、独立端口 ＋ `--no-open`）／★ **模拟声明必须留可检索证据**／★ **驱动 CLI 的 23 个开关**（常用组合 `--port --token --preset … --task-file --jsonl [--follow-stream] [--follow-members]`；★ 中途注入用 **`--steer-after`**，不另开会话）／★ **预算与上限**／★ **能建立什么**／★ **中止触发**／★ **产物与清理**／★ **结论写法** ✓

★★ **实测成本（手册自带，可直接用来排期）**：★ 最小 `configure`+`status` ≈ **8 s**；★ **v5 启动 ＋ 1 轮 ≈ 21–25 s / ≈150 k tokens**；★ v4 ≈ **100 s / 732,888 tokens**；★ 2 名常驻会议 ≈ **64 s / 473 k** ⇒ ★ 一律用**受管后台作业**跑 ✓

## 2. ★★ 两条会决定成败的铁律（★ 已读，不是猜）

1. ★★ **§2 的取反铁律**：★ 凡用"模拟某条件不成立"来证明分支行为，**必须逐一否认新代码可能达成该条件的每一条路径** ⇒ ★ 否则"未触发"只是**你的模拟没覆盖**，★ 不是代码没走那条路 ✓
   ★ **可操作判定**：★ **先枚举全部入口**（环境变量／已知安装根／PATH／配置项／**回退链的每一环**）⇒ **逐个否认**；★★ **断言里必须出现【否定性证据】**（`exe === null`／`tried.length === N`／`result === 'not-detected'`），★ **不能只写"结果符合预期"** ✓
   ★★ **无法否认的（本机就存在）⇒ 写成 §5 的【实测边界】**，★ **不得声称已覆盖** ✓
2. ★★ **§5 的天花板**：★★ **有界运行只能建立"落位与可观测性"，【不能】建立"收敛/收口"结论** —— ★ 收敛结论**必须来自随包套件** ✓
   ★ 且**单客户端** ⇒ 并发要靠**两个克隆 ＋ 两个端口**模拟，★ 否则**如实声明超出范围** ✓
   ★ **无任何引擎**（Octave/Julia/MATLAB/Maple/Wolfram）⇒ 那些面只能核对**诚实文本**（`configured` ＋ `absent[]` 每项带 `why`）⇒ ★ **那是部分替代，不是执行验证** ✓
   ★★ **一条既有行为（已实测、不主张缺陷）**：★ **根/主代理**调用 `ask_user_question` 这类"等人工答复"的工具时，★ **答复到达前整所流程停摆** ⇒ ★ **长跑时避免让根代理走到提问分支**（★ 把问题、范围、验收条件在任务里一次说清）✓

## 3. ★★ 开始前必须满足的门（★ 就绪 ≠ 可以开始）

| # | 门 | 现状 |
|---|---|---|
| **G1** | ★ **审计收口**：★ 用户的目标 ④（全面审查至 0 问题）**在 ⑤⑥ 之前** ⇒ ★ **T1 必须全绿** | ★ **未满足**：★ T1 本轮 339/6 红，★ **3 条已修、5 条已派修（`task-240`）** ⇒ ★ **等它收口** |
| **G2** | ★ **P2-01 与惰性键**：★ 不必全部做完才能 SLV，★ 但**动过的键必须验证过**（★ 我们已迁 3 个，★ 每个都做了前后 1228 值对比） | ★ **满足**（★ 后续批次继续） |
| **G3** | ★ **产物与清理纪律**：★ **只删自己的**（★ 按 sessionId，★ **绝不按时间窗批量删** —— 手册载明历史上这样做**误删过别人的投影缓存**） | ★ **满足**（★ 已读、已知） |
| **G4** | ★ **模拟声明**：★ 用户目标 ⑤ 明确要求"**告诉代理这是一次模拟，让它们以测试各种功能为主**" ⇒ ★ 落进 `--steer-after` 或任务文本，★ **并留可检索证据** | ★ **待写**（★ 属 Phase 5 的准备工作） |

## 4. ★★ 环境实测（Round 13，★ 本机读到的，不是推测）

| 项 | 读数 | ★ 判定 |
|---|---|---|
| **DSH 主目录** | ★ **`C:\Users\admin\.dsh`** 存在（★ 内含 `.agent-presets`／`attachments`／`cache`／**`dsh-runtimes`**／`llm-deepseek`／**`profiles`**） | ★ **满足** |
| **运行时入口** | ★ **`~/.dsh/dsh-runtimes/dsh-primary-runtime`** | ★ **满足**（★ 手册 §1 的 `node <dsh>/lib/bin.js` 按此定位） |
| ★★ **profile 可克隆** | ★ **`~/.dsh/profiles/` 下有 `desktop`／`headless`／`hubtest` ＋ 一族 `hubtest-*`**（`hubtest-dshvibemath2`／`hubtest-dshvibemathlatest`／`hubtest-fix`／`hubtest-fix2`／`hubtest-fresh`／`hubtest2`） | ★★ **满足，且有【先例】**：★ 这些 `hubtest*` **正是手册 §1"克隆一份 profile"留下的痕迹** ⇒ ★ **这条路以前走通过** ✓ |
| ★ **agent preset 已装** | ★ **`vibe-math-v2`／`v3`／`v4`／`v5`** ＋ `.vibe-math-backup` ＋ `.vibe-math-installed.json` | ★ **满足**（★ 手册示例用 `--preset vibe-math-v4`） |
| ★★ **`vibe-math-v5r` 不在已装列表里** | ★ 列表只有 v2–v5 | ★ **注意**：★ Phase 4 测原 v5／v5r ⇒ ★ **v5r 需要按包安装**；★ **Phase 5 测 `vmu+v5r pack` ⇒ 正是本仓要产出的那个整合包** ⇒ ★ **"装出 v5r／vmu+v5r preset"是 Phase 4/5 的第一步工作** ✓ |
| **端口** | ★ **19387 = 占用**（★ 就是用户当前这个 GUI）／★ **19388、19389 = 空闲** | ★ **满足**（★ SLV 用 19388／19389，★ **绝不碰 19387**） |
| **本仓的 patch** | ★ `cordis.patch.yml` 存在于仓内 | ★ **满足**（★ 与 agent-teams 研究的 A1/C2 同形） |

★★ **结论**：★ **手册 §1 的隔离三件（克隆 profile／独立端口／`--no-open`）在本机【都可行】，且有历史先例** ✓
★★ **唯一新增的准备工作**：★ **把 `vibe-math-v5r`（Phase 4）与 `vmu+v5r pack`（Phase 5）装成可用的 preset** —— ★ 而后者**正是本阶段要交付的整合包**，★ 所以 Phase 5 的第一步就是**用 pack 装出一个 preset** ✓

## 6. ★★ preset 的安装机制（Round 14，★ 只读查明，★ 未安装任何东西）

★★ **`installer.js` 是"dsh-vibe-math merged bundle installer — VERSIONED AUTO-UPDATE"**（★ 头部逐字）：★ **当这个 bundle 被安装时**（★ 例如 `dsh plugin --profile <name> add dsh-vibe-math`，★ **或从 dsh-market**），★ **它把【四个】agent preset 从包里拷进 DSH 的 preset 根** ⇒ ★ **用户立刻在 picker 里看到四个** ✓
★ **安装状态记在 `<presetRoot>/.vibe-math-installed.json`**：★ **version ＋ 每文件 hash ＋ provenance** ✓ —— ★ 本机该记录写着 **version `2.8.1`** ✓
★ **本机已装的 `vibe-math-v5` 内容**：`架构图.md`／`实现方案.md`／`agent.cordis.yml`／`math-computation.js`／`math-engines.js`／`preset.yml`／`vibe-math-v5.js` ✓

★★★ **因此 Phase 4 的正确动作（写死）**：
1. ★★ **克隆一个 profile**（★ 手册 §1；★ 本机已有 `hubtest*` 先例），★ **绝不碰用户的 `.agent-presets`／`profiles/desktop`** ✓
2. ★ 在**克隆里**装一个**包含 `vibe-math-v5r` 的 bundle 版本**（★ 本机现装 **2.8.1**，★ 而 v5r 按 release-notes 应在 **2.8.2+**）⇒ ★★ **所以 Phase 4 的第一步是"确认哪个版本含 v5r"并在克隆里装上它** ✓
3. ★ 用**独立端口**（★ **19388／19389 空闲**；★ **19387 是用户当前 GUI，绝不碰**）＋ **`--no-open`** 启动 ✓
4. ★ 从**纯 ASCII 的临时 cwd** 启动（★ 手册 §1）✓

## 6b. ★★★ 最后一块未知已解决：**哪个版本含 `vibe-math-v5r`**

| 项 | ★ 读数 |
|---|---|
| ★ **本仓版本** | ★★ **`2.8.5`**（包名 **`dsh-vibe-math`**） |
| ★ **本机已装版本** | ★ **`2.8.1`**（★ 见 `.vibe-math-installed.json`）⇒ ★ **落后 4 个版本** |
| ★ **仓内是否含 `vibe-math-v5r`** | ★★ **含**（★ 仓根有 `vibe-math-v5r/`） |
| ★★ **installer 是否发它** | ★★ **发** —— `installer.js:80` 逐字 **`src: 'vibe-math-v5r'`**（★ 与 `:73` 的 `vibe-math-v5` 并列） |

⇒ ★★★ **结论**：★ **Phase 4 在机制上【已无阻塞】** —— ★ **克隆 profile → 把 `dsh-vibe-math` 2.8.5 装进克隆 → `vibe-math-v5r` 就出现在 picker 里** ✓
★ **且这解释了为什么本机只有 v2–v5**：★ 已装的是 **2.8.1**，★ 而 v5r 由 **2.8.5** 带上 ✓

★ **G1 是唯一的硬阻塞** ⇒ ★ **`task-247` 一绿（T1 全绿），Phase 4 即可开始** ✓
★ **顺序**：★ **Phase 4** ＝ 原 v5／v5r 的脚本化真机（★ 按手册，★ 用**受管后台作业**）⇒ ★ 发现即**单跑复现**⇒ 真回归才修 ⇒ ★ **Phase 5** ＝ vmu+v5r 全流程 SLV（★ **带模拟声明**，★ **跑到结题/收敛**）✓
★★ **但 Phase 5 的"收敛"结论必须谨慎**：★ 手册 §5 明说**有界运行建立不了收敛** ⇒ ★★ **所以 Phase 5 的交付应写成"落位／可观测／提示词交互正常"＋"收敛由随包套件背书"**，★ **不能把一次有界运行写成收敛证明** ✓

## 7. ★★ 因此的排期

★ **G1 是唯一的硬阻塞** ⇒ ★ **`task-247` 一绿（T1 全绿），Phase 4 即可开始** ✓

## 7b. ★★ 已执行的准备（Round 15）

| 步 | ★ 读数 |
|---|---|
| ★★ **克隆隔离 profile** | ★ **`C:\Users\admin\.dsh\profiles\slv-v5r-r15`**（★ 由 `hubtest` 拷贝，7 个条目）✓ |
| ★★ **改名（手册 §1 第 2 步）** | ★ `dsh-profile-hubtest` → **`slv-v5r-r15`** ✓（★ 避免与用户 profile 混淆） |
| ★ **用户自己的东西【未动】** | ★ `.agent-presets/` 仍是 `.vibe-math-backup`／`vibe-math-v2/v3/v4/v5`／`.vibe-math-installed.json` ✓ |
| ★ 空间 | ★ C: 余 **10.6 GB**；★ 源 profile 仅 **15.4 MB** ⇒ ★ **克隆很便宜** ✓ |

★ **下一步（等 T1 全绿）**：★ 把这个 **`dsh-vibe-math` 2.8.5** 装进**克隆**（★ 从而拿到 `vibe-math-v5r`）⇒ ★ 用**独立端口 19388/19389 ＋ `--no-open`**，★ **从纯 ASCII 临时 cwd** 启动 ✓

### 7c. ★★ Round 15：克隆里装的是什么（★ 实读）

| 项 | ★ 读数 |
|---|---|
| ★★ **`dsh` CLI 存在** | ★ **`C:\Users\admin\scoop\apps\nodejs-lts\current\bin\dsh.cmd`**（＋ `.ps1`）✓ |
| ★ 运行时目录 | ★ `~/.dsh/dsh-runtimes/dsh-primary-runtime/`：★ `dependencies`／`runtime.json` ✓ |
| ★★ **克隆里已带的 bundle** | ★★ **`dsh-vibe-math` ＝ `2.8.1`**，★ 含 preset **`vibe-math-v2/v3/v4/v5`**，★★ **不含 `vibe-math-v5r`** ✓ |
| ★ 用户自己的记录 | ★ `.vibe-math-installed.json` 也是 **2.8.1**、★ 四preset，★ **与克隆一致** ⇒ ★ **克隆没有引入任何新东西**，★ 干净 ✓ |

⇒ ★★★ **因此 Phase 4 的唯一动作就是**：★ **把 `dsh-vibe-math` 2.8.5 装进克隆**（★ 用上面那个 `dsh` CLI；★ 获 `vibe-math-v5r`）✓

### 7d. ★★★ Round 15 实测：**npm 上的 2.8.5 不带 `vibe-math-v5r`** ⇒ ★ 改从【本仓】装

| 步 | ★ 读数 |
|---|---|
| ★ 第一次装（不带版本） | ★ exit 0，但 ★ **`reused 1, added 1`** ⇒ ★ **版本没变**（★ 仍是 2.8.1）✓ |
| ★★ 第二次装（`dsh-vibe-math@2.8.5`） | ★★ **成功升级**：★ `- dsh-vibe-math 2.8.1` → **`+ dsh-vibe-math 2.8.5`** ✓ |
| ★★ **但 `vibe-math-v5r` 仍然【不在】** | ★ 2.8.5 的包目录里只有 **`vibe-math-v2/v3/v4/v5`** ✓ |
| ★ 用户自己的 preset 根 | ★ **全程未变**（★ 仍是 `.vibe-math-backup` ＋ v2–v5 ＋ `.vibe-math-installed.json`）⇒ ★ **隔离守住了** ✓ |

★★★ **结论与更正**：★ **npm 上已发布的 `2.8.5` 并不包含 `vibe-math-v5r`** —— ★ 尽管**本仓**的 `installer.js:80` 逐字 `src: 'vibe-math-v5r'` ⇒ ★★ **本仓【领先于】已发布的产物**（★ 这完全合理：★ 本阶段一直在改这个仓）✓
⇒ ★★ **因此 Phase 4 的正确装法【不是】装 npm 版本，而是【从本仓装】**：
```
dsh plugin --profile slv-v5r-r15 add <本仓路径>        # ← 用本仓当前状态，它含 vibe-math-v5r 与 installer 条目
```
★ **这同时更符合 Phase 4 的目的**：★ **我们要测的是【本仓的 v5r】**，★ 不是一个已发布的产物 ✓ —— ★ 而且**可复现、自包含** ✓

### 7e. ★★★ Round 16：**从本仓装成功 ⇒ Phase 4/5 的目标 preset 全部到手**

★ **安装读数（逐字）**：★ `- dsh-vibe-math 2.8.5` → ★★ **`+ dsh-vibe-math link:D:/wd/vibemath开发/Vibe-Mathematics`** ✓
★ **实测它是符号链接**：★ `LinkType=SymbolicLink`，★ `Target=D:\wd\vibemath开发\Vibe-Mathematics` ⇒ ★★ **克隆用的是【本仓的实时状态】** ✓
★★ **`vibe-math-v5r` 现已出现**（★ 含 `docs`／`架构图.md`／`设计总览.md`／`agent.cordis.yml`／`math-computation.js`／`math-engines.js`／`MEETING-PLATFORM-A/B/C-*.md` …）✓
★★★ **bundle 现在提供【六个】preset**：**`vibe-math-v2`／`v3`／`v4`／`v5`／`v5r`／`vmu`** ✓✓
⇒ ★★ **这意味着 Phase 4（原 v5r）与 Phase 5（`vmu+v5r` pack 的 preset）两个目标【都已就位】** ✓
★ **用户的 preset 根【仍未被碰】**（★ 仍是 `.vibe-math-backup` ＋ v2–v5 ＋ `.vibe-math-installed.json`）✓

★★★ **因此：机制上【再无阻塞】** —— ★ **唯一残留的门就是 `T1 全绿`**（★ 用户的目标 ④ 在 ⑤⑥ 之前）✓

### 7f. ★★★ Round 18：**确切的启动命令已查明**

★ **`dsh` 的 CLI 形态（实读 `dsh --help`）**：★ `dsh [--profile] <name> [options] [app-args...]` ✓
★★ **headless 入口（★ 这就是 SLV 要用的那个）**：★ 帮助逐字 **`dsh headless "run the tests"` ⇒ "answer one task, print the result, and exit"** ✓✓
★ 其它：★ `dsh web`（启动 web profile）／★ `dsh plugin --profile <name> add <pkg>`（★ 已用过两次）／★ `--from-default-profile <template>`（从模板建 profile）／★ `--patch <path>`（额外 overlay）／★ `--dump-config` ✓
★ ★ **"arguments after the launcher flags reach the app"** ⇒ ★ 手册 §3 的 **23 个开关是【app 的**开关**】**，★ 放在 profile 名之后 ✓

★★ **因此 Phase 4 的命令是**（★ 待 T1 全绿即执行）：
```
dsh --profile slv-v5r-r15 headless --preset vibe-math-v5r \
    --task-file <任务文件> --jsonl <产物.jsonl> \
    --timeout <ms> --max-tokens <n> --cwd <纯 ASCII 临时目录>
```
★ 并**从 `--no-open` 打印的那行** `dsh web: http://127.0.0.1:<端口>/?token=<TOKEN>` **取 token**（★ 认证已实测：★ `GET /?token=…` ⇒ **303 ＋ Set-Cookie**；★ 之后 `/api/*` 带 cookie **200**、不带 **401**）✓
★★ **模拟声明**（★ 用户目标 ⑤ 明确要求）⇒ ★ **写进任务文件**（★ 或 `--steer-after` 中途注入）⇒ ★ **并留可检索证据** ✓

## 8. 没核（★ 与"核了"分开）

1. ★ **手册我读的是 §3–§8 与开头**（★ 逐字读了 §2 铁律、§3 开关表、§4 预算、§5 能力边界、§6 中止、§7 清理、§8 结论写法）⇒ ★ **§1 的隔离命令我只看了标题级**。
2. ★ **没有核本机是否有 DSH 入口、克隆 profile 是否可行、端口是否空闲**（★ 那是 Phase 4 的第一步）。
3. ★ **没有核** `--preset` 的可用取值清单（★ Phase 4 要用）。
4. ★ **没有核原 v5／v5r 的 SLV 历史报告**（★ 用户提过"之前做过/脚本化过"，★ 我**未去找那些历史产物**）。
5. ★ 本文件未启动任何运行、未建 profile、未起端口；未跑 git；未跑门禁。


---

## 9. ★★★ Round 22：`G1` 已满足 —— **T1 全绿**，Phase 4 的硬阻塞解除

★ **读数（逐字）**：`TOTAL 341  PASS 341  FAIL 0  (suites 307 · probes 34)` ✓✓✓
★ 从本轮开始时 T1 的 **6 条红**，经 **4 → 3 → 1 → 0** 清完 ⇒ ★ **Phase 4 所需的每一项都已就绪**：
- ★ **机制**：★ headless 启动命令（`dsh --profile <name> headless …`）／★ token 取自 `--no-open` 打印行／★ 认证已实测（token ⇒ 303 ＋ cookie；`/api/*` 带 cookie 200、不带 401）✓
- ★ **物质**：★ 隔离克隆 `slv-v5r-r15`（**用户自己的 preset 根全程未被碰**）／★ 从**本仓**装成 `link:` ⇒ **六个 preset 全在**（含**原 `v5r`** 与**本工作产出的 `vmu`**）／★ 端口 19388／19389 空闲（**19387 是用户界面，绝不碰**）✓
- ★ **成本模型**（手册实测）：★ v5 ≈ 21–25s／≈150k；★ v4 ≈ 100s／732,888 tokens；★ 最小 configure+status ≈ 8s ⇒ ★ **一律用受管后台作业** ✓
- ★ **手册铁律**：★ **取反必须否认每一条路径 ＋ 断言要有否定性证据**；★ **有界运行只建立"落位与可观测"，不建立"收敛"**（★ 收敛须由随包套件背书）；★ **根代理提问会阻塞整所流程**（★ 长跑时避免走到提问分支）✓
- ★★ **模拟声明**（★ 用户目标 ⑤ 要求）：★ 写进任务文件或 `--steer-after`，**并留可检索证据** ✓

★★ **因此：下一轮即可启动 Phase 4**（★ 原 v5／v5r 的脚本化真机）⇒ ★ 发现即**单跑复现**，真回归才修 ⇒ ★ 之后进 Phase 5（`vmu+v5r` 全流程 SLV，带模拟声明、跑到结题）✓
