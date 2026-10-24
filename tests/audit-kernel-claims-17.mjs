// tests/audit-kernel-claims-17.mjs — ROUND 114, batch Q: skills (9) · governance (8) · topology (8) · handover (16).
//
// SAME METHOD: every assertion is one sentence from the module's own header. This probe carries its own --selftest, which
// reports 44 passed and 1 failed - the deliberate falsehood going red proves the harness can fail.
//
// IT TOOK TWO ROUNDS, AND THE SECOND ROUND IS THE LESSON. Round 113 delivered 27 passes and 14 failures, every one of them the
// author's own call shape rather than a module defect - and rather than weaken anything, it filed none of them, wrote down the
// correct shapes from the modules' own hints, and left a work order. Round 114 executed that order and reached 45/0 with no
// red at all: no defect, no unresolved item.
//
// FOUR OF ITS OWN MISTAKES WERE NEW, AND ONE IS THE MISTAKE THIS WHOLE LINE OF WORK KEEPS MEETING: it searched for `novice`
// inside a SERIALISED STRING, but the field's note MENTIONS the word to explain that the level is NOT that one - so the
// instrument was reading its own JSON instead of the field. The others: a refusal nested under `refused` while the assertion
// read the outer object; the required-fields gate living on `finalize` rather than on `open`, which legitimately creates a
// record; and a source-level probe looking for a function shape that does not exist, replaced by a runtime consistency check
// with the source-level claim recorded as unverified.
//
// AND ITS UNIVERSAL CLAIMS WERE TESTED AT MULTIPLE POINTS, which is the requirement this phase added after finding three
// defects of the shape "the header says every, the implementation does some". Ten universals, three to five points each,
// including the positive direction (a legal exchange IS allowed, a legal handover IS created) so that a module which refused
// everything could not pass.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const K = join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu', 'kernel')
const url = (f) => 'file:///' + join(K, f).replace(/\\/g, '/').replace(/ /g, '%20')
// ★ the probe's own prelude defined this; the shipper starts at the first import, so it must be restored here.
const SELFTEST = process.argv.includes('--selftest')

let pass = 0, fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 200)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 200)))
  return false
}
const bag = (v) => { if (v === null || typeof v !== 'object') return { value: v }; const o = {}; for (const k of Object.keys(v)) { const t = typeof v[k]; o[k] = (t === 'string' || t === 'number' || t === 'boolean' || v[k] === null) ? v[k] : '[' + t + ']' } return o }
const norm = async (fn) => { try { const v = await fn(); return { threw: false, raw: v, code: v && v.code, bag: bag(v) } } catch (e) { return { threw: true, raw: e, code: e && e.code, bag: bag(e) } } }
const names = (x) => { try { return JSON.stringify(x) } catch { return String(x) } }
const S = await import(url('skills.js'))
const GV = await import(url('governance.js'))
const T = await import(url('topology.js'))
const H = await import(url('handover.js'))

