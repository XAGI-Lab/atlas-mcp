// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPrivateAddress } from "./network-policy.js";

describe("browser network policy", () => {
  it("classifies private IPv4 and IPv6 destinations", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true);
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::ffff:ac10:1")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("blocks credentials and localhost by default", async () => {
    const policy = { allowedDomains: ["*"], allowLocalhost: false };
    await expect(assertSafeUrl("http://127.0.0.1", policy)).rejects.toThrow(
      "browser_private_destination_blocked",
    );
    await expect(
      assertSafeUrl("https://user:pass@example.com", policy),
    ).rejects.toThrow("browser_url_credentials_not_allowed");
  });
});
