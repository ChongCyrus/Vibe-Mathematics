# Source → vmu prompt/orchestration coverage audit

AUDIT TARGET: `vibe-math-v5r/vibe-math-v5r.js` (authority; **11,166 lines** as measured, not 11,597).
PORT UNDER TEST: `vibe-math-vmu/packs/v5r-charter.js` (902 lines, hand-transcribed), `vibe-math-vmu/packs/v5r-prompts.js` (117 lines, generated corpus: 67 prompts / 31 kinds / 79,138 chars), `vibe-math-vmu/packs/v5r-persona.js` (214 lines, generated: 11 sections), `vibe-math-vmu/kernel/prompt/index.js` (488 lines), `vibe-math-vmu/kernel/turn/index.js` (304 lines), `vibe-math-vmu/settings/schema.js`.
CLAIMS TESTED (not evidence): `vibe-math-vmu/docs/26-turn-orchestration.md` §3.6–3.18.

READING NOTE: my first structural pass used PowerShell `Get-Content` (ANSI decode) and produced mojibake **and offsets that disagreed with a UTF-8 pass**. Every line number below comes from a UTF-8 `ReadAllText` pass cross-checked by a declaration grep. Where the two passes disagreed I say so explicitly in the gap list. Nothing below is quoted from a design note.

---

## 1. Function / branch coverage

Legend for COVERED: **YES** = the text and its variation points are present in the port; **PARTIAL** = text present but a branch, guard or selection rule could not be found; **NO** = text not found in the port; **UNSURE** = my probe string did not settle it (evidence needed is stated in §3).

