#!/usr/bin/env node
// scripts/audit/mutations/run.mjs — «改坏机制 ⇒ 被点名的断言必红» 的仓库内可重跑件（TB-2687 / AUDIT-17 clue 3）。
//
// WHY: the 90/91 coverage figure once rested on `D:/_tmp/mutbatch2/mutations.json` — a temp dir with a
// 3-hour self-clean. Evidence outside the repo is a rehearsal, not a proof. This runner makes the same
// action re-runnable: copy the repo to a process-unique temp dir, run the target suite there FIRST
// (baseline), apply the mutation in the copy, run it again, require the named assertion title in the
// failure output, delete the copy. The working tree is never touched.
//
// THREE NEGATIVE CONTROLS (a runner that cannot fail these is measuring nothing):
//   ① replaceWith === anchor       ⇒ the edit is a no-op        ⇒ NO-RED
//   ② expectRed names no such title ⇒ the suite still fails     ⇒ WRONG-ASSERTION
//   ③ the suite is already red in the pristine copy             ⇒ PRE-RED (the red is not ours)
//   ④ the mutation targets tests/** ⇒ the judge is broken, not the product ⇒ MUTATION-ON-CRITERION
//
// USAGE
//   node scripts/audit/mutations/run.mjs --all          # every manifest entry (the acceptance command)
//   node scripts/audit/mutations/run.mjs --rule E26     # one rule
//   node scripts/audit/mutations/run.mjs --rules E3,E14 # several
//   node scripts/audit/mutations/run.mjs --json         # machine-readable results (used by the test)
//   node scripts/audit/mutations/run.mjs --doc          # regenerate docs/acceptance/mutation-evidence.md
// Exit code: 0 only when every entry is RED (and, with --doc, the document was written).
//
// The manifest is `scripts/audit/mutations/manifest.json`; each entry is
//   {ruleId, file, anchor, replaceWith, expectRed:{suite,titleIncludes}, cascade}
// anchor/replaceWith are literal strings (grep -F), never regexes and never line numbers (they drift).

import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const MANIFEST_PATH = join(REPO, 'scripts/audit/mutations/manifest.json')
export const DOC_PATH = join(REPO, 'docs/acceptance/mutation-evidence.md')
const COPY_SKIP_TOP = ['.git', 'node_modules']
const RUN_TIMEOUT_MS = 120000

// Rules whose criterion cannot be exercised inside this repo. Kept explicit so the generated document
// never has to guess: a rule is either proven here, rehearsed elsewhere, or named undecidable with a reason.
const UNDECIDABLE = {
  G1: 'this deployment boots with `engines === []`, so no engine dispatch path exists to break',
  C10: 'no Lean toolchain in this environment, so a Lean artifact cannot be produced or compiled',
  E30: 'the observable (a REAL three-member run reaching the scenario) needs a live multi-agent run, not a unit copy',
}

export function loadManifest(file = MANIFEST_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const entries = Array.isArray(raw) ? raw : raw.entries
  if (!Array.isArray(entries) || !entries.length) throw new Error('manifest has no entries: ' + file)
  for (const e of entries) {
    const okShape = e && typeof e.ruleId === 'string' && typeof e.file === 'string'
      && typeof e.anchor === 'string' && e.anchor.length > 0 && typeof e.replaceWith === 'string'
      && e.expectRed && typeof e.expectRed.suite === 'string' && typeof e.expectRed.titleIncludes === 'string'
    if (!okShape) throw new Error('MUTATION-SHAPE: entry is not {ruleId,file,anchor,replaceWith,expectRed:{suite,titleIncludes}}: ' + JSON.stringify(e))
  }
  return entries
}

const ORIGINAL_REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const ORIGINAL_REPO_URL = 'file:///D:/wd/vibemath%E5%BC%80%E5%8F%91/Vibe-Mathematics'

/** A suite that hardcodes the working-tree path (`const REPO = 'D:/wd/...'`) would import the UNMUTATED
 *  implementation from the real repo and stay green no matter what the copy contains — a silent
 *  NO-OP-IMPORT (this is exactly why the B4 mutation was green here and red in the external copy).
 *  Rewrite those literals to the copy and fail loudly if any survive, so a future hardcoded path can
 *  never fake a mutation again. */
