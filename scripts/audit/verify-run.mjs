#!/usr/bin/env node
/**
 * verify-run.mjs — 真机 run 的机械核对器（TB-2696 / RUN 75 的 V1–V12 入库）
 *
 * 为什么存在：run 75 的 SIM-REPORT 自报 PASS 8 / FAIL 1 / ENV-LIMIT 3，机械核对是 PASS 5 /
 * NO-EVIDENCE 7 / FAIL 0——差在证据不在机制。核对器原先只住在 D:/_tmp，三小时后没人能复核；
 * 这个文件让它对任意一次 run 可重跑。
 *
 * 判定纪律（每条都写进输出，读者不必读码也能复核）：
 *   1. PASS 必须给「工具@会话:时间 + 回执字段=值」的原文；报告自述单独不算证据。
 *   2. 数量类当场算，算式写进 arithmetic（如 memberShare == memberActs/(memberActs+officeRelayedActs)）。
 *   3. 回执缺字段 ⇒ NO-EVIDENCE 并点名缺哪个字段；不写成 PASS，也不写成 FAIL。
 *   4. 环境不具备 ⇒ ENV-LIMIT 并贴原文（如 driver 日志不存在）。
 *
 * 用法：
 *   node scripts/audit/verify-run.mjs --sessions-root <dir> --since <ISO> [--build <sha>]
 *        [--out <file.json|dir>] [--checks V1,V5] [--ws <workspace path>]
 *        [--driver-log <file>] [--run-metadata <file>] [--repo <path>] [--dry-run]
 *
 * --sessions-root 缺省读 DSH_SESSIONS_ROOT；两者都没有 ⇒ 退出码 2 并说明怎么给，绝不 skip。
 * --since 必须显式给（防止把旧 run 混进来）⇒ 缺省退出码 2。
 * 退出码：0 = 没有 FAIL（允许 NO-EVIDENCE / ENV-LIMIT）；1 = 至少一个 FAIL；2 = 用法错误。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt }
const USAGE = [
  'usage: node scripts/audit/verify-run.mjs --sessions-root <dir> --since <ISO> [options]',
  '',
  'required:',
  '  --since <ISO>           只核对首事件 >= 该时刻的会话（必须显式给；混入旧 run 会让判据失真）',
  '  --sessions-root <dir>   journal 根目录；缺省读环境变量 DSH_SESSIONS_ROOT',
  'optional:',
  '  --build <sha>           期望的构建短 sha，与 driver 的 TARBALL build 对账',
  '  --out <file.json|dir>   输出 JSON（.json 文件或目录；目录会写 verify-run.json + verify-run.md）',
  '  --checks V1,V5          只跑列出的验点（未知 id 退出码 2）',
  '  --ws <path>             只读某个工作区的会话目录（缺省扫 sessions-root 下全部工作区）',
  '  --driver-log <file>     run 的 driver 日志（构建自证的第一处）',
  '  --run-metadata <file>   run-metadata.json；缺省从 driver 日志的 "RUN METADATA written:" 行自动定位',
  '  --repo <path>           git 仓库根（缺省本仓库）',
  '  --dry-run               标记「run 可能仍在运行」，全 NO-EVIDENCE 允许',
  '',
  'exit: 0 = 无 FAIL；1 = 至少一个 FAIL；2 = 用法错误',
].join('\n')
if (flag('--help') || flag('-h')) { console.log(USAGE); process.exit(0) }

const SINCE_RAW = opt('--since', null)
if (!SINCE_RAW) {
  console.error('verify-run: --since <ISO> is required: without it an old run can be mixed into this one, and every count becomes a lie.')
  console.error(USAGE)
  process.exit(2)
}
const SINCE = Date.parse(SINCE_RAW)
if (!Number.isFinite(SINCE)) {
  console.error('verify-run: --since is not a parseable time: ' + String(SINCE_RAW))
  process.exit(2)
}
const SESSIONS_ROOT = opt('--sessions-root', process.env.DSH_SESSIONS_ROOT || null)
if (!SESSIONS_ROOT) {
  console.error('verify-run: no session root. Pass --sessions-root <dir> or set DSH_SESSIONS_ROOT to the directory that holds the per-workspace --...-- session folders.')
  console.error(USAGE)
  process.exit(2)
}
if (!fs.existsSync(SESSIONS_ROOT)) {
  console.error('verify-run: --sessions-root does not exist: ' + SESSIONS_ROOT)
  process.exit(2)
}
const CHECKS_ONLY = (() => {
  const v = opt('--checks', null)
  if (!v) return null
  return v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
})()

const DRY = flag('--dry-run')
const OUT = opt('--out', null)
const WS = opt('--ws', null)
const DRIVER_LOG = opt('--driver-log', null)
const REPO = opt('--repo', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'))
const EXPECTED_BUILD = opt('--build', null)
const RUN_METADATA = opt('--run-metadata', null)
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/* ------------------------------------------------------------------ 读取 */

function encodeWorkspace(abs) { return '--' + abs.replace(/:/g, '').replace(/[\\/]/g, '-') + '--' }

function readSessionLines(file) {
  const buf = fs.readFileSync(file)
  const offsets = []
  let pos = 0
  while ((pos = buf.indexOf(ZSTD_MAGIC, pos)) >= 0) { offsets.push(pos); pos += 4 }
  const out = []
  for (let i = 0; i < offsets.length; i++) {
    const end = i + 1 < offsets.length ? offsets[i + 1] : buf.length
    try {
      const text = zlib.zstdDecompressSync(buf.subarray(offsets[i], end)).toString('utf8')
      for (const line of text.split('\n')) if (line.trim()) out.push(line)
    } catch { /* a torn tail frame is normal while the run is in progress */ }
  }
  return out
}

function workspaceDirs() {
  if (WS) return [path.join(SESSIONS_ROOT, encodeWorkspace(WS))]
  const dirs = []
  for (const ent of fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true })) {
    if (ent.isDirectory()) dirs.push(path.join(SESSIONS_ROOT, ent.name))
  }
  return dirs
}

