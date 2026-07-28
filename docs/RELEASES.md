# Release process

## Release channels

- `v0.x.y-alpha.n`: engineering preview.
- `v0.x.y-beta.n`: feature-complete candidate with documented gaps.
- `v0.x.y`: stable within the `0.x` compatibility policy.
- `v1.x.y`: stable public contracts and migrations.

## Maintainer checklist

1. Confirm the version is identical in the protocol, Node packages, and Python
   package.
2. Run `pnpm check`, `pnpm evals`, `pnpm e2e`, `pnpm pack:check`, and
   `pnpm security:audit`.
3. Build the Docker image and run `atlas-mcp doctor` plus an actual stdio MCP
   session inside it.
4. Run dependency, secret, license, and public-content scans.
5. Record the supported OS and named-client results in `VALIDATION.md`.
6. Review `SECURITY.md`, the threat model, compatibility notes, and changelog.
7. Create a signed, protected `v*` tag only from an approved main-branch commit.

## Automated artifacts

The tag workflow:

- rebuilds and tests from the immutable tag;
- creates a portable Node runtime archive;
- creates Python wheel and source distributions;
- creates a source archive;
- generates an SPDX JSON SBOM;
- writes SHA-256 checksums;
- generates signed Sigstore-backed GitHub provenance attestations;
- publishes the artifacts to the GitHub release;
- builds and publishes the container to GitHub Container Registry with
  provenance.

Verify downloaded artifacts:

```bash
sha256sum --check SHA256SUMS
gh attestation verify <artifact> --repo XAGI-Lab/atlas-mcp
```

Artifact attestations prove which GitHub workflow built a digest. They do not
replace code review, dependency review, or runtime sandboxing.

## Rollback

Releases are immutable. If a release is unsafe:

1. mark it clearly in the GitHub release notes;
2. publish a security advisory when appropriate;
3. publish a fixed version rather than replacing existing artifacts;
4. document local-data migration or recovery steps;
5. remove a container tag only when continued distribution creates greater
   harm, while retaining the advisory and audit trail.
