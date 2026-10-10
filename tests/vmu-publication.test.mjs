// tests/vmu-publication.test.mjs — kernel/publication.js (batch-3 slice 4).
// Scenarios: version-chain jumps/rollbacks refused with current + legal next; "on request" availability
// refused; claimed registration without receipt refused (offline pending works); badge mismatch refused;
// failed replication recorded as a first-class result; counted truncation; zero-config; determinism.
import { createPublication, VERSION_CHAIN, isVague } from '../vibe-math-vmu/kernel/publication.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, current: e && e.current, legalNext: e && e.legalNext, missing: e && e.missing } } }

let now = 1000
const mk = (settings = {}, opts = {}) => createPublication({ clock: () => now, settings, listCap: 100, ...opts })

// 1) new paper must start at the chain head; unknown versions refused
{
  const p = mk()
  const r = rejects(() => p.submitPack({ paperId: 'p1', venue: 'J.', version: 'vor' }))
  ok(r.threw && r.code === 'VMU_VERSION_CHAIN_BROKEN' && r.legalNext === 'preprint', 'new paper must start at preprint')
  const r2 = rejects(() => p.submitPack({ paperId: 'p2', venue: 'J.', version: 'nonsense' }))
  ok(r2.threw && r2.code === 'VMU_VERSION_CHAIN_BROKEN', 'unknown version refused')
  ok(VERSION_CHAIN.join('->') === 'preprint->accepted->vor->erratum', 'chain constant')
}

// 2) submission pack (G2): incomplete pack refused; complete pack produced
{
  const p = mk()
  const bad = rejects(() => p.submitPack({ paperId: 'p3' }))
  ok(bad.threw && bad.code === 'VMU_SUBMISSION_INCOMPLETE' && bad.missing.includes('venue'), 'pack without venue refused (names what is missing)')
  const good = p.submitPack({ paperId: 'p3', venue: 'Journal of X', jats: '<article/>' })
  ok(good.status === 'ready' && good.jatsVersion === 'JATS-1.3' && good.at === 1000, 'pack ready with jats version and injected clock')
}

// 3) version chain: legal step works; skip and rollback refused with current + legal next
{
  const p = mk()
  p.submitPack({ paperId: 'c1', venue: 'J.' })
  const skip = rejects(() => p.advance({ paperId: 'c1', to: 'vor' }))
  ok(skip.threw && skip.code === 'VMU_VERSION_CHAIN_BROKEN' && /skipping/.test(skip.msg) && skip.legalNext === 'accepted', 'version skipping refused with legal next')
  const a1 = p.advance({ paperId: 'c1', to: 'accepted' })
  ok(a1.version === 'accepted' && a1.legalNext === 'vor', 'legal advance works')
  const back = rejects(() => p.advance({ paperId: 'c1', to: 'preprint' }))
  ok(back.threw && back.code === 'VMU_VERSION_CHAIN_BROKEN' && /rollback/.test(back.msg) && back.current === 'accepted', 'rollback refused with current version')
  const again = rejects(() => p.advance({ paperId: 'c1', to: 'accepted' }))
  ok(again.threw && again.code === 'VMU_VERSION_CHAIN_BROKEN', 'same-version re-entry refused')
  const a2 = p.advance({ paperId: 'c1', to: 'vor' })
  ok(a2.version === 'vor' && a2.legalNext === 'erratum', 'chain continues to VoR')
}

// 4) availability (G19): "on request" refused by default
{
  const p = mk()
  p.submitPack({ paperId: 'a1', venue: 'J.' })
  for (const how of ['available on request', '应要求提供', '可向作者索取']) {
    const r = rejects(() => p.availability({ paperId: 'a1', data: 'dataset', how }))
    ok(r.threw && r.code === 'VMU_AVAILABILITY_VAGUE' && !!r.hint, 'vague availability refused: ' + how)
  }
  const r2 = rejects(() => p.availability({ paperId: 'a1', data: 'dataset' }))
  ok(r2.threw && r2.code === 'VMU_AVAILABILITY_VAGUE', 'missing url refused')
  const good = p.availability({ paperId: 'a1', data: 'dataset', code: 'repo', license: 'CC-BY-4.0', url: 'https://example.org/data' })
  ok(good.badge === 'open' && good.at === 1000, 'resolvable url + open license ⇒ open badge')
  ok(isVague('available on request') === true && isVague('https://example.org/x') === false, 'isVague helper')
}

// 5) explicit opt-in allows "on request" (vmu.avail.allowOnRequest)
{
  const p = mk({ 'vmu.avail.allowOnRequest': true })
  p.submitPack({ paperId: 'a2', venue: 'J.' })
  const d = p.availability({ paperId: 'a2', how: 'available on request' })
  ok(d.how === 'available on request' && p.badge({ paperId: 'a2' }).badge === 'closed', 'opt-in recorded; badge stays closed')
}

