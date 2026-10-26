// audit-prompt-tool-names — ★ A PACK'S PROMPT MUST NOT TEACH A TOOL THAT DOES NOT EXIST.
//
// WHY THIS EXISTS (F2 of the phase-11 review classes, "prompts only covered 11 explicit call samples"). Two real defects
// this phase came from exactly this gap: the v5r prompts taught members to file a paper by writing reply FIELDS that a
// previous round had removed, and one passage said "it is not a tool, do not look for a tool of that name" about the very
// tool that had replaced them - backwards. Members followed the prompt, not the schema, and the wire refused them.
//
// ★ RUN 31 / task-18 — TWO BLIND SPOTS, BOTH CLOSED HERE.
//   ① The DECLARED UNIVERSE was derived by regex over ANY quoted `vibe_v5_*` string found in host/pack/tools sources, so a
//     name was "known" merely by being spelled somewhere - a dead name quoted in a pack source vouched for itself. It is
//     now derived from the DECLARATIONS: `host.js` (`TOOL_FACES` -> `toolSpecs`), `packs/v5r/tools.js` (`V5R_PACK_TOOLS`),
//     the pack's alias rows (`from:`), every declared parameter name, and the reply-field catalogue `FIELD_OWNERS` in
//     `kernel/turn/index.js`. Nothing here is a hand-written list of tools.
//   ② The NAME SHAPE was `vibe_v5_*` / `vibe_vmu_*`, so the names that actually leaked were invisible: measured on the
//     pre-fix corpus (commit 11f6be1b) the v5r prompts taught `math_computation`, a tool that only exists in
//     `archive/legacy-presets/vibe-math-v2/`. It has no `vibe_` prefix, so no version of this gate could see it. The new
//     rule (`nakedNameHits`) matches an identifier in a TOOL-MENTION SHAPE — backticked, followed by `{` (a call), in
//     parentheses, or right after a use-verb (调用/使用/call/use) — and requires it to be declared or to be known prompt
//     vocabulary. `math_computation` is caught in two of those shapes on the pre-fix corpus; that is the counterfactual
//     this file asserts, because "0 unknown" only means something when the predicate demonstrably fires.
//
// ★ WHAT IS DELIBERATELY NOT A VIOLATION, AND WHY:
//   · the generated corpus captures (`v5r-prompts.js`, `v5r-persona.js`, and any file carrying `SOURCE_SHA256`) are a
//     HISTORICAL RECORD — `tests/audit-prompt-retired-mechanisms.test.mjs` pins that contract in prose: a capture that is
//     rewriten is no longer a record, and `regen-all --check` would overwrite it anyway. Live teaching is repaired through
//     `packs/v5r/prompts/v5r-corrections.js`, whose passages must be free to NAME the retired mechanism they supersede.
//     That freedom is granted per-file by `NAKED_WHITELIST` below, one row per name, each with a reason and the run that
//     first found it, under a hard cap — a whitelist without a cap is how these tables turn into a bin.
//   · reply FIELDS (`say`, `task_create`, `propose_meeting`, …) are not tools; they are the payload keys of
//     `vibe_vmu_turn { op: "reply" }`, and `FIELD_OWNERS` is where the repository declares them. They are vocabulary here,
//     not tool names — the difference between "use the report field task_create" and "call the tool math_computation".
//
// WHAT IT DOES NOT CHECK (stated, not implied): it does not verify the PARAMETERS a passage teaches, only the names (that
// is `audit-prompt-tool-params`), and the naked rule only recognises the four mention shapes — a dead name buried in plain
// prose with none of them still escapes, which is the honest limit of a text predicate.
//
// AND THE "0 MISSING" RESULT IS ONLY WORTH ANYTHING IF THE PREDICATE CAN FIRE, so `--selftest` builds a tree whose prompt
// cites an invented tool in each shape and requires the scan to name it, and the main run re-scans the PRE-FIX corpus from
// git history and requires the real dead name to come back.

import { readdirSync, readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stripComments } from './_lib/strip-comments.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

