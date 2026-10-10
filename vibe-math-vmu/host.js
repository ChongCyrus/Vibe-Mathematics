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
export function toolSpecs({ kernel, settings = {}, assertDeclared = null, log = () => {}, instance = null, scripts = [], packLoader = null, controlTool = false, meetingTool = false, taskTool = false }) {
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
        // A PLANNED KEY is a design-phase declaration with NO consumer yet (settings/planned.js, docs/04 §6.3).
        // The receipt must SAY so: "settable but inert" is exactly the trap the manual forbids, and an
        // independent reviewer measured 51 wired of hundreds of keys - the tool face used to imply every knob
        // worked. `noConsumer` is present only for planned keys, so no existing receipt changes shape.
        const planned = !!(def && def.planned === true)
        return { ok: true, key, value: parsed, hot: def ? def.hot : null, who: def ? def.who : null,
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
  if (controlTool) {
    specs.push({
      name: TOOL_NAMES.control,
      description: 'vmu 控制流：action=status|pause|resume|stop|beat。暂停是**真门禁**（任务变更会被具名拒）；beat 是心跳（观察，供 wallClockMs 判定 stale）。',
      parameters: {
        action: param('string', 'status（默认）｜pause｜resume｜stop｜beat', { required: true, enum: ['status', 'pause', 'resume', 'stop', 'beat'] }),
        reason: param('string', 'pause/stop 的原因（写入控制面与审计）'),
        note: param('string', 'beat 的备注（可选）'),
      },
      run: async ({ action = 'status', reason, note } = {}) => {
        try {
          if (action === 'status') return Object.assign({ ok: true, action }, kernel.control())
          if (action === 'pause') return Object.assign({ ok: true, action }, await kernel.pause(reason || 'paused by tool'))
          if (action === 'resume') return Object.assign({ ok: true, action }, await kernel.resume(reason || null))
          if (action === 'stop') return Object.assign({ ok: true, action }, await kernel.stop(reason || null))
          if (action === 'beat') return Object.assign({ ok: true, action }, await kernel.beat(note || null))
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
export function createHostAdapter({ ctx, kernel, settings = {}, assertDeclared = null, defineTool = null, log = () => {}, instance = null, scripts = [], packLoader = null, controlTool = false, meetingTool = false, taskTool = false } = {}) {
  const disposers = []
  const registered = []
  const failures = []
  let installed = false
  let ownedByHost = false
  let chain = Promise.resolve()

  const specs = () => (settings['vmu.core.enabled'] === false ? [] : toolSpecs({ kernel, settings, assertDeclared, log, instance, scripts, packLoader, controlTool, meetingTool, taskTool }))

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
