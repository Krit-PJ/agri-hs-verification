# Registration reliability v2.9 Implementation Plan

Goal: Repair both registration flows, show รอการอนุมัติจากผู้ดูแลระบบ after durable pending writes, and verify Super Admin review at every existing request level.
Approach: systematic debugging of browser validation, live policy/schema and Apps Script readiness before choosing fixes; preserve v2.8.1 UI and provincial scope.
- [x] Diagnose live submit path and readiness without approving any real applicant; reproduce concrete defects in tests.
- [x] Correct verified frontend/backend defects with meaningful tests; explicit pending confirmation and existing Super Admin full review authority.
- [x] Verify full suite, browser flow, live Apps Script diagnostic/deployment, publish GitHub and complete ZIP.
Ruling: The request grants Super Admin approval of existing inspector/provincial-admin request types. Do not add anonymous Super Admin self-registration or automatically approve accounts.

Evidence: policy, schemas and account capacity healthy on Google; silent disabled/validation and unbounded wait paths improved. Browser local forms and real Repository simulated Sheets registration/review/login passed. Identity-scoped stale-list guard red/green regression checked by reviewer.
