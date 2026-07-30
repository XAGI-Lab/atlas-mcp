// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parseCliEnvironment } from "../src/environment.js";

const execute = promisify(execFile);
const roots: string[] = [];
const entry = resolve(import.meta.dirname, "../dist/index.js");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("melra CLI", () => {
  it("parses explicit benchmark browser connection options", () => {
    const parsed = parseCliEnvironment(
      {
        MELRA_WORKSPACE: "/tmp/melra-workspace",
        MELRA_HOME: "/tmp/melra-home",
        MELRA_BROWSER: "/Applications/Google Chrome",
        MELRA_BROWSER_CDP_ENDPOINT: "http://127.0.0.1:9222",
        MELRA_BROWSER_CDP_CONTEXT_INDEX: "-1",
      },
      {
        cwd: "/tmp/fallback-workspace",
        home: "/tmp/fallback-home",
      },
    );
    expect(parsed).toEqual({
      workspaceRoot: resolve("/tmp/melra-workspace"),
      dataDirectory: resolve("/tmp/melra-home"),
      browserExecutablePath: resolve("/Applications/Google Chrome"),
      browserCdpEndpoint: "http://127.0.0.1:9222/",
      browserCdpContextIndex: -1,
    });
    expect(
      parseCliEnvironment(
        { MELRA_BROWSER_HAR_PATH: "/tmp/melra-run/network.har" },
        {
          cwd: "/tmp/fallback-workspace",
          home: "/tmp/fallback-home",
        },
      ).browserHarPath,
    ).toBe(resolve("/tmp/melra-run/network.har"));
  });

  it("rejects unsafe or ambiguous browser connection options", () => {
    const defaults = {
      cwd: "/tmp/fallback-workspace",
      home: "/tmp/fallback-home",
    };
    expect(() =>
      parseCliEnvironment(
        { MELRA_BROWSER_CDP_ENDPOINT: "ws://127.0.0.1:9222" },
        defaults,
      ),
    ).toThrow("browser_cdp_endpoint_invalid");
    expect(() =>
      parseCliEnvironment(
        { MELRA_BROWSER_CDP_CONTEXT_INDEX: "-2" },
        defaults,
      ),
    ).toThrow("browser_cdp_context_index_invalid");
    expect(() =>
      parseCliEnvironment(
        { MELRA_BROWSER_HAR_PATH: "relative/network.har" },
        defaults,
      ),
    ).toThrow("browser_har_path_must_be_absolute");
    expect(() =>
      parseCliEnvironment(
        {
          MELRA_BROWSER_CDP_ENDPOINT: "http://127.0.0.1:9222",
          MELRA_BROWSER_HAR_PATH: "/tmp/network.har",
        },
        defaults,
      ),
    ).toThrow("browser_cdp_cannot_start_har_recording");
  });

  it("prints the product version", async () => {
    const result = await execute(process.execPath, [entry, "version"]);
    expect(result.stdout.trim()).toBe("0.2.0-alpha.1");
  });

  it("reports local readiness through doctor", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-cli-"));
    roots.push(root);
    const result = await execute(process.execPath, [entry, "doctor"], {
      cwd: root,
      env: {
        ...process.env,
        MELRA_HOME: join(root, ".melra"),
        MELRA_WORKSPACE: root,
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
    expect(
      ["pass", "warn"].includes(
        report.checks.find((check) => check.name === "computer")?.status ?? "",
      ),
    ).toBe(true);
  });

  it("initializes a safe local policy and client configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-cli-"));
    roots.push(root);
    const home = join(root, ".melra");
    const result = await execute(
      process.execPath,
      [entry, "init", "--client", "claude"],
      {
        cwd: root,
        env: {
          ...process.env,
          MELRA_HOME: home,
          MELRA_WORKSPACE: root,
        },
      },
    );
    const initialized = JSON.parse(result.stdout) as {
      initialized: boolean;
      policyPath: string;
      config: { mcpServers: { melra: { command: string } } };
    };
    expect(initialized.initialized).toBe(true);
    expect(initialized.config.mcpServers.melra.command).toBe("melra");
    const policy = JSON.parse(await readFile(initialized.policyPath, "utf8")) as {
      mutations: string;
      allowLocalhost: boolean;
    };
    expect(policy.mutations).toBe("confirm");
    expect(policy.allowLocalhost).toBe(false);
  });

  it("plans, advances, inspects, and cancels a durable workflow", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-cli-workflow-"));
    roots.push(root);
    const home = join(root, ".melra");
    const definitionPath = join(root, "workflow.json");
    await writeFile(
      definitionPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        id: "11111111-1111-4111-8111-111111111111",
        version: 1,
        name: "CLI workflow",
        nodes: [
          {
            id: "inspect",
            type: "operation",
            request: {
              goal: "Inspect from CLI",
              operation: { kind: "system", action: "info" },
            },
          },
        ],
      }),
    );
    const options = {
      cwd: root,
      env: {
        ...process.env,
        MELRA_HOME: home,
        MELRA_WORKSPACE: root,
      },
    };
    const planned = await execute(
      process.execPath,
      [entry, "workflow", "plan", "--definition", definitionPath],
      options,
    );
    const run = JSON.parse(planned.stdout) as { id: string; status: string };
    expect(run.status).toBe("planned");

    const advanced = await execute(
      process.execPath,
      [entry, "workflow", "advance", run.id],
      options,
    );
    expect(
      (JSON.parse(advanced.stdout) as { run: { status: string } }).run.status,
    ).toBe("verified_complete");
    const inspected = await execute(
      process.execPath,
      [entry, "workflow", "inspect", run.id],
      options,
    );
    expect(
      (JSON.parse(inspected.stdout) as { status: string }).status,
    ).toBe("verified_complete");
    const cancelled = await execute(
      process.execPath,
      [entry, "workflow", "cancel", run.id],
      options,
    );
    expect(
      (JSON.parse(cancelled.stdout) as { status: string }).status,
    ).toBe("verified_complete");
  });

  it("uses stable exit codes for workflow approval and unknown IDs", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-cli-workflow-"));
    roots.push(root);
    const home = join(root, ".melra");
    const definitionPath = join(root, "workflow.json");
    await writeFile(
      definitionPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        id: "22222222-2222-4222-8222-222222222222",
        version: 1,
        name: "CLI approval",
        nodes: [
          {
            id: "write",
            type: "operation",
            request: {
              goal: "Write from CLI",
              operation: {
                kind: "file",
                action: "write",
                path: "result.txt",
                content: "verified",
              },
              requiredEvidence: [
                { type: "file_exists", path: "result.txt" },
              ],
            },
          },
        ],
      }),
    );
    const options = {
      cwd: root,
      env: {
        ...process.env,
        MELRA_HOME: home,
        MELRA_WORKSPACE: root,
      },
    };
    const planned = await execute(
      process.execPath,
      [entry, "workflow", "plan", "--definition", definitionPath],
      options,
    );
    const workflowId = (JSON.parse(planned.stdout) as { id: string }).id;
    await expect(
      execute(
        process.execPath,
        [entry, "workflow", "advance", workflowId],
        options,
      ),
    ).rejects.toMatchObject({ code: 3 });
    await expect(
      execute(
        process.execPath,
        [
          entry,
          "workflow",
          "inspect",
          "99999999-9999-4999-8999-999999999999",
        ],
        options,
      ),
    ).rejects.toMatchObject({ code: 1 });
  });

  it("starts the durable-core demo through production services", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-cli-demo-"));
    roots.push(root);
    const result = await execute(
      process.execPath,
      [entry, "demo", "durable-core"],
      {
        cwd: root,
        env: {
          ...process.env,
          MELRA_HOME: join(root, ".melra"),
          MELRA_WORKSPACE: root,
        },
      },
    );
    const demo = JSON.parse(result.stdout) as {
      examplePath: string;
      workflow: { status: string };
      next: string;
    };
    expect(demo.examplePath).toMatch(/restart-safe\.json$/);
    expect(demo.workflow.status).toBe("running");
    expect(demo.next).toMatch(/^melra workflow advance /);
  });
});
