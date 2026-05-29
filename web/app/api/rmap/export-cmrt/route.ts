import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadSmelterDatabase } from "@/lib/server/rmap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// CMRT v6.01 CSV export
// Produces a single CSV with two sections (Company Information + Smelter List)
// separated by a blank line, matching the CMRT v6.01 format.

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  try {
    const smelters = await loadSmelterDatabase(tenantId);
    const year = new Date().getFullYear();

    // Section 1: Company Information
    const productList = [...new Set(smelters.flatMap((s) => s.products))].join(", ");
    const section1Lines = [
      `"Question","Answer"`,
      `"Company Name","${tenantId}"`,
      `"Declaration Scope","${productList}"`,
      `"Contact Name",""`,
      `"Contact Email",""`,
      `"Contact Phone",""`,
      `"Reporting Year","${year}"`,
    ];

    // Section 2: Smelter List
    const section2Header =
      "Smelter Reference List,Metal,Smelter or Refiner Name,Facility Location: Country,Facility Location: Street Address,Facility Location: City,Facility Location: Province,Facility Location: Country,Response,Smelter Identification,RMAP Status,URL";

    const section2Rows: string[] = [];
    for (const smelter of smelters) {
      for (const product of smelter.products) {
        const metal =
          product === "gold" ? "Gold"
          : product === "tin" ? "Tin"
          : product === "tantalum" ? "Tantalum"
          : product === "tungsten" ? "Tungsten"
          : product === "cobalt" ? "Cobalt"
          : product;

        const rmapLabel =
          smelter.rmapStatus === "conformant" ? "Conformant"
          : smelter.rmapStatus === "active_placement" ? "Active Placement"
          : smelter.rmapStatus === "suspended" ? "Suspended"
          : "Not Assessed";

        // Escape quotes in facility name
        const name = smelter.facilityName.replace(/"/g, '""');
        const country = smelter.country.replace(/"/g, '""');

        section2Rows.push(
          [
            "X",                   // Smelter Reference List
            metal,                 // Metal
            `"${name}"`,           // Smelter or Refiner Name
            `"${country}"`,        // Facility Location: Country
            "",                    // Street Address
            "",                    // City
            "",                    // Province
            `"${country}"`,        // Facility Location: Country (repeated per CMRT spec)
            "Yes",                 // Response
            smelter.cid,           // Smelter Identification
            rmapLabel,             // RMAP Status
            "",                    // URL
          ].join(","),
        );
      }
    }

    const csvLines = [
      ...section1Lines,
      "",
      section2Header,
      ...section2Rows,
    ];

    const csv = csvLines.join("\r\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...gate.headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="CMRT-v6.01-${year}.csv"`,
      },
    });
  } catch (err) {
    console.error("[rmap/export-cmrt] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to generate CMRT export" }, { status: 500, headers: gate.headers });
  }
}
