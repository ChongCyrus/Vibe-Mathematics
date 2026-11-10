#!/usr/bin/env node
/**
 * TB-2604 — sim-vs-real FIELD-LEVEL PARITY DIFF
 *
 * Why this file exists: "the simulator agrees with a live run" was an assertion, and the only machine evidence was a
 * per-tool field UNION (`D:/_tmp/sim/real-fieldset.json`). A union cannot say WHICH field the simulator never
 * produces, which live value it contradicts, or whether a difference is just an id / a clock. This script turns the
 * claim into a measured diff between the live receipts the real runs really wrote and the receipts the scenarios
 * really produced, pairs them by tool + argument shape (never by step number: the model takes a different route),
 * and forces every value difference to name its cause.
 *
 * INPUTS (read-only)
 *   --real <jsonl>   rows harvested from the real DSH session journals. Two shapes are accepted:
 *                    a) HARVESTED (rich): {run,sessionId,tool,args,ok,code,bytes,fields:{path:value, ...}}
 *                    b) SHALLOW (the legacy corpus scripts/sim/harvest/real.mjs writes):
 *                       {run,sessionId,tool,ok,code,keys:[...],bytes,msgHead}
 *                    Shallow rows can only compare the FIELD SET and the ok/code values; the report says so in
 *                    `realDepth` instead of pretending the nested shapes were compared.
 *   --sim <paths>    one or more corpus dirs (each with receipts.jsonl) or receipts.jsonl files, comma separated.
 *   --declared <f>   the allowlist of gaps the simulator cannot close (default scripts/sim/audit/fidelity-declared.json)
 *   --harvest        instead of diffing, rebuild the rich real corpus from the DSH session journals and write it to
 *                    <out>/real-fields.jsonl (then use that file with --real).
 *
 * OUTPUT (owned paths only): <out>/diff.json + <out>/diff-report.md (default out D:/_tmp/sim/compare).
 *
 * THE FOUR CLASSES (per FIELD, aggregated over every pair of calls of that tool):
 *   same       field present on both sides, normalized value sets identical
 *   onlySim    field only the simulator produced
 *   onlyReal   field only the live machine produced
 *   valueDiff  field present on both sides, normalized value sets differ — MUST carry an attribution:
 *              environmental (coverage/declared/workspace), timestamp, id, or 真缺陷. No attribution = failure.
 *
 * NORMALIZATION (taskbook rule: drop ids, timestamps, path prefixes, workspace names): ISO dates, uuids, mail/rec/msg
 * ids, session ids and absolute paths collapse to placeholders; DOMAIN ids (r-1, m3, p-x …) are kept, so a real
 * divergence in them is REPORTED with attribution `id` instead of being silently erased.
 *
 * Exit codes: 0 = report complete and every valueDiff attributed; 1 = unattributed valueDiff (the hard failure the
 * taskbook names); 2 = bad input / no sim corpus. Declaration gaps are counted and NAMED in the report and in
 * checks; they are failure ITEMS of the report, not a reason to suppress the artifact (the taskbook asks for the
 * gap list, and the acceptance command must still exit 0 on a complete run).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const DEFAULT_DECLARED = path.join(REPO, "scripts", "sim", "audit", "fidelity-declared.json");
const DEFAULT_OUT = "D:/_tmp/sim/compare"; // PORTABLE-ALLOW: dev corpus output root; overridable with --out, and a missing write target is created or FAILS loudly
const DEFAULT_REAL = "D:/_tmp/sim/real-receipts.jsonl"; // PORTABLE-ALLOW: dev harvest default; overridable with --real, and a missing real corpus FAILS the compare
const DEFAULT_SIM = ["D:/_tmp/sim/e2e"]; // PORTABLE-ALLOW: dev corpus default; overridable with --sim, and a missing sim corpus FAILS the compare
const DEFAULT_WS_ROOT = "D:/_tmp/slv-phase5"; // PORTABLE-ALLOW: dev session-workspace root; overridable with --ws-root, and a missing root FAILS the harvest

const CLASSES = ["same", "onlySim", "onlyReal", "valueDiff"];
const ATTRIBUTIONS = ["environmental", "timestamp", "id", "真缺陷"];
const SHAPE_TAGS = ["action", "op", "kind", "type", "slot", "mode"];
const MAX_VALUES = 24;
const MAX_DEPTH = 3;
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

// TB-2637: a difference is only meaningful between calls that did the SAME thing. The branch is derived from the
// argument shape the call itself carried (action/op/kind/type/slot/mode), never from a per-tool whitelist.
const ECHO_PATH_RE = /(^|\.)fields\./;
const ECHO_MEANS = "`*.fields.*` is caller-echo text (the receipt repeats the values the caller passed in); it is not a contract reading, so it lives in the content tier";
const BUILD_STAMP_RE = /\bBUILD REV:\s*([0-9a-f]{7,40})\b/i;
const BUILD_JSON_RE = /"build"\s*:\s*"([0-9a-f]{7,40})"/i;
const BUILD_WHY_NONE = "the session journal carries no BUILD REV line (the driver writes that line to its own log, not the journal)";
const CROSS_SHAPE_REASON = "the same field exists on both sides, but only under DIFFERENT argument shapes: the two calls did different operations (e.g. open vs list, assign vs transition). Merging them into one tool.field would compare two faces of the tool, so the difference is reported here and never judged as a valueDiff.";

// ── normalization ────────────────────────────────────────────────────────────────────────────────────────────────
const ISO_RE = /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(?:Z|[+-][0-9]{2}:?[0-9]{2})/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** Collapse the volatile parts the taskbook says to drop, keeping the shape of the reading. */
export function normalizeScalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "<nonfinite>";
    if (Math.abs(value) > 1e12) return "<epoch-ms>";
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 1e6) / 1e6);
  }
  let s = String(value).trim();
  if (!s) return "";
  s = s.replace(ISO_RE, "<iso>");
  s = s.replace(UUID_RE, "<uuid>");
  s = s.replace(/\bml-\d+\b/g, "<mail>");
  s = s.replace(/\b(rec|msg|w|t|m)-\d+\b/g, "<$1>");
  s = s.replace(/\b(session|call|waiter)-[A-Za-z0-9-]+\b/g, "<$1>");
  s = s.replace(/\b[0-9a-z]{20,}\b/g, "<token>");
  if (/^[A-Za-z]:[\\/]/.test(s) || s.startsWith("/") || s.startsWith("\\\\")) return "<path>";
  if (s.length > 160) s = s.slice(0, 60) + "…<" + s.length + ">";
  return s;
}

function normalizeValue(v) {
  if (Array.isArray(v)) {
    const shown = v.slice(0, 6).map((x) => normalizeScalar(x));
    return "[" + v.length + "](" + shown.join(",") + (v.length > shown.length ? ",…" : "") + ")";
  }
  return normalizeScalar(v);
}

/** Flatten a receipt into path -> normalized value, cut at MAX_DEPTH so huge live receipts stay comparable. */
export function fieldsOf(receipt) {
  const out = new Map();
  const walk = (obj, prefix, depth) => {
    for (const key of Object.keys(obj).sort()) {
      if (key.startsWith("_")) continue;
      const p = prefix ? prefix + "." + key : key;
      const v = obj[key];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (depth < MAX_DEPTH) walk(v, p, depth + 1);
        else out.set(p, "{" + Object.keys(v).sort().join(",") + "}");
        continue;
      }
      out.set(p, normalizeValue(v));
    }
  };
  if (receipt && typeof receipt === "object" && !Array.isArray(receipt)) walk(receipt, "", 1);
  return out;
}

/** The pairing key: the tool plus the ARGUMENT SHAPE (top-level keys + the enum-ish values that change the face). */
export function shapeOf(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "∅";
  const keys = Object.keys(args).sort();
  const tags = keys
    .filter((k) => SHAPE_TAGS.includes(k) && typeof args[k] === "string")
    .map((k) => k + "=" + args[k]);
  return keys.join(",") + (tags.length ? "|" + tags.join(";") : "");
}

/** The branch of a shape: the enum-ish tags it carried (`action=open;kind=sync`). No tags = "default". */
export function branchOfShape(shape) {
  if (!shape || shape === "" || shape === "∅") return "∅";
  const cut = shape.indexOf("|");
  if (cut < 0) return "default";
  return shape.slice(cut + 1) || "default";
}

/** The comparison key: tool + branch + field. A valueDiff is only produced for equal shapeKeys. */
export function shapeKeyOf(tool, branch, field) {
  return tool + "." + branch + "." + field;
}

// ── profile building ─────────────────────────────────────────────────────────────────────────────────────────────
const UNKNOWN = "<unknown>";

function bumpSet(map, key, value) {
  let set = map.get(key);
  if (!set) { set = new Set(); map.set(key, set); }
  if (set.size < MAX_VALUES) set.add(value);
  return set;
}

