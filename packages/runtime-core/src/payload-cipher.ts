// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  EncryptedPayloadSchema,
  type EncryptedPayload,
} from "@melra/protocol";
import { canonicalJson } from "@melra/receipt-schema";

export class PayloadCipher {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error("payload_key_must_be_32_bytes");
    this.key = Buffer.from(key);
  }

  seal(value: unknown, context: string): EncryptedPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(canonicalJson(value), "utf8"),
      cipher.final(),
    ]);
    return {
      version: 1,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    };
  }

  open<T = unknown>(payload: EncryptedPayload, context: string): T {
    const parsed = EncryptedPayloadSchema.parse(payload);
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(parsed.iv, "base64url"),
      );
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertext, "base64url")),
        decipher.final(),
      ]);
    } catch {
      throw new Error("task_payload_authentication_failed");
    }
    return JSON.parse(plaintext.toString("utf8")) as T;
  }
}
