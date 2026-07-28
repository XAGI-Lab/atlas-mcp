// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const PROTOCOL_VERSION = "2025-11-25";
export const PRODUCT_VERSION = "0.1.0-alpha.0";

const boundedPath = z.string().min(1).max(4096);
const boundedText = z.string().max(200_000);

export const FileOperationSchema = z
  .object({
    kind: z.literal("file"),
    action: z.enum([
      "list",
      "read",
      "stat",
      "hash",
      "write",
      "move",
      "delete",
      "mkdir",
    ]),
    path: boundedPath,
    destination: boundedPath.optional(),
    content: boundedText.optional(),
    encoding: z.enum(["utf8", "base64"]).default("utf8"),
    recursive: z.boolean().default(false),
  })
  .strict();

export const TerminalOperationSchema = z
  .object({
    kind: z.literal("terminal"),
    action: z.enum(["run", "start", "status", "output", "stop"]),
    command: z.string().min(1).max(512).optional(),
    args: z.array(z.string().max(4096)).max(100).default([]),
    jobId: z.string().uuid().optional(),
    cwd: boundedPath.optional(),
    env: z.record(z.string().max(8192)).optional(),
    timeoutMs: z.number().int().min(100).max(120_000).default(30_000),
    maxOutputChars: z.number().int().min(1_000).max(1_000_000).default(100_000),
  })
  .strict();

export const BrowserTargetSchema = z
  .object({
    selector: z.string().min(1).max(2_000).optional(),
    role: z.string().min(1).max(100).optional(),
    name: z.string().max(500).optional(),
    text: z.string().max(2_000).optional(),
  })
  .strict();

export const BrowserOperationSchema = z
  .object({
    kind: z.literal("browser"),
    action: z.enum([
      "navigate",
      "inspect",
      "click",
      "type",
      "select",
      "press",
      "scroll",
      "screenshot",
      "upload",
      "download",
      "tabs",
      "close",
    ]),
    url: z.string().url().max(8_192).optional(),
    target: BrowserTargetSchema.optional(),
    value: z.string().max(100_000).optional(),
    values: z.array(z.string().max(2_000)).max(50).optional(),
    filePaths: z.array(boundedPath).min(1).max(20).optional(),
    key: z.string().max(100).optional(),
    direction: z.enum(["up", "down", "top", "bottom", "into_view"]).optional(),
    tabIndex: z.number().int().min(0).max(100).optional(),
    fullPage: z.boolean().default(false),
    timeoutMs: z.number().int().min(100).max(120_000).default(30_000),
    maxChars: z.number().int().min(100).max(200_000).default(20_000),
  })
  .strict();

export const MemoryScopeSchema = z.enum([
  "session",
  "task",
  "project",
  "workspace",
  "user",
  "procedural",
]);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const MemoryOperationSchema = z
  .object({
    kind: z.literal("memory"),
    action: z.enum(["put", "search", "list", "delete", "clear"]),
    id: z.string().uuid().optional(),
    scope: MemoryScopeSchema.default("workspace"),
    key: z.string().min(1).max(512).optional(),
    value: boundedText.optional(),
    query: z.string().max(10_000).optional(),
    source: z.string().max(4_096).optional(),
    confidence: z.number().min(0).max(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();

export const SystemOperationSchema = z
  .object({
    kind: z.literal("system"),
    action: z.literal("info"),
  })
  .strict();

export const OperationSchema = z.discriminatedUnion("kind", [
  FileOperationSchema,
  TerminalOperationSchema,
  BrowserOperationSchema,
  MemoryOperationSchema,
  SystemOperationSchema,
]);

export type FileOperation = z.infer<typeof FileOperationSchema>;
export type TerminalOperation = z.infer<typeof TerminalOperationSchema>;
export type BrowserOperation = z.infer<typeof BrowserOperationSchema>;
export type MemoryOperation = z.infer<typeof MemoryOperationSchema>;
export type SystemOperation = z.infer<typeof SystemOperationSchema>;
export type Operation = z.infer<typeof OperationSchema>;

export const EvidencePredicateSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("result_equals"),
      path: z.string().min(1).max(512),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    })
    .strict(),
  z
    .object({
      type: z.literal("result_contains"),
      path: z.string().min(1).max(512),
      value: z.string().max(10_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("file_exists"),
      path: boundedPath,
    })
    .strict(),
  z
    .object({
      type: z.literal("file_absent"),
      path: boundedPath,
    })
    .strict(),
  z
    .object({
      type: z.literal("file_hash"),
      path: boundedPath,
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("exit_code"),
      value: z.number().int(),
    })
    .strict(),
  z
    .object({
      type: z.literal("url_matches"),
      pattern: z.string().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("page_contains"),
      text: z.string().min(1).max(10_000),
    })
    .strict(),
]);

