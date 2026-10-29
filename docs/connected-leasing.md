# Connected leasing workflows

This release connects the existing inquiry inbox, public booking and application portal, adds a prioritized staff queue, and supports private inbox collaboration. Apply additive migration `020_connected_leasing.sql` before starting the release. Readiness requires it; earlier migration files are unchanged.

## Inbox to tour to application

Open a conversation and use **Tour and application journey**. The card shows recent tours and applications for the conversation's property. A configured property schedule and eligible staff availability enable **Prepare booking invitation**. Choose a host and optional unit. The expiring private link is appended to the reply editor; saving a draft and sending it are separate staff actions. Existing email/SMS preferences, provider configuration and send review still apply.

The booking-link holder can choose a replacement time or cancel until five minutes before the viewing starts, while the invitation remains valid. Changes preserve the viewing identity, recheck current permissions, availability, signed slots and record versions, and use the same resource locks as staff scheduling. Expired/revoked links and changed host/unit/duration settings require staff help. Cancellation is terminal for that booking link. The original link must be reopened after a refresh because its token is removed from browser history and kept only in page memory.

Bookings, reschedules and cancellations create unsent email confirmation drafts in the lead's inbox. Untouched older confirmation drafts are cancelled when superseded. Staff-edited drafts remain, but sending a draft bound to an old viewing version is rejected. Calendar actions never contact a messaging provider. Existing approaching-tour rules can also prepare reminder tasks and drafts.

When the prospect is ready, **Prepare application invitation** reuses their application or creates one using the existing applicant workflow. It issues a primary-applicant invitation and appends it to the reply editor. Issuing a new application invitation revokes earlier unused invitations for that participant. It neither submits the application nor approves the applicant. No co-applicant grant is created by this action.

Invitation links deliberately appear in the staff-reviewed draft that will be shared with the intended recipient. Treat them as private capabilities: they are accessible only through authorized conversation access, never copied into activity logs or public pages. Existing invitation expiry/revocation rules still govern access after delivery. Interrupted link preparation may require a fresh invitation; no application identity is duplicated and nothing is sent automatically.

## Needs attention

`/admin/attention` combines accessible work into one paginated queue with ownership and work-type filters. Every item names its property, owner, target time and next action.

- Unanswered open inquiries use a four-hour response target unless staff set a deadline. Drafts do not count as responses; accepted, delivered and simulated replies do.
- Open, actionable overdue tasks use the existing task visibility and lifecycle rules.
- Draft/submitted/staff-review applications appear after three days without an application-record update or a recorded portal action, including applicant edits and document activity.
- Unresolved resident requests appear after one day without an update, or immediately when urgent.
- Unacknowledged mentions appear only for the mentioned staff member.

Urgent tasks and resident requests rank first, then overdue items, then upcoming replies. Within each group the oldest target is first. Thresholds are explicit operational defaults, not AI scores or automatic applicant decisions. Staff can set a response deadline or snooze an inquiry for up to 30 days. A new incoming reply clears its snooze and custom response deadline. Snoozing affects the attention queue; it does not remove the conversation from the inbox or disable separately configured follow-up rules.

## Team collaboration

Private team notes live separately from outbound messages. Each note can mention up to ten eligible teammates with access to every related property. Mentioned staff acknowledge notes from the conversation. Reading the inbox alone does not acknowledge a mention. Removing staff/property access also removes access to the note and its queue entry. Notes are append-only and paginated, with author and timestamp retained.

Focusing a reply reserves it for that browser for 75 seconds. Active editing refreshes the reservation, idle editing releases it, and navigation attempts an immediate release. A disconnected browser's reservation expires automatically. Other staff see a replying indicator and cannot save/edit/send a reply while a teammate holds it. This is a temporary collaboration guard; saved drafts still use durable version checks and reviewed send handling. Notes and ownership updates remain available while someone replies.

## Validation

`npm run check:operations` covers the new APIs along with the preceding operations release. `npm run check:operations-browser` exercises notes/mentions, queue navigation, inbox invitation preparation, public booking/rescheduling/cancellation, application invitations and nine workspaces at four widths. `npm run check:google-calendar` now migrates its owned scratch database to the current schema and runs in CI to protect scheduling and sync behavior. The existing release, lease and pilot-browser checks remain in CI. Tests own disposable databases and use simulated/mocked transports; they do not verify live provider credentials or deliverability.
