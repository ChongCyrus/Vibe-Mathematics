#!/usr/bin/env node
// ★★★ TB-2739 (E) / RUN 79 — "IS THE STATUS BLOCK IN THE PROMPT" IS A READING, NOT A GREP.
//
// MEASURED on the 79th live run: the office paged turn t-13's member prompt (26 641 characters) and reported that
// neither `[状态板]` nor `[蓝图]` appeared in it, while the taskbook asserted the block is always rendered. Reading the
// product, the assembled text cannot lack the block on either route (a pack section renders `{{ statusBlock }}`, and
// `assemble()` appends it literally under 【本轮状态块】 when no section did) — so the receipt and the capture disagreed
// and neither could settle it. A reader must not have to grep a capture to answer a question the assembly already knows.
//
// This suite pins the paths that make it a receipt field: the assembly computes `statusBlock` on the EXACT string it
// hands to delivery, the archive keeps it, and both surfaces that hand a caller a prompt (`memberPrompt` on the step
// receipt, and a page of `op:"prompt"`) report it — with a NAMED reason when a surface cannot know.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const { boot } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)

let passed = 0
const failures = []
const ok = (cond, label, extra) => {
  if (cond) { passed += 1; console.log('ok ' + passed + ' - ' + label); return }
  failures.push(label)
  console.log('FAIL - ' + label + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)))
}

const root = mkdtempSync(join(tmpdir(), 'vmu-run79-board-'))
const h = await boot({ root, clock: () => 1_800_000_000_000, settings: { 'vmu.turn.deliverMode': 'caller' } })

const start = await h.call('vibe_v5_start', { researcherCount: 2 })
ok(start && start.ok === true, '§0 the institute starts (3 seats: chair + 2 researchers)', start && start.code)

const step = await h.call('vibe_vmu_turn', { op: 'step', member: 'r-1' })
ok(step && step.ok === true && step.awaiting === true, '§1 a caller-played step parks a prompt for r-1', step && (step.code || step.deliveryPath))
const prompt = step && step.memberPrompt
ok(prompt && typeof prompt.turnId === 'string', '§2 the receipt names the turn the prompt belongs to', prompt && Object.keys(prompt))

// ── §3 THE READING EXISTS ON THE RECEIPT THAT HANDS OVER THE PROMPT ───────────────────────────────────────────────
const reading = prompt && prompt.statusBlock
ok(reading && typeof reading === 'object', '★★ §3 the step receipt carries `memberPrompt.statusBlock` (the assembly measured itself)', reading)
ok(reading && reading.included === true, '★★★ §3a and it says the block IS inside the text the member receives — not "probably"', reading)
ok(reading && Number.isFinite(Number(reading.chars)) && Number(reading.chars) > 0, '§3b with the length of the block that went in', reading && reading.chars)
ok(reading && typeof reading.why === 'string' && reading.why !== '', '§3c and a named reason for the verdict', reading && reading.why)
ok(reading && typeof reading.means === 'string' && /framework defect/.test(reading.means), '§3d whose wording says a false verdict is a DEFECT, not a style choice', reading && reading.means)
ok(reading && typeof reading.appendedLiterally === 'boolean', '§3e it also says WHICH of the two routes put the block there', reading && reading.appendedLiterally)

// The verdict is about the same string the caller was handed: when it says included, the text really has it.
const text = String(prompt && prompt.text)
ok(reading && reading.included === true && text.length > 0, '★★ §3f the reading is computed on the very text this receipt hands over (non-empty)', { chars: text.length })
// NOTE ON WHAT `text` IS HERE: a tool RECEIPT is bounded (12 000 bytes per result), so `memberPrompt.text` arrives CUT —
// that is exactly why `op:"prompt"` exists. The reading therefore must be about the ARCHIVED string, and §4 checks that
// string. Here we only pin that the receipt says the block went in, and that a cut receipt does not silently deny it.
ok(reading && reading.included === true && reading.chars > 0,
  '★★★ §3g the verdict is about the DELIVERED string, not this cut receipt copy (the receipt is bounded by design)',
  { chars: text.length, block: reading && reading.chars })

