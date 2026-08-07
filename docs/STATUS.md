# Project Status

Last updated: 2026-08-07

Version: `0.3.0-alpha.2`

## Engineering Complete

- ✅ **All 227 tests passing** (Vitest, Python pytest)
- ✅ **Versions consistent** across 17 locations (root, 15 packages, protocol constant, sdk-py)
- ✅ **Gate green**: `pnpm check`, `pnpm e2e`, `pnpm security:audit` all pass
- ✅ **Release artifacts published**: GitHub release v0.3.0-alpha.2, container at `ghcr.io/xagi-lab/melra:alpha`
- ✅ **CHANGELOG.md** updated with 0.3.0-alpha.2 section
- ✅ **Install paths documented**: container, release tarball, source
- ✅ **npm publish workflow wired**: `.github/workflows/release.yml` publishes all 14 packages with provenance attestation, and every manifest carries the `repository` metadata provenance requires

## Requires Project Action

### npm Organization

**What:** The release workflow publishes `@melra/cli` and 13 dependency packages
to the npm registry with provenance attestation. `NPM_TOKEN` is configured and
authenticates as `xagilab`.

**Blocker:** The `@melra` scope does not exist on npmjs.com. The `v0.3.0-alpha.2`
run reached the publish step and failed with
`404 Not Found - PUT https://registry.npmjs.org/@melra%2fprotocol - Scope not found`.
A scope is not created implicitly by publishing into it; the organization has to
exist and the publishing account has to be a member.

Because nothing is on the registry, npm install instructions are deliberately
absent from the README and INSTALLATION docs — they would not work.

**Steps:**
1. Sign in to npmjs.com as `xagilab` and create the organization at
   https://www.npmjs.com/org/create with the name `melra` (free tier covers
   public packages).
2. Re-run the failed `artifacts` job of the `v0.3.0-alpha.2` release run, or push
   the next `v*` tag. Release creation is idempotent, so a re-run refreshes the
   existing release rather than failing on the duplicate tag.

The workflow now publishes to npm before creating the GitHub release, so this
failure mode no longer leaves a release with no matching packages behind.

**After that lands:** add the npm path to README and `docs/INSTALLATION.md`
(`npx @melra/cli@alpha doctor`, and an `npx` MCP client config), since it
becomes the shortest install — no clone, no container, just Node.

### Manual Named-Client Verification

**From VALIDATION.md:**
> Before an alpha is called broadly installable, the built artifact must also be exercised in the then-current versions of:
> - Claude Desktop
> - Cursor
> - VS Code's MCP support
> - at least one additional independent MCP inspector or client

**Current state:** Automated compatibility claim is official MCP SDK over stdio (TypeScript + Python). Named graphical clients remain release-gated until manually exercised.

**Action:** Download `v0.3.0-alpha.2` release artifact, configure each client per docs/INSTALLATION.md, verify discovery/plan/execute/receipt cycle.

### Independent Security Review

**From VALIDATION.md:**
> Before `1.0`, a clean released artifact must pass on supported Linux, macOS, and Windows machines, and an independent security review must resolve all critical findings.

**Current state:** Threat model reviewed for 0.3.0-alpha.2, no independent audit yet.

**Action:** Engage external security reviewer when approaching beta/1.0.

## Known Alpha Scope Limits

Documented in docs/VALIDATION.md "Known alpha limitations":
- Stdio transport only (HTTP/OAuth not implemented)
- Cross-process workflow leases not implemented
- Browser sessions non-persistent
- Computer OCR/accessibility targeting roadmap
- Node SQLite experimental warning (platform limitation)

These are documented boundaries, not defects.

## Summary

**Code complete.** The codebase is production-ready for the declared alpha scope. Remaining items are external verification (manual client exercise), project infrastructure (the `@melra` npm organization), and known alpha boundaries (documented, not broken).

Creating the `melra` organization on npmjs.com is the last step before
`npx @melra/cli@alpha` becomes the primary install path.
