<div align="center">

<img src="docs/assets/melra-logo.png" alt="MELRA logo" width="150" />

# MELRA

### Modular Execution Layer for Reliable Autonomy

### Safe execution · Durable memory · Verified outcomes

An open-source execution system for durable, policy-governed autonomous
workflows across files, terminal, browser, memory, and computer use—with MCP,
CLI, and SDK interfaces plus inspectable, hash-linked evidence records.

<br />

<!-- Build & quality -->
<a href="https://github.com/XAGI-Lab/melra/actions/workflows/ci.yml"><img src="https://github.com/XAGI-Lab/melra/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
<a href="https://github.com/XAGI-Lab/melra/actions/workflows/codeql.yml"><img src="https://github.com/XAGI-Lab/melra/actions/workflows/codeql.yml/badge.svg" alt="CodeQL status" /></a>
<a href="https://github.com/XAGI-Lab/melra/actions/workflows/audit.yml"><img src="https://github.com/XAGI-Lab/melra/actions/workflows/audit.yml/badge.svg" alt="Dependency audit status" /></a>
<a href="https://github.com/XAGI-Lab/melra/actions/workflows/container.yml"><img src="https://github.com/XAGI-Lab/melra/actions/workflows/container.yml/badge.svg" alt="Container build status" /></a>

<!-- Evidence -->
<img src="https://img.shields.io/badge/evals-26_scenarios_passing-22c55e?style=flat-square&logo=checkmarx&logoColor=white" alt="26 deterministic evaluation scenarios passing" />
<img src="https://img.shields.io/badge/tests-166_passing-22c55e?style=flat-square&logo=vitest&logoColor=white" alt="166 JavaScript tests passing" />
<img src="https://img.shields.io/badge/MCP_E2E-12_passing-22c55e?style=flat-square&logo=testcafe&logoColor=white" alt="12 real MCP end-to-end cases passing" />
<img src="https://img.shields.io/badge/runtime_vulnerabilities-0_known-22c55e?style=flat-square&logo=snyk&logoColor=white" alt="No known production runtime vulnerabilities" />

<br />

<!-- Stack -->
<img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript strict" />
<img src="https://img.shields.io/badge/Node.js-22_%7C_24-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22 and 24" />
<img src="https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11 or newer" />
<img src="https://img.shields.io/badge/pnpm-9.5-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm 9.5" />
<img src="https://img.shields.io/badge/SQLite-local_state-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite local state" />
<img src="https://img.shields.io/badge/Playwright-browser-2EAD33?style=flat-square&logo=playwright&logoColor=white" alt="Playwright browser runtime" />
<img src="https://img.shields.io/badge/Docker-hardened-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Hardened Docker image" />

<br />

<!-- Platform & project -->
<img src="https://img.shields.io/badge/macOS-supported-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS supported" />
<img src="https://img.shields.io/badge/Linux-supported-FCC624?style=flat-square&logo=linux&logoColor=black" alt="Linux supported" />
<img src="https://img.shields.io/badge/Windows-supported-0078D4?style=flat-square&logo=windows&logoColor=white" alt="Windows supported" />
<img src="https://img.shields.io/badge/transport-stdio-475569?style=flat-square" alt="Local stdio transport" />
<img src="https://img.shields.io/badge/telemetry-off-0f172a?style=flat-square" alt="Telemetry off" />

<br />

<a href="https://github.com/XAGI-Lab/melra/releases"><img src="https://img.shields.io/github/v/release/XAGI-Lab/melra?include_prereleases&style=flat-square&color=8b5cf6&logo=github" alt="Latest release" /></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-f97316?style=flat-square" alt="Apache-2.0 license" /></a>
<a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/DCO-required-6366f1?style=flat-square&logo=git&logoColor=white" alt="DCO sign-off required" /></a>
<a href="https://github.com/XAGI-Lab/melra/discussions"><img src="https://img.shields.io/badge/discussions-join-2563eb?style=flat-square&logo=github" alt="GitHub Discussions" /></a>
<a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-ec4899?style=flat-square" alt="Pull requests welcome" /></a>

<br /><br />

<img src="docs/assets/melra-hero.png" alt="MELRA governed execution flow" width="100%" />

</div>

<br />

> [!WARNING]
> **MELRA is an alpha release.** Its local stdio runtime is tested end to
> end, but APIs may change before `1.0`. Use an isolated workspace, keep domain
> and command allowlists narrow, and review every consequential approval.

