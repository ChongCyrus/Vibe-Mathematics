#!/usr/bin/env node
/**
 * tests/verify-run.test.mjs — 机械核对器自测（TB-2696 立，TB-2714 扩）。
 *
 * 全部样本在 tmpdir 里现场造（不依赖 D:/_tmp 语料，也不联网）；CLI 用真进程跑，退出码就是判据的一部分。
 *
 * TB-2714 修的是「尺子」，所以这里断言的也是「尺子认哪些形状」：
 *   V1  构建自证 = run-metadata.json / driver TARBALL / git HEAD 三处互证（journal 首帧只作加分，
 *       它由驱动在 taskkill 之后 prepend，运行期永远等不到 —— 旧判据因此恒 NO-EVIDENCE）。
 *   V7  投递形状认两层：信封层 VMU_TURN_NO_FENCE、适配器层 VMU_TURN_DELIVERY_SHAPE/NO_PAYLOAD。
 *   V8  parked 认两种具名 code：ALREADY_PARKED（parkedFacts+parkedMeans）与 PARKED_NEEDS_OWNER（parkedReason+parkedFacts）。
 *   V11 未读计数在 vibe_v5_inbox 的 list 回执里（notice.unackedRowsAllBoxes/perBox），不在 vibe_vmu_mailbox（只有 ack）；
 *       ack 减一按「同一成员 perBox 净减」判，不拿全局总数直接减。
 *
 * 反关灯（每条都会把判据本身弄坏，验证它不是摆设）：
 *   ① 改坏一条 PASS 回执里的证据字段名 ⇒ 必须降级为 NO-EVIDENCE 并点名该字段（不许静默 PASS）。
 *   ② perBox 求和与 unackedRowsAllBoxes 不等 ⇒ 必须 FAIL，arithmetic 同时给出两个数。
 *   ③ 不给 --since ⇒ 退出码 2 且 stderr 点名 --since（不许默认扫全量把旧 run 混进来）。
 *   ④ run-metadata 的 build 与 tarballBuild 互相矛盾 ⇒ V1 必须 FAIL（不是 PASS/NO-EVIDENCE）。
 *   ⑤ 形状拒缺解释字段 ⇒ V7 必须 FAIL（code 对了不等于证据合格）。
 *   ⑥ ALREADY_PARKED 缺 parkedMeans/hint ⇒ V8 必须 FAIL。
 *   ⑦ ack 的成员自己的 perBox 没减（减的是别的盒）⇒ V11 必须 NO-EVIDENCE（不许归因给这次 ack）。
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
const FULL = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
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
function receiptEvents(prefix, tool, args, receipt, baseAt) {
  const id = prefix + '-call'
  return [callEvent(id, tool, args, baseAt), resultEvent(id, receipt, baseAt)]
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

/** 用另一份 CLI（反关灯副本）跑同一种夹具：判据被改坏时，同一份语料的读数必须不同。 */
function verifyWith(cliPath, root, extra = []) {
  const out = path.join(root, 'out')
  const res = spawnSync(process.execPath, [cliPath, '--sessions-root', path.join(root, 'sessions'), '--since', '2026-01-01T00:00:00Z', '--out', out, ...extra], { encoding: 'utf8' })
  let payload = null
  try { payload = JSON.parse(fs.readFileSync(path.join(out, 'verify-run.json'), 'utf8')) } catch { payload = null }
  return { res, payload, text: (res.stdout || '') + (res.stderr || '') }
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }) } catch { /* a durable writer may still hold it; the OS tmpdir sweeper handles the rest */ }
}

function writeMetadata(root, fields, name = 'run-metadata.json') {
  const file = path.join(root, name)
  const base = { schema: 'run-metadata/v1', build: HEAD, tarballBuild: HEAD, gitHead: FULL, buildFrom: 'HEAD', dirty: false }
  fs.writeFileSync(file, JSON.stringify({ ...base, ...fields }, null, 2) + '\n')
  return file
}

