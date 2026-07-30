# Representative Browser Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible MiniWoB development suite and a pre-registered WebArena-Verified Hard-30 paired evaluation that exercise browser actions through the real MELRA stdio server, then publish narrowly labeled evidence and accurate README usage examples.

**Architecture:** A Python benchmark package owns official benchmark integration, manifests, agent orchestration, evaluation, sanitization, and reporting. The existing TypeScript browser runtime gains opt-in CDP attachment and HAR recording so official environments can observe MELRA actions without weakening the default isolated session. The 125-task MiniWoB suite is used for development; the registered Hard-30 suite is run once after the candidate and all model/environment inputs are frozen.

**Tech Stack:** TypeScript 5.8, Node.js 22/24, Playwright Core 1.61, Python 3.11, uv, pytest, official MCP Python SDK 1.28, BrowserGym MiniWoB 0.14.3, WebArena-Verified 1.2.3, Docker only for the authorized Hard-30 environment.

## Global Constraints

- BrowserGym MiniWoB PyPI version: `0.14.3`.
- BrowserGym source revision: `9e779f087de9a65668b6974d11f9ce9816026e96`.
- WebArena-Verified PyPI version: `1.2.3`.
- WebArena-Verified source revision: `6473f72db5dcefc97b5725b59e734504edc28a21`.
- WebArena-Verified Hard task-data SHA-256: `4fccaef496870558a0c65ae97c7350c625b498688df87051afd254db7899a76f`.
- WebArena-Verified Hard subset-manifest SHA-256: `3b0a4df231bb5a0c642215e521c3fa97701a384f52a734dc2db8f617ad0591a7`.
- MELRA browser baseline: `a8a0a0907a7eed29249b94c89af3449efbcec4c3`.
- The paired baseline uses that source plus the shared CDP/HAR instrumentation commit; the instrumentation commit is frozen before MiniWoB-driven behavior changes.
- CPython version: `3.11`.
- The registered task IDs are exactly `15, 21, 67, 105, 113, 166, 172, 226, 268, 284, 430, 446, 528, 544, 556, 566, 577, 603, 638, 646, 658, 675, 701, 708, 733, 738, 780, 788, 795, 799`.
- The registered set contains 16 mutate, 5 navigate, and 9 retrieve tasks across 7 GitLab, 5 Reddit, 6 Shopping, 6 Shopping admin, and 6 cross-site tasks.
- Every browser mutation in a scored task must pass through `melra_plan` and `melra_execute`.
- Agent errors, invalid actions, policy blocks, timeouts, and unmet verification count as task failures.
- Raw HAR, cookies, authorization headers, query values, form payloads, typed text, absolute local paths, and secrets must never be committed.
- Public text must say `WebArena-Verified Hard-30 registered subset`; it must not claim a full WebArena score or official leaderboard rank.
- No model API calls, paid cloud resources, Docker cleanup, or deletion of images or volumes occurs without separate exact approval.
- Named MCP clients are described as documented configurations until released-client verification passes.

---

## File map

### New benchmark package

- `benchmarks/browser-agent/pyproject.toml` — dependency groups and CLI entry point.
- `benchmarks/browser-agent/uv.lock` — reproducible Python resolution.
- `benchmarks/browser-agent/src/melra_browser_bench/manifest.py` — manifest types and validation.
- `benchmarks/browser-agent/src/melra_browser_bench/selection.py` — deterministic Hard-30 selection.
- `benchmarks/browser-agent/src/melra_browser_bench/metrics.py` — aggregate and paired statistics.
- `benchmarks/browser-agent/src/melra_browser_bench/sanitize.py` — publication-safe evidence conversion.
- `benchmarks/browser-agent/src/melra_browser_bench/agent.py` — fixed agent protocol and provider boundary.
- `benchmarks/browser-agent/src/melra_browser_bench/mcp_driver.py` — real stdio plan/execute adapter.
- `benchmarks/browser-agent/src/melra_browser_bench/miniwob.py` — BrowserGym/CDP environment adapter.
- `benchmarks/browser-agent/src/melra_browser_bench/webarena.py` — official task and evaluator adapter.
- `benchmarks/browser-agent/src/melra_browser_bench/runner.py` — isolated task and paired-run orchestration.
- `benchmarks/browser-agent/src/melra_browser_bench/cli.py` — manifest, upstream, suite-run, publication, and verification commands.
- `benchmarks/browser-agent/manifests/*.json` — immutable suite and run manifests.
- `benchmarks/browser-agent/tests/` — behavior tests for each boundary.

### Browser runtime changes

- `packages/browser-runtime/src/browser-connection.ts` — owned launch, CDP attach, context selection, and lifecycle.
- `packages/browser-runtime/src/browser-connection.test.ts` — real browser connection/HAR behavior.
- `packages/browser-runtime/src/index.ts` — use the connection abstraction.
- `packages/server/src/runtime.ts` — pass opt-in CDP/HAR options.
- `apps/cli/src/index.ts` — parse benchmark-only browser connection environment variables.
- `apps/cli/test/cli.test.ts` — observable environment and help behavior.

### Product evidence and documentation

- `README.md` — practical “Where you can use MELRA” examples.
- `ROADMAP.md` — mark only benchmark infrastructure/results actually completed.
- `docs/research/BROWSER.md` — method, result, limitations, and reproduction.
- `docs/research/METHODOLOGY.md` — registered-subset and paired-run rules.
- `docs/research/README.md` — exact scorecard label and artifact link.
- `docs/research/results/browser-agent-benchmark.json` — sanitized aggregate evidence only after a valid run.
- `docs/VALIDATION.md` — fresh validation and immutable workflow evidence after merge.
- `.gitignore` — exclude raw benchmark runs, HAR, screenshots, videos, and provider transcripts.
- `package.json` — local benchmark verification commands.

---

### Task 1: Add the benchmark package and immutable manifest contract

**Files:**
- Create: `benchmarks/browser-agent/pyproject.toml`
- Create: `benchmarks/browser-agent/src/melra_browser_bench/__init__.py`
- Create: `benchmarks/browser-agent/src/melra_browser_bench/cli.py`
- Create: `benchmarks/browser-agent/src/melra_browser_bench/manifest.py`
- Create: `benchmarks/browser-agent/manifests/webarena-verified-hard-30-v1.json`
- Create: `benchmarks/browser-agent/tests/test_manifest.py`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Produces: `load_manifest(path: Path) -> BenchmarkManifest`
- Produces: `BenchmarkManifest.freeze_run(candidate, agent, environment, instrumentation_commit) -> BenchmarkManifest`
- Produces: `BenchmarkManifest.validate_publishable() -> None`
- Produces CLI: `melra-browser-bench validate-manifest`
- Produces CLI: `melra-browser-bench freeze-run`
- Consumes later: exact task metadata, upstream pins, baseline/candidate identities, agent identity, environment identity.

- [ ] **Step 1: Write the failing manifest behavior test**

The break this catches is accepting a mutable, incomplete, duplicated, or
drifted score manifest.

