// UAE Terrorist List — XLSX adapter (Section C1).
//
// Thin wrapper around the shared UAE IEC XLSX factory. Before
// consolidation this file was ~244 LOC of parser code duplicated almost
// verbatim with uae-eocn-xlsx.ts. The shared logic now lives in
// `uae-iec-xlsx-factory.ts`; this file only defines the list-specific
// identity (FileID env override, default FileID, display name).
//
// FileID "UAE Terrorist List (EN)": c2b2f915-da02-4dac-bb9d-0144bd35a07d
//
// Override via FEED_UAE_TL_FILE_ID env var if the portal re-issues the
// file with a new ID.

import { makeUaeIecXlsxAdapter } from './uae-iec-xlsx-factory.js';

export const uaeLtlXlsxAdapter = makeUaeIecXlsxAdapter({
  listId: 'uae_ltl',
  displayName: 'UAE Terrorist List (XLSX)',
  fileIdEnvVar: 'FEED_UAE_TL_FILE_ID',
  defaultFileId: 'c2b2f915-da02-4dac-bb9d-0144bd35a07d',
  seedPathEnvVar: 'UAE_LTL_SEED_PATH',
});
