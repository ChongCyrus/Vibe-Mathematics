// tests/vmu-run239-prompts.test.mjs — RUN 239 / task-34: four sentences the prompts taught that the faces do not do.
//
// Each of the four was MEASURED on a live round (FEEDBACK62), and each is now checked twice: once against the source
// shape that carries it, and once on the REAL assembled prompt (pipeline + PACK.bindings + settings + the four phases),
// because a sentence that reads right in the file is not the same thing as a sentence a member receives.
//
//   1) 【蓝图】said propose AND adopt both write the md. Measured at RUN 239: a proposal registered an index row only
//      (`md.written:false`, `deferredTo:"adopt"`); only adopting wrote Shared/Protocol.md. **RUN 248 REVERSED the storage
//      half** (user ruling m37456: drafts must be on disk, members manage md with fs): a draft now has its own file
//      (`Shared/Drafts/<stem>-r<N>.md`, or a member-authored file passed as `mdPath`), and adopting verifies row-vs-file
//      sha before promoting (`VMU_PACK_V5R_BLUEPRINT_MD_DRIFT` / `VMU_PACK_V5R_BLUEPRINT_MD_MISSING`). The pins below now hold BOTH halves:
//      the new truth is present and the retired "a draft is a row with no file" claim is absent.
//   2) 【脚本归档】said no seat's ACL opens the script face. Measured (C14, RUN 236): archiving is the ACADEMICIAN's act
//      — `vibe_v5_script { op: "archive", name, text }`; member/temp get `VMU_NOT_PERMITTED` and hand the script to the
//      chair. The archive is a copy, not execution evidence.
//   3) The meeting frame printed the corpus agenda and a placeholder type (`议程：分工与下一步（类型：ordinary）`) instead
//      of the meeting this turn is bound to. It now renders the bound meeting's id/type/chair/agenda, and a member reads
//      a type that belongs to its own meeting or a visible 「未提供」 hole.
//   4) The progress note taught dedupe BY TEXT ("不要写同一件事"). Measured: the key is (member, this turn) - one row per
//      track per turn, the second arrival skipped by name citing the row that already holds it.
//
//   5) RUN 255 / task-96 (TB-2611-P, user Q2): the prompts let a reader conclude "the office does this work". The
//      measured shape was an office-side write executed in a member's name (`memberActed:false`), while the text said
//      "落盘两条路" with the record tool FIRST and fs demoted to a "draft area", and said temp output "归指派者归档".
//      The new criterion (all three layers): a seat's card/talk/vote/table is written BY THAT SEAT IN ITS OWN TURN
//      ("派活≠代做"), fs is the DEFAULT for self-managed md (`默认用 fs`), and the office only RELAYS when a member
//      turn is unavailable — named in the receipt (`relayedBy: office` + `memberActed:false`), with "汇总≠产出".
//      D2 (the office is the sole outward messenger) is unchanged by this: relaying is not authoring.
//   6) RUN 256 / task-107 (TB-2626, generated persona): the CAPTURED persona still said 「推荐直接用 fs 写你自己的文件」
//      — "recommended", i.e. fs is one option among two — while a live member turn writes its own md and the card tools
//      are for KERNEL ACCOUNTING only. The corpus (not the generated file) is edited and regenerated, the four role
//      bodies stay identical apart from the member library root, and every promise in the new sentence is pinned to its
//      implementation landing (blueprint.js default + draftMdMissing, records.js mdChangedSinceIndex + reindex) so the
//      prompt cannot keep promising a mechanism that moved.
//   7) RUN 255 / TB-2613 (fs-first): §1 said a draft lands on disk, but named the KERNEL as the writer of
//      Shared/Drafts/<stem>-r<N>.md when no mdPath is given. TB-2613 flipped that default: propose without mdPath
//      writes NOTHING (no file, no row) and returns filed:false + draftMdMissing:true, so a member that read the old
//      sentence waits for a file that never appears. The draft is the member OWN file (write it with fs, then propose
//      with the same mdPath); materialize:true is the explicit legacy switch; the md is the truth and the row only
//      indexes it (mdChangedSinceIndex:true, then reindex). A promise without a landing is not a wording fix, so
//      §13 also reads docs/26 and the assembled prompts, not only the source.
//   8) RUN 257 / task-94 round D (Lead m05579): the reply-contract line hand-copied the kernel field catalogue
//      ("内核另接受 29 个已登记字段（`formal`、`record`、`meeting_hand` 等）"). The kernel prints its OWN catalogue
//      in the refusal (`known fields: …`, kernel/turn/index.js:2930), so the copy was a second reader that goes stale
//      the moment a field is added - and a member who trusted the copy read a closed list. The copy is deleted; the
//      prompt now says the receipt lists the fields and the member rewrites the call from it. §15 pins the deletion
//      (no count, no parenthetical, no catalogue inside that sentence) and the replacement, on all three seat texts.
// Run: node tests/vmu-run239-prompts.test.mjs   Last line: N passed, M failed

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { REPLY_FIELDS } from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const BLOCKS_B = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js')
const BLOCKS_A = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-a.js')
const REPLY_CHANNEL = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')
const CORE = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')
const ASSISTANT_JS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-assistant.js')
const ASSISTANT_JSON = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'assistant.json')
const PERSONA = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-persona.js')
const PERSONA_CORPUS = join(REPO, 'prompt-corpus-v5', 'persona-corpus-v5.json')
const BLUEPRINT = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'blueprint.js')
const RECORDS = join(REPO, 'vibe-math-vmu', 'kernel', 'records.js')
const DOC26 = join(REPO, 'vibe-math-vmu', 'docs', '26-turn-orchestration.md')

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
const blocksASource = stripComments(await readFile(BLOCKS_A, 'utf8'))
const replySource = stripComments(await readFile(REPLY_CHANNEL, 'utf8'))
const { REPLY_FIELD_ROWS } = await import(pathToFileURL(REPLY_CHANNEL).href)
const coreSource = stripComments(await readFile(CORE, 'utf8'))
const assistantSource = stripComments(await readFile(ASSISTANT_JS, 'utf8'))
const assistantJsonSource = await readFile(ASSISTANT_JSON, 'utf8')
const personaSource = stripComments(await readFile(PERSONA, 'utf8'))
const personaCorpusRaw = await readFile(PERSONA_CORPUS, 'utf8')
const personaCorpus = JSON.parse(personaCorpusRaw)
const blueprintSource = stripComments(await readFile(BLUEPRINT, 'utf8'))
const recordsSource = stripComments(await readFile(RECORDS, 'utf8'))
const doc26Source = await readFile(DOC26, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r239-')); roots.push(d); return d }
const boot = async (root) => {
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, deliverMode: 'caller' })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel }
}
// ★★ RUN 256 / TB-2616 (task-97): THIS HELPER USED TO OPEN ONE TURN PER CALL AND NEVER ANSWER THE PREVIOUS ONE.
// The caller route keeps exactly ONE parked prompt (`deliverByReturning` parks the assembled prompt on the caller), and
// since RUN 256 the second door REFUSES by name (`VMU_TURN_ALREADY_PARKED`) instead of silently replacing a prompt the
// caller may still be holding. A probe that only needs the PROMPT TEXT therefore reads it off the awaiting receipt and
// then RELEASES that turn through the kernel's own release exit — the turn id comes from the receipt (never written by
// hand here) and nothing is bypassed with settings: the same gate a live caller meets is the gate this helper satisfies.
const seatPrompt = async (K, member, phase, extra) => {
  const opened = await K.turn.step(Object.assign({ members: [member], phase, why: 'run239 prompt probe' }, extra || {}))
  if (!opened || opened.awaiting !== true) throw new Error('turn did not open: ' + JSON.stringify(opened))
  const text = String((opened.memberPrompt && opened.memberPrompt.text) || '')
  const turnId = opened.memberPrompt && opened.memberPrompt.turnId
  const released = await K.turn.abandon({ turn: turnId, why: 'run239 prompt probe: the text has been read, so release the parked turn instead of leaving it parked for the next probe to collide with' })
  if (!released || released.abandoned !== true) throw new Error('the parked turn did not release: ' + JSON.stringify(released))
  return text
}

