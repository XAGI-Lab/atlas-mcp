# Validation

## Current branch evidence

Date: 2026-07-28

Version: `0.2.0-alpha.1`

Host exercised locally: macOS arm64, Node.js 24.10, Python 3.11

| Gate | Result |
|---|---|
| Package-version consistency | passed |
| TypeScript build and strict typecheck | passed across 15 packages/apps |
| TypeScript/Vitest cases | 72 passed |
| Deterministic evaluation scenarios | 22 of 22 passed |
| Python lint | passed |
| Python SDK interoperability test | 1 passed |
| Node production dependency audit | no known vulnerabilities |
| Python locked dependency audit | no known vulnerabilities |
| Official TypeScript SDK over real stdio | 7 end-to-end cases passed |
| Installed Chrome browser fixture | navigation and page verification passed |
| Docker image build | passed |
| Local hardened Docker MCP smoke | discovery, execution, receipt passed |
| Released Linux AMD64 image | passed through hardened MCP stdio smoke |
| Released Linux ARM64 image | passed through hardened MCP stdio smoke |
| Container doctor | Node, workspace, data, SQLite, browser, policy passed |
| Official SDK through hardened Docker stdio | discovery, execution, receipt passed |

The end-to-end suite verifies:

- discovery of exactly six MCP tools;
- durable planning and system execution;
- exact task-scoped approval for a file mutation;
- shell-free terminal execution with exit-code and stdout predicates;
- scoped memory persistence and retrieval;
- hybrid memory ranking, episode context, speaker matching, expiry, and
  supersession behavior;
- in-place migration from the previous SQLite memory schema;
- real installed-browser navigation with URL and page-text evidence;
- read-only computer adapter capability discovery;
- receipt retrieval and a 64-character SHA-256 certificate digest.

Public benchmark artifacts were also regenerated:

- LoCoMo objective evidence retrieval: 1,982 questions, coverage@20
  `0.759652`, complete evidence recall@20 `0.716448`, p50 `21.060 ms`,
  zero model/embedding/network calls;
- planted-fact memory regression: 100/100 Recall@1;
- browser stable-DOM fixture: static p50 `183.703 ms` and slow-render
  correctness 10/10;
- terminal: 30/30 verified shell-free process executions;
- computer: 30/30 read-only capability probes.

The container smoke test uses a read-only root filesystem, drops all Linux
capabilities, sets `no-new-privileges`, and permits writes only to an explicit
workspace, data directory, and bounded temporary filesystem.

## Browser-agent benchmark harness evidence

Date: 2026-07-29

Branch: `coder/representative-browser-benchmark`

Host exercised locally: macOS arm64 (Darwin 25.5.0), Node.js 24, Python 3.11.14

| Gate | Result |
|---|---|
| `pnpm check` | passed (versions, strict typecheck, tests, Python) |
| TypeScript/Vitest cases | 76 passed |
| `pnpm evals` | 22 of 22 scenarios passed, 0 failed |
| `pnpm e2e` | 7 end-to-end cases passed over real stdio |
| `pnpm pack:check` | passed |
| `pnpm security:audit` | no known vulnerabilities, Node and Python |
| `pnpm benchmark:browser:check` | ruff clean, 24 pytest cases passed |
| `pnpm benchmark:browser:verify-upstream` | `suite=webarena-verified-hard-30-v1 tasks=30 unique_templates=30` |
| Both benchmark extras installed | `browsergym-miniwob==0.14.3` and `webarena-verified==1.2.3` resolve; 24 pytest cases passed |

This verifies the harness, not a browser-agent score.

### Accepted dependency risk

One advisory is knowingly allowed in the dependency-review gate:
**GHSA-vfmq-68hx-4jfw** (`lxml < 6.1.0`, high) — XXE through the default
`iterparse()` and `ETCompatXMLParser()` configuration.

| Question | Answer |
|---|---|
| How does it enter? | Transitively via `browsergym-core`, behind the optional `miniwob` extra of `benchmarks/browser-agent` |
| Is it in a shipped artifact? | No. Neither the published CLI nor the Python SDK installs it |
| Why not patch it? | `browsergym-core==0.14.3` requires `lxml>=4.9,<6.0.0`; the fix lands in 6.1.0, and the browsergym version is frozen by the pre-registered manifests |
| What would patching cost? | Invalidating the registered upstream selection that `verify-upstream` enforces |
| Exposure | XML parsed from a local MiniWoB instance on a developer machine, not untrusted input |
| Exit condition | Revisit when `browsergym-core` relaxes its `lxml` cap, re-register the upstream pins, then remove the allowance |

The allowance names exactly one GHSA, so any other advisory in the benchmark
dependency tree still fails the gate.

