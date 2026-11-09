// Fidelity, measured branch by branch (TB-2653 / lead ruling (d), 2026-11-09).
//
// The old segment compared the tool-level union of live field names against the tool-level union of simulated
// field names. That compares a refusal receipt with a success receipt and then calls the difference a debt: the
// real machine produced `code/hint/message`, the simulator's call succeeded, so those names looked "missing".
// They were never comparable -- same tool, different branch.
//
// The ruler is ONE corpus (`compare/real-fields.jsonl`, the richest real harvest). Within it every receipt is
// partitioned by branch: `ok:true` first, then `ok:false` by refusal code. Fields are compared only inside a branch
// that BOTH sides actually produced. Three exits, never mixed:
//   gaps            -- same branch on both sides, a live field is absent from the simulator: the debt, FAILs.
//   branchUncovered -- the simulator never produced that (tool, branch) at all: named, counted, never a failure and
//                      never a declaration (it is "we never walked that road", not "we cannot").
//   envShaped       -- the environment (no Lean engine, no xelatex) changes the SHAPE of a field: a declared,
//                      key-narrow entry in fidelity-declared.json with kind 'env' and a note naming the seam.
import { readFileSync, existsSync } from 'node:fs'

export const RICH_PATH = process.env.VMU_RICH_REAL || 'D:/_tmp/sim/compare/real-fields.jsonl' // PORTABLE-ALLOW: dev rich-corpus default; overridable via VMU_RICH_REAL / loadRichRows(file), and a missing corpus FAILS the branch audit
export const ENV_KINDS = new Set(['env'])
export const KNOWN_KINDS = new Set(['env', 'superseded-shape', 'defensive-only', 'needs-deployment-config', 'sim-cannot'])
export const FORBIDDEN_KINDS = new Set(['value'])

/** Branch identity: success is one branch; each refusal CODE is its own branch; a code-less refusal is one branch. */
export function branchOf(ok, code) {
  if (ok === true) return 'ok:true'
  const c = code === null || code === undefined || String(code).trim() === '' ? '(no-code)' : String(code)
  return 'ok:false:' + c
}

