# Ootla architecture

Foundation authorized: 2026-10-21 (Africa/Lagos). Project: `C:/Users/user/Documents/software/Ootla`.

The user has designated revised **Prompt 00** as the authoritative foundation. Preserve this architecture and its working features in subsequent stages. Inspect the implementation and progress notes first; verify completed work and change only what the current stage requires. Do not recreate the project, reset its database or replace working authentication. Older application conversion/reuse directions are superseded. See the [build brief](ootla-build-brief.md) for all continuation rules.



## Current boundaries after Stages 26-28 - 2026-10-25

This is the latest architecture section and supersedes historical future-module/stop-before-26 statements below. The authorized final batch preserves the existing independent Ootla application, database and approved public/admin presentation. See the [final handover](ootla-final-handover.md), [demo walkthrough](ootla-demo-walkthrough.md) and [activation register](ootla-live-activation-checklist.md). Stage 28 local preparation is complete: startup, clean installation/environment, disposable recovery, final build/compiled serving and compiled restart pass. No remote deployment or live provider activation occurred.

### Application and administration

The frontend remains Vite with vanilla TypeScript, real HTML/CSS and one reusable admin shell. The public website and staff/applicant/resident portals belong to this application. Public pages are separately rendered for public SEO; private CRM data is fetched from authenticated server APIs and is never embedded in a public build. The compact four-card charcoal header, profile-last order, sidebar below the header and restrained Ask Ootla entry remain intact.

`/admin/organization` adds profile, staff/roles/property grants, groups, lead assignment, notification/timezone/quiet hours, AI operating/tool/intent/usage policy, approved knowledge, private property documents, configured retention and isolated-demo administration. Personal `/admin/profile` and `/admin/settings` remain separate. The canonical role/property mutation services are reused; new-only staff provisioning hashes the masked initial password with Argon2, does not silently link existing/global/portal identities and cannot disable the last active organization administrator.

The server rechecks the exact current staff session, active identity/membership, organization and all relevant property relationships. Permission changes apply to subsequent requests, jobs, inference results and queued delivery; hidden buttons and cached role objects are not the boundary. Applicant/resident sessions and explicit grants remain separate from staff authority. Organization admin never becomes platform superadmin. A read-only staff preview cannot act as an applicant.

Lead assignment is opt-in per property/team and only applies to new native leads without an explicit owner. Current eligibility across property interests is checked; least-open-leads routing leaves work Unassigned when no eligible agent exists. Existing task teams/routing/reminders are reused. Organization in-app enablement and optional quiet hours constrain delivery without replacing property/channel policy. They do not activate external email/SMS.

### Knowledge, private content and operations

Knowledge supports organization/property scope and Draft/Approved/Retired states. Public assistance requires separate approval. Current policy, source versions, record scope and grants are checked during actions, after inference and before outbox delivery; retired/expired/unauthorized sources cannot be released by an in-flight result.

Private property source files are validated PDF/PNG/JPEG/plain-text bytes up to 2 MiB in PostgreSQL, separate from public static assets. Staff manually enters and explicitly approves the exact reviewed text linked to the knowledge source. No automatic PDF/OCR parser, binary index or configured malware-scanning service is claimed. The original binary never becomes public because reviewed text is public-approved. Applicant/resident files and screening reports remain protected in their canonical workflows, not general AI knowledge.

`/admin/integration-health` reports nine service boundaries using current evidence: Not configured, Demo/simulated, Configured but unverified, Live verified, Degraded or Disconnected. It links actual native scoped controls; there is no generic replay-all action. Missing operation timestamps remain unrecorded and configuration is not proof of a successful provider operation.

`/admin/audit` is read-only, organization-admin controlled, server-paginated and UTC-filtered. Significant configuration/role/action and authorized sensitive-file/report reads are recorded. New and legacy audit responses use a strict metadata allowlist instead of raw secrets, document contents or provider traces.

Retention is explicit opt-in; no jurisdictional period is invented. Configured categories cover expired customer messages, inactive Ask history and linked copies, retired knowledge/property source bytes, terminal AI results/traces and closed-record private files. Read-time expiry prevents stale downloads. Bounded workers and a separately previewed/confirmed manual pass preserve stable identities/receipts, active records, decisions, canonical CRM data and audits. Purges cannot restore raw copies from in-flight results or stale receipt replay. Core CRM/audit archival requirements remain explicitly unconfigured; transient exports are not stored; voice has its own 0-30 day policy. Backup retention/key recovery is an operational policy outside database content purging.

### Runtime, data and recovery boundary

Additive migrations 024 organization administration, 025 operational controls and 026 property documents were applied once. Earlier migration files are immutable; no database reset/reseed or authentication replacement occurred. Properties remain distinct from units and canonical contact/application/lease/resident relationships remain intact. Yardi owns its configured authoritative fields/accounting; unsupported live Yardi writes and status ingestion remain unsupported.

`server/db/migrations.ts` caches the release's immutable migration filenames/raw SHA-256 manifest. Database readiness freshly compares applied history and the migration-created tables. Compiled/production startup fails before listening or starting workers if required database/schema readiness is missing; optional public development without a database remains available. `OOTLA_BIND_HOST` defaults to loopback `127.0.0.1`; other bind addresses require deliberate configuration.

The normal API process starts the same seven durable workers: task reminders, imports, connector sync, Google Calendar sync, automations, voice retention and operational retention. There is no second worker daemon or startup seed/reset. Existing receipts/cursors/retries support restart without replaying completed actions. Private uploaded bytes are in PostgreSQL; a database backup contains that content, while separately held encryption keys and backup retention still require their own custody/recovery.

Safe templates are `.env.example`, `deploy/apache/demo.env.example` and `deploy/apache/production.env.example`; actual private `.env` remains preserved. The reviewed local web origin is http://127.0.0.1:7673 with API on loopback 3100 and project PostgreSQL on 55439. Same-host Ubuntu/Apache/systemd preparation is documented in [the deployment guide](ootla-apache-demo.md); actual VPS/TLS/DNS operation is not verified here.

### Verification and remaining limits

Stage 26 passed 16 API, six actual Chrome and six operational groups. The final Stage 27 consolidated actual UI/API pass passed 17 groups, including separate original/application/resident/standalone identities, private documents and current permissions. The material login-return and busy voice-control races were corrected without changing the approved public design. Real local entrypoint restart, 2,700 distinct synthetic properties/2,700 leads with zero added units, bounded pages/search/reports and native reminder duplicate prevention passed. Those observations are local/shared-machine results, not a production concurrency claim.

The preservation baseline proves 131/132 exact original row hashes, all 23 earlier/26 applied migration checksums and 57 protected environment/dependency/public/design hashes. The remaining automation-rule row has an advancing runtime scan cursor; the original snapshot lacks a separate configuration hash, so complete equivalence for that row cannot be proved. It was not reset or omitted from the record. The final post-smoke/authentication preservation check confirmed the same explicit limitation and all protected checksums/hashes; retained homepage and API health return HTTP 200 with database ready.

Stage 28 clean-install verification passed from the unchanged lockfile with 147 packages, native Argon2 verification and dependency resolution. Six real startup-readiness groups passed. A first offline install attempt lacked a cached zod archive; a clean registry retry passed and the working installation was untouched. Disposable recovery passed three focused groups with native PostgreSQL 18.6 pg_dump/pg_restore: a 611,703-byte custom archive restored into a new owned database with all 26 migration checksums and 144 table fingerprints/163 rows matching. Three private PostgreSQL bytea files, their hashes and property-source provenance survived. Restored normal staff/applicant logins and three authorized downloads passed; three anonymous downloads returned 401 and two foreign attempts 404. Core/private/task/job counts remained unchanged after auth, with no workers, seed/reset or outbound action. Dump took 1,325.74 ms and restore 4,548.15 ms. All owned databases/archive/temp files were cleaned. This is local synthetic recovery, not Ubuntu/Apache recovery or a production RTO. Deployment keys and cluster roles/ACLs were outside the archive; future object storage needs a separate backup. Evidence: scripts/check-backup-restore.ts and .local/backup-restore-observations.json. Two fresh/repeat environment-setup checks also pass; the retained private .env hash is unchanged. Final compiled verification passed four groups on the actual built application: eight public routes, ten protected workspaces, existing assets 200, missing assets/source 404, unknown API JSON 404, private no-store/noindex and no bundled server secrets. All six retained normal demo logins passed: four distinct staff organizations, applicant and resident own records, cross-scope denial, truthful nine-service states and logout. This smoke started no workers and made no retained CRM business writes; only session/login-audit state changed. The actual compiled index then passed an ordinary restart in a disposable database: startup 2,377.57 ms, restart 2,380.20 ms, one reminder 210.02 ms after readiness, one notification across two starts, persisted session/task, no seed/reset or duplicate, unchanged core counts and two graceful zero exits. Owned resources were cleaned. Evidence: .local/final-compiled-smoke-observations.json and .local/final-compiled-restart-observations.json. Apache/TLS, Linux OS signal forwarding, remote resource limits and production concurrency remain unverified.

Google Calendar, GA4 and optional OpenAI transports are implemented and locally/stub verified, but not live-authorized/observed in this batch. Live Yardi, email/SMS, screening, signing, payment-status and telephony transports require missing documented implementation/configuration and authorization; a flag cannot create them. Resident demo external payment handoff remains explicitly unavailable/409. No payment authorization, applicant AI decision, live call/audio/recording or external communication was added.


## Current verified boundaries after Stages 20–25 — 2026-10-25

This section supersedes older unimplemented/future-module statements below. The earlier sections are historical design/evidence, not instructions to rebuild completed modules. The explicitly authorized20–25 batch is complete; stop before26. See [the current handover](ootla-batch-20-25-handover.md).

- The frontend remains native Vite/TypeScript: shared admin shell and contextual Ask panel; dedicated Conversations, Automations, Analytics, Reports, Maintenance and Voice pages; separate applicant/resident routes. Public design/logo/fonts and the four-card compact/collapsible dashboard are preserved. No framework/dependency rewrite occurred.
- Stage19 orchestration remains the server-controlled inference/action boundary. Ask Ootla tools call canonical domain services; confirmation uses current policy/permissions/state and stable receipts, never model SQL. Actor/org/context-bound histories revalidate present grants and anchored canonical relationships before pagination; later unrelated inquiries do not invalidate old authorized threads.
- Conversations use canonical contacts/leads and explicit property channels/public FAQ approval. Customer capabilities are expiring/digest-only and separate from staff sessions. Private notes and staff knowledge stay private. Signed native Calendar booking remains authoritative; ownership/takeover, outbox and automation share final delivery guards and organization serialization.
- Automations persist scoped rules/jobs/fingerprints and use native Tasks or the conversation outbox. Eligibility is application logic, rechecked for current membership/all lead interests, source/workflow, knowledge version, replies, consent, takeover, pause, quiet hours and timing at execution. Bounded workers advance pages/retries and preserve subsequent staff edits. Maintenance reminders link canonical requests/contacts without relying on a closed lead.
- Google Analytics uses an organization-scoped read-only official transport, encrypted OAuth/PKCE/token storage, accessible property selection and scoped caches. It is a reporting boundary: no tracking/CRM upload or inferred CRM correlation. Local illustrative data requires deliberate selection. Live Google reporting is disabled in DEMO_MODE; actual authorization/report retrieval remains unverified.
- Portfolio reporting shares native server aggregate queries with Ask, including exact dates, permitted property/group/region/agent/team and current task/maintenance scope. Period counts and linked chronological cohorts have explicit definitions. Tables/exports are bounded; region metadata does not overwrite Yardi-owned fields. The optional2,700-property/2,700-lead benchmark adds zero units and runs only in an owned disposable database.
- ResidentPortal has separate hashed-cookie sessions, expiring single-use invitation digests and explicit grants to canonical contact/property/unit/application/lease/participant relationships. An address/household grants no files. Maintenance stores validated private PG files, resident messages versus staff notes, assignments, supported transitions and confirmation evidence. Requested access is not an appointment. Renewals use actual dates and approved terms; payment handoff uses the existing provider boundary.
- Source ownership remains explicit: standalone operations are Ootla-owned; unsupported Yardi maintenance writes remain locally saved/awaiting configuration. Connector failures do not become fake external confirmations. Yardi accounting and existing payment/screening/applicant-decision boundaries remain unchanged.
- Voice is an explicitly enabled isolated-demo transcript simulator, default off. Server/voice interfaces separate recognition, dialogue, permitted tools, text output and staff transfer. It reuses canonical conversations/Calendar/Stage19 simulation and actual applicant-session proof for private next steps. Public capabilities cannot read voice-origin sessions. Transcript text stays in its restricted store; current roles/proof/retention are checked on read, the bounded worker purges text, and deletion prevents an already-running turn from restoring it. Recording, audio and commercial telephony are unsupported; no raw voice text is copied into permanent AI/conversation/timeline logs.
- Additive immutable migrations018–023 extend the existing PostgreSQL schema. Existing users/authentication and105 original rows across94 prior business tables are preserved. The normal API lifecycle starts/stops bounded automation and voice-retention workers alongside prior workers; it never resets or seeds on startup. Deliberate scoped helpers prepare separate synthetic conversation/resident examples. No live outreach, provider activation, paid inference or deployment was authorized or performed.

## Stage 12 - client Yardi readiness boundary

No authorized client interface/schema/payload/authentication/property scope is present. `shared/yardi-contracts.ts` and `server/connectors/yardi/{readiness,ownership,configuration,mapping,transport}.ts` complete the unavailable-input branch. They use Ootla canonical names and neutral planning/transport interfaces, not fabricated provider fields or endpoints. No live adapter is registered; `yardi_demo` remains the only registered connector.

Existing `server/routes/connectors.ts` adds GET `/api/connectors/yardi/readiness` and POST `/api/connectors/yardi/validate-config`. Both use current organization-admin/exact-session checks; the POST retains same-origin/JSON protection. Optional neutral draft references, pilot scope and requested canonical domains are strictly bounded. Unknown credentials/endpoint/payload/authority fields are rejected. Validation is pure: no configuration/connection/job/audit write, no secret echo, no network request and no evidence promotion.

The four readiness dimensions are independent: scaffolding true; real client mappings, live credentials and live behavior false. Credential-storage availability and Stage 11's separate synthetic mappings cannot change those facts. Source-owned fields remain conditional on approved mappings. Existing canonical property/unit/contact/application/lease references in external_record_mappings are reused; residents/payment status have no supported ingestion model. Accounting remains authoritative in Yardi and payment-provider status is read-only when verified.

Mapping profiles have no configured defaults. Literal bounded source paths reject prototype keys/duplicate canonical targets and use declared canonical types. The pure synthetic fixture exercise can test Ootla contract structure without claiming client authorization or performing CRM writes; actual source-relationship resolution and status mappings remain unverified. The transport interface allows a future documented success/failure outcome; the current unconfigured implementation returns only safe not-configured/unsupported outcomes and denies all writes.

The existing client connector page/controller/styles append `?view=yardi` as Yardi setup. It displays four evidence states, seven ownership domains, remaining inputs and a non-persistent draft form. The five simulator tabs, original shell/branding/font, Overview, real authentication, source ownership and standalone imports are preserved.

See [readiness/field ownership](ootla-yardi-readiness.md) and [pilot checklist](ootla-yardi-pilot-checklist.md) for the evidence inventory, client inputs, scope/permission checks, reconciliation and rollback gates. No schema migration, dependency or environment change is required; missing optional Yardi setup cannot block Ootla startup or simulator use.

