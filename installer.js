// dsh-vibe-math merged bundle installer.
// When this bundle is installed (e.g. `dsh plugin add dsh-vibe-math` or from the
// dsh-market), this plugin copies BOTH agent presets out of the package into the
// DSH preset root, so the user immediately gets two presets in the picker:
//   vibe-math-v1/  (classic pipeline architecture)
//   vibe-math-v2/  (new probability-driven architecture)
// Copy is per-file and only installs MISSING files (idempotent; never clobbers
// a preset the user already edited — delete the dir to force a reinstall).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'vibe-math-preset-installer'

export function apply(ctx) {
  const logger = ctx && ctx.logger
  try {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const here = dirname(fileURLToPath(import.meta.url))
    const targets = [
      {
        src: join(here, 'vibe-math-v1'),
        dst: join(dshHome, '.agent-presets', 'vibe-math-v1'),
        files: ['agent.cordis.yml', 'preset.yml', 'vibe-math.js', '实现方案-多代理数学问题求解与验证框架.md'],
      },
      {
        src: join(here, 'vibe-math-v2'),
        dst: join(dshHome, '.agent-presets', 'vibe-math-v2'),
        files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v2.js', '实现方案.md'],
      },
    ]
    let installed = 0
    for (const t of targets) {
      if (!existsSync(t.src)) continue
      mkdirSync(t.dst, { recursive: true })
      for (const f of t.files) {
        const s = join(t.src, f)
        const d = join(t.dst, f)
        if (!existsSync(s) || existsSync(d)) continue
        writeFileSync(d, readFileSync(s))
        installed += 1
      }
    }
    if (installed > 0) {
      logger?.info?.('[dsh-vibe-math] installed ' + installed + ' preset file(s) — presets vibe-math-v1 & vibe-math-v2 are now available in the preset picker (new session)')
    }
  } catch (err) {
    logger?.warn?.('[dsh-vibe-math] preset install failed: %s', String((err && err.message) || err))
  }
}
