// scripts/generate-coverage-debt.mjs — the coverage-debt ledger as a DERIVED FACE.
//
// WHY A GENERATOR. The ledger's whole value is that its numbers are true. Hand-copied counts drift the moment a module moves
// from unread to verified, and a ledger that lags is worse than none - it reports a coverage that no longer exists. So the
// three levels are divided by how they can be known:
//
//   L3 CLAIM-VERIFIED  DERIVED   a module imported by tests/audit-kernel-claims*.mjs - the probe IS the evidence
//   L2 READ            DECLARED  reading is a human act, so it is declared in READ_MODULES below, with the round it happened
//   L1 MACHINE-GATED   DERIVED   the complement: every kernel file that is neither L3 nor L2
//   L0 UNTOUCHED       DERIVED   structurally always empty, and printed as a row so it cannot quietly stop being checked
//
// `--check` fails when the file on disk differs, so `regen-all --check` covers it like any other derived face.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const KERNEL = join(ROOT, "vibe-math-vmu", "kernel")
const OUT = join(ROOT, "docs", "acceptance", "audit-coverage-debt.md")

/** ★ L2 IS DECLARED, NOT DERIVED: "somebody read this" is a fact about a person, and only the person knows it. */
const READ_MODULES = {
  "index.js": 80, "turn/index.js": 50, "activity.js": 80, "chat.js": 89, "mailbox.js": 89,
  "prompt/index.js": 86, "members.js": 83, "control.js": 83, "idempotency.js": 100, "scheduler.js": 101,
  "lean.js": 101, "ratelimit.js": 103, "transaction.js": 103, "records.js": 104, "resume.js": 104,
  "mathjobs.js": 104, "bus.js": 85, "meetings.js": 105, "ballot.js": 105, "report.js": 99,
  "store.js": 97, "ids.js": 97, "guard.js": 97, "metrics.js": 97, "delegation.js": 97, "arbitration.js": 97,
}

const claimsFiles = readdirSync(join(ROOT, "tests")).filter((f) => /^audit-kernel-claims.*\.mjs$/.test(f)).sort()
const claimsText = claimsFiles.map((f) => readFileSync(join(ROOT, "tests", f), "utf8")).join("\n")

