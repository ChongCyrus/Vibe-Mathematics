# Round 21 · `task-131`（改名对照实验）—— **未跑：判别力已被 H2 的确认消掉**（＋我自己的 harness 缺陷与 H2 的独立核验）

> 负责人：`vmu-assistant2`（本任务唯一交付＝本报告；写范围只这一个文件）。
> 硬约束遵守：**未跑全量／未 `regen-all`／未 git／未改任何代码·测试·docs**；**未烧任何会话**（见 §1）；凭据副本**已删并核验**（§1.3）；宿主/端口无残留（§1.3）。

---

## 0. 结论（一句话 + 两条）

**改名实验不再有判别力 ⇒ 我判它"不跑"**，理由不是"跑不动"，而是**它的"能起来"结果会被 H2-absence 完整解释掉**（§2）。**H2 已由 `vmu-core2` 确认并修好，我也独立复跑了他的探针**（§3）。**下一步应是"按原判据跑一次 arm A（`config.packs:['v5r']`）"**（§4，等 Lead 一句话）。

---

## 1. 我为这个实验做了什么（以及一次**我自己的**失败）

### 1.1 三臂已按"只改一个因子"建好（可复用）
由**对照组的原始字节**生成，并用脚本逐行 diff 证明**只有 1 行不同**（`r131-build-arms.mjs`）：
| arm | L13（唯一变量） | sha256(前 16) |
|---|---|---|
| **A（对照，＝R21b 原样）** | `packs: ['v5r']` | `73217CFC2D912686` |
| **B（处理：换不认识的键名）** | `packList: ['v5r']` | `CD6AEBE39E00647D` |
| **C（我加的细化：保留键＋空值）** | `packs: []` | `25ABDD4161435F0A` |
三臂的 L17（`vmu.packs: { active: ['v5r'] }`）**完全相同**（未动）。C 是我加的：它本可把"**键名是否保留**"与"**值 `v5r` 被解析**"分开——**在 H2 未排除前这是有用的**，H2 确认后它也一并失去判别力（同因：没有 pack ⇒ 没有 prompt 数据）。

### 1.2 ★ 我的第一次执行**失败了，0 会话 0 token**（如实记）
`r131-run-arms.ps1` 里我把启动命令写成 `node <dsh>/lib/bin.js **web** --profile ext …`，被 CLI 拒：*(原样)*
```
error: option '--profile <name>' argument 'ext' is invalid. select a profile only once
```
⇒ **三个 arm 的宿主都没起来**，驱动器**从未启动**（`r131-A/B/C-session.log` 均不存在）⇒ **没建过任何会话、没花任何 token**。**修法**：去掉 `web`（`web` 自身就是模板/预设名；此前成功的启动都是 `dsh --profile ext … --no-open`）⇒ 已改成 `node bin.js --profile ext --patch … --port … --no-open`，并用**免费**的 `--dump-config` 验证参数形状：**exit=0**，overlay 行与 `packs:` 均在其中。

### 1.3 卫生（本次执行留下的东西全部处置）
- **凭据副本**：`D:\_tmp\r18-home\.credentials.yaml` ⇒ **已删除**（`Test-Path`=False）；`Get-ChildItem D:\_tmp -Recurse -Filter '.credentials*'` ⇒ **none**；**操作者自己的 `~/.dsh/.credentials.yaml` 未动** ✓
- **宿主/端口**：`7700–7900` 段**无任何监听** ✓（三臂的宿主从未起来，`Stop-Process` 报了 pid 不存在——这本身就是"没起来"的旁证）

---

## 2. ★ 判定：为什么现在跑改名实验**得不到 H1 的答案**

**H2（我们的 `:706` 读未注入的 `ctx.systemPrompt`）成立**（§3）⇒ 该行**只在"真的有 pack 装载、从而有 pack 的提示词数据"时才被执行**（工作树 `vibe-math-vmu.js:721`：`if (effectivePrompts.length > 0)`）。于是：

| arm | `config.packs` | 装载 pack？ | `effectivePrompts` | `:721` 分支 | 预期结果 | 对 H1 的信息量 |
|---|---|---|---|---|---|---|
| **A** `packs:['v5r']` | `['v5r']` | **会**（走我们的装载链） | **非空** | **执行** ⇒ 触碰 `systemPrompt` | 修前＝崩；**修后＝不崩（具名降级）** | ★ **有**（见 §4） |
| **B** `packList:['v5r']` | `undefined` | **不会** | 空 | 跳过 | **能起来** | **零**：`undefined` 与"键被 DSH 保留并吞掉"**同真** ⇒ 无法区分 H1 |
| **C** `packs:[]` | `[]` | **不会** | 空 | 跳过 | **能起来** | **零**：同上 |

⇒ **B/C 的"能起来"是被 `effectivePrompts.length > 0` 为假解释掉的**，与"`packs` 是否是 DSH 预设行的保留键"**无关**。**先跑改名会得到一个"看起来确认 H1"的假确认** —— 这与 Lead／`vmu-verify2` 判"H2 先排除"的那条逻辑是**同一件事的两个方向**。
⇒ **所以 `task-131` 的改名臂：判"不具备判别力、本轮不跑"**；**若** arm A 修后**仍崩**（出现别的错误），**那时**再跑 B 才有意义（用来区分"是我们的 config 形状／装载链"还是"键名层面"）。

---

## 3. H2 的独立核验（**我自己跑的**，不转述 core2）

