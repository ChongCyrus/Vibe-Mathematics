// tests/vmu-storepolicy-falsify.test.mjs — FAMILY 9: `kernel/storepolicy.js`, the LOCK RELEASE discipline
// (the F18-adjacent claim: a lock must be freed on the way out, so the next writer is not blocked forever).
// Run: node tests/vmu-storepolicy-falsify.test.mjs
//
// The probe reads the whole lifecycle, each direction with a control:
//   · ACQUIRE      — the first acquire takes the lock (locked:true, holder named);
//   · EXCLUSION    — a second acquire while held is refused BY NAME (`VMU_CONFLICT`), so the lock is not decorative;
//   · RELEASE      — release reports `released:true` AND the next acquire then SUCCEEDS (this is the discipline);
//   · HONESTY      — releasing a name that was never held reports `released:false` (no pretended release);
//   · STATUS       — while held, `status().locks` counts it.
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const STOREPOLICY = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'storepolicy.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

function storepolicyProbe(mod) {
  const mk = () => mod.createStorePolicy({ clock: () => 0, log: () => {}, settings: { 'vmu.store.backend': 'memory' } })
  const s = mk()
  const first = s.acquire({ name: 'db', by: 'm1' })
  const second = s.acquire({ name: 'db', by: 'm2' })          // must be refused while held
  const heldStatus = s.status().locks
  const released = s.release({ name: 'db' })
  const afterRelease = s.acquire({ name: 'db', by: 'm2' })    // must succeed: the release really freed it
  const neverHeld = mk().release({ name: 'never-held' })
  return {
    firstLocked: first.ok === true && first.locked === true && first.holder === 'm1',
    secondCode: second.ok === false ? second.code : 'allowed',
    statusLocks: heldStatus,
    releasedFlag: released.released === true,
    afterReleaseOk: afterRelease.ok === true && afterRelease.locked === true,
    unknownReleased: neverHeld.released === false,
  }
}

// ROUND 9 adds a SECOND case, because "the lock is released" was only one of the face's load-bearing claims:
//   · ONE LANE  — `vmu.store.lock.serializeAll=true` must make TWO DIFFERENT NAMES the SAME lock (the receipt says
//     `serialized:true`, so the flag has to decide something), and the nameless release must free that one lane;
//   · THE WAIT IS BOUNDED BY BOTH DECLARED KNOBS, ON THE VIRTUAL CLOCK — a held lock refuses with `attempts` capped
//     by `vmu.store.lock.retries` and `waitedMs` advanced by `vmu.store.lock.backoffMs` × attempts (the refusal
//     text itself claims "当前等待 N ms / 上限 M ms，退避 K 次", so those three numbers are the reading).
function storepolicyLaneProbe(mod) {
  const mk = (over, clock) => mod.createStorePolicy({
    clock: clock || (() => 0), log: () => {},
    settings: Object.assign({ 'vmu.store.backend': 'memory' }, over || {}),
  })
  // (a) serializeAll ⇒ one lane for every name.
  const ser = mk({ 'vmu.store.lock.serializeAll': true })
  const first = ser.acquire({ name: 'a', by: 'm1' })
  const second = ser.acquire({ name: 'b', by: 'm2' })          // a DIFFERENT name, and it must still conflict
  const released = ser.release({})                             // no name ⇒ the single lane
  const afterRelease = ser.acquire({ name: 'b', by: 'm2' })
  // control direction: without serializeAll the two names are two independent lanes.
  const open = mk()
  const o1 = open.acquire({ name: 'a', by: 'm1' })
  const o2 = open.acquire({ name: 'b', by: 'm2' })
  // (b) the refusal's wait accounting, on the injected clock.
  const held = mk({ 'vmu.store.lock.timeoutMs': 1000, 'vmu.store.lock.retries': 3, 'vmu.store.lock.backoffMs': 25 })
  held.acquire({ name: 'k', by: 'holder' })
  const busy = held.acquire({ name: 'k', by: 'waiter' })
  return {
    singleLane: first.ok === true && first.name === '*',
    // `serialized` is carried by the SUCCESS receipt (the conflict refusal reports the wait accounting instead), so
    // the control direction is read from the acquire that worked.
    serializedFlag: first.serialized === true,
    secondSerialized: second.serialized === true,
    secondCode: second.ok === false ? second.code : 'allowed',
    releaseFreedLane: released.released === true && afterRelease.ok === true,
    distinctLanesCoexist: o1.ok === true && o2.ok === true,
    waitCode: busy.ok === false ? busy.code : 'allowed',
    attempts: busy.attempts === undefined ? -1 : busy.attempts,
    waitedMs: busy.waitedMs === undefined ? -1 : busy.waitedMs,
    timeoutMs: busy.timeoutMs === undefined ? -1 : busy.timeoutMs,
    lockWaits: held.status().counters.lockWaits,
    stillHeld: held.status().locks,
  }
}

