// vibe-math-vmu/tools/human.js — the HUMAN's operational surface: veto, approval queue, dashboard clamp and
// session recovery (docs/17 §19; docs/07 §4; docs/26 §6).
//
// WHY THIS TOOL EXISTS. `kernel/human.js` had a face and no wire: a human could not veto, could not see the
// approval queue, and the approval "gate" was a declaration nobody consulted. The same was true of the recovery
// work in `kernel/resume.js`. One tool covers both because they are the same actor's surface — the human (or the
// office acting for the human) deciding what the institute may do, and what survived the last restart.
//
// FACE CONVENTIONS: the spec is a factory (host.js supplies `param`/`refused`/`TOOL_NAMES`/`kernel`); every
// action returns NAMED structured JSON and never swallows a refusal; `refused()` carries the service's own code.
export function makeHumanSpec({ param, refused, TOOL_NAMES, kernel }) {
  const human = () => {
    const h = kernel && kernel.human
    if (!h) throw Object.assign(new Error('this kernel exposes no human face'), { code: 'VMU_ENGINE_UNAVAILABLE', hint: 'the human face is registered by the kernel; check vmu.tools.faces / the facesDisabled list' })
    return h
  }
  const resume = () => {
    // `kernel.resume` is the CONTROL flow's resume-from-pause method (the counterpart of pause); the recovery
    // face therefore hangs off `kernel.recovery` (alias `kernel.resumeService`, registry name `vmu.resume`).
    const k = kernel || {}
    const r = k.recovery || k.resumeService || (k.resume && typeof k.resume === 'object' ? k.resume : null)
    if (!r) throw Object.assign(new Error('this kernel exposes no recovery face'), { code: 'VMU_ENGINE_UNAVAILABLE', hint: 'the recovery face needs a durable root (kernel { root }); without one there is nothing to recover' })
    return r
  }
  return {
    name: TOOL_NAMES.human,
    description: 'vmu 人类在环：action=status｜veto｜explainVeto｜liftVeto｜observerView｜openApproval｜approvalState｜decide｜queue｜gate｜dashboard｜recover｜recoverStatus｜readBack。' +
      '**审批是真闸门**：被闸动作在获批前**不执行、只排队**（VMU_HUMAN_APPROVAL_PENDING 带 requestId）；超时默认 hold，default-allow 必须显式确认。' +
      'recover/recoverStatus/readBack 是**会话级恢复原语**：写前必读（VMU_RESUME_WRITE_BEFORE_READ）、中断具名（绝不静默变 passed）、回读一致性可查。',
    parameters: {
      action: param('string', 'status（默认）｜veto｜explainVeto｜liftVeto｜observerView｜openApproval｜approvalState｜decide｜queue｜gate｜dashboard｜recover｜recoverStatus｜readBack',
        { required: true, enum: ['status', 'veto', 'explainVeto', 'liftVeto', 'observerView', 'openApproval', 'approvalState', 'decide', 'queue', 'gate', 'dashboard', 'recover', 'recoverStatus', 'readBack'] }),
      scope: param('string', 'veto/observerView/dashboard/gate 的作用域；dashboard 只接受 global｜institution'),
      target: param('string', 'veto 的目标（可省＝覆盖整个作用域）'),
      reason: param('string', 'veto/decide/liftVeto 的理由（vmu.human.vetoNeedsReason=true 时否决必填；紧急可后补）'),
      emergency: param('boolean', '紧急否决：允许理由后补（记录为 pending，不假装已给）'),
      veto_id: param('string', 'explainVeto/liftVeto 的目标否决 id'),
      member_id: param('string', 'gate 的主体（被闸对象 id，可省）'),
      request_id: param('string', 'approvalState/decide/explainVeto 的审批 id'),
      allow: param('boolean', 'decide：true＝批准、false＝否决（否决立即生效）'),
      by: param('string', '做出该决定/解除否决的角色（liftVeto 必填；受 vmu.human.vetoLiftRoles 约束）'),
      subject: param('string', 'openApproval/gate 的主体说明'),
      domains: param('string', 'dashboard：逗号分隔的可见域；空＝仅聚合（private/dm 永不可见）'),
      requestId: param('string', 'openApproval 的调用方自定义 id（可省）'),
      timeout_ms: param('number', 'gate：旁路超时判定用（可省，通常由框架时钟决定）'),
      key: param('string', '改参数：vmu.control.tunableKeys 里的键（本工具不暴露写参数，见 vibe_vmu_control）'),
    },
    run: async ({ action = 'status', scope, target, reason, emergency, veto_id, member_id, request_id, allow, by, subject, domains, requestId, timeout_ms } = {}) => {
      const notEmpty = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined)
      try {
        if (action === 'status') return Object.assign({ ok: true, action }, human().status())
        if (action === 'veto') return Object.assign({ ok: true, action }, human().veto({ by: notEmpty(by) || null, scope: notEmpty(scope) || null, target: notEmpty(target) || null, reason: notEmpty(reason) || null, emergency: emergency === true }))
        if (action === 'explainVeto') return Object.assign({ ok: true, action }, human().explainDecision({ vetoId: notEmpty(veto_id) || null, requestId: notEmpty(request_id) || null, reason: notEmpty(reason) || null }))
        if (action === 'liftVeto') return Object.assign({ ok: true, action }, human().liftVeto({ vetoId: notEmpty(veto_id), by: notEmpty(by) || null, reason: notEmpty(reason) || null }))
        if (action === 'observerView') return Object.assign({ ok: true, action }, human().observerView({ scope: notEmpty(scope) || null }))
        if (action === 'openApproval') return Object.assign({ ok: true, action }, human().openApproval({ subject: subject === undefined ? null : subject, requestId: notEmpty(requestId) || null }))
        if (action === 'approvalState') {
          const at = Number.isFinite(Number(timeout_ms)) ? Number(timeout_ms) : null
          return Object.assign({ ok: true, action }, human().approvalState({ requestId: notEmpty(request_id), at }))
        }
        if (action === 'decide') return Object.assign({ ok: true, action }, human().decide({ requestId: notEmpty(request_id), allow: allow === true, reason: notEmpty(reason) || null, by: notEmpty(by) || null }))
        if (action === 'queue') return Object.assign({ ok: true, action }, human().queue())
        if (action === 'gate') {
          const at = Number.isFinite(Number(timeout_ms)) ? Number(timeout_ms) : null
          // `gate` is the drop-in form: a refusal here is the DECISION, so it is returned as a structured
          // refusal rather than thrown out of the tool (the caller wants to see the requestId and the queue).
          const d = human().approvalDecision({ action: notEmpty(member_id) ? 'tool.' + notEmpty(member_id) : 'tool.gate', subject: notEmpty(subject) || notEmpty(target) || null, byRole: notEmpty(by) || null, scope: notEmpty(scope) || null, at })
          return d.ok === true ? Object.assign({ ok: true, action }, d) : Object.assign({ ok: false, action }, d)
        }
        if (action === 'dashboard') return Object.assign({ ok: true, action }, human().dashboard({ scope: notEmpty(scope) || null, domains: notEmpty(domains) ? String(domains).split(',').map((x) => x.trim()).filter(Boolean) : null }))
        if (action === 'recover') {
          const plan = resume().recoverPlan({ reason: notEmpty(reason) || 'human-requested' })
          const report = await resume().recover({ reason: notEmpty(reason) || 'human-requested' })
          return Object.assign({ ok: report.ok !== false, action }, { plan, recovery: report })
        }
        if (action === 'recoverStatus') return Object.assign({ ok: true, action }, resume().status())
        if (action === 'readBack') return Object.assign({ ok: true, action }, resume().readBack())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
