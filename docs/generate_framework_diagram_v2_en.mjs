// ============================================================
// Vibe Math V2 architecture diagram generator (English edition, zero-dependency, pure Node)
//
//   node docs/generate_framework_diagram_v2_en.mjs
//   → writes 示例图/框架图-v2-en.svg
//
// Why an SVG generator instead of the matplotlib PNG (docs/generate_framework_diagram_v2.py):
//   · the repository runtime already ships Node — no Python / matplotlib to install;
//   · SVG is plain text: diff-friendly, reviewable, and crisp at any zoom.
// When a PNG is needed (market carousel / preview), do NOT screenshot a window —
// render from the SVG's own size instead:
//   node docs/render_framework_diagram_png.mjs 示例图/框架图-v2-en.svg 示例图/框架图-v2-en.png 2
//
// Layout conventions (keep them when editing, or boxes will overlap):
//   · a band's title sits at y+27, its subtitle at y+47, content starts at y+56;
//   · pipeline column x=190..850, data column x=940..1656; x=22 stays free so the
//     write-back loop can run outside every band and never crosses title text;
//   · text width is estimated while generating; any line that would overflow its
//     container prints a WARN and the process exits with code 1.
//
// Content sources: vibe-math-v2/实现方案.md (specification) and README.en.md.
// Identifiers follow README.en.md: v2's JSON keys are Chinese in the implementation,
// so their official English renderings are used here (overview / solved / boolean
// estimate / proof list / disproof list / value·criticality / priority / progress).
// ============================================================
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '示例图', '框架图-v2-en.svg')

const W = 1720
const FONT = "'Segoe UI','Helvetica Neue',Arial,'Noto Sans',sans-serif"
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

// ---------- geometry ----------
const FULL_L = 40, FULL_R = W - 40                  // 40 .. 1680
const IN_L = FULL_L + 22, IN_R = FULL_R - 22        // 62 .. 1658
const COL1_X = 190, COL1_W = 660                    // pipeline column  190 .. 850
const COL2_X = 940, COL2_W = 716                    // data column      940 .. 1656
const GRID_X = [62, 600, 1138], GRID_W = 518        // 3-column grid     62 .. 1656
const FLOW_X = 540, LOOP_X = 22
const GAP = 18

const warnings = []
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// Rough text-width estimate: CJK / full-width 1.0em, everything else 0.56em.
// Used to catch overflow far faster than rendering a screenshot.
const textWidth = (s, fs) => [...String(s)].reduce((n, ch) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.56), 0) * fs
const fits = (s, fs, limit, where) => {
  const w = textWidth(s, fs)
  if (w > limit) warnings.push(`${where}: text width ${w.toFixed(0)} > available ${limit.toFixed(0)} — ${String(s).slice(0, 48)}…`)
  return w
}

const body = []
const push = (s) => body.push(s)

// ---------- primitives ----------
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

// Left-aligned monospace block with its own frame (used for the file-layout trees).
// Runs of spaces are turned into NBSP: SVG collapses whitespace by default, which
// would destroy the column alignment of a tree.
function block(x, y, w, lines, { stroke = C.data, fs = 11.5, lead = 15.5, pad = 12 } = {}) {
  const h = (lines.length - 1) * lead + fs + pad * 2
  push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#ffffff" stroke="${stroke}" stroke-width="1.6"/>`)
  lines.forEach((ln, i) => {
    fits(ln, fs, w - 20, 'tree line')
    plain(x + 12, y + pad + fs + i * lead, ln.replace(/ /g, '\u00a0'), { size: fs, mono: true, fill: C.ink2 })
  })
  return h
}

function legend(y, items, { x0 = 108, step = 320, box = 14, size = 11, limit = 300 } = {}) {
  plain(x0 - 56, y + 12, 'Legend', { size: 12, fill: C.ink, weight: 700 })
  items.forEach(([col, txt], i) => {
    const x = x0 + i * step
    push(`<rect x="${x}" y="${y}" width="${box}" height="${box}" rx="3" fill="#ffffff" stroke="${col}" stroke-width="2"/>`)
    plain(x + box + 7, y + 12, txt, { size, fill: C.ink2, limit, where: 'legend' })
  })
}

