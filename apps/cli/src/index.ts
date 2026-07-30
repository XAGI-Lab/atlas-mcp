#!/usr/bin/env node
// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import {
  TaskRequestSchema,
  PRODUCT_VERSION,
  type TaskRequest,
} from "@melra/protocol";
import {
  createMelraRuntime,
  serveStdio,
  type MelraRuntime,
} from "@melra/server";
import { detectBrowserExecutable } from "@melra/browser-runtime";
import { createSystemComputerAdapter } from "@melra/computer-runtime";
import { createDefaultPolicy, evaluatePolicy } from "@melra/policy-core";
import {
  type CliEnvironment,
  parseCliEnvironment,
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

async function runtime(env: CliEnvironment): Promise<MelraRuntime> {
  const policyPath = await existingPolicyPath(env);
  return await createMelraRuntime({
    workspaceRoot: env.workspaceRoot,
    dataDirectory: env.dataDirectory,
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

async function doctor(env: CliEnvironment): Promise<number> {
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
  output({
    product: "MELRA",
    version: PRODUCT_VERSION,
    ready: !checks.some((check) => check.status === "fail"),
    checks,
  });
  return checks.some((check) => check.status === "fail") ? 1 : 0;
}

async function init(args: string[], env: CliEnvironment): Promise<void> {
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
        command: "melra",
        args: ["serve"],
        env: {
          MELRA_WORKSPACE: env.workspaceRoot,
          MELRA_HOME: env.dataDirectory,
          MELRA_POLICY: policyPath,
        },
      },
    },
  };
  output({
    initialized: true,
    client,
    policyPath,
    config,
    note: `Add the mcpServers.melra entry to ${client}'s MCP configuration.`,
  });
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
  const policy = createDefaultPolicy(env.workspaceRoot);
  const taskId = "00000000-0000-4000-8000-000000000000";
  output(evaluatePolicy(taskId, request, policy));
}

function help(): void {
  process.stdout.write(`MELRA ${PRODUCT_VERSION}

Usage:
  melra doctor
  melra init --client <claude|cursor|vscode|codex|generic>
  melra serve
  melra run --request <task.json>
  melra inspect <task-id>
  melra policy test --request <task.json>
  melra version

Environment:
  MELRA_WORKSPACE  Workspace boundary (default: current directory)
  MELRA_HOME       Local database and artifact directory
  MELRA_POLICY     Optional local policy JSON
  MELRA_BROWSER    Optional Chrome/Chromium/Edge executable
  MELRA_BROWSER_CDP_ENDPOINT       Optional HTTP(S) CDP endpoint
  MELRA_BROWSER_CDP_CONTEXT_INDEX  External context index (-1 is last)
  MELRA_BROWSER_HAR_PATH           Absolute HAR output path
`);
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  const env = parseCliEnvironment(process.env);
  switch (command) {
    case "doctor":
      process.exitCode = await doctor(env);
      return;
    case "init":
      await init(args, env);
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
