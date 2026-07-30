// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MemoryScope, TaskRecord } from "./types.js";
import {
  EncryptedPayloadSchema,
  WorkflowDefinitionSchema,
  WorkflowEventSchema,
  WorkflowRunSchema,
  WorkflowSnapshotSchema,
  type EncryptedPayload,
  type WorkflowDefinition,
  type WorkflowEvent,
  type WorkflowRun,
  type WorkflowSnapshot,
} from "@melra/protocol";
import type {
  ActionReceipt,
  ExecutionCertificate,
} from "@melra/receipt-schema";

export interface MemoryRecord {
  id: string;
  scope: MemoryScope;
  key: string;
  value: string;
  source: string;
  confidence: number;
  tags: string[];
  speaker?: string;
  episodeId?: string;
  sequence?: number;
  expiresAt?: string;
  supersedesId?: string;
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface JsonRow {
  data: string;
}

interface NullableJsonRow {
  data: string | null;
}

interface StateVersionRow {
  stateVersion: number;
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
  speaker: string | null;
  episodeId: string | null;
  sequence: number | null;
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
    ...(row.speaker === null ? {} : { speaker: row.speaker }),
    ...(row.episodeId === null ? {} : { episodeId: row.episodeId }),
    ...(row.sequence === null ? {} : { sequence: row.sequence }),
    ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt }),
    ...(row.supersedesId === null ? {} : { supersedesId: row.supersedesId }),
    ...(row.supersededBy === null ? {} : { supersededBy: row.supersededBy }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

interface Parser<T> {
  parse(value: unknown): T;
}

function parseStored<T>(
  data: string,
  schema: Parser<T>,
  error: string,
): T {
  try {
    return schema.parse(JSON.parse(data));
  } catch {
    throw new Error(error);
  }
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
        speaker TEXT,
        episode_id TEXT,
        sequence INTEGER,
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
    this.addColumnIfMissing("memories", "speaker", "TEXT");
    this.addColumnIfMissing("memories", "episode_id", "TEXT");
    this.addColumnIfMissing("memories", "sequence", "INTEGER");
    this.addColumnIfMissing("memories", "expires_at", "TEXT");
    this.addColumnIfMissing("memories", "supersedes_id", "TEXT");
    this.addColumnIfMissing("memories", "superseded_by", "TEXT");
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS memories_expiry ON memories(expires_at);
      CREATE INDEX IF NOT EXISTS memories_superseded_by ON memories(superseded_by);
      CREATE INDEX IF NOT EXISTS memories_episode_sequence
        ON memories(episode_id, sequence);
    `);
    this.transaction(() => {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
      `);
      const applied = this.database
        .prepare("SELECT version FROM schema_migrations WHERE version = 1")
        .get();
      if (applied !== undefined) return;
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS task_payloads (
          task_id TEXT PRIMARY KEY,
          request_payload TEXT NOT NULL,
          result_payload TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workflow_payloads (
          workflow_id TEXT NOT NULL,
          workflow_version INTEGER NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY(workflow_id, workflow_version)
        );
        CREATE TABLE IF NOT EXISTS workflow_definitions (
          id TEXT NOT NULL,
          version INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY(id, version)
        );
        CREATE TABLE IF NOT EXISTS workflow_runs (
          id TEXT PRIMARY KEY,
          definition_id TEXT NOT NULL,
          definition_version INTEGER NOT NULL,
          state_version INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workflow_events (
          id TEXT PRIMARY KEY,
          aggregate_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          trace_id TEXT NOT NULL,
          type TEXT NOT NULL,
          data TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          UNIQUE(aggregate_id, sequence)
        );
        CREATE INDEX IF NOT EXISTS workflow_events_aggregate
          ON workflow_events(aggregate_id, sequence);
        CREATE TABLE IF NOT EXISTS workflow_snapshots (
          workflow_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY(workflow_id, sequence)
        );
        CREATE TABLE IF NOT EXISTS idempotency_commits (
          idempotency_key TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          attempt INTEGER NOT NULL,
          committed_at TEXT NOT NULL
        );
      `);
      this.database
        .prepare(
          "INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)",
        )
        .run(new Date().toISOString());
    });
  }

  private transaction<T>(action: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
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

  saveTaskPayload(
    taskId: string,
    payload: EncryptedPayload,
    at: string,
  ): void {
    const parsed = EncryptedPayloadSchema.parse(payload);
    this.database
      .prepare(`
        INSERT INTO task_payloads(
          task_id, request_payload, result_payload, created_at, updated_at
        )
        VALUES (?, ?, NULL, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          request_payload = excluded.request_payload,
          updated_at = excluded.updated_at
      `)
      .run(taskId, JSON.stringify(parsed), at, at);
  }

  getTaskPayload(taskId: string): EncryptedPayload | undefined {
    const row = this.database
      .prepare(
        "SELECT request_payload AS data FROM task_payloads WHERE task_id = ?",
      )
      .get(taskId) as JsonRow | undefined;
    return row === undefined
      ? undefined
      : parseStored(
          row.data,
          EncryptedPayloadSchema,
          "stored_task_payload_invalid",
        );
  }

  saveTaskExecutionResult(
    task: TaskRecord,
    payload: EncryptedPayload,
  ): void {
    const parsed = EncryptedPayloadSchema.parse(payload);
    this.transaction(() => {
      this.saveTask(task);
      const result = this.database
        .prepare(`
          UPDATE task_payloads
          SET result_payload = ?, updated_at = ?
          WHERE task_id = ?
        `)
        .run(JSON.stringify(parsed), task.updatedAt, task.id);
      if (Number(result.changes) !== 1) {
        throw new Error("task_payload_not_found");
      }
    });
  }

  getTaskResult(taskId: string): EncryptedPayload | undefined {
    const row = this.database
      .prepare(
        "SELECT result_payload AS data FROM task_payloads WHERE task_id = ?",
      )
      .get(taskId) as NullableJsonRow | undefined;
    return row === undefined || row.data === null
      ? undefined
      : parseStored(
          row.data,
          EncryptedPayloadSchema,
          "stored_task_result_invalid",
        );
  }

  deleteTaskPayload(taskId: string): void {
    this.database
      .prepare("DELETE FROM task_payloads WHERE task_id = ?")
      .run(taskId);
  }

  listInterruptedTasks(): TaskRecord[] {
    const rows = this.database
      .prepare(`
        SELECT data FROM tasks
        WHERE json_extract(data, '$.status') IN ('running', 'verifying')
        ORDER BY updated_at
      `)
      .all() as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.data) as TaskRecord);
  }

  getWorkflowPayload(
    id: string,
    version: number,
  ): EncryptedPayload | undefined {
    const row = this.database
      .prepare(`
        SELECT payload AS data FROM workflow_payloads
        WHERE workflow_id = ? AND workflow_version = ?
      `)
      .get(id, version) as JsonRow | undefined;
    return row === undefined
      ? undefined
      : parseStored(
          row.data,
          EncryptedPayloadSchema,
          "stored_workflow_payload_invalid",
        );
  }

  createWorkflow(
    redactedDefinition: WorkflowDefinition,
    payload: EncryptedPayload,
    run: WorkflowRun,
    events: WorkflowEvent[],
  ): void {
    const definition = WorkflowDefinitionSchema.parse(redactedDefinition);
    const sealed = EncryptedPayloadSchema.parse(payload);
    const projection = WorkflowRunSchema.parse(run);
    const parsedEvents = events.map((item) => WorkflowEventSchema.parse(item));
    if (
      definition.id !== projection.definitionId ||
      definition.version !== projection.definitionVersion
    ) {
      throw new Error("workflow_definition_mismatch");
    }
    this.assertWorkflowEvents(
      projection.id,
      projection.traceId,
      0,
      projection.stateVersion,
      parsedEvents,
    );

    this.transaction(() => {
      this.database
        .prepare(`
          INSERT INTO workflow_definitions(id, version, data, created_at)
          VALUES (?, ?, ?, ?)
        `)
        .run(
          definition.id,
          definition.version,
          JSON.stringify(definition),
          projection.createdAt,
        );
      this.database
        .prepare(`
          INSERT INTO workflow_payloads(
            workflow_id, workflow_version, payload, created_at
          )
          VALUES (?, ?, ?, ?)
        `)
        .run(
          definition.id,
          definition.version,
          JSON.stringify(sealed),
          projection.createdAt,
        );
      this.database
        .prepare(`
          INSERT INTO workflow_runs(
            id, definition_id, definition_version, state_version, data,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          projection.id,
          projection.definitionId,
          projection.definitionVersion,
          projection.stateVersion,
          JSON.stringify(projection),
          projection.createdAt,
          projection.updatedAt,
        );
      for (const item of parsedEvents) this.insertWorkflowEvent(item);
    });
  }

  getWorkflowDefinition(
    id: string,
    version: number,
  ): WorkflowDefinition | undefined {
    const row = this.database
      .prepare(`
        SELECT data FROM workflow_definitions WHERE id = ? AND version = ?
      `)
      .get(id, version) as JsonRow | undefined;
    return row === undefined
      ? undefined
      : parseStored(
          row.data,
          WorkflowDefinitionSchema,
          "stored_workflow_definition_invalid",
        );
  }

  getWorkflowRun(id: string): WorkflowRun | undefined {
    const row = this.database
      .prepare("SELECT data FROM workflow_runs WHERE id = ?")
      .get(id) as JsonRow | undefined;
    return row === undefined
      ? undefined
      : parseStored(
          row.data,
          WorkflowRunSchema,
          "stored_workflow_run_invalid",
        );
  }

  listWorkflowEvents(
    id: string,
    afterSequence = 0,
  ): WorkflowEvent[] {
    const rows = this.database
      .prepare(`
        SELECT data FROM workflow_events
        WHERE aggregate_id = ? AND sequence > ?
        ORDER BY sequence
      `)
      .all(id, afterSequence) as unknown as JsonRow[];
    return rows.map((row) =>
      parseStored(
        row.data,
        WorkflowEventSchema,
        "stored_workflow_event_invalid",
      ),
    );
  }

  saveWorkflowSnapshot(snapshot: WorkflowSnapshot): void {
    const parsed = WorkflowSnapshotSchema.parse(snapshot);
    this.database
      .prepare(`
        INSERT INTO workflow_snapshots(
          workflow_id, sequence, data, created_at
        )
        VALUES (?, ?, ?, ?)
      `)
      .run(
        parsed.workflowId,
        parsed.sequence,
        JSON.stringify(parsed),
        parsed.createdAt,
      );
  }

  getLatestWorkflowSnapshot(id: string): WorkflowSnapshot | undefined {
    const row = this.database
      .prepare(`
        SELECT data FROM workflow_snapshots
        WHERE workflow_id = ?
        ORDER BY sequence DESC
        LIMIT 1
      `)
      .get(id) as JsonRow | undefined;
    return row === undefined
      ? undefined
      : parseStored(
          row.data,
          WorkflowSnapshotSchema,
          "stored_workflow_snapshot_invalid",
        );
  }

  transitionWorkflow(
    id: string,
    expectedStateVersion: number,
    run: WorkflowRun,
    events: WorkflowEvent[],
  ): void {
    const projection = WorkflowRunSchema.parse(run);
    const parsedEvents = events.map((item) => WorkflowEventSchema.parse(item));
    this.assertWorkflowEvents(
      id,
      projection.traceId,
      expectedStateVersion,
      projection.stateVersion,
      parsedEvents,
    );
    if (projection.id !== id) throw new Error("workflow_projection_id_mismatch");

    this.transaction(() => {
      const current = this.database
        .prepare(
          `SELECT state_version AS stateVersion, data
           FROM workflow_runs WHERE id = ?`,
        )
        .get(id) as StateVersionRow | undefined;
      if (current === undefined) throw new Error("workflow_not_found");
      if (current.stateVersion !== expectedStateVersion) {
        throw new Error("workflow_state_conflict");
      }
      const stored = parseStored(
        current.data,
        WorkflowRunSchema,
        "stored_workflow_run_invalid",
      );
      if (
        projection.definitionId !== stored.definitionId ||
        projection.definitionVersion !== stored.definitionVersion ||
        projection.traceId !== stored.traceId
      ) {
        throw new Error("workflow_projection_identity_mismatch");
      }
      for (const item of parsedEvents) this.insertWorkflowEvent(item);
      const updated = this.database
        .prepare(`
          UPDATE workflow_runs
          SET state_version = ?, data = ?, updated_at = ?
          WHERE id = ? AND state_version = ?
        `)
        .run(
          projection.stateVersion,
          JSON.stringify(projection),
          projection.updatedAt,
          id,
          expectedStateVersion,
        );
      if (Number(updated.changes) !== 1) {
        throw new Error("workflow_state_conflict");
      }
    });
  }

  commitIdempotency(
    key: string,
    taskId: string,
    attempt: number,
    at: string,
  ): boolean {
    const result = this.database
      .prepare(`
        INSERT OR IGNORE INTO idempotency_commits(
          idempotency_key, task_id, attempt, committed_at
        )
        VALUES (?, ?, ?, ?)
      `)
      .run(key, taskId, attempt, at);
    return Number(result.changes) === 1;
  }

  private assertWorkflowEvents(
    workflowId: string,
    traceId: string,
    previousStateVersion: number,
    nextStateVersion: number,
    events: WorkflowEvent[],
  ): void {
    if (
      events.some(
        (item) =>
          item.aggregateId !== workflowId || item.traceId !== traceId,
      )
    ) {
      throw new Error("workflow_event_identity_invalid");
    }
    if (
      events.length === 0 ||
      nextStateVersion !== previousStateVersion + events.length ||
      events.some(
        (item, index) =>
          item.sequence !== previousStateVersion + index + 1,
      )
    ) {
      throw new Error("workflow_event_sequence_invalid");
    }
  }

  private insertWorkflowEvent(event: WorkflowEvent): void {
    this.database
      .prepare(`
        INSERT INTO workflow_events(
          id, aggregate_id, sequence, trace_id, type, data, occurred_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.id,
        event.aggregateId,
        event.sequence,
        event.traceId,
        event.type,
        JSON.stringify(event),
        event.occurredAt,
      );
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
          id, scope, key, value, source, confidence, tags, speaker, episode_id,
          sequence, expires_at, supersedes_id, superseded_by, created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          scope = excluded.scope,
          key = excluded.key,
          value = excluded.value,
          source = excluded.source,
          confidence = excluded.confidence,
          tags = excluded.tags,
          speaker = excluded.speaker,
          episode_id = excluded.episode_id,
          sequence = excluded.sequence,
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
        memory.speaker ?? null,
        memory.episodeId ?? null,
        memory.sequence ?? null,
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
        SELECT id, scope, key, value, source, confidence, tags, speaker,
               episode_id AS episodeId, sequence,
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
        SELECT id, scope, key, value, source, confidence, tags, speaker,
               episode_id AS episodeId, sequence,
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
        SELECT id, scope, key, value, source, confidence, tags, speaker,
               episode_id AS episodeId, sequence,
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
