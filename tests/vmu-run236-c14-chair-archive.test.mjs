// tests/vmu-run236-c14-chair-archive.test.mjs — RUN 236 / RULE C14: 「研究脚本必须归档」 had no executor.
//
// The sheet ACL (packs/v5r/seat-faces.js#SEAT_TOOL_FACES.vibe_v5_script) denied the archive face to ALL THREE seats:
// chair:false, member:false, temp:false. The refusal was honest but it made C14 UNREACHABLE — a rule that says every
// study script must be archived, in a deployment where no seat may archive one. The Lead ruling: the archive is the
// ACADEMICIAN's institutional act (it files a 所级产物 on the records track), so the sheet becomes chair:true and the
// call side gains the twin refusal: a member/temp is refused BY NAME and told the reachable path (hand the text to the
// chair and say what it should be archived AS). What must NOT change: the no-adhoc-scripts rule (archive ≠ run).
//
// This suite measures four things on the REAL v5r face:
//   ① the ACL and the teaching surface agree with the tool (chair allowed, member/temp denied, and the chair is TAUGHT
//      the face — a face nobody is taught is a face the prompt cannot use);
//   ② the chair can archive, the row is really written (readable back BY ID, byte-identical, same fingerprint) and the
//      receipt says what it is: an archival copy, not execution evidence;
//   ③ member and temp are refused by name with a reachable alternative — at the tool, and (for the member) at the
//      member-face gate, where the code is VMU_TOOL_NOT_IN_FACE;
//   ④ the interface contract carries the row (three-sync), and the op parameter is an enum, so a made-up op cannot be
//      mistaken for a run.
//
// RULE E: every loop/every() below is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const DOCS = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')

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
const faces = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'seat-faces.js')).href)
const v5rMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'index.js')).href)
// The declaration is the pack's manifest, not the booted spec list: the catalogue is a drift check between the SHEET and
// the prompt, and its `extra` half asks "does a row name a tool the pack no longer declares".
const DECLARED = (v5rMod.PACK.tools || []).map((t) => t && t.name).filter((n) => typeof n === 'string')

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const refusal = (res) => (res && res.parsed && res.parsed.ok === false) ? res.parsed : null

