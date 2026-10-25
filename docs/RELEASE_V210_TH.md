# HS Verification v2.10 — Super Admin scope and dashboard theme

## Scope
Super Admin has a visible scope selector above main content: จังหวัดเดียว / หลายจังหวัด / ทุกจังหวัดที่มีข้อมูล. Multiple provinces use a native multi-select and an explicit Apply action. Selection clears dependent district/tambon/village/date state, invalidates in-flight data, then reads each provincial sheet with concurrency3. National mode discovers HS_<code> tabs from the configured Google Sheet rather than assuming 77 provinces exist. A failed province read fails the aggregate, never reporting partial totals as complete. Single province requires an explicit province choice.

Map markers, filter options, summary, print report and CSV export use the chosen province set. Multi/all CSV exports the currently displayed HS fields, whereas the existing single-province export remains unchanged. Boundary geometry plans and fitting restrict to selected codes and keep existing zoom/viewport limits. Admin/inspectors retain assigned scopes; public remains province-first. This is a display scope, not a grant of backend rights. Apps Script files/deployment unchanged.

## Theme
Reference https://npt-dashboard.netlify.app/ inspected from actual HTML/CSS. Applied primary #1a7f37, dark #116329, light surface #f6f8fa, border #d0d7de; Prompt headings and IBM Plex Sans Thai body with existing Thai font fallbacks. Preserve existing sections, menus, forms, logos and workflows. Theme tokens JSON updated to match CSS; contrast tests pass at 4.5:1 for defined text pairs, focus/control borders3:1.

## Verification
254 Node tests pass plus JS syntax/diff checks. Real Google source inventory: 17 provincial tabs, 14,683 valid HS before date filtering, zero rejected, at verification time. Tests cover one/multiple/all scope, non-Super denial, boundary subset and read failure without partial aggregates. No real accounts, approvals or source imports changed. Browser screenshot verification was attempted but tool argument schema could not be resolved in this session; visual/device behavior and authenticated UI click-through remain NOT_RUN. No screenshot claim.

## Use
Login as Super Admin. Choose scope. For one province choose it in the main province list. For multiple provinces choose entries (mobile native multiple list / desktop Ctrl or Cmd) then Apply. For all data choose ทุกจังหวัดที่มีข้อมูล and Apply. Wait for HS source status to complete, then use normal date/district/tambon filters. The current source is partial nationwide coverage; all means all data present, not all77 provinces.
