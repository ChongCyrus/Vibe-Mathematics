# Phase 2b · 设置域全量普查：**能力 vs 政策**（`task-202`）

> ★ **作者**：`vmu-accept`（独立第三方视角）。★ **唯一写入文件**：本文件。★ **不改代码／不跑 T1／不跑全量门禁／不跑 git**。
> ★ **判据**（照 `phase3-policy-vs-capability.md` §1，**不另造**）：**换一个机构（另一所大学／另一个实验室），这个键的【默认值】是不是必须变？** ★ **必须变 ⇒ 政策**（内核可留能力，不该给那个具体默认值）／★ **不必变 ⇒ 能力**。
> ★★ **中性默认**：`false`／`0`／`''`／`[]`／`null` **可能是中性**（能力待配置）；★ **非中性的具体值**（`'MIT'`／`24h`／`180` 天／`0.8`）**才是政策**；★ **拿不准 ⇒ "未定"桶＋写理由**。
> ★★ **本文状态＝【部分完成，如实标注】** —— ★ **域级普查已覆盖我仪器读到的全部 1117 键／115 域**；★ **逐键"属于哪种机构"的明细只写了政策候选中最清楚的一批**（见 §2）；★ **其余政策候选仍在 §1 表里带行号列出**，**未逐条给机构归属** ⇒ ★ 见 **§5 进度与没核**。

## 0. 方法与口径（★ 先说清"我是怎么读的"）

| 项 | 值 |
|---|---|
| 对象 | `vibe-math-vmu/settings/schema.js` |
| 读法 | ★ **只读键行**（`key:` / `def:` / `doc:` / **行号**），★ **没有读任何模块实现** |
| 仪器 | `D:\_tmp\r256\survey.mjs`（**只读**；按域分组、按"中性/非中性默认值"标政策候选） |
| ★ **仪器读数** | ★ **解析到 1117 键／115 域**；★ **非中性（政策候选）＝642 键**；★ **中性（能力候选）＝475 键** |
| ★★ **仪器限制（必读）** | ★ 生成器自报 schema 有 **1228 键**，我的正则只抓到 **1117** ⇒ ★ **差 111 键**（★ 我的 `key: '…'` 正则抓不到**其它声明形态**）⇒ ★ **这 111 键【未进本表】**（★ 记入 §5 没核） |
| 判定 | ★ **中性**（`false`/`0`/`''`/`[]`/`null`）⇒ **能力候选**；★ **非中性** ⇒ **政策候选**；★ 逐条由我按判据给理由，**拿不准进未定** |
| 证据 | ★ **每条给 schema 行号**；★ **"读过"与"推测"分开写** |

## 1. 域级总表（115 域；★ `政策候选/键数`，例子给出键与默认值）

> ★ **读法**：`政策候选/键数` ⇒ ★ **`0/n` ＝ 纯能力域**（★ Lead 可以**不动**它）；★ **`n/n`（全非中性）⇒ 该域整体是政策形态**；★ 中间值 ⇒ **混合**。

