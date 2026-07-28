# Security Policy

## Supported versions

ATLAS MCP is currently pre-alpha. Security fixes are applied to the default
branch until the first versioned release.

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

ATLAS MCP must not require:

- an ATLAS account;
- hosted-service credentials;
- telemetry;
- non-public source code.

Mutating tools must be explicitly classified and gated. Evidence must redact
secrets. A successful API response alone is not proof of goal completion.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
