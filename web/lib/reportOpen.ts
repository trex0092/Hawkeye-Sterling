"use client";

export function openReportWindow(url: string, data: unknown): void {
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  }).then(async res => {
    if (!res.ok) {
      console.error(`Report fetch failed ${res.status}`);
      return;
    }
    const html = await res.text();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    if (!w) alert("Pop-up blocked — allow pop-ups for this site to open PDF reports.");
  }).catch(err => {
    console.error("Report open failed:", err);
  });
}