## Stage 11 connector boundary

The existing `/admin/integrations` route now hosts a dedicated connector workspace inside the approved admin shell. `shared/connector-contracts.ts`, `client/pages/connectors.ts`, `client/lib/connectors.ts` and scoped `client/connectors.css` provide Connection, Sync jobs, Record mappings, Event history and Conflicts views. All diagnostic lists are server-paginated (25 default, 100 maximum). The page retains a genuine standalone CSV-import entry. No detailed integration widgets are added to Overview and public pages/profile settings remain separate.

`server/routes/connectors.ts` mounts `/api/connectors` behind normal current-user authentication. Connection setup, controls, diagnostics and credentials require the current active organization-admin membership, exact session digest and organization scope. Writes retain the configured-origin protection. Neither URL/body target identifiers nor an organization-admin role grant platform or cross-tenant access.

`server/connectors/adapter.ts` defines the adapter envelope, capabilities, field ownership and bounded polling interface. `registry.ts` registers server-approved adapters; browser-supplied names, URLs or state values cannot register code or activate Live. Only `yardi_demo` is registered in Stage 11. The generic connection table allows future provider identifiers; the database explicitly prevents a simulator from becoming Live.

### Persistence, jobs and duplicate safety

Additive `010_connectors.sql` adds nine tables: `connector_connections`, `connector_jobs`, `connector_demo_state`, `connector_demo_records`, `connector_demo_events`, `connector_event_receipts`, `connector_event_logs`, `connector_conflicts` and `connector_action_receipts`. Existing `external_record_mappings` receives nullable tenant-safe `connection_id`, provider version/snapshot and last-sync timestamp. Earlier mappings and migrations 001–009 are preserved. Mapping targets retain their typed canonical foreign keys; existing mapping endpoints cannot forge the reserved simulator provider.

`server/services/connectors.ts` owns authorization, request receipts, connection lifecycle, durable work and canonical projection. Action keys are UUIDs bound to an operation/payload hash; retries reuse receipts and cannot repurpose the same key for a different action. Jobs capture an upper source sequence, resume cursor, initiating membership, attempts and next due time. Connection/job locks with SKIP LOCKED serialize same-connection work while allowing independent work. Writes, mappings, event receipts, logs and the safe cursor commit together; a crash rolls back the in-flight transaction and leaves queued durable work.

One worker tick polls at most 50 source events by default (100 maximum). Per-record savepoints preserve valid later work when one record fails, while only the contiguous successful prefix advances the cursor. Replays recognize saved event receipts without rewriting canonical records. An event ID reused with different entity/identity/version/content fails closed rather than silently consuming the update. Provider versions prevent old events from overwriting newer records. Local source-field drift and out-of-order updates become explicit staff-review conflicts.

The worker rechecks the initiating user's current active staff/admin membership. Actual retry attempts are bounded to three, with 30/60-second backoff; successful chunk continuations do not spend extra attempts. A deliberate retry after terminal failure creates a new logged job and preserves prior outcomes/mappings. Disconnect cancels pending jobs and retains data/cursors/history. Reconnect resumes the saved connection. Startup runs the bounded worker about every two seconds and shutdown waits for its current tick; no startup seed/connect/reset occurs. `npm.cmd run connectors:process` performs one bounded pass.

### Functional, isolated synthetic provider

`server/connectors/yardi-demo.ts` keeps separate synthetic provider records and an append-only change feed. Deliberate setup stages Simulator Cedar Court, its separate unit 101, Taylor Brooks and a guest-card identity. These are not existing CRM records. Only the actual worker pathway creates the corresponding canonical property, unit, contact, property link, lead and external mappings. Existing names/emails are never silently matched or adopted; the same provider identity resolves through its saved mapping.

Simulator actions stage availability, contact-phone, temporary-failure, repeated-event and out-of-order-event scenarios. Users separately run incremental sync and refresh status. Initial setup is Connecting; completion is Demo, failures are Degraded and explicit disconnect is Disconnected. No connection is Not configured. Live is visibly unavailable until a licensed implemented interface, permissions and configuration exist. Demo setup/actions/processing require server-verified isolated DEMO_MODE and demo organization; they cannot run against production or mixed customer data and do not change organization onboarding mode.

Canonical simulator records use `source_system=demo`, explicit source-owned field arrays and `provider=yardi_demo`. Unit availability stays `availability_source=demo` with null authoritative verification time, including after updates. Existing property/contact mutation APIs enforce those ownership arrays. Guest-card updates do not own CRM stages, ownership, preferences, notes, tasks or application/lease milestones. No verified-provider update, resident/accounting write, payment, screening, invitation or external communication is manufactured.

Conflict decisions are explicit and audited. Apply provider is allowed only for a current non-stale supported revision; Keep current consumes/skips the incoming revision without giving away source ownership. Future genuinely newer revisions can sync normally. The page shows safe context/field names and related CRM links rather than raw provider payloads or credential details.

### Server-only credentials and configuration

`server/connectors/vault.ts` provides AES-256-GCM with random nonces and authenticated tenant/connection/provider context. The optional `CONNECTOR_CREDENTIAL_KEY` is a separate canonical base64-encoded 32-byte server key; blank disables credential storage. The actual local .env remains unchanged. The simulator needs no credential or key. The guarded credential API returns only configured status, never the secret/envelope; no public configuration/client bundle contains the key. Unknown licensed Yardi credential fields and live URLs are intentionally not invented. Changing or losing a key requires deliberate credential re-entry/re-encryption, not silent regeneration.

All new functionality remains one vanilla Vite/TypeScript + Express/TypeScript + PostgreSQL application. No dependency, framework, production deployment, paid CI or external provider is introduced. Stage 11 is the complete authorized boundary; later numbered stages require a new instruction.

## Staff self-service account boundary - explicit follow-up

The profile dropdown routes to `/admin/profile`, `/admin/profile?edit=1` and `/admin/settings` in the same protected admin shell. `shared/account-contracts.ts`, `client/pages/account.ts`, `client/lib/account.ts` and scoped `client/account.css` define the actual personal account workspace. No frontend-only identity/session store or framework is introduced.

`server/routes/account.ts` mounts `/api/account` behind the established current-user middleware and origin protection. GET returns the current staff profile/preferences, PATCH `/profile` updates display name/phone/job title, PATCH `/preferences` updates start page/lead view/motion and POST `/password` changes an individual user's password. Strict requests accept no target user/tenant/email/role fields. Applicant/resident identities do not receive staff self-service access.

`server/services/account.ts` reloads and locks the active staff user/current membership, then verifies the exact existing cookie digest again after acquiring locks. Profile identity is global to that staff user; preferences belong to the exact user/membership/organization. Version checks prevent lost updates. Tasks as a default page requires current permission and falls back to Overview if that permission later disappears. Explicit safe return destinations and Leads view queries override personal defaults. Saved reduced motion applies to authenticated workspace content; device reduction remains respected.

Additive `009_staff_account.sql` adds optional `users.staff_phone`, `users.staff_job_title`, positive `users.profile_version`, tenant-safe `staff_user_preferences` and durable `staff_password_attempt_limits`. Existing names, email, password hashes, memberships and earlier migrations stay unchanged. GETs create no records. Email and current organization/role are displayed read-only.

Password changes use the established Argon2id helpers, current-password verification, a matching different 12?128-character password and five durable attempts per 15 minutes. Successful change and deletion of every session for that user are atomic. The existing login service's locked hash revalidation prevents an in-flight old-password login from creating a surviving session. Exact-session revalidation rejects a request queued before logout/revocation. Other users and their sessions remain unaffected. Shared `is_demo` identities have fixed passwords and a clear notice. Audits record changed field names without password/phone/title values.

Migration 009 is applied once to the retained isolated demo. Twelve backend groups, eight owned write-browser groups, four retained record-read-only groups, five login-origin groups, the 151-module client/server build and compiled route/security smoke passed. All 37 prior business-table original-column fingerprints and nine migration checksums match; retained preference/attempt tables remain empty. No new dependency or environment change is needed. This is a bounded follow-up after Stage 10; no later stage, organization settings console or provider action is authorized.

## Stage 10 standalone onboarding and import boundary

Stage 10 adds `/admin/imports` inside the established admin shell, reached by the dedicated Integrations page. `shared/import-contracts.ts` defines the four entity field maps, strict requests, batch/row/result/undo contracts and paginated responses. `client/pages/imports.ts`, `client/lib/imports.ts` and scoped `client/imports.css` provide Upload → Map fields → Validate → Review duplicates → Confirm import → Reconcile results. Existing public pages, five sidebar links and the four-metric/maximum-three-follow-up Overview remain preserved.

`server/routes/imports.ts` mounts `/api/imports`. `server/services/imports.ts` owns current authorization, staged mapping/validation/decisions, canonical writes, typed source mappings, background work and conservative undo. `server/services/import-csv.ts` owns bounded CSV parsing and safe export cells. No parallel customer store, framework rewrite, XLSX/workbook dependency or live provider adapter is added.

### Persistent staging and canonical identity

Additive `008_standalone_imports.sql` introduces `import_batches` and `import_rows`. Batches store tenant, entity type, source namespace, filename/file hash, mapped headers, uploader membership/user, status, counts, confirmed/completed times and bounded worker attempts. Rows persist original physical CSV line number, private raw values, normalized values, validation errors, duplicate suggestions, explicit decision, resulting record/mapping IDs, result/status, per-row attempts and creation snapshot/revision. The row is its durable receipt; no additional receipt/customer database exists.

Canonical `properties`, separate `units`, `contacts` and `leads` receive imports. Optional canonical contact-property relationships and source-ID references reuse the same CRM/application/lease foreign keys and history; an imported prospect does not get a separate applicant/resident identity. Migration 008 extends `external_record_mappings` with a typed tenant-safe `lead_id`, updates the exactly-one-entity constraints and adds monotonic `import_revision` columns/guards to the four canonical types. Migrations 001–007 stay immutable.

Related files use the same trimmed, lowercase source name and stable `sourceId`, `propertySourceId`, `contactSourceId` and optional `unitSourceId`. Import properties, then units, contacts and leads, reconciling each file before dependent validation. External IDs remain in the dedicated typed mapping structure; the provider namespace is a deterministic opaque import hash of source/type/source ID, not a claim of a live provider.

The tenant/source/entity/file-SHA256 unique key and upload advisory lock return the existing batch for identical file replay. Typed mapping uniqueness and transactional row receipts prevent repeated confirmation, concurrent workers or resumed processing from duplicating records. A changed file carrying a mapped source ID links to the same current canonical record without overwriting staff edits. This is initial import, not a synchronization/update protocol.

### Validation, identity review and ownership

CSV is UTF-8 with a unique nonempty header, at most 5 MiB, 10,000 data records and 100 columns. The parser supports quoted commas, escaped quotes and multiline values while preserving each record's original physical starting line. Structural errors reject the upload; field/reference errors remain invalid rows in a saved review batch. Required mapping fields must point to distinct existing headers. Missing related IDs, invalid amounts/timestamps/stages and repeated source IDs are explicit errors. No CRM records are created until confirmation.

All import access requires the current active staff organization administrator. The service reloads membership/user/settings in transactions; organization admins have no cross-tenant privilege. Standalone mode is required for batches/rows/exports/confirm/undo. A connected organization can only load its truthful onboarding restriction. Current membership/organization mode and configured source ownership are checked again in background processing. Source-owned fields and Yardi mapping targets cannot be bypassed by labeling a file an import; no Yardi writes or source-mode switch is provided.

Contact suggestions consider accessible organization name/email/phone evidence, at most ten results per row. Ambiguous existing or intra-file identities block confirmation until an explicit create-separate, reviewed-use-existing or skip decision. Name-only linkage is rejected. A selected existing contact must have matching email or normalized phone evidence at review and processing time; staff still decide identity. Linking preserves all current contact fields and history and creates only the explicit mapping/property association. There is no destructive contact merge.

Leasing and sales leads import only at `new_inquiry`; staff use the established transition/evidence rules to advance. Units store `source_system=import`, `availability_source=import` and null `availability_verified_at`. An imported Available label is not verified inventory, a confirmed viewing or eligibility evidence. Existing application-summary, lease milestone, staff-review and payment boundaries remain unchanged.

### Durable background processing and reconciliation

Normal backend startup starts `startImportWorker`; graceful shutdown stops it before closing the pool. The worker checks immediately and about every two seconds without overlap. Missing import schema is a setup state, never a reason to migrate, seed or reset automatically. `imports:process` performs one optional bounded pass with the same service.

Each pass takes one eligible queued/running batch with `FOR UPDATE SKIP LOCKED`, rechecks its creator and standalone mode, then processes at most 100 due ready rows transactionally in source order. Row savepoints isolate actual persistence failures and preserve attempt tracking. Transient failures receive at most three attempts with 30/60-second backoff; domain/reference errors fail safely. Batch interruptions have bounded attempts/backoff too. Durable receipts/source mappings support fresh pools, process interruption and deliberate retry while preserving prior success. GETs and dashboard refreshes enqueue/import nothing.

Reconciliation records Created, Existing record linked, Skipped, Invalid, Failed, Undone or Retained outcomes beside source row/batch IDs and genuine canonical CRM links. Lists and row/undo previews default to 25 and cap at 100 items. Polling is bounded and aborts on navigation; users can leave and return to saved progress. Error CSV contains only batch UUID, physical source row, status and diagnostic; it does not repeat raw personal cells. Quoting and formula-prefix neutralization prevent spreadsheet execution. Export rechecks current tenant/admin/standalone access and uses private no-store attachment responses.

### Conservative undo

Undo is deliberate after processing, previewed and checked again while locking current rows. Only records marked created by this batch with identical saved snapshots and unchanged monotonic import revisions are eligible. Later direct edits, including edit-then-revert, and creation/update/deletion of related work advance revision/touch evidence. Further source mappings and current dependent tasks, units, leads, notes/documents, applications, leases, assignments and household records also block removal; restrictive foreign keys provide a final transactional guard.

Eligible removal deletes only its own mapping and import-owned incidental relation/event rows, then its unused canonical record. Reused identities, subsequent work and unrelated mappings are retained. A failed dependency deletion rolls back that row's savepoint and records Retained. Batch/row decisions, actor audits and import lineage stay persisted; this is not database rollback or an arbitrary cascade. Later dependent batches can make upstream rows permanently conservative even after their dependencies were removed.

### Authenticated routes and standalone demo

All `/api/imports` routes use real server sessions, no-store responses, strict validation and parameterized queries. Mutations require the exact configured origin.

| Method/path under /api/imports | Behavior |
| --- | --- |
| GET /onboarding | Current organization/mode, admin access, limits and four entity maps; connected-mode restriction only. |
| GET /; GET /:batchId; GET /:batchId/rows | Organization-scoped saved batches/detail and bounded row/status pages. |
| POST /upload | Persist CSV staging only; return the same batch for identical source/type/file replay. |
| POST /:batchId/map; POST /:batchId/validate | Save reviewed field map; persist normalized row/reference/duplicate validation. |
| POST /:batchId/decisions | Explicit per-row create-separate/reviewed-use-existing/skip, up to 100 decisions per request. |
| POST /:batchId/confirm; POST /:batchId/retry | Deliberate queued processing or eligible unfinished-row retry with stable receipts. |
| GET /:batchId/errors.csv | Safe metadata/diagnostic attachment without raw contact values. |
| POST /:batchId/undo-preview; POST /:batchId/undo | Current eligibility preview and explicit guarded removal of untouched batch-created records. |

