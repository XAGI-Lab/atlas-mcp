// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * The Community console: one self-contained page, no build step, no network
 * fetches beyond this server. It is a read-only window onto durable state —
 * planning and advancing stay on the governed MCP and CLI paths, so nothing
 * here can start work that policy has not seen.
 */
export function consolePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>MELRA console</title>
<style>
:root {
  color-scheme: light dark;
  --line: color-mix(in srgb, currentColor 18%, transparent);
  --soft: color-mix(in srgb, currentColor 6%, transparent);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
}
header { padding: 12px 20px; border-bottom: 1px solid var(--line); }
h1 { font-size: 15px; margin: 0; font-weight: 600; }
h2 { font-size: 13px; margin: 0 0 8px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; opacity: .6; }
#posture { font-size: 12px; opacity: .7; margin-top: 4px; }
#warning { display: none; margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: #b3261e; color: #fff; font-weight: 600; }
#warning.on { display: block; }
main { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr); min-height: 0; }
section { padding: 16px 20px; min-width: 0; overflow: auto; }
section + section { border-left: 1px solid var(--line); }
ul { list-style: none; margin: 0; padding: 0; }
li button {
  width: 100%; text-align: left; font: inherit; cursor: pointer;
  background: none; border: 1px solid transparent; border-radius: 6px;
  padding: 7px 9px; color: inherit;
}
li button:hover, li button:focus-visible { background: var(--soft); }
li button[aria-current="true"] { border-color: var(--line); background: var(--soft); }
.id { font-family: ui-monospace, monospace; font-size: 12px; }
.status { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .65; }
table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .6; font-weight: 600; }
#events div { padding: 3px 0; border-bottom: 1px solid var(--line); font-family: ui-monospace, monospace; font-size: 12px; word-break: break-word; }
.empty { opacity: .55; }
</style>
</head>
<body>
<header>
  <h1>MELRA console</h1>
  <div id="posture">Loading…</div>
  <div id="warning" role="alert"></div>
</header>
<main>
  <section aria-labelledby="runs-heading">
    <h2 id="runs-heading">Workflows</h2>
    <ul id="runs"><li class="empty">Loading…</li></ul>
  </section>
  <section aria-labelledby="detail-heading">
    <h2 id="detail-heading">Detail</h2>
    <div id="detail" class="empty">Select a workflow.</div>
  </section>
</main>
<script type="module">
${CONSOLE_SCRIPT}
</script>
</body>
</html>
`;
}

/**
 * Kept as a plain string rather than a template literal so nothing in it can be
 * interpolated by accident, and every value it renders goes through
 * `textContent` rather than `innerHTML`.
 */
const CONSOLE_SCRIPT = [
  'const token = new URL(location.href).searchParams.get("token") ?? "";',
  'const auth = { headers: { authorization: "Bearer " + token } };',
  'const runsEl = document.getElementById("runs");',
  'const detailEl = document.getElementById("detail");',
  'let selected = null;',
  'let stream = null;',
  '',
  'const el = (tag, text, className) => {',
  '  const node = document.createElement(tag);',
  '  if (text !== undefined) node.textContent = text;',
  '  if (className) node.className = className;',
  '  return node;',
  '};',
  '',
  'const get = async (path) => {',
  '  const response = await fetch(path, auth);',
  '  if (!response.ok) throw new Error(path + " -> " + response.status);',
  '  return response.json();',
  '};',
  '',
  'async function loadPosture() {',
  '  const caps = await get("/api/capabilities");',
  '  document.getElementById("posture").textContent =',
  '    caps.product + " " + caps.version + " · protocol " + caps.protocolVersion +',
  '    " · workspace " + caps.policy.workspaceRoot + " · telemetry " + caps.policy.telemetry;',
  '  if (caps.policy.unhinged) {',
  '    const warning = document.getElementById("warning");',
  '    warning.className = "on";',
  '    warning.textContent = "UNHINGED — " + caps.policy.unhingedWarning;',
  '  }',
  '}',
  '',
  'async function loadRuns() {',
  '  const { workflows } = await get("/api/workflows");',
  '  runsEl.replaceChildren();',
  '  if (workflows.length === 0) {',
  '    runsEl.append(el("li", "No workflows yet. Plan one with melra workflow plan.", "empty"));',
  '    return;',
  '  }',
  '  for (const run of workflows) {',
  '    const button = el("button");',
  '    button.append(el("div", run.id, "id"), el("div", run.status, "status"));',
  '    button.setAttribute("aria-current", String(run.id === selected));',
  '    button.addEventListener("click", () => { void select(run.id); });',
  '    const item = el("li");',
  '    item.append(button);',
  '    runsEl.append(item);',
  '  }',
  '}',
  '',
  'function nodeTable(run) {',
  '  const table = el("table");',
  '  const head = el("tr");',
  '  for (const label of ["Node", "Status", "Tasks", "Detail"]) head.append(el("th", label));',
  '  const header = el("thead");',
  '  header.append(head);',
  '  table.append(header);',
  '  const body = el("tbody");',
  '  for (const [id, state] of Object.entries(run.nodes)) {',
  '    const row = el("tr");',
  '    row.append(el("td", id, "id"), el("td", state.status, "status"));',
  '    row.append(el("td", String((state.taskIds ?? []).length)));',
  '    row.append(el("td", state.error ?? state.prompt ?? ""));',
  '    body.append(row);',
  '  }',
  '  table.append(body);',
  '  return table;',
  '}',
  '',
  'async function select(id) {',
  '  selected = id;',
  '  if (stream) stream.close();',
  '  await loadRuns();',
  '  const run = await get("/api/workflows/" + encodeURIComponent(id));',
  '  detailEl.className = "";',
  '  detailEl.replaceChildren();',
  '  detailEl.append(el("div", run.id + " · " + run.status + " · v" + run.stateVersion, "id"));',
  '  if (run.error) detailEl.append(el("p", run.error));',
  '  detailEl.append(nodeTable(run));',
  '  detailEl.append(el("h2", "Events"));',
  '  const events = el("div");',
  '  events.id = "events";',
  '  detailEl.append(events);',
  '  // Live tail. Every frame is one appended event, so the console never has to',
  '  // guess whether it missed one: the sequence is on the wire.',
  '  stream = new EventSource(',
  '    "/api/workflows/" + encodeURIComponent(id) + "/stream?token=" + encodeURIComponent(token),',
  '  );',
  '  stream.addEventListener("message", (event) => {',
  '    const data = JSON.parse(event.data);',
  '    events.prepend(el("div", "#" + data.sequence + "  " + data.type + "  " + data.occurredAt));',
  '    if (data.type === "workflow.status_changed") void refreshRun(id);',
  '  });',
  '}',
  '',
  '// The event says the status moved; the projection says what it moved to.',
  'async function refreshRun(id) {',
  '  if (selected !== id) return;',
  '  const run = await get("/api/workflows/" + encodeURIComponent(id));',
  '  const heading = detailEl.firstElementChild;',
  '  if (heading) heading.textContent = run.id + " · " + run.status + " · v" + run.stateVersion;',
  '  const table = detailEl.querySelector("table");',
  '  if (table) table.replaceWith(nodeTable(run));',
  '  await loadRuns();',
  '}',
  '',
  'await loadPosture();',
  'await loadRuns();',
  'setInterval(() => { void loadRuns(); }, 4000);',
].join("\n");
