# Paper 迁移期的 declared-not-wired 台账（TB-2794 Step 1）

> **历史引用口径**：本仓历史验收记录（`docs/acceptance/**`）里的 `kernel/paper.js` 一律指**已删除的死面**，不是现行落点；现行论文流程在 `packs/research-core/paper-flow.js`。

> 背景：Step 1 删除了死面 `kernel/paper.js`（唯一读取者），通用流程迁 `packs/research-core/paper-flow.js`、机构政策留
> `packs/v5r/paper.js`。下面 4 个 `vmu.paper.*` 键在迁移前只被那个死面读取，因此现在是**声明了但未接线**——本文件是
> 它们的**具名裁定**（不是静默通过；`tests/audit-silent-keys.mjs` 读本台账，条目移除前必须出现真实读取者）。
>
> 下一步：v5r 的 paper 政策（finalPaper/format/language/compilePdf）在 pack 侧读取并转交通用 flow（TB-2794 后续步），
> 届时这些行删除、由真实读者接管。

| 键 | 裁定 | 原因 | 处置计划 |
|---|---|---|---|
| `vmu.paper.finalPaper` | declared-not-wired | 唯一读者 `kernel/paper.js` 已删除；mounted flow 不用它 | v5r paper 政策读取后传入 flow（Step 4/5 收口） |
| `vmu.paper.format` | declared-not-wired | 同上 | 同上 |
| `vmu.paper.language` | declared-not-wired | 同上 | 同上 |
| `vmu.paper.compilePdf` | declared-not-wired | 同上 | 同上 |
