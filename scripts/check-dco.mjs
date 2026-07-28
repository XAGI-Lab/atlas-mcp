// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";

const base = process.env.DCO_BASE_SHA;
const head = process.env.DCO_HEAD_SHA ?? "HEAD";
if (base === undefined || !/^[a-f0-9]{40}$/i.test(base)) {
  throw new Error("DCO_BASE_SHA must be a full commit SHA");
}
if (!/^[a-f0-9]{40}$/i.test(head) && head !== "HEAD") {
  throw new Error("DCO_HEAD_SHA must be a full commit SHA or HEAD");
}

const output = execFileSync(
  "git",
  ["log", `${base}..${head}`, "--format=%H%x00%an%x00%ae%x00%B%x00"],
  { encoding: "utf8" },
);
const fields = output.split("\0");
const failures = [];

for (let index = 0; index + 3 < fields.length; index += 4) {
  const [sha, authorName, authorEmail, body] = fields.slice(index, index + 4);
  const normalizedSha = sha.trim();
  if (normalizedSha === "") continue;
  if (authorName.endsWith("[bot]")) continue;
  const signoffs = [...body.matchAll(/^Signed-off-by:\s*(.+?)\s*<([^<>]+)>$/gim)];
  const authorSigned = signoffs.some(
    (match) => match[2].trim().toLowerCase() === authorEmail.trim().toLowerCase(),
  );
  if (!authorSigned) {
    failures.push(
      `${normalizedSha.slice(0, 12)} ${authorName} <${authorEmail}>`,
    );
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `DCO sign-off missing for:\n${failures.map((item) => `- ${item}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write("All non-bot commits carry an author DCO sign-off.\n");
}
