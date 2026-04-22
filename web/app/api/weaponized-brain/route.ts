import { NextResponse } from "next/server";
import {
  buildWeaponizedBrainManifest,
  weaponizedIntegrity,
} from "../../../../dist/src/brain/weaponized.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const manifest = buildWeaponizedBrainManifest();
    const integrity = weaponizedIntegrity();
    return NextResponse.json({ ok: true, manifest, integrity });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "failed to load weaponized brain",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
