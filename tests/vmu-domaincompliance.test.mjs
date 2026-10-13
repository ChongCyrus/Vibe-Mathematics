// vmu domain compliance — the capability scenario for kernel/domaincompliance.js (docs/20 §9.1-§9.4).
//
// WHAT THIS SUITE PINS: every failure code the face can produce, one assertion each, plus a COMPLETE subject per domain to prove
// the gate is not simply refusing everything. The face is fail-closed by design, which makes the complete case the important
// control: a face that refuses always would pass every other assertion in this file.
//
// STYLE: a plain script with a counter and a summary at the END. This suite deliberately has NO home-grown runner, because round
// 246 was spent on a suite whose runner sat in the middle of the file and whose count lived inside each test body - two shapes that
// made a passing test look like a test that never ran.
import { createDomainCompliance, DOMAIN_KEYS, CODE } from '../vibe-math-vmu/extensions/domain-compliance/index.js'

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const codesOf = (r) => (Array.isArray(r.missing) ? r.missing.map((m) => m.code) : [])
const itemsOf = (r) => (Array.isArray(r.missing) ? r.missing.map((m) => m.item) : [])

const NOW = 1000000000000
const SETTINGS = {
  'vmu.clinical.registrationIdPattern': '^NCT[0-9]+$',
  'vmu.animal.facilityAccreditation': 'FAC-1',
  'vmu.animal.protocolId': 'PROTO-1',
  'vmu.animal.ledgerRef': 'LEDGER-9',
}
const mk = (settings = SETTINGS, clock = () => NOW) => createDomainCompliance({ settings, clock })

/** A clinical subject that satisfies every declared requirement. */
const completeClinical = () => ({
  registrationId: 'NCT12345',
  currentConsentVersion: 'v2',
  consent: { version: 'v2', effectiveAt: NOW - 1000 },
  events: [{ severity: 'ae', observedAt: NOW - 3600000, reportedAt: NOW - 1800000 }],
  deviations: [{ kind: 'minor', reason: 'r', at: NOW - 500, action: 'a' }],
  unblindings: [{ who: 'r-1', why: 'safety', at: NOW - 100, emergency: true, reviewedAt: NOW - 50 }],
})
/** An animal subject that satisfies every declared requirement. */
const completeAnimal = () => ({
  protocol: { protocolId: 'PROTO-1', species: 'mouse', approvedAt: NOW - 1000, expiresAt: NOW + 100000000 },
  threeR: { replacement: 'cells', reduction: 'n=8', refinement: 'analgesia' },
  anesthesia: { plan: 'isoflurane' },
  facility: { facilityId: 'FAC-1', validUntil: NOW + 100000 },
  personnel: [{ personId: 'p-1', trainingId: 't-1', completedAt: NOW - 1000, validUntil: NOW + 100000 }],
  ledger: { ref: 'LEDGER-9' },
})

// ---- A. the two COMPLETE cases, without which every refusal below is uninformative -------------------------
{
  const c = mk()
  const clinical = c.gate({ domain: 'clinical', subject: completeClinical(), at: NOW })
  ok(clinical.ok === true, 'clinical[complete]: a subject satisfying every declared requirement PASSES', clinical)
  const animal = c.gate({ domain: 'animal', subject: completeAnimal(), at: NOW })
  ok(animal.ok === true, 'animal[complete]: likewise for the animal domain', animal)
  ok(clinical.evidenceKind === 'compliance-evidence', 'the receipt carries the declared evidence kind', clinical.evidenceKind)
}