```python
def test_hard30_manifest_is_registered_and_publishable() -> None:
    registered = load_manifest(MANIFEST)
    manifest = registered.freeze_run(
        candidate=ImplementationIdentity(commit="c" * 40),
        agent=AgentIdentity(
            provider="openai-compatible",
            model_id="provider-model-snapshot-2026-07-28",
            model_revision="revision-2026-07-28",
            temperature=0,
            prompt_sha256="a" * 64,
            tool_schema_sha256="b" * 64,
        ),
        environment=EnvironmentIdentity(
            browser="Chrome 150.0.0.0",
            images=("shopping@sha256:" + "d" * 64,),
        ),
        instrumentation_commit="e" * 40,
    )
    assert [task.task_id for task in manifest.tasks] == [
        15, 21, 67, 105, 113, 166, 172, 226, 268, 284,
        430, 446, 528, 544, 556, 566, 577, 603, 638, 646,
        658, 675, 701, 708, 733, 738, 780, 788, 795, 799,
    ]
    assert len({task.intent_template_id for task in manifest.tasks}) == 30
    assert Counter(task.task_type for task in manifest.tasks) == {
        "MUTATE": 16,
        "NAVIGATE": 5,
        "RETRIEVE": 9,
    }
    manifest.validate_publishable()


def test_mutable_model_alias_is_not_publishable() -> None:
    registered = load_manifest(MANIFEST)
    mutable = registered.freeze_run(
        candidate=ImplementationIdentity(commit="c" * 40),
        agent=AgentIdentity(
            provider="openai-compatible",
            model_id="latest",
            model_revision="mutable",
            temperature=0,
            prompt_sha256="a" * 64,
            tool_schema_sha256="b" * 64,
        ),
        environment=EnvironmentIdentity(
            browser="Chrome 150.0.0.0",
            images=("shopping@sha256:" + "d" * 64,),
        ),
        instrumentation_commit="e" * 40,
    )
    with pytest.raises(ValueError, match="immutable_model_id_required"):
        mutable.validate_publishable()
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
uv run --project benchmarks/browser-agent --group test \
  pytest benchmarks/browser-agent/tests/test_manifest.py -q
```

Expected: collection fails because `melra_browser_bench.manifest` does not
exist.

- [ ] **Step 3: Implement the minimal typed manifest**

Use frozen dataclasses and explicit validation; do not allow unknown fields to
disappear silently.

```python
@dataclass(frozen=True)
class RegisteredTask:
    task_id: int
    sites: tuple[str, ...]
    site_family: str
    task_type: Literal["MUTATE", "NAVIGATE", "RETRIEVE"]
    intent_template_id: int


@dataclass(frozen=True)
class BenchmarkManifest:
    schema_version: Literal["1.0.0"]
    suite: str
    publication_state: Literal["registered", "frozen"]
    upstream: UpstreamIdentity
    selection: SelectionIdentity
    baseline: ImplementationIdentity
    candidate: ImplementationIdentity | None
    agent: AgentIdentity | None
    environment: EnvironmentIdentity | None
    tasks: tuple[RegisteredTask, ...]

    def freeze_run(
        self,
        *,
        candidate: ImplementationIdentity,
        agent: AgentIdentity,
        environment: EnvironmentIdentity,
        instrumentation_commit: str,
    ) -> "BenchmarkManifest":
        return replace(
            self,
            publication_state="frozen",
            baseline=replace(
                self.baseline,
                instrumentation_commit=instrumentation_commit,
            ),
            candidate=candidate,
            agent=agent,
            environment=environment,
        )

    def validate_publishable(self) -> None:
        if self.candidate is None:
            raise ValueError("candidate_identity_required")
        if (
            self.agent is None
            or self.agent.model_id in {"latest", "default"}
            or self.agent.model_revision in {"latest", "default", "mutable"}
        ):
            raise ValueError("immutable_model_id_required")
        if (
            self.environment is None
            or any("@sha256:" not in image for image in self.environment.images)
        ):
            raise ValueError("immutable_environment_required")
```

The checked-in pre-registration manifest intentionally has
`publication_state: "registered"` and cannot pass `validate_publishable()`
until `freeze_run` supplies the shared instrumentation commit plus the frozen
candidate, agent, and image digests.

- [ ] **Step 4: Add package configuration and ignore raw evidence**

Use:

```toml
[project]
name = "melra-browser-bench"
version = "0.1.0"
requires-python = ">=3.11,<3.12"
dependencies = ["melra", "httpx>=0.28,<1"]

[project.optional-dependencies]
miniwob = ["browsergym-miniwob==0.14.3"]
webarena = ["webarena-verified==1.2.3"]

[dependency-groups]
test = ["pytest>=9,<10", "pytest-asyncio>=1,<2", "ruff>=0.12,<1"]

[project.scripts]
melra-browser-bench = "melra_browser_bench.cli:main"

[tool.uv.sources]
melra = { path = "../../sdk-py" }
```

Add these ignore patterns:

```gitignore
benchmarks/browser-agent/runs/
benchmarks/browser-agent/**/*.har
benchmarks/browser-agent/**/*.png
benchmarks/browser-agent/**/*.webm
benchmarks/browser-agent/**/*transcript*.json
```

Add root commands:

```json
"benchmark:browser:check": "uv run --project benchmarks/browser-agent --group test ruff check benchmarks/browser-agent && uv run --project benchmarks/browser-agent --group test pytest benchmarks/browser-agent",
"benchmark:browser:verify-upstream": "uv run --project benchmarks/browser-agent melra-browser-bench verify-upstream"
```

Implement `cli.main()` with `argparse` subcommands. `validate-manifest` loads
the named file and prints its state, task count, and publishability.
`freeze-run` reads the registered manifest plus explicit agent and environment
JSON files, calls `freeze_run`, validates the result, and creates the output
with exclusive mode so an existing frozen manifest is never overwritten.

- [ ] **Step 5: Lock, verify GREEN, and commit**

Run:

```bash
uv lock --project benchmarks/browser-agent
pnpm benchmark:browser:check
git check-ignore benchmarks/browser-agent/runs/example/network.har
git diff --check
```

Expected: tests pass; the sample HAR path is ignored; diff check exits `0`.

Commit:

```bash
git add .gitignore package.json benchmarks/browser-agent
git commit -s -m "bench(browser): register representative task contract"
```

---

### Task 2: Make Hard-30 selection independently reproducible

**Files:**
- Create: `benchmarks/browser-agent/src/melra_browser_bench/selection.py`
- Create: `benchmarks/browser-agent/tests/fixtures/hard-selection-sample.json`
- Create: `benchmarks/browser-agent/tests/test_selection.py`
- Modify: `benchmarks/browser-agent/src/melra_browser_bench/cli.py`

**Interfaces:**
- Produces: `select_registered_tasks(tasks, seed, quotas) -> tuple[RegisteredTask, ...]`
- Produces: `verify_upstream(manifest, source: str | Path) -> VerificationResult`
- Consumes: `BenchmarkManifest` from Task 1.

