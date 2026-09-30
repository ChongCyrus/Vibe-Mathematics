# Security Policy

## Supported versions

Security fixes are released for the latest published minor line. Older lines are supported only for
the DSH host versions they were built against.

| Version | Supported | Notes |
|---|---|---|
| 2.4.x (latest) | ✅ | Current line — DSH 0.1.2-alpha.4 … 0.2.0-rc.2 |
| 2.3.x | ⚠️ security fixes only | Still installs on DSH ≤ 0.1.6 hosts |
| ≤ 2.2.x | ❌ | Please upgrade |

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's private vulnerability
reporting on this repository (Security → Report a vulnerability), or contact the maintainer through
the profile linked from <https://github.com/ChongCyrus/Vibe-Mathematics>.

Please include: the affected version and DSH host version, a minimal reproduction, the impact you
believe it has, and whether you are willing to be credited.

We aim to acknowledge a report within 7 days and to ship a fix or a documented mitigation within 30
days for anything rated high or critical. If the report turns out to concern the DSH host itself
rather than this package, we will say so and point you at the right project.

## What this package does (and what it does not)

Knowing the design makes reports much easier to triage:

- **What it is.** `dsh-vibe-math` is a DeepSeek Harness plugin bundle. It ships four agent presets
  (v2/v3/v4/v5) and an installer. It runs **inside** the DSH host process with whatever permissions
  the user granted that host — it does not add privileges of its own.
- **No dynamic code execution.** The package contains no `eval` and no `new Function`. Its behaviour
  is fixed at install time; nothing in a session can inject code into it.
- **Filesystem.** It reads and writes only inside the session workspace (the project directory that
  DSH hands to the session) — `VibeMath/…` — plus, on DSH ≤ 0.1.6 only, the legacy
  `~/.dsh/.agent-presets/` directory that the old host line reads. Every write goes through the
  host's `fs` service, so the host's sandbox policy applies.
- **No network, no credentials, no telemetry.** The package itself makes no outbound requests and
  reads no secrets or tokens. Model traffic, if any, is the host's own LLM service.
- **Subprocesses.** The Lean toolchain and shell helpers are invoked only when a preset tool is
  actually called, through the host's `subprocess` service under the host's sandbox policy.
- **Prompts are data.** The preset prompts, corpora and documentation are inert text shipped with
  the package; the repository's own suites verify that model-facing text matches the implementation.

## Verifying what you install

- Published tarballs: `npm view dsh-vibe-math dist.shasum dist.integrity`
- The repository's release gate re-runs every guard before a release; the exact suite/probe counts
  and the packaging checksum of a release are recorded in its release notes.