/* ------------------------------------------------- §1 V1 三处互证（TB-2714） */
console.log('\n=== §1 V1 构建自证：run-metadata / driver TARBALL / git HEAD 三处互证 ===')
{
  // PASS：三处相等且干净。注意会话里刻意不写 build 帧 —— journal 首帧只是加分项，不是判定前提。
  const root = tmpRoot()
  try {
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    writeSession(path.join(root, 'sessions'), 'session-pass', [promptEvent('hello', T0 + 1000)])
    const driver = path.join(root, 'drive.log')
    fs.writeFileSync(driver, 'TARBALL build=' + HEAD + '\nBUILD REV: ' + FULL + '\nSTAMP exit=0\n')
    const meta = writeMetadata(root, {})
    const { res, payload } = verify(root, ['--driver-log', driver, '--run-metadata', meta, '--checks', 'V1'])
    const c = payload && payload.checks[0]
    ok('★★ V1 PASS：三处相等 ⇒ PASS，即使 journal 没有 build 帧（旧判据在此恒 NO-EVIDENCE）', res.status === 0 && c && c.verdict === 'PASS', c && { verdict: c.verdict, why: c.why })
    ok('★★ V1 证据点名三处来源：run-metadata + driver TARBALL + git rev-parse', c && c.evidence.some((e) => String(e.call).includes('metadata:')) && c.evidence.some((e) => e.receiptField === 'TARBALL build') && c.evidence.some((e) => String(e.receiptField).includes('rev-parse')), c && c.evidence.map((e) => e.receiptField))
  } finally { cleanup(root) }

  // PASS（自动定位）：driver 日志里有 "RUN METADATA written: <path>  build=…  gitHead=…" 行 ⇒ 路径只取第一个 token
  const root2 = tmpRoot()
  try {
    fs.mkdirSync(path.join(root2, 'sessions'), { recursive: true })
    writeSession(path.join(root2, 'sessions'), 'session-auto', [promptEvent('hi', T0 + 1000)])
    const meta = writeMetadata(root2, {}, 'run76-metadata.json')
    const driver = path.join(root2, 'drive.log')
    fs.writeFileSync(driver, 'TARBALL build=' + HEAD + '\nRUN METADATA written: ' + meta + '  build=' + HEAD + '  gitHead=' + FULL + '  port=19790\n')
    const { res, payload } = verify(root2, ['--driver-log', driver, '--checks', 'V1'])
    const c = payload && payload.checks[0]
    ok('★★ V1 自动定位：driver 行的路径后面还跟着 build=/gitHead=，不能被整串当路径（实测 run 76 的写法）', res.status === 0 && c && c.verdict === 'PASS', c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root2) }

  // FAIL：run-metadata 内部矛盾（tarballBuild 92bc6d94 vs build 92bc6d95）—— 反关灯④
  const root3 = tmpRoot()
  try {
    fs.mkdirSync(path.join(root3, 'sessions'), { recursive: true })
    writeSession(path.join(root3, 'sessions'), 'session-tampered', [promptEvent('hi', T0 + 1000)])
    const driver = path.join(root3, 'drive.log')
    fs.writeFileSync(driver, 'TARBALL build=' + HEAD + '\n')
    const meta = writeMetadata(root3, { build: 'deadbeef', tarballBuild: 'deadbeef', gitHead: 'c'.repeat(40) })
    const { res, payload } = verify(root3, ['--driver-log', driver, '--run-metadata', meta, '--checks', 'V1'])
    const c = payload && payload.checks[0]
    ok('★★ 反关灯④：run-metadata 与 git HEAD 不等 ⇒ V1 FAIL（给出两个 sha）', res.status === 1 && c && c.verdict === 'FAIL' && String(c.why).includes('deadbeef') && String(c.why).includes(HEAD), c && c.why)
  } finally { cleanup(root3) }

  // ENV-LIMIT：三处相等但 dirty:true
  const root4 = tmpRoot()
  try {
    fs.mkdirSync(path.join(root4, 'sessions'), { recursive: true })
    writeSession(path.join(root4, 'sessions'), 'session-dirty', [promptEvent('hi', T0 + 1000)])
    const driver = path.join(root4, 'drive.log')
    fs.writeFileSync(driver, 'TARBALL build=' + HEAD + '\n')
    const meta = writeMetadata(root4, { dirty: true })
    const { res, payload } = verify(root4, ['--driver-log', driver, '--run-metadata', meta, '--checks', 'V1'])
    const c = payload && payload.checks[0]
    ok('★★ ENV-LIMIT：三处相等但 dirty:true ⇒ ENV-LIMIT（不是 PASS）', res.status === 0 && c && c.verdict === 'ENV-LIMIT', c && c.verdict)
  } finally { cleanup(root4) }

  // NO-EVIDENCE：没有 run-metadata 也没有可解析的 driver 行 ⇒ 点名 + 分类 RUN-DID-NOT-REACH
  const root5 = tmpRoot()
  try {
    fs.mkdirSync(path.join(root5, 'sessions'), { recursive: true })
    writeSession(path.join(root5, 'sessions'), 'session-noev', [promptEvent('hi', T0 + 1000)])
    const driver = path.join(root5, 'drive.log')
    fs.writeFileSync(driver, 'TARBALL build=' + HEAD + '\n')
    const { payload } = verify(root5, ['--driver-log', driver, '--checks', 'V1'])
    const c = payload && payload.checks[0]
    ok('★★ NO-EVIDENCE：缺 run-metadata ⇒ NO-EVIDENCE 并点名，分类 RUN-DID-NOT-REACH（不许默认成产品缺陷）',
      c && c.verdict === 'NO-EVIDENCE' && c.missing.join('').includes('run-metadata') && c.noEvidenceClass === 'RUN-DID-NOT-REACH', c && { verdict: c.verdict, cls: c.noEvidenceClass, missing: c.missing })
  } finally { cleanup(root5) }
}