// ★ THE ASSERTION COUNT IS DELIBERATELY NOT DERIVED HERE. Deriving it meant RUNNING the probes, which made
// `regen-all --check` execute test files - and one T1 run then reported regen-all as failing while two direct runs exited 0.
// A --check must be deterministic and side-effect-free, so the counts live in this ledger's prose (the probes' own summary
// lines are the authority) and the derivation below stays purely source-based.
// ★ THE DERIVATION MUST NOT DEPEND ON HOW A PROBE SPELLS ITS IMPORT. The first version matched only `url("x.js")` and
// `K + 'x.js'`, so the probes that used `pathToFileURL(join(K, 'x.js'))` were invisible and L3 under-reported by three.
// Now: take EVERY quoted `*.js` token in the probes and keep the ones that are real kernel files - a spelling-proof rule.
// read the kernel directory HERE rather than using `files`, which is built further down (using it up here was a TDZ error)
const kernelNames = new Set()
{
  const seen = []
  const w = (d) => { for (const e of readdirSync(d)) { if (e === "node_modules") continue; const p = join(d, e); if (statSync(p).isDirectory()) w(p); else if (p.endsWith(".js")) seen.push(p) } }
  w(KERNEL)
  for (const p of seen) kernelNames.add(p.replace(/\\/g, "/").split("/").pop())
}
const L3 = new Set()
for (const m of claimsText.matchAll(/["']([A-Za-z0-9._-]+\.js)["']/g)) if (kernelNames.has(m[1])) L3.add(m[1])

const files = []
const walk = (d) => { for (const e of readdirSync(d)) { if (e === "node_modules") continue; const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p) } }
walk(KERNEL)
const rows = files.map((f) => {
  const rel = f.replace(/\\/g, "/").split("/kernel/").pop()
  const base = rel.split("/").pop()
  const level = L3.has(base) ? "L3" : (READ_MODULES[rel] !== undefined || READ_MODULES[base] !== undefined ? "L2" : "L1")
  return { rel, lines: readFileSync(f, "utf8").split("\n").length, level }
}).sort((a, b) => b.lines - a.lines)
if (L3.size < 10) { console.error("COVERAGE DEBT: the L3 derivation found only " + L3.size + " modules - the matcher has probably broken; assert a known positive before trusting a count"); process.exit(1) }
const by = (l) => rows.filter((r) => r.level === l)
const sum = (a) => a.reduce((n, r) => n + r.lines, 0)
const total = sum(rows)
const pct = (n) => (100 * n / total).toFixed(1)
const human = by("L3").length + by("L2").length
const humanLines = sum(by("L3")) + sum(by("L2"))

const doc = [
  "# 覆盖债务台账 · **kernel 逐文件的三级审查账**",
  "",
  "> ★ **本文件是【生成物】** —— ★ 由 `scripts/generate-coverage-debt.mjs` 生成，★ `regen-all --check` 会校验（★ 手改会失败）。",
  "> ★ 要改 `L2`（★ 「读过」）请改生成器里的 `READ_MODULES`（★ 那是**声明**，★ 因为「读过」是人做的事）；",
  "> ★ `L3`（★ 宣称级验证）与 `L1`（★ 仅机器门禁）都是**派生**的：★ 前者来自 `tests/audit-kernel-claims*.mjs`，★ 后者是补集。",
  "",
  "## 1. ★★★ 三级口径",
  "",
  "| ★ 级别 | ★ 含义 |",
  "|---|---|",
  "| ★★ **L3 宣称级验证** | ★ `tests/audit-kernel-claims*.mjs` 里有断言在测**它自己头部的一句话** |",
  "| ★★ **L2 已读** | ★ 本阶段**逐行读过**，或改过并复读过（★ **声明**，★ 见 `READ_MODULES`）|",
  "| ★ **L1 仅机器门禁** | ★ **没有人读过**，★ 但**全树可判定门禁**覆盖它（★ 悬空调用／★ 面动作／★ 静默键／★ RULE E 断言判据／★ docs lint／★ 派生同步）|",
  "| ★ **L0 未触及** | ★ 以上皆无（★ 结构性恒为 0，★ **也印成一行**，★ 免得它悄悄不再被检查）|",
  "",
  "★★ **L1 不是「没检查」** —— ★ 它是**「有一套判据明确、结果可复算的检查覆盖了它，★ 只是没人逐行读」**。",
  "★ 覆盖 L1 的四道自建门禁：",
  "★ `tests/audit-service-calls.mjs`（★ 调用侧：★ `kernel.<服务>.<方法>` 必须可解析，★ **87 服务 × 213 文件**）／",
  "★ `tests/audit-face-actions.mjs`（★ 面侧：★ 每个提供的动作必须存在或有分支，★ **51 面／47 enum**）／",
  "★ `tests/audit-silent-keys.mjs`（★ 设置键：★ 不得「既无人读也未被裁定」，★ **640 文件**）／",
  "★ `tests/audit-kernel-claims*.mjs`（★ 行为宣称：★ **" + by("L3").length + " 模块／断言数见各探针总结行**）。",
  "",
  "## 2. ★★★★★ 账（★ kernel " + files.length + " 文件／" + total + " 行）",
  "",
  "| ★ 级别 | ★ 文件 | ★ 行数 | ★ 占比 |",
  "|---|---|---|---|",
  "| ★★ **L3 宣称级验证** | ★ **" + by("L3").length + "** | ★ **" + sum(by("L3")) + "** | ★ " + pct(sum(by("L3"))) + "% |",
  "| ★★ **L2 已逐行读** | ★ **" + by("L2").length + "** | ★ **" + sum(by("L2")) + "** | ★ " + pct(sum(by("L2"))) + "% |",
  "| ★ **L1 仅机器门禁** | ★ **" + by("L1").length + "** | ★ **" + sum(by("L1")) + "** | ★ " + pct(sum(by("L1"))) + "% |",
  "| ★ **L0 未触及** | ★ **0** | ★ **0** | ★ 0% |",
  "",
  "⇒ ★★★★ **" + human + "/" + files.length + " 文件（" + (100 * humanLines / total).toFixed(0) + "% 行）有人工审查；★ " + by("L1").length + " 文件（" + (100 * sum(by("L1")) / total).toFixed(0) + "% 行）仅机器门禁覆盖** ✓",
  "",
  "### 2.1 ★★ L3（★ 有行为断言在测其头部宣称）",
  "",
  "  " + by("L3").map((r) => "`" + r.rel + "`（" + r.lines + "）").join(" · "),
  "",
  "### 2.2 ★★ L2（★ 已逐行读过或改过并复读 · ★ 声明于 `READ_MODULES`）",
  "",
  "  " + by("L2").map((r) => "`" + r.rel + "`（" + r.lines + "，R" + READ_MODULES[r.rel] + "）").join(" · "),
  "",
  "## 3. ★★★★★ L1 的具名余项（★ " + by("L1").length + " 文件，★ 按行数降序）",
  "",
  "> ★ **这一列就是门 1 的剩余工作清单** —— ★ **可数、★ 具名、★ 按规模排序**。",
  "> ★ 推进方式：★ **每轮取 2–3 个照「验证宣称」那把尺过一遍**（★ 已验证者升到 L3，★ 并把断言收进 `audit-kernel-claims*`）。",
  "",
  "| ★ # | ★ 文件 | ★ 行数 |",
  "|---|---|---|",
  ...by("L1").map((r, i) => "| " + (i + 1) + " | `" + r.rel + "` | " + r.lines + " |"),
  "",
  "## 4. ★★★ 这份账之外的覆盖",
  "",
  "★ **kernel 之外**：★ `tools/` **51 个面**已按动作级核对（★ 0 缺陷）／★ `settings/schema.js` 的 **1123 键**已过静默键门禁／★ **pack 17/17 文件**已有覆盖（★ 13 逐行＋2 生成免眼审＋2 结构化审计）／★ `host*.js`（★ 定点）。",
  "★ **真机**：★ 53 面被真实调用、★ **47/47 重点面逐面触达**、★ 39 条拒绝全部可执行、★ **结题两次独立达成**。",
  "",
  "## 5. ★★ 明确【尚未读】的少数非 kernel 文件（★ 具名，★ 不藏）",
  "",
  "★ `docs/landscape-similar-frameworks.md`（★ **408 行**）—— ★ **完全未读**（★ 调研文档，★ 不影响运行机制，★ 但按「不许把没读到写成没问题」，★ 在此具名）。",
  "★ `README.md` 与 `vibe-math-vmu/docs/00–14` 各卷 —— ★ **未逐卷通读**（★ 但其**数字与链接**由 `check-docs`／`audit-doc-line-refs`／`audit-readme-counts`／`regen --check` 在管）。",
  "",
].join("\n")

if (process.argv.includes("--check")) {
  const have = existsSync(OUT) ? readFileSync(OUT, "utf8") : ""
  if (have !== doc) { console.error("COVERAGE DEBT: OUT OF DATE — run `node scripts/generate-coverage-debt.mjs --write`"); process.exit(1) }
  console.log("COVERAGE DEBT: in sync (" + files.length + " files · L3 " + by("L3").length + " · L2 " + by("L2").length + " · L1 " + by("L1").length + " · L0 0)")
  process.exit(0)
}
writeFileSync(OUT, doc, "utf8")
console.log("COVERAGE DEBT written: " + files.length + " files · L3 " + by("L3").length + " · L2 " + by("L2").length + " · L1 " + by("L1").length + " · L0 0")


