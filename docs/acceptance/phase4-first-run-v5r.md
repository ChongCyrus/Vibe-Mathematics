# Phase 4 · **首次真机 SLV 运行结果**（原 `vibe-math-v5r`）

> 轮次：Round 23/256。★ 作者＝Lead。★ 依据：本次运行的 `run.log`／`jsonl`（**仓外** `D:\wd\vibemath开发\_oneoff\vm-slv\`）。
> ★ **本次运行的构建＝本仓 HEAD 的 `npm pack` 产物，★ 不是已发布版本** —— ★ 这正是「要测本仓」的正确做法 ✓

---

## 1. ★★★ 运行读数（逐字来自 run.log）

| 项 | ★ 读数 |
|---|---|
| ★ **被测构建** | ★ `PINNED build=2.8.5`，★ `math-computation.js bytes=98465 sha16=DEF90AF767A64FCC` ✓ |
| ★★ **构建来源（provenance）** | ★★ **`BUILD-SOURCE tarball=D:\_installs\pkg\dsh-vibe-math-2.8.5.tgz sha256=F4D6C13D353F8179`** ✓ —— ★ 脚本自己的注释说得对：★ **"版本字符串证明不了装的是哪份代码"**（★ 本仓 HEAD 的 `npm pack` 也叫 2.8.5）⇒ ★ 所以它**记下来源与指纹** ✓ |
| ★★ **整包指纹** | ★ `BUILD-FINGERPRINT package.json=CE49EFFDF70C0FFB`／`vibe-math-v2/vibe-math-v2.js=0BC0CA609D07CDB3`／`v3=A4E26A0CE1836F6E`／`v4=7598645E345CC619`／`v5=F225AC93335CAC6C`／`v5/agent.cordis.yml=D2AD22A3C9BAF1AE` ✓ |
| ★★★ **模拟声明已落地并被断言** | ★★ **`NOTICE JSONL line 12 seq=8`**，★ **`notice_hits=1`** ⇒ ★ **声明出现在【第一条提示词】里，并在转录里被断言** ✓ |
| ★★★ **结果分类** | ★★ **`RESULT preset=vibe-math-v5r exit=0 capHit=False timeoutOrFatal=False => candidate PASS`** ✓ —— ★ **没有触 token 上限、没有超时** ⇒ ★ **不是 NON-RESULT** ✓ |
| ★★ **耗时与用量** | ★ **`durationSec: 44`**，★ **`totalTokens: 119943`**（★ `uncachedInput 28956` ＋ `output 5483` ＋ 缓存读）⇒ ★ **远在手册 v5 上限（≤250k）之内** ✓ |
| ★ **转录** | ★ `vibe-math-v5r-19388-1016-204555.jsonl` **1.88 MB／5257 行** ✓；★ `turn/end` 在 **seq 54** 收束 ✓ |
| ★ **隔离** | ★ 克隆 `slv-r23` ＋ 端口 **19388**；★ **全程未碰用户的 `web` profile、未碰 19387、未碰 `.agent-presets`** ✓ |

## 2. ★★ 代理自己的自测报告（★ 它逐项给了「可用／别扭／缺失」）

★ **它用了 12 次工具调用（限 16，剩 4 次未用）**，★ 且 ★★ **`vibe_v5_start` 从未执行** —— ★ **严格守住了"不触发成员自主回合"的限流铁律** ✓

| # | 维度 | ★ 代理的结论（★ 摘要，逐字报告在转录里） |
|---|---|---|
| ① | **编制与名册** | ★ **可用**，★ 但**本次是"未启动的空名册"**（`phase:"idle"`）⇒ ★ 名册机制按章程走 ✓ |
| ② | **任务板（CAS/DAG）** | ★ **可用**：★ **CAS 校验与成环检测都起了作用** ✓ |
| ③ | **验证/共识** | ★ **从 office（非成员）视角不可达**：★ proposal 与 verdict **都拒绝** ✓ |
| ④ | **记录/归档** | ★ **失败**：★ **member-not-found**，★ **因为 office 不被认作成员** ✓ |
| ⑤ | **计算/工具面** | ★★ **混合**：★ **Python／R 可用**；★ **Octave／Julia／MATLAB 不在本机**；★ **`probe` 正确报告可用性且不尝试安装**；★ **真实 `run` 成功并正确归档** ✓ |
| ⑥ | **会议系统** | ★ **研究所未运行时拒绝开会**；★ **"后位发言"未测**（★ 需要 ≥2 名常驻）✓ |

## 3. ★★★ 本次运行提出的缺陷 —— ★ **读码后的更正：它【已经被修过一次】，残余更窄也更精确**

★★ **代理的原话**：*"**the error code naming for missing members doesn't accurately reflect the real issue — it's not actually a member lookup failure**"* ✓

★★ **但读 `vibe-math-v5r.js:2954-2991` 之后**：★ **那里的 `memberDiagnosis(what, memberId)` 已经区分【四种】原因**，★ **各有自己的 message 与 `next` hint**：
| # | 分支 | ★ 它说的 |
|---|---|---|
| **(1)** | `active === 0 && !running` | ★ **研究所尚未启动（在册 N 名、有表决权者 0 人），没有可归属的成员身份** ⇒ ★ next 直接指向 `vibe_v5_start` ✓ |
| **(2)** | `active === 0` | ★ 当前没有在册成员 ⇒ ★ next 指向 `vibe_v5_add_researcher` ✓ |
| **(3)** | `!who` | ★ 无法识别调用者（这是成员工具，**所办/会话根没有成员身份**）⇒ ★ next 指向"请由成员子代理调用" ✓ |
| **(4)** | 否则 | ★ 名册中没有该成员（**可能已被解雇或尚未就位**）⇒ ★ next 指向 `vibe_v5_members` ✓ |

★★★ **而正上方的注释逐字载明**：★ **`// DEFECT 1 (v5 self-test §18)`** —— ★ **"一个成员域工具在研究所还不存在时被调用……回了一个【光秃秃的 `V5_MEMBER_NOT_FOUND`】，★ 于是操作者（或模型）**既不知道【为什么失败】、也不知道【先做什么】"** ⇒ ★ **那次修复补上了 message 与下一步 hint**，★ **并且【故意保留 CODE 不变】，★ 理由逐字："all existing gates keep matching on it"** ✓✓