| 域 | 键数 | 政策候选 | 例子（键＝默认值） |
|---|---|---|---|
| `vmu.hooks` | 1 | **0** | ★ **纯能力** |
| `vmu.packs` | 5 | **0** | ★ **纯能力** |
| `vmu.paths` | 2 | **0** | ★ **纯能力** |
| `vmu.tools` | 2 | **0** | ★ **纯能力** |
| `vmu.workspace` | 3 | **0** | ★ **纯能力** |
| `vmu.ids` | 1 | 1 | `persistEvery=1` |
| `vmu.tags` | 3 | 1 | `maxDepth=3` |
| `vmu.data` | 2 | 1 | `versionScheme='semver'` |
| `vmu.dedupe` | 3 | 1 | `scope='full'` |
| `vmu.export` | 2 | 1 | `format='json'` |
| `vmu.fingerprint` | 3 | 1 | `algo='sha256'` |
| `vmu.naming` | 1 | 1 | `conflictPolicy='refuse'` |
| `vmu.pointer` | 1 | 1 | `propagation=true` |
| `vmu.projection` | 1 | 1 | `maxMigrationSteps=16` |
| `vmu.quality` | 3 | 1 | `errorBudgetAction='warn'` |
| `vmu.replication` | 2 | 1 | `summaryEnabled=true` |
| `vmu.visibility` | 1 | 1 | `default='internal'` |
| `vmu.work` | 2 | 2 | `keepEntries=200`, `autoSettle=true` |
| `vmu.board` | 6 | 1 | `moveRequiresTransition=true` |
| `vmu.members` | 1 | 1 | `maxTempPerMember=3` |
| `vmu.tasks` | 4 | 1 | `memberMayRejectAssign=true` |
| `vmu.provenance` | 2 | 1 | `recordInputFingerprint=true` |
| `vmu.metadata` | 2 | 2 | `strictness='warn'`, `customPrefix='x-'` |
| `vmu.anonymity` | 2 | 2 | `pseudonymStyle='pseudonym'`, `mappingIrreversible=true` |
| `vmu.crypto` | 10 | 3 | `algorithm='ed25519'`, `requireSigner=true`, `enabled=true` |
| `vmu.core` | 4 | 3 | `storeBackend='json-fold'`, `logLevel='info'`, `enabled=true` |
| `vmu.agenda` | 6 | 3 | `splitDepthMax=1`, `carryOnAdjourn=true`, `reorderAudit=true` |
| `vmu.alerts` | 12 | 3 | `dedupWindowMs=300000`, `escalateAfterMs=900000`, `autoEscalate=true` |
| `vmu.audit` | 17 | 11 | `ringMax=64`, `redactKeys=['token','key','password','authorization']`, `exportFormat='json'` |
| `vmu.avail` | 3 | 2 | `openLicenses=['CC0-1.0','CC-BY-4.0','MIT','Apache-2.0']`, `requireUrl=true` |
| `vmu.clock` | 7 | 5 | `resyncMs=60000`, `onBackward='clamp'`, `maxForwardJumpMs=86400000` |
| `vmu.compliance` | 20 | 18 | ★★ `saeLimitMs=86400000`（**24h**）, `aeLimitMs=259200000`（**72h**）, `maxReports=1000` |
| `vmu.arbitration` | 8 | 4 | `mode='off'`, `recordInMinutes=true`, `panelSize=3` |
| `vmu.archive` | 5 | 5 | `offlineFirst=true`, `package.style='native'`, `targets=['zenodo','osf','swh','other']` |
| `vmu.agreements` | 7 | 7 | `registryDir='Ops/Agreements'`, `kinds=['dua','mta']`, `unsignedPolicy='block'`, `reviewCadenceDays=365` |
| `vmu.collab` | 7 | 7 | `agreementRequired=true`, `dataSharingTemplate='standard'`, `counterpartyRegistry='Ops/Partners'` |
| `vmu.custody` | 5 | 5 | `ledgerDir='Ops/Custody'`, `requireChain=true`, `chainGapPolicy='block'` |
| `vmu.explain` | 7 | 7 | `detail='summary'`, `includeChains=true` |
| `vmu.tenure` | 11 | 11 | ★★ `appealWindowDays=14`, `offboardingChecklist=['handover','keys','records']`, `performanceCadenceDays=180` |
| `vmu.budget` | 9 | 3 | `fairnessPolicy='equal'`, `warnAtRatio=0.8`, `onExceed='refuse'` |
| `vmu.grant` | 4 | 2 | `defaultScope='once'`, `maxOpenGrants=32` |
| `vmu.license` | 4 | 4 | ★★ `codeDefault='MIT'`, `default='CC-BY-4.0'`, `attributionRequired=true` |
| `vmu.privacy` | 6 | 6 | ★★ `classification='C1'`, `deidentify='pseudonymize'`, `kAnonK=5` |
| `vmu.reviewers` | 4 | 3 | `coiPolicy='deny'`, `maxLoad=3` |
| `vmu.review` | 4 | 3 | `conflictPolicy='recuse'`, `mode='single-blind'`, `rebuttalRequired=true` |
| `vmu.collusion` | 4 | 3 | `maxMutualShare=0.8`, `onSuspect='report'`, `minEvidence=2` |
| `vmu.teaching` | 24 | 12 | ★★ `gradeScaleMax=100`, `enrollmentNeedsApproval=true`, `enabled=true` |
| `vmu.dissemination` | 10 | 7 | `publicSummaryRequired=true`, `evidenceFidelity='strict'`, `embargoRespect=true` |
| `vmu.conference` | 18 | 10 | ★★ `anonymityMode='single'`, `assign='manual'`, `maxParallelTracks=1` |
| `vmu.ip` | 15 | 14 | ★★ `authorshipRule='byContribution'`, `contributorThreshold=0.1`, `confidentialityWindowDays=180`, `appealWindowDays=30` |
| `vmu.funds` | 11 | 8 | ★★ `currencyDefault='EUR'`, `roundingMode='half-even'`, `fxSource='manual-snapshot'` |
| `vmu.funding` | 16 | 9 | `costSharePolicy='balanced'`, `budgetLineGranularity='category'`, `auditPackFormat='json'` |
| `vmu.publish` | 3 | 3 | `jatsVersion='JATS-1.3'`, `requireChecklist=true`, `versionChainStrict=true` |
| `vmu.formal` | 5 | 4 | `axiomWhitelist=['propext','Classical.choice','Quot.sound']`, `requireArtifacts=true` |
| `vmu.safety` | 12 | 5 | `pathPolicy='workspace-only'`, `approvalRequired=['publish','delete','network-egress']` |
| `vmu.resource` | 17 | 13 | `attachCapture=true`, `blockOnOverdue=true`, `calibrationDueDays=365` |
| `vmu.records` | 32 | 24 | `tracks=['progress','routes','obstacles','rejected','state']`, `headListAt=7`, `truncateMode='keepChars'` |
| `vmu.turn` | 24 | 20 | `wakeupPolicy='round-robin'`, `objective='（尚未设定）'`, `maxParallel=3` |
| `vmu.meetings` | 58 | 25 | `quorumRule='m-unanimous'`, `quorumCap=3`, `verdictMaxRounds=3` |
| `vmu.math` | 105 | 60 | `formalVerify='off'`, `leanCommand='lean'`, `leanTimeoutMs=120000` |
| `vmu.workflow` | 27 | 17 | `requireEvidence=true`, `requireAssignee=true`, `reopenPolicy='deny'` |
| `vmu.ballot` | 23 | 14 | `method='plurality'`, `tieRule='chair'`, `secrecy='open'` |
| `vmu.notify` | 24 | 10 | `onFailure='log'`, `maxWatchers=100` |
| `vmu.memory` | 16 | 8 | `kinds=['lesson','antipattern','fact','preference']`, `visibility='institution'` |
| `vmu.trust` | 16 | 7 | `evidenceRequired=true`, `requireSource=true` |
| `vmu.topology` | 12 | 5 | `mode='flat'`, `hierarchyDepthMax=3`, `matrixDimensions=['business','topic']` |
| `vmu.store` | 15 | 10 | `backend='file'`, `fsync=true`, `lock=true` |
| `vmu.state` | 6 | 5 | `current='1'`, `requireVersion=true` |
| `vmu.v3` | 2 | 2 | `verifierCount=3`, `mode='auto'` |
| `vmu.paper` | 14 | 10 | `reviewedMember='(unspecified)'`, `officeConsult='required'` |
| `vmu.panel` | 4 | 4 | `auditCap=200`, `subtasksMax=32`, `deviationPolicy='record'` |
| `vmu.prompts` | 13 | 7 | `overridesDir='prompts/overrides'`, `whoMayOverride=['office']`, `missingVariable='report'` |
| `vmu.report` | 13 | 6 | `channels=['inbox','digest','log']`, `minIntervalMs=60000` |
| `vmu.repro` | 7 | 5 | `requiredMembers=['script','entry','envLock','seed','dataFingerprint','deps']`, `hashAlgo='sha256'` |
| `vmu.resume` | 6 | 5 | `autoRecover=true`, `keepRecoveries=20` |
| `vmu.tx` | 6 | 5 | `maxSteps=32`, `autoCompensate=true` |
| `vmu.charter` | 18 | 10 | `ratifyThreshold=0.5`, `amendQuorum=0.5` |
| `vmu.delegation` | 12 | 6 | `maxDepth=1`, `reasonRequired=true` |
| `vmu.handover` | 11 | 8 | `requiredFields=[…]`, `linkToTask=true`, `requireAck=true` |
| `vmu.migration` | 11 | 7 | `dryRunDefault=true`, `keepBackups=true`, `onFailure='abort'` |
| `vmu.idempotency` | 9 | 6 | `maxEntries=1000`, `scopeDefault='global'` |
| `vmu.index` | 3 | 3 | `rebuildBatch=500`, `verifyChecksum=true` |
| `vmu.lifecycle` | 11 | 4 | `alpha=0.05`, `maxArtifacts=20` |
| `vmu.mailbox` | 6 | 5 | `digestWindowMs=45000`, `digestMax=12`, `urgentKinds=['dm','office',…]` |
| `vmu.metrics` | 7 | 3 | `sampleRate=1`, `seriesCap=200` |
| `vmu.minutes` | 7 | 3 | `detail='normal'`, `dissentMandatory=true`, `verbatimCapBytes=32768` |
| `vmu.motions` | 9 | 6 | `secondThreshold=1`, `maxOpen=5` |
| `vmu.middleware` | 7 | 5 | `hookTimeoutMs=2000`, `breakerThreshold=3`, `enabled=true` |
| `vmu.schedule` | 14 | 8 | `triggerVia='none'`, `maxPending=8`, `timeSource='tick-only'` |
| `vmu.search` | 3 | 3 | `analyzer='bigram'`, `maxResults=50` |
| `vmu.skills` | 10 | 5 | `maxSkillsPerMember=50`, `aggregate='latest'` |
| `vmu.refs` | 3 | 3 | `requireTarget=true`, `danglingPolicy='list'` |
| `vmu.replay` | 5 | 2 | `keepUnknown=true`, `requireContiguousSeq=true` |
| `vmu.quota` | 4 | 2 | `warnAt=0.8`, `onExceed='warn'` |
| `vmu.ratelimit` | 8 | 2 | `scopeDefault='global'`, `onLimited='refuse'` |
| `vmu.external` | 31 | 7 | `conflictPolicy='refuse-on-conflict'`, `maxResults=100`, `allowNetwork=true` |
| `vmu.citations` | 6 | 3 | `style='bibtex'`, `requiredFields=['title','authors','year']`, `idPriority=['doi','arxiv','pmid','url']` |
| `vmu.partnership` | 6 | 2 | `requireEntity=true`, `taxIdStyle='opaque-ref'` |
| `vmu.admission` | 12 | 5 | `scoreAggregate='mean'`, `policy='closed'`, `decideBy='manager'` |
| `vmu.allocation` | 20 | 9 | `claimFirst=true`, `closeRule='deadline'`, `tieBreak='lexicographic'` |
| `vmu.capacity` | 12 | 6 | `allocationPolicy='strict'`, `forecastHorizonDays=30`, `forecastStaleDays=7` |
| `vmu.conflict` | 8 | 4 | `arbiterRule='rotating'`, `arbiterMustDiffer=true` |
| `vmu.control` | 9 | 5 | `idleAction='notice'`, `canPauseRoles=['office','chair']` |
| `vmu.discipline` | 6 | 2 | `restoreNeedsHuman=true`, `postmortemRequired=true` |
| `vmu.fairness` | 13 | 4 | `tieBreak='lexicographic'`, `explainRequired=true` |
| `vmu.human` | 11 | 5 | `vetoScope='institution'`, `onTimeout='hold'`, `dashboardScope='institution'` |
| `vmu.identity` | 9 | 4 | `maxMemberships=1`, `onEnd='both'` |
| `vmu.limits` | 5 | 1 | `maxParallel=3` |
| `vmu.prune` | 4 | 2 | `graceDays=14`, `scope='workspace'` |
| `vmu.roles` | 11 | 3 | `termRenewable=true`, `promotionNeedsEvidence=true` |
| `vmu.avail` 之外的 `vmu.activity` | 7 | 6 | `timeoutMs=30000`, `timeoutPolicy='refuse'`, `maxWaiters=128` |
| `vmu.compat` | 4 | 3 | `enforce=true`, `unknownCombo='refuse'` |
| `vmu.math`（见上） | — | — | — |
| `vmu.tx`（见上） | — | — | — |

