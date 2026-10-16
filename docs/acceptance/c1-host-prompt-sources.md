# C1 — where the model-visible prompt actually comes from (host-side sources, enumerated)

**Status: reconnaissance complete; the boundary claim in the ledger is now due for re-derivation.**

The acceptance ledger recorded, as a boundary, that `systemPrompt` is *unreachable* and that "the host may concatenate
its own prompt text" was **not enumerated**. This file replaces "not enumerated" with an enumeration, and records the
scope and residual of that enumeration honestly.

## Method, and why the first attempt failed

The claim that the checkout is at `resources\app.asar\dsh\` — which the harness's own runtime context states — is
**wrong**: that path is not a directory. The real layout is:

| location | what it is | count |
| --- | --- | --- |
| `resources\app.asar` | a 121 MB archive holding the host code | **12,412 entries under `/dsh/`**, of which **7,801 are `.js`** |
| `resources\app.asar.unpacked\dsh` | files that must exist on disk (native modules, some deps) | 1,497 files |

So the host is **inspectable**, not a black box: the archive's directory index parses with plain Node, and entries can
be read by offset. The failure was caused by **trusting a path string instead of resolving it** — the same family this
project keeps recording.

**One instrument fault, reported as an instrument fault:** the first scanner crashed with `ERR_OUT_OF_RANGE` because an
**asar entry can be `unpacked`**, and such an entry carries **no offset** in the index — its bytes live on disk. The
scanner now skips them and prints how many it skipped. That crash said nothing about the host.

## The enumeration: sections are registered into **named order slots**

The host exposes a `systemPrompt` **service** with `section({name, order, text})` and `getSectionOrder(SLOT)`. Every
contributor registers a named section into a named slot, so placement is a property of the host, not of any plugin.

**Host-shipped contributors, from a content scan of all 7,512 packed JS entries (7,509 scanned — effectively exhaustive):**

| contributor | section name | order slot |
| --- | --- | --- |
| `dsh-app-boot` | `HARNESS_SOURCE_SECTION` | `HARNESS_SOURCE` |
| `dsh-persona` | `PERSONA_PREFIX_SECTION` | `DEPLOYMENT_PERSONA_PREFIX` |
| `dsh-subagent` (and its in-process driver) | `deployment:persona-prefix` | `DEPLOYMENT_PERSONA_PREFIX` |
| `dsh-experimental-tool-agent-team` | `team:policy` | `TEAM_POLICY` |
| `dsh-plan-mode` | `plan:policy` | `PLAN_POLICY` |
| `dsh-file-reference-local` | `context:file-reference` | `FILE_REFERENCE` |
| `dsh-client-ui-deliverables` | `ui:deliverable-file-references` | `DELIVERABLE_FILE_REFERENCES` |
| `dsh-mcp-client` | `mcp:<server>` | `MCP_SERVERS` |
| `dsh-mcp-resources` | `mcp-resource-servers` | `MCP_SERVERS` |
| `dsh-subagent-in-process-driver` | `tool:<structured-output>` | `STRUCTURED_OUTPUT` |
| tool plugins (`tool-bash`, `tool-fs`, `tool-fs-search`, `tool-goal`, `tool-jobs`, `tool-pwsh`, `tool-ralph`, `tool-subagent`, `tool-web`, `tool-workflow`) and `dsh-tools`, `dsh-web-app`, `dsh-system-prompt` itself | (several) | (several) |

**Residual closed for the host tree:** the **unpacked** tree contains **zero** `systemPrompt.section` call sites, so the
archive scan is complete for host-shipped code.

## A THIRD source, which the earlier boundary did not name: profile-installed plugins

The profile directory (`DSH_PROFILE_DIR`, here `~/.dsh/profiles/desktop`) installs plugins that also register prompt
sections — **not** part of the host archive:

- `dsh-ops` — registers a section.
- **`dsh-vibe-math` — this project's own plugin** (the vmu entry plus its tests).

★ **This is the finding with consequences.** It means:

1. The final prompt is assembled from **host-shipped sections + profile-installed plugin sections**; our receipt's
   `prompt.sections` reports **the sections our plugin registered**, which is *why* the whole assembled prompt is not
   in the receipt. The boundary is a **composition boundary**, and it is now **explained** rather than just named.
2. **The profile holds a COPY of this plugin** (`node_modules/dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js`) alongside
   the repository copy. Which copy a live session loads is exactly the "which copy, which version, which moment"
   question this project requires every reading to answer — and it is now a **known, named** fact rather than an
   unexamined assumption.
3. Two tests that bear directly on this boundary — `vmu-assistant-systemprompt.test.mjs` and
   **`vmu-prompt-section-guard.test.mjs`** — exist in **this repository's own `tests/`**, NOT in the profile tree.
   (An earlier version of this file said "the same profile tree"; that was **wrong**, and it was caught by the
   teammate reading the archive rather than by me. Corrected here rather than left to propagate.) They matter because
   they may already cover part of what the ledger calls an unenumerated boundary, so that entry must be re-derived
   against them before it is repeated.

## Scope and residual (what this file does NOT claim)

- **Scanned:** packed entries of `app.asar` whose name ends `.js/.mjs/.cjs`, by **content**, for the two needles
  `systemPrompt.section` and `"systemPrompt",`. Size-capped at 3 MB per entry, which skips a few large bundles.
- **Verified separately:** `app.asar.unpacked/**` — zero hits (so the skip above does not hide host contributors).
- **NOT scanned:** `resources/runtime`, `default_app.asar`, the profile's `node_modules` **in full** (only the section
  needle was searched there), and anything installed outside these three roots.
- **Therefore:** the table above is an enumeration of **where the needle occurs**, not a proven-exhaustive list of every
  prompt contributor. Where it is exhaustive, this file says so; where it is not, it says that too.

## What happens next for C1

Read `dsh-system-prompt/lib/index.js` (the service itself) and the two existing tests named above, to answer: **can a
plugin observe the composed prompt**, or only its own sections? That answer decides whether the ledger's boundary entry
stays, narrows, or is withdrawn — and it is a **code reading**, which this project accepts as evidence for a mechanism
(as opposed to behaviour, which needs a real machine).
