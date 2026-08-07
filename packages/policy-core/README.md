# @melra/policy-core

Policy evaluation and scoped approval primitives for
[MELRA](https://github.com/XAGI-Lab/melra). Decides allow, deny, or confirm for
a typed operation before any adapter runs, and issues and validates the
task-scoped approval challenges that gate mutations.

```bash
npm install @melra/policy-core
```

```ts
import { createDefaultPolicy, evaluatePolicy } from "@melra/policy-core";

const policy = createDefaultPolicy(process.cwd());
const { decision, challenge } = evaluatePolicy(taskId, request, policy);
```

An `allow` runs. A `confirm` returns a `challenge` whose exact phrase must be
echoed back before execution, bound to the task and to a digest of the operation
— so a plan cannot be swapped for a different action after approval. A `deny`
never reaches a runtime.

## Defaults worth knowing

- A non-empty `constraints` array is denied. Freeform prose is not enforceable,
  so the honest answer is to refuse rather than pretend it was applied.
- Any non-`read` effect with no `requiredEvidence` is denied. A mutation nobody
  can check is not a mutation worth running.
- Terminal commands must be allowlisted by basename. Shell interpreters and
  `sudo`/`su` are denied unconditionally. `git` counts as a read only for a small
  read-only subcommand set; `npm`, `npx`, and `pnpm` are high-risk mutations.
- Browser destinations default to `allowedDomains: ["*"]` with localhost allowed,
  because the allowlist is a narrowing control, not the safety boundary — the
  browser runtime independently blocks private and metadata destinations.
- `classifyOperation` is the single place effect and risk are decided. An action
  that is not classified there is mis-classified, not unclassified.

`unhinged: true` short-circuits evaluation to `allow` — but only after the
caller's own `forbiddenEffects` and `constraints` are honoured, because those are
the caller bounding its own task rather than a guardrail MELRA imposes.

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)

Apache-2.0
