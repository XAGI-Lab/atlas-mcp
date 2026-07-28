# Installation and client setup

## Requirements

- Node.js 22 or newer.
- pnpm 9.5 for source installations.
- Chrome, Chromium, or Edge for browser tasks.
- Python 3.11 or newer only when using the Python SDK.

Run the readiness check after installation:

```bash
atlas-mcp doctor
```

The command reports Node, workspace, data-directory, SQLite, browser, and policy
readiness without exposing credentials.

## From source

```bash
git clone https://github.com/XAGI-Lab/atlas-mcp.git
cd atlas-mcp
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm atlas doctor
```

Use `pnpm atlas` in place of `atlas-mcp` in the configurations below.

## Local configuration

ATLAS MCP uses these environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `ATLAS_MCP_WORKSPACE` | Hard boundary for file and process operations | current directory |
| `ATLAS_MCP_HOME` | SQLite database and browser artifacts | `~/.atlas-mcp` |
| `ATLAS_MCP_POLICY` | Optional local policy JSON | safe built-in policy |
| `ATLAS_MCP_BROWSER` | Chrome, Chromium, or Edge executable | auto-detected |

Generate a safe starter policy and a client configuration:

```bash
atlas-mcp init --client generic
```

`init` does not overwrite an existing policy.

The generated policy starts with an empty browser-domain allowlist. Add only the
domains a task needs. To run the browser example, add `"example.com"` to
`allowedDomains`.

## MCP clients

Use the client’s `mcpServers` configuration field:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "atlas-mcp",
      "args": ["serve"],
      "env": {
        "ATLAS_MCP_WORKSPACE": "/absolute/path/to/your/workspace",
        "ATLAS_MCP_HOME": "/absolute/path/to/local/atlas-data",
        "ATLAS_MCP_POLICY": "/absolute/path/to/local/atlas-data/policy.json"
      }
    }
  }
}
```

This structure is accepted by Claude Desktop and clients that implement the
common MCP server configuration format. Cursor and VS Code use the same command,
arguments, and environment values but may place them under their own MCP
settings UI or file. Always follow the current client documentation for the
configuration-file location.

The repository’s automated compatibility claim is the official MCP SDK over
stdio. Named graphical clients remain release-gated until their current
versions have been manually exercised; see [VALIDATION.md](VALIDATION.md).

## Docker

Build and check the image:

```bash
docker build -t atlas-mcp:local .
docker run --rm atlas-mcp:local doctor
```

Run the stdio server with explicit writable boundaries:

```bash
docker run --rm -i \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --tmpfs /tmp:size=256m,mode=1777 \
  -v "$PWD:/workspace" \
  -v atlas-mcp-data:/data \
  atlas-mcp:local serve
```

For an MCP client, set `command` to `docker` and use the arguments above,
including `-i`. Do not use `-t`; stdio MCP requires clean JSON-RPC streams.

## Python SDK

For repository development:

```bash
uv sync --project sdk-py
uv run --project sdk-py pytest sdk-py
```

The SDK launches or connects to the same stdio server and does not implement a
separate execution engine.

## Uninstall and local-data deletion

Stop all clients using the server, remove the installed package or container,
then delete the directory configured by `ATLAS_MCP_HOME`. That directory is the
complete local persistence boundary for tasks, receipts, certificates, memory,
and browser artifacts. Workspace files changed by approved tasks are not
deleted automatically.
