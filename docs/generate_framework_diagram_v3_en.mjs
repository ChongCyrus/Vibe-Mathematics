// ============================================================
// Vibe Math V3 architecture diagram generator (English, zero dependency, pure Node)
//
//   node docs/generate_framework_diagram_v3_en.mjs
//   -> writes 示例图/框架图-v3-en.svg
//
// v2/v3 used to ship as matplotlib-generated PNGs; from v4 on this repository
// generates SVG directly from Node:
//   · the runtime already contains Node, so no Python / matplotlib is needed;
//   · SVG is plain text — diff friendly, reviewable, crisp at any zoom.
// This file is the English counterpart of the matplotlib v3 diagram. It copies
// the primitives (band/card/plain/arrow/polyline), the text-width estimator and
// the "warn + exit 1" layout self-check of docs/generate_framework_diagram_v5.mjs
// so that both diagrams stay in one visual language. It imports nothing from it.
//
// If a PNG is needed (market carousel / preview), do NOT screenshot with
// "window size = canvas size": --screenshot captures the WINDOW while the
// VIEWPORT is about 96px shorter, so the bottom of the canvas is never painted
// (that real defect cost v4/v5 their legend row for two releases).
// Render from the SVG's own size instead:
//   node docs/render_framework_diagram_png.mjs 示例图/框架图-v3-en.svg 示例图/框架图-v3-en.png 2
//
// Layout conventions (keep them when you change the layout, or things overlap):
//   · a band puts its title at y+27, its subtitle at y+47 and starts content at y+56;
//   · x 62..820 is the pipeline column, x 1080..1638 is the md knowledge-base
//     column, x 820..1080 is the arrow corridor where the numbered write-back
//     arrows (5..9) live — their labels sit above the arrow line;
//   · the vertical flow spine (arrows 1..4) runs at x=400 between the bands;
//   · row heights are DERIVED from the card contents, never hand-written;
//   · every text line is measured while generating; a line wider than its
//     container prints WARN and the process exits with code 1.
//
// Content sources: vibe-math-v3/实现方案.md (the specification, authoritative)
// and README.en.md ("Vibe Math V3" section + the four-preset comparison table).
// Chinese characters appear only where the framework really uses them: the md
// anchor key names the scheduler parses, the entry-title literal, a few anchor
// values, and real directory / file names (Verified/命题, Verified/问题,
// Logs/报告.md, Logs/形式化.md).
// ============================================================
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '示例图', '框架图-v3-en.svg')

const W = 1720
const FONT = "'Segoe UI','Microsoft YaHei','PingFang SC','Hiragino Sans GB','Noto Sans CJK SC',sans-serif"
const MONO = "'Cascadia Mono','Consolas','SFMono-Regular',monospace"

const C = {
  ink: '#10202e', ink2: '#2c4557', mute: '#5d7788',
  frame: '#0b6fb8', frameBg: '#eaf3fd',
  house: '#b26a00', houseBg: '#fdf5e2',
  data: '#1f7a52', dataBg: '#eef7f1',
  gate: '#b3202c', gateBg: '#fdeef0',
  human: '#5b4bb8', humanBg: '#f1eefc',
  line: '#7d93a3',
}

// ---- geometry ----
const FULL_L = 40, FULL_R = W - 40                 // 40 .. 1680
const PL = 62, PR = 820                            // pipeline cards
const AX = 400                                     // vertical flow spine
const KL = 1080, KR = 1638                         // knowledge-base cards
const GX = (PR + KL) / 2                           // 950 — corridor label centre
const CORRIDOR = KL - PR - 16                      // label limit inside the corridor
const INNER = KR - PL                              // 1576 — full band content width
const C3 = (INNER - 2 * 20) / 3                    // 512 — three cards in a row
const C2 = (INNER - 20) / 2                        // 778 — two cards in a row

const warnings = []
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Rough text-width estimate: CJK / fullwidth 1.0em, everything else 0.56em.
const textWidth = (s, fs) => [...String(s)].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.56), 0) * fs
const fits = (s, fs, limit, where) => {
  const w = textWidth(s, fs)
  if (w > limit) warnings.push(`${where}: text width ${w.toFixed(0)} > available ${limit.toFixed(0)} — ${String(s).slice(0, 42)}…`)
  return w
}
// height a card needs for n lines whose first line is rendered at font size fs
// (rounded up: every derived coordinate below must stay an integer)
const CH = (n, fs = 13) => Math.ceil((n - 1) * (fs + 4) + fs + 16)

