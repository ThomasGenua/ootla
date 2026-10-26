# Ootla final handover

Updated 2026-10-25 (Africa/Lagos). Project: `C:/Users/user/Documents/software/Ootla`.

OotlaAI is the application; Ootla is the brand. This is the existing independent Vite/vanilla TypeScript + Express/TypeScript + PostgreSQL sales, leads and leasing CRM. It is not part of LoomAgency. No framework rewrite, production cutover or external customer communication occurred.

## Readiness

- **Local isolated demo:** implemented and verified; Stages 26-28 and local deployment preparation are complete, including the connected staff/applicant/resident journeys below.
- **Live customer operation:** not activated. Real organization/first-administrator onboarding has not been performed or verified; isolated demo seeds are not production provisioning. Native CRM can run independently of Yardi; a Yardi pilot still needs the client's documented licensed interfaces, scope, permissions, mappings and observed reconciliation.
- **External services:** simulation is not live verification. Google Calendar, GA4 and optional OpenAI transports are implemented but have no verified external authorization/result in this batch. Live Yardi, email/SMS, screening, signing, payment-status and telephone transports remain unsupported or unconfigured as detailed in the [activation register](ootla-live-activation-checklist.md). A flag alone cannot implement them.
- **Deployment:** prepared locally for the confirmed Ubuntu/Debian Apache VPS; no remote deployment, DNS change or replacement of an existing production application was performed.
- **Stage 28 verification:** clean installation, six startup-readiness groups, two environment-setup groups, three native recovery groups, final build, four compiled-serving/authentication groups and actual compiled-index restart pass. Local preparation is complete; no remote deployment or live provider verification is inferred.

## Module status

| Module | Implemented and verified locally | Simulation / remaining boundary |
| --- | --- | --- |
| Public website | Original copy, useful routes/CTAs, static public rendering/SEO, lighter headings, cropped full-size dashboard, mobile and reduced motion | Examples/photos are illustrative; demo is not indexed as a live customer site |
| Staff access | Argon2 passwords, server sessions, current membership/property checks, logout/expiry, organization isolation | Organization admin never grants platform-wide access |
| Property/contact foundation | Distinct properties and units, groups, households, shared customer identity, source mappings, bounded directories | Imported availability is unverified until a permitted source verifies it |
| Leads/tasks | Persistent list/board/detail, owners, stages, timeline, private notes, actionable tasks/routing/reminders | No stage drag can substitute for required lease evidence |
| Native Calendar | Availability/timezones/buffers, booking/reschedule/cancel, concurrency protection, public booking | Demo notifications are simulated; Google synchronization is a separate outcome |
| Applications/portal | Secure expiring invitations, separate sessions, personal details/consent, private validated files, submission and staff preview | Staff preview is read-only, not impersonation; staff retains decisions |
| Screening/decisions | Consent, duplicate-safe coordination, private results and explicit staff decisions | Separate synthetic screening provider; no live screening transport or invented criteria |
| Payment handoff/status | Approved destination validation, applicant demo handoff, source-verified observation, forged-return refusal | No authorize/capture/charge/refund capability. Live status adapter is missing. Resident demo handoff deliberately returns unavailable/409 |
| Lease/resident continuity | Configured evidence/milestones, unit conflict guards, canonical identity, move-in tasks and resident grants | Manual attestations and demo signing events are distinct from verified e-signatures |
| Ask Ootla/AI | Contextual threads, grounded native reads/source links, explicit confirmed tasks, current policy/usage limits | Scripted inference in demo; optional live OpenAI remains externally unverified |
| Conversations/automation | Canonical website inquiries, real native bookings, local outbox, staff takeover/private notes, durable rules/jobs/pause/cancellation | Website delivery is local; live SMS/email are not implemented |
| Reporting/Analytics | Actual CRM cohorts/counts/exports, native GA4 reporting/configuration and unavailable states | Website analytics is distinct from CRM outcomes; illustrative GA data is explicitly labelled |
| Resident operations | Own lease/request/file access, fan-request collection, persistent requests, staff assignment/updates, approved guidance | Access preferences are not technician appointments; no real maintenance dispatch or invented renewal offer |
| Optional voice | Disabled-by-default policy, authorized local transcript simulation, native tools, applicant-session proof, retention | No live calls, ASR/TTS/audio, recording or confirmed telephone transfer |
| Organization operations | Profile, memberships/grants/groups, lead/task routing, quiet hours, AI knowledge/policy/private sources, health, audit and configured retention | PDF/OCR parsing, automatic binary indexing and a malware-scanning service are not implemented |
| Deployment/recovery | Apache reverse proxy and a dedicated systemd Node service prepared; additive migrations through 026 | Startup, fresh install/environment, native restore, compiled serving/authentication and compiled restart verified locally. Actual VPS/TLS/OS signals and production load remain unverified |

## Start the existing local application

