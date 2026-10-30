# Property collaboration

This release connects five workspaces to the existing maintenance, turnover, resident and task records. Apply additive migration `022_property_collaboration.sql` with `npm run db:migrate` before starting the new server. No dependency or provider configuration change is required.

## Vendor jobs and quote approvals

Open **Vendor collaboration** (`/admin/vendor-work`) from the sidebar or a maintenance work order. Assign an active vendor first, review the job details, then issue a private link. Copy and share that link through your approved channel. Ootla does not send it automatically.

Each link authorizes one vendor for one job, expires after seven days and can be replaced or revoked. Its digest is stored server-side. The token is removed from the address bar after opening and remains only in page memory; reopening a fully reloaded page requires the original private link. Access also ends if the vendor assignment or issuing staff member's required access changes.

Vendors can accept or decline, propose an appointment, submit quotes, upload completion photos/invoices and submit completion for staff review. Proposed visits do not confirm entry arrangements. Completion requires the latest quote to be approved and does not close the work order; staff review and resident completion confirmation remain in the maintenance workflow. Vendors see job details and their own submissions, not internal entry notes, resident contact data or actual costs.

Administrators set a property-specific approval threshold and currency. A quote above that threshold, or without a matching policy, requires a property manager or administrator. Quotes within the threshold still require a scoped staff decision. New quotes supersede older pending quotes. Approval records the estimate; it does not authorize or execute a payment. Invoice collection is recordkeeping, not accounting reconciliation.

## Inspections and repair handoffs

Open **Inspections** (`/admin/inspections`). Administrators create reusable checklists using one `room | item` per line. Start a move-in, move-out or routine inspection for a unit, set an owner and due date, and record each condition. Each inspection retains its own template snapshot and compares matching room/item labels with the latest completed inspection selected at creation.

Attach PNG/JPEG photos to checklist items. Current and prior evidence remains downloadable with current property authorization. Completing an inspection requires all conditions and explicit review. Completion retains an immutable record and creates one task per item marked **Repair needed**, with the inspection owner and due date. Retries do not duplicate repair tasks.

A completed move-out inspection updates the turnover checklist. Open inspection repair tasks prevent staff from marking repairs finished and exclude the unit from leasing suggestions and availability drafts, including when a repair task is reopened. Complete or review those tasks, then finish the turnover checklist. Neither an inspection nor turnover readiness changes source inventory availability.

## Notification centre

Open the header bell or **Notifications** (`/admin/notifications`) for assignments, delivered task reminders, resident replies, renewal responses, vendor updates/quotes, mentions, response-target escalations, assigned inspections and document acknowledgements/expiry reminders.

Read state, snooze and category preferences belong to the current membership. Choose all active, unread or snoozed notifications; snooze for 15 minutes, one hour or one day. The centre presents recent events within 90 days and paginates in groups of 25. Document expiry events enter the centre 30 days before expiry, even when the document was uploaded earlier. Current access is checked whenever notifications are read or changed. Preferences only affect this in-app centre; tasks, deadlines, mentions and the Needs attention queue keep their underlying states.

## Resident documents

Open **Resident documents** (`/admin/resident-documents`) and choose an active resident. Create a private draft with a category, optional expiry date and acknowledgement requirement. Upload and review the file before publishing. Staff can retain leases, renewal records, guides, notices and other documents here.

Each upload creates a retained version. Uploading a replacement leaves the previously published version visible until staff explicitly publishes the new version. Residents see and download only their current published versions through **My documents** in `/resident`. An acknowledgement records that user and version; a newly published version requires a new acknowledgement. It is a receipt record, not a legal signature or proof of lease execution.

Archiving removes resident access while retaining staff history and versions. Resident access also ends with the active resident relationship. Staff downloads remain subject to current property and lead scope. Each file is limited to 2 MB and validated as PDF, PNG, JPEG or plain text. Inspection photos and vendor files have the same size limit. Files are private database records, not public assets.

## Property operations dashboard

Open **Property dashboard** (`/admin/property-insights`). Analytics-authorized staff can filter by property and creation period. Work orders and renewal proposals use the selected period; turnovers, verified availability and reply targets show current operational state.

The dashboard includes estimated versus actual maintenance costs, completion time, observed availability age, turnover tracking age, renewal responses and overdue replies. Costs remain separated by currency and include only orders with both amounts recorded. Completion and availability timing starts from observed events; older records without reliable start/end timestamps remain unknown. Turnover age measures tracking time, not vacancy duration. Accepted renewal preferences are distinguished from recorded signed renewals. Property comparison shows up to 100 accessible properties; search/select a property to narrow a larger portfolio.

## Verification

`npm run check:operations` exercises the five APIs alongside existing leasing and property operations: current access, invalid/revoked/expired vendor links, quote authority and revisions, retries, private uploads/downloads, repair handoffs, version publication, acknowledgements and notification state. `npm run check:operations-browser` drives the vendor, staff and resident journeys and checks phone/tablet/desktop widths. CI also runs build, release/restore, calendar, lease/pilot browser and container checks. Tests use disposable databases and synthetic provider data; no live messages or payments are sent.