const out = []
const push = (s) => out.push(s)

// ---------- primitives (same language as generate_framework_diagram_v5.mjs) ----------
function band(x, y, w, h, title, sub, { fill, stroke, titleFill = C.ink }) {
  push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`)
  fits(title, 15, w - 36, 'band title')
  push(`<text x="${x + 18}" y="${y + 27}" font-size="15" font-weight="700" fill="${titleFill}">${esc(title)}</text>`)
  if (sub) {
    fits(sub, 12, w - 36, 'band sub')
    push(`<text x="${x + 18}" y="${y + 47}" font-size="12" fill="${C.mute}">${esc(sub)}</text>`)
  }
}

function card(x, y, w, h, lines, { fill = '#ffffff', stroke = C.frame, fs = 13, sfs = 11, titleFill = C.ink } = {}) {
  push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`)
  const cx = x + w / 2
  const lead = fs + 4
  const total = (lines.length - 1) * lead
  if (total + fs > h) warnings.push(`card@${x},${y}: ${lines.length} lines need height ${(total + fs).toFixed(0)} > container ${h}`)
  let ty = y + h / 2 - total / 2 + fs * 0.36
  lines.forEach((ln, i) => {
    const size = i === 0 ? fs : sfs
    fits(ln, size, w - 16, `card line@${x},${y}`)
    push(`<text x="${cx}" y="${ty.toFixed(1)}" font-size="${size}" font-weight="${i === 0 ? 700 : 400}" `
      + `fill="${i === 0 ? titleFill : C.ink2}" text-anchor="middle">${esc(ln)}</text>`)
    ty += lead
  })
}

function plain(x, y, text, { size = 12, fill = C.ink2, anchor = 'start', weight = 400, mono = false, limit = null, where = 'plain', halo = false } = {}) {
  if (limit) fits(text, size, limit, where)
  // halo: a white outline under the text, for labels that sit on top of a line
  push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"`
    + (halo ? ' paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"' : '')
    + (mono ? ` font-family="${MONO}"` : '') + `>${esc(text)}</text>`)
}

function arrow(x1, y1, x2, y2, { color = C.line, dashed = false, both = true, width = 1.6, marker = 'both' } = {}) {
  push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" `
    + (dashed ? 'stroke-dasharray="7 5" ' : '')
    + (both ? `marker-start="url(#${marker})" ` : '') + `marker-end="url(#${marker})"/>`)
}

function polyline(points, { color = C.human, width = 2, dashed = false, marker = 'bothHuman' } = {}) {
  const d = points.map((p, i) => (i ? 'L' : 'M') + ' ' + p[0] + ' ' + p[1]).join(' ')
  push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" `
    + (dashed ? 'stroke-dasharray="7 5" ' : '') + `marker-start="url(#${marker})" marker-end="url(#${marker})"/>`)
}