Prerequisites: Node >=22.12, installed dependencies and the project-owned PostgreSQL cluster/binaries. Preserve the existing private `.env`. In PowerShell:

~~~powershell
cd C:\Users\user\Documents\software\Ootla
npm.cmd run db:local
npm.cmd run db:migrate
npm.cmd run dev
~~~

Keep the development process running. These commands do not seed or reset data. Use `npm.cmd ci` only when installing dependencies from the existing lockfile, not on every startup.

Open [the website](http://127.0.0.1:7673/), [staff login](http://127.0.0.1:7673/admin/login), [applicant login](http://127.0.0.1:7673/applicant/login) or [resident login](http://127.0.0.1:7673/resident/login). Use this exact origin; `localhost` and another port are different origins. Health: [frontend-proxied API](http://127.0.0.1:7673/api/health), or [direct local API](http://127.0.0.1:3100/api/health).

For a fresh installation use the safe example/environment instructions in [the Apache deployment guide](ootla-apache-demo.md). Run `npm run build` and `npm start` for the compiled application with deliberately configured compiled serving. The normal API process owns the seven durable workers; no second worker daemon is needed. Worker/manual processor commands are not seed/reset commands.

Do not run seed/reset tools merely to start retained data. Optional `db:seed`, `demo:applicant`, `demo:standalone`, `demo:conversations` and `demo:resident` are deliberate isolated-demo preparation, not startup hooks. Existing identities/passwords/staff edits are preserved. Demo reset remains an explicitly confirmed, scoped administrative CLI action and was not executed in this batch.

## Correct accounts and organization boundaries

Passwords and tokens are intentionally omitted here. Use the server-gated credential-fill helpers or the current credential supplied by the deployment administrator, followed by normal **Sign in**. Fill buttons never submit or bypass authentication.

| Identity | Email | Organization / access |
| --- | --- | --- |
| Original staff administrator | admin@demo.ootla.test | **Ootla Demo**; overview, original CRM and prepared property chat example |
| Application-workflow staff | applications@demo.ootla.test | **Ootla Applicant Demo**; use for the applicant/screening/payment/lease journey |
| Resident-workflow staff | residentstaff@demo.ootla.test | **Ootla Resident Demo**; use for Maintenance and its resident's requests |
| Standalone administrator | standalone@demo.ootla.test | **Ootla Standalone Demo**; reviewed CSV onboarding without Yardi |
| Applicant identity | applicant@demo.ootla.test | Own authorized application in Ootla Applicant Demo; separate applicant cookie |
| Resident identity | resident@demo.ootla.test | Explicitly granted lease and own requests/files in Ootla Resident Demo; separate resident cookie |

Use separate browser profiles/private windows for different staff identities: one staff cookie must not be treated as membership in all four organizations. Applicant/resident tabs can coexist with staff because they have separate sessions. A missing record in another organization is expected isolation, not a reason to weaken permissions.

## Six useful scenarios

Exact buttons and expected results are in the [demo walkthrough](ootla-demo-walkthrough.md).

| Scenario | Account / route | Expected result |
| --- | --- | --- |
| Staff: daily priorities and follow-up | Original staff; /admin, Ask Ootla, /admin/tasks | Inspect actual work, preview a proposed task, explicitly confirm and open its one saved record |
| Staff: lead/viewing/application assistance | Application-workflow staff; /admin/leads, /admin/calendar, /admin/applications | Assigned lead, conflict-safe viewing, real portal progress, checklist assistance and human decisions |
| Staff: maintenance coordination/reminders | Resident-workflow staff; /admin/maintenance, Ask Ootla, /admin/automations | Persistent fan request, honest assignment/update, native task/reminder; requested access stays distinct from appointment |
| Resident: repair/status tracking | Resident; /resident | Review and submit one request; refresh to see its actual saved state and authorized updates |
| Resident: payment guidance/status | Resident; own home's Existing payment provider panel | Isolated demo says not configured; no external link/funds movement. Applicant payment simulator separately demonstrates verified-source status |
| Resident: lease/renewal and staff handoff | Resident; own home and request messages | Only granted lease and approved terms appear; requests for different terms go to staff without an AI offer/approval |

## Verification evidence and limitations

Stage 26 passed **16 focused API groups, six actual Chrome groups and six operational-controls groups**, plus TypeScript and scoped responsive/keyboard checks. Stage 27 passed the final **17-group consolidated actual UI/API acceptance** against a uniquely owned disposable database; no outside-origin browser request, real call/audio/provider action or customer communication occurred. Earlier failed attempts were corrected test-harness issues; security constraints were retained.

Two material Stage 27 UI fixes are included: normal sign-in preserves newer native protected routes, and voice replacement controls remain disabled until the active request/metrics refresh settles. The latter also passed a separate 800ms delayed-metrics mock regression; it is not a substitute for the actual backend gate.

Stage 28 clean installation passed from the unchanged lockfile: 147 packages in about 38 seconds, native Argon2id hash/verify and runtime/build dependency resolution on Node 22.22.0. An offline attempt first failed because the zod archive was not cached; the clean registry retry succeeded. The working node_modules installation was untouched and the owned temporary directory was removed. Six startup-readiness groups verify current migration checksums/tables, failure before listen for missing/mismatched/unavailable database state, healthy production startup/graceful shutdown and optional public development without a database.

Disposable recovery passed three focused groups with native PostgreSQL 18.6 pg_dump/pg_restore: a 611,703-byte custom archive restored into a new owned database with all 26 migration checksums and 144 table fingerprints/163 rows matching. Three private PostgreSQL bytea files, their hashes and property-source provenance survived. Restored normal staff/applicant logins and three authorized downloads passed; three anonymous downloads returned 401 and two foreign attempts 404. Core/private/task/job counts remained unchanged after auth, with no workers, seed/reset or outbound action. Dump took 1,325.74 ms and restore 4,548.15 ms. All owned databases/archive/temp files were cleaned. This is local synthetic recovery, not Ubuntu/Apache recovery or a production RTO. Deployment keys and cluster roles/ACLs were outside the archive; future object storage needs a separate backup. Evidence: scripts/check-backup-restore.ts and .local/backup-restore-observations.json.

Two fresh/repeat environment-setup checks passed at the 7673 default with generated secrets kept silent; repeating preserves bytes/mtime. Running the helper on the retained checkout left its private .env hash unchanged.

Local restart observations: initial readiness **4,025ms**, restart **3,403ms**, one reminder observed **216ms** after health readiness; saved session/task persisted, no duplicate notice, no startup seed/reset and both graceful exits were zero. This is the actual local Node entrypoint, not a remote Apache/systemd verification.

The isolated scale fixture added **2,700 properties and 2,700 leads, zero units**; seven original fixture units remained separate. Pages stayed at 25 records, last page 108, exact search one result. Directory warm median **110ms**; report **355ms**; Properties/Reports browser readiness **2,187/1,900ms**. Three actual reminder tasks produced three notices in **123ms**, with no duplicates on a **53ms** repeat pass. These are shared Windows/loopback synthetic measurements, not production throughput/concurrency or a service-level promise.

Preservation: **131 of 132 original row hashes match exactly** across 131 business tables. The remaining row has an advancing automation-worker scan cursor; its configuration timestamp predates the baseline. Because the original snapshot has no separate configuration-field hash, complete equivalence for that row cannot be proved. It was not reset or hidden. All **23 earlier / 26 applied migration checksums** and **57 protected environment/dependency/public/design hashes** match. The progress log records this limitation explicitly. The final post-smoke/authentication preservation check confirmed the same result, all migration checksums and all 57 protected hashes; current retained homepage and API health return HTTP 200 with database ready.

Final compiled verification passed four groups on the actual built application: eight public routes, ten protected workspaces, existing assets 200, missing assets/source 404, unknown API JSON 404, private no-store/noindex and no bundled server secrets. All six retained normal demo logins passed: four distinct staff organizations, applicant and resident own records, cross-scope denial, truthful nine-service states and logout. This smoke started no workers and made no retained CRM business writes; only session/login-audit state changed. The actual compiled index then passed an ordinary restart in a disposable database: startup 2,377.57 ms, restart 2,380.20 ms, one reminder 210.02 ms after readiness, one notification across two starts, persisted session/task, no seed/reset or duplicate, unchanged core counts and two graceful zero exits. Owned resources were cleaned. Evidence: .local/final-compiled-smoke-observations.json and .local/final-compiled-restart-observations.json. Apache/TLS, Linux OS signal forwarding, remote resource limits and production concurrency remain unverified.

The build passes client/server TypeScript, 224 Vite modules, public generation and compiled server emission. A non-blocking shared JS chunk advisory remains at approximately **785kB minified / 209kB gzip**; code splitting is future optimization. Large-file/historical activity load, remote latency, VPS signals/reverse proxy and real external behavior remain outside the local benchmark.

Evidence: [progress](ootla-progress.md), [architecture](ootla-architecture.md), [Stage 26 operations](ootla-operational-controls.md), `scripts/check-final-acceptance.ts`, `.local/final-restart-observations.json`, `.local/portfolio-scale-observations.json` and `.local/final-preservation-observations.json`.

## Next operational steps

Use the [deployment guide](ootla-apache-demo.md) for build/migrations/HTTPS/process supervision and backup/recovery instructions. Private uploaded content is stored as protected PostgreSQL bytes, not in the public static folder. Preserve server encryption/session keys securely with a separate recovery plan; a database dump does not replace key custody or backup retention policy.

Review all nine services in the [live activation checklist](ootla-live-activation-checklist.md), complete the limited-property Yardi pilot evidence where appropriate, and obtain the missing client/provider inputs. Do not convert the retained demo into a customer production database, activate unsupported transports, change DNS or replace an existing production application as part of this handover.
