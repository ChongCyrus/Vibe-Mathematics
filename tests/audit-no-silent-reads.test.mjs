// tests/audit-no-silent-reads.test.mjs — G4 PRE-WORK: NOTHING MAY SILENTLY READ A MISSING FILE.
//
// WHY. The legacy presets (vibe-math-v2 … vibe-math-v5r) are to be archived. The reconnaissance's most dangerous
// finding was `existsSync(p) ? readFileSync(p) : ''` inside a gate: after the move the gate does NOT fail - it
// compares against an empty string and keeps passing, so coverage silently weakens (worse than a red). This suite
// makes that class VISIBLE and keeps it at zero:
//
//   · every such site must either use `tests/_lib/require-file.mjs` (`requireFile`/`requireDir`: named refusal), or
//   · be named in OPTIONAL below with the reason it is legitimately optional (a generator comparing against its own
//     not-yet-written output, a CLI copying an optional artifact, ...).
//
// The scan covers tests/** and scripts/** (the two places the task named). It deliberately does NOT flag `String(x || '')`
// (that is normalisation, not a file read) — only the shapes where a FILE READ is degraded.
//
// Run: node tests/audit-no-silent-reads.test.mjs
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireFile, requireDir } from './_lib/require-file.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

// ---------------------------------------------------------------------------------------------------------------
// The shapes. Deliberately NARROW: only "a FILE READ whose absence is turned into an EMPTY value". Two adjacent
// patterns are NOT flagged because they fail loudly already: `ok(existsSync(p) && readFileSync(p)…)` (the assertion
// goes false) and `if (existsSync(p)) { throw … }`. Value normalisation (`String(x || '')`) is not a file read.
const SHAPES = [
  // existsSync(…) ? read…(…) : <empty>
  { id: 'ternary-read-empty', re: /existsSync\([^;\n]*\)\s*\?[^\n;]*\b(readFileSync|read)\s*\([^;\n]*\)\s*:\s*(''|""|null|\[\])/ },
  // a reader helper that degrades a missing file to an empty value
  { id: 'reader-helper-empty', re: /=>\s*existsSync\([^;\n]*\)\s*\?[^\n;]*\b(readFileSync|read)\s*\([^;\n]*\)\s*:\s*(''|""|null|\[\])/ },
  // readFileSync(…) || ''
  { id: 'read-or-empty', re: /\bread(FileSync)?\([^\n;]*\)\s*\|\|\s*(''|""|null|\[\])/ },
  // try { return read… } catch { return '' } — "read if present" helper
  { id: 'try-read-catch-empty', re: /try\s*\{[^}]*\breturn\s+read(FileSync)?\([^}]*\}\s*catch[^}]*\{\s*return\s+(''|""|null|\[\])/ },
  // directory listing degraded to []
  { id: 'ternary-readdir-empty', re: /existsSync\([^;\n]*\)\s*\?[^\n;]*readdirSync[^\n;]*:\s*\[\]/ },
]

// LEGITIMATELY OPTIONAL — one entry per site with the reason. These are NOT silent degradations of an archive-bound
// file: each reads something whose ABSENCE is a valid state (own not-yet-written output, an optional CLI artifact, an
// fs-seam double, or an e2e workspace artifact whose absence still fails loudly at the next assertion). ★ The
// legacy-preset e2e/suite group is listed file-by-file because G4 will archive those suites WITH the presets: if any
// of them is KEPT, its entries must be converted to requireFile instead of staying here.
const OWN_OUTPUT = '读取自己【即将重写的输出】做差分：首次运行文件本就不存在，空基线是合法状态'
const FS_SEAM = '这是【fs 接缝替身】/目录列举替身的分支，不是把仓库文件读成空串'
const WORKSPACE = 'e2e 读取本套件自己刚写出的【工作区产物】；产物缺失会让同一套件后续断言显式失败（不是空串比较）'
const LEGACY_E2E = '★ legacy-preset 套件：G4 将随五个预设一起归档；若保留，必须逐个转 requireFile（本轮已列入报告 ⑦）'
const OPTIONAL = Object.freeze({
  'scripts/build-preset-rows.mjs:ternary-read-empty': OWN_OUTPUT,
  'scripts/generate-coverage-debt.mjs:ternary-read-empty': OWN_OUTPUT,
  'scripts/generate-pack-prompts.mjs:ternary-read-empty': OWN_OUTPUT,
  'scripts/generate-planned-settings.mjs:ternary-read-empty': OWN_OUTPUT,
  'scripts/dsh-drive.mjs:ternary-read-empty': '可选产物：把宿主写出的 jsonl 复制进报告目录；没有就是没有，不是覆盖降级',
  'tests/accept-c-orphan.test.mjs:ternary-read-empty': 'git 命令写出的临时输出（rev/status）；读不到显示 "(unknown)"，是显式可见降级',
  'tests/audit-declaration-criterion.test.mjs:try-read-catch-empty': '扫描器自用的 readIf/listFiles：读的是被枚举的 gate 源码集，枚举为空会被 RULE A 的 coverage 断言拦下',
  'tests/audit-installer-policy.test.mjs:try-read-catch-empty': '安装器状态/备份的【首次不存在】是合法状态；缺失时相关断言检查 null/false 而显式失败',
  'tests/audit-market-metadata.test.mjs:ternary-read-empty': '市场元数据/README 由其它门禁（readme-counts 等）保证存在；本套件不是唯一守卫',
  'tests/audit-market-metadata.test.mjs:read-or-empty': '同上',
  'tests/audit-preset-mechanism.test.mjs:ternary-readdir-empty': FS_SEAM,
  'tests/audit-round6-persistence.test.mjs:ternary-readdir-empty': WORKSPACE,
  'tests/e2e-business.test.mjs:ternary-readdir-empty': WORKSPACE,
  'tests/e2e-regression.test.mjs:ternary-readdir-empty': WORKSPACE,
  'tests/e2e-v3-roundtrip.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/e2e-v4-fixes.test.mjs:try-read-catch-empty': LEGACY_E2E,
  'tests/e2e-v5-round2.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/formal-verify-v2.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/formal-verify-v2.test.mjs:ternary-readdir-empty': LEGACY_E2E,
  'tests/formal-verify-v3.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/formal-verify-v3.test.mjs:ternary-readdir-empty': LEGACY_E2E,
  'tests/formal-verify-v4.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/formal-verify-v5.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/math-computation-v2.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/math-computation-v3.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/math-computation-v4.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/math-computation-v5.test.mjs:ternary-readdir-empty': LEGACY_E2E,
  'tests/prompt-v5-integrity.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/selfdrive-v5.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/selfdrive-v5.mjs:try-read-catch-empty': LEGACY_E2E,
  'tests/v2-fix-probes.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/v2-path-escape.test.mjs:ternary-readdir-empty': LEGACY_E2E,
  'tests/v3-fix-probes.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/v4-final-paper.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/v4-final-paper.test.mjs:ternary-readdir-empty': LEGACY_E2E,
  'tests/v4-final-paper.test.mjs:try-read-catch-empty': LEGACY_E2E,
  'tests/v5-meeting-attribution.test.mjs:ternary-read-empty': LEGACY_E2E,
  'tests/vmu-assistant-host-slice.test.mjs:try-read-catch-empty': '宿主薄片夹具：读取可选宿主产物；缺失时断言看 null 而显式失败',
})

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.mjs') || full.endsWith('.js')) out.push(full)
  }
  return out
}

