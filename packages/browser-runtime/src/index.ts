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
import type { BrowserOperation } from "@melra/protocol";
import {
  connectBrowser,
  type BrowserConnection,
} from "./browser-connection.js";
import {
  assertSafeUrl,
  type NetworkPolicy,
} from "./network-policy.js";
import { buildSelector } from "./selector.js";
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

  /**
   * Resolve a target to a locator that actually matches something.
   *
   * Text matching used to be `exact: true` only, which fails on the whitespace,
   * casing, and nested-markup differences that real pages are full of — a button
   * rendered as `<button> Sign in </button>` never matched `"Sign in"`. Exact is
   * still tried first so a precise caller keeps precise behaviour; the substring
   * form is only consulted when exact found nothing.
   *
   * A target that matches nothing is reported as such instead of being handed to
   * Playwright to fail as an opaque action timeout thirty seconds later.
   */
  private async locator(page: Page, operation: BrowserOperation): Promise<Locator> {
    const target = operation.target;
    if (target === undefined) throw new Error("browser_action_requires_target");
    const candidates: Locator[] = [];
    if (target.role !== undefined) {
      candidates.push(
        page.getByRole(target.role as Parameters<Page["getByRole"]>[0], {
          ...(target.name === undefined ? {} : { name: target.name }),
        }),
      );
    }
    if (target.selector !== undefined) candidates.push(page.locator(target.selector));
    if (target.text !== undefined) {
      candidates.push(
        page.getByText(target.text, { exact: true }),
        page.getByText(target.text, { exact: false }),
      );
    }
    if (candidates.length === 0) {
      throw new Error("browser_target_requires_role_selector_or_text");
    }
    for (const candidate of candidates) {
      if ((await candidate.count()) > 0) return candidate;
    }
    throw new Error(
      `browser_target_not_found:${JSON.stringify(target)}`,
    );
  }

  private async snapshot(page: Page, maxChars: number): Promise<Record<string, unknown>> {
    const data = await page.evaluate((limit) => {
      const text = document.body?.innerText ?? "";
      /**
       * Walk up from the element recording the position of each ancestor, and
       * stop at the first one the page has labelled. The selector string is
       * assembled by the caller so the interesting part stays testable.
       */
      const describe = (element: Element) => {
        const chain: {
          tag: string;
          nth: number;
          id?: string;
          testId?: string;
        }[] = [];
        for (
          let node: Element | null = element;
          node !== null && chain.length < 12;
          node = node.parentElement
        ) {
          const parent: Element | null = node.parentElement;
          const id = node.id === "" ? undefined : node.id;
          const testId = node.getAttribute("data-testid") ?? undefined;
          chain.unshift({
            tag: node.tagName.toLowerCase(),
            nth:
              parent === null
                ? 1
                : Array.prototype.indexOf.call(parent.children, node) + 1,
            ...(id === undefined ? {} : { id }),
            ...(testId === undefined ? {} : { testId }),
          });
          if (id !== undefined || testId !== undefined) break;
        }
        return chain;
      };
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
        .map((element, index) => ({
          index,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          name:
            element.getAttribute("aria-label") ??
            element.getAttribute("alt") ??
            element.getAttribute("title") ??
            element.innerText?.trim().slice(0, 200) ??
            null,
          type: element.getAttribute("type"),
          // Everything below is what a caller needs to address the element it is
          // looking at. Without it a snapshot could be read but not acted on.
          chain: describe(element),
          id: element.id === "" ? null : element.id,
          testId: element.getAttribute("data-testid"),
          attributeName: element.getAttribute("name"),
          placeholder: element.getAttribute("placeholder"),
          href: element.getAttribute("href"),
          value:
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
              ? element.value.slice(0, 200)
              : null,
          disabled:
            element instanceof HTMLInputElement ||
            element instanceof HTMLButtonElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement
              ? element.disabled
              : null,
          checked:
            element instanceof HTMLInputElement ? element.checked : null,
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
      elements: data.elements.map(({ chain, ...element }) => ({
        ...element,
        selector: buildSelector(chain),
      })),
      untrustedContent: true,
    };
  }

  /**
   * Read one element rather than the whole page.
   *
   * The old server had `extract_text` and `extract_html`; both were dropped, so
   * a caller wanting one table out of a large document had to take the entire
   * page text and cut it up itself. `inspect` already accepts a target, so
   * scoping it needs no new action.
   */
  private async extract(
    page: Page,
    operation: BrowserOperation,
  ): Promise<Record<string, unknown>> {
    const locator = (await this.locator(page, operation)).first();
    const [text, html] = await Promise.all([
      locator.innerText({ timeout: operation.timeoutMs }),
      locator.innerHTML({ timeout: operation.timeoutMs }),
    ]);
    return {
      url: page.url(),
      title: await page.title(),
      target: operation.target,
      text: text.slice(0, operation.maxChars),
      html: html.slice(0, operation.maxChars),
      truncated:
        text.length > operation.maxChars || html.length > operation.maxChars,
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
        return operation.target === undefined
          ? await this.snapshot(page, operation.maxChars)
          : await this.extract(page, operation);
      case "click": {
        await (await this.locator(page, operation)).first().click({
          timeout: operation.timeoutMs,
        });
        return {
          clicked: true,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "type": {
        if (operation.value === undefined) throw new Error("browser_type_requires_value");
        await (await this.locator(page, operation)).first().fill(operation.value, {
          timeout: operation.timeoutMs,
        });
        return {
          typed: true,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "select": {
        if (operation.values === undefined) throw new Error("browser_select_requires_values");
        const selected = await (await this.locator(page, operation))
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
          operation.target === undefined
            ? page.locator("body")
            : await this.locator(page, operation);
        await locator.first().press(operation.key, { timeout: operation.timeoutMs });
        return {
          pressed: operation.key,
          ...(await this.settledSnapshot(page, operation)),
        };
      }
      case "scroll": {
        const direction = operation.direction ?? "down";
        if (direction === "into_view") {
          await (await this.locator(page, operation)).first().scrollIntoViewIfNeeded({
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
        await (await this.locator(page, operation)).first().setInputFiles(files, {
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
        await (await this.locator(page, operation)).first().click({
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
export * from "./selector.js";
export * from "./stable-dom.js";
export * from "./browser-connection.js";
