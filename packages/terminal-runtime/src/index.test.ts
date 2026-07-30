// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalOperationSchema } from "@melra/protocol";
import { TerminalRuntime, redactTerminalOutput } from "./index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("TerminalRuntime", () => {
  it("runs executable and argument arrays without a shell", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-terminal-"));
    roots.push(root);
    const runtime = await TerminalRuntime.create({ root });
    const result = await runtime.execute(
      TerminalOperationSchema.parse({
        kind: "terminal",
        action: "run",
        command: process.execPath,
        args: ["-e", "process.stdout.write(process.argv[1])", "hello; touch nope"],
      }),
    );
    expect(result.success).toBe(true);
    expect(result.stdout).toBe("hello; touch nope");
  });

  it("redacts secret-shaped output", () => {
    expect(
      redactTerminalOutput("password=hunter2 ghp_123456789012345678901234"),
    ).not.toContain("hunter2");
  });

  it("stops commands at the configured timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-terminal-"));
    roots.push(root);
    const runtime = await TerminalRuntime.create({ root });
    const result = await runtime.execute(
      TerminalOperationSchema.parse({
        kind: "terminal",
        action: "run",
        command: process.execPath,
        args: ["-e", "setTimeout(() => {}, 10_000)"],
        timeoutMs: 150,
      }),
    );
    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
  });

  it("supervises bounded background jobs and output", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-terminal-"));
    roots.push(root);
    const runtime = await TerminalRuntime.create({ root });
    const started = await runtime.execute(
      TerminalOperationSchema.parse({
        kind: "terminal",
        action: "start",
        command: process.execPath,
        args: [
          "-e",
          "process.stdout.write('background-ready'); setTimeout(() => {}, 150)",
        ],
        timeoutMs: 2_000,
      }),
    );
    expect(started.started).toBe(true);
    // The child writes its output and then exits on its own. How long that
    // takes depends on process startup under CI load, so poll for completion
    // rather than assuming it finishes within a fixed wall-clock delay.
    const deadline = Date.now() + 10_000;
    const readOutput = async () =>
      runtime.execute(
        TerminalOperationSchema.parse({
          kind: "terminal",
          action: "output",
          jobId: started.jobId,
        }),
      );
    let output = await readOutput();
    while (output.running === true && Date.now() < deadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      output = await readOutput();
    }
    expect(output.stdout).toContain("background-ready");
    expect(output.running).toBe(false);
    runtime.close();
  }, 30_000);
});
