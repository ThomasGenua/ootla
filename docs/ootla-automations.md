# Follow-ups and automation — Stage 21

Open http://127.0.0.1:7673/admin/automations with the existing staff demo account. The shared header remains compact; the separate rules workspace contains the detailed tools.

## What is implemented

Rules are explicit database records. AI does not decide eligibility or timing. Start with new inquiries awaiting a reply, native viewing invitations/scheduled tours, recorded no-shows, missing required applicant documents, saved next-action dates and overdue native tasks. Maintenance becomes available when Stage 24 installs its actual request records.

Organization administrators configure rules and the organization-wide pause. Authorized staff can preview assigned-property candidates, review activity and approve pending actions. Current staff membership, property access, every lead property interest and approved knowledge versions are checked again at execution. Organization administrators have no cross-organization authority.

Each rule stores its property/organization scope, delay, owner/routing, channel, approved template, optional approved knowledge, retry ceiling, timezone/quiet hours and approval requirement. New rules default disabled and require deliberate template approval. Fixed placeholders are {property}, {portal}, {next_step}. Customer-facing text must remain generic; private application records are available through the authenticated portal.

Native staff reminders create normal Tasks records or link the original overdue task. Use /admin/tasks for completion, permitted snooze and reassignment, and Ask Ootla for saved trigger reasons and record links. Follow-up messages use the same conversation outbox as Stage 20. A queued or attempted message is not delivery.

The five-second bounded worker uses durable fingerprints, stable task/outbox receipts, per-organization serialization, capped retries/backoff and rate controls. Discovery advances through server-side pages rather than downloading the portfolio. Pending work is rechecked on both the automation worker and ordinary conversation delivery path. A customer reply, required upload, workflow advance, consent withdrawal, staff takeover, completion, source withdrawal or pause cancels obsolete actions. Untouched generated reminders can be cancelled; later staff edits are preserved.

## Deliberate demo walkthrough

1. Open /admin/conversations and create a simulated inquiry for Harbor View — conversation demo. Opt in to follow-up where a website message is intended.
2. In Automations, create a disabled rule, choose the property and New inquiry awaiting response (or another actual source condition), set the delay, review the generic template and explicitly approve it. For an immediate local exercise choose quiet start/end both 0; otherwise the configured quiet hours apply.
3. Save enabled, open Preview and inspect the record, eligibility time and reason. Preview writes no jobs/tasks.
4. Choose Evaluate, inspect Awaiting approval, approve/edit deliberately, then Process. In-app work appears as a native task; website work enters a local outbox and only reports delivery after the simulator accepts it. The worker also advances eligible work.
5. For cancellation: queue a website action, then take over its conversation before delivery. Open Activity to confirm Cancelled, and verify no later assistant send occurs.
6. Try Missing application document against the separate application demo organization, and Overdue staff task against a saved overdue open task. Complete/upload the source and confirm pending work cancels.
7. Toggle Pause organization automation and verify queued work stops. Re-enabling a rule does not replay a completed fingerprint.

## Commands and boundaries

```powershell
npm.cmd run db:migrate
npm.cmd run dev
npm.cmd run automations:process
npm.cmd run check:automations
npm.cmd run check:automations-browser
```

Migration 019 is additive. There is no startup reset or automatic rule seed. No new package or secret is required. Website delivery is local simulation in an isolated demo. Email/SMS remain Not configured: no provider API, outbound message, invitation or paid inference has been activated. Existing Google Calendar booking remains separate from automation delivery.
