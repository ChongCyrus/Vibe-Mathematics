// tests/clean-temp-root-guard.test.mjs — round 17 (Lead ruling): `clean-temp --root` must never point at the repo.
//
// THE PROHIBITION IS NAMED AND PROVEN ON DISK, not just in the guard's own branches:
//   1. `--root` inside the repo (including via `..` and via a junction/symlink back into the repo) ⇒ exit 2 with
//      CLEAN_TEMP_ROOT_INSIDE_REPO naming the resolved path AND the repo root.
//   2. A refusal happens BEFORE any deletion: the probe directory keeps every file (asserted by listing it).
//   3. A NON-default `--root` forces `--dry-run` (exit 0, nothing deleted) unless `--yes-really-delete` is also
//      given; the switch WITHOUT `--root` is refused by name.
//   4. The default temp root is allowed and is not silently turned into a dry run.
//
// Run: node tests/clean-temp-root-guard.test.mjs
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rootGuard, sweepPrefixes } from '../scripts/clean-temp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SCRIPT = join(REPO, 'scripts', 'clean-temp.mjs')
const OLD = new Date(Date.now() - 48 * 3600 * 1000)

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8' })

console.log('=== 1. 纯函数分支：默认根允许、仓库内具名拒、非默认根强制 dry-run ===')
{
  const def = rootGuard({ root: null, repo: REPO, defaultRoot: tmpdir() })
  ok(def.refusal === null && def.forceDryRun === false, '默认（无 --root）：不拒、不强制 dry-run', def)
  const inRepo = rootGuard({ root: join(REPO, 'tests'), repo: REPO, defaultRoot: tmpdir() })
  ok(inRepo.refusal && inRepo.refusal.code === 'CLEAN_TEMP_ROOT_INSIDE_REPO', '★ 仓库内：具名拒 CLEAN_TEMP_ROOT_INSIDE_REPO', inRepo.refusal)
  ok(inRepo.refusal.message.includes(REPO) && inRepo.refusal.hint.length > 0, '★ 拒绝信息点解析后的绝对路径与仓库根，并给人提示', inRepo.refusal.message)
  const confirmAlone = rootGuard({ root: null, repo: REPO, confirmed: true })
  ok(confirmAlone.refusal && confirmAlone.refusal.code === 'CLEAN_TEMP_CONFIRM_WITHOUT_ROOT', '★ 只给确认开关、不给 --root ⇒ 具名拒（开关与 --root 必须同时出现）', confirmAlone.refusal)
  const nonDefault = rootGuard({ root: tmpdir(), repo: REPO, defaultRoot: join(tmpdir(), 'not-the-default') })
  ok(nonDefault.refusal === null && nonDefault.forceDryRun === true, '★ 非默认根 ⇒ 强制 dry-run（不传 --dry-run 也只打印）', nonDefault)
}

console.log('=== 2. 磁盘集成：仓库内的 --root 被拒，且【一个文件都没少】===')
const probe = join(HERE, '.clean-temp-guard-probe')
{
  rmSync(probe, { recursive: true, force: true })
  mkdirSync(join(probe, 'nested'), { recursive: true })
  const prefix = sweepPrefixes()[0] || 'vmu-'
  writeFileSync(join(probe, prefix + 'stale.txt'), 'stale\n')
  writeFileSync(join(probe, 'nested', 'keep.txt'), 'keep\n')
  utimesSync(join(probe, prefix + 'stale.txt'), OLD, OLD)
  const before = readdirSync(probe, { recursive: true }).sort()
  const r = run(['--root=' + probe, '--age-hours=0'])
  ok(r.status === 2, '★ 仓库内 --root ⇒ exit 2（具名拒绝，不删除）', { status: r.status, err: (r.stderr || '').slice(0, 200) })
  ok((r.stderr || '').includes('CLEAN_TEMP_ROOT_INSIDE_REPO'), '★ stderr 带拒绝码', (r.stderr || '').slice(0, 160))
  ok((r.stderr || '').includes(REPO), '★ stderr 点名仓库根', (r.stderr || '').slice(0, 160))
  const after = existsSync(probe) ? readdirSync(probe, { recursive: true }).sort() : []
  ok(after.length === before.length && after.every((x, i) => x === before[i]) && after.length > 0,
    '★ 被拒后目录内容逐项相同（证明拒绝先于删除）', { before, after })
}
{
  // A path WRITTEN with `..` that RESOLVES inside the repo must be refused: the check is on realpath, not on the
  // literal string (a string check would let `tests/../tests` through).
  const escape = join(REPO, 'tests', '..', 'tests')
  const r = run(['--root=' + escape, '--age-hours=0'])
  ok(r.status === 2 && (r.stderr || '').includes('CLEAN_TEMP_ROOT_INSIDE_REPO'), '★ 用 `..` 写、解析后仍在仓库内 ⇒ 同样具名拒（判定在 realpath 之后）', { status: r.status, err: (r.stderr || '').slice(0, 160) })
  // ...and the mirror: a `..` path that really resolves OUTSIDE is allowed, only forced into dry-run.
  const outside = join(probe, '..', '..', '..', '.clean-temp-guard-probe')
  const r2 = run(['--root=' + outside, '--age-hours=0'])
  ok(r2.status === 0 && !(r2.stderr || '').includes('CLEAN_TEMP_ROOT_INSIDE_REPO'), '★ 反方向：`..` 解析后真在仓库外 ⇒ 不拒（拒绝是路径判定，不是字符串扫描）', { status: r2.status })
}
{
  // A junction/symlink under TEMP pointing into the repo: realpath resolves it ⇒ refused.
  const holder = mkdtempSync(join(tmpdir(), 'vmu-guardlink-'))
  const link = join(holder, 'into-repo')
  let made = false
  try { symlinkSync(join(REPO, 'tests'), link, 'junction'); made = true } catch (e) { /* no symlink privilege */ }
  if (made) {
    const r = run(['--root=' + link, '--age-hours=0'])
    ok(r.status === 2 && (r.stderr || '').includes('CLEAN_TEMP_ROOT_INSIDE_REPO'), '★ 经 junction/符号链接回到仓库内 ⇒ 具名拒（realpath 判定）', { status: r.status })
  } else {
    console.log('  skip junction case: this host refused to create a junction (EPERM/privilege) — NOT counted as a pass')
  }
  rmSync(holder, { recursive: true, force: true })
}

console.log('=== 3. 非默认根的开关：默认只 dry-run，确认后才真删 ===')
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-guardprobe-'))
  const prefix = sweepPrefixes()[0] || 'vmu-'
  const victim = join(root, prefix + 'stale-delete-me.txt')
  writeFileSync(victim, 'x')
  utimesSync(victim, OLD, OLD)
  const dry = run(['--root=' + root, '--age-hours=0'])
  ok(dry.status === 0 && existsSync(victim), '★ 非默认根：只打印计划、文件仍在（强制 dry-run）', { status: dry.status, out: (dry.stdout || '').slice(0, 120) })
  ok(!(dry.stdout || '').includes('"deleted":1'), '★ 且回执没有 deleted:1（没有静默真删）', (dry.stdout || '').slice(-160))
  const real = run(['--root=' + root, '--age-hours=0', '--yes-really-delete'])
  ok(real.status === 0 && !existsSync(victim), '★ 同时给 --root 与 --yes-really-delete ⇒ 真删生效（开关确实接通）', { status: real.status })
  rmSync(root, { recursive: true, force: true })
}

rmSync(probe, { recursive: true, force: true })
console.log('')
console.log('=== CLEAN-TEMP ROOT GUARD: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
