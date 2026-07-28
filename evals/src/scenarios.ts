// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { TaskRequestInput, TaskStatus } from "@atlas-mcp/protocol";

export interface EvaluationScenario {
  id: string;
  category:
    | "system"
    | "file"
    | "terminal"
    | "browser"
    | "computer"
    | "memory"
    | "policy"
    | "verification";
  request: TaskRequestInput;
  fixtures?: Array<{ path: string; content: string }>;
  expectedPlan: TaskStatus;
  expectedFinal?: TaskStatus;
  approve?: boolean;
  cancel?: boolean;
  wrongApproval?: boolean;
  expectedError?: string;
}

export const scenarios: EvaluationScenario[] = [
  {
    id: "system-info-read",
    category: "system",
    request: {
      goal: "Inspect local system information",
      operation: { kind: "system", action: "info" },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [],
    },
    expectedPlan: "planned",
    expectedFinal: "verified_success",
  },
  {
    id: "file-list-root",
    category: "file",
    request: {
      goal: "List the workspace",
      operation: {
        kind: "file",
        action: "list",
        path: ".",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [],
    },
    expectedPlan: "planned",
    expectedFinal: "verified_success",
  },
  {
    id: "file-read-fixture",
    category: "file",
    fixtures: [{ path: "fixture.txt", content: "deterministic fixture" }],
    request: {
      goal: "Read a deterministic fixture",
      operation: {
        kind: "file",
        action: "read",
        path: "fixture.txt",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [
        {
          type: "result_contains",
          path: "content",
          value: "deterministic fixture",
        },
      ],
    },
    expectedPlan: "planned",
    expectedFinal: "verified_success",
  },
  {
    id: "file-hash-fixture",
    category: "file",
    fixtures: [{ path: "fixture.txt", content: "hash me" }],
    request: {
      goal: "Hash a deterministic fixture",
      operation: {
        kind: "file",
        action: "hash",
        path: "fixture.txt",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [],
    },
    expectedPlan: "planned",
    expectedFinal: "verified_success",
  },
  {
    id: "file-write-approved",
    category: "file",
    request: {
      goal: "Create a verified file",
      operation: {
        kind: "file",
        action: "write",
        path: "result.txt",
        content: "verified",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [{ type: "file_exists", path: "result.txt" }],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "verified_success",
  },
  {
    id: "file-mkdir-approved",
    category: "file",
    request: {
      goal: "Create a verified directory",
      operation: {
        kind: "file",
        action: "mkdir",
        path: "created",
        encoding: "utf8",
        recursive: true,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [{ type: "file_exists", path: "created" }],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "verified_success",
  },
  {
    id: "file-move-approved",
    category: "file",
    fixtures: [{ path: "source.txt", content: "move me" }],
    request: {
      goal: "Move a file and prove the destination",
      operation: {
        kind: "file",
        action: "move",
        path: "source.txt",
        destination: "destination.txt",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [{ type: "file_exists", path: "destination.txt" }],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "verified_success",
  },
  {
    id: "file-delete-without-evidence",
    category: "policy",
    fixtures: [{ path: "delete.txt", content: "keep until approved" }],
    request: {
      goal: "Delete without evidence",
      operation: {
        kind: "file",
        action: "delete",
        path: "delete.txt",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [],
    },
    expectedPlan: "policy_blocked",
  },
  {
    id: "file-delete-approved-and-verified-absent",
    category: "file",
    fixtures: [{ path: "delete-verified.txt", content: "delete after approval" }],
    request: {
      goal: "Delete a file and prove that it is absent",
      operation: {
        kind: "file",
        action: "delete",
        path: "delete-verified.txt",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [
        { type: "file_absent", path: "delete-verified.txt" },
      ],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "verified_success",
  },
  {
    id: "file-traversal-blocked-at-runtime",
    category: "file",
    request: {
      goal: "Attempt to leave the workspace",
      operation: {
        kind: "file",
        action: "read",
        path: "../outside.txt",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [],
    },
    expectedPlan: "planned",
    expectedFinal: "failed",
  },
  {
    id: "terminal-node-approved",
    category: "terminal",
    request: {
      goal: "Run deterministic Node output",
      operation: {
        kind: "terminal",
        action: "run",
        command: "node",
        args: ["-e", "process.stdout.write('eval-ok')"],
        timeoutMs: 5_000,
        maxOutputChars: 10_000,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 10_000, maxRetries: 0 },
      requiredEvidence: [
        { type: "exit_code", value: 0 },
        { type: "result_contains", path: "stdout", value: "eval-ok" },
      ],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "verified_success",
  },
  {
    id: "terminal-node-cross-platform",
    category: "terminal",
    request: {
      goal: "Run a second cross-platform terminal check",
      operation: {
        kind: "terminal",
        action: "run",
        command: "node",
        args: ["-e", "process.stdout.write(process.cwd())"],
        timeoutMs: 5_000,
        maxOutputChars: 10_000,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 10_000, maxRetries: 1 },
      requiredEvidence: [{ type: "exit_code", value: 0 }],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "verified_success",
  },
  {
    id: "terminal-shell-denied",
    category: "policy",
    request: {
      goal: "Attempt an unrestricted shell",
      operation: {
        kind: "terminal",
        action: "run",
        command: "sh",
        args: ["-c", "echo unsafe"],
        timeoutMs: 5_000,
        maxOutputChars: 10_000,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 10_000, maxRetries: 0 },
      requiredEvidence: [{ type: "exit_code", value: 0 }],
    },
    expectedPlan: "policy_blocked",
  },
  {
    id: "terminal-command-not-allowlisted",
    category: "policy",
    request: {
      goal: "Attempt an unlisted executable",
      operation: {
        kind: "terminal",
        action: "run",
        command: "curl",
        args: ["https://example.com"],
        timeoutMs: 5_000,
        maxOutputChars: 10_000,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 10_000, maxRetries: 0 },
      requiredEvidence: [{ type: "exit_code", value: 0 }],
    },
    expectedPlan: "policy_blocked",
  },
  {
    id: "terminal-timeout-fails",
    category: "terminal",
    request: {
      goal: "Bound a long command",
      operation: {
        kind: "terminal",
        action: "run",
        command: "node",
        args: ["-e", "setTimeout(() => {}, 10000)"],
        timeoutMs: 150,
        maxOutputChars: 10_000,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [{ type: "exit_code", value: 0 }],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "failed",
  },
  {
    id: "memory-put-approved",
    category: "memory",
    request: {
      goal: "Store scoped memory",
      operation: {
        kind: "memory",
        action: "put",
        scope: "workspace",
        key: "product",
        value: "ATLAS MCP",
        confidence: 1,
        limit: 20,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [
        { type: "result_equals", path: "stored", value: true },
      ],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "verified_success",
  },
  {
    id: "memory-search-empty",
    category: "memory",
    request: {
      goal: "Search an empty memory scope",
      operation: {
        kind: "memory",
        action: "search",
        scope: "workspace",
        query: "nothing",
        confidence: 1,
        limit: 20,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 1 },
      requiredEvidence: [],
    },
    expectedPlan: "planned",
    expectedFinal: "verified_success",
  },
  {
    id: "memory-secret-redaction",
    category: "memory",
    request: {
      goal: "Store memory without persisting a raw token",
      operation: {
        kind: "memory",
        action: "put",
        scope: "workspace",
        key: "redaction",
        value: "password=hunter2",
        confidence: 1,
        limit: 20,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [
        { type: "result_equals", path: "stored", value: true },
      ],
    },
    expectedPlan: "awaiting_approval",
    approve: true,
    expectedFinal: "verified_success",
  },
  {
    id: "memory-clear-without-evidence",
    category: "policy",
    request: {
      goal: "Clear memory without evidence",
      operation: {
        kind: "memory",
        action: "clear",
        scope: "workspace",
        confidence: 1,
        limit: 20,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [],
    },
    expectedPlan: "policy_blocked",
  },
  {
    id: "verification-mismatch-is-partial",
    category: "verification",
    fixtures: [{ path: "fixture.txt", content: "actual" }],
    request: {
      goal: "Do not claim success with mismatched evidence",
      operation: {
        kind: "file",
        action: "read",
        path: "fixture.txt",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [
        { type: "result_contains", path: "content", value: "expected" },
      ],
    },
    expectedPlan: "planned",
    expectedFinal: "partial",
  },
  {
    id: "computer-capability-inspection",
    category: "computer",
    request: {
      goal: "Inspect supported local computer-use capabilities",
      operation: {
        kind: "computer",
        action: "capabilities",
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [
        { type: "result_equals", path: "platform", value: process.platform },
      ],
    },
    expectedPlan: "planned",
    expectedFinal: "verified_success",
  },
  {
    id: "pending-task-cancellation",
    category: "policy",
    request: {
      goal: "Cancel before an approved write",
      operation: {
        kind: "file",
        action: "write",
        path: "cancelled.txt",
        content: "must not be written",
        encoding: "utf8",
        recursive: false,
      },
      constraints: [],
      forbiddenEffects: [],
      budget: { maxSteps: 2, maxDurationMs: 5_000, maxRetries: 0 },
      requiredEvidence: [{ type: "file_exists", path: "cancelled.txt" }],
    },
    expectedPlan: "awaiting_approval",
    cancel: true,
    expectedFinal: "cancelled",
  },
];