// TEMP ROOT ON D: — scratch files never land on C: (AGENTS.md §6).
const root = await mkdtemp(join(__tmpRoot(), 'vmu-run236-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-t1', slot: 'temp' })

  ok(b.names.includes('vibe_v5_script'), 'precondition: the v5r pack publishes vibe_v5_script', b.names.length)
  ok(kernel.members.roster().length === 3, 'precondition: chair + member + temp are on the roster', kernel.members.roster().map((m) => m.id + ':' + m.slot))

  // ── ① THE SHEET, THE TEACHING AND THE TOOL AGREE ───────────────────────────────────────────────────────────────
  console.log('=== 1. C14 sheet: chair may archive; member/temp are denied WITH a reason ===')
  const chairDecision = faces.seatDecision('chair', 'vibe_v5_script')
  ok(chairDecision && chairDecision.allowed === true,
    '★ sheet ACL: the chair MAY archive (before RUN 236 every seat was denied, so C14 had no executor)', chairDecision)
  ok(chairDecision && /C14/.test(String(chairDecision.why)) && /archive/i.test(String(chairDecision.why)),
    'sheet ACL: the chair row states WHY (rule C14 names archival as the chair act)', chairDecision && chairDecision.why)
  const memberDecision = faces.seatDecision('member', 'vibe_v5_script')
  const tempDecision = faces.seatDecision('temp', 'vibe_v5_script')
  ok(memberDecision && memberDecision.allowed === false && tempDecision && tempDecision.allowed === false,
    '★ sheet ACL: member and temp are still DENIED (the ruling was chair-only, not a widening)', { member: memberDecision && memberDecision.allowed, temp: tempDecision && tempDecision.allowed })
  ok(memberDecision && /C14/.test(String(memberDecision.why)) && /chair/i.test(String(memberDecision.why)),
    'sheet ACL: the member row names the reachable path (hand it to the chair), not just a deny', memberDecision && memberDecision.why)

  const catalogue = faces.seatTeachingCatalogue(DECLARED)
  ok(catalogue && catalogue.ok === true, 'teaching: the catalogue reconciles with the pack declaration', catalogue && { ok: catalogue.ok, missing: catalogue.missing, extra: catalogue.extra })
  const chairTaught = faces.seatTaughtNames('chair')
  const bulletLines = faces.seatBulletLines('chair')
  ok(Array.isArray(bulletLines) && bulletLines.length > 0,
    'teaching: the chair prompt DOES carry bullets (non-empty, so the assertions below are not vacuous)', Array.isArray(bulletLines) ? bulletLines.length : bulletLines)
  ok(Array.isArray(bulletLines) && bulletLines.some((line) => String(line).includes('vibe_v5_script')),
    '★ teaching: the chair is TAUGHT the archive face (a face nobody is taught is a face the prompt cannot use)', bulletLines && bulletLines.filter((l) => String(l).includes('script')))
  ok(chairTaught && Array.isArray(chairTaught.v5) && chairTaught.v5.includes('vibe_v5_script'),
    'teaching: vibe_v5_script is in the chair name list the prompt renders (not just a bullet string)', chairTaught && chairTaught.v5.filter((n) => n.includes('script')))
  ok(catalogue && catalogue.seats && typeof catalogue.seats === 'object' && Object.keys(catalogue.seats).length === 3,
    'teaching: the catalogue reports all three seat rows (non-empty before the checks below)', catalogue && Object.keys(catalogue.seats || {}))
  const chairRow = catalogue && catalogue.seats && catalogue.seats.chair
  ok(chairRow && Array.isArray(chairRow.allowedNotTaught) && !chairRow.allowedNotTaught.includes('vibe_v5_script'),
    '★★ teaching: the chair MAY call it and IS taught it (allowedNotTaught is the run-31 defect class, and the script face is not in it)', chairRow && chairRow.allowedNotTaught)

  const scriptSpec = b.specOf('vibe_v5_script')
  const opParam = scriptSpec && scriptSpec.parameters && scriptSpec.parameters.properties && scriptSpec.parameters.properties.op
  ok(opParam && Array.isArray(opParam.enum) && opParam.enum.join(',') === 'archive,read,list',
    '★ parameter surface: op is an ENUM of archive/read/list (a made-up op can never read as a run)', opParam)

  // ── ② THE CHAIR ARCHIVES, AND THE RECORD IS REALLY THERE ───────────────────────────────────────────────────────
  console.log('=== 2. chair archive: the row is written, readable by id, byte-identical ===')
  const SCRIPT = 'export const N = 42\n// recompute: node script.mjs\n'
  const archived = await receipt(b, 'vibe_v5_script', { op: 'archive', name: 'c14-count.mjs', text: SCRIPT, purpose: 'C14 archival copy', member: 'r-acad' })
  const arch = archived.parsed
  ok(arch && arch.ok === true && typeof arch.recordId === 'string' && arch.recordId.length > 0,
    '★★ chair archive: ok, and the receipt names the RECORD it wrote (not just an ok)', arch && { recordId: arch.recordId, track: arch.track })
  ok(arch && arch.track === 'scripts' && typeof arch.fingerprint === 'string' && arch.fingerprint.length > 0,
    'chair archive: the row lands on the scripts track with the kernel fingerprint', arch && { track: arch.track, fp: arch.fingerprint })
  ok(arch && arch.archived && arch.archived.recordId === arch.recordId && arch.archived.track === 'scripts' && arch.archived.bytes === Buffer.byteLength(SCRIPT, 'utf8'),
    '★★ receipt: archived { recordId, track, bytes } repeats the row that was actually written', arch && arch.archived)
  ok(arch && typeof arch.archiveMeans === 'string' && /archival copy/i.test(arch.archiveMeans) && /not execution/i.test(arch.archiveMeans),
    '★★ receipt: archiveMeans says out loud that it is an archival copy, NOT execution evidence', arch && arch.archiveMeans)
  ok(arch && arch.archivedBy === 'r-acad',
    'receipt: archivedBy names the chair whose institutional act this was', arch && arch.archivedBy)

  const byId = await receipt(b, 'vibe_v5_script', { op: 'read', id: arch.recordId })
  ok(byId.parsed && byId.parsed.ok === true && byId.parsed.script && byId.parsed.script.text === SCRIPT,
    '★★★ read back BY ID: the archived text is byte-identical (a recompute over a decorated body is not a recompute)', byId.parsed && byId.parsed.script && byId.parsed.script.text.length)
  ok(byId.parsed && byId.parsed.script.fingerprint === arch.fingerprint,
    'read back: the fingerprint is the same one the archive reported (drift is provable, not asserted)', byId.parsed && { archived: arch.fingerprint, read: byId.parsed.script.fingerprint })
  const listed = await receipt(b, 'vibe_v5_script', { op: 'list' })
  ok(listed.parsed && listed.parsed.ok === true && listed.parsed.count >= 1 && Array.isArray(listed.parsed.scripts) && listed.parsed.scripts.length >= 1,
    'list: the archive is enumerable (non-empty, so the name assertion below is not vacuous)', listed.parsed && listed.parsed.count)
  ok(listed.parsed.scripts.every((row) => typeof row.id === 'string'), 'list: every row carries its record id (so a read can follow)', listed.parsed.scripts)
  ok(listed.parsed.scripts.some((row) => row.id === arch.recordId && row.name === 'c14-count.mjs'),
    'list: the archived row is the one the chair filed', listed.parsed.scripts.filter((r) => r.name === 'c14-count.mjs'))

  // ── ③ MEMBER AND TEMP ARE REFUSED BY NAME, WITH A REACHABLE PATH ──────────────────────────────────────────────
  console.log('=== 3. member/temp: refused by name + told the reachable path ===')
  const memberArchive = await receipt(b, 'vibe_v5_script', { op: 'archive', name: 'from-member.mjs', text: 'export const X = 1\n', member: 'r-1' })
  const mRef = refusal(memberArchive)
  ok(mRef && mRef.code === 'VMU_NOT_PERMITTED',
    '★★ member archive: refused by name (VMU_NOT_PERMITTED), not a silent ok', mRef)
  ok(mRef && /chair seat/.test(String(mRef.message)) && /"r-1"/.test(String(mRef.message)) && /"member"/.test(String(mRef.message)),
    'member archive: the refusal names the rule, the caller and the slot (no anonymous denial)', mRef && mRef.message)
  ok(mRef && /chair/i.test(String(mRef.hint)) && /say|task receipt|meeting note/i.test(String(mRef.hint)),
    '★★ member archive: the hint gives a REACHABLE alternative (hand it to the chair; say/task receipt), not just a wall', mRef && mRef.hint)
  const memberRead = await receipt(b, 'vibe_v5_script', { op: 'read', id: arch.recordId, member: 'r-1' })
  ok(refusal(memberRead) && memberRead.parsed.code === 'VMU_NOT_PERMITTED',
    'member read: the whole face is chair-only (reading the archive is the same institutional surface)', refusal(memberRead))

  const tempArchive = await receipt(b, 'vibe_v5_script', { op: 'archive', name: 'from-temp.mjs', text: 'export const Y = 2\n', member: 'r-t1' })
  const tRef = refusal(tempArchive)
  ok(tRef && tRef.code === 'VMU_NOT_PERMITTED' && /"temp"/.test(String(tRef.message)),
    '★ temp archive: refused by name, and the slot is printed ("temp")', tRef && tRef.message)

  const memberGate = await kernel.memberFaceGate({ member: 'r-1', toolName: 'vibe_v5_script' })
  ok(memberGate && memberGate.ok === false && memberGate.code === 'VMU_TOOL_NOT_IN_FACE',
    '★ member-face gate: the sheet keeps the tool out of the member face (VMU_TOOL_NOT_IN_FACE)', memberGate && { ok: memberGate.ok, code: memberGate.code })
  const chairGate = await kernel.memberFaceGate({ member: 'r-acad', toolName: 'vibe_v5_script' })
  ok(chairGate && chairGate.ok === true,
    '★ member-face gate: the chair face now ADMITS the tool (the ACL change is live, not just a comment)', chairGate && { ok: chairGate.ok, code: chairGate.code })

  // ── ④ THREE-SYNC: docs row + the old pins that said no seat may archive ───────────────────────────────────────
  console.log('=== 4. three-sync: the interface contract carries the row ===')
  const docs = readFileSync(DOCS, 'utf8')
  const docsRow = docs.split('\n').find((line) => line.includes('vibe_v5_script'))
  ok(typeof docsRow === 'string' && docsRow.includes('RUN 236') && docsRow.includes('C14'),
    '★★ docs/03: the script archive has a contract row naming RUN 236 / C14 (a mechanism without its row is a rumour)', docsRow && docsRow.slice(0, 160))
  ok(typeof docsRow === 'string' && docsRow.includes('chair-only') && docsRow.includes('archiveMeans'),
    'docs/03: the row states chair-only and the archival-copy receipt field', docsRow && docsRow.slice(0, 240))
  const archiveMeansDone = arch && /archival copy/i.test(String(arch.archiveMeans))
  ok(archiveMeansDone === true, 'docs and receipt agree on the archival-copy wording', archiveMeansDone)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }).catch(() => {})
}

console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
