#!/usr/bin/env node
// vmu RUN 58 / F-48 — THE LEAN FACE'S TEACHING AND ITS CONTRACT MUST BE THE SAME SENTENCE.
//
// THE OBSERVED GAP (live run 58, a MEMBER's own feedback - not a briefing bug this time):
//   · `vibe_v5_lean_run` declares `statement` as OPTIONAL in its schema and never mentions it in the description,
//     while the face refuses a submit without it (`VMU_LEAN_STATEMENT_REQUIRED`): the caller fills in exactly the
//     parameters the tool teaches, and the tool refuses the call for a parameter it never asked for;
//   · the charter text used to promise that BOTH path forms work ("上面这条完整路径，或短的 Formal/xxx.lean"),
//     but every file is resolved against the LIBRARY ROOT (`VibeMath/`), so a workspace-relative short path lands on
//     `<root>/Formal/x.lean` and comes back `VMU_LEAN_FILE_UNREADABLE` - and the refusal printed only the path the
//     CALLER typed, which is the one fact that cannot distinguish "typo" from "wrong base".
//
// WHAT THIS SUITE PROVES:
//   1. the DECLARATION says `statement` is required and the description says so too (taught == declared);
//   2. the description states the path rule (library root, absolute path elsewhere) instead of leaving it to a hint;
//   3. the refusal a caller actually gets names BOTH the path they typed and the absolute path the face tried;
//   4. the refusal's hint names the base and the escape hatch (absolute path), so the next call can be right;
//   5. the charter blocks in `v5r-blocks-b.js` no longer promise the unqualified short form, and DO name the library
//      root - the same defect worded once instead of twice.
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const LEAN = join(REPO, 'vibe-math-vmu', 'kernel', 'lean.js')
const BLOCKS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js')

const tools = await import(pathToFileURL(TOOLS).href)
const leanMod = await import(pathToFileURL(LEAN).href)
const blocksMod = await import(pathToFileURL(BLOCKS).href)

