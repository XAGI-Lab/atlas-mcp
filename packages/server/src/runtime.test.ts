// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskRequestSchema, type TaskRequest } from "@melra/protocol";
import {
  createMelraRuntime,
  unconfinedRoot,
  unhingedFromEnvironment,
  type MelraRuntime,
} from "./runtime.js";

// Parse rather than hand-build: `TaskRequest` is the post-defaults shape, so a
// literal has to restate every default the schema already knows.
function request(overrides: Record<string, unknown>): TaskRequest {
  return TaskRequestSchema.parse({ goal: "Unhinged mode test", ...overrides });
}

describe("unhingedFromEnvironment", () => {
  it("accepts only the affirmative spellings", () => {
    for (const value of ["1", "true", "TRUE", "yes"]) {
      expect(unhingedFromEnvironment({ MELRA_UNHINGED: value })).toBe(true);
    }
    // Anything else is off, so a typo or a leftover `MELRA_UNHINGED=0` cannot
    // silently drop every guardrail.
    for (const value of ["0", "false", "no", "off", "", "maybe"]) {
      expect(unhingedFromEnvironment({ MELRA_UNHINGED: value })).toBe(false);
    }
    expect(unhingedFromEnvironment({})).toBe(false);
  });
});

describe("unconfinedRoot", () => {
  it("is the filesystem root of the path it is given", () => {
    const root = parse(resolve(tmpdir())).root;
    expect(unconfinedRoot(tmpdir())).toBe(root);
    expect(unconfinedRoot(join(tmpdir(), "a", "b", "c"))).toBe(root);
  });
});

describe("unhinged runtime", () => {
  let base: string;
  let workspace: string;
  let data: string;
  let outside: string;
  let runtime: MelraRuntime | undefined;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "melra-unhinged-"));
    workspace = join(base, "workspace");
    data = join(base, "data");
    outside = join(base, "outside.txt");
    await mkdir(workspace, { recursive: true });
    await writeFile(outside, "reachable", "utf8");
  });

  afterEach(async () => {
    await runtime?.close();
    runtime = undefined;
    await rm(base, { recursive: true, force: true });
  });

  it("keeps every guardrail on by default", async () => {
    runtime = await createMelraRuntime({
      workspaceRoot: workspace,
      dataDirectory: data,
      environment: {},
    });
    expect(runtime.policy.unhinged).toBe(false);

    // A shell is denied unconditionally under policy, before any adapter runs.
    const shell = runtime.controller.plan(
      request({
        operation: { kind: "terminal", action: "run", command: "sh", args: [] },
        requiredEvidence: [{ type: "exit_code", value: 0 }],
      }),
    );
    expect(shell.policyDecision.outcome).toBe("deny");
    expect(shell.policyDecision.reason).toBe("command_not_allowlisted");

    // Confined runtime, absolute path outside it: the read is refused by the
    // file runtime even though policy allows reads.
    const read = runtime.controller.plan(
      request({ operation: { kind: "file", action: "read", path: outside } }),
    );
    const result = await runtime.controller.execute(read.id);
    expect(result.task.status).not.toBe("verified_success");
  });

  it("reads outside the workspace and allows a shell when unhinged", async () => {
    runtime = await createMelraRuntime({
      workspaceRoot: workspace,
      dataDirectory: data,
      environment: {},
      unhinged: true,
    });
    expect(runtime.policy.unhinged).toBe(true);

    const read = runtime.controller.plan(
      request({ operation: { kind: "file", action: "read", path: outside } }),
    );
    expect(read.policyDecision.outcome).toBe("allow");
    const readResult = await runtime.controller.execute(read.id);
    expect(readResult.task.status).toBe("verified_success");

    // Evidence-free destruction: allowed, unapproved, and still reported as
    // destructive so the receipt does not understate what was permitted.
    const destroy = runtime.controller.plan(
      request({
        operation: { kind: "file", action: "delete", path: "anything" },
      }),
    );
    expect(destroy.policyDecision.outcome).toBe("allow");
    expect(destroy.policyDecision.reason).toBe("unhinged_mode_no_guardrails");
    expect(destroy.policyDecision.effect).toBe("destructive");
    expect(destroy.approval).toBeUndefined();

    const shell = runtime.controller.plan(
      request({
        operation: {
          kind: "terminal",
          action: "run",
          command: "sh",
          args: ["-c", "exit 0"],
        },
      }),
    );
    expect(shell.policyDecision.outcome).toBe("allow");
  });

  it("turns on from the environment alone", async () => {
    runtime = await createMelraRuntime({
      workspaceRoot: workspace,
      dataDirectory: data,
      environment: { MELRA_UNHINGED: "1" },
    });
    expect(runtime.policy.unhinged).toBe(true);
  });
});
