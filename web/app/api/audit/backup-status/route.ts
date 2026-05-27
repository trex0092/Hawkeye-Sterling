import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { getJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const STATUS_BLOB_KEY = "hawkeye-backup/audit-chain-status.json";

interface BackupStatusRecord {
  lastRunAt: string;
  lastRunDate: string;
  ok: boolean;
  tenantCount: number;
  failedTenants: string[];
  totalBytes: number;
  s3Bucket: string | null;
  s3Endpoint: string | null;
  schedule: string;
  configuredAt: string;
}

async function handleGet(_req: Request, _ctx: RequestContext): Promise<NextResponse> {
  const status = await getJson<BackupStatusRecord>(STATUS_BLOB_KEY);

  if (!status) {
    return NextResponse.json({
      ok: true,
      configured: false,
      message: "No backup run recorded yet. The audit-chain-s3-backup cron runs nightly at 02:00 UTC.",
      nextScheduled: "02:00 UTC daily",
      s3Configured: Boolean(
        process.env["S3_BACKUP_ENDPOINT"] &&
        process.env["S3_BACKUP_BUCKET"] &&
        process.env["S3_BACKUP_ACCESS_KEY_ID"] &&
        process.env["S3_BACKUP_SECRET_KEY"],
      ),
    });
  }

  const ageMs = Date.now() - new Date(status.lastRunAt).getTime();
  const ageHours = Math.round(ageMs / 3_600_000);
  // Alert if the last run was more than 26 hours ago (missed a nightly cycle).
  const missedCycle = ageHours > 26;

  return NextResponse.json({
    ok: true,
    configured: true,
    lastRun: {
      at: status.lastRunAt,
      date: status.lastRunDate,
      ok: status.ok,
      tenantCount: status.tenantCount,
      failedTenants: status.failedTenants,
      totalBytes: status.totalBytes,
      ageHours,
    },
    s3: {
      configured: Boolean(status.s3Bucket),
      bucket: status.s3Bucket,
      endpoint: status.s3Endpoint,
    },
    schedule: status.schedule,
    missedCycle,
    ...(missedCycle
      ? { warning: `Last backup was ${ageHours}h ago — expected ≤ 26h. Check audit-chain-s3-backup function logs.` }
      : {}),
  });
}

export const GET = withGuard(handleGet);
