// vmu settings — the SINGLE SOURCE of every tunable (docs/04).
//
// Design contract (docs/04 §2, §3):
//   · one declaration per key, here and nowhere else; everything else is DERIVED:
//     the Schemastery `Config`, the outward JSON Schema (docs, gates, domain checks),
//     the layering/override resolver, the hot-reload class table and the "who may change it" map;
//   · reading an UNDECLARED key is a defect, not a default (R4): `assertDeclared` throws and
//     `readSetting` refuses by name;
//   · every default is HARMLESS: the default path is zero mechanism (R1, 04-§3);
//   · "time" and "randomness" are never user-supplied values (I-3 in docs/01 §3.1): only the
//     framework sets them, so any `...At`/`...Ms` a user sends is refused.
//
// Carrier decision (D10 as corrected by the official-guideline recon): DSH documents no carrier;
// real packages use Schemastery and zod. vmu standardises on Schemastery for the plugin `Config`,
// and DERIVES a JSON Schema from the same table for documentation, gates and domain checks.
//
// NO STATIC HOST IMPORT, ON PURPOSE: this file must be importable by plain Node in this repository
// (the repository is a bundle, not a host, so `@deepseek-ai/schemastery` does not resolve here) and
// by the host at activation. The carrier is therefore INJECTED into `buildSchemastery(carrier)`; the
// data table, the validators, the resolver and the JSON Schema derivation need no carrier at all. A
// missing carrier is refused by name (`VMU_ENGINE_UNAVAILABLE`), never faked.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

// The shared math module owns its own defaults, and v5r's discipline was to TAKE them from there and
// COPY the arrays, so that every preset stays byte-comparable (its own comment says the module defaults
// are frozen and must never be mutated). A1/A2 of the P3 containment report apply exactly that here:
// `vmu.math.*` defaults are the module's, not a second hand-written opinion.
import { MATH_PARAM_DEFAULTS as MATH_DEFAULTS } from '../math-computation.js'

const mathDefaults = () => ({
  mathComputation: MATH_DEFAULTS.mathComputation,
  mathMode: MATH_DEFAULTS.mathMode,
  mathEngines: MATH_DEFAULTS.mathEngines.slice(),
  mathTimeoutMs: MATH_DEFAULTS.mathTimeoutMs,
  mathPackages: MATH_DEFAULTS.mathPackages.slice(),
  mathInstallScope: MATH_DEFAULTS.mathInstallScope,
})

/**
 * Hot-reload classes (docs/04 §5). A key without one may not ship (the gate is D13/D15 in the
 * docs linter and the E-class scenario in tests/vmu-settings.test.mjs).
 *   H0 immediate · H1 next turn · H2 next session · H3 read-only
 */
export const HOT = Object.freeze({ H0: 'H0', H1: 'H1', H2: 'H2', H3: 'H3' })

/**
 * The declarations. `key` is the canonical dotted identifier used by settings files, reports and
 * refusals; `type`/`domain` drive both derivations; `hot` and `who` are the operational contract.
 * `doc` is the one-line human description that lands in the generated parameter table (04-§11).
 */
/**
 * The HAND-WRITTEN core table. `SETTING_DEFS` below composes it with the GENERATED planned keys
 * (`settings/planned.js`), so every consumer keeps reading one table (docs/04 §2).
 */
