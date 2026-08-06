# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases use
[Semantic Versioning](https://semver.org/) after `1.0`.

## [Unreleased]

### Changed

- Upgrade `zod` from 3.25.76 to 4.4.3 in `@melra/protocol` and `@melra/server`.
  The only breaking API in use was the single-argument `z.record(value)` form,
  which zod 4 replaces with the explicit `z.record(key, value)` signature; three
  call sites in `packages/protocol/src/index.ts` were updated. Schema semantics
  are unchanged — every operation schema stays `.strict()` with the same bounds
  and defaults, and all 22 policy/execution eval scenarios still pass with
  identical plan and final states.

### Security

- Pin transitive `hono` to `^4.12.34` and `fast-uri` to `^3.1.5` through pnpm
  overrides, clearing the CORS ReDoS (moderate) and host-confusion (high)
  advisories that `pnpm audit --prod` reported through
  `@modelcontextprotocol/sdk`. The SDK's own ranges already allow the patched
  releases; only the lockfile was pinning the vulnerable ones.

## [0.3.0-alpha.0] - 2026-07-30

### Added

- Durable workflow definitions with operation, approval, condition, parallel,
  bounded-loop, checkpoint, and compensation nodes.
- Transactional ordered workflow events, projections, snapshots, encrypted
  executable payloads, and idempotency commits in SQLite migration version 1.
- Four workflow MCP tools plus CLI, TypeScript SDK, and Python SDK workflow
  interfaces.
- Restart-safe workflow example and real MCP child-process recovery test.
- Immutable eight-scenario Durable Core evaluation manifest, raw JSONL runs,
  and summary metrics.
- Optional speaker, episode ID, and sequence metadata for memory records.
- Bounded adjacent-turn context expansion and query-aware speaker matching in
  the deterministic local memory ranker.
- Browser-agent evaluation harness (`benchmarks/browser-agent`) with a 125-task
  MiniWoB development suite, a pre-registered
  `WebArena-Verified Hard-30 registered subset`, deterministic subset selection,
  paired aggregate statistics, and a fail-closed publication gate.
- Opt-in browser instrumentation for benchmark and diagnostic harnesses:
  `MELRA_BROWSER_CDP_ENDPOINT`, `MELRA_BROWSER_CDP_CONTEXT_INDEX`, and
  `MELRA_BROWSER_HAR_PATH`. Unset by default, so the isolated
  launch-our-own-browser behavior is unchanged.

### Changed

- Product version advanced to `0.3.0-alpha.0`; the MCP surface now contains
  ten tools.
- Planned task and workflow payloads remain executable after a process restart.
- Interrupted reads retry conservatively; independently verifiable file
  mutations reconcile, while uncertain mutations enter `recovery_required`.
- LoCoMo mean evidence coverage@20 improved from `0.629117` to `0.759652`
  on the same hashed 1,982-question run, with no model, embedding, or network
  calls.
- `run-miniwob` now reports `infrastructure_failures` and a `valid` flag, so a
  run whose tasks the harness could not attempt is not mistaken for a clean
  result.

### Fixed

- Concurrent advances for one workflow are serialized before adapter
  execution, preventing duplicate effects and receipts in one server process.
- Verified tasks committed before a workflow projection are recovered without
  rerunning their adapters.
- Browser benchmark runs drive Playwright from one process-wide thread.
  BrowserGym binds a process-global sync Playwright to its creating thread, so
  the previous per-task thread made every task after the first fail with
  `greenlet.error`.
- The benchmark agent retries rate-limited and transient-transport provider
  responses with bounded, capped backoff, honoring `Retry-After` when sent, and
  can pace requests to a fixed per-minute budget.
- A task whose environment, driver, or agent fails is recorded as a failure
  rather than aborting the suite, keeping the denominator fixed.
- A model action the harness cannot derive evidence for is recorded as
  `invalid_action` instead of raising.
- Benchmark browser actions now time out after 10s against a 30s task budget.
  Both previously defaulted to 30s, so an unresolvable target and the budget
  abort expired together and every such action was reported as
  `budget_exhausted` rather than its actual error.

### Security

- Exact task requests, workflow definitions, and persisted adapter results use
  AES-256-GCM envelopes bound to record identity and purpose.
- Payload keys are loaded from `MELRA_PAYLOAD_KEY` or created as a non-symlink
  mode-`0600` file; permissive Unix key files fail closed.
- Status, events, receipts, certificates, logs, and SQLite projections are
  covered by plaintext-secret regression tests.
- Speaker and episode metadata pass through secret redaction before
  persistence.
- Attaching over CDP and recording a HAR are mutually exclusive, and a HAR path
  must be absolute. Raw HAR, screenshots, video, and provider transcripts are
  Git-ignored and rejected by the benchmark publication gate.

## [0.2.0-alpha.1] - 2026-07-28

### Added

- Governed computer-use capability contract with macOS and Linux/X11 adapters.
- Read-only computer capability discovery and typed screenshot, pointer,
  keyboard, and scroll operations through the common task pipeline.
- Deterministic local memory ranking with lexical relevance, exact phrases,
  confidence, freshness, bounded diversity, expiry, and supersession.
- Public LoCoMo evidence-retrieval and cross-capability microbenchmark
  harnesses with committed raw JSON results.
- Dedicated memory, browser, terminal, computer-use, and methodology reports.

### Changed

- Browser actions now wait for a bounded mutation-free DOM window and return
  settle evidence before the final observation.
- README, architecture, capabilities, threat model, validation, and roadmap now
  describe the five execution layers and explicit benchmark claim boundaries.
- Deterministic evaluation coverage increased from 21 to 22 scenarios.

### Security

- Computer input is schema-bounded, platform-adapted, classified high-risk, and
  requires declared evidence plus exact task-scoped approval.
- Expired and superseded memory records are excluded by default.

## [0.1.0-alpha.1] - 2026-07-28

### Fixed

- Publish the GitHub Container Registry image for both Linux AMD64 and ARM64.
- Allow the hardened container smoke test to select an explicit platform when
  validating a single-platform image.

## [0.1.0-alpha.0] - 2026-07-28

### Added

- Compact six-tool MCP stdio server.
- Task lifecycle with policy, scoped approvals, budgets, cancellation,
  verification, receipts, and execution certificates. Task records are
  persisted; executable task payloads do not survive a restart.
- Root-confined file runtime.
- Shell-free foreground and background terminal runtime.
- Isolated Playwright browser runtime with network safety checks.
- Scoped, redacted local SQLite memory.
- TypeScript and Python client SDKs.
- CLI, Docker image, 21-scenario evaluation harness, client interoperability
  tests, security automation, and release provenance workflow.

### Security

- Deny-by-default browser domain allowlist.
- Private-address and cloud-metadata browser blocking.
- Central redaction of persisted task input, output, receipts, and URL queries.
- Cross-scope memory overwrite and deletion protection.
- Patched transitive HTTP adapter enforced through a package override.

[Unreleased]: https://github.com/XAGI-Lab/melra/compare/v0.3.0-alpha.0...HEAD
[0.3.0-alpha.0]: https://github.com/XAGI-Lab/melra/compare/v0.2.0-alpha.1...v0.3.0-alpha.0
[0.2.0-alpha.1]: https://github.com/XAGI-Lab/melra/compare/v0.1.0-alpha.1...v0.2.0-alpha.1
[0.1.0-alpha.1]: https://github.com/XAGI-Lab/melra/compare/v0.1.0-alpha.0...v0.1.0-alpha.1
[0.1.0-alpha.0]: https://github.com/XAGI-Lab/melra/releases/tag/v0.1.0-alpha.0