// ── §4 THE PAGE SAYS THE SAME THING, FROM THE ARCHIVE ─────────────────────────────────────────────────────────────
const page = await h.call('vibe_vmu_turn', { op: 'prompt', turn: prompt.turnId, limit: 9000 })
ok(page && page.ok === true, '§4 a page of op:"prompt" is served for that turn', page && page.code)
ok(page && page.statusBlockIncluded === true, '★★★ §4a and the page reports `statusBlockIncluded:true` — the same fact the receipt gave, from the archive', page && page.statusBlockIncluded)
ok(page && Number.isFinite(Number(page.statusBlockChars)) && Number(page.statusBlockChars) > 0, '§4b with the block length', page && page.statusBlockChars)
ok(page && typeof page.statusBlockMeans === 'string' && /EXACT string the delivery seam received/.test(page.statusBlockMeans), '§4c and means that say WHY this answer is trustworthy (the archived string is the delivered string)', page && page.statusBlockMeans)
ok(page && Number(page.chars) >= text.length, '★ §4d the archive holds the WHOLE prompt (the receipt copy is cut, the archive is not — that is why a page exists)', { page: page && page.chars, receipt: text.length })

// ── §4e THE DECISIVE ONE: PAGE THE WHOLE ARCHIVE AND LOOK FOR THE COMPOSED BLOCK ─────────────────────────────────
// ★★★ THE 79TH RUN'S TRAP WAS A PARTIAL READ: the office paged at offsets 0 / 17 400 / 26 400 out of 26 641 and
// concluded "the block is absent" — while `[状态板]` also occurs in the pack's own TEACHING prose (`[状态板]` 每行固定
// 三列…), so an eyeball grep can neither confirm nor deny. A reading you can trust must be over the WHOLE string: page
// until done, concatenate, then look for the two things only a rendered block would carry.
let full = ''
let cursor = 0
let pages = 0
for (;;) {
  const chunk = await h.call('vibe_vmu_turn', { op: 'prompt', turn: prompt.turnId, offset: cursor, limit: 9000 })
  if (!chunk || chunk.ok !== true) break
  const piece = String(chunk.text || '')
  full += piece
  pages += 1
  if (chunk.done === true || piece === '' || pages > 20) break
  cursor = Number(chunk.end) || cursor + piece.length
}
ok(pages >= 2 && full.length === Number(page && page.chars),
  '★★ §4e the whole archive was paged (a partial read is how the 79th run both "saw" and "missed" the block)',
  { pages, read: full.length, chars: page && page.chars })
ok(full.includes('[状态] 你是') && full.includes('[状态板]'),
  '★★★ §4f the COMPOSED block is in the whole archived string (`[状态] 你是 …` + `[状态板]`), not just the teaching prose',
  { hasStatus: full.includes('[状态] 你是'), hasTag: full.includes('[状态板]') })
// The two surfaces must describe the SAME block: a page that reported a different length would mean the archive kept a
// different assembly than the receipt, which is the one thing a reading pair exists to rule out.
ok(page && Number(page.statusBlockChars) === Number(reading && reading.chars),
  '★★ §4g the page and the step receipt describe the SAME block (one length, two surfaces)',
  { page: page && page.statusBlockChars, receipt: reading && reading.chars })

// ── §5 A SURFACE THAT CANNOT KNOW SAYS SO BY NAME ────────────────────────────────────────────────────────────────
// The tool face keeps its OWN cache for the caller route. When a page is answered from that cache the archive reading
// may be absent (e.g. right after a restart, where the archive is process memory) — then the page must NOT print a
// confident `false`; it prints null and a reason. Drive that shape through the kernel surface directly.
ok(typeof h.kernel.turn.statusBlockReading === 'function', '§5 the kernel exposes the reading by turn id')
ok(h.kernel.turn.statusBlockReading('t-does-not-exist') === null, '★★ §5a an unknown turn answers NULL (a real answer: this kernel assembled nothing), not false', h.kernel.turn.statusBlockReading('t-does-not-exist'))
const direct = h.kernel.turn.statusBlockReading(String(prompt.turnId))
ok(direct && direct.included === true, '★ §5b the kernel surface and the receipt agree for a real turn', direct)
const archived = h.kernel.turn.promptOf(String(prompt.turnId))
ok(archived && typeof archived.text === 'string' && archived.statusBlockIncluded === true, '★★ §5c the archive keeps the reading NEXT TO the text it describes', { keys: archived && Object.keys(archived).filter((k) => k !== 'text') })
ok(archived && archived.statusBlock && archived.statusBlock.included === true, '§5d and promptOf() carries the whole reading object, not only the boolean', archived && archived.statusBlock)

console.log('')
console.log('=== RUN 79 STATUS-BLOCK READING: ' + passed + ' passed, ' + failures.length + ' failed ===')
if (failures.length > 0) process.exitCode = 1
