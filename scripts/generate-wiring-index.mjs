#!/usr/bin/env node
// vmu WIRING INDEX — per-volume: how much was written, and how much of it actually runs today.
//
// WHY THIS EXISTS
//   The design set named hundreds of adjustable parameters, most of which have NO consumer yet
//   (the "可调控性幻觉": a volume reads like a control panel while nothing reads the key). This index
//   makes that visible FROM THE GENERATED ARTEFACTS, per volume: planned keys declared, how many of them
//   are wired, how many proposed error codes the volume contributes, and a one-line orientation.
//
// DATA SOURCES (all generated / machine-read; nothing is hand-copied)
//   · planned keys per volume  <- settings/planned.js `volumes[]` (reverse counting)
//   · wired keys               <- docs/04-settings.md §11 rows carrying the wired marker
//   · proposed codes per volume<- docs/03-interface-contract.md §8.1 rows (`卷 NN` column)
//   · orientation line         <- the first heading of docs/NN-*.md
//
// STALENESS GUARD (the most important rail): if docs/04 §11 is not what schema.js yields, the wiring
//   column would be computed from a stale table, so this script REFUSES to run and tells you to
//   regenerate first (`node scripts/generate-vmu-settings-table.mjs --write`). Same for planned.js.
//
// USAGE
//   node scripts/generate-wiring-index.mjs --write    rewrite the block in docs/00-README.md §3.2
//   node scripts/generate-wiring-index.mjs --check    exit 1 (with the difference) if the block is stale
//   node scripts/generate-wiring-index.mjs --json     machine-readable summary on stdout
//
// EXIT CODES — FOUR classes, deliberately NOT collapsed (round-6 reviewer: "输入不存在" and "设置表过期"
// used to print the SAME sentence, which sent the reader to the wrong fix):
//   0  ok (including the SOFT case: settings/planned.js lags the volumes ⇒ loud warning, index still written)
//   2  INPUT MISSING: a seam (VMU_DOCS_DIR / VMU_CODE_DIR / VMU_WIRING_DOC / planned.js / schema.js) points at a
//      path that does not exist ⇒ "输入不存在：<path>", nothing else is attempted;
//   2  SETTINGS TABLE STALE: docs/04 §11 is not what settings/schema.js yields ⇒ the WIRED column would be
//      wrong for every row ⇒ refuse and name the exact fix: generate-vmu-settings-table.mjs --write;
//   1  REAL INCONSISTENCY: the block in docs/00-README.md is not what the (current) artefacts yield.
//
// DETERMINISM: volumes are sorted by number; every input is parsed, never typed; two runs on the same
//   tree produce byte-identical output (the test asserts it).
//
// SEAMS: `VMU_DOCS_DIR` / `VMU_CODE_DIR` point at a copy (docs/11 §4.1); `VMU_WIRING_DOC` points the
//   writer/checker at a copy of 00-README.md so the guard can be exercised without touching the real doc.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')

export const DOCS_DIR = process.env.VMU_DOCS_DIR ? resolve(process.env.VMU_DOCS_DIR) : join(REPO, 'vibe-math-vmu', 'docs')
export const VMU_DIR = process.env.VMU_CODE_DIR ? resolve(process.env.VMU_CODE_DIR) : join(REPO, 'vibe-math-vmu')
export const README_FILE = process.env.VMU_WIRING_DOC ? resolve(process.env.VMU_WIRING_DOC) : join(DOCS_DIR, '00-README.md')
export const PLANNED_FILE = join(VMU_DIR, 'settings', 'planned.js')
export const SCHEMA_FILE = join(VMU_DIR, 'settings', 'schema.js')
const BEGIN = '<!-- WIRING-INDEX:BEGIN'
const END = '<!-- WIRING-INDEX:END -->'

