# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
from pathlib import Path

import pytest

from atlas_browser_bench.agent import AgentContext, BrowserActionDecision
from atlas_browser_bench.mcp_driver import DriverObservation
from atlas_browser_bench.miniwob import MiniWobStep
from atlas_browser_bench.runner import (
    RunLimits,
    build_run_input_digest,
    load_resumable_task_record,
    run_task,
    write_task_record,
)


class _Agent:
    async def decide(self, _context: AgentContext) -> BrowserActionDecision:
        return BrowserActionDecision(
            goal="Click the button",
            action="click",
            target={"role": "button", "name": "Submit"},
        )


class _Driver:
    async def perform(
        self,
        _decision: BrowserActionDecision,
        _expected_evidence: list[dict[str, object]],
    ) -> DriverObservation:
        return DriverObservation(
            task_id="mcp-task",
            plan_status="awaiting_approval",
            task_status="verified_success",
            output={"clicked": True},
            receipt={"taskId": "mcp-task"},
            certificate={"result": "VERIFIED_SUCCESS"},
            mcp_calls=3,
        )


class _Environment:
    def __init__(self) -> None:
        self.prepared = False

    def agent_context(self, _history: list[dict[str, object]]) -> AgentContext:
        return AgentContext(goal="Click the button", observation={"text": "Submit"})

    def evidence_for(self, _decision: BrowserActionDecision) -> list[dict[str, object]]:
        return [{"type": "result_equals", "path": "clicked", "value": True}]

    async def prepare_external_action(self) -> None:
        self.prepared = True

    async def observe_after_mcp_action(self) -> MiniWobStep:
        assert self.prepared
        return MiniWobStep(
            observation={"text": "Done"},
            reward=1,
            terminated=True,
            truncated=False,
            info={},
        )


@pytest.mark.asyncio
async def test_runner_records_a_verified_mcp_scored_step(tmp_path: Path) -> None:
    record = await run_task(
        task_id="browsergym/miniwob.click-test",
        run_input_digest="a" * 64,
        environment=_Environment(),
        agent=_Agent(),
        driver=_Driver(),
        limits=RunLimits(max_steps=3, task_timeout_seconds=30),
    )
    assert record.success is True
    assert record.reward == 1
    assert record.agent_steps == 1
    assert record.mcp_calls == 3
    path = write_task_record(tmp_path, record)
    assert path.name == "task-browsergym_miniwob.click-test.json"
    assert load_resumable_task_record(path, "a" * 64)["success"] is True
    with pytest.raises(FileExistsError):
        write_task_record(tmp_path, record)
    with pytest.raises(ValueError, match="run_input_digest_mismatch"):
        load_resumable_task_record(path, "b" * 64)
    assert json.loads(path.read_text(encoding="utf-8"))["schema_version"] == "1.0.0"


def test_run_input_digest_is_canonical_and_sensitive() -> None:
    first = build_run_input_digest(
        manifest={"suite": "miniwob-125-v1", "tasks": ["a", "b"]},
        implementation_commit="a" * 40,
        model_id="model-snapshot",
        prompt_sha256="b" * 64,
        tool_schema_sha256="c" * 64,
    )
    reordered = build_run_input_digest(
        manifest={"tasks": ["a", "b"], "suite": "miniwob-125-v1"},
        implementation_commit="a" * 40,
        model_id="model-snapshot",
        prompt_sha256="b" * 64,
        tool_schema_sha256="c" * 64,
    )
    changed = build_run_input_digest(
        manifest={"tasks": ["a", "b"], "suite": "miniwob-125-v1"},
        implementation_commit="d" * 40,
        model_id="model-snapshot",
        prompt_sha256="b" * 64,
        tool_schema_sha256="c" * 64,
    )
    assert first == reordered
    assert first != changed
