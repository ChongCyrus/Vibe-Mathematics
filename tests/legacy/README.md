# tests/legacy/ — the archived presets' behaviour suites

These are the behaviour suites of the five ARCHIVED presets (`v2`, `v3`, `v4`, `v5`, and the archived copy of
`v5r`). They are not maintained: the product line is `vibe-math-vmu` plus the `v5r` pack under
`vibe-math-vmu/packs/v5r/`. They stay in the repository because they are the executable record of what those presets
DID, and some live gates still read that record (the math-computation parity gate pins the archived copy of the shared
contract; the package-membership audit ships these files).

## How they run

- **Not part of the default gate.** `node tests/run-tests.mjs` skips this directory and prints how many jobs it
  skipped (58 = 54 suites + 4 variant jobs).
- **`GATE_LEGACY=1 node tests/run-tests.mjs`** includes them (789 jobs instead of 731). The runner applies the same
  per-suite timeouts and duration weights as before the move: those tables are keyed by the suite's own NAME
  (`baseOf`), not by its path, so an archived job keeps its timeout and its mutant family.
- **One suite:** `node tests/legacy/<file>`.

### If you run one by hand, pin the engine probe first

Several archived suites assert the "no LaTeX engine installed" branch. On a machine that HAS TeX Live they cannot
hold unless the engine discovery roots are pointed at an empty directory — which is exactly what the gate does for
these presets (`tests/run-tests.mjs` exports `V2_TEX_ROOTS_SANDBOX`, `V3_TEX_ROOTS_SANDBOX`,
`V4_TEX_ROOTS_SANDBOX`, `V5_TEX_ROOTS_SANDBOX` as one empty temp dir before spawning every job). To get the same
conditions by hand:

```sh
SB=$(mktemp -d)
V2_TEX_ROOTS_SANDBOX=$SB V3_TEX_ROOTS_SANDBOX=$SB V4_TEX_ROOTS_SANDBOX=$SB V5_TEX_ROOTS_SANDBOX=$SB \
  node tests/legacy/v4-final-paper.test.mjs
```

Without that, `v4-final-paper.test.mjs`, `selfdrive-v5.mjs`, `v3-fix-probes.test.mjs` and
`v2-fix-probes.mutants.mjs` report red for a reason that is about the host, not about the code — the mechanism to
pin the probe already exists, so this is a "how to invoke", not a known defect.

## What must stay true

- The directory IS the list: there is no manifest file. A suite is archived by living here.
- No archived suite may ALSO exist at `tests/` root (two copies = two sources of truth). `tests/audit-legacy-scope.test.mjs`
  enforces this, plus that the runner discovers this directory and that the two job counts differ by exactly this set.
- Anything else that reddens here is a real finding: report it by name.
