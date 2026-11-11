// scripts/audit-prompt-facts.mjs — TB-2615 round A: the prompt is full of ASSERTIONS ABOUT THE CODE.
//
// The prompt teaches a member what the kernel will do: the reply text is cut at 2000 characters, `truncated` and
// `excerptLen` are the authoritative truncation keys, `ack` is the ONLY operation that settles a mail row, a meeting
// broadcast comes from the chair only, `lateAdmission` defaults to …, a task may go open→doing but not assigned→done,
// a verdict element carries `p` (not `verdict`) … Every one of those sentences is a claim about a constant, an enum or
// a branch in `vibe-math-vmu/`. A prompt that drifts from the code is worse than no prompt: the member reads a rule,
// acts on it, and the kernel refuses the act (or silently does the opposite) — the exact failure mode that cost several
// live runs (RUN 251's `waitingFor`, RUN 252's `p` vs `verdict`, RUN 255's fs-first default).
//
// THIS SCRIPT EXISTS TO MAKE THAT DRIFT RED BEFORE A MEMBER FINDS IT. It does not judge wording, length or ordering
// (audit-prompt-budget does that) and it never treats the prompt as the source of truth. For every fact it prints
//     promptFile:line   claim   truthFile:line   value   verdict
// and exits 1 when a claim and its code fact disagree.
//
// THE MUTANTS RUN ON THE TRUTH SIDE. `--mutants` re-reads the same prompt text (asserted byte-identical) while the
// FACT READER is handed a changed value — schema def 2000→1, `settledBy` allowlist 'ack'→'read', seat table +1 seat.
// A ruler that only catches prompt edits is a copy of the prompt; a ruler that catches a changed constant while the
// prompt text is untouched is a separate reader. The three mutants must each turn exactly their own fact red.
//
// Usage:
//   node scripts/audit-prompt-facts.mjs            # human table, exit 1 on any mismatch
//   node scripts/audit-prompt-facts.mjs --json     # machine report
//   node scripts/audit-prompt-facts.mjs --mutants  # truth-side mutants must be caught; exit 1 if one is not
//
// The prompt is measured as ASSEMBLED (chair/member/temp normal + chair meeting), through the same turn orchestrator a
// real seat goes through — never on a source string that merely looks like the sentence a member receives.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promptSettings } from './sim/settings.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VMU = join(ROOT, 'vibe-math-vmu')
const PROMPTS = join(VMU, 'packs', 'v5r', 'prompts')

// ─────────────────────────────── reading helpers ───────────────────────────────

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(js|mjs|json|md)$/.test(name)) out.push(p)
  }
  return out
}

function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line += 1
  return line
}

const fileCache = new Map()
/** Read a repo-relative file once; return {text, rel, lineOf(idx)}. Missing file THROWS: a truth source that
 * disappears is a red fact, never a silently skipped one. */
function codeFile(rel) {
  if (fileCache.has(rel)) return fileCache.get(rel)
  const abs = join(ROOT, rel)
  const text = readFileSync(abs, 'utf8')
  const rec = { text, rel, lineOf: (idx) => lineOf(text, idx) }
  fileCache.set(rel, rec)
  return rec
}

const promptFiles = walk(PROMPTS).map((abs) => ({
  rel: relative(ROOT, abs).split('\\').join('/'),
  text: readFileSync(abs, 'utf8'),
}))
/** Where does the statement a fact was read out of LIVE in the prompt sources? */
function locatePrompt(needle) {
  for (const f of promptFiles) {
    const i = f.text.indexOf(needle)
    if (i !== -1) return { file: f.rel, line: lineOf(f.text, i) }
  }
  return null
}

// ─────────────────────────────── prompt assembly ───────────────────────────────

export const RULER_MEETING = 'm-facts'
const RULER_FACTS = Object.freeze({ type: 'ordinary', chair: 'r-acad', agenda: '事实表' })

