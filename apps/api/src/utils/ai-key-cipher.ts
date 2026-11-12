import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const keyInfo = "openmonetis-ai-keys-v1";
const fingerprintMessage = "fingerprint";
const keyBytes = 32;
const nonceBytes = 12;

export type SealedAiKey = {
  ciphertext: string;
  nonce: string;
  authTag: string;
};

export type AiKeyCipher = {
  /** Identifies the secret without revealing it; stored per credential to detect rotation. */
  fingerprint: string;
  encrypt(plain: string, aad: string): SealedAiKey;
  /** Returns null on any authentication failure; never throws with key material in the message. */
  decrypt(sealed: SealedAiKey, aad: string): string | null;
};

export function createAiKeyCipher(secret: string): AiKeyCipher {
  const key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), keyInfo, keyBytes));
  const fingerprint = createHmac("sha256", secret)
    .update(fingerprintMessage, "utf8")
    .digest("hex")
    .slice(0, 16);

  return {
    fingerprint,

    encrypt(plain, aad) {
      const nonce = randomBytes(nonceBytes);
      const cipher = createCipheriv(algorithm, key, nonce);
      cipher.setAAD(Buffer.from(aad, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return {
        ciphertext: ciphertext.toString("base64"),
        nonce: nonce.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
      };
    },

    decrypt(sealed, aad) {
      try {
        const decipher = createDecipheriv(algorithm, key, Buffer.from(sealed.nonce, "base64"));
        decipher.setAAD(Buffer.from(aad, "utf8"));
        decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
        return Buffer.concat([
          decipher.update(Buffer.from(sealed.ciphertext, "base64")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        return null;
      }
    },
  };
}
