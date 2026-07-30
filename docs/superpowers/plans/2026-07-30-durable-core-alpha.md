# MELRA Durable Core Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish MELRA—Modular Execution Layer for Reliable Autonomy—as the single repository-wide identity, then build a crash-safe, approval-gated, multi-step workflow runtime that persists exact encrypted execution payloads, reconstructs state from append-only events, independently verifies outcomes, and works through CLI and real MCP stdio transport.

**Architecture:** Extend the current repository in place. Public workflow contracts live in `@melra/protocol`, SQLite remains the local authority, `runtime-core` owns deterministic workflow state, and existing policy, adapters, verifier, receipt, CLI, MCP, and SDK packages remain the execution foundation. Each transition writes events and the current projection in one transaction; exact task payloads are encrypted separately from redacted status records.

**Tech Stack:** Node.js 22+, TypeScript 5.8, pnpm 9.5, Zod 3.25, `node:sqlite`, `node:crypto`, Vitest 3.2, MCP SDK 1.30, Python 3.11+, pytest, Docker for packaging checks.

## Global Constraints

- Keep Apache-2.0 licensing and existing copyright headers.
- Use MELRA as the only current product identity.
- Use `@melra/*`, `melra`, `melra_`, `MELRA_`, `~/.melra`,
  `MelraRuntime`, `MelraClient`, and `createMelraRuntime` exactly as defined in
  the approved naming contract.
- Do not retain public compatibility aliases from the pre-stable previous
  identity.
- Use only public, product-focused language suitable for open publication.
- Public packages must work without a hosted service.
- Use existing dependencies or Node.js standard-library features; add no dependency for encryption, graph traversal, migrations, or event storage.
- Preserve the current file, terminal, browser, computer, memory, policy, receipt, SDK, and MCP behavior unless this plan explicitly versions a contract.
- Every consequential operation passes policy, scoped approval when required, bounded execution, independent verification, receipt generation, and certificate generation.
- Models and tool adapters cannot approve actions or declare workflow completion.
- Exact executable payloads must survive restart; plaintext secrets must not appear in task projections, events, logs, receipts, certificates, or SQLite file bytes.
- Interrupted mutations are never silently retried.
- SQLite uses WAL mode and transactional state transitions.
- Telemetry remains disabled by default.
- Local execution must support macOS, Linux, and Windows on x64 and ARM64 where Node.js 22 is available.
- The first-slice acceptance criteria in `docs/superpowers/specs/2026-07-30-melra-system-design.md` are release gates, not optional follow-up work.

---

## File map

### Product identity

- Modify all tracked text, configuration, source, test, example, benchmark,
  package, container, and automation files containing the previous identity.
- Move the Python SDK import package to `sdk-py/src/melra`.
- Move the browser benchmark package to
  `benchmarks/browser-agent/src/melra_browser_bench`.
- Replace the existing logo and hero assets with MELRA assets at
  `docs/assets/melra-logo.png` and `docs/assets/melra-hero.png`.
- Update repository metadata and the remote URL to `XAGI-Lab/melra`.

### Public contracts

- Modify `packages/protocol/src/index.ts`: add workflow, event, snapshot, encrypted-payload, MCP input schemas, and recovery task status beside the schemas they reuse.
- Create `packages/protocol/src/workflow.test.ts`: strict schema and compatibility tests.
- Modify `packages/protocol/src/index.test.ts`: update the public MCP tool contract.

### Encryption and key management

- Create `packages/runtime-core/src/payload-cipher.ts`: AES-256-GCM canonical payload sealing and opening.
- Create `packages/runtime-core/src/payload-cipher.test.ts`: round-trip, tamper, and plaintext-leak tests.
- Create `packages/server/src/payload-key.ts`: safe local key creation/loading and environment override.
- Create `packages/server/src/payload-key.test.ts`: key permissions, invalid key, and stable reload tests.

### Durable storage

- Modify `packages/storage-sqlite/src/index.ts`: migrations, encrypted task requests/results and workflow definitions, events, redacted projections, snapshots, idempotency commits, and transactional transition methods.
- Modify `packages/storage-sqlite/src/index.test.ts`: migration and persistent-record tests.
- Create `packages/storage-sqlite/src/workflow-store.test.ts`: atomicity, ordering, reconstruction, and idempotency tests.

### Runtime

- Modify `packages/runtime-core/src/task-controller.ts`: replace process-only payload authority with encrypted durable payloads and add interrupted-task recovery.
- Modify `packages/runtime-core/src/task-controller.test.ts`: restart, approval binding, plaintext absence, and recovery tests.
- Create `packages/runtime-core/src/workflow-graph.ts`: graph validation and deterministic topological layers.
- Create `packages/runtime-core/src/workflow-graph.test.ts`: cycle, dependency, bound, and reference tests.
- Create `packages/runtime-core/src/workflow-events.ts`: validated event construction and projection replay.
- Create `packages/runtime-core/src/workflow-events.test.ts`: replay, corruption, and sequence tests.
- Create `packages/runtime-core/src/workflow-controller.ts`: durable workflow planning, advancement, cancellation, compensation, and recovery.
- Create `packages/runtime-core/src/workflow-controller.test.ts`: every node type, event, failure, and restart test.
- Modify `packages/runtime-core/src/index.ts`: export the new runtime APIs.

### Interfaces

- Modify `packages/server/src/runtime.ts`: construct key, cipher, task controller, and workflow controller; run startup recovery.
- Modify `packages/server/src/mcp-server.ts`: add workflow tools.
- Modify `packages/server/test/e2e.test.ts`: real-stdio workflow restart test.
- Modify `apps/cli/src/index.ts`: workflow plan/run/inspect/cancel commands and guided demo.
- Modify `apps/cli/test/cli.test.ts`: CLI workflow and restart coverage.
- Modify `packages/sdk-ts/src/index.ts`: typed workflow methods.
- Modify `packages/sdk-ts/src/index.test.ts`: workflow tool-call coverage.
- Modify `sdk-py/src/melra/client.py`: workflow methods.
- Modify `sdk-py/tests/test_client.py`: Python workflow tool-call coverage.

### Evidence, documentation, and release

- Create `examples/workflows/restart-safe.json`: deterministic approval-gated example.
- Create `evals/manifests/durable-core-alpha-v1.json`: immutable crash/recovery scenarios.
- Create `evals/src/durable-core.ts`: deterministic evaluation runner and summary.
- Create `evals/src/durable-core.test.ts`: manifest and metric tests.
- Modify `evals/src/runner.ts`: expose the durable suite through the existing evaluator.
- Modify `README.md`, `ROADMAP.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/VALIDATION.md`, and `docs/decisions/0002-evidence-before-completion.md`: truthful product and release documentation.
- Modify package versions and lockfile for `0.3.0-alpha.0`.

---

### Task 1: Rename every public product surface to MELRA

**Files:**
- Modify: every tracked text file found by the legacy-identity inventory.
- Move: `sdk-py/src/<legacy-import>` to `sdk-py/src/melra`.
- Move: `benchmarks/browser-agent/src/<legacy-benchmark-package>` to
  `benchmarks/browser-agent/src/melra_browser_bench`.
- Replace: the two tracked logo and hero assets with
  `docs/assets/melra-logo.png` and `docs/assets/melra-hero.png`.
- Modify externally: GitHub repository name, description, topics, and local
  `origin` URL.

**Interfaces:**
- Consumes: the current pre-stable package, CLI, MCP, SDK, benchmark, container,
  and repository names.
- Produces: repository `XAGI-Lab/melra`, package scope `@melra/*`, executable
  `melra`, MCP prefix `melra_`, environment prefix `MELRA_`, Python package
  `melra`, and MELRA-only visual/product identity.

- [ ] **Step 1: Capture the complete failing identity inventory**

Build the previous lowercase identity without writing it into current product
documentation:

```bash
legacy="$(printf '\141\164\154\141\163')"
git grep -Il -i "$legacy" | sort
git ls-files | rg -i "$legacy"
```

Expected before migration: approximately 120 tracked text files and 17 tracked
paths. Save the exact command output with the task evidence; do not use the
approximate counts as a release assertion.

- [ ] **Step 2: Move identity-bearing source and asset paths**

```bash
legacy="$(printf '\141\164\154\141\163')"
git mv "sdk-py/src/${legacy}_mcp" sdk-py/src/melra
git mv \
  "benchmarks/browser-agent/src/${legacy}_browser_bench" \
  benchmarks/browser-agent/src/melra_browser_bench
git mv \
  "docs/assets/${legacy}-mcp-logo.png" \
  docs/assets/melra-logo.png
git mv \
  "docs/assets/${legacy}-mcp-hero.png" \
  docs/assets/melra-hero.png
```

- [ ] **Step 3: Rewrite code, package, protocol, configuration, and prose**

Apply these exact case-aware mappings to every tracked text file returned by
Step 1:

```text
legacy uppercase plus "_MCP" -> MELRA
legacy uppercase plus " MCP" -> MELRA
legacy lowercase plus "-mcp" -> melra
legacy lowercase plus "_mcp" -> melra
legacy title case plus "Mcp" -> Melra
"@" plus legacy lowercase plus "-mcp" -> @melra
legacy lowercase plus "_browser_bench" -> melra_browser_bench
legacy lowercase plus "-browser-bench" -> melra-browser-bench
remaining legacy title case -> Melra
remaining legacy uppercase -> MELRA
remaining legacy lowercase -> melra
```

This includes:

- Node package names and imports;
- Python distribution, imports, classes, and entry points;
- `melra` executable and root script;
- `melra_*` MCP tools;
- `MELRA_*` environment variables;
- `~/.melra`, `melra.sqlite`, caches, volumes, images, and artifact names;
- `MelraRuntime`, `MelraClient`, and `createMelraRuntime`;
- MCP client configuration key `melra`;
- GitHub links, badges, issue templates, release workflows, attestations, and
  source metadata;
- benchmark package, driver, seeds, result identities, and commands;
- README, brand guide, security, contribution, installation, release, and
  research documentation.

Regenerate lockfiles:

```bash
pnpm install --lockfile-only
uv lock --project sdk-py
uv lock --project benchmarks/browser-agent
```

- [ ] **Step 4: Replace the visual identity**

Required sub-skill: use `brandkit`.

Create:

- a transparent square MELRA symbol at `docs/assets/melra-logo.png`;
- a wide dark/light-safe hero at `docs/assets/melra-hero.png`;
- updated `BRAND.md` with the wordmark, full form, color values, spacing,
  minimum-size, accessibility, and prohibited-use rules.

Creative brief:

```text
MELRA — Modular Execution Layer for Reliable Autonomy.
Express interlocking execution modules, durable state transitions, and a
verified path through a modular system. Distinctive geometric mark, precise
engineering character, no robot head, no brain, no globe, no shield, no
gradient-heavy AI cliché, and no resemblance to the previous symbol.
```

Render and visually inspect both assets at their original resolution. Confirm
legibility at README size and on light and dark backgrounds.

- [ ] **Step 5: Update tests for the breaking alpha rename**

Rename test descriptions, expected tool names, command names, environment
variables, imports, temporary directories, benchmark fixtures, and snapshots.
The exact MCP tool list after this task remains six tools:

```text
melra_capabilities
melra_plan
melra_execute
melra_task_status
melra_task_cancel
melra_receipt
```

Do not add previous-name aliases. Add one test that rejects calling the former
tool prefix as an unknown MCP tool.

- [ ] **Step 6: Prove the tracked repository contains only MELRA**

```bash
legacy="$(printf '\141\164\154\141\163')"
test -z "$(git grep -Il -i "$legacy")"
test -z "$(git ls-files | rg -i "$legacy" || true)"
git grep -n "MELRA — Modular Execution Layer for Reliable Autonomy" \
  README.md BRAND.md
```

Expected: both legacy checks are empty and the full form appears in README and
the brand guide.

- [ ] **Step 7: Run repository-wide rename verification**

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm e2e
pnpm benchmark:browser:check
pnpm pack:check
pnpm docker:smoke
git diff --check
```

Expected: every command exits `0`; package tarballs, MCP tools, CLI output,
Python imports, benchmark entry point, Docker image, and documentation use
MELRA.

- [ ] **Step 8: Commit the complete local rename**

```bash
git add -A
git commit -m "feat!: rename the product to MELRA"
```

The commit body records:

```text
BREAKING CHANGE: package scope, executable, MCP tools, environment variables,
SDK imports, local data paths, and containers now use the MELRA identity.
```

- [ ] **Step 9: Rename and describe the GitHub repository**

The target was verified available on 2026-07-30. Execute:

```bash
legacy="$(printf '\141\164\154\141\163')"
gh api --method PATCH "repos/XAGI-Lab/${legacy}-mcp" \
  -f name=melra \
  -f description='MELRA — Modular Execution Layer for Reliable Autonomy. Durable, policy-governed execution with independently verified outcomes.'
gh repo edit XAGI-Lab/melra \
  --enable-issues \
  --enable-discussions \
  --add-topic autonomous-agents \
  --add-topic mcp \
  --add-topic workflow-engine \
  --add-topic verification \
  --add-topic local-first
git remote set-url origin https://github.com/XAGI-Lab/melra.git
```

Verify:

```bash
gh repo view XAGI-Lab/melra \
  --json name,url,description,visibility,defaultBranchRef
git remote -v
```

Expected: public repository `XAGI-Lab/melra`, default branch `main`, exact
description above, and both fetch/push URLs use the new repository.

### Task 2: Correct the repository narrative and establish the baseline

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/decisions/0002-evidence-before-completion.md`

**Interfaces:**
- Consumes: current `TaskController`, `SqliteStore`, `Verifier`, and six-tool MCP behavior.
- Produces: a truthful baseline that later tasks may update only after their release gates pass.

- [ ] **Step 1: Preserve the accurate uncommitted corrections**

Keep these facts:

```markdown
- Task records are persisted; executable task payloads do not survive restart.
- Caller-authored result predicates are not independent observation.
- Filesystem predicates independently re-read state; result, terminal, URL,
  and page predicates currently trust adapter-returned observations.
```

Remove README links to documents that are not part of the product.

- [ ] **Step 2: Perform a publication-boundary review**

Run:

```bash
git diff -- README.md ROADMAP.md CHANGELOG.md docs/ARCHITECTURE.md \
  docs/decisions/0002-evidence-before-completion.md
```

Expected: every changed line describes this product on its own merits and is
useful to users or contributors.

- [ ] **Step 3: Verify the pre-change runtime baseline**

Run:

```bash
pnpm check
pnpm e2e
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 4: Commit the truthful baseline**

```bash
git add README.md ROADMAP.md CHANGELOG.md docs/ARCHITECTURE.md \
  docs/decisions/0002-evidence-before-completion.md
git commit -m "docs: align the product narrative with runtime evidence"
```

### Task 3: Add strict workflow, event, and recovery contracts

**Files:**
- Create: `packages/protocol/src/workflow.test.ts`
- Modify: `packages/protocol/src/index.ts`

**Interfaces:**
- Consumes: `TaskRequestSchema`, `ApprovalResponseSchema`, and `EvidencePredicateSchema`.
- Produces: `WorkflowDefinitionSchema`, `WorkflowRunSchema`, `WorkflowEventSchema`, `WorkflowSnapshotSchema`, `EncryptedPayloadSchema`, `WorkflowAdvanceInputSchema`, and their inferred types.

- [ ] **Step 1: Write failing strict-schema tests**

Create tests that parse a two-node workflow and reject a smuggled field:

```ts
const definition = WorkflowDefinitionSchema.parse({
  schemaVersion: "1.0.0",
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  name: "restart-safe",
  nodes: [
    {
      id: "inspect",
      type: "operation",
      dependsOn: [],
      request: {
        goal: "Inspect the runtime",
        operation: { kind: "system", action: "info" },
      },
    },
    { id: "checkpoint", type: "checkpoint", dependsOn: ["inspect"] },
  ],
});
expect(definition.nodes).toHaveLength(2);
expect(() =>
  WorkflowDefinitionSchema.parse({ ...definition, executeAnyway: true }),
).toThrow();
```

Add tests that reject:

```ts
{ type: "bounded_loop", maxIterations: 0 }
{ type: "parallel", branches: [] }
{ type: "condition", sourceNodeId: "" }
```

- [ ] **Step 2: Run the protocol test and confirm failure**

Run:

```bash
pnpm --filter @melra/protocol test -- workflow.test.ts
```

Expected: FAIL because the workflow schemas are not exported from `index.ts`.

- [ ] **Step 3: Define the node and workflow schemas**

Use these exact public shapes:

```ts
export const WorkflowNodeIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);

const NodeBaseSchema = z.object({
  id: WorkflowNodeIdSchema,
  dependsOn: z.array(WorkflowNodeIdSchema).max(100).default([]),
});

export const OperationNodeSchema = NodeBaseSchema.extend({
  type: z.literal("operation"),
  request: TaskRequestSchema,
}).strict();

export const ApprovalNodeSchema = NodeBaseSchema.extend({
  type: z.literal("approval"),
  forNodeId: WorkflowNodeIdSchema,
}).strict();

export const ConditionNodeSchema = NodeBaseSchema.extend({
  type: z.literal("condition"),
  sourceNodeId: WorkflowNodeIdSchema,
  predicate: EvidencePredicateSchema,
  whenTrue: z.array(TaskRequestSchema).max(50).default([]),
  whenFalse: z.array(TaskRequestSchema).max(50).default([]),
}).strict();

export const ParallelNodeSchema = NodeBaseSchema.extend({
  type: z.literal("parallel"),
  branches: z.array(z.array(TaskRequestSchema).min(1).max(50)).min(2).max(20),
}).strict();