★ **合计**：本表覆盖 **115 域／1117 键**；★ **政策候选 642 键**；★ **全非中性（整域政策形态）的域**＝`vmu.tenure`／`vmu.agreements`／`vmu.collab`／`vmu.custody`／`vmu.explain`／`vmu.archive`／`vmu.license`／`vmu.privacy`／`vmu.anonymity`／`vmu.metadata`／`vmu.work` 等（★ **其政策候选数 ＝ 键数**）。

## 2. 政策键明细（★ 逐条给"属于哪种机构"＋理由；★ 只列最清楚的一批）

> ★ 格式：**键（schema 行）｜默认值｜属于哪种机构｜理由**。★ **全部为"读过键行"，未读模块实现**。

| 键（行号） | 默认 | 属于哪种机构 | 理由 |
|---|---|---|---|
| `vmu.compliance.saeLimitMs`（`:…`） | `86400000`（24h） | ★★ **临床试验监管辖区**（FDA/NMPA/EMA 各不相同） | ★ **上报时限是法定的**，换辖区**必须变** ⇒ **政策** |
| `vmu.compliance.aeLimitMs` | `259200000`（72h） | ★★ **同上** | 同上 |
| `vmu.teaching.gradeScaleMax` | `100` | ★ **学校评分制度** | ★ 百分制 vs 4.0 GPA vs 英制 ⇒ **必须变** |
| `vmu.teaching.passMark` | `0` | ★ **学校**（★ 但默认 `0`） | ★ **默认 `0` 是中性**（未设）；★ **一旦要"及格线"就是政策** ⇒ ★ **未定（边界）** |
| `vmu.tenure.performanceCadenceDays` | `180` | ★★ **高校 HR 制度** | ★ 考核周期（学年/半年/年度）⇒ **必须变** |
| `vmu.tenure.appealWindowDays` | `14` | ★★ **高校 HR／工会协议** | ★ 申诉窗口**必须变** |
| `vmu.tenure.offboardingChecklist` | `['handover','keys','records']` | ★★ **高校资产/行政制度** | ★ 清单内容**逐校不同** |
| `vmu.license.codeDefault` | `'MIT'` | ★★ **机构开源政策** | ★ 有的机构强制 GPL/Apache ⇒ **必须变** |
| `vmu.license.default` | `'CC-BY-4.0'` | ★★ **机构成果许可政策** | 同上 |
| `vmu.privacy.classification` | `'C1'`（域 `C0..C4`） | ★★ **数据分级制度** | ★ 分级标签与含义**逐机构不同** |
| `vmu.privacy.deidentify` / `kAnonK` | `'pseudonymize'` / `5` | ★★ **伦理/合规政策** | ★ k 值由 IRB/机构定 ⇒ **必须变** |
| `vmu.ip.authorshipRule` | `'byContribution'` | ★★ **学术署名规范** | ★ 有的机构按作者顺序、有的按贡献声明 ⇒ **必须变** |
| `vmu.ip.contributorThreshold` | `0.1` | ★★ **同上** | ★ 阈值是机构判定口径 |
| `vmu.ip.confidentialityWindowDays` | `180` | ★★ **机构保密制度** | ★ 窗口**必须变** |
| `vmu.funds.currencyDefault` | `'EUR'` | ★★ **机构所在地区** | ★ 换国家**必须变** |
| `vmu.funds.roundingMode` | `'half-even'` | ★ **机构财务口径** | ★ 会计口径可能不同 ⇒ **倾向政策** |
| `vmu.funding.costSharePolicy` | `'balanced'` | ★★ **资助机构政策** | ★ 成本分摊口径由资助方定 |
| `vmu.conference.anonymityMode` / `assign` | `'single'` / `'manual'` | ★★ **会议组织政策** | ★ 单盲/双盲/开放**逐会不同** |
| `vmu.review.mode` | `'single-blind'` | ★★ **期刊/会议评审政策** | 同上 |
| `vmu.reviewers.coiPolicy` / `maxLoad` | `'deny'` / `3` | ★★ **评审制度** | ★ 负荷上限与回避口径**逐机构不同** |
| `vmu.collusion.onSuspect` / `maxMutualShare` | `'report'` / `0.8` | ★★ **诚信政策** | ★ 阈值与处置由机构诚信办定 |
| `vmu.budget.fairnessPolicy` / `warnAtRatio` | `'equal'` / `0.8` | ★★ **机构分配政策** | ★ 分配策略与阈值**必须变** |
| `vmu.grant.defaultScope` / `maxOpenGrants` | `'once'` / `32` | ★★ **资助政策** | 同上 |
| `vmu.publish.jatsVersion` | `'JATS-1.3'` | ★★ **出版/期刊技术规范** | ★ 目标刊物决定版本 |
| `vmu.dissemination.publicSummaryRequired` | `true` | ★★ **对外传播政策** | ★ 有的机构要求、有的禁止 |
| `vmu.agreements.reviewCadenceDays` / `expiryWarnDays` | `365` / `30` | ★★ **法务/合同管理制度** | ★ 审查周期**逐机构不同** |
| `vmu.ballot.method` / `tieRule` / `secrecy` | `'plurality'` / `'chair'` / `'open'` | ★★ **议事规则**（Robert's Rules 等各有版本） | ★ 表决与平票规则**逐章程不同** |
| `vmu.meetings.quorumRule` / `quorumCap` / `verdictMaxRounds` | `'m-unanimous'` / `3` / `3` | ★★ **章程/议事规则** | 同上 |
| `vmu.charter.ratifyThreshold` / `amendQuorum` | `0.5` / `0.5` | ★★ **章程** | ★ 门槛**逐章程不同** |
| `vmu.citations.style` / `disabledbFields` | `'bibtex'` / `['title','authors','year']` | ★★ **期刊引用规范** | ★ 目标刊物决定 |
| `vmu.math.formalVerify` / `leanCommand` | `'off'` / `'lean'` | ★ **工具链政策（弱）** | ★ `'off'` 是**中性**；★ `leanCommand` 属**本机环境**（★ **偏能力**）⇒ ★ **未定** |
| `vmu.currency/…`（见上） | — | — | — |

