// tests/helpers/settings-recorder.mjs — ONE DEVICE FOR BOTH SETTINGS SHAPES.
//
// ROUND 172. A suite that wants to prove its wired keys are really READ has to observe every route its module takes into
// the settings object, and there are two routes in this kernel:
//   · `settings.get(key)` when the module prefers it (meetings, capacity, ip);
//   · `hasOwnProperty(settings, key)` and then `settings[key]` (hr, compliance, storepolicy).
// A recorder must see BOTH, and round 170 is the cautionary tale: a Proxy that recorded only in `get` observed NOTHING
// for a hasOwnProperty-first module, because [[GetOwnProperty]] never reaches the get trap - the membership check failed
// on an empty target, the property access never happened, and a "six keys are never read" finding was published that
// was purely about the instrument. Hence: record on every route, including the `get` METHOD itself.
//
//   const { settings, reads } = makeRecorder(vals)
//   createFace({ settings })                       // pass `settings`, not `vals`
//   …drive the face…
//   reads                                          // every key the face asked for, in order
export function makeRecorder(vals = {}) {
  const reads = []
  const note = (k) => { if (typeof k === 'string' && k !== 'get') reads.push(k) }
  const has = (k) => Object.prototype.hasOwnProperty.call(vals, k)
  const target = {
    // the METHOD route: called by modules that prefer `settings.get(key)`
    get: (k) => { note(k); return vals[k] },
  }
  const proxy = new Proxy(target, {
    has(t, k) { note(k); return k === 'get' || has(k) },
    getOwnPropertyDescriptor(t, k) {
      if (k === 'get') return { value: t.get, enumerable: true, configurable: true, writable: false }
      note(k)
      return has(k) ? Object.getOwnPropertyDescriptor(vals, k) : undefined
    },
    get(t, k) { if (k === 'get') return t.get; note(k); return vals[k] },
    ownKeys() { return ['get'].concat(Object.keys(vals)) },
  })
  return { settings: proxy, reads }
}
