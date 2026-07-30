# Threat model

Status: reviewed for `0.2.0-alpha.1`; independent review pending.

## Assets

- user files and approved workspace changes;
- process environment and local credentials;
- browser sessions and downloaded artifacts;
- local memory, tasks, receipts, and certificates;
- release artifacts and the update channel.

## Trust boundaries

- MCP client to strict request schemas;
- planned operation to local policy;
- scoped approval to execution;
- runtime adapter to operating system or network;
- observed result to deterministic verifier;
- redacted structured evidence to SQLite;
- source commit to released artifact.

The MCP client and task content are potentially hostile. The host operating
system and the configured local policy are trusted. MELRA is not a security
boundary against a fully compromised host.

## Threats and controls

| Threat | Current control | Residual risk |
|---|---|---|
| Prompt-driven destructive action | effect classification, required evidence, exact scoped approval | user may approve a misleading but accurately displayed operation |
| Argument or schema smuggling | strict schemas reject unknown fields | semantic intent can still be ambiguous |
| Unbounded retries | read-only retry budget; one attempt for mutations | independent tasks can repeat the same request |
| False completion | explicit predicates and `partial` status | a weak caller-chosen predicate may prove too little |
| Path traversal | lexical and realpath confinement; symlink tests | host race conditions outside the configured workspace model |
| Shell injection | direct process spawn; shell and privilege commands denied | an allowed executable can interpret dangerous arguments |
| Process escape | cwd confinement, environment allowlist, time/output bounds | processes are not OS-sandboxed outside the container profile |
| SSRF and metadata access | URL validation, DNS resolution, per-request interception | malicious public endpoints remain reachable when domains allow them |
| DNS rebinding | repeated resolved-address validation | a resolver change between validation and browser connection remains possible |
| Malicious downloads/uploads | path confinement and artifact hashes | file content is not malware-scanned |
| Unintended computer input | typed actions, named-key allowlist, high-risk approval | focus can change between approval and action |
| Desktop observation leakage | local-only screenshot artifact with explicit invocation | screenshots may contain sensitive on-screen data |
| Secret persistence | terminal and memory redaction before persistence | novel secret formats may not match patterns |
| Memory poisoning | explicit mutation approval, scopes, provenance | content-level poisoning classifier is not implemented |
| Receipt tampering | canonical digests and task-linked certificate | local database has no encrypted authenticated storage |
| Dependency compromise | lockfiles, dependency review, CodeQL, SBOM | upstream compromise before detection remains possible |
| Release substitution | checksums and signed GitHub/Sigstore provenance | trust still depends on GitHub identity and workflow protection |

## Approval properties

An approval challenge contains:

- a random approval ID;
- the task ID;
- a digest of the exact operation;
- an exact phrase;
- an expiration time.

Approvals cannot be reused for a different task or operation. Policy is
re-evaluated after approval and immediately before execution.

## Network policy

Browser requests reject:

- loopback unless explicitly enabled;
- private, link-local, multicast, and unspecified addresses;
- cloud metadata endpoints;
- hostnames resolving to a disallowed address;
- redirects and subresources that cross the same checks.

A domain allowlist controls intended public destinations. Wildcard domain
access is convenient for local experimentation but should be replaced with
specific domains in reviewed policies.

## Non-goals for `0.2`

- protecting against a compromised operating system or browser binary;
- deterministic proof from model judgment;
- arbitrary native extensions;
- malware scanning;
- encrypted credential storage;
- remote multi-tenant execution;
- protecting computer input from a malicious accessibility service or
  compromised desktop session.

## Required work before stable release

- OS-level sandbox profiles outside Docker;
- content-level memory-poisoning defenses;
- browser download scanning hooks;
- active-window, focus, secure-input, and multi-display verification;
- post-action desktop observation and task-specific evidence fixtures;
- crash-safe recovery rules;
- fuzzing for schemas, paths, receipts, and network policy;
- independent security review and public remediation record.
