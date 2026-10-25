/**
 * v5r MEMBER SCOPE — 哪一件 pack 工具属于「所办」、哪一件属于「席位」。
 *
 * WHY THIS FILE EXISTS (run-51 residue #4, design ruled in
 * `docs/acceptance/conformance/member-scope-design.md`): under activation delivery a member turn runs in an
 * INDEPENDENT kernel instance, so when a member prompt taught a member to call an institution-level action
 * (`vibe_v5_verdict`, `vibe_v5_poll_vote`, …) the call came back as `VMU_NO_SUCH_OBJECT` — a WRONG NAME for the
 * real situation ("this session has no institution state at all"). A wrong name is worse than no name: whoever
 * reads it goes and fixes the id.
 *
 * The ruling was: do NOT bridge the child kernel. A member is not supposed to exercise institution-level actions;
 * its legitimate channels are ① reply fields ② records in its own library ③ messages/inbox. So the boundary is
 * declared HERE, once, derived from the tool catalogue, and the member's wire is NARROWED to it.
 *
 * THE DECLARATION IS THE ONLY SOURCE. `MEMBER_SAFE_TOOLS` / `OFFICE_ONLY_TOOLS` are derived from `TOOL_SCOPES`;
 * a second hand-written list would be the same "two copies drift" failure this project keeps paying for.
 *
 * SCOPES:
 *   'office' — 所办 only. Control/parameter/reporting faces (`report`, `overview`, `start/stop/pause/resume`,
 *              `configure`, `set`) and the two faces whose authority is the INSTITUTION rather than a seat
 *              (`verified_promote`, `verdict_final`).
 *   'member' — a seat may call it. Every record/communication/task/meeting/lean/paper face is here, because the
 *              CHAIR is a seat too: meeting controls are gated by the kernel's permission rails, not by wire.
 *   'both'   — either side may call it (nothing in this pack is office-and-member-exclusive by nature).
 */

/** The vocabulary, so a reader can tell what "office" means without reading this comment. */
export const SCOPE_VOCAB = Object.freeze({
  office: '所办（主代理）专用：控制、参数、汇报，以及以「机构」而非「席位」为授权主体的面孔',
  member: '席位可用：成员（含主席席位）的日常研究、记录、通信、会议、形式化、论文面孔',
  both: '两侧都可用',
})

/**
 * One line per pack tool: which side may call it.
 *
 * Kept as an explicit table ON PURPOSE (not derived from the tool bodies): a reader must be able to answer
 * "may a member call this?" by reading one line, and the gate below proves the table and the catalogue agree.
 */
export const TOOL_SCOPES = Object.freeze({
  // ── records in one's own library (each tool resolves the member from the caller) ──────────────────────
  vibe_v5_record_progress: 'member',
  vibe_v5_record_proposition: 'member',
  vibe_v5_record_method: 'member',
  vibe_v5_record_subproblem: 'member',
  vibe_v5_read_library: 'member',
  vibe_v5_feedback: 'member',
  // ── communication ──────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_say: 'member',
  vibe_v5_message: 'member',
  vibe_v5_inbox: 'member',
  vibe_v5_wait: 'member',
  // ── task board (creation/claim/assignment are gated by the kernel's rails, not by the wire) ─────────────
  vibe_v5_task_create: 'member',
  vibe_v5_task_list: 'member',
  vibe_v5_task_get: 'member',
  vibe_v5_task_update: 'member',
  vibe_v5_assign: 'member',
  vibe_v5_prioritize: 'member',
  vibe_v5_nudge: 'member',
  // ── roster ──────────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_hire: 'member',
  vibe_v5_fire: 'member',
  // ── meetings (chair is a seat; permission rails decide what a seat may actually do) ─────────────────────
  vibe_v5_meeting: 'member',
  vibe_v5_meeting_round: 'member',
  vibe_v5_motion: 'member',
  vibe_v5_second: 'member',
  vibe_v5_poll_open: 'member',
  vibe_v5_poll_vote: 'member',
  vibe_v5_poll_close: 'member',
  vibe_v5_verdict: 'member',
  vibe_v5_fidelity_conclude: 'member',
  // ── research material ──────────────────────────────────────────────────────────────────────────────────
  vibe_v5_blueprint: 'member',
  vibe_v5_lean_run: 'member',
  vibe_v5_lean_job: 'member',
  vibe_v5_lean_lib: 'member',
  vibe_v5_lean_read: 'member',
  vibe_v5_lean_archive: 'member',
  vibe_v5_paper: 'member',
  vibe_v5_script: 'member',
  vibe_v5_tool_help: 'member',
  // ── office only ────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_report: 'office',
  vibe_v5_overview: 'office',
  vibe_v5_start: 'office',
  vibe_v5_stop: 'office',
  vibe_v5_pause: 'office',
  vibe_v5_resume: 'office',
  vibe_v5_configure: 'office',
  vibe_v5_set: 'office',
  vibe_v5_verified_promote: 'office',
  vibe_v5_verdict_final: 'office',
})

