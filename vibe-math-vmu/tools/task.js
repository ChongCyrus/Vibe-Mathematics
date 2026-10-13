// vibe-math-vmu/tools/task.js — the task tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeTaskSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.task,
      description: 'vmu 任务面：action=list|create|assign|transition|stage|advance|brief|history。' +
        '任务是内核台账（依赖/阶段门/暂停门都由内核强制）；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'list｜create｜assign｜transition｜stage｜advance｜brief｜history', { required: true,
          enum: ['list', 'create', 'assign', 'transition', 'stage', 'advance', 'brief', 'history'] }),
        id: param('string', '任务 id（assign/transition/brief 必填）'),
        title: param('string', 'create 的标题（必填）'),
        objective: param('string', 'create 的目标（可选）'),
        owner: param('string', 'create/assign 的负责人'),
        deps: param('array', 'create 的依赖 id 列表（可选）'),
        to: param('string', 'transition/advance 的目标状态或阶段'),
        reason: param('string', 'transition/advance 的原因'),
      },
      run: async ({ action, id, title, objective, owner, deps, to, reason } = {}) => {
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
        try {
          const tasks = kernel.tasks
          if (action === 'list') return Object.assign({ ok: true, action }, { tasks: await tasks.list() })
          if (action === 'create') return Object.assign({ ok: true, action }, await tasks.create({ title: need(title, 'title'), objective: objective || null, owner: owner || null, deps: Array.isArray(deps) ? deps : null }))
          if (action === 'assign') return Object.assign({ ok: true, action }, await tasks.assign(need(id, 'id'), need(owner, 'owner')))
          if (action === 'transition') return Object.assign({ ok: true, action }, await tasks.transition(need(id, 'id'), need(to, 'to'), { reason: reason || null }))
          if (action === 'stage') return Object.assign({ ok: true, action }, await tasks.stage())
          if (action === 'advance') return Object.assign({ ok: true, action }, await tasks.advance({ to: to || null, reason: reason || null }))
          if (action === 'brief') return Object.assign({ ok: true, action }, await tasks.brief(need(id, 'id')))
          if (action === 'history') return Object.assign({ ok: true, action }, { history: await tasks.history(id || null) })
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
