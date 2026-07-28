// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MemoryScope, TaskRecord } from "./types.js";
import type {
  ActionReceipt,
  ExecutionCertificate,
} from "@atlas-mcp/receipt-schema";

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  key: string;
  value: string;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

interface JsonRow {
  data: string;
}

export class SqliteStore {
  readonly path: string;
  readonly database: DatabaseSync;

  constructor(path: string) {
    this.path = path;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS receipts_task_id ON receipts(task_id);
      CREATE TABLE IF NOT EXISTS certificates (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_scope ON memories(scope);
      CREATE INDEX IF NOT EXISTS memories_key ON memories(key);
    `);
  }

  saveTask(task: TaskRecord): void {
    this.database
      .prepare(`
        INSERT INTO tasks(id, data, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
      `)
      .run(task.id, JSON.stringify(task), task.createdAt, task.updatedAt);
  }

  getTask(id: string): TaskRecord | undefined {
    const row = this.database
      .prepare("SELECT data FROM tasks WHERE id = ?")
      .get(id) as JsonRow | undefined;
    return row === undefined ? undefined : (JSON.parse(row.data) as TaskRecord);
  }

  listTasks(limit = 50): TaskRecord[] {
    const rows = this.database
      .prepare("SELECT data FROM tasks ORDER BY updated_at DESC LIMIT ?")
      .all(limit) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.data) as TaskRecord);
  }

  saveReceipt(receipt: ActionReceipt): void {
    this.database
      .prepare(`
        INSERT INTO receipts(id, task_id, data, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(
        receipt.receiptId,
        receipt.taskId,
        JSON.stringify(receipt),
        receipt.endedAt,
      );
  }

  getReceipt(id: string): ActionReceipt | undefined {
    const row = this.database
      .prepare("SELECT data FROM receipts WHERE id = ?")
      .get(id) as JsonRow | undefined;
    return row === undefined ? undefined : (JSON.parse(row.data) as ActionReceipt);
  }

  getReceiptsForTask(taskId: string): ActionReceipt[] {
    const rows = this.database
      .prepare("SELECT data FROM receipts WHERE task_id = ? ORDER BY created_at")
      .all(taskId) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.data) as ActionReceipt);
  }

  saveCertificate(certificate: ExecutionCertificate): void {
    this.database
      .prepare(`
        INSERT INTO certificates(id, task_id, data, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          id = excluded.id,
          data = excluded.data,
          created_at = excluded.created_at
      `)
      .run(
        certificate.certificateId,
        certificate.taskId,
        JSON.stringify(certificate),
        certificate.createdAt,
      );
  }

  getCertificateForTask(taskId: string): ExecutionCertificate | undefined {
    const row = this.database
      .prepare("SELECT data FROM certificates WHERE task_id = ?")
      .get(taskId) as JsonRow | undefined;
    return row === undefined
      ? undefined
      : (JSON.parse(row.data) as ExecutionCertificate);
  }

  putMemory(memory: MemoryRecord): void {
    this.database
      .prepare(`
        INSERT INTO memories(id, scope, key, value, source, confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          scope = excluded.scope,
          key = excluded.key,
          value = excluded.value,
          source = excluded.source,
          confidence = excluded.confidence,
          updated_at = excluded.updated_at
      `)
      .run(
        memory.id,
        memory.scope,
        memory.key,
        memory.value,
        memory.source,
        memory.confidence,
        memory.createdAt,
        memory.updatedAt,
      );
  }

  getMemory(id: string): MemoryRecord | undefined {
    const row = this.database
      .prepare(`
        SELECT id, scope, key, value, source, confidence,
               created_at AS createdAt, updated_at AS updatedAt
        FROM memories WHERE id = ?
      `)
      .get(id) as MemoryRecord | undefined;
    return row;
  }

  listMemories(scope: MemoryScope, limit: number): MemoryRecord[] {
    return this.database
      .prepare(`
        SELECT id, scope, key, value, source, confidence,
               created_at AS createdAt, updated_at AS updatedAt
        FROM memories
        WHERE scope = ?
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(scope, limit) as unknown as MemoryRecord[];
  }

  searchMemories(
    scope: MemoryScope,
    query: string,
    limit: number,
  ): MemoryRecord[] {
    const pattern = `%${query.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    return this.database
      .prepare(`
        SELECT id, scope, key, value, source, confidence,
               created_at AS createdAt, updated_at AS updatedAt
        FROM memories
        WHERE scope = ?
          AND (lower(key) LIKE ? ESCAPE '\\' OR lower(value) LIKE ? ESCAPE '\\')
        ORDER BY confidence DESC, updated_at DESC
        LIMIT ?
      `)
      .all(scope, pattern, pattern, limit) as unknown as MemoryRecord[];
  }

  deleteMemory(id: string, scope: MemoryScope): boolean {
    const result = this.database
      .prepare("DELETE FROM memories WHERE id = ? AND scope = ?")
      .run(id, scope);
    return Number(result.changes) > 0;
  }

  clearMemories(scope: MemoryScope): number {
    const result = this.database
      .prepare("DELETE FROM memories WHERE scope = ?")
      .run(scope);
    return Number(result.changes);
  }

  close(): void {
    this.database.close();
  }
}

export type { MemoryScope, TaskRecord } from "./types.js";
