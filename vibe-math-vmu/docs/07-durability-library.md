# vmu 07 · 耐久与归档（Store & Library）

> 状态：**草案 v0.2（大幅扩充）**
> 上位：`01-philosophy.md`（R9 归档能力 / R10 耐久可信 / R12 可复现）、`02-architecture.md`（内核 B、D 分区）、`03`（公开键与文件布局）、`13-migration.md`（迁移）。
> 关键约束（侦察实测）：**不得**把自有状态写进 DSH 会话日志（会毁可恢复性）⇒ **vmu 状态必须自有文件/存储**。
> **成熟度标记**：✓＝已实现（有 kernel 依据）／✗＝计划（未实现）。
> **参数写法**：正文只写**通配家族**（如 `vmu.records.*`），具体键名由登记表维护，不在本卷固化。
> **条目格式**（§4 起）：名称／目的／面向谁／接口形状／可调控参数（通配）／错误码族／四条哲学关系／实现要点／依赖／成熟度／优先级 P0–P3。

---

## 1. Store 端口（抽象先行，实现可替换｜D7）

```ts
interface VmuStore {
  open(spec: { root: string; version: number; migrate?: Migrator[] }): Promise<void>
  read<K>(key: K): Promise<Value<K>>                       // 只读快照
  write<K>(key: K, value: Value<K>, opts: { expect?: Version }): Promise<WriteResult>   // 整体替换
  patch<K>(key: K, fn: (cur: Value<K>) => Value<K>): Promise<WriteResult>               // **函数式变更（首选）**
  subscribe<K>(key: K, fn: (next: Value<K>, prev: Value<K>) => void): Disposer
  migrate(): Promise<MigrationReport>
  export(): Promise<Snapshot>; import(s: Snapshot, opts?): Promise<void>
}
```

**已实现（✓）**：`kernel/store.js` 提供 `createStore`（含 `STATE_VERSION`、`PUBLIC_KEYS` 白名单）。

**四条实现纪律（血的教训，逐条有本仓历史为证）**
1. **写一律走 fold 内函数式变更**：`patch(key, cur => next)` 而不是"读出来改完再写回"。
   *理由*：同 tick 的两次并发写若在 fold 外做整对象读改写，会**丢掉其中一个**（本仓 `e2e-v5-round2` 的"同 tick 两个提议不得丢"用例实测抓到；v5r 的 `leanApplySettle` 也因为同样的写法抹掉过 `sha256`）。
2. **白名单**：fold 必须**显式白名单**（未登记的键写入即**静默丢弃**是历史坑）⇒ 未登记键写入必须**报错**而不是丢弃。
3. **原子性**：写文件用 `tmp + rename`；**写入确认 = 落盘成功**（不接受"内存里成功"）。
4. **单写者串行**：所有写经一条 promise 链，避免交错。

**后端可选性是本卷第一原则**：单文件／目录／远端都只是端口的实现；**切换后端不得改变调用方**。

## 2. 版本、迁移与回退

| 项 | 规则 |
|---|---|
| 版本字段 | `state.version`（整数），与 `03-§7` 的破坏性变更绑定 |
| 迁移 | 每次 bump **必须**提供前向迁移函数 ＋ **迁移报告**（改了哪些键、条目数） |
| 回退 | 迁移前**自动备份**（`state.json.bak.<version>`）；回退＝恢复备份 ＋ 反向迁移（若提供） |
| 失败 | 迁移失败 ⇒ **拒绝启动**（具名 `VMU_STORE_MIGRATION`），绝不"半迁移继续跑" |
| 一致性 | 启动时做**投影校验**（结构 + 引用完整性），失败给具名报告 |

**补充（本次新增）**：迁移步骤必须**幂等且可重入**；每步前先落**回退点**（不是出错后临时生成）；`dry-run` 产出的差异报告要区分"将改/将跳过/将拒绝"三类。

## 3. 崩溃恢复与"工作台账"

**已实现（✓）**：`kernel/work.js` 提供工作台账（台账键 `work`），记录在册动作及其状态。

- **恢复次序**：先读台账 ⇒ 再读状态 ⇒ 最后决定补做或放弃；**不可逆动作一律不重放**。
- **原子写与 fsync 语义**（要点）：只保证"文件内容入盘"≠"目录项入盘"；目录项持久化需单独动作，本卷要求写明所用语义，不得含糊。
- **崩溃演练**：构造半写、截断、坏 JSON、缺字段四类残骸，断言系统给出**明确拒绝**或安全恢复；**坏输入必须报错**，不得被默认值静默吸收。

## 4. 归档与记忆（Library）

**已实现（✓）**：`kernel/library.js` 定义 `KINDS` 分类、`HEAD_FIELDS` 头部字段集、`BODY_CAP_BYTES`（正文上限 32KiB），并提供 `createLibrary`。

### 4.1 对象模型与卡片

- **名称**：归档对象与分类（record / kind）
  **目的**：给研究所产出稳定的"可引用单位"。
  **面向谁**：代理（写入与引用）、用户（阅读）。
  **接口形状**：对象＝头部（id/title/kind/fingerprint/status/...）＋正文；头部常驻、正文按需展开。
  **可调控参数**：`vmu.records.allowedKinds`／`vmu.records.body.chunkedReturn`／`vmu.records.body.noticeStyle`／`vmu.records.bodyCapBytes`／`vmu.records.chunk.chunkBytes`／`vmu.records.chunk.thresholdBytes`／`vmu.records.expandThreshold`／`vmu.records.external.allowedSchemes`／`vmu.records.external.verifyExists`／`vmu.records.fingerprintPolicy`／`vmu.records.head.maxItems`／`vmu.records.head.sort`／`vmu.records.headFields`／`vmu.records.headListAt`／`vmu.records.history.depth`／`vmu.records.history.storeMode`／`vmu.records.meetingKeepEvery`／`vmu.records.naming.conflictSuffix`／`vmu.records.naming.maxLength`／`vmu.records.naming.slugPolicy`／`vmu.records.pointerPropagation`／`vmu.records.requireSettledRecords`／`vmu.records.retention.keepEvery`／`vmu.records.retention.maxBytes`／`vmu.records.retention.permanentMarker`／`vmu.records.retention.tierThreshold`／`vmu.records.tracks`／`vmu.records.trash.autoPurge`／`vmu.records.trash.countInQuota`／`vmu.records.trash.retainDays`／`vmu.records.treatNegativeAsFirstClass`／`vmu.records.truncateMode``（**已声明 ✓**；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④。接线状态见 `04-§11` ✓）
  **错误码族**：`VMU_LIB_*`。**哲学**：自由度（分类可扩）／可调控（字段可裁）／可定义（头部契约固定）／扩展性（新分类不改引擎）。
  **实现要点**：**头部字段是契约**；增字段走版本与迁移，不得悄悄多出字段让读者崩。
  **依赖**：Store 端口。**成熟度**：✓　**优先级**：P0
- **名称**：命名与 slug 规则
  **目的**：人可读、机器稳定、跨平台安全。
  **面向谁**：代理、用户、导出工具。
  **接口形状**：标题生成 slug（大小写/空白/CJK 策略可配）＋冲突消解后缀。
  **可调控参数**：`vmu.records.naming.slugPolicy`／`maxLength`／`conflictSuffix`（**已接线 ✓**）；**CJK 处理由 `slugPolicy=cjk-keep` 表达 ✓**（**无独立键** ✗，不以族名充数 ✓）。
  **错误码族**：`VMU_NAME_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**id 与 slug 分离**（slug 可改，id 不可变）。
  **依赖**：对象模型。**成熟度**：✓（id 分配）／✗（slug 策略未定型）　**优先级**：P1

### 4.2 指纹、内容寻址与去重

- **名称**：内容指纹（fingerprint）
  **目的**：同内容＝同身份。
  **面向谁**：框架、去重、审计者。
  **接口形状**：写入时计算并存入头部；按指纹反查。
  **可调控参数**：`vmu.fingerprint.algo`／`vmu.fingerprint.includeMeta`／`vmu.fingerprint.truncate``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_FP_*`。**哲学**：自由度（算法可选）／可调控（长度/范围）／可定义（身份语义）／扩展性（换算法走迁移）。
  **实现要点**：**算法与长度必须随指纹记录**；只存裸哈希会让换算法变成不可判定。
  **依赖**：对象模型。**成熟度**：✓（头部已有 fingerprint）　**优先级**：P0
- **名称**：去重（dedupe）
  **目的**：同内容不重复占空间、不产生两个"真相"。
  **面向谁**：用户（容量）、审计者（一致性）。
  **接口形状**：同指纹命中 ⇒ 归并物理对象＋多条引用记录。
  **可调控参数**：`vmu.dedupe.crossWorkspace`／`vmu.dedupe.enabled`／`vmu.dedupe.scope``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_DEDUPE_*`。**哲学**：自由度（可关）／可调控（范围）／可定义（"同内容"定义）／扩展性。
  **实现要点**：**必须保留引用计数**，否则删一个引用会误删他人内容。
  **依赖**：指纹。**成熟度**：✗　**优先级**：P1

### 4.3 版本、历史与保留

- **名称**：对象历史（revision chain）
  **目的**：多版可比较、可回溯。
  **面向谁**：用户、代理（"基于上一版"）。
  **接口形状**：每次写入产生新版本，链上保留差异与作者、时间。
  **可调控参数**：`vmu.records.history.depth`／`storeMode`（**已接线 ✓**）；**压缩策略无独立键** ✗（`storeMode=diff` 即差异存储 ✓）。
  **错误码族**：`VMU_HISTORY_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**差异存储必须有回退全量的手段**，否则一次坏差异毁整条链。
  **依赖**：指纹、保留策略。**成熟度**：✗　**优先级**：P1
- **名称**：旧版本保留策略
  **目的**：可回溯且磁盘不膨胀。
  **面向谁**：用户、审计者。
  **接口形状**：规则声明（每 N 版／永久／按总大小上限）。
  **可调控参数**：`vmu.records.retention.keepEvery`／`permanentMarker`／`maxBytes`／`tierThreshold`（**四条全部已接线 ✓**）。
  **错误码族**：`VMU_RETENTION_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**永久保留是显式标记**，不是"没触发清理"的副作用；回收前产出将被删除清单。
  **依赖**：版本链。**成熟度**：✗　**优先级**：P1
- **名称**：软删除与回收站
  **目的**：误删可恢复、删除可审计。
  **面向谁**：用户、审计者。
  **接口形状**：删除＝移入回收站并记录；可按时间/责任人列出、恢复或彻底清除。
  **可调控参数**：`vmu.records.trash.retainDays`／`autoPurge`／`countInQuota`（**三条全部已接线 ✓**）。
  **错误码族**：`VMU_TRASH_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：彻底清除是**显式动作**并留审计条目。
  **依赖**：索引、审计。**成熟度**：✗　**优先级**：P1

### 4.4 打包、压缩与大对象

- **名称**：打包与压缩（tar/zip）
  **目的**：一次产出变成可搬运单位。
  **面向谁**：用户（交付）、导出导入。
  **接口形状**：打包产出单一归档＋清单（manifest）；解包先校验清单再落盘。
  **可调控参数**：`vmu.pack.compression``（**已声明 ✓**；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④。接线状态见 `04-§11` ✓）
  **错误码族**：`VMU_PACK_*`。**哲学**：自由度／可调控／可定义（清单是契约）／扩展性。
  **实现要点**：**清单必须含指纹**；对不上要拒绝，而非"尽量恢复"。
  **依赖**：指纹、导出。**成熟度**：✗　**优先级**：P1
