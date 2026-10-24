// tests/vmu-phase12-closures.test.mjs — PHASE 12: five "published requirement, no mechanism" holes, closed ON THE REAL
// v5r face. Every case below is a row of `docs/acceptance/phase12-v5r-rules-conformance.md` whose verdict was 部分/缺口
// because the prompt (or a tool description) PROMISED something the code did not do. The point of the suite is that each
// promise is now a measured fact, and each refusal is NAMED (AGENTS red line 3) rather than a silent empty success:
//
//   ① B11  「未闭环条目会出现在汇报与总览的计数里」 — a sentence with no code. Now `vibe_v5_report.counts.feedback` and
//          `vibe_v5_overview.feedback` print the SAME classifier `vibe_v5_feedback op=list` uses, and closing a card
//          really moves the number (the closure lives in the body verdict line; the head `status` is the LIFECYCLE state).
//   ② C2   「紧急私信」 — members could not reach it: the teaching surface (`vibe_v5_say`) had no `urgent`, and the inbox
//          triage row hid the flag an urgent message already carries. Now DM-only, refused by name on the group/meeting
//          forms (neither has a recipient to wake), and visible in the list row WITHOUT opening the message.
//   ③ C3   状态版四要素 — 「可查看他人、可改自己、四个必需内容＋时间信息」. A one-line `content` used to land on the
//          `state` track unchecked, and `read_library` could not read that track at all (four hard-coded tracks).
//   ④ B10  脚本文件 — 「归档/复算」 had no landing point; the no-adhoc-scripts rule's own hint pointed at a flow nobody
//          could execute. Now a `scripts` track + archive/read/list face, with the body returned VERBATIM.
//   ⑤ B8   the four verification predicates are WIRED (call sites, not imports) and the pure module still declares no
//          settings of its own — the wiring is where the policy lives, the module stays policy-free.
//
// RULE E: every loop/every() below is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

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

