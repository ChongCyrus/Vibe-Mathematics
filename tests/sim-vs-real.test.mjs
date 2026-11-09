// tests/sim-vs-real.test.mjs -- the T1 gate for TB-2604, the sim-vs-real FIELD-LEVEL parity differ.
//
// The differ (scripts/sim/compare/run.mjs) makes one claim: every field difference between a live receipt and a
// simulated receipt is CAUSED (declared gap / coverage / clock / id) or is a product defect -- never unexplained. A
// report that is merely "generated" proves nothing, so this test pins four things the artifact alone cannot:
//
//   1. NORMALIZATION AND PAIRING. ISO dates, uuids, mail ids and absolute paths fold to placeholders; domain ids
//      (r-1, m3) remain comparable; pairing is by tool + argument shape, never by step number.
//   2. THE FOUR CLASSES ARE EXACT AND ADD UP. same + valueDiff + onlySim === simFields and the real-side identity
//      holds on a fixture whose every class is hand-counted.
//   3. EVERY VALUE DIFF MUST NAME A CAUSE -- AND A NAMELESS ONE MUST FAIL. The attribution matrix is exercised rule
//      by rule, then a MUTANT (a value difference no rule can name, compared in strict mode) is asserted to make the
//      gate RED (exit 1). That is the anti-vacuity probe: the "every diff is attributed" check is shown to be able to
//      fail, not merely to be true today.
//   4. THE REAL CORPUS PASSES THE CONTRACT. Against the live corpus on this machine, the top-20 coverage rule, the
//      two identities, the declaration-gap naming and the zero-unattributed rule are asserted. The integration case
//      is skipped (with an explicit SKIP line) only when the live corpus is absent, so the suite still runs on a
//      checkout that never harvested.
//
// Runtime is ~2 s and needs no network, no xelatex and no live run: the corpus is read-only input.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attribute,
  buildProfile,
  computeDiff,
  diffProfiles,
  fieldsOf,
  isDeclared,
  loadDeclarations,
  main,
  normalizeScalar,
  shapeOf,
} from "../scripts/sim/compare/run.mjs";
import { corpusRoot, requireCorpusDir, requireCorpusFile } from "./_lib/corpus.mjs";

// TB-2677: derived, never written down. A missing live corpus is RED with the path in the message — a SKIP here used
// to mean "the measurement did not happen, but the suite exited 0", which is the false green the audit found.
const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DECLARED = path.join(REPO, "scripts/sim/audit/fidelity-declared.json");
const richReal = () => requireCorpusFile("compare/real-fields.jsonl");
const shallowReal = () => requireCorpusFile("real-receipts.jsonl");
const simRoot = () => corpusRoot();

let failures = [];
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("PASS " + name);
  } catch (e) {
    failures.push({ name, message: e && e.message ? e.message : String(e) });
    console.log("FAIL " + name + " -- " + (e && e.message ? e.message : e));
  }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((label ? label + ": " : "") + "expected " + b + " got " + a);
}
function ok(value, label) {
  if (!value) throw new Error(label || "expected a truthy value");
}
function tmpdir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tb2604-" + tag + "-"));
}

// ── 1. normalization and pairing ────────────────────────────────────────────────────────────────────────────────
test("normalizeScalar folds clocks, uuids, mail ids and absolute paths", () => {
  eq(normalizeScalar("2026-11-07T03:12:45.123Z"), "<iso>", "iso");
  eq(normalizeScalar("9f8e7d6c-1234-4abc-8def-0123456789ab"), "<uuid>", "uuid");
  eq(normalizeScalar("ml-41"), "<mail>", "mail id");
  eq(normalizeScalar("rec-17"), "<rec>", "rec id folds");
  eq(normalizeScalar(["D:", "_tmp", "slv-phase5", "slvp203" + "-ws", "VibeMath"].join("/")), "<path>", "windows path"); // PORTABLE-ALLOW: sample for the path normaliser, the value itself is the fixture
  eq(normalizeScalar(1794002177407), "<epoch-ms>", "epoch ms");
  eq(normalizeScalar(null), "null", "null");
  eq(normalizeScalar(true), "true", "boolean");
  eq(normalizeScalar("r-1"), "r-1", "domain id survives");
  eq(normalizeScalar("m3"), "m3", "meeting id survives");
});

test("shapeOf pairs on keys plus the enum-ish tags that change the face", () => {
  eq(shapeOf({ action: "attend", member: "r-1" }), "action,member|action=attend", "shape");
  eq(shapeOf({ member: "r-1", action: "attend" }), "action,member|action=attend", "key order is irrelevant");
  eq(shapeOf(null), "∅", "no args");
});

