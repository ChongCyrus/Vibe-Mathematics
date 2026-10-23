#!/usr/bin/env node
// ★ DOC CLAIMS VS CODE (phase 12, batch: "把假承诺变成会失败的断言")
//
// WHAT THIS SUITE IS FOR. Three places in this repo make a CLAIM in prose or in a hint — and that claim names a
// mechanism that code is supposed to provide. A claim is only worth the assertion behind it, so every entry below
// is checked in TWO independent directions:
//
//    ① CLAIM-PRESENT  — the sentence really exists in the file (so a grep-based reader is not inventing it);
//    ② CLAIM-HONOURED — the thing it names is really reachable in the code (parameter table / receipt keys / landing
//                       points), parsed from source, not from documentation.
//
// ★ THE RULE: this suite may NOT be made green by editing the claim into something vaguer, and it may NOT be made
// green by editing the code to paper over the mismatch. When the two sides disagree the suite is RED — that red IS
// the finding, and the owner of the text decides whether the text or the mechanism moves.
//
// Run:  node tests/vmu-doc-claims-vs-code.test.mjs            (the real check; red = a claim is not honoured)
//       node tests/vmu-doc-claims-vs-code.test.mjs --prove-live
//            (proves the assertions are LIVE without touching any file: each source is mutated IN MEMORY and the
//             suite must flip. A claim check that cannot be flipped by removing the text — or by adding the
//             mechanism — is a vacuous assertion, and this mode fails loudly when that happens.)
//
// Last line: === VMU DOC CLAIMS VS CODE: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = {
  host: 'vibe-math-vmu/host.js',
  tools: 'vibe-math-vmu/packs/v5r/tools.js',
  core: 'vibe-math-vmu/packs/v5r/prompts/v5r-core.js',
  blocks: 'vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js',
}

const read = (rel) => readFileSync(join(REPO, rel), 'utf8')

/** Slice from `startNeedle` up to (excluding) `endNeedle`; null when the start is absent. */
function sliceBetween(text, startNeedle, endNeedle) {
  const i = text.indexOf(startNeedle)
  if (i < 0) return null
  const from = i + startNeedle.length
  const j = text.indexOf(endNeedle, from)
  return j < 0 ? text.slice(from) : text.slice(from, j)
}

/** Every `name: 'vibe_v5_*'` literal declared by the pack's tool table. */
function packToolNames(toolsSrc) {
  return [...toolsSrc.matchAll(/name:\s*'(vibe_v5_[a-z0-9_]+)'/g)].map((m) => m[1])
}