/* -------------------------------------------------- §2 V11 算术 + 缺字段点名 */
console.log('\n=== §2 V11 未读计数：读 list 的 notice，按成员 perBox 判 ack 减一 ===')
function mailFixture(root, mutate = {}) {
  fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
  const listBefore = { ok: true, action: 'list', count: 27, notice: { unackedRowsAllBoxes: 27, perBox: { 'r-1': 2, 'r-2': 25 } } }
  const listAfter = { ok: true, action: 'list', count: 26, notice: { unackedRowsAllBoxes: 26, perBox: { 'r-1': 2, 'r-2': 24 } } }
  if (mutate.before) mutate.before(listBefore)
  if (mutate.after) mutate.after(listAfter)
  writeSession(path.join(root, 'sessions'), 'session-mail', [
    promptEvent('新到的消息\n[新到的消息]\n【会议预约】… 读后 mailbox ack ml-1', T0 + 1000),
    callEvent('m1', 'vibe_v5_inbox', { action: 'list', member: 'r-2' }, T0 + 1500),
    resultEvent('m1', listBefore, T0 + 1500),
    callEvent('m2', 'vibe_vmu_mailbox', { action: 'ack', member: 'r-2', ids: ['ml-1'] }, T0 + 2500),
    resultEvent('m2', { ok: true, action: 'ack', member: 'r-2', acked: 1, rows: [{ id: 'ml-1' }] }, T0 + 2500),
    callEvent('m3', 'vibe_v5_inbox', { action: 'list', member: 'r-2' }, T0 + 3500),
    resultEvent('m3', listAfter, T0 + 3500),
  ])
}
{
  const root = tmpRoot()
  try {
    mailFixture(root)
    const { payload } = verify(root, ['--checks', 'V11'])
    const c = payload && payload.checks[0]
    ok('★★ V11 PASS：list 的 unackedRowsAllBoxes == sum(perBox)，且被 ack 成员自己的 perBox 净减 1',
      c && c.verdict === 'PASS' && c.arithmetic && c.arithmetic.equal === true && c.arithmetic.unackedRowsAllBoxes === c.arithmetic.perBoxSum, c && { verdict: c.verdict, why: c.why, arithmetic: c.arithmetic })
    ok('★ V11 证据点名工具是 vibe_v5_inbox（不是只有 ack 的 vibe_vmu_mailbox）', c && JSON.stringify(c.evidence).includes('vibe_v5_inbox'), c && c.evidence.map((e) => e.call))
    ok('★ 只跑 --checks V11 ⇒ 输出只有这一个验点', payload && payload.checks.length === 1 && payload.checks[0].id === 'V11', payload && payload.checks.map((x) => x.id))
  } finally { cleanup(root) }

  const root2 = tmpRoot()
  try {
    mailFixture(root2, { before: (s) => { s.notice.perBox = { 'r-1': 2, 'r-2': 24 } } }) // 求和 26 ≠ 27
    const { res, payload } = verify(root2, ['--checks', 'V11'])
    const c = payload && payload.checks[0]
    ok('★★ 反关灯②：perBox 求和与总数不等 ⇒ FAIL（不是静默 PASS）', res.status === 1 && c && c.verdict === 'FAIL', c && c.verdict)
    ok('★ 反关灯②：arithmetic 同时给出两个数（27 与 26），算式可当场复核', c && c.arithmetic && c.arithmetic.unackedRowsAllBoxes === 27 && c.arithmetic.perBoxSum === 26 && String(c.why).includes('27') && String(c.why).includes('26'), c && c.arithmetic)
  } finally { cleanup(root2) }

  const root3 = tmpRoot()
  try {
    mailFixture(root3, { before: (s) => { delete s.notice.unackedRowsAllBoxes } }) // 证据字段被改坏
    const { payload } = verify(root3, ['--checks', 'V11'])
    const c = payload && payload.checks[0]
    ok('★ 反关灯①：证据字段 unackedRowsAllBoxes 缺失 ⇒ NO-EVIDENCE 并点名该字段', c && c.verdict === 'NO-EVIDENCE' && c.missing.join('').includes('unackedRowsAllBoxes'), c && { verdict: c.verdict, missing: c.missing })
  } finally { cleanup(root3) }

  // 反关灯⑦：全局总数确实降了，但降的不是被 ack 成员自己的盒 ⇒ 不许归因给这次 ack
  const root4 = tmpRoot()
  try {
    mailFixture(root4, {
      before: (s) => { s.notice = { unackedRowsAllBoxes: 27, perBox: { 'r-1': 2, 'r-2': 25 } } },
      after: (s) => { s.notice = { unackedRowsAllBoxes: 26, perBox: { 'r-1': 2, 'r-2': 24 } } },
    })
    // 让 ack 的成员是 r-1，而减少的是 r-2 的盒
    const dir = path.join(root4, 'sessions', 'workspace-a', 'session-mail')
    const file = path.join(dir, 'session.v4.jsonl.zstd')
    const body = zlib.zstdDecompressSync(fs.readFileSync(file)).toString('utf8')
    const patched = body.split('\n').map((line) => {
      if (!line.trim()) return line
      const e = JSON.parse(line)
      if (e.type === 'tool/call' && e.data && e.data.name === 'vibe_vmu_mailbox') {
        e.data.arguments = JSON.stringify({ action: 'ack', member: 'r-1', ids: ['ml-1'] })
      }
      return JSON.stringify(e)
    }).join('\n') + '\n'
    fs.writeFileSync(file, zlib.zstdCompressSync(Buffer.from(patched, 'utf8')))
    const { payload } = verify(root4, ['--checks', 'V11'])
    const c = payload && payload.checks[0]
    ok('★★ 反关灯⑦：全局 27→26 但被 ack 成员 r-1 的 perBox 没变 ⇒ NO-EVIDENCE（不许把别盒的新消息算作这次 ack 的减一）',
      c && c.verdict === 'NO-EVIDENCE' && String(c.why).includes('归因') || (c && c.verdict === 'NO-EVIDENCE' && c.missing.join('').includes('perBox')), c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root4) }
}

