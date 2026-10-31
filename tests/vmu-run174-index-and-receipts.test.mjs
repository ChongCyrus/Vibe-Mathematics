// tests/vmu-run174-index-and-receipts.test.mjs — RUN 174 (real machine, run 19 / FEEDBACK19).
//
// THE DEFECTS THIS PINS (measured on the real machine, run 19, build a87d6c7f, clean run: 0 RED, mainline finished,
// PDF 115 827 B):
//   F3/F10 — AN ID LIVED IN TWO TRACKS. `prune {track:"paper", keep:0, dryRun:true}` listed rec-495, a PROPOSITIONS card,
//            among the paper rows (`liveBefore:44` = 35 paper rows + 9 paper rows of the running paper, plus rec-495), and
//            `list {track:"paper"}` returned it with its own `track` still printing "propositions". The durable fold carried
//            TWO identical live rows for that id. A fresh kernel folded the duplicates away, so the file looked clean
//            afterwards and the leak hid: the damage is done by an INSTANCE, not by the file.
//   F1 — SILENCE WAS READ AS A VERDICT. `render` on a DRAFT deliberately does not judge the delivery gate (a paper being
//            written must stay renderable) and said nothing about the citations: three renders read as "checked, fine",
//            and only `final` refused a prose citation of a record that does not exist.
//   F2 — THE FORMULA CAME OUT AS ITS OWN ESCAPING. RUN 170 kept xelatex alive by escaping `^`, which also meant run 19's
//            PDF carried `Σ\_\{k=1\}\textasciicircum{}\{n\} k³ = (n(n+1)/2)²` as prose.
//   F4/F5/F6/F7 — four readings that named the wrong thing: a part slot saying `at: <round>` (read as an epoch), a paper
//            that could be started with ONE participant and only refused at `advance`, an editor refusal that did not say
//            WHO to pass, and an archive count that lumped a pre-window vote into "the votes of the window being closed".
//
// WHAT RUN 174 CHANGED:
//   · `records.put` MOVES the index row when an id is re-put under another track (`retrackedFrom`, counted as
//     `counters.retracked`), and `records.list({track})` drops+counts a stale index row it finds (`counters.indexHealed`);
//     `snapshotRecords` refuses to copy a row under a track it does not belong to, so one contaminated instance cannot
//     turn into two identical fold rows.
//   · `render` carries `qualityGate {checked, ok, skipped, code, citations, means}` — a draft render now SAILS WITH A
//     NAMED SKIP instead of silence.
//   · paired `$…$` spans reach the .tex VERBATIM (inline math); text outside a pair is escaped exactly as before.
//   · `status.paper.parts[*]` carries `round` only; `start` reports `crossReviewPossible`; the editor refusal names the
//     chair-seated member and the roster; `reopen-closure` splits `archivedByWindow`/`unwindowedVotes`.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

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
const BASE = 'D:/_tmp/r174/index-and-receipts'
const newRoot = async (tag) => { await mkdir(BASE, { recursive: true }); return mkdtemp(join(BASE, tag + '-')) }
let tick = 1000
const boot = async (root) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => tick++ })
  await handle.ready()
  const call = async (name, args) => {
    const spec = specs.filter((s) => s.name === name)[0]
    if (!spec) throw new Error('no tool ' + name)
    try { return JSON.parse(await spec.execute(args, {})) } catch (e) {
      return { ok: false, code: (e && e.code) || 'THROW', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, kernel: handle.kernel, call }
}
const SEATS = [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member'], ['r-temp', 'temp']]
const hire = async (k) => { for (const [id, slot] of SEATS) await k.members.hire({ id, slot, institution: 'inst' }) }
const bodyOf = (kernel, id) => {
  const got = kernel.records.get({ id })
  const full = got && got.record ? got.record : got
  return String((full && full.body) || '')
}
const idsOf = (list) => (Array.isArray(list && list.items) ? list.items : []).map((r) => String(r.id))

// ── §0 the source says what this pins ───────────────────────────────────────────────────────────────────────────────
{
  const records = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  const index = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
  const paperPack = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js'), 'utf8')
  const kit = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js'), 'utf8')
  const tools = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(/existingRow\.track !== track/.test(records) && /retrackedFrom/.test(records) && /counters\.retracked \+= 1/.test(records),
    '§0 a re-put under ANOTHER track MOVES the index row and counts the move (one id, one track)')
  ok(/rec\.track !== track/.test(records) && /counters\.indexHealed \+= 1/.test(records),
    '§0 a read DROPS a stale index row it finds instead of serving a row of another track')
  ok(/String\(r\.track\) !== track\)\) continue/.test(index),
    '§0 the fold snapshot refuses to copy a row under a track it does not belong to (run 19 wrote the same row twice)')
  ok(/rendered\.qualityGate = \{/.test(paperPack) && /checked: skipped === null/.test(paperPack),
    '§0 a render receipt carries the gate verdict (silence was read as "checked and fine")')
  ok(/raw\.indexOf\('\$', i\)/.test(kit) && /escPlain/.test(kit),
    '§0 the .tex pass keeps paired `$…$` spans verbatim and escapes everything outside them')
  ok(/mathTypeset: \{ enabled: true/.test(tools) && /partsMeans:/.test(tools),
    '§0 the render/status receipts NAME what they do with formulas and with part rounds')
  ok(/archivedByWindow/.test(index) && /unwindowedVotes/.test(index),
    '§0 the reopen receipt splits the archive by window instead of one lumped count')
  ok(/crossReviewPossible/.test(kit) && /crossReviewMeans/.test(kit),
    '§0 a one-participant paper is announced AS SUCH at start, not only refused at advance')
  ok(/so THAT id is the one accepted/.test(kit) && /@' \+ String\(m\.slot\)/.test(kit),
    '§0 the editor refusal names the chair-seated member and the roster (id@slot)')
}

// ── §1 an id that changes track answers ONE track, and the receipt says so ───────────────────────────────────────────
{
  const root = await newRoot('retrack')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const first = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'run174 retrack row', body: 'body of the row', by: 'r-1' })
  ok(!!first && !!first.id && first.retrackedFrom === null, '§1 the row is first written on the paper track', first && first.id)
  ok(idsOf(A.kernel.records.list({ track: 'paper' })).includes(String(first.id)),
    '§1 …and the paper track lists it', idsOf(A.kernel.records.list({ track: 'paper' })))
  const moved = A.kernel.records.put({ id: String(first.id), track: 'propositions', kind: 'proposition', title: 'run174 retrack row', body: 'body of the row', by: 'r-1' })
  ok(moved && moved.ok === true && moved.retrackedFrom === 'paper',
    '§1 ★★ re-putting the SAME id under another track reports the move (`retrackedFrom`)', moved && moved.retrackedFrom)
  const paperIds = idsOf(A.kernel.records.list({ track: 'paper' }))
  const propIds = idsOf(A.kernel.records.list({ track: 'propositions' }))
  ok(!paperIds.includes(String(first.id)),
    '§1 ★★ the OLD track no longer lists it (run 19: `list({track:"paper"})` returned a propositions card)', paperIds)
  ok(propIds.includes(String(first.id)) && propIds.filter((id) => id === String(first.id)).length === 1,
    '§1 the new track lists it exactly once', propIds.filter((id) => id === String(first.id)))
  const counters = A.kernel.records.status().counters || {}
  ok(Number(counters.retracked) === 1, '§1 the move is COUNTED (`counters.retracked:1`)', counters.retracked)
  // A second paper row stays put, so the "every" below has a non-empty subject (a vacuous `every` is a shape-A pass and
  // the declaration audit refuses it: the move above left the paper track legitimately empty).
  A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'run174 retrack keeper', body: 'a second body', by: 'r-1' })
  const rows = A.kernel.records.list({ track: 'paper' }).items || []
  ok(rows.length === 1 && rows.every((r) => String(r.track) === 'paper'),
    '§1 every row a track list returns claims that track (no row of another track wears this label)', rows.map((r) => r.id + ':' + r.track))
}

