# v2.9.1 — Super Admin browser configuration

Published baseline checked: GitHub commit6f3b14d, Pages app.js?v=2.9, successful workflow. No Apps Script modifications required; existing getRegistrationPolicy endpoint used as an anonymous connection probe.

Super Admin can edit/test Google Apps Script /exec URL; explicit test-and-save switches only after compatible response, clears old session, blocks changes while offline jobs/import/verification work remain, and requires fresh login on new server. Probe never sends existing token/CSRF. Session restored in another tab is bound to its original endpoint.

Risk-map and Green Gain Hub labels/HTTPS URLs editable by authenticated Super Admin. Default hub https://krit-pj.github.io/Green_Gain_Hub-KPP/ . Both links have explicit borders, hover/focus styles and responsive layout.

Scope: settings persist in localStorage for this browser/device only. They do not rewrite deployed site-config.js or Google Script Properties and are not synchronized to other visitors. To change defaults for everyone, update site-config.js and default link values in site-settings.js / HTML and republish. UI settings are not security permissions; backend authorization remains unchanged.

Verification: 245 Node tests pass including unsafe URL rejection, Super-only save, credential-free probe, incompatible API rejection, endpoint switching and outbox guard. JavaScript syntax and diff checks passed. No interactive browser tool available in this session, so visual/device rendering and real authenticated Super Admin clicks were not run; no claim otherwise.
