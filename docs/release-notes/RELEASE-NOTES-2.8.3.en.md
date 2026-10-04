# dsh-vibe-math 2.8.3 — Release Notes

> Previous release: 2.8.2. This is a **patch release** fixing two v5 issues around meetings and finalisation: a speech that arrives **after the meeting closed** is no longer dropped silently (it becomes a clearly-marked late note), and an office finalisation refused after a `force` restart now **explains why** (the counters restarted with the new paper, so a fresh consultation is required). Parameter names and defaults, data formats and the directory layout are **unchanged**, the DSH support window is unchanged, and **no migration is needed**.

## Overview

- A member's meeting speech **no longer disappears silently**: even when it arrives **after** the meeting closed (the watchdog abandons a stalled meeting; the office may finalise early) it is written into the minutes as a clearly-marked "late note", with one named line in the group chat.
- Meeting minutes are **append-only**: earlier speakers are always preserved.
- A refusal after a `force` restart is now **explainable**: the response carries `restarted: true` plus the `forceReason`, and the message states that the counters restarted with the new paper, that earlier messages/meetings no longer count, and that a fresh consultation is required.
- The documentation now states it plainly: **`force` means a new paper** (both `consult` counters start at 0), so a restart requires a **new** consultation.

## Added

- When `vibe_v5_finalize_paper` is refused for insufficient consultation, the response now carries **`restarted`** (boolean: was this paper started by a `force` restart?).

## Changed

- Meeting minutes gained one kind of entry: `### <member>（会后补记：该发言到达时会议已收束）` — used for speeches that arrive **after** the meeting closed; identical text submitted again is recorded only once.
- The `V5_PAPER_CONSULT_REQUIRED` message appends the reset explanation when `restarted` (**behaviour is unchanged**; it only states the cause).
- `docs/final-paper.md` §7 gained the "`force` = a new paper" rule.

## Fixed

- Symptom: a member's speech — on a real host, the **convener's own** speech — never appeared in the minutes: the header said `- 发言顺序: r-1 → acad` while the body contained only `### r-1`; the paper's `consult.meetings` stayed 0 and finalisation was refused repeatedly. Cause: a member's end-block `input` was only consumed when a meeting was **live**, and a stalled meeting is closed by the watchdog — speeches arriving later had nowhere to go and were **dropped silently**. Such speeches are now appended as "late notes" (named, de-duplicated, appended rather than overwritten). Guards: `tests/e2e-v5-round2.test.mjs` (`★ [real1004-minutes]`), `tests/v5-institute-fixes.mutants.mjs`.
- Symptom: after a `force` restart of the paper, the office's usual finalisation was refused by `V5_PAPER_CONSULT_REQUIRED` with **no hint** that the restart had reset the counters (on a real host: **11** consecutive refusals, leaving the members to infer it). Cause: that semantics existed **only in the code** — neither the docs nor the refusal message said it. The refusal now names the reset and asks for a fresh consultation, and the docs state "`force` = a new paper". Guards: `tests/e2e-v5-round2.test.mjs` (`★ [real1004-consult]`), `tests/v5-institute-fixes.mutants.mjs` (**18/18** named reds).

## Compatibility & Migration

- Breaking changes: **none**.
- Additive only: the `restarted` response field; one new kind of minutes entry.
- Migration: none needed; existing `paper.meta.json` files, meeting minutes and the directory layout are unchanged.
- The DSH support window is unchanged (see `engines.dsh` in `package.json`).

## Known Limitations

- **TeX installed in a non-standard location is still not auto-discovered**: the default probe covers PATH and the documented common install roots; use an absolute path in `paperLatexCommand` otherwise.
- The shipped suites **do not cover host-level behaviour** (for example "the caller is dropped after an interrupt"); that needs a real host.
- **A root-agent question blocks the whole institute** (operational note, product unchanged): nothing else proceeds until the answer arrives — state the problem and acceptance criteria up front for unattended runs. See [`slv-playbook.md`](./slv-playbook.md) §5.
- After a meeting is abandoned by the watchdog, the minutes keep the abandonment marker and **all earlier speeches**; speeches that arrive later land in the "late note" section.

## Verification

- `node tests/run-tests.mjs` — all green (**106** items: 44 suites + 62 probes).
- `node scripts/release-check.mjs` — exits 0 (version triple, section order of both notes, `files[]` registration, no CRLF in the package); after publishing, add `--registry` to compare the registry shasum with the local tarball.
- The two fixes in this release: `node tests/e2e-v5-round2.test.mjs` (`★ [real1004-minutes]`, `★ [real1004-consult]`) and `node tests/v5-institute-fixes.mutants.mjs` (**18/18** named reds).
- Real-host re-check recipe: install the exact published version (`-Pin <version>`) and run a **trimmed** meeting + paper task (no research), then check that the minutes contain both speakers and that a refusal after a `force` restart is named.

## Dependencies

- No new runtime dependencies; the DSH support window is unchanged.
