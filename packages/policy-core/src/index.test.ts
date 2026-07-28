// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { TaskRequestSchema } from "@atlas-mcp/protocol";
import {
  createDefaultPolicy,
  evaluatePolicy,
  validateApproval,
} from "./index.js";

const root = "/tmp/atlas-mcp-policy-test";

describe("local policy", () => {
  it("allows a read-only file operation", () => {
    const request = TaskRequestSchema.parse({
      goal: "Read the changelog",
      operation: { kind: "file", action: "read", path: "CHANGELOG.md" },
    });
    const result = evaluatePolicy(
      "4c5a0130-71a5-4c48-b22d-c7901f12688f",
      request,
      createDefaultPolicy(root),
    );
    expect(result.decision.outcome).toBe("allow");
    expect(result.challenge).toBeUndefined();
  });

  it("requires evidence and approval for mutation", () => {
    const missingEvidence = TaskRequestSchema.parse({
      goal: "Write a file",
      operation: {
        kind: "file",
        action: "write",
        path: "result.txt",
        content: "verified",
      },
    });
    expect(
      evaluatePolicy(
        "b47dded2-4e20-4d96-a993-fdf6b0034664",
        missingEvidence,
        createDefaultPolicy(root),
      ).decision.reason,
    ).toBe("mutation_requires_evidence");

    const request = TaskRequestSchema.parse({
      ...missingEvidence,
      requiredEvidence: [{ type: "file_exists", path: "result.txt" }],
    });
    const result = evaluatePolicy(
      "b47dded2-4e20-4d96-a993-fdf6b0034664",
      request,
      createDefaultPolicy(root),
    );
    expect(result.decision.outcome).toBe("confirm");
    expect(result.challenge?.phrase).toMatch(/^APPROVE [a-f0-9]{12}$/);
  });

  it("denies shells even if added to the allowlist", () => {
    const request = TaskRequestSchema.parse({
      goal: "Run an unrestricted shell",
      operation: {
        kind: "terminal",
        action: "run",
        command: "bash",
        args: ["-lc", "echo unsafe"],
      },
    });
    const policy = createDefaultPolicy(root);
    policy.allowedCommands.push("bash");
    expect(
      evaluatePolicy(
        "71942756-af2a-407d-806e-73d7bb4fe5d0",
        request,
        policy,
      ).decision.reason,
    ).toBe("command_not_allowlisted");
  });

  it("validates the scoped approval phrase", () => {
    const request = TaskRequestSchema.parse({
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
    });
    const result = evaluatePolicy(
      "db65d7da-9d59-46a7-86f7-aa1bd205382c",
      request,
      createDefaultPolicy(root),
    );
    const challenge = result.challenge;
    expect(challenge).toBeDefined();
    expect(
      validateApproval(challenge, {
        approvalId: challenge!.approvalId,
        phrase: challenge!.phrase,
      }),
    ).toEqual({ ok: true });
  });

  it("never silently ignores caller constraints or forbidden effects", () => {
    const constrained = TaskRequestSchema.parse({
      goal: "Read with an unenforceable natural-language constraint",
      operation: { kind: "file", action: "read", path: "README.md" },
      constraints: ["only if the file is recent"],
    });
    expect(
      evaluatePolicy(
        "ae8e57dd-e9f7-4821-82d7-ce50dc896008",
        constrained,
        createDefaultPolicy(root),
      ).decision.reason,
    ).toBe("freeform_constraints_not_enforceable");

    const forbidden = TaskRequestSchema.parse({
      goal: "Do not permit a mutation",
      operation: {
        kind: "file",
        action: "write",
        path: "result.txt",
        content: "blocked",
      },
      forbiddenEffects: ["mutate"],
      requiredEvidence: [{ type: "file_exists", path: "result.txt" }],
    });
    expect(
      evaluatePolicy(
        "e299a821-8dbf-4784-8ecf-f79d6812cc64",
        forbidden,
        createDefaultPolicy(root),
      ).decision.reason,
    ).toBe("effect_forbidden_by_request");
  });
});
