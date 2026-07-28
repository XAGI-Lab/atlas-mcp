# Validation

## Current baseline

Date: 2026-07-28

- Core test files: 2
- Core tests: 12 passed
- TypeScript strict typecheck: passed
- Supported local validation runtime: Node.js 22+

Validated behavior:

- canonical argument ordering produces stable retry keys;
- different tools and inputs do not share failure state;
- repeated identical failures warn once;
- successful calls reset the failure streak;
- hard stops are opt-in;
- read-only work does not require mutation verification;
- mutations require a structured verification;
- screenshots and unstructured observations are not treated as proof;
- a later mutation invalidates earlier proof;
- verification prompts cannot loop indefinitely.

## Required release evidence

Before the first release, this document will include:

- operating-system matrix results;
- MCP client conformance results;
- end-to-end evaluation scenarios;
- dependency and CodeQL status;
- SBOM and provenance links;
- signed artifact verification;
- fresh-machine installation evidence;
- known limitations.
