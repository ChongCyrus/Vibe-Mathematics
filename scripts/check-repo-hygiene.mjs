#!/usr/bin/env node
// scripts/check-repo-hygiene.mjs — TB-2657 / task-136: 仓库卫生守卫（repo hygiene guard）
//
// WHY THIS EXISTS. 2026-11-09 15:12:12 仓库根曾出现 3 个 0 字节、以中文句子片段为文件名的
// untracked 文件（`三张表分别是「sim`、`不在此重复（避免两处真相）。`、`本文件是**唯一出处**；`）。
// 根因：`docs/acceptance/sim-gate-scope.md` 第 4–6 行的 markdown 引用块（行首 `> `）被 bash 当命令执行，
// `>` 成了重定向，文件名 = 该行第一个词。它们污染 `git status`、让收口哈希不稳定，且很难靠人眼在
// 49 项 untracked 中发现。旧防线 `D:\_tmp\env\repo-guard.sh` 只是临时目录里的 shell 脚本（3 小时清理器
// 会扫掉、不在任何门禁里），这里把它提进仓库成为无依赖的 Node 工具。
//
// 判据（三类，全部只针对 **untracked**；tracked 的中文文档名是合法的，见 docs/AUDIT-CHECKLIST.md §10）：
//   H1 root-non-ascii-untracked   仓库根目录下、文件名含非 ASCII 的 untracked 条目
//   H2 zero-byte-untracked        untracked 且 0 字节的**普通文件**（目录不参与，git 也不列空目录）
//   H3 tree-non-ascii-untracked   整棵树里、文件名含非 ASCII 的 untracked 条目
// 一条路径可同时属于多类（根目录 + 0 字节），report 里带 classes 数组，各类计数按 finding 计。
//
// WHY NODE AND NOT A SHELL PIPELINE. `git status` 默认 `core.quotepath=true`，中文路径会输出成
// `\344\270\211...` 八进制转义（ASCII 字节），任何按字节 grep「非 ASCII」的一行命令都会永远漏报。
// 所以这里必须显式 `-c core.quotepath=false`，并用 `-z` 拿 NUL 分隔的**原始字节**、直接在 Buffer 上
// 判 `>= 0x80`（不经过任何有损解码），再用 `Buffer.from(utf8)` 的可解码性判断能否还原（GBK 名会带 U+FFFD）。
// 一行版只作人工排查，判据必须是本工具。
//
// 用法：
//   node scripts/check-repo-hygiene.mjs            # 检查当前仓库（脚本所在仓库根）
//   node scripts/check-repo-hygiene.mjs --json     # 机器可读（供 preflight / 其它工具消费）
//   node scripts/check-repo-hygiene.mjs --root <dir>   # 检查指定 git 仓库（测试用）
//
// 退出码：0 = 干净；1 = 有可疑条目；2 = 用法错误 / 不是 git 仓库 / git 不可用。
// 输出纪律：每条可疑**逐条具名**（path + 字节数 + 能否 UTF-8 解码），绝不只报「发现 N 个」。
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_ROOT = path.resolve(HERE, '..')

/** 三类判据的稳定机器名（测试与 --json 消费者按这些名字断言，不要在别处重打字符串）。 */
export const HYGIENE_CLASSES = Object.freeze({
  ROOT_NON_ASCII: 'root-non-ascii-untracked',
  ZERO_BYTE: 'zero-byte-untracked',
  TREE_NON_ASCII: 'tree-non-ascii-untracked',
})

const USAGE = `check-repo-hygiene — 仓库卫生守卫（TB-2657）

用法：
  node scripts/check-repo-hygiene.mjs [--json] [--root <dir>]

判据（只针对 untracked）：
  ${HYGIENE_CLASSES.ROOT_NON_ASCII}  仓库根目录下文件名含非 ASCII
  ${HYGIENE_CLASSES.ZERO_BYTE}        0 字节普通文件
  ${HYGIENE_CLASSES.TREE_NON_ASCII}   整棵树里文件名含非 ASCII

退出码：0 干净 / 1 有可疑 / 2 用法错误。`

