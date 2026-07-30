// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectBrowserExecutable } from "@melra/browser-runtime";
import { createMelraRuntime } from "../src/runtime.js";

const detectedBrowserExecutable = await detectBrowserExecutable();

interface TextToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function parsed(result: unknown): Record<string, unknown> {
  const tool = result as TextToolResult;
  if (tool.isError === true) {
    throw new Error(tool.content.map((item) => item.text ?? "").join("\n"));
  }
  const text = tool.content.find((item) => item.type === "text")?.text;
  if (text === undefined) throw new Error("missing_text_tool_result");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("MELRA over real stdio transport", () => {
  let root: string;
  let dataDirectory: string;
  let client: Client;
  let transport: StdioClientTransport;
  const browserExecutable = detectedBrowserExecutable;
  let fixtureServer: Server | undefined;
  let fixtureUrl: string | undefined;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "melra-e2e-"));
    dataDirectory = join(root, ".data");
    const policyPath = join(root, "policy.json");
    await writeFile(
      policyPath,
      `${JSON.stringify(
        {
          version: "e2e",
          workspaceRoot: root,
          allowedCommands: ["node"],
          allowedDomains: ["127.0.0.1"],
          allowLocalhost: true,
          mutations: "confirm",
          approvalTtlMs: 300_000,
          maxFileBytes: 1_000_000,
        },
        null,
        2,
      )}\n`,
    );

