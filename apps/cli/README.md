# MELRA CLI

Install and initialize:

```bash
npm install --global @melra/cli
melra doctor
melra init --client generic
```

The CLI starts with a local policy that allows reads outright and gates every
mutation: a consequential operation requires declared evidence and an exact,
task-scoped approval phrase before it runs.
