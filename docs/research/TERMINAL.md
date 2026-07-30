# Terminal-use research

## Implemented execution model

MELRA launches an executable with a separate argument vector and
`shell: false`. It confines the working directory, filters environment
variables, bounds output and time, redacts secret patterns, and supervises
background job status, output, stop, and shutdown.

Policy independently denies shell interpreters and privilege-escalation tools,
even when a caller adds one to the general command allowlist.

## Local result

The public microbenchmark ran the current Node executable 30 times with a
fixed script and verified stdout plus exit code:

- verified executions: `30/30`;
- success rate: `1.0`;
- process latency: `48.087 ms` p50, `54.492 ms` p95;
- shell: `false`.

This measures local process startup and capture overhead, not arbitrary command
correctness or security against a compromised executable.

## Research findings

- Executable/argument separation removes a large class of shell-injection
  behavior but does not make an allowed executable harmless.
- Command classification and evidence requirements must be checked at
  execution time, not only when a task is planned.
- A timeout needs termination escalation and a truthful failed result.
- Output truncation and redaction must occur before durable task or receipt
  storage.
- Package installation and network-capable commands need higher risk
  classification than read-only inspection.
