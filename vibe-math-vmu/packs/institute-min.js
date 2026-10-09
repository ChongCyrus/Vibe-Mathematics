// vmu pack — `institute-min`: the smallest institution that reproduces v5r's behavioural core.
//
// This file is a PROOF, not a product: it exists to show that v5r's semantics can be expressed with the
// framework as it stands - settings for mechanism, a pack for the institution, M1 rules for conduct, and
// aliases for the legacy names - WITHOUT teaching the kernel anything about academics (R1, D5).
//
// What it reproduces from v5r (see _oneoff/vmu/design/03-v5r-containment-report.md):
//   · role slots chair/member with capacities      -> v5r `academician` + `researcherCount`, as SLOTS;
//   · m-unanimous quorum with a cap and a floor    -> v5r `quorumMode/quorumCap/reconsiderFloor`;
//   · vote only on a LOCKED (settled) object       -> v5r's `V5_INVALID_ARGUMENT` gate, as an M1 rule;
//   · no end-less verification                     -> v5r `verdictMaxRounds`, as a setting;
//   · one wall-clock backstop, never "unbounded"   -> v5r `meetingHardLimitMs`, as a setting;
//   · v5 tool names keep working via aliases        -> D6/D14 (the alias layer, no renaming).
//
// Everything the kernel needs is DATA. Nothing here is code the kernel executes on its own behalf.

/** A pack is data plus declarations; `createPackLoader().plan()` reports exactly what applying it changes. */
export const PACK = Object.freeze({
  id: 'institute-min',
  version: '1.0.0',
  packContractVersion: 1,
  description: '最小可用研究所：席位、法定数、定稿才可表决、不限轮复算',

  // What this pack RELIES ON (checked against the published contract, D13-O3).
  requires: [
    { service: 'vmu.tasks', minVersion: 1 },
    { service: 'vmu.middleware', minVersion: 1 },
  ],

  // R-d: institutional codes live in the pack's own namespace, so "the framework refused" and "the
  // institution refused" stay distinguishable, and the loader checks the prefix.
  codes: [
    'VMU_PACK_INSTITUTE_MIN_NOT_LOCKED',
    'VMU_PACK_INSTITUTE_MIN_FROZEN_ROUND',
  ],

  // D5: SLOTS, not roles. Labels and permissions are opaque strings the kernel never interprets.
  slots: [
    { id: 'chair', label: '主持人', capacity: 1, permissions: ['convene', 'close', 'assign', 'grant'] },
    { id: 'member', label: '成员', capacity: 0, permissions: ['speak', 'vote', 'propose'] },
    { id: 'temp', label: '临时', capacity: 12, permissions: ['speak'] },
  ],

  // The record tracks this institution keeps; `rejected` is where negative knowledge goes (docs/07 §4.2).
  tracks: ['progress', 'routes', 'obstacles', 'rejected', 'state'],

  // MECHANISM switches only (docs/04 §11 ownership rule). Values are v5r's own defaults.
  settings: {
    'vmu.meetings.quorumRule': 'm-unanimous',
    'vmu.meetings.quorumCap': 3,
    'vmu.meetings.reconsiderFloor': 0,
    'vmu.meetings.verdictMaxRounds': 3,
    'vmu.meetings.hardLimitMs': 1800000,
    'vmu.meetings.wakeRetries': 5,
    'vmu.records.pointerPropagation': true,
  },

  // The conduct rules, as M1 data (docs/05 §5). The only kernel NAMED predicate used here expresses a
  // generic mechanism - "the object has a settled formal proof" - never an academic opinion.
  rules: [
    {
      id: 'institute-min-locked-vote',
      kind: 'rules',
      on: ['tools/pre-execute'],
      when: { all: [{ tool: ['vibe_v5_poll_vote'] }, { not: { subject: 'has_locked_formal_proof' } }] },
      then: [{
        deny: {
          code: 'VMU_PACK_INSTITUTE_MIN_NOT_LOCKED',
          message: '只有已被正式证明或证伪、且已定稿（locked）的对象才能进入表决',
          hint: '先用数学面结算（settled：退出 0 且内容哈希未变），再开表决',
        },
      }],
    },
  ],

  // The legacy names keep working, bridged - not renamed (D6/D14).
  aliases: [
    { from: 'vibe_v5_poll_vote', to: 'vmu.tasks' },
    { from: 'vibe_v5_poll_open', to: 'vmu.tasks' },
    { from: 'vibe_v5_members', to: 'vmu.members' },
    { from: 'vibe_v5_meeting', to: 'vmu.middleware' },
  ],
})

export default PACK