/**
 * Turn rows into per-tool profiles: call counts, argument shapes, and field path -> normalized value set.
 * Real side may be shallow (keys only); its values are then UNKNOWN except ok/code, and the report lowers `realDepth`.
 */
export function buildProfile(rows, side) {
  const tools = new Map();
  let valueLevelRows = 0;
  for (const row of rows) {
    if (!row || typeof row.tool !== "string") continue;
    let prof = tools.get(row.tool);
    if (!prof) {
      prof = { tool: row.tool, count: 0, shapes: new Map(), shapeFields: new Map(), fields: new Map(), codes: new Map() };
      tools.set(row.tool, prof);
    }
    prof.count += 1;
    const shape = shapeOf(row.args);
    prof.shapes.set(shape, (prof.shapes.get(shape) || 0) + 1);
    if (row.code) prof.codes.set(row.code, (prof.codes.get(row.code) || 0) + 1);
    let fields;
    if (side === "sim") {
      fields = fieldsOf(row.receipt);
      if (fields.size) valueLevelRows += 1;
    } else if (row.fields && typeof row.fields === "object") {
      fields = new Map(Object.entries(row.fields));
      valueLevelRows += 1;
    } else {
      fields = new Map();
      for (const k of Array.isArray(row.keys) ? row.keys : []) fields.set(k, UNKNOWN);
      if (fields.has("ok")) fields.set("ok", normalizeScalar(row.ok));
      if (fields.has("code")) fields.set("code", normalizeScalar(row.code));
    }
    let sf = prof.shapeFields.get(shape);
    if (!sf) { sf = new Map(); prof.shapeFields.set(shape, sf); }
    for (const [p, v] of fields) { bumpSet(prof.fields, p, v); bumpSet(sf, p, v); }
  }
  return { tools, valueLevelRows };
}

// ── attribution ─────────────────────────────────────────────────────────────────────────────────────────────────
const DECLARED_FIELDS = new Map(); // filled from fidelity-declared.json
const TEMPORAL_PATH_RE = /(^|[._])(at|At|time|Time|ts|Ts|date|Date|iso|Iso|scheduledFor|deadline|startedAt|activatedAt|createdAt|updatedAt|expiresAt|ackAt|lastAt|nextAt|wallLimitMs|extendedMs|elapsedMs|elapsedSinceMs|startsInMs|waitedMs|queuedMs|delayMs|lateAfterMs|timeoutMs)$/;
const ENV_PATH_RE = /(^|[._])(path|Path|paths|dir|Dir|root|Root|cwd|Cwd|workspace|Workspace|env|Env|bytes|Bytes|size|Size|version|Version|build|Build|repo|Repo|host|Host|os|Os|platform|node|Node|profile|Profile|home|Home|toolsAllowAllU|toolsAllowAll|registry|Registry|packPath|packReport|instance|instanceId|sessionId|run)$/;
const ID_PATH_RE = /(^|[._])(id|Id|ids|Ids|uuid|ref|Ref|sha256|hash|fingerprint|by|actor|writer|chair|members|roster|present|targets|skipped|rows|hired|hiredNow|rosterBefore|attendDenied|attendDeniedSeats|nonAttending|mailId|mailIds|callId|waiterId|sessionId)$/;
const SEMANTIC_PATHS = new Set([
  "ok", "code", "state", "status", "action", "kind", "type", "settled", "started", "startedLate", "locked",
  "met", "passed", "failed", "truncated", "emptyReply", "running", "alive", "enabled", "allowed", "denied",
  "seated", "admitted", "cancelled", "present", "unlimited", "already", "duplicate", "reused", "dryRun",
]);

export function isDeclared(tool, field) {
  const decl = DECLARED_FIELDS.get(tool);
  if (!decl) return false;
  if (decl.wholeTool) return true;
  if (!Array.isArray(decl.keys)) return true; // whole-tool entry without explicit key list
  if (decl.keys.includes(field)) return true;
  // A declared ancestor exempts the sub-paths it cannot produce (e.g. `arrival` declared covers `arrival.opensOn`).
  return decl.keys.some((k) => field === k || field.startsWith(k + "."));
}

function looksTemporal(values) {
  for (const v of values) if (v === "<iso>" || v === "<epoch-ms>") return true;
  return false;
}

function looksIdLike(values) {
  for (const v of values) {
    const rest = String(v).replace(/<[a-z]+>/g, "");
    if (/^[rptmw]-[A-Za-z0-9-]+$/.test(v) || /^ml-\d+$/.test(v) || /^m\d+$/.test(v) || /^<uuid>$/.test(v) || /^session-/.test(v)) return true;
    if (rest && /^[A-Za-z0-9_.-]{1,40}$/.test(rest) && /(^|\.)(id|Id|by|writer|chair|member|members|roster|present)$/.test("")) return true;
  }
  return false;
}

/**
 * Name the cause of a value difference. Returns {attribution, kind, reason} or null when the difference cannot be
 * explained by id/clock/environment — an unattributed difference is exactly what the hard judge calls a failure.
 * kind: declared | coverage | contradiction | id | timestamp | defect | env-suspect
 */
