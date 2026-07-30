# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import os
import shutil
from pathlib import Path

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