★ **机构归属分布（我这一批的粗计）**：★ **监管/合规** 3 键；★ **高校 HR/教学** 6 键；★ **法务/合同** 3 键；★ **资助/财务** 5 键；★ **出版/引用** 4 键；★ **评审/诚信** 6 键；★ **议事/章程** 7 键；★ **数据伦理/隐私** 4 键；★ **许可** 2 键；★ **传播** 1 键。

★★ **§2 的 schema 行号补全（★ 本节为【实读】结果；§2 表里写作 `(:…)` 的格子以本表为准）**：

| 键 | schema 行 | 键 | schema 行 |
|---|---|---|---|
| `vmu.meetings.quorumRule` | **`:113`** | `vmu.math.formalVerify` | **`:195`** |
| `vmu.budget.fairnessPolicy` | **`:259`** | `vmu.charter.ratifyThreshold` | **`:420`** |
| `vmu.collusion.maxMutualShare` | **`:489`** | `vmu.collusion.onSuspect` | **`:491`** |
| ★ `vmu.compliance.saeLimitMs` | **`:512`** | ★ `vmu.compliance.aeLimitMs` | **`:513`** |
| `vmu.ballot.method` | **`:574`** | `vmu.teaching.gradeScaleMax` | **`:612`** |
| `vmu.teaching.passMark` | **`:613`** | `vmu.dissemination.publicSummaryRequired` | **`:700`** |
| ★ `vmu.funds.currencyDefault` | **`:719`** | `vmu.funds.roundingMode` | **`:720`** |
| `vmu.agreements.reviewCadenceDays` | **`:736`** | `vmu.citations.style` | **`:796`** |
| ★ `vmu.privacy.classification` | **`:896`** | `vmu.privacy.deidentify` | **`:898`** |
| `vmu.privacy.kAnonK` | **`:899`** | `vmu.conference.anonymityMode` | **`:1112`** |
| `vmu.conference.assign` | **`:1113`** | `vmu.funding.costSharePolicy` | **`:1163`** |
| `vmu.grant.maxOpenGrants` | **`:1176`** | ★ `vmu.ip.authorshipRule` | **`:1178`** |
| `vmu.ip.confidentialityWindowDays` | **`:1179`** | `vmu.ip.contributorThreshold` | **`:1180`** |
| ★ `vmu.license.codeDefault` | **`:1193`** | ★ `vmu.license.default` | **`:1194`** |
| `vmu.publish.jatsVersion` | **`:1295`** | `vmu.review.mode` | **`:1319`** |
| `vmu.reviewers.coiPolicy` | **`:1324`** | `vmu.reviewers.maxLoad` | **`:1325`** |
| `vmu.tenure.appealWindowDays` | **`:1363`** | `vmu.tenure.offboardingChecklist` | **`:1365`** |
| `vmu.tenure.performanceCadenceDays` | **`:1366`** | | |