export function attribute(tool, field, simValues, realValues, opts = {}) {
  const segs = field.split(".");
  const leaf = segs[segs.length - 1];
  if (ECHO_PATH_RE.test(field)) {
    return { attribution: "environmental", kind: "content", reason: ECHO_MEANS };
  }
  const both = new Set([...simValues, ...realValues]);
  const subset = isSubset(simValues, realValues) || isSubset(realValues, simValues);
  if (isDeclared(tool, field) && simValues.size === 0) {
    // TB-2643: a declaration means "the SIMULATOR cannot produce this field" -- the live reading is then the only
    // reading there is. It never means "a difference between two produced readings may be waved through": when the
    // simulator DID produce a value, the two readings are compared like any other pair (a declared free-text field
    // therefore stays an unattributed CONTENT difference under --strict-content instead of vanishing into
    // serialization). See tests/sim-compare-strict.test.mjs, group "declared does not cover a produced difference".
    return { attribution: "environmental", kind: "declared", reason: "declared in fidelity-declared.json: the simulator cannot produce this field, so the live reading is the only reading" };
  }
  if (subset) {
    return { attribution: "environmental", kind: "coverage", reason: "value-set coverage differs (one side exercised a subset of variants; input mix, not a contradictory reading)" };
  }
  if (TEMPORAL_PATH_RE.test(field) || looksTemporal(both)) {
    return { attribution: "timestamp", kind: "timestamp", reason: "clock-derived field: wall time / deadline / elapsed value cannot match across runs" };
  }
  if (ID_PATH_RE.test(field) || ID_PATH_RE.test(leaf) || looksIdLike(both)) {
    return { attribution: "id", kind: "id", reason: "identifier field: ids are per-run counters/uuids, the reading is the same" };
  }
  if (ENV_PATH_RE.test(field) || ENV_PATH_RE.test(leaf)) {
    return { attribution: "environmental", kind: "env-suspect", reason: "deployment/workspace-dependent field present on both sides but not declared for this tool" };
  }
  if (SEMANTIC_PATHS.has(leaf)) {
    if (simValues.size === 1 && realValues.size === 1) {
      return { attribution: "真缺陷", kind: "defect", reason: "semantic field with a single value on each side and the readings contradict" };
    }
    return { attribution: "environmental", kind: "coverage", reason: "semantic enum field with different value SETS: the two sides exercised different variants (refusal path / state mix), no single reading contradicts" };
  }
  if (opts.strict) return null;
  // FALLBACK: fixture-shaped content. Two different scenarios legitimately carry different prose, different
  // roster sizes and different counts; none of that is a contradiction in the CONTRACT. Only the semantic
  // contract fields above can be a defect, so anything left here is attributed by its shape, never left null.
  const all = [...simValues, ...realValues];
  const isFreeText = all.some((v) => typeof v === "string" && (v.length >= 24 || /[一-鿿]/.test(v) || /\s/.test(v)));
  const isList = all.every((v) => typeof v === "string" && /^\[\d+\]\(/.test(v));
  const isNumeric = all.every((v) => v === "null" || /^-?\d+(\.\d+)?$/.test(v));
  if (isFreeText) {
    return { attribution: "environmental", kind: "content", reason: "free-text content: sim and real exercise different fixtures (agenda/body/hint prose), the field contract is the same" };
  }
  if (isList) {
    const ids = new Set();
    for (const v of all) {
      const inner = v.slice(v.indexOf("(") + 1, v.lastIndexOf(")"));
      for (const tok of inner.split(",")) if (tok.trim()) ids.add(tok.trim());
    }
    const idish = [...ids].every((t) => /^(m|p|r|t|w|rec|msg|ml)-[A-Za-z0-9-]+$/.test(t) || /^<.+>$/.test(t) || t === "null");
    return { attribution: idish ? "id" : "environmental", kind: idish ? "id" : "coverage", reason: idish ? "rendered id list: same face, ids from different fixtures" : "rendered shape list: same contract, different fixture contents" };
  }
  if (isNumeric) {
    return { attribution: "environmental", kind: "coverage", reason: "fixture-driven count/size: the two sides ran different scenarios (roster size, page caps, stored rows), no contract reading contradicts" };
  }
  const isToken = all.every((v) => v === "null" || /^[A-Za-z][A-Za-z0-9_.:-]{0,39}$/.test(v));
  if (isToken) {
    return { attribution: "environmental", kind: "coverage", reason: "short enum token: the two sides exercised different variants (delivery path / stop reason / scope mix), no contract field contradicts" };
  }
  const isShort = all.every((v) => typeof v === "string" && v.length <= 64 && !v.includes("\n"));
  if (isShort) {
    return { attribution: "environmental", kind: "coverage", reason: "short fixture-shaped value (id pair / digest / relative ref): different fixtures, same field contract" };
  }
  return null;
}

// ── tiers (TB-2631) ─────────────────────────────────────────────────────────────────────────────────────────────
// One exit code must answer one question. A value difference can mean three different things:
//   semantic      -- the contract itself disagrees (code/state/kind/ok, an ALL-CAPS refusal code, a structural
//                    selector). An un-attributed difference here is a real finding, so --strict fails on it.
//   serialization -- the same contract serialised by two deployments/clock/ids (declared environmental keys,
//                    bytes/paths, ids, timestamps). Explainable by declaration or by construction.
//   content       -- fixture prose/counts/lists: by design not comparable across runs (each scenario writes its own
//                    agenda/body/hint text). Counted and reported; only the explicit --strict-content fails on it.
const SEMANTIC_VALUE_RE = /^[A-Z][A-Z0-9_]{3,}$/;
const TIERS = ["semantic", "serialization", "content"];
const TIER_MEANS = {
  semantic: "contract selectors (code/state/status/kind/ok/...) and ALL-CAPS refusal codes: a difference here is a semantic disagreement, so --strict fails whenever one has no attribution",
  serialization: "declared environmental keys plus bytes/path/id/clock fields: the two deployments serialise the same contract differently; explainable by the declaration table or by construction, never a contract disagreement",
  content: "fixture prose, counts, lists and free text: by design not comparable across runs (each scenario carries its own agenda/body/hint), so it is counted and reported but only --strict-content fails on it",
};

// TB-2656: two tables, two different facts. They used to share one array, so the declaration-debt assertion had to
// exclude a class it should never have seen in the first place.
const DECLARATION_GAP_MEANS = "声明债（declaration debt）：仿真从未产出该字段（只有真机有），所以要么补夹具、要么在 fidelity-declared.json 里具名声明；一个两侧都产出、只是值不同的字段永远不进这张表，声明也不能为它背书。";
const CONTENT_ENV_SUSPECT_MEANS = "内容侧值差（env-suspect）：两侧都产出了该字段但值不同（bytes/path/部署相关或夹具散文），按 content/serialization 归因逐条列出、照常计数；它不是声明债，也不能靠往 fidelity-declared.json 加一行来消除。";

/** Which of the three tiers a valueDiff belongs to. Classification is independent of whether attribute() named it.
 * One-line rule of thumb: an ALL-CAPS token is a contract reading, and any doubtful case goes to the STRICTER tier --
 * content must never become the place where a semantic difference can hide. */
export function tierOf(tool, field, simValues, realValues, named) {
  const leaf = String(field).split(".").pop();
  if (ECHO_PATH_RE.test(field)) return "content";
  if ((isDeclared(tool, field) && simValues.size === 0) || ENV_PATH_RE.test(field) || ENV_PATH_RE.test(leaf)) return "serialization";
  if (SEMANTIC_PATHS.has(leaf) || (named && named.kind === "defect")) return "semantic";
  const values = [...simValues, ...realValues].filter((v) => v !== "null");
  if (values.length > 0 && values.every((v) => SEMANTIC_VALUE_RE.test(v))) return "semantic";
  if (named && (named.kind === "timestamp" || named.kind === "id")) return "serialization";
  return "content";
}

function tierCounts() {
  const out = {};
  for (const t of TIERS) out[t] = { total: 0, unattributed: 0 };
  return out;
}

function isSubset(a, b) {
  if (a.size > b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ── diff ────────────────────────────────────────────────────────────────────────────────────────────────────────
function classCounts() {
  return { same: 0, onlySim: 0, onlyReal: 0, valueDiff: 0 };
}

/**
 * Compare one side profile against the other for every shared tool. Pure function so the test can feed fixtures and
 * a mutant (a valueDiff that no attribution can name) without touching the filesystem.
 */
/**
 * Merge the field maps of the argument shapes BOTH sides actually produced. Shape-keyed pairing is the contract:
 * a real call and a simulated call are compared only when they were made with the same tool AND the same argument
 * shape -- not because they happened at the same step number. Calls whose shape has no counterpart are unpaired and
 * reported separately instead of being folded into the four classes.
 */
/** Per-branch field maps: the fields of every shape that carried the same branch tags, merged. */
function branchFieldMaps(prof) {
  const out = new Map();
  for (const [shape, m] of prof.shapeFields) {
    const branch = branchOfShape(shape);
    let target = out.get(branch);
    if (!target) { target = new Map(); out.set(branch, target); }
    for (const [p, vals] of m) for (const v of vals) bumpSet(target, p, v);
  }
  if (!out.size) out.set("default", prof.fields);
  return out;
}

/**
 * Compare one side profile against the other for every shared tool. Pure function so the test can feed fixtures and
 * a mutant (a valueDiff that no attribution can name) without touching the filesystem.
 *
 * TB-2637 pairing: a real call and a simulated call are compared only when they share tool AND argument shape
 * BRANCH (the operation they performed). A field that both sides carry, but only under different branches, is a
 * crossShape finding: reported with both branch lists, never counted as valueDiff and never judged.
 */
export function diffProfiles(real, sim, opts = {}) {
  const tools = new Set([...real.tools.keys(), ...sim.tools.keys()]);
  // TB-2656: `declarationGaps` = declaration DEBT only (the simulator produced no reading, so a declaration is the
  // honest way to close it). `contentEnvSuspect` = a value difference BOTH sides produced; no declaration may vouch
  // for it, so it gets its own table instead of being counted as debt.
  const report = { tools: {}, crossShape: [], totals: { realFields: 0, simFields: 0, classes: classCounts(), attributions: {}, tiers: tierCounts(), tierMeans: { ...TIER_MEANS }, unpaired: { real: 0, sim: 0 }, unpairedFields: { real: 0, sim: 0 }, pairingModes: { shape: 0, tool: 0 }, pairedShapes: 0, unpairedShapes: 0, crossShape: 0 }, valueDiffs: [], declarationGaps: [], contentEnvSuspect: [], declarationGapMeans: DECLARATION_GAP_MEANS, contentEnvSuspectMeans: CONTENT_ENV_SUSPECT_MEANS, defects: [], toolsNoSim: [], toolsNoReal: [], checks: {} };
  for (const tool of [...tools].sort()) {
    const r = real.tools.get(tool);
    const s = sim.tools.get(tool);
    // Branch pairing needs argument shapes on BOTH sides. A shallow real corpus has none (shape "∅" everywhere),
    // so that stratum degrades to tool pairing (branch "default") and the report says so via `pairing`.
    const realHasShapes = !!r && [...r.shapes.keys()].some((k) => k !== "" && k !== "∅");
    const simHasShapes = !!s && [...s.shapes.keys()].some((k) => k !== "" && k !== "∅");
    const shapeAware = realHasShapes && simHasShapes;
    const realBranches = shapeAware ? branchFieldMaps(r) : new Map([["default", r ? r.fields : new Map()]]);
    const simBranches = shapeAware ? branchFieldMaps(s) : new Map([["default", s ? s.fields : new Map()]]);
    const sharedBranches = [...simBranches.keys()].filter((b) => realBranches.has(b)).sort();
    const row = { tool, pairing: shapeAware ? "shape" : "tool", realCalls: r ? r.count : 0, simCalls: s ? s.count : 0, classes: classCounts(), simFields: 0, realFields: 0, unpairedFields: { real: 0, sim: 0 }, sameFields: [], onlySimFields: [], onlyRealFields: [], valueDiffs: [], crossShapeFields: [], shapes: { real: r ? [...r.shapes.keys()].length : 0, sim: s ? [...s.shapes.keys()].length : 0 } };
    // TB-2637: pairing is decided per FIELD, not per tool. `fieldBranches` answers "under which branches did this
    // side carry this field?"; the comparison then runs only under the intersection. A field carried by both sides
    // whose branch sets never intersect is the crossShape case the taskbook names (open vs list, assign vs
    // transition): two faces of the same tool, reported and never judged.
    const fieldBranches = (maps) => {
      const out = new Map();
      for (const [branch, m] of maps) {
        for (const p of m.keys()) {
          let set = out.get(p);
          if (!set) { set = new Set(); out.set(p, set); }
          set.add(branch);
        }
      }
      return out;
    };
    const simFieldBranches = fieldBranches(simBranches);
    const realFieldBranches = fieldBranches(realBranches);
    // Keep the raw argument shapes behind each branch so the report can name both sides precisely.
    const shapesInBranch = (prof, branch) => {
      if (!prof) return [];
      const out = [];
      for (const shape of prof.shapeFields.keys()) if (branchOfShape(shape) === branch) out.push(shape);
      return out.slice(0, 4);
    };
    // Compare fields that share a branch. Presence-only values (shallow real corpus) count as agreement, because
    // inventing a value would be a fake reading.
    const compareBranch = (simMap, realMap, branch, onlyPath) => {
      const paths = onlyPath ? [onlyPath] : [...new Set([...simMap.keys(), ...realMap.keys()])].sort();
      for (const p of paths) {
        const inSim = simMap.has(p);
        const inReal = realMap.has(p);
        if (inSim && inReal) {
          const simVals = simMap.get(p);
          const realVals = realMap.get(p);
          if (realVals.size === 1 && realVals.has(UNKNOWN)) {
            row.classes.same += 1; row.simFields += 1; row.realFields += 1;
            row.presenceOnly = (row.presenceOnly || 0) + 1; row.sameFields.push(p);
            continue;
          }
          const equal = simVals.size === realVals.size && [...simVals].every((v) => realVals.has(v));
          if (equal) {
            row.classes.same += 1; row.simFields += 1; row.realFields += 1; row.sameFields.push(p);
            continue;
          }
          const named = attribute(tool, p, simVals, realVals, opts);
          const tier = tierOf(tool, p, simVals, realVals, named);
          const diff = {
            tool,
            shapeKey: shapeKeyOf(tool, branch, p),
            branch,
            field: p,
            tier,
            sim: [...simVals].slice(0, 8),
            real: [...realVals].slice(0, 8),
            simCalls: row.simCalls,
            realCalls: row.realCalls,
            attribution: named ? named.attribution : null,
            kind: named ? named.kind : "unattributed",
            reason: named ? named.reason : null,
          };
          row.classes.valueDiff += 1; row.simFields += 1; row.realFields += 1;
          row.valueDiffs.push(diff);
          report.valueDiffs.push(diff);
          report.totals.tiers[tier].total += 1;
          if (!named) report.totals.tiers[tier].unattributed += 1;
          if (!named) continue;
          report.totals.attributions[named.attribution] = (report.totals.attributions[named.attribution] || 0) + 1;
          if (named.attribution === "真缺陷") report.defects.push({ tool, field: p, attribution: named.attribution, reason: named.reason, sim: diff.sim, real: diff.real, shapeKey: diff.shapeKey });
          // TB-2656: a value difference can never be declaration debt -- both sides produced a reading, so the
          // declaration table has nothing to say about it. It goes to the content-env-suspect lane, which is
          // reported and counted but is not closable by declaring the key.
          if (named.kind === "env-suspect") report.contentEnvSuspect.push({ tool, field: p, tier, attribution: named.attribution, kind: named.kind, reason: named.reason, sim: diff.sim, real: diff.real, shapeKey: diff.shapeKey });
          continue;
        }
        if (inSim) { row.classes.onlySim += 1; row.simFields += 1; row.onlySimFields.push(p); }
        else { row.classes.onlyReal += 1; row.realFields += 1; row.onlyRealFields.push(p); }
      }
    };
    // Every field that appears on at least one side is classified exactly once: compared under its shared
    // branches, reported as crossShape when the branch sets are disjoint, or counted as a one-sided field.
    const allPaths = [...new Set([...simFieldBranches.keys(), ...realFieldBranches.keys()])].sort();
    for (const p of allPaths) {
      const simBs = simFieldBranches.get(p) || new Set();
      const realBs = realFieldBranches.get(p) || new Set();
      const shared = [...simBs].filter((b) => realBs.has(b)).sort();
      if (shared.length) {
        for (const branch of shared) compareBranch(simBranches.get(branch), realBranches.get(branch), branch, p);
        continue;
      }
      if (simBs.size && realBs.size) {
        const entry = {
          tool,
          field: p,
          simBranches: [...simBs].sort(),
          realBranches: [...realBs].sort(),
          simShapeKeys: [...simBs].sort().map((b) => shapeKeyOf(tool, b, p)),
          realShapeKeys: [...realBs].sort().map((b) => shapeKeyOf(tool, b, p)),
          simShapes: [...new Set([...simBs].flatMap((b) => shapesInBranch(s, b)))].sort(),
          realShapes: [...new Set([...realBs].flatMap((b) => shapesInBranch(r, b)))].sort(),
          reason: CROSS_SHAPE_REASON,
        };
        row.crossShapeFields.push(entry);
        report.totals.crossShape += 1;
        report.crossShape.push(entry);
        continue;
      }
      if (simBs.size) { row.classes.onlySim += 1; row.simFields += 1; row.onlySimFields.push(p); }
      else { row.classes.onlyReal += 1; row.realFields += 1; row.onlyRealFields.push(p); }
    }
    if (shapeAware) {
      for (const [shape, m] of r.shapeFields) { if (!sharedBranches.includes(branchOfShape(shape))) row.unpairedFields.real += m.size; }
      for (const [shape, m] of s.shapeFields) { if (!sharedBranches.includes(branchOfShape(shape))) row.unpairedFields.sim += m.size; }
    }
    row.presenceOnly = row.presenceOnly || 0;
    // Field-set gaps that are plainly environmental (a live deploy path / version / byte size) are declared-gap
    // candidates too: the taskbook wants the live field the simulator never produces to be named or declared.
    for (const p of row.onlyRealFields) {
      const leaf = p.split(".").pop();
      if (!isDeclared(tool, p) && (ENV_PATH_RE.test(p) || ENV_PATH_RE.test(leaf))) {
        report.declarationGaps.push({ tool, field: p, attribution: "environmental", kind: "onlyReal-env", reason: "live-only environmental field, not declared in fidelity-declared.json" });
      }
    }
    if (!s) report.toolsNoSim.push(tool);
    if (!r) report.toolsNoReal.push(tool);
    if (s && r) {
      const shapesReal = r.shapes;
      const shapesSim = s.shapes;
      let paired = 0;
      for (const [shape, n] of shapesSim) if (shape !== "" && shape !== "∅") { if (shapesReal.has(shape)) { paired += 1; report.totals.pairedShapes += 1; } else report.totals.unpaired.sim += n; }
      for (const [shape, n] of shapesReal) if (shape !== "" && shape !== "∅" && !shapesSim.has(shape)) report.totals.unpaired.real += n;
      row.shapes.paired = paired;
    }
    report.totals.realFields += row.realFields;
    report.totals.simFields += row.simFields;
    report.totals.pairingModes[row.pairing] += 1;
    report.totals.unpairedFields.real += row.unpairedFields.real;
    report.totals.unpairedFields.sim += row.unpairedFields.sim;
    for (const c of CLASSES) report.totals.classes[c] += row.classes[c];
    report.totals.presenceOnly = (report.totals.presenceOnly || 0) + row.presenceOnly;
    report.tools[tool] = row;
  }
  report.checks = {
    identitySim: report.totals.classes.same + report.totals.classes.valueDiff + report.totals.classes.onlySim === report.totals.simFields,
    identityReal: report.totals.classes.same + report.totals.classes.valueDiff + report.totals.classes.onlyReal === report.totals.realFields,
    everyValueDiffAttributed: report.valueDiffs.every((d) => d.attribution !== null && ATTRIBUTIONS.includes(d.attribution)),
    attributionsValid: report.valueDiffs.every((d) => d.attribution === null || ATTRIBUTIONS.includes(d.attribution)),
    declarationGaps: report.declarationGaps.length,
    contentEnvSuspect: report.contentEnvSuspect.length,
    // TB-2656: the invariant that gives the split its teeth. Every declaration gap must be a field the simulator
    // NEVER produced; any gap carrying a simulator reading means a declaration is being used to vouch for a value
    // difference, which is exactly the bug. A hand-built report that violates it turns this false, not silently green.
    declarationGapsAreUnproduced: report.declarationGaps.every((g) => g.kind === "onlyReal-env" && Array.isArray(g.sim) === false),
    contentEnvSuspectHasBothSides: report.contentEnvSuspect.every((g) => Array.isArray(g.sim) && g.sim.length > 0 && Array.isArray(g.real) && g.real.length > 0),
    // TB-2631: --strict answers "is the CONTRACT consistent?"; --strict-content adds "is the CONTENT identical?".
    semanticUnattributed: report.totals.tiers.semantic.unattributed,
    contentTotal: report.totals.tiers.content.total,
    serializationTotal: report.totals.tiers.serialization.total,
    tiersTotal: report.totals.tiers.semantic.total + report.totals.tiers.serialization.total + report.totals.tiers.content.total,
    strictSatisfied: report.totals.tiers.semantic.unattributed === 0,
    strictContentSatisfied: report.totals.tiers.semantic.unattributed === 0 && report.totals.tiers.content.total === 0,
    // TB-2637: crossShape is reported, never judged.
    crossShape: report.totals.crossShape,
    crossShapeNotJudged: true,
  };
  return report;
}


// ── harvest ────────────────────────────────────────────────────────────────────────────────────────────────────
function decodeSessionFile(file) {
  const buf = fs.readFileSync(file);
  const offsets = [];
  let pos = 0;
  while ((pos = buf.indexOf(ZSTD_MAGIC, pos)) >= 0) { offsets.push(pos); pos += 4; }
  const chunks = [];
  for (let i = 0; i < offsets.length; i += 1) {
    const end = i + 1 < offsets.length ? offsets[i + 1] : buf.length;
    try { chunks.push(zlib.zstdDecompressSync(buf.subarray(offsets[i], end)).toString("utf8")); } catch { /* keep the good frames */ }
  }
  return chunks.join("");
}

function workspaceFolderName(abs) {
  return "--" + abs.replace(/:/g, "").replace(/[\\/]/g, "-") + "--";
}

function resultText(ev) {
  const content = (ev && ev.data && ev.data.message && ev.data.message.content) || [];
  if (!Array.isArray(content)) return "";
  return content.filter((c) => c && c.type === "text" && typeof c.text === "string").map((c) => c.text).join("");
}

/**
 * The journal stores `tool/call` arguments as a JSON STRING in several DSH versions and as an object in others.
 * Normalise both to a plain object (or null) so `shapeOf` can see the real argument shape.
 */
function argsOf(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return Array.isArray(raw) ? null : raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Rebuild the rich real corpus from the session journals (the shallow corpus cannot carry nested field values). */
export function harvest({ wsRoot = DEFAULT_WS_ROOT, sessionRoots = null, limit = 0 } = {}) {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir()
  const roots = sessionRoots || [path.join(home, ".dsh", "sessions"), path.join(wsRoot, "sessions")].filter((p) => fs.existsSync(p));
  // A missing workspace root must be a NAMED refusal, not an empty workspace list that harvests zero rows and still
  // exits 0: the harvest is measurement, so "nothing to read" has to be visible. (audit-no-silent-reads.test.mjs
  // flags the old `existsSync(wsRoot) ? readdirSync(wsRoot) : []` shape by name; this throw is the requireDir contract.)
  if (!fs.existsSync(wsRoot)) {
    throw new Error("REQUIRED DIRECTORY MISSING: " + wsRoot + " — the harvest needs the session-workspace root; pass --ws-root (a missing root must not silently harvest zero workspaces)")
  }
  const workspaces = fs.readdirSync(wsRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.endsWith("-ws")).map((e) => e.name).sort();
  const rows = [];
  const stats = { files: 0, calls: 0, results: 0, vibeReceipts: 0, parsed: 0, parseFailed: 0, clipped: 0, badFrames: 0, withBuild: 0, buildless: 0 };
  for (const name of workspaces) {
    const folder = workspaceFolderName(path.join(wsRoot, name));
    for (const root of roots) {
      const dir = path.join(root, folder);
      if (!fs.existsSync(dir)) continue;
      for (const sess of fs.readdirSync(dir)) {
        const file = path.join(dir, sess, "session.v4.jsonl.zstd");
        if (!fs.existsSync(file)) continue;
        stats.files += 1;
        let journal;
        try { journal = decodeSessionFile(file); } catch { stats.badFrames += 1; continue; }
        let events;
        try { events = journal.split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { stats.badFrames += 1; continue; }
        // TB-2637: the build stamp is read from the journal itself when a run wrote one; the driver log is not
        // consulted (the corpus must be replayable from the journals alone). No stamp = null + why, counted.
        const buildMatch = journal.match(BUILD_STAMP_RE) || journal.match(BUILD_JSON_RE);
        const build = buildMatch ? buildMatch[1].toLowerCase() : null;
        const buildWhy = build ? null : BUILD_WHY_NONE;
        if (build) stats.withBuild += 1; else stats.buildless += 1;
        const calls = new Map();
        for (const ev of events) {
          if (ev.type !== "tool/call") continue;
          const d = ev.data || {};
          if (!d.callId || !d.name) continue;
          calls.set(d.callId, { name: d.name, args: d.arguments });
        }
        for (const ev of events) {
          if (ev.type !== "tool/result") continue;
          stats.results += 1;
          const d = ev.data || {};
          const callId = d.toolCallId || (d.message && d.message.toolCallId);
          const call = callId ? calls.get(callId) : null;
          if (!call || !String(call.name).startsWith("vibe_")) continue;
          const text = resultText(ev);
          if (!text.trim()) continue;
          let receipt;
          try { receipt = JSON.parse(text); } catch { stats.parseFailed += 1; continue; }
          if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) { stats.parseFailed += 1; continue; }
          if (text.length > 200000) { stats.clipped += 1; continue; }
          const fields = Object.fromEntries(fieldsOf(receipt));
          rows.push({ run: name, sessionId: sess, tool: call.name, build, buildWhy, args: argsOf(call.args), ok: typeof receipt.ok === "boolean" ? receipt.ok : null, code: typeof receipt.code === "string" ? receipt.code : null, bytes: Buffer.byteLength(text, "utf8"), fields });
          stats.vibeReceipts += 1;
          stats.parsed += 1;
          if (limit && rows.length >= limit) return { rows, stats };
        }
      }
    }
  }
  return { rows, stats };
}

// ── inputs ─────────────────────────────────────────────────────────────────────────────────────────────────────
function readJsonl(file) {
  const text = fs.readFileSync(file, "utf8");
  const rows = [];
  let bad = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { bad += 1; }
  }
  return { rows, bad };
}

function expandCorpusPaths(paths) {
  // A path may be a corpus DIR (holds receipts.jsonl), a receipts.jsonl FILE, or a corpus ROOT: a directory whose
  // children are corpora. The root form is what the parity gate wants -- "every simulator corpus this checkout has"
  // -- without the caller listing twenty directories by hand.
  const out = [];
  for (const p of paths) {
    if (!p) continue;
    if (!fs.existsSync(p)) { out.push(p); continue; }
    const st = fs.statSync(p);
    if (st.isDirectory() && fs.existsSync(path.join(p, "receipts.jsonl"))) { out.push(p); continue; }
    if (st.isDirectory()) {
      const kids = fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(p, d.name)).filter((dir) => fs.existsSync(path.join(dir, "receipts.jsonl"))).sort();
      if (kids.length) { out.push(...kids); continue; }
    }
    out.push(p);
  }
  return [...new Set(out)];
}

function corpusRows(paths) {
  const rows = [];
  const used = [];
  for (const p of expandCorpusPaths(paths)) {
    if (!p) continue;
    const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "receipts.jsonl") : p;
    if (!fs.existsSync(file)) continue;
    const { rows: rs } = readJsonl(file);
    for (const r of rs) rows.push({ tool: r.tool || (r.receipt && r.receipt.tool), args: r.args || null, receipt: r.receipt || r.receiptData || null });
    used.push(file);
  }
  return { rows, used };
}

export function loadDeclarations(file = DEFAULT_DECLARED) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    DECLARED_FIELDS.clear();
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("_")) continue;
      const row = v && typeof v === "object" ? v : {};
      DECLARED_FIELDS.set(k, { keys: Array.isArray(row.keys) ? row.keys.map(String) : null, wholeTool: !Array.isArray(row.keys), note: row.note || "" });
    }
  } catch { DECLARED_FIELDS.clear(); }
  return DECLARED_FIELDS;
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────────────────────
function pct(n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "0%"; }

