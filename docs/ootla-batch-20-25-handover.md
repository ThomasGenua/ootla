# Ootla Stages 20–25 handover

Completed 2026-10-25 (Africa/Lagos) in C:/Users/user/Documents/software/Ootla. This is the existing independent Vite/vanilla TypeScript + Express + PostgreSQL application. The authorized batch is complete; STOP before Stage 26. Implementation verification is not user acceptance or live-provider verification.

## Completion and integration status

| Stage | Implemented and verified | Simulated | Awaiting configuration / blockers |
| --- | --- | --- | --- |
| 20 — Ask Ootla / conversations | Shared contextual staff panel, private saved threads, grounded record tools, confirmed native tasks, canonical website inquiries, preferences, native viewing booking, staff takeover, private notes and durable outbox/receipts. | Current AI responses and local channel delivery; marketing examples remain illustrative. | Live inference and documented email/SMS transports. No independent-development blocker. |
| 21 — Automations | Persistent rules, preview, approval, activity, pause, scoped durable jobs, idempotency, quiet hours, bounded retry/rate limits and native staff reminders. Current source/consent/ownership is rechecked at delivery. | Customer messages use the local website outbox. | Live email/SMS needs approved providers and delivery/inbound setup. Maintenance triggers now use Stage 24 records. |
| 22 — Analytics | Native GA4 reports, date comparisons, authorized property selection, read-only OAuth/refresh/disconnect transport, encrypted server tokens and scoped caches; transport tested with local fixtures. | Explicitly selected illustrative Analytics property; unavailable data remains unavailable. | Actual GA4 OAuth authorization, credentials, selected accessible property and live report verification. Live Google Analytics is prohibited in DEMO_MODE. |
| 23 — Reports / insights | Native aggregate reports, six paginated views, exact metric definitions, chronological linked cohorts, safe restricted CSV and matching Ask tools. Isolated 2,700-property benchmark passed. | Scale fixtures are synthetic; reports otherwise query actual CRM records. | No live-provider dependency for native reports. Production/VPS performance and concurrency were not benchmarked. |
| 24 — Resident operations | Separate resident sessions/invitations, canonical lease grants, private files, real requests/messages, staff assignment/status history, confirmed appointments, approved renewals and native reminders/Ask tools. | Resident collection helper and demo records; no technician dispatch. | Documented Yardi maintenance-write/renewal capabilities and approved existing payment destination where required. Unsupported provider actions fail explicitly. |
| 25 — Optional voice | Default-off policy, separate recognition/dialogue/tool/output/handoff interfaces, private transcript retention/deletion, actual applicant-session verification, native booking and canonical conversation/timeline outcomes. | Typed transcript playback and explicit failure events; no speech/audio/call or successful telephone transfer. | Documented telephony/ASR/TTS, caller verification, approved consent/retention and pilot authorization. Recording is unsupported and disabled. |

There are no outstanding blocking local check failures. Live provider behavior remains unverified; simulation is not evidence of a live connection.

## Start the existing configured checkout

Node >=22.12 and PostgreSQL binaries on PATH are required. Dependencies are already installed here. From PowerShell:

~~~powershell
cd C:\Users\user\Documents\software\Ootla
npm.cmd run db:local
npm.cmd run db:migrate
npm.cmd run dev
~~~

Keep the development terminal running. Open http://127.0.0.1:7673/ using that exact origin; localhost is a different origin. API health is http://127.0.0.1:3100/api/health. The current dedicated PostgreSQL cluster listens only on 127.0.0.1:55439. The actual .env has been preserved.

For a fresh checkout only: npm ci, npm run env:setup, then db:local, db:migrate and db:seed. The helper preserves an existing .env; for a new file it defaults APP_URL to http://127.0.0.1:5173. Set a fresh checkout's APP_URL deliberately to http://127.0.0.1:7673 before starting if using this guide's URLs; restart after changing it. Keep DEMO_MODE=true, INTEGRATIONS_MODE=simulation and OUTBOUND_MODE=simulation only with the dedicated isolated demo database. Follow .env.example and never copy customer/production data into a demo.

Deliberate, repeatable setup helpers are demo:applicant, demo:conversations and demo:resident (npm run <name>). They already prepared the corresponding local examples. They preserve existing records/edits/passwords and never run at startup. Do not reset/reseed to start the app. Large fixtures run only through the owned disposable scale check, never the retained demo.

