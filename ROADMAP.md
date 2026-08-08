# Roadmap

MELRA is an open-source **autonomy kernel**: the layer an agent asks to change
the world through. Checked items are implemented on the current alpha branch;
they are not a promise of stable API compatibility.

Two kinds of work appear below, and the distinction is the point:

- **Kernel services** — type, classify, authorise, gate on approval, record
  durably, deduplicate, run under a budget, verify against evidence, receipt.
  Those nine are the guarantees, and they must hold no matter which agent is
  above or which adapter is below.
- **Reference effect adapters** — files, terminal, browser, computer, and later
  HTTP/API. Replaceable implementations that reach the world *through* the kernel
  services. An adapter that could skip them would not be an adapter.

Work that is not one of those nine jobs, or an adapter serving them, does not
belong on this roadmap — reasoning, planning, model selection, and semantic
memory stay with the agent above.

## v0.1 — local execution alpha

### Runtime and protocol

- [x] Strict versioned task contracts, now exposed through an eleven-tool MCP surface.
- [x] Local stdio transport.
- [x] Persisted task state, budgets, cancellation, and bounded read retries.
- [x] Local allow/deny/confirm policy re-evaluated at execution.
- [x] Exact, expiring, task-scoped approvals.
- [x] Redacted action receipts and SHA-256 execution certificates.
- [x] Deterministic result, file, terminal, URL, and page verification.
- [x] Local SQLite task, receipt, certificate, and memory storage.
- [x] AES-256-GCM executable task payload persistence across restart.
- [x] Conservative recovery rules for interrupted reads and mutations.
- [x] Circuit breakers shared across related tasks.

### File, terminal, and browser

- [x] Root-confined file read, write, move, delete, stat, list, and hash.
- [x] Symlink escape protection and bounded file size.
- [x] Shell-free terminal commands with command and environment policy.
- [x] Foreground and supervised background process lifecycle.
- [x] Output limits, secret redaction, timeout, status, logs, and cancellation.
- [x] Isolated browser session and tab lifecycle.
- [x] Typed navigation, DOM inspection, forms, keyboard, scroll, and tabs.
- [x] Screenshots, uploads, downloads, and artifact hashing.
- [x] SSRF, cloud-metadata, redirect, and repeated DNS-address checks.
- [ ] Resolver pinning or a browser proxy for complete DNS-rebinding defense.
- [x] Persistent opt-in browser profiles (`MELRA_BROWSER_PROFILE`).
- [ ] Deterministic browser recording and replay.
- [x] Opt-in Chrome DevTools Protocol attachment for shared benchmark sessions.

### Memory

- [x] Local account-free memory.
- [x] Session, task, project, workspace, user, and procedural scopes.
- [x] Provenance, confidence, search, listing, deletion, clear, and export.
- [x] Secret redaction before persistence.
- [x] Expiry and supersession chains.
- [x] Hybrid lexical ranking, freshness, confidence, and head diversity.
- [x] Explicit episode-order expansion and query-aware speaker matching.
- [x] Public LoCoMo objective-retrieval harness and result artifact.
- [x] Configurable retention policies and automatic compaction.
- [ ] Semantic embeddings and hybrid retrieval.
- [ ] Freshness, conflict resolution, and consolidation.
- [ ] Prompt-injection and memory-poisoning classifiers.

### Developer experience and release

- [x] CLI doctor, init, serve, run, inspect, export, and policy test.
- [x] TypeScript and Python client SDKs.
- [x] Docker image and hardened Compose configuration.
- [x] Thirty deterministic safety/execution scenarios plus eight durable
      crash, recovery, and concurrency scenarios.
- [x] Real MCP stdio, browser, container, and Python interoperability tests.
- [x] Linux, macOS, and Windows CI definitions.
- [x] CodeQL, dependency review, Dependabot, DCO, and secret protections.
- [x] Release workflow for checksums, SBOM, and signed provenance.
- [x] First tagged alpha release with multi-architecture container.
- [ ] Fresh-machine evidence on every supported platform.
- [ ] Independent security review.

## v0.2 — richer local agents

### Computer use

- [x] Computer-use capability contract inside the governed task surface.
- [x] Read-only platform and adapter capability discovery.
- [x] Governed screenshot, pointer, text, named-key, and scroll operations.
- [x] macOS native adapter with permission-aware capability reporting.
- [x] Linux/X11 adapter using detected screenshot tools and `xdotool`.
- [ ] Accessibility-tree inspection and semantic element targeting.
- [ ] Screenshot and OCR inspection fallback.
- [ ] Drag and window-management actions.
- [ ] Active-window, display, focus, and secure-input safety checks.
- [x] Consequential-action approvals through the common policy gate.
- [ ] Post-action desktop observation and task-specific verification.
- [ ] Windows input adapter.
- [ ] Replayable computer-use safety evaluations.
- [ ] Official OSWorld-MCP subset with released traces and evaluator output.

### Browser and terminal expansion

- [x] Mutation-driven stable-DOM quiet-window with timeout evidence.
- [ ] Visual targeting fallback with explicit confidence.
- [x] Popup and multi-window policy (`policy.popups`).
- [x] Interactive terminal input (`interactive` + `send`). A real pseudo-TTY is
  still open: stdin is piped, so a program that checks `isatty` and refuses
  unless it owns a terminal is out of reach without a native PTY dependency.
- [x] Package-installation and network-effect classifiers.
- [x] Local fixed-wait versus condition-wait correctness/latency benchmark.
- [x] Pinned MiniWoB-125 development and WebArena-Verified Hard-30 harnesses.
- [ ] Completed representative BrowserGym reliability and token-cost result.

