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

export interface RankedMemory extends MemoryRecord {
  score: number;
  scoreBreakdown: {
    lexical: number;
    phrase: number;
    confidence: number;
    freshness: number;
    diversityPenalty: number;
  };
}

const DAY_MS = 86_400_000;
const DEFAULT_HALF_LIFE_DAYS = 30;
const MAX_CANDIDATES = 5_000;

export function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function termFrequency(tokens: string[], term: string): number {
  return tokens.reduce((count, token) => count + Number(token === term), 0);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function freshness(updatedAt: string, nowMs: number): number {
  const ageDays = Math.max(0, nowMs - Date.parse(updatedAt)) / DAY_MS;
  return Math.exp((-Math.LN2 * ageDays) / DEFAULT_HALF_LIFE_DAYS);
}

/**
 * Deterministic local retrieval with inspectable scoring and no model call.
 *
 * The first pass combines BM25-style term evidence, exact phrase matching,
 * provenance confidence, and freshness. The second pass applies a bounded
 * maximal-marginal-relevance penalty so repeated records do not crowd out
 * distinct evidence.
 */
export function rankMemories(
  records: MemoryRecord[],
  query: string,
  limit: number,
  nowMs = Date.now(),
): RankedMemory[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];
  const documents = records.map((record) => ({
    record,
    tokens: tokenize(`${record.key} ${record.value} ${record.tags.join(" ")}`),
  }));
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const token of new Set(document.tokens)) {
      documentFrequency.set(
        token,
        (documentFrequency.get(token) ?? 0) + 1,
      );
    }
  }
  const averageLength =
    documents.reduce((total, document) => total + document.tokens.length, 0) /
    Math.max(1, documents.length);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const scored = documents
    .map(({ record, tokens }) => {
      let lexical = 0;
      for (const term of queryTokens) {
        const containing = documentFrequency.get(term) ?? 0;
        const idf = Math.log(
          1 + (documents.length - containing + 0.5) / (containing + 0.5),
        );
        const frequency = termFrequency(tokens, term);
        const denominator =
          frequency +
          1.2 *
            (1 - 0.75 + 0.75 * (tokens.length / Math.max(1, averageLength)));
        lexical +=
          frequency === 0 ? 0 : idf * ((frequency * 2.2) / denominator);
      }
      const normalizedLexical = lexical / Math.max(1, queryTokens.length);
      const phrase = `${record.key} ${record.value}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
        ? 1
        : 0;
      const fresh = freshness(record.updatedAt, nowMs);
      const base =
        normalizedLexical * 0.62 +
        phrase * 0.16 +
        record.confidence * 0.14 +
        fresh * 0.08;
      return {
        record,
        tokenSet: new Set(tokens),
        base,
        normalizedLexical,
        phrase,
        fresh,
      };
    })
    .filter(
      (candidate) =>
        candidate.normalizedLexical > 0 || candidate.phrase > 0,
    )
    .sort(
      (left, right) =>
        right.base - left.base ||
        right.record.updatedAt.localeCompare(left.record.updatedAt),
    );

  const selected: Array<{
    candidate: (typeof scored)[number];
    ranked: RankedMemory;
  }> = [];
  const remaining = scored.map((candidate) => ({
    candidate,
    maxSimilarity: 0,
  }));
  const diversityDepth = Math.min(limit, 20);
  while (remaining.length > 0 && selected.length < diversityDepth) {
    let bestIndex = 0;
    let bestAdjusted = Number.NEGATIVE_INFINITY;
    let bestPenalty = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index]!;
      const candidate = entry.candidate;
      const penalty = entry.maxSimilarity;
      const adjusted = candidate.base * 0.88 - penalty * 0.12;
      if (
        adjusted > bestAdjusted ||
        (adjusted === bestAdjusted &&
          candidate.record.updatedAt >
            remaining[bestIndex]!.candidate.record.updatedAt)
      ) {
        bestIndex = index;
        bestAdjusted = adjusted;
        bestPenalty = penalty;
      }
    }
    const [entry] = remaining.splice(bestIndex, 1);
    if (entry === undefined) break;
    const candidate = entry.candidate;
    selected.push({
      candidate,
      ranked: {
        ...candidate.record,
        score: Number(bestAdjusted.toFixed(6)),
        scoreBreakdown: {
          lexical: Number(candidate.normalizedLexical.toFixed(6)),
          phrase: candidate.phrase,
          confidence: candidate.record.confidence,
          freshness: Number(candidate.fresh.toFixed(6)),
          diversityPenalty: Number(bestPenalty.toFixed(6)),
        },
      },
    });
    for (const remainingEntry of remaining) {
      remainingEntry.maxSimilarity = Math.max(
        remainingEntry.maxSimilarity,
        jaccard(remainingEntry.candidate.tokenSet, candidate.tokenSet),
      );
    }
  }
  for (
    let index = 0;
    index < remaining.length && selected.length < limit;
    index += 1
  ) {
    const candidate = remaining[index]!.candidate;
    selected.push({
      candidate,
      ranked: {
        ...candidate.record,
        score: Number((candidate.base * 0.88).toFixed(6)),
        scoreBreakdown: {
          lexical: Number(candidate.normalizedLexical.toFixed(6)),
          phrase: candidate.phrase,
          confidence: candidate.record.confidence,
          freshness: Number(candidate.fresh.toFixed(6)),
          diversityPenalty: 0,
        },
      },
    });
  }
  return selected.map(({ ranked }) => ranked);
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
        const existing =
          operation.id === undefined
            ? undefined
            : this.store.getMemory(operation.id);
        if (existing !== undefined && existing.scope !== operation.scope) {
          throw new Error("memory_scope_mismatch");
        }
        if (existing?.supersededBy !== undefined) {
          throw new Error("memory_superseded_record_immutable");
        }
        const superseded =
          operation.supersedesId === undefined
            ? undefined
            : this.store.getMemory(operation.supersedesId);
        if (
          operation.supersedesId !== undefined &&
          (superseded === undefined ||
            superseded.scope !== operation.scope ||
            operation.supersedesId === operation.id)
        ) {
          throw new Error("memory_supersedes_target_invalid");
        }
        const memory: MemoryRecord = {
          id: operation.id ?? randomUUID(),
          scope: operation.scope,
          key: operation.key,
          value: redacted.value,
          source: operation.source ?? "mcp-client",
          confidence: operation.confidence,
          tags: operation.tags,
          ...(operation.expiresAt === undefined
            ? {}
            : { expiresAt: operation.expiresAt }),
          ...(operation.supersedesId === undefined
            ? {}
            : { supersedesId: operation.supersedesId }),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        this.store.putMemory(memory);
        if (
          operation.supersedesId !== undefined &&
          !this.store.supersedeMemory(
            operation.supersedesId,
            operation.scope,
            memory.id,
          )
        ) {
          this.store.deleteMemory(memory.id, memory.scope);
          throw new Error("memory_supersedes_target_invalid");
        }
        return {
          stored: true,
          id: memory.id,
          scope: memory.scope,
          key: memory.key,
          tags: memory.tags,
          expiresAt: memory.expiresAt ?? null,
          supersedesId: memory.supersedesId ?? null,
          redactions: redacted.redactions,
        };
      }
      case "search": {
        if (operation.query === undefined) {
          throw new Error("memory_search_requires_query");
        }
        const candidates = this.store.memoryCandidates(
          operation.scope,
          MAX_CANDIDATES,
          operation.includeSuperseded,
        );
        return {
          memories: rankMemories(
            candidates,
            operation.query,
            operation.limit,
          ),
          candidateCount: candidates.length,
          ranking: "atlas-hybrid-v1",
        };
      }
      case "list":
        return {
          memories: this.store.listMemories(
            operation.scope,
            operation.limit,
            operation.includeSuperseded,
          ),
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
