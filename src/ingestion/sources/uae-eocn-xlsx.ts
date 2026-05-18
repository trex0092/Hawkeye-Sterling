// UAE EOCN — Local Terrorist List (XLSX adapter).
//
// Thin wrapper around the shared UAE IEC XLSX factory. Before
// consolidation this file was ~244 LOC of parser code duplicated almost
// verbatim with uae-ltl-xlsx.ts. The shared logic now lives in
// `uae-iec-xlsx-factory.ts`; this file only defines the list-specific
// identity (FileID env override, default FileID, display name).
//
// FileIDs observed on www.uaeiec.gov.ae/en-us/un-page (2026-05):
//   · LTL Excel (English):     0433bfdb-8a3d-44db-9015-90cbbf48f6f6
//   · UAE Terrorist List (EN): c2b2f915-da02-4dac-bb9d-0144bd35a07d
//   · Identifiers for LTL:     2017e120-bb9f-4e17-ae49-f13984c70a1f
//
// Override the FileID via FEED_UAE_LTL_FILE_ID env var if EOCN
// re-uploads the document with a new ID.

import { makeUaeIecXlsxAdapter } from './uae-iec-xlsx-factory.js';

export const uaeEocnXlsxAdapter = makeUaeIecXlsxAdapter({
  listId: 'uae_eocn',
  displayName: 'UAE EOCN Local Terrorist List (XLSX)',
  fileIdEnvVar: 'FEED_UAE_LTL_FILE_ID',
  defaultFileId: '0433bfdb-8a3d-44db-9015-90cbbf48f6f6',
  seedPathEnvVar: 'UAE_EOCN_SEED_PATH',
});
