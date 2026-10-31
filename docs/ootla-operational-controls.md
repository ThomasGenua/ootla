# Organization and operational administration — Stage26

Open http://127.0.0.1:7673/admin/organization after normal staff login. Current organization-admin membership is required; no platform superadmin or impersonation is introduced. Personal /admin/profile and /admin/settings remain separate. The original administrator, application-demo staff and resident-demo staff manage only their own organizations.

## Working controls

Organization tabs use ?tab=profile, members, groups, routing, notifications, ai, knowledge, documents, retention or demo. Existing role/property APIs are reused with last-active-admin and exact-session checks. New staff provisioning accepts a masked initial password for a new identity only; Argon2 hashing is server-side. Existing global/applicant/resident identities are refused instead of silently linked. No email is sent.

Lead assignment is opt-in per property/team, choosing eligible staff with the fewest open leads; an explicit owner takes priority and no eligible agent leaves work unassigned. It applies to new native leads, not a retroactive portfolio rewrite. Task assignment uses existing native routing. Imported batches retain their explicit review/ownership behavior.

Organization quiet hours add a delivery constraint without replacing property timezones or channel/rule quiet policies. Disabling in-app delivery defers future notifications/eligible automation work without consuming retries; saved tasks and prior notification history remain. Default organization quiet enforcement is off and existing demos remain usable. External email/SMS settings stay disabled.

AI controls restrict existing tools, intents, operating rules and usage budgets; limits cannot exceed server ceilings. Mutation confirmation is always required. Current permissions/policy/source approval are rechecked during actions, after inference and before queued delivery. Retired, changed, unauthorized or expired sources cannot be released from an in-flight result. Simulation/live setup status is explicit and secrets stay server-side.

## Property documents and knowledge

Knowledge supports organization/property scope and draft/approved/retired states. Public assistance requires separate explicit public-text approval. Property files are private PostgreSQL bytes, validated as PDF/PNG/JPEG/plain text up to2MiB. Staff must enter and explicitly approve reviewed source text. Only that text becomes knowledge; there is no claimed OCR, automatic PDF parsing, binary indexing or configured external malware scanner. The original file never becomes public. Retiring the document atomically retires its linked source. Metadata lists are paginated and do not download every binary. Purged sources require a new deliberate upload/source; retries do not recreate old content.

## Health and audit

/admin/integration-health shows nine service rows from current organization evidence. Not configured, Demo/simulated, Configured but unverified, Live verified, Degraded and Disconnected remain distinct. Missing operation timestamps remain unrecorded; a configuration edit is not a provider operation. Native control links lead to each service's scoped retry/disconnect/conflict review. No generic button replays completed messages, screenings or external writes.

/admin/audit is a read-only paginated history, with UTC date/action filters and actor/record/source/outcome. New and preserved legacy audit endpoints redact metadata through a strict allowlist; secrets, raw provider payloads, private document contents and arbitrary text are excluded. Sensitive private-file/report access is audited after authorization. Ordinary users have no audit-edit endpoint.

## Explicit content retention

No jurisdictional period is supplied. Blank means unconfigured. Saving a deliberate policy enables bounded cleanup; use Preview eligible cleanup first. Manual execution requires the exact PURGE EXPIRED CONTENT confirmation and a stable request UUID. Normal startup never resets or seeds; its bounded retention worker acts only on explicitly configured policies.

- Conversation content: old messages from expired sessions and linked AI response/trace copies. Canonical CRM notes/contacts/leads remain under their own unconfigured policy.
- Assistant history: inactive old message/source/action-preview content and linked AI copies. Expired threads/results cannot rerun actions or restore text after an in-flight response. Native created tasks remain.
- Retired knowledge: retired text sources and retired property-source bytes/reviewed text, including linked copies. Approved/draft sources remain.
- Operational traces: old terminal AI results/traces. Usage, outcome and receipt identities remain.
- Closed-record files: old files on Lost/Closed leads, declined/withdrawn applications without active leases, or closed maintenance requests. Active files are preserved; authorized downloads enforce expiry before the worker runs.

Cleanup retains canonical record IDs, hashes, versions, receipt identities, decisions and audit metadata. It is selective content retention, not deletion of a whole person or all linked CRM history. Core CRM/audit archival/deletion remains explicitly unconfigured pending approved client requirements. Exports are generated on demand and not stored server-side; downloaded copies and backups need separate approved handling. Voice keeps its own explicit0–30-day policy and no recording.

## Demo and verification

Demo helpers use normal hashed-password authentication only in a verified isolated environment. There is no browser reset endpoint. The existing CLI reset requires exact database confirmation and manifest scope, must not run at startup, and was not executed in this batch.

Additive024_organization_administration.sql,025_operational_controls.sql and026_property_documents.sql preserve001–023. Run npm run db:migrate on an existing configured checkout; no reseed or actual.env edit is required. Focused commands: npm run check:organization-administration, npm run check:organization-administration-browser and npm run check:operational-controls. They own disposable databases and block external requests. Exact final counts/status are in ootla-progress.md; manual controls are illustrated in stage-26-ui-walkthrough.md.

## User removal of Ask Ootla history - 2026-10-30

Staff may remove their own authorized Ask conversations through the compact History view. Removal sets a server-side tombstone and writes one metadata-only audit event; it is not permanent content erasure. Removed threads are excluded from history and reject further reads/messages/actions/replays, including delayed in-flight results. Existing configured assistant-content/operational retention continues to govern retained content. Tasks and other business records created through a chat remain intact. No new retention period, whole-person erasure or backup deletion is introduced. See [History behavior and local review](ootla-ask-history.md).
