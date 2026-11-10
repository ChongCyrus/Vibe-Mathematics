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
 *        [--driver-log <file>] [--repo <path>] [--dry-run]
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
const gShort = gitRev(true)
const gFull = gitRev(false)
note(`sessions=${sessions.length} receipts=${receipts.length} messages=${messages.length} driver=${driver.exists} git=${gShort}`)
if (DRY) note('DRY-RUN 模式：真机可能仍在运行，回执/提示词可能不全；全 NO-EVIDENCE 是允许的。')

const allTextOf = (r) => { try { return JSON.stringify(r.receipt) } catch { return '' } }
const withPath = (pred) => receipts.filter((r) => { const v = deep(r.receipt, pred); return v !== undefined })
const hasCode = (code) => receipts.filter((r) => r.receipt.code === code)

/* =============================================================== V1 构建自证 */

{
  const evidence = []
  const missing = []
  if (driver.exists) {
    const idx = driver.lines.findIndex((l) => /^TARBALL build=/.test(l))
    if (idx >= 0) evidence.push({ call: `driver:${path.basename(driver.file)}:${idx + 1}`, receiptField: 'TARBALL build', value: driver.build })
    const ridx = driver.lines.findIndex((l) => /^BUILD REV:/.test(l))
    if (ridx >= 0) evidence.push({ call: `driver:${path.basename(driver.file)}:${ridx + 1}`, receiptField: 'BUILD REV', value: driver.rev })
  } else missing.push(driver.file ? `driver 日志 ${driver.file}` : "driver 日志（未提供 --driver-log：构建自证的第一处缺失，不是通过）")
  if (gShort) evidence.push({ call: `git:${REPO}`, receiptField: 'rev-parse --short HEAD', value: gShort })
  if (gFull) evidence.push({ call: `git:${REPO}`, receiptField: 'rev-parse HEAD', value: gFull })
  if (driver.stamp) {
    const sidx = driver.lines.findIndex((l) => /^STAMP exit=/.test(l))
    evidence.push({ call: `driver:${path.basename(driver.file)}:${sidx + 1}`, receiptField: 'STAMP exit', value: driver.stamp })
    const jidx = driver.lines.findIndex((l) => /"stamped"/.test(l))
    if (jidx >= 0) evidence.push({ call: `driver:${path.basename(driver.file)}:${jidx + 1}`, receiptField: 'stamp 工具回执', value: so(driver.lines[jidx], 150) })
  }

  const metaWithBuild = metadata.filter((m) => m.build !== undefined && m.build !== null)
  for (const m of metaWithBuild) {
    evidence.push({ call: `journal:${m.session}:${new Date(m.at).toISOString()}`, receiptField: 'session.build', value: m.build })
    evidence.push({ call: `journal:${m.session}:${new Date(m.at).toISOString()}`, receiptField: 'session.buildSource', value: m.buildSource })
    evidence.push({ call: `journal:${m.session}:${new Date(m.at).toISOString()}`, receiptField: 'session.dirty', value: m.dirty })
  }
  if (metaWithBuild.length === 0) missing.push(`journal 首帧 run-metadata.build（本部署 session 事件无 build/buildSource/dirty；driver 里 STAMP exit=0 但 stamp 工具回执 sessions:0/stamped:0 "no session folder for this workspace"，build 帧没有落盘）`)
  if (EXPECTED_BUILD) evidence.push({ call: 'lead:期望', receiptField: 'build', value: EXPECTED_BUILD })

  const vals = [driver.build, gShort, ...metaWithBuild.map((m) => m.build)].filter((v) => v !== null && v !== undefined)
  let verdict = 'NO-EVIDENCE'
  let why = ''
  if (!driver.build) { verdict = 'NO-EVIDENCE'; why = '缺 driver 日志的 TARBALL build 行：三处自证的第一处拿不到。' }
  else if (!gShort) { verdict = 'NO-EVIDENCE'; why = '缺 git HEAD（无法读仓库）。' }
  else if (driver.build !== gShort) { verdict = 'FAIL'; why = `TARBALL build=${driver.build} 与 git short HEAD=${gShort} 不等——构建不是从该 HEAD 出的。` }
  else if (metaWithBuild.length === 0) { verdict = 'NO-EVIDENCE'; why = `TARBALL build 与 git 短 HEAD 都是 ${driver.build}，但 journal 首帧没有 run-metadata 帧（该部署不写 build/buildSource/dirty），第三处自证拿不到，不能算三处相等。${driver.stamp ? '；本轮回执里 STAMP 行是 ' + driver.stamp + '，但 stamp 工具回执 sessions:0/stamped:0（"no session folder for this workspace"），build 帧这次没有落进 journal。' : ''}` }
  else if (metaWithBuild.some((m) => m.build !== driver.build)) { verdict = 'FAIL'; why = `journal 首帧 build=${so(metaWithBuild.find((m) => m.build !== driver.build).build)} 与 TARBALL build=${driver.build} 不等。` }
  else if (metaWithBuild.some((m) => m.dirty === true) || metaWithBuild.some((m) => String(m.buildSource).includes('working-tree'))) { verdict = 'ENV-LIMIT'; why = 'journal 首帧报告 dirty:true 或 buildSource 为 working-tree——构建不是从干净 HEAD 出的，这是环境事实。' }
  else { verdict = 'PASS'; why = `三处相等：TARBALL build=${driver.build}、git short HEAD=${gShort}、journal 首帧 build=${so(metaWithBuild[0].build)}，且 buildSource=${so(metaWithBuild[0].buildSource)} / dirty=${so(metaWithBuild[0].dirty)}。` }
  record('V1', '构建自证（TARBALL / git HEAD / journal 首帧三处一致）',
    'TARBALL build = git short HEAD = journal 首帧 run-metadata build；buildSource git HEAD (git archive)；dirty:false',
    verdict, evidence, why, missing, { arithmetic: { short: driver.build, gitShort: gShort, journalBuild: metaWithBuild[0] ? metaWithBuild[0].build : null } })
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
      verdict, evidence, why, missing, { arithmetic: meta })
  }
  if (!last) record('V2', '成员/所办工作量占比（memberWorkShare）',
    '回执带 memberActs>0、officeRelayedActs>0、unknownActs、acts、memberShare(4 位小数)、means；手算 memberShare == memberActs/(memberActs+officeRelayedActs)',
    'NO-EVIDENCE', evidence, why, missing)
}

