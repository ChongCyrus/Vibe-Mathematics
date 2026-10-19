/**
 * packs/v3/middleware/reports.js — PHASE 6 / **P1-5（汇报三路＋状态面）**。
 *
 * v3 的汇报面有三路（`vibe-math-v3.js:1455-1544`）：`file`（落报告）、`push`（推一条进度消息）、
 * `status`（只读自省）。本模块把三路搬成 vmu 的**声明式**形状：
 *
 *   · **file 路**：把一次快照写成 `reports` 轨上的持久记录（正文是 JSON；vmu 的持久层由 kernel/store 拥有，
 *     pack 不直接碰 fs —— 红线 1“能力在内核”，这也是 P1-2 裁定“无写锁面”的同一结论）。
 *   · **push 路**：只在 `vmu.v3.reportMode` 含 push 时调用 **vmu.report** 的 `emit`；不允许时**不推**，
 *     回执里具名 `push-not-allowed-by-mode`（绝不静默）。报告没被声明/服务缺失 ⇒ 也具名（带服务端 code）。
 *   · **status 路**：`v3ReportsStatus()` 报出写入/推送/跳过计数与最近一次快照；报告里与状态里的计数
 *     来自**同一份快照**，所以“同一个数字”是可断言的。
 *
 * 设置：`vmu.v3.reportMode`（file|push|both，缺省回落 file）与 `vmu.v3.reportIntervalMs`（0=每个 tick 一次；
 * >0 时按注入时钟节流，未到点 ⇒ 具名 `report-not-due`）。两把键的 schema 登记待 Lead 加入；代码缺省与声明默认一致。
 */
import { writeBody } from './dataplane.js'

export const REPORTS_TRACK = 'reports'
export const REPORTS_KIND = 'state'
const REPORT_MODES = Object.freeze(['file', 'push', 'both'])
const str = (v) => (v === null || v === undefined ? '' : String(v))
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

const REPORT_STATES = new WeakMap()
let lastState = null
function stateFor(records) {
  let s = REPORT_STATES.get(records)
  if (!s) {
    s = { writes: 0, pushes: 0, pushSkips: 0, pushCalls: 0, lastWriteAt: null, lastPushAt: null, lastSkip: null, lastPushSkip: null, lastError: null, lastReport: null }
    REPORT_STATES.set(records, s)
  }
  lastState = s
  return s
}

export function v3ReportsStatus() {
  const s = lastState
  if (!s) return { track: REPORTS_TRACK, writes: 0, pushes: 0, pushSkips: 0, pushCalls: 0, lastWriteAt: null, lastPushAt: null, lastSkip: null, lastPushSkip: null, lastError: null, lastReport: null, note: 'no tick has touched the v3 report module yet' }
  return {
    track: REPORTS_TRACK,
    writes: s.writes, pushes: s.pushes, pushSkips: s.pushSkips, pushCalls: s.pushCalls,
    lastWriteAt: s.lastWriteAt, lastPushAt: s.lastPushAt,
    lastSkip: s.lastSkip, lastPushSkip: s.lastPushSkip || null, lastError: s.lastError,
    lastReport: s.lastReport ? JSON.parse(JSON.stringify(s.lastReport)) : null,
    note: 'diagnostics only: counters are per-process; the durable fact is the latest record on the reports track',
  }
}

/** 读汇报模式；未知值 ⇒ 回落 file（声明默认），并让调用方看见归一化结果。 */
export function reportModeOf(value) {
  const v = str(value)
  return REPORT_MODES.includes(v) ? v : 'file'
}

/** 三路是否开启（file/push 各自独立；both＝两路）。 */
export function reportRoutes(mode) {
  const m = reportModeOf(mode)
  return { mode: m, file: m === 'file' || m === 'both', push: m === 'push' || m === 'both' }
}

/** 从 records 组一份可解析的报告快照（计数全部来自同一处，status 与报告因此同源）。 */
export function buildReport({ records, at = null } = {}) {
  const count = (track) => { try { return records.list({ track, limit: 0 }).items.length } catch { return 0 } }
  const problems = count('problems')
  const propos = count('propos')
  const methods = count('methods')
  const plans = count('plans')
  const verified = count('verified')
  return {
    version: 1,
    kind: 'v3-report',
    at,
    counts: { problems, propos, methods, plans, verified },
    tracks: { problems, propos, methods, plans, verified },
  }
}

/**
 * file 路：把快照写成 reports 轨的持久记录（JSON 正文）。返回写入回执。
 * `records` 必须是 vmu.records 句柄；写入失败抛具名拒（不吞）。
 */
