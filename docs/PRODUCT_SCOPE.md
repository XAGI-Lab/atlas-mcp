# Product Scope

ATLAS MCP is an execution runtime for MCP clients.

## In scope

- planning and execution of bounded tasks;
- capability declarations;
- user approval for side effects;
- retry, cancellation, timeout, and circuit-breaking behavior;
- local adapters;
- structured verification;
- evidence receipts;
- local durable state;
- governed local browser and supported computer-use operations;
- MCP client compatibility;
- safety and conformance testing.

## Not in scope for the initial release

- a hosted account requirement;
- mandatory telemetry;
- an unbounded collection of low-level tools;
- silent approval of consequential actions;
- treating model judgment as deterministic proof;
- arbitrary native plugins without isolation;
- claims that cannot be reproduced from published evidence.

## Intended users

- developers building MCP clients;
- teams evaluating agent execution safety;
- contributors building adapters and verifiers;
- users who want local, inspectable automation.
