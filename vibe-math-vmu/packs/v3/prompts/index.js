/**
 * packs/v3/prompts/index.js — PHASE 6 / P1-6：**v3 提示词段的唯一汇总出口**。
 *
 * ★ 接线方（`packs/v3/index.js`，由 Lead 统一改）只需要一行：
 *
 *     import { V3_PROMPT_SECTIONS } from './prompts/index.js'
 *     // 然后并进清单：sections: Object.freeze([V3_PLANNER_SECTION, ...V3_PROMPT_SECTIONS])
 *
 *   这样清单里仍然是**声明**而不是行为，且段在装配后由插件晚注册
 *   （`vibe-math-vmu.js:1055-1057`：`kernel.prompt.register(s)`）——`scope` 因此生效。
 *
 * ★ 为什么不走 `prompts/sections.json`：那个通道的读取端只保留 `name/order/range/text`
 *   与 role|phase|member|task 四个绑定维度，**`scope` 会被丢弃**（见 `packs/v3/prompts/planner.js`
 *   的文件头与 `docs/10-packs.md` §3.3）。本文件里的段全部靠 `scope` 做**互斥**，
 *   所以必须走清单的 sections 通道。
 *
 * ★ 本文件不做任何文本拼装：它只把四个族按 order 合并成一个冻结数组。族文件自己带注释与来源。
 *
 * ★ 段数量与顺序（全部唯一、全部落在 pack 区间 [600,899]）：
 *   650–658 知识上下文 9 段；702–703 简报 2 段；704–706 论文 3 段；710–716 角色 7 段。
 *   planner 的 `v3-planner`（order 700）不在这里——它在 `packs/v3/prompts/planner.js`。
 */
import { V3_KNOWLEDGE_SECTIONS } from './knowledge.js'
import { V3_BRIEF_SECTIONS } from './briefs.js'
import { V3_PAPER_SECTIONS } from './paper.js'
import { V3_ROLE_SECTIONS, V3_ROLE_PREFIX, V3_ROLE_NAMES } from './roles.js'

/** 全部 v3 提示词段（知识上下文 → 简报 → 论文 → 角色；同 order 时按此顺序稳定）。 */
export const V3_PROMPT_SECTIONS = Object.freeze([
  ...V3_KNOWLEDGE_SECTIONS,
  ...V3_BRIEF_SECTIONS,
  ...V3_PAPER_SECTIONS,
  ...V3_ROLE_SECTIONS,
])

/**
 * 段的 family 标签：给测试与报告用（也是"一次装配里只能有一个角色"断言的分类依据）。
 * family ∈ knowledge | brief | paper | role。
 */
export const V3_SECTION_FAMILY = Object.freeze({
  'v3-kb-object-models': 'knowledge',
  'v3-kb-tracks': 'knowledge',
  'v3-kb-output-quality': 'knowledge',
  'v3-kb-method-library': 'knowledge',
  'v3-write-workflow': 'knowledge',
  'v3-role-files-solver': 'knowledge',
  'v3-role-files-keeper': 'knowledge',
  'v3-capabilities': 'knowledge',
  'v3-verifier-rules': 'knowledge',
  'v3-verifier-lean': 'knowledge',
  'v3-brief-planner': 'brief',
  'v3-brief-method-digest': 'brief',
  'v3-paper-material': 'paper',
  'v3-paper-skeleton': 'paper',
  'v3-paper-latex': 'paper',
  'v3-role-explorer': 'role',
  'v3-role-explorer-rederive': 'role',
  'v3-role-solver': 'role',
  'v3-role-verifier-review': 'role',
  'v3-role-verifier-debate': 'role',
  'v3-role-method-keeper': 'role',
  'v3-role-paper-writer': 'role',
})

/** 每段的首行（唯一 marker）——测试用它断言"出现/不出现/相对顺序"，不另存一份文本。 */
export const V3_SECTION_MARKERS = Object.freeze(Object.fromEntries(
  V3_PROMPT_SECTIONS.map((s) => [s.name, String(s.text).split('\n')[0]])))

export { V3_KNOWLEDGE_SECTIONS, V3_BRIEF_SECTIONS, V3_PAPER_SECTIONS, V3_ROLE_SECTIONS, V3_ROLE_PREFIX, V3_ROLE_NAMES }

export default V3_PROMPT_SECTIONS
