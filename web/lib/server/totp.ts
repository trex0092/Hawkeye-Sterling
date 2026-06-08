// RFC 4226 HOTP + RFC 6238 TOTP — no external dependencies, uses Node.js crypto.
//
// TOTP is HMAC-SHA1 over an 8-byte big-endian counter (time / 30-second window).
// Authenticator apps (Google Authenticator, Authy, etc.) implement this spec.

import {
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "node:crypto";

const TOTP_DIGITS = 6;
const TOTP_STEP_SEC = 30;
const TOTP_WINDOW = 1; // ±1 step for clock drift tolerance

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | (buf[i] as number);
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const chars = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of chars) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.allocUnsafe(8);
  const big = BigInt(counter);
  buf.writeBigUInt64BE(big);
  const mac = createHmac("sha1", key).update(buf).digest();
  const offset = (mac[19] as number) & 0x0f;
  const code =
    (((mac[offset] as number) & 0x7f) << 24) |
    (((mac[offset + 1] as number) & 0xff) << 16) |
    (((mac[offset + 2] as number) & 0xff) << 8) |
    ((mac[offset + 3] as number) & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Generate a fresh 20-byte (160-bit) TOTP secret. */
export function generateTotpSecret(): { secret: Buffer; base32: string } {
  const secret = randomBytes(20);
  return { secret, base32: base32Encode(secret) };
}

/** Verify a 6-digit TOTP code. Allows ±1 step for clock drift. */
export function verifyTotp(base32Secret: string, code: string, timeMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(base32Secret);
  const counter = Math.floor(timeMs / 1000 / TOTP_STEP_SEC);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    if (hotp(key, counter + delta) === code) return true;
  }
  return false;
}

/** Build the otpauth:// URI that authenticator apps read from a QR code. */
export function totpUri(username: string, base32: string, issuer = "Hawkeye Sterling"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`;
  const params = new URLSearchParams({
    secret: base32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ── Encryption ────────────────────────────────────────────────────────────────
// TOTP secrets must be retrievable (unlike passwords, which are one-way hashed)
// so they are stored AES-256-GCM encrypted at rest. The key is derived from
// SESSION_SECRET via scrypt with a TOTP-specific salt so a compromise of the
// session HMAC key doesn't directly expose TOTP secrets.

function getAesKey(): Buffer {
  const raw = process.env["SESSION_SECRET"];
  if (!raw || raw.length < 32) throw new Error("SESSION_SECRET required for TOTP encryption");
  return scryptSync(raw, "hawkeye-totp-aes-v1", 32, {
    N: 4096, r: 8, p: 1, maxmem: 32 * 1024 * 1024,
  });
}

/** Encrypt a base32 TOTP secret for storage. Returns "iv:tag:ct" hex. */
export function encryptTotpSecret(base32: string): string {
  const key = getAesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(base32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

/** Decrypt an encrypted TOTP secret. Throws on tampered/corrupt ciphertext. */
export function decryptTotpSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid TOTP secret format");
  const [ivHex, tagHex, ctHex] = parts as [string, string, string];
  const key = getAesKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
