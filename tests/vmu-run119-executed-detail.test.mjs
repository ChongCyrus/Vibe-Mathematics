// ★ RUN 119 — F-119b: `executed` was a COUNT on the main step receipt, so a caller could not read WHICH actions the turn
// dispatched. Same defect family as run 37's count-only `skipped`, one field over: the kernel decided something and the
// receipt could not name it. A count tells you THAT something happened, never WHAT.
//
// THE LIVE MEASUREMENT: the r-1 step receipt carried `"executed":0, "skipped":0, "skippedDetail":[]` and did not carry
// `executedDetail` at all — while another receipt path (the "no pending member" one) already did. Two builders of one
// receipt shape, only one honest. This suite pins the MAIN path, and pins that count and detail AGREE: an empty list under
// a non-zero count would be the same defect wearing a new key.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const NL = String.fromCharCode(10)
// One DISPATCHED action (`progress` → records.put) plus one reading-only line (`say`, which has no meeting here) so the
// receipt has to tell the two apart instead of counting them together.
const FENCED = ['```json', '{"say":"先记进度","progress":{"track":"progress","title":"一轮只做一件事","body":"写下了卡","settled":true}}', '```'].join(NL)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r119x-')); roots.push(d); return d }
const boot = async (root) => {
  const K = createKernel({
    clock: () => 1000, settings: {}, root,
    deliverTurn: async () => ({ reply: FENCED, childId: 'session-child-x' }),
    slots: [
      { id: 'chair', capacity: 1, permissions: ['speak', 'vote', 'decide'] },
      { id: 'member', capacity: 4, permissions: ['speak', 'vote'] },
      { id: 'temp', capacity: 4, permissions: ['speak'] },
    ],
  })
  await K.store.open()
  return K
}

try {
  console.log('§1 the main step receipt carries the DISPATCHED rows, not only their count')
  const root = await mkRoot()
  const K = await boot(root)
  await K.members.hire({ id: 'r-1', slot: 'member' })
  const step = await K.turn.step({ members: ['r-1'], phase: 'normal', why: '§1 executedDetail' })
  const r = (step && step.receipt) || {}
  ok(step && step.ok === true, 'the member turn settles', { ok: step && step.ok, code: step && step.code })
  ok(typeof r.executed === 'number' && r.executed >= 1, 'the count says at least one action was dispatched', r.executed)
  ok(Array.isArray(r.executedDetail), '★ executedDetail is a LIST (this is the key that was missing on the live receipt)', r.executedDetail)
  ok(Array.isArray(r.executedDetail) && r.executedDetail.length === r.executed,
    '★ the detail and the count agree (an empty list under a non-zero count would be the same defect with a new key)',
    { n: Array.isArray(r.executedDetail) ? r.executedDetail.length : null, count: r.executed })
  const row = Array.isArray(r.executedDetail) ? r.executedDetail[0] : null
  ok(row && row.field === 'progress', 'each row names the FIELD the action came from', row && row.field)
  ok(row && typeof row.face === 'string' && typeof row.op === 'string',
    'and the face + op it was dispatched to (a row without a destination names nothing)', row && { face: row.face, op: row.op })
  ok(row && row.result && row.result.ok === true && typeof row.result.id === 'string',
    'and what that face answered (the receipt can be audited without the log)', row && row.result && { ok: row.result.ok, id: row.result.id })
  ok(typeof r.executedMeans === 'string' && /COUNT/.test(r.executedMeans) && /detail/.test(r.executedMeans),
    '★ executedMeans says which slot is the count and which is the detail', r.executedMeans)
  ok(/empty list means nothing was dispatched/i.test(String(r.executedMeans)),
    'and that an empty list means "nothing dispatched", never "the list was dropped"', r.executedMeans)

  console.log('§2 the reading-only line is NOT counted as dispatched work')
  ok(r.skipped === 1 && Array.isArray(r.skippedDetail) && r.skippedDetail.length === 1,
    'the `say` line lands in skipped with its own detail (the two lists stay separate)', { skipped: r.skipped, detail: r.skippedDetail })
  ok(r.skippedDetail[0] && r.skippedDetail[0].field === 'say' && r.skippedDetail[0].reason === 'no-meeting-bound',
    'and names why it was not dispatched', r.skippedDetail[0])
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* best effort */ } }
}

console.log('\n=== RUN 119 EXECUTED DETAIL: passed=' + passed + ' failed=' + failed + ' ===')
if (failed > 0) process.exit(1)
