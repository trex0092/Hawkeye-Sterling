import { publicKeyPem } from "@/lib/server/report-pubkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /.well-known/hawkeye-pubkey.pem
//
// Same public key as /.well-known/jwks.json but in raw PEM form for
// verifiers who use openssl directly:
//
//   curl -O https://hawkeye-sterling.netlify.app/.well-known/hawkeye-pubkey.pem
//   echo -n "<report.sha256>" > /tmp/h.bin
//   echo "<report.signature_ed25519>" | xxd -r -p > /tmp/sig.bin
//   openssl pkeyutl -verify -pubin -inkey hawkeye-pubkey.pem \
//     -sigfile /tmp/sig.bin -in /tmp/h.bin
//
// Returns 404 with a plain-text body when the signing key isn't
// configured — easier for shell scripts than serving a 200 with an
// empty body.

export function GET(): Response {
  const pem = publicKeyPem();
  if (!pem) {
    return new Response(
      "Report signing not configured on this deployment.\n" +
        "Set REPORT_ED25519_PRIVATE_KEY to publish a public key.\n",
      {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }
  return new Response(pem, {
    status: 200,
    headers: {
      "content-type": "application/x-pem-file; charset=utf-8",
      "content-disposition": 'inline; filename="hawkeye-pubkey.pem"',
      "cache-control": "public, max-age=300, must-revalidate",
    },
  });
}