// ============================================================
// 1. CONTENT — every card, in reading order
// ============================================================
const CARD = {
  // --- row 1: interaction layer ---
  interact: { fs: 13, sfs: 10, stroke: C.frame, lines: [
    'User · main agent (assistant + reporter)',
    'natural language: translate requests / report progress / configure in Q&A / control commands',
    'does not solve · does not schedule — it only calls vibe_math_* tools and reports back',
  ] },
  trust: { fs: 12.5, sfs: 10, stroke: C.gate, titleFill: C.gate, lines: [
    'Trust tiers — the iron rule of trust',
    '1. Verified/ — absolutely trusted, citable as fact',
    '2. Propos/ cards marked 状态: 已验证·真/假 — trusted,',
    '    but the Verified/ copy prevails',
    '3. everything else (unconcluded propositions, Progress/,',
    '    Methods/ assertions, Notes/) — experiential reference only',
  ] },

  // --- row 2: scheduler layer ---
  sched: { fs: 13, sfs: 10, stroke: C.house, titleFill: '#8a5200', lines: [
    'Scheduler (plugin code)',
    'sole master control: keeps the md index,',
    'builds the state brief, validates the',
    'plan action by action, writes the files',
    'hard constraints enforced by code:',
    'concurrency · idempotency · already-verified',
    'objects are never rescheduled again · one',
    'writer per file (write ownership)',
  ] },
  planner: { fs: 13, sfs: 10, stroke: C.house, titleFill: '#8a5200', lines: [
    'Planner agent (planner)',
    'reads the state brief: problems +',
    'dependencies + survival rates, verifiable',
    'objects, active agents, budget, available',
    'methods, last plan result',
    'arranges the next N steps in one go:',
    'spawn / continue / interrupt / promote /',
    'verify / method-keep / wait',
  ] },
  problems: { fs: 12, sfs: 10, stroke: C.human, titleFill: '#3f2f8f', lines: [
    'Problems/ — problem list · one md per problem',
    'statement / status / priority / dependencies /',
    'dependents / source·motivation / plan /',
    'solution candidates',
    'follow-up problems (q_sub) register the temp problem,',
    'the judgement problem and the temporary assumption',
    'p_{q-tmp} (a Propos/ card) — source and motivation',
    'are first-class anchors here',
  ] },

  // --- row 3: direction solving ---
  solver: { fs: 13, sfs: 10, stroke: C.data, titleFill: '#125a3c', lines: [
    'Explorer → Solver × N',
    'splits the problem into widely divergent directions (constraint decomposition, boundary tests, analogous problems);',
    'all dead ends → re-derive, and the old direction log is archived',
    'one solver per direction, multiple rounds inside the same session; it checks Methods/ first, then reports',
    'methods_used / new_inventions and writes Progress/<id>/<direction>.md',
  ] },
  progress: { fs: 12, sfs: 10, stroke: C.human, titleFill: '#3f2f8f', lines: [
    'Progress/ — research log · one md per problem',
    'direction × round narrative: one independent file',
    'per direction Progress/<id>/<direction>.md, so',
    'self-organizing agents never conflict with each other',
    'the aggregated index Progress/<id>.md carries the per-',
    'direction summaries + the lemma index + the rounds',
    'old directions are archived [archived directions]',
  ] },

  // --- row 4: cross-verification ---
  verifier: { fs: 13, sfs: 10, stroke: C.data, titleFill: '#125a3c', lines: [
    'Verifier × ≥3 (harsh reviewers)',
    'each object gets ≥3 independent reviewers: independent review → debate (chat group) → ruling;',
    'during the first pass they cannot see each other',
    'each one returns Result ∈ [0,1] plus Reason — 1 needs a complete proof, 0 needs a rigorous disproof,',
    'anything strictly in between is a genuine abstention / doubt',
    'near-consensus ruling: all results on the same side and mean ≥0.85 / ≤0.15 → take the mean',
    '(0.9 vs 1 → 0.95); otherwise verdictMode = forced (historical accuracy + rigor) / flat (0.5)',
    'this rule fixes the v2 defect of misjudging the high-confidence "0.9 vs 1" as 0.5',
  ] },
  propos: { fs: 12, sfs: 10, stroke: C.human, titleFill: '#3f2f8f', lines: [
    'Propos/ — proposition library',
    'one md per proposition (a category subdirectory',
    'is optional): statement / probability /',
    'proof·disproof attempts / dependencies',
    'a card marked 状态: 已验证·真/假 is trusted, but',
    'the Verified/ copy prevails; everything else is',
    'an estimate, not an established fact',
  ] },

  // --- row 5: method distillation ---
  keeper: { fs: 13, sfs: 10, stroke: C.data, titleFill: '#125a3c', lines: [
    'Method Keeper (method-organizing agent)',
    'digests recent work, Progress/Propos/Logs and the new_inventions reports (scheduled by',
    'methodKeepIntervalMs / methodKeepEvery) and distils them',
    'distils new method cards (状态: 经验) · merges duplicate and fragmentary entries',
    'improves the system hierarchy (上级体系 / 子方法) · maintains the 可信断言 of each card',
    'the library is universal: theories, frameworks, tools, methods, ideas, paradigms, techniques —',
    'what was invented to solve one problem becomes reusable for the next ones',
  ] },
  methods: { fs: 12, sfs: 10, stroke: C.human, titleFill: '#3f2f8f', lines: [
    'Methods/ — general theory invention library',
    '+ the global VibeMath/Methods/, reused across projects',
    'theories / frameworks / tools / methods / ideas',
    'invented while solving (group theory for an equation,',
    'functional analysis for variational problems)',
    'application records · improvement history · the',
    'system hierarchy (上级体系 / 子方法)',
    "a card's 可信断言 may only link IDs that already",
    'entered Verified/ — everything else in the card stays',
    'experiential reference and is never cited as a theorem',
    'project → global promotion uses methodAutoPromote,',
    'otherwise it waits behind a manual gate; the library',
    'keeps growing across projects and across sessions',
  ] },

  // --- row 6: closing / write-back ---
  closing: { fs: 13, sfs: 10, stroke: C.gate, titleFill: C.gate, lines: [
    'Closing — the iron rule of trust',
    'probability = 1 → Verified/ card (read-only, absolutely trusted): the complete trusted statement +',
    'every proof / disproof / solution whose probability is 1 + the verdict (true / false) + time + source',
    'only verified content is injected into later prompts as fact; unverified objects never are',
    'the scheduler rewrites the 状态 / 概率 anchors, generates the Verified/ copy and updates State/index.json',
  ] },
  verified: { fs: 12, sfs: 10, stroke: C.human, titleFill: '#3f2f8f', lines: [
    'Verified/ — absolutely trusted (read-only)',
    'Verified/命题/<id>.md · Verified/问题/<id>.md',
    'Logs/Verification/ debate records · Logs/Plans/',
    'plan audits (the planner learning loop) · Logs/报告.md',
    'State/*.json — scheduler-private state, not knowledge',
  ] },

  // --- band 7: the soft-spec contract ---
  softA: { fs: 12.5, sfs: 10, stroke: C.human, titleFill: '#3f2f8f', lines: [
    'Anchors — the only mandatory part',
    '4–7 lines of `- key: value` at the head of an object md',
    '- ID/类型/状态/概率/优先级/依赖/被依赖/来源/计划/',
    '  上级体系/子方法/相关/可信断言:',
    'the scheduler rebuilds State/index.json from these',
  ] },
  softB: { fs: 12.5, sfs: 10, stroke: C.human, titleFill: '#3f2f8f', lines: [
    'Entry titles — also machine-parsed',
    '### 解法/证明/证伪 N｜标题｜概率X｜状态Y',
    'one such title per solution / proof / disproof attempt,',
    'each followed by its full narrative text',
    'the scheduler never parses the body prose',
  ] },
  softC: { fs: 12.5, sfs: 10, stroke: C.human, titleFill: '#3f2f8f', lines: [
    'Everything else is free prose',
    'paper / research-report style: statements, derivations,',
    'counterexamples, lessons — self-organized by the agent',
    'the 状态 / 概率 anchor lines are rewritten by the',
    'scheduler on verdict write-back; the body is append-only',
    'and is never overwritten (anchors are edited in place,',
    'text-level, so agent-written prose survives)',
  ] },

  // --- band 8: write ownership ---
  lockA: { fs: 12, sfs: 10, stroke: C.frame, lines: [
    '1 — claim the write lock',
    'vibe_math_claim_write({target}) before writing',
    'only one agent may write a given file at a time;',
    'a busy lock tells you to wait and retry',
    'the lock table is process-level, and its purpose is',
    'to stop two agents from interleaving appends into',
    'one md file',
  ] },
  lockB: { fs: 12, sfs: 10, stroke: C.frame, lines: [
    '2 — write  ·  3 — release',
    "write only your own assigned file; append and",
    "continue, never edit another agent's anchors",
    'vibe_math_release_write({target}) when you are done',
    'the content stays in the md file — only lightweight',
    'metadata goes back to the scheduler',
  ] },
  lockC: { fs: 12, sfs: 10, stroke: C.frame, lines: [
    '4 — sync metadata (+ fallback)',
    'vibe_math_sync_meta({meta}) reports direction status',
    '/ survival, lemma ids + proof, method card ids, new',
    'inventions, solutions — enough to keep the index in',
    'sync, without moving knowledge into JSON',
    'fallback when file tools are unavailable: reply with',
    'JSON __writes[] + meta and the scheduler writes to disk',
  ] },

  // --- band 9: planner degradation + isolation ---
  fallback: { fs: 12.5, sfs: 10.5, stroke: C.house, titleFill: '#8a5200', lines: [
    'Planner fallback — an enhancement, not a requirement',
    'plannerEnabled = false → the built-in v2-style heuristic scheduling is used instead',
    'no output / timeout / invalid JSON → fall back to the heuristic scheduler within the same tick',
    'plannerMaxFails = 3 consecutive failures → degrade to pure heuristic mode (re-enable in settings)',
    'planMinIntervalMs = 30000 is a cooldown between planning calls; it is ignored when the system is',
    'idle and there is work, so a plan is produced immediately',
    'the plan (JSON, at most planningHorizon = 3 actions) is validated action by action, then executed',
    'actions beyond the current concurrency enter the pending queue (plans.json) and are consumed across',
    'ticks; every plan + its per-action result goes to Logs/Plans/ (the planner learning loop)',
  ] },
  projectlock: { fs: 12.5, sfs: 10.5, stroke: C.house, titleFill: '#8a5200', lines: [
    'Project lock and multi-session isolation',
    'per-session Session: root agent / current project / scheduler / registry / decision queue /',
    'parameters / task stack are all isolated per root session; childOwner routes subagent/end',
    'and each session has its own current.<sessionId>.json',
    'State/project.lock (holding the session id + a timestamp): one project is scheduled by one',
    'session at a time — md appends conflict more easily than JSON, which is why this guard exists',
    'a second session is told "project occupied by session X", or waits up to projectLockTimeoutMs',
    "processEpoch stays process-level, so two sessions in one process never mark each other's",
    'subagents stale; the lock is released on pause / termination / when everything is resolved',
  ] },

  // --- band 10: adjustable parameters ---
  parA: { fs: 12.5, sfs: 10, stroke: C.gate, titleFill: C.gate, lines: [
    'Added by v3 (default)',
    'planningHorizon = 3 — actions per plan',
    'plannerEnabled = true',
    'plannerProvider / plannerModel (empty = inherit)',
    'plannerPersona (empty)',
    'planMinIntervalMs = 30000',
    'plannerMaxFails = 3',
    'methodKeepIntervalMs = 0 (event-driven)',
    'methodKeepEvery = 5',
    'methodAutoPromote = false (manual gate)',
    'indexAutoRebuild = true',
    'projectLockTimeoutMs = 60000',
    'methodKeeperPersona (empty)',
    'verdictMode = forced (near-consensus first)',
  ] },
  parB: { fs: 12.5, sfs: 10, stroke: C.gate, titleFill: C.gate, lines: [
    'Lean formal verification (4 parameters)',
    'formalVerify = off | encourage | require',
    '   default off; an illegal value always falls back to',
    '   off, never to a stronger tier',
    '   off: no Lean wording appears anywhere (a true no-op),',
    '   yet the three Lean tools stay registered',
    '   encourage: formalize when the implementation is easy',
    '   enough; once Lean passes, the only question left is',
    '   fidelity to the proposition text',
    '   require: a true/false ruling needs formal.status ∈',
    '   {passed, blocked}; otherwise it is recorded as',
    '   undecided (formal-required) + Formal/TODO.md',
    'leanCommand = "lean"  (e.g. "lake"; blank → "lean")',
    'leanArgs = []  (inserted before the .lean file name)',
    'leanTimeoutMs = 120000',
    'tools: vibe_math_lean_run · vibe_math_lean_archive',
    '· vibe_math_lean_lib (always written in full)',
  ] },
  parC: { fs: 12.5, sfs: 10, stroke: C.gate, titleFill: C.gate, lines: [
    'Inherited from v2 (unchanged)',
    'mode · maxParallelThreshold · solverMaxRounds',
    'directionsPerSolver · verifierCount · debateMaxRounds',
    'reportMode = file | push | both · reportIntervalMs',
    'promoteValueThreshold · priorityAdjust',
    'proposPriorityAdjust · knowledgeContext',
    'provider / model · the three personas',
    'tool allow / deny lists · network / script switches',
    'solverMaxToolCalls / verifierMaxToolCalls',
    'tickIntervalMs = 2000 · activityLogCap = 100',
    'maxExplorerRetries = 3',
    'source of truth: vibe_math_setting.json (JSONC,',
    'project level, global fallback) + vibe_math_setup',
  ] },
}

