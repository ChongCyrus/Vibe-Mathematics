# Phase 5 · **首次两次尝试的结果**（Round 25/26 —— ★ 两次都**没有**装配上 pack）

> ★ 作者＝Lead。★ 依据：两次运行的 `run.log`／`jsonl`（**仓外** `D:\wd\vibemath开发\_oneoff\vm-slv\`）＋ 代理自己的状态回执。
> ★ 被测构建＝本仓 `34f4366` 的 `npm pack` 产物（★ `vibe-math-v5r.js` sha16 = `BCB689EAF906FDC4`）✓

## 1. ★ 两次运行的读数

| | ★ 尝试 1 | ★ 尝试 2（改正注入后） |
|---|---|---|
| ★ 注入方式 | ★ **新增一行** `- id: vmu-pack-declaration` ＋ config | ★ **把 config 加到 vmu 插件【自己那一行】** `- id: vibe-math-vmu`（★ 只注入目标 preset） |
| ★ 结果 | ★ `exit=0 done=True capHit=False timeoutOrFatal=False` | ★ 同左 |
| ★ 耗时／用量 | ★ 53s ／ 169,577 tokens | ★ 37s ／ 141,296 tokens |
| ★★ **装配结果** | ★★ **`packs: []`** | ★★ **`packs: []`（★ 仍然没有装配）** |
| ★ 清理 | ★ 泄漏克隆（手工清） | ★★ **干净**（`port listening=False clone_present=False`）✓ |

★ **两次都【没有】把 v5r pack 装上去** ✓ —— ★ **诚实的结论：注入两次都失败** ✓

## 2. ★★★ 代理自己的回执（★ 比我的 grep 强得多，以它为准）

★ 原文摘录（★ 它的第 2 次工具调用就取到了）：
```json
"faces":{"enabled":["status"],"disabled":[],"unavailable":[],"unknownDisabled":[],
 "sources":{"status":"always (the inert default must be observable)"},
 "published":["vibe_vmu_status"],"registeredTools":["vibe_vmu_status"],
 "registeredToolDetail":[{"name":"vibe_vmu_status","face":"status","reason":"always (the inert default must be observable)"}],
 "evaluations":1,"notPublished":[],"enabledGap":[],"enabledNotPublished":[]}
```
```json
{"ok":true,"instance":"vmu-default","enabled":true,"active":true,"packPath":"loader",
 "settingsMerge":{"packs":[],"packSources":[],"applied":true,"appliedPacks":[],"errors":[],"loading":false,
  "defaults":0,"sources":{},"conflicts":[],"shadowed":[]},
 "settings":{"keys":0,...}}
```
★ 逐字结论：★ **`packs: []`、`appliedPacks: []`、`settings.keys: 0`** ⇒ **零整合包、零会话 settings 被折叠**，★ **所有键的 `source` 都是 `"default"`** ⇒ ★ 且 ★ **`packPath: "loader"` 只是 loader 引导面、不是 v5r** ✓
★★ 内核自己的判词：★ **`"a kernel with no declarations is inert by construction (zero mechanism, R1)"`** ✓ —— ★ **这正是哲学设计的行为** ✓

★★ **四类"必须贴原文"的回执：全部不存在** ⇒ ★ **不是空值，而是这些字段/面【根本没有注册】**（★ 没有任何 pack 声明它们）✓ ⇒ ★★ **因此"全体一致 ⇒ 论文 ⇒ `finalize`"这个停止条件【不可能被触发】** ✓
★ **卡在第 0 步**：★ 无配置面工具可设名册／★ 无启动面工具／★ `packReport.requested: []`／★ `members: null` ✓

## 3. ★★★ 一条**新的独立线索**（★ 代理从 `srv.err` 只读发现的）

★ 逐字：★ **`dsh: skipping profile bundle "dshmarket": ... peerDependencies ... incompatible with dsh 0.2.0-rc.2 ... Exact-version exemption: not active.`**
⇒ ★★ **本宿主这次启动【跳过了一个插件 bundle】**，★ 与 `appliedPacks: []` **一致** ✓
★ **待查**：★ 这条**是不是**导致 vmu 的 config 到不了 loader 的原因；★ 以及 `dshmarket` 与 `vibe-math-vmu` 是否经由同一个 bundle 装载 ✓

## 4. ★★★ 我在本轮犯的一个**量具错误**（★ 记下来，因为它差点变成假成功）

★ 我先用 `grep -o 'vibe_vmu_[a-z_]*'` 数出"**8 个面**"，★ 于是**一度判断"pack 装上了"** ✓
★★ **但那是错的**：★ 那些名字出现在转录里，★ **是因为代理【在报告里把它们列为"我没有的"】**（★ 它逐字写"**没有** `vibe_vmu_config`／`vibe_vmu_members`／…"）⇒ ★★ **我的计数是【文本的产物】，不是【工具面的读数】** ✓✓
⇒ ★★ **教训（★ 与之前"未标注口径的数字"同族）**：★ **在转录里 grep 一个名字，证明不了那个名字存在为工具** —— ★ **要读的是【状态面自己的 `published`／`registeredTools`】** ✓
⇒ ★ **我因此没有报假成功**，★ 因为**代理自己的回执**更硬 ✓

## 5. ★ 下一步（★ 逐条可执行）

1. ★★ **查清 config 为什么到不了 loader**：★ `U14`（`vibe-math-vmu.js:60-71`）说**两种形状都被接受**（★ NESTED 被扁平化／★ DOTTED 原样／★ 且**扁平 `config`（无 `vmu` 键）也接受**）⇒ ★ **我注入的是 `config.vmu.{...}`（NESTED）** ⇒ ★ **先核"该行是否真被 vmu 入口读到"**（★ 也许 `agent.cordis.yml` 的**行内 `config`** 不是入口读 config 的地方 ⇒ ★ 要改用**会话 settings** 或**profile 的 patch**）✓
2. ★★ **查 `dshmarket` 被跳过这件事**（★ 它是**新线索**，★ 可能另有共因）✓
3. ★★ **尝试用"配置/设置"这条正路**：★ 既然 `settingsMerge` 的优先级是 **"pack 默认 < preset Config／会话 settings < 运行时 set"** ⇒ ★ **会话 settings 是一条可用通道**（★ 驱动或 RPC 就能设）✓
4. ★★ **把这次两次的结果如实记进 docs**（★ 含"注入两次都失败"）✓ —— ★ **不许粉饰** ✓
