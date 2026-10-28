# Current live/demo review setup

See [the two-instance guide](docs/ootla-instances.md) for the current ootla-v1-branch and ootla-v1-demo checkouts, startup commands, separate databases and access URLs. The live branch selects .env.live; the demo branch retains masked demo credential filling. Older stage commands below are historical and must not override the selected instance configuration. The populated review portfolio, accounts and module walkthrough are in the [demo showcase guide](docs/ootla-demo-showcase.md). Run `npm run demo:prepare` deliberately from the isolated demo checkout after normal installation/migrations; it is additive and repeatable, never a startup reset. Source publication does not transfer the private database.

# Ootla

OotlaAI is the application under the Ootla brand: a sales, leads and leasing CRM in the existing Vite/vanilla TypeScript + Express + PostgreSQL project. The authorized final Stages26-28 batch is COMPLETE: operational administration, connected acceptance/fixes and local deployment/recovery preparation are verified. Read the [final handover](docs/ootla-final-handover.md), [demo walkthrough](docs/ootla-demo-walkthrough.md) and [live activation register](docs/ootla-live-activation-checklist.md) for current scope, accounts, exact routes and limits. The [Apache deployment/recovery guide](docs/ootla-apache-demo.md) prepares the isolated Ubuntu/Debian demo. No remote deployment, DNS change or live service activation occurred. Earlier stage reports below remain historical; their old stop instructions and setup-only page descriptions are superseded by this authorized final batch. STOP after Stage28.

The resolved Windows Documents directory is `C:/Users/user/Documents`. The project is `C:/Users/user/Documents/software/Ootla` (the requested `Documents/software/ootla` on this case-insensitive Windows filesystem). Ootla is independent of LoomAgency and every other application.



## Stage 12 - client Yardi readiness

No authorized client interface documentation, sample payloads, authentication instructions, credentials or pilot property scope are available. Stage 12 implements the unavailable-input branch: safe interfaces, configuration/mapping validation, explicit unsupported states and a pilot plan. It does not invent or activate a live transport.

Open <http://127.0.0.1:7673/admin/integrations?view=yardi> after normal demo sign-in. The **Yardi setup** tab separates **Scaffolding implemented**, **Mapping tested**, **Credentials configured** and **Live behavior verified**. Current evidence is **Yes / No / No / No**. Simulator tests and an encryption key do not count as client mapping or live-credential verification.

Review the seven ownership domains and required client inputs. **Check draft readiness** validates the neutral planning fields without saving them, accepting secrets, contacting Yardi or changing the readiness evidence. An empty draft shows what is missing; requesting resident/payment status clearly reports Unsupported. The original Connection/simulator tabs remain available at <http://127.0.0.1:7673/admin/integrations>.

Read the [Yardi readiness and field ownership](docs/ootla-yardi-readiness.md) and [pilot activation checklist](docs/ootla-yardi-pilot-checklist.md). Remaining inputs include the exact licensed interface/docs, documented authentication and issued server credentials, pilot property IDs/permissions, approved representative payloads/mappings and a provider-approved test/reconciliation/rollback plan.

No migration, installation or environment change is needed. Use the existing preview; if stopped run `npm.cmd run db:local`, then `npm.cmd run dev` from the independent Ootla root. Focused commands are `npm.cmd run check:yardi`, `npm.cmd run check:yardi-browser`, `npm.cmd run check:yardi-browser:preview` and `npm.cmd run build`. The first two own guarded scratch environments; the preview check reads retained business records only.

All 11 backend, six isolated browser and four retained read-only groups passed. Both TypeScript projects, the 154-module client/server build and compiled security/preservation smoke passed; 48 prior business-table fingerprints and ten checksums are unchanged. On a low-memory host, the verified build used a session-only PowerShell setting: set $env:RAYON_NUM_THREADS = '1', then run npm.cmd run build. No project environment file changed.

Stage 12 is complete and stops for review. No real provider request, universal write permission, accounting change, payment action, production deployment or later stage is authorized.

## Stage 11 - connectors and functional Yardi simulator

Open <http://127.0.0.1:7673/admin/login>, use **Fill demo credentials**, then normal **Sign in**. The organization-admin Integrations workspace is <http://127.0.0.1:7673/admin/integrations>. Staff without that role see a useful restricted state; server diagnostics/controls are denied.

To observe an actual simulated provider change:

1. Choose **Connect Yardi simulator**, then **Refresh status** after the background worker runs (normally within about two seconds). Initial sync creates a separately mapped **Simulator Cedar Court** property, separate **101** unit, **Taylor Brooks** contact and guest-card lead. The source starts at Connecting and becomes Demo only after sync.
2. Choose **Availability update**, select **Reserved**, then **Queue simulated change**. This changes the separate provider dataset only. Click **Run incremental sync**, then **Refresh status**. Open **Record mappings** and its Unit link: unit 101 should now be Reserved in the real Properties workspace. Its source remains Demo and live availability is not verified.
3. Repeat with **Contact update**, run sync and open the Contact mapping to see the saved phone update without a duplicate identity.
4. Queue **Temporary provider failure**, then run sync. Check **Sync jobs** for Degraded/retry timing. Automatic retry respects the real 30-second first backoff (60 seconds after a second failure), with at most three attempts. Refresh status after the due time. A terminal failure retains its history and offers a deliberate retry through a new job.
5. Queue **Repeated event** or use **Replay safely**, run/refresh and inspect Event history. Previously applied identities/mappings remain stable.
6. Queue **Older event / conflict example**, run sync and open Conflicts. Review the related record, choose **Keep current record; skip this incoming event** and save the decision. The newer availability remains intact. Disconnect retains CRM data/history; reconnect resumes from the saved cursor.

Dedicated views are `/admin/integrations?view=jobs`, `?view=mappings`, `?view=events` and `?view=conflicts`. Page-size controls and native Next/Previous links operate server-side. Refresh/navigation never connect, seed or create jobs. **Open customer-data import** retains the independent standalone CSV workflow at `/admin/imports`.

This is a synthetic provider using real database-backed connector jobs, event receipts, mappings and conflicts. It sends no external requests. Live Yardi remains unconfigured pending the client's licensed interfaces, permissions and configuration; no certification is claimed. Original portfolio/users/organization modes are preserved. Deliberate simulator setup adds only its own labeled CRM records.

Migration `010_connectors.sql` is additive. Existing configured checkouts run:

~~~powershell
npm.cmd run db:migrate
~~~

No installation or actual .env change is needed for the simulator. The existing preview runs at the URL above; if stopped, run `npm.cmd run db:local`, then `npm.cmd run dev` from the Ootla root. The server starts/stops the bounded connector worker. Optional `npm.cmd run connectors:process` runs one pass.

Credential storage is server-only encrypted AES-256-GCM. The simulator requires no credentials. An optional separate `CONNECTOR_CREDENTIAL_KEY` (canonical base64 random 32 bytes, documented blank in .env.example) enables the guarded server credential store; no input/readback of invented live Yardi configuration is added to the public/admin UI.

Focused commands are `npm.cmd run check:connectors`, `npm.cmd run check:connectors-browser`, `npm.cmd run check:connectors-browser:preview` and `npm.cmd run build`. Backend and default browser writes use verified uniquely owned scratch databases and remove only their own resources. The preview command uses retained business records read-only apart from ordinary authentication sessions/audits. All 16 backend groups, 11 final default isolated browser groups, four retained read-only groups, the 154-module build and compiled preservation/security smoke passed. Migration 010 is already applied locally, with all 39 prior business-table fingerprints and ten checksums preserved. Retained simulator tables are empty until deliberate connection. Final details are in the [progress log](docs/ootla-progress.md).

STOP after Stage 11 for user review; no later stage is authorized.

## Profile dropdown and personal settings

After normal sign-in at <http://127.0.0.1:7673/admin/login>, open the top-right avatar for **View profile**, **Edit profile**, **Settings** or **Sign out**.

