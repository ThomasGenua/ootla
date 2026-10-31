# Lead editing and viewing handoff

This refinement is implemented in ootlademo/ootla-v1-demo only.

Open http://127.0.0.1:7673/admin/leads. The server defaults to ten rows; the existing compact Rows per page control remains visible beside pagination and accepts10,25,50or100. Search/filter behavior and permissions are unchanged.

Open a lead and Edit details. Opportunity now includes a compact AI Suggested properties dropdown from the existing server-side matcher. It searches authorized organization inventory using the saved budget, bedrooms and location, and requires current availability verification within seven days. Move-in dates remain subject to staff confirmation; free-text requirements are not eligibility scoring. The current instance uses deterministic record matching, not a live language model. Select property marks an interest; selecting a primary-property match also chooses its unit. Save lead persists changes through the existing version/permission checks. A newly added contact/property relationship still needs the existing explicit association action. Save changed preferences to refresh matches. No match is fabricated when inventory is stale or unavailable.

The editor has no property/unit search form. Edit staff notes is its last details section, followed only by save/error/helper controls. The lower household/preferences/milestones component is disabled through showExtendedLeadEditor=false, so it does not render interactive controls. Its code, records and services are retained.

Schedule viewing from the lead activity tab opens the actual Calendar grid with the lead/property carried in the URL. Select a date to open a booking popup already scoped to that lead; choose an eligible viewing agent and an offered time. No preliminary context/filter form is shown. The existing native availability, buffers, resource locks, stage updates and timeline continue to apply. Conflicting requests return409 and never overwrite the existing booking.

Before booking, choose Yes or No for client email. Yes prepares the notification from the actual linked contact and saved viewing only after native slot reservation succeeds. It reuses the existing viewing notification receipt, shared durable communications outbox and selected implemented transport. Exact booking retries do not repeat notifications. In this isolated demo, .test recipients use local preview processing; no external email is sent. In customer mode or without a supported recipient/transport, the viewing still saves, a notification draft is retained and the UI explicitly reports email unavailable. No live email transport, credentials or sending was activated. P05 remains open. Drafts are not automatically sent later.

## Review and checks

1. Sign in at http://127.0.0.1:7673/admin/login with admin@demo.ootla.test / OotlaDemo!2026.
2. Open All Leads, confirm10rows by default and change Rows per page.
3. Open Maya: http://127.0.0.1:7673/admin/leads?lead=38d0fff4-a4db-421b-8920-e5945099de28 . Edit details; review matches, preferences and staff notes. Close without saving unless you intend a change.
4. Choose Schedule viewing, select a date, agent and offered time, then Yes/No for email. Saving creates a real internal viewing; preview email is not external delivery. Occupied constrained slots cannot be saved.

Four focused service groups and four browser groups passed in owned disposable databases, covering scoped matches/stale inventory, default/explicit pagination, persistent editing, direct Calendar handoff, mobile bounds, explicit notification choice, concurrent booking conflict, exact retry, existing booking preservation, No, unavailable real transport preserving a draft, and cross-organization denial. No external calls or retained test business writes occurred. Required npm run build passed both TypeScript targets, Vite and the server build. Existing approximately954KB bundle advisory remains.

Commands: npm run check:lead-refinement and npm run check:lead-refinement-browser. Migration034 is already applied locally; no current installation/start command is needed. Other corresponding installations require npm run db:migrate then npm run build and their normal process restart. Do not apply demo defaults/data to live.