test("fieldsOf flattens nested receipts, renders arrays and keeps lenient depth", () => {
  const fields = fieldsOf({ ok: true, arrival: { missing: ["r-1", "r-2"], allPresent: false }, when: "2026-11-07T00:00:00.000Z" });
  eq(fields.get("ok"), "true", "ok");
  eq(fields.get("arrival.missing"), "[2](r-1,r-2)", "array renders with count");
  eq(fields.get("arrival.allPresent"), "false", "nested boolean");
  eq(fields.get("when"), "<iso>", "nested iso");
});

test("buildProfile keeps a shallow real row honest: only ok/code carry values", () => {
  const profile = buildProfile([{ tool: "x_tool", keys: ["ok", "code", "state"], ok: true, code: null }], "real");
  const tool = profile.tools.get("x_tool");
  eq([...tool.fields.get("ok")], ["true"], "ok has a value");
  eq([...tool.fields.get("state")], ["<unknown>"], "unreadable field is not pretended");
});

// ── 2. the four classes and their identities ────────────────────────────────────────────────────────────────────
function fixtureProfiles() {
  const real = buildProfile(
    [
      { tool: "fx", fields: { ok: "true", state: "open", at: "<epoch-ms>", member: "r-2", hint: "a long live hint that names the fixture workbook" }, args: { action: "status" } },
      { tool: "fx", fields: { ok: "true", state: "closed" }, args: { action: "status" } },
      { tool: "only_real", fields: { ok: "true" }, args: {} },
    ],
    "real",
  );
  const sim = buildProfile(
    [
      { tool: "fx", args: { action: "status" }, receipt: { ok: true, state: "open", at: "2026-11-07T01:02:03.000Z", member: "r-1", hint: "a long simulated hint that names the scenario fixture" } },
      { tool: "only_sim", args: {}, receipt: { ok: true } },
    ],
    "sim",
  );
  return { real, sim };
}

test("diffProfiles assigns the four classes and both identities hold", () => {
  const { real, sim } = fixtureProfiles();
  const report = diffProfiles(real, sim);
  ok(report.checks.identitySim, "sim identity");
  ok(report.checks.identityReal, "real identity");
  ok(report.tools.only_sim.classes.onlySim > 0, "sim-only tool");
  ok(report.tools.only_real.classes.onlyReal > 0, "live-only tool");
  ok(report.tools.fx.classes.same > 0, "shared field SAME");
  ok(report.checks.everyValueDiffAttributed, "fixture diffs are all attributed");
  const paths = report.valueDiffs.map((d) => d.field);
  ok(paths.includes("at"), "clock field is a value diff");
  ok(paths.includes("member"), "domain id is a value diff");
  ok(paths.includes("hint"), "content differs");
});

// ── 3. the attribution matrix, rule by rule ────────────────────────────────────────────────────────────────────
test("attribution: declared gaps, coverage subsets, clocks, ids, env, contract, content, counts", () => {
  const dir = tmpdir("declared");
  const declared = path.join(dir, "declared.json");
  fs.writeFileSync(declared, JSON.stringify({ fx: { kind: "environment", keys: ["ws"] } }), "utf8");
  loadDeclarations(declared);
  ok(isDeclared("fx", "ws"), "declared key is recognised");
  eq(attribute("fx", "ws", new Set(["a"]), new Set(["b"])).attribution, "environmental", "declared wins");
  loadDeclarations(DECLARED); // restore the shipped allowlist for the remaining assertions

  eq(attribute("t", "x", new Set(["a"]), new Set(["a", "b"])).kind, "coverage", "subset is coverage");
  eq(attribute("t", "at", new Set(["<iso>"]), new Set(["<epoch-ms>"])).attribution, "timestamp", "clock");
  eq(attribute("t", "member", new Set(["r-1"]), new Set(["r-2"])).attribution, "id", "domain id");
  eq(attribute("t", "current.bytes", new Set(["1"]), new Set(["2"])).kind, "env-suspect", "live env path without declaration");
  eq(attribute("t", "ok", new Set(["true"]), new Set(["false"])).attribution, "真缺陷", "contract contradiction");
  eq(attribute("t", "state", new Set(["open"]), new Set(["waiting"])).attribution, "真缺陷", "contract state contradiction");
  eq(attribute("t", "state", new Set(["open"]), new Set(["open", "waiting"])).attribution, "environmental", "mixed contract set is coverage");
  eq(attribute("t", "hint", new Set(["a long simulated hint about the fixture"]), new Set(["a long live hint about the deployment"])).kind, "content", "prose is fixture content");
  eq(attribute("t", "count", new Set(["1"]), new Set(["2"])).attribution, "environmental", "fixture-driven count");
});

