// vibe-math-vmu/tools/ip.js — the ip tool spec (round 556). Nineteen methods, the richest face so far; every method and the
// read/write split were measured before writing, because guessing names has cost this session five times.
export function makeIpSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.ip,
    description: 'vmu 知识产权面（(i) 评审与出版／研究产出归属）：19 个动作。★ 归属、披露与争议都由内核服务强制（★ 边界与在先技术均由服务校验 ✓）；本工具只做寻址与调用（整对象透传 ✓）。',
    parameters: {
      action: param('string', 'appeal｜complete｜contributors｜disclose｜dispute｜exportDossier｜file｜get｜history｜hold｜list｜ownership｜priorArt｜recordSearch｜release｜revenue｜status｜sweep｜transfer', { required: true,
        enum: ['appeal','complete','contributors','disclose','dispute','exportDossier','file','get','history','hold','list','ownership','priorArt','recordSearch','release','revenue','status','sweep','transfer'] }),
      request: param('object', '写动作的请求（形状由服务校验 ✓）'),
      id: param('string', '只读动作的目标 id（可选；★ 需要时服务会具名索要 ✓）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const ip = kernel.ip
        if (action === 'appeal') return Object.assign({ ok: true, action }, await ip.appeal(request))
        if (action === 'complete') return Object.assign({ ok: true, action }, await ip.complete(request))
        if (action === 'contributors') return Object.assign({ ok: true, action }, await ip.contributors({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'disclose') return Object.assign({ ok: true, action }, await ip.disclose({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'dispute') return Object.assign({ ok: true, action }, await ip.dispute(request))
        if (action === 'exportDossier') return Object.assign({ ok: true, action }, await ip.exportDossier(request))
        if (action === 'file') return Object.assign({ ok: true, action }, await ip.file(request))
        if (action === 'get') return Object.assign({ ok: true, action }, await ip.get({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'history') return Object.assign({ ok: true, action }, await ip.history({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'hold') return Object.assign({ ok: true, action }, await ip.hold(request))
        if (action === 'list') return Object.assign({ ok: true, action }, await ip.list({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'ownership') return Object.assign({ ok: true, action }, await ip.ownership({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'priorArt') return Object.assign({ ok: true, action }, await ip.priorArt({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'recordSearch') return Object.assign({ ok: true, action }, await ip.recordSearch(request))
        if (action === 'release') return Object.assign({ ok: true, action }, await ip.release(request))
        if (action === 'revenue') return Object.assign({ ok: true, action }, await ip.revenue(request))
        if (action === 'status') return Object.assign({ ok: true, action }, await ip.status({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'sweep') return Object.assign({ ok: true, action }, await ip.sweep(request))
        if (action === 'transfer') return Object.assign({ ok: true, action }, await ip.transfer(request))
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
