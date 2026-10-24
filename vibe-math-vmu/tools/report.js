// vibe-math-vmu/tools/report.js — the `vibe_vmu_report` tool spec, split out of host.js the way every domain face is
// (round 538: the host file stays inside the DECIDED 1200-line limit, docs/02). The spec is a factory: host.js supplies
// the shared helpers, and the guard condition stays there, because WHICH intent declares a tool is policy and policy
// belongs with the host.
//
// WHAT THIS TOOL IS. The main agent is an assistant, and an assistant is configurable by the human it serves. This is
// that surface: read the DECLARED parameter domain, change a parameter inside it, preview or fire a declared report, and
// read the report trace. Three things it deliberately does NOT do:
//   · it does not decide WHO may change a parameter - `vmu.report.whoMayChange` does, and the kernel's own
//     setSettingsValue() owns the H3/declared-owner refusal. This face never writes settings by hand;
//   · it does not send anything itself - `kernel.report.emit/tick` do, through the injected transport;
//   · it does not log an action as if it were a decision: every receipt says `drives:false`.
export function makeReportSpec({ param, refused, TOOL_NAMES, kernel }) {
  /** The reporting service, refused BY NAME when this assembly has none (never a silent no-op). */
  const face = () => {
    const r = kernel && kernel.report
    if (!r) throw refused('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no report surface', 'construct the kernel with the report face enabled (kernel/report.js)')
    return r
  }
  return {
    name: TOOL_NAMES.report,
    description: 'vmu 汇报与参数配置面：action=status|declarations|params|set|preview|emit|tick|trace。' +
      '**自动汇报**由声明驱动（vmu.report.reports：事件/周期/阈值 三类触发＋内容模板＋收件人/通道），默认零机制（不声明就什么都不发生，vmu.report.enabled 默认 false）；' +
      '**汇报只提示、绝不代替决策**（每份回执带 drives:false）。**参数配置**只改**已声明的域**（vmu.report.params），谁能改由 vmu.report.whoMayChange 声明（对齐 v5r「参数只能所办改」），改动留痕进审计。',
    parameters: {
      action: param('string', 'status（默认）｜declarations｜params｜set｜preview｜emit｜tick｜trace',
        { required: true, enum: ['status', 'declarations', 'params', 'set', 'preview', 'emit', 'tick', 'trace'] }),
      key: param('string', 'set 必填：要改的设置键（必须在 vmu.report.params 声明的域内）'),
      value: param('string', 'set 必填：新值（布尔写 true/false，数字写数值，列表写 JSON 数组）'),
      by: param('string', 'set：改动人（默认 office 路径；vmu.report.whoMayChange 决定谁可以改）'),
      reason: param('string', 'set/emit：理由（vmu.report.requireReason=true 时 set 必须给）'),
      name: param('string', 'preview/emit 必填：汇报声明的名字（declarations 里可查）'),
      event: param('string', 'tick：本次推进要投递的事件名（闭集，见 kernel/report.js 的 EVENT_VOCAB）'),
      metrics: param('string', 'tick：阈值触发用的度量对象（JSON，如 {"artifacts": 12}）'),
      limit: param('string', 'trace：返回最近多少条（默认 20）'),
    },
    run: async ({ action = 'status', key, value, by, reason, name, event, metrics, limit } = {}) => {
      try {
        const r = face()
        // `value` arrives as a string from a tool call, so the DECLARED type decides how it is read - and an
        // unparseable value is refused rather than silently stored as the string "false".
        const parseValue = () => {
          if (typeof value === 'string') {
            const t = value.trim()
            if (t === 'true') return true
            if (t === 'false') return false
            if (t === 'null') return null
            if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
            if (t.startsWith('[') || t.startsWith('{')) {
              try { return JSON.parse(t) } catch (e) { throw refused('VMU_INVALID_ARGUMENT', 'value looks like JSON but does not parse: ' + String((e && e.message) || e)) }
            }
          }
          return value
        }
        const parseMetrics = () => {
          if (metrics === undefined || metrics === null || metrics === '') return null
          if (typeof metrics === 'object') return metrics
          try { return JSON.parse(String(metrics)) } catch (e) { throw refused('VMU_INVALID_ARGUMENT', 'metrics must be a JSON object: ' + String((e && e.message) || e)) }
        }
        const n = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined)

        if (action === 'status') return Object.assign({ ok: true, action }, r.status())
        if (action === 'declarations') return Object.assign({ ok: true, action }, r.declarations())
        if (action === 'params') return Object.assign({ ok: true, action }, r.paramDomain())
        if (action === 'trace') return Object.assign({ ok: true, action }, r.trace({ limit: n(limit) }))
        if (action === 'preview') {
          if (!name) return refused('VMU_INVALID_ARGUMENT', 'preview needs name')
          return Object.assign({ ok: true, action }, r.preview({ name, payload: { metrics: parseMetrics() } }))
        }
        if (action === 'emit') {
          if (!name) return refused('VMU_INVALID_ARGUMENT', 'emit needs name')
          try {
            return Object.assign({ ok: true, action }, r.emit({ name, payload: { metrics: parseMetrics() } }))
          } catch (e) {
            // ★ LIVE RUN 9, finding C: a refusal is a READ FACE, but the host's catch branch builds EXACTLY
            // {ok:false, code, message, hint} and drops every other property (see the note in kit/handlers.js). So the
            // three facts the acceptance check must transcribe (this channel never drives the loop; no transport is
            // injected) existed on status()/trace() but NOT on the receipt of the call that failed. Measured: the
            // kernel-side refusal carries them (kernel/report.js) and they were lost here.
            const extra = {}
            for (const k of ['drives', 'neverDrives', 'transportInjected', 'report', 'id']) {
              if (e && e[k] !== undefined) extra[k] = e[k]
            }
            return Object.assign(refused((e && e.code) || 'VMU_ENGINE_UNAVAILABLE', String((e && e.message) || e), (e && e.hint)), extra)
          }
        }
        if (action === 'tick') {
          return Object.assign({ ok: true, action }, r.tick({ at: null, event: event === undefined ? null : event, metrics: parseMetrics() }))
        }
        if (action === 'set') {
          if (!key) return refused('VMU_INVALID_ARGUMENT', 'set needs key')
          // 1) THE DECLARED DOMAIN decides what is even addressable; 2) who may change it; 3) whether a reason is
          // required. The module owns all three so the tool and any other caller cannot drift apart.
          const guard = r.guardParam({ key, by: by === undefined ? null : by, reason: reason === undefined ? null : reason })
          const before = r.paramDomain().entries.find((e) => e.key === guard.key) || null
          if (!kernel || typeof kernel.setSettingsValue !== 'function') {
            return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel cannot write settings', 'the reporting face reads; the kernel owns the sanctioned write path')
          }
          // THE SANCTIONED WRITER: H3 ("read-only") and the declared owner are refused there, by name.
          const receipt = kernel.setSettingsValue(guard.key, parseValue(), { by: guard.by })
          // The change already happened, so the ledger is written AFTER it and its own failure is REPORTED (a named
          // gap in the audit) rather than thrown - refusing after the fact would leave the caller thinking nothing moved.
          const ledger = r.noteParamChange({ key: guard.key, from: before ? before.value : null, to: receipt.value, by: guard.by,
            reason: reason === undefined ? null : reason, hot: receipt.hot })
          // THE KERNEL'S RECEIPT IS FORWARDED WHOLE (`...receipt`), not re-typed field by field: the hot class, the real
          // apply point, the MEASURED live readers (`liveReadBy`) and the kernel's own note about them are facts the
          // assistant must see, and a hand-copied subset silently dropped `liveReadBy` the moment the kernel added it -
          // found by the round-3 end-to-end suite, which asserted the field on the TOOL's receipt, not the kernel's.
          return Object.assign({}, receipt, { ok: true, action, key: guard.key, previous: receipt.previous,
            audit: ledger.audit, drives: false })
        }
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        if (e && e.code && !(e instanceof Error)) return e   // already a structured refusal
        return refused((e && e.code) || 'VMU_STATE', String((e && e.message) || e), (e && e.hint) || undefined)
      }
    },
  }
}