/**
 * The REMOTE policy surface: the four combinations `docs/07` promises to decide, plus the url precondition. Every
 * branch is read as a NAMED outcome (a code, or the `queued` flag), and the control direction is the online write
 * that must NOT be queued — so "refused" and "queued" cannot be confused with "the face never ran".
 */
function storepolicyRemoteProbe(mod) {
  const mk = (over) => mod.createStorePolicy({
    clock: () => 0, log: () => {},
    settings: Object.assign({ 'vmu.store.backend': 'memory', 'vmu.store.remote': 'on', 'vmu.store.remote.url': 'https://r.example' }, over || {}),
  })
  const online = mk().write({ id: 'a' })
  const noUrl = mk({ 'vmu.store.remote.url': '' }).write({ id: 'a' })
  const offlineRefuse = mk({ 'vmu.store.remote.offlinePolicy': 'refuse' }).write({ id: 'a', online: false })
  const queueBox = mk({ 'vmu.store.remote.offlinePolicy': 'queue' })
  const queued = queueBox.write({ id: 'a', online: false })
  const strong = mk({ 'vmu.store.remote.consistency': 'strong', 'vmu.store.remote.offlinePolicy': 'queue' }).write({ id: 'a', online: false })
  return {
    onlineOk: online.ok === true && online.queued === false,
    remoteFired: Array.isArray(online.fired) && online.fired.indexOf('vmu.store.remote') !== -1,
    noUrlCode: noUrl.ok === false ? noUrl.code : 'allowed',
    offlineRefuseCode: offlineRefuse.ok === false ? offlineRefuse.code : 'allowed',
    queuedOk: queued.ok === true && queued.queued === true,
    queueCounted: queueBox.status().counters.queued,
    // `strong` cannot defer a write, so it must refuse BEFORE the offline policy is ever asked
    strongCode: strong.ok === false ? strong.code : 'allowed',
    strongQueued: strong.queued === true,
  }
}

