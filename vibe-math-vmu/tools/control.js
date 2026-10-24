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
        // ★★★ ROUND 46 (measured): THE DESCRIPTION SAID OPTIONAL AND THE KERNEL REFUSED. It read "缺省时由内核决定" -
        // when omitted, the kernel decides - while `identity.addMembership` requires a non-empty institution and no
        // declared default exists anywhere in the framework. A caller following the description was refused from deep
        // inside the identity service, with no way to know beforehand. The description now states the truth, and the
        // refusal happens HERE, at the face, naming the missing argument - rather than being discovered mid-call.
        // Inventing a default institution name was the other option and is the wrong one: a name the framework makes up
        // is exactly the hardcoded value this project forbids, and which institution a member joins is a deployment
        // decision, not the framework's.
        institution: param('string', '★ hire 必填：成员所属机构名。★ 内核【没有】任何缺省机构（`identity.addMembership` 要求非空，缺失即具名拒），★ 因为"某成员属于哪个机构"是【部署的决定】，不是框架可以替它编的'),
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
          // ★ G6 tier 2 (UX): a named refusal must carry a ROUTE, not just a message. This face's pause/resume go
          // straight to the kernel control state, whose VMU_STATE refusals used to arrive with hint:null ("named but
          // no way forward"). The hint below names the read path (this face's own `status`) and the reciprocal action;
          // a STOPPED kernel is terminal and says so, because "resume" cannot bring it back.
          if (action === 'pause') {
            try { return Object.assign({ ok: true, action }, await kernel.pause(reason || 'paused by tool')) } catch (e) {
              if (e && e.code === 'VMU_STATE' && !e.hint) e.hint = 'nothing was paused: the kernel is stopped (terminal) or otherwise not pausable — read the current control state with vibe_vmu_control {action:"status"} (fields state/pausedReason/stops), and start a fresh institute instead of resuming a stopped one'
              throw e
            }
          }
          if (action === 'resume') {
            try { return Object.assign({ ok: true, action }, await kernel.resume(reason || null)) } catch (e) {
              if (e && e.code === 'VMU_STATE' && !e.hint) e.hint = 'nothing was resumed: the kernel is not in the paused state (it may be running or stopped) — read the current control state with vibe_vmu_control {action:"status"} (field state), pause with action:"pause" first if that is the intent, and note that a STOPPED kernel is terminal'
              throw e
            }
          }
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
            // ★★★ LIVE RUN 27 residual 3 (the institute's own report): THE ROSTER COULD NOT ANSWER "IS THE SEAT FREE?".
            // `roster` returned member rows only; `occupied/capacity` existed solely on the hire/fire receipts, so the
            // very check ⑲.1 asked for ("read used/capacity from the roster face") was unreadable. The occupancy is the
            // kernel's own view (`members.status().slots`, which computes `occupancy()` over the LIVING), so it is
            // forwarded rather than recomputed here - two implementations of "who holds the chair" would drift.
            const occupancyView = typeof kernel.members.status === 'function' ? kernel.members.status() : null
            return Object.assign(
              { ok: true, action, source: 'kernel.members (the roster the turn face reads)' },
              { roster: kernel.members.roster() },
              occupancyView
                ? {
                    slots: occupancyView.slots,
                    live: occupancyView.live,
                    total: occupancyView.total,
                    // ★ LIVE RUN 28 observation 1: `total` counts roster RECORDS (ended members included), so it is
                    // forwarded together with the departed count and its definition - otherwise `live:0, total:1` reads
                    // as "the institute still has one member", which is the opposite of what happened.
                    departed: occupancyView.departed,
                    totalMeans: occupancyView.totalMeans,
                    slotsMeans: 'occupied/capacity per declared slot (capacity 0 = unlimited; the field name is "occupied"). These count the LIVING only: a member whose state is "ended" holds no seat (live run 26 defect 2), so a freed chair can be filled again',
                  }
                : { slots: null, slotsNote: 'this kernel exposes no slot-occupancy view, so it cannot say whether a seat is free' })
          }
          if (action === 'hire') {
            // ★ THE SEATING IS THE POINT. Without it the hire is recorded where the turn face does not look, and the
            // framework never starts however many times the operator hires. Distinct refusals, deliberately: "no roles
            // are declared" is a wiring gap, while a FULL slot is a capacity limit - sharing one message would let the
            // first read as the second.
            //
            // ★★ THE ORDER MATTERS AND WAS MEASURED: the SLOT is checked first, because seating is this face's own
            // concept and the point of the fix - a caller who omitted the slot must be told about the SLOT, not about a
            // later requirement. The institution is checked after, immediately before the identity call that needs it.
            if (!kernel.members || typeof kernel.members.hire !== 'function') {
              return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel declares no role slots, so a hired member cannot be seated',
                'the roster the turn face reads comes from the pack-declared slots; load a pack that declares them')
            }
            // ★★★ LIVE RUN 26 defect 1 (the institute's own report): A MISSING `member_id` WAS SILENTLY COERCED INTO THE
            // LITERAL MEMBER ID "undefined". `String(member_id)` turned `undefined` into the string `"undefined"`, so
            // `hire {slot:"chair", institution:…}` seated a member whose id is the TEXT "undefined" — and it then
            // appeared in the roster, in the closure electorate and in a vote receipt (`for:["undefined",…]`). This face
            // declares that it never invents an id; a coercion that manufactures one is exactly the shape this repo
            // calls a silent fake. Refuse at the face, by name, before identity or seating is touched.
            if (typeof member_id !== 'string' || member_id.trim() === '') {
              return refused('VMU_INVALID_ARGUMENT', 'hire needs the MEMBER ID to seat (got ' + (member_id === undefined ? 'nothing' : JSON.stringify(member_id)) + ')',
                'pass member_id: "<id>" - this face never invents one; note that an omitted id used to become the literal member "undefined" (live run 26)')
            }
            if (typeof slot !== 'string' || slot.length === 0) {
              const available = typeof kernel.members.roles === 'function' ? kernel.members.roles().map((r) => r.id) : []
              return refused('VMU_INVALID_ARGUMENT', 'hire needs the SLOT to seat ' + String(member_id) + ' into',
                'pass slot: one of ' + (available.length ? available.join('｜') : '(none declared)') + ' - the kernel never guesses which role a member fills')
            }
            // ★★ THE MISSING ARGUMENT IS REFUSED HERE, NOT DEEP IN THE IDENTITY SERVICE. `identity.addMembership`
            // requires a non-empty institution and the framework declares no default, so a caller that followed the
            // OLD description ("the kernel decides") was refused from inside another service with no warning. Naming
            // it at the face is the difference between an actionable refusal and a treasure hunt.
            if (typeof institution !== 'string' || institution.length === 0) {
              return refused('VMU_INVALID_ARGUMENT', 'hire needs the INSTITUTION to put ' + String(member_id) + ' in',
                'pass institution: "<name>" - the framework declares no default institution on purpose, because which institution a member joins is a deployment decision, not one the framework may invent')
            }
            const identity = kernel.identity ? kernel.identity.addMembership({ memberId: member_id, institution, since: since === undefined ? null : since }) : null
            return Object.assign({ ok: true, action, seated: true, slot: String(slot) }, await kernel.members.hire({ id: String(member_id), slot: String(slot) }), identity ? { identity } : {})
          }
          if (action === 'fire') {
            // Same coercion hole, other verb: `fire` with no id would write `endMembership({memberId:"undefined"})` and
            // `members.end("undefined")`, i.e. it would "successfully" fire a member that never existed.
            if (typeof member_id !== 'string' || member_id.trim() === '') {
              return refused('VMU_INVALID_ARGUMENT', 'fire needs the MEMBER ID to remove (got ' + (member_id === undefined ? 'nothing' : JSON.stringify(member_id)) + ')',
                'pass member_id: "<roster id>" - read the roster with action:"roster"')
            }
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
