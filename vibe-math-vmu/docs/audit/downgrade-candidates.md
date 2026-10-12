# Downgrade candidates — audit against the "no possible consumer in (a)–(j)" criterion

Audit of `vibe-math-vmu/docs/**` plus the repository-root `docs/**`, asking one question per item:

> Could a person who uses vmu to build **their own mathematical-research runtime/system** plausibly want this, in any of the ten directions (a) mathematical research, (b) formalisation, (c) computation and tools, (d) agent communication and meeting systems, (e) inter-agent collaboration, (f) workflow, (g) control flow, (h) file archiving, (i) review and publication, (j) agent self-organisation — **including** infrastructure, optional features, interfaces/plugins, tunable parameters, agent-executable commands, scripts and protocols?

The burden of proof is on **removal**. Anything a research-runtime builder could plausibly want is KEPT (§3), even when the current implementation looks institutional.

---

## 1. Method

What I read (all UTF-8; line numbers are from these reads):
- Full read: `vibe-math-vmu/docs/25-demoted-domains.md` (36 lines), `vibe-math-vmu/docs/23-extensions-and-deferred.md` (176 lines).
- Targeted reads (by heading + cited ranges): `22-academic-operations.md` headings plus L18–47, L122, L217, L219, L237, L253, L269, L289, L311–320, L396–463, L465–470, L484–513, L518–556, L573, L591, L606, L623, L637, L653–694, L840–862, L924–936, L937–957.
- Headings of `14-open-items-and-roadmap.md`; heading list of `21-observability-and-operations.md`; `planned.js` L17–23 (`vmu.a11y.*`); `package.json` `files` entries (see citations below); directory listing of the repository-root `docs/`.
- Key-family census over `settings/schema.js` + `settings/planned.js` (regex over `vmu.*` keys), to see which families exist at all.

How the criterion was applied:
1. Worked **top-down from the docs**, not from the key list: read the section that describes the item, including its own statement of purpose ("目的") and its self-declared maturity/priority.
2. For each item asked: *who would consume this, concretely?* A concrete consumer had to be nameable ("a lab that files a patent on an algorithm"), not a category ("researchers").
3. Reused the repository's own prior adjudications rather than inventing a parallel rule: `23-§0b` (L17–24) states the possibility-based criterion and the precedent `22-§14` (L842–843 five questions; "any 'yes' ⇒ keep").
4. Marked confidence honestly: **high** = the content is self-declared as serving a non-research institution function, or is a superseded internal artifact; **medium** = a consumer is conceivable only by stretching one of (a)–(j), and I name the stretch in §5 when it exists.
5. Explicitly did **not** re-propose anything already downgraded or already ruled on (§4).

---

## 2. Candidates for downgrade

Machine-readable columns: `# | doc:line | what it is | why no possible consumer | proposed destination | confidence`.

