# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest

from atlas_mcp import AtlasClient


@pytest.mark.asyncio
async def test_python_sdk_uses_the_real_stdio_server(tmp_path: Path) -> None:
    repository = Path(__file__).resolve().parents[2]
    cli = repository / "apps" / "cli" / "dist" / "index.js"
    assert cli.exists(), "run pnpm build before the Python SDK test"
    node = shutil.which("node")
    assert node is not None

    async with AtlasClient(
        command=node,
        args=[str(cli), "serve"],
        workspace=tmp_path,
        data_directory=tmp_path / ".atlas",
        environment={
            "PATH": os.environ["PATH"],
        },
    ) as atlas:
        capabilities = await atlas.capabilities()
        assert capabilities["product"] == "ATLAS MCP"
        task = await atlas.plan(
            {
                "goal": "Inspect the system through Python",
                "operation": {"kind": "system", "action": "info"},
            }
        )
        execution = await atlas.execute(task["id"])
        assert execution["task"]["status"] == "verified_success"