const hits = []
for (const root of ['tests', 'scripts']) {
  for (const f of walk(join(REPO, root))) {
    const rel = relative(REPO, f).replace(/\\/g, '/')
    const lines = readFileSync(f, 'utf8').split('\n')
    for (const [i, line] of lines.entries()) {
      if (/^\s*\/\//.test(line)) continue
      for (const s of SHAPES) {
        if (s.re.test(line)) hits.push({ file: rel, line: i + 1, shape: s.id, text: line.trim().slice(0, 150), key: rel + ':' + s.id })
      }
    }
  }
}

console.log('=== 1. NO SILENTLY DEGRADED FILE READS (count before/after the gate) ===')
const unaccounted = hits.filter((h) => !OPTIONAL[h.key])
const grouped = new Map()
for (const h of unaccounted) {
  if (!grouped.has(h.file)) grouped.set(h.file, { n: 0, shapes: new Set() })
  grouped.get(h.file).n += 1
  grouped.get(h.file).shapes.add(h.shape)
}
console.log('  unaccounted sites by file (file  count  shapes):')
for (const [file, g] of [...grouped.entries()].sort()) console.log('    ' + file + '  ' + g.n + '  [' + [...g.shapes].join(',') + ']')
ok(hits.length > 0, 'the scanner really matched sites (a zero would have to be proven, not assumed)', { hits: hits.length })
ok(unaccounted.length === 0, '★ every degraded-read site is either converted to requireFile/requireDir or named OPTIONAL',
  unaccounted.slice(0, 6).map((h) => h.file + ':' + h.line + ' [' + h.shape + ']'))
console.log('  counted sites=' + hits.length + '  optional(named)=' + (hits.length - unaccounted.length) + '  unaccounted=' + unaccounted.length)

console.log('=== 2. requireFile REALLY REFUSES (positive) AND READS (negative) ===')
{
  const root = mkdtempSync(process.env.TEMP_SLV_INSPECT || 'D:\\_tmp')
  try {
    const present = join(root, 'present.txt')
    writeFileSync(present, 'content-42', 'utf8')
    const got = requireFile(present, 'the selftest fixture')
    ok(got === 'content-42', '★ 反：文件存在 ⇒ requireFile 原样返回内容', got)
    let threw = null
    try { requireFile(join(root, 'absent.txt'), 'the selftest fixture that must exist') } catch (e) { threw = e }
    ok(!!threw && /REQUIRED FILE MISSING/.test(String(threw.message)) && String(threw.message).includes('absent.txt')
      && /归档提示/.test(String(threw.message)),
      '★ 正：文件缺失 ⇒ 具名抛错，message 含【路径 ＋ 为什么该在 ＋ 归档提示】', threw && threw.message)
    let dirThrew = null
    try { requireDir(join(root, 'no-dir'), 'a selftest dir') } catch (e) { dirThrew = e }
    ok(!!dirThrew && /REQUIRED DIRECTORY MISSING/.test(String(dirThrew.message)), '★ 正：目录缺失 ⇒ 同样具名抛错', dirThrew && dirThrew.message)
    const dirOk = requireDir(root, 'the selftest dir that exists')
    ok(dirOk.length > 0, '★ 反：目录存在 ⇒ 正常返回条目', dirOk.length)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log('')
console.log('=== NO SILENT READS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
