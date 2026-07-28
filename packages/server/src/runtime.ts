// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  arch,
  cpus,
  freemem,
  hostname,
  platform,
  release,
  totalmem,
} from "node:os";
import { join, resolve } from "node:path";
import type { Operation } from "@atlas-mcp/protocol";
import { BrowserRuntime } from "@atlas-mcp/browser-runtime";
import { ComputerRuntime } from "@atlas-mcp/computer-runtime";
import { FileRuntime } from "@atlas-mcp/file-runtime";
import { LocalMemory } from "@atlas-mcp/memory";
import {
  createDefaultPolicy,
  loadPolicy,
  type LocalPolicy,
} from "@atlas-mcp/policy-core";
import {
  TaskController,
  type OperationExecutor,
} from "@atlas-mcp/runtime-core";
import { SqliteStore } from "@atlas-mcp/storage-sqlite";
import { TerminalRuntime } from "@atlas-mcp/terminal-runtime";
import { Verifier } from "@atlas-mcp/verifier-core";

export interface AtlasRuntimeOptions {
  workspaceRoot: string;
  dataDirectory: string;
  policyPath?: string;
  browserExecutablePath?: string;
  browserHeadless?: boolean;
}

export class RuntimeRouter implements OperationExecutor {
  constructor(
    private readonly files: FileRuntime,
    private readonly terminal: TerminalRuntime,
    private readonly browser: BrowserRuntime,
    private readonly computer: ComputerRuntime,
    private readonly memory: LocalMemory,
  ) {}

  async execute(
    operation: Operation,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (signal?.aborted === true) throw new Error("task_cancelled");
    switch (operation.kind) {
      case "file":
        return await this.files.execute(operation);
      case "terminal":
        return await this.terminal.execute(operation, signal);
      case "browser":
        return await this.browser.execute(operation);
      case "memory":
        return this.memory.execute(operation);
      case "computer":
        return await this.computer.execute(operation, signal);
      case "system":
        return {
          platform: platform(),
          release: release(),
          architecture: arch(),
          hostname: hostname(),
          cpuCount: cpus().length,
          totalMemoryBytes: totalmem(),
          freeMemoryBytes: freemem(),
          nodeVersion: process.version,
        };
    }
  }

  async close(): Promise<void> {
    this.terminal.close();
    await this.browser.close();
  }
}

export interface AtlasRuntime {
  controller: TaskController;
  policy: LocalPolicy;
  store: SqliteStore;
  router: RuntimeRouter;
  workspaceRoot: string;
  dataDirectory: string;
  close(): Promise<void>;
}

export async function createAtlasRuntime(
  options: AtlasRuntimeOptions,
): Promise<AtlasRuntime> {
  const workspaceRoot = resolve(options.workspaceRoot);
  const dataDirectory = resolve(options.dataDirectory);
  const policy =
    options.policyPath === undefined
      ? createDefaultPolicy(workspaceRoot)
      : await loadPolicy(options.policyPath, workspaceRoot);
  const store = new SqliteStore(join(dataDirectory, "atlas-mcp.sqlite"));
  const files = await FileRuntime.create({
    root: policy.workspaceRoot,
    maxFileBytes: policy.maxFileBytes,
  });
  const terminal = await TerminalRuntime.create({ root: policy.workspaceRoot });
  const browser = new BrowserRuntime({
    artifactDirectory: join(dataDirectory, "artifacts"),
    workspaceRoot: policy.workspaceRoot,
    allowedDomains: policy.allowedDomains,
    allowLocalhost: policy.allowLocalhost,
    ...(options.browserExecutablePath === undefined
      ? {}
      : { executablePath: options.browserExecutablePath }),
    ...(options.browserHeadless === undefined
      ? {}
      : { headless: options.browserHeadless }),
  });
  const memory = new LocalMemory(store);
  const computer = new ComputerRuntime({
    artifactDirectory: join(dataDirectory, "artifacts"),
  });
  const router = new RuntimeRouter(files, terminal, browser, computer, memory);
  const controller = new TaskController(
    store,
    policy,
    router,
    await Verifier.create(policy.workspaceRoot),
  );
  return {
    controller,
    policy,
    store,
    router,
    workspaceRoot,
    dataDirectory,
    async close() {
      await router.close();
      store.close();
    },
  };
}