/* ------------------------------------- §2b V3 成员投递口径（TB-2720 / task-203） */
//
// 这一节补的是「尺子没量生产对象」的另一半：V3 在 TB-2714 里已经按「该回合有没有成员投递」改写了，但这个文件里
// 一条 V3 断言都没有（grep -c V3 = 0）。没有断言 = 将来谁把判据改回旧口径都不会变红。
//
// 夹具刻意复现 RUN 76 的真实形状：真投递回合的顶层 `memberActed:false` 与 `memberToolCalls>0` **并存**（A1 缺陷事实）。
// 旧口径「顶层 memberActed===false 就是归因反了」会把它们读成反例；新口径读 memberToolCalls/memberSession/
// childSessionId/deliveryPath，所以同一份语料必须 PASS —— 这正是灯具要打的位置。
console.log('\n=== §2b V3 所办代跑 vs 成员自跑：认「该回合有没有成员投递」，不认顶层 memberActed ===')
function v3Session(root, turnReceipts, extra = []) {
  fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
  const events = []
  turnReceipts.forEach((r, i) => events.push(...receiptEvents('t' + i, 'vibe_vmu_turn', { op: 'step', member: r.member || 'r-1' }, r, T0 + 1000 + i * 500)))
  events.push(...extra)
  writeSession(path.join(root, 'sessions'), 'session-v3', events)
}
{
  // PASS：三个真投递（activation / continuation / child session）+ 一个 caller 代跑 + 一条 unknown 行来源
  const root = tmpRoot()
  try {
    v3Session(root, [
      // 真投递 ①：activation，等价 RUN 76 的真实形状（顶层 memberActed:false 与 memberToolCalls 并存）
      { ok: true, deliveryPath: 'activation', memberToolCalls: 2, memberActed: false, memberSession: 'sess-member-1' },
      // 真投递 ②：continuation
      { ok: true, deliveryPath: 'continuation', memberToolCalls: 1, memberActed: false, continuation: true },
      // 真投递 ③：child session 也行（TB-2710 的形状）
      { ok: true, childSessionId: 'child-9', memberToolCalls: 3, memberActed: false },
      // 所办代跑：deliveryPath caller、没有成员投递（对照）
      { ok: true, deliveryPath: 'caller', memberActed: false, actedForMember: 'r-1' },
      // unknown 行来源：重建行说不知道谁写的
      { ok: true, deliveryPath: 'unknown', writtenFrom: 'unknown', writtenFromMeans: 'writer could not be named' },
    ])
    const { res, payload } = verify(root, ['--checks', 'V3'])
    const c = payload && payload.checks[0]
    ok('★★ V3 PASS：三个成员投递回合（含顶层 memberActed:false，RUN 76 的真实形状）被认出来，不与 caller 代跑混为一谈',
      res.status === 0 && c && c.verdict === 'PASS', c && { verdict: c.verdict, why: c.why })
    ok('★★ V3 证据点名 deliveryPath（该回合到底走了哪条投递路），不是只数 memberActed',
      c && c.evidence.some((e) => String(e.receiptField || '').includes('deliveryPath')), c && c.evidence.map((e) => e.receiptField))
    ok('★ V3 同时记下 caller 代跑的对照回合数（两类回合可区分，才是这个验点的意义）',
      c && c.evidence.some((e) => String(e.receiptField || '').includes('caller')), c && c.evidence.map((e) => e.receiptField))
    ok('★ 只跑 --checks V3 ⇒ 输出只有这一个验点', payload && payload.checks.length === 1 && payload.checks[0].id === 'V3', payload && payload.checks.map((x) => x.id))
  } finally { cleanup(root) }

  // NO-EVIDENCE：只有 caller 代跑、没有任何成员投递 ⇒ 本轮没走到，不许判成产品缺陷
  const root2 = tmpRoot()
  try {
    v3Session(root2, [
      { ok: true, deliveryPath: 'caller', memberActed: false, actedForMember: 'r-1' },
      { ok: true, deliveryPath: 'caller', memberActed: false, actedForMember: 'r-2' },
    ])
    const { payload } = verify(root2, ['--checks', 'V3'])
    const c = payload && payload.checks[0]
    ok('★★ V3 NO-EVIDENCE：本轮没有任何成员投递 ⇒ 分类 RUN-DID-NOT-REACH（run 没走到，不是产品坏）',
      c && c.verdict === 'NO-EVIDENCE' && c.noEvidenceClass === 'RUN-DID-NOT-REACH', c && { verdict: c.verdict, cls: c.noEvidenceClass, why: c.why })
    ok('★ 且 missing 点名缺的是「有成员投递的回合」，读者知道要等什么证据',
      c && c.missing.join('').includes('成员投递'), c && c.missing)
  } finally { cleanup(root2) }

  // FAIL：行来源键的值不在值域内（writtenFrom 只允许 own-turn/relayed/unknown）
  const root3 = tmpRoot()
  try {
    v3Session(root3, [
      { ok: true, deliveryPath: 'activation', memberToolCalls: 1, memberActed: false },
      { ok: true, writtenFrom: 'guessed', writtenFromMeans: 'made up' },
    ])
    const { res, payload } = verify(root3, ['--checks', 'V3'])
    const c = payload && payload.checks[0]
    ok('★ V3 FAIL：writtenFrom 落在值域外（guessed）⇒ FAIL，点名该键与值域',
      res.status === 1 && c && c.verdict === 'FAIL' && String(c.why).includes('guessed'), c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root3) }

  // 反关灯（B）：把 V3 判据改回旧口径「顶层 memberActed===false 就不算成员投递」，同一份 PASS 夹具必须变红。
  // 灯在 tmpdir 里的 CLI 副本上跑（真文件一个字节都不动）；副本补丁替换不到 ⇒ 这条断言自己先红，灯不许空转。
  const lampRoot = tmpRoot()
  try {
    const lampCli = path.join(lampRoot, 'scripts', 'audit', 'verify-run.mjs')
    fs.mkdirSync(path.dirname(lampCli), { recursive: true })
    const src = fs.readFileSync(CLI, 'utf8')
    const needle = 'const memberDelivery = stepRows.filter((r) => (num(r.receipt.memberToolCalls) || 0) > 0 || (typeof r.receipt.memberSession === \'string\' && r.receipt.memberSession.length > 0) || (typeof r.receipt.childSessionId === \'string\' && r.receipt.childSessionId.length > 0))'
    const oldWay = 'const memberDelivery = stepRows.filter((r) => r.receipt.memberActed !== false && ((num(r.receipt.memberToolCalls) || 0) > 0 || (typeof r.receipt.memberSession === \'string\' && r.receipt.memberSession.length > 0) || (typeof r.receipt.childSessionId === \'string\' && r.receipt.childSessionId.length > 0)))'
    const mutated = src.includes(needle) ? src.split(needle).join(oldWay) : src
    fs.writeFileSync(lampCli, mutated)
    ok('★★ 反关灯（B）灯身就位：CLI 副本真的被改回旧口径（改不到 ⇒ 灯没装好，后续断言无意义）', mutated !== src)
    const root4b = tmpRoot()
    try {
      v3Session(root4b, [
        { ok: true, deliveryPath: 'activation', memberToolCalls: 2, memberActed: false, memberSession: 'sess-member-1' },
        { ok: true, deliveryPath: 'continuation', memberToolCalls: 1, memberActed: false, continuation: true },
        { ok: true, childSessionId: 'child-9', memberToolCalls: 3, memberActed: false },
        { ok: true, deliveryPath: 'caller', memberActed: false, actedForMember: 'r-1' },
      ])
      const { payload } = verifyWith(lampCli, root4b, ['--checks', 'V3'])
      const c = payload && payload.checks[0]
      ok('★★ 反关灯（B）：旧口径把三个真投递回合读成 NO-EVIDENCE ⇒ §2b 的 PASS 断言会变红（灯是真的）',
        c && c.verdict === 'NO-EVIDENCE', c && { verdict: c.verdict, why: c.why })
    } finally { cleanup(root4b) }
  } finally { cleanup(lampRoot) }
}

