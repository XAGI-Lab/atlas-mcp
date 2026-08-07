// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

// Bounded test runner.
//
// Every package runs a bare `vitest run` with no config of its own, so each one
// sizes its fork pool from the core count (`cores - 1`). Run those recursively
// and the two fan-outs multiply: N packages in flight x ~9 forks each, every
// fork a fresh V8 heap. On a 10-core machine that peaked near 40 Node processes
// and exhausted memory.
//
// This caps both levels from one place and derives the cap from the machine
// rather than a number that happens to fit the author's laptop.

import { spawn } from "node:child_process";
import { cpus, totalmem } from "node:os";

// A test fork here peaks around 400 MB (SQLite, Playwright-core, MCP servers).
// Budget a quarter of RAM for the pool so the rest of the system keeps running,
// and never let the pool exceed the cores that would actually serve it.
const GIB = 1024 ** 3;
const PER_FORK_GIB = 0.4;
const RAM_BUDGET = Math.floor((totalmem() / GIB) * 0.25 / PER_FORK_GIB);
const processBudget = Math.max(2, Math.min(cpus().length - 2, RAM_BUDGET));

// Split the budget across the two levels. Package-level concurrency buys less
// than fork-level does (each package pays a fresh vitest startup), so keep it
// small and give the remainder to forks.
const workspaceConcurrency = processBudget >= 4 ? 2 : 1;
const maxWorkers = Math.max(1, Math.floor(processBudget / workspaceConcurrency));

const passthrough = process.argv.slice(2);

console.error(
  `[run-tests] ${cpus().length} cores, ` +
    `${(totalmem() / GIB).toFixed(1)} GiB RAM -> ` +
    `${workspaceConcurrency} package(s) x ${maxWorkers} worker(s)`,
);

const child = spawn(
  "pnpm",
  [
    "-r",
    `--workspace-concurrency=${workspaceConcurrency}`,
    ...passthrough,
    "test",
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      // Vitest reads these when a project declares no pool options, which is
      // the case for every package here. Both pairs are set because a package
      // may switch pools; whichever is active honours its own pair.
      VITEST_MAX_FORKS: String(maxWorkers),
      VITEST_MAX_THREADS: String(maxWorkers),
      VITEST_MIN_FORKS: "1",
      VITEST_MIN_THREADS: "1",
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
