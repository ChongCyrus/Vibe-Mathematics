// tests/vmu-run236-a2-report-fires.test.mjs — A2 pinned on a REAL assembly (task-25 / RUN 236).
//
// THE RULE (宏观 v5r 规则 L3): the office is an assistant; 有进展时它要自动被唤起汇报 (a progress record
// must REACH the office by itself, not only when somebody remembers to ask).
//
// THE AUDIT'S COMPLAINT (docs/acceptance/sim-audit-rules.md, A2 = UNREACHABLE): the earlier probe saw
// `vibe_vmu_report {action:"tick"}` answer `fires:0` + `VMU_REPORT_NO_TRANSPORT`, so the mechanism looked
// absented. That measurement predates `packs/v5r/settings/defaults.json` gaining
// `"vmu.report.transport": "mailbox"` (RUN 230-A). On the CURRENT tree the chain is reachable end to end,
// and this file pins it on a real kernel + real tool registry (scripts/sim/harness.mjs#boot), so it can
// never silently regress to "mechanism exists in source but delivers nothing".
//
// WHAT IS PINNED (each assertion has a non-vacuous guard first):
//   ① the v5r preset DECLARES the progress report and arms it (event `progress`, channel `inbox`, to office);
//   ② the transport is actually INJECTED and its voice is honest: `drives:false` / `neverDrives:true` —
//      delivery is durable mail, NOT a loop drive (asserting `drives:true` would be the lie here);
//   ③ writing a progress record as a member's own turn dispatches a report WITHOUT an explicit tick
//      (`fires` grows on its own — this is 自动唤起);
//   ④ an explicit `tick {event:"progress"}` delivers a second notice, `delivered:true`, `drives:false`;
//   ⑤ the office's inbox really holds those notices (from `report`, subject `v5r-progress-notice`), twice
//      for one progress write + one tick — the receipt and the mailbox agree, and the "two notices for one
//      write" is recorded here as a CANDIDATE DUPLICATE DELIVERY (not repaired by this test).
//
// Run: node tests/vmu-run236-a2-report-fires.test.mjs

import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const TMP = 'D:/_tmp/vmu-run236'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 600)))
  }
}

const HARNESS = await import(pathToFileURL(join(REPO, 'scripts/sim/harness.mjs')).href)
mkdirSync(TMP, { recursive: true })
const root = mkdtempSync(join(TMP, 'a2-'))
const h = await HARNESS.boot({ root })
const as = (id) => ({ as: { agent: { id } } })

// ── premise: a founded institute with a chair and two researchers ───────────────────────
const start = await h.call('vibe_v5_start', { problem: 'A2 真装配：进展自动唤起汇报', researcherCount: 2 })
ok(start && start.ok === true, 'premise: the institute is founded on a real kernel', start && { ok: start.ok, hired: start.hired })
ok(Array.isArray(start && start.hired) && start.hired.includes('r-acad') && start.hired.includes('r-1'),
  'premise: the chair and a researcher are on the roster', start && start.hired)

// ── ① the preset declares + arms the progress report ────────────────────────────────────
const decl = await h.call('vibe_vmu_report', { action: 'declarations' })
ok(decl && decl.ok === true && Array.isArray(decl.items) && decl.items.length > 0,
  'declarations are readable and non-empty', decl && { ok: decl.ok, declared: decl.declared })
const items = (decl && Array.isArray(decl.items)) ? decl.items : []
ok(items.length > 0 && decl.declared === items.length, 'every declared report is listed (declared === items.length)',
  { declared: decl && decl.declared, items: items.length })
const progressReport = items.filter((it) => it && it.name === 'v5r-progress-notice')[0] || null
ok(Boolean(progressReport), 'the v5r preset declares the progress notice', items.map((it) => it && it.name))
ok(Boolean(progressReport) && progressReport.enabled === true && progressReport.kind === 'event' && progressReport.event === 'progress',
  'the progress notice is ENABLED and triggered by the `progress` event', progressReport && { enabled: progressReport.enabled, kind: progressReport.kind, event: progressReport.event })
ok(Boolean(progressReport) && progressReport.channel === 'inbox' && Array.isArray(progressReport.to) && progressReport.to.includes('office'),
  'the progress notice is addressed to the office over the inbox channel', progressReport && { channel: progressReport.channel, to: progressReport.to })

// ── ② the transport is injected, and it does NOT claim a loop drive ────────────────────
const before = await h.call('vibe_vmu_report', { action: 'status' })
ok(before && before.ok === true, 'status is readable before any progress', before && before.ok)
ok(before && before.transportInjected === true, 'the transport is REALLY injected (defaults.json vmu.report.transport:"mailbox")',
  before && { transportInjected: before.transportInjected })
