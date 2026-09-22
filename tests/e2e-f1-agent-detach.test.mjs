/**
 * Executable proof of the F-1 mechanism:
 *
 *   After a continuable child's teardown runs, the child Agent is NO LONGER in
 *   the agent registry. Therefore a plugin that handles `subagent/end` and calls
 *   `agents.get(childId)` can never obtain the child — by the time the event is
 *   emitted, the entry is gone.
 *
 * The plugin under audit (vibe-math-v4.js:723-739 `realCompact`) does exactly that,
 * which is why its real `/compact` path is unreachable.
 *
 * This drives the REAL `AgentRegistry` from the installed host, so it is not a
 * mock of the behaviour under test.
 *
 * Usage: node tests/e2e-f1-agent-detach.test.mjs
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Where the installed DSH host packages live.
 *
 * This used to be a hardcoded `C:/Users/<author>/...` path, which meant the suite silently could
 * not run anywhere else. DSH is a globally installed npm package, and the host packages this
 * suite drives (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-agent`) sit INSIDE its own
 * `node_modules` — so the one portable answer is to ask npm for the global root. The earlier
 * candidates stay as cheap fallbacks for workspaces that vendor the host next to the checkout.
 */
const NM = (() => {
  const candidates = []
  if (process.env.DSH_NODE_MODULES) candidates.push(process.env.DSH_NODE_MODULES)
  try {
    candidates.push(join(dirname(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')), 'node_modules', '@deepseek-ai'))
  } catch (e) { /* not resolvable from this checkout — the global install is the normal case */ }
  for (const execDir of [dirname(process.execPath), join(dirname(process.execPath), 'bin')]) {
    candidates.push(join(execDir, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
    candidates.push(join(execDir, 'node_modules', '@deepseek-ai'))
  }
  // `npm root -g`, through npm's own CLI so no shell (and no quoting) is involved
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const root = existsSync(npmCli)
    ? spawnSync(process.execPath, [npmCli, 'root', '-g'], { encoding: 'utf8' })
    : spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true })
  const globalRoot = String((root && root.stdout) || '').trim()
  if (globalRoot) {
    candidates.push(join(globalRoot, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
    candidates.push(join(globalRoot, '@deepseek-ai'))
  }
  const hit = candidates.find((d) => existsSync(join(d, 'cordis')) && existsSync(join(d, 'dsh-agent')))
  if (hit === undefined) throw new Error('e2e-f1-agent-detach: cannot locate the installed DSH host packages; looked in:\n  ' + candidates.join('\n  '))
  return pathToFileURL(hit).href
})()

const { Context } = await import(`${NM}/cordis/lib/index.js`);
const { AgentRegistry } = await import(`${NM}/dsh-agent/lib/index.js`);

const root = new Context();
const agents = new AgentRegistry(root);

/** Minimal Agent satisfying enter()/detachEntered()'s structural needs. */
function makeAgent(id) {
  const session = { id, header: { cwd: 'D:/x' }, seq: 0 };
  return { id, session, options: { provider: 'p', model: 'm' }, status: 'idle', ctx: root };
}

const CHILD = 'child-session-1';
const child = makeAgent(CHILD);

console.log('=== setup ===');
const detach = agents.enter(child, undefined);
console.log(`  agents.get("${CHILD}") right after enter()  -> ${agents.get(CHILD) === undefined ? 'undefined' : 'Agent present'}`);

// What a plugin would capture if it looked the child up while it was live.
const capturedWhileLive = agents.get(CHILD);
console.log(`  captured while live                          -> ${capturedWhileLive === undefined ? 'undefined' : 'Agent (usable)'}`);

/* ---- this is what dsh-subagent does at lib/index.js:1231 ---- */
console.log('\n=== teardown: activation.handle.dispose()  [dsh-subagent/lib/index.js:1231] ===');
detach();
console.log('  dispose() ran -> dsh-agent detachEntered() -> store.delete(entry.id)  [dsh-agent/lib/index.js:508]');

/* ---- only NOW does the host emit subagent/end  [lib/index.js:1241 -> :352] ---- */
console.log('\n=== then the host emits subagent/end  [dsh-subagent/lib/index.js:1241] ===');
const lookedUpInEndHandler = agents.get(child.id);
console.log(`  plugin: agents.get(info.id) inside the end handler`);
console.log(`    -> ${lookedUpInEndHandler === undefined ? 'undefined   <== the child is GONE' : 'Agent (unexpected!)'}`);
console.log(
  `  plugin: vibe-math-v4.js:728  if(!agent || !agent.session) return  -> ${
    lookedUpInEndHandler === undefined ? 'TAKES THE EARLY RETURN' : 'proceeds'
  }`,
);

const pass = capturedWhileLive !== undefined && lookedUpInEndHandler === undefined;
console.log(`\n=== VERDICT: ${pass ? 'CONFIRMED' : 'NOT CONFIRMED'} ===`);
console.log(
  '  A live reference captured BEFORE teardown still works (the registry is not\n' +
    '  consulted again), but a lookup INSIDE the subagent/end handler always fails.\n' +
    '  Fix: capture the Agent at subagent/start and keep it for the end handler.',
);
process.exitCode = pass ? 0 : 1;
