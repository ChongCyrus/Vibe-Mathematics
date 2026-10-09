// vmu host adapter — attaching the assembled kernel to the DSH tool surface (docs/03 §3, docs/11 §9).
//
// TOOL SHAPE (learned from the REAL HOST, not from our own assumptions): the first scripted live run
// (SLV) showed the preset active but NO vmu tools in the agent's tool list. The cause was this file: the
// host's registration shape is the one this repository's own working preset uses
// (`vibe-math-v5r.js:10934-10938`):
//
//     ctx.effect(() => tools.register({
//       name, description, parameters,
//       output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
//       execute: async (args, exec) => JSON.stringify(result),      // ← execute, and it returns a STRING
//     }))
//
// Three details matter, and all three differ from the first version of this file:
//   · the executor is `execute(args, exec)`, NOT `handler`;
//   · the executor returns a STRING (JSON), and `output.schema` says so;
//   · `output.render` returns a CONTENT-PART ARRAY, not a string.
// A tool registered with the wrong key is accepted silently and simply never appears, which is exactly
// why a library-level test with a self-invented shape cannot catch it (the host can).
//
// The first promise still holds: INERT BY DEFAULT.
//   · `vmu.core.enabled === false`   ⇒ NOTHING registered (inert means invisible);
//   · enabled with nothing declared  ⇒ exactly ONE tool, `vibe_vmu_status`, because being able to SEE that
//     the kernel is inert is the point of the default;
//   · a tool appears only when the thing it exposes exists (no records tool without a durable root);
//   · refusals are returned as NAMED structured JSON, never swallowed.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

export const TOOL_NAMES = Object.freeze({
  status: 'vibe_vmu_status',
  set: 'vibe_vmu_set',
  middleware: 'vibe_vmu_middleware',
  records: 'vibe_vmu_records',
  script: 'vibe_vmu_script',
})

/**
 * The host-verified output envelope: a JSON string rendered as one text part.
 *
 * The host's exact predicate (`dsh-tools/lib/index.js:2881`, read from the installed asar) is:
 *   output === undefined || typeof output !== 'object' || typeof output.render !== 'function'
 *     || (output.presentationMeta !== undefined && typeof output.presentationMeta !== 'function')
 *     ⇒ throw TypeError('tool "<name>" must declare output { schema, render, presentationMeta? }')
 * So `presentationMeta`, when present, must be a FUNCTION - an object is rejected, and the message does
 * not say which clause failed. That is exactly the defect the first scripted live run exposed; this file
 * therefore omits it (as the repository's working preset does).
 */
export const OUTPUT = Object.freeze({
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
})

const param = (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra)

/**
 * The tool catalogue. Each entry carries an internal `run(args, exec)` returning a plain object; the
 * adapter turns it into the host shape (`execute` returning JSON). Filtering by what actually exists keeps
 * the surface honest (docs/04 §11 ownership: mechanism only).
 */
