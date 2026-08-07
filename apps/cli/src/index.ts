#!/usr/bin/env node
// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import {
  ApprovalResponseSchema,
  TaskRequestSchema,
  WorkflowDefinitionSchema,
  WorkflowInputSchema,
  PRODUCT_VERSION,
  type ApprovalResponse,
  type TaskRequest,
  type WorkflowDefinition,
  type WorkflowInput,
  type WorkflowRun,
} from "@melra/protocol";
import {
  createMelraRuntime,
  serveStdio,
  unconfinedRoot,
  type MelraRuntime,
} from "@melra/server";
import { detectBrowserExecutable } from "@melra/browser-runtime";
import { createSystemComputerAdapter } from "@melra/computer-runtime";
import { createDefaultPolicy, evaluatePolicy } from "@melra/policy-core";
import {
  type CliEnvironment,
  parseCliEnvironment,
  serverLaunch,
} from "./environment.js";

async function existingPolicyPath(env: CliEnvironment): Promise<string | undefined> {
  if (env.policyPath !== undefined) return env.policyPath;
  const candidate = join(env.dataDirectory, "policy.json");
  try {
    await access(candidate, constants.R_OK);
    return candidate;
  } catch {
    return undefined;
  }
}

/**
 * The banner unhinged mode prints before it does anything.
 *
 * It goes to stderr, which is where it has to go: in `serve` the stdout stream
 * is the MCP transport and any prose written there corrupts the protocol. stderr
 * is what MCP clients surface in their server logs, so the operator still sees
 * it. Ordinary runs get it too — the mode is per-process, not per-command, and a
 * developer who exported the variable in one shell and forgot deserves the
 * reminder on every invocation rather than only at startup.
 */
function unhingedBanner(root: string): string {
  return [
    "",
    "  ############################################################",
    "  #  MELRA IS RUNNING UNHINGED. NO GUARDRAILS ARE APPLIED.   #",
    "  ############################################################",
    "",
    "  Disabled for every task this process runs:",
    "    - policy decisions: nothing is denied, no approval is ever asked for",
    "    - the command allowlist, including shells and sudo",
    "    - the evidence requirement on mutations and destructive operations",
    "    - the browser's block on private, loopback, and cloud-metadata hosts",
    `    - workspace confinement: files and commands can reach all of ${root}`,
    "",
    "  A caller can now delete, overwrite, exfiltrate, or execute anything this",
    "  OS user can. Receipts are still written, so you will be able to read what",
    "  happened — after it has happened.",
    "",
    "  Turn it off by unsetting MELRA_UNHINGED and dropping --unhinged.",
    "",
  ].join("\n");
}

async function runtime(env: CliEnvironment): Promise<MelraRuntime> {
  const policyPath = await existingPolicyPath(env);
  return await createMelraRuntime({
    workspaceRoot: env.workspaceRoot,
    dataDirectory: env.dataDirectory,
    unhinged: env.unhinged,
    ...(policyPath === undefined ? {} : { policyPath }),
    ...(env.browserExecutablePath === undefined
      ? {}
      : { browserExecutablePath: env.browserExecutablePath }),
    ...(env.browserCdpEndpoint === undefined
      ? {}
      : { browserCdpEndpoint: env.browserCdpEndpoint }),
    ...(env.browserCdpContextIndex === undefined
      ? {}
      : { browserCdpContextIndex: env.browserCdpContextIndex }),
    ...(env.browserHarPath === undefined
      ? {}
      : { browserHarPath: env.browserHarPath }),
  });
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function argument(name: string, args: string[]): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function readTaskRequest(args: string[]): Promise<TaskRequest> {
  const requestPath = argument("--request", args);
  if (requestPath !== undefined) {
    return TaskRequestSchema.parse(
      JSON.parse(await readFile(resolve(requestPath), "utf8")),
    );
  }
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) input += String(chunk);
    return TaskRequestSchema.parse(JSON.parse(input));
  }
  throw new Error("provide --request <file> or pipe a JSON task request");
}

async function readWorkflowDefinition(
  args: string[],
): Promise<WorkflowDefinition> {
  const definitionPath = argument("--definition", args);
  if (definitionPath === undefined) {
    throw new Error("workflow plan requires --definition <file>");
  }
  return WorkflowDefinitionSchema.parse(
    JSON.parse(await readFile(resolve(definitionPath), "utf8")),
  );
}

function workflowExitCode(status: WorkflowRun["status"]): number {
  if (status === "awaiting_approval") return 3;
  // A run waiting on a person is not a failure — it is a prompt. Its own exit
  // code lets a script tell "answer me" apart from "approve me" and "broke".
  if (status === "awaiting_input") return 4;
  if (
    [
      "failed",
      "partially_complete",
      "cancelled",
      "recovery_required",
    ].includes(status)
  ) {
    return 2;
  }
  return 0;
}

