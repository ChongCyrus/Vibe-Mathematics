// tests/audit-silent-keys.mjs — ROUND 98 (corrected). "A DECLARATION WITH NO CONSUMER IS THE SILENT LIE THIS PROJECT
// REFUSES" — enforced as a reading, not as prose.
//
// WHAT THIS GATE IS, AND WHAT IT DELIBERATELY IS NOT. It answers one decidable question: is every settings key the schema
// declares either (a) mentioned by some source, including through the prompt-variable form, or (b) accounted for by the
// project's own inert-key ledger, whose per-key verdicts are the sanctioned home for "declared, not wired, and here is
// what we decided". Measured: exactly ONE unmentioned key, `vmu.core.storeBackend`, already ruled WIRE in
// docs/acceptance/phase3-inert-keys-ledger.md - two independent accountings agreeing.
//
// IT DOES NOT CHECK ORPHAN EXPORTS, AND THAT DECISION IS A CORRECTION. Round 97 claimed "0 orphan exports in the
// framework" as a second red-line reading; that number was vacuous - the filter tested for "/vibe-math-vmu/" with forward
// slashes while Windows paths use backslashes, so it matched nothing and found nothing. The real number is ~300, and it is
// NOT a defect: this package's exports ARE its public API (package.json#exports, the DSH host importing the entry), so
// "no in-repo consumer" is the normal condition for them. The red line applies where a dead field is invisible - settings
// keys and pack fields - not to an interface whose consumers live outside the repository.
//
// A GATE THAT CANNOT FAIL IS NOT A GATE: `--selftest` plants a silent key and a ledgered one and a prompt-variable-read
// one, and requires the gate to tell all three apart.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const VMU = join(REPO, "vibe-math-vmu")
const LEDGER = join(REPO, "docs", "acceptance", "phase3-inert-keys-ledger.md")

/** Every `.js` under a directory. No swallowing: a directory that cannot be walked is an error, not an empty list. */
export function jsFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      if (e === "node_modules" || e === ".git") continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      // ★ BOTH extensions: the tests are *.test.mjs, and a .js-only walk silently skipped every one of them - which
      // is how 	oJsonSchema, read only from a test, looked orphaned in an earlier version of this scan.
      else if (p.endsWith(".js") || p.endsWith(".mjs")) out.push(p)
    }
  }
  walk(dir)
  return out
}

/**
 * Declared keys that no source mentions and no ledger accounts for.
 * ★ THE READ TEST CANNOT REQUIRE QUOTES: a key reaches the prompt as `{{ setting:vmu.turn.leaderId }}`, an unquoted
 * substring, and a quoted-only predicate reported eleven LIVE keys as unread.
 */
export function silentKeys({ schemaSrc, sources, ledgerText, schemaPath }) {
  const declared = [...String(schemaSrc).matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1])
  const out = []
  for (const key of declared) {
    let seen = false
    for (const [f, src] of sources) {
      if (f === schemaPath || f.endsWith("planned.js")) continue
      if (src.includes(key)) { seen = true; break }
    }
    if (seen) continue
    if (String(ledgerText || "").includes(key)) continue
    out.push(key)
  }
  return out
}

if (process.argv.includes("--selftest")) {
  const src = new Map([
    ["/s/schema.js", "export const S = [\n { key: 'vmu.prompt.read' },\n { key: 'vmu.ledgered.one' },\n { key: 'vmu.silent.one' },\n]\n"],
    ["/s/reader.js", "const v = '{{ setting:vmu.prompt.read }}'\n"],
  ])
  const got = silentKeys({ schemaSrc: src.get("/s/schema.js"), sources: src, ledgerText: "vmu.ledgered.one  WIRE", schemaPath: "/s/schema.js" })
  const checks = [
    [got.includes("vmu.silent.one"), "★ a declared key nothing mentions and no ledger rules on is caught"],
    [got.includes("vmu.prompt.read") === false, "★ a key read ONLY through a prompt variable counts as read (a quoted-only scan missed eleven such keys)"],
    [got.includes("vmu.ledgered.one") === false, "★ a key the inert-key ledger rules on is accounted for, not silent"],
    [got.length === 1, "and exactly the one silent key is reported"],
  ]
  let bad = 0
  for (const [cond, label] of checks) { if (cond) console.log("  ok   " + label); else { bad += 1; console.error("  FAIL " + label) } }
  console.log("")
  console.log("=== SILENT KEYS SELFTEST: " + (checks.length - bad) + " passed, " + bad + " failed ===")
  process.exit(bad === 0 ? 0 : 1)
}

const sources = new Map()
for (const f of jsFiles(VMU)) sources.set(f, readFileSync(f, "utf8"))
for (const dir of ["tests", "scripts"]) {
  const p = join(REPO, dir)
  if (!existsSync(p)) throw new Error("expected directory is missing: " + dir + " - a scan that silently skips it would report keys as unread that a test reads")
  for (const f of jsFiles(p)) sources.set(f, readFileSync(f, "utf8"))
}
const schemaPath = join(VMU, "settings", "schema.js")
const ledgerText = existsSync(LEDGER) ? readFileSync(LEDGER, "utf8") : ""
const keys = silentKeys({ schemaSrc: sources.get(schemaPath) || "", sources, ledgerText, schemaPath })
for (const k of keys) console.log("  SILENT-KEY  " + k)
console.log("=== SILENT KEYS: " + sources.size + " files scanned, " + keys.length + " declared key(s) neither read nor ruled ===")
process.exit(keys.length === 0 ? 0 : 1)

