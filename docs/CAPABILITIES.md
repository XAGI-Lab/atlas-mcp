# Capabilities and limits

This document describes `0.1.0-alpha.0`.

## MCP tools

| Tool | Side effect | Approval |
|---|---:|---|
| `atlas_capabilities` | none | no |
| `atlas_plan` | stores a plan | no |
| `atlas_execute` | depends on planned operation | scoped for mutations |
| `atlas_task_status` | none | no |
| `atlas_task_cancel` | cancels task | no |
| `atlas_receipt` | none | no |

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

Interactive pseudo-terminal sessions are not implemented in `0.1`.

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
not implemented in `0.1`.

### Memory

Actions: `put`, `search`, `list`, `delete`, `clear`.

Scopes: `session`, `task`, `project`, `workspace`, `user`, `procedural`.

- Stored records include source, confidence, and timestamps.
- Common API keys, bearer tokens, passwords, and GitHub tokens are redacted.
- Search is local, scoped, case-insensitive keyword matching.

Memory is not a password manager. Semantic embeddings, expiry, consolidation,
and poisoning detection remain roadmap work.

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

`atlas_execute` returns raw operation output directly to the connected client.
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
- Not supported in `0.1`: remote HTTP transport, OAuth, multi-tenant hosting.