### Durable Core Alpha — `0.3.0-alpha.0`

| Shipped in this source release | Evidence |
|---|---|
| Restart-safe bounded workflows across seven node kinds | Real MCP process is stopped, replaced, and resumed in E2E |
| Encrypted exact task, workflow, and result payloads | AES-256-GCM storage plus plaintext-leak checks across SQLite/WAL and public projections |
| Ten MCP tools for tasks and workflows | Container and stdio discovery checks require the exact tool set |
| Recovery without silent mutation replay | 8/8 deterministic recovery scenarios, zero duplicates, zero false success |

---

## Contents

| | | |
|---|---|---|
| [Why MELRA](#why-melra) | [Execution layers](#one-runtime-five-execution-layers-) | [Where to use it](#where-you-can-use-melra-) |
| [Quickstart](#quickstart-) | [MCP tool surface](#a-deliberately-small-mcp-surface-) | [How execution works](#how-execution-works-) |
| [Evidence](#evidence-not-leaderboard-theatre-) | [Safe defaults](#safe-defaults-) | [Reproduce the scores](#reproduce-the-scores-) |
| [SDKs](#sdks-and-implementation-languages-) | [Repository map](#repository-map-) | [Documentation](#documentation-) |

---

## Why MELRA

Most MCP servers hand a model a tool and hope for the best. A command runs, a
click lands, a file is written — and "it returned without an error" is treated
as success.

MELRA separates **the action succeeded** from **the goal was achieved**.

<table>
<tr>
<th width="50%">🚫 Typical tool server</th>
<th width="50%">✅ MELRA</th>
</tr>
<tr>
<td>

- Tool call executes immediately
- Success = no exception thrown
- Policy, if any, checked once
- Mutations are indistinguishable from reads
- Output is trusted
- No durable record

</td>
<td>

- **Plan** and **execute** are separate tool calls
- Success = declared evidence predicates passed
- Policy re-evaluated **at execution time**
- Mutations need evidence **and** an exact approval phrase
- Page content is explicitly marked untrusted
- Redacted receipt + SHA-256 execution certificate

</td>
</tr>
</table>

If a mutation succeeds but its required evidence is missing or false, the task
is `partial` — **never** `verified_success`.

---

## One runtime, five execution layers 🧭

MELRA turns a tool call into a durable, inspectable task:

| | Layer | What is implemented |
|:--:|---|---|
| 🗂️ | **Files** | Root-confined read, hash, atomic write, move, mkdir, and delete with symlink-escape defenses |
| 💻 | **Terminal** | Shell-free foreground and supervised background processes with allowlists, timeouts, cancellation, and redaction |
| 🌐 | **Browser** | Isolated Playwright sessions, semantic DOM targets, bounded artifacts, network policy, and condition-based post-action settling |
| 🧠 | **Memory** | Scoped SQLite memory with hybrid lexical ranking, episode context, speaker matching, confidence, freshness, diversity, expiry, supersession, provenance, and redaction |
| 🖥️ | **Computer** | Capability discovery plus governed screenshot, pointer, keyboard, and scroll adapters on macOS and supported Linux/X11 setups |

Every layer passes through the same policy, approval, budget, verification,
receipt, and certificate pipeline.

---

## Where you can use MELRA 🛠️

MELRA works with any MCP client that can launch a local stdio server.

<div align="center">

| Client | Setup | Status |
|---|:--:|:--:|
| **Claude Desktop** | [docs](docs/INSTALLATION.md) | <img src="https://img.shields.io/badge/documented-2563eb?style=flat-square" alt="documented" /> |
| **Cursor** | [docs](docs/INSTALLATION.md) | <img src="https://img.shields.io/badge/documented-2563eb?style=flat-square" alt="documented" /> |
| **VS Code** | [docs](docs/INSTALLATION.md) | <img src="https://img.shields.io/badge/documented-2563eb?style=flat-square" alt="documented" /> |
| **Any stdio MCP client** | [docs](docs/INSTALLATION.md) | <img src="https://img.shields.io/badge/documented-2563eb?style=flat-square" alt="documented" /> |

</div>

> [!NOTE]
> A named client is marked **verified** only after the *released artifact* —
> not a source checkout — passes discovery, planning, approval, execution,
> cancellation, and receipt retrieval in that client. Current per-client status
> is tracked in [COMPATIBILITY.md](docs/COMPATIBILITY.md).

### What people actually do with it

| | Use case | Small example | Verified outcome |
|:--:|---|---|---|
| 👩‍💻 | **Coding clients** | Inspect a repository, run `pnpm check`, write a bounded file change | Exit code, file existence, content, or hash |
| 🌐 | **Browser workflows** | Open an allowlisted page, inspect it, fill a form after approval | Final URL and page content |
| 💻 | **Terminal automation** | Run a shell-free build or supervise a background process | Exit code and bounded stdout |
| 🖥️ | **Computer use** | Discover local support, capture a screenshot, approve pointer or keyboard input | Adapter result plus declared evidence |
| 🧠 | **Project memory** | Store a test command, architectural decision, or operating procedure | Scoped record with provenance and redaction |
| 🔁 | **Durable workflows** | Inspect, write an approved artifact, restart between nodes, then checkpoint | Ordered events, independent file evidence, receipt, and certificate |

<details>
<summary><b>Show a governed terminal operation</b></summary>

<br />

A coding client submits one bounded operation with the evidence it expects:

```json
{
  "goal": "Run the repository checks",
  "operation": {
    "kind": "terminal",
    "action": "run",
    "command": "pnpm",
    "args": ["check"]
  },
  "requiredEvidence": [
    { "type": "exit_code", "value": 0 }
  ]
}
```

The task reaches `verified_success` only if the process exits `0`. A process
that runs and exits `1` is a completed action with failed evidence — reported
as `partial`.

</details>

<details>
<summary><b>Show scoped project memory</b></summary>

<br />

```bash
pnpm melra run --request examples/07-project-decision-memory/task.json
```

Records are scoped, provenance-tagged, and pass through secret redaction before
they are persisted.

</details>

See all [runnable examples](examples/README.md) — browser inspection, verified
file writes, terminal checks, scoped memory, and computer capability discovery.

---

## Quickstart 🚀

**Requirements:** Node.js 22+, pnpm 9.5, and optionally Chrome, Chromium, or
Edge for browser work.

```bash
git clone https://github.com/XAGI-Lab/melra.git
cd melra
corepack enable
pnpm install --frozen-lockfile
pnpm build
node apps/cli/dist/index.js doctor
pnpm melra init --client generic
node apps/cli/dist/index.js workflow plan \
  --definition examples/workflows/restart-safe.json
```

<table>
<tr><th>Goal</th><th>Command</th></tr>
<tr><td>Start the stdio server</td><td><code>pnpm melra serve</code></td></tr>
<tr><td>Run a read-only system task</td><td><code>pnpm melra run --request examples/01-system-info/task.json</code></td></tr>
<tr><td>Run a verified mutation</td><td><code>pnpm melra run --request examples/02-verified-file-write/task.json</code></td></tr>
<tr><td>Inspect a stored receipt</td><td><code>pnpm melra inspect &lt;task-id&gt;</code></td></tr>
<tr><td>Advance a durable workflow</td><td><code>pnpm melra workflow advance &lt;workflow-id&gt;</code></td></tr>
<tr><td>Test a policy file</td><td><code>pnpm melra policy test</code></td></tr>
</table>

Mutations pause for an exact, expiring, task-scoped approval phrase. See
[installation and client setup](docs/INSTALLATION.md) for Claude Desktop,
Cursor, VS Code, generic clients, Python, and Docker.

MELRA creates `<MELRA_HOME>/payload.key` with private permissions on first
start. Back it up together with the SQLite files: losing or changing the key
makes persisted executable payloads unreadable. Never commit the key or place
it directly in a shared client configuration.

> [!CAUTION]
> The npm package `melra` and the PyPI package `melra` are **unrelated
> third-party projects**. Install only from this repository or from official
> [XAGI-Lab releases](https://github.com/XAGI-Lab/melra/releases).

---

## Restart-safe first workflow 🔁

The committed example performs a read, pauses for an approved file write, and
finishes at a durable checkpoint. Each CLI invocation is a new process, so this
sequence exercises restart persistence without keeping a daemon alive:

```bash
node apps/cli/dist/index.js workflow plan \
  --definition examples/workflows/restart-safe.json
# save the returned workflow id

node apps/cli/dist/index.js workflow advance <workflow-id>
node apps/cli/dist/index.js workflow advance <workflow-id>
# the second command exits 3 and returns the write approval challenge

node apps/cli/dist/index.js workflow advance <workflow-id> \
  --approval '<approval-id>:<exact phrase>'
node apps/cli/dist/index.js workflow advance <workflow-id>
```

Shortened output captured from the `0.3.0-alpha.0` release candidate:

```text
planned            stateVersion=2
running            stateVersion=4   inspect=verified_complete
awaiting_approval  stateVersion=7   phrase="APPROVE <digest prefix>"
running            stateVersion=10  write=verified_complete
verified_complete  stateVersion=14  checkpoint=verified_complete
```

The final file is read independently in the real-process E2E test. Closing the
process after any displayed boundary and running the next command against the
same `MELRA_HOME` resumes the persisted workflow.

---

## A deliberately small MCP surface ✨

Ten tools in front of five capability runtimes and one durable workflow
controller:

| MCP tool | Purpose |
|---|---|
| `melra_capabilities` | Discover operations, platform support, limits, and policy posture |
| `melra_plan` | Validate, persist, and policy-check one bounded operation |
| `melra_execute` | Execute an approved plan and verify the declared outcome |
| `melra_task_status` | Read durable task state |
| `melra_task_cancel` | Cooperatively cancel pending or running work |
| `melra_receipt` | Retrieve redacted evidence and the execution certificate |
| `melra_workflow_plan` | Validate, preflight, encrypt, and persist a bounded workflow |
| `melra_workflow_advance` | Execute one ready scheduling wave |
| `melra_workflow_status` | Read the durable workflow projection |
| `melra_workflow_cancel` | Cooperatively cancel nonterminal workflow work |

Workflow definitions compose operation, approval, condition, parallel,
bounded-loop, checkpoint, and compensation nodes while every effect still
travels through the task policy and evidence pipeline.

---

## How execution works ⚙️

```mermaid
flowchart LR
    Client["MCP · CLI · SDK"] --> Plan["Persist task or workflow"]
    Plan --> Policy{"Policy at plan time"}
    Policy -->|deny| Stop["Policy blocked"]
    Policy -->|allow or exact approval| Recheck{"Policy at execution time"}
    Recheck --> Runtime["File · terminal · browser · memory · computer"]
    Runtime --> Observe["Post-action observation"]
    Observe --> Verify{"Evidence predicates pass?"}
    Verify -->|yes| Success["Verified success"]
    Verify -->|no| Partial["Partial or failed"]
    Success --> Event["Ordered event + projection"]
    Event --> Receipt["Redacted receipt + SHA-256 certificate"]
    Partial --> Receipt
```

Task lifecycle:

```text
planned → awaiting_approval → running → verifying
                                     ↘ verified_success
                                     ↘ partial | failed | cancelled | budget_exhausted
```

Policy is evaluated **twice** — once when the plan is persisted and again at
execution — so a stale plan can never ride a since-tightened policy.

> [!IMPORTANT]
> **Current alpha boundary:** exact task and workflow payloads survive restart
> in AES-256-GCM envelopes. Interrupted reads may retry; interrupted mutations
> are never silently repeated and require independent filesystem
> reconciliation or enter `recovery_required`. Evidence predicates remain
> caller-authored: filesystem predicates independently re-read state, while
> result, terminal, URL, and page predicates evaluate adapter observations.

---

## Evidence, not leaderboard theatre 📊

The numbers below come from committed scripts and JSON artifacts measured on an
Apple Silicon Mac. They are **component measurements**, not a claim that MELRA
MCP is universally "the best" or that unlike benchmarks are comparable.

| | Capability | Current public result | What it means |
|:--:|---|---:|---|
| 🧠 | LoCoMo retrieval | **0.7597** mean evidence coverage@20 | 1,982 evidence-bearing questions; +20.75% relative over the previous public ranker; zero model, embedding, or network calls |
| 🧠 | Synthetic recall | **100/100** Recall@1 | Deterministic planted-fact regression over 1,000 records |
| 🌐 | Static-page settle | **183.7 ms** p50 vs 301.3 ms | 39% less waiting with identical 10/10 correct reads |
| 🌐 | Slow-render settle | **10/10** vs 0/10 correct | Condition-based waiting observes the final DOM; fixed 300 ms reads too early |
| 💻 | Terminal | **30/30** verified executions | Shell-free process launch; 48.1 ms p50 on the measured machine |
| 🖥️ | Computer control plane | **30/30** capability probes | 0.032 ms p50 adapter discovery; this is *not* a desktop task-success score |
| ✅ | Safety/execution evals | **26/26** passing | Deterministic policy, traversal, terminal, memory, computer, cancellation, and verification scenarios |
| 🔁 | Durable Core eval | **8/8** valid scenarios | 100% expected recovery, 0 duplicate execution, 0 false success, 100% event consistency |

Read the [research index](docs/research/README.md), the
[benchmark methodology](docs/research/METHODOLOGY.md), and the raw
[microbenchmark](docs/research/results/core-microbenchmarks.json) and
[LoCoMo](docs/research/results/locomo-retrieval.json) artifacts.

### Browser-agent evaluation — harness registered, score not yet claimed

The repository contains a pre-registered browser-agent evaluation harness:

| Track | Status |
|---|---|
| MiniWoB-125 development suite (`browsergym-miniwob==0.14.3`) | <img src="https://img.shields.io/badge/harness-ready-2563eb?style=flat-square" alt="harness ready" /> |
| WebArena-Verified Hard-30 registered subset (`webarena-verified==1.2.3`) | <img src="https://img.shields.io/badge/harness-ready-2563eb?style=flat-square" alt="harness ready" /> |
| Published representative score | <img src="https://img.shields.io/badge/not_yet_run-64748b?style=flat-square" alt="not yet run" /> |

Task IDs, upstream revisions, and dataset hashes are frozen in
[`benchmarks/browser-agent/manifests/`](benchmarks/browser-agent/manifests) and
enforced by `pnpm benchmark:browser:verify-upstream`. A score will be published
only after a full fixed-denominator run completes without infrastructure-invalid
pairs *and* its sanitized artifact passes the publication gate.

> [!IMPORTANT]
> MELRA has **not** run an official OSWorld, OSWorld-MCP, WebArena, or
> LongMemEval end-to-end submission. Those scores remain unclaimed until the
> exact public harness, environment, model policy, and evaluator are released
> with the result.

---

## Safe defaults 🔒

| | Default |
|:--:|---|
| 🏠 | Local-only stdio transport; no account or hosted service required |
| 📴 | Telemetry is **off** |
| 🚫 | Shell interpreters, privilege escalation, and arbitrary desktop key names are denied |
| 📁 | Paths and terminal working directories stay inside the configured root |
| 🌐 | Browser domains start **deny-by-default**; private, link-local, loopback, and cloud-metadata destinations stay blocked unless explicitly permitted |
| ⚠️ | Browser output is marked untrusted; page content never changes policy |
| ✍️ | Mutations require **both** declared evidence and an exact task-scoped approval |
| 🔑 | Secret patterns are redacted before terminal output, memory, tasks, or receipts are persisted |
| 🎛️ | Computer actions use bounded typed fields and platform adapters — not a user-supplied shell command |

See the [threat model](docs/THREAT_MODEL.md) and
[security policy](SECURITY.md) for residual risks.

---

## Reproduce the scores 🧪

```bash
# full validation gate
pnpm check
pnpm evals
pnpm e2e
pnpm pack:check
pnpm security:audit
pnpm --filter @melra/evals evaluate:durable-core -- --publishable

# local memory, browser, terminal, and computer microbenchmarks
pnpm benchmark:core

# hardened local container and real MCP smoke
docker build -t melra:local .
docker run --rm melra:local doctor
pnpm docker:smoke
```

<details>
<summary><b>LoCoMo memory retrieval</b> — dataset intentionally not vendored (CC BY-NC 4.0)</summary>

<br />

```bash
git clone https://github.com/snap-research/locomo.git /tmp/locomo
pnpm benchmark:locomo -- \
  --dataset /tmp/locomo/data/locomo10.json \
  --output docs/research/results/locomo-retrieval.json
```

</details>

<details>
<summary><b>Browser-agent harness</b> — contract checks and the MiniWoB development suite</summary>

<br />

Contract and registered-selection checks run with no model and no network
environment:

```bash
pnpm benchmark:browser:check
pnpm benchmark:browser:verify-upstream
```

The MiniWoB development suite additionally needs the pinned MiniWoB++ assets, a
built CLI (`pnpm build`), and an agent configuration whose `api_key_env` names a
variable present in the environment:

```bash
uv run --project benchmarks/browser-agent --extra miniwob \
  melra-browser-bench run-miniwob \
  --manifest benchmarks/browser-agent/manifests/miniwob-125-v1.json \
  --run-dir benchmarks/browser-agent/runs/miniwob-candidate \
  --workspace benchmarks/browser-agent/runs/workspaces \
  --base-url "$MINIWOB_BASE_URL" \
  --browser-executable "$MELRA_BROWSER" \
  --implementation-commit "$(git rev-parse HEAD)" \
  --agent-config benchmarks/browser-agent/runs/config/agent.json
```

Run outputs — HAR, screenshots, video, and transcripts — are Git-ignored and
must never be committed.

</details>

Benchmark artifacts include dataset hashes, environment details, sample counts,
latency percentiles, and explicit claim boundaries.

---

## SDKs and implementation languages 🧩

| SDK | Package | Language |
|---|---|:--:|
| TypeScript client | [`@melra/sdk`](packages/sdk-ts) | <img src="https://img.shields.io/badge/-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /> |
| Python client | [`melra`](sdk-py) | <img src="https://img.shields.io/badge/-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python" /> |
| JSON contracts | [`@melra/protocol`](packages/protocol) · [`@melra/receipt-schema`](packages/receipt-schema) | <img src="https://img.shields.io/badge/-000000?style=flat-square&logo=json&logoColor=white" alt="JSON" /> |

MELRA is capability-driven, not language-restricted. Rust, Go, Python,
TypeScript, Swift, C#, or another language can be used when measurement shows a
real improvement in isolation, portability, performance, reliability, or
platform integration without fragmenting the public contracts.

---

## Repository map 🗂️

```text
apps/cli/                   CLI and stdio entrypoint
packages/protocol/          strict task, workflow, event, and operation schemas
packages/runtime-core/      task/workflow lifecycle, events, recovery
packages/policy-core/       local policy and scoped approvals
packages/server/            ten-tool MCP server and runtime router
packages/file-runtime/      confined filesystem operations
packages/terminal-runtime/  shell-free process supervision
packages/browser-runtime/   isolated browser automation and stable-DOM wait
packages/computer-runtime/  governed local computer-use adapters
packages/memory/            scoped hybrid retrieval and lifecycle controls
packages/storage-sqlite/    transactional tasks, workflows, events, evidence
packages/verifier-core/     deterministic evidence predicates
packages/receipt-schema/    receipts and execution certificates
packages/sdk-ts/            TypeScript client SDK
sdk-py/                     Python client SDK
benchmarks/browser-agent/   pre-registered browser-agent evaluation harness
evals/                      safety and durable crash-recovery evaluations
scripts/                    benchmark and release checks
docs/research/              methods, findings, and raw results
examples/                   runnable task examples
```

---

## Documentation 📚

| | | |
|---|---|---|
| 📦 [Installation & client setup](docs/INSTALLATION.md) | 🧭 [Capabilities & limits](docs/CAPABILITIES.md) | 🏛️ [Architecture](docs/ARCHITECTURE.md) |
| 🔬 [Research & benchmarks](docs/research/README.md) | 🔗 [Compatibility policy](docs/COMPATIBILITY.md) | ✅ [Validation evidence](docs/VALIDATION.md) |
| 🛡️ [Threat model](docs/THREAT_MODEL.md) | 🗺️ [Roadmap](ROADMAP.md) | 📝 [Changelog](CHANGELOG.md) |

---

## Contributing 🤝

Code, adapters, benchmark harnesses, verifier predicates, documentation, and
threat analysis are all welcome.

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
   [Code of Conduct](CODE_OF_CONDUCT.md).
2. Sign your commits under the DCO (`git commit -s`).
3. Run `pnpm check` before opening a pull request.
4. Report vulnerabilities through
   [GitHub private vulnerability reporting](https://github.com/XAGI-Lab/melra/security/advisories/new)
   — never in a public issue.

---

## License 📄

Software and documentation are licensed under the
[Apache License 2.0](LICENSE). The official logo and hero artwork are licensed
under [CC BY-ND 4.0](LICENSES/CC-BY-ND-4.0.txt); see [BRAND.md](BRAND.md).
Third-party benchmark datasets retain their own licenses and are not included
in this repository.

<div align="center">
<br />

**Built in the open by [XAGI Labs](https://github.com/XAGI-Lab).**

<sub>MELRA brand assets © XAGI Labs Private Limited, licensed CC BY-ND 4.0.</sub>

</div>