/** DERIVED — never hand-written. A seat may call these. */
export const MEMBER_SAFE_TOOLS = Object.freeze(
  Object.keys(TOOL_SCOPES).filter((n) => TOOL_SCOPES[n] === 'member' || TOOL_SCOPES[n] === 'both').sort(),
)

/** DERIVED — never hand-written. Only the office may call these. */
export const OFFICE_ONLY_TOOLS = Object.freeze(
  Object.keys(TOOL_SCOPES).filter((n) => TOOL_SCOPES[n] === 'office').sort(),
)

/** The sentence a member prompt may carry, so the boundary is stated where the member reads it. */
export const MEMBER_SCOPE_NOTE = Object.freeze(
  '机构级读数（汇报、总览、启动/暂停/停止、参数设置、最终裁决、verified 提升）不在你的线束里：'
  + '它们属于推动者的内核。你需要它们时，用回复字段或消息请求所办，不要凭记忆叙述机构状态。',
)

/**
 * Compare this table against an available-name list — BIDIRECTIONALLY.
 *
 * `tools.js` must not be imported here (it imports this module, and an ESM cycle would evaluate these derived
 * arrays before the catalogue exists). So the comparison is a FUNCTION: the caller hands its own list in, and
 * gets both directions back, because a table that covers the catalogue but names a tool that no longer exists is
 * just as wrong as one that misses a tool.
 */
export function scopeCatalogue(availableNames = []) {
  const available = new Set(availableNames.map(String))
  const declared = new Set(Object.keys(TOOL_SCOPES))
  const missing = [...available].filter((n) => !declared.has(n)).sort()
  const extra = [...declared].filter((n) => !available.has(n)).sort()
  return { ok: missing.length === 0 && extra.length === 0, declaredCount: declared.size, availableCount: available.size, missing, extra }
}

/**
 * Apply the member scope to a set of seats, through the seam the host already reads
 * (`kernel.setMemberToolOverride` → `kernel.memberToolOverride` → `host.js` visible tools).
 *
 * Returns a RECEIPT rather than nothing: "narrowed" is a state somebody may need to prove later, and a silent
 * mutation would make every later question ("is the member wire narrow?") unanswerable from outside.
 *
 * Never throws for an absent seam: a kernel that does not expose `setMemberToolOverride` is a DIFFERENT
 * deployment (a test double, an older host), and refusing here would turn a scope hint into a hard dependency.
 * The receipt says which case happened, by name.
 */
export function applyMemberScope({ kernel, members } = {}) {
  const ids = Array.isArray(members) ? members.map((m) => String(m)).filter((m) => m.length > 0) : []
  const hasSeam = Boolean(kernel && typeof kernel.setMemberToolOverride === 'function')
  const applied = []
  if (hasSeam) {
    for (const member of ids) {
      try {
        kernel.setMemberToolOverride({ member, allow: MEMBER_SAFE_TOOLS.slice() })
        applied.push(member)
      } catch { /* one seat failing to narrow must not unseat the others; the receipt counts them */ }
    }
  }
  return {
    ok: true,
    seam: hasSeam ? 'kernel.setMemberToolOverride' : 'absent',
    applied,
    appliedCount: applied.length,
    askedCount: ids.length,
    allowCount: MEMBER_SAFE_TOOLS.length,
    officeOnlyCount: OFFICE_ONLY_TOOLS.length,
    means: hasSeam
      ? 'these seats now see ' + MEMBER_SAFE_TOOLS.length + ' pack tools; the ' + OFFICE_ONLY_TOOLS.length
        + ' office-only faces are NOT in their wire (the host reads this override when it builds the visible list)'
      : 'no seam on this kernel: the scope was NOT applied, and `applied` is empty — the caller should treat the member wire as unscoped',
  }
}
