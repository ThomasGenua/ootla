# Ootla live activation checklist

Updated 2026-10-26. This private operator/organization-owner register records implementation and activation gates; it is not a public product page or evidence that an external service is live. The retained interactive preview remains isolated. No external provider authorization, paid inference, real email/SMS, screening, signing, financial transaction or phone call was performed to prepare this register.

Native configuration does not supply missing vendor code. Complete implementation of an unsupported transport is a separate engineering task after approved client documentation is available. Never invent endpoints, authentication, payloads, write permissions, eligibility rules or successful results.

## Deployment prerequisites

- [ ] Use a separate non-demo customer database/deployment. Do not convert the retained demo database into production.
- [ ] Follow the actual [Apache guide](ootla-apache-demo.md), safe examples in `.env.example`, `deploy/apache/demo.env.example` and `deploy/apache/production.env.example`. Use the complete [environment guide](ootla-environment-guide.md), separate /etc/ootla/customer.env and /etc/ootla/preview.env, exact verified HTTPS origins, distinct database roles/cookie prefixes/secrets and loopback proxy/bind settings. The confirmed customer domain is https://ootla.ai; no preview hostname or target access is verified.
- [ ] Install/build the existing lockfile, apply additive migrations, pass database readiness and health checks. Do not reset/reseed during startup.
- [ ] Provision and verify the first real organization/admin through an approved onboarding process. This batch did not provision or verify a fresh production account; demo seeds are deliberately forbidden there and are not a production bootstrap.
- [ ] Confirm current staff organization/property scope and separate applicant/resident grants. Organization admin is never a platform superadmin.
- [ ] Secure server secrets and encryption keys outside frontend variables/source/logs; rehearse their recovery separately from the database.
- [ ] Agree privacy, consent, knowledge approval, retention/backups and accountable operational owners. No legal retention period or certification is supplied by Ootla.
- [ ] Keep live communication disabled until its documented provider, consent and verification gate is complete.
- [ ] Run synthetic acceptance in the authorized provider sandbox/pilot. Record actual source/time/status/reconciliation evidence in [/admin/integration-health](http://127.0.0.1:7673/admin/integration-health) and the pilot record; local fixtures do not establish Live verified.
- [ ] Verify recovery and rollback in a disposable environment before cutover. Earlier Stage 28 clean-install, startup, recovery, compiled-serving/authentication and restart checks passed as recorded in the progress log. They do not verify this follow-up's final release or the actual VPS. Target recovery/TLS/OS signals remain operator checks.

## Nine-service register

This is an engineering register for operators and authorized organization owners, separate from the runtime health labels. A service can have more than one remaining gate:

- **Implemented, awaiting credentials:** the documented transport exists; its required private settings are not supplied/verified.
- **Implemented, awaiting external authorization:** code exists, but the provider account, consent, permissions or selected resources still require authorization.
- **Missing implementation:** the live transport/verification path has not been implemented; adding a key cannot supply it.
- **Awaiting client/provider documentation:** the selected provider/interface, licensed access or authorized contract is still unknown.

The protected health page continues to report exactly nine external-service groups using observed states: Not configured, Simulated, Configured but unverified, Live verified, Degraded and Disconnected. A local fixture, saved credential or manual attestation must not be presented as a live-provider result.

| Service | Engineering classification | Existing capability and exact remaining gate |
| --- | --- | --- |
| Yardi | Awaiting client/provider documentation; missing live implementation | Connector scaffolding, simulator, mappings/ownership/cursors/jobs/conflicts exist. Need the client's licensed interface/version, authorized endpoints/authentication, property scope, payload/change contract and supported operation permissions before implementing live transport/mappings. |
| Google Calendar | Implemented, awaiting credentials; implemented, awaiting external authorization | Official OAuth/encrypted-token/selected-calendar/owned-event/durable-sync path exists. Need the five Calendar settings, Cloud API/client/consent setup, authorized staff grant, selected readable calendars and writable Ootla destination, then live acceptance. |
| Google Analytics | Implemented, awaiting credentials; implemented, awaiting external authorization | Read-only GA4 OAuth/Admin/Data reports and key-event catalog exist. Need the five Analytics settings, enabled APIs, authorized read-only account and selected accessible GA4 property, optional CRM access mapping, then real report comparison. |
| AI inference | Implemented, awaiting credentials; implemented, awaiting external authorization | Ootla orchestration, policies/fixed tools and official OpenAI Responses transport exist. Need approved project/model access, AI_API_KEY/AI_MODEL, positive budgets and operator-verified token prices, reviewed knowledge/policy and authorized live acceptance. Production starts disabled and never falls back to scripted answers. |
| Email/SMS | Awaiting client/provider documentation; missing implementation | Canonical conversation/consent/ownership/approval/retry structures exist. No selected live email/SMS provider, outbound transport, authenticated inbound threading or delivery callbacks are confirmed. Contact email alone is not transport configuration. |
| Screening | Awaiting client/provider documentation; missing live implementation | Consent, durable coordination/private synthetic reports and human decisions exist. Need an approved vendor/interface, request/result/callback authorization, report mapping and client review/retention policy before live implementation. |
| Signing | Awaiting client/provider documentation; missing live implementation | Lease evidence/manual attestation, isolated example milestones and move-in tasks exist. Need the approved signing provider/API, documents/templates/signers and authenticated signature evidence/callback contract before accepting live provider proof. |
| Payment-status verification | Awaiting client/provider documentation; missing live status implementation | Approved external destination handoff exists. Need authoritative read/callback documentation, identity/reference mapping, authentication and reconciliation/freshness rules. Redirects never verify funds. Resident preview external handoff remains unavailable/409. |
| Optional voice | Awaiting client/provider documentation; missing live implementation | Isolated typed conversation practice, native tools, retention and applicant-session proof exist. Need approved telephony/ASR/TTS/transfer providers, numbers, callback/caller verification and consent policy before live implementation. Recording remains disabled. |

### Native website chat is a separate Ootla channel

Website/in-app messages are persisted in Ootla; they are not email, SMS, a phone call or an external delivery receipt. Canonical contact/lead links, staff ownership, approved drafts, consent, property facts, secure booking and private-note separation are native capabilities.

**Verified local Step 4 evidence:** eight actual API groups passed against a fresh non-demo customer fixture with a restricted database role and all 27 migrations, including additive 027. They verified property-channel publication, duplicate-safe inquiry/inbound processing, contact non-merging, explicit consent and stable native message delivery; private notes/drafts stayed private. Quiet hours, STOP/cancellation, current authorization revocation, unpublishing and invalid tokens were enforced. With AI disabled, the inquiry and staff-help request persisted without a fabricated AI answer or completed task. No email, SMS or external transport was called. This verifies the native pathway locally, not an actual VPS or live provider. The nine-service external health register above is unchanged.

Production AI also passed seven native core groups plus the Ask draft guard: disabled/missing/error states did not silently use scripted replies or confirm actions. Seven controlled OpenAI transport groups and eight controlled GA4 transport groups passed without paid/external calls; real credentials, grants and provider behavior remain unverified. Direct local /try navigation now returns the intended 302 with no-store/noindex protection; it is not evidence of hosted DNS/TLS deployment.

Public website chat may use only deliberately published property channels and approved public knowledge. Private application/resident/payment information still requires the appropriate authenticated portal grant. A response, request, staff handoff or viewing is confirmed only after its normal service persists the relevant result.

### 1. Yardi

**Client inputs and authorization:** exact licensed product/interface and version, authorized documentation, authentication method, test/sandbox access, property identifiers/scope, permitted entities/fields, representative sanitized payloads, pagination/change semantics, rate/error/retry behavior and written read/write permissions.

**Native preparation:** organization admin opens [/admin/integrations?view=yardi](http://127.0.0.1:7673/admin/integrations?view=yardi). Review readiness and field ownership, configuration validation and unsupported responses. The Connection tab's functional Yardi demo uses separate synthetic provider records through the actual connector pathway; it is not a live badge. Credentials, when supported, remain encrypted server-side through CONNECTOR_CREDENTIAL_KEY; that key alone supplies no Yardi transport.

**Activation:** engineering implements only the documented supported transport/mappings behind the existing connector boundary, then completes the limited-property pilot below. Unsupported resident/payment-status or write capabilities remain explicitly unsupported.

**Verify:** source record counts/IDs/relationships, initial and incremental sync, changed availability/source/freshness, duplicate/out-of-order events, interrupted/retried pages, conflicts, pause/revocation and recovery. Preserve Ootla-owned staff work. See [readiness](ootla-yardi-readiness.md) and [pilot checklist](ootla-yardi-pilot-checklist.md).

### 2. Google Calendar

**Inputs/authorization:** authorized Google Cloud project, Calendar API, OAuth consent/audience verification as applicable, Web OAuth client, approved staff accounts/calendars and writable destination. Registered redirect must exactly equal APP_URL + `/api/google-calendar/oauth/callback`.

**Native configuration:** in a separately authorized non-demo deployment set server-only GOOGLE_CALENDAR_ENABLED, GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI and a separate random base64 32-byte GOOGLE_CALENDAR_TOKEN_KEY. Restart, sign in normally and authorize at [/admin/calendar?view=google](http://127.0.0.1:7673/admin/calendar?view=google). Select calendars deliberately. No credential belongs in a VITE_ variable.

**Verify:** one synthetic native tour maps to one owned Google event; reschedule/cancel affect that event only. Test initial/delta pagination, invalid-sync-token recovery, uncertain-response retry, remote edits/conflicts, disconnect and revoked access. Local booking success must remain separate from sync status. This implementation sends no attendees and uses `sendUpdates=none`; ordinary demo actions cannot send real invitations.

**Limits:** no permission to edit arbitrary third-party events or treat cached Google coverage as atomic availability. See [Ootla setup](ootla-google-calendar.md), [official OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) and [incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync).

### 3. Google Analytics

**Inputs/authorization:** client GA4 property access, enabled Analytics Admin/Data APIs, Web OAuth client, approved read-only consent and verified website reporting expectations. Redirect: APP_URL + `/api/google-analytics/oauth/callback`.

**Native configuration:** set server-only GOOGLE_ANALYTICS_ENABLED, GOOGLE_ANALYTICS_CLIENT_ID, GOOGLE_ANALYTICS_CLIENT_SECRET, GOOGLE_ANALYTICS_REDIRECT_URI and a separate GOOGLE_ANALYTICS_TOKEN_KEY in non-demo. Authorize at [/admin/analytics?configuration=1](http://127.0.0.1:7673/admin/analytics?configuration=1); select an accessible property and optional CRM-property access mapping.

**Verify:** compare native source/date/timezone/active-users/session/event/key-event reports with the authorized property. Test pagination, configured zero-activity event names, date comparison, permission change, thresholds/sampling/truncation, refresh/revocation and disconnect. Missing data must remain unavailable, not zero.

**Limits:** reporting only; this feature does not install measurement/tracking or upload CRM conversions. Website events are not verified applications, payments or leases. See [Ootla guide](ootla-google-analytics.md) and [official report method](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport).

### 4. AI inference

**Inputs/authorization:** approved provider/data-processing terms, available model, server credential, knowledge/public-text approval policy, permitted tools/intents, action approval, measured costs and usage limits. AI must not approve/reject applicants, score protected characteristics, invent terms or authorize payments.

**Native configuration:** customer production stays AI_PROVIDER=disabled until the approved live setup is complete. Production rejects AI_PROVIDER=simulated. To activate the implemented transport in non-demo, select AI_PROVIDER=openai and configure Ootla's server-only **AI_API_KEY** and AI_MODEL. The key name is Ootla configuration, not the official quickstart's environment-variable name. Configure the existing rate/token/daily-cost/timeout fields with operator-verified prices; no current model or price is invented here. Keep keys server-side as described in the [official API overview](https://developers.openai.com/api/reference/overview) and [quickstart](https://developers.openai.com/api/docs/quickstart).

Organization admin controls are [/admin/organization?tab=ai](http://127.0.0.1:7673/admin/organization?tab=ai), Knowledge and Property documents; [/admin/ai](http://127.0.0.1:7673/admin/ai) remains the dedicated property workspace. Approve only authorized reviewed text. Private identity/screening documents are excluded from general retrieval.

**Verify:** grounded source links, exact native checklist/availability, no mutation before explicit confirmation, one durable task on retry, current role/property/source retirement during in-flight inference, quota/failure handoff and public/private separation. A live failure must remain a failure or useful native/staff next step; it must never silently substitute a scripted preview result. Record an actual authorized provider result before claiming live inference.

**Limits:** no paid/live call occurred in this batch. Demo blocks live inference. Property source PDF/OCR parsing and automatic binary indexing are not implemented. See [orchestration](ootla-ai-orchestration.md) and [operational policy](ootla-operational-controls.md).

### 5. Email/SMS

**Inputs/authorization:** approved providers and documented outbound/inbound APIs, sender/domain/number ownership, consent/opt-out policy, webhook authentication, delivery receipts, rate limits, quiet hours, retention and authorized test recipients.

**Native preparation:** [/admin/conversations?settings=1](http://127.0.0.1:7673/admin/conversations?settings=1) manages explicitly published property website-chat channels; [/admin/automations](http://127.0.0.1:7673/admin/automations) manages eligibility/approval/pause and native follow-up. These native pathways do not configure external email or SMS. The verified contact address hello@ootla.ai is only a contact-mailto destination, not a selected messaging provider, SMTP account, verified sender or inbound transport. No invented sender, reply address or webhook-secret setting is added.

**Activation/verify:** implement the approved missing transports first; no environment flag activates live messaging today. Exercise one synthetic inbound inquiry, canonical contact/lead linking, deduplicated provider callbacks, truthful queued/sent/delivered/failed status, takeover/reply/stage-change cancellation, quiet hours and bounded retry. Never replay a completed message or leak an internal note. OUTBOUND_MODE currently accepts simulation only; changing it cannot activate a live transport. Add documented provider configuration only with a supported implementation and separately authorized controlled pilot.

### 6. Screening

**Inputs/authorization:** an approved provider/interface, client-defined screening process, purpose/version consent, authorized requesting/review staff, source/report mapping, callback authentication and private report/retention requirements.

**Native preparation:** authorized staff uses the selected application in [/admin/applications](http://127.0.0.1:7673/admin/applications). Review real consent and the clearly synthetic demo provider/results; human decisions are separate from provider results.

**Activation/verify:** implement the approved missing live transport; validate consent/current participants/property scope, one request under retries, signed/replayed/invalid callback handling, private report access, failure/revocation and explicit staff decision/audit. No eligibility thresholds or provider policy are supplied by Ootla. Live screening remains incomplete.

### 7. Signing

**Inputs/authorization:** approved signature provider, licensed API/webhooks, signer/participant identity, actual document/template/version, signature proof vocabulary, consent, property scope and retention.

**Native preparation:** staff Applications' lease workflow configures milestones/evidence and move-in task templates. Manual attestations and Demo events are visibly distinct. Uploading a PDF never proves an electronic signature.

**Activation/verify:** implement the documented provider transport/proof verification before accepting provider-verified evidence. Test signer scope, unique envelope/event mapping, invalid/repeated/out-of-order callbacks, revoked proof, lease milestone guards and unit conflicts. Do not make a lead Leased merely from a card move. See [lease workflow](ootla-lease-move-in.md). No live e-sign transport is currently implemented.

### 8. Payment-status verification

**Inputs/authorization:** the client's approved existing HTTPS payment destination, authoritative Yardi/provider status-read or callback documentation, authentication/verification, reference/contact/application mapping, freshness/reconciliation policy and read-only status authorization.

**Native configuration:** organization admin configures the approved destination in the staff application payment panel. Ootla rejects unsafe destinations; browser-supplied return/status URLs do not verify payment. A non-demo approved destination can open the existing provider, but it does not configure a live status adapter.

**Activation/verify:** implement the documented missing status transport. Verify one permitted-source observation and its source/time/freshness, duplicate events, unknown/stale/failure states, current applicant/resident grants and forged redirect/query refusal. Accounting authority stays in Yardi/the provider.

**Limits:** applicant demo confirmation changes a separate synthetic provider record, followed by a distinct adapter read; it moves no money. Resident demo external handoff is deliberately unavailable/409. Ootla has no payment authorization, capture, charge, refund or plan-approval capability. See [handoff boundaries](ootla-payment-handoff.md).

### 9. Optional voice

**Inputs/authorization:** approved telephony/ASR/TTS providers/interfaces, numbers, callback authentication, trustworthy caller identity proof, operational handoff destination, client-approved consent and retention, and explicit pilot authorization.

**Native preparation:** [/admin/voice](http://127.0.0.1:7673/admin/voice) is disabled by default. An authorized admin can enable local typed transcript playback only in isolated demo. It shares normal tools/policy/native booking and canonical conversation/timeline records. Recording is unsupported/disabled; raw transcript retention defaults to zero.

**Activation/verify:** implement the missing real transports and caller-verification boundary first. A caller name/email or staff checkbox cannot establish applicant access; the current local demonstration uses an actual authorized applicant portal session. Test actual interruption/silence/timeouts, policy/revocation, failed booking/transfer, no duplicate actions and protected transcript expiry. A requested staff handoff is not a connected phone transfer. No live call/audio or recording was verified. See [voice guide](ootla-voice.md).

## Limited-property Yardi pilot

The four evidence gates remain independent. Nothing in this register supplies a universal Yardi API or write permission:

| Gate | Current evidence |
| --- | --- |
| Scaffolding implemented | Guarded adapter interfaces, validation, ownership/mapping structure, unsupported responses and functional simulator |
| Mapping tested | Synthetic contracts only; client's actual schemas/payloads not supplied |
| Credentials configured | No client live credential/configuration verified |
| Live behavior verified | No live Yardi behavior observed |

1. **Confirm access:** identify exact licensed interfaces/version and approved read/write capabilities. Obtain authorized docs, sanitized samples, test account and engineering/client owners.
2. **Limit scope:** select a small explicit property set and external IDs. Keep properties and units distinct; 2,700 properties must not become 2,700 units.
3. **Agree ownership/mappings:** properties/units and configured contact/guest-card fields remain authoritative in Yardi. Application/lease/resident source fields follow the licensed documented interface; unsupported entities stay unsupported. Staff notes, tasks, local ownership/workflow and approved knowledge are Ootla-owned. Accounting and payment facts remain provider-authoritative.
4. **Verify reads/reconcile:** implement only supported reads, preserve source/verification times, compare counts/IDs/relationships and sample authoritative fields with client expectations before advancing cursors. Record discrepancies instead of claiming completeness.
5. **Consider approved writes:** enable only documented, explicitly authorized capabilities after sandbox evidence. No universal write access or automatic lease/accounting writeback exists.
6. **Exercise resilience:** repeat initial/delta pages/events, stale changes, duplicates, timeouts/conflicts and restart. Verify receipts/mappings/cursors and reconciliation without overwriting later staff work.
7. **Pause/recover/sign off:** capture backups and current mapping/cursor/revision evidence; deliberately disconnect/pause and revoke access. Retain receipts/audit/history. Test compensation/restore in a disposable environment, preserve subsequent CRM work and require client review before resuming or expanding scope.

Use the detailed [pilot checklist](ootla-yardi-pilot-checklist.md). No production activation, DNS change or real external write is authorized by checking boxes in this document.
