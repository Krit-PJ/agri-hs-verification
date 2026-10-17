# HS Verification Kamphaeng Phet v1 — Apps Script backend

This folder contains a Google Apps Script web app backend for field verification of agricultural hotspots in Kamphaeng Phet. It does not contain deployment credentials. The `login` action exchanges a configured username/password for a four-hour session token; all other API reads and writes require a token.

## Source rule and the `hsPlant2026` ambiguity

The local source documentation says `hsPlant2026` is a pivot table used to reconcile totals, while row-level coordinates are in `hsAll`. The backend therefore treats `SOURCE_SHEET` (default `hsPlant2026`) as a detail sheet only when its first row contains hotspot ID, date, province, district, tambon, land type, plant type, and either coordinate columns or a Maps URL. If it is a pivot, the importer explicitly falls back to `hsAll`.

When a readable `hsPlant2026` pivot exists, import is fail-closed: totals and all four plant-type counts from the filtered detail rows must exactly match the pivot before `HS_Base` is swapped. The accepted filter is:

- Province: `กำแพงเพชร`
- LandType: `พื้นที่เกษตร`
- PlantType: `นาข้าว`, `อ้อย`, `เกษตรอื่น ๆ`, `อื่น ๆ`

Whitespace variants such as `เกษตรอื่นๆ` and `อื่นๆ` are normalized. Blank or unknown plant types are rejected rather than coerced to `อื่น ๆ`.

## Setup

1. Create an Apps Script project attached to the destination spreadsheet, or set Script Property `SPREADSHEET_ID` to a destination spreadsheet ID.
2. Copy all `.gs` files and `appsscript.json` into the project.
3. Run `initializeBackend()` once in the editor. Save the returned admin token immediately; only its salted SHA-256 hash is stored.
4. Optionally set `SOURCE_SPREADSHEET_ID`, `SOURCE_SHEET`, and `PHOTO_FOLDER_ID` as Script Properties. The admin `setConfig` action can set the same non-secret values.
5. Run `createInspector({displayName, district, tambon})` from the editor for each inspector and give the returned plaintext token only to that inspector.
6. Deploy as a web app executing as the deployer. The client posts `text/plain` JSON to avoid a browser preflight that Apps Script web apps do not handle reliably.

For username/password setup, including the two initial administrator accounts, follow `../docs/AUTH_SETUP_TH.md`. Bootstrap passwords are entered temporarily as Script Properties and deleted by the setup helper; never add them to source files.

`initializeBackend`, `createInspector`, `rotateInspectorToken`, and `rotateAdminToken` are editor-only administration functions. Tokens are returned once and cannot be recovered later. Do not put tokens in source code, shared sheets, URLs, or browser logs.

## HTTP contract

All calls use `POST` with `Content-Type: text/plain` and this envelope:

```json
{"action":"listHS","requestId":"optional-for-reads","token":"secret","payload":{}}
```

Success and error responses are always JSON text:

```json
{"ok":true,"requestId":"...","data":{}}
{"ok":false,"requestId":"...","error":{"code":"VALIDATION_ERROR","message":"...","details":{}}}
```

`requestId` must be an RFC 4122 UUID for `saveVerification`, `verifyHS`, `uploadPhoto`, `syncSource`, `importSource`, and `setConfig`. Verification, photo, and import writes are idempotent. The server supplies inspector identity, submission time, source snapshot, and GPS distance; client values for those fields are ignored.