test("mutant: a valueDiff no rule can name is RED in strict mode and named otherwise", () => {
  const real = buildProfile([{ tool: "mt", fields: { hint: "alpha" }, args: {} }], "real");
  const sim = buildProfile([{ tool: "mt", args: {}, receipt: { hint: "beta" } }], "sim");
  const lenient = diffProfiles(real, sim);
  ok(lenient.checks.everyValueDiffAttributed, "the fixture-shaped fallback names it");
  const strict = diffProfiles(real, sim, { strict: true });
  const un = strict.valueDiffs.filter((d) => !d.attribution);
  eq(un.length, 1, "strict mode leaves exactly the nameless diff");
  eq(un[0].field, "hint", "the nameless diff is the mutant field");
  ok(!strict.checks.everyValueDiffAttributed, "the gate would be RED");
});

test("CLI tiers: lenient 0, --strict 0 with content reported, --strict-content 1, and --strict still red on a semantic diff", () => {
  // TB-2631 three-tiered the judge: `--strict` answers "is the CONTRACT consistent?" and `--strict-content` adds "is the
  // CONTENT identical?". The old fixture (hint alpha/beta) is CONTENT, so its expected exit moved 1 -> 0 for plain
  // `--strict`; the assertion is changed in MEANING, not deleted. Two negative guards keep the tiering from turning
  // `--strict` into an always-green check: (a) the content diff must still be COUNTED and reported, (b) a semantic
  // disagreement with no attribution must still exit 1.
  const dir = tmpdir("cli");
  const realFile = path.join(dir, "real.jsonl");
  const simDir = path.join(dir, "sim");
  const outA = path.join(dir, "out-lenient");
  const outB = path.join(dir, "out-strict");
  fs.mkdirSync(simDir, { recursive: true });
  fs.writeFileSync(realFile, JSON.stringify({ tool: "mt", args: {}, fields: { hint: "alpha" } }) + "\n", "utf8");
  fs.writeFileSync(path.join(simDir, "receipts.jsonl"), JSON.stringify({ tool: "mt", args: {}, receipt: { hint: "beta" } }) + "\n", "utf8");
  const lenientCode = main(["--real", realFile, "--sim", simDir, "--out", outA]);
  eq(lenientCode, 0, "lenient exit code");
  ok(fs.existsSync(path.join(outA, "diff.json")), "diff.json written");
  ok(fs.existsSync(path.join(outA, "diff-report.md")), "report written");
  const strictCode = main(["--real", realFile, "--sim", simDir, "--out", outB, "--strict"]);
  eq(strictCode, 0, "strict exit code: fixture prose is CONTENT, not a contract disagreement");
  const diff = JSON.parse(fs.readFileSync(path.join(outB, "diff.json"), "utf8"));
  ok(diff.checks.strictSatisfied === true, "strict report says the CONTRACT is consistent");
  ok(diff.checks.strictContentSatisfied === false, "strict report still says the CONTENT differs");
  eq(diff.totals.tiers.content.total, 1, "the content diff is counted, not swallowed");
  eq(diff.totals.tiers.content.unattributed, 1, "the content diff stays unattributed (that is why --strict-content fails)");
  ok(/2b/.test(fs.readFileSync(path.join(outB, "diff-report.md"), "utf8")), "the report has the tier section (2b) a reader needs to see the content bucket");
  const outC = path.join(dir, "out-strict-content");
  const strictContentCode = main(["--real", realFile, "--sim", simDir, "--out", outC, "--strict-content"]);
  eq(strictContentCode, 1, "--strict-content is the tier that fails on content");
  const contentDiff = JSON.parse(fs.readFileSync(path.join(outC, "diff.json"), "utf8"));
  ok(contentDiff.checks.strictContentSatisfied === false, "--strict-content report records the content failure");
  // NEGATIVE GUARD: a SEMANTIC disagreement that nothing can attribute (ALL-CAPS refusal codes on a field that is not a
  // declared selector) must still be a hard failure. An ALL-CAPS token is a contract reading by tierOf(), so this is the
  // fixture that proves `--strict` is not permanently green.
  // WHY THIS PROBE IS NOT ON `code`: two DIFFERENT refusal codes on the same tool.field are classified as a 真缺陷
  // contradiction (the differ reads them as competing contract claims and attributes the pair), so a `code`-side
  // mismatch exits 0 under `--strict` — using it here would produce a probe that cannot go red. ALL-CAPS on a
  // NON-selector leaf has no such attribution, which is exactly what makes it the honest must-red fixture.
  const semReal = path.join(dir, "real-sem.jsonl");
  const semSimDir = path.join(dir, "sim-sem");
  const semOut = path.join(dir, "out-sem");
  fs.mkdirSync(semSimDir, { recursive: true });
  fs.writeFileSync(semReal, JSON.stringify({ tool: "mt", args: {}, fields: { warningLabel: "VMU_ALPHA_BLOCKED" } }) + "\n", "utf8");
  fs.writeFileSync(path.join(semSimDir, "receipts.jsonl"), JSON.stringify({ tool: "mt", args: {}, receipt: { warningLabel: "VMU_BETA_REFUSED" } }) + "\n", "utf8");
  const semCode = main(["--real", semReal, "--sim", semSimDir, "--out", semOut, "--strict"]);
  eq(semCode, 1, "strict exit code is the hard failure on a semantic diff");
  const semDiff = JSON.parse(fs.readFileSync(path.join(semOut, "diff.json"), "utf8"));
  eq(semDiff.totals.tiers.semantic.unattributed, 1, "the semantic diff has no attribution");
  eq(semDiff.checks.strictSatisfied, false, "the strict check is red");
  ok(semDiff.valueDiffs.some((d) => d.tool === "mt" && d.field === "warningLabel" && d.tier === "semantic"), "the report names the tool+field that disagrees");
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── 3b. declaration debt (TB-2628 / RUN 2628): every exemption is key-granular, evidenced and still needed ─────
// The differ SWALLOWS an undeclared live-only field as `onlyReal` and prints "0 gaps", so an allowlist that is
// too wide is invisible in the report. These assertions keep the allowlist the size of the fact: key-granular,
// with a recomputable evidence line, never covering a field the simulator actually produces, and never naming a
// contract-semantic key (code/state/status/kind belong to TB-2627, not here).
const CORPUS_LINES = new Map();
function corpusLines(file) {
  if (CORPUS_LINES.has(file)) return CORPUS_LINES.get(file);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  CORPUS_LINES.set(file, lines);
  return lines;
}
function declaredRows() {
  const raw = JSON.parse(fs.readFileSync(DECLARED, "utf8"));
  return Object.keys(raw).filter((k) => !k.startsWith("_")).map((tool) => ({ tool, row: raw[tool] }));
}
function declaredKeys() {
  const out = [];
  for (const { tool, row } of declaredRows()) for (const key of Array.isArray(row && row.keys) ? row.keys : []) out.push({ tool, key, row });
  return out;
}
function liveKeys() {
  const sets = new Map();
  const add = (tool, key) => {
    if (!sets.has(tool)) sets.set(tool, new Set());
    sets.get(tool).add(key);
  };
  for (const file of [richReal(), shallowReal()]) {
    if (!fs.existsSync(file)) continue;
    for (const line of corpusLines(file)) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (!row || !row.tool) continue;
      for (const key of Object.keys(row.fields || {})) add(row.tool, key);
      for (const key of Array.isArray(row.keys) ? row.keys : []) add(row.tool, key);
    }
  }
  return sets;
}
// The keys TB-2628 closed; the budget rule of the taskbook is per-run (<= 20), not on the whole historical table.
// TB-2645 (declaration cleanup): the twelve `bytes`/`*.path` keys that were added here as `sim-cannot` were NOT
// readings the simulator cannot produce -- `scripts/sim/audit/all.mjs` reported them as "no longer match any gap"
// (0 gaps before and after the deletion) while, in the value-difference lane, they were backing content diffs as
// "declared". A declaration may only say "this side cannot produce the field"; using it to excuse two produced
// values is the same defect as G14. They are gone from fidelity-declared.json and from this list together.
//
// TB-2628 final two (`receipt.delegation.path` / `receipt.delivery.path`) CLOSED with the same test the packPath /
// store.version pair got: the `turns` scenario drives the delegated delivery channel, and its receipts now carry
// both leaves (`corpus-turns` -> vibe_vmu_turn fields `receipt.delegation.path`, `receipt.delivery.path`). So the
// sim DOES produce the reading: declaring it would be stale debt (the audit's stale-key WARN, gate-red). The list
// is therefore empty and kept as a name for the closure evidence below -- not as a blanket exemption.
const TB2628_CLOSED = [
  "vibe_vmu_turn.receipt.delegation.path",
  "vibe_vmu_turn.receipt.delivery.path",
];

test("declarations: every declared key carries a why and a RE-READABLE corpus evidence line", () => {
  const rows = declaredRows();
  ok(rows.length > 0, "the shipped declaration table is not empty");
  const bad = [];
  for (const { tool, row } of rows) {
    const keys = Array.isArray(row && row.keys) ? row.keys : [];
    for (const key of keys) {
      const detail = row && row.details ? row.details[key] : null;
      const why = detail && typeof detail.why === "string" ? detail.why.trim() : "";
      const evidence = detail && typeof detail.evidence === "string" ? detail.evidence.trim() : "";
      if (!why) { bad.push(tool + "." + key + " (no why)"); continue; }
      if (!evidence) { bad.push(tool + "." + key + " (no evidence)"); continue; }
      const m = evidence.match(/^(.+\.jsonl):(\d+)$/);
      if (!m) { bad.push(tool + "." + key + " (evidence is not <corpus>.jsonl:<line>)"); continue; }
      const file = m[1];
      const n = Number(m[2]);
      if (!fs.existsSync(file)) { bad.push(tool + "." + key + " (evidence file missing)"); continue; }
      const lines = corpusLines(file);
      let parsed = null;
      try { parsed = JSON.parse(lines[n - 1]); } catch { parsed = null; }
      if (!parsed || parsed.tool !== tool) { bad.push(tool + "." + key + " (evidence line does not name this tool)"); continue; }
      const present = Object.prototype.hasOwnProperty.call(parsed.fields || {}, key) || (Array.isArray(parsed.keys) && parsed.keys.includes(key));
      if (!present) bad.push(tool + "." + key + " (evidence line does not contain this key)");
    }
  }
  eq(bad, [], "declarations lacking why/evidence or pointing at a line that does not prove the claim");
});

test("declarations: every declared key occurs in the live corpus at least once (no unused exemption)", () => {
  const live = liveKeys();
  const missing = declaredKeys().filter(({ tool, key }) => !(live.get(tool) && live.get(tool).has(key))).map(({ tool, key }) => tool + "." + key);
  eq(missing, [], "declared keys that never appear in the live corpus");
});

test("declarations: the TB-2628 keys are CLOSED (produced by the sim, not exempted)", () => {
  // The sim may emit a key in a shape that has no live counterpart; what makes a key a gap is that the PAIRED
  // shapes lack it. A closed key is one the sim now produces, so the only two honest facts to pin are: it is not
  // live-only any more (no exemption would be true), and it is not declared anyway (a declaration would be stale
  // debt the audit warns about, and the gate treats a warning as red).
  const liveOnly = new Set();
  for (const corpus of [richReal(), shallowReal()]) {
    if (!fs.existsSync(corpus)) continue;
    const { diff } = computeDiff({ real: corpus, sim: [simRoot()], top: 25 });
    for (const [tool, row] of Object.entries(diff.tools || {})) {
      for (const field of row.onlyRealFields || []) liveOnly.add(tool + "." + field);
    }
  }
  const reopened = TB2628_CLOSED.filter((k) => liveOnly.has(k));
  eq(reopened, [], "closed TB-2628 keys that are live-only again (they would need a declaration, not silence)");
  const declaredSet = new Set(declaredKeys().map(({ tool, key }) => tool + "." + key));
  eq(TB2628_CLOSED.filter((k) => declaredSet.has(k)), [], "closed TB-2628 keys must not be re-declared: the `turns` scenario emits them, so the declaration would be an exemption for a reading that is gone");
});

test("declarations: no contract-semantic key is exempted and the annex stays within its key budget", () => {
  const contractLeaf = /(^|\.)(code|state|status|kind|ok)$/;
  const forbidden = declaredKeys().filter(({ key }) => contractLeaf.test(key)).map(({ tool, key }) => tool + "." + key);
  eq(forbidden, [], "contract-semantic keys must not be declared (that is TB-2627's domain)");
  // Budget, not an open bar: TB-2628 allowed at most 20 keys per run, and the annex as a whole has to stay a list of
  // named facts rather than a blanket. Closed keys are asserted NOT to be declared by the test above, so this is the
  // remaining half: the table is still bounded.
  const total = declaredKeys().length;
  ok(total > 0 && total <= 400, "the annex declares " + total + " keys (bounded; every one of them a named gap)");
});

// ── 4. the live corpus passes the contract (a missing corpus is a RED, not a skip) ──────────────────────────────
test("integration: live corpus vs every simulator corpus passes the parity contract", () => {
  const rich = fs.existsSync(path.resolve(corpusRoot(), "compare/real-fields.jsonl")) ? richReal() : null;
  const real = rich || shallowReal();
  // The contract is measured across EVERY simulator corpus, not just end-to-end: coverage counts tools that at least
  // one scenario exercised, so a single scenario leaves a third of the live tools unpaired (the first portability pass
  // narrowed this to e2eCorpus() and coverage fell to 10 < 20 -- the corpus root is the honest input).
  requireCorpusDir("e2e");
  const sim = corpusRoot();
  const { diff } = computeDiff({ real, sim: [sim], top: 25 });
  ok(diff.checks.identitySim, "sim identity on the live corpus");
  ok(diff.checks.identityReal, "real identity on the live corpus");
  ok(diff.checks.everyValueDiffAttributed, "no unattributed valueDiff: " + JSON.stringify(diff.valueDiffs.filter((d) => !d.attribution).slice(0, 5)));
  ok(diff.coverage.paired >= 20, "top-25 coverage: " + diff.coverage.paired + " paired");
  eq(diff.toolsNoSim.length, 0, "every live tool also has a simulator receipt");
  ok(diff.totals.unpaired.real > 0 && diff.totals.unpaired.sim > 0, "unpaired calls are counted, not dropped");
  for (const gap of diff.declarationGaps) ok(gap.tool && gap.field, "gap is named: " + JSON.stringify(gap));
  // TB-2628: the annex is only debt when a gap is NAMED and undeclared. Once every live-only field is declared,
  // the debt is zero -- an assertion with teeth, because deleting a declaration re-opens the gap and turns this red.
  // TB-2645/TB-2656: `kind:"env-suspect"` is NOT declaration debt. It is the value-difference lane reporting a field
  // BOTH sides produced with different values that no declaration explains -- that class belongs to content
  // attribution (environmental/timestamp/id/defect), never to a `sim-cannot` allowlist. The differ now routes it to
  // its own `contentEnvSuspect` table, so the debt assertion below needs NO filter: a declaration gap that carries a
  // produced reading is the bug itself, and it would surface here instead of being filtered away.
  eq(diff.declarationGaps.filter((gap) => gap.kind === "env-suspect").length, 0, "no env-suspect entry is counted as declaration debt");
  eq(diff.declarationGaps.length, 0, "declaration debt is zero: " + JSON.stringify(diff.declarationGaps.slice(0, 6)));
  eq(diff.checks.declarationGapsAreUnproduced, true, "every declaration gap is a field the simulator never produced");
  // The same corpus must still ACCOUNT for the both-sides-different class in a named place -- an empty debt table is
  // only honest if the excluded class did not simply vanish. Each entry has to carry both readings.
  eq(diff.checks.contentEnvSuspect, diff.contentEnvSuspect.length, "contentEnvSuspect count matches the table");
  eq(diff.checks.contentEnvSuspectHasBothSides, true, "every contentEnvSuspect entry carries a sim AND a real reading");
  const suspectWithoutReal = diff.contentEnvSuspect.filter((g) => !Array.isArray(g.sim) || !g.sim.length || !Array.isArray(g.real) || !g.real.length);
  eq(suspectWithoutReal.length, 0, "no contentEnvSuspect entry is one-sided: " + JSON.stringify(suspectWithoutReal.slice(0, 4)));
  for (const defect of diff.defects) eq(defect.attribution, "真缺陷", "defect list only holds the contract contradiction class");
  ok(diff.valueDiffs.length > 0, "there are real value differences to attribute");
  const attributions = diff.totals.attributions || {};
  ok((attributions.environmental || 0) > 0, "environmental causes exist");
  const unmapped = diff.valueDiffs.filter((d) => d.attribution && !["environmental", "timestamp", "id", "真缺陷"].includes(d.attribution));
  eq(unmapped.length, 0, "every attribution is one of the four allowed names");
});

console.log("");
console.log("sim-vs-real: " + passed + " passed, " + failures.length + " failed");
for (const f of failures) console.log("FAILED " + f.name + " -- " + f.message);
if (failures.length) process.exit(1);
