// tests/vmu-a2-report-transport-honest.test.mjs — RUN 230-A: A2's receipt must not confuse "armed" with "wakes you".
//
// WHAT WAS WRONG (audit A2, measured): `vibe_vmu_report {action:"status"}` answered `declared:4, armed:4, fires:0,
// neverDrives:true` and `action:"tick"` refused with `VMU_REPORT_NO_TRANSPORT` whose hint named only `deliver`. Two
// distinct facts (a) is a transport injected? (b) does delivery wake anybody? collapsed into one word "armed", and a
// reader of the refusal could not learn what would turn it on.
//
// THE DECISION (`docs/acceptance/sim-audit-decisions.md` §6 row 18): keep honesty in the framework, put the seam in the
// preset. So this suite pins BOTH halves:
//   §1 the FRAMEWORK DEFAULT (no transport) discloses the truth: `wakeMeans:"durable-mail-in-office-inbox; no loop
//      drive"`, `transportInjected:false`, `drives:false`/`neverDrives:true`, and BOTH the status and the tick refusal
//      name `vmu.report.transport` / `config.deliver` and the exact enabling value `"mailbox"`;
//   §2 the v5r PRESET ships the durable transport (`packs/v5r/settings/defaults.json` → `vmu.report.transport:
//      "mailbox"`), so a preset boot turns a progress row into a durable mail row in the office inbox — and STILL does
//      not drive the loop (`drives:false`, `wakeMeans` unchanged);
//   §3 the setting stays the owner: a deployment declaring `transport:''` in config.vmu wins over the preset default,
//      so "no transport" remains a state a receipt can tell apart from "queued".
//
// Run: node tests/vmu-a2-report-transport-honest.test.mjs
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const ENTRY = pathToFileURL(path.join(PKG_ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const require_ = createRequire(import.meta.url)

let passed = 0
const failures = []
const ok = (cond, msg, detail) => {
  if (cond) { passed++; console.log('  ok   ' + msg); return true }
  failures.push(msg); console.log('  FAIL ' + msg + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const boot = async ({ root, vmu = {} } = {}) => {
  const entry = await import(ENTRY)
  const ctx = { effect: (fn) => fn(), on: () => () => {}, get: () => undefined, tools: { register: async () => () => {} } }
  let t = 1_000
  const handle = entry.apply(ctx, { clock: () => (t += 1_000), packs: ['v5r'], root, vmu })
  await handle.ready()
  const kernel = handle.kernel
  // Capture every tick receipt: records.put fires the progress listener, and the receipt is the observable.
  const receipts = []
  const orig = kernel.report.tick.bind(kernel.report)
  kernel.report.tick = (a) => { const r = orig(a); receipts.push(r); return r }
  const lastFired = () => {
    for (let i = receipts.length - 1; i >= 0; i--) {
      const f = receipts[i] && Array.isArray(receipts[i].fired) ? receipts[i].fired : []
      if (f.length > 0) return f[0]
    }
    return null
  }
  return { kernel, receipts, lastFired, ticks: () => t }
}

const WAKE = 'durable-mail-in-office-inbox; no loop drive'

// ─── §1 the framework default (no transport) tells the whole truth ───────────────────────────────────────
console.log('=== 1. NO TRANSPORT: STATUS AND REFUSAL BOTH DISCLOSE WHAT DELIVERY IS AND WHAT WOULD ENABLE IT ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2h-'))
  try {
    // config.vmu wins over the pack's value layer, so this is the framework-default state on a preset boot.
    const { kernel, lastFired } = await boot({ root, vmu: { report: { transport: '' } } })
    await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    const st = kernel.report.status()
    ok(st.transportInjected === false, 'default: transportInjected:false', st.transportInjected)
    ok(st.wakeMeans === WAKE, 'default: status names the wake means verbatim', st.wakeMeans)
    ok(typeof st.transportEnables === 'string' && st.transportEnables.includes('vmu.report.transport'),
      'default: status names the setting that would inject a transport', st.transportEnables)
    ok(typeof st.transportEnables === 'string' && st.transportEnables.includes('"mailbox"'),
      'default: status names the exact enabling value "mailbox"', st.transportEnables)
    ok(typeof st.transportEnables === 'string' && st.transportEnables.includes('config.deliver'),
      'default: status names the alternative seam config.deliver', st.transportEnables)
    ok(st.drives === false && st.neverDrives === true, 'default: drives:false / neverDrives:true are untouched', { drives: st.drives, neverDrives: st.neverDrives })

    kernel.records.put({ track: 'progress', kind: 'progress', title: 'honest refusal', body: 'the report fires and refuses by name', settled: true })
    const fired = lastFired()
    ok(fired !== null, 'the listener still fires without a transport', fired)
    ok(fired && fired.refused && fired.refused.code === 'VMU_REPORT_NO_TRANSPORT', 'the refusal code is unchanged', fired && fired.refused && fired.refused.code)
    ok(fired && fired.refused && String(fired.refused.hint).includes('vmu.report.transport'),
      'the refusal hint names vmu.report.transport', fired && fired.refused && fired.refused.hint)
    ok(fired && fired.refused && String(fired.refused.hint).includes('"mailbox"'),
      'the refusal hint names the exact enabling value', fired && fired.refused && fired.refused.hint)
    ok(fired && fired.refused && String(fired.refused.hint).includes('config.deliver'),
      'the refusal hint names config.deliver', fired && fired.refused && fired.refused.hint)
    ok(fired && fired.refused && fired.refused.wakeMeans === WAKE, 'the refusal carries wakeMeans too', fired && fired.refused && fired.refused.wakeMeans)
    ok(fired && fired.delivered === false && fired.drives === false, 'nothing was delivered and nothing was driven', fired)
    const inbox = kernel.mailbox.pending('r-acad')
    ok(Array.isArray(inbox) && inbox.length === 0, 'and the office inbox stayed empty', Array.isArray(inbox) ? inbox.length : inbox)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

// ─── §2 the preset ships the durable transport — and delivery is still not waking ────────────────────────
console.log('=== 2. PRESET: THE TRANSPORT IS INJECTED, A PROGRESS ROW BECOMES A DURABLE OFFICE MAIL, drives STAYS FALSE ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2h-'))
  try {
    const packDefaults = require_(path.join(PKG_ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.json'))
    ok(packDefaults && packDefaults.defaults && packDefaults.defaults['vmu.report.transport'] === 'mailbox',
      'the v5r preset value layer declares the transport', packDefaults && packDefaults.defaults && packDefaults.defaults['vmu.report.transport'])

    const { kernel, lastFired } = await boot({ root })
    await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    const st = kernel.report.status()
    ok(st.transportInjected === true, 'preset: transportInjected:true', st.transportInjected)
    ok(st.wakeMeans === WAKE, 'preset: wakeMeans still says durable mail, not waking', st.wakeMeans)
    ok(st.transportEnables === null, 'preset: nothing left to enable', st.transportEnables)
    ok(st.drives === false && st.neverDrives === true, 'preset: drives:false / neverDrives:true must NOT change', { drives: st.drives, neverDrives: st.neverDrives })

    kernel.records.put({ track: 'progress', kind: 'progress', title: 'durable notice', body: 'this row is what the office must actually see', settled: true })
    const fired = lastFired()
    ok(fired !== null && fired.delivered === true, 'the fired report is delivered (queued)', fired && fired.delivered)
    ok(fired && fired.refused === null, 'and carries no refusal', fired && fired.refused)
    ok(fired && JSON.stringify(fired.to) === JSON.stringify(['office']), 'to:["office"]', fired && fired.to)
    ok(fired && fired.channel === 'inbox', 'channel:"inbox"', fired && fired.channel)
    ok(fired && fired.drives === false, 'delivery is still not a drive', fired && fired.drives)

    const inbox = kernel.mailbox.pending('r-acad')
    const row = Array.isArray(inbox) ? inbox.find((m) => m && m.from === 'report') : null
    ok(!!row, 'the office inbox holds a row from "report"', Array.isArray(inbox) ? inbox.map((m) => m && m.from) : inbox)
    ok(!!row && row.subject === 'v5r-progress-notice', 'its subject is v5r-progress-notice', row && row.subject)
    ok(!!row && row.kind === 'notice' && row.read === false, 'it is an unread durable notice row', row && { kind: row.kind, read: row.read })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

// ─── §3 the setting is still the owner: a deployment can turn it back off ───────────────────────────────
console.log('=== 3. A DEPLOYMENT DECLARING transport:"" WINS OVER THE PRESET (the named refusal stays reachable) ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2h-'))
  try {
    const { kernel } = await boot({ root, vmu: { report: { transport: '' } } })
    ok(kernel.report.status().transportInjected === false,
      'config.vmu overrides the pack value layer: the seam is absent again', kernel.report.status().transportInjected)
    const resolved = kernel.status().settings && kernel.status().settings.resolved
    const entry = resolved && resolved['vmu.report.transport']
    ok(!!entry && entry.source === 'config' && entry.value === '',
      'the resolved view names the CONFIG override (not the pack default) as the owner', entry)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log('\n' + (failures.length === 0 ? 'ALL GREEN — ' + passed + ' assertion(s)' : passed + ' passed / ' + failures.length + ' FAILED'))
if (failures.length) process.exitCode = 1