export async function assemblePrompts() {
  const { createTurnOrchestrator } = await import(pathToFileURL(join(VMU, 'kernel', 'turn', 'index.js')).href)
  const { createPromptPipeline } = await import(pathToFileURL(join(VMU, 'kernel', 'prompt', 'index.js')).href)
  const { collectPackSections } = await import(pathToFileURL(join(VMU, 'kernel', 'pack.js')).href)
  const { PACK } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-core.js')).href)
  const { decideSections } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'middleware', 'prompt-switches.js')).href)
  const settings = promptSettings()
  const faces = Object.freeze({
    'vmu.meetings': Object.freeze({
      summary: ({ meeting = null } = {}) => (meeting === RULER_MEETING ? { ok: true, id: RULER_MEETING, ...RULER_FACTS, materials: RULER_FACTS.agenda } : null),
    }),
  })
  const loopOf = () => createTurnOrchestrator({
    sectionPolicy: decideSections,
    settings,
    faces,
    prompt: createPromptPipeline({
      sections: collectPackSections([PACK]),
      bindings: PACK.bindings,
      clock: () => '2026-01-01T00:00:00.000Z',
    }),
  })
  const ctxOf = (role, phase) => ({
    member: 'r-1',
    role,
    roleLabel: role === 'chair' ? '院士' : (role === 'temp' ? '临时工' : '常驻研究员'),
    phase,
    round: 3,
    roster: 'acad、r-1',
    quorum: 2,
    statusBlock: '[状态] x',
    meeting: phase === 'meeting' ? RULER_MEETING : null,
    settings,
  })
  const texts = {}
  for (const role of ['chair', 'member', 'temp']) {
    for (const phase of ['normal', 'meeting']) {
      const loop = loopOf()
      const asm = await loop.assemble(loop.open(ctxOf(role, phase)).turn)
      texts[role + '/' + phase] = String(asm.text || '')
    }
  }
  return texts
}

// ─────────────────────────────── the facts ───────────────────────────────
//
// Every fact is a pair of readers over the SAME question:
//   claim  — what the assembled prompt tells the member (a regex whose group is the asserted value);
//   truth  — what the code says (a file:line regex, read from `vibe-math-vmu/`, or a generated table);
//   equal  — how the two values are compared (default: strict, normalised).
// A fact whose prompt claim cannot be found is UNREADABLE, and that is red too: the sentence was renamed or removed,
// and the table below is supposed to be the complete list of things the prompt asserts about the code.