`server/services/standalone-demo.ts` and explicit `scripts/seed-standalone-demo.ts` prepare `ootla-standalone-demo`, its standalone settings, a hashed `standalone@demo.ootla.test` identity and active organization-admin membership. No customer/property/unit/lead/import fixture is added there. The existing original demo/mode/password/data stays unchanged. Repeated `demo:standalone` adds only missing owned setup records, preserving edits/passwords/settings; conflicting existing identities/modes are refused. The server exposes the separate **Fill standalone demo credentials** control only after isolated `DEMO_MODE`/prepared-account checks. It fills the masked form only; normal Sign in remains required, and demo-mode-off rejects the account. No auto-seed/reset occurs at startup.

### Stage 10 verification status

All 15 final focused backend groups passed in an owned scratch database, covering valid/mixed-invalid imports for all four entities, explicit duplicate choices, repeated files/source IDs, 251-row bounded/concurrent/resumable processing, actual database fault-trigger backoff/three-attempt limits, canonical application/lease identity, tenant/role/property/portal/current-revocation/mode/source-ownership guards and conservative undo. Final source hardening rejects Yardi-mapped targets and avoids concurrent queries on the same transactional pool client; the final run passed without warnings.

All nine isolated write-browser groups, three bounded restriction-state cases and three retained record-read-only browser groups passed. Coverage includes normal standalone login, all six steps/four entity types, invalid error export, duplicates, replay, CRM persistence, safe undo, 320/390/768/1586px layouts, labels/keyboard/reduced motion, real Integrations CTA, unchanged Overview, logout/private API protection, bounded data and no external actions. Owned scratch databases/servers/workers were removed. Retained checks made only ordinary authentication session/audit writes; no retained import was created. Desktop/mobile captures are review artifacts, not approval.

Migration 008 applied exactly once to retained `ootla_demo`; SHA-256 is `ed145f73c51b8e2cd651d5d24d7e0852a5bdcd8249cb5b5bf2110042d6534599`. All eight database checksums match; migrations 001–007 remain unchanged. Final original-column/count/MD5 fingerprints match in all 35 prior business tables after excluding only the new standalone organization/settings/user/membership rows. Original password hashes/timestamps and customer/task data remain intact. The new user has an Argon2id hash and one active organization-admin membership solely in its separate demo. That organization has zero properties, units, contacts, leads, import batches and import rows. All 109 protected source hashes, environment/example/lockfile, public sources and admin CSS remain unchanged.

The final build passed both TypeScript projects, the 147-module Vite client and compiled server without warnings. An owned temporary compiled production process without a database/deployment verified anonymous `/admin/imports` redirects (302), all 13 import read/mutation endpoint denials (401, valid mutation origin), public page success, unknown/private-file 404s, demo-disabled public configuration without either credential set, and absence of actual session/database secrets in client assets; only its own process stopped. Current preview 7673/API3100 health is 200 and database ready. A final rendering-only correction hides deleted CRM links after safe undo while preserving created/retained links, IDs and outcomes. Three focused property/contact/lead render cases passed without database/network actions; the final post-correction build again passed both TypeScript projects, the 147-module Vite client and compiled server without warnings. The prior focused suites/security/data preservation remain valid and were not broadly repeated. All Stage 10 checks are complete with no outstanding failures. No new installation, environment change, reset/reseed, external communication, provider activation or deployment is required. STOP at Stage 10 for user review; completion is not approval.
## Stage 09 tasks, routing and in-app reminders - historical completed implementation

Stage 09 reuses the existing tasks and private Stage 08 lead-workspace actions. shared/task-contracts.ts defines strict task, directory, related-record, routing and snooze contracts. server/services/tasks.ts owns current authorization, task transactions, routing, actionable selection and in-app reminder lifecycle; server/routes/tasks.ts mounts /api/tasks. client/pages/tasks.ts, client/lib/tasks.ts and scoped client/tasks.css render dedicated staff tools in the existing admin shell. Stage 08 create/edit/complete/reopen delegates to the same Tasks service, so there is one persistent task record and lifecycle.

### Persistent task and relationship boundary

Additive 007_tasks_reminders.sql extends existing tasks. The original property_id remains required as the authorization boundary; lead_id and contact_id become nullable for property-only/contact/application/tour work. Optional application_id and tour_id are typed foreign keys, not arbitrary URL strings. Composite relationships and context guards require the same organization/property/lead/canonical contact; a contact-only task requires its explicit property link. Properties and units remain distinct entities.

Tasks persist title/details, owner, due timestamp, low/normal/high/urgent priority, open/completed/cancelled status, manual/demo/ai_simulation/import/system origin, manual/routing assignment, optional routing team/notice, optimistic version and reminder generation. Browser creation is manual and cannot supply another origin. The three original Stage 03 fixture tasks retain all old values and stay unassigned; the new origin column identifies their owned demo provenance. Ordinary explicit seed creates missing demo tasks with demo origin without rewriting retained records.

New task_events provides append-only created/updated/assigned/completed/reopened/cancelled/reminder_snoozed actor/time metadata. Completion stores current completer/time; reopening clears current completion while retaining events. New task_teams, task_team_members and task_routing_rules represent organization-specific assignment configuration. New task_reminders and task_notifications represent durable in-app delivery. No email or provider queue is added.

### Current private permissions and assignment

All task reads/writes require current leasing.manage and the primary property; linked leads additionally require every current property interest. Current staff/organization/member/grants are rechecked inside write transactions and before owner assignment. Wrong-tenant/hidden records do not gain access through direct identifiers. Read-only analysts and applicant/resident identities cannot read private task titles/details/history. An organization admin remains organization-scoped.

Manual assignment rejects an inactive, nonstaff, unauthorized or incompletely scoped owner. Organization admins alone manage routing teams and per-property rules. Team membership does not grant property permission. Routing takes a property advisory lock, filters active eligible staff with leasing permission and all required property access, then selects the least open work with deterministic membership-ID ties. Concurrent creation cannot independently choose from an unlocked workload snapshot. An enabled rule with no selected team uses all eligible property staff; a selected team narrows that eligible pool. No enabled rule or eligible member leaves owner null with an explicit unassigned notice.

Routing runs on deliberate creation or an explicit re-evaluation during update. Unrelated edits, GETs and dashboard refresh never silently reassign existing work. My tasks means the signed-in membership's assigned records. Team tasks means all current accessible organization tasks, not a cross-property permission bypass; Unassigned means accessible owner-null work. Search/filter/sort/pagination are server-side, default 25 and maximum 100 per response. Property, owner and related-record choices are bounded and server-searched. The routing loader preserves global bounded owner/team choices but separately fetches the exact selected property's options, merging that saved rule ahead of the first 100 rules with deduplication and a 100-rule cap. When property search chooses a property, that result determines the targeted rule. If the currently saved team lies outside the first 100 teams, the native selector adds only that exact saved team/name so an unchanged save cannot silently replace it with all-eligible/null. This supports property 2,701 without loading the portfolio into the browser.

### Actionable Overview and related navigation

The live Overview selects at most three existing open/relevant tasks through GET /api/tasks/follow-ups. A linked lost/closed, leased or won lead or cancelled tour is no longer actionable. Current application/tour context must still match. Completing work removes it from this queue without fabricating replacement tasks; fewer than three actionable records yields fewer cards or an honest empty state. Longer queues remain on Tasks. Exactly four record-derived/unconfigured metrics and the approved spacious shell/card layout remain preserved.

Task details open the actual existing lead/contact/property route for their related record. Task detail additionally displays the exact application/tour UUID, matching saved status and recorded tour time where present. Application/tour links open the available canonical lead/contact context, where the saved summary/timeline/history can be reviewed; this stage does not create a new applicant/calendar workflow. Only true saved record links are used. Existing public scripted examples remain private-data-free.

### Durable in-app reminder lifecycle

The backend's independent worker starts on normal application startup and stops before the database pool. It runs immediately and approximately every 30 seconds without overlap. Missing task schema is a setup state, never a reason to seed/reset. The optional reminders:process command performs one deliberate pass using the same service.

Each pass reconciles a bounded batch, default 50 capped at 100. An eligible assigned actionable task has a unique reminder keyed by task, reminder_generation and recipient membership. Current due time controls delivery. One task_notifications row per reminder prevents duplicates across worker passes, concurrent workers or dashboard refreshes. GETs create neither tasks nor reminders.

Workers lock eligible task rows before reminder rows with SKIP LOCKED; current assignment, active role/property/interests/team context and relevance are rechecked before delivery. Per-delivery savepoints preserve failure attempts even if notification insertion fails. At most three attempts are allowed, with 30- and 60-second retry backoff before terminal failed state. Persistent delivery is in-app only; failure cannot trigger an email/SMS/provider fallback.

Task completion/cancellation, owner or due-generation changes, terminal lead stages and cancelled tours cancel stale reminders. Worker reconciliation also cancels lost eligibility/team/context. Inbox reads independently exclude stale/ineligible records, so an obsolete notification is not displayed while awaiting the next reconciliation. Task cancellation and nonactionable linked work do not invent a staff completion event.

Only the intended current recipient can snooze a delivered reminder. Allowed durations are 15 minutes, 1 hour and 1 day, at most three snoozes within seven days of the first notification's creation time. Snooze records an actor/time event and resets bounded attempts for that cycle; it does not duplicate the notification. Completion or changed assignment cancels snoozed work. Retry/snooze history remains persisted.

### Authenticated API and browser routes

All /api/tasks routes require real staff sessions, no-store responses, strict validation, parameterized queries and exact-origin protection for mutations.

| Method/path under /api/tasks | Behavior |
| --- | --- |
| GET / | My/Team/Unassigned directory with q/property/owner/team/status/priority/overdue/sort/page/pageSize. |
| GET /options; GET /related-options | Bounded eligible staff, routing configuration and typed related-record choices. |
| GET /follow-ups | Pure bounded maximum-three actionable records for Overview. |
| POST /; GET /:taskId; PATCH /:taskId | Create, scoped detail/history and versioned edit/assignment/complete/reopen/cancel. |
| GET /reminders | Recipient-only eligible delivered/snoozed in-app inbox, server-paginated. |
| POST /reminders/:reminderId/snooze | Recipient-only policy-limited snooze. |
| POST /teams; PUT /teams/:teamId | Organization-admin team configuration. |
| POST /routing-rules | Organization-admin property/team routing configuration. |

UI routes are /admin/tasks (My tasks), ?view=team, ?view=unassigned, ?view=reminders, ?view=routing, ?view=new and ?task=<saved UUID>. Search/filter/page state persists in URL queries. Normal login stays /admin/login; the retained configured origin remains http://127.0.0.1:7673 with API 3100 and the dedicated ootla_demo database on loopback PostgreSQL 55439.

### Verification and remaining scope

All 14 check:tasks backend groups passed in a uniquely owned scratch database; cleanup removed only that database. Coverage includes migration/old-column/password/time preservation, seven checksums, seed repeatability and normal-cookie role/tenant/property/all-interest guards; five typed links and SQL context guards; owner/version/history; paginated My/Team/overdue timezones; concurrent routing/unassigned behavior; pure max-three Overview reads; concurrent reminder deduplication; actual savepoint delivery fault with bounded retries/terminal failure/recovery; snooze count/absolute deadline; completion/owner/closed lead/cancelled tour/concurrent delivery cancellation; Stage 08 shared lifecycle and fresh backend/pool persistence/revocation. A fresh pool/backend is not an operating-system or PostgreSQL restart claim.

All eight isolated write-browser groups passed; their guarded scratch database and temporary loopback API/Vite/worker were removed. All four retained record-read-only groups passed on the actual 7673 origin, with only ordinary own-session/authentication audit writes. Native labels/keyboard, 320/390/768/1586px layouts, logout/private API denial and absence of external actions passed. The original three tasks remain unassigned. Desktop Tasks, mobile Reminders and desktop routing captures were visually inspected without layout issues. Two earlier browser-run issues were test-only locator ambiguity and inspection of a navigation-discarded response; those were corrected before the final passing run.

Additive migration 007 is applied exactly once to the retained isolated demo without reset/reseed. SHA-256 is d356996c0f4863dc2aedeea269712897b9a61866724a917f428760c51e97ce76. All seven database migration checksums match the files and migrations 001-006 remain unchanged. Every original column/count/MD5 aggregate in all 29 pre-stage tables matches, including users/password hashes/timestamps and the original three tasks, three properties, six separate units, three contacts and three leads. Environment/example/lockfile/public sources and admin CSS are unchanged. Frontend 7673 and backend 3100 are ready with normal HTTP 200 review URLs. The final build passed both TypeScript projects, the 144-module Vite client and compiled server without warnings. A bounded owned compiled production server without a database or deployment verified anonymous task-page redirects (302), ten task GET/POST/PATCH denials (401), public home/login/contact/privacy (200), unknown routes and private environment/server/migration paths (404), and absence of actual configured session/database secrets in client assets. Its owned child stopped without affecting the retained preview. No outstanding failures remain.

A final UI-only bounded-routing correction passed three focused loader/native Chrome cases: explicit property 2,701 omitted from the global first page, property-search-selected 2,701 and an out-of-page saved team with exact FormData value preservation. These checks made zero API/database writes. The prior 14 backend/eight isolated/four retained groups preceded this correction and were not broadly repeated. A separate bounded retained Chrome check confirmed all three Overview card IDs/titles/links exactly match GET /api/tasks/follow-ups and that the real header reminder link works; customer records were read-only with normal login/logout writes only. The final rebuild after this last UI correction passed both TypeScript projects, the 144-module Vite client and compiled server without warnings. The prior bounded compiled-server security smoke remains valid; server code did not change. No outstanding failures remain.

No dependency installation, environment/authentication rewrite, retained reset/reseed, external communication, AI execution, provider activation, payment or deployment is required. Synthetic demo records remain synthetic; in-app reminders are real local persistence. Full applicant/resident/calendar/provider workflows remain later explicit scope. Stage 09 is complete and awaits user review. STOP without advancing; completion is not approval.

## Stage 08 private lead workspace - historical completed snapshot

Stage 08 extends saved-lead detail in the shared admin shell. Stage 06 canonical contacts/households and Stage 07 interests/preferences/owner/stage/next action remain authoritative. New shared contracts are in shared/lead-workspace-contracts.ts; server/services/lead-workspace.ts owns scoped transactions, attachment validation, combined history, matching and simulation; server/routes/lead-workspace.ts mounts /api/lead-workspaces. client/pages/lead-workspace.ts, client/lib/lead-workspace.ts and scoped client/lead-workspace.css supply the detail. Existing lead pages/loaders compose these sections rather than replacing list/board/editors or Overview.

### Persistent identity and private authorization

Additive 006_lead_workspace.sql extends tasks with canonical contact_id, details, eligible owner, creator/completer actor/time and version. Backfill derives identity from the unchanged linked lead; an insert compatibility trigger supports explicit ordinary demo seeding. New lead_workspace_events stores private note/call/task/document/handoff events with actor/membership/time. New lead_documents stores private bytea attachments, name/type/size/SHA-256/uploader/time. Composite organization/property/lead/contact foreign keys preserve the same canonical history through application/lease/resident identity reuse; no new conversion/portal workflow is implemented.

