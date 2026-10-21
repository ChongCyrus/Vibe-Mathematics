// tests/audit-face-actions.mjs — ROUND 96. EVERY TOOL FACE'S OFFERED ACTIONS MUST BE ACTIONS THAT EXIST.
//
// WHY THIS GATE EXISTS. A real defect of exactly this class was measured on a real machine: the capacity face offered a
// `retire` action whose branch called `capacity.retire`, a method the service did not have, so the model was offered an
// action that could only ever fail. The call-side twin is already gated (`audit-service-calls.mjs`: every
// `kernel.<service>.<method>(` must resolve); this is the FACE side - the enum the model reads must not promise what the
// implementation cannot do.
//
// THE CHECK IS CLASSIFIED, BECAUSE ONE PREDICATE CANNOT COVER BOTH SHAPES - and getting that wrong is how the first three
// versions of this audit produced 25 findings, every one of them false:
//   * GENERIC-DISPATCH faces do `svc[action](...)` (or read their payload through `...rest`). For them the meaningful
//     question is "is every offered action a method of a service this file addresses?" - asking for an `action === 'x'`
//     branch is meaningless, which is what flagged `fidelity`, `mathadapters`, `mathjobs` and `activity` wrongly.
//   * EXPLICIT-BRANCH faces switch on the action. For them the question is "does every offered action have a branch, a
//     default, or a guard?" - `activity.js` implements `wait` as its DEFAULT, so a branch-only regex missed it.
// The service set for the generic check is the UNION of every `kernel.<name>` the file mentions, because picking one
// name is what made an earlier version compare against the WRONG service.
//
// A GATE THAT CANNOT FAIL IS NOT A GATE, so `--selftest` plants both defects and requires the checker to catch both.
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..")
const VMU = join(REPO, "vibe-math-vmu")

/** Does this face dispatch generically rather than switching on the action? */
export function isGenericDispatch(src) {
  // ★ any `something[action](` form, not just a variable literally named `svc` - the capacity face uses `capacity[action]`,
  // and a check that only knew one variable name reported nine false positives on it.
  // The subscript is not always CALLED immediately: `capacity` reads `typeof capacity[action] === "function"` and
  // calls the result through a local, so requiring a following `(` missed nine genuine generic dispatches and reported
  // them as defects. Any subscript by the action counts as a generic dispatch.
  return /[A-Za-z_$][\w$]*\[action\]/.test(src) || /\.\.\.rest/.test(src)
}

/** The methods of every service a file mentions as `kernel.<name>`, UNIONed so the wrong-name mistake cannot recur. */
export function mentionedServices(src, kernel) {
  const out = new Map()
  for (const m of src.matchAll(/\bkernel\.([A-Za-z][A-Za-z0-9_]*)/g)) {
    const svc = kernel[m[1]]
    if (svc && typeof svc === "object") {
      const methods = Object.keys(svc).filter((k) => typeof svc[k] === "function")
      if (methods.length) out.set(m[1], new Set(methods))
    }
  }
  return out
}

/** The actions an explicit-branch face handles: `=== 'x'`, `'x' === action`, `!== 'x'`, and the declared default. */
export function handledActions(src) {
  const set = new Set()
  for (const m of src.matchAll(/action\s*===\s*'([A-Za-z0-9_-]+)'/g)) set.add(m[1])
  for (const m of src.matchAll(/'([A-Za-z0-9_-]+)'\s*===\s*action/g)) set.add(m[1])
  for (const m of src.matchAll(/action\s*!==\s*'([A-Za-z0-9_-]+)'/g)) set.add(m[1])
  const d = /action\s*=\s*'([A-Za-z0-9_-]+)'/.exec(src)
  if (d) set.add(d[1])
  return set
}

/** Pure core, so the sensitivity proof can drive it with planted sources instead of real files. */
export function findingsFor({ face, src, enumVals, kernel }) {
  const out = []
  if (!Array.isArray(enumVals)) return out
  if (isGenericDispatch(src)) {
    const services = mentionedServices(src, kernel)
    const covered = new Set()
    for (const methods of services.values()) for (const m of methods) covered.add(m)
    if (services.size === 0) {
      out.push({ face, kind: "no-service", detail: "dispatches generically but mentions no kernel service this kernel exposes, so nothing proves the offered actions exist" })
      return out
    }
    for (const v of enumVals) if (!covered.has(v)) out.push({ face, kind: "offered-not-implemented", detail: "'" + v + "' is offered but no service this face mentions has it" })
  } else {
    const handled = handledActions(src)
    for (const v of enumVals) if (!handled.has(v)) out.push({ face, kind: "offered-no-branch", detail: "'" + v + "' is offered but has no branch, default or guard" })
  }
  return out
}

