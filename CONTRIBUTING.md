# Contributing to MELRA

Thank you for helping make agent execution safer, more reliable, and easier to
verify.

## Before you start

- Read [GOVERNANCE.md](GOVERNANCE.md).
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- For security-sensitive work, read [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
- Search existing issues and discussions before opening a new proposal.

### Does this belong in MELRA?

MELRA is the layer below reasoning: the LLM reasons, the harness manages the
loop, MELRA owns the effect lifecycle. One question settles most scope
arguments before they start:

> **Would this feature still make sense if the effect request came from
> ordinary deterministic software rather than an LLM?**

Yes — authorization, capabilities, idempotency, credential isolation, recovery,
verification, effect history. It belongs here.

No — prompt optimization, model selection, conversation memory, a planner,
agent personality, subagent reasoning. It belongs to the harness above, and
adding it here would make MELRA's guarantees depend on a model's judgement.

## Development setup

```bash
pnpm install
pnpm check
```

Use Node.js 22 or newer and pnpm 9.5.

## Pull requests

Keep changes focused. A pull request should include:

- the problem and intended user outcome;
- tests for new or changed behavior;
- security and compatibility impact;
- documentation for public contracts.

Protocol, policy, storage, and release changes require maintainer review.

Do not contribute customer data, credentials, deployment identifiers, private
prompts, billing records, or code you do not have the right to license.

## Developer Certificate of Origin

By contributing, you certify the Developer Certificate of Origin 1.1:

<https://developercertificate.org/>

Sign commits with:

```text
Signed-off-by: Your Name <your-email@example.com>
```

## Reporting security problems

Do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md).
