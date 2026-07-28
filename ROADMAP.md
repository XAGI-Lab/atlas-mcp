# Roadmap

ATLAS MCP is an open-source product for governed and verifiable MCP execution.
Checked items are implemented on the current alpha branch; they are not a
promise of stable API compatibility.

## v0.1 — local execution alpha

### Runtime and protocol

- [x] Six-tool MCP contract with strict versioned schemas.
- [x] Local stdio transport.
- [x] Durable task state, budgets, cancellation, and bounded read retries.
- [x] Local allow/deny/confirm policy re-evaluated at execution.
- [x] Exact, expiring, task-scoped approvals.
- [x] Redacted action receipts and SHA-256 execution certificates.
- [x] Deterministic result, file, terminal, URL, and page verification.
- [x] Local SQLite task, receipt, certificate, and memory storage.
- [ ] Crash-safe resume rules for interrupted non-idempotent work.
- [ ] Circuit breakers shared across related tasks.

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
- [ ] Persistent opt-in browser profiles.
- [ ] Deterministic browser recording and replay.
- [ ] Chrome DevTools Protocol adapter in addition to Playwright.

### Memory

- [x] Local account-free memory.
- [x] Session, task, project, workspace, user, and procedural scopes.
- [x] Provenance, confidence, search, listing, deletion, clear, and export.
- [x] Secret redaction before persistence.
- [ ] Expiry and retention policies.
- [ ] Semantic embeddings and hybrid retrieval.
- [ ] Freshness, conflict resolution, and consolidation.
- [ ] Prompt-injection and memory-poisoning classifiers.

### Developer experience and release

- [x] CLI doctor, init, serve, run, inspect, export, and policy test.
- [x] TypeScript and Python client SDKs.
- [x] Docker image and hardened Compose configuration.
- [x] Twenty-one deterministic evaluation scenarios.
- [x] Real MCP stdio, browser, container, and Python interoperability tests.
- [x] Linux, macOS, and Windows CI definitions.
- [x] CodeQL, dependency review, Dependabot, DCO, and secret protections.
- [x] Release workflow for checksums, SBOM, and signed provenance.
- [ ] Published package namespace and first tagged alpha release.
- [ ] Fresh-machine evidence on every supported platform.
- [ ] Independent security review.

## v0.2 — richer local agents

### Computer use

- [ ] Cross-platform computer-use capability contract.
- [ ] Accessibility-tree inspection and semantic element targeting.
- [ ] Screenshot and OCR inspection fallback.
- [ ] Mouse, keyboard, drag, scroll, and window actions.
- [ ] Active-window, display, focus, and secure-input safety checks.
- [ ] Consequential-action approvals and post-action verification.
- [ ] macOS, Windows, and Linux capability detection.
- [ ] Replayable computer-use safety evaluations.

### Browser and terminal expansion

- [ ] Stable-page and network-settle heuristics.
- [ ] Visual targeting fallback with explicit confidence.
- [ ] Popup and multi-window policy.
- [ ] Interactive terminal and pseudo-TTY support.
- [ ] Package-installation and network-effect classifiers.
- [ ] Browser reliability and token-cost benchmarks.

### Transport and identity

- [ ] Local Streamable HTTP transport.
- [ ] Local OAuth and client identity.
- [ ] Multi-client session isolation.
- [ ] Optional desktop control surface.

## v0.3 and later

- [ ] Extension SDK and compatibility testkit.
- [ ] Sandboxed WASM or process-isolated third-party adapters.
- [ ] Additional SDKs selected by contributor and platform demand.
- [ ] Distributed workers without weakening local policy semantics.
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