// ---------- document head ----------
// The canvas height is only known once the body has been laid out, so the whole
// drawing goes into `body` first and the <svg> header is assembled at the end.

// ---------- layout cursor ----------
let y = 84
function nextBand(h) { const top = y; y = top + h + GAP; return top }

// ============================================================
// 1. Truth gate
// ============================================================
const bGate = nextBand(114)
band(FULL_L, bGate, FULL_R - FULL_L, 114,
  'Truth gate — the only rule that lets an object enter Verified/',
  'a probability is strict: new results must be strictly between 0 and 1 · only the verifiers settle exactly 1 (true) or exactly 0 (false) · anything in between stays in its library',
  { fill: C.gateBg, stroke: C.gate, titleFill: C.gate })
card(GRID_X[0], bGate + 56, GRID_W, 44, [
  'all verifiers agree (all 1, or all 0)',
  'near-consensus → that boolean is the verdict, immediately',
], { stroke: C.gate, fs: 12.5, sfs: 10.5 })
card(GRID_X[1], bGate + 56, GRID_W, 44, [
  'otherwise: adjudication by verdictMode',
  'flat = balanced (0.5) · forced = weighted by accuracy + rigor',
], { stroke: C.gate, fs: 12.5, sfs: 10.5 })
card(GRID_X[2], bGate + 56, GRID_W, 44, [
  'only exactly 1 or exactly 0 enters Verified/',
  'a solver must never mark its own new lemma or solution as 1 or 0',
], { stroke: C.gate, fs: 12.5, sfs: 10.5 })

// ============================================================
// 2. Interaction layer — user · main agent
// ============================================================
const bInter = nextBand(56 + 104 + 14)
band(FULL_L, bInter, FULL_R - FULL_L, 56 + 104 + 14,
  'Interaction layer — user · main agent (assistant + reporter)',
  'natural language in · requirements, progress and configuration out · the main agent neither solves nor schedules nor votes',
  { fill: C.humanBg, stroke: C.human, titleFill: C.human })
card(IN_L, bInter + 56, 788, 104, [
  'user · main agent (assistant + reporter)',
  'the user states a need in natural language: "solve XX" · "what is the progress?" · "pause"',
  'the main agent translates it into vibe_math_* tool calls and echoes the results back',
  'it configures parameters by Q&A (/vibe setup) and reports progress in plain language',
  'it never solves and never schedules — the scheduler is plugin code, not a model',
  'it does not vote either: only verifiers settle a probability at exactly 1 or exactly 0',
], { stroke: C.human, fs: 13, sfs: 10.5 })
card(COL2_X, bInter + 56, COL2_W, 104, [
  'vibe_math_* tools and the /vibe slash command (equivalent)',
  'add_problem · add_proposition · list_propositions · new_project · set_project · list_projects',
  'start · resume · pause · abort · status · report · set_mode · set_params · setup',
  'save_settings · template · list_decisions · decide · list_agents · message_agent',
  'interrupt_agent · lean_run · lean_archive · lean_lib (the three Lean tools)',
  '/vibe start|resume|pause|abort|status|report|mode|setup|save|template|add|add-proposition|…',
], { stroke: C.human, fs: 13, sfs: 10.5 })
arrow(IN_L + 788, bInter + 108, COL2_X, bInter + 108, { color: C.human, marker: 'bothHuman', width: 1.8 })
plain((IN_L + 788 + COL2_X) / 2, bInter + 102, 'tools', { size: 10, fill: C.human, anchor: 'middle', halo: true })

// ============================================================
// 3. Scheduling layer — plugin code
// ============================================================
const bSched = nextBand(56 + 124 + 14)
band(FULL_L, bSched, FULL_R - FULL_L, 56 + 124 + 14,
  'Scheduling layer — plugin code · probability-driven · the sole file writer',
  'a smaller priority integer is scheduled first · "never" is never scheduled (and does not block termination) · a new dispatch waits until active sub-agents < maxParallelThreshold',
  { fill: C.houseBg, stroke: C.house, titleFill: '#8a5200' })