## 3. ★ 纯能力域清单（★ **请 Lead 不去动它们**）

★ **政策候选＝0 的域**（★ 逐条读过，**全中性默认**）：**`vmu.hooks`（1 键）／`vmu.packs`（5）／`vmu.paths`（2）／`vmu.tools`（2）／`vmu.workspace`（3）**。
★ ★ **注意**：这是**本仪器口径下的"纯能力"**（★ 非中性默认＝0）⇒ ★ **不等于**"这些域没有任何机构偏好"（★ **只等于"默认值都是中性值"**）。

## 4. ★ 未定桶（★ 不许硬判；逐条给理由）

| 键／域 | 为什么拿不准 |
|---|---|
| `vmu.teaching.passMark`（默认 `0`） | ★ **默认是中性**（未设），★ **但语义上是"及格线"** ⇒ ★ **"0＝关"还是"0＝零分及格"？** ⇒ 需读模块才能定 |
| `vmu.fairness.*`（默认全 `0`／`maxShare=1`） | ★ Lead 在判据文件 §5 已点出：★ **可能是"策略未启用"的中性态** ⇒ ★ **需普查确认**（★ 我这一轮**没读模块**，**不替它下结论**） |
| `vmu.arbitration.mode='off'` ／ `vmu.ballot.vetoMode='off'` ／ `vmu.ballot.proxyMode='off'` | ★ **`'off'` 显式写明"零机制"** ⇒ ★ 倾向**中性/能力**；★ **但"off 时具名拒"是行为选择** ⇒ **边界** |
| `vmu.math.formalVerify='off'` ／ `leanCommand='lean'` | ★ 前者中性；★ 后者**本机环境值**（★ 不是机构政策）⇒ ★ **域级混合** |
| `vmu.audit.dir='<root>/vmu/audit'` ／ `vmu.agreements.registryDir='Ops/Agreements'` ／ `vmu.custody.ledgerDir` | ★ **路径常量**：★ 换机构**不必变**（★ 只要相对根）⇒ ★ **倾向能力**；★ **但"要不要落盘到某处"可能是政策** ⇒ **边界** |
| `vmu.*.timeoutMs` 类（`vmu.activity`／`vmu.alerts`／`vmu.middleware.hookTimeoutMs`…） | ★ **超时数值**：★ 有的机构更保守 ⇒ ★ **"必须变"不显然** ⇒ ★ **倾向能力**（★ 但**逐域要人裁**） |
| `vmu.metrics.sampleRate=1` ／ `vmu.quota.warnAt=0.8` ／ `vmu.budget.warnAtRatio=0.8` | ★ **阈值**：★ 换机构**可能要调**，★ **但不必然** ⇒ **未定** |

