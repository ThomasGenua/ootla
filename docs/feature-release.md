# October 28 feature release

This release builds out staff workflows in the existing Ootla application. It does not deploy a service or activate a customer integration.

## Features

| Area | Staff experience | Boundary |
| --- | --- | --- |
| Lease to move-in | Existing six-stage workflow, recorded signature evidence, resident handoff and linked move-in tasks now have isolated browser coverage, including a lost-response retry. | Uploaded documents alone are never signature proof; live provider-owned leases still require a verified adapter. |
| AI assistant | Search permitted leads, generate summaries/follow-up drafts/next actions, retain history and mark drafts reviewed. Open it directly from a lead. | Demo templates are labeled. Live generation is opt-in. No messages, appointments, screening decisions or business changes are executed. |
| Team & access | Administrators invite individuals, choose roles/property assignments, deactivate memberships and revoke access links. | Invitations expire in 24 hours. Issuing invitations/recovery requires the administrator's current password. Links are displayed once for manual sharing; no email is sent. |
| Account recovery | An administrator issues a 30-minute recovery link for an individual account. Acceptance sets a personal password and invalidates all previous staff sessions. | Shared demo accounts and accounts in multiple organizations cannot use this recovery flow. Existing emails cannot be taken over through invitations. |
| Getting started | Portfolio, staff, routing, application and lease progress is calculated from saved records. | Recorded progress does not certify an external provider connection. |
| Analytics | Lead-creation cohorts, inquiry-to-tour rate, application completion, median days to lease, source performance, stages and overdue work; CSV export. | Organization, role and every lead property interest are scoped. A dash means no denominator/evidence. Demo/manual milestones retain their meaning. |
| Operator setup | Create an organization and its first individual administrator, then use normal login and Getting started. | Explicit database confirmation; no public signup route, existing-user adoption or password overwrites. |

Navigation: `/admin/ai`, `/admin/team`, `/admin/onboarding`, `/admin/analytics`, and the existing `/admin/applications` lease panel. Staff access links use `/staff/access#token=...`. Tokens are stripped from the URL on initial render, never stored in browser storage, and stored only as HMAC digests on the server. Treat the one-time links as credentials.

## Data and authorization

Migration `017_pilot_features.sql` adds organization AI settings, assistant requests and staff access links. It leaves existing application identities and records intact. The migration runner checks immutable migration checksums and can be rerun.

New endpoints live under `/api/pilot`. Staff operations revalidate the current session, membership, environment and permissions inside the transaction. AI generation checks full lead access again before saving its response. History and review are actor-specific. Existing membership/property APIs retain their original authorization and last-admin safeguards.

Team issuance/acceptance uses consistent organization/email/link lock ordering and row locks. Concurrent acceptance consumes one link once. An issuing administrator must still be active when a link is accepted. Recovery is limited to individual staff accounts with exactly one organization membership. It requires a new normal sign-in.

## Assistant configuration

The demo calls no model. For a separate non-demo installation, set `AI_ENABLED=true`, `OPENAI_API_KEY` and an explicit `OPENAI_MODEL` supported by your OpenAI project. Then an organization administrator enables the feature in AI settings. Defaults remain off. Keys remain server-only.

The Responses adapter uses strict structured output, `store:false`, a 25-second request timeout, an 1,800-token output limit and a 64 KiB response limit. Context contains intent/stage, recorded dates and open-task count; names, contact details, documents, internal notes and screening reports are excluded. Provider retention is governed by the provider/account configuration; `store:false` is not a claim of zero retention.

Requests are idempotent by organization, actor and request key, with a limit of 20 per actor per hour including failed requests. A key cannot be reused for a different lead/action. Pending requests older than five minutes become failed when the actor starts another request. Provider errors do not fabricate results; start a new request to retry a failed generation. Review is idempotent. No outbound tools are exposed to the model.

The adapter is covered using mocked provider responses. A real model invocation, account-specific model support and live output quality still need verification when the provider is configured. Reference: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Fresh organization setup

