# example-data —— 数据夹，**不是**一个 pack

> ★★ **为什么写这几行**（★ 轮 559 ✓）：★ 它住在 `packs/` 下，★ 但**没有 `index.js`、也没有 manifest** ✗ ⇒ ★ **装载器不会把它当作整合包** ✓（★ 它只认有 `PACK` 导出的文件夹 ✓）。★ 这个文件夹提供的是**提示词分段数据** ✓：
>
> - `prompts/sections.json` —— 分段样例数据 ✓，★ 供 `docs/10-packs.md` 与 `05-middleware.md` 的示例引用 ✓。
>
> ★★ **若你要一个可照抄的最小 pack，请看 `packs/institute-min/`** ✓。
