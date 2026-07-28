#!/usr/bin/env node
// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import {
  TaskRequestSchema,
  PRODUCT_VERSION,
  type TaskRequest,
} from "@atlas-mcp/protocol";
import {
  createAtlasRuntime,
  serveStdio,
  type AtlasRuntime,
} from "@atlas-mcp/server";
import { detectBrowserExecutable } from "@atlas-mcp/browser-runtime";
import { createDefaultPolicy, evaluatePolicy } from "@atlas-mcp/policy-core";

interface CliEnvironment {
  workspaceRoot: string;
  dataDirectory: string;
  policyPath?: string;
  browserExecutablePath?: string;
}

function environment(): CliEnvironment {
  const workspaceRoot = resolve(process.env.ATLAS_MCP_WORKSPACE ?? process.cwd());
  const dataDirectory = resolve(
    process.env.ATLAS_MCP_HOME ?? join(homedir(), ".atlas-mcp"),
  );
  return {
    workspaceRoot,
    dataDirectory,
    ...(process.env.ATLAS_MCP_POLICY === undefined
      ? {}
      : { policyPath: resolve(process.env.ATLAS_MCP_POLICY) }),
    ...(process.env.ATLAS_MCP_BROWSER === undefined
      ? {}
      : { browserExecutablePath: resolve(process.env.ATLAS_MCP_BROWSER) }),
  };
}

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

async function runtime(env: CliEnvironment): Promise<AtlasRuntime> {
  const policyPath = await existingPolicyPath(env);
  return await createAtlasRuntime({
    workspaceRoot: env.workspaceRoot,
    dataDirectory: env.dataDirectory,
    ...(policyPath === undefined ? {} : { policyPath }),
    ...(env.browserExecutablePath === undefined
      ? {}
      : { browserExecutablePath: env.browserExecutablePath }),
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
    product: "ATLAS MCP",
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
      atlas: {
        command: "atlas-mcp",
        args: ["serve"],
        env: {
          ATLAS_MCP_WORKSPACE: env.workspaceRoot,
          ATLAS_MCP_HOME: env.dataDirectory,
          ATLAS_MCP_POLICY: policyPath,
        },
      },
    },
  };
  output({
    initialized: true,
    client,
    policyPath,
    config,
    note: `Add the mcpServers.atlas entry to ${client}'s MCP configuration.`,
  });
}

async function runTask(args: string[], env: CliEnvironment): Promise<number> {
  const atlas = await runtime(env);
  try {
    const task = atlas.controller.plan(await readTaskRequest(args));
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
      const execution = await atlas.controller.execute(task.id, {
        approvalId: task.approval!.approvalId,
        phrase,
      });
      output(execution);
      return execution.task.status === "verified_success" ? 0 : 2;
    }
    const execution = await atlas.controller.execute(task.id);
    output(execution);
    return execution.task.status === "verified_success" ? 0 : 2;
  } finally {
    await atlas.close();
  }
}

async function inspectTask(args: string[], env: CliEnvironment): Promise<void> {
  const taskId = args[0];
  if (taskId === undefined) throw new Error("inspect requires a task ID");
  const atlas = await runtime(env);
  try {
    output({
      task: atlas.controller.status(taskId),
      ...atlas.controller.receipts({ taskId }),
    });
  } finally {
    await atlas.close();
  }
}

async function policyTest(args: string[], env: CliEnvironment): Promise<void> {
  const request = await readTaskRequest(args);
  const policy = createDefaultPolicy(env.workspaceRoot);
  const taskId = "00000000-0000-4000-8000-000000000000";
  output(evaluatePolicy(taskId, request, policy));
}

function help(): void {
  process.stdout.write(`ATLAS MCP ${PRODUCT_VERSION}

Usage:
  atlas-mcp doctor
  atlas-mcp init --client <claude|cursor|vscode|codex|generic>
  atlas-mcp serve
  atlas-mcp run --request <task.json>
  atlas-mcp inspect <task-id>
  atlas-mcp policy test --request <task.json>
  atlas-mcp version

Environment:
  ATLAS_MCP_WORKSPACE  Workspace boundary (default: current directory)
  ATLAS_MCP_HOME       Local database and artifact directory
  ATLAS_MCP_POLICY     Optional local policy JSON
  ATLAS_MCP_BROWSER    Optional Chrome/Chromium/Edge executable
`);
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  const env = environment();
  switch (command) {
    case "doctor":
      process.exitCode = await doctor(env);
      return;
    case "init":
      await init(args, env);
      return;
    case "serve": {
      const atlas = await runtime(env);
      const server = await serveStdio(atlas);
      const close = async () => {
        await server.close();
        await atlas.close();
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
    `atlas-mcp: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