### Transport and identity

- [x] Local Streamable HTTP transport.
- [ ] Local OAuth and client identity. Bearer-token auth ships today; OAuth is
      the remaining work.
- [x] Multi-client session isolation.
- [ ] Optional desktop control surface.

## v0.3 — Durable Core Alpha

### Workflow runtime

- [x] Immutable versioned workflow definitions and bounded DAG validation.
- [x] Operation, approval, condition, parallel, bounded-loop, checkpoint,
      compensation, human-input, and delegation nodes.
- [x] Transactional workflow events, projections, snapshots, and monotonic
      aggregate sequences.
- [x] Encrypted exact workflow definitions with separately redacted status.
- [x] Restart-safe task and workflow continuation.
- [x] Read retry, independent file-mutation reconciliation, and explicit
      `recovery_required` uncertainty.
- [x] Workflow/node/request-bound idempotency keys and committed-attempt
      constraints.
- [x] In-process serialization of competing advances for one workflow.
- [x] Cross-process leases for multiple servers sharing one data directory.
- [x] Operator commands for pause, resume, and suspension.
- [x] Five workflow MCP tools and matching CLI, TypeScript, and Python methods.
- [x] Real child-process restart E2E with approval tamper and plaintext scans.
- [x] Immutable eight-scenario Durable Core evaluation manifest and raw JSONL
      evidence tooling.

### Remaining workflow work

- [ ] PostgreSQL event and projection provider — deliberately deferred to
      [P5](#p5--beyond-one-machine); SQLite is the local authority until there is
      a second machine to share state with.
- [x] HTTP API, event stream, and Community console.

## Kernel direction

The work below is ordered by what unblocks what, not by how interesting it is.
Nothing here adds reasoning to MELRA.

### P0 — define the category

- [x] Position MELRA as an agent-independent autonomy kernel across README,
      architecture docs, and this roadmap.
- [x] State the responsibility boundary explicitly: the agent owns reasoning,
      MELRA owns effects.
- [x] Document the canonical effect lifecycle as one named sequence
      (`REQUEST → … → RECEIPT`) rather than prose scattered across docs.
- [ ] **Effect Contract** as a first-class protocol concept: principal,
      capability, operation, target, arguments, preconditions, expected
      postconditions, idempotency identity, budget, approval policy,
      verification policy, metadata. Today these exist as separate fields on a
      task request; the contract names them as one object with one schema.
- [ ] **Principal identity** with an explicit delegation chain — organization →
      human → agent → session → parent agent → model. Every effect record and
      receipt carries who asked, on whose behalf.
- [ ] **Capability model**: resource, effect, scope, principal, `valid_until`,
      `max_operations`, `policy_version` — and provider-shaped capabilities
      (provider, effect, account, `amount_max`, `daily_max`) for effects that
      spend or commit something.

### P1 — prove agent independence

- [ ] Agent adapter packages so a harness calls `write_file()` and the adapter
      runs plan → approve → execute → verify → receipt underneath.
- [ ] At least two reference integrations against different harnesses, with the
      same policy, durable state, and receipts surviving the swap. This is the
      claim that distinguishes a kernel from a server; it is not yet proven.
- [ ] Agent compatibility suite a harness can run to demonstrate it does not
      bypass the kernel.

### P2 — hard capability boundary

- [ ] Two deployment modes: developer mode (today's behaviour) and enforced
      mode, where the boundary is not a policy file the caller can edit.
- [ ] Rename `--unhinged` to something boring and descriptive
      (`--unsafe-local`), keeping the current flag as a deprecated alias, and
      refuse it outright in enforced mode.

### P3 — verification framework

- [ ] Verification strength levels 0–3 surfaced on every evidence item, so a
      caller can tell state evidence from the adapter's own word.
- [ ] Independent-channel verification (level 2): confirm a UI effect through a
      provider API rather than through the page that performed it.
- [ ] Pluggable verifiers — file, process, HTTP, database, browser, cloud,
      SaaS, webhook — behind one predicate interface.
- [ ] Semantic verification (level 3), labelled probabilistic everywhere it
      appears, and never the sole evidence for a destructive effect.

### P4 — credentials and API effects

- [ ] Credential broker: agents receive capabilities, not secrets. The kernel
      holds the credential and performs the effect.
- [ ] HTTP/API effect adapter with per-provider effect semantics —
      `at-most-once`, `at-least-once`, `exactly-once-where-provider-allows`,
      `reconciliation-required` — declared rather than assumed.
- [ ] Reconciliation for effects whose provider cannot promise exactly-once.
- [ ] Compensation as a first-class saga across providers, not only within one
      workflow.

### P5 — beyond one machine

- [ ] PostgreSQL event and projection provider.
- [ ] Distributed workers without weakening local policy semantics.
- [ ] Fleet-level operator view across many kernels.

## v0.4 and later

- [ ] Extension SDK and compatibility testkit.
- [ ] Sandboxed WASM or process-isolated third-party adapters.
- [ ] Additional SDKs selected by contributor and platform demand.
- [ ] Stable protocol, migration, and deprecation guarantees.

## Stable release gate

Before `1.0`, the project must have:

- clean installation evidence on supported Linux, macOS, and Windows versions;
- verified compatibility with documented MCP clients;
- passing conformance, safety, path-escape, terminal, browser, and memory suites;
- complete local deletion and export behavior;
- reproducible checksums, SBOMs, and signed provenance for every artifact;
- published limitations and upgrade guidance;
- independent security review with critical findings resolved.