// `--input <node-id>=<value>`. `=` rather than `:` because a node ID never
// contains one but an answer very often does (URLs, times, ratios).
function workflowInputs(args: string[]): WorkflowInput[] {
  const inputs: WorkflowInput[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--input") continue;
    const value = args[index + 1];
    if (value === undefined) throw new Error("--input requires a value");
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) {
      throw new Error("--input must be <node-id>=<value>");
    }
    inputs.push(
      WorkflowInputSchema.parse({
        nodeId: value.slice(0, separator),
        value: value.slice(separator + 1),
      }),
    );
    index += 1;
  }
  return inputs;
}

function workflowApprovals(args: string[]): ApprovalResponse[] {
  const approvals: ApprovalResponse[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--approval") continue;
    const value = args[index + 1];
    if (value === undefined) throw new Error("--approval requires a value");
    const separator = value.indexOf(":");
    if (separator < 1 || separator === value.length - 1) {
      throw new Error(
        "--approval must be <approval-id>:<exact-phrase>",
      );
    }
    approvals.push(
      ApprovalResponseSchema.parse({
        approvalId: value.slice(0, separator),
        phrase: value.slice(separator + 1),
      }),
    );
    index += 1;
  }
  return approvals;
}

async function workflowCommand(
  args: string[],
  env: CliEnvironment,
): Promise<number> {
  const [action, ...actionArgs] = args;
  const melra = await runtime(env);
  try {
    switch (action) {
      case "plan": {
        const run = melra.workflows.plan(
          await readWorkflowDefinition(actionArgs),
        );
        output(run);
        return workflowExitCode(run.status);
      }
      case "advance": {
        const workflowId = actionArgs[0];
        if (workflowId === undefined) {
          throw new Error("workflow advance requires a workflow ID");
        }
        const rest = actionArgs.slice(1);
        const result = await melra.workflows.advance(
          workflowId,
          workflowApprovals(rest),
          workflowInputs(rest),
        );
        output(result);
        return workflowExitCode(result.run.status);
      }
      case "inspect": {
        const workflowId = actionArgs[0];
        if (workflowId === undefined) {
          throw new Error("workflow inspect requires a workflow ID");
        }
        output(melra.workflows.status(workflowId));
        return 0;
      }
      case "cancel": {
        const workflowId = actionArgs[0];
        if (workflowId === undefined) {
          throw new Error("workflow cancel requires a workflow ID");
        }
        const run = melra.workflows.cancel(workflowId);
        output(run);
        return workflowExitCode(run.status);
      }
      case "pause":
      case "resume":
      case "suspend": {
        const workflowId = actionArgs[0];
        if (workflowId === undefined) {
          throw new Error(`workflow ${action} requires a workflow ID`);
        }
        const run =
          action === "pause"
            ? melra.workflows.pause(workflowId)
            : action === "suspend"
              ? melra.workflows.suspend(workflowId)
              : melra.workflows.resume(workflowId);
        output(run);
        return workflowExitCode(run.status);
      }
      default:
        throw new Error(
          "workflow supports plan, advance, inspect, cancel, pause, resume, and suspend",
        );
    }
  } finally {
    await melra.close();
  }
}

async function durableCoreDemo(env: CliEnvironment): Promise<number> {
  const examplePath = resolve(
    import.meta.dirname,
    "../../../examples/workflows/restart-safe.json",
  );
  const melra = await runtime(env);
  try {
    const definition = WorkflowDefinitionSchema.parse(
      JSON.parse(await readFile(examplePath, "utf8")),
    );
    const planned = melra.workflows.plan(definition);
    const advanced = await melra.workflows.advance(planned.id);
    output({
      examplePath,
      workflow: advanced.run,
      next:
        advanced.run.status === "verified_complete"
          ? "complete"
          : `melra workflow advance ${planned.id}`,
    });
    return workflowExitCode(advanced.run.status);
  } finally {
    await melra.close();
  }
}

