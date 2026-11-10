# scripts/sim/redteam — the release gate's red team, in the repo

Twenty-three attacks against `scripts/sim/audit/release-ready.mjs` (the release gate), expressed as data + one runner.

```
node scripts/sim/redteam/run.mjs                  # all 23 vectors
node scripts/sim/redteam/run.mjs --only=A11,A16   # a subset (the roster is still validated)
node scripts/sim/redteam/run.mjs --json           # machine-readable payload at the end of stdout
node scripts/sim/redteam/run.mjs --verbose        # print why every vector got its status
node scripts/sim/redteam/run.mjs --keep           # keep the built fixture tree and print its path
node scripts/sim/redteam/run.mjs --fixtures-dir=<dir>  # judge fixtures from a copied directory (counter-light tests)
```

Exit code is 0 **iff** `masked`, `half`, `leaked`, `error` and `wrong-code` are all zero **and** every vector that ran was
`named` or `neutralized`. A subset (`--only`) exits 0 under the same rule; the full 23-vector count is enforced by the
roster (`fixtures/INDEX.json` vs the files on disk), which refuses by name (`MISSING FIXTURE A15`) instead of running a
quietly smaller suite.

A full run takes ≈35 s on a quiet machine (≈80 s while other lanes are editing the tree, because of the retries below).
`tests/redteam-gate.test.mjs` is the cheap every-run guard: the layer-ownership subset plus two counter-lights.

## Why it lives here

The 23-vector matrix was produced by the 2026-11-09 red team session and used to live only in a scratch directory outside
the repo, where a 3-hour cleanup deletes it — which made the gate's own closure evidence expire. A conclusion whose
evidence reproduces only outside the repo is rehearsed, not proven. Everything this harness needs is committed:

| what | where | notes |
| --- | --- | --- |
| the corpus it attacks | `data/corpus/corpus-<scenario>/receipts.jsonl` | 6 real scenarios, 2 259 086 B / 483 lines, copied verbatim from run `2026-11-09T18-19-38-756Z-6116` |
| the live-field ruler | `data/rich-fields.jsonl` | 67 tools / 284 707 B, built from the leaf paths **present in that same corpus** (no invented field names) |
| the declaration table | `data/fidelity-declared.json` | `{}` — gaps are absorbed by nothing, so an honest report must say `gaps: 0` because it really has none |
| the gate stand-in | `data/stub-gate.mjs` | `process.exit(0)`; the vectors under test are the audit report and the ledger, not `tests/sim-gate.test.mjs` |

Temp directories come from `os.tmpdir()` and are removed in a `finally` (`--keep` opts out). Nothing is written into the
repo; the harness does not produce `run-all-latest.json`-style artifacts.

## The judgement

`masked` is worse than `leaked`: a leaked forgery is at least honest about itself, while a refusal for a reason the
attack did not cause is evidence of nothing.

| status | meaning |
| --- | --- |
| `named` | refused with the code this attack is about, the message names the thing, and every extra code is a declared consequence (with a written reason in the fixture) |
| `neutralized` | the attack cannot be caught because there is nothing false in it (see A8b, A6-blank); the recorded facts must BE the neutralized shape, otherwise `half` |
| `masked` | refused, but not for a reason this vector owns — **or** the vector declared a consequence that fired while its primary did not (`wrong-code`), i.e. the expectation no longer matches the gate |
| `half` | right code, wrong contract: wrong exit, a required name missing from the message, a recorded fact off, a digest sentence printed next to itself |
| `leaked` | the gate returned READY, or recorded the bypass as chosen-and-accepted |
| `wrong-code` | the prediction is stale: only consequences the vector itself declared fired, the predicted code did not |

Fixtures are **constants**: if a vector goes red, the gate (or the ruler it uses) changed. Re-tuning a fixture to make a
red go away is exactly the failure this directory exists to prevent.

## The 23 vectors

`judge` defaults to `code`; `neutralized` and `field` are explained above.

