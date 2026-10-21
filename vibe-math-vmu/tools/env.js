// vibe-math-vmu/tools/env.js — PHASE 9 / goal 3: the model-facing ENVIRONMENT adapter.
//
// It reports; it never installs. `installCommand` is returned as DATA for the member/main agent, and this file has no
// child_process, network, fetch or package-manager call. Absence of an environment is a normal `ok:false` PROBE RESULT;
// only a wrong use of the face (unknown need) is a refusal.
export function makeEnvSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.env,
    description: '环境适配面：action=probe|list|report。用注入的 spawn 接缝跑需求表里的 probe；**探测失败是正常结果（ok:false），不是异常**；' +
      'installCommand 只作为数据返回，本面【绝不安装/不联网/不请求权限】；report 把缺失记成 records 里的一条 finding，供主代理读。',
    parameters: {
      action: param('string', 'probe｜list｜report', { required: true, enum: ['probe', 'list', 'report'] }),
      need: param('string', 'probe/report：需求名（如 python、lean、xelatex；见 list）'),
      needs: param('array', 'probe：批量需求名列表'),
      why: param('string', 'report：为什么这个环境是必需的'),
      detail: param('string', 'report：附加细节（错误/路径/版本等）'),
    },
    run: async ({ action, need, needs, why, detail } = {}) => {
      try {
        const env = kernel && kernel.env
        if (!env) return refused('VMU_ENGINE_UNAVAILABLE', 'the environment adapter is not mounted in this kernel',
          'assemble a kernel with createEnvFace (kernel/index.js does it unconditionally)')
        if (action === 'probe') {
          if (Array.isArray(needs)) return Object.assign({ ok: true, action }, await env.probe({ needs }))
          return Object.assign({ ok: true, action }, await env.probe({ need: need === undefined ? null : need }))
        }
        if (action === 'list') return Object.assign({ ok: true, action }, env.list())
        if (action === 'report') {
          if (need === undefined || need === null || String(need) === '') return refused('VMU_INVALID_ARGUMENT', 'report needs need', 'pass need:"<name from list>"')
          return Object.assign({ ok: true, action }, env.report({ need, why: why === undefined ? null : why, detail: detail === undefined ? null : detail }))
        }
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action), 'known: probe, list, report')
      } catch (e) {
        return refused((e && e.code) || 'VMU_STATE', String((e && e.message) || e), (e && e.hint) || null)
      }
    },
  }
}
