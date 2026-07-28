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
- [ ] Read-only browser adapter.
- [ ] Explicitly approved mutation adapters.
- [ ] Client setup guides.

## Quality and release

- [ ] Linux, macOS, and Windows CI.
- [ ] MCP conformance suite.
- [ ] Safety regression suite.
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
- pass supported-platform and conformance tests;
- publish checksums, an SBOM, and reproducible validation evidence.