/* ---------------------------------------- §3 V7 两层形状码 + 解释字段（TB-2714） */
console.log('\n=== §3 V7 投递形状：信封层 NO_FENCE 与适配器层 SHAPE 都认，缺解释字段就 FAIL ===')
function shapeSession(root, receipts) {
  fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
  const events = []
  receipts.forEach((r, i) => {
    const at = T0 + 1000 + i * 1000
    events.push(callEvent('s' + i, 'vibe_vmu_turn', { op: 'step' }, at), resultEvent('s' + i, r, at))
  })
  writeSession(path.join(root, 'sessions'), 'session-shape', events)
}
{
  const root = tmpRoot()
  try {
    shapeSession(root, [{ ok: false, code: 'VMU_TURN_NO_FENCE', replyLength: 39, hadBrace: false, hint: 'wrap the reply in a fenced block' }])
    const { payload } = verify(root, ['--checks', 'V7'])
    const c = payload && payload.checks[0]
    ok('★★ V7 PASS：信封层 VMU_TURN_NO_FENCE + replyLength/hint ⇒ PASS（run 76 的真实形状）', c && c.verdict === 'PASS' && String(c.why).includes('NO_FENCE'), c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root) }

  const root2 = tmpRoot()
  try {
    shapeSession(root2, [{ ok: false, code: 'VMU_TURN_DELIVERY_SHAPE', shape: 'delivery-envelope', keys: ['output'], means: 'x', starts: 1 }])
    const { payload } = verify(root2, ['--checks', 'V7'])
    const c = payload && payload.checks[0]
    ok('★ V7 PASS：适配器层 VMU_TURN_DELIVERY_SHAPE + shape/keys ⇒ PASS', c && c.verdict === 'PASS', c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root2) }

  const root3 = tmpRoot()
  try {
    shapeSession(root3, [{ ok: false, code: 'VMU_TURN_NO_FENCE' }]) // 只有码，没有解释字段
    const { res, payload } = verify(root3, ['--checks', 'V7'])
    const c = payload && payload.checks[0]
    ok('★★ 反关灯⑤：形状拒只有 code、没有 replyLength/hint ⇒ V7 FAIL（码对了不等于证据合格）', res.status === 1 && c && c.verdict === 'FAIL' && String(c.why).includes('解释字段'), c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root3) }

  const root4 = tmpRoot()
  try {
    shapeSession(root4, [
      { ok: false, code: 'VMU_TURN_NO_FENCE', replyLength: 12, hint: 'x' },
      { ok: false, code: 'VMU_ENGINE_UNAVAILABLE', message: 'x' },
    ])
    const { res, payload } = verify(root4, ['--checks', 'V7'])
    const c = payload && payload.checks[0]
    ok('★ 反例：同时出现 VMU_ENGINE_UNAVAILABLE ⇒ V7 FAIL（形状问题被写成引擎不可用）', res.status === 1 && c && c.verdict === 'FAIL' && String(c.why).includes('VMU_ENGINE_UNAVAILABLE'), c && c.why)
  } finally { cleanup(root4) }
}

