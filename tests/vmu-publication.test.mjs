// tests/vmu-publication.test.mjs — kernel/publication.js (batch-3 slice 4).
// Scenarios: version-chain jumps/rollbacks refused with current + legal next; "on request" availability
// refused; claimed registration without receipt refused (offline pending works); badge mismatch refused;
// failed replication recorded as a first-class result; counted truncation; zero-config; determinism.
import { createPublication, VERSION_CHAIN, isVague } from '../vibe-math-vmu/kernel/publication.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, current: e && e.current, legalNext: e && e.legalNext, missing: e && e.missing } } }

let now = 1000
// ★ P2-01（Round 12）：内核【不再替你选】许可证 —— 未声明时 `publication.js` 会**具名拒绝**
// （`VMU_LICENSE_DEFAULT_UNDECLARED`／`VMU_LICENSE_CODE_UNDECLARED`），而且**声明构造**本身就需要 code 默认值，
// 所以即使调用方给了显式 `license`，未声明 codeDefault 仍会被拒。v5r 在自己的 pack 里声明这两个值
// （`packs/v5r/settings/defaults.json`），下面这个构造器【显式声明】它们：这正是真实部署经 pack 折叠拿到的形状。
const mk = (settings = {}, opts = {}) => createPublication({ clock: () => now, settings: { 'vmu.license.default': 'CC-BY-4.0', 'vmu.license.codeDefault': 'MIT', ...settings }, listCap: 100, ...opts })

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


// ── 反例断言（task-101 加固）：归一化后必须被拒；正例不得被误拒 ─────────────────────────────
{
  const must = [
    ['on  request', '多空格折叠'],
    ['on\u3000request', '全角空格折叠'],
    ['on\u200B request', '零宽字符剥离'],
    ['please contact the authors', 'contact 族（英）'],
    ['可联系作者获取', 'contact 族（中）'],
  ]
  for (const [txt, why] of must) {
    if (!isVague(txt)) { console.error('  FAIL - [isVague] ' + why + ' 未被判为 vague: ' + JSON.stringify(txt)); process.exit(1) }
    console.log('  ok - [isVague] ' + why + ' 被拒 :: ' + JSON.stringify(txt))
  }
  const positives = ['https://example.org/data.zip', 'openly available under CC-BY-4.0', 'data on Zenodo']
  for (const p of positives) if (isVague(p)) { console.error('  FAIL - [isVague] 正例被误拒: ' + JSON.stringify(p)); process.exit(1) }
  console.log('  ok - [isVague] 3 条正例未被误拒（防过严）')
}