**他的探针**：`D:\_tmp\r21b-h2-probe.mjs`（3263 B，16:54；**不需要 DSH**——用一个"访问计数 + 会抛"的 `systemPrompt` getter 充当 ctx）。**我原样复跑**（`node D:\_tmp\r21b-h2-probe.mjs`），原样读数：
```
— control: packs: []      ⇒ systemPrompt getter touched = 0 ；threw = no ；effectivePrompts=[] ；activePacks=[]
— suspect: packs: ['v5r'] ⇒ systemPrompt getter touched = 1 ；threw = no（★ 修复后不再抛）
stderr（具名降级）：vmu: prompt text is declared but the host systemPrompt service is NOT reachable (not injected?): cannot get property "systemPrompt" without inject
READ-OUT: control touched 0 (expect 0) / withPack touched 1 (expect >0 if H2 holds) / withPack error: none
```
**⇒ 判定**：**H2 成立** —— **`config.packs:['v5r']`（`docs/10:436` 那条"文档化装载点"）正是第一次执行到我们那行 `ctx.systemPrompt` 的原因**（无 pack：0 次；有 pack：1 次）。**修法已落地**（我在工作树读到 `vibe-math-vmu.js:707-727`：注释自陈 H2；`try/catch` 包住读取；不可达时**具名降级** `VMU_PROMPT_SECTION_UNREACHABLE` 并带 `err.stack`；并明确**不把 `systemPrompt` 加进 `inject`**，以免让插件强制要求一个最小宿主未必有的服务）。

★ **H1（`packs` 是 DSH 预设行保留键）现在的状态：既未证、也未被需要** —— R21b 的崩溃**已被 H2 完整解释**，无需引入 DSH 保留键假设（这正是"先判定、再谈修法"要的结果）。

---

## 4. 建议的下一步（**就一次会话**；等 Lead 一句话）

**跑 arm A（`config.packs:['v5r']`）修后版**，它同时回答"H1 是否还需要"与"阈值能否自主开火"。判据（R21／上份报告 §8.7 那套 ＋ 本轮新增）：
1. 宿主 stdout 出现 **`tool-results-met`** 的 sink 行；
2. 会话日志（**多帧解码**：按 zstd magic 切帧，`scripts/dsh-drive.mjs:206-215`）里 **`report/tick` 调用数 ＝ 0**；
3. 同一份 stdout 里 **`tool-results-unreached` 0 条**；
4. ★ **装载证据（本轮教训）**：`vibe_vmu_status` 的 **`settingsMerge.packs` 非空** 且 `sources` **至少一键带 `source:"pack"`**；
5. 顺带看宿主 stderr 是否出现 §3 那条**具名降级**：**出现＝pack 真装载了但 `systemPrompt` 不可达；不出现＝装了且可达**（这两种都算"装载路线通了"，但对 `docs/21 §20` 的措辞有区别）。

**未跑的理由（两条，都成立）**：① Lead 明确"先等我的通知"；② **`vmu-core2` 可能仍在编辑 `:706` 一带** —— 我**不愿拿一次真机会话去撞一个可能正在被写入的文件**（那会让读数不可复现）。三臂 overlay、启动命令、判定脚本均已就绪，一句"跑 A"即可执行。

---

# 5. ★★ `task-131` D 的执行结果（H2 修后 **arm A 仍崩**）＋ 三个判别臂 ⇒ **H1 被推翻**

> 触发：Lead 改写 `task-131` 为"D：只跑 arm A"（我的"改名臂无判别力"判断被采纳进任务书）⇒ 我执行；**A 修后仍崩** ⇒ 任务书自己设的条件（"**只有 arm A 修后仍崩，才值得回头跑改名臂**"）成立 ⇒ 我随即跑了判别臂 **B**（换键名）与 **D**（同键名、值不可解析）。

## 5.1 四臂矩阵（★ 全部记时刻／会话 id／退出码／raw 读数；每臂**只改 L13 一行**，已逐行 diff 证明）

| arm | L13（唯一变量） | 时刻 | 会话 id | 退出码 | 宿主 stdout sink | 宿主 stderr |
|---|---|---|---|---|---|---|
| **A** | `packs: ['v5r']` | **16:58:36** | —（`session/create` 被拒） | **1** | 0 | **0 B（空）** |
| **B** | `packList: ['v5r']` | **17:00:15** | `session-5dbcb563-7868-4b32-aff1-a93175fd761d`（34 events，`durationSec:37`） | **0** | 1（`turn-end-duty`） | 0 B |
| **D** | `packs: ['no-such-pack']` | **17:01:03** | `session-f9c1bd7b-f48e-4367-a71d-5533d37b0eb7`（`durationSec:31`） | **0** | 1（`turn-end-duty`） | **200 B（见 §5.2，★ 冒烟枪）** |

**A 的失败载荷（原样，与 R21b 逐字相同）**：
```
{"step":"rpc","endpoint":"session/create","ok":false,"error":{"code":"agent-preset/invalid",
 "message":"vibe-math-vmu (dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js): cannot get property \"systemPrompt\" without inject", …}}
```
**⇒ H2 的修复（core2 的 try/catch，我在树上读到 `vibe-math-vmu.js:721-741`）并不能救 arm A。**

## 5.2 ★★ 冒烟枪：arm D 的 stderr **是我们自己的具名降级** ⇒ **解析者是我们，不是 DSH**
```
vmu: pack no-such-pack was not applied:  no pack named no-such-pack: neither a manifest
     (packs/no-such-pack/index.js or packs/no-such-pack.js) nor data (prompts/sections.json, settings/defaults.json)
```
（`D:\_tmp\r131D-boot.log.err`，200 B，全文；前缀 `vmu:` ＝ **我们 entry 的措辞**，且它按 **`packs/<id>/index.js`** 解析 —— 那正是**我们仓的 packs 目录**。）

**⇒ 直接推翻 H1**：`packs` **不是**"DSH 预设行的保留键"。arm D 里键名 `packs` **原样存在**、值不可解析 ⇒ **DSH 什么也没做**，会话正常起；而我们的 loader 读了 `config.packs` 并**具名降级**。⇒ **"能起来/崩"的差别来自我们 loader 是否加载成功，与键名是否被 DSH 保留无关。**

**三臂合起来把触发条件夹死**：
- **B（换键名 ⇒ 我们 loader 不触发）⇒ 起得来** ⇒ 崩溃**不是**"任何未知同层键"。
- **D（同键名、值不可解析 ⇒ 我们 loader 触发但失败并具名降级）⇒ 起得来** ⇒ 崩溃**不是**键名本身，也**不是**我们 loader 的失败路径（它优雅降级）。
- **A（同键名、值可解析为真 pack `v5r`〔`vibe-math-vmu/packs/v5r/index.js` 实测存在〕⇒ 我们 loader 成功装载）⇒ 崩**。
⇒ **触发条件＝"我们成功装载了一个真 pack"**。**H1 排除；问题落在我们自己的 pack-装载路径**（`vmu-core2` 的面）。

