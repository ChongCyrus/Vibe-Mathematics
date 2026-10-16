# Source → vmu prompt/orchestration coverage audit

AUDIT TARGET: `vibe-math-v5r/vibe-math-v5r.js` (authority; **11,597 lines**, re-measured on the current tree with a UTF-8 `split(/\r?\n/)` pass; the "11,166" this line used to carry was itself wrong — both counts are now stated once and the measured one wins).
CITATION NOTE (phase-3, task-219 — the re-anchor; supersedes the task-208 note): the `v5r-charter.js:NNN` citations used to be pre-split (taken when that file held the fragments and ran to **902 lines**). **Every port-side citation in this file is re-anchored to the CURRENT tree**, where the fragments live in `v5r-blocks-a.js` (**732 lines**) and `v5r-blocks-b.js` (**704 lines**) and `v5r-charter.js` is **132 lines** and holds only the block arrays, the bindings and `charterSections`. Each re-anchored citation names the phrase that was resolved. The original-side column was re-checked against `function` declarations in the authority: all match except the `briefBlock` rows, which were off by exactly **+138** and are corrected (see GAP-10, now resolved). Re-anchor table (old → new, each resolved by the phrase that follows; "old" = the pre-split `v5r-charter.js:NNN`): `:774`→`v5r-blocks-b.js:80` ("我刚才读过"); `:730`→`v5r-blocks-b.js:36` ("本机可能资源紧张"); `:748`→`v5r-blocks-b.js:54` ("命题准入"); `:517`→`v5r-blocks-a.js:530` ("[状态]"); `:660`→`v5r-blocks-b.js:300` and `v5r-blocks-a.js:675` ("Lean 形式化验证"); `:868`→`v5r-blocks-b.js:175` ("顺手形式化"); `:794`→`v5r-blocks-b.js:101` ("工作经验／流程反馈"); `:878`→`v5r-blocks-b.js:185` ("【形式化结果】"); `:550`→`v5r-blocks-a.js:565` and `:583`→`v5r-blocks-a.js:598`, with a THIRD site now at `v5r-blocks-a.js:635` ("字段目录"); `:885`→`v5r-charter.js:40` (still that file, new line); `:896`→`v5r-charter.js:82` (still that file, new line); `:10`／`:11` stayed correct (`v5r-charter.js:10` = `{{ setting:vmu.turn.instituteName }}`, `:11` = `{{ setting:vmu.turn.objective }}`).
PORT UNDER TEST (all counts re-measured on the current tree): `vibe-math-vmu/packs/v5r/prompts/v5r-charter.js` (**132 lines**), `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-a.js` (**732 lines**), `vibe-math-vmu/packs/v5r/prompts/v5r-blocks-b.js` (**704 lines**), `vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js` (**121 lines**, generated corpus: 67 prompts / 31 kinds / 79,138 chars), `vibe-math-vmu/packs/v5r/prompts/v5r-persona.js` (**219 lines**, generated), `vibe-math-vmu/packs/v5r/prompts/v5r-assistant.js` (**39 lines**), `vibe-math-vmu/kernel/prompt/index.js` (**729 lines**), `vibe-math-vmu/kernel/turn/index.js` (**728 lines**), `vibe-math-vmu/settings/schema.js`.
CLAIMS TESTED (not evidence): `vibe-math-vmu/docs/26-turn-orchestration.md` §3.6–3.18.

READING NOTE: my first structural pass used PowerShell `Get-Content` (ANSI decode) and produced mojibake **and offsets that disagreed with a UTF-8 pass**. Every line number below comes from a UTF-8 `ReadAllText` pass cross-checked by a declaration grep. Where the two passes disagreed I say so explicitly in the gap list. Nothing below is quoted from a design note.

---

## 1. Function / branch coverage

Legend for COVERED: **YES** = the text and its variation points are present in the port; **PARTIAL** = text present but a branch, guard or selection rule could not be found; **NO** = text not found in the port; **UNSURE** = my probe string did not settle it (evidence needed is stated in §3).

