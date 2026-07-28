// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  ApprovalChallenge,
  ApprovalResponse,
  Effect,
  Operation,
  PolicyDecision,
  Risk,
  TaskRequest,
} from "@atlas-mcp/protocol";

export interface LocalPolicy {
  version: string;
  workspaceRoot: string;
  allowedCommands: string[];
  allowedDomains: string[];
  allowLocalhost: boolean;
  mutations: "deny" | "confirm";
  approvalTtlMs: number;
  maxFileBytes: number;
}

export interface PolicyEvaluation {
  decision: PolicyDecision;
  challenge?: ApprovalChallenge;
}

const READ_ONLY_GIT_ACTIONS = new Set([
  "branch",
  "diff",
  "log",
  "rev-parse",
  "show",
  "status",
  "tag",
]);

const ALWAYS_DENIED_COMMANDS = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "fish",
  "osascript",
  "powershell",
  "pwsh",
  "sh",
  "sudo",
  "su",
  "zsh",
]);

export function createDefaultPolicy(workspaceRoot: string): LocalPolicy {
  return {
    version: "1",
    workspaceRoot: resolve(workspaceRoot),
    allowedCommands: [
      "cat",
      "echo",
      "git",
      "head",
      "ls",
      "node",
      "npm",
      "npx",
      "pnpm",
      "pwd",
      "rg",
      "tail",
      "wc",
    ],
    allowedDomains: [],
    allowLocalhost: false,
    mutations: "confirm",
    approvalTtlMs: 5 * 60_000,
    maxFileBytes: 10 * 1024 * 1024,
  };
}

export async function loadPolicy(
  path: string | undefined,
  workspaceRoot: string,
): Promise<LocalPolicy> {
  const defaults = createDefaultPolicy(workspaceRoot);
  if (path === undefined) return defaults;
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<LocalPolicy>;
  return {
    ...defaults,
    ...parsed,
    workspaceRoot: resolve(parsed.workspaceRoot ?? workspaceRoot),
    allowedCommands: parsed.allowedCommands ?? defaults.allowedCommands,
    allowedDomains: parsed.allowedDomains ?? defaults.allowedDomains,
  };
}

export function classifyOperation(operation: Operation): {
  effect: Effect;
  risk: Risk;
  capability: string;
  target: string;
} {
  switch (operation.kind) {
    case "file": {
      const read = new Set(["list", "read", "stat", "hash"]).has(operation.action);
      const destructive = operation.action === "delete";
      return {
        effect: destructive ? "destructive" : read ? "read" : "mutate",
        risk: destructive ? "high" : read ? "low" : "medium",
        capability: `file.${operation.action}`,
        target: operation.path,
      };
    }
    case "terminal": {
      if (operation.action === "status" || operation.action === "output") {
        return {
          effect: "read",
          risk: "low",
          capability: `terminal.${operation.action}`,
          target: `job:${operation.jobId ?? "unknown"}`,
        };
      }
      const command = basename(operation.command ?? "");
      const gitRead =
        operation.action === "run" &&
        command === "git" &&
        operation.args.length > 0 &&
        READ_ONLY_GIT_ACTIONS.has(operation.args[0] ?? "");
      const readCommands = new Set(["cat", "head", "ls", "pwd", "rg", "tail", "wc"]);
      const read = readCommands.has(command) || gitRead;
      const packageMutation = new Set(["npm", "npx", "pnpm"]).has(command);
      return {
        effect: read ? "read" : "mutate",
        risk: packageMutation ? "high" : read ? "low" : "medium",
        capability: `terminal.${operation.action}`,
        target:
          operation.action === "stop"
            ? `job:${operation.jobId ?? "unknown"}`
            : `command:${command}`,
      };
    }
    case "browser": {
      const read = new Set([
        "navigate",
        "inspect",
        "screenshot",
        "tabs",
        "scroll",
      ]).has(operation.action);
      return {
        effect: read ? "read" : "mutate",
        risk: read ? "low" : "medium",
        capability: `browser.${operation.action}`,
        target:
          operation.url === undefined
            ? operation.target?.selector ??
              operation.target?.name ??
              "active-page"
            : (() => {
                const target = new URL(operation.url);
                target.search = "";
                target.hash = "";
                return target.toString();
              })(),
      };
    }
    case "memory": {
      const read = operation.action === "search" || operation.action === "list";
      const destructive = operation.action === "delete" || operation.action === "clear";
      return {
        effect: destructive ? "destructive" : read ? "read" : "mutate",
        risk: destructive ? "high" : read ? "low" : "medium",
        capability: `memory.${operation.action}`,
        target: `${operation.scope}:${operation.action}:${
          operation.id ?? operation.key ?? "*"
        }`,
      };
    }
    case "system":
      return {
        effect: "read",
        risk: "low",
        capability: "system.info",
        target: "local-system",
      };
  }
}

