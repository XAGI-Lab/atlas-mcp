# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MELRA is a local-only MCP server (stdio transport) that turns one tool call into a
governed, verified, receipted task. Six MCP tools (`melra_capabilities`, `melra_plan`,
`melra_execute`, `melra_task_status`, `melra_task_cancel`, `melra_receipt`) sit in front of
five capability runtimes: files, terminal, browser, memory, computer. pnpm workspace of
TypeScript packages (Node 22+, ESM, strict tsc), plus two Python projects managed by `uv`
(`sdk-py`, `benchmarks/browser-agent`).

## Commands

```bash
pnpm install --frozen-lockfile
pnpm build                  # tsc -p per package; required before tests (see below)
pnpm check                  # versions:check + typecheck + test + python:check — the CI gate
pnpm evals                  # 22 deterministic policy/execution scenarios → evals/results/latest.json
pnpm e2e                    # packages/server/test/e2e.test.ts against a live stdio server
pnpm pack:check              # npm pack --dry-run for the published CLI
pnpm security:audit          # pnpm audit --prod + scripts/python-audit.mjs
pnpm melra <cmd>            # run the CLI from source via tsx (doctor | init | serve | run | inspect | policy test)
```

Single test file (vitest args pass through the package script):

```bash
pnpm --filter @melra/memory test src/index.test.ts
pnpm --filter @melra/memory test -t "ranks exact phrases"
```

Python:

```bash
pnpm python:check           # ruff + pytest for sdk-py
pnpm benchmark:browser:check # ruff + pytest for benchmarks/browser-agent
```

Benchmarks (see README "Reproduce the scores" for the full MiniWoB/LoCoMo invocations):

```bash
pnpm benchmark:core         # builds, then scripts/bench-core.mjs
pnpm benchmark:locomo -- --dataset <locomo10.json> --output <artifact.json>
pnpm benchmark:browser:verify-upstream
```

**Tests import workspace siblings through their `exports` → `dist/`, so `pnpm build` must
run before `pnpm test`** (this is why `typecheck` and `benchmark:*` scripts build first). A
test failing with an unresolved `@melra/*` import means a stale or missing `dist`.

There is no ESLint/Prettier for TypeScript — `tsc --strict` is the only static gate. Python
uses ruff (line-length 100, py311).

## Execution pipeline (the core invariant)

`melra_plan` never executes. It classifies the operation, evaluates policy, persists a
`TaskRecord`, and — for mutations — returns a task-scoped, expiring approval challenge whose
exact phrase must be echoed back. `melra_execute` **re-evaluates policy** so a stale plan
cannot ride a since-tightened policy, validates the approval, runs the adapter under an
`AbortSignal` armed with `budget.maxDurationMs`, then verifies.

Verification is what decides success. `TaskController` (`packages/runtime-core/src/task-controller.ts`)
marks a task `verified_success` only when the adapter succeeded *and* every
`requiredEvidence` predicate passed; an adapter that succeeded with failing evidence is
`partial`, never success. Read-only ops with no declared evidence get a synthetic
`operation_completed` item. Retries apply to `read` effects only — mutations and destructive
ops run at most once.

Policy (`packages/policy-core/src/index.ts`) denies before the adapter is reached. Non-obvious
defaults that trip people up:

- A non-empty `constraints` array is an outright **deny** (`freeform_constraints_not_enforceable`) — freeform prose is not enforceable, so leave it `[]`.
- Any non-`read` effect with empty `requiredEvidence` is denied (`mutation_requires_evidence`).
- Terminal commands must be in `allowedCommands` by basename; shells and `sudo`/`su` are denied unconditionally. `git`'s effect is `read` only for a small read-only subcommand set; `npm`/`npx`/`pnpm` are high-risk mutations.
- Browser domains are deny-by-default (`allowedDomains: []`, `allowLocalhost: false`), so browser work needs a policy JSON.
- Effect/risk classification lives in one place, `classifyOperation`. Adding an action without updating it silently mis-classifies (usually as a mutation).

## Making changes

Adding or changing an operation action touches a fixed set of places, in this order:

1. `packages/protocol/src/index.ts` — the `*OperationSchema` (all schemas are `.strict()`, bounded, with defaults; unknown fields are rejected by design).
2. `packages/policy-core` `classifyOperation` — effect, risk, capability string, target.
3. The owning runtime package (`file-runtime`, `terminal-runtime`, `browser-runtime`, `computer-runtime`, `memory`).
4. `RuntimeRouter` in `packages/server/src/runtime.ts` if a new `kind` is introduced.
5. The `operations` map in `melra_capabilities` (`packages/server/src/mcp-server.ts`) — it is a hand-maintained list, not derived from the schemas.
6. A scenario in `evals/src/scenarios.ts` asserting both `expectedPlan` and `expectedFinal`.

New evidence predicate types need `EvidencePredicateSchema` plus a branch in
`packages/verifier-core`. The verifier resolves every path through `realpath` and rejects
anything outside the workspace root, including the root itself — keep that confinement when
adding predicates.

Redaction happens at multiple layers: `redactStructuredValue` on task requests, results, and
error messages before persistence, plus `redactMemoryValue` inside the memory package. Raw
output goes only to the live caller; SQLite holds the redacted copy. New fields that can
carry secrets must pass through one of these.

`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are on, which is why the codebase
uses the conditional-spread idiom (`...(x === undefined ? {} : { x })`) instead of passing
`undefined`. Match it rather than loosening types.

Every source file carries the two-line `Copyright 2026 XAGI Labs Private Limited` /
`SPDX-License-Identifier: Apache-2.0` header.

## Versions must move in lockstep

`scripts/check-versions.mjs` (run by `pnpm check`) requires the root `package.json` version to
match every `apps/*` and `packages/*` manifest, the `PRODUCT_VERSION` constant in
`packages/protocol/src/index.ts`, and `sdk-py/pyproject.toml` (with `-alpha.N` rewritten as
`aN`). Bump all four together.

## Contribution conventions

- Commits are signed off (DCO); `scripts/check-dco.mjs` and `.github/workflows/dco.yml` enforce it. Commit subjects follow `type(scope): summary`, e.g. `bench(browser): add paired evaluator`.
- Architecture changes require an ADR in `docs/decisions/`. Design specs and implementation plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- User-visible changes get a `CHANGELOG.md` entry under `## [Unreleased]` (Keep a Changelog sections).
- CI runs `pnpm check` on ubuntu/macos/windows × Node 22/24, so avoid platform-specific paths and shell assumptions.

## Benchmark and claims discipline

Public numbers must be reproducible from committed scripts and JSON artifacts under
`docs/research/results/`, with dataset hashes and claim boundaries stated. Benchmark datasets
are deliberately not vendored (licensing). The browser benchmark is pre-registered: task IDs,
upstream revisions, and dataset hashes are frozen in `benchmarks/browser-agent/manifests/`
and checked by `verify-upstream`. Run outputs (`benchmarks/browser-agent/runs/`, HAR, PNG,
webm, transcripts) are gitignored — never commit raw traces, headers, or typed text. Do not
describe results as an official OSWorld/WebArena/LongMemEval score; the registered subset is
called "WebArena-Verified Hard-30 registered subset".
