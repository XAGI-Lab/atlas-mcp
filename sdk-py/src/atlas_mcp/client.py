# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
import os
from contextlib import AsyncExitStack
from pathlib import Path
from types import TracebackType
from typing import Any, Self

from mcp import ClientSession, StdioServerParameters
from mcp import types as mcp_types
from mcp.client.stdio import stdio_client


class AtlasClient:
    """Async client for the high-level ATLAS MCP task interface."""

    def __init__(
        self,
        *,
        command: str = "atlas-mcp",
        args: list[str] | None = None,
        workspace: str | Path | None = None,
        data_directory: str | Path | None = None,
        environment: dict[str, str] | None = None,
    ) -> None:
        env = dict(os.environ)
        if workspace is not None:
            env["ATLAS_MCP_WORKSPACE"] = str(Path(workspace).resolve())
        if data_directory is not None:
            env["ATLAS_MCP_HOME"] = str(Path(data_directory).resolve())
        if environment is not None:
            env.update(environment)
        self._parameters = StdioServerParameters(
            command=command,
            args=args or ["serve"],
            env=env,
        )
        self._stack: AsyncExitStack | None = None
        self._session: ClientSession | None = None

    async def __aenter__(self) -> Self:
        stack = AsyncExitStack()
        read, write = await stack.enter_async_context(stdio_client(self._parameters))
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        self._stack = stack
        self._session = session
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if self._stack is not None:
            await self._stack.aclose()
        self._stack = None
        self._session = None

    @property
    def session(self) -> ClientSession:
        if self._session is None:
            raise RuntimeError("AtlasClient must be used as an async context manager")
        return self._session

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Call one ATLAS MCP tool and parse its JSON text result."""
        result = await self.session.call_tool(name, arguments)
        text = next(
            (
                content.text
                for content in result.content
                if isinstance(content, mcp_types.TextContent)
            ),
            None,
        )
        if text is None:
            raise RuntimeError("ATLAS MCP returned no JSON text result")
        if result.isError:
            raise RuntimeError(text)
        parsed: dict[str, Any] = json.loads(text)
        return parsed

    async def capabilities(self) -> dict[str, Any]:
        return await self.call_tool("atlas_capabilities", {})

    async def plan(self, request: dict[str, Any]) -> dict[str, Any]:
        return await self.call_tool("atlas_plan", request)

    async def execute(
        self,
        task_id: str,
        approval: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        arguments: dict[str, Any] = {"taskId": task_id}
        if approval is not None:
            arguments["approval"] = approval
        return await self.call_tool("atlas_execute", arguments)

    async def status(self, task_id: str) -> dict[str, Any]:
        return await self.call_tool("atlas_task_status", {"taskId": task_id})

    async def cancel(self, task_id: str) -> dict[str, Any]:
        return await self.call_tool("atlas_task_cancel", {"taskId": task_id})

    async def receipt(
        self,
        *,
        task_id: str | None = None,
        receipt_id: str | None = None,
    ) -> dict[str, Any]:
        if task_id is None and receipt_id is None:
            raise ValueError("task_id or receipt_id is required")
        arguments: dict[str, Any] = {}
        if task_id is not None:
            arguments["taskId"] = task_id
        if receipt_id is not None:
            arguments["receiptId"] = receipt_id
        return await self.call_tool("atlas_receipt", arguments)
