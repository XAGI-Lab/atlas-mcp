// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { MemoryOperation } from "@atlas-mcp/protocol";
import {
  SqliteStore,
  type MemoryRecord,
} from "@atlas-mcp/storage-sqlite";

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:sk|pk|api)[-_][a-z0-9_-]{16,}\b/gi, "[REDACTED_API_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi, "Bearer [REDACTED_TOKEN]"],
  [/\b(password|passwd|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]"],
  [/\bgh[opurs]_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
];

export function redactMemoryValue(value: string): {
  value: string;
  redactions: string[];
} {
  let redacted = value;
  const redactions: string[] = [];
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    const before = redacted;
    redacted = redacted.replace(pattern, replacement);
    if (redacted !== before) redactions.push(replacement);
  }
  return { value: redacted, redactions };
}

export class LocalMemory {
  constructor(private readonly store: SqliteStore) {}

  execute(operation: MemoryOperation): Record<string, unknown> {
    switch (operation.action) {
      case "put": {
        if (operation.key === undefined || operation.value === undefined) {
          throw new Error("memory_put_requires_key_and_value");
        }
        const now = new Date().toISOString();
        const redacted = redactMemoryValue(operation.value);
        const memory: MemoryRecord = {
          id: operation.id ?? randomUUID(),
          scope: operation.scope,
          key: operation.key,
          value: redacted.value,
          source: operation.source ?? "mcp-client",
          confidence: operation.confidence,
          createdAt: now,
          updatedAt: now,
        };
        const existing = this.store.getMemory(memory.id);
        if (existing !== undefined && existing.scope !== memory.scope) {
          throw new Error("memory_scope_mismatch");
        }
        this.store.putMemory(memory);
        return {
          stored: true,
          id: memory.id,
          scope: memory.scope,
          key: memory.key,
          redactions: redacted.redactions,
        };
      }
      case "search": {
        if (operation.query === undefined) {
          throw new Error("memory_search_requires_query");
        }
        return {
          memories: this.store.searchMemories(
            operation.scope,
            operation.query,
            operation.limit,
          ),
        };
      }
      case "list":
        return {
          memories: this.store.listMemories(operation.scope, operation.limit),
        };
      case "delete": {
        if (operation.id === undefined) {
          throw new Error("memory_delete_requires_id");
        }
        return {
          deleted: this.store.deleteMemory(operation.id, operation.scope),
          id: operation.id,
          scope: operation.scope,
        };
      }
      case "clear":
        return {
          cleared: this.store.clearMemories(operation.scope),
          scope: operation.scope,
        };
    }
  }
}