card(COL1_X, bSched + 56, COL1_W, 124, [
  'scheduler — plugin code · probability-driven (never a model)',
  'the sole file writer: sub-agents only return structured JSON and never write files',
  'takes the highest-priority unsolved problem from qs/qs.json, dispatches explorer /',
  'solver / verifier, advances the state machine, and writes every result to disk',
  'a new dispatch waits until active sub-agents < maxParallelThreshold (default 4)',
  'checkpoint persistence: VibeMath_State/*.json + process epoch · tickIntervalMs heartbeat',
], { stroke: C.house, fs: 12.5, sfs: 10.5 })
card(COL2_X, bSched + 56, COL2_W, 58, [
  'qs/qs.json — problem list (single source for solving & verification)',
  'overview / solved / solution list (complete solution · correctness probability) / priority / progress',
  'v2 writes JSON only — the v1-era qs/qs.csv is no longer produced',
], { stroke: C.data, fs: 12.5, sfs: 10.5 })
card(COL2_X, bSched + 122, COL2_W, 58, [
  'VibeMath_State/*.json — scheduler-private state (checkpoint / resume)',
  'scheduler_state · agent_registry · decision_queue · verifier_accuracy',
  'tasks · explorer_retries · process_epoch · formal.json',
], { stroke: C.data, fs: 12.5, sfs: 10.5 })
arrow(COL1_X + COL1_W, bSched + 85, COL2_X, bSched + 85, { color: C.data, marker: 'bothData' })
plain((COL1_X + COL1_W + COL2_X) / 2, bSched + 79, 'read/write', { size: 10, fill: C.data, anchor: 'middle', halo: true })
arrow(COL1_X + COL1_W, bSched + 151, COL2_X, bSched + 151, { color: C.data, marker: 'bothData' })
plain((COL1_X + COL1_W + COL2_X) / 2, bSched + 145, 'state', { size: 10, fill: C.data, anchor: 'middle', halo: true })

// ============================================================
// 4. Sub-agent layer · direction solving
// ============================================================
const bSolve = nextBand(56 + 124 + 14)
band(FULL_L, bSolve, FULL_R - FULL_L, 56 + 124 + 14,
  'Sub-agent layer · direction solving — brainstorm, then one solver per direction',
  'all directions are dead ends → re-derive brand-new ones (maxExplorerRetries) · one dedicated continuable session per direction, iterating up to solverMaxRounds rounds',
  { fill: C.frameBg, stroke: C.frame, titleFill: '#084d80' })
card(COL1_X, bSolve + 56, COL1_W, 124, [
  'explorer → solver × N (one continuable session each)',
  'brainstorm: constraint decomposition · boundary / extreme tests · similar-problem mapping',
  'split q into widely-divergent directions m_i, each with assumptions + a feasibility estimate',
  'non-empty progress: quantify it, prune proven dead ends, derive 1–3 brand-new directions',
  'the solver iterates in-session: lemmas + sub-routes + survival probability + full solution',
  'self-adversarial check (counterexamples, boundary cases) before END; solverMaxRounds cap',
], { stroke: C.frame, fs: 12.5, sfs: 10.5 })
card(COL2_X, bSolve + 56, COL2_W, 76, [
  'Propos/<category>_Propos.json — the proposition library',
  'overview · boolean estimate · fine type · priority · value/criticality · progress',
  'proof list / disproof list: complete derivation · correctness probability · evidence',
], { stroke: C.data, fs: 12.5, sfs: 10.5 })
card(COL2_X, bSolve + 140, COL2_W, 40, [
  'new results are written by the scheduler with probability < 1',
  'a hard sub-problem q_sub becomes a problem + a temporary hypothesis (boolean estimate 0.5)',
], { stroke: C.data, fs: 12.5, sfs: 10.5 })
arrow(COL1_X + COL1_W, bSolve + 94, COL2_X, bSolve + 94, { color: C.data, marker: 'bothData' })
plain((COL1_X + COL1_W + COL2_X) / 2, bSolve + 88, '② write', { size: 10, fill: C.data, anchor: 'middle', halo: true })
arrow(COL1_X + COL1_W, bSolve + 160, COL2_X, bSolve + 160, { color: C.data, marker: 'bothData' })
plain((COL1_X + COL1_W + COL2_X) / 2, bSolve + 154, 'append', { size: 10, fill: C.data, anchor: 'middle', halo: true })