## 5.3 ★ 仍未拿到的东西：抛点（并给出"为什么它不是我们那行"的硬证据）
- **全仓生产代码只有一处 `systemPrompt` 访问**：`vibe-math-vmu.js:724`（**已被 try/catch 包住**，`catch` 会写 stderr）＋ `:730/:735` 仅在其**成功**后使用（其余全是注释／测试）。★ 我第一遍只 grep 了 `vibe-math-vmu/`，**已补查仓库根与全仓**（第二遍）⇒ **没有第二个访问点**。
- **arm A 的宿主 stderr ＝ 0 B** ⇒ 那处 `catch` **没有**写出它的具名降级 ⇒ **抛错不是我们那行**（要么该分支没跑到，要么读取成功、**在 `:735` 的 `systemPrompt.section({…})` 或 DSH 随后的装配里抛**）。
- ⇒ **判定所需的下一个数据＝宿主侧的 `err.stack`**（`r21b-session.log` 只有文案、无 stack）。**请让 `vmu-core2` 在 pack-装载路径上打 `err.stack`（或让宿主记录该 stack）** —— 有了它，这一刀就能收口；没有它，任何人都只能猜。
- ★ **一处有益的旁证**：core2 的探针（我在 §3 复跑）在 `apply()` 内**没有抛**（`threw = no`）⇒ 崩溃**不在 `apply()` 之内**，而在其后的装配/注册路径 ⇒ 与"抛点不在我们 `:724`"一致。

## 5.4 判定（对 Lead 三问的直接回答）
1. **会话能建起来吗**（H2 修复的直接判据）？**arm A：不能**（`session/create` 被拒，exit=1）⇒ **H2 修复不足以让这条装载路线可用**。
2. **装载证据**（`settingsMerge.packs` 非空 ＋ 至少一键 `source:"pack"`）？**arm A 拿不到**（会话都没建起来）；**B/D 也拿不到**（两地都没有 pack 被我们装载：B 的键名不对、D 的值不存在）⇒ ★ **"出货 pack 在真会话里装载成功"＝仍未建立**。
3. **阈值自主开火**？**未建立**（同上：没有一次会话装上过 pack ⇒ `tool-results` 不会被观测）⇒ 与 R20/R21 相比，**障碍更深了一层**：现在卡在"**成功装载 pack 会打死预设组装**"。
4. **修法方向（据本矩阵修正 Lead 的预登记修法）**：★ **"换一个 DSH 不保留的命名空间" 不是充分修法** —— 改名（B）之所以能起，是因为**我们的 loader 也不再被触发**（`config.packs` 变 undefined）；若只改名而不改**我们 entry 读的那个键**，结果是"会话能起、pack 永远不装载"。**真正的修法必须让"成功装载一个真 pack"不再打断组装**（即 §5.3 的抛点，属 entry/pack 面）。
5. **诚实限定（照旧）**：以上都是**机制层**读数；**不证**"模型会自发地想汇报"。

## 5.5 卫生（本轮全部真机执行的收尾）
- **凭据副本**：`D:\_tmp\r18-home\.credentials.yaml` ⇒ **已删除**（两轮实验各复制一次、各删一次）；`D:\_tmp` 全盘 `.credentials*` ⇒ **none**；**操作者 profile 未动** ✓
- **宿主/端口**：四臂宿主**全部已停**；`7700–7900` 段**无任何监听** ✓
- **未跑全量／未 `regen-all`／未 git／未改任何代码·测试·docs**（写范围＝本报告）✓
- **会话开销**：A＝**0 token**（未建会话）；B＝128,855／D＝129,060（cap 400k 未触）⇒ 本轮真机会话 **2 次**。

---

# 6. 追加（Lead 通报）：抛点已由 `vmu-core2` **本机具名** ⇒ §5.3 那条"假设"升级为"**已证（本机）**"

**core2 的本机结论（转记，**非我实测**）**：抛点是 **`vibe-math-vmu.js:735` 的 `systemPrompt.section({…})` 调用本身没被护住** —— 宿主**可达**但**调用抛** ⇒ 异常逃出 `apply()` ⇒ `promptSection`／`activePacks` 都没设上 ⇒ **我们那段只覆盖"读取"的 `catch` 什么都不写** ⇒ ★ **恰好解释 arm A 的 stderr ＝ 0 B**。其读数：`section() called = 1`、`threw = cannot get property "systemPrompt" without inject`；control（宿主不可达）`threw = no` 且**具名带 stack**。
⇒ **我在 §5.3 标注为"待 stack 检验的假设"的那条线索，现按"已证（core2 本机 stack）"引用**。★ **边界不变**：这是**本机**复现；**真机结论仍以我那次为准**（本机探针不能替代真机读数），我**没有**把 arm A 的读数改写成本机结果。

**下一轮（等 Lead 叫）：只跑 arm A** —— **B／D 不再跑**（我已把它们的判别力论证清楚：改名臂"能起"与 H1 **同真、无法分开**）。判据（Lead 已写进 `task-131`，我照执行）：
1. **会话能建起来**（exit 0／`turn/end` 出现）；
2. **装载证据**：`settingsMerge.packs` **非空** 且 `sources` 至少一键 **`source:"pack"`**；
3. 宿主 stdout 出现 **`tool-results-met`** 的 sink 行；
4. **多帧解码后** 会话日志里 **`report/tick` 调用数 ＝ 0**；
5. 同份 stdout 里 **`tool-results-unreached` 0 条**；
6. 顺带看 stderr 那条**具名降级**在不在（**在** ⇒ pack 装了但 `systemPrompt` 不可达；**不在** ⇒ 装了且可达）。

**待命状态**：四臂 overlay／runner／解码工具／判定脚本均已就绪并记了哈希（A `73217CFC…`／B `CD6AEBE3…`／D `25ABD…`）；**在 Lead 叫之前不碰真机、不复制凭据**；写范围仍只有本报告。