/* ================================================= V3 所办代跑 vs 成员自跑 */

{
  const evidence = []
  const missing = []
  const relay = receipts.filter((r) => r.receipt.memberActed === false && r.receipt.actedForMember && r.receipt.ranInOwnTurn === false)
  const relayR1 = relay.filter((r) => r.receipt.actedForMember === 'r-1')
  const picked = relayR1.length ? relayR1[relayR1.length - 1] : (relay.length ? relay[relay.length - 1] : null)
  if (!picked) missing.push('memberActed:false + actedForMember + ranInOwnTurn:false 的所办代跑回执')
  else {
    evidence.push({ call: callLabel(picked), receiptField: 'memberActed', value: picked.receipt.memberActed })
    evidence.push({ call: callLabel(picked), receiptField: 'actedForMember', value: picked.receipt.actedForMember })
    evidence.push({ call: callLabel(picked), receiptField: 'ranInOwnTurn', value: picked.receipt.ranInOwnTurn })
  }
  const statusRows = []
  for (const r of findReceipts(receipts, 'vibe_vmu_turn', (x) => deep(x.receipt, 'status.turnReceipts'))) {
    for (const row of r.receipt.status.turnReceipts) statusRows.push({ r, row })
  }
  const callerRows = statusRows.filter(({ row }) => row.deliveryPath === 'caller')
  if (!callerRows.length) missing.push('turnReceipts 行的 deliveryPath:"caller"（所办代跑的回合行）')
  else evidence.push({ call: callLabel(callerRows[callerRows.length - 1].r), receiptField: `turnReceipts[${callerRows[callerRows.length - 1].row.turn || '?'}].deliveryPath`, value: 'caller' })
  const memberRows = statusRows.filter(({ row }) => typeof row.deliveryPath === 'string' && row.deliveryPath.length > 0 && row.deliveryPath !== 'caller')
  if (memberRows.length) evidence.push({ call: callLabel(memberRows[memberRows.length - 1].r), receiptField: `turnReceipts[${memberRows[memberRows.length - 1].row.turn || '?'}].deliveryPath`, value: memberRows[memberRows.length - 1].row.deliveryPath })
  else missing.push('turnReceipts 行的成员自跑 deliveryPath（如 activation）')
  // 行来源键：run 75 当时的回执叫 writerSource（旧公开语义，哪个字段作答）；RUN 2691 起记录行的来源键是
  // writtenFrom（own-turn/relayed/unknown），writerSource 一字不改地留在库头。核对器两个名字都认，未来真机
  // 用 writtenFrom 作答时这里才不会永远 NO-EVIDENCE。
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
  const memberActedTrue = receipts.filter((r) => r.receipt.memberActed === true && r.receipt.ranInOwnTurn !== false)
  if (memberActedTrue.length) evidence.push({ call: callLabel(memberActedTrue[memberActedTrue.length - 1]), receiptField: 'memberActed', value: true })
  else missing.push('对照：成员自跑回执中 memberActed:true 的样本')

  let verdict = 'NO-EVIDENCE'
  let why = ''
  const writerDomainOf = (r) => (writerKeyOf(r) === 'writtenFrom' ? ['own-turn', 'relayed', 'unknown'] : ['field-argument', 'meta.writer', 'meta.owner', 'member'])
  if (picked && callerRows.length && writerRows.length && memberActedTrue.length) {
    const bad = writerRows.filter((r) => !writerDomainOf(r).includes(r.receipt[writerKeyOf(r)]))
    if (bad.length) { verdict = 'FAIL'; why = `${writerKeyOf(bad[bad.length - 1])}=${so(bad[bad.length - 1].receipt[writerKeyOf(bad[bad.length - 1])])} 不在该键的值域 ${writerDomainOf(bad[bad.length - 1]).join('/')} 内。` }
    else { verdict = 'PASS'; why = `所办代跑（${so(picked.receipt.tool)} actedForMember=${picked.receipt.actedForMember}、ranInOwnTurn=false）与成员自跑（memberActed=true）可区分；回合行 deliveryPath 同时有 caller 与自跑值；重建行 ${writerKeyOf(writerRows[writerRows.length - 1])}=${so(writerRows[writerRows.length - 1].receipt[writerKeyOf(writerRows[writerRows.length - 1])])} 带 means。` }
  } else {
    why = `缺：${missing.join('；')}。` + (relay.length ? `（已见 ${relay.length} 条 memberActed:false 回执，但四件套不齐）` : '（本轮尚未见 memberActed:false 回执）')
  }
  record('V3', '所办代跑 vs 成员自跑（回执 + 回合行 + 重建行三处可区分）',
    '所办代跑回执 memberActed:false、actedForMember、ranInOwnTurn:false；回合行 deliveryPath:"caller"；重建行行来源键 writtenFrom∈{own-turn,relayed,unknown}（run 75 当时的回执叫 writerSource∈{field-argument,meta.writer,meta.owner,member}）+ means',
    verdict, evidence, why, missing)
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
  const lastStatus = statusReceipts.length ? statusReceipts[statusReceipts.length - 1] : null
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
  if (!start) why = '缺论文 start 回执。'
  else if (!finalReceipt) why = '没看到 final.complete:true（论文未到 finalized）。'
  else if (!lastStatus) why = '缺 status.liveReadings（状态板同值无法核对）。'
  else if (missing.length) why = `缺：${missing.join('；')}。`
  else if (asm.length < 3) why = `三态中只取到 ${asm.length} 份装配文本（需要三个状态各一份）。`
  else if (sHas.size < 3) { verdict = 'FAIL'; why = `三份装配文本的 sha256 只有 ${sHas.size} 个不同值（要求三份互异）。` }
  else if (!evidenceOk) why = `状态序列未覆盖 draft/writing→reviewing→finalized：实测 ${allStates.join('→')}。`
  else { verdict = 'PASS'; why = `论文三态 ${allStates.join('→')} 均出现；三份装配文本 sha 互异（${[...sHas].map((h) => h.slice(0, 8)).join('/')}）；state block 的 paper/blueprint/closure 三组都带 source+atSource。` }
  record('V4', '论文三态推进 + 每态下一回合装配文本 sha 互异 + 状态板三组读数',
    'paper start 后经 part/review 推进 draft→reviewing→finalized；每态主席席取一次装配文本并算 sha256（三份互异）；状态板 paper/blueprint/closure 带 source+atSource；turn.status() 的 liveReadings 同值',
    verdict, evidence, why, missing, { arithmetic: { assembly: asm.map((a) => ({ state: a.state, sha256: a.sha })), states: allStates } })
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
  const evidence = []
  const missing = []
  const shape = receipts.filter((r) => ['VMU_TURN_DELIVERY_SHAPE', 'VMU_TURN_DELIVERY_NO_PAYLOAD'].includes(r.receipt.code))
  const engine = receipts.filter((r) => r.receipt.code === 'VMU_ENGINE_UNAVAILABLE')
  for (const r of shape) {
    evidence.push({ call: callLabel(r), receiptField: 'code', value: r.receipt.code })
    if (r.receipt.starts !== undefined) evidence.push({ call: callLabel(r), receiptField: 'starts', value: r.receipt.starts })
    if (r.receipt.hint) evidence.push({ call: callLabel(r), receiptField: 'hint', value: so(r.receipt.hint, 160) })
  }
  for (const r of engine) evidence.push({ call: callLabel(r), receiptField: 'code（反例）', value: r.receipt.code })
  let verdict = 'NO-EVIDENCE'
  let why = ''
  if (!shape.length) { missing.push('code 为 VMU_TURN_DELIVERY_SHAPE 或 VMU_TURN_DELIVERY_NO_PAYLOAD 的投递形状拒回执（本轮 0 条）'); why = '本轮回执中没有 VMU_TURN_DELIVERY_SHAPE / VMU_TURN_DELIVERY_NO_PAYLOAD。' }
  else if (engine.length) { verdict = 'FAIL'; why = `出现 VMU_ENGINE_UNAVAILABLE（${engine.map((r) => callLabel(r)).join('、')}）——投递形状问题被写成引擎不可用。` }
  else if (shape.some((r) => typeof r.receipt.starts === 'number' && r.receipt.starts > 1)) { verdict = 'FAIL'; why = '投递形状回执 starts>1（语义只该起一次）。' }
  else { verdict = 'PASS'; why = `具名拒 ${shape.map((r) => r.receipt.code).join('、')} 出现，且全文没有 VMU_ENGINE_UNAVAILABLE。` }
  record('V7', '投递形状具名拒（不是引擎不可用）', 'code:"VMU_TURN_DELIVERY_SHAPE" 或 "VMU_TURN_DELIVERY_NO_PAYLOAD"；不得是 VMU_ENGINE_UNAVAILABLE；starts≤1', verdict, evidence, why, missing)
}