// ── §2 the fold carries each id once, under the track that owns it ───────────────────────────────────────────────────
{
  const root = await newRoot('fold-once')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const first = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'run174 fold row', body: 'fold body', by: 'r-1' })
  A.kernel.records.put({ id: String(first.id), track: 'propositions', kind: 'proposition', title: 'run174 fold row', body: 'fold body', by: 'r-1' })
  await A.kernel.flushRecordsFold()
  const B = await boot(root)
  const rows = (B.kernel.records.list({ track: 'propositions' }).items || []).filter((r) => String(r.id) === String(first.id))
  ok(rows.length === 1, '§2 ★★ a second kernel sees the row ONCE (run 19 wrote two identical live rows for one id)', rows.length)
  ok(rows.length === 1 && String(rows[0].track) === 'propositions',
    '§2 …under the track it moved to', rows.length === 1 ? rows[0].track : null)
  const inPaper = (B.kernel.records.list({ track: 'paper' }).items || []).filter((r) => String(r.id) === String(first.id))
  ok(inPaper.length === 0, '§2 …and not at all on the old track', inPaper.length)
}

// ── §3 a DRAFT render carries the gate verdict it did not apply ──────────────────────────────────────────────────────
{
  const root = await newRoot('draft-render')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  await A.call('vibe_v5_paper', { action: 'start', target: 'q1', participants: ['r-acad', 'r-1'] })
  await A.call('vibe_v5_paper', { action: 'part', target: 'q1', member: 'r-acad', part: 'draft part', solution: '正文 引用 Members/r-1/Propos/run19-not-a-record.md#§3 这条不存在。', evidence: [] })
  const rendered = await A.call('vibe_v5_paper', { action: 'render', target: 'q1' })
  ok(rendered.ok === true, '§3 the draft renders (a paper being written must stay renderable)', rendered.code)
  const gate = rendered.qualityGate || null
  ok(gate !== null, '§3 ★★ the render receipt carries `qualityGate` (run 19: three renders said NOTHING and read as "checked")', Object.keys(rendered))
  ok(gate && gate.checked === false && String(gate.skipped).startsWith('draft:'),
    '§3 …and names the skip (`checked:false`, `skipped:"draft:<status>"`)', gate && { checked: gate.checked, skipped: gate.skipped })
  ok(gate && gate.ok === false && String(gate.code).includes('CITATION_UNKNOWN'),
    '§3 ★ …with the code `final` will refuse on, so the draft reader is WARNED, not comforted', gate && gate.code)
  const cites = gate && Array.isArray(gate.citations) ? gate.citations : []
  ok(cites.length === 1 && String(cites[0].id) === 'run19-not-a-record',
    '§3 …and the offending id, not just a code', cites.map((c) => c.id))
  ok(rendered.mathTypeset && rendered.mathTypeset.enabled === true && /paired \$…\$/.test(String(rendered.mathTypeset.syntax)),
    '§3 the receipt says what the .tex pass does with formulas', rendered.mathTypeset && rendered.mathTypeset.syntax)
}

