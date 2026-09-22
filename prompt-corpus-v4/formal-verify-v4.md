# V4 形式化验证交互语料（prompt corpus）

> 由 `formal-verify-v4.test.mjs` 落盘：非 `off` 模式下常驻**真正会读到**的 Lean 提示词原文
> （`vibe_v4_prompts` 的只读回显 + 一条真实投递的工作轮 + 工具 `hint`）。
> 工作区路径归一化为 `<WS>`，VibeMath 根归一化为 `<VIBEMATH>`：确定、可 diff、不含任何本机路径。

> 覆盖：`off`（无 Lean 文本）、`encourage`、**`require`**、对象 `passed` 后的**忠实性分支**
> （`encourage` / `require` 两种措辞各一份：只有 `require` 会声称"不定论"）、
> `blocked` 分支、平时工作轮的「顺手形式化」，以及回执契约里的 `formal` 字段。

## [0] verify · off/verify

```text
Resident r-1 — 团队验证。 The group is verifying object p-corpus（proposition，提出者 ）。
请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。
判定规则：仅当**全体常驻一致给 1（都认为是真）或一致给 0（都认为是假）**，才按「真/假」写入 Verified/；否则**只作为概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。
请给出你**诚实独立的判断**。


Reply with ONLY a JSON object:
{"vote":{"verdict":0.9,"reason":"<your logic>"}}
```

## [1] work · off/normal

```text
Resident researcher r-1 — 第 0 轮。一切由你和团队讨论决定。动手前先**读别人的库**对齐事实、避免重复；把新进展/结论**直接用 fs 写进你自己的文件**；想对团队说的话放 "input"（会转给其他常驻）。

团队成员：
- r-1「（未定）」active·轮0
- r-2「（未定）」active·轮0
New items:
  (no new messages)

Reply with ONLY a JSON object:
{"summary":"<what you did / decided this round, 1-3 sentences>","input":"<optional: a message to the whole team, or \"\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","task_desc":"<optional: why this task matters / what it covers|null>","claim_task":"<task id|null>","task_done":"<task id|null>","contextPct":40}
```

## [2] verify · encourage/verify

```text
Resident r-1 — 团队验证。 The group is verifying object p-corpus（proposition，提出者 ）。
请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。
判定规则：仅当**全体常驻一致给 1（都认为是真）或一致给 0（都认为是假）**，才按「真/假」写入 Verified/；否则**只作为概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。
请给出你**诚实独立的判断**。


【Lean 形式化验证（鼓励模式）】
  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先写 Lean 代码并执行。
  · 工具：vibe_v4_lean_run（执行）· vibe_v4_lean_archive（归档）· vibe_v4_lean_lib（查已有可复用库）
  · 工作目录：Formal/（相对项目根）；可复用定义放 <VIBEMATH>/Formal/Lib/，已证引理放 <VIBEMATH>/Formal/Proved/；写之前先 vibe_v4_lean_lib 查重。
  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：定义/对象/条件/假设/结论是否与命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。
  · 若你判断不值得或无法形式化，可以不做，但请在回执的 formal 字段写明难度判断（decision='blocked' 时必须写明 note）。
  · 归档可复用定义/引理前先跑通（vibe_v4_lean_archive run=true 或先 vibe_v4_lean_run）；跑不通不要入库。
  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或根本没有 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明"宿主无 Lean 工具链"——这两种都算显式阻塞原因，定论门禁可以据此放行。
  ▸ 若你在本轮把它形式化并跑通（vibe_v4_lean_archive kind='proof'），后续轮次的
    审查对象就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。

Reply with ONLY a JSON object:
{"vote":{"verdict":0.9,"reason":"<your logic>"}}
若你本轮做了形式化或给出难度判断，请一并加上：
{"formal":{"target":"p-corpus","decision":"used|blocked|defect","file":"Formal/p-corpus.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [3] work · encourage/normal

```text
Resident researcher r-1 — 第 0 轮。一切由你和团队讨论决定。动手前先**读别人的库**对齐事实、避免重复；把新进展/结论**直接用 fs 写进你自己的文件**；想对团队说的话放 "input"（会转给其他常驻）。