const family = await falsifyFamily({
  name: 'storepolicy — the lock is exclusive, a release really frees it, one lane means one lane',
  cases: [{
    name: 'storepolicy.js — release discipline',
    module: STOREPOLICY,
    probe: storepolicyProbe,
    controlFields: ['firstLocked', 'releasedFlag', 'afterReleaseOk', 'unknownReleased'],
    mutations: [
      { label: 'release reports the lock but keeps it', name: 'storepolicy-release-keeps',
        find: '    const had = locks.delete(name)\n', replace: '    const had = locks.has(name)   // MUTANT: the lock is reported as released and kept\n' },
      { label: 'acquire never records the holder', name: 'storepolicy-acquire-noop',
        find: 'locks.set(name, { by: String(args.by || \'anon\'), at: clock() })',
        replace: 'locks.set(\'mutant-noop\', { by: String(args.by || \'anon\'), at: clock() })   // MUTANT: the lock is never taken under its name' },
    ],
  }, {
    name: 'storepolicy.js — one lane, and the wait accounting',
    module: STOREPOLICY,
    probe: storepolicyLaneProbe,
    controlFields: ['singleLane', 'serializedFlag', 'releaseFreedLane', 'distinctLanesCoexist', 'timeoutMs', 'lockWaits'],
    mutations: [
      { label: 'serializeAll claims one lane but keeps using the caller\'s name', name: 'storepolicy-serializeAll-noop',
        find: "const name = c.lockSerializeAll ? '*' : String(args.name || 'default')",
        replace: "const name = String(args.name || 'default')   // MUTANT: the flag is reported as `serialized`, never applied" },
      { label: 'the declared retry cap no longer bounds the wait', name: 'storepolicy-retry-cap-unbounded',
        find: 'while (waited < c.lockTimeoutMs && attempts < c.lockRetries) {',
        replace: 'while (waited < c.lockTimeoutMs && attempts < c.lockRetries + 100) {   // MUTANT: the declared cap is decorative' },
      { label: 'the backoff never advances the virtual clock', name: 'storepolicy-backoff-zero',
        find: 'waited += c.lockBackoffMs',
        replace: 'waited += 0   // MUTANT: the reported wait does not come from the declared backoff' },
    ],
  }, {
    name: 'storepolicy.js — the remote policy really decides',
    module: STOREPOLICY,
    probe: storepolicyRemoteProbe,
    controlFields: ['onlineOk', 'remoteFired', 'noUrlCode', 'offlineRefuseCode', 'queuedOk', 'queueCounted', 'strongCode'],
    mutations: [
      { label: 'the declared offline policy stops deciding (refuse is queued instead)', name: 'storepolicy-offline-policy-ignored',
        find: "        if (c.remoteOfflinePolicy === 'refuse') return deny('VMU_NOT_PERMITTED', '远端离线且 offlinePolicy=refuse ⇒ 拒', '改为 queue 或等联网', ['vmu.store.remote.offlinePolicy', 'vmu.store.remote.consistency'], would)",
        replace: '        if (false) return deny(\'VMU_NOT_PERMITTED\', \'MUTANT: the offline policy no longer refuses\', \'x\', [\'vmu.store.remote.offlinePolicy\'], would)' },
      { label: 'strong consistency queues a deferred write', name: 'storepolicy-strong-queues',
        find: "        if (c.remoteConsistency === 'strong') {",
        replace: "        if (false) {   // MUTANT: a strong-consistency write is deferred" },
      { label: 'offline is never noticed (the caller said offline and we wrote anyway)', name: 'storepolicy-offline-ignored',
        find: '      if (args.online === false) {',
        replace: '      if (false) {   // MUTANT: the offline signal from the caller is ignored' },
      { label: 'remote=on without a url is accepted', name: 'storepolicy-remote-url-unchecked',
        find: '      if (!c.remoteUrl) return deny(',
        replace: '      if (false) return deny(' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated lock is exclusive and a release frees it ===')
ok(family.cases[0].real.firstLocked === true && family.cases[0].real.statusLocks === 1,
  '★ the first acquire takes the lock and status() counts it', family.cases[0].real)
ok(family.cases[0].real.secondCode === 'VMU_CONFLICT',
  '★ a second acquire while held is refused BY NAME (the lock is not decorative)', family.cases[0].real)
ok(family.cases[0].real.releasedFlag === true && family.cases[0].real.afterReleaseOk === true,
  '★ release reports released:true AND the next acquire succeeds (the lock was really freed)', family.cases[0].real)
ok(family.cases[0].real.unknownReleased === true,
  'and releasing a name that was never held reports released:false (control direction: no pretended release)', family.cases[0].real)

console.log('=== CONTROL GROUP: serializeAll really makes one lane, and the wait is bounded by BOTH knobs ===')
const lane = family.cases[1].real
ok(lane.singleLane === true && lane.secondCode === 'VMU_CONFLICT' && lane.serializedFlag === true,
  '★ with serializeAll=true two DIFFERENT names are the same lock, and the receipt says `serialized:true`', lane)
ok(lane.releaseFreedLane === true,
  '★ the nameless release frees that one lane (the single lane is not a one-way door)', lane)
ok(lane.distinctLanesCoexist === true,
  'and without the flag two names are two independent lanes (control direction: the flag is what changed)', lane)
ok(lane.waitCode === 'VMU_CONFLICT' && lane.attempts === 3 && lane.waitedMs === 75 && lane.timeoutMs === 1000 && lane.lockWaits === 1 && lane.stillHeld === 1,
  '★ a held lock refuses with attempts capped by `retries` and waitedMs advanced by `backoffMs` (25×3=75) on the injected clock', lane)

console.log('=== CONTROL GROUP: the remote policy decides every combination, and says which one it took ===')
const rem = family.cases[2].real
ok(rem.onlineOk === true && rem.remoteFired === true,
  '★ an ONLINE remote write is a normal write (not queued) and the receipt names `vmu.store.remote` as fired', rem)
ok(rem.noUrlCode === 'VMU_INVALID_ARGUMENT' && rem.offlineRefuseCode === 'VMU_NOT_PERMITTED' && rem.strongCode === 'VMU_NOT_PERMITTED',
  '★ remote=on without a url, offline+refuse, and offline+STRONG each refuse BY NAME — three different branches, three named refusals', rem)
ok(rem.queuedOk === true && rem.queueCounted === 1 && rem.strongQueued === false,
  '★ only offline+queue is accepted and counted, and `strong` never queues (it cannot defer a write)', rem)

console.log('=== FALSIFICATION: keep the lock on release, never take it, make the knobs decorative, or let offline through ===')
ok(family.ok, '★ all nine storepolicy mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const keepRed = byLabel('release reports the lock') && byLabel('release reports the lock').red
const noopRed = byLabel('never records the holder') && byLabel('never records the holder').red
ok(!!keepRed && keepRed.releasedFlag === true && keepRed.afterReleaseOk === false && keepRed.secondCode === 'VMU_CONFLICT',
  '★ "release keeps it": the receipt says released while the next writer is still blocked — the classic "lock leak"', keepRed)
ok(!!noopRed && noopRed.secondCode === 'allowed' && noopRed.firstLocked === true,
  '★ "never records the holder": two writers hold the same lock at once (exclusion is gone) while the receipt still says locked', noopRed)
const laneRed = byLabel('claims one lane but keeps') && byLabel('claims one lane but keeps').red
const capRed = byLabel('retry cap no longer bounds') && byLabel('retry cap no longer bounds').red
const backoffRed = byLabel('backoff never advances') && byLabel('backoff never advances').red
ok(!!laneRed && laneRed.singleLane === false && laneRed.secondCode === 'allowed' && laneRed.secondSerialized === true,
  '★ "serializeAll is decorative": two writers hold the same store at once, and the second receipt still claims `serialized:true`', laneRed)
ok(!!capRed && capRed.attempts === 40 && capRed.waitedMs === 1000 && capRed.timeoutMs === 1000,
  '★ "the cap is decorative": the wait is now bounded by the timeout alone — 40 backoffs where `retries` declared 3', capRed)
ok(!!backoffRed && backoffRed.waitedMs === 0 && backoffRed.attempts === 3,
  '★ "the clock never advances": the refusal claims a wait while the backoff it names added nothing', backoffRed)
const offlinePolicyRed = byLabel('offline policy stops deciding') && byLabel('offline policy stops deciding').red
const strongRed = byLabel('strong consistency queues') && byLabel('strong consistency queues').red
const offlineIgnoredRed = byLabel('offline is never noticed') && byLabel('offline is never noticed').red
const urlRed = byLabel('without a url is accepted') && byLabel('without a url is accepted').red
ok(!!offlinePolicyRed && offlinePolicyRed.offlineRefuseCode === 'allowed' && offlinePolicyRed.queuedOk === true && offlinePolicyRed.strongCode === 'VMU_NOT_PERMITTED',
  '★ "offline policy ignored": the declared `refuse` becomes a queue — while the STRONG branch still refuses (the mutation is narrow)', offlinePolicyRed)
ok(!!strongRed && strongRed.strongCode === 'allowed' && strongRed.strongQueued === true && strongRed.offlineRefuseCode === 'VMU_NOT_PERMITTED',
  '★ "strong queues": a strong-consistency write is now DEFERRED, the exact silent contradiction the branch exists to stop (and `refuse` still decides on its own)', strongRed)
ok(!!offlineIgnoredRed && offlineIgnoredRed.offlineRefuseCode === 'allowed' && offlineIgnoredRed.strongCode === 'allowed' && offlineIgnoredRed.queueCounted === 0,
  '★ "offline ignored": the caller said offline and BOTH policies stopped being consulted — nothing is refused and nothing is queued', offlineIgnoredRed)
ok(!!urlRed && urlRed.noUrlCode === 'allowed' && urlRed.onlineOk === true,
  '★ "url unchecked": remote=on without a url writes happily (the precondition is gone, the other branches are untouched)', urlRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases.length > 0 && family.cases.every((c) => c.leftovers.length === 0),
  'the mutated copies were written to D:\\_tmp and deleted again', family.cases.map((c) => c.leftovers))

console.log('')
console.log('=== VMU STOREPOLICY FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