// ── §4 a paired $…$ span is inline math; a bare ^ is still text ──────────────────────────────────────────────────────
{
  const root = await newRoot('math')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  await A.call('vibe_v5_paper', { action: 'start', target: 'q2', participants: ['r-acad', 'r-1'] })
  await A.call('vibe_v5_paper', {
    action: 'part', target: 'q2', member: 'r-acad', part: 'formula',
    solution: '平方和 $\\sum_{k=1}^{n} k^2 = n(n+1)(2n+1)/6$ 是正文要的公式；裸写的 a^b 仍按文本转义。', evidence: [] })
  const rendered = await A.call('vibe_v5_paper', { action: 'render', target: 'q2' })
  ok(rendered.ok === true, '§4 render succeeds', rendered.code)
  const rows = A.kernel.records.list({ track: 'paper' }).items || []
  const texRow = rows.filter((r) => /\|tex$/.test(String(r.title || '')))[0]
  const tex = texRow ? bodyOf(A.kernel, texRow.id) : ''
  ok(tex.length > 0, '§4 the rendered .tex is readable from the paper track', texRow && texRow.title)
  ok(tex.includes('$\\sum_{k=1}^{n} k^2 = n(n+1)(2n+1)/6$'),
    '§4 ★★ the paired span reaches TeX VERBATIM (run 19: `Σ\\_\\{k=1\\}\\textasciicircum{}\\{n\\}` was the page)', tex.split('\n').filter((l) => l.includes('平方和'))[0])
  const formulaLine = tex.split('\n').filter((l) => l.includes('平方和'))[0] || ''
  ok(formulaLine.length > 0 && !formulaLine.includes('\\textasciicircum{}\\{n\\}'),
    '§4 …so the summation is not re-escaped inside the span', formulaLine.slice(0, 200))
  ok(tex.includes('\\textasciicircum{}'),
    '§4 …while a BARE `^` in prose is still escaped into text mode (the RUN 170 repair still holds)')
}

