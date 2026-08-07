# MELRA CLI

Everything in one command, with nothing installed beforehand:

```bash
npx @melra/cli@alpha setup
```

`setup` writes a safe local policy, prints an MCP client configuration you can
paste straight into your client, and runs every readiness check (Node,
workspace, SQLite, browser, computer-use adapter, policy). It exits non-zero if
a check fails and never overwrites an existing policy.

To keep a resolved copy on the machine instead of resolving on every run:

```bash
npm install --global @melra/cli@alpha
melra setup
```

Either way the generated configuration names a command your client can actually
spawn: run through `npx` and it launches the server through `npx` at the exact
version that wrote the config, since an `npx` install leaves no `melra` on your
`PATH`.

Individual steps are still available: `melra doctor` checks readiness and writes
nothing, `melra init` writes the policy and config without checking. Run
`melra help` for the full command list.

The CLI starts with a local policy that allows reads outright and gates every
mutation: a consequential operation requires declared evidence and an exact,
task-scoped approval phrase before it runs.

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)