---

# 7. ★★ `task-131` D 的有效执行（活代码）—— ① 通过、② 通过、③ 仍不通过（已具名到代码）

## 7.1 ★ 先记一条**测量完整性缺陷（我的）＋修复**：前一次 arm A 读数作废
| 项 | 读数 |
|---|---|
| 宿主实际加载的 payload | `D:\_tmp\r18-home\profiles\ext\node_modules\dsh-vibe-math` ⇒ **真目录（`isRealDir=True`，不是链接）** |
| 它里面的 entry | sha256 **`13DA3E536C9187BF`**、mtime **2026-10-15 00:29:09**；**grep 不到** `ROUND 21 / task-129`；`packs/v5r/middleware/` **没有** `artifact-counter.js` |
| 仓库当前 entry | sha256 **`EA836778F2197B12`**、mtime **17:13:49** |
| 机制 | R17 我用 `Copy-Item -Recurse` 从 `ext-home` 建 scratch home，而 `ext-home` 里那个是 **SymbolicLink → 仓库** ⇒ **Copy-Item 把链接解引用成快照**，宿主一直跑 ≈14:29 的仓库快照 ⇒ **H2／`:735` 修复与 `artifact-counter` 在那次会话里根本没生效** |
**⇒ 17:16:06 那次 arm A（同样的崩溃、stderr 0 B）是旧代码行为，不能用来判定 core2 的修复**（已即时上报 Lead，未被记成"修复失败"）。
**修复**：把活仓库载荷同步进该目录（`robocopy /MIR` 同步 `vibe-math-vmu/**` ＋ 覆盖 `preset-declaration.js`／`package.json`／`cordis.patch.yml`／`installer.js`），并**跑前核验**：entry hash **`EA836778F2197B12` ＝ 仓库**、`ROUND 21 / task-129` **3 处**、`artifact-counter.js` **在场**、`v5r-core.js` 有 `v5r.artifact-counter` 条目 ✓。
★ **纪律（Lead 已采纳为硬前置）**：**报告真机读数前，先证明"宿主加载的那份 payload 的哈希 ＝ 仓库的哈希"**，并核关键新文件在场 —— 即"读的是哪一次运行"升级为"**跑的是哪个字节**"。

### 7.1.1 ★ 影响范围的**分档记账**（Lead 的裁定，不搞一刀切；照录）
| 档 | 范围 | 判定 |
|---|---|---|
| **铁证** | **`r17-home` 家族**（R17 那次 `--require-host` 的 5 条 + `:367` 改前读数；R17 的会话脚本等） | 那些宿主跑的是 **00:29 快照** ⇒ **依赖其后的修复/模块的东西在它们上面从未执行过**（例：**R17 的 `orderMode` 修复从未在它们上面执行过**）。这些读数**对"那份代码"**成立，**不得标注为"当前树"** |
| **缺证（不可判定）** | **刷新前的 `r18-home` 会话**（R18 的自主开火会话、R20/R21 的阈值会话、16:58 与 17:16 的两次 arm A、B/D 两臂） | payload 被**就地刷新**、**逐会话状态不可回溯** ⇒ 写成**缺证**（**不是否证**）；★ 注意其中 **16:58／17:16 的 arm A** 另有一条独立依据可判作废（见 §7.1 的哈希与缺文件证据） |
| **当前树（仍须哈希复核）** | **刷新后的会话**（17:18:52 的有效 arm A） | 跑前已核 entry hash ＝ 仓库 ＋ 守卫 3 处 ＋ `artifact-counter.js` 在场 ✓ ⇒ 可作判据；**今后每一次都照此复核** |

⇒ 我 §7.2 的六条判据取自**第三档**；§5 的四臂矩阵与 R17–R21 的读数属**第一/第二档**，引用时**必须带档位**。
★ **另一条同源影响**（Lead 指出、我补记）：`r17-home` 家族跑的是 00:29 快照 ⇒ **"R17 的 `orderMode` 修复"从未在它们上面执行过** —— 凡把那些会话当作"含该修复的运行时"来引用的地方，都要按第一档改写。

## 7.2 ★★ 有效运行（活代码，跑前已核 hash）：六条判据逐条
**实例**：`node <dsh>/lib/bin.js --profile ext --patch r17-provider.yml --patch r131-A-overlay.yml --port 7826 --no-open`（`config.packs:['v5r']`）；**2026-10-15 17:18:52**；会话 **`session-99d2090d-c2e3-4d01-9431-5372f30734f0`**（34 events，`durationSec:34`，tokens 129,027，`tokenCapHit:false`）；**driver exit ＝ 0**；`turn/end reason: {"kind":"completed"}`。

| # | 判据 | 结果 | 原样证据 |
|---|---|---|---|
| **①** | 会话能建起来 | ✅ **PASS** | `session/create` ok，`turn/end: completed`，**exit 0**；★ **且宿主 stderr 出现的是那条具名降级（不是 `agent-preset/invalid`）**：`vmu: prompt text is declared but the host systemPrompt service is NOT reachable (not injected?): cannot get property "systemPrompt" without inject` ＋ `Error: …`（带 stack）⇒ **core2 的 `:735` 守卫在真宿主上生效** |
| **②** | 装载证据（`settingsMerge.packs` 非空 ＋ 至少一键 `source:"pack"`） | ✅ **PASS** | 回执原文：`"settingsMerge":{"priority":"pack 默认 < preset Config／会话 settings < 运行时 set","packs":["v5r"],"defaults":43,"sources":{"vmu.turn.replyCatalogue":"pack:v5r","vmu.pointer.propagation":"pack:v5r","vmu.turn.selfCheck":"pack:v5r","vmu.turn.feedback":"pack:v5r","vmu.turn.protocolPath":"pack:v5r","vmu.control.idleAfterMs":"pack:v5r",…}}` ⇒ ★ **出货 pack 真的装载了**（`packPath:"loader"`；`defaults:43`）。★ 注意**实际字段形状是 `sources[键] = "pack:<id>"`**（不是 `"source":"pack"`）——我先前按字面量 grep 得 0 是**形状找错了**，raw 就在回执里 |
| **③** | 宿主 stdout 出现 `tool-results-met` 的 sink 行 | ❌ **不通过** | 宿主 stdout **只有 1 条 sink**：`[vmu-report-sink] {"name":"turn-end-duty",…}`；**没有** `tool-results-met` |
| **④** | 多帧解码后 `report/tick` 调用数 ＝ 0 | ✅ **PASS** | **多帧解码**（按 zstd magic 切帧）：34 events（one-shot 只会给 2 行）；`tool/call` 三条：`vibe_vmu_report{action:"status"}`(seq16)／`vibe_vmu_set`(seq21)／`vibe_vmu_status`(seq26)；**`report/tick` 调用数 ＝ 0** |
| **⑤** | 同份 stdout `tool-results-unreached` 0 条 | ✅ **PASS** | 0 条 |
| **⑥** | stderr 那条具名降级在不在 | ✅ **在** | 见 ①（⇒ **pack 装了，但 `systemPrompt` 不可达**；这是修复后的**具名降级**，不是崩溃） |

