# Installation and client setup

## Everything in one command

If you want a working install without reading the rest of this page:

```bash
npx @melra/cli@alpha setup
```

`setup` writes a safe local policy, prints an MCP client configuration that
names a command your client can actually spawn, and runs every readiness check
— in one step, with nothing installed beforehand. Add
`--client claude|cursor|vscode|codex|generic` to label the configuration for a
specific client. It exits non-zero if any readiness check fails, and it never
overwrites an existing policy.

Paste the printed `mcpServers.melra` object into your client's MCP
configuration and you are done. The rest of this page covers the other install
paths, every environment variable, and the hardened Docker invocation.

## Requirements

- Node.js 22 or newer.
- Chrome, Chromium, or Edge for browser tasks.
- pnpm 9.5 only when building from source.
- Python 3.11 or newer only when using the Python SDK.

Run the readiness check on its own at any time:

```bash
melra doctor
```

The command reports Node, workspace, data-directory, SQLite, browser,
computer-use adapter, and policy readiness without exposing credentials. Unlike
`setup`, it writes nothing.

## Install

Pick one. npm is the shortest path if you already have Node; the container
needs no Node install; the release tarball is a prebuilt Node runtime; source
is for development.

### npm

```bash
npx @melra/cli@alpha setup
```

`@alpha` is the dist-tag for the current alpha. Drop it once a stable release
exists, or pin an exact version such as `@melra/cli@0.3.0-alpha.4`. To keep a
resolved copy on the machine instead of resolving on every run:

```bash
npm install -g @melra/cli@alpha
melra setup
```

Both forms produce a correct client configuration: run through `npx` and the
generated config launches the server through `npx` at the exact version that
wrote it, because an `npx` install leaves no `melra` on your `PATH`.

Packages are published with npm provenance attestation, so the registry links
each tarball to the exact commit and workflow run that produced it.

### Container

```bash
docker run --rm ghcr.io/xagi-lab/melra:alpha doctor
```

Images are published for `linux/amd64` and `linux/arm64` with build
provenance and an SBOM attested to the registry. Use `:alpha` for the latest
alpha or pin an exact tag such as `:v0.3.0-alpha.4`. See
[Docker](#docker) below for the hardened `serve` invocation an MCP client
should use.

### Release tarball

Every tagged release attaches a prebuilt Node runtime. Download it from the
[releases page](https://github.com/XAGI-Lab/melra/releases), verify it against
the published `SHA256SUMS`, then run it:

```bash
tar -xzf melra-node-<version>.tar.gz -C melra
node melra/dist/index.js doctor
```

Add `melra/dist/index.js` to your `PATH` as `melra`, or use the full path in
the client configurations below.

### From source

```bash
git clone https://github.com/XAGI-Lab/melra.git
cd melra
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm melra doctor
```

Use `pnpm melra` in place of `melra` in the configurations below.

## Local configuration

MELRA uses these environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `MELRA_WORKSPACE` | Hard boundary for file and process operations | current directory |
| `MELRA_HOME` | SQLite database and browser artifacts | `~/.melra` |
| `MELRA_POLICY` | Optional local policy JSON | safe built-in policy |
| `MELRA_BROWSER` | Chrome, Chromium, or Edge executable | auto-detected |
| `MELRA_PAYLOAD_KEY` | Optional canonical base64url 256-bit payload key | private `<MELRA_HOME>/payload.key` |

Back up `payload.key` with the SQLite files. Changing or losing it makes
persisted task and workflow payloads unreadable. Never place it in a client
configuration committed to source control.

These three variables exist for benchmark and diagnostic harnesses. Leave them
unset for normal use, which keeps the default isolated browser behavior:

| Variable | Purpose | Default |
|---|---|---|
| `MELRA_BROWSER_CDP_ENDPOINT` | Attach to an already-running browser over CDP instead of launching one. Must be an `http`/`https` URL with no credentials, query, or fragment. | unset (MELRA launches its own browser) |
| `MELRA_BROWSER_CDP_CONTEXT_INDEX` | Which existing browser context to use, or `-1` for the default context. Requires `MELRA_BROWSER_CDP_ENDPOINT`. | unset |
| `MELRA_BROWSER_HAR_PATH` | Absolute path for an HTTP archive recording of the session. | unset (no recording) |

Attaching over CDP and recording a HAR are mutually exclusive; setting both
fails at startup. A HAR captures full request and response data, including
cookies, headers, and form bodies — treat the file as a secret and never commit
it.

Generate a safe starter policy and a client configuration without running the
readiness checks:

```bash
melra init --client generic
```

Neither `init` nor `setup` overwrites an existing policy.

The generated policy allows any public browser destination
(`allowedDomains: ["*"]`) and localhost, so browsing works without editing
anything. That list is a *narrowing* control, not the safety boundary: the
browser runtime independently refuses non-`http(s)` protocols, URL credentials,
private and link-local ranges, and cloud metadata (`169.254/16`), and it resolves
DNS before allowing a navigation so a public name cannot be rebound to a private
address. To restrict which public sites are reachable, replace `"*"` with the
domains a task actually needs — `examples/04-browser-inspection/policy.json` is
a worked example that allows only `example.com`.

Mutations default to `"confirm"`: every non-read operation returns a
task-scoped approval phrase that must be echoed back before it runs. Set
`"mutations": "deny"` for a read-only install.

## MCP clients

Use the client’s `mcpServers` configuration field:

```json
{
  "mcpServers": {
    "melra": {
      "command": "melra",
      "args": ["serve"],
      "env": {
        "MELRA_WORKSPACE": "/absolute/path/to/your/workspace",
        "MELRA_HOME": "/absolute/path/to/local/melra-data",
        "MELRA_POLICY": "/absolute/path/to/local/melra-data/policy.json"
      }
    }
  }
}
```

If you have not installed anything, `npx` needs no install step at all — the
client resolves the package itself:

```json
{
  "mcpServers": {
    "melra": {
      "command": "npx",
      "args": ["-y", "@melra/cli@alpha", "serve"],
      "env": {
        "MELRA_WORKSPACE": "/absolute/path/to/your/workspace",
        "MELRA_HOME": "/absolute/path/to/local/melra-data",
        "MELRA_POLICY": "/absolute/path/to/local/melra-data/policy.json"
      }
    }
  }
}
```

Pin an exact version instead of `@alpha` if you want the server to stay fixed
until you change it; `@alpha` picks up each new alpha on first launch.

Otherwise replace `melra` with the absolute path to `dist/index.js` from the
release tarball, or use `docker` with the arguments in [Docker](#docker) below.

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
docker build -t melra:local .
docker run --rm melra:local doctor
```

Run the stdio server with explicit writable boundaries:

```bash
docker run --rm -i \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --tmpfs /tmp:size=256m,mode=1777 \
  -v "$PWD:/workspace" \
  -v melra-data:/data \
  melra:local serve
```

For an MCP client, set `command` to `docker` and use the arguments above,
including `-i`. Do not use `-t`; stdio MCP requires clean JSON-RPC streams.

## Python SDK

For repository development:

```bash
uv sync --project sdk-py
uv run --project sdk-py pytest sdk-py
```

Both SDKs expose task and durable workflow methods. They launch or connect to
the same stdio server and do not implement a separate execution engine.

## Uninstall and local-data deletion

Stop all clients using the server, remove the installed package or container,
then delete the directory configured by `MELRA_HOME`. That directory is the
complete local persistence boundary for tasks, workflows, events, encrypted
payloads, receipts, certificates, memory, keys, and browser artifacts.
Workspace files changed by approved tasks are not deleted automatically.