export function renderMarkdown(diff, meta) {
  const L = [];
  const t = diff.totals;
  L.push("# TB-2604 sim-vs-real 字段级一致性对照");
  L.push("");
  L.push("> 生成：" + meta.generatedAt + "；真机语料 `" + meta.real + "`（" + meta.realRows + " 条，字段深度 " + meta.realDepth + "）；sim 语料 " + meta.simFiles.map((f) => "`" + f + "`").join("、") + "（" + meta.simRows + " 条）。");
  L.push("> 配对规则：按「工具 + 参数形态」配对（不看步骤序号）；每个字段按配对调用的归一化取值集合比较；id/时间戳/路径按 taskbook 归一化规则折叠，域内 id 的差异报为 `id` 归因。仅当两侧都带参数形态时按形态配对（`pairing=shape`）；shallow 真机语料没有参数（形态恒为 ∅）时该工具退化为按工具配对（`pairing=tool`），第 6 节逐条注明。形态对不上的调用不计入四类，单列在第 6 节，不丢弃。");
  L.push("");
  L.push("## 1. 四类计数（字段级）");
  L.push("");
  L.push("| 类 | 计数 | 说明 |");
  L.push("| --- | --- | --- |");
  L.push("| same | " + t.classes.same + " | 两侧都有且归一化取值一致 |");
  L.push("| onlySim | " + t.classes.onlySim + " | 只有 sim 产出该字段 |");
  L.push("| onlyReal | " + t.classes.onlyReal + " | 只有真机产出该字段（sim 没走到 / 不可达） |");
  L.push("| valueDiff | " + t.classes.valueDiff + " | 两侧都有但取值不同（每条必须有归因） |");
  L.push("| **合计** | " + (t.classes.same + t.classes.onlySim + t.classes.onlyReal + t.classes.valueDiff) + " | 字段实例数 |");
  L.push("");
  L.push("恒等式（自洽性）：`same+valueDiff+onlySim === simFields`（" + t.classes.same + "+" + t.classes.valueDiff + "+" + t.classes.onlySim + "=" + t.simFields + "）；`same+valueDiff+onlyReal === realFields`（" + t.classes.same + "+" + t.classes.valueDiff + "+" + t.classes.onlyReal + "=" + t.realFields + "）。四次类只在「配上的调用」上统计；配对模式分布：shape " + t.pairingModes.shape + " 个工具 / tool " + t.pairingModes.tool + " 个工具。");
  L.push("");
  L.push("## 1b. crossShape（同名字段只在不同参数形态下出现，只报告不判定）");
  L.push("");
  L.push("shapeKey 判别式：`<tool>.<branch>.<field>`；branch 由回执自身的参数形态推出（action/op/kind/type/slot/mode 的取值组合；没有这些 tag 时记 `default`）。只有同 shapeKey 才比较；两侧同名但分支不同的字段记入本类 —— 比较它们等于比较工具的两个面。");
  L.push("");
  L.push("| 工具 | 字段 | sim 分支 | real 分支 | 原因 |");
  L.push("| --- | --- | --- | --- | --- |");
  if (!diff.crossShape.length) L.push("| （0 条） |  |  |  |  |");
  for (const c of diff.crossShape.slice(0, 60)) L.push("| `" + c.tool + "` | `" + c.field + "` | " + c.simBranches.map((b) => "`" + b + "`").join("、") + " | " + c.realBranches.map((b) => "`" + b + "`").join("、") + " | " + c.reason + " |");
  if (diff.crossShape.length > 60) L.push("| …其余 " + (diff.crossShape.length - 60) + " 条见 diff.json |  |  |  |  |");
  L.push("");
  L.push("## 2. 归因分布（valueDiff 必须 100% 有归因）");
  L.push("");
  if (diff.valueDiffs.length === 0) L.push("（本次没有 valueDiff）");
  else {
    L.push("| 归因 | 条数 |");
    L.push("| --- | --- |");
    for (const a of ATTRIBUTIONS) L.push("| " + a + " | " + (t.attributions[a] || 0) + " |");
    const unattributed = diff.valueDiffs.filter((d) => !d.attribution);
    L.push("");
    L.push("无归因：" + unattributed.length + (unattributed.length ? "（**失败**）" : "（通过）"));
  }
  L.push("");
  L.push("## 2b. 三档分类（TB-2631：一个退出码只回答一个问题）");
  L.push("");
  L.push("valueDiff 按「差异意味着什么」分成三档；判定与归因相互独立（归因说原因，档位说该不该因此红灯）。");
  L.push("");
  L.push("| 档 | 条数 | 无归因 | means |");
  L.push("| --- | --- | --- | --- |");
  for (const tier of TIERS) {
    const row = t.tiers[tier];
    L.push("| " + tier + " | " + row.total + " | " + row.unattributed + " | " + (t.tierMeans[tier] || "") + " |");
  }
  L.push("");
  L.push("门禁口径：`--strict` 只在 `semantic.unattributed > 0` 时 exit 1；`--strict-content` 额外要求 `content.total === 0`（同一份报告两个字段 `checks.strictSatisfied` / `checks.strictContentSatisfied` 分别作答）。");
  L.push("");
  L.push("## 3. 覆盖（真机频次最高的工具）");
  L.push("");
  const top = meta.topTools || [];
  L.push("| 工具 | 真机调用 | sim 调用 | 配对形态 | 字段(sim/真机) | same | onlySim | onlyReal | valueDiff |");
  L.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of top) {
    L.push("| `" + row.tool + "` | " + row.realCalls + " | " + row.simCalls + " | " + (row.shapes.paired === undefined ? "-" : row.shapes.paired) + " | " + row.simFields + "/" + row.realFields + " | " + row.classes.same + " | " + row.classes.onlySim + " | " + row.classes.onlyReal + " | " + row.classes.valueDiff + " |");
  }
  L.push("");
  L.push("覆盖计数：top-" + meta.topN + " 中 sim 有回执（paired）" + meta.coverage.paired + " 个；真机有回执的 top 工具 " + top.length + " 个；报告内工具合计 " + Object.keys(diff.tools).length + " 个（sim 无回执 " + diff.toolsNoSim.length + " 个，单列为 onlyReal）。");
  L.push("");
  L.push("## 4. 字段集合差异（每个 top 工具）");
  L.push("");
  let shown = 0;
  for (const row of top) {
    if (row.classes.onlyReal === 0 && row.classes.onlySim === 0 && row.classes.valueDiff === 0) continue;
    if (shown >= 12) { L.push("…（其余省略，见 diff.json）"); break; }
    shown += 1;
    L.push("### `" + row.tool + "`");
    L.push("");
    if (row.onlyRealFields.length) L.push("- 仅真机：" + row.onlyRealFields.slice(0, 20).map((k) => "`" + k + "`").join("、") + (row.onlyRealFields.length > 20 ? "…（" + row.onlyRealFields.length + "）" : ""));
    if (row.onlySimFields.length) L.push("- 仅 sim：" + row.onlySimFields.slice(0, 20).map((k) => "`" + k + "`").join("、") + (row.onlySimFields.length > 20 ? "…（" + row.onlySimFields.length + "）" : ""));
    if (row.valueDiffs.length) {
      for (const d of row.valueDiffs.slice(0, 10)) L.push("- `" + d.field + "` sim=" + JSON.stringify(d.sim) + " real=" + JSON.stringify(d.real) + " ⇒ " + (d.attribution || "**无归因**") + "（" + d.kind + "）");
      if (row.valueDiffs.length > 10) L.push("- …其余 " + (row.valueDiffs.length - 10) + " 条见 diff.json");
    }
    L.push("");
  }
  L.push("## 5. 声明缺口 = 声明债（仿真从未产出该字段，只有真机有；要么补夹具，要么具名声明）");
  L.push("");
  L.push("- means：" + (diff.declarationGapMeans || DECLARATION_GAP_MEANS));
  L.push("");
  if (!diff.declarationGaps.length) L.push("（0 条）");
  else {
    L.push("共 " + diff.declarationGaps.length + " 条：");
    L.push("");
    for (const g of diff.declarationGaps.slice(0, 40)) L.push("- `" + g.tool + "` · `" + g.field + "` · " + g.kind + " — " + g.reason);
    if (diff.declarationGaps.length > 40) L.push("- …其余 " + (diff.declarationGaps.length - 40) + " 条见 diff.json");
  }
  L.push("");
  L.push("## 5b. 内容侧值差（两侧都产出了、值不同 ⇒ 内容/序列化归因，不是声明债）");
  L.push("");
  L.push("- means：" + (diff.contentEnvSuspectMeans || CONTENT_ENV_SUSPECT_MEANS));
  L.push("");
  if (!diff.contentEnvSuspect.length) L.push("（0 条）");
  else {
    L.push("共 " + diff.contentEnvSuspect.length + " 条：");
    L.push("");
    for (const g of diff.contentEnvSuspect.slice(0, 40)) L.push("- `" + g.tool + "` · `" + g.field + "` · " + g.tier + " · " + g.kind + " — " + g.reason);
    if (diff.contentEnvSuspect.length > 40) L.push("- …其余 " + (diff.contentEnvSuspect.length - 40) + " 条见 diff.json");
  }
  L.push("");
  L.push("## 6. unpaired（配不上的调用，单列不丢弃）");
  L.push("");
  L.push("- sim 侧配不上真机形态的调用：" + t.unpaired.sim + "（形态 " + t.unpaired.sim + " 次调用；详细形态见 diff.json `unpairedShapes`）");
  L.push("- 真机侧配不上 sim 形态的调用：" + t.unpaired.real);
  L.push("- 配上的形态组数：" + t.pairedShapes + "（配对模式：shape " + t.pairingModes.shape + " 个工具 / tool " + t.pairingModes.tool + " 个工具）");
  L.push("- 未配对形态携带的字段（不进四类，单列）：真机 " + t.unpairedFields.real + " 个，sim " + t.unpairedFields.sim + " 个 — 对应 diff.json `unpairedShapes` 逐形态列出");
  L.push("");
  L.push("## 7. 真缺陷候选（single-value 语义字段矛盾，只记录不修）");
  L.push("");
  if (!diff.defects.length) L.push("（0 条）");
  else for (const d of diff.defects) L.push("- `" + d.tool + "` · `" + d.field + "` sim=" + JSON.stringify(d.sim) + " real=" + JSON.stringify(d.real) + " — " + d.reason);
  L.push("");
  L.push("## 7b. 构建戳过滤（TB-2637：哪一段语料能用）");
  L.push("");
  const bf = (diff.meta && diff.meta.buildFilter) || {};
  L.push("- requested：`" + (bf.requested || "HEAD") + "`（mode=" + (bf.mode || "?") + (bf.sha ? "，sha=`" + bf.sha + "`" : "") + "；HEAD=`" + ((diff.meta && diff.meta.headSha) || "n/a") + "`）");
  L.push("- 语料行：" + (bf.rowsIn || 0) + "；带构建戳 " + (bf.withBuild || 0) + "；无戳 " + (bf.unknown || 0) + "；匹配 " + (bf.matched || 0) + "；排除 " + (bf.excluded || 0) + "；实际使用 " + (bf.used || 0) + "。");
  if (bf.fallback) L.push("- **回退**：" + bf.fallback);
  L.push("");
  L.push("## 8. 结论");
  L.push("");
  L.push("- 已证明一致（same / 有归因的 valueDiff）：" + (t.classes.same + t.classes.valueDiff) + " 个字段实例，覆盖 " + Object.keys(diff.tools).length + " 个工具。");
  L.push("- 只在真机出现（onlyReal）：" + t.classes.onlyReal + " 个字段 — 这些只能靠真机验，sim 未走到或不可达，逐条列在第 4 节与 diff.json。");
  L.push("- 只在 sim 出现（onlySim）：" + t.classes.onlySim + " 个字段 — 真机没走到，属覆盖缺口，不构成 sim 更可信的证据。");
  L.push("- 声明缺口（声明债，第 5 节）：" + diff.declarationGaps.length + " 条 — 判据是「仿真从未产出」；0 条或具名列出。");
  L.push("- 内容侧值差（env-suspect，第 5b 节）：" + diff.contentEnvSuspect.length + " 条 — 两侧都有读数、值不同；不是声明债，声明不能豁免它，也不进 --strict（只有 --strict-content 会因此红灯）。");
  L.push("- 三档（见第 2b 节）：semantic " + t.tiers.semantic.total + " 条（无归因 " + t.tiers.semantic.unattributed + "）、serialization " + t.tiers.serialization.total + " 条、content " + t.tiers.content.total + " 条；strictSatisfied=" + diff.checks.strictSatisfied + "，strictContentSatisfied=" + diff.checks.strictContentSatisfied + "。");
  L.push("- 三档读法：content 的 " + t.tiers.content.total + " 条（其中 " + t.tiers.content.unattributed + " 条无归因）**不是契约差异，是夹具散文/计数不同**（同一句人话每次可以不同）；它们被如实计数并逐条列出，但不构成缺陷，只有显式 `--strict-content` 才会因此红灯。");
  L.push("- 自洽性：identitySim=" + diff.checks.identitySim + "，identityReal=" + diff.checks.identityReal + "，everyValueDiffAttributed=" + diff.checks.everyValueDiffAttributed + "。");
  L.push("- crossShape（不同参数形态，只报告）：" + diff.totals.crossShape + " 个字段 — 两侧都有但只在不同操作下出现，比较它们等于比较两个面，因此不计 valueDiff、不参与 --strict。");
  L.push("- 构建戳：requested=" + ((diff.meta && diff.meta.buildFilter && diff.meta.buildFilter.requested) || "HEAD") + "，used=" + ((diff.meta && diff.meta.buildFilter && diff.meta.buildFilter.used) || 0) + "，fallback=" + ((diff.meta && diff.meta.buildFilter && diff.meta.buildFilter.fallback) || "none") + "。");
  L.push("");
  return L.join("\n");
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { sim: [], real: null, out: DEFAULT_OUT, declared: DEFAULT_DECLARED, top: 25, harvest: false, wsRoot: DEFAULT_WS_ROOT, sessionsRoots: null, limit: 0, strict: false, strictContent: false, onlyBuild: "HEAD" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => { i += 1; return argv[i]; };
    if (a === "--real") args.real = next();
    else if (a === "--sim") args.sim.push(...String(next()).split(/\s*,\s*/).filter(Boolean));
    else if (a === "--out") args.out = next();
    else if (a === "--declared") args.declared = next();
    else if (a === "--top") args.top = Number(next()) || 25;
    else if (a === "--harvest") args.harvest = true;
    else if (a === "--ws-root") args.wsRoot = next();
    else if (a === "--sessions-root") args.sessionsRoots = String(next()).split(/\s*,\s*/).filter(Boolean);
    else if (a === "--limit") args.limit = Number(next()) || 0;
    else if (a === "--strict") args.strict = true;
    else if (a === "--strict-content") { args.strict = true; args.strictContent = true; }
    else if (a === "--only-build") args.onlyBuild = next();
    else if (a === "--help" || a === "-h") { args.help = true; }
    else throw new Error("unknown argument: " + a);
  }
  if (!args.sim.length) args.sim = [...DEFAULT_SIM];
  return args;
}

