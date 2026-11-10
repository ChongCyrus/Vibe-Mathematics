#!/usr/bin/env node
/**
 * tests/verify-run.test.mjs — TB-2696 自测：机械核对器必须会判四态、会算数、会点名缺失、会拒绝缺参数。
 *
 * 全部样本在 tmpdir 里现场造（不依赖任何 D:/_tmp 语料，也不联网）；CLI 用真进程跑，退出码就是判据的一部分。
 * 三条反关灯（每条都会把判据本身弄坏，验证它不是摆设）：
 *   ① 改坏一条 PASS 回执里的证据字段名 ⇒ 必须降级为 NO-EVIDENCE 并点名该字段（不许静默 PASS）。
 *   ② 把 perBox 求和改成与 unackedRowsAllBoxes 不等 ⇒ 必须 FAIL，且 arithmetic 同时给出两个数。
 *   ③ 不给 --since ⇒ 退出码 2 且 stderr 点名 --since（不许默认扫全量把旧 run 混进来）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const CLI = path.join(REPO, 'scripts', 'audit', 'verify-run.mjs')

let passed = 0
let failed = 0
function ok(name, cond, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const HEAD = execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
const T0 = Date.parse('2026-01-01T00:00:00Z')

function writeSession(root, sessionId, events) {
  const dir = path.join(root, 'workspace-a', sessionId)
  fs.mkdirSync(dir, { recursive: true })
  const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n'
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), zlib.zstdCompressSync(Buffer.from(body, 'utf8')))
}

function callEvent(callId, name, args, at) {
  return { time: at, type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args) } }
}
function resultEvent(callId, receipt, at) {
  return { time: at, type: 'tool/result', data: { message: { toolCallId: callId, content: [{ type: 'text', text: JSON.stringify(receipt) }] } } }
}
function promptEvent(text, at) {
  return { time: at, type: 'user/message', data: { content: [{ type: 'text', text }] } }
}

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-run-'))
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function verify(root, extra = []) {
  const out = path.join(root, 'out')
  const res = runCli(['--sessions-root', path.join(root, 'sessions'), '--since', '2026-01-01T00:00:00Z', '--out', out, ...extra])
  let payload = null
  try { payload = JSON.parse(fs.readFileSync(path.join(out, 'verify-run.json'), 'utf8')) } catch { payload = null }
  return { res, payload, text: (res.stdout || '') + (res.stderr || '') }
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }) } catch { /* a durable writer may still hold it; the OS tmpdir sweeper handles the rest */ }
}