- [ ] **Step 1: Write a failing selection test with hand-derived output**

The break this catches is cherry-picking, repeated intent templates, or a
selection order that changes between machines.

```python
def test_selection_hashes_within_strata_and_skips_duplicate_templates() -> None:
    tasks = json.loads(FIXTURE.read_text())
    selected = select_registered_tasks(
        tasks,
        seed="fixed-seed",
        quotas={("gitlab", "MUTATE"): 2, ("reddit", "RETRIEVE"): 1},
    )
    assert [task.task_id for task in selected] == [7, 11, 19]
    assert [task.intent_template_id for task in selected] == [101, 103, 201]


def test_selection_fails_when_a_quota_cannot_be_filled() -> None:
    with pytest.raises(ValueError, match="selection_quota_unsatisfied"):
        select_registered_tasks([], seed="fixed-seed", quotas={("gitlab", "MUTATE"): 1})
```

Choose the fixture IDs so the literal expected order is verified once with
`shasum -a 256`; do not derive the expected list with the production helper.

- [ ] **Step 2: Run the selection test and verify RED**

Run:

```bash
uv run --project benchmarks/browser-agent --group test \
  pytest benchmarks/browser-agent/tests/test_selection.py -q
```

Expected: failure because `select_registered_tasks` is missing.

- [ ] **Step 3: Implement deterministic selection**

```python
def selection_key(seed: str, task_id: int) -> str:
    return hashlib.sha256(f"{seed}:{task_id}".encode()).hexdigest()


def select_registered_tasks(
    raw_tasks: Sequence[Mapping[str, object]],
    *,
    seed: str,
    quotas: Mapping[tuple[str, str], int],
) -> tuple[RegisteredTask, ...]:
    used_templates: set[int] = set()
    selected: list[RegisteredTask] = []
    for stratum, required in quotas.items():
        candidates = sorted(
            (parse_task(task) for task in raw_tasks if task_stratum(task) == stratum),
            key=lambda task: selection_key(seed, task.task_id),
        )
        accepted = []
        for task in candidates:
            if task.intent_template_id in used_templates:
                continue
            accepted.append(task)
            used_templates.add(task.intent_template_id)
            if len(accepted) == required:
                break
        if len(accepted) != required:
            raise ValueError(f"selection_quota_unsatisfied:{stratum}")
        selected.extend(accepted)
    return tuple(sorted(selected, key=lambda task: task.task_id))
```

`verify_upstream` must stream bytes, check the two SHA-256 values before
parsing, regenerate the task set, and compare every metadata field with the
registered manifest.

- [ ] **Step 4: Verify the real pinned upstream inputs**

Run:

```bash
pnpm benchmark:browser:check
pnpm benchmark:browser:verify-upstream
```

Expected:

```text
verified suite=webarena-verified-hard-30-v1 tasks=30 unique_templates=30
```

- [ ] **Step 5: Commit**

```bash
git add benchmarks/browser-agent
git commit -s -m "bench(browser): verify registered upstream selection"
```

---

### Task 3: Add aggregate and paired statistics

**Files:**
- Create: `benchmarks/browser-agent/src/melra_browser_bench/metrics.py`
- Create: `benchmarks/browser-agent/tests/test_metrics.py`

**Interfaces:**
- Produces: `percentile(values: Sequence[float], q: float) -> float`
- Produces: `wilson_interval(successes: int, total: int) -> tuple[float, float]`
- Produces: `mcnemar_exact(baseline_only: int, candidate_only: int) -> float`
- Produces: `aggregate_pair(records: Sequence[TaskPairRecord]) -> PairReport`

- [ ] **Step 1: Write failing tests with hand-checked literals**

The break this catches is a report that overstates success, drops registered
tasks, or reverses paired wins and losses.

```python
def test_wilson_interval_for_15_of_30() -> None:
    low, high = wilson_interval(15, 30)
    assert low == pytest.approx(0.3315, abs=0.0001)
    assert high == pytest.approx(0.6685, abs=0.0001)


def test_pair_report_counts_wins_losses_ties_and_failures() -> None:
    report = aggregate_pair([
        pair(15, baseline=False, candidate=True),
        pair(21, baseline=True, candidate=False),
        pair(67, baseline=True, candidate=True),
        pair(105, baseline=False, candidate=False),
    ], registered_total=4)
    assert report.candidate_successes == 2
    assert report.baseline_successes == 2
    assert report.candidate_only == 1
    assert report.baseline_only == 1
    assert report.both_success == 1
    assert report.both_failure == 1
    assert report.fixed_denominator == 4
```

- [ ] **Step 2: Verify RED**

Run:

```bash
uv run --project benchmarks/browser-agent --group test \
  pytest benchmarks/browser-agent/tests/test_metrics.py -q
```

Expected: import failure for `melra_browser_bench.metrics`.

- [ ] **Step 3: Implement minimal deterministic math**

```python
def wilson_interval(successes: int, total: int) -> tuple[float, float]:
    if total <= 0 or not 0 <= successes <= total:
        raise ValueError("invalid_binomial_counts")
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return round(center - margin, 6), round(center + margin, 6)


def mcnemar_exact(baseline_only: int, candidate_only: int) -> float:
    discordant = baseline_only + candidate_only
    if discordant == 0:
        return 1.0
    tail = sum(
        math.comb(discordant, index) * (0.5 ** discordant)
        for index in range(min(baseline_only, candidate_only) + 1)
    )
    return min(1.0, 2 * tail)
```

Aggregation must iterate the registered manifest, not only files found in a
run directory. A missing record is an invalid run, not an implicit failure or
exclusion.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
pnpm benchmark:browser:check
```

Commit:

```bash
git add benchmarks/browser-agent
git commit -s -m "bench(browser): add paired task statistics"
```

---

### Task 4: Add evidence sanitization and publication gates

**Files:**
- Create: `benchmarks/browser-agent/src/melra_browser_bench/sanitize.py`
- Create: `benchmarks/browser-agent/tests/test_sanitize.py`
- Create: `benchmarks/browser-agent/tests/fixtures/unsafe-evidence.json`
- Modify: `benchmarks/browser-agent/src/melra_browser_bench/cli.py`

**Interfaces:**
- Produces: `sanitize_evidence(value: object, roots: Sequence[Path]) -> object`
- Produces: `assert_publishable_run(run_dir: Path, manifest: BenchmarkManifest) -> None`
- Produces CLI: `melra-browser-bench publish`
- Produces CLI: `melra-browser-bench verify-public`

- [ ] **Step 1: Write the failing privacy test**

The break this catches is committing credentials, URL query values, typed
payloads, raw HAR, provider transcripts, or absolute machine paths.

```python
def test_sanitizer_removes_sensitive_evidence(tmp_path: Path) -> None:
    unsafe = json.loads(FIXTURE.read_text())
    clean = sanitize_evidence(unsafe, roots=[Path("/Users/example/project")])
    serialized = json.dumps(clean, sort_keys=True)
    for forbidden in [
        "Bearer secret-token",
        "session_cookie",
        "password=example",
        "/Users/example/project",
        "typed private text",
    ]:
        assert forbidden not in serialized
    assert clean["trace"]["sha256"] == "c" * 64