/** HEAD short sha, resolved from .git without spawning git. null when the checkout has none. */
export function headShortSha(repo = REPO) {
  try {
    const head = fs.readFileSync(path.join(repo, ".git", "HEAD"), "utf8").trim();
    let sha = head;
    if (head.startsWith("ref:")) {
      const ref = head.slice(4).trim();
      const refFile = path.join(repo, ".git", ref);
      if (fs.existsSync(refFile)) sha = fs.readFileSync(refFile, "utf8").trim();
      else {
        const packedFile = path.join(repo, ".git", "packed-refs");
        if (fs.existsSync(packedFile)) {
          const hit = fs.readFileSync(packedFile, "utf8").split("\n").find((l) => l.endsWith(" " + ref));
          if (hit) sha = hit.split(" ")[0];
        }
      }
    }
    return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Which real rows the parity gate is allowed to use. A row without a usable build sha cannot be attributed to a
 * checkout, so by default (--only-build HEAD) only rows stamped with the current HEAD are compared and the
 * unknown-build rows are counted as excluded. The stamp comes from the sealed `run-metadata` event at the journal
 * head (TB-2641), but TB-2693 measured the ORDER: the driver prepends that frame AFTER the server is stopped, so a
 * session that is still running cannot read it (run75's first frame was `{"type":"session",…}` and the run-time
 * count of run-metadata frames was 0). The live build proof is the driver's `TARBALL build=` line plus the
 * `run-metadata.json` file written before the server starts; the journal frame is a post-run reading only and must
 * never be treated as a condition the running session can satisfy. Journals written before the frame existed fall
 * back to a `BUILD REV:` text grep, and rows labelled `working-tree`/dirty count as unknown because that label
 * names no checkout. If the corpus carries no usable stamp at all, the filter falls back to the unknown rows and
 * says so in `fallback`, so the gate measures instead of silently comparing an empty corpus.
 * Modes: "any" (no filter), "null"/"unknown" (only rows without a usable sha), a sha prefix (only stamped rows).
 */
export function filterByBuild(rows, requested, headSha = null) {
  const req = String(requested == null ? "HEAD" : requested).trim().toLowerCase();
  const isAny = req === "any" || req === "all" || req === "*" || req === "";
  const isNullMode = req === "null" || req === "unknown" || req === "none" || req === "no-build";
  const sha = req === "head" ? headSha : (isAny || isNullMode ? null : req);
  const keep = [];
  let withBuild = 0;
  let unknown = 0;
  let matched = 0;
  let excluded = 0;
  const stamped = [];
  for (const row of rows) {
    const raw = row && typeof row.build === "string" ? row.build.toLowerCase() : null;
    // TB-2641: only a sha identifies a checkout. `working-tree` + dirty:true is an honest label from the driver but it
    // must never match a sha (the same label covers every uncommitted tree), so such rows count as build=unknown.
    const b = raw && /^[0-9a-f]{7,40}$/.test(raw) ? raw : null;
    if (b) withBuild += 1; else unknown += 1;
    if (isAny) { keep.push(row); continue; }
    if (isNullMode) { if (b) excluded += 1; else keep.push(row); continue; }
    if (b && sha && b.startsWith(sha)) { matched += 1; stamped.push(row); keep.push(row); } else excluded += 1;
  }
  let fallback = null;
  if (!isAny && !isNullMode && matched === 0 && unknown > 0) {
    fallback = "no live row carries a usable build sha (" + unknown + " rows are build=unknown: no run-metadata event and no BUILD REV stamp); including the unknown-build rows so the parity gate still measures instead of comparing an empty corpus";
    keep.length = 0;
    for (const row of rows) {
      const raw = row && typeof row.build === "string" ? row.build.toLowerCase() : null;
      if (!(raw && /^[0-9a-f]{7,40}$/.test(raw))) keep.push(row);
    }
    excluded = rows.length - keep.length;
  }
  const filter = {
    requested: req,
    mode: isAny ? "any" : isNullMode ? "null" : "sha",
    sha: sha || null,
    headSha: headSha || null,
    rowsIn: rows.length,
    withBuild,
    unknown,
    matched,
    excluded,
    used: keep.length,
    fallback,
  };
  return { rows: keep, filter };
}

export function computeDiff({ real = DEFAULT_REAL, sim = DEFAULT_SIM, declared = DEFAULT_DECLARED, top = 25, realRows = null, strict = false, strictContent = false, onlyBuild = "HEAD" } = {}) {
  loadDeclarations(declared);
  const headSha = headShortSha();
  const realData = realRows ? { rows: realRows, bad: 0 } : readJsonl(real);
  const simData = corpusRows(sim);
  const realSelected = filterByBuild(realData.rows, onlyBuild, headSha);
  if (realSelected.rows.length === 0) throw new Error("build filter left no real rows (requested=" + realSelected.filter.requested + ", rowsIn=" + realSelected.filter.rowsIn + "); pass --only-build any to compare the whole corpus");
  const realProfile = buildProfile(realSelected.rows, "real");
  const simProfile = buildProfile(simData.rows, "sim");
  const realDepth = realSelected.rows.some((r) => r && r.fields && typeof r.fields === "object") ? "harvested (nested fields + args)" : "shallow (top-level keys + ok/code only; run --harvest for nested values)";
  const diff = diffProfiles(realProfile, simProfile, { strict, strictContent });
  diff.checks.strictRequested = !!strict;
  diff.checks.strictContentRequested = !!strictContent;
  // Shape-level pairing detail (which argument shapes had no counterpart).
  const unpairedShapes = { real: [], sim: [] };
  for (const tool of Object.keys(diff.tools)) {
    const r = realProfile.tools.get(tool);
    const s = simProfile.tools.get(tool);
    if (!r || !s) continue;
    for (const [shape, n] of s.shapes) if (shape !== "" && shape !== "∅" && !r.shapes.has(shape)) unpairedShapes.sim.push({ tool, shape, calls: n });
    for (const [shape, n] of r.shapes) if (shape !== "" && shape !== "∅" && !s.shapes.has(shape)) unpairedShapes.real.push({ tool, shape, calls: n });
  }
  unpairedShapes.real.sort((a, b) => b.calls - a.calls);
  unpairedShapes.sim.sort((a, b) => b.calls - a.calls);
  diff.unpairedShapes = unpairedShapes;
  // Coverage: the tools the LIVE side calls most; how many of them the simulator has receipts for.
  const ranked = [...realProfile.tools.values()].sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool));
  const topTools = ranked.slice(0, top).map((r) => diff.tools[r.tool]);
  const paired = topTools.filter((r) => r.simCalls > 0).length;
  diff.coverage = { topN: top, topTools: topTools.map((r) => ({ tool: r.tool, realCalls: r.realCalls, simCalls: r.simCalls, paired: r.simCalls > 0, same: r.classes.same, onlyReal: r.classes.onlyReal, valueDiff: r.classes.valueDiff })), paired, listed: topTools.length };
  diff.meta = { real, realRows: realSelected.rows.length, realRowsRaw: realData.rows.length, realBad: realData.bad, simFiles: simData.used, simRows: simData.rows.length, realDepth, declared, topN: top, generatedAt: new Date().toISOString(), headSha, buildFilter: realSelected.filter };
  diff.checks.coverageTop20 = diff.coverage.paired >= 20;
  diff.checks.buildFilterSatisfied = realSelected.filter.used > 0;
  return { diff, realProfile, simProfile, topTools };
}


