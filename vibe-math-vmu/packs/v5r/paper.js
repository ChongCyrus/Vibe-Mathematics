/**
 * packs/v5r/paper.js — PHASE 8 / B-4 step 2: THE THIN SHELL (policy + forwarding).
 *
 * WHAT THIS FILE IS NOW: the paper FLOW (state machine, fingerprint verification, artefact assembly, the kernel-LaTeX
 * compile path) lives in `vibe-math-vmu/kit/paper.js` as `createPaperFlow({...})`. This file keeps ONLY the institution's
 * policy and forwards:
 *   · PAPER_SECTIONS / PAPER_MAX_ROUNDS / PAPER_ENGINE_ORDER / PAPER_REPAIR_CORE — the institution's outline, round cap,
 *     engine preference and package set (they must NOT move into the kit: the kit never invents institution semantics);
 *   · PAPER_TRACK / PAPER_CODES / the record prefix `v5r-paper` / the archive author `vibe_v5_paper` / the `Paper/` prefix
 *     and the "academician finalises in the chair slot" rule.
 *
 * THE EXPORT SURFACE IS UNCHANGED (middleware and tests import these names), and every method the old subsystem returned
 * (start / recordPart / recordReview / advance / pass / recordFinal / PaperMd / PaperTex / PaperArtifacts / render /
 * compilePdf / sections / state) is the kit's implementation with this policy applied.
 */
import { createPaperFlow } from '../../kit/paper.js'
// ★ E1＋E3 (phase 12): the record-backed sections and the quality gate live in their own module because the export
// surface below is PINNED (`tests/vmu-v5r-tools.test.mjs` ⑦h) — new machinery may never widen it. This file imports and
// wires; `paper-quality.js` owns the reads, the fills and the four refusal codes.
import { QUALITY_CODES, createRecordsView, fillRecordSections, checkQuality, checkEvidencePointers } from './paper-quality.js'

export const PAPER_MAX_ROUNDS = 3
/** The original's nine sections, in order (verbatim from `vibe-math-v5r.js:238-248`). */
export const PAPER_SECTIONS = Object.freeze([
  '标题、作者、日期与摘要',
  '引言与问题背景',
  '原问题的完整解法',
  '已检验通过的命题',
  '已解决的子问题 / 中间成果',
  '创造或发现的有价值之物：方法、理论、思想、经验与数学理解',
  '规律总结',
  '讨论、局限与展望',
  '附录：证据与文件索引',
])
/** Chinese first (docs/final-paper.md §8): xelatex covers CJK out of the box; English prefers pdflatex. */
export const PAPER_ENGINE_ORDER = Object.freeze({
  zh: Object.freeze(['xelatex', 'latexmk', 'pdflatex', 'lualatex', 'tectonic']),
  en: Object.freeze(['pdflatex', 'latexmk', 'lualatex', 'tectonic', 'xelatex']),
})
export const PAPER_REPAIR_CORE = Object.freeze(['amsmath', 'amssymb', 'amsthm', 'geometry', 'ctex'])
export const PAPER_STATES = Object.freeze(['writing', 'reviewing', 'awaiting-editor', 'finalized'])
export const PAPER_ARTIFACTS = Object.freeze(['md', 'tex', 'pdf', 'meta'])
export const PAPER_TRACK = 'paper'
export const PAPER_CODES = Object.freeze({
  STATE: 'VMU_PACK_V5R_CORE_PAPER_STATE',
  FINGERPRINT: 'VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH',
  PDF_NEEDS_KERNEL: 'VMU_PACK_V5R_CORE_PAPER_PDF_NEEDS_KERNEL',
  EXECUTOR: 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING',
  PDF_FAILED: 'VMU_PACK_V5R_CORE_PAPER_PDF_FAILED',
  // ★ E4 — the pre-finalisation office consult. These are INSTITUTION codes (registered in docs/03 §8), passed into the
  // kit because the kit invents no codes: the gate is declared here, the mechanism that runs it lives in kit/paper.js.
  OFFICE_CONSULT_REQUIRED: 'VMU_OFFICE_CONSULT_REQUIRED',
  OFFICE_CONSULT_TIMEOUT: 'VMU_OFFICE_CONSULT_TIMEOUT',
})

