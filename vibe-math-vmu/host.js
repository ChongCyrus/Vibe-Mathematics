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
  pack: 'vibe_vmu_pack',
  control: 'vibe_vmu_control',
  meeting: 'vibe_vmu_meeting',
  task: 'vibe_vmu_task',
  minutes: 'vibe_vmu_minutes',
  board: 'vibe_vmu_board',
  budget: 'vibe_vmu_budget',
  citations: 'vibe_vmu_citations',
  discipline: 'vibe_vmu_discipline',
  // ROUND 349: the turn loop needs a real entry point. Without it the framework could run a round only from a test,
  // which is not the same as a host being able to run one - and the objective is the latter.
  turn: 'vibe_vmu_turn',
})

/**
 * ROUND 142 — normalise a requested tool filter against the published surface.
 *
 * WHY IT EXISTS: the A/B verdict table recorded this as a SPECIFIED GAP (vmu published the tool NAMES while the
 * half that would consume them was missing). The v5r line has the same capability, its behaviour was measured
 * first, and that measurement is exactly why this implementation differs: there, a requested name that is NOT
 * known makes the WHOLE filter undefined - one typo silently removes every restriction and nothing says so.
 * Here an unknown name is refused BY NAME, listing the unknown ones and the known surface, because a filter that
 * quietly stops filtering is worse than one that says it did not understand you.
 *
 * Also deliberately NOT conflated: absent (no restriction) is `null`, an explicitly empty list is `[]`.
 * Everything dropped - empty entries, duplicates - is COUNTED in `dropped`, never silently lost.
 *
 * `known` defaults to the published surface and may be a Set, an array, or the TOOL_NAMES object itself. When it is
 * explicitly EMPTY the check cannot be made, so the list passes through with `checked:false` rather than every name
 * being refused (an unchecked pass-through that SAYS it is unchecked).
 */