- **名称**：大文件与分片（chunking）
  **目的**：超大正文不撑爆单文件与内存。
  **面向谁**：代理、用户。
  **接口形状**：超阈值自动分片；按需拼接；各分片各自指纹。
  **可调控参数**：`vmu.records.chunk.thresholdBytes`／`chunkBytes`（**已接线 ✓**）；**是否压缩与并发读上限【无键】** ✗（未声明 ⇒ 不以族名代替 ✓）。
  **错误码族**：`VMU_CHUNK_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：分片边界**幂等**（同内容同分片），否则去重与校验失效。
  **依赖**：指纹、去重。**成熟度**：✗　**优先级**：P2
- **名称**：外部大对象引用
  **目的**：不把大数据搬进研究所，只登记位置与指纹。
  **面向谁**：用户、代理。
  **接口形状**：引用条目（位置＋指纹＋可得性说明）。
  **可调控参数**：`vmu.records.external.allowedSchemes`／`verifyExists`（**已接线 ✓**）；**校验频率【无键】** ✗。
  **错误码族**：`VMU_EXTERNAL_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**外部引用不得冒充"已归档"**；导出须标注其不可自足。
  **依赖**：元数据。**成熟度**：✗　**优先级**：P2
- **名称**：冷热分层（tiering）
  **目的**：常用快取、冷对象下沉，容量可控。
  **面向谁**：用户（容量与速度）。
  **接口形状**：按访问标记层级；取用自动回温。
  **可调控参数**：`vmu.tier.*`（**此族目前【没有任何已声明的键】** ✗ —— 族名只是设计意图，**不得当作键** ✓）
  **错误码族**：`VMU_TIER_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：分层**不得改变对象身份**（id/指纹不变）。
  **依赖**：热度统计。**成熟度**：✗　**优先级**：P2

### 4.5 索引、检索与分类

- **名称**：索引与自愈
  **目的**：检索不必全量扫描；索引坏了能重建。
  **面向谁**：代理、用户。
  **接口形状**：增量更新＋全量重建入口；损坏时降级为扫描并标记过期。
  **可调控参数**：`vmu.index.rebuildBatch`／`vmu.index.staleTolerance`／`vmu.index.verifyChecksum``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_INDEX_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**索引永远不是真相源**；索引缺失不得让对象"消失"。
  **依赖**：对象模型。**成熟度**：✗　**优先级**：P1
- **名称**：全文检索
  **目的**：按内容找对象。
  **面向谁**：代理、用户。
  **接口形状**：查询串＋过滤器；返回头部列表而非全文。
  **可调控参数**：`vmu.search.analyzer`／`vmu.search.maxResults`／`vmu.search.snippetLen``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_SEARCH_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**结果必须可解释**（命中原因：标题/正文/标签/引文）。
  **依赖**：索引。**成熟度**：✗　**优先级**：P1
- **名称**：标签与分类
  **目的**：多维度组织，允许自定义体系。
  **面向谁**：用户、代理。
  **接口形状**：自由标签＋可选受控词汇表；支持批量重命名。
  **可调控参数**：`vmu.tags.aliasTable`／`vmu.tags.controlled`／`vmu.tags.maxDepth``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_TAG_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**别名表要有迁移路径**，否则重命名留下两套并行标签。
  **依赖**：索引。**成熟度**：✗　**优先级**：P2
- **名称**：交叉引用与反链
  **目的**：知道"谁引用了它"，支撑影响面分析。
  **面向谁**：代理、用户、审计者。
  **接口形状**：引用边双向可查；写入时校验目标存在性。
  **可调控参数**：`vmu.refs.backlinkDepth`／`vmu.refs.danglingPolicy`／`vmu.refs.requireTarget``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_REF_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**悬空引用必须可检索**（列出未解析引用），不得静默忽略。
  **依赖**：对象模型。**成熟度**：✓（引用校验）／✗（反链索引）　**优先级**：P1

### 4.6 文献、引文与元数据

- **名称**：引文与参考文献
  **目的**：把"依据"变成结构化、可导出、可校验的数据。
  **面向谁**：代理（论文/证明）、用户。
  **接口形状**：引文条目（作者/标题/年份/出处/标识符）＋正文引用点；导出 BibTeX/CSL 风格。
  **可调控参数**：`vmu.citations.allowFreeText`／`vmu.citations.idPriority`／`vmu.citations.requiredFields`／`vmu.citations.style``（**已声明 ✓**；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④。接线状态见 `04-§11` ✓）
  **错误码族**：`VMU_CITE_*`。**哲学**：自由度（样式）／可调控（必填集）／可定义（条目 schema）／扩展性（新标识符类型）。
  **实现要点**：**标识符与条目分离**；DOI/arXiv/PMID 是可校验标识，**缺失时不得编造**。
  **依赖**：元数据、导出。**成熟度**：✗　**优先级**：P1
- **名称**：元数据 schema 与校验
  **目的**：自由与骨架并存。
  **面向谁**：代理、用户、迁移者。
  **接口形状**：分类声明必填/可选字段＋类型；写入时校验，失败给字段级原因。
  **可调控参数**：`vmu.metadata.customPrefix`／`vmu.metadata.strictness``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_META_*`。**哲学**：自由度（自定义字段）／可调控（严格度）／可定义（schema 显式）／扩展性。
  **实现要点**：**校验失败不得写入半份**；严格度全局可调但**分类可覆盖**。
  **依赖**：对象模型。**成熟度**：✗　**优先级**：P1
- **名称**：时间线与溯源（provenance）
  **目的**：回答"从哪来、经过谁、依据什么"。
  **面向谁**：审计者、用户、代理。
  **接口形状**：事件时间线＋来源链（父对象、外部来源）。
  **可调控参数**：`vmu.provenance.depth`／`vmu.provenance.recordInputFingerprint``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_PROV_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**append-only**，否则历史可被重写。
  **依赖**：审计日志。**成熟度**：✗　**优先级**：P1
- **名称**：审计日志
  **目的**：固定"谁在何时做了什么"，支撑问责与复现。
  **面向谁**：审计者、用户。
  **接口形状**：追加事件流＋按对象/时间/责任人过滤；可导出。
  **可调控参数**：`vmu.audit.chain.algorithm`／`vmu.audit.chain.checkpointEvery`／`vmu.audit.chain.macKeyTtlMs`／`vmu.audit.chain.verifyCap`／`vmu.audit.dir`／`vmu.audit.exportFormat`／`vmu.audit.exportScope`／`vmu.audit.level`／`vmu.audit.macKey`／`vmu.audit.recountRoles`／`vmu.audit.redactKeys`／`vmu.audit.retentionDays`／`vmu.audit.ringMax`／`vmu.audit.rotateBytes`／`vmu.audit.rotateDaily`／`vmu.audit.sensitiveFields`／`vmu.audit.traceKeepMs``（**已声明 ✓**；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④。接线状态见 `04-§11` ✓）
  **错误码族**：`VMU_AUDIT_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：日志写入失败必须**显式告警**（不得静默丢审计）。
  **依赖**：Store 端口。**成熟度**：✗　**优先级**：P1

### 4.7 导出、导入与互操作

- **名称**：导出与导入
  **目的**：产出可脱离本系统理解与复用。
  **面向谁**：用户、外部平台。
  **接口形状**：导出＝对象集＋清单＋引用关系；导入＝先校验清单与 schema 再落盘。
  **可调控参数**：`vmu.export.format`／`vmu.export.includeHistory``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_EXPORT_*`、`VMU_IMPORT_*`。**哲学**：自由度（格式）／可调控（取舍）／可定义（清单契约）／扩展性（新格式加适配器）。
  **实现要点**：**导入必须可预览**（将新增/覆盖/跳过），且**默认不覆盖**。
  **依赖**：指纹、元数据。**成熟度**：✗　**优先级**：P1
- **名称**：长期保存包（Dataverse/Zenodo 风格）
  **目的**：多年后仍可理解与校验。
  **面向谁**：用户、外部仓储。
  **接口形状**：包＝数据＋元数据＋README＋清单＋固定算法指纹。
  **可调控参数**：`vmu.archive.package.*`（目标风格、元数据必填集、是否含环境说明、指纹算法）。
  **错误码族**：`VMU_ARCHIVE_*`。**哲学**：自由度（风格）／可调控／可定义（包结构）／扩展性。
  **实现要点**：**包必须自述**（不依赖本系统即可读懂），并显式声明缺失项。
  **依赖**：导出、引文、元数据。**成熟度**：✗　**优先级**：P2
- **名称**：权限与可见性
  **目的**：区分"所内"与"可对外"。
  **面向谁**：用户、审计者。
  **接口形状**：对象级可见性标记＋默认继承；导出按标记裁剪。
  **可调控参数**：`vmu.visibility.default``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_VISIBILITY_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**导出默认最小可见**；放宽必须显式。
  **依赖**：元数据、导出。**成熟度**：✗　**优先级**：P2
- **名称**：加密与完整性校验
  **目的**：防篡改、防误传；"内容没变"可验证。
  **面向谁**：用户（敏感数据）、审计者。
  **接口形状**：可选加密存储＋校验入口；校验失败即拒绝读取。
  **可调控参数**：`vmu.crypto.algorithm`／`vmu.crypto.allowUnsignedVerify`／`vmu.crypto.keyTtlMs`／`vmu.crypto.requireSigner`／`vmu.crypto.signingKeyId``（**已声明 ✓**；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④。接线状态见 `04-§11` ✓）
  **错误码族**：`VMU_CRYPTO_*`。**哲学**：自由度（可关）／可调控／可定义／扩展性。
  **实现要点**：**密钥不得写进研究所目录**；丢失密钥须给出明确不可恢复说明。
  **依赖**：指纹。**成熟度**：✗　**优先级**：P3

### 4.8 容量、配额与清理

- **名称**：配额与容量管理
  **目的**：容量可见、可限、可告警。
  **面向谁**：用户、框架。
  **接口形状**：容量统计（工作区/分类/对象）＋阈值告警＋可选拒绝写入。
  **可调控参数**：`vmu.quota.hardBytes`／`vmu.quota.onExceed`／`vmu.quota.softBytes`／`vmu.quota.warnAt``（**已声明 ✓**；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④。接线状态见 `04-§11` ✓）
  **错误码族**：`VMU_QUOTA_*`。**哲学**：自由度（动作）／可调控（阈值）／可定义（超限语义）／扩展性。
  **实现要点**：超限动作**必须可预期**；"拒绝写入"在写入前判定，不得写一半再失败。
  **依赖**：容量统计。**成熟度**：✗　**优先级**：P2
- **名称**：垃圾回收与孤儿检测
  **目的**：清理无引用又无历史价值的数据，且不误删。
  **面向谁**：用户、运维式脚本。
  **接口形状**：扫描 ⇒ 候选删除清单 ⇒ 显式确认 ⇒ 执行（留审计）。
  **可调控参数**：`vmu.prune.autoRun`／`vmu.prune.exemptMarkers`／`vmu.prune.graceDays`／`vmu.prune.scope``（**已声明 ✓**；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④。接线状态见 `04-§11` ✓）
  **错误码族**：`VMU_GC_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**默认只报告不执行**；自动执行须受宽限期与排除标记约束。
  **依赖**：索引、审计。**成熟度**：✗　**优先级**：P2

### 4.9 多工作区、路径安全与冲突

