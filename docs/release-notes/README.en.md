# dsh-vibe-math — release history (English index)

English index of the release history, one line per version. **Release notes before 2.7.0 exist in Chinese
only**; from 2.7.0 onward every release ships a bilingual pair (`RELEASE-NOTES-<version>.md` in Chinese and
`RELEASE-NOTES-<version>.en.md` in English). The structure of those notes is defined by
[`TEMPLATE.md`](./TEMPLATE.md), and each Chinese file is the authoritative source for its version. The
Chinese counterpart of this index is [`README.md`](./README.md) (中文索引).

| Version | Key change | Notes |
|---|---|---|
| 2.8.4 | Patch: v5's **meeting watchdog** no longer abandons a meeting while an ASKED member is still in flight (exempt within the soft bound; the 3× hard bound still closes it), so ordinary speeches return to the ordinary sections and "late notes" become an insurance policy again — before the fix one real run showed **1067** late notes and **863** refused finalisations. | [中文](./RELEASE-NOTES-2.8.4.md) · [English](./RELEASE-NOTES-2.8.4.en.md) |
| 2.8.3 | Patch: a speech arriving **after the meeting closed** is no longer dropped silently (it becomes a named "late note" in the minutes, which stay append-only); an office finalisation refused after a `force` restart now **explains why** (`restarted: true` + `forceReason`, stating that the counters restarted with the new paper and that a fresh consultation is required); the docs now state "`force` = a new paper". | [中文](./RELEASE-NOTES-2.8.3.md) · [English](./RELEASE-NOTES-2.8.3.en.md) |
| 2.8.2 | Patch: an explicit `paperLatexCommand` is now probed **alone**, so `triedPaths` no longer reports impossible paths of the form "known TeX root + absolute path"; v5's delivered `paper.md` / `paper.tex` now also **each state** the compile outcome (no engine detected / compilation failed), exactly once and without duplication on re-entry — matching v4 since 2.8.1. Both have real-host reproductions and named-red guards. | [中文](./RELEASE-NOTES-2.8.2.md) · [English](./RELEASE-NOTES-2.8.2.en.md) |
| 2.8.1 | Patch: v4's delivered `paper.md` and `paper.tex` now each state the compile outcome (no engine detected → tex+md only, or PDF compilation failed with tex/md kept), **exactly once** and idempotently — resolving known limitation #3 of the 2.8.0 notes; added `scripts/release-check.mjs`, which runs the pre-release checks as one command (version triple, section order of both notes, manifest registration, declared-but-missing = 0, repository-only files not shipped, no CRLF in the package). | [中文](./RELEASE-NOTES-2.8.1.md) · [English](./RELEASE-NOTES-2.8.1.en.md) |
| 2.8.0 | Feature: an explicit `paperLatexCommand` now means "use only this" (v4/v5 no longer fall back silently), the missing-engine warning is actionable and `triedPaths` is recorded, and all four presets share one byte-identical missing-engine guidance block; the test gate is steadier (default concurrency 2, stale scratch swept at start-up, read-only warning for suspected leftover processes); repository line endings are unified on LF (byte-reproducible npm package). | [中文](./RELEASE-NOTES-2.8.0.md) · [English](./RELEASE-NOTES-2.8.0.en.md) |
| 2.7.3 | Patch: the v5 mailbox acknowledges **only after a successful send** (unacknowledged mail is no longer lost), round numbering is correct on founding and on resume, a failed required paper-artifact write is named once with an idempotent refill, a refused task CAS leaves no trace, the member path contract and v4's Lean library-index write failure are named; eight stale "ack first" passages were corrected and a prose↔code pairing guard now prevents them from returning. | [中文](./RELEASE-NOTES-2.7.3.md) · [English](./RELEASE-NOTES-2.7.3.en.md) |
| 2.7.2 | Patch: completes engine discovery and evidence on real hosts (engines installed but not on `PATH` are found, no unrunnable install command, `probe` names the absent engines, complete timeout evidence, the constraint policy is stated, archive identity and participant-set semantics are checkable). | [中文](./RELEASE-NOTES-2.7.2.md) · [English](./RELEASE-NOTES-2.7.2.en.md) |
| 2.7.1 | Patch: honesty about substitutions, install-policy fixes, and seven defects found by the first real end-to-end run (probe echo, bundled-runtime discovery, `cli` precheck, `mode:'code'`, real versions, metacharacter-free probe argv, fresh-workspace cwd). | [中文](./RELEASE-NOTES-2.7.1.md) · [English](./RELEASE-NOTES-2.7.1.en.md) |
| 2.7.0 | Added Lean **incremental** formal verification (async compile + `import` reuse) and the **`math_computation`** tool for all four presets. | [中文](./RELEASE-NOTES-2.7.0.md) · [English](./RELEASE-NOTES-2.7.0.en.md) |
| 2.6.0 | Added the **final paper**: each preset writes a paper automatically when the run closes. | [中文](./RELEASE-NOTES-2.6.0.md) |
| 2.5.0 | Post-audit fixes; no breaking changes to prompts, tool surface, declarations or data formats. | [中文](./RELEASE-NOTES-2.5.0.md) |
| 2.4.1 | Fixes and compliance: prompt/tool/default values untouched (one wording change in v2), same DSH window. | [中文](./RELEASE-NOTES-2.4.1.md) |
| 2.4.0 | **DSH 0.2.0 adaptation**: fixed "four presets installed but invisible" plus three host-specific defects. | [中文](./RELEASE-NOTES-2.4.0.md) |
| 2.3.16 | Completed the English documentation and the English architecture diagrams. | [中文](./RELEASE-NOTES-2.3.16.md) |
| 2.3.15 | Added an English README with a language switch; re-exported high-resolution architecture PNGs. | [中文](./RELEASE-NOTES-2.3.15.md) |
| 2.3.14 | Upgrade-command fix; the installer now speaks up on a downgrade; counting corrected. | [中文](./RELEASE-NOTES-2.3.14.md) |
| 2.3.13 | Installer replaces the whole preset directory when the version changes (back up hand edits first). | [中文](./RELEASE-NOTES-2.3.13.md) |
| 2.3.12 | Installer decides by `engines.dsh`; no broken images on the npm page; README cleanup. | [中文](./RELEASE-NOTES-2.3.12.md) |
| 2.3.11 | Fixed a 2.3.10 packaging error: the market guard is repository-level and must not ship in the package. | [中文](./RELEASE-NOTES-2.3.11.md) |
| 2.3.10 | Plugin-market presentation image plus the DSH version-dependency declaration (with an anti-regression guard). | [中文](./RELEASE-NOTES-2.3.10.md) |
| 2.3.9 | Redrew the v4 architecture diagram as a dependency-free SVG and showed it in the README. | [中文](./RELEASE-NOTES-2.3.9.md) |
| 2.3.8 | Documentation only: the 2.3.6/2.3.7 conclusions written into the contract and the audit checklist. | [中文](./RELEASE-NOTES-2.3.8.md) |
| 2.3.7 | Authoritative anchors must be self-consistent: a hand-edited state file must not hijack the id mapping. | [中文](./RELEASE-NOTES-2.3.7.md) |
| 2.3.6 | v2 id-resolution ambiguity: a single `defect` line could retract **another object's** proof. | [中文](./RELEASE-NOTES-2.3.6.md) |
| 2.3.5 | The same comment/string-scanner defect class in `audit-v5-integrity.mjs` (a latent blind spot) plus parse-level self-checks. | [中文](./RELEASE-NOTES-2.3.5.md) |
| 2.3.4 | Closed the last blind spot of the audit guard (keyword rules inside regex literals) and added parse-level criteria. | [中文](./RELEASE-NOTES-2.3.4.md) |
| 2.3.3 | Confirmation round: a `used` receipt could retract an established proof (v2); contract wording corrected; guards hardened. | [中文](./RELEASE-NOTES-2.3.3.md) |
| 2.3.2 | Deep audit of all four presets: three high-severity gate defects, unified retraction semantics, deterministic corpora. | [中文](./RELEASE-NOTES-2.3.2.md) |
| 2.3.1 | Prompt/interaction fixes: a faithfulness defect is no longer recorded as "the proposition is false". | [中文](./RELEASE-NOTES-2.3.1.md) |
| 2.3.0 | Added one configurable Lean formal-verification parameter (and its supporting machinery) to all four presets. | [中文](./RELEASE-NOTES-2.3.0.md) |
| 2.2.2 | Added the v5 architecture diagram and the v5 README section; fixed real defects the drawing exposed. | [中文](./RELEASE-NOTES-2.2.2.md) |
| 2.2.1 | Shipped the "comprehensive check" checklist as a packaged mandatory procedure (a deliverable only; no code change). | [中文](./RELEASE-NOTES-2.2.1.md) |
| 2.2.0 | Fixed prompt identity confusion in v5 and added a prompt-integrity baseline (v5 only). | [中文](./RELEASE-NOTES-2.2.0.md) |
| 2.1.0 | Introduced the fifth architecture, **`vibe-math-v5`** (the research-institute preset), alongside v2/v3/v4. | [中文](./RELEASE-NOTES-2.1.0.md) |
| 2.0.22 | Host-compatibility fixes and data-safety hardening (target host DSH 0.1.5-rc.2). | [中文](./RELEASE-NOTES-2.0.22.md) |

## Notes on this index

- **Pre-2.7.0 entries have no English version.** They are not machine-translated; the one-line description
  above is the English summary of each Chinese file. Read the linked Chinese file for details.
- **2.7.0, 2.7.1 and 2.7.2 are fully bilingual**; from the next release onward, every release ships both languages
  and updates this index.
- **Version numbering**: patch releases contain fixes and additive response fields; feature releases add
  capabilities. The maintainer decides the number; the notes themselves state which kind of release it is.
