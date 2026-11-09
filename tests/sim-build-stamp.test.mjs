// tests/sim-build-stamp.test.mjs -- TB-2641: a real row is only comparable to the build that produced it.
//
// TB-2637 shipped the FILTER (`filterByBuild`, `--only-build`) and measured that it had nothing to filter on:
// 21 527 harvested rows, withBuild=0, because the session journal never recorded a build. TB-2641 closes that gap on
// both ends:
//   - harvest: reads the driver's sealed `run-metadata` event from the journal head (BUILD REV text grep stays as a
//     documented fallback for older journals) and stamps EVERY row with `build` + `buildWhy`;
//   - comparator: only a sha can name a checkout, so `working-tree`/dirty rows are build=unknown and never match
//     `--only-build <sha>`; a corpus with no usable stamp reports the fallback instead of silently comparing nothing.
//
// The anti-false-green assertion is explicit: the SAME harvest of the SAME journal, with the metadata event removed,
// must stop proving the build -- otherwise this suite would pass on a journal that carries no stamp at all.
//
// Runtime ~3 s: synthetic journals only, no network, no live run, no harvested corpus required.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { main, filterByBuild } from "../scripts/sim/compare/run.mjs";

// TB-2677: the checkout location is derived from this file, not written down.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HARVEST = REPO + "/scripts/sim/harvest/real.mjs";
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const BUILD_A = "abcdef1";
const BUILD_B = "1234567";

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "sim-build-stamp-" + tag + "-"));
}
/** Same folder naming the harness uses for a workspace's sessions. */
function encodeWorkspace(abs) {
  return "--" + abs.replace(/:/g, "").replace(/[\\/]/g, "-") + "--";
}
function frame(line) {
  return zlib.zstdCompressSync(Buffer.from(line + "\n", "utf8"));
}
function writeJournal(file, lines) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat(lines.map(frame)));
}
function metaEvent(extra) {
  return JSON.stringify(Object.assign({ type: "run-metadata", kind: "run-metadata", build: BUILD_A, buildSource: "git HEAD (git archive)", dirty: false, tarballBytes: 1234567, scannedJs: 231, at: "2026-11-09T07:00:00.000Z" }, extra || {}));
}
function callEvent(callId, name) {
  return JSON.stringify({ type: "tool/call", seq: 1, time: 1, data: { turn: 1, step: 1, callId, name, arguments: "{}" } });
}
function resultEvent(callId, receipt) {
  return JSON.stringify({ type: "tool/result", seq: 2, time: 2, data: { toolCallId: callId, message: { role: "tool", content: [{ type: "text", text: receipt }] } } });
}
const RECEIPT = JSON.stringify({ ok: true, code: null, value: 1 });

