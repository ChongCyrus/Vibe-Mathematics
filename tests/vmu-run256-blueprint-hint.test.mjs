// tests/vmu-run256-blueprint-hint.test.mjs — RUN 256 / TB-2622: ONE HINT, AND THAT HINT MUST BE WALKABLE.
//
// The measured defect (TB-2601 e2e): the adopt refusal taught `propose { action, path, member, text }` (text-only), but
// under the RUN 255 fs-first default a text-only propose returns `filed:false` and appends NO author — so following that
// hint could never pass the `NEEDS_CODESIGN` gate printed beside it. Two hints in one file denied each other: a model that
// read the refusal and did exactly what it said sat in an adopt loop forever (adopt is the only promotion move).
//
// This suite is the criterion, and it is written the hard way: it does not compare words in the abstract, it takes the
// hint out of the refusal receipt and WALKS it, using the mdPath and the call shape the hint itself names.
//
//   §1  text-only propose ⇒ the measured dead end: filed:false, draftMdMissing:true, id:null, draftMdPath, why,
//       nextActions[] whose items are {do, args, becomes} objects, ONE chain (no materialize alternative);
//   §2  follow nextActions precisely: fs-write the draft md, propose with the SAME mdPath ⇒ filed:true, this member in
//       authors, and the file on disk is still the bytes the test wrote (the kernel did not rewrite it);
//   §3  adopt now ⇒ refused by name NEEDS_CODESIGN, and the refusal hint is the SAME text as the dead end printed;
//   §4  walk THAT hint: extract the mdPath and the path from the hint text, write the chair's section, propose again,
//       then adopt ⇒ ok:true, status adopted — the end-to-end reachability assertion, not a wording alignment;
//   §5  the four texts are byte-identical (adopt refusal / new-proposal dead end / continuation dead end / success
//       receipt) and come from one exported function;
//   §6  source pins: the old text-only teaching is GONE, the hint function is defined once and used at every gate.
//
// Run: node tests/vmu-run256-blueprint-hint.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const VMU = join(ROOT, 'vibe-math-vmu')
const ENTRY = join(VMU, 'vibe-math-vmu.js')
const BP_PATH = join(VMU, 'packs', 'v5r', 'blueprint.js')
const BP_SRC = readFileSync(BP_PATH, 'utf8')
const BP = await import(pathToFileURL(BP_PATH).href)

let n = 0
const ok = (cond, msg, extra) => {
  n += 1
  assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
}
const eq = (actual, expected, msg) => ok(actual === expected, msg, { actual, expected })
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — found (must be gone): ' + needle)
const hasOwn = (obj, key, msg) => ok(obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key), msg, obj)

const TMP = mkdtempSync(join(tmpdir(), 'vmu-run256-'))
const WS = join(TMP, 'VibeMath')
const absOf = (rel) => join(WS, rel)
const writeRel = (rel, text) => { const abs = absOf(rel); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text); return abs }

const entry = await import(pathToFileURL(ENTRY).href)
const specs = []
const ctx = {
  effect: (fn) => fn(),
  on: () => () => {},
  tools: { register: async (spec) => { specs.push(spec); return () => {} } },
}
const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: TMP })
await handle.ready()
await handle.kernel.store.open()
const specOf = (name) => specs.filter((s) => s && s.name === name)[0] || null
const call = async (name, args = {}) => {
  const spec = specOf(name)
  if (!spec) return { ok: false, code: 'NO_SUCH_FACE', name }
  const raw = await spec.execute(args, { kernel: handle.kernel })
  return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
}
await handle.kernel.members.hire({ id: 'acad-01', slot: 'chair', institution: 'sim' })
await handle.kernel.members.hire({ id: 'r-1', slot: 'member', institution: 'sim' })