// ============================================================
// 5. Sub-agent layer · cross-verification
// ============================================================
const bVeri = nextBand(56 + 124 + 14)
band(FULL_L, bVeri, FULL_R - FULL_L, 56 + 124 + 14,
  'Sub-agent layer · cross-verification — independent review → debate → adjudication',
  'every target r gets ≥ verifierCount (default 3) harsh reviewers · no communication before their first reports are in · the debate lasts at most debateMaxRounds rounds',
  { fill: C.frameBg, stroke: C.frame, titleFill: '#084d80' })
card(COL1_X, bVeri + 56, COL1_W, 124, [
  'verifier × ≥ 3 (harsh reviewers, one session each)',
  'r = proposition | proposition + proof/disproof | problem + solution',
  'independent review first: Result in [0,1] + Reason (a full proof at 1, a disproof at 0)',
  'they must not communicate before every first report is in — independence is the point',
  'debate in one chat group: every verifier speaks each round (agree · rebut · new evidence)',
  'the debate ends the moment all Results are 1 or all are 0; debateMaxRounds cap',
], { stroke: C.frame, fs: 12.5, sfs: 10.5 })
card(COL2_X, bVeri + 56, COL2_W, 58, [
  'Verification_logs/<rId>_<time>.json — the audit trail',
  'r · verdict · every verifier Result · the debate transcript · history',
  'verifier historical accuracy is kept for the forced (weighted) mode',
], { stroke: C.data, fs: 12.5, sfs: 10.5 })
card(COL2_X, bVeri + 122, COL2_W, 58, [
  'how the scheduler picks the next r',
  'from qs/qs.json or Propos/: an unsolved object whose probability is not 1 or 0',
  'a bare proposition may be picked only while both proof and disproof lists are empty',
], { stroke: C.data, fs: 12.5, sfs: 10.5 })
arrow(COL1_X + COL1_W, bVeri + 85, COL2_X, bVeri + 85, { color: C.data, marker: 'bothData' })
plain((COL1_X + COL1_W + COL2_X) / 2, bVeri + 79, 'log', { size: 10, fill: C.data, anchor: 'middle', halo: true })
arrow(COL1_X + COL1_W, bVeri + 151, COL2_X, bVeri + 151, { color: C.data, marker: 'bothData' })
plain((COL1_X + COL1_W + COL2_X) / 2, bVeri + 145, 'pick r', { size: 10, fill: C.data, anchor: 'middle', halo: true })

// ============================================================
// 6. Lean formal verification — the four adjustable parameters
// ============================================================
const LEAN_H = 56 + 84 + 16 + 84 + 14
const bLean = nextBand(LEAN_H)
band(FULL_L, bLean, FULL_R - FULL_L, LEAN_H,
  'Lean formal verification — four adjustable parameters (formalVerify · leanCommand · leanArgs · leanTimeoutMs)',
  'the level is dynamic: prompt text is recomputed at the moment the prompt is built, so switching formalVerify takes effect on the very next prompt',
  { fill: C.gateBg, stroke: C.gate, titleFill: C.gate })
const leanCards = [
  [
    'formalVerify = off | encourage | require (default off)',
    'off: a true no-op — no Lean text in any prompt, the verification flow is unchanged',
    'the three tools stay registered, so a proactive call still works',
    'encourage: formalize when the implementation difficulty allows — no gate',
    'require: a true/false verdict needs Lean passed or an explicit blocked record',
  ],
  [
    'require — the gate sits at the only closing point',
    'status passed (the last run has exitCode 0) or blocked (a non-empty note)',
    'otherwise the verdict does not take effect: undecided, reason formal-required',
    'no Verified/ card · boolean estimate / solved / priority stay unchanged',
    'the object stays in its library and can be re-proposed after formalizing',
  ],
  [
    'leanCommand = lean · leanArgs = [] · leanTimeoutMs = 120000',
    'leanArgs are inserted before the .lean file name (lake + ["env","lean"])',
    'an illegal formalVerify falls back to off, never to a stronger level',
    'a non-positive leanTimeoutMs is dropped and falls back to the default',
    'a timeout actively terminates the run (LEAN_TIMEOUT) and never throws',
  ],
  [
    'a fidelity defect is not "the proposition is false"',
    'the verifier must abstain (strictly between 0 and 1) and report',
    'formal:{decision:"defect", note:"<specific deviation>"}',
    'the framework withdraws the archived proof and downgrades it to attempted',
    'under require the verdict is undecided; vote 0 only with independent reasons',
  ],
  [
    'paths: Formal/<object id>.lean · Verified/Lean/<object id>.lean',
    'Formal/Index.md (object → status → file → run) · Formal/TODO.md',
    'cross-project: Formal/Lib/<name>.lean · Formal/Proved/<name>.lean',
    'tools: vibe_math_lean_run · vibe_math_lean_archive · vibe_math_lean_lib',
    'full tool names only — an abbreviation is not a registered tool',
  ],
  [
    'records: status none|attempted|passed|blocked + run {ok, exitCode, ms}',
    'persisted in VibeMath_State/formal.json → resume does not forget the gate',
    'two id spaces stay in sync: r-pGate / r-q1-s0 and the object id pGate',
    'a receipt may carry the defect from a verifier who never ran Lean',
    'the framework does not bundle Lean; a missing toolchain is a blocked note',
  ],
]
leanCards.forEach((lines, i) => {
  const col = i % 3, row = (i - col) / 3
  card(GRID_X[col], bLean + 56 + row * 100, GRID_W, 84, lines, { stroke: C.gate, fs: 12.5, sfs: 10.5 })
})