try {
  // ── §0 THE FOUR FALSE SENTENCES ARE GONE FROM THE SOURCE, AND THE TRUE ONES ARE THERE ────────────────────────────
  {
    console.log('§0 source: the four measured lies are gone, the four truths are named')
    ok(typeof blocksBSource === 'string' && blocksBSource.length > 0, '§0a blocks-b source was read')
    ok(denies(blocksBSource, 'propose/adopt 都先写 md'), '§0b ·1 the blueprint no longer says propose writes the md')
    ok(says(blocksBSource, 'Shared/Drafts/') && says(blocksBSource, 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT') && says(blocksBSource, 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING'),
      '§0c ·1 and says a draft has its own file under Shared/Drafts, with the two named refusals of the promotion')
    ok(denies(blocksBSource, 'deferredTo') && denies(blocksBSource, 'md.written:false') && denies(blocksBSource, '草案只登记索引行'),
      '§0c2 ·1 the retired claim (a draft is a row with no file) is gone from the source')
    ok(denies(blocksBSource, '三个席位的 ACL 都不开放它'), '§0d ·2 the script block no longer says every seat is closed')
    ok(says(blocksBSource, 'vibe_v5_script') && says(blocksBSource, 'op: "archive"') && says(blocksBSource, 'VMU_NOT_PERMITTED'),
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
    ok(says(chairText, '草案落盘、adopt 只晋升'), '§1b ·1 the chair reads that a draft lands on disk and adopting only promotes it')
    ok(says(chairText, 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING') && says(chairText, 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT') && says(chairText, 'alreadyWritten:true'),
      '§1c ·1 and the three receipt facts of the promotion: the two named refusals and the already-written case')
    ok(denies(chairText, '只有 adopt 写 md') && denies(chairText, 'deferredTo'),
      '§1d ·1 the retired sentence and the retired receipt field are not in the assembled prompt')
    ok(says(chairText, '归档是院士席（chair）的面') && says(chairText, 'vibe_v5_script'),
      '§1e ·2 the chair is told the archive face is its own')
    ok(says(chairText, '归档是**副本**不是执行证据'), '§1f ·2 and that the archive is a copy, not proof of execution')
    // The researcher variant is the codesigner: same truth, its own wording.
    const memberText = await seatPrompt(b.K, 'r-1', 'normal')
    ok(says(memberText, '草案是**你自己的文件**') && says(memberText, 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT'),
      '§1g ·1 the researcher reads: the draft is its OWN file, and the promotion verifies it')
    ok(denies(memberText, '正文落在一份 md') && denies(memberText, 'deferredTo'),
      '§1h ·1 and neither the old wrong sentence nor the retired receipt field')
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
    ok(says(blocksBSource, '草案落盘、adopt 只晋升') && says(blocksBSource, '草案是**你自己的文件**') && says(blocksBSource, '默认**什么都不写**'),
      '§4b ·1 all three seat variants carry the truth, each in its own wording')
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

  // ── §6 ·6 THE DELIVERY TIMING IS TAUGHT: WHAT ARRIVES, WHEN IT IS SEEN, AND WHAT TO DO ─────────────────────────
  //
  // User question m37280 ①/④: 「预约会议给每个被邀成员投耐久 mailbox 行 + 回合通知块渲染」「主席 `speak` 不带 `to`
  // 与 `say` 致全体会推送成群聊行」. The kernel now does both (meetings.js `appointNoticeOf`/`broadcastOf`, kit
  // group fan-out), so the prompt must say WHEN it happens, WHERE it is seen, and WHAT the member does about it.
  // The facts pinned here are the ones the kernel really renders, not a paraphrase: the notice line carries the exact
  // attend call and ends in an ack instruction; the block is the TOP of the turn prompt (kernel/turn/index.js
  // prepends `noticeText`); and the ack door is the KERNEL face, because the pack inbox only has list/open/mark.
  {
    console.log('§6 ·6 the prompts teach the delivery timing: notice block, appointment line, chair push')
    ok(says(blocksBSource, '[新到的消息]'), '§6a ·6 the notice block is named where the member really sees it')
    ok(says(blocksBSource, '【会议预约·') && says(blocksBSource, '【主席发言·'),
      '§6b ·6 both pushed lines are quoted by the prefixes the kernel renders')
    ok(says(blocksBSource, 'vibe_vmu_mailbox {action:"ack"'), '§6c ·6 the ack door is the kernel face, not the pack inbox')
    ok(says(blocksBSource, 'meeting-appointment') && denies(blocksBSource, 'meeting-invitation'),
      '§6d ·6 the invitation kind is the one the kernel writes now (the retired kind is gone)')
    ok(says(blocksBSource, 'deliveredTo') && says(blocksBSource, 'broadcastFailed'),
      '§6e ·6 the chair-push receipt fields are named, failure with them')
    ok(says(blocksBSource, '不用轮询'), '§6f ·6 the member is told not to poll for a pushed line')

    // …and the assembled prompts carry it (source truth is not prompt truth).
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const normal = await seatPrompt(b.K, 'r-1', 'normal')
    ok(says(normal, '[新到的消息]') && says(normal, '【会议预约·'),
      '§6g ·6 a regular-round member prompt teaches the appointment notice block')
    ok(says(normal, 'vibe_v5_inbox {action:"open"') && says(normal, 'vibe_vmu_mailbox {action:"ack"'),
      '§6h ·6 and both steps it takes: read the body on the pack face, ack on the kernel face')
    const opened = await b.K.meetings.open({ type: 'debate', chair: 'r-acad', materials: '确认命题; 分配复核', members: ['r-1'], roster: ['r-1'], actor: 'r-acad' })
    const meetingId = String(opened && (opened.meeting === undefined || opened.meeting === null ? '' : opened.meeting))
    ok(meetingId !== '', '§6i ·6 a meeting was opened for the meeting-phase prompts', opened && opened.code)
    const chairMeeting = await seatPrompt(b.K, 'r-acad', 'meeting', { meeting: meetingId })
    ok(says(chairMeeting, '对全体发言即推送') && says(chairMeeting, 'broadcastFailed') && says(chairMeeting, 'deliveredTo'),
      '§6j ·6 the chair is told WHICH speech is pushed and WHICH receipt fields say who got it')
    const memberMeeting = await seatPrompt(b.K, 'r-1', 'meeting', { meeting: meetingId })
    ok(says(memberMeeting, '【主席发言·') && says(memberMeeting, '不用轮询'),
      '§6k ·6 a member in session knows a chair push will arrive by itself, as a notice line')
  }
  // ── §7 ·7 RUN 249: TWO MEASURED MIS-TEACHINGS RETIRED (hands on a service meeting; a boolean formal_agenda) ──
  // The 69th live run hit both: L39 called hands {op:"list"} on a SERVICE meeting and got
  // VMU_REGISTRY_BOUNDARY (hands is the PRIMITIVE floor; a service floor is a QUEUE), and P-04 passed
  // formal_agenda:true and got a declaration with formalAgendaItems:null. Both sentences are now taught the
  // other way, and both are pinned in the SOURCE and in the REAL assembled chair meeting prompt.
  {
    console.log('§7 ·7 the two measured mis-teachings are retired in the prompts')
    ok(says(blocksBSource, 'VMU_REGISTRY_BOUNDARY') && says(blocksBSource, '只写内核**原语会**的楼层'),
      '§7a ·7 action:"hands" is named as primitive-only, with the refusal code it really returns')
    ok(says(blocksBSource, '把人按序排进队列用') && says(blocksBSource, '只是**模式名**'),
      '§7b ·7 the queue doors are invite/order, and the flow MODE named hands is untangled from the ACTION')
    ok(says(blocksBSource, 'formalAgendaItems:null') && says(blocksBSource, '才逐条落库'),
      '§7c ·7 a boolean formal_agenda only declares; items require an array')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.meetings.open({ type: 'debate', chair: 'r-acad', materials: '确认命题; 分配复核', members: ['r-1'], roster: ['r-1'], actor: 'r-acad' })
    const meetingId = String(opened && (opened.meeting === undefined || opened.meeting === null ? '' : opened.meeting))
    ok(meetingId !== '', '§7d ·7 a meeting was opened for the meeting-phase prompt', opened && opened.code)
    const chairMeeting = await seatPrompt(b.K, 'r-acad', 'meeting', { meeting: meetingId })
    ok(says(chairMeeting, 'VMU_REGISTRY_BOUNDARY') && says(chairMeeting, '把人按序排进队列用'),
      '§7e ·7 the assembled chair meeting prompt tells the chair the queue doors (not hands)')
    ok(says(chairMeeting, 'formalAgendaItems:null') && says(chairMeeting, '才逐条落库'),
      '§7f ·7 and that items need an array, not a boolean')
  }

  // ── §8 ·8 RUN 249 (task-69): DELIVERY IS OBSERVABLE — THE BLOCK REALLY RENDERS, AND THE RECEIPT OUTLIVES THE REPLY ──
  // The 69th live run filed F-11 (7 unread mails, yet the `[新到的消息]` block never rendered), F-02 (a 7 328-char reply
  // was cut to a 2 000-char excerpt — and the excerpt was all the office ever read) and F-01 (`status:"applied"` on a
  // reply whose whole body was `{"solved":false}`). task-69 wired the block into the turn prompt and added the readings,
  // so the prompt must name the SWITCHES a seat can check: `notices.rendered` (was the block really rendered for me this
  // turn), the archive path+hash of the full reply, and `emptyReply`. ★ RUN 251-A reversed what `emptyReply` MEANS: it
  // only describes the reply TEXT (true = 0 chars, blank included; one character — even `{"solved":false}` — is false),
  // and the tool channel (`source`/`fields`/`executed`/`writes`) is a separate channel, so `emptyReply:true` with tool
  // fields is not a contradiction. The cut keys are `truncated`/`excerptLen`; `replyTruncated`/`replyExcerpt` survive
  // only as receipt-level history and are never copied onto a ledger row (kernel/turn/index.js `turnReceiptsMeans`).
  // Every string pinned below is one the code really emits; none of it is a paraphrase of an intention.
  {
    console.log('§8 ·8 the delivery readings a seat can check are taught (block rendered, full reply, empty reply)')
    ok(says(blocksBSource, 'rendered') && says(blocksBSource, 'blockChars') && says(blocksBSource, '装配回执 `notices`') && says(blocksBSource, '小节读数'),
      '§8a ·8 the assembly reading is named exactly as the turn receipt emits it')
    ok(says(blocksBSource, '不出现块头') && says(blocksBSource, '通知丢了'),
      '§8b ·8 "no header" is taught as "no message", not as "the notice was lost"')
    ok(says(blocksBSource, 'vmu.turn.replyLimitChars') && says(blocksBSource, '`truncated`') && says(blocksBSource, '`excerptLen`'),
      '§8c ·8 the reply limit is named with its setting key and the AUTHORITATIVE cut keys (truncated / excerptLen)')
    ok(says(blocksBSource, '只是它的旧称'), '§8c2 ·8 replyTruncated / replyExcerpt are taught as old names, not as row keys')
    ok(says(blocksBSource, 'replyFullPath') && says(blocksBSource, 'replyFullSha256'),
      '§8d ·8 the full reply is a file with a path and a hash, not a promise')
    ok(says(blocksBSource, '`emptyReply` 只说') && says(blocksBSource, '文本通道') && says(blocksBSource, '写了一个字就是 false'),
      '§8e ·8 emptyReply means "the reply TEXT was 0 chars", not "this turn did nothing" (RUN 251-A)')
    ok(denies(blocksBSource, '这一回合没交代做没做'),
      '§8e2 ·8 the reversed (RUN 249) meaning of emptyReply is gone from the source')
    ok(says(blocksBSource, '工具通道是另一条通道'),
      '§8e3 ·8 "emptyReply:true with tool fields" is explained as two channels, not as a contradiction')
    ok(says(blocksBSource, 'notifyRows') && says(blocksBSource, 'notifyFailed'),
      '§8f ·8 the chair sees the kernel delivery arrays on the appointment receipt')

    // …and the assembled prompts carry it (source truth is not prompt truth).
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const normal = await seatPrompt(b.K, 'r-1', 'normal')
    ok(says(normal, '装配回执 `notices`') && says(normal, '文本通道'),
      '§8g ·8 every round teaches the two readings that decide "did I hear" and "did I say anything"')
    const opened = await b.K.meetings.open({ type: 'debate', chair: 'r-acad', materials: '确认命题; 分配复核', members: ['r-1'], roster: ['r-1'], actor: 'r-acad' })
    const meetingId = String(opened && (opened.meeting === undefined || opened.meeting === null ? '' : opened.meeting))
    ok(meetingId !== '', '§8h ·8 a meeting was opened for the chair meeting prompt', opened && opened.code)
    const chairMeeting = await seatPrompt(b.K, 'r-acad', 'meeting', { meeting: meetingId })
    ok(says(chairMeeting, 'notifyRows') && says(chairMeeting, 'notifyFailed'),
      '§8i ·8 the chair\'s assembled prompt names the delivery arrays to repair from')
  }

  // ── §9 ·9 RUN 251-C (F71-12): THE FRAMEWORK NEVER OPENS THE MEETING ON THE CHAIR'S BEHALF ────────────────────────
  // The 71st live run measured that the prompt read as "everyone here at due time ⇒ it starts": a seat could wait for a
  // meeting that never opens. The kernel's truth (kernel/meetings.js `pendingStartOf` / `startBlockOf`): the due time is
  // SEEN once (the next touch), it opens only if the roll was complete at that instant, otherwise it settles into
  // `waiting` with `waitingFor:"quorum"` (people missing) or `"chair-proceed"` (roll complete, chair's call);
  // `requiresChairProceed:true` says the framework will not decide for the chair; the wait's own expiry only sets
  // `waitDecisionDue` (a nudge, not an opening); `nextActions` names the moves (`beat`/`attend`/`proceed`/`lapse`/`recess`).
  {
    console.log('§9 ·9 "the clock starts it" is gone: due time settles once, the chair proceeds')
    ok(says(blocksBSource, '到点不会自己开会'), '§9a ·9 the prompt says the due time does not open the meeting by itself')
    ok(denies(blocksBSource, '到点人齐才开'), '§9b ·9 the old "it opens once everyone is here at due time" is gone')
    ok(denies(blocksBSource, '迟到者 `attend` 即开'), '§9b2 ·9 the old "a latecomer attending opens it" wording is gone')
    ok(says(blocksBSource, '`waitingFor`') && says(blocksBSource, '"chair-proceed"') && says(blocksBSource, '"quorum"'),
      '§9c ·9 the two waiting reasons are named (quorum / chair-proceed)')
    ok(says(blocksBSource, 'requiresChairProceed:true') && says(blocksBSource, '开会不是框架按钟自己决定的'),
      '§9d ·9 "requiresChairProceed" is taught as "not decided by the clock", not as "only the chair may ever open"')
    ok(says(blocksBSource, '`nextActions`') && says(blocksBSource, '`lapse` 弃会') && says(blocksBSource, '`recess` 体会'),
      '§9e ·9 the moves are named, not paraphrased (proceed / lapse / recess via nextActions)')

    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.meetings.open({ type: 'academic', chair: 'r-acad', materials: '确认命题', members: ['r-1'], roster: ['r-1'], actor: 'r-acad' })
    const meetingId = String(opened && (opened.meeting === undefined || opened.meeting === null ? '' : opened.meeting))
    ok(meetingId !== '', '§9f ·9 a meeting was opened for the RUN 251-C prompt checks', opened && opened.code)
    const chairMeeting = await seatPrompt(b.K, 'r-acad', 'meeting', { meeting: meetingId })
    ok(says(chairMeeting, '到点不会自己开会') && says(chairMeeting, '"chair-proceed"') && says(chairMeeting, '`nextActions`'),
      '§9g ·9 the chair\'s assembled manual carries the settling rule and the moves')
    const memberMeeting = await seatPrompt(b.K, 'r-1', 'meeting', { meeting: meetingId })
    ok(says(memberMeeting, '到点不会自己开') && says(memberMeeting, '"chair-proceed"') && says(memberMeeting, '别催'),
      '§9h ·9 the researcher\'s assembled prompt says "wait for the chair, do not push"')
  }
  // ── §10 ·10 RUN 252-C (F72-10 / F72-2 / F72-6): the key names the faces really use ──────────────────────────────
  // Measured on the 72nd run: the chair wrote `verdicts:[{member, verdict:1}]` and got `VMU_INVALID_ARGUMENT` because the
  // numeric key is `p` (`p=undefined`). The prompts taught `vibe_v5_verdict` (a DIFFERENT tool, key `verdict`) and never
  // printed the element shape, so "verdict" was the only word a model had seen. Same class: the proof declaration is an
  // ARGUMENT named `proof_state` (snake) while the RECEIPT/body read back `proofState` (camel); and the archive receipt's
  // `replyFullSha256`/`replyFullBytes` cover the reply TEXT only, not the file header.
  // ★ RUN 254-C (the RUN 253 read-only audit, W2 gate gaps ③/④): two fixes, both pinned here.
  //   ③ The 72nd run's byte figures (16 463 / 496 / 15 967 B) had been written INTO the prompt. Measurements belong in
  //     the acceptance docs; a prompt that carries one run's numbers goes stale the moment the archive header changes.
  //     The prompt now states the shape ("header ≈0.3–0.6 KB", "check the file yourself with sha256sum", "trust the
  //     receipt you actually got") and §10e2 asserts the digits are GONE.
  //   ④ `tool_help`'s `source` was unstated: `count:null`/`tools:null` reads as "this seat has no tools" when it means
  //     "there was no live session, so nothing was measured". The prompt now says which is which and names
  //     `declaredCount` as the declaration set; §10i2 denies the permission misreading.
  {
    console.log('§10 ·10 the argument/field names the faces really use are taught, and the retired spellings are gone')
    ok(says(blocksASource, 'proof_state:"complete"') && says(blocksASource, '回执/卡体读回才叫 `proofState`'),
      '§10a ·10 the proof declaration is taught with the ARGUMENT name `proof_state`, not the read-back name')
    ok(denies(blocksASource, '`proofState:"complete"`'),
      '§10b ·10 "pass proofState:complete" is gone from the charter (it is the read-back spelling, not an argument)')
    ok(says(blocksASource, '`verdicts` 是**对象数组**') && says(blocksASource, 'p:0 或 1') && says(blocksASource, '**不是** `verdict`'),
      '§10c ·10 the verdict element shape is printed verbatim, and `verdict` is named as ANOTHER tool\'s key')
    ok(says(blocksASource, '被具名拒 `VMU_INVALID_ARGUMENT`'),
      '§10d ·10 the consequence of the wrong key is named (a named refusal, not a silent drop)')
    ok(says(blocksBSource, '只覆盖正文') && says(blocksBSource, 'sha256sum') && says(blocksBSource, '以实收回执为准'),
      '§10e ·10 the archive receipt is taught as covering the reply TEXT only, verifiable by checking the file yourself')
    ok(denies(blocksBSource, '16 463') && denies(blocksBSource, '15 967') && denies(blocksBSource, '第 72 次真机实测'),
      '§10e2 ·10 the live run\'s byte figures stay in the docs, not in the prompt (RUN 254-C W2 gate)')

    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const chairNormal = await seatPrompt(b.K, 'r-acad', 'normal', {})
    ok(says(chairNormal, 'p:0 或 1') && says(chairNormal, '`verdicts` 是**对象数组**'),
      '§10f ·10 the chair\'s assembled prompt prints the element shape (a chair acting on it cannot guess)')
    ok(says(chairNormal, 'proof_state:"complete"'),
      '§10g ·10 the assembled charter teaches the argument spelling `proof_state`')
    ok(says(blocksBSource, '`source` 是**读数来源**') && says(blocksBSource, '`declaredCount`') && says(blocksBSource, '不是「该席位没有工具」'),
      '§10i ·10 tool_help\'s `source` is taught as the READING source, and null counts as "not measured"')
    ok(denies(blocksBSource, '`source` 是**席位权限**'),
      '§10i2 ·10 `source` is not taught as a seat permission (the wording RUN 254-C W2 found unstated)')
    const memberNormal = await seatPrompt(b.K, 'r-1', 'normal', {})
    ok(says(memberNormal, '只覆盖正文') && says(memberNormal, 'sha256sum'),
      '§10h ·10 every seat\'s assembled prompt says the archive sha covers the body, not the file')
    ok(says(memberNormal, '`source` 是**读数来源**') && says(memberNormal, '`declaredCount`'),
      '§10j ·10 every seat\'s assembled prompt carries the tool_help reading semantics')
    // ★ RUN 254-C / C3 (the RUN 253 audit's one INCONSISTENT object: `[新到的消息]` ack vs read). The mechanism
    // settled it as ONE criterion (`vibe-math-vmu/kernel/mailbox.js` `noticeLines`: a row is DELIVERED UNTIL ACKED —
    // `open()`/read only sets `read`), so the prompt must say "ack is the only settlement" and must not keep the old
    // "ack what you finished reading" phrasing, which invited a member to look for an ack reading had made moot.
    // ★ TB-2620 / task-101 taught the proper names `unackedRowsAllBoxes` (all boxes) and `perBox` (this member box)
    // at the time, because the mechanism computed them. RUN 264 (lead m08149-②) revoked that half after the
    // TAUGHT-READING audit: both are view-level aggregates that NO member-facing receipt returns (the view at
    // kernel/mailbox.js noticeLines is consumed only for `.lines`), so teaching them sends the member after a field
    // that cannot be read. The sentence now keeps only readable names; the negative halves below pin BOTH the old
    // bare-`unackedRows` list and the two revoked aggregates out of the prompt.
    ok(says(blocksBSource, '**唯一**结算') && says(blocksBSource, '行不会因被读消失') && says(blocksBSource, '`acked`／`ackRequired`／`settledBy:"ack"`') && says(blocksBSource, '`unackedRows` 是旧称'),
      '§10k ·10 mail is DELIVERED UNTIL ACKED; the readings list keeps only names a member can actually read (acked / ackRequired; unackedRows is only the old name)')
    ok(denies(blocksBSource, '`unackedRowsAllBoxes`') && denies(blocksBSource, '`perBox`'),
      '§10k3 ·10 view-level aggregates unackedRowsAllBoxes / perBox are NOT taught any more — no member-facing receipt returns them (lead ruling m08149-②)')
    ok(denies(blocksBSource, '`acked`／`ackRequired`／`unackedRows`／'),
      '§10k2 ·10 the OLD reading list (bare unackedRows in the readings) is gone — the compatibility sentence is the ONLY place the old name appears')
    ok(denies(blocksBSource, '读完正文用'),
      '§10l ·10 the retired "ack what you finished reading" wording is gone (reading never settles a delivery)')
    ok(says(memberNormal, '**唯一**结算') && says(memberNormal, '`settledBy:"ack"`') && denies(memberNormal, '`unackedRowsAllBoxes`') && denies(memberNormal, '`perBox`'),
      '§10m ·10 the member\'s assembled prompt carries the ack-settles-it reading, and does not teach names it cannot read')
    ok(says(chairNormal, '**唯一**结算') && says(chairNormal, '行不会因被读消失'),
      '§10n ·10 the chair\'s assembled prompt carries the same one-criterion wording')
  }
  // ── §11 ·11 RUN 255 / task-96: THE SEAT'S WORK BELONGS TO THE SEAT, THE OFFICE ONLY RELAYS, FS IS THE DEFAULT ─────
  // The measured mismatch (user Q2): members' named writes were mostly office-side calls (`memberActed:false`), so the
  // prompted shape — "落盘两条路" with the record tool FIRST, temp output "归指派者归档" — taught the office to do work
  // that must stay with a running seat. The new three-layer criterion: (a) the card/talk/vote/table is written by the
  // seat itself in its own turn (派活≠代做); (b) self-managed md defaults to fs (默认用 fs), the record tool is for
  // KERNEL ACCOUNTING only; (c) the office relays only when a member turn is unavailable, and the receipt says so
  // (`relayedBy: office` + `memberActed:false` + 「成员本轮未运行」) — 汇总≠产出. 统筹是安排谁做, not 替谁做.
  // D2 ("the office is the sole outward messenger") is untouched: relaying a voice is not authoring it.
  {
    console.log('§11 ·11 the seat acts in its own turn, the office relays, fs is the default')
    ok(says(coreSource, '默认用 fs') && denies(coreSource, '写卡片请直接用工具'),
      '§11a ·11 the core charter makes fs the DEFAULT write path, and the "use the tool directly" sentence is gone')
    ok(says(blocksASource, '默认用 fs') && says(blocksASource, 'reindex') && denies(blocksASource, '落盘两条路'),
      '§11b ·11 the charter drops the two-road framing and says: write the md, the kernel indexes files on reindex')
    ok(denies(blocksASource, '产出归指派者归档') && denies(blocksASource, '产出由指派者归档') && says(blocksASource, '指派者只核对、不代写'),
      '§11c ·11 the two member/researcher variants no longer hand the output to the assignee, and keep "the assignee checks, never writes"')
    ok(denies(blocksBSource, '产出由指派者归档') && says(blocksBSource, '指派者只核对、不代写'),
      '§11d ·11 the temp-worker sections no longer say the assignee archives their output')
    ok(says(blocksASource, '派活≠代做') && says(blocksASource, '由你本回合自己写'),
      '§11e ·11 "assigning is not doing" and "your card/talk/table are written by you this turn" are printed')
    ok(denies(blocksASource, '所办可以协助调整') && says(blocksASource, '承办席位自己写'),
      '§11f ·11 "the office may help adjust" is gone; the work stays with the seat that took it')
    ok(says(assistantSource, '统筹是安排谁做') && denies(assistantSource, '所办与领头人靠这些统筹与对外'),
      '§11g ·11 the office is taught "coordinating = deciding WHO does it", not "handing reports to the office"')
    ok(says(assistantJsonSource, '汇总≠产出') && says(assistantJsonSource, 'relayedBy: office') && says(assistantJsonSource, 'memberActed:false') && says(assistantJsonSource, '成员本轮未运行'),
      '§11h ·11 the office prompt names the relay receipt fields and the "member turn unavailable" condition')
    ok(says(assistantJsonSource, '不代席行动') && says(assistantJsonSource, '成员没做，就是没做'),
      '§11i ·11 the hard seat boundary that was already right is still there (no regression on the good half)')

    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    await b.K.members.hire({ id: 'r-t1', slot: 'temp' })
    const chairNormal = await seatPrompt(b.K, 'r-acad', 'normal', {})
    ok(says(chairNormal, '默认用 fs') && says(chairNormal, 'reindex'),
      '§11j ·11 the chair\'s assembled prompt carries the fs default and the reindex path')
    const memberNormal = await seatPrompt(b.K, 'r-1', 'normal', {})
    ok(says(memberNormal, '默认用 fs') && says(memberNormal, '指派者只核对、不代写'),
      '§11k ·11 the member\'s assembled prompt carries the fs default and "the assignee checks, never writes"')
    const tempNormal = await seatPrompt(b.K, 'r-t1', 'normal', {})
    ok(says(tempNormal, '不代写') && denies(tempNormal, '产出由指派者归档'),
      '§11l ·11 the temp worker reads "the assignee checks, never writes" and not the old archive sentence')
  }

  // ── §12 ·12 RUN 256 / task-107 (TB-2626): FS IS THE DEFAULT IN THE CAPTURED PERSONA, AND EVERY PROMISE LANDS ──────
  // The captured persona is NOT declared at runtime (T63: the hand-written charter is), so this section does not test
  // what a member receives — §11 does. It tests the CAPTURE the corpus owns: (a) the old "recommended" wording is gone
  // from both the corpus and the generated file; (b) the default-fs sentence and the who-overwrites-whom sentence are
  // present in all four role bodies; (c) the generated file is FRESH (its SOURCE_SHA256 is the sha256 of the corpus on
  // disk, so a hand-edit of the generated file or a stale generation both redden); (d) the four bodies differ only in
  // the member library root (a divergence here would emit four different charters); (e) each mechanism the sentence
  // names has a real landing in the code (the Lead requirement: a promise without an implementation is not a wording
  // fix). Editing the corpus is what moves the generated file — never the other way round.
  {
    console.log('§12 ·12 the captured persona defaults to fs, and every promise in the sentence has a landing')
    const OLD_RECOMMENDED = '推荐**直接用 fs'
    const OLD_RECORD_FIRST = '若只想记录成果'
    ok(denies(personaCorpusRaw, OLD_RECOMMENDED) && denies(personaCorpusRaw, OLD_RECORD_FIRST),
      '§12a ·12 the corpus no longer says "recommended fs" or "just use the record tool to log an outcome"')
    ok(denies(personaSource, OLD_RECOMMENDED) && denies(personaSource, OLD_RECORD_FIRST),
      '§12b ·12 the GENERATED persona carries neither old sentence (the generator, not a hand edit, moved it)')
    ok(says(personaCorpusRaw, '**默认用 fs 写你自己的文件**') && says(personaCorpusRaw, '只在需要内核记账时才用'),
      '§12c ·12 the corpus states fs as the DEFAULT and narrows the card tools to kernel accounting')
    ok(says(personaSource, '**默认用 fs 写你自己的文件**') && says(personaSource, '只在需要内核记账时才用'),
      '§12d ·12 the generated persona carries the default-fs sentence')
    ok(says(personaSource, '工具与 fs 写的是同一个文件，后写的覆盖先写的'),
      '§12e ·12 the who-overwrites-whom sentence is present (tools and fs address the same file)')
    const hitsNew = personaSource.split('**默认用 fs 写你自己的文件**').length - 1
    const hitsWho = personaSource.split('工具与 fs 写的是同一个文件，后写的覆盖先写的').length - 1
    ok(hitsNew === 5 && hitsWho === 5,
      '§12f ·12 both sentences appear in the default section AND all four role bindings (5 copies, no role left on the old text)',
      { hitsNew, hitsWho })

    // Freshness: the generated header records the sha256 of the corpus, so a stale generation or a hand edit reddens.
    const recorded = (personaSource.match(/SOURCE_SHA256 = "([0-9a-f]{64})"/) || [])[1]
    const onDisk = createHash('sha256').update(personaCorpusRaw).digest('hex')
    ok(recorded === onDisk,
      '§12g ·12 the generated persona is FRESH: its SOURCE_SHA256 equals sha256 of the corpus on disk',
      { recorded: String(recorded).slice(0, 12), onDisk: onDisk.slice(0, 12) })

    // The four role bodies must differ ONLY in the member library root.
    const roleIds = Object.keys(personaCorpus.roles)
    const bodies = roleIds.map((id) => {
      const block = personaCorpus.roles[id].blocks.filter((b) => b.key === 's三')[0]
      return String((block && block.text) || '').replace(/Members\/[a-z0-9-]+\//g, 'Members/<ID>/')
    })
    ok(bodies.length === 4 && bodies.every((t) => t.length > 0),
      '§12h ·12 all four role bodies were read (non-empty precondition)')
    ok(new Set(bodies).size === 1,
      '§12i ·12 the four role bodies differ only in Members/<id>/ — no role teaches a different charter',
      { distinct: new Set(bodies).size })

    // Every mechanism the new sentence names must exist in the code it points at (Lead requirement) — asserted by
    // BEHAVIOUR (RUN 259 / TB-2655 P1-9): a source literal can sit in dead code. The default propose writes nothing and
    // says so by name; the explicit materialize:true path writes the draft. Same module, same records face.
    const BP = await import(pathToFileURL(BLUEPRINT).href)
    const bpRoot = await mkRoot()
    const bpB = await boot(bpRoot)
    await bpB.K.members.hire({ id: 'r-acad', slot: 'chair' })
    const bpDefault = BP.proposeBlueprint({ records: bpB.K.records, path: 'Shared/Run239-default.md', by: 'r-acad', seat: 'chair', text: '行为断言：默认什么都不写' })
    ok(bpDefault.filed === false && bpDefault.draftMdMissing === true && bpDefault.writtenBy === null,
      '§12j ·12 MEASURED: the default propose writes NOTHING and names the missing thing (filed:false / draftMdMissing:true / writtenBy:null)',
      { filed: bpDefault.filed, draftMdMissing: bpDefault.draftMdMissing, writtenBy: bpDefault.writtenBy })
    ok(existsSync(join(bpRoot, 'VibeMath', 'Shared', 'Drafts', 'Run239-default-r1.md')) === false,
      '§12j2 ·12 MEASURED: ...and no draft file appeared on disk')
    const bpMat = BP.proposeBlueprint({ records: bpB.K.records, path: 'Shared/Run239-mat.md', by: 'r-acad', seat: 'chair', text: '行为断言：显式物化', materialize: true })
    ok(bpMat.filed === true && bpMat.writtenBy === 'kernel-materialized' && bpMat.draftMdMissing === false,
      '§12j3 ·12 MEASURED: materialize:true is the explicit legacy switch (filed:true / writtenBy:kernel-materialized)',
      { filed: bpMat.filed, writtenBy: bpMat.writtenBy })
    ok(existsSync(join(bpRoot, 'VibeMath', 'Shared', 'Drafts', 'Run239-mat-r1.md')) === true,
      '§12j4 ·12 MEASURED: ...and THAT call wrote the draft file on disk')
    ok(says(recordsSource, 'mdChangedSinceIndex') && says(recordsSource, 'reindex'),
      '§12k ·12 records.js really has the drift reading and the repair the sentence names (mdChangedSinceIndex, reindex)')
    ok(says(personaSource, 'draftMdMissing') && says(personaSource, 'mdChangedSinceIndex') && says(personaSource, 'reindex') && says(personaSource, 'mdPath'),
      '§12l ·12 the sentence names all four mechanism words, so §12j/§12k are checking a promise that is actually printed')
  }


  // ── §13 ·13 RUN 255 / TB-2613 (fs-first): THE DEFAULT WRITES NOTHING; THE DRAFT IS THE MEMBER OWN FILE ───────────
  // RUN 248 taught that a draft lands on disk, but said the KERNEL materializes Shared/Drafts/<stem>-r<N>.md when no
  // mdPath is given. TB-2613 flipped that default to fs-first: propose without mdPath writes NOTHING (no file, no row)
  // and returns filed:false + draftMdMissing:true, so a member that read the old sentence waits for a file that never
  // appears. The pins hold the new truth in the source, in the ASSEMBLED prompts of all three seats, and in docs/26
  // (which carries the RUN 248 wording as history and must now mark the flip where it taught the old default).
  {
    console.log('§13 ·13 fs-first: the default writes nothing, the draft is the member own file')
    ok(typeof doc26Source === 'string' && doc26Source.length > 1000, '§13a ·13 docs/26 was read (non-empty precondition)')
    ok(denies(blocksBSource, '不带 `mdPath` 时内核把草案物化') && denies(blocksBSource, '不传 `mdPath` 时内核写到') && denies(blocksBSource, '不传则由内核写'),
      '§13b ·13 the source no longer says the kernel materializes a draft when mdPath is absent')
    ok(denies(blocksBSource, '物化到 `Shared/Drafts`'),
      '§13c ·13 no role text still promises a kernel-written Shared/Drafts file')
    ok(says(blocksBSource, '默认**什么都不写**') && says(blocksBSource, '`filed:false`') && says(blocksBSource, '`draftMdMissing:true`'),
      '§13d ·13 the new truth is printed: the default writes nothing and the receipt says filed:false + draftMdMissing:true')
    ok(says(blocksBSource, '显式 `materialize:true`') && says(blocksBSource, '`writtenBy:"kernel-materialized"`') && says(blocksBSource, '`writtenBy:"member-file"`'),
      '§13e ·13 the old behaviour is still reachable by name (materialize:true), and both writers keep their provenance')
    ok(says(blocksBSource, '先用 fs 写') && says(blocksBSource, '再带同一 `mdPath` propose'),
      '§13f ·13 the normal path is named: write the draft with fs first, then propose with the same mdPath')
    ok(says(blocksBSource, 'md 是唯一真相') && says(blocksBSource, '`mdChangedSinceIndex:true`') && says(blocksBSource, '`reindex` 按 md 重建'),
      '§13g ·13 who-overwrites-whom is taught: the md is the truth, the row indexes it, drift is disclosed then reindex repairs')
    ok(says(blocksBSource, 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING') && says(blocksBSource, 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT') && says(blocksBSource, 'alreadyWritten:true'),
      '§13h ·13 the promotion half is unchanged (the two refusals and alreadyWritten:true are still taught)')

    const b13 = await boot(await mkRoot())
    await b13.K.members.hire({ id: 'r-acad', slot: 'chair' })
    await b13.K.members.hire({ id: 'r-1', slot: 'member' })
    await b13.K.members.hire({ id: 'r-t1', slot: 'temp' })
    const chairNormal = await seatPrompt(b13.K, 'r-acad', 'normal', {})
    ok(says(chairNormal, '默认**什么都不写**') && says(chairNormal, '`draftMdMissing:true`') && says(chairNormal, '`materialize:true`'),
      '§13i ·13 the assembled chair prompt carries the fs-first default and the explicit legacy switch')
    ok(denies(chairNormal, '物化到') && denies(chairNormal, '内核把草案物化'),
      '§13j ·13 the assembled chair prompt promises no kernel-written draft file')
    const memberNormal = await seatPrompt(b13.K, 'r-1', 'normal', {})
    ok(says(memberNormal, '草案是**你自己的文件**') && says(memberNormal, '`filed:false`'),
      '§13k ·13 the assembled member prompt calls the draft its own file and names the empty receipt')
    ok(denies(memberNormal, '物化到') && denies(memberNormal, '不传则由内核写'),
      '§13l ·13 the assembled member prompt carries no kernel-materialization claim')
    const tempNormal = await seatPrompt(b13.K, 'r-t1', 'normal', {})
    ok(says(tempNormal, '草案是**你自己的文件**') && says(tempNormal, '`filed:false`') && denies(tempNormal, '物化到'),
      '§13m ·13 the assembled temp prompt carries the same two facts and no old claim')

    const marks = doc26Source.split('RUN 255 翻转').length - 1
    ok(marks >= 3, '§13n ·13 docs/26 marks the flip at every place that taught the old default', { marks })
    ok(denies(doc26Source, '不带 `mdPath` 时内核把草案物化') && denies(doc26Source, '不带 `mdPath` 时内核物化'),
      '§13o ·13 docs/26 no longer states the retired default without qualification')
  }

  // ── §14 ·14 RUN 256 / task-94 round A: lateAdmission DEFAULT IS CHAIR, NOT OPEN ──────────────────────────────────
  // TB-2610 flipped the per-meeting `lateAdmission` default from `open` to `chair` in `kernel/meetings.js` (the chair
  // decides who is seated late, instead of the door opening by itself), but the meeting manual still said
  // 「（open|chair|refuse，缺省 open）」 — a member read a default the kernel does not have. The fact table
  // `scripts/audit-prompt-facts.mjs` caught it (fact `lateAdmissionDefault`: prompt "open" vs code "chair"); this pin
  // keeps the sentence honest in the source AND keeps the retired wording at zero hits.
  {
    console.log('§14 ·14 lateAdmission default: chair (kernel), not open')
    ok(typeof blocksBSource === 'string' && blocksBSource.length > 1000, '§14a ·14 blocks-b source was read (non-empty precondition)')
    ok(says(blocksBSource, '（open|chair|refuse，缺省 chair）'), '§14b ·14 the meeting manual states the code default: 缺省 chair')
    ok(denies(blocksBSource, '缺省 open'), '§14c ·14 the retired default 缺省 open is gone (0 hits)')
  }

  // ── §15 ·15 RUN 257 / task-94 round D: THE FIELD CATALOGUE HAS ONE AUTHORITY (THE RECEIPT, NOT A COPY) ─────────
  // The kernel prints `known fields: …` in the refusal itself (kernel/turn/index.js:2930, built from REPLY_FIELDS +
  // RECORDED_FIELDS). The prompt used to restate a COUNT and a sample parenthetical, so the only thing that could
  // happen when the catalogue changed was that the copy went stale. §15 keeps the copy gone: no count, no sample
  // fields inside the reply-contract sentence, and the replacement points the member at the receipt it will receive.
  {
    console.log('§15 ·15 reply-field catalogue: the receipt is the only authority, the prompt keeps no copy')
    ok(typeof coreSource === 'string' && coreSource.length > 1000, '§15a ·15 core source was read (non-empty precondition)')
    ok(Array.isArray(REPLY_FIELDS) && REPLY_FIELDS.length >= 20 && ['say', 'progress', 'solved', 'vote_solved'].every((f) => REPLY_FIELDS.includes(f)),
      '§15b ·15 non-vacuous: the kernel really declares the catalogue the prompt used to copy (REPLY_FIELDS with the four core fields)',
      { length: Array.isArray(REPLY_FIELDS) ? REPLY_FIELDS.length : null })
    ok(denies(coreSource, '29 个已登记字段') && denies(coreSource, '另接受 29') && denies(coreSource, '个已登记字段'),
      '§15c ·15 the hand-copied COUNT is gone (a count cannot be kept honest by wording)')
    ok(denies(coreSource, '`formal`、`record`、`meeting_hand`'),
      '§15d ·15 the sample parenthetical that stood in for the catalogue is gone')
    ok(says(coreSource, 'known fields') && says(coreSource, '据此改写调用') && says(coreSource, '不要从任何副本背字段清单'),
      '§15e ·15 the replacement teaches the receipt as the authority (known fields: … then rewrite the call)')

    // The sentence must not enumerate the catalogue either: other prompt sections may teach individual fields where
    // that field is the ACT (meeting_hand, task_create …), but the reply-contract sentence itself must stay a pointer.
    const contractLine = (coreSource.split('\n').filter((l) => l.includes('★★ 回执契约'))[0]) || ''
    ok(contractLine.length > 100, '§15f ·15 the reply-contract sentence was found (non-empty precondition)', { len: contractLine.length })
    const four = ['say', 'progress', 'solved', 'vote_solved']
    const inside = (name, text) => new RegExp('(^|[^A-Za-z0-9_])' + name + '([^A-Za-z0-9_]|$)').test(text)
    const copied = REPLY_FIELDS.filter((f) => !four.includes(f) && inside(f, contractLine))
    ok(copied.length === 0, '§15g ·15 ★ the reply-contract sentence names NO field of the catalogue beyond the four core ones (a pointer cannot go stale)', { copied })

    // The reply contract lives in `v5r-fixture-tools` (order 603), which `decideSections` enables ONLY when
    // `vmu.v5r.fixtureMode === 'tools'`; the default `no-tools` variant deliberately says nothing about tools.
    const b15 = await boot(await mkRoot())
    const base15 = b15.K.settingsSnapshot()
    const tools15 = (member, role, roleLabel) => b15.K.prompt.assemble({
      settings: Object.assign({}, base15, { 'vmu.v5r.fixtureMode': 'tools' }), member, role, roleLabel, phase: 'normal', round: 1,
    }).then((asm) => String((asm && asm.text) || ''))
    const seat15 = [await tools15('r-acad', 'chair', '院士'), await tools15('r-1', 'member', '常驻研究员'), await tools15('r-t1', 'temp', '临时工')]
    ok(Array.isArray(seat15) && seat15.length === 3 && seat15.every((t) => typeof t === 'string' && t.length > 1000), '§15h ·15 all three seat texts were assembled (non-empty precondition)')
    ok(seat15.every((t) => says(t, 'known fields') && says(t, '据此改写调用')),
      '§15i ·15 the assembled chair/member/temp texts all teach the receipt as the field authority')
    ok(seat15.every((t) => denies(t, '29 个已登记字段') && denies(t, '`formal`、`record`、`meeting_hand`')),
      '§15j ·15 ★ the assembled texts carry neither the count nor the sample copy (the regression this pin exists for)')
  }

  // ── §17 ·17 RUN 262 / TB-2671 follow-up (lead m07488): `[总任务]` IS THE INSTITUTE'S, NOT EACH MEMBER'S ──────────
  // The prompt used to say both「`[总任务]` 是「你」的总任务」and「①②③ 是所级总量」in one sentence: a reader resolves
  // that contradiction by making ① per-person, and two members with two objectives is two institutes. The kernel's
  // [状态板] line already carries a scopeNote (kernel/turn/index.js:1713: 全所总任务，内核只有一份) and ②/③ lead
  // with `属于你（<member>，未完成 N 条）`; the prompt only has to point at them instead of re-defining the row.
  {
    console.log('§17 ·17 the board line teaches ① as the institute single copy and points at the own-share lead-in')
    ok(typeof blocksBSource === 'string' && blocksBSource.length > 1000, '§17a ·17 blocks-b source was read (non-empty precondition)')
    ok(says(blocksBSource, '是本所的总任务') && says(blocksBSource, '内核只有一份，不按人分'),
      '§17b ·17 ★ the prompt says ① is the institute single copy (not per-member)')
    ok(says(blocksBSource, '属于你（<member>，未完成 N 条）'),
      '§17c ·17 the prompt names the exact own-share lead-in the board renders on ②/③')
    ok(denies(blocksBSource, '是「你」的总任务') && denies(blocksBSource, '每人各自推进各自的'),
      '§17d ·17 ★ the contradictory wording is gone (this is the regression the pin exists for)')
    const b17 = await boot(await mkRoot())
    const chair17 = await seatPrompt(b17.K, 'r-acad', 'normal')
    ok(typeof chair17 === 'string' && chair17.length > 10000, '§17e ·17 the chair normal prompt was assembled (non-empty precondition)')
    ok(says(chair17, '是本所的总任务') && says(chair17, '内核只有一份，不按人分'),
      '§17f ·17 ★ what the chair actually READS says ① is the institute single copy', { chars: chair17.length })
    ok(denies(chair17, '是「你」的总任务'), '§17g ·17 the reader no longer meets the old contradiction')
  }
} finally {
  for (const root of roots) { try { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) } catch {} }
  console.log('')
  console.log(passed + ' passed, ' + failed + ' failed')
  if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }
}