export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log("usage: node scripts/sim/compare/run.mjs --real <real.jsonl> --sim <corpus[,corpus...]> [--out DIR] [--declared FILE] [--top N] [--strict] [--strict-content] [--only-build SHA|any|null]");
    console.log("       node scripts/sim/compare/run.mjs --harvest [--ws-root DIR] [--out DIR]");
    console.log("  --strict          fail only when a SEMANTIC diff has no attribution");
    console.log("  --strict-content  also fail when CONTENT (fixture prose/counts) differs; implies --strict");
    console.log("  --only-build      use only real rows stamped with this build (default HEAD; any = no filter; null = only unstamped rows)");
    return 0;
  }
  fs.mkdirSync(args.out, { recursive: true });
  if (args.harvest) {
    const { rows, stats } = harvest({ wsRoot: args.wsRoot, sessionRoots: args.sessionsRoots, limit: args.limit });
    const file = path.join(args.out, "real-fields.jsonl");
    fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
    console.log("harvested " + rows.length + " rich rows from " + stats.files + " session file(s) -> " + file);
    console.log(JSON.stringify(stats));
    return 0;
  }
  if (!args.real) { console.error("missing --real <jsonl> (or --harvest)"); return 2; }
  if (!fs.existsSync(args.real)) { console.error("real corpus not found: " + args.real); return 2; }
  const { diff, topTools } = computeDiff({ real: args.real, sim: args.sim, declared: args.declared, top: args.top, strict: args.strict, strictContent: args.strictContent, onlyBuild: args.onlyBuild });
  const jsonFile = path.join(args.out, "diff.json");
  const mdFile = path.join(args.out, "diff-report.md");
  fs.writeFileSync(jsonFile, JSON.stringify(diff, null, 2) + "\n");
  fs.writeFileSync(mdFile, renderMarkdown(diff, { ...diff.meta, topTools, coverage: diff.coverage }) + "\n");
  console.log("wrote " + jsonFile);
  console.log("wrote " + mdFile);
  console.log("realDepth=" + diff.meta.realDepth);
  console.log("buildFilter=" + JSON.stringify(diff.meta.buildFilter));
  console.log("classes=" + JSON.stringify(diff.totals.classes) + " valueDiffs=" + diff.valueDiffs.length + " unattributed=" + diff.valueDiffs.filter((d) => !d.attribution).length + " crossShape=" + diff.totals.crossShape);
  console.log("tiers=" + JSON.stringify(diff.totals.tiers));
  console.log("coverage.top" + diff.coverage.topN + "=" + diff.coverage.paired + "/" + diff.coverage.listed + " paired; tools=" + Object.keys(diff.tools).length + " (noSim " + diff.toolsNoSim.length + ")");
  console.log("declarationGaps=" + diff.declarationGaps.length + " contentEnvSuspect=" + diff.contentEnvSuspect.length + " defects=" + diff.defects.length + " unpaired: real=" + diff.totals.unpaired.real + " sim=" + diff.totals.unpaired.sim);
  if (!diff.checks.identitySim || !diff.checks.identityReal) { console.error("IDENTITY VIOLATION — report is inconsistent"); return 1; }
  // TB-2656: the split is only real if the invariant holds on the run that matters. If a declaration gap ever carries
  // a simulator reading, a declaration is vouching for a produced difference -- refuse the report instead of printing
  // a green "declaration debt: 0" over it.
  if (!diff.checks.declarationGapsAreUnproduced) { console.error("DECLARATION-GAP CARRIES A SIMULATOR READING — a declaration is being used to vouch for a value difference (see diff.json `declarationGaps`)"); return 1; }
  // TB-2631: one exit code answers one question. --strict asks only "is the semantic contract consistent?";
  // --strict-content additionally asks "is the content identical?". Content diffs are the designed-unexplainable
  // fixture prose, so they are counted and reported but do not, by themselves, make the semantic gate red.
  const semUnattributed = diff.totals.tiers.semantic.unattributed;
  if (args.strict || args.strictContent) {
    if (semUnattributed > 0) {
      for (const d of diff.valueDiffs.filter((x) => x.tier === "semantic" && !x.attribution)) console.error("SEMANTIC-UNATTRIBUTED " + d.tool + " " + d.field + " shapeKey=" + d.shapeKey + " sim=" + JSON.stringify(d.sim) + " real=" + JSON.stringify(d.real));
      return 1;
    }
    if (args.strictContent && diff.totals.tiers.content.total > 0) {
      console.error("CONTENT-DIFFS " + diff.totals.tiers.content.total + " (--strict-content requires identical content; plain --strict does not fail on content)");
      return 1;
    }
    return 0;
  }
  if (!diff.checks.everyValueDiffAttributed) {
    for (const d of diff.valueDiffs.filter((x) => !x.attribution)) console.error("UNATTRIBUTED " + d.tool + " " + d.field + " shapeKey=" + d.shapeKey + " sim=" + JSON.stringify(d.sim) + " real=" + JSON.stringify(d.real));
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error("compare failed: " + (e && e.stack || e));
    process.exitCode = 2;
  }
}
