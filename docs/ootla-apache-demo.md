# Run and recover the isolated Ootla demo behind Apache

Stage 28, 2026-10-25. Prepared locally for an Ubuntu/Debian VPS with root access. **Nothing has been deployed; no VPS, DNS, certificate or production application was changed.** `demo.example.com` is a placeholder. Use a separately authorized demo hostname/database and synthetic records only. Demo passwords are deliberately public.

Apache terminates HTTPS and proxies the entire application to Express on 127.0.0.1:3100. Express serves the built public site, authenticated application/portals and API. Vite is development-only. PostgreSQL stores private uploaded bytes and durable jobs; there is no public uploads directory or separate worker daemon. Keep the repository, `.env`, PostgreSQL and backups outside all Apache DocumentRoots.

## Existing local development

From `C:/Users/user/Documents/software/Ootla`, with the existing protected `.env`:

```powershell
npm run db:local
npm run db:migrate
npm run dev
```

Open http://127.0.0.1:7673/ and http://127.0.0.1:7673/admin/login. The API is http://127.0.0.1:3100/api/health; PostgreSQL is project-owned loopback 55439. `db:local` starts/preserves only the recognized project cluster. It is not the command for a VPS system PostgreSQL server. Migrations are additive/checksummed and do not seed. Do not run demo resets, recreate the database or rerun initial onboarding to restart the app.