- Profile: <http://127.0.0.1:7673/admin/profile>
- Edit display name, optional phone/job title: <http://127.0.0.1:7673/admin/profile?edit=1>
- Personal settings/security: <http://127.0.0.1:7673/admin/settings>

Save a start page, default Leads list/board view or reduced motion, then refresh or sign out/in to review persistence. Explicit deep links and selected Leads views take priority over defaults. Email, current organization and role are read-only. Individual staff accounts can change passwords with their current password; all their sessions then sign out. Both shared demo passwords stay fixed, with a notice on Settings. Intentional profile/settings edits are real database writes.

Additive migration `009_staff_account.sql` is already applied locally. Other existing configured checkouts run `npm.cmd run db:migrate`. No installation or environment change is required. Use the running preview; if stopped run `npm.cmd run db:local`, then `npm.cmd run dev` from this project directory.

Focused checks: `npm.cmd run check:account` (12 backend groups), `npm.cmd run check:account-browser` (eight owned write-browser groups), `npm.cmd run check:account-browser:preview` (four retained record-read-only groups), `npm.cmd run check:login-origin` (five groups) and `npm.cmd run build` (151-module client plus server). All passed. The first two checks clean up uniquely owned scratch databases; no retained profile/settings or CRM records were changed by verification. See the [progress log](docs/ootla-progress.md). STOP for review; no later numbered stage is authorized.

## Stage 10 standalone onboarding and CSV imports - completed, awaiting review

Open <http://127.0.0.1:7673/admin/login>, click **Fill standalone demo credentials**, then normal **Sign in**. The separate empty **Ootla Standalone Demo** organization uses `standalone@demo.ootla.test` / `OotlaDemo!2026`. Its organization-admin membership grants access only within that organization. The original **Fill demo credentials** account and its three-property/six-unit review dataset are preserved. Demo fill and demo sign-in require server-side `DEMO_MODE` and the isolated demo environment; there is no login bypass.

- Import onboarding and saved batches: <http://127.0.0.1:7673/admin/imports>
- New upload: <http://127.0.0.1:7673/admin/imports?view=new>
- Integrations entry: <http://127.0.0.1:7673/admin/integrations> → **Open customer-data import**
- Reconciled records: <http://127.0.0.1:7673/admin/properties>, <http://127.0.0.1:7673/admin/contacts> and <http://127.0.0.1:7673/admin/leads>

The flow is **Upload → Map fields → Validate → Review duplicates → Confirm import → Reconcile results**. Upload saves a review batch; only deliberate confirmation queues CRM creation. Download the four invented sample CSVs on the import page. Use one stable **Source name** across all four files, then import and reconcile **properties, units, contacts and leads**, in that order. Map each required field to its header. Source IDs connect files; a property is never reinterpreted as a unit. Each saved batch retains its UUID, original physical CSV row numbers, decisions, outcomes and links to canonical CRM records.

CSV must be UTF-8 with a header, at most **5 MiB, 10,000 data rows and 100 columns**. Export XLSX spreadsheets as CSV UTF-8; no workbook dependency or XLSX upload is added. Imports and row/undo previews are server-paginated, 25 by default and 100 maximum. Confirmed rows process in durable chunks of at most 100, on the approximately two-second import-worker tick. You may leave and reopen the saved batch. Actual database failures use at most three attempts with bounded backoff; deliberate retry preserves completed row identities.

Review invalid rows before confirmation; they remain visible and are not imported. **Export safe error report** downloads batch ID, source row, status and diagnostic only, without copying raw contact cells. Cells are quoted and formula-safe. Corrected data needs a corrected file and a new review batch. Re-uploading the same bytes under the same source/type returns the saved batch. A different file using an already-mapped source ID reuses its record and preserves existing values; this is an import, not an overwrite/update sync.

Possible contacts require a deliberate **Create a separate contact**, **Link to a reviewed existing contact**, or **Skip** decision. A name alone cannot establish identity. Linking requires matching email or phone evidence plus staff review and does not overwrite the existing person's details or history. Imported leasing/sales leads begin at New inquiry; normal CRM evidence rules govern later stages. Imported unit availability displays import provenance and remains unverified until an authorized verification occurs.

On results, **Preview safe undo** explains each eligible/remain decision. Confirm removes only untouched, unused records created by that batch; reused identities, subsequent staff edits and related work remain. Even an edit later reverted, or a related record created then removed, makes undo conservative. Keep batch/audit lineage. When demonstrating undo across related files, begin with the lead batch; upstream records used by later batches can remain retained for safety. The separate demo starts empty; sample downloads do not import themselves. Intentional form submissions are real local database changes.

Migration `008_standalone_imports.sql` is already applied here once. The separate demo was prepared deliberately; no seed, reset or import runs at startup. For another configured isolated demo checkout:

~~~powershell
npm.cmd run db:migrate
npm.cmd run demo:standalone
~~~

`demo:standalone` is repeatable and preserves existing users/passwords/settings and all existing CRM records. It refuses production/customer/mixed databases. No new installation or environment change is needed. Use the existing preview; if stopped, run `npm.cmd run db:local`, then `npm.cmd run dev` from the project root. The backend starts/stops the import worker with its database pool. An optional `npm.cmd run imports:process` performs one bounded pass; no external service or message is involved.

Focused verification:

~~~powershell
npm.cmd run check:imports
npm.cmd run check:imports-browser
npm.cmd run check:imports-browser:preview
npm.cmd run build
~~~

The backend and isolated browser commands own guarded unique scratch databases and clean up only their own resources. The preview command uses retained records read-only apart from normal authentication sessions/audits. All 15 final backend groups, nine isolated write-browser groups, three bounded restriction-state UI cases and three retained record-read-only browser groups passed. The final 147-module client/server build, owned compiled-server security smoke, all eight migration checksums, 109 protected source hashes and original-column/count/fingerprint preservation in all 35 prior business tables passed. Only the explicit separate demo organization/settings/hashed user/membership were added; it still has zero properties, units, contacts, leads or import rows/batches. Current preview/API health is ready and no outstanding failures remain. A final rendering-only correction removes links to undone/deleted CRM rows; three focused render cases and the final post-correction 147-module client/server build passed. Prior focused suites/security/preservation remain valid and were not broadly repeated. See the [progress log](docs/ootla-progress.md) for final results. No live AI, Yardi, calendar, screening, payment, external communication or production deployment is enabled. Successful implementation/checks are not user approval. STOP after Stage 10 and await review.
## Demo login address

Open <http://127.0.0.1:7673/admin/login>, exactly as configured by the running API. localhost, a different port or an old preview URL is a different browser origin. Those login pages now show **Open Ootla sign in** before allowing credentials; follow that link. The server's origin protection stays strict.

If you edit APP_URL, restart both API and frontend using npm.cmd run dev from this directory. Keep the hostname and port consistent; do not change environment values just to match old notes. No migration, reseed or password reset is needed. Focused verification: npm.cmd run check:login-origin.

## Stage 09 tasks and in-app reminders - historical completed scope


Open <http://127.0.0.1:7673/admin/login>, use **Fill demo credentials**, then normal **Sign in**:

- My tasks: <http://127.0.0.1:7673/admin/tasks>
- Team tasks: <http://127.0.0.1:7673/admin/tasks?view=team>
- Unassigned work: <http://127.0.0.1:7673/admin/tasks?view=unassigned>
- In-app reminders: <http://127.0.0.1:7673/admin/tasks?view=reminders>
- Property/team routing, organization admin only: <http://127.0.0.1:7673/admin/tasks?view=routing>
- Create a task: <http://127.0.0.1:7673/admin/tasks?view=new>
- Preserved Overview: <http://127.0.0.1:7673/admin>

