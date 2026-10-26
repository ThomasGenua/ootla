# Application, lease and move-in continuity — Stage 18

Open /admin/applications, then an application using its authorized reviewer account. The existing canonical contact, lead, application and unit remain connected throughout; resident conversion does not create a second person or a staff login.

## Review and preparation

Screening status, application decisions and payment observations are separate. Organization admins/property managers with full record access can explicitly review the report and record a decision. Request additional information first records a staff decision; an explicit Reopen for more information action returns the portal for edits/resubmission while preserving files and history. A lease workflow prevents conflicting later review decisions and legacy direct status edits.

Prepare lease requires an approved local application and consistent local lead/unit/contact. Provider-owned fields cannot be overwritten. The configured Fully signed or Completed milestone is snapshotted for the workflow; changing defaults does not rewrite an existing workflow.

## Distinct stages and evidence

| Stage | Required next step |
| --- | --- |
| Lease preparation | Authorized staff requests signature and records a reference. |
| Signature requested | Record partial-signature evidence. |
| Partially signed | Record full-signature evidence. |
| Fully signed | Schedule move-in in the property's timezone. |
| Move-in scheduled | Record completion only once the move-in time has arrived. |
| Completed | Resident relationships are active; history is retained. |

Stage skips are rejected. Evidence is either an authorized **manual attestation** or a clearly marked isolated **demo event**. A PDF upload is never proof of verified electronic signatures. A browser cannot submit a provider-verified evidence type. No signing-provider API is invented or activated.

At Fully signed, pending-move-in relationships reference the existing contacts and lease; Completed activates them. Leased occurs only at the configured milestone. Active leases cannot overlap for the same constrained unit, including concurrent writes.

Move-in tasks use the normal task service: configured titles, property-local due dates, routing, actual eligible owners or Unassigned, reminders and history. Stable receipts prevent duplicate tasks/residents/events on retry. Move-in tasks remain actionable after the lead becomes Leased. Ordinary CRM follow-ups on closed opportunities retain the established cancellation policy.

## Manual demo

1. Sign in at http://127.0.0.1:7673/admin/login as applications@demo.ootla.test / OotlaDemo!2026.
2. Complete the linked application's portal, screening and explicit staff review/approval.
3. As organization admin, review lease milestone and move-in task templates in its lease panel.
4. Prepare the lease; advance each permitted stage, selecting Demo event and entering an explanatory reference.
5. Schedule move-in in the displayed property timezone. Use an already elapsed synthetic time if demonstrating Completed now.
6. Open the linked lead and tasks. Confirm one lease, original contact identity, resident continuity, correct Leased milestone and persistent owned/unassigned move-in tasks.
7. Check the applicant portal: its next steps follow the actual workflow.

Migration: 016_lease_move_in.sql. Focused checks: STAGE_CHECK=18 npm run check:application-journey and npm run check:lease-browser. Date-only persistence and DST gap/ambiguous-time rejection are covered; source-owned writes, direct legacy bypasses, duplicate events and simultaneous unit conflicts are denied.

Live signing/Yardi interfaces, source mappings, credentials, approved signature verification, client notices and retention remain external configuration. Accounting remains authoritative in Yardi; no payment authorization is introduced.