function deny(effect: Effect, risk: Risk, reason: string, version: string): PolicyDecision {
  return { outcome: "deny", effect, risk, reason, policyVersion: version };
}

function isCommandAllowed(operation: Operation, policy: LocalPolicy): boolean {
  if (operation.kind !== "terminal") return true;
  if (operation.action === "status" || operation.action === "output") {
    return operation.jobId !== undefined;
  }
  if (operation.action === "stop") return operation.jobId !== undefined;
  if (operation.command === undefined) return false;
  const command = basename(operation.command).toLowerCase();
  if (ALWAYS_DENIED_COMMANDS.has(command)) return false;
  return policy.allowedCommands.includes(command);
}

function domainAllowed(operation: Operation, policy: LocalPolicy): boolean {
  if (operation.kind !== "browser" || operation.url === undefined) return true;
  const url = new URL(operation.url);
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return policy.allowLocalhost;
  return policy.allowedDomains.some(
    (domain) =>
      domain === "*" ||
      host === domain.toLowerCase() ||
      host.endsWith(`.${domain.toLowerCase()}`),
  );
}

export function evaluatePolicy(
  taskId: string,
  request: TaskRequest,
  policy: LocalPolicy,
): PolicyEvaluation {
  const classified = classifyOperation(request.operation);

  if (request.constraints.length > 0) {
    return {
      decision: deny(
        classified.effect,
        classified.risk,
        "freeform_constraints_not_enforceable",
        policy.version,
      ),
    };
  }

  if (request.forbiddenEffects.includes(classified.effect)) {
    return {
      decision: deny(
        classified.effect,
        classified.risk,
        "effect_forbidden_by_request",
        policy.version,
      ),
    };
  }

  if (!isCommandAllowed(request.operation, policy)) {
    return {
      decision: deny(
        classified.effect,
        "critical",
        "command_not_allowlisted",
        policy.version,
      ),
    };
  }

  if (!domainAllowed(request.operation, policy)) {
    return {
      decision: deny(
        classified.effect,
        "high",
        "browser_domain_not_allowed",
        policy.version,
      ),
    };
  }

  if (classified.effect !== "read" && request.requiredEvidence.length === 0) {
    return {
      decision: deny(
        classified.effect,
        classified.risk,
        "mutation_requires_evidence",
        policy.version,
      ),
    };
  }

  if (classified.effect === "read") {
    return {
      decision: {
        outcome: "allow",
        effect: classified.effect,
        risk: classified.risk,
        reason: "read_only_operation",
        policyVersion: policy.version,
      },
    };
  }

  if (policy.mutations === "deny") {
    return {
      decision: deny(
        classified.effect,
        classified.risk,
        "mutations_disabled",
        policy.version,
      ),
    };
  }

  const digest = digestOperation(taskId, request.operation);
  const approvalId = randomUUID();
  const phrase = `APPROVE ${digest.slice(0, 12)}`;
  return {
    decision: {
      outcome: "confirm",
      effect: classified.effect,
      risk: classified.risk,
      reason: "explicit_approval_required",
      policyVersion: policy.version,
    },
    challenge: {
      approvalId,
      taskId,
      actionDigest: digest,
      phrase,
      expiresAt: new Date(Date.now() + policy.approvalTtlMs).toISOString(),
    },
  };
}

export function digestOperation(taskId: string, operation: Operation): string {
  return createHash("sha256")
    .update(stableJson({ taskId, operation }))
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

export function validateApproval(
  challenge: ApprovalChallenge | undefined,
  response: ApprovalResponse | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (challenge === undefined || response === undefined) {
    return { ok: false, reason: "approval_required" };
  }
  if (challenge.approvalId !== response.approvalId) {
    return { ok: false, reason: "approval_id_mismatch" };
  }
  if (challenge.phrase !== response.phrase) {
    return { ok: false, reason: "approval_phrase_mismatch" };
  }
  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    return { ok: false, reason: "approval_expired" };
  }
  return { ok: true };
}
