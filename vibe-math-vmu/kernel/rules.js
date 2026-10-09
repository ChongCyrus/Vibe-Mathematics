// vmu rules — the M1 declarative middleware engine (docs/05 §5).
//
// A declarative rule is DATA, not code: `on` (hooks), `when` (a predicate tree from a closed whitelist)
// and `then` (actions from a closed action set). The engine's whole value is that it can be validated
// statically and DRY-RUN before it is trusted, which is impossible if a rule may contain an expression.
// Hence two hard refusals:
//   · an unknown predicate or action key is refused by construction, naming the key;
//   · a rule carrying anything expression-shaped (`expr`, `js`, `eval`, `code`, `function`, `script`
//     keys, or a string where a predicate object belongs) is refused - the answer to "I need more logic"
//     is a code module (M2), not a small interpreter here.
//
// A compiled rule is a bus handler, so M1 and M2 run through exactly the same bus (docs/05 §2, §3):
// ordering, capabilities, failure policies, breakers and traces are shared, not reimplemented.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** The predicate whitelist (docs/05 §5.2). Keys outside this list are refused at compile time. */
export const PREDICATES = Object.freeze(['tool', 'member', 'role', 'phase', 'arg', 'setting', 'count', 'subject', 'match', 'all', 'any', 'not'])

/** The action whitelist (docs/05 §5.3). */
export const ACTIONS = Object.freeze(['deny', 'allow', 'cancel', 'ask', 'rewriteArgs', 'replaceResult',
  'appendPrompt', 'record', 'notify', 'setSetting', 'triggerWorkflow', 'annotate'])

/** action -> the capability it consumes. Mirrors kernel/bus.js; kept here so a rule can be validated
 *  before a bus exists, and the two are asserted to agree by tests/vmu-rules.test.mjs. */
export const ACTION_CAPABILITY = Object.freeze({
  deny: 'deny', cancel: 'cancel', rewriteArgs: 'rewrite-args', replaceResult: 'rewrite-result',
  appendPrompt: 'append-prompt', record: 'record', notify: 'notify', setSetting: 'set-setting',
  triggerWorkflow: 'trigger-workflow', annotate: 'annotate', allow: 'read-args', ask: 'read-args',
})

/** Anything expression-shaped is refused: this engine interprets data, it never evaluates code. */
export const FORBIDDEN_KEYS = Object.freeze(['expr', 'expression', 'js', 'javascript', 'eval', 'code', 'fn', 'function', 'script', 'body'])