| Action | Role | Payload / result |
|---|---|---|
| `login` | public | `{username,password}`; returns `{token,profile,expiresAt}`. Failed attempts are rate limited. |
| `logout` | authenticated | Revokes the session token supplied in the request envelope. |
| `getConfig`, `status` | inspector | Returns limits, enums, and the authenticated profile. Admin also receives non-secret source/folder config. |
| `bootstrap`, `read` | inspector | `{filters?}`; returns config, location filters, summary, and the complete scoped hotspot collection. |
| `listHS` | inspector | `{filters?,page?,pageSize?}`; page size max 500. Filters: district, tambon, village, plantType, status, result, search, year (CE or BE), month. |
| `getHS` | inspector | `{hsId}`; returns one hotspot, latest verification, and photo metadata. |
| `getDistricts` | inspector | `{}` |
| `getTambons` | inspector | `{district}` |
| `getVillages` | inspector | `{district,tambon}` |
| `summaries` | inspector | `{filters?}`; total and counts by status, result, district, tambon, village, and plant type. |
| `saveVerification`, `verifyHS` | inspector | `{verificationId?,hsId,status,result,notes?,action?,location?,missingGpsReason?}` |
| `uploadPhoto` | inspector | `{verificationId,hsId,fileName?,mimeType,base64,caption?,capturedAt?}` |
| `getPhoto` | inspector | `{photoId}`; returns authenticated private image bytes as base64. |
| `qa` | admin | Referential-integrity and coordinate checks. |
| `log` | admin | `{page?,pageSize?,action?,actorId?}` |
| `export` | admin | `{dataset?}` where dataset is hotspots, verifications, photos, or log; returns a private CSV as base64. |
| `setConfig` | admin | `{sourceSpreadsheetId?,sourceSheet?,photoFolderId?}` |
| `syncSource`, `importSource` | admin | Reconcile and atomically refresh `HS_Base`. |

Verification values are `status: draft|verified` and `result: burned|not_burned|not_found|needs_review`. A verified submission without `location` must include `missingGpsReason`. When present, `location` is `{latitude,longitude,accuracyM?}`. The backend stores separate `notes` and `action` text.

Inspector district and tambon assignments are enforced on every hotspot/photo read and write. Admin can access all areas. Photos are limited to 5 MB and JPEG, PNG, or WebP; declared MIME type, base64 structure, and file signature are checked. Created files are forced to private sharing. If metadata persistence fails, the newly created Drive file is moved to trash.

## Sheets

`initializeBackend()` creates and validates `HS_Base`, `HS_Verification`, `HS_Photos`, `Inspector_Profile`, and `Verification_Log`. Exact header-only CSV templates are in `../templates`. Existing sheets with a different header order fail with `SCHEMA_MISMATCH` to prevent column corruption.

The importer writes to a staging sheet, validates its row count, then swaps it into place while holding a script lock. If the swap fails, it restores the prior `HS_Base`. Existing verification rows keep their server-captured source snapshots even after a later source sync.

## v1.1 roles and source imports

- `inspector`: scoped HS read and own verification/photo work.
- `admin`: province monitoring, QA, log, export, verification and photo operations; cannot change source/configuration.
- `super_admin`: all operations plus `setConfig`, `syncSource`, `previewImportRows`, `importRows`.
- Existing `ADMIN_TOKEN_HASH` becomes the Super Admin master token. Create other profiles with `createInspector({displayName:'...',role:'admin'})` or `role:'super_admin'` from the trusted Apps Script editor only. No public credential creation endpoint exists.

Before updating an existing v1.0 spreadsheet, run `migrateSchemaV11()` once in the editor. This appends `dataset_year_be` to `HS_Base` without rewriting old columns. New templates already contain it. The cohort year is separate from observation calendar year: `hsPlant2026` means dataset year 2569 even when source observations include December 2025. A fallback detail sheet inherits the configured source cohort.

`setConfig` supports `sourceSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/ID/edit'` or `sourceSpreadsheetId: 'ID'`. Apps Script owner must have access; a URL is not a credential.

File imports are parsed locally into canonical objects and sent to the same authenticated API:

```json
{"rows":[{"hsId":"HS-001","acquiredAt":"2026-01-01T10:00:00+07:00","province":"กำแพงเพชร","district":"เมืองกำแพงเพชร","tambon":"...","village":"...","landType":"พื้นที่เกษตร","plantType":"นาข้าว","latitude":16.4,"longitude":99.5}],"sourceName":"hsPlant2026.csv","datasetYearBe":2569}
```

