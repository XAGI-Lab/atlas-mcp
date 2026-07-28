// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface CliEnvironment {
  workspaceRoot: string;
  dataDirectory: string;
  policyPath?: string;
  browserExecutablePath?: string;
  browserCdpEndpoint?: string;
  browserCdpContextIndex?: number;
  browserHarPath?: string;
}

export interface CliEnvironmentDefaults {
  cwd: string;
  home: string;
}

function cdpEndpoint(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("browser_cdp_endpoint_invalid");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("browser_cdp_endpoint_invalid");
  }
  return parsed.href;
}

function cdpContextIndex(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^-?\d+$/.test(value)) {
    throw new Error("browser_cdp_context_index_invalid");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < -1) {
    throw new Error("browser_cdp_context_index_invalid");
  }
  return parsed;
}

function harPath(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!isAbsolute(value)) {
    throw new Error("browser_har_path_must_be_absolute");
  }
  return resolve(value);
}

export function parseCliEnvironment(
  source: NodeJS.ProcessEnv,
  defaults: CliEnvironmentDefaults = {
    cwd: process.cwd(),
    home: homedir(),
  },
): CliEnvironment {
  const endpoint = cdpEndpoint(source.ATLAS_MCP_BROWSER_CDP_ENDPOINT);
  const contextIndex = cdpContextIndex(
    source.ATLAS_MCP_BROWSER_CDP_CONTEXT_INDEX,
  );
  const recordHarPath = harPath(source.ATLAS_MCP_BROWSER_HAR_PATH);
  if (endpoint !== undefined && recordHarPath !== undefined) {
    throw new Error("browser_cdp_cannot_start_har_recording");
  }
  if (contextIndex !== undefined && endpoint === undefined) {
    throw new Error("browser_cdp_context_requires_endpoint");
  }
  return {
    workspaceRoot: resolve(
      source.ATLAS_MCP_WORKSPACE ?? defaults.cwd,
    ),
    dataDirectory: resolve(
      source.ATLAS_MCP_HOME ?? join(defaults.home, ".atlas-mcp"),
    ),
    ...(source.ATLAS_MCP_POLICY === undefined
      ? {}
      : { policyPath: resolve(source.ATLAS_MCP_POLICY) }),
    ...(source.ATLAS_MCP_BROWSER === undefined
      ? {}
      : { browserExecutablePath: resolve(source.ATLAS_MCP_BROWSER) }),
    ...(endpoint === undefined ? {} : { browserCdpEndpoint: endpoint }),
    ...(contextIndex === undefined
      ? {}
      : { browserCdpContextIndex: contextIndex }),
    ...(recordHarPath === undefined ? {} : { browserHarPath: recordHarPath }),
  };
}