const H_CARD = (k) => CH(CARD[k].lines.length, CARD[k].fs)
const put = (k, x, y, w) => card(x, y, w, H_CARD(k), CARD[k].lines, CARD[k])

// ---- row layout: [x, width, card key] ----
const ROW_LAYOUT = [
  [[PL, 758, 'interact'], [KL, KR - KL, 'trust']],
  [[PL, 370, 'sched'], [502, 318, 'planner'], [KL, KR - KL, 'problems']],
  [[PL, 758, 'solver'], [KL, KR - KL, 'progress']],
  [[PL, 758, 'verifier'], [KL, KR - KL, 'propos']],
  [[PL, 758, 'keeper'], [KL, KR - KL, 'methods']],
  [[PL, 758, 'closing'], [KL, KR - KL, 'verified']],
]
const rowContent = ROW_LAYOUT.map((row) => Math.max(...row.map(([, , k]) => H_CARD(k))))
const RH = rowContent.map((c) => 56 + c + 16)

const BAND_KEYS = [['softA', 'softB', 'softC'], ['lockA', 'lockB', 'lockC'], ['fallback', 'projectlock'], ['parA', 'parB', 'parC']]
const BH = BAND_KEYS.map((keys) => 56 + Math.max(...keys.map(H_CARD)) + 16)