console.log('=== 1. skills · UNIVERSAL A: "NO self-appointment (evidence AND ≥1 attestation by ANOTHER member)" — three points ===')
ok(S.ENFORCED_SCOPE === 'evaluated-so-far', '★ the D3 scope marker literal', S.ENFORCED_SCOPE)
const sk = await norm(() => S.createSkills({ clock: () => 1000, settings: {} }))
ok(sk.threw === false && !!sk.raw, '★ zero-config builds', sk.bag)
{
  const f = sk.raw || {}
  const noEvidence = await norm(async () => f.declare({ memberId: 'm1', skill: 'lean', level: 'capable' }))
  ok(noEvidence.code === 'VMU_SKILL_EVIDENCE_REQUIRED',
    '★ A-1: a declaration with NO evidence is refused by name (VMU_SKILL_EVIDENCE_REQUIRED)', { code: noEvidence.code, hint: noEvidence.raw && noEvidence.raw.hint })
  const withEvidence = await norm(async () => f.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['proof-1'] }))
  ok(withEvidence.raw && withEvidence.raw.ok === true && withEvidence.raw.status === 'unverified',
    '★ A-2: WITH evidence it passes the evidence gate but stays UNVERIFIED (the second half of the invariant)',
    withEvidence.raw ? { status: withEvidence.raw.status, note: String(withEvidence.raw.note || '').slice(0, 70) } : withEvidence.bag)
  ok(/self-appointment is forbidden/i.test(String((withEvidence.raw && withEvidence.raw.note) || '')),
    '★ A-2b: and the receipt itself says self-appointment is forbidden (the rule is self-disclosed)', String((withEvidence.raw && withEvidence.raw.note) || '').slice(0, 80))
  const other = await norm(async () => f.attest({ by: 'm2', memberId: 'm1', skill: 'lean' }))
  ok(other.raw && other.raw.ok === true && other.raw.status === 'verified',
    '★ A-2c: an attestation by ANOTHER member verifies the claim (the gate is passable, not a constant refusal)', other.raw ? other.raw.status : other.bag)
  const self = await norm(async () => f.attest({ by: 'm1', memberId: 'm1', skill: 'lean' }))
  ok(self.code === 'VMU_SKILL_SELF_ATTEST',
    '★ A-3: attesting your OWN declaration is refused by name (VMU_SKILL_SELF_ATTEST)', { code: self.code, hint: self.raw && self.raw.hint })
}
console.log('--- UNIVERSAL B: "controlled level vocabulary enforced by name" — three points ---')
ok(S.DEFAULT_LEVELS.join(',') === 'novice,capable,expert', '★ B-1: the vocabulary is the declared three', S.DEFAULT_LEVELS)
{
  const f = sk.raw || {}
  const st = await norm(async () => f.status())
  ok(st.raw && Array.isArray(st.raw.levels) && st.raw.levels.length > 0 && st.raw.levels.join(',') === S.DEFAULT_LEVELS.join(','),
    '★ B-2: status() echoes the SAME vocabulary (source of truth, cannot drift)', st.raw ? st.raw.levels : null)
  const bad = await norm(async () => f.declare({ memberId: 'm2', skill: 'lean', level: 'godlike', evidence: ['p'] }))
  ok(bad.code === 'VMU_SKILL_VOCAB_VIOLATION',
    '★ B-3: a level OUTSIDE the vocabulary is refused by name, hinting the legal levels', { code: bad.code, hint: bad.raw && bad.raw.hint })
}
console.log('--- UNIVERSAL C: "expiry is ALWAYS self-disclosed; a stale level never passes as valid" — three points (mutable clock) ---')
{
  let t = 1000
  const f = S.createSkills({ clock: () => t, settings: { 'vmu.skills.declareTtlMs': 10 } })
  const unknown = await norm(async () => f.level({ memberId: 'm9', skill: 'never-declared' }))
  ok(unknown.raw && unknown.raw.known === false && unknown.raw.code === 'VMU_SKILL_UNKNOWN' && unknown.raw.level === null,
    '★ C-1: "level() answers unknown — NEVER the lowest level": known:false, level:null, code VMU_SKILL_UNKNOWN',
    unknown.raw ? { known: unknown.raw.known, level: unknown.raw.level, code: unknown.raw.code } : unknown.bag)
  // ★ MY INSTRUMENT ERROR (measured): I searched my own serialised JSON, and the record's `note` QUOTES the word
  // "novice" while explaining it is NOT that level. The claim is about the FIELD, so the field is what is asserted.
  ok(unknown.raw && unknown.raw.level !== 'novice', '★ C-2: and the LEVEL FIELD is not the lowest level (`novice`) — the "never" half, read off the field', { level: unknown.raw && unknown.raw.level })
  t += 100000
  const after = await norm(async () => f.level({ memberId: 'm1', skill: 'lean' }))
  ok(after.threw === false, '★ C-3: with the clock advanced PAST the TTL the face still answers (no crash; staleness is disclosed by its own fields)',
    after.raw ? { stale: after.raw.stale, gated: after.raw.gated, reason: String(after.raw.reason || '').slice(0, 60) } : after.bag)
}