def test_publication_gate_rejects_raw_har(tmp_path: Path) -> None:
    (tmp_path / "network.har").write_text("{}")
    with pytest.raises(ValueError, match="raw_har_not_publishable"):
        assert_publishable_run(tmp_path, complete_manifest())
```

- [ ] **Step 2: Verify RED**

Run:

```bash
uv run --project benchmarks/browser-agent --group test \
  pytest benchmarks/browser-agent/tests/test_sanitize.py -q
```

Expected: missing sanitizer module.

- [ ] **Step 3: Implement recursive sanitization and fail-closed scanning**

```python
SENSITIVE_KEYS = re.compile(
    r"(authorization|cookie|set-cookie|password|token|secret|form|postData|typed)",
    re.IGNORECASE,
)


def sanitize_evidence(value: object, roots: Sequence[Path]) -> object:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if SENSITIVE_KEYS.search(str(key))
            else sanitize_evidence(item, roots)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize_evidence(item, roots) for item in value]
    if isinstance(value, str):
        cleaned = redact_common_secrets(strip_query_values(value))
        for root in roots:
            cleaned = cleaned.replace(str(root), "[LOCAL_PATH]")
        return cleaned
    return value
```

The publication gate scans file names and content, rejects raw extensions and
known provider transcript fields, verifies every registered task record,
requires `infrastructure_failures == 0`, and recomputes the aggregate report
before accepting it.

`publish` reads ignored raw records, writes only sanitized task metadata and
the deterministic aggregate to a new output file, then calls
`verify-public`. `verify-public` reparses the public artifact, validates all
30 registered IDs and both implementation identities, recomputes the
aggregate, and scans the serialized bytes for forbidden fields.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
pnpm benchmark:browser:check
git check-ignore benchmarks/browser-agent/runs/run-1/network.har
```

Commit:

```bash
git add benchmarks/browser-agent .gitignore
git commit -s -m "bench(browser): gate public evidence"
```

---

### Task 5: Add opt-in CDP attachment and HAR recording to the browser runtime

**Files:**
- Create: `packages/browser-runtime/src/browser-connection.ts`
- Create: `packages/browser-runtime/src/browser-connection.test.ts`
- Modify: `packages/browser-runtime/src/index.ts`
- Modify: `packages/server/src/runtime.ts`
- Modify: `apps/cli/src/index.ts`
- Modify: `apps/cli/test/cli.test.ts`

**Interfaces:**
- Produces: `connectBrowser(options: BrowserConnectionOptions) -> Promise<BrowserConnection>`
- Adds: `BrowserRuntimeOptions.cdpEndpoint?: string`
- Adds: `BrowserRuntimeOptions.cdpContextIndex?: number`
- Adds: `BrowserRuntimeOptions.recordHarPath?: string`
- Adds CLI env: `MELRA_BROWSER_CDP_ENDPOINT`
- Adds CLI env: `MELRA_BROWSER_CDP_CONTEXT_INDEX`
- Adds CLI env: `MELRA_BROWSER_HAR_PATH`

- [ ] **Step 1: Write a real failing HAR lifecycle test**

The break this catches is claiming trace evidence when the runtime did not
flush a real HAR file on close.

```typescript
it("records and flushes HAR for an owned browser context", async () => {
  const executablePath = await detectBrowserExecutable();
  if (executablePath === undefined) return;
  const root = await mkdtemp(join(tmpdir(), "melra-browser-har-"));
  const server = createServer((_, response) => response.end("verified page"));
  await listen(server);
  const harPath = join(root, "network.har");
  const runtime = new BrowserRuntime({
    workspaceRoot: root,
    artifactDirectory: join(root, "artifacts"),
    executablePath,
    allowedDomains: ["127.0.0.1"],
    allowLocalhost: true,
    recordHarPath: harPath,
  });
  try {
    await runtime.execute({
      kind: "browser",
      action: "navigate",
      url: serverUrl(server),
    });
  } finally {
    await runtime.close();
    server.close();
  }
  const har = JSON.parse(await readFile(harPath, "utf8"));
  expect(har.log.entries).toHaveLength(1);
  expect(har.log.entries[0].request.url).toContain("127.0.0.1");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @melra/browser-runtime test -- browser-connection.test.ts
```

Expected: TypeScript fails because `recordHarPath` is not a runtime option.

- [ ] **Step 3: Implement owned launch and CDP attachment**

```typescript
export interface BrowserConnectionOptions {
  executablePath?: string;
  headless: boolean;
  cdpEndpoint?: string;
  cdpContextIndex?: number;
  recordHarPath?: string;
}

export interface BrowserConnection {
  browser: Browser;
  context: BrowserContext;
  ownsBrowser: boolean;
  ownsContext: boolean;
}

export async function connectBrowser(
  options: BrowserConnectionOptions,
): Promise<BrowserConnection> {
  if (options.cdpEndpoint !== undefined) {
    if (options.recordHarPath !== undefined) {
      throw new Error("browser_cdp_cannot_start_har_recording");
    }
    const browser = await chromium.connectOverCDP(options.cdpEndpoint);
    const contexts = browser.contexts();
    const index = options.cdpContextIndex ?? contexts.length - 1;
    const context = contexts.at(index);
    if (context === undefined) throw new Error("browser_cdp_context_not_found");
    return { browser, context, ownsBrowser: false, ownsContext: false };
  }
  const executablePath = options.executablePath ?? await detectBrowserExecutable();
  if (executablePath === undefined) throw new Error("browser_not_found");
  const browser = await chromium.launch({ executablePath, headless: options.headless });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
    ...(options.recordHarPath === undefined
      ? {}
      : { recordHar: { path: options.recordHarPath, mode: "full", content: "omit" } }),
  });
  return { browser, context, ownsBrowser: true, ownsContext: true };
}
```

`BrowserRuntime.close()` closes owned contexts before owned browsers so HAR is
flushed. It does not close an externally owned CDP browser or context.

- [ ] **Step 4: Add a real CDP attachment characterization test**

Launch installed Chrome with a temporary user-data directory and fixed free
debugging port, create a page through Playwright, attach MELRA to the last
context, execute `inspect`, and assert the returned page text is the literal
fixture. Skip only when no supported browser executable exists.

Run:

```bash
pnpm --filter @melra/browser-runtime test -- browser-connection.test.ts
```

Expected: HAR and CDP cases pass.

- [ ] **Step 5: Wire server and CLI options test-first**

Rename `environment()` to an exported `parseCliEnvironment(source)` and add a
test that passes a complete literal environment mapping. Assert that the three
parsed values reach `createMelraRuntime`; also assert that a non-HTTP(S) CDP
endpoint, a context index below `-1`, and a non-absolute HAR path are rejected.
The help text lists variable names but never their current values.

