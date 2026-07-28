# Validation

## Current branch evidence

Date: 2026-07-28

Version: `0.1.0-alpha.0`

Host exercised locally: macOS arm64, Node.js 24.10, Python 3.11

| Gate | Result |
|---|---|
| Package-version consistency | passed |
| TypeScript build and strict typecheck | passed across 14 workspace projects |
| TypeScript/Vitest cases | 55 passed |
| Deterministic evaluation scenarios | 21 of 21 passed |
| Python lint | passed |
| Python SDK interoperability test | 1 passed |
| Node production dependency audit | no known vulnerabilities |
| Python locked dependency audit | no known vulnerabilities |
| Official TypeScript SDK over real stdio | 6 end-to-end cases passed |
| Installed Chrome browser fixture | navigation and page verification passed |
| Docker image build | passed |
| Container doctor | Node, workspace, data, SQLite, browser, policy passed |
| Official SDK through hardened Docker stdio | discovery, execution, receipt passed |

The end-to-end suite verifies:

- discovery of exactly six MCP tools;
- durable planning and system execution;
- exact task-scoped approval for a file mutation;
- shell-free terminal execution with exit-code and stdout predicates;
- scoped memory persistence and retrieval;
- real installed-browser navigation with URL and page-text evidence;
- receipt retrieval and a 64-character SHA-256 certificate digest.

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

The tag workflow is defined to produce an SPDX SBOM, SHA-256 checksums,
GitHub/Sigstore provenance, release assets, and an attested container. Its
immutable run will be linked from the first tagged release.

## Remaining named-client and platform gates

The current verified client is the official MCP TypeScript and Python SDKs.
Before the first tagged alpha is called broadly installable, the built artifact
must also be exercised in the then-current versions of:

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
- Computer use, OCR/visual targeting, interactive PTY, semantic memory, and
  extension loading remain roadmap items.
- Node’s built-in SQLite API emits an experimental warning on Node 22/24.
- Alpha database downgrades and migrations are not guaranteed.
