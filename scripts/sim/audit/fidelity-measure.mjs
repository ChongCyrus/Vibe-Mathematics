// scripts/sim/audit/fidelity-measure.mjs — ONE ruler for "do the simulator's receipts carry the fields a live run
// carried?".
//
// WHY THIS FILE EXISTS (TB-2653 / AUDIT-14 R3). Two callers have to answer the same question:
//   - scripts/sim/audit/all.mjs  — to PRINT the fidelity section and decide PASS/FAIL;
//   - scripts/sim/audit/release-ready.mjs — to RECOMPUTE the numbers a report claims, because a report that says
//     "gaps: 0" while the gate only re-reads that sentence has not verified anything (red team A8: forge the block,
//     stay READY).
// When each caller had its own copy of the measurement, the two copies drifted: one of them classified a path as a
// gap the other had already absorbed, and the audit reported seven stale baseline claims against a ledger that was in
// fact current. A judge and an auditor that disagree about what "the same field set" means are not judging the same
// thing. So the measurement lives here, once, and both callers import it.
//
// WHAT IT MEASURES
//   live fields   = every dotted leaf path in the rich corpus (<sim root>/compare/real-fields.jsonl; `fields` keys are leaves)
//   sim fields    = every dotted leaf path in the scenario receipts, flattened to the same depth rule
//   a GAP         = a live path no simulated receipt carries
//   absorbed gap  = a gap the declaration ledger names for that tool, OR a gap a baseline row matches
//   compared      = live tools whose receipts at least one scenario exercised
//   gaps          = unabsorbed gaps (what all.mjs reports as `gaps:` and what the release gate re-derives)
//
// The shallow `real-fieldset.json` (top-level keys only) is NOT read here: it cannot see a nested leaf and cannot
// disprove a nested declaration. One ruler, or no ruler.

import { join } from 'node:path'
import { tmpRoot } from '../../lib/tmp-root.mjs'

// The default corpus path is derived from the ONE temporary root (os.tmpdir()-derived, movable with VMU_TMP_ROOT);
// VMU_RICH_REAL and loadRich(richPath) still override it, and a missing corpus FAILS the audit instead of reading empty.
export const RICH_REAL = process.env.VMU_RICH_REAL || join(tmpRoot(), 'sim', 'compare', 'real-fields.jsonl')
export const MAX_FLAT_DEPTH = 3 // mirrors scripts/sim/compare/run.mjs fieldsOf(): arrays stay one path, objects flatten to depth 3

const STAR = String.fromCharCode(42)
const NUL = String.fromCharCode(0)
const NL = String.fromCharCode(10)

/** Flatten a receipt object into dotted leaf paths, depth-limited exactly like the rich corpus was harvested. */
export function flattenPaths(obj) {
  const out = new Set()
  const walk = (o, prefix, depth) => {
    for (const key of Object.keys(o).sort()) {
      if (key.startsWith('_')) continue
      const p = prefix ? prefix + '.' + key : key
      const v = o[key]
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (depth < MAX_FLAT_DEPTH) walk(v, p, depth + 1)
        else out.add(p)
        continue
      }
      out.add(p)
    }
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) walk(obj, '', 1)
  return out
}