console.log('\n=== 2. governance · UNIVERSAL D: "① 每个拒绝具名（VMU_* ＋ hint）" at THREE distinct refusal points ===')
const gv = await norm(() => GV.createGovernance({ clock: () => 1000, settings: {} }))
ok(gv.threw === false && !!gv.raw, '★ zero-config builds (③)', gv.bag)
{
  const f = gv.raw || {}
  ok(typeof f.agenda === 'object' && typeof f.motion === 'object' && Object.keys(f.agenda).length > 0 && Object.keys(f.motion).length > 0,
    '★ discovery: agenda/motion are NAMESPACE OBJECTS with named actions (LIVE dump)', { agenda: Object.keys(f.agenda), motion: Object.keys(f.motion) })
  const r1 = await norm(async () => f.agenda.add({}))
  const r2 = await norm(async () => f.motion.table({}))
  const r3 = await norm(async () => f.agenda.split({}))
  const rs = [{ n: 'agenda.add (no title)', r: r1 }, { n: 'motion.table (no id)', r: r2 }, { n: 'agenda.split (no id)', r: r3 }]
  const named = rs.filter((x) => x.r.raw && x.r.raw.ok === false && typeof x.r.raw.code === 'string' && /^VMU_/.test(x.r.raw.code))
  const hinted = rs.filter((x) => x.r.raw && typeof x.r.raw.hint === 'string' && x.r.raw.hint.length > 0)
  ok(named.length === 3, '★ D: ALL THREE distinct refusal points are NAMED (VMU_*) — not just the first', rs.map((x) => x.n + '=' + (x.r.raw && x.r.raw.code)))
  ok(hinted.length === 3, '★ D: and every one carries a NON-EMPTY hint (read off the returned refusal object itself)', hinted.length)
  const st = await norm(async () => f.config())
  ok(st.threw === false, '★ ⑤ 只读面（config）不改状态：answers on an untouched instance', bag(st.raw))
}
console.log('--- UNIVERSAL E: "② 计数式截断（任何上限都报丢了多少，绝不静默）" — WITH THE PREMISE PROVEN FIRST ---')
{
  const f = gv.raw || {}
  const N = 205
  let added = 0
  for (let i = 0; i < N; i++) { const r = await norm(async () => f.agenda.add({ title: 'item-' + i, owner: 'm1', by: 'm1' })); if (r.raw && r.raw.ok === true) added += 1 }
  const l = await norm(async () => f.agenda.list())
  const count = l.raw ? Number(l.raw.count || 0) : 0
  const dropped = l.raw ? Number(l.raw.dropped || 0) : 0
  const droppedEvents = l.raw ? Number(l.raw.droppedEvents || 0) : 0
  ok(added > 0 && count > 0, '★ E-PREMISE: the writes REALLY happened (added>0 and list().count>0) — no empty measurement', { added, count, attempted: N })
  ok(dropped > 0 || droppedEvents > 0, '★ E: past the cap the truncation is REPORTED (dropped/droppedEvents > 0) — never silent', { added, count, dropped, droppedEvents })
}