The original three synthetic tasks remain unassigned. An initially empty My tasks view is accurate; use Team tasks or Unassigned to review them. Open a saved task link for its detail, related record, editable owner/due/priority/status, origin and paginated actor/time history. Property is required for authorization; lead, canonical contact, application and tour relationships are optional and validated together. Task detail shows the exact linked application/tour UUID and saved status, plus recorded tour time where present. Related links open its canonical lead/contact history. Completing a task does not decide an application or book a tour; full applicant/calendar workflows remain outside this stage.

Manual review: create or deliberately edit a task, choose an accessible property and eligible owner, set a due date and priority, save and refresh. Check My tasks/Team tasks, overdue filtering, completion and history. A task assigned to you with a past due time should produce one in-app reminder on the next worker tick (approximately 30 seconds). Refreshing must not create duplicates. Snooze for 15 minutes, 1 hour or 1 day, then complete the task and confirm its reminder disappears. Snoozes are limited to three within seven days of first delivery.

For routing, save an enabled property rule using All eligible property staff, or create/select a team to narrow the pool. Select routing explicitly when creating a task or request re-evaluation when editing; normal refresh/unrelated edits do not redistribute work. The backend chooses an eligible agent with the least open work. Without an enabled rule or eligible staff, work stays visibly unassigned; an enabled rule with no selected team uses all eligible property staff. A selected empty/ineligible team leaves work unassigned. Team membership never grants property access. Task reads and writes require current leasing permission, assigned property and every linked lead interest; analysts and portal identities have no private-task access.

These are real persistent local actions and real in-app notices. Existing demo records remain synthetic; contextual AI and external integrations remain simulation/unconfigured. No email/SMS/calendar invitation, provider action, applicant decision, payment or deployment is enabled. To avoid changing retained review records, use the isolated write-browser check instead of submitting review forms.

Routing selection remains correct beyond the first 100 choices: the selected property's exact rule is fetched separately and an existing team outside the bounded choices retains its exact saved selection. Three focused loader/native-browser cases passed without API/database writes; the prior 14 backend, eight isolated browser and four retained browser groups preceded this UI-only correction and were not repeated. A bounded retained Overview follow-up also verified all three card IDs/titles/links match actual actionable task API records and the header inbox link works; customer records were read-only, apart from normal authentication sessions/audits. The final post-correction rebuild passed both TypeScript projects, the 144-module Vite client and compiled server without warnings.

Additive migration 007 is already applied exactly once to the retained isolated demo, without reset or reseed. There is no startup seed/reset. Other existing configured checkouts apply pending migrations with:

~~~powershell
npm.cmd run db:migrate
~~~

Use the retained preview. If stopped, run npm.cmd run db:local, then npm.cmd run dev. The backend starts its bounded in-app worker automatically and stops it before closing PostgreSQL. No dependency installation, environment/password change or separate scheduler is needed. An optional deliberate single worker pass is npm.cmd run reminders:process; it processes in-app reminders and does not send external messages.

Focused checks:

~~~powershell
npm.cmd run check:tasks
npm.cmd run check:tasks-browser
npm.cmd run check:tasks-browser:preview
npm.cmd run build
~~~

All 14 backend groups passed in a uniquely owned scratch database, which was removed. Coverage includes additive preservation/seed compatibility, normal cookie roles/tenant/property/all-interest permissions, five typed links, owner/version/history, server paging/overdue dates, concurrent routing/unassigned handling, pure bounded Overview reads, reminder deduplication, actual injected delivery failure with bounded retry, snooze limits, completion/irrelevance/concurrency cancellation, shared lead-workspace lifecycle and fresh backend/pool persistence. The isolated browser command owns a guarded scratch database and temporary loopback servers; the preview command performs record-read-only checks plus ordinary authentication sessions/audits. All eight isolated write-browser groups and four retained record-read-only groups passed, including normal authentication, task persistence/assignment/routing/completion/reminder cancellation, labels/keyboard and 320/390/768/1586px layouts. Owned scratch resources were removed. All original columns/counts/aggregate fingerprints in 29 prior tables and seven migration checksums match; original three tasks remain unassigned. Environment/example/lockfile/public sources/admin CSS are unchanged. Desktop Tasks, mobile Reminders and desktop routing were visually inspected. The final build passed both TypeScript projects, the 144-module Vite client and compiled server without warnings. A bounded owned compiled-server smoke verified anonymous task-page redirects/private API denials, public pages, unknown/private-file 404s and no actual server secrets in client assets, then stopped its own process. No outstanding failures remain; see the [progress log](docs/ootla-progress.md) for evidence. STOP after Stage 09 and await user feedback; passing checks are not approval.

## Stage 08 private lead detail - historical completed scope

Sign in at <http://127.0.0.1:7673/admin/login> using **Fill demo credentials**, then normal **Sign in**. Open the [saved Maya lead](http://127.0.0.1:7673/admin/leads?lead=38d0fff4-a4db-421b-8920-e5945099de28), or select a saved lead from <http://127.0.0.1:7673/admin/leads>. Overview's **View lead** opens the same workspace.

Contact/household, interests/preferences, agent, current stage and next action reuse the canonical Stage 06/07 records/editors. Dedicated sections add private staff notes/call logs/handoffs, real follow-up tasks, private documents, paginated combined timeline, transparent suggestions and contextual AI simulation. Native section links and collapsible forms support keyboard navigation; Overview remains four metrics and three spacious cards.

Manual review: add an internal note, log a call that happened and create a due-dated follow-up assigned to eligible staff. Refresh and inspect the actor/time in newest-first timeline. Edit/complete/reopen the task and refresh. Upload a small PDF/PNG/JPEG/plain-text document, then download and compare it. Intentional actions are real local database writes; use the isolated browser command below if preserving retained review records is preferred.

Private tools/downloads require leasing permission plus every property interest, including direct API URLs. Read-only/partially assigned staff retain basic lead facts with private legacy notes/evidence/events and private-note search matches removed server-side. Portal accounts and other organizations are denied. Files stay in PostgreSQL (2 MiB maximum), have no public asset URL and are not submitted to any provider.

The combined timeline labels synthetic communications/viewings. Logging does not dial, tasks send no reminders, and staff handoff notes do not approve/reject applicants or alter application/lease status. Verified provider updates have no browser write endpoint; live ingest awaits configuration. Requested access is never a confirmed technician appointment.

Rental suggestions explain stated budget/location/bedrooms against accessible currently available units verified within seven days. Unverified demo units correctly produce no verified matches. Requested move-in date is always unconfirmed until staff checks dated availability; future-date evidence is unconfigured. Free text is not interpreted for eligibility/protected-characteristic scoring. Sales shows an inventory/price setup state instead of rental matches. **Contextual AI simulation** produces deterministic unsent staff guidance, without live model or external actions.

Migration 006 is applied locally without reset/reseed.

Current preview uses the preserved APP_URL http://127.0.0.1:7673. The old hardcoded 5173 frontend caused an initial normal-login 403 origin denial; security correctly rejected the mismatch. The development launcher now follows the configured loopback HTTP origin with strict port checking, without changing .env, cookie/origin enforcement or production startup. Historical stage URLs retain their recorded 5173 origin; use the same paths on 7673 for current review. Other existing checkouts require only:

~~~powershell
npm.cmd run db:migrate
~~~

Use the retained preview. If stopped, run npm.cmd run db:local, then npm.cmd run dev. No install/environment/password/authentication change is needed.

~~~powershell
npm.cmd run check:lead-workspace
npm.cmd run check:lead-workspace-browser
npm.cmd run check:lead-workspace-browser:preview
npm.cmd run build
~~~

