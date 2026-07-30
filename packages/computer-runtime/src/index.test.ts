// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { ComputerOperationSchema } from "@melra/protocol";
import {
  ComputerRuntime,
  type ComputerAdapter,
  type ComputerCapabilities,
} from "./index.js";

class TestAdapter implements ComputerAdapter {
  readonly calls: string[] = [];

  constructor(
    private readonly overrides: Partial<ComputerCapabilities> = {},
  ) {}

  async capabilities(): Promise<ComputerCapabilities> {
    return {
      platform: "darwin",
      adapter: "macos-native",
      available: true,
      screenshot: true,
      pointer: true,
      keyboard: true,
      scroll: true,
      coordinateSpaces: ["normalized", "pixel"],
      limitations: [],
      ...this.overrides,
    };
  }

  async execute(operation: { action: string }): Promise<Record<string, unknown>> {
    this.calls.push(operation.action);
    return { success: true, action: operation.action };
  }
}

describe("ComputerRuntime", () => {
  it("reports adapter capabilities without a mutation", async () => {
    const adapter = new TestAdapter();
    const runtime = new ComputerRuntime({
      artifactDirectory: "/tmp",
      adapter,
    });
    const result = await runtime.execute(
      ComputerOperationSchema.parse({
        kind: "computer",
        action: "capabilities",
      }),
    );
    expect(result.available).toBe(true);
    expect(adapter.calls).toEqual([]);
  });

  it("requires explicit bounded coordinates for pointer actions", async () => {
    const runtime = new ComputerRuntime({
      artifactDirectory: "/tmp",
      adapter: new TestAdapter(),
    });
    await expect(
      runtime.execute(
        ComputerOperationSchema.parse({
          kind: "computer",
          action: "click",
        }),
      ),
    ).rejects.toThrow("computer_click_requires_coordinates");
    await expect(
      runtime.execute(
        ComputerOperationSchema.parse({
          kind: "computer",
          action: "click",
          coordinateSpace: "normalized",
          x: 2,
          y: 0.5,
        }),
      ),
    ).rejects.toThrow("computer_normalized_coordinates_out_of_range");
  });

  it.each([
    ["screenshot", "screenshot", "computer_screenshot_unavailable"],
    ["click", "pointer", "computer_pointer_unavailable"],
    ["type", "keyboard", "computer_keyboard_unavailable"],
    ["scroll", "scroll", "computer_scroll_unavailable"],
  ] as const)(
    "rejects %s when its adapter capability is unavailable",
    async (action, capability, error) => {
      const adapter = new TestAdapter({ [capability]: false });
      const runtime = new ComputerRuntime({
        artifactDirectory: "/tmp",
        adapter,
      });
      const operation = {
        kind: "computer",
        action,
        ...(action === "click"
          ? { coordinateSpace: "pixel", x: 10, y: 10 }
          : {}),
        ...(action === "type" ? { text: "safe" } : {}),
      };

      await expect(
        runtime.execute(ComputerOperationSchema.parse(operation)),
      ).rejects.toThrow(error);
      expect(adapter.calls).toEqual([]);
    },
  );
});
