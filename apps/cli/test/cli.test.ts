// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const roots: string[] = [];
const entry = resolve(import.meta.dirname, "../dist/index.js");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("atlas-mcp CLI", () => {
  it("prints the product version", async () => {
    const result = await execute(process.execPath, [entry, "version"]);
    expect(result.stdout.trim()).toBe("0.1.0-alpha.1");
  });

  it("reports local readiness through doctor", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-cli-"));
    roots.push(root);
    const result = await execute(process.execPath, [entry, "doctor"], {
      cwd: root,
      env: {
        ...process.env,
        ATLAS_MCP_HOME: join(root, ".atlas"),
        ATLAS_MCP_WORKSPACE: root,
      },
    });
    const report = JSON.parse(result.stdout) as {
      ready: boolean;
      checks: Array<{ name: string; status: string }>;
    };
    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.name === "sqlite")?.status).toBe(
      "pass",
    );
  });

  it("initializes a safe local policy and client configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-cli-"));
    roots.push(root);
    const home = join(root, ".atlas");
    const result = await execute(
      process.execPath,
      [entry, "init", "--client", "claude"],
      {
        cwd: root,
        env: {
          ...process.env,
          ATLAS_MCP_HOME: home,
          ATLAS_MCP_WORKSPACE: root,
        },
      },
    );
    const initialized = JSON.parse(result.stdout) as {
      initialized: boolean;
      policyPath: string;
      config: { mcpServers: { atlas: { command: string } } };
    };
    expect(initialized.initialized).toBe(true);
    expect(initialized.config.mcpServers.atlas.command).toBe("atlas-mcp");
    const policy = JSON.parse(await readFile(initialized.policyPath, "utf8")) as {
      mutations: string;
      allowLocalhost: boolean;
    };
    expect(policy.mutations).toBe("confirm");
    expect(policy.allowLocalhost).toBe(false);
  });
});
