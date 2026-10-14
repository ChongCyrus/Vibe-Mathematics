// vibe-math-vmu/tools/minutes.js — the minutes tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeMinutesSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.minutes,
      description: 'vmu 纪要面：action=list|draft|confirm|append|actions|zones|gaps|resolve|resolutions|supersede|status。' +
        '纪要由内核服务保管（谁记、何时定稿、哪些动作被记下都由它强制）；本工具只做**寻址与调用**，不复制任何策略。' +
        '**zones** 给出 v5r 的**发言区/投票区**两区（空区明写，不静默消失）；**gaps** 只报缺口、**绝不自动补全**（R7）；' +
        '**resolve/resolutions/supersede** 是 GAP-MTG-03 的**决议实体**（框架分配的稳定 id `res-<n>`、公告即生效、取代链只增不改），' +
        '且**只允许在正式会议内**落决议（light 简流程由会议面的同一判定点具名拒）。',
      parameters: {
        action: param('string', 'list｜draft｜confirm｜append｜actions｜zones｜gaps｜resolve｜resolutions｜supersede｜status', { required: true,
          enum: ['list', 'draft', 'confirm', 'append', 'actions', 'zones', 'gaps', 'resolve', 'resolutions', 'supersede', 'status'] }),
        id: param('string', '纪要 id（draft/confirm/append/actions/zones/gaps 必填）；resolutions 时作决议 id 过滤（`res-2`/`2`）'),
        kind: param('string', 'draft 的类别；resolve 的决议类别（resolution｜solve｜org｜procedure）'),
        text: param('string', 'draft/append/resolve 的正文（必填）'),
        member: param('string', '记录归属的成员（可选）'),
        session: param('string', '所属会话（可选）'),
        meeting: param('string', 'resolve：所属会议 id（决议挂在这次会议上）'),
        target: param('string', 'resolve/resolutions：标的（被验证对象/板 id）'),
        actions: param('array', 'resolve：行动项 [{who, due_in?}]（who 必填；期限只用相对 due_in）'),
        retroactive: param('boolean', 'resolve：追溯声明（只记 declaredAt，**不改变生效时点**）'),
        by: param('string', 'resolve/supersede 的执行人（审计事实）；supersede 时是被取代者的后继 id'),
        of: param('string', 'supersede：被取代的决议 id'),
        limit: param('number', 'resolutions：返回条数（1–50，默认 10）'),
      },
      run: async ({ action, id, kind, text, member, session, meeting, target, actions, retroactive, by, of, limit } = {}) => {
        // FOUND IN ROUND 3 (the GAP-MTG-03 assertions caught it): this helper used to THROW but return nothing,
        // so `draft`/`append`/`confirm` passed `undefined` to the service while looking correct. `need` must
        // return the value it validated — the same helper in tools/meeting.js always did.
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
        try {
          const minutes = kernel.minutes
          if (action === 'list') return Object.assign({ ok: true, action }, { minutes: await minutes.list() })
          if (action === 'draft') return Object.assign({ ok: true, action }, await minutes.draft({ id: need(id, 'id'), kind: kind || null, text: need(text, 'text'), member: member || null, session: session || null }))
          if (action === 'confirm') return Object.assign({ ok: true, action }, await minutes.confirm(need(id, 'id')))
          if (action === 'append') return Object.assign({ ok: true, action }, await minutes.append(need(id, 'id'), need(text, 'text')))
          if (action === 'actions') return Object.assign({ ok: true, action }, { actions: await minutes.actions(id || null) })
          if (action === 'zones') return Object.assign({ ok: true, action }, minutes.zones({ id: need(id, 'id') }))
          if (action === 'gaps') return Object.assign({ ok: true, action }, minutes.gaps({ id: need(id, 'id') }))
          // GAP-MTG-03: the resolution ENTITY (framework-allocated stable id, announcement-is-effect, supersede chain).
          if (action === 'resolve') {
            return Object.assign({ ok: true, action }, minutes.resolve({ meeting: meeting || null, text: need(text, 'text'),
              kind: kind || 'resolution', target: target || '', actions: Array.isArray(actions) ? actions : [], retroactive: retroactive === true, by: by || null }))
          }
          if (action === 'resolutions') {
            const args = {}
            if (id !== undefined && id !== null && id !== '') args.id = id
            if (target !== undefined && target !== null && target !== '') args.target = target
            if (meeting !== undefined && meeting !== null && meeting !== '') args.meetingId = meeting
            if (kind !== undefined && kind !== null && kind !== '') args.kind = kind
            if (limit !== undefined && limit !== null) args.limit = limit
            return Object.assign({ ok: true, action }, minutes.resolutions(args))
          }
          if (action === 'supersede') {
            return Object.assign({ ok: true, action }, minutes.supersede({ of: need(of, 'of'), by: need(by, 'by') }))
          }
          if (action === 'status') return Object.assign({ ok: true, action }, await minutes.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