| # | doc:line | what it is | why no possible consumer | proposed destination | confidence |
|---|---|---|---|---|---|
| C-1 | `vibe-math-vmu/docs/22-academic-operations.md:937-957` (esp. 945, 953) | Teaching & Accreditation (N13): accreditation evidence pack = self-assessment narrative + claim→artifact reference table (L945, L953), and learning-outcome↔artifact alignment (L944) | Accreditation is granted by an **external educational accreditation body**; none of (a)–(j) includes reporting to such a body. The section itself says it adds no kernel, only a record track (L939) — i.e. the capability is "produce a dossier for an accreditor". A mathematical-research runtime never emits one. The learning-outcome half is a pedagogical mapping, not a research output | Move the **accreditation** half (L945, L953–955) to `23-extensions-and-deferred.md` as an extension example; leave one line + pointer in `22`. Keep the teaching-artifact half in §3 below (see K-6) | high (accreditation half) / medium (outcome alignment) |
| C-2 | `vibe-math-vmu/docs/22-academic-operations.md:499-513` | Impact Log (`vmu.outreach.impact()`): records citation counts, media reports, policy citations, teaching use (L504), keys `vmu.outreach.impactLogFields`, `vmu.outreach.impactUseInEvaluation` (L506) | Its stated purpose is "用于运营决策而非学术评价" (L504) — operational PR metrics. (i) review and publication consumes *research output and its review*, not press/policy reach; citations-as-evaluation is explicitly excluded (L509: default forbids using impact for personnel evaluation). The underlying need, if any runtime has it, is a generic record track — already served by `records` | Downgrade to extension: document it as an example `records` usage in `23`; drop the dedicated `vmu.outreach.impact*` keys from the core plan | medium |
| C-3 | `vibe-math-vmu/docs/22-academic-operations.md:484-497` | Media & Open Review, **media half only**: press enquiries and spokesperson policy (`vmu.outreach.mediaRequest()`, `vmu.outreach.mediaApprovalPolicy` default `spokesperson-only`, `VMU_OUTREACH_MEDIA_UNAUTHORIZED`) | Press relations are institutional PR. No direction covers "who may speak to journalists for the institute". The **open-review** half of the same section (L490, L494) *is* (i) and stays | Downgrade only the media/spokesperson half; keep `openReview` in core | medium |
| C-4 | `vibe-math-vmu/docs/22-academic-operations.md:446-459` | Conference registration & proceedings, **fee half**: `vmu.conference.registrationCap` (default 0), `registrationFeeMinor` (default 0), `waiverPolicy` (default `none`) (L452–453) | Ticketing/fee collection for an event: (d) meeting systems and (i) publication do not consume a paid-registration gate, and the money itself is already carried by the `funding` account/voucher track that this very section points to (L456). The proceedings half (L451, L456) is (i) and stays. `22:929` still lists "whether conference affairs deserve their own volume" as **undecided**, so only the fee keys are proposed | Downgrade the three registration/fee/waiver keys to extension; keep proceedings | medium |
| C-5 | `vibe-math-vmu/docs/22-academic-operations.md:536-550` (+ open question L933) | Cross-institution collaboration, **settlement/reconciliation half** (§7.3) | Inter-institution financial settlement is not in (a)–(j). It also conflicts with the upstream ruling in the same volume: `22:851` rules the currency/rounding/audit-quadruple family **不做 ✗**, and `22:933` still lists the settlement trust model as **undecided** | Downgrade to extension, aligned with the `22:851` upstream ruling; keep §7.1/§7.4 (MOU, DUA/MTA gates) in core | medium |
| C-6 | `docs/generate_framework_diagram_v2.py`, `docs/generate_framework_diagram_v2_en.mjs` (both shipped: `package.json:94`, and the `_v2_en` entry follows the same block) | The **oldest superseded** generation of this project's own framework-diagram generator | These generate **this repository's** marketplace illustration, not any capability a research runtime consumes. The current generation is `docs/generate_framework_diagram_v5.mjs` (`package.json:97`); v4 (`:96`) and v3 (`:95`) exist too. Nothing in (a)–(j) needs a picture of *our* framework, and the v2 pair is the furthest from current | Remove the v2 pair from the published set (`package.json` `files`) and archive under a non-shipped `docs/archive/`; keep repository history | high (v2 pair) / medium (v3–v4: v2/v3 carry the only `_en` variants, so a builder *could* reuse the English generator — see §5) |
| C-7 | `docs/test-timing.md` (shipped: `package.json:101`) | Measured wall-clock costs of **this repository's** test suites (used to tune this repo's CI timeouts) | The ten directions' "infrastructure/workflow" means building *your own* runtime, not consuming our suite's timing table. A consumer would have to be maintaining *this* repo | Move out of the published set; keep it as an internal development note (or fold the numbers into `11-gates-and-development.md`) | medium |
| C-8 | `docs/v5-tool-evaluation.md` (shipped: `package.json:119`) | Evaluation of v5 tools / market landscape material (companion: `docs/landscape-similar-frameworks.md`, which is **not** shipped) | Project due-diligence material for deciding what to build; it neither documents a capability nor a protocol a builder runs. (b)/(c) consume the toolbox docs, not our tool *evaluation* | Move out of the published set; archive with the project's internal decision material | medium |

Not proposed, deliberately: `docs/release-playbook.md` (`package.json:84`), `docs/slv-playbook.md` (`:85`), `docs/maintenance-policy.md` (`:29`), `docs/audit-methodology.md` (`:83`), `docs/COMPAT-AUDIT-ROUND2/3.md` (`:27`) — a builder who ships their own preset plausibly wants a release/compat/maintenance checklist. See K-15.