export function sanitizeToolFilter(filter, known = TOOL_NAMES) {
  const surface = known instanceof Set ? [...known]
    : Array.isArray(known) ? known.map(String)
      : (known && typeof known === 'object' ? Object.values(known).map(String) : [])
  const raw = filter === undefined || filter === null ? []
    : Array.isArray(filter) ? filter : String(filter).split(',')
  const cleaned = []
  const unknown = []
  let empty = 0
  let duplicate = 0
  for (const item of raw) {
    const name = String(item === undefined || item === null ? '' : item).trim()
    if (name === '') { empty += 1; continue }
    if (cleaned.indexOf(name) !== -1) { duplicate += 1; continue }
    if (surface.length > 0 && surface.indexOf(name) === -1) { unknown.push(name); continue }
    cleaned.push(name)
  }
  if (unknown.length > 0) {
    const err = new Error('unknown tool name(s) in the filter: ' + unknown.join(', '))
    err.code = 'VMU_INVALID_ARGUMENT'
    err.hint = 'known tools: ' + surface.join(', ')
      + ' - a filter that silently DROPPED them would stop filtering without saying so (the v5r line collapses the whole filter here)'
    err.unknown = unknown.slice()
    err.known = surface.slice()
    throw err
  }
  const noRestriction = filter === undefined || filter === null
  return { ok: true, filter: noRestriction ? null : cleaned, checked: surface.length > 0, dropped: { empty, duplicate } }
}

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
export function toolSpecs({ kernel, settings = {}, assertDeclared = null, log = () => {}, instance = null, scripts = [], packLoader = null, controlTool = false, meetingTool = false, taskTool = false, turnTool = false, minutesTool = false, boardTool = false, budgetTool = false, citationsTool = false, disciplineTool = false }) {
  // A refusal carries the four documented fields, plus - when the caller has them - host-side DIAGNOSTICS
  // (the host's own stack and the exact request shape we passed). They are added ONLY when present, so no
  // existing refusal changes shape. Without this the live M3 diagnosis died at the tool boundary: the seam
  // carried `hostStack`/`shape`, the tool face dropped them (task-33's finding).
  const refused = (code, message, hint, extra = null) => Object.assign({ ok: false, code, message, hint: hint || null },
    extra && typeof extra === 'object'
      ? Object.assign({},
        extra.hostStack ? { hostStack: String(extra.hostStack).slice(0, 2000) } : {},
        extra.shape ? { shape: extra.shape } : {})
      : {})
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
        // TASK-166: the hot-class/owner contract is NOT enforced here any more — it lives INSIDE
        // kernel.setSettingsValue()/unsetSettingsValue() (the single source), so the tool face and the kernel
        // API cannot answer the same (key, value) pair differently. This face only PARSES the value.
        let parsed = value
        if (typeof value === 'string') {
          const t = def ? def.type : null
          if (t === 'boolean') parsed = value === 'true'
          else if (t === 'natural' || t === 'positiveInteger') parsed = Number(value)
          else if (t === 'stringList' || t === 'objectList') { try { parsed = JSON.parse(value) } catch { return refused('VMU_INVALID_ARGUMENT', 'value must be JSON for ' + t) } }
        }
        let setReceipt = null
        try {
          setReceipt = kernel.setSettingsValue(key, parsed)
        } catch (e) {
          // The kernel's code and words are preserved (it used to be flattened into VMU_PACK_CONFLICT, which
          // hid the H3/unknown-key/owner refusals behind a code that meant something else).
          return refused(e && e.code ? e.code : 'VMU_PACK_CONFLICT', String(e.message), e.hint)
        }
        log('vmu set ' + key)
        // The receipt says exactly WHEN the new value takes effect, per its declared hot class, so a reader
        // never has to guess whether a change was ignored (H2 ⇒ a new session is required, and we say so).
        // The table comes from the KERNEL (one source); this face only formats it.
        const APPLIES = (kernel.appliesTable ? kernel.appliesTable() : null)
          || (kernel.status && kernel.status().settings && kernel.status().settings.applies) || {}
        const resolved = kernel.status ? (kernel.status().settings.resolved || {})[key] : null
        // A PLANNED KEY is a design-phase declaration with NO consumer yet (settings/planned.js, docs/04 §6.3).
        // The receipt must SAY so: "settable but inert" is exactly the trap the manual forbids. `noConsumer` is
        // present only for planned keys, so no other receipt changes shape.
        const planned = !!(def && def.planned === true)
        return { ok: true, key, value: parsed, hot: def ? def.hot : null, who: def ? def.who : null,
          // `ownerCheck` is copied from the kernel receipt: an absent `by` is an EXPLICIT exemption, disclosed,
          // never a silent bypass of the owner check.
          ownerCheck: setReceipt ? setReceipt.ownerCheck : null,
          requiresRestart: setReceipt ? setReceipt.requiresRestart === true : false,
          appliesFrom: planned ? 'never yet (planned key: no runtime consumer)'
            : (def ? (APPLIES[def.hot] || 'unknown hot class') : 'unknown (undeclared key)'),
          source: resolved ? resolved.source : null,
          ...(planned ? { noConsumer: true } : {}),
          note: planned
            ? 'this key is DECLARED BY THE DESIGN (settings/planned.js, docs/04 §6.3) and has NO consumer yet: setting it changes nothing until it is implemented'
            : 'settings.resolved in vibe_vmu_status shows every key with its value, source and hot class' }
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
      description: 'vmu 中间件：action=list|disable|enable|validate|dryRun（四形态共用一条总线）。validate/dryRun 只读、无副作用。',
      parameters: {
        action: param('string', 'list（默认）｜disable｜enable｜validate｜dryRun', { required: true, enum: ['list', 'disable', 'enable', 'validate', 'dryRun'] }),
        id: param('string', '中间件条目 id（disable/enable/dryRun 用；dryRun 也可改用 rule）'),
        rule: param('string', 'validate/dryRun：M1 规则的 JSON 文本（不传 id 时使用）'),
        samples: param('string', 'dryRun：事件样本的 JSON 数组（每个元素是一次事件对象）'),
      },
      run: async ({ action = 'list', id, rule, samples } = {}) => {
        try {
          const parseJson = (text, what) => {
            try { return JSON.parse(String(text)) } catch { return refused('VMU_INVALID_ARGUMENT', what + ' must be valid JSON') }
          }
          const ruleFor = () => {
            if (typeof rule === 'string' && rule.trim().length > 0) return parseJson(rule, 'rule')
            if (id && kernel.rules && typeof kernel.rules.get === 'function') {
              const found = kernel.rules.get(id)
              if (!found) return refused('VMU_NO_SUCH_OBJECT', 'no M1 rule with id ' + String(id),
                'declared rules: ' + (kernel.rules.ids ? kernel.rules.ids().join(', ') : 'unknown'))
              return found
            }
            return refused('VMU_INVALID_ARGUMENT', 'validate/dryRun need a rule (JSON) or an id',
              'pass rule: "<json>" for a new rule, or id: "<declared id>" to inspect one in place')
          }
          if (action === 'list') return Object.assign({ ok: true, action }, kernel.bus.status())
          if (action === 'disable' || action === 'enable') {
            if (!id) return refused('VMU_INVALID_ARGUMENT', 'disable/enable 需要 id')
            return Object.assign({ ok: true, action }, { result: action === 'disable' ? kernel.bus.disable(id, 'disabled by tool') : kernel.bus.enable(id) })
          }
          if (action === 'validate') {
            const parsed = ruleFor()
            if (parsed && parsed.ok === false) return parsed
            const problems = kernel.rules.validate ? kernel.rules.validate(parsed) : []
            return { ok: problems.length === 0, action, problems, vocabulary: kernel.rules.vocabulary ? kernel.rules.vocabulary() : null }
          }
          if (action === 'dryRun') {
            const parsed = ruleFor()
            if (parsed && parsed.ok === false) return parsed
            // DRY-RUN HAS NO SIDE EFFECTS: the rules engine counts the run and returns what WOULD happen.
            let list = []
            if (typeof samples === 'string' && samples.trim().length > 0) {
              const arr = parseJson(samples, 'samples')
              if (arr && arr.ok === false) return arr
              list = Array.isArray(arr) ? arr : [arr]
            }
            const out = kernel.rules.dryRun(parsed, list)
            return Object.assign({ ok: out.ok !== false, action }, out)
          }
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
          if (script.env && typeof script.env === 'object' && !Array.isArray(script.env)) {
            // Same rule as the spawn seam, applied at the SOURCE: only strings can be environment variables. An
            // `undefined` value used to be forwarded verbatim and made the host throw inside its own validation
            // (the live M3 root cause). Primitives are coerced; anything else is dropped, never shipped broken.
            const env = {}
            for (const [k, v] of Object.entries(script.env)) {
              if (typeof v === 'string') env[k] = v
              else if (typeof v === 'number' || typeof v === 'boolean') env[k] = String(v)
            }
            if (Object.keys(env).length > 0) request.env = env
          }
          const result = await kernel.bridge.run(request)
          return Object.assign({ ok: true, action, script: id }, result)
        } catch (e) {
          return refused(e.code || 'VMU_MIDDLEWARE_FAILED', String(e.message), e.hint, e)
        }
      },
    })
  }

  // 6) packs (M4) — only when the entry handed us a loader. `plan` is PURE (it reports exactly what would
  // change), `apply` refuses conflicts (O4) and `unload` reverses what was applied, so the promote flow the
  // pack manual describes ("plan ⇒ apply") finally has a callable surface instead of a library-only one.
  if (typeof packLoader === 'function') {
    specs.push({
      name: TOOL_NAMES.pack,
      description: 'vmu 整合包：action=list|plan|apply|unload。plan 只读（报告会改什么），apply 冲突即具名拒，unload 逐个回滚。',
      parameters: {
        action: param('string', 'list（默认）｜plan｜apply｜unload', { required: true, enum: ['list', 'plan', 'apply', 'unload'] }),
        id: param('string', 'unload 必填；也可给随包整合包 id（plan/apply 时按 ./packs/<id>.js 解析）'),
        manifest: param('string', 'plan/apply：内联 manifest 的 JSON 文本'),
      },
      run: async ({ action = 'list', id, manifest } = {}) => {
        try {
          const loader = packLoader()
          if (!loader) return refused('VMU_ENGINE_UNAVAILABLE', 'no pack loader in this assembly')
          if (action === 'list') return Object.assign({ ok: true, action }, loader.status())
          const parsed = (() => {
            if (typeof manifest === 'string' && manifest.trim().length > 0) {
              try { return JSON.parse(manifest) } catch { return refused('VMU_INVALID_ARGUMENT', 'manifest must be valid JSON') }
            }
            return null
          })()
          if (parsed && parsed.ok === false) return parsed
          const resolved = parsed
          if (!resolved) {
            return refused('VMU_INVALID_ARGUMENT', 'plan/apply need an inline manifest (manifest: "<json>")',
              'a pack SHIPPED as ./packs/<id>.js is loaded by the profile row via config.packs; this tool inspects and loads inline manifests')
          }
          if (action === 'plan') return Object.assign({ ok: true, action }, loader.plan(resolved))
          if (action === 'apply') return Object.assign({ ok: true, action }, await loader.apply(resolved))
          if (action === 'unload') {
            if (!id) return refused('VMU_INVALID_ARGUMENT', 'unload needs id')
            return Object.assign({ ok: true, action }, await loader.unload(id))
          }
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_PACK_MISSING', String(e.message), e.hint)
        }
      },
    })
  }

  // 7) control flow (docs/08 §5) — only when the configuration declares control intent. A pause is a GATE:
  // while paused the kernel refuses task mutations by name, and the bus is told so middleware can react.
  // ROUND 349 — THE TURN TOOL (docs/26 §3.4). The loop existed as a service and as a test harness; this is what makes
  // it reachable from a real session. Declared like every other face: only offered when the configuration asks for it,
  // because with nothing declared the preset must still register exactly one tool (R1 zero mechanism).
  if (turnTool) {
    // ROUND 349: ONE CORE, TWO THIN WRAPPERS. The middleware wrapper calls `spec.run` and stringifies what it gets,
    // while direct callers (and the tests) call `spec.execute` and parse a string themselves. Measured the hard way:
    // a face that returns a string from `run` gets it stringified AGAIN, so the caller parses back the same string.
    // `run` therefore returns the OBJECT and `execute` returns the JSON STRING, both from the same core.
    const coreTurn = async (args = {}) => {
      if (!kernel.turn) return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no turn loop')
      const op = String(args.op || 'status')
      const members = Array.isArray(args.members) ? args.members : []
      if (op === 'status') return { ok: true, status: kernel.turn.status() }
      if (op === 'step') return await kernel.turn.step({ members, phase: args.phase, why: args.why, nextStep: args.next_step })
      if (op === 'drive') return await kernel.turn.drive({ members, rounds: args.rounds, phase: args.phase, why: args.why, nextStep: args.next_step })
      return refused('VMU_INVALID_ARGUMENT', 'unknown op: ' + op, 'known ops: step, drive, status')
    }
    const runTurn = (args = {}) => coreTurn(args)
    const executeTurn = async (args = {}) => JSON.stringify(await coreTurn(args))
    specs.push({
      name: TOOL_NAMES.turn,
      description: 'Run institute TURNS: step runs exactly one round (who is chosen by vmu.turn.wakeupPolicy, what ' +
        'prompt is assembled by the pipeline), drive runs a bounded number, status reports what the loop has done. ' +
        'A round with no members is a legal no-op; a failed round is returned with its code rather than thrown.',
      parameters: {
        type: 'object',
        properties: {
          op: param('string', 'step＝一轮／drive＝连跑若干轮／status＝读数'),
          members: param('array', '本轮可唤醒的成员：[{id, role}]；缺省时由内核名册推断（无成员 ⇒ 合法空转）'),
          rounds: param('integer', 'drive 的轮数（必须为正整数；没有无限默认）'),
          phase: param('string', '相位：founding／normal／checkpoint／verify／verify-debate／meeting／resume'),
          why: param('string', '为什么唤醒（原预设的唤醒也带这一项）'),
          next_step: param('string', '下一步要做什么'),
        },
        required: ['op'],
      },
      execute: executeTurn,
      run: runTurn,
    })
  }
  if (controlTool) {
    specs.push({
      name: TOOL_NAMES.control,
      description: 'vmu 控制流：action=status|pause|resume|stop|beat|roster|hire|fire。暂停是**真门禁**（任务变更会被具名拒）；' +
        'beat 是心跳（观察，供 wallClockMs 判定 stale）；roster 只读花名册（带上限），hire/fire 是成员加入与离开（走内核槽位，docs/17）。',
      parameters: {
        action: param('string', 'status（默认）｜pause｜resume｜stop｜beat｜roster｜hire｜fire', { required: true, enum: ['status', 'pause', 'resume', 'stop', 'beat', 'roster', 'hire', 'fire'] }),
        member_id: param('string', 'roster 可省；hire/fire 必填的成员 id'),
        institution: param('string', 'hire 的所属机构（缺省时由内核决定）'),
        since: param('string', 'hire 的加入时间戳（可省）'),
        reason: param('string', 'pause/stop 的原因（写入控制面与审计）'),
        note: param('string', 'beat 的备注（可选）'),
      },
      run: async ({ action = 'status', reason, note, member_id, institution, since } = {}) => {
        try {
          if (action === 'status') return Object.assign({ ok: true, action }, kernel.control())
          if (action === 'pause') return Object.assign({ ok: true, action }, await kernel.pause(reason || 'paused by tool'))
          if (action === 'resume') return Object.assign({ ok: true, action }, await kernel.resume(reason || null))
          if (action === 'stop') return Object.assign({ ok: true, action }, await kernel.stop(reason || null))
          if (action === 'beat') return Object.assign({ ok: true, action }, await kernel.beat(note || null))
          if (action === 'roster') return Object.assign({ ok: true, action }, kernel.identity ? kernel.identity.list() : refused('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no identity surface'))
          if (action === 'hire') return Object.assign({ ok: true, action }, kernel.identity.addMembership({ memberId: member_id, institution: institution === undefined ? null : institution, since: since === undefined ? null : since }))
          if (action === 'fire') return Object.assign({ ok: true, action }, kernel.identity.endMembership({ memberId: member_id, reason: reason === undefined ? null : reason }))
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
    })
  }

  // 8) per-domain tool faces (docs/03 §3.1): meetings/ballots and the task board, addressable from a session.
  // They appear ONLY when the configuration declares the intent (zero mechanism, R1): a meeting face needs a
  // declared meeting intent, a task face needs a declared task board (or declared stages). They never invent
  // state - they call the SAME kernel primitives the library level exposes, by id.
  if (meetingTool) {
    specs.push({
      name: TOOL_NAMES.meeting,
      description: 'vmu 会议/表决面：action=list|open|speak|silent|close|ballot|vote|tally|reopen。' +
        '会议与表决是**逐对象原语**（内核给工厂、pack 给政策）；本工具只用**内核已登记的实例 id** 寻址（未知 id 具名拒）。',
      parameters: {
        action: param('string', 'list｜open｜speak｜silent｜close｜ballot｜vote｜tally｜reopen', { required: true,
          enum: ['list', 'open', 'speak', 'silent', 'close', 'ballot', 'vote', 'tally', 'reopen'] }),
        id: param('string', '会议 id（speak/silent/close 必填；open 可指定）'),
        ballotId: param('string', '表决 id（vote/tally/reopen 必填）'),
        member: param('string', '成员 id（speak/silent/vote 必填）'),
        text: param('string', '发言内容（speak 必填）'),
        reason: param('string', 'silent/close/reopen 的原因'),
        agenda: param('string', 'open 的议程文本'),
        roster: param('array', 'open 的成员清单（默认取该会议的既定语料）'),
        target: param('string', 'ballot 的标的（必填）'),
        value: param('string', 'vote 的票值（必填）'),
        kind: param('string', 'vote 的票型（默认 decisive）', { enum: ['decisive', 'advisory'] }),
      },
      run: async ({ action, id, ballotId, member, text, reason, agenda, roster, target, value, kind } = {}) => {
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
        try {
          if (action === 'list') return Object.assign({ ok: true, action }, kernel.liveList())
          if (action === 'open') {
            const meeting = kernel.meeting({ id: id || undefined, roster: Array.isArray(roster) ? roster : undefined })
            await meeting.convene(agenda === undefined ? null : agenda)
            await meeting.openRound({ members: Array.isArray(roster) ? roster : null })
            return { ok: true, action, id: meeting.id, state: meeting.state }
          }
          if (action === 'speak') {
            const meeting = kernel.liveMeeting(need(id, 'id'))
            if (!meeting) return refused('VMU_NO_SUCH_OBJECT', 'no live meeting with id ' + String(id), 'use action=list')
            return Object.assign({ ok: true, action, id }, await meeting.speak(need(member, 'member'), need(text, 'text')))
          }
          if (action === 'silent') {
            const meeting = kernel.liveMeeting(need(id, 'id'))
            if (!meeting) return refused('VMU_NO_SUCH_OBJECT', 'no live meeting with id ' + String(id), 'use action=list')
            return Object.assign({ ok: true, action, id }, meeting.markSilent(need(member, 'member'), reason || 'no input'))
          }
          if (action === 'close') {
            const meeting = kernel.liveMeeting(need(id, 'id'))
            if (!meeting) return refused('VMU_NO_SUCH_OBJECT', 'no live meeting with id ' + String(id), 'use action=list')
            return Object.assign({ ok: true, action, id }, await meeting.close(reason || 'closed'))
          }
          if (action === 'ballot') {
            const bid = ballotId || ('b-' + (kernel.liveList().ballots.length + 1) + '-' + Date.now().toString(36))
            const ballot = kernel.ballot({ id: bid })
            const opened = await ballot.open()
            return { ok: true, action, ballotId: bid, opened, target: need(target, 'target') }
          }
          if (action === 'vote') {
            const ballot = kernel.liveBallot(need(ballotId, 'ballotId'))
            if (!ballot) return refused('VMU_NO_SUCH_OBJECT', 'no live ballot with id ' + String(ballotId), 'use action=list')
            // The ballot primitive speaks 1/0 for decisive votes (it says so in its own refusal), but a model
            // reasons in words: normalise the obvious spellings HERE, at the face, and pass anything else
            // through untouched so the primitive still gives the authoritative refusal.
            const raw = need(value, 'value')
            const key = String(raw).trim().toLowerCase()
            const castValue = raw === 1 || raw === 0 ? raw
              : (['1', 'true', 'for', 'yes', '赞成', '同意'].includes(key) ? 1
                : (['0', 'false', 'against', 'no', '反对'].includes(key) ? 0 : raw))
            return Object.assign({ ok: true, action, ballotId },
              await ballot.cast(need(member, 'member'), castValue, { kind: kind || 'decisive' }))
          }
          if (action === 'tally') {
            const ballot = kernel.liveBallot(need(ballotId, 'ballotId'))
            if (!ballot) return refused('VMU_NO_SUCH_OBJECT', 'no live ballot with id ' + String(ballotId), 'use action=list')
            return Object.assign({ ok: true, action, ballotId }, await ballot.close('tally'))
          }
          if (action === 'reopen') {
            const ballot = kernel.liveBallot(need(ballotId, 'ballotId'))
            if (!ballot) return refused('VMU_NO_SUCH_OBJECT', 'no live ballot with id ' + String(ballotId), 'use action=list')
            return Object.assign({ ok: true, action, ballotId }, ballot.reopen ? ballot.reopen(reason || 'reopened') : { reopened: false })
          }
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
    })
  }

  if (taskTool) {
    specs.push({
      name: TOOL_NAMES.task,
      description: 'vmu 任务面：action=list|create|assign|transition|stage|advance|brief|history。' +
        '任务是内核台账（依赖/阶段门/暂停门都由内核强制）；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'list｜create｜assign｜transition｜stage｜advance｜brief｜history', { required: true,
          enum: ['list', 'create', 'assign', 'transition', 'stage', 'advance', 'brief', 'history'] }),
        id: param('string', '任务 id（assign/transition/brief 必填）'),
        title: param('string', 'create 的标题（必填）'),
        objective: param('string', 'create 的目标（可选）'),
        owner: param('string', 'create/assign 的负责人'),
        deps: param('array', 'create 的依赖 id 列表（可选）'),
        to: param('string', 'transition/advance 的目标状态或阶段'),
        reason: param('string', 'transition/advance 的原因'),
      },
      run: async ({ action, id, title, objective, owner, deps, to, reason } = {}) => {
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
        try {
          const tasks = kernel.tasks
          if (action === 'list') return Object.assign({ ok: true, action }, { tasks: tasks.list() })
          if (action === 'create') return Object.assign({ ok: true, action }, await tasks.create({ title: need(title, 'title'), objective: objective || null, owner: owner || null, deps: Array.isArray(deps) ? deps : null }))
          if (action === 'assign') return Object.assign({ ok: true, action }, await tasks.assign(need(id, 'id'), need(owner, 'owner')))
          if (action === 'transition') return Object.assign({ ok: true, action }, await tasks.transition(need(id, 'id'), need(to, 'to'), { reason: reason || null }))
          if (action === 'stage') return Object.assign({ ok: true, action }, tasks.stage())
          if (action === 'advance') return Object.assign({ ok: true, action }, await tasks.advance({ to: to || null, reason: reason || null }))
          if (action === 'brief') return Object.assign({ ok: true, action }, tasks.brief(need(id, 'id')))
          if (action === 'history') return Object.assign({ ok: true, action }, { history: tasks.history(id || null) })
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
    })
  }

  if (minutesTool) {
    specs.push({
      name: TOOL_NAMES.minutes,
      description: 'vmu 纪要面：action=list|draft|confirm|append|actions|status。' +
        '纪要由内核服务保管（谁记、何时定稿、哪些动作被记下都由它强制）；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'list｜draft｜confirm｜append｜actions｜status', { required: true,
          enum: ['list', 'draft', 'confirm', 'append', 'actions', 'status'] }),
        id: param('string', '纪要 id（draft/confirm/append 必填）'),
        kind: param('string', 'draft 的类别（可选）'),
        text: param('string', 'draft/append 的正文（必填）'),
        member: param('string', '记录归属的成员（可选）'),
        session: param('string', '所属会话（可选）'),
      },
      run: async ({ action, id, kind, text, member, session } = {}) => {
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }) }
        try {
          const minutes = kernel.minutes
          if (action === 'list') return Object.assign({ ok: true, action }, { minutes: minutes.list() })
          if (action === 'draft') return Object.assign({ ok: true, action }, await minutes.draft({ id: need(id, 'id'), kind: kind || null, text: need(text, 'text'), member: member || null, session: session || null }))
          if (action === 'confirm') return Object.assign({ ok: true, action }, await minutes.confirm(need(id, 'id')))
          if (action === 'append') return Object.assign({ ok: true, action }, await minutes.append(need(id, 'id'), need(text, 'text')))
          if (action === 'actions') return Object.assign({ ok: true, action }, { actions: minutes.actions(id || null) })
          if (action === 'status') return Object.assign({ ok: true, action }, minutes.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
    })
  }

  if (boardTool) {
    specs.push({
      name: TOOL_NAMES.board,
      description: 'vmu 看板面：action=columns|addColumn|move|setWip|swimlanes|aging|status。' +
        '看板由内核服务保管（列、WIP 上限、泳道、老化都由它强制）；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'columns｜addColumn｜move｜setWip｜swimlanes｜aging｜status', { required: true,
          enum: ['columns', 'addColumn', 'move', 'setWip', 'swimlanes', 'aging', 'status'] }),
        id: param('string', 'addColumn 的列 id'),
        name: param('string', 'addColumn 的列名'),
        wipLimit: param('number', 'addColumn 的 WIP 上限（可选）'),
        order: param('number', 'addColumn 的次序（可选）'),
        taskId: param('string', 'move 的任务 id'),
        toColumn: param('string', 'move 的目标列'),
        by: param('string', 'move 的执行者（可选）'),
        transition: param('string', 'move 的迁移标签（可选）'),
        column: param('string', 'setWip 的列 id'),
        limit: param('number', 'setWip 的上限（aging 时是返回条数上限）'),
        warnMs: param('number', 'aging 的告警阈值毫秒（可选）'),
      },
      run: async ({ action, id, name, wipLimit, order, taskId, toColumn, by, transition, column, limit, warnMs } = {}) => {
        try {
          const board = kernel.board
          if (action === 'columns') return Object.assign({ ok: true, action }, board.columns())
          if (action === 'addColumn') return Object.assign({ ok: true, action }, board.addColumn({ id, name, wipLimit, order }))
          if (action === 'move') return Object.assign({ ok: true, action }, board.move({ taskId, toColumn, by, transition }))
          if (action === 'setWip') return Object.assign({ ok: true, action }, board.setWip({ column, limit }))
          if (action === 'swimlanes') return Object.assign({ ok: true, action }, board.swimlanes())
          if (action === 'aging') return Object.assign({ ok: true, action }, board.aging({ warnMs, limit }))
          if (action === 'status') return Object.assign({ ok: true, action }, board.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
    })
  }

  if (budgetTool) {
    specs.push({
      name: TOOL_NAMES.budget,
      description: 'vmu 预算面：action=open|charge|reserve|remaining|status|list|totals|perTaskShare。' +
        '配额四类（tokens/turns/toolCalls/subagents）、预留、公平与越界动作都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'open｜charge｜reserve｜remaining｜status｜list｜totals｜perTaskShare', { required: true,
          enum: ['open', 'charge', 'reserve', 'remaining', 'status', 'list', 'totals', 'perTaskShare'] }),
        scope: param('string', '作用域名（open/charge/reserve/remaining 需要）'),
        kind: param('string', '配额类别（charge/remaining 用；★ 四类见服务自己的 kinds ✓）'),
        amount: param('number', 'charge 的数量（默认 0）'),
        taskId: param('string', 'charge 归属的任务（可选；★ 与 perTaskShare 一起作用 ✓）'),
        limits: param('object', 'open 的初始上限（可选）'),
        perTaskShare: param('number', 'open 的单任务占比（可选，0..1）'),
        ratio: param('number', 'reserve 的比例'),
      },
      run: async ({ action, scope, kind, amount, taskId, limits, perTaskShare, ratio } = {}) => {
        try {
          const budget = kernel.budget
          if (action === 'open') return Object.assign({ ok: true, action }, budget.open({ scope, limits: limits || {}, perTaskShare }))
          if (action === 'charge') return Object.assign({ ok: true, action }, budget.charge({ scope, kind, amount, taskId }))
          if (action === 'reserve') return Object.assign({ ok: true, action }, budget.reserve({ scope, ratio }))
          if (action === 'remaining') return Object.assign({ ok: true, action }, budget.remaining({ scope, kind }))
          if (action === 'status') return Object.assign({ ok: true, action }, budget.status())
          if (action === 'list') return Object.assign({ ok: true, action }, budget.list())
          if (action === 'totals') return Object.assign({ ok: true, action }, { totals: budget.totals() })
          if (action === 'perTaskShare') return Object.assign({ ok: true, action }, { perTaskShare: budget.perTaskShare() })
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
    })
  }

  if (citationsTool) {
    specs.push({
      name: TOOL_NAMES.citations,
      description: 'vmu 引用面：action=identify|validate|render|status。' +
        '标识符优先级、必填字段与渲染样式都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'identify｜validate｜render｜status', { required: true,
          enum: ['identify', 'validate', 'render', 'status'] }),
        ids: param('object', '标识符表（identify 用；★ 优先级见服务自己的 idPriority ✓）'),
        title: param('string', '标题（validate/render 用）'),
        authors: param('array', '作者列表（validate/render 用）'),
        year: param('number', '年份（validate/render 用）'),
        freeText: param('string', '自由文本条目（validate/render 用；★ 是否允许由服务自己的 allowFreeText 决定 ✓）'),
        style: param('string', '渲染样式（render 用；★ 默认见服务自己的 style ✓）'),
      },
      run: async ({ action, ids, title, authors, year, freeText, style } = {}) => {
        try {
          const citations = kernel.citations
          if (action === 'identify') return Object.assign({ ok: true, action }, citations.identify({ ids }))
          if (action === 'validate') return Object.assign({ ok: true, action }, citations.validate({ title, authors, year, ids, freeText }))
          if (action === 'render') return Object.assign({ ok: true, action }, citations.render({ title, authors, year, ids, freeText, style }))
          if (action === 'status') return Object.assign({ ok: true, action }, citations.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
    })
  }

  if (disciplineTool) {
    specs.push({
      name: TOOL_NAMES.discipline,
      description: 'vmu 纪律面：action=recordFailure|mayAct|suspend|restore|status。' +
        '断路器窗口、暂停上限与「恢复必须由人决定」都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'recordFailure｜mayAct｜suspend｜restore｜status', { required: true,
          enum: ['recordFailure', 'mayAct', 'suspend', 'restore', 'status'] }),
        subject: param('string', '主体（成员/角色；recordFailure/mayAct/suspend/restore 需要）'),
        kind: param('string', '失败类别（recordFailure 可选）'),
        detail: param('string', '失败细节（recordFailure 可选）'),
        ms: param('number', '暂停时长毫秒（suspend 可选；★ 会被服务的 suspendMaxMs 夹住 ✓）'),
        reason: param('string', '暂停原因（suspend 可选）'),
        byHuman: param('boolean', '是否已由人决定（restore 用；★ 服务的 restoreNeedsHuman 会强制它 ✓）'),
        postmortem: param('string', '复盘记录（restore 可选）'),
      },
      run: async ({ action, subject, kind, detail, ms, reason, byHuman, postmortem } = {}) => {
        try {
          const discipline = kernel.discipline
          if (action === 'recordFailure') return Object.assign({ ok: true, action }, discipline.recordFailure({ subject, kind, detail }))
          if (action === 'mayAct') return Object.assign({ ok: true, action }, discipline.mayAct({ subject }))
          if (action === 'suspend') return Object.assign({ ok: true, action }, discipline.suspend({ subject, ms, reason }))
          if (action === 'restore') return Object.assign({ ok: true, action }, discipline.restore({ subject, byHuman, postmortem }))
          if (action === 'status') return Object.assign({ ok: true, action }, discipline.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
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
export function createHostAdapter({ ctx, kernel, settings = {}, assertDeclared = null, defineTool = null, log = () => {}, instance = null, scripts = [], packLoader = null, controlTool = false, meetingTool = false, taskTool = false, turnTool = false } = {}) {
  const disposers = []
  const registered = []
  const failures = []
  let installed = false
  let ownedByHost = false
  let chain = Promise.resolve()

  const specs = () => (settings['vmu.core.enabled'] === false ? [] : toolSpecs({ kernel, settings, assertDeclared, log, instance, scripts, packLoader, controlTool, meetingTool, taskTool, turnTool }))

  const doInstall = async () => {
    if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
      throw Object.assign(new Error('the host context has no tools.register'), { code: 'VMU_ENGINE_UNAVAILABLE',
        hint: 'pass a DSH context; the adapter never invents a tool surface' })
    }
    const raw = specs()
    // ROUND 478: the filter published in round 142 finally has a consumer. `vmu.tools.enabled` narrows the surface;
    // absent (null) means no restriction and an explicit [] means nothing registers - the distinction
    // sanitizeToolFilter was written to preserve. An unknown name is refused BY NAME and the refusal is recorded
    // in failures and logged, never swallowed: a filter that quietly stops filtering is the failure this
    // mechanism exists to prevent.
    const declared = settings && Object.prototype.hasOwnProperty.call(settings, 'vmu.tools.enabled') ? settings['vmu.tools.enabled'] : null
    let filterResult = null
    try {
      filterResult = sanitizeToolFilter(declared, TOOL_NAMES)
    } catch (e) {
      // sanitizeToolFilter REFUSES an unknown name by throwing. FAIL-CLOSED: an unusable filter must never widen
      // the surface, so nothing registers and the refusal is recorded where install problems are already reported.
      filterResult = { ok: false, refused: { code: (e && e.code) || 'VMU_INVALID_ARGUMENT', message: (e && e.message) || String(e), hint: (e && e.hint) || 'vmu.tools.enabled must list published tool names' } }
    }
    if (!filterResult.ok) {
      const refused = filterResult.refused
      failures.push({ name: '(tool filter)', code: refused.code, message: refused.message, hint: refused.hint || null })
      log('vmu.tools.enabled refused, nothing will register: ' + String(refused.message))
    }
    const wanted = filterResult.ok ? filterResult.filter : []
    const list = wanted === null ? raw : raw.filter((s) => wanted.includes(s.name))
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