async function doctor(env: CliEnvironment): Promise<{
  report: Record<string, unknown>;
  failed: boolean;
}> {
  const checks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }> = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({
    name: "node",
    status: major >= 22 ? "pass" : "fail",
    detail: process.version,
  });
  // A `warn`, not a `fail`: the operator asked for this, so `doctor` must still
  // exit zero. But a machine running with no guardrails should never be able to
  // report a clean bill of health without saying so.
  checks.push(
    env.unhinged
      ? {
          name: "guardrails",
          status: "warn",
          detail:
            "UNHINGED: no policy, approval, evidence, confinement, or destination check is applied",
        }
      : { name: "guardrails", status: "pass", detail: "enforced" },
  );
  try {
    await access(env.workspaceRoot, constants.R_OK | constants.W_OK);
    checks.push({
      name: "workspace",
      status: "pass",
      detail: env.workspaceRoot,
    });
  } catch {
    checks.push({
      name: "workspace",
      status: "fail",
      detail: `not readable and writable: ${env.workspaceRoot}`,
    });
  }
  try {
    await mkdir(env.dataDirectory, { recursive: true });
    await access(env.dataDirectory, constants.R_OK | constants.W_OK);
    checks.push({
      name: "data-directory",
      status: "pass",
      detail: env.dataDirectory,
    });
  } catch {
    checks.push({
      name: "data-directory",
      status: "fail",
      detail: env.dataDirectory,
    });
  }
  try {
    const database = new DatabaseSync(":memory:");
    database.exec("CREATE TABLE readiness(value TEXT)");
    database.close();
    checks.push({ name: "sqlite", status: "pass", detail: "node:sqlite available" });
  } catch (error) {
    checks.push({
      name: "sqlite",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  const browser = env.browserExecutablePath ?? (await detectBrowserExecutable());
  checks.push({
    name: "browser",
    status: browser === undefined ? "warn" : "pass",
    detail:
      browser ??
      "Chrome, Chromium, or Edge not found; non-browser capabilities remain available",
  });
  const computer = await createSystemComputerAdapter().capabilities();
  checks.push({
    name: "computer",
    status: computer.available ? "pass" : "warn",
    detail: computer.available
      ? `${computer.adapter}: screenshot=${computer.screenshot}, pointer=${computer.pointer}, keyboard=${computer.keyboard}, scroll=${computer.scroll}`
      : computer.limitations.join("; "),
  });
  try {
    const path = await existingPolicyPath(env);
    if (path !== undefined) JSON.parse(await readFile(path, "utf8"));
    checks.push({
      name: "policy",
      status: "pass",
      detail: path ?? "using safe built-in defaults",
    });
  } catch (error) {
    checks.push({
      name: "policy",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  const failed = checks.some((check) => check.status === "fail");
  return {
    report: {
      product: "MELRA",
      version: PRODUCT_VERSION,
      ready: !failed,
      // Alongside the `guardrails` check so a script does not have to read a
      // detail string to find out whether this machine has any.
      unhinged: env.unhinged,
      checks,
    },
    failed,
  };
}

async function init(
  args: string[],
  env: CliEnvironment,
): Promise<Record<string, unknown>> {
  await mkdir(env.dataDirectory, { recursive: true });
  const policyPath = join(env.dataDirectory, "policy.json");
  try {
    await access(policyPath, constants.F_OK);
  } catch {
    await writeFile(
      policyPath,
      `${JSON.stringify(createDefaultPolicy(env.workspaceRoot), null, 2)}\n`,
      { flag: "wx" },
    );
  }
  const client = argument("--client", args) ?? "generic";
  const config = {
    mcpServers: {
      melra: {
        ...serverLaunch(import.meta.dirname, PRODUCT_VERSION),
        env: {
          MELRA_WORKSPACE: env.workspaceRoot,
          MELRA_HOME: env.dataDirectory,
          MELRA_POLICY: policyPath,
        },
      },
    },
  };
  return {
    initialized: true,
    client,
    policyPath,
    config,
    note: `Add the mcpServers.melra entry to ${client}'s MCP configuration.`,
  };
}

// One command for the whole local setup: write the policy, emit a working
// client config, and verify the machine can actually run it.
async function setup(args: string[], env: CliEnvironment): Promise<number> {
  const initialized = await init(args, env);
  const { report, failed } = await doctor(env);
  output({ ...initialized, ...report });
  return failed ? 1 : 0;
}

async function runTask(args: string[], env: CliEnvironment): Promise<number> {
  const melra = await runtime(env);
  try {
    const task = melra.controller.plan(await readTaskRequest(args));
    if (task.status === "policy_blocked") {
      output({ task });
      return 4;
    }
    if (task.status === "awaiting_approval") {
      if (!process.stdin.isTTY) {
        output({ task, next: "rerun interactively to approve this scoped action" });
        return 3;
      }
      const prompt = createInterface({ input: process.stdin, output: process.stderr });
      const phrase = await prompt.question(
        `Type the exact approval phrase '${task.approval!.phrase}' to continue: `,
      );
      prompt.close();
      const execution = await melra.controller.execute(task.id, {
        approvalId: task.approval!.approvalId,
        phrase,
      });
      output(execution);
      return execution.task.status === "verified_success" ? 0 : 2;
    }
    const execution = await melra.controller.execute(task.id);
    output(execution);
    return execution.task.status === "verified_success" ? 0 : 2;
  } finally {
    await melra.close();
  }
}

async function inspectTask(args: string[], env: CliEnvironment): Promise<void> {
  const taskId = args[0];
  if (taskId === undefined) throw new Error("inspect requires a task ID");
  const melra = await runtime(env);
  try {
    output({
      task: melra.controller.status(taskId),
      ...melra.controller.receipts({ taskId }),
    });
  } finally {
    await melra.close();
  }
}

async function policyTest(args: string[], env: CliEnvironment): Promise<void> {
  const request = await readTaskRequest(args);
  // Reports what this process would actually decide, unhinged mode included —
  // a dry run that disagreed with the server it is previewing is worse than none.
  const policy = {
    ...createDefaultPolicy(env.workspaceRoot),
    unhinged: env.unhinged,
  };
  const taskId = "00000000-0000-4000-8000-000000000000";
  output(evaluatePolicy(taskId, request, policy));
}

function help(): void {
  process.stdout.write(`MELRA ${PRODUCT_VERSION}

Usage:
  melra setup [--client <claude|cursor|vscode|codex|generic>]
  melra doctor
  melra init --client <claude|cursor|vscode|codex|generic>
  melra serve
  melra run --request <task.json>
  melra inspect <task-id>
  melra workflow plan --definition <workflow.json>
  melra workflow advance <workflow-id> [--approval <id>:<exact-phrase>]
                                       [--input <node-id>=<value>]
  melra workflow inspect <workflow-id>
  melra workflow cancel <workflow-id>
  melra workflow pause|resume|suspend <workflow-id>
  melra demo durable-core
  melra policy test --request <task.json>
  melra version

Flags:
  --unhinged       Run with no policy and no guardrails. Everything the OS user
                   can do, any caller can now do. Same as MELRA_UNHINGED=1.

Environment:
  MELRA_WORKSPACE  Workspace boundary (default: current directory)
  MELRA_HOME       Local database and artifact directory
  MELRA_POLICY     Optional local policy JSON
  MELRA_UNHINGED   Set to 1 to disable every guardrail (see --unhinged)
  MELRA_BROWSER    Optional Chrome/Chromium/Edge executable
  MELRA_BROWSER_CDP_ENDPOINT       Optional HTTP(S) CDP endpoint
  MELRA_BROWSER_CDP_CONTEXT_INDEX  External context index (-1 is last)
  MELRA_BROWSER_HAR_PATH           Absolute HAR output path
`);
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  const parsed = parseCliEnvironment(process.env);
  // `--unhinged` is an alias for the variable, not a second setting: one field
  // carries the answer so no code path can consult the weaker of the two.
  const env: CliEnvironment = args.includes("--unhinged")
    ? { ...parsed, unhinged: true }
    : parsed;
  // Before the command runs, and for every command including `help` — the mode
  // is a property of the process, so there is no invocation where staying quiet
  // about it is right.
  if (env.unhinged) {
    process.stderr.write(
      `${unhingedBanner(unconfinedRoot(env.workspaceRoot))}\n`,
    );
  }
  switch (command) {
    case "doctor": {
      const { report, failed } = await doctor(env);
      output(report);
      process.exitCode = failed ? 1 : 0;
      return;
    }
    case "init":
      output(await init(args, env));
      return;
    case "setup":
      process.exitCode = await setup(args, env);
      return;
    case "serve": {
      const melra = await runtime(env);
      const server = await serveStdio(melra);
      const close = async () => {
        await server.close();
        await melra.close();
      };
      process.once("SIGINT", () => void close().finally(() => process.exit(0)));
      process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
      return;
    }
    case "run":
      process.exitCode = await runTask(args, env);
      return;
    case "inspect":
    case "export":
      await inspectTask(args, env);
      return;
    case "workflow":
      process.exitCode = await workflowCommand(args, env);
      return;
    case "demo":
      if (args[0] !== "durable-core") {
        throw new Error("demo supports only 'durable-core'");
      }
      process.exitCode = await durableCoreDemo(env);
      return;
    case "policy":
      if (args[0] !== "test") throw new Error("policy supports only 'test'");
      await policyTest(args.slice(1), env);
      return;
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(`${PRODUCT_VERSION}\n`);
      return;
    case "help":
    case "--help":
    case "-h":
      help();
      return;
    default:
      throw new Error(`unknown command: ${basename(command)}`);
  }
}

main().catch((error) => {
  process.stderr.write(
    `melra: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