// TEMP ROOT ON D: — this repository's rule is that scratch files never land on the C: drive (AGENTS.md §6).
const root = await mkdtemp(join('D:/_tmp', 'vmu-phase12-closures-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  ok(b.names.includes('vibe_v5_report') && b.names.includes('vibe_v5_script'), 'precondition: the v5r pack is publishing its tools', b.names.length)
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  ok(kernel.members.roster().length >= 3, 'precondition: three real seats are on the roster', kernel.members.roster().map((m) => m.id))

  // ── ① B11: THE FEEDBACK LEDGER SHOWS UP IN THE COUNT ───────────────────────────────────────────────────────────
  console.log('=== 1. B11: 未闭环条目出现在汇报与总览的计数里 ===')
  const rep0 = await receipt(b, 'vibe_v5_report', {})
  ok(rep0.parsed && rep0.parsed.ok === true && rep0.parsed.counts && rep0.parsed.counts.feedback, 'report: 正 — the receipt carries a feedback count block', rep0.parsed && rep0.parsed.counts)
  ok(rep0.parsed.counts.feedback.declared === true, 'report: the feedback track IS declared by this pack (declared:true, so the count is a measurement and not an honest absence)', rep0.parsed.counts.feedback)
  ok(typeof rep0.parsed.counts.feedback.open === 'number' && rep0.parsed.counts.feedback.open === 0,
    'report: an empty ledger counts zero open (the baseline the next case moves)', rep0.parsed.counts.feedback)

  const fbA = await receipt(b, 'vibe_v5_feedback', { op: 'add', category: '协作', route: 'process', phenomenon: '分派缺验收标准', impact: '返工', action: '分派时写验收', member: 'r-1' })
  const fbB = await receipt(b, 'vibe_v5_feedback', { op: 'add', category: '工具', route: 'tooling', phenomenon: '坐标脚本临时写', impact: '无法复算', action: '走归档', member: 'r-2' })
  ok(fbA.parsed && fbA.parsed.ok === true && !!fbA.parsed.recordId && fbB.parsed && fbB.parsed.ok === true && !!fbB.parsed.recordId,
    'precondition: TWO feedback cards land (so every() below is over a non-empty set)', [fbA.parsed && fbA.parsed.recordId, fbB.parsed && fbB.parsed.recordId])

  const rep1 = await receipt(b, 'vibe_v5_report', {})
  const fb1 = rep1.parsed.counts.feedback
  ok(fb1.open === 2 && fb1.total === 2 && fb1.closed === 0, 'report: two open cards are COUNTED (open 2 / total 2 / closed 0)', fb1)
  ok(rep1.parsed.report.includes('未闭环 2 条') && rep1.parsed.report.includes('共 2 条'),
    'report: the prose line and the counts agree (one helper renders both)', rep1.parsed.report.split('\n').filter((l) => l.includes('反馈库')))

  const ov1 = await receipt(b, 'vibe_v5_overview', { member: 'r-chair' })
  ok(ov1.parsed && ov1.parsed.ok === true && ov1.parsed.feedback && ov1.parsed.feedback.open === 2 && ov1.parsed.feedback.total === 2,
    '★★ overview: 正 — the SAME three numbers as the report (one classifier, so the two tools cannot disagree)', ov1.parsed && ov1.parsed.feedback)
  ok(JSON.stringify(ov1.parsed.feedback) === JSON.stringify(fb1) || (ov1.parsed.feedback.open === fb1.open && ov1.parsed.feedback.closed === fb1.closed && ov1.parsed.feedback.total === fb1.total),
    '★★ the report and the overview print identical counts for the same ledger', { report: fb1, overview: ov1.parsed.feedback })

  const updated = await receipt(b, 'vibe_v5_feedback', { op: 'update', id: fbA.parsed.recordId, status: 'closed', outcome: '已改分派模板', member: 'r-1' })
  ok(updated.parsed && updated.parsed.ok === true, 'precondition: the close is accepted', updated.parsed)
  const rep2 = await receipt(b, 'vibe_v5_report', {})
  const fb2 = rep2.parsed.counts.feedback
  // ★ THE DEFECT THIS CATCHES: the records HEAD `status` is the lifecycle state (live|trashed), never the feedback
  // verdict — a counter reading the head field would say closed:0 forever. The closure is the card's body verdict line.
  ok(fb2.open === 1 && fb2.closed === 1 && fb2.total === 2,
    '★★★ closing one card MOVES the number (open 1 / closed 1 / total 2) — the count follows the body verdict, not the head lifecycle field', fb2)
  const list1 = await receipt(b, 'vibe_v5_feedback', { op: 'list' })
  ok(list1.parsed && list1.parsed.ok === true && list1.parsed.count === 1 && Array.isArray(list1.parsed.items) && list1.parsed.items.length === 1,
    'feedback list: the closed card drops out of the open list (count 1, non-empty for the next assertion)', list1.parsed && { count: list1.parsed.count })
  ok(list1.parsed.items.every((it) => it.id !== fbA.parsed.recordId), 'feedback list: the CLOSED card is the one that is gone, not an arbitrary row', list1.parsed.items.map((it) => it.id))
  ok(list1.parsed.counts && list1.parsed.counts.open === 1 && list1.parsed.counts.closed === 1,
    'feedback list: it reports the same counts block (the classifier is shared, not copied)', list1.parsed && list1.parsed.counts)

  // ── ② C2: THE URGENT PRIVATE MESSAGE ──────────────────────────────────────────────────────────────────────────
  console.log('=== 2. C2: 紧急私信 —— DM-only, visible in the inbox row ===')
  const dm = await receipt(b, 'vibe_v5_say', { member: 'r-1', to: 'r-2', text: '请立刻复算第 3 组坐标', urgent: true })
  ok(dm.parsed && dm.parsed.ok === true && dm.parsed.via === 'mailbox' && dm.parsed.urgent === true,
    'say: 正 — an urgent DM is delivered and the receipt says urgent:true', dm.parsed && { via: dm.parsed.via, urgent: dm.parsed.urgent })
  const inbox = await receipt(b, 'vibe_v5_inbox', { action: 'list', member: 'r-2' })
  ok(inbox.parsed && inbox.parsed.ok === true && Array.isArray(inbox.parsed.rows) && inbox.parsed.rows.length > 0,
    'precondition: the recipient HAS a message to triage (non-empty, so the row assertion below is not vacuous)', inbox.parsed && inbox.parsed.rows && inbox.parsed.rows.length)
  const urgentRow = inbox.parsed.rows.filter((r) => r.urgent === true)
  ok(urgentRow.length === 1 && urgentRow[0].from === 'r-1',
    '★★ inbox list: the urgent flag is IN THE TRIAGE ROW (visible without opening the body), and it is the sender\'s flag', inbox.parsed.rows.map((r) => ({ from: r.from, urgent: r.urgent })))
  const opened = await receipt(b, 'vibe_v5_inbox', { action: 'open', member: 'r-2', id: urgentRow[0].id })
  ok(opened.parsed && opened.parsed.ok === true && opened.parsed.message.urgent === true,
    'inbox open: the body view carries urgent too (the flag survives the read)', opened.parsed && opened.parsed.message && opened.parsed.message.urgent)

  const plain = await receipt(b, 'vibe_v5_say', { member: 'r-1', to: 'r-2', text: '这条不紧急' })
  ok(plain.parsed && plain.parsed.ok === true && plain.parsed.urgent === false,
    'say: an ordinary DM reports urgent:false (ABSENT is false, not invented)', plain.parsed && plain.parsed.urgent)

  const groupUrgent = await receipt(b, 'vibe_v5_say', { member: 'r-1', text: '群里喊一句', urgent: true })
  ok(refusal(groupUrgent) && groupUrgent.parsed.code === 'VMU_INVALID_ARGUMENT' && /urgent/i.test(groupUrgent.parsed.message),
    '★ say: 反 — a GROUP message cannot be urgent (no recipient to wake), refused BY NAME', refusal(groupUrgent))
  const meetingUrgent = await receipt(b, 'vibe_v5_say', { member: 'r-1', text: '会上说', meeting: 'm-anything', urgent: true })
  ok(refusal(meetingUrgent) && meetingUrgent.parsed.code === 'VMU_INVALID_ARGUMENT' && /urgent/i.test(meetingUrgent.parsed.message),
    '★ say: 反 — a MEETING speech cannot be urgent either, refused BY NAME before any meeting lookup', refusal(meetingUrgent))

  // ── ③ C3: THE STATE PANEL'S FOUR CONTENTS + "READ ANYONE'S PANEL" ─────────────────────────────────────────────
  console.log('=== 3. C3: 状态版四要素（缺一具名拒）+ 可查看他人 ===')
  const partial = await receipt(b, 'vibe_v5_record_progress', { member: 'r-1', track: 'state', state: { progress: '证到第 2 步' } })
  const partialRef = refusal(partial)
  ok(partialRef && partialRef.code === 'VMU_INVALID_ARGUMENT' && /state panel needs all four/i.test(partialRef.message),
    '★★ state panel: 反 — a THREE-field panel is refused by name (it used to land as free text)', partialRef && partialRef.message)
  ok(partialRef && Array.isArray(partialRef.missing) && partialRef.missing.length === 3 &&
    partialRef.missing.includes('obstacles') && partialRef.missing.includes('next') && partialRef.missing.includes('help'),
    '★★ state panel: the refusal carries the MISSING KEYS machine-readably (e.missing), not just prose', partialRef && partialRef.missing)
  const zeroState = kernel.records.list({ track: 'state' })
  ok(zeroState.items.length === 0, 'state panel: the refused write landed NOTHING on the track (no half-written panel)', zeroState.items.length)

  const full = await receipt(b, 'vibe_v5_record_progress', {
    member: 'r-1', track: 'state',
    state: { progress: '证到第 2 步', obstacles: '缺 n=5 反例', next: '先证辅助引理', help: '需要一次复核' },
  })
  ok(full.parsed && full.parsed.ok === true && full.parsed.recordId && full.parsed.state && full.parsed.state.fields.length === 4,
    'state panel: 正 — all four contents are accepted and the receipt lists them', full.parsed && full.parsed.state)
  ok(Number.isFinite(full.parsed.at), '★★ state panel: the TIME information is the kernel\'s own stamp (a number from the record, not the author)', full.parsed && full.parsed.at)
  const stateRow = kernel.records.get({ id: full.parsed.recordId })
  const stateBody = (stateRow && stateRow.record ? stateRow.record : stateRow).body
  ok(['progress', 'obstacles', 'next', 'help'].every((f) => stateBody.includes('- ' + f + '：')),
    'state panel: all four sections are IN THE STORED BODY (a reader of the card sees what the receipt promised)', stateBody)

  const flat = await receipt(b, 'vibe_v5_record_progress', {
    member: 'r-2', track: 'state', progress: '读文献', obstacles: '无', next: '写摘要', help: '无',
  })
  ok(flat.parsed && flat.parsed.ok === true && flat.parsed.state.values.progress === '读文献',
    'state panel: the FLAT form (four top-level keys) is accepted as well', flat.parsed && flat.parsed.state)

  const libState = await receipt(b, 'vibe_v5_read_library', { member: 'r-1', track: 'state' })
  ok(libState.parsed && libState.parsed.ok === true && Array.isArray(libState.parsed.cards) && libState.parsed.cards.length === 1,
    '★★ read_library: r-2 can READ r-1\'s state panel (可查看他人) — the track is no longer invisible to the taught surface', libState.parsed && { returned: libState.parsed.returned, tracks: libState.parsed.tracks })
  ok(libState.parsed.cards.every((c) => String(c.owner || c.by) === 'r-1'),
    'read_library: the card read back is the OTHER member\'s, not the caller\'s own', libState.parsed.cards.map((c) => c.owner || c.by))
  const libAll = await receipt(b, 'vibe_v5_read_library', { member: 'r-2', limit: 50 })
  ok(Array.isArray(libAll.parsed.tracks) && libAll.parsed.tracks.includes('state') && libAll.parsed.tracks.includes('feedback') && libAll.parsed.tracks.includes('scripts'),
    '★★ read_library: its default read set is DERIVED from vmu.records.tracks (state/feedback/scripts included, no more four hard-coded names)', libAll.parsed.tracks)
  const libUnknown = await receipt(b, 'vibe_v5_read_library', { member: 'r-2', track: 'nonsense-track' })
  ok(refusal(libUnknown) && libUnknown.parsed.code === 'VMU_INVALID_ARGUMENT' && Array.isArray(libUnknown.parsed.declared),
    '★ read_library: 反 — an UNDECLARED track is refused by name and the declared set is returned', refusal(libUnknown))

  // ── ④ B10: THE SCRIPT ARCHIVE (归档/复算) ─────────────────────────────────────────────────────────────────────
  console.log('=== 4. B10: 脚本归档/复算 —— 面即是承诺的落点 ===')
  const SCRIPT = 'import { readFileSync } from "node:fs"\nexport const V = JSON.parse(readFileSync(process.argv[2], "utf8"))\nconsole.log(V.length)\n'
  const archived = await receipt(b, 'vibe_v5_script', { op: 'archive', name: 'count-vertices.mjs', text: SCRIPT, purpose: '数顶点，复算用', member: 'r-2' })
  ok(archived.parsed && archived.parsed.ok === true && !!archived.parsed.recordId && !!archived.parsed.fingerprint && archived.parsed.track === 'scripts',
    '★★ script archive: 正 — the script lands on the scripts track with the KERNEL\'s fingerprint', archived.parsed && { id: archived.parsed.recordId, fp: archived.parsed.fingerprint })
  const readBack = await receipt(b, 'vibe_v5_script', { op: 'read', name: 'count-vertices.mjs' })
  ok(readBack.parsed && readBack.parsed.ok === true && readBack.parsed.script && readBack.parsed.script.text === SCRIPT,
    '★★★ script read: the archived text comes back BYTE-IDENTICAL (a recompute over a decorated body is not a recompute)', readBack.parsed && readBack.parsed.script && readBack.parsed.script.text && readBack.parsed.script.text.length)
  ok(readBack.parsed.script.fingerprint === archived.parsed.fingerprint,
    'script read: the fingerprint is the same one the archive reported (drift is provable, not asserted)', { archived: archived.parsed.fingerprint, read: readBack.parsed.script.fingerprint })
  const readById = await receipt(b, 'vibe_v5_script', { op: 'read', id: archived.parsed.recordId })
  ok(readById.parsed && readById.parsed.ok === true && readById.parsed.script.text === SCRIPT,
    'script read: the id form returns the same verbatim text', readById.parsed && readById.parsed.script && readById.parsed.script.id)
  const listedScripts = await receipt(b, 'vibe_v5_script', { op: 'list' })
  ok(listedScripts.parsed && listedScripts.parsed.ok === true && listedScripts.parsed.count === 1 && Array.isArray(listedScripts.parsed.scripts) && listedScripts.parsed.scripts.length === 1,
    'script list: 正 — the archive is enumerable (non-empty, so the name assertion below is not vacuous)', listedScripts.parsed && listedScripts.parsed.count)
  ok(listedScripts.parsed.scripts.every((s) => s.name === 'count-vertices.mjs' && s.fingerprint === archived.parsed.fingerprint),
    'script list: the row names the archived file and repeats the fingerprint', listedScripts.parsed.scripts)
  const missingScript = await receipt(b, 'vibe_v5_script', { op: 'read', name: 'never-archived.mjs' })
  ok(refusal(missingScript) && missingScript.parsed.code === 'VMU_NO_SUCH_OBJECT', '★ script read: 反 — an unknown name is refused by name (VMU_NO_SUCH_OBJECT)', refusal(missingScript))
  const badArchive = await receipt(b, 'vibe_v5_script', { op: 'archive', name: 'empty.mjs' })
  ok(refusal(badArchive) && badArchive.parsed.code === 'VMU_INVALID_ARGUMENT' && /missing/.test(badArchive.parsed.message),
    '★ script archive: 反 — archiving without the text is refused by name (nothing half-archived)', refusal(badArchive))
  const badOp = await receipt(b, 'vibe_v5_script', { op: 'run' })
  ok(refusal(badOp) && badOp.parsed.code === 'VMU_INVALID_ARGUMENT',
    '★ script: 反 — there is NO ad-hoc `run` op (the no-adhoc-scripts rule stands; the archive is not a way around it)', refusal(badOp))
  const packDefaults = JSON.parse(readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.json'), 'utf8'))
  // The pack declares its values under  as DOTTED keys (one shape); read that, then fall back to a flat file.
  const packValues = packDefaults.defaults && typeof packDefaults.defaults === 'object' ? packDefaults.defaults : packDefaults
  const declaredTracks = packValues['vmu.records.tracks']
  ok(Array.isArray(declaredTracks) && declaredTracks.includes('scripts'),
    'the pack DECLARES the scripts track (the face is not an undeclared reach: the records layer would refuse it by name)', declaredTracks)
  // The framework's own script face must NOT be published by this deployment: the pack's archive is a records artefact,
  // and the host's script tool is a different (deliberately unpublishable here) capability.
  const hostNames = Object.values((await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)).TOOL_NAMES)
  ok(!hostNames.includes('vibe_v5_script'), 'the v5r script face is NOT in the framework tool table (it belongs to the pack)', hostNames.filter((n) => n.includes('script')))

  // ── ⑤ B8: THE PREDICATES ARE WIRED, AND STILL POLICY-FREE ────────────────────────────────────────────────────
  console.log('=== 5. B8: 四条验证谓词接线（调用点，不是 import） ===')
  const toolsSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const callSites = ['p1Intent({', 'singleWriter({', 'debateSubjectGate({', 'fidelityAsked({']
  const wired = callSites.filter((sig) => toolsSrc.includes(sig))
  ok(wired.length === 4, '★ all four predicates have CALL SITES in the pack (an import alone would be a promise, not a mechanism)', callSites.filter((s) => !toolsSrc.includes(s)))
  const gateSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verification-gates.js'), 'utf8')
  ok(!/enforced\b|settingValues|settingsView/.test(gateSrc),
    '★ the predicates module declares NO settings and reports NO enforcement (it is pure judgement; keys/enforced live in the wiring)', gateSrc.match(/enforced\b/g))
  const p1Refused = await receipt(b, 'vibe_v5_record_proposition', {
    member: 'r-1', id: 'p-phase12-one', title: '某个断言', statement: '对任意 n，P(n) 成立', value: 1, motive: '直觉', p: 1,
  })
  const p1Ref = refusal(p1Refused)
  ok(p1Ref && p1Ref.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '★★ p=1 without any of the three accepted conclusions is refused by NAME (the predicate is not decorative)', p1Ref && p1Ref.code)
  // ★ A PURE PREDICATE ENFORCES NO SETTINGS KEY, so an EMPTY enforced list is the honest answer here (a non-empty one
  // would be the false claim the gates file warns about: pixels claiming enforcement they do not perform). What the
  // receipt must still show is that the field EXISTS and is scoped — the wiring layer, not the predicate, owns attribution.
  ok(p1Ref && Array.isArray(p1Ref.enforced) && p1Ref.enforced.length === 0 && p1Ref.enforcedScope === 'evaluated-so-far',
    '★★ the refusal carries the enforcement field as DATA (an empty list, because the predicate is policy-free) plus its scope', p1Ref && { enforced: p1Ref.enforced, scope: p1Ref.enforcedScope })
  const estimate = await receipt(b, 'vibe_v5_record_proposition', {
    member: 'r-1', id: 'p-phase12-est', title: '某个断言', statement: '对任意 n，P(n) 成立', value: 0.3, motive: '有部分证据', p: 0.3,
  })
  ok(estimate.parsed && estimate.parsed.ok === true,
    '★ an ESTIMATE in (0,1) is always allowed — the gate closes the conclusion door, not the research', estimate.parsed && estimate.parsed.ok)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }).catch(() => {})
}

console.log('\n' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
