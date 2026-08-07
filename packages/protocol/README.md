# @melra/protocol

Versioned contracts for [MELRA](https://github.com/XAGI-Lab/melra) — tasks,
workflows, capabilities, policy, and evidence, as Zod schemas plus the types
inferred from them.

This is the wire format every other MELRA package agrees on. Install it if you
are building a client, a runtime, or anything that has to construct or validate
MELRA payloads. If you just want to use MELRA, install
[`@melra/cli`](https://www.npmjs.com/package/@melra/cli) or
[`@melra/sdk`](https://www.npmjs.com/package/@melra/sdk) instead.

```bash
npm install @melra/protocol
```

```ts
import { TaskRequestSchema, PROTOCOL_VERSION } from "@melra/protocol";

const request = TaskRequestSchema.parse({
  goal: "Read the manifest",
  operation: { kind: "file", action: "read", path: "package.json" },
});
```

Every schema is `.strict()` and bounded: unknown fields are rejected rather than
ignored, and strings, arrays, and budgets have explicit maximums. That is
deliberate — a typo'd field name is a bug you want at the boundary, not a silent
default three layers in.

Parse, don't hand-build. `TaskRequestInput` is the shape you write and
`TaskRequest` is what the schema produces once defaults are applied, so pass
input through `TaskRequestSchema.parse` rather than filling in every default by
hand to satisfy the compiler.

Exports the task, workflow, receipt, policy, and MCP tool-input schemas,
`PROTOCOL_VERSION`, `PRODUCT_VERSION`, and `TOOL_NAMES`.

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)

Apache-2.0