const CORE_DEFS = Object.freeze([
  // ---- core ---------------------------------------------------------------------------------
  { key: 'vmu.core.enabled', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '内核总开关（关闭＝完全不介入）' },
  { key: 'vmu.core.storeBackend', type: 'enum', domain: ['json-fold', 'storage-domain'], def: 'json-fold', hot: HOT.H3, who: 'office', doc: '耐久后端（O1：默认 fold；换后端须过同一套门禁）' },
  { key: 'vmu.core.logLevel', type: 'enum', domain: ['debug', 'info', 'warn', 'error'], def: 'info', hot: HOT.H0, who: 'office', doc: '日志级别（不进模型上下文）' },

  // ---- limits (machine-enforced; refusals must name the current value and the cap) ----------
  { key: 'vmu.limits.toolCallsPerTurnCap', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '单回合工具调用上限；0＝不限' },
  { key: 'vmu.limits.maxLiveMembers', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '在活成员上限；0＝不设（机器强制）' },
  { key: 'vmu.limits.memoryCeilingMb', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '宿主进程 RSS 上限（超限拒绝新建成员；框架无法测量自己的"净"内存，故此处是宿主进程口径）；0＝不设' },
  { key: 'vmu.limits.wallClockMs', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '阶段墙钟硬上限（框架侧上限，不是用户可设的截止时刻）' },
  { key: 'vmu.limits.maxParallel', type: 'positiveInteger', def: 3, hot: HOT.H0, who: 'office', doc: '并发上限（P3：吸收 v5r 的 maxParallel；机器强制）' },

  // ---- records ------------------------------------------------------------------------------
  { key: 'vmu.records.tracks', type: 'stringList', def: ['progress', 'routes', 'obstacles', 'rejected', 'state'], hot: HOT.H1, who: 'office', doc: '记录分轨（负向知识有独立档）' },
  { key: 'vmu.records.headListAt', type: 'natural', def: 7, hot: HOT.H1, who: 'office', doc: '头部列表最多返回多少行（0＝全部）；被截断时按 docs/07 §4.4 计数' },
  { key: 'vmu.records.truncateMode', type: 'enum', domain: ['keepChars', 'keepHeadTail', 'dropMiddle'], def: 'keepChars', hot: HOT.H1, who: 'office', doc: '截断策略（必须计数，禁静默）' },
  { key: 'vmu.records.fingerprintPolicy', type: 'enum', domain: ['content-only', 'content+display'], def: 'content-only', hot: HOT.H2, who: 'office', doc: '内容指纹口径（默认排除展示头）' },
  // ROUND 261: 数据集登记（16 卷 §L9/L10；现由 kernel/records.js 的 datasetRegister 读取 ✓）.
  { key: 'vmu.data.requireParent', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "数据集必须有 parent（§L128：路径＋指纹＋参数＋parent；true ⇒ 无 parent 即具名拒）" },
  { key: 'vmu.data.versionScheme', type: 'enum', domain: ['semver', 'date', 'free'], def: 'semver', hot: HOT.H1, who: 'office', doc: "数据集版本方案（§L10：可引用到版本；semver ⇒ 版本须形如 MAJOR.MINOR.PATCH）" },
  // Found by the NEW read-side gate (tests/vmu-settings.test.mjs 1c): the v5r pack DECLARES and READS this key
  // (`packs/v5r-core.js:48/97`), yet it had never been in the schema - a real knob with a real consumer living
  // entirely outside the registry. Registering it is exactly what the gate demands.
  { key: 'vmu.records.requireSettledRecords', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '只允许写入已结算记录（v5r 机制；由包携带默认 true）' },
  // ROUND 5 / task-39 A (vmu-pack): TWO package-private keys that really have readers. The precedent is the row above
  // (a v5r package key declared here); the other three `vmu.v3.*` names vmu-pack found had ZERO readers and were
  // REMOVED from the pack rather than declared (declaring a key nobody reads is the "声明了没人读" defect).
  { key: 'vmu.v3.verifierCount', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: 'v3-core 包私有：裁定需要多少名独立验证者表态（v3 `verifierCount`）。读者＝`packs/v3-core/index.js:80` 的 quorum 中间件（`setting("vmu.v3.verifierCount")`）。' },
  { key: 'vmu.v3.mode', type: 'enum', domain: ['auto', 'manual'], def: 'auto', hot: HOT.H1, who: 'office', doc: 'v3-core 包私有：`manual` ⇒ 未经人工放行不得派发/运行（v3 `mode`）。读者＝`packs/v3-core/index.js:105` 的 manual-gate 中间件。' },
  // ★★★★★★★ PHASE 6 · 目标 2（v3 复刻）：THE TEN PACK-PRIVATE KEYS THE `packs/v3/` BUILD NEEDS, declared here for the
  // reason the two rows above exist - a pack-private key that is NOT in the schema is REFUSED BY NAME by
  // `vibe_vmu_set` (docs/10-packs.md:139-146), so "the pack declares it" is not enough to make it settable.
  // NOTE ON `who`: 'office' (the institute's own knob), matching the two v3-core rows above; these are pack policy
  // values, never framework behaviour, and the kernel reads NONE of them - their readers are `packs/v3/middleware/*`.
  { key: 'vmu.v3.tickIntervalMs', type: 'natural', def: 2000, hot: HOT.H1, who: 'office', doc: 'v3 复刻：周期扫描的墙钟间隔（v3 `tickIntervalMs:2000`，`vibe-math-v3.js:400`）。读者＝`packs/v3/settings/defaults.json` 的 `v3/tick` 种子 ＋ `packs/v3/middleware/tick.js` 的到期判定。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.planningHorizon', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: 'v3 复刻：一次计划最多保留多少个可执行动作（超出截断且计数）。读者＝`packs/v3/middleware/planner.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.plannerEnabled', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'v3 复刻：规划器总开关；连续 `plannerMaxFails` 次不可解析 ⇒ 自动置 false 并发出具名事件（绝不静默）。读者＝`packs/v3/middleware/planner.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.planMinIntervalMs', type: 'natural', def: 30000, hot: HOT.H1, who: 'office', doc: 'v3 复刻：两次规划之间的最小间隔（冷却）。读者＝`packs/v3/middleware/planner.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.plannerMaxQueuedTurns', type: 'number', def: 2, hot: HOT.H1, who: 'office', doc: 'v3 规划器：串行派发队列里同时存在的回合数达到该值就不再派新回合（防止模型慢/卡时把队列越堆越长）；队头已等待超过 vmu.turn.deliveryTimeoutMs 时同样停止派发' },
{ key: 'vmu.v3.plannerMaxFails', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: 'v3 复刻：连续不可解析多少次后关闭规划器。读者＝`packs/v3/middleware/planner.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.methodKeepEvery', type: 'positiveInteger', def: 5, hot: HOT.H1, who: 'office', doc: 'v3 复刻：方法库每 N 个应用记录保留一次归档。读者＝`packs/v3/middleware/methods.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.v3.methodKeepIntervalMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: 'v3 复刻：方法库按时间的保留间隔（0＝只按次数）。读者＝`packs/v3/middleware/methods.js`。' },
  { key: 'vmu.v3.methodAutoPromote', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: 'v3 复刻：方法是否自动晋升（默认 false＝须人工/规则放行）。读者＝`packs/v3/middleware/methods.js`。' },
  { key: 'vmu.v3.debateMaxRounds', type: 'natural', def: 5, hot: HOT.H1, who: 'office', doc: 'v3 复刻：验证辩论的最大轮次。读者＝`packs/v3/middleware/verify.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  // ★ PHASE 6 · 目标 2 / P1-3：升迁阈值。★ reader 是 `packs/v3/middleware/planner.js`，★ 未登记/越界时回落 0.7（与声明默认同值）。
  // ★ PHASE 6 · P1-5：汇报三路。★ reader＝`packs/v3/middleware/reports.js`；★ 未登记时回落 file。
  // ★ PHASE 6 · P1-7：工具过滤（★ 按【宿主实际注册名】比对；★ 调用期读取，不进值层）。★ 两张名单都空＝零机制。
  // ★ PHASE 6 · P1-10：论文收口目标。★ 空串＝零机制；★ 读者＝`packs/v3/middleware/paper-close.js`。
  { key: 'vmu.v3.paperCloseTarget', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: 'v3 复刻：论文收口目标 id；非空时 tick 里检查四件产物，缺件不宣称完成，必要时派 paper-writer 回合。读者＝`packs/v3/middleware/paper-close.js` ✓' },
  { key: 'vmu.v3.toolAllow', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: 'v3 复刻：允许的宿主工具名白名单（空＝零策略）；非空时名单外/拿不到工具名 ⇒ 具名拒。读者＝`packs/v3/middleware/toolfilter.js` ✓' },
  { key: 'vmu.v3.toolDeny', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: 'v3 复刻：禁止的宿主工具名黑名单（优先于 allow）；读者同上 ✓' },
  { key: 'vmu.v3.reportMode', type: 'enum', domain: ['file', 'push', 'both'], def: 'file', hot: HOT.H1, who: 'office', doc: 'v3 复刻：汇报三路模式（file＝写 reports 轨快照；push＝经 vmu.report 投递；both＝两者）。读者＝`packs/v3/middleware/reports.js` ✓' },
  { key: 'vmu.v3.reportIntervalMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: 'v3 复刻：汇报节流毫秒；0＝每个 tick 一次；>0 未到点具名 report-not-due。读者＝`packs/v3/middleware/reports.js` ✓' },
  { key: 'vmu.v3.promoteValueThreshold', type: 'number', def: 0.7, hot: HOT.H1, who: 'office', doc: 'v3 复刻：命题「价值/关键性」 ≥ 该值且未定论时自动晋升为问题（每 tick 至多一个）。读者＝`packs/v3/middleware/planner.js`；范围 [0,1]，越界/NaN 回落 0.7 ✓' },
  { key: 'vmu.v3.verdictMode', type: 'enum', domain: ['forced', 'natural'], def: 'forced', hot: HOT.H1, who: 'office', doc: 'v3 复刻：连续概率票如何折叠成裁决（forced＝夹到 [0.01,0.99] 后按阈值；natural＝原值）。读者＝`packs/v3/middleware/verify.js`。 ★ capability-default: 这不是框架政策，而是【v3 复刻包的机构选择值】（原始 vibe-math-v3 的默认），读者是 packs/v3/middleware/*；把它当框架默认看会误判，所以按本门禁的具名标记登记' },
  { key: 'vmu.records.pointerPropagation', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'P3/S21：头部列表为默认信息通道；关＝零注入且提示词逐字回退' },
  { key: 'vmu.records.meetingKeepEvery', type: 'positiveInteger', def: 5, hot: HOT.H1, who: 'office', doc: 'P3：每 N 场会议保留一次归档（v5r 的 meetingKeepEvery）' },
  // task-196 REGISTRATION ALIGNMENT: both keys were WIRED for real (audit age-out; deterministic LZSS packing)
  // while the registry still called them `planned: true, def: null`. Defaults mirror the CODE fallbacks:
  //   kernel/audit.js → retentionDays <= 0 means retention DISABLED       ⇒ default 0
  //   kernel/pack.js  → `snap['vmu.pack.compression'] === true` (strict)  ⇒ default false
  { key: 'vmu.audit.retentionDays', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '审计按天老化（天）；0 或负＝禁用老化（kernel/audit.js 的回落语义，禁用时不删任何行）' },
  { key: 'vmu.pack.compression', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '打包启用确定性 LZSS（kernel/pack.js 以 === true 判定；缺省＝关闭，禁用时不压缩）' },
  // ROUND 293: 长期保存包的容器与内容（07 卷 §L615-§L618；现由 kernel/library.js 的 exportRecord() 读取 ✓）.
  { key: 'vmu.pack.format', type: 'enum', domain: ['tar', 'zip'], def: 'tar', hot: HOT.H2, who: 'office', doc: "package 导出所用容器（未知容器 ⇒ 具名拒；仅在 export.format=package 时有意义 ✓）" },
  { key: 'vmu.pack.includeBody', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: "package 导出是否含正文（回执里报出 ✓）" },
  { key: 'vmu.pack.includeTrash', type: 'boolean', def: false, hot: HOT.H2, who: 'office', doc: "package 导出是否含回收站（默认否 ✓）" },
  // ROUND 296: 整合包装载（10 卷 §L46/§L80；现由 kernel/pack.js 按 compressionOn 的同一方式读取 ✓）.
  { key: 'vmu.packs.allowKernelOverride', type: 'boolean', def: false, hot: HOT.H2, who: 'office', doc: "pack 的设置与现有值【重叠】时是否允许覆盖（false ⇒ 具名拒 `VMU_PACK_CONFLICT`，即 10 卷 O4：绝不静默覆盖 ✓；调用方显式传 allowOverride 仍然优先 ✓）" },
  { key: 'vmu.packs.priority', type: 'integer', def: 0, hot: HOT.H2, who: 'office', doc: "pack 优先级（越大越先；★ 仅用于 status().applied 的排序，manifest 自身的 priority 优先 ✓）" },
  // ROUND 298: 在途台账（07 卷 §L570-§L571；现由 kernel/work.js 读取 ✓ —— 该面此前【一个 vmu.work.* 都不读】）.
  { key: 'vmu.work.keepEntries', type: 'integer', def: 200, hot: HOT.H2, who: 'office', doc: "在途台账保留条数（超过即裁掉【最旧】的，使仍未完成的工作保持可见 ✓）" },
  { key: 'vmu.work.autoSettle', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: "重启后 recover() 是否【自动标记】残留项为中断（false ⇒ 只报告不改写，即'仅安全动作' ✓）" },

  // ---- prompts ------------------------------------------------------------------------------
  { key: 'vmu.prompts.overridesDir', type: 'path', def: 'prompts/overrides', hot: HOT.H0, who: 'office', doc: '提示词覆盖目录（仓内相对路径）' },
  { key: 'vmu.prompts.bindings', type: 'objectList', def: [], hot: HOT.H0, who: 'office', doc: '五维绑定（优先级 角色<阶段<成员<任务<agent）' },
  // ★ ROUND 84: WHICH HOST AGENT AN ASSEMBLY IS FOR - the fifth binding dimension. Empty means NO assembly matches an
  // `agent`-scoped section or binding, which is deliberate: defaulting to "everyone" would inject a section into
  // assemblies it was never meant for. A host that knows its own identity passes `ctx.agent` instead, and that wins.
  { key: 'vmu.prompts.agentId', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '本装配是【为哪个宿主 agent】：★ scope 的 agent 维据此命中；★ 空 ⇒ 【不命中任何人】（★ 不会因为没设就命中全部）；★ 宿主在装配上下文里给的 agent 优先于此；★ 名字是部署词汇' },
  { key: 'vmu.prompts.whoMayOverride', type: 'stringList', def: ['office'], hot: HOT.H1, who: 'office', doc: '允许覆盖提示词者' },
  { key: 'vmu.prompts.resourceSection', type: 'boolean', def: false, hot: HOT.H0, who: 'office', doc: 'P3/S25-A：默认 false＝提示词一字不改；true 才注入【资源】段' },

  // ---- meetings (rules and mechanism only; "when to meet" and "what counts as stalled" are middleware)
  { key: 'vmu.meetings.quorumRule', type: 'enum', domain: ['m-unanimous', 'all-unanimous'], def: 'm-unanimous', hot: HOT.H1, who: 'role:chair', doc: '法定数规则（仅规则，不含"何时开会"）' },
  { key: 'vmu.meetings.quorumCap', type: 'natural', def: 3, hot: HOT.H1, who: 'role:chair', doc: 'P3：法定数上限 m = min(cap, 参与人数)；0＝不设上限' },
  // ROUND 6 / target-4 verdict: `vmu.meetings.reconsiderFloor` was a CONFIRMED ORPHAN (zero readers) and has been
  // DELETED here (Round 6 close). The knob that actually works is `vmu.ballot.reopenFloor`; a second name with a
  // different semantic made a deployment believe there were two knobs when only one is wired. Removal order was
  // measured, not guessed: the pack manifest values and the volumes that spelled the full name (docs/08, docs/10,
  // docs/12) were reworded FIRST, because the docs gates require every `vmu.*` name written in a volume to exist here.
  { key: 'vmu.meetings.verdictMaxRounds', type: 'positiveInteger', def: 3, hot: HOT.H1, who: 'role:chair', doc: 'P3：同一对象的复算轮次上限（不得无限复算）' },
  { key: 'vmu.meetings.hardLimitMs', type: 'natural', def: 1800000, hot: HOT.H1, who: 'office', doc: 'P3：会议墙钟硬界（唯一兜底）＝1800000；钳制 [300000, 7200000]；**不存在"无界"**' },
  { key: 'vmu.meetings.wakeRetries', type: 'natural', def: 5, hot: HOT.H1, who: 'office', doc: 'P3：同一成员同阶段的唤醒重试上限（钳制 [0,10]）；耗尽记 unreached 并视为"已获机会"' },
  { key: 'vmu.meetings.roundTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '单轮超时；0＝不限' },
  { key: 'vmu.meetings.quotesPerMessageMax', type: 'natural', def: 2, hot: HOT.H1, who: 'role:chair', doc: 'P3：每条发言最多引用几条；超限 ⇒ 具名拒' },
  { key: 'vmu.meetings.quoteDepthMax', type: 'natural', def: 3, hot: HOT.H1, who: 'role:chair', doc: 'P3：引用链深度上限；超深 ⇒ 折叠标注（不拒）' },

  // ---- tasks and stages ---------------------------------------------------------------------
  { key: 'vmu.tasks.maxOpenTasks', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '未完成任务上限；0＝不限' },
  { key: 'vmu.tasks.requireExpectedRevision', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '任务变更必须声明所见版本（防丢更新；关＝仅在声明时校验）' },
  { key: 'vmu.tasks.stages', type: 'stringList', def: [], hot: HOT.H2, who: 'office', doc: '阶段列表；默认空＝不假装有流程' },

  // ---- turn orchestration (docs/26 §3.2) ------------------------------------------------------
  // ROUND 347: the wakeup POLICY belongs in settings, not in the host. The original preset records only WHO should
  // be woken and leaves WHEN and WITH WHICH PROMPT to whoever runs it, which is exactly why only that host could run
  // an institute; making the policy a declared key is what lets the framework drive its own rounds.
  { key: 'vmu.turn.wakeupPolicy', type: 'enum', domain: ['round-robin', 'least-recent'], def: 'round-robin', hot: HOT.H2, who: 'office', doc: '下一轮唤醒谁：round-robin＝按在册次序轮转；least-recent＝最少被唤醒者优先（同票按在册次序，确定性）' },
  // ROUND 356: the research objective is DATA, not text. The charter's opening block carries a "（尚未设定）" slot in
  // the original, and freezing an objective into a section would make every deployment's charter wrong. It is a
  // settings value, reached from the section through the pipeline own `{{ setting:... }}` variable.
    // ★★★ ROUND 55: THE PERMISSION THAT GRANTS A CLOSURE VOTE IS DEPLOYMENT VOCABULARY, SO IT IS DECLARED HERE RATHER
  // THAN HARDCODED. The closure predicate needs to know which permission makes a member enfranchised; the v5r pack
  // grants `vote` to the member slot but NOT to the chair or the temp slot, and another institution may word it
  // differently. My Round-53 reason text REFERRED to this key before it existed - the contract-promising-what-the-
  // implementation-does-not-do family this phase keeps removing, and this instance was mine. Declared now, with the
  // pack supplying the default, so a deployment can rename it and `vibe_vmu_set` accepts it.
    // ★★★ ROUND 63: WHICH PROVIDER THE ONE-SHOT DELIVERY PATH USES. startContinuable goes through the host's
  // continuable-activation registry, which refuses a new activation while a previous one is being torn down -
  // measured as a persistent failure on a real machine because the driver already holds the root agent as an
  // activation. The host's own comment says one-shot delegation start() never enters that lifecycle, so naming a
  // provider switches member delivery to the one-shot path. Empty means 'use the continuable path', which is what a
  // host offering only that one needs.
    // ★★★ ROUND 74: WHICH DELIVERY ROUTE RUNS. 'subagents' (default) = the host runs the member turn as a subagent; 'caller' =
  // the assembled prompt goes back to the calling session, which plays the member turn and returns the reply through
  // vibe_vmu_turn { reply }. The caller route exists because the host types a subagent request's parent as an Agent
  // while exposing only list(): string[] to a plugin, so a plugin cannot construct a legal parent.
  { key: 'vmu.turn.deliverMode', type: 'enum', domain: ['subagents', 'caller'], def: 'subagents', hot: HOT.H2, who: 'office', doc: 'capability-default: 这是交付【传输】的选择，不是研究该怎么进行的政策 —— 默认值 subagents＝宿主把成员回合当作子代理运行，是宿主协作得了的那条路（caller 那条要求部署把提示词交回调用会话）。交付路线：★ subagents＝宿主把成员回合当作子代理运行（★ 默认）；★ caller＝把装配好的提示词交回调用会话，★ 由它扮演成员回合并用 vibe_vmu_turn { reply } 送回答复' },
{ key: 'vmu.turn.deliverProvider', type: 'string', def: '', hot: HOT.H2, who: 'office', doc: '成员回合【一次性交付】所用的 provider 名：★ 非空且宿主提供 start() 时，★ 交付走一次性路径（★ 不进入 continuable registry）；★ 空则走 continuable 路径' },
{ key: 'vmu.turn.deliveryTimeoutMs', type: 'number', def: 180000, hot: HOT.H2, who: 'office', doc: '成员回合 one-shot 交付的 deadline（毫秒）。★ 超时后该回合以 VMU_TURN_DELIVERY_TIMEOUT 具名失败（带 turn/member/已等毫秒/最后一次交付阶段），并释放串行队列；★ 正常回合只要在 deadline 内返回就不受影响。★ SLV 实测（opencode，v3）：正常成员回合 5–44 秒；异常回合在 180 秒时超时（deliveryTimeoutMs 即由此定）' },
{ key: 'vmu.turn.closureVotePermission', type: 'string', def: 'vote', hot: HOT.H2, who: 'office', doc: 'capability-default: 值只是一个权限字符串的【名字】，谓词拿它去问谁能结题；换名不改机制，而名字本身是部署词汇（v5r 交给 member 槽位）。哪一个权限字符串算【结题表决权】：★ 谓词据此判断谁【有资格】结题。★ 默认 vote（★ v5r pack 把 vote 给 member 槽位，chair 与 temp 都没有）；★ 另一家机构可以改名' },
{ key: 'vmu.turn.objective', type: 'string', def: '（尚未设定）', hot: HOT.H2, who: 'office', doc: '本所研究对象（原问题）；默认值与原线未设定时的输出一字不差，绝不留空括号' },
  // ROUND 365: the resource discipline the original puts in front of every member is not a slogan, it is a block whose
  // NUMBERS are runtime parameters (docs/26 section 3.14). They live here so the text stays in the pack and the values
  // stay configurable - the point of the whole settings surface.
  { key: 'vmu.turn.maxParallel', was: ['vmu.agentBudget.maxParallel', 'vmu.resources.maxParallel'], was: ['vmu.resources.maxParallel'], type: 'number', def: 3, hot: HOT.H2, who: 'office', doc: '每轮最多同时唤醒的成员数（原线默认 3；非法值回落 3）' },
  { key: 'vmu.tools.enabled', type: 'stringList', def: null, hot: HOT.H2, who: 'office', doc: "已接线（host.js 的 install 读取）：宿主注册哪些 vmu 工具。空/缺省（null）＝不限制；显式空表 [] ＝一个都不注册；未知名会被具名拒绝而不是静默放开（docs/03 §7）。" },
  // ROUND 1 / K1 (D-01): the DECLARED-INTENT surface of the tool map. `vmu.tools.faces` names the faces to publish
  // (face keys like `minutes`, tool names like `vibe_vmu_minutes`, or `*` for every face); `vmu.core.facesDisabled`
  // removes faces BY NAME with a reason. They exist so every published face has at least one declaration path even when
  // its own settings family declares no keys - and so "this face is off" is always a named decision, never an absence.
  { key: 'vmu.tools.faces', type: 'stringList', def: null, hot: HOT.H1, who: 'office', doc: "已接线（host.js resolveFaces 读取）：要发布的工具面清单（面键如 `minutes`／工具名 `vibe_vmu_minutes`／`*` 全部）。缺省 null＝不额外声明任何面（仍遵守各面自己的 config／vmu.<族>.* 声明）；显式空表 []＝不靠本键声明任何面。" },
  { key: 'vmu.core.facesDisabled', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（host.js resolveFaces 读取）：按名关闭的工具面（面键或工具名）。被关的面在 status().faces.disabled 里带 VMU_NOT_PERMITTED 具名上报；名字写错会出现在 unknownDisabled 而不是被忽略。" },
  { key: 'vmu.turn.toolCallsPerTurnCap', was: ['vmu.agentBudget.toolCallsPerTurnCap', 'vmu.resources.toolCallsPerTurnCap'], was: ['vmu.resources.toolCallsPerTurnCap'], type: 'number', def: 0, hot: HOT.H2, who: 'office', doc: '本回合工具调用上限；0＝未设上限（仍请克制）' },
  { key: 'vmu.turn.memoryCeilingMb', was: ['vmu.agentBudget.memoryCeilingMb', 'vmu.resources.memoryCeilingMb'], was: ['vmu.resources.memoryCeilingMb'], type: 'number', def: 0, hot: HOT.H2, who: 'office', doc: '内存上限（MB）；0＝只提醒"压力明显增大"而不给数字' },
  { key: 'vmu.turn.selfCheck', was: ['vmu.agentBudget.selfCheck', 'vmu.resources.selfCheck'], was: ['vmu.resources.selfCheck'], type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '是否向成员展示资源纪律段（关掉＝零注入，提示词回到该段之前，注入点逐字不变）' },
  // ROUND 367: the pointer-propagation contract has its own switch, exactly as the original gates it. Off means the
  // section is not included at all (zero injection), never a "disabled" notice - see docs/26 section 3.14.
  { key: 'vmu.turn.replyCatalogue', type: 'enum', domain: ['compact', 'full'], def: 'compact', hot: HOT.H2, who: 'office', doc: 'which reply catalogue is injected: compact (what the delivered-prompt corpus carries) or full' },
  { key: 'vmu.turn.protocolPath', type: 'string', def: 'Shared/Protocol.md', hot: HOT.H2, who: 'office', doc: 'protocol path named by the compact reply catalogue (relative to the session working directory)' },
  { key: 'vmu.turn.verifyTarget', type: 'string', def: '(unspecified)', hot: HOT.H2, who: 'office', doc: 'the object under a truth ballot (verify phase)' },
  { key: 'vmu.turn.verifyKindLabel', type: 'string', def: '(unspecified)', hot: HOT.H2, who: 'office', doc: 'the kind label shown next to the object under a truth ballot' },
  { key: 'vmu.turn.invitedBy', type: 'string', def: '(unspecified)', hot: HOT.H2, who: 'office', doc: 'who invited this temp to speak (meeting phase)' },
  { key: 'vmu.turn.invitedWhy', type: 'string', def: '(unspecified)', hot: HOT.H2, who: 'office', doc: 'why this temp was invited to speak (meeting phase)' },
  { key: 'vmu.turn.feedback', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '是否注入工作反馈行（关掉＝零注入，连段标题都不出现；原线 feedbackOn 同义）' },
  { key: 'vmu.pointer.propagation', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '是否注入指针传播契约（关掉＝零注入；原线的 S21 开关同义）' },
  // ROUND 374: a placeholder nobody supplied used to become a silent empty slot. The policy decides whether a miss
  // is recorded (default) or refused by name; the pack's holes are closed first, then refuse can become the default.
  { key: 'vmu.prompts.missingVariable', type: 'enum', domain: ['report', 'refuse'], def: 'report', hot: HOT.H2, who: 'office', doc: '占位符无人供值时：report＝记录并在装配结果里报告（默认）；refuse＝具名拒（VMU_PROMPT_VARIABLE_MISSING）' },
  // ROUND 376: the eight placeholders an independent audit found with NO supplier are all facts about the institute,
  // so they become DECLARED settings with defaults instead of silent empty slots. A name, a leader id, a term and a
  // meeting number are configuration in this framework's sense: the pack holds the wording, the value comes from here.
  { key: 'vmu.turn.instituteName', type: 'string', def: 'institute', hot: HOT.H2, who: 'office', doc: '本所名（章程开头与多处句子引用）' },
  { key: 'vmu.turn.leaderId', type: 'string', def: '', hot: HOT.H2, who: 'office', doc: '在册领头人的代号；空＝无领头人（原线：章程绝不可点名不在册的领头人）' },
  { key: 'vmu.turn.tempHiredBy', type: 'string', def: '（未说明）', hot: HOT.H2, who: 'office', doc: '临时工的雇主（临时工章程开头用）' },
  { key: 'vmu.turn.tempDirection', type: 'string', def: '（未说明）', hot: HOT.H2, who: 'office', doc: '给临时工的起点方向' },
  { key: 'vmu.turn.tempTerm', type: 'string', def: '雇主另行通知', hot: HOT.H2, who: 'office', doc: '临时工任务期（原线默认措辞）' },
  { key: 'vmu.turn.meetingId', type: 'string', def: '', hot: HOT.H2, who: 'office', doc: '当前会议号；会议相位的标题用它' },
  { key: 'vmu.turn.formalModeLine', type: 'string', def: '鼓励：按实现难度自行决定；做了就归档，没做就写明难度判断，', hot: HOT.H2, who: 'office', doc: '回复目录里 Lean 形式化那一行的模式措辞（原线 require/encourage 两套）' },
  // ROUND 369: the formalisation block is mode- and status-dependent in the original, so its live values arrive here and
  // the wording stays in the pack. `modeLabel` carries the 强制/鼓励/主动 wording, and the review block names the proof.
  { key: 'vmu.turn.formalProof', type: 'string', def: 'Formal/p-x.lean', hot: HOT.H2, who: 'office', doc: '忠实性审查时点名的已通过证明文件（每轮按实际目标填）' },
  { key: 'vmu.turn.formalBlockedNote', type: 'string', def: '未说明', hot: HOT.H2, who: 'office', doc: '已记录的阻塞原因（每轮按实际目标填）' },
  { key: 'vmu.paper.reviewedMember', type: 'string', def: '(unspecified)', hot: HOT.H2, who: 'office', doc: 'whose part of the paper is under peer review' },
  { key: 'vmu.turn.formalRootRel', type: 'string', def: 'Formal', hot: HOT.H2, who: 'office', doc: '形式化工作目录（相对会话工作目录）；原线为研究所根下的 Formal/' },
  { key: 'vmu.turn.formalModeLabel', type: 'string', def: '鼓励', hot: HOT.H2, who: 'office', doc: '顺手形式化一行的模式措辞：强制／鼓励／主动' },

  // ---- math and formalisation ---------------------------------------------------------------
  // A1/A2 (P3): the DEFAULTS come from the shared module, so v2–v5r and vmu stay byte-comparable.
  { key: 'vmu.math.computation', type: 'enum', domain: ['off', 'auto', 'on'], def: mathDefaults().mathComputation, hot: HOT.H2, who: 'office', doc: 'P3：数学工具可用性（共享模块默认 auto）' },
  { key: 'vmu.math.mode', type: 'enum', domain: ['typed', 'typed+shell'], def: mathDefaults().mathMode, hot: HOT.H2, who: 'office', doc: 'P3：typed＝绝不提 shell 且拒绝 engine=cli' },
  { key: 'vmu.math.engines', type: 'stringList', def: mathDefaults().mathEngines, hot: HOT.H2, who: 'office', doc: '引擎优先级（默认取自共享模块并拷贝；空＝具名降级）' },
  { key: 'vmu.math.timeoutMs', type: 'natural', def: mathDefaults().mathTimeoutMs, hot: HOT.H0, who: 'office', doc: 'P3：单次计算预算（共享模块默认）' },
  { key: 'vmu.math.packages', type: 'stringList', def: mathDefaults().mathPackages, hot: HOT.H1, who: 'office', doc: 'P3：计算可要求的包/工具箱（共享模块默认）' },
  { key: 'vmu.math.installScope', type: 'enum', domain: ['user', 'system'], def: mathDefaults().mathInstallScope, hot: HOT.H1, who: 'office', doc: 'P3：安装作用域；system 仅当次、绝不记忆' },
  { key: 'vmu.math.compileTimeoutMs', type: 'natural', def: 0, hot: HOT.H0, who: 'office', doc: '编译超时；0＝作业级默认' },
  { key: 'vmu.math.formalVerify', type: 'enum', domain: ['off', 'encourage', 'require'], def: 'off', hot: HOT.H2, who: 'office', doc: 'P3：判定时的形式化要求；默认 off＝零策略' },
  { key: 'vmu.math.leanCommand', type: 'string', def: 'lean', hot: HOT.H1, who: 'office', doc: 'P3：Lean 命令名（命令模板可覆盖）' },
  { key: 'vmu.math.leanArgs', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: 'P3：Lean 附加参数（显式 -R/--root 优先于 searchPaths）' },
  { key: 'vmu.math.leanTimeoutMs', type: 'natural', def: 120000, hot: HOT.H0, who: 'office', doc: 'P3：单次 Lean 编译预算' },
  { key: 'vmu.math.leanAsync', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: 'P3：后台队列编译；只有"退出 0 且文件内容哈希未变"才可标 passed' },
  { key: 'vmu.math.leanInitiative', type: 'enum', domain: ['off', 'normal', 'eager'], def: 'normal', hot: HOT.H2, who: 'office', doc: 'P3：日常形式化积极性（与 formalVerify 判定时要求正交）' },
  { key: 'vmu.math.leanSearchPaths', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: 'P3：额外 -R 根（去重后注入，自动 VibMath 根之前）' },
  { key: 'vmu.math.leanJobsMaxParallel', type: 'positiveInteger', def: 1, hot: HOT.H1, who: 'office', doc: 'P3：后台编译并发（1＝串行）' },

  // ---- safety -------------------------------------------------------------------------------
  { key: 'vmu.safety.pathPolicy', type: 'enum', domain: ['workspace-only', 'workspace+shared'], def: 'workspace-only', hot: HOT.H3, who: 'office', doc: '写保护范围' },
  { key: 'vmu.safety.approvalRequired', type: 'stringList', def: ['publish', 'delete', 'network-egress'], hot: HOT.H1, who: 'office', doc: '需人类批准的动作（轮 217 接线：默认取 docs/20 §2 的声明；与 vmu.safety.askOn 取并集，由同一判定读取）' },
  { key: 'vmu.safety.delegableKeys', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '可下放给角色槽位的键' },

  // ---- middleware ---------------------------------------------------------------------------
  { key: 'vmu.middleware.entries', type: 'objectList', def: [], hot: HOT.H0, who: 'office', doc: '中间件清单（默认空＝零机制）' },
  { key: 'vmu.middleware.hookTimeoutMs', type: 'positiveInteger', def: 2000, hot: HOT.H0, who: 'office', doc: '单钩子预算' },
  { key: 'vmu.middleware.breakerThreshold', type: 'positiveInteger', def: 3, hot: HOT.H0, who: 'office', doc: '连续失败熔断阈值' },
  // ROUND 294: 三段逐条目字段的【全局默认值】（05 卷 §L77/§L81/§L63；现由 kernel/bus.js 的条目规范化读取 ✓）.
  { key: 'vmu.middleware.enabled', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: "条目未声明 enabled 时的默认（false ⇒ 新条目默认【登记但不调用】；★ 条目自身的 enabled 优先 ✓）" },
  { key: 'vmu.middleware.order', type: 'integer', def: 1000, hot: HOT.H2, who: 'office', doc: "条目未声明 order 时的默认排序键（越小越先；同级按 id 字典序 ✓）" },
  // ★★★★★★★ PHASE 6 · 轮 17（Lead 裁决，回应目标 3 审计的 C5）：`def` 从 `'closed'` 改为 `''`（中性）。
  // WHY: the per-hook policy in `HOOK_REGISTRY` (`DEFAULT_FAILURE`; observation hooks are `open`) IS the designed
  // semantics - "the policy lives in the declaration" - and a global `closed` would silently turn every observation hook
  // fail-closed, so a throwing OBSERVATION middleware would start BLOCKING tool calls. That is a behaviour change nobody
  // asked for, and it is not what the code ever did. The schema row was the thing that lied: this key has no single
  // scalar default, and its honest default is "whatever each hook declares". Empty string = neutral = per-hook.
  { key: 'vmu.middleware.onFailure', type: 'enum', domain: ['', 'closed', 'open', 'skip'], def: '', hot: HOT.H2, who: 'office', doc: "条目未声明 failure 时的默认失败策略（★ 缺省 `''`＝**按每个钩子在登记表里声明的策略** ✓；显式设 closed/open/skip 才会覆盖所有条目 —— ★ 注意 closed 会让观测类钩子也挡住操作）" },
  { key: 'vmu.middleware.dryRun', type: 'boolean', def: false, hot: HOT.H0, who: 'office', doc: '干跑（只报不做）' },

  // ---- packs --------------------------------------------------------------------------------
  { key: 'vmu.packs.active', type: 'stringList', def: [], hot: HOT.H2, who: 'office', doc: '生效整合包（冲突按 O4 报错）' },
  { key: 'vmu.packs.allowOverride', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许 pack 间显式覆盖' },
  { key: 'vmu.packs.activeOverrides', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '显式覆盖声明（不声明即报错）' },

  // ---- BATCH-1 IMPLEMENTATION SURFACES (docs/11 §9.8) --------------------------------------------
  // These keys were DECLARED in the design volumes and lived in `settings/planned.js`. Implementing the
  // services moved them HERE, which is what makes docs/04 §11 show them as ✅ 已接线 and what makes
  // `scripts/generate-planned-settings.mjs` stop listing them ("existing" keys are excluded) - the registry
  // heals itself, and no statistic is hand-edited. `who: 'office'` for all of them for now; the volumes'
  // finer who-mapping (chair vs office vs pack) is a follow-up, recorded in the implementation log.
  { key: 'vmu.agenda.maxItems', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '议程条目上限（0＝不限；超限具名拒）' },
  { key: 'vmu.agenda.ownerRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '议程条目必须带负责人' },
  { key: 'vmu.agenda.timeboxRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '议程条目必须带时间箱' },
  { key: 'vmu.agenda.splitDepthMax', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: '议程拆分深度上限' },
  { key: 'vmu.agenda.carryOnAdjourn', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '延会时议程顺延（声明值；运行时兜底见 04-§6.1 的层次差异）' },
  { key: 'vmu.agenda.reorderAudit', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '议程重排必须留审计' },
  { key: 'vmu.motions.secondThreshold', type: 'positiveInteger', def: 1, hot: HOT.H1, who: 'office', doc: '动议成立所需附议数' },
  { key: 'vmu.motions.expireMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '动议失效时限（0＝不失效）' },
  { key: 'vmu.motions.withdrawable', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '动议可否撤回' },
  { key: 'vmu.motions.tabledMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '搁置上限（0＝不限）' },
  { key: 'vmu.motions.maxOpen', type: 'natural', def: 5, hot: HOT.H1, who: 'office', doc: '同时在案动议上限（0＝不限）' },
  { key: 'vmu.motions.proceduralKinds', type: 'stringList', def: ['recess', 'extend', 'limit-speech', 'adjourn'], hot: HOT.H1, who: 'office', doc: '程序动议种类' },
  { key: 'vmu.motions.privilegedKinds', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '特权动议种类' },
  { key: 'vmu.motions.amendFriendlyInline', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '友好修正可内联' },
  { key: 'vmu.motions.amendSubstantiveMode', type: 'string', def: 'one-vote', hot: HOT.H1, who: 'office', doc: '实质修正的处理方式' },
  { key: 'vmu.board.columns', type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: '看板列定义（空＝无看板：零机制）' },
  { key: 'vmu.board.wipPerColumn', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: '按列的 WIP 上限覆盖' },
  { key: 'vmu.board.wipDefault', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '默认 WIP 上限（0＝不限）' },
  { key: 'vmu.board.swimlanes', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '泳道清单' },
  { key: 'vmu.board.agingWarnMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '老化告警阈值（毫秒；0＝不告警）' },
  { key: 'vmu.board.moveRequiresTransition', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '变列必须走迁移闸' },
  { key: 'vmu.minutes.detail', type: 'enum', domain: ['brief', 'normal', 'full'], def: 'normal', hot: HOT.H1, who: 'office', doc: '纪要详略档' },
  { key: 'vmu.minutes.confirmPreviousRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '起草前必须已确认上次纪要' },
  { key: 'vmu.minutes.dissentMandatory', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '异议必须写明被拒项' },
  { key: 'vmu.minutes.actionsOwnerRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '行动项必须有负责人' },
  { key: 'vmu.minutes.dueRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '行动项必须有期限' },
  { key: 'vmu.minutes.dissentRetentionMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '异议保留期（0＝永久）' },
  { key: 'vmu.minutes.verbatimCapBytes', type: 'positiveInteger', def: 32768, hot: HOT.H1, who: 'office', doc: '逐字稿上限（触界报丢弃字节数，永不静默）' },
  // ---- batch-1 slice 4: budget (docs/08 §12.5) ----------------------------------------------------
  { key: 'vmu.budget.fairnessPolicy', type: 'enum', domain: ['equal', 'priority', 'reserve'], def: 'equal', hot: HOT.H1, who: 'office', doc: '配额公平策略（实现仅接 reserve 切片；equal/priority 的排序算法未实现 ✗）' },
  { key: 'vmu.budget.reserveRatio', type: 'ratio', def: 0, hot: HOT.H1, who: 'office', doc: '预留比例（0..1 分数；0＝不预留）' },
  { key: 'vmu.budget.warnAtRatio', type: 'ratio', def: 0.8, hot: HOT.H1, who: 'office', doc: '告警阈值（0..1 分数；越阈只警告不拒）' },
  { key: 'vmu.budget.onExceed', type: 'enum', domain: ['refuse', 'warn', 'pause'], def: 'refuse', hot: HOT.H1, who: 'office', doc: '触界动作：拒（具名）/警告记账/暂停' },
  // ---- batch-1 slice 5: metrics (docs/21 §4) ------------------------------------------------------
  { key: 'vmu.metrics.windowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '指标窗口（毫秒；0＝不限窗）' },
  { key: 'vmu.metrics.indicators', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '指标白名单（空＝零机制：可记但不聚合）' },
  { key: 'vmu.metrics.allowTrigger', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '指标是否允许触发动作（false ⇒ 具名拒）' },
  { key: 'vmu.metrics.exportFormat', type: 'enum', domain: ['json', 'jsonl'], def: 'json', hot: HOT.H1, who: 'office', doc: '导出格式' },
  // The read-side gate found these three the moment kernel/metrics.js landed: the module reads them tolerantly,
  // so nothing broke - but a knob read by code and absent from the schema is exactly the R4 defect the gate hunts.
  { key: 'vmu.metrics.sampleHighVolume', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '高频只读命中采样开关（变更/拒绝/结算永不采样）' },
  { key: 'vmu.metrics.sampleRate', type: 'ratio', def: 1, hot: HOT.H1, who: 'office', doc: '采样率（0..1；实现用确定性步进而非随机，故可复现）' },
  { key: 'vmu.metrics.seriesCap', type: 'positiveInteger', def: 200, hot: HOT.H1, who: 'office', doc: '单指标序列上限（溢出必须计数）' },

  // ---- batch-1 slice 6: audit / slice 7: alerts+slo / slice 8: retention / batch-2 slice 1: delegation ---
  // All four were read by code that landed before this registration; the READ-SIDE gate listed every one of
  // them, which is exactly why that gate exists. Types/defaults are the declared design values where the
  // volumes state them and the module's own fallback otherwise (the entry passes the raw map, docs/04 §6.1).
  { key: 'vmu.audit.ringMax', type: 'positiveInteger', def: 64, hot: HOT.H1, who: 'office', doc: '审计环形长度（丢弃必须计数）' },
  { key: 'vmu.audit.redactKeys', type: 'stringList', def: ['token', 'key', 'password', 'authorization'], hot: HOT.H1, who: 'office', doc: '入库前脱敏的字段名（脱敏在写入前，不在导出时）' },
  { key: 'vmu.audit.exportFormat', type: 'enum', domain: ['json', 'jsonl'], def: 'json', hot: HOT.H1, who: 'office', doc: '审计导出格式' },
  { key: 'vmu.alerts.thresholds', type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: '告警阈值声明' },
  { key: 'vmu.alerts.dedupWindowMs', type: 'natural', def: 300000, hot: HOT.H1, who: 'office', doc: '告警级去重窗口（指纹＝指标×对象×码）' },
  { key: 'vmu.alerts.escalateAfterMs', type: 'natural', def: 900000, hot: HOT.H1, who: 'office', doc: '未确认升级时限' },
  { key: 'vmu.alerts.silenceWindows', type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: '维护静默窗口（静默≠丢弃：仍计数，恢复后补摘要）' },
  { key: 'vmu.alerts.channels', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '通知通道（投递给 17 卷的通知原语）' },
  { key: 'vmu.alerts.inhibitions', type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: '抑制规则（抑制须点名抑制源）' },
  { key: 'vmu.alerts.autoEscalate', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '超时自动升级' },
  { key: 'vmu.alerts.maxThresholds', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '阈值声明上限（0＝不限；超限计数）' },
  { key: 'vmu.alerts.maxSilences', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '静默条目上限（0＝不限）' },
  { key: 'vmu.alerts.maxExemptions', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '豁免上限（0＝不限）' },
  { key: 'vmu.alerts.maxFingerprints', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '指纹环上限（0＝不限；丢弃计数）' },
  { key: 'vmu.alerts.maxSamples', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '评估样本上限（0＝不限）' },
  { key: 'vmu.quality.targets', was: ['vmu.slo.targets'], type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: 'SLO 目标声明' },
  { key: 'vmu.quality.errorBudgetAction', was: ['vmu.slo.errorBudgetAction'], type: 'enum', domain: ['freeze-H2', 'warn', 'none'], def: 'warn', hot: HOT.H1, who: 'office', doc: '错误预算耗尽的动作（默认只警告，不冻结）' },
  { key: 'vmu.quality.exemptions', was: ['vmu.slo.exemptions'], type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: 'SLO 豁免（必须记录理由与时长）' },
  { key: 'vmu.prune.autoRun', was: ['vmu.gc.autoRun'], type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否自动 GC（默认只报告不执行）' },
  { key: 'vmu.prune.graceDays', was: ['vmu.gc.graceDays'], type: 'natural', def: 14, hot: HOT.H1, who: 'office', doc: '孤儿宽限期' },
  { key: 'vmu.prune.scope', was: ['vmu.gc.scope'], type: 'string', def: 'workspace', hot: HOT.H1, who: 'office', doc: 'GC 作用范围' },
  { key: 'vmu.prune.exemptMarkers', was: ['vmu.gc.exemptMarkers'], type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '免于 GC 的标记' },
  { key: 'vmu.quota.softBytes', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '软配额（只警告）' },
  { key: 'vmu.quota.hardBytes', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '硬配额（0＝不限）' },
  { key: 'vmu.quota.warnAt', type: 'ratio', def: 0.8, hot: HOT.H1, who: 'office', doc: '配额告警阈值（0..1 分数）' },
  { key: 'vmu.quota.onExceed', type: 'enum', domain: ['warn', 'refuse', 'degrade'], def: 'warn', hot: HOT.H1, who: 'office', doc: '超配额动作' },
  { key: 'vmu.records.retention.keepEvery', type: 'natural', def: 10, hot: HOT.H1, who: 'office', doc: '每 N 版保留一份' },
  { key: 'vmu.records.retention.permanentMarker', type: 'string', def: 'permanent', hot: HOT.H1, who: 'office', doc: '永久保留标记（命中即不得裁剪）' },
  { key: 'vmu.records.retention.maxBytes', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '单轨体积上限（0＝不限）' },
  { key: 'vmu.records.retention.tierThreshold', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '冷热分层阈值（0＝不分层）' },
  { key: 'vmu.records.trash.retainDays', type: 'natural', def: 30, hot: HOT.H1, who: 'office', doc: '回收站保留天数' },
  { key: 'vmu.records.trash.autoPurge', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '回收站自动清除（默认关）' },
  { key: 'vmu.records.trash.countInQuota', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '回收站是否计入配额' },
  { key: 'vmu.records.history.depth', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '历史保留深度（0＝全部）' },
  { key: 'vmu.records.history.storeMode', type: 'string', def: 'diff', hot: HOT.H1, who: 'office', doc: '历史存储方式（diff/full）' },
  { key: 'vmu.delegation.maxDepth', type: 'positiveInteger', def: 1, hot: HOT.H1, who: 'office', doc: '委托链深度上限（1＝禁止转委）' },
  { key: 'vmu.delegation.subdelegateAllowed', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许转委（默认禁）' },
  { key: 'vmu.delegation.defaultTtlMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '委托默认有效期（0＝不过期）' },
  { key: 'vmu.delegation.maxTtlMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '委托最长有效期（0＝不限）' },
  { key: 'vmu.delegation.reasonRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '委托必须给理由' },
  { key: 'vmu.delegation.requireExplicitScope', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '必须显式声明权限范围' },
  { key: 'vmu.delegation.onExhausted', type: 'enum', domain: ['refuse', 'return'], def: 'refuse', hot: HOT.H1, who: 'office', doc: '委托预算耗尽时的动作' },
  { key: 'vmu.delegation.tokenShare', type: 'ratio', def: 0, hot: HOT.H1, who: 'office', doc: '可委托的令牌份额（0..1）' },
  { key: 'vmu.delegation.turnsShare', type: 'ratio', def: 0, hot: HOT.H1, who: 'office', doc: '可委托的回合份额（0..1）' },
  { key: 'vmu.delegation.revokeBroadcast', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '撤销时广播' },
  { key: 'vmu.delegation.auditChains', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '委托链必须留审计' },
  { key: 'vmu.delegation.roots', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '不来自委托的权威持有者（空＝S-2 拒绝一切授予，诚实默认）' },
  // ---- batch-2 slices 2-4: trust / arbitration / handover -------------------------------------------------
  { key: 'vmu.trust.kinds', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '声誉信号受控词表（空＝不限制）' },
  { key: 'vmu.trust.weights', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: '按 kind 的权重' },
  { key: 'vmu.trust.halfLifeMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '声誉衰减半衰期（0＝不衰减）' },
  { key: 'vmu.trust.evidenceRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '强权重信号必须有证据' },
  { key: 'vmu.trust.requireSource', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '信号必须有来源' },
  { key: 'vmu.trust.selfScoreAllowed', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许自评（默认禁）' },
  { key: 'vmu.trust.appealWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '申诉窗口（0＝不限）' },
  { key: 'vmu.trust.maxSignalsPerSubject', type: 'positiveInteger', def: 500, hot: HOT.H1, who: 'office', doc: '单主体信号上限（溢出必计数）' },
  { key: 'vmu.trust.aggregate', type: 'enum', domain: ['mean', 'weighted', 'median'], def: 'weighted', hot: HOT.H1, who: 'office', doc: '聚合方式' },
  // ROUND 253: 信任面的四键（17 卷；现由 kernel/trust.js 读取）.
  { key: 'vmu.trust.minSamples', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "样本数下限（0＝关；不足 ⇒ score=null 且 reason='insufficient-entries'，★ 样本少不是分数低）" },
  { key: 'vmu.trust.displayMode', type: 'enum', domain: ['score', 'band', 'hidden'], def: 'score', hot: HOT.H1, who: 'office', doc: "分数展示（score 给数／band 只给带／hidden 全隐；★ 经 hidden 泄漏的数字不叫隐藏）" },
  { key: 'vmu.trust.appealNeedsEvidence', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "申诉须带证据（true ⇒ dispute() 无证据即具名拒，VMU_TRUST_EVIDENCE_REQUIRED）" },
  { key: 'vmu.trust.decayOnEnd', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "关系结束后是否继续按时间衰减（false ⇒ 冻结在结束时刻，使终值可复现）" },
  // ROUND 254: 公平面的三键（08-§12.5／17 卷；现由 kernel/fairness.js 读取；★ maxSlotsPerInstance 未接，实测理由见 14 卷）.
  { key: 'vmu.fairness.criticalSlots', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "关键槽位保底（0＝关；reserve/critical 者不低于此数，仍受份额上限约束）" },
  { key: 'vmu.fairness.maxSlotsPerInstance', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "每实例槽位硬顶（0＝关；★ 基线与【余数轮转】都遵守；当上限使守恒不可能时 ⇒ VMU_FAIRNESS_QUOTA 并点名本键）" },
  // ROUND 257: 兼容矩阵（13 卷 §9；现由 kernel/migration.js 读取；★ 码早已登记：VMU_COMPAT_MATRIX_MISSING／VMU_COMPAT_UNKNOWN_COMBO）.
  { key: 'vmu.compat.enforce', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "是否强制兼容矩阵（false ⇒ 只报告不强制；无矩阵时不拒）" },
  { key: 'vmu.compat.unknownCombo', type: 'enum', domain: ['refuse', 'try'], def: 'refuse', hot: HOT.H1, who: 'office', doc: "未知组合处置（★ §9：默认【拒】而不是试试看；try ⇒ 允许但留 warned 痕迹）" },
  { key: 'vmu.compat.matrixSource', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "矩阵来源（回执据此说明【查的是哪张矩阵】；矩阵本体经 backends.matrix 注入 ✓）" },
  { key: 'vmu.compat.known.requireCitation', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已知差异须可引用（true ⇒ 无 citation 的条目具名拒；★ 每条还须说明能否回退，缺失者被【报出】）" },
  { key: 'vmu.fairness.newcomerQuota', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "新来者配额（0＝关；newcomer 者被抬到此数——配额应当【约束】，不只是被满足）" },
  { key: 'vmu.fairness.rebalanceEveryMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "重平衡周期（0＝无策略，回执明说无策略；rebalanceDue() 据此判定）" },
  { key: 'vmu.trust.useInSelection', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '选择时是否参考声誉（仅参考，绝不授权 ✗）' },
  { key: 'vmu.trust.useInArbitration', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '仲裁时是否参考声誉' },
  { key: 'vmu.trust.useInAuction', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '竞标时是否参考声誉' },
  { key: 'vmu.arbitration.mode', type: 'enum', domain: ['off', 'single', 'panel'], def: 'off', hot: HOT.H1, who: 'office', doc: '仲裁模式（off＝零机制：写操作具名拒）' },
  { key: 'vmu.arbitration.binding', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '裁决是否有约束力（false＝仅有建议效力，必须自曝）' },
  { key: 'vmu.arbitration.recordInMinutes', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '裁决是否记入纪要' },
  { key: 'vmu.arbitration.panelSize', type: 'positiveInteger', def: 3, hot: HOT.H1, who: 'office', doc: 'panel 模式的仲裁者人数' },
  { key: 'vmu.arbitration.recuseWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '回避窗口（0＝不限）' },
  { key: 'vmu.arbitration.rationaleRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '裁决必须给理由' },
  { key: 'vmu.arbitration.appealWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '上诉窗口（0＝不限）' },
  { key: 'vmu.arbitration.hearingMinNotes', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '裁决前最少听证笔记数' },
  { key: 'vmu.conflict.arbiterMustDiffer', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '当事人不得任仲裁者' },
  { key: 'vmu.conflict.arbiterRule', type: 'string', def: 'rotating', hot: HOT.H1, who: 'office', doc: '仲裁者选择规则（human＝必须人类指定）' },
  { key: 'vmu.conflict.classes', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '冲突类别（受控词表；唯一定义处）' },
  { key: 'vmu.conflict.cooldownMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '同一冲突的冷却期' },
  { key: 'vmu.conflict.maxOpen', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '同时在办案件上限（0＝不限）' },
  { key: 'vmu.conflict.escalateMaxPerSubject', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '单主体升级上限（0＝不限）' },
  { key: 'vmu.conflict.hearingNeedsMinutes', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '听证需纪要' },
  { key: 'vmu.conflict.appealToHuman', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '允许上诉到人类' },
  { key: 'vmu.handover.requiredFields', type: 'stringList', def: ['status', 'openItems', 'pointers', 'risks', 'acceptance'], hot: HOT.H1, who: 'office', doc: '交接必填字段（声明默认＝设计五字段；运行时代码强制四字段下限，不可更低）' },
  { key: 'vmu.handover.linkToTask', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '交接关联到任务' },
  { key: 'vmu.handover.requireAck', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '接受须显式确认' },
  { key: 'vmu.handover.onRejectReturnTo', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '被拒后退回到谁（空＝退回发起人）' },
  // batch-1 slice 9 (workflow): the four keys the gate found unread-but-read.
  { key: 'vmu.workflow.requireEvidence', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '阶段推进须带证据' },
  { key: 'vmu.workflow.requireAssignee', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '阶段推进须有负责人' },
  { key: 'vmu.workflow.gateOnOpenTasks', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '有未结任务时拦门（需注入 tasks 接缝）' },
  { key: 'vmu.workflow.reopenPolicy', type: 'enum', domain: ['deny', 'allow', 'gate'], def: 'deny', hot: HOT.H1, who: 'office', doc: '回退到首阶段的策略（gate 未实现 ✗）' },
  // ---- batch-2 slices 5-8: recruit / topology / fairness / charter ---------------------------------------
  { key: 'vmu.roles.map', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: '职位名 → role slot 显式映射（S-1：内核不认识职位名，未映射即拒）' },
  { key: 'vmu.admission.probationMs', was: ['vmu.recruit.probationMs'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '试用期（0＝无试用期）' },
  { key: 'vmu.admission.seatsMax', was: ['vmu.recruit.seatsMax'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '席位总上限（0＝不限）' },
  { key: 'vmu.admission.scoreRequiresRationale', was: ['vmu.recruit.scoreRequiresRationale'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '评分必须给理由' },
  { key: 'vmu.admission.scoreAggregate', was: ['vmu.recruit.scoreAggregate'], type: 'enum', domain: ['mean', 'median', 'trimmed'], def: 'mean', hot: HOT.H1, who: 'office', doc: '评分聚合方式' },
  { key: 'vmu.admission.offerExpiryMs', was: ['vmu.recruit.offerExpiryMs'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '录用报价有效期（0＝不过期）' },
  { key: 'vmu.admission.rejectNeedsReason', was: ['vmu.recruit.rejectNeedsReason'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '拒绝必须给理由' },
  { key: 'vmu.admission.requireEvidence', was: ['vmu.recruit.requireEvidence'], type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '申请必须带证据' },
  // ROUND 267: 招募的四个声明（17 卷 §L266-271；现由 kernel/recruit.js 读取 ✓）.
  { key: 'vmu.admission.policy', was: ['vmu.recruit.policy'], type: 'enum', domain: ['closed', 'claim', 'nominate', 'open'], def: 'closed', hot: HOT.H1, who: 'pack', doc: "招募方式（默认 closed ＝零机制 ✓；读取、校验并在 status() 上报）" },
  { key: 'vmu.admission.decideBy', was: ['vmu.recruit.decideBy'], type: 'enum', domain: ['manager', 'vote', 'allocation', 'human'], def: 'manager', hot: HOT.H1, who: 'pack', doc: "选拔裁决方式（同上：读取、校验并上报）" },
  { key: 'vmu.admission.needsHuman', was: ['vmu.recruit.needsHuman'], type: 'boolean', def: false, hot: HOT.H1, who: 'pack', doc: "是否必须人类批准（true ⇒ accept() 无具名批准者即具名拒 VMU_RECRUIT_NEEDS_HUMAN；默认 false ⇒ 不改变行为）" },
  { key: 'vmu.admission.probationPermissions', was: ['vmu.recruit.probationPermissions'], type: 'stringList', def: [], hot: HOT.H1, who: 'pack', doc: "试用期权限（★ 必须是【上位权限的子集】；非空且越界即具名拒；未提供上级权限视图时不做比较 ✓）" },
  { key: 'vmu.admission.maxCandidates', was: ['vmu.recruit.maxCandidates'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '单岗位候选人上限（0＝不限）' },
  { key: 'vmu.topology.mode', type: 'enum', domain: ['flat', 'star', 'committee', 'market', 'pipeline', 'swarm', 'matrix', 'hierarchy'], def: 'flat', hot: HOT.H1, who: 'office', doc: '协作拓扑（flat＝零机制：无路径约束）' },
  { key: 'vmu.topology.pipelineStages', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '流水线阶段（跳段即拒）' },
  { key: 'vmu.topology.hierarchyDepthMax', type: 'positiveInteger', def: 3, hot: HOT.H1, who: 'office', doc: '层级深度上限' },
  { key: 'vmu.topology.matrixDimensions', type: 'stringList', def: ['business', 'topic'], hot: HOT.H1, who: 'office', doc: '矩阵维度' },
  { key: 'vmu.topology.marketBidWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '市场竞价窗口（0＝不限）' },
  { key: 'vmu.topology.swarmQuorum', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '群体认领的法定数（0＝不判）' },
  // ★ ROUND 30 (task-149 ④, Lead's ruling: let the module's real semantics decide which side is wrong).
  // EVIDENCE, not a guess: `kernel/topology.js:55` reads it as `Number.isInteger(v) && v > 0 ? v : 0` and `:91`
  // guards with `params.committeeSize > 0` ⇒ **0 IS a meaningful state ("no committee-size limit")**, which this
  // row's own doc already said ("0＝不限"). So the DECLARATION was wrong (positiveInteger forbids 0) and the
  // default was right ⇒ the type becomes `natural`. Nothing else about the row changes.
  { key: 'vmu.topology.committeeSize', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '委员会规模上限（0＝不限）' },
  { key: 'vmu.topology.allowCrossLane', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '矩阵是否允许跨维直连' },
  { key: 'vmu.topology.starCenterSlot', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '星型中心席位（空＝星型不可用）' },
  { key: 'vmu.topology.autoSelect', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '拓扑是否自动选择' },
  { key: 'vmu.topology.maxDepth', type: 'positiveInteger', def: 3, hot: HOT.H1, who: 'office', doc: '深度上限（hierarchyDepthMax 的兼容别名来源）' },
  { key: 'vmu.topology.budgetMultiplier', type: 'ratio', def: 1, hot: HOT.H1, who: 'office', doc: '拓扑预算倍率（当前只自曝，未接入预算 ✗）' },
  { key: 'vmu.fairness.priorityWeights', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: '优先级权重（唯一合法权重源；声誉分数传入即拒 ✗）' },
  { key: 'vmu.fairness.reserveRatio', type: 'ratio', def: 0, hot: HOT.H1, who: 'office', doc: '保留比例' },
  { key: 'vmu.fairness.maxShare', type: 'ratio', def: 1, hot: HOT.H1, who: 'office', doc: '单人份额硬顶（不得突破）' },
  { key: 'vmu.fairness.minShare', type: 'ratio', def: 0, hot: HOT.H1, who: 'office', doc: '单人保底份额' },
  { key: 'vmu.fairness.minShares', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: '按主体的保底份额' },
  { key: 'vmu.fairness.tieBreak', type: 'string', def: 'lexicographic', hot: HOT.H1, who: 'office', doc: '平手规则（必须确定性）' },
  { key: 'vmu.fairness.explainRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '每次分配必须可解释' },
  { key: 'vmu.fairness.auditWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '公平性审计窗口（0＝全程）' },
  { key: 'vmu.fairness.underUseThreshold', type: 'ratio', def: 0.5, hot: HOT.H1, who: 'office', doc: '使用不足判定阈值' },
  { key: 'vmu.charter.enabled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '宪章机制总开关（false＝零机制）' },
  { key: 'vmu.charter.ratifyThreshold', type: 'ratio', def: 0.5, hot: HOT.H1, who: 'office', doc: '通过门槛（弃权不入分母）' },
  { key: 'vmu.charter.amendQuorum', type: 'ratio', def: 0.5, hot: HOT.H1, who: 'office', doc: '修订所需法定比例' },
  { key: 'vmu.charter.amendNeedsQuorum', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '修订须有审批记录' },
  { key: 'vmu.charter.amendNeedsHuman', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '修订须人类批准' },
  { key: 'vmu.charter.dissolveRequiresReason', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '解散必须给理由' },
  { key: 'vmu.charter.dissolveNeedsHuman', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '解散须人类批准' },
  { key: 'vmu.charter.maxArticles', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '条款数上限（0＝不限）' },
  { key: 'vmu.charter.effectiveDelayMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '批准后延迟生效（0＝立即）' },
  { key: 'vmu.charter.requiresParentConsent', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '子机构须母机构同意' },
  { key: 'vmu.charter.inheritDelegation', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '是否继承母机构委托权限（fail closed）' },
  { key: 'vmu.charter.immutableArticles', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '不可改条款 id（改动即拒并点名）' },
  { key: 'vmu.charter.frozenClauses', type: 'stringList', def: ['S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6'], hot: HOT.H1, who: 'office', doc: '冻结条款族（S-x 不变式）' },
  { key: 'vmu.charter.depthMax', type: 'positiveInteger', def: 2, hot: HOT.H1, who: 'office', doc: '子机构嵌套深度上限' },
  { key: 'vmu.charter.spawnMaxChildren', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '单机构子机构数上限（0＝不限）' },
  { key: 'vmu.charter.precedence', type: 'string', def: 'charter-over-pack', hot: HOT.H1, who: 'office', doc: '优先序（当前只自曝，未做冲突强制 ✗）' },
  { key: 'vmu.charter.fissionMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '裂变上限（未实现 API ✗）' },
  { key: 'vmu.charter.mergeNeedsHuman', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '合并须人类批准（未实现 API ✗）' },
  // ---- batch 3 slice 2 (repropack) + batch 2 slices 9-11 (skills/memory/auction) ------------------------
  { key: 'vmu.repro.requiredMembers', type: 'stringList', def: ['script', 'entry', 'envLock', 'seed', 'dataFingerprint', 'deps'], hot: HOT.H1, who: 'office', doc: '复现包必填成员（缺一即拒并点名）' },
  { key: 'vmu.repro.hashAlgo', type: 'string', def: 'sha256', hot: HOT.H1, who: 'office', doc: '指纹算法' },
  { key: 'vmu.repro.maxPackBytes', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '包体上限（0＝不限；触界必报丢弃）' },
  { key: 'vmu.repro.allowMissingSeed', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许缺种子（默认 false：随机作业必须有种子 ✗）' },
  { key: 'vmu.repro.envLockMode', type: 'enum', domain: ['full', 'minimal'], def: 'full', hot: HOT.H1, who: 'office', doc: '环境锁模式（两者当前都只用调用方给的 env ✗）' },
  { key: 'vmu.repro.dataPointerOnly', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '数据只存指针不复制（默认 true ✗）' },
  { key: 'vmu.repro.verifyRequiresMatch', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '验证要求逐成员一致' },
  { key: 'vmu.skills.levels', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '技能等级受控词表（空＝内置）' },
  { key: 'vmu.skills.evidenceRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '声明必须带证据' },
  { key: 'vmu.skills.selfAttestAllowed', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许自我见证（默认禁：不得自封 ✗）' },
  { key: 'vmu.skills.freshnessMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '技能保鲜期（0＝不过期；过期自曝并降级 ✗）' },
  { key: 'vmu.skills.declareTtlMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '声明有效期（freshnessMs 的兼容名来源）' },
  { key: 'vmu.skills.maxSkillsPerMember', type: 'positiveInteger', def: 50, hot: HOT.H1, who: 'office', doc: '单人技能上限（超限具名拒）' },
  { key: 'vmu.skills.aggregate', type: 'enum', domain: ['latest', 'max'], def: 'latest', hot: HOT.H1, who: 'office', doc: '多来源技能等级聚合' },
  { key: 'vmu.skills.degradePolicy', type: 'string', def: 'one-step', hot: HOT.H1, who: 'office', doc: '过期降级策略（one-step｜hold）' },
  { key: 'vmu.skills.requiresPermission', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '能力 ≠ 权限：技能本身不授权 ✗' },
  { key: 'vmu.skills.negotiationRounds', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '技能协商轮次（0＝不协商）' },
  { key: 'vmu.memory.kinds', type: 'stringList', def: ['lesson', 'antipattern', 'fact', 'preference'], hot: HOT.H1, who: 'office', doc: '记忆种类受控词表' },
  { key: 'vmu.memory.cardKinds', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '经验卡种类（空＝同 kinds）' },
  { key: 'vmu.memory.requireEvidence', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '记忆必须带证据' },
  { key: 'vmu.memory.requireSource', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '记忆必须有来源' },
  { key: 'vmu.memory.maxCards', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '经验卡上限（0＝不限）' },
  { key: 'vmu.memory.maxEntries', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '记忆条目上限（0＝不限；溢出必计数）' },
  { key: 'vmu.memory.cardTtlMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '经验卡有效期（0＝不过期）' },
  { key: 'vmu.memory.ttlMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '记忆有效期（0＝不过期；过期自曝 ✗）' },
  { key: 'vmu.memory.visibility', type: 'enum', domain: ['institution', 'team', 'agent'], def: 'institution', hot: HOT.H1, who: 'office', doc: '默认可见范围' },
  { key: 'vmu.memory.scopeRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '记忆必须声明作用域' },
  { key: 'vmu.memory.scopeDefault', type: 'enum', domain: ['institution', 'team', 'agent'], def: 'institution', hot: HOT.H1, who: 'office', doc: '缺省作用域' },
  { key: 'vmu.memory.contradictionPolicy', type: 'enum', domain: ['report', 'block', 'supersede'], def: 'report', hot: HOT.H1, who: 'office', doc: '矛盾处理（report 时必须在 contradictions() 可见 ✗）' },
  { key: 'vmu.memory.neverDropKinds', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '永不丢弃的记忆种类' },
  { key: 'vmu.memory.keepEvery', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: '压缩时保留比例' },
  { key: 'vmu.memory.compactionEveryMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '压缩周期（0＝不自动压缩）' },
  { key: 'vmu.memory.supersedeNeedsReason', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '取代记忆必须给理由' },
  { key: 'vmu.allocation.enabled', was: ['vmu.auction.enabled'], type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '拍卖/竞标开关（默认关＝零机制）' },
  { key: 'vmu.allocation.claimFirst', was: ['vmu.auction.claimFirst'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '先认领再拍卖' },
  { key: 'vmu.allocation.closeRule', was: ['vmu.auction.closeRule'], type: 'string', def: 'deadline', hot: HOT.H1, who: 'office', doc: '截止规则' },
  { key: 'vmu.allocation.bidWindowMs', was: ['vmu.auction.bidWindowMs'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '投标窗口（0＝不限）' },
  { key: 'vmu.allocation.maxBidCost', was: ['vmu.auction.maxBidCost'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '报价上限（0＝不限；不得突破 ✗）' },
  { key: 'vmu.allocation.requirePlan', was: ['vmu.auction.requirePlan'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '投标必须带方案' },
  { key: 'vmu.allocation.maxOpenAuctions', was: ['vmu.auction.maxOpenAuctions'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '同时在办拍卖上限（0＝不限）' },
  { key: 'vmu.allocation.minBids', was: ['vmu.auction.minBids'], type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: '授标所需最少投标数' },
  { key: 'vmu.allocation.maxBids', was: ['vmu.auction.maxBids'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '单场投标上限（0＝不限）' },
  { key: 'vmu.allocation.maxPosts', was: ['vmu.auction.maxPosts'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '挂单上限（0＝不限）' },
  { key: 'vmu.allocation.awardNeedsRationale', was: ['vmu.auction.awardNeedsRationale'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '授标必须给理由' },
  { key: 'vmu.allocation.cancelNeedsReason', was: ['vmu.auction.cancelNeedsReason'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '取消必须给理由' },
  { key: 'vmu.allocation.collusionScan', was: ['vmu.auction.collusionScan'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '雷同报价扫描（标记必须可见 ✗）' },
  { key: 'vmu.allocation.reputationInPrice', was: ['vmu.auction.reputationInPrice'], type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '声誉是否入价（默认 false：声誉不得定价 ✗）' },
  { key: 'vmu.allocation.tieBreak', was: ['vmu.auction.tieBreak'], type: 'string', def: 'lexicographic', hot: HOT.H1, who: 'office', doc: '平手规则（必须确定性）' },
  { key: 'vmu.allocation.maxSuspects', was: ['vmu.auction.maxSuspects'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '串谋嫌疑上限（0＝不限）' },
  { key: 'vmu.allocation.allowRuleOverride', was: ['vmu.auction.allowRuleOverride'], type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许调用方覆盖规则（默认 false）' },
  { key: 'vmu.collusion.windowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '串谋扫描窗口（0＝不限）' },
  { key: 'vmu.collusion.maxMutualShare', type: 'ratio', def: 0.8, hot: HOT.H1, who: 'office', doc: '互投/雷同份额阈值' },
  { key: 'vmu.collusion.minEvidence', type: 'natural', def: 2, hot: HOT.H1, who: 'office', doc: '判定嫌疑所需最少证据数' },
  { key: 'vmu.collusion.onSuspect', type: 'enum', domain: ['report', 'freeze-review'], def: 'report', hot: HOT.H1, who: 'office', doc: '嫌疑处理（默认只报告；冻结审查须显式开启）' },
  // batch-4 slice 1 (mathjobs): the job-face knobs the module really reads.
  { key: 'vmu.math.maxParallel', type: 'positiveInteger', def: 1, hot: HOT.H1, who: 'office', doc: '**数学运行**并发上限（作业/编译；超限 ⇒ 具名拒，不自旋等待 ✗）。★ 轮 4 Lead 裁决：本键**只**管数学运行并发（对齐 v5r 的 `leanJobsMaxParallel:1`）；**不要**拿它当"每轮唤醒几名成员"——那是**成员策略**，由 `vmu.limits.maxLiveMembers` 表达（v5r 写 3）。**两个不同策略不许强行相等**（轮 4 撤销过一次错误的镜像；那个旧的 jobs 作用域名字已从 schema 移除，此处不复写键名）。' },
  { key: 'vmu.math.maxJobs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '作业总量上限（0＝不限）' },
  { key: 'vmu.math.keepReceipts', type: 'natural', def: 200, hot: HOT.H1, who: 'office', doc: '回执保留条数（溢出必计数）' },
  { key: 'vmu.math.requireSeedForRandom', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '随机作业必须有种子' },
  { key: 'vmu.math.denyNetwork', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '默认禁网（作为 env 传给 spawn；真正拦截在宿主 ✗）' },
  { key: 'vmu.math.workspaceOnly', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '默认限工作区（同上，拦截在宿主 ✗）' },
  { key: 'vmu.math.captureStdoutBytes', type: 'natural', def: 65536, hot: HOT.H1, who: 'office', doc: 'stdout 捕获上限（触界报丢弃字节 ✗）' },
  // batch-4 slice 2 (formal): the formalisation-face knobs the module really reads.
  { key: 'vmu.formal.axiomWhitelist', type: 'stringList', def: ['propext', 'Classical.choice', 'Quot.sound'], hot: HOT.H1, who: 'office', doc: '受信公理白名单（白名单外 ⇒ 具名拒并点名 ✓）' },
  { key: 'vmu.formal.allowSorry', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许 sorry（默认 false：出现即拒并点名位置 ✗✓）' },
  { key: 'vmu.formal.requireArtifacts', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '是否必须有产物（当前只读入未强制 ✗）' },
  { key: 'vmu.formal.maxArtifacts', type: 'natural', def: 32, hot: HOT.H1, who: 'office', doc: '产物条数上限（溢出必计数）' },
  { key: 'vmu.formal.maxSourceBytes', type: 'natural', def: 262144, hot: HOT.H1, who: 'office', doc: '源码字节上限（触界报丢弃字节 ✗）' },
  // batch-3/5 tails: the keys external.js and domaingate.js really read.
  { key: 'vmu.external.conflictPolicy', type: 'enum', domain: ['refuse-on-conflict', 'newest-wins'], def: 'refuse-on-conflict', hot: HOT.H1, who: 'office', doc: '多源冲突策略（两种都必须把冲突报出来 ✗✓）' },
  { key: 'vmu.external.maxResults', type: 'positiveInteger', def: 100, hot: HOT.H1, who: 'office', doc: '单次取数结果上限（截断必计数）' },
  { key: 'vmu.external.offline', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '离线模式（只许命中缓存 ✓ 零网络）' },
  { key: 'vmu.external.sources', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '允许的来源清单（空＝不限制）' },
  { key: 'vmu.compliance.maxReports', type: 'positiveInteger', def: 1000, hot: HOT.H1, who: 'office', doc: '合规上报条数上限（溢出必计数）' },
  { key: 'vmu.compliance.saeLimitMs', type: 'natural', def: 86400000, hot: HOT.H1, who: 'office', doc: 'SAE 上报时限（毫秒；默认 24h）' },
  { key: 'vmu.compliance.aeLimitMs', type: 'natural', def: 259200000, hot: HOT.H1, who: 'office', doc: 'AE 上报时限（毫秒；默认 72h）' },
  // batch-1 slice 10 (scheduler). INTEGRATOR RULING: `vmu.schedule.*` is the canonical family (docs/08 §12.4);
  // the module also tolerates the older `vmu.scheduler.*` spellings, but only THIS family is declared - one
  // meaning, one name, and the declared name is the one the volume actually documents for the schedule face.
  { key: 'vmu.schedule.triggerVia', type: 'enum', domain: ['none', 'middleware', 'script'], def: 'none', hot: HOT.H1, who: 'office', doc: '到期是否触发流程（默认 none＝只报告 ✗✓）' },
  { key: 'vmu.schedule.maxPending', type: 'natural', def: 8, hot: HOT.H1, who: 'office', doc: '待触发项上限（0＝不限；超限具名拒 ✓）' },
  { key: 'vmu.schedule.timeSource', type: 'enum', domain: ['tick-only', 'host-timer'], def: 'tick-only', hot: HOT.H1, who: 'office', doc: '时间来源（tick-only＝只用 tick() 推进 ✓；host-timer 需注入 timer 接缝 ✗）' },
  { key: 'vmu.schedule.actionsAllowed', type: 'stringList', def: ['emit-hook', 'prompt'], hot: HOT.H1, who: 'office', doc: '允许的触发动作白名单（越界注册即拒 ✓）' },
  { key: 'vmu.schedule.triggers', type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: '声明式触发器种子' },
  { key: 'vmu.schedule.overdueGraceMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '迟到宽限（超宽限 ⇒ 丢弃并计数，绝不静默 ✗）' },
  { key: 'vmu.schedule.coalesceMissed', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '漏跑是否合并（合并也要报 missed ✓）' },
  // ★ PHASE 6 / K1: the DRIVER switch. Before this key existed, `arm()` was complete and nothing called it, so a
  // declared `vmu.schedule.triggers` seed could never fire on its own and a recurring item fired once and went quiet.
  // Default FALSE = zero mechanism (arming a host timer is a real side effect). When true the kernel arms once at
  // construction and the fire path re-arms. Read by `kernel/index.js` at the scheduler construction site.
  { key: 'vmu.schedule.autoArm', type: 'boolean', def: false, hot: HOT.H2, who: 'office', doc: '是否自动驱动调度（false＝零机制，只按 tick() 推进 ✓；true＝内核起手 arm 并在每次触发后重 arm ✓；★ 构造期读取一次：运行期修改在**重启后**生效，回执会如实说 next session ✓；timeSource=host-timer 但无 timer 接缝 ⇒ 起手即 VMU_CONTROL_NO_TIMER）' },
  { key: 'vmu.schedule.maxRecurrences', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '重复项上限（0＝不限）' },
  // ROUND 264: 时间与时区声明（07 卷 §L359/L360/L368；现由 kernel/scheduler.js 读取 ✓）.
  { key: 'vmu.schedule.defaultTimezone', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "默认时区（IANA 名；事件未带时区时取它，回执据此报告；缺时区 ⇒ VMU_SCHEDULE_TZ_UNKNOWN）" },
  { key: 'vmu.schedule.recurrenceEnabled', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "是否允许重复规则（false ⇒ every() 具名拒；默认 true ⇒ 不声明就不改变行为）" },
  { key: 'vmu.schedule.dstPolicy', type: 'enum', domain: ['wall', 'absolute'], def: 'absolute', hot: HOT.H1, who: 'office', doc: "夏令时口径（absolute＝绝对时刻，不受跳变影响 ✓ 默认；wall＝当地墙钟，可能顺延 —— 回执明说 ✓）" },
  { key: 'vmu.schedule.minIntervalMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '最小间隔（低于即拒 ✓）' },
  { key: 'vmu.schedule.maxHorizonMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '最远调度视界（0＝不限；超出即拒 ✓）' },
  { key: 'vmu.schedule.cancelNeedsReason', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '取消必须给理由（留痕 ✓）' },
  // round-15 tails: crypto / notify / lifecycle (and the hook registry that notify reads from volume 05).
  { key: 'vmu.crypto.requireSigner', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '必须有签名接缝（无接缝 ⇒ 具名拒，绝不伪造 ✗✓）' },
  { key: 'vmu.crypto.keyTtlMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '密钥有效期（0＝不自动过期）' },
  { key: 'vmu.crypto.signingKeyId', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '默认签名密钥引用（只引用，不落材料 ✓）' },
  { key: 'vmu.crypto.algorithm', type: 'string', def: 'ed25519', hot: HOT.H1, who: 'office', doc: '签名算法声明（实现归注入接缝 ✓）' },
  { key: 'vmu.crypto.allowUnsignedVerify', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '无接缝时是否允许"验证"（放行也**只返回未验证** ✗✓）' },
  // ROUND 250: 签名面的生命周期与审计声明（07／20 卷；现由 kernel/crypto.js 读取）.
  { key: 'vmu.crypto.enabled', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "签名面总开关（false ⇒ sign 具名拒，绝不静默无签名）" },
  { key: 'vmu.crypto.requireSignedAudit', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "审计必须带 purpose（true ⇒ 无 purpose 的签名被拒并点名）" },
  { key: 'vmu.crypto.rotateAfterDays', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "密钥轮换周期（0＝无策略，回执明说无策略；rotationDue 据此判定）" },
  { key: 'vmu.crypto.timestampAuthority', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "时间戳机构（声明后接缝必须返回 timestamp，否则拒；仅引用材料，不落密钥 ✓）" },
  { key: 'vmu.crypto.verifyInterval', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "复验周期（天；0＝无策略；verificationDue 据此判定）" },
  { key: 'vmu.notify.enabled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '通知开关（默认关＝零机制）' },
  { key: 'vmu.notify.dedupWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '通知级去重窗口（指纹＝watcher×事件×对象 ✓，与 21 卷分层 ✗）' },
  { key: 'vmu.notify.digestWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '摘要窗口（当前只自曝，未驱动调度 ✗）' },
  { key: 'vmu.notify.quiet', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '全局免打扰（**只挡投递、不挡记录** ✗✓）' },
  { key: 'vmu.notify.maxWatchers', type: 'positiveInteger', def: 100, hot: HOT.H1, who: 'office', doc: '关注条目上限（超限具名拒 ✓）' },
  { key: 'vmu.notify.maxRegister', type: 'positiveInteger', def: 500, hot: HOT.H1, who: 'office', doc: '通知登记册上限（溢出必计数 ✓）' },
  { key: 'vmu.notify.onFailure', type: 'enum', domain: ['log', 'throw'], def: 'log', hot: HOT.H1, who: 'office', doc: '投递失败策略（默认只记录：**不阻断业务** ✓）' },
  { key: 'vmu.notify.priorityFloor', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '优先级下限（低于该级不投递但仍记录 ✓）' },
  { key: 'vmu.notify.registeredEvents', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '已注册事件清单（空则回退读钩子注册表 ✓）' },
  { key: 'vmu.hooks.registered', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '钩子注册表（05 卷；通知面据此校验订阅事件 ✓）' },
  { key: 'vmu.lifecycle.stages', type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: '阶段表（16 卷 §1 的 L1–L24；**空 ⇒ 拒，不默认放行** ✗✓）' },
  { key: 'vmu.lifecycle.requireEvidence', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '每阶段必须有准入证据' },
  { key: 'vmu.lifecycle.maxArtifacts', type: 'positiveInteger', def: 20, hot: HOT.H1, who: 'office', doc: '产物条数上限（溢出必计数）' },
  { key: 'vmu.lifecycle.allowBackward', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许回退阶段（默认否：回退即拒 ✓）' },
  // K6 (round 16): the unified idempotency ledger.
  { key: 'vmu.idempotency.maxEntries', type: 'positiveInteger', def: 1000, hot: HOT.H1, who: 'office', doc: '台账条目上限（溢出 ⇒ 淘汰并计数 ✓）' },
  { key: 'vmu.idempotency.ttlMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '条目有效期（0＝不过期）' },
  { key: 'vmu.idempotency.pendingTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: 'pending 超时（0＝不限；超时可重试并留痕 ✓）' },
  { key: 'vmu.idempotency.scopeDefault', type: 'string', def: 'global', hot: HOT.H1, who: 'office', doc: '缺省作用域（同 key 跨 scope 视为不同键 ✓）' },
  { key: 'vmu.idempotency.abortNeedsReason', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'abort 必须给理由（留痕 ✓）' },
  { key: 'vmu.idempotency.retryAfterAbort', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'abort 后是否允许同 key 重试（同载荷 ✓）' },
  { key: 'vmu.idempotency.maxPayloadBytes', type: 'natural', def: 262144, hot: HOT.H1, who: 'office', doc: '载荷指纹计算上限（触界报丢弃 ✗）' },
  { key: 'vmu.idempotency.retrySamePayloadOnly', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'abort 后重试是否必须同载荷（默认是；放宽 ⇔ 重试是新尝试，必须自曝 ✗✓）' },
  { key: 'vmu.idempotency.writerId', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '写者标识（用于识别"更旧的覆盖" ✓；**同一部署的多个进程必须各给唯一值** ✗否则只能靠 seq 回退发现 ✓）' },
  { key: 'vmu.clock.resyncMs', type: 'natural', def: 60000, hot: HOT.H1, who: 'office', doc: '前跳冻结的**重同步上限**（累计冻结超此值 ⇒ 接受新时刻并自曝 resynced ✓；**永冻不可接受** ✗✓✓）' },
  // A1/A3 (round 21): anchor hygiene and the projection migrator.
  { key: 'vmu.audit.chain.checkpointEvery', type: 'positiveInteger', def: 100, hot: HOT.H1, who: 'office', doc: '自动检查点节奏（每 N 行；**默认 100 ⇒ 出厂即会落锚** ✓✓ —— 一个"接了却永不触发"的接缝等于没有 ✓；0＝手动 ⇒ 则必须知道**删尾不可检出** ✗）' },
  { key: 'vmu.projection.maxMigrationSteps', type: 'positiveInteger', def: 16, hot: HOT.H1, who: 'office', doc: '投影迁移步数上限（超限具名拒并给当前/上限 ✓）' },
  // ROUND 22: the 21 vmu.ballot.* keys that kernel/ballotbox.js genuinely honours (declaring them in core is what
  // moves them out of the generated planned set - planned.js is generated from the docs minus the core keys).
  { key: 'vmu.ballot.method', type: 'string', def: 'plurality', hot: HOT.H2, who: 'chair', doc: '表决方法（不支持 ⇒ 具名拒 ✓）' },
  { key: 'vmu.ballot.minVotes', type: 'natural', def: 0, hot: HOT.H2, who: 'chair', doc: '法定票数下限（不足 ⇒ **具名拒而非"未通过"** ✗✓）' },
  { key: 'vmu.ballot.minVotesRatio', type: 'ratio', def: 0, hot: HOT.H2, who: 'chair', doc: '法定比例下限' },
  { key: 'vmu.ballot.abstainCountsForFloor', type: 'boolean', def: true, hot: HOT.H2, who: 'chair', doc: '弃权是否计入法定人数基数' },
  { key: 'vmu.ballot.abstainAllowed', type: 'boolean', def: true, hot: HOT.H2, who: 'chair', doc: '是否允许弃权（禁止时投票 ⇒ 具名拒 ✓）' },
  { key: 'vmu.ballot.secrecy', type: 'enum', domain: ['open', 'secret'], def: 'open', hot: HOT.H2, who: 'chair', doc: '秘密表决 ⇒ **明细不可回收但保留计数** ✗✓' },
  { key: 'vmu.ballot.secrecyRecordFact', type: 'boolean', def: true, hot: HOT.H2, who: 'chair', doc: '秘密表决是否仍记录"发生过"这一事实 ✓' },
  { key: 'vmu.ballot.tieRule', type: 'enum', domain: ['chair', 'unresolved', 'status-quo'], def: 'chair', hot: HOT.H2, who: 'chair', doc: '平票处置（**必须自曝用了哪条规则** ✗✓）' },
  { key: 'vmu.ballot.runoffTopN', type: 'natural', def: 2, hot: HOT.H2, who: 'chair', doc: '第二轮取前 N 名（回执标 round:2 ✓）' },
  { key: 'vmu.ballot.roundsMax', type: 'natural', def: 2, hot: HOT.H2, who: 'chair', doc: '轮次上限（用尽仍平票 ⇒ 具名拒 ✓）' },
  { key: 'vmu.ballot.rollCallOrder', type: 'stringList', def: [], hot: HOT.H2, who: 'chair', doc: '点名顺序（**未求值不得出现在 enforced[]** ✗✓）' },
  { key: 'vmu.ballot.proxyMode', type: 'enum', domain: ['off', 'on'], def: 'off', hot: HOT.H2, who: 'chair', doc: '代理投票开关' },
  { key: 'vmu.ballot.proxyChainMaxDepth', type: 'natural', def: 1, hot: HOT.H2, who: 'chair', doc: '代理链深度上限' },
  { key: 'vmu.ballot.quadraticCreditCap', type: 'natural', def: 0, hot: HOT.H2, who: 'chair', doc: '二次方投票信用上限（超限 ⇒ 具名拒 ✓）' },
  { key: 'vmu.ballot.quotaSeats', type: 'natural', def: 1, hot: HOT.H2, who: 'chair', doc: '席位配额（多席计票上限）' },
  { key: 'vmu.ballot.recusePublic', type: 'boolean', def: false, hot: HOT.H2, who: 'chair', doc: '回避是否公开' },
  { key: 'vmu.ballot.recuseDeclareMode', type: 'string', def: 'on-record', hot: HOT.H2, who: 'chair', doc: '回避声明方式' },
  { key: 'vmu.ballot.vetoMode', type: 'enum', domain: ['off', 'chair', 'quorum'], def: 'off', hot: HOT.H2, who: 'chair', doc: '否决模式（off 时不介入 ✓）' },
  { key: 'vmu.ballot.auditReadOnly', type: 'boolean', def: true, hot: HOT.H2, who: 'chair', doc: '表决审计只读（真时回执 audit 为空 ✓）' },
  { key: 'vmu.ballot.auditRetentionMs', type: 'natural', def: 0, hot: HOT.H2, who: 'chair', doc: '表决审计保留期（**真实过期清理未实现** ✗）' },
  { key: 'vmu.ballot.processReadingsVisible', type: 'boolean', def: false, hot: HOT.H2, who: 'chair', doc: '过程读数是否可见' },
  // ROUND 22: the 15 vmu.records.* keys kernel/records.js honours but which were still generated as planned.
  { key: 'vmu.records.allowedKinds', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '记录类型白名单（表外 ⇒ 具名拒 ✓）' },
  { key: 'vmu.records.headFields', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '列表投影字段（**核心字段不可裁** ✗✓）' },
  { key: 'vmu.records.bodyCapBytes', type: 'natural', def: 262144, hot: HOT.H1, who: 'office', doc: '正文上限（超限读取时截断并**报丢弃字节数** ✗✓）' },
  { key: 'vmu.records.expandThreshold', type: 'natural', def: 4096, hot: HOT.H1, who: 'office', doc: '超阈按需展开' },
  { key: 'vmu.records.head.maxItems', type: 'natural', def: 200, hot: HOT.H1, who: 'office', doc: '每轨条数上限（满 ⇒ 具名拒 `VMU_QUOTA_EXCEEDED` 给现值/上限，**不静默淘汰** ✗✓）' },
  { key: 'vmu.records.head.sort', type: 'enum', domain: ['updatedAt', 'createdAt', 'title'], def: 'updatedAt', hot: HOT.H1, who: 'office', doc: '列表排序' },
  { key: 'vmu.records.body.noticeStyle', type: 'enum', domain: ['short', 'detailed'], def: 'short', hot: HOT.H1, who: 'office', doc: '截断提示样式（**必须含数量** ✗✓）' },
  { key: 'vmu.records.body.chunkedReturn', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否分片返回正文' },
  { key: 'vmu.records.naming.slugPolicy', type: 'enum', domain: ['cjk-keep', 'ascii'], def: 'cjk-keep', hot: HOT.H1, who: 'office', doc: 'slug 策略（ascii 为**剥离**非转写 ✗）' },
  { key: 'vmu.records.naming.maxLength', type: 'natural', def: 64, hot: HOT.H1, who: 'office', doc: 'slug 长度上限（截断必计数 ✓）' },
  { key: 'vmu.records.naming.conflictSuffix', type: 'string', def: '-{n}', hot: HOT.H1, who: 'office', doc: '命名冲突后缀模板' },
  { key: 'vmu.records.chunk.thresholdBytes', type: 'natural', def: 262144, hot: HOT.H1, who: 'office', doc: '分片阈值' },
  { key: 'vmu.records.chunk.chunkBytes', type: 'natural', def: 65536, hot: HOT.H1, who: 'office', doc: '分片大小' },
  { key: 'vmu.records.external.allowedSchemes', type: 'stringList', def: ['file'], hot: HOT.H1, who: 'office', doc: '外部引用方案白名单（表外 ⇒ `VMU_EXTERNAL_DISABLED` ✓）' },
  { key: 'vmu.records.external.verifyExists', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否校验外部引用存在（无接缝 ⇒ `verified:null` 自曝，**绝不假装已验证** ✗✓）' },
  // ROUND 24: the two course keys kernel/course.js reads as fallbacks (they were not among the 24 declared).
  { key: 'vmu.teaching.gradeScaleMax', was: ['vmu.course.gradeScaleMax'], type: 'natural', def: 100, hot: HOT.H2, who: 'chair', doc: '评分量表上限（越界 ⇒ 具名拒 ✓）' },
  { key: 'vmu.teaching.passMark', was: ['vmu.course.passMark'], type: 'natural', def: 0, hot: HOT.H2, who: 'chair', doc: '及格线（0＝不设 ✓）' },
  // K5 (round 16): the read-only replay that reconstructs state from the audit log.
  { key: 'vmu.replay.strict', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '未知事件类型是否具名拒（默认 false：计入 unknownKinds ✓ 绝不静默跳过 ✗）' },
  { key: 'vmu.replay.keepUnknown', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '未知事件是否保留在重建结果里（保留并标 unknown ✓）' },
  { key: 'vmu.replay.requireContiguousSeq', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '是否要求审计序号连续（缺口必须报 ✗✓）' },
  { key: 'vmu.replay.maxEvents', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '重放事件上限（0＝不限；截断必计数 ✓）' },
  { key: 'vmu.replay.maxStateKeys', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '重建状态键上限（0＝不限；截断必计数 ✓）' },
  // K1/K2 (round 17): compensation transactions and rate limiting.
  { key: 'vmu.tx.maxSteps', type: 'positiveInteger', def: 32, hot: HOT.H1, who: 'office', doc: '单事务步骤上限（超限具名拒 ✓）' },
  { key: 'vmu.tx.maxTransactions', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '在办事务上限（0＝不限）' },
  { key: 'vmu.tx.autoCompensate', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '失败是否自动逆序补偿（false ⇒ 停在 failed 并明说要显式补偿 ✓）' },
  { key: 'vmu.tx.compensateNeedsReason', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '补偿必须给理由（留痕 ✓）' },
  { key: 'vmu.tx.keepEvidence', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '是否保留现场证据（false ⇒ 显式取舍，会丢现场 ✗）' },
  { key: 'vmu.tx.traceCap', type: 'positiveInteger', def: 50, hot: HOT.H1, who: 'office', doc: '每事务轨迹上限（**失败行永不被丢** ✗✓，其余截断必计数 ✓）' },
  { key: 'vmu.ratelimit.ratePerSec', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '每秒补充令牌数（0＝无限流，**必须自曝"无限流"** ✗✓）' },
  { key: 'vmu.ratelimit.burst', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '突发容量（0＝不限）' },
  { key: 'vmu.ratelimit.scopeDefault', type: 'string', def: 'global', hot: HOT.H1, who: 'office', doc: '缺省作用域（perScope 为平铺覆盖，无继承链 ✗）' },
  { key: 'vmu.ratelimit.onLimited', type: 'enum', domain: ['refuse', 'queue', 'degrade'], def: 'refuse', hot: HOT.H1, who: 'office', doc: '超限动作（默认拒；queue 有上限，degrade 必须自曝 ✗）' },
  { key: 'vmu.ratelimit.retryAfterMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: 'Retry-After 覆盖（0＝按令牌回填计算 ✓）' },
  { key: 'vmu.ratelimit.maxKeys', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '桶数上限（0＝不限；淘汰必计数 ✓）' },
  { key: 'vmu.ratelimit.queueMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '排队上限（0＝不排队；溢出降级为具名拒并计数 ✓）' },
  { key: 'vmu.ratelimit.perScope', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: '按作用域覆盖限额' },
  // N1/N4 (round 18): the tamper-evident audit chain and the state-version/migration primitive.
  { key: 'vmu.audit.chain.verifyCap', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '分段验证上限（0＝全链；**只验前 N 行时必须如实报未验** ✗✓）' },
  { key: 'vmu.audit.chain.algorithm', type: 'string', def: 'sha256', hot: HOT.H1, who: 'office', doc: '链哈希算法声明（仅回显；实际由注入 hash 决定 ✗）' },
  { key: 'vmu.audit.chain.macKeyTtlMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '成功解析的密钥缓存时长（0＝不过期；**解析失败不入缓存**，下次必重试 ✗✓ —— 防一次密钥库抖动永久禁用不可否认链 ✓）' },
  { key: 'vmu.audit.macKey', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '审计链 HMAC 的**密钥引用**（**secret 引用，绝不写密钥材料** ✗✓；经注入的 `secrets` 缝解析 ✓；未给 ⇒ 链保持无密钥并**自曝 `keyed:false`** ✗✓）' },
  { key: 'vmu.state.current', type: 'string', def: '1', hot: HOT.H1, who: 'office', doc: '当前状态版本' },
  { key: 'vmu.state.requireVersion', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '状态必须带版本标签（缺失 ⇒ 具名拒，**绝不当成当前版本** ✗✓）' },
  { key: 'vmu.state.maxMigrationSteps', type: 'positiveInteger', def: 8, hot: HOT.H1, who: 'office', doc: '迁移步数上限（超限具名拒并给当前/上限 ✓）' },
  { key: 'vmu.state.onUnknown', type: 'enum', domain: ['refuse', 'warn'], def: 'refuse', hot: HOT.H1, who: 'office', doc: '未知版本策略（warn 时**必须自曝 `assumed`** ✗✓）' },
  { key: 'vmu.state.keepHistory', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '是否保留迁移历史（留痕 ✓）' },
  { key: 'vmu.state.allowDowngrade', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '是否允许降级迁移（默认拒；放行也必须自曝 ✗）' },
  // N3 (round 18): the clock monotonicity guard (not wired yet - contract alignment is still open, see docs/11 §9.8).
  { key: 'vmu.clock.onBackward', type: 'enum', domain: ['clamp', 'refuse', 'warn'], def: 'clamp', hot: HOT.H1, who: 'office', doc: '时钟回拨处置（clamp 不回退并自曝；refuse 具名拒；warn 必须自曝 ✗✓）' },
  { key: 'vmu.clock.maxBackwardMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '回拨容忍（≤ 容忍不判回拨 ✓）' },
  { key: 'vmu.clock.forwardJumpMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '异常前跳阈值（0＝不判定；超阈记 suspect ✓ 不静默 ✗）' },
  // M4 (round 20): the guard was one-sided - it caught backwards motion but a forward jump could empty the ledger
  // and reset a rate limiter. `maxForwardJumpMs` is the effective threshold (default one day: scheduling jitter is
  // milliseconds, so a day-long jump in one session can only be a broken clock) and `onForward` mirrors onBackward.
  { key: 'vmu.clock.maxForwardJumpMs', type: 'natural', def: 86400000, hot: HOT.H1, who: 'office', doc: '异常前跳阈值（**默认 1 天，不许关闭** ✗✓；超阈按 onForward 处置 ✓）' },
  { key: 'vmu.clock.onForward', type: 'enum', domain: ['clamp', 'refuse', 'warn'], def: 'clamp', hot: HOT.H1, who: 'office', doc: '异常前跳处置（clamp 不让值跳跃并自曝 ✓；refuse 具名拒 ✓；warn 可跳但必须自曝＋计数 ✗✓）' },
  { key: 'vmu.clock.maxSkews', type: 'positiveInteger', def: 100, hot: HOT.H1, who: 'office', doc: '回拨/前跳记录上限（溢出必计数 ✓）' },
  { key: 'vmu.handover.packBudgetBytes', type: 'positiveInteger', def: 32768, hot: HOT.H1, who: 'office', doc: '上下文包预算（触界必报丢弃）' },
  { key: 'vmu.handover.compress', type: 'enum', domain: ['none', 'summary'], def: 'summary', hot: HOT.H1, who: 'office', doc: '压缩方式' },
  { key: 'vmu.handover.requireFingerprint', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '每项须带指纹' },
  { key: 'vmu.handover.acceptTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '接受超时（0＝不限；执行未实现 ✗）' },
  { key: 'vmu.handover.onTimeout', type: 'string', def: 'report', hot: HOT.H1, who: 'office', doc: '超时行为（return|reassign|escalate；执行未实现 ✗）' },
  { key: 'vmu.handover.includeKinds', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '打包包含的条目类别（空＝全部）' },
  { key: 'vmu.handover.redactKeys', type: 'stringList', def: ['token', 'key', 'password', 'authorization'], hot: HOT.H1, who: 'office', doc: '打包前脱敏字段（与审计同规则）' },
  { key: 'vmu.notify.requireReason', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "订阅/退订必须给理由（轮 216 接线：无理由具名拒）" },
  { key: 'vmu.notify.maxSubjectsPerWatcher', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "单订阅主体上限（0＝不限；超限具名拒）" },
  { key: 'vmu.notify.channels', type: 'stringList', def: ['inbox', 'digest'], hot: HOT.H1, who: 'office', doc: "允许的投递通道（inbox|digest|hook|file；不在集合内具名拒）" },
  { key: 'vmu.notify.defaultChannel', type: 'string', def: 'inbox', hot: HOT.H1, who: 'office', doc: "默认通道（channel 传 default 时解析为它）" },
  { key: 'vmu.notify.suppressSelfEvents', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "抑制自己触发的事件（payload.actor 等于订阅本体 ⇒ 记录但不投递）" },
  { key: 'vmu.notify.snrFloor', type: 'ratio', def: 0, hot: HOT.H1, who: 'office', doc: "信噪比下限（payload.snr 低于它 ⇒ 只提示：投递但标 hintOnly）" },
  { key: 'vmu.notify.mergeWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "合并窗口（0＝不合并；>0 时窗口内合并并计数）" },
  { key: 'vmu.notify.mergeMaxPerDigest', type: 'positiveInteger', def: 50, hot: HOT.H1, who: 'office', doc: "单份摘要最大条数（超出计数并截断）" },
  { key: 'vmu.notify.quietDefault', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "默认免打扰时段 HH:MM-HH:MM（空＝无；格式不合法具名拒）" },
  { key: 'vmu.notify.quietTimezone', type: 'string', def: 'local', hot: HOT.H1, who: 'office', doc: "免打扰时区（自曝用；不改变判定语义）" },
  { key: 'vmu.notify.digestDefaultMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "默认摘要周期（0＝即时）" },
  { key: 'vmu.notify.dropOnFailure', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "投递失败是否丢弃该条（默认丢弃但绝不阻断业务）" },
  { key: 'vmu.notify.failureKeepMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "失败留痕保留期（0＝不按时间清理）" },
  { key: 'vmu.notify.retentionMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "通知记录保留期（0＝不清理；清理必计数）" },
  // ROUND 217: the appointment/term family（docs/17 §29.3）—— ten keys, each enforced in kernel/recruit.js, the face that
  // already owns staffing（it reads vmu.roles.map and keeps hiredAt / probationUntil / confirmedAt）.
  { key: 'vmu.roles.slotIdPattern', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "席位 id 形状正则（空串 ⇒ 用 kernel/recruit.js 的内建默认；默认值只写在那里，此处不重复字面量）" },
  { key: 'vmu.roles.termDefaultMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "任职默认任期（0＝无期限；accept 时记 termUntil）" },
  { key: 'vmu.roles.termMaxMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "任期上限（0＝不限；超上限被钳制并自曝 termClamped）" },
  { key: 'vmu.roles.termRenewable', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "任期可否续（false ⇒ renewTerm 具名拒）" },
  { key: 'vmu.roles.recallQuorum', type: 'ratio', def: 0, hot: HOT.H1, who: 'office', doc: "罢免所需支持比例（0＝只看流程；不足具名拒）" },
  { key: 'vmu.roles.recallCoolDownMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "罢免冷却（期内二次罢免具名拒，防反复弹劾）" },
  { key: 'vmu.roles.actingMaxMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "代理主持最长时长（0＝不限；超出被钳制并自曝 clamped）" },
  { key: 'vmu.roles.actingNeedsReason', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "代理必须给理由（无理由具名拒）" },
  { key: 'vmu.roles.separationPairs', type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: "职责分离对 [{a,b}]（同一实例不得兼任；违反具名拒）" },
  { key: 'vmu.roles.promotionNeedsEvidence', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "晋升必须带证据（缺失具名拒）" },
  // ROUND 217: the security family（docs/20 §2／§4／§12）—— ten keys, all enforced in kernel/guard.js.
  { key: 'vmu.safety.killSwitch', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "全局停止开关（true ⇒ 一切子进程与写入具名拒；默认 false）" },
  { key: 'vmu.safety.maxPathLength', type: 'natural', def: 4096, hot: HOT.H1, who: 'office', doc: "路径长度上限（默认 4096；超长具名拒）" },
  { key: 'vmu.safety.followSymlinks', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "是否允许跟随符号链接（默认 false；路径跨越软链具名拒）" },
  { key: 'vmu.safety.netPolicy', type: 'enum', domain: ['off', 'allowlist', 'allow'], def: 'off', hot: HOT.H1, who: 'office', doc: "网络策略（默认 off＝禁网；off 时已知网络客户端具名拒）" },
  { key: 'vmu.safety.execAllowlist', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "可启动的可执行白名单（空＝不预授权任何命令；非空时不在表内具名拒）" },
  { key: 'vmu.safety.maxCpuMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "CPU 用量上限（0＝不限；与内存闸同形）" },
  { key: 'vmu.safety.maxMemoryMb', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "内存上限（0＝不限；安全面的资源闸，与 vmu.limits.memoryCeilingMb 分工不同）" },
  { key: 'vmu.safety.capabilityMatrix', type: 'object', def: { 'external-reviewer': ['read-artifacts'] }, hot: HOT.H1, who: 'office', doc: "能力矩阵（默认内建最小集：外部审稿人＝只读产物；未列出的槽位默认无权限）" },
  { key: 'vmu.safety.askOn', type: 'stringList', def: ['publish', 'network-egress', 'delete'], hot: HOT.H1, who: 'office', doc: "需要询问的动作（默认同 approvalRequired；两者由同一判定读取）" },
  // ROUND 218: the outreach（传播）family. Contracts declared in docs/22 §传播, consolidated table lines 712-720.
  { key: 'vmu.dissemination.publicSummaryRequired', was: ['vmu.outreach.publicSummaryRequired'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "传播包必须带面向公众的摘要（缺失具名拒）" },
  { key: 'vmu.dissemination.evidenceFidelity', was: ['vmu.outreach.evidenceFidelity'], type: 'enum', domain: ['strict', 'warn'], def: 'strict', hot: HOT.H1, who: 'office', doc: "证据保真：strict ⇒ 每条主张须带 evidenceRef（缺失具名拒）；warn ⇒ 记入 warnings 并继续" },
  { key: 'vmu.dissemination.exaggerationWords', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "★★ pack 声明的【夸大词表】：strict 档下，对外摘要若命中表内词且该结论的内部置信度未覆盖，则具名拒；默认【空】⇒ 零机制（轮 530 按 docs/22 轮 63 裁定实现 ✓）" },
  { key: 'vmu.dissemination.embargoRespect', was: ['vmu.outreach.embargoRespect'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "禁运期内不得发布（具名拒，并给禁运终点）" },
  { key: 'vmu.dissemination.languageSet', was: ['vmu.outreach.languageSet'], type: 'stringList', def: ['zh', 'en'], hot: HOT.H1, who: 'office', doc: "允许的摘要语言集（超出集合具名拒）" },
  { key: 'vmu.dissemination.mediaApprovalPolicy', was: ['vmu.outreach.mediaApprovalPolicy'], type: 'string', def: 'spokesperson-only', hot: HOT.H1, who: 'office', doc: "媒体发言政策（spokesperson-only ⇒ 只有已声明发言人可发言，否则具名拒）" },
  { key: 'vmu.dissemination.openReviewEnabled', was: ['vmu.outreach.openReviewEnabled'], type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "开放评审开关（false ⇒ 请求开放评审具名拒）" },
  { key: 'vmu.dissemination.anonymityPreserve', was: ['vmu.outreach.anonymityPreserve'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "匿名保护（true ⇒ 传播包不得携带作者身份，违反具名拒）" },
  { key: 'vmu.dissemination.impactLogFields', was: ['vmu.outreach.impactLogFields'], type: 'stringList', def: ['channel', 'reach', 'date', 'ref'], hot: HOT.H1, who: 'office', doc: "影响日志必填字段（缺字段具名拒并点名第几条）" },
  { key: 'vmu.dissemination.impactUseInEvaluation', was: ['vmu.outreach.impactUseInEvaluation'], type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "影响是否可用于评价（默认 false ⇒ 用于评价时具名拒：它是传播指标而非研究质量信号）" },
  // ROUND 218: the cross-institution collaboration family（docs/22 §协作, consolidated table lines 721-727）—— enforced in kernel/collab.js.
  { key: 'vmu.collab.agreementRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "交换须先有协议（true ⇒ 无协议交换具名拒；false ⇒ 记录而不假装）" },
  { key: 'vmu.collab.dataSharingTemplate', type: 'string', def: 'standard', hot: HOT.H1, who: 'office', doc: "默认数据共享模板名（协议模板不在对手方声明中具名拒）" },
  { key: 'vmu.collab.counterpartyRegistry', type: 'string', def: 'Ops/Partners', hot: HOT.H1, who: 'office', doc: "对手方登记目录（相对项目根；本面只 REPORT 不触碰）" },
  { key: 'vmu.collab.expiryWarnDays', type: 'integer', def: 30, hot: HOT.H1, who: 'office', doc: "协议到期预警天数（进入窗口即记 expiry-warning；到期后交换具名拒）" },
  { key: 'vmu.collab.jointAuthorshipPolicy', type: 'string', def: 'contribution-then-alternate', hot: HOT.H1, who: 'office', doc: "共同署名政策（声明顺序；未实现的政策名自曝而非假装）" },
  { key: 'vmu.collab.settlementCycleDays', type: 'integer', def: 60, hot: HOT.H1, who: 'office', doc: "结算周期天数（≥1；未到周期即结算具名拒并给到期时刻）" },
  { key: 'vmu.collab.reconciliationToleranceMinor', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "对账容差（最小货币单位；超出容差具名拒并给差额）" },
  // ROUND 219: the money family（docs/22 §货币, consolidated table L762-771）—— enforced in kernel/funding.js.
  { key: 'vmu.funds.currencyDefault', was: ['vmu.money.currencyDefault'], type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "默认币种（缺省时用于 scaleOf 等；不覆盖显式传入者）；★ P2-01：''＝未声明（中性），v5r 在 pack 里声明 EUR" },
  { key: 'vmu.funds.roundingMode', was: ['vmu.money.roundingMode'], type: 'enum', domain: ['half-up', 'half-even', 'floor', 'ceil', 'trunc'], def: 'half-even', hot: HOT.H1, who: 'office', doc: "舍入方式（roundMinor 用它；默认银行家舍入）" },
  { key: 'vmu.funds.scaleByCurrency', was: ['vmu.money.scaleByCurrency'], type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: "币种→精度位数（覆盖 ISO 表；自曝 overridden）" },
  { key: 'vmu.funds.fxSource', was: ['vmu.money.fxSource'], type: 'string', def: 'manual-snapshot', hot: HOT.H1, who: 'office', doc: "汇率来源名（离线优先；checkFx 自曝来源）" },
  { key: 'vmu.funds.fxSnapshotDir', was: ['vmu.money.fxSnapshotDir'], type: 'string', def: 'Ops/FX', hot: HOT.H1, who: 'office', doc: "汇率快照目录（相对项目根；本面只 REPORT 不触碰）" },
  { key: 'vmu.funds.fxMaxAgeDays', was: ['vmu.money.fxMaxAgeDays'], type: 'natural', def: 7, hot: HOT.H1, who: 'office', doc: "汇率快照最大年龄（超出具名拒并给实际天数）" },
  { key: 'vmu.funds.allocationRemainderPolicy', was: ['vmu.money.allocationRemainderPolicy'], type: 'enum', domain: ['largest-remainder', 'first-party', 'last-party'], def: 'largest-remainder', hot: HOT.H1, who: 'office', doc: "分摊余数政策（allocate 用它；分摊结果必须加回总额，加不回则具名拒）" },
  { key: 'vmu.funds.rejectFloatAmounts', was: ['vmu.money.rejectFloatAmounts'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "拒浮点金额（内核强制：默认 true，只有显式 false 才关；金额一律最小单位整数）" },
  { key: 'vmu.funds.maxAmountMinor', was: ['vmu.money.maxAmountMinor'], type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "金额上限（最小单位；0＝不限；超出具名拒并给上限）" },
  { key: 'vmu.funds.allowNegative', was: ['vmu.money.allowNegative'], type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "是否允许负额（默认 false ⇒ 负额具名拒）" },
  { key: 'vmu.funds.auditTupleFields', was: ['vmu.money.auditTupleFields'], type: 'stringList', def: ['inputs', 'fx', 'rounding', 'result'], hot: HOT.H1, who: 'office', doc: "金额审计元组字段（只可增不可删；缺失具名拒并点名缺哪些）" },
  // ROUND 219: the agreements family（docs/22 协议闸 table）—— enforced in kernel/collab.js, where an agreement is USED.
  { key: 'vmu.agreements.registryDir', type: 'string', def: 'Ops/Agreements', hot: HOT.H1, who: 'office', doc: "协议登记目录（相对项目根；本面只 REPORT 不触碰）" },
  { key: 'vmu.agreements.kinds', type: 'stringList', def: ['dua', 'mta'], hot: HOT.H1, who: 'office', doc: "协议种类（未声明种类在开协议时具名拒）" },
  { key: 'vmu.agreements.unsignedPolicy', type: 'enum', domain: ['block', 'warn'], def: 'block', hot: HOT.H1, who: 'office', doc: "未签策略（block ⇒ 未签协议下的交换具名拒，即「未签不得共享」；warn ⇒ 记录并警告）" },
  { key: 'vmu.agreements.signatureRefRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "签署必须带引用（无 ref 具名拒）" },
  { key: 'vmu.agreements.expiryWarnDays', type: 'integer', def: 30, hot: HOT.H1, who: 'office', doc: "协议到期预警天数（与 vmu.collab.expiryWarnDays 各自独立，两者都会被读取）" },
  { key: 'vmu.agreements.reviewCadenceDays', type: 'integer', def: 365, hot: HOT.H1, who: 'office', doc: "复核周期（≥1；逾期在回执中 REPORTED 并告警，不擅自升级为拒绝）" },
  { key: 'vmu.agreements.scopeEnforcement', type: 'enum', domain: ['block', 'warn'], def: 'block', hot: HOT.H1, who: 'office', doc: "范围强制（block ⇒ 越出协议范围的交换具名拒；warn ⇒ 记录并警告）" },
  // ROUND 220: identity / human / discipline families（docs/17 的三张表）—— enforced in kernel/identity.js, human.js, discipline.js.
  { key: 'vmu.identity.principalBinding', type: 'enum', domain: ['off', 'advisory', 'required'], def: 'off', hot: HOT.H1, who: 'office', doc: "宿主主体绑定（off＝记录但不耦合；required ⇒ 无主体具名拒）" },
  { key: 'vmu.identity.trustedIssuers', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "可信 issuer（空＝不做 issuer 校验：零机制，而非静默通过或静默拒）" },
  { key: 'vmu.identity.claimMap', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: "主体属性→席位映射（未映射的 claim 被 REPORT，绝不悄悄变成席位）" },
  { key: 'vmu.identity.multiMembership', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "是否允许多机构归属（false ⇒ 第二条归属具名拒）" },
  { key: 'vmu.identity.maxMemberships', type: 'positiveInteger', def: 1, hot: HOT.H1, who: 'office', doc: "归属上限（≥1；超限具名拒并给现值/上限）" },
  { key: 'vmu.identity.allowPseudonym', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "是否允许化名（false ⇒ 具名拒）" },
  { key: 'vmu.identity.pseudonymScopes', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "允许化名的场景（不在其中具名拒）" },
  { key: 'vmu.identity.onEnd', type: 'enum', domain: ['archive', 'handover', 'both'], def: 'both', hot: HOT.H1, who: 'office', doc: "离职处置（archive／handover／both；回执分别自曝两项是否执行）" },
  { key: 'vmu.identity.auditReads', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "身份读取是否审计（true ⇒ 读取本身入账并在回执自曝）" },
  { key: 'vmu.human.vetoScope', type: 'enum', domain: ['global', 'institution', 'task'], def: 'institution', hot: HOT.H1, who: 'office', doc: "否决范围（超范围具名拒）" },
  { key: 'vmu.human.vetoNeedsReason', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "否决是否必须先给理由（紧急允许后补：后补状态被记录，不假装已给）" },
  { key: 'vmu.human.observerScopes', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "观察员可见范围（空＝什么都不可见：零机制）" },
  { key: 'vmu.human.approvalTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "审批等待（0＝无限等）" },
  { key: 'vmu.human.onTimeout', type: 'enum', domain: ['hold', 'default-deny', 'default-allow'], def: 'hold', hot: HOT.H1, who: 'office', doc: "超时行为（默认 hold＝挂起，绝不默认放行 ✗；三态在回执中各自具名）" },
  { key: 'vmu.human.dashboardScope', type: 'enum', domain: ['global', 'institution'], def: 'institution', hot: HOT.H1, who: 'office', doc: "人类总览范围（asking 超过它具名拒）" },
  { key: 'vmu.discipline.breakerFailures', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "熔断失败阈值（0＝不熔断：机制【关】，而非「允许零次失败」）" },
  { key: 'vmu.discipline.breakerWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "熔断统计窗口（0＝全部历史）" },
  { key: 'vmu.discipline.halfOpenAfterMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "半开试探间隔（0＝不自动半开）" },
  { key: 'vmu.discipline.suspendMaxMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "停职上限（0＝不设上限；有上限则钳制并自曝 clamped）" },
  { key: 'vmu.discipline.restoreNeedsHuman', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "复职是否需人类（true ⇒ 机器不能自行复职）" },
  { key: 'vmu.discipline.postmortemRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "复职必须带复盘（缺失具名拒）" },
  // ROUND 221: custody (kernel/custody.js) / budget (kernel/budget.js) / audit (kernel/audit.js).
  { key: 'vmu.custody.ledgerDir', type: 'string', def: 'Ops/Custody', hot: HOT.H1, who: 'office', doc: "样本台账目录（相对项目根；本面只 REPORT 不触碰）" },
  { key: 'vmu.custody.requireChain', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "必须链式保管（true ⇒ 登记须开链、转移须给持有人，否则具名拒）" },
  { key: 'vmu.custody.chainGapPolicy', type: 'enum', domain: ['block', 'warn'], def: 'block', hot: HOT.H1, who: 'office', doc: "链断策略（block ⇒ 断链具名拒；warn ⇒ 记录并告警）" },
  { key: 'vmu.custody.storageCycleWarnAt', type: 'natural', def: 5, hot: HOT.H1, who: 'office', doc: "冻融次数预警阈值（达阈告警；契约是告警而非拒绝 ✓）" },
  { key: 'vmu.custody.destroyKeepsReference', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "销毁后保留引用（true ⇒ 记录留存并说明样本已灭失）" },
  { key: 'vmu.anonymity.pseudonymStyle', was: ['vmu.custody.pseudonymStyle'], type: 'enum', domain: ['pseudonym', 'code'], def: 'pseudonym', hot: HOT.H1, who: 'office', doc: "主体引用风格（pseudonym ⇒ 看起来像明文标识的引用具名拒）" },
  { key: 'vmu.anonymity.mappingIrreversible', was: ['vmu.custody.mappingIrreversible'], type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "映射不可逆（内核强制：true 时【拒绝】存入主体↔引用的可逆映射，而不是加密后寄望）" },
  { key: 'vmu.budget.tokens', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "令牌总量（0＝不限；>0 即成为作用域默认上限）" },
  { key: 'vmu.budget.turns', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "回合总量（0＝不限）" },
  { key: 'vmu.budget.toolCalls', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "工具调用总量（0＝不限；与单回合上限 vmu.limits.toolCallsPerTurnCap 分工不同）" },
  { key: 'vmu.budget.subagents', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "子代理总量（0＝不限）" },
  { key: 'vmu.budget.perTaskShare', type: 'ratio', def: 0, hot: HOT.H1, who: 'office', doc: "单任务可占比例（>0 且有限额时，同一任务超出该份额具名拒）" },
  { key: 'vmu.audit.level', type: 'enum', domain: ['minimal', 'normal', 'verbose'], def: 'normal', hot: HOT.H1, who: 'office', doc: "审计级别（minimal ⇒ 行只留 what/seq/at；verbose ⇒ 另附脱敏字段名与级别）" },
  { key: 'vmu.audit.dir', type: 'string', def: '<root>/vmu/audit', hot: HOT.H1, who: 'office', doc: "审计目录（默认取 docs/20 声明；本面只 REPORT 不触碰文件系统）" },
  { key: 'vmu.audit.rotateBytes', type: 'natural', def: 10485760, hot: HOT.H1, who: 'office', doc: "轮转大小（默认取 docs/07 声明；rotate() 未 force 且未达阈即具名拒）" },
  { key: 'vmu.audit.rotateDaily', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "每日轮转（默认取 docs/20 声明）" },
  { key: 'vmu.audit.sensitiveFields', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "脱敏字段（默认取 docs/07 声明；与 redactKeys 合并生效）" },
  { key: 'vmu.audit.exportScope', type: 'stringList', def: ['settings', 'middleware', 'refusals'], hot: HOT.H1, who: 'office', doc: "导出范围（exportScoped 超出它具名拒）" },
  { key: 'vmu.audit.recountRoles', type: 'stringList', def: ['office', 'chair'], hot: HOT.H1, who: 'office', doc: "谁可复算（recount 对未列角色具名拒）" },
  { key: 'vmu.audit.traceKeepMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "追踪保留期（0＝不清理；>0 时 append 会按龄清理 trace 行并计数）" },
  // ROUND 222: explain (kernel/explain.js) / control (kernel/control.js) / citations (kernel/citations.js).
  { key: 'vmu.explain.detail', type: 'enum', domain: ['summary', 'full'], def: 'summary', hot: HOT.H1, who: 'office', doc: "解释粒度（summary ⇒ 超长字段被截并【点名 omitted】；full ⇒ 原样）" },
  { key: 'vmu.explain.includeChains', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "报告是否含委托链（false ⇒ 该节缺席并点名）" },
  { key: 'vmu.explain.includeScores', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "报告是否含评分（false ⇒ 该节缺席并点名）" },
  { key: 'vmu.explain.reasonRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "社会动作必须给理由（S-4；缺失具名拒）" },
  { key: 'vmu.explain.reasonMaxChars', type: 'positiveInteger', def: 400, hot: HOT.H1, who: 'office', doc: "理由长度上限（超出【具名拒】而非截断：截断后是另一句话）" },
  { key: 'vmu.explain.correlateBy', type: 'enum', domain: ['traceId', 'taskId', 'none'], def: 'traceId', hot: HOT.H1, who: 'office', doc: "关联维度（none ⇒ 【不关联，且不编造 id】；指定维度缺失具名拒）" },
  { key: 'vmu.explain.reportFormat', type: 'enum', domain: ['md', 'json'], def: 'md', hot: HOT.H1, who: 'office', doc: "报告格式（render 采用；二者不同时产出）" },
  { key: 'vmu.control.pauseScope', type: 'stringList', def: ['tasks', 'meetings', 'ballots', 'work'], hot: HOT.H1, who: 'office', doc: "暂停覆盖面（默认【不含归档面】：工作停下时归档必须继续）" },
  { key: 'vmu.control.watchdogIntervalMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "看门狗周期（0＝无定时器：本面如实说明，不假装有心跳）" },
  { key: 'vmu.control.idleAfterMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "多久算空闲（0＝不定义空闲）" },
  { key: 'vmu.control.idleAction', type: 'enum', domain: ['notice', 'recess', 'none'], def: 'notice', hot: HOT.H1, who: 'office', doc: "空闲行为（默认 notice＝【只提示，绝不自动散会】；recess 也只记录，散会属会议面）" },
  { key: 'vmu.control.degradeSteps', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "降级档位（子集 read-only／report-only／no-spawn；空＝未声明档位，降级具名拒）" },
  { key: 'vmu.control.canPauseRoles', type: 'stringList', def: ['office', 'chair'], hot: HOT.H1, who: 'office', doc: "谁可以暂停（未列角色具名拒）" },
  { key: 'vmu.control.stopClearsRegistry', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "stop 是否清空注册（回执自曝实际清了多少）" },
  { key: 'vmu.citations.style', type: 'enum', domain: ['bibtex', 'csl-json', 'csl-yaml'], def: 'bibtex', hot: HOT.H1, who: 'office', doc: "引文样式（render 采用；未声明样式具名拒）" },
  { key: 'vmu.citations.requiredFields', type: 'stringList', def: ['title', 'authors', 'year'], hot: HOT.H1, who: 'office', doc: "必填字段（缺失具名拒并点名缺哪些）" },
  { key: 'vmu.citations.idPriority', type: 'stringList', def: ['doi', 'arxiv', 'pmid', 'url'], hot: HOT.H1, who: 'office', doc: "标识符优先级（【按声明顺序】选键，而非按输入出现顺序）" },
  { key: 'vmu.citations.allowFreeText', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "是否允许无标识符条目（默认 false：无人能解析的引用不算引用）" },
  // ROUND 262: 两条标识符方案（16 卷 L84；现由 kernel/citations.js 读取 ✓）.
  { key: 'vmu.citations.orcid', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "启用 ORCID 作为可选标识符方案（★ 加入声明的优先级，不另造选键路径）" },
  { key: 'vmu.citations.ror', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "启用 ROR 作为可选标识符方案（同上；优先级仍以 idPriority 为准）" },
  // ROUND 223: seven vmu.math.* keys that were declared in docs/09 and are now read by kernel/mathtools.js.
  { key: 'vmu.math.units.uncertainty', type: 'enum', domain: ['off', 'first-order', 'monte-carlo'], def: 'off', hot: HOT.H1, who: 'office', doc: "不确定度传播（off ⇒ 请求不确定度时具名拒）" },
  { key: 'vmu.math.formal.assistants', type: 'stringList', def: ['lean'], hot: HOT.H1, who: 'office', doc: "启用助手集合（请求含集合外助手具名拒）" },
  { key: 'vmu.math.formal.onDisagreement', type: 'enum', domain: ['block', 'report'], def: 'block', hot: HOT.H1, who: 'office', doc: "助手结论矛盾处置（block ⇒ 具名拒；report ⇒ 记入回执）" },
  { key: 'vmu.math.formal.librarySearch', type: 'enum', domain: ['off', 'loogle', 'mathlib'], def: 'off', hot: HOT.H1, who: 'office', doc: "定理库检索（off ⇒ 请求检索时具名拒）" },
  { key: 'vmu.math.formal.skeletonStyle', type: 'enum', domain: ['off', 'have', 'suffices'], def: 'off', hot: HOT.H1, who: 'office', doc: "证明骨架风格（off ⇒ 请求骨架时具名拒）" },
  { key: 'vmu.math.formal.crossCheck', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "多助手交叉核对（true ⇒ 少于两个助手具名拒：一个助手无法交叉核对）" },
  { key: 'vmu.math.artifacts.dir', type: 'string', def: 'Computation', hot: HOT.H1, who: 'office', doc: "制品归档目录（相对项目根；制品路径落在其外具名拒）" },
  // ROUND 226: bayes / ode / stats / symbolic（docs/09 声明；现由 kernel/mathtools.js 读取）.
  { key: 'vmu.math.bayes.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "贝叶斯后端（auto｜stan｜pymc；请求指定他者具名拒）" },
  { key: 'vmu.math.bayes.chains', type: 'positiveInteger', def: 4, hot: HOT.H1, who: 'office', doc: "链数下限（请求低于它具名拒）" },
  { key: 'vmu.math.bayes.iterations', type: 'natural', def: 2000, hot: HOT.H1, who: 'office', doc: "迭代数下限（请求低于它具名拒）" },
  { key: 'vmu.math.bayes.diagnostics', type: 'enum', domain: ['warn', 'refuse'], def: 'warn', hot: HOT.H1, who: 'office', doc: "R̂/ESS 不达标处置（refuse ⇒ 具名拒）" },
  { key: 'vmu.math.ode.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "ODE 后端（auto｜scipy｜julia｜sundials）" },
  { key: 'vmu.math.ode.method', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "求解方法（空＝不限；非空时请求指定他者具名拒）" },
  { key: 'vmu.math.ode.tolerance', type: 'number', def: 1e-8, hot: HOT.H1, who: 'office', doc: "误差容差（请求比它更松具名拒）" },
  { key: 'vmu.math.ode.reportConvergence', type: 'enum', domain: ['require', 'warn'], def: 'warn', hot: HOT.H1, who: 'office', doc: "收敛报告要求（require ⇒ 未收敛具名拒）" },
  { key: 'vmu.math.stats.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "统计后端（auto｜r｜python）" },
  { key: 'vmu.math.stats.multipleComparison', type: 'enum', domain: ['none', 'holm', 'bh'], def: 'none', hot: HOT.H1, who: 'office', doc: "多重比较校正（非 none 时，请求静默改用他法具名拒）" },
  { key: 'vmu.math.stats.effectSize', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "是否要求效应量（true ⇒ 结果无效应量具名拒）" },
  { key: 'vmu.math.symbolic.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "符号后端（auto｜引擎名）" },
  { key: 'vmu.math.symbolic.assumptions', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "显式假设清单（作为默认假设）" },
  { key: 'vmu.math.symbolic.assumptionsPolicy', type: 'enum', domain: ['require', 'allow-empty'], def: 'allow-empty', hot: HOT.H1, who: 'office', doc: "是否强制假设（require ⇒ 无假设且未声明默认时具名拒）" },
  // ROUND 227: ad / discrete / geom / nt / tensor（docs/09 声明；现由 kernel/mathtools.js 读取）.
  { key: 'vmu.math.ad.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "AD 后端（auto｜jax｜torch｜tensorflow；他者具名拒）" },
  { key: 'vmu.math.ad.gradCheck', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "梯度检查（true ⇒ 结果无梯度检查具名拒）" },
  { key: 'vmu.math.discrete.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "离散后端（auto｜networkx｜igraph｜ortools）" },
  { key: 'vmu.math.discrete.maxEnumeration', type: 'natural', def: 1000000, hot: HOT.H1, who: 'office', doc: "穷举上限（超过即具名拒，契约明写 ✓）" },
  { key: 'vmu.math.geom.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "几何后端（auto｜sympy｜shapely）" },
  { key: 'vmu.math.geom.exactCoordinates', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "精确坐标优先（true ⇒ 请求近似坐标具名拒）" },
  { key: 'vmu.math.nt.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "数论后端（auto｜sympy｜pari｜gmpy2）" },
  { key: 'vmu.math.nt.proofRequiredAbove', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "超过该规模必须给证书（0＝不要求；>0 且无 certificate 具名拒）" },
  { key: 'vmu.math.tensor.backend', type: 'string', def: 'auto', hot: HOT.H1, who: 'office', doc: "张量后端（auto｜numpy｜jax｜torch）" },
  // ROUND 228: the fingerprint family（docs/07 表已声明；现由 kernel/library.js 读取）.
  { key: 'vmu.fingerprint.algo', type: 'enum', domain: ['sha256', 'sha512', 'blake3'], def: 'sha256', hot: HOT.H1, who: 'office', doc: "指纹算法（随指纹记录；本运行时没有的摘要具名拒）" },
  { key: 'vmu.fingerprint.truncate', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "指纹截断长度（0＝全；截断必计数并自曝）" },
  { key: 'vmu.fingerprint.includeMeta', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "指纹是否含元数据（recorder／at；默认不含）" },
  // ROUND 229: paths（docs/07；现由 kernel/guard.js 读取）与 naming 的冲突策略（现由 kernel/records.js 读取）.
  { key: 'vmu.paths.followSymlinks', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "是否跟随符号链接（★ 与 vmu.safety.followSymlinks 同指一物：本键【声明时优先】，两者默认同为 false）" },
  { key: 'vmu.paths.allowedRoots', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "允许写入的根（只可【收窄】策略，绝不放宽；空＝由策略计算）" },
  // ROUND 230: the tags family（docs/07 表已声明；现由 kernel/library.js 读取）. 
  { key: 'vmu.tags.controlled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "受控词汇表（true ⇒ 未登记的词具名拒；默认 false＝零机制）" },
  { key: 'vmu.tags.maxDepth', type: 'positiveInteger', def: 3, hot: HOT.H1, who: 'office', doc: "标签层级深度（超深具名拒）" },
  { key: 'vmu.tags.aliasTable', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "别名表位置（声明后，未登记的别名仍拒并点名该表；本面不自行读文件）" },
  // ROUND 231: refs 与 dedupe（docs/07 表已声明；现由 kernel/library.js 读取）.
  { key: 'vmu.refs.requireTarget', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "引用目标必须存在（true ⇒ 悬空引用进入处置流程）" },
  { key: 'vmu.refs.danglingPolicy', type: 'enum', domain: ['reject', 'list'], def: 'list', hot: HOT.H1, who: 'office', doc: "悬空引用处置（reject ⇒ 具名拒；list ⇒ 回执里列出，绝不静默）" },
  { key: 'vmu.refs.backlinkDepth', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "反链深度（backlinks(id) 的广度优先层数）" },
  { key: 'vmu.dedupe.enabled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "★ 可选【更宽】去重层的开关；精确身份去重是核心不变式、【不可关】（默认 false ⇒ 只有身份去重）" },
  { key: 'vmu.dedupe.scope', type: 'enum', domain: ['full', 'segment'], def: 'full', hot: HOT.H1, who: 'office', doc: "去重范围（segment ⇒ 按 statement 段级匹配，并在回执自曝 deduplicatedBy）" },
  { key: 'vmu.dedupe.crossWorkspace', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "跨区去重（true ⇒ 必须显式给 opts.workspaceScope，本面不自行跨根扫描）" },
  // ROUND 232: metadata 与 provenance（→ kernel/library.js）、workspace（→ kernel/guard.js）.
  { key: 'vmu.metadata.strictness', type: 'enum', domain: ['strict', 'warn', 'loose'], def: 'warn', hot: HOT.H1, who: 'office', doc: "校验严格度（strict ⇒ 未知字段具名拒；warn ⇒ 回执列出；loose ⇒ 接受）" },
  { key: 'vmu.metadata.customPrefix', type: 'string', def: 'x-', hot: HOT.H1, who: 'office', doc: "自定义字段前缀（带此前缀的字段不受严格度约束）" },
  { key: 'vmu.provenance.depth', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "溯源深度（0＝全部；超出者【计数丢弃】而非静默）" },
  { key: 'vmu.provenance.recordInputFingerprint', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "是否记输入指纹（false ⇒ 回执里该字段为 null，绝不留旧值）" },
  { key: 'vmu.workspace.default', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "默认工作区（裸名字归属的工作区；只读并上报，不猜）" },
  { key: 'vmu.workspace.sharedPaths', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "共享区挂载点（★ 声明后【接管】硬编码的同级 Shared；空＝保持原行为）" },
  { key: 'vmu.workspace.crossWrite', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "跨区写（false ⇒ 只能写工作区根与共享挂载点；true ⇒ 另允许调用方显式点名的他区根）" },
  // ROUND 233: the index family（docs/07 表已声明；现由 kernel/library.js 的 rebuildIndex 读取）.
  { key: 'vmu.index.rebuildBatch', type: 'positiveInteger', def: 500, hot: HOT.H1, who: 'office', doc: "重建批大小（一次重建读多少文件；其余【计数延后】，绝不静默丢弃）" },
  { key: 'vmu.index.verifyChecksum', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "索引是否校验（true ⇒ 读不到或缺 id 的文件【进健康报告】而非从索引里消失）" },
  { key: 'vmu.index.staleTolerance', type: 'enum', domain: ['tolerate', 'rebuild'], def: 'rebuild', hot: HOT.H1, who: 'office', doc: "过期索引处置（rebuild ⇒ 从盘重建；tolerate ⇒ 保留并上报过期）" },
  // ROUND 234: visibility 与 export（docs/07 表已声明；现由 kernel/library.js 读取）.
  { key: 'vmu.visibility.default', type: 'enum', domain: ['internal', 'public'], def: 'internal', hot: HOT.H1, who: 'office', doc: "默认可见性（internal ⇒ 导出须显式 allowInternal；public 才默认可出）" },
  { key: 'vmu.export.format', type: 'enum', domain: ['json', 'md', 'package'], def: 'json', hot: HOT.H1, who: 'office', doc: "导出格式（他者具名拒；md 走 render、package 给 manifest＋正文）" },
  { key: 'vmu.export.includeHistory', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "是否含历史（true ⇒ 版本随行，并【计数上报】含了几条）" },
  // ROUND 236: the search family（docs/07 表已声明；现由 kernel/library.js 的 search() 读取）.
  { key: 'vmu.search.analyzer', type: 'enum', domain: ['simple', 'cjk', 'bigram'], def: 'bigram', hot: HOT.H1, who: 'office', doc: "分词器（simple＝按词／cjk＝逐字／bigram＝相邻二字；★ 它真的改变什么算命中）" },
  { key: 'vmu.search.maxResults', type: 'positiveInteger', def: 50, hot: HOT.H1, who: 'office', doc: "结果上限（咬合时【计数丢弃】，绝不静默截断）" },
  { key: 'vmu.search.snippetLen', type: 'positiveInteger', def: 200, hot: HOT.H1, who: 'office', doc: "片段长度（超出加省略号，并自曝 snippetTruncated）" },
  // ROUND 237: the naming conflict policy（docs/07 表已声明；现由 kernel/library.js 的 append 读取）.
  // ROUND 241: the language unit of the prompt pipeline（06 卷声明；现由 kernel/prompt/index.js 读取）.
  { key: 'vmu.prompts.locale.default', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "会话未指定语言时的默认语言（空 ⇒ 只走回退链）" },
  { key: 'vmu.prompts.locale.fallbackChain', type: 'stringList', def: ['zh-Hans', 'zh', 'en'], hot: HOT.H1, who: 'office', doc: "回退链（自左向右；声明后【替换】默认链）" },
  { key: 'vmu.prompts.locale.onMissing', type: 'enum', domain: ['warn', 'refuse'], def: 'warn', hot: HOT.H1, who: 'office', doc: "四级都不存在时的处置（warn ⇒ 留痕继续；refuse ⇒ 具名拒）★ 域由本轮裁定并登记" },
  // ROUND 242: the remaining prompt keys（06 卷声明；现由 kernel/prompt/index.js 读取）.
  { key: 'vmu.prompts.sections', type: 'objectList', def: [], hot: HOT.H1, who: 'office', doc: "声明的段（§11 最高分来源；同名可带不同 lang 并存）" },
  // ROUND 244: the glossary family（06 卷 §21.4；现由 kernel/prompt/index.js 读取）.
  { key: 'vmu.prompts.glossary.mode', type: 'enum', domain: ['enforce', 'warn', 'off'], def: 'enforce', hot: HOT.H1, who: 'office', doc: "术语一致性处置（enforce ⇒ 引用本体外术语【拒段】；warn ⇒ 留痕继续；off ⇒ 不加载不查）" },
  { key: 'vmu.prompts.glossary.ontology', type: 'string', def: 'vibe-math-vmu/glossary.json', hot: HOT.H1, who: 'office', doc: "本体路径（★ 不可读【不是'无术语'】⇒ enforce 拒、warn 留痕；无 reader 则是【能力缺口】⇒ 留痕但不拒，§21.4）" },
  // ROUND 245: 研究诚信（16 卷；现由 kernel/lifecycle.js 读取）.
  { key: 'vmu.lifecycle.preregLock', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "预注册锁定（true ⇒ 已预注册的研究再注册即【具名拒】）" },
  { key: 'vmu.lifecycle.searchSources', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "预注册须覆盖的检索源（缺失者【逐个点名】）" },
  { key: 'vmu.lifecycle.topicRequiredFields', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "题目的必填字段（缺失者逐个点名）" },
  { key: 'vmu.lifecycle.variableRoles', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "允许的变量角色（集合外的角色【点名】拒绝）" },
  { key: 'vmu.lifecycle.dedupeKeys', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "跨研究去重键（命中即拒并点名该键）" },
  { key: 'vmu.lifecycle.alpha', type: 'number', def: 0.05, hot: HOT.H1, who: 'office', doc: "显著性水平（judge() 据此判定；越界回落 0.05）" },
  { key: 'vmu.lifecycle.powerTarget', type: 'number', def: 0.8, hot: HOT.H1, who: 'office', doc: "把握度目标（judge() 据此判定；越界回落 0.8）" },
  { key: 'vmu.compliance.domainPacks', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "启用的领域包（非空时，未声明的域⇒VMU_DOMAIN_PACK_MISSING）" },
  { key: 'vmu.compliance.requireApprovalGate', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "是否要求审批闸（§9.4①）" },
  { key: 'vmu.compliance.evidenceKind', type: 'string', def: 'compliance-evidence', hot: HOT.H1, who: 'office', doc: "合规证据的 kind（模板位；打包归 22 ✓）" },
  // ROUND 249: 敏感数据分类与去标识化（20 卷 §7；现由 kernel/compliance.js 读取）.
  { key: 'vmu.privacy.classification', type: 'enum', domain: ['C0', 'C1', 'C2', 'C3', 'C4'], def: 'C1', hot: HOT.H1, who: 'office', doc: "数据等级（C0 公开／C1 内部／C2 PII／C3 PHI／C4 受限；★ 声明低于实际 ⇒ VMU_DATA_CLASS_MISMATCH）" },
  { key: 'vmu.privacy.piiDetect', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "是否检查载荷中的个人数据（按形状匹配；误报只会【抬高】等级，是安全方向）" },
  { key: 'vmu.privacy.deidentify', type: 'enum', domain: ['none', 'pseudonymize', 'k-anonymity', 'differential'], def: 'pseudonymize', hot: HOT.H1, who: 'office', doc: "去标识化方式（★ C2+ 写入前必须发生；none ⇒ 拒，VMU_PRIVACY_VIOLATION）" },
  { key: 'vmu.privacy.kAnonK', type: 'natural', def: 5, hot: HOT.H1, who: 'office', doc: "k-匿名的 k（<2 时 k-匿名被拒）" },
  { key: 'vmu.privacy.dpEpsilon', type: 'number', def: 1.0, hot: HOT.H1, who: 'office', doc: "差分隐私 ε（≤0 时差分隐私被拒）" },
  { key: 'vmu.privacy.minExposure', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "最小暴露（true ⇒ 载荷不得含【声明目的之外】的字段，逐字段点名）" },
  { key: 'vmu.prompts.overrides', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: "语言无关覆盖 {section:text}（合并【在调用方之下】⇒ 调用方仍可胜出，且合并被上报）" },
  { key: 'vmu.prompts.overridesByLang', type: 'object', def: {}, hot: HOT.H1, who: 'office', doc: "语言级覆盖 {section:{lang:text}}；解析出的语言命中时【优先于语言无关覆盖】" },
  { key: 'vmu.naming.conflictPolicy', type: 'enum', domain: ['refuse', 'suffix'], def: 'refuse', hot: HOT.H1, who: 'office', doc: "命名冲突策略（★ 只对【显式传入 record.id】生效：显式点名才是对名字的主张；由标题派生的名字不算冲突，因为同标题不同内容正是本面的内容身份语义 ✓）" },
  // ROUND 226: bayes / ode / stats / symbolic（docs/09 声明；现由 kernel/mathtools.js 读取）.

  // ---- ROUND 2 (task-14 · 内核管线): the keys the four new faces declare ------------------------
  // Declared HERE (hand-written) because the framework owns the vocabulary; each key names the module that
  // reads it, and a key whose module has not landed yet is visible as declared-but-unwired in docs/04 §11
  // (never silently "working"). Families: vmu.chat.* / vmu.mailbox.* / vmu.panel.* / vmu.resume.* / vmu.human.*
  // / vmu.control.* / vmu.math.adapters.* / vmu.math.jobs.*.
  // chat (v5r-reader-c · kernel/chat.js) — 管理员/发言配额/禁言/冻结豁免/审计环形上限
  { key: 'vmu.chat.admins', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '群聊管理员名单；未列者执行管理动作 ⇒ 具名拒 VMU_CHAT_NOT_ADMIN' },
  { key: 'vmu.chat.speakQuota', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '每人发言次数上限（0＝不限；超限具名拒 VMU_CHAT_QUOTA_EXCEEDED）' },
  { key: 'vmu.chat.speakQuotaWindowMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '配额窗口（0＝整场不重置）' },
  { key: 'vmu.chat.muteDefaultMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '默认禁言时长（0＝无到期，需显式解除）' },
  { key: 'vmu.chat.freezeExemptAdmins', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '表决冻结期管理员可否发言（v5r 的 chair-first；false ⇒ 冻结对管理员同样生效）' },
  { key: 'vmu.chat.historyCap', type: 'natural', def: 200, hot: HOT.H1, who: 'office', doc: '聊天审计环形上限（触界计数丢弃，绝不静默）' },
  // mailbox (v5r-reader-c · kernel/mailbox.js) — 私信耐久 + ack 语义
  { key: 'vmu.mailbox.digestWindowMs', type: 'natural', def: 45000, hot: HOT.H1, who: 'office', doc: '摘要合并窗口（同窗内多条合并投递）' },
  { key: 'vmu.mailbox.digestMax', type: 'natural', def: 12, hot: HOT.H1, who: 'office', doc: '单次摘要最多合并条数（超出计数丢弃并留在待投递队列）' },
  { key: 'vmu.mailbox.urgentKinds', type: 'stringList', def: ['dm', 'office', 'assign', 'nudge', 'notice', 'meeting', 'verify'], hot: HOT.H1, who: 'office', doc: '立即投递（不并入摘要）的消息种类' },
  { key: 'vmu.mailbox.ackedLedgerCap', type: 'natural', def: 500, hot: HOT.H1, who: 'office', doc: '已 ack 台账保留条数（ack 后正文即删，只留 {id,from,at,kind,bytes}）' },
  { key: 'vmu.mailbox.wakeBudget', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: '每轮唤醒预算（一次 flush 最多唤醒几个收件人）' },
  { key: 'vmu.mailbox.deliverTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '投递超时（0＝沿用调用方/宿主默认；超时不算投递成功 ⇒ 不 ack）' },
  // panel (v5r-reader-c · kernel/panel.js) — 成员状态面板（总目标/计划/正在执行的子任务）
  { key: 'vmu.panel.auditCap', type: 'natural', def: 200, hot: HOT.H1, who: 'office', doc: '面板查看留痕上限（谁在何时看了谁的面板）' },
  { key: 'vmu.panel.subtasksMax', type: 'natural', def: 32, hot: HOT.H1, who: 'office', doc: 'subtasks 字段条数上限（超出计数丢弃）' },
  { key: 'vmu.panel.deviationPolicy', type: 'enum', domain: ['record', 'refuse'], def: 'record', hot: HOT.H1, who: 'office', doc: '他人改 overall 时的处置：record＝留痕可回取；refuse＝具名拒 VMU_PANEL_DEVIATION' },
  { key: 'vmu.panel.historyCap', type: 'natural', def: 200, hot: HOT.H1, who: 'office', doc: '面板历史条数上限（超出计数丢弃）' },
  // resume + human + control (v5r-reader-a · kernel/resume.js · human.js · control.js)
  { key: 'vmu.resume.autoRecover', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: 'store.open() 后是否自动跑 recover()（无 store ⇒ 具名 no-op，不假装恢复）' },
  { key: 'vmu.resume.projections', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '装配期挂写穿投影的面键（members/tasks/meetings/ballots/budget/phase/work）；空＝不挂任何投影' },
  { key: 'vmu.resume.keepRecoveries', type: 'natural', def: 20, hot: HOT.H2, who: 'office', doc: '恢复记录保留条数（裁最旧）' },
  { key: 'vmu.resume.readBack', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '写后是否回读校验（不一致 ⇒ 具名 drift VMU_RESUME_READBACK_DRIFT）' },
  { key: 'vmu.resume.journalCap', type: 'natural', def: 5000, hot: HOT.H2, who: 'office', doc: '每面 journal 条数上限（超出计数并裁最旧；缺口 ⇒ 具名拒水合 VMU_RESUME_PROJECTION_GAP）' },
  { key: 'vmu.human.gatedActions', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '需要人工审批的动作名；空＝不闸任何动作（零机制）' },
  { key: 'vmu.human.approvalQueueCap', type: 'natural', def: 100, hot: HOT.H2, who: 'office', doc: '待批队列上限（超出即具名拒，不静默丢）' },
  { key: 'vmu.human.defaultAllowAcknowledged', type: 'boolean', def: false, hot: HOT.H0, who: 'office', doc: '仅当为 true 时 onTimeout=default-allow 才生效；否则超时具名拒（绝不静默放行）' },
  { key: 'vmu.human.dashboardDomains', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '仪表盘可见域；空＝仅聚合计数；private/dm 永不可见' },
  { key: 'vmu.human.vetoLiftRoles', type: 'stringList', def: ['office'], hot: HOT.H1, who: 'office', doc: '谁可解除否决（未列角色具名拒）' },
  { key: 'vmu.control.canSetRoles', type: 'stringList', def: ['office'], hot: HOT.H1, who: 'office', doc: '谁可中途改参数（未列角色具名拒 VMU_CONTROL_PARAM_ROLE）' },
  { key: 'vmu.control.tunableKeys', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '可改参数键白名单；空＝不许改（未声明键具名拒 VMU_CONTROL_PARAM_UNDECLARED）' },
  // math adapters + job mirrors (v5r-reader-b · kernel/mathadapters.js · mathjobs.js)
  { key: 'vmu.math.adapters.enabled', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '数学库专用适配面总开关（off ⇒ 具名拒 VMU_MATH_UNSUPPORTED_OP）' },
  { key: 'vmu.math.adapters.libs', type: 'stringList', def: ['numpy', 'scipy', 'pandas', 'sympy'], hot: HOT.H2, who: 'office', doc: '已声明可用的科学计算库（请求未声明者 ⇒ 具名拒 VMU_MATH_LIB_NOT_DECLARED；零机制不允许猜）' },
  { key: 'vmu.math.adapters.python', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '显式解释器命令（非空则只用它、绝不猜；空＝走 vmu.math.engines/python 候选与 PATH）' },
  { key: 'vmu.math.adapters.packageAllowlist', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '包白名单（空＝不限制；非空时请求的 packages 必须为其子集，否则具名拒）' },
  { key: 'vmu.math.adapters.probeCache', type: 'enum', domain: ['session', 'call'], def: 'session', hot: HOT.H2, who: 'office', doc: '环境绑定探测缓存口径（session＝每会话一次；call＝每次调用重探）' },
  { key: 'vmu.math.adapters.maxArrayElements', type: 'natural', def: 10000, hot: HOT.H1, who: 'office', doc: '数组/DataFrame 元素上限（超限计数式截断，dropped 必报）' },
  { key: 'vmu.math.adapters.maxStringBytes', type: 'natural', def: 65536, hot: HOT.H1, who: 'office', doc: '符号/字符串结果字节上限（超限计数式截断）' },
  { key: 'vmu.math.jobs.recover', type: 'enum', domain: ['on-load', 'manual', 'off'], def: 'on-load', hot: HOT.H1, who: 'office', doc: '作业镜像启动恢复口径（on-load＝构造时扫镜像；manual＝只由 jobsRecover 触发；off＝不恢复）' },
  { key: 'vmu.math.jobs.keepMirrors', type: 'natural', def: 200, hot: HOT.H1, who: 'office', doc: '作业镜像保留条数（溢出计数式驱逐 droppedMirrors）' },
  // report (vmu-assistant · kernel/report.js) — 自动汇报 + 参数配置面（人设装配走 pack 数据面，不在此）
  { key: 'vmu.report.enabled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '自动汇报总开关；默认 false＝零机制（另有 vmu.report.reports 默认空表，两道闸）；false ⇒ 已声明的汇报全部停发，但仍在 status().reporting 里具名报出 disabled' },
  { key: 'vmu.report.reports', type: 'objectList', def: [], hot: HOT.H2, who: 'office', doc: '汇报声明清单；每项 {name, trigger:{kind:event|period|threshold, …}, template, to:[], channel, enabled?}；空＝零机制（不声明就什么都不发生）' },
  { key: 'vmu.report.channels', type: 'stringList', def: ['inbox', 'digest', 'log'], hot: HOT.H1, who: 'office', doc: '允许的汇报通道；不在集合内具名拒 VMU_REPORT_CHANNEL_UNKNOWN' },
  { key: 'vmu.report.recipients', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '允许的收件人白名单；空＝不限制（空收件人＋非 log 通道即具名拒）' },
  // ★ A1 step 1 · Part A (phase 2): the reporting FEEDBACK LOOP. ★ The framework adds the switch; it does NOT flip any
  // pack's default. Part A reads these keys and reports them in the receipt; the delivery call itself was WIRED in Part B
  // (`systemPrompt.context()`), so the receipt NAMES the layer that armed the switch - or claims NO layer when its position cannot know one - instead of guessing.
  { key: 'vmu.report.feedback', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '汇报反馈回路开关（A1 第一步）：默认 false＝零机制；开＝把汇报的受众与回执经宿主动态 context 回给模型（投递调用已由入口在 Part B 接线（已落地）—— 未接线期间回执以真话具名）' },
  { key: 'vmu.report.audience', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '汇报的受众（谁应当收到）：默认空串；开关开而受众为空时具名失败，不静默' },
  { key: 'vmu.report.minIntervalMs', type: 'natural', def: 60000, hot: HOT.H1, who: 'office', doc: '周期汇报的最小周期；低于即钳到此值并在回执里报出（钳制不静默）' },
  { key: 'vmu.report.traceCap', type: 'positiveInteger', def: 64, hot: HOT.H1, who: 'office', doc: '汇报留痕环上限；溢出必计数' },
  { key: 'vmu.report.templateMaxChars', type: 'positiveInteger', def: 4000, hot: HOT.H1, who: 'office', doc: '模板渲染结果上限；超限截断＋计数并把省略字数写回正文' },
  { key: 'vmu.report.params', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '主代理可查看/修改的参数域（设置键清单）；空＝参数面为空（改任何键都具名拒，不猜）' },
  { key: 'vmu.report.whoMayChange', type: 'stringList', def: ['office'], hot: HOT.H1, who: 'office', doc: '谁可改上列参数（对齐 v5r「参数只能 office 改」，但由声明给出）' },
  { key: 'vmu.report.requireReason', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '改参是否必须给理由；true ⇒ 无理由具名拒 VMU_REPORT_PARAM_REASON_REQUIRED' },
  { key: 'vmu.report.auditChanges', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '参数改动是否写入审计（默认写；无 audit 接缝时具名上报 VMU_REPORT_AUDIT_UNAVAILABLE）' },
  // ids (v5r-reader-a · kernel/ids.js) — the ONE id minter (Round 2 id-reuse fix)
  { key: 'vmu.ids.persistEvery', type: 'natural', def: 1, hot: HOT.H2, who: 'office', doc: 'id 计数器写穿频率（1＝每次 mint；写穿丢几次也由 observeIds 的"已观测最大后缀"兜底 ⇒ 复用不可能）' },
  // ROUND 2 (Lead 点名收敛项 ②): ONE declaration for a key THREE modules really read. `lean.js:128`／
  // `mathjobs.js:192`／`mathtools.js:194` all read `vmu.math.jobs.dir` as a ROOT-RELATIVE STRING (empty ⇒ `Math/Jobs`),
  // so the wired-schema generator emitted THREE rows for it (one per reader), two of which collided
  // (`string ''` vs `object null`) and one of which had no recoverable default. Declaring it HERE makes the generator
  // treat it as pre-existing (`collect()` skips `already.has(key)`) ⇒ it emits no row for it and both invariants
  // ("declares a key twice" / "no default AND the file does not say so") hold — and the fix SURVIVES `regen-all`,
  // unlike hand-editing the generated block.
  { key: 'vmu.math.jobs.dir', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: '作业镜像目录（root 相对；空 ⇒ `Math/Jobs`）。三个真读者：`kernel/lean.js:128`、`kernel/mathjobs.js:192`、`kernel/mathtools.js:194` —— 三者都按**字符串路径**处理（非字符串即归一；越界 ⇒ `VMU_LEAN_JOBS_DIR_UNSAFE`／`VMU_MATH_JOBS_DIR_UNSAFE`）。' },
  // ROUND 3 / task-20 D (reader-a's task-18): state projections write through after each wrapped mutation by default.
  { key: 'vmu.resume.writeThrough', type: 'boolean', def: true, hot: HOT.H2, who: 'office', doc: '状态型投影是否在每次被包方法返回后**写穿**一次（fire-and-forget，失败进 `resume/projection-error`）；关掉则只在显式 `snapshot()` 时写。读者：`kernel/resume.js` 的 `attachProjection`（reader-a）。' },
  // ROUND 3 / task-24 (vmu-activity's frozen contract): the one-shot future-only activity waiter's seven keys.
  // `wakeOn` is H2 ON PURPOSE: its bus entry is registered at CONSTRUCTION, so it takes effect next session.
  { key: 'vmu.activity.timeoutMs', type: 'natural', def: 30000, hot: HOT.H1, who: 'office', doc: '活动等待的默认超时（毫秒）。读者：`kernel/activity.js` 的 `wait()`。' },
  { key: 'vmu.activity.timeoutMinMs', type: 'natural', def: 10000, hot: HOT.H1, who: 'office', doc: '超时下界（请求低于此值时按 `vmu.activity.timeoutPolicy` 处置）。' },
  { key: 'vmu.activity.timeoutMaxMs', type: 'natural', def: 3600000, hot: HOT.H1, who: 'office', doc: '超时上界（同上）。' },
  { key: 'vmu.activity.timeoutPolicy', type: 'enum', domain: ['refuse', 'clamp'], def: 'refuse', hot: HOT.H1, who: 'office', doc: '越界超时的处置：`refuse`＝具名拒（默认）；`clamp`＝钳到区间并自曝钳制。' },
  { key: 'vmu.activity.wakeOn', type: 'stringList', def: [], hot: HOT.H2, who: 'office', doc: '构造期注册的唤醒总线条目（**H2**：条目在构造时注册 ⇒ 下次会话生效，回执不得声称即时）。默认空＝不额外挂任何条目。' },
  { key: 'vmu.activity.maxWaiters', type: 'natural', def: 128, hot: HOT.H1, who: 'office', doc: '同时等待者上限（超出具名拒）。' },
  { key: 'vmu.activity.noPeerShortCircuit', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '无活跃同伴时是否立即返回 noProgress（true＝短路，对齐 v5r）。' },
  // ROUND 3 / task-20 C (C-30, vmu-pack 的 task-21 对齐): THE OFFICE CONSULT GATE'S DECLARATION SURFACE. vmu-pack
  // declares policy in the pack, the JUDGING POINT is the paper/human face; the four keys below are the final set
  // (vmu-pack's proposal, adjudicated here). `off` is the zero-mechanism switch; a timeout NEVER defaults to allow
  // (same stance as the human face: `hold`), and `office` itself is exempt because it IS the consulting party.
  { key: 'vmu.paper.latexEngineOrder', type: 'stringList', def: ['pdflatex', 'xelatex'], hot: HOT.H1, who: 'office', doc: 'PHASE 7：LaTeX 引擎探测顺序（数组）。★ 这是【pack/部署的政策数据】，内核只按传入顺序试，不硬编码“中文优先”；中文优先的顺序应写在 pack 的 settings/defaults.json 里' },
  { key: 'vmu.paper.latexTimeoutMs', type: 'natural', def: 120000, hot: HOT.H1, who: 'office', doc: 'PHASE 7：一次 LaTeX 编译的预算（毫秒）；超时以具名码返回，不静默失败' },
  { key: 'vmu.paper.officeConsult', type: 'enum', domain: ['off', 'required'], def: 'required', hot: HOT.H1, who: 'office', doc: 'office 定稿咨询门总开关（`off`＝零机制，不闸任何定稿）；`required` 时未咨询即定稿 ⇒ 具名拒 `VMU_OFFICE_CONSULT_REQUIRED`。读者：定稿路径（`kernel/paper.js`／human 面）。' },
  { key: 'vmu.paper.officeConsultOn', type: 'enum', domain: ['finalize', 'finalize-or-submit'], def: 'finalize', hot: HOT.H1, who: 'office', doc: '何时必须征询：`finalize`＝只卡定稿（对齐 v5r 的 `finalizePaperByOffice`／`notePaperConsult`）；`finalize-or-submit`＝投稿前也要问。' },
  { key: 'vmu.paper.officeConsultTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '等待咨询答复的时限（0＝无限等／挂起）。超时处置见 `vmu.paper.officeConsultOnTimeout`，**绝不默认放行**。' },
  { key: 'vmu.paper.officeConsultOnTimeout', type: 'enum', domain: ['hold', 'refuse'], def: 'hold', hot: HOT.H1, who: 'office', doc: '咨询超时处置：`hold`＝挂起等待（默认，与 human 面同口径）；`refuse`＝具名拒。**没有 default-allow 这一档**。' },
  { key: 'vmu.paper.officeConsultExemptRoles', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: '豁免角色：**默认为空＝不豁免任何人**（Lead F4 裁决：v5r 的 C-30 原场景正是"office 自己定稿前也必须先咨询所内"，把 office 默认豁免掉等于没实现那条；"默认不豁免"是保守侧，与 `hold` 同一纪律）。部署要豁免就显式声明角色。' },
  // ROUND 8 (vmu-pack's fidelity audit; Lead-confirmed DEFECT): `vmu.paper.finalizer` used to be `type:'string'`, so an
  // out-of-domain value passed the settings boundary and `kernel/paper.js` SILENTLY fell back to `'editor'` (measured:
  // `vmu.paper.finalizer='academician'` — v5r's `paperEditor`, an INSTITUTION ROLE — made `finalize` answer
  // `VMU_NOT_PERMITTED "only the editor (acad) may finalise"` with no invalid-value error anywhere). The domain is now a
  // CLOSED SET here AND the module refuses by name, so both injection paths (a pack's data layer, `vibe_vmu_set`) are
  // covered. Declaring it by hand makes the generator treat it as pre-existing and drop its recovered `type:'string'` row.
  { key: 'vmu.paper.finalizer', type: 'enum', domain: ['editor', 'contributor', 'any'], def: 'editor', hot: HOT.H1, who: 'office', doc: "定稿权限**规则**（不是角色名！v5r 的 `paperEditor:'academician'` 是**机构角色**；本键是**规则**，v5r 等价＝`editor` ＋创建时把 paper 的 `editor` 指定为主持人）。★ 轮 8：域外值 ⇒ **具名拒** `VMU_INVALID_ARGUMENT`（列出声明的域），**绝不静默回落** ✗✓；读者＝`kernel/paper.js` 的 `cfg()`。" },
  // The SAME convergence for the other two keys the generator was emitting twice (measured: the block carried
  // `vmu.math.jobs.logMax` and `vmu.math.jobs.persist` twice as well, because `mathjobs.js` AND `mathtools.js` both
  // read them). One declaration each, with the readers named.
  { key: 'vmu.math.jobs.logMax', type: 'natural', def: 200, hot: HOT.H1, who: 'office', doc: '作业日志保留条数（溢出必计数）。读者：`kernel/mathjobs.js`、`kernel/mathtools.js:118/194`（两者默认一致：200）。' },
  { key: 'vmu.math.jobs.persist', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: '作业持久化：false＝只留回执详情；true＝额外写 `Math/Jobs` 镜像并允许恢复（`vmu.math.jobs.recover` 决定何时恢复）。读者：`kernel/mathjobs.js`、`kernel/mathtools.js:118/194`。' },
  // ROUND 3 / task-20 A: the SECOND half of the maxParallel pair, under the hand-written table so the boundary is
  // stated ONCE (the generator treats it as pre-existing and emits no duplicate row).
  // ROUND 4 / task-25 D — **REMOVED BY LEAD RULING**: the old `math.jobs.*` second name for math-run
  // concurrency. It is gone from the schema (not kept as an alias: two different policies must not be forced equal,
  // and a silently-diverging duplicate name is worse than none). `kernel/mathtools.js` still reads it - its own
  // `WIRED_KEYS` declares it - so that read point is reader-b's to retire; until then the key is simply UNDECLARED,
  // which `docs/04` reports as a wired-but-undeclared read (visible, not silent).
  // ROUND 3 / task-20 D (v5r-reader-c 的 task-17 接线单): two keys whose readers already exist.
  { key: 'vmu.meetings.tier', type: 'enum', domain: ['formal', 'light'], def: 'formal', hot: HOT.H1, who: 'office', doc: '会议级别：light＝简流程，**不得产出实体定论**（派生谓词，不是阶段）。读者：`kernel/meetings.js` 的 `K.tier`＋`tier()`／`truthWriteRefusal()`，唯一判定点在 `close()` 的收束路径（reader-c 的 GAP-MTG-02）。' },
  // ROUND 3 / task-20 D（reader-c 的接线单增补）：只有一个 `tier` 键表达不了"本机构不允许简流程"，所以"是否允许"
  // 是第二个键；两者共用**同一个派生判定点**（`open()` 与 `truthWriteRefusal()`），并都在 `WIRED_KEYS`／
  // `keysSnapshot()` 里真读 —— 不会出现"声明了没人读"。
  { key: 'vmu.meetings.allowLight', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '是否允许 light（简流程）会议：false ⇒ 内核在开会/收束处以具名拒挡住 light（与 `tier` 共用同一派生判定点）。读者：`kernel/meetings.js` 的 `K.allowLight`。' },
  { key: 'vmu.ballot.reopenFloor', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: '投票板重开门槛（0＝不设门槛；>0 时 reopen 需要达到该支持数）。读者：`kernel/ballotbox.js` 的 `reopen()`（reader-c 的 GAP-MTG-10；该面自有实现，不并存第二份）。' },
  // ROUND 8 / task-58 尾账：`docs/08` §25.14 B② 的 Lead 裁决（请假/休会批准人＝chair、office 兜底，**且必须可声明**）
  // 点名了该键，而 `audit-vmu-docs` G 段要求"文档里出现的 `vmu.*` 名必须真在 `schema.js` 里"（`planned.js` 不能顶替）。
  // 键**在此落地**；读者属 08 面的 B②，**本轮未落** ⇒ `docs/04` 会如实把它列为 declared-but-not-wired，
  // 读取方落地前必须按名具名降级（不臆造，不改裁决）。
  { key: 'vmu.meetings.leaveApprover', type: 'enum', domain: ['chair', 'office'], def: 'chair', hot: HOT.H1, who: 'office', doc: '请假/休会的批准人：chair＝主席批准，office＝办公室兜底。★ 本轮**只声明键**（B② 的 requestLeave/approveLeave 未落）；键被读时必须按此值域判定，未落前读取具名降级。' },

  // ── ROUND 10 / task-74 (A): the eight v5r parameters, each WITH ITS READER (a key without one is an orphan) ──
  // Every default below is v5r's own value with a line reference; nothing is invented, and every key names the
  // module+method that reads it (the reader was landed in the SAME round - see _handoff/vmu/core-round10-report.md).
  { key: 'vmu.prompt.compactThreshold', type: 'natural', def: 66, hot: HOT.H1, who: 'office', doc: '上下文占比达到该值 ⇒ 组装时注入 [CONTEXT COMPACT] 指示。**百分数 0–100，不是 0–1**。v5r `compactThreshold:66`（`:1078`；`:449` 明写 never clamp to 0-1；`:9869` 拒 ≤0）。读者：`kernel/prompt/index.js` 的 `assemble()`（读 `ctx.contextPct`）。' },
  { key: 'vmu.prompt.compactAfterRounds', type: 'natural', def: 8, hot: HOT.H1, who: 'office', doc: '距上次压缩的轮数达到该值 ⇒ 同上注入（与阈值是**或**关系）。v5r `compactAfterRounds:8`（`:1079`；`soft` 判定 `:3902-3903`）。读者：`kernel/prompt/index.js` 的 `assemble()`（读 `ctx.round`）。' },
  { key: 'vmu.paper.finalPaper', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '运行结束时**自动**写最终论文。v5r `finalPaper:true`（`:1163`；消费点 `:7867` `if (params.finalPaper !== false)`）。读者：`kernel/paper.js` 的 `finalize({auto:true})`（false ⇒ 具名拒，不静默改成手动）。' },
  { key: 'vmu.paper.format', type: 'enum', domain: ['both', 'md', 'tex'], def: 'both', hot: HOT.H1, who: 'office', doc: '成品形态（both|md|tex）。v5r `paperFormat:\'both\'`（`:1164`；消费点 `:8252`）。读者：`kernel/paper.js` 的 `cfg()`＋`finalize()`（进 `artifact` 与 `register` 请求）。' },
  { key: 'vmu.paper.language', type: 'enum', domain: ['zh', 'en'], def: 'zh', hot: HOT.H1, who: 'office', doc: '成品语言（zh|en）。v5r `paperLanguage:\'zh\'`（`:1165`；消费点 `:8251`）。读者：与 `vmu.paper.format` 同一处。' },
  { key: 'vmu.paper.compilePdf', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '检测到 LaTeX 引擎时编译 PDF。v5r `paperCompilePdf:true`（`:1166`；消费点 `:8258`；`:8820` 明写 format=md 时**不得**因缺 tex 报警 ⇒ `pdf = compilePdf && format !== \'md\'`）。读者：与 `vmu.paper.format` 同一处。' },
  { key: 'vmu.members.maxTempPerMember', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: '同一雇佣者名下**同时在册**的临时成员上限。v5r `maxTempPerMember:3`（`:1075`；消费点 `:8920-8924`：`perCap = max(1, floor(value||3))`、按 `hiredBy` 计数、超限 `V5_MEMBER_LIMIT` 并回报 current/limit）。vmu 映射（vmu 无 kind:temp）：**仍在试用期**（`confirmedAt === null`）的成员按接纳人 `by` 分组。读者：`kernel/recruit.js` 的 `accept()`。' },
  { key: 'vmu.tasks.memberMayRejectAssign', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: '成员可否对被分派**表示异议**（记录＋广播，**任务仍执行**）。v5r `memberMayRejectAssign:true`（`:1066`；消费点 `:9555-9562`：``reject_assign && params.memberMayRejectAssign`` ⇒ 广播给 voters，原文"任务仍会执行"）。读者：`kernel/tasks.js` 的 `objectAssign()`；★ false 时 vmu **具名拒**（v5r 是静默忽略该字段 —— 刻意更严，不许静默）。' },

  // ROUND 17 / task-118: `vmu.meetings.orderMode` is HAND-DECLARED here, OUTSIDE the generated block below, because its
  // TYPE and DOMAIN cannot be recovered by `scripts/generate-wired-schema.mjs`: that generator recovers a default
  // LITERAL from the module's read (`fifo`) and therefore emits `type:'string'`. It lived inside the block until now,
  // which is why changing it there never survived a regeneration - measured: `--write` restored the `string` row
  // character-for-character (and this is very likely what overwrote a targeted edit in round 15). The generator skips a
  // key that is already declared here, so this row is now the single source; the generator asserts that a
  // hand-declared-domain key never reappears in its block (`HAND_DECLARED_DOMAINS`), so the row cannot silently revert.
  { key: 'vmu.meetings.orderMode', type: 'enum', domain: ['fifo', 'round-robin', 'chair', 'random'], def: 'fifo', hot: HOT.H1, who: 'office', doc: "发言序模式（fifo|round-robin|chair|random）；域外值 ⇒ 读取侧具名拒（kernel/meetingmarker.js 的 strictOrderMode），不静默回落到默认值" },

  // ROUND 31 / task-149 C①②: THE NINE `vmu.meetings.*` KEYS WHOSE READER ALREADY HAD A STRICT DOMAIN, hand-declared
  // here (OUTSIDE the block below) for the same measured reason as `orderMode` ten lines up: the generator recovers a
  // default LITERAL from the module's read and emits `type:'string'` — "any string is legal" — while
  // `kernel/meetings.js`'s `oneOf(...)` REFUSED everything outside its own set. Declaration and enforcement were
  // OPPOSITE, which is worse than "declared but unenforced". ★ Each row's `domain` is copied VERBATIM from its read
  // site (the line numbers are named in `doc`), because the batch's core invariant is element-wise equality between
  // this declaration and the read-side set — that is exactly what made R17's `orderMode` precedent valid.
  // They are listed in `HAND_DECLARED_DOMAINS` (scripts/generate-wired-schema.mjs) so the generator skips them and
  // reddens if one ever reappears in its block.
  { key: 'vmu.meetings.attendanceMode', type: 'enum', domain: ['roster', 'signin', 'quorum-only'], def: 'roster', hot: HOT.H1, who: 'office', doc: '出席模式（roster|signin|quorum-only）；域与读取侧 meetings.js:138 的 oneOf 逐字相同' },
  { key: 'vmu.meetings.quorumLossPolicy', type: 'enum', domain: ['suspend', 'continue', 'recess'], def: 'suspend', hot: HOT.H1, who: 'office', doc: '失去法定人数后的处置（suspend|continue|recess）；域与 meetings.js:147 逐字相同' },
  { key: 'vmu.meetings.budgetOnExceed', type: 'enum', domain: ['refuse', 'warn', 'extend'], def: 'refuse', hot: HOT.H1, who: 'office', doc: '超预算动作（refuse|warn|extend）；域与 meetings.js:154 逐字相同' },
  { key: 'vmu.meetings.leaveEarlyPolicy', type: 'enum', domain: ['allow', 'note', 'deny'], def: 'allow', hot: HOT.H1, who: 'office', doc: '提前离席政策（allow|note|deny）；域与 meetings.js:171 逐字相同' },
  { key: 'vmu.meetings.minutesDetail', type: 'enum', domain: ['brief', 'full'], def: 'brief', hot: HOT.H1, who: 'office', doc: '纪要详略（brief|full）；域与 meetings.js:173 逐字相同' },
  { key: 'vmu.meetings.appealScope', type: 'enum', domain: ['all', 'procedural', 'none'], def: 'all', hot: HOT.H1, who: 'office', doc: '申诉范围（all|procedural|none）；域与 meetings.js:178 逐字相同' },
  { key: 'vmu.meetings.confidentialityDefault', type: 'enum', domain: ['public', 'internal', 'restricted'], def: 'internal', hot: HOT.H1, who: 'office', doc: '默认保密级（public|internal|restricted）；域与 meetings.js:185 逐字相同' },
  { key: 'vmu.meetings.confidentialityQuotePolicy', type: 'enum', domain: ['allow', 'redact', 'deny'], def: 'allow', hot: HOT.H1, who: 'office', doc: '引用机密内容的政策（allow|redact|deny）；域与 meetings.js:186 逐字相同' },
  { key: 'vmu.meetings.wakeFailurePolicy', type: 'enum', domain: ['refuse', 'skip', 'retry'], def: 'refuse', hot: HOT.H1, who: 'office', doc: '唤醒失败处置（refuse|skip|retry）；域与 meetings.js:188 逐字相同' },

  // WIRED-SCHEMA:BEGIN (generated by scripts/generate-wired-schema.mjs - do not hand-edit)
  { key: 'vmu.allocation.dirtyWorkQuota', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（bidding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.allocation.fairnessPolicy', type: 'string', def: 'equal', hot: HOT.H1, who: 'office', doc: "已接线（bidding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.allocation.rotationWindow', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（bidding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.archive.offlineFirst', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.archive.package.includeEnvironment', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.archive.package.style', type: 'string', def: 'native', hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.archive.receiptRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.archive.targets', type: 'stringList', def: ['zenodo', 'osf', 'swh', 'other'], hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.avail.allowOnRequest', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.avail.openLicenses', type: 'stringList', def: ['CC0-1.0', 'CC-BY-4.0', 'MIT', 'Apache-2.0'], hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.avail.requireUrl', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ballot.irvInstantSingleCount', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（ballotbox.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.allocationPolicy', type: 'string', def: 'strict', hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.cleanupCadenceDays', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.facilities', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.forecastHorizonDays', type: 'natural', def: 30, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.forecastStaleDays', type: 'natural', def: 7, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.machineHoursPool', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.overcommitRatio', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.preemptPolicy', type: 'string', def: 'never', hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.safetyBriefingRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.seatsPerDomain', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.storageWarnRatio', type: 'ratio', def: 0.9, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.capacity.waitlistMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（capacity.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.auditPrepLeadDays', type: 'natural', def: 14, hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.calendarDir', type: 'string', def: 'Shared/Compliance', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.calendarTemplate', type: 'string', def: 'audit-checklist', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.coiScope', type: 'string', def: 'members', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.conflictOfInterestDisclosure', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.evidenceMembers', type: 'string', def: 'all', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.evidencePackFields', type: 'string', def: 'kind+members+at', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.exportControlCheck', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.irbRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.overdueEscalation', type: 'string', def: 'block', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.prepare', type: 'string', def: 'checklist', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.redactionPolicy', type: 'string', def: 'required', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.require', type: 'string', def: 'irb+consent', hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.compliance.reviewAlertLeadDays', type: 'natural', def: 7, hot: HOT.H1, who: 'office', doc: "已接线（compliance.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.anonymityMode', type: 'string', def: 'single', hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.assign', type: 'string', def: 'manual', hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.cfpCloseMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.cfpOpenMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.maxParallelTracks', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.metaReviewRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.proceedingsTrack', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.register', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.registrationCap', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.registrationFeeMinor', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.reviewAssignmentsPerPaper', type: 'natural', def: 2, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.reviewDeadlineDays', type: 'natural', def: 21, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.reviewerConflicts', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.schedule', type: 'string', def: 'sequential', hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.scheduleTz', type: 'string', def: 'UTC', hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.slotMinutes', type: 'natural', def: 30, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.topicsRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.conference.waiverPolicy', type: 'string', def: 'require-reason', hot: HOT.H1, who: 'office', doc: "已接线（conference.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.allowNetwork', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.arxiv.maxAbstractChars', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.arxiv.preferVersioned', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.cacheDir', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.crossref.includeRelations', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.crossref.mailto', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.datacite.maxRelated', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.datacite.requireRights', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.enabled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.endpoints', type: 'object', def: null, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码；★ 类型推断不出（具名回落 object：null-literal — 源码字面量是 `null`（未设哨兵）⇒ 无类型证据；`object` 是**具名回落**，不是断言）" },
  { key: 'vmu.external.maxBytes', type: 'natural', def: 1048576, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.maxCacheEntries', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.mergePolicy', type: 'object', def: null, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；该模块未声明默认值；★ 轮 213 实测两步回退：未设或不在 `MERGE_POLICIES` ⇒ 取 `vmu.external.conflictPolicy`；仍不在 `CONFLICT_POLICIES` ⇒ `refuse-on-conflict`（external.js:131-133）；★ 类型推断不出（具名回落 object：no-literal — 模块未声明默认值 ⇒ 无字面量、无类型证据（有效值见 EFFECTIVE_DEFAULTS））" },
  { key: 'vmu.external.offlineFirst', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.openalex.mailto', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.openalex.maxConcepts', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.patent.maxResults', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.patent.requireQueryString', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.primarySources', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.pubmed.maxMeshTerms', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.pubmed.preferAuthoritative', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.requireReceipt', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.stalePolicy', type: 'string', def: 'refresh', hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.swh.maxTreeEntries', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.swh.requireSwhid', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.timeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.external.ttlMs', type: 'natural', def: 3600000, hot: HOT.H1, who: 'office', doc: "已接线（external.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.accountsDir', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.approvalThresholdMinor', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.auditPack', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.auditPackFields', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.auditPackFormat', type: 'string', def: 'json', hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.budgetLineGranularity', type: 'string', def: 'category', hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.costSharePolicy', type: 'string', def: 'balanced', hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.crossInstitutionSettlementDays', type: 'natural', def: 90, hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.currency', type: 'string', def: 'EUR', hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.expenseRequiredFields', type: 'stringList', def: ['receipt'], hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.pettyCashLimitMinor', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.reimbursementSlaDays', type: 'natural', def: 30, hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.request', type: 'string', def: 'manual', hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.requiredFields', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.settlementRoundMinor', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.funding.split', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（funding.js 读取）；默认值取自模块源码" },
  { key: 'vmu.grant.commands', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（grant.js 读取）；默认值取自模块源码" },
  { key: 'vmu.grant.defaultScope', type: 'string', def: 'once', hot: HOT.H1, who: 'office', doc: "已接线（grant.js 读取）；默认值取自模块源码" },
  { key: 'vmu.grant.enabled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（grant.js 读取）；默认值取自模块源码" },
  { key: 'vmu.grant.maxOpenGrants', type: 'natural', def: 32, hot: HOT.H1, who: 'office', doc: "已接线（grant.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.appealWindowDays', type: 'natural', def: 30, hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.authorshipRule', type: 'string', def: 'byContribution', hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.confidentialityWindowDays', type: 'natural', def: 180, hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.contributorThreshold', type: 'ratio', def: 0.1, hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.disclosureFields', type: 'stringList', def: ['title', 'inventors', 'evidenceRefs', 'publicDisclosures'], hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.disclosureRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.exemptRoles', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.holdEnforcement', type: 'string', def: 'block', hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.ownershipDefault', type: 'string', def: 'institution', hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.priorArtRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.priorArtSearchDepth', type: 'string', def: 'standard', hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.publicationHoldDays', type: 'natural', def: 90, hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.revenueSharePolicy', type: 'string', def: 'institution-first', hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.sweepCadenceDays', type: 'natural', def: 90, hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.ip.transferPolicy', type: 'string', def: 'manual', hot: HOT.H1, who: 'office', doc: "已接线（ip.js 读取）；默认值取自模块源码" },
  { key: 'vmu.license.attributionRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.license.codeDefault', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.license.default', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.license.incompatiblePolicy', type: 'string', def: 'deny', hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.artifacts.maxAttemptsPerRun', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.artifacts.maxFileMb', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.artifacts.maxRuns', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.cache.crossProject', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.cache.enabled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.cache.maxEntries', type: 'natural', def: 100, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.cache.onCorrupt', type: 'string', def: 'recompute', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.convergence.policy', type: 'string', def: 'report', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.formal.axiomAudit', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.formal.coqTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.formal.requireAll', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.formal.sorryPolicy', type: 'string', def: 'deny', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.interval.enabled', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.linalg.backend', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.linalg.requireResidual', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.linalg.sparse', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.numeric.stability', type: 'string', def: 'report', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.numeric.warnings', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.optim.backend', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.optim.certificates', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.optim.timeLimitMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.optim.tolerance', type: 'number', def: 1e-6, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.precision.digits', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.precision.mode', type: 'string', def: 'significant', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.precision.rounding', type: 'string', def: 'half-even', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.precision.tolerance', type: 'number', def: 1e-9, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.report.includeRepro', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.report.language', type: 'string', def: 'zh-Hans', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.report.style', type: 'string', def: 'plain', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.repro.deterministic', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.repro.packOnSuccess', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.repro.requireSeed', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.repro.seed', type: 'object', def: null, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码；★ 类型推断不出（具名回落 object：null-literal — 源码字面量是 `null`（未设哨兵）⇒ 无类型证据；种子可以是数字/字符串，`object` 仅是可解释回落）" },
  { key: 'vmu.math.sandbox.cpuMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.sandbox.memoryMb', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.sandbox.network', type: 'string', def: 'deny', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.sandbox.threads', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.sandbox.wallMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.units.constantsSource', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.units.enabled', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.math.units.strictDimensions', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（mathtools.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.appealDeadlineMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.appealReasonRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.budgetTokens', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.budgetTurns', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.budgetWallMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.chairNeutral', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.chairTransferAudit', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.committeeMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.committeeReportRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.confirmPreviousMinutes', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.disciplineExpelAllowed', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.disciplineMuteMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.disciplineWarnMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.emergencyKinds', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.emergencyQuorumRatio', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.interruptAllow', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.interruptQuota', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.lateAfterMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.liveCap', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.materialsRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.minutesActionsRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.minutesIncludeRefused', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.minutesRetentionMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.quorumMin', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.quorumRatio', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.quorumRecountMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.recessMaxMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.recessResumeRequiresMotion', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.speechDefaultMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.speechExtendMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.speechExtendMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.speechMaxMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.speechQuotaPerMember', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.typeCatalog', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.unansweredInDenominator', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.verbatimEnabled', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.meetings.verbatimRetentionMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（meetings-defaults.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.auto', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.dryRunDefault', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.dryrun', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.keepBackups', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.onFailure', type: 'string', def: 'abort', hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.report', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.reportFormat', type: 'string', def: 'text', hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.requireConfirm', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.rollback', type: 'string', def: 'allow', hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.rollbackPointDensity', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.migration.stepBatch', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（migration.js 读取）；默认值取自模块源码" },
  { key: 'vmu.notify.crossInstitution', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（notify.js 读取）；默认值取自模块源码" },
  { key: 'vmu.paper.maxRounds', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（paper.js 读取）；默认值取自模块源码" },
  { key: 'vmu.paper.maxSections', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（paper.js 读取）；默认值取自模块源码" },
  { key: 'vmu.paper.requireAllSections', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（paper.js 读取）；默认值取自模块源码" },
  { key: 'vmu.partnership.crossBorderApproverRoles', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（partnership.js 读取）；默认值取自模块源码" },
  { key: 'vmu.partnership.crossBorderGate', type: 'object', def: null, hot: HOT.H1, who: 'office', doc: "已接线（partnership.js 读取）；该模块未声明默认值（缺省行为见模块自身）；★ 类型推断不出（具名回落 object：no-literal — 模块未声明默认值 ⇒ 无字面量、无类型证据）" },
  { key: 'vmu.partnership.invoiceTaxSlots', type: 'object', def: null, hot: HOT.H1, who: 'office', doc: "已接线（partnership.js 读取）；该模块未声明默认值（缺省行为见模块自身）；★ 类型推断不出（具名回落 object：no-literal — 模块未声明默认值 ⇒ 无字面量、无类型证据）" },
  { key: 'vmu.partnership.registryDir', type: 'object', def: null, hot: HOT.H1, who: 'office', doc: "已接线（partnership.js 读取）；该模块未声明默认值（缺省行为见模块自身）；★ 类型推断不出（具名回落 object：no-literal — 模块未声明默认值 ⇒ 无字面量、无类型证据）" },
  { key: 'vmu.partnership.requireEntity', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（partnership.js 读取）；默认值取自模块源码" },
  { key: 'vmu.partnership.taxIdStyle', type: 'string', def: 'opaque-ref', hot: HOT.H1, who: 'office', doc: "已接线（partnership.js 读取）；默认值取自模块源码" },
  { key: 'vmu.publish.jatsVersion', type: 'string', def: 'JATS-1.3', hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.publish.requireChecklist', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.publish.versionChainStrict', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.records.treatNegativeAsFirstClass', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.replication.federationShare', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.replication.summaryEnabled', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（publication.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.attachCapture', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.blockOnOverdue', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.calibrationDueDays', type: 'natural', def: 365, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.capabilityTags', type: 'object', def: null, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；该模块未声明默认值；★ 轮 213 实测有效默认 `[]`（resource.js:91 `Array.isArray(tags) ? tags.map(String) : []`）；★ 类型推断不出（具名回落 object：no-literal — 模块未声明默认值 ⇒ 无字面量、无类型证据（有效值见 EFFECTIVE_DEFAULTS））" },
  { key: 'vmu.resource.dataCaptureRef', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.downtimePolicy', type: 'string', def: 'refuse', hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.hashAlgo', type: 'string', def: 'sha256', hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.ledgerDir', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.maxHoldHours', type: 'natural', def: 8, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.overbookRatio', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.priorityPolicy', type: 'string', def: 'fifo', hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.requireCalibration', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.requireOwner', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.reservationHorizonDays', type: 'natural', def: 30, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.reserve', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.scheduleMaintenance', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.resource.waitlistPolicy', type: 'string', def: 'queue', hot: HOT.H1, who: 'office', doc: "已接线（resource.js 读取）；默认值取自模块源码" },
  { key: 'vmu.review.conflictPolicy', type: 'string', def: 'recuse', hot: HOT.H1, who: 'office', doc: "已接线（reviewers.js 读取）；默认值取自模块源码" },
  { key: 'vmu.review.mode', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（reviewers.js 读取）；默认值取自模块源码" },
  { key: 'vmu.review.quorum', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（reviewers.js 读取）；默认值取自模块源码" },
  { key: 'vmu.review.rebuttalRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（records.js 读取）；默认值取自模块源码" },
  { key: 'vmu.reviewers.acknowledgement', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（reviewers.js 读取）；默认值取自模块源码" },
  { key: 'vmu.reviewers.blindUnbindRequiresReason', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（reviewers.js 读取）；默认值取自模块源码" },
  { key: 'vmu.reviewers.coiPolicy', type: 'string', def: 'deny', hot: HOT.H1, who: 'office', doc: "已接线（reviewers.js 读取）；默认值取自模块源码" },
  { key: 'vmu.reviewers.maxLoad', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（reviewers.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.autoBackup', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.backend', type: 'string', def: 'file', hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.fsync', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.lock', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.lock.backoffMs', type: 'natural', def: 25, hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.lock.retries', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.lock.serializeAll', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.lock.timeoutMs', type: 'natural', def: 1000, hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.onVersionTooHigh', type: 'string', def: 'refuse', hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.remote', type: 'string', def: 'none', hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.remote.consistency', type: 'string', def: 'eventual', hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.remote.offlinePolicy', type: 'string', def: 'refuse', hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.remote.url', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.root', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.store.tmpDir', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（storepolicy.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.allowAuditors', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.allowLate', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.blindReview', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.cohortMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.enabled', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.enrollmentNeedsApproval', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.gradeChangeAdditive', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.latePenaltyRatio', type: 'object', def: null, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；该模块未声明默认值（缺省行为见模块自身）；★ 类型推断不出（具名回落 object：no-literal — 模块未声明默认值 ⇒ 无字面量、无类型证据（有效值见 EFFECTIVE_DEFAULTS））" },
  { key: 'vmu.teaching.maxAttempts', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.ontologyVersion', type: 'string', def: '1', hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.peerWeight', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.publishToLibrary', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.readingsRequired', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.requireEvidence', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.requireRubricRef', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.retentionMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.reviewRounds', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.reviewersPerSubmission', type: 'natural', def: 1, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.rubricRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.selfReviewAllowed', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.submitMode', type: 'string', def: 'artifact', hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.teaching.visibility', type: 'string', def: 'cohort', hot: HOT.H1, who: 'office', doc: "已接线（course.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.appealWindowDays', type: 'natural', def: 14, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.humanDecisionRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.offboardingChecklist', type: 'stringList', def: ['handover', 'keys', 'records'], hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.performanceCadenceDays', type: 'natural', def: 180, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.performanceEvidenceRequired', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.recruitCycleDays', type: 'natural', def: 30, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.recruitWindowOpenMs', type: 'natural', def: 604800000, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.rotationPolicy', type: 'string', def: 'round-robin', hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.tenureDecisionWindowDays', type: 'natural', def: 60, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.tenureQuorum', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.tenure.tenureTrackMonths', type: 'natural', def: 36, hot: HOT.H1, who: 'office', doc: "已接线（tenure.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.arbitrationMode', type: 'string', def: 'off', hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.checkpointEveryMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.claimRequired', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.compensationMode', type: 'string', def: 'manual', hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.depTypes', type: 'stringList', def: ['finish-to-start'], hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.dueWarnBeforeMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.escalationAfterMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.escalationTarget', type: 'string', def: 'office', hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.gateKinds', type: 'stringList', def: ['entry', 'exit'], hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.handoverNote', type: 'boolean', def: true, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.idempotencyKeyScope', type: 'string', def: 'session', hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.parentDoneRule', type: 'string', def: 'all-terminal', hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.priorityClasses', type: 'stringList', def: ['low', 'normal', 'high'], hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.retryBaseMs', type: 'natural', def: 1000, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.retryCapMs', type: 'natural', def: 60000, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.retryJitterRatio', type: 'ratio', def: 0.2, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.retryMax', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.softDepsEnforced', type: 'boolean', def: false, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.stageGateMode', type: 'string', def: 'refuse', hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.subtaskDepthMax', type: 'natural', def: 2, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.taskTimeoutMs', type: 'natural', def: 0, hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.templateDefault', type: 'string', def: '', hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  { key: 'vmu.workflow.templates', type: 'stringList', def: [], hot: HOT.H1, who: 'office', doc: "已接线（workflow.js 读取）；默认值取自模块源码" },
  // WIRED-SCHEMA:END
])

/**
 * THE PLANNED KEYS (settings/planned.js) — GENERATED from the design docs, never hand-edited.
 *
 * The phase-2 design set declares hundreds of parameters long before they are implemented (docs 07/08/09/13/15
 * alone name ~350). Composing them into the SAME table is what keeps ONE honest registry: each carries
 * `type: 'planned'` and `def: null`, so the settings table derives its "未接线（planned）" marker from the same
 * code path as any other unwired key, the docs audit can demand that every key a volume names EXISTS, and the
 * plan is machine-visible instead of prose. Implementing a key means moving it out of the generated file into
 * the hand-written table above with real metadata; `scripts/generate-planned-settings.mjs --check` keeps the two
 * apart (a key that has been implemented must NOT stay "planned").
 */
import { PLANNED_DEFS } from './planned.js'

export const SETTING_DEFS = Object.freeze([...CORE_DEFS, ...PLANNED_DEFS])

const BY_KEY = new Map(SETTING_DEFS.map((d) => [d.key, d]))

/**
 * THE RENAME CHANNEL (docs/03 §8: VMU_PARAM_RENAMED). A key record may carry `was: [formerNames]`; a deployment
 * that still presents a former name is RESOLVED to the canonical key rather than refused, so a rename is not a
 * breaking change. Two rules keep this honest: the canonical key is the only one a declaration creates, and an
 * ambiguous former name - one claiming to be the former name of two different keys - is a REFUSAL, not a guess.
 */
export const SETTING_ALIASES = (() => {
  const map = new Map()
  for (const d of SETTING_DEFS) {
    for (const was of d.was || []) {
      if (map.has(was) && map.get(was) !== d.key) throw refuse('VMU_ALIAS_AMBIGUOUS', 'two keys claim the same former name: ' + was)
      map.set(was, d.key)
    }
  }
  return map
})()

/**
 * WHAT A RENAME RESOLUTION REPORTS (docs/03 §8, VMU_PARAM_RENAMED). Accepting a former name silently would hide the
 * fact that a deployment is still speaking the old vocabulary, and a rename nobody can observe cannot be finished.
 * This returns the notice a caller may log or surface; it does NOT throw, because a former name is legitimate.
 */
export function renameNotice(key) {
  const to = SETTING_ALIASES.get(key)
  return to ? { code: 'VMU_PARAM_RENAMED', from: key, to } : null
}

/** The canonical key for `key`, or the key itself when it is not a former name. */
export function resolveKey(key) { return SETTING_ALIASES.get(key) || key }

/** Named refusals. Codes are registered in docs/03 §8 (gate D14 forbids unregistered ones). */
export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

/** R4: a key that is not declared is a defect. Never invent a default for it. */
export function assertDeclared(key) {
  const canonical = resolveKey(key)
  if (!BY_KEY.has(canonical)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'undeclared setting key: ' + key,
      'declare it in vibe-math-vmu/settings/schema.js first (docs/04 R4)')
  }
  // A FORMER NAME IS ACCEPTED AND RESOLVED, never silently treated as the canonical one: the record returned is the
  // canonical declaration, so a caller that reads `record.key` learns the new name without a second lookup.
  return BY_KEY.get(canonical)
}

/** I-3: the framework owns time; a user may not hand us an absolute deadline. Budgets (`...Ms`) and
 *  timeouts are legitimate settings, and every DECLARED key is framework-owned by construction, so
 *  the refusal is for undeclared, user-supplied instants only. */
export function assertNoUserTime(key) {
  if (BY_KEY.has(key)) return
  if (/(?:At|Deadline)$/.test(key)) {
    throw refuse('VMU_NOT_PERMITTED', 'user-supplied time is not accepted: ' + key,
      'time is set by the framework (docs/01 I-3); budgets live in vmu.limits.*')
  }
}

/**
 * ★ ROUND 30 STOP-THE-LINE FIX (`vmu-verify2` measured it): THE TYPES `validateValue` MAY NOT JUDGE — and why that
 * is not a silent hole.
 *
 * WHAT HAPPENED: the moment A (task-149) gave `validateValue` real execution points, its `default:` branch — which
 * had been unreachable dead code — began refusing **legal values of every declared type it has no case for**:
 * `string` (173 keys), `planned` (111), `object` (21), `integer` (7), `number` (7) = **319 of 1226 declared keys
 * (~26%)**, on BOTH faces. Measured: `setSettingsValue('vmu.meetings.attendanceMode', 'roster')` threw
 * `unknown declaration type for …: string`. ⇒ an execution point that turns "this type has no definition" into
 * "this value is illegal" is worse than no execution point at all.
 *
 * THE RULE NOW: every type is either JUDGED (it has a case below) or EXPLICITLY UNDECIDED (`planned` = declared but
 * not wired, so "what is a legal value" has no answer yet ⇒ not judged, and NOT refused). A type that is neither is
 * a DEFECT and stays LOUD (`unknown declaration type`), so a brand-new type cannot slip in quietly; the guard is the
 * coverage assertion in `tests/vmu-settings-domain.test.mjs` §6 — **every declared key's own `def` must validate**,
 * which reddens on a new case-less type before it can ever reach a runtime write.
 */
export const UNJUDGED_TYPES = Object.freeze(['planned'])

/**
 * The PURE verdict for one declaration/value pair: a string WHY it is bad, or `null` when it is acceptable.
 * Kept separate from `validateValue` so the self-consistency check below can ask the SAME question without
 * duplicating the switch (two copies of this table would drift, and the drift is exactly the 319-key defect).
 */
function whyBad(d, value) {
  // ★ THE SETTINGS-UNSET SENTINEL (task-149 ②): `null` is not a value, so no type judges it — and because this
  // rule lives in the PURE verdict (not only in validateValue), the exemption list uses it too: the 10 keys whose
  // declared default is `null` stop reading as self-contradictory.
  if (value === null) return null
  switch (d.type) {
    case 'boolean': return typeof value !== 'boolean' ? 'expected a boolean' : null
    case 'enum': return !d.domain.includes(value) ? 'expected one of ' + d.domain.join(' | ') : null
    case 'natural': return (!Number.isInteger(value) || value < 0) ? 'expected an integer >= 0' : null
    case 'string': return typeof value !== 'string' ? 'expected a string' : null
    case 'integer': return !Number.isInteger(value) ? 'expected an integer' : null
    case 'number': return (typeof value !== 'number' || !Number.isFinite(value)) ? 'expected a finite number' : null
    // `object` is TYPE-ONLY by ruling (task-149 ②): the schema declares no field shape, so judging fields would be
    // inventing a contract. "Is it an object" is all the declaration promises.
    case 'object': return (value === null || typeof value !== 'object' || Array.isArray(value)) ? 'expected an object' : null
    case 'ratio': return (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) ? 'expected a number in 0..1' : null
    case 'positiveInteger': return (!Number.isInteger(value) || value < 1) ? 'expected an integer >= 1' : null
    case 'path':
      if (typeof value !== 'string' || value.length === 0) return 'expected a non-empty relative path'
      return /^([A-Za-z]:|[\\/])/.test(value) ? 'expected a workspace-relative path' : null
    case 'stringList': return (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) ? 'expected a list of strings' : null
    case 'objectList': return (!Array.isArray(value) || value.some((v) => v === null || typeof v !== 'object')) ? 'expected a list of objects' : null
    default: return UNKNOWN_TYPE
  }
}

/** Sentinel: this declaration's TYPE has no definition at all (neither judged nor explicitly undecided). */
const UNKNOWN_TYPE = '\u0000unknown-declaration-type'

/** Lazily computed: which declared keys carry a `def` that does not satisfy their OWN declaration. */
const SELF_INCONSISTENT = new Map()
function selfInconsistentWhy(d) {
  if (!SELF_INCONSISTENT.has(d.key)) {
    const why = whyBad(d, d.def)
    SELF_INCONSISTENT.set(d.key, why === null || why === UNKNOWN_TYPE ? null : String(why))
  }
  return SELF_INCONSISTENT.get(d.key)
}

/**
 * WHY THIS DECLARATION IS NOT ENFORCED (or `null` when it IS). Two NAMED, disclosed categories — the ruling for
 * A's regression (task-149 ①): "neither silently accepted nor wrongly refused":
 *   ① the TYPE has no defined meaning yet (`UNJUDGED_TYPES`, e.g. `planned` = declared but not wired);
 *   ② the DECLARATION IS SELF-INCONSISTENT: its own `def` fails its own type (measured: 13 keys, e.g. a
 *      `stringList` whose default is not a list) ⇒ a validator derived from a declaration must never refuse the
 *      declaration's own default, so those keys are not judged and are NAMED as schema defects instead.
 */
export function unenforcedReason(def) {
  if (!def) return null
  if (UNJUDGED_TYPES.includes(def.type)) return 'no validator implemented for this declaration type yet'
  const self = selfInconsistentWhy(def)
  if (self) return 'declaration defect: its own default does not satisfy its declaration (' + self + ')'
  return null
}

/** The named report a reader (and `status()`) can act on: which TYPES and which KEYS are not being enforced. */
export function unenforcedReport(defs = SETTING_DEFS) {
  const types = new Map()
  const declarations = []
  for (const d of defs) {
    const why = unenforcedReason(d)
    if (!why) continue
    if (UNJUDGED_TYPES.includes(d.type)) {
      const row = types.get(d.type) || { type: d.type, count: 0, reason: why }
      row.count += 1
      types.set(d.type, row)
    } else {
      declarations.push({ key: d.key, type: d.type, reason: why })
    }
  }
  return { types: [...types.values()], declarations,
    note: 'NEITHER silently accepted NOR wrongly refused: these are the declarations the value guard does not judge (task-149 ①)' }
}

/** Domain/shape check for one value, derived from the declaration. */
export function validateValue(key, value) {
  const d = assertDeclared(key)
  // ★ ROUND 30 (task-149 ②, Lead's ruling): `null` IS THE SETTINGS-UNSET SENTINEL, not a value. The declaration
  // system already had the concept — the generator's own words are "an honest null default" / "emitted with a null
  // default" (source verified by vmu-verify2) — while the VALIDATOR did not, which made 10 declared keys look
  // self-contradictory. Semantics: unset ⇒ the declared default applies (the readers' existing fallback). So
  // `null` is ACCEPTED for EVERY judged type, and it is never a rejection.
  if (value === null) return value
  // NOT JUDGED (named, disclosed): a declaration whose type has no meaning yet, or whose own default contradicts
  // it, is left exactly as it was before A — the alternative was refusing 319 keys' legal values (~26%).
  if (unenforcedReason(d)) return value
  const why = whyBad(d, value)
  if (why === UNKNOWN_TYPE) {
    throw refuse('VMU_INVALID_ARGUMENT', 'unknown declaration type for ' + d.key + ': ' + d.type,
      'add a case in validateValue (and a coverage witness), or list it in UNJUDGED_TYPES with a reason')
  }
  if (why) throw refuse('VMU_INVALID_ARGUMENT', d.key + ': ' + why, 'declared as ' + d.type)
  return value
}

/**
 * Nested Schemastery object for the plugin `Config` (dots become nesting, per docs/03 conventions).
 * `carrier` is the Schemastery namespace injected by the host (default import or named `z`); when it
 * is absent or incomplete we refuse by name instead of silently returning a schema that does not
 * validate. The carriers actually used by first-party packages expose exactly these members.
 */
export function buildSchemastery(carrier, defs = SETTING_DEFS) {
  const need = ['object', 'boolean', 'number', 'string', 'array', 'any', 'union', 'const']
  const missing = !carrier ? need : need.filter((m) => typeof carrier[m] !== 'function')
  if (missing.length > 0) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'schemastery carrier is unavailable or incomplete',
      'pass the host carrier (@deepseek-ai/schemastery) to buildSchemastery; missing: ' + missing.join(','))
  }
  const root = {}
  for (const d of defs) {
    const parts = d.key.split('.')
    let node = root
    for (const p of parts.slice(0, -1)) node = node[p] || (node[p] = {})
    let leaf
    switch (d.type) {
      case 'boolean': leaf = carrier.boolean().default(d.def); break
      case 'natural': leaf = carrier.number().min(0).step(1).default(d.def); break
      // EXACTLY the shape `natural` uses (that is the proven-working numeric chain in this carrier); only the
      // step differs. ★ ROUND 30 (task-149 A) — THIS COMMENT USED TO CLAIM *"The 0..1 bound is enforced by
      // validateValue, the path every runtime write takes"* AND THAT WAS FALSE: `validateValue` had NO caller
      // outside this file (`resolveSettings` was its only callee, and `resolveSettings` had none at all), so the
      // 0..1 bound was enforced NOWHERE at runtime. It is now true — see `screenSettings` below and the two
      // execution points it is called from (`kernel/index.js`: the construction-time config screen and
      // `applyPackSettings`); `resolveSettings` composes layers on the same checker.
      case 'ratio': leaf = carrier.number().min(0).step(0.01).default(d.def); break
      case 'positiveInteger': leaf = carrier.number().min(1).step(1).default(d.def); break
      case 'enum': leaf = carrier.union(d.domain.map((v) => carrier.const(v))).default(d.def); break
      case 'stringList': leaf = carrier.array(carrier.string()).default(d.def); break
      case 'objectList': leaf = carrier.array(carrier.any()).default(d.def); break
      default: leaf = carrier.string().default(d.def); break
    }
    node[parts[parts.length - 1]] = leaf
  }
  return carrier.object(root)
}

/** Outward JSON Schema (dotted flat map) derived from the SAME table — never hand-written twice. */
export function toJsonSchema(defs = SETTING_DEFS) {
  const properties = {}
  for (const d of defs) {
    const p = { default: d.def, description: d.doc, 'x-vmu-hot': d.hot, 'x-vmu-who': d.who }
    switch (d.type) {
      case 'boolean': p.type = 'boolean'; break
      case 'enum': p.enum = d.domain.slice(); break
      case 'natural': p.type = 'integer'; p.minimum = 0; break
      case 'positiveInteger': p.type = 'integer'; p.minimum = 1; break
      case 'stringList': p.type = 'array'; p.items = { type: 'string' }; break
      case 'objectList': p.type = 'array'; p.items = { type: 'object' }; break
      default: p.type = 'string'; break
    }
    properties[d.key] = p
  }
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties, additionalProperties: false }
}

/**
 * ★ ROUND 30 (task-149 A) — THE VALUE/DOMAIN GUARD'S EXECUTION POINT (config + merge face).
 *
 * WHY IT EXISTS. `validateValue` was dead code at runtime: its only caller was `resolveSettings`, which itself had
 * no caller anywhere in the package. So a declared `type`/`domain` was DOCUMENTATION, and an out-of-domain value
 * handed in through `config.vmu` was simply LOADED (`vmu.budget.onExceed`, `vmu.compat.unknownCombo`,
 * `vmu.quota.onExceed` were all measured doing exactly that). THIS function is where such a value is screened.
 *
 * THE POLICY (two faces, two dispositions — both NAMED, neither silent):
 *   · interactive write face (`set`): `kernel/index.js` calls `validateValue` directly ⇒ REFUSE by name
 *     (`VMU_INVALID_ARGUMENT`, the code R17 already uses for the same offence);
 *   · config/pack MERGE face (here): a value outside its declared domain is NOT ACCEPTED, is RECORDED by name and
 *     the DECLARED DEFAULT stays in force. Hard-refusing here would turn "one key mistyped" into "the whole
 *     session will not start" — and the record itself is the migration hint.
 *
 * THREE STATES, NEVER MIXED (so a reader can tell them apart):
 *   · key absent            ⇒ declared default, silent, correct (zero mechanism, R1);
 *   · `reason:'undeclared'` ⇒ nobody declared it: it is RECORDED and LEFT AS IS (readers ignore it; a merge face
 *     must not silently DELETE a key it does not know, and must not break the session either);
 *   · `reason:'outside …'`  ⇒ declared but the value is out of domain: recorded + declared default substituted.
 */
export function screenSettings(input = {}, { source = 'config' } = {}) {
  const accepted = {}
  const rejected = []
  for (const [k, v] of Object.entries(input || {})) {
    const decl = BY_KEY.get(resolveKey(k)) || null
    if (!decl) {
      rejected.push({ key: k, value: v, code: 'VMU_INVALID_ARGUMENT', reason: 'undeclared', source, default: undefined })
      continue
    }
    try {
      validateValue(decl.key, v)
    } catch (e) {
      rejected.push({ key: decl.key, value: v, code: (e && e.code) || 'VMU_INVALID_ARGUMENT',
        reason: decl.domain ? 'outside the declared domain ' + decl.domain.join(' | ') : 'expected ' + decl.type,
        domain: decl.domain || null, type: decl.type, source, default: decl.def })
      continue
    }
    accepted[decl.key] = v
  }
  return { accepted, rejected }
}

/**
 * Layering (docs/04 §4): pack defaults < preset Config < session settings < runtime set.
 * Input is an ordered list of flat maps; later layers win. Undeclared keys are refused, never
 * merged (so a typo cannot silently become a phantom setting).
 *
 * ★ ROUND 30 (task-149 A): `onInvalid:'reject'` is the MERGE-face mode — a declared-but-out-of-domain value is
 * recorded into `rejected[]` and SKIPPED (the declared default stays), instead of throwing. `onInvalid:'refuse'`
 * is the original behaviour and remains the default. In reject mode an UNDECLARED key is recorded AND merged
 * (a merge face must not delete a key it does not own); in refuse mode it still throws, as documented above.
 * The per-layer maps the accepted values came from are returned as `accepted[i]` so a caller can apply ONE layer
 * (e.g. `applyPackSettings`) without materialising every declared default into the live settings object.
 */
export function resolveSettings(layers = [], { onInvalid = 'refuse' } = {}) {
  const out = {}
  const provenance = {}
  const rejected = []
  const accepted = []
  for (const d of SETTING_DEFS) out[d.key] = d.def
  layers.forEach((layer, i) => {
    const layerAccepted = {}
    accepted.push(layerAccepted)
    if (!layer) return
    for (const [k, v] of Object.entries(layer)) {
      assertNoUserTime(k)
      const decl = BY_KEY.get(resolveKey(k)) || null
      if (!decl) {
        if (onInvalid !== 'reject') throw refuse('VMU_INVALID_ARGUMENT', 'undeclared setting key: ' + k,
          'declare it in vibe-math-vmu/settings/schema.js first (docs/04 R4)')
        rejected.push({ key: k, value: v, code: 'VMU_INVALID_ARGUMENT', reason: 'undeclared', layer: i })
        out[k] = v
        layerAccepted[k] = v
        provenance[k] = provenance[k] || []
        provenance[k].push(i)
        continue
      }
      try {
        validateValue(decl.key, v)
      } catch (e) {
        if (onInvalid !== 'reject') throw e
        rejected.push({ key: decl.key, value: v, code: (e && e.code) || 'VMU_INVALID_ARGUMENT',
          reason: decl.domain ? 'outside the declared domain ' + decl.domain.join(' | ') : 'expected ' + decl.type,
          domain: decl.domain || null, type: decl.type, layer: i, default: decl.def })
        continue
      }
      out[k] = v
      layerAccepted[k] = v
      provenance[k] = provenance[k] || []
      provenance[k].push(i)
    }
  })
  return { values: out, accepted, provenance, rejected }
}



