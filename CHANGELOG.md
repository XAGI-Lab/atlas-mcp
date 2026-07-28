# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases use
[Semantic Versioning](https://semver.org/) after `1.0`.

## [Unreleased]

### Added

- Compact six-tool MCP stdio server.
- Durable task lifecycle with policy, scoped approvals, budgets, cancellation,
  verification, receipts, and execution certificates.
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

[Unreleased]: https://github.com/XAGI-Lab/atlas-mcp/compare/main...HEAD
