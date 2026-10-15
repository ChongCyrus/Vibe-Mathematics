# Round 9 · task-72：「自己造一个 preset / pack」走查（`docs/29`）

> 负责人：`vmu-assistant`｜任务：`task-72`｜交付：`vibe-math-vmu/docs/29-build-your-own-preset.md` ＋ 本报告。
> 写范围：`docs/**`（我名下 16/22 ＋ 新建 29 ＋ `00-README` 索引行）、`packs/v5r/prompts/**`、`kernel/report.js`、`tools/report.js`。**未动别人文件**（唯一例外见 §5 转办项：需要 verify 在 `scripts/check-docs.mjs` 加一行归类）。
> 纪律：不跑全量 sweep／不 `regen-all`／不 git；临时文件 `D:\_tmp`；**未实测的绝不当"已验证"写**。

---

## 0. 交付了什么

`docs/29-build-your-own-preset.md`（**新卷**，已登记进 `docs/00-README.md` 的卷清单表）——直接对应用户那句"**使得很容易通过那些中间件等开发出一个自己想要的运行逻辑、agent preset，具备相应的物质基础，并可极其容易地高自由度地控制、调控**"：
- **A 结构**：pack 文件夹每部分的最小形状 ＋ 归哪一层（L2／L3 四形态／L4）＋ 真实锚点（每行都指到仓内文件）。
- **B 四形态**：M1／M2／M3 各有**最小例子 ＋ 怎么证明它生效了**（**已实跑**）；**M4 明标【未实测】**（需宿主插件装载）。
- **C overlay 与部署**：Round 8 已验证的配方（一份 patch、只打 overlay 行、`!!js` scope-free）＋ **免费 dump 复核命令与原样输出**。
- **D 可调控性决策表**：11 行"想改什么 → 动哪一层 → 真实键名/文件"。
- **E 四种坑**：值域不兼容静默回落／清单值被当成读取／dump≠运行时／读者未落地就写默认值 —— **每条给门禁或探针**。
- **F 可核性**：§7 的 **9 条验收命令**（本轮全跑过，读数原样写进表里）＋ §8 未核项（U15/U16/U17）＋ 一条**据实记录的瑕疵**。

## 1. 本轮**实跑**的东西（走查里每个"证明"都真跑过）

**① 最小自造 pack 探针**（`<临时目录>/own-pack/{index.js,probe.mjs}`，**仓库外**）：把一条 M1 规则 ＋ 一个 M2 `handler` 装进**真内核**（`createKernel` ＋ `createPackLoader`），原样输出：
```
① PLAN  count=8  problems=[]
   actionKinds=["setting","slot","slot","track","track","rule","middleware","code"]
   busEntriesAfterPlan=[]                     ← plan() 是纯的
② APPLY ok=true  applied=8
   busEntriesAfterApply=["own-demo-counter:module","own-demo-forbid-one-tool:rules"]
③ M1 deny  ok=false  refused={"code":"VMU_PACK_…_FORBIDDEN","message":"本机构不允许调用这个工具",…}
   M1 allow ok=true  decisions=[]             ← 同一钩子，未被规则命中时放行
④ M2 handler fired delta=1                    ← handler 真的被调用
⑥ STATUS applied=[{"id":"own-demo","version":"0.1.0","actions":8,"settingsApplied":1,"settingsShadowed":0}]
```

**② 走查 §7 的 9 条验收命令（全部本轮真跑）**：
```
临时探针                        ⇒ 见上（count=8／problems=[]／M1 具名拒／M2 delta=1）
node tests/vmu-pack.test.mjs                     ⇒ VMU PACK: 53 passed, 0 failed          exit=0
node tests/vmu-middleware-hooks-declared.test.mjs ⇒ MIDDLEWARE HOOKS DECLARED: 8/0        exit=0
node tests/vmu-script-bridge.test.mjs             ⇒ VMU SCRIPT BRIDGE: 34/0               exit=0
node tests/vmu-script.test.mjs                    ⇒ VMU SCRIPT: 18/0                      exit=0
node tests/audit-pack-face.test.mjs               ⇒ PACK FACE: 5/0                        exit=0
node scripts/generate-wired-schema.mjs --check    ⇒ schema already in sync (1554 -> 1554) exit=0
node tests/vmu-planned-settings.test.mjs          ⇒ ALL GREEN (planned=113, docs=27, 39/0) exit=0
node scripts/audit-hook-emit-classification.mjs   ⇒ HOOK EMIT CLASSIFICATION: 7/0          exit=0
node tests/audit-doc-index.test.mjs               ⇒ DOC INDEX: 5/0                        exit=0
node tests/audit-verbatim-claims.test.mjs          ⇒ VERBATIM CLAIMS: 3/0                  exit=0
node tests/audit-vmu-docs.test.mjs                 ⇒ VMU DOCS AUDIT: 83/1（那 1 条见 §5，不是本卷）
node scripts/check-docs.mjs                        ⇒ issues=1（唯一一条 [D0] 见 §5）
```

