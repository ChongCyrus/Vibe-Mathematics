// v3-core pack — ITS OWN SETTINGS NAMESPACE (C#3 / TB-2792 Step 1b).
//
// WHY THIS FILE EXISTS: a pack may own a settings namespace (docs/10 §4). The framework table holds FRAMEWORK keys only;
// this file declares the pack's keys through the ONE registration seam (settings/schema.js registerPackSettings), so adding
// a pack setting key needs NO framework edit. The framework still VALIDATES and MERGES the values through the same path as
// every framework key, and an unknown namespace is refused by name (VMU_SETTING_NAMESPACE_UNKNOWN).
import { registerPackSettings, HOT } from '../../../settings/schema.js'

export const DEFS = [
  { key: 'vmu.v3.verifierCount', type: 'natural', def: 3, hot: HOT.H1, who: 'office', doc: 'v3-core 包私有：裁定需要多少名独立验证者表态（v3 `verifierCount`）。读者＝`packs/v3-core/index.js:80` 的 quorum 中间件（`setting("vmu.v3.verifierCount")`）。' },
  { key: 'vmu.v3.mode', type: 'enum', domain: ['auto', 'manual'], def: 'auto', hot: HOT.H1, who: 'office', doc: 'v3-core 包私有：`manual` ⇒ 未经人工放行不得派发/运行（v3 `mode`）。读者＝`packs/v3-core/index.js:105` 的 manual-gate 中间件。' },
]

export const REGISTRATION = registerPackSettings({ pack: "v3-core", namespace: "vmu.v3", defs: DEFS })

export default DEFS
