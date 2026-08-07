# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import os
import shutil
from pathlib import Path
from unittest.mock import AsyncMock, call

import pytest

from melra import MelraClient


@pytest.mark.asyncio
async def test_python_sdk_uses_the_real_stdio_server(tmp_path: Path) -> None:
    repository = Path(__file__).resolve().parents[2]
    cli = repository / "apps" / "cli" / "dist" / "index.js"
    assert cli.exists(), "run pnpm build before the Python SDK test"
    node = shutil.which("node")
    assert node is not None

    async with MelraClient(
        command=node,
        args=[str(cli), "serve"],
        workspace=tmp_path,
        data_directory=tmp_path / ".melra",
        environment={
            "PATH": os.environ["PATH"],
        },
    ) as melra:
        direct_capabilities = await melra.call_tool("melra_capabilities", {})
        assert direct_capabilities["tools"] == [
            "melra_capabilities",
            "melra_plan",
            "melra_execute",
            "melra_task_status",
            "melra_task_cancel",
            "melra_receipt",
            "melra_workflow_plan",
            "melra_workflow_advance",
            "melra_workflow_status",
            "melra_workflow_cancel",
            "melra_workflow_control",
        ]
        capabilities = await melra.capabilities()
        assert capabilities["product"] == "MELRA"
        task = await melra.plan(
            {
                "goal": "Inspect the system through Python",
                "operation": {"kind": "system", "action": "info"},
            }
        )
        execution = await melra.execute(task["id"])
        assert execution["task"]["status"] == "verified_success"


@pytest.mark.asyncio
async def test_python_sdk_calls_workflow_tools_with_validated_inputs() -> None:
    workflow_id = "11111111-1111-4111-8111-111111111111"
    definition = {
        "schemaVersion": "1.0.0",
        "id": "22222222-2222-4222-8222-222222222222",
        "version": 1,
        "name": "Python SDK workflow",
        "nodes": [],
    }
    approval = {
        "approvalId": "33333333-3333-4333-8333-333333333333",
        "phrase": "APPROVE exact",
    }
    supplied = {"nodeId": "review", "value": "ship it"}
    client = MelraClient()
    tool = AsyncMock(
        side_effect=[
            {"id": workflow_id},
            {"run": {"id": workflow_id}, "tasks": [], "events": []},
            {"id": workflow_id},
            {"id": workflow_id},
            {"id": workflow_id},
        ]
    )
    client.call_tool = tool

    await client.plan_workflow(definition)
    await client.advance_workflow(
        workflow_id,
        approvals=[approval],
        inputs=[supplied],
    )
    await client.workflow_status(workflow_id)
    await client.control_workflow(workflow_id, "pause")
    await client.cancel_workflow(workflow_id)

    assert tool.await_args_list == [
        call("melra_workflow_plan", {"definition": definition}),
        call(
            "melra_workflow_advance",
            {
                "workflowId": workflow_id,
                "approvals": [approval],
                "inputs": [supplied],
            },
        ),
        call("melra_workflow_status", {"workflowId": workflow_id}),
        call(
            "melra_workflow_control",
            {"workflowId": workflow_id, "action": "pause"},
        ),
        call("melra_workflow_cancel", {"workflowId": workflow_id}),
    ]
    with pytest.raises(ValueError, match="workflow_id must be a UUID"):
        await client.workflow_status("not-a-uuid")
    with pytest.raises(ValueError, match="action must be"):
        await client.control_workflow(workflow_id, "destroy")
