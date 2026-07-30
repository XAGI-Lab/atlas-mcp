// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import {
  WorkflowDefinitionSchema,
  WorkflowEventSchema,
  WorkflowRunSchema,
  WorkflowSnapshotSchema,
  type ApprovalResponse,
  type TaskRecord,
  type TaskRequest,
  type WorkflowDefinition,
  type WorkflowEvent,
  type WorkflowNode,
  type WorkflowNodeState,
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
import { readyNodeIds, validateWorkflow } from "./workflow-graph.js";

type EmitEvent = (
  type: string,
  data: Record<string, unknown>,
) => void;

export interface WorkflowAdvanceResult {
  run: WorkflowRun;
  tasks: TaskRecord[];
  events: WorkflowEvent[];
}

interface NodeAdvance {
  state: WorkflowNodeState;
  tasks: TaskRecord[];
  checkpoint?: boolean;
}

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

  async advance(
    workflowId: string,
    approvals: ApprovalResponse[] = [],
  ): Promise<WorkflowAdvanceResult> {
    const current = this.status(workflowId);
    if (["verified_complete", "cancelled"].includes(current.status)) {
      return { run: current, tasks: [], events: [] };
    }
    const definition = this.loadDefinition(current);
    const graph = validateWorkflow(definition);
    const rollback =
      current.status === "failed"
        ? definition.nodes
            .filter(
              (node) =>
                node.type === "compensation" &&
                ["pending", "awaiting_approval"].includes(
                  current.nodes[node.id]?.status ?? "",
                ) &&
                current.nodes[node.forNodeId]?.status ===
                  "verified_complete",
            )
            .map((node) => node.id)
            .reverse()
        : [];
    if (current.status === "failed" && rollback.length === 0) {
      return { run: current, tasks: [], events: [] };
    }
    const awaiting = [...graph.nodes.values()]
      .filter(
        (node) =>
          node.type !== "compensation" &&
          current.nodes[node.id]?.status === "awaiting_approval",
      )
      .map((node) => node.id)
      .sort();
    const nodeIds =
      rollback.length > 0
        ? rollback
        : awaiting.length > 0
        ? awaiting
        : readyNodeIds(graph, current.nodes);
    if (nodeIds.length === 0) {
      return { run: current, tasks: [], events: [] };
    }

    const results = await Promise.all(
      nodeIds.map(async (nodeId) => {
        const node = graph.nodes.get(nodeId)!;
        return {
          nodeId,
          result: await this.advanceNode(
            node,
            definition,
            current.nodes[nodeId]!,
            current,
            approvals,
          ),
        };
      }),
    );
    if (results.some(({ result }) => result.state.status === "failed")) {
      for (const node of [...definition.nodes].reverse()) {
        if (
          node.type !== "compensation" ||
          current.nodes[node.id]?.status !== "pending"
        ) {
          continue;
        }
        const targetState =
          results.find(({ nodeId }) => nodeId === node.forNodeId)?.result
            .state ?? current.nodes[node.forNodeId];
        if (targetState?.status !== "verified_complete") {
          results.push({
            nodeId: node.id,
            result: {
              state: { status: "skipped", taskIds: [] },
              tasks: [],
            },
          });
          continue;
        }
        const compensation = await this.runTask(
          node.request,
          current.nodes[node.id]?.taskIds[0],
          approvals,
        );
        results.push({
          nodeId: node.id,
          result: {
            ...compensation,
            state:
              compensation.state.status === "verified_complete"
                ? { ...compensation.state, status: "compensated" }
                : compensation.state,
          },
        });
      }
    }
    let run = this.transition(current, (draft, emit) => {
      for (const { nodeId, result } of results) {
        const from = draft.nodes[nodeId]!.status;
        draft.nodes[nodeId] = result.state;
        emit("workflow.node_changed", {
          nodeId,
          from,
          state: result.state,
        });
      }
      let status = this.deriveStatus(draft, definition);
      if (status === "verified_complete") {
        for (const node of definition.nodes) {
          const state = draft.nodes[node.id]!;
          if (node.type !== "compensation" || state.status !== "pending") {
            continue;
          }
          state.status = "skipped";
          emit("workflow.node_changed", {
            nodeId: node.id,
            from: "pending",
            state,
          });
        }
        status = this.deriveStatus(draft, definition);
      }
      if (status !== draft.status) {
        const from = draft.status;
        draft.status = status;
        emit("workflow.status_changed", { from, to: status });
      }
    });
    if (results.some(({ result }) => result.checkpoint === true)) {
      run = this.transition(run, (draft, emit) => {
        emit("workflow.checkpoint_saved", {
          sequence: draft.stateVersion + 1,
        });
      });
      this.store.saveWorkflowSnapshot(
        WorkflowSnapshotSchema.parse({
          schemaVersion: "1.0.0",
          workflowId: run.id,
          sequence: run.stateVersion,
          run,
          createdAt: run.updatedAt,
        }),
      );
    }
    return {
      run,
      tasks: results.flatMap(({ result }) => result.tasks),
      events: this.events(workflowId, current.stateVersion),
    };
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

  private loadDefinition(run: WorkflowRun): WorkflowDefinition {
    const payload = this.store.getWorkflowPayload(
      run.definitionId,
      run.definitionVersion,
    );
    if (payload === undefined) throw new Error("workflow_payload_not_found");
    return WorkflowDefinitionSchema.parse(
      this.payloadCipher.open(
        payload,
        `workflow:${run.definitionId}:${run.definitionVersion}:definition`,
      ),
    );
  }

  private async advanceNode(
    node: WorkflowNode,
    definition: WorkflowDefinition,
    state: WorkflowNodeState,
    run: WorkflowRun,
    approvals: ApprovalResponse[],
  ): Promise<NodeAdvance> {
    switch (node.type) {
      case "operation": {
        const approvalNode = definition.nodes.find(
          (candidate) =>
            candidate.type === "approval" &&
            candidate.forNodeId === node.id,
        );
        const approvedTaskId =
          approvalNode === undefined
            ? undefined
            : run.nodes[approvalNode.id]?.taskIds[0];
        return await this.runTask(
          node.request,
          approvedTaskId ?? state.taskIds[0],
          approvals,
        );
      }
      case "approval": {
        const target = definition.nodes.find(
          (candidate) => candidate.id === node.forNodeId,
        );
        if (target === undefined || target.type !== "operation") {
          throw new Error(`workflow_approval_target_missing:${node.id}`);
        }
        return await this.runTask(
          target.request,
          state.taskIds[0],
          approvals,
          false,
        );
      }
      case "condition": {
        const sourceTaskId = run.nodes[node.sourceNodeId]?.taskIds[0];
        if (sourceTaskId === undefined) {
          throw new Error(`workflow_condition_source_unavailable:${node.id}`);
        }
        const condition = await this.tasks.verifyPersisted(sourceTaskId, [
          node.predicate,
        ]);
        return await this.runSequential(
          condition.verified ? node.whenTrue : node.whenFalse,
          state,
          approvals,
        );
      }
      case "parallel":
        return await this.runParallel(
          node.branches.flat(),
          state,
          approvals,
        );
      case "bounded_loop":
        return await this.runLoop(node, state, approvals);
      case "compensation": {
        const result = await this.runTask(
          node.request,
          state.taskIds[0],
          approvals,
        );
        return {
          ...result,
          state:
            result.state.status === "verified_complete"
              ? { ...result.state, status: "compensated" }
              : result.state,
        };
      }
      case "checkpoint":
        return {
          state: { status: "verified_complete", taskIds: [] },
          tasks: [],
          checkpoint: true,
        };
      default:
        throw new Error("workflow_node_not_executable");
    }
  }

  private async runTask(
    request: TaskRequest,
    existingTaskId: string | undefined,
    approvals: ApprovalResponse[],
    executePlanned = true,
  ): Promise<NodeAdvance> {
    let task =
      existingTaskId === undefined
        ? this.tasks.plan(request)
        : this.tasks.status(existingTaskId);
    if (task.status === "awaiting_approval") {
      const approval = approvals.find(
        (item) => item.approvalId === task.approval?.approvalId,
      );
      if (approval === undefined) {
        return {
          state: {
            status: "awaiting_approval",
            taskIds: [task.id],
            ...(task.approval === undefined
              ? {}
              : { approval: task.approval }),
          },
          tasks: [task],
        };
      }
      task = (await this.tasks.execute(task.id, approval)).task;
    } else if (task.status === "planned" && executePlanned) {
      task = (await this.tasks.execute(task.id)).task;
    }
    return {
      state: nodeStateForTask(task, !executePlanned),
      tasks: [task],
    };
  }

  private async runSequential(
    requests: TaskRequest[],
    state: WorkflowNodeState,
    approvals: ApprovalResponse[],
  ): Promise<NodeAdvance> {
    const taskIds = [...state.taskIds];
    const tasks: TaskRecord[] = [];
    for (const [index, request] of requests.entries()) {
      const result = await this.runTask(
        request,
        taskIds[index],
        approvals,
      );
      tasks.push(...result.tasks);
      taskIds[index] = result.state.taskIds[0]!;
      if (result.state.status !== "verified_complete") {
        return {
          state: { ...result.state, taskIds },
          tasks,
        };
      }
    }
    return {
      state: { status: "verified_complete", taskIds },
      tasks,
    };
  }

  private async runParallel(
    requests: TaskRequest[],
    state: WorkflowNodeState,
    approvals: ApprovalResponse[],
  ): Promise<NodeAdvance> {
    const results = await Promise.all(
      requests.map((request, index) =>
        this.runTask(request, state.taskIds[index], approvals),
      ),
    );
    return {
      state: aggregateNodeState(results.map((result) => result.state)),
      tasks: results.flatMap((result) => result.tasks),
    };
  }

  private async runLoop(
    node: Extract<WorkflowNode, { type: "bounded_loop" }>,
    state: WorkflowNodeState,
    approvals: ApprovalResponse[],
  ): Promise<NodeAdvance> {
    const taskIds = [...state.taskIds];
    const tasks: TaskRecord[] = [];
    let iterations = state.iterations ?? 0;
    while (iterations < node.maxIterations) {
      const offset = iterations * node.body.length;
      for (const [index, request] of node.body.entries()) {
        const result = await this.runTask(
          request,
          taskIds[offset + index],
          approvals,
        );
        tasks.push(...result.tasks);
        taskIds[offset + index] = result.state.taskIds[0]!;
        if (result.state.status !== "verified_complete") {
          return {
            state: {
              ...result.state,
              taskIds,
              iterations,
            },
            tasks,
          };
        }
      }
      iterations += 1;
      const lastTaskId = taskIds[offset + node.body.length - 1]!;
      if (
        node.until !== undefined &&
        (await this.tasks.verifyPersisted(lastTaskId, [node.until])).verified
      ) {
        break;
      }
    }
    return {
      state: {
        status: "verified_complete",
        taskIds,
        iterations,
      },
      tasks,
    };
  }

  private deriveStatus(
    run: WorkflowRun,
    definition: WorkflowDefinition,
  ): WorkflowRun["status"] {
    const required = definition.nodes.filter(
      (node) => node.type !== "compensation",
    );
    if (required.some((node) => run.nodes[node.id]?.status === "failed")) {
      return "failed";
    }
    if (
      required.some(
        (node) => run.nodes[node.id]?.status === "recovery_required",
      )
    ) {
      return "recovery_required";
    }
    if (
      required.some(
        (node) => run.nodes[node.id]?.status === "awaiting_approval",
      )
    ) {
      return "awaiting_approval";
    }
    if (
      required.every((node) => {
        const state = run.nodes[node.id];
        return (
          state !== undefined &&
          ["verified_complete", "skipped", "compensated"].includes(
            state.status,
          ) &&
          state.taskIds.every(
            (taskId) =>
              this.tasks.receipts({ taskId }).certificate?.result ===
              "VERIFIED_SUCCESS",
          )
        );
      })
    ) {
      return "verified_complete";
    }
    return "running";
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

function nodeStateForTask(
  task: TaskRecord,
  plannedIsComplete: boolean,
): WorkflowNodeState {
  switch (task.status) {
    case "verified_success":
      return { status: "verified_complete", taskIds: [task.id] };
    case "planned":
      return {
        status: plannedIsComplete ? "verified_complete" : "ready",
        taskIds: [task.id],
      };
    case "awaiting_approval":
      return {
        status: "awaiting_approval",
        taskIds: [task.id],
        ...(task.approval === undefined ? {} : { approval: task.approval }),
      };
    case "recovery_required":
      return {
        status: "recovery_required",
        taskIds: [task.id],
        ...(task.error === undefined ? {} : { error: task.error }),
      };
    case "cancelled":
      return { status: "cancelled", taskIds: [task.id] };
    default:
      return {
        status: "failed",
        taskIds: [task.id],
        ...(task.error === undefined ? {} : { error: task.error }),
      };
  }
}

function aggregateNodeState(
  states: WorkflowNodeState[],
): WorkflowNodeState {
  const taskIds = states.flatMap((state) => state.taskIds);
  for (const status of [
    "failed",
    "recovery_required",
    "awaiting_approval",
    "cancelled",
  ] as const) {
    const state = states.find((candidate) => candidate.status === status);
    if (state !== undefined) return { ...state, taskIds };
  }
  return { status: "verified_complete", taskIds };
}
