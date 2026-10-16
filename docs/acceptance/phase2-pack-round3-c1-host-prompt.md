# C1 · where the model-visible prompt comes from — **the host side, read from the archive**

**Phase 2 · pack round 3.** Read-only reconnaissance. ★ **The ledger's boundary claim `systemPrompt` is *unreachable* [does not hold as written]** — see §2. This file states what I checked, with path + line numbers, and separates **checked** from **not checked**.

---

## 0. One-line result

★★ **A plugin CAN observe the composed prompt.** The host's `dsh-system-prompt` **exports its render functions** (`renderPrompt` / `renderContextSnapshot` / `renderContextSections`) and its service exposes a method that **returns the fully assembled prompt** (all sections, from the global **and** every scoped layer), with a **`system-prompt/assemble` waterfall** any plugin can hook. ⇒ ★ **the ledger entry must be [narrowed, not kept]**: what stays true is that **our receipt only reports OUR OWN sections**, and that **whether a plugin is handed the service is an access question** — not that the prompt is unobservable.

---

## 1. Method, and the instrument fault (an instrument fault, not a host fact)

- The archive is readable **with plain Node**: `app.asar` = **121,348,951 bytes**; the directory index parses at **jsonSize = 3,392,048**, data base **offset 3,392,064**.
- Directory walk: **12,967 entries**, of which **1,497 are `unpacked`** ⇒ ★ **those carry NO offset in the index** (their bytes live on disk) ⇒ the reader **skips them and counts them** instead of crashing. ★ (This is the fault mode Lead's earlier scanner hit — recorded here as an instrument fault, **not** as a fact about the host.)
- ★ **Path correction**: `dsh-system-prompt`, `dsh-persona`, `dsh-experimental-tool-agent-team` are **packed** (they are **not** in `app.asar.unpacked/dsh`) ⇒ they must be read **by offset from the archive**.

## 2. ★★ Item 1 — CAN a plugin observe the assembled prompt? **YES (API level)**

**File: `/dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js` (366 lines, packed).**

| line | what it establishes |
|---|---|
| `:365` | ★★ **`export { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION, SystemPrompt, SystemPrompt as default, TOOL_ORDER_REST, joinContextSections, renderContextSections, renderContextSnapshot, renderPrompt };`** ⇒ **the render functions ARE exported** |
| `:113-114` | `function renderPrompt(assembly)` → `@returns the rendered prompt` ⇒ **the composed prompt is producible from an assembly** |
| `:121-122`, `:146-150` | `renderContextSnapshot(assembly)` / `renderContextSections(assembly)` ⇒ the runtime-context half, **with per-contributor attribution** |
| `:307-308` | a service method documented as `@param context - the optional scope and plugin-defined assembly fields.` / `@returns the post-waterfall assembly with any complete prompt enforced.` ⇒ ★ **a method RETURNS THE WHOLE ASSEMBLY** |
| `:338-354` | that method builds the assembly: `sections` (every section, in canonical order) ＋ `contexts` ＋ `tools` ＋ `variables` |
| `:355` | ★ `this.ctx.waterfall(scopeTarget(this, scope), "system-prompt/assemble", assembly, context, …)` ⇒ **a plugin can hook `system-prompt/assemble` and receive (and transform) the assembly** |
| `:315-316` | the assembly iterates `this.layers.global.variables.entries()` **and every scoped layer** ⇒ **global + scoped are one assembly**, so scoping does not hide other contributions from the assembly |
| `:240-242` | `section(section)` returns `this.layers.effect(...)` ⇒ ★ **the return value a plugin gets from registering is a DISPOSER (an effect handle), not a read handle** |
| `:249-250` | `getSectionOrder(name) { return SECTION_ORDERS[name] }` ⇒ **a static numeric lookup**, not content |
| `:190-192` | the registries are `NamedEntries` over `dsh-scope`, whose read face is `insert/get/keys/entries/values` (`/dsh/node_modules/@deepseek-ai/dsh-scope/lib/index.js:27/44/59/66/73`) with a **merged** view (`:178-179`: global ＋ `chainLayers`) |

⇒ ★★ **API-level determination**: **the composed prompt is reachable**, by **two independent routes** — (a) obtain the assembly from the service and call the **exported** `renderPrompt`, or (b) **hook the `system-prompt/assemble` waterfall** and read the assembly as it passes.

### 2.1 What therefore changes in the ledger

| previous wording | status after this reading |
|---|---|
| "`systemPrompt` is **unreachable**" | ❌ **does not hold as written** ⇒ **withdraw/narrow**: the *module* exposes composition; the *registration handle* is only a disposer |
| "the host may concatenate its own prompt text — **not enumerated**" | ⚠️ **still true as a scope statement**, but the mechanism is now **identified**: contributions land in **named slots** (§3) and are composed by **this** service |
| "our receipt's `prompt.sections` reports only our own sections" | ✅ **stays true** — and is now **explained**: the receipt reports what *we* registered; the assembly is a **composition** the service owns |
| — | ★ **NEW, and it is an opportunity**: a plugin can **observe the composed prompt** (§2) ⇒ the project *could* put the **whole effective prompt** (or its per-contributor attribution via `renderContextSections`) into a receipt, **if it wants to** |

★ **Residual (named, not glossed)**: this is an **API-level** determination from **code**. It does **not** establish that our plugin is **given** the service instance at runtime (that is a **cordis service-injection / access** question, and a **behavioural** one ⇒ needs a real machine). ★ **Unverified**: whether the profile-installed `dsh-vibe-math` build can reach that service.

## 3. ★ Item 3 — the `order` slots: **the host owns the total order**

**The closed set** — `SECTION_ORDERS` at `:10-43`, **31 named slots with fixed numbers**:

`HARNESS_IDENTITY -1000` · `DEPLOYMENT_PERSONA_PREFIX 0` · `PLAN_POLICY 500` · `TEAM_POLICY 600` · `PTC_ONLY 800` · `FILE_REFERENCE 900` · `TOOL_BASH 1000` · `TOOL_PWSH 1010` · `TOOL_READ 1100` · `TOOL_WRITE 1200` · `TOOL_EDIT 1300` · `TOOL_GLOB 1400` · `TOOL_GREP 1500` · `TOOL_JOBS 1600` · `TOOL_PTY 1700` · `TOOL_WEB_SEARCH 2000` · `TOOL_WEB_FETCH 2100` · `TOOL_LSP 2200` · `TOOL_SESSION_QUERY 2300` · `TOOL_GOAL 2400` · `TOOL_WORKFLOW 2600` · `TOOL_RALPH 2700` · `TOOL_SUBAGENT 2800` · `TOOL_REPORT 2900` · `TOOL_COMPUTER_USE 3000` · `MCP_SERVERS 3100` · `TOOLS_SDK 5000` · `DELIVERABLE_FILE_REFERENCES 9000` · `STRUCTURED_OUTPUT 9900` · `HARNESS_SOURCE 10000` · `WEB_SURFACE 10100` · `DEPLOYMENT_PERSONA_SUFFIX 10200`

(plus `CONTEXT_ORDERS` at `:44-48`: `SANDBOX_POLICY 110`, `APPROVAL_POLICY 115`, `SUBAGENT_DELEGATION 120`.)

**Who decides the total order**: `:96-98` ⇒ **`a.order - b.order || compareNames(a.name, b.name)`** — **numeric slot first, then the section NAME, with a locale-independent comparison** (`:92`).
⇒ ★ **A plugin does NOT choose an arbitrary position**: it must name **one of the 31 slots** (`getSectionOrder(SLOT)` returns that number), and ties inside a slot are broken **deterministically by name**. ★ **"before/after slot X" is not available.** ⇒ For the "runtime-mechanism definability / extensibility" goal: **placement is host-defined, enumerable and deterministic — extensible by picking a slot, not by ordering freely** ✓.
★ **Slots actually referenced in the archive** (content scan of packed `.js`, `getSectionOrder("…")`): **25 distinct slots** — `DELIVERABLE_FILE_REFERENCES, DEPLOYMENT_PERSONA_PREFIX, DEPLOYMENT_PERSONA_SUFFIX, FILE_REFERENCE, HARNESS_IDENTITY, HARNESS_SOURCE, MCP_SERVERS, PLAN_POLICY, PTC_ONLY, STRUCTURED_OUTPUT, TEAM_POLICY, TOOLS_SDK, TOOL_BASH, TOOL_EDIT, TOOL_GLOB, TOOL_GOAL, TOOL_GREP, TOOL_JOBS, TOOL_PWSH, TOOL_RALPH, TOOL_READ, TOOL_SUBAGENT, TOOL_WEB_FETCH, TOOL_WEB_SEARCH, TOOL_WORKFLOW, TOOL_WRITE` ⇒ **six defined slots are unused by host-shipped code** (`TOOL_WRITE`… counted; the unreferenced ones are `TOOL_PTY, TOOL_LSP, TOOL_SESSION_QUERY, TOOL_REPORT, TOOL_COMPUTER_USE, WEB_SURFACE`, plus context slots) ⇒ ★ **room exists for a contributor that wants its own placement**.

## 4. ★ Item 4 — the two known host contributions vs this project

**(a) `dsh-persona` / `DEPLOYMENT_PERSONA_PREFIX`** — `/dsh/node_modules/@deepseek-ai/dsh-persona/lib/index.js` (**2,163 bytes**, packed; registered by `dsh-app-boot` per Lead's table).
★ **The relation is REPLACEMENT, not superposition** — the host says so itself at `dsh-system-prompt/lib/index.js:49-54`:
> *"The deployment persona prefix's section name. Exported because a composition can **replace** this slot — an agent preset **shadows** the deployment's persona with its own — and **both sides naming the same section is what makes the replacement work rather than duplicate**."*
⇒ ★★ So our receipts' "**persona suffix**" wording corresponds to **`PERSONA_SUFFIX_SECTION = "deployment:persona-suffix"`** (`:57`, slot **10200**) — the **same-name/shadowing** mechanism, i.e. **by design one wins, they do not stack**. ★ **This is the mechanism the ledger should cite** instead of "may concatenate".
★ **Note on `PERSONA_PREFIX_SECTION`**: `:215-227` shows the **service itself** registers three sections — `HARNESS_IDENTITY` (`:217`), `DEPLOYMENT_PERSONA_PREFIX` (`:222`), `DEPLOYMENT_PERSONA_SUFFIX` (`:227`) — so the host **pre-populates those slots** and a composition **replaces** them by name.

**(b) `dsh-experimental-tool-agent-team` / `team:policy`** — `/dsh/node_modules/@deepseek-ai/dsh-experimental-tool-agent-team/lib/index.js` (**18,707 bytes**, packed); slot **`TEAM_POLICY` = 600** (`:14`).
⇒ ★ **This is the host-side prompt for the teammate workflow**, and it therefore **is part of the composed prompt our experiments ran under** — it is **host-shipped**, not ours, and **not in our receipt** (the composition-boundary point) ✓.

## 5. ★ Checked vs NOT checked (and the scope, so "I did not see" ≠ "I checked")

**Checked (with citations):** the archive index and offsets (§1); `dsh-system-prompt/lib/index.js` — export list, render functions, assembly builder, waterfall, `section`/`getSectionOrder`, `SECTION_ORDERS`/`CONTEXT_ORDERS` (§2–§4); `dsh-scope/lib/index.js` read face (`insert/get/keys/entries/values`, merged view); the `getSectionOrder("…")` argument census across packed `.js`; the existence and size of `dsh-persona` and `dsh-experimental-tool-agent-team` entry points.

**NOT checked — stated, not implied:**
1. ★ **`invariant.js`** of `dsh-system-prompt` (2,493 bytes) — **not read** (my dumper's needle did not surface it in this pass).
2. ★ **Item 2 — the two tests.** ★ **Location correction**: `vmu-assistant-systemprompt.test.mjs` and `vmu-prompt-section-guard.test.mjs` are in **THIS REPOSITORY** (`Vibe-Mathematics/tests/`), **not** "in the profile tree" as `c1-host-prompt-sources.md:68-71` states ⇒ ★ **their assertions were NOT read by me this round**, so the ledger entry's coverage claim is **still un-derived**. ★ **This is the one item that must be finished before the ledger wording is settled** — and it is cheap.
3. **Behavioural** questions: whether a plugin is **given** the service (access/injection), and which **copy** of `dsh-vibe-math` a live session loads (repo vs `~/.dsh/profiles/desktop/node_modules/dsh-vibe-math`) — **not** established here.
4. **Scan residual (inherited from Lead's file, still true)**: `resources/runtime`, `default_app.asar`, the profile's `node_modules` **in full**, and anything installed outside those roots are **not** covered; the packed scan is **size-capped at 3 MB**, which skips a few large bundles.

## 6. Consequences for the ledger (proposed wording)

1. **Withdraw** "`systemPrompt` is unreachable". **Replace with**: *"the registration handle a plugin receives is a **disposer**; the **composed** prompt is produced by the host's `dsh-system-prompt` service, whose **render functions are exported** (`renderPrompt`/`renderContextSnapshot`/`renderContextSections`) and whose **assembly is returned by the service and passes through a `system-prompt/assemble` waterfall** ⇒ **observable in principle**; **whether our plugin is given that service is an access question, not yet verified**."*
2. **Keep, and now explain**, the composition boundary: our receipt reports **our own sections**; the effective prompt is a **composition across named slots** owned by the host (§3).
3. ★ **Add the slot model** to the mechanism description: **31 named slots, fixed numeric order, ties by name, plugins pick a slot and cannot order freely**; **six slots are unused** ⇒ room for a contributor's own placement.
4. ★ **Add the persona mechanism**: agent-preset persona **shadows** the deployment persona **by using the same section name** (`PERSONA_PREFIX_SECTION` / `PERSONA_SUFFIX_SECTION`, slots 0 / 10200) — **replacement, not superposition**; the host **pre-registers** those three sections itself.
5. ★ **Name `team:policy` (slot 600) as a host-shipped part of the prompt our experiments ran under.**

★ **One remaining item before this is settled** (§5.2): read the **two repo tests**; if they already assert this boundary, the ledger entry is **more covered than recorded**, and must say so.

---

## 7. ★ Item 2 completed — WHAT THE TWO EXISTING TESTS ALREADY ASSERT
*(round 4 addition; both files are in **this repository**: `tests/vmu-assistant-systemprompt.test.mjs` (133 lines) and `tests/vmu-prompt-section-guard.test.mjs` (106 lines). ★ The earlier file said they were "in the profile tree" — **wrong**; corrected here and in `c1-host-prompt-sources.md`.)*

### 7.1 `tests/vmu-assistant-systemprompt.test.mjs` — the **injection** half, asserted byte-by-byte

| lines | what it asserts |
|---|---|
| `:1-10` | its stated scope: *"the office persona **reaches the SYSTEM PROMPT** of the session that actually talks to the human"*; it applies the **REAL** preset entry, records **what the entry hands the host**, and requires the declaration to be in it |
| `:37-51` | the fake host **records every `systemPrompt.section(...)` argument** (`state.sections`) ⇒ ★ it measures **what WE register**, not what the host composes |
| `:53-55` | the needles come from `packs/v5r/prompts/assistant.json`, filtered by **`hostPrompt === true`** |
| `:79-80` | ★ **non-vacuity**: at least one host section was registered ("without one, this whole channel is dead") |
| `:87-89` | ★ every needle is **byte-present** in the joined registered text — *"byte-present, not claimed"* |
| `:90-91` | ★★ **`/vibe_vmu_report/` ＋ `/vmu\.report\.reports/` ＋ `/vmu\.report\.params/` must be in that text** ⇒ **the suite itself asserts that the reporting instructions ARE in our injected section** (with the **real key names**) |
| `:92-93` | and what it is **not** (no research, no vote) |
| `:95-98` | ★ provenance: the entry reports the section as coming from **`pack:`** |
| `:82-86` | `--print` turns the suite into a **reproducible excerpt** of the bytes the host would receive |
| `:102-110` | zero-mechanism reversal: **no pack ⇒ 0 sections** |

⇒ ★ **It covers the first half of the composition boundary, and covers it strongly** (real entry, byte-present needles, provenance, and a zero-mechanism reversal). ★ **It does NOT touch the composed prompt** — no host-side render appears anywhere in it.

### 7.2 `tests/vmu-prompt-section-guard.test.mjs` — the **access** half, already observed and guarded

| lines | what it asserts |
|---|---|
| `:5-6` | ★★ states the host fact verbatim: under cordis, *"an un-injected service access"* is answered with a **THROWING getter** — `cannot get property "systemPrompt" without inject` — and that the defect was `vibe-math-vmu.js:706` reading `ctx.systemPrompt` **while `inject = ['tools']`** |
| `:44-56` | models **three real host shapes**: access throws / the `section()` call throws / the service works |
| `:69-76` | **P1** precondition (getter reached) · **P2** the entry does **not** throw · ★ **P3 named**: `promptSection = {registered:false, code:'VMU_EXTERNAL_UNAVAILABLE', what:'systemPrompt'}` + reason · **P4** stderr carries the thrown message |
| `:78-81` | ★ **reversal**: with **no pack** the getter is touched **0** times ⇒ P1/P2 measure the pack path, not a constant |
| `:83-98` | ★ **LIVE ARM A**: the service is **reachable but `section()` throws** ⇒ **P6** precondition, **P7** it does not kill assembly, ★ **P8 degrades BY NAME *with the `stack`***, **P9** stderr |
| `:100-102` | the same config is stable across runs |

⇒ ★★ **The access question is NOT merely "unverified" in this repository — it is already observed, explained and guarded**: our entry's `inject` **did not include** `systemPrompt`, the access **threw**, and the project turned that into a **named degradation** (`promptSection`) plus stderr, with a **live-arm** regression guard.

### 7.3 ★★ Verdict — **both**, and they are different halves

| the ledger's boundary, split in two | verdict after this reading |
|---|---|
| **API side** — "the composed prompt is unreachable / the host may concatenate text and we cannot see it" | ★ **NARROWED**: the composition **is** producible at the API level (§2: exported `renderPrompt`/`renderContextSnapshot`/`renderContextSections`, the service returns the assembly, a `system-prompt/assemble` waterfall broadcasts it) |
| **Access side** — "we cannot reach `systemPrompt`" | ★★ **LARGELY ALREADY COVERED, and better evidenced than recorded**: the un-injected access **threw**, and that is **asserted** (`vmu-prompt-section-guard.test.mjs:5-6, 69-98`) including a **live-arm** guard; the degradation is **named** in our receipt |
| **Content side** — "which text the model ultimately sees" | ★ **NOT covered** (by these tests **or** by C1): no host render, and the slot-only composition (§3) is not asserted anywhere |

★ **Stated both ways on purpose** (Lead's condition): I am **not** keeping the old wording alive, and I am **not** inflating the coverage — the API claim shrinks, the access claim was **already** stronger than the ledger said, and the **content** claim stays genuinely open.

### 7.4 Residual, named and NOT done here (behavioural; D1's remit)

1. ★ **Whether our plugin is GRANTED the service in a live session** (`inject` today excludes it — the guard test documents that — but a live host may differ; this is **behaviour**, needing a real machine).
2. ★ **Which copy a live session loads**: the repo path vs `~/.dsh/profiles/desktop/node_modules/dsh-vibe-math` (the profile copy Lead named).
3. ★ **The composed prompt's actual content** in a live session (slot contributions incl. `team:policy`, slot 600).
⇒ ★ **All three are behavioural and belong to D1; I have not attempted them** (this round was read-only + this file).

### 7.5 One cross-check worth recording

★ `vmu-assistant-systemprompt.test.mjs:90-91` asserts `/vibe_vmu_report/`, `/vmu\.report\.reports/`, `/vmu\.report\.params/` **byte-present in our injected section** ⇒ ★ **the repository's own suite already pins that "P is present" in the v5r assembly** — which is the same fact R42 established independently from the injected layer. ⇒ **the two readings agree, from different directions** ✓.