export function toolSpecs({ kernel, settings = {}, assertDeclared = null, log = () => {}, instance = null, scripts = [] }) {
  const refused = (code, message, hint) => ({ ok: false, code, message, hint: hint || null })
  const specs = []

  // 1) status — ALWAYS available when the kernel is enabled: it is how the inert default is observable.
  // It also PROVES WHICH INSTANCE answered: a profile can hold two vmu rows (the preset's and a standalone
  // one), the host keeps one registration per name, and without an identity the receipts look contradictory.
  specs.push({
    name: TOOL_NAMES.status,
    description: 'vmu 内核状态：装配了哪些服务/接缝、注册了哪些中间件、生效的整合包、实例身份、以及是否"零机制惰性"。只读。',
    parameters: {},
    run: async () => {
      try {
        return Object.assign({ ok: true, instance }, kernel.status())
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
      run: async ({ key, value } = {}) => {
        try {
          assertDeclared(key)
        } catch (e) {
          return refused(e.code || 'VMU_INVALID_ARGUMENT', String(e.message), e.hint)
        }
        const def = (kernel.settingDef ? kernel.settingDef(key) : null) || null
        // HOT CLASSES ARE A CONTRACT, not a label (docs/04 §5): H3 is framework-owned and must be REFUSED by
        // name (a silent no-op is exactly the "改了没反应" the manual forbids); H1/H2 must say when it lands.
        if (def && def.hot === 'H3') {
          return refused('VMU_NOT_PERMITTED', 'setting ' + key + ' is read-only (H3): the framework owns it',
            'H3 keys are not user-changeable; see docs/04 §5 for its declared who/hot')
        }
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
        // The receipt says exactly WHEN the new value takes effect, per its declared hot class, so a reader
        // never has to guess whether a change was ignored (H2 ⇒ a new session is required, and we say so).
        const APPLIES = { H0: 'immediately', H1: 'next turn', H2: 'next session (restart required)' }
        const resolved = kernel.status ? (kernel.status().settings.resolved || {})[key] : null
        return { ok: true, key, value: parsed, hot: def ? def.hot : null, who: def ? def.who : null,
          appliesFrom: def ? (APPLIES[def.hot] || 'unknown hot class') : 'unknown (undeclared key)',
          source: resolved ? resolved.source : null,
          note: 'settings.resolved in vibe_vmu_status shows every key with its value, source and hot class' }
      },
    })
  }

  // 3) middleware — when middleware was declared OR the bus already has entries (a PACK can add them, and
  // observability must follow reality, not only the declaration).
  const declaredEntries = Array.isArray(settings['vmu.middleware.entries']) ? settings['vmu.middleware.entries'] : []
  const busEntries = kernel.bus && kernel.bus.status ? (kernel.bus.status().entries || []) : []
  if ((declaredEntries.length > 0 || busEntries.length > 0) && kernel.bus) {
    specs.push({
      name: TOOL_NAMES.middleware,
      description: '查看/启停 vmu 中间件（四种形态共用一条总线）。action=list|disable|enable。',
      parameters: {
        action: param('string', 'list（默认）｜disable｜enable', { required: true, enum: ['list', 'disable', 'enable'] }),
        id: param('string', '中间件条目 id（disable/enable 必填）'),
      },
      run: async ({ action = 'list', id } = {}) => {
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
      run: async ({ action = 'list', id, kind, statement, proof } = {}) => {
        try {
          if (action === 'list') return Object.assign({ ok: true, action }, { records: await kernel.library.list() })
          if (action === 'expand') return Object.assign({ ok: true, action }, await kernel.library.expand(id))
          if (action === 'append') return Object.assign({ ok: true, action }, await kernel.library.append({ kind, statement, proof }))
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_INVALID_ARGUMENT', String(e.message), e.hint)
        }
      },
    })
  }

  // 5) scripts (M3) — only when the configuration DECLARES scripts. Results go back to the caller and
  // nowhere else: this tool has no prompt path at all (docs/06 §5).
  if (Array.isArray(scripts) && scripts.length > 0) {
    specs.push({
      name: TOOL_NAMES.script,
      description: '列出或运行本次运行声明的 M3 脚本。action=list|run；结果只回给调用方，**绝不自动进入提示词**。',
      parameters: {
        action: param('string', 'list（默认）｜run', { required: true, enum: ['list', 'run'] }),
        id: param('string', '脚本 id（run 必填）'),
        args: param('string', 'JSON 数组形式的附加参数（可选）'),
      },
      run: async ({ action = 'list', id, args } = {}) => {
        try {
          if (action === 'list') {
            return { ok: true, action, scripts: scripts.map((s) => ({ id: s && s.id, file: s && s.file, timeoutMs: (s && s.timeoutMs) || null })) }
          }
          if (action !== 'run') return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
          const script = scripts.find((s) => s && s.id === id)
          if (!script) {
            return refused('VMU_NO_SUCH_OBJECT', 'no declared script with id ' + String(id),
              'declared: ' + scripts.map((s) => s && s.id).join(', '))
          }
          let extra = []
          if (typeof args === 'string' && args.trim().length > 0) {
            try { extra = JSON.parse(args) } catch { return refused('VMU_INVALID_ARGUMENT', 'args must be a JSON array of strings') }
            if (!Array.isArray(extra)) return refused('VMU_INVALID_ARGUMENT', 'args must be a JSON array of strings')
          }
          // Build the request CONDITIONALLY: the bridge's validator refuses a present-but-wrong cwd, so an
          // absent optional field must stay absent (null is not a string).
          const request = {
            file: script.file,
            args: (script.args || []).concat(extra.map(String)),
            timeoutMs: script.timeoutMs || 0,
            failure: script.failure || 'open',
          }
          if (typeof script.cwd === 'string' && script.cwd.length > 0) request.cwd = script.cwd
          if (script.env && typeof script.env === 'object' && !Array.isArray(script.env)) request.env = script.env
          const result = await kernel.bridge.run(request)
          return Object.assign({ ok: true, action, script: id }, result)
        } catch (e) {
          return refused(e.code || 'VMU_MIDDLEWARE_FAILED', String(e.message), e.hint)
        }
      },
    })
  }

  return specs
}

/**
 * The host's parameter shape, learned the hard way from the live run:
 *   Invalid schema for function 'vibe_vmu_status': schema must be a JSON Schema of 'type: "object"',
 *   got 'type: null'
 * The PROVIDER (not the host) rejects a function whose parameter schema is not an object schema, and it
 * rejects the WHOLE REQUEST - which shows up as a silent zero-token turn. So every tool's parameters are
 * published as `{ type:'object', properties, required, additionalProperties:false }`, with `required` as
 * the top-level array (exactly what the repository's working preset builds via objParams()).
 */
export function toHostParameters(params = {}) {
  const properties = {}
  const required = []
  for (const [name, def] of Object.entries(params)) {
    const { required: isRequired, ...rest } = def
    properties[name] = rest
    if (isRequired === true) required.push(name)
  }
  return { type: 'object', properties, additionalProperties: false, required }
}

/** Turn an internal spec into the HOST's shape (the one the real host accepted for v5r). */
export function toHostSpec(spec) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: toHostParameters(spec.parameters || {}),
    output: OUTPUT,
    execute: async (args, exec) => {
      try {
        return JSON.stringify(await spec.run(args || {}, exec))
      } catch (e) {
        return JSON.stringify({ ok: false, code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED',
          message: String((e && e.message) || e), hint: (e && e.hint) || null })
      }
    },
  }
}

