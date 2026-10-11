// vmu paper — the MULTI-CONTRIBUTOR manuscript face (docs/17 §6 分工, docs/22 §终稿).
//
// WHY THIS EXISTS (round 135, measured): the v5r line has two tools - `paper` (start the team-authored paper for
// this run) and `finalize_paper` (finalise it after consulting the whole institute) - and vmu had their PIECES but
// not the ORCHESTRATION: `publication.js` owns the version chain, submission packs and archive registration, and
// `conference.js` owns the call for papers, submissions and reviewer assignment, but nothing owned "each section is
// owed by a NAMED member, and the manuscript may only be finalised when what was promised is in". That gap was
// recorded as one of the two remaining partials in the v5r containment table; this module closes it.
//
// THE DECISION THIS MODULE ENCODES (framework, not policy):
//   · ownership is MACHINE-ENFORCED: a section can only be handed in by the member it was contracted to, and a
//     refusal names both the owner and the caller (a rule the machine cannot enforce is a suggestion, not a rule);
//   · completeness is a GATE, not a hope: finalising with outstanding sections is refused BY NAME - listing each
//     missing section and who owes it - unless the pack has explicitly turned the requirement off, and then the
//     gaps travel in the receipt so they are recorded rather than forgotten;
//   · registration is DELEGATED: the module never writes a version chain itself; it calls the injected `register`
//     seam and, when no seam is bound, refuses by name instead of pretending the manuscript was registered;
//   · nothing is silently overwritten: a second hand-in for the same section, or a second finalisation, is refused.
//
// Zero policy check (asserted by tests/vmu-paper.test.mjs): no role name, section name or title from the v5r line
// appears in this file; every name here comes from the caller or from settings.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** D3: the refusal states its EVALUATION SCOPE (see members.js for the same sentence). */
export const ENFORCED_SCOPE = 'evaluated-so-far'

/** The keys this module really reads. Exported so the schema generator can see them (see generate-wired-schema). */
export const WIRED_KEYS = Object.freeze([
  'vmu.paper.requireAllSections',
  'vmu.paper.finalizer',
])

/** Declared but deliberately NOT wired (the audit criterion: named, with a reason, and a revival condition). */
export const PLANNED_KEYS = Object.freeze([
  ['vmu.paper.maxSections', '章节数上限未接：本面不设上限（超长稿件应由 workflow 的阶段闸约束 ✗）'],
  ['vmu.paper.retentionMs', '稿件保留期未接：本面无持久化面（与 course 的同类键同因 ✗）'],
])

export const FINALIZERS = Object.freeze(['editor', 'contributor', 'any'])

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  err.enforcedScope = ENFORCED_SCOPE
  return err
}

const SECTION_ID = /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/
const TRAIL_MAX = 200