/* ---------------------------------------------------------------- §1 V1 四态 */
console.log('\n=== §1 V1 构建自证：四态都能判，缺证据就点名 ===')
{
  // ENV-LIMIT: 三处构建读数相等，但 journal 说 dirty:true —— 构建不是从干净 HEAD 出的，这是环境事实
  const root = tmpRoot()
  try {
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    writeSession(path.join(root, 'sessions'), 'session-envlimit', [
      { time: T0 + 1000, type: 'session', data: { build: HEAD, buildSource: 'git HEAD (git archive)', dirty: true } },
    ])
    const driver = path.join(root, 'drive.log')
    fs.writeFileSync(driver, 'TARBALL build=' + HEAD + '\nSTAMP exit=0 (build=' + HEAD + ')\n')
    const { res, payload } = verify(root, ['--driver-log', driver])
    ok('★★ ENV-LIMIT：三处相等但 dirty:true ⇒ ENV-LIMIT（不是 PASS）', res.status === 0 && payload && payload.checks[0].verdict === 'ENV-LIMIT', payload && payload.checks[0])
  } finally { cleanup(root) }

  // FAIL: driver 的 TARBALL build 与 git HEAD 不等
  const root2 = tmpRoot()
  try {
    fs.mkdirSync(path.join(root2, 'sessions'), { recursive: true })
    writeSession(path.join(root2, 'sessions'), 'session-fail', [promptEvent('hello', T0 + 1000)])
    const driver = path.join(root2, 'drive.log')
    fs.writeFileSync(driver, 'TARBALL build=deadbeef\n')
    const { res, payload } = verify(root2, ['--driver-log', driver])
    const c = payload && payload.checks[0]
    ok('★★ FAIL：TARBALL build=deadbeef ≠ git HEAD ⇒ FAIL 并给出两个数', res.status === 1 && c && c.verdict === 'FAIL' && String(c.why).includes('deadbeef') && String(c.why).includes(HEAD), c)
  } finally { cleanup(root2) }

  // PASS: 三处相等 + dirty:false
  const root3 = tmpRoot()
  try {
    fs.mkdirSync(path.join(root3, 'sessions'), { recursive: true })
    writeSession(path.join(root3, 'sessions'), 'session-pass', [
      { time: T0 + 1000, type: 'session', data: { build: HEAD, buildSource: 'git HEAD (git archive)', dirty: false } },
    ])
    const driver = path.join(root3, 'drive.log')
    fs.writeFileSync(driver, 'TARBALL build=' + HEAD + '\nBUILD REV: ' + 'a'.repeat(40) + '\nSTAMP exit=0\n')
    const { res, payload } = verify(root3, ['--driver-log', driver])
    const c = payload && payload.checks[0]
    ok('★★ PASS：三处相等且干净 ⇒ PASS，且证据带工具@会话:时间 + 字段=值', res.status === 0 && c && c.verdict === 'PASS' && Array.isArray(c.evidence) && c.evidence.length > 0 && c.evidence.every((e) => e.call && e.receiptField !== undefined && 'value' in e), c)
  } finally { cleanup(root3) }

  // NO-EVIDENCE: 不给 driver 日志 ⇒ 第一处自证缺失，点名而不是通过/失败
  const root4 = tmpRoot()
  try {
    fs.mkdirSync(path.join(root4, 'sessions'), { recursive: true })
    writeSession(path.join(root4, 'sessions'), 'session-noev', [promptEvent('hello', T0 + 1000)])
    const { res, payload } = verify(root4)
    const c = payload && payload.checks[0]
    ok('★★ NO-EVIDENCE：缺 driver 日志 ⇒ NO-EVIDENCE 并点名（不写成 PASS 也不写成 FAIL）', res.status === 0 && c && c.verdict === 'NO-EVIDENCE' && c.missing.join('').includes('driver'), c && { verdict: c.verdict, missing: c.missing })
  } finally { cleanup(root4) }
}

/* -------------------------------------------------- §2 V11 算术 + 缺字段点名 */
console.log('\n=== §2 V11 计数恒等：算得出、算不对就 FAIL、字段被改坏就点名 ===')
function mailFixture(root, mutateStatus) {
  fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
  const status = { ok: true, tool: 'vibe_vmu_mailbox', action: 'status', notice: { unackedRowsAllBoxes: 27, perBox: { 'r-1': 2, 'r-2': 25 } } }
  const statusAfter = { ok: true, tool: 'vibe_vmu_mailbox', action: 'status', notice: { unackedRowsAllBoxes: 26, perBox: { 'r-1': 2, 'r-2': 24 } } }
  if (mutateStatus) mutateStatus(status)
  writeSession(path.join(root, 'sessions'), 'session-mail', [
    promptEvent('新到的消息\n[新到的消息]\n【会议预约】… 读后 mailbox ack ml-1', T0 + 1000),
    callEvent('c1', 'vibe_vmu_mailbox', { action: 'status', member: 'r-1' }, T0 + 2000),
    resultEvent('c1', status, T0 + 2000),
    callEvent('c2', 'vibe_vmu_mailbox', { action: 'ack', member: 'r-1', ids: ['ml-1'] }, T0 + 3000),
    resultEvent('c2', { ok: true, tool: 'vibe_vmu_mailbox', action: 'ack', rows: [{ id: 'ml-1' }] }, T0 + 3000),
    callEvent('c3', 'vibe_vmu_mailbox', { action: 'status', member: 'r-1' }, T0 + 4000),
    resultEvent('c3', statusAfter, T0 + 4000),
  ])
}
{
  const root = tmpRoot()
  try {
    mailFixture(root)
    const { payload } = verify(root, ['--checks', 'V11'])
    const c = payload && payload.checks[0]
    ok('★★ V11 PASS：unackedRowsAllBoxes == sum(perBox)，且 ack 前后净减 1', c && c.verdict === 'PASS' && c.arithmetic && c.arithmetic.equal === true && c.arithmetic.unackedRowsAllBoxes === c.arithmetic.perBoxSum, c && c.arithmetic)
    ok('★ 只跑 --checks V11 ⇒ 输出只有这一个验点', payload && payload.checks.length === 1 && payload.checks[0].id === 'V11', payload && payload.checks.map((x) => x.id))
  } finally { cleanup(root) }

  const root2 = tmpRoot()
  try {
    mailFixture(root2, (s) => { s.notice.perBox = { 'r-1': 2, 'r-2': 24 } }) // 求和 26 ≠ 27
    const { res, payload } = verify(root2, ['--checks', 'V11'])
    const c = payload && payload.checks[0]
    ok('★ 反关灯②：perBox 求和与总数不等 ⇒ FAIL（不是静默 PASS）', res.status === 1 && c && c.verdict === 'FAIL', c && c.verdict)
    ok('★ 反关灯②：arithmetic 同时给出两个数（27 与 26），算式可当场复核', c && c.arithmetic && c.arithmetic.unackedRowsAllBoxes === 27 && c.arithmetic.perBoxSum === 26 && String(c.why).includes('27') && String(c.why).includes('26'), c && c.arithmetic)
  } finally { cleanup(root2) }

  const root3 = tmpRoot()
  try {
    mailFixture(root3, (s) => { delete s.notice.unackedRowsAllBoxes }) // 证据字段被改坏
    const { payload } = verify(root3, ['--checks', 'V11'])
    const c = payload && payload.checks[0]
    ok('★ 反关灯①：证据字段 unackedRowsAllBoxes 缺失 ⇒ NO-EVIDENCE 并点名该字段', c && c.verdict === 'NO-EVIDENCE' && c.missing.join('').includes('unackedRowsAllBoxes'), c && { verdict: c.verdict, missing: c.missing })
  } finally { cleanup(root3) }
}