Build with npm run build. npm start runs the compiled server; compiled website serving and HTTPS/proxy flags are explained in [the Apache demo guide](ootla-apache-demo.md). That guide targets the confirmed isolated Ubuntu/Debian VPS; no VPS deployment occurred in this batch.

## Working routes and accounts

All routes below use http://127.0.0.1:7673.

| Page | Route |
| --- | --- |
| Public website / real local website-chat entry | / |
| Staff sign-in / Overview | /admin/login → /admin |
| Conversations / shared Ask Ootla header action | /admin/conversations |
| Rules and activity | /admin/automations |
| Website Analytics / CRM reports | /admin/analytics / /admin/reports |
| Native task queue / Calendar | /admin/tasks?view=team / /admin/calendar |
| Resident staff queue / voice simulation | /admin/maintenance / /admin/voice |
| Applicant sign-in / portal | /applicant/login → /applicant |
| Resident sign-in / portal | /resident/login → /resident |

| Identity | Email | Password | Authorized environment |
| --- | --- | --- | --- |
| Original staff administrator | admin@demo.ootla.test | OotlaDemo!2026 | Original Ootla Demo organization; Harbor View conversation example. |
| Application-demo staff | applications@demo.ootla.test | OotlaDemo!2026 | Separate application organization only. |
| Applicant | applicant@demo.ootla.test | OotlaApplicant!2026 | Own permitted application records. |
| Resident-demo staff | residentstaff@demo.ootla.test | OotlaDemo!2026 | Separate resident organization only. |
| Resident | resident@demo.ootla.test | OotlaResident!2026 | Explicitly granted demo lease and own requests/files. |

Staff use /admin/login and normal Sign in. Applicants/residents use their separate login routes and cookies. These known passwords are intentional isolated demo credentials, stored as hashes, never customer credentials. An organization administrator is not a platform superadmin. Use another browser profile/private window for a second staff identity; applicant/resident tabs can coexist with a staff session because their sessions are separate.

## Three connected walkthroughs

### Staff assistant → saved task

1. Sign in as the original administrator and open Overview. Select Ask Ootla in the header and ask “What needs my attention today?”
2. Inspect linked actionable records, current scope and freshness. Open a lead or property to establish a clear authorized record context.
3. Ask to create a follow-up task. Inspect the proposed title, owner, due date and source; use the explicit confirmation action.
4. Open the returned task link or /admin/tasks. Refresh: it remains a real native task, and retrying the same confirmed action does not create another one. Suggested replies remain drafts until deliberately approved.

### Leasing conversation → viewing → staff takeover

1. In a separate private window open /, select Chat with Ootla, then the Harbor View demo team. Deliberately start a synthetic inquiry. It creates linked native contact/lead records, without silently merging an existing person on name/email.
2. Ask about the property using its approved public FAQ and provide stated preferences. Private staff notes and application information are not public sources.
3. Ask for viewing options. Choose an offered future weekday/available slot and confirm. Only an actual saved viewing produces a booking confirmation. Inspect its property timezone; Google sync is a separate status and demo invitations stay simulated.
4. As staff open /admin/conversations, select this inquiry and open its lead timeline. The viewing and conversation share the canonical lead.
5. Create another inquiry in the staff simulator so the reply is queued, then take over before processing the outbox. The queued AI reply becomes Cancelled. Processing/retrying cannot send it after takeover. Add an internal note and verify the public visitor cannot see it.
6. Explicitly return handling to AI only when desired. No live email or SMS is sent.

See [conversations](ootla-conversations.md) and [automations](ootla-automations.md) for exact simulator/approval/quiet-hour controls. Rules must be deliberately enabled; preview alone creates no work.

### Resident request → reminder → assignment → status

1. Sign in at /resident/login as the resident. Select the explicit demo lease at Cedar Courtyard - resident demo.
2. Start the labeled scripted request helper: “My bathroom fan has stopped working.” Supply the room, urgency, contact preference and requested access window, then review and submit.
3. Confirm a persisted request identifier and Awaiting assignment. Refresh to verify persistence. Requested access is not a confirmed technician appointment. Optional supported files remain private.
4. In another staff browser sign in as residentstaff and open /admin/maintenance, Tasks or Automations activity. The prepared enabled in-app rule creates a native unassigned-request reminder. If deliberately paused, review/re-enable it before expecting work; use Evaluate/Process or allow the bounded worker to run.
5. Assign an eligible staff member on the actual request. Its obsolete untouched unassigned reminder cancels on the scheduled recheck (up to 30 seconds for completed-job revalidation). Later staff-edited tasks are preserved.
6. Refresh the resident request to see the saved status/update. Internal staff notes stay private. A confirmed appointment requires separate explicit staff confirmation, future time and supporting evidence. No dispatch is implied.