/** The live side: tool -> Set(path) plus the first corpus line each path was seen on (for baseline evidence). */
export function loadRich(richPath = RICH_REAL, readFileSync) {
  const fs = readFileSync
  let text
  try { text = fs(richPath, 'utf8') } catch { return { ok: false, why: 'missing ' + richPath } }
  const fieldsByTool = new Map()
  const firstSeen = new Map() // tool + ' ' + path -> { line, run, sessionId, ok, code }
  const childrenOf = new Map() // tool + ' ' + parent -> Set(child segment)
  let rowsUsed = 0
  let line = 0
  for (const raw of text.split(NL)) {
    line += 1
    if (!raw) continue
    let row
    try { row = JSON.parse(raw) } catch { continue }
    if (!row || typeof row.tool !== 'string') continue
    const f = row.fields
    if (!f || typeof f !== 'object' || Array.isArray(f) || !Object.keys(f).length) continue
    rowsUsed += 1
    let set = fieldsByTool.get(row.tool)
    if (!set) { set = new Set(); fieldsByTool.set(row.tool, set) }
    for (const p of Object.keys(f)) {
      const path = String(p)
      set.add(path)
      if (!firstSeen.has(row.tool + ' ' + path)) firstSeen.set(row.tool + ' ' + path, { line, run: row.run, sessionId: row.sessionId, ok: row.ok, code: row.code })
      const segs = path.split('.')
      for (let i = 1; i < segs.length; i += 1) {
        const key = row.tool + ' ' + segs.slice(0, i).join('.')
        if (!childrenOf.has(key)) childrenOf.set(key, new Set())
        childrenOf.get(key).add(segs[i])
      }
    }
  }
  return { ok: true, why: null, rowsUsed, fieldsByTool, firstSeen, childrenOf }
}

/** The simulated side: tool -> Set(path), from receipt rows ({tool, receipt}) or from {scenario, out} corpora dirs. */
export function loadSimFields(receipts, readFileSync) {
  const simFields = new Map()
  const absorb = (rows) => {
    for (const r of rows) {
      const t = r.tool || (r.receipt && r.receipt.tool) || '?'
      if (!simFields.has(t)) simFields.set(t, new Set())
      for (const p of flattenPaths(r.receipt || {})) simFields.get(t).add(p)
    }
  }
  const isCorpora = Array.isArray(receipts) && receipts.length > 0 && typeof receipts[0].receiptsPath === 'string'
  if (!isCorpora) { absorb(receipts || []); return simFields }
  for (const corpus of receipts) {
    let text = ''
    try { text = readFileSync(corpus.receiptsPath, 'utf8') } catch { continue }
    absorb(text.split(NL).filter(Boolean).map((l) => JSON.parse(l)))
  }
  return simFields
}

/** Declarations: keys that start with `_` are the file's own glossary, not declarations about a tool. */
export function withoutGlossary(declaredRaw) {
  const declared = {}
  for (const [k, v] of Object.entries(declaredRaw || {})) if (!k.startsWith('_')) declared[k] = v
  return declared
}

export const BASELINE_CLASSES = ['call-shape', 'host-surface', 'stale-corpus', 'pending-fix']

/** Baseline rows -> { items, index, bad }: validation is part of the measurement, not a footnote. */
export function readBaseline(baselineRaw) {
  const items = baselineRaw && Array.isArray(baselineRaw.items) ? baselineRaw.items : []
  const index = new Map()
  const bad = []
  for (const it of items) {
    const tool = it && typeof it.tool === 'string' ? it.tool : ''
    const field = it && typeof it.field === 'string' ? it.field : ''
    const cls = it && typeof it.class === 'string' ? it.class : ''
    const owner = it && typeof it.owner === 'string' ? it.owner : ''
    const why = it && typeof it.why === 'string' ? it.why.trim() : ''
    const wbi = it && typeof it.wouldBeWrongIf === 'string' ? it.wouldBeWrongIf.trim() : ''
    const ev = it && typeof it.evidence === 'string' ? it.evidence.trim() : ''
    if (!tool || !field || !BASELINE_CLASSES.includes(cls) || !/^TB-\d{4}$/.test(owner) || why.length < 24 || !wbi || !ev) {
      bad.push([tool || '?', field || '?', cls || '?'].join(':'))
      continue
    }
    if (!index.has(tool)) index.set(tool, [])
    index.get(tool).push(it)
  }
  return { items, index, bad }
}

const segmentsOf = (path) => String(path).split('.')

/**
 * The narrowest matching baseline row for a path: a broad `settlement.*.*` and a narrow `settlement.byChoice.true`
 * both match one path, and first-match would spend the broad row on a path the narrow row owns -- the narrow row then
 * looks like a stale claim that is in fact still true (exactly the seven phantom claims that made the audit lie about
 * its own baseline).
 */
