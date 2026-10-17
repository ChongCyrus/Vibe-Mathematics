// tests/audit-service-calls.mjs — ROUND 85. A TREE-WIDE CROSS-CHECK, shipped as a gate.
//
// WHY IT EXISTS. A real machine produced `capacity.retire is not a function`: a tool face called a method its service does
// not have. Nothing in the test suite could see it, because the call was valid JavaScript and no test drove that branch.
// The class is decidable WITHOUT reading function bodies - enumerate the services a built kernel actually exposes, then
// check every `kernel.<service>.<method>(` call site against them - so it is decided here, for the whole tree, on every
// run.
//
// IT IS CALIBRATED, AND THE CALIBRATION IS PART OF THE DESIGN. The first version of this scan reported 139 "dangling"
// calls and nearly all were false: local Maps that happen to share a service's name (`alerts.get`, `tasks.set`,
// `registry.values`), the FILENAME `bus.js` inside a comment read as `bus.js()`, namespace prefixes (`vmu.middleware.`)
// and action ids (`vmu.math.optim`) mistaken for settings keys. Two consequences are therefore built in:
//   * only the unambiguous `kernel.<service>.<method>(` form is matched, never a bare `service.method(`;
//   * the service list comes from a FULLY CONFIGURED kernel built three ways, because a minimal kernel does not construct
//     `members`, `library`, `store` or `work` at all - and absent services would make every call to them read as dangling.
//
// A GATE THAT CANNOT FAIL IS NOT A GATE, so `--selftest` plants one dangling call and one clean one and requires the
// scanner to tell them apart.
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const VMU = join(REPO, "vibe-math-vmu")

/** The method sets of every service a kernel exposes. Built three ways: a minimal kernel does NOT construct them all. */
export function servicesOf(createKernel) {
  const variants = [
    { clock: () => 0, settings: {} },
    { clock: () => 0, settings: {}, slots: [{ id: "member", capacity: 0, permissions: ["speak", "vote"] }, { id: "chair", capacity: 1, permissions: ["convene"] }] },
    { clock: () => 0, settings: {}, root: VMU, host: null, slots: [{ id: "member", capacity: 0, permissions: ["speak", "vote"] }] },
  ]
  const out = new Map()
  for (const opts of variants) {
    let k = null
    try { k = createKernel(opts) } catch { continue }
    for (const key of Object.keys(k)) {
      const svc = k[key]
      if (svc && typeof svc === "object") {
        const methods = Object.keys(svc).filter((m) => typeof svc[m] === "function")
        if (methods.length) {
          const set = out.get(key) || new Set()
          for (const m of methods) set.add(m)
          out.set(key, set)
        }
      }
    }
  }
  return out
}

/** Is the character at `at` inside a string literal? Needed because a FIXTURE quotes the very code this scan looks for. */
function insideString(line, at) {
  let single = false
  let double = false
  for (let i = 0; i < at && i < line.length; i++) {
    const c = line[i]
    if (c === "\\") { i += 1; continue }
    if (!double && c === "'") single = !single
    else if (!single && c === '"') double = !double
  }
  return single || double
}

/**
 * Scan ONE source text. Pure, so the sensitivity proof can drive it with a planted defect instead of a real file.
 * Returns findings; an empty array means "nothing in this text exhibits the classes".
 *
 * ★ QUOTED CODE IS NOT CODE. `scripts/generate-wired-schema.mjs` keeps a synthetic fixture in which the text
 * `sget('vmu.fake.commentKey')` appears INSIDE a string literal, because that generator's whole self-probe is about
 * telling comment-borne and quoted pseudo-keys from real ones. Reporting the fixture would be reporting the test, not
 * the tree - so a match that sits inside a string literal is skipped, for both classes.
 */
