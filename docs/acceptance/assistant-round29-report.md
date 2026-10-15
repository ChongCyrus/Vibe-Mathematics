# Round 29 · `task-150`：真机升档（**我已完成两次真机会话**）＋ `systemPrompt` 边界定性

> 负责人：`vmu-assistant2`（**真机读数由我声称**）｜交付：本报告（唯一写范围）。
> 硬约束：**未跑全量／未 `regen-all`／未 git 写／未改代码·测试·docs**；临时文件全在 `D:\_tmp`；**凭据副本已删并核验**（§7）。

---

## 0. 结论（三句）

1. ★ **记录更正：`task-146` 的那次真机会话【我跑了】**（19:20:21／19:21:08，两臂），而 `vmu-verify2` 的 mtime 扫描把最新会话看成 R23 的 `session-6ca9fefd…`（17:43）⇒ **它的扫描早于我这两次落盘**（或扫的是别的根）。路径与时刻见 §1，**可直接重扫复核**。
2. **四项读数：两臂全部取到，且被拒臂四项【同时成立】**（§3）；与 R27 的进程内读数**大部分一致 ⇒ 那部分升档为真机证据**，但有**两处必须具名的差异**（§4）。
3. **`systemPrompt` 定性：宿主能力边界 ＋ 我们的有意取舍**（**不是**宿主缺口、**不是**无意缺陷）；代价**可测且比看上去窄** —— 丢的是**入口自己那一段**，**pack 的 31 条提示词段照常到达**（武装臂 31 条 `range:"pack"` vs 被拒臂 0 条），且**回执里没有任何 `vmu` 段**（§6）。

---

## 1. ★ 记录更正：我跑的两次会话（＋ `task-146` 的四项读数与 `task-150` 的四项完全相同 ⇒ 未重复烧会话）

