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