// ── ROUND 218: the outreach family (docs/22 §传播, contracts at lines 712-720) — both directions for every key ──
{
  now = 0
  const O = (extra = {}) => mk(extra)
  const mkPack = (c, o, extra = {}) => c.outreachPack(Object.assign({ paperId: 'paper-1', publicSummary: 'A public summary', claims: [{ text: 'c', evidenceRef: 'R1' }] }, extra))
  // publicSummaryRequired
  const c1 = O()
  let miss = null; try { c1.outreachPack({ paperId: 'paper-1' }) } catch (e) { miss = e && e.code }
  ok(miss === 'VMU_OUTREACH_INCOMPLETE', 'publicSummaryRequired[-]: no summary is refused by name', String(miss))
  ok(c1.outreachPack({ paperId: 'paper-1', publicSummary: 'A public summary' }).ok === true, 'publicSummaryRequired[+]: with a summary the pack is built')
  // languageSet
  let lang = null; try { c1.outreachPack({ paperId: 'paper-1', publicSummary: 'x', languages: ['fr'] }) } catch (e) { lang = e && e.code }
  ok(lang === 'VMU_OUTREACH_LANGUAGE', 'languageSet[-]: a language outside the set is refused by name', String(lang))
  ok(c1.outreachPack({ paperId: 'paper-1', publicSummary: 'x', languages: ['zh'] }).languages.join() === 'zh', 'languageSet[+]: a declared language passes')
  // evidenceFidelity strict vs warn
  let ev = null; try { c1.outreachPack({ paperId: 'paper-1', publicSummary: 'x', claims: [{ text: 'no ref' }] }) } catch (e) { ev = e && e.code }
  ok(ev === 'VMU_OUTREACH_EVIDENCE', 'evidenceFidelity[-]: strict refuses a claim with no evidenceRef', String(ev))
  const warnC = O({ 'vmu.dissemination.evidenceFidelity': 'warn' })
  const warned = warnC.outreachPack({ paperId: 'paper-1', publicSummary: 'x', claims: [{ text: 'no ref' }] })
  ok(warned.warnings.length === 1, 'evidenceFidelity=warn: the missing reference is WARNED about, not fatal', JSON.stringify(warned.warnings))
  // mediaApprovalPolicy
  let media = null; try { c1.outreachPack({ paperId: 'paper-1', publicSummary: 'x', by: 'stranger' }) } catch (e) { media = e && e.code }
  ok(media === 'VMU_OUTREACH_MEDIA_DENIED', 'mediaApprovalPolicy[-]: a non-spokesperson is refused by name', String(media))
  ok(c1.outreachPack({ paperId: 'paper-1', publicSummary: 'x', by: 'spox', spokespersons: ['spox'] }).ok === true, 'mediaApprovalPolicy[+]: a declared spokesperson may speak')
  // anonymityPreserve keys on AUTHORS travelling with the pack
  let anon = null; try { c1.outreachPack({ paperId: 'paper-1', publicSummary: 'x', authors: ['m1'] }) } catch (e) { anon = e && e.code }
  ok(anon === 'VMU_OUTREACH_ANONYMITY', 'anonymityPreserve[-]: author identities with the pack are refused by name', String(anon))
  // embargoRespect + openReviewEnabled + impactLogFields + impactUseInEvaluation
  const c2 = O()
  c2.outreachPack({ paperId: 'paper-2', publicSummary: 'x', embargoUntil: 5000 })
  let emb = null; try { c2.publishOutreach({ paperId: 'paper-2' }) } catch (e) { emb = e && e.code }
  ok(emb === 'VMU_OUTREACH_EMBARGO', 'embargoRespect[-]: publishing inside the embargo is refused by name', String(emb))
  ok(c2.publishOutreach({ paperId: 'paper-2', at: 6000 }).publishedAt === 6000, 'embargoRespect[+]: after the embargo it publishes')
  let orv = null; try { c2.openOutreachReview({ paperId: 'paper-2' }) } catch (e) { orv = e && e.code }
  ok(orv === 'VMU_OUTREACH_OPEN_REVIEW_OFF', 'openReviewEnabled[-]: open review with the switch off is refused by name', String(orv))
  let fields = null; try { c2.logImpact({ paperId: 'paper-2', entries: [{ channel: 'blog' }] }) } catch (e) { fields = e && e.code }
  ok(fields === 'VMU_OUTREACH_IMPACT_FIELDS', 'impactLogFields[-]: an entry missing declared fields is refused by name', String(fields))
  ok(c2.logImpact({ paperId: 'paper-2', entries: [{ channel: 'blog', reach: 10, date: '2026-01-01', ref: 'R1' }] }).logged === 1, 'impactLogFields[+]: a complete entry is logged')
  let evalUse = null; try { c2.useImpactInEvaluation({ paperId: 'paper-2' }) } catch (e) { evalUse = e && e.code }
  ok(evalUse === 'VMU_OUTREACH_IMPACT_NOT_FOR_EVALUATION', 'impactUseInEvaluation[-]: using outreach impact in evaluation is refused by name', String(evalUse))
  ok(typeof c2.status() === 'object' && c2.status() !== null, 'the face still answers after all of that (no state was corrupted)')
}


