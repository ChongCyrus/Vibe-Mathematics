// vibe-math-vmu/tools/mathjobs.js — ROUND 2 (task-14, Lead 裁决 B): the math JOB face's OWN thin tool. Same reason as
// tools/mathadapters.js: `kernel.mathjobs` is a different service from `kernel.mathtools`, and a tool's action enum
// must be exactly ITS service's method set (one for one) - so jobs get their own face instead of being folded in.
//
// The job MIRROR (`vmu.math.jobs.dir`, root-relative) is what makes recovery real: `jobsRecover` scans the mirrors and
// `jobsAdmission` says BY NAME whether the file mirror is wired (`fileMirror:false` when the `fs` seam is absent).
export function makeMathjobsSpec({ param, refused, TOOL_NAMES, kernel }) {
  // ONE FOR ONE with `kernel.mathjobs`'s method set (measured after the module landed: 16 methods, including the two
  // mirror-introspection verbs `listMirrors`/`mirrorRel` that the first draft of this list missed).
  const METHODS = ['submit', 'status', 'cancel', 'receipt', 'list', 'statusAll', 'checkReceipt', 'keysUsed', 'config',
    'trail', 'recover', 'mirrors', 'listMirrors', 'mirrorRel', 'admission', 'jobsDir']
  return {
    name: TOOL_NAMES.mathjobs,
    description: 'vmu 数学作业面：action=' + METHODS.join('|') + '。超时保留部分输出、回执六要素、随机需种子、' +
      '镜像恢复（四态）都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
    parameters: {
      action: param('string', METHODS.join('｜'), { required: true, enum: METHODS.slice() }),
      engine: param('string', 'submit：引擎名（缺省时由服务按声明选择）'),
      argv: param('object', 'submit：参数数组（形状由服务校验）'),
      stdin: param('string', 'submit：标准输入'),
      timeoutMs: param('integer', 'submit：单次预算（毫秒）'),
      seed: param('string', 'submit：随机种子（依赖随机性的作业必填）'),
      jobId: param('string', 'status/cancel/receipt/checkReceipt：目标作业 id'),
      reason: param('string', 'cancel：取消理由（写入回执与审计）'),
    },
    run: async ({ action, ...rest } = {}) => {
      try {
        const svc = kernel.mathjobs
        if (!svc || typeof svc[action] !== 'function') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'this assembly has no math-jobs face (kernel.mathjobs.' + String(action) + ' is missing)')
        }
        const result = await svc[action](rest)
        // ★★★ NEVER SPREAD A PRIMITIVE. Measured on a full live run: `jobsDir` returns a PATH STRING, and
        // `Object.assign({ ok:true, action }, 'M:/a/b')` spread it character by character into `{0:'M',1:'/',2:'a',…}` -
        // the caller got a receipt that looked like data and was a bug. A primitive has no properties to merge, so the
        // honest receipt names it: `result`. (The same shape exists in ~250 sibling faces; this one is fixed here and the
        // systemic repair is recorded in docs/acceptance/phase11-final-run-triage.md.)
        if (result === null || result === undefined || typeof result !== 'object') {
          return { ok: true, action, result: result === undefined ? null : result }
        }
        return Object.assign({ ok: true, action }, result)
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
