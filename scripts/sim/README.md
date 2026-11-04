# scripts/sim — the fidelity simulator

Purpose: exercise the *whole* institute lifecycle **in one process, without an LLM**, and keep
everything a reviewer needs as files (receipts, the exact prompt each seat would have seen, the
filesystem tree after every step). Real runs cost 20–30 minutes and burn tokens; this costs
seconds, so it is where mechanisms are checked and where prompt texts are inspected.

It is not a replacement for the real run: real runs test *model behaviour*, this tests
*mechanism behaviour*. A green corpus proves the machinery answers correctly; it cannot prove a
model will use it.

## Run it

```bash
node scripts/sim/run.mjs --scenario mainline --out D:/_tmp/sim/corpus-mainline
node scripts/sim/audit/receipts.mjs D:/_tmp/sim/corpus-mainline
```

`--scenario` defaults to `mainline`; `--keep` keeps the workspace (default: kept for the last run
so you can look at the tree); `--root` overrides the scratch root.

Adding a scenario is *only* adding a file: `scripts/sim/scenarios/<name>.mjs` exporting an async
function named `<name>` (or `scenario`/`default`). `run.mjs` discovers the directory, so two
authors never edit the same registry.

```js
export const meetings = async (h, { log }) => ({ steps, receipts, highlights, tree })
```

## What a scenario may assume

- `h.boot()` already ran: the real pack `apply()` registered **every** tool through the real host
  path, so receipts are the same objects the real run would see.
- `h.call(name, args, { as })` — `as: { agent: { id: 'r-1' } }` makes the call *that seat's own
  act* (`memberActed: true`); omit `as` to act as the office. This distinction is load-bearing:
  the office orchestrating for a seat is not the same act as the seat carrying it out.
- `h.prompts.assembleFor({ seat: 'chair'|'member'|'temp', phase })` — the real pipeline, with the
  real `bindings` and `settings`. A simulator that skips them reports a shorter prompt than the
  real one and therefore reports headroom that does not exist (this was a real gate bug, RUN 226).
- `h.snapshotTree()` — `[{ path, bytes, sha256 }]` for the workspace.

## What the corpus contains

```
manifest.json    scenario, root, tool list, counts
receipts.jsonl   one line per call: { step, tool, args, ok, code, receipt, ms }
prompts.jsonl    one line per assembly: { seat, phase, chars, text }
tree.json        the workspace tree at the end
steps/           one file per step, the full receipt (for reading, not parsing)
REPORT.md        the human summary (steps, refusals, files before → after)
```

Refusals are split into **mechanism** (our bug: a legal sequence was refused, or an illegal one
was accepted) and **environmental** (a seam this process does not have: no LLM to spawn, so
`compile` cannot run). Only mechanism refusals fail a scenario.

## The audit

`scripts/sim/audit/receipts.mjs <corpus>` checks observations, not source:

| check | question |
| --- | --- |
| A1 | did any step refuse? (mechanism = finding) |
| A2 | does any receipt serialize `undefined`, `[object Object]`, `NaN`? |
| A3 | did a write action change no file and no row? |
| A4 | is a refusal missing its `hint` / `means` (where the field exists)? |
| A5 | is a refusal code not registered in `docs/03-interface-contract.md` §8? |

## Discipline

- A scenario must not "work around" a defect. If the legal sequence is refused, record the
  refusal and report it: the corpus is evidence, and a scenario bent to pass is worthless.
- Member acts use `{ as }`; if a scenario needs the office to act in a seat's name, that is a
  finding about the prompts, not a scenario convenience.
- Never measure prompt size from `role` names in the source (`academician`); the turn loop passes
  the roster **slot** (`chair`/`member`/`temp`). Measuring the wrong one is how the budget gate
  passed at 27 973 while the real chair prompt was 32 057.