function rewriteHardcodedRepoPaths(copyDir) {
  const testsDir = join(copyDir, 'tests')
  const files = readdirSync(testsDir, { recursive: true })
    .map((f) => join(testsDir, String(f)))
    .filter((f) => /\.(mjs|js)$/.test(f))
  const copyFwd = copyDir.split(String.fromCharCode(92)).join('/')
  const copyUrl = pathToFileURL(copyDir).href
  let touched = 0
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    if (!src.includes(ORIGINAL_REPO) && !src.includes(ORIGINAL_REPO_URL)) continue
    const next = src.split(ORIGINAL_REPO_URL).join(copyUrl).split(ORIGINAL_REPO).join(copyFwd)
    if (next !== src) { writeFileSync(f, next); touched++ }
    if (next.includes(ORIGINAL_REPO) || next.includes(ORIGINAL_REPO_URL)) {
      throw new Error('MUTATION-PATH-LEAK: ' + relative(copyDir, f) + ' still points at the working tree after rewrite')
    }
  }
  return touched
}

/** Copy the repo into a fresh temp dir. `.git`/`node_modules` are skipped; everything a suite may read
 *  (vibe-math-vmu, tests, docs, archive, scripts) is copied, so a suite that resolves REPO from its own
 *  `import.meta.url` sees the COPY, not the working tree. The rules document lives ONE LEVEL ABOVE the repo
 *  (`../宏观层面v5r运行规则.md`) and some suites read it there, so the copy root is `<base>/repo` and the
 *  document is mirrored next to it — otherwise those suites die on ENOENT before asserting anything. */
function copyRepo() {
  const base = mkdtempSync(join(tmpdir(), 'vmu-mut-' + process.pid + '-'))
  const dir = join(base, 'repo')
  cpSync(REPO, dir, {
    recursive: true,
    filter: (src) => {
      const rel = relative(REPO, src)
      if (!rel) return true
      const top = rel.split(/[\\/]/)[0]
      return !COPY_SKIP_TOP.includes(top)
    },
  })
  const rulesDoc = join(REPO, '..', '宏观层面v5r运行规则.md')
  try { cpSync(rulesDoc, join(base, '宏观层面v5r运行规则.md')) } catch { /* optional: suites that read it will say so */ }
  rewriteHardcodedRepoPaths(dir)
  return dir
}

/** Apply literal edits in the copy. Every anchor must occur EXACTLY once — a silent no-op mutation is the
 *  failure mode this runner exists to prevent. */
function applyEdits(copyDir, edits) {
  for (const e of edits) {
    const p = join(copyDir, e.file)
    const src = readFileSync(p, 'utf8')
    const n = src.split(e.anchor).length - 1
    if (n !== 1) {
      throw new Error('MUTATION-ANCHOR: ' + e.file + ' — `anchor` must be a literal that occurs exactly once, found ' + n)
    }
    writeFileSync(p, src.replace(e.anchor, e.replaceWith))
  }
  return edits.length
}

function runSuite(copyDir, suite, timeoutMs) {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [join(copyDir, 'tests', suite)], {
    cwd: copyDir,
    encoding: 'utf8',
    timeout: timeoutMs || RUN_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, { MUTATION_COPY: copyDir }),
  })
  const out = String(r.stdout || '') + '\n' + String(r.stderr || '')
  const failureLines = out.split(/\r?\n/).filter((l) =>
    /^\s*(?:FAIL|✗|·)\s+/.test(l) || /^\s*FAILURES:/.test(l) || /^\s*not ok\b/.test(l))
  return { failed: failureLines.length > 0 || r.status !== 0, out, failureLines, exit: r.status, ms: Date.now() - t0 }
}

/** Run one manifest entry against a throwaway copy of the repo. Pure with respect to the working tree.
 *  `opts.baseline === 'GREEN'` lets a caller reuse a known-green baseline for the same suite (runAll caches
 *  it); `opts.baselineEdits` is a test-only hook to prove the PRE-RED guard fires (it breaks the suite
 *  BEFORE the baseline run). */