// ── ROUND 274: the licence declarations (volume 16 §L215 / volume 20 §L226) ──────────────────────────────────
{
  const paper = (r) => { r.submitPack({ paperId: 'lic-1', venue: 'J' }); return r }
  const avail = (r, extra) => r.availability(Object.assign({ paperId: 'lic-1', data: 'u', url: 'https://example.org/d' }, extra || {}))

  // the declared default is what an unspecified statement carries - that is the key's whole purpose
  const d = avail(paper(mk({})))
  ok(d.license === 'CC-BY-4.0' && d.licenseDeclared === null, 'license.default: an unspecified statement carries the declared default, and the receipt says it was not given', d)
  ok(d.codeLicense === 'MIT' && d.attributionRequired === true, 'license.codeDefault/attributionRequired: both are reported on the receipt')

  // a licence inside the declared open set is recorded as-is
  const inside = avail(paper(mk({})), { license: 'Apache-2.0' })
  ok(inside.license === 'Apache-2.0' && inside.licenseNote === null, 'license: a licence in the open set is recorded with no note')

  // outside the set, the declared policy decides - and both branches are visible
  const denyRun = (() => { const r = paper(mk({})); try { avail(r, { license: 'GPL-3.0' }); return null } catch (e) { return e } })()
  ok(denyRun && denyRun.code === 'VMU_LICENSE_INCOMPATIBLE', 'license.incompatiblePolicy[deny]: a COPYLEFT licence against a non-copyleft default is refused by name', denyRun && denyRun.code)
  const warned = avail(paper(mk({ 'vmu.license.incompatiblePolicy': 'warn' })), { license: 'GPL-3.0' })
  ok(warned.license === 'GPL-3.0' && warned.licenseNote === 'copyleft-warn', 'license.incompatiblePolicy[warn]: accepted but NOT silently - the receipt carries the note', warned.licenseNote)

  // and the defaults themselves are declarations, not constants
  const declared = avail(paper(mk({ 'vmu.license.default': 'MIT', 'vmu.license.codeDefault': 'GPL-3.0', 'vmu.license.attributionRequired': false })))
  ok(declared.license === 'MIT' && declared.codeLicense === 'GPL-3.0' && declared.attributionRequired === false, 'license.*: re-declaring all three changes what the receipt carries')
}


// ── ROUND 288: the replication family (volume 16 §L333-§L339) ───────────────────────────────────────────────
{
  const r = mk({})
  const refused = r.shareReplication({ original: 'r-1' })
  ok(refused.code === 'VMU_INVALID_ARGUMENT', 'federationShare[off]: marking a replication record for sharing is refused by name', refused.code)
  ok(r.shareReplication({ original: 'r-1', share: false }).ok === true, 'federationShare[off]: UN-sharing is still allowed and says so')
  ok(mk({}).shareReplication({}).code === 'VMU_INVALID_ARGUMENT', 'shareReplication without a record is refused')
  const on = mk({ 'vmu.replication.federationShare': true })
  const done = on.shareReplication({ original: 'r-2', note: 'peers' })
  ok(done.ok === true && done.declaration === true, 'federationShare[on]: the marking is recorded and the declaration reported', done)
}


// ── ROUND 290: the long-term preservation package (volume 07 §L245, §L651) ──────────────────────────────────
{
  const a = mk({})
  a.submitPack({ paperId: 'arch-1', venue: 'J' })
  const reg = a.register({ paperId: 'arch-1', target: 'zenodo', receipt: 'r-1' })
  ok(reg.packageStyle === 'native' && reg.includeEnvironment === true, 'archive.package defaults: native style, environment note allowed', reg)
  const declared = a.register({ paperId: 'arch-1', target: 'zenodo', receipt: 'r-2', packageStyle: 'dataverse', environment: 'node 24' })
  ok(declared.packageStyle === 'dataverse' && declared.environment === 'node 24', 'archive.package: a declared style and an environment note are carried', declared)
  const bad = (() => { try { a.register({ paperId: 'arch-1', packageStyle: 'nonsense' }); return null } catch (e) { return e } })()
  ok(bad && bad.code === 'VMU_INVALID_ARGUMENT', 'archive.package.style: an unknown style is refused by name', bad && bad.code)
  const noEnv = mk({ 'vmu.archive.package.includeEnvironment': false })
  noEnv.submitPack({ paperId: 'arch-2', venue: 'J' })
  const envBad = (() => { try { noEnv.register({ paperId: 'arch-2', environment: 'x' }); return null } catch (e) { return e } })()
  ok(envBad && envBad.code === 'VMU_INVALID_ARGUMENT', 'archive.package.includeEnvironment[off]: an environment note is refused')
  ok(noEnv.register({ paperId: 'arch-2' }).packageStyle === 'native', 'archive.package.includeEnvironment[off]: registering without one still works')
}

console.log('=== VMU PUBLICATION: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)
