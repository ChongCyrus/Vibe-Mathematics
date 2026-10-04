# dsh-vibe-math 2.8.0 — Release Notes

> Previous release: 2.7.3. This is a **feature release**: all four presets now ship explicit guidance for "no LaTeX engine was detected", and the explicit-engine semantics were corrected (v4/v5 used to silently fall back to a different engine). Parameter names and defaults and the directory layout are **unchanged**, the data format is **additive only**, the DSH support window is unchanged, and **no migration is needed**.

## Overview

- An explicit `paperLatexCommand` now means "**use only this**": if it cannot be resolved the run degrades as "not detected" instead of quietly switching engines. All four presets and the documentation now agree.
- The named warning for a missing engine is **actionable**: it says PATH and the documented common TeX roots were probed, and how to pin an absolute path.
- The four presets tell the agent the **four steps** (bounded probe → write the absolute path into `paperLatexCommand` and re-detect → ask the user once → otherwise degrade as before) and the **three hard boundaries** (never auto-install, never write outside the workspace, never treat "not detected" as a failure).
- Paper metadata records `triedPaths`: which paths this detection actually probed (on success and on failure).
- A "host refused to interrupt" failure now carries an executable next step and is covered by a regression guard.
- People who run the test suites themselves get a steadier gate: lower default concurrency, stale test scratch directories swept at start-up, the roomier drive preferred for temp files, and a read-only warning when a leftover process is suspected.
- Repository line endings are unified on LF: from this version on, the npm package is **byte-reproducible** against the tag.

## Added

- The paper compile metadata (`paper.meta.json`, `compile` section) gains **`triedPaths`** (array of strings: the union of candidate paths probed during this detection).
- All four presets gained a "missing engine guidance" block in their prompts (one canonical text, byte-identical across presets). v5 injects it as `paperHintBlock(lang)`.
- The interrupt tool's failure response gains `next: { kind: 'reason', tool: 'vibe_math_abort', hint }`, matching the other failure diagnostics.
- A shipped test utility, `scripts/clean-temp.mjs`: lists suspected leftover processes (`--ps`, read-only) and sweeps stale test scratch directories (`--dry-run` / `--age-hours=N`).

## Changed

- **Explicit-engine semantics unified**: a non-empty `paperLatexCommand` is used **alone**; if it cannot be resolved then `compile.status = 'not-detected'` and only `paper.tex` and `paper.md` are delivered. v4/v5 used to append that command to the candidate list and **fall back to another engine** when it was unusable; they now match v2/v3 and the existing wording of `docs/final-paper.md`.
- **Wording of the missing-engine warning**: "未检测到 LaTeX 引擎（…）：只产出 tex+md…**已探测 PATH 与文档化的常见 TeX 根；可用 `paperLatexCommand` 指定绝对路径。**"
- **Test-gate defaults** (affects only people running the suites): default concurrency `min(4, cpus)` → **`min(2, cpus)`**; at start-up, scratch directories older than 6 hours whose name prefix comes from the suites themselves are swept; the temp root prefers `D:\_tmp` (falling back without error when unavailable); a suspected leftover process produces a **read-only** warning and is never terminated automatically. Override with `--concurrency=N`, `--no-temp-hygiene`, `--temp-dry-run`.
- The repository gained `.gitattributes`: text files are always LF (binaries marked explicitly). Previously the working tree mixed CRLF and LF while `npm pack` reads the working tree, so the package could contain CRLF.

## Fixed

