// vibe-math-vmu/tools/control.js — the control tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeControlSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.control,
      description: 'vmu 控制流：action=status|pause|resume|stop|beat|roster|hire|fire|tune。暂停是**真门禁**（任务变更会被具名拒）；' +
        'beat 是心跳（观察，供 wallClockMs 判定 stale）；roster 只读花名册（带上限），hire/fire 是成员加入与离开（走内核槽位，docs/17）；' +
        'tune 是**中途改一个已声明参数**（键必须在 vmu.control.tunableKeys 内、角色必须在 vmu.control.canSetRoles 内，否则具名拒；改动留痕）。',
      parameters: {
        action: param('string', 'status（默认）｜pause｜resume｜stop｜beat｜roster｜hire｜fire｜tune', { required: true, enum: ['status', 'pause', 'resume', 'stop', 'beat', 'roster', 'hire', 'fire', 'tune'] }),
        member_id: param('string', 'roster 可省；hire/fire 必填的成员 id'),
        slot: param('string', '★ hire 必填：把成员放进【哪一个内核角色槽位】（v5r pack 声明 chair／member／temp）。★ 内核【绝不猜】成员担任什么角色，★ 因此缺失即具名拒'),
        institution: param('string', 'hire 的所属机构（缺省时由内核决定）'),
        since: param('string', 'hire 的加入时间戳（可省）'),
        reason: param('string', 'pause/stop 的原因（写入控制面与审计）'),
        note: param('string', 'beat 的备注（可选）'),
        key: param('string', 'tune：要改的设置键（必须在 vmu.control.tunableKeys 内）'),
        value: param('string', 'tune：新值（按声明的类型解析）'),
        byRole: param('string', 'tune：改参者角色（必须在 vmu.control.canSetRoles 内）'),
      },
      run: async ({ action = 'status', reason, note, member_id, slot, institution, since, key, value, byRole } = {}) => {
        try {
          if (action === 'status') return Object.assign({ ok: true, action }, kernel.control())
          if (action === 'pause') return Object.assign({ ok: true, action }, await kernel.pause(reason || 'paused by tool'))
          if (action === 'resume') return Object.assign({ ok: true, action }, await kernel.resume(reason || null))
          if (action === 'stop') return Object.assign({ ok: true, action }, await kernel.stop(reason || null))
          if (action === 'beat') return Object.assign({ ok: true, action }, await kernel.beat(note || null))
          // ★★★ ROUND 44 (measured on a real machine): THIS FACE WAS ON THE WRONG LEDGER - ALL THREE ACTIONS, NOT ONE.
          // Its own description says hire/fire go through the KERNEL SLOTS (docs/17), and the turn face reads those
          // slots, while roster/hire/fire all went to the IDENTITY roster. So a hire was written in one ledger and
          // read from another, the roster stayed empty, every turn answered `no-members`, and the institute could never
          // start: the real run showed the admission face called once, no recruiting action anywhere, no roster in any
          // receipt, and the turn face reporting no members with zero rounds run.
          //
          // THE THREE MUST LAND TOGETHER, WHICH IS WHY `roster` CHANGED TOO. Fixing only `hire` would have been worse
          // than leaving it: a caller who hired and then listed the roster would not see the person just hired, which
          // is the same contract-versus-implementation contradiction moved one line down.
          if (action === 'roster') {
            // The KERNEL SLOTS are the truth the turn face reads; the identity roster is the projection.
            if (!kernel.members || typeof kernel.members.roster !== 'function') {
              return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel declares no role slots, so there is no roster to list')
            }
            return Object.assign({ ok: true, action, source: 'kernel.members (the roster the turn face reads)' }, { roster: kernel.members.roster() })
          }
          if (action === 'hire') {
            const identity = kernel.identity ? kernel.identity.addMembership({ memberId: member_id, institution: institution === undefined ? null : institution, since: since === undefined ? null : since }) : null
            // ★ THE SEATING IS THE POINT. Without it the hire is recorded where the turn face does not look, and the
            // framework never starts however many times the operator hires. Distinct refusals, deliberately: "no roles
            // are declared" is a wiring gap, while a FULL slot is a capacity limit - sharing one message would let the
            // first read as the second.
            if (!kernel.members || typeof kernel.members.hire !== 'function') {
              return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel declares no role slots, so a hired member cannot be seated',
                'the roster the turn face reads comes from the pack-declared slots; load a pack that declares them')
            }
            if (typeof slot !== 'string' || slot.length === 0) {
              const available = typeof kernel.members.roles === 'function' ? kernel.members.roles().map((r) => r.id) : []
              return refused('VMU_INVALID_ARGUMENT', 'hire needs the SLOT to seat ' + String(member_id) + ' into',
                'pass slot: one of ' + (available.length ? available.join('｜') : '(none declared)') + ' - the kernel never guesses which role a member fills')
            }
            return Object.assign({ ok: true, action, seated: true, slot: String(slot) }, await kernel.members.hire({ id: String(member_id), slot: String(slot) }), identity ? { identity } : {})
          }
          if (action === 'fire') {
            const identity = kernel.identity ? kernel.identity.endMembership({ memberId: member_id, reason: reason === undefined ? null : reason }) : null
            // ★ THE SYMMETRIC HALF: without it a fired member keeps occupying a kernel slot, so the roster the turn
            // face reads still contains someone who has left.
            const unseated = kernel.members && typeof kernel.members.end === 'function'
              ? await kernel.members.end(String(member_id), reason === undefined ? 'fired' : String(reason))
              : null
            return Object.assign({ ok: true, action, unseated: unseated !== null }, unseated || {}, identity ? { identity } : {})
          }
          // ROUND 2 (task-14): the mid-flight retune face. The CONTROL SERVICE is `kernel.controlService` (the name
          // `kernel.control` has been the control VIEW function since round 1); a missing service is refused by name
          // rather than silently doing nothing.
          if (action === 'tune') {
            const svc = kernel.controlService
            if (!svc || typeof svc.tune !== 'function') return refused('VMU_ENGINE_UNAVAILABLE', 'this assembly has no control service to tune (kernel.controlService.tune is missing)')
            return Object.assign({ ok: true, action }, svc.tune({ key, value, byRole }))
          }
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
