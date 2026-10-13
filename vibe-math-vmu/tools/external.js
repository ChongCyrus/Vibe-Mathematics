// vibe-math-vmu/tools/external.js — the external tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeExternalSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.external,
      description: 'vmu 外部面：action=fetchOne|fetchMany|normalize|cache|receipts|status。' +
        '★ **没声明就没有网络**（零配置下 `enabled:false`、`seam:none` ✓）；来源、策略与字节上限都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'fetchOne｜fetchMany｜normalize｜cache｜receipts｜status', { required: true,
          enum: ['fetchOne', 'fetchMany', 'normalize', 'cache', 'receipts', 'status'] }),
        source: param('string', '来源名（★ 由声明决定；★ 服务会回「已声明来源」清单 ✓）'),
        id: param('string', 'fetchOne 的条目 id（可选）'),
        query: param('string', 'fetchOne 的查询（可选）'),
        by: param('string', '发起者（可选）'),
        cacheDir: param('string', '缓存目录（可选）'),
        refs: param('array', 'fetchMany 的引用列表'),
        results: param('array', 'normalize 的原始结果（可选）'),
        raw: param('string', 'normalize 的原文（可选）'),
        enforced: param('array', 'normalize 的已求值键（可选）'),
      },
      run: async ({ action, source, id, query, by, cacheDir, refs, results, raw, enforced } = {}) => {
        try {
          const external = kernel.external
          if (action === 'fetchOne') return Object.assign({ ok: true, action }, await external.fetchOne({ source, id, query, by, cacheDir }))
          if (action === 'fetchMany') return Object.assign({ ok: true, action }, await external.fetchMany({ refs, by }))
          if (action === 'normalize') return Object.assign({ ok: true, action }, await external.normalize({ results, source, enforced, raw }))
          if (action === 'cache') return Object.assign({ ok: true, action }, await external.cache({ source }))
          if (action === 'receipts') return Object.assign({ ok: true, action }, await external.receipts({ source }))
          if (action === 'status') return Object.assign({ ok: true, action }, await external.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