export const BoundedLoopNodeSchema = NodeBaseSchema.extend({
  type: z.literal("bounded_loop"),
  body: z.array(TaskRequestSchema).min(1).max(50),
  maxIterations: z.number().int().min(1).max(100),
  until: EvidencePredicateSchema.optional(),
}).strict();

export const CheckpointNodeSchema = NodeBaseSchema.extend({
  type: z.literal("checkpoint"),
}).strict();

export const CompensationNodeSchema = NodeBaseSchema.extend({
  type: z.literal("compensation"),
  forNodeId: WorkflowNodeIdSchema,
  request: TaskRequestSchema,
}).strict();
```

Define `WorkflowNodeSchema` as their discriminated union. Define
`WorkflowDefinitionSchema` with `schemaVersion: "1.0.0"`, UUID `id`, positive
integer `version`, bounded `name`, optional bounded `description`, one to 500
nodes, and an optional workflow budget using the existing task-budget fields.

- [ ] **Step 4: Define durable run, event, and encrypted-payload schemas**

Use:

```ts
export const WorkflowStatusSchema = z.enum([
  "draft", "planned", "awaiting_approval", "running", "paused", "suspended",
  "partially_complete", "verified_complete", "recovery_required", "failed",
  "cancelled",
]);

export const WorkflowNodeStatusSchema = z.enum([
  "pending", "ready", "awaiting_approval", "running", "verifying",
  "verified_complete", "skipped", "recovery_required", "failed", "cancelled",
  "compensated",
]);

export const EncryptedPayloadSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal("aes-256-gcm"),
  iv: z.string().regex(/^[A-Za-z0-9_-]+$/),
  ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/),
  tag: z.string().regex(/^[A-Za-z0-9_-]+$/),
}).strict();

export const WorkflowEventSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().uuid(),
  aggregateId: z.string().uuid(),
  sequence: z.number().int().positive(),
  traceId: z.string().uuid(),
  type: z.string().regex(/^[a-z]+(?:\\.[a-z_]+)+$/),
  data: z.record(z.unknown()),
  occurredAt: z.string().datetime(),
}).strict();
```

`WorkflowRunSchema` must include definition ID/version, status, `stateVersion`,
per-node status/task IDs, `traceId`, timestamps, and optional error, using:

```ts
export const WorkflowNodeStateSchema = z.object({
  status: WorkflowNodeStatusSchema,
  taskIds: z.array(z.string().uuid()).max(5_000).default([]),
  approval: ApprovalChallengeSchema.optional(),
  iterations: z.number().int().min(0).max(100).optional(),
  error: z.string().max(10_000).optional(),
}).strict();

export const WorkflowRunSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: z.string().uuid(),
  definitionId: z.string().uuid(),
  definitionVersion: z.number().int().positive(),
  status: WorkflowStatusSchema,
  stateVersion: z.number().int().positive(),
  nodes: z.record(WorkflowNodeIdSchema, WorkflowNodeStateSchema),
  traceId: z.string().uuid(),
  error: z.string().max(10_000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const WorkflowSnapshotSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  workflowId: z.string().uuid(),
  sequence: z.number().int().positive(),
  run: WorkflowRunSchema,
  createdAt: z.string().datetime(),
}).strict();
```

The snapshot schema refines `sequence === run.stateVersion`.

- [ ] **Step 5: Define strict MCP workflow inputs**

```ts
export const WorkflowPlanInputSchema = z.object({
  definition: WorkflowDefinitionSchema,
}).strict();

export const WorkflowAdvanceInputSchema = z.object({
  workflowId: z.string().uuid(),
  approvals: z.array(ApprovalResponseSchema).max(50).default([]),
}).strict();

export const WorkflowIdInputSchema = z.object({
  workflowId: z.string().uuid(),
}).strict();
```

- [ ] **Step 6: Export the contracts and run tests**

Export every inferred workflow type beside its schema in
`packages/protocol/src/index.ts`.

Run:

```bash
pnpm --filter @melra/protocol test
pnpm --filter @melra/protocol typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the public contracts**

```bash
git add packages/protocol/src/workflow.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add durable workflow contracts"
```

### Task 4: Seal exact executable payloads

**Files:**
- Create: `packages/runtime-core/src/payload-cipher.ts`
- Create: `packages/runtime-core/src/payload-cipher.test.ts`
- Create: `packages/server/src/payload-key.ts`
- Create: `packages/server/src/payload-key.test.ts`

**Interfaces:**
- Consumes: `EncryptedPayload` from `@melra/protocol` and `canonicalJson` from `@melra/receipt-schema`.
- Produces: `PayloadCipher.seal(value, context): EncryptedPayload`, `PayloadCipher.open<T>(payload, context): T`, and `loadPayloadKey(options): Promise<Buffer>`.

- [ ] **Step 1: Write failing cipher tests**

```ts
it("round-trips canonical payloads without embedding plaintext", () => {
  const cipher = new PayloadCipher(Buffer.alloc(32, 7));
  const sealed = cipher.seal(
    { value: "one-time-secret", count: 2 },
    "task:11111111-1111-4111-8111-111111111111:request",
  );
  expect(JSON.stringify(sealed)).not.toContain("one-time-secret");
  expect(
    cipher.open(
      sealed,
      "task:11111111-1111-4111-8111-111111111111:request",
    ),
  ).toEqual({ count: 2, value: "one-time-secret" });
});

it("rejects modified authentication tags", () => {
  const cipher = new PayloadCipher(Buffer.alloc(32, 9));
  const context = "task:22222222-2222-4222-8222-222222222222:request";
  const sealed = cipher.seal({ value: "protected" }, context);
  expect(() =>
    cipher.open({ ...sealed, tag: sealed.tag.replace(/.$/, "A") }, context),
  )
    .toThrow("task_payload_authentication_failed");
});
```

Add a context-swap test that seals for task A and attempts to open for task B;
it must fail authentication.

- [ ] **Step 2: Run and confirm cipher-test failure**

Run:

```bash
pnpm --filter @melra/runtime-core test -- payload-cipher.test.ts
```

Expected: FAIL because `PayloadCipher` does not exist.

- [ ] **Step 3: Implement AES-256-GCM sealing**

Implement with `randomBytes(12)`, `createCipheriv`, `createDecipheriv`, and
base64url encoding. Reject keys whose length is not 32 bytes. Use
`canonicalJson(value)` as plaintext and bind the UTF-8 context with
`cipher.setAAD()` and `decipher.setAAD()` so envelopes cannot be swapped between
tasks, workflows, requests, and results. Convert authentication failures to the
stable error `task_payload_authentication_failed`.

```ts
export class PayloadCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error("payload_key_must_be_32_bytes");
  }

  seal(value: unknown, context: string): EncryptedPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(canonicalJson(value), "utf8"),
      cipher.final(),
    ]);
    return {
      version: 1,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    };
  }
}
```

The `open<T>(payload, context)` method validates with
`EncryptedPayloadSchema.parse`, sets the same AAD, authenticates before parsing
JSON, and returns `T`.

- [ ] **Step 4: Write failing key-management tests**

Test:

```ts
const first = await loadPayloadKey({ dataDirectory: root, environment: {} });
const second = await loadPayloadKey({ dataDirectory: root, environment: {} });
expect(first).toEqual(second);
expect(first).toHaveLength(32);
if (process.platform !== "win32") {
  expect((await stat(join(root, "payload.key"))).mode & 0o077).toBe(0);
}
```

Also assert that invalid `MELRA_PAYLOAD_KEY` and a symlinked key path throw
stable errors.

- [ ] **Step 5: Implement local key loading**

`loadPayloadKey` accepts:

```ts
export interface PayloadKeyOptions {
  dataDirectory: string;
  environment: NodeJS.ProcessEnv;
}
```

If `MELRA_PAYLOAD_KEY` exists, decode base64url and require exactly 32
bytes. Otherwise create `payload.key` with a random 32-byte base64url value
using `open(path, "wx", 0o600)`. If creation races, reopen the regular file
with `O_NOFOLLOW` where supported. Reject non-files and permissive POSIX modes.
On Windows, require a regular file under the user-owned data directory and
document that deployments needing external key custody must set
`MELRA_PAYLOAD_KEY`.

- [ ] **Step 6: Run focused tests**

```bash
pnpm --filter @melra/runtime-core test -- payload-cipher.test.ts
pnpm --filter @melra/server test -- payload-key.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit payload protection**

```bash
git add packages/runtime-core/src/payload-cipher.ts \
  packages/runtime-core/src/payload-cipher.test.ts \
  packages/server/src/payload-key.ts packages/server/src/payload-key.test.ts
git commit -m "feat(core): encrypt durable execution payloads"
```

### Task 5: Add transactional events, workflow projections, and payload storage

**Files:**
- Modify: `packages/storage-sqlite/src/index.ts`
- Modify: `packages/storage-sqlite/src/index.test.ts`
- Create: `packages/storage-sqlite/src/workflow-store.test.ts`

**Interfaces:**
- Consumes: `EncryptedPayload`, `WorkflowDefinition`, `WorkflowEvent`, `WorkflowRun`, and `WorkflowSnapshot`.
- Produces: storage methods listed below with atomic transition and idempotency guarantees.

- [ ] **Step 1: Write failing migration and persistence tests**

Create a legacy database with the current `tasks`, `receipts`, `certificates`,
and `memories` tables. Open it through `SqliteStore`, then assert:

```ts
expect(
  store.database.prepare(
    "SELECT version FROM schema_migrations ORDER BY version",
  ).all(),
).toEqual([{ version: 1 }]);
```

Save encrypted task request and result payloads, plus an encrypted workflow
definition, and assert the database bytes do not contain their original
secrets:

```ts
store.saveTaskPayload(taskId, sealedRequest, now);
store.saveTaskExecutionResult(verifyingTask, sealedResult);
store.createWorkflow(redactedDefinition, sealedWorkflow, run, initialEvents);
store.close();
expect(await readFile(databasePath, "utf8")).not.toContain("one-time-secret");
```

- [ ] **Step 2: Write failing event atomicity tests**

Test monotonic append:

```ts
store.createWorkflow(redactedDefinition, sealedWorkflow, run, [createdEvent]);
store.transitionWorkflow(run.id, 1, nextRun, [plannedEvent]);
expect(store.listWorkflowEvents(run.id).map((event) => event.sequence))
  .toEqual([1, 2]);
expect(() => store.transitionWorkflow(run.id, 1, staleRun, [staleEvent]))
  .toThrow("workflow_state_conflict");
```

Test rollback by attempting two events with the same `(aggregate_id, sequence)`
and asserting neither the projection nor the first event from that transaction
was committed.

- [ ] **Step 3: Run storage tests and confirm failure**

```bash
pnpm --filter @melra/storage-sqlite test
```

Expected: FAIL because the durable workflow tables and methods do not exist.

- [ ] **Step 4: Add migration version 1**

Create these tables and constraints in the existing `migrate()` path:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_payloads (
  task_id TEXT PRIMARY KEY,
  request_payload TEXT NOT NULL,
  result_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_payloads (
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(workflow_id, workflow_version)
);
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(id, version)
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  state_version INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  trace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  UNIQUE(aggregate_id, sequence)
);
CREATE INDEX IF NOT EXISTS workflow_events_aggregate
  ON workflow_events(aggregate_id, sequence);
CREATE TABLE IF NOT EXISTS workflow_snapshots (
  workflow_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(workflow_id, sequence)
);
CREATE TABLE IF NOT EXISTS idempotency_commits (
  idempotency_key TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  committed_at TEXT NOT NULL
);
```

Insert migration version `1` only after all statements succeed in an immediate
transaction.

- [ ] **Step 5: Add exact storage methods**

```ts
saveTaskPayload(taskId: string, payload: EncryptedPayload, at: string): void
getTaskPayload(taskId: string): EncryptedPayload | undefined
saveTaskExecutionResult(
  task: TaskRecord,
  payload: EncryptedPayload,
): void
getTaskResult(taskId: string): EncryptedPayload | undefined
deleteTaskPayload(taskId: string): void
listInterruptedTasks(): TaskRecord[]
getWorkflowPayload(id: string, version: number): EncryptedPayload | undefined
createWorkflow(
  redactedDefinition: WorkflowDefinition,
  payload: EncryptedPayload,
  run: WorkflowRun,
  events: WorkflowEvent[],
): void
getWorkflowDefinition(id: string, version: number): WorkflowDefinition | undefined
getWorkflowRun(id: string): WorkflowRun | undefined
listWorkflowEvents(id: string, afterSequence?: number): WorkflowEvent[]
saveWorkflowSnapshot(snapshot: WorkflowSnapshot): void
getLatestWorkflowSnapshot(id: string): WorkflowSnapshot | undefined
transitionWorkflow(
  id: string,
  expectedStateVersion: number,
  run: WorkflowRun,
  events: WorkflowEvent[],
): void
commitIdempotency(key: string, taskId: string, attempt: number, at: string): boolean
```

`createWorkflow` writes the redacted definition, encrypted exact definition,
initial projection, and initial events in one transaction.
`transitionWorkflow` uses `BEGIN IMMEDIATE`, verifies the stored
`state_version`, appends every event, updates the projection, and commits.
Every thrown error rolls back.

- [ ] **Step 6: Validate parsed reads**

Every JSON read passes through its public Zod schema. Corrupt stored workflow,
event, snapshot, or payload data throws `stored_<record>_invalid` rather than
returning unchecked data.

- [ ] **Step 7: Run storage tests**

```bash
pnpm --filter @melra/storage-sqlite test
pnpm --filter @melra/storage-sqlite typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit durable storage**

```bash
git add packages/storage-sqlite/src/index.ts \
  packages/storage-sqlite/src/index.test.ts \
  packages/storage-sqlite/src/workflow-store.test.ts
git commit -m "feat(storage): persist workflow events atomically"
```

### Task 6: Make planned tasks executable after restart

**Files:**
- Modify: `packages/runtime-core/src/task-controller.ts`
- Modify: `packages/runtime-core/src/task-controller.test.ts`
- Modify: `packages/runtime-core/src/index.ts`
- Modify: `packages/protocol/src/index.ts`

**Interfaces:**
- Consumes: `PayloadCipher`, `SqliteStore.saveTaskPayload()`, and `SqliteStore.getTaskPayload()`.
- Produces: restart-safe `TaskController.preflight()`, `plan()`, `execute()`, `verifyPersisted()`, and `recoverInterrupted()`.

- [ ] **Step 1: Replace the existing restart-gap expectation with a failing success test**

Create a file-backed store, plan with controller A, close it, open controller B
with the same key, and execute:

```ts
const planned = controllerA.plan(request);
storeA.close();
const storeB = new SqliteStore(databasePath);
const controllerB = await controller(storeB, key, executor);
const result = await controllerB.execute(planned.id);
expect(result.task.status).toBe("verified_success");
expect(executor).toHaveBeenCalledWith(request.operation, expect.any(AbortSignal));
```

- [ ] **Step 2: Add failing plaintext and wrong-key tests**

After planning a task containing `"one-time-secret"`, read the database bytes
and assert absence. Reopen with another key and expect
`task_payload_authentication_failed`.

- [ ] **Step 3: Run the focused test and confirm failure**

```bash
pnpm --filter @melra/runtime-core test -- task-controller.test.ts
```

Expected: FAIL with `task_payload_unavailable_after_restart`.

- [ ] **Step 4: Replace `pendingRequests` with durable encrypted payloads**

Change the constructor to:

```ts
constructor(
  private readonly store: SqliteStore,
  private readonly policy: LocalPolicy,
  private readonly executor: OperationExecutor,
  private readonly verifier: Verifier,
  private readonly payloadCipher: PayloadCipher,
) {}
```

In `plan()`:

```ts
this.store.saveTask(task);
if (task.status !== "policy_blocked") {
  this.store.saveTaskPayload(
    id,
    this.payloadCipher.seal(request, `task:${id}:request`),
    timestamp,
  );
}
```

In `execute()`:

```ts
const sealed = this.store.getTaskPayload(taskId);
if (sealed === undefined) throw new Error("task_payload_not_found");
const request = TaskRequestSchema.parse(
  this.payloadCipher.open(sealed, `task:${taskId}:request`),
);
```

After the adapter returns and before verification, seal its exact result with
context `task:<taskId>:result` and persist it together with the transition to
`verifying`. Add a storage transaction method that saves the encrypted result
and redacted task projection atomically. Workflow conditions may later open the
exact result; status, receipts, events, and certificates continue to expose
only redacted data.

Delete `pendingRequests` and every write/delete against it. Do not automatically
delete encrypted request or result payloads in this slice because workflow
conditions, recovery, and audit may still require them. Expose only the scoped
storage deletion method; the later retention plan will bind automatic deletion
to documented retention policy.

- [ ] **Step 5: Add persisted-result verification**

```ts
async verifyPersisted(
  taskId: string,
  predicates: EvidencePredicate[],
): Promise<{ verified: boolean; evidence: EvidenceItem[] }> {
  const sealed = this.store.getTaskResult(taskId);
  const result = sealed === undefined
    ? {}
    : this.payloadCipher.open<Record<string, unknown>>(
        sealed,
        `task:${taskId}:result`,
      );
  return await this.verifier.verify(predicates, result);
}
```

This method reuses the existing verifier and gives workflow conditions and
recovery one authenticated durable observation source.

- [ ] **Step 6: Add side-effect-free policy preflight**

```ts
preflight(request: TaskRequest): PolicyDecision {
  const capabilities = this.executor.capabilities?.();
  if (capabilities !== undefined && !capabilities.has(request.operation.kind)) {
    throw new Error(`operation_capability_unavailable:${request.operation.kind}`);
  }
  return evaluatePolicy(
    "00000000-0000-4000-8000-000000000000",
    request,
    this.policy,
  ).decision;
}
```

Preflight performs schema, operation classification, forbidden-effect, evidence,
and policy checks without persisting a task or creating a reusable approval.
Extend `OperationExecutor` compatibly with:

```ts
capabilities?(): ReadonlySet<Operation["kind"]>;
```

`RuntimeRouter` returns the operation kinds it actually routes. Test executors
return explicit sets, enabling a workflow with a missing capability to fail
before any task executes. Existing third-party executors that omit the optional
method remain compatible for this alpha.

Call `preflight()` at the start of `plan()` before creating an ID or writing
storage. Continue using `evaluatePolicy()` with the real task ID afterward so a
confirmation challenge binds the persisted task.

- [ ] **Step 7: Rebind approval on every execution**

Recompute policy and the action digest from the decrypted canonical payload.
If the current digest differs from `task.approval.actionDigest`, throw
`approval_action_digest_mismatch` before adapter execution.

- [ ] **Step 8: Add interrupted-task recovery**

Extend `TaskStatusSchema` with `recovery_required`.

```ts
async recoverInterrupted(): Promise<TaskRecord[]> {
  const recovered: TaskRecord[] = [];
  for (const task of this.store.listInterruptedTasks()) {
    const request = this.loadRequest(task.id);
    const effect = classifyOperation(request.operation).effect;
    task.status = effect === "read" ? "planned" : "recovery_required";
    task.error = effect === "read"
      ? "interrupted_read_ready_for_retry"
      : "interrupted_mutation_requires_reconciliation";
    task.updatedAt = now();
    this.store.saveTask(task);
    recovered.push(task);
  }
  return recovered;
}
```

`listInterruptedTasks()` returns tasks in `running` or `verifying`. Recovery
does not execute them.

- [ ] **Step 9: Run the controller suite**

```bash
pnpm --filter @melra/runtime-core test
pnpm --filter @melra/runtime-core typecheck
```

Expected: PASS and no test expects
`task_payload_unavailable_after_restart`.

- [ ] **Step 10: Commit restart-safe tasks**

```bash
git add packages/runtime-core/src/task-controller.ts \
  packages/runtime-core/src/task-controller.test.ts \
  packages/runtime-core/src/index.ts packages/protocol/src/index.ts
git commit -m "feat(core): recover durable task payloads after restart"
```

### Task 7: Validate workflow graphs deterministically

**Files:**
- Create: `packages/runtime-core/src/workflow-graph.ts`
- Create: `packages/runtime-core/src/workflow-graph.test.ts`
- Modify: `packages/runtime-core/src/index.ts`

**Interfaces:**
- Consumes: `WorkflowDefinition` and `WorkflowNode`.
- Produces: `validateWorkflow(definition): WorkflowGraph` and `readyNodeIds(graph, states): string[]`.

- [ ] **Step 1: Write failing graph tests**

Test a valid graph:

```ts
expect(validateWorkflow(definition).layers).toEqual([
  ["inspect"],
  ["write-a", "write-b"],
  ["checkpoint"],
]);
```

Test exact errors:

```text
workflow_node_id_duplicate
workflow_dependency_missing:<node>:<dependency>
workflow_dependency_cycle
workflow_node_self_dependency:<node>
workflow_approval_target_missing:<node>
workflow_approval_must_precede_target:<node>
workflow_compensation_target_missing:<node>
workflow_compensation_target_not_operation:<node>
workflow_condition_source_missing:<node>
workflow_condition_source_not_operation:<node>
workflow_node_limit_exceeded
```

- [ ] **Step 2: Run and confirm graph-test failure**

```bash
pnpm --filter @melra/runtime-core test -- workflow-graph.test.ts
```

Expected: FAIL because `validateWorkflow` does not exist.

- [ ] **Step 3: Implement Kahn topological sorting**

Build a node map, validate all references, calculate indegrees, and process
ready IDs in lexical order. Emit lexical layers for deterministic planning.
Reject a remaining nonzero indegree as `workflow_dependency_cycle`.

```ts
export interface WorkflowGraph {
  nodes: ReadonlyMap<string, WorkflowNode>;
  layers: readonly (readonly string[])[];
}
```

Approval nodes must appear in the dependency ancestry of their `forNodeId`.
Compensation targets and condition sources must exist and be operation nodes.
Compensation nodes are excluded from normal ready-node selection and run only
during rollback. Top-level nodes are bounded to 500 by the schema.

- [ ] **Step 4: Implement ready-node selection**

```ts
export function readyNodeIds(
  graph: WorkflowGraph,
  states: Record<string, WorkflowNodeState>,
): string[] {
  return [...graph.nodes.values()]
    .filter((node) =>
      node.type !== "compensation" &&
      states[node.id]?.status === "pending" &&
      node.dependsOn.every((id) =>
        ["verified_complete", "skipped", "compensated"].includes(states[id]!.status),
      ),
    )
    .map((node) => node.id)
    .sort();
}
```

- [ ] **Step 5: Run graph tests**

```bash
pnpm --filter @melra/runtime-core test -- workflow-graph.test.ts
pnpm --filter @melra/runtime-core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit graph validation**

```bash
git add packages/runtime-core/src/workflow-graph.ts \
  packages/runtime-core/src/workflow-graph.test.ts \
  packages/runtime-core/src/index.ts
git commit -m "feat(core): validate bounded workflow graphs"
```

### Task 8: Persist workflow planning and projections

**Files:**
- Create: `packages/runtime-core/src/workflow-events.ts`
- Create: `packages/runtime-core/src/workflow-events.test.ts`
- Create: `packages/runtime-core/src/workflow-controller.ts`
- Create: `packages/runtime-core/src/workflow-controller.test.ts`
- Modify: `packages/runtime-core/src/index.ts`

**Interfaces:**
- Consumes: `TaskController`, `SqliteStore`, `validateWorkflow`, and workflow contracts.
- Produces: `applyWorkflowEvent()`, `rebuildWorkflow()`, `WorkflowController.plan()`, `status()`, `events()`, `advance()`, and `cancel()`.

- [ ] **Step 1: Write a failing planning test**

```ts
const run = controller.plan(definition);
expect(run.status).toBe("planned");
expect(Object.values(run.nodes).every((node) => node.status === "pending"))
  .toBe(true);
expect(store.listWorkflowEvents(run.id).map((event) => event.type)).toEqual([
  "workflow.created",
  "workflow.status_changed",
]);
```

Add a workflow containing a policy-denied nested branch request and assert
`plan()` throws `workflow_policy_blocked:<nodeId>` before a definition, run,
event, task, or payload row is written.

- [ ] **Step 2: Run and confirm planning-test failure**

```bash
pnpm --filter @melra/runtime-core test -- workflow-controller.test.ts
```

Expected: FAIL because `WorkflowController` does not exist.

- [ ] **Step 3: Define replayable state events**

Use these state-bearing event types:

```text
workflow.created
workflow.status_changed
workflow.node_changed
workflow.checkpoint_saved
```

`workflow.created` contains the initial redacted `WorkflowRun`.
`workflow.status_changed` contains `from`, `to`, and optional redacted `error`.
`workflow.node_changed` contains `nodeId`, `from`, and the complete new
`WorkflowNodeState`. `workflow.checkpoint_saved` contains only the snapshot
sequence.

```ts
export function applyWorkflowEvent(
  current: WorkflowRun | undefined,
  event: WorkflowEvent,
): WorkflowRun

export function rebuildWorkflow(
  snapshot: WorkflowSnapshot | undefined,
  events: WorkflowEvent[],
): WorkflowRun
```

The reducer requires contiguous sequences, validates each event data shape,
sets `stateVersion` to the last applied event sequence, and rejects mismatched
`from` states. It never decrypts payloads.

- [ ] **Step 4: Write and pass replay tests**

Start with `workflow.created`, apply node and status changes, and assert the
rebuilt run equals the stored projection. Reject a missing sequence, duplicate
sequence, unknown event type, invalid node ID, and mismatched prior state.

Run:

```bash
pnpm --filter @melra/runtime-core test -- workflow-events.test.ts
```

Expected: PASS after the minimal reducer implementation.

- [ ] **Step 5: Define the controller surface**

```ts
export class WorkflowController {
  constructor(
    private readonly store: SqliteStore,
    private readonly tasks: TaskController,
    private readonly payloadCipher: PayloadCipher,
  ) {}

  plan(definition: WorkflowDefinition): WorkflowRun;
  status(workflowId: string): WorkflowRun;
  events(workflowId: string, afterSequence?: number): WorkflowEvent[];
  async advance(
    workflowId: string,
    approvals?: ApprovalResponse[],
  ): Promise<WorkflowAdvanceResult>;
  cancel(workflowId: string): WorkflowRun;
}

export interface WorkflowAdvanceResult {
  run: WorkflowRun;
  tasks: TaskRecord[];
  events: WorkflowEvent[];
}
```

