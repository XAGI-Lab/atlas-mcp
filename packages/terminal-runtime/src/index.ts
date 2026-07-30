// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { TerminalOperation } from "@melra/protocol";

export interface TerminalRuntimeOptions {
  root: string;
  allowedEnvironment?: string[];
  baseEnvironment?: NodeJS.ProcessEnv;
}

const SECRET_PATTERNS: RegExp[] = [
  /\bgh[opurs]_[A-Za-z0-9]{20,}\b/g,
  /\b(?:sk|pk|api)[-_][a-z0-9_-]{16,}\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi,
  /\b(password|passwd|secret)\s*[:=]\s*\S+/gi,
];

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function redactTerminalOutput(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value,
  );
}

interface PreparedCommand {
  command: string;
  args: string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputChars: number;
}

interface BackgroundJob {
  id: string;
  child: ChildProcess;
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  truncated: boolean;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
  timer: NodeJS.Timeout;
}

export class TerminalRuntime {
  readonly root: string;
  readonly allowedEnvironment: Set<string>;
  readonly baseEnvironment: NodeJS.ProcessEnv;
  private readonly jobs = new Map<string, BackgroundJob>();

  private constructor(
    options: TerminalRuntimeOptions,
    root: string,
  ) {
    this.root = root;
    this.allowedEnvironment = new Set(
      options.allowedEnvironment ?? ["CI", "LANG", "LC_ALL", "NO_COLOR", "TERM"],
    );
    this.baseEnvironment = options.baseEnvironment ?? process.env;
  }

  static async create(options: TerminalRuntimeOptions): Promise<TerminalRuntime> {
    return new TerminalRuntime(options, await realpath(options.root));
  }

  private async resolveCwd(cwd: string | undefined): Promise<string> {
    const candidate = resolve(this.root, cwd ?? ".");
    if (!inside(this.root, candidate)) throw new Error("cwd_outside_workspace");
    const actual = await realpath(candidate);
    if (!inside(this.root, actual)) throw new Error("cwd_outside_workspace");
    return actual;
  }

  private async prepare(operation: TerminalOperation): Promise<PreparedCommand> {
    if (operation.command === undefined) {
      throw new Error(`terminal_${operation.action}_requires_command`);
    }
    if (operation.command.includes("\0") || operation.args.some((arg) => arg.includes("\0"))) {
      throw new Error("terminal_input_contains_null");
    }
    const cwd = await this.resolveCwd(operation.cwd);
    const environment: NodeJS.ProcessEnv = {};
    for (const name of ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR"]) {
      if (this.baseEnvironment[name] !== undefined) {
        environment[name] = this.baseEnvironment[name];
      }
    }
    for (const name of this.allowedEnvironment) {
      if (this.baseEnvironment[name] !== undefined) {
        environment[name] = this.baseEnvironment[name];
      }
    }
    for (const [name, value] of Object.entries(operation.env ?? {})) {
      if (!this.allowedEnvironment.has(name)) {
        throw new Error(`environment_variable_not_allowed:${name}`);
      }
      environment[name] = value;
    }
    return {
      command: operation.command,
      args: operation.args,
      cwd,
      environment,
      timeoutMs: operation.timeoutMs,
      maxOutputChars: operation.maxOutputChars,
    };
  }

  private async runForeground(
    prepared: PreparedCommand,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return await new Promise<Record<string, unknown>>((resolvePromise, reject) => {
      const child = spawn(prepared.command, prepared.args, {
        cwd: prepared.cwd,
        env: prepared.environment,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        signal,
      });
      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;

      const append = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString("utf8");
        if (next.length > prepared.maxOutputChars) {
          truncated = true;
          return next.slice(0, prepared.maxOutputChars);
        }
        return next;
      };
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = append(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = append(stderr, chunk);
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
      }, prepared.timeoutMs);
      timer.unref();

      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (code, terminationSignal) => {
        clearTimeout(timer);
        resolvePromise({
          command: prepared.command,
          args: prepared.args,
          cwd: relative(this.root, prepared.cwd) || ".",
          exitCode: code,
          signal: terminationSignal,
          timedOut,
          stdout: redactTerminalOutput(stdout),
          stderr: redactTerminalOutput(stderr),
          truncated,
          success: code === 0 && !timedOut,
        });
      });
    });
  }

  private async startBackground(
    prepared: PreparedCommand,
  ): Promise<Record<string, unknown>> {
    const id = randomUUID();
    const child = spawn(prepared.command, prepared.args, {
      cwd: prepared.cwd,
      env: prepared.environment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
    }, prepared.timeoutMs);
    timer.unref();
    const job: BackgroundJob = {
      id,
      child,
      command: prepared.command,
      args: prepared.args,
      cwd: prepared.cwd,
      stdout: "",
      stderr: "",
      truncated: false,
      startedAt: new Date().toISOString(),
      timer,
    };
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (next.length > prepared.maxOutputChars) {
        job.truncated = true;
        return next.slice(0, prepared.maxOutputChars);
      }
      return next;
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      job.stdout = append(job.stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      job.stderr = append(job.stderr, chunk);
    });
    child.once("error", (error) => {
      job.error = error.message;
      job.endedAt = new Date().toISOString();
      clearTimeout(timer);
    });
    child.once("close", (exitCode, terminationSignal) => {
      job.exitCode = exitCode;
      job.signal = terminationSignal;
      job.endedAt = new Date().toISOString();
      clearTimeout(timer);
    });
    this.jobs.set(id, job);
    return {
      success: true,
      started: true,
      jobId: id,
      pid: child.pid ?? null,
      command: prepared.command,
      cwd: relative(this.root, prepared.cwd) || ".",
    };
  }

  private job(operation: TerminalOperation): BackgroundJob {
    if (operation.jobId === undefined) {
      throw new Error(`terminal_${operation.action}_requires_job_id`);
    }
    const job = this.jobs.get(operation.jobId);
    if (job === undefined) throw new Error("terminal_job_not_found");
    return job;
  }

  private jobResult(job: BackgroundJob, includeOutput: boolean): Record<string, unknown> {
    return {
      jobId: job.id,
      running: job.endedAt === undefined,
      pid: job.child.pid ?? null,
      command: job.command,
      args: job.args,
      cwd: relative(this.root, job.cwd) || ".",
      startedAt: job.startedAt,
      ...(job.endedAt === undefined ? {} : { endedAt: job.endedAt }),
      ...(job.exitCode === undefined ? {} : { exitCode: job.exitCode }),
      ...(job.signal === undefined ? {} : { signal: job.signal }),
      ...(job.error === undefined ? {} : { error: job.error }),
      truncated: job.truncated,
      ...(includeOutput
        ? {
            stdout: redactTerminalOutput(job.stdout),
            stderr: redactTerminalOutput(job.stderr),
          }
        : {}),
    };
  }

  async execute(
    operation: TerminalOperation,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    switch (operation.action) {
      case "run":
        return await this.runForeground(await this.prepare(operation), signal);
      case "start":
        return await this.startBackground(await this.prepare(operation));
      case "status":
        return this.jobResult(this.job(operation), false);
      case "output":
        return this.jobResult(this.job(operation), true);
      case "stop": {
        const job = this.job(operation);
        if (job.endedAt === undefined) job.child.kill("SIGTERM");
        return { stopped: true, ...this.jobResult(job, true) };
      }
    }
  }

  close(): void {
    for (const job of this.jobs.values()) {
      clearTimeout(job.timer);
      if (job.endedAt === undefined) job.child.kill("SIGTERM");
    }
    this.jobs.clear();
  }
}
