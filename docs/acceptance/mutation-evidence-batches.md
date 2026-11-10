# Mutation evidence — batch history（仓内 PROVEN-RED 的批次账）

> 这份文件记录**谁把哪些规则从 REHEARSED 抬到 PROVEN**，一行一批。逐条证据由
> `node scripts/audit/mutations/run.mjs --all --doc` 生成在 `docs/acceptance/mutation-evidence.md`；
> 本文件只记批次边界与当批的特殊发现，不重复 93 行表。

| 批次 | 任务 | 新增 PROVEN-RED | 累计 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | TB-2687 | 13（E3 E14 E15 E16 E26 E34 E36 F1 F2 G8 G14 D8 E13） | 13 | 装置首次入仓：`scripts/audit/mutations/{manifest.json,run.mjs}` + 本套件 + 生成式 93 行表；三条负控（NO-RED / WRONG-ASSERTION / PRE-RED）。 |
| 2 | TB-2702 | +15（A1 A4 A5 B1 C6 D2 D5 E2 G3 C12 C15 G6 E28 G10 G5） | 28 | 同一装置上真跑，全部 RED；新增第四条负控 `MUTATION-ON-CRITERION`（变异打在 `tests/**` 上会被装置拒绝）。 |
| 3 | TB-2706 | +15（B4 A6 B2 C5 D3 C9 D6 E10 E11 F4 A8 E7 E18 E22 E31） | 43 | 装置先修好「套件硬编码原仓路径」的盲点（见下），B4 因此从 NO-RED 变 RED 并入册；全量 43/43 RED · 159 603 ms。 |

## 批次 2 的特殊发现（诚实记录，不藏）

- **B4 在本批变成 NO-RED**：把 `vibe-math-vmu/packs/v5r/blueprint.js` 的
  `if (Number.isFinite(n) && n >= 0) return { ms: Math.floor(n), source: 'setting' }`
  改成 `if (false) …` 后，`tests/vmu-b4-stale-window-setting.test.mjs` 仍然全绿。
  TB-2679（批次 3）时同一变异曾让该套件红 9 条。**批次 3（TB-2706）已查清**：不是第二道守卫，
  而是套件把原仓路径写死、runner 的副本变异从未被执行（`NO-OP-IMPORT`，装置盲点）；见下文
  「批次 3 的特殊发现」。按任务书「改了但全绿要立刻报」的口径，
  本批**没有**把它塞进 manifest 充数；改用 G5（`kernel/human.js` 的 `queued: true → false`）补足 15 条。
- 15 条里 5 条落在 `vibe-math-vmu/packs/v5r/tools.js`（A4 B1 C6 C12 C15）。该文件当时有并发车道在改，
  所以每条都先核 `anchor` 在**当前工作树**恰好出现 1 次，再跑；runner 每次从工作树复制，跑的是同一份文本。

## 批次 2 逐条证据（15 条，全部实跑 RED）

