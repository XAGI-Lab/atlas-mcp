// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { TaskRequestSchema } from "@melra/protocol";
import {
  createDefaultPolicy,
  defaultEvidenceFor,
  evaluatePolicy,
  validateApproval,
} from "./index.js";

const root = "/tmp/melra-policy-test";

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

  it("allows computer inspection but gates input behind evidence and approval", () => {
    const inspect = TaskRequestSchema.parse({
      goal: "Inspect local computer-use support",
      operation: { kind: "computer", action: "capabilities" },
    });
    expect(
      evaluatePolicy(
        "c4e05bc0-c809-4ba3-a2a4-69102cdcf688",
        inspect,
        createDefaultPolicy(root),
      ).decision.outcome,
    ).toBe("allow");

    const click = TaskRequestSchema.parse({
      goal: "Click a verified desktop target",
      operation: {
        kind: "computer",
        action: "click",
        coordinateSpace: "normalized",
        x: 0.5,
        y: 0.5,
      },
      requiredEvidence: [
        { type: "result_equals", path: "success", value: true },
      ],
    });
    const decision = evaluatePolicy(
      "1aa2432a-a584-4b3f-b256-9ac3a6887630",
      click,
      createDefaultPolicy(root),
    );
    expect(decision.decision.outcome).toBe("confirm");
    expect(decision.decision.risk).toBe("high");
  });

  it("validates the scoped approval phrase", () => {
    const request = TaskRequestSchema.parse({
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

  it("allows a browser navigation with the shipped defaults", () => {
    // Regression: allowedDomains defaulted to [] and denied every navigation
    // out of the box, which is what made browser use unusable on a fresh install.
    const request = TaskRequestSchema.parse({
      goal: "Open a docs page",
      operation: {
        kind: "browser",
        action: "navigate",
        url: "https://example.com/docs",
      },
    });
    expect(
      evaluatePolicy(
        "0f9e6d2a-3c41-4b8e-9a77-1d5b8c2e4f60",
        request,
        createDefaultPolicy(root),
      ).decision.outcome,
    ).toBe("allow");
  });
});

describe("default evidence", () => {
  it("derives the obvious post-condition per file action", () => {
    expect(
      defaultEvidenceFor({
        kind: "file",
        action: "write",
        path: "out.txt",
        encoding: "utf8",
        recursive: false,
      }),
    ).toEqual([{ type: "file_exists", path: "out.txt" }]);
    expect(
      defaultEvidenceFor({
        kind: "file",
        action: "delete",
        path: "out.txt",
        encoding: "utf8",
        recursive: false,
      }),
    ).toEqual([{ type: "file_absent", path: "out.txt" }]);
    expect(
      defaultEvidenceFor({
        kind: "file",
        action: "move",
        path: "a.txt",
        destination: "b.txt",
        encoding: "utf8",
        recursive: false,
      }),
    ).toEqual([
      { type: "file_absent", path: "a.txt" },
      { type: "file_exists", path: "b.txt" },
    ]);
  });

  it("derives nothing for a terminal run, so it still denies", () => {
    // The request says nothing about what the command should leave behind, so
    // there is no honest post-condition to synthesize.
    expect(
      defaultEvidenceFor({
        kind: "terminal",
        action: "run",
        command: "npm",
        args: ["run", "build"],
        timeoutMs: 30_000,
        maxOutputChars: 100_000,
      }),
    ).toEqual([]);
  });

  it("derives nothing for a read, which already has a fallback", () => {
    expect(
      defaultEvidenceFor({
        kind: "file",
        action: "read",
        path: "a.txt",
        encoding: "utf8",
        recursive: false,
      }),
    ).toEqual([]);
  });

  it("matches the field each memory action actually reports", () => {
    expect(
      defaultEvidenceFor({
        kind: "memory",
        action: "put",
        scope: "workspace",
        key: "k",
        value: "v",
        confidence: 1,
        tags: [],
        includeSuperseded: false,
        limit: 20,
      }),
    ).toEqual([{ type: "result_equals", path: "stored", value: true }]);
    // `clear` reports a count, not a boolean, so nothing is derivable.
    expect(
      defaultEvidenceFor({
        kind: "memory",
        action: "clear",
        scope: "workspace",
        confidence: 1,
        tags: [],
        includeSuperseded: false,
        limit: 20,
      }),
    ).toEqual([]);
  });
});
