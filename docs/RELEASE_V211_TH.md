> Superseded by v2.11.1: use the external Team page and restored backend. Do not follow the version13 deployment steps below; see RELEASE_V2111_TH.md.

# v2.11 — Team portraits, role and external profile link

## Changes
- Hide province scope card only while Team view is active; restore it on Work/Summary/Admin according to existing access rules.
- Super Admin editor adds optional role, optional HTTPS external link, optional JPEG/PNG/WebP upload, preview, replace and remove.
- Client redraws images to JPEG at maximum384px and <=100,000 bytes; no original EXIF is sent. Input limit15MB. Fields are locked while saving. Portrait reads are cached per endpoint/photo reference.
- Shared role/link metadata persists via protected saveTeam. Image files stay in the configured private Drive photo folder; public getTeamPhoto resolves only a current memberId+photoId, not arbitrary file IDs. Raw Drive IDs are omitted from public directory. Removed/replaced files remain private for recovery; no old files are permanently deleted. New file is trashed on metadata-write failure.
- Existing members remain compatible. Older clients that update name/position/agency do not erase new role/link fields. API without teamMedia capability cannot silently accept and discard new fields.

## Verification
263 Node tests pass: province-card visibility by view, form-to-API role/link save and render, optional/no-photo records, safe URLs, Super-only writes, image bounds/type, registered-photo-only reads, remove, stale revision, failed persistence cleanup and legacy compatibility. JavaScript/combined Apps Script syntax checks pass. Drive integration is tested with a fake Drive; no real portrait or person record was created as a deployment test.

## Deployment and recovery — ACTION REQUIRED
Apps Script source was backed up, compared, updated and read back exactly. Version13 contains the complete new backend. The endpoint remained identical and access/executeAs settings were retained. However, anonymous HTTP requests returned403 HTML. The locally signed-in CLI account differed from the previously used Google account. Deployment config was restored to version11; anonymous access still returned403. Do not claim the backend is working until original-account redeployment and post-action checks pass.

The original Google account must open:
https://script.google.com/u/0/home/projects/1QixJCJ0HZ_4dv5O5XOg2JZQflRo9e5Ux55Mb8X9LcgDM_6wuCdJGhj_F/edit
Then การทำให้ใช้งานได้ > จัดการการทำให้ใช้งานได้ > edit the existing endpoint > select version13 > deploy, retaining existing access and execution settings. Do not create a different endpoint or change passwords. After redeployment verify getTeam returns capabilities.teamMedia=true, nonexistent photo returns NOT_FOUND and unauthenticated saveTeam is refused. The original portrait folder must be private before upload; backend refuses an exposed folder.

Complete paste-ready source: docs/AppsScript-v211-All.gs. Existing data, account credentials, approvals, source HS and navigation settings are unchanged by this feature. Shared images need the backend redeployment; UI code alone cannot store them globally. Browser session recovery automation was rejected by automatic approval review as session-probing risk, so no workaround was used; original-account action is required.
