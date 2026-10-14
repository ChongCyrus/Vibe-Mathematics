// ONE definition of every count sentence (D1). The writer (scripts/update-doc-counts.mjs), the guard
// (tests/audit-readme-counts.mjs) and the mutant harness all import this module, so the three cannot
// disagree about the shape. Sentences are rebuilt WHOLE (never partially regex-edited), which makes the
// writer idempotent — `--check` converges.
//
// VOCABULARY: `derived.*` are JOB counts (the gate's own job list: base jobs + VARIANTS jobs), NOT file
// counts (a naive file count gives 82/38). `shipped.*` ARE file counts (package.json#files is a file list).

export function claims(derived, shipped, scoped) {
  const zhTotal = '`TOTAL ' + derived.total + '`（' + derived.suites + ' 套件 + ' + derived.probes + ' 探针/变体，**作业计数**（job count），不是文件计数）'
  const zhShipped = shipped.total + ' 个 `tests/*.mjs`（' + shipped.suites + ' 个套件 + ' + shipped.probes + ' 个探针/脚本）'
  const enTotal = '`TOTAL ' + derived.total + ' (' + derived.suites + ' suites + ' + derived.probes + ' probes/variants — JOB counts, not file counts)'
  const enShipped = 'which ' + shipped.total + ' of the `tests/*.mjs` files ship in the package (' + shipped.suites + ' suites + ' + shipped.probes + ' probe/script files)'
  // THE GATE VOLUME'S TWO COUNT LINES ARE OWNED HERE TOO. They used to be typed by hand and had drifted to
  // `49 作业` and `total 96 / suites 41 / probes 55` while the tree said 137 and 170 - in the one volume a reader
  // opens to learn how big the gate is. A count no generator owns will drift; these are owned now.
  const v11Scoped = scoped
    ? '**vmu 子集**：`GATE_SCOPE=vmu` ⇒ **' + scoped.total + ' 作业**（' + scoped.suites + ' 套件 + ' + scoped.probes + ' 探针/变体，**作业计数**；**由 `--counts` 派生** ✓）'
    : null
  const v11Shipped = '| `shipped.*`＝**文件计数** | `package.json#files` 里 `tests/*.mjs` 的行数 | **`total ' + shipped.total
    + ' / suites ' + shipped.suites + ' / probes ' + shipped.probes + '`** ✓ |'
  // The cost columns used to carry `≈ 121 s` / `≈ 200 s, 并发 4`, which contradicted BOTH the code
  // (`tests/run-tests.mjs:161`: concurrency is min(2, cpus)) and the runner's own header. A count nobody
  // derives will drift; so will a TIMING nobody re-measures. The honest shape is therefore: mark the cost
  // columns UNVERIFIED and name the three mutually contradictory figures that exist in the tree, so a
  // reader re-measures instead of quoting (§5.1 of the gate volume has the same discipline).
  const ttRow = '| `tests/run-tests.mjs`（**' + derived.total + ' 项作业**（job count）= ' + derived.suites + ' 套件 + '
    + derived.probes + ' 探针/变体；**由 `--counts` 派生**） | ≈ 424 s（历史基线，未复核） | **未复核**（**2026-10-14**：并发 = `min(2, CPU 核数)`，旧文"并发 4" ✗ 已过期；全量成本仓库内有**三个互斥**说法 —— `≈121–200 s`／`1447.6 s`（runner 自述**模拟值**）／132 作业时 `31 min` 实测 ⇒ **以现量现报为准**） | `TOTAL '
    + derived.total + '  PASS ' + derived.total + '  FAIL 0  (suites ' + derived.suites + ' · probes ' + derived.probes + ')`（输出形状；数字现取） |'
  const ttOutput = '`TOTAL ' + derived.total + '  PASS ' + derived.total + '  FAIL 0  (suites ' + derived.suites + ' · probes ' + derived.probes + ')`'
  const ckClaim = derived.total + ' 项作业（job count）= ' + derived.suites + ' 套件 + ' + derived.probes + ' 探针/变体'
  const ckShipped = '只发 `tests/` 的 **' + shipped.total + '** 项（**文件计数**；其中 `.test.mjs` **' + shipped.suites + '** 个）'
  const d1Row = '- **计数（实测）**：`TOTAL ' + derived.total + '`（' + derived.suites + ' 套件 + ' + derived.probes
    + ' 探针/变体，**作业计数/job count**，不是文件计数）；随包 `tests/*.mjs` = ' + shipped.total + '（**文件计数**：' + shipped.suites
    + ' 个套件 + ' + shipped.probes + ' 个探针/脚本）。'
  const zhBullet = '- **测试耗时基线与并行跑法**：[`docs/test-timing.md`](docs/test-timing.md)（`node tests/run-tests.mjs` 并行跑**全部套件 + 全部探针**：'
    + zhTotal + '；**这些数字必须派生**：`node tests/run-tests.mjs --counts` 是权威来源（**作业计数**，不是文件计数），并由 '
    + '[`tests/audit-readme-counts.mjs`](tests/audit-readme-counts.mjs) 校验本页与另两份文档；随包发布的是 `files[]` 里的 '
    + zhShipped + '（文件计数），其余仅开发检出可见，清单见该文档 §1.1；每个 runner 都会打印耗时/加速比供下次选策略）'
  const enBullet = '- **Test timing baseline and parallel run recipes**: [`docs/test-timing.md`](docs/test-timing.md) '
    + '(`node tests/run-tests.mjs` runs **every suite AND every probe** in parallel: ' + enTotal + '; the authority is '
    + '`node tests/run-tests.mjs --counts` (JOB counts, not file counts), checked by '
    + '[`tests/audit-readme-counts.mjs`](tests/audit-readme-counts.mjs); ' + enShipped
    + ' and which are repository-only is in §1.1 of that document; every runner prints its elapsed time/speedup so the next strategy can be chosen)'
  return { zhTotal, zhShipped, enTotal, enShipped, ttRow, ttOutput, ckClaim, ckShipped, d1Row, zhBullet, enBullet, v11Scoped, v11Shipped }
}

/** Stable line markers: each canonical line replaces the line that carries its marker. */
export const MARKERS = {
  zhBullet: '[`docs/test-timing.md`](docs/test-timing.md)（`node tests/run-tests.mjs`',
  enBullet: '[`docs/test-timing.md`](docs/test-timing.md) (`node tests/run-tests.mjs`',
  ttRow: '| `tests/run-tests.mjs`（',
  d1Row: '- **计数（实测',
  // the gate volume's two lines, each identified by a substring that survives a stale count
  v11Scoped: '**vmu 子集**：`GATE_SCOPE=vmu`',
  v11Shipped: '| `shipped.*`＝**文件计数** | `package.json#files` 里 `tests/*.mjs` 的行数',
}
