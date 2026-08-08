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

## Capability grants

`policy.capabilities` is authority; everything above is rules. It is empty by
default and changes nothing when it is. A non-empty list is a closed world,
checked before any allowlist — because an allowlist describes what a grant
holder may do, not whether they hold one.

```ts
import { createDefaultPolicy, type LocalPolicy } from "@melra/policy-core";

const policy: LocalPolicy = {
  ...createDefaultPolicy(process.cwd()),
  capabilities: [
    {
      id: "build-writes",
      capability: "file.*",
      effects: ["read", "mutate"],
      target: "*/build/*",
      principal: "agent:ci-runner",
    },
  ],
};
```

`capability` and `target` are matched against what `classifyOperation` reported,
with `*` standing for any run of characters. `principal` is matched against
`request.identity.principal` written `kind:id`; a request that declares no
identity is `agent:local`. An effect with no matching grant is denied
`capability_not_granted`, an expired one `capability_expired`, and one issued
against a superseded `policyVersion` is refused rather than reinterpreted under
rules it was not written for.

`unhinged: true` short-circuits evaluation to `allow` — but only after the
caller's own `forbiddenEffects` and `constraints` are honoured, because those are
the caller bounding its own task rather than a guardrail MELRA imposes.

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)

Apache-2.0
