// vibe-math-vmu/tools/notify.js — the notify tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeNotifySpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.notify,
      description: 'vmu 通知面：action=watch|unwatch|emit|flush|list|status。' +
        '★ **默认【关】**（零配置下 `enabled:false`／`defaultOff:true` ✓）；订阅、去重、抑制与投递都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'watch｜unwatch｜emit｜flush｜list｜status', { required: true,
          enum: ['watch', 'unwatch', 'emit', 'flush', 'list', 'status'] }),
        subject: param('string', '订阅主体（watch 必填）'),
        id: param('string', '订阅 id（unwatch 必填）'),
        event: param('string', '事件名（emit 必填）'),
        payload: param('object', '事件负载（emit 可选）'),
        channel: param('string', '通道（可选；★ 由服务决定可用值 ✓）'),
      },
      run: async ({ action, subject, id, event, payload, channel } = {}) => {
        try {
          const notify = kernel.notify
          if (action === 'watch') return Object.assign({ ok: true, action }, await notify.watch({ subject, channel }))
          if (action === 'unwatch') return Object.assign({ ok: true, action }, await notify.unwatch({ id }))
          if (action === 'emit') return Object.assign({ ok: true, action }, await notify.emit({ event, payload }))
          if (action === 'flush') return Object.assign({ ok: true, action }, await notify.flush())
          if (action === 'list') return Object.assign({ ok: true, action }, await notify.list())
          if (action === 'status') return Object.assign({ ok: true, action }, await notify.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