All 13 backend groups passed in an owned scratch database, which was removed. The isolated browser command guards the project-owned cluster/restricted role, creates a unique scratch database and temporary API/Vite, verifies real writes there and cleans up only those owned resources. The preview command uses the retained app for record-read-only checks plus normal login/logout session/audit writes. All eight isolated write-browser groups and four retained read-only browser groups passed after the final timeline metadata/origin fixes. Both TypeScript projects, the 141-module Vite client and compiled server passed the final build without warnings. All 85 protected source hashes, original counts/columns in 26 prior tables and six migration checksums match; retained events/documents/provider updates remain empty and the three original tasks are preserved. Compiled route/authentication/secret checks and development startup guards passed. Desktop/mobile captures were visually reviewed; see the [progress log](docs/ootla-progress.md). No deployment, paid CI, live provider or outbound action is activated. Stage 08 is complete. STOP and await user review; no later stage is authorized.

## Stage 07 leads and opportunities - historical completed scope

Use the existing <http://127.0.0.1:5173/admin/login>, **Fill demo credentials**, then normal **Sign in**:

- Leads list: <http://127.0.0.1:5173/admin/leads>
- Add lead: <http://127.0.0.1:5173/admin/leads?view=new>
- Leasing board: <http://127.0.0.1:5173/admin/leads?view=board&intent=leasing>
- Sales board: <http://127.0.0.1:5173/admin/leads?view=board&intent=sales>
- One opportunity per page: <http://127.0.0.1:5173/admin/leads?pageSize=1>

Create or edit real persisted opportunities with an eligible owner, source, up to 20 property interests, unit, preferences, notes and next-action date/time. Choose a primary property first. Owner/unit/property choices are server-searched and bounded; directory search, filters, sorting and pagination run on the backend (25 default, 100 maximum). Board columns show only the current server page, with clearly labeled totals for all matching records.

Leasing stages are **New inquiry, Contacted, Tour scheduled, Application started, Application submitted, Staff review, Lease pending, Leased, Lost/Closed**. Sales has its own **New inquiry, Contacted, Viewing scheduled, Negotiation, Offer pending, Won, Lost/Closed** stages. Native stage controls work with keyboard or pointer; the server validates the graph and required evidence, then records actor/timestamp and audit history. Concurrent edits use record versions and return a refresh conflict rather than overwriting.

Application-specific status belongs to the application record. Its saved status is synchronized transactionally to a lead summary; changing a lead stage cannot submit or approve an application. Application-related lead progression requires corresponding saved application evidence. Leased additionally requires an explicitly verified matching active local lease with a recorded start date and documentary reference. A board move cannot manufacture that milestone. Verification is currently an authorized API operation for organization admins/property managers; the lead detail displays evidence or **Not verified**. Full application/lease workflow interfaces are outside Stage 07. Provider-owned/Yardi leases cannot be locally certified; source authority remains enforced.

Duplicate suggestions match saved name/email/phone within current access, explain why they match and never merge people automatically. Explicitly choose an existing canonical contact or create a separate person. Contact identity is maintained on Contacts; primary property, contact and sales/leasing type stay fixed on the opportunity to preserve linked history. Adding an interest for an existing contact requires an explicit property association; the edit page provides that separate action. Every interest and eligible owner's access is checked on the backend.

Manual review: use Overview's **Add lead**, select a property, enter a clearly named review contact and choose an owner/source/preferences/next action. Check duplicate suggestions, create, refresh, open **Edit lead details and ownership**, save changes and refresh again. Change New inquiry to Contacted and inspect **Action history** for the real actor/time. Open each board, filter/search/page and change only an offered stage. Verify **Leased** is unavailable without evidence. Review **View all leads** and confirm Overview still has exactly four metrics and three follow-up cards. Tour scheduled records CRM progress only; it does not book a viewing or send an invitation. Applications/Leases signed metrics remain honestly unconfigured while New leads/Tours booked use real saved records. Intentional form submissions are real local writes; use the isolated browser check instead if preserving the review dataset is preferred.

Additive `005_lead_pipeline.sql` is applied to the retained demo. No reset/reseed, dependency, environment, password or session change is required. Other existing checkouts run `npm.cmd run db:migrate`. If stopped, run `npm.cmd run db:local`, then `npm.cmd run dev`; do not start duplicate review servers.

Focused commands:

~~~powershell
npm.cmd run check:leads
npm.cmd run check:lead-browser
npm.cmd run check:lead-browser:preview
npm.cmd run build
~~~

`check:leads` uses and cleans up a uniquely owned scratch database. `check:lead-browser` creates its own isolated database and temporary loopback frontend/backend, then performs real create/edit/owner/stage/browser persistence checks there; it never writes review records into the retained demo. `check:lead-browser:preview` needs the running preview and deliberately performs read-only record checks plus normal login/logout. Neither check activates providers or outbound communication.

Final checks passed: both TypeScript projects, the 137-module Vite client and compiled server; all 12 backend scratch groups; all seven isolated write-browser groups; and all four retained record-read-only browser groups. Coverage includes create/edit/owner/stage refresh persistence, separate sales identity reuse, native keyboard/reduced-motion/320-1586px layouts, actor/time contact history, application summary and immutable lease evidence, tenant/property/source/owner guards and 251-lead pagination. Owned scratch databases/temporary servers were removed.

Preservation passed for 75 protected sources/assets/authentication/environment/lockfile/prior migrations, all 18 original table counts/old-column values and all five applied migration checksums. The retained demo still has three leads/contacts/properties and six separate units; no test record was added. Only three new source/next-action metadata sets were backfilled; owners remain unassigned. Compiled route/security smoke and client-secret absence passed. Desktop list/board and mobile detail were visually reviewed. No outstanding failures remain; Stage 07 is complete and STOPs for user review, with no Stage 08.

## Stage 06 property and contact foundation - historical completed scope

Open <http://127.0.0.1:5173/admin/login>, use **Fill demo credentials** and normal **Sign in**, then review:

- <http://127.0.0.1:5173/admin/properties>
- <http://127.0.0.1:5173/admin/properties?pageSize=1>
- <http://127.0.0.1:5173/admin/contacts>
- Saved Harbor property: <http://127.0.0.1:5173/admin/properties?property=8438f12a-f61c-4332-9554-2bcae57d0886>
- Saved Maya contact: <http://127.0.0.1:5173/admin/contacts?contact=38d0fff4-a4db-421b-8920-e5945099de28>

Property links open `/admin/properties?property=<saved UUID>`; contact links open `/admin/contacts?contact=<saved UUID>`. Use real links from the lists instead of invented identifiers.

Properties and units are separate persistent entities. Property search/filter/sort and pagination run on the server: name/address/city search, city, group, type, record source and available/unverified availability; 25 properties by default, maximum 100 per page. Property detail has separately paginated units/leads, assigned staff (maximum 50 displayed, total reported), source ownership and availability evidence. Unverified legacy/demo timestamps remain null.

Contacts are canonical customer identities, with explicit property links, households/members and scoped lead/application/lease/activity history. Migration 004 gives each existing lead its own contact; shared email never automatically merges identities. Permitted staff can create/edit local properties, units and contacts, create groups/households and review saved records. There is no deletion flow. Minimal application/lease relationships and typed external mappings are API foundations, not completed application/resident/screening/payment workflows.

Backend organization/property grants, current membership, origin protection and write audits apply to the new `/api/property-foundation` routes. Organization admin remains limited to its organization. Source-owned fields are read-only, including through the legacy property PATCH API; disallowed updates return `409 SOURCE_OWNED_FIELD`. A Yardi-ready mode/mapping is not an active connection.

Additive `004_property_contact_foundation.sql` is already applied here. The retained demo currently has its original three properties, six units and three leads, plus three backfilled contacts; no bulk volume, application, lease, household or group was added to it. No reset, retained reseed, dependency/environment change or provider action is required. Other existing checkouts should run:

~~~powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\software\Ootla'
npm.cmd run db:migrate
~~~

