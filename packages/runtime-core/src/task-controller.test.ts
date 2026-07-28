// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskRequestSchema } from "@atlas-mcp/protocol";
import { createDefaultPolicy } from "@atlas-mcp/policy-core";
import { SqliteStore } from "@atlas-mcp/storage-sqlite";
import { Verifier } from "@atlas-mcp/verifier-core";
import { TaskController } from "./task-controller.js";

const roots: string[] = [];
const stores: SqliteStore[] = [];

afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(
  executor: {
    execute(
      operation?: unknown,
      signal?: AbortSignal,
    ): Promise<Record<string, unknown>>;
  } = {
    async execute() {
      return { success: true, stored: true, value: "verified" };
    },
  },
) {
  const root = await mkdtemp(join(tmpdir(), "atlas-controller-"));
  roots.push(root);
  const store = new SqliteStore(":memory:");
  stores.push(store);
  const controller = new TaskController(
    store,
    createDefaultPolicy(root),
    executor,
    await Verifier.create(root),
  );
  return { controller, store };
}

describe("TaskController", () => {
  it("plans, executes, verifies, and persists a read task", async () => {
    const { controller, store } = await setup();
    const task = controller.plan(
      TaskRequestSchema.parse({
        goal: "Inspect the system",
        operation: { kind: "system", action: "info" },
      }),
    );
    expect(task.status).toBe("planned");
    const execution = await controller.execute(task.id);
    expect(execution.task.status).toBe("verified_success");
    expect(execution.receipt?.success).toBe(true);
    expect(execution.certificate?.result).toBe("VERIFIED_SUCCESS");
    expect(store.getReceiptsForTask(task.id)).toHaveLength(1);
  });

  it("requires the exact approval for mutation", async () => {
    const { controller } = await setup();
    const task = controller.plan(
      TaskRequestSchema.parse({
        goal: "Store a memory",
        operation: {
          kind: "memory",
          action: "put",
          scope: "workspace",
          key: "project",
          value: "ATLAS MCP",
        },
        requiredEvidence: [
          { type: "result_equals", path: "stored", value: true },
        ],
      }),
    );
    expect(task.status).toBe("awaiting_approval");
    await expect(controller.execute(task.id)).rejects.toThrow("approval_required");
    const result = await controller.execute(task.id, {
      approvalId: task.approval!.approvalId,
      phrase: task.approval!.phrase,
    });
    expect(result.task.status).toBe("verified_success");
  });

  it("blocks mutation plans without expected evidence", async () => {
    const { controller } = await setup();
    const task = controller.plan(
      TaskRequestSchema.parse({
        goal: "Write a file",
        operation: {
          kind: "file",
          action: "write",
          path: "result.txt",
          content: "unsafe",
        },
      }),
    );
    expect(task.status).toBe("policy_blocked");
    expect(task.policyDecision.reason).toBe("mutation_requires_evidence");
  });

  it("retries bounded read failures but never loops indefinitely", async () => {
    let attempts = 0;
    const { controller } = await setup({
      async execute() {
        attempts += 1;
        if (attempts < 2) throw new Error("transient_read_failure");
        return { success: true };
      },
    });
    const task = controller.plan(
      TaskRequestSchema.parse({
        goal: "Retry one transient read",
        operation: { kind: "system", action: "info" },
        budget: { maxRetries: 2, maxSteps: 3, maxDurationMs: 5_000 },
      }),
    );
    const result = await controller.execute(task.id);
    expect(result.task.status).toBe("verified_success");
    expect(result.task.attempts).toBe(2);
    expect(attempts).toBe(2);
  });

  it("classifies a generic abort error as budget exhaustion when its timer fires", async () => {
    const { controller } = await setup({
      async execute(_operation, signal?: AbortSignal) {
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new Error("The operation was aborted")),
            { once: true },
          );
        });
        return { success: true };
      },
    });
    const task = controller.plan(
      TaskRequestSchema.parse({
        goal: "Respect a strict execution budget",
        operation: { kind: "system", action: "info" },
        budget: { maxRetries: 0, maxSteps: 1, maxDurationMs: 100 },
      }),
    );
    const result = await controller.execute(task.id);
    expect(result.task.status).toBe("budget_exhausted");
    expect(result.task.error).toBe("task_budget_exhausted");
    expect(result.certificate?.result).toBe("BUDGET_EXHAUSTED");
  });

  it("redacts executor secrets before task or receipt persistence", async () => {
    const { controller, store } = await setup({
      async execute() {
        return {
          success: true,
          stored: true,
          output: "password=hunter2",
          authorization: "Bearer raw-token-value",
        };
      },
    });
    const task = controller.plan(
      TaskRequestSchema.parse({
        goal: "Persist only redacted evidence",
        operation: { kind: "system", action: "info" },
        requiredEvidence: [
          { type: "result_equals", path: "stored", value: true },
        ],
      }),
    );
    const result = await controller.execute(task.id);
    expect(JSON.stringify(result.task.result)).not.toContain("hunter2");
    expect(JSON.stringify(result.receipt?.observedEffect)).not.toContain(
      "raw-token-value",
    );
    expect(result.output?.output).toBe("password=hunter2");
    expect(result.receipt?.redactions.length).toBeGreaterThan(0);
    expect(JSON.stringify(store.getTask(task.id))).not.toContain("hunter2");
  });

  it("shows the live caller the approval input without retaining it", async () => {
    const { controller, store } = await setup({
      async execute() {
        return { success: true, typed: true };
      },
    });
    const secretInput = "one-time private form value";
    const task = controller.plan(
      TaskRequestSchema.parse({
        goal: "Type a reviewed value",
        operation: {
          kind: "browser",
          action: "type",
          target: { selector: "#field" },
          value: secretInput,
        },
        requiredEvidence: [
          { type: "result_equals", path: "typed", value: true },
        ],
      }),
    );
    expect(
      task.request.operation.kind === "browser"
        ? task.request.operation.value
        : undefined,
    ).toBe(secretInput);
    expect(JSON.stringify(store.getTask(task.id))).not.toContain(secretInput);
    const execution = await controller.execute(task.id, {
      approvalId: task.approval!.approvalId,
      phrase: task.approval!.phrase,
    });
    expect(execution.task.status).toBe("verified_success");
  });
});
