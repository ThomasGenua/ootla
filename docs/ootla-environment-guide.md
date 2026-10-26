# Ootla environment guide

Verified against the current configuration schema and consumers on 2026-10-26. Ootla has **40 server/bootstrap settings and two public website build settings**. This guide lists all 42; it does not introduce unused provider keys.

The confirmed customer domain is **https://ootla.ai**. No accessible deployment target or approved preview hostname has been supplied. A hostname such as https://preview.example.com in a template is a placeholder, not a deployed service.

## Files to edit

| File | Purpose |
| --- | --- |
| Project-root `.env` | Existing local preview configuration. Its eight original values were preserved; missing entries were appended without rotating credentials, resetting records or changing retained accounts. Keep this separate from production. |
| [.env.example](../.env.example) | Safe local reference with all settings. It is not a replacement for an existing private file. |
| [deploy/apache/production.env.example](../deploy/apache/production.env.example) | Customer template. Make a private copy at `/etc/ootla/customer.env`; replace required placeholders there. It starts with AI disabled and demo access off. |
| [deploy/apache/demo.env.example](../deploy/apache/demo.env.example) | Separate preview template. Make a private copy at `/etc/ootla/preview.env`; retain the preview database/accounts and use an approved separate hostname. |
| `/etc/ootla/customer.env`, `/etc/ootla/preview.env` | Intended private runtime files on the VPS. Their existence, values and deployment have not been verified. Never place them in Apache's public document root or source control. |

Use the existing values for the retained preview. Do not replace `.env` with a template or run a seed/reset to apply configuration. A real customer organization is provisioned separately; public preview users are never copied into it.

Set `NODE_ENV=production` in the service launcher before Node starts for the customer runtime. The server then reads a deliberately selected private file or already-injected process variables, and does not silently fall back to the repository `.env`. Set `OOTLA_ENV_FILE` in the launcher if choosing a file; putting a path inside an unselected file cannot select that file. Existing process variables take precedence over file entries. Use absolute private paths. The hosted templates include their own matching OOTLA_ENV_FILE values, /etc/ootla/customer.env and /etc/ootla/preview.env, so the file selected by the service also keeps subsequent application utilities on the intended runtime.

## How to apply and verify settings

In the tables, **R** means restart the API service, including its existing workers; restart local Vite too when changing the development origin or API port. **B** means rebuild and release the website, then restart the compiled service. Editing a file alone does not change a running process or previously built HTML.

Verification references:

- **Core:** configuration loads, `/api/health` returns HTTP 200 with database ready, and normal sign-in/refresh/logout succeeds.
- **Pair:** `node --import tsx scripts/validate-runtime-pair.ts /etc/ootla/customer.env /etc/ootla/preview.env` validates the two private configurations without printing values. It does not prove PostgreSQL privileges, certificates or remote reachability.
- **Owner:** sign in as the current organization's administrator. Configuration and diagnostics remain scoped to that organization; this role is not a platform administrator.
- **AI:** review the assistant's owner settings and use controlled synthetic records only after live testing has been separately authorized. Successful local protocol tests do not verify an external account.
- **Calendar:** `/admin/calendar?view=google`, including selected calendars and actual synchronization status.
- **Analytics:** `/admin/analytics`, including selected website, access scope, report dates and freshness.
- **SEO:** inspect built canonical metadata, `/robots.txt`, `/sitemap.xml` and runtime noindex headers.

The settings tables describe checks to perform. They do not claim credentials, grants, live providers or a VPS have already been verified.

## Application, database and security

