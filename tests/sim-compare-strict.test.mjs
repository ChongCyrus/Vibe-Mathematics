// tests/sim-compare-strict.test.mjs -- TB-2631: one exit code answers one question.
//
// The sim-vs-real differ used to answer "is the contract consistent?" and "is the content identical?" with the same
// exit code, so 583 designed-unexplainable free-text diffs made `--strict` permanently red on the rich corpus and the
// one diff that mattered (a code reading two ways) was lost in the noise. This suite pins the split:
//
//   1. THREE TIERS. semantic (contract selectors + ALL-CAPS refusal codes) / serialization (declared, bytes, path,
//      id, clock) / content (fixture prose and counts). Every valueDiff lands in exactly one tier.
//   2. `--strict` FAILS ONLY ON SEMANTIC. Rich corpus: exit 0, semantic.unattributed 0, content > 0 reported as such.
//   3. `--strict-content` IS THE SEPARATE CONTENT QUESTION. Same corpus, same report: exit 1 with content > 0 while
//      semantic stays clean -- proving the two switches really are separate.
//   4. THE MUTANT MUST STILL BE ABLE TO GO RED. A fabricated semantic disagreement that no rule can name exits 1 and
//      the nameless diff is reported by tool+field. Without this the green rich run would be vacuous.
//
// Runtime is ~10 s (the rich corpus is 37 MB of read-only input); no network, no xelatex, no live run.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attribute, computeDiff, loadDeclarations, main, tierOf } from "../scripts/sim/compare/run.mjs";
import { corpusRoot, requireCorpusDir, requireCorpusFile } from "./_lib/corpus.mjs";