| Function | Branch | Original lines | Produces | Covered | vmu side (file:line / path) |
|---|---|---|---|---|---|
| `headerListContractBlock` | single (no branch) | 372–383 | 7-line "指针传播 · 头部列表（机制约束）" block | PARTIAL | text at `v5r-charter.js:774` (grep hit "我刚才读过"); the 7 sub-bullets not individually verified |
| `pointerContractBlock` | `!pointerPropagationOn()` → `[]` | 2065–2066 | gate: no block when switch off | UNSURE | no port-side gate found; see GAP-3 |
| `pointerContractBlock` | default → `headerListContractBlock()` | 2067–2068 | delegates to 372–383 | PARTIAL | same as row 1 |
| `resourceBlock` | `!resourceSelfCheckOn()` → `[]` | 2069–2070 | gate: no block when switch off | UNSURE | no port-side gate found; see GAP-4 |
| `resourceBlock` | emits `maxParallel` line | 2075–2076 | "并发：框架每轮最多同时唤醒 N 名成员（maxParallel）" | YES | `v5r-charter.js:730` (grep "本机可能资源紧张"); N becomes a variable |
| `resourceBlock` | emits tool-budget line (`cap > 0` vs. not) | 2078 | "工具预算：本回合工具调用不超过 cap 次" / "未设上限" | UNSURE | two branches; only the block text was confirmed, not both branches |
| `resourceBlock` | emits self-monitor line (`mb > 0` vs. not) | 2079 | memory-ceiling sentence | UNSURE | as above |
| `resourceBlock` | emits trade-off sentence | 2082 | "正确性优先于产出量…" | UNSURE | as above |
| `proofStatusBlock` | single (no branch) | 2087–2097 | 「命题准入（本所纪律）」block | YES | `v5r-charter.js:748` (grep "命题准入") |
| `rosterLine(ex)` | academician / researcher / temp three groupings + `(hiredBy 雇)` suffix | 3018–3032 | roster line | PARTIAL | `{{ roster }}` is a whitelisted variable (`kernel/prompt/index.js:50`); the three groupings/`雇` suffix not verified in port |
| `charterFor(member)` | `kind === 'temp'` → no-vote wording | 3133–3136 | "你没有表决权…" | YES | `v5r-charter.js` role blocks (kind `role`); corpus `founding-temp#1` |
| `charterFor` | non-temp → quorum rules (a)(b)(c), m formula | 3137–3153 | Verified-gate rules, `verdictMaxRounds` interpolation (L3149) | YES | `v5r-charter.js` role blocks + `v5r-prompts.js:56–62` |
| `charterFor` | `kind === 'academician'` → one-vote sentence | 3154–3156 | "院士与所有有表决权者相同的一票" | YES | corpus `founding#1` (owner `acad`) + charter role block |
| `charterFor` | per-round section (6. each round) | 3159–3170 | default round rhythm | YES | charter shared/phase block |
| `charterFor` | `kind === 'temp'` hire/fire wording | 3174–3175 | temp: hire/fire decided by owner/leader | YES | charter role block + `founding-temp#1` |
| `charterFor` | non-temp hire/fire wording | 3176–3184 | self-hire `vibe_v5_hire`, fire own temps, `vibe_v5_fire` | YES | charter role block |
| `charterFor` | `acadId` present → leader-total-control sentence | 3185–3188 | "院士统辖全所的用人" | YES (leader-conditional) | `CHARTER_LEADER_VARIANTS` (`v5r-charter.js:896`), `CHARTER_BLOCKS` kind `leader-conditional` |
| `charterFor` | task-board section + `acadId` present | 3192–3201 | "院士可以直接分派任务 / 优先级由院士牵头" | YES | charter blocks |
| `charterFor` | task-board section + no leader | 3202–3207 | "本所没有院士…优先级由集体协商" | YES | `CHARTER_LEADER_VARIANTS` + corpus `founding-leaderless#1/#2` |
| `charterFor` | context section | 3210–3215 | compression notice + JSON-per-round | YES | charter shared block |
| `charterFor` | stop section | 3218–3221 | stop only when all voters agree | YES | charter shared block |
| `briefBlock(member, roundNo)` | unknown identity → `V5_INTERNAL` throw | 3239–3241 | guard | UNSURE | no port-side equivalent found (mechanism may be `kernel/turn/index.js:154`) |
| `briefBlock` | `[状态]` header with `m`/voter count | 3244–3245 | status line | YES | `v5r-charter.js:517` (grep `[状态]`) |
| `briefBlock` | `[在册]` line | 3246 | on-roster list | YES | charter block |
| `briefBlock` | `absent.length` → `[未就位]` line | 3249–3250 | not-on-floor members visible | UNSURE | branch not verified |
| `briefBlock` | `formalOn()` → `[形式化]` line with passed/blocked/TODO counts | 3253–3259 | Lean status line | YES | `v5r-charter.js:660` (grep "Lean 形式化验证"); counts become variables |
| `briefBlock` | `takeLeanNoticesFor(member.id)` → one-shot notice lines | 3262 | settled-compile announcements | NO | no `takeLeanNotices`/`leanNotice` anywhere in `vibe-math-vmu` (grep hits 0); the *text* exists at `v5r-charter.js:878` but the one-shot delivery queue does not — GAP-1 |
| `briefBlock` | `tasks.length` → `[任务板]` line | 3266–3269 | in-progress/ready/mine counts | YES | charter block |
| `briefBlock` | `mine.length` → per-task lines with acceptance/assignedBy/description | 3270–3276 | my tasks | UNSURE | branch not verified |
| `briefBlock` | `pending.length` → `[新到的消息/通知]` with `inboxSuppressed` gate | 3277–3281 | inbox block | PARTIAL | corpus kinds `notice-task`, `inbox-*` exist (text), `inboxSuppressed` gate not found |
| `kindLabel(k)` | academician / researcher / temp | 3422 (second `kindLabel` sighting at 3284 — see GAP-10) | role label | YES | `kernel/turn/index.js:176` `roleLabel = {academician:'院士',researcher:'常驻研究员',temp:'临时工'}` |
| `replySpec(kind)` | base field catalogue | 3978–3991 | JSON field directory | YES | `v5r-charter.js:550`, `:583` (grep "字段目录") |
| `replySpec` | `kind !== 'temp'` → propose_verify + verdict semantics | 3992–3995 | vote rules | PARTIAL | two occurrences only (550/583); the temp-vs-non-temp split not verified |
| `replySpec` | `kind === 'temp'` → no-vote wording | 3996–3998 | verdict not applicable | UNSURE | as above |
| `replySpec` | `kind === 'academician'` → convene/assign/prioritize/nudge fields | 4001–4006 | leader-only fields | UNSURE | as above |
| `replySpec` | `formalOn()` → `formal` receipt field + require/encourage wording | 4012–4017 | formal receipt | PARTIAL | `v5r-charter.js:660` region mentions formal; require/encourage branch not verified |
| `replySpec` | `kind !== 'temp'` → hire/fire fields incl. `academicianLeads=true` clause | 4020–4026 | hire/fire | UNSURE | as above; `academicianLeads` has **no** schema key (see §2) |
| `replySpec` | tail: vote_solved/meeting_hand/meeting_invite/solved/contextPct/compacted + minimal sample | 4031–4045 | tail fields + sample | YES | charter + corpus (`{{ }}`-parameterised) |
| `stateBlock` | wrapper → `briefBlock` | 4051–4053 | state block | YES | `kernel/turn/index.js:153` takes `statusBlock`; `{{ statusBlock }}` in pipeline |
| `initialPrompt` | `resume` true → "会话重建" branch | 4061–4064 | resume wording | YES | corpus kinds `resume#1–#3` |
| `initialPrompt` | `resume` false → "入职首轮" branch | 4065–4069 | fresh-join wording | YES | corpus kinds `founding#1–#4`, `founding-temp#1`, `founding-leaderless#1/#2` |
| `initialPrompt` | `initialTask` present | 4071 | task/purpose line | UNSURE | branch not verified |
| `initialPrompt` | `member.direction && !resume` | 4072 | direction line | UNSURE | branch not verified |
| `initialPrompt` | assembly: resourceBlock → `------` → pointerContract → stateBlock → replySpec | 4073–4082 | full prompt skeleton | PARTIAL | corpus captures have `charterChars` recorded (`v5r-prompts.js:56–65`), so the skeleton was captured; the *assembler* that composes these five parts per member was not located in `vibe-math-vmu` (see GAP-6) |
| `normalPrompt` | header + research ask | 4084–4089 | normal round prompt | YES | corpus kinds `normal#1–#10` |
| `normalPrompt` | `kind === 'academician' && params.academicianLeads` → steer/assign/nudge paragraph | 4090–4094 | leader steering paragraph | UNSURE | `academicianLeads` has no schema key; branch not verified |
| `normalPrompt` | `leanDailyOn()` → `formalWorkLine()` | 4095 | daily Lean line | YES | `v5r-charter.js:868` + corpus `lean-work#1` |
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
| `leanQueueNotice` | settled / timeout / interrupted / failed (4 branch texts) | 4845–4853 | `【形式化结果】…` lines | PARTIAL | text at `v5r-charter.js:878`; the 4-branch selection (`job.state`) not found in port |
| `leanNotices` queue cap 20 | `while (leanNotices.length > 20) shift()` | 4853 | bounded queue | NO | GAP-1 |
| `mathPromptBlock(lang)` | cached line present → `'\n' + line` | 5209–5211 | math availability line | UNSURE | exact text unknown (see GAP-5); `数学计算可用性` marker: 0 hits |
| `mathPromptBlock` | `params.mathComputation === 'off'` → `''` | 5215 | off switch | NO | no `mathComputation` schema key; GAP-5 |
| `mathPromptBlock` | zh/en variants via `mathAvailabilityLine(probe, lang, mathMode)` | 5216–5219 | zh/en text | UNSURE | GAP-5 |
| `mathPushLine(L)` | pushes only if block non-empty | 5222 | zh push | UNSURE | GAP-5 |
| `paperHintBlock(lang)` | zh/en hint "以下这段仅在你参与论文写作或编译时适用" | 5228–5232 | paper hint | YES | `v5r-prompts.js:113–114`, `:117` |
| `paperPushLine(L)` | wraps hint with a conditional lead-in and pushes | 5233–5241 | paper push | YES | corpus `paper-write#1/#2`, `paper-final#1` |
| `feedbackPushLine(L)` | `!feedbackOn()` → return (no line) | 5403–5404 | off switch | UNSURE | `feedback` has **no** schema key (suffix search empty) — GAP-7 |
| `feedbackPushLine` | body: 「工作经验／流程反馈」+ FEEDBACK_DIR + 3 routes | 5405–5410 | feedback discipline text | YES | `v5r-charter.js:794` (grep "工作经验／流程反馈") |
| `formalPromptBlock(target)` | `!formalOn()` → `''` | 5413–5414 | off switch | UNSURE | requires `vmu.math.formalVerify` (exists) but the port-side gate not located |
| `formalPromptBlock` | header with require/encourage mode | 5418 | mode header | YES | corpus `lean-require#*`, `lean-verify#*` |
| `formalPromptBlock` | `rec.status === 'passed'` → fidelity-review instructions (8 lines) | 5419–5440 | fidelity rules incl. "不要投 0" | YES | corpus kinds `lean-fidelity#1–#3` |
| `formalPromptBlock` | `rec.status === 'blocked'` → re-check the blocking claim | 5441–5443 | blocked branch | YES | corpus kinds (blocked wording inside lean-* captures) — PARTIAL precision: which capture is the `blocked` branch is not machine-labelled |
| `formalPromptBlock` | else → difficulty judgement + tool hints + working dirs | 5444–5458 | default branch | YES | corpus `lean-work#1`, `lean-tool-hint#1` |
| `formalPromptBlock` | `mode === 'require'` → mandatory-archive/blocked rules | 5459–5464 | require branch | YES | corpus `lean-require#1–#3` |
| `formalPromptBlock` | else (encourage) → optional wording | 5465–5467 | encourage branch | PARTIAL | captured, not machine-labelled |
| `formalPromptBlock` | archive-before-use + no-toolchain rules | 5468–5470 | closing rules | PARTIAL | captured only |
| `formalWorkLine()` | `!leanDailyOn()` → `''` | 5473–5474 | off switch | UNSURE | `vmu.math.leanInitiative` exists; port-side gate not located |
| `formalWorkLine` | mode label: require / encourage / eager | 5476–5492 | one-line push | YES | `v5r-charter.js:868`, corpus `lean-work#1` |
| `phaseFactLine()` | `'阶段：' + phase + '｜运行中…｜已结题…'` | 7433–7435 | phase fact line | NO | grep `phaseFact` in port = 0 hits — GAP-8 |
| `meetingVoteBlock(mn)` | present in source | 7728 (body not read) | meeting vote block | NO | grep = 0 hits; UNSURE whether equivalent exists under another name — GAP-8 |
| `paperWritePrompt` / `paperReviewPrompt` / `paperFinalPrompt` | three builders | 8006 / 8035 / 8059 | paper-stage prompts | YES | corpus kinds `paper-write#1/#2`, `paper-review#1/#2`, `paper-final#1` |
| `createPromptPipeline` (port-only) | section registry, 4-dim bindings, overrides, variable whitelist, truncation | — | the assembly MECHANISM | YES (port-only) | `kernel/prompt/index.js:71–518` (`ORDER_RANGES` :24, `VARIABLE_WHITELIST` :50, `BINDING_PRIORITY` :53, `setState` :312, `override` :457, `rollback` :473, `bindToHost` :491, `status` :504) |
| `createTurnOrchestrator` (port-only) | phases, FIELD_OWNERS, fence parse, wakeup policy `round-robin`/`least-recent` | — | turn driving | YES (port-only) | `kernel/turn/index.js:30` (`FIELD_OWNERS`), `:57` `extractFence`, `:136` factory, `:153` `open`, `:199` `parse`, `:218` `plan`, `:264` `nextTurn` |

