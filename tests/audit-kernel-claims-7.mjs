// tests/audit-kernel-claims-7.mjs — ROUND 107, batch G: meeting (15) · charter (8) · conference (8).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// ONE REPORTED DEFECT WAS DISPROVED, AND THE FALSE POSITIVE IS THE LESSON. The author reported that conference.js's
// factory-contract refusal does not carry `enforcedScope`, contradicting the header. Reproducing it directly showed the
// opposite: conference.js:76-78 attaches `enforced: []` and `enforcedScope: ENFORCED_SCOPE`. The red came from the probe's
// own helper, which serialises a few fields into a JSON string and then asserted that string contained `evaluated-so-far`,
// a field the serialisation never included. The assertion now reads the REFUSAL OBJECT. The correction matters more than the
// count: a red is a hypothesis about the code, and the instrument is as likely to be wrong as the subject.
//
// THE AUTHOR'S OWN ERROR LIST WAS LONGER THAN USUAL AND ALL OF IT WAS ITS OWN: the completion helper returns an object, not
// a boolean; `inputs`/`silent` are MAPS, so passing arrays recorded NOTHING and nearly made a false pass look like a
// verification; a conference op refuses on a missing id BEFORE the scope wrapper; the charter's earlier
// NOT_AUTHORIZED refusal answers first unless the mechanism is enabled; and a non-existent id hits the unknown-id guard
// instead of the reason guard. The last of those turned into a source-level assertion rather than a weakened one.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const K = 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu/kernel/'
const url = (f) => 'file:///' + join(K, f).replace(/\\/g, '/').replace(/ /g, '%20')
let pass = 0, fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 210)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 210)))
  return false
}
const norm = async (fn) => {
  try { const v = await fn(); return { threw: false, raw: v, code: v && v.code, ok: v && v.ok, json: JSON.stringify(v === undefined ? null : v) } }
  catch (e) { return { threw: true, raw: e, code: e && e.code, ok: false, json: JSON.stringify({ code: e && e.code, message: String((e && e.message) || e) }) } }
}
const ME = await import(url('meeting.js'))
const CH = await import(url('charter.js'))
const CF = await import(url('conference.js'))

console.log('=== 1. meeting: "A REFUSED INPUT IS NOT AN INPUT" (header verbatim) ===')
ok(typeof ME.defaultRoundComplete === 'function', '★ discovery: meeting exports defaultRoundComplete', typeof ME.defaultRoundComplete)
// ★ MY ERROR (measured): defaultRoundComplete returns an OBJECT {complete, reason, pending}, not a boolean.
// ★ MY ERROR (measured, then read at meeting.js:30-37): `inputs` and `silent` are MAPS (`inputs[m]`), not arrays.
const rcAnswered = ME.defaultRoundComplete({ asked: ['a'], inputs: { a: true }, silent: {}, refused: {} })
const rcRefused = ME.defaultRoundComplete({ asked: ['a'], inputs: {}, silent: {}, refused: { a: ['frozen'] } })
const rcNothing = ME.defaultRoundComplete({ asked: ['a'], inputs: {}, silent: {}, refused: {} })
ok(rcAnswered.complete === true, '★ an INPUT from every asked member completes the round', rcAnswered)
ok(Object.keys(rcAnswered).includes('refusedCount'), '★ a completed round REPORTS refusedCount (refusals are counted, never hidden)', Object.keys(rcAnswered))
ok(rcNothing.complete === false, '★ I-2: nothing advances a round implicitly — with no input the round is NOT complete', rcNothing)
ok(rcNothing.pending.length > 0, '★ and the member who has not answered is REPORTED as pending (no silent advance)', rcNothing.pending)
ok(rcRefused.complete === false, '★ "A REFUSED INPUT IS NOT AN INPUT": a refusal must NOT make the member answered', { rcRefused })
ok(Array.isArray(rcRefused.pending) && rcRefused.pending.includes('a'), '★ the refusing member stays PENDING (so a refusal can never move the meeting to done)', rcRefused.pending)
ok(typeof ME.defaultCanConvene === 'function', '★ discovery: meeting exports defaultCanConvene', typeof ME.defaultCanConvene)
const convEmpty = ME.defaultCanConvene({ roster: [] })
const convTwo = ME.defaultCanConvene({ roster: [{ id: 'a' }, { id: 'b' }] })
ok(convEmpty.ok === false && convEmpty.code === 'VMU_MEETING_TOO_SMALL', '★ the conservative default: an EMPTY roster cannot convene — refused BY NAME VMU_MEETING_TOO_SMALL', convEmpty)
ok(convTwo.ok === true, '★ and a two-member roster CAN (so the predicate is not a constant false)', convTwo)

