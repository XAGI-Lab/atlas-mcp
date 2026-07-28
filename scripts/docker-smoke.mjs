// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const image = process.env.ATLAS_MCP_IMAGE ?? "atlas-mcp:local";
const root = await mkdtemp(join(tmpdir(), "atlas-docker-smoke-"));
const workspace = join(root, "workspace");
const data = join(root, "data");
await mkdir(workspace);
await mkdir(data);
const userArgs =
  process.getuid === undefined || process.getgid === undefined
    ? []
    : ["--user", `${process.getuid()}:${process.getgid()}`];

const childEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry) => entry[1] !== undefined,
  ),
);
const transport = new StdioClientTransport({
  command: "docker",
  args: [
    "run",
    "--rm",
    ...userArgs,
    "-i",
    "--read-only",
    "--security-opt",
    "no-new-privileges:true",
    "--cap-drop",
    "ALL",
    "--tmpfs",
    "/tmp:size=256m,mode=1777",
    "-v",
    `${workspace}:/workspace`,
    "-v",
    `${data}:/data`,
    image,
    "serve",
  ],
  env: childEnvironment,
  stderr: "pipe",
});
const client = new Client({ name: "atlas-container-smoke", version: "1.0.0" });

function parse(result) {
  const text = result.content.find((item) => item.type === "text")?.text;
  if (text === undefined) throw new Error("container_smoke_missing_text");
  return JSON.parse(text);
}

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const tools = listed.tools.map((tool) => tool.name).sort();
  const expected = [
    "atlas_capabilities",
    "atlas_execute",
    "atlas_plan",
    "atlas_receipt",
    "atlas_task_cancel",
    "atlas_task_status",
  ];
  if (JSON.stringify(tools) !== JSON.stringify(expected)) {
    throw new Error(`container_smoke_tool_mismatch:${JSON.stringify(tools)}`);
  }
  const planned = parse(
    await client.callTool({
      name: "atlas_plan",
      arguments: {
        goal: "Verify the containerized MCP transport",
        operation: { kind: "system", action: "info" },
      },
    }),
  );
  const executed = parse(
    await client.callTool({
      name: "atlas_execute",
      arguments: { taskId: planned.id },
    }),
  );
  const evidence = parse(
    await client.callTool({
      name: "atlas_receipt",
      arguments: { taskId: planned.id },
    }),
  );
  if (
    executed.task.status !== "verified_success" ||
    evidence.certificate.result !== "VERIFIED_SUCCESS" ||
    !/^[a-f0-9]{64}$/.test(evidence.certificate.digest)
  ) {
    throw new Error("container_smoke_verification_failed");
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        image,
        tools,
        taskStatus: executed.task.status,
        certificate: evidence.certificate.result,
        digest: evidence.certificate.digest,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await client.close();
  await rm(root, { recursive: true, force: true });
}