- Symptom: setting `paperLatexCommand` to a **non-existent path** still produced a PDF compiled by another engine on the system (users believed the pinned engine was used). It now degrades as "not detected" with an actionable warning. Guards: `tests/v4-final-paper.test.mjs`, `tests/e2e-v5-round2.test.mjs`.
- Symptom: when no engine was detected, the run only said "not detected" and the user could not tell **where it had looked**. `triedPaths` now records the paths actually probed and the warning states the scope. Guards: `tests/v2-fix-probes.test.mjs`, `tests/v3-fix-probes.test.mjs`, `tests/v4-final-paper.test.mjs`, `tests/e2e-v5-round2.test.mjs`.
- Symptom: the "missing engine" guidance was absent or inconsistent across the four presets. All four now carry the same canonical text, with a byte-identity check. Guard: `tests/audit-prompt-invariants.mjs` (invariant I15).
- Regression coverage strengthened (**behaviour unchanged**): the "host refused to interrupt" failure path is now guarded (`VIBE_MATH_INTERRUPT_FAILED` + `next.tool = 'vibe_math_abort'`). Guards: `tests/v2v3-interrupt.mutants.mjs` plus the corresponding assertions in the two math suites.
- Test-infrastructure fix: a suite killed by a timeout cannot clean up after itself, so scratch directories accumulated for weeks (measured: 240k entries at the temp root). The gate now sweeps stale ones at start-up. Guards: `scripts/clean-temp.mjs --self-test`, `tests/temp-hygiene.mutants.mjs`.
- Test-timing fix: a few suites ended before the event they assert on when the gate ran jobs in parallel (green standalone, intermittently red in the gate). Those loops now stop on a wall-clock deadline, wait windows have a floor, and per-suite budgets are set from measurements. Guards: `tests/run-tests.mutants.mjs` (5/5) and the suites' own assertions.

## Compatibility & Migration

- Breaking changes: **none**. Parameter names and defaults and the directory layout are unchanged; `triedPaths` is additive and older `paper.meta.json` files remain readable.
- Behaviour to note: if you previously pointed `paperLatexCommand` at a value that does not resolve and relied on the **fallback** to a working engine, this version degrades as "not detected" instead. That is the correction that matches `docs/final-paper.md`. Leave the parameter empty to get automatic detection.
- Migration: none needed.
- The DSH support window is unchanged (see `engines.dsh` in `package.json`).

## Known Limitations

- **TeX installed in a non-standard location is still not auto-discovered**: the default probe covers PATH and the documented common install roots. If yours lives elsewhere (for example a TeX Live tree at a custom directory under a drive root), set an absolute path in `paperLatexCommand`; on this machine the default probe does not find it.
- The shipped suites **do not cover host-level behaviour**: "the caller is dropped after an interrupt" can only be observed on a real host and is not asserted in-repo.
- One known small wart in v4: the finalisation note for "not detected / compile failed" can be empty (the note is assembled before the compile result is known). It does not affect finalisation or the degrade path, and it is recorded for a fix.
- On machines without Lean / LaTeX, the related suites **skip loudly** rather than passing silently.
- This version did not re-run a full research workflow on a real host; the engine-probe surface was exercised in both "engine present" and "engine absent" states.

## Verification

- `node tests/run-tests.mjs` — all green (**105** items: 44 suites + 61 probes).
- `node scripts/update-doc-counts.mjs --check` — exits 0 (documented derived counts match the repository).
- Cross-preset prompt identity: `node tests/audit-prompt-invariants.mjs` (invariant I15) and `node tests/audit-prompt-invariants.mjs --self-probe` (11/11).
- Explicit-engine semantics: `node tests/v4-final-paper.test.mjs`, `node tests/e2e-v5-round2.test.mjs`, and `node tests/v4-final-paper.mutants.mjs` (2/2 named reds).
- Interrupt-failure diagnostics: `node tests/v2v3-interrupt.mutants.mjs` (2/2 named reds).
- Test-environment guards: `node scripts/clean-temp.mjs --self-test`, `node tests/temp-hygiene.mutants.mjs` (4/4 named reds).
- Packaging consistency: the `npm pack --dry-run` listing matches `package.json#files` (declared but missing = 0), and the packaged text files use LF throughout.

## Dependencies

- No new runtime dependencies; the DSH support window is unchanged.
