# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
import os
from contextlib import AsyncExitStack
from pathlib import Path
from types import TracebackType
from typing import Any, Self
from uuid import UUID

from mcp import ClientSession, StdioServerParameters
from mcp import types as mcp_types
from mcp.client.stdio import stdio_client


class MelraClient:
    """Async client for the high-level MELRA task interface."""

    def __init__(
        self,
        *,
        command: str = "melra",
        args: list[str] | None = None,
        workspace: str | Path | None = None,
        data_directory: str | Path | None = None,
        environment: dict[str, str] | None = None,
    ) -> None:
        env = dict(os.environ)
        if workspace is not None:
            env["MELRA_WORKSPACE"] = str(Path(workspace).resolve())
        if data_directory is not None:
            env["MELRA_HOME"] = str(Path(data_directory).resolve())
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
            raise RuntimeError("MelraClient must be used as an async context manager")
        return self._session

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Call one MELRA tool and parse its JSON text result."""
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
            raise RuntimeError("MELRA returned no JSON text result")
        if result.isError:
            raise RuntimeError(text)
        parsed: dict[str, Any] = json.loads(text)
        return parsed

    async def capabilities(self) -> dict[str, Any]:
        return await self.call_tool("melra_capabilities", {})

    async def plan(self, request: dict[str, Any]) -> dict[str, Any]:
        return await self.call_tool("melra_plan", request)

    async def execute(
        self,
        task_id: str,
        approval: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        arguments: dict[str, Any] = {"taskId": task_id}
        if approval is not None:
            arguments["approval"] = approval
        return await self.call_tool("melra_execute", arguments)

    async def status(self, task_id: str) -> dict[str, Any]:
        return await self.call_tool("melra_task_status", {"taskId": task_id})

    async def cancel(self, task_id: str) -> dict[str, Any]:
        return await self.call_tool("melra_task_cancel", {"taskId": task_id})

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
        return await self.call_tool("melra_receipt", arguments)

    async def plan_workflow(
        self,
        definition: dict[str, Any],
    ) -> dict[str, Any]:
        if not isinstance(definition, dict):
            raise TypeError("definition must be an object")
        return self._object(
            await self.call_tool(
                "melra_workflow_plan",
                {"definition": definition},
            ),
            "workflow plan",
        )

    async def advance_workflow(
        self,
        workflow_id: str,
        *,
        approvals: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        workflow_id = self._workflow_id(workflow_id)
        parsed_approvals = approvals or []
        for approval in parsed_approvals:
            self._workflow_id(
                approval.get("approvalId", ""),
                name="approvalId",
            )
            if not approval.get("phrase"):
                raise ValueError("approval phrase is required")
        return self._object(
            await self.call_tool(
                "melra_workflow_advance",
                {
                    "workflowId": workflow_id,
                    "approvals": parsed_approvals,
                },
            ),
            "workflow advance",
        )

    async def workflow_status(self, workflow_id: str) -> dict[str, Any]:
        return self._object(
            await self.call_tool(
                "melra_workflow_status",
                {"workflowId": self._workflow_id(workflow_id)},
            ),
            "workflow status",
        )

    async def cancel_workflow(self, workflow_id: str) -> dict[str, Any]:
        return self._object(
            await self.call_tool(
                "melra_workflow_cancel",
                {"workflowId": self._workflow_id(workflow_id)},
            ),
            "workflow cancellation",
        )

    @staticmethod
    def _workflow_id(value: str, *, name: str = "workflow_id") -> str:
        try:
            UUID(value)
        except (TypeError, ValueError, AttributeError) as error:
            raise ValueError(f"{name} must be a UUID") from error
        return value

    @staticmethod
    def _object(value: Any, operation: str) -> dict[str, Any]:
        if not isinstance(value, dict):
            raise TypeError(f"MELRA {operation} returned a non-object")
        return value
