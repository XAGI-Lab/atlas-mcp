// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { TaskRequestSchema } from "@atlas-mcp/protocol";
import { SqliteStore } from "./index.js";

let store: SqliteStore | undefined;

afterEach(() => store?.close());

describe("SqliteStore", () => {
  it("persists tasks and scoped memories", () => {
    store = new SqliteStore(":memory:");
    const now = new Date().toISOString();
    const request = TaskRequestSchema.parse({
      goal: "Inspect the system",
      operation: { kind: "system", action: "info" },
    });
    store.saveTask({
      id: "605a411d-d39d-494b-a6de-0e8c3b96a564",
      request,
      status: "planned",
      policyDecision: {
        outcome: "allow",
        effect: "read",
        risk: "low",
        reason: "read_only_operation",
        policyVersion: "1",
      },
      receiptIds: [],
      createdAt: now,
      updatedAt: now,
    });
    expect(
      store.getTask("605a411d-d39d-494b-a6de-0e8c3b96a564")?.request.goal,
    ).toBe("Inspect the system");

    store.putMemory({
      id: "8170fc74-9885-4ee5-973e-161fa441e510",
      scope: "workspace",
      key: "runtime",
      value: "ATLAS MCP uses SQLite",
      source: "test",
      confidence: 0.9,
      tags: ["runtime"],
      createdAt: now,
      updatedAt: now,
    });
    expect(store.memoryCandidates("workspace", 5)).toHaveLength(1);
    expect(store.listMemories("user", 5)).toHaveLength(0);
  });
});
