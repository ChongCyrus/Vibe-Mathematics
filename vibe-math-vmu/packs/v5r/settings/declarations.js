// v5r pack — ITS OWN SETTINGS NAMESPACE (C#3 / TB-2792 Step 1b).
//
// WHY THIS FILE EXISTS: a pack may own a settings namespace (docs/10 §4). The framework table holds FRAMEWORK keys only;
// this file declares the pack's keys through the ONE registration seam (settings/schema.js registerPackSettings), so adding
// a pack setting key needs NO framework edit. The framework still VALIDATES and MERGES the values through the same path as
// every framework key, and an unknown namespace is refused by name (VMU_SETTING_NAMESPACE_UNKNOWN).
import { registerPackSettings, HOT } from '../../../settings/schema.js'

export const DEFS = [
  { key: 'vmu.v5r.fixtureMode', type: 'enum', domain: ['no-tools', 'tools'], def: 'no-tools', hot: HOT.H1, who: 'office', doc: 'PHASE 7：SLV 夹具模式开关。no-tools（默认）＝本轮不调用工具（保持历史 run 可比）；tools＝本轮可以且应该调用工具。由 pack 的 prompt 策略在【调用期】按回合 settings 读取，因此值层即足够；未知取值按具名拒处理，不猜默认。' },
]

export const REGISTRATION = registerPackSettings({ pack: "v5r", namespace: "vmu.v5r", defs: DEFS })

export default DEFS