/** 用法 / 环境错误 —— 退出码 2（与「有可疑」的 1 区分开，CI 才能分流）。 */
export class UsageError extends Error {}

const hasNonAsciiByte = (buf) => {
  for (let i = 0; i < buf.length; i++) if (buf[i] >= 0x80) return true
  return false
}

const splitNul = (buf) => {
  const out = []
  let start = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      out.push(buf.subarray(start, i))
      start = i + 1
    }
  }
  if (start < buf.length) out.push(buf.subarray(start))
  return out
}

/**
 * 列出仓库里所有 untracked 条目（原始字节路径，已关闭 core.quotepath）。
 * @param {string} root
 * @returns {{ pathBuf: Buffer, display: string, decodable: boolean }[]}
 */
export function listUntracked(root) {
  const res = spawnSync(
    'git',
    ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
  )
  if (res.error) throw new UsageError(`无法运行 git（${res.error.code || res.error.message}）`)
  if (res.status !== 0) {
    const err = (res.stderr || Buffer.alloc(0)).toString('utf8').trim()
    throw new UsageError(`git status 失败（exit ${res.status}）：${err || '无 stderr'} —— ${root} 是 git 仓库吗？`)
  }
  const chunks = splitNul(res.stdout)
  const out = []
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    if (c.length < 4 || c[2] !== 0x20) continue
    const xy = String.fromCharCode(c[0], c[1])
    // rename/copy 记录：`R  <new>\0<old>\0` —— 旧路径那条要跳过，否则会被误读成新条目
    if (xy[0] === 'R' || xy[0] === 'C') i += 1
    if (xy !== '??') continue
    const pathBuf = c.subarray(3)
    const display = pathBuf.toString('utf8')
    out.push({ pathBuf, display, decodable: !display.includes('\uFFFD') })
  }
  return out
}

/** 用原始字节拼绝对路径（非 UTF-8 文件名在 Windows 上也能 stat）。 */
const absPathBuf = (root, relBuf) =>
  Buffer.concat([Buffer.from(root.endsWith(path.sep) ? root : root + path.sep, 'utf8'), relBuf])

const relDepth = (pathBuf) => {
  // git 的 -z 输出恒用 '/' 分隔，与平台无关
  let depth = 0
  for (let i = 0; i < pathBuf.length; i++) if (pathBuf[i] === 0x2f) depth += 1
  return depth
}

const basenameBuf = (pathBuf) => {
  for (let i = pathBuf.length - 1; i >= 0; i--) if (pathBuf[i] === 0x2f) return pathBuf.subarray(i + 1)
  return pathBuf
}

/**
 * 扫描一个仓库，返回三类判据的结果。纯只读：不写任何文件。
 * @param {string} root
 * @returns {{ root: string, clean: boolean, counts: Record<string, number>, findings: object[], totalUntracked: number }}
 */
export function scanHygiene(root) {
  const untracked = listUntracked(root)
  const findings = []
  let rootNonAscii = 0
  let zeroByte = 0
  let treeNonAscii = 0

  for (const item of untracked) {
    const base = basenameBuf(item.pathBuf)
    const nonAsciiName = hasNonAsciiByte(base)
    const atRoot = relDepth(item.pathBuf) === 0

    let bytes = null
    let isFile = false
    try {
      const st = fs.lstatSync(absPathBuf(root, item.pathBuf))
      bytes = st.size
      isFile = st.isFile()
    } catch {
      // 竞态：扫描时被其它车道删掉/改名 —— 不因读不到 stat 就判可疑，只在能证实时计入
      bytes = null
    }

    const classes = []
    if (nonAsciiName && atRoot) classes.push(HYGIENE_CLASSES.ROOT_NON_ASCII)
    if (isFile && bytes === 0) classes.push(HYGIENE_CLASSES.ZERO_BYTE)
    if (nonAsciiName) classes.push(HYGIENE_CLASSES.TREE_NON_ASCII)
    if (classes.length === 0) continue

    if (classes.includes(HYGIENE_CLASSES.ROOT_NON_ASCII)) rootNonAscii += 1
    if (classes.includes(HYGIENE_CLASSES.ZERO_BYTE)) zeroByte += 1
    if (classes.includes(HYGIENE_CLASSES.TREE_NON_ASCII)) treeNonAscii += 1
    findings.push({
      path: item.display,
      classes,
      bytes,
      decodable: item.decodable,
    })
  }

  findings.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return {
    root,
    clean: findings.length === 0,
    counts: {
      [HYGIENE_CLASSES.ROOT_NON_ASCII]: rootNonAscii,
      [HYGIENE_CLASSES.ZERO_BYTE]: zeroByte,
      [HYGIENE_CLASSES.TREE_NON_ASCII]: treeNonAscii,
    },
    findings,
    totalUntracked: untracked.length,
  }
}

