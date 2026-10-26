# Ask Ootla and conversations — Stage 20

Open /admin/conversations after normal staff sign-in. Ask Ootla is a restrained header action across authorized staff pages; profile remains last on the right. The main Overview remains uncluttered.

## Staff assistant

The responsive native side panel shows its current property/lead/application context, private saved threads, source links and freshness. Property, lead, application, selected Calendar/Task and conversation pages derive context from loaded authorized records, not an untrusted URL alone. Changing context starts a separate thread. Every history read rechecks the current session, organization and complete property grants; another user's thread is unavailable.

Native priorities use actual actionable tasks, with an explicit property-local day (Africa/Lagos fallback) for today and overdue work. Lead summaries, missing application checklist, current viewing options and approved FAQs use existing domain services/Stage19 orchestration. Replies remain unsent drafts. A follow-up first becomes a preview; explicit confirmation rechecks the organization's task policy, current scope and bounded due date, then uses the normal task service. Saved tasks are verified before success. Lost responses/repeated clicks are duplicate-safe. Domain failures roll back attempted task changes and persist Failed; explicit Retry task creation can recover without automatic execution on refresh.

Organization assistant policy is GET/PUT /api/ask/policy (only an organization admin may change it). Mutations always require confirmation. Missing facts and unavailable models remain honest. The server-owned capability registry allows later automation/report/resident tools to use this same assistant; HTTP callers cannot supply code, SQL or tool implementations.

## Customer chat and staff handling

Only deliberately published property channels appear in the lazy website Chat with Ootla dialog. A new inquiry creates its own canonical contact/lead, rather than silently merging an existing person on email/name. A digest-only, expiring opaque capability resumes that particular public conversation. The browser stores only that capability/expiry, never a staff user object or credentials.

Public answers use separately approved public knowledge. Existing Stage19 knowledge defaults private; an organization admin must select Approved for public property chat and approve the content. Staff history, private notes, identity documents and screening reports are excluded. A name/email does not verify identity; private application/lease/payment questions direct the visitor to the authenticated portal.

Visitors can state preferences and request available viewing slots. The existing signed native booking service validates a slot and concurrent constraints. A booking is confirmed only after its actual viewing record succeeds; the lead timeline and configured Google Calendar pathway are reused. Requested times are not bookings.

Staff can select AI active, Staff requested or Staff handling. Takeover cancels queued automated work and prevents an in-flight AI result from being queued afterward. Internal notes/drafts never appear in public chat. Staff can edit/approve a draft, deliberately process the local outbox and explicitly return handling to AI. Customer replies/consent withdrawal cancel pending automation; duplicate inbound events run once.

## Channels and status truthfulness

All current channel delivery is explicitly local simulation. Email and SMS are Not configured; their adapters reject delivery without invented provider APIs. No real message, call, calendar invitation or paid inference is activated by the isolated demo.

Queued, Sent, Delivered, Failed and Cancelled are separate persisted local statuses. Sent describes local acceptance, not email/SMS delivery. The simulator can deliver, stop at Sent or simulate temporary failure with bounded backoff/three attempts. Follow-ups require consent and respect configured quiet hours/timezone. A directly requested website answer may be shown immediately without authorizing unsolicited follow-ups. Staff takeover and opt-out are rechecked immediately before delivery.

Live email/SMS requires the client's documented provider/authentication, verified inbound threading and callback rules, explicit test-recipient allowlist/consent/quiet-hour policy and a separately authorized non-demo configuration. There is no permissive public provider webhook in this foundation.

## Deliberate isolated demo setup and walkthrough

From the Ootla root, after migrations:

```
npm run demo:conversations
```

This repeatable helper adds a separate Harbor View conversation-demo property, unit, public FAQs, channel and native schedule under the existing demo organization. It preserves existing records, edits and passwords; it never runs at startup.

1. Sign in as admin@demo.ootla.test / OotlaDemo!2026 at http://127.0.0.1:7673/admin/login.
2. Open Ask Ootla, ask for today's priorities, inspect links and create/confirm a follow-up in a property/record context. Open its saved task.
3. Open http://127.0.0.1:7673/ in a separate private window, select Chat with Ootla and Harbor View demo team. Ask a property question, state preferences and deliberately book an offered viewing.
4. Open http://127.0.0.1:7673/admin/conversations. Open the visitor's linked lead/timeline. Add an internal note and verify it stays absent from the public chat.
5. Use the staff simulator to create another inquiry. Its reply is Queued. Take over before processing the outbox; the automatic reply becomes Cancelled and cannot be delivered.
6. Save/edit/approve a staff draft and process the local outbox. Refresh demonstrates persistence; no external provider is contacted.

Migration018_ask_conversations.sql adds actor-bound threads/actions, published channels, customer conversations/messages/events, durable outbox/receipts, explicit public knowledge approval and organization assistant policy. Focused commands: npm run check:conversations and npm run check:conversations-browser. Verification details are recorded in ootla-progress.md.
