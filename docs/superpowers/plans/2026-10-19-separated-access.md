# Separate Access Surfaces Implementation Plan

Goal: Inspector Login in the main navigation; manager Login/registration only in a header hamburger menu; preserve backend authentication and approval rules.
Architecture: Small access-navigation module controls an independent header dropdown. Existing registration service presents mode-specific login and signup without visible account tabs or account-choice lists. Backend unchanged.
Tech Stack: Existing static HTML/CSS/JS and Node tests.
Spec: User request 2026-10-19 separating inspector/manager access, moving credits into team view and counters last.

- [x] Add behavior tests for independent menu, keyboard/outside dismissal and mode-specific registration.
- [x] Update index/demo markup and registration mode presentation; preserve account identity/logout after authentication.
- [x] Move credits to bottom of team section; copyright then counters in footer; responsive CSS.
- [x] Run full tests/syntax and browser desktop/narrow checks; review changes; publish and package v2.7.1. Apps Script unchanged.
Ruling: Keep existing underlying login API and mode routing, remove visible cross-role choices. Hiding a menu does not replace backend authorization. Work in existing checkout to preserve local preview and user files.

Verification: 196 tests passing; browser confirms 375px main navigation width/scroll width both375, Login fully visible, menu at top14/right12. Credits last item in teamView; visitCounter final footer child. Backend unchanged. Reviewer mobile-position finding corrected; province context relocation verified at app.js managerContext prepend.
