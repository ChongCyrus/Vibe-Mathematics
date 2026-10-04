# dsh-vibe-math 2.8.2 — Release Notes

> Previous release: 2.8.1. This is a **patch release** fixing two v5 issues around diagnostics and deliverables: `triedPaths` no longer reports **impossible paths**, and v5's delivered `paper.md` / `paper.tex` now state "no engine detected / compilation failed" (2.8.1 did this for v4 only). Parameter names and defaults, data formats and the directory layout are **unchanged**, the DSH support window is unchanged, and **no migration is needed**.

## Overview

- An explicit `paperLatexCommand` is now probed **alone**: `compile.triedPaths` in `paper.meta.json` no longer contains impossible paths of the form "known TeX root + the absolute path you supplied".
- v5's delivered `paper.md` and `paper.tex` now **each state** the compile outcome (no engine detected → tex+md only; compilation failed → tex/md kept), **exactly once** and idempotently on re-entry, matching what v4 has done since 2.8.1.
- Nothing else changed: with TeX in a non-standard location, keep pointing `paperLatexCommand` at an absolute path.

## Added

- None. (Patch release: no new parameters, fields or tools.)

## Changed

- v5's `paper.md` / `paper.tex` carry one extra outcome line (in the language of `paperLanguage`). Apart from that line, the paper's section order, fixed wording and other fields are unchanged.

## Fixed

- Symptom: after setting `paperLatexCommand` to an **absolute** path, `compile.triedPaths` in `paper.meta.json` contained impossible paths such as `…\MiKTeX\miktex\bin\x64\Z:/no/such/xelatex.exe` — and `triedPaths` is precisely the "where did it look" field, so it misled the reader. Cause: the explicit value was treated as a **command name** and joined onto every known install root. It is now probed **alone**, so `triedPaths` records only candidates that were really probed. Measured on a real host (reproduced with a build pinned to 2.8.1): bogus path → `status="not-detected"`, `triedPaths=["Z:/…"]`; real engine → `status="compiled"`, `paper.pdf` 150,044 bytes. Guards: `tests/e2e-v5-round2.test.mjs` (`★ [task-17/v5]`), `tests/v5-institute-fixes.mutants.mjs`.
- Symptom: v5's delivered `paper.md` / `paper.tex` did **not** say why no PDF was produced (only the `compile` metadata and the log did). Cause: the paper body is composed **before** compilation. Finalisation now writes the outcome into the deliverables **after** compiling (a bullet at the end of `paper.md`; a `%` comment before `\end{document}` in `paper.tex`), **once each** and without duplication on re-entry. Guards: `tests/e2e-v5-round2.test.mjs` (`★ [task-18/v5]`), `tests/v5-institute-fixes.mutants.mjs` (**16/16** named reds).

## Compatibility & Migration

- Breaking changes: **none**.
- Additive only: one outcome line inside the deliverables (v5 only).
- Migration: none needed; existing `paper.meta.json` files remain readable.
- The DSH support window is unchanged (see `engines.dsh` in `package.json`).

## Known Limitations

- **TeX installed in a non-standard location is still not auto-discovered**: the default probe covers PATH and the documented common install roots; use an absolute path in `paperLatexCommand` otherwise.
- The shipped suites **do not cover host-level behaviour** (for example "the caller is dropped after an interrupt"); that needs a real host.
- **A root-agent question blocks the whole institute** (operational note, product unchanged): nothing else proceeds until the answer arrives — state the problem and acceptance criteria up front for unattended runs. See [`slv-playbook.md`](./slv-playbook.md) §5.
- On machines without Lean / LaTeX, the related suites **skip loudly** rather than passing silently.

## Verification

- `node tests/run-tests.mjs` — all green (**106** items: 44 suites + 62 probes).
- `node scripts/release-check.mjs` — exits 0 (version triple, section order of both notes, `files[]` registration, no CRLF in the package); after publishing, `node scripts/release-check.mjs --registry` also compares the registry shasum with the local tarball.
- The two fixes in this release: `node tests/e2e-v5-round2.test.mjs` (`★ [task-17/v5]`, `★ [task-18/v5]`) and `node tests/v5-institute-fixes.mutants.mjs` (**16/16** named reds).
- Real-host re-check recipe: install the exact published version (`-Pin <version>`) and run a **trimmed** paper task (no research) — about **8 minutes** — then inspect the `compile` block and whether `paper.pdf` exists.

## Dependencies

- No new runtime dependencies; the DSH support window is unchanged.
