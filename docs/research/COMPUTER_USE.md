# Computer-use research

## Implemented control plane

ATLAS MCP exposes computer use through the same bounded operation contract as
every other runtime. The current adapters provide:

- read-only capability discovery;
- screenshots with size and SHA-256 artifact evidence;
- normalized or pixel pointer movement and click;
- bounded text entry;
- an allowlist of named keys;
- bounded vertical scroll.

macOS uses typed native adapter scripts and requires OS Screen Recording or
Accessibility permission. Linux supports screenshot tools and `xdotool` on
X11 when installed. Unsupported platforms report capability absence instead
of pretending an action is available.

## Current measurement

Thirty read-only platform capability probes passed:

- success: `30/30`;
- latency: `0.032 ms` p50, `0.052 ms` p95;
- detected adapter on the recorded machine: `macos-native`.

This is a control-plane microbenchmark only. It is not a task-success or
perception score.

## Research findings

- A robust loop is observe → target → act → re-observe → verify.
- Accessibility/semantic targets should be the first tier; vision is a
  fallback when structured UI evidence is absent.
- Coordinates should be resolution-independent where possible and must name
  their coordinate space.
- Focus, active window, display, and secure-input state are part of the safety
  boundary.
- Pixel change alone is weak evidence; the runtime needs a task-specific final
  predicate.
- Previously successful targets can be replay candidates only after drift
  checks and independent validation.

## Honest benchmark status

ATLAS MCP has not submitted an official
[OSWorld](https://github.com/xlang-ai/OSWorld) or
[OSWorld-MCP](https://arxiv.org/abs/2510.24563) result. Those environments
measure full agent decision-making, application state, GUI execution, and
goal completion. A public score requires a controlled VM, pinned model and
policy, released traces, and the official evaluator.

## Next gates

- accessibility-tree inspection and semantic targeting;
- active-window and multi-display verification;
- screenshot/OCR/vision fallback with confidence;
- Windows adapter;
- secure-input detection;
- pre/post screenshot or accessibility evidence for mutations;
- replayable safety fixtures;
- official OSWorld-MCP subset before any leaderboard claim.
