// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type {
  ApprovalResponse,
  Operation,
  TaskRecord,
  TaskRequest,
} from "@atlas-mcp/protocol";
import {
  classifyOperation,
  evaluatePolicy,
  type LocalPolicy,
  validateApproval,
} from "@atlas-mcp/policy-core";
import {
  createCertificate,
  createReceiptId,
  redactStructuredValue,
  sha256,
  type ActionReceipt,
  type CertificateResult,
  type EvidenceItem,
  type ExecutionCertificate,
} from "@atlas-mcp/receipt-schema";
import { SqliteStore } from "@atlas-mcp/storage-sqlite";
import { Verifier } from "@atlas-mcp/verifier-core";

export interface OperationExecutor {
  execute(
    operation: Operation,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
}

export interface ExecutionResult {
  task: TaskRecord;
  output?: Record<string, unknown>;
  receipt?: ActionReceipt;
  certificate?: ExecutionCertificate;
}

function now(): string {
  return new Date().toISOString();
}

function certificateResult(task: TaskRecord): CertificateResult {
  switch (task.status) {
    case "verified_success":
      return "VERIFIED_SUCCESS";
    case "partial":
      return "PARTIAL";
    case "cancelled":
      return "CANCELLED";
    case "awaiting_approval":
      return "WAITING_APPROVAL";
    case "waiting_user":
      return "WAITING_USER";
    case "policy_blocked":
      return "POLICY_BLOCKED";
    case "budget_exhausted":
      return "BUDGET_EXHAUSTED";
    default:
      return "FAILED";
  }
}

export class TaskController {
  private readonly active = new Map<string, AbortController>();
  private readonly pendingRequests = new Map<string, TaskRequest>();

  constructor(
    private readonly store: SqliteStore,
    private readonly policy: LocalPolicy,
    private readonly executor: OperationExecutor,
    private readonly verifier: Verifier,
  ) {}

