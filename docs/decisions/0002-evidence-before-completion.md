# ADR 0002: Evidence before completion

Status: accepted
Date: 2026-07-28

## Context

A tool invocation can succeed while the intended user outcome still fails.
Examples include acting in the wrong window, sending to the wrong target, or
receiving an accepted response before processing completes.

## Decision

A mutation cannot be reported as complete until a structured verifier checks
the result against an explicit expectation.

Screenshots and unstructured model judgment may support diagnosis but are not
deterministic proof.

## Consequences

- Mutation adapters must declare verification strategies.
- A later mutation invalidates earlier proof.
- Receipts distinguish tool success from verified task success.
- The expectation is currently supplied by the caller on `TaskRequest`, so a
  trivially satisfiable predicate can be declared and satisfied. Policy forces
  a mutation to declare *some* evidence, not necessarily meaningful evidence.
  Subject binding and connector-owned predicate definitions are required
  before this decision provides the guarantee its title implies.
- Filesystem predicates independently re-read state. Result, terminal, URL,
  and page predicates evaluate the acting adapter's returned observation, so
  they prove what the adapter reported rather than independently proving the
  external effect.
- Read-only operations with no declared evidence receive a synthetic
  `operation_completed` item and may reach `verified_success`. The mandatory
  evidence invariant currently applies to mutations.
