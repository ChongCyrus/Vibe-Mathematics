// vibe-math-vmu/tools/panel.js — the member state panel tool spec (task-11 / D-08 baseline B).
//
// The panel is the ONE place "what is this member trying to do, what is the plan, and WHAT IS RUNNING RIGHT
// NOW" can be read. The v5r line had `overall`/`subgoal`/`plan`/`status` but NO independent running-sub-task
// field; `subtasks` is that field here, and its states are the lifecycle (`planned|running|blocked|done`).
//
// The face maps arguments only: append-only history, framework-written times, deviation recording and the
// view audit all live in kernel/panel.js. Note the deliberate name overlap: `status` is BOTH an action
// (service status) and a panel FIELD — the action decides which one is meant, so `{action:'set', status:'…'}`
// writes the field while `{action:'status'}` reads the service.
import { resolveTurnMember } from '../host-pack-tools.js'
/** ★★ ROUND 131 / D6: what the neighbouring read face answers, stated once. The panel is the LIVE view a member keeps
 *  for others; the records `state` track holds what was written into the ledger. Naming the other call is the whole
 *  point: 「用面板读」and「用记录轨读」are different questions, and the prompts teach only the tool (`read_library`). */
const LIBRARY_POINTER_MEANS = '`libraryPointer` 指向同题的另一扇读面：`vibe_v5_read_library { member:"<id>", kind:"state" }` '
  + '读记录轨里已落盘的面板卡行，那条回执里有 `panelPointer` 指回本面。两个面不是同一份账：本面是内核活视图，'
  + '记录轨是卡；读到一个不等于读到另一个。'

/** ★★ RUN 229: a field the schema declares as TEXT may arrive as something else. `String(value)` then writes a JavaScript
 *  type name (`[object Object]`) into the append-only history, where it is indistinguishable from a value the member
 *  meant — the reader is told the TYPE of the object instead of what arrived. The face now REFUSES the write by name and
 *  describes the shape it received: `typeof`, item/key count, and the JSON itself only when it is small enough to read.
 *  It never stringifies a structure INTO the panel as if the text were the data. */
const describeShape = (value) => {
  if (Array.isArray(value)) return 'an array (typeof value: "object") of ' + value.length + ' item' + (value.length === 1 ? '' : 's')
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value)
    let json = ''
    try { json = JSON.stringify(value) } catch { json = '' }
    return 'an object (typeof value: "object") with ' + keys.length + ' key' + (keys.length === 1 ? '' : 's')
      + (keys.length ? ' [' + keys.slice(0, 6).join(', ') + (keys.length > 6 ? ', …' : '') + ']' : '')
      + (json !== '' && json.length <= 120 ? ' = ' + json : (json !== '' ? ' (' + json.length + ' chars of JSON)' : ''))
  }
  if (typeof value === 'number') return Number.isFinite(value) ? 'the number ' + String(value) : 'a number that is not finite'
  if (typeof value === 'boolean') return 'the boolean ' + String(value)
  if (typeof value === 'function') return 'a function'
  if (typeof value === 'symbol') return 'a symbol'
  return 'a value of type ' + typeof value
}
/** TEXT accepts the text itself plus values whose String() IS what a reader would read (a finite number, a boolean). */
const isTextish = (value) => typeof value === 'string'
  || (typeof value === 'number' && Number.isFinite(value))
  || typeof value === 'boolean'

