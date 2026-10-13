// vibe-math-vmu/tools/control.js — the control tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeControlSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.control,
      description: 'vmu 控制流：action=status|pause|resume|stop|beat|roster|hire|fire。暂停是**真门禁**（任务变更会被具名拒）；' +
        'beat 是心跳（观察，供 wallClockMs 判定 stale）；roster 只读花名册（带上限），hire/fire 是成员加入与离开（走内核槽位，docs/17）。',
      parameters: {
        action: param('string', 'status（默认）｜pause｜resume｜stop｜beat｜roster｜hire｜fire', { required: true, enum: ['status', 'pause', 'resume', 'stop', 'beat', 'roster', 'hire', 'fire'] }),
        member_id: param('string', 'roster 可省；hire/fire 必填的成员 id'),
        institution: param('string', 'hire 的所属机构（缺省时由内核决定）'),
        since: param('string', 'hire 的加入时间戳（可省）'),
        reason: param('string', 'pause/stop 的原因（写入控制面与审计）'),
        note: param('string', 'beat 的备注（可选）'),
      },
      run: async ({ action = 'status', reason, note, member_id, institution, since } = {}) => {
        try {
          if (action === 'status') return Object.assign({ ok: true, action }, kernel.control())
          if (action === 'pause') return Object.assign({ ok: true, action }, await kernel.pause(reason || 'paused by tool'))
          if (action === 'resume') return Object.assign({ ok: true, action }, await kernel.resume(reason || null))
          if (action === 'stop') return Object.assign({ ok: true, action }, await kernel.stop(reason || null))
          if (action === 'beat') return Object.assign({ ok: true, action }, await kernel.beat(note || null))
          if (action === 'roster') return Object.assign({ ok: true, action }, kernel.identity ? kernel.identity.list() : refused('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no identity surface'))
          if (action === 'hire') return Object.assign({ ok: true, action }, kernel.identity.addMembership({ memberId: member_id, institution: institution === undefined ? null : institution, since: since === undefined ? null : since }))
          if (action === 'fire') return Object.assign({ ok: true, action }, kernel.identity.endMembership({ memberId: member_id, reason: reason === undefined ? null : reason }))
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