  plan(request: TaskRequest): TaskRecord {
    const id = randomUUID();
    const policy = evaluatePolicy(id, request, this.policy);
    const timestamp = now();
    const sanitizedRequest = redactStructuredValue(request).value as TaskRequest;
    const task: TaskRecord = {
      id,
      request: sanitizedRequest,
      status:
        policy.decision.outcome === "deny"
          ? "policy_blocked"
          : policy.decision.outcome === "confirm"
            ? "awaiting_approval"
            : "planned",
      policyDecision: policy.decision,
      ...(policy.challenge === undefined ? {} : { approval: policy.challenge }),
      receiptIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.saveTask(task);
    if (task.status !== "policy_blocked") {
      this.pendingRequests.set(id, request);
    }
    return { ...task, request };
  }

  status(taskId: string): TaskRecord {
    const task = this.store.getTask(taskId);
    if (task === undefined) throw new Error("task_not_found");
    return task;
  }

  async execute(
    taskId: string,
    approval?: ApprovalResponse,
  ): Promise<ExecutionResult> {
    const task = this.status(taskId);
    const request = this.pendingRequests.get(taskId);
    if (task.status === "policy_blocked") {
      return { task };
    }
    if (!["planned", "awaiting_approval"].includes(task.status)) {
      throw new Error(`task_not_executable:${task.status}`);
    }
    if (request === undefined) {
      throw new Error("task_payload_unavailable_after_restart");
    }

    const rechecked = evaluatePolicy(task.id, request, this.policy);
    if (rechecked.decision.outcome === "deny") {
      task.status = "policy_blocked";
      task.policyDecision = rechecked.decision;
      task.updatedAt = now();
      this.store.saveTask(task);
      this.pendingRequests.delete(task.id);
      return this.finishWithoutReceipt(task, []);
    }

    if (task.policyDecision.outcome === "confirm") {
      const approvalResult = validateApproval(task.approval, approval);
      if (!approvalResult.ok) {
        throw new Error(approvalResult.reason);
      }
    }

    const controller = new AbortController();
    this.active.set(task.id, controller);
    task.status = "running";
    task.updatedAt = now();
    this.store.saveTask(task);
    const startedAt = now();
    const classified = classifyOperation(request.operation);
    let timeout: NodeJS.Timeout | undefined;
    let budgetExhausted = false;
    try {
      timeout = setTimeout(
        () => {
          budgetExhausted = true;
          controller.abort(new Error("task_budget_exhausted"));
        },
        request.budget.maxDurationMs,
      );
      timeout.unref();
      const result = await this.executeWithRetries(
        task,
        request,
        classified.effect,
        controller.signal,
      );
      const sanitizedResult = redactStructuredValue(result);
      task.status = "verifying";
      task.result = sanitizedResult.value as Record<string, unknown>;
      task.updatedAt = now();
      this.store.saveTask(task);

      const verification = await this.verifier.verify(
        request.requiredEvidence,
        result,
      );
      const actionSucceeded =
        result.success === undefined || result.success === true;
      const evidence: EvidenceItem[] =
        request.requiredEvidence.length === 0
          ? [
              {
                type: "operation_completed",
                passed: actionSucceeded,
                summary: actionSucceeded
                  ? "read-only operation completed"
                  : "operation reported failure",
              },
            ]
          : verification.evidence;
      const verified =
        actionSucceeded &&
        (request.requiredEvidence.length === 0 || verification.verified);
      const receipt = this.createReceipt(
        task,
        request,
        classified.capability,
        classified.target,
        classified.effect,
        startedAt,
        actionSucceeded,
        result,
        evidence,
        approval,
      );
      this.store.saveReceipt(receipt);
      task.receiptIds.push(receipt.receiptId);
      task.status = verified ? "verified_success" : actionSucceeded ? "partial" : "failed";
      task.updatedAt = now();
      this.store.saveTask(task);
      const certificate = this.createAndSaveCertificate(task, evidence);
      return { task, output: result, receipt, certificate };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = redactStructuredValue(rawMessage).value as string;
      const aborted = controller.signal.aborted;
      task.status = aborted
        ? budgetExhausted
          ? "budget_exhausted"
          : "cancelled"
        : "failed";
      task.error = budgetExhausted ? "task_budget_exhausted" : message;
      task.updatedAt = now();
      const evidence: EvidenceItem[] = [
        {
          type: "execution_error",
          passed: false,
          summary: budgetExhausted ? "task_budget_exhausted" : message,
        },
      ];
      const receipt = this.createReceipt(
        task,
        request,
        classified.capability,
        classified.target,
        classified.effect,
        startedAt,
        false,
        {},
        evidence,
        approval,
        budgetExhausted ? "task_budget_exhausted" : message,
      );
      this.store.saveReceipt(receipt);
      task.receiptIds.push(receipt.receiptId);
      this.store.saveTask(task);
      const certificate = this.createAndSaveCertificate(task, evidence);
      return { task, receipt, certificate };
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      this.active.delete(task.id);
      this.pendingRequests.delete(task.id);
    }
  }

  cancel(taskId: string): TaskRecord {
    const task = this.status(taskId);
    const controller = this.active.get(taskId);
    if (controller !== undefined) {
      controller.abort(new Error("task_cancelled"));
      return task;
    }
    if (["planned", "awaiting_approval"].includes(task.status)) {
      task.status = "cancelled";
      task.updatedAt = now();
      this.store.saveTask(task);
      this.pendingRequests.delete(task.id);
    }
    return task;
  }

  receipts(input: {
    taskId?: string;
    receiptId?: string;
  }): {
    receipts: ActionReceipt[];
    certificate?: ExecutionCertificate;
  } {
    if (input.receiptId !== undefined) {
      const receipt = this.store.getReceipt(input.receiptId);
      if (receipt === undefined) throw new Error("receipt_not_found");
      const certificate = this.store.getCertificateForTask(receipt.taskId);
      return {
        receipts: [receipt],
        ...(certificate === undefined ? {} : { certificate }),
      };
    }
    if (input.taskId === undefined) throw new Error("task_or_receipt_required");
    const receipts = this.store.getReceiptsForTask(input.taskId);
    const certificate = this.store.getCertificateForTask(input.taskId);
    return {
      receipts,
      ...(certificate === undefined ? {} : { certificate }),
    };
  }

  private createReceipt(
    task: TaskRecord,
    request: TaskRequest,
    capability: string,
    target: string,
    effect: "read" | "mutate" | "destructive",
    startedAt: string,
    success: boolean,
    result: Record<string, unknown>,
    evidence: EvidenceItem[],
    approval?: ApprovalResponse,
    error?: string,
  ): ActionReceipt {
    const sanitized = redactStructuredValue(result);
    const adapterRedactions = Array.isArray(result.redactions)
      ? result.redactions.filter((item): item is string => typeof item === "string")
      : [];
    const redactions = [
      ...new Set([...adapterRedactions, ...sanitized.redactions]),
    ];
    return {
      schemaVersion: "1.0.0",
      receiptId: createReceiptId(),
      taskId: task.id,
      capability,
      effect,
      policyDecision: {
        outcome: task.policyDecision.outcome,
        policyVersion: task.policyDecision.policyVersion,
        ...(approval === undefined ? {} : { approvalId: approval.approvalId }),
      },
      target,
      inputDigest: sha256(request.operation),
      startedAt,
      endedAt: now(),
      success,
      observedEffect: sanitized.value as Record<string, unknown>,
      evidence,
      redactions,
      ...(error === undefined ? {} : { error }),
    };
  }

  private async executeWithRetries(
    task: TaskRecord,
    request: TaskRequest,
    effect: "read" | "mutate" | "destructive",
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const maximumAttempts =
      effect === "read" ? request.budget.maxRetries + 1 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      if (signal.aborted) throw signal.reason ?? new Error("task_cancelled");
      task.attempts = attempt;
      task.updatedAt = now();
      this.store.saveTask(task);
      try {
        const result = await this.executor.execute(request.operation, signal);
        return {
          ...result,
          execution: {
            attempts: attempt,
            retried: attempt > 1,
          },
        };
      } catch (error) {
        lastError = error;
        if (attempt >= maximumAttempts || signal.aborted) throw error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("execution_failed_without_error");
  }

  private createAndSaveCertificate(
    task: TaskRecord,
    evidence: EvidenceItem[],
  ): ExecutionCertificate {
    const certificate = createCertificate({
      taskId: task.id,
      goal: task.request.goal,
      result: certificateResult(task),
      policyVersion: task.policyDecision.policyVersion,
      receiptIds: task.receiptIds,
      evidence,
      createdAt: now(),
    });
    task.certificateId = certificate.certificateId;
    task.updatedAt = now();
    this.store.saveCertificate(certificate);
    this.store.saveTask(task);
    return certificate;
  }

  private finishWithoutReceipt(
    task: TaskRecord,
    evidence: EvidenceItem[],
  ): ExecutionResult {
    const certificate = this.createAndSaveCertificate(task, evidence);
    return { task, certificate };
  }
}
