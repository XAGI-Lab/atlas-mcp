// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileOperationSchema } from "@melra/protocol";
import { FileRuntime } from "./index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("FileRuntime", () => {
  it("writes atomically and returns a content hash", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-file-"));
    roots.push(root);
    const runtime = await FileRuntime.create({ root });
    const result = await runtime.execute(
      FileOperationSchema.parse({
        kind: "file",
        action: "write",
        path: "artifacts/result.txt",
        content: "verified",
      }),
    );
    expect(result.written).toBe(true);
    expect(await readFile(join(root, "artifacts/result.txt"), "utf8")).toBe("verified");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("blocks traversal and escaping symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "melra-file-"));
    const outside = await mkdtemp(join(tmpdir(), "melra-outside-"));
    roots.push(root, outside);
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "escape"));
    const runtime = await FileRuntime.create({ root });
    await expect(
      runtime.execute(
        FileOperationSchema.parse({
          kind: "file",
          action: "read",
          path: "../secret.txt",
        }),
      ),
    ).rejects.toThrow("path_outside_workspace");
    await expect(
      runtime.execute(
        FileOperationSchema.parse({
          kind: "file",
          action: "read",
          path: "escape/secret.txt",
        }),
      ),
    ).rejects.toThrow("path_outside_workspace");
  });

  it("creates a missing root but accepts one it cannot create", async () => {
    // A workspace the user has not made yet is created for them.
    const parent = await mkdtemp(join(tmpdir(), "melra-file-"));
    roots.push(parent);
    const nested = join(parent, "workspace", "inner");
    expect((await FileRuntime.create({ root: nested })).root).toBe(
      await realpath(nested),
    );

    // Unhinged mode roots this runtime at the filesystem root. That directory
    // always exists, but Windows answers `mkdir C:\` with EPERM instead of the
    // no-op POSIX gives for an existing directory, so `create` must not ask.
    const driveRoot = parse(tmpdir()).root;
    expect((await FileRuntime.create({ root: driveRoot })).root).toBe(
      await realpath(driveRoot),
    );
  });
});