const FACTS = Object.freeze([
  {
    id: 'replyLimitChars',
    what: '回复正文截断上限',
    needle: '`vmu.turn.replyLimitChars`（默认 ',
    claim: { re: /`vmu\.turn\.replyLimitChars`（默认 (\d+) 字符）/, pick: (m) => Number(m[1]) },
    truth: (ctx) => {
      if ('replyLimitChars' in ctx.overrides) return { value: ctx.overrides.replyLimitChars, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/settings/schema.js')
      const m = /key: 'vmu\.turn\.replyLimitChars'[^\n]*def: (\d+)/.exec(f.text)
      if (!m) throw new Error('schema.js 里找不到 vmu.turn.replyLimitChars 的 def')
      return { value: Number(m[1]), file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'noticeLinesLimit',
    what: '[新到的消息] 块最多几行',
    needle: '最新在前、≤',
    claim: { re: /最新在前、≤(\d+)行/, pick: (m) => Number(m[1]) },
    truth: (ctx) => {
      if ('noticeLinesLimit' in ctx.overrides) return { value: ctx.overrides.noticeLinesLimit, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/mailbox.js')
      const m = /MAILBOX_NOTICE_LINES_MAX = (\d+)/.exec(f.text)
      return { value: Number(m[1]), file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'broadcastExcerptChars',
    what: '主席对全体发言的摘要上限',
    needle: '摘要 ≤800 字符',
    claim: { re: /摘要 ≤(\d+) 字符/, pick: (m) => Number(m[1]) },
    truth: (ctx) => {
      if ('broadcastExcerptChars' in ctx.overrides) return { value: ctx.overrides.broadcastExcerptChars, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/meetings.js')
      const m = /excerptOf\(speech\.said, (\d+)\)/.exec(f.text)
      return { value: Number(m[1]), file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'broadcastChairOnly',
    what: '群聊行只有主席的发言会推送',
    needle: '只有主席的发言会推送',
    claim: { re: /只有主席的发言会推送/, pick: () => 'chair-only' },
    truth: (ctx) => {
      if ('broadcastChairOnly' in ctx.overrides) return { value: ctx.overrides.broadcastChairOnly, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/meetings.js')
      const m = /String\(member\) === String\(m\.chair\) && String\(said\)\.trim\(\) !== ''/.exec(f.text)
      if (!m) throw new Error('meetings.js 里找不到 broadcast 的 chair 闸门')
      return { value: 'chair-only', file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'ackSettlesOnly',
    what: 'ack 是唯一结算；open 只标已读',
    needle: '`ack` 是**唯一**结算',
    claim: { re: /`ack` 是\*\*唯一\*\*结算/, pick: () => 'ack' },
    truth: (ctx) => {
      if ('ackSettlesOnly' in ctx.overrides) return { value: ctx.overrides.ackSettlesOnly, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/mailbox.js')
      // The ONE operation that removes a row: every delivery receipt names it as `settledBy`.
      const m = /settledBy: '(\w+)'/.exec(f.text)
      return { value: m[1], file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'truncationKeys',
    what: '截断的权威键是 truncated 与 excerptLen',
    needle: '权威键是 `truncated`',
    claim: {
      re: /权威键是 `truncated`（被切了）与 `excerptLen`（摘录字符数）/,
      pick: () => ['truncated', 'excerptLen'],
    },
    truth: (ctx) => {
      if ('truncationKeys' in ctx.overrides) return { value: ctx.overrides.truncationKeys, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/turn/index.js')
      const t = /truncated: replyTruncated === true/.exec(f.text)
      const e = /excerptLen: Math\.min/.exec(f.text)
      if (!t || !e) throw new Error('kernel/turn/index.js 里找不到 truncated/excerptLen 回执键')
      return { value: ['truncated', 'excerptLen'], file: f.rel, line: f.lineOf(t.index) }
    },
  },
  {
    id: 'emptyReplyZeroChars',
    what: 'emptyReply 只描述回复文本、0 字符才 true',
    needle: 'true＝这一回合的回复文本 0 字符',
    claim: { re: /true＝这一回合的回复文本 (\d+) 字符/, pick: (m) => Number(m[1]) },
    truth: (ctx) => {
      if ('emptyReplyZeroChars' in ctx.overrides) return { value: ctx.overrides.emptyReplyZeroChars, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/turn/index.js')
      const m = /EMPTY_REPLY_MEANS = '[^']*?\((\d+) characters of speech/.exec(f.text)
      if (!m) throw new Error('EMPTY_REPLY_MEANS 里找不到字符阈值')
      return { value: Number(m[1]), file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'seatLabels',
    what: '三席的 id 与中文标签',
    needle: '院士＝`chair`',
    claim: {
      re: /院士＝`chair`，常驻研究员＝`member`，临时工＝`temp`/,
      pick: () => ({ chair: '院士', member: '常驻研究员', temp: '临时工' }),
    },
    truth: (ctx) => {
      if ('seatLabels' in ctx.overrides) return { value: ctx.overrides.seatLabels, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/packs/v5r/prompts/v5r-core.js')
      const map = {}
      let first = -1
      for (const m of f.text.matchAll(/\{ id: '(chair|member|temp)', label: '([^']+)', capacity: \d+/g)) {
        if (first === -1) first = m.index
        map[m[1]] = m[2]
      }
      if (!first || Object.keys(map).length !== 3) throw new Error('v5r-core.js 的 roles 表不是三席')
      return { value: map, file: f.rel, line: f.lineOf(first) }
    },
  },
  {
    id: 'refusalCodes',
    what: '提示词点名的回复拒因码在核心里可抛',
    needle: 'VMU_TURN_NO_FENCE',
    claim: {
      // TB-2741 / RUN 79: the sentence this fact reads was REWRITTEN (the old "没有围栏或对象 ⇒ …" wording was replaced
      // by the honest shape-problem sentence name-listing the four codes). The FACT is unchanged — the prompt names reply
      // refusal codes and every one it names must be throwable — so only the sentence it reads follows the new wording.
      re: /形状问题（`(VMU_TURN_NO_FENCE)`\/围栏 JSON 不合法=`(VMU_TURN_BAD_JSON)`\//,
      pick: () => ['VMU_TURN_BAD_JSON', 'VMU_TURN_NO_FENCE'],
      /** The prompt names only the codes it teaches; the question is whether EVERY named code can actually be thrown. */
      subset: true,
    },
    truth: (ctx) => {
      if ('refusalCodes' in ctx.overrides) return { value: ctx.overrides.refusalCodes, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/turn/index.js')
      const codes = [...new Set([...f.text.matchAll(/VMU_TURN_[A-Z_]+/g)].map((m) => m[0]))].sort()
      const first = f.text.indexOf('VMU_TURN_NO_FENCE')
      return { value: codes, file: f.rel, line: first === -1 ? 0 : f.lineOf(first) }
    },
  },
  {
    id: 'verdictElementKeys',
    what: 'verdicts 元素必填键是 member 与 p',
    needle: '每个元素逐字长这样',
    claim: {
      re: /每个元素逐字长这样：`\{ member:"<席位 id>", p:0 或 1, reason:"<一句话理由>" \}`——数值键是 \*\*`p`\*\*/,
      pick: () => ['member', 'p', 'reason'],
    },
    truth: (ctx) => {
      if ('verdictElementKeys' in ctx.overrides) return { value: ctx.overrides.verdictElementKeys, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/packs/v5r/tools.js')
      const m = /verdicts: \{ type: 'array'[^\n]*?required: \['member', 'p'\]/.exec(f.text)
      if (!m) throw new Error('tools.js 的 verdicts schema 找不到 required member/p')
      return { value: ['member', 'p', 'reason'], file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'taskTransitions',
    what: '任务合法转移表（提示词省略了 cancelled 出口）',
    needle: 'open→assigned|doing',
    claim: {
      re: /open→assigned\|doing、assigned→doing\|open、doing→done\|assigned/,
      pick: () => ({ open: ['assigned', 'doing'], assigned: ['doing', 'open'], doing: ['done', 'assigned'] }),
    },
    truth: (ctx) => {
      if ('taskTransitions' in ctx.overrides) return { value: ctx.overrides.taskTransitions, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/tasks.js')
      const start = f.text.indexOf('export const TRANSITIONS')
      const body = f.text.slice(start, f.text.indexOf('})', start))
      const map = {}
      let first = -1
      for (const m of body.matchAll(/^ {2}(\w+): \[([^\]]*)\],?$/gm)) {
        if (first === -1) first = start + m.index
        map[m[1]] = m[2].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
      }
      return { value: map, file: f.rel, line: first === -1 ? 0 : f.lineOf(first) }
    },
  },
  {
    // TB-2610 DECISION FLIP (Lead 2026-11-07): lateAdmission default went open -> chair.
    // The prompt says `chair`; any older doc/comment saying `open` is a historical fact of
    // the RUN-247 era and must not be read as the current default. This fact is the guard
    // that keeps that flip honest on both sides (claim side and truth side).
    id: 'lateAdmissionDefault',
    what: 'lateAdmission 的缺省策略（TB-2610 决策翻转：open -> chair，Lead 2026-11-07 裁定）',
    needle: '（open|chair|refuse，缺省 ',
    claim: { re: /（open\|chair\|refuse，缺省 (\w+)）/, pick: (m) => m[1] },
    truth: (ctx) => {
      if ('lateAdmissionDefault' in ctx.overrides) return { value: ctx.overrides.lateAdmissionDefault, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/meetings.js')
      const m = /lateAdmissionOf = \(m\) => \{[\s\S]*?typeof m\.lateAdmission === 'string'\) \? m\.lateAdmission : '(\w+)'/.exec(f.text)
      if (!m) throw new Error('meetings.js 的 lateAdmissionOf 找不到缺省值')
      return { value: m[1], file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'hardLimitMs',
    what: '会议墙钟硬界默认与钳制区间',
    needle: '默认 1800000ms，钳制 ',
    claim: {
      re: /默认 (\d+)ms，钳制 (\d+)–(\d+)/,
      pick: (m) => [Number(m[1]), Number(m[2]), Number(m[3])],
    },
    truth: (ctx) => {
      if ('hardLimitMs' in ctx.overrides) return { value: ctx.overrides.hardLimitMs, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/meetings.js')
      const d = /\? 1800000 : n\(raw\)/.exec(f.text)
      const c = /Math\.min\(7200000, Math\.max\(300000, v\)\)/.exec(f.text)
      if (!d || !c) throw new Error('meetings.js 的 hardLimitMs 默认/钳制找不到')
      return { value: [1800000, 300000, 7200000], file: f.rel, line: f.lineOf(c.index) }
    },
  },
  {
    id: 'waitingForValues',
    what: '会议 waitingFor 的两个取值',
    needle: '`"quorum"`＝人没齐',
    claim: { re: /`"quorum"`＝人没齐；`"chair-proceed"`＝人齐了等你/, pick: () => ['chair-proceed', 'quorum'] },
    truth: (ctx) => {
      if ('waitingForValues' in ctx.overrides) return { value: ctx.overrides.waitingForValues, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/meetings.js')
      const m = /return quorumOf\(m\)\.met === true \? 'chair-proceed' : 'quorum'/.exec(f.text)
      if (!m) throw new Error('meetings.js 的 waitingForOf 找不到取值')
      return { value: ['chair-proceed', 'quorum'], file: f.rel, line: f.lineOf(m.index) }
    },
  },
  {
    id: 'blueprintMdCodes',
    what: '蓝图草案缺文件/漂移的两个具名码',
    needle: 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING',
    claim: {
      re: /缺文件 `(VMU_PACK_V5R_BLUEPRINT_MD_MISSING)`、被改 `(VMU_PACK_V5R_BLUEPRINT_MD_DRIFT)`/,
      pick: (m) => [m[1], m[2]],
    },
    truth: (ctx) => {
      if ('blueprintMdCodes' in ctx.overrides) return { value: ctx.overrides.blueprintMdCodes, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/packs/v5r/blueprint.js')
      const a = /export const BLUEPRINT_MD_MISSING = '(VMU_PACK_V5R_BLUEPRINT_MD_MISSING)'/.exec(f.text)
      const b = /export const BLUEPRINT_MD_DRIFT = '(VMU_PACK_V5R_BLUEPRINT_MD_DRIFT)'/.exec(f.text)
      if (!a || !b) throw new Error('blueprint.js 的 MD_MISSING/MD_DRIFT 常量找不到')
      return { value: [a[1], b[1]], file: f.rel, line: f.lineOf(a.index) }
    },
  },
  {
    id: 'mdChangedSinceIndex',
    what: 'md 与索引不一致的读面键名',
    needle: '`mdChangedSinceIndex:true`',
    claim: { re: /`mdChangedSinceIndex:true`/, pick: () => 'mdChangedSinceIndex' },
    truth: (ctx) => {
      if ('mdChangedSinceIndex' in ctx.overrides) return { value: ctx.overrides.mdChangedSinceIndex, file: 'mutant', line: 0 }
      const f = codeFile('vibe-math-vmu/kernel/records.js')
      const m = /mdChangedSinceIndex: changed/.exec(f.text) || /mdChangedSinceIndex: true/.exec(f.text)
      if (!m) throw new Error('records.js 里找不到 mdChangedSinceIndex')
      return { value: 'mdChangedSinceIndex', file: f.rel, line: f.lineOf(m.index) }
    },
  },
])

// ─────────────────────────────── comparison ───────────────────────────────

function normalise(v) {
  if (Array.isArray(v)) return v.map(normalise).sort()
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = normalise(v[k])
    return out
  }
  return v
}

function same(claim, truth) {
  return JSON.stringify(normalise(claim)) === JSON.stringify(normalise(truth))
}

/** Task transitions: the prompt deliberately names only the happy paths (it omits the `cancelled` exits). A claim that
 * is a strict SUBSET of the code table is accurate-but-partial, which is a note, not a lie; a claim naming a target the
 * code forbids is a lie. */
function transitionVerdict(claim, truth) {
  const problems = []
  for (const [from, targets] of Object.entries(claim)) {
    const allowed = truth[from]
    if (!Array.isArray(allowed)) { problems.push(from + ' 不是合法起点'); continue }
    for (const t of targets) if (!allowed.includes(t)) problems.push(from + '→' + t + ' 被代码禁止')
  }
  if (problems.length) return { ok: false, note: problems.join('; ') }
  const omitted = []
  for (const [from, allowed] of Object.entries(truth)) {
    const named = (claim[from] || [])
    const extra = allowed.filter((t) => !named.includes(t))
    if (extra.length) omitted.push(from + '→' + extra.join('|'))
  }
  return { ok: true, note: omitted.length ? '提示词省略了 ' + omitted.join('、') + '（代码允许）' : '' }
}

// ─────────────────────────────── running ───────────────────────────────

export function runFacts(texts, ctx = { overrides: {} }) {
  const union = Object.values(texts).join('\n')
  const rows = []
  for (const fact of FACTS) {
    const claimMatch = fact.claim.re.exec(union)
    let claimValue = null
    let claimError = null
    if (claimMatch) claimValue = fact.claim.pick(claimMatch)
    else claimError = '提示词装配文本里找不到这条断言（句子被改名或删除？）'
    const loc = locatePrompt(fact.needle)
    let truth = null
    let truthError = null
    try { truth = fact.truth(ctx) } catch (e) { truthError = e && e.message ? e.message : String(e) }
    let verdict
    if (claimError || truthError) verdict = { ok: false, note: claimError || truthError }
    else if (fact.id === 'taskTransitions') verdict = transitionVerdict(claimValue, truth.value)
    else if (fact.claim && fact.claim.subset === true) {
      const missing = (Array.isArray(claimValue) ? claimValue : []).filter((c) => !(Array.isArray(truth.value) ? truth.value : []).includes(c))
      verdict = missing.length === 0 ? { ok: true, note: '' } : { ok: false, note: '代码里抛不出这些码: ' + missing.join(',') }
    }
    else verdict = same(claimValue, truth.value) ? { ok: true, note: '' } : { ok: false, note: '提示词与代码不一致' }
    rows.push({
      id: fact.id,
      what: fact.what,
      prompt: loc ? loc.file + ':' + loc.line : (fact.needle + ' (未定位)'),
      claim: claimValue,
      truth: truth ? truth.value : null,
      truthAt: truth ? truth.file + ':' + truth.line : 'ERR',
      ok: verdict.ok,
      note: verdict.note,
    })
  }
  return { rows, inconsistent: rows.filter((r) => !r.ok), checked: rows.length }
}

function fmtValue(v) {
  if (typeof v === 'string') return JSON.stringify(v)
  return JSON.stringify(normalise(v))
}

function printTable(report, promptHash) {
  const lines = []
  lines.push('== prompt facts: ' + report.checked + ' checked (assembled prompt sha256 ' + promptHash + ') ==')
  for (const r of report.rows) {
    lines.push(
      (r.ok ? 'OK    ' : 'BAD   ') + r.id.padEnd(22) +
      ' prompt=' + r.prompt.padEnd(52) +
      ' claim=' + fmtValue(r.claim).padEnd(38) +
      ' truth=' + String(r.truthAt).padEnd(46) +
      ' value=' + fmtValue(r.truth) +
      (r.note ? '  [' + r.note + ']' : ''),
    )
  }
  lines.push('')
  if (report.inconsistent.length === 0) {
    lines.push('PROMPT FACTS: PASS — every assertion the prompt makes about the kernel matches the kernel.')
  } else {
    lines.push('PROMPT FACTS: ' + report.inconsistent.length + ' INCONSISTENT — the prompt tells the member something the code does not do:')
    for (const r of report.inconsistent) lines.push('  · ' + r.id + '  (' + r.what + ')  project claim=' + fmtValue(r.claim) + ' truth=' + fmtValue(r.truth) + ' — ' + r.note)
  }
  return lines.join('\n')
}

// The three truth-side mutants. Each one changes what the FACT READER sees (as if a constant/hook changed in the code)
// while the prompt text stays byte-identical — that is the half a prompt-vs-prompt diff can never catch.
const MUTANTS = Object.freeze([
  { fact: 'replyLimitChars', override: 1, why: 'schema def 2000→1（截断长度常量被改）' },
  { fact: 'ackSettlesOnly', override: 'read', why: "mailbox settledBy 'ack'→'read'（允许值表被改）" },
  { fact: 'seatLabels', override: { chair: '院士', member: '常驻研究员', temp: '临时工', office: '所办' }, why: '席位表多一席（3→4）' },
])

async function main() {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const mutants = argv.includes('--mutants')
  const texts = await assemblePrompts()
  const promptHash = createHash('sha256').update(Object.values(texts).join('\u0000')).digest('hex').slice(0, 16)
  const base = runFacts(texts, { overrides: {} })

  if (mutants) {
    const lines = []
    lines.push('== truth-side mutants (prompt text is NOT edited; only the fact reader sees the change) ==')
    lines.push('assembled prompt sha256 ' + promptHash + ' (re-assembled for every mutant, must be identical)')
    let failed = 0
    for (const m of MUTANTS) {
      const textsAgain = await assemblePrompts()
      const hashAgain = createHash('sha256').update(Object.values(textsAgain).join('\u0000')).digest('hex').slice(0, 16)
      const report = runFacts(textsAgain, { overrides: { [m.fact]: m.override } })
      const caught = report.inconsistent.find((r) => r.id === m.fact)
      const promptUnchanged = hashAgain === promptHash
      const ok = Boolean(caught) && promptUnchanged
      if (!ok) failed += 1
      lines.push((ok ? 'CAUGHT' : 'MISSED') + '  ' + m.fact.padEnd(22) + '  ' + m.why +
        '  claim=' + fmtValue((base.rows.find((r) => r.id === m.fact) || {}).claim) +
        '  mutated truth=' + fmtValue(caught ? caught.truth : m.override) +
        (promptUnchanged ? '' : '  [PROMPT TEXT CHANGED — mutation harness is not honest]'))
    }
    lines.push('')
    lines.push(failed === 0
      ? 'MUTANTS: PASS — all ' + MUTANTS.length + ' truth-side mutations were caught with the prompt text unchanged.'
      : 'MUTANTS: FAIL — ' + failed + ' truth-side mutation(s) were not caught; the ruler is reading the prompt, not the code.')
    console.log(lines.join('\n'))
    process.exit(failed === 0 ? 0 : 1)
  }

  if (asJson) {
    console.log(JSON.stringify({ promptHash, checked: base.checked, inconsistent: base.inconsistent, rows: base.rows }, null, 2))
  } else {
    console.log(printTable(base, promptHash))
  }
  process.exit(base.inconsistent.length === 0 ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => {
    console.error('audit-prompt-facts: crashed — ' + (e && e.stack ? e.stack : e))
    process.exit(1)
  })
}
