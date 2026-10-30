#!/usr/bin/env node
// vmu RUN 143 / AUDIT11 C1+C2 — TWO CATALOGUE LINES TOLD A MEMBER TO WRITE A FILE THE FACE NEVER WRITES,
// AND THE ONE "COPY ME" SAMPLE IN THE FULL CATALOGUE COULD NOT BE COPIED.
//
// MEASURED DEFECTS (audit11, `D:/_tmp/g7a11/audit11.md` §2):
//   · C1: the reply field `progress` said 「追加到 Progress/」, but its owner face is `vmu.records.put`
//     (`FIELD_OWNERS.progress` = {face:'vmu.records', op:'put'}, kernel/records.js) — a LEDGER row, no file at all.
//     The file under `Members/<member>/Progress/<track>.md` is written by the OTHER field, `record`
//     (kernel/library.js:427 via recordLogArgs). A member following the catalogue wrote the ledger and then went
//     looking for a file that was never created; the same file promise stood in the charter-context block
//     (`v5r-blocks-a.js`) and in `vibe_v5_record_progress`'s own description (`track picks the file`).
//   · C2: the full catalogue's only "最小合法 report 样例（可直接照抄）" printed `"progress":"…"` (a STRING), while
//     `vmu.records.put` destructures its payload — a string yields `track: undefined` and the WHOLE TURN dies with
//     `VMU_INVALID_ARGUMENT`. The true shape is an object `{track,title,body}` (composeRecordPut fills `kind` from a
//     kind-track and `by` from the turn's member). A "copy me" sample that cannot be copied is the worst kind of
//     teaching: it is the one line a member is explicitly told to type.
//
// WHAT THIS SUITE PROVES:
//   1. no ledger-owned reply row promises a `Progress/` file any more, and the `progress` row names the ledger;
//   2. the `record` row still names the only file-writing field, so the two rows cannot be confused;
//   3. the full catalogue's sample PARSES and its `progress` is an OBJECT with track/title/body;
//   4. the charter-context sentence points at the log field, not at a `Progress/` path;
//   5. the `vibe_v5_record_progress` declaration says LEDGER and does not say "picks the file";
//   6. the compact catalogue carries the truth (the rendered member prompt is measured by vmu-turn's T99; this suite
//      only asserts the catalogue text itself, because the budget is paid in that suite and must not drift silently).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const REPLY_CHANNEL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')).href
const TURN_MODULE = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}

const decl = await import(REPLY_CHANNEL)
const kernelTurn = await import(TURN_MODULE)
const { REPLY_FIELD_ROWS, replyCatalogueLines } = decl
const { RECORD_LOG_MEANS, recordLogArgs } = kernelTurn

const SRC = (rel) => readFileSync(join(REPO, rel), 'utf8')
const row = (field) => REPLY_FIELD_ROWS.find((r) => r.field === field)

// ── 1/2: the two rows that used to be confusable ─────────────────────────────────────────────────────
ok(row('progress') !== undefined, '§1a. the `progress` row exists')
ok(row('progress').face === 'vmu.records' && row('progress').op === 'put',
  '§1b. progress is dispatched to the LEDGER face (vmu.records.put)', row('progress').face + '.' + row('progress').op)
ok(!row('progress').note.includes('追加到 Progress/'), '§1c. the old 「追加到 Progress/」 promise is gone', row('progress').note)
ok(row('progress').note.includes('不是 `Progress/` 文件'), '§1d. the only Progress/ mention in the progress note is the NEGATION (it says the ledger row is not a file)', row('progress').note)
ok(row('progress').note.includes('账本'), '§1e. the progress note says it is a LEDGER row', row('progress').note)
ok(row('progress').note.includes('record'), '§1f. the progress note points at the field that DOES write a file')
ok(row('progress').note.includes('{track,title,body}'), '§1g. the progress note states the object shape the face destructures', row('progress').note)