**No representative browser-agent result is published, and none is claimed.**
`docs/research/results/` deliberately contains no
`browser-agent-benchmark.json`. Two prerequisites are outstanding and are both
approval-gated by design:

- the 125-task MiniWoB development run needs an authorized model and a
  credential in the environment named by the agent configuration;
- the `WebArena-Verified Hard-30 registered subset` run needs the six official
  site containers. The registered 30 tasks span all six families
  (`gitlab` 9, `shopping` 7, `reddit` 7, `shopping_admin` 6, `wikipedia` 4,
  `map` 3), so none can be dropped without breaking the pre-registration.
  WebArena's own setup guide provisions a 1,000 GB volume per instance and
  notes the map backend alone is a ~180 GB download; this host has 107 GiB
  free, so the run needs an explicitly authorized environment.

Until both complete, the run manifest stays unfrozen and the publication gate
has nothing to accept. Any score quoted before then is unsupported.

## Reproduce

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm evals
pnpm e2e
pnpm pack:check
pnpm security:audit
pnpm benchmark:browser:check
pnpm benchmark:browser:verify-upstream
docker build -t melra:local .
docker run --rm melra:local doctor
pnpm docker:smoke
```

Evaluation reports are generated under `evals/results/` and are intentionally
ignored by Git because timestamps and local paths vary. Release evidence must
be attached to the immutable release or workflow run.

## Security behavior covered

- traversal and symlink escapes are rejected;
- disallowed commands and shell interpreters are rejected;
- terminal working directories remain inside the workspace;
- output and memory secret patterns are redacted;
- raw operation input and output are not retained in durable task evidence;
- private and metadata network targets are rejected;
- mutations without required evidence are policy-blocked;
- wrong or missing approval phrases are rejected;
- read retries are bounded and mutations are not retried;
- wall-clock budget exhaustion is distinguished from user cancellation;
- failed verification cannot become `verified_success`;
- memory reads and deletion remain scope-aware.
- computer input is classified high-risk and requires scoped approval.

## CI evidence

Pull request [#3](https://github.com/XAGI-Lab/melra/pull/3) exercised
source commit `ede8281` through:

- [six Node jobs](https://github.com/XAGI-Lab/melra/actions/runs/30357518365)
  across Linux, macOS, and Windows on Node 22 and 24;
- [CodeQL](https://github.com/XAGI-Lab/melra/actions/runs/30357512893)
  for Actions workflows, JavaScript/TypeScript, and Python;
- [dependency review](https://github.com/XAGI-Lab/melra/actions/runs/30357513471)
  and a separate
  [dependency audit](https://github.com/XAGI-Lab/melra/actions/runs/30357513022);
- [Docker build, doctor, and actual MCP smoke](https://github.com/XAGI-Lab/melra/actions/runs/30357515676);
- [DCO validation](https://github.com/XAGI-Lab/melra/actions/runs/30357515885).

## Immutable release evidence

Release [`v0.1.0-alpha.1`](https://github.com/XAGI-Lab/melra/releases/tag/v0.1.0-alpha.1)
was built from main commit `b2ca3cd1` by
[release workflow run 30359767921](https://github.com/XAGI-Lab/melra/actions/runs/30359767921).
Both the artifact and container jobs passed.

- All five downloadable archives and distributions passed the published
  `SHA256SUMS` manifest.
- GitHub attestation verification passed for the Node runtime archive and
  Python wheel.
- The public container index
  `sha256:ec34cccf003a9555aeb4a2939f4c35e589c84661fcbae1ef1c08bdbdb206e76d`
  contains Linux AMD64 and ARM64 manifests, each with SBOM and provenance
  attestations.
- Both published architectures were pulled from GHCR without package
  credentials and exercised through an actual hardened MCP stdio session.
- Each session discovered exactly six tools, reached `verified_success`, and
  produced a `VERIFIED_SUCCESS` certificate with a 64-character SHA-256 digest.

## Remaining named-client and platform gates

The current verified client is the official MCP TypeScript and Python SDKs.
Before an alpha is called broadly installable, the built artifact must also be
exercised in the then-current versions of:

- Claude Desktop;
- Cursor;
- VS Code’s MCP support;
- at least one additional independent MCP inspector or client.

Before `1.0`, a clean released artifact must pass on supported Linux, macOS, and
Windows machines, and an independent security review must resolve all critical
findings.

## Known alpha limitations

- Stdio is the only transport.
- One task contains one typed operation.
- Interrupted mutation tasks are durable but not automatically resumed.
- Browser sessions are isolated and non-persistent.
- Computer screenshot and input adapters are alpha; OCR/visual targeting,
  accessibility targeting, Windows input, focus verification, interactive
  PTY, semantic embeddings, and extension loading remain roadmap items.
- Node’s built-in SQLite API emits an experimental warning on Node 22/24.
- Alpha database downgrades and migrations are not guaranteed.
