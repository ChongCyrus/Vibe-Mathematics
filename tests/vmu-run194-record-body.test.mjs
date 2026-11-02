// RUN 194 — run 36 / FEEDBACK35 1.4 and 2.5: a record that could be written and never read back, and a note that
// spoke to the wrong party.
//
// 1.4  The meeting RECORD BODY had no tool read face at all. `summary` carries the board (present / motions / votes),
//      `status` the state machine, `snapshot` is the PRIMITIVE durable serialisation (and for a service meeting it is
//      refused by name, VMU_REGISTRY_BOUNDARY). So what was actually SAID — the minutes entries: speeches, vote events,
//      refusals, dissent — could be recorded by every face that writes them and read back by nobody. The service has had
//      `minutes()` / `verbatim()` the whole time; nothing routed to them. Run 36's temp seat could not attend a debate,
//      tried `snapshot` to read what happened, and got the boundary refusal: the meeting had a record and no read face.
// 2.5  `memberScopeNote` is the paragraph a MEMBER prompt carries. The office that calls `vibe_v5_start` read it as if
//      it also described the caller's own harness — it does not, and nothing said who the sentence addresses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const MEETING = read('vibe-math-vmu/tools/meeting.js')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — still present: ' + needle)

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, specs, call }
}

test('RUN 194 §0 — the two faces are declared and routed (source pins)', () => {
  has(MEETING, "'minutes', 'verbatim'", '§0a the action enum accepts the two record-body reads')
  has(MEETING, 'minutes｜verbatim', '§0b and the parameter description names them for a reader')
  has(MEETING, "if (action === 'minutes' || action === 'verbatim')", '§0c there is one branch for both')
  has(MEETING, 'the RECORD BODY of a meeting had no tool read face', '§0d the repair names the defect it fixes')
  has(MEETING, 'run 36 / FEEDBACK35 1.4', '§0e and run 36 is named as the measurement')
  has(MEETING, 'allowArchived: true', '§0f a closed meeting keeps its minutes readable')
  has(MEETING, "action === 'minutes'", '§0g the two bodies are told apart')
  has(MEETING, 'VERBATIM transcript', '§0h the transcript says it is pruned by its own setting')
  has(TOOLS, 'memberScopeNoteMeans', '§0i the member-scope note says who it addresses')
  has(TOOLS, 'written for a MEMBER', '§0j and that it is the member prompt\'s paragraph')
  has(TOOLS, 'NOT a statement about the caller of vibe_v5_start', '§0k ★ the office is not told it lacks its own tools')
})

test('RUN 194 §1 — a service meeting\u2019s minutes are readable, and stay readable after it closes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run194-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const opened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '读到会议记录正文', title: 'record body probe' })
    ok(opened.ok !== false, '§1a the meeting opens', opened)
    const mid = String(opened.meeting || opened.id)
    ok(mid.length > 0, '§1b with a real id', opened)
    // a member speaks: that is the fact the record body must be able to show
    await call('vibe_vmu_meeting', { action: 'attend', id: mid, member: 'r-1' })
    const said = await call('vibe_v5_say', { meeting: mid, member: 'r-1', text: '本席认为该命题的归纳步需要单独引理' })
    ok(said.ok !== false, '§1c a member speaks into the meeting', said)
    const minutes = await call('vibe_vmu_meeting', { action: 'minutes', id: mid })
    ok(minutes.ok !== false, '§1d ★ the record body answers on the tool face', minutes)
    ok(Array.isArray(minutes.entries), '§1e with the entries list (speeches / votes / refusals)', Object.keys(minutes))
    const speech = (minutes.entries || []).filter((e) => e && e.kind === 'speech' && e.member === 'r-1')[0]
    ok(!!speech, '§1f ★ the fact that r-1 spoke is in the record (the body, not just the board)', minutes.entries)
    // the transcript is a DIFFERENT record and its own declared setting decides whether it captured words
    const verbatim = await call('vibe_vmu_meeting', { action: 'verbatim', id: mid })
    ok(verbatim.ok !== false, '§1g the transcript face answers too', verbatim)
    ok(verbatim.enabled === false || Array.isArray(verbatim.lines), '§1h with the enabled flag a reader can trust', verbatim)
    if (verbatim.enabled === false) has(String(verbatim.note || ''), 'verbatimEnabled', '§1i ★ and names the setting that silenced it, instead of an empty list')
    ok(minutes.registry === 'service', '§1j and the receipt says which registry answered', minutes.registry)
    has(minutes.recordMeans, 'RECORD BODY', '§1k the receipt says what this is, as against the board')
    // close it: a closed meeting keeps its record
    await call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'probe' })
    const after = await call('vibe_vmu_meeting', { action: 'minutes', id: mid })
    ok(after.ok !== false, '§1l ★ a CLOSED meeting still answers its minutes', after)
    ok((after.entries || []).filter((e) => e && e.kind === 'speech' && e.member === 'r-1').length === 1,
      '§1m ★ and the speech is still in them', after.entries)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 194 §1 — a PRIMITIVE meeting is told which face holds its record, instead of "no such object"', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run194b-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const opened = await call('vibe_vmu_meeting', { action: 'open', id: 'prim-1', roster: ['r-acad', 'r-1', 'r-2'] })
    ok(opened.ok !== false, '§2a a primitive meeting opens on this face', opened)
    const got = await call('vibe_vmu_meeting', { action: 'minutes', id: 'prim-1' })
    ok(got.ok === false, '§2b ★ minutes on a primitive meeting is a NAMED refusal, not a silent empty list', got)
    ok(got.code === 'VMU_INVALID_ARGUMENT', '§2c naming the call, not the id', got.code)
    has(got.message, 'PRIMITIVE meeting', '§2d the message says which table it is')
    has(got.hint, 'action: "summary"', '§2e ★ and points at the read face that DOES hold its record')
    ok(got.registry === 'primitive', '§2f with the registry disclosed', got.registry)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 194 §1 — vibe_v5_start says who the member-scope note addresses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run194c-'))
  try {
    const { call } = await assemble(dir)
    const started = await call('vibe_v5_start', { researcherCount: 2 })
    ok(typeof started.memberScopeNoteMeans === 'string' && started.memberScopeNoteMeans.length > 0,
      '§3a the note carries its own meaning', started.memberScopeNoteMeans)
    has(started.memberScopeNoteMeans, 'written for a MEMBER', '§3b addressed to the member, not to the caller')
    has(started.memberScopeNoteMeans, 'NOT a statement about the caller', '§3c ★ so the office does not read it as its own limit')
    ok(typeof started.memberScopeNote === 'string' && started.memberScopeNote.includes('不在你的线束里'),
      '§3d the note itself is unchanged (it is what a member reads)', started.memberScopeNote)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
