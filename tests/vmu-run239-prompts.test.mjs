// tests/vmu-run239-prompts.test.mjs — RUN 239 / task-34: four sentences the prompts taught that the faces do not do.
//
// Each of the four was MEASURED on a live round (FEEDBACK62), and each is now checked twice: once against the source
// shape that carries it, and once on the REAL assembled prompt (pipeline + PACK.bindings + settings + the four phases),
// because a sentence that reads right in the file is not the same thing as a sentence a member receives.
//
//   1) 【蓝图】said propose AND adopt both write the md. Measured: a proposal registers an index row (`md.written:false`,
//      `deferredTo:"adopt"`); only adopting writes Shared/Protocol.md.
//   2) 【脚本归档】said no seat's ACL opens the script face. Measured (C14, RUN 236): archiving is the ACADEMICIAN's act
//      — `vibe_v5_script { op: "archive", name, text }`; member/temp get `VMU_NOT_PERMITTED` and hand the script to the
//      chair. The archive is a copy, not execution evidence.
//   3) The meeting frame printed the corpus agenda and a placeholder type (`议程：分工与下一步（类型：ordinary）`) instead
//      of the meeting this turn is bound to. It now renders the bound meeting's id/type/chair/agenda, and a member reads
//      a type that belongs to its own meeting or a visible 「未提供」 hole.
//   4) The progress note taught dedupe BY TEXT ("不要写同一件事"). Measured: the key is (member, this turn) - one row per
//      track per turn, the second arrival skipped by name citing the row that already holds it.
//
// Run: node tests/vmu-run239-prompts.test.mjs   Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const BLOCKS_B = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js')
const REPLY_CHANNEL = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + ' - ' + JSON.stringify(detail))
  return false
}
// A sentence is "absent" only when the text was actually read: an empty string would make every /…/ test pass vacuously.
const says = (text, needle) => typeof text === 'string' && text.length > 0 && text.includes(needle)
const denies = (text, needle) => typeof text === 'string' && text.length > 0 && !text.includes(needle)

// What a member READS is the rendered text, never a comment. Stripping comments before the "the old sentence is gone"
// checks keeps a comment that quotes the old sentence (the reason it was replaced) from failing its own test.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n')

const entry = await import(pathToFileURL(ENTRY).href)
const blocksBSource = stripComments(await readFile(BLOCKS_B, 'utf8'))
const replySource = stripComments(await readFile(REPLY_CHANNEL, 'utf8'))
const { REPLY_FIELD_ROWS } = await import(pathToFileURL(REPLY_CHANNEL).href)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r239-')); roots.push(d); return d }
const boot = async (root) => {
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, deliverMode: 'caller' })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel }
}
const seatPrompt = async (K, member, phase, extra) => {
  const opened = await K.turn.step(Object.assign({ members: [member], phase, why: 'run239 prompt probe' }, extra || {}))
  if (!opened || opened.awaiting !== true) throw new Error('turn did not open: ' + JSON.stringify(opened))
  return String((opened.memberPrompt && opened.memberPrompt.text) || '')
}

