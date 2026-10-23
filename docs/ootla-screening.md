# Screening coordination and staff review

Stage16 uses the real application and participant identities. Staff: /admin/applications?application=<id>; applicants: /applicant?application=<id>. The separate applicant demo uses applicant@demo.ootla.test and its own applications@demo.ootla.test staff organization. Normal sign-in and property grants apply; no impersonation.

## Demonstration

After submission, each participant records the separate demo-screening-v1 consent in their own portal. General application consent does not authorize screening. Staff requests a synthetic screening. Advance demo screening processes one durable step: Submitted → Provider reviewing → Report received → Staff review pending. An authorized organization administrator or property manager explicitly records report review, then records an independent application decision with a reason. A report is neither approval nor rejection.

Simulate temporary provider failure persists a failed state and bounded retry delay. Retry after the displayed time; three failed attempts exhaust the job. Each API action has a stable request key and payload receipt. Jobs, provider records, callback receipts, reports and audit/history survive restart. Refreshing performs reads and does not submit work. Report downloads require current review-role, organization and every related property grant; private report bytes are never part of the broad workspace or AI context.

Demo callbacks have a separate raw-body endpoint, namespaced HMAC and five-minute timestamp verification. This is Ootla's synthetic protocol only; it is not a claim about an unknown commercial provider. Demo processing requires server-verified isolated DEMO_MODE and demo organization. Non-demo requests stay Not configured and do not fall back to a simulator.

## Live activation inputs still required

- Client-approved screening provider and authorized interface documentation, authentication and callback verification specification.
- Licensed property/application scope, provider identity mapping and reconciliation rules.
- Exact applicant consent purpose, version and wording; required notices and human review procedures supplied by the client.
- Sensitive-report access, retention/deletion policy and secure provider credential configuration.
- Sandbox evidence for transport, idempotency, callback authenticity, retries, report authorization and pilot reconciliation before any live activation.

No live provider, jurisdictional threshold, commercial API, notices or retention rules have been invented. Policy settings visibly remain awaiting client configuration. No real screening request or notice is sent by the demo. Application decisions are authorized staff records and do not overwrite Yardi-owned application state.

## Persistence and checks

Additive migration014_screening_review.sql introduces purpose-specific consents, requests, durable jobs, separate synthetic provider records, private reports, event/action receipts and staff decision history. Earlier migrations remain immutable. Run npm.cmd run db:migrate once when upgrading; no reset/reseed is needed. Focused checks: STAGE_CHECK=16 npm.cmd run check:application-journey and npm.cmd run check:screening-browser (PowerShell: set $env:STAGE_CHECK='16' first).
