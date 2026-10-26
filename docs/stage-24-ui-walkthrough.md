# Stage 24: resident and maintenance review

Use the existing isolated development application at http://127.0.0.1:7673. This page describes the implemented UI; the progress log records the actual verification gate and seed/migration commands.

## Resident walkthrough

1. Open http://127.0.0.1:7673/resident/login.
2. When the isolated resident demo is seeded, select **Fill demo resident credentials**, then **Sign in**. Filling the fields does not authenticate. The demo account is `resident@demo.ootla.test` / `OotlaResident!2026`; its password field remains masked.
3. **My home** shows only explicit lease grants. Choose **Open my home** to read actual lease dates, source-approved renewal information and any configured existing-provider payment handoff.
4. Choose **Report an issue**, or **New request**. The OotlaAI request guide is labelled **Scripted intake**. It is not a verified live AI conversation.
5. Choose your authorized home. Enter the issue category, room, description and urgency, or use **Fill bathroom fan example** to fill the electrical/Bathroom/broken-fan example without saving.
6. Select **Continue to contact & access**. Provide contact preferences and requested access times, read configured property emergency guidance, and acknowledge the distinction between preferred access and an appointment.
7. Select **Review request**. The preview has not saved a request or dispatched anyone. Select **Submit request** deliberately.
8. The saved request page displays the server's current status, source state and history. **Your request was saved** appears only after a successful backend response. Save failures remain on the form and can be retried.
9. Upload a supporting private PDF, PNG, JPEG or text file of up to 2 MB. Downloads use authorized API routes. Save messages to the property team in the portal.
10. Use **Refresh saved status** after staff updates. Requested access remains a preference. A confirmed appointment requires a separately recorded instant and supporting confirmation.

Resident access uses its own normal server session. It does not grant applicant or staff access, and sharing a lease or address does not grant access to another person's requests or files.

## Staff walkthrough

1. Sign in through http://127.0.0.1:7673/admin/login using staff credentials authorized for the resident demo organization. Its separate demo staff identity is `residentstaff@demo.ootla.test` / `OotlaDemo!2026` after deliberate seeding.
2. Open http://127.0.0.1:7673/admin/maintenance. Search or filter by property, status or assignment. The queue and filter options are server-paginated.
3. Open a request. Review its description, contact/access preferences, source state, private files and history.
4. Select eligible **Assigned staff**, optionally set **Staff follow-up due (your local time)**, then **Save assignment**. The browser and property timezones are identified. Saved appointment and follow-up times are displayed with the explicit property timezone; staff datetime inputs use the labeled browser timezone. Nonexistent local times during daylight-saving changes are rejected. The follow-up deadline is not an appointment.
5. To record an appointment, select **Appointment scheduled**, provide **Supporting confirmation**, enter **Confirmed appointment (your local time)** and check that supporting confirmation exists. Select **Save status update**. The backend rechecks transitions and permissions.
6. **Message visibility** separates an update visible to the resident from an **Internal staff note**. Use **Save update or note**. The resident portal filters internal notes defensively and the backend enforces the private audience.
7. **Resident access & approved renewals** provides deliberate private invitations for existing relationships and staff-approved terms. No email or SMS is sent. Invitation links use `/resident/invite#token=...`; the token is removed from the address bar before requests and is never stored in localStorage.
8. Organization administrators can configure property emergency instructions, eligible escalation staff, follow-up deadlines and intake enablement. No emergency number or response promise is invented.
9. Native staff Tasks and Ask Ootla retain request context. Maintenance-specific prompts cover unresolved work, the selected request and approved renewal information.

The staff header remains four compact metrics, the profile stays last at the right, and the approved Overview remains unchanged.

## Boundaries

- Portal messages and scripted intake are local Ootla workflows. They do not establish live phone/SMS/email delivery.
- Provider source state is displayed from the backend. An unsupported Yardi write is not presented as synchronized.
- Payment handoffs require an approved existing destination; Ootla does not authorize, capture, charge or refund.
- Renewal wording comes from saved approved terms. OotlaAI does not negotiate concessions or sign.
- Staff notes and resident files remain private and permission checked.
- Screenshots and mocked visual tests are UI checks; they do not prove a live provider connection.