| 规则 | 变异（file :: anchor → replace） | 套件 | 期望红的断言标题 | 真红原文（截断） |
| --- | --- | --- | --- | --- |
| A1 | `vibe-math-vmu/tools/mailbox.js :: if (caller && String(sender) !== caller) { → if (false) {` | `vmu-run128-proxy-doors.test.mjs` | a member signing as office is REFUSED | `FAIL a member signing as office is REFUSED - {"ok":true,"message":""}…` |
| A4 | `vibe-math-vmu/packs/v5r/tools.js ::   const row = membersOf(kernel).roster().filter((m) => m.id  →   const row = membersOf(kernel).roster()` | `vmu-a2a3-seats-and-bounds.test.mjs` | ★ 非 chair 成员 ⇒ 具名拒 VMU_NOT_PERMITTED | `FAIL ★ 非 chair 成员 ⇒ 具名拒 VMU_NOT_PERMITTED - {"ok":true,"tool":"vibe_v5_overview","by":"r-1","roster":[{"id":"r-acad","slot":"chair","state":"live"},{"…` |
| A5 | `vibe-math-vmu/tools/control.js :: await kernel.members.hire({ id: String(member_id), slot: Str → ({})` | `vmu-control.test.mjs` | ★★★ CRITERION 1: after hire the KERNEL roster is NON-EMPTY (the bug was ok:true with an empty roster) | `FAIL ★★★ CRITERION 1: after hire the KERNEL roster is NON-EMPTY (the bug was ok:true with an empty roster) [{"before":0,"after":0,"codes":[]}]…` |
| B1 | `vibe-math-vmu/packs/v5r/tools.js :: if (!unanimousZero || !subjectOk || expectedForm !== 'debate → if (false) {` | `vmu-run97-verified-gate.test.mjs` | ① a disproof without its ruling is refused | `FAIL ① a disproof without its ruling is refused…` |
| C6 | `vibe-math-vmu/packs/v5r/tools.js :: if (!leanPassed && conformanceWord === '' && !alreadyVerifie → if (false) {` | `vmu-c5-c8-card-integrity.test.mjs` | 声明 complete 但没有任何登记凭据 ⇒ VMU_INVALID_ARGUMENT | `FAIL 声明 complete 但没有任何登记凭据 ⇒ VMU_INVALID_ARGUMENT - true…` |
| D2 | `vibe-math-vmu/kernel/mailbox.js ::       const ackedIds = []       if (allRows.length) mailbox. →       const ackedIds = allRows.map((e) =` | `vmu-mailbox.test.mjs` | an urgent flush DELIVERS the body but does NOT ack it (the inbox must still show the message) | `FAIL an urgent flush DELIVERS the body but does NOT ack it (the inbox must still show the message)…` |
| D5 | `vibe-math-vmu/kernel/panel.js :: next.planAt = clock() → next.planAt = 0` | `vmu-panel.test.mjs` | the framework wrote every ...At | `FAIL the framework wrote every ...At…` |
| E2 | `vibe-math-vmu/kernel/meetings.js :: return scope.electorate.every((id) => m.present instanceof S → return true` | `vmu-meeting-quorum-floor.test.mjs` | R3-2. ★★★ at the due moment with a roster member absent the meeting WAITS | `FAIL R3-2. ★★★ at the due moment with a roster member absent the meeting WAITS — the state the rule needs is reachable (before: `required:0 ⇒ met:true…` |
| G3 | `vibe-math-vmu/kernel/human.js :: if (c.gatedActions.indexOf(act) === -1) { → if (true) {` | `vmu-human-gate.test.mjs` | a gated action is refused by name while pending | `FAIL a gated action is refused by name while pending [null]…` |
| C12 | `vibe-math-vmu/packs/v5r/tools.js :: if (formalPolicy && formalPolicy.requireFormal === true) { → if (true) {` | `vmu-run135-formal-required.test.mjs` | ★★★ 反：off 下同一次裁定成功（zero-policy 的默认不能被闸悄悄改掉） | `FAIL ★★★ 反：off 下同一次裁定成功（zero-policy 的默认不能被闸悄悄改掉） - "VMU_PACK_V5R_FORMAL_REQUIRED"…` |
| C15 | `vibe-math-vmu/packs/v5r/tools.js :: 'recommendation：' + bodyAction → 'action：' + bodyAction` | `vmu-run61-feedback-body.test.mjs` | the stored body carries the RECOMMENDATION under its own label | `FAIL the stored body carries the RECOMMENDATION under its own label - "{\"ok\":true,\"tool\":\"vibe_v5_read_library\",\"card\":{\"ok\":true,\"expanded…` |
| G6 | `vibe-math-vmu/kernel/turn/index.js :: sawJsonish ? 'VMU_TURN_BAD_JSON' : 'VMU_TURN_NO_FENCE' → sawJsonish ? 'VMU_TURN_BAD_JSON' : 'VMU_` | `vmu-turn.test.mjs` | T6. ★★ a reply with no fence is refused as such | `FAIL T6. ★★ a reply with no fence is refused as such [{"code":"VMU_TURN_BAD_JSON"}]…` |
| E28 | `vibe-math-vmu/kernel/meetingverdict.js ::     estimate: !decided, →     estimate: false,` | `vmu-meeting-verdict.test.mjs` | ① 不一致 ⇒ 算术平均，并明确标成「估计」而不是「裁定」 | `FAIL - ① 不一致 ⇒ 算术平均，并明确标成「估计」而不是「裁定」 :: Expected values to be strictly equal:…` |
| G10 | `vibe-math-vmu/kernel/directions.js ::   'reuse', → ` | `vmu-run236-direction-card.test.mjs` | exactly nine fields (G10 names nine) | `FAIL exactly nine fields (G10 names nine) - 8…` |
| G5 | `vibe-math-vmu/kernel/human.js :: return Object.assign({ ok: false, code: CODE.approvalPending → return Object.assign({ ok: false, code: ` | `vmu-human-gate.test.mjs` | the refusal carries queued=true and a requestId | `FAIL the refusal carries queued=true and a requestId [{"ok":false,"code":"VMU_HUMAN_APPROVAL_PENDING","queued":false,"state":"pending","waitsForever":…` |

> 复跑：`node scripts/audit/mutations/run.mjs --rule <ID>`；全量：`node scripts/audit/mutations/run.mjs --all`（本批 28/28 RED · 106421 ms）。

## 批次 3 的特殊发现：B4 为什么昨天红、今天绿（一个变异，两种装置）

批次 2 里 B4 变异（`packs/v5r/blueprint.js` 的 `staleWindowOf` 在 `n=0` 时返回 `policy` 而不是 `setting`）
在**仓内装置**上全绿，但在 TB-2679 的**外部副本**上曾红 9 条。归因不是「第二道守卫」，也不是「判据没牙」，
而是装置自身的一个盲点：`tests/vmu-b4-stale-window-setting.test.mjs` 第 30 行把仓库根写死为
`const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'`。runner 把仓库复制到临时目录并在副本里做变异，
但该套件仍从**原仓** `import` 实现（`pathToFileURL(join(REPO, "vibe-math-vmu/…"))`），于是变异从未被执行。

决定性探针（同一副本、同一变异，只改套件里的 REPO 指向）：

- A 副本已变异、套件仍指原仓：`passed=32 failed=0` —— 变异不可见。
- B 把套件里的 REPO 改指副本后再跑：`failed=9`，首条红为
  `★ 0 is a LEGAL window (any age is overdue): the resolver accepts the boundary instead of treating 0 as absent` ——
  与 TB-2679 的 9 条完全一致。

`tests/` 里这种硬编码原仓路径共 **37 个文件**（另有 6 处反斜杠形式只出现在注释/样例文本里，不参与 import）。
修法在装置侧（不动任何实现/判据）：`run.mjs` 的 `copyRepo()` 复制完成后，递归重写副本 `tests/**/*.{mjs,js}` 中
的 `D:/wd/vibemath开发/Vibe-Mathematics`（及历史 `file:///…%E5%BC%80%E5%8F%91/…` 形式）为副本路径，
若重写后仍有残留则抛 `MUTATION-PATH-LEAK` 拒绝开跑。修好后先重跑原 28 条（28/28 RED，确认重写没有改变结论），
再把 B4 入册：`--rule B4` 单跑 RED，首条红正是上面那句。

> 教训：**装置和判据一样需要反关灯**。一个「复制仓库再变异」的 runner，如果套件能从原仓 import，
> 它测的就是未变异的产品；这种情况下 NO-RED 不代表规则没被守住，只代表装置没测到。

## 批次 3 逐条证据（15 条，全部实跑 RED）

| 规则 | 变异（file :: anchor → replace） | 套件 | 期望红的断言标题 | 真红原文（截断） |
| --- | --- | --- | --- | --- |
| B4 | `vibe-math-vmu/packs/v5r/blueprint.js :: if (Number.isFinite(n) && n >= 0) return { ms: Math.floor(n… → if (false) return { ms: Math.floor(n), …` | `vmu-b4-stale-window-setting.test.mjs` | ★ 0 is a LEGAL window (any age is overdue): the resolver accepts the boundary instead of treating 0 as absent | `FAIL ★ 0 is a LEGAL window (any age is overdue): the resolver accepts the boundary instead of treating 0 as absent :: {"ms":2592000000,"source":"poli…` |
| A6 | `vibe-math-vmu/kernel/meetings.js :: if (!K.eligibleSeats.includes(seat)) { → if (false) {` | `vmu-meetings.test.mjs` | ★ A1③ 反: a TEMP seat is refused by the DECLARED seats, and the refusal names the slot and the seats | `FAIL - ★ A1③ 反: a TEMP seat is refused by the DECLARED seats, and the refusal names the slot and the seats [null]` |
| B2 | `vibe-math-vmu/packs/v5r/verification-gates.js :: if (ev.literature && typeof ev.literature.reference === 'st… → if (false) {` | `vmu-run236-b2-literature.test.mjs` | a p=1 proposition WITH a literature reference is accepted | `FAIL a p=1 proposition WITH a literature reference is accepted :: {"ok":false,"code":"VMU_PACK_V5R_P1_NEEDS_DEBATE","message":"p=1 的命题卡必须带 **verified…` |
| C5 | `vibe-math-vmu/kit/handlers.js :: const body = cardBody(args, required, extra)
      + (progr… → const body = cardBody(args, required, e…` | `vmu-c5-c8-card-integrity.test.mjs` | ★ 从读面读回来，卡体里真的有 `- 进度：…` 那一行 | `FAIL ★ 从读面读回来，卡体里真的有 `- 进度：…` 那一行` |
| D3 | `vibe-math-vmu/kernel/mailbox.js :: (subjects.length ? '标题：' + subjects.join('；') + '。' : '') +… → (subjects.length ? '标题：' + subjects.joi…` | `vmu-mailbox.test.mjs` | ★ 反（唯一真证据）：非紧急投递物【任何字段/JSON 文本】都不含正文标记串 | `FAIL ★ 反（唯一真证据）：非紧急投递物【任何字段/JSON 文本】都不含正文标记串 [{"member":"r-2","urgent":false,"count":1,"from":["r-1"],"kinds":["note"],"oldestAt":"2026-10-09T00:00:0…` |
| C9 | `vibe-math-vmu/kit/tools.js :: track: 'methods', kind: 'method' → track: 'progress', kind: 'method'` | `vmu-v5r-tools.test.mjs` | record_method writes onto the methods track (p=0 ⇒ settled, which is what the pack stance demands) | `FAIL record_method writes onto the methods track (p=0 ⇒ settled, which is what the pack stance demands) - {"ok":true,"tool":"vibe_v5_record_method","…` |
| D6 | `vibe-math-vmu/kernel/panel.js :: viewAudit.push({ at, by: viewer === null || viewer === unde… → void 0` | `vmu-panel.test.mjs` | the view writes an audit row naming who saw whom | `FAIL the view writes an audit row naming who saw whom` |
| E10 | `vibe-math-vmu/kernel/meetings.js :: wallLimitMs: wallLimitRequested === null ? K.hardLimitMs : … → wallLimitMs: K.hardLimitMs,` | `vmu-run101-meeting-bound.test.mjs` | the receipt reports the CHAIR-SET bound (900000), not the deployment default | `FAIL the receipt reports the CHAIR-SET bound (900000), not the deployment default - 1800000` |
| E11 | `vibe-math-vmu/kernel/meetings.js :: remaining: Math.max(0, seq.length - idx), → remaining: 0,` | `vmu-meeting-types.test.mjs` | ★★ the pending count READS BACK from the kernel (a declared-only sequence would be invisible here) | `FAIL ★★ the pending count READS BACK from the kernel (a declared-only sequence would be invisible here) - {"total":3,"index":0,"remaining":0,"next":{…` |
| F4 | `vibe-math-vmu/kit/paper.js :: return { allowed: false, policy, ledger, reason: 'opened', … → return { allowed: false, policy, ledger…` | `vmu-paper-office-consult.test.mjs` | ★ 正：未问所办 ⇒ 具名拒 VMU_OFFICE_CONSULT_REQUIRED | `✗ ★ 正：未问所办 ⇒ 具名拒 VMU_OFFICE_CONSULT_REQUIRED :: VMU_OFFICE_CONSULT_TIMEOUT` |
| A8 | `vibe-math-vmu/packs/v5r/seat-faces.js :: + '故 temp 不给；方法卡与子问题卡同样不给临时工',
    allow: Object.freeze({ c… → + '故 temp 不给；方法卡与子问题卡同样不给临时工',
    allo…` | `vmu-a7-a8-seat-rights.test.mjs` | ★★ temp ⇒ all eight (proposition / progress / five lean_* / paper) are DENIED and in the derived deny list | `FAIL ★★ temp ⇒ all eight (proposition / progress / five lean_* / paper) are DENIED and in the derived deny list - ["vibe_v5_record_proposition"]` |
| E7 | `vibe-math-vmu/packs/v5r/tools.js :: const typeInfo = meetingTypeOf(has(args.type) ? str(args.ty… → const typeInfo = meetingTypeOf('ordinar…` | `vmu-meeting-procedures-catalog.test.mjs` | the planning receipt reports its own four-step skeleton (per-type, not one shared blob) | `FAIL the planning receipt reports its own four-step skeleton (per-type, not one shared blob) - null` |
| E18 | `vibe-math-vmu/kernel/ballot.js :: if (choiceCap !== null && choices > choiceCap) { → if (false) {` | `vmu-wave2-e18-ballot-max-choices.test.mjs` | code is VMU_BALLOT_CHOICE_COUNT | `FAIL code is VMU_BALLOT_CHOICE_COUNT - {"code":null,"out":{"ok":true,"accepted":true,"member":"r-1","value":[1,0],"voteKind":"decisive","declared":[1…` |
| E22 | `vibe-math-vmu/packs/v5r/meeting-procedures.js :: Object.freeze({ id: 'debate', label: '辩论', purpose: '围绕一个命题… → Object.freeze({ id: 'debate', label: '辩…` | `vmu-meeting-types.test.mjs` | ONLY the debate type requires the object field (the rule names only debate) | `FAIL ONLY the debate type requires the object field (the rule names only debate) - {"id":"debate","label":"辩论","purpose":"围绕一个命题（含已写完证明的命题卡 / 文件引用）辩论…` |
| E31 | `vibe-math-vmu/packs/v5r/meeting-procedures.js :: title: '辩论会议 · 推荐流程骨架',
  binding: 'recommendation', → title: '辩论会议 · 推荐流程骨架',
  binding: 'gat…` | `vmu-meeting-types.test.mjs` | ★ the binding is machine-readably a RECOMMENDATION (the rule: 是否遵循完全由院士自己决定) | `FAIL ★ the binding is machine-readably a RECOMMENDATION (the rule: 是否遵循完全由院士自己决定) - "gate"` |

> 复跑：`node scripts/audit/mutations/run.mjs --rule <ID>`；全量：`node scripts/audit/mutations/run.mjs --all`（本批 43/43 RED · 159 603 ms）。

## 附注：同窗口的 RULE E 修法（不是变异批次）

本轮另修 RULE E 七处（`tests/vmu-run2691-read-faces.test.mjs` 三处 `EMPTY-ON-EMPTY` + `settleRest` 前置守卫，`tests/verify-run.test.mjs` 两处：`c.evidence` 非空守卫、空语料 `EMPTY_ALLOWED`），`node tests/audit-declaration-criterion.test.mjs` 从 **90 passed / 4 failed → 93 passed / 1 failed**（唯一剩余 `regen-all --check` 为生成件 stale，由 Lead 收口）。

