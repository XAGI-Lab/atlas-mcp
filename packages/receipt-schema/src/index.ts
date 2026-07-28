// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";

const SENSITIVE_KEY =
  /^(?:args?|authorization|constraints|content|cookie|env|goal|headers?|pass(?:word|wd)?|secret|std(?:out|err)|text|token|api[_-]?key|values?)$/i;
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bgh[opurs]_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\b(?:sk|pk|api)[-_][a-z0-9_-]{16,}\b/gi, "[REDACTED_API_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi, "Bearer [REDACTED_TOKEN]"],
  [/\b(password|passwd|secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]"],
];

export type CertificateResult =
  | "VERIFIED_SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED"
  | "WAITING_APPROVAL"
  | "WAITING_USER"
  | "POLICY_BLOCKED"
  | "BUDGET_EXHAUSTED";

export interface EvidenceItem {
  type: string;
  passed: boolean;
  summary: string;
  source?: string;
  digest?: string;
}

export interface ActionReceipt {
  schemaVersion: "1.0.0";
  receiptId: string;
  taskId: string;
  capability: string;
  effect: "read" | "mutate" | "destructive";
  policyDecision: {
    outcome: "allow" | "deny" | "confirm";
    policyVersion: string;
    approvalId?: string;
  };
  target: string;
  inputDigest: string;
  startedAt: string;
  endedAt: string;
  success: boolean;
  observedEffect: Record<string, unknown>;
  evidence: EvidenceItem[];
  redactions: string[];
  error?: string;
}

export interface ExecutionCertificate {
  schemaVersion: "1.0.0";
  certificateId: string;
  taskId: string;
  goal: string;
  result: CertificateResult;
  policyVersion: string;
  receiptIds: string[];
  evidence: EvidenceItem[];
  createdAt: string;
  digest: string;
}

export function redactStructuredValue(value: unknown): {
  value: unknown;
  redactions: string[];
} {
  const redactions = new Set<string>();
  const redactWholeValue = (current: unknown): unknown => {
    redactions.add("[REDACTED_SENSITIVE_FIELD]");
    if (Array.isArray(current)) {
      return current.map(() => "[REDACTED_SENSITIVE_FIELD]");
    }
    if (current !== null && typeof current === "object") {
      return Object.fromEntries(
        Object.keys(current).map((entryKey) => [
          entryKey,
          "[REDACTED_SENSITIVE_FIELD]",
        ]),
      );
    }
    return "[REDACTED_SENSITIVE_FIELD]";
  };
  const visit = (current: unknown, key?: string): unknown => {
    if (key !== undefined && SENSITIVE_KEY.test(key)) {
      return redactWholeValue(current);
    }
    if (key === "url" && typeof current === "string") {
      try {
        const url = new URL(current);
        if (url.search !== "" || url.hash !== "") {
          redactions.add("[REDACTED_URL_QUERY]");
          url.search = "";
          url.hash = "";
        }
        return url.toString();
      } catch {
        // Non-URL strings continue through normal pattern redaction.
      }
    }
    if (typeof current === "string") {
      let redacted = current;
      for (const [pattern, replacement] of SECRET_PATTERNS) {
        const before = redacted;
        redacted = redacted.replace(pattern, replacement);
        if (redacted !== before) redactions.add(replacement);
      }
      return redacted;
    }
    if (Array.isArray(current)) {
      return current.map((item) => visit(item));
    }
    if (current !== null && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current).map(([entryKey, entryValue]) => [
          entryKey,
          visit(entryValue, entryKey),
        ]),
      );
    }
    return current;
  };
  return { value: visit(value), redactions: [...redactions] };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function createReceiptId(): string {
  return randomUUID();
}

export function createCertificate(
  input: Omit<ExecutionCertificate, "schemaVersion" | "certificateId" | "digest">,
): ExecutionCertificate {
  const certificateId = randomUUID();
  const base = {
    schemaVersion: "1.0.0" as const,
    certificateId,
    ...input,
  };
  return { ...base, digest: sha256(base) };
}