// ============================================================
// 7. Closing · write-back · data layer
// ============================================================
const bClose = nextBand(56 + 124 + 14)
band(FULL_L, bClose, FULL_R - FULL_L, 56 + 124 + 14,
  'Closing · write-back · data layer — probability = 1 closes the object',
  'problem solved = true · proposition boolean estimate 1/0 · priority = never · the scheduler is still the only writer; a sub-agent never touches a file',
  { fill: C.dataBg, stroke: C.data, titleFill: '#125a3c' })
card(COL1_X, bClose + 56, COL1_W, 124, [
  'probability = 1 → close out',
  'problem: solved = true · the complete solution is stored · priority = never',
  'proposition: boolean estimate = 1 or 0 · the proof / disproof is recorded · priority = never',
  'exactly 1 appends the proof at probability 1; exactly 0 appends the disproof at 1',
  'nothing strictly between 0 and 1 enters Verified/ — it stays in its library',
  'the loop stops when every problem in qs/qs.json is solved (never does not block it)',
], { stroke: C.data, fs: 12.5, sfs: 10.5 })
card(COL2_X, bClose + 56, COL2_W, 58, [
  'Verified/<category>_Verified.json — concluded facts',
  'boolean estimate exactly 1 (true) or exactly 0 (false) · read-only for everyone',
  'citations must name the file path + the object id — unsourced references are rejected',
], { stroke: C.gate, fs: 12.5, sfs: 10.5 })
card(COL2_X, bClose + 122, COL2_W, 58, [
  'Progress_Logs/report.json · Reliable/',
  'event-driven by default (reportIntervalMs = 0) · reportMode file | push | both',
  'Reliable/ is placed by the user and read-only; agents reason on Propos/ + Reliable/',
], { stroke: C.data, fs: 12.5, sfs: 10.5 })
arrow(COL1_X + COL1_W, bClose + 85, COL2_X, bClose + 85, { color: C.gate, marker: 'bothGate' })
plain((COL1_X + COL1_W + COL2_X) / 2, bClose + 79, 'gate', { size: 10, fill: C.gate, anchor: 'middle', halo: true })
arrow(COL1_X + COL1_W, bClose + 151, COL2_X, bClose + 151, { color: C.data, marker: 'bothData' })
plain((COL1_X + COL1_W + COL2_X) / 2, bClose + 145, 'report', { size: 10, fill: C.data, anchor: 'middle', halo: true })

