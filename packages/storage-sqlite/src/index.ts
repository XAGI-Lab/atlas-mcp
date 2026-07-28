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
  tags: string[];
  expiresAt?: string;
  supersedesId?: string;
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface JsonRow {
  data: string;
}

interface MemoryRow {
  id: string;
  scope: MemoryScope;
  key: string;
  value: string;
  source: string;
  confidence: number;
  tags: string;
  expiresAt: string | null;
  supersedesId: string | null;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function toMemoryRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    scope: row.scope,
    key: row.key,
    value: row.value,
    source: row.source,
    confidence: row.confidence,
    tags: JSON.parse(row.tags) as string[],
    ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt }),
    ...(row.supersedesId === null ? {} : { supersedesId: row.supersedesId }),
    ...(row.supersededBy === null ? {} : { supersededBy: row.supersededBy }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
        tags TEXT NOT NULL DEFAULT '[]',
        expires_at TEXT,
        supersedes_id TEXT,
        superseded_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_scope ON memories(scope);
      CREATE INDEX IF NOT EXISTS memories_key ON memories(key);
    `);
    this.addColumnIfMissing("memories", "tags", "TEXT NOT NULL DEFAULT '[]'");
    this.addColumnIfMissing("memories", "expires_at", "TEXT");
    this.addColumnIfMissing("memories", "supersedes_id", "TEXT");
    this.addColumnIfMissing("memories", "superseded_by", "TEXT");
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS memories_expiry ON memories(expires_at);
      CREATE INDEX IF NOT EXISTS memories_superseded_by ON memories(superseded_by);
    `);
  }

  private addColumnIfMissing(
    table: string,
    column: string,
    definition: string,
  ): void {
    const columns = this.database
      .prepare(`PRAGMA table_info(${table})`)
      .all() as unknown as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
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
        INSERT INTO memories(
          id, scope, key, value, source, confidence, tags, expires_at,
          supersedes_id, superseded_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          scope = excluded.scope,
          key = excluded.key,
          value = excluded.value,
          source = excluded.source,
          confidence = excluded.confidence,
          tags = excluded.tags,
          expires_at = excluded.expires_at,
          supersedes_id = excluded.supersedes_id,
          superseded_by = excluded.superseded_by,
          updated_at = excluded.updated_at
      `)
      .run(
        memory.id,
        memory.scope,
        memory.key,
        memory.value,
        memory.source,
        memory.confidence,
        JSON.stringify(memory.tags),
        memory.expiresAt ?? null,
        memory.supersedesId ?? null,
        memory.supersededBy ?? null,
        memory.createdAt,
        memory.updatedAt,
      );
  }

  getMemory(id: string): MemoryRecord | undefined {
    const row = this.database
      .prepare(`
        SELECT id, scope, key, value, source, confidence, tags,
               expires_at AS expiresAt, supersedes_id AS supersedesId,
               superseded_by AS supersededBy,
               created_at AS createdAt, updated_at AS updatedAt
        FROM memories WHERE id = ?
      `)
      .get(id) as MemoryRow | undefined;
    return row === undefined ? undefined : toMemoryRecord(row);
  }

  listMemories(
    scope: MemoryScope,
    limit: number,
    includeSuperseded = false,
  ): MemoryRecord[] {
    const rows = this.database
      .prepare(`
        SELECT id, scope, key, value, source, confidence, tags,
               expires_at AS expiresAt, supersedes_id AS supersedesId,
               superseded_by AS supersededBy,
               created_at AS createdAt, updated_at AS updatedAt
        FROM memories
        WHERE scope = ?
          AND (expires_at IS NULL OR expires_at > ?)
          AND (? = 1 OR superseded_by IS NULL)
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(
        scope,
        new Date().toISOString(),
        includeSuperseded ? 1 : 0,
        limit,
      ) as unknown as MemoryRow[];
    return rows.map(toMemoryRecord);
  }

  memoryCandidates(
    scope: MemoryScope,
    limit: number,
    includeSuperseded = false,
  ): MemoryRecord[] {
    const rows = this.database
      .prepare(`
        SELECT id, scope, key, value, source, confidence, tags,
               expires_at AS expiresAt, supersedes_id AS supersedesId,
               superseded_by AS supersededBy,
               created_at AS createdAt, updated_at AS updatedAt
        FROM memories
        WHERE scope = ?
          AND (expires_at IS NULL OR expires_at > ?)
          AND (? = 1 OR superseded_by IS NULL)
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(
        scope,
        new Date().toISOString(),
        includeSuperseded ? 1 : 0,
        limit,
      ) as unknown as MemoryRow[];
    return rows.map(toMemoryRecord);
  }

  supersedeMemory(
    id: string,
    scope: MemoryScope,
    supersededBy: string,
  ): boolean {
    const result = this.database
      .prepare(`
        UPDATE memories
        SET superseded_by = ?, updated_at = ?
        WHERE id = ? AND scope = ? AND superseded_by IS NULL
      `)
      .run(supersededBy, new Date().toISOString(), id, scope);
    return Number(result.changes) > 0;
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