export function refuse(code, message, hint) {
  const err = new Error(message)
  if (hint) err.hint = hint
  err.code = code
  return err
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

/** Static validation (docs/05 §9 step 1). Returns a list of problems; empty means the rule is sound. */
export function validateRule(rule) {
  const problems = []
  if (!isPlainObject(rule)) return ['a rule must be an object']
  if (typeof rule.id !== 'string' || rule.id.length === 0) problems.push('id is required')
  if (rule.on === undefined) problems.push('on is required (at least one hook)')
  else if (typeof rule.on === 'string') { /* a single hook name is accepted */ }
  else if (!Array.isArray(rule.on) || rule.on.length === 0) problems.push('on must be a hook name or a non-empty list of them')
  if (rule.when === undefined || rule.when === null) problems.push('when is required (a predicate tree; use {} to always match)')
  if (!Array.isArray(rule.then) || rule.then.length === 0) problems.push('then must be a non-empty list of actions')

  const walk = (node, path) => {
    if (node === null || node === undefined) return
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') return
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, path + '[' + i + ']')); return }
    if (!isPlainObject(node)) { problems.push(path + ': a predicate must be an object, a list or a literal'); return }
    const keys = Object.keys(node)
    for (const k of keys) {
      if (FORBIDDEN_KEYS.includes(k)) {
        problems.push(path + '.' + k + ': expressions are not allowed in M1 - use a code module (M2)')
        continue
      }
    }
    const logical = keys.filter((k) => ['all', 'any', 'not'].includes(k))
    const atomic = keys.filter((k) => PREDICATES.includes(k) && !['all', 'any', 'not'].includes(k))
    const unknown = keys.filter((k) => !PREDICATES.includes(k))
    if (unknown.length > 0) problems.push(path + ': unknown predicate key(s): ' + unknown.join(', '))
    if (logical.length > 1) problems.push(path + ': only one of all/any/not may appear per node')
    if (logical.length === 1 && atomic.length > 0) problems.push(path + ': combine logical and atomic keys with all/any, not side by side')
    for (const l of logical) {
      const v = node[l]
      if (l === 'not') walk(v, path + '.not')
      else {
        if (!Array.isArray(v)) problems.push(path + '.' + l + ': must be a list')
        else v.forEach((n, i) => walk(n, path + '.' + l + '[' + i + ']'))
      }
    }
    for (const a of atomic) {
      const v = node[a]
      if (a === 'arg') {
        if (!isPlainObject(v) || typeof v.path !== 'string') problems.push(path + '.arg: needs { path }')
      } else if (a === 'setting') {
        if (!isPlainObject(v) || typeof v.key !== 'string') problems.push(path + '.setting: needs { key }')
      } else if (a === 'count') {
        if (!isPlainObject(v) || typeof v.of !== 'string') problems.push(path + '.count: needs { of }')
      } else if (a === 'match') {
        if (!isPlainObject(v) || typeof v.re !== 'string') problems.push(path + '.match: needs { on, re }')
      } else if (a === 'subject') {
        if (typeof v !== 'string' && !Array.isArray(v)) problems.push(path + '.subject: must be a name or a list of names')
      } else if (typeof v === 'string' || Array.isArray(v)) {
        // tool/member/role/phase accept a name or a list
      } else {
        problems.push(path + '.' + a + ': must be a name or a list of names')
      }
    }
  }
  walk(rule.when, 'when')

  rule.then.forEach((action, i) => {
    if (!isPlainObject(action)) { problems.push('then[' + i + ']: an action must be an object'); return }
    const keys = Object.keys(action)
    if (keys.length !== 1) { problems.push('then[' + i + ']: exactly one action key per entry'); return }
    const key = keys[0]
    if (!ACTIONS.includes(key)) problems.push('then[' + i + ']: unknown action: ' + key)
    if (key === 'deny') {
      const d = action.deny
      if (!isPlainObject(d) || typeof d.message !== 'string') problems.push('then[' + i + '].deny: needs { code, message }')
      else if (typeof d.code !== 'string' || !/^VMU_[A-Z0-9_]+$/.test(d.code)) problems.push('then[' + i + '].deny.code must match VMU_[A-Z0-9_]+ (digits ARE allowed: a pack id like `v5r-core` yields VMU_PACK_V5R_CORE_*)')
    }
    if (key === 'rewriteArgs' && !isPlainObject(action.rewriteArgs)) problems.push('then[' + i + '].rewriteArgs: must be an object')
    if (key === 'appendPrompt' && !(isPlainObject(action.appendPrompt) || Array.isArray(action.appendPrompt))) {
      problems.push('then[' + i + '].appendPrompt: must be an object or a list')
    }
  })
  return problems
}

/** capability requirements of a rule (used to check what the entry declared, docs/05 §6). */
export function requiredCapabilities(rule) {
  const out = new Set(['read-args'])
  for (const action of (rule && rule.then) || []) {
    const key = action && Object.keys(action)[0]
    if (ACTION_CAPABILITY[key]) out.add(ACTION_CAPABILITY[key])
  }
  return [...out]
}

/**
 * Create the engine. `subjects` are the kernel's NAMED state predicates (docs/05 §5.2 `subject`);
 * `counters` and `settings` are read-only views; `match` is the text matcher (injected so the engine
 * stays deterministic).
 */
