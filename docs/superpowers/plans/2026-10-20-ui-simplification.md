# UI simplification v2.8.1 Implementation Plan

Goal: Preserve v2.8 scope/security and automated boundaries while removing redundant controls.
Execution: inline with executing-plans; no backend schema/auth changes required.
- [x] Add behavioral regression checks for session navigation, locked quick province, automatic boundaries without visible controls, and summary labels preserving province grouping.
- [x] Update access-navigation.js and app.js: single Login/Logout action; quick province read-only; concise area labels. Hide duplicate account/session bars and boundary controls; preserve automatic geometry.
- [x] Verify full suite, syntax, browser rendering and review diff; publish GitHub and complete ZIP. Apps Script remains verified v2.8.0 deployment10 because API behavior is unchanged.