/* -------------------------------------- §4 V8 两种 parked 码 + 解释字段（TB-2714） */
console.log('\n=== §4 V8 parked：ALREADY_PARKED 与 PARKED_NEEDS_OWNER 都认，各自解释字段要齐 ===')
{
  const root = tmpRoot()
  try {
    shapeSession(root, [{ ok: false, code: 'VMU_TURN_ALREADY_PARKED', parkedFacts: { releaseBy: 'r-1' }, parkedMeans: 'x', hint: 'y' }])
    const { payload } = verify(root, ['--checks', 'V8'])
    const c = payload && payload.checks[0]
    ok('★★ V8 PASS：VMU_TURN_ALREADY_PARKED + parkedFacts/parkedMeans ⇒ PASS（run 76 的真实形状）', c && c.verdict === 'PASS' && String(c.why).includes('ALREADY_PARKED'), c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root) }

  const root2 = tmpRoot()
  try {
    shapeSession(root2, [{ ok: false, code: 'VMU_TURN_PARKED_NEEDS_OWNER', parkedReason: 'reply has no open parked turn', parkedFacts: { x: 1 } }])
    const { payload } = verify(root2, ['--checks', 'V8'])
    const c = payload && payload.checks[0]
    ok('★ V8 PASS：VMU_TURN_PARKED_NEEDS_OWNER + parkedReason/parkedFacts ⇒ PASS', c && c.verdict === 'PASS', c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root2) }

  const root3 = tmpRoot()
  try {
    shapeSession(root3, [{ ok: false, code: 'VMU_TURN_ALREADY_PARKED', parkedFacts: { releaseBy: 'r-1' } }])
    const { res, payload } = verify(root3, ['--checks', 'V8'])
    const c = payload && payload.checks[0]
    ok('★★ 反关灯⑥：ALREADY_PARKED 缺 parkedMeans/hint ⇒ V8 FAIL', res.status === 1 && c && c.verdict === 'FAIL' && String(c.why).includes('parkedMeans'), c && { verdict: c.verdict, why: c.why })
  } finally { cleanup(root3) }

  const root4 = tmpRoot()
  try {
    shapeSession(root4, [{ ok: true, action: 'step' }, { ok: true, action: 'status' }])
    const { payload } = verify(root4, ['--checks', 'V8'])
    const c = payload && payload.checks[0]
    ok('★ 空 parked 反例对照：只有成功回执时 V8 判 NO-EVIDENCE 而不是 PASS（不同码不能被当同证据）',
      c && c.verdict === 'NO-EVIDENCE', c && c.verdict)
  } finally { cleanup(root4) }
}

