# Copyright 2026 XAGI Labs Private Limited
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from atlas_browser_bench.agent import AgentContext, OpenAICompatibleAgent


class _CompletionHandler(BaseHTTPRequestHandler):
    request_body: dict[str, object] | None = None

    def do_POST(self) -> None:
        length = int(self.headers["content-length"])
        type(self).request_body = json.loads(self.rfile.read(length))
        response = {
            "id": "completion-fixture",
            "model": "provider-model-snapshot-2026-07-28",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call-1",
                                "type": "function",
                                "function": {
                                    "name": "browser_action",
                                    "arguments": json.dumps(
                                        {
                                            "goal": "Submit the form",
                                            "action": "click",
                                            "target": {
                                                "role": "button",
                                                "name": "Submit",
                                            },
                                        }
                                    ),
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {
                "prompt_tokens": 120,
                "prompt_tokens_details": {"cached_tokens": 40},
                "completion_tokens": 18,
            },
        }
        body = json.dumps(response).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


@contextmanager
def completion_server() -> Iterator[str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _CompletionHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        yield f"http://{host}:{port}/v1"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.mark.asyncio
async def test_openai_compatible_agent_parses_one_strict_action() -> None:
    with completion_server() as base_url:
        agent = OpenAICompatibleAgent(
            base_url=base_url,
            api_key="test-only",
            model_id="provider-model-snapshot-2026-07-28",
        )
        decision = await agent.decide(
            AgentContext(
                goal="Submit the form",
                observation={"text": "Ready", "elements": [{"role": "button", "name": "Submit"}]},
            )
        )
    assert decision.action == "click"
    assert decision.target == {"role": "button", "name": "Submit"}
    assert decision.usage.input_tokens == 120
    assert decision.usage.cached_input_tokens == 40
    assert decision.usage.output_tokens == 18
    assert decision.model_id == "provider-model-snapshot-2026-07-28"
    assert len(agent.prompt_sha256) == 64
    assert len(agent.tool_schema_sha256) == 64
    request = _CompletionHandler.request_body
    assert request is not None
    assert request["temperature"] == 0
    assert request["parallel_tool_calls"] is False


class _RateLimitedHandler(BaseHTTPRequestHandler):
    """Answers 429 a fixed number of times, then returns one valid tool call."""

    remaining_rejections: int = 0
    attempts: int = 0
    retry_after: str | None = None

    def do_POST(self) -> None:
        length = int(self.headers["content-length"])
        self.rfile.read(length)
        type(self).attempts += 1
        if type(self).remaining_rejections > 0:
            type(self).remaining_rejections -= 1
            body = json.dumps({"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}}).encode()
            self.send_response(429)
            if type(self).retry_after is not None:
                self.send_header("retry-after", type(self).retry_after)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        response = {
            "id": "completion-fixture",
            "model": "provider-model-snapshot-2026-07-28",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call-1",
                                "type": "function",
                                "function": {
                                    "name": "browser_action",
                                    "arguments": json.dumps(
                                        {
                                            "goal": "Submit the form",
                                            "action": "click",
                                            "target": {"role": "button", "name": "Submit"},
                                        }
                                    ),
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        }
        body = json.dumps(response).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


@contextmanager
def rate_limited_server(
    *, rejections: int, retry_after: str | None = None
) -> Iterator[str]:
    _RateLimitedHandler.remaining_rejections = rejections
    _RateLimitedHandler.attempts = 0
    _RateLimitedHandler.retry_after = retry_after
    server = ThreadingHTTPServer(("127.0.0.1", 0), _RateLimitedHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        yield f"http://{host}:{port}/v1"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


_CONTEXT = AgentContext(goal="Submit the form", observation={"text": "Ready", "elements": []})


@pytest.mark.asyncio
async def test_agent_retries_through_rate_limiting_and_records_waits() -> None:
    waits: list[float] = []

    async def record(seconds: float) -> None:
        waits.append(seconds)

    with rate_limited_server(rejections=3) as base_url:
        agent = OpenAICompatibleAgent(
            base_url=base_url,
            api_key="test-only",
            model_id="provider-model-snapshot-2026-07-28",
            backoff_base_seconds=2,
            backoff_cap_seconds=5,
            sleep=record,
        )
        decision = await agent.decide(_CONTEXT)
    assert decision.action == "click"
    assert _RateLimitedHandler.attempts == 4
    # Exponential, capped: a provider that answers 429 without Retry-After must
    # not be retried in a tight loop.
    assert waits == [2, 4, 5]


@pytest.mark.asyncio
async def test_agent_honors_retry_after_header_when_present() -> None:
    waits: list[float] = []

    async def record(seconds: float) -> None:
        waits.append(seconds)

    with rate_limited_server(rejections=1, retry_after="34") as base_url:
        agent = OpenAICompatibleAgent(
            base_url=base_url,
            api_key="test-only",
            model_id="provider-model-snapshot-2026-07-28",
            sleep=record,
        )
        await agent.decide(_CONTEXT)
    assert waits == [34]


@pytest.mark.asyncio
async def test_agent_gives_up_after_bounded_rate_limit_attempts() -> None:
    async def instant(_seconds: float) -> None:
        return None

    with rate_limited_server(rejections=99) as base_url:
        agent = OpenAICompatibleAgent(
            base_url=base_url,
            api_key="test-only",
            model_id="provider-model-snapshot-2026-07-28",
            max_attempts=3,
            sleep=instant,
        )
        with pytest.raises(httpx.HTTPStatusError):
            await agent.decide(_CONTEXT)
    assert _RateLimitedHandler.attempts == 3
