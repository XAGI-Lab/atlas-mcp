# Memory research

## Implemented retrieval path

`atlas-hybrid-v1` is a deterministic local ranker:

1. tokenize key, value, and tags;
2. compute BM25-style lexical relevance with per-query document frequency;
3. add an exact-phrase signal;
4. weight provenance confidence and freshness;
5. apply maximal-marginal-relevance diversity to the first 20 results;
6. exclude expired and superseded records by default.

The score breakdown is returned with every search result. Memory remains
strictly scoped, and values are redacted before persistence.

## LoCoMo objective retrieval

The public harness ingests every dialogue turn as one record and retrieves up
to 100 records per question. Four questions without evidence IDs are excluded.

| Cutoff | Mean evidence coverage | Complete evidence recall |
|---:|---:|---:|
| 5 | `0.495564` | `0.463169` |
| 20 | `0.629117` | `0.586276` |
| 50 | `0.718429` | `0.667003` |
| 100 | `0.764263` | `0.712412` |

Query latency across 1,982 questions was `20.699 ms` p50 and `25.406 ms`
p95 on the recorded machine.

This is objective evidence retrieval, not generated-answer accuracy. The
dataset is from the official [LoCoMo repository](https://github.com/snap-research/locomo);
the committed artifact records SHA-256
`79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4`.

## Engineering findings

- Scope filtering must happen before ranking; global retrieval followed by
  scope filtering can starve valid results.
- Aggregation questions need a larger evidence budget than single-fact
  questions.
- Granular dialogue turns can use a larger `k` than long documents at the
  same reader-token budget.
- Freshness and supersession must be explicit; overwriting a fact destroys
  history, while returning both old and new facts creates contradictions.
- Diversity should affect the head of the ranking without making deep
  retrieval quadratically expensive.
- Reader and judge choices can move end-to-end memory scores dramatically,
  which is why this release reports reader-free coverage.

## Next benchmark gates

- official LongMemEval full-500 retrieval run;
- semantic embedding and lexical/semantic ablation;
- aggregation-aware retrieval depth;
- episode-neighbor expansion;
- prompt-injection and memory-poisoning evaluation;
- end-to-end answer accuracy with pinned reader and judge prompts.