- [ ] **Step 6: Create planning events and initial projection**

Before persistence, collect every request from operation, condition, parallel,
bounded-loop, and compensation nodes and call `TaskController.preflight()`.
Reject the whole definition if any decision is `deny`.

Use `randomUUID()` for run and trace IDs. Initialize every node as `pending`.
Create the draft projection at `stateVersion: 1` in `workflow.created`
sequence `1` and a
`workflow.status_changed` event from `draft` to `planned` at sequence `2`, seal
the exact definition with context
`workflow:<definitionId>:<version>:definition`, create a separately redacted
definition, then call `store.createWorkflow()`.

Event data contains only definition ID/version, node IDs/types, and redacted
metadata; it never contains executable request payloads.

- [ ] **Step 7: Add transactional transition helper**

Inside the controller, make one helper:

```ts
private transition(
  current: WorkflowRun,
  mutate: (draft: WorkflowRun, emit: EmitEvent) => void,
): WorkflowRun
```

Assign event sequences after the current `stateVersion`, reduce them against
the validated projection, validate the new run, and confirm
`rebuildWorkflow()` produces the same projection, then call
`store.transitionWorkflow()`. A state conflict is returned unchanged to the
caller for a fresh read; it is not hidden by retrying a mutation.

- [ ] **Step 8: Add status, event, and cancellation behavior**

Unknown IDs throw `workflow_not_found`. Cancellation marks pending, ready, and
awaiting nodes `cancelled`, cooperatively cancels their task IDs, emits
`workflow.cancelled`, and never changes a verified-complete workflow.

- [ ] **Step 9: Run planning tests**

```bash
pnpm --filter @melra/runtime-core test -- workflow-controller.test.ts
pnpm --filter @melra/runtime-core typecheck
```

Expected: planning, persistence, event, conflict, and cancellation tests PASS.

- [ ] **Step 10: Commit workflow projections**

```bash
git add packages/runtime-core/src/workflow-events.ts \
  packages/runtime-core/src/workflow-events.test.ts \
  packages/runtime-core/src/workflow-controller.ts \
  packages/runtime-core/src/workflow-controller.test.ts \
  packages/runtime-core/src/index.ts
git commit -m "feat(core): persist workflow state transitions"
```

### Task 9: Execute every MELRA Durable Core workflow node

**Files:**
- Modify: `packages/runtime-core/src/workflow-controller.ts`
- Modify: `packages/runtime-core/src/workflow-controller.test.ts`

**Interfaces:**
- Consumes: `TaskController.plan()`, `TaskController.execute()`, graph layers, approvals, and independent verifier results.
- Produces: bounded advancement for operation, approval, condition, parallel, bounded-loop, checkpoint, and compensation nodes.

- [ ] **Step 1: Add failing operation and checkpoint tests**

Advance a two-operation workflow once per scheduling wave. Assert:

```ts
expect(first.run.nodes.inspect.status).toBe("verified_complete");
expect(first.run.nodes.write.status).toBe("pending");
expect(second.run.nodes.write.status).toBe("awaiting_approval");
expect(second.run.status).toBe("awaiting_approval");
```

After exact approval, assert the write and checkpoint become
`verified_complete` and the run becomes `verified_complete`.

- [ ] **Step 2: Add failing condition, parallel, and bounded-loop tests**

Use deterministic in-memory operations and assert:

```ts
expect(conditionResult.executedGoals).toEqual(["inspect", "true-branch"]);
expect(parallelResult.maxConcurrent).toBe(2);
expect(loopResult.iterations).toBe(3);
expect(loopResult.run.status).toBe("verified_complete");
```

The loop test uses `maxIterations: 3` and no `until`, proving the hard bound.
Add a loop with `until` satisfied after iteration two.

- [ ] **Step 3: Add failing compensation tests**

Create a workflow whose second operation fails after the first operation
verified. Add a compensation node targeting the first operation. Assert its
request runs once, its receipt exists, its node state is `compensated`, and the
workflow remains `failed`, never `verified_complete`. In a successful run, the
same compensation node becomes `skipped` without adapter execution.

- [ ] **Step 4: Implement one scheduling wave per `advance()`**

An advance:

1. reloads and validates the run and definition;
2. finds the next ready top-level layer;
3. plans tasks for that layer without executing approval-blocked tasks;
4. executes eligible independent tasks concurrently;
5. persists each node result and event;
6. returns after that one layer or after encountering approval, failure, or
   recovery-required state.

This boundary makes restart tests deterministic and keeps each transaction
short.

- [ ] **Step 5: Implement node semantics**

- `operation`: one governed `TaskController` task.
- `approval`: plan its referenced operation early; copy its challenge into the
  node state and execute only after an exact response.
- `condition`: call `TaskController.verifyPersisted()` for the source task and
  pre-bound predicate, execute only the selected request list, and record the
  unselected branch as skipped.
- `parallel`: execute branch request lists with `Promise.all`, preserving result
  order by branch and request index.
- `bounded_loop`: execute its body sequentially, stop on a satisfied `until`,
  and never exceed `maxIterations`.
- `checkpoint`: save a `WorkflowSnapshot` at the latest event sequence.
- `compensation`: exclude it from normal scheduling; execute only when its
  referenced verified operation needs rollback, otherwise mark it skipped when
  the workflow completes successfully.

Every nested request still goes through `TaskController`; no node calls an
adapter directly.

- [ ] **Step 6: Derive workflow completion conservatively**

Set `verified_complete` only if every required node is one of
`verified_complete`, `skipped`, or `compensated` and no required task lacks a
certificate with `VERIFIED_SUCCESS`. A task in `partial`, `failed`,
`recovery_required`, `cancelled`, or `budget_exhausted` prevents success.

- [ ] **Step 7: Run node-semantics tests**

```bash
pnpm --filter @melra/runtime-core test -- workflow-controller.test.ts
```

Expected: every node-type, budget, failure, compensation, and conservative
completion test passes.

- [ ] **Step 8: Commit executable workflows**

```bash
git add packages/runtime-core/src/workflow-controller.ts \
  packages/runtime-core/src/workflow-controller.test.ts
git commit -m "feat(core): execute bounded verified workflows"
```

### Task 10: Recover workflows after crashes without duplicating effects

**Files:**
- Modify: `packages/runtime-core/src/task-controller.ts`
- Modify: `packages/runtime-core/src/task-controller.test.ts`
- Modify: `packages/runtime-core/src/workflow-controller.ts`
- Modify: `packages/runtime-core/src/workflow-controller.test.ts`
- Modify: `packages/protocol/src/index.ts`

**Interfaces:**
- Consumes: interrupted-task recovery, task idempotency keys, workflow events, and snapshots.
- Produces: `WorkflowController.recoverInterrupted(): Promise<WorkflowRun[]>`.

- [ ] **Step 1: Write failing interrupted-read and interrupted-mutation tests**

Manually persist two tasks as `running`. Restart and assert:

```ts
expect(await tasks.recoverInterrupted()).toMatchObject([
  { status: "planned", error: "interrupted_read_ready_for_retry" },
  {
    status: "recovery_required",
    error: "interrupted_mutation_requires_reconciliation",
  },
]);
```

- [ ] **Step 2: Write a failing independently reconciled mutation test**

Persist a file-write task as `verifying`, create the expected file, restart,
and call recovery. The filesystem verifier must re-open the path and mark the
task `verified_success` without executing the write again. Assert the executor
call count remains zero.

Automatic mutation reconciliation in this slice is limited to predicates whose
verifier independently re-observes external state (`file_exists`,
`file_absent`, and `file_hash`). A task requiring adapter-returned result, URL,
page, or terminal observations remains `recovery_required` until the later
authoritative-observer plan supplies that verifier.

- [ ] **Step 3: Bind task idempotency keys**

Derive:

```ts
sha256({
  workflowId,
  nodeId,
  iteration,
  branch,
  request: canonicalRequest,
})
```

Extend `TaskRecord` with optional `idempotencyKey` and `attempt`. Extend
`TaskController.plan()` with an optional second argument:

```ts
plan(
  request: TaskRequest,
  options: { idempotencyKey?: string; attempt?: number } = {},
): TaskRecord
```

Persist the key and attempt on `TaskRecord`. Before committing a successful
attempt, call `store.commitIdempotency()`. A false return means another attempt
already committed and this attempt becomes `cancelled` with
`duplicate_attempt_prevented`. The workflow controller always supplies the
derived key; existing standalone callers remain compatible.

- [ ] **Step 4: Recover workflow projections**

`WorkflowController.recoverInterrupted()`:

