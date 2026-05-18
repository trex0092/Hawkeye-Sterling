// Structural parser for UAE EOCN / Local Terrorist List XLS and XLSX files.
//
// The EOCN body distributes updates as email attachments in the old OLE/BIFF8
// (.xls) format. ExcelJS cannot read that format; this module uses SheetJS
// (via the maintained `@e965/xlsx` fork at 0.20.3, which carries the upstream
// SheetJS security patches for prototype-pollution / ReDoS that the abandoned
// `xlsx` npm package does not). Same API, supports both .xls and .xlsx.
//
// Document structure observed from EOCN distributions (May 2026):
//
//   Section 1 — Terrorist Organizations (التنظيمات المدرجة في قائمة الإرهاب)
//     Columns: #, Classification, Latin Name, Arabic Name, Aliases, Info
//     ~75 entries
//
//   Section 2 — Individuals (الأفراد المدرجون في قائمة الأمن المجمعة)
//     Columns: #, Classification, Nationality, Arabic family/first name,
//              Latin family name, Latin full name, Father name, DOB,
//              Place of birth, Gender, Country, City, Passport #,
//              Issue date, Expiry date, Passport authority, National ID,
//              Other info
//     ~171+ entries
//
//   Section 3 — Entities (الكيانات المدرجة في قائمة الإرهاب)
//     Columns: #, Classification, Arabic name, Latin name, Aliases,
//              License #, License expiry, Notes, Info
//     ~65 entries
//
//   Section 4 — Removed Individuals (الأفراد المرفوعة أسماءهم)
//   Section 5 — Removed Entities (الكيانات المرفوعة أسماءها)
//     → Excluded from active screening output.
//
// The parser detects section headers by scanning each row for Arabic title
// keywords, then column headers by fuzzy-matching against known field names.
// Column order is NOT assumed — robust against layout changes between updates.

export interface EocnParsedEntity {
  name: string;          // primary Latin name (or Arabic if Latin absent)
  nameArabic?: string;
  aliases: string[];
  type: "individual" | "entity";
  nationalities: string[];
  dateOfBirth?: string;
  placeOfBirth?: string;
  gender?: string;
  identifiers: Record<string, string>;
  reference?: string;
  authority?: string;   // Cabinet Resolution e.g. "مدرج بموجب قرار مجلس الوزراء رقم (41) لسنة 2014"
  isRemoved: boolean;
}

// ── SheetJS type stubs ────────────────────────────────────────────────────────

interface XlsxModule {
  read(_data: Buffer, _opts: { type: "buffer" }): XlsxWorkbook;
  utils: {
    sheet_to_json<T>(_ws: XlsxWorksheet, _opts: { header: 1; raw: false; defval: string }): T[][];
  };
}

interface XlsxWorkbook {
  SheetNames: string[];
  Sheets: Record<string, XlsxWorksheet>;
}

type XlsxWorksheet = object;

// ── Section / column detection ────────────────────────────────────────────────

type SectionKind = "organizations" | "individuals" | "entities" | "removed" | "unknown";

function detectSection(row: string[]): SectionKind {
  const joined = row.join(" ");
  if (/المرفوع/.test(joined)) return "removed";
  if (/التنظيمات/.test(joined)) return "organizations";
  if (/الأفراد/.test(joined)) return "individuals";
  if (/الكيانات/.test(joined)) return "entities";
  return "unknown";
}

// Returns true if this row looks like a header row (≥3 recognised column keywords)
function isHeaderRow(row: string[]): boolean {
  const recognised = row.filter((c) =>
    /التصنيف|الجنسية|الاسم|اسم العائلة|تاريخ|رقم|جواز|الدولة|المدينة|aliases|classification|nationality|name/i.test(c),
  ).length;
  return recognised >= 3;
}

// Find column index by scanning headers for a matching keyword
function findCol(headers: string[], ...patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i] ?? "";
    for (const p of patterns) {
      if (p.test(h)) return i;
    }
  }
  return -1;
}

function cell(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}

// ── Individuals parser ────────────────────────────────────────────────────────

