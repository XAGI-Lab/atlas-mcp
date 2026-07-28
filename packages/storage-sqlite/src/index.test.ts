// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { TaskRequestSchema } from "@atlas-mcp/protocol";
import { SqliteStore } from "./index.js";

let store: SqliteStore | undefined;
let tempDirectory: string | undefined;

afterEach(() => {
  store?.close();
  store = undefined;
  if (tempDirectory !== undefined) {
    rmSync(tempDirectory, { recursive: true, force: true });
    tempDirectory = undefined;
  }
});

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

  it("migrates existing memory tables before persisting episode metadata", () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "atlas-memory-migration-"));
    const databasePath = join(tempDirectory, "atlas.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        expires_at TEXT,
        supersedes_id TEXT,
        superseded_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacy.close();

    store = new SqliteStore(databasePath);
    const now = new Date().toISOString();
    store.putMemory({
      id: "4a9b5e8d-0b5b-4fe4-8db4-e2275c733f11",
      scope: "workspace",
      key: "answer",
      value: "Adoption agencies.",
      source: "test",
      confidence: 1,
      tags: [],
      speaker: "Alex",
      episodeId: "conversation-a",
      sequence: 11,
      createdAt: now,
      updatedAt: now,
    });

    expect(
      store.getMemory("4a9b5e8d-0b5b-4fe4-8db4-e2275c733f11"),
    ).toMatchObject({
      speaker: "Alex",
      episodeId: "conversation-a",
      sequence: 11,
    });
  });
});
