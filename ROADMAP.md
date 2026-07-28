# Roadmap

ATLAS MCP is an open-source product for governed and verifiable MCP execution.

## Project setup

- [x] Establish Apache-2.0 licensing.
- [x] Add governance, security, contribution, and conduct policies.
- [x] Add architecture, product-scope, threat-model, and validation documents.
- [x] Add the first tested execution-safety primitives.
- [x] Configure issues, discussions, CodeQL, dependency review, and Dependabot.
- [ ] Finalize repository rules and required CI checks.
- [ ] Verify package namespace and release-signing identities.

## Execution core

- [ ] Capability declaration and validation.
- [ ] Approval policy.
- [x] Retry and loop guard.
- [x] Verify-after-mutation gate.
- [ ] Circuit breaker and error recovery.
- [ ] Task state machine.
- [ ] Cooperative cancellation and timeouts.
- [ ] Durable local storage.
- [ ] Evidence receipts, hashing, and redaction.
- [ ] Deterministic verifier interface.

## MCP runtime

- [ ] Versioned protocol schemas.
- [ ] Stdio server.
- [ ] Local Streamable HTTP server.
- [ ] Read-only filesystem adapter.
- [ ] Read-only HTTP adapter.
- [ ] Explicitly approved mutation adapters.
- [ ] Client setup guides.

## Computer use

- [ ] Cross-platform computer-use capability contract.
- [ ] Accessibility-tree inspection and element targeting.
- [ ] Screenshot and OCR-based inspection fallback.
- [ ] Mouse, keyboard, drag, scroll, and window-control actions.
- [ ] Explicit approval for consequential operating-system actions.
- [ ] Structured post-action verification with expected text or elements.
- [ ] Active-window, display, and focus safety checks.
- [ ] macOS, Windows, and Linux capability detection.
- [ ] Replayable computer-use evaluation scenarios.

## Browser use

- [ ] Browser session and tab lifecycle.
- [ ] Navigation, extraction, forms, downloads, and uploads.
- [ ] DOM-first element targeting with visual fallback.
- [ ] Read-only browser mode.
- [ ] Approval-gated clicks, typing, forms, and file uploads.
- [ ] Stable-page and network-settle detection.
- [ ] Popup, redirect, download, and cross-origin safety guards.
- [ ] Structured verification after browser mutations.
- [ ] Deterministic action recording and replay where safe.
- [ ] Playwright and Chrome/CDP adapter support.
- [ ] Browser reliability and token-cost evaluations.

## Terminal use

- [ ] Bounded shell-command execution.
- [ ] Command, argument, environment, and working-directory policy.
- [ ] Read-only inspection mode.
- [ ] Approval gates for writes, package installation, network access, and
      destructive commands.
- [ ] Interactive terminal and pseudo-TTY support.
- [ ] Long-running process lifecycle, output streaming, and cancellation.
- [ ] Background process status and log retrieval.
- [ ] Exit-code, output, artifact, and side-effect verification.
- [ ] Secret redaction and environment-variable allowlisting.
- [ ] Shell-injection, path-escape, and destructive-target regression tests.

## Memory layer

- [ ] Local memory store with no account requirement.
- [ ] SQLite-backed working, episodic, semantic, and procedural memory.
- [ ] Explicit scopes for task, project, workspace, and user memory.
- [ ] Provenance linking every memory to its source task and evidence.
- [ ] Retention, expiry, deletion, export, and reset controls.
- [ ] User approval before storing sensitive or cross-task information.
- [ ] Secret and personal-data redaction before persistence.
- [ ] Hybrid keyword and semantic retrieval.
- [ ] Confidence, freshness, and conflict tracking.
- [ ] Memory consolidation without losing source attribution.
- [ ] Protection against prompt-injection persistence and memory poisoning.
- [ ] Deterministic tests for isolation, deletion, and retrieval boundaries.

## Quality and release

- [ ] Linux, macOS, and Windows CI.
- [ ] MCP conformance suite.
- [ ] Safety regression suite.
- [ ] Computer-use safety and verification suite.
- [ ] Browser task reliability suite.
- [ ] Terminal escape and destructive-action suite.
- [ ] Memory isolation, poisoning, retention, and deletion suite.
- [ ] At least 20 reproducible end-to-end evaluations.
- [ ] Secret-leak and path-escape tests.
- [ ] SBOM and build provenance.
- [ ] Signed release artifacts.
- [ ] Fresh-machine installation verification.
- [ ] Published limitations and compatibility policy.
- [ ] Independent security review before stable release.

## Initial release gate

The first release must:

- work without an account;
- require no hosted service for local operation;
- keep telemetry off by default;
- default to read-only capabilities;
- require approval for mutations;
- verify mutations before reporting completion;
- isolate memory scopes and support complete local deletion;
- bound browser, computer, and terminal execution by policy;
- pass supported-platform and conformance tests;
- publish checksums, an SBOM, and reproducible validation evidence.
