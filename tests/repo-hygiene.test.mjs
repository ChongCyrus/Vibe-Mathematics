// tests/repo-hygiene.test.mjs — TB-2657 / task-136: `scripts/check-repo-hygiene.mjs` 的咬人证明。
//
// WHY THIS SUITE EXISTS. 2026-11-09 15:12 的污染事件（markdown 引用块被 bash 当重定向执行，产出 3 个
// 0 字节中文名 untracked 文件）暴露的不是「少了一个检查」而是「检查必须自己在仓库里、且必须证明它会咬」。
// 旧防线是仓库外的 shell 脚本，3 小时清理器会把它扫掉 —— 所以这里用**真实 git 仓库**（临时目录）逐条钉住：
//   ① 真仓库当前 exit 0（守卫不得对着现有 49 项 untracked 误报；汉字**文件名**只在 untracked 时才算污染）
//   ② 0 字节中文名 untracked ⇒ exit 1，stdout **点名**该文件（不是只报个数），--json 里能找到它
//   ③ 非 0 字节中文名 untracked ⇒ exit 1（这是真正的污染，不是误报；文件有内容也不能豁免）
//   ④ 中文名但已 tracked ⇒ exit 0（★ 最容易误伤的判据：仓库里本来就有合法中文文档名。
//      若这条判据写成「文件名含非 ASCII 就红」，它会在第一次提交中文文档时把整条门禁变成噪音）
// 另：退出码三态里的 2（用法错）在 ① 的尾部顺手断言（未知参数），所以「0/1/2」都有实测，不靠嘴说。
//
// Run: node tests/repo-hygiene.test.mjs        Last line: === REPO HYGIENE: N passed, M failed ===
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const SCRIPT = join(REPO, 'scripts', 'check-repo-hygiene.mjs')
const TMP_ROOT = process.env.REPO_HYGIENE_TMP_ROOT || (existsSync(__tmpRoot()) ? __tmpRoot() : tmpdir())
mkdirSync(TMP_ROOT, { recursive: true })
const WORK = mkdtempSync(join(TMP_ROOT, 'repohyg-'))

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) {
    passed++
    return true
  }
  failed++
  failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']'))
  return false
}

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败: ${r.stderr || r.stdout}`)
  return r.stdout
}

/** 新临时 git 仓库（带一次初始提交，让 `git status` 有基线）。 */
const makeRepo = (name) => {
  const dir = join(WORK, name)
  mkdirSync(dir, { recursive: true })
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'hygiene@test.local'])
  git(dir, ['config', 'user.name', 'hygiene-test'])
  writeFileSync(join(dir, 'README.md'), '# fixture\n')
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'fixture'])
  return dir
}

/** 跑检查器；返回 { status, stdout, stderr }。 */
const runChecker = (args, cwd = WORK) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', windowsHide: true })
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
}

const CASES = []
const test = (name, fn) => CASES.push({ name, fn })

// ① 真仓库：当前必须 exit 0；顺带断言用法错误 exit 2（退出码三态实测）。
test('真仓库干净 + 用法错误 exit 2', () => {
  const real = runChecker([], REPO)
  ok(real.status === 0, '真仓库 exit 0', { status: real.status, stderr: real.stderr })
  ok(/干净/.test(real.stdout), '真仓库 stdout 报「干净」', real.stdout.slice(0, 400))

  const usage = runChecker(['--no-such-flag'], REPO)
  ok(usage.status === 2, '未知参数 exit 2', { status: usage.status, stderr: usage.stderr })
  const badRoot = runChecker(['--root', join(WORK, 'does-not-exist')], REPO)
  ok(badRoot.status === 2, '--root 不存在 exit 2', { status: badRoot.status })
})

// ② 0 字节中文名 untracked ⇒ exit 1，stdout 点名，--json 可消费。
test('0 字节中文名 untracked 被点名', () => {
  const dir = makeRepo('zero-byte')
  const dirtyName = '三张表分别是「sim'
  writeFileSync(join(dir, dirtyName), '')
  const r = runChecker(['--root', dir])
  ok(r.status === 1, 'exit 1', { status: r.status, stdout: r.stdout.slice(0, 400) })
  ok(r.stdout.includes(dirtyName), 'stdout 逐条点名该文件', r.stdout.slice(0, 600))
  ok(r.stdout.includes('0 B'), 'stdout 报出字节数', r.stdout.slice(0, 600))

  const j = runChecker(['--root', dir, '--json'])
  ok(j.status === 1, '--json 也 exit 1', { status: j.status })
  let parsed = null
  try {
    parsed = JSON.parse(j.stdout)
  } catch {
    /* 断言下面会红并显示原文 */
  }
  ok(parsed !== null, '--json 是合法 JSON', j.stdout.slice(0, 200))
  if (parsed) {
    const hit = (parsed.findings || []).find((f) => f.path === dirtyName)
    ok(!!hit, '--json findings 含该路径', parsed.findings)
    ok(Array.isArray(hit?.classes) && hit.classes.includes('zero-byte-untracked'), 'JSON 标 H2 类', hit?.classes)
    ok(Array.isArray(hit?.classes) && hit.classes.includes('root-non-ascii-untracked'), 'JSON 标 H1 类', hit?.classes)
    ok(hit?.decodable === true, 'JSON 标 utf8 可解码', hit?.decodable)
  }
})

// ③ 有内容的中文名 untracked ⇒ 也 exit 1（污染与字节数无关）。
test('非 0 字节中文名 untracked 也红', () => {
  const dir = makeRepo('non-ascii')
  const dirtyName = '不在此重复（避免两处真相）。'
  writeFileSync(join(dir, dirtyName), 'markdown 引用块被当成重定向的残留\n')
  const r = runChecker(['--root', dir])
  ok(r.status === 1, 'exit 1', { status: r.status })
  ok(r.stdout.includes(dirtyName), 'stdout 点名', r.stdout.slice(0, 500))
  ok(r.stdout.includes('H3 全树'), '按 H3 类报出', r.stdout.slice(0, 700))
  ok(!r.stdout.includes('[H2 0 字节'), '有内容的文件不进 H2 类', r.stdout.slice(0, 700))
})

// ④ 中文名但已 tracked ⇒ exit 0（合法中文文档名不得被误伤）。
test('已 tracked 的中文文件名不违规', () => {
  const dir = makeRepo('tracked-ok')
  mkdirSync(join(dir, 'docs'), { recursive: true })
  writeFileSync(join(dir, 'docs', '中文文档.md'), '# 合法中文文档名\n\n这是 tracked 内容。\n')
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'add chinese doc'])
  const r = runChecker(['--root', dir])
  ok(r.status === 0, 'exit 0', { status: r.status, stdout: r.stdout.slice(0, 500) })
  ok(/干净/.test(r.stdout), 'stdout 报干净', r.stdout.slice(0, 400))
})

for (const c of CASES) {
  try {
    c.fn()
  } catch (e) {
    failed++
    failures.push(`${c.name} — 抛错: ${e && e.message}`)
  }
}
try {
  rmSync(WORK, { recursive: true, force: true })
} catch {
  /* 留不留都行，别让清理失败吞掉测试结果 */
}

if (failed > 0) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(' - ' + f)
}
console.log(`\n=== REPO HYGIENE: ${passed} passed, ${failed} failed ===`)
process.exitCode = failed === 0 ? 0 : 1