Run:

```bash
pnpm --filter @melra/cli test
pnpm --filter @melra/server test
pnpm --filter @melra/browser-runtime test
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/browser-runtime packages/server apps/cli
git commit -s -m "feat(browser): support benchmark connections and traces"
```

Record this commit as the shared instrumentation commit before any
MiniWoB-driven targeting, settling, popup, or verification change. Audit:

```bash
git diff --stat a8a0a0907a7eed29249b94c89af3449efbcec4c3..HEAD
git diff a8a0a0907a7eed29249b94c89af3449efbcec4c3..HEAD -- \
  packages/protocol packages/policy-core packages/verifier-core
```

Expected: the first diff contains only benchmark connection/evidence wiring
plus prior documentation/benchmark-contract files, and the second diff is
empty.

---

### Task 6: Drive every agent action through the real MCP server

**Files:**
- Create: `benchmarks/browser-agent/src/melra_browser_bench/agent.py`
- Create: `benchmarks/browser-agent/src/melra_browser_bench/mcp_driver.py`
- Create: `benchmarks/browser-agent/tests/test_agent.py`
- Create: `benchmarks/browser-agent/tests/test_mcp_driver.py`
- Modify: `sdk-py/src/melra/client.py`
- Modify: `sdk-py/tests/test_client.py`

**Interfaces:**
- Produces: `AgentDecision = BrowserActionDecision | FinalDecision | InfeasibleDecision`
- Produces: `AgentProtocol.decide(context: AgentContext) -> Awaitable[AgentDecision]`
- Produces: `OpenAICompatibleAgent.decide(context: AgentContext) -> Awaitable[AgentDecision]`
- Produces: `MelraBrowserDriver.perform(decision, expected_evidence) -> DriverObservation`
- Adds SDK: `MelraClient.call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]`

- [ ] **Step 1: Write a failing real-stdio driver test**

The break this catches is bypassing MCP, skipping the scoped approval, or
mistaking action success for verified task success.

```python
async def test_mutation_uses_plan_execute_and_receipt(tmp_path: Path) -> None:
    policy = write_browser_policy(tmp_path, allowed_domains=["example.com"])
    async with built_melra_client(tmp_path, policy=policy) as client:
        driver = MelraBrowserDriver(client)
        observation = await driver.perform(
            BrowserActionDecision(
                action="type",
                target={"role": "textbox", "name": "Search"},
                value="verified",
            ),
            expected_evidence=[{"type": "page_contains", "text": "verified"}],
        )
        assert observation.plan_status == "awaiting_approval"
        assert observation.task_status in {"verified_success", "partial"}
        assert observation.receipt["taskId"] == observation.task_id
        assert observation.mcp_calls == 3
```

Use the existing local browser fixture and built CLI; do not mock
`MelraClient`.

- [ ] **Step 2: Verify RED**

Run:

```bash
uv run --project benchmarks/browser-agent --group test \
  pytest benchmarks/browser-agent/tests/test_mcp_driver.py -q
```

Expected: missing `MelraBrowserDriver`.

- [ ] **Step 3: Expose a public SDK tool call without duplicating parsing**

Rename private `_call` to `call_tool`, update existing SDK methods to delegate
to it, and keep existing error behavior. Add a Python SDK test that calls
`melra_capabilities` through `call_tool` and asserts the six real tool names.

- [ ] **Step 4: Implement the driver**

```python
class MelraBrowserDriver:
    def __init__(self, client: MelraClient) -> None:
        self._client = client

    async def perform(
        self,
        decision: BrowserActionDecision,
        expected_evidence: list[dict[str, object]],
    ) -> DriverObservation:
        request = {
            "goal": decision.goal,
            "operation": {"kind": "browser", **decision.operation()},
            "requiredEvidence": expected_evidence,
            "budget": {"maxSteps": 1, "maxDurationMs": 30_000, "maxRetries": 0},
        }
        plan = await self._client.plan(request)
        approval = None
        if plan["status"] == "awaiting_approval":
            challenge = plan["approval"]
            approval = {
                "approvalId": challenge["approvalId"],
                "phrase": challenge["phrase"],
            }
        execution = await self._client.execute(plan["id"], approval)
        receipt = await self._client.receipt(task_id=plan["id"])
        return DriverObservation.from_mcp(plan, execution, receipt)
```

The driver refuses to auto-approve a non-browser operation, a domain outside
the generated benchmark policy, or a task whose requested action differs from
the registered agent decision.

- [ ] **Step 5: Add the fixed agent boundary test-first**

Start a real local HTTP server that returns one complete OpenAI-compatible chat
completion with a `browser_action` tool call and literal usage counts. Assert:

```python
decision = await agent.decide(context)
assert decision.action == "click"
assert decision.target == {"role": "button", "name": "Submit"}
assert decision.usage.input_tokens == 120
assert decision.usage.cached_input_tokens == 40
assert decision.usage.output_tokens == 18
assert decision.model_id == "provider-model-snapshot-2026-07-28"
```

First run `pytest benchmarks/browser-agent/tests/test_agent.py -q` and observe
failure because `OpenAICompatibleAgent` is absent. Then implement one HTTP
boundary using `httpx.AsyncClient`. Send the canonical prompt, observation
history, and one strict tool schema. Accept only `browser_action`, `finish`,
or `infeasible`; reject parallel tool calls, unknown fields, malformed usage,
and a response model ID different from the frozen manifest. A provider that
omits a usage field records that field as unavailable rather than estimating
it.

Canonicalize prompt and tool schema with sorted UTF-8 JSON and record their
SHA-256 values in every task record. API keys come only from the named
environment variable in the ignored agent configuration; they never enter a
manifest, record, exception, or transcript.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
pnpm build
uv run --project sdk-py pytest sdk-py -q
pnpm benchmark:browser:check
```

Commit:

```bash
git add sdk-py benchmarks/browser-agent
git commit -s -m "bench(browser): execute agent actions over MCP"
```

---

### Task 7: Add the MiniWoB development adapter and full-suite runner

**Files:**
- Create: `benchmarks/browser-agent/src/melra_browser_bench/chrome.py`
- Create: `benchmarks/browser-agent/src/melra_browser_bench/miniwob.py`
- Create: `benchmarks/browser-agent/src/melra_browser_bench/runner.py`
- Create: `benchmarks/browser-agent/tests/test_miniwob.py`
- Create: `benchmarks/browser-agent/manifests/miniwob-125-v1.json`
- Modify: `benchmarks/browser-agent/src/melra_browser_bench/cli.py`

**Interfaces:**
- Produces: `ChromeCdpProcess.start(executable: Path) -> AsyncContextManager[ChromeCdpProcess]`
- Produces: `MiniWobEnvironment.open(task_name: str) -> AsyncContextManager[TaskEnvironment]`
- Produces: `run_task(environment, agent, driver, limits) -> TaskRecord`
- Produces CLI: `melra-browser-bench run-miniwob --manifest ... --run-dir ...`

- [ ] **Step 1: Write a failing shared-page integration test**

The break this catches is an action occurring in an MELRA-owned page while the
official evaluator observes a different page.

```python
@pytest.mark.integration
async def test_melra_action_changes_the_page_browsergym_scores() -> None:
    async with MiniWobEnvironment.open("miniwob.click-test") as environment:
        before = environment.observation()
        assert before.reward == 0
        async with environment.melra_driver() as driver:
            await driver.perform(
                BrowserActionDecision(
                    action="click",
                    target={"role": "button", "name": environment.literal_target_name},
                ),
                expected_evidence=[],
            )
        after = environment.observe_after_mcp_action()
        assert after.reward == 1
        assert after.terminated is True
