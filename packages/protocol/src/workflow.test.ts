// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  BoundedLoopNodeSchema,
  ConditionNodeSchema,
  EncryptedPayloadSchema,
  ParallelNodeSchema,
  WorkflowAdvanceInputSchema,
  WorkflowDefinitionSchema,
  WorkflowEventSchema,
  WorkflowRunSchema,
  WorkflowSnapshotSchema,
} from "./index.js";

const workflowId = "11111111-1111-4111-8111-111111111111";
const traceId = "22222222-2222-4222-8222-222222222222";
const occurredAt = "2026-07-30T12:00:00.000Z";

describe("durable workflow protocol", () => {
  it("parses a bounded two-node workflow and rejects schema smuggling", () => {
    const definition = WorkflowDefinitionSchema.parse({
      schemaVersion: "1.0.0",
      id: workflowId,
      version: 1,
      name: "restart-safe",
      nodes: [
        {
          id: "inspect",
          type: "operation",
          dependsOn: [],
          request: {
            goal: "Inspect the runtime",
            operation: { kind: "system", action: "info" },
          },
        },
        { id: "checkpoint", type: "checkpoint", dependsOn: ["inspect"] },
      ],
    });

    expect(definition.nodes).toHaveLength(2);
    expect(() =>
      WorkflowDefinitionSchema.parse({ ...definition, executeAnyway: true }),
    ).toThrow();
  });

  it.each([
    [
      BoundedLoopNodeSchema,
      {
        id: "loop",
        type: "bounded_loop",
        dependsOn: [],
        body: [
          {
            goal: "Inspect the runtime",
            operation: { kind: "system", action: "info" },
          },
        ],
        maxIterations: 0,
      },
    ],
    [
      ParallelNodeSchema,
      {
        id: "parallel",
        type: "parallel",
        dependsOn: [],
        branches: [],
      },
    ],
    [
      ConditionNodeSchema,
      {
        id: "condition",
        type: "condition",
        dependsOn: [],
        sourceNodeId: "",
        predicate: { type: "result_equals", path: "ready", value: true },
      },
    ],
  ])("rejects an invalid bounded control-flow node", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("validates events, snapshots, encrypted payloads, and advance inputs", () => {
    const run = WorkflowRunSchema.parse({
      schemaVersion: "1.0.0",
      id: workflowId,
      definitionId: "33333333-3333-4333-8333-333333333333",
      definitionVersion: 1,
      status: "running",
      stateVersion: 2,
      nodes: {
        inspect: {
          status: "verified_complete",
          taskIds: ["44444444-4444-4444-8444-444444444444"],
        },
        checkpoint: { status: "ready" },
      },
      traceId,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    expect(
      WorkflowEventSchema.parse({
        schemaVersion: "1.0.0",
        id: "55555555-5555-4555-8555-555555555555",
        aggregateId: workflowId,
        sequence: 2,
        traceId,
        type: "workflow.node_completed",
        data: { nodeId: "inspect" },
        occurredAt,
      }).type,
    ).toBe("workflow.node_completed");
    expect(
      EncryptedPayloadSchema.parse({
        version: 1,
        algorithm: "aes-256-gcm",
        iv: "AQIDBA",
        ciphertext: "BQYHCA",
        tag: "CQoLDA",
      }).algorithm,
    ).toBe("aes-256-gcm");
    expect(
      WorkflowAdvanceInputSchema.parse({
        workflowId,
        approvals: [],
      }).approvals,
    ).toEqual([]);
    expect(
      WorkflowSnapshotSchema.parse({
        schemaVersion: "1.0.0",
        workflowId,
        sequence: 2,
        run,
        createdAt: occurredAt,
      }).sequence,
    ).toBe(2);
    expect(() =>
      WorkflowSnapshotSchema.parse({
        schemaVersion: "1.0.0",
        workflowId,
        sequence: 1,
        run,
        createdAt: occurredAt,
      }),
    ).toThrow();
  });
});