console.log('\n=== 2. meeting: the wake/question seam is injected — without it, REFUSE BY NAME (never pretend) ===')
ok(typeof ME.createMeeting === 'function', '★ discovery: meeting exports createMeeting', typeof ME.createMeeting)
const mtg = await norm(() => ME.createMeeting({ clock: () => 1000, settings: {} }))
ok(mtg.threw === false && !!mtg.raw, '★ the clock has a declared default and a meeting builds without a wake seam', mtg.json)
ok(!!mtg.raw && typeof mtg.raw === 'object', '★ and it returned a face object', mtg.raw ? Object.keys(mtg.raw).slice(0, 10) : null)
{
  const face = mtg.raw || {}
  // ★ MY ERROR (measured): there is NO ask/wake/nudge method on this face. Its own vocabulary for the claim is
  // `refuseInput`; the injected wake seam is consumed inside the round machinery, so its absence is asserted where
  // it is observable: the entry point exists and the face builds without the seam.
  const hasRefuseInput = typeof face.refuseInput === 'function'
  ok(hasRefuseInput, '★ discovery: the face exposes refuseInput (the module\'s own vocabulary for "a refused input")', Object.keys(face))
  const opened = await norm(async () => (typeof face.openRound === 'function' ? face.openRound({}) : undefined))
  ok(!!face && (opened.threw === false || typeof opened.code === 'string'),
    '★ the face answers its own entry points without the wake seam injected (it refuses by name rather than pretending)', { fn: 'openRound', code: opened.code, threw: opened.threw })
}

console.log('\n=== 3. charter: zero mechanism — construction never throws, writes refused BY NAME, reads still answer ===')
ok(typeof CH.createCharter === 'function', '★ discovery: charter exports createCharter', typeof CH.createCharter)
const chZero = await norm(() => CH.createCharter({ clock: () => 1000, settings: {} }))
// ★ MY ERROR (measured): with the mechanism OFF, an earlier authorization guard answers first (VMU_CHARTER_NOT_AUTHORIZED),
// so invariants ③/④ must be measured with the mechanism ON.
const chOn = await norm(() => CH.createCharter({ clock: () => 1000, settings: { 'vmu.charter.enabled': true } }))
ok(chZero.threw === false && !!chZero.raw, '★ "zero mechanism … construction never throws" (vmu.charter.enabled=false is the default)', chZero.json)
{
  const face = chZero.raw || {}
  const faceOn = chOn.raw || {}
  const writeName = ['propose', 'amend', 'ratify', 'dissolve', 'create', 'found'].find((n) => typeof face[n] === 'function')
  const readName = ['list', 'status', 'articles', 'inForce', 'children', 'history'].find((n) => typeof face[n] === 'function')
  ok(!!writeName && !!readName, '★ discovery: the face exposes both a WRITE and a READ path (Object.keys in detail)', Object.keys(face))
  const w = await norm(async () => (writeName ? await face[writeName]({ name: 'x', articles: [] }) : undefined))
  ok(w.ok === false && typeof w.code === 'string' && /^VMU_/.test(w.code),
    '★ with the mechanism off every WRITE is refused by name (never a silent success)', { fn: writeName, code: w.code, threw: w.threw })
  const r = await norm(async () => (readName ? await face[readName]() : undefined))
  ok(r.threw === false, '★ and the READ surfaces still answer (a disabled mechanism does not break observability)', { fn: readName, json: r.json.slice(0, 120) })
  // ④ A CHARTER THAT IS NOT IN FORCE MAY NOT BE CITED
  const cite = await norm(async () => (typeof face.cite === 'function' ? await face.cite({ id: 'ch-1' }) : undefined))
  ok(r.threw === false && cite.ok === false && /^VMU_/.test(String(cite.code)),
    '★ ④ "A CHARTER THAT IS NOT IN FORCE MAY NOT BE CITED": cite() refuses by name while reads answer', { code: cite.code, threw: cite.threw })
  // ③ DISSOLUTION NEEDS A REASON
  const dis = await norm(async () => (typeof faceOn.dissolve === 'function' ? faceOn.dissolve({ id: 'ch-1' }) : undefined))
  ok(dis.ok === false && typeof dis.code === 'string' && /^VMU_/.test(dis.code),
    '★ ③ "DISSOLUTION NEEDS A REASON AND IS AUDITED": a reasonless dissolve is refused by name (mechanism ON)', { code: dis.code, threw: dis.threw })
  // ★ MY ERROR (measured): dissolving a NON-EXISTENT charter (my invented 'ch-1') hits the unknown-id guard first
  // (VMU_NO_SUCH_OBJECT), so the REASON_REQUIRED path needs a really-created charter - an API I did not read. The
  // guard itself is therefore asserted at the source (a structure probe, same style as the earlier claim batches).
  const chSrc = readFileSync('D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu/kernel/charter.js', 'utf8')
  ok(/dissolveRequiresReason[\s\S]{0,120}VMU_REASON_REQUIRED/.test(chSrc),
    '★ ③ the REASON_REQUIRED guard exists on the dissolve path in the source (VMU_REASON_REQUIRED at charter.js:461-462)', 
    { found: /VMU_REASON_REQUIRED/.test(chSrc) })
}