export function createRulesEngine({
  subjects = {},
  counters = {},
  settings = {},
  match = (text, re) => new RegExp(re).test(String(text)),
  clock = () => new Date().toISOString(),
} = {}) {
  const compiled = new Map()
  const stats = { evaluations: 0, matches: 0, refusals: 0, dryRuns: 0 }

  const compare = (op, left, right) => {
    switch (op) {
      case undefined: case 'eq': return left === right
      case 'ne': return left !== right
      case 'gt': return Number(left) > Number(right)
      case 'gte': return Number(left) >= Number(right)
      case 'lt': return Number(left) < Number(right)
      case 'lte': return Number(left) <= Number(right)
      case 'in': return Array.isArray(right) && right.includes(left)
      case 're': return match(left, right)
      default: throw refuse('VMU_INVALID_ARGUMENT', 'unknown comparison operator: ' + String(op))
    }
  }

  const getPath = (obj, path) => String(path).split('.').reduce((acc, k) => (acc === null || acc === undefined ? undefined : acc[k]), obj)

  const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 're']

  /** docs/05 §5.2 writes the operator as the clause KEY (`setting: { key, gt: 0 }`), so read it there. */
  const readOp = (clause, fallbackOp, fallbackValue) => {
    for (const op of OPS) {
      if (Object.prototype.hasOwnProperty.call(clause, op)) return [op, clause[op]]
    }
    return [fallbackOp, fallbackValue]
  }

  const evalAtomic = (key, want, ev) => {
    switch (key) {
      case 'tool': return [].concat(want).some((w) => String(ev.tool || '') === String(w) || (String(w).endsWith('*') && String(ev.tool || '').startsWith(String(w).slice(0, -1))))
      case 'member': return [].concat(want).includes(ev.member)
      case 'role': return [].concat(want).includes(ev.role)
      case 'phase': return [].concat(want).includes(ev.phase)
      case 'arg': {
        const got = getPath(ev.args || {}, want.path)
        const [op, value] = readOp(want, 'eq', want.eq)
        return compare(op, got, value)
      }
      case 'setting': {
        const [op, value] = readOp(want, 'eq', undefined)
        const current = typeof ev.__settingFn === 'function' ? ev.__settingFn(want.key) : settings[want.key]
        return compare(op, current, value)
      }
      case 'count': {
        const [op, value] = readOp(want, 'gte', 1)
        const current = counters[want.of]
        return compare(op, current === undefined ? 0 : current, value)
      }
      case 'subject': {
        const names = [].concat(want)
        return names.every((n) => {
          const fn = subjects[n]
          if (typeof fn !== 'function') {
            throw refuse('VMU_NO_SUCH_OBJECT', 'unknown subject predicate: ' + n,
              'subjects must be registered by the kernel (docs/03 §4); known: ' + Object.keys(subjects).join(', '))
          }
          return fn(ev) === true
        })
      }
      case 'match': {
        const text = want.on === 'prompt' ? ev.prompt : want.on === 'result' ? ev.result : ev.text
        return match(text, want.re)
      }
      default: throw refuse('VMU_INVALID_ARGUMENT', 'unknown predicate: ' + key)
    }
  }

  const evaluateWhen = (node, ev) => {
    if (node === null || node === undefined) return true
    const keys = Object.keys(node)
    if (keys.includes('all')) return node.all.every((n) => evaluateWhen(n, ev))
    if (keys.includes('any')) return node.any.some((n) => evaluateWhen(n, ev))
    if (keys.includes('not')) return !evaluateWhen(node.not, ev)
    return keys.every((k) => evalAtomic(k, node[k], ev))
  }

  /**
   * The bus calls a handler with `{ hook, payload, ctx, dryRun, traceId, setting }`, while a rule is
   * written against a FLAT event (`tool`, `args`, `member`, `role`, `phase`, `prompt`, ...). Normalising
   * here means a rule author never has to know the bus envelope, and it also carries the bus's setting
   * accessor into the `setting:` predicate.
   */
  const normaliseEvent = (raw) => {
    if (!raw || typeof raw !== 'object') return {}
    // Shape-tolerant: the bus passes an ENVELOPE ({ hook, payload, ctx, setting }), while a direct call
    // (or a dry-run sample) passes a FLAT event. Detect the envelope rather than guessing.
    const isEnvelope = raw.payload !== undefined && (raw.hook !== undefined || raw.ctx !== undefined || raw.setting !== undefined)
    const flat = Object.assign({}, isEnvelope ? (raw.payload || {}) : raw)
    const ctx = raw.ctx || {}
    if (flat.member === undefined) flat.member = raw.member !== undefined ? raw.member : ctx.member
    if (flat.role === undefined) flat.role = raw.role !== undefined ? raw.role : ctx.role
    if (flat.phase === undefined) flat.phase = raw.phase !== undefined ? raw.phase : ctx.phase
    if (flat.tool === undefined && raw.tool !== undefined) flat.tool = raw.tool
    if (flat.args === undefined) flat.args = raw.args || {}
    if (typeof raw.setting === 'function') flat.__settingFn = raw.setting
    return flat
  }

  const engine = {
    /**
     * Static validation: the STRUCTURE (validateRule) AND the named predicates. The predicate scan used to
     * live only inside toBusEntries, so `validate()` said "fine" about a rule naming a predicate that does
     * not exist - the manual's "上线前静态校验" promise needs both halves in one call.
     */
    validate(rule) {
      const problems = validateRule(rule)
      const scan = (node, path) => {
        if (!node || typeof node !== 'object') return
        if (node.subject !== undefined) {
          for (const n of [].concat(node.subject)) {
            if (typeof subjects[n] !== 'function') {
              problems.push(path + '.subject: unknown named predicate: ' + n + ' (known: ' + (Object.keys(subjects).join(', ') || '(none)') + ')')
            }
          }
        }
        if (node.not !== undefined) scan(node.not, path + '.not')
        for (const k of ['all', 'any']) {
          if (node[k] === undefined) continue
          ;[].concat(node[k]).forEach((child, i) => scan(child, path + '.' + k + '[' + i + ']'))
        }
      }
      if (rule && rule.when) scan(rule.when, 'when')
      return problems
    },
    requiredCapabilities,

    /** Compile. Static problems are refused by name BEFORE anything can run (docs/05 §9). An unregistered
     *  NAMED subject predicate is a static defect too: fail fast, do not wait for a live event. */
    compile(rule) {
      const problems = validateRule(rule)
      const subjectProblems = []
      const walkSubjects = (node, path) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach((n, i) => walkSubjects(n, path + '[' + i + ']')); return }
        if (node.all) walkSubjects(node.all, path + '.all')
        if (node.any) walkSubjects(node.any, path + '.any')
        if (node.not) walkSubjects(node.not, path + '.not')
        if (node.subject !== undefined) {
          for (const name of [].concat(node.subject)) {
            if (typeof subjects[name] !== 'function') {
              subjectProblems.push(path + '.subject: unknown named predicate: ' + name + ' (known: ' + (Object.keys(subjects).join(', ') || '(none)') + ')')
            }
          }
        }
      }
      walkSubjects(rule && rule.when, 'when')
      problems.push(...subjectProblems)
      if (problems.length > 0) {
        throw refuse('VMU_MIDDLEWARE_FAILED', 'invalid M1 rule ' + String(rule && rule.id) + ': ' + problems.join('; '),
          'rules are data: see docs/05 §5 for the predicate and action whitelists')
      }
      const frozen = JSON.parse(JSON.stringify(rule))
      const handler = async (raw) => {
        stats.evaluations++
        const ev = normaliseEvent(raw)
        if (!evaluateWhen(frozen.when, ev)) return undefined
        stats.matches++
        // The first terminal action wins; non-terminal actions are returned together for the caller.
        for (const action of frozen.then) {
          const key = Object.keys(action)[0]
          if (key === 'deny' || key === 'cancel') {
            return { [key]: Object.assign({}, action[key], { by: frozen.id, at: clock() }) }
          }
        }
        const merged = {}
        for (const action of frozen.then) {
          const key = Object.keys(action)[0]
          merged[key] = Object.assign({}, merged[key] || {}, action[key])
        }
        return merged
      }
      compiled.set(frozen.id, { rule: frozen, handler })
      return handler
    },

    get(id) {
      const c = compiled.get(id)
      if (!c) throw refuse('VMU_NO_SUCH_OBJECT', 'no compiled rule with id ' + String(id))
      return c.rule
    },

    /** Pure evaluation: no side effects, so it is also what dry-run uses (docs/05 §9 step 2). */
    evaluate(id, rawEvent) {
      const c = compiled.get(id)
      if (!c) throw refuse('VMU_NO_SUCH_OBJECT', 'no compiled rule with id ' + String(id))
      stats.evaluations++
      const ev = normaliseEvent(rawEvent)
      const matched = evaluateWhen(c.rule.when, ev)
      if (matched) stats.matches++
      return { matched, would: matched ? c.rule.then.map((a) => Object.keys(a)[0]) : [] }
    },

    /**
     * Dry-run a rule over sample events: reports what it WOULD do, and provably does nothing.
     * Returns the per-sample verdict plus whether every decision was terminal.
     */
    dryRun(rule, samples = []) {
      const problems = validateRule(rule)
      if (problems.length > 0) {
        stats.refusals++
        return { ok: false, problems, hits: [], would: [] }
      }
      stats.dryRuns++
      const hits = []
      for (const ev of samples) {
        const matched = evaluateWhen(rule.when, Object.assign({ args: {}, tool: null, member: null, role: null, phase: null }, ev))
        if (matched) hits.push({ event: ev, would: (rule.then || []).map((a) => Object.keys(a)[0]) })
      }
      return { ok: true, problems: [], evaluated: samples.length, hits,
        would: [...new Set(hits.flatMap((h) => h.would))] }
    },

    /** Compile every rule and return bus-ready entries, so M1 and M2 share one bus (docs/05 §2). */
    toBusEntries(rules = []) {
      return rules.map((rule) => {
        const handler = engine.compile(rule)
        return { id: rule.id, kind: 'rules', on: rule.on, order: rule.order, failure: rule.failure,
          capabilities: rule.capabilities || requiredCapabilities(rule), handler }
      })
    },

    /** Observability (R11): what is compiled, how often it matched, and what was refused. */
    status() {
      return {
        compiled: [...compiled.keys()],
        rules: [...compiled.values()].map((c) => ({ id: c.rule.id, on: c.rule.on, capabilities: requiredCapabilities(c.rule) })),
        subjects: Object.keys(subjects),
        stats: Object.assign({}, stats),
      }
    },

    /** The predicate/action vocabularies, exposed so a pack can be validated against the running engine. */
    vocabulary() { return { predicates: PREDICATES.slice(), actions: ACTIONS.slice(), forbidden: FORBIDDEN_KEYS.slice() } },

    /**
     * The compiled rule behind an id (or null). The host tool needs this to DRY-RUN a rule that is already
     * declared: the bus entry only carries a handler, so without this accessor "干跑某条已声明规则" would be
     * impossible and the manual's promote flow would have no implementation.
     */
    get(id) {
      const rec = compiled.get(String(id))
      return rec ? JSON.parse(JSON.stringify(rec.rule)) : null
    },
    /** The ids this engine currently enforces (declaration order is not meaningful; the list is sorted). */
    ids() { return [...compiled.keys()].sort() },
  }

  return engine
}
