# Renewals pilot

## Existing behavior and placement

The former Maintenance Resident access & approved renewals panel bundled two independent actions. Resident invitations created a private expiring link for one canonical person/lease; they did not send an email. Approved-term publication deactivated previous current information and saved a staff-approved row, immediately eligible for display to that authorized resident. It did not extend a lease, negotiate, accept or sign a renewal.

Those forms and their broad record picker are removed from Maintenance. Essential Maintenance settings and request Conversation stay intact. Renewals now lives at /admin/renewals under Properties. Protected resident invitations and grants live at /admin/resident-access under Settings, preserving scoped property-manager and organization-admin access.

## Supported workflow

The compact directory shows resident, property/unit, actual lease end, approved-information state and a real related staff task. Unified search, compact Filters, sorting and pagination run on the server. Detail shows the selected canonical lease, current information, historical approved terms and staff follow-up history. Prepare terms opens a contextual dialog only for an authorized active locally managed lease. Explicit approval is required before Save approved terms makes the information available in the resident portal. There is no automatic publication on page open or fixture rerun.

Computed states are Current terms, Expired terms, No approved terms and Inactive lease. Staff tasks retain their actual open/completed/cancelled states. The model does not support renewal acceptance, signing or a completed-renewal status; completed follow-up is shown honestly as task history. Yardi-connected, mapped or explicitly provider-owned leases cannot be published over by local staff. Publication cannot label local text provider_verified.

## Accounts and routes

Staff: http://127.0.0.1:7673/admin/login with admin@demo.ootla.test / OotlaDemo!2026, then http://127.0.0.1:7673/admin/renewals . The normal Fill demo credentials button remains available.

Prepared examples, based on29October2026:

| Resident | Scenario | Actual information/task state |
| --- | --- | --- |
| Morgan Lewis | Upcoming expiry | No approved terms; review task open |
| Samira Okafor | Staff preparing terms | No approved terms; preparation task open |
| Daniel Brooks | Resident reviewing information | Current synthetic approved information; follow-up open |
| Elena Rossi | Follow-up required | Information expired; follow-up overdue |
| Amir Patel | Historical follow-up complete | Ended/inactive lease; completed staff task and inactive historical information |

The examples reuse Cedar House/Grove Lofts and add five distinct preview units and canonical resident/lease records. No original lease dates, rent, statuses, offers or accounts are changed. Approved information is clearly labeled synthetic snapshot data on these new preview relationships; no existing-resident publishing operation or outbound notification occurs.

## Short walkthrough

1. Open Renewals; search a resident, open Filters and change rows per page. Open Daniel Brooks to inspect current information and history, or Samira to inspect the preparation task. Prepare terms reveals a small contextual dialog; Cancel writes nothing. Deliberate approved publication changes only that selected relationship's information.
2. Follow Open task to use the existing native task workflow. Amir's completed task is historical follow-up, not proof of a signed renewal.
3. In a separate tab sign in at http://127.0.0.1:7673/resident/login using renewals.review@demo.ootla.test / OotlaDemo!2026, then open http://127.0.0.1:7673/resident?lease=12834a0e-91aa-56b7-adc1-a2b62e15b37a . Only Daniel's authorized current information appears. The preparing and expired-case accounts see no current information, and the former-lease account cannot sign in with inactive access.
4. Open http://127.0.0.1:7673/admin/resident-access?relationship=12834a0e-91aa-56b7-adc1-a2b62e15b37a to inspect that exact resident's grants. Invitation creation is explicit, returns a private link and sends no email. Grant changes require confirmation. Do not revoke access unless that is the manual test you intend to perform.

## Preparation and startup

The existing demo is running and all five examples are already prepared. No installation, migration, environment change or restart is needed. The deliberate repeatable command is npm run demo:renewals from C:/Users/user/Documents/software/ootlademo; it changes zero records after a completed preparation receipt, preserving later staff work. Startup never invokes it. No live preparation or deployment was performed.

A verified private native backup was taken before preparation. Original29 migrations and all original records are preserved. Focused checks use disposable databases for mutations, normal authentication for retained read-only review, and block external communications. Detailed results are recorded in docs/ootla-progress.md and private .local/renewals-pilot-* receipts.