export function runEntry(entry, opts = {}) {
  const t0 = Date.now()
  let copyDir = null
  try {
    // ④ anti-lamp-off: a mutation aimed at the CRITERION (a test file) proves nothing about the product —
    //    it would redden the suite by breaking the judge, not by breaking the mechanism under test.
    if (/^tests\//.test(entry.file)) {
      return {
        rule: entry.ruleId, suite: entry.expectRed && entry.expectRed.suite, verdict: 'MUTATION-ON-CRITERION',
        exit: null, ms: Date.now() - t0, missing: [], failureLines: [],
        error: 'the mutation targets ' + entry.file + ' (a test/criterion file) — mutate the mechanism, not the judge',
      }
    }
    copyDir = copyRepo()
    if (Array.isArray(opts.baselineEdits) && opts.baselineEdits.length) applyEdits(copyDir, opts.baselineEdits)
    if (opts.baseline !== 'GREEN') {
      const base = runSuite(copyDir, entry.expectRed.suite, opts.timeoutMs)
      if (base.failed) {
        return {
          rule: entry.ruleId, suite: entry.expectRed.suite, verdict: 'PRE-RED', exit: base.exit,
          ms: Date.now() - t0, missing: [], failureLines: base.failureLines.slice(0, 40),
          error: 'the suite is already red before any mutation — the red cannot be attributed to this entry',
        }
      }
    }
    applyEdits(copyDir, [{ file: entry.file, anchor: entry.anchor, replaceWith: entry.replaceWith }])
    const r = runSuite(copyDir, entry.expectRed.suite, opts.timeoutMs)
    const missing = r.out.includes(entry.expectRed.titleIncludes) ? [] : [entry.expectRed.titleIncludes]
    let verdict
    if (!r.failed) verdict = 'NO-RED'                       // the mutation changed nothing the suite can see
    else if (missing.length) verdict = 'WRONG-ASSERTION'    // it failed, but not on the assertion we named
    else verdict = 'RED'                                    // mutated ⇒ failed ⇒ the named assertion is there
    return {
      rule: entry.ruleId, suite: entry.expectRed.suite, verdict, exit: r.exit, ms: Date.now() - t0,
      missing, expected: [entry.expectRed.titleIncludes], cascade: entry.cascade === true,
      failureLines: r.failureLines.slice(0, 40),
    }
  } catch (e) {
    return {
      rule: entry.ruleId, suite: entry.expectRed && entry.expectRed.suite, verdict: 'ERROR',
      exit: null, ms: Date.now() - t0, missing: [], error: String((e && e.message) || e),
    }
  } finally {
    if (copyDir) {
      try { rmSync(copyDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) } catch { /* throwaway copy */ }
    }
  }
}

/** Run entries in order, caching a green baseline per suite (the same suite is shared by several rules). */
export function runAll(entries, opts = {}) {
  const results = []
  const greenBaselines = new Set()
  for (const e of entries) {
    const suite = e.expectRed.suite
    const r = runEntry(e, Object.assign({}, opts, { baseline: greenBaselines.has(suite) ? 'GREEN' : undefined }))
    if (r.verdict === 'RED') greenBaselines.add(suite)
    results.push(r)
    if (!opts.quiet) {
      const tag = (r.verdict === 'RED' ? 'RED' : r.verdict).padEnd(15)
      console.log(tag + ' ' + r.rule.padEnd(4) + ' ' + String(r.ms).padStart(6) + 'ms  ' + r.suite
        + (r.verdict === 'RED' ? '' : '  ⇐ ' + (r.error || r.missing.join(' | '))))
    }
  }
  return results
}

/** Write the 93-row document FROM the run output. Three tiers, exhaustive by construction:
 *  PROVEN-RED (a manifest entry actually failed on its named assertion in this run)
 *  REHEARSED-RED (external mutation evidence exists in TB-2679, but it is not re-runnable from this repo)
 *  UNDECIDABLE (named reason in UNDECIDABLE; no in-repo path can exercise the mechanism). */
