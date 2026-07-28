# Threat Model

Status: initial review draft.

## Assets

- user files and credentials;
- external accounts reachable through tools;
- task inputs and outputs;
- evidence receipts;
- the local execution environment;
- release artifacts and the update channel.

## Trust boundaries

- MCP client to ATLAS MCP server;
- generated plan to policy decision;
- policy decision to adapter;
- adapter to operating system or external service;
- execution result to verifier;
- verifier to evidence storage.

## Primary threats

| Threat | Initial control |
|---|---|
| Prompt-driven destructive action | Explicit capability classification and approval |
| Repeated failing actions | Canonical retry guard and circuit breaker |
| False success claim | Structured verification after mutation |
| Path traversal or secret access | Scoped paths, deny rules, and regression tests |
| Network exfiltration | Explicit network capabilities and host controls |
| Receipt leaks secrets | Structured redaction before persistence |
| Tool implementation escape | Isolation and bypass regression tests |
| Supply-chain compromise | Locked dependencies, SBOM, provenance, and signing |
| Unexpected hosted dependency | Fresh-clone and offline-operation tests |

## Non-goals for the first release

- treating model judgment as deterministic proof;
- silently approving user-visible side effects;
- supporting arbitrary native plugins without isolation;
- protecting against a fully compromised host operating system.

## Required follow-up

- enumerate adapter-specific side effects;
- define the evidence-redaction schema;
- publish platform isolation guarantees and limitations;
- add abuse cases for every mutation-capable adapter;
- obtain an independent security review before stable release.
