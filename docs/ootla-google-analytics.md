# Google Analytics reporting — Stage 22

Open http://127.0.0.1:7673/admin/analytics. This is a native Ootla report, with no private Google administration iframe or tracking script.

## Local demonstration

Sign in with the existing organization-admin demo account. Open the connection controls, deliberately select the illustrative analytics property, optionally map it to a permitted CRM property, then choose a date range and comparison. Summary, acquisition, landing-page and event views are separate server-paginated reports. The Events view also lists configured key-event names separately, including configuration with no observed activity; an unavailable catalog is not an empty configured list. Every illustrative view is labelled; its numbers are synthetic website examples, never CRM results.

An unconfigured/revoked/unavailable report shows unavailable values rather than zero. A successful Google report that actually contains zero activity can show zero. Report source, selected property, reporting timezone, fetched time, cache freshness and data-quality warnings accompany the results. Previous comparison uses the immediately preceding equal-length range.

## Optional live setup

Use a separate non-demo deployment. DEMO_MODE prohibits live Google Analytics. Configure an authorized Google Cloud OAuth web client, enable the Analytics Data API and Analytics Admin API, and provide:

- GOOGLE_ANALYTICS_ENABLED=true
- GOOGLE_ANALYTICS_CLIENT_ID and GOOGLE_ANALYTICS_CLIENT_SECRET (server-only)
- GOOGLE_ANALYTICS_REDIRECT_URI equal to the exact APP_URL/api/google-analytics/oauth/callback
- GOOGLE_ANALYTICS_TOKEN_KEY: a newly generated random32-byte base64 key, stored outside source control.

Use HTTPS except for loopback development. Sign in as the current organization administrator, authorize the read-only analytics scope and select an accessible GA4 property. An optional CRM-property mapping controls which assigned staff may read that report. An unmapped organization-wide report is restricted to the organization administrator; it is not automatically split into individual buildings.

OAuth state/verifiers bind the exact initiating session, user, membership and organization, expire and are single-use. Tokens use authenticated server-side encryption with tenant/connection context. Refresh, disconnect and revoked access never expose tokens to the browser. Changing selection or disconnecting invalidates cached results. Fresh session/property/connection-owner permissions are checked even for cache hits.

No applicant details, private document contents or CRM outcomes are sent to Google. This stage adds reporting only, not measurement collection. Existing website events are not verified applications, payments or signed leases, and campaign/source counts do not prove that one channel caused an outcome.

## API and verification

The transport uses only Google's documented OAuth and read-only Analytics interfaces. Fixed endpoints, bounded requests/pagination, timeout/response limits and local test injection prevent arbitrary browser-supplied endpoints. The service adds organization-scoped rate controls and caches.

```powershell
npm.cmd run db:migrate
npm.cmd run dev
npm.cmd run check:google-analytics-transport
npm.cmd run check:google-analytics
npm.cmd run check:google-analytics-browser
```

Migration020 is additive. Actual.env, original records, existing Calendar configuration and dependencies are preserved. Google credentials and live behavior are not verified by the local illustrative adapter or mocked HTTP tests.

## Official sources checked

- [OAuth for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server) — authorization, offline refresh, state and PKCE.
- [Accessible account/property summaries](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list) and [property resource](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties) — authorized selection and reporting timezone.
- [Data API runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport) — date ranges, offset/limit and native report requests.
- [Dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema) — activeUsers, sessions, eventCount, keyEvents, sessionSourceMedium, eventName and landingPage without query strings.
- [Configured key events](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.keyEvents/list) — a read-only paginated catalog, separate from event counts.
- [Response metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData) — timezone, thresholding, sampling, empty results and truncation limitations.

Documentation was checked2026-10-25. No external account was authorized and no real Analytics data was retrieved during this implementation.