| Setting | Purpose and requirement | Value source | Apply | Verify | Additional setup |
| --- | --- | --- | --- | --- | --- |
| `OOTLA_ENV_FILE` | Optional explicit private runtime file; strongly recommended for hosted launches. Blank selects no file itself. | Operator's absolute path, separately for each runtime. | R | Unreadable selected files fail without fallback; run Core/Pair. | Set it in the launcher before startup, or inject a systemd EnvironmentFile. Restrict file access. |
| `NODE_ENV` | Runtime policy: development, test or production. Required explicit production value for customer hosting. | Deployment role. Preview stays non-production. | R | Customer rejects demo mode and scripted AI. | Production requires HTTPS and a ready customer-only database. |
| `SERVE_COMPILED_CLIENT` | Serve the built public site and workspaces from Express. Default false; production forces true. | True for both hosted processes; false for local Vite. | R | Open public/private routes and a built asset; unknown assets remain 404. | Build the release first. Non-loopback hosted previews require HTTPS and secure cookies. |
| `APP_URL` | Required canonical application origin and exact-origin protection. No path, credentials, query or fragment. | Local retained origin, confirmed customer HTTPS origin, or approved preview origin. | R | Core; form origin matches the browser. | DNS, Apache and TLS must actually route that hostname. Keep customer/preview origins separate. |
| `PREVIEW_APP_URL` | Optional separate preview origin used by customer `/try`. Blank returns a useful unavailable page. | Approved preview HTTPS hostname; leave blank until known. | R | `/try` selects the fixed preview login; request-supplied destinations are rejected. | Provision the separate preview process/database/DNS/TLS; Pair must pass. |
| `PORT` | API listen port, 1-65535; default 3100. | Operator-selected free loopback port per process. | R | Core through the intended Apache upstream. | Customer and preview need distinct ports. Do not expose PostgreSQL to fix routing. |
| `OOTLA_BIND_HOST` | Listen address; default 127.0.0.1. IPv6 loopback is also supported. | Local networking plan. | R | Listener binds the intended loopback address; Pair. | Apache forwards to this address. Broader bindings require deliberate network configuration. |
| `COOKIE_SECURE` | HTTPS-only session cookies; default false locally, forced true in production. | True for hosted customer and preview services. | R | Sign-in cookies have Secure, HttpOnly and SameSite=Lax. | Requires actual HTTPS; does not create a certificate. |
| `TRUST_PROXY_LOOPBACK` | Trust same-host reverse-proxy forwarding; default false. | True only for the documented local Apache proxy. | R | HTTPS requests produce correct secure-session behavior; Pair. | Keep direct API access private and the proxy loopback-only. No wildcard CORS/origin key exists. |
| `DATABASE_URL` | Persistent PostgreSQL connection. Required for compiled/private workflows. | DBA-provisioned role/password/database, with URL-encoded password. | R | Core and actual database identity; Pair. | Separate customer/preview databases and roles; verify ACLs. Apply additive migrations deliberately. Do not include TLS override query parameters. |
| `DATABASE_TLS_MODE` | disable or verify-full. Default disable for local connections; remote production requires verify-full. | Database hosting requirements. | R | A verified TLS connection succeeds; remote production with disable is rejected. | Configure database TLS and hostname/certificate trust. URL ssl options cannot override this setting. |
| `DATABASE_TLS_CA_FILE` | Optional custom PEM trust bundle for verify-full. Blank uses the Node trust defaults. | DBA/provider certificate chain at an absolute readable path. | R | Missing/non-PEM files fail; establish the intended database connection. | Use only with verify-full. A valid file alone does not prove the server's certificate/hostname. |
| `SESSION_SECRET` | Required server-only session/invitation signing secret, at least 32 characters. | Cryptographically random secret, independent per runtime. | R | Normal sessions work; Pair rejects shared secrets. | Preserve it securely for retained sessions. Change only with a planned sign-out/invitation transition. Never copy customer secrets to preview. |
| `SESSION_COOKIE_PREFIX` | Namespaces staff/applicant/resident cookies. Default ootla preserves legacy names. | Existing preview prefix; distinct customer/preview prefixes for hosting. | R | All three sign-ins/logout and password-change sign-out; Pair. | Hosted templates use distinct __Host- prefixes, which require secure cookies. Cookies are host-only; separate hostnames are also required. |
| `CONNECTOR_CREDENTIAL_KEY` | Optional server-only key for encrypted connector credentials. Blank disables that credential storage. | Independently generated random 32-byte key, encoded as canonical base64. | R | Owner connector validation/storage behavior; no value is returned to staff. | Preserve for decryption; rotate only with re-encryption/recovery planning. This does not activate a Yardi transport. |

## AI