export function baselineRowFor(index, tool, path) {
  const rows = index.get(tool)
  if (!rows) return null
  const b = segmentsOf(path)
  let best = null
  let bestCost = Infinity
  for (const row of rows) {
    const a = segmentsOf(row.field)
    if (a.length !== b.length) continue
    let same = true
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== STAR && a[i] !== b[i]) { same = false; break }
    }
    if (!same) continue
    const cost = a.filter((x) => x === STAR).length
    if (cost < bestCost) { best = row; bestCost = cost }
  }
  return best
}

/**
 * measureFidelity({ rich, simFields, declared, baseline }) -> the whole reading.
 * Pure: every input is loaded by the caller, so all.mjs and the release gate measure the same objects.
 */
export function measureFidelity({ rich, simFields, declared, baseline }) {
  const liveToolsWithFieldList = rich.fieldsByTool.size
  const comparedTools = []
  const uncomparedTools = []
  const candidateGaps = []
  const declaredGapPaths = []
  const declaredHits = new Set()
  const baselineUsed = new Set()
  const pendingFixUsed = []
  const gaps = []
  for (const [tool, paths] of rich.fieldsByTool) {
    const declRow = declared[tool]
    const declKeys = declRow !== null && typeof declRow === 'object' && Array.isArray(declRow.keys) ? declRow.keys.map(String) : null
    const simSet = simFields.get(tool)
    if (!simSet) {
      uncomparedTools.push(tool)
      if (declRow !== undefined) declaredHits.add(tool)
      for (const p of paths) {
        const row = baselineRowFor(baseline.index, tool, p)
        if (row) { baselineUsed.add(tool + NUL + row.field); if (row.class === 'pending-fix') pendingFixUsed.push(tool + '.' + p) }
      }
      continue
    }
    comparedTools.push(tool)
    let absorbedHere = false
    for (const k of paths) {
      if (simSet.has(k)) continue
      const byDecl = declRow !== undefined && (declKeys === null || declKeys.includes(k))
      if (byDecl) { declaredGapPaths.push(tool + '.' + k); absorbedHere = true; continue }
      candidateGaps.push({ tool, field: k })
      const row = baselineRowFor(baseline.index, tool, k)
      if (row) {
        baselineUsed.add(tool + NUL + row.field)
        if (row.class === 'pending-fix') pendingFixUsed.push(tool + '.' + k)
        absorbedHere = true
        continue
      }
      gaps.push({ tool, field: k })
    }
    if (absorbedHere && declRow !== undefined) declaredHits.add(tool)
  }
  const staleBaseline = []
  for (const [tool, rows] of baseline.index) {
    for (const row of rows) if (!baselineUsed.has(tool + NUL + row.field)) staleBaseline.push(tool + '.' + row.field)
  }
  const staleDeclarations = Object.keys(declared).filter((k) => !declaredHits.has(k))
  const staleDeclaredKeys = []
  for (const tool of Object.keys(declared)) {
    const row = declared[tool]
    const keys = row !== null && typeof row === 'object' && Array.isArray(row.keys) ? row.keys.map(String) : null
    if (keys === null) continue
    const real = rich.fieldsByTool.get(tool)
    if (!real) { staleDeclaredKeys.push(...keys); continue }
    const simSet = simFields.get(tool) || new Set()
    const today = new Set([...real].filter((k) => !simSet.has(k)))
    staleDeclaredKeys.push(...keys.filter((k) => !today.has(k)))
  }
  const pendingFixTotal = baseline.items.filter((it) => it && it.class === 'pending-fix').length
  return {
    liveToolsWithFieldList,
    compared: comparedTools.length,
    gaps: gaps.length,
    gapList: gaps,
    candidateGaps,
    comparedTools,
    uncomparedTools,
    declaredGapPaths,
    baselineUsed: baselineUsed.size,
    pendingFixUsed,
    pendingFixTotal,
    staleBaseline,
    staleDeclarations,
    staleDeclaredKeys: Array.from(new Set(staleDeclaredKeys)).sort(),
  }
}