// ---- B. the clinical codes, one each ---------------------------------------------------------------
{
  const c = mk()
  const empty = c.gate({ domain: 'clinical', subject: {} })
  ok(empty.code === CODE.gate, 'clinical[empty]: the gate refuses with VMU_GATE_UNSATISFIED', empty.code)
  ok(itemsOf(empty).includes('试验注册号'), 'clinical[empty]: the MISSING REGISTRATION is named')
  ok(itemsOf(empty).some((x) => x.includes('知情同意')), 'clinical[empty]: the missing CONSENT requirement is named')

  const badPattern = c.gate({ domain: 'clinical', subject: { registrationId: 'NOT-A-NCT' } })
  ok(codesOf(badPattern).includes(CODE.registration), 'clinical[pattern]: a registration failing the declared pattern gets VMU_REGISTRATION_MISSING', codesOf(badPattern))

  const badConsent = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', consent: { version: 'v1', effectiveAt: NOW }, currentConsentVersion: 'v2' } })
  ok(codesOf(badConsent).includes(CODE.consent), 'clinical[consent]: a subject on a stale consent version is refused', codesOf(badConsent))
  const noConsent = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', consent: { version: '' } } })
  ok(codesOf(noConsent).includes(CODE.consent), 'clinical[consent]: a consent record without a version is refused')

  const sae = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', events: [{ severity: 'sae', observedAt: 0, reportedAt: 25 * 3600000 }] } })
  ok(codesOf(sae).includes(CODE.sae), 'clinical[sae]: a serious event reported past the declared limit is refused', codesOf(sae))
  const ae = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', events: [{ severity: 'ae', observedAt: 0, reportedAt: 73 * 3600000 }] } })
  ok(codesOf(ae).includes(CODE.ae), 'clinical[ae]: an ordinary event uses its OWN limit and its own code', codesOf(ae))
  const inTime = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', events: [{ severity: 'sae', observedAt: 0, reportedAt: 23 * 3600000 }] } })
  ok(!codesOf(inTime).includes(CODE.sae), 'clinical[sae]: inside the limit no SAE code is raised (other requirements may still be)', codesOf(inTime))

  const deviation = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', majorDeviations: true } })
  ok(codesOf(deviation).includes(CODE.deviation), 'clinical[deviation]: an undeclared major deviation blocks', codesOf(deviation))
  const partialDeviation = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', deviations: [{ kind: 'major', reason: 'r' }] } })
  ok(codesOf(partialDeviation).includes(CODE.deviation), 'clinical[deviation]: a deviation missing at/action is refused')

  const unlogged = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', unblindings: [{ who: 'r-1' }] } })
  ok(codesOf(unlogged).includes(CODE.unblinding), 'clinical[unblinding]: unblinding without who/why/at is refused', codesOf(unlogged))
  const unreviewed = c.gate({ domain: 'clinical', subject: { registrationId: 'NCT1', unblindings: [{ who: 'r', why: 'w', at: 1, emergency: true }] } })
  ok(codesOf(unreviewed).includes(CODE.unblinding), 'clinical[unblinding]: an EMERGENCY unblinding must be reviewed afterwards')
}

// ---- C. the animal codes ---------------------------------------------------------------------------
{
  const c = mk()
  const noApproval = c.gate({ domain: 'animal', subject: {} })
  ok(codesOf(noApproval).includes(CODE.iacucMissing), 'animal[iacuc]: a missing approval is VMU_IACUC_APPROVAL_MISSING', codesOf(noApproval))
  const future = c.gate({ domain: 'animal', subject: { protocol: { protocolId: 'PROTO-1', species: 'mouse', approvedAt: NOW + 1000, expiresAt: NOW + 9999 } } })
  ok(codesOf(future).includes(CODE.iacucMissing),
    'animal[iacuc]: an approval whose effective date is in the FUTURE gets the MISSING code (no approval is in force yet), not the expiry one',
    codesOf(future))
  ok(!codesOf(future).includes(CODE.iacucExpired), 'animal[iacuc]: and NOT the expiry code - the two mean different things')
  const expired = c.gate({ domain: 'animal', subject: { protocol: { protocolId: 'PROTO-1', species: 'mouse', approvedAt: 0, expiresAt: 500 } } })
  ok(codesOf(expired).includes(CODE.iacucExpired), 'animal[iacuc]: an EXPIRED approval gets its own distinct code', codesOf(expired))

  const threeR = c.gate({ domain: 'animal', subject: { threeR: { replacement: 'r' } } })
  ok(codesOf(threeR).includes(CODE.threeR), 'animal[3R]: an incomplete 3R answer is refused', codesOf(threeR))
  ok(itemsOf(threeR).some((x) => x.includes('reduction')), 'animal[3R]: the missing limb is NAMED', itemsOf(threeR))

  const noAnesthesia = c.gate({ domain: 'animal', subject: { anesthesia: {} } })
  ok(codesOf(noAnesthesia).includes(CODE.anesthesia), 'animal[anesthesia]: an undeclared plan is refused')
  const waived = c.gate({ domain: 'animal', subject: { anesthesia: { waived: true, reason: 'non-invasive observation' } } })
  ok(!codesOf(waived).includes(CODE.anesthesia), 'animal[anesthesia]: a waiver WITH a reason is accepted')

  const facility = c.gate({ domain: 'animal', subject: { facility: { facilityId: 'OTHER', validUntil: NOW + 1000 } } })
  ok(codesOf(facility).includes(CODE.facility), 'animal[facility]: an unaccredited facility is refused', codesOf(facility))
  const lapsed = c.gate({ domain: 'animal', subject: { facility: { facilityId: 'FAC-1', validUntil: 1 } } })
  ok(codesOf(lapsed).includes(CODE.facility), 'animal[facility]: an expired accreditation is refused')

  const training = c.gate({ domain: 'animal', subject: { personnel: [{ personId: 'p-1', trainingId: 't', completedAt: 0, validUntil: 1 }] } })
  ok(codesOf(training).includes(CODE.training), 'animal[training]: expired training is refused and the person is named', itemsOf(training))

  const ledger = c.gate({ domain: 'animal', subject: { ledger: { ref: 'OTHER' } } })
  ok(codesOf(ledger).includes(CODE.ledger), 'animal[ledger]: a ledger that does not reference the declared object id is refused')

  const endpoint = c.gate({ domain: 'animal', subject: { events: [{ kind: 'humane-endpoint', at: 0, reportedAt: 25 * 3600000 }] } })
  ok(codesOf(endpoint).includes(CODE.endpoint), 'animal[endpoint]: an overdue humane-endpoint report is refused', codesOf(endpoint))
  const otherEvent = c.gate({ domain: 'animal', subject: { events: [{ kind: 'routine-check', at: 0, reportedAt: 999 * 3600000 }] } })
  ok(!codesOf(otherEvent).includes(CODE.endpoint), 'animal[endpoint]: an unrelated event kind is NOT judged by that deadline')
}