Use the running app. If stopped, run `npm.cmd run db:local` then `npm.cmd run dev`. Focused stage commands are `npm.cmd run check:properties` and, with the review app running, `npm.cmd run check:property-browser`. Final build passed both TypeScript projects, the 38-module Vite client and compiled server. All ten backend scratch groups and all six focused browser groups passed, including 2,701 distinct scratch properties across 28 pages, 320/390/768/1586px layouts, normal login/refresh/logout, server filters/paging and the preserved overview. Browser checks deliberately made no retained form writes; create/update persistence was verified through scratch APIs. Original source and old-column data preservation, four migration checksums, compiled route/security smoke and client-secret absence passed. The owned scratch database and temporary compiled process were cleaned up.

Optional deliberate volume fixtures are separate from ordinary seed/startup. Preview without writes:

~~~powershell
npm.cmd run demo:volume -- --properties=3000 --units-per-property=2 --confirm=ootla_demo --dry-run
~~~

Removing `--dry-run` deliberately adds up to 3,000 synthetic property fixtures and 6,000 separate units only to the verified project-owned isolated local demo. It requires the exact database confirmation, loopback port 55439, restricted `ootla` role and nonproduction demo controls. Stable identifiers add only missing fixtures and preserve edits. Fixtures are labeled demo/unverified with null verification times. It never runs automatically. No retained volume generation is part of Stage 06 review.

The retained 3,000-property/6,000-unit volume dry-run passed and changed no data; actual volume fixtures were not loaded here. The initial 320px header overflow was corrected only on the new workspace routes and rechecked. No outstanding verification failures remain. Stage 06 is complete, awaiting user review. STOP; no Stage 07 or later work is authorized.

## Stage 05b public platform and integrations - historical completed scope

Review <http://127.0.0.1:5173/integrations> and <http://127.0.0.1:5173/platform>.

The integrations hero must read **Yardi-ready integration.** Seven separate sections pair text with coded illustrative previews: Yardi property/customer records, Google Calendar, Google Analytics acquisition, standalone customer/history import, applicant portal, maintenance and existing-provider payment handoff.

Yardi activation depends on the client's licensed interfaces, permissions and configuration. “Yardi-ready” does not claim certification or a live connection. The Yardi-connected/Standalone selector only changes a public illustration; it does not alter an organization, call an API or store a setting. All provider/workflow examples remain illustrative/planned.

The platform page explains Leads, Viewings, Applications and Operations with links to the existing real public workflow pages. Public typography remains lighter 500/400 in the approved green/off-white/charcoal family. The actual admin, prior homepage/workflows and normal login remain preserved.

Genuine supporting pages are live at <http://127.0.0.1:5173/contact> and <http://127.0.0.1:5173/privacy>. On 2026-10-21 the user approved `hello@ootla.ai`. `publicContact()` in `client/lib/site-information.ts` now returns that label and `mailto:hello@ootla.ai`. Clicking only opens the visitor email client. The website sends nothing: no SMTP backend, submission form or delivery-success claim. Inbox delivery/deliverability has not been tested.

Privacy describes this development preview factually: browser-memory public examples, self-hosted assets/no analytics, real eight-hour HttpOnly/SameSite staff sessions, authentication audits and synthetic PostgreSQL records. No legal entity/compliance guarantee is invented.

Final build passed both TypeScript checks, Vite client with 35 modules and compiled server. All six focused `npm.cmd run check:public-platform` groups passed, including 97 link/CTA occurrences across 20 destinations, selector/keyboard/mobile/privacy and 680 contrast samples. After a cosmetic title-punctuation fix, bounded compiled Chrome smoke passed; the full six groups were not repeated. Protected source/data preservation passed. The user-approved mailto and final build passed bounded contact-only follow-up: exact href checked without activation, responsive/focus behavior and 42 contrast samples passed. The six-group suite, 97 links/20 destinations and 680 contrast samples preceded this email update and were not repeated. No Stage 05b technical/configuration gap remains; user review is pending. No installation, migration, seed/reset, environment/dependency change, deployment or external communication is required.

Use the running preview; if the local database/app has stopped:

~~~powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\software\Ootla'
npm.cmd run db:local
npm.cmd run dev
~~~

## Stage 05a public workflows - historical completed scope

Open:

- <http://127.0.0.1:5173/ai-workflows>
- <http://127.0.0.1:5173/ai-workflows#ai-demonstrations>
- <http://127.0.0.1:5173/workflows/leasing>
- <http://127.0.0.1:5173/workflows/resident-support>

The shared public Workflows menu/footer links reach the two new detail pages. **Explore demo** and **Sign in** continue to open the real <http://127.0.0.1:5173/admin/login>, with normal masked fill and backend sign-in.

The AI page offers Resident request, Staff reminders and Prospect viewing scenarios. Each is a five-step manual browser script with **Next step**, **Replay scenario** and scenario selection. No live AI, backend request, storage, outbound communication or real record is created. Selection/replay resets the example.

The resident starts with “My bathroom fan has stopped working.” The script asks which room/access is possible, then records Thursday 14:00–16:00 as a requested preference. After three advances, displayed Step 4 of 5 shows service request DEMO-104: Awaiting assignment, Technician Unassigned, Appointment Not scheduled. The fifth displayed step adds the staff task. Requested access must never be presented as a confirmed technician appointment.

Leasing illustrates inquiry → viewing request → application → staff review; staff confirms times and decisions separately. Resident support illustrates requests/assignment, unsent updates, renewal review and an existing-provider payment handoff. No payment is charged/refunded and verified payment status remains unavailable without configuration.

Final build passed: both TypeScript checks, Vite client with 27 modules and compiled server. Seven focused groups passed, then bounded desktop/mobile focus/CTA verification passed after the final fixes without repeating the full suite. Routes, 15 scenario states, keyboard/motion, 620 contrast samples, public privacy and unchanged protected source/data passed. No failures or blockers remain. No installation, migration, seed/reset, new dependency, environment change, deployment or external communication is needed. Use the running preview; if stopped:

~~~powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\software\Ootla'
npm.cmd run db:local
npm.cmd run dev
~~~

Focused commands after integration are `npm.cmd run build` and `npm.cmd run check:public-workflows`; their outcomes and bounded-follow-up qualifications are recorded in progress.

## Stage 05 public homepage - historical completed scope

Open <http://127.0.0.1:5173/>. The headline is **Keep leads moving. Keep people informed.** Supporting copy: “Ootla brings your pipeline, AI assistance and daily property work into one clear workspace.” Stage 05 implements this requested copy, forest-green/off-white/charcoal design, public heading weight 500/body weight 400 and six alternating text-and-visual workflow sections:

1. AI support for resident replies.
2. AI reminders for staff.
3. Viewings and Google Calendar.
4. Applicant documents and staff review.
5. Yardi readiness.
6. Standalone customer-data imports.

These are clearly labeled illustrative examples and planned capabilities, not live AI/calendar/Yardi/import/upload/screening flows. **Sign in** and **Explore demo** both open the real <http://127.0.0.1:5173/admin/login>; neither bypasses normal authentication.

The hero reuses the actual coded admin shell as a full-size 1480px public preview, with approximately half visible at the far right and the rest clipped beyond the viewport. It is not scaled down or stretched. At widths of 900px or less, the full-size preview moves below the copy in normal flow inside a clipped 430px-high frame, avoiding overlap while retaining its 1480px width. Public-only invented Alex Morgan/Casey Taylor/Robin Lane fixtures supply three example leads and two example tours; applications/leases remain unconfigured. The preview is inert/hidden from assistive technology and makes no private-data API request.

The separate three-step enquiry/viewing/staff-review workflow uses native controls, click/keyboard navigation and optional intersection-based scroll changes. Reduced-motion mode removes automatic scroll changes, sticky positioning and transitions, including when the preference changes at runtime. Route cleanup disconnects observers/listeners.

The protected dashboard remains <http://127.0.0.1:5173/admin>; the existing login, admin typography, seeded records, server access controls and integrations/outbound simulation rules are preserved. No schema/migration, seed/reset, environment/dependency change, external communication or deployment is authorized.

