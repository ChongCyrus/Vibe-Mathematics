#!/usr/bin/env node
// vmu RUN 49 — THE GATE'S VERDICT MUST OUTLIVE THE RECEIPT.
//
// THE OBSERVED DEFECT (live run 49, the chair's own report, feedback rec-14):
//   the chair opened a debate with `vibe_v5_meeting {type:"debate", subject:"rec-1", member:"r-acad"}` and read
//   `subjectGate:{allowed:true, proofBasis:"declaration-only", …}` off the open receipt — the sentence that says on
//   what evidence the debate was admitted. Afterwards NOTHING could re-read it: `summary`/`status` carried no gate,
//   `snapshot` addresses the primitive registry and refused the service id, and the minutes action does not exist.
//   The chair had to type the receipt into a progress card (rec-13) so the decision would survive, and filed rec-14.
//
// THE MECHANISM: the gate ran in the FACE (`packs/v5r/tools.js`), the verdict was printed in the face's receipt, and
// the meeting object — the thing the read faces serialize — never heard of it. A decision that exists only in the
// receipt of the call that made it is a fact someone happened to write down, not a record.
//
// THE FIX: the convening face hands the verdict (and the recommended procedure it showed) to `meetings.open`, the
// meeting row keeps it as plain data, and `summary`/`meetingView` read it back. Nothing is re-run, nothing is
// recomputed: reading the gate now cannot change it.
//
// WHAT THIS SUITE PROVES: (1) a debate's open receipt carries the gate; (2) the SAME gate is readable from
// `summary` afterwards; (3) and from `meetingView` (the face `vibe_vmu_meeting {action:"status"}` returns); (4) it
// survives `close` (archive row); (5) an ordinary meeting records no gate and says so; (6) a non-object gate never
// reaches the row (the face's own refusal stays the only path in); (7) the procedure the convenor was shown is on
// the row too, not just in the receipt.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  // C6a: a declared-complete proof needs Lean registration on the same write, so the host injects the `subprocess`
  // seam (as tests/vmu-b3-c8-c10.test.mjs does) and the fixture really settles a Lean job.
  const subprocess = {
    resolveExecutable: async (name) => '/fake/bin/' + String(name),
    spawn: () => ({ done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }), terminate() {} }),
  }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, get: (what) => (what === 'subprocess' ? subprocess : undefined), tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run49-gate-'))