ok(row('record').face === 'vmu.library' && row('record').op === 'record', '§2a. record is dispatched to vmu.library.record')
ok(row('record').note.includes('Members/<你>/Progress/<track>.md'), '§2b. the record note names the real file it appends to', row('record').note)
ok(RECORD_LOG_MEANS.includes('Members/<member>/Progress/<track>.md'), '§2c. the means text names the same file')
const offenders = REPLY_FIELD_ROWS.filter((r) => r.face === 'vmu.records' && /追加到\s*Progress\//.test(String(r.note)))
ok(offenders.length === 0, '§2d. NO ledger-owned reply row may PROMISE a Progress/ file (「追加到 Progress/」)', offenders.map((r) => r.field))

// ── 3: every "copy me" sample in the full catalogue must be legal JSON with the legal shapes ─────────
const full = replyCatalogueLines({ mode: 'full' }).join('\n')
const m = full.match(/样例（可直接照抄）：`(\{[^\n]*?\})`/)
ok(m !== null, '§3a. the full catalogue still shows a copy-me sample')
let parsed = null
try { parsed = m && JSON.parse(m[1]) } catch (e) { ok(false, '§3b. the copy-me sample must be legal JSON: ' + e.message, m && m[1]) }
ok(parsed !== null && typeof parsed === 'object', '§3b. the copy-me sample parses as a JSON object', m && m[1])
if (parsed && parsed.progress !== undefined) {
  ok(typeof parsed.progress === 'object' && parsed.progress !== null && !Array.isArray(parsed.progress),
    '§3c. progress must be an OBJECT for vmu.records.put (a string makes the whole turn fail)', parsed.progress)
  ok(typeof parsed.progress.track === 'string', '§3d. the sample names the track')
  ok(typeof parsed.progress.body === 'string', '§3e. the sample gives the body the ledger stores')
}
const stringProgress = (full.match(/"progress":"…"/g) || []).length
ok(stringProgress === 1 && full.indexOf('"progress":"…"') > full.indexOf('旧写法不要再照抄'),
  '§3f. the only remaining string-progress text is the OLD shape being named as WRONG (旧写法不要再照抄), got ' + stringProgress + ' occurrence(s)')

const good = recordLogArgs({ track: 'progress', text: '本轮结论' }, 'r-1', ['progress', 'routes'])
ok(good.ok === true, '§3g. the `record` adapter accepts a legal payload', good)
ok(good.ok === true && good.args[0] === 'r-1' && good.args[2] === '本轮结论', '§3h. the adapter supplies the member and the real argument order', good.args)
const bad = recordLogArgs('本轮结论', 'r-1', ['progress'])
ok(bad.ok !== true && bad.code === 'VMU_RECORD_SHAPE', '§3i. a non-object record payload is refused BY NAME with VMU_RECORD_SHAPE', bad)

// ── 4: the charter-context sentence (compression advice) ─────────────────────────────────────────────
const blocksA = SRC('vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js')
const blockStart = blocksA.indexOf("name: 'v5r-charter-context'")
ok(blockStart > 0, '§4a. the charter-context block is findable')
const ctxBlock = blockStart > 0 ? blocksA.slice(blockStart, blockStart + 1600) : ''
// The compression sentence is CAPTURED prose (vmu-turn's T71 requires it verbatim), and it is TRUE at the file
// level: `Members/<你>/Progress/<track>.md` really is written by the `record` field. The false claim was the REPLY
// ROW that said the `progress` FIELD appends there — that is what §1 pins. This section only keeps the pair straight.
ok(/写进你自己的 Progress\//.test(ctxBlock), '§4b. the captured compression sentence is still verbatim (T71 parity depends on it)')
ok(row('record').note.includes('Members/<你>/Progress/<track>.md'), '§4c. the file that sentence names is reachable through the `record` field')

// ── 5: the tool declaration must not say "picks the file" ────────────────────────────────────────────
const toolsSrc = SRC('vibe-math-vmu/packs/v5r/tools.js')
ok(!toolsSrc.includes('track picks the file'), '§5a. the old 「track picks the file」 wording is gone')
ok(toolsSrc.includes('track picks the TRACK in the LEDGER (vmu.records), NOT a Progress/ file'), '§5b. the declaration names the ledger and denies the file')
ok(toolsSrc.includes('the Files under Members/<you>/Progress/<track>.md are written by the reply `record` field'),
  '§5c. and names the field that really writes that file')

// ── 6: the catalogue the DEFAAULT deployment renders carries no file promise ─────────────────────────
const compact = replyCatalogueLines({ mode: 'compact' }).join('\n')
ok(compact.length > 0, '§6a. the compact catalogue renders')
ok(!/追加到\s*Progress\//.test(compact), '§6b. the compact catalogue carries no 「追加到 Progress/」 promise (both file promises lived here)')
ok(compact.includes('账本'), '§6c. and it carries the ledger truth instead')
ok(compact.includes('{track,title,body}'), '§6d. and the object shape the ledger face destructures')

console.log('')
console.log('=== VMU RUN 143 PROGRESS TRUTH: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
