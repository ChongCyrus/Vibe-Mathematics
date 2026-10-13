// vibe-math-vmu/tools/minutes.js — the minutes tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeMinutesSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.minutes,
      description: 'vmu 纪要面：action=list|draft|confirm|append|actions|status。' +
        '纪要由内核服务保管（谁记、何时定稿、哪些动作被记下都由它强制）；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'list｜draft｜confirm｜append｜actions｜status', { required: true,
          enum: ['list', 'draft', 'confirm', 'append', 'actions', 'status'] }),
        id: param('string', '纪要 id（draft/confirm/append 必填）'),
        kind: param('string', 'draft 的类别（可选）'),
        text: param('string', 'draft/append 的正文（必填）'),
        member: param('string', '记录归属的成员（可选）'),
        session: param('string', '所属会话（可选）'),
      },
      run: async ({ action, id, kind, text, member, session } = {}) => {
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }) }
        try {
          const minutes = kernel.minutes
          if (action === 'list') return Object.assign({ ok: true, action }, { minutes: await minutes.list() })
          if (action === 'draft') return Object.assign({ ok: true, action }, await minutes.draft({ id: need(id, 'id'), kind: kind || null, text: need(text, 'text'), member: member || null, session: session || null }))
          if (action === 'confirm') return Object.assign({ ok: true, action }, await minutes.confirm(need(id, 'id')))
          if (action === 'append') return Object.assign({ ok: true, action }, await minutes.append(need(id, 'id'), need(text, 'text')))
          if (action === 'actions') return Object.assign({ ok: true, action }, { actions: await minutes.actions(id || null) })
          if (action === 'status') return Object.assign({ ok: true, action }, await minutes.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