## 7.3 ★★ ③ 的具名根因（实测 ＋ 读码定位；未由我改动或验证修复）
**实测**（同一份回执的内核侧视图）：`"registrations":[], "packs":[], "bus":{"dryRun":false,"hookTimeoutMs":2000,"breakerThreshold":3,"entries":[],"hooks":[]}` —— 而 `settingsMerge.packs:["v5r"]`。
⇒ **pack 只"半装"：设置层进了（`defaults:43`、多条 `pack:v5r`），但 pack 的 `middleware` 条目没有进总线** ⇒ 计数模块 `v5r.artifact-counter` **从未订阅 `tools/result`** ⇒ **0 次观测** ⇒ `metricValues()＝{}` ⇒ `thresholdMet()` 如实 `false` ⇒ **阈值不可能在回合边界开火**（与 ③ 完全自洽）。

**读码定位（候选根因，供 owner 复核）**：
- 入口的 `config.packs` 路径把 pack 折进来的只有 **`sectionPolicy`／`noticeBlock`／`phases`**：`PACK_RUNTIME = { v5r: { sectionPolicy: V5R_DECIDE_SECTIONS, noticeBlock: V5R_INBOX_BLOCK, phases: V5R_PHASES } }`（`vibe-math-vmu.js:448-450`）＋ `:452-460` —— **`middleware` 不在其中**。
- 全文件**唯一**把模块变成总线条目的站点是 `:936-939`：`kernel.loader.toBusEntries(specs, …)` → `kernel.bus.add(e)`，而它吃的是 **`specs`（模块声明）**，**不是 pack 清单的 `middleware` 数组**。
⇒ **即：`config.packs` 这条装载路线"折设置、折提示词策略、折阶段，但没有折中间件"**。与"**进程内**直接把 `packs:['v5r']` 交给 kernel 时计数器会注册"（`vmu-comms2` 26/0；`vmu-verify2` 独立探针 3 条总线条目）**并不矛盾** —— **两条路不是同一条**。
★ **它同时回溯解释了**：为什么我这些真会话里**只有 entry 级行为**（报告面／人设／设置）出现过，而**任何 pack 驱动的机制都没出现过**。★ **已排除的候选**（都为省后人时间）：① 指标未声明（回执里 `vmu.metrics.indicators=["tool-results","settled-jobs"]`，`source:"config"` ✓）；② 钩子桥不看总线（`host-hooks.js` 的 `declaredHooks()` **确实**也读 `kernel.bus.status().entries`——"REALITY, not only the declaration" ✓）；③ 宿主不发 `tools/result`（宿主包里**有**该事件：`dsh-tools/lib/types/index.d.ts:92` 声明、多个包订阅 ✓）。

## 7.4 判定（六判据的收口）
1. **H2／`:735` 修复：真机 ✅ 有效** —— 会话建得起来，且以**具名降级**代替崩溃（①⑥）。**arm B/D 不必再跑** ✓
2. **"出货 pack 在真会话里装载成功"：✅ 建立**（②：`settingsMerge.packs:["v5r"]` ＋ `pack:v5r` 来源）—— 本轮**第一次**拿到它。
3. **"`threshold` 报告在回合边界自主开火"：❌ 仍未建立**，但**原因已具名且更上一层**：**pack 的 `middleware` 没有进总线**（`registrations:[]`／`bus.entries:[]`）⇒ 计数模块从未开火 ⇒ 无观测。★ 这**不是**"模型不调用"，也**不是**"没有计数者"。
4. **诚实限定（照旧）**：以上是**机制层**读数；**不证**"模型会自发地想汇报"。
5. **仍在的空白（具名）**：计数模块**是否**被 loader 装载未单独证明（回执里没有 `artifact-counter` 字样）—— 与"未进总线"一致，但我只把它记为**一致**，不记为**已证**。

## 7.5 卫生与成本
- **凭据**：本轮共复制 3 次（每次用完即删）；现 `D:\_tmp\r18-home\.credentials.yaml` **不存在**，`D:\_tmp` 全盘 `.credentials*` ⇒ **none**；**操作者 profile 未动** ✓
- **宿主/端口**：每臂跑完即停；`7700–7900` 段**无任何监听** ✓
- **未跑全量／未 `regen-all`／未 git／未改任何代码·测试·docs**（写范围＝本报告）✓
- **会话成本**：本轮真机会话 **4 次**（A 旧代码 17:16 ＝ **0 token**〔未建会话〕；B 128,855；D 129,060；**A 活代码 129,027**），cap 均未触。

---

# 8. ★★★ 零成本读数（只看已有字节）—— ③ 的根因由**一行 stderr** 点名，且 **task-134 的前提被推翻**

**数据来源**：会话 `session-99d2090d-c2e3-4d01-9431-5372f30734f0`（17:18:52，活代码，跑前已核 payload hash ＝ 仓库）的**已录字节**：`vibe_vmu_status` 回执（49,930 字符，多帧解码取出）＋ 宿主 **`D:\_tmp\r131A-boot.log.err`（1190 B）全文**。

