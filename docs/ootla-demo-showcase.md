# OotlaAI prepared demo

The local review demo is [http://127.0.0.1:7673/](http://127.0.0.1:7673/), on branch **ootla-v1-demo** in **C:/Users/user/Documents/software/ootlademo**. The live configuration remains separate at [http://localhost:7674/](http://localhost:7674/) on **ootla-v1-branch**. These are local addresses, not evidence of a public deployment.

The retained demo has been deliberately prepared. Its properties, separate units, contacts, leads, applications, tasks, viewings, documents, lease/resident relationships and maintenance requests are actual persistent PostgreSQL records. Staff can edit them through the normal application. Refreshing or restarting does not reset them.

SQLite was considered as an optional way to simulate storage. This application already depends on PostgreSQL transactions, row/advisory locks, JSONB, migrations and durable worker queues. Replacing it with SQLite would change the established architecture and concurrency behavior. The demo therefore uses its own real PostgreSQL database; external providers are simulated instead. This preserves the existing [PostgreSQL locking model](https://www.postgresql.org/docs/current/explicit-locking.html); [SQLite compatibility differences](https://www.sqlite.org/omitted.html) do not justify rewriting working services for this demo. Its database and session scope remain separate from Oodler's live configuration.

## Start or prepare

For an ordinary restart, use the [instance startup instructions](ootla-instances.md). Start the project-owned PostgreSQL cluster once from the original Ootla checkout, then run the demo in its own terminal:

~~~powershell
cd C:\Users\user\Documents\software\Ootla
npm run db:local

cd C:\Users\user\Documents\software\ootlademo
npm run dev
~~~

For a newly configured isolated demo, install its existing dependencies and apply additive migrations, then explicitly prepare the examples:

~~~powershell
cd C:\Users\user\Documents\software\ootlademo
npm ci
npm run db:migrate
npm run demo:prepare
npm run dev
~~~

The demo checkout needs its private demo configuration before these commands. Preparation verifies the demo instance marker, DEMO_MODE, actual isolated database and simulated integrations before adding records. Live/customer configuration is refused. Do not copy a live environment file into this checkout. No production configuration needs changing for this demo.

Preparation is not part of application startup. Successful repeated preparation preserves existing accounts, passwords, staff edits, completed tasks, deliberate disconnects, import decisions and history. It does not replenish records that staff has deliberately changed or safely undone. A partial import needing review remains pending for staff; it is not silently merged or reset. The reset command is not required for this walkthrough.

## Normal sign-in and identities

Open [staff sign-in](http://127.0.0.1:7673/admin/login), choose **Fill demo credentials**, then press **Sign in**. Filling fields does not authenticate. Passwords stay masked, and normal hashed-password/database-session authentication applies.

The following are public synthetic demo defaults, not customer credentials. Existing changed passwords are preserved; the staff and showcase-resident defaults use the configured demo staff password if the operator has changed it.

| Identity | Initial demo password | Route and authorized workspace |
| --- | --- | --- |
| admin@demo.ootla.test | OotlaDemo!2026 | /admin/login — main Ootla Demo, now populated across CRM modules |
| applications@demo.ootla.test | OotlaDemo!2026 | /admin/login — separate Ootla Applicant Demo staff |
| residentstaff@demo.ootla.test | OotlaDemo!2026 | /admin/login — separate Ootla Resident Demo staff |
| standalone@demo.ootla.test | OotlaDemo!2026 | /admin/login — separate Ootla Standalone Demo with reconciled imports |
| applicant@demo.ootla.test | OotlaApplicant!2026 | /applicant/login — existing separate applicant demonstration |
| resident@demo.ootla.test | OotlaResident!2026 | /resident/login — existing separate resident demonstration |
| showcase.applicant@demo.ootla.test | OotlaApplicant!2026 | /applicant/login — Ethan Lewis's application in the main Ootla Demo |
| showcase.resident@demo.ootla.test | OotlaDemo!2026 | /resident/login — Alex Taylor's home and maintenance request in the main Ootla Demo |

For standalone staff, use **Fill standalone demo credentials** and then normal Sign in. To choose another staff account, fill the default fields, replace the email and submit normally. Applicant/resident fill buttons fill their original portal accounts. To use either showcase identity, replace the email and enter the matching password from this table, then sign in normally. There is no portal impersonation or authentication bypass.

Staff, applicant and resident sessions use separate cookies. Separate browser profiles/private windows also help compare different staff organizations. The original administrator cannot access the other demonstration organizations, and portal identities cannot open the staff workspace.

## Main administrator review

Use admin@demo.ootla.test. The original Maya Chen, Jordan Ellis and Priya Shah records are retained, alongside the added showcase records. Current counts and dates reflect saved data and subsequent staff actions; this guide does not promise that untouched default totals remain forever.

| Page | What to review |
| --- | --- |
| [/admin](http://127.0.0.1:7673/admin) | Three follow-up cards from actual actionable tasks, with the longer queue on Tasks |
| [/admin/properties](http://127.0.0.1:7673/admin/properties) | Cedar House, Grove Lofts and separate units, availability source, staff and related leads; server-side search/pagination |
| [/admin/leads](http://127.0.0.1:7673/admin/leads) | Leasing stages, Riley's sales opportunity, ownership, preferences and next actions; open a lead to add a note/call/task |
| [/admin/tasks](http://127.0.0.1:7673/admin/tasks) | Assigned, unassigned, overdue and completed work; complete an open task, refresh and inspect history/reminder cancellation |
| [/admin/applications](http://127.0.0.1:7673/admin/applications) | Draft, submitted and staff-review applications, private example files, applicant progress and permitted staff actions |
| [/admin/maintenance](http://127.0.0.1:7673/admin/maintenance) | Alex's bathroom-fan request awaiting assignment; requested access is not an appointment |
| [/admin/conversations](http://127.0.0.1:7673/admin/conversations) | Published Harbor View channel, saved inquiries and a staff-handoff example; internal notes remain staff-only |
| [/admin/automations](http://127.0.0.1:7673/admin/automations) | In-app reminder rules and discovered work requiring staff approval; inspect eligibility before approving |
| [/admin/ai](http://127.0.0.1:7673/admin/ai) | Scoped property assistance and approved knowledge; Ask Ootla also has a saved private task-priority conversation |
| [/admin/reports](http://127.0.0.1:7673/admin/reports) | Reporting from actual saved CRM data; period/property filters change the authorized dataset |
| [/admin/analytics](http://127.0.0.1:7673/admin/analytics) | Preselected illustrative GA4-style reports, explicitly synthetic and separate from CRM outcomes |

Edit a lead's next action or complete a task, then refresh. Both changes persist. Running preparation again preserves that work rather than restoring a screenshot fixture. Follow the normal application controls for stage changes: dragging a card does not independently establish a verified lease milestone.

## Application, consent, screening, payment and lease

For a connected main-workspace demonstration, keep the main administrator signed in as staff and sign in as showcase.applicant@demo.ootla.test in the applicant portal. That applicant owns Ethan Lewis's application only. The original applicant@demo.ootla.test remains available for a separate draft save/resume/upload walkthrough with applications@demo.ootla.test as its staff administrator.

1. In staff Applications, open Ethan's submitted example. Read its contact, checklist, private synthetic documents and activity. Staff preview is read-only; it cannot record consent or submit as the applicant.
2. In Ethan's actual applicant session, inspect next steps. Record separate purpose-specific screening consent deliberately if testing screening. Preparation does not accept it on the applicant's behalf.
3. Back in staff Applications, request the synthetic screening for that participant. Use the local processing controls to progress its provider states. A temporary failure follows its bounded retry policy. Review the report and record a staff decision with a reason. AI never approves or rejects applicants, and screening status does not automatically approve an application.
4. In the applicant payment panel, deliberately open the local provider handoff. It opens /payment-demo using a short-lived session-bound fragment token. No payment details are requested and no money moves.
5. Use the synthetic provider confirmation control, return to the application, then explicitly verify provider status. Until that permitted-source read succeeds, Ootla must not report a verified payment. A return URL or query parameter cannot mark it paid. Staff verification becomes available after the applicant has created the handoff/reference; it is not an unrestricted staff payment action.
6. To test lease preparation, open Ben's existing draft and inspect its recorded synthetic staff approval and lease dates. For a new workflow on another appropriate submitted application, record the required staff approval first, review dates and the configured milestone, then create the workflow. Existing evidence or overlapping leases may require a different synthetic unit/date.
7. Advance in order: Lease preparation → Signature requested → Partially signed → Fully signed → Move-in scheduled → Completed. For this sandbox choose **Example event** evidence (the server stores demo_event), supply a clear synthetic reference, and explicitly confirm each action. This simulates evidence; it does not sign for anyone or call an electronic-signature vendor.
8. Record the agreed move-in time in the property's timezone. Leased is synchronized only at the configured valid milestone, with saved evidence. Move-in tasks and the canonical contact/application/lease/resident relationships remain connected.

For draft save/resume, use the original applicant demonstration or issue a deliberate invitation for an appropriate new synthetic applicant. Upload only permitted small invented files, save details, record application consent separately, refresh/resume and submit when the checklist is ready. Private downloads still require the correct current authorization. No invitation emails are sent; use the private invitation URL locally when testing invitations.

The applicant payment simulator is separate from the resident's existing-provider payment panel. The resident panel can truthfully remain not configured until an approved destination exists. No invented external payment destination has been added to disguise that state.

## Calendar and public booking

Open [Calendar](http://127.0.0.1:7673/admin/calendar) as the main administrator. Noah has a scheduled viewing and an earlier example shows a completed viewing. Day/week/agenda views read actual native bookings; mobile uses the agenda.

Open a lead, select Schedule viewing, choose an available future slot at a configured property and confirm. Verify the saved viewing and lead history; then reschedule, cancel or record the outcome. Property timezone, duration, staff availability and buffers apply. A conflicting/concurrent booking is refused. Availability suggestions or requested access never imply a confirmed appointment.

Google Calendar remains in demo mode. Native scheduling works without Google authorization, and notifications are simulated. No real calendar event or attendee invitation is created by ordinary demo actions.

## Standalone import reconciliation

Sign in as standalone@demo.ootla.test and open [Imports](http://127.0.0.1:7673/admin/imports). The stable source **ootla-showcase-v1** has four prepared batches in dependency order: properties, units, contacts, leads. The small files in [demo-data/imports](../demo-data/imports) match the prepared CSV content. Git preserves their exact CSV bytes across operating systems so the same upload retains its content identity.

There are two imported properties, two separate units, two valid contacts and two leads. The contact batch's **source row 4** has an intentionally invalid email and remains invalid; it does not create a person. Open reconciliation, inspect source row numbers/batch identifiers, download the safe error report and follow record links into the same CRM modules. Imported availability is identified as imported/unverified until staff verifies it.

To test upload manually, use the same source name and files. The exact same entity/content is recognized as the existing batch. A new source/content goes through Upload → Map fields → Validate → Review duplicates → Confirm import → Reconcile results. Matching names do not merge people; ambiguous contacts require an explicit review. Preparation leaves such work pending rather than choosing an identity automatically.

Safe undo is deliberate and only removes eligible untouched batch-created records. Dependent or subsequently edited records are retained with an explanation. Use a separate small test batch for undo; preparation does not undo imports or recreate a batch that staff intentionally undid.

## Change the synthetic Yardi provider

As the main administrator, open [Integrations](http://127.0.0.1:7673/admin/integrations).

1. Inspect the simulator connection and its completed initial sync, mappings and event receipts. If preparation just queued the first sync, leave the normal app running and refresh status.
2. Under Try a simulator scenario, select Availability update, choose Reserved, then Queue simulated change. This changes a separate synthetic provider record first.
3. Choose Run incremental sync. Refresh status and inspect Sync jobs or Open mapped records. The mapped unit at **Simulator Cedar Court**, external ID **SIM-UNIT-101**, should reflect the provider change after the job applies it.
4. Try Contact update or Repeated event. The canonical mapping/receipt pathway applies changes and prevents duplicate records.
5. Try Temporary provider failure, then sync. Review the degraded state, error and bounded retry time rather than expecting immediate success. Older event / conflict example is held for explicit administrator review; inspect the related record before choosing a resolution.

These provider records use actual durable connector jobs, cursors, mappings and conflict handling. They are not a live Yardi connection or evidence of certification, accounting access or universal write permission. Native Cedar House/Grove Lofts records remain separate from the connector's simulator-owned property.

## AI and reminders; Voice hidden for now

Voice is hidden from ordinary navigation for now. Its protected legacy simulator retains the completed synthetic session and local conversation practice for later review. Start conversation practice with the published Harbor View property, choose a scenario and enter a sample customer message. Try an unavailable slot, failure or staff handoff; no telephone call, audio recording, phone-number purchase or live transfer occurs. Viewing confirmation uses the normal native slot/booking workflow. Private applicant guidance requires an actual authorized applicant session for that property; a caller name or staff checkbox is not proof of identity. Transcript retention is seven days by the initial demo policy and can be changed by the authorized owner.

AI inference is scripted in this isolated deployment. Native priorities, property facts, document/checklist state and reporting still read authorized saved records. Missing facts lead to a useful staff handoff, not invented availability, approval or payment success. Proposed follow-up tasks require explicit confirmation and a successful save before the application claims creation. No live OpenAI request or paid inference is enabled.

The prepared automation rules use staff in-app work and require explicit approval. Review the source condition, approve deliberately and inspect the resulting saved task. Existing pauses, edited rules, consent, permissions, quiet hours and duplicate prevention still apply. Email/SMS delivery, real calls and real Google invitations remain unavailable; an unsupported live action is not silently simulated as a successful real action.

## Moving the demo elsewhere

A Git push transfers application code, migrations and safe example CSV files. It does **not** transfer the private PostgreSQL database, environment files, sessions or uploaded document bytes. A newly deployed isolated demo needs its own private configuration, additive migrations and an explicit npm run demo:prepare before it has these examples. Starting the web service alone never seeds or resets data.

To preserve the exact review state instead of creating initial examples, use the documented private backup/restore procedure into a verified isolated demo database. Keep customer and demo databases, roles, cookies and origins separate. Hosted startup and Apache details are in the [instance guide](ootla-instances.md) and [Apache guide](ootla-apache-demo.md). No real emails to Oodler/live users or external provider activation is authorized by demo preparation or Git publishing.

## Reviewed Leads layout - 2026-10-28

Open [Leads](http://127.0.0.1:7673/admin/leads). Use the single search for contact details, property, owner, unit or stage. Filters stay behind the Filters button; selected criteria appear as removable chips. List/Board, sorting and page size remain available, and all search/pagination runs against authorized saved records rather than a live provider query.

Open a lead for one contact/property/stage/owner/next-action summary. Activity is the initial view; Tasks, Documents and Details are separate tabs. Add note, Log call and Schedule viewing are direct actions. Edit details opens the contact and opportunity forms in place, with explicit separate saves; existing source-owned fields stay read-only. The underlying contact identity and history are unchanged. AI suggestions opens the example-only AI/property-matching panel and closes with Escape, returning focus to its button. No repeated unified-contact page is required for routine lead editing.

For review, search Demo Administrator or Cedar, apply and remove a stage filter, switch List/Board, then open a lead. Use arrow keys across the four tabs, test AI open/Escape, edit a next action and refresh, or save a private note. Saved review changes are normal persistent demo edits; preparation never resets them. The cleanup needs no migration, new dependency or configuration change. The separate live project has not been changed.

## Simplified navigation - 2026-10-28

The real sidebar now contains Tasks, Reports, Maintenance, AI assistant, Conversations and Settings. Leads remains once in the top navigation alongside Overview, Properties, Applications and Calendar. Voice has no ordinary menu or owner-preview shortcut; its protected legacy URL and data remain intact.

Open [Settings](http://127.0.0.1:7673/admin/settings) to switch between Personal, Organization, Integrations and Automations. Sections follow existing role permissions: Organization/Integrations are organization-admin only; Automations requires existing leasing-management permission. Settings is highlighted on its related pages, including imports, audit and integration health. Existing URLs and saved forms still work. Open [Reports](http://127.0.0.1:7673/admin/reports) to switch between CRM reports and Website analytics, with source distinctions preserved.

Review those tabs on desktop/mobile and use browser Back, then open a lead to confirm its previously approved simple layout remains. No migration, data reset or new dependency is required. The live checkout has not received this review change.

## Client presentation review - 2026-10-29

Open /admin/leads for one search/Filters and three Lead tabs. AI suggestions proposes record-aware next steps and asks for confirmation; Book a viewing continues into the actual Calendar booking form. Edit details keeps household/preferences/milestones out of the main timeline. Open /admin/tasks?view=team for search, compact filters, descriptions and row controls; open a task for its saved description/history and suggested actions. Complete/Cancel/Reopen and reassignment prompt before saving. Suggested completion requires a comment; manual completion accepts an optional comment. Email actions create private drafts for review and never send.

Known fixture display names/history labels use ordinary business wording. Raw source provenance, account login emails, private file contents and protected diagnostics remain unchanged; these are not evidence of live external services. Optional deliberate task-description preparation is npm run demo:polish-tasks; it changes only exact unchanged shipped descriptions and is not a startup hook. Normal npm run dev continues using the isolated PostgreSQL demo. No new migration is needed.

## Current pipeline and real summary counts - 2026-10-29

The user's latest correction replaces the earlier forced-zero pilot presentation. The retained demo now uses PREVIEW_ZERO_SUMMARY_CARDS=false; page cards read the actual authorized records. Keep genuine empty statuses at zero and preserve the different documented Overview/Reports definitions. No customer/provider success is invented to fill a card.

The existing showcase is supplemented by demo.current-pipeline.v1: Nina Mensah, Oliver Grant and Camila Reed, each with a canonical contact, property interest, stated preferences, assigned owner and descriptive follow-up task. Oliver and Camila have actual future internal viewing bookings created through the existing Calendar availability/conflict/timeline path. They reuse Cedar House and Grove Lofts. Inspect them in /admin/leads, /admin/tasks and /admin/calendar. The saved preparation receipt contains their exact canonical links.

From the isolated ootlademo checkout, npm run demo:current-pipeline deliberately prepares these records once. It is not run on startup, does not reset or redate existing work, and returns zero changes after successful preparation even if staff later edit or complete its records. First-preparation dates use the actual clock; this retained preparation booked both viewings on 2026-10-30. Do not repeatedly move old appointments to make a demo look current. Existing base/renewal/standalone-import examples remain separate and unchanged. Simulation/isolation guards prevent this command from acting on a production or mixed customer database; no email, SMS, phone call or Google invitation is sent.

## Contextual lead-task follow-ups - 2026-10-30

Amara Okafor, Lucas Bennett and Elena Rivera are now real leasing agents in this isolated organization's normal assignment fields. Open Maya Chen's Tasks tab and Open task for contextual email/Calendar actions, editable saved drafts, private comments and confirmed completion. Email processing is confined to the existing local preview transport; it makes no external delivery claim. See [Lead follow-ups](ootla-lead-followups.md) for the exact route, preparation command and verification.

## Lead editor and Calendar handoff - 2026-10-30

All Leads defaults to10rows, with adjustable Rows per page. Edit details now shows preference-based property matches and stops at staff notes. Schedule viewing opens the real calendar grid for that lead; select a date, eligible staff/time and Yes/No for email. Current email is isolated preview processing only. See [Lead editing and Calendar](ootla-lead-editing-calendar.md). The preceding task follow-up and three-agent feature remains available.