if (process.argv.includes("--selftest")) {
  const fakeKernel = { alpha: { go: () => 0, stop: () => 0 } }
  const genericBad = findingsFor({ face: "g", src: "const svc = kernel.alpha\nsvc[action]({})", enumVals: ["go", "nope"], kernel: fakeKernel })
  const genericGood = findingsFor({ face: "g2", src: "const svc = kernel.alpha\nsvc[action]({})", enumVals: ["go"], kernel: fakeKernel })
  const explicitBad = findingsFor({ face: "e", src: "if (action === 'go') return 1", enumVals: ["go", "nope"], kernel: fakeKernel })
  const explicitGood = findingsFor({ face: "e2", src: "run: async ({ action = 'go' } = {}) => { if (action !== 'go') throw 1 }", enumVals: ["go"], kernel: fakeKernel })
  const restGood = findingsFor({ face: "r", src: "const svc = kernel.alpha\nrun: async ({ action, ...rest }) => svc[action](rest)", enumVals: ["go", "stop"], kernel: fakeKernel })
  const noService = findingsFor({ face: "n", src: "svc[action]({})", enumVals: ["go"], kernel: fakeKernel })
  const checks = [
    [genericBad.some((f) => f.kind === "offered-not-implemented"), "★ a generic face offering an action its service lacks is caught (the capacity.retire class)"],
    [genericGood.length === 0, "and a generic face whose actions all exist is not reported"],
    [explicitBad.some((f) => f.kind === "offered-no-branch"), "★ an explicit-branch face offering an action with no branch is caught"],
    [explicitGood.length === 0, "★ and a DEFAULT action counts as implemented - `wait` was a false positive until the default was read"],
    [restGood.length === 0, "and a `...rest` face is classified generic, not as 'declares but does not read'"],
    [noService.some((f) => f.kind === "no-service"), "a generic face that mentions no known service is refused rather than passed"],
  ]
  let bad = 0
  for (const [cond, label] of checks) { if (cond) console.log("  ok   " + label); else { bad += 1; console.error("  FAIL " + label) } }
  console.log("")
  console.log("=== FACE ACTION AUDIT SELFTEST: " + (checks.length - bad) + " passed, " + bad + " failed ===")
  process.exit(bad === 0 ? 0 : 1)
}

const { createKernel } = await import("file:///" + VMU.replace(/\\/g, "/").replace(/ /g, "%20") + "/kernel/index.js")
const { toolSpecs } = await import("file:///" + VMU.replace(/\\/g, "/").replace(/ /g, "%20") + "/host.js")
const kernel = createKernel({ clock: () => 0, settings: {}, root: VMU, host: null, slots: [{ id: "member", capacity: 0, permissions: ["speak", "vote"] }] })
const specs = toolSpecs({ kernel, settings: { "vmu.tools.faces": ["*"], "vmu.tools.allowAll": true }, instance: "audit" })
const sources = new Map()
for (const f of readdirSync(join(VMU, "tools"))) if (f.endsWith(".js")) sources.set(f, readFileSync(join(VMU, "tools", f), "utf8"))

const findings = []
let checked = 0
let genericCount = 0
for (const spec of specs) {
  const file = spec.face ? spec.face + ".js" : null
  if (!file || !sources.has(file)) continue
  const src = sources.get(file)
  const enumVals = Array.isArray((spec.parameters || {}).action && (spec.parameters || {}).action.enum)
    ? spec.parameters.action.enum.map(String) : null
  if (!enumVals) continue
  checked += 1
  if (isGenericDispatch(src)) genericCount += 1
  findings.push(...findingsFor({ face: spec.face, src, enumVals, kernel }))
}

console.log("=== FACE ACTIONS: " + specs.length + " faces registered, " + checked + " with an action enum (" + genericCount + " generic-dispatch) ===")
for (const f of findings) console.log("  " + f.kind.toUpperCase() + "  " + f.face + "  " + f.detail)
console.log("=== FACE ACTIONS: " + (findings.length === 0 ? "every offered action exists or has a branch" : findings.length + " findings") + " ===")
process.exit(findings.length === 0 ? 0 : 1)

