# Calendar and viewing scheduling - Stage 13

Stage 13 adds internal scheduling and a lead-scoped public booking flow. Google Calendar and external notifications are not required. Preserve the approved Overview and the independent Yardi/simulator boundary.

## Pages and first setup

Use normal sign-in at http://127.0.0.1:7673/admin/login.

- Calendar: /admin/calendar
- Day/week/agenda: /admin/calendar?view=day, ?view=week or ?view=agenda
- Property schedule: /admin/calendar?view=settings&propertyId=<real property UUID>
- Lead booking: /admin/calendar?view=book&lead=<real lead UUID>
- Saved viewing: /admin/calendar?viewing=<real viewing UUID>
- Public invitation entry: /book#token=<issued capability token>

Select actual saved records through the UI; placeholders above are route explanations, not fabricated record URLs. The public entry without an invitation shows an unavailable-link state and exposes no staff calendar.

A property has no new managed schedule until staff explicitly configures one. An authorized administrator chooses its IANA timezone, normal tour duration, buffers, meeting location and whether public booking is permitted. Eligible staff have per-property same-day weekly availability windows. Their availability grants no new organization/property permission. Staff can manage their own availability where authorized; administrators can configure eligible staff. No schedule/booking is seeded on startup.

For a demo walkthrough, use a future weekday with eligible staff hours. The two retained legacy demo viewings are on 2026-10-23 and 2026-10-24; choose another date for the affected property. Do not reset or silently rewrite them.

## Lead-to-viewing walkthrough

1. Open Leads, choose a saved lead and use Schedule viewing in its authorized staff workspace.
2. Choose an explicit property interest, optional unit and eligible staff member. If unconfigured, open property settings, choose the correct timezone/duration/buffers/location and enter staff hours; return to the lead booking.
3. Choose a future date and load actual server-generated slots. The displayed time/UTC offset belongs to the property's timezone, not the browser/host timezone. Select an offered slot and book.
4. Open the saved viewing. Confirm property, lead, unit, staff, location, timezone, duration/buffers and Scheduled status. Refresh; it is the same persistent viewing. Open the lead timeline for the action and appropriate stage summary.
5. Reschedule using another offered slot. The original viewing identity/history stays; the old slot is released transactionally only after the new reservation succeeds. A competing request gets a slot conflict without displacing the first appointment.
6. Cancel deliberately with a reason. Review the saved event and simulated notification. If no other active viewing remains, only an untouched scheduler-owned early-stage summary can be restored; advanced/manual lead progress is preserved.
7. Completion is recorded after the viewing ends; no-show after it starts. Those actions are not available early. Historical event/notification receipts remain, and a lead is never automatically leased or approved.

Day/week views and the compact mobile agenda use the same bounded server results. Use filters and paging rather than loading the entire portfolio/calendar. Properties and units remain separate records.

## Constraints and timezone policy

Instants are stored in UTC. New managed records snapshot the property timezone, duration, buffers, assigned staff and location. Offered local ISO values include an explicit UTC offset and must round-trip through the selected IANA zone. A nonexistent DST time is rejected; repeated DST clock times are distinct only with their correct offsets. Calendar range/day boundaries are computed in the selected display timezone.

Bookings and reschedules acquire sorted transactional resource locks and recheck current availability/permissions/versions. The same physical staff user cannot overlap across properties/organizations; errors reveal no other organization's event details. A lead cannot overlap its viewings. Same-unit tours conflict; a unitless property tour blocks the property across units. Different units and different staff may run in parallel. Buffers count toward resource/availability constraints.

Changing timezone, duration, buffers or staff hours must not invalidate existing future managed appointments. Staff review/reschedule is required rather than silently shifting them. Location is a saved meeting-location snapshot; changing a property's default does not silently relocate an existing appointment. New scheduling does not certify inventory/unit availability.

Legacy viewing records have no recorded duration, assigned staff or property timezone. They remain labeled read-only legacy data with unknown metadata. Their affected property-local day is conservatively unavailable for new scheduling; no invented end time or migrated staff assignment is used. This does not block other properties/dates or change retained records.

## Secure public booking

An authorized staff member deliberately issues a lead/property/unit/staff-scoped invitation with bounded expiry. The raw random capability is returned once for manual sharing; only its server digest is stored. No email/SMS invitation is sent.

The browser reads the token from the fragment, removes it from the address/history and keeps it only in the active page closure. It posts the token in JSON to the same-origin public API; token values are not API queries, server URL paths, referrers, analytics fields or localStorage. If the page is refreshed, reopen the original private invitation link. Do not put invitations in public examples.

The recipient sees only the approved property/meeting location, timezone, duration, available slot choices and their booking outcome. Private staff identities, other events, contact records and internal record IDs are omitted. Slot keys are signed and rechecked; changing a time/token cannot bypass the same internal conflict-safe booking service. Invitations expire, can be revoked and accept one booking. Request receipts prevent duplicate submissions/notification history. Current staff/scope/settings eligibility is rechecked.

After staff reschedules or changes a booked viewing's status, a still-valid invitation must show the actual current booking facts or a safe unavailable state, never an obsolete Scheduled claim. Terminal/expired/revoked links do not create replacement bookings.

The link is a capability for this viewing only, not a staff/applicant/resident login. Public booking creates no arbitrary contact/lead and silently merges no identities.

## Permissions, source authority and notifications

Current server-loaded staff permissions and all explicit lead interests apply. Read-only/portal/foreign records cannot use private scheduling tools. Assigned agents must be eligible and currently scoped. A lead's viewed property interest cannot be removed while any viewing history refers to it.

Successful early bookings may advance leasing to Tour scheduled or sales to Viewing scheduled. Application/lease/closed stages and staff-owned notes, preferences, ownership and tasks are not overwritten. Public actions identify a public invitation origin rather than falsely naming its issuer as the actor.

Every action has durable actor/time/provenance history and a duplicate-safe simulated notification receipt. The demo does not send email/SMS, calendar invitations, provider writes, payment requests or AI decisions. Internal scheduling remains usable with Google unconfigured. Secondary-interest viewings are supported; the older Tasks module still uses its established primary-property context and is not expanded by Stage 13.

## Commands and preservation

Migration 011_calendar_viewings.sql is additive to existing migrations 001-010. Run npm.cmd run db:migrate on another configured checkout; do not reset/reseed retained data. Use the existing running preview. If stopped, run npm.cmd run db:local, then npm.cmd run dev from C:/Users/user/Documents/software/Ootla.

Focused stage checks and final results are recorded in ootla-progress.md. No live communication/provider activation, production deployment or later numbered stage is authorized. Stop after Stage 13 for review.

## Verification provenance

Stage 13 files were found partially wired on Stage 14 entry. Native route/rendering dependencies were completed and booking concurrency/actions, lead timeline, DST offsets/day boundaries and browser navigation verified during Stage 14. This is not a retrospective claim of a prior completed stage or user approval. See the Stage 14 progress report and ootla-google-calendar.md for optional Google behavior and its unverified live status.
