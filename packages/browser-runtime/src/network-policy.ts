// Copyright 2026 XAGI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

function ipv4Number(address: string): number {
  return address
    .split(".")
    .map(Number)
    .reduce((value, octet) => (value << 8) + octet, 0) >>> 0;
}

function inIpv4Range(address: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

function mappedIpv4Address(address: string): string | undefined {
  const normalized = address.toLowerCase();
  if (!normalized.startsWith("::ffff:")) return undefined;
  const suffix = normalized.slice("::ffff:".length);
  if (isIP(suffix) === 4) return suffix;
  const groups = suffix.split(":");
  if (groups.length !== 2 || groups.some((group) => !/^[a-f0-9]{1,4}$/.test(group))) {
    return undefined;
  }
  const high = Number.parseInt(groups[0]!, 16);
  const low = Number.parseInt(groups[1]!, 16);
  return [
    high >>> 8,
    high & 0xff,
    low >>> 8,
    low & 0xff,
  ].join(".");
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, bits]) => inIpv4Range(address, base as string, bits as number));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const mapped = mappedIpv4Address(normalized);
    if (mapped !== undefined) return isPrivateAddress(mapped);
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    );
  }
  return false;
}

function isLoopbackAddress(address: string): boolean {
  if (isIP(address) === 4) return inIpv4Range(address, "127.0.0.0", 8);
  const normalized = address.toLowerCase();
  const mapped = mappedIpv4Address(normalized);
  return normalized === "::1" || (mapped !== undefined && isLoopbackAddress(mapped));
}

export interface NetworkPolicy {
  allowedDomains: string[];
  allowLocalhost: boolean;
  /**
   * Lifts every destination check below, including the SSRF block on private
   * ranges and cloud metadata. Set only when the operator has asked for
   * unhinged mode; see `LocalPolicy.unhinged` in `@melra/policy-core`.
   */
  unhinged?: boolean;
}

function domainAllowed(host: string, allowed: string[]): boolean {
  return allowed.some(
    (entry) =>
      entry === "*" ||
      host === entry.toLowerCase() ||
      host.endsWith(`.${entry.toLowerCase()}`),
  );
}

export async function assertSafeUrl(
  rawUrl: string,
  policy: NetworkPolicy,
): Promise<URL> {
  const url = new URL(rawUrl);
  // Unhinged mode still parses the URL — a value the browser cannot navigate to
  // is a bug either way — but asserts nothing about where it points.
  if (policy.unhinged) return url;
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("browser_protocol_not_allowed");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("browser_url_credentials_not_allowed");
  }
  const host = url.hostname.toLowerCase();
  const localName = host === "localhost" || host.endsWith(".localhost");
  if (localName && !policy.allowLocalhost) {
    throw new Error("browser_private_destination_blocked");
  }
  if (!domainAllowed(host, policy.allowedDomains)) {
    throw new Error("browser_domain_not_allowed");
  }
  if (isIP(host)) {
    if (
      isPrivateAddress(host) &&
      !(policy.allowLocalhost && isLoopbackAddress(host))
    ) {
      throw new Error("browser_private_destination_blocked");
    }
    return url;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(
      (item) =>
        isPrivateAddress(item.address) &&
        !(policy.allowLocalhost && isLoopbackAddress(item.address)),
    )
  ) {
    throw new Error("browser_private_destination_blocked");
  }
  return url;
}