See [resident operations](ootla-resident-operations.md) and [UI steps](stage-24-ui-walkthrough.md).

## Analytics, reports and voice review

**Analytics:** sign in as an organization administrator, open /admin/analytics, expand connection controls and deliberately choose the illustrative property. Select dates/comparison and switch Acquisition, Landing pages and Events. Source/timezone/freshness remain visible. These are synthetic website measurements, not applications or signed leases. Disconnect returns an unavailable state. Live Google reporting needs separate non-demo setup; see [Analytics guide](ootla-google-analytics.md).

**CRM reports:** open /admin/reports, select dates and permitted property/group/region/agent/team. Switch Properties, Sources, Pipeline age, Follow-ups, Workload and Applications. Read Definitions, compare Ask Ootla against the selected period, and export only as an allowed role. Period totals and linked cohorts are different metrics; current-state reporting is not a reconstructed historical snapshot. See [report definitions and scale](ootla-portfolio-reporting.md).

**Voice:** open /admin/voice as the original administrator. The retained demo starts disabled and contains no voice sessions. Deliberately enable local transcript playback and choose retention0 or a consciously approved policy; recording remains disabled. Select Harbor View's published channel and a scenario. Type a synthetic property question, test Silence/Unclear/Interrupt/Timeout/Provider unavailable, then try an actual native viewing slot. Inspect the linked lead/Conversation and a failed staff-transfer outcome. “Staff requests” counts handoffs requested, not telephone connections.

For private application guidance, use applications@demo staff, publish a channel for Willow Court - applicant demo in Conversations and enable Voice in that organization. In another tab of the same browser sign in normally as applicant@demo. Start Application next steps for that property's channel, choose Load current applicant portal session, select the authorized application and Verify before asking. Current actual applicant-session/grant proof is rechecked; staff names/checkboxes do not establish identity. The original administrator's organization cannot use this proof. Raw transcript access is additionally role-restricted.

At retention0, only the immediate in-memory response is visible; refreshing does not restore raw text. At positive retention, delete the transcript and refresh. A turn already in flight cannot restore deleted text; later deliberate turns can retain new text under current policy. Outcomes/canonical links remain. No audio, microphone, calls, recordings, payment authorization or applicant-decision tools exist here. See [voice guide](ootla-voice.md) and [UI walkthrough](stage-25-ui-walkthrough.md).

## Verification and measured scale

| Stage | Focused final evidence |
| --- | --- |
| 20 | 9 API groups, 4 actual Chrome groups; client/server TypeScript, responsive/keyboard states. |
| 21 | 11 API groups, 3 Chrome groups and 2 targeted conversation locking/privacy regressions. |
| 22 | 9 API groups, 8 no-network transport groups, 3 Chrome groups and responsive states. |
| 23 | 7 API groups, 4 Chrome groups, controlled metrics/cohorts, export/history permissions and isolated scale check. |
| 24 | 11 API groups, 4 Chrome groups; canonical access, files, invitation/session expiry, duplicate requests, reminders, connector failures and timezone/DST checks. |
| 25 | 8 core API groups plus 1 deletion-race group, 4 Chrome groups, 3 no-network adapter groups. |
| Final packaging | Both TypeScript projects; 213-module Vite build and compiled server; 4 compiled smoke groups covering real demo sign-ins, private routes, organization/session isolation and default-off voice. |
| Preservation | All 105 original rows across 94 prior business tables retained; all 17 earlier and 23 applied migration checksums match; 51 protected environment/lockfile/public/design hashes match. |

Scratch checks cleaned their owned databases/servers. The retained database received only additive migrations and deliberately scoped demo setup, not scale fixtures or verification CRM writes. Actual .env, dependency lockfile, previous records, authentication and approved public/dashboard artwork are preserved. No external outreach, paid model invocation, call, recording or deployment was activated.