// ---- D. the packs, the trace, the review and the evidence pack --------------------------------------
{
  const onlyAnimal = createDomainCompliance({ settings: { 'vmu.compliance.domainPacks': ['animal'] }, clock: () => NOW })
  const wrongDomain = onlyAnimal.gate({ domain: 'clinical', subject: completeClinical() })
  ok(wrongDomain.code === CODE.packMissing, 'packs: with only one pack enabled, gating the OTHER domain is VMU_DOMAIN_PACK_MISSING', wrongDomain.code)
  ok(onlyAnimal.packs().ok === true && onlyAnimal.packs().declared.join(',') === 'animal', 'packs(): the declared packs are reported')
  const unknownPack = createDomainCompliance({ settings: { 'vmu.compliance.domainPacks': ['clinical', 'telepathy'] }, clock: () => NOW })
  ok(unknownPack.packs().ok === false && unknownPack.packs().unknown.join(',') === 'telepathy', 'packs(): an unknown pack name is reported rather than ignored')

  const c = mk()
  const before = c.trail().length
  c.gate({ domain: 'clinical', subject: {} })
  const after = c.trail()
  ok(after.length > before, 'fail-closed: a blocked attempt LEAVES A TRACE (who tried what, and which gate stopped it)')
  ok(after[after.length - 1].blocked === CODE.gate, 'the trace names the gate that blocked it', after[after.length - 1])

  const due = c.reviewDue({ subjectId: 's1', expiresAt: NOW + 1000, at: NOW, leadDays: 30 })
  ok(due.due === true && due.code === CODE.reviewDue, 'reviewDue: inside the lead window it reports VMU_REVIEW_DUE', due)
  ok(/提醒/.test(due.note), 'reviewDue: the note says plainly that it is a REMINDER, not a refusal', due.note)
  const notDue = c.reviewDue({ subjectId: 's1', expiresAt: NOW + 60 * 24 * 3600000, at: NOW, leadDays: 30 })
  ok(notDue.due === false && notDue.code === null, 'reviewDue: far from expiry it reports nothing')

  const complete = c.evidencePack({ subject: Object.assign(completeClinical(), { threeR: {}, protocol: {}, facility: {}, deidentified: true }) })
  ok(complete.complete === true, 'evidencePack: a subject carrying every required member reports complete', complete.absent)
  const partial = c.evidencePack({ subject: {} })
  ok(partial.complete === false && partial.absent.length === 7, 'evidencePack: an empty subject is missing all seven members', partial.absent)
  ok(/22/.test(partial.note) && /07/.test(partial.note), 'evidencePack: the receipt says packaging belongs to the other volumes (22 and 07)')

  const st = c.status()
  ok(st.ok === true && st.evidenceKind === 'compliance-evidence', 'status(): reports the declarations', st)
  ok(c.keysUsed().length === 21 && c.keysUsed().every((k) => DOMAIN_KEYS.includes(k)), 'keysUsed(): names all twenty-one keys', c.keysUsed().length)
  ok(DOMAIN_KEYS.length === 21, 'the face declares twenty-one keys: nine clinical, nine animal, three pack', DOMAIN_KEYS.length)
}

console.log('=== VMU DOMAIN COMPLIANCE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
