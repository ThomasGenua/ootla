# Stage 26 native administration walkthrough

These routes use the existing staff session and shared admin shell. Organization administration, integration health and audit access require a current organization administrator. An organization administrator has no platform superadmin authority. The backend rechecks the organization and current role/property grants.

## Open and test

Start with `http://127.0.0.1:7673/admin/login`, sign in normally, then open `http://127.0.0.1:7673/admin/organization`.

1. **Profile:** edit Organization name or contact fields, choose **Save organization profile**, refresh, and verify persistence. Personal profile/settings remain at `/admin/profile` and `/admin/settings`.
2. **Staff & access:** search memberships, choose **View access**, save a role/active change, grant or revoke a property, and refresh. The last active organization administrator is protected server-side. Revocation changes subsequent authorized requests; it does not reset another identity. **Create a new staff account** accepts a masked initial password for a new identity only; existing/global/applicant/resident addresses are refused rather than silently linked. This form sends no email. Use an approved staff credential-sharing process.
3. **Property groups:** create/rename a group, select a property, verify its current group loads, then save a deliberate change. Provider-owned fields remain subject to backend ownership checks.
4. **Assignment rules:** select a property and choose **Load lead assignment rule**. Configure manual/unassigned or eligible staff with fewest open leads, an optional team and explicit enablement. Only a new lead without an explicit owner uses the opt-in rule. No eligible owner leaves the lead unassigned. Task teams/routing stay on the native Tasks page.
5. **Notifications:** configure organization timezone, optional quiet hours and in-app enablement, then save and refresh. Email/SMS remain unconfigured; this page does not send external messages.
6. **AI policy:** configure enabled capabilities, approved operating rules, permitted tools/intents and bounded limits. Mutating AI actions always require confirmation. Server ceilings and record authorization remain authoritative. On the existing property AI page, supplying follow-up task details also requires the explicit **Confirm creation of the follow-up task using these details** checkbox. Ask Ootla keeps its separate preview/confirmation action.
7. **Knowledge:** create organization/property-scoped text knowledge, approve or retire it and verify the saved state. Draft/retired text is excluded from approved retrieval. Public property assistance is a separate explicit opt-in.
8. **Property documents:** choose a property and **Load property documents**. Upload a PDF/PNG/JPEG/plain-text file up to 2 MiB with **Upload private source**. The source is a private draft. Open **Review property source**, enter **Manually reviewed property source text**, choose Approved, explicitly check **I reviewed this source and the exact text being approved**, then **Save property source review**. Only manually reviewed text becomes approved knowledge. PDF/image parsing and automatic binary indexing are unavailable. The original file remains private even when reviewed text is approved for public assistance. **Download private property source** uses an authorized server download. Retire the source to remove its approved text from retrieval.
9. **Retention:** blank fields mean unconfigured. Save only deliberate content-retention settings. **Preview eligible cleanup** reads current eligibility without deleting records. An actual cleanup additionally requires typing **PURGE EXPIRED CONTENT** and choosing **Run confirmed cleanup**. The server rechecks policy and eligibility. Core CRM and audit history do not have automatic deletion here. Voice transcript retention stays on its own native page. Do not test cleanup against customer data.
10. **Demo:** inspect the server-verified isolation status and normal sign-in/simulator links. No browser reset exists; startup does not reset data.

## Health and accountability

- `http://127.0.0.1:7673/admin/integration-health`: evidence-based Not configured, Demo/simulated, Configured but unverified, Live verified, Degraded and Disconnected states; timestamps, freshness and actual native next-step controls. A configured credential is not a successful live operation.
- `http://127.0.0.1:7673/admin/audit`: read-only, server-paginated event history; filter action/search/UTC dates and inspect redacted details. Secrets, document bodies and raw provider payloads are excluded.

## Frontend validation

Client TypeScript passes. A mock-only Chrome check covers all 12 native tab/page views at 320, 390, 768 and 1586 px; keyboard order, exact existing group/routing values, profile/notification field preservation, masked-password dataset exclusion, explicit retention preview and private-source upload/review/retirement. No retained database mutation occurs in that visual check. Actual isolated API/browser verification is recorded separately by the stage gate.
