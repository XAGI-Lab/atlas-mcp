# @melra/sdk

TypeScript client for [MELRA](https://github.com/XAGI-Lab/melra), a local-only
MCP server that turns one tool call into a governed, verified, receipted task.

The client spawns a MELRA server over stdio and speaks the task and workflow
tools for you, so you work with typed requests instead of raw MCP plumbing.

```bash
npm install @melra/sdk
```

## Plan, approve, execute

Planning never executes. A mutation comes back with a task-scoped approval
challenge whose exact phrase you must echo to run it.

```ts
import { MelraClient } from "@melra/sdk";

const melra = await MelraClient.connect();

const task = await melra.plan({
  goal: "Record the release note",
  operation: {
    kind: "file",
    action: "write",
    path: "NOTES.md",
    content: "0.3 is out.\n",
  },
  constraints: [],
  forbiddenEffects: [],
  requiredEvidence: [{ type: "file_exists", path: "NOTES.md" }],
  budget: { maxDurationMs: 10_000, maxRetries: 0 },
});

const approval = task.approval as
  | { approvalId: string; phrase: string }
  | undefined;
const result = await melra.execute(
  task.id as string,
  approval && { approvalId: approval.approvalId, phrase: approval.phrase },
);

console.log(result.task);
await melra.close();
```

`requiredEvidence` is what decides success. A write that reported success but
left no file is `partial`, never `verified_success` — the verifier checks the
world, not the adapter's own claim. Leave `constraints` empty: freeform prose is
not enforceable, so a non-empty array is denied outright.

## Connecting to a specific server

`connect()` runs `melra serve` from your `PATH` by default. Point it anywhere:

```ts
const melra = await MelraClient.connect({
  command: "npx",
  args: ["-y", "@melra/cli@alpha", "serve"],
  env: { MELRA_WORKSPACE: "/path/to/project" },
});
```

## Workflows

`planWorkflow`, `advanceWorkflow`, `workflowStatus`, `cancelWorkflow`, and
`controlWorkflow` drive the durable graph. Every node that does work goes through
the same policy, approval, verification, and receipt path as a single task, so
nothing is bypassed by composing.

```ts
const run = await melra.planWorkflow(definition);
await melra.advanceWorkflow(run.id, approvals, [
  { nodeId: "ask-owner", value: "ship it" },
]);
await melra.controlWorkflow(run.id, "pause");
```

Advancing is resumable: call it until the run reaches a terminal status. Effects
are deduplicated by idempotency key across restarts, so a crashed advance does
not repeat work it already committed.

## Other exports

`parseMelraToolResult` unwraps a raw MCP tool result into the parsed JSON payload
and throws the server's error text when the call failed — useful if you talk to
the tools through your own MCP client.

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)

Apache-2.0
