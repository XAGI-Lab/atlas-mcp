// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseMelraToolResult } from "./index.js";

describe("TypeScript SDK result parsing", () => {
  it("parses the server's JSON text contract", () => {
    expect(
      parseMelraToolResult({
        content: [{ type: "text", text: '{"verified":true}' }],
      }),
    ).toEqual({ verified: true });
  });

  it("does not hide MCP tool errors", () => {
    expect(() =>
      parseMelraToolResult({
        isError: true,
        content: [{ type: "text", text: "approval_required" }],
      }),
    ).toThrow("approval_required");
  });
});
