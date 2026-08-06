# Runnable examples

Each directory contains a complete task request accepted by:

```bash
pnpm melra run --request examples/<example>/task.json
```

Read-only examples execute immediately. Mutation examples request an exact
task-scoped approval phrase. Run them only in a disposable or reviewed
workspace.

Browsing works with the default policy, which allows any public destination and
blocks private, link-local, loopback, and cloud-metadata addresses at the runtime
regardless. The browser example ships a narrower policy that allows only
`example.com`, as a template for restricting a real install:

```bash
MELRA_POLICY=examples/04-browser-inspection/policy.json \
  pnpm melra run --request examples/04-browser-inspection/task.json
```

| Example | Capability | Expected result |
|---|---|---|
| `01-system-info` | system | runtime information |
| `02-verified-file-write` | file | file exists and content is verified |
| `03-terminal-check` | terminal | exit code and stdout are verified |
| `04-browser-inspection` | browser | allowlisted page URL and text are verified |
| `05-scoped-memory` | memory | a redacted, scoped record is stored |
| `06-computer-capabilities` | computer | detected adapter and limitations are reported |
| `07-project-decision-memory` | memory | a project procedure is stored with provenance |