For a new checkout, run `npm ci` and `npm run env:setup` first; setup refuses to overwrite `.env`. Check APP_URL in the generated .env (fresh default http://127.0.0.1:7673), then use the documented deliberate demo seeds below only against a new isolated database. Setup does not print secret values. Existing dependencies and the lockfile are retained. Clean registry installation, native Argon2 verification, startup/configuration checks, compiled serving and ordinary compiled restart all passed locally; the final handover records the evidence and limits.

## 1. VPS prerequisites

```bash
sudo apt update
sudo apt install -y apache2 postgresql postgresql-contrib build-essential python3 curl ca-certificates xz-utils certbot python3-certbot-apache
sudo systemctl enable --now postgresql apache2
```

Use an approved supported Node installation, system-wide and readable by the application user. The repository requires Node >=22.12.0; local tests used 22.22.0. Node 24 is an LTS option according to the current [official release table](https://nodejs.org/en/about/previous-releases). Review the supported version before installation; this batch did not install or test Node on your VPS.

```bash
node --version
npm --version
command -v node
pg_dump --version
pg_restore --version
```

The systemd template uses `/usr/bin/node`; change ExecStart to the verified system-wide path if different. Avoid a root-only shell-manager installation. Use PostgreSQL dump/restore tools compatible with the actual server version; do not copy the Windows data directory.

## 2. Dedicated user, release and configuration

These paths describe a **new** isolated Ootla installation. Inspect any existing `/srv/ootla`, role, database or service before proceeding; do not overwrite an unrelated application. The `app` path below is a symlink so a prepared release can be activated and a compatible release restored deliberately.

```bash
sudo adduser --system --group --home /srv/ootla ootla
sudo install -d -o ootla -g ootla -m 750 /srv/ootla/releases /srv/ootla/shared
sudo install -d -o ootla -g ootla -m 750 /srv/ootla/releases/2026-10-25-stage28
```

Copy the reviewed Ootla source to `/srv/ootla/releases/2026-10-25-stage28`, including `package.json`, unchanged `package-lock.json`, client/server/shared/scripts, **all migrations**, Vite/TypeScript configuration, public assets and deploy files. Exclude `.env`, `.local`, `.git`, node_modules, dist and test artifacts. Do not copy another project's environment file.

Create one configuration file only if it does not exist; if present, edit it deliberately and preserve existing secrets:

```bash
sudo test ! -e /srv/ootla/shared/ootla-demo.env
sudo -u ootla cp /srv/ootla/releases/2026-10-25-stage28/deploy/apache/demo.env.example /srv/ootla/shared/ootla-demo.env
sudo chmod 600 /srv/ootla/shared/ootla-demo.env
sudo nano /srv/ootla/shared/ootla-demo.env
sudo -u ootla ln -s /srv/ootla/shared/ootla-demo.env /srv/ootla/releases/2026-10-25-stage28/.env
```

**Stop if the existence check fails; do not run the copy command.** The symlink must also be new, not a replacement for an existing environment file. Replace placeholders with the exact HTTPS demo origin, encoded database password and a newly generated session secret. A local operator can generate a secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`; put it only in the private server environment, not in chat, source control or build variables.

Keep:

- NODE_ENV=development, SERVE_COMPILED_CLIENT=true: hosted compiled demo while preserving the existing strict production/demo separation.
- DEMO_MODE=true and a dedicated ootla_demo or ootla_demo_* database containing synthetic records only.
- OOTLA_BIND_HOST=127.0.0.1, PORT=3100, exact HTTPS APP_URL, COOKIE_SECURE=true, TRUST_PROXY_LOOPBACK=true.
- AI_PROVIDER=simulated, INTEGRATIONS_MODE=simulation, OUTBOUND_MODE=simulation; Google Calendar/Analytics disabled and their credentials blank.
- PUBLIC_SITE_URL equal to that HTTPS origin, PUBLIC_SITE_INDEXING=false. These public SEO values are used at build time; rebuild after changing them.

No `VITE_*` secret is required or permitted. Private documents are PostgreSQL bytea columns, so no writable public file path or fictional STORAGE_DIR setting is needed. Voice is disabled by its organization setting unless deliberately enabled as a local transcript simulator. Live provider keys are not needed for the demo.

The separate `deploy/apache/production.env.example` is for a non-demo database and reviewed customer onboarding. DEMO_MODE in production is rejected. The currently implemented live Google/AI transports require their own explicit setup; the generic integration/outbound simulation literals do not activate unimplemented Yardi, email/SMS, screening, payment or signing transports. See the [activation register](ootla-live-activation-checklist.md).

## 3. Dedicated empty database

```bash
sudo -u postgres createuser --pwprompt ootla
sudo -u postgres createdb --owner=ootla ootla_demo_vps
```

If either name exists, inspect it and choose a new authorized isolated name; never drop/reset it to make installation succeed. Enter the password interactively and URL-encode it in DATABASE_URL. Keep PostgreSQL bound to loopback with appropriate local authentication; do not publicly expose 5432 or 3100. The application role does not need cluster superuser, create-role or create-database privileges. Migration ownership applies only to its dedicated database.

## 4. Install, migrate, deliberately seed and build

```bash
sudo -u ootla -H sh -c 'cd /srv/ootla/releases/2026-10-25-stage28 && npm ci'
sudo -u ootla -H sh -c 'cd /srv/ootla/releases/2026-10-25-stage28 && npm run db:migrate'
```

For a **new isolated synthetic demo only**, explicitly prepare the chosen examples:

```bash
sudo -u ootla -H sh -c 'cd /srv/ootla/releases/2026-10-25-stage28 && npm run db:seed'
sudo -u ootla -H sh -c 'cd /srv/ootla/releases/2026-10-25-stage28 && npm run demo:standalone'
sudo -u ootla -H sh -c 'cd /srv/ootla/releases/2026-10-25-stage28 && npm run demo:applicant'
sudo -u ootla -H sh -c 'cd /srv/ootla/releases/2026-10-25-stage28 && npm run demo:conversations'
sudo -u ootla -H sh -c 'cd /srv/ootla/releases/2026-10-25-stage28 && npm run demo:resident'
```

These commands are repeatable and preserve existing staff work; they are **not startup commands**. They intentionally create distinct staff/applicant/resident/standalone organizations and identities. Do not reseed ordinary upgrades. Never run demo:reset during this procedure.

```bash
sudo -u ootla -H sh -c 'cd /srv/ootla/releases/2026-10-25-stage28 && RAYON_NUM_THREADS=1 npm run build'
sudo test ! -e /srv/ootla/app
sudo ln -s /srv/ootla/releases/2026-10-25-stage28 /srv/ootla/app
```

**Stop if app already exists.** The manifest/migration files must stay alongside the compiled release. Compiled/production startup checks database configuration and migration history before listening; it neither applies migrations nor seeds data. The one process runs reminders, imports, connector synchronization, Google Calendar jobs, automations, voice transcript retention and configured operational retention. Do not also schedule parallel process scripts unless their behavior has been deliberately reviewed.

## 5. systemd and health

```bash
sudo cp /srv/ootla/app/deploy/apache/ootla-demo.service /etc/systemd/system/ootla-demo.service
sudo systemctl daemon-reload
sudo systemctl enable --now ootla-demo
sudo systemctl status ootla-demo --no-pager
curl --fail http://127.0.0.1:3100/api/health
```

Expected health is status ok/database ready. Read sanitized application messages with `sudo journalctl -u ootla-demo -n 100 --no-pager`. The service uses an unprivileged user, private umask and read-only system/release filesystem; application files/jobs live in PostgreSQL. Linux service hardening must be validated on the actual VPS. No PM2 daemon is needed in addition to systemd.

```bash
sudo systemctl restart ootla-demo
curl --fail http://127.0.0.1:3100/api/health
```

SIGTERM stops accepting requests, drains the seven workers and closes database connections with a bounded shutdown. Durable jobs remain subject to current permissions, pauses and duplicate/retry rules after restart. A local actual-process restart verified session/task persistence and one reminder without startup seeding; this does not verify remote systemd behavior.

## 6. HTTPS and Apache activation by the authorized operator

Obtain an authorized isolated hostname and TLS certificate. No DNS or certificate action was performed in this batch. Do not replace propflows.ca or another production virtual host. If DNS changes are required, obtain that separate authorization first. An operator with an existing authorized HTTP site can use Certbot for that hostname, reviewing shared-server effects before accepting changes.

Edit the supplied Apache template with the authorized hostname and certificate paths. It proxies the entire application and strips untrusted forwarded headers; it assumes Apache and Node run on the same host. A CDN/remote proxy needs separately reviewed trust settings.

```bash
sudo a2enmod proxy proxy_http headers ssl
sudo cp /srv/ootla/app/deploy/apache/ootla-demo.conf /etc/apache2/sites-available/ootla-demo.conf
sudo a2ensite ootla-demo.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

Reload only after Syntax OK; preserve other sites and existing SSH/firewall access. The access-log format uses `%U` without query strings and omits Referer, cookies and Authorization, reducing OAuth-code disclosure. Logs still contain IP addresses/paths and need restricted operator access and an agreed retention period. Review server-wide/error logging too. The proxy and log directives follow [Apache proxy documentation](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html) and [custom log formats](https://httpd.apache.org/docs/2.4/mod/mod_log_config.html). No Apache syntax/certificate test has been executed on your VPS.

## 7. Verify the deployed demo after operator activation

Replace the placeholder with the actual HTTPS origin, then test:

| Route | Expected behavior |
| --- | --- |
| / | Public pages/assets, readable hero, half-cropped desktop dashboard, mobile/reduced-motion behavior. |
| /admin/login | Fill demo credentials only fills fields; normal Sign in authenticates, refresh preserves session. |
| /admin | Protected dashboard; profile is last; four metrics; collapse/expand works. |
| /admin/organization | Current organization settings, scoped members/groups/access/AI/knowledge/retention controls. |
| /admin/integration-health and /admin/audit | Accurate provider states, redacted administrator-only history. |
| /admin/applications | Use applications@demo.ootla.test in Ootla Applicant Demo, not the original admin. |
| /applicant/login | applicant@demo.ootla.test sees only its authorized application and private files. |
| /resident/login | resident@demo.ootla.test sees only its explicit resident/lease relationship. |
| /admin/maintenance | Use residentstaff@demo.ootla.test in Ootla Resident Demo. |
| /admin/imports | Use standalone@demo.ootla.test in Ootla Standalone Demo. |
| /api/health | Database ready. |
| /api/a-route-that-does-not-exist | JSON404. |
| /assets/a-file-that-does-not-exist.js | Real404, not application HTML. |

All demo staff passwords are OotlaDemo!2026. Applicant: OotlaApplicant!2026. Resident: OotlaResident!2026. The [walkthrough](ootla-demo-walkthrough.md) explains identities and scenarios. Use separate browser profiles/contexts for different staff organizations; do not broaden access to make a demonstration work.

Verify Secure/HttpOnly/SameSite=Lax cookies, anonymous private API 401, private-route login redirects, logout, noindex and no real messages/calls/invitations/model inference. Resident payments intentionally show a setup state in the demo; do not describe them as a live payment portal.

## 8. Backup before updates

A complete database dump includes all native records, password hashes, private file bytea, permissions, audit history, consent, job state, retention settings and encrypted provider-token envelopes. It does not include the server `.env`/encryption keys, roles shared by the cluster, public release files or an off-site backup policy. Back these up separately and protect them as sensitive information. No filesystem uploads backup is needed for the current storage model.

Create a dedicated private directory outside every web root. Each run below creates a NEW private snapshot directory, prompts for the database password rather than exposing it in arguments/history, and writes a checksum manifest:

```bash
sudo install -d -o ootla -g ootla -m 700 /srv/ootla/backups
sudo -u ootla -H sh -c '
set -eu
umask 077
OOTLA_SNAPSHOT=$(mktemp -d /srv/ootla/backups/snapshot.XXXXXXXX)
pg_dump --host=127.0.0.1 --port=5432 --username=ootla --password --format=custom --file="$OOTLA_SNAPSHOT/database.dump" ootla_demo_vps
tar --dereference --create --gzip --file="$OOTLA_SNAPSHOT/config.tar.gz" --directory=/srv/ootla/shared ootla-demo.env
cd "$OOTLA_SNAPSHOT"
sha256sum database.dump config.tar.gz > SHA256SUMS
printf "Private snapshot: %s\n" "$OOTLA_SNAPSHOT"
'
```

Record the returned directory and matching release/version/migration manifest. For a maintenance snapshot, stop writes first and capture comparison counts/private-file hashes in the restricted operator record. Preserve SESSION_SECRET and every configured token/credential encryption key under separate access-controlled encrypted custody. Key loss can make provider credentials unusable. Never print their values in logs or handovers. Use an operator-approved encrypted off-site copy, rotation/schedule and restore-test policy; RPO/RTO and backup retention remain client/operator decisions, not a fabricated legal default. Protect the configuration archive as a secret-bearing backup.

`pg_dump` makes a consistent logical database snapshot, but does not include cluster-wide roles; custom archives are restored with pg_restore. See the [official pg_dump documentation](https://www.postgresql.org/docs/current/app-pgdump.html). This demo procedure is not a claim of a full production WAL/PITR backup service.

## 9. Restore into a NEW database first

Never test restoration over the active database. Select a fresh isolated name and stop if it already exists:

```bash
sudo -u postgres createdb --owner=ootla ootla_demo_recovery_review
sudo -u ootla pg_restore --host=127.0.0.1 --port=5432 --username=ootla --password --exit-on-error --no-owner --no-acl --dbname=ootla_demo_recovery_review /srv/ootla/backups/snapshot.REPLACE/database.dump
```

Replace snapshot.REPLACE with the actual private snapshot directory and verify SHA256SUMS there before restoration. Use a separate review checkout/environment and unused loopback port, restore the appropriate private keys from protected custody, and point only that checkout at the new recovery database. Keep all live integrations/outbound disabled and indexing off. BEFORE normal index startup, perform offline SQL/file-hash/migration/count/job-state comparisons: normal startup immediately starts all seven workers and there is no worker-disable environment switch. Then observe and reconcile any expected worker changes while testing authorized logins/downloads. The local verifier deliberately uses the native app without workers for its before/after comparisons. Do not automatically seed/reset a restored database. Normal restored sessions remain dependent on the matching secret; deliberately rotate/revoke after an incident where required. Retention/deletion requests made after the snapshot must be reconciled offline so recovery does not silently re-expose expired/removed data.

Local recovery evidence: PASS, native PostgreSQL18.6 custom dump/restore into a NEW disposable database. All26 migration checksums and144 public-table fingerprints/163 rows matched, including3 private bytea files and property-source provenance. Restored staff/applicant normal login and3 authorized downloads passed;3 anonymous/2 foreign downloads were denied. Archive611,703 bytes, dump1325.74ms and restore4548.15ms on a small local fixture, not a recovery SLA. All owned artifacts/databases were cleaned. Remote/VPS recovery remains unverified.

## 10. Controlled updates and rollback

1. Prepare a new release directory with its own unchanged lockfile, complete migrations and `.env` symlink to the existing private shared configuration. Run npm ci/build there before touching the active process. Do not alter the current release while it is serving requests.
2. Schedule a maintenance window, stop only ootla-demo gracefully, and take a fresh database/configuration snapshot plus matching release/checksums. Stopping writes before the migration gives a clear recovery boundary.
3. Run the reviewed additive migrations from the new release. If migration fails, do not switch/reseed/drop data. Preserve the error context without secrets and repair with a new additive migration or restore the prior full snapshot into a new database after assessing subsequent work.
4. Verify `/srv/ootla/app` is the expected Ootla symlink, create an unused `/srv/ootla/app.next` symlink to the approved new release, then atomically replace that symlink with `sudo mv -Tf /srv/ootla/app.next /srv/ootla/app`. Do not use this command on an unverified directory or another application. Start only ootla-demo and repeat internal/HTTPS health and login/file/worker smoke checks.
5. Keep the prior release and snapshot for an agreed period. An application-only rollback is safe only when the prior release is explicitly compatible with the current schema/migration manifest and data. Startup rejects unknown/missing/checksum-mismatched migration history. Do not edit old migrations or assume an old binary can consume purged nullable file content. If compatibility is not established, recover a matching release+database into a separate environment and reconcile writes before a separately authorized cutover.

There are no automatic down-migrations. Retention purges are deliberate content removal; reversing a schema migration cannot reconstruct deleted bytes. Production recovery/cutover and any accepted data-loss window require the client's/operator's decision.

## Troubleshooting and verification limits

- **502**: check systemd status/journal, actual Node path, compiled files and loopback port.
- Startup failure/503: check configured database availability, all migration files/checksums and dedicated role permissions; run db:migrate deliberately. Do not disable readiness or reset the database.
- Origin error: APP_URL must exactly match the browser HTTPS origin; check ProxyPreserveHost, forwarded protocol and same-host trust. Do not disable same-origin/session checks.
- Cookies absent: confirm HTTPS, secure-cookie setting and correct hostname; never put session credentials in localStorage.
- Unknown assets returning HTML/private pages exposed: proxy the entire app to Express; do not add an Apache SPA fallback or serve the source tree.
- Worker failure: inspect the native page's saved state/current permissions/pause/retry limit. Use its scoped retry; do not replay already delivered messages or verified provider writes.

Local source restart, real browser journey/security checks, synthetic scale observations and the final compiled-serving/configuration checks are recorded in the final handover. Apache/systemd/TLS/firewall/host-resource behavior has not been verified on an unavailable VPS. These instructions prepare deployment; they do not assert deployment or live vendor activation.