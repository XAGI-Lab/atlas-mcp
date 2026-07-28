// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  Browser,
  BrowserContext,
  Locator,
  Page,
  Route,
} from "playwright-core";
import type { BrowserOperation } from "@atlas-mcp/protocol";
import {
  connectBrowser,
  type BrowserConnection,
} from "./browser-connection.js";
import {
  assertSafeUrl,
  type NetworkPolicy,
} from "./network-policy.js";
import { waitForStableDom } from "./stable-dom.js";

export interface BrowserRuntimeOptions extends NetworkPolicy {
  artifactDirectory: string;
  workspaceRoot: string;
  executablePath?: string;
  headless?: boolean;
  cdpEndpoint?: string;
  cdpContextIndex?: number;
  recordHarPath?: string;
}

export class BrowserRuntime {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private activePage: Page | undefined;
  private connection: BrowserConnection | undefined;
  private routeHandler: ((route: Route) => Promise<void>) | undefined;

  constructor(private readonly options: BrowserRuntimeOptions) {}

  private async uploadPaths(paths: string[]): Promise<string[]> {
    const root = await realpath(this.options.workspaceRoot);
    const resolved: string[] = [];
    for (const input of paths) {
      const candidate = resolve(root, input);
      const rel = relative(root, candidate);
      if (
        rel === ".." ||
        rel.startsWith(`..${sep}`) ||
        isAbsolute(rel)
      ) {
        throw new Error("browser_upload_outside_workspace");
      }
      const actual = await realpath(candidate);
      const actualRelative = relative(root, actual);
      if (
        actualRelative === ".." ||
        actualRelative.startsWith(`..${sep}`) ||
        isAbsolute(actualRelative)
      ) {
        throw new Error("browser_upload_outside_workspace");
      }
      if (!(await stat(actual)).isFile()) {
        throw new Error("browser_upload_requires_regular_file");
      }
      resolved.push(actual);
    }
    return resolved;
  }

