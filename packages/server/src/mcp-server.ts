// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  AtlasCapabilitiesInputSchema,
  AtlasExecuteInputSchema,
  AtlasPlanInputSchema,
  AtlasReceiptBaseSchema,
  AtlasReceiptInputSchema,
  AtlasTaskCancelInputSchema,
  AtlasTaskStatusInputSchema,
  PRODUCT_VERSION,
  PROTOCOL_VERSION,
  TaskRequestSchema,
} from "@atlas-mcp/protocol";
import type { AtlasRuntime } from "./runtime.js";

function toolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function createMcpServer(runtime: AtlasRuntime): McpServer {
  const server = new McpServer({
    name: "atlas-mcp",
    version: PRODUCT_VERSION,
  });

  server.registerTool(
    "atlas_capabilities",
    {
      title: "ATLAS MCP capabilities",
      description:
        "Discover available local execution capabilities, policy defaults, and runtime limits.",
      inputSchema: AtlasCapabilitiesInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      toolResult({
        product: "ATLAS MCP",
        version: PRODUCT_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        tools: [
          "atlas_capabilities",
          "atlas_plan",
          "atlas_execute",
          "atlas_task_status",
          "atlas_task_cancel",
          "atlas_receipt",
        ],
        operations: {
          file: ["list", "read", "stat", "hash", "write", "move", "delete", "mkdir"],
          terminal: ["run", "start", "status", "output", "stop"],
          browser: [
            "navigate",
            "inspect",
            "click",
            "type",
            "select",
            "press",
            "scroll",
            "screenshot",
            "upload",
            "download",
            "tabs",
            "close",
          ],
          memory: ["put", "search", "list", "delete", "clear"],
          computer: [
            "capabilities",
            "screenshot",
            "click",
            "move",
            "type",
            "key",
            "scroll",
          ],
          system: ["info"],
        },
        policy: {
          version: runtime.policy.version,
          workspaceRoot: runtime.policy.workspaceRoot,
          defaultPosture: "read-only",
          mutations: runtime.policy.mutations,
          allowedCommands: runtime.policy.allowedCommands,
          allowedDomains: runtime.policy.allowedDomains,
          allowLocalhost: runtime.policy.allowLocalhost,
          telemetry: "off",
        },
      }),
  );

  server.registerTool(
    "atlas_plan",
    {
      title: "Plan an ATLAS MCP task",
      description:
        "Persist a bounded task, evaluate policy, and return any scoped approval challenge without executing.",
      inputSchema: AtlasPlanInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => toolResult(runtime.controller.plan(TaskRequestSchema.parse(input))),
  );

  server.registerTool(
    "atlas_execute",
    {
      title: "Execute a planned ATLAS MCP task",
      description:
        "Execute one previously planned task through policy, runtime, verification, and receipt generation.",
      inputSchema: AtlasExecuteInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      const parsed = AtlasExecuteInputSchema.parse(input);
      return toolResult(
        await runtime.controller.execute(parsed.taskId, parsed.approval),
      );
    },
  );

  server.registerTool(
    "atlas_task_status",
    {
      title: "Inspect ATLAS MCP task status",
      description: "Read the current durable state of a task.",
      inputSchema: AtlasTaskStatusInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = AtlasTaskStatusInputSchema.parse(input);
      return toolResult(runtime.controller.status(parsed.taskId));
    },
  );

  server.registerTool(
    "atlas_task_cancel",
    {
      title: "Cancel an ATLAS MCP task",
      description: "Cooperatively cancel a running or pending task.",
      inputSchema: AtlasTaskCancelInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = AtlasTaskCancelInputSchema.parse(input);
      return toolResult(runtime.controller.cancel(parsed.taskId));
    },
  );

  server.registerTool(
    "atlas_receipt",
    {
      title: "Read ATLAS MCP evidence",
      description: "Retrieve action receipts and the execution certificate.",
      inputSchema: AtlasReceiptBaseSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = AtlasReceiptInputSchema.parse(input);
      return toolResult(
        runtime.controller.receipts({
          ...(parsed.taskId === undefined ? {} : { taskId: parsed.taskId }),
          ...(parsed.receiptId === undefined
            ? {}
            : { receiptId: parsed.receiptId }),
        }),
      );
    },
  );
  return server;
}

export async function serveStdio(runtime: AtlasRuntime): Promise<McpServer> {
  const server = createMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
