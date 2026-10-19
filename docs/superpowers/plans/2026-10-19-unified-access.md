# Unified Access v2.7 Implementation Plan

Goal: One access window for inspectors and managers, provincial Admin applications approved only by Super Admin, faster sign-in without waiting for map data.
Architecture: Reuse existing inspector PDPA and phone login. Add a separate pending provincial-admin request store and approval API; managers retain password authentication. No account is granted or changed during deployment.
Tech Stack: static HTML/CSS/JS, Google Apps Script, Sheets, existing Node tests.
Spec: User request 2026-10-19 and attached access-window screenshot.

Constraints: preserve existing views/data/passwords; do not edit sources; phone stored as text; server enforces roles, province, PDPA and pending status. No new password is entered on behalf of a person.
Ruling: User supplied detailed approved behavior and asks implementation; proceed using incumbent UI. Provincial requests use username/password chosen by applicant, stored only hashed, pending Super approval. Province is derived from selected provincial office.

- [x] Backend task: admin request/approval service with rate limits, duplicate checks, PDPA and Super-only approval; tests prove pending denial and province-scoped activation. Own files apps-script/ProvincialAdminRegistration.gs, dispatch/config additions and tests. Avoid auth performance edits owned by parent.
- [x] Frontend task: unified access dialog with inspector/manager modes, footer registration selection, provincial form with same notice, Super approval list. Preserve existing manager tools. Own registration-ui.js, registration.css, index.html, demo.html, frontend tests. Expose manager bridge ctx.onManagerLogin(payload), use returned profile; preserve existing login handlers until parent integration.
- [x] Parent task: trace sequential login/map calls and repeated schema/sheet reads; optimize only observed redundant work; integrate manager bridge, test and review.
- [ ] Run full suite/syntax, independent review, browser check; assemble combined Apps Script and release ZIP, update Google deployment and GitHub Pages, verify actual versions.
Review focus: role escalation, rejected/duplicate requests, missing PDPA, stale sessions on slow requests, narrow-screen dialog overflow, password material in logs/public output.

Verification: 193 tests including sign-in latency isolation and stale request failure. Apps Script deployed version9; setupRuntimeV27 confirms sheet ready and privacy configured. Reviewer found password UI mismatch and cross-flow duplicate phone; both fixed with regression tests. Final independent review was interrupted by service usage limit, controller completed focused review and full test run. No actual users approved/created.
