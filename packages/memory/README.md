# @melra/memory

Scoped, redacted local memory for [MELRA](https://github.com/XAGI-Lab/melra):
put, search, list, delete, and clear, backed by the same SQLite database as
tasks and workflows.

```bash
npm install @melra/memory
```

```ts
import { MemoryOperationSchema } from "@melra/protocol";
import { LocalMemory, rankMemories } from "@melra/memory";

const memory = new LocalMemory(store);
memory.execute(
  MemoryOperationSchema.parse({
    kind: "memory",
    action: "put",
    key: "deploy-owner",
    value: "platform team",
  }),
);
```

`MemoryOperation` is the post-defaults shape, so parse the operation through the
schema rather than hand-filling `scope`, `confidence`, `tags`, `limit`, and
`includeSuperseded`.

Search is lexical, not embedded — tokenised, ranked by term overlap with exact
phrase matches promoted. That is a deliberate ceiling: it is deterministic,
needs no model call, and never sends anything anywhere. `rankMemories` and
`tokenize` are exported if you want the ranking without the store.

Every value passes through `redactMemoryValue` before it is written, so a token
pasted into a memory entry is not preserved in the database.

Reads and deletes are scope-aware: a scope only sees its own entries, so one
task cannot read what another stored by guessing a key.

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)

Apache-2.0