---

## 3. KEPT because a consumer is possible

Each row names a concrete consumer. Where the repository has already adjudicated the item, the ruling is cited instead of re-argued.

| Item (doc:line) | Concrete possible consumer |
|---|---|
| K-1 `vmu.ip` family, `22:311-379` (disclosure, prior art, ownership, disclosure clock; §4.5 is already only a pointer, L377) | "A lab that wants to file a patent on an algorithm before publishing it, and must block public disclosure until the filing date" — the disclosure clock (L361–376) is exactly that gate |
| K-2 `funding`/`grant` account & budget lines, `22:219-288` | "A PI whose grant requires spend-per-budget-line reporting and voucher chains" — kept by the repo too (`23:120`) |
| K-3 `compliance`/`privacy`/`safety`/`domaingate`, `22:573-622` | "A builder whose institution requires an ethics/dual-use/export-control gate before a result leaves the group" — kept by the repo (`23:119`) |
| K-4 `capacity` + shared-resource/instruments (`22:122-194`, `22:623-636`; `planned` family `instruments`) | "A builder scheduling a shared GPU/cluster queue with capability tags, reservations and maintenance windows" — the repo's own boundary note is to read `seats`/`facilities` as generic capacity (`23:141`) |
| K-5 `hr`/`recruit` (`22:637-652`) | "Long-lived agent seats: tenure, rotation, appeal, offboarding of a role that persists across sessions" — the repo reversed its downgrade for exactly this reason (`23:32`, `23:104`) |
| K-6 `course`/`mentor` (teaching-artifact half of N13, `22:942-944`, `22:106`) | "A builder who trains new agent members and wants lecture notes/problem sets/rubrics as *records*" — the repo's reason for keeping course (`23:33`); note the unresolved conflict in §5 |
| K-7 `attendance`/`committees`/`consensus`/`consent` (planned) | "Meeting attendance and quorum/consensus records, and consent gating for human-subject data" — kept by ruling (`23:34`) |
| K-8 `meetings`/`ballot`/`minutes`/`agenda` | Direction (d) is named in the criterion itself; kept by ruling (`23:121`) |
| K-9 `publication`/`authorship`/`citations`/`review`/`paper` (`16`, `22:446-463` proceedings half) | Direction (i): "a builder generating a proceedings volume or running blind review" |
| K-10 `vmu.a11y.*` (7 planned keys, `planned.js:17-23`: `minContrastRatio`, `requireAltText`, `headingGapPolicy`, `checklist`, `failOn`, `enabled`, `checkScope`) | "A builder publishing HTML/Markdown reports that must pass an accessibility check (contrast ratio, alt text) before release" — an output-quality gate, (c)/(i) adjacent |
| K-11 `slo`/`incident`/`alerts`/`metrics`/`stats` (see `21` headings) | "An operator of a long-running research runtime who needs SLOs, incident records and alerting" — infrastructure is explicitly inside the criterion's scope (`23:22`) |
| K-12 `supplychain`/`deprecation`/`names`/`templates`/`migration`/`import`/`store`/`external`/`handover`/`dedupe` (planned families; `13-migration.md`) | "A builder migrating an existing research runtime and pinning dependency provenance" |
| K-13 `22 §7.4` DUA/MTA gate (`22:551-572`) | "A builder whose data-use/material-transfer agreement must block transfer until signed" — the repo upgraded this back to "做 ✓" (`22:854`) |
| K-14 `22 §6.1` public-summary fidelity (`22:465-483`) | "A builder whose runtime must refuse to describe an unproven claim as proven in a public summary" — the repo's minimal criterion is decisive (`22:855`) |
| K-15 root `docs/release-playbook.md`, `slv-playbook.md`, `maintenance-policy.md`, `audit-methodology.md`, `COMPAT-AUDIT-ROUND2/3.md` | "A builder shipping their own preset into DSH needs a release, compatibility and maintenance checklist" — infrastructure in the criterion's scope (`23:22`) |
| K-16 `24-v5r-containment.md`, `26-turn-orchestration.md`, `18-command-and-protocol-reference.md`, `19-plugin-and-extension-development.md`, `21-observability-and-operations.md`, `11-gates-and-development.md` | Pack authors and integrators: containment of a preset, turn orchestration, the command/protocol surface, plugin development (interfaces/plugins are explicitly in scope, `23:22`) |
| K-17 `15-math-computation-toolbox.md`, `09-math-formalization.md`, `07-durability-library.md`, `08-primitives-meeting-ballot-workflow.md`, `16`, `17` | Directions (a)–(f): the research, formalisation, archive and collaboration surfaces themselves |
| K-18 `docs/landscape-similar-frameworks.md` | Already **not** in `package.json` `files` (verified by substring test) ⇒ already internal; no action |

