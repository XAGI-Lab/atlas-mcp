// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ComputerOperation } from "@melra/protocol";

const execFileAsync = promisify(execFile);

export interface ComputerCapabilities {
  platform: NodeJS.Platform;
  adapter: "macos-native" | "linux-xdotool" | "unavailable";
  available: boolean;
  screenshot: boolean;
  pointer: boolean;
  keyboard: boolean;
  scroll: boolean;
  coordinateSpaces: Array<"normalized" | "pixel">;
  limitations: string[];
}

export interface ComputerAdapter {
  capabilities(): Promise<ComputerCapabilities>;
  execute(
    operation: ComputerOperation,
    artifactDirectory: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
}

export interface ComputerRuntimeOptions {
  artifactDirectory: string;
  adapter?: ComputerAdapter;
}

const ALLOWED_KEYS: Record<string, number> = {
  ENTER: 36,
  TAB: 48,
  SPACE: 49,
  BACKSPACE: 51,
  ESCAPE: 53,
  LEFT: 123,
  RIGHT: 124,
  DOWN: 125,
  UP: 126,
  HOME: 115,
  END: 119,
  PAGEUP: 116,
  PAGEDOWN: 121,
  DELETE: 117,
};

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function run(
  file: string,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(file, args, {
    timeout: timeoutMs,
    maxBuffer: 1_000_000,
    windowsHide: true,
    ...(signal === undefined ? {} : { signal }),
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function coordinateScript(operation: ComputerOperation): string {
  const x = operation.x ?? 0;
  const y = operation.y ?? 0;
  const normalized = operation.coordinateSpace === "normalized";
  return `
ObjC.import("AppKit");
ObjC.import("CoreGraphics");
const frame = $.NSScreen.mainScreen.frame;
const x = ${normalized ? `frame.size.width * ${x}` : x};
const y = ${normalized ? `frame.size.height * ${y}` : y};
const point = $.CGPointMake(x, y);
const move = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, point, $.kCGMouseButtonLeft);
$.CGEventPost($.kCGHIDEventTap, move);
${operation.action === "click" ? `
const down = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
const up = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
$.CGEventPost($.kCGHIDEventTap, down);
$.CGEventPost($.kCGHIDEventTap, up);` : ""}
`;
}

class MacOsAdapter implements ComputerAdapter {
  async capabilities(): Promise<ComputerCapabilities> {
    const osascript = await executable("/usr/bin/osascript");
    const screencapture = await executable("/usr/sbin/screencapture");
    return {
      platform: "darwin",
      adapter: "macos-native",
      available: osascript || screencapture,
      screenshot: screencapture,
      pointer: osascript,
      keyboard: osascript,
      scroll: osascript,
      coordinateSpaces: ["normalized", "pixel"],
      limitations: [
        "macOS Screen Recording permission is required for screenshots",
        "macOS Accessibility permission is required for input actions",
        "normalized coordinates currently target the main display",
      ],
    };
  }

  async execute(
    operation: ComputerOperation,
    artifactDirectory: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    switch (operation.action) {
      case "capabilities":
        return { ...(await this.capabilities()) };
      case "screenshot": {
        await mkdir(artifactDirectory, { recursive: true });
        const path = join(
          artifactDirectory,
          `computer-${randomUUID()}.png`,
        );
        await run(
          "/usr/sbin/screencapture",
          ["-x", path],
          operation.timeoutMs,
          signal,
        );
        const bytes = await readFile(path);
        return {
          success: true,
          captured: true,
          path,
          size: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }
      case "click":
      case "move":
        await run(
          "/usr/bin/osascript",
          ["-l", "JavaScript", "-e", coordinateScript(operation)],
          operation.timeoutMs,
          signal,
        );
        return {
          success: true,
          action: operation.action,
          coordinateSpace: operation.coordinateSpace,
          x: operation.x,
          y: operation.y,
        };
      case "type": {
        if (operation.text === undefined) {
          throw new Error("computer_type_requires_text");
        }
        await run(
          "/usr/bin/osascript",
          [
            "-e",
            "on run argv",
            "-e",
            "tell application \"System Events\" to keystroke (item 1 of argv)",
            "-e",
            "end run",
            "--",
            operation.text,
          ],
          operation.timeoutMs,
          signal,
        );
        return { success: true, action: "type", characters: operation.text.length };
      }
      case "key": {
        const key = operation.key?.toLocaleUpperCase();
        const keyCode = key === undefined ? undefined : ALLOWED_KEYS[key];
        if (keyCode === undefined) throw new Error("computer_key_not_allowed");
        await run(
          "/usr/bin/osascript",
          [
            "-e",
            `tell application "System Events" to key code ${keyCode}`,
          ],
          operation.timeoutMs,
          signal,
        );
        return { success: true, action: "key", key };
      }
      case "scroll": {
        const deltaY = Math.max(-2_000, Math.min(2_000, operation.deltaY ?? 0));
        const script = `
ObjC.import("CoreGraphics");
const event = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitPixel, 1, ${Math.round(deltaY)});
$.CGEventPost($.kCGHIDEventTap, event);
`;
        await run(
          "/usr/bin/osascript",
          ["-l", "JavaScript", "-e", script],
          operation.timeoutMs,
          signal,
        );
        return { success: true, action: "scroll", deltaY };
      }
    }
  }
}

class LinuxXdotoolAdapter implements ComputerAdapter {
  private async command(name: string): Promise<string | undefined> {
    for (const prefix of ["/usr/bin", "/bin", "/usr/local/bin"]) {
      const path = join(prefix, name);
      if (await executable(path)) return path;
    }
    return undefined;
  }

  async capabilities(): Promise<ComputerCapabilities> {
    const xdotool = await this.command("xdotool");
    const screenshot =
      (await this.command("gnome-screenshot")) ??
      (await this.command("scrot"));
    return {
      platform: "linux",
      adapter: "linux-xdotool",
      available: xdotool !== undefined || screenshot !== undefined,
      screenshot: screenshot !== undefined,
      pointer: xdotool !== undefined,
      keyboard: xdotool !== undefined,
      scroll: xdotool !== undefined,
      coordinateSpaces: ["normalized", "pixel"],
      limitations: [
        "input actions require xdotool and an X11 session",
        "Wayland compositors may deny synthetic input",
        "normalized coordinates target the current display size reported by xdotool",
      ],
    };
  }

  private async xdotool(
    args: string[],
    operation: ComputerOperation,
    signal?: AbortSignal,
  ): Promise<void> {
    const executablePath = await this.command("xdotool");
    if (executablePath === undefined) throw new Error("computer_input_unavailable");
    await run(executablePath, args, operation.timeoutMs, signal);
  }

  private async coordinates(
    operation: ComputerOperation,
    signal?: AbortSignal,
  ): Promise<{ x: number; y: number }> {
    if (operation.x === undefined || operation.y === undefined) {
      throw new Error(`computer_${operation.action}_requires_coordinates`);
    }
    if (operation.coordinateSpace === "pixel") {
      return { x: Math.round(operation.x), y: Math.round(operation.y) };
    }
    const executablePath = await this.command("xdotool");
    if (executablePath === undefined) throw new Error("computer_input_unavailable");
    const { stdout } = await run(
      executablePath,
      ["getdisplaygeometry"],
      operation.timeoutMs,
      signal,
    );
    const [width, height] = stdout.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error("computer_display_geometry_unavailable");
    }
    return {
      x: Math.round(width! * operation.x),
      y: Math.round(height! * operation.y),
    };
  }

  async execute(
    operation: ComputerOperation,
    artifactDirectory: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    switch (operation.action) {
      case "capabilities":
        return { ...(await this.capabilities()) };
      case "screenshot": {
        await mkdir(artifactDirectory, { recursive: true });
        const path = join(
          artifactDirectory,
          `computer-${randomUUID()}.png`,
        );
        const gnome = await this.command("gnome-screenshot");
        const scrot = await this.command("scrot");
        if (gnome !== undefined) {
          await run(gnome, ["-f", path], operation.timeoutMs, signal);
        } else if (scrot !== undefined) {
          await run(scrot, [path], operation.timeoutMs, signal);
        } else {
          throw new Error("computer_screenshot_unavailable");
        }
        const bytes = await readFile(path);
        return {
          success: true,
          captured: true,
          path,
          size: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }
      case "click":
      case "move": {
        const point = await this.coordinates(operation, signal);
        const args = ["mousemove", String(point.x), String(point.y)];
        if (operation.action === "click") args.push("click", "1");
        await this.xdotool(args, operation, signal);
        return { success: true, action: operation.action, ...point };
      }
      case "type":
        if (operation.text === undefined) throw new Error("computer_type_requires_text");
        await this.xdotool(["type", "--", operation.text], operation, signal);
        return { success: true, action: "type", characters: operation.text.length };
      case "key": {
        const key = operation.key?.toLocaleUpperCase();
        const mapping: Record<string, string> = {
          ENTER: "Return",
          TAB: "Tab",
          SPACE: "space",
          BACKSPACE: "BackSpace",
          ESCAPE: "Escape",
          LEFT: "Left",
          RIGHT: "Right",
          DOWN: "Down",
          UP: "Up",
          HOME: "Home",
          END: "End",
          PAGEUP: "Page_Up",
          PAGEDOWN: "Page_Down",
          DELETE: "Delete",
        };
        if (key === undefined || mapping[key] === undefined) {
          throw new Error("computer_key_not_allowed");
        }
        await this.xdotool(["key", mapping[key]], operation, signal);
        return { success: true, action: "key", key };
      }
      case "scroll": {
        const clicks = Math.max(
          -20,
          Math.min(20, Math.round((operation.deltaY ?? 0) / 100)),
        );
        const button = clicks < 0 ? "4" : "5";
        for (let index = 0; index < Math.abs(clicks); index += 1) {
          await this.xdotool(["click", button], operation, signal);
        }
        return { success: true, action: "scroll", deltaY: operation.deltaY ?? 0 };
      }
    }
  }
}

class UnavailableAdapter implements ComputerAdapter {
  async capabilities(): Promise<ComputerCapabilities> {
    return {
      platform: process.platform,
      adapter: "unavailable",
      available: false,
      screenshot: false,
      pointer: false,
      keyboard: false,
      scroll: false,
      coordinateSpaces: ["normalized", "pixel"],
      limitations: ["no supported local computer-use adapter was detected"],
    };
  }

  async execute(operation: ComputerOperation): Promise<Record<string, unknown>> {
    if (operation.action === "capabilities") {
      return { ...(await this.capabilities()) };
    }
    throw new Error("computer_use_unavailable");
  }
}

export function createSystemComputerAdapter(): ComputerAdapter {
  if (process.platform === "darwin") return new MacOsAdapter();
  if (process.platform === "linux") return new LinuxXdotoolAdapter();
  return new UnavailableAdapter();
}

export class ComputerRuntime {
  private readonly adapter: ComputerAdapter;

  constructor(private readonly options: ComputerRuntimeOptions) {
    this.adapter = options.adapter ?? createSystemComputerAdapter();
  }

  async execute(
    operation: ComputerOperation,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (signal?.aborted === true) throw new Error("task_cancelled");
    const capabilities = await this.adapter.capabilities();
    if (operation.action === "capabilities") {
      return { ...capabilities };
    }
    if (!capabilities.available) {
      throw new Error("computer_use_unavailable");
    }
    const requiredCapability =
      operation.action === "screenshot"
        ? "screenshot"
        : operation.action === "click" || operation.action === "move"
          ? "pointer"
          : operation.action === "type" || operation.action === "key"
            ? "keyboard"
            : operation.action === "scroll"
              ? "scroll"
              : undefined;
    if (
      requiredCapability !== undefined &&
      !capabilities[requiredCapability]
    ) {
      throw new Error(`computer_${requiredCapability}_unavailable`);
    }
    if (
      ["click", "move"].includes(operation.action) &&
      (operation.x === undefined || operation.y === undefined)
    ) {
      throw new Error(`computer_${operation.action}_requires_coordinates`);
    }
    if (
      operation.coordinateSpace === "normalized" &&
      ((operation.x ?? 0) > 1 || (operation.y ?? 0) > 1)
    ) {
      throw new Error("computer_normalized_coordinates_out_of_range");
    }
    return await this.adapter.execute(
      operation,
      this.options.artifactDirectory,
      signal,
    );
  }
}