// ============================================================
// 8. File layout (mono trees)
// ============================================================
// Aligns a tree's path column with the description column (padding spaces become
// NBSP later, see block(): SVG collapses whitespace by default).
const tree = (rows) => {
  const col = Math.max(...rows.map(([p]) => p.length)) + 2
  return rows.map(([p, d]) => p + ' '.repeat(Math.max(1, col - p.length)) + d)
}
const TREE_LINES_L = tree([
  ['VibeMath/Projects/<project>/', ''],
  ['├─ qs/qs.json', 'problems: overview / solved / solutions / priority / progress'],
  ['├─ Propos/<category>_Propos.json', 'propositions: boolean estimate / proof·disproof lists'],
  ['├─ Reliable/', 'trusted references placed by the user (read-only)'],
  ['├─ Verified/<category>_Verified.json', 'concluded facts: boolean estimate 0 or 1'],
  ['├─ Verified/Lean/<object id>.lean', 'archived Lean proofs'],
  ['├─ Verification_logs/<rId>_<time>.json', 'one debate transcript per verification run'],
  ['├─ Progress_Logs/report.json', 'event-driven progress report'],
  ['├─ Formal/<object id>.lean + Index.md + TODO.md', 'per-object formalization'],
  ['├─ VibeMath_State/', 'scheduler-private state (checkpoint / resume)'],
  ['└─ vibe_math_setting.json', 'project parameters (global fallback supported)'],
])
const TREE_LINES_R = tree([
  ['VibeMath/  (the framework root)', ''],
  ['├─ current.<session id>.json', 'the current project, per session'],
  ['├─ vibe_math_setting.json', 'optional global fallback parameters'],
  ['└─ Formal/', 'cross-project reusable Lean library'],
  ['   ├─ Lib/<name>.lean + Lib/Index.md', 'reusable definitions / objects'],
  ['   └─ Proved/<name>.lean + Proved/Index.md', 'machine-checked lemmas'],
])
const TREE_H = Math.max(
  (TREE_LINES_L.length - 1) * 15.5 + 11.5 + 24,
  (TREE_LINES_R.length - 1) * 15.5 + 11.5 + 24,
)
const bTree = nextBand(56 + TREE_H + 14)
band(FULL_L, bTree, FULL_R - FULL_L, 56 + TREE_H + 14,
  'File layout — every path below is relative to VibeMath/Projects/<project>/',
  'the project skeleton is created up front (qs, Propos, Reliable, Verified, Verification_logs, Progress_Logs, VibeMath_State, Formal) · hand-editing a file cannot corrupt the scheduler, which rewrites it',
  { fill: C.dataBg, stroke: C.data, titleFill: '#125a3c' })
block(IN_L, bTree + 56, 794, TREE_LINES_L, { fs: 11.5 })
block(876, bTree + 56, 782, TREE_LINES_R, { fs: 11.5 })

// ============================================================
// 9. Adjustable parameters
// ============================================================
const bParam = nextBand(56 + 84 + 16 + 84 + 14)
band(FULL_L, bParam, FULL_R - FULL_L, 56 + 84 + 16 + 84 + 14,
  'Adjustable parameters — vibe_math_set_params · /vibe setup · vibe_math_setting.json',
  'the project-level vibe_math_setting.json wins over the global fallback (<workspace>/VibeMath/vibe_math_setting.json), then built-in defaults · a runtime change takes effect immediately and is persisted',
  { fill: C.houseBg, stroke: C.house, titleFill: '#8a5200' })
const paramCards = [
  [
    'scheduling & concurrency',
    'maxParallelThreshold 4 · tickIntervalMs 2000 · activityLogCap 100',
    'solverMaxRounds 3 · directionsPerSolver 1 · maxExplorerRetries 3',
    'a new dispatch waits until active sub-agents < maxParallelThreshold',
    'priority: a smaller integer first · never = never scheduled',
  ],
  [
    'verification & adjudication',
    'verifierCount 3 · debateMaxRounds 5 · verdictMode flat | forced (weighted)',
    'promoteValueThreshold 0.7 — a valuable undecided proposition joins qs.json',
    'priorityAdjust none | deadend-deprioritize | survival-map',
    'proposPriorityAdjust none | progress-graded',
  ],
  [
    'reporting · model · projects',
    'reportMode file | push | both · reportIntervalMs 0 (event-driven only)',
    'mode auto | manual · provider / model (empty = inherit the main agent)',
    'solverPersona · verifierPersona · explorerPersona · knowledgeContext',
    'vibe_math_new_project / set_project / list_projects · list_decisions',
  ],
  [
    'Lean parameters (semantics in the Lean band above)',
    'formalVerify off | encourage | require (default off)',
    'leanCommand lean · leanArgs [] · leanTimeoutMs 120000',
    'all four appear in the schema, in status / report and in the card',
    'an illegal formalVerify falls back to off, never to a stronger level',
  ],
  [
    'sub-agent permissions',
    'solverToolAllow / solverToolDeny · verifierToolAllow / verifierToolDeny',
    'solverAllowNetwork · verifierAllowNetwork · solver/verifierAllowScripts',
    'solverMaxToolCalls / verifierMaxToolCalls (0 = unlimited)',
    'all agents may read Verified/ as a trusted dependency, plus Reliable/',
  ],
  [
    'configuration surface',
    'vibe_math_setup returns the schema (/vibe setup asks item by item)',
    'vibe_math_set_params / set_mode write back immediately and persist',
    'vibe_math_template writes a commented template · save_settings saves',
    'vibe_math_save_settings makes the current values the new defaults',
  ],
]
paramCards.forEach((lines, i) => {
  const col = i % 3, row = (i - col) / 3
  card(GRID_X[col], bParam + 56 + row * 100, GRID_W, 84, lines, { stroke: C.house, fs: 12.5, sfs: 10.5 })
})