ok(before && before.drives === false && before.neverDrives === true, 'delivery is reported as a mail, not as a loop drive (drives:false / neverDrives:true)',
  before && { drives: before.drives, neverDrives: before.neverDrives })
ok(before && typeof before.wakeMeans === 'string' && before.wakeMeans.includes('durable-mail-in-office-inbox'),
  'the honest sentence names the delivery MECHANISM (wakeMeans names the durable office-inbox mail)',
  before && before.wakeMeans)
ok(before && typeof before.fires === 'number', 'status counts firings (fires is a number, not a placeholder)', before && before.fires)
const firesBefore = before && typeof before.fires === 'number' ? before.fires : 0

// ── ③ a member's own progress write dispatches a report by itself ──────────────────────
const prog = await h.call('vibe_v5_record_progress', { member: 'r-1', track: 'progress', content: '完成了第 1 段推导；障碍：无；下一步：写卡' }, as('r-1'))
ok(prog && prog.ok === true, "the member's own turn can write a progress record", prog && { ok: prog.ok, code: prog.code, message: prog.message })
ok(prog && prog.memberActed === true, 'the write is attributed to the MEMBER acting in its own turn (memberActed:true)',
  prog && { memberActed: prog.memberActed, actedForMember: prog.actedForMember })
ok(prog && typeof prog.recordId === 'string' && prog.recordId !== '', 'the progress row has an id', prog && prog.recordId)

const afterWrite = await h.call('vibe_vmu_report', { action: 'status' })
ok(afterWrite && afterWrite.ok === true, 'status is readable after the progress write', afterWrite && afterWrite.ok)
const firesAfterWrite = afterWrite && typeof afterWrite.fires === 'number' ? afterWrite.fires : firesBefore
ok(firesAfterWrite > firesBefore, 'A PROGRESS WRITE FIRES THE REPORT BY ITSELF (fires strictly grew with no explicit tick)',
  { before: firesBefore, after: firesAfterWrite })
ok(afterWrite && afterWrite.delivered >= 1, 'the automatic firing was DELIVERED, not just armed', afterWrite && { delivered: afterWrite.delivered, failures: afterWrite.failures })

// ── ④ an explicit tick of the same event delivers another notice, honestly flagged ─────
const tick = await h.call('vibe_vmu_report', { action: 'tick', event: 'progress' })
ok(tick && tick.ok === true, 'tick {event:"progress"} answers a receipt', tick && { ok: tick.ok, code: tick.code, message: tick.message })
const fired = (tick && Array.isArray(tick.fired)) ? tick.fired : []
ok(fired.length > 0, 'the tick fired at least one declared report', fired.map((f) => f && f.name))
ok(fired.length > 0 && fired.every((f) => f && f.delivered === true), 'every fired report was delivered', fired.map((f) => f && { name: f.name, delivered: f.delivered }))
ok(fired.length > 0 && fired.every((f) => f && f.drives === false), 'no fired report claims to drive a loop (drives:false on every entry)',
  fired.map((f) => f && { name: f.name, drives: f.drives }))
ok(fired.length > 0 && fired.every((f) => f && f.refused === null && f.error === null), 'no fired report carries an error or a refusal', fired.map((f) => f && { refused: f.refused, error: f.error }))
ok(fired.some((f) => f && f.name === 'v5r-progress-notice'), 'the progress notice is among the fired reports', fired.map((f) => f && f.name))

// ── ⑤ the office's inbox really holds the notices ─────────────────────────────────────
const inbox = await h.call('vibe_v5_inbox', { action: 'list', member: 'r-acad' })
ok(inbox && inbox.ok === true && Array.isArray(inbox.rows) && inbox.rows.length > 0,
  "the office's inbox is non-empty after the firings", inbox && { ok: inbox.ok, count: inbox.count })
const rows = (inbox && Array.isArray(inbox.rows)) ? inbox.rows : []
const notices = rows.filter((r) => r && r.from === 'report' && r.subject === 'v5r-progress-notice')
ok(notices.length >= 2, 'ONE progress write + ONE tick left TWO delivered notices (candidate duplicate delivery, recorded not repaired)',
  { rows: rows.length, notices: notices.length, subjects: rows.map((r) => r && r.subject) })
ok(notices.length > 0 && notices.every((r) => r.read === false || r.read === true), 'the notice rows are real mailbox rows (they carry read state)',
  notices.map((r) => r && { id: r.id, read: r.read }))
ok(notices.length > 0 && notices.every((r) => typeof r.id === 'string' && r.id !== ''), 'every notice row has a mailbox id',
  notices.map((r) => r && r.id))

console.log('\n=== vmu-run236 A2 report fires: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures: ' + JSON.stringify(failures))
  process.exitCode = 1
}
