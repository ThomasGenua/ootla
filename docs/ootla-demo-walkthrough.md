# OotlaAI demo walkthrough

Current preloaded review setup: see the [prepared demo guide](ootla-demo-showcase.md) for main-workspace applications, the additional showcase applicant/resident identities, reconciled imports and enabled local practice. The examples below also retain the original separate applicant/resident workflows.

Use the existing local application at **http://127.0.0.1:7673**. All examples are isolated synthetic records. AI inference, website delivery, screening/signing/payment demonstrations and voice are labelled simulations; they do not contact customers or move money.

Start the project-owned cluster from `C:/Users/user/Documents/software/Ootla` with `npm.cmd run db:local`, then run `npm.cmd run dev` in the demo checkout `C:/Users/user/Documents/software/ootlademo`. The retained demo is already prepared; do not reset or reseed to start. For a new isolated demo, use the explicit preparation commands in the guide above. See the [handover](ootla-final-handover.md) and [Apache guide](ootla-apache-demo.md) for installation/compiled hosting.

## Sign in to the correct organization

| Staff identity | Organization | Use it for |
| --- | --- | --- |
| admin@demo.ootla.test | Ootla Demo | Original overview, daily work and prepared property conversation |
| applications@demo.ootla.test | Ootla Applicant Demo | Lead/viewing/application, applicant documents, screening, payment simulator and lease |
| residentstaff@demo.ootla.test | Ootla Resident Demo | Maintenance assignment, resident updates and approved guidance |
| standalone@demo.ootla.test | Ootla Standalone Demo | CSV onboarding and native CRM without Yardi |