Every workspace endpoint, including reads/downloads/suggestions, requires current leasing.manage and access to the primary property and every interest. Write transactions recheck active staff membership/grants and lock current rows; task owners must cover the same scope. Organization admin has no cross-tenant bypass. Wrong lead/document identifiers do not bypass authorization. Read-only/partial-interest staff retain basic Stage 07 facts with a private-workspace restriction notice; server projections remove private legacy notes/events/evidence references and note-search matches. Contact history similarly omits private lead history unless the viewer qualifies.

Versioned task edits prevent concurrent overwrite. Completion records actor/time and reopening clears current completion fields while append-only history remains. Staff decision records are follow-up/application-review notes, not screening decisions, application changes or lease verification. Call logs store direction/outcome/duration but place no call. Task due dates send no reminder.

### API, documents and bounded clients

All routes below are under authenticated /api/lead-workspaces/:leadId; mutations use origin protection, strict shared validation and parameterized transactional queries. Private responses use no-store.

| Method/path | Behavior |
| --- | --- |
| GET / | Existing lead/contact/households plus independently paged tasks/documents/timeline, first suggestions page, bounded owners and explicit AI simulation. |
| GET /timeline, /tasks, /documents, /suggestions | Independent server pages; default 25, maximum 100. Aggregate detail defaults to ten per panel. |
| POST /notes, /calls, /decisions | Private actor/time records without outbound/application/lease side effects. |
| POST /tasks; PATCH /tasks/:taskId | Create or version-check edits/assignment/completion/reopening. |
| POST /documents?name=<filename> | Raw validated PDF/PNG/JPEG/UTF-8 text bytes, maximum 2 MiB. |
| GET /documents/:documentId/download | Reauthorize exact lead/document and return private attachment bytes. |

UI route remains /admin/leads?lead=<saved UUID>. Independent timelinePage/tasksPage/documentsPage/suggestionsPage and workspacePageSize control server pages. Eligible owners are capped at 50 with disclosed total. Native section links/forms provide keyboard access. The new workspace never requests the legacy full demo snapshot.

Filename/extension/media type/content must agree. Checks reject unsafe path/control-character names, active HTML/SVG/executable masquerades, empty/oversize/compressed files, invalid UTF-8 and truncated images. Bytes stay privately in PostgreSQL; lists contain metadata/download paths, not contents. Downloads recheck full access and use attachment, private no-store, nosniff and sandbox headers. No public URL/inline renderer/object store exists. This is neither malware scanning nor full document-management/retention, provider submission, applicant approval or screening.

### Timeline provenance and provider boundary

SQL UNION combines workspace events, Stage 07 actor events, constrained simulated communications, viewing create/update records, application creation/audit history and trusted verified provider updates. Sort is occurred_at DESC then stable namespaced ID ASC before LIMIT/OFFSET. Synthetic records are labeled; viewing records do not confirm provider bookings or requested technician access. Lead stage movement still cannot approve an application or manufacture a lease milestone.

New provider_verified_updates references a dedicated external mapping and exact tenant/lead/contact/property context. A database guard requires matching provider/entity context and nonfuture verification; provider external event IDs are organization/provider unique. No browser write endpoint or live ingestion adapter is supplied. A staff note or external ID alone cannot become a verified provider event. The retained demo has zero trusted updates.

### Transparent suggestions and contextual AI

Rental matching uses only accessible currently available units satisfying explicit numeric budget, exact bedrooms and stated city/address locations. Availability source must be staff_reported/import/yardi, with nonfuture verification in the last seven days. Unknown/demo/unverified/stale/reserved evidence cannot qualify. Reasons explain the actual criteria/source/time, without protected-characteristic/eligibility scoring; free-text requirements are not interpreted.

Requested move-in date is context only and moveInDateConfirmed is always false. Dated future availability is unconfigured, so staff must confirm the exact date even for a current match. Sales returns an inventory/price setup state rather than treating rent as a sales price. All six retained demo units remain unverified, producing an honest no-verified-matches state.

AI mode is explicitly simulation: deterministic unsent staff guidance from saved lead context/current suggestions. No live model credential/inference, customer message, automatic appointment/decision, payment or provider action is configured.

### Verification and startup

Current review origin is http://127.0.0.1:7673, matching the preexisting preserved APP_URL; API remains 3100. scripts/dev-client.mjs reads the existing configuration, permits only loopback HTTP development, enforces the exact port and shuts down its own Vite server. The old hardcoded 5173 launcher caused an initial legitimate 403 sign-in origin denial; the launcher was corrected without changing .env, security or compiled production startup. Safe example default remains 5173 and historical snapshots retain earlier recorded URLs. The browser check reads APP_URL and blocks mutation of that retained origin even if presented with a plausible scratch name; the negative guard passed before any HTTP request.

All 13 focused backend groups passed in an owned scratch database; cleanup removed only that database. Coverage includes immutable prior migrations/old columns/passwords/timestamps, repeat seed compatibility, real-cookie roles/portal/tenant/full-interest scope and revocation, private notes/calls/actor history, eligible/versioned task persistence, canonical household/application/lease identity, attachment byte hashes/type/content/size/header/privacy denials, stable combined timeline pagination, trusted provider context/no browser-forged event, fresh verified suggestions without free-text scoring, explicit simulation and fresh backend/pool persistence. This is not an operating-system/PostgreSQL restart claim.

Migration 006 is applied once without reset/reseed. All eight isolated write-browser groups passed and their scratch database/servers were cleaned up. Original values/counts in all 26 prior tables, 85 protected source hashes and all six migration checksums match. Three old tasks gained contact links only in new columns; retained new workspace events/documents/provider updates remain zero. Final build passed both TypeScript projects, the 141-module Vite client and compiled server without warnings. All four retained record-read-only browser groups passed on the actual configured 7673 origin; only normal own-session/authentication audit writes occurred, with no retained notes/tasks/documents/customer writes. The final eight isolated groups covered persisted notes/call direction-outcome-duration/tasks/completion-reopening/handoffs, protected exact-byte downloads, labeled timeline transitions/recorded viewing time, positive preference/verified-availability reasons with unconfirmed date, server paging, 320/390/768/1586px keyboard/reduced-motion layouts and the unchanged four-metric/three-card Overview. Desktop/mobile captures were visually reviewed. Commands are check:lead-workspace, check:lead-workspace-browser, check:lead-workspace-browser:preview and build. Other checkouts need only db:migrate; if stopped, use db:local then dev. An owned temporary compiled production server without a database/deployment verified saved-lead page login redirects, anonymous denial of every workspace/document read and raw upload, public-route success and unknown-route 404s; it was closed. Actual session/database secrets are absent from compiled client assets. Development guards also rejected an occupied configured port and nonloopback origin without affecting the retained preview. Current health is ready. No dependency/environment/authentication rewrite, retained reset/reseed, outbound action or deployment is needed. Stage 08 is complete; STOP for user review without advancing.

## Stage 07 lead and opportunity foundation - historical completed snapshot

Stage 07 extends the same vanilla Vite/TypeScript, Express/TypeScript and PostgreSQL application. `shared/lead-contracts.ts` owns strict input/output contracts and both stage vocabularies. `server/services/leads.ts` owns authorized transactions, bounded SQL, graph/evidence checks, duplicate suggestions, source authority, record versions and events. `server/routes/leads.ts` mounts authenticated `/api/leads`. `client/pages/leads.ts`, `client/lib/leads.ts` and scoped `client/leads.css` render/load the dedicated list, board, creation and detail/edit workspaces in the existing admin shell.

### Persistent model and application boundaries

Additive migration `005_lead_pipeline.sql` extends existing leads with `pipeline_stage`, `owner_membership_id`, `source`, `preferences`, `next_action`, `next_action_at`, optimistic `version` and paired application-summary ID/status. It adds `lead_property_interests`, append-only application-written `lead_events` and immutable `lease_verified_milestones`. Existing lead status/display/email/identity/timestamps are preserved; canonical contact fields supply display identity. Stage 03 fixture records receive demo source and next action copied from their earliest existing open task. Legacy Qualified conservatively maps to Contacted rather than inventing application progress; the retained pipeline has two Contacted and one Tour scheduled record, with existing legacy statuses untouched and owners initially unassigned. No retained reseed/reset or historical-event fabrication occurs.

Composite tenant/contact/property foreign keys protect interests and lease verification. The primary property is always an explicit interest; all additional interests require canonical contact-property links. Existing shared contact identities are reused only by explicit choice. Opportunity primary property/contact/intent are immutable through lead update to preserve child application/lease identity. Editable contact identity stays on the established Contacts page.

Leasing uses the nine requested stages; sales uses seven independent stages and never requires rental applications/leases. `leadStageGraphs` defines allowed forward/backward/reopen edges. Input cannot assign an arbitrary stage in a generic update. Version, current actor grants, all current/requested property interests, valid unit and eligible owner's current organization/property access are rechecked in the write transaction. A caller with only partial interest access receives redacted interests and read-only detail; writes must cover the full scope. Writes use origin protection, strict JSON/Zod, parameterized SQL, persistent actor/membership/time events and audit records.

Applications retain draft/submitted/staff_review status. `syncLeadApplicationSummary()` runs inside the application creation/edit/reassignment transaction and refreshes affected lead summaries from their latest linked application, recording version/event changes only when the summary changes. Lead transitions never write application status. The saved status rank gates Application started, Application submitted, Staff review and Lease pending; a later real status can satisfy earlier prerequisites. The application/lease pages remain setup states, not completed staff workflows.

Leased is available only for a valid `lease_verified_milestones` snapshot: the same organization/lead/contact/property/unit, an active local lease with a nonnull start date, an unchanged PostgreSQL `updated_at` version and no source ownership/Yardi mapping. An organization admin/property manager explicitly confirms documentary evidence through the API; this records the actor, evidence reference and exact database timestamp. Lease edits invalidate the snapshot through version comparison, including submillisecond differences, without deleting prior evidence. A fresh explicit verification may create a new snapshot. Provider-owned leases require an authoritative future integration; this stage never locally certifies them. The lead UI displays verification but does not implement a full lease verification/workflow editor.

### Routes, payload bounds and navigation

| Authenticated API under `/api/leads` | Behavior |
| --- | --- |
| `GET /` | Search, intent/stage/property/owner/source/next-action filters, sorting, pagination and aggregate stage totals; default 25, maximum 100 records. |
| `GET /options` | Bounded server-searched eligible owner/unit/property choices. |
| `GET /duplicate-suggestions` | At most ten scoped canonical contacts with explicit name/email/phone match reasons; no merge or writes. |
| `GET /follow-ups` | At most three accessible nonclosed opportunities, ordered by recorded next-action date, for the preserved Overview. |
| `POST /`, `GET /:leadId`, `PATCH /:leadId` | Persistent creation/read/versioned editing; primary identity/intent remain fixed. |
| `PATCH /:leadId/stage`, `GET /:leadId/events` | Graph/evidence-authorized stage change and paginated persistent action history. |
| `POST /:leadId/lease-verification` | Explicit authorized local milestone evidence; no lease execution or provider call. |

UI routes are `/admin/leads`, `?view=new`, `?lead=<saved UUID>`, `?view=board&intent=leasing` and `?view=board&intent=sales`. Search/filter/page state is in URL queries, and direct refresh reloads real records. Board columns render only the selected server page; column totals refer to all filtered records. Native select/buttons provide keyboard stage controls; no unrestricted drag bypass exists. Owner/unit/property choices are bounded to 25 by the browser and offer server search before unsaved edits. The edit page explicitly associates an existing contact with selected properties before saving new interests.

Lead workspaces never request the legacy full demo snapshot. Existing Overview Add lead/View all leads route to real dedicated tools; current follow-up data remains bounded to three and approved shell/metric/card composition stays intact. Applications/Leases signed remain null/unconfigured; New leads/Tours booked retain their real record-based metrics. Tour scheduled is a CRM stage, not a booked viewing or calendar invitation. The existing property lead list and canonical-contact history now project the current pipeline; history includes real lead events with actor/time. Public homepage examples remain illustrative and contain no private lead data.

### Verification, startup and remaining scope

`check:leads` passed 12 focused groups in an owned scratch database, then removed it. Coverage includes pre-005 application/legacy preservation and immutable 001-004 checksums, repeat seed compatibility, five real-cookie roles, eligible ownership/all-interest permissions, both graphs/events, atomic application summary/reassignment, immutable/microsecond-matched lease evidence and source guards, duplicate choice without merges, 251-lead pagination and fresh-backend-instance persistence/revocation. The additive retained migration is applied once without reset/reseed. Final build passed both TypeScript projects, the 137-module Vite client and compiled server. All seven isolated write-browser groups and four retained record-read-only groups passed, including real create/edit/owner/stage refresh persistence, actor/time canonical history, explicit duplicate sales identity reuse, 320/390/768/1586px native keyboard/reduced-motion behavior and preserved four-metric/three-card Overview actions. Owned scratch databases/servers were cleaned up.

`check:lead-browser` uses `scripts/check-lead-browser-isolated.ts` to verify the project-owned local cluster/restricted role, create one UUID-named scratch database, migrate/seed only that scratch, add an owned eligible agent, run its own loopback API/Vite and invoke the browser checks. Cleanup stops only owned servers and drops only its owned database. `check:lead-browser:preview` performs record-read-only checks on the existing review preview, plus normal login/logout. Neither starts paid CI, uses production data or sends communications. The separate retained preview run performs only normal authentication session/audit writes; no customer record writes. Source/data preservation passed for 75 protected files, all 18 original table counts/old-column values and all five migration checksums. Compiled temporary production-route/anonymous-API smoke and client-secret absence passed; its owned server closed. The retained demo remains three properties/three leads/three contacts/six units, with no test customer data. Desktop list/board and mobile detail were visually reviewed; current preview/database health is ready. No outstanding verification failures remain.

Migration 005 is already applied locally. Other existing checkouts run `npm.cmd run db:migrate`; if stopped use `npm.cmd run db:local` and `npm.cmd run dev`. No dependencies/environment/authentication rewrite is required. Full application/lease/screening/resident/scheduling/provider workflows, AI execution and outbound communication are outside this stage. Stage 07 is complete, awaiting user review. STOP; do not advance automatically to Stage 08.

## Stage 06 property and contact foundation - historical completed snapshot

Stage 06 extends the existing vanilla Vite/Express/PostgreSQL application, preserving the approved overview and earlier public/authentication features. `shared/property-contracts.ts` contains strict shared validation/DTOs; `server/services/property-foundation.ts` owns scoped queries, transactional authorization, ownership checks and audits; `server/routes/property-foundation.ts` exposes `/api/property-foundation`. `client/pages/properties.ts`, `client/lib/property-foundation.ts` and scoped `client/property-foundation.css` render/load the dedicated property/contact workspaces through the existing admin shell.

### Persistent model and identity

Additive migration 004 introduces `organization_data_settings`, `property_groups`, `contacts`, `contact_property_links`, `households`, `household_property_links`, `household_members`, `applications`, `leases` and `external_record_mappings`. It extends existing properties/units with provenance and existing leads with required `contact_id`. Original migrations 001–003 and prior columns are preserved.

A property has name/address/city/type, optional group, source and source-owned field names. Units remain separate records with label, bedrooms, available/reserved/occupied status, monthly rent and availability source/nullable verification time. `PropertySummary` separately reports `unitCount` and `availableUnitCount`; availability source is derived from actual units, and aggregate verification remains null when any unit is unverified.