export function writeReportRecord({ records, report, by = 'v3-reports' } = {}) {
  const body = JSON.stringify(report, null, 2)
  const rec = writeBody({ records, track: REPORTS_TRACK, kind: REPORTS_KIND, title: 'v3 进度报告', body, settled: true, by })
  return { ok: true, recordId: rec && rec.id ? rec.id : null, bytes: Buffer.byteLength(body, 'utf8'), body }
}

/**
 * push 路：只有 mode 允许时才推。用一个 **report 服务对象**（vmu.report）做投递；不允许 ⇒ 不调用服务，
 * 返回具名 skip；服务拒绝/缺失 ⇒ 保留服务端 code（绝不把失败说成成功）。
 */
export function pushReport({ reportService, report, at = null, mode = 'file' } = {}) {
  const routes = reportRoutes(mode)
  if (!routes.push) {
    return { ok: true, pushed: false, skipped: 'push-not-allowed-by-mode', mode: routes.mode }
  }
  if (!reportService || typeof reportService.emit !== 'function') {
    return { ok: false, pushed: false, skipped: 'report-service-unavailable', mode: routes.mode, code: 'VMU_REPORT_NO_TRANSPORT' }
  }
  const res = reportService.emit({ name: 'v3-progress', at, payload: { counts: report.counts } })
  if (!isObject(res)) return { ok: false, pushed: false, code: 'VMU_REPORT_NO_TRANSPORT', message: 'vmu.report.emit returned no receipt' }
  if (res.ok === false) return { ok: false, pushed: false, code: str(res.code) || 'VMU_REPORT_DELIVER_FAILED', message: str(res.message) }
  return { ok: true, pushed: res.delivered === true || res.delivered === undefined, delivered: res.delivered === true, mode: routes.mode }
}

async function onTick(flat) {
  const api = flat && flat.api
  if (!api || !api.services) throw new Error('v3 reports: no api facade, so vmu.records/vmu.report cannot be reached')
  const at = Number.isFinite(flat.at) ? flat.at : null
  if (at === null) return { ok: true, skipped: 'no-injected-clock' }
  const records = api.services.get('vmu.records')
  const state = stateFor(records)
  const modeRaw = api.setting('vmu.v3.reportMode')
  const intervalRaw = Number(api.setting('vmu.v3.reportIntervalMs'))
  const interval = Number.isFinite(intervalRaw) && intervalRaw >= 0 ? intervalRaw : 0
  const routes = reportRoutes(modeRaw)
  if (interval > 0 && state.lastWriteAt !== null && at - state.lastWriteAt < interval) {
    state.lastSkip = { reason: 'report-not-due', elapsedMs: at - state.lastWriteAt, intervalMs: interval }
    return { ok: true, skipped: 'report-not-due', at, mode: routes.mode, elapsedMs: at - state.lastWriteAt, intervalMs: interval }
  }
  const report = buildReport({ records, at })
  const out = { ok: true, at, mode: routes.mode, file: null, push: null }
  if (routes.file) {
    const written = writeReportRecord({ records, report })
    state.writes += 1
    state.lastWriteAt = at
    state.lastReport = { recordId: written.recordId, at, counts: report.counts }
    out.file = { written: true, recordId: written.recordId, bytes: written.bytes }
  }
  if (routes.push) {
    state.pushCalls += 1
    let reportService = null
    try { if (typeof api.services.names === 'function' && api.services.names().includes('vmu.report')) reportService = api.services.get('vmu.report') } catch { reportService = null }
    const pushed = pushReport({ reportService, report, at, mode: routes.mode })
    if (pushed.pushed) { state.pushes += 1; state.lastPushAt = at } else { state.pushSkips += 1 }
    state.lastSkip = pushed.pushed ? null : { reason: pushed.skipped || pushed.code || 'push-failed', code: pushed.code || null }; if (!pushed.pushed) state.lastPushSkip = state.lastSkip
    out.push = pushed
  } else {
    state.pushSkips += 1
    state.lastSkip = { reason: 'push-not-allowed-by-mode', mode: routes.mode }; state.lastPushSkip = state.lastSkip
    out.push = { ok: true, pushed: false, skipped: 'push-not-allowed-by-mode', mode: routes.mode }
  }
  return out
}

export const V3_REPORTS_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-reports', apiVersion: 1 }),
  capabilities: Object.freeze(['trigger-workflow']),
  hooks: Object.freeze({ 'v3/tick': onTick }),
})

export default V3_REPORTS_MODULE
