// Fixed for the lifetime of the ETL: changing it re-keys every V2 id it has produced.
export const ETL_NAMESPACE = "6a723850-7727-4181-9cc1-68b0fd653c30";

import { createHash } from "node:crypto";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

// RFC 4122 section 4.3: SHA-1 over namespace bytes plus name, version nibble 5, RFC variant.
export function v2Id(v1Table: string, v1Id: string, role = ""): string {
  const name = role ? `${v1Table}:${v1Id}:${role}` : `${v1Table}:${v1Id}`;
  const hash = createHash("sha1").update(uuidToBytes(ETL_NAMESPACE)).update(name, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
