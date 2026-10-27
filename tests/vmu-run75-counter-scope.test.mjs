/**
 * tests/vmu-run75-counter-scope.test.mjs — a counter must say WHOSE count it is (F-70, ROUND 75).
 *
 * WHY THIS EXISTS. ROUND 70 fixed this for the records face: `records{action:"status"}` publishes
 * `shared.scope: 'this-kernel-instance'` next to counters that two kernels over one store legitimately report
 * differently. ROUND 71's live run showed the SAME counter family (mailbox `shared.pulls`, chat `counts`) without the
 * sentence — so a reader who compares two kernels still has to invent a third explanation. The rule is one rule for
 * every face that publishes a per-instance counter, so this suite pins it on the mailbox and the chat face too, and
 * pins the cross-kernel fact that makes the sentence necessary (two kernels, same store, different numbers, both true).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { createMailbox } = await import('../vibe-math-vmu/kernel/mailbox.js')
const { createChat } = await import('../vibe-math-vmu/kernel/chat.js')
const { createStore } = await import('../vibe-math-vmu/kernel/store.js')

let pass = 0
let fail = 0
const t = (name, fn) => {
  try { fn(); pass++; process.stdout.write('  ok ' + name + '\n') }
  catch (e) { fail++; process.stdout.write('  FAIL ' + name + '\n    ' + (e && e.message) + '\n') }
}

const dirs = []
const tempRoot = () => { const d = mkdtempSync(join(tmpdir(), 'vmu75-scope-')); dirs.push(d); return d }
let now = 1_800_000_000_000
const clock = () => now
const settings = { get: () => undefined, set: () => {} }

const makeMailbox = (opts = {}) => createMailbox(Object.assign({ clock, settings, log: () => {}, kernelSession: 'session-scope-a' }, opts))
const makeChat = (opts = {}) => createChat(Object.assign({ clock, settings, log: () => {}, kernelSession: 'session-scope-a' }, opts))

// ---- §1 the mailbox counters say which instance they belong to ---------------------------------
{
  const box = makeMailbox({ root: tempRoot() })
  const status = box.status()
  t('§1.1 mailbox shared publishes a scope value', () => {
    assert.equal(status.shared.scope, 'this-kernel-instance')
  })
  t('§1.2 the scope sentence says the counters are THIS instance\'s own folds', () => {
    const s = status.shared.scopeMeans
    assert.equal(typeof s, 'string')
    assert.ok(s.includes('THIS mailbox instance'), 'must name the subject: ' + s)
    assert.ok(s.includes('folds'), 'must say what the numbers count: ' + s)
  })
  t('§1.3 the sentence names the shared fact (the store key), not a number', () => {
    const s = status.shared.scopeMeans
    assert.ok(s.includes('store key'), 'must point at the durable shared fact: ' + s)
    assert.ok(s.includes(status.shared.key), 'must name the actual key on this face: ' + s)
  })
  t('§1.4 the sentence does not claim the counters are shared between kernels', () => {
    const s = status.shared.scopeMeans
    assert.ok(s.includes('Another kernel'), 'must anticipate the second reader: ' + s)
    assert.ok(!/these counters are shared/i.test(s), 'must not claim the numbers are shared: ' + s)
  })
}

// ---- §2 the chat counters say which instance they belong to --------------------------------------
{
  const chat = makeChat()
  const status = chat.status()
  t('§2.1 chat publishes countsScope', () => {
    assert.equal(status.countsScope, 'this-kernel-instance')
  })
  t('§2.2 the sentence says the counts are this VIEW\'s own book', () => {
    const s = status.countsMeans
    assert.equal(typeof s, 'string')
    assert.ok(s.includes('THIS chat instance'), 'must name the subject: ' + s)
    assert.ok(s.includes('not a total across kernels'), 'must deny the total reading: ' + s)
  })
  t('§2.3 the counts it qualifies are still published next to it', () => {
    assert.equal(typeof status.counts.sends, 'number')
    assert.equal(typeof status.counts.audit, 'number')
  })
  t('§2.4 the two scope sentences agree on the vocabulary (one rule, not two dialects)', () => {
    const a = makeMailbox({ root: tempRoot() }).status().shared
    const b = status
    assert.equal(a.scope, b.countsScope, 'the scope value must be the same token on both faces')
  })
}

// ---- §3 two kernels over one store: different numbers, both true, and each says whose it is -------
{
  const root = tempRoot()
  const storeA = createStore({ root })
  await storeA.open()
  const boxA = makeMailbox({ root, store: storeA })
  // fold once so A's own counter moves
  boxA.status()
  const aPulls = boxA.status().shared.pulls

  const storeB = createStore({ root })
  await storeB.open()
  const boxB = makeMailbox({ root, store: storeB, kernelSession: 'session-scope-b' })
  const bStatus = boxB.status()

  t('§3.1 the second kernel starts its OWN counter instead of inheriting the first one\'s', () => {
    assert.equal(typeof bStatus.shared.pulls, 'number')
    assert.ok(bStatus.shared.pulls < aPulls || aPulls <= 1, 'A pulled more times than B started with: A=' + aPulls + ' B=' + bStatus.shared.pulls)
  })
  t('§3.2 both kernels publish the same scope token (the sentence is not instance-specific)', () => {
    assert.equal(bStatus.shared.scope, 'this-kernel-instance')
  })
  t('§3.3 the shared fact they actually share is the store key', () => {
    assert.equal(bStatus.shared.key, 'mailbox')
  })
  rmSync(root, { recursive: true, force: true, maxRetries: 10 })
}

// ---- §4 the records face keeps its own scope sentence (regression of ROUND 70) -------------------
{
  const { createRecords } = await import('../vibe-math-vmu/kernel/records.js')
  const rec = createRecords({ clock, settings, log: () => {} })
  t('§4.1 the records face still publishes shared.scope', () => {
    const st = rec.status()
    assert.ok(st.shared && st.shared.scope, 'records shared.scope is missing')
  })
}

for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 10 })
process.stdout.write('=== VMU RUN75 COUNTER SCOPE: ' + pass + ' passed, ' + fail + ' failed ===\n')
if (fail) process.exitCode = 1