## 8.1 ★★★ 决定性那一行（Lead 要的 `vmu: pack … was not applied` —— **在，且措辞完整**）
**完整 stderr 全文（1190 B，原样，未筛选）**：
```
vmu: prompt text is declared but the host systemPrompt service is NOT reachable (not injected?): cannot get property "systemPrompt" without inject
Error: cannot get property "systemPrompt" without inject
    at new apply (file:///D:/_tmp/r18-home/profiles/ext/node_modules/dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js:724:33)
    at Fiber.execute (file:///C:/Users/admin/scoop/persist/nodejs-lts/bin/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js:1068:24)
    at file:///C:/Users/admin/scoop/persist/nodejs-lts/bin/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js:1142:34
    at composeError (…/cordis/lib/index.js:199:18)
    at Fiber._execute (…/cordis/lib/index.js:1137:10)
    at Fiber._reload (…/cordis/lib/index.js:1356:16)
vmu: pack v5r was not applied: VMU_ENGINE_UNAVAILABLE this kernel has no library root
```
★ **最后一行就是 Lead 要的那一行**：**`apply()` 真的失败了**，被**具名拒** `VMU_ENGINE_UNAVAILABLE **this kernel has no library root**`。
⇒ **"设置进了（`source: pack:v5r`）"不能证明 `apply()` 成功**：设置的折入走的是**另一条 DATA 路**（`packs/<id>/settings/defaults.json`），与 `apply()` 的成败**独立**。
⇒ ★★ **由此推翻 `task-134` 的前提**：真机 `bus.entries: []` **不是**"middleware 没被折进总线"，而是"**pack 的 `apply` 被前置条件具名拒（无 library root）**" ⇒ **没有任何东西被 apply ⇒ 总线当然是空的**。这与 `core2` 本机三联探针（apply 不抛、`packErrors=[]`、7 条总线条目）**并不冲突**——它的合成配置**给了 root/library**，而真机这份 overlay **没给**（见 §8.3）。

## 8.2 四样原样读数
| # | Lead 要的 | 结果 |
|---|---|---|
| 1 | `packErrors`（回执） | **0 命中 ⇒ 没采到**（49,930 字符里没有该键）。★ **等价读数在 stderr**：见 §8.1 最后一行 |
| 1b | `bus.status()` **外层全部** | `"bus":{"dryRun":false,"hookTimeoutMs":2000,"breakerThreshold":3,"entries":[],"hooks":[]}`（**无其它字段**）。**外层 sibling**：该段在 `"activity":{…,"registeredHooks":143,…}`、`"audit":{…}` 之后，形如 `…,"audit":{…},"registrations":[],"packs":[],"bus":{…},"prompt":{"sections":[],"bindings":0,"truncation":[],"middlewareAppends":[]},"store":null,"library":null,"members":null,"tasks":{…}` ⇒ ★ **同一段里 `"store":null,"library":null`** —— 与"**no library root**"**逐字自洽** |
| 1c | `registrations` / `packs` | `"registrations":[]`、`"packs":[]`（各 1 处；同段 sibling） |
| 1d | 完整 stderr | 见 §8.1（**1190 B 全文**）。★ 旁证：arm B 的 stderr ＝ **0 B**（无 pack 被装载、也没报错）；arm D ＝ 200 B（`vmu: pack no-such-pack was not applied: no pack named …`）⇒ **入口把 pack 的每一次失败都写在 stderr**——这正是我们这次靠它定位的原因 |

## 8.3 ★ Lead 的 item 2：那次会话用的 overlay 原文（要转给 `core2` 复跑探针的关键）
**文件**：`D:\_tmp\r131-A-overlay.yml`（**仓库外，实测用**；**sha256 `73217CFC2D912686`**，2025 B，35 行）。**与"只有 `deliver`＋`vmu`"那版的唯一差别＝多了一行顶层 `packs:`**：
```yaml
- id: vibe-math-vmu-overlay
  config:
    overlayFor: vibe-math-vmu
    rows:
      vibe-math-vmu:
        packs: ['v5r']                    # ← 顶层（行 config 的键）：真正的装载开关
        deliver: !!js '(report) => console.log("[vmu-report-sink] " + JSON.stringify({ name: report.name, to: report.to, channel: report.channel, text: report.text, drives: report.drives }))'
        vmu:
          tools: { faces: ['*'] }
          packs: { active: ['v5r'] }      # ← 嵌套：只是设置键，不装载
          metrics: { indicators: ['tool-results', 'settled-jobs'] }
          report:
            enabled: true
            minIntervalMs: 0
            reports:
              - { name: 'turn-end-duty',        trigger: { kind: 'event',     event: 'turn-end' },                 channel: 'log', template: '【所办汇报】{{name}} 在 {{event}} 自动开火' }
              - { name: 'tool-results-met',     trigger: { kind: 'threshold', metric: 'tool-results', op: 'gte', value: 1 },    channel: 'log', template: '【阈值·已达】tool-results={{ metric:tool-results }} ≥ 1' }
              - { name: 'tool-results-unreached', trigger: { kind: 'threshold', metric: 'tool-results', op: 'gte', value: 1000 }, channel: 'log', template: '【阈值·未达线】tool-results={{ metric:tool-results }} ≥ 1000' }
```
★★ **关键（请一并转 core2）**：**这份 overlay 里没有 `root:`** —— 而入口取 durable root 的键是 **`config.root`**（`vibe-math-vmu.js:147`：`const root = typeof config.root === 'string' && config.root.length > 0 ? config.root : null`）⇒ 真机这份装配 **`root = null`** ⇒ 与 §8.1 的 `no library root` 吻合。★ **这就是"本机探针成功 / 真机失败"的配置差异**：它的探针用 `apply(ctx,{…})` 合成配置（大概带了 root/library），真机经 overlay 落到行 config、**没有 root**。
★ **口径更正照收**（verify2 的"3 条"＝`v5r.artifact-counter` 该模块自己的条目；core2 的"7"＝全部模块合计）—— 是**口径差，不是版本变化**，我不把它当矛盾用。

