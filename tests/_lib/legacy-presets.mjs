// tests/_lib/legacy-presets.mjs — the ONE seam for the five historical presets.
//
// Stage A (this commit): LEGACY_BASE still points at the repo root, so every resolved path is
// byte-identical to before and T1 stays green. Stage B flips this ONE string to the archived root
// and `git mv`s the five directories; no test should need a second edit.
//
// The five directory names are NOT interchangeable (`vibe-math-v2` is both the directory and the
// JavaScript entry stem), so this module exports a base plus small builders instead of five constants.
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Root that contains the five preset directories. Stage B flips THIS value to the archived root.
 *
 * VMU_LEGACY_BASE is a one-run OVERRIDE (default: the string below). It exists so a probe can prove
 * "every audit script really follows this one switch" by running the scripts against a different root
 * without editing the repository — the same proof pattern the repo uses for its other seams.
 */
export const LEGACY_BASE = (() => {
  const fromEnv = process.env.VMU_LEGACY_BASE
  return typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv.trim() : '.'
})()

/** Directory of one preset, e.g. legacyDir('vibe-math-v5r'). */
export const legacyDir = (name) => resolve(REPO, LEGACY_BASE, name)

/** A file INSIDE one preset directory, e.g. legacyFile('vibe-math-v5', 'math-compulation.js'). */
export const legacyFile = (name, rel) => join(legacyDir(name), rel)

/** The preset's JavaScript entry, e.g. legacyEntry('vibe-math-v5r'). */
export const legacyEntry = (name) => legacyFile(name, name + '.js')

/** The five historical preset directory names, in the order the old `PRESETS` table used. */
export const LEGACY_PRESET_NAMES = Object.freeze([
  'vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5', 'vibe-math-v5r',
])
