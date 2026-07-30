// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  MelraReceiptInputSchema,
  TaskRequestSchema,
  TOOL_NAMES,
} from "./index.js";

describe("public protocol schemas", () => {
  it("applies bounded task defaults", () => {
    const request = TaskRequestSchema.parse({
      goal: "Inspect the runtime",
      operation: { kind: "system", action: "info" },
    });
    expect(request.budget).toEqual({
      maxSteps: 10,
      maxDurationMs: 120_000,
      maxRetries: 2,
    });
    expect(request.constraints).toEqual([]);
    expect(request.requiredEvidence).toEqual([]);
  });

  it("rejects unknown fields and unknown effect names", () => {
    expect(() =>
      TaskRequestSchema.parse({
        goal: "Reject schema smuggling",
        operation: {
          kind: "file",
          action: "read",
          path: "README.md",
          executeAnyway: true,
        },
      }),
    ).toThrow();
    expect(() =>
      TaskRequestSchema.parse({
        goal: "Reject an unknown effect",
        operation: { kind: "system", action: "info" },
        forbiddenEffects: ["network"],
      }),
    ).toThrow();
  });

  it("keeps the compact tool and receipt lookup contracts strict", () => {
    expect(TOOL_NAMES).toEqual([
      "melra_capabilities",
      "melra_plan",
      "melra_execute",
      "melra_task_status",
      "melra_task_cancel",
      "melra_receipt",
      "melra_workflow_plan",
      "melra_workflow_advance",
      "melra_workflow_status",
      "melra_workflow_cancel",
    ]);
    expect(() => MelraReceiptInputSchema.parse({})).toThrow();
    expect(
      MelraReceiptInputSchema.parse({
        taskId: "8c73f2ad-f503-47c6-83d5-7a866a70bdf0",
      }).taskId,
    ).toBe("8c73f2ad-f503-47c6-83d5-7a866a70bdf0");
  });
});
