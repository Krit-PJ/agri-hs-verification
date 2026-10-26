# v2.9.2 — Read actual provincial Google Sheets

Default HS source: https://docs.google.com/spreadsheets/d/178jFMiZLLsq4f1Juq2FADERx_mYs8bAB2yzdYa5cp-A/edit

Separate the displayed HS source from the existing authentication/verification Apps Script endpoint. Public provincial tabs HS_<2-digit province code> are read via Google Visualization JSON, parsed as JSON without eval, normalized from hotspotId/districtName/subdistrictName, and validated against districtCode and coordinates. No fallback to another province or the old HS dataset on read failure. Source switch tests actual data before applying, clears old results and fiscal period, then reloads map/summary/filters. Super Admin overview without a selected province retains the API overview; select province to read the configured sheet.

Live source verification: HS_56 = 433 valid rows; HS_62 = 1,207 valid rows (all available years, date filters determine displayed total), zero rejected. Google response permitted Origin https://krit-pj.github.io, HTTP200. Tests249 pass. Both nav anchors were exercised through actual init/save handler and reinitialization, including URL hash fragments, persistence and href changes.

No Apps Script file or deployment changed. Existing verification state merges by exact HS ID. Recording a point still requires it to exist and be accessible in the unchanged API. Otherwise an explicit instruction to import it into the verification database is shown; client never pretends a public sheet is writable. New source data is not automatically imported/replaced in the old backend.

Super Admin settings: select province, open menu > Admin > HS database and API, edit Google Sheet URL, test read, then apply. API URL below remains for accounts/results. Buttons risk-map/Hub are edited separately and applied to actual anchors after a successful browser storage write. Settings persist on that browser, not globally. Website links may include # fragments; HTTPS and credential-free URLs remain required. Storage events keep link settings in other open tabs synchronized.

Global synchronized settings or writing results directly to a different Google Sheet require backend support/deployment or an authorized data import; not emulated while Apps Script changes are prohibited. No real accounts/approvals/data imports were made as tests. Interactive browser visual validation not available in this session.