The full build and all seven focused Chrome functional groups passed: exact copy/weights, six examples/links, normal login/unchanged admin, public privacy even with a staff cookie, full-size hero crop, keyboard/scroll/runtime motion and route cleanup. Protected source/data preservation passed. The initial mobile overlap and low-contrast public disclosures were corrected. Final build passed; targeted contrast review passed 171 text nodes at desktop/mobile widths, with minimum small-text contrast 4.58:1 across all three workflow panels. The seven functional groups passed before the CSS-only contrast fix; targeted contrast verification followed without repeating the whole suite.

No action is needed for the running review app. If it has stopped, run `npm.cmd run db:local` then `npm.cmd run dev` from the existing root. No reinstall, migration, reseed/reset or second dev process is needed. The focused homepage command is `npm.cmd run check:homepage`; `npm.cmd run check:homepage -- --contrast-only` runs the bounded rendered-text follow-up without sign-in/database writes.

## Stage 04 approved dashboard review - historical completed scope

The 1586 by 992 dashboard image supplied in the Stage 04 conversation is now authoritative. Earlier missing-reference statements are historical. Its raster binary and the exact original logo source are not local; the existing editable roof/O vector is reused for the admin wordmark without an added dot.

Open <http://127.0.0.1:5173/admin> after normal sign-in at <http://127.0.0.1:5173/admin/login>. Existing demo credentials remain `admin@demo.ootla.test` / `OotlaDemo!2026`, with masked fill and ordinary backend sign-in.

The implemented dashboard follows the approved image:

- Rounded full-width charcoal header, Ootla branding and Overview/Leads/Properties/Applications/Calendar top navigation.
- Overview title and period selector; exactly New leads, Tours booked, Applications and Leases signed.
- Sidebar beneath the header: My leads, Tasks, Analytics, AI assistant, Integrations.
- Three spacious Leads to follow up cards, with existing saved status/property/unit/open-task context.
- No overview chart, activity feed, AI panel or integration widgets.

Metrics come from the authenticated backend, with month/week/all periods and Africa/Lagos boundaries. New leads counts lead creation; Tours booked counts non-cancelled booking creation. Applications/leases are unconfigured null values, displayed honestly rather than as fabricated zeros. Existing legacy count fields remain compatible.

Useful review links:

- <http://127.0.0.1:5173/admin/leads>: all saved leads.
- <http://127.0.0.1:5173/admin/leads?q=Maya>: search saved records.
- <http://127.0.0.1:5173/admin/leads?view=new>: honest pending creation page; no lead is created.
- **View lead** on a card: read-only record detail at `/admin/leads?lead=<uuid>`.
- <http://127.0.0.1:5173/api/admin/overview?period=week>: private period metrics after sign-in.

Existing statuses stay New inquiry, Contacted, Tour booked and Qualified. The sample data is not rewritten to Applying or Leased to imitate reference content.

The four backend groups, full build, nine extended browser groups, visual comparison, retained-data/source/secret preservation and final focused QA passed. Navigation centers within 2px; 320/390/768/1586px layouts have no overflow; keyboard/mobile focus and normal-login lead-detail return paths work safely. The broad nine-group suite was not repeated after the focused fixes; targeted QA and browser-script syntax passed. See [progress](docs/ootla-progress.md) for outcomes and review steps.

Stage 04 uses separate admin styling and self-hosted Inter typography scoped to the dashboard/coded preview, preserving public/login styles. Focused commands are `npm.cmd run build`, `npm.cmd run check:dashboard` and the browser check after the app is running.

No Stage 04 migration, seed/reset, dependency installation or environment change is required. Use the already running app; if it has stopped, run `npm.cmd run dev` from the existing root. Do not start a second copy or reset/reseed just to review the dashboard.

## Stage 03 demo review - historical completed scope

Stage 03 is complete and verified, awaiting user review. The existing review application is running; no later stage has started. Detailed checks and preservation results are in [progress](docs/ootla-progress.md).

Exact staff/demo login: <http://127.0.0.1:5173/admin/login>.

Email: `admin@demo.ootla.test`  
Password: `OotlaDemo!2026`

Click **Fill demo credentials** to fill the email and masked password, then use the normal sign-in button. Autofill does not log in or bypass backend authentication. The account is an organization admin only for the isolated Ootla Demo organization, with no platform-superadmin access.

The persisted, explicitly seeded sample contains 20 owned records:

| Data | Synthetic records |
| --- | --- |
| Properties | 3: Harbor House, Oak Gardens, Summit Residences |
| Units | 6 separate records linked to their property |
| Leads | Maya Chen, Jordan Ellis, Priya Shah |
| Related records | 3 tasks, 2 viewings, 3 simulated activity entries |

These records are saved in PostgreSQL and labeled synthetic. The UI reads them on the overview, leads, properties/units, tasks, calendar and integration-status pages. It provides read-only sample review, not full CRM CRUD. Dates display in Africa/Lagos time. The public homepage preview remains illustrative and receives no private demo records.

This local checkout already has migration 003 and the synthetic dataset applied. No reseed/reset or second app process is needed for review. For another existing configured checkout, apply the new migration and explicit non-destructive seed:

~~~powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\software\Ootla'
npm.cmd run db:migrate
npm.cmd run db:seed
~~~

The additive migration is `003_demo_dataset.sql`; migrations 001/002 must remain immutable. Ordinary seeding creates missing sample records without resetting existing passwords, memberships, edits or unrelated data. Neither migration nor seeding runs on server startup.

The configured development origin is <http://127.0.0.1:7673/> with backend health at <http://127.0.0.1:3100/api/health>. Start only if the app/database is not already running:

~~~powershell
npm.cmd run db:local
npm.cmd run dev
~~~

Do not start a second app copy on the same ports. After sign-in, <http://127.0.0.1:7673/api/demo/data> returns the private sample dataset only to an organization admin in its own verified demo organization. Existing `/api/auth/me`, `/api/roles`, `/api/properties` and admin-only `/api/audit-events` retain real session and organization checks.

## Demo isolation and deliberate reset

`DEMO_MODE=true` is necessary but insufficient. The server verifies the actual connected database name, requires an isolated `ootla_demo` or `ootla_demo_*` database without live organizations, rejects URL query/fragment overrides and excludes production. Demo identities and existing demo cookies are denied when demo mode is off, the database/deployment is not isolated or the server is production. A mistaken demo switch on a customer/mixed database fails closed. Ordinary live staff access remains separate.

`INTEGRATIONS_MODE=simulation` and `OUTBOUND_MODE=simulation` are the only accepted values in this stage and are the defaults if omitted from an existing environment file. No real email, SMS, calendar invitation, Yardi write, screening request or payment operation occurs.

The optional deliberate reset command is:

~~~powershell
npm.cmd run demo:reset -- --confirm-reset=ootla_demo
~~~

The confirmation must equal the exact connected demo database name; use its full name for a separate `ootla_demo_*` environment. This command restores only manifest-owned synthetic rows and the established demo administrator's password, active flag and organization-admin membership, and revokes that administrator's sessions. It preserves unrelated records/users and existing audit history, adding a reset audit entry. It does not reset or drop the database. No reset occurs during startup or ordinary seeding; running reset is an intentional change, not a prerequisite for normal review.

Reset verification uses `npm.cmd run check:demo` in a newly created unique scratch database on the verified project-owned local cluster. It does not reset the retained demo database and removes only its own scratch database afterward. All nine demo-check groups and owned-scratch cleanup passed. The retained demo database was never reset.

## Preserved staff authorization and stage history

Stage 02's four canonical roles remain: organization admin, leasing agent, property manager and read-only analyst. Backend grants are persistent and re-read for authenticated requests. Admins access only their own organization; other staff require explicit property assignments. Legacy roles, staff/portal separation, Argon2id passwords and opaque database sessions remain in place. Applicant/resident portals and full staff-management UI remain future work.

