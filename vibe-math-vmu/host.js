// vmu host adapter — attaching the assembled kernel to the DSH tool surface (docs/03 §3, docs/11 §9).
//
// Everything up to here proves the kernel works when DRIVEN. This file is the part that makes it reachable
// from inside a real host, and it is written under the same first promise: INERT BY DEFAULT.
//   · `vmu.core.enabled === false`  ⇒ NOTHING is registered (inert means invisible, not "a tool that says
//     it is off");
//   · enabled with nothing declared ⇒ exactly ONE tool, `vibe_vmu_status`, because being able to SEE that
//     the kernel is inert is the point of the default;
//   · the other tools appear only when the thing they expose exists (a records tool with no durable root
//     is not registered at all - the status tool reports the missing seam instead of shipping a tool that
//     can only refuse);
//   · tools are described with the repository's own documented DSL (parameters with `required` INSIDE each
//     parameter, boolean `additionalProperties` on object parameters, and an `output` with schema+render),
//     so `audit-math-computation-contract` and the host's own guards agree with us.
//
// Refusals are returned as NAMED structured failures (`ok:false` + code + hint), never swallowed: a model
// must be able to read WHY something was refused (R11).

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export const TOOL_NAMES = Object.freeze({
  status: 'vibe_vmu_status',
  set: 'vibe_vmu_set',
  middleware: 'vibe_vmu_middleware',
  records: 'vibe_vmu_records',
})

const OUTPUT = Object.freeze({
  schema: { type: 'object', additionalProperties: true, properties: { ok: { type: 'boolean' } }, required: ['ok'] },
  render: (result) => JSON.stringify(result, null, 2),
  presentationMeta: { title: 'vibe-math-unify' },
})

const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)

/** The tool catalogue, filtered by what actually exists (docs/04 §11 ownership: mechanism only). */
export function toolSpecs({ kernel, settings = {}, assertDeclared = null, log = () => {} }) {
  const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })
  const specs = []

  // 1) status — ALWAYS available when the kernel is enabled: it is how the inert default is observable.
  specs.push({
    name: TOOL_NAMES.status,
    description: 'vmu 内核状态：装配了哪些服务/接缝、注册了哪些中间件、生效的整合包、以及是否"零机制惰性"。只读。',
    parameters: {},
    output: OUTPUT,
    handler: async () => {
      try {
        return Object.assign({ ok: true }, kernel.status())
      } catch (e) {
        return refused('VMU_MIDDLEWARE_FAILED', 'status() failed: ' + String(e && e.message))
      }
    },
  })

  // 2) set — only with a declared-key guard (an undeclared key is a defect, never a default: R4).
  if (typeof assertDeclared === 'function') {
    specs.push({
      name: TOOL_NAMES.set,
      description: '改一个 vmu 设置。未声明的键一律具名拒；回执含热改等级与可改者。',
      parameters: {
        key: param('string', '设置键，必须已在 docs/04 §11 登记', { required: true }),
        value: param('string', '新值（按声明的类型解析：布尔/数字/JSON 数组或对象/字符串）'),
      },
      output: OUTPUT,
      handler: async ({ key, value } = {}) => {
        try {
          assertDeclared(key)
        } catch (e) {
          return refused(e.code || 'VMU_INVALID_ARGUMENT', String(e.message), e.hint)
        }
        const def = (kernel.settingDef ? kernel.settingDef(key) : null) || null
        let parsed = value
        if (typeof value === 'string') {
          const t = def ? def.type : null
          if (t === 'boolean') parsed = value === 'true'
          else if (t === 'natural' || t === 'positiveInteger') parsed = Number(value)
          else if (t === 'stringList' || t === 'objectList') { try { parsed = JSON.parse(value) } catch { return refused('VMU_INVALID_ARGUMENT', 'value must be JSON for ' + t) } }
        }
        try {
          kernel.setSettingsValue(key, parsed)
        } catch (e) {
          return refused('VMU_PACK_CONFLICT', String(e.message), e.hint)
        }
        log('vmu set ' + key)
        return { ok: true, key, value: parsed, hot: def ? def.hot : null, who: def ? def.who : null,
          appliesFrom: def && def.hot === 'H0' ? 'immediately' : 'next turn/session per its hot class' }
      },
    })
  }

  // 3) middleware — only when middleware was declared.
  const declaredEntries = Array.isArray(settings['vmu.middleware.entries']) ? settings['vmu.middleware.entries'] : []
  if (declaredEntries.length > 0 && kernel.bus) {
    specs.push({
      name: TOOL_NAMES.middleware,
      description: '查看/启停 vmu 中间件（四种形态共用一条总线）。action=list|disable|enable。',
      parameters: {
        action: param('string', 'list（默认）｜disable｜enable', { required: true, enum: ['list', 'disable', 'enable'] }),
        id: param('string', '中间件条目 id（disable/enable 必填）'),
      },
      output: OUTPUT,
      handler: async ({ action = 'list', id } = {}) => {
        try {
          if (action === 'list') return Object.assign({ ok: true, action }, kernel.bus.status())
          if (!id) return refused('VMU_INVALID_ARGUMENT', 'disable/enable 需要 id')
          if (action === 'disable') return Object.assign({ ok: true, action, result: kernel.bus.disable(id, 'disabled by tool') })
          if (action === 'enable') return Object.assign({ ok: true, action, result: kernel.bus.enable(id) })
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_NO_SUCH_OBJECT', String(e.message), e.hint)
        }
      },
    })
  }

  // 4) records — only when a durable library exists (no root ⇒ no records tool at all, see the header).
  if (kernel.library) {
    specs.push({
      name: TOOL_NAMES.records,
      description: 'vmu 记录面：list（头部列表，不含正文）｜expand（按 id 取正文，超限计数）｜append（写入并回指纹）。',
      parameters: {
        action: param('string', 'list（默认）｜expand｜append', { required: true, enum: ['list', 'expand', 'append'] }),
        id: param('string', '记录 id（expand 必填）'),
        kind: param('string', 'append：proposition｜method｜subproblem', { enum: ['proposition', 'method', 'subproblem'] }),
        statement: param('string', 'append：陈述'),
        proof: param('string', 'append：证明/方法正文'),
      },
      output: OUTPUT,
      handler: async ({ action = 'list', id, kind, statement, proof } = {}) => {
        try {
          if (action === 'list') return Object.assign({ ok: true, action }, { records: await kernel.library.list() })
          if (action === 'expand') return Object.assign({ ok: true, action }, await kernel.library.expand(id))
          if (action === 'append') {
            const r = await kernel.library.append({ kind, statement, proof })
            return Object.assign({ ok: true, action }, r)
          }
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_INVALID_ARGUMENT', String(e.message), e.hint)
        }
      },
    })
  }

  return specs
}

