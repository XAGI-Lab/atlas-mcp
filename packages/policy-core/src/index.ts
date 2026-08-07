// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  ApprovalChallenge,
  ApprovalResponse,
  Effect,
  EvidencePredicate,
  Operation,
  PolicyDecision,
  Risk,
  TaskRequest,
} from "@melra/protocol";

export interface LocalPolicy {
  version: string;
  workspaceRoot: string;
  allowedCommands: string[];
  allowedDomains: string[];
  allowLocalhost: boolean;
  mutations: "deny" | "confirm";
  approvalTtlMs: number;
  maxFileBytes: number;
  /**
   * Switches off every guardrail this policy exists to apply: allowlists,
   * evidence requirements, approval challenges, and — through the runtimes
   * constructed from this policy — workspace confinement and the browser's
   * private-destination block.
   *
   * Off unless the operator asks for it twice, once through `MELRA_UNHINGED=1`
   * or `--unhinged` and once by accepting the banner the CLI prints. Nothing
   * derives it from another setting.
   */
  unhinged: boolean;
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
  "fish",
  "osascript",
  "powershell",
  "pwsh",
  "sh",
  "sudo",
  "su",
  "zsh",
]);

/**
 * Defaults tuned so a fresh install is usable without editing `policy.json`.
 *
 * `allowedDomains: ["*"]` is not the SSRF boundary and never was. `assertSafeUrl`
 * in `@melra/browser-runtime` independently rejects non-http(s) protocols, URL
 * credentials, private ranges, and cloud metadata (169.254/16), and it resolves
 * DNS before allowing a navigation so a public name cannot be rebound to a
 * private address. The domain list is a *narrowing* control on top of that guard,
 * for operators who want to restrict which public sites are reachable — it is not
 * what stops a browser from reaching the loopback interface.
 *
 * Defaulting it to `[]` made every single navigation fail with
 * `browser_domain_not_allowed` out of the box, which is why browser use was
 * reported as unusable. Operators who want an allowlist set one explicitly.
 */
/**
 * Reduce a command to the name the allowlist is written in.
 *
 * On Windows an executable is spelled with an extension (`npm.cmd`, `node.exe`,
 * `git.exe`), while allowlists are written bare. Comparing the raw basename made
 * every extension-qualified spelling fail, so Windows users had no working
 * spelling at all: bare `npm` passed policy but is a `.cmd` shim that does not
 * spawn, and `npm.cmd` spawns but was denied. Only the executable suffixes in
 * PATHEXT are stripped, so a command that merely contains a dot (`python3.11`)
 * is left intact.
 */
const EXECUTABLE_SUFFIXES = [".exe", ".cmd", ".bat", ".com", ".ps1"];

export function normalizeCommandName(command: string): string {
  const name = basename(command.replaceAll("\\", "/")).toLowerCase();
  const suffix = EXECUTABLE_SUFFIXES.find((item) => name.endsWith(item));
  return suffix === undefined ? name : name.slice(0, -suffix.length);
}

