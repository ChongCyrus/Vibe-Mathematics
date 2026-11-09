// tests/sim-compare-shapes.test.mjs -- TB-2637: compare like with like, and say when the corpus cannot be compared.
//
// TB-2627 triaged the seven unattributed valueDiffs and found 0 product defects: the comparator was putting two
// different FACES of the same tool (open vs list, assign vs transition) into one `tool.field` bucket and calling the
// result a contradiction. This suite pins the three mechanisms that keep that from happening again:
//
//   1. SAME SHAPE ONLY. A field is compared only under the branches BOTH sides exercised for it; a field that
//      exists on both sides but never under a shared branch is `crossShape`: counted, named with both branch lists,
//      and never judged (never a valueDiff, never strict, never a tier).
//   2. THE GATE IS NOT SWITCHED OFF. A genuine contradiction under the SAME shapeKey still lands in valueDiff and a
//      nameless semantic one still exits 1. Without this assertion, "tightening" would be indistinguishable from
//      simply hiding everything.
//   3. CALLER ECHO IS CONTENT, NOT CONTRACT. `*.fields.*` repeats what the caller passed in; it is classified as
//      content by the same tierOf() the strict gate already uses.
//   4. THE BUILD STAMP DECIDES WHETHER A CORPUS MAY BE COMPARED. Rows are filtered by `build`; rows without a stamp
//      are excluded and counted by default, and a corpus with no stamp at all reports the fallback instead of
//      silently comparing nothing.
//
// Runtime ~2 s: tiny fixtures, no network, no live run, no harvested corpus required.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main, tierOf } from "../scripts/sim/compare/run.mjs";