⇒ ★★ **所以代理看到的那条 message 是【正确的】**（★ 它确实点名了"研究所尚未启动"与下一步）⇒ ★ **它抱怨的是【CODE】** ✓
⇒ ★★★ **残余因此更窄：★ 只有分支 (1) 根本不是"成员查找失败"** —— ★ 是**研究所没跑**，★ 而本仓**已有 `V5_INSTITUTE_STATE` ＋ "the institute is not running"**（★ `:7420`）✓
★ **裁定**：★ **分支 (1) 应得到自己的码**（★ 或复用 `V5_INSTITUTE_STATE`），★ **`V5_MEMBER_NOT_FOUND` 留给 (2)(3)(4) 那三个真正的成员情形** ⇒ ★ **而这四个分支已经分开了 ⇒ 拆分风险低** ✓
★★ **但必须先核那条兼容性声明**（★ 注释说"所有既有门都靠它匹配"）⇒ ★ **已派 `task-256`：先查出所有匹配点、报出会坏什么，再决定改不改** ✓
★★★ **而且这次改动会动【parity 基线】**（★ `vibe-math-v5r.js` 是原版）⇒ ★ **已在任务里要求写明，免得以后的 parity 对比把它当成漂移** ✓

★★ **顺带：★ 本次运行同时【确认了几项确实工作】的东西**（★ 都逐字来自 tool/result）：
- ★ `V5_TASK_DEPENDENCY_CYCLE`：★ **"dependency cycle through t-1"** ⇒ ★ **成环检测真的起了作用** ✓
- ★ **计算 probe** ⇒ ★ `ok:true`，★ `engineInfo:{name:'python', path:…\Python312\python.EXE, version:'3.12.10'}` ⇒ ★ **正确报告可用性、且不尝试安装** ✓
- ★ **`V5_INVALID_ARGUMENT` 的拒绝带理由**：★ *"辩论的开启与辩论对象的选择由院士决定（issue #13 #1）：请由院士发起 propose_verify"* ⇒ ★ **具名且给出该找谁** ✓
- ★ **`status()` 的汇报里自带 `rosterVersion`（名册版本）的解释** ⇒ ★ *"多个视图不一致时用它判断谁过期"* ✓


## 4. ★ 未测／未核（★ 与"核了"分开）

1. ★ **"后位发言"**（★ 需 ≥2 名常驻）⇒ **未测** ✓
2. ★ **需成员自主回合的功能**（★ start／派活／收敛）⇒ ★ **按限流铁律【故意未测】** ✓ —— ★ 那要留给 **Phase 5**
3. ★ **收敛类结论**：★ 手册 §5 明说**有界运行建立不了收敛** ⇒ ★ 本次**不主张** ✓
4. ★ **清理**：★ 本次**运行成功但清理报了 `目录不是空的`**（★ `node_modules/@floating-ui/core` 的 Windows 长路径/占用问题）⇒ ★ **我手工删掉了克隆并核对端口与 profile 已复原** ✓ —— ★ **脚本的 `Cleanup-Mine` 在 Windows 上会漏掉 node_modules**，★ 记为**脚本待改进**（★ 不是产品缺陷）✓
5. ★ **转录里的逐字报告我只摘读了前 2600 字符**（★ 报告全长 7700 字符）⇒ ★ **其余细节未逐字核** ✓

## 5. ★ 结论

★★★ **Phase 4 的首次真机运行：机制全通、隔离守住、声明落地、结果可分类、且带【构建指纹】与【用量读数】** ✓
★★ **它同时产出了**：★ **六个维度的可用性判定**、★ **一份诚实的边界清单**、★ **一条真缺陷（错误码名不副实）** ✓
⇒ ★ **下一步**：★ 把**那条缺陷**定位并修（★ 或判定为"改码"）⇒ ★ 然后进 **Phase 5**（`vmu+v5r` 全流程 ＋ 模拟声明 ＋ 跑到结题）✓