/** ★ THE PRE-FIX BASELINE, named rather than "HEAD": HEAD moves, and a counterfactual that silently re-points itself at
 *  the repaired tree stops being a counterfactual. RUN 31 / task-18 found the dead names at this commit. */
const DEAD_NAME_BASELINE = '11f6be1b'

/** ★ A SCAN THAT ITERATES OVER A POSSIBLY-EMPTY LISTING CAN PASS VACUOUSLY, and RULE E in
 *  `audit-declaration-criterion` said so twice about this very file: first the `existsSync ? readdir : []` ternary, then
 *  a `for` whose iterable was `readdirSync(...)`. Both times it was right — an empty listing means the body never runs,
 *  so "0 missing" would mean "nothing was looked at", which is the false negative this gate exists to prevent. Every
 *  listing now goes through here and `mayBeEmpty` has to be SAID rather than assumed. */
const listing = (dir, { mayBeEmpty }) => {
  const names = readdirSync(dir)
  if (!mayBeEmpty && names.length === 0) throw new Error('refusing to scan nothing: ' + dir + ' is empty')
  return names
}

/**
 * ★ THE DECLARED UNIVERSE, FROM THE DECLARATIONS (see ① in the header). `buildCatalog()` is the same derivation
 * `scripts/check-task-brief.mjs` uses for brief validation — one entry point, two consumers, which is what the task asked
 * for: the prompt corpus and the brief corpus differ in prose, not in what a tool name is.
 */