All AI credentials stay on the server. OpenAI's official guidance requires protecting API keys from browser code; Ootla's actual variable is `AI_API_KEY`, rather than the SDK example variable. [Official OpenAI authentication guidance](https://developers.openai.com/api/reference/overview).

| Setting | Purpose and requirement | Value source | Apply | Verify | Additional setup |
| --- | --- | --- | --- | --- | --- |
| `AI_PROVIDER` | disabled, simulated or openai. Customer template uses disabled; production rejects simulated. | Operator-approved feature choice. | R | Disabled provides staff/native next steps; preview stays isolated; live errors do not become scripted success. | Live inference requires the complete model/key/budget group and organization policy. |
| `AI_MODEL` | Model identifier for OpenAI; required for live inference. | A model available to the authorized OpenAI project and compatible with this transport. | R | Controlled AI verification after authorization. | Confirm model access and supported structured Responses output; no model is chosen by this guide. |
| `AI_API_KEY` | Secret OpenAI project credential; required for live inference. | OpenAI project operator. | R | Controlled AI verification; missing/failed credentials do not complete actions. | Project access/billing/limits are separate setup. Never put the key in a public build or chat. |
| `AI_MAX_REQUESTS_PER_MINUTE` | Organization request ceiling; 1-1000, default 20. | Approved usage policy. | R | Requests beyond the policy are refused without executing actions. | Organization policy can reduce the ceiling. |
| `AI_MAX_TOKENS_PER_REQUEST` | Request token ceiling; 256-100000, default 16000. | Model context limits and approved budget. | R | Bounded requests/refusals in controlled AI checks. | Must fit the selected model; it does not grant model access. |
| `AI_DAILY_TOKEN_BUDGET` | Daily organization token allowance; default 200000. | Approved usage policy. | R | Reservation/usage checks stop excess inference. | Organization policy may further restrict use. |
| `AI_DAILY_COST_BUDGET_MICROS` | Daily cost allowance in millionths of USD; default 1000000. Live use requires positive values. | Operator-approved spending ceiling. | R | Budget refusal preserves records and produces no successful action. | Local estimates are not the provider's invoice or account spending controls. |
| `AI_INPUT_COST_MICROS_PER_MILLION` | Estimated input-token rate: micro-USD per million tokens. Zero is a placeholder. | Operator-verified price for the selected model. | R | Positive price and budget checks before live inference. | Recheck when model/pricing changes; no current price is invented here. |
| `AI_OUTPUT_COST_MICROS_PER_MILLION` | Estimated output-token rate: micro-USD per million tokens. Zero is a placeholder. | Operator-verified price for the selected model. | R | Positive price and budget checks before live inference. | Input/output prices may differ; maintain both deliberately. |
| `AI_TIMEOUT_MS` | Maximum request duration, 100-30000 ms; default 8000. | Approved response-time policy. | R | Controlled timeout returns a truthful failure/handoff. | Does not retry paid requests indefinitely or authorize a proposed task. |

The implemented endpoint is fixed to the official Responses HTTPS endpoint. There is no configurable arbitrary AI URL, embedding endpoint, vector-store setting or automatic OCR/document parser. Approved property text is managed through the protected knowledge workflow. Staff must explicitly confirm permitted changes; AI cannot approve applicants or authorize payments. No live provider request was made merely to write or validate this guide.

## Google Calendar

The local Ootla Calendar works independently. Setting credentials does not create a user grant or select calendars. Google authorization requires its OAuth consent flow and registered redirect URI. [Google's web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

| Setting | Purpose and requirement | Value source | Apply | Verify | Additional setup |
| --- | --- | --- | --- | --- | --- |
| `GOOGLE_CALENDAR_ENABLED` | Optional live Calendar opt-in; default false, forbidden in preview. | Operator after approved setup. | R | Calendar shows actual connection/sync status; native bookings remain usable on failure. | Enable Calendar API, configure consent/client, authorize a staff account, select calendars. |
| `GOOGLE_CALENDAR_CLIENT_ID` | OAuth web-client identifier; required when enabled. | Authorized Google Cloud project. | R | Calendar authorization uses the intended client. | Configure the OAuth application and required scopes/testing or verification. |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Server-only OAuth client secret; required when enabled. | Same authorized Google Cloud web client. | R | Calendar code exchange succeeds without exposing tokens. | A client secret does not grant access to a user's calendars. |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Required exact APP_URL plus /api/google-calendar/oauth/callback when enabled. | Derive from this runtime's approved APP_URL. | R | Callback returns to Ootla; altered origins/paths fail validation. | Register the identical URI in Google Cloud; HTTPS except supported loopback development. |
| `GOOGLE_CALENDAR_TOKEN_KEY` | Server-only authenticated-encryption key for saved tokens; required when enabled. | Separate random 32-byte canonical-base64 key. | R | Encrypted grant refresh/disconnect and owner diagnostics. | Preserve for decryption; do not share with Analytics or preview. Reauthorization may be needed after a deliberate rotation. |

In the native Calendar page, complete the normal grant and choose accessible calendars plus the calendar used for Ootla viewings. The server updates only events it owns; local booking and Google synchronization are separate results. Attendee invitations are not enabled by adding these settings. Actual external event/refresh/revocation behavior still needs authorized live acceptance. Details: [Calendar setup](ootla-google-calendar.md).

## Google Analytics

Ootla uses read-only website reporting, separate from CRM outcomes. Enable the relevant APIs and authorize an account that can access the chosen GA4 property. Google's setup and property-access requirements are separate from filling Ootla's file. [Official Analytics quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart).

| Setting | Purpose and requirement | Value source | Apply | Verify | Additional setup |
| --- | --- | --- | --- | --- | --- |
| `GOOGLE_ANALYTICS_ENABLED` | Optional live reports; default false, forbidden in preview. | Operator after approved setup. | R | Analytics source/freshness reflect the selected authorized website. | Enable Data and Admin APIs; complete OAuth and select the GA4 property in Ootla. |
| `GOOGLE_ANALYTICS_CLIENT_ID` | OAuth web-client identifier; required when enabled. | Authorized Google Cloud project. | R | Analytics authorization uses the intended client. | Configure consent and read-only Analytics scope. |
| `GOOGLE_ANALYTICS_CLIENT_SECRET` | Server-only OAuth secret; required when enabled. | Same authorized Google Cloud web client. | R | Grant exchange succeeds with tokens remaining private. | The signing-in account still needs Analytics property permission. |
| `GOOGLE_ANALYTICS_REDIRECT_URI` | Required exact APP_URL plus /api/google-analytics/oauth/callback when enabled. | Derive from the approved runtime origin. | R | Callback returns to the native Analytics page; invalid URI fails validation. | Register the same URI in Google Cloud; HTTPS except supported loopback development. |
| `GOOGLE_ANALYTICS_TOKEN_KEY` | Server-only authenticated-encryption key for saved Analytics tokens; required when enabled. | Independent random 32-byte canonical-base64 key. | R | Owner grant/disconnect and controlled report retrieval. | Preserve for decryption; do not reuse the Calendar or preview key. |

Choose the GA4 property through the owner controls on `/admin/analytics`; an optional CRM-property mapping sets who can read its report. The property ID, selected calendars and OAuth grants are database records, not extra environment variables. This reporting page installs no website measurement script. Public SEO settings do not grant Google access or create Analytics events. Details: [Analytics setup](ootla-google-analytics.md).

## Preview and existing safety modes

| Setting | Purpose and requirement | Value source | Apply | Verify | Additional setup |
| --- | --- | --- | --- | --- | --- |
| `DEMO_MODE` | Allows only the isolated interactive preview; production forbids true. | True only for the separate preview runtime; false for customers. | R | Startup checks actual database identity and organization/user markers before workers. | Dedicated preview database/role/hostname. Never flip a customer database into preview mode. |
| `DEMO_ADMIN_EMAIL` | Existing preview credential-fill identity; ignored for customer account creation. | Retained preview configuration. | R | Preview fill populates fields; normal Sign in authenticates to its existing organization. | Changing it does not create, rename or authorize an account. Preserve retained identities. |
| `DEMO_ADMIN_PASSWORD` | Existing preview fill/verification password, not a production administrator password. | Retained preview value; do not rotate during configuration. | R | Normal preview login verifies its existing password hash. | No automatic password update or seeding occurs. Other portal identities stay separate. |
| `INTEGRATIONS_MODE` | Existing connector safety setting; only simulation is accepted. | Keep the supplied value. | R | Owner diagnostics and preview-only adapter authorization. | Cannot activate Yardi or change a customer's source ownership. A documented live transport is separate work. |
| `OUTBOUND_MODE` | Existing outbound safety setting; only simulation is accepted. | Keep the supplied value. | R | Native saved work remains distinct from external delivery. | No email/SMS sender, recipient or callback is configured by this value. |

## Public website build settings

These are the only two values explicitly passed into public SEO generation. Vite automatic environment exposure is disabled (`envDir: false`, `envPrefix: []`); server credentials must not be renamed with a browser prefix. The server keeps its own validated runtime configuration.

| Setting | Purpose and requirement | Value source | Apply | Verify | Additional setup |
| --- | --- | --- | --- | --- | --- |
| `PUBLIC_SITE_URL` | Optional canonical public HTTPS origin; required if indexing is enabled. No path/query/credentials. | Confirmed customer origin https://ootla.ai; preview stays non-indexable. | B | SEO metadata and built public-site manifest. | Build for the verified public origin. This does not configure DNS or Apache. |
| `PUBLIC_SITE_INDEXING` | true or false; default false until reviewed public launch. | Operator's release decision. | B | SEO checks; private pages stay noindex. | Runtime additionally requires non-demo production and matching configured/request/build origins. Preview stays noindex even when serving the same build. |

Build configuration can read the selected file or development env-file layers for its allowlisted settings; process variables take precedence. The API server does not load Vite's mode-specific files. Rebuild when changing public metadata; changing only a running service environment does not rewrite generated HTML.

## Configuration stored in Ootla, rather than invented environment keys

| Area | Actual configuration and remaining input |
| --- | --- |
| Email and SMS | The existing channel boundary has no selected live email/SMS transport, sender/domain verification, inbound threading endpoint or delivery callback secret setting. No SMTP/SMS keys are added. A selected provider, documented interface, verified sender, callback verification and controlled-recipient policy are still required before implementation/activation. Native notes/tasks and truthful waiting/failure states remain available. |
| Yardi | Organization-scoped connector records hold capabilities, mappings, field ownership and permitted configuration. The owner page `/admin/integrations?view=yardi` validates that setup. Client-licensed interfaces, endpoints, authentication, property scope and vendor permissions remain required; the credential-encryption key alone cannot make the adapter live. Accounting authority remains in Yardi. |
| Screening | Application consent and staff review are native records. A selected approved screening provider and its documented authorization/callback contract are required for live screening. No generic key enables it; AI does not decide approval. |
| Signing | Lease evidence/manual attestation and related tasks are native. Live signature verification needs an approved documented signing provider. A demonstration milestone is not a live signature. |
| Payments | Existing approved HTTPS payment destinations are organization database records. Browser navigation is only a handoff; it cannot mark payment complete. Live payment-status verification needs the documented provider contract. Ootla has no payment authorization/capture/refund setting. The resident preview cannot open an external payment provider. |
| Telephony and speech | Owner voice settings, consent and transcript retention are database policies. Current conversation practice is isolated and text-only. Telephone/speech providers, numbers, audio consent and live transport are not activated by an environment flag. Recording remains disabled. |
| Documents and OCR | Applicant, resident, screening, lead and property attachments are private PostgreSQL bytea with authorized downloads. There is no public upload directory or object-store variable. Property-document knowledge requires reviewed text and explicit approval; automatic scanning/OCR/indexing has no implemented configuration key. |
| Retention and notifications | Organization quiet hours, routing, notification policy, AI policy and supported retention categories are database settings under protected owner administration. No jurisdictional retention period is invented. Unsupported core/audit deletion is not enabled by a file setting. |
| Workers, logs and backups | Seven bounded workers run inside the same API process: task reminders, imports, connectors, Google Calendar, automations, voice retention and operational retention. There is no second-worker flag. Logs go to the process/service logger; no external error-reporting key is implemented. Backups include PostgreSQL private bytes plus separately secured environment/encryption material; the scheduler/storage/rotation policy belongs to the operator's deployment configuration. |

## Apply configuration without replacing retained data

1. Keep the existing local `.env` for the retained preview. Fill only the new feature settings you intend to configure; leave unused providers disabled/blank.
2. Prepare separate private customer/preview files from the safe templates. Use distinct PostgreSQL roles, database names, session secrets, encryption keys, cookie prefixes, hostnames and API ports. Confirm the preview role cannot connect to the customer database.
3. Use the Pair command above. It performs validation, not provisioning. A missing preview hostname is a real blocker for an online preview link; do not invent one.
4. Apply the repository's additive migrations to the intended database explicitly, then restart that runtime. Ordinary startup never migrates, seeds or resets records. Do not run demo seed/reset commands on customer data.
5. Verify Core, all three identity types where configured, normal logout/expiry, and the intended `/try` destination. Then complete each separately authorized external grant/selection/provider test. Configuration checks alone do not establish live behavior.
6. Back up the database and retain the matching private keys before a release or key change. Use the established [Apache and recovery guide](ootla-apache-demo.md) for service, reverse-proxy, HTTPS, backup and rollback procedures.

The current local preview remains [http://127.0.0.1:7673/](http://127.0.0.1:7673/) with normal staff sign-in at [/admin/login](http://127.0.0.1:7673/admin/login). The customer domain is confirmed; deployment access, preview hostname, production database/role provisioning, TLS certificates and external credentials/grants are not established by this guide.

Implementation references: [typed server configuration](../server/config/env.ts), [environment bootstrap](../server/config/environment.js), [database connection](../server/db/pool.ts), [runtime pair](../server/config/runtime-pair.ts), [Vite build boundary](../vite.config.ts), and [progress and verification evidence](ootla-progress.md).