---

## 4. Already downgraded or already ruled — do NOT re-propose

| Item | Where the ruling lives |
|---|---|
| `clinical` (9 keys) and `animal` (9 keys) — **maintained demoted, user-confirmed**; expanded in volume 25 | `23:35`, `23:47`, `23:79`, `25:3-5`, `25:11-12`, `25:16-18` |
| General domain-compliance mechanism (`domaincompliance.js`) — **kept as mechanism**, must not name a domain | `23:77` (D-1) |
| `custody` (chain of custody) — ruled "不做 ✗" in `22-§14`, later **restored** by the user decision | `23:80` (D-4), `23:31`, `23:46`, `23:59` |
| Money/currency/rounding + cross-border + tax fields — ruled "不做 ✗" | `23:81` (D-5), `22:851`, `22:853` |
| `instrument`s / shared-resource family — was demoted, then **restored** | `23:95`, `23:60` |
| `hr` — downgrade **reversed** to keep | `23:32` |
| `capacity`, `recruit` — re-examined and kept with explicit boundaries | `23:141`, `23:142` |
| `mentor`/`attendance`/`committees`/`consensus`/`consent` — **改判：保留** | `23:34` |
| Closure record: removal procedure, restored suites, and the "records must not be rolled back" rule | `23:146-161`, `23:63-66` |
| `vibe-math-vmu/docs/audit/source-runtime-coverage.md`, `source-prompt-coverage.md`, `pack-content-review.md` | Already effectively internal: `package.json` `files` lists the 26 numbered volumes individually (`package.json:210-236`) and has **no** entry for `vibe-math-vmu/docs/audit` ⇒ not shipped; no action needed |
| Superseded **v2** diagram generator pair | Proposed in §2 as C-6 (new), not previously ruled |

---

## 5. 未做 / 明写 (what I could not determine, and why)

1. **`course` has two contradictory rulings and I cannot tell which governs.** `23:33` (in the "口径修订" block, marked as taking precedence over §0/§1b) says **改判：保留**; `23:143` (in §1d, 轮 300) says **降级 ✗** with the "duplicate with review/reviewers/conference" argument. I did not find a later user ruling resolving them, so I did not treat the teaching half as a candidate (it stays in K-6). **Evidence that would settle it:** a dated ruling line in `23`/`25` or the `14` ledger that names `course` after 轮 300.
2. **`22 §18 待裁决` (L924–933) still holds 8 open questions**, two of which bear directly on my candidates: "会务是否独立成卷" (L929, affects C-4) and "跨机构结算的信任模型" (L933, affects C-5). Until those are ruled, C-4/C-5 remain medium, not high.
3. **C-6's v3/v4 half is medium for a concrete reason:** the only **English** diagram generators are the v2/v3 `_en` variants (`docs/generate_framework_diagram_v2_en.mjs`, `docs/generate_framework_diagram_v3_en.mjs`); a builder could conceivably reuse an English renderer. I read the file names and their `package.json` entries but **not the generator bodies**, so I cannot say whether v5 supersedes them functionally.
4. **Body-not-read ⇒ not judged.** I read only headings/cited ranges for: `20-security-privacy-and-compliance.md`, `17-agent-society-and-delegation.md`, `16-research-lifecycle.md`, `07`, `08`, `10`, `12`, `13`, `15`, `18`, `19`, `21`, `24`, `26`, and large parts of `22` (§1, §2.1–2.4, §3.1–3.4, §5.1–5.3, §7.1–7.4 bodies, §9–§13). Additional candidates may exist there; I did not propose anything I had not read at the cited line.
5. **Root `docs/` bodies were not read**, only listed plus checked against `package.json` `files`. C-7 and C-8 rest on the file's evident purpose (name) + its shipping status, which is why they are medium, not high. A consumer argument could exist in the bodies (e.g. a reader guide aimed at framework users).
6. **No rule found** stating whether the repository-root `docs/` counts as "main docs" or as project-internal material. My destinations therefore say "remove from the published set / archive", which is reversible and does not delete history.
7. **Counter-consideration for each medium candidate, stated explicitly** (so the Lead can apply the possibility test directly):
   - C-2/C-3: if "a builder wants to record how their agents' results were received publicly" counts as (i), keep them — I judged it does not, because the section itself separates impact from academic evaluation (L504, L509).
   - C-4: if "a builder runs a paid summer school or conference with registration fees" counts as (d), keep the fee keys — plausible, which is why this is only medium.
   - C-5: if "a multi-institution consortium needs settlement reconciliation" counts as (e) inter-agent collaboration, keep it — but the same volume already ruled the underlying money/rounding family out (`22:851`).
   - C-8: if "our tool evaluation tells a builder which tools to wire" counts as (c), keep it.