  private async ensureContext(): Promise<BrowserContext> {
    if (this.context !== undefined) return this.context;
    await mkdir(this.options.artifactDirectory, { recursive: true });
    if (this.options.recordHarPath !== undefined) {
      await mkdir(dirname(this.options.recordHarPath), { recursive: true });
    }
    const connection = await connectBrowser({
      ...(this.options.executablePath === undefined
        ? {}
        : { executablePath: this.options.executablePath }),
      headless: this.options.headless ?? true,
      ...(this.options.cdpEndpoint === undefined
        ? {}
        : { cdpEndpoint: this.options.cdpEndpoint }),
      ...(this.options.cdpContextIndex === undefined
        ? {}
        : { cdpContextIndex: this.options.cdpContextIndex }),
      ...(this.options.recordHarPath === undefined
        ? {}
        : { recordHarPath: this.options.recordHarPath }),
    });
    this.connection = connection;
    this.browser = connection.browser;
    this.context = connection.context;
    this.routeHandler = async (route) => {
      const requestUrl = route.request().url();
      if (
        requestUrl.startsWith("data:") ||
        requestUrl.startsWith("blob:") ||
        requestUrl.startsWith("about:")
      ) {
        await route.continue();
        return;
      }
      try {
        await assertSafeUrl(requestUrl, this.options);
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    };
    await this.context.route("**/*", this.routeHandler);
    this.context.on("close", () => {
      this.context = undefined;
      this.activePage = undefined;
    });
    return this.context;
  }

  private async page(): Promise<Page> {
    const context = await this.ensureContext();
    if (this.activePage !== undefined && !this.activePage.isClosed()) {
      return this.activePage;
    }
    this.activePage = context.pages()[0] ?? (await context.newPage());
    return this.activePage;
  }

  private locator(page: Page, operation: BrowserOperation): Locator {
    const target = operation.target;
    if (target === undefined) throw new Error("browser_action_requires_target");
    if (target.role !== undefined) {
      return page.getByRole(target.role as Parameters<Page["getByRole"]>[0], {
        ...(target.name === undefined ? {} : { name: target.name }),
      });
    }
    if (target.selector !== undefined) return page.locator(target.selector);
    if (target.text !== undefined) return page.getByText(target.text, { exact: true });
    throw new Error("browser_target_requires_role_selector_or_text");
  }

  private async snapshot(page: Page, maxChars: number): Promise<Record<string, unknown>> {
    const data = await page.evaluate((limit) => {
      const text = document.body?.innerText ?? "";
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(
          "a,button,input,select,textarea,[role],[tabindex]",
        ),
      )
        .filter((element) => {
          const style = window.getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && box.width > 0;
        })
        .slice(0, 250)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          name:
            element.getAttribute("aria-label") ??
            element.getAttribute("alt") ??
            element.getAttribute("title") ??
            element.innerText?.trim().slice(0, 200) ??
            null,
          type: element.getAttribute("type"),
        }));
      return {
        text: text.slice(0, limit),
        truncated: text.length > limit,
        elements,
      };
    }, maxChars);
    return {
      url: page.url(),
      title: await page.title(),
      ...data,
      untrustedContent: true,
    };
  }

  private async settledSnapshot(
    page: Page,
    operation: BrowserOperation,
  ): Promise<Record<string, unknown>> {
    const settle = await waitForStableDom(page, {
      quietWindowMs: operation.settleQuietMs,
      timeoutMs: operation.settleTimeoutMs,
    });
    return {
      settle,
      ...(await this.snapshot(page, operation.maxChars)),
    };
  }

  async execute(operation: BrowserOperation): Promise<Record<string, unknown>> {
    const page = await this.page();
    switch (operation.action) {
      case "navigate": {
        if (operation.url === undefined) throw new Error("browser_navigate_requires_url");
        await assertSafeUrl(operation.url, this.options);
        const response = await page.goto(operation.url, {
          waitUntil: "domcontentloaded",
          timeout: operation.timeoutMs,
        });
        return {
          status: response?.status() ?? null,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "inspect":
        return await this.snapshot(page, operation.maxChars);
      case "click": {
        await this.locator(page, operation).first().click({
          timeout: operation.timeoutMs,
        });
        return {
          clicked: true,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "type": {
        if (operation.value === undefined) throw new Error("browser_type_requires_value");
        await this.locator(page, operation).first().fill(operation.value, {
          timeout: operation.timeoutMs,
        });
        return {
          typed: true,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "select": {
        if (operation.values === undefined) throw new Error("browser_select_requires_values");
        const selected = await this.locator(page, operation)
          .first()
          .selectOption(operation.values, { timeout: operation.timeoutMs });
        return {
          selected,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "press": {
        if (operation.key === undefined) throw new Error("browser_press_requires_key");
        const locator =
          operation.target === undefined ? page.locator("body") : this.locator(page, operation);
        await locator.first().press(operation.key, { timeout: operation.timeoutMs });
        return {
          pressed: operation.key,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "scroll": {
        const direction = operation.direction ?? "down";
        if (direction === "into_view") {
          await this.locator(page, operation).first().scrollIntoViewIfNeeded({
            timeout: operation.timeoutMs,
          });
        } else {
          await page.evaluate((value) => {
            if (value === "top") window.scrollTo(0, 0);
            else if (value === "bottom") window.scrollTo(0, document.body.scrollHeight);
            else window.scrollBy(0, value === "up" ? -600 : 600);
          }, direction);
        }
        return {
          scrolled: direction,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "screenshot": {
        const path = join(
          this.options.artifactDirectory,
          `browser-${randomUUID()}.png`,
        );
        await page.screenshot({ path, fullPage: operation.fullPage, type: "png" });
        const bytes = await readFile(path);
        return {
          captured: true,
          path,
          size: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          url: page.url(),
          title: await page.title(),
        };
      }
      case "upload": {
        if (operation.filePaths === undefined) {
          throw new Error("browser_upload_requires_file_paths");
        }
        const files = await this.uploadPaths(operation.filePaths);
        await this.locator(page, operation).first().setInputFiles(files, {
          timeout: operation.timeoutMs,
        });
        return {
          uploaded: files.length,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "download": {
        const downloadPromise = page.waitForEvent("download", {
          timeout: operation.timeoutMs,
        });
        await this.locator(page, operation).first().click({
          timeout: operation.timeoutMs,
        });
        const download = await downloadPromise;
        const suggested = download.suggestedFilename().replaceAll(/[^A-Za-z0-9._-]/g, "_");
        const path = join(
          this.options.artifactDirectory,
          `${randomUUID()}-${suggested || "download"}`,
        );
        await download.saveAs(path);
        const bytes = await readFile(path);
        return {
          downloaded: true,
          path,
          suggestedFilename: download.suggestedFilename(),
          size: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          url: page.url(),
          settle: await waitForStableDom(page, {
            quietWindowMs: operation.settleQuietMs,
            timeoutMs: operation.settleTimeoutMs,
          }),
        };
      }
      case "tabs": {
        const context = await this.ensureContext();
        const tabs = await Promise.all(
          context.pages().map(async (item, index) => ({
            index,
            url: item.url(),
            title: await item.title(),
            active: item === this.activePage,
          })),
        );
        return { tabs };
      }
      case "close": {
        const context = await this.ensureContext();
        const pages = context.pages();
        const target =
          operation.tabIndex === undefined
            ? page
            : pages[operation.tabIndex];
        if (target === undefined) throw new Error("browser_tab_not_found");
        const url = target.url();
        await target.close();
        this.activePage = context.pages().at(-1);
        return { closed: true, url };
      }
    }
  }

  async close(): Promise<void> {
    const connection = this.connection;
    if (
      connection !== undefined &&
      !connection.ownsContext &&
      this.routeHandler !== undefined
    ) {
      await connection.context
        .unroute("**/*", this.routeHandler)
        .catch(() => undefined);
    }
    if (connection?.ownsContext === true) {
      await connection.context.close().catch(() => undefined);
    }
    if (connection?.ownsBrowser === true) {
      await connection.browser.close().catch(() => undefined);
    }
    this.activePage = undefined;
    this.context = undefined;
    this.browser = undefined;
    this.connection = undefined;
    this.routeHandler = undefined;
  }
}

export * from "./network-policy.js";
export * from "./stable-dom.js";
export * from "./browser-connection.js";
