// vibe-math-vmu/kit/paper.js — PHASE 8 / B-4: the PAPER FLOW (state machine + fingerprint verification + artefact assembly).
//
// EXTRACTED from `packs/v5r/paper.js`. The split is deliberate:
//   · GENERIC (here): the lifecycle writing → reviewing → awaiting-editor → finalized, the advance/pass transitions,
//     the by-id fingerprint verification (a drift is a NAMED block, never a silent reuse), the four-artefact assembly with
//     `missing:[...]`, and the kernel-LaTeX compile path with its named refusals;
//   · POLICY (parameters, never defaults invented here): the section titles, the round cap, the engine order, the repair
//     package set, the record track/prefix, the archive author, the editor rules and the REGISTERED error codes.
//
// Kit boundaries (tests/audit-kit-boundaries): no pack import, no spawn, no filesystem, no NEW error codes — the caller
// passes codes that already belong to the institution declaring this flow.

export const PAPER_STATES = Object.freeze(['writing', 'reviewing', 'awaiting-editor', 'finalized'])
export const PAPER_ARTIFACTS = Object.freeze(['md', 'tex', 'pdf', 'meta'])
const str = (v) => (v === undefined || v === null ? '' : String(v))
const has = (v) => v !== undefined && v !== null && String(v).trim() !== ''
/**
 * ★★★ RUN 256 (TB-2624 item 3, MEASURED in run 74): a request id is an ADDRESS, not a title. The consult id used to be
 * `consult-<target>-<n>`, and the target IS the paper title, so a paper titled 「端到端占位论文」 minted
 * `consult-端到端占位论文-1` — a CJK/slash-bearing string that is hard to type, hard to match and changes if the title
 * changes. The shape is now `consult-<seq4>-<hex4>`: a zero-padded MONOTONIC sequence plus four derived hex chars (a
 * RANDOM suffix was the first version of this fix; RUN 257 / TB-2634 below made the suffix reproducible — the shape is the
 * one thing that stayed). The title still travels as the state's `target`/`title`; it never enters an id. OLD ids are
 * still readable: a request is
 * identified by exact string, and nothing here validates a format, so a legacy `consult-<title>-<n>` row answers by its
 * own id (the suite proves it).
 */
/**
 * ★★★ RUN 257 (TB-2634): A MINTED ID IS NOT AN EXTERNAL INPUT — it must not be read from `Math.random()`. The suffix here
 * used to be four random hex chars, which made the SAME input mint a DIFFERENT id on every run: two corpora over the same
 * calls disagreed byte-for-byte, and TB-2602's "two runs, identical sha256" and TB-2605's determinism gate went randomly
 * red. Random ids are the same class of defect as wall-clock stamps (RUN 256): an unreproducible judgement is not a
 * judgement. The suffix is now DERIVED from facts the caller already has (the paper title + the per-paper monotonic
 * `ledger.opened`), and randomness is a SEAM like the clock: pass `rand` to perturb the derivation deliberately (tests
 * inject a fixed one), never to make the default unreproducible.
 *
 * Shape is unchanged — `consult-<seq4>-<hex4>` — because the shape is an address that receipts, hints and tests already
 * point at. Uniqueness and determinism are two different promises and both are checked: same input ⇒ same id; different
 * title or different sequence ⇒ different id (the 32-bit FNV-1a fold below, four lowercase hex chars).
 */
const consultSeedHex4 = (material) => {
  // FNV-1a over the UTF-16 code units: dependency-free, deterministic across processes, and stable for CJK titles (the
  // title is a fact, so hashing it is not "using randomness" — the same title always folds to the same nibbles).
  let h = 0x811c9dc5
  const s = String(material)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 4)
}
export const consultRequestId = (seq, { seed = '', rand = null } = {}) => {
  const n = Number.isFinite(Number(seq)) && Number(seq) > 0 ? Math.floor(Number(seq)) : 1
  // The material is the id's whole claim to being reproducible: sequence + title, plus an INJECTED draw when the caller
  // wants a perturbed-but-still-deterministic id. A random draw without injection never happens here.
  let material = String(seed) + '#' + String(n)
  if (typeof rand === 'function') material += '#' + String(rand())
  return 'consult-' + String(n).padStart(4, '0') + '-' + consultSeedHex4(material)
}

function refuse(code, message, hint, extra = null) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  // ★ E4: a refusal about a SETTING must travel with the facts a caller can act on (current value, legal values, which
  // keys were enforced) — `code` alone forces the caller to re-read the settings to answer "what was it set to?".
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) if (k !== 'code' && k !== 'message' && k !== 'hint' && extra[k] !== undefined) e[k] = extra[k]
  }
  return e
}


/**
 * Create the paper subsystem over ONE kernel. Every method is a pure state transition over records; there is no timer
 * and no global: the pack's turn/middleware layer calls `pass()` when it wants the flow to move.
 */
// ★★★ TB-2768 (RUN 81 attempt-3) + ★★★ TB-2772 (RUN 82 attempt-1): THE GLYPH REPAIR TABLE IS THE ONE PLACE a unicode
// math glyph is re-spelled. attempt-3 measured ℤ×4/∀×2/∣×6/∩×2/∪×1/⋯×1; attempt-2 measured a DIFFERENT set —
// ⌊U+230A×5 / ⌋U+230B×5 / ∉U+2209×1 / ①U+2460×3 / ②U+2461×3 / ③U+2462×3 / ④U+2463×2 / ⑤U+2464×1 (xelatex log) —
// so the table is expanded SYSTEMATICALLY (sets/logic, arrows, relations, operators, brackets, number sets, circled
// digits), not only for the observed characters. TWO invariants keep it honest:
//   · `MATH_GLYPH_RE` is DERIVED from these keys (one source — delete a key and its repair disappears with it,
//     which is exactly what the anti-lamp drives), and
//   · every alphabetic control word carries a `{}` terminator, because the replacement lands mid-text: `⌊x` must
//     become a braced command (`lfloor{}x`): a bare control word fused with the next letter is UNDEFINED, and
//     the text path wraps it in `$…$` while the math path inserts it verbatim, so `{}` is needed on both).
//     it in `$…$`, the math path inserts it verbatim, so the terminator is needed on both).
// The table is a FALLBACK, not the teaching: the part-write face tells authors to use LaTeX commands, not bare
// unicode math characters; a glyph the table does not know is still caught by the kernel log detector
// (`kernel/latex.js` → `glyphsUnrepaired` / `VMU_PAPER_GLYPH_UNCOVERED`).
const TEX_MATH_GLYPH = { '≥': '\\geq', '≤': '\\leq', '≠': '\\neq', '≈': '\\approx', '∎': '\\blacksquare', '∞': '\\infty', '∈': '\\in', '⊆': '\\subseteq', '⇒': '\\Rightarrow', '→': '\\rightarrow', '±': '\\pm', '×': '\\times', '·': '\\cdot', '÷': '\\div', 'ℤ': '\\mathbb{Z}', '∀': '\\forall', '∣': '\\mid', '∩': '\\cap', '∪': '\\cup', '⋯': '\\cdots',
  // TB-2772 observed on RUN 82 (23 Missing-character lines): floors, not-in, circled digits
  "⌊": "\\lfloor{}", "⌋": "\\rfloor{}", "∉": "\\notin{}", "①": "(1)", "②": "(2)", "③": "(3)", "④": "(4)", "⑤": "(5)", "⑥": "(6)", "⑦": "(7)", "⑧": "(8)", "⑨": "(9)", "⑩": "(10)", "⑪": "(11)", "⑫": "(12)", "⑬": "(13)", "⑭": "(14)", "⑮": "(15)", "⑯": "(16)", "⑰": "(17)", "⑱": "(18)", "⑲": "(19)", "⑳": "(20)",
  // systematic: ceilings, sets/logic
  "⌈": "\\lceil{}", "⌉": "\\rceil{}", "∋": "\\ni{}", "∌": "\\not\\ni{}", "∅": "\\emptyset{}", "⊂": "\\subset{}", "⊃": "\\supset{}", "⊇": "\\supseteq{}", "⊄": "\\not\\subset{}", "⊅": "\\not\\supset{}", "⊈": "\\not\\subseteq{}", "⊉": "\\not\\supseteq{}", "∃": "\\exists{}", "∄": "\\nexists{}", "¬": "\\neg{}", "∧": "\\wedge{}", "∨": "\\vee{}", "⊕": "\\oplus{}", "⊗": "\\otimes{}", "←": "\\leftarrow{}", "↔": "\\leftrightarrow{}",
  // systematic: arrows
  "⇐": "\\Leftarrow{}", "⇔": "\\Leftrightarrow{}", "↦": "\\mapsto{}", "↑": "\\uparrow{}", "↓": "\\downarrow{}", "↕": "\\updownarrow{}", "⟶": "\\longrightarrow{}", "⟵": "\\longleftarrow{}", "⟹": "\\Longrightarrow{}", "⟺": "\\Longleftrightarrow{}", "≡": "\\equiv{}", "≅": "\\cong{}",
  // systematic: relations and operators
  "≃": "\\simeq{}", "∼": "\\sim{}", "∝": "\\propto{}", "≪": "\\ll{}", "≫": "\\gg{}", "≐": "\\doteq{}", "∥": "\\parallel{}", "⊥": "\\perp{}", "∓": "\\mp{}", "⋅": "\\cdot{}", "∗": "\\ast{}", "∘": "\\circ{}", "∑": "\\sum{}", "∏": "\\prod{}", "∫": "\\int{}", "∬": "\\iint{}", "∮": "\\oint{}", "√": "\\surd{}", "∂": "\\partial{}", "∇": "\\nabla{}", "⟨": "\\langle{}",
  // systematic: brackets, ellipsis, number sets
  "⟩": "\\rangle{}", "‖": "\\|", "…": "\\ldots{}", "ℕ": "\\mathbb{N}", "ℚ": "\\mathbb{Q}", "ℝ": "\\mathbb{R}", "ℂ": "\\mathbb{C}", "ℙ": "\\mathbb{P}" }
// DERIVED from the keys above (one source): regex metacharacters are escaped so a future key like `]` cannot
// silently break the character class.
const MATH_GLYPH_RE = new RegExp('[' + Object.keys(TEX_MATH_GLYPH).map((ch) => ch.replace(/[\\\]^$.*+?()[{}|]/g, '\\$&')).join('') + ']', 'g')

/** The rewrite advice printed by a REFUSED finalisation: one line per dropped glyph, naming the LaTeX command. */
function glyphAdviceOf (rows) {
  const list = Array.isArray(rows) ? rows : []
  return list.map((r) => {
    const ch = r && r.char !== undefined && r.char !== null ? String(r.char) : '?'
    const code = r && r.u !== undefined && r.u !== null ? String(r.u) : ''
    const mapped = TEX_MATH_GLYPH[ch]
    const rewrite = mapped === undefined ? '（替换表未收录：请改用等价的 LaTeX 命令，或删去该字符）' : mapped.replace(/[{}]/g, '')
    const count = r && Number.isFinite(Number(r.count)) ? Number(r.count) : 1
    return '「' + ch + '」（' + code + '，' + String(count) + ' 次）→ ' + rewrite
  }).join('；')
}