export function scanText(text, rel, services, knownKeys) {
  const findings = []
  const lines = String(text).split("\n")
  lines.forEach((l, i) => {
    const n = i + 1
    if (/^\s*(\/\/|\*)/.test(l)) return
    for (const m of l.matchAll(/\bkernel\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (insideString(l, m.index)) continue
      const svc = m[1]; const meth = m[2]
      if (!services.has(svc)) findings.push({ rel, n, kind: "unknown-service", detail: "kernel." + svc })
      else if (!services.get(svc).has(meth)) findings.push({ rel, n, kind: "missing-method", detail: "kernel." + svc + "." + meth + "()" })
    }
    // only a REAL settings read, because a `vmu.a.b` literal is just as often an action id or a namespace prefix.
    // Both quote styles are accepted: real code is written with either, and a check that only saw single quotes would
    // miss half its own subject.
    for (const m of l.matchAll(/(?:sget|settings\.get|need|setting)\(\s*['"](vmu\.[a-zA-Z0-9_.]+)['"]/g)) {
      if (insideString(l, m.index)) continue
      if (!knownKeys.has(m[1])) findings.push({ rel, n, kind: "undeclared-setting", detail: m[1] })
    }
  })
  return findings
}

function collectFiles() {
  const files = []
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".git" || e === "extensions") continue
      const p = join(dir, e)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (e.endsWith(".js") || e.endsWith(".mjs")) files.push(p)
    }
  }
  walk(VMU)
  try { walk(join(REPO, "scripts")) } catch { /* a checkout without scripts/ still scans the framework */ }
  return files
}

function declaredKeys() {
  const keys = new Set()
  for (const f of ["settings/schema.js", "settings/planned.js"]) {
    try { for (const m of readFileSync(join(VMU, f), "utf8").matchAll(/key:\s*'([^']+)'/g)) keys.add(m[1]) } catch { /* absent file leaves the set smaller, which only widens the check */ }
  }
  return keys
}

// ── the sensitivity proof: the scan must tell a planted defect from clean code ────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  const fakeServices = new Map([["capacity", new Set(["list", "status"])]])
  const planted = scanText("const x = kernel.capacity.retire({})\n", "planted.js", fakeServices, new Set())
  const clean = scanText("const x = kernel.capacity.list()\n", "clean.js", fakeServices, new Set())
  const unknown = scanText("const x = kernel.nosuchservice.list()\n", "unknown.js", fakeServices, new Set())
  const badKey = scanText("const v = sget('vmu.not.declared')\n", "key.js", fakeServices, new Set())
  const okKey = scanText("const v = sget('vmu.turn.deliverMode')\n", "ok.js", fakeServices, new Set(["vmu.turn.deliverMode"]))
  const mapNamedLikeAService = scanText("const alerts = new Map()\nalerts.get('x')\nalerts.set('y', 1)\n", "map.js", fakeServices, new Set())
  const quotedFixture = scanText('const synthetic = ["const x = sget(\'vmu.fake.commentKey\')", "kernel.nosuchservice.list()"]\n', "fixture.js", fakeServices, new Set())
  const checks = [
    [planted.some((f) => f.kind === "missing-method"), "a call to a method the service does NOT have is caught"],
    [planted.length === 1, "and it is reported exactly once"],
    [clean.length === 0, "a call to a method the service DOES have is not reported"],
    [unknown.some((f) => f.kind === "unknown-service"), "a call to a service that does not exist is caught"],
    [badKey.some((f) => f.kind === "undeclared-setting"), "a settings read naming an undeclared key is caught"],
    [okKey.length === 0, "and a read of a DECLARED key is not reported"],
    [mapNamedLikeAService.length === 0, "★ a LOCAL Map that shares a service's name is not mistaken for a service call (the 139-false-positive lesson)"],
    [quotedFixture.length === 0, "★★ QUOTED code is not code: a fixture that quotes a bad call is not reported (which is what the wired-schema generator's own self-probe contains)"],
    [scanText('const synthetic = ["const x = sget(\'vmu.fake.commentKey\')"]\nconst y = sget("vmu.alsoFake")\n', "f.js", fakeServices, new Set()).length === 1,
      "★★ and the exemption is not a blanket one: a REAL read on the NEXT line is still caught"],
  ]
  let bad = 0
  for (const [cond, label] of checks) {
    if (cond) console.log("  ok   " + label)
    else { bad += 1; console.error("  FAIL " + label) }
  }
  console.log("")
  console.log("=== SERVICE-CALL AUDIT SELFTEST: " + (checks.length - bad) + " passed, " + bad + " failed ===")
  process.exit(bad === 0 ? 0 : 1)
}

const { createKernel } = await import("file:///" + VMU.replace(/\\/g, "/").replace(/ /g, "%20") + "/kernel/index.js")
const services = servicesOf(createKernel)
const known = declaredKeys()
const files = collectFiles()

const findings = []
for (const f of files) {
  const rel = f.slice(REPO.length + 1).replace(/\\/g, "/")
  findings.push(...scanText(readFileSync(f, "utf8"), rel, services, known))
}

console.log("=== SERVICE CALLS: " + files.length + " files, " + services.size + " services, " + known.size + " declared keys ===")
for (const f of findings) console.log("  " + f.kind.toUpperCase() + "  " + f.rel + ":" + f.n + "  " + f.detail)
const byKind = {}
for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1
console.log("  findings: " + (findings.length === 0 ? "none" : JSON.stringify(byKind)))
console.log("=== SERVICE CALLS: " + (findings.length === 0 ? "no dangling calls, no unknown services, no undeclared settings reads" : findings.length + " findings") + " ===")
process.exit(findings.length === 0 ? 0 : 1)