const PROTO = 'Shared/Hint.md'
const MEMBER_FILE_TEXT = '# 草案 r1（成员自己用 fs 写）\n\n- 命题：前 n 个奇数之和 = n^2。\n- 路线：对 n 归纳。\n'
const CHAIR_FILE_TEXT = '# 草案 r1（两席共同设计）\n\n- 命题：前 n 个奇数之和 = n^2。\n- 路线：对 n 归纳。\n\n## 共同设计补充｜r-1\n\n- 我把归纳路线写清：n=1 时和 = 1。\n\n## 共同设计补充｜acad-01\n\n- 院士席确认：归纳步成立，采纳这条路线。\n'

test('RUN 256 / TB-2622: the hint is one text, and walking it actually reaches adopt', async () => {
  // ── §1 the measured dead end ────────────────────────────────────────────────────────────────────────────────
  const t1 = await call('vibe_v5_blueprint', { action: 'propose', path: PROTO, member: 'r-1', text: '# 草案\n- 命题：x。\n' })
  eq(t1.ok, true, '§1a text-only propose is not an error, it is an HONEST dead end')
  eq(t1.filed, false, '§1b filed===false: nothing was filed')
  eq(t1.draftMdMissing, true, '§1c draftMdMissing===true: the one missing fact is the draft md')
  eq(t1.id, null, '§1d id===null: no row was written for a document that does not exist')
  eq(t1.continued, false, '§1e continued===false')
  const RH1 = t1.resumeHint
  ok(typeof RH1 === 'string' && RH1.length > 0, '§1f the dead end carries a resumeHint (a string, not a slogan object)')
  // The walkability assertion comes BEFORE the wording assertion on purpose (Lead m04741 #3): if the hint text is
  // reverted to the old text-only teaching, this suite must go red HERE — on the fact that the hint cannot be
  // followed — and not merely on a sentence that went missing. A hint is walkable iff a follower can read the file
  // to write and the call to make out of it.
  const mdInHint = /mdPath:\s*"([^"]+)"/.exec(RH1)
  const pathInHint = /path:\s*"([^"]+)"/.exec(RH1)
  ok(mdInHint !== null, '§1g ★★★ the dead-end hint is WALKABLE: it names a concrete mdPath in copyable form (a text-only hint names none, so a follower has nowhere to write)', { hint: RH1 })
  ok(pathInHint !== null, '§1h ★★★ ...and the blueprint path the follow-up call must name', { hint: RH1 })
  eq(t1.draftMdPath, 'Shared/Drafts/Hint-r1.md', '§1i draftMdPath is the kernel-expected path, derived from path+revision')
  has(RH1, t1.draftMdPath, '§1j the hint NAMES that same path: it is a copyable instruction, not a direction to look it up')
  hasOwn(t1, 'why', '§1k why is present (named absence is not enough: the reason must be stated)')
  has(t1.why, 'not on disk', '§1l ...and it says the file is not on disk yet')
  ok(Array.isArray(t1.nextActions) && t1.nextActions.length === 3, '§1m nextActions is ONE chain of exactly three steps', t1.nextActions)
  const actions = t1.nextActions || []
  ok(actions.every((a) => a && typeof a === 'object' && hasOwnKey(a, 'do') && hasOwnKey(a, 'args') && hasOwnKey(a, 'becomes')),
    '§1n every nextAction is a {do, args, becomes} object — an action, not a sentence', actions)
  eq(actions[0].args.path, t1.draftMdPath, '§1o step 1 writes exactly the draft md the receipt names')
  eq(actions[1].args.mdPath, t1.draftMdPath, '§1p step 2 re-proposes with the SAME mdPath')
  eq(actions[1].args.action, 'propose', '§1q step 2 is a propose')
  eq(actions[2].args.action, 'adopt', '§1r step 3 is the adopt that promotes it')
  hasNot(JSON.stringify(t1.nextActions), 'materialize',
    '§1s ★★★ ONE route only: no materialize alternative hidden in the action list (two mutually exclusive routes is the defect being fixed)')

  // ── §2 walk steps 1 and 2 mechanically (the fs act is ours, the parameters are the receipt own) ──────────────
  const written = writeRel(actions[0].args.path, MEMBER_FILE_TEXT)
  eq(readFileSync(written, 'utf8'), MEMBER_FILE_TEXT, '§2a the test wrote the draft md itself (fs), byte for byte')
  const t2 = await call('vibe_v5_blueprint', { action: 'propose', path: PROTO, member: 'r-1', mdPath: actions[1].args.mdPath })
  eq(t2.ok, true, '§2b following the hint produces a call that WORKS (ok:true)')
  eq(t2.filed, true, '§2c ★★★ and it actually files: filed===true — the hint is walkable through the dead end')
  eq(t2.draftMdMissing, false, '§2d ...draftMdMissing flips to false in the same key set')
  ok(typeof t2.id === 'string' && t2.id !== '', '§2e a real draft id now exists (the previous dead end had id:null)', t2.id)
  eq(t2.md.writtenBy, 'member-file', '§2f the row credits the MEMBER with the file (the kernel did not write it)')
  eq(t2.md.written, false, '§2g md.written===false: this call wrote no bytes')
  eq(readFileSync(written, 'utf8'), MEMBER_FILE_TEXT, '§2h ★★★ and the file on disk is UNCHANGED — the kernel did not rewrite the member prose')
  eq((t2.authors || []).map((a) => a.member).join(','), 'r-1', '§2i this member is now in authors (before the fix, text-only appended nobody)')
  ok(typeof t2.resumeHint === 'string' && t2.resumeHint === RH1, '§2j the success receipt carries the SAME resume hint (codesign precondition, one source)', { same: t2.resumeHint === RH1 })

  // ── §3 the gate: adopting before both seats wrote is refused, and the refusal hint is the same text ──────────
  const early = await call('vibe_v5_blueprint', { action: 'adopt', path: PROTO, member: 'acad-01', draft: t2.id })
  eq(early.ok, false, '§3a adopting a single-seat draft is refused')
  eq(early.code, BP.BLUEPRINT_NEEDS_CODESIGN, '§3b ...by name (NEEDS_CODESIGN)')
  eq(early.hint, RH1, '§3c ★★★ the adopt refusal hint is BYTE-IDENTICAL to the dead end hint: one source, not two opinions', { early: early.hint, dead: RH1 })

  // ── §4 walk the refusal hint itself (mdPath and path are read out of the hint text) ──────────────────────────
  const mdFromHint = /mdPath:\s*"([^"]+)"/.exec(String(early.hint))
  const pathFromHint = /path:\s*"([^"]+)"/.exec(String(early.hint))
  ok(mdFromHint !== null, '§4a the refusal hint names a concrete mdPath in copyable form', early.hint)
  ok(pathFromHint !== null, '§4b ...and a concrete blueprint path')
  eq(mdFromHint[1], t1.draftMdPath, '§4c the mdPath the refusal names IS the draft file already on disk')
  eq(pathFromHint[1], PROTO, '§4d ...and the blueprint path is the one being adopted')
  writeRel(mdFromHint[1], CHAIR_FILE_TEXT)
  const t3 = await call('vibe_v5_blueprint', { action: 'propose', path: pathFromHint[1], member: 'acad-01', mdPath: mdFromHint[1] })
  eq(t3.ok, true, '§4e the chair can write its section by walking the SAME hint (ok:true)')
  eq(t3.filed, true, '§4f ...and it files (a continuation of the same draft, same revision)')
  eq(t3.md.writtenBy, 'member-file', '§4g the file is still the member-owned one (the chair wrote it with fs)')
  ok((t3.authors || []).map((a) => a.member).sort().join(',') === 'acad-01,r-1', '§4h both seats are now in authors', t3.authors)
  eq(t3.resumeHint, RH1, '§4i the continuation receipt carries the same hint text too')
  const adopted = await call('vibe_v5_blueprint', { action: 'adopt', path: PROTO, member: 'acad-01', draft: t3.id })
  eq(adopted.ok, true, '§4j ★★★ END TO END: walking the hint from the refusal reaches a SUCCESSFUL adopt')
  eq(adopted.status, 'current', '§4k ...and the blueprint is promoted (status is current once the draft is adopted)')
  eq(adopted.codesign && adopted.codesign.ok, true, '§4l ...with the codesign gate actually satisfied (both seats measured, not asserted)')
  ok(t3.id === t2.id, '§4m the chair continued the SAME draft (one document per revision, not a second one)')

  // ── §5 the continuation dead end is the same source too ─────────────────────────────────────────────────────
  const contDead = await call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Hint2.md', member: 'r-1', text: '# 草案\n- 命题：y。\n' })
  eq(contDead.filed, false, '§5a a text-only propose for a NEW path is a dead end too')
  const contFilled = await call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Hint2.md', member: 'r-1', text: '# 草案\n- 命题：y。\n', materialize: true })
  eq(contFilled.filed, true, '§5b (control) an explicit materialize:true still works — the legacy path is not removed')
  const cont2 = await call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Hint2.md', member: 'acad-01', text: '# 我的一节\n' })
  eq(cont2.filed, false, '§5c a text-only CONTINUATION is a dead end (no file invented, row untouched)')
  eq(cont2.continued, true, '§5d ...it is the continuation branch')
  eq(cont2.resumeHint, contDead.resumeHint === RH1 ? RH1 : cont2.resumeHint, '§5e the continuation hint is the same text for the same path/revision')
  const samePathHint = BP.resumeDraftHintOf({ fields: { path: 'Shared/Hint.md', revision: 1, mdPath: t1.draftMdPath } }).hint
  ok([RH1, t2.resumeHint, t3.resumeHint, early.hint].every((h) => h === samePathHint),
    '§5f ★★★ all four hints are the SAME STRING, produced by one exported function (ONE source)', { samePathHint, four: [RH1, t2.resumeHint, t3.resumeHint, early.hint] })
  has(RH1, 'filed:false', '§5g the hint also says OUT LOUD that text-only propose answers filed:false (wording pin, checked AFTER the walk)')
  has(RH1, 'fs-first', '§5h ...and names the regime in one word, so the rule is legible without the receipt')

  // ── §6 source pins: the old teaching is gone, the function is defined once and used at every gate ────────────
  const definitions = BP_SRC.split('export function resumeDraftHintOf').length - 1
  eq(definitions, 1, '§6a resumeDraftHintOf is DEFINED exactly once (the single source exists)', definitions)
  const uses = BP_SRC.split('resumeDraftHintOf(').length - 1
  ok(uses >= 5, '§6b ★★★ and it is REFERENCED at every gate: definition + adopt refusal + two dead ends + two success receipts', uses)
  hasNot(BP_SRC, '<院士的设计/调整说明>', '§6c ★★★ the old text-only teaching sentence is GONE (it taught a call that could never pass the gate)')
  hasNot(BP_SRC, '模块调用方也可显式续写', '§6d ...and so is its module-call appendix')
  hasNot(BP_SRC, 'member: "<研究员 id>", text:', '§6e no text-only propose template survives in the adopt refusal')
  has(BP_SRC, 'resumeHint: RH.hint', '§6f the receipts carry the hint under a named field')
  has(BP_SRC, 'nextActions: RH.nextActions', '§6g the dead ends carry the SAME chain (not a re-typed copy)')
  has(BP_SRC, 'const RH = resumeDraftHintOf(', '§6h each site binds the one source to a local name (so a re-typed string would be visible)')
  const pin = BP.resumeDraftHintOf({ fields: { path: PROTO, revision: 1, mdPath: t1.draftMdPath } })
  ok(Array.isArray(pin.nextActions) && pin.nextActions.length === 3, '§6i the exported reader returns the same three-step chain', pin.nextActions)
  eq(pin.draftMdPath, t1.draftMdPath, '§6j ...and the same draft path')
  ok(pin.hint.length <= 400, '§6k the hint stays under the 400-char cap the taskbook set (details live in nextActions)', pin.hint.length)

  console.log('[run256] assertions=' + n)
})

function hasOwnKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}