Prompt 00, Stage 01 and Stage 02 completed-stage reports are historical records in [progress](docs/ootla-progress.md). Stage 03 extends the same application without a framework rewrite or new dependency.

## Install and run locally

Prerequisites: Node.js 22.12 or later, npm, and PostgreSQL binaries if using the optional local cluster. This machine has Node.js 22.22.0, npm 10.9.4 and PostgreSQL 18.6 available. No Docker or paid service is required.

Run from the project root:

~~~powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\software\Ootla'
npm.cmd ci
npm.cmd run env:setup
npm.cmd run db:local
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
~~~

If PowerShell blocks its `npm.ps1` shim, use `npm.cmd` in place of `npm` in those commands; no execution-policy change is needed.

`npm.cmd run env:setup` creates an ignored root `.env` with random database and session secrets, preserving any existing file without changes. Inspect existing settings if setup reports that it preserved an earlier file.

`npm.cmd run db:local` is optional. It uses installed `initdb` and `pg_ctl` binaries to create or start only the project-owned PostgreSQL cluster in `.local/postgres/data`, listening on `127.0.0.1:55439`. It creates the dedicated `ootla_demo` database and restricted `ootla` application role; the cluster administrator is `ootla_cluster_owner`. It neither uses nor changes another application's database. On this machine the binaries are in `C:/Users/user/scoop/apps/postgresql/current/bin`; add that directory to the current process PATH if the tools are not found.

To use another PostgreSQL installation instead, create a dedicated Ootla database and application role, set `DATABASE_URL` in `.env`, skip `db:local`, and run the migration and seed commands. Migration utilities require a database named `ootla` or `ootla_*`. Demo mode and seeding require `ootla_demo` or `ootla_demo_*`, outside production.

Current development URLs (the retained APP_URL is 7673; historical stage URLs below/above retain their then-recorded 5173 origin):

- Frontend: <http://127.0.0.1:7673>
- Backend health: <http://127.0.0.1:3100/api/health>
- Demo login: <http://127.0.0.1:7673/admin/login>
- Admin overview after sign-in: <http://127.0.0.1:7673/admin>

Use `127.0.0.1` consistently: `APP_URL` is the allowed browser origin. The development frontend now reads it through `scripts/dev-client.mjs`, accepts only loopback HTTP and uses a strict configured port. `.env.example` and fresh env:setup now default to 7673; the retained `.env` already selected 7673 and was preserved. The frontend proxies `/api` to the backend. `npm.cmd run dev` starts both processes and stops its companion if either exits. Stop development with Ctrl+C. PostgreSQL is separate; stop only Ootla's local cluster with:

~~~powershell
npm.cmd run db:local:stop
~~~

That command retains the database files and records.

## Demo access and manual review

Email: `admin@demo.ootla.test`  
Password: `OotlaDemo!2026`

The demo administrator belongs to the Ootla Demo organization with `organization_admin` membership. There is no platform-superadmin role.

1. Open the homepage and each public navigation link. Resize the browser and enable reduced motion to review the responsive layout.
2. Open `/admin/login`. Select **Fill demo credentials**; confirm it fills the email and masked password fields without signing in.
3. Submit the normal sign-in form, review the overview and each sidebar page, then refresh a direct admin URL.
4. Review the Stage 04 metric labels and period controls. New leads/Tours booked use saved records; Applications/Leases signed remain unconfigured. Open the named synthetic leads and their saved property/unit/next-action context; Stage 07 lead tools now permit persisted edits on their dedicated pages.
5. Sign out and try opening `/admin` again. Sign-in is required.
6. An invalid password should show a safe error. The backend denies unauthenticated API requests and organization IDs outside the session's organization.

The fill button appears only when the backend confirms isolated demo mode, a prepared database, the marked demo admin and a matching configured password hash. Seeding is explicit and repeatable: existing records, passwords, active flags and permissions are retained. Starting the server does not seed or reset anything. If the password was intentionally changed, later seeding preserves it and autofill is hidden until configuration matches or a deliberate confirmed demo reset restores the configured credentials.

## Pages and scope

| Route | Foundation behavior |
| --- | --- |
| `/` | Stage 05 public hero, full-size clipped admin example, six separate workflow sections and accessible three-step illustrative workflow; completed and verified; user review pending. |
| `/platform` | Stage 05b Leads/Viewings/Applications/Operations overview linked to existing public workflow pages; implemented and verified; user review pending. |
| `/ai-workflows` | Public AI workflow information and three manual scripted scenarios; no live AI/backend actions. |
| `/workflows/leasing` | Illustrative inquiry/viewing-request/application/staff-review journey. |
| `/workflows/resident-support` | Illustrative request/assignment/update/renewal/provider-handoff journey. |
| `/integrations` | Stage 05b seven-section Yardi-ready/integration explanation and local illustrative selector; no live connection. |
| `/admin/login` | Real backend login when PostgreSQL is migrated and seeded; honest setup/error state otherwise. |
| `/admin` | Stage 04 approved dashboard composition, authenticated period metrics and spacious saved lead cards; approved composition implemented and focused checks passed; awaiting user visual review. |
| `/admin/leads` | Stage 07 list/board/create/edit; Stage 08 `?lead=<saved UUID>` adds private notes/calls/tasks/documents/timeline, canonical contact/household context, transparent suggestions and simulated assistance. |
| `/admin/properties` | Stage 06 persistent scoped property directory/detail, separate units, server filters/pagination and permitted local create/edit forms. |
| `/admin/contacts` | Stage 06 unified identities, explicit property links, households and scoped paged relationship history; permitted local forms. |
| /admin/calendar | Native day/week/agenda booking, conflicts, timezone, changes and separate Google sync status; demo sends no real invitations. |
| /admin/tasks | Stage 09 My/Team/Unassigned task queues, creation/detail/edit/completion/history, reminders and organization-admin property/team routing. |
| `/admin/applications` | Real applications, invitations, checklist/consent/submission, private files, synthetic screening, staff review, payment-status boundaries and lease continuity. Use the separate application-workflow staff organization. |
| `/admin/integrations` | Actual durable Yardi simulator and guarded client-readiness configuration; live Yardi transport awaits documented interfaces. |
| `/admin/analytics`, `/admin/ai` | Distinct website Analytics setup/illustrative reports and governed Ootla assistant; live transports await configuration/verification. |
| `/admin/organization`, `/admin/integration-health`, `/admin/audit` | Real scoped operational administration, nine-service health and redacted read-only audit. |
| `/applicant/login`, `/resident/login` | Separate private applicant/resident identities and authorized native application/lease/maintenance records. |

The approved dashboard composition and supplied Ootla branding remain authoritative. Shared typography, restrained roof/letter animation with reduced-motion support, compact four metrics, header collapse and profile-last placement are preserved. Stage27 actual desktop/mobile screenshots verify the current HTML/CSS interface, rather than a screenshot background. See [design references](design-reference/README.md).

## Environment configuration

All settings below are server-side. Do not use `VITE_*` for secrets.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL for the dedicated Ootla database. Never commit it. |
| `PORT` | Backend port; the provided local setup uses `3100`. |
| `APP_URL` | Exact frontend origin; safe example and fresh-setup default, plus retained local value, are `http://127.0.0.1:7673`. Development reads the configured loopback HTTP origin; no path/query. |
| `SESSION_SECRET` | Random server secret of at least 32 characters. Generate a fresh secret for each environment. |
| `DEMO_MODE` | `true` only for a verified isolated nonproduction demo database without live organizations. Demo identity login/cookies are denied outside it. |
| `DEMO_ADMIN_EMAIL` | Email used by explicit demo seeding and the demo fill control. |
| `DEMO_ADMIN_PASSWORD` | Initial/restored demo password; ordinary seed runs preserve existing hashes. |
| `INTEGRATIONS_MODE` | Only `simulation` is accepted; defaults to simulation. |
| `OUTBOUND_MODE` | Only `simulation` is accepted; defaults to simulation. |
| `NODE_ENV` | `development`, `test` or `production`. Production requires HTTPS. |