/* ================================================== V8 parked 停放回执 */

{
  const evidence = []
  const missing = []
  const parked = hasCode('VMU_TURN_PARKED_NEEDS_OWNER')
  for (const r of parked) {
    evidence.push({ call: callLabel(r), receiptField: 'code', value: r.receipt.code })
    evidence.push({ call: callLabel(r), receiptField: 'parkedReason', value: so(r.receipt.parkedReason, 160) })
    evidence.push({ call: callLabel(r), receiptField: 'parkedFacts', value: so(r.receipt.parkedFacts, 200) })
  }
  let verdict = 'NO-EVIDENCE'
  let why = ''
  if (!parked.length) { missing.push('code:"VMU_TURN_PARKED_NEEDS_OWNER" 的回执'); why = '本轮还没有 parked 回执。' }
  else {
    const bad = parked.find((r) => !r.receipt.parkedReason || typeof r.receipt.parkedReason !== 'string' || !r.receipt.parkedFacts)
    if (bad) { verdict = 'FAIL'; why = 'parked 回执缺非空 parkedReason 或 parkedFacts（处置建议）。' }
    else { verdict = 'PASS'; why = `parked 回执 ${parked.length} 条，parkedReason 非空，parkedFacts 带处置建议。` }
  }
  record('V8', 'parked 停放：具名 code + 原因 + 处置建议', 'code:"VMU_TURN_PARKED_NEEDS_OWNER"；parkedReason 非空；parkedFacts 给处置建议', verdict, evidence, why, missing)
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
  const evidence = []
  const missing = []
  const notices = messages.filter((m) => m.type === 'user/message' && m.text.includes('[新到的消息]'))
  if (!notices.length) missing.push('下一回合提示词里的字面 "[新到的消息]"')
  else {
    const n = notices[notices.length - 1]
    const line = n.text.split('\n').find((l) => l.includes('[新到的消息]')) || n.text.slice(0, 80)
    evidence.push({ call: `journal:${n.session}:${new Date(n.at).toISOString()}`, receiptField: 'prompt 首行', value: line.slice(0, 120) })
    evidence.push({ call: `journal:${n.session}:${new Date(n.at).toISOString()}`, receiptField: 'notice 行数', value: (n.text.match(/读后 mailbox ack /g) || []).length })
  }
  // 计数恒等：status.notice.unackedRowsAllBoxes == sum(perBox)，对每一条 status 回执都算一遍。
  // 不能只看最后一条：一条前后矛盾的读数本身就是 FAIL 的证据（反关灯②），
  // 一条缺字段的读数则必须被点名（反关灯①），两者都不能被后面的正确读数盖住或静默跳过。
  const mailStatuses = findReceipts(receipts, 'vibe_vmu_mailbox', (r) => r.receipt.action === 'status')
  let arithmetic = null
  const readings = []
  let firstBad = null
  let firstMissing = null
  for (const r of mailStatuses) {
    const total = deep(r.receipt, 'notice.unackedRowsAllBoxes')
    const perBox = deep(r.receipt, 'notice.perBox')
    if (total === undefined || perBox === undefined) {
      if (!firstMissing) {
        firstMissing = { r, fields: [total === undefined ? 'notice.unackedRowsAllBoxes' : null, perBox === undefined ? 'notice.perBox' : null].filter(Boolean) }
      }
      continue
    }
    const sum = Object.values(perBox).reduce((a, b) => a + (num(b) || 0), 0)
    const reading = { status: callLabel(r), unackedRowsAllBoxes: total, perBox, perBoxSum: sum, equal: num(total) === sum }
    readings.push(reading)
    if (!reading.equal && !firstBad) firstBad = reading
  }
  if (firstMissing) {
    for (const f of firstMissing.fields) missing.push(`${f}（${callLabel(firstMissing.r)} 的 status 回执里没有这个字段）`)
  }
  if (readings.length) {
    const chosen = firstBad || readings[readings.length - 1]
    arithmetic = { status: chosen.status, unackedRowsAllBoxes: chosen.unackedRowsAllBoxes, perBox: chosen.perBox, perBoxSum: chosen.perBoxSum, equal: chosen.equal, readings }
    for (const r of readings.slice(-2)) {
      evidence.push({ call: r.status, receiptField: 'notice.unackedRowsAllBoxes', value: r.unackedRowsAllBoxes })
      evidence.push({ call: r.status, receiptField: 'sum(notice.perBox)', value: `${r.perBoxSum} (${Object.entries(r.perBox).map(([k, v]) => k + ':' + v).join(', ')})` })
    }
    if (firstBad) missing.push(`perBox 求和 == unackedRowsAllBoxes（${firstBad.status} 上 unackedRowsAllBoxes=${firstBad.unackedRowsAllBoxes} 与 perBox 求和=${firstBad.perBoxSum} 不等）`)
  }
  // ack 减一：优先"同一成员 inbox list 的 count"；必要时退到 mailbox status 的总数。
  // 判据严格：ack 了 k 条，则 after == before - k（k 取 args.ids.length，缺省 1）。
  const lists = findReceipts(receipts, 'vibe_v5_inbox', (r) => r.receipt.action === 'list' && typeof r.receipt.count === 'number')
  const acks = findReceipts(receipts, 'vibe_vmu_mailbox', (r) => r.receipt.action === 'ack' && r.receipt.ok === true)
  let delta = null
  let noisy = null
  for (const ack of acks) {
    const member = ack.args && ack.args.member
    const k = Array.isArray(ack.args && ack.args.ids) ? ack.args.ids.length : 1
    const before = [...lists].reverse().find((r) => r.at < ack.at && r.args && r.args.member === member)
    const after = lists.find((r) => r.at > ack.at && r.args && r.args.member === member)
    if (!before || !after) continue
    const cand = { member, before: before.receipt.count, after: after.receipt.count, acked: k, at: ack.at, source: 'vibe_v5_inbox list count' }
    if (after.receipt.count === before.receipt.count - k) { delta = cand; break }
    if (!noisy) noisy = cand
  }
  if (!delta) {
    // 退路：mailbox status 的 notice.unackedRowsAllBoxes 在 ack 前后的差（同一根账本，口径写清）。
    for (const ack of acks) {
      const k = Array.isArray(ack.args && ack.args.ids) ? ack.args.ids.length : 1
      const sBefore = [...mailStatuses].reverse().find((r) => r.at < ack.at)
      const sAfter = mailStatuses.find((r) => r.at > ack.at)
      if (!sBefore || !sAfter) continue
      const b = num(deep(sBefore.receipt, 'notice.unackedRowsAllBoxes'))
      const a = num(deep(sAfter.receipt, 'notice.unackedRowsAllBoxes'))
      if (a === b - k) {
        delta = { member: ack.args && ack.args.member, before: b, after: a, acked: k, at: ack.at, source: 'vibe_vmu_mailbox status.unackedRowsAllBoxes', statusBefore: callLabel(sBefore), statusAfter: callLabel(sAfter) }
        break
      }
    }
  }
  if (delta) {
    evidence.push({ call: delta.statusBefore ? delta.statusBefore : `inbox:${delta.member}`, receiptField: `${delta.source} before`, value: delta.before })
    evidence.push({ call: delta.statusAfter ? delta.statusAfter : `inbox:${delta.member}`, receiptField: `${delta.source} after`, value: `${delta.after}（ack ${delta.acked} 条）` })
  } else if (noisy) {
    evidence.push({ call: `inbox:${noisy.member}`, receiptField: 'count before/after ack', value: `${noisy.before} → ${noisy.after}（ack ${noisy.acked} 条；未找到净减 pair）` })
    missing.push('ack 前后净减 k 条的计数 pair（找到的 pair 期间有新消息，差不能归因给这次 ack）')
  } else missing.push('同一成员在 ack 前后的两次 inbox list count（或 mailbox status 总数）')
  let verdict = 'NO-EVIDENCE'
  let why = ''
  if (!notices.length) why = '没找到字面 "[新到的消息]" 的下一回合提示词。'
  else if (!arithmetic) why = '缺 mailbox status 的 unackedRowsAllBoxes/perBox，计数恒等无法算。'
  else if (!arithmetic.equal) { verdict = 'FAIL'; why = `unackedRowsAllBoxes=${arithmetic.unackedRowsAllBoxes} 与 perBox 求和 ${arithmetic.perBoxSum} 不等。` }
  else if (!delta) why = `缺可归因的 ack 减一计数：${missing[missing.length - 1]}。`
  else { verdict = 'PASS'; why = `提示词含字面 "[新到的消息]"；unackedRowsAllBoxes=${arithmetic.unackedRowsAllBoxes} == sum(perBox)=${arithmetic.perBoxSum}；${delta.source} 在 ack ${delta.acked} 条前后 ${delta.before}→${delta.after}（净减 ${delta.before - delta.after}）。` }
  record('V11', '回合通知字面头 + 未读计数恒等 + ack 减一', '" [新到的消息]" 字面出现在下一回合提示词；unackedRowsAllBoxes==sum(perBox)；ack 一次后总数减 1', verdict, evidence, why, missing, { arithmetic })
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
  })),
  summary,
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
for (const r of kept) console.error(r.V.padEnd(4) + " " + r.verdict.padEnd(16) + r.title + " | " + r.why.slice(0, 140))
process.exitCode = kept.some((r) => r.verdict === "FAIL") ? 1 : 0