## 8.4 ★ Lead 的 item 3：**不需要**为"同一会话第二次 `vibe_vmu_status`"跑真机 —— 它的前提已被 §8.1 排除
Lead 的假设是"回执的视图与装 pack 的实例/阶段不是同一个 ⇒ `bus.status()` 取自重建后的内核 ⇒ 空表"。但 §8.1 的 stderr **具名证明 `apply()` 真的没成功**（`VMU_ENGINE_UNAVAILABLE this kernel has no library root`）⇒ **空表不是"视图时机"问题，而是"确实什么都没装"**：同一会话里**再调一次 `vibe_vmu_status` 仍会是空表**。⇒ **省掉一次会话**。
★ **但还有一次会话值得跑（单因子，请裁）**：**给那份 overlay 加上 `root:`**（durable root，例如 `root: D:\_tmp\r18-home\durable`（**仓库外，实测用**）），其余**一字不动** ⇒ 判据：**stderr 里那行 `vmu: pack v5r was not applied: …` 是否消失** → `registrations`/`bus.entries` 是否**非空** → 计数模块是否订阅 `tools/result` → **`tool-results-met` 的 sink 行是否出现**（且 `report/tick` 调用数仍 = 0、高位阈值 0 条）。**未获准前我不跑、不复制凭据。**

## 8.5 我没有做的事
- **没有**为此重跑真机（item 1/2 从已有字节取到；item 3 的前提已被 item 1 排除）；
- **没有**替 Lead 对 ③ 下最终结论（只给"读数指向：apply 被 `VMU_ENGINE_UNAVAILABLE` 具名拒，拒因＝**装配没有 durable root**"）；
- **没有**改任何代码/测试/docs（写范围＝本报告）。

---

# 9. ★★★★ arm E（单因子：**+`root:`**）—— **③ 建立**："`threshold` 报告在回合边界自主开火" ✅

## 9.1 单因子证明（先证"只差一行"，再谈读数）
- **E 去掉那一行后与 A 逐字节相同**：脚本判定 `E minus the one root: line === A ?` **true**；`lines present in E but not in A = ["        root: 'D:/_tmp/r18-home/durable'"]`（36 行 vs 35 行）。
- **硬前置（跑前核）**：payload entry sha256 **`EA836778F2197B12` ＝ 仓库** ✓；`artifact-counter.js` **在场** ✓。

## 9.2 运行与六条读数
**实例**：`node bin.js --profile ext --patch r17-provider.yml --patch r131-E-overlay.yml --port 7830 --no-open`；**2026-10-15 17:42:42**；会话 **`session-6ca9fefd-4b10-4e3b-a795-32c70ff2a5ae`**（44 events，`durationSec:43`，tokens 221,841，`tokenCapHit:false`）；**driver exit 0**；`turn/end: completed`。

| # | 判据 | 结果 | 原样读数 |
|---|---|---|---|
| **1** | stderr 里 `vmu: pack v5r was not applied: …` **是否消失** | ✅ **消失** | stderr **全文 1104 B**：只剩 prompt-section 那条**具名降级**＋cordis stack；**没有** pack 失败行 |
| **2** | `registrations`/`bus.entries` **是否非空** | ✅ **非空** | 回执里**直接可见**条目：`{"id":"v5r.artifact-counter::tools/result","kind":"module","order":320,"on":["tools/result"],"failure":"open","capabilities":["trigger-workflow","record"],"scope":null,"source":"session","enabled":true,"disabledReason":null,"hits":2,"consecutiveFailures":0}`（另有 `v5r-core-no-adhoc-scripts`＝rules 条目）＋ `"hooks":["control/idle","lean/job-settled","math/job-settled","meeting/motion","tools/pre-execute","tools/result"]` |
| **3** | 计数模块**是否订阅 `tools/result`** | ✅ | 条目 `on:["tools/result"]` ＋ **`hits:2`**（真的收到事件） |
| **4** | **`tool-results-met` 的 sink 行是否出现** | ✅ **出现** | 宿主 stdout：`[vmu-report-sink] {"name":"tool-results-met",…,"text":"【阈值·已达】tool-results=5 ≥ 1","drives":false}`（同份 stdout 另有 `turn-end-duty`） |
| **4b** | `report/tick` 调用数 ＝ **0** | ✅ | **多帧解码** 44 events；5 个 `tool/call`（`report{status}`／`set`／`status`／`pwsh`×2）；**tick 调用 0** |
| **4c** | 高位阈值 **0 条** | ✅ | `tool-results-unreached` **0 条** |
| **5** | **状态一致性**（Lead 的 item 5） | ✅ **这次一致** | `settingsMerge.packs:["v5r"]` ＋ 多条 `sources[键]="pack:v5r"` ＋ **`"library":{"present":true,…}`** ＋ store `"file":"D:\\_tmp\\r18-home\\durable\\vmu\\state.json","version":1,"keys":19` ⇒ ★ **"回执说合并了"与事实一致**；★ **对照 arm A（无 `root:`）＝"回执说合并了、事实被具名拒"** |

★ `packErrors`／`activePacks` 在本回执里**仍未采到**（0 命中）—— **但这次不需要**：总线条目 ＋ `hits` ＋ sink 行 ＋ `library.present:true` 已是**事实级**证据。
★ **旁证（外部文件）**：`D:\_tmp\r18-home\durable\vmu\state.json`（817 B）＋ `durable\vmu\audit\2026-10-15.jsonl`（2305 B）⇒ **`root:` 真的生效**。

