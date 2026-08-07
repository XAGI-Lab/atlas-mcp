// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  WorkflowAdvanceInputSchema,
  WorkflowAdvanceResultSchema,
  WorkflowControlInputSchema,
  WorkflowDefinitionSchema,
  WorkflowIdInputSchema,
  WorkflowRunSchema,
  type WorkflowAdvanceResult,
  type WorkflowDefinition,
  type WorkflowInput,
  type WorkflowRun,
  type ApprovalResponse,
  type TaskRequest,
} from "@melra/protocol";

export interface MelraClientOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  clientName?: string;
  clientVersion?: string;
}

interface TextContent {
  type: string;
  text?: string;
}

export function parseMelraToolResult(result: unknown): Record<string, unknown> {
  const response = result as {
    isError?: boolean;
    content?: TextContent[];
  };
  const text = response.content?.find((item) => item.type === "text")?.text;
  if (text === undefined) throw new Error("melra_missing_text_result");
  if (response.isError === true) throw new Error(text);
  return JSON.parse(text) as Record<string, unknown>;
}

export class MelraClient {
  private constructor(private readonly client: Client) {}

  static async connect(options: MelraClientOptions = {}): Promise<MelraClient> {
    const transport = new StdioClientTransport({
      command: options.command ?? "melra",
      args: options.args ?? ["serve"],
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: options.env }),
      stderr: "pipe",
    });
    const client = new Client({
      name: options.clientName ?? "melra-sdk",
      version: options.clientVersion ?? "0.1.0",
    });
    await client.connect(transport);
    return new MelraClient(client);
  }

  private async call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return parseMelraToolResult(
      await this.client.callTool({ name, arguments: args }),
    );
  }

  async capabilities(): Promise<Record<string, unknown>> {
    return await this.call("melra_capabilities", {});
  }

  async plan(request: TaskRequest): Promise<Record<string, unknown>> {
    return await this.call("melra_plan", request as unknown as Record<string, unknown>);
  }

  async execute(
    taskId: string,
    approval?: ApprovalResponse,
  ): Promise<Record<string, unknown>> {
    return await this.call("melra_execute", {
      taskId,
      ...(approval === undefined ? {} : { approval }),
    });
  }

  async status(taskId: string): Promise<Record<string, unknown>> {
    return await this.call("melra_task_status", { taskId });
  }

  async cancel(taskId: string): Promise<Record<string, unknown>> {
    return await this.call("melra_task_cancel", { taskId });
  }

  async receipt(input: {
    taskId?: string;
    receiptId?: string;
  }): Promise<Record<string, unknown>> {
    return await this.call("melra_receipt", {
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.receiptId === undefined ? {} : { receiptId: input.receiptId }),
    });
  }

  async planWorkflow(
    definition: WorkflowDefinition,
  ): Promise<WorkflowRun> {
    const parsed = WorkflowDefinitionSchema.parse(definition);
    return WorkflowRunSchema.parse(
      await this.call("melra_workflow_plan", {
        definition: parsed,
      }),
    );
  }

  async advanceWorkflow(
    workflowId: string,
    approvals: ApprovalResponse[] = [],
    inputs: WorkflowInput[] = [],
  ): Promise<WorkflowAdvanceResult> {
    const parsed = WorkflowAdvanceInputSchema.parse({
      workflowId,
      approvals,
      inputs,
    });
    return WorkflowAdvanceResultSchema.parse(
      await this.call("melra_workflow_advance", parsed),
    );
  }

  async workflowStatus(workflowId: string): Promise<WorkflowRun> {
    const parsed = WorkflowIdInputSchema.parse({ workflowId });
    return WorkflowRunSchema.parse(
      await this.call("melra_workflow_status", parsed),
    );
  }

  async cancelWorkflow(workflowId: string): Promise<WorkflowRun> {
    const parsed = WorkflowIdInputSchema.parse({ workflowId });
    return WorkflowRunSchema.parse(
      await this.call("melra_workflow_cancel", parsed),
    );
  }

  async controlWorkflow(
    workflowId: string,
    action: "pause" | "resume" | "suspend",
  ): Promise<WorkflowRun> {
    const parsed = WorkflowControlInputSchema.parse({ workflowId, action });
    return WorkflowRunSchema.parse(
      await this.call("melra_workflow_control", parsed),
    );
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