/* ------------------------------ §5 NO-EVIDENCE 三分类 + 不许 UNCLASSIFIED（TB-2714） */
console.log('\n=== §5 NO-EVIDENCE 按原因三分类：尺子坏 / run 没走到 / 产品沉默 ===')
{
  // PRODUCT-MISSING：论文三态回执有，但 status.liveReadings 的 value 是 null（run 76 的 A3 形状）
  const root = tmpRoot()
  try {
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    const ev = []
    ;['draft', 'reviewing', 'finalized'].forEach((st, i) => {
      ev.push(...receiptEvents('p' + i, 'vibe_v5_paper', { action: i === 0 ? 'start' : 'part' }, { ok: true, action: i === 0 ? 'start' : 'part', paper: { status: st }, final: { complete: st === 'finalized' } }, T0 + 1000 + i * 1000))
    })
    ev.push(...receiptEvents('t1', 'vibe_vmu_turn', { op: 'status' }, {
      ok: true,
      status: {
        liveReadings: {
          paper: { value: 'draft', source: 'paper', atSource: '2026-01-01T00:00:01Z' },
          blueprint: { value: null, source: 'records', atSource: null, why: 'records.mdParse 没有注入' },
          closure: { value: null, source: 'closure', atSource: null },
        },
      },
    }, T0 + 5000))
    writeSession(path.join(root, 'sessions'), 'session-v4', ev)
    const { payload } = verify(root, ['--checks', 'V4'])
    const c = payload && payload.checks[0]
    ok('★★ V4 产品沉默 ⇒ NO-EVIDENCE 分类 PRODUCT-MISSING（不许算成 run 没走到）',
      c && c.verdict === 'NO-EVIDENCE' && c.noEvidenceClass === 'PRODUCT-MISSING', c && { verdict: c.verdict, cls: c.noEvidenceClass, why: c.why })
    ok('★ 分类计数进 payload.noEvidence.byClass，且 UNCLASSIFIED 为 0',
      payload && payload.noEvidence && payload.noEvidence.total === 1 && payload.noEvidence.byClass['PRODUCT-MISSING'] === 1 && payload.noEvidence.byClass['UNCLASSIFIED'] === 0, payload && payload.noEvidence)
  } finally { cleanup(root) }

  // 混跑：V7 无证据（RUN-DID-NOT-REACH）+ V4 产品沉默（PRODUCT-MISSING），两类各计 1，且 stderr 打印分类
  const root2 = tmpRoot()
  try {
    fs.mkdirSync(path.join(root2, 'sessions'), { recursive: true })
    writeSession(path.join(root2, 'sessions'), 'session-mix', [promptEvent('hi', T0 + 1000)])
    const { res, payload } = verify(root2)
    ok('★ 全 NO-EVIDENCE 的一次跑：三类计数出现，且 stderr 有 no-evidence classes 行',
      res.status === 0 && payload && payload.noEvidence && String(res.stderr).includes('no-evidence classes:') && payload.checks.every((c) => c.verdict !== 'NO-EVIDENCE' || c.noEvidenceClass), payload && payload.noEvidence)
  } finally { cleanup(root2) }
}