Each prior lead receives a distinct canonical contact using the existing lead UUID and copied name/email/timestamps. Email is intentionally nonunique. Contacts carry displayName/email/phone/source, explicit property associations and shared household membership; history joins leads/applications/leases/activity only within current scope. A compatibility insertion trigger reuses explicit seed identities before INSERT-conflict handling, preventing orphan contacts on repeated seeding; it never merges by email.

Applications are minimal contact/property/unit/optional household/lead relationships with draft/submitted/staff_review status. Leases add optional application, draft/active/ended status and nullable date-only startsOn/endsOn. Composite organization/property/contact/household/member foreign keys prevent mismatched relationships. These are persistent identity foundations and bounded APIs, not full application/residency workflows, a staff UI for those workflows, screening or payment processing.

External provider IDs live only in the dedicated mapping table. Exactly one typed property/unit/contact/application/lease foreign key matches each entity type, with organization/provider/entity uniqueness. Creating a mapping does not call a provider.

### Current authorization and source authority

Existing opaque cookie sessions, Argon2id passwords, organization memberships and current role grants remain authoritative. New router requests require `properties.read`; mutations additionally protect origin and recheck current staff grants/membership under transactional locks. Property/group creation and external mapping administration use `property_access.manage`; property/unit editing uses `properties.manage`; contact/household/minimal relationship writes use `leasing.manage`. All writes audit their action. Organization admins remain scoped to their organization; others need explicit property assignments.

Contact/property links and household/history results are filtered to visible properties. Nonadmins cannot edit a shared identity whose property links extend beyond their access; its identity fields are reported read-only. The same constraints apply to household membership/relationship writes. Hidden mappings are not returned to ordinary staff.

`organization_data_settings.mode` is standalone or yardi_connected; its `yardi_owned_fields` JSON policies use shared camelCase field names. Records have `source_system` local/demo/import/yardi and typed `source_owned_fields`. Effective ownership combines explicit record fields with configured policy when the record is Yardi-sourced or Yardi-mapped in a connected organization. Updates to owned fields fail with `409 SOURCE_OWNED_FIELD`, including the retained legacy `PATCH /api/properties/:id` path. An unmapped Ootla-owned local record can still be created without writing a provider. No configuration UI, sync activation or actual Yardi request is added.

Verification timestamps are evidence, not record creation times. Migration leaves legacy unit verification null; demo/unknown evidence cannot claim a verification time, future verification is rejected, and availability/status-source changes clear stale verification unless explicitly supplied. No verified provider/payment status is fabricated.

### Bounded routes and clients

All routes below are under authenticated `/api/property-foundation`:

| Resource | Supported foundation operations |
| --- | --- |
| `/properties`, `/properties/:propertyId` | GET directory/detail, POST property, PATCH permitted fields. |
| `/groups` | GET visible groups, POST a group. |
| `/properties/:propertyId/units`, `.../units/:unitId` | GET paged units, POST, PATCH permitted unit fields. |
| `/properties/:propertyId/leads` | GET paged linked leads with canonical contact names/emails. |
| `/contacts`, `/contacts/:contactId` | GET directory/detail, POST, PATCH permitted identity fields. |
| `/contacts/:contactId/properties`, `.../history` | POST explicit idempotent accessible-property association; GET paged scoped history. |
| `/households`, `/households/:householdId/members` | GET paged households, POST household, POST explicit member. |
| `/applications`, `/applications/:applicationId` | GET/POST minimal relationships, PATCH permitted fields. |
| `/leases`, `/leases/:leaseId` | GET/POST minimal relationships, PATCH permitted fields/date-only dates. |
| `/external-mappings` | GET paged typed mappings, POST same-organization provider identifier. |

There are no deletion endpoints. Default pageSize is 25, maximum 100. The property directory accepts q/city/groupId/type/source/availability/sort/page/pageSize. q searches name/address/city; sort is name_asc/name_desc/city_asc/created_desc; availability is available/unverified. Detail units/leads have independent client page controls. Assigned staff is bounded to 50 with staffTotal. Contacts accept q/propertyId/page/pageSize, with bounded property lookup when creating an identity.

`/admin/properties?property=<saved UUID>` and `/admin/contacts?contact=<saved UUID>` reuse the approved shell with dedicated tools on their own pages. Property/contact workspaces do not request `/api/demo/data`. The retained private Stage 03 snapshot is limited to `stage03.%` seed keys and reads canonical contact name/email, so optional bulk fixtures never become an unbounded overview payload. Overview markup/CSS/sidebar/metrics remain preserved; minimal application/lease tables do not fabricate configured dashboard metrics.

### Optional volume and verification status

`scripts/seed-property-volume.ts` is exposed as `demo:volume`; it is never imported by startup/ordinary seed. It permits only verified isolated nonproduction demo databases through `ootla` on 127.0.0.1:55439 with exact database confirmation. Dry-run writes nothing; stable fixture IDs and ON CONFLICT add only missing synthetic records, preserving edits. Fixtures use demo source and null verification, separate property/unit counts and no leads/messages/provider/payment actions.

Migration 004 is applied to the retained local demo: original 3 properties/6 units/3 leads remain and 3 canonical contacts were backfilled; no retained volume/household/group/application/lease was created. Final build passed both TypeScript projects, the 38-module Vite client and compiled server. All ten backend scratch groups passed, including 2,701 distinct properties/17 units over 28 server pages, strict scope/source rules, preservation, repeat seeding and fresh-backend persistence; the scratch database was deleted. Six focused browser groups passed at 320/390/768/1586px, including keyboard/native read-only forms, normal cookie sign-in/refresh/logout, server filters/pagination, no demo-snapshot request on new routes and preserved four metrics/three overview cards. Browser form writes were deliberately omitted on the retained demo; scratch APIs verified create/update persistence. The initial 320px header overflow was fixed only on new workspace routes and rechecked.

All 51 protected source hashes match; deliberate seed-metadata additions were reverse-compared with the original baseline. Counts and original-column values in all ten retained tables remain unchanged, and all four applied migration checksums match. The retained demo has three contacts, zero groups/households/applications/leases/mappings and null verification for all six units. The optional 3,000-property/6,000-unit retained dry-run passed without writes; actual volume was not generated. Bounded compiled production-server smoke, without a database/deployment, verified new admin redirects, API 401s, public-page 200s and unknown-page/API 404s; its owned process closed. Client assets contain neither the actual session secret nor database password. Current retained preview health is ready. Stage 06 is complete with no outstanding verification failures, awaiting user review; STOP with no Stage 07.

## Stage 05b platform and integrations - historical completed snapshot

Stage 05b extends only public content/navigation in the established vanilla Vite application. It preserves earlier homepage/workflow examples, protected admin, real backend authentication and saved records. Final source integration/build, six focused browser groups, bounded compiled smoke and source/data preservation passed. The contact-input gap is resolved: the user approved hello@ootla.ai. The final approved-contact build and bounded contact-only checks passed; only user review remains pending.

The integrations page uses the exact “Yardi-ready integration.” hero and seven distinct coded illustrations: Yardi property/customer records, Calendar, Analytics acquisition, standalone customer/history import, applicant portal, maintenance and provider payment handoff. A public Yardi-connected/Standalone selector only changes browser-local illustrative content; no API/storage/organization/provider configuration occurs.

No Yardi certification/live connection is claimed. Activation requires the client's licensed interfaces, permissions and configuration; exact interface details remain unresolved. Calendar/Analytics/import/portal/maintenance/payment examples are not live services. Payment remains with the existing provider, and verified status is unavailable without a configured verified source.

The platform page explains Leads, Viewings, Applications and Operations with actual links to the Stage 05a public workflow pages. Actual sources are `client/pages/integrations.ts`/`client/integrations.css` with `client/lib/onboarding.ts`, and `client/pages/platform.ts`/`client/platform.css`. Shared public navigation imports these modules without changing the protected application.

Shared navigation and supporting contact/privacy information may use only verified facts. The user approved hello@ootla.ai on 2026-10-21; no company/legal identity or policy guarantee is inferred from the address. Do not invent delivery APIs or policy guarantees. Supporting `/contact` and `/privacy` are real direct/SPA/footer destinations from `client/pages/public-information.ts`/`client/public-information.css`. `client/lib/site-information.ts` now returns the label `hello@ootla.ai` and href `mailto:hello@ootla.ai` from `publicContact()`. Clicking opens the visitor email client only; no SMTP, submission backend or delivery-success state is added. No email was sent or deliverability tested.

Privacy is scoped to the current development preview: public scripts use memory and self-hosted assets without activated analytics; real staff sign-in uses eight-hour HttpOnly/SameSite sessions, authentication audits and synthetic database records. It does not invent a legal entity or compliance guarantee. Express only adds /contact and /privacy to its public production allowlist; integrations/platform were already allowed.

`scripts/check-public-platform.mjs` is exposed as `npm.cmd run check:public-platform`. All six groups passed: 97 activated link/CTA occurrences across 20 destinations, two onboarding paths/manual keyboard/reset/abort behavior, 320/390/768/1280/1586px layout, 680 rendered contrast samples, reduced motion and no private/tracking/provider/external/mutating requests or storage/cookies. Login testing only read normal configuration; it did not sign in or write data.

After a cosmetic Contact/Privacy title-punctuation correction, final build and bounded compiled Chrome smoke passed for all four pages/titles/assets and protected/unknown-route behavior. The full six-group suite was not repeated. Fifty protected files, all ten retained table counts/SHA fingerprints and three migration checksums match; compiled output exposes no actual secrets. The approved contact is configured and verified by final build/contact-only follow-up. The exact mailto was inspected without activation or sending; 320/390/1586px layout, visible keyboard focus, Privacy-to-Contact SPA navigation and 42 contrast samples passed with no API/external/mutating requests, browser errors, cookies or storage. Built output contains the mailto and no actual server secrets. The six-group suite/97 links/680 samples preceded this email change and were not repeated. No technical/configuration blocker remains for Stage 05b. No schema, migration, seed/reset, dependency installation, environment change, deployment or external communication belongs to Stage 05b.

## Stage 05a public workflows - historical completed snapshot

Stage 05a adds public AI/workflow information and scripted demonstrations, preserving the existing vanilla Vite frontend and Express/PostgreSQL application. Final build, seven focused groups, bounded final focus/CTA checks and source/data preservation passed. Stage 05a is complete and awaits user review; no later stage started.

Source boundaries:

- `client/pages/ai-workflows.ts` renders the public AI page and examples.
- `client/pages/workflows.ts`/`client/workflows.css` render leasing and resident-support detail pages. `client/public-pages.css` provides shared public-detail layout styles.
- `client/pages/ai-demo.ts`, `client/lib/ai-demo.ts` and `client/ai-demo.css` define immutable public scenario snapshots, local manual progression and scenario styling.
- Main/public routing, header/footer and a native details menu expose the three pages; scenario listeners initialize only on `/ai-workflows` and clean up through route AbortSignal.
- Express adds only `/workflows/leasing` and `/workflows/resident-support` to the production frontend allowlist. No API, authentication, database or provider service is added.
- `npm.cmd run check:public-workflows` runs the focused public-page/scenario suite. Seven groups passed before the last focus/CTA fixes; bounded follow-up and checker syntax passed afterward. The complete suite was not repeated.

The three scenario IDs resident/reminders/viewing each contain five manual steps, indexes 0–4. Next advances, replay and selecting a scenario reset local memory; state is not saved in storage. There are no scenario requests/timers/model calls/outbound actions. The displayed action history is only the advanced script, not a backend audit log.

The resident script starts “My bathroom fan has stopped working.” It asks which room and when access is possible, then records main-bathroom access Thursday 14:00–16:00 as requested preference only. Index 3/displayed Step 4 creates the illustrated DEMO-104 request with Awaiting assignment, Technician Unassigned, Appointment Not scheduled; index 4 adds a staff-review/assignment task. Neither step assigns a technician or confirms a visit.

Staff reminders and prospect viewing requests keep review/availability/confirmation with people. The leasing page explains inquiry → viewing request → application → staff review. Resident support explains requests, staff assignments, unsent updates, renewal review and provider payment handoff with verified status unavailable. No actual request/message/calendar booking/upload/screening/payment/renewal is submitted.

Preservation passed for 34 protected files, homepage/admin/authentication/shared/schema/environment/lockfile and all ten retained record-table counts/hashes. The only intended Express source difference is the two new frontend allowlist paths; original UTF-8 encoding was retained. All three migration checksums match. Compiled output exposes no actual database/session secrets.

Ephemeral loopback compiled-Express smoke, without a database/deployment, passed all three new pages plus homepage/login, protected-admin redirect and unknown page/asset/API 404 behavior. Current public pages are 200, database health is ready and anonymous current-user access is 401.

Public scenario checks saw no API/model/provider/mutating/external requests, cookies or local/session storage. The real login link intentionally reads /api/config without sign-in/database writes. Caption contrast, cross-page public fragment scroll/focus, final Next-to-Replay focus and the leasing CTA label were corrected. Final build and bounded follow-up passed for all desktop scenarios, completed resident on mobile, Replay reset and leasing fragment focus; the original seven groups were not repeated afterward.

## Stage 05 public homepage - historical completed snapshot

Stage 05 is a public-only extension of the existing application. It preserves the actual Stage 04 protected admin interface, normal authentication, PostgreSQL schema and retained demo records. Source integration, the full build, seven focused functional browser groups and protected-source/data preservation passed. The scoped disclosure-color correction, final build and targeted rendered contrast passed; Stage 05 is complete and awaiting user review.

Public source boundaries are:

- `client/pages/home.ts` and `client/home.css`: requested hero copy/layout, public typography and six alternating text/visual workflow sections.
- `client/pages/home-preview.ts` and `client/home-preview.css`: inert public rendering of the real `adminShell` at fixed 1480px desktop size, clipped at the right viewport edge with preview-only overrides. The actual admin source/style files are preserved.
- `client/pages/public-workflow.ts`, `client/lib/public-workflow.ts` and `client/public-workflow.css`: three-step illustrative enquiry/viewing/staff-review content, manual/keyboard selection, optional native intersection enhancement and reduced-motion handling.
- `scripts/check-homepage.mjs`, exposed as `npm.cmd run check:homepage`, verifies seven focused homepage/browser groups without replacing or rerunning the legacy broad browser suite. Optional `npm.cmd run check:homepage -- --contrast-only` performs bounded rendered-text verification.
- Existing `public.ts` navigation points Sign in and Explore demo to the real `/admin/login`. Homepage initialization is connected only to the public homepage and uses route AbortSignal cleanup.

The six separate stories cover resident AI replies, staff reminders, Google Calendar/viewings, applicant documents/staff review, Yardi readiness and standalone imports. They are illustrative product direction, not live integrations.

The preview imports the existing coded shell rather than recreating a static screenshot. Public-only invented Alex Morgan/Casey Taylor/Robin Lane records derive three example leads and two tours; applications/leases remain null. There is no current-user/private-dataset API call. The preview is inert and aria-hidden; inner main/h1 markup is converted to avoid duplicate page semantics. Full-size dashboard typography and geometry are retained without scaling. At 900px and below, the 1480px preview sits below the copy in normal flow within a clipped 430px-high frame, correcting the initial mobile overlap without shrinking it.

The native workflow controls support click, arrow keys, Home/End and browser Enter/Space behavior. The optional observer follows visible story steps when motion is allowed. Runtime reduced-motion preference changes disconnect the observer and disable sticky/transition behavior; abort disconnects observation/listeners. Content/manual controls remain readable and usable without automatic motion.

