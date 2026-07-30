// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkflowDefinitionSchema,
  WorkflowEventSchema,
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

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "melra-workflow-controller-"));
  roots.push(root);
  const store = new SqliteStore(":memory:");
  stores.push(store);
  const cipher = new PayloadCipher(Buffer.alloc(32, 17));
  const tasks = new TaskController(
    store,
    createDefaultPolicy(root),
    {
      async execute() {
        return { success: true };
      },
    },
    await Verifier.create(root),
    cipher,
  );
  return {
    store,
    cipher,
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