export function makePanelSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.panel,
    description: 'vmu 成员状态面板：action=set|get|view|board|history|audit|status。' +
      '字段＝**总目标 overall／子目标 subgoal／计划规划 plan[]／状态 status／正在执行的子任务 subtasks[]**' +
      '（subtasks 元素 {id,title,state,note}，state∈planned|running|blocked|done）。' +
      '每条写入**只追加**、时间由框架写（自带 …At/…Ms 具名拒）、同值幂等；他人改 overall ⇒ 记 deviation（或按策略具名拒）；' +
      '**view 会留痕**（谁看了谁），留痕与历史都有上限且触界**计数上报**，绝不静默丢。',
    parameters: {
      action: param('string', 'set｜get｜view｜board｜history｜audit｜status', { required: true,
        enum: ['set', 'get', 'view', 'board', 'history', 'audit', 'status'] }),
      member: param('string', 'set/get/history 的成员 id（set 必填）'),
      by: param('string', 'set：写入人（记录为审计事实；缺省即匿名，内核仍照记 by:null）'),
      viewer: param('string', 'view：查看人（留痕用，可空＝匿名查看）'),
      ids: param('array', 'view：只看这些成员（缺省＝所有已登记成员）'),
      overall: param('string', 'set：总目标'),
      subgoal: param('string', 'set：子目标'),
      plan: param('array', 'set：计划规划（字符串数组）'),
      status: param('string', 'set：当前状态文本（action=status 时忽略本参数）'),
      subtasks: param('array', 'set：正在执行的子任务（字符串或 {id,title,state,note}）'),
      reason: param('string', 'set：本次写入的理由（入历史）'),
      source: param('string', 'set：来源 self｜negotiated｜academician｜framework', { enum: ['self', 'negotiated', 'academician', 'framework'] }),
    },
    // ★ LIVE RUN 128 (F-128c): the panel could be written FOR another member by anyone — a member session called
    // `{action:'set', member:'r-2', by:'r-1'}` and the receipt said ok:true, changed:["overall"]. `member` is the
    // TARGET and `by` was just a label, so the D7 rule (a member changes its own panel; the office may record for the
    // institution) lived only in the pack's records path. The caller is now read from the TURN (the second argument
    // the host hands every handler) and a member may write neither for someone else nor under someone else's name.
    run: async (args = {}, exec = null) => {
      const { action, member, by, viewer, ids, overall, subgoal, plan, status, subtasks, reason, source } = args
      const callerOf = () => {
        // `resolveTurnMember` answers with a ROSTER ID STRING (or null — root/unknown); reading `.id` off it was the
        // same mistake the docs warn about with ids: a resolver that returns a bare id has no fields.
        try { const m = resolveTurnMember(kernel, exec); if (!m) return null; return typeof m === 'string' ? m : (m.id ? String(m.id) : null) } catch { return null }
      }
      const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
      try {
        const panel = kernel.panel
        if (!panel) return refused('VMU_ENGINE_UNAVAILABLE', 'the panel primitive is not mounted in this kernel',
          'declare vmu.panel.* (or config.panel) so the face is wired')
        // ★★ RUN 229: the ids and labels this face passes on are TEXT. An object in one of them used to be coerced into
        // the string "[object Object]" and then stored or compared as if a person had written that — refused by name.
        const shapeRefusal = (field, value, expected, hint) => {
          const e = new Error(field + ' received ' + describeShape(value) + '; ' + expected)
          e.code = 'VMU_INVALID_ARGUMENT'
          e.hint = hint
          throw e
        }
        for (const [field, value, expected, hint] of [
          ['member', member, 'member is a member id (text)', 'pass the roster id as a string, e.g. member:"r-1"'],
          ['by', by, 'by names the writer (text)', 'pass the writer id as a string, or omit by so the kernel records this turn\'s caller'],
          ['viewer', viewer, 'viewer names the reader (text)', 'pass the viewer id as a string, or omit it for an anonymous view'],
          ['reason', reason, 'reason is the sentence kept in the history (text)', 'pass the reason as a string'],
          ['source', source, 'source is one of self|negotiated|academician|framework (text)', 'pass source as a string, e.g. source:"negotiated"'],
        ]) {
          if (value !== undefined && value !== null && !isTextish(value)) shapeRefusal(field, value, expected, hint)
        }
        if (ids !== undefined && ids !== null) {
          if (!Array.isArray(ids)) shapeRefusal('ids', ids, 'ids is an array of member ids', 'pass ids as an array of strings, e.g. ids:["r-1","r-2"]')
          for (let i = 0; i < ids.length; i += 1) {
            if (ids[i] !== undefined && ids[i] !== null && !isTextish(ids[i])) shapeRefusal('ids[' + i + ']', ids[i], 'every id is text', 'a member id is a string')
          }
        }
        if (action === 'set') {
          // ★★ RUN 229: the panel stores TEXT. A structure sent as overall/subgoal/plan/status/subtasks used to be
          // coerced by the kernel's String() and read back as "[object Object]" — the structure went in and a type name
          // came out. Refused HERE, with the shape named; a valid string write still passes untouched.
          const textField = (field, value, hint) => {
            if (value === undefined || value === null || isTextish(value)) return value
            shapeRefusal(field, value, field + ' is text', hint)
          }
          const planField = (value) => {
            if (value === undefined || value === null || isTextish(value)) return value
            if (!Array.isArray(value)) shapeRefusal('plan', value, 'plan is an array of text entries', 'pass the plan as an array of strings — one step per entry (an object is refused, never flattened)')
            for (let i = 0; i < value.length; i += 1) {
              if (value[i] === undefined || value[i] === null) continue
              if (!isTextish(value[i])) shapeRefusal('plan[' + i + ']', value[i], 'every plan entry is text', 'one plan STEP is one string — the panel stores text, so an object is refused by name instead of being written as a type name')
            }
            return value
          }
          const subtasksField = (value) => {
            if (value === undefined || value === null) return value
            if (!Array.isArray(value)) {
              if (isTextish(value)) return value
              shapeRefusal('subtasks', value, 'a sub-task is text or {id,title,state,note}', 'pass a sub-task as a string, or as {id,title,state,note}')
            }
            for (let i = 0; i < value.length; i += 1) {
              const raw = value[i]
              if (raw === undefined || raw === null || isTextish(raw)) continue
              if (Array.isArray(raw) || typeof raw !== 'object') shapeRefusal('subtasks[' + i + ']', raw, 'a sub-task is text or {id,title,state,note}', 'pass a sub-task as a string, or as {id,title,state,note}')
              for (const key of ['id', 'title', 'state', 'note']) {
                const v = raw[key]
                if (v === undefined || v === null || isTextish(v)) continue
                shapeRefusal('subtasks[' + i + '].' + key, v, 'every sub-task field is text', 'sub-task fields are strings (title is the required one)')
              }
            }
            return value
          }
          const patch = {}
          if (overall !== undefined) patch.overall = textField('overall', overall, 'overall is the goal, as ONE string')
          if (subgoal !== undefined) patch.subgoal = textField('subgoal', subgoal, 'subgoal is the current target, as ONE string')
          if (plan !== undefined) patch.plan = planField(plan)
          if (status !== undefined) patch.status = textField('status', status, 'status is a sentence, as ONE string')
          if (subtasks !== undefined) patch.subtasks = subtasksField(subtasks)
          if (!Object.keys(patch).length) return refused('VMU_INVALID_ARGUMENT', 'set needs at least one panel field',
            'one of overall/subgoal/plan/status/subtasks')
          const target = need(member, 'member')
          const caller = callerOf()
          if (caller && caller !== String(target)) {
            return refused('VMU_NOT_PERMITTED', 'a member may write only its OWN panel: the caller of this turn is "' + caller + '", the write names "' + String(target) + '"',
              'pass member:"' + caller + '" (your own id). The office (root, no member seat) may record a panel for any member; the panel is that member own report, and a write attributed to another seat is exactly the delegation the D7 rule forbids',
              { caller, callerSource: 'turn-context', target: String(target) })
          }
          const byResolved = by === undefined ? (caller || null) : by
          if (caller && byResolved !== null && String(byResolved) !== caller) {
            return refused('VMU_NOT_PERMITTED', 'a member may not attribute its panel write to "' + String(byResolved) + '": this turn belongs to "' + caller + '"',
              'omit by (the kernel records the caller of the turn) or pass by:"' + caller + '"',
              { caller, callerSource: 'turn-context' })
          }
          return Object.assign({ ok: true, action, caller, callerSource: caller ? 'turn-context' : 'none' }, await panel.set(String(target), patch,
            { by: byResolved, reason: reason || '', source: source || 'self' }))
        }
        // ★★ ROUND 131 / D6: this face and `vibe_v5_read_library {kind:"state"}` answer neighbouring questions about
        // the same member and neither named the other. The pointer travels WITH the receipt (never as a redirect);
        // the library face carries the mirror field `panelPointer`.
        if (action === 'get') {
          const target = need(member, 'member')
          return Object.assign({ ok: true, action,
            libraryPointer: { member: target, call: 'vibe_v5_read_library { member:"' + target + '", kind:"state" }', means: LIBRARY_POINTER_MEANS },
            libraryPointerMeans: LIBRARY_POINTER_MEANS }, panel.get(target))
        }
        if (action === 'view') return Object.assign({ ok: true, action }, panel.view({ viewer: viewer === undefined ? null : viewer, ids: Array.isArray(ids) ? ids : null }))
        if (action === 'board') return Object.assign({ ok: true, action }, { rows: panel.board() })
        if (action === 'history') return Object.assign({ ok: true, action }, panel.history(need(member, 'member')))
        if (action === 'audit') return Object.assign({ ok: true, action }, { audit: panel.audit() })
        if (action === 'status') return Object.assign({ ok: true, action }, panel.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        // D3: the evaluated scope survives the face boundary (see tools/chat.js for the same discipline).
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint,
          { enforced: Array.isArray(e.enforced) ? e.enforced.slice() : [], enforcedScope: e.enforcedScope || 'evaluated-so-far' })
      }
    },
  }
}