export async function declaredNames({ repo = REPO } = {}) {
  const vmu = join(repo, 'vibe-math-vmu')
  let buildCatalog
  try {
    buildCatalog = (await import(pathToFileURL(join(repo, 'scripts', 'check-task-brief.mjs')).href)).buildCatalog
  } catch (e) {
    throw new Error('PROMPT_TOOL_NAMES_DERIVATION_FAILED: cannot import scripts/check-task-brief.mjs: ' + String(e && e.message))
  }
  const catalog = await buildCatalog({ repo })
  const known = new Set(catalog.tools.keys())
  if (known.size === 0) throw new Error('PROMPT_TOOL_NAMES_DERIVATION_FAILED: the derived catalogue is empty')
  // A declared parameter is vocabulary, not a tool: `vibe_v5_meeting { action }` teaches `action`, and `action` must not be
  // mistaken for a tool name. ★ The catalog stores `parameters` as a FLAT map of paramName -> def (not JSON-Schema
  // `properties`); reading `.properties` here silently produced an empty parameter vocabulary — measured: the first run of
  // this rewrite flagged `blocked_by`, a parameter `vibe_v5_task` declares, as an unknown tool name.
  const vocabulary = new Set()
  for (const tool of catalog.tools.values()) {
    const params = tool.parameters && typeof tool.parameters === 'object' ? tool.parameters : {}
    for (const [key, def] of Object.entries(params)) {
      vocabulary.add(key)
      if (def && def.properties && typeof def.properties === 'object') for (const k of Object.keys(def.properties)) vocabulary.add(k)
    }
    for (const key of (tool.parameters && tool.parameters.required) || []) vocabulary.add(key)
  }
  let fieldOwners = null
  try {
    fieldOwners = await import(pathToFileURL(join(vmu, 'kernel', 'turn', 'index.js')).href)
  } catch (e) {
    throw new Error('PROMPT_TOOL_NAMES_DERIVATION_FAILED: cannot import kernel/turn/index.js for FIELD_OWNERS: ' + String(e && e.message))
  }
  if (!fieldOwners.FIELD_OWNERS || typeof fieldOwners.FIELD_OWNERS !== 'object') {
    throw new Error('PROMPT_TOOL_NAMES_DERIVATION_FAILED: kernel/turn/index.js no longer exports FIELD_OWNERS')
  }
  for (const key of Object.keys(fieldOwners.FIELD_OWNERS)) vocabulary.add(key)
  // ★ RECORDED_FIELDS are the reply keys the kernel BOOKKEEPS without dispatching (`solved`, `vote_solved`, …): data the
  // payload accepts, so naming them in a prompt is not teaching a tool. Read from the kernel, not from a copy.
  for (const key of (fieldOwners.RECORDED_FIELDS || [])) vocabulary.add(key)
  // ★ ALIASES ARE LEGITIMATE REFERENCES, not tool definitions: `{ from: 'vibe_v5_members', to: 'vmu.members' }` names a
  // tool the pack forwards to a service. A scan that does not know about them reports a false positive - measured, this
  // was the LAST of three false positives this check produced while being written, and `vibe_v5_members` is still the only
  // name in the corpus that needs it.
  const aliasFroms = new Set()
  const packs = join(vmu, 'packs')
  for (const pack of listing(packs, { mayBeEmpty: false })) {
    for (const dir of ['', 'prompts']) {
      const d = join(packs, pack, dir)
      if (!existsSync(d)) continue
      // A pack may legitimately have no prompts directory, so THIS one is allowed empty - said, not assumed.
      const aliasFiles = listing(d, { mayBeEmpty: true }).filter((n) => n.endsWith('.js'))
      for (const f of aliasFiles) {
        for (const m of stripComments(readFileSync(join(d, f), 'utf8')).matchAll(/from:\s*['"](vibe_(?:v5|vmu)_[a-z0-9_]+)['"]/g)) aliasFroms.add(m[1])
      }
    }
  }
  return { known, aliasFroms, vocabulary }
}

/** Tool names cited by the prompt corpus under `promptDir` that the repository does not define. */
export function missingNames(promptDir, declared) {
  const { known, aliasFroms } = declared
  const out = new Map()
  const promptFiles = listing(promptDir, { mayBeEmpty: false }).filter((n) => n.endsWith('.js'))
  for (const f of promptFiles) {
    const code = stripComments(readFileSync(join(promptDir, f), 'utf8'))
    // A trailing underscore marks a PREFIX (e.g. `vibe_v5_record_*`), not a name - measured false positive #2.
    for (const m of code.matchAll(/\bvibe_(?:v5|vmu)_[a-z0-9_]*[a-z0-9]\b/g)) {
      const name = m[0]
      if (name.endsWith('_')) continue
      if (known.has(name) || aliasFroms.has(name)) continue
      if (!out.has(name)) out.set(name, new Set())
      out.get(name).add(f)
    }
  }
  return [...out.entries()].map(([name, files]) => ({ name, files: [...files].sort() })).sort((a, b) => a.name.localeCompare(b.name))
}

/** ★ THE SHAPES IN WHICH A PROMPT NAMES A TOOL AS SOMETHING TO INVOKE. Measured against the pre-fix corpus,
 *  `math_computation` appears in two of them (`- math_computation {op: probe…}` and `调用 math_computation`), and the
 *  reply-field teaching that started this task appears in the parentheses shape (`开一个议题（propose_meeting）`).
 *  ★★ WHY STANDALONE BACKTICKS ARE **NOT** A VIOLATION SHAPE (measured, not assumed): the corpus backticks DATA
 *  vocabulary far more often than tools — `paper_final`/`paper_part`/`paper_review` (retired report fields being named
 *  as retired), `free_slots`/`active_agents`/`verify_candidates` (v3 brief fields), `blocked_by` (a declared task
 *  parameter). Including them produced 17 false positives that no whitelist could separate from real dead names, and
 *  exactly zero measured defects that appeared ONLY backticked. The tool-shaped reference is the call/verb shape; a name
 *  that is only ever written `like this` is being quoted, not invoked. That is a real limit of a text predicate and it is
 *  stated in the header rather than papered over.
 *  ★ `names` receives the CAPTURE (group 1), never the whole match. */
const NAKED_CONTEXTS = [
  { kind: 'call-shape', re: /(?<![A-Za-z0-9_$.'"`])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*[{(]/g, names: (cap) => [cap] },
  { kind: 'paren', re: /[（(]\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*[）),，]/g, names: (cap) => [cap] },
  { kind: 'verb', re: /(?:调用|使用|call|use)\s*`?([a-z][a-z0-9]*(?:_[a-z0-9]+)+)/g, names: (cap) => [cap] },
]
function matchAll(text, re) {
  const out = []
  for (const m of text.matchAll(re)) out.push(m[1])
  return out
}

/** A generated capture is a HISTORICAL RECORD, not live teaching — identified by the marker the generator writes, not by a
 *  hard-coded filename list (a new capture is skipped automatically, and a hand-written file cannot claim the exemption). */
export const isGeneratedCapture = (src) => /SOURCE_SHA256/.test(src) || /GENERATED FILE, do not edit by hand/.test(src)

/** ★ WHITELIST: a name may be named on purpose in ONE file, with a reason and the run that first found it. The cap is
 *  enforced by `judgeWhitelist`, not by good intentions. */
export const NAKED_WHITELIST = Object.freeze([
  {
    name: 'end_verify',
    allowedIn: ['v5r-corrections.js'],
    reason: 'The correction passage must NAME the retired mechanism it supersedes (task: F5 round, '
      + 'tests/audit-prompt-retired-mechanisms.test.mjs ④) - a repair that cannot say what it repairs is not auditable.',
    firstSeenRun: 'run 31',
  },
])
export const WHITELIST_CAP = 8

/** Naked-name violations in one prompt file's source. */
export function nakedViolationsInSource(src, declared, whitelist = NAKED_WHITELIST) {
  if (isGeneratedCapture(src)) return []
  const hits = new Map()
  for (const ctx of NAKED_CONTEXTS) {
    for (const m of src.matchAll(ctx.re)) {
      for (const name of ctx.names(m[1])) {
        if (declared.known.has(name) || declared.aliasFroms.has(name) || declared.vocabulary.has(name)) continue
        if (!hits.has(name)) hits.set(name, new Set())
        hits.get(name).add(ctx.kind)
      }
    }
  }
  return [...hits.entries()].map(([name, shapes]) => ({ name, shapes: [...shapes].sort() })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Judge a whole corpus directory; `file` is passed so the whitelist can be file-scoped. */
export function nakedNameHits(promptDir, declared, whitelist = NAKED_WHITELIST) {
  const out = []
  for (const f of listing(promptDir, { mayBeEmpty: false }).filter((n) => n.endsWith('.js'))) {
    for (const v of nakedViolationsInSource(readFileSync(join(promptDir, f), 'utf8'), declared)) {
      const allowed = whitelist.some((w) => w.name === v.name && (w.allowedIn || []).includes(f))
      if (allowed) continue
      out.push({ name: v.name, shapes: v.shapes, file: f })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))
}

/** The whitelist's own hygiene: reasons, first-seen batches, a cap, and a STALE check (a row whose name no longer appears
 *  in the file it was granted for is a row that has rotted into decoration). */
export function judgeWhitelist({ corpusDirs, whitelist = NAKED_WHITELIST, cap = WHITELIST_CAP } = {}) {
  const problems = []
  if (whitelist.length > cap) problems.push('NAKED_WHITELIST_TOO_BIG: ' + whitelist.length + ' > cap ' + cap)
  for (const w of whitelist) {
    if (!w || typeof w.name !== 'string' || !Array.isArray(w.allowedIn) || w.allowedIn.length === 0) { problems.push('WHITELIST_ROW_WITHOUT_NAME_OR_SCOPE: ' + JSON.stringify(w && w.name)); continue }
    if (typeof w.reason !== 'string' || w.reason.trim().length < 20) problems.push('WHITELIST_ROW_WITHOUT_REASON: ' + w.name)
    if (!/^run\s*\d+/i.test(String(w.firstSeenRun || ''))) problems.push('WHITELIST_ROW_WITHOUT_FIRST_SEEN_RUN: ' + w.name)
    let stillThere = false
    for (const dir of corpusDirs || []) {
      for (const f of (w.allowedIn || [])) {
        const p = join(dir, f)
        if (!existsSync(p)) continue
        const src = readFileSync(p, 'utf8')
        if (new RegExp('(?<![A-Za-z0-9_$])' + w.name + '(?![A-Za-z0-9_])').test(src)) stillThere = true
      }
    }
    if (!stillThere) problems.push('WHITELIST_ROW_STALE (the name no longer appears in its declared scope): ' + w.name)
  }
  return problems
}

const argv = process.argv.slice(2)

if (argv.includes('--selftest')) {
  const dir = mkdtempSync(join(tmpdir(), 'promptnames-'))
  let bad = 0
  const check = (cond, name, detail) => { if (!cond) { bad += 1; console.log('  FAIL ' + name + ' ' + JSON.stringify(detail || null)) } }
  try {
    const prompts = join(dir, 'prompts')
    mkdirSync(prompts)
    writeFileSync(join(prompts, 'p.js'),
      'export const A = [\n' +
      '  "call `vibe_vmu_task` with action list",\n' +        // a real host face
      '  "and `vibe_v5_record_*` for the log",\n' +           // a PREFIX, not a name
      '  "`vibe_v5_members` forwards to the service",\n' +    // an alias - legitimate
      '  "but `vibe_vmu_motion` does not exist",\n' +         // ★ the invented one, backticked
      ']\n')
    const declared = { known: new Set(['vibe_vmu_task']), aliasFroms: new Set(['vibe_v5_members']), vocabulary: new Set() }
    const miss = missingNames(prompts, declared)
    const names = miss.map((m) => m.name)
    check(names.includes('vibe_vmu_motion'), '★★ 提示词里编造的工具名必须被抓到', names)
    check(!names.includes('vibe_vmu_task'), '★ 真实工具名不算缺失', names)
    check(!names.includes('vibe_v5_members'), '★★ 别名 from 不算缺失（否则这是假阳性）', names)
    check(!names.some((n) => n.endsWith('_')), '★ 前缀（vibe_v5_record_）不算名字', names)
    check(miss.length === 1, '★ 只报那一个（判据不是恒报也不是恒静）', names)

    // ★ THE NAKED RULE: one invented name in each mention shape, one legitimate reply-field, one generated capture.
    const naked = join(dir, 'naked')
    mkdirSync(naked)
    writeFileSync(join(naked, 'teaching.js'),
      'export const A = [\n' +
      '  "- 需要精确数值时调用 math_computation：先 probe，再 run。",\n' +   // verb shape
      '  "- math_computation {op: probe|run} — 归档成回执。",\n' +           // call shape
      '  "或者开一个议题（propose_meeting）、给某个方向开任务（task_create）。",\n' + // reply FIELDS - vocabulary
      '  "用 `vibe_vmu_task` 看任务板。",\n' +                                // a real tool
      '  "- 回执字段 `paper_final` 已经不再被接受。",\n' +                    // ★ a DATA field, backticked only
      ']\n')
    writeFileSync(join(naked, 'capture.js'),
      '// vibe-math-vmu — GENERATED FILE, do not edit by hand.\nexport const SOURCE_SHA256 = "abc"\nexport const OLD = ["调用 math_computation：先 probe，再 run。"]\n')
    // ★ The retired name is written in the VERB shape on purpose (the shape the real correction passage uses:
    // "不要调用 end_verify"), because a bare backtick is data vocabulary now — a fixture that only backticked it would be
    // testing "the predicate is silent about quoted fields", not the whitelist scoping below.
    writeFileSync(join(naked, 'corrections.js'), 'export const C = ["以前叫 end_verify，现在是 vibe_v5_meeting；见到旧名不要调用 end_verify。"]\n')
    const nakedDeclared = { known: new Set(['vibe_vmu_task', 'vibe_v5_meeting']), aliasFroms: new Set(), vocabulary: new Set(['propose_meeting', 'task_create']) }
    const nakedHits = nakedNameHits(naked, nakedDeclared)
    const hitNames = nakedHits.map((h) => h.name + '@' + h.file)
    check(hitNames.includes('math_computation@teaching.js'), '★★★ 裸名（无 vibe_ 前缀、不带引号）也必须被抓到 —— 这正是 task-18 的盲区', hitNames)
    check(nakedHits.filter((h) => h.name === 'math_computation').length === 1, '★ 同一文件的两种形态只报一次（不刷屏）', hitNames)
    check(!hitNames.some((n) => n.startsWith('paper_final@')), '★★ 只被引号引住的数据字段（回执字段 paper_final）不算工具调用 —— 实测仓内 17 个这类词，混进来就是 17 个假阳性', hitNames)
    check(!hitNames.some((n) => n.startsWith('propose_meeting@')), '★★ 回复字段（FIELD_OWNERS 的词汇）不算工具名 —— 否则"用 report 字段"会被误判', hitNames)
    check(!hitNames.some((n) => n.startsWith('vibe_vmu_task@')), '★ 真实工具名不算违规', hitNames)
    check(!hitNames.some((n) => n.includes('capture.js')), '★★★ 生成的历史快照（SOURCE_SHA256）不参与判定 —— 它的文字不可改，契约在 audit-prompt-retired-mechanisms', hitNames)
    check(hitNames.includes('end_verify@corrections.js'), '★★ 未登记的退役名在修正文件里也要报（白名单是逐文件授权，不是全局沉默）', hitNames)
    const scoped = nakedNameHits(naked, nakedDeclared, [{ name: 'end_verify', allowedIn: ['corrections.js'], reason: 'a long enough reason for the table', firstSeenRun: 'run 31' }])
    check(!scoped.some((h) => h.name === 'end_verify'), '★★ 具名白名单只放行它声明的那个文件', scoped.map((h) => h.name))
    const leaked = nakedNameHits(naked, nakedDeclared, [{ name: 'math_computation', allowedIn: ['corrections.js'], reason: 'a long enough reason for the table', firstSeenRun: 'run 31' }])
    check(leaked.some((h) => h.name === 'math_computation'), '★★ 白名单不能跨文件漂移（授权 teaching 之外的死名仍必须报）', leaked.map((h) => h.name))
    const wlProblems = judgeWhitelist({ corpusDirs: [naked], whitelist: [{ name: 'not_there', allowedIn: ['corrections.js'], reason: 'a long enough reason for the table', firstSeenRun: 'run 31' }] })
    check(wlProblems.some((p) => p.startsWith('WHITELIST_ROW_STALE')), '★★ 过期白名单行必须报（否则表会烂成装饰）', wlProblems)
    check(judgeWhitelist({ corpusDirs: [naked], whitelist: new Array(WHITELIST_CAP + 1).fill({ name: 'end_verify', allowedIn: ['corrections.js'], reason: 'a long enough reason for the table', firstSeenRun: 'run 31' }) }).some((p) => p.startsWith('NAKED_WHITELIST_TOO_BIG')),
      '★★ 白名单上限是断言（超上限 ⇒ 报错）', null)
    check(judgeWhitelist({ corpusDirs: [naked], whitelist: [{ name: 'end_verify', allowedIn: ['corrections.js'], reason: 'short', firstSeenRun: 'run 31' }] }).some((p) => p.startsWith('WHITELIST_ROW_WITHOUT_REASON')),
      '★ 理由太短 ⇒ 报错', null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log('SELFTEST ' + (bad === 0 ? 'PASS' : 'FAIL (' + bad + ')'))
  process.exit(bad === 0 ? 0 : 1)
}

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed += 1
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const declared = await declaredNames()
ok(declared.known.size > 100 && declared.aliasFroms.size > 0 && declared.vocabulary.size > 20,
  '★ 前提：三组词汇都派生到了（工具名/别名/参数与回复字段）—— 空集会让下面永远绿，本门禁存在的理由就是这个',
  { known: declared.known.size, aliases: declared.aliasFroms.size, vocabulary: declared.vocabulary.size })
ok(declared.vocabulary.has('propose_meeting') && declared.vocabulary.has('task_create'),
  '★★ 回复字段词汇是从 kernel/turn/index.js 的 FIELD_OWNERS 派生的（不是手写清单）', ['propose_meeting', 'task_create'])

const packsRoot = join(VMU, 'packs')
const packRoots = listing(packsRoot, { mayBeEmpty: false })
// ★ THIS ASSERTION IS THE POINT, NOT A FORMALITY. Everything below runs inside a loop over the pack directories, so if
// that list were empty every per-pack assertion would never run and the gate would report "0 failed" about nothing.
ok(packRoots.length > 0,
  '★ 前提：至少一个整合包目录（否则下面的逐包断言一条都不会跑，门禁会静默通过）', packRoots)
const corpusDirs = []
for (const pack of packRoots) {
  const pd = join(packsRoot, pack, 'prompts')
  if (!existsSync(pd)) continue
  corpusDirs.push(pd)
  const miss = missingNames(pd, declared)
  ok(miss.length === 0,
    '★★ packs/' + pack + ' 的提示词只提到仓内真实存在的工具（别名与工具表都算）—— 编造的工具名会让成员照着提示词调一个不存在的面',
    miss)
  const naked = nakedNameHits(pd, declared)
  ok(naked.length === 0,
    '★★★ packs/' + pack + ' 的提示词没有【裸写】的未声明工具名（无 vibe_ 前缀、不带引号也算 —— task-18 的盲区）',
    naked)
}
ok(corpusDirs.length > 0, '★ 前提：至少扫到一个 prompts 目录', corpusDirs.length)
ok(judgeWhitelist({ corpusDirs }).length === 0,
  '★ 裸名白名单自己必须干净：每条带理由与首次发现批次、有上限、且仍在声明的文件里出现（没有过期行）',
  judgeWhitelist({ corpusDirs }))

// ★★ THE COUNTERFACTUAL. "0 naked names" is only worth something if the predicate fires on the corpus where the defect WAS
// real. This re-scans the LIVE prompt sections at the pre-fix baseline commit and requires the archived-tool name to come
// back. It also keeps `end_verify` whitelisted there, proving the whitelist is scoped by file, not by name.
{
  const baselineHits = []
  for (const pack of packRoots) {
    const pd = join(packsRoot, pack, 'prompts')
    if (!existsSync(pd)) continue
    for (const f of listing(pd, { mayBeEmpty: false }).filter((n) => n.endsWith('.js'))) {
      const rel = 'vibe-math-vmu/packs/' + pack + '/prompts/' + f
      let src = null
      try {
        src = execFileSync('git', ['show', DEAD_NAME_BASELINE + ':' + rel], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
      } catch { continue }
      for (const v of nakedViolationsInSource(src, declared)) {
        if (NAKED_WHITELIST.some((w) => w.name === v.name && (w.allowedIn || []).includes(f))) continue
        baselineHits.push(v.name + '@' + pack + '/' + f)
      }
    }
  }
  ok(baselineHits.some((h) => h.startsWith('math_computation@')),
    '★★★ 反事实：在 ' + DEAD_NAME_BASELINE + ' 的提示词语料里必须报出 math_computation（v2 归档工具被 v5r 提示词当真工具教）—— 改前能报出真死名，判据才有牙',
    baselineHits.slice(0, 12))
  ok(baselineHits.length > 0 && baselineHits.every((h) => !NAKED_WHITELIST.some((w) => h.startsWith(w.name + '@'))),
    '★★ 反事实里的死名不在白名单里（白名单没有把反事实吃掉）', baselineHits.slice(0, 12))
}

console.log('=== PROMPT TOOL NAMES: ' + passed + ' passed, ' + failed + ' failed ===')
console.log('  known=' + declared.known.size + '  aliases=' + declared.aliasFroms.size + '  vocabulary=' + declared.vocabulary.size
  + '  naked-whitelist=' + NAKED_WHITELIST.length + '/' + WHITELIST_CAP)
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