**③ C 段的 overlay 免费复核**（不起服务、不花会话）：`dsh --profile vmsmoke --dump-config --patch <v5>` ⇒ **exit=0**，overlay 行出现 `overlayFor`／`deliver: !!js >- (report) => console.log("[vmu-report-sink] …")`／`vmu: {tools.faces:['*'], packs.active:['v5r'], report:{…}}`，而 **preset 行整块不变**（`id/name/plugins` 全在）✓ —— 与 `22-§19.12` 观测 13 同源。

## 2. 走查里的三处"边界"是**实测**得来的，不是抄的

| 边界 | 依据 |
|---|---|
| **pack ≠ M4**；总线只跑 M1/M2，`script`/`plugin` 被具名拒 | `27-§1` ＋ `kernel/pack.js:127` 的校验（`kind must be rules|module`）＋ `bus.add` 的 `VMU_MIDDLEWARE_KIND_UNSUPPORTED` |
| **M2 的 `handler` 必须是函数**（装载器不读文件） | `kernel/pack.js:129-130` 的校验 ＋ 本卷探针（函数进了总线才 `busEntriesAfterApply=[module,rules]`） |
| **管线策略要写 `promptPolicies`，不能写 `middleware`** | `packs/v5r/index.js:71-74` 的真实教训（误放 `middleware` ⇒ 整包 apply 抛）＋ 探针里两条 `kind` 的正确落点 |

## 3. 据实记录的**瑕疵**（未修，非我文件）

`loader.plan(PACK).actions` 只可靠地给 `kind`：`setting/track/code` 三类**不带 `id`**（`rule/middleware/slot` 带）。计数 `count` 才是权威。已在走查 §6 写明，供 pack/api 面决定要不要补 `id`。

## 4. 未核项（写进走查 §8，并对应 `14-§2` 登记）

- **U15**：M4 **未实测**（需宿主插件装载；锚点 `docs/19` ＋ `extensions/`）。
- **U16**：`script`/`plugin` kind 的**具名拒**未跑探针（可复现路径已写：把 `kind:'rules'` 改 `'script'`）。
- **U17**：`docs/29` 的**设计卷归类**（`scripts/check-docs.mjs` 的 `DESIGN_VOLUMES` 加 `'29'`）。

## 5. 转办 / 与本次无关的红（只读，未动别人文件）

1. **请 vmu-verify 加一行**：`scripts/check-docs.mjs` 的 `DESIGN_VOLUMES` 加 `'29'` ⇒ `check-docs` 即 **issues=0**。（`docs/29` 已满足设计卷全部结构：上位／`> 状态`／验收／未核项→`14-§2`。）已发消息。
2. **`audit-vmu-docs` 83/1（非本卷）**：`VMU_EXIT_FLUSH_UNAVAILABLE`／`VMU_EXIT_FLUSH_FAILE…`（`kernel/index.js`）未登记 `03-§8` ⇒ 归 core。
3. **`vmu-entry` 149/1（非本卷，且非我 Round 6 删键所致）**：`E-17(乙)` 期望 `vmu.packs.allowKernelOverride:true` 下**顺序决定重叠值、两包都装**；实测 `boot(['v3-core','institute-min'], …)` 打印 `VMU_PACK_CONFLICT … vmu.meetings.verdictMaxRounds, vmu.meetings.quorumRule` ⇒ `allowKernelOverride` 的重叠语义与断言不一致，归 core/pack 定责。（证据：我删键后复测过 `vmu-entry 150/0`；冲突清单里没有那个键。）

## 6. 写范围核对
```
 M vibe-math-vmu/docs/00-README.md            （卷清单表加 29-build-your-own-preset 一行）
?? vibe-math-vmu/docs/29-build-your-own-preset.md（新卷）
?? _handoff/vmu/assistant-round9-report.md
（未改 kernel/report.js、tools/report.js、packs/v5r/prompts/**、docs/16/22 —— 本轮无需）
```
