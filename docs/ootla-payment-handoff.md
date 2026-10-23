# External payment handoff

Stage17 provides a destination and source-status handoff only. It does not authorize, create, capture, charge or refund payments, collect card details, create checkout/payment intents or authorize payment plans. Accounting remains with the client's provider or Yardi.

## Connected demonstration

Use the actual application in /admin/applications?application=<id> and the authorized participant's /applicant?application=<id> portal. Its payment panel initially says Verification needed/unknown. Open simulated payment provider creates a fifteen-minute opaque handoff bound to this participant, application and exact authenticated session. The /payment-demo fragment is stripped before asynchronous work; only a digest is stored on the server. Reloading the stripped page requires a fresh handoff from the portal. Expiry, revoked sessions and mismatched participants fail closed.

Create simulated provider confirmation changes the separate synthetic provider record, not CRM status. Return to the application and select Verify provider status. The adapter reads that provider record and records the observation with source and verification time. A repeated confirmation or request key does not duplicate the event. Query parameters, redirects and manually supplied status fields cannot confirm a payment. Demo observations remain visibly simulated; stale observations become Verification needed while preserving the last known status/time.

Staff can inspect the same application-scoped status and deliberately verify it. The converted resident relationship uses the same contact/application continuity, never another person's URL or a broad resident session. Organization/property and applicant-grant checks apply to every operation.

## Approved external destination

An organization administrator can configure one approved organization HTTPS portal in the staff application payment panel. The server rejects user-info, query strings, fragments, non-HTTPS and private/loopback host forms, and revalidates the stored destination when opening it. The browser cannot supply return URLs or alternate destinations at handoff. URLs contain no Ootla applicant/resident details. In DEMO_MODE the destination remains the local simulation even when an external link is configured.

For a non-demo deployment an enabled approved destination can open the external portal. This alone does not configure payment verification. With no documented callback/read adapter the status remains honestly unknown/unavailable and Verify reports missing configuration. No external provider request is made by the current implementation.

## Remaining client inputs

- Exact approved portal destination and any property-specific onboarding rules.
- Documented licensed status-read/callback interface, authentication and verification mechanism.
- Provider-to-contact/application/reference mappings and property scope.
- Freshness/reconciliation rules, permitted status vocabulary and pilot verification evidence.
- Server-only credential configuration after a documented adapter is implemented.

No commercial provider API, callback scheme, live status or payment authorization has been invented. The synthetic adapter is isolated from live processing.

## Installation and checks

Additive migration015_external_payment_handoff.sql adds approved destinations, application references, digest-only handoffs, separate synthetic records/events and action/observation receipts. Run npm.cmd run db:migrate; do not reset/reseed. Focused backend check: set $env:STAGE_CHECK='17', then npm.cmd run check:application-journey. Browser check: npm.cmd run check:payment-browser. Normal startup remains npm.cmd run dev.
