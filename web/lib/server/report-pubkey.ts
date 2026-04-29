import {
  createPrivateKey,
  createPublicKey,
  createHash,
  type KeyObject,
} from "node:crypto";

// Shared helpers for the .well-known endpoints. Reads the same env var
// the report-signer uses so the published JWKS / PEM always matches the
// key that signed the most recent report.

function loadPrivateKey(): KeyObject | null {
  const raw = process.env["REPORT_ED25519_PRIVATE_KEY"];
  if (!raw) return null;
  try {
    const pem = raw.includes("BEGIN")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const key = createPrivateKey({ key: pem, format: "pem" });
    if (key.asymmetricKeyType !== "ed25519") return null;
    return key;
  } catch {
    return null;
  }
}

export function loadPublicKey(): KeyObject | null {
  const priv = loadPrivateKey();
  if (!priv) return null;
  try {
    return createPublicKey(priv);
  } catch {
    return null;
  }
}

export function publicKeyPem(): string | null {
  const pub = loadPublicKey();
  if (!pub) return null;
  return pub.export({ format: "pem", type: "spki" }).toString();
}

// Extract the 32-byte raw Ed25519 public key from the SPKI DER and
// base64url-encode it (the JWK spec requires base64url, not base64).
// Ed25519 SPKI is a fixed 44 bytes: 12-byte header + 32-byte key.
export function publicKeyJwk(): {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  use: "sig";
  alg: "EdDSA";
  kid: string;
} | null {
  const pub = loadPublicKey();
  if (!pub) return null;
  const der = pub.export({ format: "der", type: "spki" });
  if (der.length !== 44) return null;
  const raw = der.subarray(12);
  const x = base64url(raw);
  // kid = first 12 hex chars of sha256(SPKI DER) — same fingerprint
  // the report's audit trail uses (signing.pubkey_fp). Lets a verifier
  // confirm the JWKS entry matches the key that signed a given report.
  const kid = createHash("sha256")
    .update(new Uint8Array(der))
    .digest("hex")
    .slice(0, 12);
  return { kty: "OKP", crv: "Ed25519", x, use: "sig", alg: "EdDSA", kid };
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
