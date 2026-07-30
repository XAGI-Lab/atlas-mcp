// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { PayloadCipher } from "./payload-cipher.js";

describe("PayloadCipher", () => {
  it("round-trips canonical payloads without embedding plaintext", () => {
    const cipher = new PayloadCipher(Buffer.alloc(32, 7));
    const context = "task:11111111-1111-4111-8111-111111111111:request";
    const sealed = cipher.seal(
      { value: "one-time-secret", count: 2 },
      context,
    );

    expect(JSON.stringify(sealed)).not.toContain("one-time-secret");
    expect(cipher.open(sealed, context)).toEqual({
      count: 2,
      value: "one-time-secret",
    });
  });

  it("rejects modified authentication tags", () => {
    const cipher = new PayloadCipher(Buffer.alloc(32, 9));
    const context = "task:22222222-2222-4222-8222-222222222222:request";
    const sealed = cipher.seal({ value: "protected" }, context);
    const replacement = sealed.tag.endsWith("A") ? "B" : "A";

    expect(() =>
      cipher.open(
        { ...sealed, tag: sealed.tag.replace(/.$/, replacement) },
        context,
      ),
    ).toThrow("task_payload_authentication_failed");
  });

  it("binds an envelope to its task and payload context", () => {
    const cipher = new PayloadCipher(Buffer.alloc(32, 11));
    const sealed = cipher.seal(
      { value: "protected" },
      "task:33333333-3333-4333-8333-333333333333:request",
    );

    expect(() =>
      cipher.open(
        sealed,
        "task:44444444-4444-4444-8444-444444444444:request",
      ),
    ).toThrow("task_payload_authentication_failed");
  });

  it("requires exactly 32 bytes of key material", () => {
    expect(() => new PayloadCipher(Buffer.alloc(31))).toThrow(
      "payload_key_must_be_32_bytes",
    );
  });
});
