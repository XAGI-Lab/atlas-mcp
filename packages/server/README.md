# @melra/server

The official local Model Context Protocol server and workflow runtime for
[MELRA](https://github.com/XAGI-Lab/melra). Eleven MCP tools over stdio, sitting
in front of five capability runtimes: files, terminal, browser, memory, and
computer.

Most people should not install this directly — use
[`@melra/cli`](https://www.npmjs.com/package/@melra/cli), which wraps this
package with setup, readiness checks, and a generated client configuration:

```bash
npx @melra/cli@alpha setup
```

Install this package when you are embedding the server in your own process.

```bash
npm install @melra/server
```

```ts
import { createMelraRuntime, serveStdio } from "@melra/server";

const melra = await createMelraRuntime({
  workspaceRoot: process.cwd(),
  dataDirectory: `${process.env.HOME}/.melra`,
});
await serveStdio(melra);
```

`createMelraRuntime` resolves the policy, opens SQLite, wires the runtimes, and
returns the task controller, workflow controller, and store. `serveStdio`
registers the MCP tools and connects the stdio transport — stdout is the
protocol, so anything you print there corrupts it; use stderr.

## What the runtime guarantees

Planning never executes. `melra_execute` re-evaluates policy so a stale plan
cannot ride a since-tightened policy, validates the approval against the current
action digest, runs the adapter under an `AbortSignal` armed with the task's
duration budget, then verifies. A task is `verified_success` only when the
adapter succeeded *and* every declared evidence predicate passed — an adapter
that claimed success with failing evidence is `partial`.

Paths and terminal working directories stay inside the configured root. The
browser runtime independently rejects non-`http(s)` protocols, URL credentials,
private and link-local ranges, and cloud metadata, resolving DNS first so a
public name cannot be rebound. Secrets are redacted before anything is persisted.

## Unhinged mode

`unhinged: true` (or `MELRA_UNHINGED=1`) removes all of the above except the
budgets and the redaction: no policy, no approvals, no evidence requirement, no
workspace confinement, no destination checks. The runtime reports the mode in
`melra_capabilities` so a connected agent can see there is nothing stopping it.
See [unhinged mode](https://github.com/XAGI-Lab/melra/blob/main/docs/INSTALLATION.md#unhinged-mode).

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)

Apache-2.0
