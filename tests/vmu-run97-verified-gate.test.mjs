#!/usr/bin/env node
// vmu ROUND 97 / B1 (independent audit) — THE VERIFIED TRACK IS MINTABLE ONLY THROUGH THE GATE.
//
// THE RULE (宏观层面v5r运行规则.md L7–L8): 命题的来源可以是内部辩论产出、参考文献中的命题，也可直接入 Verified。
// 也就是说 Verified 收的是「被证明为真的东西」（p=1，或文献结论）。
//
// WHAT THE AUDIT MEASURED (after our gates had been reported green):
//   ① `promoteVerified` admitted a p=0 card, so the track held refutations while every reader asked it "what is proven";
//   ② `vibe_v5_verified_promote` never called the p=1 evidence gate: `warrant_kind:"debate-unanimous"` with NO debate
//      at all minted a verified row. That is a soundness hole, not a presentation defect.
//
// WHAT THIS SUITE PINS
//   ① p=0 is refused BY NAME until it carries the ruling that refuted it (`VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE`),
//      and with that ruling the disproof is admitted (the track carries judged conclusions, both truth and falsity);
//   ② p=1 with no evidence is refused by the SAME gate a card write uses (`VMU_PACK_V5R_P1_NEEDS_DEBATE`);
//   ③ the claimed kind must match the evidence that passed (literature evidence + debate-unanimous kind ⇒ refused);
//   ④ a real literature promotion succeeds and the receipt says which form admitted it (`p1Evidence`);
//   ⑤ a real unanimous debate ruling admits a debate-kind promotion;
//   ⑥ docs/03 and the teaching carry the same sentence (so a reader is not told the old shape).
import { mkdtemp, rm } from 'node:fs/promises'
import { cpSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
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
const boot = async (config = {}, entryMod = entry) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entryMod.apply(ctx, Object.assign({ clock: () => NOW + (NOW += 1000), packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}

const bootWith = async (entryUrl, config = {}) => boot(config, await import(entryUrl + '?t=' + Date.now()))

const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const json = (r) => (r && r.parsed) || null
const verifiedRows = (kernel) => {
  try {
    const rows = kernel.records.list({ track: 'verified' })
    const list = rows && Array.isArray(rows.items) ? rows.items : (rows && Array.isArray(rows.rows) ? rows.rows : (Array.isArray(rows) ? rows : []))
    return list.length
  } catch { return -1 }
}

const root = await mkdtemp(join(__tmpRoot(), 'vmu-run97-verified-gate-'))
try {
  const b = await boot({ root })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })

  const STMT = '若 G 是有限群且 H≤G，则 |H| 整除 |G|。'
  const VALUE = '拉格朗日定理。'
  const MOTIVE = '第 97 轮：verified 轨只收被证明为真的结论。'
  const CITE = 'Dummit & Foote, Abstract Algebra, 3rd ed., Section 3.2 Theorem 7'

  // a p=0 card (a refutation) and a p=1 card (a literature conclusion)
  const refuted = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 0, member: 'r-1' }))
  ok(refuted && refuted.ok === true, 'setup: a p=0 card can be written', refuted && refuted.code)
  const refutedId = refuted && typeof refuted.recordId === 'string' ? refuted.recordId : null

  const card = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, literature_ref: CITE, member: 'r-1' }))
  ok(card && card.ok === true, 'setup: a cited p=1 card can be written', card && card.code)
  const cardId = card && typeof card.recordId === 'string' ? card.recordId : null

  const before = 0  // the verified track starts empty in this suite
  ok(verifiedRows(kernel) === before, 'setup: the verified track starts empty', { before })

  // ① p=0 cannot enter the verified track, and the refusal says where the fact belongs.
  const refutePromote = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: refutedId, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' }))
  ok(refutePromote && refutePromote.ok === false, '① a disproof without its ruling is refused', refutePromote && refutePromote.code)
  ok(refutePromote && refutePromote.code === 'VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE', '① the refusal is VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE', refutePromote && refutePromote.code)
  ok(refutePromote && typeof refutePromote.hint === 'string' && refutePromote.hint.includes('debate_ruling'),
    '① the hint names the ruling argument', refutePromote && refutePromote.hint)
  ok(verifiedRows(kernel) === before, '① nothing entered the track', { before, after: verifiedRows(kernel) })
  const refutedAdmitted = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: refutedId, warrant_kind: 'debate-unanimous', warrant: 'ballot-97-false', member: 'r-acad',
    debate_ruling: { mode: 'unanimous', value: 0, ballotId: 'ballot-97-false', subject: refutedId } }))
  ok(refutedAdmitted && refutedAdmitted.ok === true, '① with the unanimous 0 ruling the disproof is admitted', refutedAdmitted && refutedAdmitted.code)
  ok(verifiedRows(kernel) === 1, '① exactly the judged disproof entered', { after: verifiedRows(kernel) })
  const baseline = verifiedRows(kernel)

  // ② a p=1 card promoted with a warrant but NO evidence is refused by the same gate a card write uses.
  const noEvidence = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'debate-unanimous', warrant: 'ballot-97', member: 'r-acad' }))
  ok(noEvidence && noEvidence.ok === false, '② a warrant without evidence is refused', noEvidence && noEvidence.code)
  ok(noEvidence && noEvidence.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '② the refusal is the p=1 evidence gate (the bypass is closed)', noEvidence && noEvidence.code)
  ok(verifiedRows(kernel) === baseline, '② the caller-supplied warrant minted nothing', { baseline, after: verifiedRows(kernel) })

  // ③ the claimed kind must be the kind the evidence actually shows.
  const mismatch = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'debate-unanimous', warrant: 'ballot-97', literature_ref: CITE, member: 'r-acad' }))
  ok(mismatch && mismatch.ok === false, '③ literature evidence cannot be promoted as a debate kind', mismatch && mismatch.code)
  ok(mismatch && mismatch.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '③ the mismatch is refused by name', mismatch && mismatch.code)

  // ④ a real literature promotion is admitted and the receipt names the form.
  const lit = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: cardId, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' }))
  ok(lit && lit.ok === true, '④ the literature promotion succeeds', lit && lit.code)
  ok(lit && lit.p1Evidence === 'literature-reference', '④ the receipt names the admitting form', lit && lit.p1Evidence)
  ok(lit && lit.warrant && lit.warrant.id === CITE, '④ the warrant is the citation', lit && lit.warrant)
  ok(verifiedRows(kernel) === baseline + 1, '④ exactly one row entered the track', { baseline, after: verifiedRows(kernel) })

  // ⑤ a real unanimous debate ruling admits a debate-kind promotion for its own card.
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  const second = json(await callJSON(b, 'vibe_v5_record_proposition', {
    statement: '每个有限域的元素个数都是素数的幂。', value: '有限域结构。', motive: '第 97 轮：辩论裁决入轨。',
    p: 1, literature_ref: 'Lang, Algebra, Chapter V, Theorem 5.1', member: 'r-2' }))
  const secondId = second && typeof second.recordId === 'string' ? second.recordId : null
  const debate = json(await callJSON(b, 'vibe_v5_verified_promote', {
    card: secondId, warrant_kind: 'debate-unanimous', warrant: 'ballot-97', member: 'r-acad',
    debate_ruling: { mode: 'unanimous', value: 1, ballotId: 'ballot-97', subject: secondId } }))
  ok(debate && debate.ok === true, '⑤ a unanimous debate ruling admits the debate kind', debate && debate.code)
  ok(debate && debate.p1Evidence === 'debate-unanimous', '⑤ the receipt names the debate form', debate && debate.p1Evidence)

  // ⑥ the contract and the track's own code carry the same sentence.
  const fsread = await import('node:fs/promises')
  const doc = await fsread.readFile(join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md'), 'utf8')
  ok(doc.includes('VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE'), '⑥ docs/03 names the disproof-judge refusal')
  ok(doc.includes('证伪）同样要带「一致为 0 的那次裁决」'), '⑥ docs/03 says a disproof needs its ruling')
  const verifiedSrc = await fsread.readFile(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js'), 'utf8')
  ok(verifiedSrc.includes('THE TRACK CARRIES *JUDGED* CONCLUSIONS'), '⑥ verified.js states the admission it really has')
  const toolsSrc = await fsread.readFile(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const promoteBlock = toolsSrc.slice(toolsSrc.indexOf('function toolVerifiedPromote'), toolsSrc.indexOf('★ D15'))
  ok(promoteBlock.includes('p1Intent('), '⑥ the promotion path calls the same p=1 gate')
  ok(promoteBlock.includes('FORM_OF_KIND'), '⑥ the kind must match the evidence form')

  // ⑦ P0-f (ROUND-1 audit C#26): VERIFICATION NAMES ITS WARRANT; the policy is readable; machine-only refuses a social judge.
  const verifiedBodyOf = (k, card) => {
    try {
      const heads = k.records.list({ track: 'verified', limit: 0 })
      const items = Array.isArray(heads && heads.items) ? heads.items : []
      for (const h of items) {
        const got = k.records.get({ id: h.id }); const row = got && got.record ? got.record : got
        const body = String((row && row.body) || '')
        if (body.includes('cardId：' + card) || body.includes('cardId:' + card)) return body
      }
      return ''
    } catch (e) { return '' }
  }
  const litBody = verifiedBodyOf(kernel, cardId)
  ok(litBody.includes('warrant ' + CITE + ' (literature) settled it at 1'),
    '⑦ P0-f: a p=1 conclusion NAMES its warrant kind (literature), not just "真 (p=1)"', litBody.slice(0, 220))
  ok(lit && lit.warrantPolicy && lit.warrantPolicy.machineOrLiterature === false && lit.warrantPolicy.requireMachineWarrant === false && lit.warrantPolicy.machineCheckedOnly === false,
    '⑦ C#26: the promotion receipt carries warrantPolicy.machineOrLiterature:false (the default accepts a social/debate warrant) and does NOT claim machine-checked-only', lit && lit.warrantPolicy)
  const statusFull = json(await callJSON(b, 'vibe_vmu_status', { detail: 'full' }))
  // ★ TB-2794 Step 2: the policy reading is PACK-OWNED — it arrives as a v5r status SECTION, not a kernel top-level key.
  const warn = statusFull && statusFull.sections && statusFull.sections.verifiedWarrantPolicy && statusFull.sections.verifiedWarrantPolicy.ok === true ? statusFull.sections.verifiedWarrantPolicy.value : null
  ok(warn && warn.machineOrLiterature === false && warn.machineCheckedOnly === false,
    '⑦ C#26: the v5r PACK status section exposes verifiedWarrantPolicy (machineOrLiterature:false, machineCheckedOnly:false by default)', warn || (statusFull && statusFull.sections && statusFull.sections.verifiedWarrantPolicy))
  // machine-only deployment: a social (debate-unanimous) warrant is refused BY NAME; literature still admitted
  const moRoot = await mkdtemp(join(__tmpRoot(), 'vmu-run97-machine-'))
  const b2 = await boot({ root: moRoot, 'vmu.verified.requireMachineWarrant': true })
  const k2 = b2.handle.kernel
  await k2.members.hire({ id: 'r-acad', slot: 'chair' }); await k2.members.hire({ id: 'r-1', slot: 'member' })
  const litCard = json(await callJSON(b2, 'vibe_v5_record_proposition', { statement: STMT, value: VALUE, motive: 'P0-f machine-only', p: 1, literature_ref: CITE, member: 'r-1' }))
  const litId = litCard && typeof litCard.recordId === 'string' ? litCard.recordId : null
  const social = await callJSON(b2, 'vibe_v5_verified_promote', { card: litId, warrant_kind: 'debate-unanimous', warrant: 'ballot-p0f', member: 'r-acad', debate_ruling: { mode: 'unanimous', value: 1, ballotId: 'ballot-p0f', subject: litId } })
  const socialCode = String((social && (social.code || (social.parsed && social.parsed.code))) || '').trim()
  ok(socialCode === 'VMU_PACK_V5R_SOCIAL_WARRANT_REFUSED',
    '⑦ P0-f: requireMachineWarrant=true ⇒ a social debate warrant is refused by name', socialCode)
  const socialHint = String((social && social.hint) || (social && social.parsed && social.parsed.hint) || '')
  ok(/warrantPolicy/.test(socialHint) && /lean-conformance/.test(socialHint),
    '⑦ the refusal hint names the machine/literature alternatives and the policy', socialHint)
  const st2 = json(await callJSON(b2, 'vibe_vmu_status', { detail: 'full' }))
  const warn2 = st2 && st2.sections && st2.sections.verifiedWarrantPolicy && st2.sections.verifiedWarrantPolicy.ok === true ? st2.sections.verifiedWarrantPolicy.value : null
  ok(warn2 && warn2.machineOrLiterature === true && warn2.machineCheckedOnly === false && warn2.literaturePolicy && warn2.literaturePolicy.measured === false && warn2.literaturePolicy.kind === 'human-reviewed-citation' && JSON.stringify(warn2.acceptedKinds) === JSON.stringify(['lean-conformance', 'literature']),
    '⑦ C#26/P1-a3: the pack section says literaturePolicy is a DECLARATION (measured:false, human-reviewed-citation) — not a hardcoded measurement', warn2 || (st2 && st2.sections && st2.sections.verifiedWarrantPolicy))
  // ★ TB-2794 Step 2: WITHOUT the pack there is no verified-track policy section at all (absent, not a fake empty object).
  {
    const noPackRoot = await mkdtemp(join(__tmpRoot(), 'vmu-run97-nopack-'))
    const b0 = await boot({ root: noPackRoot, packs: [] })
    const st0 = json(await callJSON(b0, 'vibe_vmu_status', { detail: 'full' }))
    ok(st0 && (!st0.sections || st0.sections.verifiedWarrantPolicy === undefined),
      '⑦ Step 2: a kernel with NO pack has NO verifiedWarrantPolicy section (the policy is pack-owned; absent is honest)', st0 && st0.sections && Object.keys(st0.sections))
  }
  {
    const lampRoot = await mkdtemp(join(__tmpRoot(), 'vmu-run97-p0f-lamp1-'))
    cpSync(join(REPO, 'vibe-math-vmu'), join(lampRoot, 'vibe-math-vmu'), { recursive: true })
    const vp = join(lampRoot, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')
    const vs = (await import('node:fs/promises')).readFile
    const vsrc = await vs(vp, 'utf8')
    const mut = "  : '真 (p=1) — established: warrant ' + warrantId + ' (' + warrantKind + ') settled it at 1')"
    ok(vsrc.includes(mut), 'lamp1-setup: p=1 conclusion sentence locatable')
    const patched = vsrc.split(mut).join("  : '真 (p=1)')")
    await (await import('node:fs/promises')).writeFile(vp, patched, 'utf8')
    const Lb = await bootWith(pathToFileURL(join(lampRoot, 'vibe-math-vmu', 'vibe-math-vmu.js')).href, { root: await mkdtemp(join(__tmpRoot(), 'vmu-run97-lamp1-root-')) })
    const lk = Lb.handle.kernel
    await lk.members.hire({ id: 'r-acad', slot: 'chair' }); await lk.members.hire({ id: 'r-1', slot: 'member' })
    const c = json(await callJSON(Lb, 'vibe_v5_record_proposition', { statement: STMT + '（lamp）', value: VALUE, motive: 'P0-f lamp', p: 1, literature_ref: CITE, member: 'r-1' }))
    const cid = c && typeof c.recordId === 'string' ? c.recordId : null
    await callJSON(Lb, 'vibe_v5_verified_promote', { card: cid, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' })
    const body = verifiedBodyOf(lk, cid)
    ok(body.includes('conclusion 真 (p=1)') && !body.includes('established: warrant'),
      '★★ LAMP1(RED-worthy): reverting the sentence makes a p=1 conclusion name NO warrant (the audit shape) — the naming assertion above is load-bearing', body.slice(0, 200))
    await rm(lampRoot, { recursive: true, force: true }).catch(() => {})
  }
  {
    const lampRoot = await mkdtemp(join(__tmpRoot(), 'vmu-run97-p0f-lamp2-'))
    cpSync(join(REPO, 'vibe-math-vmu'), join(lampRoot, 'vibe-math-vmu'), { recursive: true })
    const tp = join(lampRoot, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
    const fsp = await import('node:fs/promises')
    const tsrc = await fsp.readFile(tp, 'utf8')
    const mut = "if (requireMachineWarrant && warrantKind === 'debate-unanimous') {"
    ok(tsrc.includes(mut), 'lamp2-setup: machine-only guard locatable')
    await fsp.writeFile(tp, tsrc.split(mut).join('if (false) {'), 'utf8')
    const Lb = await bootWith(pathToFileURL(join(lampRoot, 'vibe-math-vmu', 'vibe-math-vmu.js')).href, { root: await mkdtemp(join(__tmpRoot(), 'vmu-run97-lamp2-root-')), 'vmu.verified.requireMachineWarrant': true })
    const lk = Lb.handle.kernel
    await lk.members.hire({ id: 'r-acad', slot: 'chair' }); await lk.members.hire({ id: 'r-1', slot: 'member' })
    const c = json(await callJSON(Lb, 'vibe_v5_record_proposition', { statement: STMT + '（lamp2）', value: VALUE, motive: 'P0-f lamp2', p: 1, literature_ref: CITE, member: 'r-1' }))
    const cid = c && typeof c.recordId === 'string' ? c.recordId : null
    const social2 = await callJSON(Lb, 'vibe_v5_verified_promote', { card: cid, warrant_kind: 'debate-unanimous', warrant: 'ballot-lamp2', member: 'r-acad', debate_ruling: { mode: 'unanimous', value: 1, ballotId: 'ballot-lamp2', subject: cid } })
    ok(!(String((social2 && (social2.code || (social2.parsed && social2.parsed.code))) || '').trim() === 'VMU_PACK_V5R_SOCIAL_WARRANT_REFUSED'),
      '★★ LAMP2(RED-worthy): without the machine-only guard the same social promotion is no longer refused by that code — the refusal assertion above is load-bearing', social2 && ((social2.parsed && social2.parsed.code) || social2.code || 'ok'))
    await rm(lampRoot, { recursive: true, force: true }).catch(() => {})
  }
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10 })
}

  // ── Step 2 LAMPS: the pack-owned verified policy is load-bearing ──────────────────────────────────────────
  {
    const lampRoot = await mkdtemp(join(__tmpRoot(), 'vmu-run97-verified-lamp-'))
    try {
      cpSync(join(REPO, 'vibe-math-vmu'), join(lampRoot, 'vibe-math-vmu'), { recursive: true })
      const vp = join(lampRoot, 'vibe-math-vmu', 'packs', 'v5r', 'middleware', 'verified-policy.js')
      const fsp = await import('node:fs/promises')
      const src = await fsp.readFile(vp, 'utf8')
      const marker = "    disposer = statusService.registerSection('verifiedWarrantPolicy', () => verifiedWarrantPolicyOf(setting))"
      ok(src.includes(marker), 'lamp-setup: the section registration is locatable')
      await fsp.writeFile(vp, src.split(marker).join('    disposer = null  // lamp: never register'), 'utf8')
      const Lb = await bootWith(pathToFileURL(join(lampRoot, 'vibe-math-vmu', 'vibe-math-vmu.js')).href, { root: await mkdtemp(join(__tmpRoot(), 'vmu-run97-vlamp-root-')) })
      const st = json(await callJSON(Lb, 'vibe_vmu_status', { detail: 'full' }))
      ok(st && (!st.sections || st.sections.verifiedWarrantPolicy === undefined),
        '★★ LAMP(RED-worthy): without the pack registration the policy section DISAPPEARS — the real assertion depends on it', st && st.sections && Object.keys(st.sections))
    } finally { await rm(lampRoot, { recursive: true, force: true }).catch(() => {}) }
  }
  {
    const lampRoot = await mkdtemp(join(__tmpRoot(), 'vmu-run97-verified-lamp2-'))
    try {
      cpSync(join(REPO, 'vibe-math-vmu'), join(lampRoot, 'vibe-math-vmu'), { recursive: true })
      const vp = join(lampRoot, 'vibe-math-vmu', 'packs', 'v5r', 'middleware', 'verified-policy.js')
      const fsp = await import('node:fs/promises')
      const src = await fsp.readFile(vp, 'utf8')
      const marker = "  const req = read('vmu.verified.requireMachineWarrant') === true"
      ok(src.includes(marker), 'lamp2-setup: the setting read is locatable')
      await fsp.writeFile(vp, src.split(marker).join('  const req = false  // lamp: constant'), 'utf8')
      const Lb = await bootWith(pathToFileURL(join(lampRoot, 'vibe-math-vmu', 'vibe-math-vmu.js')).href, { root: await mkdtemp(join(__tmpRoot(), 'vmu-run97-vlamp2-root-')), 'vmu.verified.requireMachineWarrant': true })
      const st = json(await callJSON(Lb, 'vibe_vmu_status', { detail: 'full' }))
      const v = st && st.sections && st.sections.verifiedWarrantPolicy && st.sections.verifiedWarrantPolicy.value
      ok(v && v.machineOrLiterature === false,
        '★★ LAMP(RED-worthy): a CONSTANT reader reports false even with the setting true — the real assertion depends on a measured read', v)
    } finally { await rm(lampRoot, { recursive: true, force: true }).catch(() => {}) }
  }

console.log('\n=== RUN 97 VERIFIED GATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('FAILED: ' + f); process.exit(1) }