/**
 * ★ E4 — WHO answers a pre-finalisation consult is INSTITUTION POLICY, so it is declared HERE and handed to the kit as a
 * parameter (the kit must not assume the institute has an "office"). Matching is by member `id` OR `slot`, which is why
 * the v5r office counts whichever way a deployment seats it (a human office in slot `office`, or the id `office`).
 * EXPORTED (and the pinned export surface in `tests/vmu-v5r-tools.test.mjs` was widened with it): the tool face
 * (`vibe_v5_paper { action:"consult" }`) must refuse a non-answerer BEFORE the kit runs, and it may not learn "who may
 * answer" from anywhere else — a second literal `['office']` in `tools.js` would be a second authority that drifts.
 * One declaration, two readers (this wrapper hands it to the kit as `consultRoles`; the tool imports it for its own
 * pre-check, and the kit still re-checks — defence in depth, never a second vocabulary).
 */
export const PAPER_CONSULT_ROLES = Object.freeze(['office'])

/**
 * Create the paper subsystem over ONE kernel. This is now a POLICY-ONLY wrapper: the flow itself is the kit's.
 * `kernel` is required by the kit (it composes the records / members / latex faces); the policy below is the institute's.
 */
export function createPaperSubsystem({ kernel, clock = null } = {}) {
  // The records view the fills read from: one factory so the seam and the audit see the same face.
  const recordsView = () => createRecordsView({ kernel, codes: QUALITY_CODES })
  const flow = createPaperFlow({
    kernel,
    // ★ E1 SEAM (this round): the kit's `render` / `PaperTex` / `PaperArtifacts` build from ITS OWN closure, so without
    // this the record-backed sections existed only in the tool receipt and the .md/.tex written to `Paper/` stayed empty.
    // The transformer is POLICY and stays in this pack; the kit calls it once per render and refuses a non-string.
    mdFill: (md) => fillRecordSections({ md, sections: PAPER_SECTIONS, view: recordsView(), codes: QUALITY_CODES }).md,
    // ★ E4: the clock is a SEAM (the consult ledger records when the office was asked and the timeout is measured against
    // it). Defaults to the wall clock so every existing caller is unaffected; tests move time without sleeping.
    clock: typeof clock === 'function' ? clock : () => Date.now(),
    // ★ E4: who may answer the pre-finalisation consult — the institution's office (see PAPER_CONSULT_ROLES).
    consultRoles: PAPER_CONSULT_ROLES,
    sections: PAPER_SECTIONS,
    // ★ THE MAPPING IS POLICY (kit/paper.js §PaperMd): one entry per section, '' = that section owns no single part-field.
    // 序号对应 PAPER_SECTIONS：0 标题|1 引言|★2 完整解法|★3 命题|4 子问题|★5 有价值之物|★6 规律|★7 局限|★8 证据
    sectionFields: Object.freeze(['title', '', 'solution', '', '', 'methods', 'rules', 'limits', 'evidence']),
    maxRounds: PAPER_MAX_ROUNDS,
    engineOrder: PAPER_ENGINE_ORDER,
    repairCore: PAPER_REPAIR_CORE,
    track: PAPER_TRACK,
    codes: PAPER_CODES,
    recordPrefix: 'v5r-paper',
    author: 'vibe_v5_paper',
    outDirPrefix: 'Paper/',
    editorDefault: 'academician',
    finalizerSlot: 'chair',
  })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // ★ E1 — THE THREE STRUCTURALLY-EMPTY SECTIONS. `sectionFields` above gives indexes 1 / 3 / 4 no part-field, so the
  // kit's outline printed three headings with nothing under them, forever — while the institute's own records face held
  // exactly the content those sections are named after (the declared objective; the `verified` track; the `problems`
  // track's p=1 rows). The fill is applied to THE MARKDOWN THIS PACK PRODUCES (`flow.PaperMd`), and every empty source is
  // rendered as a NAMED sentence instead of a blank line (see `paper-quality.js §RECORD_SECTIONS.legalEmpty`).
  //
  // WHERE THE FILL REACHES NOW (updated this round): `kit/paper.js` takes a `mdFill` seam, so `flow.PaperMd` (the tool
  // receipt), `PaperTex` and the `.md`/`.tex` written by `render` all carry the record-backed sections. `PaperMdRaw` is the
  // unfilled base and exists ONLY so `sectionAudit` can report what the fill did without filling twice.
  const filledMd = (args = {}) => fillRecordSections({ md: flow.PaperMdRaw(args), sections: PAPER_SECTIONS, view: recordsView(), codes: QUALITY_CODES })

  /** WHICH sections were filled, from which source, and which could not be placed (a heading the md does not have is a
   *  named problem, never a silent skip). Read-only: renders, reports, mutates nothing. */
  flow.sectionAudit = (args = {}) => {
    const fill = filledMd(args)
    return { ok: fill.ok, sections: fill.sections, problems: fill.problems }
  }

  /** ★ ROUND 95 — resolve a part's `evidence` pointers NOW, before the part is recorded (see
   *  `paper-quality.js#checkEvidencePointers`). The tool face refuses on `!ok`; this method never writes anything. */
  flow.evidencePointers = (evidence) => {
    const view = recordsView()
    return checkEvidencePointers({ evidence, records: view && view.records, codes: QUALITY_CODES })
  }

  /** ★ E3 — the quality verdict WITHOUT refusing (the reviewer/the editor may ask before committing). */
  flow.qualityGate = (args = {}) => {
    const target = args && args.target !== undefined ? args.target : args
    // `kit/paper.js`'s own `state()` read returns `{ state, row }` (the state machine + its records row); accept both
    // shapes so a caller may hand over either the kit's read or a bare state object.
    const read = flow.state(target)
    const state = read && read.state ? read.state : read
    // The checks judge WRITTEN text; a paper with no parts has no text to judge (E4's consult gate owns that path).
    if (!state || !state.parts || Object.keys(state.parts).length === 0) {
      return { ok: true, skipped: 'no-parts', counts: { citations: 0, evidence: 0, resolved: 0, verified: 0, subproblems: 0 }, citations: [] }
    }
    // ★ DRAFTS RENDER FREELY, THE DELIVERABLE DOES NOT. The three rules are the institute's DELIVERY contract, so they are
    // enforced from `awaiting-editor` onwards (the state in which the paper is being handed in). A paper still being
    // written or cross-reviewed may be rendered for inspection — refusing that would punish the very iteration the flow
    // exists for — and the verdict SAYS it skipped (`draft:<status>`) instead of pretending it checked.
    const status = String(state.status === undefined || state.status === null ? '' : state.status)
    if (status !== 'awaiting-editor' && status !== 'finalized') {
      return { ok: true, skipped: 'draft:' + status, counts: { citations: 0, evidence: 0, resolved: 0, verified: 0, subproblems: 0 }, citations: [] }
    }
    // ③ judges WHAT THE MEMBERS WROTE (`PaperMdRaw`, the kit's unfilled markdown), not the filled rendering: the seam
    // injects the verified rows into §3 by itself, so checking the filled text would make ③ true for every paper — a gate
    // that guards nothing. The question ③ asks is "did the authors carry the institute's results into their own prose",
    // and only their prose can answer it. (This is exactly why the seam is `mdFill` and NOT a mutation of `PaperMd`.)
    return checkQuality({ md: flow.PaperMdRaw({ target }), state, view: recordsView(), codes: QUALITY_CODES })
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // ★ E3 — THE GATE. It hangs on `render`, the moment the institute PRODUCES the paper's artefacts (md/tex/meta written
  // into the archive): a quality claim that cannot stop the deliverable from being produced is a comment, not a gate. The
  // gate runs BEFORE the delegate, so a refusal writes nothing at all — the archive keeps the previous state.
  //
  // WHY `render` AND NOT `recordFinal`: finalisation is already owned by the E4 office-consult gate, and the flow's own
  // editor path is exercised by papers with no parts (E4 tests drive consult-only papers); a quality rule that fires there
  // would judge text that does not exist yet. `render` is also the face the tool layer calls for `action:"render"`, so the
  // gate has a real consumer today (no new mechanism without a consumer).
  //
  // Why "no parts ⇒ skip" is not a hole: with no parts there is no body to check, and `render` on such a paper is already
  // incomplete for its own reasons (reported in `missing`). With parts, one of the three rules always applies — and a paper
  // that cites nothing, holds no evidence, or drops the institute's own verified results is refused BY NAME (the id and the
  // member are in the message). `flow.qualityGate` exposes the same verdict without throwing.
  const kitRender = flow.render
  flow.render = (args = {}) => {
    const verdict = flow.qualityGate(args)
    if (!verdict.ok) {
      const error = new Error(verdict.message)
      error.code = verdict.code
      error.hint = verdict.hint
      if (Array.isArray(verdict.missing)) error.missing = verdict.missing
      throw error
    }
    return kitRender(args)
  }

  return flow
}

export default createPaperSubsystem
