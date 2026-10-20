# HS Verification v2.8

## Changes
- Public users must choose a province every initial entry. Until then no HS or inspection summary is displayed. Clearing/changing province clears old results immediately.
- Public `bootstrap`/`getDatasetInfo` use `payload.provinceCode`. Missing/invalid/unpublished province yields no HS; the backend publication allowlist still applies.
- Province selection moves to a visible public selector. Admin/inspectors remain locked to assigned province; Super Admin retains nationwide overview.
- Boundaries load only relevant province files. District/tambon selection or an HS click enables and focuses the matching geometry; actual point-in-polygon result takes precedence over declared area names. Original HS source data is not rewritten.
- Summary has cascading district and tambon selectors synchronized with the map. Changing parent area clears lower village filters.
- Team editing is Super Admin only, enforced by Apps Script and frontend. Admin still manages own province; existing passwords/accounts/approval process unchanged.

## Deploy
Back up existing Apps Script, replace with `docs/AppsScript-v28-All.gs`, save and run read-only `checkRuntimeV28`. Expect version2.8.0 and unselectedPublicHs0. Update existing web-app deployment to a new version using the same URL. Publish matching frontend. No schema migration or account creation is required.

## Scope and limitations
Public HS follows existing `PUBLIC_PROVINCE_CODES` (legacy fallback62). Choosing a province without imported/published data shows no HS and never substitutes another province. Geographic boundary files are public display data, independently available for selected provinces.
Some boundary datasets are incomplete (see existing boundary manifest/source notes). Missing geometry, uncontained HS or declared/coordinate mismatch gets a visible status; display geometry is not a legal boundary certification or an edit to HS coordinates.
The map retains viewport/zoom controls, cache limits, lazy province loading and Canvas markers. It does not fetch all nationwide tambon geometry at startup.

## Verification
Full Node tests, combined Apps Script syntax, direct API missing/selected province checks, and rendered browser checks of no-choice gating, district/tambon summary and actual HS boundary focus. No real accounts or approvals modified during testing.

Apps Script deployed 2026-10-20: deployment version 10, runtime 2.8.0, existing endpoint retained. Read-only checkRuntimeV28 passed: privacyConfigured=true and unselectedPublicHs=0. Automated suite: 227 passed, 0 failed. Browser: Khlong Khlung / Wang Khaem summary=10 HS, coordinate-containing tambon highlighted.