Use an explicitly selected Ootla database, `DEMO_MODE=false`, a random session secret and the intended `APP_URL`. Production requires HTTPS. Apply all migrations first. Never seed demo data into a live database.

Supply these through protected process environment variables or the hosting secret interface, then run `npm run setup:organization`:

- `OOTLA_SETUP_DATABASE`: exact database name from `DATABASE_URL`.
- `OOTLA_ORGANIZATION_NAME` and `OOTLA_ORGANIZATION_SLUG`.
- `OOTLA_ADMIN_NAME`, `OOTLA_ADMIN_EMAIL`, `OOTLA_ADMIN_PASSWORD` (16–128 characters).

The command creates a new live organization in standalone mode and a new administrator. Existing slug/email conflicts abort; it never modifies an existing identity. Clear setup secrets from the invoking environment after use. The compiled-container equivalent is `node dist/server/scripts/setup-organization.js`. Sign in normally, open Getting started and invite staff through Team & access.

## Verification

Use Node 24 and PostgreSQL client binaries matching the local server. `npm run env:setup` and `npm run db:local` create the project-owned development cluster on loopback port 55439. No retained customer/demo records are used by these checks.

```text
npm ci
npm run build
npm run check:release
npm run check:lease-browser
npm run check:pilot-browser
```

`check:release` runs screening, payment, lease and new-feature checks in separate uniquely named databases because failure-injection scenarios deliberately leave terminal screening failures. It also dumps the final synthetic fixture and restores it into another fresh database, comparing every table's data, including uploaded bytes and audit history. It verifies the cluster's absolute data directory, role and database ownership before cleanup. `check:pilot` and `check:backup` provide focused entrypoints.

Browser checks use installed Chrome (`OOTLA_BROWSER_CHANNEL` can select another installed Playwright channel), verify actual mutations/reload, permission restrictions, 320/390/768/1586-pixel layouts and absence of external requests. Screenshots go to ignored `.local/screenshots/`.

CI runs the same checks on Windows 2025 with its PostgreSQL/Chrome installations and separately builds the production Docker image on Ubuntu. Actions are pinned to reviewed commit IDs; permissions are read-only and checkout credentials are not persisted. CI needs no customer credentials. A green local run does not imply a green hosted run; inspect the PR checks.

## Deployment preparation and operations

The multi-stage Dockerfile builds the existing application and runs the compiled server as the unprivileged `node` user. `.dockerignore` excludes local environment files, database data and build output. Optional public SEO settings are build arguments; indexing remains off by default. Runtime needs `DATABASE_URL`, `SESSION_SECRET`, HTTPS `APP_URL` and `DEMO_MODE=false`. Google and AI stay off until explicitly configured.

Before switching traffic, run `node dist/server/scripts/migrate.js` with the intended database credentials, then verify `/api/ready` returns 200. `/api/live` only confirms that the process responds. `/api/ready` returns 503 for absent/unavailable databases or a missing release schema. The original `/api/health` remains available for compatibility.

Every response carries a generated `X-Request-Id`; API errors include that identifier. Structured logs record server errors and requests taking at least two seconds using only request ID, method, status and elapsed time. They exclude URLs, bodies, cookies, credentials and provider output. Configure the host's log/availability alerts against these signals when deploying. No external alert destination is created by this change.

Before a live migration, take a provider-managed backup and confirm its retention, encryption and restore procedure. The included round-trip test validates PostgreSQL dump/restore for synthetic records; it does not establish a production backup schedule, recovery objective or off-site backup. A rollback should restore into a separate database, validate schema/data/permissions there and switch the application after verification. Avoid destructive down migrations; use additive fixes for release 017.

Live pilot hosting/domain, Yardi interface activation, Google OAuth verification, actual AI generation and outbound delivery remain deployment/integration work. The user's latest direction prioritizes feature development; none of these external systems was activated here.