// ============================================================
// 10. Two hard requirements + isolation
// ============================================================
const bHard = nextBand(56 + 76 + 16 + 76 + 14)
band(FULL_L, bHard, FULL_R - FULL_L, 56 + 76 + 16 + 76 + 14,
  'Two hard requirements — checkpoint resume · mid-run manual intervention',
  'every architecture shares the same four foundations: checkpoint resume, mid-run intervention, progress reporting and per-session isolation',
  { fill: C.humanBg, stroke: C.human, titleFill: C.human })
const hardCards = [
  [
    'checkpoint resume (hard requirement 1)',
    'VibeMath_State/*.json is written throughout and every sub-agent is a continuable',
    'DSH session; vibe_math_resume restores tasks, agents, decisions, verifier accuracy;',
    'a process epoch separates same-process pause → resume from a cross-process restart',
  ],
  [
    'manual / auto intervention (hard requirement 2)',
    'vibe_math_set_mode auto | manual — switching back to auto clears pending decisions;',
    'in manual mode dispatch and verdict suspend a decision for list_decisions,',
    'then decide (approve | reject | override); message / interrupt any sub-agent',
  ],
  [
    'progress reporting',
    'event-driven: a report is written when an agent status changes (reportIntervalMs = 0)',
    'reportMode file (Progress_Logs/report.json) | push (wake the main agent) | both',
    'vibe_math_status / vibe_math_report answer "what is going on" at any moment',
  ],
  [
    'multi-session isolation & projects',
    'one preset is a standing mount: the plugin isolates all state by root session id',
    'each problem is a project folder (VibeMath/Projects/<project>/) — switch at any time',
    'current.<session id>.json keeps the current project per session (legacy current.json)',
  ],
]
hardCards.forEach((lines, i) => {
  const card_w = 788
  const x = IN_L + (i % 2) * (card_w + 20)
  const row = (i - (i % 2)) / 2
  card(x, bHard + 56 + row * 92, card_w, 76, lines, { stroke: C.human, fs: 12.5, sfs: 10.5 })
})

// ============================================================
// 11. Feature strip + legend
// ============================================================
const feats = [
  'probability = 1 auto-closes (solved / 1|0)',
  'never = never scheduled · never blocks the stop',
  'checkpoint resume (vibe_math_resume · process epoch)',
  'reportMode file|push|both · per-project isolation',
]
const fTop = y
feats.forEach((f, i) => {
  const fw = 385
  card(IN_L + i * (fw + 18), fTop, fw, 44, [f], { stroke: C.line, fs: 11.5, fill: '#f4f7f9' })
})
legend(fTop + 44 + 34, [
  [C.human, 'user / main agent (neither solves nor schedules)'],
  [C.house, 'scheduler & parameters (plugin code · writer)'],
  [C.frame, 'sub-agents and the pipeline flow (①–④)'],
  [C.data, 'data and artifacts (probability-driven JSON)'],
  [C.gate, 'truth gate & Lean formalization (adjustable)'],
])
y = fTop + 44 + 34 + 14 + 22
const H = Math.round(y)