/* ------------------------------------------------------------- §6 CLI 纪律 */
console.log('\n=== §6 CLI：缺 --since / 未知验点 / 输出契约 ===')
{
  const root = tmpRoot()
  try {
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    const res = runCli(['--sessions-root', path.join(root, 'sessions')])
    ok('★★ 反关灯③：不给 --since ⇒ 退出码 2，stderr 点名 --since', res.status === 2 && String(res.stderr).includes('--since'), { status: res.status, stderr: String(res.stderr).split('\n')[0] })
    const res2 = runCli(['--sessions-root', path.join(root, 'sessions'), '--since', '2026-01-01T00:00:00Z', '--checks', 'V99'])
    ok('★ 未知验证点 ⇒ 退出码 2 并列出已知 id', res2.status === 2 && String(res2.stderr).includes('V99'), { status: res2.status, stderr: String(res2.stderr).split('\n')[0] })
    const empty = runCli(['--sessions-root', path.join(root, 'sessions'), '--since', '2026-01-01T00:00:00Z'])
    const payload = JSON.parse(empty.stdout)
    // EMPTY_ALLOWED: 空语料是合法输入，此时 checks 必为空、无行可校验；四键契约仍被断言
    ok('★ 空语料：输出契约仍在（runId/build/sessions/checks 四键），判定只用四态', payload && 'runId' in payload && 'build' in payload && Array.isArray(payload.sessions) && Array.isArray(payload.checks) && payload.checks.every((c) => ['PASS', 'FAIL', 'NO-EVIDENCE', 'ENV-LIMIT'].includes(c.verdict)), payload && { sessions: payload.sessions.length, checks: payload.checks.length })
  } finally { cleanup(root) }
}

/* ------------------------------------------------------ §7 旧 run 不混入 */
console.log('\n=== §7 时间闸：--since 之前的会话必须被排除 ===')
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
