# Phase 2 · `vmu-accept` · Round 20：**A1 收口**（三步状态写死）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`（**新增 §0.10「A1 收口」** ＋ A1 行改写 ＋ HEAD 行）；② 本报告（未跟踪 ⇒ §5.9-24 自指现场）。
> **纪律**：**只读**（侦察）＋ **只写**总账与本报告；未跑全量／`regen-all`／git。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD（我实读） | **`3b84a45`**（*test(vmu): pin the four host states apart, and record where the collision count is one BY DESIGN*） |
| ★ **真机（A1 第二步）提交面** | **`9dc746e`**；★ **payload `CDCBA5C9875C86BA`**，★ **scratch `96F52A647F3FB924`**（★ **两者不同 ⇒ 夹具先拦下**，同步后 ALL EQUAL 才跑） |
| 工作树 | 只有我自己的两处写入（未提交）＋ `?? docs/acceptance/phase2-assistant-round19-gate3.md` |
| 我的窗口 | 2026-10-16 **13:1x – 13:3x** |

## 1. ★★ 收口口径（写死在总账 §0.10）

★ **A1：第一步 ✅（机制在真机送达）／第二步 ✅（显式打开跑真机，得【有效负结果】）／第三步 ⏸【条件未满足 ⇒ 未触发】（v5r 默认仍关）** ⇒ ★ **A1 按规格【已走完】**。
★ **证据归属**：**闸门／桥接／6 臂＝`vmu-assistant2`**；**复核＝`vmu-verify2`（进行中）**；★ 其余为本轮 Lead 的读数（转述）。

## 2. 闸门与桥接件（★ 本轮最重要）

- ★★ **闸门通过**：**九键逐字** `enabled:true`／`source:"settings:vmu.report.feedback"`／`audience:"所办（office）"`／**`delivered:true`**／`registered:true`／`code:null`／`what:"systemPrompt.context"`／`reason:null`／`stack:null` ＋ **stderr 0 B**。
- ★★★ **桥接件**：**A 臂 3/3** 会话里出现 **`user/message`（content type `text`，`seq=9`）**，逐字 `[vmu report feedback] audience: 所办（office） · reports declared: 2 · recorded: 0 · delivered: 0 · this is a delivery notice, not an instruction.`；**B 臂 0/3** ⇒ ★★ **宿主把它作为【用户角色】文本消息放进模型上下文**（**不是我们自报的成功**）。
- ★★ **关键结论＝"未增加 P 而模型可见"有两件独立证据**：**P ＝ 6/6 `prompt.sections = []`（0 段）** ＋ **上面那条 `user/message`** ⇒ ★ **不是"没影响 P"，而是"不走 P 也送达"**。

## 3. ★★ 行为件＝【有效负结果】（"有效"在哪）

★ **A×3／B×3** ⇒ **C1 0/3 与 0/3**、**C2 0/3 与 0/3**、**M 6/6 各 1 行**、**P 6/6 0 段**、**`turn/end` 6/6 completed**。
★★ **"有效"的四个条件全都满足**：**闸门已过 ＋ 快照已被读到 ＋ 真实卡点 6/6 都撞到 ＋ 0/6 使用通道**。
★★ **与 R15/R16 的"未检验"严格区分**：★ 那时**通道从未 arm ⇒ 那个 0 不合法**；★ **现在 0 是合法的**（★ 正确的档位＝**「仍未建立」但为有效负结果**）。
★ **模型自陈（A2 `reasoning` 逐字）**：*"The report feedback mentions reports declared: 2. I'll skip vmu unless useful — … adding vmu records is noise. **Skip.**"* ⇒ ★ **"看到了、权衡了、主动不用"**（★ **与"没看到"是两件事**）。

## 4. ★★ 第三步：**条件未满足 ⇒ 未触发**（不是漏做）

★ 用户规格逐字：**"第三步仅在实测有效且无回归后，才把 v5r pack 默认翻成开"** ⇒ ★★ **实测【无效】（0/6 使用）** ⇒ ★ **【不翻】就是规格要求的行为** ⇒ ★ 总账写死 **"条件未满足 ⇒ 未触发"**，★ 并**记录 v5r 默认仍为关**；★ 另：本轮**没有**触发"pack 默认真被折叠 ＋ 回执可见其来源"那条要求（★ **只在翻默认时才适用**）。

## 5. ⑤⑥⑦ 残差、成本与剩下的未知量

- ★ **残差三条路径（照录）**：**1** `packs/*/prompts`＝**非独立路**（join 后仍走同一个 `.section`；`prompt.sections` 是**我们自己的声明记录**，`registered:false` ＝ "记录满、注册败"）／**2** `systemPrompt.section`＝本轮 P-clean 未声明／**3** `systemPrompt.context`＝**已送达且模型可见（A 3/3、B 0/3）** ＋ **宿主自身拼接未枚举＝宿主边界**。
- ★ **成本与卫生**：**889,450 tokens**（估 0.7–1.0M）；★ **夹具第三次救场**（`MISMATCH — the scratch payload is NOT HEAD`）；★ **凭据用完即删**；★ **宿主全停、`7700–7900` 无监听**。
- ★ **剩下的未知量＝"任务形态"而非"样本量"**：模型理由是"simple data task…noise" ⇒ ★ 可做的是**换任务形态**（多轮长任务／必须让人知道的卡点／交付物面向他人／给通道一个回报）⇒ ★ **超出用户规格** ⇒ ★ **裁定为【可选后续】，不纳入 A1 收口**；★ **不建议单纯加大 n**（会重复同一观察）。

## 6. 诚实边界

1. ★ **未做 git 写**；★ **未跑真机、未跑任何套件、未跑 T0/T1/`regen-all`** ⇒ ★ **§2–§5 的读数全部是【转述】**（`assistant2` 的 / Lead 的），★ 我**只实读了三处**：HEAD `3b84a45`、真机提交面 `9dc746e`、以及总账两处写入的完整性。
2. ★ **我没有独立核过桥接件**（`user/message`）—— ★ 若要独立核，最便宜的一步是**读那份 HOST SPILL** 并逐字比对 `seq=9` 那条消息；★ 本轮**没做**（预算）。
3. ★ **`verify2` 的复核仍在进行** ⇒ ★ **闸门/桥接的"独立复核"栏目前是空的**（★ 总账里已如此标注）。
4. ★ **本报告未跟踪** ⇒ 提交前请 **先 `git add`**；★ 并按 **§5.9-32**：**先收口提交、再派下一轮**。