/** Top-level field name of a dotted leaf path: `inForce.bytes` -> `inForce`, `receipt.delivery.path` -> `receipt`. */
export function topOf(path) {
  return String(path).split(/[.[]/)[0]
}

/** {tool -> Map(branch -> Set(topFields))} from rich corpus rows `{tool, ok, code, fields:{dottedPath: rendered}}`. */
export function richBranches(rows) {
  const out = new Map()
  for (const row of rows) {
    if (!row || !row.tool || !row.fields || typeof row.fields !== 'object') continue
    if (!out.has(row.tool)) out.set(row.tool, new Map())
    const branches = out.get(row.tool)
    const branch = branchOf(row.ok, row.code)
    if (!branches.has(branch)) branches.set(branch, new Set())
    for (const p of Object.keys(row.fields)) branches.get(branch).add(topOf(p))
  }
  return out
}

/** {tool -> Map(branch -> {count, fields:Set(topKeys)})} from `receipts.jsonl` rows `{tool, args, receipt}`. */
export function simBranches(receiptRows) {
  const out = new Map()
  for (const row of receiptRows) {
    const rec = row && row.receipt
    if (!row || !row.tool || !rec || typeof rec !== 'object') continue
    if (!out.has(row.tool)) out.set(row.tool, new Map())
    const branches = out.get(row.tool)
    const branch = branchOf(rec.ok, rec.code)
    if (!branches.has(branch)) branches.set(branch, { count: 0, fields: new Set() })
    const slot = branches.get(branch)
    slot.count += 1
    for (const k of Object.keys(rec)) slot.fields.add(k)
  }
  return out
}

/** Declarations that may excuse a gap: kind 'env', narrow keys, a note that names a seam. Others are policy errors. */
export function readDeclarations(declared) {
  const env = new Map()
  const policyErrors = []
  for (const [tool, row] of Object.entries(declared || {})) {
    if (tool.startsWith('_')) continue
    if (row === null || typeof row !== 'object') { policyErrors.push({ tool, why: 'declaration is not an object' }); continue }
    const kind = String(row.kind || '')
    if (FORBIDDEN_KINDS.has(kind)) { policyErrors.push({ tool, why: 'kind "' + kind + '" is forbidden: an env declaration may not excuse a VALUE difference' }); continue }
    if (!KNOWN_KINDS.has(kind)) { policyErrors.push({ tool, why: 'unknown kind "' + kind + '" (expected env / superseded-shape / defensive-only)' }); continue }
    if (kind !== 'env') continue
    const keys = Array.isArray(row.keys) ? row.keys.map(String) : null
    if (keys === null) { policyErrors.push({ tool, why: 'an env declaration must be key-scoped (keys: [...])' }); continue }
    const note = String(row.note || '')
    if (note.trim().length < 20) policyErrors.push({ tool, why: 'env declaration note is too short to name the seam' })
    env.set(tool, new Set(keys))
  }
  return { env, policyErrors }
}

/**
 * Compare per branch. `simRows` may be rows of many scenarios concatenated; counts are per (tool, branch).
 * Returns the three exits plus the housekeeping numbers the audit prints.
 */
export function assessBranches({ rich, sim, declared }) {
  const dec = readDeclarations(declared)
  const gaps = []
  const branchUncovered = []
  const envShaped = []
  const simOnlyBranches = []
  const comparedTools = new Set()
  const comparedBranches = new Set()
  for (const [tool, branches] of rich) {
    const envKeys = dec.env.get(tool) || new Set()
    const simTool = sim.get(tool) || null
    for (const [branch, richFields] of branches) {
      const simBranch = simTool === null ? null : simTool.get(branch) || null
      const sorted = [...richFields].sort()
      if (simBranch === null) {
        // Program-checked, not hand-typed: the simulator corpus really has zero receipts in this branch.
        branchUncovered.push({ tool, branch, count: 0, fields: sorted })
        continue
      }
      comparedTools.add(tool)
      comparedBranches.add(tool + '|' + branch)
      for (const field of sorted) {
        if (simBranch.fields.has(field)) continue
        const coveredByKey = [...envKeys].some((k) => k === field || k.startsWith(field + '.') || field.startsWith(k + '.'))
        if (coveredByKey) envShaped.push({ tool, branch, field })
        else gaps.push({ tool, branch, field })
      }
    }
    if (simTool !== null) {
      for (const [branch, slot] of simTool) {
        if (!branches.has(branch)) simOnlyBranches.push({ tool, branch, count: slot.count })
      }
    }
  }
  const uncompared = []
  for (const tool of sim.keys()) if (!rich.has(tool)) uncompared.push(tool)
  return {
    gaps: gaps.sort((a, b) => (a.tool + a.branch + a.field).localeCompare(b.tool + b.branch + b.field)),
    branchUncovered: branchUncovered.sort((a, b) => (a.tool + a.branch).localeCompare(b.tool + b.branch)),
    envShaped: envShaped.sort((a, b) => (a.tool + a.branch + a.field).localeCompare(b.tool + b.branch + b.field)),
    simOnlyBranches: simOnlyBranches.sort((a, b) => (a.tool + a.branch).localeCompare(b.tool + b.branch)),
    uncomparedToRich: uncompared.sort(),
    policyErrors: dec.policyErrors,
    metrics: {
      richTools: rich.size,
      comparedTools: comparedTools.size,
      comparedBranches: comparedBranches.size,
      gaps: gaps.length,
      branchUncovered: branchUncovered.length,
      branchUncoveredFields: branchUncovered.reduce((n, r) => n + r.fields.length, 0),
      envShaped: envShaped.length,
      simOnlyBranches: simOnlyBranches.length,
    },
  }
}

/** Read the rich harvest. A missing file is a FAILURE, never a silent downgrade (lead ruling (d), point 1). */
export function loadRichRows(file = RICH_PATH) {
  if (!existsSync(file)) return { ok: false, file, rows: [], why: 'the rich live-corpus file is missing: fidelity has one ruler and this is it (run scripts/sim/harvest/real.mjs)' }
  const rows = []
  for (const line of readFileSync(file, 'utf8').trim().split(/\r?\n/)) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* a torn line cannot be a ruler */ }
  }
  return rows.length ? { ok: true, file, rows, why: '' } : { ok: false, file, rows: [], why: 'the rich live-corpus file is empty: nothing to measure against' }
}