/**
 * Install the tools into a host context. `ctx.tools.register(spec)` returns a disposer (verified against
 * our own DSH surface recon); a host that offers `defineTool` may be used instead, and the adapter does not
 * care which, because both end up as one registration per spec.
 */
export function createHostAdapter({ ctx, kernel, settings = {}, assertDeclared = null, defineTool = null, log = () => {} } = {}) {
  const disposers = []
  const registered = []
  let installed = false

  return {
    /** What WOULD be registered (pure: no host calls) - the host-side zero-mechanism proof. */
    plan() {
      const disabled = settings['vmu.core.enabled'] === false
      const specs = disabled ? [] : toolSpecs({ kernel, settings, assertDeclared, log })
      return { enabled: !disabled, names: specs.map((s) => s.name), count: specs.length,
        reason: disabled ? 'vmu.core.enabled = false: the adapter registers nothing' : undefined }
    },

    async install() {
      if (installed) return { ok: true, already: true, names: registered.slice() }
      if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
        throw Object.assign(new Error('the host context has no tools.register'), { code: 'VMU_ENGINE_UNAVAILABLE',
          hint: 'pass a DSH context; the adapter never invents a tool surface' })
      }
      const plan = this.plan()
      if (plan.count === 0) {
        installed = true
        log('vmu is disabled: nothing registered')
        return { ok: true, installed: 0, names: [], note: plan.reason }
      }
      for (const spec of toolSpecs({ kernel, settings, assertDeclared, log })) {
        const toRegister = typeof defineTool === 'function' ? defineTool(spec) : spec
        const dispose = await ctx.tools.register(toRegister)
        disposers.push(typeof dispose === 'function' ? dispose : () => {})
        registered.push(spec.name)
      }
      installed = true
      return { ok: true, installed: registered.length, names: registered.slice() }
    },

    async uninstall() {
      const failures = []
      for (const d of disposers.splice(0)) { try { d() } catch (e) { failures.push(String(e && e.message)) } }
      registered.length = 0
      installed = false
      return { ok: failures.length === 0, failures }
    },

    status() {
      return { installed, registered: registered.slice(), plan: this.plan(),
        note: 'with nothing declared only vibe_vmu_status is registered; with vmu.core.enabled=false nothing is' }
    },
  }
}