```

This test uses a real installed browser, the real BrowserGym task evaluator,
and the real MCP stdio server. It skips only when no supported browser is
installed.

- [ ] **Step 2: Verify RED**

Run:

```bash
uv run --project benchmarks/browser-agent \
  --extra miniwob --group test \
  pytest benchmarks/browser-agent/tests/test_miniwob.py -q
```

Expected: `MiniWobEnvironment` is missing.

- [ ] **Step 3: Implement external Chrome and BrowserGym connection**

`ChromeCdpProcess` starts the detected executable with:

```text
--headless=new
--remote-debugging-port=0
--user-data-dir=the Path returned by tempfile.mkdtemp(prefix="melra-cdp-")
--no-first-run
--no-default-browser-check
about:blank
```

It waits for `DevToolsActivePort` inside the temporary user-data directory,
parses the first line as the loopback port, and then polls
`f"http://127.0.0.1:{port}/json/version"` until the WebSocket endpoint is
available or a 10-second deadline expires. The BrowserGym adapter temporarily
replaces its launch boundary with `chromium.connect_over_cdp(endpoint)`,
restores the original boundary in `finally`, calls the official `reset`, and
starts MELRA with `MELRA_BROWSER_CDP_ENDPOINT` plus context index `-1`.

After each MCP action it calls BrowserGym's normal post-step observation and
task validation without executing a second browser action.

- [ ] **Step 4: Add the exact 125-task manifest**

Generate the manifest from BrowserGym 0.14.3 once, sort by registered task
name, and store every name. Add a test asserting:

```python
assert manifest.upstream.version == "0.14.3"
assert len(manifest.tasks) == 125
assert len(set(manifest.tasks)) == 125
assert set(manifest.tasks) == set(discover_miniwob_tasks())
```

The discovery equality is an explicit compatibility gate and runs only with
the pinned `miniwob` extra installed.

- [ ] **Step 5: Implement bounded agent loop and append-only records**

```python
async def run_task(
    environment: TaskEnvironment,
    agent: AgentProtocol,
    driver: MelraBrowserDriver,
    *,
    max_steps: int,
) -> TaskRecord:
    history: list[StepRecord] = []
    for step in range(max_steps):
        decision = await agent.decide(environment.agent_context(history))
        if isinstance(decision, FinalDecision):
            return environment.evaluate_final(decision, history)
        observation = await driver.perform(decision, environment.evidence_for(decision))
        reward = environment.observe_after_mcp_action()
        history.append(StepRecord.from_observation(step, decision, observation, reward))
        if reward.terminated:
            return environment.finish(history)
    return environment.step_limit_failure(history)
```

Each task writes `f"task-{task_id}.json"` with `open(..., "x")`; resume accepts it only
when its run-input digest matches the current manifest.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
pnpm build
uv run --project benchmarks/browser-agent \
  --extra miniwob --group test \
  pytest benchmarks/browser-agent/tests/test_miniwob.py -q
pnpm benchmark:browser:check
```

Commit:

```bash
git add benchmarks/browser-agent
git commit -s -m "bench(browser): add MiniWoB development runner"
```

---

### Task 8: Add WebArena-Verified evaluation and paired orchestration

**Files:**
- Create: `benchmarks/browser-agent/src/melra_browser_bench/webarena.py`
- Create: `benchmarks/browser-agent/tests/test_webarena.py`
- Create: `benchmarks/browser-agent/tests/fixtures/webarena/config.json`
- Create: `benchmarks/browser-agent/tests/fixtures/webarena/network.har`
- Modify: `benchmarks/browser-agent/src/melra_browser_bench/runner.py`
- Modify: `benchmarks/browser-agent/src/melra_browser_bench/cli.py`

**Interfaces:**
- Produces: `WebArenaEnvironment.preflight(task: RegisteredTask) -> PreflightResult`
- Produces: `WebArenaEnvironment.evaluate(task_id, response, har_path) -> OfficialResult`
- Produces: `run_paired_hard30(manifest, baseline, candidate, agent) -> PairReport`
- Produces CLI: `melra-browser-bench run-hard30 --manifest ... --run-dir ...`
- Produces CLI: `melra-browser-bench preflight-hard30 --manifest ...`

- [ ] **Step 1: Write a failing official-evaluator boundary test**

The break this catches is treating a process exit, final answer string, or
browser action as task success instead of using WebArena-Verified.

```python
def test_official_evaluator_result_is_the_only_success_source(tmp_path: Path) -> None:
    environment = WebArenaEnvironment.from_config(FIXTURE_CONFIG)
    result = environment.evaluate(
        task_id=108,
        agent_response={
            "task_type": "NAVIGATE",
            "status": "SUCCESS",
            "retrieved_data": None,
        },
        network_trace=FIXTURE_HAR,
    )
    record = TaskRecord.from_official_result(task_id=108, result=result)
    assert record.success is bool(result.score == 1)
    assert record.evaluator_status == str(result.status)
```

Use the small official-format synthetic fixture; do not copy a registered
Hard-30 task trace.

- [ ] **Step 2: Verify RED**

Run:

```bash
uv run --project benchmarks/browser-agent \
  --extra webarena --group test \
  pytest benchmarks/browser-agent/tests/test_webarena.py -q
```

Expected: `WebArenaEnvironment` is missing.

- [ ] **Step 3: Implement official API integration**

```python
class WebArenaEnvironment:
    def __init__(self, config: WebArenaVerifiedConfig) -> None:
        self._api = WebArenaVerified(config=config)

    def get_task(self, task_id: int):
        return self._api.get_task(task_id)

    def evaluate(
        self,
        *,
        task_id: int,
        agent_response: dict[str, object],
        network_trace: Path,
    ):
        return self._api.evaluate_task(
            task_id=task_id,
            agent_response=agent_response,
            network_trace=network_trace,
        )
```

Preflight checks the task ID/revision against the registered manifest, calls
each required environment-control `/status` endpoint, and refuses a site whose
container identity differs from the pinned digest.

- [ ] **Step 4: Implement paired order and invalid-run handling**

For sorted task position `index`, run baseline first when `index` is even and
candidate first when odd. Reset every required site before each side. If
either side has an infrastructure failure, write both records as an invalid
pair and do not aggregate a publishable score.