// ---- vertical stack ----
const Y0 = 88, G1 = 46, G2 = 34
const yRow = []
let cursor = Y0
for (let i = 0; i < 6; i++) {
  yRow.push(cursor)
  cursor += RH[i] + (i < 5 ? G1 : G2)
}
const ySoft = cursor; cursor += BH[0] + G2
const yWrite = cursor; cursor += BH[1] + G2
const yIso = cursor; cursor += BH[2] + G2
const yParam = cursor; cursor += BH[3] + G2
const yBar = cursor
const yLegend = yBar + 48 + 24
const H = yLegend + 24

const CT = (i) => yRow[i] + 56                              // content top of pipeline row i
const CY = (i) => CT(i) + rowContent[i] / 2                 // arrow y inside pipeline row i
const RB = (i) => yRow[i] + RH[i]                           // bottom of pipeline row i

// ============================================================
// 2. DOCUMENT
// ============================================================
push('<?xml version="1.0" encoding="UTF-8"?>')
push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vibe Math V3 architecture diagram (English)">`)
push(`<defs>
  <marker id="both" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.line}"/></marker>
  <marker id="bothHuman" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.human}"/></marker>
  <marker id="bothFrame" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.frame}"/></marker>
  <marker id="bothData" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.data}"/></marker>
  <marker id="bothHouse" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.house}"/></marker>
  <marker id="bothGate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.gate}"/></marker>
  <marker id="spine" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.ink2}"/></marker>
</defs>`)
push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
push(`<g font-family="${FONT}">`)

