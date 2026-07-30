// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TaskRequestSchema,
  WorkflowDefinitionSchema,
  WorkflowEventSchema,
  type Operation,
  type TaskRequest,
  type WorkflowDefinition,
} from "@melra/protocol";
import { createDefaultPolicy } from "@melra/policy-core";
import { SqliteStore } from "@melra/storage-sqlite";
import { Verifier } from "@melra/verifier-core";
import { PayloadCipher } from "./payload-cipher.js";
import { TaskController } from "./task-controller.js";
import { applyWorkflowEvent } from "./workflow-events.js";
import { WorkflowController } from "./workflow-controller.js";

const roots: string[] = [];
const stores: SqliteStore[] = [];
const definitionId = "11111111-1111-4111-8111-111111111111";

afterEach(async () => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup(
  execute: (
    operation: Operation,
    signal?: AbortSignal,
  ) => Promise<Record<string, unknown>> = async () => ({ success: true }),
) {
  const root = await mkdtemp(join(tmpdir(), "melra-workflow-controller-"));
  roots.push(root);
  const store = new SqliteStore(":memory:");
  stores.push(store);
  const cipher = new PayloadCipher(Buffer.alloc(32, 17));
  const tasks = new TaskController(
    store,
    createDefaultPolicy(root),
    { execute },
    await Verifier.create(root),
    cipher,
  );
  return {
    store,
    cipher,
    tasks,
    controller: new WorkflowController(store, tasks, cipher),
  };
}

function request(goal: string): TaskRequest {
  return {
    goal,
    operation: { kind: "system", action: "info" },
    constraints: [],
    forbiddenEffects: [],
    requiredEvidence: [],
    budget: {
      maxDurationMs: 120_000,
      maxRetries: 2,
      maxSteps: 10,
    },
  };
}

function mutationRequest(goal: string): TaskRequest {
  return TaskRequestSchema.parse({
    goal,
    operation: {
      kind: "memory",
      action: "put",
      key: "project",
      value: "MELRA",
    },
    requiredEvidence: [
      { type: "result_equals", path: "stored", value: true },
    ],
  });
}

function fileRequest(goal: string, path: string): TaskRequest {
  return TaskRequestSchema.parse({
    goal,
    operation: { kind: "file", action: "read", path },
  });
}

function definition(goal = "one-time-workflow-secret"): WorkflowDefinition {
  return WorkflowDefinitionSchema.parse({
    schemaVersion: "1.0.0",
    id: definitionId,
    version: 1,
    name: "Durable workflow",
    nodes: [
      {
        id: "inspect",
        type: "operation",
        request: request(goal),
      },
    ],
  });
}

describe("WorkflowController planning", () => {
  it("persists a redacted projection and sealed exact definition", async () => {
    const { controller, store, cipher } = await setup();
    const exact = definition();

    const run = controller.plan(exact);

    expect(run.status).toBe("planned");
    expect(
      Object.values(run.nodes).every((node) => node.status === "pending"),
    ).toBe(true);
    expect(store.listWorkflowEvents(run.id).map((event) => event.type)).toEqual([
      "workflow.created",
      "workflow.status_changed",
    ]);
    expect(
      store.getWorkflowDefinition(definitionId, 1)?.nodes[0],
    ).not.toEqual(exact.nodes[0]);
    expect(
      cipher.open(
        store.getWorkflowPayload(definitionId, 1)!,
        `workflow:${definitionId}:1:definition`,
      ),
    ).toEqual(exact);
    expect(JSON.stringify(store.listWorkflowEvents(run.id))).not.toContain(
      "one-time-workflow-secret",
    );
  });

  it("rejects a denied nested request before writing anything", async () => {
    const { controller, store } = await setup();
    const denied = WorkflowDefinitionSchema.parse({
      schemaVersion: "1.0.0",
      id: definitionId,
      version: 1,
      name: "Denied branch",
      nodes: [
        {
          id: "branch",
          type: "condition",
          sourceNodeId: "inspect",
          dependsOn: ["inspect"],
          predicate: { type: "result_equals", path: "success", value: true },
          whenTrue: [
            {
              goal: "Run a forbidden shell",
              operation: {
                kind: "terminal",
                action: "run",
                command: "bash",
              },
            },
          ],
          whenFalse: [],
        },
        {
          id: "inspect",
          type: "operation",
          request: request("Inspect first"),
        },
      ],
    });

    expect(() => controller.plan(denied)).toThrow(
      "workflow_policy_blocked:branch",
    );
    expect(store.getWorkflowDefinition(definitionId, 1)).toBeUndefined();
    expect(store.getWorkflowPayload(definitionId, 1)).toBeUndefined();
    expect(store.listTasks()).toEqual([]);
    expect(
      store.database.prepare("SELECT count(*) AS count FROM workflow_runs").get(),
    ).toEqual({ count: 0 });
  });

  it("reads status and events and rejects unknown workflow IDs", async () => {
    const { controller } = await setup();
    const run = controller.plan(definition());

    expect(controller.status(run.id)).toEqual(run);
    expect(controller.events(run.id, 1)).toHaveLength(1);
    expect(() =>
      controller.status("99999999-9999-4999-8999-999999999999"),
    ).toThrow("workflow_not_found");
    expect(() =>
      controller.events("99999999-9999-4999-8999-999999999999"),
    ).toThrow("workflow_not_found");
  });

  it("cancels nonterminal nodes once and preserves completed workflows", async () => {
    const { controller, store } = await setup();
    const run = controller.plan(definition());

    const cancelled = controller.cancel(run.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.nodes.inspect?.status).toBe("cancelled");
    expect(store.listWorkflowEvents(run.id).map((event) => event.type)).toEqual([
      "workflow.created",
      "workflow.status_changed",
      "workflow.node_changed",
      "workflow.cancelled",
    ]);
    expect(controller.cancel(run.id)).toEqual(cancelled);

    const second = controller.plan(
      WorkflowDefinitionSchema.parse({
        ...definition("another secret"),
        id: "22222222-2222-4222-8222-222222222222",
      }),
    );
    const completedEvent = WorkflowEventSchema.parse({
      schemaVersion: "1.0.0",
      id: "33333333-3333-4333-8333-333333333333",
      aggregateId: second.id,
      sequence: 3,
      traceId: second.traceId,
      type: "workflow.status_changed",
      data: { from: "planned", to: "verified_complete" },
      occurredAt: "2026-07-30T12:00:03.000Z",
    });
    const completed = applyWorkflowEvent(second, completedEvent);
    store.transitionWorkflow(second.id, 2, completed, [completedEvent]);

    expect(controller.cancel(second.id)).toEqual(completed);
    expect(store.listWorkflowEvents(second.id)).toHaveLength(3);
  });

  it("surfaces a stale projection conflict without retrying", async () => {
    const { controller, store } = await setup();
    const run = controller.plan(definition());
    const transition = store.transitionWorkflow.bind(store);
    let injected = false;
    vi.spyOn(store, "transitionWorkflow").mockImplementation(
      (id, expectedVersion, next, events) => {
        if (!injected) {
          injected = true;
          const externalEvent = WorkflowEventSchema.parse({
            schemaVersion: "1.0.0",
            id: "44444444-4444-4444-8444-444444444444",
            aggregateId: run.id,
            sequence: 3,
            traceId: run.traceId,
            type: "workflow.status_changed",
            data: { from: "planned", to: "paused" },
            occurredAt: "2026-07-30T12:00:03.000Z",
          });
          transition(
            run.id,
            run.stateVersion,
            applyWorkflowEvent(run, externalEvent),
            [externalEvent],
          );
        }
        transition(id, expectedVersion, next, events);
      },
    );

    expect(() => controller.cancel(run.id)).toThrow(
      "workflow_state_conflict",
    );
    expect(store.getWorkflowRun(run.id)?.status).toBe("paused");
    expect(store.listWorkflowEvents(run.id)).toHaveLength(3);
  });
});

describe("WorkflowController execution", () => {
  it("advances one governed layer at a time through approval and checkpoint", async () => {
    const { controller, store } = await setup(async (operation) =>
      operation.kind === "memory"
        ? { success: true, stored: true }
        : { success: true },
    );
    const workflow = WorkflowDefinitionSchema.parse({
      schemaVersion: "1.0.0",
      id: definitionId,
      version: 1,
      name: "Governed checkpoint",
      nodes: [
        {
          id: "inspect",
          type: "operation",
          request: request("Inspect"),
        },
        {
          id: "approve-write",
          type: "approval",
          dependsOn: ["inspect"],
          forNodeId: "write",
        },
        {
          id: "write",
          type: "operation",
          dependsOn: ["approve-write"],
          request: mutationRequest("Write"),
        },
        {
          id: "checkpoint",
          type: "checkpoint",
          dependsOn: ["write"],
        },
      ],
    });
    const planned = controller.plan(workflow);

    const inspected = await controller.advance(planned.id);
    expect(inspected.run.nodes.inspect?.status).toBe("verified_complete");
    expect(inspected.run.nodes.write?.status).toBe("pending");

    const waiting = await controller.advance(planned.id);
    expect(waiting.run.nodes["approve-write"]?.status).toBe(
      "awaiting_approval",
    );
    expect(waiting.run.status).toBe("awaiting_approval");
    const challenge = waiting.run.nodes["approve-write"]!.approval!;

    const approved = await controller.advance(planned.id, [
      {
        approvalId: challenge.approvalId,
        phrase: challenge.phrase,
      },
    ]);
    expect(approved.run.nodes["approve-write"]?.status).toBe(
      "verified_complete",
    );

    const written = await controller.advance(planned.id);
    expect(written.run.nodes.write?.status).toBe("verified_complete");

    const completed = await controller.advance(planned.id);
    expect(completed.run.nodes.checkpoint?.status).toBe("verified_complete");
    expect(completed.run.status).toBe("verified_complete");
    expect(store.getLatestWorkflowSnapshot(planned.id)?.run).toEqual(
      completed.run,
    );
    expect(store.listTasks()).toHaveLength(2);
  });

  it("executes only the condition branch selected from persisted evidence", async () => {
    const executed: string[] = [];
    const { controller } = await setup(async (operation) => {
      if (operation.kind !== "file") throw new Error("unexpected_operation");
      executed.push(operation.path);
      return {
        success: true,
        ...(operation.path === "inspect" ? { route: "yes" } : {}),
      };
    });
    const planned = controller.plan(
      WorkflowDefinitionSchema.parse({
        schemaVersion: "1.0.0",
        id: definitionId,
        version: 1,
        name: "Conditional",
        nodes: [
          {
            id: "inspect",
            type: "operation",
            request: fileRequest("Inspect", "inspect"),
          },
          {
            id: "choose",
            type: "condition",
            dependsOn: ["inspect"],
            sourceNodeId: "inspect",
            predicate: {
              type: "result_equals",
              path: "route",
              value: "yes",
            },
            whenTrue: [fileRequest("True branch", "true-branch")],
            whenFalse: [fileRequest("False branch", "false-branch")],
          },
        ],
      }),
    );

    await controller.advance(planned.id);
    const result = await controller.advance(planned.id);

    expect(executed).toEqual(["inspect", "true-branch"]);
    expect(result.run.nodes.choose?.status).toBe("verified_complete");
    expect(result.run.status).toBe("verified_complete");
  });

  it("executes independent parallel branches concurrently", async () => {
    let active = 0;
    let maxConcurrent = 0;
    const { controller } = await setup(async () => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { success: true };
    });
    const planned = controller.plan(
      WorkflowDefinitionSchema.parse({
        schemaVersion: "1.0.0",
        id: definitionId,
        version: 1,
        name: "Parallel",
        nodes: [
          {
            id: "parallel",
            type: "parallel",
            branches: [
              [fileRequest("Branch A", "a")],
              [fileRequest("Branch B", "b")],
            ],
          },
        ],
      }),
    );

    const result = await controller.advance(planned.id);

    expect(maxConcurrent).toBe(2);
    expect(result.run.nodes.parallel?.taskIds).toHaveLength(2);
    expect(result.run.status).toBe("verified_complete");
  });

  it("runs a bounded loop sequentially to its hard limit", async () => {
    let calls = 0;
    const { controller } = await setup(async () => {
      calls += 1;
      return { success: true };
    });
    const planned = controller.plan(
      WorkflowDefinitionSchema.parse({
        schemaVersion: "1.0.0",
        id: definitionId,
        version: 1,
        name: "Bounded loop",
        nodes: [
          {
            id: "loop",
            type: "bounded_loop",
            body: [fileRequest("Loop body", "loop")],
            maxIterations: 3,
          },
        ],
      }),
    );

    const result = await controller.advance(planned.id);

    expect(calls).toBe(3);
    expect(result.run.nodes.loop?.iterations).toBe(3);
    expect(result.run.status).toBe("verified_complete");
  });

  it("stops a bounded loop when its persisted result satisfies until", async () => {
    let calls = 0;
    const { controller } = await setup(async () => {
      calls += 1;
      return { success: true, done: calls >= 2 };
    });
    const planned = controller.plan(
      WorkflowDefinitionSchema.parse({
        schemaVersion: "1.0.0",
        id: definitionId,
        version: 1,
        name: "Bounded loop with condition",
        nodes: [
          {
            id: "loop",
            type: "bounded_loop",
            body: [fileRequest("Loop body", "loop")],
            maxIterations: 5,
            until: { type: "result_equals", path: "done", value: true },
          },
        ],
      }),
    );

    const result = await controller.advance(planned.id);

    expect(calls).toBe(2);
    expect(result.run.nodes.loop?.iterations).toBe(2);
    expect(result.run.status).toBe("verified_complete");
  });

  it("compensates verified work once when a later operation fails", async () => {
    const executed: string[] = [];
    const { controller, tasks } = await setup(async (operation) => {
      if (operation.kind !== "file") throw new Error("unexpected_operation");
      executed.push(operation.path);
      return { success: operation.path !== "fail" };
    });
    const planned = controller.plan(
      WorkflowDefinitionSchema.parse({
        schemaVersion: "1.0.0",
        id: definitionId,
        version: 1,
        name: "Compensated failure",
        nodes: [
          {
            id: "first",
            type: "operation",
            request: fileRequest("First", "first"),
          },
          {
            id: "second",
            type: "operation",
            dependsOn: ["first"],
            request: fileRequest("Fail", "fail"),
          },
          {
            id: "undo-first",
            type: "compensation",
            forNodeId: "first",
            request: fileRequest("Undo", "undo"),
          },
        ],
      }),
    );

    await controller.advance(planned.id);
    const result = await controller.advance(planned.id);

    expect(executed).toEqual(["first", "fail", "undo"]);
    expect(result.run.nodes["undo-first"]?.status).toBe("compensated");
    expect(result.run.status).toBe("failed");
    const compensationTaskId =
      result.run.nodes["undo-first"]?.taskIds[0];
    expect(compensationTaskId).toBeDefined();
    expect(tasks.receipts({ taskId: compensationTaskId! }).receipts).toHaveLength(
      1,
    );
  });

  it("skips compensation without execution after verified success", async () => {
    const executed: string[] = [];
    const { controller } = await setup(async (operation) => {
      if (operation.kind !== "file") throw new Error("unexpected_operation");
      executed.push(operation.path);
      return { success: true };
    });
    const planned = controller.plan(
      WorkflowDefinitionSchema.parse({
        schemaVersion: "1.0.0",
        id: definitionId,
        version: 1,
        name: "Successful compensation skip",
        nodes: [
          {
            id: "first",
            type: "operation",
            request: fileRequest("First", "first"),
          },
          {
            id: "undo-first",
            type: "compensation",
            forNodeId: "first",
            request: fileRequest("Undo", "undo"),
          },
        ],
      }),
    );

    const result = await controller.advance(planned.id);

    expect(executed).toEqual(["first"]);
    expect(result.run.nodes["undo-first"]?.status).toBe("skipped");
    expect(result.run.status).toBe("verified_complete");
  });

  it("resumes approval-required compensation on a failed workflow", async () => {
    let memoryCalls = 0;
    const { controller } = await setup(async (operation) => {
      if (operation.kind === "memory") {
        memoryCalls += 1;
        return { success: true, stored: true };
      }
      if (operation.kind !== "file") throw new Error("unexpected_operation");
      return { success: operation.path !== "fail" };
    });
    const planned = controller.plan(
      WorkflowDefinitionSchema.parse({
        schemaVersion: "1.0.0",
        id: definitionId,
        version: 1,
        name: "Governed compensation",
        nodes: [
          {
            id: "first",
            type: "operation",
            request: fileRequest("First", "first"),
          },
          {
            id: "second",
            type: "operation",
            dependsOn: ["first"],
            request: fileRequest("Fail", "fail"),
          },
          {
            id: "undo-first",
            type: "compensation",
            forNodeId: "first",
            request: mutationRequest("Undo"),
          },
        ],
      }),
    );

    await controller.advance(planned.id);
    const failed = await controller.advance(planned.id);
    expect(failed.run.status).toBe("failed");
    expect(failed.run.nodes["undo-first"]?.status).toBe("awaiting_approval");
    expect(memoryCalls).toBe(0);
    const challenge = failed.run.nodes["undo-first"]!.approval!;

    const compensated = await controller.advance(planned.id, [
      {
        approvalId: challenge.approvalId,
        phrase: challenge.phrase,
      },
    ]);

    expect(compensated.run.status).toBe("failed");
    expect(compensated.run.nodes["undo-first"]?.status).toBe("compensated");
    expect(memoryCalls).toBe(1);
  });
});
