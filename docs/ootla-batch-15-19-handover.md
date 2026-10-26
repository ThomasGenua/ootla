# Ootla Stages 15–19 handover — 2026-10-24

The authorized batch is complete through Stage 19. No Stage 20 work, deployment, live provider activation, outbound communication or paid inference was performed. All components remain within the independent Vite/vanilla TypeScript + Express + PostgreSQL Ootla project.

## Completion and external boundaries

| Stage | Implemented and verified | Simulated or awaiting configuration |
| --- | --- | --- |
| 15 Applicant portal | Existing secure invitations/sessions, own-record access, save/resume, private validated documents, consent/submission, staff synchronization and read-only preview reverified. | Demo invitation is copied deliberately; no email/SMS delivery. Malware-scanning service not configured. |
| 16 Screening/review | Purpose/version consent, durable jobs, bounded retries, authenticated duplicate-safe demo callbacks, private reports and explicit human decisions. | Synthetic provider only. Live provider/interface/credentials, consent/notices and retention require client input. |
| 17 Payment handoff | Approved HTTPS destinations, secure applicant/session-bound handoff, provider-status source/time/freshness and duplicate protection. | Local provider confirms through its separate event/read flow. Live reads/callbacks await documented interfaces. No financial authorization/collection. |
| 18 Lease/move-in | Six stages, evidence/transition guards, configurable Leased milestone, canonical contact/resident continuity, unit conflicts and duplicate-safe routed move-in tasks. | Manual attestation and isolated demo events; no verified live signing/Yardi transport. Uploaded PDF is not signature evidence. |
| 19 AI orchestration | Scoped approved knowledge, actual CRM tools, bounded structured inference, server-authorized native tasks, saved-result verification, operational traces and dedicated AI page. | Explicit Simulated AI in demo. Optional official OpenAI transport verified with local stubs only; no live credentials/model behavior verified. |

## Start the current Windows project

The database and preview were running and healthy at handover. No seed, reset or new dependency installation is needed for this existing checkout. From a new PowerShell terminal:

```powershell
Set-Location C:\Users\user\Documents\software\Ootla
npm.cmd run db:local
npm.cmd run db:migrate
npm.cmd run dev
```

For a fresh source checkout, run npm.cmd ci first and prepare a private .env from .env.example using the established setup instructions. Deliberate isolated-demo setup is npm.cmd run db:seed and npm.cmd run demo:applicant; neither belongs in ordinary startup. Do not reset the retained database.

To build: set the session-only $env:RAYON_NUM_THREADS='1', then npm.cmd run build. The local development origin remains http://127.0.0.1:7673; the API is http://127.0.0.1:3100 and project-owned PostgreSQL is on127.0.0.1:55439.

| URL | What opens |
| --- | --- |
| http://127.0.0.1:7673/ | Preserved public website. |
| http://127.0.0.1:7673/admin/login | Normal staff authentication. |
| http://127.0.0.1:7673/admin/applications | Actual applications, screening, payment observation and lease/move-in detail. |
| http://127.0.0.1:7673/applicant/login | Separate applicant authentication. |
| http://127.0.0.1:7673/admin/ai | Authenticated Simulated AI workspace. |
| http://127.0.0.1:7673/admin/tasks | Actual native follow-up and move-in tasks. |
| http://127.0.0.1:7673/admin/calendar | Preserved native scheduling. |

Demo accounts use real hashed passwords and server sessions:

| Account | Email | Password |
| --- | --- | --- |
| Existing staff demo | admin@demo.ootla.test | OotlaDemo!2026 |
| Separate applicant-journey organization staff | applications@demo.ootla.test | OotlaDemo!2026 |
| Separate applicant | applicant@demo.ootla.test | OotlaApplicant!2026 |

Use the applicant-journey staff for its application; the original staff account cannot cross organizations. Credential-fill buttons fill masked fields and still require normal Sign in.

## One connected manual walkthrough

