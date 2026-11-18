// vibe-math-vmu/packs/research-core/lean-face.js — THE POLICY HALF OF THE LEAN FACE (TB-2794 Step 5).
//
// The ENGINE stays in kernel/lean.js (spawn/compile/job/mirror/archive are generic formalisation primitives). WHAT
// institution policy applies — formalVerify (off|encourage|require) and leanInitiative — is institution vocabulary, so
// it is read HERE from the settings snapshot and injected into the engine as `policy`. The engine reads no policy key.
//
// The returned face is the engine face with ONE override: keysUsed() also reports the two policy keys this wrapper read,
// so the setting table and the face agree about who consumed them (the engine itself no longer lists them).
import { createLeanFace } from '../../kernel/lean.js'

export const LEAN_POLICY_KEYS = Object.freeze(['vmu.math.formalVerify', 'vmu.math.leanInitiative'])

export function createLeanResearchFace({ facade } = {}) {
  const settings = facade && typeof facade.settingsSnapshot === 'function' ? facade.settingsSnapshot() : {}
  const policy = Object.freeze({
    formalVerify: String(settings['vmu.math.formalVerify'] || 'off'),
    leanInitiative: String(settings['vmu.math.leanInitiative'] || 'normal'),
  })
  const face = createLeanFace({
    settings,
    spawn: facade.spawn,
    spawnHandle: facade.spawnHandle,
    timer: facade.timer,
    ids: facade.ids,
    fs: facade.fs,
    root: facade.root,
    clock: facade.clock,
    log: facade.log,
    policy,
  })
  // The durable Lean archive port: the kernel used to call this at construction; the contributor does it now (same seam).
  if (face && typeof face.attachStore === 'function' && facade && facade.recordsStore) face.attachStore(facade.recordsStore)
  if (face && typeof face.keysUsed === 'function') {
    const engineKeys = face.keysUsed.bind(face)
    face.keysUsed = () => {
      const listed = engineKeys()
      const arr = Array.isArray(listed) ? listed.slice() : []
      for (const k of LEAN_POLICY_KEYS) if (arr.indexOf(k) < 0) arr.push(k)
      return arr
    }
  }
  return face
}