## 9.3 判定
1. **③ 建立 ✅**：`threshold` 报告在**回合边界自主开火**（`tool-results=5`），**无人调用 `report/tick`**（0），高位阈值沉默 ⇒ 就**机制层**而言，用户原话"**是否真的会自动汇报**"至此三段齐备：① 触发器会开火并送达／② 无人要求也会开火（R18）／③ **阈值型也能自主开火**（本节）。
2. **根因回顾（一行之差）**：整条岔路的根因＝**装配缺 `config.root`（durable root）** ⇒ `apply()` 被 `VMU_ENGINE_UNAVAILABLE this kernel has no library root` **具名拒** ⇒ 总线空 ⇒ 计数模块不订阅 ⇒ 无观测 ⇒ 阈值不可能开火。**加上 `root:` 后全部通过。**
3. ★ **文档面影响（新，具名转办）**：`docs/29 §3`／`docs/22 §19` 的 overlay 配方**没有 `root:`** ⇒ 照抄者会踩"**回执说 pack 合并了、事实被具名拒**"（只有 stderr 一行）。**建议把那两处配方补上 `root:`**（本任务写范围只有本报告 ⇒ **我未改**，交 Lead 派属主）。
4. **诚实限定照旧**：机制层读数；**不证**"模型会自发地*想*去汇报"。
5. **仍未解决（与 ③ 无关的另一条线）**：`systemPrompt` 仍不可达（stderr 那条具名降级）—— 属 host `systemPrompt` 服务未注入那条线，**不影响** pack 装载与阈值开火。
6. **一条原样待解、我不解释的观察**：总线条目 `hits:2` 而报告文本 `tool-results=5`（该跑恰 5 次工具调用）—— 两个计数口径为何不同，**只记录**。

## 9.4 卫生与成本
- **凭据**：本轮复制 **1 次**（arm E），**用完即删**；`D:\_tmp` 全盘 `.credentials*` ⇒ **none**；操作者 profile **未动** ✓
- **宿主/端口**：已停（7830 无监听）；`7700–7900` 段**无监听** ✓
- **未跑全量／未 `regen-all`／未 git／未改任何代码·测试** ✓（★ docs 的改动见 **§10**：那是 Lead 本轮**另行批准并扩写写范围**的转办，不属本次真机执行）
- **成本**：**1 次会话**（221,841 tokens，cap 400k 未触）。

---

# 10. ★ Lead 批准的**文档转办**已落：`docs/29 §3` ＋ `docs/22 §19` 补 `root:`，并更正被我自己的旧读数带偏的那一行

## 10.1 改了两卷、三处
| 卷·位置 | 改动 |
|---|---|
| **`docs/29 §3`**（YAML 配方） | 配方里**补两行**：行级 **`packs: ['v5r']`**（真正的装载开关）＋ **`root: <你的耐久根目录>`**（`config.root`，带 ★★ 必需标记）；那行 `vmu.packs.active` 保留但标注**只是设置键、不装载** |
| **`docs/29 §3`**（更正块重写） | ① 装载路线表改**终态**：设置键＝不装载／**行级 `config.packs` ＋ `root:` ＝ ✅ 可用（推荐）**／工具 `vibe_vmu_pack`＝按设计拒随包 id；② 新增「**缺失的前置键 `root:`**」段（`vibe-math-vmu.js:147`；没有它 ⇒ `apply()` 具名拒 `VMU_ENGINE_UNAVAILABLE this kernel has no library root` ⇒ 该 pack 的 middleware/rules **一条都不进总线** ⇒ 依赖它的机制不可能开火；R21e 只加这一行即通过）；③ 新增「**声明与实现不一致（装载版）**」判据段（§10.2） |
| **`docs/22 §19`**（R8 配方行 ＋ 其后更正） | 同上：配方补 `packs:` ＋ `root:`；更正段改终态路线，并入同一条 `root:` 前置与同一条"装载版不一致"判据 |

## 10.2 ★★ 写进两卷的**判据纪律**（本轮最值钱的可复用结论）
> **即使 `apply()` 被具名拒，回执里 `settingsMerge.packs` 仍显示 `["v5r"]`、`sources[<键>] = "pack:v5r"`** —— 因为**设置是按 DATA 独立折入**（`packs/<id>/settings/defaults.json`），与 `apply()` 成败**无关**。⇒ **"回执说合并了、事实被具名拒"，且只在宿主 stderr 留一行**（`vmu: pack <id> was not applied: <code> <message>`）。
> ⇒ **证明"pack 真装载"不能只看 `settingsMerge`；要看 `bus.entries`／`hooks` 里有没有该 pack 的条目** ＋ 看宿主 stderr 有没有那行。★ 与 `docs/11` 的"声明↔实现"同族：**回执可以说"合并了"，而事实是被拒的**。

## 10.3 ★ 我同时更正了**我自己旧读数带偏的那一行**（声明必须与实现一致）
两卷原写「路线② `config.packs` 打在预设内插件行 ⇒ **打断预设组装**」—— 那是 **R21b（16:31:34）在【修复前】+ 冻结快照上**的读数。**修复后（活代码）实测**：`17:18:52`（arm A，无 `root:`）会话**建得起来**且 pack 设置已折入；`17:42:42`（arm E，+`root:`）**apply 成功、总线有条目、阈值自主开火** ⇒ 该行已改写为"**早先是修复前行为、现已被 `:735` 守卫消除**"。★ 本报告 **§5.1 的①/②行同样以 §7／§9 为准**（§5 是修复前读数）。

## 10.4 门禁读数（★ 2026-10-15 17:47:10 同一次运行，绑定到字节）
`docs/22` sha256 **`04C63B9DDD888102`**（183553 B）／`docs/29` sha256 **`BAD426E804EA7D4B`**（46186 B）：
| 门 | 读数 |
|---|---|
| `scripts/check-docs.mjs` | **PASS** |
| `tests/audit-doc-index.test.mjs` | **5 / 0** |
| `tests/audit-vmu-docs.test.mjs` | **99 / 0**（★ 比本轮早先的 95/0 多 4 条 —— **门本身被加过断言**，不是文档回归） |
| `tests/audit-doc-vs-code-tables.test.mjs` | **17 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0** |
| `tests/vmu-planned-settings.test.mjs` | **ALL GREEN（planned=111, docs=28, 39/0）** |
★ **调用形纪律**：新增文字里服务方法一律 `` `vmu.X.method()` ``／字段名按原样，**未裸写三段点号名**。

## 10.5 按 Lead 指示**没有**做的两件
- **`hits:2` vs `tool-results=5`**：保持"**原样待解**"—— **没有**猜"计数没错"或"计数坏了"，也**没有**在文档里给解释（§9.3 第 6 条仍是"只记录"）。
- **"目标 6 终态"那句话**：**没有写**（Lead 自己写，引我的三个会话 id 与判据）。
