// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { ComputerOperation } from "@melra/protocol";

const execFileAsync = promisify(execFile);

export interface ComputerCapabilities {
  platform: NodeJS.Platform;
  adapter: "macos-native" | "linux-xdotool" | "windows-powershell" | "unavailable";
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
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(file, args, {
      timeout: timeoutMs,
      maxBuffer: 1_000_000,
      windowsHide: true,
      ...(signal === undefined ? {} : { signal }),
      ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (cause) {
    /**
     * Node builds this rejection's message from the whole command line, which
     * for an adapter means the entire script: a Windows screenshot failure
     * arrived as fifteen lines of echoed PowerShell with the actual reason
     * nowhere in it, and a timeout arrived as the same fifteen lines with an
     * empty stderr, indistinguishable from a script that failed instantly.
     *
     * Report the interpreter's own words instead, and name a timeout as a
     * timeout — a caller can act on "the helper was killed after 10000ms" and
     * can act on a permission error, but not on a copy of the script it did
     * not write.
     */
    const error = cause as NodeJS.ErrnoException & {
      stderr?: string;
      killed?: boolean;
    };
    const program = basename(file);
    if (error.killed === true || error.code === "ETIMEDOUT") {
      throw new Error(`computer_helper_timeout:${program}:${timeoutMs}ms`);
    }
    if (signal?.aborted === true) throw new Error("task_cancelled");
    // First line only: interpreters follow the reason with a stack trace naming
    // the script we generated, which is noise to whoever reads this.
    const reason = (error.stderr ?? "").trim().split("\n")[0]?.trim();
    throw new Error(
      reason === undefined || reason === ""
        ? `computer_helper_failed:${program}`
        : `computer_helper_failed:${program}: ${reason}`,
    );
  }
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

/**
 * `SendKeys` reads `+^%~(){}[]` as modifiers and grouping rather than as
 * literal characters, so a password containing `+` types a Shift chord and a
 * `(` opens a group that never closes. Each one is wrapped in braces, which is
 * how `SendKeys` spells "the literal character".
 *
 * Exported because it is the part of the Windows adapter worth testing on any
 * platform: the escaping is pure, and getting it wrong silently corrupts typed
 * text rather than failing.
 */
export function escapeSendKeys(text: string): string {
  return text.replace(/[+^%~(){}[\]]/g, (character) => `{${character}}`);
}

/** `SendKeys` names for the fixed key allowlist. */
const WINDOWS_KEYS: Record<string, string> = {
  ENTER: "{ENTER}",
  TAB: "{TAB}",
  SPACE: " ",
  BACKSPACE: "{BACKSPACE}",
  ESCAPE: "{ESC}",
  LEFT: "{LEFT}",
  RIGHT: "{RIGHT}",
  DOWN: "{DOWN}",
  UP: "{UP}",
  HOME: "{HOME}",
  END: "{END}",
  PAGEUP: "{PGUP}",
  PAGEDOWN: "{PGDN}",
  DELETE: "{DELETE}",
};

/**
 * Pointer and wheel input, which .NET does not expose — `SetCursorPos` and
 * `mouse_event` have to be reached through P/Invoke.
 *
 * Reads its inputs from the environment rather than being interpolated with
 * them, so nothing a caller supplies is ever parsed as PowerShell.
 */
const WINDOWS_POINTER_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MelraInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);
}
'@
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
if ($env:MELRA_NORMALIZED -eq '1') {
  $x = [int][Math]::Round($bounds.X + $bounds.Width * [double]$env:MELRA_X)
  $y = [int][Math]::Round($bounds.Y + $bounds.Height * [double]$env:MELRA_Y)
} else {
  $x = [int][Math]::Round([double]$env:MELRA_X)
  $y = [int][Math]::Round([double]$env:MELRA_Y)
}
if ($env:MELRA_MOVE -eq '1') { [void][MelraInput]::SetCursorPos($x, $y) }
if ($env:MELRA_CLICK -eq '1') {
  [MelraInput]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
  [MelraInput]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
}
if ($env:MELRA_WHEEL -ne $null -and $env:MELRA_WHEEL -ne '') {
  [MelraInput]::mouse_event(0x0800, 0, 0, [uint32][int]$env:MELRA_WHEEL, [IntPtr]::Zero)
}
Write-Output "$x $y"
`;

const WINDOWS_SCREENSHOT_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bitmap.Size)
  $bitmap.Save($env:MELRA_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
`;

const WINDOWS_TYPE_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait($env:MELRA_KEYS)
`;

/**
 * Windows computer use through Windows PowerShell and .NET.
 *
 * `capabilities` used to report `unavailable` here and every input action threw
 * a bare `computer_use_unavailable`, which is the whole of Windows computer use
 * being missing rather than degraded.
 *
 * PowerShell is in the terminal runtime's unconditional deny list, and stays
 * there: this is the trusted adapter invoking a fixed script it owns, the same
 * arrangement under which the macOS adapter uses `osascript`. Nothing a caller
 * supplies reaches the script as source — coordinates, wheel deltas, and text
 * arrive in the environment.
 */
class WindowsAdapter implements ComputerAdapter {
  private readonly powershell = join(
    process.env["SystemRoot"] ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );

  async capabilities(): Promise<ComputerCapabilities> {
    // Windows PowerShell 5.1 ships with the OS, so this is present unless the
    // install has been trimmed. `pwsh` is deliberately not consulted: it is an
    // optional install and its absence is not the question being asked.
    const available = await executable(this.powershell);
    return {
      platform: "win32",
      adapter: "windows-powershell",
      available,
      screenshot: available,
      pointer: available,
      keyboard: available,
      scroll: available,
      coordinateSpaces: ["normalized", "pixel"],
      limitations: [
        ...(available
          ? []
          : ["Windows PowerShell was not found at the expected system path"]),
        "input is delivered to whichever window holds focus; focus is not verified",
        "SendKeys cannot type into a window running elevated unless this process is elevated too",
        "normalized coordinates span the whole virtual desktop, not one display",
        "per-monitor DPI scaling is not compensated for",
        "every action pays PowerShell startup, and pointer/scroll additionally compile a P/Invoke shim, so raise timeoutMs above its 10s default on a slow or loaded machine",
      ],
    };
  }

  private async powershellScript(
    script: string,
    operation: ComputerOperation,
    env: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!(await executable(this.powershell))) {
      throw new Error("computer_input_unavailable");
    }
    const { stdout } = await run(
      this.powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      operation.timeoutMs,
      signal,
      env,
    );
    return stdout;
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
        const path = join(artifactDirectory, `computer-${randomUUID()}.png`);
        await this.powershellScript(
          WINDOWS_SCREENSHOT_SCRIPT,
          operation,
          { MELRA_PATH: path },
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
      case "move": {
        if (operation.x === undefined || operation.y === undefined) {
          throw new Error(`computer_${operation.action}_requires_coordinates`);
        }
        const stdout = await this.powershellScript(
          WINDOWS_POINTER_SCRIPT,
          operation,
          {
            MELRA_X: String(operation.x),
            MELRA_Y: String(operation.y),
            MELRA_NORMALIZED: operation.coordinateSpace === "normalized" ? "1" : "0",
            MELRA_MOVE: "1",
            MELRA_CLICK: operation.action === "click" ? "1" : "0",
            MELRA_WHEEL: "",
          },
          signal,
        );
        // The script resolves normalized coordinates against the virtual
        // desktop, so the pixel point it actually used is reported back rather
        // than recomputed here from a display size this process never saw.
        const [x, y] = stdout.trim().split(/\s+/).map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error("computer_display_geometry_unavailable");
        }
        return {
          success: true,
          action: operation.action,
          coordinateSpace: operation.coordinateSpace,
          x,
          y,
        };
      }
      case "type": {
        if (operation.text === undefined) {
          throw new Error("computer_type_requires_text");
        }
        await this.powershellScript(
          WINDOWS_TYPE_SCRIPT,
          operation,
          { MELRA_KEYS: escapeSendKeys(operation.text) },
          signal,
        );
        return { success: true, action: "type", characters: operation.text.length };
      }
      case "key": {
        const key = operation.key?.toLocaleUpperCase();
        const sequence = key === undefined ? undefined : WINDOWS_KEYS[key];
        if (sequence === undefined) throw new Error("computer_key_not_allowed");
        await this.powershellScript(
          WINDOWS_TYPE_SCRIPT,
          operation,
          { MELRA_KEYS: sequence },
          signal,
        );
        return { success: true, action: "key", key };
      }
      case "scroll": {
        const deltaY = operation.deltaY ?? 0;
        // One wheel notch is 120 units, and the sign is inverted against the
        // web convention: a positive `deltaY` scrolls the page down, which is a
        // negative wheel rotation.
        const notches = Math.max(-20, Math.min(20, Math.round(deltaY / 100)));
        // The wheel goes to the window under the cursor, so scroll positions it
        // first when told where — and leaves it alone when not, rather than
        // parking it at the origin and scrolling whatever happens to be there.
        const positioned = operation.x !== undefined && operation.y !== undefined;
        await this.powershellScript(
          WINDOWS_POINTER_SCRIPT,
          operation,
          {
            MELRA_X: String(operation.x ?? 0),
            MELRA_Y: String(operation.y ?? 0),
            MELRA_NORMALIZED: operation.coordinateSpace === "normalized" ? "1" : "0",
            MELRA_MOVE: positioned ? "1" : "0",
            MELRA_CLICK: "0",
            MELRA_WHEEL: String(-notches * 120),
          },
          signal,
        );
        return { success: true, action: "scroll", deltaY };
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
  if (process.platform === "win32") return new WindowsAdapter();
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