- **名称**：多工作区与共享区
  **目的**：项目间隔离，同时允许显式共享。
  **面向谁**：用户、代理。
  **接口形状**：工作区根＋共享区；跨区引用显式并记录。
  **可调控参数**：`vmu.workspace.crossWrite`／`vmu.workspace.default`／`vmu.workspace.sharedPaths``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_WORKSPACE_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**跨区写默认禁止**；共享以引用或复制二选一并记录选择。
  **依赖**：路径规范化。**成熟度**：✗　**优先级**：P2
- **名称**：路径规范化与逃逸防护
  **目的**：任何名字都不能写到研究所之外或读到不该读的位置。
  **面向谁**：所有落盘路径。
  **接口形状**：统一解析与校验；符号链接与 `..` 在**解析后**校验最终位置。
  **可调控参数**：`vmu.paths.allowedRoots`／`vmu.paths.followSymlinks``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_PATH_*`。**哲学**：自由度（策略）／可调控／可定义（边界固定）／扩展性。
  **实现要点**：**校验发生在解析之后**；只检查输入字符串一定被绕过。
  **依赖**：无。**成熟度**：✓（既有"绝不写工作区之外"约束）　**优先级**：P0
- **名称**：命名冲突
  **目的**：同名对象不互相覆盖。
  **面向谁**：代理、用户。
  **接口形状**：冲突时自动后缀或拒绝（策略可配），并记录冲突事实。
  **可调控参数**：`vmu.naming.conflictPolicy``（**已声明为 planned ✓，尚未实现** ✗；原写法是族名，**族提及不是键** ✓ —— 见 `11-§` 纪律 ④）
  **错误码族**：`VMU_NAME_CONFLICT`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**默认拒绝**优于默认改名（改名会悄悄改变用户预期）。
  **依赖**：命名规则。**成熟度**：✗　**优先级**：P1

### 4.10 头部列表、正文上限与截断计数

