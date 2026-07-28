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

## Why public numbers differ from future agent scores

An MCP runtime controls execution; an agent or model still selects goals,
operations, and evidence. End-to-end results depend on the model, prompt,
context policy, environment state, and evaluator. Future WebArena, OSWorld,
OSWorld-MCP, and LongMemEval runs must pin all of those inputs.

## Updating a result

1. Run the committed command from a clean checkout.
2. Record the dataset revision and hash.
3. Keep raw JSON; do not copy only a headline.
4. Explain methodology changes beside the new result.
5. Never overwrite a failing result to preserve an old claim.