// TB-2677: this file no longer writes down where the checkout or the corpora live. The repo comes from this file's
// URL; the corpora come from the ONE helper that knows the (overridable) corpus root. A missing corpus is RED, not a
// skip: `requireCorpusFile` throws, the per-test catcher below records a failure, and the run exits 1 naming the path.
const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DECLARED = path.join(REPO, "scripts/sim/audit/fidelity-declared.json");
const richReal = () => requireCorpusFile("compare/real-fields.jsonl");
const shallowReal = () => requireCorpusFile("real-receipts.jsonl");
const simRoot = () => corpusRoot();
const e2eCorpus = () => requireCorpusDir("e2e");

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
function near(actual, expected, label) {
  if (Math.abs(actual - expected) > 1e-9) throw new Error(label + ": expected " + expected + ", got " + actual);
}
function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sim-compare-strict-" + tag + "-"));
}
function writeJsonl(file, rows) {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
function outDiff(out) {
  return JSON.parse(fs.readFileSync(path.join(out, "diff.json"), "utf8"));
}

// ── 1. tier classification is a property of the FIELD, not of whether attribute() happened to name it ───────────
test("tier: contract selectors and ALL-CAPS refusal codes are semantic", () => {
  eq(tierOf("fixture", "status", new Set(["open"]), new Set(["closed"]), null), "semantic", "status leaf");
  eq(tierOf("fixture", "turn.end.status", new Set(["completed"]), new Set(["error"]), null), "semantic", "nested status leaf");
  eq(tierOf("fixture", "delivery", new Set(["VMU_ALPHA_BLOCKED"]), new Set(["VMU_BETA_REFUSED"]), null), "semantic", "ALL-CAPS refusal codes are a contract reading even under an unfamiliar leaf name");
  eq(tierOf("fixture", "kind", new Set(["ordinary"]), new Set(["debate"]), { attribution: "真缺陷", kind: "defect" }), "semantic", "a named defect stays semantic");
});

test("tier: declared / bytes / path / id / clock differences are serialization", () => {
  loadDeclarations(DECLARED);
  const decl = JSON.parse(fs.readFileSync(DECLARED, "utf8"));
  const tool = Object.keys(decl).find((k) => !k.startsWith("_") && Array.isArray(decl[k] && decl[k].keys) && decl[k].keys.length);
  ok(tool, "fidelity-declared.json has at least one key-granular declaration");
  const key = decl[tool].keys[0];
  // TB-2656: a declaration only covers the side that produced NOTHING (empty simulator set); a declared key that the
  // simulator also produced is judged by its own value, not by the table. The old form of this assertion asserted the
  // opposite ("declared + two produced readings => serialization") and only stayed green while the first declared key
  // in fidelity-declared.json happened to look like a bytes/path field -- i.e. it measured the FILE, not the rule.
  eq(tierOf(tool, key, new Set(), new Set(["b"]), null), "serialization", "declared key the simulator never produced " + tool + "." + key);
  eq(tierOf("fixture", "payload.bytes", new Set(["10"]), new Set(["20"]), null), "serialization", "bytes path");
  eq(tierOf("fixture", "output.path", new Set(["<path>"]), new Set(["<path>"]), null), "serialization", "path path");
  eq(tierOf("fixture", "elapsedMs", new Set(["10"]), new Set(["20"]), { attribution: "timestamp", kind: "timestamp" }), "serialization", "clock field");
  // The complement, with a declaration that could not be argued as an env path: two produced readings stay content.
  const probe = tmpDir("tier-declared-produced");
  const probeDeclared = path.join(probe, "declared.json");
  fs.writeFileSync(probeDeclared, JSON.stringify({ fixture_tier: { keys: ["objective"], why: "fixture", evidence: "fixture" } }));
  loadDeclarations(probeDeclared);
  eq(tierOf("fixture_tier", "objective", new Set(["a written objective"]), new Set(["another written objective"]), null), "content", "a declared key the simulator DID produce is not serialization");
  loadDeclarations(DECLARED);
});

test("tier: fixture prose, counts and lists are content", () => {
  eq(tierOf("fixture", "objective", new Set(["覆盖组合路径的长文本目标，写在夹具里"]), new Set(["把证明落到库根并让指针可解析的长文本目标"]), null), "content", "prose");
  eq(tierOf("fixture", "originalBytes", new Set(["893", "998"]), new Set(["601", "606"]), null), "content", "fixture counts");
  eq(tierOf("fixture", "items", new Set(["[1]([object Object])"]), new Set(["[5]([object Object])"]), null), "content", "list shapes");
});

// ── 2. the rich corpus passes the semantic gate and still reports its content tier ─────────────────────────────────
test("rich: --strict is GREEN (semantic.unattributed 0) while content > 0 and reported", () => {
  const out = tmpDir("strict");
  const code = main(["--real", richReal(), "--sim", simRoot(), "--out", out, "--strict"]);
  eq(code, 0, "rich --strict exit code");
  const diff = outDiff(out);
  eq(diff.totals.tiers.semantic.unattributed, 0, "semantic unattributed");
  eq(diff.checks.strictSatisfied, true, "checks.strictSatisfied");
  ok(diff.totals.tiers.content.total > 0, "content tier is populated (> 0)");
  const sum = diff.totals.tiers.semantic.total + diff.totals.tiers.serialization.total + diff.totals.tiers.content.total;
  eq(sum, diff.valueDiffs.length, "every valueDiff lands in exactly one tier");
  const md = fs.readFileSync(path.join(out, "diff-report.md"), "utf8");
  ok(md.includes("## 2b. 三档分类"), "report carries the tier section");
  ok(md.includes("content | " + diff.totals.tiers.content.total + " |"), "report prints the content count");
  ok(diff.totals.tierMeans.semantic.length > 20 && diff.totals.tierMeans.content.length > 20, "each tier carries a means sentence");
});

// ── 3. the content switch is a SEPARATE question on the SAME corpus ─────────────────────────────────────────────
test("rich: --strict-content is RED on the same corpus (two switches stay separate)", () => {
  const out = tmpDir("strict-content");
  const code = main(["--real", richReal(), "--sim", simRoot(), "--out", out, "--strict-content"]);
  eq(code, 1, "rich --strict-content exit code");
  const diff = outDiff(out);
  eq(diff.checks.strictContentRequested, true, "strictContent requested is recorded");
  eq(diff.totals.tiers.semantic.unattributed, 0, "semantic stays clean under --strict-content");
  ok(diff.totals.tiers.content.total > 0, "content tier is what fails the stricter switch");
});

test("rich: lenient mode is unchanged (exit 0, every diff attributed)", () => {
  const out = tmpDir("lenient");
  const code = main(["--real", richReal(), "--sim", simRoot(), "--out", out]);
  eq(code, 0, "rich lenient exit code");
  const diff = outDiff(out);
  eq(diff.totals.tiers.content.unattributed, 0, "lenient fallback attributes content, so nothing is nameless");
  eq(diff.checks.everyValueDiffAttributed, true, "lenient everyValueDiffAttributed");
});

// ── 4. anti-vacuity: a nameless SEMANTIC diff must still be able to turn the gate red ───────────────────────────
test("mutant: an unattributable semantic diff exits 1 and is reported by tool+field", () => {
  const dir = tmpDir("mutant");
  const realFile = path.join(dir, "real.jsonl");
  writeJsonl(realFile, [{ tool: "fixture_meeting", fields: { ok: "true", delivery: "VMU_ALPHA_BLOCKED" } }]);
  const simDir = path.join(dir, "sim");
  fs.mkdirSync(simDir, { recursive: true });
  writeJsonl(path.join(simDir, "receipts.jsonl"), [{ tool: "fixture_meeting", receipt: { ok: true, delivery: "VMU_BETA_REFUSED" } }]);
  const out = path.join(dir, "out");
  const code = main(["--real", realFile, "--sim", simDir, "--out", out, "--strict"]);
  eq(code, 1, "mutant --strict exit code");
  const diff = outDiff(out);
  eq(diff.totals.tiers.semantic.unattributed, 1, "exactly one nameless semantic diff");
  const named = diff.valueDiffs.filter((d) => d.tier === "semantic" && !d.attribution);
  eq(named.length, 1, "mutant diff is in the semantic tier and has no attribution");
  eq(named[0].tool, "fixture_meeting", "mutant tool name");
  eq(named[0].field, "delivery", "mutant field name");
});

test("mutant: the same fixture passes plain lenient mode (the switch, not the fixture, is what fails)", () => {
  const dir = tmpDir("mutant-lenient");
  const realFile = path.join(dir, "real.jsonl");
  writeJsonl(realFile, [{ tool: "fixture_meeting", fields: { ok: "true", delivery: "VMU_ALPHA_BLOCKED" } }]);
  const simDir = path.join(dir, "sim");
  fs.mkdirSync(simDir, { recursive: true });
  writeJsonl(path.join(simDir, "receipts.jsonl"), [{ tool: "fixture_meeting", receipt: { ok: true, delivery: "VMU_BETA_REFUSED" } }]);
  const out = path.join(dir, "out");
  const code = main(["--real", realFile, "--sim", simDir, "--out", out]);
  eq(code, 0, "lenient exit code");
  const diff = outDiff(out);
  eq(diff.totals.tiers.semantic.total, 1, "the diff is still classified semantic");
  eq(diff.totals.tiers.semantic.unattributed, 0, "lenient fallback names the code-like diff");
  const named = diff.valueDiffs.find((d) => d.field === "delivery");
  eq(named.attribution, "environmental", "lenient attribution of the code-like diff");
  eq(named.kind, "coverage", "lenient kind of the code-like diff");
});

// ── 5. shallow corpus keeps its old behaviour (the installed acceptance command) ────────────────────────────────
test("shallow: the documented acceptance command is unchanged (strict exit 0)", () => {
  const out = tmpDir("shallow");
  const code = main(["--real", shallowReal(), "--sim", e2eCorpus(), "--out", out, "--strict"]);
  eq(code, 0, "shallow --strict exit code");
  const diff = outDiff(out);
  eq(diff.totals.tiers.semantic.unattributed, 0, "shallow semantic unattributed");
  eq(diff.totals.tiers.content.total, 0, "shallow corpus has no value-level content diffs");
  eq(diff.checks.strictContentSatisfied, true, "shallow corpus also satisfies --strict-content");
});

test("computeDiff records the requested switches so a caller can tell the two gates apart", () => {
  const dir = tmpDir("switches");
  const realFile = path.join(dir, "real.jsonl");
  writeJsonl(realFile, [{ tool: "fixture_one", fields: { ok: "true" } }]);
  const simDir = path.join(dir, "sim");
  fs.mkdirSync(simDir, { recursive: true });
  writeJsonl(path.join(simDir, "receipts.jsonl"), [{ tool: "fixture_one", receipt: { ok: true } }]);
  const plain = computeDiff({ real: realFile, sim: [simDir] });
  eq(plain.diff.checks.strictRequested, false, "plain strictRequested");
  eq(plain.diff.checks.strictContentRequested, false, "plain strictContentRequested");
  const strict = computeDiff({ real: realFile, sim: [simDir], strict: true });
  eq(strict.diff.checks.strictRequested, true, "strict strictRequested");
  eq(strict.diff.checks.strictContentRequested, false, "strict strictContentRequested");
  const both = computeDiff({ real: realFile, sim: [simDir], strict: true, strictContent: true });
  eq(both.diff.checks.strictContentRequested, true, "strict-content strictContentRequested");
});

// ── 6. TB-2656: a declaration may never vouch for a value difference ────────────────────────────────────────────
// A `fidelity-declared.json` entry means "the SIMULATOR cannot produce this field". Two produced readings that differ
// are a content/serialization difference; letting a declaration name that difference would turn --strict-content green
// by relabelling a real difference as an exemption. These groups pin the split at three levels -- the attribution
// function, the CLI exit code, and the report's two tables -- and the report must ACCOUNT for the excluded class.
function declaredFixture(tag, body) {
  const dir = tmpDir(tag);
  const declaredFile = path.join(dir, "declared.json");
  fs.writeFileSync(declaredFile, JSON.stringify({ fixture_declared: { keys: ["body"], why: "fixture only: the simulator cannot produce this field at all", evidence: "fixture" } }));
  const realFile = path.join(dir, "real.jsonl");
  writeJsonl(realFile, [{ tool: "fixture_declared", fields: { ok: "true", body } }]);
  const simDir = path.join(dir, "sim");
  fs.mkdirSync(simDir, { recursive: true });
  writeJsonl(path.join(simDir, "receipts.jsonl"), [{ tool: "fixture_declared", receipt: { ok: true, body: "the simulator wrote its own body" } }]);
  return { dir, declaredFile, realFile, simDir, out: path.join(dir, "out") };
}

test("declared: a declaration does not cover a produced difference (attribute says so, --strict-content stays red)", () => {
  const f = declaredFixture("declared-produced", "the live receipt prose, written by a member");
  loadDeclarations(f.declaredFile);
  // Both sides produced a reading => the declaration must not name it, in strict OR lenient mode.
  eq(attribute("fixture_declared", "body", new Set(["sim text"]), new Set(["real text"]), { strict: true }), null, "a produced difference must stay unattributed under strict");
  const lenient = attribute("fixture_declared", "body", new Set(["sim text"]), new Set(["real text"]), {});
  ok(lenient && lenient.kind !== "declared", "lenient attribution must not call a produced difference declared: " + JSON.stringify(lenient));
  // The simulator produced NOTHING => the declaration is exactly the right answer, and that is the only shape allowed.
  const unproduced = attribute("fixture_declared", "body", new Set(), new Set(["real text"]), { strict: true });
  eq(unproduced && unproduced.kind, "declared", "an empty simulator reading is what a declaration is for");
  // End to end: the declared key must not buy a green content gate.
  const code = main(["--real", f.realFile, "--sim", f.simDir, "--declared", f.declaredFile, "--out", f.out, "--strict-content"]);
  eq(code, 1, "--strict-content must fail on the produced free-text difference even though the field is declared");
  const diff = outDiff(f.out);
  const entry = diff.valueDiffs.find((d) => d.field === "body");
  ok(entry, "the produced difference is still a valueDiff");
  ok(entry.kind !== "declared", "the diff entry is not labelled declared: " + entry.kind);
  eq(entry.tier, "content", "a free-text difference is content tier");
  eq(diff.declarationGaps.length, 0, "a produced difference is never declaration debt: " + JSON.stringify(diff.declarationGaps));
  eq(diff.totals.tiers.content.total, 1, "hand count: exactly one content difference in this fixture");
  eq(diff.totals.tiers.content.unattributed, 1, "hand count: it is the one unattributed content difference");
});

test("declared: a field the simulator cannot produce is allowed and --strict stays green (and the gap re-opens without it)", () => {
  const f = declaredFixture("declared-unproduced", "the live receipt prose, written by a member");
  // Real side carries an environmental field the simulator never produced at all.
  writeJsonl(f.realFile, [{ tool: "fixture_declared", fields: { ok: "true", "payload.path": "/live/deploy/payload.json" } }]);
  writeJsonl(path.join(f.simDir, "receipts.jsonl"), [{ tool: "fixture_declared", receipt: { ok: true } }]);
  // The declaration has to name the field that is actually missing, or the fixture proves nothing.
  const pathDeclared = path.join(f.dir, "declared-path.json");
  fs.writeFileSync(pathDeclared, JSON.stringify({ fixture_declared: { keys: ["payload.path"], why: "fixture: the simulator never produces a deployment path", evidence: "fixture" } }));
  // 1) declared => the gap is closed by the declaration (this is the legitimate job of the table).
  const withDecl = computeDiff({ real: f.realFile, sim: [f.simDir], declared: pathDeclared, strict: true });
  eq(withDecl.diff.declarationGaps.length, 0, "declared live-only field is not debt: " + JSON.stringify(withDecl.diff.declarationGaps));
  eq(withDecl.diff.checks.declarationGapsAreUnproduced, true, "declared run: no gap carries a simulator reading");
  // 2) undeclared => the same field IS debt, so the zero above is not vacuous.
  const undeclaredFile = path.join(f.dir, "empty-declared.json");
  fs.writeFileSync(undeclaredFile, JSON.stringify({}));
  const without = computeDiff({ real: f.realFile, sim: [f.simDir], declared: undeclaredFile, strict: true });
  eq(without.diff.declarationGaps.length, 1, "undeclared live-only env field re-opens the gap");
  eq(without.diff.declarationGaps[0].kind, "onlyReal-env", "the gap class is the unproduced one");
  eq(without.diff.declarationGaps[0].sim, undefined, "the gap entry carries NO simulator reading");
  // 3) --strict is green in both cases: a declaration settles a fact, it does not lower a gate.
  const code = main(["--real", f.realFile, "--sim", f.simDir, "--declared", pathDeclared, "--out", f.out, "--strict"]);
  eq(code, 0, "--strict exit stays 0 with the declaration in place");
  loadDeclarations(DECLARED);
});

test("rich: the report's content count equals a manual pass over the same diff entries", () => {
  const out = tmpDir("manual-count");
  const code = main(["--real", richReal(), "--sim", simRoot(), "--out", out, "--strict-content"]);
  eq(code, 1, "rich --strict-content exit code");
  const diff = outDiff(out);
  const manualUnattributed = diff.valueDiffs.filter((d) => d.tier === "content" && !d.attribution).length;
  const manualTotal = diff.valueDiffs.filter((d) => d.tier === "content").length;
  eq(manualTotal, diff.totals.tiers.content.total, "hand count of content diffs equals the reported content total");
  eq(manualUnattributed, diff.totals.tiers.content.unattributed, "hand count of unattributed content diffs equals the reported count");
});

test("rich: declarationGaps never carries a produced reading and contentEnvSuspect keeps both sides", () => {
  const out = tmpDir("tables");
  const code = main(["--real", richReal(), "--sim", simRoot(), "--out", out, "--strict"]);
  eq(code, 0, "rich --strict exit code");
  const diff = outDiff(out);
  const produced = diff.declarationGaps.filter((g) => Array.isArray(g.sim) && g.sim.length > 0);
  eq(produced.length, 0, "no declaration gap carries a simulator reading: " + JSON.stringify(produced.slice(0, 4)));
  eq(diff.checks.declarationGapsAreUnproduced, true, "checks.declarationGapsAreUnproduced");
  eq(diff.checks.contentEnvSuspect, diff.contentEnvSuspect.length, "contentEnvSuspect count matches the table");
  ok(diff.contentEnvSuspect.length > 0, "the both-sides-different class is accounted for, not silently dropped");
  for (const g of diff.contentEnvSuspect) ok(Array.isArray(g.sim) && g.sim.length > 0 && Array.isArray(g.real) && g.real.length > 0, "both readings are kept: " + JSON.stringify(g));
  for (const g of diff.contentEnvSuspect) ok(g.tier, "the entry names its tier: " + JSON.stringify(g));
  const md = fs.readFileSync(path.join(out, "diff-report.md"), "utf8");
  ok(md.includes("## 5. 声明缺口 = 声明债"), "report has the declaration-debt table");
  ok(md.includes("## 5b. 内容侧值差"), "report has the separate content-env-suspect table");
  ok(md.includes("声明债（declaration debt）"), "declaration table carries its means sentence");
  ok(md.includes("内容侧值差（env-suspect）"), "content table carries its means sentence");
  ok(diff.declarationGapMeans.length > 20 && diff.contentEnvSuspectMeans.length > 20, "both tables travel with a means sentence in diff.json");
});

for (const f of failures) console.log("FAILED " + f.name + " -- " + f.message);
console.log((failures.length ? "FAILED " : "OK ") + (failures.length || "all") + (failures.length ? " test(s)" : " tests passed") + " (sim-compare-strict)");
if (failures.length) process.exitCode = 1;
