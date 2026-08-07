# Project Status

Last updated: 2026-08-08

Version: `0.3.0-alpha.4`

## Engineering Complete

- ✅ **All 252 tests passing** (250 Vitest, 2 Python pytest)
- ✅ **Versions consistent** across 17 locations (root, 15 packages, protocol constant, sdk-py)
- ✅ **Gate green**: `pnpm check`, `pnpm e2e`, `pnpm security:audit` all pass
- ✅ **Release artifacts published**: GitHub release v0.3.0-alpha.4, container at `ghcr.io/xagi-lab/melra:alpha`
- ✅ **npm packages published**: all 14 packages live under the `@melra` scope on the `alpha` dist-tag, each with provenance attestation
- ✅ **CHANGELOG.md** updated with 0.3.0-alpha.4 section
- ✅ **Install paths documented**: npm, container, release tarball, source
- ✅ **Registry install verified end to end**: `npx @melra/cli@alpha doctor` passes every check on a clean npm cache, and the same path serves all 11 MCP tools over stdio

## Requires Project Action

### Manual Named-Client Verification

**From VALIDATION.md:**
> Before an alpha is called broadly installable, the built artifact must also be exercised in the then-current versions of:
> - Claude Desktop
> - Cursor
> - VS Code's MCP support
> - at least one additional independent MCP inspector or client

**Current state:** Automated compatibility claim is official MCP SDK over stdio (TypeScript + Python). Named graphical clients remain release-gated until manually exercised.

**Action:** Install `npx @melra/cli@alpha` or download the `v0.3.0-alpha.4` release artifact, configure each client per docs/INSTALLATION.md, verify discovery/plan/execute/receipt cycle.

### Independent Security Review

**From VALIDATION.md:**
> Before `1.0`, a clean released artifact must pass on supported Linux, macOS, and Windows machines, and an independent security review must resolve all critical findings.

**Current state:** Threat model reviewed for 0.3.0-alpha.4, no independent audit yet.

**Action:** Engage external security reviewer when approaching beta/1.0.

## Known Alpha Scope Limits

Documented in docs/VALIDATION.md "Known alpha limitations":
- Stdio transport only (HTTP/OAuth not implemented)
- Browser sessions non-persistent
- Computer OCR/accessibility targeting roadmap
- Node SQLite experimental warning (suppressed in the CLI; visible when the
  storage package is embedded as a library)
- Unhinged mode (`--unhinged` / `MELRA_UNHINGED=1`) is an explicit opt-out of the
  entire safety model, not a scope limit. Nothing in this document's safety
  claims applies to a process running in it.

These are documented boundaries, not defects.

## Summary

**Code complete and installable.** The codebase is production-ready for the declared alpha scope, and all four install paths — npm, container, release tarball, source — are published and documented. Remaining items are external verification (manual client exercise, independent security review) and known alpha boundaries (documented, not broken).

`npx @melra/cli@alpha` is the primary install path.