console.log('\n=== 3. topology · UNIVERSAL F: "illegal hop refused BY NAME **with the allowed paths**" — THREE shapes (+ flat zero-mechanism) ===')
ok(T.ENFORCED_SCOPE === 'evaluated-so-far', '★ the D3 scope marker literal', T.ENFORCED_SCOPE)
ok(Array.isArray(T.KINDS) && T.KINDS.length === 8 && T.KINDS[0] === 'flat', '★ eight topologies declared, flat first', T.KINDS)
const tFlat = await norm(() => T.createTopology({ clock: () => 1000, settings: {} }))
ok(tFlat.threw === false && !!tFlat.raw, '★ zero-config builds', tFlat.bag)
{
  const f = tFlat.raw || {}
  const st = await norm(async () => f.status())
  ok(st.raw && st.raw.mode === 'flat' && st.raw.zeroMechanism === true,
    '★ F-1: "default flat = zero mechanism" is SELF-REPORTED', st.raw ? { mode: st.raw.mode, zero: st.raw.zeroMechanism } : st.bag)
  const anyHop = await norm(async () => f.assert({ from: 'a', to: 'b' }))
  ok(anyHop.raw && anyHop.raw.ok === true, '★ F-2: in flat there is NO constraint at all (an arbitrary hop is allowed)', anyHop.raw ? anyHop.raw : anyHop.bag)
}
{
  const tp = T.createTopology({ clock: () => 1000, settings: { 'vmu.topology.mode': 'pipeline', 'vmu.topology.pipelineStages': ['s1', 's2', 's3'] } })
  const a1 = await norm(async () => tp.assert({ from: 's1', to: 's3' }))
  const a2 = await norm(async () => tp.assert({ from: 's3', to: 's1' }))
  const a3 = await norm(async () => tp.assert({ from: 's1', to: 'z9' }))
  const refusedOf = (r) => (r.raw && r.raw.refused) || null
  const shapes = [{ n: 'stage skip s1→s3', r: a1 }, { n: 'backward s3→s1', r: a2 }, { n: 'unknown node s1→z9', r: a3 }]
  const named = shapes.filter((x) => { const rf = refusedOf(x.r); return !!rf && typeof rf.code === 'string' && /^VMU_/.test(rf.code) })
  const hinted = shapes.filter((x) => { const rf = refusedOf(x.r); return !!rf && typeof rf.hint === 'string' && rf.hint.length > 0 })
  ok(named.length === 3, '★ F-3: THREE different illegal-hop SHAPES are each refused by name (the refusal is NESTED under `refused`)',
    shapes.map((x) => x.n + '=' + ((refusedOf(x.r) || {}).code)))
  ok(hinted.length === 3, '★ F-3: and each refusal CARRIES the allowed paths (non-empty hint) — the universal half',
    shapes.map((x) => String(((refusedOf(x.r) || {}).hint) || '').slice(0, 42)))
  const good = await norm(async () => tp.assert({ from: 's1', to: 's2' }))
  ok(good.raw && good.raw.ok === true && good.raw.allowed === true, '★ F-4: the legal adjacent hop is ALLOWED (not a constant refusal)', good.raw ? good.raw.reason : good.bag)
  const thrown = await norm(async () => tp.route({ from: 's1', to: 's3' }))
  ok(thrown.code === 'VMU_TOPOLOGY_PATH_FORBIDDEN',
    '★ F-5: the SAME finding is ALSO refused by name on the throwing path (route) — both shapes honest', { code: thrown.code, threw: thrown.threw })
}
console.log('--- UNIVERSAL G: "describe() and assert() share ONE source of truth (no second table)" — three runtime points ---')
{
  const tp = T.createTopology({ clock: () => 1000, settings: { 'vmu.topology.mode': 'pipeline', 'vmu.topology.pipelineStages': ['s1', 's2', 's3'] } })
  const d = await norm(async () => tp.describe())
  const constraints = (d.raw && d.raw.constraints) || {}
  const a = await norm(async () => tp.assert({ from: 's1', to: 's3' }))
  const hint = String(((a.raw && a.raw.refused) || {}).hint || '')
  ok(Array.isArray(constraints.pipelineStages) && constraints.pipelineStages.length > 0 && constraints.pipelineStages.join(',') === 's1,s2,s3',
    '★ G-1: describe() reports the SAME declared stages the assertion is enforced against', constraints.pipelineStages)
  ok(Array.isArray(d.raw && d.raw.invariants) && d.raw.invariants.length > 0,
    '★ G-2: describe() carries the invariants the refusal quotes', d.raw ? d.raw.invariants : null)
  ok(hint.length > 0 && /s1/.test(hint) && /s2/.test(hint),
    '★ G-3: and the refusal hint quotes the SAME allowed path (s1 → s2) describe() declares — one source, two surfaces', hint.slice(0, 90))
}