export type EvidencePredicate = z.infer<typeof EvidencePredicateSchema>;

export const TaskBudgetSchema = z
  .object({
    maxSteps: z.number().int().min(1).max(100).default(10),
    maxDurationMs: z.number().int().min(100).max(900_000).default(120_000),
    maxRetries: z.number().int().min(0).max(10).default(2),
  })
  .strict();

export const TaskRequestSchema = z
  .object({
    goal: z.string().min(1).max(10_000),
    operation: OperationSchema,
    constraints: z.array(z.string().max(2_000)).max(50).default([]),
    forbiddenEffects: z
      .array(z.enum(["read", "mutate", "destructive"]))
      .max(3)
      .default([]),
    budget: TaskBudgetSchema.default({
      maxSteps: 10,
      maxDurationMs: 120_000,
      maxRetries: 2,
    }),
    requiredEvidence: z.array(EvidencePredicateSchema).max(20).default([]),
  })
  .strict();

export type TaskRequest = z.infer<typeof TaskRequestSchema>;
export type TaskBudget = z.infer<typeof TaskBudgetSchema>;

export const EffectSchema = z.enum(["read", "mutate", "destructive"]);
export const RiskSchema = z.enum(["low", "medium", "high", "critical"]);
export const PolicyOutcomeSchema = z.enum(["allow", "deny", "confirm"]);

export const PolicyDecisionSchema = z
  .object({
    outcome: PolicyOutcomeSchema,
    effect: EffectSchema,
    risk: RiskSchema,
    reason: z.string(),
    policyVersion: z.string(),
  })
  .strict();

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type Risk = z.infer<typeof RiskSchema>;

export const ApprovalChallengeSchema = z
  .object({
    approvalId: z.string().uuid(),
    taskId: z.string().uuid(),
    actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    phrase: z.string(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type ApprovalChallenge = z.infer<typeof ApprovalChallengeSchema>;

export const ApprovalResponseSchema = z
  .object({
    approvalId: z.string().uuid(),
    phrase: z.string().min(1).max(256),
  })
  .strict();

export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

export const TaskStatusSchema = z.enum([
  "planned",
  "awaiting_approval",
  "running",
  "verifying",
  "verified_success",
  "partial",
  "failed",
  "cancelled",
  "waiting_user",
  "policy_blocked",
  "budget_exhausted",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export interface TaskRecord {
  id: string;
  request: TaskRequest;
  status: TaskStatus;
  policyDecision: PolicyDecision;
  approval?: ApprovalChallenge;
  result?: Record<string, unknown>;
  error?: string;
  attempts?: number;
  receiptIds: string[];
  certificateId?: string;
  createdAt: string;
  updatedAt: string;
}

export const AtlasCapabilitiesInputSchema = z.object({}).strict();
export const AtlasPlanInputSchema = TaskRequestSchema;
export const AtlasExecuteInputSchema = z
  .object({
    taskId: z.string().uuid(),
    approval: ApprovalResponseSchema.optional(),
  })
  .strict();
export const AtlasTaskStatusInputSchema = z
  .object({ taskId: z.string().uuid() })
  .strict();
export const AtlasTaskCancelInputSchema = z
  .object({ taskId: z.string().uuid() })
  .strict();
export const AtlasReceiptBaseSchema = z
  .object({
    taskId: z.string().uuid().optional(),
    receiptId: z.string().uuid().optional(),
  })
  .strict();
export const AtlasReceiptInputSchema = AtlasReceiptBaseSchema
  .refine((value) => value.taskId !== undefined || value.receiptId !== undefined, {
    message: "taskId or receiptId is required",
  });

export const TOOL_NAMES = [
  "atlas_capabilities",
  "atlas_plan",
  "atlas_execute",
  "atlas_task_status",
  "atlas_task_cancel",
  "atlas_receipt",
] as const;