Add a test with a real local HTTP environment-control fixture that proves:

```python
assert execution_order == [
    (15, "baseline"), (15, "candidate"),
    (21, "candidate"), (21, "baseline"),
]
assert resets == 4
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
uv run --project benchmarks/browser-agent \
  --extra webarena --group test \
  pytest benchmarks/browser-agent/tests/test_webarena.py -q
pnpm benchmark:browser:check
```

Commit:

```bash
git add benchmarks/browser-agent
git commit -s -m "bench(browser): add verified paired evaluator"
```

---

### Task 9: Add accurate product usage examples and benchmark documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/research/BROWSER.md`
- Modify: `docs/research/METHODOLOGY.md`
- Modify: `docs/research/README.md`
- Modify: `ROADMAP.md`
- Create: `examples/07-project-decision-memory/task.json`
- Modify: `examples/README.md`

**Interfaces:**
- Consumes: current implemented operation schemas and registered benchmark labels.
- Produces: runnable small examples and reproduction commands.

- [ ] **Step 1: Add runnable example manifests before README copy**

Reuse the existing verified browser example at
`examples/04-browser-inspection/task.json` and create a memory example that is
safe by default:

```json
{
  "goal": "Remember the repository test command",
  "operation": {
    "kind": "memory",
    "action": "put",
    "scope": "project",
    "key": "test command",
    "value": "Run pnpm check before opening a pull request.",
    "source": "user-provided project procedure",
    "confidence": 1,
    "tags": ["testing", "procedure"]
  },
  "requiredEvidence": [
    {
      "type": "result_equals",
      "path": "stored",
      "value": true
    }
  ]
}
```

Validate each manifest by executing `melra_plan` against a temporary workspace
and assert it reaches the documented plan state.

- [ ] **Step 2: Add “Where you can use MELRA”**

Place the section before the scorecard. Cover:

1. coding clients — inspect, test, write, and verify a bounded change;
2. browser workflows — navigate, inspect, submit with approval, verify page;
3. terminal automation — shell-free build/test and supervised process logs;
4. computer use — capabilities, screenshot, approved input on supported hosts;
5. project memory — scoped decisions and procedures without a hosted account.

Use `documented setup` for Claude Desktop, Cursor, VS Code, Codex, and generic
stdio clients; link to `docs/COMPATIBILITY.md` for released-client verification
status.

- [ ] **Step 3: Document reproduction and claim boundaries**

Add exact commands:

```bash
pnpm benchmark:browser:check
pnpm benchmark:browser:verify-upstream
uv run --project benchmarks/browser-agent --extra miniwob \
  melra-browser-bench run-miniwob --manifest \
  benchmarks/browser-agent/manifests/miniwob-125-v1.json \
  --run-dir benchmarks/browser-agent/runs/miniwob-candidate
```

Do not add a Hard-30 score or check its roadmap item until the valid run exists.

- [ ] **Step 4: Validate examples and docs**

Run:

```bash
pnpm build
pnpm melra policy test --request examples/04-browser-inspection/task.json
pnpm melra policy test --request examples/07-project-decision-memory/task.json
pnpm benchmark:browser:verify-upstream
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add README.md ROADMAP.md docs/research examples
git commit -s -m "docs: show practical MCP workflows"
```

---

### Task 10: Run full validation and the MiniWoB development suite

**Files:**
- Modify only when evidence exists: `docs/research/BROWSER.md`
- Modify only when evidence exists: `docs/research/README.md`
- Modify only when evidence exists: `docs/research/results/browser-agent-benchmark.json`

**Interfaces:**
- Consumes: all implementation tasks and an approved, immutable model configuration.
- Produces: candidate commit, complete 125-task MiniWoB result, and frozen Hard-30 run manifest.

- [ ] **Step 1: Run repository verification before any model calls**

Run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm evals
pnpm e2e
pnpm pack:check
pnpm security:audit
pnpm benchmark:browser:check
pnpm benchmark:browser:verify-upstream
```

Expected: every command exits `0`. Record exact counts and versions; do not
reuse older validation output.

- [ ] **Step 2: Commit any verification-only fixes through TDD**

For every discovered bug: first add a focused failing test, observe RED,
implement the smallest general fix, observe GREEN, rerun the affected suite,
then commit with a DCO signoff. Do not tune code to a registered Hard-30 task.

- [ ] **Step 3: Request exact model authorization if none is already recorded**

Before the first paid/model network call, present:

- provider and immutable model ID;
- endpoint/account or GCP project;
- temperature and token limits;
- maximum 1,250 MiniWoB agent steps;
- estimated maximum cost;
- whether any cloud browser environment is needed.

Proceed only after the user approves those exact values.

- [ ] **Step 4: Run all 125 MiniWoB tasks**

Run:

```bash
uv run --project benchmarks/browser-agent --extra miniwob \
  melra-browser-bench run-miniwob \
  --manifest benchmarks/browser-agent/manifests/miniwob-125-v1.json \
  --run-dir benchmarks/browser-agent/runs/miniwob-candidate \
  --workspace benchmarks/browser-agent/runs/workspaces-candidate \
  --base-url "$MINIWOB_BASE_URL" \
  --browser-executable "$MELRA_BROWSER" \
  --implementation-commit "$(git rev-parse HEAD)" \
  --agent-config benchmarks/browser-agent/runs/config/agent.json
```

`--workspace`, `--base-url`, `--browser-executable`, `--implementation-commit`,
and `--agent-config` are all required. `MINIWOB_BASE_URL` must serve the
MiniWoB++ pages at the `assets_revision` pinned in the manifest, and
`--agent-config` must contain exactly `base_url`, `api_key_env`, and `model_id`,
with the named key present in the environment. `pnpm build` must have produced
`apps/cli/dist/index.js` first; the run drives every action through that server.

Expected: 125 task records and zero infrastructure omissions. Any failed task
remains in the denominator.

- [ ] **Step 5: Improve generic failures test-first**

Group failures by `invalid_action`, `target_not_found`, `popup`, `timeout`,
`policy_block`, `verification`, `agent`, and `environment`. Implement only
general runtime changes supported by a new non-benchmark-specific regression
test. Rerun the full 125-task suite after each accepted change.

- [ ] **Step 6: Freeze the candidate and Hard-30 run manifest**

Run:

```bash
git status --short
git rev-parse HEAD
browser_instrumentation_commit="$(
  git log -1 --format=%H \
    --grep='^feat(browser): support benchmark connections and traces$'
)"
test -n "$browser_instrumentation_commit"
melra-browser-bench freeze-run \
  --registered benchmarks/browser-agent/manifests/webarena-verified-hard-30-v1.json \
  --baseline-source a8a0a0907a7eed29249b94c89af3449efbcec4c3 \
  --instrumentation "$browser_instrumentation_commit" \
  --candidate "$(git rev-parse HEAD)" \
  --agent-config benchmarks/browser-agent/runs/config/agent.json \
  --environment-config benchmarks/browser-agent/runs/config/environment.json \
  --output benchmarks/browser-agent/manifests/webarena-verified-hard-30-run.json
