# Property operations

This extension adds five workspaces to the existing Ootla portfolio. Apply additive migration `021_property_operations.sql` with `npm run db:migrate` before starting the new server. Readiness requires migration 021. Existing migrations, contact identities, application evidence and source inventory remain intact.

## Maintenance dispatch

Open **Maintenance** (`/admin/maintenance`) or create a work order from a resident request. Organization administrators maintain a property-specific vendor directory. Staff assign a vendor and eligible owner, schedule a visit, record entry arrangements, estimates and actual costs, and post a separate update visible to the resident. Assignment records the dispatch plan; staff contact the vendor through their approved channel. Ootla does not send vendor messages or grant entry permission.

Work progresses through open, scheduled, in progress, completed or cancelled. Completion requires a description. Staff can attach up to ten validated PNG/JPEG photos, each up to 2 MB. The signed-in resident sees appointment information, completion notes and photos in `/resident`; internal entry instructions and costs stay private. Residents confirm completion or explain why more work is needed. A subsequent staff update clears earlier confirmation so a changed completion can be reviewed again.

## Renewals and move-outs

Open **Renewals** (`/admin/renewals`) and select an active resident to record their current term, rent, owner and expiry follow-up days. The initial next action uses the earliest configured milestone, with 90/60/30 days as the default. Staff log completed follow-ups and choose the next action date. These dates are operational reminders, not jurisdiction-specific notice calculations.

A renewal starts as a private proposal draft. After staff review, sharing makes it visible in the resident portal and prepares an unsent email in the inbox. Residents accept or decline the proposal as a statement of preference. Recording a signed renewal requires acceptance, a staff-supplied signed-evidence reference and explicit review. It updates the tracked tenancy term while retaining prior history. It does not manufacture signatures, verify a provider lease, or overwrite the canonical lease/signature evidence. There is at most one active proposal for a tenancy.

Staff can record or cancel a move-out notice, with a reason retained in history. A confirmed departure can be recorded only on or after the planned date. Completion ends that resident relationship's portal access and resets the linked unit's turnover checklist. Source availability is not changed to available. The original resident, contact, application, lease and service history are retained.

## Vacancy board and waitlists

Open **Vacancies** (`/admin/vacancies`) to see units, source availability, turnover stage and expected ready date. Inspection, repairs and cleaning determine readiness, with an owner and notes. A completed move-out creates an inspection handoff; unfinished turnovers also exclude units from lead suggestions.

Search for an active leasing prospect already interested in the property to add a unit shortlist entry. Preparing an availability follow-up requires the unit to be reported available, verification within the last seven days from a supported source, and no unfinished turnover. It creates an email draft and opens the inbox for review. Closing and reopening entries preserves their history.

Both availability drafts and renewal drafts retain their source context. Sending rechecks the current workflow, including proposal status, expiry, shortlist state and verified availability. Staff edits do not bypass this check. Changed or superseded contexts require a fresh reviewed reply; existing consent and provider requirements still apply. Tests use simulated sends, with no provider calls.

## Duplicate resolution

Open **Duplicates** (`/admin/duplicates`) for exact email or normalized phone candidates. Review both contacts' properties, channel consent, leads, conversations and applications. An administrator records a reason and either links the pair with a preferred contact record or marks them as different people. Decisions are versioned and can be reviewed again.

Linking is a non-destructive pair-level resolution. It does not collapse identities, reassign applications, combine portal accounts, transfer opt-ins, or rewrite source records. Original records and independent consent remain visible. Staff need access to every property related to both contacts. Matching details alone never make an identity decision.

## Business-hour response targets

Open **Response targets** (`/admin/response-targets`). Administrators configure each property's timezone, one working window per weekday, reply target, additional business minutes before escalation and an eligible manager. A closing time of 00:00 means the end of that day. At least one hour of weekly working time is required; holidays and split/overnight shifts are not modeled.

The **Needs attention** queue counts working minutes across closed days and timezone changes. Existing unanswered inquiries are recalculated when a policy changes. An explicit conversation deadline takes precedence. Disabled or absent policies retain the four-hour default. Snooze rules are preserved. Escalations appear in the eligible manager's queue; if that manager loses required access, ownership falls back to the conversation owner. No notification or reply is sent automatically.

Needs attention also includes overdue maintenance visits, tenancy next actions, overdue unfinished turnovers and ready waitlist follow-ups. Existing task, application, resident-request and mention items remain available with work-type and owner filters.

## Access, retries and verification

Staff endpoints under `/api/property-operations` revalidate the current session, membership, environment, role and property/lead access inside the transaction. Resident endpoints under `/api/resident-workflows` require a currently active relationship and an authorized participant. Vendor configuration, duplicate resolutions and response-policy changes require an organization administrator. Reads are private and uncached; writes validate the origin and schema.

Version checks reject stale forms. Request receipts distinguish exact retries from changed payloads and are checked after authorization. Lead, relationship and workflow locks coordinate staff and resident actions. Photo downloads require current access. The history retains actor, timestamp and details separately from public communications.

`npm run check:operations` covers migration preservation, the existing operations stack and all five new APIs, including foreign organization/property denial, concurrent creation, retry conflicts, resident privacy, signed-evidence separation, move-out access revocation, stale generated drafts, and weekend/DST deadlines. `npm run check:operations-browser` also drives the staff/resident journeys and checks eleven new list/detail screens at 320, 390, 768 and 1586 pixels. CI additionally runs the production build, release/restore checks, calendar contracts, lease/pilot browser journeys and container build. These checks use disposable databases and simulated or mocked providers; they do not certify a live customer integration.