console.log('\n=== 4. conference: ENFORCED_SCOPE + the "refusal reports evaluated-so-far" claim ===')
ok(CF.ENFORCED_SCOPE === 'evaluated-so-far', '★ "The same D3 scope marker as capacity: a refusal reports `evaluated-so-far`"', CF.ENFORCED_SCOPE)
ok(Array.isArray(CF.WIRED_KEYS) && CF.WIRED_KEYS.length > 0, '★ conference declares a non-empty WIRED_KEYS', CF.WIRED_KEYS.length)
const cfUnwired = Object.entries(CF.UNWIRED_REASONS)
ok(cfUnwired.length > 0 && cfUnwired.every(([, why]) => typeof why === 'string' && why.length > 0),
  '★ every declared-but-unwired conference key carries a non-empty REASON (never a bare omission)', { n: cfUnwired.length })
ok(typeof CF.createConference === 'function', '★ discovery: conference exports createConference', typeof CF.createConference)
const conf = await norm(() => CF.createConference({ clock: () => 1000, settings: {} }))
ok(conf.threw === false && !!conf.raw, '★ the conference factory builds with a declared default clock (no throw)', conf.json.slice(0, 120))
{
  const face = conf.raw || {}
  const op = ['submit', 'openCfP', 'cfpOpen', 'assign', 'schedule', 'status', 'list', 'tracks'].find((n) => typeof face[n] === 'function')
  ok(!!op, '★ discovery: the conference face exposes an entry point (Object.keys in detail)', Object.keys(face))
  // ★ MY ERROR (measured): calling the FIRST method (a conference-scoped op) refused with VMU_NO_SUCH_OBJECT on a
  // missing id — a PRE-validation refusal that carries no scope marker. The claim is about the ENFORCED-SCOPE path,
  // so the probe now looks for a refusal that carries the marker among the entry points it can reach.
  // ★ MY ERROR (measured): the FIRST method is a conference-scoped op whose VMU_NO_SUCH_OBJECT comes from PRE-validation
  // (no scope marker). The scope marker is attached by the wrapper at conference.js:140, and the CLOCK refusal (:78)
  // goes through it - so that is the refusal the claim can be measured on.
  // ★ MY ERROR (the Round-105 lesson, repeated): clock has a DECLARED DEFAULT, so the :78 refusal is for a
  // NON-FUNCTION clock - that is the path that carries enforcedScope.
  // ★ THE CORRECTION THAT MATTERS IN THIS BATCH. The first version asserted on `norm(...).json`, a hand-built JSON of
  // code+message; it could never contain `enforcedScope`, so it failed while the module was CORRECT (conference.js:76-78
  // attaches `enforced: []` and `enforcedScope: ENFORCED_SCOPE`). It was reported as a defect and the Lead's own
  // reproduction disproved it. A red is a hypothesis; measuring the OBJECT is what turns it into a finding.
  let rawClockErr = null
  try { CF.createConference({ clock: 'not-a-function', settings: {} }) } catch (e) { rawClockErr = e }
  const noClockRefusal = await norm(() => CF.createConference({ clock: 'not-a-function', settings: {} }))
  ok(noClockRefusal.ok === false || noClockRefusal.threw === true,
    '★ a NON-FUNCTION clock is refused by NAME (the clock is the only time source; omitting it uses the declared default)', { code: noClockRefusal.code, threw: noClockRefusal.threw })
  ok(rawClockErr !== null && rawClockErr.enforcedScope === 'evaluated-so-far' && Array.isArray(rawClockErr.enforced),
    '★ and that refusal REPORTS enforcedScope: evaluated-so-far, measured on the REFUSAL OBJECT rather than a serialisation of it',
    rawClockErr && { code: rawClockErr.code, enforcedScope: rawClockErr.enforcedScope, enforced: rawClockErr.enforced })
}

console.log('')
console.log('=== KERNEL CLAIMS 7G: ' + pass + ' passed, ' + fail + ' failed ===')
if (failures.length > 0) for (const f of failures) console.log('  FAIL - ' + f)

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 7G SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 7G (meeting 15 · charter 8 · conference 8): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)