---

## 2. Parameters / runtime switches the prompt text depends on

"default" = the default **in the original source** (`params.*` reads as written there). "schema key" = a key with that exact name exists in `vibe-math-vmu/settings/schema.js` (exact-string test; a NO means "not under this name", and the nearest suffix match found by regex is given).

| Original switch | Original line | Original default / fallback | schema key (exact) | nearest schema key found |
|---|---|---|---|---|
| `params.verdictMaxRounds` | 2824, 3149 | `Number(...) \|\| 3` (≥1) | NO (`vmu.turn.verdictMaxRounds`) | `vmu.meetings.verdictMaxRounds` |
| `params.quorumCap` | 2770, 2829, 2904 | `\|\| 3` | NO | `vmu.meetings.quorumCap` |
| `params.quorumMode` | 2939 | verbatim | NO | — |
| `params.reconsiderFloor` | 2719 | `\|\| 0` | NO | `vmu.meetings.reconsiderFloor` |
| `params.maxParallel` (resource + meeting text) | 2076, 4152 | `3` | NO (`vmu.turn.maxParallel`) | `vmu.limits.maxParallel` \| `vmu.resources.maxParallel` \| `vmu.math.maxParallel` |
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

1. **GAP-1 — the Lean notice one-shot queue is missing entirely (NO).** Original: `leanQueueNotice` (4845–4853), the 20-slot cap (4853), `takeLeanNoticesFor` (4857–4870), and the call site inside `briefBlock` (3262). Port: grep `leanNotice` / `takeLeanNotices` over all of `vibe-math-vmu/**/*.js` = **0 hits**. The notice *text* is present (`v5r-charter.js:878`, corpus kinds `lean-work`, `lean-after-defect`, `lean-tool-hint`), but nothing implements "each settled result is announced exactly once, in the member's next prompt" nor the L8 prune of notices for inactive members. Evidence that would settle whether an equivalent exists elsewhere: a service-level test that asserts a settled lean job appears in exactly one subsequent prompt.
2. **GAP-2 — `formalStatusLine` missing (NO).** Original 4353–4359, four branches (`passed` / `blocked` / `attempted` / `未尝试`). Port: grep = 0 hits. If the four strings appear inside captures, say so; otherwise the status one-liner is missing.
3. **GAP-3 — `pointerPropagationOn()` and the `pointerContractBlock` off-switch missing (UNSURE → likely NO).** Original 2066 (and the switch itself not read). Port: no gate found; `vmu.turn.pointerPropagation` does not exist as a key (only `vmu.records.pointerPropagation`).
4. **GAP-4 — `resourceSelfCheckOn()` off-switch missing (UNSURE → likely NO).** Original 2070. Port: no gate found; no `*resourceSelfCheck*` key in schema.
5. **GAP-5 — `mathPromptBlock` / `mathPushLine` / the math availability line (UNSURE).** Original 5209–5222, including the `params.mathComputation === 'off'` branch (5215) and `mathAvailabilityLine(probe, lang, params.mathMode)` (5187–5188). Port: marker `数学计算可用性` = 0 hits; `mathComputation`/`mathMode` have no schema keys. Evidence needed: locate `mathAvailabilityLine` in the original (it is not declared as `function mathAvailabilityLine`, so it is likely a `const … =>`), take its first literal line, and grep that exact string in `vibe-math-vmu`.
6. **GAP-6 — no vmu-side **assembler** found that composes the five-part round prompt (UNSURE).** The original assembles `resourceBlock() → '------------' → pointerContractBlock() → stateBlock() → '------------' → replySpec(kind)` in `initialPrompt` (4073–4082), `normalPrompt` (4096–4106), `checkpointPrompt` (4120–4126) and `meetingPrompt` (4169–4175). The port has the *mechanism* (`kernel/prompt/index.js`) and the *text* (charter/corpus), but I did not find the code that, for a given member/phase, chooses these five parts in this order. Evidence needed: a pack/bootstrap file that registers the five sections in this order, or a test asserting the assembled byte order.
7. **GAP-7 — `feedbackOn()` off-switch missing (UNSURE).** Original 5404 (`if (!feedbackOn()) return`), switch defined at 5247 (`params.feedback || 'on'`). Port: the text is at `v5r-charter.js:794`, but `feedback` has no schema key and no gate was found.
8. **GAP-8 — `phaseFactLine` and `meetingVoteBlock` missing (NO).** Original 7433–7435 and 7728. Port: `phaseFact` = 0 hits, `meetingVoteBlock` = 0 hits. (Not read in full; the originals' full bodies were outside the ranges I read.)
9. **GAP-9 — `meetingPrompt`'s two speaker-state branches are not represented as captures (UNSURE).** Original 4135–4148 has three states (invited temp / others already spoke / you are first). The corpus contains only `meeting#1` (acad) and `meeting#2` (r-1) (`v5r-prompts.js:83–84`), so at most one of the three states is captured. Evidence needed: the corpus JSON's per-prompt `charterChars`/context fields (or a test that assembles the invited-temp and first-speaker variants).
10. **GAP-10 — inconsistent line numbers between my two read passes (disclosed, unresolved).** An ANSI `Get-Content` pass put the `charterFor` body in 3131–3223 and a `kindLabel` at 3284, while the UTF-8 pass found `function charterFor(member) {` at **3131** and `function kindLabel(k)` at **3422**. Both numbers cannot describe the same text. All numbers above are the UTF-8 ones. Evidence needed: `node -e` line-indexed read of 3120–3140 and 3415–3430 (or `git blame`) to settle whether there are two `kindLabel` definitions.
11. **GAP-11 — branch-level parity of `replySpec` is unproven (UNSURE).** The original has four conditional additions (3992, 4001, 4012, 4020). I found only two "字段目录" sites in the charter (`v5r-charter.js:550`, `:583`). Evidence needed: the role-variant bindings (`CHARTER_ROLE_BINDINGS`, `v5r-charter.js:885`) mapped to the `temp` / `academician` variants of the field catalogue.
12. **GAP-12 — `resourceBlock`'s three internal branches are unproven (UNSURE).** Original 2078 (`cap > 0`), 2079 (`mb > 0`), each with two wordings. Only the block's presence is confirmed (`v5r-charter.js:730`). Evidence needed: a rendered prompt with `cap = 0` and with `mb = 0`.

UNSURE items are listed as UNSURE on purpose; I did not convert them to NO, and I did not convert an absence of my probe string into an absence of the feature.

---

## 4. How I checked

Line ranges actually read (UTF-8 `ReadAllText` unless noted):

- Original `vibe-math-v5r/vibe-math-v5r.js`: declaration grep over the whole file; structural pass over 3120–3430 (charter/brief), 2065–2130 (pointer/resource/proofStatus), 3018–3035 (rosterLine), 3978–4180 (replySpec/state/initial/normal/checkpoint/meeting), 4353–4375 (formalStatusLine), 4857–4880 + 4845–4853 (lean notices), 5209–5245 (math/paper), 5403–5500 (feedback/formal blocks), 7433–7445 (phaseFactLine), and grep-driven selection of parameter lines in 2500–5600. Not read: `verifyPrompt` body (4177+), `meetingVoteBlock` (7728+), `paperWrite/Review/FinalPrompt` bodies (8006+), `mathAvailabilityLine` body.
- Port: full structural pass of `packs/v5r-persona.js`; full read of `packs/v5r-prompts.js` (117 lines); declaration/section pass of `packs/v5r-charter.js` (902 lines) plus marker greps; structural pass of `kernel/prompt/index.js` and `kernel/turn/index.js`; exact-string schema test plus suffix regex search over `settings/schema.js`.
- Exact-string coverage probes (port side): `本机可能资源紧张`→`v5r-charter.js:730`; `我刚才读过`→`v5r-charter.js:774`; `命题准入`→`v5r-charter.js:748`; `工作经验／流程反馈`→`v5r-charter.js:794`; `顺手形式化`→`v5r-charter.js:868` + `v5r-prompts.js:101,111`; `【形式化结果】`→`v5r-charter.js:878` + corpus; `字段目录`→`v5r-charter.js:550,583`; `[状态]`→`v5r-charter.js:517`; `以下这段仅在你参与`→`v5r-prompts.js:113,114,117`; `数学计算可用性`→0 hits; `leanNotice`/`takeLeanNotices`/`phaseFact`/`formalStatusLine`/`meetingVoteBlock`→0 hits.
- I did not run any test, did not run the gate, and modified no file other than this report.
