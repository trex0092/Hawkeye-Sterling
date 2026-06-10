// Hawkeye Sterling — Asana attachment upload (CCL-2026-023).
//
// Uploads a rendered PNG to a task via multipart POST /attachments, with the
// same 429/5xx retry-and-backoff discipline as the attestation poster. The
// attachment gid is returned so callers can inline-reference the image in a
// story (<img data-asana-gid="…">).

const ASANA_API = "https://app.asana.com/api/1.0";
const MAX_ATTEMPTS = 5;

export async function attachPngToTask(
  taskGid: string,
  filename: string,
  png: Buffer,
  asanaToken: string,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append("parent", taskGid);
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), filename);

    const res = await fetch(`${ASANA_API}/attachments`, {
      method: "POST",
      headers: { authorization: `Bearer ${asanaToken}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    }).catch((err: unknown) => {
      if (attempt === MAX_ATTEMPTS) throw err;
      return null;
    });

    if (res?.ok) {
      const json = (await res.json().catch(() => ({}))) as { data?: { gid?: string } };
      const gid = json.data?.gid;
      if (gid) return gid;
      throw new Error("attachment_upload_no_gid");
    }

    if (res && res.status !== 429 && res.status < 500) {
      throw new Error(`attachment_upload_${res.status}`);
    }
    if (attempt === MAX_ATTEMPTS) {
      throw new Error(`attachment_upload_failed_after_${MAX_ATTEMPTS}`);
    }
    const retryAfter = Number(res?.headers.get("retry-after")) || 0;
    const backoff = Math.max(retryAfter * 1000, 500 * 2 ** (attempt - 1));
    await new Promise((r) => setTimeout(r, backoff));
  }
  throw new Error("attachment_upload_unreachable");
}