try {
  const b = await boot({ root })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-gate', slot: 'chair' })

  // C6a: 声明 complete 要带 Lean 登记 —— 先真跑一次（接缝退出码 0），作业 id 就是这次写的证据。
  await mkdir(join(root, 'Formal'), { recursive: true })
  await writeFile(join(root, 'Formal', 'p49.lean'), 'theorem even_n2p : True := trivial\n', 'utf8')
  const leanRun = await callJSON(b, 'vibe_v5_lean_run', { statement: 'True', file: 'Formal/p49.lean' }, { kernel })
  const leanJob = leanRun.parsed && leanRun.parsed.id
  const settled = leanJob ? await kernel.lean.settle(leanJob) : null
  ok(!!settled && settled.passed === true, 'setup: a Lean run is settled and PASSED (the registration the card cites)', settled)

  const written = await callJSON(b, 'vibe_v5_record_proposition', {
    member: 'r-gate',
    statement: '第 49 轮的命题：对任意整数 n，n^2+n 是偶数。\n\n【范围声明】只用普通数学，不形式化。\n\n【执行语义】归纳证明，见 Formal/p49.lean。',
    value: 0.75, motive: 'run 49 复验：闸门裁决要活过回执', p: 0.9,
    proof_ref: 'Formal/p49.lean#even_n2p', proof_state: 'complete',
    lean_job: leanJob,
  }, { kernel })
  const card = written.parsed && written.parsed.recordId
  ok(!!card, 'a card with a declared proof exists to convene a debate on', written)

  // ── ① the open receipt says what the gate decided ─────────────────────────────────────────────────────────
  const opened = await callJSON(b, 'vibe_v5_meeting', { type: 'debate', subject: card, agenda: '第49轮：闸门裁决要能回读', member: 'r-gate' }, { kernel })
  const mid = opened.parsed && opened.parsed.meeting
  ok(!!mid, 'the debate was convened', opened)
  const receiptGate = opened.parsed && opened.parsed.subjectGate
  ok(receiptGate && receiptGate.allowed === true, 'the open receipt carries the gate verdict', receiptGate)
  ok(receiptGate && receiptGate.proofBasis === 'declaration-only', 'and says the admission rests on a declaration', receiptGate && receiptGate.proofBasis)
  ok(receiptGate && typeof receiptGate.note === 'string' && receiptGate.note.length > 20, 'and carries the gate note (the reasoning a reader needs)', receiptGate && receiptGate.note)

  // ── ② the SAME verdict is readable from summary afterwards ───────────────────────────────────────────────
  const summary = kernel.meetings.summary({ meeting: mid })
  ok(summary && summary.subjectGate !== null && summary.subjectGate !== undefined, 'summary carries the gate (the open receipt is no longer the only place)', summary && summary.subjectGate)
  ok(summary && summary.subjectGate && summary.subjectGate.allowed === true, 'the recorded gate still says allowed:true', summary && summary.subjectGate)
  ok(summary && summary.subjectGate && summary.subjectGate.proofBasis === 'declaration-only', 'the recorded basis is the same one the receipt printed', summary && summary.subjectGate && summary.subjectGate.proofBasis)
  ok(summary && summary.subjectGate && summary.subjectGate.note === receiptGate.note, 'the note survives verbatim (no second summary invented)', summary && summary.subjectGate && summary.subjectGate.note)
  ok(summary && typeof summary.subjectGateMeans === 'string' && /cannot change it/.test(summary.subjectGateMeans), 'and the read face says reading it cannot change it', summary && summary.subjectGateMeans)

  // ── ③ and from meetingView — the face status returns ─────────────────────────────────────────────────────
  const view = kernel.meetings.meetingView({ meeting: mid })
  ok(view && view.subjectGate && view.subjectGate.allowed === true, 'meetingView (what status returns) carries the gate too', view && view.subjectGate)
  ok(view && view.subjectGate && view.subjectGate.proofBasis === 'declaration-only', 'with the same basis', view && view.subjectGate && view.subjectGate.proofBasis)

  // ── ④ the recommended procedure is on the row, not only in the receipt ──────────────────────────────────
  ok(opened.parsed && opened.parsed.procedure !== null && opened.parsed.procedure !== undefined, 'the receipt shows the recommended procedure for a debate', opened.parsed && opened.parsed.procedure)
  const procOnRow = kernel.meetings.summary({ meeting: mid }).procedure
  ok(procOnRow !== null && procOnRow !== undefined, 'the row keeps the procedure the convenor was shown', procOnRow)
  ok(procOnRow && procOnRow.binding === 'recommendation', 'and keeps the binding label (a recommendation is not a gate)', procOnRow && procOnRow.binding)

  // ── ⑤ an ordinary meeting records no gate, and the read face says so ────────────────────────────────────
  const plain = await callJSON(b, 'vibe_v5_meeting', { type: 'ordinary', agenda: '第49轮：普通会议没有对象闸门', member: 'r-gate' }, { kernel })
  const plainId = plain.parsed && plain.parsed.meeting
  ok(!!plainId, 'an ordinary meeting was convened', plain)
  ok(plain.parsed && plain.parsed.subjectGate === null, 'its open receipt records no gate', plain.parsed && plain.parsed.subjectGate)
  const plainSummary = kernel.meetings.summary({ meeting: plainId })
  ok(plainSummary.subjectGate === null, 'and its summary says null rather than inventing one', plainSummary.subjectGate)
  ok(typeof plainSummary.subjectGateMeans === 'string' && /no subject gate verdict was recorded/.test(plainSummary.subjectGateMeans), 'the null is explained in words', plainSummary.subjectGateMeans)

  // ── ⑥ the gate survives close (the archive keeps the decision) ──────────────────────────────────────────
  // closing is the KERNEL face's word (`vibe_v5_meeting` only convenes — it has no close action), and a chair may
  // close its own meeting: the read faces must keep the gate on the ARCHIVED row, not only on the live one.
  let closed = null
  try { closed = kernel.meetings.close({ meeting: mid, actor: 'r-gate' }) } catch (e) { closed = { thrown: true, code: e && e.code, message: e && e.message } }
  ok(closed && closed.thrown !== true, 'the debate was closed', closed)
  const archived = kernel.meetings.summary({ meeting: mid })
  ok(archived && archived.state === 'closed', 'summary reads the archived row', archived && archived.state)
  ok(archived && archived.subjectGate && archived.subjectGate.allowed === true, 'the gate verdict is still there after close', archived && archived.subjectGate)

  // ── ⑦ the row stores PLAIN DATA (a gate object with methods cannot smuggle a helper into a durable row) ──
  const bad = kernel.meetings.open({ type: 'debate', subject: card, chair: 'r-gate', actor: 'r-gate', subjectGate: 'not-an-object' })
  ok(bad && bad.ok === true, 'a kernel-level open ignores a non-object gate instead of storing it', bad && bad.ok)
  ok(kernel.meetings.summary({ meeting: bad.meeting }).subjectGate === null, 'so the non-object never becomes a row value', kernel.meetings.summary({ meeting: bad.meeting }).subjectGate)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

console.log('\n=== VMU RUN 49 GATE REREAD: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }
