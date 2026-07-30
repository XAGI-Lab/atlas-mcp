# MELRA System Design

**Status:** Approved design

**Date:** 2026-07-30

**Source:** Product Requirements v1.0

**First implementation slice:** Repository Correction and Durable Core Alpha

## 1. Purpose

MELRA stands for **Modular Execution Layer for Reliable Autonomy**.

MELRA is an open-source agent operating system for consequential work.
It plans, executes, recovers, and independently verifies multi-step outcomes.
MCP remains a supported agent interface alongside the CLI, TypeScript SDK,
Python SDK, HTTP API, and Community console.

The system is successful when a user can install it locally, create an agent,
run an approval-gated workflow, restart the runtime during execution, recover
the workflow, independently verify the outcome, and inspect its evidence
without using hosted infrastructure.

## 2. Product identity

MELRA is the single public identity for the repository, MCP server, Core
runtime, Community product, CLI, SDKs, packages, containers, schemas,
benchmarks, documentation, research, and releases.

The technical naming contract is:

- repository: `XAGI-Lab/melra`;
- Node package scope: `@melra/*`;
- executable and container: `melra`;
- MCP tool prefix: `melra_`;
- environment prefix: `MELRA_`;
- Python distribution and import package: `melra`;
- local data directory: `~/.melra`;
- runtime types: `MelraRuntime`, `MelraClient`, and `createMelraRuntime`.

The project is pre-stable, so this rename is intentionally clean and breaking.
Public compatibility aliases using the previous identity are not retained.
Historical release evidence may remain accessible through repository history,
but current tracked product surfaces use MELRA.

## 3. Product principles

1. Policy is evaluated before every consequential effect.
2. Tool completion is not outcome completion.
3. Durable state, not process memory, is the execution authority.
4. Models propose decisions but never authorize themselves.
5. Local operation requires no hosted service.
6. Public contracts are versioned, portable, and provider-independent.
7. Failures and uncertainty are explicit states.
8. Telemetry is disabled by default.
9. Every tracked artifact is suitable for open publication.
10. Product and research claims cannot exceed released evidence.

## 4. Chosen approach

The repository evolves in place.

Existing file, terminal, browser, computer, memory, policy, receipt, MCP, CLI,
and SDK packages remain the tested foundation. New durable workflow, agent,
worker, model-routing, HTTP, Community, and research capabilities build around
those packages. A clean rewrite would duplicate security-sensitive code; a
service wrapper would preserve the current restart and verification defects.

## 5. Repository boundary

The public repository contains the complete Core and Community product:

- versioned contracts and schemas;
- orchestration, policy, memory, verification, and worker runtimes;
- file, terminal, browser, computer, and connector adapters;
- MCP, CLI, TypeScript SDK, Python SDK, and HTTP interfaces;
- the Community console;
- local and PostgreSQL storage providers;
- packages, containers, examples, conformance suites, benchmarks, and research
  artifacts.

Every tracked file must be useful to product users or contributors and suitable
for open publication. The product has no runtime dependency on an unreleased
hosted service. Released public packages may be consumed by other systems
through their documented contracts.

## 6. Architecture

### 6.1 Layers

1. **Contracts:** immutable versioned schemas and compatibility rules.
2. **Kernel:** agents, decisions, workflows, tasks, budgets, and recovery.
3. **Trust:** policy, approvals, memory permissions, verification, receipts,
   and certificates.
4. **Execution:** local adapters, connectors, workers, leases, and scheduling.
5. **Storage:** SQLite by default and PostgreSQL for larger deployments.
6. **Interfaces:** MCP, CLI, SDKs, HTTP, event streams, and console.
7. **Evidence:** tests, benchmarks, research reports, release manifests, and
   security artifacts.

Interfaces call the same application services. No transport or UI receives a
policy, approval, budget, or verification bypass.

### 6.2 Core components

| Component | Responsibility | Must not own |
| --- | --- | --- |
| Agent kernel | Identity, lifecycle, capabilities, delegation, budgets | Model-provider or transport logic |
| Decision engine | Structured plans, validation, revisions, rationale | Approval authority |
| Workflow engine | DAG state, transitions, checkpoints, recovery | Adapter-specific behavior |
| Task runtime | Bounded execution attempts and cancellation | Workflow completion decisions |
| Event store | Ordered accepted facts and transactional projections | Business policy |
| Policy engine | Allow, deny, or approval decisions | Tool execution |
| Verification engine | Independent outcome observations and predicates | Action execution authority |
| Memory engine | Scoped records, retrieval, retention, provenance | Unchecked cross-scope access |
| Worker runtime | Registration, leases, progress, evidence, reconciliation | Self-approval or success declaration |
| Model router | Provider selection, fallback, usage, and privacy routing | Execution authorization |
| Connector SDK | Portable manifests, adapters, verifiers, conformance | Product-specific hidden dependencies |
| Application services | Shared use cases for every interface | Transport-specific state |

## 7. Public contracts

Every public record includes:

- `schemaVersion`;
- immutable identity;
- `traceId`;
- creation and update timestamps where applicable;
- compatibility metadata;
- canonical serialization rules.

The public contract set includes:

- `Agent`;
- `WorkflowDefinition` and `WorkflowRun`;
- `Task` and `TaskAttempt`;
- `Approval`;
- `Worker` and `Lease`;
- `PolicyDecision`;
- `MemoryRecord`;
- `ConnectorManifest`;
- `VerifierManifest`;
- `Evidence`;
- `Receipt` and `Certificate`;
- `Event` and `Snapshot`;
- `ModelProvider`.

Published schemas use semantic versioning. Additive compatible changes remain
within a major version. Removing or changing meaning requires a new major
version and an explicit migration path.

## 8. Durable state model

### 8.1 Commands, events, and snapshots

A command requests a state change. Validation, policy, and concurrency checks
either reject it or append one or more accepted events. Events are immutable
facts with an aggregate ID and strictly increasing aggregate sequence.

Event append and current-state projection updates occur in one database
transaction. Snapshots accelerate reconstruction but never replace events.
State can always be rebuilt from a valid snapshot plus subsequent events.

### 8.2 Executable payloads

The runtime persists the exact canonical task request, workflow definition, and
execution result required for later execution and deterministic continuation.
It separately persists redacted display projections.

Sensitive payloads use AES-256-GCM envelopes through `node:crypto`. Each
envelope binds its task or workflow identity and payload purpose as
authenticated additional data so records cannot be swapped. Local installation
creates encryption material with restrictive permissions; operators may
provide their own key source. Credentials are stored as scoped references and
resolved only during authorized execution.

Changing a payload, target, policy, capability, verifier, or expected outcome
changes its action digest and invalidates prior approval.

### 8.3 Workflow definition

A workflow is an immutable, validated DAG. Supported node types are:

- operation;
- parallel group;
- condition;
- bounded loop;
- human input;
- approval;
- delegation;
- checkpoint;
- compensation.

Execution revisions create a new definition version with lineage and rationale.
Running definitions are never edited in place.

### 8.4 Lifecycle

Workflow states are:

- `draft`;
- `planned`;
- `awaiting_approval`;
- `running`;
- `paused`;
- `suspended`;
- `partially_complete`;
- `verified_complete`;
- `recovery_required`;
- `failed`;
- `cancelled`.

Task-attempt states include `leased`, `running`, `verifying`, `uncertain`, and
terminal result states.

Pending work resumes after restart. Interrupted reads may retry only when their
manifest declares them idempotent. Interrupted mutations become `uncertain` or
`recovery_required` until an authoritative verifier establishes their state.
They are never silently repeated.

### 8.5 Idempotency and concurrency

Every executable task has an idempotency key, declared effect, expected
outcome, verifier requirement, retry classification, budget, timeout, and
optional compensation.

Database constraints prevent duplicate committed attempts. Compare-and-swap
state versions reject stale transitions. Leases are time-limited and must be
reconciled after expiry before reassignment.

## 9. Agent, decision, and model system

An agent has durable identity, owner, role, objective, capabilities, connector
access, memory scopes, policy reference, model policy, budgets, parent, and
lifecycle state.

Parent agents may delegate only capabilities and budgets they possess.
Delegation creates durable child-agent and assignment events.

The decision engine accepts goals from any public interface and produces a
structured workflow proposal. Deterministic callers may submit workflows
without a model. Plans are schema-validated, dependency-checked,
capability-checked, budgeted, and policy-evaluated before execution.

The model router chooses a provider using complexity, privacy, cost, latency,
context size, structured-output support, tool support, and local availability.
Provider selection, fallback, token use, cost, latency, prompt digest, response
digest, and errors are recorded. Restricted data cannot route to a prohibited
provider.

## 10. Worker system

Workers register through authenticated replay-resistant challenges and
advertise platform, capabilities, resource limits, privacy properties, and
load.

Scheduling considers:

- capability and platform;
- permission and data locality;
- device activity and resource availability;
- privacy;
- cost and latency.

Workers receive renewable leases, not task ownership. Reconnecting workers
report active attempts and evidence. Conflicts become explicit uncertain
states. A second worker cannot commit the same attempt.

Workers cannot approve their tasks, weaken policy, author easier predicates
after execution, or declare workflow success. Embedded local execution uses the
same contract in process.

## 11. Policy, connectors, memory, and verification

### 11.1 Policy

Policy is evaluated at discovery, planning, approval, scheduling, execution,
resume, memory read, memory write, verification, and output delivery.

Decisions bind subject, resource, effect, data classification, device context,
budget, time constraints, and policy version. Missing context, unknown
capabilities, expired approval, unavailable verifiers, and incompatible schemas
fail closed.

### 11.2 Connectors

Connector manifests declare operations, effects, targets, permissions, risks,
data classes, rate limits, cancellation, expected outcomes, idempotency, and
compatible verifier types.

Manifest versions are immutable. Conformance tests cover schemas, policy,
cancellation, redaction, idempotency, receipts, errors, and verifier
compatibility.

### 11.3 Memory

Memory records include scope, provenance, confidence, sensitivity, permission,
validity, retention, and supersession. Retrieval and writes receive independent
policy decisions. Deletion removes records and indexes. Export preserves
provenance and redaction metadata.

### 11.4 Verification

Evidence levels are:

1. `tool_completed`;
2. `action_observed`;
3. `state_verified`;
4. `goal_verified`.

Only the workflow's required level may complete it. Expectations bind before
execution. The acting adapter cannot author weaker predicates afterward.

Authoritative observers run outside the actor's writable authority. They
reopen filesystem targets, re-observe browser state, inspect process and
external effects, or query business systems through separate read paths.
Termination or isolation is proven before final observation when concurrent
mutation could invalidate evidence.

Verifier errors, ambiguity, timeouts, stale reads, or authority failures produce
failure or uncertainty, never success.

Evidence records source, observer identity, timestamp, subject, digest,
freshness, authority class, limitations, and predicate result. Receipts bind
action, policy, approval, execution, and evidence digests. Certificates
summarize verified outcomes and may be locally signed.

Useful authoritative-observation mechanisms from the experimental verifier
branch are reused selectively inside `verifier-core` instead of introducing a
second product.

## 12. Product and Community experience

A new user must reach a verified outcome within ten minutes without a hosted
account.

Installation supports signed packages, Docker images, and source builds.
`doctor` checks runtime, database, browser, container, permission, and policy
readiness. `init` creates safe local configuration, storage, encryption
material, and optional MCP client configuration without overwriting existing
settings.

The guided example:

1. creates an agent;
2. plans a multi-step workflow;
3. requests scoped approval;
4. begins execution;
5. restarts the runtime;
6. recovers execution;
7. independently verifies the outcome;
8. displays the receipt and certificate.

Community deployment supports one organization with owner, administrator,
operator, member, and auditor roles. Permissions are policy-backed.

The console covers system health, agents, workflows, tasks, workers, leases,
recovery, policy, approvals, memory, connectors, evidence, receipts,
certificates, events, and traces. It supports keyboard navigation, visible
focus, semantic markup, accessible contrast, reduced motion, and screen-reader
fundamentals.

Portable bundles export and import agents, workflows, policies, memory,
receipts, and certificates.

Telemetry remains disabled by default and never includes task content,
credentials, memory values, or evidence payloads by default.

## 13. Research and evaluation

Major claims become falsifiable hypotheses. Evaluation covers:

- durable recovery and verified completion;
- false-success and unauthorized-effect reduction;
- policy overhead;
- memory benefit and scope safety;
- delegation and worker throughput;
- scheduling, cost, token, and latency trade-offs.

Current leading open-source runtimes are compared immediately before a
published study using identical tasks, environments, models, budgets, retries,
and authoritative success verifiers.

Primary metrics are:

- independently verified outcome rate;
- false-success rate;
- unauthorized-effect rate;
- recovery rate;
- duplicate-execution rate;
- evidence coverage;
- latency, cost, and token use;
- human interventions;
- time to first verified value.

Every run records the implementation commit, schema versions, immutable model
identifier, prompt digest, tool digest, environment image, task manifest,
random seed, policy, raw events, evidence, receipts, and validity status.
Infrastructure failures remain separate from model, policy, runtime, verifier,
and task failures. Invalid runs never contribute to headline scores.