// ── §5 the archive count says WHICH window each archived vote came from ──────────────────────────────────────────────
{
  const root = await newRoot('window-archive')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  // A vote from before windows existed (run 19 measured exactly this row: `{member:"r-temp", solved:true, at:…}` with no
  // `window` field). It is written into the DURABLE file between boots, the way an older build left it there — then a
  // fresh kernel reads it, which is the situation the receipt has to describe honestly.
  await A.kernel.flushRecordsFold()
  const { readFile, writeFile } = await import('node:fs/promises')
  const statePath = join(root, 'vmu', 'state.json')
  const stateDisk = JSON.parse(String(await readFile(statePath, 'utf8')))
  stateDisk.keys = stateDisk.keys || {}
  stateDisk.keys.closure_votes = [
    { member: 'r-temp', solved: true, at: 1793464773262 },
    { member: 'r-1', solved: true, at: 1793464773263, window: 1, session: 's1', voterSession: 'v1' },
  ]
  stateDisk.keys.closure_window = { window: 1 }
  // ★ A leftover fold write from A can land AFTER this seed (the store's rename is asynchronous), which would erase the
  // pre-window row and make the assertion vacuous — so the seed is verified, not assumed: re-write until the file on disk
  // carries both rows (RUN 174: the first version of this test passed alone and failed under the full runner for that reason).
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await writeFile(statePath, JSON.stringify(stateDisk, null, 2), 'utf8')
    const back = JSON.parse(String(await readFile(statePath, 'utf8')))
    const rows = back && back.keys && Array.isArray(back.keys.closure_votes) ? back.keys.closure_votes : []
    if (rows.length === 2 && rows.some((r) => r && r.window === undefined)) break
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  const B = await boot(root)
  const reopened = await B.kernel.reopenClosureVote({ why: 'new question', by: 'r-acad' })
  ok(reopened && reopened.ok === true && reopened.window === 2,
    '§5 the window advances', reopened && { window: reopened.window, previousWindow: reopened.previousWindow })
  ok(Number(reopened.unwindowedVotes) === 1,
    '§5 ★★ the pre-window vote is counted as `unwindowedVotes`, not folded into "the votes of the window being closed"', reopened.unwindowedVotes)
  const byWindow = reopened.archivedByWindow || {}
  ok(Number(byWindow['1']) === 1,
    '§5 …and each window keeps its own count (`archivedByWindow`), so `archivedVotes` can be reconciled with `votesCast`', byWindow)
  ok(Number(reopened.archivedVotes) === 2,
    '§5 `archivedVotes` is still the sum (the field callers already read keeps its meaning)', reopened.archivedVotes)
  ok(/unwindowedVotes counts rows written before windows existed/.test(String(reopened.archivedMeans)),
    '§5 …and the receipt explains the split instead of leaving it to arithmetic', reopened.archivedMeans)
}

// ── §6 a part slot says ROUND, a one-participant paper says it cannot cross-review, the editor refusal says WHO ──────
{
  const root = await newRoot('receipts')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const solo = await A.call('vibe_v5_paper', { action: 'start', target: 'q3', participants: ['r-acad'] })
  ok(solo.ok === true && solo.started && solo.started.crossReviewPossible === false,
    '§6 ★★ a ONE-participant paper is announced at start (`crossReviewPossible:false`)', solo.started && solo.started.crossReviewPossible)
  ok(/NO member can cross-review this paper/.test(String(solo.started && solo.started.crossReviewMeans)),
    '§6 …and the receipt says what to add (a second writing participant)', solo.started && solo.started.crossReviewMeans)
  const pair = await A.call('vibe_v5_paper', { action: 'start', target: 'q4', participants: ['r-acad', 'r-1'] })
  ok(pair.ok === true && pair.started && pair.started.crossReviewPossible === true,
    '§6 two participants ⇒ cross-review possible', pair.started && pair.started.crossReviewPossible)
  await A.call('vibe_v5_paper', { action: 'part', target: 'q4', member: 'r-acad', part: 'p', solution: '正文', evidence: [] })
  const st = await A.call('vibe_v5_paper', { action: 'status', target: 'q4' })
  const slot = st.paper && st.paper.parts ? st.paper.parts['r-acad'] : null
  ok(slot && slot.round === 1 && slot.at === undefined,
    '§6 ★★ the part slot carries `round` and no `at` (run 19 read `at:1` as an epoch)', slot)
  ok(/ROUND/.test(String(st.partsMeans)),
    '§6 …and the status receipt says the unit is the round', st.partsMeans)
  const bad = await A.call('vibe_v5_paper', { action: 'start', target: 'q5', participants: ['r-acad', 'r-1'], editor: 'r-2' })
  ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT',
    '§6 an editor in a non-chair slot is refused', bad.code)
  ok(/The chair seat is held by r-acad/.test(String(bad.hint)) && /roster: .*r-acad@chair/.test(String(bad.hint)),
    '§6 ★ …and the refusal NAMES the member to pass and the roster (run 19 had to read the hint twice)', bad.hint)
  ok(/omit `editor`/.test(String(bad.hint)),
    '§6 …and says the default needs no argument at all', bad.hint)
}

console.log('')
console.log('TOTAL ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f) }
process.exit(failed === 0 ? 0 : 1)