export function createDefaultPolicy(workspaceRoot: string): LocalPolicy {
  return {
    version: "1",
    workspaceRoot: resolve(workspaceRoot),
    // One list for every platform. An entry naming a program the host does not
    // have is inert — it fails at spawn with `terminal_command_not_found`, not
    // at policy — so the Windows and POSIX read tools can both sit here rather
    // than making the same policy mean different things on different machines.
    allowedCommands: [
      "cat",
      "echo",
      "findstr",
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
      "tasklist",
      "wc",
      "where",
    ],
    allowedDomains: ["*"],
    allowLocalhost: true,
    mutations: "confirm",
    approvalTtlMs: 5 * 60_000,
    maxFileBytes: 10 * 1024 * 1024,
    unhinged: false,
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
      const command = normalizeCommandName(operation.command ?? "");
      const gitRead =
        operation.action === "run" &&
        command === "git" &&
        operation.args.length > 0 &&
        READ_ONLY_GIT_ACTIONS.has(operation.args[0] ?? "");
      const readCommands = new Set([
        "cat",
        "findstr",
        "head",
        "ls",
        "pwd",
        "rg",
        "tail",
        "tasklist",
        "wc",
        "where",
      ]);
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
      // Navigation and observation read the world; only actions that drive the
      // page (click, type, upload, ...) change anything. `tab_new` and
      // `tab_switch` are classified with `navigate` for the same reason it is:
      // they move where we are looking, they do not act on a document. `wait`
      // joins them — it blocks until the page reaches a state, and blocking is
      // not acting.
      const read = new Set([
        "navigate",
        "back",
        "forward",
        "reload",
        "inspect",
        "wait",
        "screenshot",
        "tabs",
        "tab_new",
        "tab_switch",
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
    case "computer": {
      const read =
        operation.action === "capabilities" ||
        operation.action === "screenshot";
      return {
        effect: read ? "read" : "mutate",
        risk: read ? "low" : "high",
        capability: `computer.${operation.action}`,
        target:
          operation.action === "click" || operation.action === "move"
            ? `${operation.coordinateSpace}:${operation.x ?? "?"},${operation.y ?? "?"}`
            : "active-desktop",
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

/**
 * Evidence a mutation must satisfy when the caller declared none.
 *
 * Mutations still require evidence — that rule is the product's verification
 * thesis and is not relaxed here. What changed is the failure mode: previously a
 * caller who omitted `requiredEvidence` got a flat `mutation_requires_evidence`
 * deny and had to guess the right predicate, so most callers simply gave up. Now
 * the obvious post-condition is derived from the operation itself, and the task
 * is held to it exactly as if the caller had written it.
 *
 * Returns `[]` when no post-condition is derivable from the request alone (for
 * example a `terminal run`, whose effect depends on the command). Those still
 * deny, because a mutation nobody can check is precisely what should not run
 * unattended.
 */
export function defaultEvidenceFor(
  operation: Operation,
): EvidencePredicate[] {
  // Reads are never denied for missing evidence and already fall back to a
  // synthetic `operation_completed` item, so synthesizing a predicate for them
  // would only invent a way for a successful read to verify as `partial`.
  if (classifyOperation(operation).effect === "read") return [];
  switch (operation.kind) {
    case "file":
      switch (operation.action) {
        case "write":
        case "mkdir":
          return [{ type: "file_exists", path: operation.path }];
        case "delete":
          return [{ type: "file_absent", path: operation.path }];
        case "move":
          return operation.destination === undefined
            ? []
            : [
                { type: "file_absent", path: operation.path },
                { type: "file_exists", path: operation.destination },
              ];
        default:
          return [];
      }
    case "memory":
      // Field names differ per action; each is the adapter's own report that the
      // record actually changed, so a silent no-op cannot pass as a success.
      // `clear` returns a count rather than a flag, so it has no boolean
      // post-condition to assert.
      return operation.action === "put"
        ? [{ type: "result_equals", path: "stored", value: true }]
        : operation.action === "delete"
          ? [{ type: "result_equals", path: "deleted", value: true }]
          : [];
    case "browser":
    case "computer":
      // These adapters report an explicit `success` flag; hold the task to it
      // rather than letting a silent no-op pass as a completed action.
      return [{ type: "result_equals", path: "success", value: true }];
    default:
      return [];
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
  const command = normalizeCommandName(operation.command);
  // Normalized on both sides so `powershell.exe` cannot slip past a deny entry
  // written as `powershell`, and an operator's allowlist matches either spelling.
  if (ALWAYS_DENIED_COMMANDS.has(command)) return false;
  return policy.allowedCommands.some(
    (allowed) => normalizeCommandName(allowed) === command,
  );
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

  // Unhinged mode allows everything the operator did not forbid in this very
  // request. It sits after the `forbiddenEffects` check on purpose: that field
  // is the caller declaring a limit on its own task, not a guardrail MELRA
  // imposes, and a caller that asked for no destructive effects should still get
  // none. Everything below — allowlists, evidence, approval — is MELRA's own
  // judgement, and unhinged mode is the operator saying they do not want it.
  if (policy.unhinged) {
    return {
      decision: {
        outcome: "allow",
        effect: classified.effect,
        risk: classified.risk,
        reason: "unhinged_mode_no_guardrails",
        policyVersion: policy.version,
      },
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
