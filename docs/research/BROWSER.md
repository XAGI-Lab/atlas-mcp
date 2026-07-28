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

Representative end-to-end evaluation remains future work through the official
[BrowserGym](https://github.com/ServiceNow/BrowserGym) environments.