1. Call `previewImportRows` with this payload; review `qa`, `reconciliation`, `canImport`.
2. Call `importRows` with identical payload plus `confirmed:true` and a fresh UUID request ID.

Optional `summary:{total,byPlantType}` requires an exact per-crop reconciliation. Limit: 5000 incoming rows. Foreign province/land/crop records are excluded and counted. Duplicate IDs, invalid dates/GPS, missing district/tambon or an empty eligible cohort block replacement. Both import and sync replace only `HS_Base`; verification, photos, inspectors and audit logs remain intact. Import errors are logged. Replaying a successful request ID returns its original result.

## v1.2: migration, field observations, and photo provenance

Existing installations: back up the spreadsheet, replace every Apps Script source including `Evidence.gs`, then run `migrateSchemaV12()` once in the Apps Script editor before publishing a new deployment version. The migration validates all existing header prefixes before adding columns, preserves rows, and can be run repeatedly. New empty databases use `initializeBackend()` normally. Do not replace populated sheets with blank templates.

`saveVerification` accepts these optional v1.2 fields in addition to v1.1:

- `personCategory`: นักวิชาการส่งเสริมการเกษตร / กำนัน / ผู้ใหญ่บ้าน / ผู้ช่วยผู้ใหญ่บ้าน / อกม. / อื่นๆ. `personCategoryOther` is mandatory for อื่นๆ. These are occupations/community functions, independent from authorization `role`.
- `fieldInspectorName` defaults to the authenticated display name. `reportedById` and `reportedByName` are written from the authenticated actor on the server. Saving one's own category also updates one's profile without changing privileges.
- `observedLandMatchesSource` boolean, `observedLandType`, `observedPlantType`; false requires both observed fields. Source HS remains unchanged. Actual observations may include maize or non-agricultural land even when the source import excludes them.
- `fireState`: active / extinguished / unknown, only retained for burned.
- `inspectedAt` ISO timestamp with timezone and `inspectedAtSource`: client_device / user_confirmed / server_default. `submittedAt` is the server reception time. Neither is derived automatically from an imported photo.
- `photoMissingReason` optional. All new verified submissions require evidence server-side; the client cannot disable this with `evidenceRequired:false`. Existing legacy rows remain readable without retroactive changes. Because save and upload are separate operations, the initial evidence state is pending until at least one photo succeeds or an exception reason exists. A successful save is not proof that the upload succeeded.

`uploadPhoto` now sends the **original** JPEG/PNG/WebP bytes (maximum 5 MiB each) as `base64`, with declared `mimeType`, `source:'camera'|'import'`. For a live capture it may also send `captureLocation:{latitude,longitude,accuracyM,capturedAt}` and `captureAt`. These device fields are client-reported and are never transplanted onto imported images. EXIF claims sent separately by the client are ignored; the server reads JPEG EXIF from actual bytes before storage. PNG/WebP metadata extraction is not supported; the image can still be retained as evidence.

The server stores originals privately, calculates their SHA-256 and checks repeated file hashes. `photo.exif`, `photo.evidenceQa`, `photo.deviceCapture`, `coordinateSource`, `distanceToHsM`, and `sha256` describe provenance. `capturedAt` is the EXIF capture date/time when available; device-reported live capture time is stored separately in `deviceCapture`. A date without a known timezone remains unqualified and is not used for temporal comparison. File hashes detect changes/repeated bytes, not authenticity of the source metadata.

No arbitrary HS radius is used. Until the source defines an appropriate product-specific spatial tolerance, position QA remains `insufficient` even when a distance is available. A duplicate file or inconsistent time can be `review`. These are evidence consistency states, not certification of truth or a decision about whether burning occurred. Camera coordinates are not automatically the coordinates of the burned area.

`summaries` additionally returns `submitted`, `confirmed` (excludes not_found/needs_review), `followUpRequired`, and `evidencePending`. Existing `verified` means report submitted and is not an administrator's approval.