// ---- title ----
plain(W / 2, 40, 'Vibe Math V3 — multi-agent mathematical research and verification framework',
  { size: 26, fill: C.ink, anchor: 'middle', weight: 700, limit: FULL_R - FULL_L, where: 'title' })
plain(W / 2, 68, 'paper-style md knowledge base (soft-spec anchors + free narration) · the planner agent lays out the next N steps by itself · invented theories / frameworks / tools / methods / ideas are distilled into a universal method library',
  { size: 12.5, fill: C.mute, anchor: 'middle', limit: FULL_R - FULL_L, where: 'subtitle' })

// ---- the six pipeline rows ----
const BANDS = [
  {
    y: yRow[0], h: RH[0],
    title: 'Interaction layer — user and main agent (assistant + reporter)',
    sub: 'natural language in · reports progress out · configures parameters in Q&A · holds the control commands for the human',
    fill: C.frameBg, stroke: C.frame, titleFill: '#084d80',
  },
  {
    y: yRow[1], h: RH[1],
    title: 'Scheduler layer — plugin code + planner agent',
    sub: 'the scheduler is the sole writer of the md knowledge base: anchor index, structural moves, and every hard constraint enforced by code',
    fill: C.houseBg, stroke: C.house, titleFill: '#8a5200',
  },
  {
    y: yRow[2], h: RH[2],
    title: 'Subagent layer — direction solving (continuable persistent sessions)',
    sub: 'Explorer splits directions and one Solver per direction iterates; every subagent writes its own md file',
    fill: C.dataBg, stroke: C.data, titleFill: '#125a3c',
  },
  {
    y: yRow[3], h: RH[3],
    title: 'Subagent layer — cross-verification',
    sub: 'at least three harsh reviewers per object: independent review → debate (chat group) → ruling; then the scheduler writes the anchors and the Verified/ copy back',
    fill: C.dataBg, stroke: C.data, titleFill: '#125a3c',
  },
  {
    y: yRow[4], h: RH[4],
    title: 'Subagent layer — method distillation',
    sub: 'the Method Keeper digests recent work and invention reports into Methods/ (project level, promotable to the global cross-project layer)',
    fill: C.dataBg, stroke: C.data, titleFill: '#125a3c',
  },
  {
    y: yRow[5], h: RH[5],
    title: 'Closing · write-back · data layer (md knowledge base)',
    sub: 'VibeMath/Projects/<project>/ — different types live in different paths; only Verified/ and objects judged true/false may be cited as fact',
    fill: C.humanBg, stroke: C.human, titleFill: '#3f2f8f',
  },
]
BANDS.forEach((b, i) => band(FULL_L, b.y, FULL_R - FULL_L, b.h, b.title, b.sub, b))
ROW_LAYOUT.forEach((row, i) => row.forEach(([x, w, k]) => put(k, x, CT(i), w)))

