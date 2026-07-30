// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TaskRequestSchema,
  type Operation,
} from "@melra/protocol";
import { createDefaultPolicy } from "@melra/policy-core";
import { SqliteStore } from "@melra/storage-sqlite";
import { Verifier } from "@melra/verifier-core";
import { PayloadCipher } from "./payload-cipher.js";
import { TaskController } from "./task-controller.js";

const roots: string[] = [];
const stores: SqliteStore[] = [];

afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(
  executor: {
    capabilities?(): ReadonlySet<Operation["kind"]>;
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
  const root = await mkdtemp(join(tmpdir(), "melra-controller-"));
  roots.push(root);
  const store = new SqliteStore(":memory:");
  stores.push(store);
  const controller = await createController(
    store,
    root,
    Buffer.alloc(32, 7),
    executor,
  );
  return { controller, store };
}

async function createController(
  store: SqliteStore,
  root: string,
  key: Buffer,
  executor: {
    capabilities?(): ReadonlySet<Operation["kind"]>;
    execute(
      operation?: unknown,
      signal?: AbortSignal,
    ): Promise<Record<string, unknown>>;
  },
): Promise<TaskController> {
  return new TaskController(
    store,
    createDefaultPolicy(root),
    executor,
    await Verifier.create(root),
    new PayloadCipher(key),
  );
}

describe("TaskController", () => {
  it("executes a planned task after restart with the same key", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-controller-restart-"));
    roots.push(root);
    const databasePath = join(root, "melra.sqlite");
    const key = Buffer.alloc(32, 21);
    const executor = {
      execute: vi.fn(async () => ({ success: true, value: "verified" })),
    };
    const storeA = new SqliteStore(databasePath);
    stores.push(storeA);
    const controllerA = await createController(storeA, root, key, executor);
    const request = TaskRequestSchema.parse({
      goal: "Inspect the runtime after restart",
      operation: { kind: "system", action: "info" },
    });
    const planned = controllerA.plan(request);
    storeA.close();
    stores.splice(stores.indexOf(storeA), 1);

    const storeB = new SqliteStore(databasePath);
    stores.push(storeB);
    const controllerB = await createController(storeB, root, key, executor);
    const result = await controllerB.execute(planned.id);

    expect(result.task.status).toBe("verified_success");
    expect(executor.execute).toHaveBeenCalledWith(
      request.operation,
      expect.any(AbortSignal),
    );
  });

  it("keeps exact requests out of SQLite and rejects the wrong key", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-controller-sealed-"));
    roots.push(root);
    const databasePath = join(root, "melra.sqlite");
    const storeA = new SqliteStore(databasePath);
    stores.push(storeA);
    const controllerA = await createController(
      storeA,
      root,
      Buffer.alloc(32, 23),
      { async execute() { return { success: true }; } },
    );
    const planned = controllerA.plan(
      TaskRequestSchema.parse({
        goal: "one-time-secret",
        operation: { kind: "system", action: "info" },
      }),
    );
    storeA.close();
    stores.splice(stores.indexOf(storeA), 1);

    expect((await readFile(databasePath)).toString()).not.toContain(
      "one-time-secret",
    );

    const storeB = new SqliteStore(databasePath);
    stores.push(storeB);
    const controllerB = await createController(
      storeB,
      root,
      Buffer.alloc(32, 29),
      { async execute() { return { success: true }; } },
    );
    await expect(controllerB.execute(planned.id)).rejects.toThrow(
      "task_payload_authentication_failed",
    );
  });

  it("verifies an authenticated persisted adapter result", async () => {
    const { controller } = await setup();
    const planned = controller.plan(
      TaskRequestSchema.parse({
        goal: "Persist a result for later workflow conditions",
        operation: { kind: "system", action: "info" },
      }),
    );
    await controller.execute(planned.id);

    await expect(
      controller.verifyPersisted(planned.id, [
        { type: "result_equals", path: "value", value: "verified" },
      ]),
    ).resolves.toMatchObject({ verified: true });
  });

  it("preflights installed capabilities without persisting a task", async () => {
    const { controller, store } = await setup({
      capabilities() {
        return new Set<Operation["kind"]>(["file"]);
      },
      async execute() {
        return { success: true };
      },
    });
    const request = TaskRequestSchema.parse({
      goal: "Require an installed system adapter",
      operation: { kind: "system", action: "info" },
    });

    expect(() => controller.preflight(request)).toThrow(
      "operation_capability_unavailable:system",
    );
    expect(store.listTasks()).toEqual([]);
  });

  it("rejects an approval whose stored action digest no longer matches", async () => {
    const { controller, store } = await setup();
    const planned = controller.plan(
      TaskRequestSchema.parse({
        goal: "Store a governed memory",
        operation: {
          kind: "memory",
          action: "put",
          key: "project",
          value: "MELRA",
        },
        requiredEvidence: [
          { type: "result_equals", path: "stored", value: true },
        ],
      }),
    );
    const stored = store.getTask(planned.id)!;
    stored.approval = {
      ...stored.approval!,
      actionDigest: "0".repeat(64),
    };
    store.saveTask(stored);

    await expect(
      controller.execute(planned.id, {
        approvalId: stored.approval.approvalId,
        phrase: stored.approval.phrase,
      }),
    ).rejects.toThrow("approval_action_digest_mismatch");
  });

  it("uses rechecked policy rather than a stale stored allow decision", async () => {
    const execute = vi.fn(async () => ({ success: true, stored: true }));
    const { controller, store } = await setup({ execute });
    const planned = controller.plan(
      TaskRequestSchema.parse({
        goal: "Store a governed memory",
        operation: {
          kind: "memory",
          action: "put",
          key: "project",
          value: "MELRA",
        },
        requiredEvidence: [
          { type: "result_equals", path: "stored", value: true },
        ],
      }),
    );
    const stored = store.getTask(planned.id)!;
    stored.policyDecision = {
      ...stored.policyDecision,
      outcome: "allow",
      reason: "stale projection",
    };
    store.saveTask(stored);

    await expect(controller.execute(planned.id)).rejects.toThrow(
      "approval_required",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("recovers interrupted reads for retry and quarantines mutations", async () => {
    const execute = vi.fn(async () => ({ success: true }));
    const { controller, store } = await setup({ execute });
    const read = controller.plan(
      TaskRequestSchema.parse({
        goal: "Recover an interrupted read",
        operation: { kind: "system", action: "info" },
      }),
    );
    const mutation = controller.plan(
      TaskRequestSchema.parse({
        goal: "Recover an interrupted mutation",
        operation: {
          kind: "memory",
          action: "put",
          key: "project",
          value: "MELRA",
        },
        requiredEvidence: [
          { type: "result_equals", path: "stored", value: true },
        ],
      }),
    );
    for (const item of [read, mutation]) {
      const stored = store.getTask(item.id)!;
      stored.status = "running";
      store.saveTask(stored);
    }

    const recovered = await controller.recoverInterrupted();

    expect(recovered).toHaveLength(2);
    expect(store.getTask(read.id)).toMatchObject({
      status: "planned",
      error: "interrupted_read_ready_for_retry",
    });
    expect(store.getTask(mutation.id)).toMatchObject({
      status: "recovery_required",
      error: "interrupted_mutation_requires_reconciliation",
    });
    expect(execute).not.toHaveBeenCalled();
  });

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
          value: "MELRA",
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
