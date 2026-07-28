# Runnable examples

Each directory contains a complete task request accepted by:

```bash
pnpm atlas run --request examples/<example>/task.json
```

Read-only examples execute immediately. Mutation examples request an exact
task-scoped approval phrase. Run them only in a disposable or reviewed
workspace.

Browser access is denied by default. The browser example includes a narrowly
scoped policy that allows only `example.com`:

```bash
ATLAS_MCP_POLICY=examples/04-browser-inspection/policy.json \
  pnpm atlas run --request examples/04-browser-inspection/task.json
```

| Example | Capability | Expected result |
|---|---|---|
| `01-system-info` | system | runtime information |
| `02-verified-file-write` | file | file exists and content is verified |
| `03-terminal-check` | terminal | exit code and stdout are verified |
| `04-browser-inspection` | browser | allowlisted page URL and text are verified |
| `05-scoped-memory` | memory | a redacted, scoped record is stored |