Repeated trials report sample size, confidence intervals, effect sizes,
failure distributions, and uncertainty. Ablations isolate event sourcing,
independent verification, memory, policy, model routing, delegation, scheduling,
and recovery.

The versioned research report includes methodology, architecture, hypotheses,
negative results, threats to validity, raw artifacts, and replication commands.
Superiority claims require direct released evidence.

## 14. Security and quality

Required validation includes:

- schema and compatibility tests;
- state-machine and property tests;
- storage and migration tests;
- real-interface integration and end-to-end tests;
- crash injection at every durable transition;
- lease expiry, replay, and reconciliation tests;
- cross-platform packaging tests;
- load and accessibility tests;
- connector conformance tests.

Adversarial suites cover path traversal, symlink races, SSRF, command injection,
credential leakage, approval replay, policy bypass, worker impersonation,
forged evidence, stale observations, malicious connectors, resource exhaustion,
and ambiguous recovery.

Stable releases publish an evidence manifest, SBOM, signatures, provenance,
migration results, supported-platform matrix, benchmark bundle, limitations,
and reproduction commands. Stable status requires an independent security
review and resolution or explicit acceptance of every high or critical
finding.

## 15. Delivery sequence

### Slice 0: Repository correction

- preserve the accurate durability and evidence corrections;
- remove or rewrite uncommitted documents that position the repository as a
  dependency or companion to another product;
- ensure public product language and architecture are truthful;
- keep the repository test baseline green.

### Slice 1: Durable Core Alpha

- add event, workflow, task, approval, and snapshot schemas;
- persist canonical encrypted executable payloads;
- add transactional append-only events and projections;
- implement validated workflow DAG execution;
- support approvals, checkpoints, cancellation, bounded branches, compensation,
  and restart recovery;
- add CLI and MCP operations required for the vertical workflow;
- add crash-injection, migration, compatibility, and end-to-end tests.

Exit gate: an approval-gated multi-step workflow resumes after a forced restart,
finishes with independently verified evidence, and can be inspected from both
CLI and MCP.

### Slice 2: Agent and decision kernel

Persistent agents, delegation, capabilities, budgets, structured planning,
revision history, and model routing.

### Slice 3: Worker system

Registration, capabilities, leases, heartbeats, scheduling, offline queues,
cancellation, reconciliation, and duplicate prevention.

### Slice 4: Verification, memory, and connectors

Authoritative observers, evidence levels, signed certificates, complete memory
controls, manifests, SDKs, and conformance tests.

### Slice 5: Community product

Authenticated HTTP, event streaming, roles, PostgreSQL, deployment packaging,
migrations, and the accessible console.

### Slice 6: Research and stable release

Competitive evaluations, ablations, adversarial tests, crash campaigns,
cross-platform validation, independent review, signed artifacts, and
reproducible research publications.

Each slice receives its own implementation plan, focused branch, tests, review,
evidence, pull request, and merge. Main remains releasable between slices.

## 16. First-slice acceptance criteria

Repository Correction and Durable Core Alpha are accepted only when all of the
following are demonstrated:

1. Every current tracked product surface follows the MELRA naming contract,
   the previous identity has no public compatibility alias, and the GitHub
   repository is `XAGI-Lab/melra`.
2. Every tracked document describes this product on its own merits and is
   suitable for open publication.
3. A workflow definition supports operation, approval, condition, parallel,
   bounded-loop, checkpoint, and compensation nodes.
4. Invalid graphs, unbounded loops, impossible dependencies, missing
   capabilities, and policy-invalid plans fail before execution.
5. Exact executable payloads survive process restart without exposing secrets
   through status, logs, receipts, or events.
6. Events append transactionally with monotonic aggregate sequences.
7. Projections rebuild from events and supported snapshots.
8. Idempotency constraints prevent duplicate committed attempts.
9. Interrupted mutations enter uncertainty until independently reconciled.
10. Approval binds the exact action digest and expires correctly.
11. Required verification failure prevents `verified_complete`.
12. The guided workflow passes through CLI and real MCP stdio transport.
13. A forced restart between workflow nodes preserves progress and resumes.
14. Migration tests cover the currently released SQLite schema.
15. Existing file, terminal, browser, computer, memory, policy, SDK, package,
    evaluation, and transport checks remain green.
16. New compatibility, crash, recovery, redaction, and end-to-end checks pass in
    CI with reproducible commands.

Passing narrower unit tests does not satisfy these criteria.
