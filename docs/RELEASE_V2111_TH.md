# v2.11.1 — Restore prior backend; external Team page; readable counter

## Implemented
- Apps Script editor source restored through Google API to the exact pre-v2.11 snapshot (runtime2.9.0). Readback matched original. Existing deployment metadata reports version11, ANYONE_ANONYMOUS and USER_DEPLOYING. No further deployment was made using the CLI identity that differed from the prior browser identity.
- Repository Code.gs/Config.gs/TeamService.gs also restored to the pre-team-portrait revision. Current paste-ready backend remains docs/AppsScript-v29-All.gs. Do not follow the superseded v2.11 version13 instructions.
- Both index.html and demo.html Team menu open https://krit-pj.github.io/TH-Agri-Risk-Maps-Burning/team.html in a new tab with noopener noreferrer. Local Team initialization/photo API integration is no longer loaded by these interfaces. Other navigation/scopes remain unchanged.
- Footer counter explicitly overrides muted registration.css text: white on dark green, opacity1, weight600 and readable font size; contrast >=7:1.

## Evidence and outstanding dependency
261 Node tests PASS, including previous authentication/approval regression coverage, external link in both interfaces and counter contrast. External Team URL HTTP200. Drive folder explicitly supplied by user was readable and editable by the existing Google connection. No Drive contents/permissions or user records were changed.
Public Apps Script /exec checks still returned403 HTML (bootstrap/getRegistrationPolicy), not JSON, after user re-supplied the same URL. Live successful user Login is NOT_RUN; cannot claim users can log in while the API itself is inaccessible. The external folder and Google Sheets URLs are not API endpoints. Library URL /macros/library/.../13 is not a web-app endpoint.

## Required original-account action
1. Open the Apps Script project in the original Google account.
2. Run the existing read-only function checkRegistrationPolicyReady. Complete Google authorization if prompted, and confirm execution finishes.
3. Create a NEW web-app deployment from the restored editor source. Keep the intended original access (execute as the deploying account, existing public access model). A new Google version number may be assigned, but the restored code is runtime2.9.0.
4. Send the exact Web app URL ending /exec from that new deployment. It should differ from the old rejected endpoint.
5. Update/verify site-config.js and any matching old browser endpoint override, then check public policy and a real authorized login. Do not guess or repeatedly try user credentials.

The existing /exec URL must not be reported healthy based only on Drive access or deployment metadata. Browser-session probing was rejected by automatic approval review; no workaround was used. Original-account runtime authorization/deployment remains a human dependency.