export function createPaper({ clock = () => Date.now(), log = () => {}, settings = {}, register = null } = {}) {
  const readKey = (k) => (settings && typeof settings.get === 'function' ? settings.get(k) : (settings || {})[k])

  /** Settings read in exactly ONE place, so keysUsed() and the behaviour can never disagree. */
  const cfg = () => {
    const requireAllSections = readKey('vmu.paper.requireAllSections') === false ? false : true
    const finalizerRaw = String(readKey('vmu.paper.finalizer') || 'editor')
    const finalizer = FINALIZERS.indexOf(finalizerRaw) === -1 ? 'editor' : finalizerRaw
    return { requireAllSections, finalizer }
  }

  const keysUsed = () => WIRED_KEYS.slice()
  const partition = () => ({
    all: WIRED_KEYS.length + PLANNED_KEYS.length,
    wired: WIRED_KEYS.length,
    planned: PLANNED_KEYS.length,
    disjoint: WIRED_KEYS.every((k) => PLANNED_KEYS.every((p) => p[0] !== k)),
    exact: true,
  })

  const papers = new Map()
  let seq = 0
  const trail = []
  let droppedTrail = 0
  const note = (id, what) => {
    trail.push({ at: clock(), id, what })
    if (trail.length > TRAIL_MAX) { trail.shift(); droppedTrail += 1 }
  }

  const view = (p) => ({
    id: p.id, title: p.title, editor: p.editor, state: p.state, at: p.at, finalizedAt: p.finalizedAt,
    sections: p.sections.map((s) => ({ name: s.name, owner: s.owner, by: s.by, at: s.at, artifact: s.artifact })),
    outstanding: p.sections.filter((s) => s.by === null).map((s) => ({ name: s.name, owner: s.owner })),
    gaps: p.gaps ? p.gaps.slice() : null,
    receipt: p.receipt === undefined ? null : p.receipt,
  })

  const find = (id) => {
    const p = papers.get(String(id || ''))
    if (!p) throw refuse('VMU_NO_SUCH_OBJECT', 'no paper with id ' + String(id), 'call status() for the open manuscripts')
    return p
  }

  return {
    /**
     * Start a manuscript: a title, the sections it must contain, WHO OWES EACH SECTION, and the editor. Every
     * section must have an owner - an unowned section would be a promise nobody made, so it is refused by name.
     */
    start({ title, sections, contributors, editor } = {}) {
      const t = String(title || '').trim()
      if (!t) throw refuse('VMU_INVALID_ARGUMENT', 'start needs a title', 'the title is what the receipt and the registration carry')
      const names = Array.isArray(sections) ? sections.map((s) => String(s || '').trim()).filter((s) => s.length > 0) : []
      if (!names.length) throw refuse('VMU_INVALID_ARGUMENT', 'start needs at least one section', 'sections: ["intro", ...]')
      const dupes = names.filter((n, i) => names.indexOf(n) !== i)
      if (dupes.length) throw refuse('VMU_INVALID_ARGUMENT', 'duplicate section name(s): ' + [...new Set(dupes)].join(', '), 'section names are the contract keys')
      const bad = names.filter((n) => !SECTION_ID.test(n))
      if (bad.length) throw refuse('VMU_INVALID_ARGUMENT', 'malformed section name(s): ' + bad.join(', '), 'letters/digits/space/._-/ only')
      const map = contributors && typeof contributors === 'object' ? contributors : {}
      const unowned = names.filter((n) => typeof map[n] !== 'string' || map[n].trim().length === 0)
      if (unowned.length) {
        throw refuse('VMU_INVALID_ARGUMENT', 'section(s) with no owner: ' + unowned.join(', '),
          'each section is owed by a NAMED member; give contributors: { "<section>": "<member>" }')
      }
      const ed = String(editor || '').trim()
      if (!ed) throw refuse('VMU_INVALID_ARGUMENT', 'start needs an editor', 'the editor is who may finalise by default')
      const id = 'paper-' + (++seq)
      const p = {
        id, title: t, at: clock(), editor: ed, state: 'open', finalizedAt: null, gaps: null, receipt: undefined,
        sections: names.map((n) => ({ name: n, owner: String(map[n]).trim(), by: null, at: null, artifact: null })),
      }
      papers.set(id, p)
      note(id, 'started')
      return { ok: true, paperId: id, sections: p.sections.length, editor: ed, outstanding: view(p).outstanding }
    },

    /** Hand in ONE section. Only the member it was contracted to may do it - checked, not assumed. */
    contribute({ paperId, section, by, artifact } = {}) {
      const p = find(paperId)
      if (p.state !== 'open') throw refuse('VMU_STATE', 'paper ' + p.id + ' is ' + p.state, 'a finalised manuscript is closed to contributions')
      const s = p.sections.find((x) => x.name === String(section || ''))
      if (!s) throw refuse('VMU_NO_SUCH_OBJECT', 'no section ' + String(section) + ' in ' + p.id,
        'declared sections: ' + p.sections.map((x) => x.name).join(', '))
      const who = String(by || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'contribute needs by', 'the hand-in is attributed')
      if (who !== s.owner) {
        throw refuse('VMU_NOT_PERMITTED', 'section "' + s.name + '" is owed by ' + s.owner + ', not by ' + who,
          'ownership is machine-enforced; the owner hands it in, or the manuscript is re-started with a different owner')
      }
      if (s.by !== null) {
        throw refuse('VMU_STATE', 'section "' + s.name + '" was already handed in by ' + s.by + ' at ' + s.at,
          'a section is written once; start a new manuscript version rather than overwriting silently')
      }
      s.by = who
      s.at = clock()
      s.artifact = artifact === undefined || artifact === null || String(artifact).trim() === '' ? null : String(artifact)
      note(p.id, 'section:' + s.name)
      return { ok: true, paperId: p.id, section: s.name, by: who, artifact: s.artifact, outstanding: view(p).outstanding }
    },

    /**
     * Finalise the manuscript. The completeness gate names every missing section AND its owner; the finaliser rule
     * decides who may do it; and registration goes through the injected seam or is refused by name.
     */
    async finalize({ paperId, by } = {}) {
      const p = find(paperId)
      if (p.state !== 'open') throw refuse('VMU_STATE', 'paper ' + p.id + ' is already ' + p.state, 'finalise once; a revision is a new manuscript')
      const c = cfg()
      const who = String(by || '').trim()
      if (!who) throw refuse('VMU_INVALID_ARGUMENT', 'finalize needs by', 'the finaliser is recorded')
      if (c.finalizer === 'editor' && who !== p.editor) {
        throw refuse('VMU_NOT_PERMITTED', 'only the editor (' + p.editor + ') may finalise, not ' + who,
          'vmu.paper.finalizer=editor; set it to contributor/any if the pack wants a different rule')
      }
      if (c.finalizer === 'contributor' && who !== p.editor && !p.sections.some((s) => s.owner === who)) {
        throw refuse('VMU_NOT_PERMITTED', who + ' is neither the editor nor a contributor to ' + p.id,
          'vmu.paper.finalizer=contributor')
      }
      const missing = p.sections.filter((s) => s.by === null)
      if (missing.length && c.requireAllSections) {
        throw refuse('VMU_STATE',
          'cannot finalise: ' + missing.length + ' section(s) outstanding - ' + missing.map((s) => '"' + s.name + '" (' + s.owner + ')').join(', '),
          'the manuscript is finalised when what was promised is in; or set vmu.paper.requireAllSections=false to record the gaps instead')
      }
      p.gaps = missing.map((s) => ({ name: s.name, owner: s.owner }))
      if (typeof register !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'no registration seam is bound', 'inject { register } - the kernel never writes the version chain itself (docs/11 §4.1)')
      }
      const receipt = await register({
        title: p.title, editor: p.editor, at: clock(),
        sections: p.sections.map((s) => ({ name: s.name, owner: s.owner, by: s.by, artifact: s.artifact })),
        gaps: p.gaps.slice(),
      })
      p.state = 'finalized'
      p.finalizedAt = clock()
      p.receipt = receipt === undefined ? null : receipt
      note(p.id, 'finalized' + (p.gaps.length ? ':with-gaps' : ''))
      return { ok: true, paperId: p.id, state: p.state, by: who, gaps: p.gaps.slice(), receipt: p.receipt, droppedTrail }
    },

    /** Read-only: every manuscript with its section states. Never a decision, only what is (docs/21 §5). */
    status(paperId) {
      if (paperId) return { ok: true, paper: view(find(paperId)) }
      return {
        ok: true, count: papers.size, droppedTrail,
        papers: [...papers.values()].map(view),
        cfg: cfg(),
      }
    },

    keysUsed,
    partition,
  }
}

export default createPaper
