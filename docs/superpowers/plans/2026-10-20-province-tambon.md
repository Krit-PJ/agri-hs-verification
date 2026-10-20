# Province-first HS and automatic tambon boundaries v2.8

Goal: Require public province selection before HS/summary display, automatically activate relevant tambon geometry, add district/tambon summary filters, and restrict team editing to Super Admin.
Architecture: Public API constructs an explicit selected-province actor from payload.provinceCode and never returns HS before a valid permitted choice. Frontend chooses province before data load; cache identity and in-flight guards include selection. Geometry stays public static display data, loaded only for selected province with viewport limits and active HS highlight. Existing server role/province authorization remains authoritative.
Tech Stack: existing static JavaScript/Leaflet, Google Apps Script, Sheets, Node tests.
Spec: User request2026-10-20 (five requirements); other UI/navigation/auth/PDPA unchanged.

- [x] Backend: selected public actor factory; scope public bootstrap/metadata/boundary config; require Super Admin to save team; version2.8; regression tests. No live account changes.
- [x] Boundary module: automatic province/district/tambon focus from selection/HS coordinates with stale request guards; public selected geometry visible; preserve inspector/Admin scope and bounded lazy loading. Behavioral tests.
- [x] Frontend: mandatory public province selector, no preselected province, clear map/summary on change; payload propagation and stale data guards; district/tambon summary filters; Super-only team controls; tests.
- [x] Review all contracts, full tests/syntax, browser validation; deploy Apps Script+GitHub and deliver ZIP with coverage/geometry limitations stated.

Contract: API getDatasetInfo/bootstrap accept payload.provinceCode for public. Missing selection => empty HS + no boundary geometry, no default62. Invalid/unpublished province => no HS, fail closed. Server publicProvinceCodes config tells available exposure scope. Backend enforce saveTeam Super-only. Boundary create env gets selection context via env.activeArea() (provinceCode,district,tambon,hs) and existing env.selectedProvince(); parent calls sync when area/HS changes. Admin/Super authenticated UI scopes remain assigned/all.
Review: cache cross-province mix, province changes while loading, incomplete boundaries, duplicate tambon names across districts, coordinates disagreeing with declared area, direct API team edit, mobile rendering cost.
