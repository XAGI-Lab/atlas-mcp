// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { TaskRequestSchema } from "@melra/protocol";
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
  it("migrates an existing alpha database exactly once", () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "melra-storage-migration-"));
    const databasePath = join(tempDirectory, "melra.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE receipts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE certificates (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        speaker TEXT,
        episode_id TEXT,
        sequence INTEGER,
        expires_at TEXT,
        supersedes_id TEXT,
        superseded_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacy.close();

    store = new SqliteStore(databasePath);

    expect(
      store.database
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }, { version: 2 }]);
  });

  it("grants a workflow lease to one owner and expires it", () => {
    store = new SqliteStore(":memory:");
    const workflowId = "11111111-1111-4111-8111-111111111111";
    const soon = new Date(Date.now() + 60_000).toISOString();
    const now = new Date().toISOString();

    expect(store.acquireWorkflowLease(workflowId, "a", now, soon)).toBe(true);
    expect(store.acquireWorkflowLease(workflowId, "b", now, soon)).toBe(false);
    // The holder re-entering is not contention.
    expect(store.acquireWorkflowLease(workflowId, "a", now, soon)).toBe(true);
    expect(store.getWorkflowLease(workflowId)?.owner).toBe("a");

    // Renewal only works for the holder, so a loser cannot extend a lease it
    // never won.
    expect(store.renewWorkflowLease(workflowId, "b", soon)).toBe(false);
    expect(store.renewWorkflowLease(workflowId, "a", soon)).toBe(true);

    // A dead holder's lease lapses rather than stranding the workflow.
    const past = new Date(Date.now() - 1_000).toISOString();
    store.renewWorkflowLease(workflowId, "a", past);
    expect(store.acquireWorkflowLease(workflowId, "b", now, soon)).toBe(true);

    store.releaseWorkflowLease(workflowId, "b");
    expect(store.getWorkflowLease(workflowId)).toBeUndefined();
  });

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
      value: "MELRA uses SQLite",
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
    tempDirectory = mkdtempSync(join(tmpdir(), "melra-memory-migration-"));
    const databasePath = join(tempDirectory, "melra.sqlite");
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