// 6) badge mismatch refused by name
{
  const p = mk()
  p.submitPack({ paperId: 'b1', venue: 'J.' })
  p.availability({ paperId: 'b1', data: 'd', license: 'CC-BY-4.0', url: 'https://example.org/d' })
  const r = rejects(() => p.badge({ paperId: 'b1', expect: 'closed' }))
  ok(r.threw && r.code === 'VMU_BADGE_MISMATCH', 'declared badge that contradicts fields refused')
  ok(p.badge({ paperId: 'b1', expect: 'open' }).badge === 'open', 'matching badge accepted')
  const restricted = mk()
  restricted.submitPack({ paperId: 'b2', venue: 'J.' })
  restricted.availability({ paperId: 'b2', data: 'd', license: 'proprietary', url: 'https://example.org/d' })
  ok(restricted.badge({ paperId: 'b2' }).badge === 'restricted', 'non-open license ⇒ restricted')
}

// 7) archive registration (G12): offline first; claimed-but-no-receipt refused
{
  const p = mk()
  p.submitPack({ paperId: 'r1', venue: 'J.' })
  const pending = p.register({ paperId: 'r1', target: 'zenodo' })
  ok(pending.status === 'pending' && pending.offline === true && pending.at === 1000, 'offline run produces a PENDING registration')
  const bad = rejects(() => p.register({ paperId: 'r1', target: 'zenodo', status: 'registered' }))
  ok(bad.threw && bad.code === 'VMU_ARCHIVE_RECEIPT_MISSING' && !!bad.hint, 'claimed registration without receipt refused')
  const done = p.register({ paperId: 'r1', target: 'zenodo', receipt: '10.5281/zenodo.1' })
  ok(done.status === 'registered' && done.offline === false, 'receipt ⇒ registered')
  const t = rejects(() => p.register({ paperId: 'r1', target: 'nope' }))
  ok(t.threw && t.code === 'VMU_ARCHIVE_RECEIPT_MISSING', 'unknown target refused')
}

// 8) replication (G20): failed is first-class, never an error; malformed record refused
{
  const p = mk()
  const f = p.replication({ original: 'paper-1', outcome: 'failed', evidence: 'sha256:abc', notes: 'could not reproduce lemma 3' })
  ok(f.outcome === 'failed' && f.firstClass === true && f.at === 1000, 'failed replication recorded as first-class')
  ok(p.replication({ original: 'paper-1', outcome: 'reproduced', evidence: 'sha256:def' }).outcome === 'reproduced', 'reproduced recorded too')
  const badOutcome = rejects(() => p.replication({ original: 'x', outcome: 'error', evidence: 'e' }))
  ok(badOutcome.threw && badOutcome.code === 'VMU_INVALID_ARGUMENT', 'a third state must not be smuggled in as "error"')
  const noEvidence = rejects(() => p.replication({ original: 'x', outcome: 'failed' }))
  ok(noEvidence.threw && noEvidence.missing.includes('evidence'), 'evidence required')
  ok(p.status().outcomes.failed === 1, 'status counts failed separately (not as errors)')
}

// 9) unknown paper ⇒ named refusal everywhere; zero-config never crashes
{
  const p = createPublication()
  ok(rejects(() => p.advance({ paperId: 'ghost', to: 'accepted' })).code === 'VMU_VERSION_CHAIN_BROKEN', 'advance ghost refused')
  ok(rejects(() => p.availability({ paperId: 'ghost', url: 'https://x' })).code === 'VMU_VERSION_CHAIN_BROKEN', 'availability ghost refused')
  ok(rejects(() => p.badge({ paperId: 'ghost' })).code === 'VMU_VERSION_CHAIN_BROKEN', 'badge ghost refused')
  ok(rejects(() => p.register({ paperId: 'ghost' })).code === 'VMU_VERSION_CHAIN_BROKEN', 'register ghost refused')
  ok(p.list().total === 0 && p.status().papers === 0, 'zero-config reads are safe')
}

// 10) counted truncation on list()
{
  const p = createPublication({ clock: () => now, listCap: 2 })
  for (const id of ['t1', 't2', 't3', 't4']) p.submitPack({ paperId: id, venue: 'J.' })
  const l = p.list()
  ok(l.items.length === 2 && l.total === 4 && l.dropped === 2, 'list() reports dropped count')
}

// 11) read-only views never mutate; deterministic timestamps
{
  const p = mk()
  p.submitPack({ paperId: 'z1', venue: 'J.' })
  const before = JSON.stringify({ l: p.list(), s: p.status(), b: p.badge({ paperId: 'z1' }) })
  p.list(); p.status(); p.badge({ paperId: 'z1' })
  ok(JSON.stringify({ l: p.list(), s: p.status(), b: p.badge({ paperId: 'z1' }) }) === before, 'reads are side-effect free')
  ok(p.list().items[0].at === 1000, 'at comes from the injected clock')
}

console.log('=== VMU PUBLICATION: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