- **名称**：头部列表与按需展开
  **目的**："目录常驻、正文按需"，让代理在有限上下文里掌握全貌。
  **面向谁**：代理（首要）、用户。
  **接口形状**：列表返回头部字段；按 id 展开正文。
  **可调控参数**：`vmu.records.head.maxItems`／`head.sort`／`headFields`（**已接线 ✓**）；**分页游标【无键】** ✗。
  **错误码族**：`VMU_HEAD_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**分页必须有稳定游标**，否则翻页会漏/重。
  **依赖**：对象模型、索引。**成熟度**：✓　**优先级**：P0
- **名称**：正文上限与截断计数
  **目的**：防上下文爆炸，同时**不隐瞒**截断事实。
  **面向谁**：代理、用户。
  **接口形状**：超限即截断，并返回"被截断字节数/行数＋获取全文方式"。
  **可调控参数**：`vmu.records.bodyCapBytes`／`body.noticeStyle`／`body.chunkedReturn`（**已接线 ✓**）；**追加读取窗口【无键】** ✗。
  **错误码族**：`VMU_BODY_*`。**哲学**：自由度／可调控／可定义／扩展性。
  **实现要点**：**截断必须计数**：只说"已截断"而不给数量等于隐瞒。
  **依赖**：对象模型。**成熟度**：✓（`BODY_CAP_BYTES`）　**优先级**：P0


### 4.11 关系与反链（知识图谱面）—— **裁决：不做 ✗**（轮 54 审判）

**原规格**（关系字段 schema／13 个 `vmu.relations.*` 键／6 个码／5 个查询接口）**已压缩为这一行**：**五问全否 ⇒ 不做 ✗**。
- **③无消费者**：无任何代码读点；`vmu.relations.*` 这些键**在设置面里也没有登记**（本卷 77 个未登记键的一部分 ✓）。
- **④不丢能力**：归档初衷要的是"**对象能被顺着关系找到**"，而**对象模型（§4.1）与 append-only 溯源（§4.6）已实现** ✓ ⇒ 基础形态已在。
- **⑤与意图的界限**：把"笔记＋关系"升级为**可查询图**（中心性／环检测／反链重建）是**另一个产品** ✓，不是"文件归档"的必要条件 ⇒ 超出 vmu 初衷（**框架＋settings＋中间件＋pack** ✓）。
- **改判条件** ✓：**出现真实消费者**（例如 `ip`／`storepolicy` 的查询需要沿关系遍历 ✓）⇒ **把本节恢复为规格**，并同时**登记键与码** ✓。**此前不再维护这份规格** ✗✓。

### 4.12 日程与业务时间轨

**目的**：让"下周三评审"这类**业务时间**成为结构化数据，而不是自由文本；同时**绝不**让耐久层变成调度器。
**面向谁**：代理（排期与提醒）、用户（计划）。
**成熟度**：**计划（未实现）✗**。

**两类时间的边界（写清）**：
- **墙钟时间（wall clock）**：系统时间戳（`createdAt`/`updatedAt`/审计时间），由框架维护，**不可被业务改写**；
- **业务时间（business time）**：`schedule` 里的 `at`/`window`，是**用户/代理声明的计划**，由人负责其正确性；二者**不得互相推导**（不得用 `updatedAt` 当"评审时间"）。
**业务时间不参与排序与回收**：保留策略、GC、配额一律只看墙钟时间与大小（避免"改个计划时间就能影响回收"）。

**日程轨（字段级 schema）**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✓ | 日程项标识（稳定） |
| `at` \| `window` | ISO 串 \| {from,to} | ✓（二选一） | 单点或时间窗；窗内视为"可安排" |
| `what` | string | ✓ | 做什么（人类可读；**不承载流程语义**） |
| `owner` | memberId | ✓ | 责任人 |
| `timezone` | IANA 名 | ✗ | 缺省取 `vmu.schedule.defaultTimezone` |
| `recurrence` | RRULE 风格串 | ✗ | 重复规则（受 `vmu.schedule.recurrenceEnabled` 控制） |
| `kind` | enum(deadline/reminder/milestone) | ✗ | 截止 vs 提醒（见下） |
| `refs` | objectId[] | ✗ | 关联对象（会议/任务/产物）——**引用而非内联** |
| `status` | enum(planned/done/cancelled/overdue) | ✗ | 业务状态（由人/代理维护） |
| `createdAt` / `createdBy` | ISO / id | ✓ | 溯源 |

**纯数据、不触发流程（硬规则）**：`schedule` **只被读取与报告**，**不得**由框架自动触发任何流程（不自动开会、不自动唤醒、不自动改状态）。要触发 ⇒ **必须显式挂中间件或脚本**：`vmu.schedule.triggerVia` 取 `none`（默认）/`middleware`/`script`，并对接 **05 的钩子面**（钩子自行决定行为与失败语义；框架不代为实现）。若在 `triggerVia=none` 下发现有人试图让它触发 ⇒ `VMU_SCHEDULE_TRIGGER_FORBIDDEN`。

**时区与夏令时**：`vmu.schedule.dstPolicy` 取 `wall`（按当地墙钟，DST 跳变时可能顺延）或 `absolute`（按绝对时刻，不受 DST 影响）；默认 `absolute`（可预测优先）。缺时区 ⇒ `VMU_SCHEDULE_TZ_UNKNOWN`；`window` 的 `from>to` ⇒ `VMU_SCHEDULE_WINDOW_INVALID`；`recurrence` 非法 ⇒ `VMU_SCHEDULE_RECURRENCE_INVALID`。

**截止语义（deadline vs reminder）**：`kind=deadline` ⇒ 过期后状态应转 `overdue`；`kind=reminder` ⇒ 过期**不改状态**，仅报告。无论哪种，**到期只报告**：产出"已到期/即将到期"清单（`VMU_SCHEDULE_OVERDUE_REPORT` 作为报告事件，不是错误中断）；**谁提醒、怎么提醒**属告警面，见 **21 卷**（本卷不定义通知渠道）。

**与会议/任务的关系**：`schedule.refs` 引用 `vmu.meetings.*` 的会议与 `tasks` 任务，**不重复定义**会议/任务的字段与门槛；日程只回答"什么时候"，不回答"怎么开、谁有票"。跨卷引用只读；删除被引用对象时，日程引用进入悬空状态（`VMU_REF_DANGLING`）并保留（与 §4.11 同规）。

**四条哲学关系**：自由度（可完全不启用日程轨）／可调控（时区、DST 策略、触发器开关、提醒 vs 截止）／可定义（字段 schema 显式、纯数据定位明确）／扩展性（触发器只挂中间件，不改引擎）。
**依赖**：§4.1 对象模型、§4.11 关系、05 钩子面、21 告警面。**优先级**：P2。

## 4.13 记录面的公开 API（★ 轮 501 实测补 ✓）

> ★★★ **为什么单立一节**：★ **`kernel/records.js` 有 **8** 个公开导出，而本卷原先【一个都没有点名**]✗** ✓ —— ★★ **一个需要 0% 覆盖的接口面** ✓。★ **现在逐个点名** ✓：
> - ★ **`createRecords({ … })`** ✓ —— ★ **记录面工厂**；
> - ★ **`DECLARED_KEYS`** ✓ —— ★ **记录**声明**了哪些键**（★ 登记的权威名单 ✓）；
> - ★ **`WIRED_KEYS`** ✓ —— ★ **其中【已接线**]的键** ✓；
> - ★ **`UNWIRED_REASONS`** ✓ —— ★ **未接线键各自的**原因** ✓（★ 不是"忘了"，而是逐条有理由 ✓）；
> - ★ **`EXTRA_WIRED_KEYS`** ✓ —— ★ **未在 `DECLARED_KEYS` 里却被接线的键** ✓（★ 这一项存在的意义是让"多出来的"可见 ✓）；
> - ★ **`CORE_HEAD_FIELDS`** ✓ —— ★ **头部字段的核心集**（★ 与 `HEAD_FIELDS` 的区别见 §4.10 ✓）；
> - ★ **`slugify(text)`** ✓ —— ★ **稳定的短名生成**（★ 用于 id 与路径 ✓）；
> - ★ **`chunkBody(text, …)`** ✓ —— ★ **正文分块**（★ 与 `bodyCapBytes`／截断计数配套 ✓）。
> ★★ **由 `tests/audit-doc-api-coverage.test.mjs` 守着**：★ **本节点名的每个名字都必须在 `records.js` 里真的导出** ✓，★ **且 `records.js` 的每个非样板导出都必须被本卷点到** ✓。

## 5. 公开 vs 内部

- **公开面**：对象模型与头部字段契约、可见性规则、导出包结构、错误码族与处置建议、可调控参数家族。
- **内部面**：索引物理结构、分片边界、锁实现、临时文件命名、fsync 粒度、GC 扫描算法。
- **判定规则**：**凡代理需要据此决策的信息都属公开面**；只影响性能与实现的属内部面。边界变更视同接口变更，走第 13 卷的迁移流程。

## 6. 门禁（本篇的验收判据）

> 本节判据均为**可断言**项：每条都能写成一条**断言**；违反即有对应门禁**红**；下面各条同时是评审用的**场景**清单。
> 任何一条的失败都必须给出**具名**理由（泛化提示不算通过）。

1. **原子性**：注入"中途失败"后目标文件只能是旧内容或新内容，不存在第三种状态。
2. **拒绝优先**：坏 JSON、缺字段、版本过高三类输入必须**显式拒绝并给可行动提示**。
3. **截断计数**：正文超限提示必须含**被截断量**。
4. **身份不变**：分层、压缩、打包、迁移都不得改变 id 与指纹。
5. **边界固定**：越界路径（相对逃逸、符号链接外指）必须被拒，且拒绝信息不含敏感绝对路径。
6. **审计不静默**：审计/台账写入失败必须产生可见告警。
7. **索引非真相源**：索引被删或损坏后，对象仍可被完整列出（可慢，不可丢）。
8. **可调控性**：每个参数家族至少有一个开关能**完全不启用**该机制，且不启用时系统仍可运行。

## 7. 未核项

> 未核项编号登记见 **14-§2**（U 编号）；本节条目在 14 卷按 U 编号统一跟踪，本卷只记现象与待定问题。

- [ ] 指纹算法族的**默认选择**与换算法迁移路径未定稿（本卷只要求"算法与长度随指纹记录"）。
- [ ] "永久保留"与配额上限冲突时的**优先级**未定（建议：永久保留优先，配额告警不自动删除）。
- [ ] 打包格式（tar/zip）与清单契约的**最小必填字段集**未定。
- [ ] 远端后端的**离线与冲突语义**未定（本卷只声明"不得成为唯一真相源"）。
- [ ] 加密启用后的**密钥丢失处置**未定（只要求"明确不可恢复"提示）。
- [ ] 多工作区跨区去重的**默认开关**未定。

## 8. 可调控参数家族（通配总表）

`vmu.store.*`、`vmu.store.remote.*`、`vmu.store.lock.*`、`vmu.migration.*`、`vmu.work.*`、`vmu.records.*`、`vmu.records.retention.*`、`vmu.records.trash.*`、`vmu.records.history.*`、`vmu.records.chunk.*`、`vmu.records.external.*`、`vmu.records.head.*`、`vmu.records.body.*`、`vmu.records.naming.*`、`vmu.fingerprint.*`、`vmu.dedupe.*`、`vmu.tier.*`、`vmu.index.*`、`vmu.search.*`、`vmu.tags.*`、`vmu.refs.*`、`vmu.citations.*`、`vmu.metadata.*`、`vmu.provenance.*`、`vmu.audit.*`、`vmu.export.*`、`vmu.import.*`、`vmu.archive.package.*`、`vmu.visibility.*`、`vmu.crypto.*`、`vmu.quota.*`、`vmu.prune.*`、`vmu.workspace.*`、`vmu.paths.*`、`vmu.naming.*`。

## 9. 错误码族（正文只用到族名；具体码由登记表维护）

`VMU_STORE_*`、`VMU_STORE_MIGRATION`、`VMU_STORE_REMOTE_*`、`VMU_STORE_VERSION_*`、`VMU_WRITE_*`、`VMU_LOCK_*`、`VMU_CONFLICT_*`、`VMU_WORK_*`、`VMU_RECOVER_*`、`VMU_LIB_*`、`VMU_NAME_*`、`VMU_NAME_CONFLICT`、`VMU_FP_*`、`VMU_DEDUPE_*`、`VMU_HISTORY_*`、`VMU_RETENTION_*`、`VMU_TRASH_*`、`VMU_PACK_*`、`VMU_CHUNK_*`、`VMU_EXTERNAL_*`、`VMU_TIER_*`、`VMU_INDEX_*`、`VMU_SEARCH_*`、`VMU_TAG_*`、`VMU_REF_*`、`VMU_CITE_*`、`VMU_META_*`、`VMU_PROV_*`、`VMU_AUDIT_*`、`VMU_EXPORT_*`、`VMU_IMPORT_*`、`VMU_ARCHIVE_*`、`VMU_VISIBILITY_*`、`VMU_CRYPTO_*`、`VMU_QUOTA_*`、`VMU_GC_*`、`VMU_WORKSPACE_*`、`VMU_PATH_*`、`VMU_HEAD_*`、`VMU_BODY_*`。

## 10. 四条哲学关系（本卷总述）

- **自由度**：后端、指纹算法、去重、保留、分层、导出格式、加密、配额动作**全部可选且可关闭**。
- **可调控性**：每族参数按"阈值＋动作＋例外"三件套设计，行为可预测。
- **可定义性**：对象头部、清单、元数据 schema、错误码族构成**显式契约**，读者无需读实现。
- **扩展性**：新增分类、算法、后端、格式、引用类型都只**添加**适配器或规则，不改引擎主路径。

## 11. 优先级分期（P0–P3）

- **P0（已实现，须锁死）**：Store 端口与状态版本、原子写与并发冲突、工作台账、对象模型与头部契约、头部列表与按需展开、正文上限与截断计数、路径逃逸防护。
- **P1（收益最直接）**：指纹算法记录规范、保留策略、软删除与回收站、回退流程、索引与重建自愈、全文检索、交叉引用与反链、引文与元数据校验、溯源与审计、导出导入、命名冲突策略。
- **P2（容量与长期保存）**：打包压缩、大文件分片、外部大对象引用、冷热分层、标签体系、长期保存包、可见性、配额、GC 与孤儿检测、多工作区与共享区。
- **P3（可选增强）**：远端后端、加密与签名（含密钥丢失处置）等。

## 12. 未实现项标记（速览）

以下条目**均为计划/未实现**，正文对应条目已标 ✗：远端后端（roadmap）、去重、对象历史、保留策略、软删除与回收站、回退流程、打包压缩、大文件分片、外部大对象引用、冷热分层、索引与全文检索、标签、反链索引、引文、元数据校验、溯源、审计日志、导出导入、长期保存包、可见性、加密、配额、GC、多工作区、命名冲突策略。
（**已实现**：Store 端口与状态版本、工作台账、原子写、对象模型与头部契约、头部列表、正文上限与截断计数、引用校验、路径边界约束。）

## 13. 判定留痕

- **[范围·证据面]** 本卷"已实现"依据：`kernel/store.js`（Store 端口／`STATE_VERSION`／`PUBLIC_KEYS`）、`kernel/work.js`（工作台账）、`kernel/library.js`（`KINDS`／`HEAD_FIELDS`／`BODY_CAP_BYTES`／`createLibrary`）。其余为计划，已在"成熟度"与 §12 标记 ✗。
- **[键名·范围]** 正文只出现参数**家族通配**；具体键名不在本卷固化，随回报交登记表。
- **[保留·原稿]** 原稿的 Store 接口形状、四条实现纪律、版本/迁移/回退表、公开 vs 内部、门禁与未核项**全部保留**（本卷为其扩充版）。

## 14. 会话级恢复与"id 不复用"（Round 2 落地 ✓，task-10）

> **为什么单列**：Round 2 实测 —— `kernel/store.js:32-50` 的 12 个白名单键里**只有 `work` 与 `idempotency` 有写者＋读者**，其余 10 个零读写 ⇒ **重启即丢名册/任务/会议/表决/预算**；且内核约 **30 处**从模块级 `let seq = 0` 铸 id 而**从不从任何投影恢复** ⇒ 重启后 **id 会被复用**（v5r 的不变量是 "names are immortal"）。

**落地面（file:line）**
- `kernel/resume.js` —— 恢复**引擎/原语**（`createResume`）：读 fold、写前必读闸、投影快照/水合、回读校验、id 计数器台账、`interrupted` 命名与 outcome 守卫。
- `kernel/ids.js` —— **唯一 id 铸造原语**：`mint(kind, prefix)`／`observe(kind, ids)`／`hydrate()`／`flush()`／`status()`（模块级单例 `bindIds`）。
- `kernel/tasks.js` / `kernel/members.js` —— 各加一对 `snapshot()`/`restore(snap)`；**会议/表决/纪要五面（`meeting.js`／`meetings.js`／`ballot.js`／`ballotbox.js`／`minutes.js`）＋ `chat.js`／`panel.js` 已由 v5r-reader-c 按同一形状加 seam** ✓，并统一 `import { CODE as RESUME_CODE } from './resume.js'`（三个共享码**单源**，不写字面量）。
- `kernel/human.js` —— **审批队列与否决台账的耐久 seam**（Round 3 / task-18 A）：`snapshot()`/`restore(snap)`（含 `gateIndex` 重建、`seq` 取 max+1、`pendingReason` 保留），经装配期 `resume.attachProjection({target:human, key:'human', mode:'state', …})` 落 **`human`** 键；`kernel/control.js`（`tune`、暂停/恢复留痕、`approval` 缝）。
- **F18 · 恢复＝独占段（Round 4）**：`createResume({lock})` 接受仓库自己的锁原语（`kernel/storepolicy.js:138` `acquire`／`:168` `release`）；`recover()` 在 `try` 前取锁、**在 `finally` 释放**（成功／早返回"无 store"／任何抛错三条路径都释放），第二个并发恢复 ⇒ 具名拒 **`VMU_RESUME_BUSY`**；`vmu.store.lock` 未声明时是零机制透传（`locked:false`，仍走 `finally`）。`status().lock` 自曝 `attached/held/acquisitions/releases/busyRefusals/lastError`。
- **F51 · 重启标记（Round 4）**：`status().restart`／`resume.restart()` = `{generation, restarted, at, reason, interrupted, unhydrated, readBack, phase}`，**从耐久 `resume` 键的 `recoveries[]` 派生** ⇒ "这个进程是同一机构第 N 代续跑、以及重启付出了什么代价"是**耐久事实**，不是会话内存。相邻标记：`work`（在途＋`interruptedReason`，= v5r 的 `pendingWork`）、`ids` 计数器、`human` 未批队列、Lean/mathjobs 的 `Formal/Jobs/<id>.json` 作业镜像；**v5r 的 `meetingOpen` 在 vmu 无等价物（具名缺口：需要 `meetings`/`meeting` 投影里带"已开未收束"标记）**；`kernel/activity.js` 的 generation 是**一次性等待器**的（本该会话内），**有意不持久**。
- **一处更正（Round 4）**：`kernel/budget.js` 的公共 `snapshot()/restore(snap,{replace})` 已就位（内部格式化器改名 `viewOf`），只投影**已花费**，声明（totals/reserveRatio…）由 settings 重解析 ⇒ Round 3 记的"无 seam"缺口**闭合**。
- **不用挂／不能挂（具名）**：`kernel/mailbox.js` **自持久**（构造时拿 `store` 写自己的 `mailbox` 键，另有 `snapshot()/restore(snap)`）⇒ 无需投影行；`kernel/meeting.js`／`kernel/ballot.js` 是**每实例工厂**（`kernel/index.js:1287/1301`）⇒ **单例投影不适用**（会把"最后一场/最后一张"当全部），要跨重启挂单例 `meetings`／`ballotbox`，多实例需注册表（未做，具名）。
- **`phase` 由引擎拥有**：`resume.setPhase(value,{why})`／`resume.phase()` 经写前必读闸写 `phase` 键；**装配侧仍需在相位变化点各接一行**（未接 ⇒ 空投影、`present:false`，不报错、不假装）。
- 装配（`registry`／`TOOL_FACES`／settings 键／白名单键／`RESUME_PROJECTION_ADAPTERS`）由 vmu-core 落（`kernel/index.js:740-796`）。

**四条硬不变量（每条都有唯一点）**
1. **写前必读**：未成功读过当前 fold 就写 ⇒ **`VMU_RESUME_WRITE_BEFORE_READ`**（`resume.js` 的 `requireRead`，`write`/`patch` 两条写路径共用）。＝ v5r `V5_STATE_NOT_LOADED` 的等价物。
2. **id 不复用**：`mint` 取 `max(耐久计数, 已观测最大后缀, 进程内计数)+1`；未绑定 store ⇒ 仍进程内唯一但 `status().durable=false` **具名**（不假装）。**恢复时以"投影里真实存在的最大 id"为下限**，因此即使计数器写穿丢了几次也不会复用。
3. **interrupted 具名、passed 不白给**：`work` 台账启动后把幸存项标 `interrupted`＋具名理由（`kernel/work.js:135`）；`resume.settleOutcome({outcome:'passed'})` 对这类 id **具名拒** `VMU_RESUME_INTERRUPTED_NOT_PASSED`，只有 **显式＋带理由** 的覆盖才放行。
4. **不假装恢复**：`hydrate()` 对"没有 adapter / 没有 restore seam / journal 有洞或被裁头 / 含有不可重放命令 / **面自己返回 `{ok:false}`（版本·冲突·缺集合）**"的键**具名上报**（`VMU_RESUME_NO_ADAPTER` / `VMU_RESUME_PROJECTION_GAP` / 面自己的 `RESUME_CODE`）并让 `status().projection.degraded=true`。**"重启后空名册"与"真的恢复了"必须可区分**。

**恢复十步**（`RECOVERY_STEPS`，与 v5r `resume()` 对齐但**只给原语、不内置策略**）：`read`（折入 fold）→ `roster`（名册/identity 缝）→ `inflight`（标记中断）→ `ledgers`（水合投影）→ `mailbox`（未 ack 计数，端口缺席即具名）→ `watchdogs`（刷新陈旧看门狗，端口缺席即具名）→ `flags`（暂停面等运行事实）→ `readback`（写后回读，漂移具名 `VMU_RESUME_READBACK_DRIFT`）→ `outcome`（中断不得变 passed）。

**两套投影形态 + 代价（具名，不静默）**
- `mode:'state'`：`snapshot()` 纯状态、`restore(snap)` 放回。**声明（settings/pack 解析出来的东西：slots、budget totals…）不进快照** —— 否则旧声明会覆盖新配置。**状态型投影默认写穿**：`attachProjection({…, mode:'state', snapshot, restore})` 会给每个被包方法的返回挂一次快照写入（`vmu.resume.writeThrough`，默认 `true`；失败进 `resume/projection-error` 并计数 `writeThroughFailures`）。**没有写穿 ⇒ "可水合但从未写"的投影只是看起来持久**，这一点由 Round 3 的写穿断言钉住。
- `mode:'journal'`：`attachProjection({target,methods,key,mode:'journal',list})` 包住面的**变异方法**逐个记录命令，水合时**经面自己的公开方法重放** ⇒ 面的 `seq` 自然推进到历史最大值（这正是 tasks 类面恢复 id 的方式）。**代价**：重放的是**命令**，依赖被重放方法的确定性；`nonReplayable:[…]` 里的命令一旦出现，水合**具名拒**而不是静默少一条；参数无法 JSON 序列化时同样具名拒。**回放抛错**也被 `hydrate()` 捕获并**具名**（该键进 `unhydrated[]`，其余键继续恢复）——一个坏适配器不得中断整次恢复，更不得留下"半重建"的面冒充已恢复。
- **面侧快照契约**（`kernel/resume.js` 的 `checkSnapshot` 是唯一校验器）：
  `snapshot() -> { apiVersion:1, face:'<面名>', v:1, at:<注入 clock>, data:{…}, counters:{<kind>:<最后用过的号>}, skipped:[{what,why}] }`；
  `restore(snap, opts?) -> { ok, restored:[…], skipped:[{what,why}], counters:{…} }`（**幂等**；无法安全合并 ⇒ `VMU_RESUME_RESTORE_CONFLICT`；版本不符 ⇒ `VMU_RESUME_SNAPSHOT_VERSION`；缺集合 ⇒ `VMU_RESUME_SNAPSHOT_INCOMPLETE`）；
  **宿主接缝（deliver/wake/bus/clock/timer/spawn/fetch）不算 `skipped`** —— 它们由内核重新注入。

**耐久键**：新增 `resume`（恢复记录＋计数器＋journal 索引）、`ids`（id 计数器）与 **`human`**（审批队列＋否决台账，Round 3）；投影复用既有 `members/tasks/meetings/ballots/budget/phase/work`（`chat`／`panel` 已在 `PROJECTION_KEYS` 声明域内，seam 已由 reader-c 落地、**装配适配器待接**）。**未登记的键由 `store.patch` 具名拒**（round 1 的 `idempotency` 就是这么静默降级的）。

**逐模块耐久状态**（完整表＋理由见 `_handoff/vmu/resume-round4-report.md`）：`work`/`idempotency` **真持久**；`tasks`（journal）／`members`／`human`（state + 写穿）**已接**；`budget` **本轮补齐公共 seam ✓（可挂）**；`meetings/ballots/ballotbox/minutes/chat/panel` **面侧 seam 已就绪 ✓，装配适配器待 vmu-core 补**（`status().projection.unhydrated[]` 会具名）；`meeting`/`ballot` **每实例工厂 ⇒ 单例投影不适用（具名结论）**；`mailbox` **自持久（无需投影）**；`phase` **引擎可写、装配侧调用待接**；**任何未水合的面在 `resume.status()` 里以 `unhydrated[]` 具名出现**，**不写成"已恢复"**。

**验收**：`tests/vmu-resume-recovery.test.mjs` **73 passed / 0 failed**（exit 0）；`tests/vmu-human-gate.test.mjs` **67 passed / 0 failed**（exit 0）；`tests/vmu-resume-lock-and-marks.test.mjs` **39 passed / 0 failed**（exit 0，F18 全分支 finally＋F51 标记＋faces 结论）。

## 15. 判定留痕（Round 2／Round 3／Round 4）

- **[实现·证据面]** `kernel/resume.js`、`kernel/ids.js`、`kernel/tasks.js`（`snapshot`/`restore`）、`kernel/members.js`、`kernel/budget.js`（Round 4 公共 seam）、`kernel/human.js`（gate／耐久 seam）、`kernel/control.js`（tune/approval）、`tools/human.js`。
- **[诚实边界]** `mode:'journal'` 的**重放依赖确定性**且对不可重放命令具名拒；此限制**不接受**"看起来恢复了"的替代说法。
- **[键名]** 白名单键名为 `resume`／`ids`／`human`（＋reader-c 的 `chat`／`panel`／`mailbox`）；投影键见 `PROJECTION_KEYS`。
- **[Round 3 更正]** Round 2 报告曾把 `kernel/budget.js` 写成"已加 seam"——实测该文件当时没有公共 `snapshot()/restore()`（内部格式化器同名）。
- **[Round 4 闭合]** 该缺口**已实现**（内部 `snapshot(s)`→`viewOf(s)`，公共 seam 就位），并在 `tests/vmu-resume-lock-and-marks.test.mjs` 里跨"进程"断言"重启后记住 45/100 tokens 已花"。
- **[Round 4 F18/F51]** 锁的真实使用者＝`recover()`（`finally` 全分支释放，含抛错路径，用仓库自己的 `createStorePolicy` 断言）；重启标记＝`status().restart`（耐久派生）。`kernel/scheduler.js` 的 F15/F16（句柄释放＋trampoline）为中断前半成品，**已复核完整**（`vmu-scheduler` 111/0）。
- **[Round 5 F35/F39 · 与恢复的关系]** 任务板的两条图保证**在持久化面同样成立**：① **DAG**——每条依赖边的写入（`create()` 的 `deps` 与 `setDependencies()`）都过环检测，具名拒 `VMU_TASK_DEPENDENCY_CYCLE` 并回**环路径**；因此 `restore()` 出来的板**不可能含环**（旧文件若含环只能来自绕过本面直写 store，属**具名**越界写法）。② **写域 advisory**——`writeScopes` 是任务对象的一部分，`tasks.snapshot()`/`restore()` 自动携带，且**永不阻断** claim/transition，只在 `status().writeScopeConflicts` 与 `list()` 行里报重叠。③ 新增只读诊断：`tasks.status().dag` / `.writeScopes` / `.writeScopeConflicts`（`tests/vmu-tasks-dag-and-scopes.test.mjs` 41/0）。
- **[Round 6 · 目标 1 终判]** 恢复面新增两个**只读视图**与一个端口（详见 `_handoff/vmu/06-goal1-verdict.md`）：① `status().inflight`＝**v5r `pendingWork` 的等价物**（重启**找到**什么/它**结束**了什么/还**剩**什么）；② `status().ports`＝哪些恢复端口真的接了（`store/work/control/identity/lock/mailbox/watchdogs/children/roster`，避免服务描述"声称有"）；③ **`roster` 端口**（`members.roster()` 是唯一带 `childId` 的名册源；`identity.list()` 不带 ⇒ 子代对账会空转，`rosterSource` 具名这一点）。**具名缺口**：未 ack 邮件计数需 `mailbox` 端口（`kernel/mailbox.js` 一行 `pendingAll()`）；看门狗刷新技术上 N/A（vmu 无持久在飞时钟）；每实例 face 的多实例注册表未做。`tests/vmu-resume-lock-and-marks.test.mjs` **54/0**。
- **[Round 7 · 收尾两项已闭合]** ① **未 ack 邮件计数不再需要新接口**：邮件面**自持久**（`kernel/mailbox.js:452-462` 写自己的 `mailbox` 键，`ack()` 在 `:363` 把条目**从 boxes 摘除**）⇒ 恢复时**直接读该耐久键**即可得到"仍未 ack 的条数"，两种存储形状（裸面快照／state 投影信封）都接受；计数进 `status().inflight.unackedMail`（＋`unackedMailSource`），`steps.mailbox.source='durable-mailbox-key'`，无端口无键 ⇒ 仍具名 `VMU_RESUME_MAILBOX_UNAVAILABLE`（**null，不是假 0**）。② **重派缺失成员＝可声明的装配策略**：`createResume({ reassign: { maxAttempts, apply } })`；引擎**只把 `missingChildren` 交给声明的 `apply`**，把**尝试次数耐久**记进 `resume` 键，达 `maxAttempts` ⇒ 该成员标 `exhausted`（**崩溃循环不可能无限重派**）；`status().reassign` / `reassignAttempts` / `restart.reassigned|reassignExhausted` 可读；**不声明 ⇒ 只具名、不尝试**（零机制）。③ 看门狗 N/A **复核仍成立**：`grep lastInputAt|lastVoteAt|watchdogAt|inflightSince` 在 `kernel/*.js` **零命中**；`kernel/meetinglapse.js` 是**纯规则**（无钟无 store），lapse 记录 `{name,why,at,revocable}` 由 `meetings.js` 存、**失败朝关闭方向**且可 `revokeLapse`（具理由）⇒ vmu 不需要 v5r 式"把时钟往后刷"；若某部署要"重启后给在飞对象宽限"，用 `watchdogs.targets()/touch()` 端口表达（装配侧）。`tests/vmu-resume-lock-and-marks.test.mjs` **67/0**。

## 16. 记录之后重启：三条 Round 8 实测规则（task-62 端到端钻取）

> 三条都是**端到端钻取跑出来的**（`tests/vmu-resume-e2e.test.mjs`，**63/0, exit 0**）：在真 `createStore`（单文件 `<root>/vmu/state.json`）上连开三次"进程"，把恢复与人工干预放进同一个场景。三条规则修改前**都真的错**，且都只在"**重启后继续写**"这条路上才暴露。钻取另含 **G7 正对照**（把 mailbox 绑到**真的** `createDurableCommitLog`，协议来自 `kernel/ballot.js`）：**绑定提交日志不改变下面任何一条契约** —— state 面照样自动写穿、journal 照旧必须显式 flush；且"提交日志 settled"与"仍有 1 封未读"可以**同时为真** ⇒ "提交耐久 ≠ 投递/正文状态耐久"有了可执行证据（钻取 `9a`–`9k`）。

1. **journal 的序列必须从【已采纳的 seq】续接**（`kernel/resume.js` `createProjection.record()`）。`adopt()` 只写了 `this.seq`，闭包计数器 `seq` 仍是 0 ⇒ 重启后记录的**第一条命令又从 1 开始**，与已采纳的第 1 条**撞号**；再下一次启动 `gap()` 报 `{kind:'hole',at:1,expected:3}` ⇒ **整个键被判不可重放**（`VMU_RESUME_PROJECTION_GAP`）。即"重启后哪怕只再写一条命令，也会丢掉整本 journal"。修法：`seq = Math.max(seq, this.seq) + 1`。钻取读数（boot 3）：`tasks` 行 `entries:1, skippedFailed:3`（4 条里 3 条是被拒命令）。
2. **水合顺序：先恢复 state，再重放 journal**（`hydrate()`）。重放是**把命令重新执行到活面上**（`tasks.create` 要过审批门，门要查 `human` 台账），按 attach 顺序重放 ⇒ 对着**空机构**执行历史，而副作用**写穿**，把**还没恢复的快照覆盖掉**。实测（boot 3）：journal 先挂 ⇒ 门开出一个**新**请求 `approval-1` ⇒ 写穿把耐久 `human` 台账从 3 条改成 1 条 ⇒ 随后 `human.restore()` 与"已被自己改过的"快照一致 ⇒ 报 `idempotent`（`restored:[]`，**看起来像成功**），journal 具名未水合。修法：`wanted` 中 state 键全部排在 journal 键之前（`modeOf()` 分组，组内保持原顺序）。**这是顺序语义，不是优化**："先重建世界，再重放改变世界的命令"。
3. **空的种子数组＝首跑，不是投影缺口**（`hydrate()`）。`kernel/store.js defaultKeys()` 给数组型键（`tasks`/`members`/`meetings`/`ballots`/`work`）的默认值是 `[]`；凡**同时又被挂投影**的键，在**全新 store 的第一次** `recover()` 上都会因 `adopt([])` 被拒 ⇒ `unhydrated:[...]` ⇒ `recover().ok === false`。修法：`Array.isArray(env) && env.length === 0` 按"nothing was projected (a first run)"处理（`seeded:'empty-array'` 具名）；**非空裸数组仍是具名缺口**（原注释针对的情形不变）。

**同轮的两条具名缺口（"没做"，不是"已验证"）**
- **journal 没有写穿**：`mode:'journal'` 只在**显式** `resume.snapshot({key})` 时落盘（钻取 `2i` 实测：重启前该键仍是 store 的 `[]` 种子）。⇒ 装配侧必须在**优雅退出**路径逐个 flush；`kernel/index.js` 目前**没有**这一步（`grep resume.snapshot` 在装配里零命中，只有 `resume.js` 自身与测试在用）。state 面则每次包裹方法调用后自动写穿：钻取 `2f` 断言 `writesThrough >= 5` 且 `writeThroughFailures === 0`，`2g/2h` 直接在 fold 里看到 `human`/`mailbox` 的 state 信封**且未调用过任何 `snapshot()`**。
- **写穿是异步的**：`store.patch` 是真的文件 I/O ⇒ 同一 tick 里"重启"会读到旧文件。钻取用 `settle()`（等 `writesThrough + writeThroughFailures` 达到已发起条数）把"进程退出"**明确做出来**，而不是 sleep 一个假时长。
- 附：审批门的顺序是 **gate 先于 pause**（钻取 `1f`）：暂停期间的动作尝试被门具名拒 `VMU_HUMAN_APPROVAL_PENDING`，并**顺带开出一个请求**（`2c` 的 `pending=2`）。这是**实测行为**；若产品上要"暂停优先"，那是 human 面的取舍，不是恢复面的。

**证据**：`node tests/vmu-resume-e2e.test.mjs` ⇒ `=== VMU GOAL1 E2E: 63 passed, 0 failed ===`，exit 0（逐条读数见 `_handoff/vmu/12-goal1-e2e.md`）；回归面 exit 0：`vmu-resume-recovery` 73/0、`vmu-resume-lock-and-marks` 67/0、`vmu-resume-falsify` 9/0、`vmu-human-gate` 75/0、`vmu-human-falsify` 12/0、`vmu-replay` 66/0、`vmu-kernel` 175/0、`vmu-entry` 150/0、`vmu-work` 19/0、`vmu-scheduler` 111/0、`vmu-tasks*` 92/0、`vmu-store` 27/0、`vmu-stateversion` 16/0、`vmu-storepolicy` 11/0、`vmu-storepolicy-falsify` 9/0、`vmu-round1-seams` 40/0、`vmu-round2-seams` 12/0、`vmu-projmigrate` 107/0、`vmu-activity-kernel` 141/0、`vmu-turn-contracts` 12/0、`vmu-tools-await-rejections` 114/0（命令与退出码见 `_handoff/vmu/resume-round8-report.md`）。

## 17. 退出契约与"声明≠有人写"：Round 9 的两条实测（task-70）

> 两条都在钻取里**真跑**（Round 9 后：`tests/vmu-resume-e2e.test.mjs` ⇒ **81/0, exit 0**；逐条读数见 `_handoff/vmu/12-goal1-e2e.md` §2.3／§2.4）。

**① 退出＝两半边，各自可断言、失败不 throw**（引擎原语，装配接线由 core 的 `kernel/index.js shutdown()` 调用）：
- **模块边界（Round 9 拆分）**：退出契约的实现在 **`kernel/resumeflush.js`**（`createExitContract({...})`）；值标识原语（`stableStringify`/`contentDigest`/`clone`/`idSuffix`）在 **`kernel/contentvalue.js`**。边界是**单向**的：`resume.js` 拥有**投影**（哪些键、什么模式、何时记录、写穿注册、读前写闩、耐久的 `snapshot({key})`），退出模块只拥有**"干净退出"的语义**（排空×flush、`ok` 取 AND、失败只回报不抛）；它拿到的是**活视图**（同一个 `pendingWrites` Set、计数器、读门、码表），所以"哪些键存在"改在 resume.js，"干净退出是什么意思"改在 resumeflush.js。拆完后 `resume.js` 1267 → **1179** 行（`audit-code-size` **9/0**，`KNOWN` 仍是 3 条、未新增名字），公开面不变（`contentDigest`/`idSuffix` 由 resume.js **再导出**）。
- `recovery.settle()`：排空"本引擎发起过"的**写穿 promise**（在 `attachProjectionTo` 里**同步注册** ⇒ `status().pendingWrites` 同一 tick 即真相）。一次 `await` 之后"已耐久"是**事实**，不需要 sleep／轮询；`writeThroughFailures > 0` ⇒ `ok:false`。时钟不可解释 ⇒ `msStrict` 具名、`waitedMs:null`＋`clockNote`，**绝不传播 `NaN`**（RULE F）。
- `recovery.flushAll()`：只刷 `mode==='journal'`；**state 键进 `skipped[]` 并具名"it is already durable and needs no flush"**；**没有 store 端口 ⇒ `ok:true` ＋ 具名 skip**（"the seam is absent, not pretended"，与 `createDurableCommitLog` 同款）；**未 read ⇒ `ok:false` ＋ `failed:[{key:null, code:'VMU_RESUME_WRITE_BEFORE_READ'}]`，不 throw**（退出路径在宿主 dispose 上，抛出去更容易被吞）。
- `recovery.exit({reason})`：`ok === (writeThrough.ok && journal.ok)` —— **不是"至少一半成功"**。钻取断言：**另一个 store 实例（下一位读者）能在文件里看到已 flush 的 journal**（`10i`），且 `settle()` 之后 journal **仍**是种子（`10g`：settle ≠ flush）。

**② 集合面就是多实例注册表；缺的是装配的【方法列表】**：
- 事实：`kernel/index.js` 的 `methodsOf` 只列了 `tasks`，其余声明为投影的面拿到的是 `[]`；而写穿 `after` **只在被包裹的方法里**被调用 ⇒ `members/meetings/ballotbox/budget/chat/panel/minutes` **声明为投影却从未被写过**（钻取 `11c`：开两个会、`settle()` 之后 `meetings` 键仍是 store 的 `[]` 种子）。
- **退出 flush 救不了它**：state 键按契约进 `skipped[]`（`11d`）⇒ "退出 flush 已落地" ≠ "这些面耐久"。
- **修法（证据在 `11e`/`11f`）**：同一面、同一套接缝，**只把方法列表填上**（如 `['open','close','attend','motion']`）⇒ 写穿落地、重启后**两个会一起回来**。⇒ Round 6 的"多实例注册表未做"**改判**：机制不需要（集合面 `meetings`/`ballotbox` 自带 `snapshot()/restore()`），缺的是 `methodsOf` 的条目。
- 观察形态：`11c`/`11d` 是**自适应探针**（修好后同一次 boot 自动翻成 "CLOSED: …now DOES write through"），所以修复不会留下一条误导的红。

---

# 附录 A · 归档基础设施（可照抄规格）

> 本附录把 §4 的条目展开到**可照抄**程度：字段清单、目录约定、决策树、模板。参数用**通配**（`vmu.<族>.*`）；叶子键的具体名由登记表维护。

## A1. 归档对象字段清单

**头部（常驻列表；必须稳定）**：`id`、`kind`、`title`、`slug`、`fingerprint`＋`fingerprintAlgo`＋`fingerprintLen`、`status`、`owner`、`createdAt`、`updatedAt`、`revision`、`visibility`、`tags[]`、`refsOut[]`、`refsIn[]`、`bodyBytes`、`bodyTruncated`。
**可选（出现则必须符合 schema）**：`summary`、`lang`、`license`、`provenanceRef`、`externalBlobRef`、`citationKey`、`packOrigin`、`migratedFrom`、`retentionClass`、`checksum`、`encryptionRef`。
**内部（不进公开面）**：分片表、索引位置、临时命名、锁占据信息、GC 标记、热度计数。

**规则**：① 头部字段**只增不换语义**；改名走"新字段＋别名层"；② 列表字段集由 `vmu.records.head.*` 裁剪，但 `id/kind/fingerprint(revision)` **永不裁剪**（否则代理无法引用）；③ `bodyTruncated=true` 时**必须**同时给出被截断量。

## A2. 分类（kind）基线与扩展

**已实现基线（✓）**：命题（Propos）、方法（Methods）、子问题（Subproblems）等（`KINDS`）。
**建议扩展（✗，需登记）**：文献条目（references）、数据与脚本（data/scripts）、复现包（reproduction packages）、会议纪要（minutes）、决议（resolutions）、评审意见（reviews）、外部引用（external refs）、环境说明（environment manifests）。
**规则**：每个 kind 必须声明①必填字段集、②允许的引用类型、③默认可见性；新 kind 的引入**不改引擎主路径**（扩展性硬要求）；kind 重命名走别名层（13-§8）。

## A3. 目录与分轨（track）约定

- 在**工作区根**下按**轨**划分：正式产出轨、附件轨、外部引用轨、回收站轨、索引轨、审计轨。
- 每轨一个根目录；轨内按 kind 分目录；**对象目录名＝稳定 id（不是 slug）**。
- **内容寻址**：去重启用时，正文可落到按指纹前若干位分桶的目录（桶深度由 `vmu.dedupe.*` 配置）。
- **命名**：目录与文件只用 `[a-z0-9._-]`；CJK 策略由 `vmu.records.naming.*` 决定。
- **边界**：任何路径**解析后**必须仍在工作区根内；符号链接与 `..` 在解析后校验（`vmu.paths.*`）。
- **跨区**：共享区是**显式挂载**，不是"上级目录"；跨区引用在头部带轨标记。

## A4. 指纹与去重决策树（照抄）

```
写入请求
├─ 计算指纹（算法/长度来自 vmu.fingerprint.*；算法与长度随指纹记录）
├─ 已存在同指纹？
│   ├─ 否 ⇒ 落新物理对象，写头部（fingerprint + revision=1）
│   └─ 是 ⇒ 去重启用？（vmu.dedupe.*）
│        ├─ 否 ⇒ 落新物理对象（两条身份；仅记"内容相同"提示）
│        └─ 是 ⇒ 归并为同一物理对象 + 引用计数 +1
│             ├─ retentionClass=permanent ⇒ 永不进入回收候选
│             └─ 否则按保留策略进入候选
└─ 任一步失败 ⇒ 不留半份（原子写）；返回具名错误 + 建议动作
```

## A5. 引文与元数据 schema 骨架（照抄）

**引文条目（必填）**：类型（article/book/preprint/web）、标题、作者集（有序）、年份、出处（期刊/会议/仓库）、标识符（DOI／arXiv／PMID／URL 至少其一）。**标识符缺失时不得编造** ⇒ 记 `unidentified: true` 并在导出时列出。
**引文条目（可选）**：卷期页、出版社、版本、访问日期、语言、许可、备注、与被引对象关系（支撑／对比／反驳）。
**正文引用点**：位置（段落/行范围）、引用键、引用类型（直接引语／转述／数据来源）。
**导出**：BibTeX／CSL 风格（样式来自 `vmu.citations.*`）；支持"只带条目不带正文"。
**校验**：导出前检查"引用键唯一"与"每条引用点可解析"；不可解析者**列清单**，不静默丢弃。

## A6. 复现包模板（照抄）

```
<package-root>/
  00-README.md         # 自述：是什么、怎么复现、缺什么
  01-manifest.json     # 文件清单 + 每项指纹(算法+长度) + 字节数
  02-environment.md    # 运行环境说明（可含版本号；不含密钥）
  03-inputs/           # 输入（或被引用外部对象的引用条目）
  04-code/             # 脚本/代码
  05-outputs/          # 产物 + 期望校验值
  06-citations/        # 引文条目（BibTeX/CSL）
  07-provenance.md     # 溯源时间线（append-only 摘要）
  08-limitations.md    # 已知限制与未覆盖项
```
**规则**：① `01-manifest.json` 是契约，缺项即包不完整；② 包必须**自述**（不依赖本系统即可读懂）；③ 缺文件必须显式登记，不得静默省略；④ 包内**不得**含密钥、绝对路径、会话日志。

## A7. 保留、配额与 GC 决策树（照抄）

```
retentionClass=permanent？
├─ 是 ⇒ 永不进入 GC 候选；配额告警只报告（不自动删）
└─ 否 ⇒ 引用计数 > 0？
     ├─ 是 ⇒ 保留
     └─ 否 ⇒ 在回收站轨？
          ├─ 在且未过期 ⇒ 保留（等待恢复或到期）
          ├─ 在且已过期 ⇒ 进入 GC 候选
          └─ 从未入回收站（孤儿）⇒ 宽限期内保留；到期后进入候选
GC 候选 ⇒ 产出删除清单 ⇒ 显式确认（或满足自动执行前置条件）⇒ 执行 + 写审计
```
**硬规则**：① 默认**只报告不执行**；② 自动执行须同时满足"宽限期已过＋不在豁免清单＋非 permanent"；③ 任何删除都必须能在审计轨查到"谁／何时／依据什么规则"。

## A8. 对象运维清单（照抄）

1. **新增**：头部必有 `id/kind/fingerprint(+算法+长度)/revision`；正文超限必须带截断计数。
2. **修改**：产新 revision；旧 revision 按保留策略处理；**id 与指纹语义不变**。
3. **删除**：先入回收站；彻底清除是**显式动作**＋审计条目。
4. **迁移**：记 `migratedFrom`；迁移前后指纹不一致时**必须给出解释**（如算法升级）。
5. **导出**：按可见性裁剪；清单含指纹；外部引用标注"不可自足"。
6. **导入**：先预览（新增／覆盖／跳过）；**默认不覆盖**；冲突走具名错误。

## A9. 与 13 卷的接口（迁移相关归档动作）

- **Store 版本迁移**：归档层先产出**回退点**再接受迁移；迁移后跑投影校验（结构＋引用完整性）。
- **指纹算法升级**：属**破坏性**动作 ⇒ 走 13 卷 dry-run＋差异报告（报告含"因算法升级而变化的指纹条目数"）。
- **kind／字段改名**：一律经别名层（13-§8），并保证旧对象**仍可读**。
- **pack 迁移**：归档层不感知 pack；若 pack 声明自定义 kind，须在兼容矩阵（13-§9）登记。
---

# 附录 C · 叶子键明细表 与 码表

> 本附录给出**具体叶子键**（不再是通配）与其默认/域/权限，以及**具体错误码**。登记（`settings/schema.js`、`03-§8`）由发布方统一收口；本卷只负责设计声明。
> 域：`G`＝全局、`P`＝每预设、`W`＝每工作区、`R`＝每对象。谁：`U`＝用户可改、`A`＝代理可改、`F`＝框架只读。

## C1. 叶子键明细（Store／迁移／工作台账）

| 键 | 类型 | 默认 | 域 | 谁 | 说明 |
|---|---|---|---|---|---|
| `vmu.store.backend` | enum(single/dir/remote) | `dir` | G | U | 后端选择；★ **键已接线 ✓，但 `remote` 后端【能力】未实现** ✗（`single`／`dir` 可用 ✓） |
| `vmu.store.root` | string(path) | 工作区根 | G | U | 状态根；解析后必须在工作区根内 |
| `vmu.store.fsync` | enum(none/file/dir) | `file` | G | U | 持久化语义；**内容入盘 ≠ 目录项入盘** |
| `vmu.store.tmpDir` | string(path) | `<root>/.tmp` | G | U | 原子写临时目录 |
| `vmu.store.autoBackup` | bool | `true` | G | U | 迁移前自动备份 |
| `vmu.store.onVersionTooHigh` | enum(refuse/attempt) | `refuse` | G | F | 文件版本高于代码时的处置 |
| `vmu.store.lock.timeoutMs` | int | `5000` | G | U | 锁等待上限 |
| `vmu.store.lock.retries` | int | `3` | G | U | 冲突重试次数 |
| `vmu.store.lock.backoffMs` | int | `50` | G | U | 重试退避 |
| `vmu.store.lock.serializeAll` | bool | `true` | G | U | 是否全量串行写 |
| `vmu.store.remote.url` | string | `''` | G | U | 远端地址；★ **键已接线 ✓，远端【能力】未实现** ✗ |
| `vmu.store.remote.consistency` | enum(strong/eventual) | `eventual` | G | U | 一致性策略；★ **键已接线 ✓，远端【能力】未实现** ✗ |
| `vmu.store.remote.offlinePolicy` | enum(queue/refuse) | `refuse` | G | U | 离线策略；★ **键已接线 ✓，远端【能力】未实现** ✗ |
| `vmu.migration.auto` | bool | `false` | G | U | 自动迁移开关 |
| `vmu.migration.dryRunDefault` | bool | `true` | G | U | 默认先 dry-run |
| `vmu.migration.requireConfirm` | bool | `true` | G | U | 执行前需确认 |
| `vmu.migration.keepBackups` | int | `3` | G | U | 备份保留份数 |
| `vmu.migration.stepBatch` | int | `1` | G | U | 每批步数 |
| `vmu.migration.rollbackPointDensity` | int | `1` | G | U | 每 N 步落回退点 |
| `vmu.migration.reportFormat` | enum(md/json) | `md` | G | U | 差异报告格式 |
| `vmu.work.keepEntries` | int | `200` | G | U | 台账保留条数 |
| `vmu.work.autoSettle` | bool | `true` | G | U | 崩溃后自动收尾（仅安全动作） |
| `vmu.work.pauseRule` | string | `''` | G | U | 暂停判定表达式（空＝不暂停） |

## C2. 叶子键明细（归档对象／指纹／保留／打包）

| 键 | 类型 | 默认 | 域 | 谁 | 说明 |
|---|---|---|---|---|---|
| `vmu.records.allowedKinds` | string[] | 基线集 | P | U | 允许的 kind |
| `vmu.records.headFields` | string[] | 头部集 | P | U | 列表裁剪字段（核心字段不可裁） |
| `vmu.records.bodyCapBytes` | int | `32768` | P | U | 正文上限（现 32KiB） |
| `vmu.records.expandThreshold` | int | `4096` | P | U | 超过即改按需展开 |
| `vmu.records.head.maxItems` | int | `200` | P | U | 列表条数上限 |
| `vmu.records.head.sort` | enum(updatedAt/createdAt/title) | `updatedAt` | P | U | 列表排序 |
| `vmu.records.body.noticeStyle` | enum(short/detailed) | `detailed` | P | U | 截断提示样式（必须含数量） |
| `vmu.records.body.chunkedReturn` | bool | `false` | P | U | 是否分片返回 |
| `vmu.records.naming.slugPolicy` | enum(ascii/cjk-keep) | `cjk-keep` | P | U | slug 策略 |
| `vmu.records.naming.maxLength` | int | `80` | P | U | slug 最大长度 |
| `vmu.records.naming.conflictSuffix` | string | `-2` | P | U | 冲突后缀模板 |
| `vmu.records.retention.keepEvery` | int | `10` | P | U | 每 N 版保留 |
| `vmu.records.retention.permanentMarker` | string | `permanent` | P | U | 永久标记值 |
| `vmu.records.retention.maxBytes` | int | `0` | P | U | 体积上限（0＝无限） |
| `vmu.records.retention.tierThreshold` | int | `0` | P | U | 冷热分层阈值（0＝不分层） |
| `vmu.records.trash.retainDays` | int | `30` | P | U | 回收站保留天数 |
| `vmu.records.trash.autoPurge` | bool | `false` | P | U | 自动清除 |
| `vmu.records.trash.countInQuota` | bool | `true` | P | U | 回收站是否计入配额 |
| `vmu.records.history.depth` | int | `20` | P | U | 历史深度 |
| `vmu.records.history.storeMode` | enum(full/diff) | `diff` | P | U | 全量/差异 |
| `vmu.records.chunk.thresholdBytes` | int | `1048576` | P | U | 分片阈值 |
| `vmu.records.chunk.chunkBytes` | int | `262144` | P | U | 分片大小 |
| `vmu.records.external.allowedSchemes` | string[] | `[file,http,https]` | P | U | 允许的外部引用方案 |
| `vmu.records.external.verifyExists` | bool | `true` | P | U | 是否校验存在性 |
| `vmu.records.tracks` | stringList | ['progress' | P | U | 记录分轨（负向知识有独立档）（轮 225 补登记：`records.js` 早已读取，本表此前遗漏 ✓） |
| `vmu.records.headListAt` | natural | 7 | P | U | 头部列表最多返回多少行（0＝全部）（轮 225 补登记：`records.js` 早已读取，本表此前遗漏 ✓） |
| `vmu.records.truncateMode` | enum | 'keepChars' | P | U | 截断策略（必须计数）（轮 225 补登记：`records.js` 早已读取，本表此前遗漏 ✓） |
| `vmu.records.fingerprintPolicy` | enum | 'content-only' | P | U | 内容指纹口径（轮 225 补登记：`records.js` 早已读取，本表此前遗漏 ✓） |
| `vmu.records.requireSettledRecords` | boolean | true | P | U | 只允许写入已结算记录（轮 225 补登记：`records.js` 早已读取，本表此前遗漏 ✓） |
| `vmu.records.meetingKeepEvery` | positiveInteger | 5 | P | U | 会议记录的保留间隔（轮 225 补登记：`records.js` 早已读取，本表此前遗漏 ✓） |
| `vmu.records.pointerPropagation` | boolean | true | P | U | 指针传播策略（轮 225 补登记：`records.js` 早已读取，本表此前遗漏 ✓） |
| `vmu.fingerprint.algo` | enum(sha256/sha512/blake3) | `sha256` | G | U | 算法（随指纹记录） |
| `vmu.fingerprint.truncate` | int | `0` | G | U | 截断长度（0＝全） |
| `vmu.fingerprint.includeMeta` | bool | `false` | G | U | 指纹是否含元数据 |
| `vmu.dedupe.enabled` | bool | `false` | W | U | 去重开关 |
| `vmu.dedupe.scope` | enum(full/segment) | `full` | W | U | 去重范围 |
| `vmu.dedupe.crossWorkspace` | bool | `false` | G | U | 跨区去重 |
| `vmu.pack.format` | enum(tar/zip) | `tar` | P | A | 打包格式 |
| `vmu.pack.compression` | int | `6` | P | A | 压缩级别 |
| `vmu.pack.includeBody` | bool | `true` | P | A | 是否含正文 |
| `vmu.pack.includeTrash` | bool | `false` | P | A | 是否含回收站 |

## C3. 叶子键明细（索引／检索／文献／元数据／审计／导出／配额／路径）

| 键 | 类型 | 默认 | 域 | 谁 | 说明 |
|---|---|---|---|---|---|
| `vmu.index.rebuildBatch` | int | `500` | P | U | 重建批大小 |
| `vmu.index.verifyChecksum` | bool | `true` | P | U | 索引是否校验和 |
| `vmu.index.staleTolerance` | enum(tolerate/rebuild) | `rebuild` | P | U | ★ **轮 237 更正：本键【不予实现】** ✗✓ —— **实测：本面【每次读取都从盘重建索引】（自述 never cached ✓），根本不存在过期索引** ✓ ⇒ **按原文字实现会变成【第二份机制】** ✗（**与拒绝重复的 tier／reopenFloor 同一条纪律** ✓）。**若将来引入索引缓存，本键才有意义；届时连同重建触发条件一起定义** ✓ |
| `vmu.search.analyzer` | enum(simple/cjk/bigram) | `bigram` | P | U | 分词器 |
| `vmu.search.maxResults` | int | `50` | P | U | 结果上限 |
| `vmu.search.snippetLen` | int | `200` | P | U | 片段长度 |
| `vmu.tags.controlled` | bool | `false` | P | U | 受控词汇表 |
| `vmu.tags.maxDepth` | int | `3` | P | U | 层级深度 |
| `vmu.tags.aliasTable` | string(path) | `''` | P | U | 别名表位置 |
| `vmu.refs.requireTarget` | bool | `true` | P | U | 引用目标必须存在 |
| `vmu.refs.danglingPolicy` | enum(reject/list) | `list` | P | U | 悬空引用处置 |
| `vmu.refs.backlinkDepth` | int | `1` | P | U | 反链深度 |
| `vmu.citations.style` | enum(bibtex/csl-json/csl-yaml) | `bibtex` | P | U | 引文样式 |
| `vmu.citations.requiredFields` | string[] | `[title,authors,year]` | P | U | 必填字段集 |
| `vmu.citations.idPriority` | string[] | `[doi,arxiv,pmid,url]` | P | U | 标识符优先级 |
| `vmu.citations.allowFreeText` | bool | `false` | P | U | 是否允许无标识符条目 |
| `vmu.metadata.strictness` | enum(strict/warn/loose) | `warn` | P | U | 校验严格度 |
| `vmu.metadata.customPrefix` | string | `x-` | P | U | 自定义字段前缀 |
| `vmu.provenance.depth` | int | `0` | P | U | 溯源深度（0＝全部） |
| `vmu.provenance.recordInputFingerprint` | bool | `true` | P | U | 是否记输入指纹 |
| `vmu.audit.retentionDays` | int | `0` | G | U | 审计保留（0＝永久） |
| `vmu.audit.sensitiveFields` | string[] | `[]` | G | U | 脱敏字段 |
| `vmu.audit.rotateBytes` | int | `10485760` | G | U | 轮转大小 |
| `vmu.export.format` | enum(json/md/package) | `json` | P | A | 导出格式 |
| `vmu.export.includeHistory` | bool | `false` | P | A | 是否含历史 |
| `vmu.import.onConflict` | enum(refuse/overwrite/skip) | `refuse` | P | A | 冲突处置（默认不覆盖） |
| `vmu.import.previewOnly` | bool | `false` | P | A | 只预览不落盘 |
| `vmu.archive.package.style` | enum(native/dataverse/zenodo) | `native` | P | U | 长期保存包风格 |
| `vmu.archive.package.includeEnvironment` | bool | `true` | P | U | 是否含环境说明 |
| `vmu.visibility.default` | enum(internal/public) | `internal` | P | U | 默认可见性 |
| `vmu.crypto.enabled` | bool | `false` | G | U | 加密开关 |
| `vmu.crypto.verifyInterval` | int | `0` | G | U | 校验间隔（0＝每次读） |
| `vmu.quota.softBytes` | int | `0` | W | U | 软上限 |
| `vmu.quota.hardBytes` | int | `0` | W | U | 硬上限 |
| `vmu.quota.warnAt` | number(0–1) | `0.8` | W | U | 告警阈值 |
| `vmu.quota.onExceed` | enum(warn/refuse/degrade) | `warn` | W | U | 超限动作 |
| `vmu.prune.scope` | enum(all/unreferenced) | `unreferenced` | G | U | 扫描范围 |
| `vmu.prune.autoRun` | bool | `false` | G | U | 自动 GC（默认只报告） |
| `vmu.prune.graceDays` | int | `14` | G | U | 孤儿宽限期 |
| `vmu.prune.exemptMarkers` | string[] | `[permanent]` | G | U | 豁免标记 |
| `vmu.workspace.default` | string | `''` | G | U | ★ **轮 238 说明：本键【已接线，但目前只被读取并上报】** ✓ —— **实测：裸名字（不含路径的名字）本就归属本面的 `root`** ✓ ⇒ **不存在需要它裁决的解析点** ✗；**`kernel/guard.js` 的 `readWorkspacePolicy` 会把它报出来，供回执与自检使用** ✓。**若将来出现「同一份数据挂多个工作区」的需求，界时应重新定义本键的语义** ✓ |
| `vmu.workspace.sharedPaths` | string[] | `[]` | G | U | 共享区挂载点 |
| `vmu.workspace.crossWrite` | bool | `false` | G | U | 跨区写 |
| `vmu.paths.followSymlinks` | bool | `false` | G | F | 是否跟随符号链接 —— ★ **轮 230 裁定：本键是 `vmu.safety.followSymlinks` 的【别名】** ✓✓，**权威在 `20-§4`** ✓（**关切属安全、执行点属安全面** ✓）；**保留本行只为让声明与命名空间仍然成立** ✓，**新配置应只写权威键** ✓；代码在两者都声明时以本键优先，以便旧 pack 不被静默改变 ✓ |
| `vmu.paths.allowedRoots` | string[] | 工作区根 | G | F | 允许写入的根 |
| `vmu.naming.conflictPolicy` | enum(refuse/suffix) | `refuse` | P | U | 命名冲突策略 |
| `vmu.names.aliasTablePath` | string(path) | `''` | G | U | 别名表位置 |
| `vmu.names.strict` | bool | `false` | G | U | 别名严格模式 |
| `vmu.deprecation.stageDays` | int | `90` | G | U | 每阶段时长 |
| `vmu.deprecation.allowExempt` | bool | `true` | G | U | 是否允许豁免 |
| `vmu.compat.enforce` | bool | `true` | G | U | 强制兼容矩阵 |
| `vmu.compat.unknownCombo` | enum(refuse/try) | `refuse` | G | U | 未知组合处置 |
| `vmu.packs.searchPaths` | string[] | 预设目录 | G | U | pack 搜索路径 |
| `vmu.packs.priority` | int | `0` | P | U | pack 优先级 |
| `vmu.middleware.onFailure` | enum(abort/continue) | `abort` | P | U | 中间件失败语义 |
| `vmu.prompt.compatMode` | bool | `false` | P | U | 提示词兼容模式 |

## C4. 码表（具体码 → 含义 → 处置）

| 码 | 含义 | 建议处置 |
|---|---|---|
| `VMU_STORE_MIGRATION` | 迁移失败 | 拒绝启动；给回退指引 |
| `VMU_STORE_VERSION_NEWER` | 文件版本高于代码 | 拒绝读取；提示升级或回退 |
| `VMU_WRITE_PARTIAL` | 原子写未完成 | 重试；不得读取半份 |
| `VMU_LOCK_TIMEOUT` | 锁等待超时 | 退避重试；仍失败则报冲突 |
| `VMU_CONFLICT_STALE_REVISION` | 版本已过期 | 重新读取后重试；给出双方版本 |
| `VMU_PATH_ESCAPE_REFUSED` | 路径越界 | 拒绝并给规范化后的安全路径 |
| `VMU_BODY_TRUNCATED` | 正文被截断 | 必须带被截断量；提示展开方式 |
| `VMU_HEAD_FIELD_IMMUTABLE` | 试图裁剪核心字段 | 拒绝；核心字段不可裁 |
| `VMU_FP_ALGO_UNKNOWN` | 指纹算法未登记 | 拒绝校验；提示需迁移 |
| `VMU_DEDUPE_REFCOUNT_UNDERFLOW` | 引用计数异常 | 拒绝删除；进入一致性检查 |
| `VMU_RETENTION_CONFLICT` | 永久保留与配额冲突 | 保留优先；配额只告警 |
| `VMU_TRASH_EXPIRED` | 回收站到期 | 进入 GC 候选；默认只报告 |
| `VMU_HISTORY_CHAIN_BROKEN` | 历史链断裂 | 拒绝写入；提示回退到全量 |
| `VMU_PACK_MANIFEST_MISMATCH` | 打包清单不符 | 拒绝解包；列出不符项 |
| `VMU_INDEX_STALE` | 索引过期 | 降级扫描并标记过期 |
| `VMU_SEARCH_UNEXPLAINED` | 检索结果缺命中原因 | 拒绝返回该结果 |
| `VMU_REF_DANGLING` | 悬空引用 | 列清单；默认不阻断写入 |
| `VMU_CITE_ID_MISSING` | 引文缺标识符 | 标记 `unidentified`；导出时列出 |
| `VMU_META_VALIDATION_FAILED` | 元数据校验失败 | 拒绝写入；给字段级原因 |
| `VMU_AUDIT_WRITE_FAILED` | 审计写入失败 | 显式告警；不得静默 |
| `VMU_EXPORT_VISIBILITY_BLOCKED` | 导出被可见性拦下 | 列出被拦对象；默认最小可见 |
| `VMU_IMPORT_CONFLICT` | 导入冲突 | 默认拒绝；可预览后显式覆盖 |
| `VMU_CRYPTO_VERIFY_FAILED` | 完整性/签名校验失败 | 拒绝读取；提示密钥丢失不可恢复 |
| `VMU_QUOTA_EXCEEDED` | 超出硬上限 | 按 `onExceed` 处置；写入前判定 |
| `VMU_GC_REFUSED` | GC 前置条件不足 | 只报告；说明缺失条件 |
| `VMU_ALIAS_AMBIGUOUS` | 别名歧义 | 拒绝解析；要求显式选名 |
| `VMU_PARAM_RENAMED` | 参数已改名（阶段 1） | 告警一次 |
| `VMU_PARAM_DEPRECATED` | 参数废弃中（阶段 2/3） | 告警并给替代名 |
| `VMU_PARAM_REMOVED` | 参数已移除 | 拒绝并给迁移指引 |
| `VMU_COMPAT_UNKNOWN_COMBO` | 兼容矩阵无此组合 | 拒绝运行 |
| `VMU_PACK_KERNEL_OVERRIDE_REFUSED` | pack 试图改内核 | 拒绝装载并具名报告 |
| `VMU_MIGRATE_DRYRUN_FAILED` | dry-run 本身失败 | 拒绝执行；给失败步骤 |
| `VMU_ROLLBACK_UNAVAILABLE` | 无可用回退点 | 拒绝迁移 |
| `VMU_ROLLBACK_FAILED` | 回退失败 | 停止一切写入；要求人工介入 |
| `VMU_NAME_CONFLICT` | 命名冲突 | 按策略拒绝或加后缀 |