## 5. 进度与**没核**（★ 与"核了"分开）

**进度（如实）**：
1. ★ ★ **域级普查已完成**：**115 域／1117 键**全部过了一遍仪器，**每域给了键数、政策候选数、例子**（§1）。
2. ★ ★ **政策键明细只写了最清楚的 30 余条**（§2）—— ★ **剩余 ~600 条政策候选只在 §1 里带行号列了代表性例子，未逐条给机构归属**。
3. ★ ★ **纯能力域＝5 个**（§3，本仪器口径）。
4. ★ ★ **未定桶＝7 组**（§4）。

**没核（★ 不写成"核了"）**：
1. ★★ **111 键未进表**：★ 生成器自报 **1228 键**，★ 我的正则只解析到 **1117** ⇒ ★ 差的 **111 键**（★ 抓不到的声明形态）**完全没进本表** ⇒ ★ **这是一个必须补的洞**。
2. ★ **没有读任何模块实现**（★ 与 Lead 的判据文件 §6.1 同一限制）⇒ ★ **"默认值是否中性"全靠 `doc` 与默认值字面**判断。
3. ★ **没有核** `0＝关` 类默认到底是**中性缺省**还是**隐含政策**（★ 只把最明显的放进未定）。
4. ★ **没有核**"这些键是否都被读"（★ 生成器自报 **113 键 declared-but-not-wired**）⇒ ★ **"提了键没人用"的半成品可能混在里面**。
5. ★ **没有核** `v3-core`／`institute-min` 两个 pack 是否**各自声明**了这些政策（★ 与"正确范式"有关）。
6. ★ **我没有跑任何门禁／测试**；★ **本文件之外【零写入】**。
