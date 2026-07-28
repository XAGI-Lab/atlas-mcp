# Benchmark methodology and claim policy

## Evidence levels

ATLAS MCP uses four labels:

1. **Unit/evaluation result** — deterministic code-path behavior.
2. **Component microbenchmark** — local latency or correctness for one
   bounded component.
3. **Dataset retrieval result** — objective evidence coverage over a named,
   hashed dataset revision.
4. **Task benchmark result** — end-to-end goal completion under an official
   environment and evaluator.

A lower level cannot be renamed as a higher one. In particular:

- process exit `0` is not proof that the user goal succeeded;
- a successful click is not proof that the UI reached the desired state;
- retrieval coverage is not answer accuracy;
- a selected-template replay result is not a representative browser score;
- adapter discovery is not an OSWorld score.

## Required artifact fields

Committed results include:

- benchmark and metric name;
- implementation identity;
- dataset source, license, and SHA-256 when applicable;
- sample count and exclusions;
- model, embedding, and network-call counts;
- p50 and p95 for latency measurements;
- environment metadata;
- limitations and non-comparable axes.

## Determinism

The current memory scorer makes no model, embedding, or network calls. LoCoMo
turns are ingested with their published dialogue ID, speaker, session ID, and
order; the scorer uses the explicit session and order only for bounded
adjacent-turn expansion. The run therefore has no reader or judge variance.
Browser fixtures use a local synthetic page with fixed mutation schedules.
Terminal measurements use the current Node executable and exact argument
separation. Computer microbenchmarks perform read-only capability probes.

## Representative browser protocol

MiniWoB is the development suite. The manifest pins BrowserGym MiniWoB
`0.14.3`, the BrowserGym source revision, the MiniWoB++ asset revision, and all
125 registered task names. The compatibility test refuses task additions,
removals, duplicates, or renames.

The registered evaluation is labeled exactly
`WebArena-Verified Hard-30 registered subset`. It contains 30 unique intent
templates: 16 mutate, 5 navigate, and 9 retrieve tasks across GitLab, Reddit,
Shopping, Shopping Admin, and cross-site work. It is not a full WebArena score
or an official leaderboard submission.

For the paired run:

1. Baseline and candidate use the same frozen model, prompt, tool schema,
   browser, environment images, task order, and limits.
2. Both include the same benchmark-only CDP/HAR instrumentation.
3. Sorted task positions alternate which implementation runs first.
4. Every required site is reset before every side.
5. An infrastructure failure on either side invalidates that pair.
6. Process exit, model text, and successful browser actions do not count as
   task success.
7. Only `webarena-verified==1.2.3` score `1` counts as success.
8. Aggregate success, Wilson intervals, paired outcomes, exact McNemar value,
   latency, steps, MCP calls, and available token counts use the fixed
   registered denominator.

Raw HAR files and transcripts remain local. The public artifact contains only
sanitized aggregate and per-task fields and must pass the repository's secret,
query-value, and absolute-path publication gate.

## Why public numbers differ from agent scores

An MCP runtime controls execution; an agent or model still selects goals,
operations, and evidence. End-to-end results depend on the model, prompt,
context policy, environment state, and evaluator. WebArena, OSWorld,
OSWorld-MCP, and LongMemEval results must pin all of those inputs.

## Updating a result

1. Run the committed command from a clean checkout.
2. Record the dataset revision and hash.
3. Keep raw JSON; do not copy only a headline.
4. Explain methodology changes beside the new result.
5. Never overwrite a failing result to preserve an old claim.
