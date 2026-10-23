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
  return createPaperFlow({
    kernel,
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
}

export default createPaperSubsystem
