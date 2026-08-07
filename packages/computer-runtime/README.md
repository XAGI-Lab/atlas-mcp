# @melra/computer-runtime

Screen and input control for [MELRA](https://github.com/XAGI-Lab/melra):
capabilities, screenshot, click, move, type, key, and scroll, driven through the
host's own automation tooling.

```bash
npm install @melra/computer-runtime
```

```ts
import { ComputerOperationSchema } from "@melra/protocol";
import { ComputerRuntime } from "@melra/computer-runtime";

const computer = new ComputerRuntime({ artifactDirectory });
const report = await computer.execute(
  ComputerOperationSchema.parse({ kind: "computer", action: "capabilities" }),
);
```

Ask `capabilities` first. Desktop control depends on platform tooling and on
permissions the OS grants to the process — on macOS that means Accessibility and
Screen Recording — so the honest answer on many machines is that some actions are
unavailable. `capabilities` reports what this host can actually do instead of
letting a call fail halfway through a sequence; every other action is refused
with `computer_use_unavailable` when the host cannot support it.

Coordinates are validated against the reported screen bounds before an event is
synthesised, and typed text is escaped for the underlying tool rather than
concatenated into a script — `escapeSendKeys` is exported for that reason.

This is the widest-blast-radius capability in MELRA: it drives the same input
devices the human is using, and it is not confined to a workspace the way files
and terminals are. Screenshots capture whatever is on screen, including windows
belonging to other applications, so treat the artifacts as sensitive.

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)

Apache-2.0
