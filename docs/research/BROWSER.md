# Browser-use research

## Implemented change

After navigation and meaningful DOM actions, ATLAS MCP waits for a quiet
mutation window instead of sleeping for a fixed duration. The operation
returns:

- milliseconds waited;
- mutation count;
- whether the bounded wait timed out;
- the reason the wait completed.

The browser then captures a fresh URL, title, text, and interactive-element
snapshot. Page content is explicitly marked untrusted.

## Local correctness/latency result

Ten iterations were run for each page profile and strategy:

| Profile | Fixed 300 ms | Condition-based wait |
|---|---:|---:|
| Static | `301.259 ms`, `10/10` correct | `183.703 ms`, `10/10` correct |
| Burst render | `301.221 ms`, `10/10` correct | `309.955 ms`, `10/10` correct |
| Slow render | `301.247 ms`, `0/10` correct | `904.633 ms`, `10/10` correct |

The static case waits about 39% less. The slow case is the more important
result: a fixed wait is fast but reads stale state every time.

## Research findings

- Action success and goal success require separate evidence.
- Fixed sleeps are simultaneously wasteful on fast pages and unsafe on slow
  pages.
- Semantic role/name targeting should precede CSS selectors and any future
  visual fallback.
- Replay can remove model calls only when the runtime detects drift and
  re-verifies the final state.
- Live-site and template-specific success must not be presented as a
  representative browser leaderboard.

## Representative evaluation harness

The repository now includes two separate browser-agent evaluation tracks:

- a development suite containing all 125 tasks registered by
  `browsergym-miniwob==0.14.3`;
- a pre-registered `WebArena-Verified Hard-30 registered subset` evaluated by
  `webarena-verified==1.2.3`.

The MiniWoB integration launches a pinned Chrome process, places BrowserGym's
official task page in the shared CDP context, and drives each browser action
through the real ATLAS MCP stdio server. BrowserGym—not the action return
value—determines task reward. Records are bounded, append-only, and resumable
only when their frozen input digest matches.

The Hard-30 harness checks the registered task IDs and intent templates against
the official dataset, verifies environment-control readiness and immutable
image digests, resets every site before each implementation side, alternates
baseline/candidate order, and accepts only the official evaluator score as task
success. Raw HAR, cookies, form data, and provider transcripts are ignored by
Git and must not be published.

No representative score is claimed yet. A score will be added only after the
full fixed-denominator run completes without infrastructure-invalid pairs and
its sanitized aggregate artifact passes the publication gate.

## MiniWoB development run (not a published score)

The development suite has now been run end to end. This is a *development*
signal used to find generic failures, not evidence about ATLAS MCP's quality,
and it is deliberately not published as a result artifact.

First complete run, 2026-07-29, `gemini-3.1-flash-lite`, max 10 steps per task,
requests paced to 12/minute, single `run_input_digest`:

| Measure | Value |
|---|---:|
| Tasks | 125 |
| Successes | 15 (12.0%) |
| Browser actions executed through ATLAS MCP | 461 |
| Actions reaching `verified_success` | 406 (88.1%) |
| Agent steps | 462 |
| Input / output tokens | 449,085 / 22,108 |
| Wall clock | 65.9 min |

Failure groups:

| Count | Category | Reading |
|---:|---|---|
| 40 | `mcp_budget_exhausted` | Action consumed its full 30s budget instead of failing fast on an unresolvable target |
| 32 | `step_limit` | Agent did not finish within 10 steps |
| 15 | `mcp_failed` | Action executed but its declared evidence did not hold |
| 8 | `official_evaluator_failure` | BrowserGym scored the final state as unsuccessful |
| 14 | `harness_*` | Harness or provider fault; not evidence about the agent |

**This run is not valid as a clean development baseline.** Fourteen tasks
(11.2%) failed for infrastructure reasons: eight were the last eight tasks
alphabetically, where the provider's daily request allowance ran out, and the
rest were transport faults and one unverifiable-action crash. The fixes for
those are in place, so the next run should report
`infrastructure_failures: 0`; `run-miniwob` now prints that count and a `valid`
flag so an invalid run cannot be mistaken for a clean one.

Two agent-behavior findings worth acting on before any published run:

- `screenshot` was chosen 61 times and `navigate` 18 times, together 17% of all
  actions. The agent receives text observations, so a screenshot cannot inform
  it, and navigating away from a MiniWoB task page always loses the task.
  Offering both to a text-only agent spends steps that cannot succeed.
- `budget_exhausted` is the single largest failure group. Distinguishing
  "target not found" from "action genuinely took too long" would turn a 30s
  timeout into an immediate, correctly-labelled failure.

Reproduce the harness checks:

```bash
pnpm benchmark:browser:check
pnpm benchmark:browser:verify-upstream

uv run --project benchmarks/browser-agent \
  --extra miniwob --extra webarena --group test \
  pytest benchmarks/browser-agent -q
```