const CLASS_LABELS = {
  [HYGIENE_CLASSES.ROOT_NON_ASCII]: 'H1 仓库根 非 ASCII 名（untracked）',
  [HYGIENE_CLASSES.ZERO_BYTE]: 'H2 0 字节普通文件（untracked）',
  [HYGIENE_CLASSES.TREE_NON_ASCII]: 'H3 全树 非 ASCII 名（untracked）',
}

const fmtBytes = (n) => (n === null ? '? B' : `${n} B`)

/** 人读输出：按类分组、每条具名（path + bytes + decodable）。 */
export function formatHuman(report) {
  const lines = []
  lines.push(`仓库卫生检查 — ${report.root}`)
  lines.push(`untracked 条目 ${report.totalUntracked} 个`)
  if (report.clean) {
    lines.push('✓ 干净：无 H1/H2/H3 可疑条目')
    return lines.join('\n')
  }
  lines.push(`✗ 可疑 ${report.findings.length} 条：`)
  for (const key of Object.values(HYGIENE_CLASSES)) {
    const items = report.findings.filter((f) => f.classes.includes(key))
    if (items.length === 0) continue
    lines.push('')
    lines.push(`[${CLASS_LABELS[key]}] ${items.length} 条`)
    for (const f of items) {
      const dec = f.decodable ? 'utf8 可解码' : 'utf8 不可解码（非 UTF-8 字节名）'
      lines.push(`  - ${JSON.stringify(f.path)}  ${fmtBytes(f.bytes)}  ${dec}`)
    }
  }
  lines.push('')
  lines.push(
    `各类计数: H1=${report.counts[HYGIENE_CLASSES.ROOT_NON_ASCII]} ` +
      `H2=${report.counts[HYGIENE_CLASSES.ZERO_BYTE]} H3=${report.counts[HYGIENE_CLASSES.TREE_NON_ASCII]}`,
  )
  lines.push('处理：确认是误落的重定向产物 → 删除；是合法文件 → git add 让它变 tracked（tracked 的中文名不违规）。')
  return lines.join('\n')
}

function parseArgs(argv) {
  const opts = { json: false, root: DEFAULT_ROOT, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--root') {
      const v = argv[++i]
      if (!v) throw new UsageError('--root 需要一个目录参数')
      opts.root = path.resolve(v)
    } else if (a.startsWith('--root=')) {
      const v = a.slice('--root='.length)
      if (!v) throw new UsageError('--root 需要一个目录参数')
      opts.root = path.resolve(v)
    } else throw new UsageError(`未知参数：${a}`)
  }
  return opts
}

export function main(argv = process.argv.slice(2)) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (e) {
    process.stderr.write(`${e.message}\n\n${USAGE}\n`)
    return 2
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  if (!fs.existsSync(opts.root)) {
    process.stderr.write(`根目录不存在：${opts.root}\n`)
    return 2
  }
  let report
  try {
    report = scanHygiene(opts.root)
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`${e.message}\n`)
      return 2
    }
    throw e
  }
  if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else process.stdout.write(`${formatHuman(report)}\n`)
  return report.clean ? 0 : 1
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false
  try {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (invokedDirectly) process.exitCode = main()