function parseIndividualRow(row: string[], headers: string[]): EocnParsedEntity | null {
  const latinFullName   = findCol(headers, /الاسم الكامل.*لاتين|الاسم الكامل \(بالحروف|الاسم الكامل \(باللاتين/);
  const latinFamilyName = findCol(headers, /اسم العائلة.*لاتين|اسم العائلة \(بالحروف/);
  const arabicFirstName = findCol(headers, /الاسم الأول/);
  const arabicFamilyName = findCol(headers, /اسم العائلة.*عرب/, /اسم العائلة\s*$/);
  const nationality     = findCol(headers, /الجنسية/);
  const dob             = findCol(headers, /تاريخ الميلاد/);
  const pob             = findCol(headers, /مكان الميلاد/);
  const gender          = findCol(headers, /الجنس/);
  const passportNum     = findCol(headers, /رقم جواز|رقم الجواز|جواز\s*سفر/);
  const nationalId      = findCol(headers, /رقم الوطنية|الرقم الوطني/);
  const otherInfo       = findCol(headers, /معلومات أخرى/);
  const classification  = findCol(headers, /التصنيف/);

  // Primary name preference: Latin full name → Latin family name → Arabic
  let name = cell(row, latinFullName);
  if (!name) {
    const fam = cell(row, latinFamilyName);
    const first = cell(row, arabicFirstName);
    name = [fam, first].filter(Boolean).join(" ").trim();
  }
  const nameArabic = [cell(row, arabicFamilyName), cell(row, arabicFirstName)]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!name && !nameArabic) return null;

  const natStr = cell(row, nationality);
  const identifiers: Record<string, string> = {};
  const pp = cell(row, passportNum);
  const nid = cell(row, nationalId);
  if (pp) identifiers["passport"] = pp;
  if (nid) identifiers["national_id"] = nid;

  return {
    name: name || nameArabic,
    nameArabic: nameArabic || undefined,
    aliases: [],
    type: "individual",
    nationalities: natStr ? [natStr] : [],
    dateOfBirth: cell(row, dob) || undefined,
    placeOfBirth: cell(row, pob) || undefined,
    gender: cell(row, gender) || undefined,
    identifiers,
    authority: cell(row, otherInfo) || undefined,
    reference: undefined,
    isRemoved: false,
  };
}

// ── Organizations / Entities parser ──────────────────────────────────────────

function parseOrgRow(row: string[], headers: string[]): EocnParsedEntity | null {
  const latinName    = findCol(headers, /الاسم الكامل.*لاتين|الاسم الكامل \(بالحروف/, /full name.*latin/i);
  const arabicName   = findCol(headers, /^الاسم$/, /^الاسم\s*$/, /arabic.*name/i);
  const aliases      = findCol(headers, /الأسماء المعرفة|ثانياً.*الأسماء|alias/i);
  const otherInfo    = findCol(headers, /معلومات أخرى/);
  const classification = findCol(headers, /التصنيف/);

  const name = cell(row, latinName);
  const nameAr = cell(row, arabicName);
  if (!name && !nameAr) return null;

  const rawAliases = cell(row, aliases);
  const aliasList = rawAliases
    ? rawAliases.split(/[;|،]|\n/).map((a) => a.trim()).filter((a) => a && a !== name)
    : [];

  const classif = cell(row, classification).toLowerCase();
  const entityType: "individual" | "entity" =
    classif.includes("شخص") ? "individual" : "entity";

  return {
    name: name || nameAr,
    nameArabic: nameAr || undefined,
    aliases: aliasList,
    type: entityType,
    nationalities: [],
    identifiers: {},
    authority: cell(row, otherInfo) || undefined,
    isRemoved: false,
  };
}

// ── Main parse entry point ────────────────────────────────────────────────────

export async function parseEocnBuffer(buf: Buffer): Promise<EocnParsedEntity[]> {
  let XLSX: XlsxModule;
  try {
    XLSX = (await import("@e965/xlsx" as string)) as unknown as XlsxModule;
  } catch (err) {
    throw new Error(
      `EOCN structural parser requires the '@e965/xlsx' npm package. ` +
      `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const wb = XLSX.read(buf, { type: "buffer" });
  const results: EocnParsedEntity[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<string>(ws, {
      header: 1,
      raw: false,
      defval: "",
    }) as string[][];

    let currentSection: SectionKind = "unknown";
    let headers: string[] = [];
    let inDataRows = false;

    for (const row of rows) {
      // Skip fully empty rows
      if (row.every((c) => !c.trim())) {
        inDataRows = false; // section may have ended
        continue;
      }

      // Detect section title rows (typically merged/single-cell rows with section name)
      const nonEmpty = row.filter((c) => c.trim());
      if (nonEmpty.length <= 3) {
        const section = detectSection(row);
        if (section !== "unknown") {
          currentSection = section;
          inDataRows = false;
          headers = [];
          continue;
        }
      }

      // Detect header row
      if (!inDataRows && isHeaderRow(row)) {
        headers = row.map((c) => c.trim());
        inDataRows = true;
        continue;
      }

      // Data rows
      if (!inDataRows || currentSection === "removed" || currentSection === "unknown") continue;
      if (headers.length === 0) continue;

      const rowStr = row.map((c) => c.trim());
      // Skip sub-header rows that sneak in
      if (isHeaderRow(rowStr)) {
        headers = rowStr;
        continue;
      }

      let entity: EocnParsedEntity | null = null;
      if (currentSection === "individuals") {
        entity = parseIndividualRow(rowStr, headers);
      } else if (currentSection === "organizations" || currentSection === "entities") {
        entity = parseOrgRow(rowStr, headers);
      }

      if (entity) results.push(entity);
    }
  }

  return results;
}
