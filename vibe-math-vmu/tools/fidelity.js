// vibe-math-vmu/tools/fidelity.js — ROUND 3 / task-20 (v5r-reader-b's task-19 wiring sheet): the fidelity face's thin
// tool. `kernel/fidelity.js` is the C-45 ENFORCEMENT point (`applyAbstention` rewrites a registered member's boolean
// vote to 0.5), and it is deliberately NOT configurable ("a rule you can switch off is not an enforcement"), so this
// face carries NO settings family of its own: it is declared by the EXISTING `vmu.math.formalVerify` policy being on
// (`encourage`/`require`), which is the only honest declaration basis reader-b could name. With the default `off` the
// face is not published at all, so the zero-mechanism red line ("no declaration ⇒ exactly one tool") is untouched.
//
// ONE FOR ONE with `kernel.fidelity`'s method set: declareDefect / abstentionFor / applyAbstention / loadDefects /
// view / status. `by` is REQUIRED by the registry's `declareDefect`/`applyAbstention`, so the tool refuses by name when
// the caller does not identify itself (the tool layer's one semantic addition, per reader-b's sheet).
export function makeFidelitySpec({ param, refused, TOOL_NAMES, kernel }) {
  const METHODS = ['declareDefect', 'abstentionFor', 'applyAbstention', 'loadDefects', 'view', 'status']
  const NEEDS_BY = new Set(['declareDefect', 'applyAbstention'])
  return {
    name: TOOL_NAMES.fidelity,
    description: 'vmu 忠实性缺陷面（C-45）：action=' + METHODS.join('|') + '。★ `applyAbstention` 是**唯一强制点**——被登记者在该对象上的布尔票一律改写为 0.5 弃权，**不可由 pack 关闭**；`declareDefect` 只追加留痕，可落 `Formal/Defects/<target>.json` 并重载。本工具只做寻址与调用。',
    parameters: {
      action: param('string', METHODS.join('｜'), { required: true, enum: METHODS.slice() }),
      target: param('string', 'declareDefect/abstentionFor/applyAbstention：目标对象（章节/命题/成员 id）'),
      by: param('string', 'declareDefect/applyAbstention：登记者（**必填**，登记要求可追溯的当事人）'),
      note: param('string', 'declareDefect：缺陷说明（必填）'),
      declared: param('number', 'applyAbstention：该成员声明的布尔票（1/0 都会被改写为 0.5）'),
    },
    run: async ({ action, target, by, note, declared } = {}) => {
      try {
        const svc = kernel.fidelity
        if (!svc || typeof svc[action] !== 'function') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'this assembly has no fidelity face (kernel.fidelity.' + String(action) + ' is missing)')
        }
        if (NEEDS_BY.has(action) && (typeof by !== 'string' || by.length === 0)) {
          return refused('VMU_MATH_INVALID_INPUT', 'this action needs `by`: a defect must be traceable to a person', 'pass by:"<member id>" (the registry refuses an anonymous declaration)')
        }
        if (action === 'declareDefect' && (typeof target !== 'string' || target.length === 0 || typeof note !== 'string' || note.length === 0)) {
          return refused('VMU_MATH_INVALID_INPUT', 'declareDefect needs `target` and `note`', 'pass target:"<object>" and note:"<why this is a fidelity defect>"')
        }
        return Object.assign({ ok: true, action }, await svc[action]({ target, by, note, declared }))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
