// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";

await mkdir("tmp", { recursive: true });
const requirements = "tmp/sdk-py-audit-requirements.txt";
execFileSync(
  "uv",
  [
    "export",
    "--project",
    "sdk-py",
    "--format",
    "requirements-txt",
    "--no-dev",
    "--no-emit-project",
    "--quiet",
    "--output-file",
    requirements,
  ],
  { stdio: "inherit" },
);
execFileSync(
  "uvx",
  [
    "pip-audit",
    "--strict",
    "--no-deps",
    "--disable-pip",
    "--requirement",
    requirements,
  ],
  { stdio: "inherit" },
);
