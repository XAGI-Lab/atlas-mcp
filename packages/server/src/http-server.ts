// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { capabilitiesPayload, createMcpServer } from "./mcp-server.js";
import type { MelraRuntime } from "./runtime.js";
import { consolePage } from "./console-page.js";

export const DEFAULT_HTTP_PORT = 7457;

export interface MelraHttpOptions {
  runtime: MelraRuntime;
  /** Loopback by default. Anything else exposes a machine-control API. */
  host?: string;
  port?: number;
  /** Falls back to `MELRA_HTTP_TOKEN`, then to a fresh random token. */
  token?: string;
  environment?: NodeJS.ProcessEnv;
}

export interface MelraHttpServer {
  /** Console URL, token included, ready to open. */
  url: string;
  /** MCP endpoint for a Streamable HTTP client. */
  mcpUrl: string;
  token: string;
  host: string;
  port: number;
  close(): Promise<void>;
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const text = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
  });
  response.end(text);
}

/**
 * Length-independent comparison. The token guards a local API that can run
 * commands, so a timing oracle on it is worth closing even on loopback.
 */
function tokenMatches(expected: string, supplied: string | undefined): boolean {
  if (supplied === undefined) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function suppliedToken(
  request: IncomingMessage,
  url: URL,
): string | undefined {
  const header = request.headers.authorization;
  if (header !== undefined && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  // `EventSource` cannot set headers, so the stream and the page it lives on
  // have to be reachable with the token in the query string.
  return url.searchParams.get("token") ?? undefined;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    // A local API still needs a ceiling: an unbounded POST is a way to run the
    // host out of memory without touching policy at all.
    if (size > 4_000_000) throw new Error("request_body_too_large");
    chunks.push(buffer);
  }
  if (size === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function serveHttp(
  options: MelraHttpOptions,
): Promise<MelraHttpServer> {
  const environment = options.environment ?? process.env;
  const host = options.host ?? "127.0.0.1";
  const configuredPort = Number(environment.MELRA_HTTP_PORT ?? "");
  const port =
    options.port ??
    (Number.isInteger(configuredPort) &&
    configuredPort >= 0 &&
    configuredPort <= 65_535
      ? configuredPort
      : DEFAULT_HTTP_PORT);
  const token =
    options.token ??
    environment.MELRA_HTTP_TOKEN?.trim() ??
    randomUUID().replaceAll("-", "");
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const runtime = options.runtime;

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // An id that resolves to nothing is a 404, not a malformed request. The
      // controllers signal that the only way they can, by throwing.
      const status = message.endsWith("_not_found") ? 404 : 400;
      if (!response.headersSent) json(response, status, { error: message });
      else response.end();
    });
  });

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (!tokenMatches(token, suppliedToken(request, url))) {
      json(response, 401, {
        error: "unauthorized",
        detail:
          "Send the token printed at startup as `Authorization: Bearer <token>` or `?token=<token>`.",
      });
      return;
    }
    if (url.pathname === "/mcp") {
      await handleMcp(request, response);
      return;
    }
    await handleApi(request, response, url);
  }

  async function handleMcp(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const sessionId = request.headers["mcp-session-id"];
    const existing =
      typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
    if (existing !== undefined) {
      await existing.handleRequest(request, response);
      return;
    }
    if (request.method !== "POST") {
      json(response, 400, { error: "mcp_session_not_found" });
      return;
    }
    const body = await readBody(request);
    if (sessionId !== undefined || !isInitializeRequest(body)) {
      json(response, 400, { error: "mcp_session_not_found" });
      return;
    }
    // One MCP server per session, one runtime underneath. Sessions are isolated
    // in protocol state; durable state is shared exactly as two stdio servers
    // over one data directory already share it, and the workflow leases are
    // what keep that safe.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    const mcp = createMcpServer(runtime);
    transport.onclose = () => {
      if (transport.sessionId !== undefined) {
        sessions.delete(transport.sessionId);
      }
    };
    // The transport declares `onclose` as a getter returning
    // `(() => void) | undefined`, which `exactOptionalPropertyTypes` will not
    // accept against `Transport`'s `onclose?: () => void`. The runtime shape is
    // right; only the SDK's declaration disagrees.
    await mcp.connect(transport as unknown as Transport);
    await transport.handleRequest(request, response, body);
  }

  async function handleApi(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<void> {
    if (request.method !== "GET") {
      json(response, 405, { error: "method_not_allowed" });
      return;
    }
    const path = url.pathname;
    if (path === "/" || path === "/index.html") {
      const page = consolePage();
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(page),
      });
      response.end(page);
      return;
    }
    if (path === "/api/capabilities") {
      json(response, 200, capabilitiesPayload(runtime));
      return;
    }
    if (path === "/api/workflows") {
      json(response, 200, { workflows: runtime.store.listWorkflowRuns() });
      return;
    }
    if (path === "/api/tasks") {
      const limit = Number(url.searchParams.get("limit") ?? "50");
      json(response, 200, {
        tasks: runtime.store.listTasks(
          Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 50,
        ),
      });
      return;
    }
    const workflowEvents = /^\/api\/workflows\/([^/]+)\/events$/.exec(path);
    if (workflowEvents?.[1] !== undefined) {
      const after = Number(url.searchParams.get("after") ?? "0");
      json(response, 200, {
        events: runtime.workflows.events(
          workflowEvents[1],
          Number.isFinite(after) ? after : 0,
        ),
      });
      return;
    }
    const workflowStream = /^\/api\/workflows\/([^/]+)\/stream$/.exec(path);
    if (workflowStream?.[1] !== undefined) {
      streamWorkflow(response, workflowStream[1], url);
      return;
    }
    const workflow = /^\/api\/workflows\/([^/]+)$/.exec(path);
    if (workflow?.[1] !== undefined) {
      json(response, 200, runtime.workflows.status(workflow[1]));
      return;
    }
    const receipts = /^\/api\/tasks\/([^/]+)\/receipts$/.exec(path);
    if (receipts?.[1] !== undefined) {
      json(response, 200, runtime.controller.receipts({ taskId: receipts[1] }));
      return;
    }
    const task = /^\/api\/tasks\/([^/]+)$/.exec(path);
    if (task?.[1] !== undefined) {
      json(response, 200, runtime.controller.status(task[1]));
      return;
    }
    json(response, 404, { error: "not_found", path });
  }

  /**
   * Append-only events replayed from `after` and then followed live.
   *
   * ponytail: polls the event table. The store has no change notification and a
   * local console watching one workflow is not worth building one for; swap in
   * a listener here if the console ever follows every workflow at once.
   */
  function streamWorkflow(
    response: ServerResponse,
    workflowId: string,
    url: URL,
  ): void {
    // Resolve the id before committing to a 200: a typo should be a 404, not an
    // open stream that never says anything.
    runtime.workflows.status(workflowId);
    const parsed = Number(url.searchParams.get("after") ?? "0");
    let cursor = Number.isFinite(parsed) ? parsed : 0;
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const tick = () => {
      let events;
      try {
        events = runtime.workflows.events(workflowId, cursor);
      } catch {
        response.end();
        return;
      }
      for (const event of events) {
        cursor = event.sequence;
        // Deliberately unnamed frames. `WorkflowEvent.type` is an open string,
        // so naming the SSE event would make every consumer enumerate a set
        // that grows with each node type; the type rides inside the payload.
        response.write(
          `id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      }
      // A comment frame keeps intermediaries and the client's own idle timer
      // from closing a workflow that is simply waiting on an approval.
      response.write(": keep-alive\n\n");
    };
    tick();
    const timer = setInterval(tick, 500);
    timer.unref();
    response.on("close", () => {
      clearInterval(timer);
    });
  }

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  const boundPort =
    typeof address === "object" && address !== null ? address.port : port;

  return {
    url: `http://${host}:${boundPort}/?token=${token}`,
    mcpUrl: `http://${host}:${boundPort}/mcp`,
    token,
    host,
    port: boundPort,
    async close() {
      for (const session of sessions.values()) await session.close();
      sessions.clear();
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
        // An open event stream is a live socket, and `close` waits on live
        // sockets. Without this a console left open holds the process forever.
        server.closeAllConnections();
      });
    },
  };
}