/** A throwaway real-corpus root: one workspace, one session whose journal is `lines`, harvested into `out`. */
function harvest(tag, lines) {
  const root = tmpDir(tag);
  const wsRoot = path.join(root, "ws");
  const ws = path.join(wsRoot, "slvp" + "900-ws"); // PORTABLE-ALLOW: fixture name built by concatenation, not a machine path
  fs.mkdirSync(ws, { recursive: true });
  const sessionsRoot = path.join(root, "sessions");
  const journal = path.join(sessionsRoot, encodeWorkspace(ws), "session-0001", "session.v4.jsonl.zstd");
  writeJournal(journal, lines);
  const out = path.join(root, "out");
  const run = spawnSync(process.execPath, [HARVEST], {
    env: Object.assign({}, process.env, { VMU_REAL_WS_ROOT: wsRoot, VMU_SESSIONS_ROOT: sessionsRoot, VMU_REAL_OUT: out }),
    encoding: "utf8",
  });
  if (run.status !== 0) throw new Error("harvest exited " + run.status + ": " + (run.stderr || "").slice(0, 400));
  const stats = JSON.parse(run.stdout);
  const rows = fs.readFileSync(path.join(out, "real-receipts.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { rows, stats, out };
}
const baseLines = [callEvent("c1", "vibe_vmu_status"), resultEvent("c1", RECEIPT)];

test("journal head run-metadata stamps every receipt row (build + buildWhy provenance)", () => {
  const { rows, stats } = harvest("meta", [metaEvent()].concat(baseLines));
  eq(rows.length, 1, "receipt rows");
  eq(rows[0].build, BUILD_A, "row build");
  ok(String(rows[0].buildWhy).startsWith("run-metadata:"), "buildWhy names run-metadata, got " + rows[0].buildWhy);
  eq(stats.metaStampedSessions, 1, "metaStampedSessions");
  eq(stats.events, 2, "metadata frame is not counted as an event");
});

test("the metadata event is honoured anywhere in the journal, not only byte 0", () => {
  // The driver prepends, but a reader must not depend on frame order: any sealed run-metadata frame names the build.
  const { rows } = harvest("meta-late", baseLines.concat([metaEvent()]));
  eq(rows[0].build, BUILD_A, "row build");
});

test("a journal written before TB-2641 still works through the BUILD REV text fallback", () => {
  const lines = baseLines.concat([JSON.stringify({ type: "system/message", seq: 3, time: 3, data: { text: "BUILD REV: " + BUILD_A } })]);
  const { rows, stats } = harvest("grep", lines);
  eq(rows[0].build, BUILD_A, "fallback build");
  ok(String(rows[0].buildWhy).startsWith("grep:"), "buildWhy names the grep fallback, got " + rows[0].buildWhy);
  eq(stats.metaStampedSessions, 0, "no metadata event");
});

test("a journal with neither source is honest: build null plus a non-empty why", () => {
  const { rows } = harvest("none", baseLines);
  eq(rows[0].build, null, "build stays null");
  ok(typeof rows[0].buildWhy === "string" && rows[0].buildWhy.length > 10, "buildWhy explains the absence");
});

test("working-tree + dirty is recorded but labelled as naming no checkout", () => {
  const { rows } = harvest("wt", [metaEvent({ build: "working-tree", buildSource: "git ls-files working tree", dirty: true, why: "uncommitted working tree" })].concat(baseLines));
  eq(rows[0].build, "working-tree", "build label");
  ok(String(rows[0].buildWhy).includes("dirty"), "buildWhy records dirty, got " + rows[0].buildWhy);
});

test("filter: a sha keeps only its own stamped rows; unknown and working-tree are counted, not silently dropped", () => {
  const rows = [{ tool: "t", build: BUILD_A }, { tool: "t", build: BUILD_A }, { tool: "t", build: null }, { tool: "t", build: "working-tree" }];
  const { rows: kept, filter } = filterByBuild(rows, BUILD_A, null);
  eq(kept.length, 2, "kept rows");
  eq(filter.matched, 2, "matched");
  eq(filter.withBuild, 2, "withBuild counts only usable shas");
  eq(filter.unknown, 2, "unknown includes null and working-tree");
  eq(filter.excluded, 2, "excluded");
  eq(filter.fallback, null, "no fallback while a matching build exists");
});

test("filter: working-tree never matches any sha; without a matching sha the fallback keeps the corpus measurable", () => {
  const rows = [{ tool: "t", build: "working-tree" }, { tool: "t", build: null }];
  const { rows: kept, filter } = filterByBuild(rows, BUILD_B, null);
  eq(filter.matched, 0, "working-tree matched nothing");
  ok(typeof filter.fallback === "string" && filter.fallback.includes("usable build sha"), "fallback is named");
  eq(kept.length, 2, "fallback keeps the unknown rows so the gate still measures");
});

test("filter: --only-build null keeps exactly the rows without a usable sha", () => {
  const rows = [{ tool: "t", build: BUILD_A }, { tool: "t", build: "working-tree" }, { tool: "t", build: null }];
  const { rows: kept, filter } = filterByBuild(rows, "null", null);
  eq(kept.length, 2, "kept rows");
  eq(filter.excluded, 1, "excluded stamped row");
  eq(filter.mode, "null", "mode");
});

test("filter: a corpus with no stamp at all reports fallback instead of comparing an empty set", () => {
  const rows = [{ tool: "t", build: null }, { tool: "t", build: null }];
  const { rows: kept, filter } = filterByBuild(rows, BUILD_A, null);
  eq(filter.withBuild, 0, "withBuild");
  ok(typeof filter.fallback === "string" && filter.fallback.length > 20, "fallback text");
  eq(kept.length, 2, "all unknown rows used");
});

test("ANTI-FALSE-GREEN: the same assertion fails when the metadata event is deleted", () => {
  const withMeta = harvest("red-on", [metaEvent()].concat(baseLines));
  const withoutMeta = harvest("red-off", baseLines.slice());
  eq(withMeta.rows[0].build, BUILD_A, "with metadata the build is proven");
  // Deliberately the SAME assertion as above; it must be false without the event, proving the suite cannot pass on
  // a journal that carries no stamp at all.
  let proved = true;
  try { eq(withoutMeta.rows[0].build, BUILD_A, "build proven without metadata"); } catch { proved = false; }
  eq(proved, false, "removing run-metadata makes the build assertion fail");
  eq(withoutMeta.rows[0].build, null, "and the row says null instead of inventing a sha");
});

test("end-to-end: main() with --only-build <sha> filters the harvested real corpus and reports the counts", () => {
  const dir = tmpDir("e2e");
  const realFile = path.join(dir, "real.jsonl");
  fs.writeFileSync(realFile, [
    { tool: "vibe_vmu_status", args: { action: "status" }, fields: { ok: true }, build: BUILD_A },
    { tool: "vibe_vmu_status", args: { action: "status" }, fields: { ok: true }, build: BUILD_B },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n");
  const simDir = path.join(dir, "sim");
  fs.mkdirSync(simDir, { recursive: true });
  fs.writeFileSync(path.join(simDir, "receipts.jsonl"), JSON.stringify({ tool: "vibe_vmu_status", args: { action: "status" }, receipt: { ok: true } }) + "\n");
  const out = path.join(dir, "out");
  const code = main(["--real", realFile, "--sim", simDir, "--out", out, "--only-build", BUILD_A]);
  eq(code, 0, "main exit");
  const diff = JSON.parse(fs.readFileSync(path.join(out, "diff.json"), "utf8"));
  eq(diff.meta.buildFilter.matched, 1, "matched");
  eq(diff.meta.buildFilter.excluded, 1, "excluded other build");
  eq(diff.meta.buildFilter.used, 1, "used");
  eq(diff.meta.realRowsRaw, 2, "raw rows still reported");
});

test("end-to-end: a corpus with no stamps falls back and says so in meta, never as a silent empty compare", () => {
  const dir = tmpDir("e2e-none");
  const realFile = path.join(dir, "real.jsonl");
  fs.writeFileSync(realFile, JSON.stringify({ tool: "vibe_vmu_status", args: { action: "status" }, fields: { ok: true } }) + "\n");
  const simDir = path.join(dir, "sim");
  fs.mkdirSync(simDir, { recursive: true });
  fs.writeFileSync(path.join(simDir, "receipts.jsonl"), JSON.stringify({ tool: "vibe_vmu_status", args: { action: "status" }, receipt: { ok: true } }) + "\n");
  const out = path.join(dir, "out");
  eq(main(["--real", realFile, "--sim", simDir, "--out", out, "--only-build", BUILD_A]), 0, "main exit");
  const diff = JSON.parse(fs.readFileSync(path.join(out, "diff.json"), "utf8"));
  ok(typeof diff.meta.buildFilter.fallback === "string" && diff.meta.buildFilter.fallback.includes("no live row"), "fallback recorded");
  eq(diff.meta.buildFilter.used, 1, "unknown row used");
});

if (failures.length) {
  console.log("\nFAILURES (" + failures.length + ")");
  for (const f of failures) console.log(" - " + f.name + ": " + f.message);
  process.exit(1);
}
console.log("\nOK sim-build-stamp: all assertions passed");
