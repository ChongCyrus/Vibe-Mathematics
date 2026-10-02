# 参数机读 schema（`vibe_math_set_params`）与 `PARAM_PROPS_EXTRA` 例外表

**真源**：调度参数的描述与类型以 `PARAM_SCHEMA`（`vibe-math-v2.js:307` / `vibe-math-v3.js` 同段）为唯一真源；
工具面 `vibe_math_set_params` 的 `parameters` 由 `paramProps()` 从该真源**派生**（两处注册点共用同一派生，杜绝手写字面量两份近似重复）。

**派生规则**：源条目 `type: 'enum'` **或** 带 `options: [...]` ⇒ 派生为 `{ type: 'string', enum: options }`（仅 `type === 'enum'` 才算 enum 会漏掉 `leanInitiative`/`mathInstallScope` 这类"string + options"条目）；`description` 仅在源里**非空**时才带上（源缺描述时**在源里补**，绝不在 schema 字面量里编词）。

**例外表 `PARAM_PROPS_EXTRA`**：源无法表达、必须逐字沿用现状的条目。**该集合必须与本文档逐条相等**，由断言钉住（两侧任一方向漂移 ⇒ 具名红），并配单点变异（删掉一条例外 ⇒ 红）。

## v2（11 条例外）

| 键 | 例外原因 |
|---|---|
| `solverToolAllow` `solverToolDeny` `verifierToolAllow` `verifierToolDeny` `leanArgs` `mathEngines` `mathPackages` | 现状为 `type: 'array'` + `items`；`PARAM_SCHEMA` 不建模数组类型，逐字沿用以免丢失 `items` |
| `solverAllowNetwork` `verifierAllowNetwork` `solverAllowScripts` `verifierAllowScripts` | 现状为 `oneOf`（布尔或字符串）；源无 `oneOf` 概念，逐字沿用 |

## v3（9 条例外）

| 键 | 例外原因 |
|---|---|
| `solverToolAllow` `solverToolDeny` `verifierToolAllow` `verifierToolDeny` `leanArgs` `mathEngines` `mathPackages` `leanSearchPaths` | 同上：`type: 'array'` + `items`，源不建模数组 |
| `mode` | **枚举顺序有意与源不同**：字面量为 `['manual','auto']`，`PARAM_SCHEMA` 为 `['auto','manual']`。采用源序属 **agent 面向契约变更，尚未批准**；将来若批准，改为采源序即可（一行翻转），并从此表移除 |

## 覆盖度（"带真源描述的描述符数"）

| 预设 | 现状 | stage 1（例外沿用 + 真源派生） | stage 2（在源补描述后） |
|---|---|---|---|
| v2 | 0 / 49 | 45 / 49 | **49 / 49** |
| v3 | 0 / 63 | 60 / 63 | **63 / 63** |

stage 2 待补描述的源条目：v2 = `leanAsync`、`leanSearchPaths`、`mathMode`、`finalPaper`；v3 = `leanAsync`、`mathMode`、`finalPaper`。

## 守卫

`tests/v2-fix-probes.test.mjs` / `tests/v3-fix-probes.test.mjs`：
① 机读 `description` == 真源逐字；② 两处注册点的 `parameters` 逐字一致；③ **例外集合 == 本表**（含上表的键名清单）。
单点变异（把某条描述改回 `''`、或删掉一条例外）⇒ 具名红，由 `tests/v2-fix-probes.mutants.mjs` / `tests/v3-fix-probes.mutants.mjs` 家族承接。
