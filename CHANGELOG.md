# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases use
[Semantic Versioning](https://semver.org/) after `1.0`.

## [Unreleased]

### Added

- Browser history navigation: `back`, `forward`, and `reload`. A session could
  previously only move forward, so a wrong click was unrecoverable without
  re-navigating from scratch. `back`/`forward` report `moved`, which is false
  only at the end of the history stack — Playwright returns `null` both when
  there is nowhere to go *and* when the entry it landed on produced no HTTP
  response (`about:blank`, a hash change, a `data:` URL), so the URL is compared
  to tell those apart rather than reporting a move that happened as a move that
  did not.
- Browser tab control: `tab_new` and `tab_switch`. `tabs` reported which page
  was `active` while nothing could change it, and the `tabIndex` schema field
  existed but was read only by `close` — so a link that opened a new tab
  stranded the session. `tab_new` accepts an optional `url` and runs the same
  `assertSafeUrl` destination check `navigate` does, so it is not a route around
  the domain allowlist. Every tab action now returns the renumbered tab list,
  since opening, switching, and closing all shift the indices and a caller would
  otherwise be acting on a stale one.
- History and tab actions classify as `read` rather than `mutate`: they move
  where the session is looking, they do not act on a document. Stepping back or
  switching tabs therefore costs no typed approval. Actions that drive the page
  are unchanged, and an eval scenario pins both halves — that `back` and
  `tab_switch` are reads, and that `click` still reaches approval.

### Changed

- Terminal commands run on Windows. Three defects compounded into a deadlock
  where **no spelling of an allowlisted command worked**: the policy allowlist
  compared a raw basename against extension-less entries, so `npm.cmd` was
  denied; `spawn` runs without a shell and does not apply `PATHEXT`, so bare
  `npm` never resolved; and a `.cmd` shim cannot be executed by `CreateProcess`
  at all. Policy now normalises executable suffixes on both the allowlist *and*
  the unconditional deny list, so `powershell.exe` is still refused, and a
  Windows command is resolved across `PATH` x `PATHEXT` before spawning, with
  batch shims dispatched through `cmd.exe /d /s /c` under explicit per-argument
  quoting. Arguments containing `%` or `!` are refused rather than quoted
  unsafely, because `cmd.exe` expands those inside quotes and the allowlist
  would otherwise be bypassable through an argument. The working directory is
  deliberately not searched for a bare command, so a `git.cmd` dropped in the
  workspace cannot shadow the allowlisted `git`.
- `terminal start` no longer reports success for a process that failed to
  start. `spawn` signals a failed start asynchronously, so the call returned
  `started: true` with a job id for a process that never existed; it now waits
  for whichever of `spawn`/`error` settles first.
- A missing or non-executable program is reported as
  `terminal_command_not_found:<command>` / `terminal_command_not_executable:<command>`
  instead of a bare `ENOENT` naming only the syscall.
- Default `allowedCommands` includes the Windows read tools (`findstr`,
  `where`, `tasklist`) alongside the POSIX ones, and they classify as `read`
  so they do not require approval. The list stays platform-independent: an
  entry naming a program the host lacks is inert, failing at spawn rather than
  at policy.

- Browsing works on a fresh install. `createDefaultPolicy` previously shipped
  `allowedDomains: []` and `allowLocalhost: false`, and `melra init` wrote that
  file to disk, so **every** browser navigation failed with
  `browser_domain_not_allowed` until the operator hand-edited `policy.json`. The
  defaults are now `["*"]` and `true`. This does not widen the security boundary:
  `assertSafeUrl` independently rejects non-HTTP(S) schemes, URL credentials,
  private ranges, and cloud metadata (169.254/16), and resolves DNS before
  allowing a navigation so a public name cannot be rebound to a private address.
  The domain list is a narrowing control layered on that guard, not the guard
  itself. Operators who want an allowlist still set one explicitly.
- A mutation that declares no `requiredEvidence` now has the obvious
  post-condition derived from the operation instead of being denied outright — a
  `file write` gets `file_exists`, a `delete` gets `file_absent`, a `move` gets
  both, and a `memory put`/`delete` is held to the flag the adapter actually
  reports. The mutation-requires-evidence guarantee is unchanged: the task is
  verified against the derived predicate exactly as if the caller had written it,
  and an operation with no honest post-condition derivable from the request
  alone (a `terminal run`, a `memory clear`, which reports a count rather than a
  flag) is still blocked. Previously such callers hit a flat deny, had to guess
  the right predicate, and mostly gave up.

- Close the browser see/act loop. `browser inspect` reported each element as
  `{tag, role, name, type}` with nothing that could address it, and the old
  server's HTML extraction was gone, so a caller could read a page but not
  construct a target for it — the only route left was exact text matching. Each
  element now carries a `selector` anchored on the nearest `id`/`data-testid`
  ancestor (falling back to an `:nth-child` path), plus `index`, `id`, `testId`,
  `attributeName`, `placeholder`, `href`, `value`, `disabled`, and `checked`.
- Match `target.text` on substrings when an exact match finds nothing. Exact is
  still tried first, so precise callers keep precise behaviour, but a button
  rendered as `<button> Sign in </button>` no longer fails to match `Sign in`.
- Report a target that matches nothing as `browser_target_not_found:<target>` at
  resolution time instead of letting Playwright surface it as an opaque action
  timeout once `timeoutMs` expires.
- Scope `browser inspect` to a `target` when one is given, returning that
  element's `text` and `html` rather than the whole page. This restores the old
  server's `extract_text`/`extract_html` without adding an action.
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