No server/API/schema/seed/environment/dependency/production communication change belongs to Stage 05. Stage 05 preservation checks confirmed the actual admin/login/global styles, all server/shared/migrations, environment/lockfile/logo and all ten retained record-table fingerprints are unchanged. Seven dedicated functional groups passed, including private-data isolation with a staff cookie and normal admin smoke. Independent review identified low-contrast small disclosures and the scoped public text colors were corrected. A targeted follow-up passed 171 text nodes at 1586px/390px with minimum small-text contrast 4.58:1, checking all three workflow panels. The corrected source also passed the final build. The seven functional groups passed before this CSS-only follow-up and were not repeated; targeted mode produced no sign-in/database writes, private API call, external request or browser error.

## Stage 04 approved dashboard - historical completed snapshot

Stage 04 implements only the 1586 by 992 approved dashboard image now supplied in the conversation. That image is authoritative despite its raster binary not being saved locally. Prior missing-reference statements are historical. The original logo source remains unavailable; the existing roof/O vector is retained and aligned to the image's admin wordmark without an added dot.

Source additions extend the current application rather than replacing it:

- `server/services/dashboard.ts` and shared `DashboardSummary`/`DashboardPeriod` contracts provide authenticated month/week/all metrics.
- `client/pages/dashboard.ts` reads existing saved leads, actual stages, property/unit descriptions and earliest open linked tasks for three follow-up cards.
- The shared admin shell and separate `client/admin.css` implement the approved full-width rounded charcoal header, top navigation, Overview title/period selector, four metric labels, sidebar beneath the header and spacious follow-up workspace. Public/login global styles are preserved.
- Read-only lead-detail/search/filter routes make visible navigation useful; Add lead remains an explicitly pending workflow.
- `scripts/check-dashboard.ts`, exposed as `npm.cmd run check:dashboard`, checks period boundaries, tenant/property scope, validation and original-data preservation.
- Self-hosted `public/fonts/InterVariable.woff2` and its `Inter-LICENSE.txt` provide the `Ootla Inter` family scoped to admin/the coded hero preview. The Inter Project font uses SIL Open Font License 1.1; no remote font request or npm dependency is added.

The exactly four visible metric labels are New leads, Tours booked, Applications and Leases signed. The overview has no chart, activity feed, AI panel or integration widgets. Those detailed tools remain on dedicated pages. The four backend groups, full build, nine extended browser groups, captured reference comparison, preservation and final focused QA passed. Top navigation is centered within 2px; layouts contain navigation/cards at 320/390/768/1586px. Mobile filter/period selection retains open-menu state and control focus; Escape returns focus to the menu button. Normal login preserves an allowed lead-detail query, while external return targets fall back to /admin. No browser errors/external requests occurred; test-owned sessions were revoked. The broad nine-group suite was not repeated after focused fixes; targeted QA and updated browser-script syntax passed. Stage 04 is complete, awaiting user visual review; no later stage started.

No database migration, seed/reset, authentication replacement, environment/dependency change, external communication or deployment is part of Stage 04. Existing synthetic records and secure organization/property boundaries are preserved.

## Stage 03 isolated-demo extension - historical completed snapshot

Stage 03 completed verification on 2026-10-21 (Africa/Lagos). This historical snapshot records its isolated-demo scope and evidence; current dashboard changes are recorded in Stage 04 above. The same Vite/vanilla TypeScript, Express, PostgreSQL, Argon2id and server-managed session architecture is preserved; no dependency version or frontend framework is added.

Current source changes add:

- `migrations/003_demo_dataset.sql`: a demo-identity marker, separate demo units/leads/tasks/viewings/simulated activities and ownership records, plus descriptive property fields.
- `server/services/demo-environment.ts`: actual database identity and isolation checks, marked/password-matching demo-account readiness.
- `server/services/demo-seed.ts` and `demo-data.ts`: explicit idempotent seed/confirmed reset and scoped read-only sample loading.
- `scripts/reset-demo.ts`, `scripts/check-demo.ts`, `scripts/check-demo-restart.mjs` and root `demo:reset`/`check:demo`/`check:demo:restart` commands.
- `client/pages/demo.ts`: database-backed read-only sample views within the existing admin shell.

Persisted sample records after explicit seeding are three properties, six separate units, three named leads (Maya Chen, Jordan Ellis, Priya Shah), three tasks, two viewings and three simulated activity entries. These are synthetic PostgreSQL records, not a live portfolio or customer communication history. The overview now queries actual organization/property-scoped counts; applications remain an explicit zero placeholder.

Stage 03 passed migration/explicit repeated seed and build verification, nine demo-check groups, 12 authentication groups, 12 compatibility groups, five browser groups and four actual-restart groups. Twenty owned sample rows persist, original identity/password/membership values and immutable 001/002/environment/lockfile data are preserved, and owned scratch/test fixtures were cleaned up. See [progress](ootla-progress.md) for exact outcomes and limits. No later stage was included in that Stage 03 scope.

## Stage 02 authentication and authorization extension - historical snapshot

Property grants require an active staff account and membership. Admins may revoke retained assignments for inactive members/accounts without reactivating them; actor permission, organization scope and audit checks still apply. This offboarding case is included in the focused checks.

Completed 2026-10-21 (Africa/Lagos), awaiting user review. The existing Prompt 00/Stage 01 Vite, Express, PostgreSQL and secure session architecture is retained. This Stage 02 snapshot and the Stage 01 snapshot below record what existed then; the schema, roles and API sections later in this document include the current Stage 03 source changes.

Stage 02 adds:

- `migrations/002_staff_roles_property_access.sql`: additive persistent roles/permissions, staff identity constraints, property identities and scoped assignments.
- `server/routes/staff.ts`: permission-checked membership, property identity, assignment and audit APIs.
- `scripts/check-auth.ts` and root `check:auth`: focused real PostgreSQL/authentication/authorization verification.
- Extensions to the existing session service, readiness checks, Express composition and shared contracts. The existing sidebar now reads the current role label; no page redesign was required.

No new framework, dependency version, production deployment, external integration or real property portfolio was introduced. Original users, password hashes, organization/membership records and legacy roles are retained; migration 001, environment files, lockfile and seed script are unchanged.

The Stage 02 build, 12 authentication/authorization groups, 12 foundation compatibility groups and live Chrome sign-in/API/refresh/logout checks passed. Original-record fingerprints and applied migration checksums matched, and temporary fixtures were removed. See [progress](ootla-progress.md) for exact outcomes and manual review steps.
## Stage 01 verified repository baseline - historical snapshot

Verified on 2026-10-21 (Africa/Lagos) against the actual files and running application. The architecture document already existed from Prompt 00; this stage updates it rather than recreating the application. The repository is `C:/Users/user/Documents/software/Ootla`. No repository-local AGENTS.md was found. The shared-directory AGENTS.md explicitly applies only to EpiScribe sibling repositories and does not govern Ootla.

### Actual structure

~~~text
Ootla/
  package.json, package-lock.json       One ESM package; pinned npm dependencies
  vite.config.ts                       client root, public assets, /api proxy
  tsconfig.client.json                  Strict frontend/shared type check
  tsconfig.server.json                  Strict NodeNext server/shared/scripts build
  client/
    index.html, main.ts, styles.css     Vanilla HTML/TypeScript/CSS; history router
    lib/api.ts, lib/ui.ts               Fetch, shared API types, reusable UI helpers
    pages/public.ts                    Homepage/platform/AI-workflows/integrations
    pages/login.ts                     Backend-confirmed demo fill and normal login
    pages/admin.ts                     Overview and dedicated module setup pages
  server/
    index.ts, app.ts                    Startup/shutdown, Express routes and static serving
    config/env.ts                      Server configuration validation
    db/pool.ts                         PostgreSQL pool, transactions, readiness
    middleware/security.ts             Origin protection and login rate limiting
    services/passwords.ts, sessions.ts  Argon2id passwords and database sessions
    http/errors.ts                     Safe API errors
  shared/contracts.ts                  Shared types and Zod request validation
  migrations/001_foundation.sql        Existing immutable foundation schema
  scripts/
    setup-env.mjs, local-db.mjs         Non-overwriting env setup; isolated PostgreSQL
    migrate.ts, seed.ts                 Explicit migration/seed, never automatic at startup
    check-foundation.ts                Existing focused API/database checks
    check-browser.mjs                  Existing browser checks
  public/ootla-mark.svg                Provisional editable brand asset
  design-reference/README.md           Approved-source inventory and visual limitations
  docs/                               Brief, architecture and progress
  .local/postgres/data/                Ignored project-owned development database
  dist/client/, dist/server/           Ignored generated frontend/backend output
~~~

### What works, what is reused and what needs replacement

| Area | Verified existing behavior | Stage 01 decision |
| --- | --- | --- |
| Frontend | Vite 8.3.4, TypeScript 5.9.3, HTML/CSS/vanilla page modules; no React or other frontend framework. Public navigation and protected-page rendering work. | Reuse unchanged; no framework replacement. |
| Backend | Express 5.3.0, TypeScript, same-origin `/api` in development via Vite; production compiled/static route allowlist. | Reuse unchanged; no backend replacement. |
| Database | Real PostgreSQL 18.6 connection as non-superuser `ootla` to isolated `ootla_demo` on loopback port 55439. Six foundation/runner tables exist; `001_foundation.sql` is applied and its checksum matches disk. | Preserve data/schema and runner. No migration or reseeding needed for this retained installation. |
| Authentication | Normal demo credential login, HttpOnly session, current user, active organization membership, cross-organization denial, logout/revocation and protected refresh verified in the browser/API. | Reuse unchanged. No authentication replacement or password reset. |
| Development startup | Existing `npm run dev` starts watched Express at 127.0.0.1:3100 and Vite at 127.0.0.1:5173. Existing env setup preserves .env; db:local reuses the retained project-owned cluster. | No startup code fix required. Existing strict port handling prevents silently changing the browser origin. |
| Visual system | Existing tokens, public/admin layouts, cropped coded dashboard and honest setup states. | Preserve working UI. Original approved logo/admin-image files remain unavailable; provisional artwork is recorded rather than replaced in this stage. |
| CRM/provider modules | Leads, properties, applications, calendar, tasks, analytics, AI and integration pages are setup states. No corresponding CRM tables or live provider/simulator implementation exists. | Later explicit stages must implement these boundaries; do not treat them as functional or start them in Stage 01. |

No runtime or repository dependency is missing from the installed manifest/lockfile. `npm ls --depth=0` resolved every declared package. Runtime dependencies are express, pg, argon2, zod and dotenv; development dependencies include Vite, TypeScript, tsx, concurrently, Node/Express/pg typings and Playwright. Node.js 22.22.0 and npm 10.9.4 are installed. The matching bundled Playwright Chromium is optional and absent; focused Stage 01 checks used installed Chrome successfully, with no browser download or new dependency.

Git is initialized, and the initial source tree remains uncommitted/untracked as found. Stage 01 does not stage, commit, push, reset or remove that existing work. No production deployment configuration or external communication was changed.

### Startup and focused verification

`npm run build` passed, including both frontend/backend type checks and builds. The existing .env.example was reviewed and retained: it contains credential/session placeholders and the intentionally public isolated-demo credentials, with no actual database/session secret. Ignore checks cover .env, .local, node_modules and dist. The actual .env was preserved.

The retained database was queried without schema changes. Before/after fingerprints of organization, user and membership records matched, including the stored password hash. Browser smoke checks verified public routes, the `/api` proxy, database health, unauthenticated denial, masked demo fill without auto-login, normal credential login, HttpOnly cookies/current user, cross-organization 403, admin refresh, normal logout/session revocation and API JSON 404. No JavaScript errors occurred. Existing broad foundation/regression suites were not repeated because application code did not change.

For the already configured installation, start only if the application is not already running:

~~~powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\software\Ootla'
npm.cmd run db:local
npm.cmd run dev
~~~

The Stage 01 review server was left running at `http://127.0.0.1:5173/`, with backend health at `http://127.0.0.1:3100/api/health`. Use the literal 127.0.0.1 origin consistently. Do not start a second copy on the same ports.

For a fresh installation, exact commands remain:

~~~powershell
npm.cmd ci
npm.cmd run env:setup
npm.cmd run db:local
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
~~~

`env:setup` never overwrites an existing .env. The migration and seed commands are explicit and unnecessary for the already prepared Stage 01 database. Seeding preserves retained records/passwords. `db:local` requires installed initdb/pg_ctl binaries; another dedicated Ootla database may be configured instead. No paid service or production credential is required.

`npm start` runs compiled Express and does not silently switch configuration to production. With the default development .env it exposes the API; use `npm run dev` for the full local application. Serving the compiled frontend through Express requires the documented separately configured production mode/HTTPS origin/non-demo settings. Stage 01 did not alter or activate production hosting.

The application boundaries below retain the Prompt 00 architecture and Stage 02 authorization, and include the verified Stage 03 isolated-demo extension. Future CRM/provider module boundaries remain proposals for later authorized stages.

## One application and its boundaries

The single root package contains a Vite frontend written in HTML, CSS and vanilla TypeScript; an Express TypeScript backend; shared TypeScript/Zod contracts; and PostgreSQL accessed through `pg`. No React, Next.js, separate frontend repository, portal project or LoomAgency integration is introduced.

~~~text
Browser
  Development: Vite 127.0.0.1:5173
    /api proxy -> Express 127.0.0.1:3100
  Production: HTTPS Ootla origin
    Express -> dist/client assets and known frontend routes
    Express /api -> authentication and organization-scoped services
                         -> pg pool -> dedicated Ootla PostgreSQL
~~~

`client/` owns routing, public/admin layouts, reusable components, tokens and page modules. `server/` owns configuration, HTTP routes, authentication, organization authorization and database access. `shared/` contains safe request/response contracts and validation rather than configuration or secrets. `public/` contains static assets. `migrations/` and `scripts/` own explicit database changes.

In development Vite serves frontend source and proxies `/api`. APIs enforce access independently of frontend navigation. In production Express serves both frontend and backend on the same origin and gates protected admin page navigation server-side before sending the application shell. The known route allowlist supports direct navigation and refresh; missing assets and unknown routes do not receive a blanket HTML fallback. Unknown `/api` paths always return a JSON 404.

## Configuration, startup and shutdown

Root `.env` is server configuration, ignored by version control. No database credentials or session secrets are exposed through `VITE_*` or frontend bundles. Vite reads the backend port for its local proxy without exposing the environment object to client code.

Zod validates configuration before startup. Errors name invalid settings while omitting values. `APP_URL` must be an HTTP(S) origin; production requires HTTPS and rejects demo mode. Blank `DATABASE_URL` permits honest public/setup review, with unavailable database/authentication operations returning a setup error. An unreachable or unmigrated database remains an error rather than becoming a fake login.

`npm run dev` coordinates Vite and the watched backend. `npm run build` type-checks then compiles client and server. `npm start` runs the built server. Shutdown signals stop accepting HTTP work, close the PostgreSQL pool and exit; a timeout prevents an indefinitely hanging process. No startup path performs seeding or resets.

## PostgreSQL foundation

`server/db` provides the connection pool, availability/schema checks, parameterized query access and transactions. Request-facing queries bind values using PostgreSQL parameters. Dynamic identifiers needed by the optional local database bootstrap are fixed Ootla identifiers, not browser input.

The first migration creates:

| Table | Purpose and constraints |
| --- | --- |
| `organizations` | Organization identity, unique slug, demo/live environment and timestamps. |
| `users` | Normalized unique email, display name, password hash, active flag and timestamps. |
| `organization_memberships` | Unique user/organization pair, role, active flag, foreign keys and organization index. |
| `sessions` | Token digest, user, organization, creation/expiry times and composite membership foreign key; expiry/user indexes. |
| `audit_events` | Organization/actor references, action, JSON metadata, creation time and organization/time index. |
| `schema_migrations` | Runner-managed filename, checksum and applied time. |

Stage 02 adds `roles`, `role_permissions`, `properties` and `property_access_assignments`, producing ten public application/runner tables in the local database. That Stage 02 registry started with identity, organization, name and timestamps. Stage 03 adds descriptive address/city/type fields for synthetic sample review; it remains outside a complete property CRUD or Yardi integration.

Stage 03 migration 003 adds `users.is_demo` and marks the established default demo identity in its demo organization without changing its password. It adds `units`, `leads`, `tasks`, `viewings`, `lead_activities` and `demo_seed_records`, bringing the applied schema to sixteen public application/runner tables.

Units and properties remain distinct. Composite organization/property foreign keys bind leads to their unit/property and related tasks/viewings/activities to the same lead/property scope. Synthetic records have organization-scoped seed keys. `lead_activities.simulated` is constrained true; no outgoing event is implied. `demo_seed_records` records exactly which dataset rows the seed/reset utility owns.
`users.account_kind` distinguishes staff, applicant and resident identities. A composite foreign key requires staff membership rows to reference staff users; applicant/resident accounts cannot receive staff membership or use staff login. No portal workflow is implemented.

Assignments have composite foreign keys tying both membership and property to the same organization. Existing user/password/legacy-role values are preserved; migration 002 replaces the original role check with a foreign key into the persistent role catalog without rewriting memberships.

| Canonical role | Current enforced access | Declared future grants |
| --- | --- | --- |
| `organization_admin` | Own-organization membership management, all own property identities, identity creation/rename, assignment management and audit access. | Leasing/analytics grants reserved for later modules. |
| `leasing_agent` | Read explicitly assigned own-organization property identities. | `leasing.manage`. |
| `property_manager` | Read/rename explicitly assigned own-organization property identities. | `leasing.manage` and `analytics.read`. |
| `read_only_analyst` | Read explicitly assigned own-organization property identities. | `analytics.read`. |

Legacy `staff` retains conservative leasing-agent grants, and legacy `read_only` retains conservative analyst grants. New role updates accept the four canonical roles. There is no platform-superadmin role or cross-organization administrator bypass. Future grants do not imply implemented leasing or analytics operations.

Migration filenames follow `001_description.sql`. The runner validates the dedicated database name and actual database identity, takes an advisory lock, checks applied-file presence and checksums, and applies each pending migration in a transaction. Applied SQL is immutable: add a new migration for future changes. Migration execution is explicit.

The optional `db:local` tool uses installed PostgreSQL binaries and the ignored `.local/postgres/data` cluster. It binds loopback port 55439, creates only `ootla_demo`, and connects the application as restricted `ootla`, separate from `ootla_cluster_owner`. The helper rejects URL query/fragment overrides and confirms PostgreSQL data_directory is the project-owned directory before creating roles or databases. Existing unknown/partial cluster directories are not deleted or replaced. `db:local:stop` stops only that retained cluster.

## Authentication, sessions and organization isolation

Login validates a shared contract, normalizes the email and verifies an Argon2id password hash. Unknown users perform a dummy password verification. Successful login selects an active membership from the database; the browser cannot nominate its role or organization.

Each login creates a random session token. Only an HMAC digest is stored in PostgreSQL; the opaque raw token is sent in `ootla.sid`. Sessions expire after eight hours, and login replaces the presented previous session. Cookies are HttpOnly, SameSite=Lax and Secure in production. Logout deletes the server-side session, clears the cookie and records an audit event.

Each authenticated request joins the unexpired database session to an active staff user and active staff membership, reloading the role and persistent role_permissions grants. Current-user responses include membershipId, permissions and sessionExpiresAt. Deactivation, role changes and assignment revocation affect existing sessions immediately; no browser-supplied role, organization or localStorage identity grants authority.

Demo eligibility is checked during normal login and every current-user/session lookup. Demo-marked users, demo-organization memberships and configured/default demo email identities require `DEMO_MODE=true`, nonproduction execution, the exact connected `ootla_demo`/`ootla_demo_*` database and no live organizations. Database URL query/fragment overrides are rejected. With demo mode disabled or production enabled, correct demo passwords and existing demo cookies are denied. Enabling demo mode on a mixed/customer database fails closed instead of granting demo access. Ordinary live staff remain a separate non-demo path.
Organization routes compare the requested organization with the verified session and reject a mismatch with 403. Property queries constrain organization plus explicit assignment for non-admin staff; inaccessible property IDs return 404. Mutations re-check permission and active identity inside transactions with row locks, validate same-organization targets, and append scoped audit events. Membership edits protect the last active organization admin. Strict request schemas reject extra organization/role fields. Future services must reuse this context and permission boundary.

Current API surface:

| Method and path | Access and behavior |
| --- | --- |
| `GET /api/health` | Safe database/setup health status, without credentials. |
| `GET /api/config` | Safe setup state; explicit demo credentials only in the confirmed isolated demo. |
| `POST /api/auth/login` | Normal credential verification, origin enforcement and rate limiting. |
| `GET /api/auth/me` | Current staff user, organization, membership ID, current permissions and session expiry. |
| `POST /api/auth/logout` | Origin-checked session revocation. |
| `GET /api/admin/overview?period=<period>` | Current `dashboard` period metrics plus preserved legacy `counts`, organization and demo metadata. |
| `GET /api/organizations/:organizationId/overview?period=<period>` | Same dashboard/legacy response after an explicit organization check. |
| `GET /api/demo/data` | Read-only synthetic dataset for an organization admin in its own verified isolated demo organization; never public. |
| `GET /api/roles` | Authenticated role catalog and persistent permission grants. |
| `GET /api/organizations/:organizationId/memberships` | Own-organization admin membership list. |
| `PATCH /api/organizations/:organizationId/memberships/:userId` | Own-organization admin updates canonical role/active status; last active admin protected. |
| `GET /api/properties` | Admin sees its own organization; other staff see explicitly assigned identities only. |
| `GET /api/properties/:propertyId` | Scoped property identity or non-disclosing 404. |
| `POST /api/properties` | Organization admin creates a minimal property identity in its own organization. |
| `PATCH /api/properties/:propertyId` | Admin or assigned property manager renames an accessible identity. |
| `PUT /api/properties/:propertyId/access/:userId` | Organization admin grants a same-organization active staff assignment. |
| `DELETE /api/properties/:propertyId/access/:userId` | Organization admin revokes that assignment; immediate access effect. |
| `GET /api/audit-events` | Organization-admin list of its own organization audit records. |

Login/logout and the Stage 02 mutation APIs require the exact configured browser origin and reject cross-site requests. Membership, property and audit lists accept limit=1..200 and offset; unknown query fields are rejected. The foundation rate limiter is process-local; a shared limiter and explicit trusted-proxy configuration are required before scaling across instances. API responses disable caching; production adds security headers and a same-origin content policy. Logs and error responses omit credentials and raw database errors.

Prompt 00/Stage 02 zero overview counts are historical. Stage 03 legacy `counts` reads persisted properties/leads/tasks, restricted by organization/property assignments, with an applications zero retained for compatibility. Stage 04 displays its separate period-based `dashboard.metrics` instead; Applications and Leases signed are null/unconfigured there. Units/leads/tasks/viewings/activity tables support synthetic sample review, not complete CRM CRUD, analytics or leasing workflows. Staff membership/assignment management remains API-only.

### Stage 04 dashboard metric contract

`AdminOverview.dashboard` contains `period`, `timeZone: Africa/Lagos` and `metrics`. Accepted periods are `month`, `week` and `all`; omission defaults to month, while malformed/repeated/unknown period values return 400. Current-user authentication and explicit organization checks still apply.

`newLeads` counts saved lead `created_at` within the selected period. `toursBooked` counts non-cancelled viewing records by booking `created_at`, not viewing `starts_at`. Month/week boundaries are calculated in Africa/Lagos. Every metric query constrains organization and, for non-admin staff, explicit property assignments.

`applications` and `leasesSigned` are null because those modules are unconfigured. The UI must present them as unavailable rather than invented zeros or rates. Existing `counts` fields remain unchanged for compatibility; their historical applications zero is not the new dashboard metric.

The new follow-up card module reads actual current statuses, property/unit relations and open tasks from the existing private demo data. New inquiry/Contacted/Tour booked/Qualified labels map to stored new/contacted/viewing_scheduled/qualified; no fixture status is rewritten. Search/stage filtering reads existing records. `/admin/leads?lead=<uuid>` shows a read-only saved detail with linked tasks/viewings/activity; `?view=new` clearly reports creation pending.
## Explicit demo lifecycle

`db:seed` requires a verified isolated nonproduction demo database, uses a transaction/advisory lock and preserves the established demo organization/admin identity. Newly created administrators have Argon2id hashes and organization-admin membership only; there is no platform role.

The sample includes Harbor House, Oak Gardens and Summit Residences; six separate units; Maya Chen, Jordan Ellis and Priya Shah; three tasks; two viewings; and three simulated activities. Dataset keys and an ownership manifest prevent duplicates or adoption of conflicting unrelated records. Ordinary seed uses insert-on-conflict-do-nothing behavior, preserving edits, passwords, active flags and roles. No seed/reset service runs during server startup.

The deliberate reset utility requires exactly one `--confirm-reset=<exact connected demo database name>` argument. On a verified isolated target it restores only manifest-owned sample values and the established demo administrator's configured password, active flag and organization-admin membership, revokes that administrator's sessions and records an audit. It retains unrelated users/records and audit history; it neither drops nor resets the database.

For the default local demo, the exact command is `npm.cmd run demo:reset -- --confirm-reset=ootla_demo`. A suffixed database requires its exact full name. Missing/wrong confirmation, disabled demo mode, production, mixed live organizations or unverified database identity must reject the operation.

The frontend displays **Fill demo credentials** only after backend checks the actual isolated environment, marked active demo organization-admin account and matching configured password. That control only fills normal fields. Private demo records are loaded after real authentication through `GET /api/demo/data`; public pages receive no dataset.

`INTEGRATIONS_MODE` and `OUTBOUND_MODE` default to `simulation` and accept only that literal value in this stage. Activity entries, provider status and sample viewings are visibly simulated. No email/SMS/calendar invitation, Yardi mutation, screening, payment or model-provider request occurs.

`check:demo` creates a uniquely named `ootla_demo_stage03_<uuid>` scratch database only on the verified project-owned loopback cluster, checks migration/seed/idempotence/confirmed reset/environment isolation/persistence, then drops only its owned scratch database. It does not seed or reset the retained demo database. All nine groups and owned scratch cleanup passed; the retained demo database was never reset.

`check:demo:restart` is a separate opt-in persistence check. It verifies the exact retained `ootla_demo` database, restricted application role and local PostgreSQL data directory before operating. It starts its own compiled API child on an available loopback port, performs normal login, restarts that owned Node process and then actually restarts the project-owned PostgreSQL postmaster. Four passed groups verify the same cookie/session expiry, persisted dataset, original password/membership, ownership manifest and unchanged demo seed/reset audit counts. It runs no migration/seed/reset, cleans up its own test session/children and leaves PostgreSQL running. Run it after other checks, without concurrent database verification.
## Design system and route composition

Shared tokens start with forest green `#237A3B`, charcoal `#10191A` and off-white `#F5F6F5`. Components cover buttons, fields, cards, badges, navigation and loading/empty/error states. Public pages use alternating light/dark sections, original Ootla copy and heading weight around 500.

The Stage 04 admin shell follows the now supplied approved image: full-width rounded charcoal header with Overview/Leads/Properties/Applications/Calendar top navigation, Overview title/period selector, exactly New leads/Tours booked/Applications/Leases signed, sidebar beneath the header with My leads/Tasks/Analytics/AI assistant/Integrations, and three spacious follow-up cards. The overview excludes charts, activity, AI and integration panels. Dedicated demo pages remain available. Stage 06 adds property/contact workspaces and permitted local forms; Stage 07 adds real lead list/board/edit/history tools on dedicated routes; Stage 08 adds private detail tools on the existing saved-lead route while preserving Overview. Stage 09 adds dedicated task queues/routing/reminders and derives the maximum-three Overview cards from actionable tasks. Historical pending/read-only lead/task descriptions do not override these stages.

The homepage uses a coded illustrative dashboard preview at the far right, extending beyond and clipped by the viewport, with subtle calendar/home/AI icons. It is labeled as a foundation preview and does not simulate persisted CRM records. Layouts respond to smaller screens and honor reduced-motion preferences.

The approved Stage 04 dashboard image is visible in the conversation and is now the visual authority; its raster binary is not local. Original logo binaries remain unavailable and the reused roof/O vector remains provisional. Captured screenshot comparison, final focused QA and preservation are complete; user visual review remains pending; see [design reference inventory](../design-reference/README.md).

## Future module boundaries within this application

These boundaries constrain later explicitly authorized work; they are not implemented integrations or an instruction to start another stage.

- Sales/leads and customer records remain the CRM core. Conversation history supports those records without turning Ootla into an email-marketing platform.
- Properties and units remain distinct entities, scoped to organizations. The initial portfolio exceeds 2,700 properties; future list/query/import design must accommodate that scale without confusing property and unit counts.
- Integration adapters sit behind server services, with organization-specific configuration and source ownership. Exact Yardi interfaces are unknown: do not invent endpoints or a live connection. Clearly label any later simulator. Yardi remains authoritative for configured property, lease, resident and accounting records.
- Standalone imports must support organizations without Yardi and preserve data ownership/auditability.
- Payment boundaries permit approved provider-page navigation and verified status display. Ootla never authorizes, captures, charges or refunds payments.
- Screening requires an approved provider, recorded consent and staff review. AI never approves or rejects applicants.
- Ootla-owned AI may assist customer/staff workflows through server-controlled services. There is no invented EliseAI commercial API.
- Google Calendar, Google Analytics, resident requests, full applicant-document intake/review, maintenance and external communication adapters remain unconfigured and unimplemented here. Stage 08 private staff attachments do not implement those provider/portal workflows. Later demo actions must remain free of real external writes unless explicitly authorized.

## Review and continuation

Setup commands, actual installed versions and page URLs are in the [README](../README.md). Binding rules are in the [build brief](ootla-build-brief.md). Stage outcomes, checks, gaps and user corrections belong in the [progress record](ootla-progress.md).

Complete only the current explicitly authorized stage, report actual checks and limitations, then stop for user review.

## Login-origin follow-up

GET /api/config exposes the server's already validated, non-secret appUrl. Login compares it to location.origin before enabling fields; a mismatch offers an ordinary canonical-origin link with a safe local return path and no data-link interception. Setup errors fail closed. The unchanged server protectOrigin remains the final exact-origin and Sec-Fetch-Site guard. APP_URL changes take effect after restarting the API/frontend, not by trusting a request Host/Origin header. This correction does not change authentication/session/database design.

## Current branding assets and typography