The root `.env.example` contains safe placeholders. Startup validates configuration without printing values. A blank `DATABASE_URL` supports uncompiled public development/setup review; compiled/production startup requires a configured available database and the complete exact migration manifest before listening. Authentication/database operations never simulate success. If a configured database cannot be reached or needs migrations, the login page explains the issue. All authentication requires real PostgreSQL records.

## Build, checks and production startup

~~~powershell
npm.cmd run typecheck
npm.cmd run build
~~~

The build emits frontend assets in `dist/client` and backend/shared JavaScript in `dist/server`. `npm.cmd run build` already runs the type check.

Focused checks for the current application:

~~~powershell
# Dedicated demo database must be ready; build first for static-route checks.
npm.cmd run check:demo
npm.cmd run check:auth
npm.cmd run check:foundation

# In another terminal, with npm.cmd run dev already running:
$env:OOTLA_BROWSER_CHANNEL = 'chrome'
npm.cmd run check:browser
~~~

`check:auth` covers the Stage 02 canonical/legacy roles, assigned-property permissions, membership changes, portal separation, expired sessions, logout, tenant denial and audit records. `check:foundation` retains the original session, tenant, setup and production-route coverage. Both focused API checks create and remove synthetic check records only in an isolated demo database; the foundation check also verifies non-destructive repeated seeding. `check:browser` uses Playwright; the command above uses this machine's installed Chrome. On a machine without Chrome, omit that setting and install the matching optional browser with `npx.cmd playwright install chromium`. Browser captures are ignored under `.local/screenshots/`.

Stage 03 passed the build, nine demo-check groups, 12 authentication groups, 12 foundation compatibility groups, five browser groups and four actual restart groups. Checks verified the requested named records, separate units, simulation labels, normal login, isolation, idempotence, confirmed scratch-only reset and persistence across actual Node/PostgreSQL restarts. Original password/membership values, immutable migrations 001/002, .env and the lockfile were preserved; no temporary scratch database remains. See the [progress record](docs/ootla-progress.md) for stage-specific outcomes and limitations.

The optional actual-restart check is:

~~~powershell
npm.cmd run check:demo:restart
~~~

Run it after the build/browser checks, with no other Ootla database check in progress. It starts/restarts only its own compiled Node child and briefly restarts only the verified project-owned `127.0.0.1:55439` PostgreSQL cluster. It preserves the same session/expiry and dataset, performs no migration/seed/reset and cleans up only its own child processes/test session; PostgreSQL is left running. This check is opt-in and is unnecessary for ordinary page review.

For a production environment, configure its own dedicated database and a fresh `SESSION_SECRET`, set `NODE_ENV=production`, `DEMO_MODE=false`, `APP_URL=https://your-ootla-origin.example` and the desired `PORT`, then run:

~~~powershell
npm.cmd run db:migrate
npm.cmd run build
npm.cmd start
~~~

Express serves the compiled public pages, client routes, static assets and `/api` from one origin. HTTPS termination must forward requests to Express without exposing an insecure public entry point. Cookies are HttpOnly, SameSite=Lax and Secure in production; production sign-in requires actual browser HTTPS even when testing locally. The foundation does not provision production staff accounts or configure hosting, reverse proxies or certificates. Do not use demo seeding in production.

Known client routes work on direct navigation and refresh. Unknown API routes return JSON 404 responses; missing assets return 404 instead of frontend HTML. Shutdown closes the HTTP listener and PostgreSQL pool. See [architecture](docs/ootla-architecture.md) for security and data boundaries.

Established installed versions, unchanged in Stage 09:

| Component | Version |
| --- | --- |
| Node.js / npm on this machine | 22.22.0 / 10.9.4 |
| PostgreSQL on this machine | 18.6 |
| Vite / TypeScript | 8.3.4 / 5.9.3 |
| Express / pg | 5.3.0 / 8.23.1 |
| Argon2 / Zod / dotenv | 0.45.1 / 4.6.7 / 18.0.8 |
| tsx / concurrently | 4.23.15 / 10.0.6 |
| Playwright (focused browser verification) | 1.64.1 |

Exact dependency versions are pinned in the root manifest and lockfile. There is one package, no frontend framework and no paid CI configuration.

## Repository structure

~~~text
Ootla/
  client/             Vite HTML, CSS, vanilla TypeScript and page modules
  server/             Express routes, configuration, services and PostgreSQL access
  shared/             TypeScript contracts and validation
  migrations/         Versioned SQL and applied-checksum history
  scripts/            Environment, local database, migration and seed tools
  public/             Public static assets
  docs/               Build brief, architecture and stage progress
  design-reference/   Reference inventory and visual-fidelity limitations
  .local/             Ignored local PostgreSQL data and logs
  .env.example
  package.json
  package-lock.json
  tsconfig.client.json
  tsconfig.server.json
  vite.config.ts
~~~

Project constraints and correction history are in the [build brief](docs/ootla-build-brief.md) and [progress record](docs/ootla-progress.md). Complete only the explicitly requested stage; stop for review afterward.

## Stage 14 — native Calendar and optional Google sync

Open [Calendar](http://127.0.0.1:7673/admin/calendar) or [Google setup](http://127.0.0.1:7673/admin/calendar?view=google), after normal [staff sign in](http://127.0.0.1:7673/admin/login). The retained demo uses persistent internal scheduling with simulated notifications; it never authorizes Google or sends real invitations. Google synchronization has a separate status from each successful local viewing save.

The server-only optional OAuth configuration, official documentation, selected-calendar/owned-event policy, token encryption, sync coverage, live acceptance checklist and verification limits are in [Google Calendar setup](docs/ootla-google-calendar.md). No live credentials/account are configured or verified. The native scheduling walkthrough is in [Calendar](docs/ootla-calendar.md). Existing legacy viewings are preserved rather than assigned fabricated metadata.

Additive migrations 011 and 012 are required on another configured checkout: npm.cmd run db:migrate. No dependency installation or reset/reseed is needed. Existing startup is npm.cmd run db:local then npm.cmd run dev. Focused commands: npm.cmd run check:google-calendar (owned scratch database and synthetic API), npm.cmd run check:google-calendar-browser (retained read-only plus explicitly intercepted UI scenarios), npm.cmd run build. The server owns a bounded Google worker; npm.cmd run google-calendar:process is an optional single pass and performs zero external requests while disabled/demo.

## Applicant portal - Stage 15

Open http://127.0.0.1:7673/applicant/login. The separate isolated applicant demo uses applicant@demo.ootla.test / OotlaApplicant!2026; use its masked autofill then normal Sign in. For staff review, sign in at /admin/login as applications@demo.ootla.test / OotlaDemo!2026 and open /admin/applications. These accounts belong only to the separate Ootla Applicant Demo organization.

After starting the existing local database, run npm.cmd run db:migrate, then the deliberate repeatable npm.cmd run demo:applicant and npm.cmd run dev. No new dependency/environment variable or reset is required. Documents are private database records, not public assets. Invitations require deliberate copying; no messages are sent.

Full save/resume/upload/consent/submission/invitation/staff-preview walkthrough and authorization boundaries: [docs/ootla-applicant-portal.md](docs/ootla-applicant-portal.md). Focused checks: npm.cmd run check:applicant-portal and npm.cmd run check:applicant-browser (owned scratch databases only), plus npm.cmd run build.

## Public SEO and landing-page hierarchy

The latest follow-up adds smaller supporting photographs, concise landing copy and crawlable public HTML/metadata within the same application. See [SEO configuration and verification](docs/ootla-seo.md). Local/demo indexing stays off; no public origin or deployment was assumed. Run npm.cmd run build followed by npm.cmd run check:public-seo for focused verification. No migration or dependency installation is needed.