const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log("PASS " + name);
  } catch (e) {
    failures.push({ name, message: (e && e.message) || String(e) });
    console.log("FAIL " + name + " -- " + failures[failures.length - 1].message);
  }
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(label + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}
function ok(value, label) {
  if (!value) throw new Error(label + ": expected a truthy value");
}
function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sim-compare-shapes-" + tag + "-"));
}
function writeJsonl(file, rows) {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
function outDiff(out) {
  return JSON.parse(fs.readFileSync(path.join(out, "diff.json"), "utf8"));
}
/** One real row (harvested shape) and one sim row (receipt shape), both carrying args so the corpus is shape-aware. */
function corpus(tag, real, sim) {
  const dir = tmpDir(tag);
  const realFile = path.join(dir, "real.jsonl");
  writeJsonl(realFile, real);
  const simDir = path.join(dir, "sim");
  fs.mkdirSync(simDir, { recursive: true });
  writeJsonl(path.join(simDir, "receipts.jsonl"), sim);
  return { dir, realFile, simDir };
}
function realRow(tool, args, fields, extra) {
  return Object.assign({ tool, args, fields }, extra || {});
}
function simRow(tool, args, receipt) {
  return { tool, args, receipt };
}
function run(realFile, simDir, more) {
  const out = path.join(tmpDir("out"), "out");
  const code = main(["--real", realFile, "--sim", simDir, "--out", out, "--only-build", "any"].concat(more || []));
  return { code, diff: outDiff(out), out };
}

// ── 1. crossShape: both sides carry the field, but only under different branches ─────────────────────────────────
test("crossShape: open vs list is reported, not compared", () => {
  const c = corpus("cross",
    [realRow("fixture_inbox", { action: "list", member: "r-1" }, { code: "VMU_NO_SUCH_OBJECT" })],
    [simRow("fixture_inbox", { action: "open", member: "r-1" }, { code: "VMU_MAILBOX_NO_SUCH_ENTRY" })]);
  const { code, diff } = run(c.realFile, c.simDir);
  eq(code, 0, "crossShape-only corpus is lenient-green");
  eq(diff.valueDiffs.length, 0, "crossShape is not a valueDiff");
  eq(diff.totals.crossShape, 1, "exactly one crossShape field");
  eq(diff.totals.classes.valueDiff, 0, "crossShape never enters the classes");
  eq(diff.crossShape[0].field, "code", "crossShape names the field");
  eq(diff.crossShape[0].simBranches.join(","), "action=open", "crossShape lists the sim branch");
  eq(diff.crossShape[0].realBranches.join(","), "action=list", "crossShape lists the real branch");
  ok(diff.checks.crossShapeNotJudged, "crossShape carries the not-judged flag");
  ok(diff.crossShape[0].reason.length > 30, "crossShape carries a reason sentence");
});

test("crossShape: branch lists name the actual argument shapes on both sides", () => {
  const c = corpus("cross-shapes",
    [realRow("fixture_task", { action: "transition", id: "t-1", to: "doing" }, { code: "VMU_INVALID_ARGUMENT" })],
    [simRow("fixture_task", { action: "assign", id: "t-1", owner: "r-2" }, { code: "VMU_HUMAN_APPROVAL_PENDING" })]);
  const { diff } = run(c.realFile, c.simDir);
  eq(diff.totals.crossShape, 1, "one crossShape entry");
  ok(diff.crossShape[0].simShapes.some((s) => s.includes("action=assign")), "simShapes names the assign shape");
  ok(diff.crossShape[0].realShapes.some((s) => s.includes("action=transition")), "realShapes names the transition shape");
});

// ── 2. the gate is NOT switched off: same shapeKey still red ────────────────────────────────────────────────────
test("anti-vacuity: a same-shapeKey semantic contradiction still exits 1 under --strict", () => {
  const c = corpus("same-shape",
    [realRow("fixture_meeting", { action: "open", member: "r-acad" }, { delivery: "VMU_ALPHA_BLOCKED" })],
    [simRow("fixture_meeting", { action: "open", member: "r-acad" }, { delivery: "VMU_BETA_REFUSED" })]);
  const { code, diff } = run(c.realFile, c.simDir, ["--strict"]);
  eq(code, 1, "same-shape semantic diff fails --strict");
  eq(diff.totals.crossShape, 0, "nothing was reclassified as crossShape to hide it");
  eq(diff.totals.tiers.semantic.unattributed, 1, "exactly one nameless semantic diff");
  eq(diff.valueDiffs.length, 1, "the diff is still a valueDiff");
  eq(diff.valueDiffs[0].shapeKey, "fixture_meeting.action=open.delivery", "shapeKey is tool.branch.field");
});

test("anti-vacuity: a same-shapeKey code contradiction is still counted as a defect", () => {
  const c = corpus("same-code",
    [realRow("fixture_task", { action: "claim", id: "t-1" }, { code: "VMU_ALPHA" })],
    [simRow("fixture_task", { action: "claim", id: "t-1" }, { code: "VMU_BETA" })]);
  const { diff } = run(c.realFile, c.simDir);
  eq(diff.totals.classes.valueDiff, 1, "code diff is a valueDiff");
  eq(diff.defects.length, 1, "code diff is named as a defect");
  eq(diff.defects[0].shapeKey, "fixture_task.action=claim.code", "defect carries the same shapeKey");
});

// ── 3. caller echo is content, not contract ─────────────────────────────────────────────────────────────────────
test("fields.* echo is content and never a defect", () => {
  const c = corpus("echo",
    [realRow("fixture_panel", { action: "set" }, { "fields.status": "已定稿，待结题" })],
    [simRow("fixture_panel", { action: "set" }, { fields: { status: "推进中" } })]);
  const { diff } = run(c.realFile, c.simDir);
  eq(diff.valueDiffs.length, 1, "the echo still shows as a diff");
  eq(diff.valueDiffs[0].tier, "content", "fields.* lands in the content tier");
  eq(diff.valueDiffs[0].kind, "content", "and is attributed as content");
  eq(diff.defects.length, 0, "caller echo is never a defect");
  eq(tierOf("fixture_panel", "fields.status", new Set(["a"]), new Set(["b"]), null), "content", "tierOf agrees");
});

// ── 4. build stamp decides corpus usability ─────────────────────────────────────────────────────────────────────
const BUILD = "0123456789abcdef0123456789abcdef01234567";
test("--only-build keeps only rows stamped with that build, and reports what it dropped", () => {
  const c = corpus("build",
    [
      realRow("fixture_stats", { op: "read" }, { ok: "true" }, { build: BUILD }),
      realRow("fixture_stats", { op: "read" }, { ok: "false" }, { build: "fedcba9876543210fedcba9876543210fedcba98" }),
      realRow("fixture_stats", { op: "read" }, { ok: "false" }),
    ],
    [simRow("fixture_stats", { op: "read" }, { ok: true })]);
  const out = path.join(tmpDir("build-out"), "out");
  main(["--real", c.realFile, "--sim", c.simDir, "--out", out, "--only-build", BUILD.slice(0, 12)]);
  const diff = outDiff(out);
  eq(diff.meta.buildFilter.withBuild, 2, "two rows carry a stamp");
  eq(diff.meta.buildFilter.unknown, 1, "one row carries none");
  eq(diff.meta.buildFilter.matched, 1, "one row matches the requested build");
  eq(diff.meta.buildFilter.used, 1, "only the matching row is compared");
  eq(diff.meta.buildFilter.excluded, 2, "the other build and the unstamped row are excluded");
  eq(diff.meta.buildFilter.fallback, null, "no fallback needed when a stamp matches");
});

test("--only-build null keeps the unstamped rows and drops stamped ones", () => {
  const c = corpus("build-null",
    [
      realRow("fixture_stats", { op: "read" }, { ok: "true" }, { build: BUILD }),
      realRow("fixture_stats", { op: "read" }, { ok: "false" }),
    ],
    [simRow("fixture_stats", { op: "read" }, { ok: false })]);
  const out = path.join(tmpDir("build-null-out"), "out");
  main(["--real", c.realFile, "--sim", c.simDir, "--out", out, "--only-build", "null"]);
  const diff = outDiff(out);
  eq(diff.meta.buildFilter.mode, "null", "null mode recorded");
  eq(diff.meta.buildFilter.used, 1, "the unstamped row is kept");
  eq(diff.meta.buildFilter.excluded, 1, "the stamped row is excluded");
});

test("a corpus with no stamp at all falls back loudly instead of comparing nothing", () => {
  const c = corpus("build-fallback",
    [realRow("fixture_stats", { op: "read" }, { ok: "true" })],
    [simRow("fixture_stats", { op: "read" }, { ok: true })]);
  const out = path.join(tmpDir("build-fallback-out"), "out");
  const code = main(["--real", c.realFile, "--sim", c.simDir, "--out", out, "--only-build", "HEAD"]);
  eq(code, 0, "fallback corpus still runs");
  const diff = outDiff(out);
  eq(diff.meta.buildFilter.matched, 0, "no row matched HEAD");
  ok(typeof diff.meta.buildFilter.fallback === "string" && diff.meta.buildFilter.fallback.length > 40, "fallback is explained");
  eq(diff.meta.buildFilter.used, 1, "unknown rows are used so the gate measures");
  ok(diff.checks.buildFilterSatisfied, "buildFilterSatisfied reflects the fallback");
});

// ── 5. pairing stays honest where the corpus is not shape-aware ────────────────────────────────────────────────
test("one-sided fields are onlySim/onlyReal, never crossShape", () => {
  const c = corpus("one-sided",
    [realRow("fixture_brief", { action: "emit" }, { ok: "true" })],
    [simRow("fixture_brief", { action: "emit" }, { ok: true, extra: "yes" })]);
  const { diff } = run(c.realFile, c.simDir);
  eq(diff.totals.crossShape, 0, "one-sided fields are not crossShape");
  eq(diff.totals.classes.onlySim, 1, "sim-only field counted once");
});

test("identical readings under the same branch stay classed same (no forced diff)", () => {
  const c = corpus("same",
    [realRow("fixture_stats", { op: "read" }, { ok: "true", "counts.open": "2" })],
    [simRow("fixture_stats", { op: "read" }, { ok: true, counts: { open: 2 } })]);
  const { diff } = run(c.realFile, c.simDir);
  eq(diff.totals.classes.same, 2, "both fields are same");
  eq(diff.valueDiffs.length, 0, "no valueDiff");
  eq(diff.totals.crossShape, 0, "no crossShape");
});

// ── 6. invariants: identity and tier totals still hold with crossShape present ──────────────────────────────────
test("identity holds: classes + one-sided still sum to the field counts", () => {
  const c = corpus("identity",
    [
      realRow("fixture_mix", { action: "open" }, { ok: "true" }),
      realRow("fixture_mix", { action: "list" }, { delivery: "VMU_Y" }),
    ],
    [
      simRow("fixture_mix", { action: "open" }, { ok: true }),
      simRow("fixture_mix", { action: "peek" }, { delivery: "VMU_Z" }),
    ]);
  const { diff } = run(c.realFile, c.simDir);
  eq(diff.checks.identitySim, true, "sim identity holds");
  eq(diff.checks.identityReal, true, "real identity holds");
  eq(diff.totals.crossShape, 1, "delivery lives only in disjoint branches, so it is crossShape");
  eq(diff.totals.classes.valueDiff, 0, "crossShape is not a valueDiff");
  const tierSum = diff.totals.tiers.semantic.total + diff.totals.tiers.serialization.total + diff.totals.tiers.content.total;
  eq(tierSum, diff.valueDiffs.length, "every valueDiff lands in exactly one tier");
});

test("report renders the crossShape section with the branch names", () => {
  const c = corpus("report",
    [realRow("fixture_inbox", { action: "list", member: "r-1" }, { code: "VMU_NO_SUCH_OBJECT" })],
    [simRow("fixture_inbox", { action: "open", member: "r-1" }, { code: "VMU_MAILBOX_NO_SUCH_ENTRY" })]);
  const { out } = run(c.realFile, c.simDir);
  const md = fs.readFileSync(path.join(out, "diff-report.md"), "utf8");
  ok(md.includes("crossShape"), "report names crossShape");
  ok(md.includes("action=open") && md.includes("action=list"), "report shows both branches");
  ok(md.includes("构建戳"), "report states the build-stamp rule");
});

// ── 7. the #4/#6 fixtures that made the live pre-states comparable are REAL steps ─────────────────────────────
// TB-2627 found #4/#6 were not shape bugs but LIFECYCLE differences: the live side reassigned an already-assigned
// task, and expanded a card that had already become a ruling; the sim corpus exercised `doing` and `open` instead.
// The fix is two extra steps that reproduce the live pre-states, so these assertions run the scenarios and read the
// receipts: a step that is silently deleted, or that stops reaching the live reading, fails HERE by name.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function runScenario(name, tag) {
  const out = tmpDir(tag);
  const res = spawnSync(process.execPath, [path.join(REPO, "scripts", "sim", "run.mjs"), "--scenario", name, "--out", out], { cwd: REPO, encoding: "utf8", timeout: 180000 });
  return { out, res };
}
function receiptsOf(out) {
  return fs.readFileSync(path.join(out, "receipts.jsonl"), "utf8").trim().split("\n").filter((l) => l !== "").map((l) => JSON.parse(l));
}