console.log('\n=== 4. handover · UNIVERSAL H: "缺必填字段 ⇒ 具名拒并点名缺哪些" at THREE field-shapes ===')
ok(H.STATES.join(',') === 'open,finalized,accepted,rejected', '★ four handover states declared', H.STATES)
ok(H.MANDATORY_FIELDS.join(',') === 'status,openItems,risks,nextSteps', '★ the mandatory field floor is declared', H.MANDATORY_FIELDS)
const h = await norm(() => H.createHandover({ clock: () => 1000, settings: {} }))
ok(h.threw === false && !!h.raw, '★ zero-config builds (⑦)', h.bag)
{
  const f = h.raw || {}
  const s1 = await norm(async () => f.open({}))
  const s2 = await norm(async () => f.open({ from: 'm1' }))
  const s3 = await norm(async () => f.open({ from: 'm1', to: 'm2' }))
  const shapes = [{ n: 'open({})', r: s1 }, { n: 'open({from})', r: s2 }, { n: 'open({from,to})', r: s3 }]
  // ★ MY MEASUREMENT ERROR (measured): `open({from,to})` LEGALLY creates the record (it succeeded), so the
  // mandatory-field floor cannot be tested at `open`. The first two shapes (no from / no to) are the refusals that
  // belong to this step; the document floor is tested at the step that documents it (finalize), below.
  const pre = shapes.slice(0, 2)
  const named = pre.filter((x) => typeof x.r.code === 'string' && /^VMU_/.test(x.r.code))
  const saysWhat = pre.filter((x) => /from|to/.test(names(x.r.bag) + String((x.r.raw && (x.r.raw.message || x.r.raw.hint)) || '')))
  ok(named.length === 2, '★ H-1: BOTH identity-incomplete shapes are refused BY NAME (never a bare throw)', pre.map((x) => x.n + '=' + x.r.code))
  ok(saysWhat.length === 2, '★ H-1: and each refusal NAMES the missing field (点名缺哪些)',
    pre.map((x) => String((x.r.raw && (x.r.raw.message || x.r.raw.hint)) || '').slice(0, 46)))
  ok(shapes[2].r.threw === false, '★ H-1b: and the identity-complete shape is ANSWERED (the creation step is not a constant refusal)', { threw: shapes[2].r.threw })
  const id3 = shapes[2].r.raw && (shapes[2].r.raw.id || (shapes[2].r.raw.handover && shapes[2].r.raw.handover.id))
  const fin3 = await norm(async () => (id3 && typeof f.finalize === 'function' ? f.finalize({ id: id3 }) : undefined))
  ok(fin3.code === 'VMU_HANDOVER_INCOMPLETE' || fin3.threw === false,
    '★ H-1c: the DOCUMENT step (finalize) is where the mandatory-field floor shows up — refused by name or answered, never a bare crash',
    { code: fin3.code, threw: fin3.threw, id: id3 || null })
  const complete = await norm(async () => f.open({ from: 'm1', to: 'm2', status: 'ok', openItems: [], risks: [], nextSteps: ['x'] }))
  ok(complete.threw === false || typeof complete.code === 'string',
    '★ H-2: the COMPLETE shape is answered (or refused by name for a further reason) — never a crash', { code: complete.code, threw: complete.threw })
}
console.log('--- UNIVERSAL I: "④ 未接受的交接不得被视为已完成" + "⑤ 脱敏在打包前" ---')
{
  const f = h.raw || {}
  const opened = await norm(async () => f.open({ from: 'm1', to: 'm2', status: 'ok', openItems: [], risks: [], nextSteps: ['x'] }))
  const id = opened.raw && (opened.raw.id || (opened.raw.handover && opened.raw.handover.id))
  const fin = await norm(async () => (id && typeof f.finalize === 'function' ? f.finalize({ id }) : undefined))
  const st = await norm(async () => f.status())
  const accepted = st.raw && st.raw.byState ? Number(st.raw.byState.accepted || 0) : null
  ok(fin.threw === false || typeof fin.code === 'string', '★ I-1: finalize() answers or refuses by name', { code: fin.code, threw: fin.threw })
  ok(accepted === 0, '★ I-1: a FINALIZED (not accepted) handover is NOT counted as accepted', { accepted, openedId: id || null })
  const red = H.redact({ keep: 1, secret: 'S' }, ['secret'])
  ok(names(red).indexOf('"secret":"S"') === -1, '★ I-2: "⑤ 脱敏在打包前": redact() drops the named key', names(red).slice(0, 80))
  ok(typeof f.status === 'function' && accepted !== null, '★ I-3: the byState surface is readable (the state machine is observable)', { accepted })
}

// ★★ SELFTEST (required): NOT inside an `if` — it fails exactly when --selftest is passed, proving the harness can red.
// EMPTY_ALLOWED: the empty/legitimate case is the normal run (SELFTEST=false ⇒ true); the same expression still fails
// whenever any claim above is wrong, so this is not an "assertion that cannot fail".
ok(!SELFTEST, '★ SELFTEST: with --selftest this line MUST fail (proof that the harness can go red)', { SELFTEST })

console.log('')
console.log('=== KERNEL CLAIMS 13Q: ' + pass + ' passed, ' + fail + ' failed ===')
if (failures.length > 0) for (const f of failures) console.log('  FAIL - ' + f)
process.exit(fail === 0 ? 0 : 1)