// ---- band 7: the soft-spec contract ----
band(FULL_L, ySoft, FULL_R - FULL_L, BH[0], 'The soft-spec contract — minimum enforcement + maximum freedom',
  'only the head anchors and the entry title lines are machine-parsed; the rest is free paper-style prose (v3 deliberately imposes no stricter format)',
  { fill: C.humanBg, stroke: C.human, titleFill: '#3f2f8f' })
put('softA', PL, ySoft + 56, C3)
put('softB', PL + C3 + 20, ySoft + 56, C3)
put('softC', PL + 2 * (C3 + 20), ySoft + 56, C3)

// ---- band 8: write ownership ----
band(FULL_L, yWrite, FULL_R - FULL_L, BH[1], 'Write ownership — agents write their own Markdown, the scheduler keeps the index',
  'one writer per file at a time; only the scheduler performs structural moves (generating Verified/ copies, promotion)',
  { fill: C.frameBg, stroke: C.frame, titleFill: '#084d80' })
put('lockA', PL, yWrite + 56, C3)
put('lockB', PL + C3 + 20, yWrite + 56, C3)
put('lockC', PL + 2 * (C3 + 20), yWrite + 56, C3)

// ---- band 9: planner degradation + isolation ----
band(FULL_L, yIso, FULL_R - FULL_L, BH[2], 'Planner degradation and multi-session isolation',
  'the planner agent is an enhancement, not a requirement — md appends conflict more easily than JSON, which is why the project lock exists',
  { fill: C.houseBg, stroke: C.house, titleFill: '#8a5200' })
put('fallback', PL, yIso + 56, C2)
put('projectlock', PL + C2 + 20, yIso + 56, C2)

// ---- band 10: adjustable parameters ----
band(FULL_L, yParam, FULL_R - FULL_L, BH[3], 'Adjustable parameters — planner, method library and Lean formal verification',
  'vibe_math_set_params applies them at runtime; the single persistent source is vibe_math_setting.json (JSONC with comments, project level falling back to global)',
  { fill: C.gateBg, stroke: C.gate, titleFill: C.gate })
put('parA', PL, yParam + 56, C3)
put('parB', PL + C3 + 20, yParam + 56, C3)
put('parC', PL + 2 * (C3 + 20), yParam + 56, C3)

// ============================================================
// 3. ARROWS — drawn after every band and card so the lines stay on top
// ============================================================

// ---- feedback loop: the method library is consulted, and it grows ----
const loopX = 1072, loopTop = CT(2) + 16, loopBottom = CY(4) + 30
polyline([[KL, loopBottom], [loopX, loopBottom], [loopX, loopTop], [PR, loopTop]],
  { color: C.human, width: 1.8, dashed: true })
plain(GX - 7, loopTop - 17, 'consult Methods/ before starting,', { size: 9.5, fill: C.human, anchor: 'middle', halo: true, limit: 230, where: 'method loop' })
plain(GX - 7, loopTop - 4, 'record the application after use', { size: 9.5, fill: C.human, anchor: 'middle', halo: true, limit: 230, where: 'method loop' })

// ---- spine: the numbered pipeline steps 1..4 ----
const spine = (i, lines) => {
  arrow(AX, RB(i) + 4, AX, yRow[i + 1] - 4, { color: C.ink2, both: false, width: 2, marker: 'spine' })
  const mid = RB(i) + 23
  lines.forEach((ln, k) => {
    const y = lines.length === 1 ? mid + 4 : mid - 6 + k * 14
    plain(AX + 16, y, ln, { size: 10.5, fill: C.ink2, limit: PR - AX - 16, where: 'spine label', halo: true })
  })
}
spine(0, ['vibe_math_* tools'])
spine(1, ['① plan validated → spawn Explorer and one Solver per direction'])
spine(2, ['② pick r (proposition / proposition+proof·disproof /', 'problem+solution) → dispatch ≥3 verifiers'])
spine(3, ['③ ruling → near-consensus close-out'])
spine(4, ['④ probability = 1 → Verified/ card'])