| Function | Branch | Original lines | Produces | Covered | vmu side (file:line / path) |
|---|---|---|---|---|---|
| `headerListContractBlock` | single (no branch) | 372–383 | 7-line "指针传播 · 头部列表（机制约束）" block | PARTIAL | text at `v5r-blocks-b.js:80` (grep hit "我刚才读过"); the 7 sub-bullets not individually verified |
| `pointerContractBlock` | `!pointerPropagationOn()` → `[]` | 2065–2066 | gate: no block when switch off | UNSURE | no port-side gate found; see GAP-3 |
| `pointerContractBlock` | default → `headerListContractBlock()` | 2067–2068 | delegates to 372–383 | PARTIAL | same as row 1 |
| `resourceBlock` | `!resourceSelfCheckOn()` → `[]` | 2069–2070 | gate: no block when switch off | UNSURE | no port-side gate found; see GAP-4 |
| `resourceBlock` | emits `maxParallel` line | 2075–2076 | "并发：框架每轮最多同时唤醒 N 名成员（maxParallel）" | YES | `v5r-blocks-b.js:36` (grep "本机可能资源紧张"); N becomes a variable |
| `resourceBlock` | emits tool-budget line (`cap > 0` vs. not) | 2078 | "工具预算：本回合工具调用不超过 cap 次" / "未设上限" | UNSURE | two branches; only the block text was confirmed, not both branches |
| `resourceBlock` | emits self-monitor line (`mb > 0` vs. not) | 2079 | memory-ceiling sentence | UNSURE | as above |
| `resourceBlock` | emits trade-off sentence | 2082 | "正确性优先于产出量…" | UNSURE | as above |
| `proofStatusBlock` | single (no branch) | 2087–2097 | 「命题准入（本所纪律）」block | YES | `v5r-blocks-b.js:54` (grep "命题准入") |
| `rosterLine(ex)` | academician / researcher / temp three groupings + `(hiredBy 雇)` suffix | 3018–3032 | roster line | PARTIAL | `{{ roster }}` is a whitelisted variable (`kernel/prompt/index.js:50`); the three groupings/`雇` suffix not verified in port |
| `charterFor(member)` | `kind === 'temp'` → no-vote wording | 3133–3136 | "你没有表决权…" | YES | `v5r-charter.js` role blocks (kind `role`); corpus `founding-temp#1` |
| `charterFor` | non-temp → quorum rules (a)(b)(c), m formula | 3137–3153 | Verified-gate rules, `verdictMaxRounds` interpolation (L3149) | YES | `v5r-charter.js` role blocks + `v5r-prompts.js:56–62` |
| `charterFor` | `kind === 'academician'` → one-vote sentence | 3154–3156 | "院士与所有有表决权者相同的一票" | YES | corpus `founding#1` (owner `acad`) + charter role block |
| `charterFor` | per-round section (6. each round) | 3159–3170 | default round rhythm | YES | charter shared/phase block |
| `charterFor` | `kind === 'temp'` hire/fire wording | 3174–3175 | temp: hire/fire decided by owner/leader | YES | charter role block + `founding-temp#1` |
| `charterFor` | non-temp hire/fire wording | 3176–3184 | self-hire `vibe_v5_hire`, fire own temps, `vibe_v5_fire` | YES | charter role block |
| `charterFor` | `acadId` present → leader-total-control sentence | 3185–3188 | "院士统辖全所的用人" | YES (leader-conditional) — and `with-leader` is the **shipped default**, stated as such: the module is static data and knows no roster, so the caller must ask for `{ hasLeader: false }` | `CHARTER_LEADER_VARIANTS` + `charterSections({ hasLeader })` (`v5r-charter.js`; the citation used to read `:896`, a pre-split line) |
| `charterFor` | task-board section + `acadId` present | 3192–3201 | "院士可以直接分派任务 / 优先级由院士牵头" | YES | charter blocks |
| `charterFor` | task-board section + no leader | 3202–3207 | "本所没有院士…优先级由集体协商" | **PARTIAL** (was claimed YES): the text is **available and selectable** — `charterSections({ hasLeader: false })` swaps all four leader-conditional blocks to their `texts.leaderless` variant, verified end-to-end through a real `createTurnOrchestrator` assembly (task-208's evidence, kept), and the omissions are NAMED rather than silently empty (`CHARTER_LEADERLESS_MISSING_TEXT` and `CHARTER_LEADERLESS_OMISSIONS`, `v5r-charter.js:98–99`) — but the shipped default is `hasLeader: true` and **no shipped caller asks for the leaderless set** (re-measured: `charterSections` is called exactly once in the tree, at `v5r-charter.js:131`, with `{ hasLeader: true }`), so a live leaderless institute still gets the leader-assuming text | `texts.leaderless` (`v5r-blocks-a.js`) + `CHARTER_LEADER_VARIANTS` (`v5r-charter.js:82`) + `charterSections` (`v5r-charter.js:108`) + corpus `founding-leaderless#1/#2` |
| `charterFor` | context section | 3210–3215 | compression notice + JSON-per-round | YES | charter shared block |
| `charterFor` | stop section | 3218–3221 | stop only when all voters agree | YES | charter shared block |
| `briefBlock(member, roundNo)` | unknown identity → `V5_INTERNAL` throw | 3376–3379 (re-anchored, +138) | guard | UNSURE | no port-side equivalent found (mechanism may be `kernel/turn/index.js:316`, whose `open()` refuses a missing member with `VMU_INVALID_ARGUMENT`; the pre-change `:154` citation is stale and no longer points there) |
| `briefBlock` | `[状态]` header with `m`/voter count | 3382–3383 | status line | YES | `v5r-blocks-a.js:530` (grep `[状态]`) |
| `briefBlock` | `[在册]` line | 3246 | on-roster list | YES | charter block |
| `briefBlock` | `absent.length` → `[未就位]` line | 3387–3388 | not-on-floor members visible | UNSURE | branch not verified |
| `briefBlock` | `formalOn()` → `[形式化]` line with passed/blocked/TODO counts | 3391–3397 | Lean status line | YES | `v5r-blocks-b.js:300（同段另有 v5r-blocks-a.js:675）` (grep "Lean 形式化验证"); counts become variables |
| `briefBlock` | `takeLeanNoticesFor(member.id)` → one-shot notice lines | 3262 | settled-compile announcements | NO | no `takeLeanNotices`/`leanNotice` anywhere in `vibe-math-vmu` (grep hits 0); the *text* exists at `v5r-blocks-b.js:185` but the one-shot delivery queue does not — GAP-1 |
| `briefBlock` | `tasks.length` → `[任务板]` line | 3404–3407 | in-progress/ready/mine counts | YES | charter block |
| `briefBlock` | `mine.length` → per-task lines with acceptance/assignedBy/description | 3408–3414 | my tasks | UNSURE | branch not verified |
| `briefBlock` | `pending.length` → `[新到的消息/通知]` with `inboxSuppressed` gate | 3415–3419 | inbox block | PARTIAL | corpus kinds `notice-task`, `inbox-*` exist (text), `inboxSuppressed` gate not found |
| `kindLabel(k)` | academician / researcher / temp | 3422 (second `kindLabel` sighting at 3284 — see GAP-10) | role label | **PARTIAL** (was YES): the port has the DISPLAY VARIABLE and the headings that interpolate it (`{{ roleLabel }}` at `v5r-blocks-a.js:685–694`, `v5r-blocks-b.js:438/502/533/560/599`, `v5r-assistant.js:27`, `v5r-core.js:362–364`) and whitelists it (`kernel/prompt/index.js:50`), but the **kind → Chinese label MAPPING itself exists nowhere** in `vibe-math-vmu` — re-measured by grep: no `academician: '院士'` map, and the kernel carries only the caller-supplied field with a **fallback to the role KEY** (`kernel/turn/index.js:316` parameter, `:349` `turn.roleLabel \|\| turn.role`). The pre-change citation `kernel/turn/index.js:176` pointed at a map that no longer exists (round 466 removed it: the kernel must hold none of an institution's words). If the caller supplies nothing, a heading renders `researcher r-1` — the exact defect the pack's own comment records as measured (`v5r-core.js:56–57`, "fifty headings rendered as \u201cresearcher r-1\u201d") |
| `replySpec(kind)` | base field catalogue | 3978–3991 | JSON field directory | YES | `v5r-blocks-a.js:565` and `:598` and `:635` (grep "字段目录" — THREE sites on the current tree, not two) |
| `replySpec` | `kind !== 'temp'` → propose_verify + verdict semantics | 3992–3995 | vote rules | PARTIAL | the three "字段目录" sites (`v5r-blocks-a.js:565/598/635`); the temp-vs-non-temp split not verified |
| `replySpec` | `kind === 'temp'` → no-vote wording | 3996–3998 | verdict not applicable | UNSURE | as above |
| `replySpec` | `kind === 'academician'` → convene/assign/prioritize/nudge fields | 4001–4006 | leader-only fields | UNSURE | as above |
| `replySpec` | `formalOn()` → `formal` receipt field + require/encourage wording | 4012–4017 | formal receipt | PARTIAL | `v5r-blocks-b.js:300（同段另有 v5r-blocks-a.js:675）` region mentions formal; require/encourage branch not verified |
| `replySpec` | `kind !== 'temp'` → hire/fire fields incl. `academicianLeads=true` clause | 4020–4026 | hire/fire | UNSURE | as above; `academicianLeads` has **no** schema key (see §2) |
| `replySpec` | tail: vote_solved/meeting_hand/meeting_invite/solved/contextPct/compacted + minimal sample | 4031–4045 | tail fields + sample | YES | charter + corpus (`{{ }}`-parameterised) |
| `stateBlock` | wrapper → `briefBlock` | 4051–4053 | state block | YES | `kernel/turn/index.js:316` takes `statusBlock`; `{{ statusBlock }}` in pipeline |
| `initialPrompt` | `resume` true → "会话重建" branch | 4061–4064 | resume wording | YES | corpus kinds `resume#1–#3` |
| `initialPrompt` | `resume` false → "入职首轮" branch | 4065–4069 | fresh-join wording | YES | corpus kinds `founding#1–#4`, `founding-temp#1`, `founding-leaderless#1/#2` |
| `initialPrompt` | `initialTask` present | 4071 | task/purpose line | UNSURE | branch not verified |
| `initialPrompt` | `member.direction && !resume` | 4072 | direction line | **PARTIAL** (was UNSURE/not verified): the port now **derives** it from roster records — `charterMemberBindings(members)` reads each member's own `direction` (it used to be five literal ids, so a deployment roster silently lost every direction); a member with no `direction` receives the NAMED text `CHARTER_DIRECTION_UNSPECIFIED`. Still PARTIAL because the shipped default passes the CORPUS roster (`CHARTER_CORPUS_ROSTER`, `v5r-charter.js:71`, consumed at `:78`), so a deployment's own roster is not yet wired through | `charterMemberBindings` (`v5r-charter.js:63`) + `CHARTER_MEMBER_BINDINGS` (`:78`) + `CHARTER_CORPUS_ROSTER` (`:71`) + `CHARTER_DIRECTION_UNSPECIFIED` (`:62`), all in `v5r-charter.js` |
| `initialPrompt` | assembly: resourceBlock → `------` → pointerContract → stateBlock → replySpec | 4073–4082 | full prompt skeleton | PARTIAL | corpus captures have `charterChars` recorded (`v5r-prompts.js:56–65`), so the skeleton was captured; the *assembler* that composes these five parts per member was not located in `vibe-math-vmu` (see GAP-6) |
| `normalPrompt` | header + research ask | 4084–4089 | normal round prompt | YES | corpus kinds `normal#1–#10` |
| `normalPrompt` | `kind === 'academician' && params.academicianLeads` → steer/assign/nudge paragraph | 4090–4094 | leader steering paragraph | UNSURE | `academicianLeads` has no schema key; branch not verified |
| `normalPrompt` | `leanDailyOn()` → `formalWorkLine()` | 4095 | daily Lean line | YES | `v5r-blocks-b.js:175` + corpus `lean-work#1` |
| `normalPrompt` | assembly (resource/pointer/state/reply) | 4096–4106 | skeleton | PARTIAL | as row "initialPrompt assembly" |
| `checkpointPrompt` | header + "keep going" text | 4108–4115 | heartbeat prompt | YES | corpus kind `checkpoint#1` |
| `checkpointPrompt` | `leanDailyOn()` → `formalWorkLine()` | 4116 | daily Lean line | YES | charter:868 |
| `meetingPrompt` | invited-temp note | 4135–4139 | invited speaker wording | UNSURE | corpus has only `meeting#1/#2` (acad, r-1) — no invited-temp capture |
| `meetingPrompt` | `others.length` → others' inputs listed | 4140–4145 | other speakers' text | UNSURE | branch not verified |
| `meetingPrompt` | else → "第一位发言者" | 4145–4148 | first-speaker wording | UNSURE | branch not verified |
| `meetingPrompt` | speaking model paragraph with `maxParallel` interpolation | 4149–4154 | 轮流/举手 + maxParallel | PARTIAL | `maxParallel` resolves to `vmu.limits.maxParallel` in schema; the paragraph is captured but the interpolation branch not verified |
| `meetingPrompt` | `input`/`meeting_hand`/`vote_solved` rules | 4156–4163 | vote-vs-silence rules | PARTIAL | as above |
| `meetingPrompt` | `proofStatusBlock()` + `resourceBlock()` appended | 4164–4165 | two appended blocks | YES | charter:748 (proof) + charter:730 (resource) |
| `verifyPrompt` | present in source | 4177 (body not read) | verification/debate prompt | PARTIAL | corpus kinds `verify#1–#3`, `verify-debate#1–#3`, `lean-verify#1–#3`, `lean-fidelity#1–#3`, `lean-require#1–#3` |
| `formalStatusLine(target)` | `passed` / `blocked` / `attempted` / else `未尝试` (4 branches) | 4353–4359 | Lean status one-liner | NO | grep `formalStatusLine` in `vibe-math-vmu` = 0 hits — GAP-2 |
| `takeLeanNoticesFor(memberId)` | `!leanNotices.length` → `[]` | 4857–4858 | empty fast path | NO | 0 hits in port — GAP-1 |
| `takeLeanNoticesFor` | prune notices whose member is gone | 4859–4866 | L8 deep-review fix | NO | GAP-1 |
| `takeLeanNoticesFor` | filter mine, splice them out (one-shot) | 4867–4870 | exactly-once delivery | NO | GAP-1 |
| `leanQueueNotice` | settled / timeout / interrupted / failed (4 branch texts) | 4845–4853 | `【形式化结果】…` lines | PARTIAL | text at `v5r-blocks-b.js:185`; the 4-branch selection (`job.state`) not found in port |
| `leanNotices` queue cap 20 | `while (leanNotices.length > 20) shift()` | 4853 | bounded queue | NO | GAP-1 |
| `mathPromptBlock(lang)` | cached line present → `'\n' + line` | 5209–5211 | math availability line | UNSURE | exact text unknown (see GAP-5); `数学计算可用性` marker: 0 hits |
| `mathPromptBlock` | `params.mathComputation === 'off'` → `''` | 5215 | off switch | NO | no `mathComputation` schema key; GAP-5 |
| `mathPromptBlock` | zh/en variants via `mathAvailabilityLine(probe, lang, mathMode)` | 5216–5219 | zh/en text | UNSURE | GAP-5 |
| `mathPushLine(L)` | pushes only if block non-empty | 5222 | zh push | UNSURE | GAP-5 |
| `paperHintBlock(lang)` | zh/en hint "以下这段仅在你参与论文写作或编译时适用" | 5228–5232 | paper hint | YES | `v5r-prompts.js:113–114`, `:117` |
| `paperPushLine(L)` | wraps hint with a conditional lead-in and pushes | 5233–5241 | paper push | YES | corpus `paper-write#1/#2`, `paper-final#1` |
| `feedbackPushLine(L)` | `!feedbackOn()` → return (no line) | 5403–5404 | off switch | UNSURE | `feedback` has **no** schema key (suffix search empty) — GAP-7 |
| `feedbackPushLine` | body: 「工作经验／流程反馈」+ FEEDBACK_DIR + 3 routes | 5405–5410 | feedback discipline text | YES | `v5r-blocks-b.js:101` (grep "工作经验／流程反馈") |
| `formalPromptBlock(target)` | `!formalOn()` → `''` | 5413–5414 | off switch | UNSURE | requires `vmu.math.formalVerify` (exists) but the port-side gate not located |
| `formalPromptBlock` | header with require/encourage mode | 5418 | mode header | YES | corpus `lean-require#*`, `lean-verify#*` |
| `formalPromptBlock` | `rec.status === 'passed'` → fidelity-review instructions (8 lines) | 5419–5440 | fidelity rules incl. "不要投 0" | YES | corpus kinds `lean-fidelity#1–#3` |
| `formalPromptBlock` | `rec.status === 'blocked'` → re-check the blocking claim | 5441–5443 | blocked branch | YES | corpus kinds (blocked wording inside lean-* captures) — PARTIAL precision: which capture is the `blocked` branch is not machine-labelled |
| `formalPromptBlock` | else → difficulty judgement + tool hints + working dirs | 5444–5458 | default branch | YES | corpus `lean-work#1`, `lean-tool-hint#1` |
| `formalPromptBlock` | `mode === 'require'` → mandatory-archive/blocked rules | 5459–5464 | require branch | YES | corpus `lean-require#1–#3` |
| `formalPromptBlock` | else (encourage) → optional wording | 5465–5467 | encourage branch | PARTIAL | captured, not machine-labelled |
| `formalPromptBlock` | archive-before-use + no-toolchain rules | 5468–5470 | closing rules | PARTIAL | captured only |
| `formalWorkLine()` | `!leanDailyOn()` → `''` | 5473–5474 | off switch | UNSURE | `vmu.math.leanInitiative` exists; port-side gate not located |
| `formalWorkLine` | mode label: require / encourage / eager | 5476–5492 | one-line push | YES | `v5r-blocks-b.js:175`, corpus `lean-work#1` |
| `phaseFactLine()` | `'阶段：' + phase + '｜运行中…｜已结题…'` | 7433–7435 | phase fact line | NO | grep `phaseFact` in port = 0 hits — GAP-8 |
| `meetingVoteBlock(mn)` | present in source | 7728 (body not read) | meeting vote block | NO | grep = 0 hits; UNSURE whether equivalent exists under another name — GAP-8 |
| `paperWritePrompt` / `paperReviewPrompt` / `paperFinalPrompt` | three builders | 8006 / 8035 / 8059 | paper-stage prompts | YES | corpus kinds `paper-write#1/#2`, `paper-review#1/#2`, `paper-final#1` |
| `createPromptPipeline` (port-only) | section registry, 4-dim bindings, overrides, variable whitelist, truncation | — | the assembly MECHANISM | YES (port-only) | `kernel/prompt/index.js:71–728` (`ORDER_RANGES` :24, `VARIABLE_WHITELIST` :50, `BINDING_PRIORITY` :53, `apiVersion` :21, `assemble` :506, `setState` :489, `override` :667, `rollback` :683, `snapshot` :691, `bindToHost` :701, `status` :714 — all re-measured; the pre-change numbers pointed up to ~200 lines too early) |
| `createTurnOrchestrator` (port-only) | phases, FIELD_OWNERS, fence parse, wakeup policy `round-robin`/`least-recent` | — | turn driving | YES (port-only) | `kernel/turn/index.js:30` (`FIELD_OWNERS`), `:86` (`PHASES`), `:103` (`extractFence`), `:274` (factory), `:316` (`open`), `:336` (`assemble`), `:400` (`deliverTurn`), `:467` (`parse`), `:513` (`plan`), `:573` (`apply`), `:619` (`run`), `:652` (`nextTurn`), `:671` (`drive`), `:698` (`step`) — all re-measured |

---

## 2. Parameters / runtime switches the prompt text depends on

"default" = the default **in the original source** (`params.*` reads as written there). "schema key" = a key with that exact name exists in `vibe-math-vmu/settings/schema.js` (exact-string test; a NO means "not under this name", and the nearest suffix match found by regex is given).

| Original switch | Original line | Original default / fallback | schema key (exact) | nearest schema key found |
|---|---|---|---|---|
| `params.verdictMaxRounds` | 2824, 3149 | `Number(...) \|\| 3` (≥1) | NO (`vmu.turn.verdictMaxRounds`) | `vmu.meetings.verdictMaxRounds` |
| `params.quorumCap` | 2770, 2829, 2904 | `\|\| 3` | NO | `vmu.meetings.quorumCap` |
| `params.quorumMode` | 2939 | verbatim | NO | — |
| `params.reconsiderFloor` | 2719 | `\|\| 0` | NO | `vmu.meetings.reconsiderFloor` |
| `params.maxParallel` (resource + meeting text) | 2076, 4152 | `3` | NO (`vmu.turn.maxParallel`) | `vmu.limits.maxParallel` \| `vmu.turn.maxParallel` \| `vmu.math.maxParallel` |
| tool-call cap (resource text) | 2078 | `cap > 0` else no-limit | YES `vmu.limits.toolCallsPerTurnCap` | — |
| memory ceiling (resource + spawn guard) | 2079, 3766–3769 | `> 0` test | YES `vmu.limits.memoryCeilingMb` | — |
| `params.formalVerify` → `formalMode()`/`formalOn()` | 4324–4325 | `'off'` unless in `FORMAL_MODES` | YES `vmu.math.formalVerify` | — |
| `params.leanInitiative` → `leanInitiative()`/`leanDailyOn()` | 4330–4331 | `'normal'`; daily on if formal or eager | YES `vmu.math.leanInitiative` | — |
| `params.academicianLeads` | 4090, 4025 | (falsy unless set) | NO (`vmu.institute.academicianLeads`) | — |
| `params.feedback` → `feedbackOn()` | 5247, 5301, 5404 | `'on'` unless `'off'` | NO (`vmu.turn.feedback`) | — |
| `pointerPropagationOn()` (pointer contract gate) | 2066 | (see GAP-3) | NO (`vmu.turn.pointerPropagation`) | `vmu.records.pointerPropagation` |
| `resourceSelfCheckOn()` (resource gate) | 2070 | (see GAP-4) | NO (`vmu.turn.resourceSelfCheck`) | — |
| `params.compactThreshold` | 3902 | `Number(...)` | NO | — |
| `params.compactAfterRounds` | 3903 | `Number(...)` | NO | — |
| `params.activityTimeoutMs` | 3809, 3919, 4249–4260 | `120000` (via `posMs`) | NO | — |
| `params.chatDigestMax` | 3622 | `\|\| 12` | NO | — |
| `params.chatDigestMs` | 3623, 4275 | `45000` | NO | — |
| `params.staffPersona` | 3677 | `''` | NO | — |
| `params.toolAllow` / `params.tempToolAllow` | 3681 | — | NO | — |
| `params.toolDeny` / `params.tempToolDeny` | 3682 | — | NO | — |
| `params.provider` / `params.model` | 3695–3696 | — | NO | — |
| `params.mathComputation` | 5184, 5215 | `'off'` disables the line | NO | — |
| `params.mathMode` | 5187–5188 | passed to `mathAvailabilityLine` | NO | — |
| `params.mathTimeoutMs` | 5091 | `60000` | NO | — |
| `params.leanTimeoutMs` | 4417, 4849 | `120000` | YES `vmu.math.leanTimeoutMs` | — |
| `params.leanJobsMaxParallel` | 4602 | `\|\| 1` | YES `vmu.math.leanJobsMaxParallel` | — |
| `params.leanCommand` | 4421, 4423, 4666, 4710–4711 | `'lean'` | YES `vmu.math.leanCommand` | — |
| `params.leanArgs` / `params.leanSearchPaths` | 4665, 4676 | `[]` | NO (suffix `leanArgs`/`leanSearchPaths`) | — |
| `params.leanAsync` | 5584 | `!== false` (default async) | YES `vmu.math.leanAsync` | — |
| `params.meetingHardLimitMs` | 4442 | `1800000` clamped to [300000, 7200000] | NO | — |
| `params.meetingWakeRetries` | 4445 | `Number(...)` | NO | — |
| `vmu.institute.name` (charter heading) | charter task-234 note (`v5r-charter.js:10`) | — | NO | — |
| `vmu.turn.objective` | `v5r-charter.js:11` | — | YES `vmu.turn.objective` | — |

---

## 3. GAP LIST

1. **GAP-1 — the Lean notice one-shot queue is missing entirely (NO).** Original: `leanQueueNotice` (4845–4853), the 20-slot cap (4853), `takeLeanNoticesFor` (4857–4870), and the call site inside `briefBlock` (3262). Port: grep `leanNotice` / `takeLeanNotices` over all of `vibe-math-vmu/**/*.js` = **0 hits**. The notice *text* is present (`v5r-blocks-b.js:185`, corpus kinds `lean-work`, `lean-after-defect`, `lean-tool-hint`), but nothing implements "each settled result is announced exactly once, in the member's next prompt" nor the L8 prune of notices for inactive members. Evidence that would settle whether an equivalent exists elsewhere: a service-level test that asserts a settled lean job appears in exactly one subsequent prompt.
2. **GAP-2 — `formalStatusLine` missing (NO).** Original 4353–4359, four branches (`passed` / `blocked` / `attempted` / `未尝试`). Port: grep = 0 hits. If the four strings appear inside captures, say so; otherwise the status one-liner is missing.
3. **GAP-3 — `pointerPropagationOn()` and the `pointerContractBlock` off-switch missing (UNSURE → likely NO).** Original 2066 (and the switch itself not read). Port: no gate found; `vmu.turn.pointerPropagation` does not exist as a key (only `vmu.records.pointerPropagation`).
4. **GAP-4 — `resourceSelfCheckOn()` off-switch missing (UNSURE → likely NO).** Original 2070. Port: no gate found; no `*resourceSelfCheck*` key in schema.
5. **GAP-5 — `mathPromptBlock` / `mathPushLine` / the math availability line (UNSURE).** Original 5209–5222, including the `params.mathComputation === 'off'` branch (5215) and `mathAvailabilityLine(probe, lang, params.mathMode)` (5187–5188). Port: marker `数学计算可用性` = 0 hits; `mathComputation`/`mathMode` have no schema keys. Evidence needed: locate `mathAvailabilityLine` in the original (it is not declared as `function mathAvailabilityLine`, so it is likely a `const … =>`), take its first literal line, and grep that exact string in `vibe-math-vmu`.
6. **GAP-6 — no vmu-side **assembler** found that composes the five-part round prompt (UNSURE).** The original assembles `resourceBlock() → '------------' → pointerContractBlock() → stateBlock() → '------------' → replySpec(kind)` in `initialPrompt` (4073–4082), `normalPrompt` (4096–4106), `checkpointPrompt` (4120–4126) and `meetingPrompt` (4169–4175). The port has the *mechanism* (`kernel/prompt/index.js`) and the *text* (charter/corpus), but I did not find the code that, for a given member/phase, chooses these five parts in this order. Evidence needed: a pack/bootstrap file that registers the five sections in this order, or a test asserting the assembled byte order.
7. **GAP-7 — `feedbackOn()` off-switch missing (UNSURE).** Original 5404 (`if (!feedbackOn()) return`), switch defined at 5247 (`params.feedback || 'on'`). Port: the text is at `v5r-blocks-b.js:101`, but `feedback` has no schema key and no gate was found.
8. **GAP-8 — `phaseFactLine` and `meetingVoteBlock` missing (NO).** Original 7433–7435 and 7728. Port: `phaseFact` = 0 hits, `meetingVoteBlock` = 0 hits. (Not read in full; the originals' full bodies were outside the ranges I read.)
9. **GAP-9 — `meetingPrompt`'s two speaker-state branches are not represented as captures (UNSURE).** Original 4135–4148 has three states (invited temp / others already spoke / you are first). The corpus contains only `meeting#1` (acad) and `meeting#2` (r-1) (`v5r-prompts.js:83–84`), so at most one of the three states is captured. Evidence needed: the corpus JSON's per-prompt `charterChars`/context fields (or a test that assembles the invited-temp and first-speaker variants).
10. **GAP-10 — the two read passes disagreed; RESOLVED in task-219 (the UTF-8 pass was right, and the `briefBlock` rows were the ANSI ones).** Re-measured on the current tree: `function charterFor` is at **3131** and `function kindLabel(k)` is at **3422** (with a DIFFERENT function, `kindLabel2`, at 4242 — so the old "second sighting at 3284" was an artifact, not a second definition). `function briefBlock` is at **3376**, and every `briefBlock` row above had been taken from the ANSI pass and was off by **exactly +138**: the decisive datum is the row that cites the notice call, whose text is `takeLeanNoticesFor(member.id)` — measured at **3400**, while the row said 3262 (3400 − 3262 = 138); the guard row (old 3239) likewise measures 3376–3379. All `briefBlock` rows are corrected above. No `git` was run for this (the repo forbids it in this task); the check is a UTF-8 line-indexed read.
11. **GAP-11 — branch-level parity of `replySpec` is unproven (UNSURE).** The original has four conditional additions (3992, 4001, 4012, 4020). I found only two "字段目录" sites in the charter (`v5r-blocks-a.js:565`, `:598`) — **re-measured on the current tree there are THREE: `v5r-blocks-a.js:565`, `:598`, `:635`**. Evidence needed: the role-variant bindings (`CHARTER_ROLE_BINDINGS`, `v5r-charter.js:40`) mapped to the `temp` / `academician` variants of the field catalogue.
12. **GAP-12 — `resourceBlock`'s three internal branches are unproven (UNSURE).** Original 2078 (`cap > 0`), 2079 (`mb > 0`), each with two wordings. Only the block's presence is confirmed (`v5r-blocks-b.js:36`). Evidence needed: a rendered prompt with `cap = 0` and with `mb = 0`.

UNSURE items are listed as UNSURE on purpose; I did not convert them to NO, and I did not convert an absence of my probe string into an absence of the feature.

---

## 4. How I checked

Line ranges actually read (UTF-8 `ReadAllText` unless noted):

- Original `vibe-math-v5r/vibe-math-v5r.js`: declaration grep over the whole file; structural pass over 3120–3430 (charter/brief), 2065–2130 (pointer/resource/proofStatus), 3018–3035 (rosterLine), 3978–4180 (replySpec/state/initial/normal/checkpoint/meeting), 4353–4375 (formalStatusLine), 4857–4880 + 4845–4853 (lean notices), 5209–5245 (math/paper), 5403–5500 (feedback/formal blocks), 7433–7445 (phaseFactLine), and grep-driven selection of parameter lines in 2500–5600. Not read: `verifyPrompt` body (4177+), `meetingVoteBlock` (7728+), `paperWrite/Review/FinalPrompt` bodies (8006+), `mathAvailabilityLine` body.
- Port: full structural pass of `packs/v5r/prompts/v5r-persona.js` (**219 lines**, re-measured); full read of `packs/v5r/prompts/v5r-prompts.js` (**121 lines**, re-measured — this line used to say 117); declaration/section pass of `packs/v5r/prompts/v5r-charter.js` (**132 lines** on the current tree, re-measured — this line used to say 902, the pre-split figure) plus `packs/v5r/prompts/v5r-blocks-a.js` (**732 lines**) and `v5r-blocks-b.js` (**704 lines**), which is where the fragment texts now live; structural pass of `kernel/prompt/index.js` (**729 lines**) and `kernel/turn/index.js` (**728 lines**) — both re-measured, and both had been cited with pre-change numbers (488 / 304).
- Exact-string coverage probes (port side): `本机可能资源紧张`→`v5r-blocks-b.js:36`; `我刚才读过`→`v5r-blocks-b.js:80`; `命题准入`→`v5r-blocks-b.js:54`; `工作经验／流程反馈`→`v5r-blocks-b.js:101`; `顺手形式化`→`v5r-blocks-b.js:175` + `v5r-prompts.js:101,111`; `【形式化结果】`→`v5r-blocks-b.js:185` + corpus; `字段目录`→`v5r-blocks-a.js:565,598,635`; `[状态]`→`v5r-blocks-a.js:530`; `以下这段仅在你参与`→`v5r-prompts.js:113,114,117`; `数学计算可用性`→0 hits; `leanNotice`/`takeLeanNotices`/`phaseFact`/`formalStatusLine`/`meetingVoteBlock`→0 hits.
- I did not run any test, did not run the gate, and modified no file other than this report.

---

## 5. Re-anchor log (phase-3, task-219 — the commit-ready summary)

BASIS: every number below was re-measured on the current tree with a UTF-8 line-indexed read (`node`, `readFileSync(...).split(/\r?\n/)`), never from memory and never from the pre-split citation. **No `git` was run** (this task forbids it). ★ **LIVE DRIFT, disclosed**: `v5r-blocks-a.js` measured **698 lines** when this pass started and **732 lines** when the cites were re-checked minutes later (a sibling writer was editing it) ⇒ every `v5r-blocks-a.js` number quoted here is the **732-line** measurement (+34 against the first read: `[状态]` 496→530, `字段目录` 531/564/601→565/598/635, `Lean 形式化验证` 641→675, the `v5r-turn-heading` block 650–661→685–694), and `v5r-blocks-b.js` was stable at 704 throughout. **This is the same class as the disease this task fixes**: the moment a file grows, settled citations drift, so the count is stated with its measurement point. File line counts used: `v5r-charter.js` 132, `v5r-blocks-a.js` 732, `v5r-blocks-b.js` 704, `v5r-prompts.js` 121, `v5r-persona.js` 219, `v5r-assistant.js` 39, `kernel/prompt/index.js` 729, `kernel/turn/index.js` 728, authority `vibe-math-v5r.js` 11,597.

### 5.1 Port-side citations changed (old → new, and the phrase that resolved it)

| # | Old citation | New citation | Resolved by |
|---|---|---|---|
| 1 | `v5r-charter.js:774` | `v5r-blocks-b.js:80` | grep "我刚才读过" |
| 2 | `v5r-charter.js:730` (two rows) | `v5r-blocks-b.js:36` | grep "本机可能资源紧张" |
| 3 | `v5r-charter.js:748` (two rows) | `v5r-blocks-b.js:54` | grep "命题准入" |
| 4 | `v5r-charter.js:517` | `v5r-blocks-a.js:530` | grep "[状态]" |
| 5 | `v5r-charter.js:660` (two rows) | `v5r-blocks-b.js:300` (+ `v5r-blocks-a.js:675`) | grep "Lean 形式化验证" |
| 6 | `v5r-charter.js:868` (two rows) | `v5r-blocks-b.js:175` | grep "顺手形式化" |
| 7 | `v5r-charter.js:794` (two rows) | `v5r-blocks-b.js:101` | grep "工作经验／流程反馈" |
| 8 | `v5r-charter.js:878` (three rows) | `v5r-blocks-b.js:185` | grep "【形式化结果】" |
| 9 | `v5r-charter.js:550` and `:583` (two rows) | `v5r-blocks-a.js:565`, `:598`, plus a THIRD site `:635` | grep "字段目录" |
| 10 | `v5r-charter.js:885` | `v5r-charter.js:40` | symbol `CHARTER_ROLE_BINDINGS` (same file, new line) |
| 11 | `v5r-charter.js:896` | `v5r-charter.js:82` | symbol `CHARTER_LEADER_VARIANTS` (same file, new line) |
| 12 | `kernel/turn/index.js:154` / `:153` | `:316` (the `open()` parameter list that takes `statusBlock`) | symbol `const open = ({ member` |
| 13 | `kernel/turn/index.js:176` (the `roleLabel` map) | **the map does not exist** — replaced by `:316` (param) ＋ `:349` (fallback) ＋ `v5r-blocks-a.js:685–694` (headings that interpolate it) | grep `roleLabel` over all of `vibe-math-vmu` (26 hits) |
| 14 | `kernel/prompt/index.js:71–518` with `:312 :457 :473 :491 :504` | `:71–728` with `:489 :667 :683 :701 :714` | symbols `setState` / `override` / `rollback` / `bindToHost` / `status` |
| 15 | `kernel/turn/index.js:57 :136 :153 :199 :218 :264` | `:103 :274 :316 :467 :513 :652` (+ added `:86 :336 :400 :573 :619 :671 :698`) | symbols `extractFence` / factory / `open` / `parse` / `plan` / `nextTurn` |

### 5.2 Original-side citations changed

| # | Old range | New range | Why |
|---|---|---|---|
| 1 | `3239–3241` | `3376–3379` | `function briefBlock` measures 3376; the guard 3377–3379 (off by +138) |
| 2 | `3244–3245` | `3382–3383` | `b.push('[状态] 你是 …')` measures 3382 |
| 3 | `3249–3250` | `3387–3388` | `[未就位]` branch measures 3387–3388 |
| 4 | `3253–3259` | `3391–3397` | `if (formalOn()) {` measures 3391 |
| 5 | `3262` | `3400` | **decisive**: `takeLeanNoticesFor(member.id)` measures 3400 |
| 6 | `3266–3269` | `3404–3407` | `if (tasks.length) {` measures 3404 |
| 7 | `3270–3276` | `3408–3414` | `if (mine.length) {` measures 3408 |
| 8 | `3277–3281` | `3415–3419` | `const pending = …` measures 3415 |

Every OTHER original-side range was re-checked against the `function` declaration of the row's function and **matches** (372, 2065, 2069, 2087, 3018, 3131, 3422, 3978, 4051, 4054, 4084, 4108, 4128, 4177, 4353, 4845, 4857, 5209, 5222, 5228, 5233, 5403, 5413, 5473, 7433, 7728, 8006, 8035, 8059 — all measured this round).

### 5.3 NOT resolvable (named with the phrase searched)

1. `kindLabel`'s **kind → Chinese label MAP**: searched `academician: '院士'`, `roleLabel = {academician`, and the whole `vibe-math-vmu` tree for `roleLabel` (26 hits, all listed above) ⇒ **no map exists**; the row's status was changed YES → **PARTIAL** for that reason. The phrases searched are recorded in the row itself.
2. `mathAvailabilityLine`'s first literal line (GAP-5): searched `数学计算可用性` (0 hits) — **still unresolved**, unchanged by this pass.
3. `phaseFact` (GAP-8): searched `phaseFact` (0 hits) — **still unresolved**.
4. `meetingVoteBlock` (GAP-8): searched `meetingVoteBlock` (0 hits) — **still unresolved**.
5. `leanNotice` / `takeLeanNotices` (GAP-1): searched both (0 hits) — **still unresolved as a mechanism**; the TEXT is now anchored at `v5r-blocks-b.js:185`.
6. `formalStatusLine` as a FUNCTION is absent, but the phrase `formalStatusLine` **does** appear as a source marker at `v5r-blocks-b.js:189` (the block records which original function it came from) and the four branch words including `未尝试` appear at `v5r-blocks-b.js:245` ⇒ the row (GAP-2) should be re-read as "the LINE exists in the charter text; the FUNCTION does not" — recorded here rather than silently upgraded to YES.

### 5.4 SAME STALENESS ELSEWHERE (recorded, NOT fixed — for the Lead to schedule)

A grep for `v5r-charter.js:` and `v5r-blocks-` over `vibe-math-vmu/docs/**` and `docs/**`:

| File | What it carries | Verdict |
|---|---|---|
| `vibe-math-vmu/docs/audit/pack-content-review.md` | **11 citations of the pre-split `v5r-charter.js:NNN`** — lines 113 (`:51/52/56`), 114 (`:267/290`), 115 (`:353/373`), 116 (`:660`), 117 (`:678`), 119 (`:907`), 120 (`:19–20`), 124 (`:730–734`), 125 (`:551–575`), 126 (`:699`), 170 (`:199`), 171 (`:551–575`) | **STALE — every line number exceeds the current 132-line file** ⇒ needs the same re-anchor pass |
| `docs/acceptance/phase3-parity-prompt-assembly.md` (my own task-213 deliverable) | `v5r-charter.js:49-55`, `:59-60`, `:74` | **STALE** — measured now: `CHARTER_MEMBER_BINDINGS` `:78`, `CHARTER_LEADER_VARIANTS` `:82`, `charterSections` `:108` (the `order: b.order` line moved from 74 to 109) ⇒ schedule a fix |
| `docs/acceptance/phase3-parity-prompt-content.md` | `v5r-blocks-a.js:59/74/143/305/456`, `v5r-blocks-b.js:…`, original `L3131–L3361` | within range on the current files; the original range start (3131) is confirmed ⇒ **not stale**, but its block-count claim ("57 blocks") was not re-checked here |
| `docs/acceptance/09-goal4-verdict.md` (`v5r-blocks-b.js:235,581`), `phase2-verify-round12.md` (`:89`), `resume-round5-report.md` (`v5r-blocks-a.js:542/579/611`), `assistant-round41-report.md` (`v5r-blocks-a.js:55`), `17-objective-status.md` (`v5r-assistant.js:29-32`, `v5r-blocks-a.js:55`) | file:line into the split files | all inside the current file lengths ⇒ **not stale by range**; not re-verified line-by-line |
| `vibe-math-vmu/docs/27-pack-folder.md` (7, 41, 243), `docs/acceptance/04-parity-matrix.md` (113, 133), `lead-gap-map.md` (56), `pack-round42-report.md` (21), `docs/10-packs.md` (135) | file NAMES only, no line numbers | **not stale** |

### 5.5 Verification of THIS file

- Every `v5r-charter.js:NNN` citation left in this file is either `:10` / `:11` (re-measured true) or a **new** line in the 132-line file (`:40`, `:62`, `:63`, `:71`, `:78`, `:82`, `:98–99`, `:108`, `:131`) — no pre-split number remains.
- Every `v5r-blocks-*` citation points into the current 732 / 704 lines.
- `check-docs` and `audit-doc-index` were run after the edits (see the task report for exit codes).

