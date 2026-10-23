# Google Calendar in Ootla — Stage 14

Stage 14 connects an optional Google account to the native Calendar. This document describes implementation boundaries; final verification evidence is recorded in [progress](ootla-progress.md). A passing mocked API check is not a verified live Google account.

## Open and use

Normal login: http://127.0.0.1:7673/admin/login
Native calendar: http://127.0.0.1:7673/admin/calendar
Google setup: http://127.0.0.1:7673/admin/calendar?view=google

Use the existing demo fill button, then normal Sign in. Demo mode shows its honest Google state and keeps day/week/agenda, property schedules and local viewing records independent of Google. No account is automatically authorized and ordinary demo actions cannot send Google invitations or requests.

For a local walkthrough, open a lead and choose Schedule viewing. Configure its property's actual timezone, duration, buffers and meeting location plus eligible staff availability in Calendar. Choose an offered future time; save the viewing, refresh, reschedule or cancel. Its local save survives a missing/failed Google connection. Legacy sample viewings have incomplete scheduling metadata and remain labeled read-only.

## Separate non-demo Google setup

1. Use a separate non-demo Ootla organization/deployment and current eligible staff account; never convert the retained demo customer database into live mode.
2. Create a Google Cloud project, enable Google Calendar API, configure its OAuth consent screen/audience and approved test users as appropriate, and create a Web application OAuth client. Obtain any Google-required verification before public use.
3. Add the exact authorized redirect URI: the deployment's APP_URL followed by /api/google-calendar/oauth/callback. Use HTTPS outside local loopback development. Register the actual origin; do not infer it from an untrusted request header.
4. Configure GOOGLE_CALENDAR_ENABLED=true, GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI and GOOGLE_CALENDAR_TOKEN_KEY on the server only, with DEMO_MODE=false. The token key is a separate random canonical base64-encoded 32-byte key, held securely outside source control. Never use a VITE_ variable for any secret. Keep actual .env values private.
5. Apply additive migrations with npm.cmd run db:migrate, restart the server, sign in normally, open Calendar → Google Calendar and deliberately authorize.
6. Select calendars to read and one writable destination. The grant belongs to that staff member in the current organization. Review status/coverage, request synchronization and check the resulting Ootla-owned events in that approved account.
7. Run the live acceptance checklist below with synthetic records before using customer data.

Scopes are calendar.calendarlist.readonly (calendar discovery) and calendar.events (read/write events). Ootla imposes its narrower selected-calendar and owned-event policy on the backend. No broader event-editing mode or attendee invitation mode is enabled by this stage. Google may require consent/verification for the requested scopes. OAuth application testing and refresh-token limitations depend on the Cloud project's configuration. See [Google's OAuth web-server guide](https://developers.google.com/identity/protocols/oauth2/web-server), [consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent) and [token expiration guidance](https://developers.google.com/identity/protocols/oauth2#expiration).

## Security and synchronization

OAuth state is short-lived and tied to the exact Ootla session, staff identity and organization. The verifier and access/refresh tokens remain authenticated-encrypted server-side, bound to their tenant/connection purpose. Tokens, OAuth codes and provider response bodies are never returned in Ootla status/diagnostics or logged. Disconnect removes local token access and stops jobs; revoked authorization requires reconnection.

Each Ootla tour maps to a deterministic Google event identifier and private ownership proof. Updates/deletes require the corresponding owned mapping and conditional ETag, protecting unrelated events and conflicting remote edits. Durable jobs, unique mappings and replay-safe reconciliation avoid creating a second event after an uncertain response. Rescheduling keeps the local tour identity. Cancellation targets the mapped owned Google event only. Events contain no attendees and requests use sendUpdates=none; this stage does not implement customer invitations. Google can have its own account-level behavior, so demo safety relies on blocking real requests, not a blanket claim about provider notification settings. See [event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) and [conditional modifications](https://developers.google.com/workspace/calendar/api/guides/version-resources).

Initial and incremental synchronization use bounded paginated jobs. The provider cursor advances only after all pages commit; retries preserve the same incremental base token and page sequence. HTTP410 invalidation rebuilds the Google mirror/cursor without deleting local tours, lead history or owned mappings. Read-only Busy intervals omit external event titles, descriptions, contacts and attendee details. Repeated/all-day Google events are represented by returned instances and the provider calendar timezone. Cached coverage and last-success status are visible; a cached Google calendar is not an atomic guarantee of external availability. See [incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync) and [Events.list restrictions](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

Initial/full mirror coverage is 30 days before synchronization through 365 days ahead, refreshed fully every seven days. Incremental pulls become due after 15 minutes; each bounded worker pass handles up to two actions/pages with 100 events requested per page. Transient jobs retry at most five times with exponential delay. Coverage, last success and failures are reported in the native page. The background worker performs bounded passes and retains retry/error states. A provider failure does not roll back a successful local booking. Google edits do not silently change confirmed Ootla appointments; reconcile reported conflicts deliberately.

## Live acceptance checklist — not yet verified

In an authorized non-demo test account: consent and select calendars; create one synthetic tour; observe one mapped event; reschedule it; cancel it; simulate transient failure and an uncertain insert response; verify one event with no duplicate attendee invitations; change/revoke Google access; verify degraded/revoked state and reconnection; exercise multi-page initial/delta sync and invalid-token recovery; verify a foreign Google event remains unchanged; verify private details never appear to another staff member, organization or public booking recipient.

No Google client credentials or authorized account were provided for this run. Cloud configuration, real consent, refresh/revocation, account-specific calendar permissions and actual Google event behavior require that live acceptance step. Functional code and synthetic protocol checks must be distinguished from those remaining checks.

## Commands

From C:/Users/user/Documents/software/Ootla:

~~~powershell
npm.cmd run db:local
npm.cmd run db:migrate
npm.cmd run dev
~~~

Do not reset or reseed retained records. No new package is required. The optional single bounded worker pass is npm.cmd run google-calendar:process; disabled/demo configuration performs no external work. Focused verification is npm.cmd run check:google-calendar. Final build: npm.cmd run build (a session-only RAYON_NUM_THREADS=1 can reduce memory use on this host).

STOP after Stage 14; no deployment, live authorization or later stage is automatically started.