function loadAll() {
  const dir = workspaceDirs().join(path.delimiter)
  const sessions = []
  const receipts = []
  const messages = []
  const metadata = []
  const sessionEvents = []
  const allDirs = workspaceDirs()
  if (!allDirs.some((d) => fs.existsSync(d))) return { sessions, receipts, messages, metadata, sessionEvents, dir }
  for (const wsDir of allDirs) {
  if (!fs.existsSync(wsDir)) continue
  for (const ent of fs.readdirSync(wsDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    const file = path.join(wsDir, ent.name, 'session.v4.jsonl.zstd')
    if (!fs.existsSync(file)) continue
    const raw = readSessionLines(file)
    const events = []
    let firstTime = null
    for (const line of raw) { try { const ev = JSON.parse(line); events.push(ev); if (firstTime === null && ev.time) firstTime = ev.time } catch { } }
    if (firstTime === null || !Number.isFinite(firstTime) || firstTime < SINCE) continue
    const short = ent.name.slice(0, 12)
    const sess = { id: ent.name, short, file, firstTime, events: events.length }
    sessions.push(sess)
    const calls = new Map()
    for (const ev of events) {
      const at = ev.time
      if (ev.type === 'session') {
        const d = ev.data || {}
        metadata.push({ session: short, at, id: sess.id, build: d.build, buildSource: d.buildSource, dirty: d.dirty, keys: Object.keys(d) })
        sessionEvents.push({ session: short, at, data: d })
        continue
      }
      if (ev.type === 'user/message' || ev.type === 'system/message') {
        const content = (ev.data && ev.data.content) || []
        const text = Array.isArray(content) ? content.filter((c) => c && c.type === 'text').map((c) => c.text).join('') : (ev.data && ev.data.text) || ''
        messages.push({ session: short, at, type: ev.type, text })
        continue
      }
      if (ev.type === 'tool/call') {
        const d = ev.data || {}
        if (d.callId && d.name) calls.set(d.callId, { name: d.name, argsRaw: d.arguments, turn: d.turn, step: d.step })
        continue
      }
      if (ev.type !== 'tool/result') continue
      const d = ev.data || {}
      const callId = d.toolCallId || (d.message && d.message.toolCallId)
      const call = callId ? calls.get(callId) : null
      if (!call) continue
      const content = (d.message && d.message.content) || []
      const text = Array.isArray(content) ? content.filter((c) => c && c.type === 'text').map((c) => c.text).join('') : ''
      let receipt = null
      try { receipt = JSON.parse(text) } catch { receipt = null }
      if (!receipt || typeof receipt !== 'object') continue
      let args = null
      try { args = call.argsRaw ? JSON.parse(call.argsRaw) : null } catch { args = { _raw: String(call.argsRaw) } }
      receipts.push({ session: short, at, tool: call.name, args, argsRaw: call.argsRaw, receipt, callId, turn: call.turn, step: call.step })
    }
  }
  }
  sessions.sort((a, b) => a.firstTime - b.firstTime)
  receipts.sort((a, b) => a.at - b.at)
  messages.sort((a, b) => a.at - b.at)
  return { sessions, receipts, messages, metadata, sessionEvents, dir }
}

/* ------------------------------------------------------------- 通用小工具 */

const so = (v, max = 260) => {
  if (v === undefined) return 'undefined'
  if (v === null) return 'null'
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) + '…' : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { const s = JSON.stringify(v); return s.length > max ? s.slice(0, max) + '…' : s } catch { return String(v) }
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const deep = (obj, dotted) => { let cur = obj; for (const k of String(dotted).split('.')) { if (cur === null || cur === undefined) return undefined; cur = cur[k] } return cur }
const mailLine = (r, field) => (r ? `${r.tool}.${field}` : field)
function shortArgs(args) {
  if (args === null || args === undefined) return ''
  const s = typeof args === 'string' ? args : JSON.stringify(args)
  return s.length > 110 ? s.slice(0, 110) + '…' : s
}
function callLabel(r) { return `${r.tool}@${r.session}:${new Date(r.at).toISOString().slice(11, 23)} ${shortArgs(r.args)}` }
function findReceipt(receipts, tool, pred = () => true) { return [...receipts].reverse().find((r) => r.tool === tool && pred(r)) }
function findReceipts(receipts, tool, pred = () => true) { return receipts.filter((r) => r.tool === tool && pred(r)) }
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

function gitRev(short) {
  try {
    const out = execFileSync('git', ['-C', REPO, 'rev-parse', ...(short ? ['--short', 'HEAD'] : ['HEAD'])], { encoding: 'utf8' }).trim()
    return out
  } catch (e) { return null }
}

function readDriverLog(file) {
  if (!file) return { file: null, exists: false, lines: [], build: null, rev: null, stamp: null }
  if (!fs.existsSync(file)) return { file, exists: false, lines: [], build: null, rev: null, stamp: null }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const buildLine = [...lines].reverse().find((l) => /^TARBALL build=/.test(l)) || null
  const revLine = [...lines].reverse().find((l) => /^BUILD REV:/.test(l)) || null
  const stampLine = [...lines].reverse().find((l) => /^STAMP exit=/.test(l)) || null
  const build = buildLine ? (buildLine.match(/TARBALL build=([0-9a-f]+)/) || [, null])[1] : null
  const rev = revLine ? (revLine.match(/BUILD REV:\s*([0-9a-f]{40})/) || [, null])[1] : null
  return { file, exists: true, lines, build, rev, stamp: stampLine }
}

function readRunMetadata(explicit, driverLog) {
  // TB-2714 V1：构建自证的第二处是 run-metadata.json（build/tarballBuild/gitHead/buildFrom/dirty）。
  // 路径显式给优先；否则从 driver 日志的 "RUN METADATA written: <path>" 行解析（相对路径按 driver 日志目录解析）。
  let file = explicit || null
  let fromDriver = false
  if (!file && driverLog && driverLog.exists) {
    const line = [...driverLog.lines].reverse().find((l) => /^RUN METADATA written:/.test(l))
    if (line) {
      // 该行形如 "RUN METADATA written: <path>  build=<sha>  gitHead=<sha> …"：
      // 路径只到第一个双空格之前，后面是 driver 附带的键值对（不能整串当路径）。
      const m = line.match(/RUN METADATA written:\s*(.+)$/)
      if (m && m[1]) {
        const parts = m[1].split(/\s{2,}/)
        file = (parts[0] || '').trim() || null
        fromDriver = true
        if (file && !path.isAbsolute(file) && driverLog.file) file = path.resolve(path.dirname(driverLog.file), file)
      }
    }
  }
  if (!file) return { file: null, exists: false, fromDriver, data: null, build: null, tarballBuild: null, gitHead: null, buildFrom: null, dirty: null, why: 'no --run-metadata and the driver log has no "RUN METADATA written:" line' }
  if (!fs.existsSync(file)) return { file, exists: false, fromDriver, data: null, build: null, tarballBuild: null, gitHead: null, buildFrom: null, dirty: null, why: 'the run metadata file does not exist: ' + file }
  let data = null
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { return { file, exists: true, fromDriver, data: null, build: null, tarballBuild: null, gitHead: null, buildFrom: null, dirty: null, why: 'the run metadata is not parseable JSON: ' + String((e && e.message) || e) } }
  const g = (k) => (data && data[k] !== undefined ? data[k] : null)
  return { file, exists: true, fromDriver, data, build: g('build'), tarballBuild: g('tarballBuild'), gitHead: g('gitHead'), buildFrom: g('buildFrom'), dirty: g('dirty'), why: null }
}

function note(msg) { console.error('[verify] ' + msg) }

/* ---------------------------------------------------------------- 判定骨架 */

const results = []
function record(V, title, expectation, verdict, evidence, why, missing, extra = {}) {
  results.push({ V, title, expectation, verdict, evidence, why, missing: missing || [], ...extra })
}

/* ------------------------------------------------------------------- 加载 */

const data = loadAll()
const { sessions, receipts, messages, metadata } = data
const driver = readDriverLog(DRIVER_LOG)
const runMeta = readRunMetadata(RUN_METADATA, driver)
const gShort = gitRev(true)
const gFull = gitRev(false)
note(`sessions=${sessions.length} receipts=${receipts.length} messages=${messages.length} driver=${driver.exists} git=${gShort}`)
note(`run-metadata=${runMeta.exists ? runMeta.file : 'absent'} build=${so(runMeta.build)} tarballBuild=${so(runMeta.tarballBuild)} gitHead=${so(runMeta.gitHead)}`)
if (DRY) note('DRY-RUN 模式：真机可能仍在运行，回执/提示词可能不全；全 NO-EVIDENCE 是允许的。')

const allTextOf = (r) => { try { return JSON.stringify(r.receipt) } catch { return '' } }
const withPath = (pred) => receipts.filter((r) => { const v = deep(r.receipt, pred); return v !== undefined })
const hasCode = (code) => receipts.filter((r) => r.receipt.code === code)

/* =============================================================== V1 构建自证 */

{
  // TB-2714：原先要求「journal 首帧 = run-metadata」，但该帧是驱动在 taskkill 之后 prepend 的
  // ⇒ 运行期永远 NO-EVIDENCE（RULE-UNREACHABLE）。改成三处互证：
  //   ① run-metadata.json（build / tarballBuild / gitHead / buildFrom / dirty）
  //   ② driver 日志的 TARBALL build=（以及 BUILD REV: 全 sha，若有）
  //   ③ 被核对仓库的 git rev-parse HEAD（短 + 全）
  // 三处全等才 PASS；journal 首帧的 run-metadata 帧只作加分（有就贴，不再作为判定前提）。
  const evidence = []
  const missing = []
  if (runMeta.exists) {
    const tag = 'metadata:' + path.basename(runMeta.file) + (runMeta.fromDriver ? ' (path from driver log)' : '')
    evidence.push({ call: tag, receiptField: 'build', value: so(runMeta.build) })
    evidence.push({ call: tag, receiptField: 'tarballBuild', value: so(runMeta.tarballBuild) })
    evidence.push({ call: tag, receiptField: 'gitHead', value: so(runMeta.gitHead) })
    evidence.push({ call: tag, receiptField: 'buildFrom', value: so(runMeta.buildFrom) })
    evidence.push({ call: tag, receiptField: 'dirty', value: so(runMeta.dirty) })
  } else {
    missing.push('run-metadata.json（' + so(runMeta.why) + '）')
  }
  if (driver.exists) {
    const idx = driver.lines.findIndex((l) => /^TARBALL build=/.test(l))
    if (idx >= 0) evidence.push({ call: 'driver:' + path.basename(driver.file) + ':' + (idx + 1), receiptField: 'TARBALL build', value: driver.build })
    const ridx = driver.lines.findIndex((l) => /^BUILD REV:/.test(l))
    if (ridx >= 0) evidence.push({ call: 'driver:' + path.basename(driver.file) + ':' + (ridx + 1), receiptField: 'BUILD REV', value: driver.rev })
    const midx = driver.lines.findIndex((l) => /^RUN METADATA written:/.test(l))
    if (midx >= 0) evidence.push({ call: 'driver:' + path.basename(driver.file) + ':' + (midx + 1), receiptField: 'RUN METADATA written', value: so(driver.lines[midx], 160) })
  } else missing.push(driver.file ? 'driver 日志 ' + driver.file : 'driver 日志（未提供 --driver-log：构建自证的一处缺失，不是通过）')
  if (gShort) evidence.push({ call: 'git:' + REPO, receiptField: 'rev-parse --short HEAD', value: gShort })
  if (gFull) evidence.push({ call: 'git:' + REPO, receiptField: 'rev-parse HEAD', value: gFull })
  if (EXPECTED_BUILD) evidence.push({ call: 'lead:期望', receiptField: 'build', value: EXPECTED_BUILD })

  // 加分项：journal 首帧若真的带 run-metadata，贴出来（不再作为必要条件）。
  const metaWithBuild = metadata.filter((m) => m.build !== undefined && m.build !== null)
  for (const m of metaWithBuild) {
    evidence.push({ call: 'journal:' + m.session + ':' + new Date(m.at).toISOString(), receiptField: 'session.build (bonus)', value: m.build })
    evidence.push({ call: 'journal:' + m.session + ':' + new Date(m.at).toISOString(), receiptField: 'session.buildSource (bonus)', value: m.buildSource })
    evidence.push({ call: 'journal:' + m.session + ':' + new Date(m.at).toISOString(), receiptField: 'session.dirty (bonus)', value: m.dirty })
  }

  const shortOf = (v) => (v === null || v === undefined ? null : String(v).slice(0, 8))
  let verdict = 'NO-EVIDENCE'
  let why = ''
  let cls = 'RUN-DID-NOT-REACH'
  const bad = []
  if (!runMeta.exists) {
    why = '缺 run-metadata：三处互证的第一处拿不到（' + so(runMeta.why) + '；可用 --run-metadata 显式给，或让 driver 写 RUN METADATA written: 行）。'
    cls = 'RUN-DID-NOT-REACH'
  } else if (!driver.exists) {
    why = '缺 driver 日志：三处互证的第二处拿不到（driver 里的 TARBALL build= 是出包事实）。'
    cls = 'RUN-DID-NOT-REACH'
  } else if (!gShort || !gFull) {
    why = '缺 git HEAD（无法读仓库，第三处拿不到）。'
    cls = 'RUN-DID-NOT-REACH'
  } else {
    if (!runMeta.build) bad.push('run-metadata.build 缺失')
    if (runMeta.tarballBuild && runMeta.build && runMeta.tarballBuild !== runMeta.build) bad.push('run-metadata.tarballBuild=' + runMeta.tarballBuild + ' 与 build=' + runMeta.build + ' 不等（tar 包不是这份元数据出的）')
    if (runMeta.build && shortOf(runMeta.build) !== gShort) bad.push('run-metadata.build=' + runMeta.build + ' 与 git short HEAD=' + gShort + ' 不等')
    if (runMeta.gitHead && runMeta.gitHead !== gFull) bad.push('run-metadata.gitHead=' + runMeta.gitHead + ' 与 git HEAD=' + gFull + ' 不等')
    if (!driver.build) bad.push('driver 日志没有 TARBALL build= 行')
    else if (driver.build !== gShort) bad.push('driver TARBALL build=' + driver.build + ' 与 git short HEAD=' + gShort + ' 不等')
    if (driver.rev && runMeta.gitHead && driver.rev !== runMeta.gitHead) bad.push('driver BUILD REV=' + driver.rev + ' 与 run-metadata.gitHead=' + runMeta.gitHead + ' 不等')
    if (EXPECTED_BUILD && runMeta.build && shortOf(EXPECTED_BUILD) !== shortOf(runMeta.build)) bad.push('期望 build=' + EXPECTED_BUILD + ' 与 run-metadata.build=' + runMeta.build + ' 不等')
    if (bad.length) { verdict = 'FAIL'; why = '三处互证不一致：' + bad.join('；') + '。' }
    else if (runMeta.dirty === true || String(runMeta.buildFrom || '').includes('working-tree')) { verdict = 'ENV-LIMIT'; why = 'run-metadata 报 dirty:true 或 buildFrom=working-tree——构建不是从干净 HEAD 出的，这是环境事实。' }
    else {
      verdict = 'PASS'
      why = '三处相等：run-metadata.build=' + runMeta.build + '（tarballBuild=' + so(runMeta.tarballBuild) + '）、driver TARBALL build=' + driver.build + '、git short HEAD=' + gShort + '；journal 首帧 run-metadata ' + (metaWithBuild.length ? '也落盘了（加分项）。' : '没有落盘（这条只是加分项，不再决定判定）。')
    }
  }
  record('V1', '构建自证（run-metadata / driver TARBALL / git HEAD 三处一致）',
    'run-metadata.json 的 build==tarballBuild==driver TARBALL build==git short HEAD，gitHead==git HEAD；dirty:false；journal 首帧只作加分',
    verdict, evidence, why, missing, { noEvidenceClass: cls, arithmetic: { metadataBuild: runMeta.build, metadataTarball: runMeta.tarballBuild, metadataGitHead: runMeta.gitHead, driverTarball: driver.build, driverRev: driver.rev, gitShort: gShort, gitFull: gFull, dirty: runMeta.dirty } })
}

/* ========================================================= V2 成员/所办占比 */

{
  const statuses = findReceipts(receipts, 'vibe_vmu_turn', (r) => deep(r.receipt, 'status.memberWorkShare'))
  // 读数取"信息量最大"的那条 status：memberActs+officeRelayedActs+unknownActs 最大者（并列取最晚）。
  // 不能盲取最后一条——成员会话在某些时刻读到的 status 可能是 0/0/null（如 d6768c3a 22:10Z）。
  const scoreOf = (r) => {
    const m = r.receipt.status.memberWorkShare
    return (num(m.memberActs) || 0) + (num(m.officeRelayedActs) || 0) + (num(m.unknownActs) || 0)
  }
  const maxScore = statuses.reduce((mx, r) => Math.max(mx, scoreOf(r)), 0)
  const bestStatuses = statuses.filter((r) => scoreOf(r) === maxScore)
  const last = bestStatuses.length ? bestStatuses[bestStatuses.length - 1] : (statuses.length ? statuses[statuses.length - 1] : null)
  const evidence = []
  const missing = []
  let verdict = 'NO-EVIDENCE'
  let why = ''
  if (!last) {
    missing.push('vibe_vmu_turn {op:status} 回执中的 status.memberWorkShare')
    why = '没有任何 status 回执带 memberWorkShare。'
  } else {
    const m = last.receipt.status.memberWorkShare
    const keys = ['memberActs', 'officeRelayedActs', 'unknownActs', 'acts', 'memberShare', 'means']
    for (const k of keys) {
      if (m[k] === undefined) missing.push(`memberWorkShare.${k}`)
      else evidence.push({ call: callLabel(last), receiptField: `status.memberWorkShare.${k}`, value: m[k] })
    }
    const memberActs = num(m.memberActs)
    const relayed = num(m.officeRelayedActs)
    const shown = num(m.memberShare)
    const denom = memberActs !== null && relayed !== null ? memberActs + relayed : null
    const computed = denom && denom > 0 ? Math.round((memberActs / denom) * 10000) / 10000 : null
    if (computed !== null) evidence.push({ call: callLabel(last), receiptField: 'computed memberShare', value: `${memberActs}/(${memberActs}+${relayed})=${computed}` })
    const meta = { memberActs, officeRelayedActs: relayed, memberShare: shown, computed }
    if (missing.length) {
      why = `memberWorkShare 缺键：${missing.join('、')}。`
    } else if (memberActs === 0 && relayed === 0) {
      verdict = 'NO-EVIDENCE'; why = 'memberActs 与 officeRelayedActs 都为 0（memberShare:null 是"无可除"，不是满分也不是零分），本轮还没有形成可判的对比。'
    } else if (!(memberActs > 0) || !(relayed > 0)) {
      missing.push(`officeRelayedActs > 0 的读数（本轮 memberActs=${memberActs}、officeRelayedActs=${relayed}；两侧都 >0 才能核对比率）`)
      why = `对比未成形：memberActs=${memberActs}、officeRelayedActs=${relayed}；任务书要求两侧都 >0 才算"成员自跑 vs 所办代跑"的占比读数被验证。`
    } else if (computed === null || shown === null || Math.abs(computed - shown) > 1e-9) {
      verdict = 'FAIL'; why = `memberShare=${so(shown)} 与回执自己的口径 memberActs/(memberActs+officeRelayedActs)=${computed} 不等。`
    } else {
      verdict = 'PASS'; why = `成员自跑 ${memberActs} 次、所办代跑 ${relayed} 次，memberShare=${shown} 与按回执口径算出的 ${computed} 一致；means 有原文。`
    }
    record('V2', '成员/所办工作量占比（memberWorkShare）',
      '回执带 memberActs>0、officeRelayedActs>0、unknownActs、acts、memberShare(4 位小数)、means；手算 memberShare == memberActs/(memberActs+officeRelayedActs)',
      verdict, evidence, why, missing, { arithmetic: meta, noEvidenceClass: 'RUN-DID-NOT-REACH' })
  }
  if (!last) record('V2', '成员/所办工作量占比（memberWorkShare）',
    '回执带 memberActs>0、officeRelayedActs>0、unknownActs、acts、memberShare(4 位小数)、means；手算 memberShare == memberActs/(memberActs+officeRelayedActs)',
    'NO-EVIDENCE', evidence, why, missing, { noEvidenceClass: 'RUN-DID-NOT-REACH' })
}

/* ================================================= V3 所办代跑 vs 成员自跑 */

{
  // TB-2714：原先用「顶层 memberActed===false」当所办代跑的反例，把 16 个真投递回合读成
  // 「归因反了」（RUN 76 的 A1 产品缺陷：两把尺子在同一回执上并存）。改为读「该回合是否有成员投递」：
  // 成员投递的证据 = memberToolCalls>0 或 memberSession/childSessionId 非空（TB-2710 的新形状），
  // 或 turnReceipts 行的 deliveryPath 是 activation/continuation 这类真投递值。
  const evidence = []
  const missing = []
  const turnReceipts = receipts.filter((r) => r.tool === 'vibe_vmu_turn')
  const stepRows = turnReceipts.filter((r) => r.receipt.memberToolCalls !== undefined || r.receipt.memberSession !== undefined || r.receipt.childSessionId !== undefined || r.receipt.deliveryPath !== undefined)
  const memberDelivery = stepRows.filter((r) => (num(r.receipt.memberToolCalls) || 0) > 0 || (typeof r.receipt.memberSession === 'string' && r.receipt.memberSession.length > 0) || (typeof r.receipt.childSessionId === 'string' && r.receipt.childSessionId.length > 0))
  const callerOnly = stepRows.filter((r) => r.receipt.deliveryPath === 'caller' && !memberDelivery.includes(r))

  if (!stepRows.length) missing.push('带成员投递字段的回执（memberToolCalls / memberSession / childSessionId / deliveryPath）')
  else {
    const sample = memberDelivery.length ? memberDelivery[memberDelivery.length - 1] : stepRows[stepRows.length - 1]
    evidence.push({ call: callLabel(sample), receiptField: 'memberToolCalls', value: so(sample.receipt.memberToolCalls) })
    if (sample.receipt.memberSession !== undefined) evidence.push({ call: callLabel(sample), receiptField: 'memberSession', value: so(sample.receipt.memberSession, 120) })
    if (sample.receipt.childSessionId !== undefined) evidence.push({ call: callLabel(sample), receiptField: 'childSessionId', value: so(sample.receipt.childSessionId, 120) })
    if (sample.receipt.deliveryPath !== undefined) evidence.push({ call: callLabel(sample), receiptField: 'deliveryPath', value: so(sample.receipt.deliveryPath) })
    if (sample.receipt.continuation !== undefined) evidence.push({ call: callLabel(sample), receiptField: 'continuation', value: so(sample.receipt.continuation) })
  }
  if (memberDelivery.length) {
    const m = memberDelivery[memberDelivery.length - 1]
    evidence.push({ call: callLabel(m), receiptField: '有成员投递的回合数', value: memberDelivery.length })
  } else missing.push('有成员投递的回合（memberToolCalls>0 或 memberSession/childSessionId 非空）')
  if (callerOnly.length) evidence.push({ call: callLabel(callerOnly[callerOnly.length - 1]), receiptField: 'deliveryPath === "caller" 的回合数（对照）', value: callerOnly.length })

  // A1 产品缺陷的事实（只记不判红）：同一轮里顶层 memberActed:false 与 status.memberWorkShare.memberActs>0 并存。
  const squares = findReceipts(receipts, 'vibe_vmu_turn', (r) => deep(r.receipt, 'status.memberWorkShare'))
  const shareActs = squares.map((r) => num(deep(r.receipt, 'status.memberWorkShare.memberActs')) || 0)
  const maxShare = shareActs.reduce((a, b) => Math.max(a, b), 0)
  const memberActedFalse = turnReceipts.filter((r) => r.receipt.memberActed === false)
  if (maxShare > 0 && memberActedFalse.length) {
    evidence.push({ call: callLabel(memberActedFalse[memberActedFalse.length - 1]), receiptField: 'memberActed（顶层，A1 缺陷）', value: 'false 与 status.memberWorkShare.memberActs=' + maxShare + ' 并存' })
  }

  // 行来源键（重建行走哪条路）：writtenFrom（own-turn/relayed/unknown），run 75 当时的回执叫 writerSource。
  const writerKeyOf = (r) => (r.receipt.writtenFrom !== undefined ? 'writtenFrom' : (r.receipt.writerSource !== undefined ? 'writerSource' : null))
  const writerRows = receipts.filter((r) => writerKeyOf(r) !== null)
  if (!writerRows.length) missing.push('重建行的行来源键（writtenFrom；run 75 当时的回执叫 writerSource）+ means')
  else {
    const w = writerRows[writerRows.length - 1]
    const k = writerKeyOf(w)
    const means = k === 'writtenFrom' ? w.receipt.writtenFromMeans : w.receipt.writerSourceMeans
    evidence.push({ call: callLabel(w), receiptField: k, value: w.receipt[k] })
    evidence.push({ call: callLabel(w), receiptField: k + 'Means', value: so(means, 120) })
  }
  const writerDomainOf = (r) => (writerKeyOf(r) === 'writtenFrom' ? ['own-turn', 'relayed', 'unknown'] : ['field-argument', 'meta.writer', 'meta.owner', 'member'])
  const badWriter = writerRows.filter((r) => !writerDomainOf(r).includes(r.receipt[writerKeyOf(r)]))

  let verdict = 'NO-EVIDENCE'
  let why = ''
  let cls = 'RUN-DID-NOT-REACH'
  if (!memberDelivery.length) {
    why = '本轮没有任何「成员真的投递过」的回合回执：' + (missing.join('；') || '字段缺失') + '。'
    cls = 'RUN-DID-NOT-REACH'
  } else if (badWriter.length) {
    verdict = 'FAIL'
    why = writerKeyOf(badWriter[badWriter.length - 1]) + '=' + so(badWriter[badWriter.length - 1].receipt[writerKeyOf(badWriter[badWriter.length - 1])]) + ' 不在该键的值域 ' + writerDomainOf(badWriter[badWriter.length - 1]).join('/') + ' 内。'
  } else if (callerOnly.length || maxShare > 0) {
    verdict = 'PASS'
    why = '有成员投递的回合 ' + memberDelivery.length + ' 个（memberToolCalls/memberSession/deliveryPath 互证），与「所办代跑」可区分：' + (callerOnly.length ? '另有 deliveryPath:"caller" 的回合 ' + callerOnly.length + ' 个' : '顶层 memberActed:false 与 status.memberWorkShare.memberActs=' + maxShare + ' 并存（A1 缺陷事实，两把尺子不同源，V3 只记事实）') + '。'
  } else {
    why = '有成员投递的回合，但既没有 caller-only 对照、也没有 memberWorkShare 可交叉，无法证明两类回合可区分。'
    cls = 'RUN-DID-NOT-REACH'
  }
  record('V3', '所办代跑 vs 成员自跑（该回合是否有成员投递）',
    '成员投递的证据来自 memberToolCalls>0 / memberSession / childSessionId / deliveryPath=activation(或 continuation)，而不是顶层 memberActed:false；另需重建行的行来源键 writtenFrom∈{own-turn,relayed,unknown}（或 run 75 的 writerSource）',
    verdict, evidence, why, missing, { noEvidenceClass: cls })
}

/* ===================================== V4 论文三态与状态板（liveReadings） */

{
  const evidence = []
  const missing = []
  const paperReceipts = findReceipts(receipts, 'vibe_v5_paper')
  const start = paperReceipts.find((r) => deep(r.receipt, 'action') === 'start' && r.receipt.ok === true)
  if (!start) missing.push('vibe_v5_paper {action:"start"} 成功回执')
  else evidence.push({ call: callLabel(start), receiptField: 'action/ok', value: 'start/true' })
  const states = []
  for (const r of paperReceipts) {
    const st = deep(r.receipt, 'paper.status')
    if (st && !states.find((s) => s.state === st)) states.push({ state: st, at: r.at, r })
  }
  for (const s of states) evidence.push({ call: callLabel(s.r), receiptField: 'paper.status', value: s.state })
  const finalReceipt = [...paperReceipts].reverse().find((r) => deep(r.receipt, 'final.complete') === true)
  if (finalReceipt) evidence.push({ call: callLabel(finalReceipt), receiptField: 'final.complete', value: true })
  else missing.push('final.complete:true 的回执（论文 finalized）')

  const statusReceipts = findReceipts(receipts, 'vibe_vmu_turn', (r) => deep(r.receipt, 'status.liveReadings'))
  // 取"读数最全"的那条 status（三组里 value 非 null 的个数最多，并列取最晚）：早期 status 早于论文/蓝图/闭题轨时
  // 三组是 null，盲取最后一条会把「读数存在但这一条没读到」误判成「产品不产出」。
  const richnessOf = (r) => ['paper', 'blueprint', 'closure'].filter((g) => { const x = deep(r.receipt, 'status.liveReadings.' + g); return x && x.value !== null && x.value !== undefined }).length
  const lastStatus = statusReceipts.length ? statusReceipts.reduce((best, r) => (richnessOf(r) >= richnessOf(best) ? r : best), statusReceipts[0]) : null
  if (!lastStatus) missing.push('vibe_vmu_turn {op:status} 回执的 status.liveReadings')
  else {
    for (const grp of ['paper', 'blueprint', 'closure']) {
      const g = deep(lastStatus.receipt, `status.liveReadings.${grp}`)
      if (!g) { missing.push(`liveReadings.${grp}`); continue }
      evidence.push({ call: callLabel(lastStatus), receiptField: `liveReadings.${grp}.value`, value: g.value })
      evidence.push({ call: callLabel(lastStatus), receiptField: `liveReadings.${grp}.source`, value: so(g.source, 90) })
      evidence.push({ call: callLabel(lastStatus), receiptField: `liveReadings.${grp}.atSource`, value: g.atSource })
      // 任务书要求三组"给读数"：value 为 null 只表示这条 status 读到"没有内容"，
      // 例如它早于论文轨/蓝图轨/闭题轨时 —— 那不是同值核对通过，而是这一腿缺证据。
      if (g.value === null || g.value === undefined) missing.push(`liveReadings.${grp}.value 非空（实测 null，该 status 早于该轨）`)
      if (g.atSource === null || g.atSource === undefined) missing.push(`liveReadings.${grp}.atSource 非空（实测 null）`)
    }
  }
  // 三态各取一次"下一回合装配文本"（主席席 = r-acad 的 child session 里的 user/message）
  let chairmanSession = null
  for (const r of statusReceipts) {
    const ms = deep(r.receipt, 'status.memberSessions')
    if (ms && ms['r-acad']) chairmanSession = ms['r-acad']
  }
  const asm = []
  if (chairmanSession) {
    const chat = messages.filter((m) => m.session.startsWith(String(chairmanSession).slice(0, 12)) && m.type === 'user/message')
    for (const s of states) {
      const next = chat.find((m) => m.at > s.at)
      if (next) asm.push({ state: s.state, at: next.at, sha: sha256(next.text), chars: next.text.length })
    }
  }
  for (const a of asm) evidence.push({ call: `journal:${String(chairmanSession).slice(0, 12)}:${new Date(a.at).toISOString()}`, receiptField: `assemblyText(${a.state}).sha256`, value: a.sha.slice(0, 16) + '…' })
  const sHas = new Set(asm.map((a) => a.sha))
  const allStates = states.map((s) => s.state)
  const evidenceOk = start && finalReceipt && allStates.includes('reviewing') && allStates.some((s) => /final/.test(s)) && allStates.some((s) => /writ|draft/.test(s))
  let verdict = 'NO-EVIDENCE'
  let why = ''
  let cls = 'RUN-DID-NOT-REACH'
  if (!start) why = '缺论文 start 回执。'
  else if (!finalReceipt) why = '没看到 final.complete:true（论文未到 finalized）。'
  else if (!lastStatus) why = '缺 status.liveReadings（状态板同值无法核对）。'
  else if (missing.length) {
    // 状态回执在、但三组读数是 null/缺键 ⇒ 产品该给读数却没给（RUN 76 的 A3：blueprint.value=null，why="records.mdParse 没有注入"）。
    why = `缺：${missing.join('；')}。`
    cls = 'PRODUCT-MISSING'
  }
  else if (asm.length < 3) why = `三态中只取到 ${asm.length} 份装配文本（需要三个状态各一份）。`
  else if (sHas.size < 3) { verdict = 'FAIL'; why = `三份装配文本的 sha256 只有 ${sHas.size} 个不同值（要求三份互异）。` }
  else if (!evidenceOk) why = `状态序列未覆盖 draft/writing→reviewing→finalized：实测 ${allStates.join('→')}。`
  else { verdict = 'PASS'; why = `论文三态 ${allStates.join('→')} 均出现；三份装配文本 sha 互异（${[...sHas].map((h) => h.slice(0, 8)).join('/')}）；state block 的 paper/blueprint/closure 三组都带 source+atSource。` }
  record('V4', '论文三态推进 + 每态下一回合装配文本 sha 互异 + 状态板三组读数',
    'paper start 后经 part/review 推进 draft→reviewing→finalized；每态主席席取一次装配文本并算 sha256（三份互异）；状态板 paper/blueprint/closure 带 source+atSource；turn.status() 的 liveReadings 同值',
    verdict, evidence, why, missing, { arithmetic: { assembly: asm.map((a) => ({ state: a.state, sha256: a.sha })), states: allStates }, noEvidenceClass: cls })
}

/* ================================================== V5 论文渲染/定稿回执 */

{
  const evidence = []
  const missing = []
  const paperReceipts = findReceipts(receipts, 'vibe_v5_paper')
  const renderReceipts = paperReceipts.filter((r) => r.receipt.action === 'render')
  const finals = paperReceipts.filter((r) => r.receipt.action === 'final')
  const compile = paperReceipts.filter((r) => r.receipt.action === 'compile')
  const render = renderReceipts.length ? renderReceipts[renderReceipts.length - 1] : null
  const fin = finals.length ? finals[finals.length - 1] : null
  if (!render) missing.push('vibe_v5_paper {action:"render"} 回执')
  else {
    evidence.push({ call: callLabel(render), receiptField: 'renderOk', value: render.receipt.renderOk })
    evidence.push({ call: callLabel(render), receiptField: 'renderOkMeans', value: so(render.receipt.renderOkMeans, 120) })
    evidence.push({ call: callLabel(render), receiptField: 'ok/complete', value: `${so(render.receipt.ok)}/${so(render.receipt.complete)}` })
  }
  for (const c of compile) evidence.push({ call: callLabel(c), receiptField: 'latexAvailable', value: c.receipt.latexAvailable })
  if (!fin) missing.push('vibe_v5_paper {action:"final"} 回执')
  else {
    evidence.push({ call: callLabel(fin), receiptField: 'ok/complete', value: `${so(fin.receipt.ok)}/${so(fin.receipt.complete)}` })
    evidence.push({ call: callLabel(fin), receiptField: 'final.complete', value: deep(fin.receipt, 'final.complete') })
    evidence.push({ call: callLabel(fin), receiptField: 'final.pdf.pdfBytes', value: deep(fin.receipt, 'final.pdf.pdfBytes') })
    evidence.push({ call: callLabel(fin), receiptField: 'final.toolchainAbsent', value: deep(fin.receipt, 'final.toolchainAbsent') })
  }
  let verdict = 'NO-EVIDENCE'
  let why = ''
  const okWithCode = paperReceipts.filter((r) => r.receipt.ok === true && typeof r.receipt.code === 'string')
  if (okWithCode.length) {
    verdict = 'FAIL'
    why = `ok:true 的回执同时带 code=${so(okWithCode[0].receipt.code)}（${callLabel(okWithCode[0])}）——按任务书「ok:true 不得同时带 code」是产品缺陷。`
    evidence.push({ call: callLabel(okWithCode[0]), receiptField: 'ok+code', value: `true+${okWithCode[0].receipt.code}` })
  } else if (!render) why = '缺 render 回执：无法核对 renderOk/renderOkMeans。'
  else if (!fin) why = '缺 final 回执：无法核对 ok/complete/means。'
  else if (fin.receipt.ok === true && fin.receipt.code) { verdict = 'FAIL'; why = `final 回执 ok:true 但同时带 code=${so(fin.receipt.code)}（按任务书是产品缺陷）。` }
  else if (typeof render.receipt.renderOk !== 'boolean' || !render.receipt.renderOkMeans) why = 'render 回执缺 renderOk 或 renderOkMeans。'
  else if (deep(fin.receipt, 'final.complete') !== true) { verdict = 'FAIL'; why = `final.complete=${so(deep(fin.receipt, 'final.complete'))}，定稿没有完成。` }
  else {
    verdict = 'PASS'
    why = `final 回执 ok:true、final.complete:true、pdfBytes=${so(deep(fin.receipt, 'final.pdf.pdfBytes'))}；render 回执 renderOk=${render.receipt.renderOk} 带 renderOkMeans；本环境 latexAvailable=${so(compile.length ? compile[compile.length - 1].receipt.latexAvailable : null)}，无"必须具名拒"的缺 LaTeX 场景（ENV 有 LaTeX，不是 LIMIT）。`
  }
  record('V5', '论文渲染/定稿回执（ok/complete/means + renderOk/renderOkMeans）',
    'final 回执 ok/complete/means；render 回执 renderOk+renderOkMeans；无 LaTeX 时应具名拒并给 reachable hint 或 toolchainAbsent；ok:true 不得同时带 code',
    verdict, evidence, why, missing)
}

/* ================================================== V6 具名拒 + 可达替代 */

{
  const evidence = []
  const missing = []
  const refusals = receipts.filter((r) => typeof r.receipt.code === 'string' && typeof r.receipt.hint === 'string' && r.receipt.hint.includes('REACHABLE INSTEAD:'))
  const picked = refusals.length ? refusals[refusals.length - 1] : null
  if (!picked) missing.push('带 code + hint 含 "REACHABLE INSTEAD:" 的回执')
  else {
    evidence.push({ call: callLabel(picked), receiptField: 'code', value: picked.receipt.code })
    evidence.push({ call: callLabel(picked), receiptField: 'hint', value: so(picked.receipt.hint, 220) })
    const names = String(picked.receipt.hint).match(/vibe_[a-z0-9_]+/g) || []
    const toolNames = [...new Set(names)]
    const reachable = toolNames.length ? receipts.find((r) => r.at > picked.at && toolNames.includes(r.tool) && r.receipt.ok === true) : null
    if (reachable) evidence.push({ call: callLabel(reachable), receiptField: 'ok（hint 点名的工具被真调用）', value: true })
    else missing.push(`hint 点名的可达工具（hint 中工具名：${toolNames.join(',') || '无'}）的后续成功调用`)
    // 逐字重放：同 tool + 同 argsRaw，第二次不得同码拒
    const repeats = receipts.filter((r) => r.at > picked.at && r.tool === picked.tool && r.argsRaw === picked.argsRaw)
    if (repeats.length) {
      evidence.push({ call: callLabel(repeats[0]), receiptField: 'code（逐字重放）', value: repeats[0].receipt.code || 'ok' })
      if (repeats[0].receipt.code === picked.receipt.code) { record('V6', '具名拒 + 可达替代', 'code+hint 含 REACHABLE INSTEAD:+真工具+真参数；逐字第二次不得同码拒', 'FAIL', evidence, '逐字重放同一调用仍被同一 code 拒。', missing); }
    }
    if (!results.find((x) => x.V === 'V6')) {
      let verdict = 'NO-EVIDENCE'
      let why = ''
      if (!reachable) why = `hint 点名的工具未被真调用成功（缺：${missing.join('；')}）。`
      else { verdict = 'PASS'; why = `具名拒 code=${picked.receipt.code}，hint 给 REACHABLE INSTEAD: 且点名的 ${reachable.tool} 在之后被真调用并 ok:true${repeats.length ? `；逐字重放第二次回执 code=${so(repeats[0].receipt.code)}` : '；未发现逐字重放'}。` }
      record('V6', '具名拒 + 可达替代（hint 真能走通）', 'code+hint 含 REACHABLE INSTEAD:+真工具+真参数；逐字第二次不得同码拒', verdict, evidence, why, missing)
    }
  }
  if (!results.find((x) => x.V === 'V6')) record('V6', '具名拒 + 可达替代（hint 真能走通）', 'code+hint 含 REACHABLE INSTEAD:+真工具+真参数；逐字第二次不得同码拒', 'NO-EVIDENCE', evidence, `缺：${missing.join('；')}。`, missing)
}


/* ============================================ V7 投递形状：具名种类不是引擎不可用 */

{
  // TB-2714：裸散文交付在信封层被判 VMU_TURN_NO_FENCE（replyLength/hadBrace 给原文），
  // 适配器边界才是 VMU_TURN_DELIVERY_SHAPE / NO_PAYLOAD（shape/keys/means 给解释）。
  // 两层都是「具名形状拒」，同一判据要认任一命中，且必须带解释字段。
  const evidence = []
  const missing = []
  const envelope = receipts.filter((r) => r.receipt.code === 'VMU_TURN_NO_FENCE')
  const adapter = receipts.filter((r) => ['VMU_TURN_DELIVERY_SHAPE', 'VMU_TURN_DELIVERY_NO_PAYLOAD'].includes(r.receipt.code))
  const engine = receipts.filter((r) => r.receipt.code === 'VMU_ENGINE_UNAVAILABLE')
  const explainedEnvelope = (r) => num(r.receipt.replyLength) !== null || typeof r.receipt.replyExcerpt === 'string' || typeof r.receipt.hint === 'string'
  const explainedAdapter = (r) => typeof r.receipt.shape === 'string' || Array.isArray(r.receipt.keys) || typeof r.receipt.hint === 'string' || typeof r.receipt.means === 'string'
  for (const r of envelope) {
    evidence.push({ call: callLabel(r), receiptField: 'code（信封层）', value: r.receipt.code })
    if (r.receipt.replyLength !== undefined) evidence.push({ call: callLabel(r), receiptField: 'replyLength', value: so(r.receipt.replyLength) })
    if (r.receipt.hadBrace !== undefined) evidence.push({ call: callLabel(r), receiptField: 'hadBrace', value: so(r.receipt.hadBrace) })
    if (r.receipt.hint) evidence.push({ call: callLabel(r), receiptField: 'hint', value: so(r.receipt.hint, 160) })
  }
  for (const r of adapter) {
    evidence.push({ call: callLabel(r), receiptField: 'code（适配器层）', value: r.receipt.code })
    if (r.receipt.shape !== undefined) evidence.push({ call: callLabel(r), receiptField: 'shape', value: so(r.receipt.shape) })
    if (r.receipt.starts !== undefined) evidence.push({ call: callLabel(r), receiptField: 'starts', value: so(r.receipt.starts) })
    if (r.receipt.hint) evidence.push({ call: callLabel(r), receiptField: 'hint', value: so(r.receipt.hint, 160) })
  }
  for (const r of engine) evidence.push({ call: callLabel(r), receiptField: 'code（反例）', value: r.receipt.code })
  let verdict = 'NO-EVIDENCE'
  let why = ''
  let cls = 'RUN-DID-NOT-REACH'
  if (engine.length) { verdict = 'FAIL'; why = '出现 VMU_ENGINE_UNAVAILABLE（' + engine.map((r) => callLabel(r)).join('、') + '）——投递形状问题被写成引擎不可用。' }
  else if (!envelope.length && !adapter.length) { missing.push('code 为 VMU_TURN_NO_FENCE（信封层）或 VMU_TURN_DELIVERY_SHAPE / NO_PAYLOAD（适配器层）的投递形状拒回执（本轮 0 条）'); why = '本轮回执里没有信封层或适配器层的投递形状拒。'; cls = 'RUN-DID-NOT-REACH' }
  else {
    const unexplained = envelope.filter((r) => !explainedEnvelope(r)).concat(adapter.filter((r) => !explainedAdapter(r)))
    if (unexplained.length) { verdict = 'FAIL'; why = '形状拒缺解释字段（信封层要 replyLength/replyExcerpt/hint，适配器层要 shape/keys/means/hint）：' + unexplained.map((r) => callLabel(r)).join('、') + '。' }
    else if (adapter.some((r) => typeof r.receipt.starts === 'number' && r.receipt.starts > 1)) { verdict = 'FAIL'; why = '投递形状回执 starts>1（语义只该起一次）。' }
    else { verdict = 'PASS'; why = '具名形状拒出现（' + [envelope.length ? '信封层 ' + envelope.length + ' 条 VMU_TURN_NO_FENCE' : null, adapter.length ? '适配器层 ' + adapter.length + ' 条 ' + adapter.map((r) => r.receipt.code).join('/') : null].filter(Boolean).join('；') + '），均带解释字段，且全文没有 VMU_ENGINE_UNAVAILABLE。' }
  }
  record('V7', '投递形状具名拒（信封层或适配器层，不是引擎不可用）',
    'code 为"VMU_TURN_NO_FENCE"（信封层，带 replyLength/hint）或"VMU_TURN_DELIVERY_SHAPE"/"VMU_TURN_DELIVERY_NO_PAYLOAD"（适配器层，带 shape/keys/means）；不得是 VMU_ENGINE_UNAVAILABLE；starts≤1',
    verdict, evidence, why, missing, { noEvidenceClass: cls })
}

/* ================================================== V8 parked 停放回执 */

{
  // TB-2714：parked 有两种具名拒，两个名字对应两种事实：
  //   VMU_TURN_ALREADY_PARKED        —— 同席再派：parkedFacts（releaseBy 等）+ parkedMeans/hint
  //   VMU_TURN_PARKED_NEEDS_OWNER    —— reply 无可答 parked / turn 已关：parkedReason + parkedFacts
  // 判据认任一命中，并要求该层自带的解释字段齐全（缺字段 = FAIL，不是 PASS）。
  const evidence = []
  const missing = []
  const owner = receipts.filter((r) => r.receipt.code === 'VMU_TURN_PARKED_NEEDS_OWNER')
  const already = receipts.filter((r) => r.receipt.code === 'VMU_TURN_ALREADY_PARKED')
  const hasFacts = (r) => r.receipt.parkedFacts !== undefined && r.receipt.parkedFacts !== null && (typeof r.receipt.parkedFacts !== 'string' || r.receipt.parkedFacts.length > 0)
  for (const r of owner) {
    evidence.push({ call: callLabel(r), receiptField: 'code（需所有者）', value: r.receipt.code })
    evidence.push({ call: callLabel(r), receiptField: 'parkedReason', value: so(r.receipt.parkedReason, 160) })
    evidence.push({ call: callLabel(r), receiptField: 'parkedFacts', value: so(r.receipt.parkedFacts, 200) })
  }
  for (const r of already) {
    evidence.push({ call: callLabel(r), receiptField: 'code（已停放）', value: r.receipt.code })
    evidence.push({ call: callLabel(r), receiptField: 'parkedFacts', value: so(r.receipt.parkedFacts, 200) })
    evidence.push({ call: callLabel(r), receiptField: 'parkedMeans', value: so(r.receipt.parkedMeans, 160) })
    if (r.receipt.hint) evidence.push({ call: callLabel(r), receiptField: 'hint', value: so(r.receipt.hint, 160) })
  }
  let verdict = 'NO-EVIDENCE'
  let why = ''
  let cls = 'RUN-DID-NOT-REACH'
  if (!owner.length && !already.length) { missing.push('code 为"VMU_TURN_ALREADY_PARKED"或"VMU_TURN_PARKED_NEEDS_OWNER"的 parked 回执'); why = '本轮没有 parked 回执（两种具名 code 都没出现）。'; cls = 'RUN-DID-NOT-REACH' }
  else {
    const badOwner = owner.filter((r) => !r.receipt.parkedReason || typeof r.receipt.parkedReason !== 'string' || !hasFacts(r))
    const badAlready = already.filter((r) => !hasFacts(r) || !(typeof r.receipt.parkedMeans === 'string' || typeof r.receipt.hint === 'string'))
    if (badOwner.length) { verdict = 'FAIL'; why = 'VMU_TURN_PARKED_NEEDS_OWNER 回执缺非空 parkedReason 或 parkedFacts（' + badOwner.map((r) => callLabel(r)).join('、') + '）。' }
    else if (badAlready.length) { verdict = 'FAIL'; why = 'VMU_TURN_ALREADY_PARKED 回执缺 parkedFacts 或 parkedMeans/hint（' + badAlready.map((r) => callLabel(r)).join('、') + '）。' }
    else { verdict = 'PASS'; why = 'parked 拒出现 ' + (owner.length ? owner.length + ' 条 VMU_TURN_PARKED_NEEDS_OWNER（parkedReason+parkedFacts）' : '') + (owner.length && already.length ? '、' : '') + (already.length ? already.length + ' 条 VMU_TURN_ALREADY_PARKED（parkedFacts+parkedMeans）' : '') + '，解释字段齐全。' }
  }
  record('V8', 'parked 停放：两种具名 code + 各自原因/处置建议',
    'code 为"VMU_TURN_ALREADY_PARKED"（同席再派，parkedFacts+parkedMeans）或"VMU_TURN_PARKED_NEEDS_OWNER"（reply 无可答 parked，parkedReason+parkedFacts）；解释字段缺一即 FAIL',
    verdict, evidence, why, missing, { noEvidenceClass: cls })
}

/* ================================================== V9 孤儿 abandon 收尾 */

{
  const evidence = []
  const missing = []
  const abandons = receipts.filter((r) => deep(r.receipt, 'settledBy') === 'abandoned-orphan')
  for (const r of abandons) {
    evidence.push({ call: callLabel(r), receiptField: 'ok/settledBy', value: `${so(r.receipt.ok)}/${so(r.receipt.settledBy)}` })
    evidence.push({ call: callLabel(r), receiptField: 'orphan', value: r.receipt.orphan })
    const rowStatus = deep(r.receipt, 'turnRow.status')
    evidence.push({ call: callLabel(r), receiptField: 'turnRow.status', value: rowStatus })
  }
  const after = abandons.length ? receipts.filter((r) => r.at > abandons[abandons.length - 1].at && r.tool === 'vibe_vmu_turn') : []
  const reentrant = after.filter((r) => r.receipt.code === 'VMU_TURN_REENTRANT')
  for (const r of after.slice(-2)) evidence.push({ call: callLabel(r), receiptField: `code（abandon 之后的 turn 调用）`, value: r.receipt.code || 'ok' })
  let verdict = 'NO-EVIDENCE'
  let why = ''
  if (!abandons.length) { missing.push('settledBy:"abandoned-orphan" 的 abandon 回执'); why = '本轮还没有孤儿 abandon 回执。' }
  else {
    const last = abandons[abandons.length - 1]
    if (last.receipt.ok !== true || last.receipt.orphan !== true) { verdict = 'FAIL'; why = 'abandon 回执不是 ok:true + orphan:true。' }
    else if (deep(last.receipt, 'turnRow.status') !== 'abandoned') { verdict = 'FAIL'; why = `turnRow.status=${so(deep(last.receipt, 'turnRow.status'))}，不是 abandoned。` }
    else if (reentrant.length) { verdict = 'FAIL'; why = `abandon 之后仍出现 VMU_TURN_REENTRANT（${reentrant.length} 次）。` }
    else { verdict = 'PASS'; why = `abandon 回执 ok:true、settledBy:"abandoned-orphan"、orphan:true、turnRow.status:"abandoned"；之后 ${after.length} 次 turn 调用均无 VMU_TURN_REENTRANT。` }
  }
  record('V9', '孤儿 abandon 收尾（行状态 + 之后不再 reentrant）', 'ok:true、settledBy:"abandoned-orphan"、orphan:true、turnRow.status:"abandoned"；之后 step 无 VMU_TURN_REENTRANT', verdict, evidence, why, missing)
}

/* ====================================== V10 构造后申报 pack：具名 TOO_LATE */

{
  const evidence = []
  const missing = []
  const tooLate = hasCode('VMU_PACK_DECLARATION_TOO_LATE')
  for (const r of tooLate) {
    evidence.push({ call: callLabel(r), receiptField: 'code', value: r.receipt.code })
    evidence.push({ call: callLabel(r), receiptField: 'hint', value: so(r.receipt.hint, 220) })
    evidence.push({ call: callLabel(r), receiptField: 'facts.declaredAt', value: deep(r.receipt, 'facts.declaredAt') })
    evidence.push({ call: callLabel(r), receiptField: 'facts.key', value: deep(r.receipt, 'facts.key') })
  }
  let verdict = 'NO-EVIDENCE'
  let why = ''
  if (!tooLate.length) { missing.push('code:"VMU_PACK_DECLARATION_TOO_LATE" 的回执'); why = '本轮还没有构造后申报 pack 的回执。' }
  else {
    const bad = tooLate.find((r) => !String(r.receipt.hint || '').includes('REACHABLE INSTEAD:') || !String(r.receipt.hint || '').includes('config.packManifests') || !deep(r.receipt, 'facts.declaredAt'))
    if (bad) {
      verdict = 'FAIL'
      why = `TOO_LATE 回执缺三件之一：hint 里没有 "REACHABLE INSTEAD:" 或没有 "config.packManifests"，或 facts.declaredAt 不存在（回执 ${callLabel(bad)}）。`
      missing.push('hint 的 REACHABLE INSTEAD:/config.packManifests 或 facts.declaredAt')
    } else {
      verdict = 'PASS'
      why = `构造后申报被具名拒 code=VMU_PACK_DECLARATION_TOO_LATE；hint 同时有 "REACHABLE INSTEAD:" 与 config.packManifests；facts.declaredAt=${so(deep(tooLate[0].receipt, 'facts.declaredAt'))}；facts.key=${so(deep(tooLate[0].receipt, 'facts.key'))}。`
    }
  }
  record('V10', '构造后申报 pack 键：具名 TOO_LATE + 可达替代', 'code:"VMU_PACK_DECLARATION_TOO_LATE"；hint 有 REACHABLE INSTEAD:+config.packManifests；facts.declaredAt 存在', verdict, evidence, why, missing)
}

/* ==================================== V11 回合通知：字面头 + 计数恒等 + ack 减一 */

{
  // TB-2714：unackedRowsAllBoxes / perBox 只出现在 vibe_v5_inbox 的 action:"list" 回执里
  // （vibe_vmu_mailbox 只有 action:"ack"，没有 status 形状）⇒ 原判据读错工具，永远 NO-EVIDENCE。
  const evidence = []
  const missing = []
  const notices = messages.filter((m) => m.type === 'user/message' && m.text.includes('[新到的消息]'))
  if (!notices.length) missing.push('下一回合提示词里的字面 "[新到的消息]"')
  else {
    const n = notices[notices.length - 1]
    const line = n.text.split('\n').find((l) => l.includes('[新到的消息]')) || n.text.slice(0, 80)
    evidence.push({ call: 'journal:' + n.session + ':' + new Date(n.at).toISOString(), receiptField: 'prompt 首行', value: line.slice(0, 120) })
    evidence.push({ call: 'journal:' + n.session + ':' + new Date(n.at).toISOString(), receiptField: 'notice 行数', value: (n.text.match(/读后 mailbox ack /g) || []).length })
  }

  // 计数恒等：list 回执的 notice.unackedRowsAllBoxes == sum(notice.perBox)，每一条都算（一条矛盾读数本身就是 FAIL 证据）。
  const mailLists = findReceipts(receipts, 'vibe_v5_inbox', (r) => r.receipt.action === 'list')
  let arithmetic = null
  const readings = []
  let firstBad = null
  let firstMissing = null
  for (const r of mailLists) {
    const total = deep(r.receipt, 'notice.unackedRowsAllBoxes')
    const perBox = deep(r.receipt, 'notice.perBox')
    if (total === undefined || perBox === undefined) {
      if (!firstMissing) firstMissing = { r, fields: [total === undefined ? 'notice.unackedRowsAllBoxes' : null, perBox === undefined ? 'notice.perBox' : null].filter(Boolean) }
      continue
    }
    const sum = Object.values(perBox).reduce((a, b) => a + (num(b) || 0), 0)
    const reading = { status: callLabel(r), unackedRowsAllBoxes: total, perBox, perBoxSum: sum, equal: num(total) === sum, at: r.at }
    readings.push(reading)
    if (!reading.equal && !firstBad) firstBad = reading
  }
  if (!mailLists.length) missing.push('vibe_v5_inbox 的 action:"list" 回执（notice.unackedRowsAllBoxes / notice.perBox 只在这里）')
  if (firstMissing) for (const f of firstMissing.fields) missing.push(f + '（' + callLabel(firstMissing.r) + ' 的 list 回执里没有这个字段）')
  if (readings.length) {
    const chosen = firstBad || readings[readings.length - 1]
    arithmetic = { source: 'vibe_v5_inbox list notice', status: chosen.status, unackedRowsAllBoxes: chosen.unackedRowsAllBoxes, perBox: chosen.perBox, perBoxSum: chosen.perBoxSum, equal: chosen.equal, readings: readings.map((x) => ({ status: x.status, unackedRowsAllBoxes: x.unackedRowsAllBoxes, perBox: x.perBox, perBoxSum: x.perBoxSum, equal: x.equal })) }
    for (const r of readings.slice(-2)) {
      evidence.push({ call: r.status, receiptField: 'notice.unackedRowsAllBoxes', value: r.unackedRowsAllBoxes })
      evidence.push({ call: r.status, receiptField: 'sum(notice.perBox)', value: r.perBoxSum + ' (' + Object.entries(r.perBox).map(([k, v]) => k + ':' + v).join(', ') + ')' })
    }
    if (firstBad) missing.push('perBox 求和 == unackedRowsAllBoxes（' + firstBad.status + ' 上 unackedRowsAllBoxes=' + firstBad.unackedRowsAllBoxes + ' 与 perBox 求和=' + firstBad.perBoxSum + ' 不等）')
  }

  // ack 减一：按「同一成员 perBox 的净减 k」判，不拿全局 total 直接减（全库未读会在期间被别盒新消息抬高）。
  const acks = findReceipts(receipts, 'vibe_vmu_mailbox', (r) => r.receipt.action === 'ack' && r.receipt.ok === true)
  let delta = null
  let noisy = null
  for (const ack of acks) {
    const member = (ack.args && ack.args.member) || ack.receipt.member || null
    const k = Array.isArray(ack.args && ack.args.ids) ? ack.args.ids.length : 1
    if (!member) continue
    const before = [...readings].reverse().find((r) => r.at < ack.at && num(r.perBox[member]) !== null)
    const after = readings.find((r) => r.at > ack.at && num(r.perBox[member]) !== null)
    if (!before || !after) continue
    const cand = { member, before: before.perBox[member], after: after.perBox[member], acked: k, at: ack.at, source: 'vibe_v5_inbox list notice.perBox[' + member + ']', statusBefore: before.status, statusAfter: after.status }
    if (num(cand.after) === num(cand.before) - k) { delta = cand; break }
    if (!noisy) noisy = cand
  }
  if (delta) {
    evidence.push({ call: delta.statusBefore, receiptField: delta.source + ' before', value: delta.before })
    evidence.push({ call: delta.statusAfter, receiptField: delta.source + ' after', value: delta.after + '（ack ' + delta.acked + ' 条）' })
  } else if (noisy) {
    evidence.push({ call: 'inbox:' + noisy.member, receiptField: 'perBox before/after ack', value: noisy.before + ' → ' + noisy.after + '（ack ' + noisy.acked + ' 条；期间有新到，差不能归因给这次 ack）' })
    missing.push('同一成员 perBox 在 ack 前后净减 k 条的 pair（找到的 pair 期间有新消息，差不能归因给这次 ack）')
  } else if (acks.length) missing.push('同一成员在 ack 前后的两次 inbox list 读数（notice.perBox）')
  else missing.push('vibe_vmu_mailbox 的 action:"ack" 成功回执')

  let verdict = 'NO-EVIDENCE'
  let why = ''
  let cls = 'RUN-DID-NOT-REACH'
  if (!notices.length) { why = '没找到字面 "[新到的消息]" 的下一回合提示词。'; cls = 'RUN-DID-NOT-REACH' }
  else if (!arithmetic) { why = '缺 list 回执的 notice.unackedRowsAllBoxes/perBox，计数恒等无法算。'; cls = 'RUN-DID-NOT-REACH' }
  else if (!arithmetic.equal) { verdict = 'FAIL'; why = 'unackedRowsAllBoxes=' + arithmetic.unackedRowsAllBoxes + ' 与 perBox 求和 ' + arithmetic.perBoxSum + ' 不等。' }
  else if (!delta) { why = '缺可归因的 ack 减一计数：' + missing[missing.length - 1] + '。'; cls = 'RUN-DID-NOT-REACH' }
  else { verdict = 'PASS'; why = '提示词含字面 "[新到的消息]"；unackedRowsAllBoxes=' + arithmetic.unackedRowsAllBoxes + ' == sum(perBox)=' + arithmetic.perBoxSum + '；' + delta.source + ' 在 ack ' + delta.acked + ' 条前后 ' + delta.before + '→' + delta.after + '（净减 ' + (num(delta.before) - num(delta.after)) + '）。' }
  record('V11', '回合通知字面头 + 未读计数恒等 + ack 减一',
    '"[新到的消息]" 字面出现在下一回合提示词；vibe_v5_inbox list 的 unackedRowsAllBoxes==sum(perBox)；ack k 条后该成员 perBox 净减 k',
    verdict, evidence, why, missing, { noEvidenceClass: cls, arithmetic })
}

/* ============================= V12 结题票 + 终稿 + 归档回指 + 字节/sha 恒等 */

{
  const evidence = []
  const missing = []
  const votes = findReceipts(receipts, 'vibe_vmu_vote', (r) => deep(r.receipt, 'closureVote'))
  const lastVote = votes.length ? votes[votes.length - 1] : null
  const solvedVoters = new Set()
  for (const r of votes) {
    if (r.receipt.ok === true && r.receipt.solved === true && r.args && r.args.member) solvedVoters.add(String(r.args.member))
  }
  let arithmetic = { votesCast: null, solvedVoters: [...solvedVoters] }
  if (!lastVote) missing.push('带 closureVote 的 vibe_vmu_vote 回执')
  else {
    const cv = lastVote.receipt.closureVote
    arithmetic.votesCast = cv.votesCast
    evidence.push({ call: callLabel(lastVote), receiptField: 'closureVote.votesCast', value: cv.votesCast })
    evidence.push({ call: callLabel(lastVote), receiptField: 'closureVote.votesFor', value: cv.votesFor })
    evidence.push({ call: callLabel(lastVote), receiptField: 'closureVote.eligible', value: so(cv.eligible, 120) })
    evidence.push({ call: `votes:solved=true 的成员`, receiptField: 'count', value: `${solvedVoters.size} (${[...solvedVoters].join(',')})` })
  }
  // 终稿
  const paperReceipts = findReceipts(receipts, 'vibe_v5_paper')
  const fin = [...paperReceipts].reverse().find((r) => deep(r.receipt, 'final.complete') === true || deep(r.receipt, 'final.pdf.produced') === true)
  let pdfInfo = null
  if (!fin) missing.push('论文 final 回执（produced:true + pdfPath + pdfBytes>0）')
  else {
    const pdfPath = deep(fin.receipt, 'final.pdf.pdfPath') || deep(fin.receipt, 'pdfCompiled.pdfPath')
    const pdfBytes = deep(fin.receipt, 'final.pdf.pdfBytes') || deep(fin.receipt, 'pdfCompiled.pdfBytes')
    const produced = deep(fin.receipt, 'final.pdf.produced') !== undefined ? deep(fin.receipt, 'final.pdf.produced') : deep(fin.receipt, 'pdfCompiled.produced')
    evidence.push({ call: callLabel(fin), receiptField: 'final.pdf.produced', value: produced })
    evidence.push({ call: callLabel(fin), receiptField: 'final.pdf.pdfPath', value: pdfPath })
    evidence.push({ call: callLabel(fin), receiptField: 'final.pdf.pdfBytes', value: pdfBytes })
    pdfInfo = { produced, pdfPath, pdfBytes, at: fin.at }
    if (pdfPath && fs.existsSync(pdfPath)) {
      const stat = fs.statSync(pdfPath)
      const sha = sha256(fs.readFileSync(pdfPath))
      evidence.push({ call: `fs:${pdfPath}`, receiptField: 'diskBytes', value: stat.size })
      evidence.push({ call: `fs:${pdfPath}`, receiptField: 'sha256(file)', value: sha })
      pdfInfo.diskBytes = stat.size; pdfInfo.fileSha = sha
    } else if (pdfPath) missing.push(`磁盘文件 ${pdfPath}（不存在）`)
  }
  // 归档行回指
  const expands = findReceipts(receipts, 'vibe_vmu_records', (r) => deep(r.receipt, 'body') && String(deep(r.receipt, 'body')).includes('pdfPath'))
  const archive = expands.length ? expands[expands.length - 1] : null
  if (!archive) missing.push('vibe_vmu_records {action:"expand"} 的 paper-pdf 归档行（recordId 回指）')
  else {
    let body = null
    try { body = JSON.parse(archive.receipt.body) } catch { body = null }
    evidence.push({ call: callLabel(archive), receiptField: 'id/kind', value: `${archive.receipt.id}/${archive.receipt.kind}` })
    evidence.push({ call: callLabel(archive), receiptField: 'fingerprint', value: archive.receipt.fingerprint })
    if (body) { evidence.push({ call: callLabel(archive), receiptField: 'body.pdfBytes', value: body.pdfBytes }); evidence.push({ call: callLabel(archive), receiptField: 'body.pdfPath', value: body.pdfPath }) }
    pdfInfo = pdfInfo || {}
    pdfInfo.recordId = archive.receipt.id
    pdfInfo.recordFingerprint = archive.receipt.fingerprint
    pdfInfo.recordBody = body
  }
  // renderOk:true
  const renders = paperReceipts.filter((r) => r.receipt.action === 'render')
  const renderTrue = renders.find((r) => r.receipt.renderOk === true)
  if (renderTrue) evidence.push({ call: callLabel(renderTrue), receiptField: 'renderOk', value: true })
  else missing.push('render 回执 renderOk:true')

  let verdict = 'NO-EVIDENCE'
  let why = ''
  if (!lastVote) why = '缺 closureVote 回执。'
  else if (num(arithmetic.votesCast) !== solvedVoters.size) { verdict = 'FAIL'; why = `closureVote.votesCast=${so(arithmetic.votesCast)} 与 solved=true 的成员数 ${solvedVoters.size}（${[...solvedVoters].join(',')}）不等。` }
  else if (!fin || !pdfInfo || !pdfInfo.pdfPath) why = '缺终稿回执的 produced/pdfPath/pdfBytes。'
  else if (!(num(pdfInfo.pdfBytes) > 0)) { verdict = 'FAIL'; why = `pdfBytes=${so(pdfInfo.pdfBytes)} 不大于 0。` }
  else if (pdfInfo.diskBytes !== undefined && pdfInfo.diskBytes !== pdfInfo.pdfBytes) { verdict = 'FAIL'; why = `回执 pdfBytes=${pdfInfo.pdfBytes} 与磁盘字节数 ${pdfInfo.diskBytes} 不等。` }
  else if (!archive) why = '缺归档行回指（records expand paper-pdf）。'
  else if (!renderTrue) why = '缺 renderOk:true 的 render 回执。'
  else {
    // 归档行的 sha：行级 fingerprint 是"行正文指纹"，不是 PDF 文件 sha；只有明确存了文件 sha 才做等值判定
    const bodySha = pdfInfo.recordBody && (pdfInfo.recordBody.sha256 || pdfInfo.recordBody.fileSha256 || pdfInfo.recordBody.pdfSha256)
    if (!bodySha) {
      verdict = 'NO-EVIDENCE'
      missing.push('归档行上的 PDF 文件 sha256')
      why = `ARITHMETIC-BLOCKED: 缺 归档行的 PDF 文件 sha256。其余恒等都成立，但 record ${pdfInfo.recordId} 的 fingerprint=${so(pdfInfo.recordFingerprint)} 是"行正文指纹"，语义不是文件 sha；任务书要求的 sha256(pdfPath)==归档行 sha 无法机械判定。`
    } else if (bodySha !== pdfInfo.fileSha) { verdict = 'FAIL'; why = `归档 sha=${bodySha} 与 sha256(pdfPath)=${pdfInfo.fileSha} 不等。` }
    else { verdict = 'PASS'; why = `closureVote.votesCast=${arithmetic.votesCast} == solved 成员数 ${solvedVoters.size}；final produced:true、pdfPath 存在、pdfBytes=${pdfInfo.pdfBytes}==磁盘 ${pdfInfo.diskBytes}；renderOk:true；归档行 ${pdfInfo.recordId} 回指存在且 sha 相符。` }
  }
  // 若上面写了 ARITHMETIC-BLOCKED 的占位结果，替换为完整记录
  const idx = results.findIndex((x) => x.V === 'V12')
  const full = { V: 'V12', title: '结题票 + 终稿 + 归档回指 + 字节/sha 恒等', verdict, evidence, why, missing, expectation: 'closureVote.votesCast == 本轮 solved=true 的成员数；论文 final 回执 produced:true + pdfPath + pdfBytes>0；renderOk:true；归档行 recordId 回指；pdfBytes == 磁盘字节数；sha256(pdfPath) == 归档行 sha', arithmetic: { ...arithmetic, ...pdfInfo } }
  if (idx >= 0) results[idx] = full; else results.push(full)
}

/* ------------------------------------------------------------------ 输出 */

const order = Array.from({ length: 12 }, (_, i) => "V" + (i + 1))
if (CHECKS_ONLY) {
  const known = results.map((r) => r.V)
  const unknown = CHECKS_ONLY.filter((id) => !known.includes(id))
  if (unknown.length) {
    console.error("verify-run: unknown check id(s): " + unknown.join(", ") + "; known: " + known.join(","))
    process.exit(2)
  }
}
const kept = (CHECKS_ONLY ? results.filter((r) => CHECKS_ONLY.includes(r.V)) : results.slice()).sort((a, b) => order.indexOf(a.V) - order.indexOf(b.V))
const summary = {}
for (const r of kept) summary[r.verdict] = (summary[r.verdict] || 0) + 1

// TB-2714：NO-EVIDENCE 不是一种原因，而是三种，混在一个数里就会把「尺子坏」读成「产品坏」。
//   RULE-UNREACHABLE   判据要求的产品在运行期根本不会产出的证据（尺子错，e.g. 旧 V1 的 journal 首帧）
//   RUN-DID-NOT-REACH  产品能产出，但这次 run 没走到那条路（覆盖率缺口，不是缺陷）
//   PRODUCT-MISSING    这次 run 应该产出却沉默（产品缺陷，要单独立项）
// 每条 NO-EVIDENCE 必须自带分类；没有分类的记 UNCLASSIFIED 并单独计数（不许默认到任何一类里）。
const NO_EVIDENCE_CLASSES = ['RULE-UNREACHABLE', 'RUN-DID-NOT-REACH', 'PRODUCT-MISSING']
const classOf = (r) => {
  if (r.verdict !== 'NO-EVIDENCE') return null
  return NO_EVIDENCE_CLASSES.includes(r.noEvidenceClass) ? r.noEvidenceClass : 'UNCLASSIFIED'
}
const noEvidence = {
  total: kept.filter((r) => r.verdict === 'NO-EVIDENCE').length,
  byClass: { 'RULE-UNREACHABLE': 0, 'RUN-DID-NOT-REACH': 0, 'PRODUCT-MISSING': 0, 'UNCLASSIFIED': 0 },
  rows: [],
}
for (const r of kept) {
  const c = classOf(r)
  if (!c) continue
  noEvidence.byClass[c] = (noEvidence.byClass[c] || 0) + 1
  noEvidence.rows.push({ id: r.V, class: c, why: r.why })
}

const perSession = sessions.map((s) => ({
  id: s.id,
  firstEventAt: new Date(s.firstTime).toISOString(),
  events: s.events,
  receipts: receipts.filter((r) => r.session === s.short).length,
  prompts: messages.filter((m) => m.session === s.short).length,
}))
const payload = {
  runId: sessions.length ? sessions[0].id : null,
  build: EXPECTED_BUILD || driver.build || gShort || null,
  sessions: perSession,
  checks: kept.map((r) => ({
    id: r.V,
    title: r.title,
    expectation: r.expectation,
    verdict: r.verdict,
    evidence: r.evidence,
    why: r.why,
    missing: r.missing || [],
    arithmetic: r.arithmetic || null,
    noEvidenceClass: classOf(r),
  })),
  summary,
  noEvidence,
  buildReadings: {
    expected: EXPECTED_BUILD,
    driverTarball: driver.build,
    driverRev: driver.rev,
    gitShort: gShort,
    gitFull: gFull,
    dryRun: DRY,
  },
  since: new Date(SINCE).toISOString(),
  generatedAt: new Date().toISOString(),
  inputs: {
    sessionsRoot: SESSIONS_ROOT,
    workspace: WS,
    driverLog: driver.file,
    receipts: receipts.length,
    messages: messages.length,
  },
}

const esc = (s) => String(s === undefined ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ")
const tableLines = []
tableLines.push("# 真机 run 机械核对表" + (DRY ? "（DRY-RUN）" : ""))
tableLines.push("")
tableLines.push("- 生成：" + payload.generatedAt + "；会话 " + sessions.length + " 个（首事件 >= " + payload.since + "）；回执 " + receipts.length + " 条；提示词 " + messages.length + " 条。")
tableLines.push("- 输入：journal + SESSIONS_ROOT + ；driver " + (driver.file || "（未给）") + "；git short=" + so(gShort) + "；期望 build=" + so(EXPECTED_BUILD) + "。")
tableLines.push("- 判定口径：PASS 必须有「回执字段名＝值」原文；找不到 -> NO-EVIDENCE；算不出 -> ARITHMETIC-BLOCKED；FAIL 只给期望明确不成立。" + (DRY ? " 本表为 dry-run（run 可能仍在运行，全 NO-EVIDENCE 允许）。" : ""))
tableLines.push("")
tableLines.push("| 验点 | 期望 | 实测（回执字段=值） | 判定 | 缺什么 |")
tableLines.push("|---|---|---|---|---|")
for (const r of kept) {
  const evid = r.evidence.slice(0, 4).map((e) => esc(e.receiptField) + "=" + esc(so(e.value, 120))).join("<br>")
  tableLines.push("| " + r.V + " " + esc(r.title) + " | " + esc(r.expectation) + " | " + (evid || "—") + " | **" + r.verdict + "** | " + esc((r.missing || []).join("；") || "—") + " |")
}
tableLines.push("")
tableLines.push("## 逐点判据与证据位置")
for (const r of kept) {
  tableLines.push("")
  tableLines.push("### " + r.V + " " + r.title + " — " + r.verdict)
  tableLines.push("- why：" + r.why)
  for (const e of r.evidence) tableLines.push("- " + esc(e.call) + " -> " + esc(e.receiptField) + "=" + esc(so(e.value, 300)))
  if (r.missing && r.missing.length) tableLines.push("- 缺：" + r.missing.join("；"))
  if (r.arithmetic) tableLines.push("- arithmetic：" + JSON.stringify(r.arithmetic))
}
tableLines.push("")
tableLines.push("## 汇总")
tableLines.push("")
tableLines.push(JSON.stringify(summary))
tableLines.push("")
tableLines.push("### NO-EVIDENCE 按原因分类（TB-2714）")
tableLines.push("")
tableLines.push("- RULE-UNREACHABLE（尺子错：产品运行期不会产出该证据）：" + noEvidence.byClass['RULE-UNREACHABLE'])
tableLines.push("- RUN-DID-NOT-REACH（产品能产出，但这次 run 没走到）：" + noEvidence.byClass['RUN-DID-NOT-REACH'])
tableLines.push("- PRODUCT-MISSING（这次 run 应该产出却沉默：产品缺陷）：" + noEvidence.byClass['PRODUCT-MISSING'])
tableLines.push("- UNCLASSIFIED（没给分类的 NO-EVIDENCE，不许默认成上面任一类）：" + noEvidence.byClass['UNCLASSIFIED'])
for (const row of noEvidence.rows) tableLines.push("  - " + row.id + " " + row.class + "：" + row.why)
const tableText = tableLines.join("\n") + "\n"

if (OUT) {
  const isJson = /\.json$/i.test(OUT)
  const jsonPath = isJson ? OUT : path.join(OUT, "verify-run.json")
  const mdPath = isJson ? OUT.replace(/\.json$/i, ".md") : path.join(OUT, "verify-run.md")
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true })
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + "\n")
  fs.writeFileSync(mdPath, tableText)
  note("wrote " + jsonPath + " and " + mdPath)
} else {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n")
}

// 人读摘要一律走 stderr：stdout 在没有 --out 时必须是纯 JSON（可被 JSON.parse 直接吃下）。
console.error("")
console.error("=== verify-run ===")
console.error("sessions=" + sessions.length + " receipts=" + receipts.length + " prompts=" + messages.length)
console.error("summary: " + JSON.stringify(summary))
console.error("no-evidence classes: " + JSON.stringify(noEvidence.byClass))
for (const r of kept) console.error(r.V.padEnd(4) + " " + r.verdict.padEnd(16) + r.title + " | " + r.why.slice(0, 140))
process.exitCode = kept.some((r) => r.verdict === "FAIL") ? 1 : 0