团队成员：
- r-1「（未定）」active·轮0
- r-2「（未定）」active·轮0
New items:
  (no new messages)


【顺手形式化（鼓励）】把你工作中常用或可能复用的对象、假设、新定义，用 Lean 形式化定义并归档到全局可复用库（vibe_v4_lean_archive kind='def'），已成立的引理归到 Formal/Proved/（kind='lemma'）；写之前先 vibe_v4_lean_lib 查重，避免重复定义。这会让后续的验证与证明省掉大量重复工作。归档前先跑通（vibe_v4_lean_run 或 run=true）；跑不通的定义不要进可复用库。
Reply with ONLY a JSON object:
{"summary":"<what you did / decided this round, 1-3 sentences>","input":"<optional: a message to the whole team, or \"\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","task_desc":"<optional: why this task matters / what it covers|null>","claim_task":"<task id|null>","task_done":"<task id|null>","contextPct":40,"formal":{"target":"<对象 id>","decision":"used|blocked|defect","file":"Formal/<对象 id>.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [4] work · encourage/heartbeat

```text
Resident researcher r-1 — CHECKPOINT（团队空闲，请由你们继续自主推进）。当前项目尚未解决（除非你已确认）。团队在等待有人继续：请**继续解决这个问题**——读他人的库对齐、推进某个子问题/引理/方法、尝试一条路线；或向团队发消息（input）、提议任务（propose_task）让大家分工。若你确实认为问题已解决、或已彻底无路可走，才提议开会（propose_meeting）让团队表决/商量、或声明 solved=true。默认立场是：**请推进，而不是停在原地。**
【顺手形式化（鼓励）】把你工作中常用或可能复用的对象、假设、新定义，用 Lean 形式化定义并归档到全局可复用库（vibe_v4_lean_archive kind='def'），已成立的引理归到 Formal/Proved/（kind='lemma'）；写之前先 vibe_v4_lean_lib 查重，避免重复定义。这会让后续的验证与证明省掉大量重复工作。归档前先跑通（vibe_v4_lean_run 或 run=true）；跑不通的定义不要进可复用库。
Reply with ONLY a JSON object:
{"summary":"<what you will do / what you advanced this round>","input":"<optional: a message to the whole team, or \"\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","task_desc":"<optional: why this task matters / what it covers|null>","claim_task":"<id|null>","contextPct":40,"formal":{"target":"<对象 id>","decision":"used|blocked|defect","file":"Formal/<对象 id>.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [5] work · encourage/coreRules

```text
[核心规则重申] 只有 Verified/（及标记"已验证·真/假"）算已确立；验证须全组一致（全真或全假）才作数，否则留库附平均概率；你只写自己的库（<VIBEMATH>/Projects/default/ 的 Progress/<你>/、Propos/<你>/、Methods/<你>/、Subproblems/<你>/），可只读任何人的库；任务分工由团队讨论决定；退出只输出一个 JSON 对象。
【顺手形式化（鼓励）】把你工作中常用或可能复用的对象、假设、新定义，用 Lean 形式化定义并归档到全局可复用库（vibe_v4_lean_archive kind='def'），已成立的引理归到 Formal/Proved/（kind='lemma'）；写之前先 vibe_v4_lean_lib 查重，避免重复定义。这会让后续的验证与证明省掉大量重复工作。归档前先跑通（vibe_v4_lean_run 或 run=true）；跑不通的定义不要进可复用库。
```

## [6] verify · require/verify

```text
Resident r-1 — 团队验证。 The group is verifying object p-corpus（proposition，提出者 ）。
请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。
判定规则：仅当**全体常驻一致给 1（都认为是真）或一致给 0（都认为是假）**，才按「真/假」写入 Verified/；否则**只作为概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。
请给出你**诚实独立的判断**。


【Lean 形式化验证（强制模式）】
  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先写 Lean 代码并执行。
  · 工具：vibe_v4_lean_run（执行）· vibe_v4_lean_archive（归档）· vibe_v4_lean_lib（查已有可复用库）
  · 工作目录：Formal/（相对项目根）；可复用定义放 <VIBEMATH>/Formal/Lib/，已证引理放 <VIBEMATH>/Formal/Proved/；写之前先 vibe_v4_lean_lib 查重。
  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：定义/对象/条件/假设/结论是否与命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。
  · **本模式要求**：必须产出 Lean 形式化，或**必须**给出显式的阻塞原因（vibe_v4_lean_archive kind='blocked' note=… 或回执 formal.note）。若两者都没有，本次裁定不会生效，会被记为未定论（原因 formal-required）并进入「形式化待办」。
  · 归档可复用定义/引理前先跑通（vibe_v4_lean_archive run=true 或先 vibe_v4_lean_run）；跑不通不要入库。
  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或根本没有 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明"宿主无 Lean 工具链"——这两种都算显式阻塞原因，定论门禁可以据此放行。
  ▸ 若你在本轮把它形式化并跑通（vibe_v4_lean_archive kind='proof'），后续轮次的
    审查对象就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。

Reply with ONLY a JSON object:
{"vote":{"verdict":0.9,"reason":"<your logic>"}}
若你本轮做了形式化或给出难度判断，请一并加上：
{"formal":{"target":"p-corpus","decision":"used|blocked|defect","file":"Formal/p-corpus.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [7] verify · require/verify/debate

```text
Resident r-1 — 团队验证。 The group is verifying object p-corpus（proposition，提出者 ）。
请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。
判定规则：仅当**全体常驻一致给 1（都认为是真）或一致给 0（都认为是假）**，才按「真/假」写入 Verified/；否则**只作为概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。
请给出你**诚实独立的判断**，并参考他人意见：


【Lean 形式化验证（强制模式）】
  · 请先判断该对象的**实现难度**：若能在可接受的工作量内形式化，优先写 Lean 代码并执行。
  · 工具：vibe_v4_lean_run（执行）· vibe_v4_lean_archive（归档）· vibe_v4_lean_lib（查已有可复用库）
  · 工作目录：Formal/（相对项目根）；可复用定义放 <VIBEMATH>/Formal/Lib/，已证引理放 <VIBEMATH>/Formal/Proved/；写之前先 vibe_v4_lean_lib 查重。
  · **一旦 Lean 通过，你唯一需要确认的就是忠实性**：定义/对象/条件/假设/结论是否与命题原文逐条一致。请把注意力放在这种核对上，而不是重新做一遍推导。
  · **本模式要求**：必须产出 Lean 形式化，或**必须**给出显式的阻塞原因（vibe_v4_lean_archive kind='blocked' note=… 或回执 formal.note）。若两者都没有，本次裁定不会生效，会被记为未定论（原因 formal-required）并进入「形式化待办」。
  · 归档可复用定义/引理前先跑通（vibe_v4_lean_archive run=true 或先 vibe_v4_lean_run）；跑不通不要入库。
  · 宿主没有 Lean 工具链（LEAN_NOT_FOUND）或根本没有 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明"宿主无 Lean 工具链"——这两种都算显式阻塞原因，定论门禁可以据此放行。
  ▸ 若你在本轮把它形式化并跑通（vibe_v4_lean_archive kind='proof'），后续轮次的
    审查对象就会从"推导是否正确"变成"Lean 代码是否忠实于命题"。

Reply with ONLY a JSON object:
{"vote":{"verdict":0.9,"reason":"<your logic>"}}
若你本轮做了形式化或给出难度判断，请一并加上：
{"formal":{"target":"p-corpus","decision":"used|blocked|defect","file":"Formal/p-corpus.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [8] work · require/normal

```text
Resident researcher r-1 — 第 0 轮。一切由你和团队讨论决定。动手前先**读别人的库**对齐事实、避免重复；把新进展/结论**直接用 fs 写进你自己的文件**；想对团队说的话放 "input"（会转给其他常驻）。

团队成员：
- r-1「（未定）」active·轮0
- r-2「（未定）」active·轮0
New items:
  (no new messages)


【顺手形式化（强制）】把你工作中常用或可能复用的对象、假设、新定义，用 Lean 形式化定义并归档到全局可复用库（vibe_v4_lean_archive kind='def'），已成立的引理归到 Formal/Proved/（kind='lemma'）；写之前先 vibe_v4_lean_lib 查重，避免重复定义。本模式下，任何要定论为真/假的对象都必须先有 Lean 通过或显式阻塞记录。归档前先跑通（vibe_v4_lean_run 或 run=true）；跑不通的定义不要进可复用库。
Reply with ONLY a JSON object:
{"summary":"<what you did / decided this round, 1-3 sentences>","input":"<optional: a message to the whole team, or \"\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","task_desc":"<optional: why this task matters / what it covers|null>","claim_task":"<task id|null>","task_done":"<task id|null>","contextPct":40,"formal":{"target":"<对象 id>","decision":"used|blocked|defect","file":"Formal/<对象 id>.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [9] verify · passed/fidelity

```text
Resident r-1 — 团队验证。 The group is verifying object p-corpus-passed（proposition，提出者 ）。
请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。
判定规则：仅当**全体常驻一致给 1（都认为是真）或一致给 0（都认为是假）**，才按「真/假」写入 Verified/；否则**只作为概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。
请给出你**诚实独立的判断**。


【Lean 形式化验证（强制模式）】
  · 该对象已有**通过的 Lean 形式化证明**（Verified/Lean/p-corpus-passed.lean，最近运行 exit 0）。
    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的
    定义 / 对象 / 条件 / 假设 / 结论是否与命题原文**完全一致**。
  ▸ 一致 → verdict = 1。
  ▸ **发现任何偏差，不要投 0**：偏差只说明**形式化不合格**，不代表命题为假。此时请：
      ① verdict 给一个严格介于 0 与 1 之间的值（记为弃权），并在 reason 里写清偏差；
      ② 用回执 formal:{decision:'defect', note:'<具体偏差>'} 记录它。框架会撤回这条证明的
         「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办），本次裁定**不定论**；
         修正形式化并重新跑通后再投票。
  ▸ 只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 0，并在 reason 里写清独立理由。

Reply with ONLY a JSON object:
{"vote":{"verdict":0.9,"reason":"<your logic>"}}
若你本轮做了形式化或给出难度判断，请一并加上：
{"formal":{"target":"p-corpus-passed","decision":"used|blocked|defect","file":"Formal/p-corpus-passed.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [10] verify · passed/fidelity (encourage)

```text
Resident r-1 — 团队验证。 The group is verifying object p-corpus-passed（proposition，提出者 ）。
请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。
判定规则：仅当**全体常驻一致给 1（都认为是真）或一致给 0（都认为是假）**，才按「真/假」写入 Verified/；否则**只作为概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。
请给出你**诚实独立的判断**。


【Lean 形式化验证（鼓励模式）】
  · 该对象已有**通过的 Lean 形式化证明**（Verified/Lean/p-corpus-passed.lean，最近运行 exit 0）。
    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的
    定义 / 对象 / 条件 / 假设 / 结论是否与命题原文**完全一致**。
  ▸ 一致 → verdict = 1。
  ▸ **发现任何偏差，不要投 0**：偏差只说明**形式化不合格**，不代表命题为假。此时请：
      ① verdict 给一个严格介于 0 与 1 之间的值（记为弃权），并在 reason 里写清偏差；
      ② 用回执 formal:{decision:'defect', note:'<具体偏差>'} 记录它。框架会撤回这条证明的
         「已通过」状态（降级为 attempted、删除归档证明、写入形式化待办）；本档没有门禁：请务必给弃权值，以保证本轮无法得出一致结论；
         修正形式化并重新跑通后再投票。
  ▸ 只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 0，并在 reason 里写清独立理由。

Reply with ONLY a JSON object:
{"vote":{"verdict":0.9,"reason":"<your logic>"}}
若你本轮做了形式化或给出难度判断，请一并加上：
{"formal":{"target":"p-corpus-passed","decision":"used|blocked|defect","file":"Formal/p-corpus-passed.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [11] verify · blocked/verify

```text
Resident r-1 — 团队验证。 The group is verifying object p-corpus-blocked（proposition，提出者 ）。
请给出你对「该对象为真」的**正确概率 `verdict`**，仅一个 0–1 数值：**1 = 绝对为真，0 = 绝对为假，0.5 = 完全不确定，其余为介于其间的程度**（不要给 TRUE/FALSE，就给一个数值）。
判定规则：仅当**全体常驻一致给 1（都认为是真）或一致给 0（都认为是假）**，才按「真/假」写入 Verified/；否则**只作为概率数值（一种程度）保留在库中**，附全组平均正确概率，不写成真/假。
请给出你**诚实独立的判断**。


【Lean 形式化验证（强制模式）】
  · 该对象已被记录为**形式化阻塞**：需要未形式化的解析数论框架。
    请复核这个判断是否成立；若你认为其实可以形式化，请指出来并动手做。
  ▸ 因此请把 verdict 用在"这个阻塞判断是否成立 / 是否仍有别的形式化路线"上，并给出理由。

Reply with ONLY a JSON object:
{"vote":{"verdict":0.9,"reason":"<your logic>"}}
若你本轮做了形式化或给出难度判断，请一并加上：
{"formal":{"target":"p-corpus-blocked","decision":"used|blocked|defect","file":"Formal/p-corpus-blocked.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [12] contract · formal reply contract (voting prompt)

```text
"formal":{"target":"p-corpus-passed","decision":"used|blocked|defect","file":"Formal/p-corpus-passed.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [13] contract · formal reply contract (work prompt)

```text
"formal":{"target":"<对象 id>","decision":"used|blocked|defect","file":"Formal/<对象 id>.lean","note":"难度判断/阻塞原因/具体偏差"}}
```

## [14] work · require/real work wake

```text
Resident researcher r-2 — 第 0 轮。一切由你和团队讨论决定。动手前先**读别人的库**对齐事实、避免重复；把新进展/结论**直接用 fs 写进你自己的文件**；想对团队说的话放 "input"（会转给其他常驻）。

团队成员：
- r-1「（未定）」active·轮0
- r-2「（未定）」active·轮0
New items:
  (no new messages)


【顺手形式化（强制）】把你工作中常用或可能复用的对象、假设、新定义，用 Lean 形式化定义并归档到全局可复用库（vibe_v4_lean_archive kind='def'），已成立的引理归到 Formal/Proved/（kind='lemma'）；写之前先 vibe_v4_lean_lib 查重，避免重复定义。本模式下，任何要定论为真/假的对象都必须先有 Lean 通过或显式阻塞记录。归档前先跑通（vibe_v4_lean_run 或 run=true）；跑不通的定义不要进可复用库。
Reply with ONLY a JSON object:
{"summary":"<what you did / decided this round, 1-3 sentences>","input":"<optional: a message to the whole team, or \"\">","solved":false,"propose_verify":"<id|null>","propose_meeting":"<agenda|null>","propose_task":"<task title|null>","task_desc":"<optional: why this task matters / what it covers|null>","claim_task":"<task id|null>","task_done":"<task id|null>","contextPct":40,"formal":{"target":"<对象 id>","decision":"used|blocked|defect","file":"Formal/<对象 id>.lean","note":"难度判断/阻塞原因/具体偏差"}}

[NEW MESSAGE from facilitator]
请继续推进。
```

## [15] hint · lean_run hint (green)

```text
通过。若是某个对象的证明，请用 vibe_v4_lean_archive kind='proof' 归档（会写入 Verified/Lean/ 并把审查对象变成忠实性）；若是可复用定义/引理，用 kind='def'/'lemma' 归档到全局库——归档前先跑通（run=true 或先 vibe_v4_lean_run）：跑不通的定义不要进可复用库。
```

## [16] hint · lean_lib hint

```text
复用优先：先在 Lib/ 里找现成定义；新定义用 vibe_v4_lean_archive kind='def' 归档，已证引理用 kind='lemma'。
```
