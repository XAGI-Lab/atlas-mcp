// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  MelraCapabilitiesInputSchema,
  MelraExecuteInputSchema,
  MelraPlanInputSchema,
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

/**
 * The one description of what this server can do. The HTTP API serves the same
 * object, so a console and a model cannot be told different stories about the
 * posture they are operating under.
 */
export function capabilitiesPayload(runtime: MelraRuntime): unknown {
  return {
        product: "MELRA",
        version: PRODUCT_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        tools: TOOL_NAMES,
        operations: {
          file: ["list", "read", "stat", "hash", "write", "move", "delete", "mkdir"],
          terminal: ["run", "start", "status", "output", "send", "stop"],
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
            "inspect",
            "screenshot",
            "click",
            "move",
            "drag",
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
          // An agent that reads capabilities should be able to tell that nothing
          // is going to stop it, and a human reading a transcript should see the
          // same. Reporting the usual read-only posture here while running
          // unhinged would be the one lie the whole surface cannot afford.
          defaultPosture: runtime.policy.unhinged ? "unhinged" : "read-only",
          unhinged: runtime.policy.unhinged,
          ...(runtime.policy.unhinged
            ? {
                unhingedWarning:
                  "No policy, approval, evidence, confinement, or destination check is applied. Every listed limit below is advisory only.",
              }
            : {}),
          mutations: runtime.policy.mutations,
          allowedCommands: runtime.policy.allowedCommands,
          // Named here because `allowedCommands` alone reads as the whole
          // terminal posture, and it is not: `npm` on the allowlist with
          // `package-install` denied permits `npm test` and refuses `npm i`.
          deniedTraits: runtime.policy.deniedTraits,
          // A caller cannot tell from a denial alone whether it is missing one
          // grant or living in a closed world, so say which one this is up
          // front. The grants themselves are the operator's to know.
          capabilityGrants: runtime.policy.capabilities.length,
          capabilityMode:
            runtime.policy.capabilities.length === 0
              ? "ungranted"
              : "granted-only",
          // Worth knowing before a caller plans a retry loop: after this many
          // consecutive failures against one target, the next task touching it
          // is refused outright rather than run.
          circuitBreaker: runtime.policy.circuitBreaker,
          allowedDomains: runtime.policy.allowedDomains,
          allowLocalhost: runtime.policy.allowLocalhost,
          // A blocked popup is reported on the action that provoked it, so a
          // caller knows in advance whether a window it did not open will still
          // be there to address.
          popups: runtime.policy.popups,
          telemetry: "off",
        },
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
      inputSchema: MelraCapabilitiesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => toolResult(capabilitiesPayload(runtime)),
  );

  server.registerTool(
    "melra_plan",
    {
      title: "Plan a MELRA task",
      description:
        "Persist a bounded task, evaluate policy, and return any scoped approval challenge without executing. " +
        "Nothing runs until melra_execute. A policy denial comes back as a normal result with status policy_blocked and a reason, not as an error. " +
        "Any operation that is not a read needs requiredEvidence, and constraints must stay empty.",
      inputSchema: MelraPlanInputSchema,
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
        "Execute one previously planned task through policy, runtime, verification, and receipt generation. " +
        "If melra_plan returned an approval challenge, pass its id and its exact phrase; the phrase is scoped to that one task and expires. " +
        "Policy is re-evaluated here, so a plan made under a looser policy is still refused. Only reads are retried.",
      inputSchema: MelraExecuteInputSchema,
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
      inputSchema: MelraTaskStatusInputSchema,
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
      inputSchema: MelraTaskCancelInputSchema,
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
      inputSchema: MelraReceiptInputSchema,
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
      inputSchema: WorkflowPlanInputSchema,
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
      inputSchema: WorkflowAdvanceInputSchema,
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
      inputSchema: WorkflowIdInputSchema,
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
      inputSchema: WorkflowIdInputSchema,
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
      inputSchema: WorkflowControlInputSchema,
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
