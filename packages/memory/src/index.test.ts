// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { MemoryOperationSchema } from "@atlas-mcp/protocol";
import { SqliteStore } from "@atlas-mcp/storage-sqlite";
import { LocalMemory, rankMemories, redactMemoryValue } from "./index.js";

let store: SqliteStore | undefined;

afterEach(() => {
  store?.close();
  store = undefined;
});

describe("LocalMemory", () => {
  it("redacts common secret formats before persistence", () => {
    const result = redactMemoryValue(
      "token ghp_123456789012345678901234 and password=hunter2",
    );
    expect(result.value).not.toContain("hunter2");
    expect(result.value).not.toContain("ghp_123");
    expect(result.redactions.length).toBeGreaterThan(0);
  });

  it("keeps memory isolated by scope", () => {
    store = new SqliteStore(":memory:");
    const memory = new LocalMemory(store);
    memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "put",
        scope: "workspace",
        key: "product",
        value: "ATLAS MCP",
      }),
    );
    const workspace = memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "search",
        scope: "workspace",
        query: "atlas",
      }),
    ) as { memories: unknown[] };
    const user = memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "search",
        scope: "user",
        query: "atlas",
      }),
    ) as { memories: unknown[] };
    expect(workspace.memories).toHaveLength(1);
    expect(user.memories).toHaveLength(0);
  });

  it("ranks rare exact evidence ahead of generic duplicates", () => {
    const now = "2026-07-28T00:00:00.000Z";
    const ranked = rankMemories(
      [
        {
          id: "00000000-0000-4000-8000-000000000001",
          scope: "workspace",
          key: "release",
          value: "The launch codename is aurora.",
          source: "test",
          confidence: 0.95,
          tags: ["launch"],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          scope: "workspace",
          key: "generic",
          value: "The release process has a launch checklist.",
          source: "test",
          confidence: 1,
          tags: [],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-4000-8000-000000000003",
          scope: "workspace",
          key: "duplicate",
          value: "The release process has a launch checklist.",
          source: "test",
          confidence: 1,
          tags: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
      "launch codename aurora",
      3,
      Date.parse(now),
    );
    expect(ranked[0]?.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(ranked[0]?.scoreBreakdown.lexical).toBeGreaterThan(0);
    expect(ranked[2]?.scoreBreakdown.diversityPenalty).toBeGreaterThan(0);
  });

  it("supports expiry and scoped supersession", () => {
    store = new SqliteStore(":memory:");
    const memory = new LocalMemory(store);
    const first = memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "put",
        scope: "workspace",
        key: "runtime",
        value: "Use version one",
      }),
    ) as { id: string };
    memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "put",
        scope: "workspace",
        key: "runtime",
        value: "Use version two",
        supersedesId: first.id,
      }),
    );
    memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "put",
        scope: "workspace",
        key: "expired",
        value: "Do not retrieve this",
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    );
    const current = memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "search",
        scope: "workspace",
        query: "runtime version",
      }),
    ) as { memories: unknown[] };
    expect(current.memories).toHaveLength(1);
    expect(JSON.stringify(current)).toContain("version two");
    expect(JSON.stringify(current)).not.toContain("version one");
    expect(JSON.stringify(current)).not.toContain("Do not retrieve");
    expect(() =>
      memory.execute(
        MemoryOperationSchema.parse({
          kind: "memory",
          action: "put",
          scope: "workspace",
          id: first.id,
          key: "runtime",
          value: "Try to revive version one",
        }),
      ),
    ).toThrow("memory_superseded_record_immutable");
  });

  it("cannot delete or overwrite a record through a different scope", () => {
    store = new SqliteStore(":memory:");
    const memory = new LocalMemory(store);
    const inserted = memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "put",
        scope: "workspace",
        key: "isolated",
        value: "workspace only",
      }),
    ) as { id: string };
    const wrongScopeDelete = memory.execute(
      MemoryOperationSchema.parse({
        kind: "memory",
        action: "delete",
        scope: "user",
        id: inserted.id,
      }),
    );
    expect(wrongScopeDelete.deleted).toBe(false);
    expect(store.getMemory(inserted.id)?.value).toBe("workspace only");
    expect(() =>
      memory.execute(
        MemoryOperationSchema.parse({
          kind: "memory",
          action: "put",
          scope: "user",
          id: inserted.id,
          key: "isolated",
          value: "cross-scope overwrite",
        }),
      ),
    ).toThrow("memory_scope_mismatch");
  });
});
