// tests/audit-receipt-fields.mjs — ROUND 113. THE GATE I REFUSED TO SHIP LAST ROUND, SHIPPED AFTER FIXING ITS PREDICATE.
//
// WHAT IT ENFORCES. When a module's header claims a universal over receipts and names fields as `` `name[]` ``, every receipt
// site in that file must carry those fields. That is the anatomy of a real defect found in round 111: collab.js promised
// "every receipt carries `enforced[]` ... and `fired[]`" while five of its eight receipts omitted `fired`.
//
// WHY THE FIRST VERSION WAS REFUSED. It harvested EVERY backticked token from the whole header, so settings names, tool names
// and constants counted as promised fields - activity.js alone produced nine phantom fields and 17 modules were flagged. A
// scanner is worth exactly as much as the decidability of its predicate, so it was deleted rather than shipped.
//
// WHAT MADE IT DECIDABLE, ALL THREE FIXES MEASURED:
//   * fields come ONLY from the SENTENCE stating the universal, not the whole header;
//   * only the `` `name[]` `` shape counts as a promised field, so a setting or a tool name cannot enter the set;
//   * a receipt counts as carrying a field when it has `field:` OR the SHORTHAND `field` - three receipts in collab.js were
//     reported missing `enforced` purely because they used the shorthand, which is the false positive that would have made
//     this gate noise again.
//
// A GATE THAT CANNOT FAIL IS NOT A GATE: --selftest plants exactly the collab shape and requires it to be caught.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const KERNEL = join(ROOT, "vibe-math-vmu", "kernel")

const UNIVERSAL = /every\s+(receipt|refusal)|EVERY\s+(RECEIPT|REFUSAL)|\u6bcf(\u4e2a|\u5f20)?\u56de\u6267|\u6bcf(\u4e2a|\u6761)?\u62d2\u7edd/i

/** The leading `//` comment block, where a module states its own contract. */
export function headerOf(src) {
  const out = []
  for (const l of src.split("\n")) { if (/^\s*\/\//.test(l)) out.push(l); else if (out.length && l.trim() !== "") break }
  return out
}

/** Fields promised by a sentence that claims a universal over receipts - ONLY the `name[]` shape. */
export function promisedFields(lines) {
  const set = new Set()
  for (const line of lines) {
    if (!UNIVERSAL.test(line)) continue
    for (const m of line.matchAll(/`([a-zA-Z][a-zA-Z0-9_]*)\[\]`/g)) set.add(m[1])
  }
  return [...set]
}

/** Does this receipt window carry the field as a key (`f:`) or as SHORTHAND (`f` alone)? */
export function carries(window, field) {
  return new RegExp("(^|[^a-zA-Z0-9_])" + field + "\\s*[:,}]").test(window) ||
    new RegExp("(^|[^a-zA-Z0-9_])" + field + "\\s*$", "m").test(window)
}

export function findingsFor(src) {
  const lines = src.split("\n")
  const fields = promisedFields(headerOf(src))
  if (!fields.length) return []
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (!(/return \{ ok:/.test(lines[i]) || /return Object\.assign\(refuse\(/.test(lines[i]) || /return refuse\(/.test(lines[i]))) continue
    const win = lines.slice(i, Math.min(i + 6, lines.length)).join("\n")
    for (const f of fields) if (!carries(win, f)) out.push({ line: i + 1, field: f })
  }
  return out
}

if (process.argv.includes("--selftest")) {
  // the collab shape: two receipts, the second missing the promised `fired[]`
  const planted = [
    "// every receipt carries `enforced[]` and `fired[]`, and fired names what changed",
    "export function f() { return { ok: true, enforced: [], fired: [] } }",
    "export function g() { return { ok: true, enforced: [] } }",
  ].join("\n")
  const shorthand = [
    "// every receipt carries `enforced[]`",
    "export function f() { const enforced = []; return { ok: true, enforced } }",
  ].join("\n")
  const notUniversal = "// receipts sometimes carry `fired[]`\nexport function f() { return { ok: true } }"
  const checks = [
    [findingsFor(planted).some((f) => f.field === "fired"), "\u2605 a receipt missing a promised field IS caught (the collab.js shape)"],
    [findingsFor(planted).length === 1, "and exactly that one is reported - the receipt that delivers both is not"],
    [findingsFor(shorthand).length === 0, "\u2605 a SHORTHAND `enforced` counts as carrying it (the false positive that made the first version noise)"],
    [findingsFor(notUniversal).length === 0, "and a header that does not claim a universal is left alone"],
  ]
  let failed = 0
  for (const [cond, label] of checks) { if (cond) console.log("  ok   " + label); else { failed += 1; console.error("  FAIL " + label) } }
  console.log("")
  console.log("=== RECEIPT FIELDS SELFTEST: " + (checks.length - failed) + " passed, " + failed + " failed ===")
  process.exit(failed === 0 ? 0 : 1)
}

const files = []
const walk = (d) => { for (const e of readdirSync(d)) { if (e === "node_modules") continue; const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p) } }
walk(KERNEL)
let withPromise = 0
const findings = []
for (const f of files) {
  const src = readFileSync(f, "utf8")
  if (promisedFields(headerOf(src)).length) withPromise += 1
  for (const x of findingsFor(src)) findings.push({ file: f.replace(/\\/g, "/").split("/kernel/").pop(), ...x })
}
console.log("=== RECEIPT FIELDS: " + files.length + " kernel modules, " + withPromise + " state a universal over receipts ===")
for (const f of findings) console.log("  MISSING  " + f.file + ":" + f.line + "  every receipt must carry `" + f.field + "`, this one does not")
console.log("=== RECEIPT FIELDS: " + (findings.length === 0 ? "every receipt carries the fields its header promises" : findings.length + " receipt(s) missing a promised field") + " ===")
process.exit(findings.length === 0 ? 0 : 1)