export function writeEvidenceDoc(results) {
  const ledger = JSON.parse(readFileSync(join(REPO, 'docs/acceptance/rules-ledger.json'), 'utf8'))
  const items = Array.isArray(ledger) ? ledger : (ledger.items || [])
  const byRule = new Map(results.map((r) => [r.rule, r]))
  const entryByRule = new Map(loadManifest().map((e) => [e.ruleId, e]))
  const rows = []
  for (const item of items) {
    const id = item.id
    const r = byRule.get(id)
    if (r) {
      const tier = r.verdict === 'RED' ? 'PROVEN-RED' : 'NOT-PROVEN'
      const title = entryByRule.get(id).expectRed.titleIncludes
      rows.push('| ' + id + ' | ' + tier + ' | `' + r.suite + '::' + title + '` | ' + (r.verdict === 'RED' ? 'mutated ⇒ the named assertion failed (' + r.ms + ' ms)' : 'run verdict: ' + r.verdict) + ' |')
    } else if (UNDECIDABLE[id]) {
      rows.push('| ' + id + ' | UNDECIDABLE | — | ' + UNDECIDABLE[id] + ' |')
    } else {
      rows.push('| ' + id + ' | REHEARSED-RED | external (TB-2679) | mutation evidence exists but lives outside the repo; no in-repo entry yet |')
    }
  }
  const red = results.filter((r) => r.verdict === 'RED').length
  const proven = rows.filter((l) => l.includes('| PROVEN-RED |')).length
  const rehearsed = rows.filter((l) => l.includes('| REHEARSED-RED |')).length
  const undecidable = rows.filter((l) => l.includes('| UNDECIDABLE |')).length
  const head = [
    '# Mutation evidence — 改坏机制 ⇒ 被点名断言必红（仓库内可重跑）',
    '',
    '> 本文件由 `node scripts/audit/mutations/run.mjs --doc` **生成**，不要手改。',
    '> 它把「规则被守住」的证据从 `D:/_tmp/mutbatch2/`（3 小时自清理）搬进仓库：每一条 PROVEN-RED 都能在',
    '> 本机重跑 `node scripts/audit/mutations/run.mjs --all` 复现——复制仓库到临时目录、改坏一个机制、',
    '> 跑指定套件、要求 manifest 点名的断言出现在失败输出里、删掉副本；工作树全程不动。',
    '',
    '## 本次运行',
    '',
    '- manifest 条目：' + results.length + '（PROVEN-RED ' + red + '）',
    '- 总耗时：' + results.reduce((a, r) => a + r.ms, 0) + ' ms',
    '- 三档合计：PROVEN-RED ' + proven + ' + REHEARSED-RED ' + rehearsed + ' + UNDECIDABLE ' + undecidable + ' = ' + (proven + rehearsed + undecidable) + '（台账 93 条）',
    '',
    '## 93 条三档表',
    '',
    '| 规则 | 档 | 证据（套件 :: 断言） | 说明 |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## 与 `docs/acceptance/sim-audit-open-items.json` 的关系',
    '',
    '- `RULES-E33-SOURCE-GREP`（P2）已由 TB-2686 关闭：`tests/vmu-meeting-types.test.mjs` 的 E33 runtime 断言',
    '  用临时 pack 副本证明 catalog 跟着 pack 走，反关灯两条。',
    '- REHEARSED-RED 条目不是「没做过弄假」：TB-2679 在 `D:/_tmp/mutbatch/` 逐条做过（77 条），',
    '  只是证据未入仓、不能重跑；要升级成 PROVEN-RED，把该条的 `{file,anchor,replaceWith,expectRed}`',
    '  加进 `manifest.json` 即可（见 `scripts/audit/mutations/run.mjs` 头部注释）。',
    '',
  ]
  writeFileSync(DOC_PATH, head.join('\n'), 'utf8')
  return { path: DOC_PATH, proven, rehearsed, undecidable, total: rows.length }
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const isMain = (() => {
  try { return fileURLToPath(import.meta.url) === resolve(process.argv[1] || '') } catch { return false }
})()
if (isMain) {
  const argv = process.argv.slice(2)
  const has = (f) => argv.includes(f)
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
  const json = has('--json')
  const all = loadManifest()
  let entries = all
  if (val('--rule')) entries = all.filter((e) => e.ruleId === val('--rule'))
  else if (val('--rules')) { const set = new Set(String(val('--rules')).split(',').map((s) => s.trim())); entries = all.filter((e) => set.has(e.ruleId)) }
  if (!entries.length) { console.error('no manifest entry matched'); process.exit(2) }
  if (!json) console.log('mutation evidence: ' + entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies') + ' (repo copy per entry; working tree untouched)')
  const results = runAll(entries, { quiet: json })
  const bad = results.filter((r) => r.verdict !== 'RED')
  if (has('--doc')) {
    if (bad.length) { console.error('refusing to write the evidence document: not every entry is RED'); process.exit(1) }
    const d = writeEvidenceDoc(results)
    console.log('wrote ' + relative(REPO, d.path) + ' — PROVEN-RED ' + d.proven + ' · REHEARSED-RED ' + d.rehearsed + ' · UNDECIDABLE ' + d.undecidable + ' = ' + d.total)
  }
  if (json) {
    console.log(JSON.stringify({ total: results.length, red: results.length - bad.length, bad: bad.length, results }, null, 2))
  } else {
    const ms = results.reduce((a, r) => a + r.ms, 0)
    console.log('MUTATION EVIDENCE: ' + (results.length - bad.length) + '/' + results.length + ' RED · ' + ms + 'ms total' + (bad.length ? ' · NOT PROVEN: ' + bad.map((r) => r.rule + '=' + r.verdict).join(', ') : ''))
  }
  process.exit(bad.length ? 1 : 0)
}