export function createPaperFlow({
  kernel,
  sections = [],
  // ★★★ THE SECTION -> PART-FIELD MAPPING IS POLICY, so the PACK supplies it (one entry per section, '' = no field).
  // Before this, PaperMd looped over sections and, inside each, emitted every member's ENTIRE part - so the whole body was
  // copied into every top-level section ("整篇正文出现在每一节里"). A part is a set of FIELDS
  // (title/solution/methods/rules/limits/evidence); a section owns AT MOST ONE of them.
  sectionFields = [],
  maxRounds = 3,
  engineOrder = {},
  repairCore = [],
  track = 'paper',
  codes = null,
  recordPrefix = 'paper',
  author = 'paper-flow',
  outDirPrefix = 'Paper/',
  editorDefault = 'academician',
  finalizerSlot = 'chair',
  // ★ E4 — WHO answers the pre-finalisation consult is POLICY, so the PACK supplies it (the kit must not guess that the
  //   institute has an "office"). An empty list is honored as "the pack declared no answering role" ⇒ the gate can never
  //   be satisfied, which is a NAMED refusal (VMU_NOT_PERMITTED), never a silent pass.
  consultRoles = [],
  // The clock is a seam: the consult ledger records WHEN the office was asked (durability ⇒ the question survives a
  // crash) and the timeout is measured against it, so tests need to move time without sleeping.
  clock = () => Date.now(),
  // ★★★ RUN 257 (TB-2634) — RANDOMNESS IS A SEAM TOO. `consultRequestId` derives its suffix from the title + sequence, so
  // the default already reproduces; a deployment that wants a perturbed id passes `rand` (a `() => number` in [0,1)) and
  // the derivation folds that draw in. Absent this, nothing in the consult path reads a random source — id minting is a
  // judgement over facts, not a dice roll (see the comment on `consultRequestId`).
  rand = null,
  // ★ E1 — THE ARTEFACT-MARKDOWN SEAM. `render` / `PaperTex` / `PaperArtifacts` all build from the closure `PaperMd`, so a
  // pack whose record-driven sections are filled AFTER the kit assembles its outline could only ever fill the TOOL RECEIPT,
  // never the .md/.tex written to `Paper/`. That was a real gap (E1: three sections were structurally empty in the archive).
  // The transformer is POLICY ⇒ the PACK supplies it and the kit only calls it once per render. It MUST return a string:
  // a fill that returns undefined would silently blank the paper, so a non-string is a named refusal, never a coercion.
  mdFill = null,
} = {}) {
  if (!codes || typeof codes !== 'object' || typeof codes.STATE !== 'string' || typeof codes.FINGERPRINT !== 'string') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createPaperFlow needs the REGISTERED error codes',
      'pass codes:{STATE,FINGERPRINT,PDF_NEEDS_KERNEL,EXECUTOR,PDF_FAILED} from the institution that declares them (the kit never invents codes)')
  }
  if (!Array.isArray(sections) || sections.length === 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'createPaperFlow needs the section titles', 'pass sections:[…] (the institution paper outline)')
  }
  const SECTIONS = sections, SECTION_FIELDS = sectionFields, ROUNDS_OPTION = maxRounds, ENGINE_ORDER = engineOrder, REPAIR_CORE = repairCore, TRACK = track, CODES = codes
  // ★★ RUN 154 (real machine, run 4 / FEEDBACK3 H2b): the cap used to be captured ONCE at assembly, so
  // `vibe_v5_set { key: "vmu.paper.maxRounds", value: 6 }` answered "applied, no restart needed" and the next `final` was
  // still refused at 3. The pack now passes a READER (or a number) and this face asks it at every gate, so a receipt that
  // says the setting applied is true by construction — the same discipline `consultPolicy()` already follows.
  const roundsCap = () => {
    let v = null
    try { v = typeof ROUNDS_OPTION === 'function' ? ROUNDS_OPTION() : ROUNDS_OPTION } catch { v = null }
    if (v === null || v === undefined || v === '') return 3
    const n = Number(v)
    return Number.isFinite(n) ? n : 3
  }
  // How many editor-initiated repair rounds are allowed AFTER the cross-review cap: the cap limits the review loop, it
  // must not turn a paper into an object that can neither be finalised (content gate) nor revised (round cap).
  const REPAIR_ROUNDS = 2
  const MD_FILL = typeof mdFill === 'function' ? mdFill : null
  if (!kernel || !kernel.records) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the paper subsystem needs the records face', 'assemble a kernel with the records service')
  }
  const records = kernel.records
  const recordName = (target, artifact) => recordPrefix + '|' + str(target) + '|' + artifact

  const declaredTracks = () => {
    try {
      const v = kernel.settingsSnapshot ? kernel.settingsSnapshot()['vmu.records.tracks'] : null
      return Array.isArray(v) ? v.map(String) : []
    } catch { return [] }
  }
  const ensureTrack = () => {
    if (!declaredTracks().includes(TRACK)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the records face does not declare the "' + TRACK + '" track, so a paper cannot be archived',
        'declare vmu.records.tracks including "' + TRACK + '" (institution value layer)')
    }
  }
  const listPaper = () => {
    // ★★ RUN 168 (FEEDBACK15 F2): this read used `limit: 500` while the paper track's own cap is a SETTING
    // (`vmu.records.head.maxItems`, measured 200 in run 15, raised to 300 mid-run). A cap that grows past the read
    // limit silently hides the newest papers: the member kernel asked for `paper-p16` three ways and was told the paper
    // does not exist — and the refusal hint said "start one first", which minted a SECOND row with the same id.
    // The reader that resolves addresses must see every live row of the track, so it asks for all of them (limit 0).
    const rows = records.list({ track: TRACK, limit: 0 })
    return Array.isArray(rows.items) ? rows.items : []
  }
  const rowByTitle = (title) => listPaper().filter((r) => String(r.title) === title)[0] || null
  // ★★ RUN 162 (real machine, run 10 / FEEDBACK9 item 8 — TWO SPELLINGS, TWO OPPOSITE CONCLUSIONS): the paper track
  // carries one STATE row and four ARTEFACT rows per paper, and the artefact rows' bodies carry `id`/`target`/`status`
  // too (the meta row literally copies them). Reading `st.id` off ANY paper row therefore let an artefact row answer
  // for its paper: `target:"paper-p14"` resolved the META row (reviews {}, no consult ledger), so `final` refused
  // with "0 位互审" and `consult_state` reported "no requests" while the title spelling saw both. A paper is its
  // STATE row — the artefact rows are its outputs, never its identity.
  const stateRows = () => listPaper().filter((r) => /\|state$/.test(String(r.title || '')) || String(r.kind || '') === 'paper-state')
  // ★★ RUN 176 (run 21 A1 / FEEDBACK21 F1): "was this paper ever really compiled?" is a question about the COMPILE LEDGER
  // (`paper-pdf` rows whose body names a pdfPath), not about the state label. RUN 154's G10 shipped the opposite answer —
  // a paper could be set `finalized` with `pdf.ok:false` — and run 21 measured the cost: `paper-p17` could never be revised
  // (it was no longer awaiting its editor), `compile` re-typeset the same broken .tex, and fixing ONE typo required a
  // whole new paper. The listing is metadata-only, so each candidate row is opened to read the body it was compiled with.
  const compiledPdfRow = (state) => {
    if (!state) return null
    const want = [String(state.target === undefined || state.target === null ? '' : state.target), String(state.id === undefined || state.id === null ? '' : state.id)].filter((w) => w !== '')
    const cand = listPaper().filter((r) => String(r.kind || '') === 'paper-pdf' && want.some((w) => String(r.title || '').endsWith('|' + w + '|pdf')))
    // ★★ RUN 195 (run 37 / FEEDBACK36 1.1, MEASURED): THE LEDGER READ ANSWERED WITH THE OLDEST COMPILE. `compile` writes a
    // NEW `paper-pdf` row each time (same title, a new id), so a paper that was re-typeset AFTER its `final` had two rows —
    // and this loop returned the FIRST readable one, i.e. the compile that ran at finalisation. Run 37 measured the paper:
    // `final` produced 91 156 bytes, a member's own kernel later recompiled the same source to 91 198 bytes on disk, and
    // `status.pdfCompiled.pdfBytes` still said 91 156 (rec-19) while the file on disk was 91 198. The row answers "is there
    // a PDF, and which compile is it" — so it must be the NEWEST compile, and the caller is told the row it read.
    let best = null
    let bestKey = null
    for (const row of cand) {
      try {
        const got = records.get({ id: row.id })
        const full = got && got.record ? got.record : got
        const body = JSON.parse(String((full && full.body) || ''))
        if (body && body.pdfPath) {
          // ★★ RUN 176 (run 21 A2): the ledger read answers "is there a PDF?" and, when there is, the bytes/engine the
          // compile recorded — the same facts the receipt needs, so the face does not re-open the row and get it wrong.
          const entry = { id: row.id, title: row.title, pdfPath: body.pdfPath,
            pdfBytes: body.pdfBytes === undefined ? null : body.pdfBytes,
            // ★★★ RUN 2691 (TB-2691 / F75-15): the file hash the compile recorded from the SAME buffer it counted. A
            // ledger row written before this run has no such field (`null`), and the status face names that absence
            // instead of letting "bytes match" stand in for "same file".
            pdfSha256: body.pdfSha256 === undefined ? null : body.pdfSha256,
            engine: body.engine === undefined ? null : body.engine,
            // ★★★ TB-2772: the glyph verdict is a READING of the compile row, so the status face must carry it after a
            // refused final — otherwise "the PDF exists" would be the only thing visible on the face that explains why.
            glyphLossDetected: body.glyphLossDetected === true,
            missingCharacterCount: body.missingCharacterCount === undefined ? null : body.missingCharacterCount,
            glyphsUnrepaired: Array.isArray(body.glyphsUnrepaired) ? body.glyphsUnrepaired : [],
            glyphLossCode: body.glyphLossCode === undefined ? null : body.glyphLossCode,
            glyphLossMeans: body.glyphLossMeans === undefined ? null : body.glyphLossMeans,
            glyphLossHint: body.glyphLossHint === undefined ? null : body.glyphLossHint,
            logPath: body.logPath === undefined ? null : body.logPath,
            logRead: body.logRead === true,
            tried: Array.isArray(body.tried) ? body.tried : [] }
          const key = [
            Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : 0,
            Number.isFinite(Number(row.rev)) ? Number(row.rev) : 0,
          ]
          // ★★ RUN 195: ties go to the LATER row in the listing (the ledger lists oldest-first), so two compiles that
          // carry the same timestamp still resolve to the one that ran last instead of to whichever the walk met first.
          const better = bestKey === null || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] >= bestKey[1])
          if (better) { best = entry; bestKey = key }
        }
      } catch (e) { /* a row this instance cannot read is not evidence of a pdf; keep looking */ }
    }
    return best
  }
  const PORTABLE_TARGET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/
  const stateOfRow = (row) => {
    let body = row && row.body
    if (body === undefined && row && Array.isArray(row.blocks)) body = row.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('')
    // ★★ RUN 158: `records.list` rows carry METADATA ONLY (id/track/kind/title/status/fingerprint) - no body, no blocks.
    // Reading the minted id off a listed row therefore silently answered `{}` and the id the receipt printed stayed
    // unreachable; the body has to be fetched per row (one small read per paper, only on this fallback path).
    if (body === undefined && row && row.id) {
      try {
        const got = records.get({ id: row.id })
        const full = got && got.record ? got.record : got
        body = full && full.body
        if (body === undefined && full && Array.isArray(full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('')
      } catch { body = undefined }
    }
    try { return JSON.parse(String(body || '{}')) } catch { return null }
  }

  // ★★ RUN 181 (run 26 / FEEDBACK25 F25-5 — THE PAPER THAT WENT BACK IN TIME): one paper had TWO live state
  // rows under one title. Every round-2 `part`/`review` call was acknowledged, yet the newest state row carried a
  // round-1 body (`parts` named the round-1 rows, and `advance` then answered `from:"writing", round:1, reviewOf:{}`),
  // while `status` alternated between "writing, no parts" and "awaiting-editor at round 1". One row IS the paper (see
  // `stateRows`), so a title with several rows is a LOST UPDATE and not a second paper: the reader takes the row that
  // is FURTHEST ALONG (highest round, then newest revision), and the writer never mints a second one (see `writeState`).
  const stateRowOfTitle = (title) => {
    const rows = stateRows().filter((r) => String(r.title) === String(title))
    if (rows.length <= 1) return rows[0] || null
    let best = null
    let bestKey = null
    for (const row of rows) {
      const body = stateOfRow(row)
      const round = body && body.round !== undefined && body.round !== null ? Number(body.round) : null
      const key = [
        round !== null && Number.isFinite(round) ? round : -1,
        Number.isFinite(Number(row.updatedAt)) ? Number(row.updatedAt) : 0,
        Number.isFinite(Number(row.rev)) ? Number(row.rev) : 0,
      ]
      const better = !bestKey
        || key[0] > bestKey[0]
        || (key[0] === bestKey[0] && key[1] > bestKey[1])
        || (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])
      if (better) { best = row; bestKey = key }
    }
    return best
  }
  // ★★ RUN 158 (real machine, run 6 / feedback N2 — THE PAPER THAT COULD NOT BE COMPILED): `start` without a target
  // names the paper after its TITLE, and that title became BOTH the plate id (`paper-第五次续跑 之 结题 现场 验证 稿`)
  // and the directory name. xelatex refused the directory (`xelatex.exe: fatal: putenv(TEXMF_OUTPUT_DIRECTORY=…)`) while
  // the very same body compiled fine under an ASCII name — so a legal Chinese title could make the compiler unreachable.
  // The TITLE is still the title (rows are titled by it and every action still addresses the paper by it); the durable
  // ID and the folder are now ASCII: a portable target keeps `paper-<target>`, anything else is minted `paper-pN`.
  // ★★ RUN 167 (real machine, run 14 / FEEDBACK14 F4): A TRASHED PAPER STILL HOLDS ITS NAME. Measured: the office pruned
  // the paper track (RUN 165's repair) and then started `target:"p1"`, which mints the id `paper-p1`; the OLD `paper-p1`
  // was in the TRASH — restorable until its purgeAt — and the member kernel that still held it answered `paper-p1` with
  // the OLD paper while the office's receipt printed the new one. ONE NAME, TWO OBJECTS. A name in the trash is RESERVED,
  // not free: minting steps past it and an explicit portable target whose id is held refuses BY NAME.
  const trashedPaperRows = () => {
    let rows = []
    try { rows = typeof records.trashRows === 'function' ? records.trashRows({ track: TRACK }) : [] } catch { rows = [] }
    return Array.isArray(rows) ? rows : []
  }
  const trashedStateRows = () => trashedPaperRows().filter((r) => /\|state$/.test(String((r && r.title) || '')))
  const bodyOfTrashRow = (row) => {
    if (!row) return null
    if (row.body !== undefined) { try { return JSON.parse(String(row.body)) } catch { return null } }
    return null
  }
  /** The trashed paper (state row body) that already denotes this id or this target, or null. */
  const trashedNamesake = (id, target) => {
    for (const row of trashedStateRows()) {
      const b = bodyOfTrashRow(row)
      if (b && (String(b.id) === String(id) || String(b.target) === String(target))) return { id: String(b.id), target: String(b.target), recordId: row.id, purgeAt: row.purgeAt === undefined ? null : row.purgeAt }
    }
    return null
  }
  /**
   * ★★ RUN 172 (run 17 / FEEDBACK17 P3-16): a name the TRASH still holds was reported as `exists:false` — the same answer a
   * name that never existed gets. A reader then started a second paper (or concluded the ledger had forgotten it) while a
   * restorable row was holding the name. This lookup answers the question `status` could not: does the trash hold a row that
   * answers to this word (its id, its target, or its title)? A public face, because the refusal and the status receipt must
   * agree about the same fact.
   */
  const trashLookup = (word) => {
    const w = str(word)
    for (const row of trashedStateRows()) {
      const b = bodyOfTrashRow(row)
      if (!b) continue
      const hits = [b.id, b.target, b.title].filter((v) => v !== undefined && v !== null && String(v) !== '')
      if (!hits.some((v) => String(v) === w) && !(String(b.id || '') === w.replace(/^paper-/, ''))) continue
      return { id: String(b.id || ''), target: String(b.target || ''), title: b.title === undefined ? null : String(b.title), recordId: row.id, purgeAt: row.purgeAt === undefined ? null : row.purgeAt }
    }
    return null
  }
  const mintPaperId = () => {
    const used = new Set()
    for (const row of stateRows()) {
      const st = stateOfRow(row)
      if (st && st.id) used.add(String(st.id))
    }
    // the trash is part of the name space: a restorable row's id is not available to a new paper
    for (const row of trashedStateRows()) {
      const st = bodyOfTrashRow(row)
      if (st && st.id) used.add(String(st.id))
    }
    for (let n = 1; n <= 999; n += 1) {
      const cand = 'paper-p' + String(n)
      if (!used.has(cand) && !rowByTitle(recordName('p' + String(n), 'state')) && !trashedNamesake(cand, 'p' + String(n))) return cand
    }
    throw refuse(CODES.STATE, 'could not mint an unused paper id',
      'start the paper with an explicit target (target:"p12") so its id is portable by construction')
  }
  const readState = (target) => {
    // ★★ RUN 154 (real machine, run 4 / FEEDBACK3 H3): the tool receipt calls the object "paper-p5" while every
    // action addresses it by "p5", so a caller that copies the id it was just handed was told 'no paper "paper-p5" exists'.
    // Both spellings name the same paper here; the state keeps ONE name (the target) as the truth.
    let word = str(target)
    let row = stateRowOfTitle(recordName(word, 'state'))
    if (!row && /^paper-/.test(word)) { word = word.replace(/^paper-/, ''); row = stateRowOfTitle(recordName(word, 'state')) }
    // ★★ RUN 158 (N2): a paper that got a MINTED id (`paper-p3`) is not titled by that id, so the id the receipt prints
    // must still address it — otherwise the advertised repair ("address the paper by its id") names an unreachable object.
    // ★ NOTE the ORIGINAL spelling is tested here: the strip above turned `paper-p3` into `p3`, which is exactly the
    // form that is NOT a paper-p id, so testing `word` would make the advertised id unreachable again.
    if (!row && /^paper-p[0-9]+$/.test(str(target))) {
      // ★★ RUN 162: STATE rows only (see `stateRows`) — an artefact row's body also carries `id`, and matching it made
      // `final`/`consult` disagree with `status`/`render` about the same paper.
      for (const cand of stateRows()) {
        const st = stateOfRow(cand)
        if (st && String(st.id) === str(target)) { row = cand; break }
      }
    }
    // ★★ RUN 164 (FEEDBACK12 item 7): a caller that copies the paper's TITLE (what `start`/`status` print as the human
    // name, e.g. a Chinese heading) used to be told the paper does not exist, even though the title is exactly what the
    // receipts show. The title now resolves too — the state keeps ONE name (the target) as the truth, so every receipt
    // still answers with the target; this only widens what may be passed IN.
    let matchedBy = word === str(target) ? 'target' : 'paper-id'
    if (!row) {
      for (const cand of stateRows()) {
        const st = stateOfRow(cand)
        if (!st) continue
        const names = [st.title, st.target].filter((x) => x !== undefined && x !== null).map(String)
        if (names.includes(str(target))) { row = cand; matchedBy = 'title'; break }
      }
    }
    if (!row) return null
    const got = records.get({ id: row.id })
    const full = got && got.record ? got.record : got
    let body = full && full.body
    if (body === undefined && Array.isArray(full && full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('\n')
    try {
      const state = JSON.parse(String(body || '{}'))
      // ★★ RUN 152 (real machine, run 2, agent feedback F5 — SILENT LOST UPDATE): the state row is rewritten IN PLACE,
      // and two `part` calls that ran CONCURRENTLY both read the same body, both said ok:true, and the second write
      // dropped the first member's part (measured: rec-29 vanished while its receipt said ok). A read snapshot is now
      // remembered on the returned object (non-enumerable, so it never enters the durable body) and `writeState` refuses
      // the write when the row moved in between: a concurrent edit is a NAMED conflict, never a silent merge or a silent
      // loss.
      if (full && full.rev !== undefined) {
        Object.defineProperty(state, '__seen', { value: { rev: full.rev, updatedAt: full.updatedAt === undefined ? null : full.updatedAt }, enumerable: false, writable: true, configurable: true })
      }
      if (matchedBy === 'title') Object.defineProperty(state, '__matchedBy', { value: 'title', enumerable: false, writable: true, configurable: true })
      return { state, row: full }
    } catch { return null }
  }
  // ★★ RUN 181 (F25-5): a snapshot whose `stateRecordId` was lost used to be written as a SECOND state row, and
  // because the body it carried was older than the paper the round-2 parts/reviews stayed live but were no longer named
  // by any state row. Two guards replace that silent reset: adopt the row that already exists for this title, and refuse
  // the write BY NAME when the paper on disk is already further along than the snapshot.
  const refuseStaleRound = (target, mine, theirs) => {
    throw refuse(CODES.STATE,
      'paper "' + str(target) + '" is at round ' + String(theirs) + ' on disk but this write carries a round-' + String(mine)
        + ' snapshot: writing it would move the paper backwards, so nothing was written',
      're-read the paper (vibe_v5_paper { action: "status", target: "…" }) and repeat the action on the fresh state — an older snapshot is refused by name, the paper keeps its later round')
  }
  const stateRoundOf = (body) => (body && body.round !== undefined && body.round !== null && Number.isFinite(Number(body.round)) ? Number(body.round) : null)
  const writeState = (state) => {
    // ONE state record, updated IN PLACE: `records.put` with the remembered id writes a new revision, so the paper has
    // exactly one live state row (a fresh id per write would leave duplicates whose list order decides the truth).
    // ★★ RUN 152 (F5): before writing, verify the row has not moved since this state snapshot was read. Two concurrent
    // `part` calls used to both succeed and the later write silently dropped the earlier one; now the stale writer is
    // refused BY NAME (the caller retries on the fresh body) and nothing is lost.
    const seen = state && state.__seen ? state.__seen : null
    if (!state.stateRecordId) {
      const existing = stateRowOfTitle(recordName(state.target, 'state'))
      if (existing) {
        const theirs = stateRoundOf(stateOfRow(existing))
        const mine = stateRoundOf(state)
        if (theirs !== null && mine !== null && theirs > mine) refuseStaleRound(state.target, mine, theirs)
        // adopt it: the paper keeps ONE state row for its whole life
        state.stateRecordId = existing.id
      }
    }
    if (state.stateRecordId) {
      // ★ the revision check below catches a CONCURRENT write; it cannot catch a snapshot taken in a kernel that never
      // folded the later revision (that kernel's own `cur.rev` is the old one, so the revs agree). The round on disk is
      // the fact that says which snapshot is older, and a paper never moves backwards.
      let onDisk = null
      try {
        const got = records.get({ id: state.stateRecordId })
        onDisk = stateRoundOf(stateOfRow(got && got.record ? got.record : got))
      } catch { onDisk = null }
      const mine = stateRoundOf(state)
      if (onDisk !== null && mine !== null && onDisk > mine) refuseStaleRound(state.target, mine, onDisk)
    }
    if (state.stateRecordId && seen && seen.rev !== undefined && seen.rev !== null) {
      let cur = null
      try {
        const got = records.get({ id: state.stateRecordId })
        cur = got && got.record ? got.record : got
      } catch { cur = null }
      if (cur && cur.rev !== undefined && cur.rev !== null && String(cur.rev) !== String(seen.rev)) {
        throw refuse(CODES.STATE,
          'paper "' + state.target + '" was changed by another writer between this call\'s read and its write (revision ' + String(seen.rev) + ' → ' + String(cur.rev) + '): this write would drop that change, so nothing was written',
          're-read the paper (vibe_v5_paper { action: "status", target: "…" }) and retry this call on the fresh state — concurrent writes to one paper are not merged silently')
      }
    }
    const put = records.put({
      id: state.stateRecordId || null,
      track: TRACK, kind: 'paper-state', title: recordName(state.target, 'state'),
      body: JSON.stringify(state), settled: state.status === 'finalized', by: author,
    })
    if (put && put.id) state.stateRecordId = put.id
    // the new revision becomes this snapshot's baseline, so a second write from the SAME call chain is not a conflict
    if (state.stateRecordId) {
      try {
        const got = records.get({ id: state.stateRecordId })
        const full = got && got.record ? got.record : got
        if (full && full.rev !== undefined) {
          Object.defineProperty(state, '__seen', { value: { rev: full.rev, updatedAt: full.updatedAt === undefined ? null : full.updatedAt }, enumerable: false, writable: true, configurable: true })
        }
      } catch { /* the write itself succeeded; only the baseline refresh is best-effort */ }
    }
    return put
  }

  const requireState = (target) => {
    const found = readState(target)
    if (!found) {
      // ★★ RUN 168 (FEEDBACK15 F2 — THE HINT THAT MANUFACTURED A DUPLICATE): this refused by name and then told the caller
      // to start a paper, so a member whose kernel had not folded a paper the OFFICE had just created obeyed and minted
      // a SECOND row under the same id (measured in run 15: `paper-p16` was rec-354 for the office and rec-355 for the
      // member, and afterwards `paper-p16`/`p16` resolved one paper while its Chinese title resolved the other).
      // "I cannot see it" is not "it does not exist": the exit names the cross-kernel case and the address that survives it.
      throw refuse(CODES.STATE, 'no paper "' + str(target) + '" exists in THIS instance records projection',
        'check the spelling first (target, `paper-pN`, or the paper title all address one paper); if another kernel or seat '
          + 'just started it, this instance may not have folded that row yet — re-read and retry, and take the stateRecordId '
          + 'from its receipt instead of starting a second paper under the same name')
    }
    return found
  }

  /** ① start: writing/round 1, participants = the writing members. */
  // ── ★ E4 / OFFICE CONSULT — "最后讨论、检查无误后定稿：定稿前必须问所办" ──────────────────────────────────────
  // WHY THE GATE IS HERE. `kernel/paper.js` also carries a consult gate, but NOTHING constructs it in the live assembly
  // (only tests and scripts call `createPaper(`), so a guard there is a comment: the rule never ran. The path that
  // ACTUALLY finalises a paper is `packs/v5r/paper.js` → this kit (`vibe_v5_paper` → `recordFinal`), so the gate lives
  // here, on the registered path. POLICY STAYS IN THE PACK: who answers (`consultRoles`) and which roles are exempt come
  // in as parameters; the kit owns only the state transition, the durable ledger, and the named refusals (the CODES are
  // passed in — the kit invents none).
  const CONSULT_ROLES = Array.isArray(consultRoles) ? consultRoles.map(String).filter(has) : []
  const CONSULT_KEYS = Object.freeze([
    'vmu.paper.officeConsult',
    'vmu.paper.officeConsultOn',
    'vmu.paper.officeConsultTimeoutMs',
    'vmu.paper.officeConsultOnTimeout',
    'vmu.paper.officeConsultExemptRoles',
  ])
  const settingsSnap = () => {
    try { return (kernel.settingsSnapshot ? kernel.settingsSnapshot() : {}) || {} } catch { return {} }
  }
  /**
   * Read the five consult keys AT CALL TIME (D-13: live reads, never a boot snapshot). Two rules a settings gate owes its
   * reader: (a) an unreadable value is NEVER a quiet allow — `officeConsult` outside required|off is reported as
   * `invalid` and refuses; (b) an unrecognised `officeConsultOnTimeout` degrades to `hold` (the conservative branch),
   * because "I did not understand the policy" must not become "go ahead".
   */
  function consultPolicy() {
    const s = settingsSnap()
    const raw = s['vmu.paper.officeConsult']
    const status = raw === undefined || raw === null ? 'off'
      : (raw === true || raw === 'required') ? 'required'
      : (raw === false || raw === 'off') ? 'off'
      : 'invalid'
    const onRaw = str(s['vmu.paper.officeConsultOn'])
    const on = onRaw === '' ? 'finalize' : onRaw
    const tRaw = s['vmu.paper.officeConsultTimeoutMs']
    const timeoutMs = (typeof tRaw === 'number' && Number.isFinite(tRaw) && tRaw >= 0) ? tRaw : 0
    const onTimeoutRaw = str(s['vmu.paper.officeConsultOnTimeout'])
    const onTimeout = onTimeoutRaw === 'refuse' ? 'refuse' : 'hold'
    const exemptRaw = s['vmu.paper.officeConsultExemptRoles']
    const exemptRoles = Array.isArray(exemptRaw) ? exemptRaw.map(String).filter(has) : []
    return {
      status, on, timeoutMs, onTimeout, exemptRoles,
      raw: raw === undefined ? null : raw,
      onTimeoutRaw: onTimeoutRaw === '' ? null : onTimeoutRaw,
      values: {
        'vmu.paper.officeConsult': raw === undefined ? null : raw,
        'vmu.paper.officeConsultOn': on,
        'vmu.paper.officeConsultTimeoutMs': timeoutMs,
        'vmu.paper.officeConsultOnTimeout': attemptsDown(onTimeoutRaw, onTimeout),
        'vmu.paper.officeConsultExemptRoles': exemptRoles.slice(),
      },
    }
  }
  /** Report the timeouts as they are USED (the raw value travels separately in `onTimeoutRaw`), so a receipt never claims
   *  a policy that is not the one enforced. */
  function attemptsDown(rawOnTimeout, used) {
    return rawOnTimeout === '' || rawOnTimeout === null || rawOnTimeout === used ? used : used + ' (from ' + rawOnTimeout + ')'
  }
  const MAX_CONSULT_REQUESTS = 16
  /** The consult ledger lives INSIDE the paper's state record (one record per paper ⇒ a replay finds the questions
   *  already asked). It is BOUNDED: at most 16 entries; the counters keep the long history. */
  function consultOf(state) {
    if (!state.consult || typeof state.consult !== 'object') state.consult = { requests: [], opened: 0, answered: 0, exempted: 0, timedOut: 0 }
    const c = state.consult
    if (!Array.isArray(c.requests)) c.requests = []
    if (typeof c.opened !== 'number') c.opened = 0
    if (typeof c.answered !== 'number') c.answered = 0
    if (typeof c.exempted !== 'number') c.exempted = 0
    if (typeof c.timedOut !== 'number') c.timedOut = 0
    return c
  }
  const consultAnswered = (ledger) => ledger.requests.filter((r) => r && r.status === 'answered').slice(-1)[0] || null
  const consultAwaiting = (ledger) => ledger.requests.filter((r) => r && r.status === 'awaiting').slice(-1)[0] || null
  /**
   * ★★★ RUN 211 (run 48 / FEEDBACK47 2.5, MEASURED): the office-consult gate fires at `final`, which is the LAST step of
   * the main line — run 48's agent discovered it only there ("I thought finalization was one call away"). The fact is
   * knowable at the moment the paper becomes ready to finalise, so `advance` says it THEN, in its own fields, and names
   * the exact consult call. It is a PREDICTION: it reads the same policy and ledger `final` will read, and never blocks.
   */
  function consultPrediction(state) {
    const policy = consultPolicy()
    if (policy.status !== 'required') {
      return { officeConsultPending: false,
        officeConsultMeans: 'vmu.paper.officeConsult is "' + String(policy.raw) + '": finalization will NOT wait for an office answer' }
    }
    const ledger = consultOf(state)
    const answered = consultAnswered(ledger)
    if (answered) {
      return { officeConsultPending: false, officeConsultAnsweredBy: answered.answeredBy || null, officeConsultRequestId: answered.id || null,
        officeConsultMeans: 'an office answer is already on this paper (request ' + String(answered.id || '?') + ', answered by ' + String(answered.answeredBy || '?') + '), so finalization will pass this gate' }
    }
    return { officeConsultPending: true, officeConsultRequestedAt: null,
      officeConsultMeans: 'vmu.paper.officeConsult="required" and this paper has NO answered consult yet: `final` WILL open a consult question and refuse until the office answers. Answer it with vibe_v5_paper { action:"consult", target:"' + String(state.target) + '", member:"<office id>", answer:"…" } — do NOT flip the setting to unblock it' }
  }
  const rosterOf = () => {
    try { return Array.isArray(kernel.members && kernel.members.roster()) ? kernel.members.roster() : [] } catch { return [] }
  }
  /**
   * The gate. Returns `{ allowed, reason, policy, ledger, error? }` and NEVER throws: the caller owns the mutation order,
   * which is how a refusal leaves the paper exactly where it was (bar the durable request it just opened — that is the
   * point of asking: the question must survive a crash, not be re-asked from scratch).
   */
  function consultGate({ state, member }) {
    const policy = consultPolicy()
    const ledger = consultOf(state)
    const wanted = ['OFFICE_CONSULT_REQUIRED', 'OFFICE_CONSULT_TIMEOUT']
    const missing = wanted.filter((k) => !codes || typeof codes[k] !== 'string')
    if (policy.status === 'invalid') {
      return { allowed: false, policy, ledger, reason: 'invalid-policy',
        error: refuse('VMU_INVALID_ARGUMENT',
          'vmu.paper.officeConsult 只能是 "required" 或 "off"，现在是 ' + JSON.stringify(policy.raw),
          '把 vmu.paper.officeConsult 改成 "required"（定稿前必须问所办）或 "off"（不要这道闸）；来源：pack defaults / 配置 / 运行时设置',
          { enforced: CONSULT_KEYS.slice(), declared: ['required', 'off'], value: policy.raw, settingValues: policy.values }) }
    }
    if (policy.status !== 'required') {
      return { allowed: true, policy, ledger, reason: 'policy:' + policy.status, armed: false }
    }
    if (CONSULT_ROLES.length === 0) {
      // ★ A gate nobody can satisfy must fail as a CONFIGURATION error, at the gate, with the missing declaration named —
      // not open a question in the ledger that no answer can ever close (that would look like "waiting forever by design").
      return { allowed: false, policy, ledger, reason: 'no-answer-role',
        error: refuse('VMU_INVALID_ARGUMENT',
          '所办问询闸是开着的（vmu.paper.officeConsult="required"），但声明这层流程的一方没有给出"谁能答复"',
          '在 createPaperFlow 里传 consultRoles:["office"]（答复角色是机构政策，内核不替它猜）；或在 pack 里把 vmu.paper.officeConsult 设成 "off"',
          { enforced: CONSULT_KEYS.slice(), declared: [], declaredAnswerRoles: [], settingValues: policy.values }) }
    }
    if (missing.length > 0) {
      return { allowed: false, policy, ledger, reason: 'codes-missing',
        error: refuse('VMU_INVALID_ARGUMENT',
          '所办问询闸是开着的（vmu.paper.officeConsult="required"），但调用方没有把这道闸的登记码传下来',
          '在声明这层流程的机构里把 codes:{' + missing.join(',') + '} 传进 createPaperFlow（内核不发明错误码）',
          { enforced: CONSULT_KEYS.slice(), declared: wanted.slice(), missing: codes ? missing : wanted.slice(), settingValues: policy.values }) }
    }
    const answered = consultAnswered(ledger)
    if (answered) {
      return { allowed: true, policy, ledger, reason: 'answered', armed: true,
        answeredBy: answered.answeredBy || null, answer: answered.answer === undefined ? null : answered.answer, requestId: answered.id || null }
    }
    const row = rosterOf().filter((m) => m && String(m.id) === str(member))[0]
    const me = [str(member), row ? str(row.slot) : ''].filter(has)
    const hit = policy.exemptRoles.filter((r) => me.includes(str(r)))
    if (hit.length > 0) {
      ledger.exempted += 1
      writeState(state)
      return { allowed: true, policy, ledger, reason: 'exempt', armed: true, exemptedBy: hit[0],
        note: 'vmu.paper.officeConsultExemptRoles 里点了「' + hit[0] + '」，所以这一篇不再等所办' }
    }
    const awaiting = consultAwaiting(ledger)
    const now = Number(clock())
    if (awaiting) {
      const waited = Number(now) - Number(awaiting.at)
      const expired = policy.timeoutMs > 0 && Number.isFinite(waited) && waited > policy.timeoutMs
      const base = { enforced: CONSULT_KEYS.slice(), declared: ['required', 'off'], currentValue: String(policy.raw),
        settingValues: policy.values, requestId: awaiting.id || null, requestedAt: awaiting.at === undefined ? null : awaiting.at,
        waitedMs: Number.isFinite(waited) ? waited : null, timeoutMs: policy.timeoutMs, onTimeout: policy.onTimeout, actedBy: str(member),
        // ★★ RUN 154 (G9, second site): this is the refusal the real office actually hit — the field the ANSWER call
        // takes is `target`, and it was only inside the hint's prose, so a caller reading fields had to parse Chinese to
        // find it. Same key, same value, now a first-class field.
        target: str(state.target), paperId: str(state.id) }
      if (expired && policy.onTimeout === 'refuse') {
        awaiting.status = 'timed-out'
        ledger.timedOut += 1
        writeState(state)
        return { allowed: false, policy, ledger, reason: 'timeout-refused', requestCleared: true,
          error: refuse(CODES.OFFICE_CONSULT_TIMEOUT,
            '定稿被拦住：所办 ' + policy.timeoutMs + 'ms 内没有答复（vmu.paper.officeConsultOnTimeout="refuse"）',
            '重新问一次（这条提问已作废）：所办调 vibe_v5_paper { action: "consult", target: "…", member: "<所办 id>", answer: "…" }（kit 层即 recordConsult）；或改成 "hold"（继续等、仍不放行）；或把 vmu.paper.officeConsult 设成 "off"',
            { ...base, treatedAs: 'refused', requestCleared: true }) }
      }
      if (expired) {
        ledger.timedOut += 1
        writeState(state)
        return { allowed: false, policy, ledger, reason: 'timeout-hold', requestCleared: false,
          error: refuse(CODES.OFFICE_CONSULT_TIMEOUT,
            '所办已超过 ' + policy.timeoutMs + 'ms 未答复；vmu.paper.officeConsultOnTimeout="hold" 保持提问但**不放行**',
            '等所办答复后重试；或把 onTimeout 设成 "refuse"（作废并重新问）；不要指望它自己放行',
            { ...base, heldOnTimeout: true, requestCleared: false }) }
      }
      return { allowed: false, policy, ledger, reason: 'awaiting', requestCleared: false,
        error: refuse(CODES.OFFICE_CONSULT_REQUIRED,
          '定稿前必须问所办（vmu.paper.officeConsult="required"）：这道提问还没有答复（' + (awaiting.id || '?') + '）',
          'REACHABLE INSTEAD: 让所办用 vibe_v5_paper { action: "consult", target: "' + str(state.target) + '", member: "' + (CONSULT_ROLES[0] || 'office') + '", answer: "…" } 答复（先用 action: "consult_state" 读 awaiting.id），答完重试 action: "final"；**不要**用「把 vmu.paper.officeConsult 设成 "off"」绕过它：那是部署方的闸门配置（设置面会明确劝阻），待答的咨询要有人答',
          { ...base, reason: 'awaiting', target: str(state.target), paperId: str(state.id) }) }
    }
    ledger.opened += 1
    const request = { id: consultRequestId(ledger.opened, { seed: str(state.target), rand }), by: str(member), at: now, note: '', status: 'awaiting', policy: 'required' }
    ledger.requests.push(request)
    if (ledger.requests.length > MAX_CONSULT_REQUESTS) ledger.requests.splice(0, ledger.requests.length - MAX_CONSULT_REQUESTS)
    writeState(state)
    return { allowed: false, policy, ledger, reason: 'opened', requestId: request.id, requestCleared: false,
      error: refuse(CODES.OFFICE_CONSULT_REQUIRED,
        '定稿前必须问所办（vmu.paper.officeConsult="required"）：已向所办(' + (CONSULT_ROLES.join('|') || '未声明') + ')提出问询 ' + request.id + '，还没有答复',
        'REACHABLE INSTEAD: 让所办用 vibe_v5_paper { action: "consult", target: "' + str(state.target) + '", member: "' + (CONSULT_ROLES[0] || 'office') + '", answer: "…" } 答复（先用 action: "consult_state" 读 awaiting.id），答完重试 action: "final"；**不要**用「把 vmu.paper.officeConsult 设成 "off"」绕过它——那是部署方的闸门配置（设置面会明确劝阻），不是 agent 的通行路径，而这条咨询是等一个真人回答',
        { enforced: CONSULT_KEYS.slice(), declared: ['required', 'off'], currentValue: String(policy.raw), settingValues: policy.values,
          requestId: request.id, requestedAt: now, actedBy: str(member), answerRoles: CONSULT_ROLES.slice(),
          // ★★ RUN 154 (G9): the key the fix has to carry is `target` (the answer call's argument), and it is now on the
          // receipt itself — run 4 measured the office answering, hitting 'no target was given', and retrying blind.
          target: str(state.target), paperId: str(state.id) }) }
  }
  /** The office's answer. WHO may answer is POLICY (`consultRoles`, from the pack): the kit refuses anyone else with a
   *  NAMED refusal that lists the roles it would have accepted — a gate nobody can satisfy must say so out loud. */
  function recordConsult({ target, by, note = '', answer = null } = {}) {
    const { state } = requireState(target)
    if (state.status === 'finalized') {
      throw refuse(CODES.STATE, '这篇论文已经定稿了，所办问询不能再补', '问询是"定稿前"的闸：现在开始问只能对下一篇（或先把 status 改回 awaiting-editor 再走一遍）')
    }
    if (!has(by)) throw refuse('VMU_INVALID_ARGUMENT', 'recordConsult 需要 by（谁在答复：所办）', 'pass by:"office"（pack 用 consultRoles 声明答复角色）')
    const row = rosterOf().filter((m) => m && String(m.id) === str(by))[0]
    const who = [str(by), row ? str(row.slot) : ''].filter(has)
    const okRole = CONSULT_ROLES.filter((r) => who.includes(str(r)))[0]
    if (!okRole) {
      throw refuse('VMU_NOT_PERMITTED',
        '「' + str(by) + '」不能答复所办问询：只有 ' + (CONSULT_ROLES.join('|') || '（pack 没有声明答复角色）') + ' 可以',
        '答复角色是 pack 声明的事实（createPaperSubsystem → consultRoles），不是内核替它猜的；学会说"不对"比悄悄放行安全',
        { declared: CONSULT_ROLES.slice(), received: str(by), memberSlot: row ? str(row.slot) : null })
    }
    const ledger = consultOf(state)
    const awaiting = consultAwaiting(ledger)
    const now = Number(clock())
    let request = awaiting
    if (!request) {
      ledger.opened += 1
      request = { id: consultRequestId(ledger.opened, { seed: str(state.target), rand }), by: str(by), at: now, note: '', status: 'awaiting', policy: 'required' }
      ledger.requests.push(request)
      if (ledger.requests.length > MAX_CONSULT_REQUESTS) ledger.requests.splice(0, ledger.requests.length - MAX_CONSULT_REQUESTS)
    }
    request.status = 'answered'
    request.answeredAt = now
    request.answeredBy = str(by)
    request.answeredRole = okRole
    request.note = str(note).slice(0, 2000)
    request.answer = answer === null || answer === undefined ? null : String(answer).slice(0, 2000)
    ledger.answered += 1
    writeState(state)
    return { ok: true, target: state.target, requestId: request.id, answeredBy: request.answeredBy, answeredRole: okRole,
      answeredAt: now, answered: ledger.answered, cleared: Boolean(awaiting), note: request.note }
  }
  /** Read side: the gate's own state, so a caller (or a test) can answer "was the office asked, and what did it say?" */
  function consultState({ target } = {}) {
    const { state } = requireState(target)
    const policy = consultPolicy()
    const ledger = consultOf(state)
    const awaiting = consultAwaiting(ledger)
    const answered = consultAnswered(ledger)
    return { ok: true, target: state.target, status: state.status, armed: policy.status === 'required',
      policy: { ...policy.values, raw: policy.raw, onTimeoutRaw: policy.onTimeoutRaw, answerRoles: CONSULT_ROLES.slice() },
      awaiting: awaiting ? { id: awaiting.id, at: awaiting.at, by: awaiting.by } : null,
      answered: answered ? { id: answered.id, at: answered.answeredAt, by: answered.answeredBy, role: answered.answeredRole, note: answered.note, answer: answered.answer } : null,
      requests: ledger.requests.map((r) => ({ id: r.id, status: r.status, at: r.at, by: r.by, answeredAt: r.answeredAt || null, answeredBy: r.answeredBy || null })),
      counters: { opened: ledger.opened, answered: ledger.answered, exempted: ledger.exempted, timedOut: ledger.timedOut } }
  }

  function start({ target, title = '', participants = [], editor, lang = 'zh', format = 'both' } = {}) {
    ensureTrack()
    if (!has(target)) throw refuse('VMU_INVALID_ARGUMENT', 'start needs the paper target', 'pass target:"<the object being written up>"')
    const list = Array.isArray(participants) ? participants.map(String).filter((x) => x !== '') : []
    if (list.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'start needs at least one writing participant', 'pass participants:["r-1", …]')
    // ★★ RUN 205 (run 43 / FEEDBACK42 1.3, MEASURED): `participants:["r-1","r-2","r-3"]` was ACCEPTED and the paper then carried
    // a section authored by a member who is not on the roster (run 43's rec-69). A participant list is a claim about who
    // writes, so it is checked against the roster HERE — where a wrong name is still cheap to fix. An EMPTY roster is not
    // an error (scripted fixtures build papers before hiring); it just has nothing to check against.
    const startRoster = rosterOf()
    if (startRoster.length > 0) {
      const known = new Set(startRoster.map((m) => String(m.id)))
      const unknown = list.filter((id) => !known.has(String(id)))
      if (unknown.length > 0) {
        throw refuse('VMU_NO_SUCH_OBJECT',
          'start names writing participants that are NOT on the roster: ' + unknown.join(', ')
            + ' — the paper would carry parts authored by members nobody can address, and no other member could review them',
          'name participants from the roster: ' + startRoster.map((m) => String(m.id) + '@' + String(m.slot)).join(', ')
            + '; to add a new member hire it first (vmu.members.hire / the hire face of this deployment), then start the paper',
          { participants: list.slice(), unknown, roster: startRoster.map((m) => String(m.id)) })
      }
    }
    // ★★ RUN 152 (real machine, run 2 of the simulation): `editor` used to be stored VERBATIM, so starting a paper with
    // `editor:"r-acad"` (the chair-seated member, i.e. the academician) produced a paper whose finalisation was then
    // refused by `recordFinal`, which only accepts the ROLE word "academician" — the flow let a caller configure a paper
    // it could never finalise, and only said so at the LAST step (4 attempts, three papers wasted). The role is
    // resolved HERE, where the answer is still actionable: a member id is accepted exactly when that member sits in the
    // chair slot, and anything else is refused by name before the paper exists.
    // ★★ RUN 175 (run 20 FEEDBACK20 ⑦): `editor` has a DEFAULT, so a caller who omitted it could not tell from the
    // receipt which finaliser the paper got — the value was only visible later, on `status`. The start receipt now
    // names the word AND where it came from (`default` vs the caller's argument vs a seat id normalized to the role).
    const editorGiven = editor !== undefined && editor !== null && String(editor).trim() !== ''
    const editorWord = editorGiven ? String(editor).trim() : editorDefault
    let editorName = editorWord
    if (editorWord !== editorDefault && editorWord !== 'office') {
      const seat = (kernel.members ? kernel.members.roster() : []).filter((m) => String(m.id) === editorWord)[0] || null
      if (seat && String(seat.slot) === finalizerSlot) editorName = editorDefault
      else {
        // ★★ RUN 174 (run 19 FEEDBACK19 F6): the refusal named the rule but not the ANSWER — a member handed their own id
        // ("editor: r-2") had to read the hint again to learn the word is a ROLE. Name the chair-seated member and the whole
        // roster (id@slot) in the refusal, so "who do I pass" is answered where it is asked.
        const roster = (kernel.members ? kernel.members.roster() : []) || []
        const chair = roster.filter((m) => String(m.slot) === finalizerSlot).map((m) => String(m.id))[0] || null
        throw refuse('VMU_INVALID_ARGUMENT',
          'paper editor "' + editorWord + '" is neither the academician role nor a member seated in the chair slot'
            + (seat ? ' (that member is in slot "' + String(seat.slot) + '")' : ' (no such member on the roster)'),
          'pass editor:"academician" (this is the DEFAULT — omit `editor` entirely) or editor:"office" (the office finalises after consulting the institute). '
            + (chair ? 'The chair seat is held by ' + chair + ', so THAT id is the one accepted: editor:"' + chair + '". ' : 'No member is seated in the chair slot, so only editor:"office" is finalisable. ')
            + 'roster: ' + (roster.map((m) => String(m.id) + '@' + String(m.slot)).join(', ') || '(empty)')
            + ' — a member id is accepted only when that member sits in the chair slot and is recorded as "academician"')
      }
    }
    const existing = readState(str(target))
    if (existing) throw refuse(CODES.STATE, 'a paper for "' + str(target) + '" already exists',
      'advance/finalize the existing one, or start a paper for a different target (this face never silently overwrites)',
      // ★★ RUN 170 (run 16 / FEEDBACK16 F16-6): the refusal named the target and withheld the one id a caller can act on.
      { requestedTarget: str(target), existingTarget: String(existing.state.target), stateRecordId: existing.state.stateRecordId || null, status: existing.state.status || null })
    // ★★ RUN 158 (N2): see mintPaperId above — the id/folder must be ASCII even when the title is not.
    const targetWord = str(target)
    const asciiSafe = PORTABLE_TARGET.test(targetWord)
    const plateId = asciiSafe ? 'paper-' + targetWord : mintPaperId()
    // ★★ RUN 167 (FEEDBACK14 F4): the portable-target id is not mints-only — it is DERIVED, so it can collide with a paper
    // the trash still holds. Naming the collision is the repair: a target that means two papers is the defect, not a
    // refusal to fix.
    // ★★ RUN 168 (FEEDBACK15 F2 — ONE ID, TWO PAPERS): the id is the paper's NAME. A caller whose target differs but whose
    // derived id collides (`target:"p16"` derives `paper-p16`, which an earlier mint for a Chinese title already holds)
    // used to get a fresh state row: two papers, one id, and then address resolution picked whichever row it matched
    // first. The durable ledger is asked BEFORE the row is written, so the collision is named instead of duplicated.
    const idTwin = readState(plateId)
    if (idTwin) {
      throw refuse(CODES.STATE,
        'the paper id ' + plateId + ' already denotes an existing paper (target "' + String(idTwin.state.target) + '", state record ' + String(idTwin.state.stateRecordId || '?') + '), so a second paper cannot take that name',
        'address the existing paper by that id or by its target (the two are one paper); start THIS paper under a different target, or reuse the existing one',
        { requestedId: plateId, requestedTarget: targetWord, existingTarget: String(idTwin.state.target), existingStateRecord: idTwin.state.stateRecordId || null })
    }
    const held = trashedNamesake(plateId, targetWord)
    if (held) {
      throw refuse(CODES.STATE,
        'the durable ledger still holds ' + held.id + ' in the TRASH (target "' + held.target + '", restorable until ' + String(held.purgeAt) + '), so a new paper cannot take that name',
        'start the paper under a different target, or purge the trash first (vibe_vmu_records { action: "prune" } frees slots, but a trashed paper is restorable until purgeAt — until then its NAME is reserved)',
        // ★★ RUN 172 (run 17 / FEEDBACK17 P3): this refusal carried the trash facts one level down (`trash:{}`) while the
        // sibling "already exists" refusal carries `stateRecordId`/`status` AT THE TOP. Two shapes for one class of refusal
        // makes a caller branch on which one it got. The trash branch now answers the same question the same way, and says
        // `inTrash:true` so "name is free" and "name is held by a restorable row" are never read as the same fact.
        { requestedId: plateId, requestedTarget: targetWord, stateRecordId: held.recordId, status: 'trashed', inTrash: true, trash: held })
    }
    const state = {
      id: plateId, target: targetWord, title: str(title) || targetWord, status: 'writing', stage: 'writing', round: 1,
      participants: list, editor: editorName, lang: lang === 'en' ? 'en' : 'zh',
      // ★★ RUN 178 (run 23 / FEEDBACK23 F6, MEASURED): `status` printed `editor:"academician"` — a ROLE word that is
      // neither a seat id nor the `start` receipt's `editor:{value,source}` — so a reader could not tell a defaulted
      // finaliser from an asked-for one, and could not compare the two receipts at all. The source is now part of the
      // durable state, so every later reading answers the same question the `start` receipt answered.
      editorSource: editorGiven ? (String(editor).trim() === editorName ? 'argument' : 'argument-normalised') : 'default',
      format: ['both', 'md', 'tex'].includes(format) ? format : 'both',
      parts: {}, reviews: {}, reviewOf: {}, final: null, disagreement: [], warnings: [], forcedAfterCap: false,
      // ★ E4: the ledger starts empty here so "was the office asked?" is answerable for EVERY paper, not only the ones
      // that reached the gate (an absent field would make the reader ask a second question: does null mean no or unknown?).
      consult: { requests: [], opened: 0, answered: 0, exempted: 0, timedOut: 0 },
      // ★★ RUN 172 (run 17 / FEEDBACK17 P3): the state used to carry `createdAt: 1, updatedAt: 1` and NOTHING ever advanced
      // them — a reader that saw `createdAt:1` reasonably read epoch-milliseconds and concluded the paper was created in
      // 1970. They were never timestamps; they were the ROUND the paper was started and last changed in. The names now say
      // so (`createdRound`/`updatedRound`), so no reader has to guess a unit the value never had.
      createdRound: 1, updatedRound: 1,
      // ★★★ TB-2761 (RUN 81 D-5): `round` and `updatedRound` are different NAMES for different facts; this sentence is the
      // reading rule so a receipt can never show two numbers with no explanation. `updatedRound` is advanced with every write
      // (a part, a review, a round-advancing advance) in this build, so a lagging value on an OLD state is history, not a clock.
      updatedRoundMeans: '`round` is the cross-review round in progress; `updatedRound` is the round in which this paper was last STORED (a part/review write, or a round-advancing advance). In this build every write moves both, so a state where they differ is an OLDER snapshot: `round` is authoritative for the gate; `updatedRound` only says when the bytes last changed',
    }
    ensureTrack()
    const put = writeState(state)
    // the first write minted the id; fold it in so every later write updates the same record
    writeState(state)
    // ★★ RUN 156 (run-5 finding 6): the receipt named the target but never the paper ID, so a caller could not address the
    // paper by the id every later receipt prints; and the folder is announced HERE because a title-derived id used to
    // reach compile as a directory name with spaces (fatal for xelatex `putenv`).
    return { ok: true, target: state.target, title: state.target, paperTitle: state.title || state.target, id: state.id, folder: folderOf(state.id),
      titleMeans: "`title` on this receipt is the paper address (what every action takes as `target`) — the human name given at start is `paperTitle` (either spelling addresses the paper, and receipts answer with the address)",
      asciiSafe, idMinted: asciiSafe === false,
      idMeans: asciiSafe
        ? 'the id is paper-<target> and the folder is its slug (both portable)'
        : 'the title is not a portable file name, so the plate id and the folder were minted in ASCII (paper-pN): address the paper by this id OR by its title — both resolve — and the compiler never sees the Chinese title as a directory',
      // ★★ ROUND 159 (FEEDBACK6 item 1): `asciiSafe:false` used to be readable two ways ("the title is not ASCII"
      // vs "the directory is unsafe"). It says the first thing, and the second fact is its own sentence.
      asciiSafeMeans: asciiSafe
        ? 'the target itself is a portable ASCII name, so the plate id is derived from it and the directory is that name'
        : 'THE TITLE is not a portable ASCII file name (that is what this flag reports). The DIRECTORY and the plate id are ASCII anyway (see `id`/`folder`): the flag is not a warning that the compile path is unsafe',
      status: state.status, round: state.round,
      // ★★ RUN 174 (run 19 FEEDBACK19 F5): a ONE-participant paper could be started and written, and only `advance`
      // refused it ("一位参与者的论文无法通过互审") — after the work. The impossibility is knowable at `start`, so the
      // start receipt says it now: a paper needs two writing participants because cross-review needs a member who is not
      // the author. Not a refusal here (a paper can be started before the second member is named), but never a surprise later.
      // ★★ RUN 175 (run 20 FEEDBACK20 ⑦): which finaliser this paper got, and why — never left to a later `status`.
      editor: {
        value: state.editor,
        source: editorGiven ? (String(editor).trim() === state.editor ? 'argument' : 'argument-normalised') : 'default',
        means: editorGiven
          ? (String(editor).trim() === state.editor
            ? 'the paper finalises through the word you passed'
            : 'the word you passed names a member seated in the chair slot, so it was normalized to the academician ROLE (the same finaliser, addressed the way this flow addresses it)')
          : 'no `editor` was passed, so the paper finalises through the declared default (' + String(editorDefault) + '); pass editor:"office" to have the office finalise instead',
      },
      crossReviewPossible: participants.length >= 2,
      crossReviewMeans: participants.length >= 2
        ? 'cross-review is possible: ' + participants.join(', ') + ' can review each other\'s parts'
        : 'NO member can cross-review this paper: it has ONE writing participant (' + participants.join(', ') + '), and a review must name a member who is not the author. Add a second writing participant (`participants:["' + participants.join('","') + '","<another member>"]`) before `advance`, or `advance` will refuse with this same reason',
      stateRecord: state.stateRecordId || (put && put.id), fingerprint: put && put.fingerprint }
  }

  /** ② a part: written by a PARTICIPANT, in the WRITING stage; it is archived as its own record and its kernel-computed
   *  fingerprint is remembered in the state (that is what rule ① compares against later). */
  function recordPart({ target, member, title = '', solution = '', methods = '', rules = '', limits = '', evidence = [] } = {}) {
    const { state } = requireState(target)
    // ★★ RUN 152: the hint used to say "advance it back to writing", which is a call the flow cannot make (advance
    // only moves writing→reviewing→awaiting-editor and returns moved:false at awaiting-editor). The reachable repair is
    // the editor sending the paper back with decision:"revise", which is what the hint now names.
    if (state.status !== 'writing') throw refuse(CODES.STATE, 'the paper is not in its writing stage (now: ' + state.status + ')', state.status === 'awaiting-editor'
      // At awaiting-editor the editor really can send it back with final{revise}; at REVIEWING that same call is refused by
      // this flow, and the door back to writing is `advance` (a reviewer who said not-deliverable sends it back).
      ? 'the reachable repair is the editor sending it back: vibe_v5_paper { action: "final", target: "' + state.target + '", member: "<the member in the chair seat>", decision: "revise", note: "<what to fix>" } turns it back to writing; after that the part can be recorded again'
      // ★★ RUN 193 (run 36 / FEEDBACK35 1.1, MEASURED): this hint told the caller to use final{revise} while the paper sat
      // in `reviewing`, where the SAME flow refuses it — and the status face said so (`reachableMoves` listed review/advance
      // only). Two receipts contradicting each other sent that run through the refused call first. The hint is now the move
      // that state accepts: `advance` closes the round, and a reviewer who did not say deliverable sends the paper back to
      // writing (the run measured exactly that: advance ⇒ from:"reviewing" to:"writing", refusers:["r-1"]).
      : state.status === 'finalized'
      // ★★ RUN 197 (run 38 / FEEDBACK37 1.6, MEASURED): a FINALIZED paper answered "the paper is in REVIEW … advance",
      // and advance on a finalized paper only returns moved:false — advice with no reachable move. Nothing writes a new part
      // into a delivered paper; say that, and name the only doors.
        ? 'the paper is FINALIZED: no part can be written into it any more — this is the delivered version and `advance` only answers moved:false on it. If this work must change, start a NEW paper with vibe_v5_paper { action: "start", target: "<new name>", participants: [...] }; the finalized record stays exactly as it is'
      : 'the paper is in REVIEW: the move this state accepts is vibe_v5_paper { action: "advance", target: "' + state.target + '" } — it closes the round, and a reviewer who did NOT answer deliverable sends the paper back to writing; only at awaiting-editor is the editor door (final { decision: "revise" }) accepted')
    if (!state.participants.includes(str(member))) throw refuse('VMU_NO_SUCH_OBJECT', str(member) + ' is not a writing participant of this paper', 'participants: ' + state.participants.join(', '))
    const part = {
      target: str(state.target), member: str(member), round: state.round, title: str(title).slice(0, 300),
      solution: str(solution).slice(0, 20000), methods: str(methods).slice(0, 20000),
      rules: str(rules).slice(0, 12000), limits: str(limits).slice(0, 12000),
      evidence: Array.isArray(evidence) ? evidence.map(String).slice(0, 50) : [],
    }
    if (!part.title && !part.solution && !part.methods && !part.rules && !part.limits) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the part carries no content', 'give at least a title and one contribution field (solution/methods/rules/limits)')
    }
    const put = records.put({ track: TRACK, kind: 'paper-part', title: recordName(state.target, 'part|' + part.member), body: JSON.stringify(part), by: author })
    const previous = state.parts[part.member] || null
    // ★★ RUN 174 (run 19 FEEDBACK19 F4): the slot said `at: <round number>` — a field named like a timestamp carrying a
    // round. Run 19 read `{"round":1,"at":1}` and a reviewer counted "at 1" as an epoch. The round IS the time this
    // subsystem keeps; name it once. `at` stays for old readers but is now the same number, and every NEW row carries
    // `round` (the slot already had it — this literal existed only to be misread).
    state.parts[part.member] = { recordId: put && put.id, fingerprint: put && put.fingerprint, round: part.round, at: state.round, title: part.title }
    state.updatedRound = state.round
    writeState(state)
    return { ok: true, recorded: part.member, round: state.round, recordId: put && put.id, fingerprint: put && put.fingerprint,
      // ★ G7 finding: the old state kept ONE part per member, so a second `part` silently replaced the first. This
      // minimal fix does not claim a multi-slot model; it NAMES what was replaced so the caller can re-record it.
      // ★★ RUN 164 (FEEDBACK12 item 5): "replaced" named WHICH record went away but not how much text it carried, so a
      // second `part` from the same member read like an append to anyone who did not compare titles. The receipt now
      // carries both sizes and the fact that this is a WHOLE-SECTION REPLACEMENT, not an addition.
      replaced: previous && previous.recordId !== (put && put.id)
        ? (function () {
          let oldBytes = null
          try { const prevRow = records.get({ id: previous.recordId }); oldBytes = prevRow && prevRow.body !== undefined ? String(prevRow.body).length : null } catch { oldBytes = null }
          return { recordId: previous.recordId, round: previous.round, title: previous.title || null,
            oldBytes, newBytes: String(JSON.stringify(part)).length,
            means: 'a member holds ONE part slot: this call replaced the section recorded earlier (oldBytes → newBytes), it did not add a second section — read action:"status" to confirm what the body now holds' }
        })()
        : null }
  }

  /**
   * ★ F3a — who reviewed SOMEBODY ELSE'S part? A review whose subject is the reviewer themself (or a review with no
   * subject at all) is not a cross-review, no matter which way it votes: the point of 互审 is a second pair of eyes.
   * Distinct reviewers, in the order the reviews were recorded.
   */
  /** The durable review row for one member in THIS round, or null (the same row `advance` reads: `paper-review`
   *  titled `v5r-paper|<target>|review|<member>`, newest first). Used when the state's `reviews` CACHE is missing
   *  what the record already holds — the two faces must not disagree about whether a review happened. */
  function reviewRowOf(state, member) {
    const want = recordName(state.target, 'review|' + member)
    let rows = []
    try { const got = records.list({ track: TRACK, limit: 2000 }); rows = Array.isArray(got.items) ? got.items : [] } catch { return null }
    // ★★ RUN 167: every round writes a row with the SAME title (target + 'review|<member>'), so "newest" cannot be
    // decided by updatedAt alone — a fixed clock (test fixtures) or a fast turn stamps several rows with one millisecond,
    // the tie fell to ARRAY ORDER (oldest round first) and the cross-review gate read round 1's verdict while the paper
    // stood in round 3, counting zero crossers. Tie-break on the id number: ids are minted strictly increasing.
    const idNum = (v) => Number((String(v || '').match(/(\d+)$/) || [])[1] || 0)
    const row = rows.filter((r) => String(r.title) === want)
      .sort((a, b) => (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)) || (idNum(b.id) - idNum(a.id)))[0] || null
    if (!row) return null
    let body = null
    try { const g = records.get({ id: row.id }); const full = g && g.record ? g.record : g; body = JSON.parse(String((full && full.body) || '{}')) } catch { return null }
    if (!body || String(body.member) !== String(member)) return null
    return { recordId: row.id, body }
  }
  /** ★★ RUN 167 (real machine, run 14 / FEEDBACK14 F6): WHO a member may review is a FACT about the parts, not a
   *  rotation over the participant list. Measured: `advance` assigned `reviewOf` by rotating the PARTICIPANT list, so a
   *  member who had written no part was named as somebody's review target (the reviewer had nothing to read), and a
   *  member whose target had no part was counted as a REFUSER — which sent the paper back to writing, bumped the round
   *  and invalidated the review that HAD been filed. The paper needed three rounds to reach awaiting-editor for a reason
   *  that was never about the mathematics. The assignment below only names a member who actually authored a part this
   *  round, and a member with no such author to review is EXEMPT (reported, never silently counted as a refusal). */
  function reviewTargetFor(state, member) {
    const me = str(member)
    const participants = Array.isArray(state && state.participants) ? state.participants.map(String) : []
    const parts = (state && state.parts) || {}
    const authors = participants.filter((id) => !!parts[id])
    const others = authors.filter((id) => id !== me)
    if (others.length === 0) return null
    const idx = Math.max(0, participants.indexOf(me))
    return others[idx % others.length]
  }
  function crossReviewers(state, { deliverableOnly = false } = {}) {
    const out = []
    const reviews = (state && state.reviews) || {}
    // ★★ RUN 162 (real machine, run 10 / FEEDBACK9 item 8): the cache is a CACHE. In the SAME round where `advance`
    // returned `unanimous:true` + two `reviewsRead`, `final` refused with `crossReviewers: []` because only the cache
    // was read. The durable `paper-review` row for THIS round is the truth, so it is consulted here and the cache is
    // healed — the discipline `advance` already follows, applied to the second door that makes the same claim.
    if (deliverableOnly) {
      const participants = Array.isArray(state && state.participants) ? state.participants : []
      for (const id of participants) {
        const snap = reviews[id]
        // ★★★ TB-2743: an appended cross-reviewer must hold a vote on the CURRENT text, not on a replaced part.
        if (snap && snap.deliverable === true && str(snap.of) && str(snap.of) !== str(id) && judgedPartReading(state, snap).fresh) continue
        const found = reviewRowOf(state, id)
        if (!found) continue
        const b = found.body || {}
        if (Number(b.round) !== Number(state.round)) continue
        if (b.deliverable !== true || String(b.of || '') === String(id)) continue
        // ★★★ TB-2743: the durable row heals the cache ONLY while it is bound to the text the part carries now; a stale
        // round-N row that judged round-(N-1) prose stays out of the crossers list (and is named by the gate refusal).
        const judged = judgedPartReading(state, b)
        if (!judged.fresh) continue
        reviews[id] = { recordId: found.recordId, fingerprint: null, deliverable: true, of: b.of, round: b.round, comments: str(b.comments),
          judgedPartFingerprint: judged.boundFingerprint, judgedPartRound: judged.boundRound, stalePart: false }
      }
    }
    const ids = Object.keys(reviews)
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i]
      const reviewed = reviews[id]
      if (!reviewed) continue
      const of = str(reviewed.of)
      if (!of || of === str(id)) continue
      if (deliverableOnly && reviewed.deliverable !== true) continue
      // ★★★ TB-2743: `deliverable` is not enough — the vote must be bound to the text the part carries now.
      if (deliverableOnly && !judgedPartReading(state, reviewed).fresh) continue
      if (!out.includes(str(id))) out.push(str(id))
    }
    return out
  }

  /**
   * ★ F3a — the ONE rule both the reviewing→awaiting-editor step and the finalisation step apply: a paper may only be
   * called unanimously reviewed when at least TWO DISTINCT members reviewed somebody else's part and voted deliverable.
   * With a single participant the rotation points at the participant themself, so the old check was vacuously
   * unanimous — that is the defect this refuses. The refusal names the missing half and the exact repair.
   */
  /** ★★ RUN 203 (run 41 / FEEDBACK40 1.5, MEASURED): run 41 assigned the rotation {r-acad:r-1, r-1:r-2, r-2:r-acad}, the
   *  members reviewed OTHER parts than the ones they were assigned (r-1 → of r-acad, r-2 → of r-1, r-acad → of r-1), one
   *  section was never read by anyone, another was read twice, and the paper still advanced as `unanimous` and produced a
   *  PDF. The assignment is the paper's own rotation, so the receipt of a closed round now carries the COVERAGE — which
   *  author's part each reviewer read, and which parts nobody read — instead of a single boolean a reader cannot audit. */
  function crossReviewCoverage(state) {
    const participants = state.participants.slice().map(String)
    const reviewOf = state.reviewOf || {}
    const parts = participants.map((author) => {
      const reviewer = participants.filter((id) => String(reviewOf[String(id)] === undefined ? '' : reviewOf[String(id)]) === author && id !== author)[0] || null
      return { author, reviewer, wrotePart: !!(state.parts && state.parts[author]) }
    })
    const uncovered = parts.filter((p) => p.wrotePart && p.reviewer === null).map((p) => p.author)
    return { parts, uncovered,
      uncoveredMeans: uncovered.length === 0
        ? 'empty ON PURPOSE: every part on this paper is assigned to a reviewer who is NOT its author, so no section is unread'
        : 'NOT empty: these authors wrote a part that NO assigned reviewer will read this round (' + uncovered.join(', ') + ') — their section was not cross-read, and no verdict about it was owed' }
  }

  function partSlotOf(state, member) {
    const slots = state && state.parts && typeof state.parts === 'object' ? state.parts : null
    if (!slots) return null
    const slot = slots[str(member)]
    return slot && typeof slot === 'object' ? slot : null
  }

  /** the EXISTING part fingerprint (the record fingerprint `recordPart` stored in the slot), never a new hash. */
  function partFingerprintOf(state, member) {
    const slot = partSlotOf(state, member)
    if (!slot) return null
    const fp = slot.fingerprint
    return fp === undefined || fp === null || fp === '' ? null : String(fp)
  }

  /** the round whose TEXT the slot holds (`recordPart` stamps both `round` and `at` with `state.round`). */
  function partRoundOf(state, member) {
    const slot = partSlotOf(state, member)
    if (!slot) return null
    const r = slot.round === undefined || slot.round === null ? slot.at : slot.round
    return r === undefined || r === null || !Number.isFinite(Number(r)) ? null : Number(r)
  }

  /**
   * ★★★ TB-2743 (RUN 79 / B5 REVIEW ROUND 2, MEASURED): A VOTE MUST BIND THE TEXT IT JUDGED, NOT ONLY THE AUTHOR.
   * Run 79, round 2: r-1 filed `deliverable:true` with `of:"r-2"` (`rec-34`), `advance` counted it as a cross-review,
   * and the part it claimed to have judged was STILL the round-1 text (`rec-20`, fingerprint 65cccd… unchanged). Nothing
   * in the row said which text was read, so the gate counted a verdict about prose nobody had put in front of it. The
   * reading below binds a review row to the part SLOT it judged (the existing record fingerprint + the round that text
   * was recorded in); a row is FRESH only when both still match the slot on file. Two absences are the SAME fact — a
   * paper with no part text under `of` has no fingerprint to change, so a legacy row is fresh there.
   */
  function judgedPartReading(state, rowBody) {
    const body = rowBody && typeof rowBody === 'object' ? rowBody : {}
    const of = body.of === undefined || body.of === null ? '' : str(body.of)
    const currentFingerprint = of === '' ? null : partFingerprintOf(state, of)
    const boundFingerprint = body.judgedPartFingerprint === undefined || body.judgedPartFingerprint === null ? null : String(body.judgedPartFingerprint)
    const boundRound = body.judgedPartRound === undefined || body.judgedPartRound === null ? null : Number(body.judgedPartRound)
    const currentRound = Number(state.round)
    const partChanged = boundFingerprint !== currentFingerprint
    const roundChanged = !(boundRound === null || (Number.isFinite(boundRound) && boundRound === currentRound))
    const bound = body.judgedPartFingerprint !== undefined
    // ★★★ TB-2774 (RUN 82): ONE predicate. The FINGERPRINT is the only evidence that the judged TEXT changed; the round
    // is narrative. A fingerprint-bound vote stays FRESH while the text on file is the text it judged, even when the
    // paper's round moved (a revise round does not rewrite every part). A legacy row with no binding keeps the old round
    // rule — and says so (`freshnessRule:'legacy-round'`) instead of borrowing the text wording.
    const fresh = bound ? !partChanged : !roundChanged
    return { of, bound,
      boundFingerprint, currentFingerprint, boundRound, currentRound,
      partChanged, roundChanged, freshnessRule: bound ? 'fingerprint' : 'legacy-round', fresh }
  }

  /** the ONE shape both doors print for a vote that judged text the part no longer carries (null when the vote is fresh). */
  function staleReviewReading(state, member, row) {
    const found = row === undefined ? reviewRowOf(state, member) : row
    const body = (found && found.body) || null
    if (!body) return null
    const judged = judgedPartReading(state, body)
    if (judged.fresh) return null
    return { by: str(member), of: judged.of === '' ? null : judged.of,
      judgedPartFingerprint: judged.boundFingerprint, currentFingerprint: judged.currentFingerprint,
      judgedPartRound: judged.boundRound, currentRound: judged.currentRound,
      recordId: (found && found.recordId) || null,
      why: judged.bound ? 'part-text-changed' : 'round-changed',
      whyMeans: judged.bound
        ? 'the text of the judged part changed after this vote was cast: the vote is bound to fingerprint ' + String(judged.boundFingerprint) + ', and the part on file now carries ' + String(judged.currentFingerprint) + ' — this is a DIFFERENT text, so the vote is not counted (a round change alone never prints this: the fingerprints decide)'
        : 'LEGACY row (no judgedPartFingerprint binding): the vote was cast in round ' + String(judged.boundRound) + ' while the paper is in round ' + String(judged.currentRound) + ' — the old round rule is the only available reading here, and it is NOT a text-replacement verdict' }
  }

  /**
   * ★★★ TB-2761 (RUN 81 D-1/D-2): THE COVERAGE GATE BINDS **THE TEXT**, NOT THE ROUND.
   * Run 81 measured: a part was replaced, `advance` bumped the paper round 1 → 2, and the TWO authors whose sections were
   * NOT touched were counted as coverage gaps (`missing:["r-2","r-3"]`) although their reviews still judged the text on
   * file. The rule's own sentence is "a review judges the prose of its round"; the ROUND was only ever the proxy for
   * "has this text changed since the vote". `judgedPartFingerprint` IS that fact, so the gate reads it now:
   *   · deliverable:true + `of` another member + the judged part's fingerprint UNCHANGED ⇒ COUNTED, even when the row was
   *     written in an earlier round (an untouched section is not a coverage gap because the paper moved);
   *   · the judged part's fingerprint CHANGED ⇒ NOT counted, named `part-text-changed` (the reviewer must read the new text);
   *   · a legacy row that never bound a fingerprint ⇒ the old round rule, named `previous-round` when it fails.
   * An unstated / `deliverable:false` verdict is a REFUSAL or SILENCE, never a void — it stays in `missing` (and in the
   * advance receipt's `refusers`), exactly as before.
   */
  const coverageVerdictOf = (state, body) => {
    const round = Number(state.round)
    const rowRound = body && body.round !== undefined && body.round !== null && Number.isFinite(Number(body.round)) ? Number(body.round) : null
    const judged = body ? judgedPartReading(state, body) : null
    const of = body && body.of !== undefined && body.of !== null ? str(body.of) : ''
    const member = body && body.member !== undefined && body.member !== null ? str(body.member) : ''
    const out = (counts, voidWhy) => ({ counts, voidWhy, judged, rowRound })
    if (!body) return out(false, null)
    if (body.deliverable !== true) return out(false, null) // a refusal / silence is not a void
    if (of === '' || (member !== '' && of === member)) return out(false, null) // self-review is never coverage
    if (!judged || judged.bound !== true) {
      // legacy row: no fingerprint binding on file — the old round rule is the only available reading, and it SAYS so.
      return out(rowRound === round, rowRound === round ? null : 'previous-round')
    }
    if (judged.partChanged) return out(false, 'part-text-changed')
    return out(true, null)
  }
  function perRoundReviewCoverageOfState(state) {
    const round = Number(state.round)
    const participants = (Array.isArray(state.participants) ? state.participants : []).map(String)
    const reviewOf = state.reviewOf || {}
    const assignedOther = participants.filter((id) => {
      const a = reviewOf[id]
      return a !== undefined && a !== null && str(a) !== '' && str(a) !== id
    })
    const authored = participants.filter((id) => !!(state.parts && state.parts[id]))
    // THE SAME TIER RULE `requireCrossReview` applies, not a second opinion: an assignment on the record decides who
    // owes a verdict; without one (scripted suites, a paper still in writing) the members who wrote a part owe it; with
    // no parts at all every participant does. The last two tiers are stated on the receipt so a reader knows which rule
    // produced `expected`.
    const expected = assignedOther.length > 0 ? assignedOther : (authored.length > 0 ? authored : participants)
    const rule = assignedOther.length > 0 ? 'assignment' : (authored.length > 0 ? 'authored-parts' : 'all-participants')
    const exempt = participants.filter((id) => !expected.includes(id))
    const covered = []
    const missing = []
    const voidEntries = []
    for (const member of expected) {
      let found = null
      try { found = reviewRowOf(state, member) } catch (e) { found = null }
      const body = found && found.body ? found.body : null
      const verdict = coverageVerdictOf(state, body)
      if (verdict.counts) {
        covered.push({ member, recordId: found.recordId || null, round })
        continue
      }
      missing.push(member)
      if (verdict.voidWhy === null) continue
      const judged = verdict.judged || {}
      const whyMeans = verdict.voidWhy === 'part-text-changed'
        ? 'the text of the judged part changed after this vote was cast: the vote is bound to fingerprint ' + String(judged.boundFingerprint) + ', and the part on file now carries ' + String(judged.currentFingerprint) + ' — this is a DIFFERENT text, so the vote is not counted'
        : verdict.voidWhy === 'previous-round'
          ? 'the newest durable review row for this member belongs to round ' + String(verdict.rowRound) + ', not the paper\'s current round (' + String(round) + '), and the row carries NO part fingerprint to prove the text is unchanged: it is not counted for round ' + String(round) + ' (re-file a verdict after reading the current part)'
          : 'the vote was cast in round ' + String(judged.boundRound) + ' while the paper is in round ' + String(judged.currentRound) + ' and its text could not be proven unchanged'
      voidEntries.push({ member, recordId: found.recordId || null, why: verdict.voidWhy,
        rowRound: verdict.rowRound, judgedPartRound: judged.boundRound === undefined ? null : judged.boundRound, currentRound: round,
        judgedPartFingerprint: judged.boundFingerprint === undefined ? null : judged.boundFingerprint,
        currentFingerprint: judged.currentFingerprint === undefined ? null : judged.currentFingerprint,
        whyMeans })
    }
    // ★★★ TB-2761 D-2: ONE VOID LIST, GROUPED BY WHY, WITH COUNTS. The old pair (`invalidatedByRound` + `staleReviews`)
    // described the same fact under two names with different rules and neither carried a count, so "no vote was voided"
    // and "two votes were voided" read alike when one column was empty. `voidReviews` is the reading; the old two names
    // stay as FILTERED VIEWS of it (no second arithmetic) so existing readers keep working.
    const byWhy = new Map()
    for (const entry of voidEntries) {
      if (!byWhy.has(entry.why)) byWhy.set(entry.why, [])
      byWhy.get(entry.why).push(entry)
    }
    const voidReviews = [...byWhy.keys()].sort().map((why) => ({
      why, count: byWhy.get(why).length, members: byWhy.get(why).map((e) => e.member),
      entries: byWhy.get(why).slice(),
      whyMeans: byWhy.get(why)[0].whyMeans,
    }))
    const invalidatedByRound = voidReviews.filter((g) => g.why === 'previous-round').flatMap((g) => g.entries.map((e) => ({ member: e.member, recordId: e.recordId, round: e.rowRound, why: 'previous-round', whyMeans: e.whyMeans })))
    const staleReviews = voidReviews.filter((g) => g.why === 'part-text-changed' || g.why === 'round-changed').flatMap((g) => g.entries.map((e) => ({ by: e.member, of: null, judgedPartFingerprint: e.judgedPartFingerprint, currentFingerprint: e.currentFingerprint, judgedPartRound: e.judgedPartRound, currentRound: e.currentRound, recordId: e.recordId, why: e.why, whyMeans: e.whyMeans })))
    return { round, expected, covered, missing, invalidatedByRound, staleReviews,
      // ★★★ TB-2761 D-2: the merged, counted reading (the two names above are its filtered views).
      voidReviews,
      voidReviewsMeans: voidReviews.length === 0
        ? 'empty ON PURPOSE: no expected member holds a vote that was voided — every count-relevant row either counts for this round or is simply not filed/not deliverable (see `missing`)'
        : 'grouped by `why` with a COUNT per group: `part-text-changed` = the vote judged an earlier TEXT of that part (its fingerprint differs from the part on file now); `previous-round` = a legacy row from an earlier round with no fingerprint binding to prove the text unchanged. A voided vote is NOT a refusal and NOT coverage: the member re-files after reading the current part',
      staleReviewsMeans: staleReviews.length === 0
        ? 'empty ON PURPOSE: every counted vote for this round judged the TEXT the part carries now (its fingerprint still matches the part slot), so no verdict is bound to prose that was replaced'
        : 'NOT empty: these votes said deliverable but judged an EARLIER TEXT of the part — each entry names the member (by), the fingerprint the vote is bound to, the fingerprint the part carries NOW, and both rounds. They are NOT counted as coverage and are NOT refusals: re-file a verdict after reading the current part (vibe_v5_paper { action: "review", target: "<paper>", member: "<by>", of: "<of>", deliverable: true })',
      expectedMeans: 'the members who OWE a counted cross-review verdict for round ' + String(round) + ' (rule: ' + rule + ' — '
        + (rule === 'assignment' ? 'the paper\'s own `reviewOf` rotation assigns each of them another member\'s part'
          : rule === 'authored-parts' ? 'no `reviewOf` assignment is on the record, so the members who wrote a part owe the review of each other\'s prose'
            : 'this paper has no parts and no assignment yet, so every participant owes one')
        + (exempt.length > 0 ? '); EXEMPT this round (' + exempt.join(', ') + '): no other member\'s part exists for them to review. A member is never expected to review their own part' : ')'),
      coveredMeans: 'these members hold a COUNTED deliverable cross-review verdict: each entry names the member, the durable review recordId whose body carries the verdict, and the TEXT it is bound to (`judgedPartFingerprint`, plus `rowRound`/`judgedPartRound` as history). The binding is the FINGERPRINT of the judged part NOW: a vote from an earlier round still counts while the part text it judged is unchanged (the round moved, the prose did not), and a vote whose part was RECOMPOSED does not count (it appears in `voidReviews` with why `part-text-changed`)',
      missingMeans: 'these EXPECTED members hold NO counted deliverable verdict: the row may not exist yet, may vote deliverable:false, or may be VOID (its judged text was replaced, or it is a legacy row from another round) — that last case is enumerated line by line in `voidReviews`. While this list is non-empty the paper cannot reach unanimity — `advance` will keep it in reviewing or send it back to writing, and this reading says who it is waiting for',
      invalidatedByRoundMeans: invalidatedByRound.length === 0
        ? 'empty ON PURPOSE: no expected member holds a legacy earlier-round row that fails the text test (round-old votes on UNCHANGED text now COUNT — see `covered`)'
        : 'NOT empty (a FILTERED view of `voidReviews` where why=="previous-round"): these members filed a review on an EARLIER round and the row carries no part fingerprint to prove its text unchanged; re-file a verdict for the current part to cover them',
      means: 'perRoundReviewCoverage answers ONE question — which expected member holds a COUNTED deliverable cross-review verdict whose judged TEXT is still the text on file — and it is computed by ONE function (`perRoundReviewCoverageOfState`) that both the advance and status doors print, so the two receipts cannot disagree about the covered set. Since RUN 81 the gate binds the part FINGERPRINT, not the round number: a round bump alone does not invalidate a verdict on an untouched section. `voidReviews` carries the counted, grouped reading of every vote that does not count' }
  }

  function requireCrossReview(state, where) {
    const participants = state.participants.slice()
    // ★★ RUN 167 (FEEDBACK14 F6): THE COUNT WAS THE WRONG QUESTION. This gate used to require TWO cross reviewers; with
    // F6's assignment only the members who were given ANOTHER member's part owe a verdict, so a two-member paper in which
    // ONE member wrote the only part can never produce two crossers: its one required reviewer files a deliverable
    // review, the author is exempt, and `advance` still refused — the paper then burned rounds on a check it could not
    // satisfy. The question is not "how many crossers" but "did everyone who was asked to review do it", plus the F3a
    // floor (a paper nobody cross-reviewed never advances — one participant stays impossible by construction).
    const assignedOther = (id) => { const a = state.reviewOf ? state.reviewOf[String(id)] : null; return !!a && str(a) !== str(id) }
    const assigned = participants.filter((id) => assignedOther(id))
    // ★★ RUN 167 F6 follow-up: a caller that scripts its reviews by hand (many of the older suites do) never goes through
    // the writing→reviewing assignment, so `reviewOf` is empty and "required" would be empty too — that would let ANY
    // scripted paper through. When there is no assignment on the record, the owed set is the participants who actually
    // WROTE a part (their sections are what the cross review is for); with no parts at all the old floor stands.
    const authored = participants.filter((id) => !!(state.parts && state.parts[String(id)]))
    // Tier 3: a paper that carries no parts at all (the older suites drive `recordReview` straight after `start`) keeps
    // the pre-F6 reading — every participant owes a cross review — because there is nothing to assign and no section to
    // point `of` at. The single-participant floor is untouched: one participant can never produce a cross review.
    const required = assigned.length > 0 ? assigned : (authored.length > 0 ? authored : participants)
    const rowOf = (id) => { const found = reviewRowOf(state, id); return (found && found.body) || null }
    const votedThisRound = (b, id) => !!(b && Number(b.round) === Number(state.round) && b.deliverable === true && String(b.of || '') !== String(id))
    // ★★★ TB-2743: THE COUNT NOW BINDS THE TEXT. A row that says deliverable THIS round but judged an EARLIER TEXT of
    // the part is not a crosser: the gate must wait for a vote on the current prose, and the refusal must NAME it (both
    // fingerprints) instead of reporting "these members never reviewed" — the row exists and looks right, which is
    // exactly the shape run 79 filed while the part still carried the round-1 text.
    // ★★★ TB-2761 (RUN 81 D-1): the SAME predicate the coverage reading prints — the binding is the judged part's
    // FINGERPRINT, so a round bump alone does not invalidate a verdict on an untouched section.
    const crossers = required.filter((id) => coverageVerdictOf(state, rowOf(id)).counts)
    const stalePartIds = required.filter((id) => { const b = rowOf(id); const v = coverageVerdictOf(state, b); return v.voidWhy === 'part-text-changed' })
    if (required.length > 0 && crossers.length === required.length) return crossers
    // ★★ RUN 162: state BOTH readings, so a mismatch between the cache and the record is visible in the refusal
    // instead of presenting itself as "the members never reviewed" (run 10 lost an hour to exactly that).
    const onDisk = participants.filter((id) => votedThisRound(rowOf(id), id))
    const staleReviews = stalePartIds.map((id) => staleReviewReading(state, id)).filter((r) => r !== null)
    const unexplained = required.filter((id) => !crossers.includes(id) && !stalePartIds.includes(id))
    // ★★★ TB-2743: THE HINT HAS TO BE WALKABLE, and the two stale shapes need DIFFERENT repairs. When a part was
    // REPLACED inside the same round, re-filing the vote on the current text is enough. When the part itself is from an
    // EARLIER round (run 79: a round-2 vote on round-1 text, fingerprint unchanged), re-filing the same vote would be
    // refused again: this round has to produce its own text first. The repair below names every step, and each step is a
    // move the CURRENT stage accepts (review:false in reviewing; advance bounces to writing; part in writing; advance
    // returns to reviewing; then the fresh vote).
    const staleReviewHint = (() => {
      if (staleReviews.length === 0) return null
      const first = staleReviews[0]
      const reviewCall = (by, of, deliverable) => 'vibe_v5_paper { action: "review", target: "' + str(state.target) + '", member: "' + String(by) + '", of: "' + String(of || '') + '", deliverable: ' + (deliverable ? 'true' : 'false') + ' }'
      if (first.why === 'round-changed') {
        return 'REACHABLE INSTEAD（五步，每步都是当前阶段接受的调用；跳过任何一步会再次得到本拒绝）: ① 让该评审先把这一轮判回写作：' + reviewCall(first.by, first.of, false)
          + ' ② 关闭本轮、回到写作：vibe_v5_paper { action: "advance", target: "' + str(state.target) + '" }'
          + ' ③ 每一位作者都按当前轮重写自己的部分（一位作者的调用如下，另一位同理）：vibe_v5_paper { action: "part", target: "' + str(state.target) + '", member: "' + String(first.of || '') + '", title: "…", solution: "…" }'
          + ' ④ 重新进入互审：vibe_v5_paper { action: "advance", target: "' + str(state.target) + '" }'
          + ' ⑤ 对新正文投这一票：' + reviewCall(first.by, first.of, true)
      }
      return 'REACHABLE INSTEAD: 让对应席位对新正文再投一次（' + reviewCall(first.by, first.of, true) + '）— the old vote is not lost and not counted: it is bound to the OLD text, so the same member re-files after reading the current part'
    })()
    // ★★ RUN 167 F6: ONE participant is not a count problem, it is a shape problem — no assignment, and an `of`-less
    // review cannot turn a paper reviewed by its only author into a cross-reviewed one. Refuse by name (with the facts a
    // caller can act on) instead of letting it reach the editor through the round cap.
    if (participants.length < 2) {
      throw refuse('VMU_INVALID_ARGUMENT',
        '一位参与者的论文无法通过互审：只有 ' + participants.length + ' 位参与者（' + (participants.join('、') || '无') + '），他只能审自己的部分，互审因此是自审（a paper with one participant cannot pass 互审）',
        '再邀请一位成员参与（start 的 participants 至少两位），并让另一位成员评审这个部分（review 的 of 指向别人的 part）；自审不算互审',
        { where, participants, crossReviewers: crossers, reviewsOnDisk: onDisk, required: 2, staleReviews })
    }
    // all missing votes are STALE-PART votes and nothing else is pending ⇒ refuse BY NAME, do not burn a round.
    if (staleReviews.length > 0 && unexplained.length === 0) {
      const describeStale = (r) => {
        if (r.why === 'round-changed') {
          return String(r.by) + ' 的票投在第 ' + Number(state.round) + ' 轮，但它审的部分仍是第 ' + String(r.judgedPartRound) + ' 轮写的（指纹 ' + String(r.judgedPartFingerprint === null ? '（无）' : r.judgedPartFingerprint) + ' 未变——缺陷在轮次而不是字节：这一轮从未产出被它评审的正文）'
        }
        return String(r.by) + ' 的票绑在指纹 ' + String(r.judgedPartFingerprint === null ? '（无）' : r.judgedPartFingerprint) + ' 上，而 ' + String(r.of || '') + ' 的部分现在是指纹 ' + String(r.currentFingerprint === null ? '（无）' : r.currentFingerprint)
      }
      throw refuse('VMU_REVIEW_STALE',
        '互审票评审的不是当前正文：' + staleReviews.map(describeStale).join('；')
          + '（a review vote binds the TEXT it judged, not only the author: these votes judged an earlier version of the part and are NOT counted）',
        staleReviewHint,
        { where, staleReviews, currentRound: Number(state.round), crossReviewers: crossers, reviewsOnDisk: onDisk, required: required.length })
    }
    const message = participants.length < 2
      ? '一位参与者的论文无法通过互审：只有 ' + participants.length + ' 位参与者（' + (participants.join('、') || '无') + '），他只能审自己的部分，互审因此是自审（a paper with one participant cannot pass 互审）'
      : '互审必须由两位不同的、非该作者的成员完成：' + participants.length + ' 位参与者里只有 ' + crossers.length + ' 位审了别人的部分（' + (crossers.join('、') || '无') + '），其余选票没有评审对象，不能算全体一致'
    throw refuse('VMU_INVALID_ARGUMENT', message,
      staleReviewHint === null ? '再邀请一位成员参与（start 的 participants 至少两位），并让另一位成员评审这个部分（review 的 of 指向别人的 part）；自审不算互审' : staleReviewHint,
      { where, participants, crossReviewers: crossers, reviewsOnDisk: onDisk, required: 2, staleReviews })
  }

  /** ③ a review: deliverable must be a real boolean ("未表态不算可交付", the original's wording). */
  function recordReview({ target, member, deliverable, comments = '', of = null } = {}) {
    const { state } = requireState(target)
    if (state.status !== 'reviewing') throw refuse(CODES.STATE, 'the paper is not in its cross-review stage (now: ' + state.status + ')', '`vibe_v5_paper { action: "advance", target: "' + str(state.target) + '" }` moves writing → reviewing (a seat calls the tool, not a bare function name)')
    if (!state.participants.includes(str(member))) throw refuse('VMU_NO_SUCH_OBJECT', str(member) + ' is not a review participant of this paper', 'participants: ' + state.participants.join(', '))
    if (deliverable !== true && deliverable !== false) {
      throw refuse('VMU_INVALID_ARGUMENT', 'deliverable must be true or false (an unstated verdict is NOT deliverable)', 'pass deliverable:true/false — "未表态不算可交付"')
    }
    const assigned = state.reviewOf[String(member)] || null
    const ofId = str(of || assigned || '')
    // ★★ RUN 203 (run 41 / FEEDBACK40 1.5, MEASURED): `of` was accepted whatever it named, so a member could review a part
    // the rotation had NOT assigned to it — run 41's three reviews covered one section twice and left another unread, and
    // the gate read three deliverable verdicts as unanimity. The assignment is the paper's own `reviewOf`; a review that
    // names a different author is refused by name (nothing is written), with both names on the receipt.
    // ★ F3a: 互审 is by SOMEBODY ELSE. Refuse a review of one's own part BY NAME rather than filing it as a review —
    // with one participant the rotation had made `reviewOf[member] === member`, so this is the self-review defect.
    // ★★ RUN 204 (FULL T1): this check comes FIRST. When a member names its OWN part while the rotation assigned
    // somebody else's, the defect is still self-review, and the two pinned suites read that refusal by name — the
    // assignment mismatch is the WRONGER name for that call, so it is stated only after the self-review gate.
    if (ofId && ofId === str(member)) {
      throw refuse('VMU_INVALID_ARGUMENT',
        '互审必须由另一位成员完成：' + str(member) + ' 不能评审自己写的部分——作者就是评审人，题目、证据与推导都由同一个人看过，互审没有发生（a paper part cannot be reviewed by its author）',
        '让另一位参与者评审这一部分（review 的 of 指向别人的 part）；要过互审，start 时至少要两位参与者',
        { member: str(member), of: ofId, participants: state.participants.slice() })
    }
    if (assigned && ofId && String(ofId) !== String(assigned)) {
      throw refuse('VMU_INVALID_ARGUMENT',
        'this review names ' + ofId + ' as the author of the part it read, but the cross-review assignment for ' + str(member) + ' is ' + assigned + ' — a review of a part that was not assigned is not a review of the rotation this paper assigned',
        'pass of:"' + String(assigned) + '" (that is what this round assigned to ' + str(member) + '); the assignment is printed by the advance() that opened this round as reviewOf',
        { member: str(member), of: ofId, assigned: String(assigned), reviewOf: state.reviewOf })
    }
    // ★★ RUN 167: the review row's body must NAME ITS PAPER. The default fingerprint policy is `content-only`
    // (kind+body+tags, title excluded BY DESIGN), so two papers whose reviewers filed the same verdict on the same round
    // produced byte-identical bodies: the second paper's review was deduplicated into the first paper's row and its own
    // cross-review gate counted zero reviewers. The row's identity is the paper it reviews, so the paper id is part of
    // the content.
    // ★★★ TB-2743 (RUN 79 / B5 review round 2, MEASURED): THE VOTE BINDS THE TEXT IT JUDGED. `of` names an AUTHOR, and
    // run 79 proved that is not enough: r-1 voted deliverable on r-2 (`rec-34`) in round 2 while the part it pointed at was
    // still the round-1 text (`rec-20`) — the receipt was well-formed and the verdict was about prose nobody had read.
    // The row now records which TEXT was judged: the EXISTING record fingerprint of the part slot and the round that text
    // was recorded in. `advance`/`status` count the vote only while both still match the slot (see `judgedPartReading`).
    const judgedPartFingerprint = ofId === '' ? null : partFingerprintOf(state, ofId)
    const judgedPartRound = ofId === '' ? null : partRoundOf(state, ofId)
    // ★★★ TB-2761 (RUN 81 D-1/D-4): A ROUND MISMATCH ALONE IS NOT STALENESS. The binding that invalidates a vote is the
    // TEXT's fingerprint; at the moment it is cast the vote BINDS the current text, so stalePart is false here. The
    // reading (advance/status) later says why a vote does not count (`voidReviews[].why` = part-text-changed/previous-round),
    // and it never calls equal fingerprints "different".
    const staleAtVote = false
    const review = { target: str(state.target), member: str(member), of: ofId, round: state.round, deliverable: deliverable === true, comments: str(comments).slice(0, 8000),
      judgedPartFingerprint, judgedPartRound }
    const put = records.put({ track: TRACK, kind: 'paper-review', title: recordName(state.target, 'review|' + review.member), body: JSON.stringify(review), by: author })
    state.reviews[review.member] = { recordId: put && put.id, fingerprint: put && put.fingerprint, deliverable: review.deliverable, of: review.of, round: state.round,
      judgedPartFingerprint, judgedPartRound, stalePart: staleAtVote }
    state.updatedRound = state.round
    writeState(state)
    return { ok: true, recorded: review.member, of: review.of, deliverable: review.deliverable, round: state.round,
      judgedPartFingerprint, judgedPartRound, stalePart: staleAtVote,
      judgedPartMeans: judgedPartFingerprint === null
        ? 'this vote is bound to NO part text under `of` (that slot holds no recorded part yet), so there is no fingerprint to go stale — the reading falls back to the round rule and says so'
        : 'this vote binds the TEXT it judged: `of` names the author, `judgedPartFingerprint` is that part record fingerprint AT VOTE TIME and `judgedPartRound` the round whose text it was. If that TEXT is replaced later this vote does not count: `advance`/`status` name it in `voidReviews` (why:"part-text-changed") instead of counting it against prose it never saw. A round bump alone does NOT invalidate it — the round moved, the prose did not',
      // ★★ RUN 170 (run 16 / FEEDBACK16 F16-8): `part` answered with the row it wrote and `review` did not, so the one
      // receipt that files the gate's evidence was the only one a caller could not point at afterwards.
      recordId: put && put.id ? put.id : null, fingerprint: put && put.fingerprint ? put.fingerprint : null }
  }

  /** ④ advance: the state machine. Returns what happened, or `moved:false` with the reason (never a silent no-op). */
  function advanceMove({ target } = {}) {
    const { state } = requireState(target)
    // ★★ RUN 203 (run 41 / FEEDBACK40 1.2, MEASURED): only the disagreement branch said WHICH round moved (roundFrom /
    // roundTo / roundMeans) and the other three moving branches said nothing, so run 41's editor read a paper that had
    // just left reviewing for the editor as a round that was "still round 1" with no way to tell whether the round had
    // moved or the field had been forgotten. Every moving branch now answers both facts: the STAGE moved, and the ROUND
    // did or did not — a call that leaves the round where it was says so in words, because silence is what got misread.
    const roundReading = (roundFrom, fromStage, toStage) => {
      const roundTo = Number(state.round)
      if (roundTo !== Number(roundFrom)) {
        return { roundFrom: Number(roundFrom), roundTo, roundMoved: true,
          // ★★★ TB-2761 (RUN 81 D-5): the two round numbers on one screen must be explained and in sync; run 81 read
          // `round:3` beside `updatedRound:2` and had no rule for which one the gate uses.
          updatedRound: Number(state.updatedRound), updatedRoundSameAsRound: Number(state.updatedRound) === roundTo,
          updatedRoundMeans: state.updatedRoundMeans || (Number(state.updatedRound) === roundTo
            ? '`updatedRound` equals `round` on this receipt (every write moves both in this build)'
            : '`updatedRound` differs from `round` on this OLD state: `round` is the authoritative stage; `updatedRound` only records the last stored write — it is history, not a second stage'),
          roundMeans: 'the round ADVANCED (' + String(roundFrom) + ' → ' + String(roundTo) + ') and the paper moved ' + fromStage + ' → ' + toStage + ': this is not a retry of round ' + String(roundFrom) + ', it is the next round' }
      }
      return { roundFrom: Number(roundFrom), roundTo, roundMoved: false,
        roundMeans: 'the ROUND did not move (still ' + String(roundTo) + ') while the paper moved ' + fromStage + ' → ' + toStage
          + ': a round is ONE cycle of parts + reviews, and this call ' + (fromStage === 'writing' ? 'opened the first cycle' : 'closed a cycle without opening another')
          + ' — "the round did not move" is a READING stated on purpose, not a missing field (the stage moved, the round did not)' }
    }
    if (state.status === 'writing') {
      if (state.participants.length === 0) throw refuse(CODES.STATE, 'no participants: nothing can be cross-reviewed', 'record at least one part and have a second participant')
      const reviewOf = {}
      const notRequired = []
      for (const id of state.participants) {
        const t = reviewTargetFor(state, id)
        if (t === null) { notRequired.push(String(id)); continue }
        reviewOf[String(id)] = t
      }
      // ★★ RUN 203 (run 41 / FEEDBACK40 2.3, MEASURED): with ONE participant the paper was still moved writing → reviewing
      // and only the NEXT advance refused, so the paper sat in a stage it could never leave and the receipt that moved it
      // said nothing. The impossibility is known BEFORE the mutation: if no participant has another member's part to
      // review, the move is refused by name and the paper stays in "writing" (nothing is written by this call).
      // ★★ RUN 204 (FULL T1, self-correction of RUN 203 2.3): the refusal above was WRONG and the whole-suite run
      // proved it — three suites pin the F6 design: a one-participant paper MOVES to reviewing with the author exempt
      // (`notRequired`), the self-review is refused when it is attempted, and the paper is refused BY NAME at the
      // cross-review gate. Refusing to move made that documented path unreachable, so the move stays and the receipt
      // now states the impossibility up front instead of the caller discovering it after the move. The dead end is
      // named here — this is disclosure, not a gate.
      const crossReviewPossible = state.participants.length >= 2
      // ★★ RUN 205 (run 43 / FEEDBACK42 1.4, MEASURED): advancing to `reviewing` silently closed the writing door, so a
      // participant who had not written yet hit `VMU_PACK_V5R_CORE_PAPER_STATE` on the next `part` and had to file
      // review(false)+advance to reopen it (round 1 → 3). The lock-out is readable BEFORE the mutation, so the receipt
      // that causes it says who it locks out and which repair exists.
      const unwrittenParts = state.participants.map(String).filter((id) => !(state.parts && state.parts[String(id)]))
      const partsLockedAfterMoveMeans = unwrittenParts.length === 0
        ? 'every participant has already written a part: this move locks nobody out of writing'
        : 'these participants have NOT written a part yet (' + unwrittenParts.join(', ') + '): after this move the paper is in '
          + 'reviewing and `part` is refused by name (VMU_PACK_V5R_CORE_PAPER_STATE) — to let them write, a member files '
          + 'review({ deliverable: false }) and `advance` reopens writing, which RAISES the round counter (one round per bounce)'
      const roundFromWriting = Number(state.round)
      state.status = 'reviewing'; state.stage = 'reviewing'; state.reviewOf = reviewOf; state.reviews = {}
      writeState(state)
      return { ok: true, moved: true, stageMoved: true, from: 'writing', to: 'reviewing', round: state.round, reviewOf, notRequired,
        ...consultPrediction(state),
        ...roundReading(roundFromWriting, 'writing', 'reviewing'),
        crossReviewPossible,
        partsLockedAfterMove: unwrittenParts,
        partsLockedAfterMoveMeans,
        crossReviewMeans: crossReviewPossible
          ? 'at least two participants, so a part written by one member can be reviewed by another — 互审 is possible'
          : 'ONLY ' + String(state.participants.length) + ' participant(s): the author is EXEMPT here (notRequired), no OTHER member exists to review the part, and the paper will be refused BY NAME at the cross-review gate — the stage moved, the thing 互审 needs does not exist. Start the paper with at least two participants (vibe_v5_paper { action: "start", participants: [...] }). This is stated now so the move is not misread as progress',
        notRequiredMeans: notRequired.length === 0
          ? 'every participant has a part by another member to review'
          : 'these participants have NO other member\'s part to review this round (' + notRequired.join(', ') + '): they are EXEMPT from the unanimity check (a member cannot review a section nobody wrote) — the paper does not need their verdict to advance' }
    }
    if (state.status === 'reviewing') {
      // ★★ RUN 154 (real machine, run 4 / FEEDBACK3 H1 — the worst one): two members filed `deliverable:true`, both
      // receipts said so, both review ROWS were on disk, and `advance` still reported one of them as a refuser ("未说明")
      // and sent the paper back to writing — 3 times in a row for the same member. The state's `reviews` map is a CACHE;
      // the durable `paper-review` row for THIS round is the truth. A member whose row says deliverable is read from the
      // row (and the cache is re-healed), so a lost snapshot write can no longer invent a disagreement.
      const readReview = (member) => {
        const snap = state.reviews[member]
        // ★★★ TB-2743: the CACHE is not enough either — the part may have been replaced AFTER the cached vote, so a
        // cached deliverable row is returned only while the text it is bound to is still the text on file. Otherwise the
        // durable row is read below (which is where the stale reading and its fingerprints come from).
        if (snap && snap.deliverable === true && judgedPartReading(state, snap).fresh) return { deliverable: true, comments: str(snap.comments), source: 'state', recordId: snap.recordId || null }
        const want = recordName(state.target, 'review|' + member)
        let rows = []
        try { const got = records.list({ track: TRACK, limit: 2000 }); rows = Array.isArray(got.items) ? got.items : [] } catch { rows = [] }
        // newest first: the head projection carries `updatedAt` (not `rev`), and a corrected review is re-put
        // ★★ RUN 167: every round writes a row with the SAME title (target + 'review|<member>'), so "newest" cannot be
    // decided by updatedAt alone — a fixed clock (test fixtures) or a fast turn stamps several rows with one millisecond,
    // the tie fell to ARRAY ORDER (oldest round first) and the cross-review gate read round 1's verdict while the paper
    // stood in round 3, counting zero crossers. Tie-break on the id number: ids are minted strictly increasing.
    const idNum = (v) => Number((String(v || '').match(/(\d+)$/) || [])[1] || 0)
    const row = rows.filter((r) => String(r.title) === want)
      .sort((a, b) => (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)) || (idNum(b.id) - idNum(a.id)))[0] || null
        if (!row) return { deliverable: false, comments: snap ? str(snap.comments) : '', source: 'none', recordId: null }
        let body = null
        try { const g = records.get({ id: row.id }); const full = g && g.record ? g.record : g; body = JSON.parse(String((full && full.body) || '{}')) } catch { body = null }
        if (!body || String(body.member) !== String(member)) return { deliverable: false, comments: '', source: 'none', recordId: row.id }
        if (Number(body.round) !== Number(state.round)) {
          // ★★★ TB-2761 (RUN 81 D-1): AN EARLIER-ROUND ROW IS NOT AUTOMATICALLY STALE. A part was replaced, `advance` bumped
          // the paper round, and the reviewers whose sections were NOT touched were counted as coverage gaps. The binding is
          // the part's FINGERPRINT: unchanged ⇒ the verdict still counts (and the cache is re-healed onto the durable row);
          // changed ⇒ stale TEXT (the reviewer must read the new text); no binding ⇒ the old round mismatch, said by name.
          const judgedEarlier = judgedPartReading(state, body)
          const ofEarlier = body.of === undefined || body.of === null ? '' : str(body.of)
          const crossEarlier = ofEarlier !== '' && ofEarlier !== String(member)
          if (crossEarlier && judgedEarlier.bound === true && !judgedEarlier.partChanged) {
            state.reviews[member] = { recordId: row.id, fingerprint: row.fingerprint || null, deliverable: body.deliverable === true, of: body.of, round: body.round, comments: str(body.comments),
              judgedPartFingerprint: judgedEarlier.boundFingerprint, judgedPartRound: judgedEarlier.boundRound, stalePart: false }
            return { deliverable: body.deliverable === true, comments: str(body.comments), source: 'durable', recordId: row.id,
              countedFromEarlierRound: true, rowRound: body.round, rowOf: judgedEarlier.of || null,
              judgedPartFingerprint: judgedEarlier.boundFingerprint, judgedPartRound: judgedEarlier.boundRound,
              means: 'the review row belongs to round ' + body.round + ' but the part text it judged is UNCHANGED (fingerprint ' + String(judgedEarlier.boundFingerprint) + '): since RUN 81 the gate binds the TEXT, not the round number, so this verdict counts for round ' + state.round }
          }
          if (crossEarlier && body.deliverable === true && judgedEarlier.bound === true && judgedEarlier.partChanged) {
            return { deliverable: false, comments: 'the review row for an earlier round judged a text of the part that has since been replaced', source: 'durable-stale-part', recordId: row.id,
              stalePart: true, rowDeliverable: true, rowRound: body.round, rowOf: judgedEarlier.of || null,
              judgedPartFingerprint: judgedEarlier.boundFingerprint, currentFingerprint: judgedEarlier.currentFingerprint, judgedPartRound: judgedEarlier.boundRound,
              means: 'the newest review row for this member belongs to round ' + body.round + ' and is BOUND to part fingerprint ' + String(judgedEarlier.boundFingerprint) + ' while the part on file now carries ' + String(judgedEarlier.currentFingerprint) + ': the text it judged was replaced, so the vote is STALE — not counted, and not a refusal' }
          }
          return { deliverable: false, comments: 'a review row exists for round ' + body.round + ', not this round (' + state.round + ')', source: 'durable-other-round', recordId: row.id,
            rowDeliverable: body.deliverable === true, rowRound: body.round, rowOf: body.of === undefined ? null : str(body.of),
            means: 'the newest review row for this member belongs to round ' + body.round + ' and carries no part fingerprint proving its judged text unchanged; it is not counted — that is a ROUND MISMATCH, not a member refusing' }
        }
        // ★★★ TB-2743: the row belongs to THIS round but is bound to an EARLIER TEXT of the part. That is not a round
        // mismatch and not a refusal: the member voted deliverable about prose that has since been replaced. It travels
        // as its own source, with BOTH fingerprints, and is not counted (the gate waits for a vote on the current text).
        // A `deliverable:false` vote is NOT affected: refusing to accept stale prose is a valid dissent that needs no
        // freshness, and treating it as stale would swallow the very refusal that sends the paper back to writing.
        const judged = judgedPartReading(state, body)
        if (body.deliverable === true && !judged.fresh) {
          return { deliverable: false, comments: 'the review row for this round judged an earlier text of the part ' + (judged.of || ''), source: 'durable-stale-part', recordId: row.id,
            stalePart: true, rowDeliverable: body.deliverable === true, rowRound: body.round, rowOf: judged.of || null,
            judgedPartFingerprint: judged.boundFingerprint, currentFingerprint: judged.currentFingerprint,
            judgedPartRound: judged.boundRound,
            means: 'the newest review row for this member belongs to round ' + body.round + ' (rowDeliverable:' + (body.deliverable === true) + ') but it is BOUND to part fingerprint ' + String(judged.boundFingerprint) + ' while the part on file now carries ' + String(judged.currentFingerprint) + ': the text it judged was replaced, so the vote is STALE — not counted, and not a refusal. The member re-files after reading the current part' }
        }
        state.reviews[member] = { recordId: row.id, fingerprint: row.fingerprint || null, deliverable: body.deliverable === true, of: body.of, round: body.round, comments: str(body.comments),
          judgedPartFingerprint: judged.boundFingerprint, judgedPartRound: judged.boundRound, stalePart: false }
        return { deliverable: body.deliverable === true, comments: str(body.comments), source: 'durable', recordId: row.id }
      }
      // ★★ RUN 167 (FEEDBACK14 F6): only a member whose reviewOf names ANOTHER participant's part owes a verdict.
      const assignedOther = (id) => { const a = state.reviewOf ? state.reviewOf[String(id)] : null; return !!a && str(a) !== str(id) }
      const required = state.participants.filter((id) => assignedOther(id))
      const notRequired = state.participants.filter((id) => !assignedOther(id)).map(String)
      const verdicts = required.map((id) => Object.assign({ member: id }, readReview(id)))
      const reviewsRead = verdicts.map((v) => {
        const row = { member: v.member, deliverable: v.deliverable === true, source: v.source, recordId: v.recordId || null }
        // ★ RUN 172: a stale row's own reading travels with the verdict, so `deliverable:false` cannot be misread as a
        // vote the member never cast (FEEDBACK17 P1-C).
        if (v.rowDeliverable !== undefined) { row.rowDeliverable = v.rowDeliverable; row.rowRound = v.rowRound; row.rowOf = v.rowOf; row.means = v.means }
        // ★★★ TB-2743: a stale-TEXT vote travels under its own name with both fingerprints, so a reader can tell it
        // from a round mismatch and from a refusal without opening the row.
        if (v.stalePart === true) { row.stalePart = true; row.judgedPartFingerprint = v.judgedPartFingerprint; row.currentFingerprint = v.currentFingerprint; row.judgedPartRound = v.judgedPartRound }
        // ★ TB-2761 D-1: a verdict counted ACROSS a round boundary says so (the round moved, the text did not).
        if (v.countedFromEarlierRound === true) { row.countedFromEarlierRound = true; row.rowRound = v.rowRound; row.means = v.means }
        return row
      })
      // ★★ RUN 199 (run 39 / FEEDBACK38 1.3, MEASURED): THIS LIST CONFLATED TWO FACTS. Run 39 read
      // refusers:["r-acad","r-2"] with refusersMeans saying those members "answered something other than
      // deliverable", while the SAME receipt's reviewsRead said their rows were STALE ("a ROUND MISMATCH, not a member
      // refusing") and their last counted answer was deliverable:true. A member who has not been asked yet, or whose only
      // row belongs to another round, has NOT refused — the gate must wait for them, not treat them as dissent. The three
      // facts now travel under three names, and unanimity requires all three to be empty.
      const refusers = verdicts.filter((v) => v.deliverable !== true && v.source !== 'none' && v.source !== 'durable-other-round' && v.source !== 'durable-stale-part').map((v) => v.member)
      const stale = verdicts.filter((v) => v.source === 'durable-other-round').map((v) => v.member)
      const notYetReviewed = verdicts.filter((v) => v.source === 'none').map((v) => v.member)
      // ★★★ TB-2743: a deliverable vote bound to text the part no longer carries is a STALE-PART vote — not a refusal,
      // not a "not yet asked". Unanimity does not count it; `requireCrossReview` refuses by name when it is the only gap.
      const stalePartReviews = verdicts.filter((v) => v.source === 'durable-stale-part').map((v) => v.member)
      const pendingNames = stale.concat(notYetReviewed)
      if (refusers.length === 0 && pendingNames.length === 0) {
        // ★ F3a: "everyone voted deliverable" is NOT enough when nobody reviewed anybody else's part. With one participant
        // the rotation reviews the participant themself, so the filter above was vacuously unanimous. The gate runs BEFORE
        // any mutation, so a refusal leaves the paper exactly where it was (still reviewing, nothing written).
        requireCrossReview(state, 'advance')
        const roundFromUnanimous = Number(state.round)
        const coverage = crossReviewCoverage(state)
        state.status = 'awaiting-editor'; state.stage = 'awaiting-editor'
        writeState(state)
        // ★★ RUN 195 (run 37 / FEEDBACK36 2.2, MEASURED): the two DISAGREEMENT branches carry `refusers` and the
        // UNANIMOUS one did not, so run 37's reader saw `advance` answers sometimes with the field and sometimes without
        // it (its own report asked "is refusers missing here, or is it empty?"). An empty list is a FACT here — every
        // required reviewer answered deliverable — so it is stated instead of omitted, with the sentence that says which.
        return { ok: true, moved: true, stageMoved: true, from: 'reviewing', to: 'awaiting-editor', round: state.round, unanimous: true, reviewsRead, notRequired,
          ...consultPrediction(state),
          ...roundReading(roundFromUnanimous, 'reviewing', 'awaiting-editor'),
          crossReview: coverage,
          refusers: [], stale: [], notYetReviewed: [],
          refusersMeans: 'empty ON PURPOSE: every participant who owes a verdict on another member\'s part answered deliverable on THIS round, so no one refused — the field is present so "nobody objected" is a value, not an absent one (the disagreement branches carry the same field with names in it)',
          pendingMeans: 'empty ON PURPOSE: every required reviewer has a counted verdict for this round, so no one is waiting to be asked — stale (rows from another round) and notYetReviewed (no row yet) are separate fields for exactly this reason' }
      }
      // The detail must state WHAT WAS READ, not a shrug: '未说明' was printed even when the member had filed a review
      // whose row was on disk (that is exactly how run 4's disagreement looked while the cards said deliverable:true).
      const entry = { round: state.round, members: refusers.slice(), pending: pendingNames.slice(), detail: refusers.map((id) => {
        const v = verdicts.filter((x) => x.member === id)[0] || { comments: '', source: 'none' }
        const why = v.comments ? String(v.comments)
          : (v.source === 'none' ? '没有本轮的评审行（未表态，不计为拒收）' : '评审行在记录里、但这一轮不算作可交付')
        return id + '：' + why
      }).concat(pendingNames.map((id) => {
        const v = verdicts.filter((x) => x.member === id)[0] || {}
        return id + '：' + (v.source === 'durable-other-round' ? '最近一条评审行属于别的轮次（ROUND MISMATCH，不计为拒收）' : '还没有本轮的评审行（未表态，不计为拒收）')
      })).concat(stalePartReviews.map((id) => {
        const v = verdicts.filter((x) => x.member === id)[0] || {}
        const shown = (x) => (x === null || x === undefined ? '（无）' : String(x))
        // ★★★ TB-2761 (RUN 81 D-4): only print ≠ when the fingerprints are REALLY different. Run 81 printed
        // "judgedPartFingerprint f56eba11… ≠ current f56eba11…" — the same hash on both sides — and a reader had to
        // discover that the invalidation was about the ROUND, not about the bytes. When they are equal the line says so.
        const sameBytes = String(shown(v.judgedPartFingerprint)) === String(shown(v.currentFingerprint))
        const why = v.stalePartWhy === 'part-text-changed' || (!sameBytes && v.judgedPartFingerprint !== undefined) ? 'part-text-changed' : 'round-changed'
        return id + '：本轮的票绑的是旧正文（STALE PART：' + (sameBytes
          ? 'judgedPartFingerprint 与当前相同（＝ ' + shown(v.currentFingerprint) + '；作废原因是轮次/无绑定，不是字节）'
          : 'judgedPartFingerprint ' + shown(v.judgedPartFingerprint) + ' ≠ 当前 ' + shown(v.currentFingerprint)) + '；why:"' + why + '"；不计为拒收也不计为覆盖）'
      })).join('；') }
      state.disagreement = (state.disagreement || []).concat([entry])
      // ★★ RUN 201 (run 40 / FEEDBACK39 1.3): the receipt said "goes back to writing" and did not say the ROUND moved,
      // so the editor read a round-3 paper as a retry of round 2. The two numbers are read BEFORE the increment.
      const roundFrom = state.round
      if (state.round < roundsCap()) {
        state.round += 1; state.updatedRound = state.round; state.status = 'writing'; state.stage = 'writing'; state.reviews = {}
        writeState(state)
        // ★★ RUN 197 (run 38 / FEEDBACK37 1.3, MEASURED): the UNANIMOUS branch stated `refusers: []` with a note claiming the
        // disagreement branches "carry the same field with names in it" — and neither did. Run 38's editor read
        // `refusers:["r-1"]` with no sentence saying what the list means or what happens next.
        return { ok: true, moved: true, stageMoved: true, from: 'reviewing', to: 'writing', round: state.round, roundFrom, roundTo: state.round,
          // ★★★ TB-2761 D-5: this branch writes its round fields directly (not through `roundReading`), so it carries the
          // same two-numbers sentence itself — run 81 read round:3 beside updatedRound:2 with no rule for either.
          updatedRound: Number(state.updatedRound), updatedRoundSameAsRound: Number(state.updatedRound) === state.round,
          updatedRoundMeans: state.updatedRoundMeans,
          roundMeans: 'the round ADVANCED (' + String(roundFrom) + ' → ' + String(state.round) + ') and the paper went back to writing: this is not a retry of round ' + String(roundFrom) + ', it is the next round with the disagreement recorded',
          unanimous: false, refusers, stale, notYetReviewed, stalePartReviews,
          stalePartReviewsMeans: stalePartReviews.length === 0
            ? 'empty ON PURPOSE: no required reviewer filed a deliverable vote bound to text the part no longer carries'
            : 'NOT empty: these members voted deliverable on a TEXT of the part that has since been replaced (' + stalePartReviews.join(', ') + ') — their verdict is bound to the old fingerprint, so it counts neither as coverage nor as a refusal: they must re-file on the current part',
          refusersMeans: refusers.length === 0
            ? 'empty ON PURPOSE: nobody refused — the round is held open because reviewer(s) ' + (pendingNames.join(', ')) + ' have no counted verdict for this round (see stale and notYetReviewed), so the paper goes back to writing instead of being called unanimous'
            : 'NOT empty: these participants answered something other than deliverable on another member\'s part (' + refusers.join(', ') + '), so this round did NOT reach unanimity and the paper goes back to writing',
          staleMeans: stale.length === 0 ? 'empty ON PURPOSE: no required reviewer holds a row from another round'
            : 'NOT empty: these members have a review row that belongs to ANOTHER round (' + stale.join(', ') + ') — that is a ROUND MISMATCH, not a refusal: their old verdict is not counted and they can review this round',
          notYetReviewedMeans: notYetReviewed.length === 0 ? 'empty ON PURPOSE: every required reviewer has a row for this round'
            : 'NOT empty: these members have filed no review row at all yet (' + notYetReviewed.join(', ') + ') — they have not refused anything, they have not been answered yet',
          reviewsRead, notRequired,
          notRequiredMeans: notRequired.length === 0 ? null : 'these participants were NOT counted as refusers: they have no other member\'s part to review (' + notRequired.join(', ') + ')' }
      }
      const roundFromCapped = Number(state.round)
      state.status = 'awaiting-editor'; state.stage = 'awaiting-editor'
      state.forcedAfterCap = true
      // ★★ RUN 189 (run 33 / FEEDBACK33 1.4, MEASURED): this warning was written once and then read forever. Run 33
      // advanced to round 3 with BOTH members `deliverable:true` (its own receipt said `unanimous:true`) and `status`
      // still printed "互审在 3 轮上限仍未达成全体一致" beside those two true reviews — a historical fact presented as the
      // current verdict. The warning now carries the round it belongs to, so a reader can tell history from now.
      state.forcedAfterCapRound = state.round
      state.warnings = (state.warnings || []).concat(['（第 ' + state.round + ' 轮）互审在 ' + roundsCap() + ' 轮上限仍未达成全体一致（' + refusers.concat(pendingNames).join('、') + '；其中真拒收 ' + refusers.length + ' 位、未表态 ' + pendingNames.length + ' 位）；分歧已写入论文附录（这是 HISTORY：之后各轮的评审可以再次达成一致）'])
      writeState(state)
      // ★★ RUN 197 (same defect as the branch above): the CAPPED disagreement branch printed `refusers` and no meaning either.
      return { ok: true, moved: true, stageMoved: true, from: 'reviewing', to: 'awaiting-editor', round: state.round, unanimous: false, refusers,
        ...consultPrediction(state),
        ...roundReading(roundFromCapped, 'reviewing', 'awaiting-editor'),
        crossReview: crossReviewCoverage(state),
        refusersMeans: 'NOT empty: the reviews did not reach deliverable for every participant within ' + roundsCap() + ' round(s), so the editor is handed the paper WITH this disagreement on the record (a later round can still agree); refusers holds the votes that said no, stale/notYetReviewed hold the members who were never counted',
        stale, notYetReviewed, stalePartReviews,
        stalePartReviewsMeans: stalePartReviews.length === 0
          ? 'empty ON PURPOSE: no required reviewer filed a deliverable vote bound to text the part no longer carries'
          : 'NOT empty: these members voted deliverable on a TEXT of the part that has since been replaced (' + stalePartReviews.join(', ') + ') — that verdict is bound to the old fingerprint and counts neither as coverage nor as a refusal; re-file on the current part',
        capped: true, warnings: state.warnings, reviewsRead }
    }
    return { ok: true, moved: false, stageMoved: false, state: state.status, note: 'the flow is ' + state.status + '; only writing/reviewing advance on their own (finalize it, or start a new paper)',
      // ★★★ RUN 212 (run 49 / FEEDBACK48 1.3, MEASURED): the consult prediction was printed only by advances that MOVED,
      // so a paper sitting in awaiting-editor could not be asked "will finalization wait for an office answer?" — the one
      // place the question matters. The prediction describes the SETTING and the paper, not the move, so it travels here
      // too (a reader who only reads moving receipts would otherwise have to start a second paper to see it).
      ...consultPrediction(state),
      stageMovedMeans: 'moved/stageMoved answer ONE question, the STAGE: false means the paper did not change stage at all. A move that changes the stage but not the round carries stageMoved:true with roundMoved:false' }
  }

  /**
   * ★★★ TB-2713: the move receipt carries the round-coverage READING too, computed AFTER the transition (so a bounce
   * that raised the round answers with the round it landed in: every old verdict is named as invalidated and `missing`
   * names the members the new round is waiting for). The arithmetic lives in `perRoundReviewCoverageOfState` — this
   * wrapper only calls it, so `advance` and `status` cannot drift apart. A paper whose state cannot be re-read after the
   * move keeps the move receipt unchanged: the coverage is a reading, never a precondition of the move itself.
   */
  function advance(args = {}) {
    const out = advanceMove(args)
    try {
      const found = readState(args && args.target)
      if (found && found.state && out && typeof out === 'object') out.perRoundReviewCoverage = perRoundReviewCoverageOfState(found.state)
    } catch (e) { /* the move already happened; a failed coverage read must not un-report it */ }
    return out
  }

  /** ⑤ the driver: advance until nothing moves (the original's paperPass, bounded so it cannot loop forever). */
  function pass({ target, maxSteps = 6 } = {}) {
    const transitions = []
    for (let i = 0; i < maxSteps; i += 1) {
      const r = advance({ target })
      if (!r.moved) return { ok: true, moved: transitions.length > 0, transitions, stopped: r.state || null }
      transitions.push({ from: r.from, to: r.to, round: r.round })
    }
    return { ok: true, moved: transitions.length > 0, transitions, stopped: 'max-steps' }
  }

  /** ★ F-123a: what a caller can DO from the paper's current status. A refusal that names an action the flow cannot
   *  take is a dead end; these three sentences each name the call that changes the answer. */
  function nextMoveFor(state) {
    const target = state.target
    if (state.status === 'writing') return 'a paper in "writing" needs its parts first: vibe_v5_paper { action: "part", target: "' + target + '", part: "<name>", body: "<json body>", member: "<author>" } — then advance() moves it to reviewing'
    if (state.status === 'reviewing') return 'a paper in "reviewing" needs every part reviewed by a member who is NOT its author: vibe_v5_paper { action: "review", target: "' + target + '", of: "<author id>", member: "<reviewer id>", deliverable: true } — advance() only moves the flow, it does not review for you'
    if (state.status === 'finalized') return 'this paper is already finalized: start a new target, or read it with vibe_v5_paper { action: "status", target: "' + target + '" }'
    return 'the flow is ' + state.status + '; only writing/reviewing advance on their own'
  }

  /** ⑥ the final decision: academician only, decision deliverable|revise (the original's two values). */
  async function recordFinal({ target, member, decision, note = '', conclusion = '' } = {}) {
    const { state } = requireState(target)
    // ★ F-123a: the hint has to name the action that can actually change the answer. `advance()` only moves the flow
    // between writing/reviewing — it never reviews a part, so "advance() until the cross-review is unanimous" told the
    // caller (run 123) to repeat a call that cannot help. Each state names its own legal next move.
    // ★★ RUN 176 (run 21 A1): a paper finalised by a build whose compile had FAILED is a dead end under the old rule —
    // `revise` was refused with "not awaiting its editor (now: finalized)", `compile` re-typesets the same broken source,
    // and `part` only writes while writing. When the compile ledger holds NO successful PDF for this paper, `revise` is the
    // repair path and is allowed (the move is recorded as a repair, not as a claim that the paper was never finalised).
    const pdfLessFinal = state.status === 'finalized' && decision === 'revise' && compiledPdfRow(state) === null
    if (state.status !== 'awaiting-editor' && !pdfLessFinal) throw refuse(CODES.STATE, 'the paper is not awaiting its editor (now: ' + state.status + ')', nextMoveFor(state))
    // ★★ RUN 152: this refusal used to be ONE sentence for two different facts, and it printed
    // "this paper is not the academician's to finalise" even when the academician WAS the signer (the paper had been
    // started with a member id as its editor) — a message that is literally false about the state it describes. The
    // two facts are now separated: an office-edited paper is the named consult gap, and anything else names the role
    // the flow accepts and how to get one. `start` above normalises a chair-seated member id to "academician", so a
    // paper created by the current build cannot reach the second branch through that spelling.
    if (state.editor === 'office') {
      throw refuse('VMU_NOT_PERMITTED', 'this paper is edited by the office, and the office may finalise only after consulting the institute — that path is a named gap in this build',
        'start the paper with editor:"academician" so the member in the chair seat finalises it (record the office consult answer with action:"consult" — the gate stays closed until the office answers, and a named gap is not a passing gate)')
    }
    if (state.editor !== editorDefault) {
      throw refuse('VMU_NOT_PERMITTED', 'paperEditor is "' + state.editor + '": the flow finalises only an "academician"-edited paper signed by the member in the chair seat',
        'start the paper with editor:"academician" (default) — a member id is accepted at start only for a chair-seated member and is recorded as "academician"')
    }
    // ★★★ RUN 219 (run 55 / FEEDBACK54 1.2, MEASURED): a `final` with no `member` printed "the academician (chair seat)
    // must finalise this paper; \"\" is not on the roster" while `status.editorReading` showed the chair SEATED. The empty
    // string was the ABSENCE OF A SIGNER, not a roster lookup result, and the hint offered two repairs (seat an academician
    // / edit by the office) for a problem that was neither. The two facts are separated: an unsigned call is told to sign.
    if (str(member).trim() === '') {
      const chairRow = (kernel.members ? kernel.members.roster() : []).filter((m) => String(m.slot) === finalizerSlot)[0] || null
      throw refuse('VMU_NOT_PERMITTED', 'final needs a SIGNER: this face does not infer the caller, so `member` must name the member in the chair seat' + (chairRow ? ' ("' + String(chairRow.id) + '" holds it)' : ' (read it from the paper status `editorReading.seat`)'),
        'pass member:\"<the id in the chair slot>\" on this same call — an empty member is a MISSING SIGNATURE, not a roster miss; when that seat is empty, start the paper with editor:\"office\" and record the office consult answer (named gap)')
    }
    const row = (kernel.members ? kernel.members.roster() : []).filter((m) => m.id === str(member))[0]
    if (!row || String(row.slot) !== finalizerSlot) {
      throw refuse('VMU_NOT_PERMITTED', 'the academician (chair seat) must finalise this paper; "' + str(member) + '" is ' + (row ? 'in slot "' + String(row.slot) + '"' : 'not on the roster'),
        'seat an academician in the chair slot, or configure editor:"office" with its consult gap reported (named gap)')
    }
    if (decision !== 'deliverable' && decision !== 'revise') throw refuse('VMU_INVALID_ARGUMENT', 'decision must be deliverable|revise', 'the original accepts exactly these two')
    // ★★ RUN 199 (run 39 / FEEDBACK38 1.4, MEASURED): run 39 finalised with conclusion:"" and the receipt printed an
    // empty conclusion beside a note that said what the paper stands on — the tool schema lists conclusion as "final：
    // 结论" and body as its alias, so a caller could reasonably read "the conclusion was recorded" while the field was
    // empty. A deliverable decision now RECORDS THE NOTE AS THE CONCLUSION when no conclusion was passed, and the receipt
    // says where it came from — two different things are no longer one missing field.
    const noteText = str(note).slice(0, 4000)
    const conclusionGiven = str(conclusion).trim() !== ''
    const conclusionText = conclusionGiven ? str(conclusion).slice(0, 20000) : (decision === 'deliverable' ? noteText : '')
    const fin = { by: str(member), decision, note: noteText, conclusion: conclusionText,
      conclusionSource: conclusionGiven ? 'conclusion' : (conclusionText !== '' ? 'note' : 'none'),
      conclusionMeans: conclusionGiven
        ? 'the conclusion was passed as conclusion and is recorded verbatim'
        : (conclusionText !== ''
          ? 'no conclusion was passed, so the note is recorded as the conclusion too (conclusionSource:"note") — note and conclusion are not synonyms: note is the editor short remark, conclusion is what the paper stands on'
          : 'neither a conclusion nor a note was passed: the paper is finalised with no stated conclusion (a reading, not a hidden default)') }
    if (decision === 'deliverable') {
      // ★ F3a: a finalisation must rest on two DISTINCT cross-reviews by non-authors. `advance` already refuses to go
      // unanimous on a self-review, but the round-cap path can still reach awaiting-editor (a lone participant forced
      // there after MAX_ROUNDS), so the editor's gate re-applies the same rule instead of trusting the state label.
      requireCrossReview(state, 'final')
      // ★ E4: 定稿前必须问所办. The gate runs BEFORE any mutation, so a refusal leaves the paper exactly where it was
      // (except the durable request it just opened — the question has to survive a crash, that is the point of asking).
      const gate = consultGate({ state, member: fin.by })
      if (!gate.allowed) {
        // ★★ RUN 201 (run 40 / FEEDBACK39 1.5): the refusal receipt said WHAT blocked the finalisation and nothing about
        // the finalisation itself, so a reader comparing the two attempts saw "no final block" versus "a final block" and
        // could not tell a refused final from a missing one. The refusal now carries the final it refused, with the ONE
        // field that matters: it is not finalized, and here is the question that must be answered first.
        gate.error.final = {
          ok: false, finalized: false, blockedBy: 'office-consult',
          by: fin.by, decision: fin.decision,
          consult: { requestId: gate.error.requestId === undefined ? null : gate.error.requestId,
            definition: gate.error.requestId === undefined || gate.error.requestId === null ? null : String(gate.reason || '') },
          means: 'the final was REFUSED before anything was written: this paper is NOT finalized, and the question in `consult.requestId` must be answered before the same call can succeed — answer it with vibe_v5_paper { action: "consult", target, member, answer } (the kit method is recordConsult); a refused final leaves the paper exactly where it was',
        }
        throw gate.error
      }
      const before = { hadFinal: Object.prototype.hasOwnProperty.call(state, 'final'), final: state.final, status: state.status, stage: state.stage }
      state.final = fin; state.status = 'finalized'; state.stage = 'finalized'
      writeState(state)
      // ★ F4: the path that FINALISES must be the path that is GATED. `render` is the pack's overridden face (the quality
      // gate lives there), so call it through the returned API — one call site serves both a bare render and recordFinal,
      // and the old lexical copy (which skipped the pack's gate) is gone. A refusal restores the pre-final state, because
      // a "finalized" paper whose body failed the gate is exactly the lie this defect produced.
      let rendered = null
      try {
        rendered = api.render({ target })
      } catch (e) {
        if (before.hadFinal) state.final = before.final
        else delete state.final
        state.status = before.status; state.stage = before.stage
        writeState(state)
        throw e
      }
      // The PDF is the one artefact the KERNEL must make. Its absence is reported, never hidden: a receipt that says
      // "finalized" while the fourth artefact is missing is the paper-world version of crying wolf.
      let pdf = null
      try {
        pdf = { ok: true, produced: true, ...(await compilePdf({ target })) }
      } catch (e) {
        // ★ G7 ③: keep a MACHINE-READABLE engine list on the failure (the prose message alone forces a caller to parse
        // Chinese text to answer "which engines were tried, which one failed"). The array is bounded, never full logs.
        pdf = { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e),
          faceCode: (e && e.faceCode) || null,
          triedEngines: Array.isArray(e && e.triedEngines) ? e.triedEngines.slice(0, 12) : [],
          // ★★ RUN 153 (real machine, run 3 / agent report G10): `action:"compile"` carried the compiler's words and the
          // exact argv, while the FINAL receipt for the SAME failure carried neither — so the most important door
          // (finalisation) was the least informative one. One failure structure, both doors.
          argv: Array.isArray(e && e.argv) ? e.argv.slice(0, 16) : [],
          stderrTail: e && e.stderrTail ? String(e.stderrTail).slice(-1500) : '',
          stdoutTail: e && e.stdoutTail ? String(e.stdoutTail).slice(-1500) : '',
          tailSource: (e && e.tailSource) || null,
          // ★★ RUN 158 (run 6 / item 6): same fields as `action:"compile"` — one failure structure, both doors.
          outDir: (e && e.outDir) || null,
          sourceName: (e && e.sourceName) || null,
          tailsIdentical: e && e.tailsIdentical === true,
          signal: (e && e.signal) || null }
      }
      // ★★ RUN 154 (G10): run 4's final receipt said `"missing":["pdf"]` AND `"pdf":{"ok":true,...}` in the SAME answer —
      // `missing` was the pre-compile artefact list and the compile had just succeeded. The list is recomputed around the
      // compile that actually ran, so the two statements can no longer contradict each other.
      const missingAfter = (Array.isArray(rendered.missing) ? rendered.missing : []).filter((m) => !(pdf && pdf.ok === true && m === 'pdf'))

      // ★★★ TB-2772 (RUN 82 attempt-1): A PDF THAT DROPPED GLYPHS IS NOT A DELIVERABLE. The compile exits 0 and writes the
      // file, yet xelatex's log named 23 dropped glyphs and the PDF was missing them — silently delivering that is worse
      // than failing. The detection lives in kernel/latex.js (`glyphLossDetected`); THIS is the gate: roll the
      // finalisation back to awaiting-editor (exactly like a failed compile) and refuse BY NAME with the rewrite advice.
      // There is no override: an undeliverable artefact must fail loudly.
      if (pdf && pdf.ok === true && pdf.glyphLossDetected === true) {
        if (before.hadFinal && before.final !== undefined) state.final = before.final
        else delete state.final
        state.status = before.status
        state.stage = before.stage
        writeState(state)
        const glyphRows = Array.isArray(pdf.glyphsUnrepaired) ? pdf.glyphsUnrepaired : []
        const glyphAdvice = glyphAdviceOf(glyphRows)
        const glyphCount = Number.isFinite(Number(pdf.missingCharacterCount))
          ? Number(pdf.missingCharacterCount)
          : glyphRows.reduce((n, r) => n + (Number(r && r.count) || 0), 0)
        return {
          ok: false,
          code: 'VMU_PAPER_GLYPH_UNCOVERED',
          message: 'this PDF is NOT deliverable: the compile wrote a file but xelatex dropped ' + String(glyphCount) + ' glyph(s) the font does not have, so the PDF text is missing those characters (the file existing is not the same as the mathematics printing)',
          hint: 'rewrite these characters in your parts as LaTeX commands, then call final again: ' + glyphAdvice,
          finalized: false,
          target: state.target,
          final: fin,
          stage: state.status,
          artifacts: rendered.artifacts,
          missing: missingAfter,
          pdf,
          glyphLossDetected: true,
          missingCharacterCount: glyphCount,
          glyphsUnrepaired: glyphRows,
          glyphLossCode: 'VMU_PAPER_GLYPH_UNCOVERED',
          logPath: pdf.logPath === undefined ? null : pdf.logPath,
          rolledBack: { from: 'finalized', to: state.status, keptEarlierFinal: before.hadFinal === true },
          reviseAvailable: true,
          means: 'the paper was NOT finalised: compile exited 0 but the font dropped glyphs, so the state went back to '
            + String(state.status) + ' with rounds/repairs untouched — fix the body (rewrite the characters named in glyphsUnrepaired) and call final again; a PDF missing glyphs is a non-deliverable artefact, not a warning',
        }
      }
      // ★★ RUN 176 (run 21 A1 / FEEDBACK21 F1): the compile is PART of the finalisation gate. RUN 154's G10 decision
      // ("finalise anyway, report pdf.ok:false") was honest about the artefact and deadlocked the paper — status became
      // `finalized` BEFORE the compile ran, so a failure left nothing that could be revised. A failed compile now rolls the
      // finalisation back to awaiting-editor (the same rollback the render gate already does) and the receipt says so.
      // ★★ RUN 176 refinement (measured by the suites): "no PDF" has TWO causes and only ONE of them is a text defect.
      // EXECUTOR_MISSING means THIS assembly has no LaTeX face at all — an environment gap, not a bug in the prose — and
      // the paper still finalises (the old behaviour is honest there: the receipt names the missing seam). A compile that
      // really RAN and failed is the dead end run 21 measured, and that one rolls back.
      // "no engine ever ran" is not the same fact as "an engine ran and refused". The projection carries `triedEngines` as
      // `engine:phase[:code]` strings, so a run that reached the COMPILE phase is exactly the case RUN 176 rolls back; a face
      // that only ever got as far as PROBE (or none at all) is the environment gap the old behaviour is honest about.
      const triedList = Array.isArray(pdf && pdf.triedEngines) ? pdf.triedEngines : []
      // ★★★ RUN 177 (run 22, FEEDBACK22 D1 — the fix from RUN 176 never fired on the real machine): the projection
      // carries STRUCTURED entries ({engine, phase, code}), so `String(t).includes(':compile')` was `'[object Object]'`
      // and `reachedCompile` was ALWAYS false — i.e. every real compile failure was classified as an env gap and the
      // paper finalised anyway. Measured on run 22: xelatex really ran, really exited 1 (! Undefined control sequence),
      // and `final` answered finalized:true with no `rolledBack`. The phase is now read the way the face writes it:
      // an OBJECT contributes `phase`, a bare string keeps the old `engine:phase` reading for older callers.
      const phaseOf = (t) => {
        if (t === undefined || t === null) return ''
        if (typeof t === 'object') return String(t.phase === undefined || t.phase === null ? '' : t.phase)
        const str = String(t)
        const at = str.indexOf(':')
        return at < 0 ? '' : str.slice(at + 1).split(':')[0]
      }
      const reachedCompile = triedList.some((t) => phaseOf(t) === 'compile')
      const faceNoEngine = String((pdf && pdf.faceCode) || '') === 'VMU_PAPER_LATEX_NO_ENGINE'
      const engineAbsent = String((pdf && pdf.code) || '') === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING'
        || (String((pdf && pdf.code) || '') !== '' && (faceNoEngine || (triedList.length > 0 && !reachedCompile)))
      if (!(pdf && pdf.ok === true) && !engineAbsent) {
        // ★★ RUN 178: restoring `state.final = undefined` leaves the KEY present with an undefined value, which serialises
        // away — the restored body then equals the pre-final body byte for byte (and collided with the stale fingerprint
        // above). The pre-final body simply had no `final` key, so the rollback deletes it.
        if (before.hadFinal && before.final !== undefined) state.final = before.final
        else delete state.final
        state.status = before.status
        state.stage = before.stage
        writeState(state)
        return {
          ok: true, finalized: false, target: state.target, final: fin,
          artifacts: rendered.artifacts, missing: missingAfter.length > 0 ? missingAfter : ['pdf'], pdf,
          rolledBack: { from: 'finalized', to: state.status, keptEarlierFinal: before.hadFinal === true },
          reviseAvailable: true,
          means: 'the paper was NOT finalised: the PDF artefact never existed, so the state went back to awaiting-editor alongside the `pdf` block that says why — a finalisation whose fourth artefact is missing is the dead end RUN 154 shipped and run 21 measured. `final {decision:"revise"}` still reopens writing (fix the body, finalise again); `compile` only re-typesets an already-finalized paper, so it is not a repair.',
        }
      }
      // ★★ RUN 195 (run 37 / FEEDBACK36 1.1): the finalisation's OWN compile row is recorded on the state, so a later
      // reader can tell "the file on disk is the one this paper was finalised with" from "it was re-typeset afterwards".
      // `compile` is allowed on a finalised paper (it is how a broken build is repaired), and run 37 measured the result:
      // the ledger said 91 156 bytes while the file had been rewritten to 91 198 by a member's own recompile. The ledger
      // read now returns the NEWEST compile row (compiledPdfRow) and this field says which row the finalisation used.
      if (pdf && pdf.ok === true) {
        state.finalPdfRecordId = pdf.recordId === undefined || pdf.recordId === null ? null : String(pdf.recordId)
        state.finalPdfBytes = pdf.pdfBytes === undefined || pdf.pdfBytes === null ? null : Number(pdf.pdfBytes)
        // ★★★ RUN 2691 (TB-2691 / F75-15): the finalisation records WHICH bytes it finalised, same source as the row.
        state.finalPdfSha256 = pdf.pdfSha256 === undefined || pdf.pdfSha256 === null ? null : String(pdf.pdfSha256)
        writeState(state)
      }
      return { ok: true, finalized: true, target: state.target, final: fin, artifacts: rendered.artifacts, missing: missingAfter, pdf,
        ...(engineAbsent ? { pdfEnvironmentMissing: true, pdfEnvironmentMeans: 'this assembly has no LaTeX face (`VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`): the paper is finalised and the PDF artefact stays named in `missing` — an environment gap, not a body that failed to compile. A compile that really ran and failed does NOT finalise (RUN 176).' } : {}),
        // ★ E4: the receipt says WHICH way the consult rule was satisfied ("off" / "answered" / "exempt"): a finalisation
        // that claims the office was consulted when the gate was simply off is the sort of quiet lie this pack refuses.
        consult: { armed: gate.armed === true, satisfiedBy: gate.reason, answeredBy: gate.answeredBy || null, requestId: gate.requestId || null, note: gate.note || null },
        // ★★★ RUN 212 (run 49 / FEEDBACK48 1.3/2.4, MEASURED): the same fact had three names across three faces
        // (`advance` → officeConsultPending, `final` → consult.armed/satisfiedBy, `consult_state` → armed/policy). A reader
        // that learned the advance name could not find it here. `officeConsultPending` is false BY CONSTRUCTION once the
        // paper is finalised (the gate has been passed), and the alias is printed so one name works on all three faces.
        officeConsultPending: false,
        officeConsultPendingMeans: 'false here BY CONSTRUCTION: finalization already happened, so nothing is pending. The authoritative reading of the setting is `consult.armed`/`satisfiedBy` on this receipt (armed:false means the gate was not in force), and `vibe_v5_paper { action: "consult_state" }` prints the same fact as `armed`/`policy` with the request list' }
    }
    state.final = fin
    const capNow = roundsCap()
    if (state.round < capNow) {
      state.round += 1; state.updatedRound = state.round; state.status = 'writing'; state.stage = 'writing'
      state.disagreement = (state.disagreement || []).concat([{ round: state.round - 1, members: [fin.by], detail: (pdfLessFinal ? '定稿未产出 PDF 的修复轮（RUN 176：编译失败不再定稿，历史残件由这里救回）：' : '定稿代表要求修订：') + (fin.note || '（未说明）') }])
      writeState(state)
      // ★★ RUN 158 (run 6 / N5): this branch moved the paper awaiting-editor → writing but reported `from:null,to:null`
      // (only the REPAIR branch named the move), so a reader could not tell a revision from a repair round.
      return { ok: true, finalized: false, moved: true, from: 'awaiting-editor', to: 'writing', round: state.round, status: state.status,
        stageMoved: true, repair: false, repairs: Number(state.repairs || 0), repairBudget: REPAIR_ROUNDS, cap: capNow }
    }
    // ★★ RUN 154 (real machine, run 4 / FEEDBACK3 H2 — DEADLOCK): at the cross-review cap the paper sat in
    // `awaiting-editor` where `deliverable` was refused by the content gate (a verified title line missing) and `revise`
    // was refused by the round cap — `part` only writes in `writing`, so NO call could change the body: the paper became
    // dead data. The cap limits the REVIEW loop; the editor gets a bounded number of REPAIR rounds to fix the body
    // (each one is recorded as a repair, so it can never be mistaken for a fresh review round).
    const repairs = Number(state.repairs || 0)
    if (repairs < REPAIR_ROUNDS) {
      state.repairs = repairs + 1
      state.status = 'writing'; state.stage = 'writing'
      state.disagreement = (state.disagreement || []).concat([{ round: state.round, members: [fin.by], detail: '定稿代表要求修订（轮数上限后的第 ' + state.repairs + ' 次修复轮，不计入互审轮次）：' + (fin.note || '（未说明）') }])
      writeState(state)
      return { ok: true, finalized: false, moved: true, stageMoved: true, from: 'awaiting-editor', to: 'writing', round: state.round, status: state.status, repair: true, repairs: state.repairs, repairBudget: REPAIR_ROUNDS, cap: capNow }
    }
    // ★★ RUN 158 (real machine, run 6 / feedback N1 — A HINT THAT NAMED AN UNREACHABLE EXIT): the old text offered
    // (a) "record a new part", which the flow refuses in awaiting-editor (parts write in `writing` only), so the advice
    // closed a circle; and (b) said raising `vmu.paper.maxRounds` lets the paper "revise again", which is only true when
    // the new cap is STRICTLY ABOVE the current round (otherwise the next revise is another repair round, of which there
    // are none left). Both are now stated with the numbers that decide them.
    throw refuse(CODES.STATE,
      '已到 ' + capNow + ' 轮上限，且 ' + REPAIR_ROUNDS + ' 次修复轮也用完了（round=' + state.round + '，repairsUsed=' + repairs + '/' + REPAIR_ROUNDS + '），定稿代表仍要求修订',
      'this face has no force flag. The exits that really exist: (1) raise vmu.paper.maxRounds to a number STRICTLY GREATER than the current round (' + state.round + ') with vibe_v5_set {key:"vmu.paper.maxRounds",value:' + (state.round + 1) + ',why:"…"} — the next revise is then an ordinary revision that reopens writing; raising it to ' + state.round + ' or below does NOT help, because the next revise would be another repair round and the repair budget is spent; (2) start a new paper for a new target with a body that satisfies the content gate. Recording a new part is NOT an exit here: parts can only be written while the paper is in writing')
  }

  /** Re-read a part BY ID and compare the fingerprint remembered at write time (rule ①). */
  function readPartVerified(state, member) {
    const ref = state.parts[member]
    if (!ref) return null
    const got = records.get({ id: ref.recordId })
    const full = got && got.record ? got.record : got
    const now = full && full.fingerprint
    if (now !== ref.fingerprint) {
      throw refuse(CODES.FINGERPRINT, 'part "' + member + '" no longer matches the fingerprint the state remembers (' + String(ref.fingerprint) + ' → ' + String(now) + ')',
        'the body on disk changed behind the paper\'s back; rebuild the part explicitly (record it again) — this face will NOT silently use the old text')
    }
    let body = full && full.body
    if (body === undefined && Array.isArray(full && full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('\n')
    try { return JSON.parse(String(body || '{}')) } catch { return null }
  }

  /** ⑦ markdown: rebuilt from the parts (by id + fingerprint), one section per the original's list.
   *  `rawMd` is the UNFILLED markdown (the seam below is applied on top); it is exported as `PaperMdRaw` so a pack that
   *  owns the fill can also produce its AUDIT from the same base instead of calling the filled version twice. */
  function rawMd({ target } = {}) {
    const { state } = requireState(target)
    const lines = ['# 论文：' + state.target, '', '状态：' + state.status + '｜轮次：' + state.round + '｜编辑：' + state.editor, '']
    // ★ EACH SECTION OWNS AT MOST ONE FIELD, and each member contributes to it ONCE. The previous shape emitted the whole part
    // under every heading, which is why the live .md carried the full body in all nine sections.
    for (let i = 0; i < SECTIONS.length; i += 1) {
      lines.push('', '## ' + SECTIONS[i])
      if (i === 0) {
        lines.push('目标对象：' + state.target + '；参与成员：' + state.participants.join('、'))
        for (const member of state.participants) {
          const part = readPartVerified(state, member)
          if (part && has(part.title)) lines.push('', '**' + part.title + '**')
        }
        continue
      }
      const field = SECTION_FIELDS[i]
      if (!field) continue
      for (const member of state.participants) {
        const part = readPartVerified(state, member)
        if (!part || !has(part[field])) continue
        lines.push('', '### ' + member + '（第 ' + part.round + ' 轮）', '', String(part[field]))
      }
      if (field === 'evidence') {
        for (const member of state.participants) {
          const part = readPartVerified(state, member)
          if (part && Array.isArray(part.evidence) && part.evidence.length) lines.push('', member + '：' + part.evidence.join('；'))
        }
      }
    }
    if (state.warnings.length) lines.push('', '## 警告', ...state.warnings.map((w) => '- ' + w))
    return lines.join('\n')
  }

  /** ⑦b the markdown every artefact is built from — the seam is applied HERE, once, so `.md`, `.tex` and the receipt agree. */
  function PaperMd(args = {}) {
    const raw = rawMd(args)
    if (!MD_FILL) return raw
    const { state } = requireState(args && args.target)
    const filled = MD_FILL(raw, { target: state.target, state })
    if (typeof filled !== 'string') {
      throw refuse('VMU_INVALID_ARGUMENT', 'mdFill must return the markdown string (got ' + typeof filled + ')',
        'the pack supplies mdFill; return the filled markdown, or null in the option to opt out')
    }
    return filled
  }

  /** ⑧ tex: same body, with the engine order's preamble needs (ctex for Chinese). */
  function PaperTexBody({ target } = {}) {
    const state = requireState(target).state
    const md = PaperMd({ target })
    // ★ ** is MARKDOWN bold and it is not a TeX character - it used to travel into the .tex verbatim. Convert it first,
    // then escape.
    // ★★ RUN 152 (real machine, run 2): the ORDER was backwards — the bold conversion inserted a literal `\\textbf{…}`
    // and the escaping pass that ran AFTER it escaped the braces it had just produced, so every heading came out as
    // `\\textbf\{1 · …\}`. Measured: xelatex stopped at "! Undefined control sequence." and the PDF was never produced
    // (`VMU_PAPER_LATEX_FAILED`), which made the paper stage unfinishable. Escape the TEXT first (so the braces are
    // escaped as content), then wrap the bold run — the `\textbf{` this pass writes is markup and must stay unescaped.
    // ★★ RUN 170 (real machine, run 16 / FEEDBACK16 F16-10 — THE ESCAPER ATE THE FORMULA): the escape set was
    // `[&%$#_{}]`, so a run of `Σ\_\{k=1\}^\{n\}` kept its `^` in TEXT mode. xelatex then stopped at
    // `! Missing $ inserted` (l.29) and the paper never got a PDF (`VMU_PACK_V5R_CORE_PAPER_PDF_FAILED`) — the one stage
    // whose purpose is rendering was the stage that could not render a formula. `^` and `~` are TeX ACTIVE characters; the
    // textcomp-free spellings below are legal in plain text mode and do not need a math shift.
    const TEX_TEXT = { '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}', '\\': '\\textbackslash{}', '<': '\\textless{}', '>': '\\textgreater{}', '|': '\\textbar{}' }
    // ★★★ RUN 217 (run 54 / FEEDBACK53 ①-4, MEASURED): the finished PDF of run 54 was produced `ok:true` and 73 532 bytes,
    // and xelatex's own log said `Missing character: There is no ≥ (U+2265) in font [lmroman10-regular]` FOUR times and the
    // same for `∎` (U+220E) once. The glyphs were simply not in the font, so the PDF read "n  1" where the paper said n ≥ 1,
    // and the receipt said `produced:true` - an answer to "is the file there", never to "did the mathematics print".
    // Unicode math glyphs are now re-spelled as LaTeX math commands (amsmath/amssymb are already in REPAIR_CORE), and the
    // count travels in the receipt so a caller can tell "nothing was repaired" from "five glyphs were".
    // ★★★ TB-2768 (RUN 81 attempt-3, MEASURED): the table below did NOT cover six glyphs that were in the paper body, so
    // xelatex logged 16 `Missing character` lines (ℤ×4, ∀×2, ∣×6, ∩×2, ∪×1, ⋯×1 — all lmroman10-regular) and the PDF
    // silently dropped them while `final` answered `ok:true`. This table is the ONE place a unicode math glyph is
    // re-spelled; extend THIS table, never a second copy (the kernel-side detection below is only a safety net).
    const texMath = { glyphsRepaired: 0, proseCarets: 0, proseUnderscores: 0, inlineMathSpans: 0, displayMathSpans: 0, unpairedDisplayMarkers: 0 }
    const repairInMath = (s) => String(s).replace(MATH_GLYPH_RE, (ch) => { texMath.glyphsRepaired += 1; return TEX_MATH_GLYPH[ch] })
    const repairInText = (s) => String(s).replace(MATH_GLYPH_RE, (ch) => { texMath.glyphsRepaired += 1; return '$' + TEX_MATH_GLYPH[ch] + '$' })
    const escPlain = (s) => String(s).replace(/[&%$#_{}^~\\<>|]/g, (ch) => TEX_TEXT[ch] || ch)
    // ★★ RUN 174 (run 19 FEEDBACK19 F2 — THE FORMULA CAME OUT AS TEXT): RUN 170 stopped xelatex from dying on `^`, but it did
    // so by turning EVERY formula into literal text: run 19's PDF carried `Σ\_\{k=1\}\textasciicircum{}\{n\} k³ = (n(n+1)/2)²`
    // in the prose, i.e. the paper rendered its mathematics as its own escaping. The institute writes inline math the way
    // markdown does — between paired `$` — so a paired span is now passed through VERBATIM (that is what makes `^` a
    // superscript instead of a caret), and everything outside a pair is escaped exactly as before (so a bare `^` in prose
    // still cannot kill the compiler). Unpaired `$` stays escaped: a lone dollar is text, not the start of a formula.
    // ★★★ RUN 224 (run 59 / FEEDBACK58 1.3, MEASURED): a display formula `$$S_{k+1}=...$$` came out of the .tex as
    // `\$$S_{k+1}=...$\$` — the first `$` closed against the second, so a `$$` pair was escaped as two literal dollars and
    // the formula printed as TEXT while every count in `math` stayed at zero (the reader was told "nothing needed repair").
    // `$$ ... $$` is now READ as display math and emitted inside `\[ ... \]`; a `$$` with no closing pair is text and is
    // COUNTED, so the receipt can no longer say "no repair" about a formula that did not typeset.
    const escText = (s) => {
      const raw = String(s)
      let out = ''
      let i = 0
      while (i < raw.length) {
        if (raw.startsWith('$$', i)) {
          const closeD = raw.indexOf('$$', i + 2)
          if (closeD >= 0 && closeD > i + 2) {
            texMath.displayMathSpans += 1
            out += '\\[' + repairInMath(raw.slice(i + 2, closeD)) + '\\]'
            i = closeD + 2
            continue
          }
          texMath.unpairedDisplayMarkers += 1
        }
        const open = raw.indexOf('$', i)
        const countOutside = (chunk) => {
          texMath.proseCarets += (String(chunk).match(/\^/g) || []).length
          texMath.proseUnderscores += (String(chunk).match(/_/g) || []).length
        }
        if (open < 0) { const rest = raw.slice(i); countOutside(rest); out += repairInText(escPlain(rest)); break }
        const close = raw.indexOf('$', open + 1)
        if (close < 0 || close === open + 1) { const rest = raw.slice(i, open + 1); countOutside(rest); out += repairInText(escPlain(rest)); i = open + 1; continue }
        const prose = raw.slice(i, open)
        countOutside(prose)
        texMath.inlineMathSpans += 1
        out += repairInText(escPlain(prose)) + '$' + repairInMath(raw.slice(open + 1, close)) + '$'
        i = close + 1
      }
      return out
    }
    const esc = (s) => escText(String(s)).replace(/\*\*([^*]+)\*\*/g, (m, inner) => '\\textbf{' + inner + '}')
    const body = md.split('\n').map((line) => {
      if (line.startsWith('### ')) return '\\subsection*{' + esc(line.slice(4)) + '}'
      if (line.startsWith('## ')) return '\\section*{' + esc(line.slice(3)) + '}'
      if (line.startsWith('# ')) return '\\section*{' + esc(line.slice(2)) + '}'
      return esc(line)
    }).join('\n')
    const engines = ENGINE_ORDER[state.lang] || ENGINE_ORDER.zh
    const tex = [
      '% generated by vibe-math-vmu/kit/paper.js — engine order for ' + state.lang + ': ' + engines.join(' → '),
      '\\documentclass[11pt]{article}',
      '\\usepackage{' + REPAIR_CORE.join(',') + '}',
      '\\begin{document}',
      body,
      '\\end{document}',
    ].join('\n')
    // ★★★ RUN 217: `produced:true` answered "is the file there" - it never answered "did the mathematics print". The
    // receipt now carries the counts, and the sentence says which of the two situations it is in.
    const escapedFormulaChars = texMath.proseCarets + texMath.proseUnderscores
    const math = {
      glyphsRepaired: texMath.glyphsRepaired,
      proseCarets: texMath.proseCarets,
      proseUnderscores: texMath.proseUnderscores,
      inlineMathSpans: texMath.inlineMathSpans,
      // ★★★ RUN 224 (FEEDBACK58 1.3): a `$$ ... $$` pair is DISPLAY math and is emitted inside `\[ ... \]`; a `$$` with no
      // closing pair is text and is counted, because the old code escaped it and said nothing.
      displayMathSpans: texMath.displayMathSpans,
      unpairedDisplayMarkers: texMath.unpairedDisplayMarkers,
      displayMathMeans: texMath.displayMathSpans === 0
        ? (texMath.unpairedDisplayMarkers === 0
          ? 'no `$$ ... $$` span appears in this paper: every formula here is inline (`$ ... $`), so nothing was emitted as a display block'
          : 'this paper has ' + String(texMath.unpairedDisplayMarkers) + ' `$$` marker(s) with NO closing pair: they are TEXT in the PDF, not formulas - display math needs BOTH pairs, e.g. `$$ ... $$`')
        : String(texMath.displayMathSpans) + ' formula(s) were emitted as DISPLAY math inside `\[ ... \]` (they printed on their own line, not inside a sentence)',
      means: (texMath.glyphsRepaired === 0 && escapedFormulaChars === 0 && texMath.unpairedDisplayMarkers === 0)
        ? 'every formula glyph in this paper is inside a paired `$ … $` span or plain text the font has: no unicode math glyph needed re-spelling and no caret/underscore was escaped into literal text'
        : 'this paper needed repair before LaTeX could print it: ' + String(texMath.glyphsRepaired) + ' unicode math glyph(s) were re-spelled as LaTeX math commands (without this, xelatex logs "Missing character" and the PDF silently drops them - run 54 lost 4×≥ and 1×∎ that way), and ' + String(escapedFormulaChars) + ' caret/underscore character(s) OUTSIDE a paired `$ … $` span were escaped into LITERAL TEXT - any formula written that way READS AS TEXT in the PDF instead of as mathematics. Write inline math between paired dollar signs, e.g. `Σ_{i=1}^{n}` becomes a real sum only inside such a span',
    }
    return { tex, math }
  }

  /** The .tex source alone (unchanged contract for callers that only want the text). */
  function PaperTex({ target } = {}) { return PaperTexBody({ target }).tex }

  /** ⑨ the four artefacts. Missing is NAMED; the PDF is the one this kernel cannot make (no LaTeX executor). */
  function PaperArtifacts({ target } = {}) {
    const found = readState(target)
    // ★★ RUN 161 (FEEDBACK8 item 5.2): the four artefact rows are titled `v5r-paper|<the paper's OWN target>|md` …, and
    // this view built those titles from the CALLER's spelling. Measured on run 9: `final` was called with the paper's id
    // while the state's target is the title, so all four rows looked missing in the same receipt that carried a produced
    // 97 KB PDF. The canonical target comes from the state row, never from the argument.
    const canon = found && found.state && found.state.target !== undefined && found.state.target !== null && str(found.state.target) !== ''
      ? str(found.state.target)
      : str(target)
    const present = {}
    for (const name of PAPER_ARTIFACTS) {
      // EVERY artefact — including `meta` — is its own record: the state row is the flow, not the fourth artefact.
      present[name] = !!found && !!rowByTitle(recordName(canon, name))
    }
    const missing = PAPER_ARTIFACTS.filter((n) => present[n] !== true)
    // ★★★ AN ARTEFACT INVENTORY IS NOT AN ERROR REPORT. This branch used to carry `code: PDF_NEEDS_KERNEL` and a `why` that
    // ASSERTED "this kernel has no xelatex/pdflatex/latexmk face (measured: kernel/ has no such spawn caller)" - a one-time
    // measurement hardcoded into a string, about something decided at RENDER time. Measured on a full live run: `env probe` FOUND
    // xelatex, the agent rendered, got a PDF code it could not interpret, and could not tell whether the engine was missing or the
    // COMPILE had failed (item #23). The ambiguity was manufactured here.
    // ★ So this view reports only what is in the archive: `produced: false`. It deliberately carries NO code - a code names a
    // FAILURE, and "the pdf is not written yet" is not a failure. Only render() can name PDF_NEEDS_KERNEL (it looked and found no
    // engine) versus PDF_FAILED (an engine ran and failed).
    const pdf = missing.includes('pdf')
      ? { missing: 'pdf', produced: false,
        why: 'the pdf artefact is not in the archive yet. Whether a LaTeX executor EXISTS is decided by render(): it names PDF_NEEDS_KERNEL when it finds no engine and PDF_FAILED when an engine runs and fails. `env probe` reports what the host has; this view reports what the archive holds, and it carries no error code because a missing artefact is not an error.' }
      : null
    return { ok: missing.length === 0, target: canon, requestedTarget: str(target), present, missing, complete: missing.length === 0, pdf,
      // ★★ RUN 161 (FEEDBACK8 item 5.2): say what a "missing" name MEANS. These are ARCHIVE ROWS (each artefact is its own
      // record), not capabilities: an absent row says the writing activity has not run, not that the text or PDF cannot be
      // made (a produced PDF in the same receipt is the proof it was).
      missingMeans: missing.length === 0
        ? 'all four ARCHIVE rows are present: each artefact is its own record (v5r-paper|<target>|md|tex|meta|pdf), not a file in the flow state'
        : 'these are the ARCHIVE ROWS that are absent (' + missing.join(', ') + '): each artefact is written by render()/compile(), so an absent row means that write has not run yet — it is NOT a statement about whether the text/PDF can be produced',
      note: missing.length === 0 ? 'all four artefacts are present' : 'INCOMPLETE: ' + missing.join(', ') + ' — this receipt does NOT claim completion' }
  }

  /** ⑩ render: write md/tex/meta records for the current state (pdf needs the named kernel capability — never faked). */
  function render({ target } = {}) {
    const { state } = requireState(target)
    const md = PaperMd({ target })
    const texBody = PaperTexBody({ target })
    const tex = texBody.tex
    const meta = { id: state.id, target: state.target, status: state.status, round: state.round, editor: state.editor, lang: state.lang, format: state.format, participants: state.participants, warnings: state.warnings, forcedAfterCap: state.forcedAfterCap, forcedAfterCapRound: state.forcedAfterCapRound === undefined ? null : state.forcedAfterCapRound }
    const wrote = {}
    const wantsMd = state.format === 'both' || state.format === 'md'
    const wantsTex = state.format === 'both' || state.format === 'tex'
    if (wantsMd) wrote.md = records.put({ track: TRACK, kind: 'paper-md', title: recordName(state.target, 'md'), body: md, by: author })
    if (wantsTex) wrote.tex = records.put({ track: TRACK, kind: 'paper-tex', title: recordName(state.target, 'tex'), body: tex, by: author })
    wrote.meta = records.put({ track: TRACK, kind: 'paper-meta', title: recordName(state.target, 'meta'), body: JSON.stringify(meta), by: author })
    const artifacts = PaperArtifacts({ target })
    // ★★★ RUN 78 (FEEDBACK78 待定位节 / TB-2734, MEASURED): the render receipt listed the ROW KINDS it wrote
    // (`wrote: ["md","tex","meta"]`) and threw away the ids `records.put` had just returned, so a reader who wanted to
    // check the three rows had to call `read_library {track:"paper"}` and guess which three of them this render made.
    // The ids travel now — taken from THIS call's put results, never re-looked-up afterwards (a list would have to
    // guess between revisions and concurrent renders). `wrote` keeps the kinds: the two questions are different.
    const wroteIds = {}
    for (const kind of Object.keys(wrote)) {
      const row = wrote[kind]
      wroteIds[kind] = row && row.id !== undefined && row.id !== null ? String(row.id) : null
    }
    return { ok: artifacts.complete, target: state.target, wrote: Object.keys(wrote), wroteIds, artifacts, missing: artifacts.missing, pdf: artifacts.pdf,
      // ★★★ RUN 217: what the renderer had to repair, or refused to - see `math.means`.
      math: texBody.math }
  }

  /**
   * ★ ⑪ `paperCompilePdf` — compile through the KERNEL's LaTeX face (`kernel.latex.check`), the same
   * spawn-conditioned shape as Lean: the face owns the process, the engine probing, the timeout and the killable
   * handle; this pack only supplies the source and RECORDS the result as the fourth artefact.
   *
   * Named outcomes, never silence:
   *   · no LaTeX face on this assembly ⇒ `…PAPER_EXECUTOR_MISSING` with a hint that names the host spawn seam;
   *   · the face refused (no engine / timeout / compile error) ⇒ `…PAPER_PDF_FAILED` carrying the face's own code,
   *     the engines it tried and a bounded stderr/stdout tail;
   *   · success ⇒ a `pdf` record is written, so `PaperArtifacts` really sees four artefacts.
   */
  // ★★ RUN 156 (real machine, run 5, finding 6): `start` without a target names the paper after its TITLE, and the title
  // becomes the DIRECTORY name (`Paper/paper-第 4 期…`). xelatex is spawned with `-output-directory=<that dir>`; a path with
  // spaces makes TeX's `putenv` fatally fail (`xelatex.exe: fatal: putenv(...)`), so a legal paper name could make the
  // compiler unreachable. The name stays the ADDRESS (ids and fingerprints are untouched); only the FOLDER is slugged, and
  // the compile receipt reports the folder it really used.
  const folderOf = (name) => {
    const raw = String(name === undefined || name === null ? '' : name)
    const slug = raw.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
    return slug === '' ? 'paper' : slug
  }
  async function compilePdf({ target, engineOrder = null, timeoutMs = null } = {}) {
    const { state } = requireState(target)
    const tex = PaperTex({ target })
    const latexFace = kernel && kernel.latex
    if (!latexFace || typeof latexFace.check !== 'function') {
      throw refuse(CODES.EXECUTOR, 'This assembly has no LaTeX face, so a PDF cannot be compiled (host injected no spawn seam)',
        '需要宿主 spawn 接缝：kernel/index.js 只在 spawn/spawnHandle 存在时创建 kernel.latex；本包不自己起子进程')
    }
    const folder = folderOf(state.id)
    const outDir = state.outDir || (outDirPrefix + folder)
    const request = { source: tex, outDir, sourceName: folder + '.tex' }
    if (Array.isArray(engineOrder) && engineOrder.length > 0) request.engineOrder = engineOrder.slice()
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) request.timeoutMs = Math.floor(timeoutMs)
    const r = await latexFace.check(request)
    if (!r || r.ok !== true) {
      const tail = (s) => String(s === undefined || s === null ? '' : s).slice(-1500)
      const engineList = (r && Array.isArray(r.tried) ? r.tried : []).map((t) => {
        if (t && typeof t === 'object') return [t.engine, t.phase, t.code].filter((x) => x !== undefined && x !== null && x !== '').join(':')
        return String(t)
      }).filter((x) => x !== '')
      // ★ LIVE RUN 133 (F-133b): "the compile failed" without ONE line of what the compiler said is a receipt the caller cannot
      // act on (measured: the agent got PDF_FAILED, could not see stderr, and could not tell a font/package problem from a
      // broken .tex). The face already carries a bounded stderr tail; the RECEIPT did not. So one collapsed line travels in the
      // message itself - bounded, single-line, no paths invented - and the full tail stays on the error for the host.
      const diagOf = (v) => {
        const raw = v === undefined || v === null ? '' : String(v)
        const flat = raw.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10))
          .map((s) => s.trim()).filter((s) => s !== '')
        if (flat.length === 0) return ''
        // Prefer the first line that looks like TeX's own error report; otherwise the LAST line (the summary line).
        const hit = flat.find((s) => s.startsWith('!')) || flat[flat.length - 1]
        return hit.slice(0, 240)
      }
      const triedList = (r && Array.isArray(r.tried) ? r.tried : [])
      const lastWithErr = (() => { for (let i = triedList.length - 1; i >= 0; i -= 1) { const e = triedList[i]; if (e && e.stderr) return e.stderr } return null })()
      const diag = diagOf((r && r.stderr) || lastWithErr || (r && r.stdout) || '')
      const failure = refuse(CODES.PDF_FAILED,
        'LaTeX 编译失败：' + String((r && r.code) || 'unknown') + (r && r.engine ? '（engine=' + r.engine + '）' : '') +
          (engineList.length ? '；已试引擎=' + engineList.join(', ') : '') +
          (diag ? '；编译器说：' + diag : ''),
        // ★★ THE HINT MUST NAME SOMETHING THE READER CAN ACTUALLY SEE. It used to say "把 stderrTail 交给人看", and measured on a
        // full live run the agent could not: the compiler's stderr tail IS attached to this thrown error (see `failure.stderrTail`
        // below), but the TOOL RECEIPT carries only code/message/hint - the host does not relay custom error fields. So the hint
        // pointed at a name that existed on an object the receipt had already flattened away, which is the "looks correct but is
        // unusable" shape this phase keeps removing. It now says what the receipt DOES carry and what the operator can do with it.
        '这不是"论文为假"，只是**没编译出来**：回执这次带了一行编译器原话（在 message 的「编译器说：」之后，已压成单行、上限 240 字符）；完整尾部在【这条错误的 `stderrTail`】上（引擎把话写在 stdout 时，那里放的就是 stdout 的尾部，`tailSource` 说明来源；两者都空时才是真空），宿主回执不转述它 —— 按那句原话修 .tex/换引擎（或把绝对路径写进 `vmu.paper.latexCommand`）后重试，或直接把这条 message 交给人；回执不声称有 pdf')
      // the face's own diagnostics travel ON the error (bounded), so the caller can put them into a receipt
      failure.faceCode = (r && r.code) || null
      failure.tried = (r && Array.isArray(r.tried)) ? r.tried.slice() : []
      // ★ G7 ③: structured engines: [{engine, phase, code}] — bounded, and only the fields a caller can act on.
      failure.triedEngines = (r && Array.isArray(r.tried) ? r.tried : []).slice(0, 12).map((t) => {
        if (t && typeof t === 'object') {
          const entry = {
            engine: t.engine === undefined || t.engine === null ? null : String(t.engine),
            phase: t.phase === undefined || t.phase === null ? null : String(t.phase),
            code: t.code === undefined ? null : t.code,
          }
          // ★ Round 15 (member-reported): the compile-branch `tried` record carries engine/phase but NO code, so the
          // structured list said code:null while the message said VMU_PAPER_LATEX_FAILED. Fall back to the FACE's own
          // code for every entry that actually failed (phase compile, or an engine that was unavailable); a
          // successfully probed engine keeps code:null, which is the explicit "this engine did not error".
          if (entry.code === null && ((entry.phase === 'compile') || (t.available === false))) entry.code = (r && r.code) || null
          return entry
        }
        return { engine: String(t), phase: null, code: (r && r.code) || null }
      })
      failure.stderrTail = tail(r && r.stderr)
      failure.stdoutTail = tail(r && r.stdout)
      // ★★ RUN 152 (real machine, run 2): `xelatex` writes its diagnostics to STDOUT, not stderr, so the receipt came
      // back with `stderrTail:""` while the hint promised the compiler's words were there — the agent had to guess that
      // `stdoutTail` was the field to read. The tail the hint promises is now always non-empty when either stream has
      // text, and `tailSource` says which stream it came from, so the two statements agree.
      if (!failure.stderrTail) {
        failure.stderrTail = failure.stdoutTail
        failure.tailSource = 'stdout'
      } else {
        failure.tailSource = 'stderr'
      }
      failure.signal = (r && r.signal) || null
      // ★★ RUN 158 (run 6 / item 6 + N5): the failure object never carried the directory/source name it TRIED, and the
      // measured refusal was a fatal `putenv` on a non-ASCII directory while the receipt said `outDir:null` — the reader
      // could not see the cause. Both fields travel now. And when the engine writes everything to ONE stream, both tails
      // hold the same text: that is disclosed instead of presenting one diagnosis twice as two.
      failure.tailsIdentical = failure.stderrTail !== '' && failure.stderrTail === failure.stdoutTail
      // ROUND 159 (FEEDBACK6 items 5/7): a reader must not have to know what `tailSource` implies. And the directory is
      // the RESOLVED one the engine was told to write into (`r.outDir`), so it has the same shape as `argv`.
      failure.tailsIdenticalMeans = failure.tailsIdentical
        ? 'the two tails below are the SAME text: the engine wrote everything to one stream, and `tailSource` says which one that was'
        : 'the two tails are different streams: `tailSource` says which one the promised diagnosis came from'
      failure.outDir = (r && r.outDir) || outDir
      failure.sourceName = request.sourceName
      // ★★ RUN 155 (audit of c5d356b9, problem 1 / G10's second half): the FACE carries the exact argv it
      // spawned (`r.argv` — measured: 5 elements, absolute + forward slashes), but this failure object never copied it
      // while BOTH projections downstream read `e.argv` and default to [] — so the receipt said `argv: []` at the very
      // moment a compiler really ran. The argv travels now, and the receipt's own evidence stops lying by omission.
      failure.argv = Array.isArray(r.argv) ? r.argv.slice(0, 16) : []
      throw failure
    }
    const put = records.put({
      track: TRACK, kind: 'paper-pdf', title: recordName(state.target, 'pdf'),
      // ★★★ RUN 2691 (TB-2691 / F75-15): `pdfBytes` and `pdfSha256` are written from ONE reading of ONE file (`r` is the
      // latex seam's success return, which counted and hashed the same buffer). A row that carries only a byte count
      // cannot prove the disk file is the compiled file — run 75's verifier could compute sha256(disk)=591d23a6… while
      // the archive row carried only its OWN body fingerprint, so the check ended ARITHMETIC-BLOCKED.
      // ★★★ TB-2768 (RUN 81 attempt-3): the same row also records the GLYPH verdict, so a later `status` read can answer
      // "did the PDF keep the mathematics" without re-compiling.
      body: JSON.stringify({ pdfPath: r.pdfPath, pdfBytes: r.pdfBytes, pdfSha256: r.pdfSha256 === undefined ? null : r.pdfSha256, engine: r.engine, tried: r.tried, argv: r.argv, elapsedMs: r.elapsedMs, timeoutMs: r.timeoutMs,
        glyphLossDetected: r.glyphLossDetected === true,
        missingCharacterCount: r.missingCharacterCount === undefined ? null : r.missingCharacterCount,
        glyphsUnrepaired: Array.isArray(r.glyphsUnrepaired) ? r.glyphsUnrepaired : [],
        glyphLossCode: r.glyphLossCode === undefined ? null : r.glyphLossCode,
        glyphLossMeans: r.glyphLossMeans === undefined ? null : r.glyphLossMeans,
        glyphLossHint: r.glyphLossHint === undefined ? null : r.glyphLossHint,
        logPath: r.logPath === undefined ? null : r.logPath, logRead: r.logRead === true }),
      settled: true, by: author,
    })
    return { ok: true, target: state.target, engine: r.engine, pdfPath: r.pdfPath, pdfBytes: r.pdfBytes, pdfSha256: r.pdfSha256 === undefined ? null : r.pdfSha256,
      // ★★ RUN 154 (G10): run 4 verified the fix from xelatex's own log because the receipt did not carry the argv that
      // proves "absolute + forward slashes". The successful compile now returns the same argv the failure path always did.
      // ★★ RUN 158: the source name reported on success MUST be the one the request carried (folder + '.tex'); the
      // old line printed `state.id + '.tex'`, so a minted id and the folder disagreed in the same receipt.
      argv: Array.isArray(r.argv) ? r.argv.slice(0, 16) : [], outDir: r.outDir || null, sourceName: folder + '.tex',
      tried: r.tried, elapsedMs: r.elapsedMs, recordId: put && put.id,
      // ★★★ TB-2768: the GLYPH verdict the kernel read from the engine log travels with the compile receipt ("a PDF
      // exists" and "the mathematics printed" are two readings). `glyphLossDetected` is at THIS level too, so it is
      // never buried under `math` alone.
      glyphLossDetected: r.glyphLossDetected === true,
      missingCharacterCount: r.missingCharacterCount === undefined ? null : r.missingCharacterCount,
      glyphsUnrepaired: Array.isArray(r.glyphsUnrepaired) ? r.glyphsUnrepaired : [],
      glyphLossCode: r.glyphLossCode === undefined ? null : r.glyphLossCode,
      glyphLossMeans: r.glyphLossMeans === undefined ? null : r.glyphLossMeans,
      glyphLossHint: r.glyphLossHint === undefined ? null : r.glyphLossHint,
      logPath: r.logPath === undefined ? null : r.logPath,
      logRead: r.logRead === true,
      ...(r.logReadWhy === undefined ? {} : { logReadWhy: r.logReadWhy }),
      // ★★★ RUN 217: the same repair counts travel with the compile receipt, so "PDF produced" and "formulas printed" are
      // two readings instead of one optimistic `ok`.
      math: PaperTexBody({ target }).math,
      artifacts: PaperArtifacts({ target }), missing: PaperArtifacts({ target }).missing }
  }

  // ★ F4: `recordFinal` renders THROUGH this object (not through a lexical copy), so a pack that wraps `render` to add a
  // gate sees the finalising path too. Declared before the return so both definitions share one binding.
  let api = null
  api = { start, recordPart, recordReview, advance, pass, recordFinal, PaperMd, PaperMdRaw: rawMd, PaperTex, PaperArtifacts, render, compilePdf,
    recordConsult, consultState,
    sections: () => SECTIONS.slice(), state: (target) => readState(target),
    // ★★ RUN 156 (real machine, run 5 / N2): the refusal for a target-less `status` promised `status` with no target
    // "lists the papers that exist" - and it did not. The flow keeps its ONE list helper private, so the face had no way
    // to honour the promise; expose it rather than soften the sentence.
    papers: () => listPaper(),
    // ★★ RUN 176 (run 21 A2): `records.list` rows carry METADATA ONLY, so a face that parsed `row.body` to answer "was
    // this paper compiled?" always answered no. The ledger read opens each candidate row, and it is exported here so the
    // tool face can ask this ONE reader instead of repeating an answer that has already been wrong once.
    compiledPdfRow: (state) => compiledPdfRow(state),
    // ★★ RUN 172 (FEEDBACK17 P3-16): the status face must be able to say "this name is not gone, it is in the TRASH" — the
    // same lookup `start` uses to refuse a reused name, so the two doors cannot disagree about one fact.
    // ★★★ TB-2713: the status door must print the SAME object the advance door prints. It asks this reader (which owns
    // the one arithmetic) instead of recomputing anything, so "advance covered == status covered" is true by construction.
    perRoundReviewCoverage: (target) => {
      const found = readState(target)
      return found && found.state ? perRoundReviewCoverageOfState(found.state) : null
    },
    trashLookup }
  return api
}

export default createPaperFlow
