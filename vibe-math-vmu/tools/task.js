// vibe-math-vmu/tools/task.js — the task tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeTaskSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.task,
      description: 'vmu 任务面：action=list|create|assign|transition|set_dependencies|stage|advance|brief|history。' +
        '任务是内核台账（依赖/阶段门/暂停门都由内核强制）；本工具只做**寻址与调用**，不复制任何策略。' +
        '★ `set_dependencies` 是 v5r 提示词早已声明的动词（`packs/v5r/prompts/v5r-blocks-a.js:542/579/611`）的**落点**：' +
        '两节点环/长环只能靠"改边"产生，所以这是 F35 的关键动作；成环 ⇒ `VMU_TASK_DEPENDENCY_CYCLE`（`detail.cycle` 给环路径）。',
      parameters: {
        action: param('string', 'list｜create｜assign｜transition｜set_dependencies｜stage｜advance｜brief｜history', { required: true,
          enum: ['list', 'create', 'assign', 'transition', 'set_dependencies', 'stage', 'advance', 'brief', 'history'] }),
        id: param('string', '任务 id（assign/transition/set_dependencies/brief 必填）'),
        title: param('string', 'create 的标题（必填）'),
        objective: param('string', 'create 的目标（可选）'),
        owner: param('string', 'create/assign 的负责人'),
        deps: param('array', 'create 的依赖 id 列表（可选）'),
        // ROUND 5 / task-35 (reader-a's F39): the v5r prompts have been SENDING this field all along; the framework
        // used to drop it. It is ADVISORY (a human-readable overlap hint, never a gate).
        write_scopes: param('array', 'create 的 advisory 写域列表（可选；仅供人看重叠，绝不阻断）'),
        blocked_by: param('array', 'set_dependencies 的新依赖边（完整替换该任务的依赖集）'),
        expected_revision: param('number', 'set_dependencies 的乐观锁（可选；与当前 revision 不符 ⇒ 具名拒）'),
        to: param('string', 'transition/advance 的目标状态或阶段'),
        reason: param('string', 'transition/advance 的原因'),
      },
      run: async ({ action, id, title, objective, owner, deps, write_scopes, blocked_by, expected_revision, to, reason } = {}) => {
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
        try {
          const tasks = kernel.tasks
          // ROUND 31 / task-16: the board is SHARED state (it pulls before a read face and merges its write-back into
          // the store), so a read receipt has to say whether what it just showed is durable and visible to the other
          // kernels. `tasks.sharing()` is the KERNEL's answer — this tool never infers or caches it, and the mutator
          // branches already carry the same object because they spread the kernel's own receipt.
          const sharing = () => (tasks && typeof tasks.sharing === 'function' ? { shared: tasks.sharing() } : {})
          if (action === 'list') return Object.assign({ ok: true, action }, { tasks: await tasks.list() }, sharing())
          if (action === 'create') return Object.assign({ ok: true, action }, await tasks.create({ title: need(title, 'title'), objective: objective || null, owner: owner || null, deps: Array.isArray(deps) ? deps : null, writeScopes: Array.isArray(write_scopes) ? write_scopes : [] }))
          if (action === 'assign') return Object.assign({ ok: true, action }, await tasks.assign(need(id, 'id'), need(owner, 'owner')))
          if (action === 'transition') return Object.assign({ ok: true, action }, await tasks.transition(need(id, 'id'), need(to, 'to'), { reason: reason || null }))
          // F35: the edge-rewriting action. `blocked_by` is the whole new dependency set (an empty array CLEARS it),
          // and the kernel refuses a cycle by name with the cycle path in `detail.cycle`.
          if (action === 'set_dependencies') return Object.assign({ ok: true, action }, await tasks.setDependencies(need(id, 'id'), Array.isArray(blocked_by) ? blocked_by : (Array.isArray(deps) ? deps : []), { expectedRevision: Number.isInteger(expected_revision) ? expected_revision : null }))
          if (action === 'stage') return Object.assign({ ok: true, action }, await tasks.stage())
          if (action === 'advance') return Object.assign({ ok: true, action }, await tasks.advance({ to: to || null, reason: reason || null }))
          if (action === 'brief') return Object.assign({ ok: true, action }, await tasks.brief(need(id, 'id')))
          if (action === 'history') return Object.assign({ ok: true, action }, { history: await tasks.history(id || null) }, sharing())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