try {
  // ── §0 THE FOUR FALSE SENTENCES ARE GONE FROM THE SOURCE, AND THE TRUE ONES ARE THERE ────────────────────────────
  {
    console.log('§0 source: the four measured lies are gone, the four truths are named')
    ok(typeof blocksBSource === 'string' && blocksBSource.length > 0, '§0a blocks-b source was read')
    ok(denies(blocksBSource, 'propose/adopt 都先写 md'), '§0b ·1 the blueprint no longer says propose writes the md')
    ok(says(blocksBSource, '只有 adopt 写 md') && says(blocksBSource, 'md.written:false') && says(blocksBSource, 'deferredTo:"adopt"'),
      '§0c ·1 and says a draft is an index row, deferred to adopt')
    ok(denies(blocksBSource, '三个席位的 ACL 都不开放它'), '§0d ·2 the script block no longer says every seat is closed')
    ok(says(blocksBSource, 'vibe_v5_script { op: "archive", name, text }') && says(blocksBSource, 'VMU_NOT_PERMITTED'),
      '§0e ·2 and names the chair face and the refusal a member/temp meets')
    ok(says(blocksBSource, '归档是**副本**不是执行证据'), '§0f ·2 and says the archive is a copy, not execution evidence')
    ok(says(blocksBSource, '{{ setting:vmu.turn.meetingAgenda }}') && says(blocksBSource, '{{ setting:vmu.turn.meetingType }}') &&
      says(blocksBSource, '{{ setting:vmu.turn.meetingChair }}') && says(blocksBSource, '{{ setting:vmu.turn.meetingId }}'),
      '§0g ·3 the agenda frame cites all four per-turn meeting facts')
    ok(denies(blocksBSource, "议程：分工与下一步（类型：ordinary）"), '§0h ·3 the corpus agenda is no longer served as the round\'s own')
    ok(typeof replySource === 'string' && replySource.length > 0, '§0i reply-channel source was read')
    ok(denies(replySource, '写同一件事'), '§0j ·4 progress is no longer deduped by wording')
    ok(says(replySource, '一回合同一 track 只留一行') && says(replySource, '具名跳过') && says(replySource, '已有行 id'),
      '§0k ·4 and states the real key: one row per track per turn, second write skipped by name citing the row')
  }

  // ── §1 THE ASSEMBLED CHAIR PROMPT: BLUEPRINT + SCRIPTS (two different sections, one reader) ──────────────────────
  {
    console.log('§1 the real assembled chair prompt carries the blueprint and script truths')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const chairText = await seatPrompt(b.K, 'r-acad', 'normal')
    ok(chairText.length > 1000, '§1a the chair prompt is a real assembly', chairText.length)
    ok(says(chairText, '只有 adopt 写 md'), '§1b ·1 the chair reads that only adopting writes the md')
    ok(says(chairText, 'deferredTo:"adopt"') && says(chairText, 'md.written:false'),
      '§1c ·1 and the two receipt fields that say a draft never wrote a file')
    ok(denies(chairText, 'propose/adopt 都先写 md'), '§1d ·1 the old sentence is not in the assembled prompt')
    ok(says(chairText, '归档是院士席（chair）的面') && says(chairText, 'vibe_v5_script'),
      '§1e ·2 the chair is told the archive face is its own')
    ok(says(chairText, '归档是**副本**不是执行证据'), '§1f ·2 and that the archive is a copy, not proof of execution')
    // The researcher variant is the codesigner: same truth, its own wording.
    const memberText = await seatPrompt(b.K, 'r-1', 'normal')
    ok(says(memberText, '正文只在采纳时写 md') && says(memberText, 'deferredTo:"adopt"'),
      '§1g ·1 the researcher reads: the draft is a row, adopting is the file')
    ok(denies(memberText, '正文落在一份 md'), '§1h ·1 and no longer "正文落在一份 md"')
  }

  // ── §2 THE MEETING FRAME NAMES THE MEETING THIS TURN IS BOUND TO ────────────────────────────────────────────────
  //
  // The defect measured on a live run: the frame printed `议程：分工与下一步（类型：ordinary）` — a CORPUS meeting's
  // agenda served as if it were this turn's own, while the receipt said the turn was bound to m1 (a `debate`). Two
  // things are pinned here: the frame now names the REAL bound id, and it never again prints a type/agenda that nobody
  // read for this meeting. The type/chair/agenda VALUES travel as per-turn facts; when the kernel cannot provide them
  // the frame shows an empty slot (a visible hole, never a fabricated "ordinary").
  {
    console.log('§2 the agenda frame names the bound meeting, and no longer serves the corpus meeting')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.meetings.open({ type: 'debate', chair: 'r-acad', materials: '确认命题; 分配复核', members: ['r-1'], roster: ['r-1'], actor: 'r-acad' })
    // `open` answers with the meeting id as a STRING under `meeting` (plus type/kind/title at the top level).
    const meetingId = String(opened && (typeof opened.meeting === 'string' ? opened.meeting : (opened.id || (opened.meeting && opened.meeting.id))) || '')
    ok(meetingId !== '', '§2a a debate meeting was really opened', opened && opened.code)
    const text = await seatPrompt(b.K, 'r-1', 'meeting', { meeting: meetingId })
    ok(says(text, '# v5r-turn-meeting-agenda'), '§2b ·3 the frame is in the assembled meeting-phase prompt')
    ok(says(text, '本轮绑定该会议：回复第一句请写明会 id（' + meetingId + '）'),
      '§2c ·3 it asks the first sentence to name THIS meeting id')
    ok(denies(text, '{{ setting:'), '§2d ·3 no unrendered template variable leaked into the prompt')
    ok(denies(text, '类型：ordinary') && denies(text, '议程：分工与下一步'),
      '§2e ·3 the corpus meeting is not served as this round\'s own')
    // The four facts are asserted LITERALLY: the id alone would still let a frame print a type/chair/agenda that
    // nobody read for this meeting (the measured defect printed `类型：ordinary` beside the real id).
    ok(says(text, '议程：确认命题; 分配复核'), '§2f ·3 the frame prints THIS meeting\'s real agenda (its materials)', text.slice(text.indexOf('议程：'), text.indexOf('议程：') + 40))
    ok(says(text, '类型：debate'), '§2g ·3 and its real type (not the corpus "ordinary")')
    ok(says(text, '主席：r-acad'), '§2h ·3 and its real chair')

    // An UNBOUND meeting-phase turn must not invent a type or an agenda: it says it is not bound.
    const unbound = await seatPrompt(b.K, 'r-1', 'meeting')
    ok(says(unbound, '本回合没有绑定会议'), '§2i ·3 an unbound turn says so instead of printing a type nobody read')
    ok(denies(unbound, '类型：ordinary'), '§2j ·3 and never prints the corpus type as if it were its own')
  }

  // ── §3 THE PROGRESS FIELD TEACHES THE REAL DEDUPE KEY (the row the catalogue is built from) ──────────────────────
  {
    console.log('§3 the progress row teaches one row per track per turn, skipped by name')
    const row = REPLY_FIELD_ROWS.find((r) => r && r.field === 'progress')
    ok(row !== undefined && typeof row.note === 'string' && row.note.length > 0, '§3a the progress row exists', row && row.note)
    ok(says(row.note, '一回合同一 track 只留一行'), '§3b ·4 the note states the real key')
    ok(says(row.note, '具名跳过') && says(row.note, '已有行 id'),
      '§3c ·4 and that the second arrival is skipped by name, citing the existing row id')
    ok(denies(row.note, '写同一件事'), '§3d ·4 the wording rule is gone (a member cannot know what "same thing" means)')
    // …and the catalogue really reaches the seat, in both shapes it is taught in (compact default and full).
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const text = await seatPrompt(b.K, 'r-1', 'normal')
    ok(says(text, '一回合同一 track 只留一行'), '§3e ·4 the assembled member prompt carries the new note')
    ok(denies(text, '写同一件事'), '§3f ·4 and no longer carries the old one')
  }

  // ── §4 THE ADDITION IS CHEAP: the longest seat prompt still fits its budget ─────────────────────────────────────
  {
    console.log('§4 the four truths cost no seat its budget')
    // The budget itself is `scripts/audit-prompt-budget.mjs --check`; this only guards the pack-source side: the four
    // sections did not grow into a wall of prose (the measured gate is the authority, this is the early warning).
    ok(typeof blocksBSource === 'string' && blocksBSource.length < 400000, '§4a blocks-b is still a single readable module', blocksBSource.length)
    ok(says(blocksBSource, '只有 adopt 写 md') && says(blocksBSource, '正文只在 adopt 时写进 md') && says(blocksBSource, '正文只在采纳时写 md'),
      '§4b ·1 all three seat variants carry the truth')
  }

  // ── §5 ·5 THE MEETING CHAMBER TEACHES THE DOOR THAT EXISTS (wait/unwait on the KERNEL face) ───────────────────
  //
  // Measured on the same run: the chamber taught `vibe_v5_meeting { action:"attend" }`, but that pack face only
  // CONVENES (`toolMeeting` dispatches `rulings`/`types`; every other action is refused by name). Dispatch actions live
  // on the kernel face `vibe_vmu_meeting`. The wait door is new (RUN 239-D): a DURABLE waiter row, and a wake is a
  // DELIVERED TURN (a real activation), never a synchronous answer — the manual must not promise "an answer".
  {
    console.log('§5 ·5 the chamber teaches the kernel face for dispatch, and the durable wait')
    ok(says(blocksBSource, 'vibe_vmu_meeting { action:"wait"'), '§5a ·5 the chamber teaches the wait door by its real face')
    ok(says(blocksBSource, 'until:"speak|vote|motion|poll|phase|attend-all|hand|meeting-closed|deadline"'),
      '§5b ·5 the nine `until` words are the kernel\'s WAIT_UNTIL_MODES, quoted verbatim')
    ok(denies(blocksBSource, 'until:"speak|motion|vote|close|due"'), '§5c ·5 and the invented vocabulary is gone')
    ok(says(blocksBSource, 'vibe_vmu_meeting { action:"attend"'), '§5d ·5 attending is taught on the kernel face too')
    ok(denies(blocksBSource, 'vibe_v5_meeting { action:"attend"'), '§5e ·5 the convene-only face is no longer taught dispatch')
    ok(says(blocksBSource, 'unwait'), '§5f ·5 and the withdrawal door exists')
    ok(says(blocksBSource, '投递一个回合'), '§5g ·5 a wake is a delivered turn, not an answer handed back')
    ok(denies(blocksBSource, '等别人回话用'), '§5h ·5 the old "wait for a reply" sentence is gone')

    // …and the assembled CHAIR prompt for an open meeting really carries it (source truth is not prompt truth).
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.meetings.open({ type: 'debate', chair: 'r-acad', materials: '确认命题; 分配复核', members: ['r-1'], roster: ['r-1'], actor: 'r-acad' })
    const meetingId = String(opened && (typeof opened.meeting === 'string' ? opened.meeting : (opened.id || (opened.meeting && opened.meeting.id))) || '')
    const chairText = await seatPrompt(b.K, 'r-acad', 'meeting', { meeting: meetingId })
    ok(says(chairText, 'vibe_vmu_meeting { action:"wait"') && says(chairText, 'unwait'),
      '§5i ·5 the chair\'s assembled meeting prompt teaches wait/unwait on the kernel face')
    const memberText = await seatPrompt(b.K, 'r-1', 'meeting', { meeting: meetingId })
    ok(says(memberText, 'vibe_vmu_meeting { action:"attend"') && denies(memberText, 'vibe_v5_meeting { action:"attend"'),
      '§5j ·5 the member is sent to the face that can actually register an attendance')
  }
} finally {
  for (const root of roots) { try { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) } catch {} }
  console.log('')
  console.log(passed + ' passed, ' + failed + ' failed')
  if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }
}