1. calls task recovery;
2. loads runs in `running` or `awaiting_approval`;
3. rebuilds each run from the latest valid snapshot plus subsequent events;
4. compares the rebuilt state with the stored projection;
5. repairs a stale projection through one recovery transition;
6. maps recovered task states to nodes;
7. marks any unresolved mutation `recovery_required`;
8. emits `workflow.recovered` or `workflow.recovery_required`.

Corrupt snapshots are ignored only when replay from sequence one succeeds.
Corrupt events fail closed with `workflow_event_history_invalid`.

- [ ] **Step 5: Add crash-point tests**

Inject failures:

```text
after task planned
after approval recorded
after node marked running
after adapter returned
after receipt persisted
after evidence verified
before workflow projection update
after workflow projection update
```

For each crash point, reopen the same SQLite database and assert one of:

- safe retry for a read;
- verified reconciliation without re-execution;
- explicit `recovery_required`;
- terminal state with exactly one idempotency commit.

- [ ] **Step 6: Run recovery suites**

```bash
pnpm --filter @melra/runtime-core test
pnpm --filter @melra/storage-sqlite test
```

Expected: PASS with no duplicated mutation in any crash case.

- [ ] **Step 7: Commit crash recovery**

```bash
git add packages/runtime-core/src/task-controller.ts \
  packages/runtime-core/src/task-controller.test.ts \
  packages/runtime-core/src/workflow-controller.ts \
  packages/runtime-core/src/workflow-controller.test.ts \
  packages/protocol/src/index.ts
git commit -m "feat(core): reconcile interrupted workflows safely"
```

### Task 11: Wire runtime startup, MCP, and CLI workflow interfaces

**Files:**
- Modify: `packages/server/src/runtime.ts`
- Modify: `packages/server/src/mcp-server.ts`
- Modify: `packages/server/test/e2e.test.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/test/cli.test.ts`
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/src/index.test.ts`

**Interfaces:**
- Consumes: `loadPayloadKey`, `PayloadCipher`, `WorkflowController`, and workflow MCP input schemas.
- Produces: four workflow MCP tools and CLI workflow commands.

- [ ] **Step 1: Write failing runtime-wiring test**

Create a runtime, plan a task, close it, recreate the runtime with the same data
directory, and execute the task. Assert success and a stable key file.

- [ ] **Step 2: Wire key, cipher, controllers, and startup recovery**

`createMelraRuntime()` must:

```ts
const key = await loadPayloadKey({
  dataDirectory,
  environment: options.environment ?? process.env,
});
const cipher = new PayloadCipher(key);
const controller = new TaskController(store, policy, router, verifier, cipher);
const workflows = new WorkflowController(store, controller, cipher);
await controller.recoverInterrupted();
await workflows.recoverInterrupted();
```

Add `workflows` to `MelraRuntime`. Recovery runs before serving any interface.
Add `RuntimeRouter.capabilities()` returning the routed operation-kind set:

```ts
new Set<Operation["kind"]>([
  "file", "terminal", "browser", "memory", "computer", "system",
])
```

The later worker plan will refine device-specific capability advertisements;
this local set states which governed adapters are installed in the process.

- [ ] **Step 3: Add strict workflow MCP tools**

Register:

```text
melra_workflow_plan
melra_workflow_advance
melra_workflow_status
melra_workflow_cancel
```

All use the strict schemas from Task 3. Update `TOOL_NAMES` and capabilities to
advertise exactly ten tools. Do not expose raw payloads or encryption material.

- [ ] **Step 4: Write failing CLI tests**

Test:

```bash
melra workflow plan --definition examples/workflows/restart-safe.json
melra workflow advance <workflow-id>
melra workflow inspect <workflow-id>
melra workflow cancel <workflow-id>
```

Assert JSON output, stable nonzero exit codes for approval/recovery/failure, and
unknown ID handling.

- [ ] **Step 5: Implement CLI workflow commands**

Add `readWorkflowDefinition()` using `WorkflowDefinitionSchema.parse`.
`workflow advance` accepts repeated
`--approval <approval-id>:<exact-phrase>` values and never logs the phrase.

Use exit codes:

```text
0 verified_complete or successful inspection
2 failed, partial, cancelled, or recovery_required
3 awaiting_approval
4 policy_blocked
1 input or runtime error
```

- [ ] **Step 6: Add a guided local demo command**

`melra demo durable-core` prints the example path and runs the same
application-service calls as the CLI workflow commands. It must not use
test-only or adapter-bypass code.

- [ ] **Step 7: Run interface suites**

```bash
pnpm --filter @melra/server test
pnpm --filter @melra/cli test
pnpm --filter @melra/protocol test
```

Expected: PASS and the MCP tool list contains ten exact names.

- [ ] **Step 8: Commit public interfaces**

```bash
git add packages/server/src/runtime.ts packages/server/src/mcp-server.ts \
  packages/server/test/e2e.test.ts apps/cli/src/index.ts \
  apps/cli/test/cli.test.ts \
  packages/protocol/src/index.ts packages/protocol/src/index.test.ts
git commit -m "feat: expose durable workflows through MCP and CLI"
```

### Task 12: Extend the TypeScript and Python SDKs

**Files:**
- Modify: `packages/sdk-ts/src/index.ts`
- Modify: `packages/sdk-ts/src/index.test.ts`
- Modify: `sdk-py/src/melra/client.py`
- Modify: `sdk-py/tests/test_client.py`

**Interfaces:**
- Consumes: the four MCP tools from Task 11.
- Produces: typed SDK methods for plan, advance, status, and cancellation.

- [ ] **Step 1: Write failing TypeScript SDK tests**

Assert the mock client receives:

```ts
await melra.planWorkflow(definition);
await melra.advanceWorkflow(workflowId, [approval]);
await melra.workflowStatus(workflowId);
await melra.cancelWorkflow(workflowId);
```

with exact MCP names and arguments.

- [ ] **Step 2: Add TypeScript methods**

```ts
async planWorkflow(definition: WorkflowDefinition): Promise<WorkflowRun>
async advanceWorkflow(
  workflowId: string,
  approvals?: ApprovalResponse[],
): Promise<WorkflowAdvanceResult>
async workflowStatus(workflowId: string): Promise<WorkflowRun>
async cancelWorkflow(workflowId: string): Promise<WorkflowRun>
```

Parse returned records with public schemas instead of unchecked casts.

- [ ] **Step 3: Write failing Python SDK tests**

Using the existing fake transport, assert:

```py
await client.plan_workflow(definition)
await client.advance_workflow(workflow_id, approvals=[approval])
await client.workflow_status(workflow_id)
await client.cancel_workflow(workflow_id)
```

calls the four exact MCP tools.

- [ ] **Step 4: Add Python methods**

Keep Python inputs and outputs as typed dictionaries until generated public
models are introduced in a later SDK-specific plan. Validate required IDs and
top-level response shapes; do not duplicate the TypeScript Zod schema by hand.

- [ ] **Step 5: Run SDK checks**

```bash
pnpm --filter @melra/sdk test
pnpm --filter @melra/sdk typecheck
pnpm python:check
```

Expected: PASS.

- [ ] **Step 6: Commit SDK support**

```bash
git add packages/sdk-ts/src/index.ts packages/sdk-ts/src/index.test.ts \
  sdk-py/src/melra/client.py sdk-py/tests/test_client.py
git commit -m "feat(sdk): add durable workflow clients"
```

### Task 13: Prove restart-safe execution over real MCP stdio

**Files:**
- Create: `examples/workflows/restart-safe.json`
- Modify: `packages/server/test/e2e.test.ts`
- Modify: `apps/cli/test/cli.test.ts`

**Interfaces:**
- Consumes: packaged CLI, real MCP stdio transport, SQLite, workflow tools, file runtime, policy, verifier, receipt, and certificate.
- Produces: immutable end-to-end evidence for the MELRA Durable Core Alpha exit gate.

- [ ] **Step 1: Add the deterministic example**

The definition contains:

```json
{
  "schemaVersion": "1.0.0",
  "id": "7d57f7ba-9b98-4ff5-8f73-a24fbaf66d28",
  "version": 1,
  "name": "restart-safe-verified-file",
  "nodes": [
    {
      "id": "inspect",
      "type": "operation",
      "dependsOn": [],
      "request": {
        "goal": "Inspect the local runtime",
        "operation": { "kind": "system", "action": "info" }
      }
    },
    {
      "id": "write",
      "type": "operation",
      "dependsOn": ["inspect"],
      "request": {
        "goal": "Create a restart-safe verified artifact",
        "operation": {
          "kind": "file",
          "action": "write",
          "path": "durable-core-result.txt",
          "content": "verified after restart"
        },
        "requiredEvidence": [
          { "type": "file_exists", "path": "durable-core-result.txt" }
        ]
      }
    },
    {
      "id": "checkpoint",
      "type": "checkpoint",
      "dependsOn": ["write"]
    }
  ]
}
```

- [ ] **Step 2: Write the real restart test**

The test:

1. starts the built CLI through `StdioClientTransport`;
2. calls `melra_workflow_plan`;
3. advances the first node;
4. records the workflow ID and event sequence;
5. closes the MCP client and child process;
6. starts a new CLI process against the same data directory;
7. advances until approval is returned;
8. submits the exact scoped approval;
9. advances the checkpoint;
10. asserts `verified_complete`;
11. checks the file content through `node:fs`, not adapter output;
12. retrieves the task receipt and certificate;
13. asserts event sequences are unique and monotonic.

- [ ] **Step 3: Add an approval-tamper test**

Change the persisted workflow definition version or submitted approval ID after
restart and assert execution fails before the file adapter is called.

- [ ] **Step 4: Add a no-plaintext persistence test**

Use file content `"secret-restart-payload-7391"`, stop after planning, and
assert that string is absent from:

```text
SQLite main file
SQLite WAL file
workflow status JSON
workflow events JSON
stderr
```

- [ ] **Step 5: Run real-interface tests**

```bash
pnpm build
pnpm --filter @melra/server test:e2e
pnpm --filter @melra/cli test
```

Expected: PASS with the server process actually restarted.

- [ ] **Step 6: Commit the exit-gate scenario**

```bash
git add examples/workflows/restart-safe.json \
  packages/server/test/e2e.test.ts apps/cli/test/cli.test.ts
