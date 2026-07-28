// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { normalizeDomStabilityOptions } from "./stable-dom.js";

describe("DOM stability options", () => {
  it("applies bounded defaults", () => {
    expect(normalizeDomStabilityOptions()).toEqual({
      quietWindowMs: 180,
      timeoutMs: 1_500,
    });
  });

  it("keeps the timeout at or above the quiet window", () => {
    expect(
      normalizeDomStabilityOptions({
        quietWindowMs: 900,
        timeoutMs: 100,
      }),
    ).toEqual({
      quietWindowMs: 900,
      timeoutMs: 900,
    });
  });
});