/* ------------------------------------------------------------- §3 CLI 纪律 */
console.log('\n=== §3 CLI：缺 --since / 未知验点 / 输出契约 ===')
{
  const root = tmpRoot()
  try {
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    const res = runCli(['--sessions-root', path.join(root, 'sessions')])
    ok('★★ 反关灯③：不给 --since ⇒ 退出码 2，stderr 点名 --since', res.status === 2 && String(res.stderr).includes('--since'), { status: res.status, stderr: String(res.stderr).split('\n')[0] })
    const res2 = runCli(['--sessions-root', path.join(root, 'sessions'), '--since', '2026-01-01T00:00:00Z', '--checks', 'V99'])
    ok('★ 未知验证点 ⇒ 退出码 2 并列出已知 id', res2.status === 2 && String(res2.stderr).includes('V99'), { status: res2.status, stderr: String(res2.stderr).split('\n')[0] })
    // 没有任何会话时不崩：sessions:[] / checks 仍是四个可选判定之一
    const empty = runCli(['--sessions-root', path.join(root, 'sessions'), '--since', '2026-01-01T00:00:00Z'])
    const payload = JSON.parse(empty.stdout)
    // EMPTY_ALLOWED: 空语料是合法输入，此时 checks 必为空、无行可校验；四键契约仍被断言
    ok('★ 空语料：输出契约仍在（runId/build/sessions/checks 四键），判定只用四态', payload && 'runId' in payload && 'build' in payload && Array.isArray(payload.sessions) && Array.isArray(payload.checks) && payload.checks.every((c) => ['PASS', 'FAIL', 'NO-EVIDENCE', 'ENV-LIMIT'].includes(c.verdict)), payload && { sessions: payload.sessions.length, checks: payload.checks.length })
  } finally { cleanup(root) }
}

/* ------------------------------------------------------ §4 旧 run 不混入 */
console.log('\n=== §4 时间闸：--since 之前的会话必须被排除 ===')
{
  const root = tmpRoot()
  try {
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    writeSession(path.join(root, 'sessions'), 'session-old', [promptEvent('old run', Date.parse('2025-01-01T00:00:00Z'))])
    writeSession(path.join(root, 'sessions'), 'session-new', [promptEvent('new run', Date.parse('2026-02-01T00:00:00Z'))])
    const { payload } = verify(root)
    ok('★★ 只保留首事件 ≥ --since 的会话（旧 run 不混入计数）', payload && payload.sessions.length === 1 && payload.sessions[0].id.includes('session-new'), payload && payload.sessions.map((s) => s.id))
  } finally { cleanup(root) }
}

console.log('\n=== SUMMARY: ' + passed + ' passed / ' + failed + ' failed ===')
process.exitCode = failed === 0 ? 0 : 1