melra-browser-bench validate-manifest \
  benchmarks/browser-agent/manifests/webarena-verified-hard-30-run.json
```

Expected: clean tree, immutable candidate/model/image/prompt/tool-schema
identities, 30 tasks, and `publishable_inputs=true`.

Commit:

```bash
git add benchmarks/browser-agent/manifests docs/research
git commit -s -m "bench(browser): freeze representative evaluation"
```

---

### Task 11: Run Hard-30, publish evidence, and merge

**Files:**
- Create after valid run: `docs/research/results/browser-agent-benchmark.json`
- Modify after valid run: `docs/research/BROWSER.md`
- Modify after valid run: `docs/research/README.md`
- Modify after valid run: `docs/VALIDATION.md`
- Modify after valid run: `ROADMAP.md`

**Interfaces:**
- Consumes: frozen run manifest, authorized model, authorized environment, baseline commit, candidate commit.
- Produces: one valid baseline/candidate record for every registered task, sanitized aggregate artifact, GitHub PR and merge.

- [ ] **Step 1: Request exact environment authorization**

If local disk remains insufficient, present the exact cloud provider/project,
machine type, disk, container images, runtime limit, and maximum cost. If local
Docker cleanup is proposed instead, list the exact image/volume/build-cache
targets and recoverability. Do not infer approval from general account access.

- [ ] **Step 2: Preflight without executing tasks**

Run:

```bash
melra-browser-bench preflight-hard30 \
  --manifest benchmarks/browser-agent/manifests/webarena-verified-hard-30-run.json \
  --config benchmarks/browser-agent/runs/config/environment.json \
  --image-config benchmarks/browser-agent/runs/config/images.json
```

`--config` is the environment-control configuration consumed by
`WebArenaEnvironment.from_config`; `--image-config` maps each site name to an
immutable `sha256:<64 hex>` image digest. Both are required, and the command
exits non-zero when any site is not ready.

Expected: all six site families healthy, container digests match, baseline and
candidate commands resolve to their pinned commits, model identity matches,
and no task has started.

- [ ] **Step 3: Run the registered paired evaluation once**

Run:

```bash
uv run --project benchmarks/browser-agent --extra webarena \
  melra-browser-bench run-hard30 \
  --manifest benchmarks/browser-agent/manifests/webarena-verified-hard-30-run.json \
  --config benchmarks/browser-agent/runs/config/environment.json \
  --image-config benchmarks/browser-agent/runs/config/images.json \
  --run-dir benchmarks/browser-agent/runs/hard30-paired \
  --baseline-runner benchmarks/browser-agent/runs/config/baseline-runner \
  --candidate-runner benchmarks/browser-agent/runs/config/candidate-runner
```

`--baseline-runner` and `--candidate-runner` are executable files. Each is
invoked as `<runner> --task-id N --config <path> --output-dir <path>` and must
print a final JSON line carrying `infrastructure_failure`, `official_status`,
`official_score`, `evaluator_checksum`, and `data_checksum`. Any missing or
malformed field marks that side infrastructure-invalid rather than failed.

Expected: 60 side records, 30 valid pairs, no omitted task IDs, and raw HAR
only under the ignored run directory.

- [ ] **Step 4: Sanitize and independently regenerate the report**

Run:

```bash
uv run --project benchmarks/browser-agent \
  melra-browser-bench publish \
  --run-dir benchmarks/browser-agent/runs/hard30-paired \
  --output docs/research/results/browser-agent-benchmark.json
uv run --project benchmarks/browser-agent \
  melra-browser-bench verify-public \
  docs/research/results/browser-agent-benchmark.json
! rg -n '(Bearer [A-Za-z0-9._-]+|gh[pousr]_[A-Za-z0-9]+|/Users/|"(cookie|set-cookie|postData)")' \
  docs/research/results/browser-agent-benchmark.json
```

The secret/path scan must return no match. The publication step must fail when the run is
partial, infrastructure-invalid, mutable, or contains sensitive fields.

- [ ] **Step 5: Update only claims proven by the artifact**

Write the exact numerator/30, Wilson interval, paired wins/losses/ties,
McNemar result, token counts, latency, environment, and limitations. Check the
roadmap item only if the artifact passed `verify-public`.

- [ ] **Step 6: Run the full completion audit**

Run fresh:

```bash
pnpm check
pnpm evals
pnpm e2e
pnpm pack:check
pnpm security:audit
pnpm benchmark:core
pnpm benchmark:locomo -- --dataset /tmp/locomo/data/locomo10.json \
  --output /tmp/locomo-retrieval-verify.json
pnpm benchmark:browser:check
pnpm benchmark:browser:verify-upstream
uv run --project benchmarks/browser-agent \
  melra-browser-bench verify-public \
  docs/research/results/browser-agent-benchmark.json
git diff --check
git status --short
```

Compare regenerated memory/core benchmark output with committed artifacts and
explain environment-only latency changes; do not overwrite unrelated evidence.

- [ ] **Step 7: Commit, push, open the PR, and wait for checks**

```bash
git add README.md ROADMAP.md docs benchmarks packages apps sdk-py package.json .gitignore
git commit -s -m "bench(browser): publish representative verified evidence"
git push -u origin coder/representative-browser-benchmark
gh pr create --repo XAGI-Lab/melra \
  --base main \
  --head coder/representative-browser-benchmark \
  --title "Add representative browser-agent evaluation" \
  --body-file /tmp/melra-browser-benchmark-pr.md
```

Verify every required Node matrix, DCO, dependency review, CodeQL, container,
and benchmark-contract check is successful at the exact PR head.

- [ ] **Step 8: Merge with the task-scoped authorization and restore protection**

If Gautam's review is the only remaining gate, re-read the exact main
protection configuration, temporarily set only the required-review fields to
zero/false, squash-merge the exact green head, and restore all original review
fields in a `finally` path. Then verify:

```bash
gh pr view coder/representative-browser-benchmark --repo XAGI-Lab/melra \
  --json state,mergedAt,mergeCommit
gh api repos/XAGI-Lab/melra/branches/main/protection/required_pull_request_reviews
git fetch --prune origin
git rev-parse origin/main
```

Expected: PR is merged, main contains the exact candidate changes, and
`dismiss_stale_reviews=true`, `require_code_owner_reviews=true`,
`require_last_push_approval=true`, `required_approving_review_count=1`.

---

## Plan self-review checklist

- Every design requirement maps to at least one task.
- MiniWoB is the development suite; Hard-30 remains registered evaluation.
- The task list, version pins, hashes, and baseline commit match the approved specification.
- The model and infrastructure actions remain separately approval-gated.
- Runtime changes preserve the default isolated-browser behavior.
- Every production behavior starts with a test that can fail for a named bug.
- No raw trace, credential, internal path, or private project information is publishable.
- README examples stay inside currently implemented capabilities.
- Full validation, GitHub checks, protected merge, and protection restoration are explicit.
