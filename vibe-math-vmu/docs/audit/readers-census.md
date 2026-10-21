# 读点普查（readers census）—— 工具正名与 B 类边界裁定

> 工具：`scripts/audit-readers.mjs`（★ 由 `scripts/audit-no-consumer.mjs` 改名）
> 依据：`vibe-math-vmu/docs/01-philosophy.md` §1.4.1（:46, :51-54）／§1.4.2（:70-76）／§1.4.3（:80-83）／§1.4.4（:87）
> 性质：**人工诊断，不进 `regen --check`**（AGENTS.md §7.4：`--check` 必须确定性且无副作用）。

## 1. 为什么改名（不是措辞洁癖）

`docs/01` §1.4.1 明确：**"消费者"＝使用者可能的需求**，★ **不是"仓内代码有没有引用"**；§1.4.2 进一步要求**两层必须分开叫**：
| 层 | 该问什么 | 该叫什么 |
|---|---|---|
| 设计／准入层 | 使用者**可能**需不需要它 | **消费者** |
| **接线／门禁层**（本工具） | 仓内**有没有读点** | **读点／读取者（reader）** |

§1.4.2 逐字警告：★ **"用宽义去改那张表，等于把'没人读'说成'有人读'"**。
旧工具用**「消费者」**去审**「零生产调用者」** —— 正是被禁止的混用：它会把**接线缺陷**说成**"该删的东西"**（§1.4.3：零引用**不是**删除理由，只能触发追问"用户能不能用上？"；而 §1.4.4：也不许用"用户可能用"给**无声的假声明**续命）。
⇒ 新名字与四类措辞**全部改说读点语言**。

## 2. 四类新措辞

| 类 | 新措辞 | 含义与处置 |
|---|---|---|
| **A** | **内部机制【无读点】** | 应被接线却没接 ⇒ **缺陷**（`mailbox.flush` 是实测例） |
| **B** | **对外 API【无仓内读点】** | **常态，不是缺陷**（AGENTS.md §7.1：`export` 就是对外 API）；每条要么在 §3 标注，要么报 `BOUNDARY-UNCLEAR` |
| **C** | **仅【测试读点】** | 生产无读点；测试是唯一读者 |
| **D** | **死代码** | 与读点无关（另一件事）：被取代或不可达 |

## 3. B 类标注（PUBLIC_API）—— 为什么它没有仓内读点

| 模块::符号 | 为什么没有仓内读点（可核对） |
|---|---|
| `kernel/bus.js::hookRegistryProblems` | 总线自检面：把注册表问题暴露给诊断者；正常运行时问题集合为空 |
| `kernel/guard.js::readSafetyMemoryMb` | 内存安全阈值读取面：宿主／部署方在装配时决定，框架不自设策略 |
| `kernel/ids.js::currentIds` | id 快照读取面：供观察者读取；框架内部走增量 id |

★ 标注表在脚本里（`PUBLIC_API`），**每条一句可核对理由**；新增无读点导出会被报成 `BOUNDARY-UNCLEAR`，`--strict` 下**必红** ⇒ 边界不许保持"不清"。

## 4. 裁定为缺陷（已具名移交，不是"边界不清"）

| 符号 | 事实 | owner |
|---|---|---|
| `kernel/reportfeedback.js::assertFiniteOrder` | 模块头声明它是"宿主不校验 order ⇒ 我们自己校验"的**调用侧守卫**，但投递路径 `kernel/reportfeedbackdelivery.js` **从未调用它**；全仓（含 packs/tests/docs）除自身定义与注释外 **0 读点**。见 `docs/acceptance/phase2-pack-round11-a1-wire.md:24-25,53` 记录的"投递侧仍传 undefined order" | `reportfeedbackdelivery.js` 的写者 |
| `kernel/reportfeedback.js::boundFeedback` | 截断必须"自述被截断"；投递路径不用它 ⇒ 无人保证截断被如实报告；全仓 0 读点（测试也不读） | 同上 |

它们**没有**被标注成"对外 API"——按 §1.4.4，那会是用"用户可能用"给无声的假声明续命。`--strict` 在这两条非空时失败。

## 5. `--deep`：对象内部方法的读点（+ 噪声控制）

- **为什么**：顶层 `function/const` 与内核服务方法之外，**对象字面量里的方法**也可能是机制（旧工具枚举不到 ⇒ 可能漏 A 类）。
- **怎么控噪声**：① 只把**名字命中机制动词表**（`flush/drain/tick/sweep/pump/settle/…`）的对象方法纳入；② **分类按读者优先**：`object-method` 若只有测试读 ⇒ **C**（不是 A），否则才 A ⇒ 公开面方法不会把 A 撑大；③ 行号取自**原始源码**（不是去注释后的行号，避免行号漂移）。
- **实测**：`--deep` 現 **A=0 / C=11 / D=11**（多出的一条 `kernel/ballot.js:634 processReadings` 是"仅测试读点"的公开面方法）⇒ 与默认模式相比只多 **1** 条噪声。
- **`--selftest`**：合成样本证明 ① 对象方法 `sweepOnce()` 无读点 ⇒ **报出 A**；② 被 `this.drainNow()` 读的对象方法 ⇒ **不报**（正反成对）。

## 6. 实测计数（2026-10-21，当前树）

```
默认：  A=0  B=5（标注 3 / 缺陷 2 / 边界不清 0）  C=10  D=11
--deep：A=0  B=5（同上）                        C=11  D=11
```

## 7. 怎么跑

```bash
node scripts/audit-readers.mjs              # 普查（默认模式）
node scripts/audit-readers.mjs --deep       # 加上对象内部方法
node scripts/audit-readers.mjs --strict     # A/C/边界不清/已裁缺陷 任一非空 ⇒ exit 1
node scripts/audit-readers.mjs --selftest   # 证明判据能命中已知正例（正反成对）
```