// ---------- flow arrows between bands ----------
const gapLabel = (yy, text, color) => plain(FLOW_X + 22, yy, text, { size: 10.5, fill: color, halo: true, limit: 1000, where: 'flow label' })
arrow(FLOW_X, bInter + 56 + 104, FLOW_X, bSched, { color: C.frame, marker: 'bothFrame', width: 2 })
gapLabel(bSched - 4, 'vibe_math_* tools  ↓    status / report  ↑', C.frame)
arrow(FLOW_X, bSched + 56 + 124, FLOW_X, bSolve, { color: C.frame, marker: 'bothFrame', width: 2 })
gapLabel(bSolve - 4, '① take the highest-priority unsolved problem → dispatch the explorer', C.frame)
arrow(FLOW_X, bSolve + 56 + 124, FLOW_X, bVeri, { color: C.frame, marker: 'bothFrame', width: 2 })
gapLabel(bVeri - 4, '② results are written with probability < 1   ·   ③ pick r by priority   ·   ④ dispatch ≥ 3 verifiers', C.frame)
arrow(FLOW_X, bVeri + 56 + 124, FLOW_X, bLean, { color: C.frame, marker: 'bothFrame', width: 2 })
gapLabel(bLean - 4, '⑤ the debate ends → verdict 0 / 1 / in between', C.frame)
arrow(FLOW_X, bLean + LEAN_H, FLOW_X, bClose, { color: C.gate, marker: 'bothGate', width: 2 })
gapLabel(bClose - 4, '⑥ require: the gate guards this closing point (Verified/ card · settleVerdict)', C.gate)

// ---------- write-back loop (outer channel, never crosses a band) ----------
polyline([[COL1_X, bClose + 88], [LOOP_X, bClose + 88], [LOOP_X, bSched + 88], [COL1_X, bSched + 88]],
  { color: C.house, width: 2, marker: 'bothHouse' })
plain((LOOP_X + COL1_X) / 2, bClose + 82, 'write-back', { size: 10, fill: C.house, anchor: 'middle', halo: true })
plain((LOOP_X + COL1_X) / 2, bClose + 108, 'solved / 1 / 0', { size: 10, fill: C.house, anchor: 'middle', halo: true })
plain((LOOP_X + COL1_X) / 2, bSched + 64, 'read qs/qs.json', { size: 10, fill: C.house, anchor: 'middle', halo: true })
plain((LOOP_X + COL1_X) / 2, bSched + 90, 'next round', { size: 10, fill: C.house, anchor: 'middle', halo: true })

// ---------- assemble ----------
const head = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vibe Math V2 architecture diagram (English)">`,
  `<defs>
  <marker id="both" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.line}"/></marker>
  <marker id="bothHuman" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.human}"/></marker>
  <marker id="bothFrame" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.frame}"/></marker>
  <marker id="bothData" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.data}"/></marker>
  <marker id="bothHouse" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.house}"/></marker>
  <marker id="bothGate" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.gate}"/></marker>
</defs>`,
  `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  `<g font-family="${FONT}">`,
]
const titleBlock = [
  `<text x="${W / 2}" y="40" font-size="27" font-weight="700" fill="${C.ink}" text-anchor="middle">`
  + `${esc('Vibe Math V2 — multi-agent math problem solving & verification framework (probability-driven)')}</text>`,
  `<text x="${W / 2}" y="67" font-size="13" fill="${C.mute}" text-anchor="middle">`
  + `${esc('qs/qs.json problem list + Propos/ proposition library · scheduled by correctness probability / value · explorer → one solver per direction → ≥3 verifiers debate and adjudicate')}</text>`,
]
const svg = head.concat(titleBlock, body, ['</g>', '</svg>']).join('\n')

// English-only assertion: this edition must not contain any CJK character.
const cjk = svg.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g)
if (cjk) warnings.push(`non-English (CJK) text found: ${[...new Set(cjk)].slice(0, 8).join(' / ')}`)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, svg, 'utf8')
console.log('saved ' + OUT + ' (' + Buffer.byteLength(svg, 'utf8') + ' bytes, ' + W + 'x' + H + ')')
if (warnings.length) {
  console.error('\nlayout warnings (text may overflow its container):')
  for (const w of warnings) console.error('  WARN ' + w)
  process.exit(1)
}
console.log('layout: no overflow warnings')
