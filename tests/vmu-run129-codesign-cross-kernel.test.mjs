#!/usr/bin/env node
// vmu RUN 129 — A BODY REWRITE IS A CHANGE (the office refused the draft the run had just built together).
//
// THE OBSERVED DEFECT (live run 129, with the receipts): the chair (office kernel) proposed a blueprint draft, a member
// continued that SAME draft inside its own kernel (a supersede: same id, same revision, one more author), and the
// office's `adopt` answered `VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN …（当前 authors：r-acad（seat 未记录））` — the member's
// author row was not in the office's copy at all, so the co-design gate refused the draft BOTH seats had just written.
//
// THE MECHANISM: one state.json is mounted by several kernels. `records` reconciles with the fold, but its change
// signature was the SET of row ids and a held row was never touched again — and `supersede` KEEPS THE ID. So a rewrite
// by another kernel was invisible to every instance that had already seen the row: exactly the shape an id-set
// signature cannot express. `shared.refreshed` now counts the rows adopted by NEWER stored copy.
//
// WHAT THIS SUITE PROVES: (1) propose-time codesign says PENDING (it has no adopter and must not pretend to judge);
// (2) the member kernel's continuation reaches the office's adopt ⇒ co-design passes; (3) the adopted document carries
// BOTH authors' sections (the body really is the merged one, not the chair's first draft); (4) the current row's
// freshness is computed from the declared window and names its source; (5) the refresh is counted, so a reader can tell
// "I re-read the fold" from "I trusted the row I loaded at boot"; (6) a local copy that is NOT older is not clobbered.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const BP = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'blueprint.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const bp = await import(pathToFileURL(BP).href)
let NOW = 1700000000000
const boot = async (root) => {
  const entry = await import(pathToFileURL(ENTRY).href)
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => NOW })
  await handle.ready()
  await handle.kernel.store.open()
  return handle
}

// The store write-through is fire-and-forget (the durable snapshot is written just after the mutation returns), so a
// second kernel can only fold what has LANDED: settle before asking it to read. Nothing here waits on a timer to pass a
// test — it waits for the durable write the product already performs.
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms))

