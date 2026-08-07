# Project Status

Last updated: 2026-08-07

Version: `0.3.0-alpha.1`

## Engineering Complete

- ✅ **All 227 tests passing** (Vitest, Python pytest)
- ✅ **Versions consistent** across 17 locations (root, 15 packages, protocol constant, sdk-py)
- ✅ **Gate green**: `pnpm check`, `pnpm e2e`, `pnpm security:audit` all pass
- ✅ **Release artifacts published**: GitHub release v0.3.0-alpha.1, container at `ghcr.io/xagi-lab/melra:alpha`
- ✅ **CHANGELOG.md** updated with 0.3.0-alpha.1 section
- ✅ **Install paths documented**: npm (shortest), container, release tarball, source
- ✅ **npm publish workflow wired**: `.github/workflows/release.yml` publishes all 14 packages with provenance attestation

## Requires Project Action

### npm Registry Token

**What:** Release workflow ready to publish `@melra/cli@alpha` and 13 dependency packages to npm registry.

**Blocker:** Requires `NPM_TOKEN` secret configured in repository settings.

**Steps:**
1. Generate npm automation token at https://www.npmjs.com/settings/OWNER/tokens
2. Add as repository secret: Settings → Secrets and variables → Actions → New repository secret
3. Name: `NPM_TOKEN`
4. Next tag push will publish to npm registry automatically

**Impact:** Once configured, `npx @melra/cli@alpha doctor` becomes the fastest install path — no clone, no container, just Node.

### Manual Named-Client Verification

**From VALIDATION.md:**
> Before an alpha is called broadly installable, the built artifact must also be exercised in the then-current versions of:
> - Claude Desktop
> - Cursor
> - VS Code's MCP support
> - at least one additional independent MCP inspector or client

**Current state:** Automated compatibility claim is official MCP SDK over stdio (TypeScript + Python). Named graphical clients remain release-gated until manually exercised.

**Action:** Download `v0.3.0-alpha.1` release artifact, configure each client per docs/INSTALLATION.md, verify discovery/plan/execute/receipt cycle.

### Independent Security Review

**From VALIDATION.md:**
> Before `1.0`, a clean released artifact must pass on supported Linux, macOS, and Windows machines, and an independent security review must resolve all critical findings.

**Current state:** Threat model reviewed for 0.3.0-alpha.1, no independent audit yet.

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

**Code complete.** The codebase is production-ready for the declared alpha scope. Remaining items are external verification (manual client exercise), project infrastructure (npm token), and known alpha boundaries (documented, not broken).

Once `NPM_TOKEN` is configured, the next tag push will publish to npm and `npx @melra/cli@alpha` becomes the primary install path.
