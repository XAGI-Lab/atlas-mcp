// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import {
  WorkflowDefinitionSchema,
  WorkflowEventSchema,
  WorkflowRunSchema,
  type TaskRequest,
  type WorkflowDefinition,
  type WorkflowEvent,
  type WorkflowNode,
  type WorkflowRun,
} from "@melra/protocol";
import {
  canonicalJson,
  redactStructuredValue,
} from "@melra/receipt-schema";
import { SqliteStore } from "@melra/storage-sqlite";
import { PayloadCipher } from "./payload-cipher.js";
import { TaskController } from "./task-controller.js";
import { applyWorkflowEvent } from "./workflow-events.js";
import { validateWorkflow } from "./workflow-graph.js";

type EmitEvent = (
  type: string,
  data: Record<string, unknown>,
) => void;

export class WorkflowController {
  constructor(
    private readonly store: SqliteStore,
    private readonly tasks: TaskController,
    private readonly payloadCipher: PayloadCipher,
  ) {}

  plan(definition: WorkflowDefinition): WorkflowRun {
    const parsed = WorkflowDefinitionSchema.parse(definition);
    const graph = validateWorkflow(parsed);
    for (const node of graph.nodes.values()) {
      for (const request of requestsFor(node)) {
        if (this.tasks.preflight(request).outcome === "deny") {
          throw new Error(`workflow_policy_blocked:${node.id}`);
        }
      }
    }

    const createdAt = new Date().toISOString();
    const id = randomUUID();
    const traceId = randomUUID();
    const draft = WorkflowRunSchema.parse({
      schemaVersion: "1.0.0",
      id,
      definitionId: parsed.id,
      definitionVersion: parsed.version,
      status: "draft",
      stateVersion: 1,
      nodes: Object.fromEntries(
        parsed.nodes.map((node) => [node.id, { status: "pending" }]),
      ),
      traceId,
      createdAt,
      updatedAt: createdAt,
    });
    const created = makeEvent(draft, 1, "workflow.created", { run: draft });
    const plannedEvent = makeEvent(draft, 2, "workflow.status_changed", {
      from: "draft",
      to: "planned",
    });
    const planned = applyWorkflowEvent(draft, plannedEvent);
    const redacted = WorkflowDefinitionSchema.parse(
      redactStructuredValue(parsed).value,
    );
    this.store.createWorkflow(
      redacted,
      this.payloadCipher.seal(
        parsed,
        `workflow:${parsed.id}:${parsed.version}:definition`,
      ),
      planned,
      [created, plannedEvent],
    );
    return planned;
  }

  status(workflowId: string): WorkflowRun {
    const run = this.store.getWorkflowRun(workflowId);
    if (run === undefined) throw new Error("workflow_not_found");
    return run;
  }

  events(workflowId: string, afterSequence = 0): WorkflowEvent[] {
    this.status(workflowId);
    return this.store.listWorkflowEvents(workflowId, afterSequence);
  }

  cancel(workflowId: string): WorkflowRun {
    const current = this.status(workflowId);
    if (
      current.status === "verified_complete" ||
      current.status === "cancelled"
    ) {
      return current;
    }
    return this.transition(current, (draft, emit) => {
      for (const [nodeId, node] of Object.entries(draft.nodes)) {
        if (
          !["pending", "ready", "awaiting_approval"].includes(node.status)
        ) {
          continue;
        }
        for (const taskId of node.taskIds) this.tasks.cancel(taskId);
        const from = node.status;
        node.status = "cancelled";
        emit("workflow.node_changed", {
          nodeId,
          from,
          state: node,
        });
      }
      const from = draft.status;
      draft.status = "cancelled";
      delete draft.error;
      emit("workflow.cancelled", { from, to: "cancelled" });
    });
  }

  private transition(
    current: WorkflowRun,
    mutate: (draft: WorkflowRun, emit: EmitEvent) => void,
  ): WorkflowRun {
    const draft = structuredClone(current);
    const events: WorkflowEvent[] = [];
    const emit: EmitEvent = (type, data) => {
      events.push(
        makeEvent(
          current,
          current.stateVersion + events.length + 1,
          type,
          data,
        ),
      );
    };
    mutate(draft, emit);
    if (events.length === 0) return current;
    draft.stateVersion = current.stateVersion + events.length;
    draft.updatedAt = events.at(-1)!.occurredAt;
    const expected = WorkflowRunSchema.parse(draft);
    let rebuilt = current;
    for (const event of events) rebuilt = applyWorkflowEvent(rebuilt, event);
    if (canonicalJson(rebuilt) !== canonicalJson(expected)) {
      throw new Error("workflow_projection_event_mismatch");
    }
    this.store.transitionWorkflow(
      current.id,
      current.stateVersion,
      rebuilt,
      events,
    );
    return rebuilt;
  }
}

function makeEvent(
  run: WorkflowRun,
  sequence: number,
  type: string,
  data: Record<string, unknown>,
): WorkflowEvent {
  return WorkflowEventSchema.parse({
    schemaVersion: "1.0.0",
    id: randomUUID(),
    aggregateId: run.id,
    sequence,
    traceId: run.traceId,
    type,
    data,
    occurredAt: new Date().toISOString(),
  });
}

function requestsFor(node: WorkflowNode): TaskRequest[] {
  switch (node.type) {
    case "operation":
    case "compensation":
      return [node.request];
    case "condition":
      return [...node.whenTrue, ...node.whenFalse];
    case "parallel":
      return node.branches.flat();
    case "bounded_loop":
      return node.body;
    case "approval":
    case "checkpoint":
      return [];
  }
}
