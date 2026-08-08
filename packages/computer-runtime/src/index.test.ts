// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { ComputerOperationSchema } from "@melra/protocol";
import {
  ComputerRuntime,
  parseSecureInput,
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
      inspect: true,
      drag: true,
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
    ["inspect", "inspect", "computer_inspect_unavailable"],
    ["click", "pointer", "computer_pointer_unavailable"],
    ["drag", "drag", "computer_drag_unavailable"],
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
        ...(action === "drag"
          ? { coordinateSpace: "pixel", x: 10, y: 10, toX: 40, toY: 40 }
          : {}),
        ...(action === "type" ? { text: "safe" } : {}),
      };

      await expect(
        runtime.execute(ComputerOperationSchema.parse(operation)),
      ).rejects.toThrow(error);
      expect(adapter.calls).toEqual([]);
    },
  );

  it("requires a destination for a drag and bounds it like the press point", async () => {
    const adapter = new TestAdapter();
    const runtime = new ComputerRuntime({
      artifactDirectory: "/tmp",
      adapter,
    });
    await expect(
      runtime.execute(
        ComputerOperationSchema.parse({
          kind: "computer",
          action: "drag",
          coordinateSpace: "pixel",
          x: 10,
          y: 10,
        }),
      ),
    ).rejects.toThrow("computer_drag_requires_destination");
    // The destination shares the coordinate space, so it has to be bounded by
    // the same rule — an out-of-range `toY` used to slip through untouched.
    await expect(
      runtime.execute(
        ComputerOperationSchema.parse({
          kind: "computer",
          action: "drag",
          coordinateSpace: "normalized",
          x: 0.1,
          y: 0.1,
          toX: 0.5,
          toY: 4,
        }),
      ),
    ).rejects.toThrow("computer_normalized_coordinates_out_of_range");
    expect(adapter.calls).toEqual([]);
  });

  it("passes a bounded drag and a read-only inspect to the adapter", async () => {
    const adapter = new TestAdapter();
    const runtime = new ComputerRuntime({
      artifactDirectory: "/tmp",
      adapter,
    });
    await runtime.execute(
      ComputerOperationSchema.parse({ kind: "computer", action: "inspect" }),
    );
    await runtime.execute(
      ComputerOperationSchema.parse({
        kind: "computer",
        action: "drag",
        coordinateSpace: "normalized",
        x: 0.1,
        y: 0.2,
        toX: 0.8,
        toY: 0.9,
      }),
    );
    expect(adapter.calls).toEqual(["inspect", "drag"]);
  });
});

describe("parseSecureInput", () => {
  // Trimmed from real `ioreg -l -d 1 -w 0 -r -c IOResources` output on macOS 26.
  const session =
    '"IOConsoleUsers" = ({"kCGSSessionOnConsoleKey"=Yes,"kSCSecuritySessionID"=100024,' +
    '"kCGSSessionIDKey"=257,"kCGSSessionUserNameKey"="dheeraj"';

  it("reads a held secure-input session as active", () => {
    expect(
      parseSecureInput(`${session},"kCGSSessionSecureInputPID"=843})`),
    ).toBe(true);
  });

  it("reads a session without the key, or with it cleared, as inactive", () => {
    expect(parseSecureInput(`${session}})`)).toBe(false);
    expect(
      parseSecureInput(`${session},"kCGSSessionSecureInputPID"=0})`),
    ).toBe(false);
  });

  it("reports no reading at all when no console session was dumped", () => {
    // Absence of the key in output that never described a session is not
    // evidence that secure input is off — reporting `false` here would let a
    // keystroke-swallowing state through as verified.
    expect(parseSecureInput("+-o Root  <class IORegistryEntry>")).toBe(
      undefined,
    );
  });
});