An early Stage22 fixture omitted a revoke stub and attempted the official endpoint with a synthetic token; it failed, used no live credential and changed no customer operation. It was corrected to block non-fixture HTTP before I/O; final transport/race tests passed locally. No live Analytics authorization/report was verified. Other initial fixture/locator issues and discovered feature defects were corrected and rerun with focused gates. No outstanding check failure remains.

Final 2026-10-25 scale observations, after Stage24's task-scope query changes: Windows x64, Node22.22.0, 8 logical CPUs, 63.85 GiB RAM, project-owned local PostgreSQL, Vite/Express loopback and headless installed Chrome. Disposable dataset: 2,700 new properties, 2,700 leads, zero added units; seven fixture units unchanged. Repeat seed, 25-row pages, last page108 and single-result search passed.

| Measurement | Properties directory | Portfolio report |
| --- | --- | --- |
| First HTTP query | 122.46 ms | 335.16 ms |
| Warm median HTTP query | 88.42 ms | 241.54 ms |
| Largest normal response | 9,254 bytes | 18,159 bytes |
| Native browser page readiness | 2,857.86 ms | 2,919.00 ms |

This synthetic shared developer-machine workload is not an SLA, remote Apache VPS test, production concurrency test, dense activity-history test or bulk-document benchmark. Raw measurements are ignored .local/portfolio-scale-observations.json. The final build succeeds but warns about the shared minified JavaScript chunk exceeding500 kB (727.57 kB, 194.64 kB gzip); further code splitting is a remaining optimization, not part of this batch.

Reproducible focused commands: check:conversations, check:conversations-browser, check:automations, check:automations-browser, check:google-analytics, check:google-analytics-transport, check:google-analytics-browser, check:portfolio-reporting, check:portfolio-reporting-browser, check:portfolio-scale, check:resident-operations, check:resident-operations-browser, check:voice, check:voice-browser and check:voice-transport, each prefixed npm run. check:batch-smoke requires a current build and uses normal retained demo logins/read-only CRM access without workers; check:batch-preservation requires this checkout's ignored pre-batch baseline. Do not repeatedly run unrelated legacy full suites.

## Remaining external inputs

- **Live AI:** approved provider/model, server-only key, documented transport, organization policy, bounded token/request/cost budgets and explicit live pilot. Stage19 orchestration remains in use; no EliseAI commercial API is invented.
- **Email/SMS:** chosen documented provider/authentication, inbound reply/thread/callback specifications and verification, consent/quiet hours, explicit test-recipient allowlist and approved delivery pilot. There is no live email/SMS adapter or verified delivery in this demo.
- **Google Analytics:** enabled Admin/Data APIs, OAuth web client and exact callback, encrypted token key, accessible GA4 property/mapping and explicit non-demo authorization. Read-only reports only; sensitive CRM data is never uploaded. See the guide's official sources.
- **Yardi:** client's licensed interfaces, authorized documentation/sample payloads, credentials/property scope, supported read/write permissions and mappings, reconciliation and rollback. No universal maintenance write is claimed. Yardi accounting authority and configured source ownership stay intact.
- **Voice:** documented provider/ASR/TTS and authenticated replay-safe callbacks, authorized phone scope, verified caller identity policy, staff transfer destinations/availability and approved consent/retention/recording requirements. No number purchase, call, audio or recording was activated.
- **Google Calendar:** existing Stage14 official OAuth setup, server encryption key, selected calendars and actual authorization. Native booking works independently; each viewing's Google sync status remains separate. Only Ootla-owned events may be changed under current policy; ordinary demo actions send no real invitations.
- **Resident payments/renewals:** approved existing provider destination/status source and source-approved terms. Neither AI nor Ootla authorizes, captures, charges or refunds payments, approves applicants or signs renewals.

## Additive schema and configuration

Applied once and frozen:018_ask_conversations.sql,019_automations.sql,020_google_analytics.sql,021_portfolio_reporting.sql,022_resident_maintenance.sql,023_voice_assistance.sql. Existing configured checkouts run npm run db:migrate; no reset or reinstall is required here. .env.example documents optional safe Analytics settings and the disabled voice foundation; actual .env and secrets were not edited. No package dependency was added. Background workers start/stop with the normal API; voice retention cleanup can also be run deliberately with npm run voice:purge -- --limit=100.

[Progress log](ootla-progress.md), [verified architecture](ootla-architecture.md) and [build rules](ootla-build-brief.md) are updated. This batch stops after Stage25. Wait for user review or a new explicit instruction; Stage26 has not begun.
