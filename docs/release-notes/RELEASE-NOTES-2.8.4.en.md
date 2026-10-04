# dsh-vibe-math 2.8.4 — Release Notes

> Previous release: 2.8.3. This is a **patch release**: it fixes v5's **meeting watchdog**, which used to abandon a meeting while an ASKED member was still working — turning ordinary speeches into "late notes" and making `paperEditor="office"` finalisations fail again and again. Parameter names and defaults, data formats and the directory layout are **unchanged**, the DSH support window is unchanged, and **no migration is needed**.

## Overview

- A meeting is **no longer** abandoned before an ASKED member still in flight hands its speech in: such members may hold the meeting open up to **3×** the stall budget, after which the hard bound still closes it (a genuinely wedged turn must not wedge the whole meeting).
- The practical effect is that **ordinary speeches land in the ordinary sections again**: one real run before the fix showed **1067** "late notes" and **863** refused finalisations; with the fix, meetings actually collect their speakers and the "late note" path goes back to being an **insurance policy** rather than the norm.
- The `paperEditor="office"` gate therefore becomes satisfiable in practice (it requires at least one office message and one **recorded** meeting for this paper).
- The documentation now states when a meeting is abandoned, how the abandonment is named, and what happens to speeches that arrive **after** it.

## Added

- None. (Patch release: no new parameters, fields or tools.)

## Changed

- Meeting stall decision: within the soft bound (`2 × activityTimeoutMs`, default 240 s) the meeting is kept open as long as an **asked member is still in flight**; past the **3×** hard bound (default 720 s) it is still abandoned.
- `docs/final-paper.md` §7 now documents "when a meeting is abandoned" (soft/hard bounds and their relation to the "late note" path).

## Fixed

- Symptom: after members (including the **convener**) spoke in a meeting, the minutes only gained "late note" entries — one real run reached **1067** of them, and `paperEditor="office"` finalisations were refused by `V5_PAPER_CONSULT_REQUIRED` **863** times. Cause: the stall check measured only the time since the last INPUT and **ignored whether an asked member was still busy**; a member's turn on a real host frequently outlives the 240 s budget, so the meeting was abandoned by the watchdog and later speeches could only take the late-note path. Members that were asked and are still busy now hold the meeting open until the hard bound (3× the budget), so ordinary speeches return to the ordinary sections. Guards: `tests/e2e-v5-round2.test.mjs` (`★ [real1004-stall]`, a **source-level invariant** — this branch cannot be triggered deterministically inside the shipped suites, so the criterion is "source invariant + real-host re-test"), `tests/v5-institute-fixes.mutants.mjs` (**19/19** named reds).

## Compatibility & Migration

- Breaking changes: **none**.
- Additive only: no new fields (behaviour and documentation only).
- Migration: none needed.
- The DSH support window is unchanged (see `engines.dsh` in `package.json`).

## Known Limitations

- The **real-host** behaviour of the meeting watchdog can only be confirmed by a real-host re-test (inside the shipped suites the heartbeat delay is not controllable, so the branch cannot be triggered deterministically; the guard is therefore a **source-level invariant**, as stated in the test comments and the commit message).
- **TeX installed in a non-standard location is still not auto-discovered**: the default probe covers PATH and the documented common install roots.
- The shipped suites **do not cover host-level behaviour** (for example "the caller is dropped after an interrupt").
- **A root-agent question blocks the whole institute** (operational note, product unchanged): state the problem and acceptance criteria up front for unattended runs. See [`slv-playbook.md`](./slv-playbook.md) §5.

## Verification

- `node tests/run-tests.mjs` — all green (**106** items: 44 suites + 62 probes).
- `node scripts/release-check.mjs` — exits 0; after publishing, add `--registry` to compare the registry shasum with the local tarball.
- This release's fix: `node tests/e2e-v5-round2.test.mjs` (`★ [real1004-stall]`, measured `passed=436 failed=0`) and `node tests/v5-institute-fixes.mutants.mjs` (**19/19** named reds).
- Real-host re-check recipe: install the exact published version (`-Pin <version>`) and run a **trimmed** meeting + paper task (no research), then count "late notes" (1067 before the fix) and refused finalisations (863 before the fix) — both should drop sharply.

## Dependencies

- No new runtime dependencies; the DSH support window is unchanged.
