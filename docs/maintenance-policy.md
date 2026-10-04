# 维护方针：v4/v5 优先，v2/v3 冻结为「适配兼容」

> 本文件说明四套预设的**维护优先级**，供使用者与维护者参考。策略由维护者决定，可能随版本调整。

## 中文

**投资方向：`vibe-math-v4` 与 `vibe-math-v5`。** 新能力、新守卫（测试/审计）、提示词强化与重构都只落这两套。

**`vibe-math-v2` 与 `vibe-math-v3` 已成熟定型（architecturally frozen）。** 它们仍随包安装、可正常使用，但**只接受「适配兼容」类改动**：

- 宿主（DeepSeek Harness）升级带来的适配修复；
- **共享模块的正确性/安全修复**：`vibe-math-v{2,3,4,5}/math-computation.js` 等是四份**复制型共享** ⇒ 修复必须**同批传播**且四份保持**字节一致**，否则 v2/v3 会在宿主升级后悄悄腐坏；
- 让既有行为**保持不变**的回归修复。

**因此**：v2/v3 的参数名、默认值与数据格式**不再演进**（新参数、新字段只出现在 v4/v5）；v2/v3 的测试套件保留为**兼容回归守卫**（保持通过即可），不再为它们新增作业。

**例外（不可扩大解释）**：**明显的正确性/安全缺陷**无论落在哪一套都会被修复 —— 「冻结」指停止**功能投资**，不等于放任已发布代码里的缺陷。

## English

**Investment goes to `vibe-math-v4` and `vibe-math-v5`.** New capabilities, new guards (tests/audits), prompt strengthening and refactors land in these two only.

**`vibe-math-v2` and `vibe-math-v3` are architecturally frozen.** They still install and work, but accept **compatibility-only** changes:

- adaptations required by a DeepSeek Harness upgrade;
- **correctness/security fixes in shared modules**: `vibe-math-v{2,3,4,5}/math-computation.js` and friends are **copied** into each preset, so a fix must be propagated in the same change and the four copies must stay **byte-identical** — otherwise v2/v3 rot silently on the next host upgrade;
- regression fixes that keep their current behaviour unchanged.

**Consequently** v2/v3 parameter names, defaults and data formats **no longer evolve** (new parameters and fields appear in v4/v5 only), and their test suites remain **compatibility regression guards** (kept green) without new jobs.

**Exception (not to be stretched)**: an outright correctness/security defect is fixed wherever it lives — "frozen" means no further **feature** investment, not tolerating defects in shipped code.