Staff sign in at [/admin/login](http://127.0.0.1:7673/admin/login). **Fill demo credentials** fills the original administrator; **Fill standalone demo credentials** fills the separately prepared standalone account. Both leave submission to the normal Sign in button. For the prepared application/resident staff accounts, fill the original demo fields, replace only the email with the chosen staff email above, then use normal Sign in; the six retained-login check verified these staff identities with the same configured demo staff password. If an administrator later changes one, use that current credential instead. This document contains no passwords/tokens; changing a password is preserved and a seed does not reset it.

Use separate browser profiles/private windows for different staff accounts. The original administrator must not see the application/resident organization's records.

The separate identities are:

- applicant@demo.ootla.test at [/applicant/login](http://127.0.0.1:7673/applicant/login): **Fill demo applicant credentials**, then **Sign in**. Only that applicant's authorized applications appear.
- resident@demo.ootla.test at [/resident/login](http://127.0.0.1:7673/resident/login): **Fill demo resident credentials**, then **Sign in**. Only explicitly granted lease information and that resident's requests/files appear.

Helpers are server-gated to the prepared isolated demo. Their absence in another deployment is expected. Applicant/resident cookies are separate from staff; tabs can coexist without staff impersonating a portal identity.

## Start with the public site

Open [/](http://127.0.0.1:7673/). The hero shows a full-size dashboard extending beyond the right edge, not a screenshot shrunk into the viewport. Explore Platform, AI workflows, Leasing, Resident support and Integrations. Workflow previews/photos are examples. **Explore demo** and **Sign in** reach the real staff login.

At mobile width, check readable copy, no page-level horizontal overflow and usable navigation. Reduced-motion preference stops decorative movement. The approved dark dashboard header, four compact metrics, sidebar below the header and three spacious follow-up cards are retained.

## Staff scenario 1: daily priorities and one follow-up

Account: original staff administrator.

1. Open [/admin](http://127.0.0.1:7673/admin). The three cards come from actual actionable tasks; longer queues belong in [/admin/tasks](http://127.0.0.1:7673/admin/tasks).
2. Open **Ask Ootla** in the header. Ask for today's priorities. The panel identifies current page/property/record context; source links open permitted native records. Demo inference is scripted; priority answers use authorized saved records.
3. Open a lead from a card, reopen Ask and request a follow-up task for that lead. Inspect the proposed title, due date and priority.
4. Choose **Confirm task creation** deliberately. **Open saved task** appears only after persistence succeeds. Refresh the task/lead; verify the saved record and history. Reading a question or preview does not create work.
5. Complete the task or snooze its reminder within the displayed policy. Completing/no-longer-relevant work cancels pending reminders; dashboard refresh does not create more tasks.

The dedicated [/admin/ai](http://127.0.0.1:7673/admin/ai) remains available. Supplying follow-up task details requires its explicit confirmation checkbox. Asking AI to approve an applicant or authorize/refund a payment must be refused.

## Staff scenario 2: lead, viewing and application assistance

Account: **application-workflow staff**, with the applicant in a separate portal session.

1. Open [/admin/leads](http://127.0.0.1:7673/admin/leads), create/select an authorized lead and assign an eligible owner. Set property interests, stated preferences and next action; refresh.
2. Use its **Schedule viewing** action. The native Calendar must have property timezone, duration/buffers, location and eligible staff availability. Select an offered future slot. A requested time is not a booking until the native save succeeds.
3. Open [/admin/calendar](http://127.0.0.1:7673/admin/calendar), inspect day/week/agenda and the saved viewing. Reschedule/cancel through the native controls. A conflicting request must be refused. Google synchronization is a separate status; an unconfigured Google account does not undo local success.
4. Open [/admin/applications](http://127.0.0.1:7673/admin/applications), select/create the linked application, configure its actual checklist and issue a deliberate invitation. Copy its private invitation URL only to your separate test session; no email is sent.
5. Redeem the invitation, set the portal credential and save personal details. Upload a small permitted synthetic file, record required consent, refresh/resume, then submit. The invitation is expiring/single-use and the file downloads require current authorization.
6. In staff Applications, inspect portal progress and the lead timeline. Read-only staff preview must not submit or act as the applicant. Ask Ootla may identify missing checklist/consent items, not reveal document bytes.
7. With appropriate consent, request the **demo** screening and process its local simulator controls. Repeat/retry should not create a second screening request. Authorized staff reviews results and records a decision; AI never supplies the decision.
8. In the applicant payment panel, open the **simulated** provider handoff. Create the synthetic provider confirmation, then return and **Verify provider status**. Only the separate permitted-source read updates Ootla's observation. Browser query parameters cannot mark it paid; no funds move.
9. Review lease policy/evidence in staff Applications. Prepare and advance only allowed milestones using an explicitly labelled demo event or authorized manual attestation. A file upload is not a verified electronic signature.
10. Verify Leased occurs only at the configured valid milestone. Contact/application/lease/resident identity stays connected and move-in tasks remain actionable after conversion.

Use an unused synthetic unit/time for a repeat demonstration; do not reset an established application or bypass valid conflicts. The [portal](ootla-applicant-portal.md), [payment](ootla-payment-handoff.md) and [lease guides](ootla-lease-move-in.md) provide detail.

## Staff scenario 3: maintenance coordination and reminders

Account: **resident-workflow staff**. Have the resident submit the fan request below first.

1. Open [/admin/maintenance](http://127.0.0.1:7673/admin/maintenance). Search/open the saved request, inspect its actual status, canonical resident/property and requested access.
2. Assign an eligible staff member and staff follow-up due date. If no eligible owner exists, leave it visibly unassigned.
3. Add a resident-visible update. Add a separate internal staff note and confirm the resident never receives it.
4. Record an appointment only when staff actually has confirmation, including the displayed timezone and confirmation reference. Requested access alone must still show **No confirmed appointment**. Reassignment invalidates the earlier confirmed appointment.
5. Ask Ootla about the current request or approved renewal guidance. Preview and explicitly confirm a native follow-up task; open the saved task.
6. Open [/admin/automations](http://127.0.0.1:7673/admin/automations) to inspect eligible maintenance reminders, preview reasons and deliberate demo processing. Organization/rule pauses, quiet hours and current permissions apply. Assignment/resolution cancels obsolete generated work on its scheduled recheck; staff-edited work is retained.

This is coordination and in-app work, not a confirmed technician dispatch or external SMS.

## Resident scenario 1: bathroom fan repair and tracking

1. Sign in as the resident, open the granted home, then **Report an issue**.
2. Use the guided helper with **My bathroom fan has stopped working.** Supply room/location, description, requested access and preferred contact details.
3. Review the collected details, then deliberately submit. The created request must have a saved identity and **Awaiting assignment** until staff assigns it.
4. Refresh/reopen **My maintenance requests**. Confirm persistence, actual staff updates and the distinction between requested access and a confirmed appointment.
5. Upload a small permitted synthetic image/file and reopen it through its authorized download. Another resident/organization cannot download it. Send a follow-up message; internal staff notes must remain absent.

## Resident scenario 2: existing payment guidance

Open the home's **Existing payment provider** panel.

In this isolated demo it says **Payment portal not configured** and does not open a real portal; the direct handoff API deliberately returns unavailable/409. Do not treat this setup state as a broken demo or change query parameters to manufacture payment success.

The applicant payment simulator in staff scenario 2 separately demonstrates a permitted-source status update. Outside demo, an approved configured external destination can be opened; this alone does not implement live payment verification. Payments remain with the existing provider/Yardi process. Ootla never authorizes, captures, charges or refunds.

## Resident scenario 3: lease, renewal guidance and staff handoff

Open **My home** and **Renewal information**. Check the actual lease dates/source and any current staff-approved guidance. The seeded guidance asks the resident to contact the team; it does not offer a new rent, concession or agreement.

If no approved terms exist, the honest result is that no terms are available. Ask the property team through the authorized request/message workflow. Staff can inspect the same canonical record and record approved guidance; AI does not negotiate or sign a renewal, approve an applicant or invent eligibility.

## Standalone, conversations and administration

- **Standalone import:** sign in to Ootla Standalone Demo and open [/admin/imports](http://127.0.0.1:7673/admin/imports). Inspect the four prepared ootla-showcase-v1 batches and the deliberate invalid contact at source row 4. For another test, import Properties, then Units, Contacts and Leads using one stable source name/IDs. Complete **Upload -> Map fields -> Validate -> Review duplicates -> Confirm import -> Reconcile results**. Review invalid rows/exported errors, choose identities explicitly and open saved CRM records. Matching names never silently merge. A saved-batch retry must not duplicate records. No Yardi connection is needed.
- **Website conversation:** original staff opens [/admin/conversations](http://127.0.0.1:7673/admin/conversations). Use the explicitly published demo property and approved public knowledge. In a visitor session, open the homepage chat, ask about that property, state preferences and request a viewing. The confirmed message follows a successful native booking. Staff takeover pauses automated replies and queued follow-ups; staff notes remain private.
- **Organization controls:** [/admin/organization](http://127.0.0.1:7673/admin/organization) separates organizational policy/access from personal [/admin/settings](http://127.0.0.1:7673/admin/settings). Private property sources require explicit reviewed-text approval; PDF/OCR parsing is not automatic. Retention is opt-in, previewed and explicitly confirmed, never an automatic demo reset.
- **Health/audit:** [/admin/integration-health](http://127.0.0.1:7673/admin/integration-health) distinguishes simulation/configuration/live evidence; [/admin/audit](http://127.0.0.1:7673/admin/audit) is protected/read-only.
- **Reports/Analytics:** [/admin/reports](http://127.0.0.1:7673/admin/reports) uses real CRM records. [/admin/analytics](http://127.0.0.1:7673/admin/analytics) has a prepared illustrative selection in the main demo; other organizations require a deliberate selection. Synthetic website counts never become leases/applications.
- **Voice:** [/admin/voice](http://127.0.0.1:7673/admin/voice) has local transcript playback enabled in the prepared main demo. Other organizations retain their existing settings; an authorized admin may deliberately enable local practice. Simulate failure/unavailable slots; no call/audio/recording occurs. Private applicant guidance needs the actual organization-matched applicant cookie, not a caller name or staff checkbox.

Stages 26-28 local preparation is complete: the final 17-group consolidated acceptance, four actual compiled-serving/authentication groups, six retained normal demo identities, compiled restart and three disposable native recovery groups pass. No actual VPS deployment, live provider or production-concurrency verification is implied. The final consolidated acceptance uses disposable records and does not populate/reset the retained demo. Your new deliberate manual actions will persist. See [verification and limitations](ootla-final-handover.md) before interpreting any simulated outcome as live.