test("fixture #4: reassign starts from an ASSIGNED task and reads state=assigned (the live pre-state)", () => {
  const { out, res } = runScenario("actions-extra", "actions-extra");
  eq(res.status, 0, "actions-extra exits 0 (a fixture step that throws fails the scenario, not this test)");
  const rows = receiptsOf(out);
  const hit = rows.find((r) => r.args && typeof r.args.why === "string" && r.args.why.includes("改派 assigned 任务"));
  ok(hit, "the reassign-from-assigned step is in the corpus (deleting it would make #4 unjudgeable again)");
  eq(hit.tool, "vibe_v5_task_update", "the step uses the compared tool");
  eq(hit.args.action, "reassign", "the step calls reassign");
  eq(hit.receipt.ok, true, "reassign from assigned is accepted");
  eq(hit.receipt.task && hit.receipt.task.state, "assigned", "the pre-state is assigned (live reading), not doing");
});

test("fixture #6: expand reads a FILED RULING card (head.status=ruling), not an open card", () => {
  const { out, res } = runScenario("fidelity-extra", "fidelity-extra");
  eq(res.status, 0, "fidelity-extra exits 0");
  const rows = receiptsOf(out);
  const hit = rows.find((r) => r.tool === "vibe_vmu_records" && r.args && r.args.action === "expand" && typeof r.args.id === "string" && r.args.id.startsWith("ruling-"));
  ok(hit, "the expand-ruling step is in the corpus (deleting it would make #6 unjudgeable again)");
  eq(hit.receipt.ok, true, "the ruling card expanded");
  eq(hit.receipt.head && hit.receipt.head.status, "ruling", "the reading is the live one (ruling), not open");
  eq(hit.receipt.head && hit.receipt.head.kind, "proposition", "and it is a proposition card");
});

if (failures.length) {
  console.error(failures.length + " assertion group(s) failed");
  process.exitCode = 1;
} else {
  console.log("sim-compare-shapes: all groups passed");
}
