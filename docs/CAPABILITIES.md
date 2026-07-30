# Capabilities and limits

This document describes `0.3.0-alpha.0`.

## MCP tools

| Tool | Side effect | Approval |
|---|---:|---|
| `melra_capabilities` | none | no |
| `melra_plan` | stores a plan | no |
| `melra_execute` | depends on planned operation | scoped for mutations |
| `melra_task_status` | none | no |
| `melra_task_cancel` | cancels task | no |
| `melra_receipt` | none | no |
| `melra_workflow_plan` | stores a validated workflow | no |
| `melra_workflow_advance` | depends on ready workflow nodes | scoped per mutation |
| `melra_workflow_status` | none | no |
| `melra_workflow_cancel` | cancels nonterminal workflow work | no |

## Durable workflows

Node types: `operation`, `approval`, `condition`, `parallel`,
`bounded_loop`, `checkpoint`, and `compensation`.

- Exact definitions and task payloads survive restart in encrypted envelopes.
- Each advance executes one deterministic ready wave.
- Workflow events and the current projection commit atomically.
- Interrupted reads may retry. Mutations reconcile only from independent file
  evidence or enter `recovery_required`.
- Definitions allow at most 500 nodes, 100 dependencies per node, 20 parallel
  branches, and 100 loop iterations.
- Competing advances for the same workflow are serialized inside one process.

Human-input, delegation, pause/resume commands, and cross-process leases are
not implemented.

## Operations

### Files

Actions: `list`, `read`, `stat`, `hash`, `write`, `move`, `delete`, `mkdir`.

- Paths are resolved inside one workspace root.
- Existing symlinks cannot escape that root.
- Reads and writes are size-bounded by local policy.
- Writes use a temporary sibling file followed by an atomic rename.
- Deletes are destructive and approval-gated.

### Terminal

Actions: `run`, `start`, `status`, `output`, `stop`.

- Commands are spawned directly, never through a shell.
- Shell interpreters, privilege escalation, and platform scripting shells are
  denied even if accidentally added to the normal allowlist.
- Command, arguments, working directory, environment, duration, and output are
  bounded.
- Background jobs are supervised only for the life of the server process.

Interactive pseudo-terminal sessions are not implemented in `0.3`.

### Browser

Actions: `navigate`, `inspect`, `click`, `type`, `select`, `press`, `scroll`,
`screenshot`, `upload`, `download`, `tabs`, `close`.

- Uses an isolated headless browser context.
- Prefers semantic targets (`role`, `name`, `text`) with optional selectors.
- Resolves and checks the destination and every intercepted request.
- Blocks private, link-local, multicast, unspecified, and cloud-metadata
  addresses. Localhost is opt-in.
- Confines uploaded files to the workspace and downloaded files to the artifact
  directory.

Persistent login profiles, visual/OCR targeting, and deterministic replay are
not implemented in `0.3`.

### Memory

Actions: `put`, `search`, `list`, `delete`, `clear`.

Scopes: `session`, `task`, `project`, `workspace`, `user`, `procedural`.

- Stored records include source, confidence, timestamps, and optional speaker,
  episode ID, and sequence metadata.
- Common API keys, bearer tokens, passwords, and GitHub tokens are redacted.
- Search is local and scoped with BM25-style lexical evidence, exact phrases,
  explicit speaker matching, bounded adjacent episode context, confidence,
  freshness, and bounded head diversity.
- Search ranks at most the 5,000 most recently updated in-scope candidates per
  query and returns at most 100 results.
- Records can expire or supersede older facts. Expired and superseded records
  are excluded by default.

Memory is not a password manager. Semantic embeddings, automatic
consolidation, and poisoning detection remain roadmap work.

### Computer

Actions: `capabilities`, `screenshot`, `click`, `move`, `type`, `key`,
`scroll`.

- Capability discovery is read-only and reports the detected adapter and
  limitations.
- Screenshots return a bounded artifact path, byte size, and SHA-256.
- Input actions are high-risk mutations requiring evidence and exact scoped
  approval.
- Coordinates name normalized or pixel space; key input uses a fixed allowlist.
- macOS requires Screen Recording or Accessibility permission. Linux input
  currently requires X11 and `xdotool`.

Accessibility targeting, OCR/vision fallback, focus verification,
multi-display normalization, Windows input, and official task-benchmark
evidence remain roadmap work.

### System

Action: `info`. Returns local runtime capability information without mutation.

## Verification predicates

| Predicate | Checks |
|---|---|
| `result_equals` | exact scalar at a result path |
| `result_contains` | string or serialized-result containment |
| `file_exists` | root-confined filesystem existence |
| `file_absent` | root-confined filesystem absence |
| `file_hash` | exact SHA-256 |
| `exit_code` | terminal process exit code |
| `url_matches` | anchored URL glob (`*` wildcard) |
| `page_contains` | inspected page text |

URL globs are anchored and schema-bounded. A completed action with unmet
required evidence returns `partial`, never `verified_success`.

`melra_execute` returns raw operation output directly to the connected client.
Durable task state and receipts keep only centrally redacted input and output;
file contents, browser text, terminal output, typed values, environment values,
URL queries, and common secret formats are not retained there.

Free-form task constraints fail closed because they cannot be enforced
deterministically. `forbiddenEffects` accepts only `read`, `mutate`, and
`destructive` and is enforced during planning and again during execution.

## Task budgets

Every request has:

- `maxSteps`: reserved for bounded composition and currently limited by schema;
- `maxDurationMs`: authoritative wall-clock execution budget;
- `maxRetries`: retry count for read-only operations.

Mutations and destructive operations have one execution attempt.

## Transport and deployment

- Supported: local stdio.
- Packaged: source, portable Node artifact, Python SDK artifact, Docker image.
- Not supported in `0.3`: remote HTTP transport, OAuth, multi-tenant hosting.
