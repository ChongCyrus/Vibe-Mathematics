// vibe-math-vmu/tools/mathadapters.js — ROUND 2 (task-14, Lead 裁决 B): the scientific-library adapter face's OWN
// thin tool. WHY ITS OWN FACE: `vibe_vmu_mathtools`'s contract is "the action enum is EXACTLY `kernel.mathtools`'s
// method set, one for one"; the adapters live on `kernel.mathadapters`, so folding them in would break that
// correspondence (and a tool that addresses two services is exactly the ambiguity the project keeps removing).
//
// The spec is the same factory shape every other face uses: host.js supplies the shared helpers, and WHICH INTENT
// declares this tool stays in host.js (policy belongs with the host). Every action maps to the service method of the
// same name - no policy is copied here, and an unknown action is refused by name.
export function makeMathadaptersSpec({ param, refused, TOOL_NAMES, kernel }) {
  const METHODS = ['probe', 'plan', 'run', 'shapeContract', 'status', 'keysUsed', 'config', 'clearBinding']
  return {
    name: TOOL_NAMES.mathadapters,
    description: 'vmu 数学库适配面：action=' + METHODS.join('|') + '。numpy/scipy/pandas/sympy 的会话级环境绑定、' +
      '结果形状契约与具名拒都由内核服务强制；本工具只做**寻址与调用**（`lib`/`op`/`expr`/`code`/`packages`/`seed` 等' +
      '参数原样转交，形状由服务校验）。缺 `resolveExecutable`/`spawn` 接缝时服务会具名拒，绝不假装探测。',
    parameters: {
      action: param('string', METHODS.join('｜'), { required: true, enum: METHODS.slice() }),
      lib: param('string', 'plan/run：目标库（numpy｜scipy｜pandas｜sympy；须在 vmu.math.adapters.libs 内）'),
      op: param('string', 'plan/run：操作名（形状由服务校验）'),
      mode: param('string', 'plan：模式（服务声明集合内）'),
      expr: param('string', 'plan/run：表达式（sympy 类操作）'),
      code: param('string', 'plan/run：代码片段（服务声明的白名单内）'),
      fn: param('string', 'plan/run：库内函数名'),
      packages: param('object', 'plan/run：包清单（数组；须为 vmu.math.adapters.packageAllowlist 的子集）'),
      seed: param('string', 'plan/run：随机种子（依赖随机性的操作必填，服务具名索要）'),
      timeoutMs: param('integer', 'plan/run：单次预算（毫秒）'),
      args: param('object', 'plan/run：适配调用参数（形状由服务决定）'),
      refresh: param('boolean', 'probe：是否重探环境绑定（true＝忽略会话缓存）'),
    },
    run: async ({ action, ...rest } = {}) => {
      try {
        const svc = kernel.mathadapters
        if (!svc || typeof svc[action] !== 'function') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'this assembly has no math-adapters face (kernel.mathadapters.' + String(action) + ' is missing)')
        }
        return Object.assign({ ok: true, action }, await svc[action](rest))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