git commit -m "test(e2e): prove verified workflow recovery"
```

### Task 14: Add deterministic MELRA Durable Core research evaluation

**Files:**
- Create: `evals/manifests/durable-core-alpha-v1.json`
- Create: `evals/src/durable-core.ts`
- Create: `evals/src/durable-core.test.ts`
- Modify: `evals/src/runner.ts`
- Modify: `evals/package.json`

**Interfaces:**
- Consumes: public CLI commands and the committed restart-safe workflow.
- Produces: raw JSONL runs plus a summary with validity and research metrics.

- [ ] **Step 1: Define the immutable evaluation manifest**

Include these eight scenarios:

```text
planned_task_restart
workflow_node_boundary_restart
post_approval_restart
post_adapter_pre_receipt_crash
post_receipt_pre_projection_crash
interrupted_read_retry
interrupted_mutation_reconciliation
duplicate_advance_race
```

Each entry contains a stable ID, crash point, expected terminal class,
expected maximum adapter calls, expected event types, and verifier requirement.
The manifest has a SHA-256 digest checked by its test.

- [ ] **Step 2: Write failing metric tests**

Given synthetic run records, assert:

```ts
expect(summary.validRuns).toBe(8);
expect(summary.recoveryRate).toBe(1);
expect(summary.duplicateExecutionRate).toBe(0);
expect(summary.falseSuccessRate).toBe(0);
expect(summary.eventConsistencyRate).toBe(1);
```

Invalid infrastructure runs must be excluded from rates and counted separately.

- [ ] **Step 3: Implement the evaluator**

The runner records:

```ts
interface DurableCoreRun {
  schemaVersion: "1.0.0";
  scenarioId: string;
  implementationCommit: string;
  manifestDigest: string;
  nodeVersion: string;
  platform: string;
  architecture: string;
  startedAt: string;
  endedAt: string;
  valid: boolean;
  failureClass?: "infrastructure" | "runtime" | "policy" | "verifier" | "task";
  recovered: boolean;
  adapterCalls: number;
  duplicateExecutions: number;
  falseSuccess: boolean;
  eventConsistent: boolean;
  receiptIds: string[];
  certificateIds: string[];
}
```

Write raw JSONL first and derive the summary only from that file. Record the
exact git commit and reject a dirty implementation worktree for publishable
runs.

- [ ] **Step 4: Expose evaluation commands**

Add:

```json
{
  "evaluate:durable-core": "node dist/durable-core.js run",
  "summarize:durable-core": "node dist/durable-core.js summarize"
}
```

Wire the suite into the existing evaluator without changing unrelated browser
or memory benchmark semantics.

- [ ] **Step 5: Run the deterministic suite**

```bash
pnpm --filter @melra/evals test
pnpm --filter @melra/evals build
pnpm --filter @melra/evals evaluate:durable-core
```

Expected: eight valid scenarios, recovery rate `1`, duplicate-execution rate
`0`, false-success rate `0`, and event-consistency rate `1`.

- [ ] **Step 6: Commit evaluation evidence tooling**

```bash
git add evals/manifests/durable-core-alpha-v1.json \
  evals/src/durable-core.ts evals/src/durable-core.test.ts \
  evals/src/runner.ts evals/package.json
git commit -m "test(evals): add durable core recovery study"
```

### Task 15: Document, package, and release MELRA Durable Core Alpha

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/VALIDATION.md`
- Modify: `docs/COMPATIBILITY.md`
- Modify: all workspace `package.json` files
- Modify: `packages/protocol/src/index.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: every prior task and its evidence.
- Produces: truthful `0.3.0-alpha.0` packages, documentation, and release-gate report.

- [ ] **Step 1: Bump the alpha version consistently**

Set every workspace package and `PRODUCT_VERSION` to `0.3.0-alpha.0`. Preserve
the MCP protocol version unless the MCP SDK protocol itself changed. Update
internal dependency ranges and regenerate the lockfile with:

```bash
pnpm install --lockfile-only
pnpm versions:check
```

- [ ] **Step 2: Update architecture and compatibility documentation**

Document:

- exact durable tables and migration version;
- command/event/projection boundaries;
- encrypted payload and key behavior;
- all workflow node semantics and bounds;
- restart and uncertainty rules;
- ten MCP tools and CLI commands;
- compatibility guarantees and known alpha limitations.

Do not describe a future feature as implemented.

- [ ] **Step 3: Update README first-value workflow**

Add commands that a clean user can copy:

```bash
pnpm install
pnpm build
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js workflow plan \
  --definition examples/workflows/restart-safe.json
```

Show the approval and restart sequence using actual CLI output captured from the
release candidate.

- [ ] **Step 4: Record validation evidence**

`docs/VALIDATION.md` records:

- implementation commit;
- all commands and exit codes;
- test counts;
- durable evaluation manifest digest and summary;
- package tarball names and checksums;
- supported local platforms actually tested;
- known limitations and invalid/untested claims.

- [ ] **Step 5: Run the complete release gate**

```bash
pnpm check
pnpm e2e
pnpm evals
pnpm pack:check
pnpm docker:smoke
pnpm security:audit
pnpm benchmark:core
pnpm benchmark:browser:check
git diff --check
```

Expected: every command exits `0`. If an external service or upstream fixture
prevents a check, record that check as not verified and do not release until it
passes in CI or a documented equivalent environment.

- [ ] **Step 6: Verify publication and secret scans**

```bash
git grep -nE "(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{35})"
git diff --check
```

Expected: the secret scan has no matches and the diff check exits `0`.

- [ ] **Step 7: Commit the release candidate**

```bash
git add README.md ROADMAP.md CHANGELOG.md docs/ARCHITECTURE.md \
  docs/VALIDATION.md docs/COMPATIBILITY.md packages apps evals sdk-py \
  package.json pnpm-lock.yaml
git commit -m "chore: prepare MELRA Durable Core Alpha"
```

### Task 16: Review, publish, merge, and verify the branch

**Files:**
- Review: every file changed since the approved design commit.
- Create through GitHub: pull request, checks, and merged commit.

**Interfaces:**
- Consumes: the release-candidate branch and complete local evidence.
- Produces: a reviewed, merged, and remotely verified MELRA Durable Core Alpha.

- [ ] **Step 1: Audit the branch against all 16 acceptance criteria**

For each criterion in section 16 of the design, record:

```text
criterion
authoritative file or command
observed result
status: proven | contradicted | missing
```

Any contradicted or missing criterion returns to the responsible task before
push.

- [ ] **Step 2: Review the exact diff**

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: only intended tracked changes, no untracked product files, and a clean
worktree.

- [ ] **Step 3: Push the focused branch**

```bash
git push -u origin coder/melra-durable-alpha
```

If the implementation branch uses another `coder/` name created by the
worktree skill, push that exact branch instead.

- [ ] **Step 4: Create a ready-for-review pull request**

The PR body includes:

- user-visible result;
- architecture summary;
- acceptance-criterion evidence table;
- exact verification commands;
- durable-evaluation summary;
- security and compatibility notes;
- known limitations;
- no unsupported superiority claim.

- [ ] **Step 5: Require passing repository checks**

Verify the remote checks cover build, typecheck, unit, Python, real MCP E2E,
crash/recovery, migration, package, Docker, audit, and deterministic evaluation.
Local success does not substitute for a missing required remote check.

- [ ] **Step 6: Merge and verify main**

Merge only after required checks pass. Then:

```bash
git switch main
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm check
pnpm e2e
git status --short
```

Expected: main contains the merged commit, verification exits `0`, and the
worktree is clean.