/**
 * Install the tools into a host context. Registrations go through `ctx.effect(..., label)` when the host
 * offers it - the host's own guidance requires that, and it is what unwinds them on subtree unload - and
 * fall back to keeping the returned disposers otherwise.
 */
export function createHostAdapter({ ctx, kernel, settings = {}, assertDeclared = null, defineTool = null, log = () => {}, instance = null, scripts = [] } = {}) {
  const disposers = []
  const registered = []
  const failures = []
  let installed = false
  let ownedByHost = false
  let chain = Promise.resolve()

  const specs = () => (settings['vmu.core.enabled'] === false ? [] : toolSpecs({ kernel, settings, assertDeclared, log, instance, scripts }))

  const doInstall = async () => {
    if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
      throw Object.assign(new Error('the host context has no tools.register'), { code: 'VMU_ENGINE_UNAVAILABLE',
        hint: 'pass a DSH context; the adapter never invents a tool surface' })
    }
    const list = specs()
    if (list.length === 0) {
      installed = true
      log('vmu is disabled: nothing registered')
      return { ok: true, installed: 0, names: [], note: 'vmu.core.enabled = false: the adapter registers nothing' }
    }
    const hasEffect = typeof ctx.effect === 'function'
    ownedByHost = hasEffect
    failures.length = 0
    for (const spec of list) {
      // IDEMPOTENT: a later call may find tools that only became available afterwards (a pack can add bus
      // entries after install), and already-registered names are skipped instead of colliding.
      if (registered.includes(spec.name)) continue
      const hostSpec = typeof defineTool === 'function' ? defineTool(toHostSpec(spec)) : toHostSpec(spec)
      try {
        if (hasEffect) {
          // The host owns the unwind through ctx.effect; ctx.effect returns the callback's value, which
          // here is the promise from tools.register().
          const dispose = await ctx.effect(() => ctx.tools.register(hostSpec), 'vmu:tool:' + spec.name)
          if (typeof dispose === 'function') disposers.push(dispose)
        } else {
          const dispose = await ctx.tools.register(hostSpec)
          if (typeof dispose === 'function') disposers.push(dispose)
        }
        registered.push(spec.name)
      } catch (e) {
        // ONE registration may fail without killing the rest: the host refuses a duplicate name in the same
        // layer ("duplicates within one layer fail"), and a second vmu instance is a real scenario. The
        // failure stays NAMEABLE instead of being swallowed (R11).
        failures.push({ name: spec.name, code: (e && e.code) || 'VMU_MIDDLEWARE_FAILED', message: String((e && e.message) || e) })
        log('vmu tool ' + spec.name + ' was not registered: ' + String((e && e.message) || e))
      }
    }
    installed = true
    return { ok: failures.length === 0, installed: registered.length, names: registered.slice(), ownedByHost, failures: failures.map((f) => Object.assign({}, f)) }
  }

  return {
    /** What WOULD be registered (pure: no host calls) - the host-side zero-mechanism proof. */
    plan() {
      const disabled = settings['vmu.core.enabled'] === false
      const list = specs()
      return { enabled: !disabled, names: list.map((s) => s.name), count: list.length,
        reason: disabled ? 'vmu.core.enabled = false: the adapter registers nothing' : undefined }
    },

    /**
     * Register the available tools. Installs are SERIALISED through one promise chain: a pack applied just
     * after install can make a tool available, and two concurrent installs would register the same name
     * twice (the first version of this did exactly that).
     */
    install() {
      chain = chain.then(() => doInstall())
      return chain
    },

    async uninstall() {
      if (ownedByHost) {
        registered.length = 0
        installed = false
        return { ok: true, ownedByHost: true, note: 'the host unwinds these registrations through ctx.effect' }
      }
      const failures2 = []
      for (const d of disposers.splice(0)) { try { d() } catch (e) { failures2.push(String(e && e.message)) } }
      registered.length = 0
      installed = false
      return { ok: failures2.length === 0, failures: failures2 }
    },

    status() {
      return { instance, installed, ownedByHost, registered: registered.slice(), failures: failures.map((f) => Object.assign({}, f)), plan: this.plan(),
        note: 'with nothing declared only vibe_vmu_status is registered; with vmu.core.enabled=false nothing is; execute() returns a JSON string rendered as one text part; a registration that fails is named in `failures` and does not stop the others' }
    },
  }
}