    if (browserExecutable !== undefined) {
      fixtureServer = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(
          "<!doctype html><html><head><title>MELRA Fixture</title></head><body><main><h1>MELRA Browser Verified</h1><button>Inspect</button></main></body></html>",
        );
      });
      await new Promise<void>((resolvePromise) => {
        fixtureServer!.listen(0, "127.0.0.1", resolvePromise);
      });
      const address = fixtureServer.address();
      if (address === null || typeof address === "string") {
        throw new Error("fixture_server_address_unavailable");
      }
      fixtureUrl = `http://127.0.0.1:${address.port}`;
    }

    const rootPackage = resolve(import.meta.dirname, "../../..");
    const cli = join(rootPackage, "apps/cli/dist/index.js");
    const childEnvironment = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [cli, "serve"],
      cwd: rootPackage,
      env: {
        ...childEnvironment,
        MELRA_WORKSPACE: root,
        MELRA_HOME: dataDirectory,
        MELRA_POLICY: policyPath,
        ...(browserExecutable === undefined
          ? {}
          : { MELRA_BROWSER: browserExecutable }),
      },
      stderr: "pipe",
    });
    client = new Client({ name: "melra-e2e", version: "1.0.0" });
    await client.connect(transport);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await new Promise<void>((resolvePromise) => {
      if (fixtureServer === undefined) {
        resolvePromise();
        return;
      }
      fixtureServer.close(() => resolvePromise());
    });
    await rm(root, { recursive: true, force: true });
  });

  it("advertises exactly the compact ten-tool product surface", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "melra_capabilities",
      "melra_execute",
      "melra_plan",
      "melra_receipt",
      "melra_task_cancel",
      "melra_task_status",
      "melra_workflow_advance",
      "melra_workflow_cancel",
      "melra_workflow_plan",
      "melra_workflow_status",
    ]);
    const capabilities = parsed(
      await client.callTool({ name: "melra_capabilities", arguments: {} }),
    );
    expect(capabilities.product).toBe("MELRA");
    expect(
      (capabilities.operations as Record<string, unknown>).computer,
    ).toEqual([
      "capabilities",
      "screenshot",
      "click",
      "move",
      "type",
      "key",
      "scroll",
    ]);
  });

  it("plans and advances a verified workflow over MCP", async () => {
    const planned = parsed(
      await client.callTool({
        name: "melra_workflow_plan",
        arguments: {
          definition: {
            schemaVersion: "1.0.0",
            id: "11111111-1111-4111-8111-111111111111",
            version: 1,
            name: "MCP workflow",
            nodes: [
              {
                id: "inspect",
                type: "operation",
                request: {
                  goal: "Inspect through a workflow",
                  operation: { kind: "system", action: "info" },
                },
              },
            ],
          },
        },
      }),
    );
    expect(planned.status).toBe("planned");

    const advanced = parsed(
      await client.callTool({
        name: "melra_workflow_advance",
        arguments: { workflowId: planned.id },
      }),
    ) as { run: Record<string, unknown> };
    expect(advanced.run.status).toBe("verified_complete");
    expect(
      parsed(
        await client.callTool({
          name: "melra_workflow_status",
          arguments: { workflowId: planned.id },
        }),
      ).status,
    ).toBe("verified_complete");
    expect(
      parsed(
        await client.callTool({
          name: "melra_workflow_cancel",
          arguments: { workflowId: planned.id },
        }),
      ).status,
    ).toBe("verified_complete");
  });

  it("rejects the retired tool prefix", async () => {
    const retiredPrefix = ["at", "las"].join("");
    const result = (await client.callTool({
        name: `${retiredPrefix}_plan`,
        arguments: { goal: "This compatibility alias must not exist." },
      })) as TextToolResult;
    expect(result.isError).toBe(true);
    expect(result.content.map((item) => item.text ?? "").join("\n")).toMatch(
      /not found/i,
    );
  });

  it("recreates the runtime with a stable key and executable task payload", async () => {
    const restartRoot = await mkdtemp(join(tmpdir(), "melra-restart-"));
    const restartHome = join(restartRoot, ".melra");
    const first = await createMelraRuntime({
      workspaceRoot: restartRoot,
      dataDirectory: restartHome,
      environment: {},
    });
    const task = first.controller.plan({
      goal: "Execute after runtime restart",
      operation: { kind: "system", action: "info" },
      constraints: [],
      forbiddenEffects: [],
      requiredEvidence: [],
      budget: {
        maxDurationMs: 120_000,
        maxRetries: 2,
        maxSteps: 10,
      },
    });
    const firstKey = await readFile(join(restartHome, "payload.key"), "utf8");
    await first.close();

    const second = await createMelraRuntime({
      workspaceRoot: restartRoot,
      dataDirectory: restartHome,
      environment: {},
    });
    try {
      expect(second.workflows).toBeDefined();
      expect((await second.controller.execute(task.id)).task.status).toBe(
        "verified_success",
      );
      expect(await readFile(join(restartHome, "payload.key"), "utf8")).toBe(
        firstKey,
      );
    } finally {
      await second.close();
      await rm(restartRoot, { recursive: true, force: true });
    }
  });

  it("inspects computer-use support through the governed task path", async () => {
    const task = parsed(
      await client.callTool({
        name: "melra_plan",
        arguments: {
          goal: "Inspect local computer-use support",
          operation: { kind: "computer", action: "capabilities" },
          requiredEvidence: [
            {
              type: "result_equals",
              path: "platform",
              value: process.platform,
            },
          ],
        },
      }),
    );
    expect(task.status).toBe("planned");
    const execution = parsed(
      await client.callTool({
        name: "melra_execute",
        arguments: { taskId: task.id },
      }),
    ) as {
      task: Record<string, unknown>;
      output: Record<string, unknown>;
    };
    expect(execution.task.status).toBe("verified_success");
    expect(execution.output.platform).toBe(process.platform);
  });

  it("plans, executes, verifies, and receipts a system task", async () => {
    const task = parsed(
      await client.callTool({
        name: "melra_plan",
        arguments: {
          goal: "Inspect the local runtime",
          operation: { kind: "system", action: "info" },
        },
      }),
    );
    expect(task.status).toBe("planned");
    const execution = parsed(
      await client.callTool({
        name: "melra_execute",
        arguments: { taskId: task.id },
      }),
    ) as { task: Record<string, unknown>; certificate: Record<string, unknown> };
    expect(execution.task.status).toBe("verified_success");
    expect(execution.certificate.result).toBe("VERIFIED_SUCCESS");
    const evidence = parsed(
      await client.callTool({
        name: "melra_receipt",
        arguments: { taskId: task.id },
      }),
    ) as { receipts: unknown[]; certificate: Record<string, unknown> };
    expect(evidence.receipts).toHaveLength(1);
    expect(evidence.certificate.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("enforces scoped approval and verifies a real file effect", async () => {
    const task = parsed(
      await client.callTool({
        name: "melra_plan",
        arguments: {
          goal: "Create a verified artifact",
          operation: {
            kind: "file",
            action: "write",
            path: "result.txt",
            content: "created through MCP",
          },
          requiredEvidence: [{ type: "file_exists", path: "result.txt" }],
        },
      }),
    ) as {
      id: string;
      status: string;
      approval: { approvalId: string; phrase: string };
    };
    expect(task.status).toBe("awaiting_approval");
    const execution = parsed(
      await client.callTool({
        name: "melra_execute",
        arguments: {
          taskId: task.id,
          approval: {
            approvalId: task.approval.approvalId,
            phrase: task.approval.phrase,
          },
        },
      }),
    ) as { task: Record<string, unknown>; receipt: Record<string, unknown> };
    expect(execution.task.status).toBe("verified_success");
    expect(execution.receipt.effect).toBe("mutate");
  });

  it("runs a shell-free terminal command through approval and exit verification", async () => {
    const task = parsed(
      await client.callTool({
        name: "melra_plan",
        arguments: {
          goal: "Run a deterministic terminal check",
          operation: {
            kind: "terminal",
            action: "run",
            command: "node",
            args: ["-e", "process.stdout.write('terminal-through-mcp')"],
          },
          requiredEvidence: [
            { type: "exit_code", value: 0 },
            {
              type: "result_contains",
              path: "stdout",
              value: "terminal-through-mcp",
            },
          ],
        },
      }),
    ) as {
      id: string;
      approval: { approvalId: string; phrase: string };
    };
    const execution = parsed(
      await client.callTool({
        name: "melra_execute",
        arguments: {
          taskId: task.id,
          approval: {
            approvalId: task.approval.approvalId,
            phrase: task.approval.phrase,
          },
        },
      }),
    ) as { task: Record<string, unknown> };
    expect(execution.task.status).toBe("verified_success");
  });

  it("persists and retrieves scoped local memory through MCP", async () => {
    const task = parsed(
      await client.callTool({
        name: "melra_plan",
        arguments: {
          goal: "Remember the verified product name",
          operation: {
            kind: "memory",
            action: "put",
            scope: "workspace",
            key: "product",
            value: "MELRA",
          },
          requiredEvidence: [
            { type: "result_equals", path: "stored", value: true },
          ],
        },
      }),
    ) as {
      id: string;
      approval: { approvalId: string; phrase: string };
    };
    const stored = parsed(
      await client.callTool({
        name: "melra_execute",
        arguments: {
          taskId: task.id,
          approval: {
            approvalId: task.approval.approvalId,
            phrase: task.approval.phrase,
          },
        },
      }),
    ) as { task: Record<string, unknown> };
    expect(stored.task.status).toBe("verified_success");

    const search = parsed(
      await client.callTool({
        name: "melra_plan",
        arguments: {
          goal: "Retrieve product memory",
          operation: {
            kind: "memory",
            action: "search",
            scope: "workspace",
            query: "MELRA",
          },
        },
      }),
    );
    const found = parsed(
      await client.callTool({
        name: "melra_execute",
        arguments: { taskId: search.id },
      }),
    ) as {
      output: { memories: Array<{ value: string }> };
    };
    expect(found.output.memories[0]?.value).toBe("MELRA");
  });

  it.skipIf(browserExecutable === undefined)(
    "drives an installed browser through the actual MCP server and verifies the page",
    async () => {
      const task = parsed(
        await client.callTool({
          name: "melra_plan",
          arguments: {
            goal: "Open the deterministic browser fixture",
            operation: {
              kind: "browser",
              action: "navigate",
              url: fixtureUrl,
            },
            requiredEvidence: [
              { type: "page_contains", text: "MELRA Browser Verified" },
              { type: "url_matches", pattern: `${fixtureUrl}*` },
            ],
          },
        }),
      );
      const execution = parsed(
        await client.callTool({
          name: "melra_execute",
          arguments: { taskId: task.id },
        }),
      ) as { task: Record<string, unknown> };
      expect(execution.task.status).toBe("verified_success");
    },
    120_000,
  );
});