// ---- corridor: the numbered write-back arrows 5..9 ----
const corridorLabel = (arrowY, lines, color) => {
  lines.forEach((ln, i) => {
    const y = arrowY - 8 - (lines.length - 1 - i) * 13
    plain(GX, y, ln, { size: 9.5, fill: color, anchor: 'middle', limit: CORRIDOR, where: 'corridor label', halo: true })
  })
}
arrow(PR, CY(1), KL, CY(1), { color: C.human, both: true, width: 1.8, marker: 'bothHuman' })
corridorLabel(CY(1), ['⑤ register problems, follow-up problems', 'and the plan write-back'], C.human)
arrow(PR, CY(2), KL, CY(2), { color: C.human, both: true, width: 1.8, marker: 'bothHuman' })
corridorLabel(CY(2), ['⑥ write lemmas / sub-routes / solutions', '(probability < 1)'], C.human)
arrow(KL, CY(3), PR, CY(3), { color: C.human, both: false, width: 1.8, marker: 'bothHuman' })
corridorLabel(CY(3), ['⑦ propositions / proofs → verification'], C.human)
arrow(PR, CY(4), KL, CY(4), { color: C.human, both: true, width: 1.8, marker: 'bothHuman' })
corridorLabel(CY(4), ['⑧ methods_used / new_inventions', '→ methods library'], C.human)
arrow(PR, CY(5), KL, CY(5), { color: C.gate, both: true, width: 1.8, marker: 'bothGate' })
corridorLabel(CY(5), ['⑨ conclusion → Verified/ card (read-only)'], C.gate)

// ---- scheduler <-> planner: the state brief and the plan ----
arrow(432, CY(1), 502, CY(1), { color: C.house, both: true, width: 1.8, marker: 'bothHouse' })
plain(467, CY(1) - 7, 'state brief →', { size: 9, fill: C.house, anchor: 'middle', limit: 70, where: 'brief label', halo: true })
plain(467, CY(1) + 15, '← plan JSON', { size: 9, fill: C.house, anchor: 'middle', limit: 70, where: 'plan label', halo: true })

// ============================================================
// 4. BOTTOM BAR + LEGEND
// ============================================================
const barW = Math.floor((INNER - 4 * 16) / 5)
const bar = [
  ['Only Verified/ and objects judged', 'true/false are absolutely trusted'],
  ['Soft-spec anchors + free narration', '(the scheduler parses anchors only)'],
  ['Planning failure → automatic', 'fallback to heuristic scheduling'],
  ['Checkpoint resume (md is the', 'narrative breakpoint + process epoch)'],
  ['Per-session isolation + project lock', 'State/project.lock, projectLockTimeoutMs'],
]
bar.forEach((lines, i) => {
  card(PL + i * (barW + 16), yBar, barW, 48, lines, { fill: '#f7f8f9', stroke: C.line, fs: 12, sfs: 9.5 })
})

plain(FULL_L + 12, yLegend, 'Legend', { size: 12, fill: C.ink, weight: 700 })
const legend = [
  [C.data, 'Subagent layers (solver, verifier, keeper)'],
  [C.house, 'Planner agent and its fallback'],
  [C.frame, 'Framework, scheduler, write lock'],
  [C.human, 'md knowledge base / write-back'],
  [C.gate, 'Truth rules, parameters, Lean verification'],
]
legend.forEach(([col, txt], i) => {
  const x = 108 + i * 300
  push(`<rect x="${x}" y="${yLegend - 11}" width="14" height="14" rx="3" fill="#ffffff" stroke="${col}" stroke-width="2"/>`)
  plain(x + 21, yLegend + 1, txt, { size: 11, fill: C.ink2, limit: 272, where: 'legend' })
})

push('</g>')
push('</svg>')

// ============================================================
// 5. WRITE + LAYOUT SELF-CHECK
// ============================================================
mkdirSync(dirname(OUT), { recursive: true })
const svg = out.join('\n')
writeFileSync(OUT, svg, 'utf8')
console.log('saved ' + OUT + ' (' + svg.length + ' bytes, canvas ' + W + 'x' + H + ')')
if (warnings.length) {
  console.error('\nlayout warnings (text may overflow its container):')
  for (const w of warnings) console.error('  WARN ' + w)
  process.exit(1)
}
console.log('layout: no overflow warnings')
