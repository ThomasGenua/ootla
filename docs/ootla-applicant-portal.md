# Stage 15: applicant portal

Implemented 2026-10-23 in the existing Ootla Vite/vanilla TypeScript, Express and PostgreSQL application. This is Stage15 only. Public-site restructuring, OotlaAI marketing copy and photographs remain pending.

## Open the isolated demo

Applicant login: http://127.0.0.1:7673/applicant/login

- Email: applicant@demo.ootla.test
- Password: OotlaApplicant!2026
- Click **Fill demo applicant credentials**, then **Sign in**. Autofill never submits or bypasses authentication.

Staff review: http://127.0.0.1:7673/admin/login

- Email: applications@demo.ootla.test
- Password: OotlaDemo!2026 (the preserved local DEMO_ADMIN_PASSWORD).
- Enter these manually; the existing original-demo autofill still selects the original organization.
- Open http://127.0.0.1:7673/admin/applications after normal staff sign-in.

Both accounts belong only to the new **Ootla Applicant Demo** organization. The applicant has account_kind=applicant and no staff membership. The staff account is an organization administrator only within that organization. Original admin@demo.ootla.test and standalone@demo.ootla.test accounts and their records remain unchanged.

The seeded application starts as Draft at the illustrative Willow Court property, separate unit1A and connected canonical lead/contact. No documents or consent are pre-completed. All records are synthetic; use invented text/PDF/image files.

## Applicant walkthrough

1. Sign in and open the saved application.
2. Fill **Full name**, **Phone number**, **Current address** and **Preferred move-in date**. Choose **Save details**. Refresh or sign out/in to verify resuming.
3. Upload an invented file for every required checklist item. Accepted formats are PDF, PNG, JPEG and UTF-8 plain text, up to2MiB each. Download your own file to verify it.
4. Read and explicitly accept the versioned application-information consent. It does not authorize screening, payment or automated decisions.
5. Mark your own section ready. If co-applicants are configured, each accepts their own invitation, completes their own private section and marks it ready.
6. The primary applicant can submit after all configured participants are ready and required details/documents/consent are complete.
7. After submission, the application is read-only. Visible next steps explain staff review; submission is not approval, screening or a lease.

Saving/replacing a document or changing checklist/participant requirements invalidates applicable readiness. Stale saves return a conflict rather than overwrite another edit. Repeating/concurrent submission creates one submitted milestone and one portal event.

Personal details remain a saved application contribution alongside the canonical contact; the portal does not silently overwrite staff/source-owned contact records. Application/contact/lead/unit identities remain linked for later workflows. Existing sales/terminal/staff lead stages are not forcibly changed; the lead's authoritative application summary and timeline synchronize.

## Staff and invitation walkthrough

1. In the staff Applications page, open the seeded application. Review saved personal details, per-participant checklist/documents, consent and progress.
2. **Read-only staff preview** displays the applicant view through current staff authorization. It creates no applicant session and has no applicant mutation controls.
3. To start another application, choose **Create from lead**, search/select an existing leasing lead with an email, and create the linked application. An existing suitable application is reused instead of duplicated.
4. Configure required checklist items and whether co-applicants are allowed. Co-applicants are explicit existing contacts associated with that property; a matching name never merges identities.
5. Select the intended participant and expiry, then choose **Create private invitation**. Deliberately copy/share the private URL yourself. Ootla sends no email/SMS.
6. Open that complete invitation in a separate browser context. The secret is in the URL fragment, removed immediately and sent only in protected POST bodies.
7. A new applicant chooses a password of at least12characters. An existing applicant must verify the existing password; accepting an invitation never resets it.
8. Expired, revoked or previously accepted links cannot be reused. Staff can revoke invitations or a co-applicant grant. Reopening the complete still-valid link is required if the invitation page is refreshed after its fragment has been removed.

Basic staff progress is available within property-read permissions. Private details, documents, configuration, invitations and preview require fresh leasing.manage plus the application property and every linked lead interest. Organization admins have no cross-organization/platform access.

## Actual implementation boundaries

- Canonical applications remain authoritative: draft, submitted, staff_review. New participant/checklist/invitation/document/consent/session/event tables extend them.
- Staff auth remains unchanged. Applicant passwords use the existing Argon2id helper; separate opaque HttpOnly, SameSite cookies reference persistent HMAC-digested sessions lasting at most8hours. Production cookies require HTTPS. All mutations retain configured-origin protection.
- Grants explicitly bind organization/application/contact/property. Every request rechecks active user/grant/application configuration; changing the underlying property invalidates the old grant. Staff and applicant cookies cannot grant each other's access.
- Co-applicants can see shared names/readiness, but only their own personal fields, consent and documents. Staff-private notes/documents never enter the applicant response.
- Documents are PostgreSQL bytea, not files under public/ or a public static URL. Authorized download endpoints send attachment, no-store, nosniff, sandbox and no-referrer headers. Filename, type, byte size and content structure are validated using the established validator. There is no malware-scanning service or screening provider claim.
- Invitations are random, hashed server-side, single use, revocable and valid for1–168hours. Diagnostics/events never store the raw token. Copying a link is the only delivery behavior.
- Provider-owned applications are read-only to the portal. No Yardi/accounting/screening/payment action or AI approval is introduced.
- The demo account/autofill/seed require DEMO_MODE and verified isolated nonproduction database conditions. Disabled/mixed/customer/production contexts reject demo access.

## Commands

From C:/Users/user/Documents/software/Ootla:

    npm.cmd run db:local
    npm.cmd run db:migrate
    npm.cmd run demo:applicant
    npm.cmd run dev

Migration013_applicant_portal.sql is additive and already applied to the retained local demo. The explicit seed is repeatable and preserves passwords, saved work, submitted status, edited checklists and disabled grants. It never runs at startup. Running it again is not a reset.

Focused checks:

    npm.cmd run check:applicant-portal
    npm.cmd run check:applicant-browser
    npm.cmd run build

The backend/browser checks use verified, uniquely owned scratch databases and delete those databases afterward. They refuse retained browser-write operation. No new dependency, environment variable or production deployment is required.

## Routes and API boundaries

Public authentication UI: /applicant/login and /applicant/invite#token=...
Protected applicant UI: /applicant?application=<UUID>
Staff workspace: /admin/applications, ?view=new&lead=<UUID>, ?application=<UUID>, and ?application=<UUID>&preview=1

Applicant APIs live under /api/applicant: gated config, separate auth, invitation inspect/accept, own applications, personal saving, consents/readiness/submission and private uploads/downloads. Staff APIs live under /api/applications and use existing staff sessions/current grants.

Final verified groups, build and preservation results are recorded in docs/ootla-progress.md. Stop after reporting Stage15; do not resume pending marketing or advance automatically.