The 2026-10-21 user branding correction supersedes historical provisional-vector/logo-binary-unavailable notes. Exact supplied PNGs live in public/brand/ootla-wordmark.png and public/brand/ootla-icon.png; the white-background reference and hash/bounds manifest live in design-reference/assets/. Shared wordmark() is used by public/admin/login/coded previews, with client/brand.css loaded after workspace styles for consistent image sizing and dark/light treatment. The favicon embeds original PNG data in a self-contained SVG viewBox, with a PNG fallback and legacy path compatibility. Admin/public/hero-preview typography shares local Ootla Inter at 500 headings and 400 body. No CRM/API/database architecture changed.

## Stage 11 final verification

All 16 focused backend groups, 11 final default isolated browser groups (87.4 seconds), four retained read-only groups and the 154-module client/server build passed. Numeric event ordering across sequence 10 and precise retry attempt accounting were corrected and verified. Bounded compiled route/security/secret/preserved-overview checks passed. All 39 prior business-table fingerprints and ten migration checksums match; retained simulator tables/mappings remain empty. Migration 010 is applied once with SHA-256 a563723bb480c0c03d276712a2207cfc5a6b6cc06875ce60172cd886e443ff7f. No existing users/credentials/organization modes or customer records changed. Stage 11 is complete, awaiting review.

## Stage 12 verification status

Completed 2026-10-22. All 11 focused backend groups, six owned browser groups and four retained read-only groups passed. The 154-module client/server build and compiled security smoke passed; a native allocation failure under low host memory was resolved by a session-only RAYON_NUM_THREADS=1 build retry. All 48 previous business-table fingerprints and ten migration checksums match; actual environment/lockfile/authentication/Stage 11 worker/adapter are unchanged. No schema migration or live request occurred. Scaffolding is implemented; client mapping/credentials/live behavior remain unverified. See the [progress report](ootla-progress.md) and [pilot checklist](ootla-yardi-pilot-checklist.md).

## Stage 14 Google Calendar boundary

The existing native Calendar uses the persistent viewings table, property scheduling settings, staff availability and transactional slot constraints. Inspection found the Stage 13 service/client helpers unmounted, so Stage 14 includes only necessary route/rendering dependencies. Existing viewing facts remain legacy read-only records with unknown scheduling metadata, not fabricated appointments.

Optional Google OAuth uses fixed official endpoints, server-side authenticated token encryption and session-bound single-use authorization state. Each current organization/staff membership owns its own connection and selected calendars. The server writes only mapped Ootla-owned events with deterministic IDs and ownership proof; guests/invitations are disabled. Viewing changes commit a durable outbox in the same database transaction, while the worker processes bounded jobs separately. Local booking success and Google sync status are independent. Foreign Google events are shown as Busy only; imports do not rewrite Ootla lead/stage/tour records. Invalid sync tokens rebuild only the provider mirror/cursor. Demo mode blocks Google authorization/network work and continues native scheduling. See ootla-google-calendar.md for setup, limitations and verified evidence.

## Stage 15 - applicant portal boundary

The same application serves /applicant/login, /applicant/invite and protected /applicant. The existing /admin/applications now renders a canonical paginated staff workspace; applicant and staff authentication/authorization remain separate.

shared/applicant-contracts.ts defines strict schemas and typed DTOs. server/services/applicant-portal.ts owns explicit grants, HMAC-digested opaque sessions/invitations, transactional personal/checklist/consent/readiness/submission, private bytea documents and fresh staff/property/all-lead-interest permission checks. server/routes/applicant-portal.ts exposes separate /api/applicant and staff /api/applications routers. server/app.ts protects production applicant HTML and its no-store/no-referrer boundary.

Additive migration013 extends applications with portal configuration/version/submission fields and adds application_participants, application_checklist_items, application_invitations, applicant_sessions, application_documents, application_consents and application_portal_events. Participant property snapshots prevent a legacy CRM property retarget from transferring applicant authorization. Applicant users have no staff membership. Co-applicant private fields/documents are not shared with the other applicant.

client/pages/applicant.ts + client/lib/applicant.ts implement the independent applicant shell and own-record forms. client/pages/applications.ts + client/lib/applications.ts implement staff list/create/configuration/invitations/documents/progress/read-only preview inside the preserved admin shell. client/applicant.css scopes these surfaces; client/main.ts adds only current-stage routes/loading. Original public pages/branding and contextual compact collapsible header remain preserved.

Portal events enter the existing private lead timeline with safe summaries, never personal details/document bytes/consent text/token. Canonical application status synchronizes the lead application summary without forcing unrelated lead stages. The existing validator is exported for reuse; no public document storage is introduced.

server/services/applicant-demo.ts and explicit demo:applicant seed a separate synthetic organization, applicant and organization-admin staff account. No automatic seed/reset or external delivery occurs. See [portal walkthrough](ootla-applicant-portal.md) and the progress log for verification and setup.

## Public presentation follow-up - 2026-10-23

The existing public routes now share client/pages/public-layout.ts for Explore and locally served illustrative photographs, plus client/public-refresh.css scoped to .public-refresh. Each marketing page contains introduction/main-green/Explore sections; client/pages/home.ts renders six browser-only tabs initialized by client/lib/home-processes.ts. Existing AI-demo, onboarding and restrained public-workflow helpers remain presentation-only, with no provider calls or customer mutations. Original Ootla branding remains; public application copy/titles use OotlaAI. Source/provenance is public/photos/sources.json. The admin-shell change only reorders the summary/profile controls and removes organization/role from the dropdown identity presentation. All backend/authentication, data, applicant, connector and scheduling boundaries remain unchanged.

## Public palette correction - 2026-10-23

The user's later clarification supersedes the previous green/tab presentation: public-refresh.css now sets charcoal main sections and light Explore; the homepage renders six full alternating bands. Its removed tab initializer is no longer imported or invoked by client/main.ts. Shared public-layout photograph metadata now includes two Pexels illustrations for resident phone support/property viewing, in addition to the three inner-page photos. All assets remain local; no public provider/API action is introduced. Existing backend/authentication/data and admin/applicant sources are preserved.

## Public search rendering boundary - 2026-10-23

shared/public-site.ts centralizes the eight public route descriptions, canonical/social/schema serialization, explicit public-origin validation and discovery text. scripts/public-seo-plugin.ts loads the existing pure public renderer through Vite in development/build and emits static page HTML plus a separate blank noindex app-shell. This keeps the current vanilla client and Express application; it does not move private CRM rendering into static HTML.

server/http/public-site.ts controls robots/sitemap and noindex/alias handling. Built indexing is effective only in non-demo production when APP_URL and request Host match the explicit build origin. server/app.ts preserves the existing auth gates before static serving, then selects allowlisted public files or the private shell. Unknown production routes remain404; development unknown documents now return404 too. Canonicals never derive from request headers.

client/lib/seo.ts replaces managed metadata on client navigation and Back, removing public canonical/schema/social content from private routes. No actual environment, database, schema, provider, permission or authentication service was changed. The landing photos are now secondary56%-width accents to100%-width product previews, with shorter original copy. See ootla-seo.md for configuration and verification.

## Public attribution and concise-copy follow-up - 2026-10-23

client/pages/public-layout.ts keeps photo provenance in a semantic figure/description, with a focusable photograph and hidden overlay caption. client/lib/photo-credits.ts is public-only, abort-scoped browser behavior for touch reveal and Escape dismissal; CSS handles normal hover/focus. It creates no API requests or stored state.

The HTML template no longer contains the global Skip to content anchor. Existing Vite pre-rendering rebuilds that change into public files and the blank private shell. Inner page renderers/onboarding copy are concise; route/anchor/SEO and backend boundaries are unchanged. Diagonal photo/product geometry is scoped to the homepage compositions.

## Batch Stages16–17: application-bound coordination

Stage15 remains the real applicant/session/document foundation. The new application-access service revalidates the exact current staff/applicant session, active identity/membership and complete application/lead-interest property scope inside each transaction. Screening and payment services use these shared guards and canonical application/contact/participant foreign keys. No organization admin becomes a platform administrator.

Stage16 separates purpose/version screening consent, synthetic provider coordination/jobs, private report storage and authorized human application decisions. Its raw demo callback router precedes the global JSON parser to verify exact bytes, timestamp and namespaced HMAC; the synthetic protocol never stands in for an undocumented live provider. Reports and sensitive decision reasons stay outside broad/non-review responses and AI context. Staff decisions are independent append-only history and do not overwrite Yardi-owned application status.

Stage17 separates a configured external destination, application payment reference, short-lived session/participant-bound digest-only handoff and synthetic provider record/event. Confirmation changes the provider simulator; a distinct authenticated adapter read updates Ootla's source/freshness observation. Browser redirects/query flags cannot confirm payments. The private /payment-demo page removes its fragment before asynchronous work and stays noindex/no-store/no-referrer. No card collection, checkout/payment authorization, charge/capture/refund or financial transaction service exists. Live verification remains unsupported pending documented client interfaces.

The vanilla staff Applications detail and applicant portal load scoped service summaries; read-only staff preview requests neither new screening nor payment data/actions. All functionality remains one Vite/TypeScript + Express/TypeScript + PostgreSQL application, without new dependencies, production changes, automatic seeding or external delivery. Additive014 and015 preserve earlier migrations/data.

## Batch Stages18–19: canonical lifecycle and bounded AI

Stage18 adds typed lease workflow/evidence/events/settings, resident relationships and shared idempotent task creation. Existing application/lead/contact/lease identities remain canonical; exact local dates and property-local move-in times are distinct. DB unit-overlap guards and normal services prevent legacy routes or simultaneous requests from bypassing active lease rules. Manual attestation and isolated demo events remain different from unimplemented live signature verification. Move-in tasks use normal authorization/routing/history/reminder services and stay actionable after Leased.

Stage19 adds server/ai adapter contracts, explicit scripted adapter, optional official Responses HTTPS transport and AiOrchestrationService. /api/ai always authenticates current actor/membership, scopes exact property/application/lead before retrieval, uses approved knowledge plus current domain reads, validates source/tool structure, freshly authorizes fixed actions, executes via the normal task service, verifies persistence and stores concise operational traces. It never indexes private identity/screening documents or persists raw prompts/private chain-of-thought. Actor-bound requests and shared task receipts are durable duplicate controls; rate/token/cost reservations serialize per organization. All configuration/credentials remain server-side. Demo cannot invoke a live model.

client/pages/ai-assistant.ts, client/lib/ai-assistant.ts and ai-assistant.css render the dedicated native staff workspace; no overview panel or full messaging system is added. Typed strict endpoints and source references remain organization/property scoped. Simulation is usable without external accounts.

Optional same-host Apache demo hosting serves the compiled app from Express, with HTTPS/Secure cookies and loopback proxy trust explicitly enabled. It preserves the strict production/demo separation and default Vite behavior; templates never expose project source/private files as Apache DocumentRoot. Local hosted-mode tests are not evidence of actual VPS deployment. See ootla-apache-demo.md and ootla-batch-15-19-handover.md.


## Production-preparation Step 2 - separate customer and preview runtimes

The same compiled Vite/TypeScript frontend and Express/TypeScript server run in two separate application processes. This does not create a second CRM implementation or copy demo accounts into customer organizations.

| Boundary | Customer runtime | Interactive preview runtime |
| --- | --- | --- |
| Runtime | NODE_ENV=production, DEMO_MODE=false | Compiled non-production runtime, DEMO_MODE=true |
| Public origin | Customer HTTPS hostname | Separate preview HTTPS hostname |
| PostgreSQL | Customer database and restricted database role | Dedicated ootla_demo or ootla_demo_* database and separate restricted role |
| Sessions | Independent secret and cookie prefix | Existing preview identities and password hashes retained |
| Providers | Only explicitly configured, authorized capabilities | Live AI and Google authorization disabled; synthetic providers stay isolated |

[server/runtime-isolation.ts](../server/runtime-isolation.ts) runs after migration readiness and before the listener or any of the seven existing workers starts. It checks current_database(), organization environments and preview-user markers. A preview database containing customer organizations is refused; a customer runtime using a preview-named database or containing preview organizations/users is also refused. Startup performs no seed, reset, identity transfer or migration.

[server/config/runtime-pair.ts](../server/config/runtime-pair.ts) validates the hosted pair: separate hostnames and loopback ports, database names/roles, cookie prefixes, session secrets and supplied encryption keys. It rejects shared origins and preview live-provider settings. The operator utility is:

```sh
node --import tsx scripts/validate-runtime-pair.ts /etc/ootla/customer.env /etc/ootla/preview.env
```

It reads the two private files and reports validation without printing their values. It does not create databases, grant PostgreSQL privileges, verify TLS or deploy either process. Actual target access, database ACLs and certificates still require verification.

[server/http/session-cookies.ts](../server/http/session-cookies.ts) provides the shared staff/applicant/resident cookie naming and reading. The default prefix preserves ootla.sid, ootla.applicant.sid and ootla.resident.sid, including existing session digest formats. Custom prefixes apply consistently to login, invitation acceptance, current-user loading, logout and password-change sign-out. Cookies remain host-only, HttpOnly, SameSite=Lax and secure on hosted runtimes. Separate hostnames and distinct prefixes are required because browser cookies do not distinguish ports. No browser-stored user object grants access.

Staff, applicant and resident sessions continue to authorize their own organization and explicit record grants. Preview authentication still requires the verified isolated database, not merely a flag or a demo-looking email address. An organization administrator has authority only inside that organization.

Public Try Ootla links use /try; normal Sign in links still use /admin/login. [server/http/preview-entry.ts](../server/http/preview-entry.ts) resolves a fixed login destination from validated server configuration. The preview runtime can direct visitors to its own login only after readiness and isolation checks. A customer runtime uses PREVIEW_APP_URL to select the separate preview login; without a usable destination it returns a polished unavailable page with Contact and staff-sign-in next steps. Query-supplied destinations are rejected. /try and /api/preview-entry are private/no-store, noindex and no-referrer; native navigation works without JavaScript, with a guarded client fallback for local development.

Credential-fill controls remain normal masked-field conveniences and do not submit or bypass authentication. The preview is identified at entry; repeated technical mode banners are omitted from the workspaces. Existing retained demo data is not automatically reseeded. Provider simulations remain server-gated; unavailable live transports cannot become successful customer actions by changing labels or flags.

This section documents inspected implementation boundaries. Focused check outcomes and any deployment blockers are recorded in [the progress log](ootla-progress.md); no remote deployment, HTTPS certificate or production database permissions are asserted here.


## Current review-instance boundary - 2026-10-28

The user now requires two feature-aligned Git branches/checkouts: ootla-v1-branch is live-style and ootla-v1-demo preserves interactive demo access. The same vanilla TypeScript/Vite/Express/PostgreSQL architecture and compiled build remain in use. Branch-specific ootla.instance.json chooses a private development environment; the backend independently validates DEMO_MODE, actual database contents, memberships and sessions. GET /api/public-access exposes only the verified public demo-access boolean. Marked access regions are rewritten consistently for server HTML and client navigation. Live /try remains on its own normal sign-in; only demo shows Explore demo and masked credential filling.

Local websites use separate hostnames/ports and session names/keys. The original project-owned PostgreSQL cluster contains distinct logical databases and restricted roles; no sample records are copied into the customer database. Each instance has its own application processes and existing workers. Git common-directory detection ensures db:local from either checkout reuses the single owned cluster. See [current instance guide](ootla-instances.md). This is local preparation, not an Apache/VPS publication. Oodler's first administrator remains invitation-based with a user-chosen password. No emails may be sent to the live organization until explicit user approval.