| 臂 | 时刻 | 会话 id | 落盘路径（`D:\_tmp\r18-home\sessions\` 下） | 退出码 |
|---|---|---|---|---|
| **武装臂**（`config.packs:['v5r']` ＋ **`root:`**） | **2026-10-15 19:20:21** | `session-32bff9e6-e93d-43fb-a519-ac1ac64aae67` | `--D-_tmp-r18-ws--\session-32bff9e6-…\session.v4.jsonl.zstd` | **0** |
| **被拒臂**（同上但**去掉 `root:`**） | **2026-10-15 19:21:08** | `session-66d27431-f9d8-4c98-b2a5-2ece166857d1` | `--D-_tmp-r18-ws--\session-66d27431-…\session.v4.jsonl.zstd` | **0** |

★ **证据纪律**：`vmu-verify2` 的结论（"文件系统上 R23 之后零新会话"）**在它扫的那一刻成立**；我这两条**是它扫描之后落盘的** ⇒ 两个陈述都真，**差的是时刻**。这正是"**我没找到**要与**测的是哪一版/哪一时刻**同时声明"的同一族（`docs/11:187` 的"按 payload 分档"）。**`task-150` 要的那次真会话＝已由这两次承担**（payload 逐字节相同，见 §2），**未再烧一次**。

## 2. ★ 硬前置：payload **逐字节**核验（不许文本往返）
用 `git cat-file blob HEAD:vibe-math-vmu/vibe-math-vmu.js`（**二进制**）与工作树/scratch 三方对比（node + sha256，**无文本往返**）：
```
HEAD blob      : B78B3E05FE2033F4  81873 B
worktree file  : B78B3E05FE2033F4  81873 B
scratch payload: B78B3E05FE2033F4  81873 B
HEAD==scratch  : true | HEAD==worktree: true
```
⇒ ① 与 Lead 给的参考值**逐字节相同**；② 宿主实际加载的就是**当前树**；③ **跑完之后复算仍是同一个** ⇒ 代码此后未变 ⇒ 两次会话**都跑在 `B78B3E05FE2033F4` 上**，**当前树档**成立。另核：`artifact-counter.js` 在场、`packReport` 在场 ✓。

## 3. ★ 四项读数（原样；多帧解码：两臂各 **17 帧 → 35 events**，回执 49,930 字符）

### ① `packReport` ＋ `status()` 交叉核对
| 臂 | `packReport`（原样） | `status()` 侧（`settingsMerge`，原样片段） |
|---|---|---|
| **武装** | `{"requested":[{"id":"v5r","via":"config.packs"}],"applied":["v5r-core"],"errors":[],"loading":false,"ok":true,"defaultsUnfolded":[]}` | `"packs":["v5r"],"packSources":[{"id":"v5r","via":"config.packs"}],"applied":true,"appliedPacks":["v5r-core"],"errors":[],"loading":false,"defaultsFolded":["v5r"],"defaultsUnfolded":[],"defaults":43` |
| **被拒** | `{"requested":[{"id":"v5r","via":"config.packs"}],"applied":[],"errors":[{"id":"v5r","code":"VMU_ENGINE_UNAVAILABLE","message":"this kernel has no library root"}],"loading":false,"ok":false,"defaultsUnfolded":[]}` | `"packs":["v5r"],…,"applied":false,"appliedPacks":[],"errors":[{"id":"v5r","code":"VMU_ENGINE_UNAVAILABLE","message":"this kernel has no library root"}],"loading":false,"defaultsFolded":["v5r"],"defaults":43` |

### ② `faces` 两方向 ＋ `source` 与 `publishedDetail[].reason` 逐条比对
| 项 | 武装臂 | 被拒臂 |
|---|---|---|
| `enabledGap` / `enabledNotPublished` / `notPublished` | **`[]` / `[]` / `[]`** | **`[]` / `[]` / `[]`** |
| `enabled` / `published` | **53 / 53** | **52 / 52** |
| `disabled` / `unknownDisabled` | `[]` / `[]` | `[]` / `[]` |
| `unavailable` | `[{face:'script', name:'vibe_vmu_script', code:'VMU_ENGINE_UNAVAILABLE', reason:'no scripts were declared in this profile row', declaredBy:'setting:vmu.tools.faces'}]` | 同上 ＋ **`{face:'records', name:'vibe_vmu_records', code:'VMU_ENGINE_UNAVAILABLE', reason:'this kernel has no durable root, so it has no library to list or expand (docs/03 §3.1)'}`** |
| **`sources` vs `publishedDetail[].reason` 逐条** | 53 键 / 53 条 ⇒ **MISMATCH ＝ 0** ✓ | 52 键 / 52 条 ⇒ **MISMATCH ＝ 0** ✓ |

### ③ `evaluations` ＋ `published − registered`
- **`evaluations ＝ 2`（两臂相同）** ✓
- ★ **`published − registered` 在本回执里【不可计算】**（具名，见 §5）：宿主回执**只给** `faces.published` / `faces.publishedDetail`，**没有 tool 名级的 `registered` 列表** —— 全回执里 `"registered"` **只出现 1 次**，是 `guards.registered`（`["requireStore","requireLibrary","requireMembers","settingsView"]`，**是守卫名不是工具名**）。

### ④ 被拒臂（去掉 `root:`）：四项**同时**成立 ✅
1. `settingsMerge.applied **=== false**` ✓
2. `settingsMerge.errors ＝ [{id:"v5r",code:"VMU_ENGINE_UNAVAILABLE",message:"this kernel has no library root"}]` ✓
3. `packReport.ok **=== false**`（且 `applied:[]`、`errors` 同一 code/message）✓
4. **同一帧仍列 `packs:["v5r"]`** ✓（且 `defaultsFolded:["v5r"]`、`defaults:43`、`sources[<键>]="pack:v5r"`）
⇒ ★ **"回执说合并了、事实被具名拒"在真机上逐字成立**；并且被拒臂多出 `records` 的 `unavailable`（`no durable root`）与 `root:` 缺失**交叉自洽**。

## 4. ★ 判档（与 R27 进程内读数对表；两者**不许混**）
**一致 ⇒ 升档为真机证据**：
- `packReport` 四字段形状与语义（`requested/applied/errors/loading` ＋ `ok` ＋ `defaultsUnfolded`）；被拒时 `applied:[]`／`errors[VMU_ENGINE_UNAVAILABLE]`／`ok:false`；
- 两方向一致性检查空（`enabledGap`／`enabledNotPublished`）；
- `source` 与 `publishedDetail[].reason` **逐条相等**（53/53、52/52，MISMATCH 0）；
- `evaluations = 2`；
- 被拒臂"四项同时成立"**含**同帧 `packs:["v5r"]`。

**★ 具名差异（以真机为准）**：
- **D1（id 口径）**：Lead 给的交叉核对式 **`packReport.applied ⊆ status().packs` 按字面 id 不成立** —— `applied`（两视图一致）是 **manifest id `v5r-core`**，而 `packs` 是**请求/目录 id `v5r`**；映射在同一帧可见（`packSources[].id="v5r"`／`appliedPacks=["v5r-core"]`／`defaultsFolded=["v5r"]`）。⇒ **不是缺陷，是两套 id**；若要做机器核对，需**显式映射**（请求 id → manifest id）。
- **D2（`registered` 缺席）**：见 §3③ —— 进程内那次大概读的是**适配器的** `status().registered`，而**宿主回执不含它** ⇒ 该差集**在真机回执上无法复算**（如实记为"不可计算"，不记为 `[]`）。

## 5. ★★ 两条方法论发现（都会影响"我没看见"这类结论）
1. **回执本身被宿主省略**：两臂的 `vibe_vmu_status` 回执里都有字面标记 **`\n\n[...]\n\n`**（`receipt.includes('\n\n[...]\n\n') === true`）；正因如此，**回执不是合法 JSON**（`JSON.parse` 在 position 24846 处失败）。⇒ 本报告所有"回执里没有 X"都限定为"**在未被省略的可见部分里**"；我改用**括号配平**提取（不依赖整块可解析）。
2. **`published − registered` 不可计算**（§3③）：**宿主回执没有工具名级的 `registered`** ⇒ 要么把它写进回执（属 entry/host 面），要么在**进程内**读适配器视图 —— **不许**拿 `guards.registered`（4 个守卫名）冒充。

## 6. ★★ `systemPrompt` 定性（先读证据，再下判断）
### (a) 为什么不可达 —— **宿主提供了该服务，但它是 inject-only，而我们的插件没 inject 它**
| # | 证据（我实读） |
|---|---|
| 1 | **服务由宿主提供**：`dsh-system-prompt/lib/index.js:199-200`：`/** Registry service for the prompt inputs assembled before each model step. */ var SystemPrompt = class extends Service {` |
| 2 | **它是 inject-gated**：宿主侧**大量消费者都声明 inject** —— 其中**就包括我们 preset 行自己的 `dsh-persona`**（`dsh-persona/lib/index.js:21`：`const inject = ["systemPrompt"];`）、`dsh-plan-mode`（`static inject = ['tools','systemPrompt','sessionProjections']`）、`dsh-tool-workflow`、`dsh-mcp-client`、`dsh-mcp-resources`、`dsh-sandbox-policy`、`dsh-file-reference-local`（`agent.ctx.inject(["systemPrompt","tools"], …)`） |
| 3 | **它是"可选服务"**：`dsh-app-boot/lib/types/index.d.ts:317-323` 逐字：*"…or `undefined` **when no `systemPrompt` service is mounted**"* |
| 4 | **我们这边**：插件 `inject = ['tools']`（**不含** `systemPrompt`）⇒ cordis 代理对**未注入服务的属性访问本身抛错** ⇒ 命中我们的 try/catch ⇒ **具名降级** `VMU_EXTERNAL_UNAVAILABLE`（stderr 一行＋stack，两臂都在，行号现为 `vibe-math-vmu.js:789`） |

★ **对 Lead 两条引用的更正（原样）**：`dsh-ops/lib/index.js` 与 `ptc` 里的 `ctx.get('systemPrompt').assemble(…)` **在该宿主安装里我都没找到** —— 匹配 `ops|ptc` 的包只有 `dsh-ptc-runtime`／`dsh-ptc-runtime-node`／`dsh-workflow-ptc`，且这些包里 grep `systemPrompt` **0 命中**。⇒ **那两条引用在本机不成立**；但**实质结论**由上面 1–4 条独立支撑（**服务存在、inject-only、可缺席**）。

### (b) 判定：**宿主能力边界 ＋ 我们的有意取舍**（既非宿主缺口，也非无意缺陷）
- **不是宿主缺口**：服务**存在**且在 preset 作用域**可达**（我们 preset 行自己的 `persona` 就在用）。
- **不是无意缺陷**：代码注释自陈这是**故意不 inject** —— 加了会让插件**硬依赖**一个宿主文档明确说"**可能未挂载**"的服务，与"零机制/最小宿主"取向相反。
- **代价（可测，且比看上去窄）**：丢的是**入口自己那一段**（`systemPrompt.section({ name:'vmu', … })`）；**pack 自己的提示词段照常到达** —— 武装臂回执里有 **31 条 `range:"pack"` 段**（`v5r-*`），被拒臂 **0 条**；★ 且两臂回执里**都没有名为 `vmu` 的段** ⇒ 入口那段确实没注册（实测，不是推断）。另：**回执里没有 `promptSection`／`VMU_EXTERNAL_UNAVAILABLE` 字段** ⇒ 该降级状态**只体现在 stderr**，不是回执可查项。

### (c) 何时会变好（改判条件）
1. **宿主无条件提供**该服务（不再是"可能未挂载"）；
2. 或我们改成**可选依赖**写法（拿到就用、没有就降级，且**不把 `systemPrompt` 加进 `inject`**）；
3. 或 DSH 支持 **optional-inject**（声明依赖但允许缺席）。
★ **在地 1/3 出现前，现行取舍仍可辩护**；**在地 2 落地前，我们入口那段提示词在"服务已挂载"的宿主上也拿不到**（这是唯一实质损失，且**不影响 pack 装载与阈值开火**）。

## 7. 卫生与成本
- **凭据**：为这两次会话复制过 **1 次**（`D:\_tmp\r18-home\.credentials.yaml`），**用完即删**：现 `Test-Path=False`；`D:\_tmp` 全盘 `.credentials*` ⇒ **none**；**操作者 profile 未动** ✓
- **宿主/端口**：两臂跑完即停；`7700–7900` 段**无任何监听** ✓
- **成本**：**2 次真机会话**（各 ~130k tokens，cap 400k 未触，`tokenCapHit:false`）；**未跑全量／未 `regen-all`／未 git 写／未改代码·测试·docs** ✓
- **多帧解码**：两臂均 **17 帧 → 35 events**（one-shot 解压只会给 2 行）。

## 8. 没做的事 / 遗留（具名）
- **没有**再烧一次会话（`task-150` 的那次由 §1 的两条承担，payload 逐字节同档）；
- **没有**改 `inject`（照 Lead 指示），**没有**改任何代码/测试/docs；
- **遗留 1**：`published − registered` 要成为可核项，需要**把工具名级 `registered` 写进回执**（entry/host 面）；
- **遗留 2**：回执**被宿主省略**（`[...]`）⇒ 机器核对若依赖"回执完整性"，需要一个"省略时不静默"的判据（同上属 entry/host 面）；
- **遗留 3**：`systemPrompt` 的可选依赖写法（§6(c) 第 2 条）——**未落**，属 entry 面；本报告只定性、不派修（等 Lead 裁）。
