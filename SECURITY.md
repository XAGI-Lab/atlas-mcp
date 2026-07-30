# Security Policy

## Supported versions

MELRA is currently alpha software. Security fixes are applied to the
default branch and the latest tagged alpha once releases begin.

## Report a vulnerability

Use GitHub private vulnerability reporting for this repository. Do not include
secrets, exploit details, or customer information in a public issue.

Include:

- affected commit or version;
- affected platform;
- reproduction steps;
- impact;
- suggested mitigation, if known.

XAGI Labs will acknowledge a complete report within three business days and
provide an initial severity assessment within seven business days.

## Security boundaries

MELRA must not require:

- an MELRA account;
- hosted-service credentials;
- telemetry;
- non-public source code.

Mutating tools are explicitly classified, require expected evidence, and are
approval-gated. Evidence is structured and common secret forms are redacted
before persistence. A successful adapter response alone is not proof of goal
completion.

Local storage is not encrypted and is not a credential vault. Configure
`MELRA_HOME` in a private local directory with appropriate operating-system
permissions. Use a narrow domain and command allowlist, and run untrusted tasks
inside the documented container profile.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
