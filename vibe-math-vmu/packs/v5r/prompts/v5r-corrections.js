/**
 * v5r CORRECTION SECTIONS — the pack's own "this wording is obsolete; the mechanism is X" ledger.
 *
 * WHY THIS FILE EXISTS (F5, Lead ruling this round). The F5 audit found passages whose TEACHING does not match the
 * mechanism: `vibe_v5_tool_help({"tool":…})` (the tool takes `{member}` only), `end_verify`/`formal_proof` (neither
 * name exists), "hand-write a ```json fence every round" (the structured report channel is `vibe_vmu_turn {op:"reply"}`;
 * the fence is the compatibility path), and "m votes" read as a counting rule (it is the QUORUM size; agreement is
 * unanimity via `defaultTally`). The three honest repair routes were:
 *   (a) edit the ORIGINAL `vibe-math-v5r/vibe-math-v5r.js` — the fidelity baseline, and not in any lane's write scope;
 *   (b) edit the GENERATED `v5r-prompts.js`/`v5r-persona.js` — red by construction (`vmu-pack-prompts` byte-compares,
 *       `regen-all --check` overwrites), and the corpus itself is a CAPTURE that the full sweep rewrites;
 *   (c) add a NAMED CORRECTION that supersedes the old wording — what this file does, and what the Lead chose.
 *
 * WHY NOT A `KNOWN_CORRECTIONS` EXEMPTION LIST: that would turn "we deliberately diverge from the baseline" into a
 * permanent, invisible exemption — the same smell as a mechanism with no consumer (red line ④). A correction SECTION is
 * text that the member actually reads, it is measured by a gate of its own, and it can be deleted the day the source
 * wording is fixed. The old text stays where it is (it is evidence of what the original taught); the correction says
 * plainly which of the two to believe, and it sits AFTER every section it corrects (order ≥ 890, after the highest declared section at 820 and inside the pack band [600,899]).
 *
 * HOUSE RULES this file follows:
 *   · each section ≤ 400 characters (a correction that needs a page is a rewrite, and rewrites belong to the source);
 *   · each names BOTH the old wording and the real mechanism (`file:line` for the reader, prose for the member);
 *   · no second copy of the corrected passage — the correction points at the mechanism, it does not restate the old text;
 *   · `source` marks them so a reader can tell authored corrections from transcribed charter and from generated corpus.
 *
 * `tests/vmu-prompt-corrections.test.mjs` asserts: every declared correction exists, each names old + new, each sits at order ≥ 800 and
 * strictly after the highest generated section, each is ≤ 400 chars, and a REAL assembly contains every one.
 */

/** The oldest order a correction may use: generated fixtures occupy 600 + i and the authored/paper/assistant sections run
 *  up to 820 (`v5r-founding-direction`), and a pack may only claim `ORDER_RANGES.pack = [600, 899]`
 *  (kernel/prompt/index.js:24-30) — 900+ is the kernel-reserved `override` band. So 890 is the last free pack band that
 *  is still after EVERYTHING the pack declares. */
export const V5R_CORRECTION_BASE_ORDER = 890

/** The maximum characters one correction may carry (see the house rule above). */
export const V5R_CORRECTION_MAX_CHARS = 400

// ★ ROUND-3 (2026-11-17, Lead ruling): THE FIVE LEGACY LEDGER SECTIONS ARE DELETED. They were read by every seat in
// every prompt (1,067 chars x 35) and all five restated rules that live in their own sections now (release/shape ->
// reply-compact, m -> charter-voting, leaderId -> charter-division, tool_help -> tools-resource). The two facts that
// had no other home (`release` is not a task_update action, `end_verify`/`formal_proof` must not be called) were folded
// into reply-compact BEFORE deletion, and tests/vmu-prompt-corrections asserts the absence + those facts in the assembly.
export const V5R_CORRECTION_SECTIONS = Object.freeze([])

export default V5R_CORRECTION_SECTIONS
