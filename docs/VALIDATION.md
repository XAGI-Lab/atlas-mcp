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

## Reproduce

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm evals
pnpm e2e
pnpm pack:check
docker build -t atlas-mcp:local .
docker run --rm atlas-mcp:local doctor
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

Pull request [#3](https://github.com/XAGI-Lab/atlas-mcp/pull/3) exercised
source commit `ede8281` through:

- [six Node jobs](https://github.com/XAGI-Lab/atlas-mcp/actions/runs/30357518365)
  across Linux, macOS, and Windows on Node 22 and 24;
- [CodeQL](https://github.com/XAGI-Lab/atlas-mcp/actions/runs/30357512893)
  for Actions workflows, JavaScript/TypeScript, and Python;
- [dependency review](https://github.com/XAGI-Lab/atlas-mcp/actions/runs/30357513471)
  and a separate
  [dependency audit](https://github.com/XAGI-Lab/atlas-mcp/actions/runs/30357513022);
- [Docker build, doctor, and actual MCP smoke](https://github.com/XAGI-Lab/atlas-mcp/actions/runs/30357515676);
- [DCO validation](https://github.com/XAGI-Lab/atlas-mcp/actions/runs/30357515885).

## Immutable release evidence

Release [`v0.1.0-alpha.1`](https://github.com/XAGI-Lab/atlas-mcp/releases/tag/v0.1.0-alpha.1)
was built from main commit `b2ca3cd1` by
[release workflow run 30359767921](https://github.com/XAGI-Lab/atlas-mcp/actions/runs/30359767921).
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
