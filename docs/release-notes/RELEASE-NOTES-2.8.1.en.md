# dsh-vibe-math 2.8.1 — Release Notes

> Previous release: 2.8.0. This is a **patch release**: it fixes the "known limitation" that 2.8.0 honestly disclosed — v4's final paper did **not** state that no LaTeX engine was detected, or that PDF compilation failed — and it turns the pre-release checklist into one command. Parameter names and defaults, data formats and the directory layout are **unchanged**, the DSH support window is unchanged, and **no migration is needed**.

## Overview

- v4's delivered `paper.md` and `paper.tex` now **each state the compile outcome**: no engine detected (tex+md only), or PDF compilation failed with tex/md kept.
- The note is written **exactly once** (finalisation can be re-entered, so it is idempotent) and does not change the paper's section structure or any other field.
- Known limitation #3 of the 2.8.0 notes (v4's finalisation note could be empty) is **resolved**.
- Added `scripts/release-check.mjs`: the pre-release checklist as a single command.

## Added

- `scripts/release-check.mjs`: checks the **version triple**, the **section order** of both release notes for the current version, that both are listed in `package.json#files`, that `dsh.compatNote` names the current version, that `npm pack` has **declared-but-missing = 0**, that repository-only files are **not** shipped, and that the packaged text contains **no CRLF**. Switches: `--skip-pack` (static checks only), `--registry` (after publishing: compare the registry `dist.shasum` with the local tarball), `--self-test` (prove the predicates are not vacuous).

## Changed

- v4's paper deliverables carry one extra outcome note (see "Fixed"). Apart from that note, the paper's section order, fixed wording and other fields are unchanged.

## Fixed

- Symptom: after reading `paper.md` / `paper.tex`, a v4 user still could not tell **why no PDF was produced** — only `paper.log.md` had a line. Cause: the paper body is composed **before** compilation, so the two body items that depend on the compile result were **always empty** in the normal flow. Finalisation now writes the outcome into the deliverables **after** compiling: a bullet at the end of `paper.md`, and a comment line (`% …`) inserted before `\end{document}` in `paper.tex`, **once each** (re-entry does not duplicate it). Guards: `tests/v4-final-paper.test.mjs` (`★ [deliverable/v4] … (once each; md=1 tex=1)`), `tests/v4-final-paper.mutants.mjs` (**3/3** named reds: blanking the Chinese note reddens that assertion by name, measured `md=0 tex=0`).
- Release-process defect (tooling): the pre-release checks had to be done by hand and were easy to miss. `scripts/release-check.mjs` now does them in one command, with **4** single-site mutations proving the checker is not vacuous. Guard: `tests/release-check.mutants.mjs` (**4/4** named reds).

## Compatibility & Migration

- Breaking changes: **none**.
- Additive only: one outcome line in the deliverables; one shipped script.
- Migration: none needed; existing `paper.meta.json` files and the directory layout are unchanged.
- The DSH support window is unchanged (see `engines.dsh` in `package.json`).

## Known Limitations

- **TeX installed in a non-standard location is still not auto-discovered**: the default probe covers PATH and the documented common install roots; use an absolute path in `paperLatexCommand` otherwise.
- The shipped suites **do not cover host-level behaviour** (for example "the caller is dropped after an interrupt"); that needs a real host.
- On machines without Lean / LaTeX, the related suites **skip loudly** rather than passing silently.
- This version did not re-run a full research workflow on a real host.

## Verification

- `node tests/run-tests.mjs` — all green (**106** items: 44 suites + 62 probes).
- `node scripts/update-doc-counts.mjs --check` — exits 0 (documented derived counts match the repository).
- `node scripts/release-check.mjs` — exits 0; after publishing, `node scripts/release-check.mjs --registry` also compares the registry shasum with the local tarball byte for byte.
- v4 deliverable note: `node tests/v4-final-paper.test.mjs`, `node tests/v4-final-paper.mutants.mjs` (3/3 named reds).
- The checker itself: `node scripts/release-check.mjs --self-test` (15 checks) and `node tests/release-check.mutants.mjs` (4/4 named reds).

## Dependencies

- No new runtime dependencies; the DSH support window is unchanged.
