# @melra/receipt-schema

Action receipts, execution certificates, canonical JSON, and redaction for
[MELRA](https://github.com/XAGI-Lab/melra). This is the evidence layer: what
happened, what was checked, and what it hashes to.

```bash
npm install @melra/receipt-schema
```

```ts
import { createCertificate, redactStructuredValue, sha256 } from "@melra/receipt-schema";
```

A receipt records one action: the operation, the policy decision, the evidence
items and their outcomes, and timing. A certificate summarises a task's receipts
and carries a digest over their canonical form, so a transcript can be checked
rather than trusted.

`canonicalJson` sorts keys and normalises formatting before hashing, so the same
logical value always produces the same digest across processes and platforms.

`redactStructuredValue` strips credential-shaped values — tokens, keys, auth
headers, connection strings — from anything before it is persisted. Raw output
goes to the live caller only; the durable copy is the redacted one. A new field
that can carry a secret must pass through this, or through the memory package's
equivalent, before it reaches storage.

Requires Node.js 22 or newer. Full documentation:
[github.com/XAGI-Lab/melra](https://github.com/XAGI-Lab/melra)

Apache-2.0
