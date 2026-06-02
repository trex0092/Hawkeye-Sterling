import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
});

describe("sanctions-jobs in-memory fallback", () => {
  it("round-trips a running record", async () => {
    const { writeJobStatus, readJobStatus } = await import("../sanctions-jobs");
    await writeJobStatus({
      jobId: "11111111-1111-1111-1111-111111111111",
      status: "running",
      tenantId: "tenant-a",
      startedAt: "2026-06-02T10:00:00.000Z",
    });
    const got = await readJobStatus("tenant-a", "11111111-1111-1111-1111-111111111111");
    expect(got).toEqual({
      jobId: "11111111-1111-1111-1111-111111111111",
      status: "running",
      tenantId: "tenant-a",
      startedAt: "2026-06-02T10:00:00.000Z",
    });
  });

  it("updates a record from running to completed", async () => {
    const { writeJobStatus, readJobStatus } = await import("../sanctions-jobs");
    const jobId = "22222222-2222-2222-2222-222222222222";
    await writeJobStatus({ jobId, status: "running", tenantId: "tenant-b", startedAt: "2026-06-02T10:00:00.000Z" });
    await writeJobStatus({
      jobId,
      status: "completed",
      tenantId: "tenant-b",
      startedAt: "2026-06-02T10:00:00.000Z",
      completedAt: "2026-06-02T10:00:08.000Z",
      result: { ok: true, durationMs: 8_000, ok_count: 6, failed_count: 0, anyWriteFailed: false, summary: [] },
    });
    const got = await readJobStatus("tenant-b", jobId);
    expect(got?.status).toBe("completed");
    expect(got?.result?.ok_count).toBe(6);
  });

  it("returns null for unknown jobId", async () => {
    const { readJobStatus } = await import("../sanctions-jobs");
    const got = await readJobStatus("tenant-x", "ffffffff-ffff-ffff-ffff-ffffffffffff");
    expect(got).toBeNull();
  });

  it("isolates records per tenant", async () => {
    const { writeJobStatus, readJobStatus } = await import("../sanctions-jobs");
    const jobId = "33333333-3333-3333-3333-333333333333";
    await writeJobStatus({ jobId, status: "running", tenantId: "tenant-c", startedAt: "2026-06-02T10:00:00.000Z" });
    const sameTenant = await readJobStatus("tenant-c", jobId);
    const otherTenant = await readJobStatus("tenant-d", jobId);
    expect(sameTenant?.status).toBe("running");
    expect(otherTenant).toBeNull();
  });
});
