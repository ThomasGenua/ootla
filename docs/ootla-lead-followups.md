# Lead follow-ups

The isolated ootlademo instance now has three additional leasing agents: Amara Okafor, Lucas Bennett and Elena Rivera. They are real organization memberships with property access and viewing availability. They have no organization-admin or platform-admin privileges. Existing assignments are unchanged.

Open http://127.0.0.1:7673/admin/leads?lead=38d0fff4-a4db-421b-8920-e5945099de28&leadTab=tasks and choose Open task. Maya's task proposes an email about the saved budget, bedrooms and move-in preferences, and a Calendar viewing. Other tasks use their own descriptions, lead stage, timeline, document metadata and related work; they do not all show the same actions.

Review the editable email before choosing Save draft or Send. This isolated instance processes email through the existing preview transport/outbox; it sends no external email. Actual email transport remains pending (P05). Current drafts are prepared from saved records; live model inference is not configured. The existing configured OpenAI integration can prepare drafts in an appropriately authorized environment. No Anthropic integration is required.

Calendar booking uses the native availability, conflict and receipt path. Successful task-originated booking links the viewing and records the lead's agreed next step. The task remains open until staff explicitly complete it. Comments remain private staff history. Completion requires confirmation. Request retries are duplicate safe, including a lost send acknowledgement.

Maya's four existing timeline entries now read as a coherent viewing enquiry and follow-up. Their IDs, timestamps, event meaning and original provenance are unchanged. New actual work may legitimately add further events.

## Deliberate preparation and checks

- npm run demo:followup-agents adds only missing isolated demo agents/grants/availability. Repeating it creates no duplicates and does not reset staff work. It is not a startup hook.
- npm run db:migrate applies additive migration033 to another corresponding demo installation before running the new code. The current local demo already has it.
- npm run check:lead-followups runs five focused service groups in a disposable database.
- npm run check:lead-followups-browser runs four browser groups in an isolated fixture, including failure/retry, comments, completion, Calendar handoff and mobile layout.
- npm run build passed both TypeScript targets, Vite and the server build. Only the existing client chunk-size advisory remains.

No installation, reset or restart is needed for the current running local demo. This feature was not copied to live, committed, pushed or deployed. The Oodler email hold remains in force.

## Refinements verified on 2026-10-30

Opening an email now restores the current staff member's last unsent saved draft. It does not create another event or lose reviewed edits. Existing processed messages stay in history. Review restored drafts against current lead information before sending.

Document tasks offer actual saved Documents/application controls; drafts can name outstanding customer-visible checklist items. Private file contents are not automatically parsed or copied into a customer message. Existing booked viewings are opened and described accurately instead of requesting another viewing. Closed leads do not get new prospect-outreach suggestions.

Book a viewing opens the real Calendar grid directly for the task's lead/property. Select a date, viewing agent and available time; enter Agreed next step and choose Yes/No for notification. A successful booking saves the next step to both task history and the lead. It does not automatically complete the task. Exact retries and native slot conflicts remain protected.

Eight focused service groups and four desktop/mobile browser groups passed. These include saved-draft reopening, actual native booking/custom next action, checklist/document context, failure/retry, comments/completion and access checks. A reproduced modal click race was fixed by registering action handlers before rendering controls and retaining dialog identity on close. No new migration/dependency or external provider activation is included.