/** Design volumes: discovered, sorted, never remembered (the audit does the same). */
export function volumeFiles(dir = DOCS_DIR) {
  return readdirSync(dir)
    .filter((f) => /^\d\d-[A-Za-z0-9-]+\.md$/.test(f))
    .sort()
    .map((f) => ({ num: f.slice(0, 2), name: f.replace(/\.md$/, ''), file: f, text: readFileSync(join(dir, f), 'utf8') }))
}

/** Terms the glossary defines, for the discoverability sub-table (N15). Missing file = no terms, not a crash. */
export function readGlossaryTerms() {
  try {
    const p = join(REPO, 'vibe-math-vmu', 'glossary.json')
    const raw = JSON.parse(readFileSync(p, 'utf8'))
    return Array.isArray(raw.terms) ? raw.terms : []
  } catch { return [] }
}

/** First heading of a volume, trimmed to one short orientation phrase (table-safe). */
export function orientationOf(text) {
  const line = String(text).split('\n').find((l) => /^#\s+/.test(l)) || ''
  let title = line.replace(/^#\s+/, '').trim()
  title = title.replace(/^vmu\s*(?:\d\d)?\s*[·:：\-—]?\s*/, '')      // drop the "vmu NN ·" / "vmu ·" prefix
  title = title.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
  return title.length > 34 ? title.slice(0, 33) + '…' : title
}

/** Wired keys: rows of docs/04 §11 that carry the wired marker (and not the unwired one). */
export function wiredKeysOf(settingsDocText) {
  const out = new Set()
  for (const line of String(settingsDocText).split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const m = /^\|\s*`([A-Za-z0-9_.]+)`/.exec(line)
    if (!m) continue
    const key = m[1]
    if (!key.startsWith('vmu.') || key.endsWith('.*')) continue   // namespace PATTERN rows are not keys
    if (!line.includes('已接线') || line.includes('未接线')) continue
    out.add(key)
  }
  return out
}

/** Proposed codes per volume from the 03 contract table (`规划码` rows with a `卷 NN` column). */
export function proposedCodesOf(contractText) {
  const per = new Map()
  let total = 0
  for (const line of String(contractText).split('\n')) {
    if (!line.trim().startsWith('|') || !line.includes('规划码')) continue
    const key = /^\|\s*`([A-Z][A-Z0-9_]+)`/.exec(line)
    const vol = /\|\s*卷\s*(\d\d)\s*\|/.exec(line)
    if (!key || !vol) continue
    per.set(vol[1], (per.get(vol[1]) || 0) + 1)
    total++
  }
  return { per, total }
}

/**
 * Guard: generated inputs must be current, or the index would be computed from stale bytes.
 *
 * TWO CLASSES, deliberately:
 *   · HARD (refuse, exit 2): docs/04 §11 is not what schema.js yields. The WIRED column is read from that
 *     table, so a stale table makes every wired count WRONG - the one thing this index must never be.
 *   · SOFT (loud warning, continue): settings/planned.js lags the design volumes. The planned column comes
 *     from that registry - the same artefact the schema composes - so a lag only under-counts keys added
 *     to the docs since the last `--write`; it cannot mis-state what the schema contains. Refusing here too
 *     would deadlock the index against a tree whose docs are being edited concurrently.
 */
export function stalenessReport() {
  const checks = [
    { kind: 'hard', name: 'docs/04 §11 (settings table)', script: 'generate-vmu-settings-table.mjs',
      fix: 'node scripts/generate-vmu-settings-table.mjs --write' },
    { kind: 'soft', name: 'settings/planned.js (planned keys)', script: 'generate-planned-settings.mjs',
      fix: 'node scripts/generate-planned-settings.mjs --write' },
  ]
  const out = { hard: [], soft: [] }
  for (const c of checks) {
    const r = spawnSync(process.execPath, [join(REPO, 'scripts', c.script)], { cwd: REPO, encoding: 'utf8' })
    if (r.status !== 0) {
      // The sub-generator's OWN last diagnostic line is carried through: without it the reader only saw
      // "stale" even when the real cause was something else (round-6 reviewer's misleading-message finding).
      const detail = String(r.stderr || r.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0] || ''
      out[c.kind].push(Object.assign({}, c, { detail: detail.slice(0, 200) }))
    }
  }
  return out
}

/**
 * Inputs whose ABSENCE is a different fault from "stale": a seam aimed at a path that does not exist.
 * Checked BEFORE the staleness sub-generators run, so a missing tree can never be reported as "STALE".
 */
export function missingInputs() {
  const wanted = [
    ['docs 目录', DOCS_DIR, 'dir'],
    ['vmu 代码目录', VMU_DIR, 'dir'],
    ['wiring 文档 (00-README.md)', README_FILE, 'file'],
    ['settings/planned.js', PLANNED_FILE, 'file'],
    ['settings/schema.js', SCHEMA_FILE, 'file'],
    ['docs/04-settings.md', join(DOCS_DIR, '04-settings.md'), 'file'],
    ['docs/03-interface-contract.md', join(DOCS_DIR, '03-interface-contract.md'), 'file'],
  ]
  const out = []
  for (const [what, p, kind] of wanted) {
    let fine = existsSync(p)
    if (fine && kind === 'dir') { try { fine = statSync(p).isDirectory() } catch (e) { fine = false } }
    if (!fine) out.push({ what, path: p })
  }
  return out
}

/** Every number the table needs, from the artefacts (pure: all inputs injected). */
export async function collectIndex({ volumes, plannedDefs, settingsText, contractText, coreKeys, glossaryTerms = [] }) {
  const plannedPer = new Map()
  const declaredBy = new Map()
  const families = new Map()          // volume -> Set of key families it declares (`vmu.audit` from `vmu.audit.x`)
  for (const d of plannedDefs) {
    declaredBy.set(d.key, d.volumes.slice())
    const seg = d.key.split('.')
    const family = seg.slice(0, 2).join('.')
    for (const v of d.volumes) {
      plannedPer.set(v, (plannedPer.get(v) || 0) + 1)
      if (!families.has(v)) families.set(v, new Set())
      families.get(v).add(family)
    }
  }
  // DISCOVERABILITY (the N15 gap): which volume OWNS which term. This is what makes the glossary navigable
  // instead of merely present - a reader looking for "who defines arbitration" gets an answer from the index.
  const termsPer = new Map()
  for (const t of glossaryTerms) {
    const m = /^(\d\d)-/.exec(String(t.definedIn || ''))
    if (!m) continue
    if (!termsPer.has(m[1])) termsPer.set(m[1], [])
    termsPer.get(m[1]).push(t.zh)
  }
  const wired = wiredKeysOf(settingsText)
  // Wired keys are attributed to every DESIGN volume that declares them. Planned keys use the registry's
  // own `volumes[]`; core (hand-written) keys have no registry entry, so their declaring volumes are read
  // off the volumes themselves. Mirror volumes are never a declaration source (04 is generated).
  const mirrors = new Set(['04'])
  const wiredPer = new Map()
  const wiredAttributed = new Set()
  for (const key of wired) {
    let vols = declaredBy.get(key)
    if (!vols) {
      vols = volumes.filter((v) => !mirrors.has(v.num) && v.text.indexOf(key) !== -1).map((v) => v.num)
    }
    for (const v of vols) { wiredPer.set(v, (wiredPer.get(v) || 0) + 1); wiredAttributed.add(key) }
  }
  const codes = proposedCodesOf(contractText)
  return {
    plannedPer, wiredPer, plannedTotal: plannedDefs.length, wiredTotal: wired.size,
    wiredAttributedTotal: wiredAttributed.size, coreTotal: coreKeys.length,
    codePer: codes.per, codeTotal: codes.total, volumes, families, termsPer,
  }
}

/** Render the markdown block (deterministic). */
export function renderBlock(idx) {
  const keyTotal = idx.plannedTotal + idx.coreTotal
  const pct = keyTotal ? (idx.wiredTotal / keyTotal * 100).toFixed(1) : '0.0'
  const rows = idx.volumes.map((v) => {
    const planned = idx.plannedPer.get(v.num) || 0
    const wiredN = idx.wiredPer.get(v.num) || 0
    const codes = idx.codePer.get(v.num) || 0
    const mirror = v.num === '04' ? '（生成镜像：键来自 schema，不计入声明来源）' : ''
    // A volume that mentions EVERY wired key is QUOTING the settings table, not declaring each key; say so
    // instead of letting the number look like 51 independent declarations.
    const quoting = idx.wiredTotal > 0 && wiredN === idx.wiredTotal ? '（引用全表，非逐项声明）' : ''
    return '| ' + v.num + ' | ' + planned + ' | ' + wiredN + ' | ' + codes + ' | '
      + orientationOf(v.text) + mirror + quoting + ' |'
  })
  const sumPlanned = [...idx.plannedPer.values()].reduce((a, b) => a + b, 0)
  const sumWired = [...idx.wiredPer.values()].reduce((a, b) => a + b, 0)
  const head = [
    '> **口径**：**声明的计划键**＝`settings/planned.js` 每条 `volumes[]` 的**反向计数** ✓；'
    + '**其中已接线**＝`docs/04 §11` 里带 ✓ 接线标记的键，**按其被哪些设计卷声明**归卷'
    + '（计划键取登记的 `volumes[]`，手写核心键读各卷正文；**生成镜像卷 04 不作声明来源**）✓；'
    + '**提案码**＝`03-§8.1` 生成块的 `卷 NN` 列计数 ✓。本块由 `scripts/generate-wiring-index.mjs` 生成，**勿手改** ✗。',
    '',
    '| 卷 | 声明的计划键 | 其中已接线 | 提案码 | 一句话定位 |',
    '|---|---|---|---|---|',
  ]
  const tail = [
    '| **总计** | **' + idx.plannedTotal + '**（逐卷求和 ' + sumPlanned + '，多卷共述重复计入） | **'
      + idx.wiredTotal + ' / ' + keyTotal + '（' + pct + '%）**（逐卷求和 ' + sumWired + '） | **'
      + idx.codeTotal + '** | 全仓 ' + keyTotal + ' 键（' + idx.coreTotal + ' 手写核心 ＋ ' + idx.plannedTotal
      + ' 计划）、' + idx.wiredTotal + ' 已接线 |',
    '',
    '> 读法 ✗✓：**声明的计划键 高 ≠ 今天能用** —— 只有"**其中已接线**"那一列是真的会改变行为的旋钮 ✓；'
    + '计划键改了**不会有任何行为变化**（`def: null`，表里显示"未接线"）✗。',
  ]
  // NOTE (round 9): the N15 discoverability sub-table (which volume owns which term / key families) was built
  // and then WITHDRAWN rather than shipped half-tested - it broke the per-volume assertions of
  // tests/vmu-wiring-index.test.mjs, and changing an external test's parsing to fit a new block is exactly the
  // kind of "make the gate match the artefact" move this project refuses. The collection code above
  // (families/termsPer) stays so the next round can land the sub-table WITH its assertions.
  void idx.families; void idx.termsPer
  return head.concat(rows, tail).join('\n')
}

/** Replace exactly the text between the markers; everything outside is returned untouched. */
export function spliceBlock(docText, block) {
  const lines = String(docText).split('\n')
  const b = lines.findIndex((l) => l.indexOf(BEGIN) !== -1)
  const e = lines.findIndex((l) => l.indexOf(END) !== -1)
  if (b === -1 || e === -1 || e < b) throw new Error('WIRING-INDEX markers are missing from ' + README_FILE)
  const before = lines.slice(0, b + 1)
  const after = lines.slice(e)
  return before.concat(block.split('\n'), after).join('\n')
}

async function main() {
  const argv = process.argv.slice(2)
  const write = argv.includes('--write')
  const asJson = argv.includes('--json')

  // CLASS ① INPUT MISSING — checked FIRST, so a bad seam is never reported as "stale" (round-6 finding).
  const missing = missingInputs()
  if (missing.length) {
    for (const m of missing) console.error('vmu wiring index: 输入不存在：' + m.path + '（' + m.what + '）')
    console.error('  point the seams (VMU_DOCS_DIR / VMU_CODE_DIR / VMU_WIRING_DOC) at an existing tree; nothing was read.')
    process.exit(2)
  }

  // CLASS ② SETTINGS TABLE STALE (hard ⇒ 2) · CLASS ③ planned.js lagging (soft ⇒ warn, keep going, exit 0)
  const stale = stalenessReport()
  if (stale.hard.length) {
    console.error('vmu wiring index: 设置表过期 (settings table STALE) — docs/04 §11 is not what settings/schema.js yields,')
    console.error('  so the WIRED column would be wrong for every row; refusing to run:')
    for (const c of stale.hard) {
      console.error('  · ' + c.name + '  →  先跑 ' + c.fix)
      if (c.detail) console.error('    诊断: ' + c.detail)
    }
    process.exit(2)
  }
  if (stale.soft.length) {
    for (const c of stale.soft) {
      console.error('vmu wiring index: WARNING — ' + c.name + ' lags the design volumes; the planned column'
        + ' under-counts keys added since the last write. Fix: ' + c.fix)
    }
  }

  const volumes = volumeFiles()
  const settingsText = readFileSync(join(DOCS_DIR, '04-settings.md'), 'utf8')
  const contractText = readFileSync(join(DOCS_DIR, '03-interface-contract.md'), 'utf8')
  const { PLANNED_DEFS } = await import(pathToFileURL(PLANNED_FILE).href)
  const schemaMod = await import(pathToFileURL(SCHEMA_FILE).href)
  const coreKeys = (Array.isArray(schemaMod.CORE_DEFS) ? schemaMod.CORE_DEFS
    : (schemaMod.SETTING_DEFS || []).filter((d) => d && d.planned !== true)).map((d) => d.key)

  const idx = await collectIndex({ volumes, plannedDefs: PLANNED_DEFS, settingsText, contractText, coreKeys,
    glossaryTerms: readGlossaryTerms() })
  const block = renderBlock(idx)
  const prevText = readFileSync(README_FILE, 'utf8')
  const nextText = spliceBlock(prevText, block)
  const staleBlock = prevText !== nextText

  if (asJson) {
    console.log(JSON.stringify({
      volumes: idx.volumes.length, plannedKeys: idx.plannedTotal, draftedCore: idx.coreTotal,
      wiredKeys: idx.wiredTotal, wiredPct: Number((idx.wiredTotal / (idx.plannedTotal + idx.coreTotal) * 100).toFixed(1)),
      proposedCodes: idx.codeTotal, blockLines: block.split('\n').length, stale: staleBlock,
    }, null, 2))
    process.exit(0)          // --json is machine-readable EXCLUSIVELY (no human lines mixed in)
  }
  console.log('wiring index: ' + idx.volumes.length + ' volumes · planned=' + idx.plannedTotal
    + ' · wired=' + idx.wiredTotal + '/' + (idx.plannedTotal + idx.coreTotal) + ' · proposed codes=' + idx.codeTotal)

  if (!staleBlock) {
    console.log('wiring index: up to date' + (write ? ' (--write requested, nothing written)' : ''))
    process.exit(0)
  }
  if (write) {
    writeFileSync(README_FILE, nextText, 'utf8')
    console.log('wiring index: REWRITTEN into ' + README_FILE + ' (' + block.split('\n').length + ' block lines)')
    process.exit(0)
  }
  console.error('wiring index: STALE — the block in ' + README_FILE + ' is not what the artefacts yield')
  console.error('  run: node scripts/generate-wiring-index.mjs --write')
  process.exit(1)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
