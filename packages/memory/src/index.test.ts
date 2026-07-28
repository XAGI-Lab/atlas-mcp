// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { MemoryOperationSchema } from "@atlas-mcp/protocol";
import { SqliteStore } from "@atlas-mcp/storage-sqlite";
import { LocalMemory, redactMemoryValue } from "./index.js";

let store: SqliteStore | undefined;

afterEach(() => store?.close());

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
