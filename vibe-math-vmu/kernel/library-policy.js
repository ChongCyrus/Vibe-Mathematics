// vibe-math-vmu — the library face's POLICY helpers, extracted verbatim from `kernel/library.js`.
//
// WHY THIS FILE EXISTS: `createLibrary` had grown to 620 lines, past the point where a bounded edit is even meaningful (the
// project's own bounded editor refuses spans that large, which is how the size was measured). These six checkers are a cohesive,
// PURE unit: they read the resolved settings, they refuse by name, and they touch nothing on disk. Moving them out changes no
// behaviour - the extraction is deliberately verbatim, with only the free variables turned into injected values.
//
// Everything they need is INJECTED rather than imported: `refuse` and the index map both belong to the caller, and the index is
// created after this factory is called, so it arrives as a getter rather than as a value.

/**
 * @param {object} o
 * @param {Function} o.refuse      the caller's refusal helper (keeps the code family identical)
 * @param {() => Map} o.getIndex   the caller's index, read lazily
 * @param {object} o.cfg           the resolved `vmu.*` values these checkers obey
 */
export function createLibraryPolicy({ refuse, getIndex, cfg = {} } = {}) {
  const {
    tagsControlled, tagsAliasTable, tagsMaxDepth,
    metadataCustomPrefix, metadataStrictness,
    provenanceDepth, provenanceInputFingerprint,
    refsRequireTarget, refsDanglingPolicy, refsBacklinkDepth,
  } = cfg

  const vocabulary = new Set()
  const aliases = new Set()

  const registerVocabulary = ({ tags = null, aliasTags = null } = {}) => {
    if (Array.isArray(tags)) for (const x of tags) if (typeof x === 'string' && x.trim()) vocabulary.add(x.trim())
    if (Array.isArray(aliasTags)) for (const x of aliasTags) if (typeof x === 'string' && x.trim()) aliases.add(x.trim())
    return { ok: true, vocabulary: vocabulary.size, aliases: aliases.size, controlled: tagsControlled,
      aliasTable: tagsAliasTable || null, enforced: ['vmu.tags.controlled', 'vmu.tags.aliasTable'], fired: [] }
  }

  // The fields this face knows. A field outside this set must be prefixed (metadata.customPrefix) or it falls under
  // metadata.strictness, whose declared default is `warn` - reported, not refused, and never silently dropped.
  const KNOWN_FIELDS = new Set(['id', 'kind', 'title', 'status', 'owner', 'updatedAt', 'fingerprint', 'references', 'statement',
    'tags', 'provenance', 'inputFingerprint'])

  const checkMetadata = ({ record = {} } = {}) => {
    const enforced = ['vmu.metadata.strictness', 'vmu.metadata.customPrefix']
    const customs = []
    const unknown = []
    for (const k of Object.keys(record)) {
      if (KNOWN_FIELDS.has(k)) continue
      if (k.startsWith(metadataCustomPrefix)) { customs.push(k); continue }
      unknown.push(k)
    }
    const fired = unknown.length || customs.length ? ['vmu.metadata.strictness'] : []
    if (unknown.length && metadataStrictness === 'strict') {
      throw refuse('VMU_INVALID_ARGUMENT', 'field(s) neither known nor prefixed with ' + metadataCustomPrefix + ': ' + unknown.join(', '),
        'prefix custom fields with ' + metadataCustomPrefix + ', or set vmu.metadata.strictness to warn/loose deliberately',
        { unknown, customPrefix: metadataCustomPrefix })
    }
    return { ok: true, strictness: metadataStrictness, customPrefix: metadataCustomPrefix, custom: customs,
      unknown, reported: unknown.slice(), enforced, fired }
  }

  /** Provenance: the chain of inputs, bounded by vmu.provenance.depth (0 = all). */
  const provenanceOf = ({ inputs = null } = {}) => {
    const enforced = ['vmu.provenance.depth', 'vmu.provenance.recordInputFingerprint']
    const chain = Array.isArray(inputs) ? inputs : []
    const kept = provenanceDepth > 0 ? chain.slice(-provenanceDepth) : chain.slice()
    const dropped = chain.length - kept.length
    return { ok: true, depth: provenanceDepth, kept, dropped, droppedIsCounted: true,
      inputFingerprint: provenanceInputFingerprint ? (kept.length ? String(kept[kept.length - 1]) : null) : null,
      enforced, fired: chain.length ? ['vmu.provenance.depth'] : [] }
  }

  /**
   * Check a record's `references` against the declaration.
   * `vmu.refs.requireTarget` (default true) makes a reference to an UNKNOWN id a refusal; `vmu.refs.danglingPolicy` then
   * decides whether that refusal stands (`reject`) or whether the dangling reference is merely LISTED in the receipt
   * (`list`, the declared default). A dangling reference is never silent under either setting.
   */
  const checkReferences = ({ references = null, known = null } = {}) => {
    const enforced = ['vmu.refs.requireTarget', 'vmu.refs.danglingPolicy']
    const list = Array.isArray(references) ? references.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []
    const ids = known instanceof Set ? known : new Set(getIndex().keys())
    const dangling = list.filter((r) => !ids.has(r))
    const fired = dangling.length ? ['vmu.refs.requireTarget'] : []
    if (dangling.length && refsRequireTarget && refsDanglingPolicy === 'reject') {
      throw refuse('VMU_INVALID_ARGUMENT', 'reference target does not exist and vmu.refs.danglingPolicy=reject: ' + dangling.join(', '),
        'create the target first, or set vmu.refs.danglingPolicy=list to have dangling references reported instead',
        { dangling, policy: refsDanglingPolicy })
    }
    return { ok: true, references: list, dangling, reported: dangling.slice(), enforced, fired,
      requireTarget: refsRequireTarget, policy: refsDanglingPolicy }
  }

  /** Backlinks up to `vmu.refs.backlinkDepth`, breadth-first over the index. */
  const backlinks = (id, depth = refsBacklinkDepth) => {
    const levels = []
    let frontier = [String(id)]
    const seen = new Set(frontier)
    for (let d = 0; d < Math.max(0, depth); d += 1) {
      const next = []
      for (const rec of getIndex().values()) {
        if (frontier.includes(rec.id)) continue
        if (next.includes(rec.id)) continue
        if (frontier.some((f) => (rec.references || []).includes(f))) next.push(rec.id)
      }
      if (!next.length) break
      for (const n of next) seen.add(n)
      levels.push(next)
      frontier = next
    }
    return { ok: true, id: String(id), depth, levels, backlinks: levels.flat(), enforced: ['vmu.refs.backlinkDepth'], fired: levels.length ? ['vmu.refs.backlinkDepth'] : [] }
  }

  /** Check a tag list against the declaration. Depth first, then the vocabulary, then the alias rule. */
  const checkTags = ({ tags = null } = {}) => {
    const enforced = ['vmu.tags.maxDepth', 'vmu.tags.controlled', 'vmu.tags.aliasTable']
    const fired = []
    const list = Array.isArray(tags) ? tags.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []
    const tooDeep = tagsMaxDepth > 0 ? list.filter((x) => x.split('/').filter(Boolean).length > tagsMaxDepth) : []
    if (tooDeep.length) {
      fired.push('vmu.tags.maxDepth')
      throw refuse('VMU_INVALID_ARGUMENT', 'tag path deeper than vmu.tags.maxDepth=' + tagsMaxDepth + ': ' + tooDeep.join(', '),
        'flatten the tag, or raise vmu.tags.maxDepth deliberately', { tooDeep, maxDepth: tagsMaxDepth })
    }
    if (tagsControlled) {
      fired.push('vmu.tags.controlled')
      const unknown = list.filter((x) => !vocabulary.has(x))
      if (unknown.length) {
        // The alias rule lives here: an alias may pass ONLY when it was registered as one AND the declaration names a table;
        // otherwise the refusal points at the table that the caller has to supply.
        const notAlias = tagsAliasTable ? unknown.filter((x) => !aliases.has(x)) : unknown
        if (notAlias.length) {
          throw refuse('VMU_INVALID_ARGUMENT', 'tag(s) outside the controlled vocabulary: ' + notAlias.join(', '),
            tagsAliasTable
              ? 'register them as aliases via the declared alias table (' + tagsAliasTable + '), or use a vocabulary term'
              : 'register a vocabulary with registerVocabulary({tags}), or set vmu.tags.controlled=false deliberately',
            { notAlias, vocabulary: [...vocabulary].slice(0, 8) })
        }
      }
    }
    return { ok: true, tags: list.slice(), controlled: tagsControlled, maxDepth: tagsMaxDepth, aliasTable: tagsAliasTable || null, enforced, fired }
  }

  return { registerVocabulary, checkMetadata, provenanceOf, checkReferences, backlinks, checkTags }
}