// ── the three claims ────────────────────────────────────────────────────────────────────────────────────────────
// Each claim: { id, where, needle, says, honoured(sources) → {ok, detail} }
const CLAIMS = [
  {
    id: 'records-face-track-hint',
    where: SRC.host,
    // the records face's truncation hint tells the caller to narrow by track
    needle: '或先按 track 收窄',
    says: '「先按 track 收窄」—— records 面有一个 track 参数可以收窄列表',
    honoured(s) {
      const face = sliceBetween(s.host, 'name: TOOL_NAMES.records', '// 5) scripts')
      if (face === null) return { ok: false, detail: 'records 面的声明块找不到（host.js 结构变了？）' }
      const declared = /(^|\n)\s*track:\s*param\(/.test(face)
      const consumed = /run:\s*async\s*\(\s*\{[^}]*\btrack\b/.test(face)
      return {
        ok: declared && consumed,
        detail: 'parameters 里声明 track=' + declared + '，run() 解构并消费 track=' + consumed
          + '（参考：内核 kernel/records.js 的 list({track}) 本来支持，面没接）',
      }
    },
  },
  {
    id: 'feedback-in-report-counts',
    where: SRC.blocks,
    // the feedback prompt line promises unclosed items appear in the report/overview counts
    needle: '未闭环条目会出现在汇报与总览的计数里',
    says: '未闭环 feedback 条目会出现在 vibe_v5_report 与 vibe_v5_overview 的计数里',
    honoured(s) {
      const report = sliceBetween(s.tools, 'async function toolReport', 'async function toolOverview')
      const overview = sliceBetween(s.tools, 'async function toolOverview', '// ── ⑬–⑲')
      if (report === null || overview === null) return { ok: false, detail: 'toolReport/toolOverview 的源码块找不到（tools.js 结构变了？）' }
      const counts = sliceBetween(report, 'counts: {', '}')
      const reportKey = /\bfeedback\w*\s*:/.test(counts || '')
      const overviewKey = /\bfeedback\w*\s*:/.test(overview)
      const keys = (counts || '').split(',').map((x) => x.trim().split(':')[0]).filter(Boolean)
      return {
        ok: reportKey && overviewKey,
        detail: 'report.counts 的键=[' + keys.join(', ') + '] 含 feedback=' + reportKey + '；overview 返回体含 feedback=' + overviewKey,
      }
    },
  },
  {
    id: 'script-archive-recompute-flow',
    where: SRC.core,
    // the no-adhoc-scripts rule refuses with "go through the archive/recompute flow"
    needle: '请走归档/复算流程',
    says: '脚本被拒时走「归档/复算流程」—— 本 pack 存在脚本归档或复算的落点',
    honoured(s) {
      const tracks = sliceBetween(s.core, 'tracks: [', ']')
      const trackHit = /['"][^'"]*(script|recompute|复算)[^'"]*['"]/i.test(tracks || '')
      const tools = packToolNames(s.tools)
      const toolHit = tools.filter((n) => /script|recompute/.test(n))
      const manifestScripts = /(^|\n)\s*scripts:\s*\[/m.test(s.core)
      const ok = trackHit || toolHit.length > 0 || manifestScripts
      return {
        ok,
        detail: '轨迹命中=' + trackHit + '，脚本/复算工具命中=[' + toolHit.join(', ') + ']，manifest 声明 scripts='
          + manifestScripts + '（' + tools.length + ' 个 pack 工具已扫）',
      }
    },
  },
]

// ── the checker (pure over a `sources` object so --prove-live can mutate it in memory) ─────────────────────────
function check(sources) {
  const rows = []
  // NON-EMPTY GUARD: every assertion this checker makes is a CLAIMS row, so an empty table would make the
  // whole file pass while checking nothing (RULE E shape A).
  if (!(CLAIMS.length > 0)) throw new Error('CLAIMS is empty - the checker would assert nothing')
  for (const c of CLAIMS) {
    const key = Object.keys(SRC).find((k) => SRC[k] === c.where)
    const text = sources[key]
    const present = typeof text === 'string' && text.includes(c.needle)
    let honoured = { ok: false, detail: 'source 不可读' }
    if (present) {
      try { honoured = c.honoured(sources) } catch (e) { honoured = { ok: false, detail: '检查器抛错: ' + String(e && e.message) } }
    } else {
      honoured = { ok: false, detail: '文本本身已不存在，无法判定机制（先确认这句话去哪了）' }
    }
    rows.push({ id: c.id, where: c.where, present, honoured: honoured.ok, detail: honoured.detail })
  }
  return rows
}

function loadSources(keyed) {
  const sources = {}
  for (const [k, rel] of Object.entries(SRC)) sources[k] = keyed ? keyed[k] : read(rel)
  return sources
}

// ── --prove-live: mutate IN MEMORY, never on disk (this repo's write lock keeps me out of host.js/tools.js/prompts) ─
function proveLive() {
  const base = loadSources()
  const mutations = {
    'records-face-track-hint': {
      // ① remove the sentence ⇒ CLAIM-PRESENT must turn false
      removed: { host: base.host.replace('或先按 track 收窄', '或先全部取回') },
      // ② add the mechanism the sentence promises ⇒ CLAIM-HONOURED must turn true
      fixed: {
        host: base.host.replace(
          "parameters: {\n        action: param('string', 'list（默认）｜expand｜append'",
          "parameters: {\n        track: param('string', 'list：按轨收窄（可选）'),\n        action: param('string', 'list（默认）｜expand｜append'",
        ).replace("run: async ({ action = 'list', id, limit, kind, statement, proof } = {})", "run: async ({ action = 'list', id, limit, kind, statement, proof, track } = {})"),
      },
    },
    'feedback-in-report-counts': {
      removed: { blocks: base.blocks.replace('未闭环条目会出现在汇报与总览的计数里', '未闭环条目会留在反馈库里') },
      fixed: {
        tools: base.tools
          .replace('counts: { roster:', 'counts: { feedbackOpen: 0, roster:')
          .replace('board: { tasks:', 'feedbackOpen: 0, board: { tasks:'),
      },
    },
    'script-archive-recompute-flow': {
      removed: { core: base.core.replace('请走归档/复算流程', '请先登记后运行') },
      fixed: { core: base.core.replace("tracks: ['progress',", "tracks: ['scripts', 'progress',").replace(", 'state'],", ", 'state', 'scripts'],") },
    },
  }

  let passed = 0
  const failures = []
  const ok = (cond, name, detail) => { if (cond) { passed += 1 } else { failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 200) + ']')) } }

  // NON-EMPTY GUARD: with no claims there are no mutations to prove the checks falsifiable, and every
  // assertion below would be skipped silently.
  if (!(CLAIMS.length > 0)) throw new Error('CLAIMS is empty - the mutation proof would run zero times')
  for (const claim of CLAIMS) {
    const m = mutations[claim.id]
    const realRow = check(base).find((r) => r.id === claim.id)
    const removedRow = check({ ...base, ...m.removed }).find((r) => r.id === claim.id)
    const fixedRow = check({ ...base, ...m.fixed }).find((r) => r.id === claim.id)
    // ① the presence check is live: it must be true on the real tree (or already red) and FALSE once the text is gone
    ok(removedRow.present === false, 'LIVE ① present-check goes red when the sentence is removed: ' + claim.id, removedRow.present)
    // ② the honoured check is live: adding the mechanism must turn it true
    ok(fixedRow.honoured === true, 'LIVE ② honoured-check goes green when the mechanism is added: ' + claim.id, fixedRow.detail)
    console.log('PROOF ' + claim.id + ': real { present=' + realRow.present + ', honoured=' + realRow.honoured + ' }'
      + ' → text removed { present=' + removedRow.present + ' }'
      + ' → mechanism added { honoured=' + fixedRow.honoured + ' }')
  }
  console.log('=== VMU DOC CLAIMS VS CODE (--prove-live): ' + passed + ' passed, ' + failures.length + ' failed ===')
  for (const f of failures) console.log('FAIL ' + f)
  process.exit(failures.length > 0 ? 1 : 0)
}

// `--prove-live` is a mode flag; the normal run is the real check and its exit code IS the finding.
if (process.argv.includes('--prove-live')) {
  proveLive()
} else {
  // the CLAIMS table keys must match SRC keys, or the checker reads undefined and silently "passes" nothing
  const keyOf = (where) => Object.keys(SRC).find((k) => SRC[k] === where)
  const rows = check(loadSources())
  let passed = 0
  const failures = []
  const ok = (cond, name, detail) => { if (cond) { passed += 1 } else { failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 240) + ']')) } }

  // NON-EMPTY PRECONDITIONS: an assertion over an empty source would be vacuous.
  for (const [k, rel] of Object.entries(SRC)) {
    const text = read(rel)
    ok(typeof text === 'string' && text.length > 1000, 'source is readable and non-trivial: ' + rel + ' (' + (text && text.length) + ' chars)')
  }
  ok(packToolNames(read(SRC.tools)).length >= 30, 'pack tool table is non-empty (found ' + packToolNames(read(SRC.tools)).length + ' names)')
  ok(CLAIMS.every((c) => keyOf(c.where) !== undefined), 'every claim points at a source that the loader reads')

  console.log('=== 1. THE CLAIM EXISTS (the sentence a reader would trust) ===')
  for (const r of rows) ok(r.present, 'CLAIM-PRESENT: ' + r.id + ' — the sentence is in ' + r.where, r.detail)
  console.log('\n=== 2. THE CLAIM IS HONOURED (the mechanism it names really exists) ===')
  for (const r of rows) ok(r.honoured, 'CLAIM-HONOURED: ' + r.id + ' — ' + r.detail)

  console.log('\n--- per-claim verdict ---')
  for (const r of rows) {
    console.log((r.present ? '  text ✓' : '  text ✗') + '  ' + (r.honoured ? 'code ✓' : 'code ✗（矛盾，本套件必须红）') + '  ' + r.id)
    console.log('      ' + r.detail)
  }
  console.log('\n=== VMU DOC CLAIMS VS CODE: ' + passed + ' passed, ' + failures.length + ' failed ===')
  for (const f of failures) console.log('FAIL ' + f)
  process.exit(failures.length > 0 ? 1 : 0)
}
