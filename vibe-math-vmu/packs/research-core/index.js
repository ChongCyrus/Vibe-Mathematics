/**
 * packs/research-core — the GENERIC RESEARCH PRIMITIVES pack (TB-2794 Step 3).
 *
 * WHY THIS PACK EXISTS: a research institute needs a paper flow, reviewers, publication, formalisation and job faces — but
 * those are RESEARCH faces, not framework mechanism. Step 0 added the service-contribution seam; this pack is where the
 * generic (institution-neutral) research implementations live, so a second institution can reuse them and v5r only keeps
 * ITS policy. Step 1 moves the paper flow here; later steps move reviewers/publication/formal/fidelity/lean-tool-faces.
 */
export const RESEARCH_CORE_PACK = Object.freeze({
  id: 'research-core',
  version: '1.0.0',
  title: 'generic research primitives',
  description: 'institution-neutral paper/review/publication/formalisation primitives; v5r adds its own policy on top',
})

// ★ TB-2794 Step 1: the folder carries a MANIFEST (id/version/title), so the pack enumeration invariants hold
// (`vmu-pack-data-sections` / `vmu-pack-manifest-pointers`): a folder is a manifest OR data read by name — research-core
// is the former, and its generic primitives are reachable through this entry.
export const PACK = RESEARCH_CORE_PACK

export * from './paper-flow.js'