8. **I did not run any test or gate**; no `git commit`/`push`; the only file I created or modified is this report (`vibe-math-vmu/docs/audit/downgrade-candidates.md`, which is itself outside `package.json` `files`).

---

## 6. ★★★★ 负责人复核（轮 408）：**本轮 0 条移出，两条高置信候选经读原文后【推翻**】✓

★ 审批原则的举证责任在**删除**一侧 ✓，所以我对两条 **high** 候选**逐条读了原文**，结论与审计相反：

### C-1（`22:937-962` N13 教学与认证）⇒ **不降级，保留** ✓✓

★ 审计把它列为 high，理由是"**自评报告 ＋ 认证证据包**"听起来像非研究性的机构事务 ✓。★★ **但读原文（L937–962）后，它的内核是**：
- **`outcome ↔ artifact` 对齐表**（每条 outcome 一行、指向 ≥1 个 artifact 引用 ✓）；
- **`claim → artifact 引用 → 复核人 → 时刻` 的证据引用表** ✓；
- 并且明写 **"证据缺失即写'未做'标记 ✗✓，不得用叙述替代证据 ✗"** ✓。

★★★ **这就是"评审与出版 (i)"与"文件归档 (h)"的核心基础设施** ✓ —— ★ **"结论必须能回指证据"** ✓ 正是数学研究**最需要的那种诚实性机制** ✓。★ 而且该节自述 **"不动作内核 ✗：只用记录轨 ＋ pack ＋ 中间件组合"** ✓ ⇒ ★ **它本来就是"扩展/pack 形态"的设计稿，完全符合哲学理念** ✓。
⇒ ★ **判定：有明确的可能消费者（任何想让"声称"与"证据"对得上的构建者）⇒ 保留** ✓。

### C-6（`docs/generate_framework_diagram_v2.py` ＋ `_v2_en.mjs`）⇒ **暂留** ✓

★ 审计理由是"**被 v3/v4/v5 取代**" ✓ —— ★★ **但"被取代"不等于"没有可能消费者"** ✗（★ 且**实测有一个真实引用方**：`tests/audit-diagram-assets.test.mjs:108` ✓ ⇒ **删除会先破坏测试** ✗）。
⇒ ★ **判定：暂留** ✓；若日后裁定为扩展，须**连同测试与两处名册一起**移出 ✓（`package.json#files` 与 `installer.js` 的托管表 ✓）。

### 其余 6 条（C-2…C-5、C-7、C-8）⇒ **全部暂留** ✓

★ 它们本就是 **medium** ✓，且**审计自己点名**：**C-4/C-5 被 `22 §18` 的两个未裁决问题牵住** ✓（"会务是否独立成卷" ✓、"跨机构结算信任模型" ✓）；C-2/C-3/C-8 的**反方考虑**也已由审计逐条写出 ✓。★ 按"**举证责任在删除一侧**"⇒ **未达到移出门槛** ✓✓。

### 结论

★ **本轮移出 0 条** ✓。★★ **这不是"没做事"** ✓：**审计提了 8 条，我逐条按原则复核后退回 8 条，并给出了可复核的理由与原文行号** ✓ —— ★ **这正是"审计只提供候选，判定权在原则"该有的样子** ✓。
