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
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  formatElectronRelaunchFailure,
  formatHostPrerequisiteFailure,
  resolveHostEnvironment,
} from './helpers/host-environment.mjs'

/** Resolve installed host packages; ASAR packages require Electron's Node mode. */
const host = resolveHostEnvironment()
if (!host.ok) throw new Error(formatHostPrerequisiteFailure(host))
if (host.requiresElectron) {
  if (process.env.DSH_E2E_F1_RELAUNCHED === '1') {
    throw new Error(formatElectronRelaunchFailure(host) + ' Relaunch did not enter Electron Node mode.')
  }
  if (!host.electronExecutable) throw new Error(formatElectronRelaunchFailure(host))
  const relaunched = spawnSync(host.electronExecutable, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    encoding: 'utf8',
    shell: false,
    timeout: 30000,
    env: {
      ...process.env,
      DSH_NODE_MODULES: host.modulesDir,
      DSH_HOST_EXECUTABLE: host.electronExecutable,
      DSH_E2E_F1_RELAUNCHED: '1',
      ELECTRON_RUN_AS_NODE: '1',
    },
    windowsHide: true,
  })
  if (relaunched.stdout) process.stdout.write(relaunched.stdout)
  if (relaunched.stderr) process.stderr.write(relaunched.stderr)
  if (relaunched.error) throw new Error('e2e-f1-agent-detach: Electron relaunch failed: ' + relaunched.error.message)
  process.exit(relaunched.status === null ? 1 : relaunched.status)
}

const NM = host.modulesUrl
const { Context } = await import(`${NM}cordis/lib/index.js`);
const { AgentRegistry } = await import(`${NM}dsh-agent/lib/index.js`);

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