| id | attack | expected |
| --- | --- | --- |
| A1 | a hand-typed `AUDIT.md` with no machine block | `AUDIT_UNVERIFIABLE` |
| A2 | a block that claims `compared: 0` | `AUDIT_FIDELITY_MEASURED_NOTHING` (+ counts-inconsistent, mismatch) |
| A3 | a report carrying another tree's hash | `AUDIT_TREE_CHANGED` |
| A4 | an old `corpusId` with a past `generatedAt` | `AUDIT_CORPUS_STALE` |
| A5 | report lists a P0, ledger says `fixed`, no proof / empty evidence / unrunnable proof (3 variants) | `AUDIT_EVIDENCE_MISSING` |
| A6 | a red report with a placeholder override reason (`--override-reason=同上`), judge `field` | `AUDIT_FIDELITY_MEASURED_NOTHING`, facts must show `override != null` and `overrideRejected: true` |
| A6-blank | the same, with an EMPTY reason | `neutralized` — the empty value parses as an absent flag, so no bypass exists; facts must show `override: null`, `overrideRejected: false` |
| A7 | block claims 7 gaps, recompute finds 0 | `AUDIT_FIDELITY_GAPS`, message names `tool.field`s |
| A8a | a real stamp over a reading off by one `compared` | `AUDIT_FIDELITY_MISMATCH`, message says `recomput…` |
| A8b | a hand-typed block that states the TRUE reading | `neutralized` — claimed and recomputed triples must be equal |
| A9 | prose says PASS, machine block says `verdict: FAIL` | `AUDIT_VERDICT_CONTRADICTION` |
| A10 | a byte changes in a file inside the named layer | `AUDIT_CORPUS_STALE`, message says `changed after the report was written` |
| A10extra | a corpus dir appears in the named layer | `AUDIT_CORPUS_STALE`, message names `extra dirs=[appeared-after-audit]` |
| A11 | legacy stamp (no `corpusFiles`) + default layer appended to; judge must NOT call it stale | `AUDIT_CORPUS_UNMEASURED`, message says `does not name the files it measured` |
| A12 | one listed sha swapped for another scenario's bytes (claimed digest still true) | `AUDIT_CORPUS_STALE`, message names `mismatched=[actions-extra]` |
| A13 | the list omits a dir the layer holds (digest over the full layer) | `AUDIT_CORPUS_STALE`, message says `does not list` |
| A13b | the list omits a dir AND every stamp is self-consistent for the short list | `AUDIT_CORPUS_STALE`, message names `extra dirs=[turns]` |
| A14 | `corpus.dir` names a layer that does not exist | `AUDIT_CORPUS_UNMEASURED`, message names `no-such-layer` |
| A15 | a corpus dir appears in the named layer (report and digest were true for the old set) | `AUDIT_CORPUS_STALE`, message names `extra dirs=[appeared-in-the-named-layer]` |
| A16 | an honest report about an OLD layer while `current-layer.json` names a new one | `AUDIT_CORPUS_NOT_CURRENT`, message says `current layer` |
| A16b | identical bytes in two directories; the report names the copy, the pointer names the other | `AUDIT_CORPUS_NOT_CURRENT` — only directory identity can refuse this |

A16/A16b are what the layer-ownership model added: before it, an honest report about an expired layer passed, because
"the digest is true" and "this is the corpus we are on" are two different questions.

## Known boundaries (and why they are not holes)

* **A6-blank is neutralized, not passed.** `release-ready.mjs` reads flags with
  `flagValue = (name, fallback) => … return hit.slice(name.length + 1) || fallback`, so `--override-reason=` yields the
  fallback (`null`) — identical to not passing the flag. Blanking the reason therefore does not create a bypass: nothing
  is recorded, nothing is rejected, and nothing is bypassed. The vector pins that shape: if a future gate starts
  treating the empty string as a reason, `override` becomes non-null and this reds.
* **A8b is neutralized, not passed.** The forgery states the real reading; a gate that refuses it would be refusing the
  truth. What the vector proves is that a hand-typed block cannot state a FALSE reading and survive.
* **`AUDIT_TREE_CHANGED` retries.** Other lanes commit and edit this same checkout while the suite runs, so a report
  stamped one second ago can be legitimately stale. When that code appears (and is not the expected code, as in A3) the
  vector is rebuilt with a freshly sampled tree, up to six attempts. If the tree never holds still, the run fails with a
  named reason instead of pretending.
* **The corpus is a snapshot.** It is committed to make the evidence portable, not to be regenerated on every run;
  regenerating it would silently re-baseline what "the receipts" means.
