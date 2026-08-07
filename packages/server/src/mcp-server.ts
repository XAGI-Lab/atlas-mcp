// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  MelraCapabilitiesInputSchema,
  MelraExecuteInputSchema,
  MelraPlanInputSchema,
  MelraReceiptBaseSchema,
  MelraReceiptInputSchema,
  MelraTaskCancelInputSchema,
  MelraTaskStatusInputSchema,
  PRODUCT_VERSION,
  PROTOCOL_VERSION,
  TaskRequestSchema,
  TOOL_NAMES,
  WorkflowAdvanceInputSchema,
  WorkflowControlInputSchema,
  WorkflowDefinitionSchema,
  WorkflowIdInputSchema,
  WorkflowPlanInputSchema,
} from "@melra/protocol";
import type { MelraRuntime } from "./runtime.js";

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

export function createMcpServer(runtime: MelraRuntime): McpServer {
  const server = new McpServer({
    name: "melra",
    version: PRODUCT_VERSION,
  });

  server.registerTool(
    "melra_capabilities",
    {
      title: "MELRA capabilities",
      description:
        "Discover available local execution capabilities, policy defaults, and runtime limits.",
      inputSchema: MelraCapabilitiesInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      toolResult({
        product: "MELRA",
        version: PRODUCT_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        tools: TOOL_NAMES,
        operations: {
          file: ["list", "read", "stat", "hash", "write", "move", "delete", "mkdir"],
          terminal: ["run", "start", "status", "output", "stop"],
          browser: [
            "navigate",
            "back",
            "forward",
            "reload",
            "inspect",
            "wait",
            "click",
            "type",
            "fill_form",
            "select",
            "press",
            "scroll",
            "screenshot",
            "upload",
            "download",
            "tabs",
            "tab_new",
            "tab_switch",
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
        workflowNodes: [
          "operation",
          "approval",
          "condition",
          "parallel",
          "bounded_loop",
          "checkpoint",
          "compensation",
          "human_input",
          "delegation",
        ],
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
    "melra_plan",
    {
      title: "Plan a MELRA task",
      description:
        "Persist a bounded task, evaluate policy, and return any scoped approval challenge without executing.",
      inputSchema: MelraPlanInputSchema.shape,
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
    "melra_execute",
    {
      title: "Execute a planned MELRA task",
      description:
        "Execute one previously planned task through policy, runtime, verification, and receipt generation.",
      inputSchema: MelraExecuteInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      const parsed = MelraExecuteInputSchema.parse(input);
      return toolResult(
        await runtime.controller.execute(parsed.taskId, parsed.approval),
      );
    },
  );

  server.registerTool(
    "melra_task_status",
    {
      title: "Inspect MELRA task status",
      description: "Read the current durable state of a task.",
      inputSchema: MelraTaskStatusInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = MelraTaskStatusInputSchema.parse(input);
      return toolResult(runtime.controller.status(parsed.taskId));
    },
  );

  server.registerTool(
    "melra_task_cancel",
    {
      title: "Cancel a MELRA task",
      description: "Cooperatively cancel a running or pending task.",
      inputSchema: MelraTaskCancelInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = MelraTaskCancelInputSchema.parse(input);
      return toolResult(runtime.controller.cancel(parsed.taskId));
    },
  );

  server.registerTool(
    "melra_receipt",
    {
      title: "Read MELRA evidence",
      description: "Retrieve action receipts and the execution certificate.",
      inputSchema: MelraReceiptBaseSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = MelraReceiptInputSchema.parse(input);
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

  server.registerTool(
    "melra_workflow_plan",
    {
      title: "Plan a MELRA workflow",
      description:
        "Validate, preflight, encrypt, and persist a bounded workflow without executing it.",
      inputSchema: WorkflowPlanInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = WorkflowPlanInputSchema.parse(input);
      return toolResult(
        runtime.workflows.plan(
          WorkflowDefinitionSchema.parse(parsed.definition),
        ),
      );
    },
  );

  server.registerTool(
    "melra_workflow_advance",
    {
      title: "Advance a MELRA workflow",
      description:
        "Execute one ready workflow scheduling wave through governed MELRA tasks.",
      inputSchema: WorkflowAdvanceInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      const parsed = WorkflowAdvanceInputSchema.parse(input);
      return toolResult(
        await runtime.workflows.advance(
          parsed.workflowId,
          parsed.approvals,
          parsed.inputs,
        ),
      );
    },
  );

  server.registerTool(
    "melra_workflow_status",
    {
      title: "Inspect a MELRA workflow",
      description: "Read the current durable workflow projection.",
      inputSchema: WorkflowIdInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = WorkflowIdInputSchema.parse(input);
      return toolResult(runtime.workflows.status(parsed.workflowId));
    },
  );

  server.registerTool(
    "melra_workflow_cancel",
    {
      title: "Cancel a MELRA workflow",
      description:
        "Cooperatively cancel nonterminal workflow nodes and their tasks.",
      inputSchema: WorkflowIdInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = WorkflowIdInputSchema.parse(input);
      return toolResult(runtime.workflows.cancel(parsed.workflowId));
    },
  );

  server.registerTool(
    "melra_workflow_control",
    {
      title: "Pause, resume, or suspend a MELRA workflow",
      description:
        "Halt a running workflow without losing node state, or lift a halt. Node progress is untouched, so a resumed workflow continues where it stopped.",
      inputSchema: WorkflowControlInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const parsed = WorkflowControlInputSchema.parse(input);
      return toolResult(
        parsed.action === "pause"
          ? runtime.workflows.pause(parsed.workflowId)
          : parsed.action === "suspend"
            ? runtime.workflows.suspend(parsed.workflowId)
            : runtime.workflows.resume(parsed.workflowId),
      );
    },
  );
  return server;
}

export async function serveStdio(runtime: MelraRuntime): Promise<McpServer> {
  const server = createMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