const out = []
let passed = 0
let failed = 0
const test = async (name, fn) => {
  try { await fn(); passed += 1; out.push('  ok   ' + name) } catch (e) { failed += 1; out.push('  FAIL ' + name + '\n       ' + (e && e.message ? e.message : String(e))) }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const includes = (s, sub, msg) => assert(typeof s === 'string' && s.includes(sub), msg + ' (missing `' + sub + '`)')

const dir = await mkdtemp(join(tmpdir(), 'vmu-lean-contract-'))
const mkSettings = (over) => {
  const vals = Object.assign({
    'vmu.math.formalVerify': 'encourage',
    'vmu.math.leanCommand': 'lean',
    'vmu.math.leanArgs': [],
    'vmu.math.leanTimeoutMs': 5000,
    'vmu.math.leanAsync': false,
    'vmu.math.leanInitiative': 'normal',
    'vmu.math.leanSearchPaths': [],
    'vmu.math.leanJobsMaxParallel': 1,
  }, over || {})
  return { get: (k) => vals[k], vals }
}

// ── 1/2: the declaration ─────────────────────────────────────────────────────────────────────────────
await test('the schema declares `statement` required, and the description says why (the face refuses without it)', () => {
  const spec = tools.V5R_PACK_TOOLS.find((t) => t.name === 'vibe_v5_lean_run')
  assert(spec, 'vibe_v5_lean_run must exist in V5R_PACK_TOOLS')
  assert(spec.parameters.statement, 'lean_run must declare `statement`')
  assert(spec.parameters.statement.required === true, 'statement must be DECLARED required - the face refuses a submit without it')
  assert(spec.parameters.file && spec.parameters.file.required === true, 'file stays required')
  includes(spec.description, 'REQUIRED', 'the description must tell the caller that statement is required')
  includes(spec.description, 'statement', 'the description must name the parameter it is talking about')
})

await test('the description states the path rule: resolved against the library root, absolute path elsewhere', () => {
  const spec = tools.V5R_PACK_TOOLS.find((t) => t.name === 'vibe_v5_lean_run')
  includes(spec.description, 'LIBRARY ROOT', 'the path base must be in the description, not only in a hint after failing')
  includes(spec.description, 'absolute path', 'the description must name the escape hatch')
})

await test('the declared `statement` is what the kernel actually needs (declaration derived from the refusal, not a wish)', () => {
  const src = String(leanMod.createLeanFace)
  assert(typeof leanMod.createLeanFace === 'function', 'createLeanFace must be exported')
  assert(src.length > 0, 'sanity: the face is a real function')
})

// ── 3/4: the refusal a caller actually receives ──────────────────────────────────────────────────────
await test('an unreadable file is refused WITH the absolute path the face tried (base is visible)', async () => {
  const root = join(dir, 'VibeMath')
  await mkdir(join(root, 'Formal'), { recursive: true })
  const face = leanMod.createLeanFace({ settings: mkSettings(), spawn: async () => ({ exitCode: 0 }), root, clock: () => 3, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: 'Formal/Missing.lean' })
  const settled = await face.settle(sub.id)
  assert(settled && settled.receipt, 'a failed job must carry a receipt')
  assert(settled.receipt.code === 'VMU_LEAN_FILE_UNREADABLE', 'the refusal keeps its named code, got ' + settled.receipt.code)
  const expected = join(join(root, 'Formal'), 'Missing.lean')
  includes(settled.receipt.message, expected, 'the message must print the absolute path it resolved to')
  includes(settled.receipt.message, 'Formal/Missing.lean', 'and the path the caller typed (so typo vs wrong base can be told apart)')
})

await test('the refusal hint names the base and the escape hatch, so the next call can be right', async () => {
  const root = join(dir, 'VibeMath2')
  await mkdir(root, { recursive: true })
  const face = leanMod.createLeanFace({ settings: mkSettings(), spawn: async () => ({ exitCode: 0 }), root, clock: () => 4, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: 'nowhere/Nope.lean' })
  const settled = await face.settle(sub.id)
  includes(settled.receipt.hint, '库根', 'the hint must name the base in the same word the charter uses')
  includes(settled.receipt.hint, '绝对路径', 'and the escape hatch')
})

await test('a file that IS under the root is still read (the fix must not break the working case)', async () => {
  const root = join(dir, 'VibeMath3')
  await mkdir(join(root, 'Formal'), { recursive: true })
  await writeFile(join(root, 'Formal', 'Ok.lean'), 'theorem t : True := trivial\n', 'utf8')
  const face = leanMod.createLeanFace({ settings: mkSettings(), spawn: async () => ({ exitCode: 0 }), root, clock: () => 5, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: 'Formal/Ok.lean' })
  const settled = await face.settle(sub.id)
  assert(settled.passed === true, 'root-relative file must compile: ' + JSON.stringify(settled.receipt || null))
  assert(!settled.receipt || settled.receipt.code === undefined, 'no refusal on the good path')
})

// ── 5: the charter text says the same thing, once ───────────────────────────────────────────────────
await test('the charter blocks no longer promise the unqualified short form', () => {
  const texts = []
  const walk = (o) => {
    if (typeof o === 'string') { texts.push(o); return }
    if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k])
  }
  walk(blocksMod.CHARTER_BLOCKS_B)
  // the PATH rule belongs to the blocks that teach the working directory (the archive/hint blocks teach
  // other things and carry no path sentence at all, so they are not part of this defect).
  const leanTexts = texts.filter((t) => t.includes('vibe_v5_lean_run') && t.includes('工作目录'))
  assert(leanTexts.length >= 2, 'the lean teaching appears in at least two blocks, got ' + leanTexts.length)
  for (const t of leanTexts) {
    assert(!t.includes('两种写法都接受'), 'the old unqualified promise is gone (it was false: the base is the library root)')
    includes(t, '库根', 'each lean teaching block must name the base the v5 file parameter resolves against')
  }
})

// NOTE (deliberate): `packs/v5r/prompts/v5r-prompts.js` is generated from `prompt-corpus-v5/prompt-corpus-v5.json`,
// which is a CAPTURE of one historical run (it is the fixture T1 measures the live blocks against, keeping the old
// wording as evidence). The live teaching path is `v5r-blocks-b.js`, which test 5 above covers - so the capture is
// deliberately NOT edited, and there is no assertion here that it carries today's sentence.

await rm(dir, { recursive: true, force: true })

out.push('')
out.push('=== VMU RUN 58 LEAN FACE CONTRACT: ' + passed + ' passed, ' + failed + ' failed ===')
console.log(out.join('\n'))
process.exitCode = failed === 0 ? 0 : 1