const root = await mkdtemp(join('D:/_tmp', 'vmu-run129-codesign-'))
try {
  const office = await boot(root)
  const member = await boot(root)
  const recA = office.kernel.records
  const recB = member.kernel.records
  ok(!!recA && !!recB, '§0 both kernels carry a records projection')

  // §1 the chair proposes inside the OFFICE kernel
  NOW += 10
  const first = bp.proposeBlueprint({ records: recA, path: 'bp-run129', text: '## 正文\n院士：先写证明稿，再做互审。', by: 'r-acad' })
  ok(first.ok === true && first.continued === false, '§1 the chair files the draft', first)
  const draftId = first.id
  await settle()
  ok(first.codesign && first.codesign.pending === true && first.codesign.judged === false,
    '§1 propose has NO adopter, so codesign says PENDING rather than pretending to judge', first.codesign)
  ok(!/已由调用方校验为院士席/.test(String(first.codesign && first.codesign.inference)), '§1 the pending sentence does not claim a verified adopter', first.codesign && first.codesign.inference)

  // §2 the member continues the SAME draft inside ITS OWN kernel (a supersede: same id)
  const seenByMember = recB.list({ limit: 0 })
  ok(seenByMember.count >= 1, '§2 the member kernel can see the draft the chair filed (it folds the store before reading)', { count: seenByMember.count })
  NOW += 10
  const cont = bp.proposeBlueprint({ records: recB, path: 'bp-run129', text: '## 正文补充\n研究员：补一节误差分析。', by: 'r-1' })
  ok(cont.ok === true && cont.continued === true && cont.id === draftId, '§2 the member continues the same draft in its own kernel', { id: cont.id, draftId, continued: cont.continued })
  ok((cont.authors || []).length === 2, '§2 that kernel sees two authors', cont.authors)
  await settle()

  // §3 THE FIX: the office adopts — the member's rewrite must be visible to it
  let adopt = null
  let adoptErr = null
  try {
    NOW += 10
    adopt = bp.adoptBlueprint({ records: recA, path: 'bp-run129', draft: draftId, by: 'r-acad', staleAfterMs: 1, staleAfterMsSource: 'setting' })
  } catch (e) { adoptErr = e }
  ok(adoptErr === null, '§3 the office adopts the draft both seats wrote (before the fix this threw VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN)', adoptErr && { code: adoptErr.code, message: adoptErr.message })
  if (adopt) {
    ok(adopt.codesign && adopt.codesign.ok === true, '§3 co-design passes with the adopter present', adopt.codesign)
    ok(adopt.codesign && adopt.codesign.hasChair === true && adopt.codesign.hasResident === true, '§3 both sides are named', adopt.codesign)
    ok(adopt.codesign && adopt.codesign.judged === true && adopt.codesign.pending !== true, '§3 adopt-time codesign is a judgement, not a pending note', adopt.codesign)
  }

  // §4 the adopted document is the MERGED one (both sections), not the chair's first draft
  const state = bp.blueprintState({ records: recA, path: 'bp-run129', staleAfterMs: 1, staleAfterMsSource: 'setting' })
  ok(state.hasCurrent === true && state.currentRevision === 1, '§4 the adopted revision is in force', { hasCurrent: state.hasCurrent, currentRevision: state.currentRevision })
  const inForceRow = state.current ? recA.get({ id: state.current.id }) : null
  const inForce = inForceRow ? String(inForceRow.body) : ''
  ok(inForce.includes('院士：先写证明稿') && inForce.includes('研究员：补一节误差分析'),
    '§4 the document in force carries BOTH authors\' sections', inForce.slice(0, 200))

  // §5 freshness is computed from the declared window and names its source
  NOW += 50
  const later = bp.blueprintState({ records: recA, path: 'bp-run129', staleAfterMs: 1, staleAfterMsSource: 'setting' })
  ok(later.staleAfterMs === 1 && later.staleAfterMsSource === 'setting', '§5 the window is the declared one and says so', { staleAfterMs: later.staleAfterMs, source: later.staleAfterMsSource })
  ok(later.freshness && later.freshness.stale === true, '§5 one millisecond later the blueprint is overdue', later.freshness && { stale: later.freshness.stale, ageMs: later.freshness.ageMs })

  // §6 the reconciliation is COUNTED (a reader can tell "re-read" from "loaded once at boot")
  const sharedView = recA.status().shared
  ok(sharedView && sharedView.refreshed >= 1, '§6 the office counted the refreshed row', sharedView && { refreshed: sharedView.refreshed, pulled: sharedView.pulled, skipped: sharedView.skipped })
  ok(typeof sharedView.refreshedMeans === 'string' && sharedView.refreshedMeans.length > 40, '§6 the counter explains itself', sharedView && sharedView.refreshedMeans)

  // §7 NOT-CLOBBER: a local copy that is not older stays. The member's kernel is the one that WROTE the newer body, so
  // its own copy must still be the one it wrote (equal stamps ⇒ local wins), and a second read must be stable.
  const officeBody = String(recA.get({ id: draftId }).body || '')
  const memberBody = String(recB.get({ id: draftId }).body || '')
  ok(officeBody.includes('研究员：补一节误差分析') && officeBody === memberBody,
    '§7 both kernels read the same rewritten body (convergence, not clobber)', { same: officeBody === memberBody })
  const again = String(recA.get({ id: draftId }).body || '')
  ok(again === officeBody, '§7 a second read is stable (no rewrite ping-pong)', { same: again === officeBody })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}

console.log('\n=== RUN 129 CODESIGN CROSS-KERNEL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('failures:\n - ' + failures.join('\n - ')); process.exit(1) }
