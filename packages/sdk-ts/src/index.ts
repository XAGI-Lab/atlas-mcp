// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  ApprovalResponse,
  TaskRequest,
} from "@atlas-mcp/protocol";

export interface AtlasClientOptions {
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

export function parseAtlasToolResult(result: unknown): Record<string, unknown> {
  const response = result as {
    isError?: boolean;
    content?: TextContent[];
  };
  const text = response.content?.find((item) => item.type === "text")?.text;
  if (text === undefined) throw new Error("atlas_mcp_missing_text_result");
  if (response.isError === true) throw new Error(text);
  return JSON.parse(text) as Record<string, unknown>;
}

export class AtlasClient {
  private constructor(private readonly client: Client) {}

  static async connect(options: AtlasClientOptions = {}): Promise<AtlasClient> {
    const transport = new StdioClientTransport({
      command: options.command ?? "atlas-mcp",
      args: options.args ?? ["serve"],
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.env === undefined ? {} : { env: options.env }),
      stderr: "pipe",
    });
    const client = new Client({
      name: options.clientName ?? "atlas-mcp-sdk",
      version: options.clientVersion ?? "0.1.0",
    });
    await client.connect(transport);
    return new AtlasClient(client);
  }

  private async call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return parseAtlasToolResult(
      await this.client.callTool({ name, arguments: args }),
    );
  }

  async capabilities(): Promise<Record<string, unknown>> {
    return await this.call("atlas_capabilities", {});
  }

  async plan(request: TaskRequest): Promise<Record<string, unknown>> {
    return await this.call("atlas_plan", request as unknown as Record<string, unknown>);
  }

  async execute(
    taskId: string,
    approval?: ApprovalResponse,
  ): Promise<Record<string, unknown>> {
    return await this.call("atlas_execute", {
      taskId,
      ...(approval === undefined ? {} : { approval }),
    });
  }

  async status(taskId: string): Promise<Record<string, unknown>> {
    return await this.call("atlas_task_status", { taskId });
  }

  async cancel(taskId: string): Promise<Record<string, unknown>> {
    return await this.call("atlas_task_cancel", { taskId });
  }

  async receipt(input: {
    taskId?: string;
    receiptId?: string;
  }): Promise<Record<string, unknown>> {
    return await this.call("atlas_receipt", {
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.receiptId === undefined ? {} : { receiptId: input.receiptId }),
    });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
