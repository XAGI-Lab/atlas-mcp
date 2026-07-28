# Compatibility policy

## Version status

`0.x` releases are pre-stable. Minor alpha releases may change task schemas,
package names, CLI output, receipt fields, and policy configuration. Patch
releases should remain backward compatible unless a security fix requires an
explicitly documented break.

`1.0` will introduce:

- semantic versioning for public MCP, JSON, CLI, and SDK contracts;
- a documented deprecation window;
- schema migration rules for durable local data;
- stable receipt verification behavior.

## Supported runtimes

| Component | Supported |
|---|---|
| Node.js | 22 and 24 |
| pnpm | 9.5 for repository builds |
| Python SDK | CPython 3.11+ |
| Container | Linux OCI runtime |
| Browser | installed Chrome, Chromium, or Edge |
| MCP transport | stdio |

CI definitions cover current GitHub-hosted Linux, macOS, and Windows runners on
Node 22 and 24. A CI definition is not equivalent to a clean-machine release
certification; actual evidence is tracked in [VALIDATION.md](VALIDATION.md).

## MCP clients

The normative compatibility target is the Model Context Protocol TypeScript SDK
`1.30.x` and Python SDK `1.28.x` over stdio.

Claude Desktop, Cursor, VS Code, and other clients can use the documented stdio
configuration. A named client is marked verified only after the released
artifact—not a source checkout—passes discovery, planning, approval, execution,
cancellation, and receipt retrieval in that client.

## Data and schema migration

The alpha SQLite schema is created automatically. Downgrades and cross-version
migrations are not yet guaranteed. Back up `ATLAS_MCP_HOME` before upgrading an
alpha release. Never place that directory inside a publicly synchronized
workspace.

## Language interoperability

SDK implementations in any language must pass the same discovery, task,
approval, error, receipt, and certificate fixtures. Language-specific helpers
may be idiomatic, but they must not change server policy or verification
semantics.
