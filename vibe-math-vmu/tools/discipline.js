// vibe-math-vmu/tools/discipline.js — the discipline tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeDisciplineSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.discipline,
      description: 'vmu 纪律面：action=recordFailure|mayAct|suspend|restore|status。' +
        '断路器窗口、暂停上限与「恢复必须由人决定」都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'recordFailure｜mayAct｜suspend｜restore｜status', { required: true,
          enum: ['recordFailure', 'mayAct', 'suspend', 'restore', 'status'] }),
        subject: param('string', '主体（成员/角色；recordFailure/mayAct/suspend/restore 需要）'),
        kind: param('string', '失败类别（recordFailure 可选）'),
        detail: param('string', '失败细节（recordFailure 可选）'),
        ms: param('number', '暂停时长毫秒（suspend 可选；★ 会被服务的 suspendMaxMs 夹住 ✓）'),
        reason: param('string', '暂停原因（suspend 可选）'),
        byHuman: param('boolean', '是否已由人决定（restore 用；★ 服务的 restoreNeedsHuman 会强制它 ✓）'),
        postmortem: param('string', '复盘记录（restore 可选）'),
      },
      run: async ({ action, subject, kind, detail, ms, reason, byHuman, postmortem } = {}) => {
        try {
          const discipline = kernel.discipline
          if (action === 'recordFailure') return Object.assign({ ok: true, action }, await discipline.recordFailure({ subject, kind, detail }))
          if (action === 'mayAct') return Object.assign({ ok: true, action }, await discipline.mayAct({ subject }))
          if (action === 'suspend') return Object.assign({ ok: true, action }, await discipline.suspend({ subject, ms, reason }))
          if (action === 'restore') return Object.assign({ ok: true, action }, await discipline.restore({ subject, byHuman, postmortem }))
          if (action === 'status') return Object.assign({ ok: true, action }, await discipline.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