1. Sign in as applications@demo.ootla.test. Open the Demo Applicant application at **Willow Court - applicant demo**, unit1A. Alternatively create a linked application from an existing leasing lead through Applications → Create linked application.
2. Under Secure invitations select the applicant and expiry, then **Create private invitation** and copy the participant-bound link. Open it in a separate browser/private window. The existing demo applicant redeems it with OotlaApplicant!2026; a new applicant establishes their own password. Expired/reused links are rejected. No invitation is delivered automatically.
3. Save personal details, upload invented test files for the actual checklist, record versioned application consent, mark the applicant section ready and submit. Refresh demonstrates persistence. Optional co-applicants use their own invitations/accounts only when enabled.
4. Back in staff Applications, refresh the application and open its connected lead. Submission/progress appears in the real timeline. Read-only staff preview cannot submit or modify applicant data.
5. In the applicant portal record separate screening-purpose consent. Staff selects **Request demo screening**, then **Advance demo screening** through three provider steps. Review the private report, **Record staff report review**, and keep the human decision separate. Simulate failure exposes a retry time and bounded failure limit.
6. Applicant opens **Open simulated payment provider**, selects **Create simulated provider confirmation**, returns to the application and selects **Verify provider status**. The provider observation now displays its synthetic source/time. Forged return parameters cannot confirm it; stale or unsupported live reads show verification-needed/unknown.
7. Authorized staff records an explicit approval with its reason. As organization admin, configure lease milestone/task templates if needed. Select **Create lease preparation** with valid dates.
8. Advance Signature requested → Partially signed → Fully signed → Move-in scheduled → Completed using Demo event evidence and explanatory references. Move-in time is interpreted in the displayed property timezone. Use an already elapsed synthetic time to demonstrate Completed. Check the configured Leased milestone, original contact history, resident relationship, single lease and once-created owned/unassigned tasks.
9. Open AI assistant with the same property and application context. Add an approved synthetic property FAQ, ask a grounded question, inspect current viewing options or missing checklist items, then request a follow-up task. **Open saved task** appears only after saving and verifying it. Its retry returns the same task. After conversion, follow-up uses the original contact/property while preserving the application context. An approval/payment request is refused.

For the five AI scenarios and missing-fact behavior see [AI guide](ootla-ai-orchestration.md). For transitions/evidence see [lease guide](ootla-lease-move-in.md), [screening guide](ootla-screening.md) and [payment guide](ootla-payment-handoff.md). Test actions deliberately persist; refresh does not reset the demo.

## Focused verification

- Stage15:10 backend and8 isolated browser groups reverified.
- Stage16:7 backend and6 browser groups passed.
- Stage17:5 backend and5 browser groups passed.
- Stage18:6 core backend groups plus targeted guards/preservation checks;4 browser groups and canonical lease/resident/task/document postconditions passed. Date-only/Lagos/Los Angeles/UTC and DST gap/ambiguity cases passed.
- Stage19:7 backend,7 no-network transport and5 browser groups passed. Three narrow connected-workflow groups verified completed-lease → actionable AI task continuity, exact task/header counts, duplicate replay and integer-safe estimated cost accounting.
- Hosted demo:2 groups passed, covering additive preservation plus safe configuration, actual staff/applicant cookie flags, compiled private shells/CSP/auth gates and loopback-proxy-aware rate limits.
- Both TypeScript projects,184-module client/public pre-render and server build passed. Three public SEO/layout/auth groups passed against final build.
- All67 pre-existing business-table fingerprints,13 previous migration checksums and68 protected source/environment/dependency/public files match the pre-batch baseline. All17 applied migration files match database checksums. New data tables/columns are additive.
- Scratch mutations ran in uniquely owned disposable databases and were cleaned. Retained preview smoke returned200 for homepage/staff/applicant login, ready health, and401 for anonymous AI access.

Final tests have no outstanding functional failures. An intermediate optional UI label edit caused a TypeScript parse failure; it was repaired and the final full build/browser checks passed. Vite emits a non-blocking warning for the535.44kB minified main JavaScript chunk; code splitting is a future performance task, not a runtime failure.

## Migrations, configuration and live dependencies

Applied additively:014_screening_review.sql,015_external_payment_handoff.sql,016_lease_move_in.sql and017_ai_orchestration.sql. Earlier migrations, records, users, passwords and actual .env remain unchanged. No new repository dependency or paid CI was enabled.

.env.example adds server-only AI provider/model/credential, rate/token/cost and timeout fields. Defaults remain simulated. Positive operator-approved token prices and explicit non-demo setup are required for optional live OpenAI; live inference is forbidden in demo mode. General AI retrieval never includes complete identity documents or screening reports.

Live operation still needs approved screening/signing/payment/Yardi interfaces, scopes, mappings, server credentials, verified callback/read rules and client consent/notices/retention. Google Calendar keeps its separate existing OAuth configuration. Live communications and Stage20 delivery remain outside this batch. Accounting authority stays in Yardi.

## Apache VPS request

The requested Ubuntu/Debian isolated online demo guide and ready-to-edit Apache/systemd/environment templates are in [Apache demo setup](ootla-apache-demo.md) and deploy/apache/. They proxy the whole compiled app with HTTPS, Secure cookies, a dedicated database and trusted loopback proxy configuration. Local hosted-mode behavior was verified; no VPS, DNS, certificate or production deployment was accessed or changed. Replace the placeholder domain and run apache2ctl configtest on the actual server before reload.

**STOP: the batch is complete through Stage19. Wait for user review or another explicit instruction.**
