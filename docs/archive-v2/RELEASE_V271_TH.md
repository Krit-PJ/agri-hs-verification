# HS Verification v2.7.1

Frontend-only update; Google Apps Script remains v2.7.0, deployment9. No account, password, approval rule, data schema or API changed.

- Main navigation: clear green “เข้าใช้งานระบบ · Login” for inspectors; phone login and inspector signup only.
- Header top-right hamburger: reveals “ผู้ดูแลระบบ”; manager username/password login and provincial Admin signup only. Existing Super Admin approval requirement remains.
- Remove public account tagline/duplicate top login card; keep signed-in inspector identity/logout.
- Move agency/province logo attribution into the bottom of the team page, keep credits link accessible.
- Copyright first, visitor/user counters on final footer line.
- Mobile: visible two-column primary navigation so Login never requires horizontal scrolling; 48px menu button anchored top-right; dropdown supports Escape and outside click.

Validation: full Node suite, syntax, reviewer and desktop/mobile browser checks. No actual applicant registration or approval performed for testing.
