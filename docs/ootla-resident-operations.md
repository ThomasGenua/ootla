# Resident operations — Stage 24

## Review routes and access

- Resident login: http://127.0.0.1:7673/resident/login
- Resident portal: http://127.0.0.1:7673/resident
- Staff queue: http://127.0.0.1:7673/admin/maintenance
- Rules / task queues: /admin/automations and /admin/tasks?view=team

The deliberate isolated seed is `npm run demo:resident`. It creates only its separately owned synthetic resident organization, lease/contact relationship and staff account. It never runs at application startup and never resets retained data. Existing edits/passwords/rules are preserved on repeat.

Resident: resident@demo.ootla.test / OotlaResident!2026.
Resident-organization staff: residentstaff@demo.ootla.test / OotlaDemo!2026 at the normal /admin/login.
The original administrator belongs to a different organization and cannot access this resident demo.

## Connected bathroom-fan walkthrough

1. Sign in as the resident with normal password authentication at **Resident sign in**. Use **Fill demo resident credentials** only to fill the masked fields, then **Sign in**. On **My home**, choose **Open my home** for the explicitly granted lease.
2. Choose **Report an issue** to open the clearly labeled **OotlaAI request guide | Scripted intake**. Describe “My bathroom fan has stopped working.” Supply the room, urgency, contact preference and requested access window.
3. Choose **Continue to contact & access**, provide preferences and acknowledge the property guidance, then **Review request** and **Submit request** deliberately. Only a successful save opens the request page; its URL contains the persistent identifier and the page shows the saved **Awaiting assignment** status. Requested access does not book a technician.
4. Optionally attach a small supported private image or document, then refresh and download it through the authorized route.
5. In another browser/session, sign in as residentstaff and open Maintenance. The demo includes an in-app unassigned-request rule. When enabled and not paused, its worker evaluation creates a native staff follow-up for the saved unassigned request. Open Tasks or Automations activity; refresh does not create duplicate reminders. Rules may be deliberately evaluated/processed from their workspace.
6. Open the request and assign authorized staff. Its obsolete unassigned reminder is cancelled when the worker rechecks it; staff-edited tasks are preserved.
7. Refresh the resident request. It shows the saved assignment with the property-team label and resident-visible update. Private staff notes remain invisible.
8. A separate confirmed appointment requires **New request status: Appointment scheduled**, a future **Confirmed appointment (your local time)**, **Supporting confirmation** and the explicit confirmation checkbox, followed by **Save status update**. Inputs use the identified browser timezone; saved appointment and due times display the property timezone. Requested access remains a preference. Then record In progress, Resolved and Closed through permitted transitions.

## Data and authority

Resident sessions are separate from staff/applicant sessions. Explicit access grants point to canonical resident/contact/application/lease relationships; shared households and addresses grant no document access. Current session, lease and grant checks are repeated on records and file downloads. Invitations expire, store only token digests and use a fragment so the token is removed from the browser address before submission. Residents can read only their own submitted requests and files, even when another resident has a grant on the same lease.

Files stay private in PostgreSQL, with size/type/content validation, safe download names and no static public path. Messages distinguish resident-visible updates and internal staff notes. Native task links retain the canonical service request rather than attaching work to a closed leasing lead. Reporting, reminders and Ask history use current record/property authorization.

Standalone requests are Ootla-owned. Yardi-connected requests persist locally and explicitly await a documented configured maintenance-write capability. Current demo/live adapter scaffolding has no such write transport; connector degradation cannot turn a local save into external confirmation. No dispatch, technician arrival or provider write is claimed.

Only actual lease dates and active, unexpired approved renewal offers are explained. Standalone authorized staff can record approved terms with evidence; unsupported Yardi/provider approval returns an explicit setup response. Neither the assistant nor portal signs a renewal or changes rent autonomously.

An external payment handoff appears only when an approved existing-provider destination is configured. The portal does not charge/capture/refund/authorize payments, store card details or turn an application fee into paid rent.

Configured emergency instructions are shown before submission. Possible-emergency indicators create staff escalation through the configured native reminder owner; they do not promise an emergency response or dispatch.

Ask Ootla can summarize unresolved requests, explain the selected request/approved renewal terms and preview a native follow-up. Creation is reported only after normal task persistence and explicit confirmation. The resident collection helper is scripted simulation, without live inference or outbound communication.

## Setup and verification

Migration022 is additive; use `npm run db:migrate`, then the deliberate resident seed. No actual .env edit, new dependency, production deployment or reset is required. Verification outcomes and any remaining limits are recorded in ootla-progress.md and the final batch handover.
